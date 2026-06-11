# UI/UX修正タスク一覧（プロンプト集）

各 .md はそのまま対象モデルにコピペで投げられる自己完結プロンプト。
背景の全体分析は `../ui-ux-fix-plan.md` を参照。

## 割り振りと順序

| 順 | ファイル | モデル | 内容 | 依存 |
|---|---|---|---|---|
| 1 | `codex-p0-1-root-height.md` | Codex | メイン窓: 入力欄が画面外に流れるバグ修正 | なし |
| 2 | `codex-p0-2-settings-header-fixed.md` | Codex | 設定: タイトルバー・タブ固定 | なし（1と並行可） |
| 3 | `codex-p1-3-scrollbars.md` | Codex | スクロールバー可視化 | 1, 2 |
| 4 | `codex-p1-5-detail-maxheight.md` | Codex | エラー詳細の高さ上限 | なし |
| 5 | `codex-p1-6-composer-height-caps.md` | Codex | 添付・プレビューの高さ上限 | なし |
| 6 | `sonnet-p1-4-stick-to-bottom.md` | **Sonnet** | 新着への自動スクロール | 1 |
| 7 | `codex-p2-9-keyboard-a11y.md` | Codex | スレッドのキーボード操作 | 1 |
| 8 | `opus-p2-7-window-resize-policy.md` | **Fable5/Opus** | リサイズ方針の設計（→実装はCodex） | 1 |
| 9 | `opus-p2-8-dragregion-investigation.md` | **Fable5/Opus** | ドラッグ挙動の実機調査 | なし |

- 4, 5 は小粒なので 1 か 2 と同じセッションにまとめて投げてもよい。
- 6 は仕様を変えずそのまま渡せば Codex でも可（判断の余地を仕様で潰してある）。
- 8, 9 は設計/調査タスク。成果物（実装仕様）が出てから Codex に実装を投げる。

## 全タスク共通の回帰確認
- 空セッション: コンパクトパレット(620x190)で入力欄が中央、丸枠が崩れない
- 履歴あり: 760x720 でスレッドがスクロール、コンポーザー固定
- 最小サイズ(420x160 / 420x520)で操作可能
- 設定ウィンドウ / overlay フォールバック両方
- ライト / ダークテーマ
- 最大化 ⇔ 復元
