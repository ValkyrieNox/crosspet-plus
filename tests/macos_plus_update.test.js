"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execute = promisify(execFile);

test("Mac Plus updater validates complete packages and safely replaces, restarts and restores apps", {
  skip: process.platform !== "darwin",
  timeout: 120000,
}, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "crosspet-update-tests-"));
  try {
    const executable = path.join(temporary, "update-tests");
    await execute("swiftc", ["app/mac/PlusUpdateInstaller.swift", "tests/macos_plus_update.swift", "-o", executable]);
    const result = await execute(executable);
    assert.match(result.stdout, /PASS Plus update validation, atomic replacement, automatic launch, rollback, concurrent installer and parent timeout/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
