# CrossPet Plus

**以 CrossPet 原生桌宠为主体，增加 Clawd 的开发任务、审批与 WSL／SSH 连接。**

这是个人使用的非官方衍生版。Windows 主程序仍然是 CrossPet 的 WPF + WebView2 应用，直接使用原版 `app/web/` 页面、角色和互动逻辑；`desktop/` 中的 Clawd 作为随程序启动的后台服务。不是把 CrossPet 的图片放进 Clawd 桌宠。

![CrossPet 角色](docs/images/characters.webp)

## 功能来源

| 功能 | 使用的实现 |
|---|---|
| 角色／换装、点击反馈、拖动、贴边、自动跟随前台与模型 | CrossPet 原生程序和原版网页 |
| 多桌宠、集合／解散、友谊、访客、时段／节日行为、角色台词 | CrossPet 原版逻辑 |
| 同一客户端一／二／三任务状态、动作、完成／错误卡片 | CrossPet 原版多会话逻辑；新增 Clawd 会话来源 |
| 子代理一／二／三及以上协作动作、数量标记 | Clawd 既有子代理计数；新增 CrossPet 协作分档 |
| 原生设置、接入工具、额度、反馈与开发者工具 | CrossPet 原版实现 |
| 审批卡片、问题／计划审阅、任务面板、终端跳转与通知 | 复用 Clawd 的完整后台与功能窗口 |
| 本机集成、WSL 配对、SSH 部署／连接／重连 | 复用 Clawd 接入与远程实现 |

默认关闭自动审批，开启危险操作提醒。某个代理或环境只能通知或回退到原生审批时，继续遵循 Clawd 的限制。普通网页聊天或没有上报状态的 API 调用不会自动被监控。

Clawd 的隐藏兼容渲染窗口只供其内部状态生命周期使用；实际角色、动画和鼠标交互由 CrossPet 渲染。其纯外观设置不控制 CrossPet 的形象、位置、大小和漫游。更多说明与尚未确认的范围见 [功能和边界](docs/CROSSPET-PLUS.md)。

## 使用

运行 **CrossPet.exe**。右键菜单保留原版功能，并增加：

- 任务与会话面板
- 审批与等待
- 开发工具接入
- WSL / SSH 远程连接

原版 **设置** 管 CrossPet 外观和互动；新增菜单打开 Clawd 功能窗口。不要同时运行独立的 Clawd 或早期使用 Clawd 外壳的 CrossPet Plus。

Windows 桌宠连接本机、WSL 和 SSH 上的代理；远端无需运行 GUI。模型切换依赖代理实际提供的模型标签，中转隐藏模型时不能推测后端。

DSH 里的“鲸鲸”人格、记忆、QQ 和 B 站配置独立于本项目。

## 构建与启动

要求 Node.js 22.12+、.NET 8 SDK、Python 3、Windows WebView2 Runtime。构建脚本可在 Windows 或 WSL 运行。

```sh
npm run setup
npm run build:win:dir   # 原生 CrossPet + Clawd 后台完整目录
npm run build:win       # 同时生成完整 zip
```

产物为 `build/windows/CrossPet/` 与 `build/CrossPet-Windows.zip`。嵌入式 Python 固定版本并核对 SHA-256。解压后运行 `install.cmd`；从源码安装也可在 PowerShell 运行 `scripts/install-windows.ps1 -Start`。安装前从托盘退出旧版，安装器不会强杀进程，会备份配置并逐文件核对复制结果，保留旧安装用于回退。

`npm start` 在 Windows／WSL 打开 Windows 原生 CrossPet。`DOTNET` 可指定 .NET SDK 可执行文件。

目前增强版的打包和接入代码针对 **Windows 桌面 + 本机／WSL／SSH 代理**。原 CrossPet 的 macOS 源码完整保留，`npm run build:mac:upstream` 构建的是原生 Mac 版，不包含本次 Windows 后台桥接；没有增强版 Linux GUI 构建。

## 来源与授权

固定上游提交见 [UPSTREAMS.json](UPSTREAMS.json)。

- CrossPet 原代码：MIT，[许可证](LICENSE)、[原始说明](README-CROSSPET-UPSTREAM.md)。
- Clawd 与新增桥接代码：AGPL-3.0-only，[许可证](LICENSE-AGPL-3.0)、[来源](desktop/UPSTREAM.md)、[第三方说明](desktop/THIRD_PARTY.md)。
- CrossPet 角色和美术：CC BY-NC-SA 4.0，须署名、非商业、相同方式共享，[授权与角色作者](characters/LICENSE.md)。
- 不包含 Clawd 受限像素角色美术。代码授权不改变美术的独立授权。
