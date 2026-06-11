# [Sonnet] P1-4: 新着メッセージへの自動スクロール（stick-to-bottom）

## 前提コンテキスト
- 対象: Tauri 2 + React + 素CSS のデスクトップアプリ。作業ディレクトリはリポジトリの `apps/pilotbell`。
- チャット履歴は `src/components/SessionHistory.tsx` がレンダリングする
  `<div className="chat-thread">`（`flex: 1; min-height: 0; overflow: auto` のスクロールコンテナ、
  スタイルは `src/styles/chat.css`）。
- エントリ配列は `src/App.tsx` で `const chatEntries = useMemo(() => [...sessionEntries].reverse(), ...)`
  として渡される。**表示順は古→新（最新が一番下）**。この並びは変更しないこと。
- 1エントリ = ユーザープロンプト + アシスタント応答（or エラー）+ メタ行 + Retry/Copyボタン。
  応答はストリーミングではなく完了時に一括追加される（`addSessionEntry` が配列先頭にprepend）。
- 依存: P0-1（ルート高さ修正。`.shell` を `height: 100dvh` 化）適用済みであること。
- 検証: `npm run build`（tsc + vite）、`npm run tauri dev` で目視。テストは vitest
  （`npm test` 相当、既存テストは *.test.ts(x)）。

## 要求仕様
1. **マウント時**: スレッドを最下部（最新エントリ）までスクロールする。現状は最古が見えてしまう。
2. **エントリ追加時**:
   - 直前のスクロール位置が「最下部から80px以内」だった場合のみ、自動で最下部へスクロールする。
   - ユーザーが上方を読んでいる（80pxより上）場合は位置を維持し、自動スクロールしない。
3. **「最新へ移動」ボタン**:
   - 自動追従が外れている状態（最下部から80pxより上にいる）で表示する
     フローティングボタンを `.chat-thread` の右下に重ねて配置する。
   - クリックで最下部へスムーズスクロールし、ボタンは消える。
   - 新着が来ていなくても、上にスクロールしただけで表示してよい（実装が単純になる）。
   - 見た目は既存のデザイントークンを使う: 丸ピル、`var(--bg-elevated)` 背景、
     `var(--border-soft)` ボーダー、`var(--shadow-popover)`、ホバーで `var(--bg-muted)`。
     ラベルは "↓ Latest" 程度で可。
4. **判定の実装**: scroll イベントで `scrollHeight - scrollTop - clientHeight <= 80` を追従フラグとして
  保持する。エントリ追加による再レンダー後のスクロールは `useLayoutEffect` で行い、ちらつきを避ける。
5. ウィンドウリサイズで追従状態が壊れないこと（追従中にリサイズしたら最下部を維持するのが望ましいが、
   必須ではない）。

## 実装上の注意
- `SessionHistory` は現在 props のみの純粋コンポーネント。ref と state の追加はこのコンポーネント内で
  完結させ、`App.tsx` のインターフェースは変えない（entries の参照同一性で追加検知できる）。
- `entries.length === 0` のとき `null` を返す既存挙動は維持。
- フローティングボタンの配置のため、`.chat-thread` をラップする relative なコンテナを足してよいが、
  `.chat-thread` の flex レイアウト（`flex: 1; min-height: 0`）が親子間で壊れないよう注意
  （ラッパーに `flex: 1; min-height: 0; position: relative; display: flex;` を与え、
  `.chat-thread` は `flex: 1` のまま等)。
- スクロール位置の追従判定が Retry/Copy ボタンによる再レンダーで誤発火しないこと
  （エントリ数の変化のみで自動スクロールを起こす）。

## 受け入れ基準
- アプリ起動時（履歴あり）に最新メッセージが見えている。
- 最下部付近で新規送信→応答が来たら自動で最新が見える。
- 上にスクロールして過去ログを読んでいる最中に応答が来てもスクロール位置が動かない。
- その状態で右下に「最新へ移動」ボタンが見え、クリックで最下部へ移動する。
- ライト/ダーク両テーマでボタンの視認性が確保されている。
- `npm run build` と既存テストが通る。
