# LoopCAT 0.0.4-dev.20260923 Downloads

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20260923+source.2971757cfaa4`

Base commit: `e4a2af79afd1d3663cf2768ac10a672fc1ad41c9`

Source snapshot SHA-256: `2971757cfaa43cb6de9880899f0e9f1e952a240c760e905c17f5041ec18fd054`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20260923.zip`](./LoopCAT.Web.0.0.4-dev.20260923.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20260923.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20260923.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20260923.Portable.zip`](./LoopCAT.0.0.4-dev.20260923.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20260923.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20260923.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20260923](../docs/releases/0.0.4-dev.20260923.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
