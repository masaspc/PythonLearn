const TIMEOUT_MS = 10000;
export class PythonRunner {
  constructor({ onStatus, onOutput, onTimeout }) { this.onStatus = onStatus; this.onOutput = onOutput; this.onTimeout = onTimeout; this.worker = null; this.ready = false; this.busy = false; this.id = 0; this.timer = null; this.waiters = new Map(); this.create(); }
  create() {
    this.ready = false; this.busy = false; this.onStatus("実行環境を準備しています…（初回は少し時間がかかります）", "loading");
    this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (event) => this.message(event.data);
    this.worker.onerror = (event) => { this.onStatus(`実行環境のエラー: ${event.message || "詳細不明"}`, "error"); };
  }
  message(msg) {
    if (msg.type === "ready") { this.ready = true; this.onStatus(`準備完了（Python ${msg.pythonVersion}）`, "ready"); return; }
    if (msg.type === "init-error") { this.onStatus(`実行環境の初期化に失敗しました: ${msg.error}`, "error"); return; }
    if (msg.type === "stdout" || msg.type === "stderr") { if (this.busy && msg.runId === this.id) this.onOutput(msg.text + "\n", msg.type === "stderr" ? "stderr" : ""); return; }
    if (msg.type === "done") {
      if (!this.busy || msg.runId !== this.id) return;
      clearTimeout(this.timer); this.busy = false; const resolve = this.waiters.get(msg.runId); this.waiters.delete(msg.runId);
      this.onStatus("準備完了（実行できます）", "ready"); if (resolve) resolve(msg);
    }
  }
  execute(type, payload) {
    if (!this.ready || this.busy) return Promise.reject(new Error("実行環境の準備中です"));
    this.busy = true; const runId = ++this.id; this.onStatus(type === "judge" ? "答えを確認しています…" : "実行中…（10秒で自動停止します）", "running");
    this.worker.postMessage({ type, runId, ...payload });
    return new Promise((resolve) => { this.waiters.set(runId, resolve); this.timer = setTimeout(() => this.timeout(runId), TIMEOUT_MS); });
  }
  timeout(runId) {
    if (!this.busy || runId !== this.id) return;
    this.busy = false; this.worker.terminate(); const resolve = this.waiters.get(runId); this.waiters.delete(runId);
    const result = { type:"done", runId, ok:false, timedOut:true, error:"実行が10秒を超えたため強制停止しました。無限ループがないか確認してください。" };
    this.onTimeout(result); if (resolve) resolve(result); this.create();
  }
  run(code) { return this.execute("run", { code }); }
  judge(code, testCode) { return this.execute("judge", { code, testCode }); }
}
