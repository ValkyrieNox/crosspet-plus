// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crosspet-package-smoke-"));
  const root = path.resolve(__dirname, "..");
  const packaged = process.argv[2];
  const executable = packaged || require("../desktop/node_modules/electron");
  const args = [...(packaged ? [] : [path.join(root, "desktop")]), "--crosspet-bridge-smoke"];
  const env = { ...process.env, CROSSPET_STATE_DIR: dir, CROSSPET_HOST_PID: String(process.pid) };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, args, { env, stdio: ["ignore", "ignore", "pipe"] });
  let errors = "", ended = false;
  child.stderr.on("data", data => { errors = (errors + data).slice(-6000); });
  const exit = new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", (code, signal) => { ended = true; resolve({ code, signal }); }); });
  async function waitFor(read) {
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
      const result = read();
      if (result) return result;
      if (ended) throw new Error("Electron exited before bridge ready: " + errors);
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    throw new Error("Timed out waiting for package probe: " + errors);
  }
  function json(name) { try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { return null; } }
  try {
    const snapshot = await waitFor(() => json("clawd-snapshot.json"));
    assert.equal(snapshot.hostPid, process.pid);
    assert.equal(snapshot.sessions[0].character, "gpt");
    assert.equal(snapshot.pendingCount, 1);
    assert.equal(snapshot.connections[0].status, "connected");
    let sequence = 0;
    function send(action, extra = {}) {
      fs.writeFileSync(path.join(dir, "clawd-commands", `command-${sequence++}.json`), JSON.stringify({
        instance: snapshot.instance, at: Date.now() / 1000, action, ...extra,
      }));
    }
    for (const action of ["dashboard", "agents", "connections", "approvals"]) send(action);
    send("allow"); // Must never become a bridge approval decision.
    const bounds = { x: -300, y: -320, width: 200, height: 300 };
    send("anchor", { bounds });
    const report = await waitFor(() => { const r = json("smoke-report.json"); return r?.loaded?.length === 4 && r.anchor ? r : null; });
    assert.deepEqual(report.loaded, ["agents", "approvals", "dashboard", "remote-ssh"]);
    assert.deepEqual(report.anchor, bounds);
    send("quit");
    const result = await exit;
    assert.equal(result.code, 0, errors);
    assert.equal(fs.existsSync(path.join(dir, "clawd-snapshot.json")), false);
    console.log(`PASS ${report.arch} Electron package: owned heartbeat, four isolated fixture windows, hidden compatibility renderer, anchor, graceful cleanup`);
  } finally {
    if (!ended) child.kill("SIGTERM");
    await exit.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
