// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname,"..");
if (process.platform === "linux" && process.env.WSL_DISTRO_NAME) {
  const ps = spawn("powershell.exe",["-NoProfile","-Command",
    "Start-Process -FilePath (Join-Path $env:LOCALAPPDATA 'Programs\\CrossPet\\CrossPet.exe')"],{stdio:"inherit"});
  ps.on("exit",code => { process.exitCode = code || 0; });
  ps.on("error",error => { console.error(error.message); process.exitCode = 1; });
} else if (process.platform === "win32") {
  const installed = path.join(process.env.LOCALAPPDATA,"Programs","CrossPet","CrossPet.exe");
  const built = path.join(root,"build","windows","CrossPet","CrossPet.exe");
  const exe = fs.existsSync(installed) ? installed : built;
  if (!fs.existsSync(exe)) throw new Error("Run npm run build:win:dir and install.ps1 first.");
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  spawn(exe,[],{cwd:path.dirname(exe),env,detached:true,stdio:"ignore"}).unref();
} else {
  throw new Error("The combined native app currently targets Windows (including WSL agents). Original macOS sources remain in app/mac.");
}
