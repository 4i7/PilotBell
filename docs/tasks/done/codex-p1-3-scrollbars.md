# [Codex] P1-3: スクロールバーの可視化

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS。作業ディレクトリはリポジトリの `apps/pilotbell`。
- 現状、全要素でスクロールバーが完全に非表示になっており、スクロール可能な領域の
  視覚的手がかりがない。これを「細いテーマ対応スクロールバー」に置き換える。
- 検証: `npm run build` と `npm run tauri dev` での目視。
- 依存: P0-1 / P0-2（ルート高さ修正・設定パネル再構成）適用後を想定。
  `.settings-content` が未導入の場合は `.settings-panel` を対象にすること。

## 現状のコード

`src/styles/base.css` 88-96行目:
```css
* {
  box-sizing: border-box;
  scrollbar-width: none;
}

*::-webkit-scrollbar {
  width: 0;
  height: 0;
}
```

同 117-121行目:
```css
.chat-thread,
.composer-input textarea,
.settings-panel {
  -ms-overflow-style: none;
}
```

利用可能なテーマ変数（ライト/ダーク両対応済み）: `--border-soft`, `--border-strong`,
`--text-muted`, `--bg-muted` など。

## 変更指示
1. `src/styles/base.css` から上記の全要素スクロールバー消去（`* { scrollbar-width: none }` の行と
   `*::-webkit-scrollbar` ブロック、117-121行目の `-ms-overflow-style` ブロック）を削除する。
   `* { box-sizing: border-box; }` は残す。
2. 共通のスクロールバースタイルを base.css に追加する。対象セレクタ:
   `.chat-thread`, `.settings-content`, `.composer-input textarea`,
   `.context-preview-body`, `.detail`, `.attachment-strip`, `.context-preview-panel`
   ```css
   /* Firefox */
   scrollbar-width: thin;
   scrollbar-color: var(--border-strong) transparent;
   ```
   ```css
   /* WebKit (WebView2) */
   ::-webkit-scrollbar { width: 8px; height: 8px; }
   ::-webkit-scrollbar-track { background: transparent; }
   ::-webkit-scrollbar-thumb {
     background: var(--border-strong);
     border-radius: 999px;
   }
   ::-webkit-scrollbar-thumb:hover {
     background: var(--text-muted);
   }
   ```
   （対象セレクタごとに `::-webkit-scrollbar` を付ける形でも、全体適用でもよいが、
   設定画面のセレクト/インプット等にバーが出ても害はないため全体適用で構わない。）

## 受け入れ基準
- チャット履歴・設定画面のスクロール領域にコンテンツが溢れているとき、細いスクロールバーが見える。
- スクロールバーのつまみをマウスドラッグしてスクロールできる。
- ライト/ダーク両テーマで視認できる（ダークでは白っぽい半透明、ライトではグレー系）。
- レイアウト幅がバー分ずれてガタつかない（必要なら `scrollbar-gutter: stable` を検討）。
- `npm run build` が通る。
