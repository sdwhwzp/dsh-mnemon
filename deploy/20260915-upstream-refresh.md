# 2026-09-15 上游刷新部署记录（server 30）

一次把四个 fork 拉到上游最新并重新应用本地补丁。机器 30，profile
`/home/tzwl3/.dsh/profiles/web`，制品目录
`/home/tzwl3/apps/dsh-plugins/releases/20260915-upstream-refresh/artifacts`。

## 上线内容

| 包 | 上线版本 | 上游基线 | fork 提交 | sha256（前 8 位） |
| --- | --- | --- | --- | --- |
| `@changfenhuang/dsh-genui` | 0.11.0-dsh.20260915.1 | 0.11.0 | `4b087e6` | `f4f6c2b5` |
| `@linxin666/dsh-client-ui-git-graph` | 0.3.22-dsh.20260915.1 | 0.3.22 | `16340c2` | `e19ce291` |
| `dsh-context` | 0.52.2-dsh.20260915.1 | 0.52.2 | `1bbc6b9` | `e4dc231f` |
| `dsh-mnemon` 家族（17 个包） | 0.5.9-dsh.20260915.1 | 0.5.9 | `c3833fd` | 见 `server30-pins.json` |

完整哈希与制品路径在同目录的 `server30-pins.json`。

## 各包的本地补丁与合并处理

### dsh-genui — 三个运行时补丁，两个产物都要打

这个包把 `normalizeNode` 和 `guard` **同时编进 `lib/index.js` 和 `lib/client.js`**：
前者是宿主插件（`validate_dsh_ui` 工具，报错前缀 `❌`，只有模型看得到），后者是浏览器
渲染端（围栏能不能渲染、用户看到的 `⚠️ dsh-ui …` 诊断都出自这里）。9 月 15 日上一轮
只改了前者，于是工具报"通过"、界面照样丢节点。**改这个包的归一化或校验逻辑，两个
bundle 都要改。**

补丁三条：

1. `keyvalue` / `steps` 接受 `items` 别名。整份规格里 9 个组件都用 `items`，只有
   `keyvalue`/`table`/`steps` 例外，模型写错就整个节点被丢弃。
2. tone 逐组件归一化。0.11.0 的 tone 词表仍逐组件不同——`callout` 认
   info/success/warning/error，`badge` 认 success/warn/danger/accent，`card` 认
   info/success/warning/danger，`hero` 认 accent/success/warning/danger。同一个词换个
   组件就致命。新增 `TONE_SYNONYMS`，按该组件自己的 enum 依次匹配后改写并记一条 alias
   警告；查不到近义词的保留原值，让校验照常报错。
3. 诊断不再指向已被自动修复的括号。渲染端本来就会先跑 tier-2 修复
   （`completeFenceJson`），括号错大多能自愈，真正渲染不出来的原因往往是字段校验；
   原先却在原始文本上取 JSON 解析位置。现在修好了就诊断修复后的规格。

上游 0.11.0 的提示词新增了"字段速查"，已点明 `keyvalue {"pairs"}`、`steps {"steps"}`、
`callout` 的 tone 取值，比上一轮自己加的那行好，采用上游版本；本地只补它没写的
"tone 按组件不同"一句。

0.11.0 重构了 `normalizeAliasFields`（改 4 参、别名从 schema 取）并删掉了上游原有的
`hero` + `brand` 单例特判（由 `TONE_SYNONYMS` 的 `brand:['accent']` 覆盖），锚点与
0.10.0 不同；压缩产物里的短名每次升级都要重认（0.11.0 为 `Ou`=COMPONENT_SCHEMAS、
`Mu`=normalizeAliasFields、`Nu`=normalizeNode、`Df`=processSemanticFailure、
`wf`=completeFenceJson）。

**这一轮修的现场问题**：线上会话里取了 10 份真实解析失败的围栏，tier-2 能自愈 6 份，
其中就包括用户报的「字符 437」那份——它修好后是 `callout tone="danger"`，正是第 2 条
补丁覆盖的情况。也就是说用户报的两条报错（tone 不合法、JSON 解析失败）是同一个根因。

### dsh-client-ui-git-graph — 配对工作区的 git

配对的本机工作区在 Host 上只登记为一个**空的占位目录**，真实仓库在开发者自己的电脑上；
插件在 Host 侧 `ctx.subprocess.spawn` 跑 git，对着空目录什么都看不到。补丁把
`new GitService(subprocessRunner(ctx), …)` 换成 `pairedAwareRunner(ctx)`，通过可选服务
`localWorkspaceCommands`（dsh-passwords 提供）把 `['git', ...argv]` 发到对端执行；该服务
对任何非配对工作区返回 `null`，此时原样委派回本地 runner，Host 仓库行为不变；对端拒绝
（离线 / 未授权 Shell / 超时）转成 `exitCode: 128` 而不是抛异常，面板保持友好空态。

上游 0.3.22 未改 `applyImpl` 里那行构造，锚点与 0.3.21 相同，原样重打。

### dsh-context — 上游迁移了 detail 端点，鉴权要接回去

上游把 detail 端点从 `connection.rpc.handle` 迁到了 `connection.fetch.register`
（走 `/api` 的 fetch 路由注册）。按"优先采用上游实现"，`src/host/detail.ts` 整体以上游
版本为底，再把本 fork 的账号归属判定接回去：Connection 的 `/api` 路由本来就以
`(request, principal)` 调用处理函数，所以 face 声明加上可选 `principal`，鉴权仍在读取
会话之前完成，`signal` 改用 `request.signal`。

`statsContext.tsx` 两处：价格提示保留本 fork 的"有账本走账本"分支，注释采用上游新措辞；
统计格同时要上游给 cache-hit 加的公式提示和本 fork 的账本金额。
`tests/host/detail.spec.ts` 的四个鉴权用例改为构造 `Request` 打到捕获的 fetch 路由，
`principal` 作为第二参数传入，覆盖面不变（缺身份 / 缺提供方 / 非属主 / 属主）。

### dsh-mnemon — 版本 pin、打包预算，外加一个构建修复

上游 0.5.9 的主线是历史会话兼容修复与侧栏入口对齐。冲突全在版本 pin 与打包预算：

- 家族内 17 个包统一到 `0.5.9-dsh.20260915.1`，沿用本 fork 的 `-dsh` 命名。
- `scripts/verify-package-contents.mjs` 的 `maximumUnpackedBytes` 取两边增量之和。上游从
  1_270_000 涨到 1_318_000，本 fork 在同一基线上因账号隔离与作用域审查守卫多出约 80K。
  实测 1_348_334 字节，上限定为 1_400_000（约 4% 余量），注释保留双方理由。

另外修了一个**与合并无关、但挡住全新安装构建**的问题：`tsdown.config.ts` 的
`clientCssPlugin` 用 `import.meta.resolve` 解析 `dsh-mnemon-source-*` 的 `.module.css`。
加载这份 TypeScript 配置的 loader 会把 `import.meta.resolve` 换成按 URL 相对解析，于是
裸包标识符被当成仓库根下的相对路径，丢掉 `plugins/` 段，根构建必然 ENOENT。改用
`createRequire(import.meta.url).resolve`，走真正的 Node 解析，与加载器无关。

## 验证

| 包 | 证据 |
| --- | --- |
| dsh-genui | 渲染端 `normalizeNode` 用 `vm` 从压缩产物切出来单独跑，10 例全通过：callout warn→warning、callout danger→error、badge error→danger、badge warning→warn、card error→danger、hero brand→accent、合法值不动、无近义词的错值保留报错、keyvalue 用 items→pairs、steps 用 items→steps |
| git-graph | `pairedAwareRunner` 同样用 `vm` 切出来跑四条分支：配对命中（argv 变成 `git status --short` 发到对端）、服务返回 null（委派回本地）、服务缺席（委派回本地）、对端抛错（转 `exitCode: 128`，不抛异常） |
| dsh-context | `vitest run` 84 文件 1436 通过 66 跳过；`tsc --noEmit` 干净；pre-push 钩子跑的覆盖率四项均 100% |
| dsh-mnemon | 根测试 1156 通过 / 3 失败。同样三处在合并前的 `643674b6` 上也失败（合并前 953 通过 / 4 失败），**合并未引入回归**；`verify-package-contents.mjs` 退出码 0 |

制品校验：17 个 mnemon 包逐个解包确认**不含 `workspace:` 协议**（用 `npm pack` 会保留该
协议并在 profile 安装时炸掉，必须用 `pnpm pack`）。上传后在服务器侧重算 sha256，与本地
逐一比对一致。

## 切换过程

两批切换，都走同一套流程：flock `.profile-cutover.lock` → 记录
`package.json` + `pnpm-workspace.yaml` 的 sha256 基线 → `cp -a` 候选 → 改两个文件里的 pin
→ `pnpm install --no-frozen-lockfile` → 在候选里核对装进去的确实是打了补丁的产物 →
复核基线未被他人改动 → 换目录 → `pm2 restart dsh-web` → 健康门禁（`web` 返回 401 或
200）→ 失败自动回滚。

- 第一批（genui + git-graph + context）：安装恰好只有这三个包变动；健康检查 5 秒内
  `web=401`；日志无插件错误。旧 profile 留在 `web-before-20260915-upstream-refresh`。
- 第二批（mnemon 家族 17 个包）：首次尝试被门禁拦住（有 1 个会话仍在活动），改为等待
  空闲后切换。旧 profile 留在 `web-before-20260915-mnemon`。

切换脚本内置"连续 3 分钟无会话写入才动手"的检查——重启会打断在途会话。

## 已知问题与未尽事项

- **mnemon 有 3 个既有失败用例**：`tests/account-host.spec.ts`（账号 Agent 循环）、
  `tests/composable-performance.spec.ts`（性能围栏）、`tests/dsh-connection-compat.spec.ts`
  （Web RPC 注册）。已确认合并前就存在，本轮不处理。
- **`dsh-mnemon-provider-mem0` 差点漏打**：第一次打包脚本里误加了跳过它的过滤，导致候选
  profile 里它停在 0.5.8 而其余 16 个是 0.5.9。已补打并重装对齐。下次整族发版要逐个核对
  版本一致。
