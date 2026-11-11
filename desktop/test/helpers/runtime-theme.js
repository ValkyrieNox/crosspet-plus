"use strict";

const { mergeDefaults, MINI_REQUIRED_STATES } = require("../../src/theme-schema");

// Logical runtime tests need distinct bindings, tiers, sleep and mini timing.
// The Plus task service deliberately ships one inert SVG for every state.
// These names are dummy identifiers used by inherited assertions, not artwork;
// this fixture neither reads nor reproduces the upstream theme assets.
function createRuntimeTheme(id = "clawd") {
  if (!["clawd", "calico", "cloudling"].includes(id)) throw new Error(`Unknown runtime fixture: ${id}`);
  const file = (name) => `${id}-${name}.svg`;
  const states = Object.fromEntries([
    "idle", "working", "thinking", "attention", "error", "notification", "juggling",
    "sweeping", "carrying", "sleeping", "yawning", "dozing", "collapsing", "waking", "dizzy", "roam",
  ].map((state) => [state, [file(state)]]));
  states.idle = [file(id === "cloudling" ? "idle" : "idle-follow")];
  states.attention = [file("happy")];
  states.working = [file("working-typing")];
  states.juggling = [file("working-juggling")];
  states.thinking = id === "clawd"
    ? [file("working-thinking")]
    : [id === "calico" ? "calico-thinking.apng" : file("thinking")];
  const miniStates = Object.fromEntries(MINI_REQUIRED_STATES.map((state) => [state, [file(state)]]));
  miniStates["mini-working"] = [file("mini-working")];
  const raw = {
    schemaVersion: 1,
    name: `Test runtime fixture (${id})`,
    viewBox: { x: 0, y: 0, width: 16, height: 16 },
    states,
    sleepSequence: { mode: "full" },
    eyeTracking: { enabled: true, states: ["idle", "dozing"] },
    miniMode: {
      offsetRatio: 0.486,
      states: miniStates,
      timings: {
        autoReturn: { "mini-alert": 2500, "mini-happy": 4000, "mini-peek": 3000 },
      },
    },
    idleAnimations: id === "clawd"
      ? [{ file: file("idle-look"), duration: 6500 }, { file: file("idle-bubble"), duration: 13500 }, { file: file("idle-reading"), duration: 14000 }]
      : [{ file: id === "calico" ? "calico-idle.apng" : file("idle-reading"), duration: 10000 }],
    workingTiers: [
      { minSessions: 3, files: [file("working-building")] },
      { minSessions: 2, file: file("headphones-groove") },
      { minSessions: 1, file: file("working-typing") },
    ],
    jugglingTiers: [
      { minSessions: 2, files: [file("working-juggling")] },
      { minSessions: 1, files: [file("headphones-groove")] },
    ],
    displayHintMap: id === "clawd" ? {
      ...Object.fromEntries(
        ["working-typing", "working-building", "working-thinking", "idle-reading"]
          .map((name) => [file(name), file(name)])
      ),
      "claude-design": file("designing"),
    } : {},
    completionVisualMap: id === "clawd" ? { "claude-design": file("heart-eyes") } : {},
    updateVisuals: id === "clawd" ? { checking: file("working-debugger") } : {},
    timings: id === "calico" ? {
      wakeDuration: 5800,
      dndSleepTransitionSvg: file("idle-to-sleeping"),
      dndSleepTransitionDuration: 5200,
    } : {},
    wideHitboxFiles: [file("error")],
  };
  if (id === "cloudling") raw.trustedRuntime = { scriptedSvgFiles: [states.idle[0], ...Object.values(miniStates).flat()] };
  return mergeDefaults(raw, id, true);
}

// Deliberately simple geometry makes the layout math reviewable without any
// shipped artwork measurements. The two fixtures exercise SVG tracking versus
// raster fitting, per-file transforms, content boxes and margin envelopes.
function createGeometryTheme(id = "clawd") {
  const theme = createRuntimeTheme(id);
  theme.viewBox = { x: 0, y: 0, width: 20, height: 15 };
  theme.layout = {
    contentBox: { x: 2, y: 2, width: 16, height: 10 },
    marginBox: { x: 2, y: 0, width: 16, height: 12 },
    centerX: 10, baselineY: 12,
    centerXRatio: 0.5, baselineBottomRatio: 0.2, visibleHeightRatio: 0.5,
  };
  theme.objectScale = {
    widthRatio: 1.2, heightRatio: 1.2, offsetX: -0.1, offsetY: -0.1,
    imgWidthRatio: 1.2, imgOffsetX: -0.1, imgBottom: 0.05,
    fileOffsets: { "calico-idle-follow.svg": { x: -5, y: -5 }, "calico-mini-idle.apng": { x: 2, y: -3 } },
    fileScales: { "calico-mini-idle.apng": 0.75, "calico-thinking.apng": 1.1 },
  };
  if (id === "calico") delete theme.layout.marginBox;
  theme.reactions = { drag: { file: `${id}-react-drag.svg` } };
  theme.rendering.objectChannelFiles = [`${id}-idle-follow.svg`, `${id}-react-drag.svg`, `${id}-mini-idle.svg`];
  return theme;
}

module.exports = { createRuntimeTheme, createGeometryTheme };
