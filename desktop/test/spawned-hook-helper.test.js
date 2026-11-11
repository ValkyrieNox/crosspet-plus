"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createSpawnedHookHarness,
  runSpawnedHook,
} = require("./helpers/spawned-hook");

const FIXTURE = path.join(__dirname, "fixtures", "spawned-hook", "http-contract.js");

describe("spawned-hook test harness", () => {
  it("isolates the caller's Codex originator while preserving explicit child overrides", () => {
    const key = "CODEX_INTERNAL_ORIGINATOR_OVERRIDE";
    const previous = process.env[key];
    const harness = createSpawnedHookHarness({ prefix: "spawned-hook-originator-" });
    const script = path.join(harness.home, "originator.js");
    fs.writeFileSync(script, `process.stdout.write(JSON.stringify(process.env.${key} ?? null));`);
    process.env[key] = "caller-desktop";
    try {
      const inherited = harness.run({ script });
      assert.strictEqual(inherited.status, 0, inherited.stderr);
      assert.strictEqual(JSON.parse(inherited.stdout), null);

      const explicit = harness.run({ script, env: { [key]: "test-desktop" } });
      assert.strictEqual(explicit.status, 0, explicit.stderr);
      assert.strictEqual(JSON.parse(explicit.stdout), "test-desktop");
      assert.strictEqual(process.env[key], "caller-desktop");
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
      harness.cleanup();
    }
  });

  it("preloads the recorder and permits an expected blocked HTTP attempt", () => {
    const result = runSpawnedHook({
      script: FIXTURE,
      args: ["attempt"],
      httpContract: "expect-attempt",
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(result.preloads.some((preload) => preload.endsWith("hook-post-recorder.js")));
    assert.strictEqual(result.attempts[0].port, 23333);
    assert.strictEqual(result.attempts[0].path, "/state");
  });

  it("distinguishes business logic that must make no HTTP attempt", () => {
    const result = runSpawnedHook({
      script: FIXTURE,
      args: ["none"],
      httpContract: "expect-none",
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.attempts, []);
  });

  it("isolates HOME, USERPROFILE, and userData for every child", () => {
    const harness = createSpawnedHookHarness({ prefix: "spawned-hook-env-" });
    try {
      const result = harness.run({
        script: FIXTURE,
        args: ["none"],
        httpContract: "expect-none",
      });
      const env = JSON.parse(result.stdout);
      assert.strictEqual(env.home, harness.home);
      assert.strictEqual(env.userProfile, harness.home);
      assert.strictEqual(env.userData, harness.userData);
      assert.ok(env.appData.startsWith(harness.home));
      assert.strictEqual(env.codexHome, null);
      assert.strictEqual(env.nodeOptions, null);
    } finally {
      harness.cleanup();
    }
  });

  it("does not leak inherited Claude, Grok or Orca environment into the child", () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-ambient-config-"));
    const setters = {
      CLAUDE_CONFIG_DIR: configDir,
      GROK_HOOK_EVENT: "Stop",
      ORCA_PANE_KEY: "test-pane",
    };
    const previous = {};
    for (const key of Object.keys(setters)) {
      previous[key] = process.env[key];
      process.env[key] = setters[key];
    }
    try {
      const result = runSpawnedHook({
        script: FIXTURE,
        args: ["none"],
        httpContract: "expect-none",
      });
      const env = JSON.parse(result.stdout);
      assert.strictEqual(env.claudeConfigDir, null);
      assert.strictEqual(env.grokHookEvent, null);
      assert.strictEqual(env.orcaPaneKey, null);
    } finally {
      for (const key of Object.keys(setters)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it("passes an explicitly provided CLAUDE_CONFIG_DIR through to the child", () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-explicit-config-"));
    try {
      const result = runSpawnedHook({
        script: FIXTURE,
        args: ["none"],
        httpContract: "expect-none",
        env: { CLAUDE_CONFIG_DIR: configDir },
      });
      const env = JSON.parse(result.stdout);
      assert.strictEqual(env.claudeConfigDir, configDir);
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it("combines process-spawn probing with an independent HTTP assertion contract", () => {
    const result = runSpawnedHook({
      script: FIXTURE,
      args: ["attempt"],
      httpContract: "expect-attempt",
      probeProcessSpawns: true,
    });
    assert.deepStrictEqual(result.spawns, []);
    assert.ok(result.attempts.length > 0);
  });
});
