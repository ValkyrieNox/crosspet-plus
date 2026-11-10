// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
// Presentation only. This module cannot issue approvals, mutate sessions or
// install hooks. All permissions, session arbitration and remote transports
// continue through the unmodified Clawd runtime.
const fs = require("node:fs");
const path = require("node:path");
const CHARACTERS = new Set(["claude", "gpt", "deepseek", "gemini", "glm", "qwen", "grok"]);
const VISUAL_AGENT_DEFAULTS = {
  "claude-code":"claude",codex:"gpt","deepseek-harness":"deepseek",
  "gemini-cli":"gemini","antigravity-cli":"gemini",zcode:"glm",
  "qwen-code":"qwen","grok-build":"grok"
};
let lastCharacter = "claude";
function characterForModel(model) {
  const s = typeof model === "string" ? model.toLowerCase() : "";
  if (/glm|zhipu|chatglm|z\.ai|zai-/.test(s)) return "glm";
  if (/qwen|dashscope|bailian|tongyi/.test(s) || s === "coder-model") return "qwen";
  if (/deepseek/.test(s)) return "deepseek";
  if (/claude|anthropic/.test(s)) return "claude";
  if (/gemini|google/.test(s)) return "gemini";
  if (/grok|x-ai|x\.ai/.test(s)) return "grok";
  if (/^(gpt|o1|o3|o4|codex|chatgpt)|openai/.test(s)) return "gpt";
  return null;
}
function visibleSessions(sessions) {
  const values = sessions instanceof Map ? [...sessions.values()]
    : Array.isArray(sessions) ? sessions : [];
  return values.filter(s => s && !s.headless && !s.hudHiddenByPreference);
}
function chooseCharacter(sessions, state) {
  const candidates = visibleSessions(sessions);
  const exact = candidates.filter(s => s.state === state);
  const busy = candidates.filter(s => ["thinking","working","executing","juggling","notification","error","attention"].includes(s.state));
  const pool = exact.length ? exact : busy.length ? busy : candidates;
  const latest = pool.reduce((best,s) => !best || (Number(s.updatedAt)||0) > (Number(best.updatedAt)||0) ? s : best, null);
  if (!latest) return lastCharacter;
  const chosen = characterForModel(latest.model) || characterForModel(latest.provider)
    || VISUAL_AGENT_DEFAULTS[latest.agentId];
  if (CHARACTERS.has(chosen)) lastCharacter = chosen;
  return lastCharacter;
}
function resolveCrosspetVisual(theme, sessions, state, file) {
  if (!theme || theme._id !== "crosspet-auto" || typeof file !== "string") return file;
  const match = /^cp-(claude|gpt|deepseek|gemini|glm|qwen|grok)-([a-z0-9-]+)\.svg$/.exec(file);
  if (!match) return file; // User-provided overrides remain authoritative.
  const character = chooseCharacter(sessions,state);
  const candidate = `cp-${character}-${match[2]}.svg`;
  const dir = path.join(theme._themeDir,"assets");
  return fs.existsSync(path.join(dir,candidate)) ? candidate : file;
}
module.exports = { characterForModel, chooseCharacter, resolveCrosspetVisual };
