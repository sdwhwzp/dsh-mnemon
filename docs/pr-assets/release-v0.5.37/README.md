# v0.5.37 release acceptance

[简体中文](./README.zh-CN.md) | **English**

Verified on **2026-10-29 (Asia/Shanghai)** from main `7792b897a03e43b7cc1e2052f234574d9147eb1d` plus release versions, synchronized pins and the Skills Starter peer floor. The environment was macOS arm64, Node 22.22.0 and pnpm 10.13.1. Homes, workspaces and memory were disposable fixtures; no model credentials or private user data were used. The user's Desktop profile was not changed.

The candidates are Starter **0.5.37**, Skills **0.5.4** and Memory Spaces **0.5.24**. The other sixteen components retain their pinned npm versions. The [structured record](validation.json) contains all nineteen versions, candidate SHA-256 and SHA-512 digests, and results. All six installations matched the full composition and all **143 files** from the three tarballs byte for byte. The Starter occupies **2,180,618 unpacked bytes**, 87.2% of the unchanged 2,500,000-byte ceiling.

## Real WebUI installation and upgrade

The existing [acceptance server](../../../scripts/serve-release-acceptance.mjs) runs unmodified, published DSH in isolated homes. Its loopback registry overlays the three candidates on real npm metadata. The fixture's version-check preload and old publication dates let the existing UI discover unpublished candidates; production release-age behavior is unchanged.

For each of DSH **0.2.0-rc.2**, **0.2.1-rc.2** and **0.2.1-rc.3**:

1. Used **Plugins → Add plugin** with `dsh-mnemon@0.5.37`, confirmed the installed version, selected **Enable now**, and opened Memory System. Status showed **dsh-mnemon 0.5.37 / System nominal**.
2. In a second isolated profile, installed actual npm **0.5.36**, opened **Check versions**, and confirmed the offer of **0.5.37** with two component updates. Clicked **Update** and read back **0.5.37 / restart required**.
3. Restarted the host and reconnected. Status showed running **0.5.37 / System nominal**. All nineteen package versions and the candidate file bytes matched.

| Host | Fresh install | Fresh status | Update offered | Update completed | Status after restart |
| --- | --- | --- | --- | --- | --- |
| 0.2.0-rc.2 | [Install](fresh020-install.png) | [Status](fresh020-status.png) | [Offered](upgrade020-offered.png) | [Updated](upgrade020-updated.png) | [Running](upgrade020-status.png) |
| 0.2.1-rc.2 | [Install](fresh021-install.png) | [Status](fresh021-status.png) | [Offered](upgrade021-offered.png) | [Updated](upgrade021-updated.png) | [Running](upgrade021-status.png) |
| 0.2.1-rc.3 | [Install](freshrc3-install.png) | [Status](freshrc3-status.png) | [Offered](upgraderc3-offered.png) | [Updated](upgraderc3-updated.png) | [Running](upgraderc3-status.png) |

Before the rc.3 upgrade, added one synthetic project fact through Runtime's **Add memory** dialog. After upgrading and restarting, [the fact remains visible](upgraderc3-memory-preserved.png). SHA-256 hashes of `memories.json`, `MEMORY.md` and `USER.md` are unchanged. This is a bounded retention check, not exhaustive historical-data migration coverage.

Reproduction: build and pack the three candidates, then run `node scripts/serve-release-acceptance.mjs --dsh <official-dsh>/lib/bin.js --artifacts <candidate-directory> --state <empty-disposable-directory>`. Add `--previous dsh-mnemon@0.5.36` for an upgrade. Read the connection URL from the fixture's private metadata; send SIGUSR2 to its parent process after Update to restart DSH.

## Verification and limits

- `pnpm run verify`: passed documentation, type checking, deterministic builds, **2,257 root tests** (7 conditional skips), **718 plugin tests** (3 conditional skips), Headless activation, legacy-settings retention, package entries and package compatibility checks. Skips cover opt-in live-model/native integration, a conditional fixture and Windows-only checks on macOS.
- `pnpm run verify:plugins --skip-build`: passed **18 independent plugin repositories / 19 packed artifacts**, the external SDK consumer, optional Strategy composition and the packed Host install/upgrade checks. Four outer workers and one Vitest worker per standalone package were used.
- `pnpm run release:check`: stable `latest`, three selected version advances and no pending changesets. Skills 0.5.4 raises its Starter peer floor to **^0.5.37** because it uses the model-catalogue SDK added in this release. A rollback to Starter 0.5.36 must restore Skills 0.5.3 as well.
- No live model API or external Provider service requests were used. Model routing and Provider behavior are covered by automated contract tests; the six WebUI scenarios cover installation, update, restart and bounded retention.
- Windows and Linux interactive Desktop installation were not manually tested. The proposed Hermes-like Provider integration is not included.

Publication separately freezes the merged main revision, repeats workspace and independent-plugin verification, compares frozen artifacts, verifies the Registry composition and a real upgrade, and creates the GitHub Release last.
