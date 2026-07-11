/*
 * prototype/main.js — メインスレッド側(Phase 1 技術検証・使い捨てプロトタイプ)
 *
 * 役割:
 * ・Worker のライフサイクル管理(生成 → ready 待ち → 実行 → 10秒タイムアウトで terminate → 再生成)
 * ・CodeMirror 6 エディタの初期化(CDN ロード失敗時は textarea にフォールバック)
 * ・stdout / stderr / traceback の表示(XSS 防止のため必ず textContent で挿入)
 */

const TIMEOUT_MS = 10000;

const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const runBtn = document.getElementById("run-btn");
const clearBtn = document.getElementById("clear-btn");
const editorHost = document.getElementById("editor");
const fallbackTextarea = document.getElementById("fallback-editor");

const SAMPLES = {
  basic: [
    'name = "たろう"  # input() のかわりに変数に値を代入します',
    'print("こんにちは、" + name + "さん!")',
    "",
    "for i in range(3):",
    '    print("カウント:", i)',
    "",
  ].join("\n"),
  loop: [
    'print("これから無限ループに入ります(約10秒後に自動停止すれば検証OK)")',
    "while True:",
    "    pass",
    "",
  ].join("\n"),
  error: [
    "def divide(a, b):",
    "    return a / b",
    "",
    "print(divide(10, 0))",
    "",
  ].join("\n"),
  input: [
    'name = input("あなたの名前: ")',
    'print("こんにちは、" + name + "さん")',
    "",
  ].join("\n"),
};

let worker = null;
let workerReady = false;
let running = false;
let currentRunId = 0;
let timeoutId = null;
let editorView = null; // CodeMirror の EditorView(ロード成功時のみ)

// ---------------------------------------------------------------- UI ヘルパー

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status " + kind;
}

// 出力エリアへの挿入は必ず textContent(XSS 防止)
function appendOutput(text, cls) {
  const span = document.createElement("span");
  if (cls) {
    span.className = cls;
  }
  span.textContent = text;
  outputEl.appendChild(span);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function getCode() {
  if (editorView) {
    return editorView.state.doc.toString();
  }
  return fallbackTextarea.value;
}

function setCode(code) {
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: code },
    });
  } else {
    fallbackTextarea.value = code;
  }
}

// ------------------------------------------------------- Worker ライフサイクル

function createWorker() {
  workerReady = false;
  running = false;
  runBtn.disabled = true;
  setStatus("実行環境を準備しています…(初回は数十MBのダウンロードが発生します)", "loading");

  // import.meta.url 基準の相対解決。サブパス配下(GitHub Pages)でも壊れない。
  // Pyodide 314 系は classic worker 非対応のため type: "module" が必須。
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (event) => {
    setStatus("Worker でエラーが発生しました: " + (event.message || "詳細不明"), "error");
  };
}

function handleWorkerMessage(event) {
  const msg = event.data;
  switch (msg.type) {
    case "ready":
      workerReady = true;
      runBtn.disabled = false;
      setStatus(
        `準備完了(Pyodide v${msg.pyodideVersion} / Python ${msg.pythonVersion})`,
        "ready"
      );
      break;
    case "init-error":
      setStatus("実行環境の初期化に失敗しました: " + msg.error, "error");
      break;
    case "stdout":
      appendOutput(msg.text + "\n");
      break;
    case "stderr":
      appendOutput(msg.text + "\n", "stderr");
      break;
    case "done":
      if (msg.runId !== currentRunId || !running) {
        return; // terminate 済みの古い実行結果は無視
      }
      clearTimeout(timeoutId);
      running = false;
      runBtn.disabled = false;
      if (!msg.ok) {
        appendOutput(msg.error + "\n", "stderr");
      }
      appendOutput("--- 実行終了 ---\n", "system");
      setStatus("準備完了(実行できます)", "ready");
      break;
    default:
      break;
  }
}

function runCode() {
  if (!workerReady || running) {
    return;
  }
  running = true;
  runBtn.disabled = true;
  currentRunId += 1;
  const runId = currentRunId;

  appendOutput(`--- 実行 #${runId} ---\n`, "system");
  setStatus("実行中…(10秒を超えると自動停止します)", "running");
  worker.postMessage({ type: "run", runId, code: getCode() });
  timeoutId = setTimeout(() => handleTimeout(runId), TIMEOUT_MS);
}

function handleTimeout(runId) {
  if (runId !== currentRunId || !running) {
    return; // すでに完了している(done とタイマーの競合)
  }
  running = false;
  worker.terminate(); // WASM 内の同期ループは割り込めないため Worker ごと破棄する
  appendOutput(
    "[タイムアウト] 実行が10秒を超えたため強制停止しました。" +
      "無限ループ(while True など)がないか確認してください。\n",
    "system-error"
  );
  // 再生成 = Pyodide の再ロード。2回目以降はブラウザの HTTP キャッシュにより高速。
  createWorker();
}

// ------------------------------------------------------------ CodeMirror 6

async function setupEditor() {
  try {
    // bare specifier は index.html の import map(esm.sh)で解決される。
    // codemirror(basicSetup)と @codemirror/view・commands を「別々に」import しても
    // 同一インスタンスに解決されること自体が import map 構成の検証になっている。
    const [{ basicSetup, EditorView }, { python }, { keymap }, { indentWithTab }] =
      await Promise.all([
        import("codemirror"),
        import("@codemirror/lang-python"),
        import("@codemirror/view"),
        import("@codemirror/commands"),
      ]);
    editorView = new EditorView({
      doc: SAMPLES.basic,
      extensions: [basicSetup, python(), keymap.of([indentWithTab])],
      parent: editorHost,
    });
  } catch (err) {
    // CDN 障害時などは textarea にフォールバック(実行機能の検証は継続できる)
    console.warn("CodeMirror のロードに失敗したため textarea にフォールバックします:", err);
    editorHost.hidden = true;
    fallbackTextarea.hidden = false;
    fallbackTextarea.value = SAMPLES.basic;
  }
}

// ---------------------------------------------------------------- 初期化

runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", () => {
  outputEl.replaceChildren();
});
for (const btn of document.querySelectorAll("[data-sample]")) {
  btn.addEventListener("click", () => setCode(SAMPLES[btn.dataset.sample]));
}

setupEditor();
createWorker();
