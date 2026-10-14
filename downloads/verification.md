# LoopCAT 0.0.4-dev.20261014.1 verification

Verified on 14 October 2026. Build ID: `0.0.4-dev.20261014.1+source.081703a67587`. Source commit: `0c169a7947c88885501cba9c57fd934533359922`.

The Windows and web repository ZIPs are byte-for-byte copies of the verified GitHub Actions artifacts. Their build receipts match the same source fingerprint. See the [manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20261014.1.md), [all-platform release](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261014.1), and [successful release run](https://github.com/gokhandogru/LoopCAT/actions/runs/38544246604).

Verification:

- All 1,545 unit tests, lint, formatting, type checks, styles, import boundaries, accessibility checks, full browser suites, and release-contract checks passed on the native Windows, macOS and Linux runners.
- The focused TMX project-document workflow passed locally and on the Windows release runner. It covers both import entry points, source/target language selection, Draft/Confirmed choices, empty targets, duplicate units, malformed XML, UTF-16, inline codes, original-format export, source update history, project packages, backups, reload persistence, accessibility and narrow RTL layout.
- The large-project regression covers 2,400 segments, 900 TM units, a 150-request batch under the existing 30-second limit, delivery validation, project packages and backups. Matching avoids discarded display diffs and uses bounded segmentation caches without changing scores.
- Packaged desktop launch tests, artifact payload checks, Electron security fuses, preview artifact selection and checksums passed on all three desktop platforms.
- The production web ZIP passed payload checks and direct-file/HTTP workflow smoke tests, including batch import preflight, editing, confirmation, TM, QA and backup roundtrip.
- The October 12 compact-workspace verification remains available as historical evidence in [UI verification](../docs/workspace-ui-verification-20261012.md). This release also validates the new import labels in the English, Turkish, Catalan and Arabic catalogs.
- All nine native/web application packages passed the combined release-bundle gate. The additional Linux ZIP contains byte-for-byte copies of the AppImage and DEB; both extracted payload hashes were verified. The public checksum list covers all ten packages.

Packages: web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage, DEB and a ZIP containing both.

Desktop packages remain unsigned and macOS packages are not notarized. Clean-machine installation and manual screen-reader qualification remain outstanding.
