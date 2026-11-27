# LoopCAT 0.0.4-dev.20261127.1 Downloads

The [November 27 all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261127.1) adds project sorting and audiovisual translation with local video, live captions, waveform timing and target-side subtitle split/merge.

Download Windows installer/portable, universal macOS DMG/ZIP for Apple Silicon and Intel, Linux x64 AppImage/DEB, and the web ZIP from that release. Its `SHA256SUMS.txt` covers all application packages and the Mac installation guide. The [current release manifest](latest-release.json) lists all eleven files with byte sizes, SHA-256 hashes and direct URLs.

[Release notes](../docs/releases/0.0.4-dev.20261127.1.md) · [Verification report](verification.md) · [Downloads website](https://loopcat-downloads.gokhan-dogru.chatgpt.site)

The three ZIPs below are matching Windows/web mirrors, refreshed from the same CI source revision.

This is an **unsigned development preview**, not a signed or production-qualified release.

Build: `0.0.4-dev.20261127.1+source.77b78b75fb3a`

Base commit: `5942ea519e235a86ed854cdd0ead0c506a281c08`

Source snapshot SHA-256: `77b78b75fb3a275df633151d1150b449bb57933a1c036c310aa10182e39db941`

All three ZIPs were built from the same fingerprinted source snapshot rooted at the base commit. Each ZIP contains `build-info.json`; the desktop application also embeds it inside `resources/app.asar`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes. A later download-only commit may publish these artifacts without changing their source snapshot.

| Download | File |
| --- | --- |
| Web application | [`LoopCAT.Web.0.0.4-dev.20261127.1.zip`](./LoopCAT.Web.0.0.4-dev.20261127.1.zip) |
| Windows installer | [`LoopCAT.Windows.Setup.0.0.4-dev.20261127.1.zip`](./LoopCAT.Windows.Setup.0.0.4-dev.20261127.1.zip) |
| Windows portable application | [`LoopCAT.0.0.4-dev.20261127.1.Portable.zip`](./LoopCAT.0.0.4-dev.20261127.1.Portable.zip) |
| SHA-256 checksums | [`LoopCAT.0.0.4-dev.20261127.1.SHA256SUMS.txt`](./LoopCAT.0.0.4-dev.20261127.1.SHA256SUMS.txt) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

For macOS and Linux packages, use the [matching all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261127.1).

**macOS: read before opening.** Save [LoopCAT-macOS-INSTALL.txt](./LoopCAT-macOS-INSTALL.txt) beside your download, or read the [full installation guide](../docs/macos-installation.md). Check the Mac package's architecture: older previews are ARM64-only, while explicitly labelled universal packages support Apple Silicon and Intel. Development previews are not Developer ID-signed or notarized. The guide covers checksum verification, **Privacy & Security → Open Anyway**, and troubleshooting older bundles with an invalid signature.

The older `draft-0.0.3` tag points to July commit `6f9754d`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT 0.0.4-dev.20261127.1](../docs/releases/0.0.4-dev.20261127.1.md). After preparing downloads, run `pnpm run verify:repository-downloads` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
