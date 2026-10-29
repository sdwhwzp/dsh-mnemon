# Evolution scroll boundaries (#516)

[简体中文](README.zh-CN.md)

Verified on 2026-10-29 against `main@3ad60697bd4c10837c70301e841d97b3f1134634` and this PR's two CSS declarations. The real DSH 0.2.1-rc.2 WebUI ran in Chromium on macOS with the existing ten-suggestion synthetic fixture:

```bash
pnpm --filter dsh-mnemon-source-skills build
node scripts/serve-e2e.mjs --evolution-scroll --without-mnemon-cli
pnpm run verify
```

Open Memory System → Skills → Evolution. At 1280 × 900, scroll the list to its bottom, then start another downward wheel gesture. Use suggestion `scroll-check-03` and expand its rationale for a long detail. Repeat at both boundaries of both panes, keeping the surrounding page away from the boundary being tested. At 425 × 900, repeat the list check, then scroll over the stacked detail. Measurements below read the rendered elements' scroll positions after actual wheel input; no DOM scrolling or stylesheet injection was used.

| Check | Observed result |
|---|---|
| Before: list bottom, then another downward gesture | List stayed at 315px, but outer page moved 0 → 88px and detail top moved y=282 → 194 ([before](before.png)) |
| After: same list-bottom gesture | List stayed at 315px; outer page stayed at 0 and detail at y=282 ([after](after.png)) |
| After: long detail bottom | Detail stayed at 898px; list stayed at 315px and outer page at 0 |
| After: detail top / list top | An additional upward gesture left the tested pane at 0 and the outer page at 88px |
| Narrow: list bottom | List stayed at 553px and outer page at 68px ([narrow](narrow.png)) |
| Narrow: wheel over the detail | Outer page moved 68 → 1062px, list stayed at 553px, and detail retained normal page flow |

The narrow viewport and document were both 425px wide. The wide detail uses vertical scroll containment; the narrow detail restores `overscroll-behavior-y: auto` alongside `overflow: visible`. Other Skills tabs and horizontal scrolling are unchanged.

This is a browser regression check, including a failing baseline and passing fixed behavior, using the existing reusable fixture. It does not add a CSS-text assertion or a simulated wheel event to JSDOM. The fixture calls no model and contains no user data. No DSH code, persistence, configuration, permissions, or model behavior changed. Windows Desktop was not manually exercised in this local browser check.

Full `pnpm run verify` passed: docs, types, deterministic builds, all plugin suites, root tests (2257 passed | 7 skipped (2264)), real Headless activation and package validation. Conditional live-service tests remained skipped.
