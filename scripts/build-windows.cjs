// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname,"..");
process.chdir(root);
function run(exe,args) {
  const r = spawnSync(exe,args,{cwd:root,stdio:"inherit",env:process.env});
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${exe} exited with ${r.status}`);
}
const localDotnet = path.join(root,".tools","dotnet",process.platform === "win32" ? "dotnet.exe" : "dotnet");
const dotnet = process.env.DOTNET || (fs.existsSync(localDotnet) ? localDotnet : "dotnet");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// npm.cmd needs a shell on Windows; use Node's actual npm CLI instead.
function npmRun(args) {
  if (process.platform === "win32" && process.env.npm_execpath) run(process.execPath,[process.env.npm_execpath,...args]);
  else run(npm,args);
}
const version = fs.readFileSync("VERSION","utf8").trim();
if (!process.argv.includes("--assemble-only")) {
  run(dotnet,["build","app/windows/CrossPet.csproj","-c","Release","-nologo","-v","minimal",
    `-p:Version=${version.split("-")[0]}`,`-p:InformationalVersion=${version}`]);
  run(process.execPath,["scripts/prepare-desktop.cjs"]);
  npmRun(["--prefix","desktop","run","build:win:dir"]);
}
const pyVersion = "3.13.13";
const expected = "8766a8775746235e23cf5aee5027ab1060bb981d93110577adcf3508aa0cbd55";
const archive = `build/downloads/python-${pyVersion}-embed-amd64.zip`;
fs.mkdirSync("build/downloads",{recursive:true});
if (!fs.existsSync(archive)) run(process.platform === "win32" ? "curl.exe" : "curl",
  ["-fLsS","--retry","2",`https://www.python.org/ftp/python/${pyVersion}/python-${pyVersion}-embed-amd64.zip`,"-o",archive]);
const actual = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
if (actual !== expected) throw new Error(`Embedded Python SHA-256 mismatch: ${archive}`);
const out = path.join(root,"build","windows","CrossPet");
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
function copy(src,dst=src) {
  fs.cpSync(path.join(root,src),path.join(out,dst),{recursive:true,filter:file =>
    !["raw",".DS_Store"].includes(path.basename(file))});
}
const bin = "app/windows/bin/Release/net48";
for (const file of ["CrossPet.exe","CrossPet.exe.config","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.Wpf.dll","Microsoft.Web.WebView2.WinForms.dll","runtimes"]) copy(`${bin}/${file}`,file);
copy("app/web","web");
copy("characters"); copy("integrations"); copy("tools/integrate.py");
for (const file of ["VERSION","LICENSE","LICENSE-AGPL-3.0","UPSTREAMS.json"]) copy(file);
for (const file of ["apps.json","install.cmd","uninstall.cmd"]) copy(`app/windows/${file}`,file);
copy("scripts/install-windows.ps1","install.ps1");
copy("scripts/uninstall-windows.ps1","uninstall.ps1");
copy("app/windows/uninstall.ps1","uninstall-upstream.ps1");
copy("app/windows/install.ps1","install-upstream.ps1");
copy("app/icon/AppIcon.ico","AppIcon.ico");
copy("docs/windows.md","使用说明.md"); copy("docs/CROSSPET-PLUS.md","CROSSPET-PLUS.md");
copy("desktop/THIRD_PARTY.md","THIRD_PARTY.md");
copy("desktop/dist/win-unpacked","runtime");
for (const name of fs.readdirSync(out).filter(n=>n.endsWith(".ps1"))) {
  const file = path.join(out,name);
  fs.writeFileSync(file,"\uFEFF"+fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
}
const python = process.platform === "win32" ? "python" : "python3";
run(python,["-c","import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",archive,path.join(out,"python")]);
console.log(`Native CrossPet ${version} + Clawd service: ${out}`);
if (!process.argv.includes("--dir")) {
  run(python,["-c",[
    "import os,sys,zipfile",
    "with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:",
    " for base,dirs,files in os.walk(sys.argv[1]):",
    "  for name in sorted(files):",
    "   p=os.path.join(base,name); z.write(p,os.path.join('CrossPet',os.path.relpath(p,sys.argv[1])))"
  ].join("\n"),out,"build/CrossPet-Windows.zip"]);
  console.log("Package: build/CrossPet-Windows.zip");
}
