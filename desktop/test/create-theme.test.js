"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { writeRawThemeFixture } = require("./helpers/raw-theme-fixture");

const createTheme = require("../scripts/create-theme");

const cleanupDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-create-theme-"));
  cleanupDirs.push(dir);
  return dir;
}

function loadScaffoldWithSyntheticTemplate() {
  const root = makeTmpDir();
  const template = path.join(root, "themes", "template");
  const raw = writeRawThemeFixture(template);
  fs.writeFileSync(path.join(template, "theme.json"), JSON.stringify({ _scaffoldOnly: true, ...raw }, null, 2));
  fs.copyFileSync(path.join(template, "assets", "fixture-idle-follow.svg"), path.join(template, "assets", "idle-follow.svg"));
  fs.writeFileSync(path.join(template, "art-source.md"), "Synthetic test assets.\n");
  fs.writeFileSync(path.join(template, "art-source.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const module = { exports: {} };
  // The script fixes its template location relative to __dirname. Supply an
  // isolated repository root while executing the unchanged implementation.
  vm.runInNewContext(fs.readFileSync(require.resolve("../scripts/create-theme"), "utf8"), {
    require, module, __dirname: path.join(root, "scripts"), process, console,
  });
  return module.exports;
}

afterEach(() => {
  while (cleanupDirs.length) {
    fs.rmSync(cleanupDirs.pop(), { recursive: true, force: true });
  }
});

describe("create-theme defaults", () => {
  it("resolves the platform-specific user themes directory", () => {
    assert.strictEqual(
      createTheme.getDefaultThemesRoot("win32", { APPDATA: "C:\\Users\\Ruller\\AppData\\Roaming" }, "C:\\Users\\Ruller"),
      path.win32.join("C:\\Users\\Ruller\\AppData\\Roaming", "clawd-on-desk", "themes")
    );
    assert.strictEqual(
      createTheme.getDefaultThemesRoot("darwin", {}, "/Users/ruller"),
      "/Users/ruller/Library/Application Support/clawd-on-desk/themes"
    );
    assert.strictEqual(
      createTheme.getDefaultThemesRoot("linux", { XDG_CONFIG_HOME: "/tmp/config-home" }, "/home/ruller"),
      "/tmp/config-home/clawd-on-desk/themes"
    );
  });

  it("slugifies theme ids into filesystem-safe names", () => {
    assert.strictEqual(createTheme.slugifyThemeId("Pixel Cat!"), "pixel-cat");
    assert.strictEqual(createTheme.slugifyThemeId("   "), "my-theme");
  });
});

describe("create-theme scaffold", () => {
  it("copies the template and patches theme metadata", () => {
    const themesRoot = makeTmpDir();
    const result = loadScaffoldWithSyntheticTemplate().createThemeScaffold({
      themeId: "Pixel Cat",
      name: "Pixel Cat",
      author: "Ruller",
      themesRoot,
    });

    assert.strictEqual(result.themeId, "pixel-cat");
    assert.ok(fs.existsSync(path.join(result.targetDir, "theme.json")));
    assert.ok(fs.existsSync(path.join(result.targetDir, "assets", "idle-follow.svg")));
    assert.strictEqual(fs.readFileSync(path.join(result.targetDir, "art-source.md"), "utf8"), "Synthetic test assets.\n");
    assert.ok(fs.existsSync(path.join(result.targetDir, "art-source.svg")));

    const themeJson = fs.readFileSync(path.join(result.targetDir, "theme.json"), "utf8");
    assert.strictEqual(JSON.parse(themeJson).name, "Pixel Cat");
    assert.match(themeJson, /"name": "Pixel Cat"/);
    assert.match(themeJson, /"author": "Ruller"/);
    assert.doesNotMatch(themeJson, /"license"\s*:/);
    assert.doesNotMatch(themeJson, /"_scaffoldOnly"\s*:/);
  });

  it("auto-picks a fresh my-theme-N id when no theme id is provided", () => {
    const themesRoot = makeTmpDir();
    fs.mkdirSync(path.join(themesRoot, "my-theme"), { recursive: true });

    const result = loadScaffoldWithSyntheticTemplate().createThemeScaffold({
      themesRoot,
      env: { USERNAME: "Codex" },
    });

    assert.strictEqual(result.themeId, "my-theme-2");
    assert.strictEqual(result.author, "Codex");
    assert.ok(fs.existsSync(path.join(result.targetDir, "theme.json")));
  });

  it("rejects explicit theme ids that already exist", () => {
    const themesRoot = makeTmpDir();
    fs.mkdirSync(path.join(themesRoot, "pixel-cat"), { recursive: true });

    assert.throws(
      () => loadScaffoldWithSyntheticTemplate().createThemeScaffold({ themeId: "pixel-cat", themesRoot }),
      /already exists/
    );
  });
});
