# [Codex] P1-5: エラー詳細表示の高さ上限

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS。作業ディレクトリはリポジトリの `apps/pilotbell`。
- メインウィンドウのチャット面では、プロバイダエラーの詳細が `<pre className="detail">` で
  チャットスレッドとコンポーザーの間に表示される（`src/App.tsx` の `replyError?.details` 部分）。
- 現状このブロックに高さ上限がなく、長いスタックトレース等がチャット欄を圧迫する。

## 現状のコード

`src/styles/composer.css` 565-573行目:
```css
.detail {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-panel);
  color: var(--text-secondary);
  background: var(--bg-subtle);
  white-space: pre-wrap;
  word-break: break-word;
}
```

## 変更指示
`.detail` に以下の2行を追加する。それ以外は変更しない。
```css
max-height: 180px;
overflow-y: auto;
```

## 受け入れ基準
- 50行超のエラー詳細でもブロックが180pxで止まり、内部スクロールできる。
- チャットスレッドとコンポーザーの表示領域が維持される。
- `npm run build` が通る。
