# LoopCAT 0.0.4-dev.20260914.5 Downloads

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20260914.5+source.95b049f3ffd1`

Base commit: `3c924f45bfe4ccb51228c1f5d7178b8158aca21f`

Source snapshot SHA-256: `95b049f3ffd17cf193e3e26784a40870cb2257b34dd133d82d6af0c2116b3344`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20260914.5.zip`](./LoopCAT.Web.0.0.4-dev.20260914.5.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20260914.5.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20260914.5.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20260914.5.Portable.zip`](./LoopCAT.0.0.4-dev.20260914.5.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20260914.5.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20260914.5.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

Older download mirrors and GitHub prereleases are superseded by this build. Use only files whose names contain `0.0.4-dev.20260914.5` and verify them against the checksum list from the same download location.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20260914.5](../docs/releases/0.0.4-dev.20260914.5.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
