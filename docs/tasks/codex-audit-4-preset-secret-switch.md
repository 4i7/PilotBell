# [Codex] 監査4【中・セキュリティ】: ホストプリセット切替で旧ベンダーのAPIキーが温存される (PR#11 P2未対応)

## 前提コンテキスト
- 対象: `apps/pilotbell`。プロバイダ編集中にプリセットボタン（OpenAI / Anthropic / Ollama / llama.cpp）で
  kind・endpoint・model を切り替えられる（`src/hooks/providerManagement/providerPresetActions.ts`）。
- 保存フロー（`useProviderSaveActions` 系）は「APIキー欄が空 = 既存シークレットを維持」の意味論。

## バグの内容（PR#11 のCodexレビュー指摘が未対応のまま残存）
既存のOpenAIプロバイダを編集中にAnthropicプリセットを適用すると、kind/endpointはAnthropicに
変わるがAPIキー欄は空のまま。保存すると旧OpenAIキーのシークレットが**そのまま維持**され、
次回送信時に **OpenAIのAPIキーがAnthropicのエンドポイントへ送信される**（逆も同様）。
認証は失敗するが、クレデンシャルが別ベンダーへ送出されること自体が問題。

## 変更指示
1. 編集中プロバイダの `kind` が「シークレットを要するホスト系（openai-responses / anthropic-messages）」
   間または他kindから変化した状態で保存される場合、空のAPIキー欄を「維持」と解釈せず、
   **新しいキーの入力を必須にする**（バリデーションエラー表示）。
   - 判定は「編集開始時のkind ≠ 保存時のkind かつ 保存時kindがAPIキー必須」で行う。
   - ローカル系（ollama / llama-cpp）への切替は鍵不要なので、保存時に既存シークレットを
     `deleteProviderSecret` で削除し `hasSecret: false` にする（孤児シークレットを残さない）。
2. 実装箇所の候補: `src/hooks/providerManagement/useProviderSaveActions.ts` /
   `src/domain/provider.ts` のバリデーション（`isProviderDraftValid` 周辺）。
   編集開始時のkindは `editingProvider` から取得できるはず。現物を確認して最小の場所に入れること。
3. 回帰テスト: kind切替+空キーで保存→バリデーションエラー、同一kind+空キー→従来通り維持、
   ホスト系→ローカル系切替→シークレット削除が呼ばれる、の3ケース。

## 受け入れ基準
- OpenAI→Anthropic切替保存で旧キーが再利用されない（必ず再入力）。
- 既存の「同一プロバイダのキー更新せず保存」フローは壊れない。
- `npm test` / `npm run build` が通る。
