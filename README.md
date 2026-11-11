# CrossPet Plus

**以 CrossPet 原生桌宠为主体，增加 Clawd 的开发任务、审批与 WSL／SSH 连接。**

这是个人使用的非官方衍生版。Windows 使用 CrossPet 的 WPF + WebView2 应用，macOS 使用原生 Swift + WKWebView 应用；两端直接使用原版 `app/web/` 页面、角色和互动逻辑，`desktop/` 中的 Clawd 作为随程序启动的后台服务。

![CrossPet 角色](docs/images/characters.webp)

## 功能来源

| 功能 | 使用的实现 |
|---|---|
| 角色／换装、点击反馈、拖动、贴边、自动跟随前台与模型 | CrossPet 原生程序和原版网页 |
| 多桌宠、集合／解散、友谊、访客、时段／节日行为、角色台词 | CrossPet 原版逻辑 |
| 同一客户端一／二／三任务状态、动作、完成／错误卡片 | CrossPet 原版多会话逻辑；新增 Clawd 会话来源 |
| 派子任务时的动作 | CrossPet 原版 delegating 姿态；不按子代理数量另设动画分档 |
| 原生设置、接入工具、额度、反馈与开发者工具 | CrossPet 原版实现 |
| 审批卡片、问题／计划审阅、任务面板、终端跳转与通知 | 复用 Clawd 的完整后台与功能窗口 |
| 本机集成、WSL 配对、SSH 部署／连接／重连 | 复用 Clawd 接入与远程实现 |

默认关闭自动审批，开启危险操作提醒。某个代理或环境只能通知或回退到原生审批时，继续遵循 Clawd 的限制。普通网页聊天或没有上报状态的 API 调用不会自动被监控。

Clawd 的隐藏兼容渲染窗口只供其内部状态生命周期使用；实际角色、动画和鼠标交互由 CrossPet 渲染。其纯外观设置不控制 CrossPet 的形象、位置、大小和漫游。更多说明与尚未确认的范围见 [功能和边界](docs/CROSSPET-PLUS.md)、[Windows 原版功能核对](docs/original-crosspet-audit.md)。

## 使用

Windows 运行 **CrossPet.exe**，macOS 打开 **CrossPet.app**。右键菜单保留原版功能，并增加：

- 任务与会话面板
- 审批与等待
- 开发工具接入
- 远程连接（Windows：WSL / SSH；macOS：SSH）

原版 **设置** 管 CrossPet 外观和互动；新增菜单打开 Clawd 功能窗口。不要同时运行独立的 Clawd 或早期使用 Clawd 外壳的 CrossPet Plus。

两端都可连接本机和 SSH 上的代理，Windows 另支持 WSL；远端无需运行 GUI。模型切换依赖代理实际提供的模型标签，中转隐藏模型时不能推测后端。

DSH 里的“鲸鲸”人格、记忆、QQ 和 B 站配置独立于本项目。

## 构建与启动

Windows 构建要求 Node.js 22.12+、.NET 8 SDK、Python 3、Windows WebView2 Runtime。构建脚本可在 Windows 或 WSL 运行。

```sh
npm run setup
npm run build:win:dir   # 原生 CrossPet + Clawd 后台完整目录
npm run build:win       # 同时生成完整 zip
```

产物为 `build/windows/CrossPet/` 与 `build/CrossPet-Windows.zip`。嵌入式 Python 固定版本并核对 SHA-256。解压后运行 `install.cmd`；从源码安装也可在 PowerShell 运行 `scripts/install-windows.ps1 -Start`。安装前从托盘退出旧版，安装器不会强杀进程，会备份配置并逐文件核对复制结果，保留旧安装用于回退。

`npm start` 在 Windows／WSL 打开 Windows 原生 CrossPet。`DOTNET` 可指定 .NET SDK 可执行文件。

macOS 构建要求 macOS 13+、Xcode Command Line Tools、Node.js 22.12+：

```sh
npm run setup
npm run build:mac              # 本机架构：原生桌宠 + 内嵌 Clawd 后台 + zip
npm start                      # 打开本机构建的 Mac Plus 应用
```

Apple 芯片产物为 `build/macos-arm64/CrossPet.app` 和 `build/CrossPet-Plus-<版本>-macOS-arm64.zip`；Intel 用 `npm run build:mac -- --arch=x64`，产物在 `build/macos-x64/`。`build:mac:dir` 只构建目录；`build:mac:upstream` 继续只构建上游原生版。完整应用内嵌 Electron，启动无需另装 Electron；各代理的 CLI / hook 依赖仍按对应接入要求安装。

Mac Plus 支持任务与会话面板、审批与等待、本机开发工具接入、SSH 连接，以及主任务和子代理的桌宠动作。已有独立 Clawd 必须先退出，避免共用配置和单实例锁冲突；不会自动关闭其他应用。原生外观配置首次从原版导入，后台沿用既有 Clawd 配置；已有且启用的集成会按 Clawd 原有逻辑同步。

Mac Plus 更新只识别本仓库对应架构的组合包，当前通过发布页手动更新，避免被上游原版覆盖。构建使用本机临时签名，未做 Apple Developer ID 公证。详见 [Mac Plus 说明](docs/macos-plus.md)。没有增强版 Linux GUI 构建。

## 来源与授权

固定上游提交见 [UPSTREAMS.json](UPSTREAMS.json)。

- CrossPet 原代码：MIT，[许可证](LICENSE)、[原始说明](README-CROSSPET-UPSTREAM.md)。
- Clawd 与新增桥接代码：AGPL-3.0-only，[许可证](LICENSE-AGPL-3.0)、[来源](desktop/UPSTREAM.md)、[第三方说明](desktop/THIRD_PARTY.md)。
- CrossPet 角色和美术：CC BY-NC-SA 4.0，须署名、非商业、相同方式共享，[授权与角色作者](characters/LICENSE.md)。
- 不包含 Clawd 受限像素角色美术。代码授权不改变美术的独立授权。
