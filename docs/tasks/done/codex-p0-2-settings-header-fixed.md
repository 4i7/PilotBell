# [Codex] P0-2: 設定パネルのタイトルバー・タブ固定（スクロールで流れるバグの修正）

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS のデスクトップアプリ。作業ディレクトリはリポジトリの `apps/pilotbell`。
- 設定UIは `src/components/SettingsPanel.tsx`。2モードある:
  - `mode="window"`: 独立した設定ウィンドウ（decorations: false、カスタムタイトルバー付き）
  - `mode="overlay"`: メインウィンドウ内の右側スライドオーバー
- 検証コマンド: `npm run build`。UI確認は `npm run tauri dev`（設定は歯車アイコンで開く）。

## バグの内容
設定画面をスクロールすると、カスタムタイトルバー（`.settings-window-chrome`）・見出し
（`.settings-header`）・タブ（`.settings-tabs`）が一緒にスクロールして消える。
スクロール中はウィンドウのドラッグも閉じるボタンも届かない。

原因: `.settings-panel` 自体が `overflow-y: auto` のスクロールコンテナで、
タイトルバー等がその内側の通常フロー子要素になっているため。

## 現状の構造

`src/components/SettingsPanel.tsx`（抜粋、73行目〜）:
```tsx
const panel = (
  <div className="settings-panel" ref={panelRef}>
    {mode === "window" ? (
      <header className="settings-window-chrome">…タイトルバー+WindowControls…</header>
    ) : null}
    <div className="settings-header">…見出し+テーマスイッチャー+閉じるボタン…</div>
    <div className="settings-tabs">…3つのタブボタン…</div>
    {children}   {/* ← ここがスクロールすべき可変コンテンツ */}
  </div>
);
// mode === "window" → <main className="settings-window-page">{panel}</main>
// それ以外          → <div className="settings-overlay">{panel}</div>
```

`src/styles/settings.css` 13-29行目:
```css
.settings-panel {
  --settings-panel-padding-x: var(--space-6);
  --settings-panel-padding-y: var(--space-6);
  width: min(560px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--settings-panel-padding-y) var(--settings-panel-padding-x);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-shell);
  background: color-mix(in srgb, var(--bg-shell-strong) 96%, transparent);
  box-shadow: var(--shadow-popover);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

`src/styles/responsive.css` 25-56行目（window モード用）:
```css
.settings-window-page .settings-panel {
  width: 100%;
  min-height: 100vh;
  height: 100vh;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.settings-window-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  margin: calc(var(--settings-panel-padding-y) * -1) calc(var(--settings-panel-padding-x) * -1) 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-soft);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-shell-strong) 90%, transparent) 0%, transparent 100%);
  user-select: none;
}
```
※ `.settings-window-chrome` はパネルのpaddingを負マージンで打ち消すハックを使っている。

`src/styles/responsive.css` 83行目〜の `@media (max-width: 519px)` には
`.settings-panel { --settings-panel-padding-x: 12px; padding-left/right: 12px; padding-top/bottom: 16px; --settings-panel-padding-y: 16px; }`
相当の上書き（96-100行目と125-130行目）がある。

## 変更指示
方針: sticky ではなく構造分離。固定部とスクロール部を分ける。

1. `src/components/SettingsPanel.tsx`:
   - `{children}` を `<div className="settings-content">{children}</div>` で包む。
   - 固定部（settings-window-chrome / settings-header / settings-tabs）はそのままパネル直下に残す。
2. `src/styles/settings.css` の `.settings-panel`:
   - `overflow-y: auto;` `overscroll-behavior: contain;` を削除し `overflow: hidden;` に変更。
   - `padding` を削除（padding変数の定義行は残す）。
   - 代わりに固定部に水平paddingを持たせる:
     - `.settings-header`, `.settings-tabs` に `padding: 0 var(--settings-panel-padding-x);`
     - `.settings-header` の直前にあたるパネル上端の余白として `.settings-panel { padding-top: var(--settings-panel-padding-y); }` …ただし window モードでは chrome が最上部に来るため、
       `.settings-window-chrome` が存在する場合に二重余白にならないよう
       `.settings-window-chrome { margin: 0; }`（負マージン削除）+
       `.settings-window-chrome + .settings-header { margin-top: 0; }` 等で調整する。
       実装方法は任せるが「window モードでは chrome がパネル最上端に全幅で張り付き、
       overlay モードでは従来通り上端に padding がある」見た目を維持すること。
3. 新設 `.settings-content`:
   ```css
   .settings-content {
     flex: 1;
     min-height: 0;
     overflow-y: auto;
     overflow-x: hidden;
     overscroll-behavior: contain;
     padding: 0 var(--settings-panel-padding-x) var(--settings-panel-padding-y);
     display: flex;
     flex-direction: column;
     gap: var(--space-4);
   }
   ```
   （children は ProviderSettingsSection / DocumentWorkflowPanel / SourceSettingsSection のいずれか1つ。
   各セクションは `.settings-section` 等で自前のgapを持つので、見た目の間隔が現状と同等になるよう微調整可。）
4. `src/styles/responsive.css`:
   - `.settings-window-chrome` の負マージン行を削除。
   - 519px以下の `.settings-panel` への padding 上書きが新構造でも効くよう、
     padding-left/right/top/bottom の直接指定を変数の上書き（`--settings-panel-padding-x: 12px;` 等）に置き換える。
5. `src/styles/base.css` 117-121行目の `-ms-overflow-style: none;` 対象リストに含まれる
   `.settings-panel` は `.settings-content` に書き換える。

## 受け入れ基準
- 設定ウィンドウ・overlay 双方で、Providers タブの一覧を最下部までスクロールしても
  タイトルバー / 閉じる・最小化・最大化ボタン / 見出し / タブが固定表示のまま。
- スクロール中もタイトルバー部分でウィンドウをドラッグ移動できる（window モード）。
- 最小サイズ 420x520 でもヘッダー+タブ+コンテンツ1行以上が見える。
- タブ切替（Providers / Documents / Sources）でレイアウトが崩れない。
- ライト/ダーク両テーマで境界線・背景が破綻しない。
- `npm run build` が通る。
