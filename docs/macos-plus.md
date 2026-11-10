# Mac Plus

Mac Plus 保留原版 Swift / WKWebView 桌宠，并在应用包内附带 Clawd Electron 后台。角色、动画、换装、额度与原生设置仍由 CrossPet 管理；任务、审批、本机工具接入和 SSH 窗口复用 Clawd。

## 构建与运行

需要 macOS 13+、Xcode Command Line Tools 和 Node.js 22.12+。

```sh
npm run setup
npm run test:plus
npm run test:mac:bridge
npm run build:mac
npm start
```

默认架构为执行 Node 的架构。Apple 芯片应用在 `build/macos-arm64/CrossPet.app`，Intel 应用在 `build/macos-x64/CrossPet.app`。可通过 `npm run build:mac -- --arch=x64` 或 `--arch=arm64` 指定。压缩包名称包含版本和架构，不能将 arm64 后台放进 Intel 分发包。

`npm run build:mac:dir` 跳过 ZIP；`npm run build:mac:upstream` 保留上游原生前端单独构建入口，不包含 Plus 后台。CI 只上传构建产物，不会自动创建 Release。

打开应用后，右键桌宠或菜单栏图标可访问：

- 任务与会话面板。
- 审批与等待；有待处理事项时显示数量。
- 开发工具接入。
- SSH 远程连接。
- 任务与审批设置，以及任务免打扰。

启动后的第一次菜单点击会在后台就绪后送达。后台缺失、退出或独立 Clawd 占用单实例锁时，原版桌宠继续运行，菜单显示后台不可用；退出独立 Clawd 后可再次点击入口重试。不会自动关闭其他应用。

## 配置与更新

原生数据仍在 `~/Library/Application Support/CrossPet/`，原版 hook 状态仍在 `/tmp/crosspet`。原生 hook 根据 `CrossPet/native-bundle-id` 标记重新打开最后启动的原版或 Plus 应用。Plus 桥接专用目录为 `~/Library/Application Support/CrossPet/plus-runtime/`；后台日志为其中的 `backend.log`。后台沿用 `~/Library/Application Support/clawd-on-desk` 与 `~/.clawd`，保留既有 SSH 配置和审批规则。首次启动导入原版外观偏好，Plus 中已有选择优先。macOS 系统登录项按应用身份区分，原版已启用的“开机启动”需要在 Plus 设置中重新开启。

Clawd 的启动逻辑可能同步此前已安装且启用的集成；关闭某个集成仍使用现有设置。Mac 无本机 WSL 功能，可通过 SSH 连接远端。审批是否可直接操作取决于对应代理、会话来源和原有权限策略。

Plus 更新只检查 `ValkyrieNox/crosspet-plus` 中与本机应用架构匹配的 `CrossPet-Plus-<版本>-macOS-<架构>.zip`。当前更新打开发布页手动替换完整应用；不会运行上游安装器，也不会单独替换后台。本机构建经过 ad-hoc 签名，未做 Developer ID 签名和 Apple 公证。

## 验证

```sh
# 原版前端回归 + Plus 协议和构建工具测试
node --test tests/*.test.js

# Swift 模型、后台生命周期、菜单初次点击排队、暂停与重载、宿主锁与多屏坐标
npm run test:mac:bridge

# 检查实际组合包的原生菜单和升级保护（不启动真实集成）
build/macos-arm64/CrossPet.app/Contents/MacOS/CrossPet --crosspet-native-menu-probe

# 真实内嵌 Electron / 桥接模块，隔离 profile 与模拟内容窗口；不会注册个人 hooks
node tests/macos_plus_service_smoke.cjs \
  'build/macos-arm64/CrossPet.app/Contents/Helpers/CrossPet Plus.app/Contents/MacOS/CrossPet Plus'
```

协议 smoke 使用实际打包的 Electron 与桥接模块，窗口内显示测试内容；它验证四种导航命令、不可见兼容渲染器、锚点传递、心跳和退出清理，不等同于真实代理审批或 SSH 主机连通性验证。真实代理运行、终端跳转、远端部署、审批气泡跟随和多屏拖动仍应在目标环境逐项验收；Intel 构建成功也不等于完成 Intel 真机交互验证。


## 本次验证记录（2026-11-10）

- 根目录 Node 自动测试：240/240。
- 完整页面切换/多桌宠场景：60/60；原测试宿主缺少已有 Collaboration 模块与 DOM 元素，补齐后运行。
- 原生设置界面：23/23；UI 状态所有权：22/22；相关 Clawd 后台回归：47/47。
- Swift 桥接测试通过，覆盖过期/外来实例、去重、最新动作优先、暂停/重载、宿主锁、启动排队、退出与卡住后恢复。
- arm64、x64 完整组合包均构建成功，原生菜单/更新保护 probe、内嵌 Electron 桥接 smoke、深层签名和 ZIP 完整性检查通过。
- x64 在 Apple 芯片上经 Rosetta 运行；首次冷翻译使 18 秒 smoke 等待超时，预热后的重试通过。尚未在 Intel 实机验证 GUI，也未联调真实代理审批或 SSH 主机。

兼容性复查修复了原生 hook 打开原版应用而非 Plus 的问题，并将本机 GPT 额度观察放到显示状态仲裁之前，保留 Stop 后的即时刷新。复查结果为 246 项 Node 测试、60 个完整页面场景、16 个 Python 用例（另有 1 项跳过）、5 个 DSH 场景和原版额度探针通过。

plus.5 合并包含 SSH IPv4/IPv6 选择与统一后台入口。Mac 服务模式关闭后台托盘，仅由原生爪印菜单承载入口；生成的 Mac 模板图为 18×18 / 36×36。任务免打扰控制 Clawd 后台的 DND 和审批提示。
