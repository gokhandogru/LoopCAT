# LoopCAT 0.0.4-dev.20260913 Downloads

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20260913+source.7749c6f74b7b`

Base commit: `456c553ca98dcae296364103d10cffb46cb8a2db`

Source snapshot SHA-256: `7749c6f74b7b750b99060612db20c75b4246b97c73ea4dc4622b219a3f7b7261`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20260913.zip`](./LoopCAT.Web.0.0.4-dev.20260913.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20260913.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20260913.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20260913.Portable.zip`](./LoopCAT.0.0.4-dev.20260913.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20260913.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20260913.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

Linux x64 DEB and AppImage packages are available as assets on the [same GitHub preview release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20260913), not as binaries in this repository mirror. Use their separate `Linux-SHA256SUMS.txt` and [Linux installation and verification instructions](../docs/releases/0.0.4-dev.20260913-linux.md). The original mirror manifest and verification report describe Windows/web only.

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20260913](../docs/releases/0.0.4-dev.20260913.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
