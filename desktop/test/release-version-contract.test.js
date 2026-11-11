"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveTagName, verifyReleaseVersion } = require("../scripts/verify-release-version");

function makeFixture(t, { packageVersion = "1.2.3", lockVersion = packageVersion,
  rootVersion = packageVersion, releaseVersion = packageVersion } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-release-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs", "releases"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: packageVersion }));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({
    version: lockVersion,
    packages: { "": { version: rootVersion } },
  }));
  if (releaseVersion) {
    fs.writeFileSync(path.join(root, "docs", "releases", `release-v${releaseVersion}.md`), "# release\n");
  }
  return root;
}

test("Plus workspace and backend each keep their authoritative versions in sync", () => {
  const root = path.join(__dirname, "..", "..");
  const workspace = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
  assert.match(version, /^\d+\.\d+\.\d+-plus\.\d+$/);
  assert.equal(workspace.version, version);
  // The dependency-free workspace currently has no lockfile. Check it if added.
  const rootLock = path.join(root, "package-lock.json");
  if (fs.existsSync(rootLock)) {
    const lock = JSON.parse(fs.readFileSync(rootLock, "utf8"));
    assert.equal(lock.version, version);
    assert.equal(lock.packages[""].version, version);
  }
  const backend = require("../package.json");
  const backendLock = require("../package-lock.json");
  assert.match(backend.version, /^\d+\.\d+\.\d+-plus\.\d+$/);
  assert.equal(backendLock.version, backend.version);
  assert.equal(backendLock.packages[""].version, backend.version);
});

test("the authoritative draft smoke checklist tracks the current package version", { skip: "Upstream-only smoke checklist is not part of Plus native releases" }, () => {
  const root = path.join(__dirname, "..");
  const version = require(path.join(root, "package.json")).version;
  const escapedVersion = version.replace(/\./g, "\\.");
  const processDoc = fs.readFileSync(path.join(root, "docs", "project", "release-process.md"), "utf8");
  assert.match(processDoc, new RegExp(`### v${escapedVersion} Draft Smoke Checklist`));
  assert.match(processDoc, new RegExp("packaged app shows `" + escapedVersion + "` metadata"));
  assert.match(processDoc, new RegExp("About shows `v" + escapedVersion + "`"));
});

test("package, lock root, release note, and tag must agree exactly", (t) => {
  const root = makeFixture(t, { lockVersion: "1.2.2", rootVersion: "1.2.1", releaseVersion: "" });
  const result = verifyReleaseVersion({
    root,
    env: { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.2.4" },
  });

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.includes("package-lock.json version")));
  assert.ok(result.errors.some((entry) => entry.includes("package-lock root version")));
  assert.ok(result.errors.some((entry) => entry.includes("missing release note")));
  assert.ok(result.errors.some((entry) => entry.includes("must exactly equal")));
});

test("branch workflow refs are ignored while tag refs are enforced", () => {
  assert.strictEqual(resolveTagName({ GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" }), "");
  assert.strictEqual(resolveTagName({ GITHUB_REF: "refs/tags/v2.0.0" }), "v2.0.0");
});

test("Plus build workflow packages both native platforms using root build scripts", () => {
  const root = path.join(__dirname, "..", "..");
  const workflow = require("js-yaml").load(fs.readFileSync(path.join(root, ".github/workflows/build-desktop.yml"), "utf8"));
  assert.deepEqual(workflow.on.push.tags, ["v*-plus.*"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const pkg = require("../../package.json");
  for (const [jobName, script] of [["macos", "build:mac"], ["windows", "build:win"]]) {
    const steps = workflow.jobs[jobName].steps;
    const setupAt = steps.findIndex(step => step.run === "npm run setup");
    const buildAt = steps.findIndex(step => step.run && step.run.startsWith(`npm run ${script}`));
    assert.ok(setupAt >= 0 && buildAt > setupAt, `${jobName} prepares its backend before packaging`);
    assert.equal(pkg.scripts[script], `node scripts/build-${jobName === "macos" ? "macos" : "windows"}.cjs`);
    const upload = steps.find(step => step.uses === "actions/upload-artifact@v4");
    assert.equal(upload.with["if-no-files-found"], "error");
  }
});
