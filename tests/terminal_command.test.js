"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { commandNameFromInput } = require("../desktop/hooks/shared-process");
const { commandLabelFromInput, buildCommandPreview, normalizeCommandPreview } = require("../desktop/hooks/shared-process");
const { projectSession } = require("../desktop/src/crosspet-service");

test("command labels extract only the first executable", () => {
  for (const [command, expected] of [
    ["curl -H 'Authorization: secret' https://example.com", "curl"],
    ["ssh user@host", "ssh"], ["TOKEN=secret /usr/bin/curl --version", "curl"],
    ['"C:\\Program Files\\Git\\bin\\git.exe" status', "git.exe"],
    ["npm test && git add .", "npm"], ["", ""],
  ]) assert.equal(commandNameFromInput({ command }), expected);
  assert.equal(commandNameFromInput({ cmd: "rg hello" }), "rg");
  assert.equal(commandNameFromInput({ command: ["ssh", "host"] }), "ssh");
  assert.equal(commandNameFromInput({ code: "doSomething()" }), "");
});

test("command labels retain the useful prefix before redirects and long arguments", () => {
  for (const [command, expected] of [
    ["npm run build > test.log", "npm run build"],
    ["npm run build:mac", "npm run build"],
    ["npm run build: mac", "npm run build"],
    ["pnpm exec tsc --noEmit", "pnpm exec tsc"],
    ["npx vite build --outDir dist", "npx vite build"],
    ["npm run build:win:arm64 -- --verbose", "npm run build"],
    ["pnpm run test:unit > test.log", "pnpm run test"],
    ["yarn build:production --watch", "yarn build"],
    ["bun run dev:local", "bun run dev"],
    ["npm --prefix desktop run build:mac", "npm run build"],
    ["npm run --silent build:mac", "npm run build"],
    ["npm --token hidden run build:mac", "npm run build"],
    ["pnpm -C app run lint:fix", "pnpm run lint"],
    ["docker compose up --build service", "docker compose up"],
    ["cargo build --release", "cargo build"],
    ["go test ./...", "go test"],
    ["git remote add origin https://example.com/repo", "git remote add"],
    ["python3 -m pytest tests", "python3 -m pytest"],
    ["npm run build -- --output dist --verbose", "npm run build"],
    ["git status --short", "git status"],
    ["curl --version", "curl --version"],
    ["npm test && git add .", "npm test"],
    ["TOKEN=secret npm run build 2>&1", "npm run build"],
    ["echo 2 > test.log", "echo 2"],
    ["npm run build\necho done", "npm run build"],
    ['curl -H "Authorization: secret" https://example.com', "curl"],
  ]) assert.equal(commandLabelFromInput({ command }), expected);
  assert.equal(normalizeCommandPreview({ label: "npm run build:mac", status: "running" }).label, "npm run build");
});

test("command previews use real results and keep yielded commands running", () => {
  const input = { cmd: "npm run build > test.log" };
  assert.deepEqual(buildCommandPreview(input, "PreToolUse", null, { callId: "a" }), {
    label: "npm run build", status: "running", output: "", callId: "a",
  });
  assert.equal(buildCommandPreview(input, "PostToolUse", { exit_code: 0, stdout: "Built" }).output, "Built");
  assert.equal(buildCommandPreview(input, "PostToolUse", { exit_code: 0, stdout: "x".repeat(100) }).status, "success");
  assert.equal(buildCommandPreview(input, "PostToolUse", { exit_code: 1, stderr: "Build error" }).status, "failure");
  assert.equal(buildCommandPreview(input, "PostToolUse", { session_id: 123, exit_code: null, output: "Working" }).status, "running");
  assert.equal(buildCommandPreview(input, "PostToolUse", "Process exited with code 2\nFinal output:\nNo file").status, "failure");
  assert.equal(buildCommandPreview(input, "PostToolUse", { exit_code: 0, stdout: "TOKEN=secret" }).output, "");
  assert.equal(buildCommandPreview(input, "PostToolUse", "").status, "finished");
  assert.equal(buildCommandPreview(input, "PostToolUseFailure", "").status, "failure");
  assert.deepEqual(buildCommandPreview({ session_id: 42 }, "PostToolUse", { exit_code: 0, output: "Done" }, { callId: "poll" }), {
    label: "", status: "success", output: "Done", callId: "poll", sessionId: "42",
  });
});

test("command results extract compact test summaries from multiline output", () => {
  const cases = [
    ["test_a.py ............ [100%]\n================ 12 passed in 0.42s ================", 0, "12 passed"],
    ["console output\nTests:       12 passed, 12 total\nTime:        2.12 s", 0, "12 passed"],
    ["Test Files  2 passed (2)\nTests  20 passed (20)\nDuration  1.3s", 0, "20 passed"],
    ["ℹ tests 12\nℹ pass 12\nℹ fail 0\nℹ duration_ms 42.2", 0, "12 passed"],
    ["# tests 12\n# pass 11\n# fail 1\n# duration_ms 42.2", 1, "1 failed"],
    ["test_a.py F....\n===== 1 failed, 11 passed in 0.42s =====", 1, "1 failed"],
    ["===== 12 passed, 2 skipped in 0.42s =====", 0, "12 passed"],
    ["ℹ tests 12\nℹ pass 12\nℹ fail 0", 1, ""],
    ["12 passed", 1, ""],
    ["A very long arbitrary output that cannot fit in the terminal", 0, ""],
    ["long unstructured output\nand another long unstructured output", 1, ""],
    ["TOKEN=secret\n===== 12 passed in 0.42s =====", 0, "12 passed"],
  ];
  for (const [stdout, exit_code, output] of cases) {
    const preview = buildCommandPreview({ cmd: "npm test" }, "PostToolUse", { stdout, exit_code });
    assert.equal(preview.output, output, stdout);
  }
});

test("explicit tool errors override passed summaries and nested zero exit codes", () => {
  for (const flags of [{ isError: true }, { is_error: true }, { success: false }, { error: "Tool failed" }, { interrupted: true }]) {
    const result = { stdout: "12 passed", exit_code: 0 };
    for (const response of [{ ...result, ...flags }, { ...flags, content: [{ type: "text", text: JSON.stringify(result) }] }]) {
      const preview = buildCommandPreview({ cmd: "npm test" }, "PostToolUse", response);
      assert.equal(preview.status, "failure", JSON.stringify(response));
      assert.equal(preview.output, "");
    }
  }
});

test("bridge projects the session command label", () => {
  const preview = { label: "npm run build", status: "success", output: "Built", callId: "a" };
  const row = projectSession("s1", { agentId: "codex", state: "working", lastToolName: "exec_command", commandName: "ssh", commandPreview: preview, commandPreviewAt: 123000 }, new Set());
  assert.equal(row.commandName, "ssh");
  assert.deepEqual(row.commandPreview, preview);
  assert.equal(row.commandPreviewAt, 123);
});

test("official hooks pass executable labels through the monitor callback contract", () => {
  const codex = require("../desktop/hooks/codex-hook");
  const claude = require("../desktop/hooks/clawd-hook");
  const { buildCodexMonitorSessionOptions } = require("../desktop/src/codex-monitor-callback");
  const resolve = () => ({});
  const payload = { hook_event_name: "PreToolUse", session_id: "s1", tool_name: "exec_command", tool_input: { cmd: "ssh user@host" } };
  assert.equal(codex.buildStateBody(payload, resolve).command_name, "ssh");
  assert.equal(codex.buildStateBody({ ...payload, tool_input: { cmd: "npm run build > test.log" } }, resolve).command_preview.label, "npm run build");
  assert.equal(claude.buildStateBody("PreToolUse", { ...payload, tool_input: { command: "curl --version" } }, resolve).command_name, "curl");
  assert.equal(buildCodexMonitorSessionOptions({ commandName: "ssh", toolName: "exec_command" }).commandName, "ssh");
});

test("a running pet refreshes its command without changing pose", () => {
  const html = fs.readFileSync(require.resolve("../app/web/index.html"), "utf8");
  const source = html.match(/^function playCharState\([^]*?^\}/m)[0];
  const renders = [];
  const context = vm.createContext({
    charId: "gpt", charState: { gpt: { commandName: "curl" } }, standsIn: () => false,
    egg: null, multi: null, pose: "running", shakingUntil: 0, lastActive: 0,
    thinkTimer: null, seenTool: {}, lastTrouble: {},
    noteVerdict() {}, clearTimeout() {}, watchStuck() {}, show() {},
    setFx: () => renders.push(context.charState.gpt.commandName),
  });
  vm.runInContext(source, context);
  context.playCharState("gpt", { pose: "running", event: "PreToolUse", commandName: "ssh" });
  assert.deepEqual(renders, ["ssh"]);
});

test("terminal effects show actual commands in single and multiple sessions", () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(require.resolve("../app/web/effects.js"), "utf8"), context);
  const fx = context.window.CrossFx;
  for (const render of [fx.surroundings, fx.cardProp]) {
    assert.match(render("running", "curl"), /\$ curl/);
    assert.match(render("running", "ssh"), /\$ ssh/);
    assert.doesNotMatch(render("running"), /npm test|12 passed|git add/);
    assert.doesNotMatch(render("running", '<script>'), /<script>/);
    assert.match(render("running", "npm", { label: "npm run build", status: "success", output: "" }), /\$ npm run build/);
    assert.match(render("running", "npm", { label: "npm run build", status: "success", output: "" }), /Finished/);
    assert.match(render("running", "npm", { label: "npm run build", status: "failure", output: "" }), /Failed/);
    assert.match(render("running", "npm", { label: "npm run build", status: "finished", output: "" }), /Finished/);
    assert.match(render("running", "npm", { label: "npm run build", status: "finished", output: "" }), /#c6cbd1/);
    assert.match(render("running", "npm", { label: "npm run build", status: "running", output: "" }), /width="144" height="50" overflow="hidden"/);
    assert.match(render("running", "echo", { label: "echo ok", status: "success", output: "ok" }), /✓ ok/);
    assert.match(render("running", "pytest", { label: "pytest", status: "running", output: "collecting" }), /Running\.\.\./);
    assert.match(render("running", "pytest", { label: "pytest", status: "success", output: "12 passed" }), /✓ 12 passed/);
    assert.match(render("running", "pytest", { label: "pytest", status: "success", output: "this output is far too long to fit" }), />Finished</);
    assert.match(render("running", "pytest", { label: "pytest", status: "failure", output: "this error is far too long to fit" }), />Failed</);
    assert.doesNotMatch(render("running", "pytest", { label: "pytest", status: "failure", output: "this error is far too long to fit" }), /this error|…/);
    assert.doesNotMatch(render("running", "echo", { label: "echo <svg>", status: "success", output: "<script>" }), /<script>|echo <svg>/);
  }
});

test("completed command output remains readable briefly while the pet thinks", () => {
  const html = fs.readFileSync(require.resolve("../app/web/index.html"), "utf8");
  const source = html.match(/^function setFx\([^]*?^\}/m)[0];
  let now = 10000;
  const callbacks = [];
  const element = { innerHTML: "", classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    window: {}, Date: { now: () => now }, charId: "gpt", characterGeneration: 1,
    charState: { gpt: { commandName: "npm", commandPreviewAt: 10,
      commandPreview: { label: "npm run build", status: "success", output: "Built" } } },
    pose: "thinking", multi: null, commandResultTimer: null, char: () => ({}), $: () => element,
    clearTimeout() {}, characterTimeout: callback => { callbacks.push(callback); return 1; },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../app/web/effects.js"), "utf8"), context);
  context.CrossFx = context.window.CrossFx;
  vm.runInContext(source, context);
  context.setFx("thinking", true);
  assert.match(element.innerHTML, /\$ npm run build/);
  assert.match(element.innerHTML, /✓ Built/);
  now += 3001;
  callbacks[0]();
  assert.doesNotMatch(element.innerHTML, /npm run build|✓ Built/);
});
