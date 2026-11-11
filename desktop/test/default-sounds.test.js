"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const createThemeContext = require("../src/theme-context");
const themeLoader = require("../src/theme-loader");

const ROOT = path.join(__dirname, "..");
const SOUNDS_DIR = path.join(ROOT, "assets", "sounds");

themeLoader.init(path.join(ROOT, "src"));

function readGeneratedTone(filename) {
  const buffer = fs.readFileSync(path.join(SOUNDS_DIR, filename));
  assert.ok(buffer.length > 44, `${filename} should contain audio samples`);
  assert.strictEqual(buffer.toString("ascii", 0, 4), "RIFF");
  assert.strictEqual(buffer.readUInt32LE(4), buffer.length - 8);
  assert.strictEqual(buffer.toString("ascii", 8, 16), "WAVEfmt ");
  assert.strictEqual(buffer.readUInt32LE(16), 16, "PCM format chunk size");
  assert.strictEqual(buffer.readUInt16LE(20), 1, "uncompressed PCM");
  assert.strictEqual(buffer.readUInt16LE(22), 1, "mono audio");
  assert.strictEqual(buffer.readUInt16LE(34), 16, "16-bit samples");
  const rate = buffer.readUInt32LE(24);
  assert.ok(rate >= 8000 && rate <= 192000, "playable sample rate");
  assert.strictEqual(buffer.readUInt32LE(28), rate * 2);
  assert.strictEqual(buffer.readUInt16LE(32), 2, "sample block alignment");
  assert.strictEqual(buffer.toString("ascii", 36, 40), "data");
  const bytes = buffer.readUInt32LE(40);
  assert.strictEqual(bytes, buffer.length - 44);
  assert.strictEqual(bytes % 2, 0);
  const duration = bytes / (rate * 2);
  assert.ok(duration > 0.1 && duration < 1, "short notification tone");
  const samples = Array.from({ length: bytes / 2 }, (_, index) => buffer.readInt16LE(44 + index * 2));
  assert.ok(samples.some((sample) => sample > 0), "audible positive samples");
  assert.ok(samples.some((sample) => sample < 0), "audible negative samples");
  const crossings = samples.filter((sample, index) => index > 0 && sample > 0 && samples[index - 1] <= 0).length;
  return { buffer, crossings };
}

test("generated completion and confirmation sounds are valid WAV audio with distinct tones", () => {
  const complete = readGeneratedTone("complete.wav");
  const confirm = readGeneratedTone("confirm.wav");
  assert.notDeepStrictEqual(confirm.buffer, complete.buffer);
  assert.notStrictEqual(confirm.crossings, complete.crossings, "tones should have different frequency content");
});

test("the task service theme resolves completion and confirmation to distinct bundled WAV files", () => {
  for (const themeId of ["clawd"]) {
    const theme = themeLoader.loadTheme(themeId, { strict: true });
    const context = createThemeContext(theme, { assetsSoundsDir: SOUNDS_DIR });
    const completeUrl = context.getSoundUrl("complete");
    const confirmUrl = context.getSoundUrl("confirm");

    assert.ok(completeUrl, `${themeId} should resolve a completion sound`);
    assert.ok(confirmUrl, `${themeId} should resolve a confirmation sound`);
    assert.strictEqual(fileURLToPath(completeUrl), path.join(SOUNDS_DIR, "complete.wav"));
    assert.strictEqual(fileURLToPath(confirmUrl), path.join(SOUNDS_DIR, "confirm.wav"));
    assert.notStrictEqual(confirmUrl, completeUrl);
  }
});
