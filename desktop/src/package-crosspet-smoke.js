// SPDX-License-Identifier: AGPL-3.0-only
"use strict";

// Explicit package probe, like package-koffi-smoke: never initialize integrations,
// credentials, ~/.clawd or the user's profile while checking the shipped bridge.
function maybeRunCrosspetBridgeSmoke({ app, BrowserWindow }) {
  if (!process.argv.includes("--crosspet-bridge-smoke")) return false;
  const fs = require("node:fs");
  const path = require("node:path");
  const directory = process.env.CROSSPET_STATE_DIR;
  if (!directory || !path.isAbsolute(directory) || !process.env.CROSSPET_HOST_PID) {
    app.exit(1); return true;
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  app.setPath("userData", path.join(directory, "electron-profile"));
  app.setName("CrossPet Bridge Package Probe");
  const { startCrosspetService, backgroundPetWindowFactory } = require("./crosspet-service");
  let service;
  const windows = new Map();
  const loaded = new Set();
  let anchor = null;
  const report = () => fs.writeFileSync(path.join(directory, "smoke-report.json"), JSON.stringify({
    arch: process.arch, loaded: [...loaded].sort(), anchor,
  }));
  const open = (name) => {
    if (windows.has(name)) return;
    const win = new BrowserWindow({ show: false, width: 320, height: 200, webPreferences: { sandbox: true } });
    windows.set(name, win);
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<title>${name}</title><p>${name}</p>`))
      .then(() => { loaded.add(name); report(); })
      .catch(() => app.exit(1));
  };
  const timeout = setTimeout(() => app.exit(1), 20000);
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => { clearTimeout(timeout); service?.stop(); });
  app.whenReady().then(() => {
    // Check the invisible compatibility renderer used by the combined native app.
    const HiddenWindow = backgroundPetWindowFactory(BrowserWindow);
    const hidden = new HiddenWindow({ width: 20, height: 20 });
    hidden.show();
    if (hidden.isVisible()) throw new Error("Compatibility pet unexpectedly visible");
    windows.set("compatibility", hidden);
    service = startCrosspetService({
      getSessions: () => new Map([["probe", { agentId: "codex", rawSessionId: "probe", state: "working", updatedAt: Date.now() }]]),
      getPendingPermissions: () => [{ sessionId: "probe" }],
      getConnections: () => [{ profileId: "probe-profile", status: "connected" }],
      openDashboard: () => open("dashboard"), openSettings: tab => open(tab),
      showApprovals: () => open("approvals"),
      setAnchor: bounds => { anchor = bounds; report(); }, quit: () => app.quit(),
    });
    report();
  }).catch(error => { console.error(error); app.exit(1); });
  return true;
}
module.exports = { maybeRunCrosspetBridgeSmoke };
