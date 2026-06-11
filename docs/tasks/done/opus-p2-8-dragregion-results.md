# [Fable5/Opus] P2-8 調査結果: カスタムタイトルバーのドラッグ挙動

実施日: 2026-06-10 / 環境: Windows 11 実機, tauri 2.11.2 (Cargo.lock), WebView2, `vite + cargo run` で起動し computer-use により操作検証。

## 1. メカニズムの解明（静的解析）

tauri 2.11.2 が注入する `drag.js`（`tauri-2.11.2/src/window/scripts/drag.js`）を確認した。

- 注入スクリプトは `document` の **バブリング段階** で `mousedown` を監視する。React のハンドラは
  root コンテナにデリゲートされるため、**手動 `onMouseDown`（`startDragging()` invoke）が先に発火**し、
  その後ネイティブスクリプトが `start_dragging`（detail===1）または `internal_toggle_maximize`
  （detail===2）を invoke する。`stopImmediatePropagation()` は document レベルの他リスナーにしか
  効かないため、React 側の発火は止まらない。
- つまり現状は **シングルクリックで `start_dragging` が二重 invoke、ダブルクリック時は
  `start_dragging`（React 側）と `internal_toggle_maximize`（ネイティブ側）が競合** する構造。
- 属性値の仕様（2.11.x、タスク文書の想定より新しい）:
  - bare / `"true"` → **直接ヒットした要素のみ**（子要素は対象外）
  - `"deep"` → **サブツリー全体**がドラッグ領域
  - `"false"` → 明示的に無効化
  - BUTTON / A / INPUT 等のクリッカブル要素は属性が無い限り自動でドラッグをブロック

## 2. 実機検証結果

メイン・設定とも `decorations: false`。HMR で各案を切り替えて検証。

| 構成 | ドラッグ（空き領域） | ドラッグ（バッジ span 上） | dblclick 最大化/復元 |
|---|---|---|---|
| 現状（bare 属性 + 手動 onMouseDown） | ✅ | ✅（手動機構による） | ✅ 空き領域 / ❌ **span 上は不発** |
| 案A-1: bare 属性のみ（onMouseDown 削除） | ✅ | ❌ | ✅（空き領域） |
| 案A-2: `data-tauri-drag-region="deep"`（onMouseDown 削除） | ✅ | ✅ | ✅ **span 上でも動作** |
| 案B: 手動 startDragging + 自前 dblclick | 未検証（下記理由で見送り） | — | — |

- タスクの仮説「手動 startDragging のせいで dblclick 最大化が発火しない」は**棄却**。
  現状でも空き領域上の dblclick 最大化・復元は動作した（toggle_maximize 側が勝つ）。
  ただし二重 invoke / 競合の構造自体は実在し、挙動はネイティブ側の処理順に依存する。
- 現状の実害は「**バッジ文字列上だけ dblclick 最大化が効かない**」という領域内の挙動不統一。
- 設定ウィンドウ（SettingsPanel, mode="window"）でも案A-2 で同一の結果を確認
  （バッジ上ドラッグ ✅ / dblclick 最大化→復元 ✅ / 設定ギア・×ボタンはドラッグに食われず ✅）。

## 3. 採用案

**案A-2: `data-tauri-drag-region="deep"` に統一し、手動 `onMouseDown` / `startDragging` を全廃する。**

理由:
- ネイティブ機構のみで「子要素上のドラッグ」「dblclick 最大化/復元」が全て成立（実機確認済み）。
- 二重 invoke・競合が構造ごと消える。
- 案B は dblclick の自前実装（`event.detail===2` 分岐 + toggleMaximize）と mousedown ごとの
  非同期 IPC が必要で、標準機構を再発明するだけ。優位点が無いため実機検証も省略した。

## 4. Codex への修正指示

### `src/components/AppChrome.tsx`
1. brand / drag-spacer の 2 つの div から `onMouseDown={handleDragMouseDown}` を削除し、
   `data-tauri-drag-region` を `data-tauri-drag-region="deep"` に変更する。
   （drag-spacer は子要素を持たないが、統一のため両方 `"deep"` でよい）
2. `handleDragMouseDown` 関数（36-42行目）を削除。
3. props から `onStartDrag` を削除（型定義・分割代入とも）。

### `src/components/SettingsPanel.tsx`
1. `settings-window-title` の div から `onMouseDown={handleDragMouseDown}` を削除し、
   属性を `data-tauri-drag-region="deep"` に変更。
2. `handleDragMouseDown` 関数（65-71行目）を削除。
3. props から `onStartDrag?` を削除（型定義・分割代入とも）。

### `src/hooks/useTauriWindowShell.ts`
1. `startWindowDrag` 関数（97-103行目）と return オブジェクトの `startWindowDrag` を削除。

### 呼び出し側
- `AppChrome` / `SettingsPanel` に `onStartDrag={...}` を渡している箇所（App.tsx 等）を削除。
- `core:window:allow-start-dragging` 権限（capabilities/default.json）は **残す**こと。
  ネイティブの drag.js も `plugin:window|start_dragging` を invoke するため必要。

### MouseEvent import
- 両コンポーネントで `MouseEvent` 型 import が未使用になるので削除。

## 5. 修正後の確認手順（実機）

1. `npm run dev` + `cargo run`（または `npm run tauri:dev`）で起動。
2. メインウィンドウ: 空き領域・「PilotBell」バッジ文字上それぞれからドラッグ移動できること。
3. メインウィンドウ: 空き領域・バッジ上それぞれで dblclick → 最大化、再 dblclick → 復元。
4. 設定ギア / 最小化 / 最大化 / × がワンクリックで反応する（ドラッグに食われない）こと。
5. 設定ウィンドウ（ギアから開く）で 2〜4 を繰り返す。× は hide 動作（仕様どおり）。

## 6. 備考（検証中に観測した別件）

- `npm run tauri:dev` 実行時、`pilotbell.exe` が起動直後に exit code 1 で落ちる事象が 2 回連続で
  再現した（`tauri dev` の watcher 経由のときのみ。`target/debug/pilotbell.exe` 直接実行 +
  vite 単独起動では正常動作）。本タスクとは無関係のため未深追い。要検証。
