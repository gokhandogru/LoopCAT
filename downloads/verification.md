# LoopCAT 0.0.4-dev.20261028.1 verification

Verified on 28 October 2026. Source commit: `7c1e6c382ee37ccafbdc30e1d8f71f5029e3b8a1`.

The Windows and web repository ZIPs are byte-for-byte copies of the verified GitHub Actions artifacts. Their build receipts match the same source fingerprint. See the [manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20261028.1.md), [all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261028.1), and [successful release run](https://github.com/gokhandogru/LoopCAT/actions/runs/40686994118).

Verification:

- Static quality gates, unit tests, accessibility checks, browser workflows and release-contract checks passed on the Windows, macOS and Linux runners.
- Packaged desktop launch tests, artifact contents, Electron security fuses, preview artifact selection and checksums passed on all three desktop platforms.
- The web ZIP passed payload checks and direct-file/HTTP workflow smoke tests.
- The all-platform release-bundle gate passed. The additional Linux ZIP contains byte-for-byte copies of the verified AppImage and DEB; both extracted payload hashes were checked. The public checksum list covers all ten packages.
- The localized editor and toolbar checks covered Spanish, Catalan, Turkish and Arabic. Spanish catalog tests checked locale selection, placeholders and plural forms.

Packages: web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage, DEB and a ZIP containing both.

Desktop packages remain unsigned and macOS packages are not notarized, matching the existing preview channel. Clean-machine installation and manual screen-reader qualification remain outstanding.
