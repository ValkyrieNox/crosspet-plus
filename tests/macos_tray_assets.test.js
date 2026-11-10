"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("generated macOS tray templates use 18-point images with matching Retina representations", () => {
  const root = path.resolve(__dirname, "..");
  execFileSync(process.execPath, [path.join(root, "scripts/prepare-desktop.cjs")], { cwd: root });
  for (const base of ["tray-iconTemplate", "tray-icon-flashTemplate"]) {
    for (const [suffix, size] of [["", 18], ["@2x", 36]]) {
      const file = path.join(root, "desktop/assets", base + suffix + ".png");
      const image = fs.readFileSync(file);
      assert.equal(image.readUInt32BE(16), size, `${base}${suffix} width`);
      assert.equal(image.readUInt32BE(20), size, `${base}${suffix} height`);
    }
  }
});
