# PilotBell UI/UX 修正プラン (2026-06-10)

対象: `apps/pilotbell`（Tauri 2 + React + 素CSS）
実装は Codex へ委譲する前提。各タスクに「担当モデル」を明記。

## 確認済みの根本原因

### 症状A: 設定画面のカスタムタイトルバーがスクロールで流れる
- `.settings-panel` 自体がスクロールコンテナ（`src/styles/settings.css:27` の `overflow-y: auto`）。
- window モードのタイトルバー `.settings-window-chrome` はその**内側**の通常フロー子要素
  （`src/components/SettingsPanel.tsx:76`）。sticky/fixed ではないため一緒に流れる。
- 同様に `.settings-header`（見出し）と `.settings-tabs` も流れる。overlay モードでも同じ。
- 付随問題: `.settings-window-chrome` は負マージンハック
  （`src/styles/responsive.css:39` の `margin: calc(var(--settings-panel-padding-y) * -1) ...`）
  でパネルの padding を打ち消しており、sticky 化を阻む。

### 症状B: メインウィンドウで履歴が溜まると入力欄が画面外へ流れ、スクロールも不可
- `.shell` / `.window-shell` が `min-height: 100vh`（`src/styles/chrome.css:1-16`）。
  確定高さがないため `flex: 1; min-height: 0` のチェーン（`.workspace` → `.chat-thread`）が効かず、
  コンテンツ分だけシェルが 100vh を超えて成長する。
- `html, body, #root { height: 100%; overflow: hidden }`（`src/styles/base.css:98-104`）が
  はみ出した下端（= コンポーザー）を切り捨てる。overflow している層に scroll がないため復帰不能。
- `src/styles/responsive.css` の 2 箇所（6-9 行目, 88-91 行目）にも同じ `min-height: 100vh` がある。

### 増悪要因
- 全要素でスクロールバー非表示: `* { scrollbar-width: none }` + `::-webkit-scrollbar { width: 0 }`
  （`src/styles/base.css:88-96`）。スクロール可能でも視覚的手がかりがない。
- `pre.detail`（エラー詳細, `src/App.tsx:443-445` / `src/styles/composer.css:565`)に max-height がなく、
  長いエラーでチャット欄を圧迫する。
- コンポーザー (`.composer-dock`) 内の添付チップ列・コンテキストプレビューに高さ上限がなく、
  `overflow: hidden` なので増えると下端（送信ボタン・StatusLine）が切れる。
- 新着メッセージへの自動スクロールがない（`SessionHistory` は古→新の順で描画、スクロール位置は先頭のまま）。

---

## タスク一覧

### P0-1: メインウィンドウのルート高さ確定 【Codex】
変更箇所:
- `src/styles/chrome.css`: `.shell { min-height: 100vh }` → `height: 100dvh`（fallback に `100vh` を先に書く）。
  `.window-shell { min-height: 100vh }` → `height: 100%; min-height: 0`。
- `src/styles/responsive.css`: 6-9 行目と 88-91 行目の `.window-shell { min-height: 100vh }` を削除
  （chrome.css 側に追従させる。border-radius:0 等はそのまま残す）。
受け入れ基準:
- 履歴 30 件以上でもコンポーザーが常に下端に表示される。
- `.chat-thread` がホイール/タッチでスクロールできる。
- 空セッション（コンパクトパレット 620x190）の中央寄せレイアウトが崩れない。
- ウィンドウを minHeight 付近まで縮めても入力欄が消えない。

### P0-2: 設定パネルのヘッダー固定（window / overlay 共通) 【Codex】
方針: sticky ではなく構造分離（負マージンハックを撤去できるため）。
変更箇所:
- `src/components/SettingsPanel.tsx`: パネルを
  「固定部 = `.settings-window-chrome`(window時) + `.settings-header` + `.settings-tabs`」
  「可変部 = 新設 `<div className="settings-content">{children}</div>`」に再構成。
- `src/styles/settings.css`:
  - `.settings-panel`: `overflow-y: auto` を外し `overflow: hidden`、`padding` を 0 にして
    固定部/可変部それぞれに padding を持たせる（`--settings-panel-padding-*` 変数は流用）。
  - 新設 `.settings-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }`
- `src/styles/responsive.css`: `.settings-window-chrome` の負マージン削除。
  519px 以下の padding 上書き（96-100, 125-130 行目）を新構造に合わせて調整。
受け入れ基準:
- 設定ウィンドウ・overlay 双方で、プロバイダ一覧を最下部までスクロールしても
  タイトルバー / 閉じる・最小化・最大化 / タブが固定表示のまま。
- スクロール中もタイトルバーでウィンドウドラッグ可能。
- 420x520（最小サイズ）でもヘッダーと1行以上のコンテンツが見える。

### P1-3: スクロールバーの可視化 【Codex】
- `src/styles/base.css` の全要素スクロールバー消去（88-96, 117-121 行目）を撤去し、
  `.chat-thread` / `.settings-content` / `textarea` / `.context-preview-body` / `pre.detail` に
  細いテーマ対応スクロールバーを定義:
  `scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;`
  WebKit 系: width 8px・thumb は `var(--border-strong)`・hover で濃く。
- ライト/ダーク両テーマで確認。
受け入れ基準: スクロール可能領域にカーソルを置くとバーが見え、ドラッグでスクロールできる。

### P1-4: 新着メッセージへの自動スクロール（stick-to-bottom） 【Sonnet 推奨】
- `SessionHistory` に ref を持たせ、(a) マウント時は最下部へ、(b) entries 追加時は
  「直前にユーザーがほぼ最下部にいた場合のみ」最下部へ scroll。
- ユーザーが上にスクロール中に新着が来たら自動スクロールせず、
  「最新へ移動」フローティングボタンを `.chat-thread` 右下に表示。
- 判定しきい値: bottom から 80px 以内なら追従。
- 注意: `chatEntries` は `App.tsx:225` で reverse 済み（表示は古→新）。並びは変えないこと。
モデル指定理由: スクロール位置保持・追従判定・再レンダー競合などエッジケースの設計判断が必要。
Codex に投げる場合はこの仕様を一字一句そのまま渡すこと。

### P1-5: エラー詳細・通知の高さ上限 【Codex】
- `src/styles/composer.css` の `.detail` に `max-height: 180px; overflow-y: auto;` を追加。
- `.notice` の文言が複数行に伸びた場合の確認のみ（変更不要見込み）。

### P1-6: コンポーザー内部の高さ制御 【Codex】
- `.attachment-strip` に `max-height: 96px; overflow-y: auto;` を追加。
- `.context-preview-panel` 全体に `max-height: min(40vh, 360px); overflow-y: auto;` を追加
  （内側 `.context-preview-body` の `max-height: 220px` は維持）。
- `.composer-dock { overflow: hidden }` は角丸クリップ用なので維持。
受け入れ基準: 添付10件 + コンテキストプレビュー表示時でも送信ボタンと StatusLine が見える。

### P2-7: ウィンドウリサイズ方針の見直し 【設計: Fable5/Opus → 実装: Codex】
現状 (`src/hooks/useTauriWindowShell.ts:46-59, 155-183`):
- compact(620x190) ⇔ chat(760x720) 切替のたびに `setSize` + `center()` で
  ユーザーのサイズ・位置を毎回破棄。chat の高さ 720 は小型ディスプレイの作業領域を超えうる。
設計論点（モデル判断が必要）:
- chat モードのサイズをユーザーが変更したら記憶すべきか（tauri-plugin-window-state との整合）。
- `center()` をやめて現位置維持 + 作業領域クランプにするか。
- 高さは `availHeight` ベースで上限クランプすべきか。
設計が決まれば実装自体は Codex 可。

### P2-8: タイトルバーのドラッグ挙動調査 【Fable5/Opus（要実機検証）】
- `data-tauri-drag-region` と手動 `startDragging()`（mousedown）が併用されている
  （`src/components/AppChrome.tsx:46-58`, `SettingsPanel.tsx:77-81`）。
- 手動 startDragging が dblclick を吸うため「タイトルバーのダブルクリックで最大化」が
  効かない可能性が高い（要検証）。どちらか一方に統一する方針を実機で確認して決める。

### P2-9: キーボード操作・アクセシビリティ 【Codex（仕様確定済みの範囲のみ）】
- `.chat-thread` に `tabIndex={0}` + `role="log"` + `aria-label` を付与し、
  PageUp/PageDown/Home/End でスクロール可能にする。
- フォーカスリングは `:focus-visible` のみに出す。

## 推奨着手順序
P0-1 → P0-2 →（動作確認）→ P1-3 / P1-5 / P1-6（並行可）→ P1-4 → P2 群。
P0-1 と P0-2 は独立しているので並行可。P1-4 は P0-1 完了が前提。

## 回帰確認チェックリスト（全タスク共通）
- [ ] 空セッション: コンパクトパレット(620x190)で入力欄が中央、丸枠が崩れない
- [ ] 履歴あり: 760x720 でスレッドがスクロール、コンポーザー固定
- [ ] 最小サイズ(420x160 / 420x520)で操作可能
- [ ] 設定ウィンドウ / overlay フォールバック両方
- [ ] ライト / ダークテーマ
- [ ] 最大化 ⇔ 復元
