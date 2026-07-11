/*
 * prototype/worker.js — Pyodide 実行 Worker(Phase 1 技術検証・使い捨てプロトタイプ)
 *
 * ・Pyodide 314.0.0 以降、classic worker(importScripts 方式)はサポート廃止のため、
 *   ES module worker(new Worker(url, { type: "module" }))として動かす。
 * ・バージョンは 314.0.2(2026-06-30 リリース、検証時点の最新安定版)にピン留め。
 *   ※ static import の URL は文字列リテラルである必要があるため、
 *     下の PYODIDE_VERSION と import URL の 2 箇所を同時に更新すること。
 */

import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.2/full/pyodide.mjs";

const PYODIDE_VERSION = "314.0.2";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/*
 * input() ガード:
 * Worker 内には window.prompt が存在しないため、デフォルトのまま input() を呼ぶと
 * ユーザーには原因のわからない低レベルの I/O エラーになる。
 * builtins.input を差し替えて、日本語で「変数代入で値を与える」方針へ誘導する。
 * (関数の __globals__ は定義元の名前空間を指すため、実行ごとの fresh globals でも有効)
 */
const INPUT_GUARD_PY = `
import builtins

def _input_disabled(prompt=""):
    raise RuntimeError(
        "この学習サイトでは input() は使えません。"
        "かわりに、変数に値を代入してから実行してください。"
        '(例: name = "たろう")'
    )

builtins.input = _input_disabled
`;

async function init() {
  const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

  // stdout / stderr は batched 方式でキャプチャし、行単位で即時 postMessage する。
  // Python が同期実行中でもメインスレッド側は空いているため、リアルタイムに表示される。
  pyodide.setStdout({ batched: (text) => self.postMessage({ type: "stdout", text }) });
  pyodide.setStderr({ batched: (text) => self.postMessage({ type: "stderr", text }) });

  pyodide.runPython(INPUT_GUARD_PY);

  self.postMessage({
    type: "ready",
    pyodideVersion: pyodide.version,
    pythonVersion: pyodide.runPython("import sys; sys.version.split()[0]"),
  });
  return pyodide;
}

const readyPromise = init();
readyPromise.catch((err) => {
  self.postMessage({ type: "init-error", error: String(err) });
});

/*
 * Python の例外メッセージから Pyodide 内部フレーム(_pyodide/_base.py 等)を取り除き、
 * ユーザーコード(<exec>)以降の traceback だけを返す。
 * <exec> が見つからない場合は安全側に倒して全文を返す。
 */
function formatPythonError(err) {
  const message = err && err.message ? err.message : String(err);
  const lines = message.split("\n");
  const firstUserFrame = lines.findIndex((line) => line.includes('File "<exec>"'));
  if (firstUserFrame > 0) {
    return ["Traceback (most recent call last):", ...lines.slice(firstUserFrame)].join("\n");
  }
  return message;
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "run") return;

  let pyodide;
  try {
    pyodide = await readyPromise;
  } catch {
    return; // 初期化失敗は init-error で通知済み
  }

  let globalsProxy = null;
  try {
    // 実行ごとに新しい globals を使い、前回実行の変数が残らないようにする
    globalsProxy = pyodide.globals.get("dict")();
    const result = await pyodide.runPythonAsync(msg.code, { globals: globalsProxy });
    // 最後の式の値は表示しない(print() ベースの学習方針)。
    // PyProxy が返った場合はメモリリーク防止のため破棄する。
    if (result && typeof result.destroy === "function") {
      result.destroy();
    }
    self.postMessage({ type: "done", runId: msg.runId, ok: true });
  } catch (err) {
    self.postMessage({
      type: "done",
      runId: msg.runId,
      ok: false,
      error: formatPythonError(err),
    });
  } finally {
    if (globalsProxy) {
      globalsProxy.destroy();
    }
  }
};
