// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
// Model labels for the native CrossPet renderer; no art or approval logic.
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
module.exports = { characterForModel };
