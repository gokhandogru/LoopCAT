# LoopCAT 0.0.4-dev.20260831 Downloads

This is an **unsigned development preview**, not a tagged or production-qualified release.

Build: `0.0.4-dev.20260831+source.92e3832c0146`

Base commit: `efdd7f263c47d1398fea8b1eb90b1c343639333d`

Source snapshot SHA-256: `92e3832c0146065a6fcd08df3709a4abe6935d8842868c50f694aca56f799454`

The source snapshot includes the base commit plus local release-preparation changes; it is not claimed to be the unchanged base commit. All three ZIPs were built from this same snapshot. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20260831.zip`](./LoopCAT.Web.0.0.4-dev.20260831.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20260831.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20260831.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20260831.Portable.zip`](./LoopCAT.0.0.4-dev.20260831.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20260831.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20260831.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20260831](../docs/releases/0.0.4-dev.20260831.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
