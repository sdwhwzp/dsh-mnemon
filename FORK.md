# dsh-mnemon 账号隔离融合

- 原作者源：`https://github.com/omdsh-dev/dsh-mnemon.git`，`main`，同步基线 `2fa306b916e0995eb739953318ec7a3d4b89709b`。
- 自有 fork：`https://github.com/sdwhwzp/dsh-mnemon.git`，上传地址 `git@github.com:sdwhwzp/dsh-mnemon.git`。
- 当前融合分支：`dev`；本地 `main` 保留源历史，分别上传并核对，不能强行改成相同内容。
- 适配版本：`0.5.7-dsh.20260911.3`，17 个 Mnemon 包使用同一版本；配套本地 Harness `0.1.5-rc.2` 与 `dsh-passwords 2.7.0-dsh.20260911.1`。

本 fork 保留原作者的三层记忆、工具、工作台与数据格式，增加可选的登录账号隔离。配置与使用限制见 [账号部署](docs/zh-CN/guides/accounts.md)。未设置 `accountDataDir` 时仍使用原作者的单用户存储规则。

Web RPC 依赖 Harness 的 Connection 路由修复：通过 `ctx.get` 解析可选 Web 服务器，避免 Cordis 将属性访问归到未声明该服务的提供者上下文。Headless 不要求 Web 服务。

历史会话档案管理从经授权的已保存会话头解析工作区，不依赖 Agent 已加载到内存。保存与读取沿用账号独立目录；元数据读取失败不回退到其他工作区。

## 同步与发布约束

先 fetch 原作者和自有 fork，合并原作者分支到当前 `dev`，优先保留源实现并适配账号隔离。相关检查通过后 commit，枚举所有本地分支并上传未发布提交，再 fetch 核对源分支与各远端 SHA。保留远端独有分支，不使用 `--mirror` 或裸 `--force`。

服务器 30 的发布包必须纳入 [插件固定清单](deploy/server30-pins.json) 和 `fastTier: false`，并从切换前的当前 profile 制作候选。依赖、补丁、锁文件或 current 链接在准备后发生变化时，重新准备候选。不得用旧快照覆盖交接后的插件更新。安装后恢复 `dsh-passwords/.env`，先用隔离数据库与账号验证候选，再备份、切换、检查并保留回滚入口。`dsh-weknora` 保持现有版本。

本 fork 的 `dsh.YYYYMMDD.N` 预发布版本使用 `dsh` 发布通道。Starter 精确固定组件版本，组件 peer 依赖保留兼容范围；不以 `latest` 通道发布定制版本。

## 本地验证

```sh
pnpm install --frozen-lockfile
DSH_SOURCE_VERSION=0.1.5-rc.2 DSH_SOURCE_ROOT=/absolute/path/to/deepseek-harness pnpm run dsh:link-source
pnpm_config_verify_deps_before_run=false pnpm run typecheck
pnpm_config_verify_deps_before_run=false pnpm run build
pnpm_config_verify_deps_before_run=false pnpm --workspace-concurrency=4 -r build
pnpm_config_verify_deps_before_run=false pnpm exec vitest run tests/account-isolation.spec.ts tests/account-host.spec.ts
pnpm run verify:docs
```

真实 Native 数据库用例另需将 `MNEMON_NATIVE_TEST_CLI` 指向校验过的 `mnemon 0.2.5` 可执行文件。该用例只使用临时数据目录；普通用例不调用真实模型 API。
