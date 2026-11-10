"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

for (const marker of [null, "com.valkyrienox.crosspet-plus.native", "invalid.other-app"]) {
  const expected = marker === "com.valkyrienox.crosspet-plus.native" ? marker : "io.github.crosspet";
  test(`Claude auto-start selects the last native app with marker ${marker}`, async () => {
    const source = fs.readFileSync(path.join(__dirname, "../integrations/claude-code/mod/hooks/register.ts"), "utf8");
    const fn = source.match(/^async function ensurePet\([^]*?^\}/m)[0]
      .replace("$: EngineInterface", "$").replace(": Promise<void>", "");
    const calls = [];
    const engine = {
      env: { get: async key => key === "HOME" ? "/test-home" : undefined },
      fs: { exists: async () => false, read: async file => {
        if (file.endsWith("native-bundle-id") && marker !== null) return marker;
        throw new Error("missing fixture");
      } },
      process: { run: async args => { calls.push(args); return { exitCode: 1 }; } },
    };
    const context = vm.createContext({ engine, stateDir: async () => "/test-state", appStartedAt: async () => 0 });
    vm.runInContext("let lastEnsure = 0;\n" + fn, context);
    await vm.runInContext("ensurePet(engine)", context);
    assert.equal(calls.at(-1).at(-1), expected);
  });
  test(`DSH auto-start selects the last native app with marker ${marker}`, () => {
    const source = fs.readFileSync(path.join(__dirname, "../integrations/deepseek/dsh-plugin-crosspet/lib/index.js"), "utf8");
    const fn = source.match(/^  function ensurePet\([^]*?^  \}/m)[0];
    const calls = [];
    const context = vm.createContext({ config: {}, appData: "/test-home", dir: "/test-state",
      join: path.join, dirname: path.dirname, homedir: () => "/test-home",
      existsSync: () => false, statSync: () => { throw Error("missing fixture"); },
      readFileSync: file => { if (file.endsWith("native-bundle-id") && marker !== null) return marker; throw Error("missing fixture"); },
      process: { platform: "darwin", env: {}, uptime: () => 0, kill: () => { throw Error("missing pid"); } },
      spawn: (exe, args) => { calls.push([exe, ...args]); return { on() {}, unref() {} }; },
      noteAutostart() {}, ctx: {},
    });
    vm.runInContext("let lastEnsure = 0;\n" + fn, context);
    vm.runInContext("ensurePet('test')", context);
    assert.equal(calls.at(-1).at(-1), expected);
  });
}
