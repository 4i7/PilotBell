# PilotBell Roadmap (Execution Plan)

## 目的
主要機能（実際の AI 呼び出し、プロバイダ管理、履歴、ショートカット、ローカル知識連携）を段階的に実動作させる。

## 実動作までに必要な機能洗い出し

### 1) Provider / API 実行基盤
- Provider 登録・選択・削除
- Provider 接続テスト
- Prompt 実行（成功/失敗ハンドリング）
- Provider ごとのタイムアウト、再試行、エラー分類

### 2) セキュリティ
- API Key の平文 localStorage 保存を廃止
- Tauri 側 secure storage（OS keychain or encrypted store）へ移行
- endpoint allowlist/https 強制

### 3) UX
- コマンド履歴保存・再実行
- 送信キャンセル
- Provider/Model 状態表示
- ショートカットで表示トグル

### 4) 拡張
- OpenAI 互換以外の adapter 層
- ローカル LLM（Ollama）
- ローカル KB / Obsidian 検索

## 設計方針（関数・プログラム設計）

### Frontend
- `domain/provider.ts` : Provider の型・検証・正規化
- `lib/providerStore.ts` : 永続化 I/O
- `App.tsx` : UI 合成 + invoke 呼び出し

### Backend (Rust)
- `validate_provider` : 入力検証（必須項目 / https）
- `call_provider` : HTTP 呼び出し共通処理
- `test_provider` : 接続確認 command
- `handle_prompt` : 実行 command

## 開発ロードマップ

### Phase A（着手済み）
- [x] Provider 登録 UI
- [x] Prompt の実 API 呼び出し
- [x] Provider 接続テスト command
- [x] Provider 検証関数の共通化

### Phase B
- [ ] API key secure storage
- [ ] timeout/retry 設定
- [ ] structured error model

### Phase C
- [ ] global shortcut + compact window
- [ ] history + rerun + copy

### Phase D
- [ ] provider adapter architecture
- [ ] local KB integration


## 開発環境ポリシー
- 現在の主対象は Windows 11。
- Rust/Tauri の正規チェックは Windows ホスト（stable-msvc）で実施。
- Linux 依存エラーは、Windows 専用開発フェーズでは非ブロッカー扱い。
