// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function parseOptions(args, hostArch = process.arch) {
  let arch = hostArch, zip = true, assembleOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dir") zip = false;
    else if (arg === "--assemble-only") assembleOnly = true;
    else if (arg === "--arch") arch = args[++i];
    else if (arg.startsWith("--arch=")) arch = arg.slice(7);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!["arm64", "x64"].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);
  return { arch, zip, assembleOnly };
}
function pathsFor(root, arch, version) {
  return {
    app: path.join(root, "build", `macos-${arch}`, "CrossPet.app"),
    runtime: path.join(root, "desktop", "dist", arch === "arm64" ? "mac-arm64" : "mac", "CrossPet Plus.app"),
    zip: path.join(root, "build", `CrossPet-Plus-${version}-macOS-${arch}.zip`),
  };
}
function validateRuntime(runtime, arch) {
  const exe = path.join(runtime, "Contents", "MacOS", "CrossPet Plus");
  const data = fs.readFileSync(exe);
  const expectedCpu = arch === "arm64" ? 0x0100000c : 0x01000007;
  // Electron's architecture-specific distributions contain thin little-endian 64-bit Mach-O executables.
  if (data.length < 32 || data.readUInt32LE(0) !== 0xfeedfacf || data.readUInt32LE(4) !== expectedCpu) {
    throw new Error(`Backend architecture does not match ${arch}: ${exe}`);
  }
  if (!fs.statSync(path.join(runtime, "Contents", "Resources", "app.asar")).isFile()) throw new Error("Missing service runtime app.asar");
}
function copyRuntime(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
}
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} exited with ${result.status}`);
}
function build(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (process.platform !== "darwin") throw new Error("Build the native Mac app on macOS.");
  const root = path.resolve(__dirname, "..");
  const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
  const files = pathsFor(root, options.arch, version);
  const common = { cwd: root };
  if (!options.assembleOnly) {
    run(process.execPath, ["scripts/prepare-desktop.cjs"], common);
    const builder = path.join(root, "desktop", "node_modules", "electron-builder", "cli.js");
    const builderArgs = [builder, "--mac", `--${options.arch}`, "--dir", "--publish", "never",
      `--config.mac.icon=${path.join(root, "app", "icon", "AppIcon.png")}`];
    // Reuse npm's verified local distribution on the host architecture instead of downloading it twice.
    const electronDist = process.env.CROSSPET_ELECTRON_DIST || (options.arch === process.arch
      ? path.join(root, "desktop", "node_modules", "electron", "dist") : null);
    if (electronDist) builderArgs.push(`--config.electronDist=${electronDist}`);
    run(process.execPath, builderArgs, { cwd: path.join(root, "desktop") });
  }
  validateRuntime(files.runtime, options.arch);
  run("/bin/bash", ["app/build.sh"], { ...common, env: { ...process.env,
    CROSSPET_APP_OUT: files.app, CROSSPET_PLUS: "1", CROSSPET_MAC_ARCH: options.arch } });
  copyRuntime(files.runtime, path.join(files.app, "Contents", "Helpers", "CrossPet Plus.app"));
  const licenses = path.join(files.app, "Contents", "Resources", "licenses");
  fs.mkdirSync(licenses, { recursive: true });
  for (const name of ["LICENSE", "LICENSE-AGPL-3.0", "UPSTREAMS.json", "desktop/THIRD_PARTY.md", "desktop/UPSTREAM.md", "characters/LICENSE.md"]) {
    fs.copyFileSync(path.join(root, name), path.join(licenses, name.replaceAll("/", "-")));
  }
  run("/usr/bin/codesign", ["--force", "--deep", "-s", "-", files.app], common);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", files.app], common);
  if (options.zip) {
    fs.rmSync(files.zip, { force: true });
    run("/usr/bin/ditto", ["-c", "-k", "--norsrc", "--noextattr", "--keepParent", files.app, files.zip], common);
    console.log(`Package: ${files.zip}`);
  }
  console.log(`Native Mac Plus (${options.arch}): ${files.app}`);
  return files;
}
module.exports = { parseOptions, pathsFor, validateRuntime, copyRuntime, build };
if (require.main === module) {
  try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
