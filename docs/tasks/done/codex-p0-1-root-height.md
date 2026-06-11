# [Codex] P0-1: メインウィンドウのルート高さ確定（入力欄が画面外に流れるバグの修正）

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS のデスクトップアプリ。作業ディレクトリはリポジトリの `apps/pilotbell`。
- CSSは `src/App.css` から `src/styles/*.css` を @import している。
- 検証コマンド: `npm run build`（tsc + vite）。UI確認は `npm run tauri dev`。

## バグの内容
チャット履歴が溜まると入力欄（コンポーザー）が画面下端の外に押し出され、スクロールも不能になる。

原因: `.shell` / `.window-shell` が `height` ではなく `min-height: 100vh` のため、
flexコンテナの高さが確定せず、子孫の `flex: 1; min-height: 0; overflow: auto`
（`.workspace` → `.chat-thread`）が機能しない。コンテンツ分だけシェルが100vhを超えて成長し、
`html, body, #root { height: 100%; overflow: hidden }`（`src/styles/base.css`）が下端を切り捨てる。

## 現状のコード

`src/styles/chrome.css` 1-16行目:
```css
.shell {
  min-height: 100vh;
  padding: 0;
}

.window-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--bg-shell);
  backdrop-filter: blur(28px);
  box-shadow: none;
}
```

`src/styles/responsive.css` にも同じ指定が2箇所ある:
- 6-9行目（`@media (max-width: 980px)` 内）: `.window-shell { min-height: 100vh; border-radius: 0; }`
- 88-91行目（`@media (max-width: 519px)` 内）: 同上

## 変更指示
1. `src/styles/chrome.css`:
   - `.shell`: `min-height: 100vh;` を削除し、`height: 100vh;` と `height: 100dvh;`（この順で2行、dvh非対応環境のfallback）に置き換える。
   - `.window-shell`: `min-height: 100vh;` を `height: 100%; min-height: 0;` に置き換える。他のプロパティは変更しない。
2. `src/styles/responsive.css`:
   - 上記2箇所のメディアクエリ内 `.window-shell` ブロックから `min-height: 100vh;` の行だけ削除する
     （`border-radius: 0;` は残す）。
3. 他のファイル・他のセレクタは変更しないこと。

## 受け入れ基準
- 履歴30件以上でもコンポーザー（入力欄+送信ボタン）が常にウィンドウ下端に表示される。
- `.chat-thread` がホイールでスクロールできる。
- 空セッション時のコンパクトパレット（ウィンドウ620x190、入力欄が中央の丸枠）のレイアウトが崩れない。
- ウィンドウを最小サイズ（420x160）付近まで縮めても入力欄が消えない。
- `npm run build` が通る。
