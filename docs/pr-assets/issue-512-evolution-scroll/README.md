# Evolution scrolling (#512)

[简体中文](README.zh-CN.md)

Verified on 2026-10-29 in a real DSH WebUI with ten synthetic suggestions:

```bash
pnpm run verify
node scripts/serve-e2e.mjs --evolution-scroll --without-mnemon-cli
```

- Before: scrolling the left list moved the detail and Generate draft button above the viewport ([before.png](before.png)).
- After, 1280 × 900: the list scrolled 315px while the detail stayed at y=282 and its action stayed at y=307. Expanding suggestion 03 and scrolling its detail to 898px left the list at 315px. Selecting suggestion 02 reset only the detail to 0 ([after.png](after.png)).
- At 425 × 900: the list remained a bounded, scrollable block above the detail; document width stayed 425px, with no horizontal overflow ([narrow.png](narrow.png)).
- The regression failed on the previous layout and passed after the fix for both writable and read-only pages. Full `pnpm run verify` passed, including all plugin suites, 2245 root tests, Headless and package checks; 7 conditional root tests were skipped.

The fixture calls no model and contains no user data. DSH source, configuration, storage formats and write permissions are unchanged. The change is scoped to the evolution Pending/Done split; other Skills layouts retain their existing behavior.
