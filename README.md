# CrossPet Plus

**CrossPet 的 AI 娘形象，配上 Clawd on Desk 的开发任务、审批和远程连接内核。**

本项目是个人使用的非官方衍生版。根目录保留 [CrossPet](https://github.com/lokicorvus/crosspet) 原始代码和角色；`desktop/` 引入 [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) 1.6.0 的完整功能源码，再加入 CrossPet 外观适配。固定上游提交见 [UPSTREAMS.json](UPSTREAMS.json)。

![CrossPet 角色](docs/images/characters.webp)

## 增强版提供什么

- 审批卡片、批准／拒绝、问题选择和计划审阅；默认关闭自动审批，开启危险操作提醒。
- 一个、两个、三个以上并行任务的不同姿态与数量标记；子代理协作独立分档。
- 点击、双击、拖动、完成提示音、出错和等待反馈，以及睡眠、漫游、贴边模式。
- 原 Clawd 的会话面板、HUD、终端跳转、快捷键、额度和上下文展示。
- 原 Clawd 的本机集成、WSL 配对、SSH 身份管理、部署、连接和重连。
- 13 套 CrossPet 角色／服装；默认按会话上报的模型切换 Claude、GPT、DeepSeek、Gemini、GLM、Qwen、Grok。

保留全部内核代码，不等于每个代理和环境都有相同权限接口：审批能力和原生回退继续遵循 Clawd 原规则。网页聊天或任意 API 调用不会自动产生任务事件。中转服务没有上报实际模型时也无法可靠判断后端模型。

增强版使用 Clawd 的单宠主题接口；原 CrossPet 的多宠友谊／访客剧情仍在原应用中，尚未移植。动画由 CrossPet 姿态图和程序动画组成，不是 Live2D。[详细功能和边界](docs/CROSSPET-PLUS.md)。

## 从源码启动

要求 Node.js 22.12+，在要显示桌宠的系统中运行：

```sh
npm run setup
npm start
```

Windows 桌面建议直接运行 Windows 构建。WSL 中的代理由 Windows 桌宠的设置页进行 Scan / Pair；SSH 主机通过设置页连接和部署。不要在每台服务器上启动一个 GUI。

```sh
npm run build:win       # Windows x64 安装包
npm run build:win:dir   # Windows x64 解包程序
npm run build:mac
npm run build:linux
```

产物位于 `desktop/dist/`。跨系统打包可能需要对应平台工具。GitHub Actions 的 **Build CrossPet Plus** 支持手动构建三个桌面平台。

## 从已有 Clawd 切换

1. 从托盘菜单退出原 Clawd。
2. 备份 `%APPDATA%\clawd-on-desk` 中的设置与所需接入配置。
3. 启动 CrossPet Plus，在主题页选择 **CrossPet · 随模型切换** 或固定角色。
4. 在接入页检查本机／WSL／SSH 的已有连接；需要重新配对或信任时，按原界面完成。

本项目沿用 Clawd 的用户设置目录、hook 协议和单实例锁，便于迁移；两者应交替运行。已有配置的自动审批偏好会被保留，因此切换时请关闭自动审批并打开危险操作提醒。安装／部署不会替你批准后续命令。

DSH 中的“鲸鲸”人格、记忆、QQ 和 B 站配置独立于本应用。关闭 DSH 不影响本桌宠监控开发任务。

## 源码和授权

- 原 CrossPet 代码：MIT，保留 [原许可证](LICENSE) 和 [原始说明](README-CROSSPET-UPSTREAM.md)。
- Clawd 内核及新增集成代码：AGPL-3.0-only，见 [许可证](LICENSE-AGPL-3.0)、[来源记录](desktop/UPSTREAM.md) 和 [第三方说明](desktop/THIRD_PARTY.md)。
- CrossPet 角色、美术和衍生动画：**CC BY-NC-SA 4.0，仅限非商业使用，并须署名和相同方式共享**，见 [角色授权及原作者](characters/LICENSE.md)。
- Clawd 自带的受限像素角色和原配饰美术不包含在本衍生版内。界面图标、替代配饰和提示音由本项目生成。

这是非官方同人项目，与各 AI 产品公司无关。AGPL 代码授权不会改变美术素材的单独授权。
