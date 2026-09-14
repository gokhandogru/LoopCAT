# LoopCAT 0.0.4-dev.20260914.5 Downloads

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20260914.5+source.0e3fcca4bb17`

Base commit: `ef0cab59073f567f6f7dbfa1400e801b1503a46c`

Source snapshot SHA-256: `0e3fcca4bb177fcaa09db2a36c6edc0538650a0257cb13dea62f50072e3c9fd4`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20260914.5.zip`](./LoopCAT.Web.0.0.4-dev.20260914.5.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20260914.5.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20260914.5.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20260914.5.Portable.zip`](./LoopCAT.0.0.4-dev.20260914.5.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20260914.5.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20260914.5.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20260914.5](../docs/releases/0.0.4-dev.20260914.5.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
