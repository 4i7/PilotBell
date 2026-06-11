# [Codex] 監査1【致命】: レガシーシークレット移行が無限再実行ループする (PR#43 P1未対応)

## 前提コンテキスト
- 対象: Tauri 2 + React。作業ディレクトリはリポジトリの `apps/pilotbell`。
- 旧バージョンは provider の `apiKey` を localStorage に平文保存していた。現行は起動時に
  `useLegacyProviderMigration`（`src/hooks/providerManagement/useLegacyProviderMigration.ts`）が
  OSキーリングへ移行する。
- 検証: `npm test` / `npm run build`。

## バグの内容（PR#43 のCodexレビュー指摘が未対応のまま残存、実害は指摘より深刻）
`useLegacyProviderMigration` の useEffect は依存配列に `onLegacySecretsScrubbed` を含む（152行目付近）。
呼び出し元 `App.tsx` は `onLegacySecretsScrubbed: () => { persistSessionEntries([]); }` を
**インラインラムダ**で渡すため、App再レンダー毎に新しい参照になる。

ループ機構: effect実行 → `setProviderStatus(migrationStatus(...))`（毎回新オブジェクト）→ 再レンダー
→ 新ラムダで依存変化 → cleanup（`cancelled = true` → 進行中の移行を `rollbackSecrets` で巻き戻し）
→ effect再実行 → … が**無限に循環**する。レガシーキー保持ユーザーでは:
- OSキーリングへの書込/削除が無限に繰り返される
- 移行が永遠に完了せず、平文APIキーが localStorage に残り続ける（PR#43の目的が達成されない）

さらに移行が一度成功した場合でも `legacyProviders`（`useState(() => loadProviderState())` 由来で不変）が
非空のままなので、その後の依存変化で再移行が走り
`setProviders((current) => [...current, ...migratedProviders])` で**プロバイダが重複追加**される。

## 変更指示
`src/hooks/providerManagement/useLegacyProviderMigration.ts` を以下の方針で修正:
1. `onLegacySecretsScrubbed` と `toneForProviderError` を `useRef` に保持し
   （`const onScrubbedRef = useRef(onLegacySecretsScrubbed); onScrubbedRef.current = onLegacySecretsScrubbed;`
   のパターン。refの更新は専用のuseEffectか、レンダー中代入で可）、effect本体では ref 経由で呼ぶ。
   依存配列から両者を除去する。
2. 移行を**一度きり**にするガードを追加: `const hasRunRef = useRef(false);` を用い、
   Tauriランタイムでの移行開始時に `hasRunRef.current` が true なら早期return、開始時に true にする。
   （ブラウザモードの scrub パスも同様に一度きりでよい。）
3. `setProviderStatus(migrationStatus(...))` はそのままでよい（ループの根は依存配列なので）。
4. 既存のキャンセル＋ロールバック機構（アンマウント時の `cancelled`）は維持する。
5. `eslint-plugin-react-hooks` の exhaustive-deps 警告が出る場合は、該当行に理由コメント付きで
   disable コメントを付ける（refパターンを使えば通常は不要）。

## 受け入れ基準
- App.tsx は変更しない（インラインラムダのままで安全になること）。
- `npm test` / `npm run build` が通る。
- 可能なら回帰テストを追加: レガシープロバイダ1件を含むstateでフックをレンダーし、
  親の再レンダー（コールバック参照の変化）を起こしても `storeProviderSecret` が
  1回しか呼ばれないことを検証する（providerCommands をモック）。
