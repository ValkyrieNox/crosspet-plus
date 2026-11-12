// SPDX-License-Identifier: AGPL-3.0-only
"use strict";

// Clawd is an optional task/approval backend for the original CrossPet app.
// Export only observation fields; all approval decisions stay in Clawd's
// existing trusted approval windows. The command inbox has no allow/deny API.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { characterForModel } = require("./crosspet-model");
const { getSubagentVisualCount } = require("./subagent-lifecycle");

const AGENTS = {
  "claude-code":["claude","claude-cli"], codex:["gpt","codex"],
  "deepseek-harness":["deepseek","deepseek"], "gemini-cli":["gemini","gemini"],
  "antigravity-cli":["gemini","antigravity"], "qwen-code":["qwen","qwen"],
  "grok-build":["grok","grok"], zcode:["glm","zcode"],
  "cursor-agent":["current","cursor"], workbuddy:["current","workbuddy"],
  hermes:["current","hermes"], "kimi-cli":["current","kimi"]
};
const TOOL_POSES = [
  [/(?:^|[._:])(?:bash|shell|exec_command|run_command|shell_exec|execute_command|command_status|send_command_input|read_terminal|write_stdin)$/i,"running"],
  [/read|view|list|glob|file_search/i,"reading"],
  [/write|edit|patch|create.*file/i,"writing"],
  [/search|browse|web|fetch/i,"searching"],
  [/image|draw|render/i,"drawing"]
];
function projectSession(id, session, pending) {
  if (!session || session.headless || session.hudHiddenByPreference) return null;
  const defaults = AGENTS[session.agentId] || ["current", String(session.agentId || "agent")];
  const character = characterForModel(session.model) || characterForModel(session.provider) || defaults[0];
  const client = defaults[1];
  const event = session.recentEvents?.at(-1)?.event || "";
  const tool = typeof session.lastToolName === "string" ? session.lastToolName.slice(0,100) : "";
  const state = pending.has(id) ? "notification" : session.state;
  let pose = ({ thinking:"thinking", attention:"happy", error:"oops", notification:"asking",
    sweeping:"compact", carrying:"proud", idle:"idle", sleeping:"sleeping", juggling:"delegating" })[state];
  if (!pose) {
    const hasCommand = Boolean(session.commandName || (session.commandPreview?.status === "running" && session.commandPreview.label));
    pose = TOOL_POSES.find(([pattern]) => pattern.test(tool))?.[1] || (hasCommand ? "running" : "thinking");
    if (pose === "running" && !hasCommand) pose = "thinking";
  }
  const remote = session.host || session.wslDistro || (session.profileId && session.profileId !== "local");
  // A local native CrossPet hook and Clawd hook for the same conversation must
  // merge as one task; remote profiles retain distinct identities.
  const raw = String(session.rawSessionId || id);
  const key = remote ? "clawd:" + crypto.createHash("sha256").update(String(id)).digest("hex").slice(0,24) : raw;
  const timestamp = Number(session.updatedAt) || Date.now();
  const subagents = state === "juggling" ? (session.subagentTracker ? getSubagentVisualCount(session) : 1) : 0;
  // A projected parent may still have an older Stop in its canonical history
  // while admitted children are working. CrossPet's client routing must see
  // the current activity, rather than treating that parent as completed.
  const visualEvent = subagents > 0 && (event === "Stop" || event === "SessionEnd") ? "SubagentActivity" : event;
  return { key, character, client, pose, event: state === "attention" ? "Stop" : visualEvent,
    tool, commandName: session.commandName || "", ts: timestamp > 1e11 ? timestamp / 1000 : timestamp,
    commandPreview: session.commandPreview || null,
    commandPreviewAt: session.commandPreviewAt ? session.commandPreviewAt / 1000 : null,
    subagents };
}
function defaultStateDir() {
  return process.env.CROSSPET_STATE_DIR || (process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),"AppData","Local"),"CrossPet","state")
    : process.platform === "darwin" ? "/tmp/crosspet" : path.join(os.homedir(),".local","share","CrossPet","state"));
}
function startCrosspetService(options) {
  const dir = defaultStateDir();
  const commands = path.join(dir,"clawd-commands");
  const snapshotFile = path.join(dir,"clawd-snapshot.json");
  const instance = crypto.randomBytes(18).toString("hex");
  fs.mkdirSync(commands,{recursive:true,mode:0o700});
  let lastSignature = "", revision = 0, draining = false, connectionOperation = null;
  const ownerPid = Number(process.env.CROSSPET_HOST_PID);
  function publish() {
    if (Number.isSafeInteger(ownerPid) && ownerPid > 0) {
      try { process.kill(ownerPid,0); }
      catch { options.quit(); return; }
    }
    try {
      const pending = new Set(options.getPendingPermissions().map(p => p.sessionId));
      const entries = [...options.getSessions()].map(([id,s]) => projectSession(id,s,pending)).filter(Boolean);
      const signature = JSON.stringify(entries);
      if (signature !== lastSignature) { lastSignature = signature; revision++; }
      const payload = { schemaVersion:1, instance, pid:process.pid, revision, at:Date.now()/1000,
        hostPid:Number.isSafeInteger(ownerPid) && ownerPid > 0 ? ownerPid : null,
        interface: options.getInterfaceState?.() || {},
        pendingCount:options.getPendingPermissions().length, sessions:entries,
        connections: options.getConnections?.() || [], connectionOperation };
      fs.writeFileSync(snapshotFile+".tmp",JSON.stringify(payload),{mode:0o600});
      fs.renameSync(snapshotFile+".tmp",snapshotFile);
    } catch (e) { options.log?.(`CrossPet bridge: ${e.message}`); }
  }
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (const name of fs.readdirSync(commands).filter(n => /^[a-z0-9-]{8,80}\.json$/.test(n)).slice(0,32)) {
        const file = path.join(commands,name);
        let request;
        try {
          if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 8192) continue;
          request = JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
        } catch { continue; }
        finally { try { fs.unlinkSync(file); } catch {} }
        if (request.instance !== instance || Math.abs(Date.now()/1000-Number(request.at)) > 15) continue;
        if (request.action === "dashboard") options.openDashboard();
        else if (request.action === "connections") options.openSettings("remote-ssh");
        else if (request.action === "agents") options.openSettings("agents");
        else if (request.action === "settings") options.openSettings();
        else if (request.action === "pause-tasks") options.pauseTasks?.();
        else if (request.action === "resume-tasks") options.resumeTasks?.();
        else if (request.action === "approvals") options.showApprovals();
        else if (request.action === "connection"
          && ["connect", "deploy"].includes(request.operation)
          && typeof request.profileId === "string" && request.profileId.length <= 128
          && options.runConnectionOperation) {
          connectionOperation = { requestId:name, profileId:request.profileId, operation:request.operation, status:"running" };
          publish();
          try {
            const result = await options.runConnectionOperation(request.operation, request.profileId);
            connectionOperation = { ...connectionOperation, status:result?.status || "error",
              reason:result?.reason || null, step:result?.step || null,
              hint:result?.hint || null };
          } catch { connectionOperation = { ...connectionOperation, status:"error", reason:"connection-operation-failed" }; }
          publish();
        }
        else if (request.action === "anchor" && request.bounds) options.setAnchor(request.bounds);
        else if (request.action === "quit") options.quit();
      }
    } catch (e) { options.log?.(`CrossPet command: ${e.message}`); }
    finally { draining = false; }
  }
  const timer = setInterval(() => { publish(); void drain(); },500);
  publish();
  return { stop() { clearInterval(timer); try {
    const current = JSON.parse(fs.readFileSync(snapshotFile,"utf8"));
    if (current.instance === instance) fs.unlinkSync(snapshotFile);
  } catch {} } };
}

// Only the old pet render/input windows are invisible. Settings, dashboard,
// approval cards and terminal navigation use the original BrowserWindow class.
function backgroundPetWindowFactory(BrowserWindow) {
  return function BackgroundPetWindow(options) {
    const win = new BrowserWindow({...options,show:false,opacity:0,focusable:false,skipTaskbar:true});
    win.show = () => {};
    win.showInactive = () => {};
    win.setOpacity = () => {};
    return win;
  };
}
module.exports = { startCrosspetService, backgroundPetWindowFactory, projectSession };
