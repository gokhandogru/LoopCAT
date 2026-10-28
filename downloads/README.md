# LoopCAT 0.0.4-dev.20261028.1 Downloads

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20261028.1+source.176635f74fe9`

Base commit: `7c1e6c382ee37ccafbdc30e1d8f71f5029e3b8a1`

Source snapshot SHA-256: `176635f74fe9778bf0c0d9ae9b87392193349b13356c6d67f507600239f5d391`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20261028.1.zip`](./LoopCAT.Web.0.0.4-dev.20261028.1.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20261028.1.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20261028.1.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20261028.1.Portable.zip`](./LoopCAT.0.0.4-dev.20261028.1.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20261028.1.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20261028.1.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

For macOS and Linux packages, use the [matching all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261028.1).

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20261028.1](../docs/releases/0.0.4-dev.20261028.1.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
