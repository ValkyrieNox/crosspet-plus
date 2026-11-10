"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseOptions, validateRuntime, copyRuntime, pathsFor } = require("../scripts/build-macos.cjs");
const { findMacApp } = require("../scripts/start-native.cjs");

test("build defaults to host architecture and rejects unsupported/unknown options", () => {
  assert.deepEqual(parseOptions([], "arm64"), { arch: "arm64", zip: true, assembleOnly: false });
  assert.equal(parseOptions(["--arch=x64", "--dir"], "arm64").arch, "x64");
  assert.equal(parseOptions(["--arch", "x64", "--assemble-only"], "arm64").assembleOnly, true);
  assert.throws(() => parseOptions(["--arch=universal"], "arm64"), /architecture/);
  assert.throws(() => parseOptions(["--typo"], "arm64"), /Unknown/);
  assert.match(pathsFor("/repo", "arm64", "1.3.10-plus.4").zip, /CrossPet-Plus-1\.3\.10-plus\.4-macOS-arm64\.zip$/);
});

test("packaging requires a real matching Mach-O backend and preserves framework symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crosspet-package-"));
  try {
    const runtime = path.join(dir, "CrossPet Plus.app");
    const binary = path.join(runtime, "Contents", "MacOS", "CrossPet Plus");
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    const macho = Buffer.alloc(32); macho.writeUInt32LE(0xfeedfacf); macho.writeUInt32LE(0x0100000c, 4);
    fs.writeFileSync(binary, macho, { mode: 0o755 });
    fs.mkdirSync(path.join(runtime, "Contents", "Resources"), { recursive: true });
    fs.writeFileSync(path.join(runtime, "Contents", "Resources", "app.asar"), "fixture");
    validateRuntime(runtime, "arm64");
    assert.throws(() => validateRuntime(runtime, "x64"), /architecture/);
    const framework = path.join(runtime, "Contents", "Frameworks", "Fixture.framework");
    fs.mkdirSync(path.join(framework, "Versions", "A"), { recursive: true });
    fs.symlinkSync("A", path.join(framework, "Versions", "Current"));
    const dest = path.join(dir, "outer.app", "Contents", "Helpers", "CrossPet Plus.app");
    copyRuntime(runtime, dest);
    assert.equal(fs.readlinkSync(path.join(dest, "Contents", "Frameworks", "Fixture.framework", "Versions", "Current")), "A");
    assert.throws(() => validateRuntime(path.join(dir, "missing"), "arm64"), /runtime|ENOENT/);
    const app = pathsFor(dir, "arm64", "1").app;
    fs.mkdirSync(app, { recursive: true });
    assert.equal(findMacApp(dir, "arm64"), app);
    assert.throws(() => findMacApp(dir, "x64"), /build:mac/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
