# LoopCAT 0.0.4-dev.20260915.1 verification

Verified on 15 September 2026. Build ID: `0.0.4-dev.20260915.1+source.62d13afc27a4`.

The Windows installer, portable package, and web ZIP were built from the same source fingerprint at commit `ca89b2b56c2d2bee0285a29c26e04afd25546cf2`. See the [source and artifact manifest](release.json) and [release notes](../docs/releases/0.0.4-dev.20260915.1.md).

Checks passed:

- All 1,510 unit tests, ESLint, configured Prettier checks, TypeScript, Stylelint, import boundaries, release contracts, and renderer graph verification.
- Complete browser suite: reliability, distinct web/desktop security policies, offline shell, smoke, regression, translator workflow, workspace storage, package round trips, and large projects.
- Extracted production web ZIP in real Google Chrome through both `file:` and HTTP URLs, using a directory containing spaces. The workflow covers DOCX import and translated export, TM analysis/matching, QA, UI project creation and import, typing, persisted confirmation, checkpoints, backup round trips, and regex search.
- The same Chrome gate fails against the previous web ZIP with the exact archive-worker `SecurityError` reported by the user. Electron alone passes that old ZIP, demonstrating why the independent browser gate is necessary.
- Static web ZIP payload, desktop wrapper, packaged ASAR payload, Electron security fuses, preview artifact selection, and SHA-256 checksums.
- Packaged Windows startup smoke through the documented no-sandbox diagnostic mode on this restricted host. The release workflow requires normal packaged desktop smoke checks on native GitHub runners.
- The updated Word beginner guide was rendered through Microsoft Word and all 12 pages visually checked; the HTML guide explains extracting the complete web ZIP and opening index.html.

The repository mirror contains unsigned Windows and web packages. Native Windows, macOS, and Linux assets are built and checked on matching runners in [release run 34954939158](https://github.com/gokhandogru/LoopCAT/actions/runs/34954939158). Publication is conditional on all platform jobs and the combined checksum bundle passing. These remain unsigned development previews; the checks do not constitute an all-browser or clean-machine qualification guarantee.
