# LoopCAT 0.0.4-dev.20260923 verification

Verified on 23 September 2026. Build ID: `0.0.4-dev.20260923+source.2971757cfaa4`.

All packages come from source commit `e4a2af79afd1d3663cf2768ac10a672fc1ad41c9`. The repository Web and Windows ZIPs are byte-for-byte copies of the verified GitHub Actions artifacts. See the [source and artifact manifest](release.json), [release notes](../docs/releases/0.0.4-dev.20260923.md), and [successful all-platform release run](https://github.com/gokhandogru/LoopCAT/actions/runs/35902477647).

Checks passed:

- All 1,517 unit tests, ESLint, configured Prettier checks, TypeScript, Stylelint, import boundaries, release contracts, and XLIFF 2.2 schema validation on Windows, macOS, and Linux.
- Native-platform accessibility and full browser suites, including the app workflow, workspace storage, package round trips, and large projects. The local full browser suite also passed.
- Packaged desktop smoke tests, ASAR payload checks, Electron security fuses, preview artifact selection, and SHA-256 checksums on all three desktop platforms.
- Production Web ZIP payload and real Chrome direct-file and HTTP workflow smoke tests.
- Arabic catalog validation for all 2,672 source messages and placeholders. The final local Arabic UI audit captured 97 states and passed 10 functional checks with zero reported errors or axe violations in the tested editor. It covers responsive layouts, 200% zoom, mixed-script editing, protected tags, persistence, Arabic guide, and DOCX export.
- The all-platform bundle gate verified all nine application packages and their combined checksums.

Packages: Web ZIP; Windows x64 installer and portable EXEs plus ZIP wrappers; macOS Apple Silicon DMG and ZIP; Linux x64 AppImage and DEB. The repository mirror contains the Web and Windows ZIPs; all platforms are available on the GitHub prerelease.

Desktop packages remain unsigned, and macOS packages are not notarized. Automated checks do not replace clean-machine, screen-reader, or all-browser qualification.
