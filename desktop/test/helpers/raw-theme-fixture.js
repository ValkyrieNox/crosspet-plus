"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Tiny, original assets for filesystem/schema tests; no shipped artwork is read.
function writeRawThemeFixture(directory) {
  const states = Object.fromEntries([
    "idle", "working", "thinking", "yawning", "dozing", "collapsing", "sleeping", "waking",
  ].map((state) => [state, [`fixture-${state}.svg`]]));
  states.idle = ["fixture-idle-follow.svg"];
  const raw = {
    schemaVersion: 1,
    name: "Synthetic validation fixture",
    version: "1.0.0",
    author: "Test fixture",
    description: "Inert assets for theme validation tests",
    viewBox: { x: 0, y: 0, width: 16, height: 16 },
    states,
    sleepSequence: { mode: "full" },
    eyeTracking: { enabled: true, states: ["idle"] },
    idleAnimations: [{ file: "fixture-idle.apng", duration: 1000 }],
    workingTiers: [{ minSessions: 1, file: "fixture-working-typing.apng" }],
    jugglingTiers: [{ minSessions: 1, file: "fixture-working-juggling.apng" }],
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g id="body-js"><g id="eyes-js"/></g><g id="shadow-js"/></svg>';
  const assets = path.join(directory, "assets");
  fs.mkdirSync(assets, { recursive: true });
  for (const file of Object.values(states).flat()) fs.writeFileSync(path.join(assets, file), svg);
  // The CLI checks raster existence, not decoding. These inert bytes are not art.
  for (const name of ["idle", "working-typing", "working-building", "working-juggling"]) {
    fs.writeFileSync(path.join(assets, `fixture-${name}.apng`), "test raster placeholder");
  }
  fs.writeFileSync(path.join(directory, "theme.json"), JSON.stringify(raw, null, 2));
  return raw;
}

module.exports = { writeRawThemeFixture };
