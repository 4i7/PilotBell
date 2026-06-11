# [Codex] P2-9: チャットスレッドのキーボード操作・アクセシビリティ

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS。作業ディレクトリはリポジトリの `apps/pilotbell`。
- チャット履歴は `src/components/SessionHistory.tsx` の `<div className="chat-thread">`
  （`overflow: auto` のスクロールコンテナ）。
- 現状フォーカス不可のため、入力欄にフォーカスがあるとキーボードでスレッドをスクロールできない。
- 依存: P0-1（ルート高さ修正）適用後を想定。

## 変更指示
1. `src/components/SessionHistory.tsx` の `.chat-thread` 要素に以下を追加:
   - `tabIndex={0}`
   - `role="log"`
   - `aria-label="Conversation history"`
   - `aria-live="polite"` は付けない（エントリ全体が再描画されるため読み上げが過剰になる）。
2. フォーカス時のリングが常時出ないよう、CSSに追加（`src/styles/chat.css`）:
   ```css
   .chat-thread:focus {
     outline: none;
   }
   .chat-thread:focus-visible {
     outline: none;
     box-shadow: var(--focus-ring);
     border-radius: var(--radius-panel);
   }
   ```
3. フォーカスがあれば PageUp/PageDown/Home/End/矢印キーはブラウザ標準のスクロールが効くため、
   独自のキーハンドラは実装しないこと。

## 受け入れ基準
- Tabキーでスレッドにフォーカスでき、PageUp/PageDown/Home/End でスクロールできる。
- マウスクリックでフォーカスしたときは太いフォーカスリングが出ない（:focus-visible のみ）。
- 既存のRetry/Copyボタンのタブ順が壊れない（スレッド→内部ボタンの順になる）。
- `npm run build` が通る。
