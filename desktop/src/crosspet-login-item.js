// SPDX-License-Identifier: AGPL-3.0-only
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Delegate only to the paired native host resolved during service launch.
// Fixed argv, no shell, no GUI, and no independently registered backend item.
function createCrosspetLoginItem(host) {
  if (typeof host !== "string" || !path.isAbsolute(host)
    || path.basename(host).toLowerCase() !== "crosspet.exe" || !fs.statSync(host).isFile()) {
    throw new Error("The paired native CrossPet host is unavailable.");
  }
  function run(command) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(host, [command], {
      windowsHide: true, stdio: "ignore", timeout: 10000, env,
    });
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw new Error(command === "--login-status"
        ? "无法读取 Windows 开机启动状态。"
        : "Windows 未保留 CrossPet 的开机启动设置，请检查启动项管理软件中的 CrossPet 设置。");
    }
    return result.status;
  }
  return {
    read: () => run("--login-status") === 0,
    write(enabled) {
      if (typeof enabled !== "boolean") throw new TypeError("Startup must be a boolean.");
      if (run(enabled ? "--login-enable" : "--login-disable") !== 0
        || (run("--login-status") === 0) !== enabled) {
        throw new Error("Windows 未保留 CrossPet 的开机启动设置，请检查启动项管理软件中的 CrossPet 设置。");
      }
    },
  };
}

module.exports = { createCrosspetLoginItem };
