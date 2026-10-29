# 进化面板滚动（#512）

[English](README.md)

2026-10-29，使用十条合成建议，在实际 DSH WebUI 中验收：

```bash
pnpm run verify
node scripts/serve-e2e.mjs --evolution-scroll --without-mnemon-cli
```

- 修复前：滚动左侧列表会将右侧详情和“生成草案”按钮带到视口上方（[before.png](before.png)）。
- 修复后，1280 × 900：列表滚动 315px，详情保持在 y=282，操作按钮保持在 y=307。展开建议 03 并将详情滚动至 898px，左侧仍为 315px；切换到建议 02 后仅详情回到 0（[after.png](after.png)）。
- 425 × 900：列表保持限定高度并可滚动，详情位于下方；文档宽度保持 425px，没有横向溢出（[narrow.png](narrow.png)）。
- 回归测试在旧布局下失败，修复后在可写和只读页面均通过。完整 `pnpm run verify` 通过，包括所有插件测试、2245 项根测试、Headless 和包检查；7 项条件性根测试跳过。

夹具不调用模型，不含用户数据。DSH 源码、配置、存储格式和写入权限保持不变。修改仅作用于进化待处理/已处理两栏，其余技能布局保留原有行为。
