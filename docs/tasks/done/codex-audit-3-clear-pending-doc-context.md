# [Codex] 監査3【プライバシー】: ジョブClear後もドキュメント文脈プレビューが残り送信可能 (PR#55 P2未対応)

## 前提コンテキスト
- 対象: `apps/pilotbell`。設定のDocumentsタブで、ドキュメント由来Markdownを
  LLMに送る前のレビュー（`useDocumentLlmAssist`、`src/hooks/useDocumentLlmAssist.ts`）がある。
- 「Clear」操作（`src/App.tsx` の `DocumentWorkflowPanel` への `onClear`、587-590行目付近）は
  メモリ上のドキュメント文脈を消すためのプライバシー操作。

## バグの内容（PR#55 のCodexレビュー指摘が未対応のまま残存）
現状の onClear:
```tsx
onClear={() => {
  clearDocumentAssistResult();
  documentJobs.clearJobs();
}}
```
`clearDocumentAssistResult` は `lastResult` のみクリアし、レビュー待ちの
`pendingReview`（生成済みMarkdown全文を含む）はそのまま残る。Clear後も
プレビューパネルにドキュメント内容が表示され続け、`approveDocumentAssistReview` で
そのまま外部プロバイダへ送信できてしまう。「文脈を消す」操作の意図が貫通しない。

## 変更指示
1. `src/App.tsx` の onClear に `cancelDocumentAssistReview()` の呼び出しを追加する。
   ただし `cancelDocumentAssistReview` は「Document context review dismissed.」という
   ステータスを毎回出すため、pending がない通常のClearでメッセージが出るのは不自然。
   そこで `useDocumentLlmAssist` に pending を黙ってクリアする手段を足すか、
   `cancelReview` に `silent` 引数を追加するか、`clearResult` 内で
   `setPendingReview(null)` も行う形に変更してよい（最小変更を選ぶこと）。
   推奨: `clearDocumentAssistResult`（`clearResult`）で `setPendingReview(null)` と
   `setReplyError(null)` も行う。Clear操作の意味論として一貫する。
2. 影響確認: `clearDocumentAssistResult` の他の呼び出し箇所（App.tsx内
   `onClearDocumentAssistResult` プロップ等）でも pending が消える挙動になるが、
   「結果を消す＝文脈レビューも破棄」はプライバシー方針として妥当なので許容する。
   もしUI上「結果カードの×ボタン」が頻繁に使われる動線でpending破棄が不都合なら、
   onClear専用の合成関数を App.tsx に作る方に倒す。判断に迷ったら後者（onClear専用）にすること。

## 受け入れ基準
- ジョブClear後、ドキュメント文脈プレビューパネルが消え、approve経路で送信できない。
- 通常のClear（pendingなし）で余計なステータスメッセージが出ない。
- `npm test` / `npm run build` が通る。
