# 設計判断の記録(docs/DESIGN.md)

このファイルには実装上の重要な技術判断を追記していく。

---

## Phase 1: Pyodide 実行基盤 + CodeMirror 6 の技術検証(2026-07-11)

検証プロトタイプ: `prototype/index.html` + `prototype/main.js` + `prototype/worker.js`
(使い捨て。本番コードは `js/` 配下に別途実装する)

### 1. Pyodide のバージョンと ロード方式

| 項目 | 採用内容 |
|---|---|
| バージョン | **v314.0.2**(2026-06-30 リリース、検証時点の最新安定版)にピン留め |
| CDN | jsDelivr 公式 CDN: `https://cdn.jsdelivr.net/pyodide/v314.0.2/full/` |
| ロード方式 | **ES module worker** 内で `import { loadPyodide } from ".../pyodide.mjs"` |
| Python | 3.14.2(Pyodide 314 系は CPython 3.14 ベース。バージョン番号方式が 0.x 系から CPython 連動に変更された) |

**重要**: Pyodide **314.0.0 から classic worker(`importScripts("pyodide.js")` 方式)はサポート廃止**
(`pyodide.asm.js` → `pyodide.asm.mjs` へのリネームに伴う破壊的変更)。
Worker は必ず `new Worker(url, { type: "module" })` で生成し、`pyodide.mjs` を static import する。
`type: "module"` を忘れると読み込みに失敗する。ES module worker は現行の主要ブラウザすべてで利用可能。

- CDN URL の実在は HTTP 200 で確認済み(`pyodide.js` / `pyodide.mjs` とも)。
- 初回ロードは数十 MB のダウンロードが発生するため、ローディング表示(「実行環境を準備しています…」)
  と実行ボタンの無効化を必ず行う。ready 通知(worker → main の `ready` メッセージ)で有効化する。
- 2 回目以降はブラウザの HTTP キャッシュが効くため大幅に高速化される(jsDelivr はバージョン付き URL に
  長期キャッシュヘッダを付与する。バージョンをピン留めする理由のひとつ)。
- Worker の URL は `new URL("./worker.js", import.meta.url)` で相対解決する。
  GitHub Pages のサブパス(`https://<user>.github.io/<repo>/`)配下でも壊れない。

### 2. stdout / stderr キャプチャの実装方式

**採用: `pyodide.setStdout({ batched })` / `pyodide.setStderr({ batched })` + 逐次 `postMessage`**

```js
pyodide.setStdout({ batched: (text) => self.postMessage({ type: "stdout", text }) });
pyodide.setStderr({ batched: (text) => self.postMessage({ type: "stderr", text }) });
```

- `batched` は改行またはフラッシュのタイミングで行単位の文字列(改行なし)を受け取る。
  表示側で `text + "\n"` を追記する。
- 採用理由:
  - `raw`(1 バイトごとのコールバック)より呼び出し回数が桁違いに少なく、マルチバイト文字(日本語)の
    分断も起きない。学習サイトの用途(`print()` 出力の表示)には行単位で十分。
  - Worker 内の Python が同期実行中でも、`postMessage` したメッセージはメインスレッド側で順次処理される
    ため、実行完了を待たずに**リアルタイムで出力が表示される**(無限ループ検証サンプルの
    「ループ前の print が即座に見える」ことで確認可能)。
- 実行結果をまとめて 1 回で返す方式(実行終了時に全文送信)は、無限ループ時に途中出力が一切見えなく
  なるため不採用。
- **例外 traceback**: `runPythonAsync()` を try/catch し、`err.message` に含まれる完全な traceback を
  `done` メッセージで返す。Pyodide 内部フレーム(`_pyodide/_base.py` 等)が先頭に含まれるため、
  ユーザーコードのフレーム `File "<exec>"` 以降だけにトリムして表示する
  (見つからない場合は安全側に倒して全文表示)。→ `prototype/worker.js` の `formatPythonError()`
- **実行ごとに新しい globals**(`pyodide.globals.get("dict")()`)を渡し、前回実行の変数が残って
  初心者を混乱させないようにする。使用後は PyProxy を `destroy()` してリークを防ぐ。

### 3. タイムアウトと Worker terminate / 再生成の設計

**採用: メインスレッド側で 10 秒の `setTimeout` → 期限超過で `worker.terminate()` → 新 Worker を即生成**

- WASM 内で同期実行中の Python には外から割り込めないため、Worker ごと破棄するのが唯一確実な停止手段。
- **`pyodide.setInterruptBuffer()`(SharedArrayBuffer 方式)は不採用**: SharedArrayBuffer には
  COOP/COEP ヘッダ(cross-origin isolation)が必要だが、**GitHub Pages ではレスポンスヘッダを設定
  できない**ため使えない。この制約は本番でも同じ。
- 実行要求に `runId`(連番)を付け、`done` 応答の `runId` が一致する場合のみ処理する。
  これにより「タイムアウト直前に完了した実行」「terminate 前に届いた古い応答」との競合を排除する。
- タイムアウト時の UX:
  1. `[タイムアウト] 実行が10秒を超えたため強制停止しました。無限ループ(while True など)がないか
     確認してください。` を出力エリアに表示
  2. ステータスを「実行環境を準備しています…」に戻し、実行ボタンを無効化
  3. 新 Worker の `ready` 到着で再度有効化
- **再生成コスト = Pyodide の再ロード**。ただし 2 回目以降は HTTP キャッシュから読むため、
  再初期化は実測で数秒オーダー(初回の数十 MB ダウンロードは発生しない)。
- 将来の改善案(本番で必要になったら検討):
  - 予備 Worker をバックグラウンドで温めておき、タイムアウト時に即座に切り替える
    (メモリ使用量が約 2 倍になるトレードオフ。スマートフォンでは注意)
  - Service Worker + Cache Storage による明示的なキャッシュ管理
- 注意: バックグラウンドタブでは `setTimeout` がスロットリングされ、タイムアウト判定が遅れることが
  ある(実害は小さいが、テスト時に不思議に見えるので記録しておく)。

### 4. `input()` の扱い(調査結果と対処)

- **何もしない場合に起きること**: Worker 内には `window.prompt` が存在しないため、`input()` を呼ぶと
  低レベルの I/O エラー(OSError 系)になる。メッセージは初心者には原因が理解できない。
  (メインスレッド実行なら Pyodide は `prompt()` にフォールバックするが、Worker では不可能)
- **採用した対処**: Worker 初期化時に `builtins.input` を差し替え、日本語の明確なメッセージで
  `RuntimeError` を送出する:

  > この学習サイトでは input() は使えません。かわりに、変数に値を代入してから実行してください。(例: name = "たろう")

  - traceback の最終行にこのメッセージが表示され、カリキュラムの方針(変数代入で入力値を与える)へ
    自然に誘導できる。
  - `builtins` を書き換えるため、実行ごとの fresh globals でも有効(関数の `__globals__` は定義元の
    名前空間を参照するため)。
- 不採用とした代替案:
  - **実行前の静的検出(正規表現で `input(` を探す)**: コメントや文字列内の誤検出があり、
    確実性で劣る。エラーメッセージの改善としては builtins 差し替えで十分。
  - **同期 input の実現(SharedArrayBuffer + Atomics.wait で main からの入力を待つ)**:
    §3 と同じ理由(GitHub Pages で COOP/COEP 不可)で不可能。

### 5. CodeMirror 6 の CDN ロード方式

**採用: esm.sh + import map(全 @codemirror / @lezer パッケージを「依存 external 化」してピン留め)**

- CodeMirror 6 は多数のパッケージ(@codemirror/state, view, language, …)が相互依存しており、
  CDN から素朴に複数エントリを import すると **`@codemirror/state` が二重にロードされ、
  「Unrecognized extension value」エラーでエディタが壊れる**ことが知られている。
- 対策として esm.sh の **`*` プレフィックス**(例: `https://esm.sh/*codemirror@6.0.2`)を使う。
  これは「そのパッケージの依存をバンドルせず bare specifier のまま残す」指定で、残った bare specifier
  を **import map** が一意の URL に解決する。これにより各パッケージのインスタンスが必ず 1 つになる。
  (esm.sh のビルド済みファイルが `from "@codemirror/view"` のような bare import を保持することを
  実レスポンスで確認済み)
- import map は `prototype/index.html` の `<script type="importmap">` に記載。依存閉包のすべて
  (@codemirror 8 パッケージ + @lezer 4 パッケージ + 末端依存 4 つ)をピン留めする必要がある:

  | パッケージ | ピン留めバージョン(2026-07-11 時点の latest) |
  |---|---|
  | codemirror | 6.0.2 |
  | @codemirror/autocomplete | 6.20.3 |
  | @codemirror/commands | 6.10.4 |
  | @codemirror/language | 6.12.4 |
  | @codemirror/lang-python | 6.2.1 |
  | @codemirror/lint | 6.9.7 |
  | @codemirror/search | 6.7.1 |
  | @codemirror/state | 6.7.1 |
  | @codemirror/view | 6.43.6 |
  | @lezer/common | 1.5.2 |
  | @lezer/highlight | 1.2.3 |
  | @lezer/lr | 1.4.10 |
  | @lezer/python | 1.1.19 |
  | @marijn/find-cluster-break | 1.0.3 |
  | crelt | 1.0.7 |
  | style-mod | 4.1.3 |
  | w3c-keyname | 2.2.8 |

  末端依存(@marijn/find-cluster-break, crelt, style-mod, w3c-keyname)は依存を持たないため
  `*` なしの通常 URL でよい。
- 不採用とした代替案:
  - **esm.sh を素のまま複数 import**(import map なし): esm.sh 側の解決状況によっては動くが、
    再ビルドやバージョン解決の揺れで二重ロードが再発しうる。ピン留めの確実性で劣る。
  - **`?bundle` オプション**: エントリごとに依存をバンドル内に複製するため、複数エントリ
    (codemirror と lang-python)を使う時点で二重ロードが確定する。
- プロトタイプでは dynamic import + try/catch とし、CDN 障害時は素の textarea にフォールバックして
  実行機能の検証を継続できるようにした(本番でも同様の縮退が望ましい)。
- `basicSetup`(行番号・ハイライト等一式)+ `python()` + `keymap.of([indentWithTab])` で
  役割定義の要件(ハイライト・行番号・Tab インデント)を満たせることを確認する構成にした。

### 6. 本番実装(js/runner.js 等への分割)に向けた注意点・落とし穴

1. **import map は HTML 文書ごとに必要**。`index.html` と `lesson.html` の両方に同一の import map を
   記載し、更新時は必ず両方を同期すること(`<script type="importmap" src=...>` 外部化はブラウザ
   サポートが揃っていないため不可)。import map は最初の module script より前に置くこと。
2. **Worker 生成時の `type: "module"` を忘れない**(Pyodide 314 系は classic worker 非対応)。
   `js/runner.js` から `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`。
3. **Pyodide のバージョン更新は worker.js 内の 2 箇所**(static import の URL リテラルと
   `PYODIDE_VERSION` 定数)を同時に更新する。
4. **出力の DOM 挿入は必ず `textContent`**。ユーザーコード・Python 出力・traceback はすべて
   信頼できない文字列として扱う(XSS)。`innerHTML` 禁止。
5. **`runId` による応答の対応付けを必ず行う**。terminate 直前に届く古い `done`、タイムアウトと完了の
   競合は runId + running フラグで破棄する。
6. **PyProxy のリーク対策**: `runPythonAsync` の戻り値・globals dict は `destroy()` する。
7. **`loadPackagesFromImports()` は今回意図的に不使用**(カリキュラムは標準ライブラリのみ)。
   将来 numpy 等を使う場合、パッケージのダウンロード時間が 10 秒タイムアウトに食い込み
   「実行していないのにタイムアウト」が起きるため、タイムアウト計測の開始点を分離する必要がある。
8. **esm.sh は単一障害点**。CDN 障害時はエディタが textarea に縮退する設計を本番にも引き継ぐ。
   Pyodide(jsDelivr)と esm.sh は独立障害なので、片方だけ落ちても最低限の学習は継続できる。
9. **`file://` では動かない**(module worker / import map / fetch の制約)。動作確認は必ず
   `python -m http.server` 経由で行う。README にも明記する。
10. **Python 3.14 前提**のエラーメッセージ・挙動でカリキュラムを書くこと(traceback の文言は
    CPython バージョンで変わることがある。content-writer への申し送り事項)。
11. タイムアウト再生成中は実行ボタンを無効化し、`ready` まで待たせる(連打対策)。進捗保存等の
    localStorage 処理は Worker と無関係にメインスレッドで行えるため影響なし。
