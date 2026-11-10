// SPDX-License-Identifier: AGPL-3.0-only
"use strict";

const path = require("node:path");

// Packaged Windows code is an internal component of the native application.
// Opening it directly must reopen CrossPet, never create another desktop app.
function resolveCrosspetLaunch({ platform, isPackaged, execPath, argv, env, parentPid, existsSync, isAlive }) {
  if (platform !== "win32" || !isPackaged) {
    return { mode: argv.includes("--crosspet-service") ? "service" : "standalone" };
  }
  const host = path.join(path.dirname(execPath), "..", "CrossPet.exe");
  if (!existsSync(host)) return { mode: "missing-host" };
  const owner = Number(env.CROSSPET_HOST_PID);
  if (argv.includes("--crosspet-service") && Number.isSafeInteger(owner) && owner > 0
    && owner === parentPid && isAlive(owner)) {
    return { mode: "service", host };
  }
  return { mode: "host", host,
    args: argv.includes("--open-settings-window") ? ["--task-settings"] : [] };
}

module.exports = { resolveCrosspetLaunch };
