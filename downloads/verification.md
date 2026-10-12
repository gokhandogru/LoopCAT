# LoopCAT 0.0.4-dev.20261012.1 verification

Verified on 12 October 2026. Build ID: `0.0.4-dev.20261012.1+source.668b41e1a98f`. Source commit: `223e548c83486e12b70ba103f211f2eef19d16a8`.

The Windows and web repository ZIPs are byte-for-byte copies of the verified GitHub Actions artifacts. Their build receipts match the same source fingerprint. See the [manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20261012.1.md), [all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261012.1), and [successful release run](https://github.com/gokhandogru/LoopCAT/actions/runs/38290949653).

Verification:

- All 1,543 unit tests, lint, formatting, type checks, styles, import boundaries, accessibility checks, full browser suites, and release-contract checks passed on the native Windows, macOS and Linux runners.
- The large-project regression covers 2,400 segments, 900 TM units, a 150-request batch under the existing 30-second limit, delivery validation, project packages and backups. Matching avoids discarded display diffs and uses bounded segmentation caches without changing scores.
- Packaged desktop launch tests, artifact payload checks, Electron security fuses, preview artifact selection and checksums passed on all three desktop platforms.
- The production web ZIP passed payload checks and direct-file/HTTP workflow smoke tests, including batch import preflight, editing, confirmation, TM, QA and backup roundtrip.
- Focused local Statistics and file-lifecycle regressions passed. The compact-toolbar checks covered desktop/narrow widths, 200% zoom, inspector visibility, themes, keyboard menus and RTL. The Arabic audit completed 97 captures and 10 functional checks with zero errors; see [UI verification](../docs/workspace-ui-verification-20261012.md).
- All nine native/web application packages passed the combined release-bundle gate. The additional Linux ZIP contains byte-for-byte copies of the AppImage and DEB; both extracted payload hashes were verified. The public checksum list covers all ten packages.

Packages: web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage, DEB and a ZIP containing both.

Desktop packages remain unsigned and macOS packages are not notarized. Clean-machine installation and manual screen-reader qualification remain outstanding.
