"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "../app/web/index.html"), "utf8");

test("bridge loss clears only its own page state and client routing, including pinned asking pets", () => {
  const source = html.match(/^function clearClawdState\([^]*?^\}/m)?.[0];
  assert.ok(source, "the real page must expose narrow bridge cleanup");
  const context = vm.createContext({});
  vm.runInContext(`
    const charState = {}, clientStateSeen = {};
    let charId = 'gpt', egg = null, multi = null, devActive = false, updatingNow = false;
    let thinkTimer, pending, revertTimer, resets = 0, refreshes = 0;
    const devHeld = () => false, restPose = () => 'idle';
    function clearTimeout() {} function show(p) { if (p === 'idle') resets++; }
    function say() {} function refreshMulti() { refreshes++; }
    ${source}
  `, context);
  const run = code => vm.runInContext(code, context);
  run(`charState.gpt = {character:'gpt',client:'codex',pose:'asking',_crosspetPlus:'instance-a'}; clientStateSeen.gpt = true;`);
  run(`clearClawdState('gpt','codex','old-instance',false)`);
  assert.equal(run("charState.gpt.pose"), "asking", "foreign instance cannot clear current state");
  run(`clearClawdState('gpt','codex','instance-a',false)`);
  assert.equal(run("charState.gpt"), undefined);
  assert.equal(run("clientStateSeen.gpt"), undefined, "legacy native character events regain routing");
  assert.equal(run("resets"), 1, "pinned asking pose returns to rest");
  run(`charState.gpt = {pose:'reading',ts:10}; clientStateSeen.gpt=true; clearClawdState('gpt','codex','instance-a',true)`);
  assert.equal(run("charState.gpt.pose"), "reading", "native observation survives cleanup");
  assert.equal(run("clientStateSeen.gpt"), true, "other client observations retain routing");
});
