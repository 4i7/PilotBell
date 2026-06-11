# [Codex] 監査2【データロス】: レガシーキーのscrubで無関係なプロバイダ設定が消える (PR#43 P2未対応)

## 前提コンテキスト
- 対象: `apps/pilotbell`。`localStorage["pilotbell.providers"]` には
  「メタデータのみのプロバイダ（hasSecret等、現行形式）」と
  「レガシープロバイダ（apiKey平文を含む旧形式）」が混在しうる。
- `loadProviderState()`（`src/lib/providerStore.ts:94`）は両者を分離して返す。
  注意: レガシー判定は `apiKey` フィールドの有無であり、同じ配列要素が
  `providers`（normalizeProviderMetadata）と `legacyProviders`（normalizeLegacyProvider）の
  **両方にマッチしうる**（hasSecretとapiKeyを両方持つ場合）。重複に注意。

## バグの内容（PR#43 のCodexレビュー指摘が未対応のまま残存）
`replaceLegacyProvidersWithMetadata`（`src/lib/providerStore.ts:86-92`）:
```ts
export function replaceLegacyProvidersWithMetadata(
  legacyProviders: LegacyProviderConfig[],
): ProviderConfig[] {
  const sanitizedProviders = sanitizeLegacyProvidersToMetadata(legacyProviders);
  saveProviders(sanitizedProviders);
  return sanitizedProviders;
}
```
sanitize済みレガシーのみで**ストレージ全体を上書き**するため、ブラウザモードや移行失敗時の
scrubパス（`useLegacyProviderMigration` の `scrubLegacyProviders`）で、レガシーでない
通常のプロバイダ設定が全て消える（データロス。キーリング側のシークレットは孤児化する）。

## 変更指示
1. `replaceLegacyProvidersWithMetadata` を「現在の全プロバイダとマージして保存」に変更する。
   シグネチャ案: `replaceLegacyProvidersWithMetadata(legacyProviders, currentProviders: ProviderConfig[])`。
   マージ規則: `currentProviders` を基礎とし、id が一致するレガシー由来エントリは
   sanitize版（`hasSecret: false`）で**置換**、currentに存在しない id のレガシーは末尾に追加。
   id 重複が結果に残らないこと。
2. 呼び出し元 `useLegacyProviderMigration.ts` の `scrubLegacyProviders` を更新:
   `setProviders((current) => { const next = replaceLegacyProvidersWithMetadata(legacyProviders, current); return next; })`
   の形で関数型更新にし、最新のプロバイダ一覧とマージする。
3. 既存テスト `src/lib/providerStore.test.ts` に回帰テストを追加:
   - メタデータプロバイダA + レガシープロバイダB が保存された状態で scrub すると、
     結果は A（無傷）+ B（hasSecret: false, apiKeyなし）の2件になる。
   - 同一idがメタデータ/レガシー両形式にマッチするケースで重複しない。

## 受け入れ基準
- `npm test` / `npm run build` が通る（新規テスト含む）。
- scrub後の localStorage に `apiKey` フィールドが残らないこと（既存保証の維持）。
