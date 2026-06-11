# P2-7 設計: メインウィンドウのリサイズ方針 — 決定事項と実装仕様

作成: 2026-06-10 / 担当: Fable 5（設計） → 実装は Codex に委譲可
対象: `src/hooks/useTauriWindowShell.ts`（Rust 側の変更は不要）

## 0. 前提の確認結果（API 実在チェック）

インストール済み `@tauri-apps/api`（v2系, `node_modules/@tauri-apps/api/window.d.ts`）で以下を確認済み。**すべて実在**:

| API | 戻り値 / 型 | 備考 |
|---|---|---|
| `currentMonitor()` | `Promise<Monitor \| null>` | 現ウィンドウが乗っているモニタ |
| `availableMonitors()` / `primaryMonitor()` / `monitorFromPoint(x, y)` | 同上 | 今回は `currentMonitor()` のみ使用 |
| `Monitor.workArea` | `{ position: PhysicalPosition; size: PhysicalSize }` | **物理座標**。タスクバー等を除いた作業領域 |
| `Monitor.scaleFactor` | `number` | |
| `Window.outerPosition()` | `Promise<PhysicalPosition>` | |
| `Window.innerSize()` / `outerSize()` | `Promise<PhysicalSize>` | decorations:false のため inner ≒ outer |
| `Window.setPosition(LogicalPosition \| PhysicalPosition)` | | |
| `Window.scaleFactor()` / `onResized()` / `onMoved()` | | `onResized` は既存コードで使用中 |

---

## 1. 各論点の決定

### 論点1: chat サイズの復元 → 復元する（サイズのみ、localStorage）

**決定**: ユーザーが chat モードで手動リサイズしたサイズを localStorage に保存し、次回 chat 遷移時に既定値 760x720 の代わりに使う。**位置は保存しない**（論点2で「現位置維持」にするため、位置の保存・復元は不要になる）。

- 保存先の比較:
  - メモリのみ: アプリ再起動で消える。永続化コストはほぼゼロなので劣る。
  - **localStorage（採用）**: フロントだけで完結する。モード（compact/chat）という概念を持つのはフロントだけなので自然。既存の `pilotbell.hideGlobalShortcutNotice` と同じ流儀。
  - tauri-plugin-window-state への統合: プラグインは「ウィンドウごとに最後の1状態」しか持たず、モード別サイズを表現できない。改造は過剰。
- **plugin との整合**: プラグインは hide 時に `save_window_state(StateFlags::all())`、起動時に `restore_state` を実行する（`shell.rs:51` / `lib.rs:174`）。これは**そのまま維持**する。起動直後はフロントのレイアウトエフェクトが必ず compact または chat のサイズを上書きするため、プラグインが保存したサイズは実質「起動直後の初期見た目」にしか効かず、矛盾しない。一方**位置**はプラグインの復元値がそのまま活き、これが論点2の「現位置維持」と噛み合う。`clear_invalid_main_window_state` も現状維持。
- compact のサイズは**復元しない**（常に既定 620x190）。パレットは毎回同じ見た目で出るのがランチャーとしての予測可能性に勝る。

### 論点2: center() 廃止 + 作業領域クランプ → 採用

**決定**: モード切替時の `center()` を廃止し、位置は現状維持。リサイズの結果ウィンドウが作業領域からはみ出す場合のみ、はみ出し分を作業領域内に押し戻す（クランプ）。

- 実装: `currentMonitor()` で `workArea`（物理座標）を取得し、`outerPosition()` + `outerSize()`（共に物理）と**物理座標系で統一して**矩形比較する。論理座標を混ぜると DPI 125%/150% でズレるため、クランプ計算に論理座標は使わない。
- `currentMonitor()` が `null` を返した場合（モニタ特定不能）のみ、フォールバックとして従来どおり `center()` する。
- 主なはみ出しケースは compact→chat の高さ増加で下端がタスクバーに食い込むケース。Windows の `setSize` は top-left アンカーで広がるため、Y のクランプがこれを救う。
- 起動時のセンタリング（`tauri.conf.json` の `center: true` と `lib.rs` の invalid-state 時 center）は維持。「初回だけ中央、以後はユーザーの置いた場所」という一貫した方針になる。

### 論点3: chat 初期高さの動的化 → 採用

**決定**: chat の目標高さを `min(保存値 or 720, workAreaLogicalHeight - MARGIN)`、minHeight も `min(620, workAreaLogicalHeight - MARGIN)` にクランプする。幅も同様に workArea 幅でキャップする。

- `MARGIN = 24`（論理px）。タスクバー直上に貼り付かないための余白。
- 例: 1366x768・100%・タスクバーあり（workArea 高 ≒ 720）→ chat 高 = 696, minHeight = 620 のまま。1280x720・125%（workArea 論理高 ≒ 528）→ chat 高 = 504, minHeight = 504。
- minHeight をクランプしないと `setMinSize > setSize` の矛盾が起き、OS 側で minHeight まで強制的に広げられてはみ出すため、**minHeight のクランプは必須**。
- サイズ決定は「論理座標」で行い（保存値も論理）、クランプ判定だけ物理座標で行う（論点5参照）。

### 論点4: compact への縮小タイミング → 即縮小を維持、ただし center なし

**決定**: `clearSession` 等で `hasExpandedMainSurface` が false になったら従来どおり即 compact サイズへ縮小する。ただし `center()` しないため「クリアしたら画面中央へジャンプ」は消え、その場で高さだけ縮む（top-left アンカー）。

- 代替案「hide 時はそのまま、次回ショートカット表示時に縮小」の却下理由:
  1. クリア直後に大きな空ウィンドウが画面に残り、視覚フィードバックが弱い。
  2. 表示時に縮小処理を挟むと Alt+Space → 即入力の体感レイテンシに `setSize` 分のリスクが乗る（制約違反のおそれ）。現方式なら表示時はサイズ操作ゼロ。
  3. 「非表示中に縮小」はウィンドウ非表示中の resize 挙動がプラットフォームにより不安定（要検証）で、複雑さに見合わない。
- 縮小後の位置はそのまま。縮小ではみ出しは発生しないのでクランプは実質 no-op だが、コードパスは共通でよい。

### 論点5: マルチモニタ / DPI → 「決定は論理、判定は物理」で統一

- `setSize(LogicalSize)` の継続使用は妥当。Tauri がモニタの scaleFactor で物理に変換するため、125%/150% 環境でも「見た目のサイズ」が一定になる。物理 px 指定だと逆に DPI ごとに見た目が変わる。
- 保存する chat サイズも**論理サイズ**（`innerSize() / scaleFactor()` で算出）。モニタ間で DPI が違っても見た目サイズが維持される。
- クランプ計算は**物理座標のみ**（workArea / outerPosition / outerSize すべて物理）。混在させない。
- モニタ判定は適用のたびに `currentMonitor()` を呼ぶため、ユーザーが別モニタへ移動していても常にそのモニタの workArea が基準になる。center() 廃止により「常にプライマリモニタ中央へ戻される」問題も同時に消える。
- モニタ跨ぎで scaleFactor が変わるケースの保存は、その都度 `scaleFactor()` を取得して論理換算するため吸収される。

### 制約への適合

- **即時表示性**: ショートカット表示パス（`show_main_window_impl`）には一切手を入れない。サイズ操作はモード遷移時のみ。
- **maximized**: 既存どおり `setMinSize` のみ適用し `setSize`/位置操作はスキップ。挙動変更なし。

---

## 2. 実装仕様（Codex 向け）

変更ファイルは `src/hooks/useTauriWindowShell.ts` のみ。

### 2.1 import 追加

```ts
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
```

### 2.2 定数・型・ストレージヘルパ

```ts
const CHAT_SIZE_STORAGE_KEY = "pilotbell.mainWindow.chatSize.v1";
const WORK_AREA_MARGIN = 24; // logical px

type StoredChatSize = { width: number; height: number };

function loadStoredChatSize(): StoredChatSize | null {
  // localStorage.getItem → JSON.parse。
  // width/height が有限数かつ妥当な下限（例: MAIN_WINDOW_LAYOUTS.chat.minWidth / 256）以上で
  // なければ null を返す（壊れた値は無視して既定値にフォールバック）。
}

function saveStoredChatSize(size: StoredChatSize): void {
  // JSON.stringify して setItem。例外（quota 等）は握りつぶす。
}
```

### 2.3 レイアウト適用エフェクトの置き換え（現 155-183 行）

`appliedMainWindowLayout` ref と layoutName 比較によるガードは現状維持。
`applyMainWindowLayout` を以下に置き換える:

```ts
const isApplyingLayoutRef = useRef(false);

async function applyMainWindowLayout(layoutName: "compact" | "chat") {
  const layout = MAIN_WINDOW_LAYOUTS[layoutName];
  const win = getCurrentWindow();
  const monitor = await currentMonitor(); // null 許容

  // --- 1. ターゲット論理サイズの決定 ---
  let { width, height, minWidth, minHeight } = layout;
  if (layoutName === "chat") {
    const stored = loadStoredChatSize();
    if (stored) ({ width, height } = stored);
  }
  if (monitor) {
    const scale = monitor.scaleFactor;
    const workAreaLogicalWidth = monitor.workArea.size.width / scale;
    const workAreaLogicalHeight = monitor.workArea.size.height / scale;
    const maxWidth = Math.floor(workAreaLogicalWidth - WORK_AREA_MARGIN);
    const maxHeight = Math.floor(workAreaLogicalHeight - WORK_AREA_MARGIN);
    width = Math.min(width, maxWidth);
    height = Math.min(height, maxHeight);
    minWidth = Math.min(minWidth, maxWidth);   // setMinSize > setSize の矛盾防止
    minHeight = Math.min(minHeight, maxHeight);
  }

  // --- 2. 適用（minSize → maximized チェック → setSize）。順序は現行踏襲 ---
  await win.setMinSize(new LogicalSize(minWidth, minHeight));
  if (await win.isMaximized()) {
    return;
  }

  isApplyingLayoutRef.current = true;
  try {
    await win.setSize(new LogicalSize(width, height));

    // --- 3. center() の代わりに作業領域クランプ（すべて物理座標） ---
    if (monitor) {
      const pos = await win.outerPosition();   // PhysicalPosition
      const size = await win.outerSize();      // PhysicalSize
      const wa = monitor.workArea;
      // サイズは手順1で workArea 以下にキャップ済みなので clamp 範囲は非負
      const clampedX = Math.max(
        wa.position.x,
        Math.min(pos.x, wa.position.x + wa.size.width - size.width),
      );
      const clampedY = Math.max(
        wa.position.y,
        Math.min(pos.y, wa.position.y + wa.size.height - size.height),
      );
      if (clampedX !== pos.x || clampedY !== pos.y) {
        await win.setPosition(new PhysicalPosition(Math.round(clampedX), Math.round(clampedY)));
      }
    } else {
      await win.center(); // モニタ特定不能時のみ従来挙動にフォールバック
    }
  } finally {
    // setSize 起因の onResized が遅延して届くため、少し遅らせて解除
    setTimeout(() => {
      isApplyingLayoutRef.current = false;
    }, 200);
  }
}
```

注意点:
- `center()` の呼び出しは上記フォールバック以外から**完全に削除**する。
- エラーハンドリングは現行どおり呼び出し側の `.catch` + `console.warn` で十分。

### 2.4 chat サイズの永続化（onResized リスナーへの追記）

既存の maximized 同期エフェクト（現 126-153 行）の `onResized` ハンドラに同居させる
（リスナーを増やさない）。擬似コード:

```ts
// onResized ハンドラ内に追記
if (
  !isSettingsWindow &&
  appliedMainWindowLayout.current === "chat" &&
  !isApplyingLayoutRef.current
) {
  clearTimeout(saveChatSizeTimerRef.current);
  saveChatSizeTimerRef.current = setTimeout(async () => {
    if (await win.isMaximized()) {
      return; // maximized サイズは保存しない
    }
    const size = await win.innerSize();      // PhysicalSize
    const scale = await win.scaleFactor();
    saveStoredChatSize({
      width: Math.round(size.width / scale),  // 論理サイズで保存
      height: Math.round(size.height / scale),
    });
  }, 250); // デバウンス。ドラッグリサイズ中の連続書き込みを防ぐ
}
```

- `const saveChatSizeTimerRef = useRef<number | undefined>(undefined)` を追加し、
  エフェクトの cleanup で `clearTimeout(saveChatSizeTimerRef.current)` すること。
- `isApplyingLayoutRef` ガードは「プログラム的 setSize を保存しない」ためのもの。
  万一すり抜けても保存されるのは直前に適用した正しいサイズなので実害はない。

### 2.5 変更しないもの（明示）

- `src-tauri/src/shell.rs` の `save_window_state(StateFlags::all())`（hide 時）と
  `lib.rs` の `restore_state` / `clear_invalid_main_window_state` / 起動時 center。
- `show_main_window_impl`（ショートカット表示パス）— サイズ操作を追加しないこと。
- `tauri.conf.json` のウィンドウ初期定義。
- maximized 時に setSize/位置操作をスキップする分岐。

### 2.6 受け入れ確認（手動テスト手順）

1. compact で起動 → プロンプト送信で chat 化: ウィンドウが**中央へ飛ばず**その場で拡大し、下端がタスクバーに食い込まない。
2. chat でサイズ変更 → クリアで compact → 再度 chat 化: 変更したサイズが復元される。位置は維持。
3. アプリ再起動後の chat 化でもサイズが復元される（localStorage）。
4. ウィンドウを画面下端付近に置いて compact → chat: はみ出す分だけ上に押し戻される。
5. 表示スケール 125% / 150% で 1-4 を再確認（見た目サイズが一定、クランプが正しい）。
6. 最大化中にモード遷移: サイズ・位置が変化しない（従来どおり）。
7. localStorage の保存値を手で壊す（非 JSON 文字列など）→ chat 化で既定 760x720 にフォールバック。

### 2.7 既知の限界（許容するもの）

- ウィンドウが2モニタに跨っている場合、`currentMonitor()` が返す側の workArea でクランプされる（仕様として許容）。
- 非表示中にモニタ構成が変わった場合、次回モード遷移までクランプされない。window-state プラグインの out-of-bounds 復元動作に依存（要検証。実害は次回遷移で自己修復）。
- compact の幅はユーザー調整を保存しない（設計判断、論点1参照）。
