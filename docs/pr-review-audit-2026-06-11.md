# マージ済みPRレビュー監査 (2026-06-11)

目的: GitHub上のCodexレビューbot（chatgpt-codex-connector）の指摘が未対応のまま
マージされていないか、全PRを対象に照合する。対象 = PR #1〜#60 の全インラインレビュー
コメント（`gh api repos/4i7/PilotBell/pulls/<n>/comments` で機械的に収集）。
判定は指摘時点のコードではなく**現行HEAD**（および本監査で作成した修正PR）に対して実施。

## 集計

- インライン指摘を持つPR: 14件 / 指摘総数 16件（P1×3, P2×13）
- 未対応のまま放置されていた指摘: **9件**（うち致命/データロス級 3件）
- 本監査で解消: 7件 / 非致命バックログ: 3件（うち1件は新規発見の派生課題）

## 指摘台帳

| PR | 重大度 | 指摘 | 判定 | 処置 |
|---|---|---|---|---|
| #3 | P1 | OpenAI Responses REST の `output[].content[]` を読まず `output_text` のみ参照 | ✅解消済み | `provider/responses.rs` の `extract_openai_output_text` が output 配列を走査（後続PRで修正済み） |
| #6 | P2 | `core:window:allow-*` 権限不足で palette 動作が拒否される | ✅解消済み | capabilities/default.json に必要権限が追加済み |
| #7 | P2 | `savePromptSession` が localStorage クォータ超過で throw → 送信フロー破壊 | ❌未対応だった | **本監査で修正**（fix/audit-followups: 半減リトライ+全消去フォールバック+テスト2件） |
| #11 | P2 | ホストプリセット切替（OpenAI↔Anthropic）で旧シークレットが温存され、別ベンダーへ旧キーが送信される | ❌未対応 | バックログ化: `docs/tasks/codex-audit-4-preset-secret-switch.md` |
| #13 | P2 | チャンク全文の localStorage 永続化でクォータ超過 | ✅消滅 | `sourceIndexStore.ts` ごと機能削除済み |
| #15 | P2 | Retry が現在のコンポーザー添付を継承し無関係なファイル内容を送信（情報漏えい） | ❌未対応だった | **本監査で修正**（fix/audit-followups: `sendPrompt` に attachments override、Retryは空配列、テスト2件） |
| #15 | P2 | Excel 検証が先頭5シートのみ（6枚目以降の上限バイパス） | ❌未対応 | 非致命バックログ（処理自体も先頭5シートのみで実害限定。仕様明確化が先） |
| #19 | P1 | `generate_handler!` にモジュール非修飾の識別子を渡しビルド不能 | ✅解消済み | 現行はビルド成功（CI green）。lib.rs はフラット import + 正常展開 |
| #36 | P2 | 古い失敗ジョブが「Last run failed」を出し続ける | ✅解消済み | `useDocumentJobs` の `activeProgress ?? latestProgress` 方式に書き換え済み |
| #43 | P1 | レガシーシークレット移行が不安定depで無限再実行（keyringスラッシング+平文キー残存） | ❌未対応だった | **PR #60 で修正**（refs化+一発ガード+StrictMode解放、回帰テスト2件） |
| #43 | P2 | scrub がレガシー以外のプロバイダ設定を全消去（データロス） | ❌未対応だった | **PR #60 で修正**（idマージ保存+成功パスのdedupe、回帰テスト3件） |
| #46 | P2 | `hasSecret` メタデータだけで「Stored API key available: Yes」表示 | ❌未対応 | 非致命バックログ（送信時はバックエンドが安全に失敗する） |
| #48 | P2 | 初回レンダーで復元ウィンドウサイズを `setSize`+`center()` が上書き | ✅解消済み | PR #58 のサイズ永続化+center廃止+作業領域クランプで実質解消 |
| #55 | P2 | ジョブClear後も pending ドキュメント文脈が残り送信可能 | ❌未対応だった | **PR #59 で修正**（clearResultでpending/エラーも破棄、回帰テスト1件） |
| #56 | P2 | DOCX セル幅がグリッド幅と不整合でページ超過 | ❌未対応 | 非致命バックログ（出力見た目のみ） |
| #58 | P2 | 設定ウィンドウのタイトルバー上に非ドラッグ空白帯 | ✅解消済み | PR #58 内で対応（b83b975）、マージ済み |

## 監査の副産物（bot指摘外で発見した問題）

| 発見元 | 内容 | 処置 |
|---|---|---|
| #6照合中 | **PR #58 のリサイズ実装が `setPosition` を呼ぶが `core:window:allow-set-position` 権限が無く、作業領域クランプがサイレント無効**（catchで握り潰し）。tauri 2.11.2 の権限定義で `core:window:default` に含まれないことを確認 | **本監査で修正**（fix/audit-followups: capabilities に1行追加） |
| #43修正検品 | Codex実装の一発ガードが StrictMode（dev）で移行を永久停止させる退行 | PR #60 内で修正（cleanupでガード解放+StrictModeテスト） |
| #43修正検品 | 移行成功パスにも二重形式idの重複追加が残存 | PR #60 内で修正（dedupe） |

## 結論

「Codexレビューが適当」というよりは、**botの指摘自体は概ね正確**（16件中、誤指摘ゼロ。
#15bのみ実害限定）だが、**指摘への対応がマージ前に行われない運用**が9件の放置を生んでいた。
今後は: PRマージ前に bot コメント0件 or 全返信済みであることをマージ条件にするのを推奨。
