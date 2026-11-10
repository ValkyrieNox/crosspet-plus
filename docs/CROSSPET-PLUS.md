# CrossPet Plus 的功能与边界

## 组成

- 根目录保留 CrossPet 原始代码、角色、服装和许可证。
- `desktop/` 引入固定版本的 Clawd 完整功能代码。不是重新实现一套审批或 SSH 协议。
- `scripts/prepare-desktop.cjs` 将 CrossPet 角色图编译为 Clawd 主题，生成自主绘制的界面资源。
- `desktop/src/crosspet-visual.js` 只决定显示哪一个角色，不参与任何权限决定。

## 功能对应

| 能力 | 保留的实现 | CrossPet 显示 |
|---|---|---|
| 审批队列、批准／拒绝、问题选择、计划审阅 | permission、server-route-permission、bubble、permission-queue | 等待确认姿态，原审批卡片 |
| 一个／两个／三个以上并行任务 | state、state-visual-resolver 的 workingTiers | 工作／左右忙碌／手忙脚乱，1／2／3+ 标记 |
| 多个子代理协作 | subagent-lifecycle、jugglingTiers | 协作分档动作 |
| 点击、双击、拖动、连续点击反馈 | pet-interaction-ipc、hit-renderer、renderer | 摸头、开心、惊讶、不满等原角色姿态 |
| 完成、失败、等待输入 | 原状态优先级和提示生命周期 | 完成、出错、等待姿态与提示音 |
| 会话面板、HUD、终端跳转、快捷键 | dashboard、session-hud、session-focus | 原功能界面 |
| 本机、WSL | 原集成安装器、WSL Scan / Pair | 同一套 CrossPet 形象 |
| SSH 远程、重连、部署／修复、远端状态 | remote-ssh-*、原 remote hooks | 同一套 CrossPet 形象 |
| 额度、上下文、通知、免打扰、漫游、边缘模式 | Clawd 原模块 | CrossPet 主题和原功能界面 |
| Telegram／飞书审批、Slack、手机只读页面、本地小结 | Clawd 原模块 | 保留为可选功能，不自动绑定账号或发送消息 |

“与 Clawd 相同”也包括它的限制：某个工具／环境只能提醒或回退原生审批时，本项目不会伪造一个可批准按钮。
Codex Auto 模式对远端、WSL 等来源的审批接管限制继续保留；需要按原界面明确选择 Intercept 时由用户选择。
远程配置只通过设置页管理，不绕过源项目的身份、隧道和部署锁。

## 外观

默认“CrossPet · 随模型切换”按获准进入运行时的可见会话模型选择 Claude、GPT、DeepSeek、Gemini、GLM、Qwen 或 Grok。
识别失败保留上一个角色；中转服务隐藏真实模型时不推测其后端。工作环境本机／WSL／SSH不改变此规则。
在设置的主题页选具体 CrossPet 角色或服装可固定外观。

动画是 CrossPet 姿态图片与程序动画组合，不是 Live2D。并行任务和子代理数量是两种不同统计，各自使用原 Clawd 的计数口径。
原 CrossPet 的多桌宠友谊／访客剧情没有移植进 Clawd 的单宠主题接口；原应用代码仍保留在根目录。
Clawd 的像素角色和原配饰美术不分发，功能接口保留，配饰使用程序生成的简单替代图。

## 配置与升级

Windows 增强版沿用 `%APPDATA%\clawd-on-desk` 和 `~/.clawd`，方便保留既有接入与 SSH 配置，也沿用单实例锁。
必须退出原 Clawd 后再运行增强版；不要同时运行原 CrossPet 的接入脚本和增强版审批内核。
新装默认关闭自动审批、开启危险命令提醒；已有配置的切换应先备份，再通过设置更改。

更新源指向 `ValkyrieNox/crosspet-plus`，不使用上游 Clawd 安装包覆盖本项目。上游源码提交记录于 `UPSTREAMS.json`。
所有运行期账号、SSH 配置、聊天、PAT、运行日志和备份留在仓库外。

## 验证记录

本文件描述代码组成和能力来源，不表示每台实际设备或每种远端配置均已验证。
构建产物、运行状态和本机部署记录另存本地，不把上游测试记录当成本项目测试结果。
