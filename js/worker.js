import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.2/full/pyodide.mjs";
const VERSION = "314.0.2";
const indexURL = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
let activeRunId = null;
const INPUT_GUARD = `import builtins\ndef _input_disabled(prompt=""):\n    raise RuntimeError("この学習サイトでは input() は使えません。かわりに、変数に値を代入してください。(例: name = 'たろう')")\nbuiltins.input = _input_disabled`;
const EXERCISE = `import io, sys, traceback\n_user_stdout = io.StringIO()\n_original_stdout = sys.stdout\ntry:\n    sys.stdout = _user_stdout\n    exec(__user_code__)\nexcept BaseException:\n    __judge_result__ = ("user-error", traceback.format_exc())\nelse:\n    __stdout__ = _user_stdout.getvalue()\n    try:\n        sys.stdout = io.StringIO()\n        exec(__test_code__)\n    except AssertionError as _error:\n        __judge_result__ = ("failed", str(_error))\n    except BaseException:\n        __judge_result__ = ("judge-error", traceback.format_exc())\n    else:\n        __judge_result__ = ("passed", "")\nfinally:\n    sys.stdout = _original_stdout`;
function formatError(error) { const message = error?.message || String(error); const lines = message.split("\n"); const user = lines.findIndex(line => line.includes('File "<exec>"')); return user > 0 ? ["Traceback (most recent call last):", ...lines.slice(user)].join("\n") : message; }
async function init() { const pyodide = await loadPyodide({ indexURL }); pyodide.setStdout({ batched:text => self.postMessage({ type:"stdout", runId:activeRunId, text }) }); pyodide.setStderr({ batched:text => self.postMessage({ type:"stderr", runId:activeRunId, text }) }); pyodide.runPython(INPUT_GUARD); self.postMessage({ type:"ready", pythonVersion:pyodide.runPython("import sys; sys.version.split()[0]") }); return pyodide; }
const ready = init(); ready.catch(error => self.postMessage({ type:"init-error", error:String(error) }));
self.onmessage = async ({ data:msg }) => {
  if (!msg || !["run", "judge"].includes(msg.type)) return; activeRunId = msg.runId;
  try {
    const pyodide = await ready; const globals = pyodide.globals.get("dict")();
    try {
      if (msg.type === "run") { const result = await pyodide.runPythonAsync(msg.code, { globals }); if (result?.destroy) result.destroy(); self.postMessage({ type:"done", runId:msg.runId, ok:true }); }
      else { globals.set("__user_code__", msg.code); globals.set("__test_code__", msg.testCode); await pyodide.runPythonAsync(EXERCISE, { globals }); const proxy = globals.get("__judge_result__"); const result = proxy.toJs(); proxy.destroy(); const [status, detail] = result; if (status === "passed") self.postMessage({ type:"done", runId:msg.runId, ok:true, passed:true }); else self.postMessage({ type:"done", runId:msg.runId, ok:false, passed:false, error: status === "failed" ? detail : formatError({message:detail}), judgeError: status === "judge-error" }); }
    } finally { globals.destroy(); }
  } catch (error) { self.postMessage({ type:"done", runId:msg.runId, ok:false, error:formatError(error) }); }
  finally { activeRunId = null; }
};
