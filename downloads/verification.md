# LoopCAT 0.0.4-dev.20261021.1 verification

Verified on 21 October 2026. Build ID: `0.0.4-dev.20261021.1+source.5a76fed8ef8d`. Source commit: `1aa1cfc5ded46e8aee35b0c9643a55afde8399b5`.

The Windows and web repository ZIPs are byte-for-byte copies of the verified GitHub Actions artifacts. Their build receipts match the same source fingerprint. See the [manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20261021.1.md), [all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261021.1), and [successful release run](https://github.com/gokhandogru/LoopCAT/actions/runs/39586253860).

Verification:

- All 1,576 unit tests, lint, formatting, type checks, styles, import boundaries, accessibility checks, full browser suites and release-contract checks passed on the native Windows, macOS and Linux runners.
- The Windows AI consent regression passed acceptance, cancellation, Escape, duplicate-request prevention, focus restoration and immediate keyboard input in segment and terminology fields. The application workflow also exercises the new dialog and verifies that cancellation prevents sending text and saving changed credentials/settings.
- The focused Statistics regression passed locally: 20-file analysis, weighted pricing, report persistence, CSV/HTML/JSON exports, project-package roundtrip, incomplete-result handling, corrupt-file isolation, immutable baselines, scope changes, dark theme and narrow RTL layout.
- Packaged desktop launch tests, artifact contents, Electron security fuses, preview artifact selection and checksums passed on all three desktop platforms. The Windows TMX workflow also passed.
- The web ZIP passed payload checks and direct-file/HTTP workflow smoke tests.
- All nine native/web application packages passed the combined release-bundle gate. The additional Linux ZIP contains byte-for-byte copies of the AppImage and DEB; both extracted payload hashes were verified. The public checksum list covers all ten packages.

Packages: web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage, DEB and a ZIP containing both.

Desktop packages remain unsigned and macOS packages are not notarized, matching the existing preview channel. Clean-machine installation and manual screen-reader qualification remain outstanding.
