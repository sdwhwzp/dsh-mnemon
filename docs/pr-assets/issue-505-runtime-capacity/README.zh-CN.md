# 运行时记忆容量设置（#505）

[English](README.md)

2026-10-29，使用构建后的客户端、DSH 0.2.1-rc.2 和现有合成文档夹具验收：

```bash
node scripts/serve-e2e.mjs --docs-demo --without-mnemon-cli
```

1. 打开插件 → 可组合记忆 → 运行时记忆。默认值为 4096 和 10240 字节。改为 8192 和 20480 后，点击应用才生效；保存成功，重新打开仍显示新值（[settings-saved.jpg](settings-saved.jpg)）。
2. 运行时页面显示 USER.md 为 189 B / 8.0 KB，MEMORY.md 为 325 B / 20.0 KB，八条合成记忆均保留（[runtime-updated.jpg](runtime-updated.jpg)）。
3. 输入 0 时显示范围错误并禁用应用；放弃修改恢复 8192。已检查 1280px 和 425px 布局（[invalid-narrow.jpg](invalid-narrow.jpg)）。
4. 将用户画像上限改为低于当前用量的 1 字节，页面显示 189 B / 1 B，仍有八条记忆；刷新后结果一致（[lower-limit-retained.jpg](lower-limit-retained.jpg)）。增大前、增大后、调低后，`runtime/memories.json` 的 SHA-256 均为 `998ad13f917238648c3016403d57ab9392791f14083ee9787231a05203689c52`。

自动化设置测试覆盖编辑后应用/放弃、保存中禁用、非法范围及小数、上下边界、非整 KiB 字节值、保留维护预算与继承默认值、保存失败重试、只读/加载状态和英文标签。现有构建产物测试也验证仅有 DSH 浏览器依赖时能加载；容量常量随客户端打包，导入边界明确限定为这两个常量。

所有数据均为合成数据，不需要模型请求。本次仅为已有配置增加入口，默认值、持久化、权限、维护 token 预算及 Provider 行为保持不变。
