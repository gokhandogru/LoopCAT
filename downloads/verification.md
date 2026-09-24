# LoopCAT 0.0.4-dev.20260924 verification

Verified on 24 September 2026. Build ID: `0.0.4-dev.20260924+source.0763d7578732`. Source commit: `89f2b9947e84d664bf07614124be2da8fce3aa22`.

The Arabic slogan is **مساحة عمل للترجمة على جهازك**. The related description and Arabic Beginner Guide footer use consistent wording.

The Web and Windows repository ZIPs are byte-for-byte copies of the verified CI artifacts. See the [manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20260924.md), and [successful all-platform run](https://github.com/gokhandogru/LoopCAT/actions/runs/35965309254).

Verification:

- Arabic catalog and placeholder validation passed for 2,672 source messages; the focused Arabic and version-contract tests passed.
- All 1,517 unit tests, static quality checks, accessibility checks, full browser suites, and release-contract checks passed on the native desktop runners.
- Packaged desktop smoke tests, payload checks, Electron fuses, preview artifact selection, and checksums passed for Windows, macOS, and Linux.
- The production Web ZIP passed payload and direct-file/HTTP browser smoke checks.
- The Arabic UI audit completed 97 captured states and 10 functional checks, with no clipping or axe accessibility violations. Its three untranslated-text flags were the same standard KB storage-unit abbreviation at three widths; manual review classified these as false positives. The revised slogan and About description were visually checked.
- All nine application packages passed the combined bundle gate and downloaded checksum checks.

Packages: Web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage and DEB.

Desktop packages remain unsigned and macOS packages are not notarized. Automated checks do not establish complete clean-machine, screen-reader, or all-browser qualification.
