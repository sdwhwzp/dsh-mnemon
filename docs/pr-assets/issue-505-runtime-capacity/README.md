# Runtime capacity settings (#505)

[简体中文](README.zh-CN.md)

Verified on 2026-10-29 with the built client on DSH 0.2.1-rc.2, using the existing synthetic documentation fixture:

```bash
node scripts/serve-e2e.mjs --docs-demo --without-mnemon-cli
```

1. Open Plugins → dsh-mnemon → Runtime memory. Defaults are 4096 and 10240 bytes. Enter 8192 and 20480; neither changes until Apply. Saving succeeds, and reopening shows the saved values ([settings-saved.jpg](settings-saved.jpg)).
2. Runtime memory shows USER.md at 189 B / 8.0 KB and MEMORY.md at 325 B / 20.0 KB, with all eight synthetic entries present ([runtime-updated.jpg](runtime-updated.jpg)).
3. Enter 0: an inline range error disables Apply. Discard restores 8192. Both 1280px and 425px layouts were checked ([invalid-narrow.jpg](invalid-narrow.jpg)).
4. Apply a 1-byte user limit, below the current usage: the page reports 189 B / 1 B and still shows eight entries, including after a reload ([lower-limit-retained.jpg](lower-limit-retained.jpg)). The SHA-256 of `runtime/memories.json` remains `998ad13f917238648c3016403d57ab9392791f14083ee9787231a05203689c52` before increasing, after increasing and after lowering the limits.

Automated settings checks cover staged save/discard, pending-save controls, invalid ranges and fractions, both accepted boundaries, exact non-KiB-aligned byte values, preservation of maintenance settings and inherited defaults, rejected writes/retry, read-only/loading states, and English labels. Existing built-client tests also guard loading with only the DSH browser dependencies; the Runtime capacity constants are bundled, with an explicit import boundary limited to those two constants.

All data is synthetic. No model request is needed. This adds a UI for the existing configuration; defaults, persistence, permissions, maintenance-token budget and Provider behavior are unchanged.
