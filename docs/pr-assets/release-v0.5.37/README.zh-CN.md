# v0.5.37 发布验收

**简体中文** | [English](./README.md)

验收日期：**2026-10-29（Asia/Shanghai）**。基于 main `7792b897a03e43b7cc1e2052f234574d9147eb1d`，加版本、精确依赖与 Skills Starter 最低版本调整。环境为 macOS arm64、Node 22.22.0、pnpm 10.13.1。所有 home、工作区和记忆均为一次性测试数据，没有使用模型凭据或私人数据，也没有改动用户的 Desktop profile。

候选组合为 Starter **0.5.37**、Skills **0.5.4**、Memory Spaces **0.5.24**，其余十六个组件保留原 npm 固定版本。[结构化记录](validation.json) 包含十九个包的完整组合、候选包 SHA-256 与 SHA-512 摘要及结果。六次安装的全部版本均匹配，三个候选包的 **143 个文件**逐字节一致。Starter 解包大小为 **2,180,618 字节**，占现有 2,500,000 字节上限的 87.2%，无需提高上限。

## 真实 WebUI 安装与升级

已有[验收服务](../../../scripts/serve-release-acceptance.mjs) 在隔离 home 中运行未经修改的官方已发布 DSH。回环 Registry 只覆盖三个候选包，其余元数据来自真实 npm。测试夹具的版本检查 preload 和历史发布日期让现有 UI 能发现尚未发布的候选版本；生产发布等待机制保持不变。

分别在 DSH **0.2.0-rc.2**、**0.2.1-rc.2**、**0.2.1-rc.3** 上完成：

1. 从**插件 → 添加插件**安装 `dsh-mnemon@0.5.37`，确认版本，点击**立即启用**后打开记忆系统。状态显示 **dsh-mnemon 0.5.37 / 系统正常**。
2. 在第二个隔离 profile 安装真实 npm **0.5.36**，打开**检查版本**，确认提供 **0.5.37** 和两个组件更新。点击**更新**，确认 **0.5.37 / 待重启**。
3. 重启宿主并重新连接，状态显示运行中的 **0.5.37 / 系统正常**。十九个包的版本及候选制品文件均匹配。

| 宿主 | 全新安装 | 安装后状态 | 发现更新 | 更新完成 | 重启后状态 |
| --- | --- | --- | --- | --- | --- |
| 0.2.0-rc.2 | [安装](fresh020-install.png) | [状态](fresh020-status.png) | [更新](upgrade020-offered.png) | [完成](upgrade020-updated.png) | [运行](upgrade020-status.png) |
| 0.2.1-rc.2 | [安装](fresh021-install.png) | [状态](fresh021-status.png) | [更新](upgrade021-offered.png) | [完成](upgrade021-updated.png) | [运行](upgrade021-status.png) |
| 0.2.1-rc.3 | [安装](freshrc3-install.png) | [状态](freshrc3-status.png) | [更新](upgraderc3-offered.png) | [完成](upgraderc3-updated.png) | [运行](upgraderc3-status.png) |

rc.3 升级前，通过运行时记忆的**添加记忆**对话框写入一条合成项目事实。升级、重启后，[该事实仍可见](upgraderc3-memory-preserved.png)，`memories.json`、`MEMORY.md`、`USER.md` 的 SHA-256 全部保持一致。这是有限的数据保留检查，不代表穷尽所有历史数据迁移情况。

复现方式：构建并打包三个候选包，运行 `node scripts/serve-release-acceptance.mjs --dsh <official-dsh>/lib/bin.js --artifacts <candidate-directory> --state <empty-disposable-directory>`。升级场景增加 `--previous dsh-mnemon@0.5.36`。从夹具私有元数据读取连接地址；更新完成后向夹具父进程发送 SIGUSR2 重启 DSH。

## 验证与边界

- `pnpm run verify` 通过：文档、类型检查、可重复构建、**2,257 项根测试**（7 项条件跳过）、**718 项插件测试**（3 项条件跳过）、Headless 激活、旧设置保留、包入口与兼容性检查。跳过项涉及需显式开启的真实模型/Native 集成、条件夹具，以及 macOS 上的 Windows 专属检查。
- `pnpm run verify:plugins --skip-build` 通过：**18 个独立插件仓库 / 19 个打包制品**、外部 SDK consumer、可选策略组合与真实打包 Host 安装/升级。外层并发为 4，每个独立插件的 Vitest worker 为 1。
- `pnpm run release:check` 通过：稳定版 `latest`、三个包升版、无待处理 changeset。Skills 0.5.4 使用本次新增的模型目录 SDK，因此将 Starter peer 最低版本提高到 **^0.5.37**。回退 Starter 0.5.36 时须一并恢复 Skills 0.5.3。
- 未调用真实模型 API 或外部 Provider 服务。模型路由和 Provider 行为由自动化契约测试覆盖；六组真实 WebUI 场景覆盖安装、更新、重启和有限数据保留。
- 未手工验证 Windows/Linux Desktop 交互安装。拟议的 Hermes-like Provider 接入不包含在本次发布中。

正式发布还会冻结合并后的 main 修订，重新运行工作区及独立插件验证，对比冻结制品，验证 Registry 组合与真实升级，最后创建 GitHub Release。
