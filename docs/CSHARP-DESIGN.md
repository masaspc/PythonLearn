# C# Start 設計方針

## 目的

PythonLearnとは独立した、完全初心者向けC#コースを `csharp/` に公開する。C#のコードをブラウザ内の.NET WebAssemblyでコンパイル・実行し、コードと進捗を端末のブラウザに保存する。

## 構成

- `csharp-app/`: Blazor WebAssemblyのソース。GitHub Actionsでビルドする。
- `csharp/`: Actionsが生成する公開成果物。PythonLearnと同じGitHub Pagesのサブパスで配信する。
- Roslyn (`Microsoft.CodeAnalysis.CSharp`) でユーザーコードを構文解析・コンパイルする。
- 実行は学習用に許可した標準ライブラリと `Console` 出力に限定し、演習ごとのテストで結果を判定する。

## 初期カリキュラム

1. `Console.WriteLine` とプログラムの形
2. 変数と型
3. 演算・比較・条件分岐
4. 繰り返しと配列
5. メソッド、クラス、総合演習

## 安全性と制約

- ファイルI/O・ネットワーク・プロセス起動を題材に含めない。
- 実行はWebAssemblyのブラウザサンドボックス内に限定する。
- 無限ループへの対策は、実行用の独立コンテキストをタイムアウトで破棄する方式を採用する。Roslynの動的アセンブリ実行をWebAssemblyで検証できない場合、実行対象を学習用サブセットへ限定し、判定器を別実装する。
- AOTは初回ロードが重くなるため、初版では使わない。Microsoftの説明どおり、通常のBlazor WebAssemblyはILインタープリターで動き、AOTはサイズとのトレードオフがある。

## 公開

GitHub ActionsでPython側の静的ファイルと `csharp-app` のpublish出力を1つのPages成果物へまとめる。Pagesの公開元をlegacyブランチからActionsへ変更する。
