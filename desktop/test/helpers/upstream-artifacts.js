"use strict";

const { test, describe } = require("node:test");

// Plus excludes the original Clawd artwork and publishes a native combined app.
// Keep its imported source checks visible as skipped tests. Developers with a
// complete upstream checkout can explicitly enable them for comparison.
const enabled = process.env.CROSSPET_TEST_UPSTREAM === "1";
const artworkReason = "Requires original Clawd artwork/provenance, excluded from CrossPet Plus";
const repositoryReason = "Checks upstream Clawd publication/tooling files, excluded from CrossPet Plus";

function withScope(register, reason) {
  return (name, options, fn) => {
    if (typeof options === "function") { fn = options; options = {}; }
    return register(name, { ...options, ...(!enabled ? { skip: reason } : {}) }, fn);
  };
}

function skipUpstreamFile(name, reason) {
  if (enabled) return false;
  test(name, { skip: reason }, () => {});
  return true;
}

module.exports = {
  upstreamArtworkTest: withScope(test, artworkReason),
  upstreamArtworkSuite: withScope(describe, artworkReason),
  upstreamRepositoryTest: withScope(test, repositoryReason),
  skipUpstreamFile,
};
