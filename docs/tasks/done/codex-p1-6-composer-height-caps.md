# [Codex] P1-6: コンポーザー内部の高さ制御（添付チップ・コンテキストプレビュー）

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS。作業ディレクトリはリポジトリの `apps/pilotbell`。
- 入力欄を含むコンポーザー（`.composer-dock`、`src/components/PromptComposer.tsx`）には
  添付ファイルチップの列（`.attachment-strip`）と、送信前のコンテキストプレビュー
  （`.context-preview-panel`）が表示される。
- これらに高さ上限がなく、かつ `.composer-dock { overflow: hidden }`（角丸クリップ用）のため、
  添付が多い/プレビューが長いと送信ボタンや下部ステータス行が切れて操作不能になる。

## 現状のコード（`src/styles/composer.css`）

35-40行目:
```css
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
```

42-51行目:
```css
.context-preview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-shell);
  background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
}
```
※ パネル内側の `.context-preview-body` には既に `max-height: 220px; overflow: auto;` がある（維持する）。

## 変更指示
1. `.attachment-strip` に追加:
   ```css
   max-height: 96px;
   overflow-y: auto;
   ```
2. `.context-preview-panel` に追加:
   ```css
   max-height: min(40vh, 360px);
   overflow-y: auto;
   ```
3. `.composer-dock { overflow: hidden }` は変更しない。
4. 他のセレクタは変更しない。

## 受け入れ基準
- 添付ファイル10件を付けても送信ボタンとステータス行（プロバイダ表示・Clear等）が見えて操作できる。
- コンテキストプレビュー表示時（送信前レビューが有効な設定のとき）も同様。
- 添付列・プレビューはそれぞれ内部スクロールできる。
- ウィンドウ高さ720px / 最小520px台の両方で確認。
- `npm run build` が通る。
