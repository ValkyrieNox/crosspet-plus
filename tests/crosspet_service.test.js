"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startCrosspetService } = require("../desktop/src/crosspet-service");

test("service publishes host identity and accepts only fresh owned navigation commands", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crosspet-service-"));
  const prior = { dir: process.env.CROSSPET_STATE_DIR, pid: process.env.CROSSPET_HOST_PID };
  process.env.CROSSPET_STATE_DIR = dir;
  process.env.CROSSPET_HOST_PID = String(process.pid);
  const calls = [];
  const service = startCrosspetService({
    getSessions: () => new Map(), getPendingPermissions: () => [],
    getConnections: () => [{ profileId: "saved", status: "connected" }],
    getInterfaceState: () => ({ trayVisible: false, doNotDisturb: false }),
    pauseTasks: () => calls.push("paused"), resumeTasks: () => calls.push("resumed"),
    openDashboard: () => calls.push("dashboard"), openSettings: tab => calls.push(tab ?? "settings"),
    showApprovals: () => calls.push("approvals"), setAnchor: b => calls.push(b), quit: () => calls.push("quit"),
  });
  try {
    const snapshot = JSON.parse(fs.readFileSync(path.join(dir, "clawd-snapshot.json")));
    assert.equal(snapshot.hostPid, process.pid);
    assert.equal(snapshot.connections[0].status, "connected");
    assert.equal(snapshot.interface.trayVisible, false);
    const send = (name, action, extra = {}) => fs.writeFileSync(path.join(dir, "clawd-commands", name + ".json"), JSON.stringify({ instance: snapshot.instance, at: Date.now() / 1000, action, ...extra }));
    send("command1", "dashboard"); send("command2", "agents"); send("command3", "connections"); send("command4", "approvals");
    send("invalid1", "allow"); send("invalid2", "dashboard", { instance: "old" });
    send("invalid3", "dashboard", { at: 0 });
    send("command5", "settings"); send("command6", "pause-tasks"); send("command7", "resume-tasks");
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.deepEqual(calls, ["dashboard", "agents", "remote-ssh", "approvals", "settings", "paused", "resumed"]);
  } finally {
    service.stop();
    for (const [key, value] of [["CROSSPET_STATE_DIR", prior.dir], ["CROSSPET_HOST_PID", prior.pid]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(fs.existsSync(path.join(dir, "clawd-snapshot.json")), false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
