// SPDX-License-Identifier: AGPL-3.0-only
// Reproducible CrossPet -> Clawd theme compiler. No network or user-config IO.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const root = path.resolve(__dirname, "..");
const desktop = path.join(root, "desktop");
const assets = path.join(desktop, "assets");
const manifest = require("./desktop-asset-paths.json");
const { validateTheme } = require("../desktop/src/theme-schema");
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function json(file, value) {
  if (path.basename(file) === "theme.json") {
    const errors = validateTheme(value);
    if (errors.length) throw new Error(`${file}: ${errors.join("; ")}`);
  }
  write(file, JSON.stringify(value, null, 2) + "\n");
}
function escape(s) { return String(s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c])); }
const baseIds = ["claude", "gpt", "deepseek", "gemini", "glm", "qwen", "grok"];
const characters = fs.readdirSync(path.join(root, "characters"), { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith("egg-") && /^[a-z][a-z0-9-]*$/.test(e.name))
  .filter(e => fs.existsSync(path.join(root, "characters", e.name, "character.json")))
  .map(e => ({ id: e.name, ...JSON.parse(fs.readFileSync(path.join(root, "characters", e.name, "character.json"), "utf8")) }));
const idleFallback = path.join(root, "characters", "claude", "idle.webp");
const imageCache = new Map();
function image(id, poses) {
  for (const pose of poses) {
    for (const ext of ["webp", "png"]) {
      const file = path.join(root, "characters", id, `${pose}.${ext}`);
      if (fs.existsSync(file)) {
        if (!imageCache.has(file)) imageCache.set(file, `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`);
        return imageCache.get(file);
      }
    }
  }
  if (!imageCache.has(idleFallback)) imageCache.set(idleFallback, `data:image/webp;base64,${fs.readFileSync(idleFallback).toString("base64")}`);
  return imageCache.get(idleFallback);
}
const poseSets = {
  idle: ["idle"], thinking: ["thinking", "reading", "idle"],
  "working-1": ["running", "writing", "reading", "idle"],
  "working-2": ["busy_left", "running", "idle"],
  "working-3": ["swamped_left", "busy_left", "running", "idle"],
  reading: ["reading", "thinking", "idle"], writing: ["writing", "running", "idle"],
  running: ["running", "writing", "idle"], searching: ["searching", "reading", "idle"],
  drawing: ["drawing", "writing", "idle"],
  "juggling-1": ["delegating", "running", "idle"],
  "juggling-2": ["busy_left", "delegating", "idle"],
  "juggling-3": ["swamped_left", "busy_left", "idle"],
  attention: ["happy", "proud", "idle"], error: ["oops", "surprised", "idle"],
  notification: ["asking", "surprised", "idle"], sweeping: ["compact", "reading", "idle"],
  carrying: ["proud", "happy", "idle"], sleeping: ["sleeping", "yawn", "idle"],
  yawning: ["yawn", "sleeping", "idle"], dozing: ["yawn", "sleeping", "idle"],
  collapsing: ["sleeping", "yawn", "idle"], waking: ["stretch", "happy", "idle"],
  dizzy: ["dizzy", "surprised", "idle"], roam: ["stretch", "idle"],
  "react-drag": ["surprised", "dizzy", "idle"], "react-left": ["pat", "happy", "idle"],
  "react-right": ["coaxed", "pat", "idle"], "react-double": ["forgiven", "happy", "idle"],
  "react-annoyed": ["annoyed", "puffed", "idle"],
  "idle-extra": ["hum", "stretch", "idle-2", "idle"],
  "mini-idle": ["idle"], "mini-enter": ["stretch", "idle"],
  "mini-enter-sleep": ["sleeping", "idle"], "mini-crabwalk": ["stretch", "idle"],
  "mini-peek": ["surprised", "idle"], "mini-peek-hold": ["idle"],
  "mini-alert": ["asking", "surprised", "idle"], "mini-happy": ["happy", "idle"],
  "mini-sleep": ["sleeping", "idle"], "mini-sleep-peek": ["yawn", "idle"],
  "mini-working": ["running", "writing", "idle"]
};
const names = {
  idle:"在这里",thinking:"思考中",reading:"读文件",writing:"写代码",running:"运行命令",searching:"查资料",drawing:"画画",
  "working-1":"一个任务", "working-2":"两个任务", "working-3":"三个以上任务",
  "juggling-1":"一个帮手", "juggling-2":"两个帮手", "juggling-3":"三个以上帮手",
  attention:"完成啦",error:"遇到问题",notification:"等你确认",sweeping:"整理上下文",carrying:"辛苦啦"
};
function svg(id, pose, spec = {}) {
  const candidates = poseSets[pose] || poseSets.idle;
  const src = image(id, candidates);
  const many = /-(2|3)$/.test(pose);
  const alternate = many ? image(id, [pose.endsWith("3") ? "swamped_right" : "busy_right", ...candidates]) : null;
  const sleepy = ["sleeping", "mini-sleep", "dozing", "collapsing"].includes(pose);
  const quick = pose.includes("working") || pose.includes("juggling") || ["running", "writing", "react-drag", "dizzy"].includes(pose);
  const color = spec.accent || "#8cb9ff";
  const label = names[pose] || "";
  const count = /-(1|2|3)$/.exec(pose)?.[1];
  const frames = alternate && alternate !== src
    ? `<image class="frame-a" width="1024" height="1024" href="${src}"/><image class="frame-b" width="1024" height="1024" href="${alternate}"/>`
    : `<image width="1024" height="1024" href="${src}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${escape(spec.name || id)} ${escape(label || pose)}">
<style>
.body{transform-origin:512px 900px;animation:breathe ${sleepy ? 5 : quick ? .65 : 3.2}s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(${quick ? -9 : -4}px) rotate(${many ? 1.3 : 0}deg)}}
.frame-a{animation:frame-a 1.1s steps(1,end) infinite}.frame-b{animation:frame-b 1.1s steps(1,end) infinite}
@keyframes frame-a{0%,100%{opacity:1}50%{opacity:0}}@keyframes frame-b{0%,100%{opacity:0}50%{opacity:1}}
.spark{animation:pulse 1.3s ease-in-out infinite}@keyframes pulse{50%{opacity:.35;transform:translateY(-8px)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.frame-b{opacity:0}}
</style><g class="body">${frames}</g>
${count ? `<g class="spark"><circle cx="830" cy="205" r="62" fill="${escape(color)}" stroke="white" stroke-width="7"/><text x="830" y="230" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="72">${count}${count === "3" ? "+" : ""}</text></g>` : ""}
${label ? `<rect x="272" y="920" width="480" height="66" rx="30" fill="#172238" fill-opacity=".88"/><text x="512" y="966" fill="white" text-anchor="middle" font-size="36" font-family="sans-serif">${escape(label)}</text>` : ""}
</svg>\n`;
}
function config(character, id) {
  const f = pose => `cp-${character.id}-${pose}.svg`;
  const statePose = {idle:"idle",working:"working-1",thinking:"thinking",juggling:"juggling-1",attention:"attention",error:"error",notification:"notification",sweeping:"sweeping",carrying:"carrying",sleeping:"sleeping",yawning:"yawning",dozing:"dozing",collapsing:"collapsing",waking:"waking",dizzy:"dizzy",roam:"roam"};
  // Executing deliberately inherits working tiers, as it does in Clawd.
  const states = Object.fromEntries(Object.entries(statePose).map(([s,p])=>[s,[f(p)]]));
  const tiers = key => [3,2,1].map(n=>({minSessions:n,file:f(`${key}-${n}`)}));
  return {
    schemaVersion:1,name: id === "crosspet-auto" ? "CrossPet · 随模型切换" : `CrossPet · ${character.name}`,
    version:"1.0.0",author:"CrossPet contributors; ValkyrieNox integration",repo:"https://github.com/ValkyrieNox/crosspet-plus",
    description:"CrossPet character art, Clawd task/permission/WSL/SSH runtime. Artwork: CC BY-NC-SA 4.0.",
    viewBox:{x:0,y:0,width:1024,height:1024},
    layout:{contentBox:{x:100,y:60,width:824,height:940},marginBox:{x:30,y:0,width:964,height:1024},centerX:512,baselineY:1000,visibleHeightRatio:.85,baselineBottomRatio:.03},
    objectScale:{widthRatio:1,heightRatio:1,offsetX:0,offsetY:0},
    eyeTracking:{enabled:false,states:[]},sleepSequence:{mode:"full"},states,
    hitBoxes:{default:{x:120,y:90,w:784,h:900},sleeping:{x:120,y:90,w:784,h:900},wide:{x:90,y:60,w:844,h:940}},
    workingTiers:tiers("working"),jugglingTiers:tiers("juggling"),
    displayHintMap:Object.fromEntries(["reading","writing","running","searching","drawing"].flatMap(p=>[[p,f(p)],[`${p}.svg`,f(p)]])),
    idleAnimations:[{file:f("idle-extra"),duration:5500}],
    reactions:{drag:{file:f("react-drag")},clickLeft:{file:f("react-left"),duration:2200},clickRight:{file:f("react-right"),duration:2200},double:{files:[f("react-double")],duration:2500},annoyed:{file:f("react-annoyed"),duration:3000}},
    miniMode:{supported:true,offsetRatio:.65,viewBox:{x:0,y:0,width:1024,height:1024},states:Object.fromEntries(Object.keys(poseSets).filter(p=>p.startsWith("mini-")).map(p=>[p,[f(p)]]))},
    sounds:{complete:"complete.wav",confirm:"confirm.wav"}
  };
}
for (const character of characters) {
  const id = `crosspet-${character.id}`;
  const dir = path.join(desktop,"themes",id);
  json(path.join(dir,"theme.json"),config(character,id));
  for (const pose of Object.keys(poseSets)) write(path.join(dir,"assets",`cp-${character.id}-${pose}.svg`),svg(character.id,pose,character));
}
const auto = path.join(desktop,"themes","crosspet-auto");
json(path.join(auto,"theme.json"),config(characters.find(c=>c.id==="claude"),"crosspet-auto"));
fs.mkdirSync(path.join(auto,"assets"),{recursive:true});
for (const id of baseIds) {
  for (const pose of Object.keys(poseSets)) fs.copyFileSync(path.join(desktop,"themes",`crosspet-${id}`,"assets",`cp-${id}-${pose}.svg`),path.join(auto,"assets",`cp-${id}-${pose}.svg`));
}
// The upstream loader's fail-closed fallback is still named clawd. Give that
// reserved fallback a CrossPet body, never an unlicensed upstream sprite.
const fallback=path.join(desktop,"themes","clawd");
json(path.join(fallback,"theme.json"),config(characters.find(c=>c.id==="claude"),"crosspet-claude"));
fs.cpSync(path.join(desktop,"themes","crosspet-claude","assets"),path.join(fallback,"assets"),{recursive:true});
json(path.join(desktop,"themes","crosspet-manifest.json"),{baseIds,characters:characters.map(c=>({id:c.id,name:c.name})),poses:Object.keys(poseSets)});

// Small original raster interface icon; PNG/ICO encoding uses only Node core.
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const n=Buffer.alloc(4);n.writeUInt32BE(data.length);const sum=Buffer.alloc(4);sum.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,sum]);}
function png(size){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){for(let x=0;x<size;x++){const dx=x/size-.5,dy=y/size-.5;const i=y*(size*4+1)+1+x*4;const circle=dx*dx+dy*dy<.22;const c=(dx*dx+dy*dy<.115&&dx*dx+dy*dy>.055&&!(dx>.08&&Math.abs(dy)<.15));raw[i]=c?240:72;raw[i+1]=c?248:125;raw[i+2]=c?255:224;raw[i+3]=circle?255:0;}}const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",h),chunk("IDAT",zlib.deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);}
const icon=png(256);
for(const relative of manifest.png) write(path.join(assets,relative),icon);
for(const name of ["icon.png","dock-icon.png","tray-icon.png","tray-iconTemplate.png","tray-iconTemplate@2x.png"]) write(path.join(assets,name),icon);
for(const size of [16,32,48,64,128,256,512]) write(path.join(assets,"icons",`${size}x${size}.png`),png(size));
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=0;ico[7]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(icon.length,14);ico.writeUInt32LE(22,18);write(path.join(assets,"icon.ico"),Buffer.concat([ico,icon]));
for(const relative of manifest.svg){
  const accessory=relative.startsWith("accessories/");
  write(path.join(assets,relative),accessory?'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path d="M12 40L24 8L50 28L76 8L88 40Z" fill="#79a7ef" stroke="white" stroke-width="4"/><circle cx="50" cy="40" r="13" fill="#f5d880"/></svg>':svg("claude","idle",{name:"CrossPet Claude"}));
}
function tone(notes){const rate=22050,length=Math.floor(rate*.34);const samples=Buffer.alloc(length*2);for(let i=0;i<length;i++){const t=i/rate;const frequency=notes[Math.min(notes.length-1,Math.floor(i/length*notes.length))];const envelope=Math.sin(Math.PI*i/length)**2; samples.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*t)*envelope*4500),i*2);}const h=Buffer.alloc(44);h.write("RIFF");h.writeUInt32LE(36+samples.length,4);h.write("WAVEfmt ",8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write("data",36);h.writeUInt32LE(samples.length,40);return Buffer.concat([h,samples]);}
write(path.join(assets,"sounds","complete.wav"),tone([523.25,659.25,783.99]));
write(path.join(assets,"sounds","confirm.wav"),tone([659.25,523.25]));
write(path.join(assets,"LICENSE.md"),'CrossPet character artwork and generated character animations: CC BY-NC-SA 4.0; see ../licenses/CROSSPET-ART.md. Interface icons, accessory placeholders and synthesized sounds generated by scripts/prepare-desktop.cjs are original CrossPet Plus work under AGPL-3.0-only. Restricted Clawd artwork is not included.\n');
for (const [source, name] of [["LICENSE","CROSSPET-CODE-MIT.txt"],["characters/LICENSE.md","CROSSPET-ART.md"],["LICENSE-AGPL-3.0","AGPL-3.0.txt"]]) {
  write(path.join(desktop,"licenses",name),fs.readFileSync(path.join(root,source)));
}
console.log(`Prepared ${characters.length} CrossPet characters/outfits, automatic model selection, task tiers, reactions and desktop assets.`);
