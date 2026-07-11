# PythonLearn — Python初心者向けインタラクティブ学習サイト

## プロジェクト概要

ブラウザ上でPythonコードを書いて実行できる、プログラミング完全初心者向けの学習サイト(日本語UI)。
GitHub Pagesでホストし、Pyodide(WebAssembly)でブラウザ内実行する。全10章・各章3〜5レッスン。

## 絶対制約(変更禁止)

- ビルドツール不使用。素のHTML/CSS/JS(ES Modules)のみ。pushするだけでGitHub Pagesで動くこと
- 外部依存はCDNのみ(Pyodide公式CDN、CodeMirror 6はesm.sh等のESM CDN)
- 相対パスで動作(`https://<user>.github.io/<repo>/` のサブパス配下で壊れない。ルート絶対パス禁止)
- PyodideはWeb Worker上で実行し、10秒タイムアウトで強制停止(worker terminate → 再生成)
- 進捗はlocalStorageに保存(章・レッスン完了フラグ、演習合格記録)
- カリキュラムで `input()` は使わない(変数代入で入力値を与える形式に統一)
- レスポンシブ必須(PC・タブレット・スマートフォン)

## リポジトリ構成

```
index.html          # トップ(章一覧・進捗表示)
lesson.html         # レッスン表示(URLパラメータ ?chapter=N&lesson=M)
css/style.css
js/app.js           # ルーティング・進捗管理
js/runner.js        # Pyodide Worker管理・タイムアウト
js/worker.js        # Pyodide実行本体
js/editor.js        # CodeMirror統合
js/judge.js         # 演習自動判定
data/lessons/       # レッスンJSON(解説・演習・判定テスト)
docs/DESIGN.md      # 設計判断の記録
docs/curriculum-spec.md  # カリキュラム詳細仕様
```

コンテンツ(解説・演習)はJSONデータとして分離し、HTML/JSのロジックと混ぜない。

## 開発体制(オーケストレーション)

メインセッションは監督役。プロダクションコード・コンテンツは書かず、`.claude/agents/` のサブエージェントに委譲する:

| エージェント | 役割 |
|---|---|
| curriculum-designer | カリキュラム詳細仕様の設計 |
| frontend-engineer | サイト実装(骨格・実行基盤・エディタ・判定・進捗) |
| content-writer | レッスンコンテンツ(JSON)執筆 |
| exercise-validator | 演習判定の検証(模範解答が合格、誤答が不合格) |
| qa-reviewer | コードレビュー・文章校閲(読み取り専用) |

qa-reviewerの指摘の修正は frontend-engineer / content-writer に差し戻して行う。

## 実行フェーズ

- Phase 0: 準備(エージェント定義・CLAUDE.md) — 完了
- Phase 1: 設計(カリキュラム仕様 + 技術検証) → ゲート: ユーザー確認
- Phase 2: 基盤実装 + 第1章パイロット → ゲート: qa-reviewer合格 + validator検証
- Phase 3: コンテンツ量産(残り9章) → ゲート: 全演習検証 + 校閲
- Phase 4: 最終QA・デプロイ準備(README、動作確認手順)

## ローカル動作確認

```
python -m http.server 8000
# → http://localhost:8000/
```

## 完了の定義(DoD)

- GitHub Pagesにpushするだけで動作する
- 全10章で解説閲覧・コード実行・演習自動判定が機能する
- 無限ループがタイムアウトで停止し画面が固まらない
- 進捗がlocalStorageに保存・復元される
- スマートフォンで実用的に操作できる
- 全演習で「模範解答が合格・空回答が不合格」を検証済み
