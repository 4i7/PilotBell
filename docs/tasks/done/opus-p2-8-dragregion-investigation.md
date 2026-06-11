# [Fable5/Opus] P2-8: カスタムタイトルバーのドラッグ挙動調査（要実機検証）

## 前提コンテキスト
- 対象: Tauri 2（Windows / WebView2）デスクトップアプリ。作業ディレクトリはリポジトリの `apps/pilotbell`。
- 全ウィンドウ `decorations: false` でカスタムタイトルバーを描画している。
- 実機（Windows 11）で `npm run tauri dev` を起動して検証できる環境が必要。

## 現状の実装
タイトルバーのドラッグ領域に **2つの機構が併用**されている:

`src/components/AppChrome.tsx`（メインウィンドウ、46-58行目）:
```tsx
<div className="app-chrome__brand" data-tauri-drag-region onMouseDown={handleDragMouseDown}>
  <span className="window-badge">{title}</span>
</div>
<div className="app-chrome__drag-spacer" data-tauri-drag-region onMouseDown={handleDragMouseDown} />
```
`handleDragMouseDown` は左ボタンの mousedown で `getCurrentWindow().startDragging()` を呼ぶ
（`src/hooks/useTauriWindowShell.ts` の `startWindowDrag`）。

`src/components/SettingsPanel.tsx`（設定ウィンドウ、77-81行目）も同じパターン。

## 調査してほしいこと
1. `data-tauri-drag-region` 属性と手動 `startDragging()` の併用が二重処理・競合を起こしていないか。
   - 仮説: mousedown で手動 startDragging が走るため、`data-tauri-drag-region` が本来提供する
     **ダブルクリックで最大化/復元** が発火しない（mousedown 時点でドラッグループに入り
     dblclick が成立しない）。実機で確認すること。
2. `data-tauri-drag-region` は「直下の子要素」には効かない仕様（直接その要素がヒットターゲットの
   ときのみ有効）。`<span className="window-badge">` 上でドラッグ開始できているのはどちらの機構か。
3. 推奨どちらか一方への統一案:
   - 案A: `data-tauri-drag-region` のみに統一（手動 onMouseDown を削除）。
     dblclick 最大化が標準で効くか、子要素 span 上のドラッグが効くかを確認。
     効かない場合は span にも属性を付ける等の対処。
   - 案B: 手動 startDragging のみに統一し、dblclick ハンドラで toggleMaximize を自前実装。
     `event.detail === 2` での分岐や、mousedown→startDragging の遅延等の副作用を確認。
4. 設定ウィンドウ側（SettingsPanel）にも同じ結論を適用できるか。

## 成果物
- 実機検証の結果（各案でのドラッグ可否・dblclick最大化可否の表）。
- 採用案の決定と、Codex に渡せる粒度の修正指示
  （対象ファイル: `AppChrome.tsx` / `SettingsPanel.tsx` / `useTauriWindowShell.ts`）。
- 修正後の確認手順: ドラッグ移動 / ダブルクリック最大化→復元 / ボタン類（設定・最小化・閉じる）が
  ドラッグ領域に食われないこと。
