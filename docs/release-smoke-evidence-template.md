# LoopCAT Release Smoke Evidence

Use this template for every public desktop release candidate. Keep the completed copy with the release notes or signed artifact records. Before publication, validate the completed copy with `pnpm run verify:evidence -- path/to/completed-release-evidence.md --checksum-file dist/SHA256SUMS.txt`. The release candidate must name a concrete commit SHA or matching release tag, and the artifact source plus artifact checksum section must identify the same versioned artifact bundle as `package.json` and match the generated checksum file. A ship decision must not accept unresolved release blockers such as data loss, broken import/export, online-only behavior, unsigned artifacts, missing notarization, failed clean-machine launch, or missing artifacts. Do not commit secrets, certificates, account emails, local user names, or private file paths.

## Release Candidate

- Version:
- Commit or tag:
- Date:
- Tester:
- Artifact source:
- Offline test mode: yes / no

## Automated Gates

- `pnpm install --frozen-lockfile`: pass / fail
- Release provenance verified: pass / fail
- `pnpm run verify:release`: pass / fail
- `pnpm run verify:desktop-wrapper`: pass / fail
- `pnpm run verify:browser-runner`: pass / fail
- Platform signing environment verified: pass / fail
- `pnpm run pack`: pass / fail
- Packaged desktop smoke: pass / fail
- `pnpm run verify:artifact`: pass / fail
- Platform downloadable artifacts verified: pass / fail
- All-platform download bundle verified: pass / fail
- Platform signatures and notarization verified: pass / fail
- Windows artifact build: pass / fail
- macOS artifact build: pass / fail
- Linux artifact build: pass / fail
- Checksums generated for downloadable artifacts: pass / fail
- `pnpm run verify:checksums`: pass / fail

## Artifact Checksums

- Windows NSIS installer:
- Windows portable:
- macOS DMG:
- macOS ZIP:
- Linux AppImage:
- Linux DEB:

## Windows Clean-Machine Smoke

- Artifact tested: NSIS installer / portable
- Windows version:
- Launches with internet disabled: pass / fail
- Creates a project offline: pass / fail
- Imports DOCX: pass / fail
- Imports IDML: pass / fail
- Imports XLIFF: pass / fail
- Imports Markdown: pass / fail
- Imports CSV/TSV: pass / fail
- Imports Android XML: pass / fail
- Imports iOS strings: pass / fail
- Imports HTML: pass / fail
- Saves typed targets after close and reopen: pass / fail
- Saves workspace package and clears dirty warning: pass / fail
- Shows recovery warning for unsaved workspace package changes: pass / fail
- Exports target DOCX: pass / fail
- Exports current localization file: pass / fail
- Exports XLIFF: pass / fail
- Exports bilingual DOCX: pass / fail
- Exports normal report: pass / fail
- Exports anonymized report: pass / fail
- Exports and re-imports project package as copy: pass / fail
- Restores browser backup in fresh profile: pass / fail
- Blocks delivery export for missing tag fixture: pass / fail
- Blocks delivery export for forbidden term fixture: pass / fail
- Large project remains usable: pass / fail
- Notes:

## macOS Clean-Machine Smoke

- Artifact tested: DMG / ZIP
- macOS version:
- Launches with internet disabled: pass / fail
- Creates a project offline: pass / fail
- Imports DOCX: pass / fail
- Imports IDML: pass / fail
- Imports XLIFF: pass / fail
- Imports Markdown: pass / fail
- Imports CSV/TSV: pass / fail
- Imports Android XML: pass / fail
- Imports iOS strings: pass / fail
- Imports HTML: pass / fail
- Saves typed targets after close and reopen: pass / fail
- Saves workspace package and clears dirty warning: pass / fail
- Shows recovery warning for unsaved workspace package changes: pass / fail
- Exports target DOCX: pass / fail
- Exports current localization file: pass / fail
- Exports XLIFF: pass / fail
- Exports bilingual DOCX: pass / fail
- Exports normal report: pass / fail
- Exports anonymized report: pass / fail
- Exports and re-imports project package as copy: pass / fail
- Restores browser backup in fresh profile: pass / fail
- Blocks delivery export for missing tag fixture: pass / fail
- Blocks delivery export for forbidden term fixture: pass / fail
- Large project remains usable: pass / fail
- Notes:

## Linux Clean-Machine Smoke

- Artifact tested: AppImage / DEB
- Distribution and version:
- Launches with internet disabled: pass / fail
- Creates a project offline: pass / fail
- Imports DOCX: pass / fail
- Imports IDML: pass / fail
- Imports XLIFF: pass / fail
- Imports Markdown: pass / fail
- Imports CSV/TSV: pass / fail
- Imports Android XML: pass / fail
- Imports iOS strings: pass / fail
- Imports HTML: pass / fail
- Saves typed targets after close and reopen: pass / fail
- Saves workspace package and clears dirty warning: pass / fail
- Shows recovery warning for unsaved workspace package changes: pass / fail
- Exports target DOCX: pass / fail
- Exports current localization file: pass / fail
- Exports XLIFF: pass / fail
- Exports bilingual DOCX: pass / fail
- Exports normal report: pass / fail
- Exports anonymized report: pass / fail
- Exports and re-imports project package as copy: pass / fail
- Restores browser backup in fresh profile: pass / fail
- Blocks delivery export for missing tag fixture: pass / fail
- Blocks delivery export for forbidden term fixture: pass / fail
- Large project remains usable: pass / fail
- Notes:

## Storage Failure Evidence

- Read-only workspace folder reports save failure without losing browser-cache edits: pass / fail
- Removed write permission keeps project dirty after failed package save: pass / fail
- Full or quota-limited disk reports package save failure: pass / fail
- Full or quota-limited disk reports backup export failure: pass / fail
- Missing `loopcat-workspace.json` is repaired from project package folders: pass / fail
- Corrupt project package is skipped with validation warning: pass / fail
- Notes:

## Signing And Notarization Evidence

- Windows artifacts signed with Authenticode: pass / fail
- Windows NSIS installer launches after download: pass / fail
- Windows portable launches after download: pass / fail
- macOS artifacts signed with Developer ID Application: pass / fail
- macOS artifacts notarized and stapled: pass / fail
- macOS DMG launches after download: pass / fail
- macOS ZIP launches after download: pass / fail
- macOS Gatekeeper launches without override: pass / fail
- Linux AppImage launches after download: pass / fail
- Linux DEB installs and launches after download: pass / fail
- Linux checksums published: pass / fail
- Notes:

## Upgrade And Migration Evidence

- Previous release project package imports: pass / fail
- Previous release browser backup restores: pass / fail
- Previous release workspace folder opens and syncs: pass / fail
- Secret stripping verified after upgrade: pass / fail
- Service worker cache version changed with app version: pass / fail
- Rollback artifacts retained: pass / fail
- Notes:

## Release Decision

- Ship / do not ship:
- Required follow-up before ship: None
- Residual risks accepted:
