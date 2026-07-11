# レッスンJSONスキーマ定義 v1.0

本書は `data/lessons/` 配下のレッスンJSONの**契約**である。
frontend-engineer(描画・判定の実装)と content-writer(データ執筆)はこの定義に厳密に従うこと。
カリキュラムの内容仕様は `docs/curriculum-spec.md` を参照。

---

## 1. ファイル配置規則

```
data/lessons/manifest.json   # 章ファイルの一覧(読み込み順)
data/lessons/ch01.json       # 第1章(章メタ情報+全レッスン)
data/lessons/ch02.json
...
data/lessons/ch10.json
```

- **章単位で1ファイル**とする。理由: `lesson.html?chapter=N&lesson=M` は該当章の1ファイルだけをfetchすれば描画でき、content-writerも章単位で執筆・レビューできる。1ファイルは数十KB程度に収まる想定
- ファイル名は `ch` + 章番号2桁 + `.json`。文字コードは **UTF-8(BOMなし)**、拡張子 `.json`、内容は単一のJSONオブジェクト
- トップページ(`index.html`)は `manifest.json` を読み、列挙された全章ファイルを並列fetchして章一覧・進捗を描画する(メタ情報の二重管理をしないため、manifestにはファイル名以外の情報を持たせない)

### manifest.json の形式

```json
{
  "version": 1,
  "chapters": ["ch01.json", "ch02.json", "ch03.json", "ch04.json", "ch05.json",
               "ch06.json", "ch07.json", "ch08.json", "ch09.json", "ch10.json"]
}
```

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `version` | number | ✓ | スキーマバージョン。本書の定義は `1` |
| `chapters` | string[] | ✓ | 章ファイル名の配列。**配列順=章の表示順** |

---

## 2. 章ファイル(chNN.json)の構造

### 2.1 ルート: Chapterオブジェクト

| フィールド | 型 | 必須 | 意味・制約 |
|---|---|---|---|
| `id` | string | ✓ | 章ID。`^ch\d{2}$`(例 `"ch01"`)。ファイル名(拡張子除く)と一致すること |
| `number` | number | ✓ | 章番号(1〜10の整数)。`id` の数値部と一致すること |
| `title` | string | ✓ | 章タイトル(例 `"はじめの一歩"`)。プレーンテキスト(インライン記法不可) |
| `description` | string | ✓ | 章の紹介文(トップページの章カードに表示)。1〜2文。プレーンテキスト |
| `lessons` | Lesson[] | ✓ | レッスンの配列(3〜5件)。**配列順=レッスン順** |

### 2.2 Lessonオブジェクト

| フィールド | 型 | 必須 | 意味・制約 |
|---|---|---|---|
| `id` | string | ✓ | レッスンID。`^ch\d{2}-\d{2}$`(例 `"ch01-01"`)。章IDと一致し、番号は配列内の位置(1始まり)と一致すること。**進捗保存のlocalStorageキーとしてそのまま使う**ため、公開後は変更しない |
| `title` | string | ✓ | レッスンタイトル。プレーンテキスト |
| `objectives` | string[] | ✓ | 学習目標。1〜3件。各要素はインライン記法可(3.3節) |
| `estimatedMinutes` | number | 任意 | 目安時間(分)。省略時はUI非表示。10〜15を推奨 |
| `explanation` | Section[] | ✓ | 解説本文。1件以上(3.2節) |
| `example` | Example | ✓ | 実行例(2.3節) |
| `exercise` | Exercise | ✓ | 演習問題(2.4節) |

### 2.3 Exampleオブジェクト(実行例)

| フィールド | 型 | 必須 | 意味・制約 |
|---|---|---|---|
| `code` | string | ✓ | そのまま実行できる完結したPythonコード。改行は `\n`。`input()`・`import` を含めてはならない(例外: エラー観察用のわざと壊れたコードは可。その場合 `note` で明示) |
| `note` | string | 任意 | 実行例の下に表示する補足(インライン記法可)。「実行するとエラーになります。メッセージを読んでみましょう」等 |

UI挙動(実装契約): 実行例は読み取り表示+「エディタで試す」ボタンでエディタに読み込まれ、実行・改変できる。

### 2.4 Exerciseオブジェクト(演習)

| フィールド | 型 | 必須 | 意味・制約 |
|---|---|---|---|
| `prompt` | Section[] | ✓ | 問題文。1件以上。期待する出力例は `code` セクションで正確に示す |
| `starterCode` | string | ✓ | エディタに最初から入っている雛形コード。**無変更で実行した場合に必ず判定不合格になること**(curriculum-spec 0.2節の条件2) |
| `testCode` | string | ✓ | 判定テストコード(Python)。実行契約は4節 |
| `hints` | Section[][] | ✓ | **要素数ちょうど2**の配列。`hints[0]`=ヒント1(考え方)、`hints[1]`=ヒント2(ほぼ答え)。各ヒントはSection配列(コードを含められる)。UIは「ヒント1を見る」「ヒント2を見る」と段階的に開示する |
| `solution` | Solution | ✓ | 模範解答 |

### 2.5 Solutionオブジェクト

| フィールド | 型 | 必須 | 意味・制約 |
|---|---|---|---|
| `code` | string | ✓ | 模範解答の完全なコード。**testCodeで必ず合格すること**(exercise-validatorが機械検証する) |
| `explanation` | Section[] | 任意 | 解答の解説・別解の紹介 |

---

## 3. 解説文のマークアップ方式

### 3.1 決定: 構造化JSON(Sectionの配列)+ 極小インライン記法

素のMarkdown文字列ではなく、**型付きセクションの配列**を採用する。

**理由**:
1. **XSS安全**: 描画は全て `document.createElement` + `textContent` で行える。`innerHTML` に文字列を渡す箇所がゼロになり、サニタイズライブラリ(DOMPurify等)もMarkdownパーサ(marked等)もCDN依存として増やさずに済む(CLAUDE.mdの「外部依存はCDNのみ・最小」に沿う)
2. **契約が曖昧にならない**: Markdown方言(表・ネストリスト・HTML混在など)の解釈揺れがなく、content-writerが書けるもの=frontendが描画できるもの、が完全に一致する
3. **コードブロックの扱いが確実**: 解説中のコードは `code` セクションとして構造的に分離され、シンタックスハイライトや「エディタで試す」導線を後付けしやすい

### 3.2 Sectionオブジェクト(ユニオン型)

`type` フィールドで種別を判別する。**未知の `type` はエラーにせず無視して描画を続ける**(前方互換)。

#### type: "text" — 段落
| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `type` | `"text"` | ✓ | |
| `body` | string | ✓ | 段落テキスト。インライン記法可(3.3節)。`\n` は段落内改行(`<br>`)として描画 |

#### type: "code" — コード表示(実行ボタンなし)
| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `type` | `"code"` | ✓ | |
| `code` | string | ✓ | 表示するコード。等幅・整形済みで描画(`<pre><code>` に textContent で挿入) |
| `caption` | string | 任意 | コードの上に出す短い説明(インライン記法可) |

#### type: "list" — 箇条書き
| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `type` | `"list"` | ✓ | |
| `items` | string[] | ✓ | 各項目(インライン記法可)。1階層のみ(ネスト不可) |

#### type: "note" — 補足・注意ボックス
| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `type` | `"note"` | ✓ | |
| `style` | `"info"` \| `"warning"` | ✓ | info=豆知識・補足 / warning=つまずき注意 |
| `body` | string | ✓ | 本文(インライン記法可、`\n`=改行) |

#### type: "heading" — 小見出し
| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `type` | `"heading"` | ✓ | |
| `body` | string | ✓ | 見出しテキスト(プレーンテキストのみ)。解説内の節区切りに使う(`<h3>` 相当で描画) |

### 3.3 インライン記法(これ以外は存在しない)

「インライン記法可」と明記されたstringフィールドでのみ、次の**2つだけ**を解釈する:

| 記法 | 描画 | 例 |
|---|---|---|
| `` `コード` `` | `<code>`(等幅) | `` 変数は `name = 値` で作ります `` |
| `**強調**` | `<strong>` | `**ここが重要**` |

- 実装方式: 文字列をトークン分割し、各トークンを `textContent` で要素化する(正規表現置換で `innerHTML` を組み立てる方式は**禁止**)
- ネスト不可(`` **`x`** `` は解釈しなくてよい。バッククォートが優先)
- HTMLタグ・その他のMarkdown記法(リンク、画像、`#`見出し等)は**一切解釈しない**。`<b>` などと書けばその文字がそのまま表示される(=安全側に倒れる)
- 対象フィールド一覧: `objectives[]`、`text.body`、`code.caption`、`list.items[]`、`note.body`、`example.note`

---

## 4. testCode の実行契約(判定エンジン仕様)

frontend-engineer は judge/worker をこの契約どおりに実装し、content-writer はこの前提で testCode を書く。

1. レッスンごとに**新しいグローバル名前空間**を作る(前回実行の変数は残らない)
2. `sys.stdout` をキャプチャした状態で `exec(starterCodeから編集されたユーザーコード, ns)` を実行する
   - ユーザーコードが例外 → **不合格**(テストは実行しない)。エラー内容を表示
   - 10秒超過 → Worker強制終了 → **不合格**(タイムアウトの旨を表示)
3. キャプチャ全文を `ns["__stdout__"]`(str)に代入する
4. 同じ `ns` で `exec(testCode, ns)` を実行する(この間のstdoutは破棄する)
   - 完走 → **合格**
   - `AssertionError` → **不合格**。`str(例外)` (assertの日本語メッセージ)を学習者にそのまま表示
   - その他の例外 → **不合格**。「判定中にエラーが発生しました」+例外内容を表示
5. 合格時に `lesson.id` をキーとしてlocalStorageに合格記録を保存する

**testCode 記述規約**(content-writer向け・exercise-validatorの検査項目):

- すべてのassertに日本語メッセージを付ける。答えそのものは書かない
- テスト内の補助名はアンダースコア始まり(`_lines`、`_buf`、`_old` 等)
- 存在チェック(`assert "x" in globals(), "..."`)を値チェックより先に置く
- 出力判定はこの定型で行分割する:
  `_lines = [_l.rstrip() for _l in __stdout__.rstrip("\n").split("\n")] if __stdout__.strip() else []`
- 関数のprint出力はテスト内で `io.StringIO` に差し替えて検証(importは `io`, `sys` のみ許可)
- float比較は `abs(x - 期待値) < 1e-6`
- 模範解答が合格・雛形が不合格・仕様記載の典型誤答が不合格、の3点を満たすこと

---

## 5. 完全なサンプル(第1章の例)

`data/lessons/ch01.json` の実データ例。レッスンは1件のみ掲載(実ファイルには第1章の全4レッスンが `lessons` 配列に並ぶ)。

```json
{
  "id": "ch01",
  "number": 1,
  "title": "はじめの一歩",
  "description": "print を使って画面に文字を表示しながら、「書いて、実行して、結果を見る」というプログラミングの基本サイクルに慣れます。",
  "lessons": [
    {
      "id": "ch01-01",
      "title": "はじめてのプログラム",
      "objectives": [
        "`print()` を使って文字列を画面に表示できる",
        "「コードを書いて実行ボタンを押すと結果が出る」流れを体験する"
      ],
      "estimatedMinutes": 10,
      "explanation": [
        { "type": "heading", "body": "プログラムってなに?" },
        {
          "type": "text",
          "body": "プログラムは、コンピュータへの指示書です。書いた指示は**上から1行ずつ**順番に実行されます。\nこのサイトでは、ブラウザの中でPythonがそのまま動きます。何を書いてもパソコンが壊れることはないので、安心してどんどん実行してみましょう。"
        },
        { "type": "heading", "body": "print で表示してみよう" },
        {
          "type": "text",
          "body": "画面に文字を表示するには `print()` を使います。表示したい文字を `\"`(ダブルクォート)で囲んで、カッコの中に入れます。"
        },
        { "type": "code", "code": "print(\"こんにちは\")", "caption": "いちばん短いPythonプログラム" },
        {
          "type": "text",
          "body": "`\"` で囲んだ文字のかたまりを**文字列**(もじれつ: 文字の並びのこと)と呼びます。"
        },
        {
          "type": "note",
          "style": "warning",
          "body": "クォート(`\"`)は**2つで1組**です。閉じ忘れるとエラーになります。エラーが出ても大丈夫、直せばいいだけです。"
        },
        { "type": "heading", "body": "2行書けば2回表示される" },
        {
          "type": "text",
          "body": "print を2行書くと、上から順に2回表示されます。実行例で確かめてみましょう。"
        }
      ],
      "example": {
        "code": "print(\"こんにちは\")\nprint(\"Pythonをはじめよう\")",
        "note": "「エディタで試す」を押して、文字を好きな言葉に変えて実行してみましょう。"
      },
      "exercise": {
        "prompt": [
          {
            "type": "text",
            "body": "画面に、次の1行だけを表示するプログラムを書いてください(`!` は半角です)。"
          },
          { "type": "code", "code": "こんにちは、Python!", "caption": "期待する出力" }
        ],
        "starterCode": "# ここに print を使ったコードを書いてください\n",
        "testCode": "_lines = [_l.rstrip() for _l in __stdout__.rstrip(\"\\n\").split(\"\\n\")] if __stdout__.strip() else []\nassert len(_lines) > 0, \"何も表示されていません。print() を使って表示してみましょう\"\nassert len(_lines) == 1, \"表示が1行ではありません。print は1つだけ書きましょう\"\nassert _lines[0] == \"こんにちは、Python!\", \"表示された文字が違います。「こんにちは、Python!」と正確に表示しましょう(記号も含めて)\"",
        "hints": [
          [
            {
              "type": "text",
              "body": "表示には `print()` を使います。表示したい文字を `\"` で囲んで、カッコの中に入れます。"
            }
          ],
          [
            {
              "type": "text",
              "body": "次のように書きます。カッコとクォートの対応に注意しましょう。"
            },
            { "type": "code", "code": "print(\"こんにちは、Python!\")" }
          ]
        ],
        "solution": {
          "code": "print(\"こんにちは、Python!\")",
          "explanation": [
            {
              "type": "text",
              "body": "表示したい文字列を `\"` で囲み、`print()` のカッコに入れます。`!` などの記号も文字列の一部としてそのまま表示されます。"
            }
          ]
        }
      }
    }
  ]
}
```

---

## 6. バリデーションルール(実装・検証時のチェックリスト)

機械検証(exercise-validator / 将来のチェックスクリプト)は最低限次を確認する:

1. JSONとしてパース可能(UTF-8、コメント・末尾カンマなし)
2. 必須フィールドが全て存在し、型が一致する
3. `id` 形式(`^ch\d{2}$` / `^ch\d{2}-\d{2}$`)と、番号・配列位置・ファイル名の整合
4. `lessons` は3〜5件、`objectives` は1〜3件、`hints` はちょうど2件
5. `starterCode`・`example.code`・`solution.code` に `input(` を含まない。`import` は `testCode` 内の `io`/`sys` のみ
6. `solution.code` を実行 → `testCode` が合格すること
7. `starterCode` を無変更で実行 → `testCode` が不合格になること
