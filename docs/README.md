# LoopCAT Documentation Map

Use this page to distinguish current product documentation from dated research and implementation records.

## Current Product And Engineering Documentation

- [Beginner Guide](beginner-guide/index.html) — friendly installation, first-project, everyday translation, QA, export, backup, and troubleshooting walkthrough ([download the Word edition](beginner-guide/LoopCAT-Beginners-Guide.docx)).
- [Main README](../README.md) — project status, installation, capabilities, architecture, tests, privacy, and development workflow.
- [Product and release roadmap](../ROADMAP.md) — shipped baseline, current priorities, release qualification, and production-ready exit criteria.
- [Capability documentation](loopcat-capabilities.md) — detailed current behavior and suggested acceptance checks.
- [Statistics and batch import implementation](statistics-implementation-2026-10-11.md) — workflows, counting/matching policy, validation, and measured limits.
- [Keyboard shortcuts](keyboard-shortcuts.md) — keyboard strategy, complete binding reference, Quick Insert behavior, context rules, and accessibility notes.
- [Desktop packaging](desktop-packaging.md) — build, artifact, security, signing, checksum, clean-machine, and repository-mirror procedures.
- [Project package format v1](loopcat-package-format-v1.md) — portable `.loopcat.json` contract, reconstruction metadata, privacy, and compatibility.
- [Brand guidelines](brand-guidelines.md) — Loopbird, naming, palette, voice, and product principles.
- [AI provider integration research](ai-provider-integration-research.md) — current implementation map plus a clearly dated external-provider verification snapshot.

## Release Records And Evidence

- [Current development preview: 0.0.4-dev.20261028.1](releases/0.0.4-dev.20261028.1.md) — changes, installation guidance, and verification limits.
- [Historical LoopCAT 0.0.3 prerelease](releases/0.0.3-prerelease.md) — July tag and superseded August mirror history.
- [Release smoke evidence template](release-smoke-evidence-template.md) — required automated, artifact, platform, storage, signing, upgrade, and release-decision evidence.
- [`downloads/`](../downloads/) — current repository web and unsigned Windows ZIP mirror plus SHA-256 checksums.

## Dated Modernization Records

These files preserve evidence and decisions from the 2026 modernization. Historical gap statements remain in place so the audit trail is understandable; each file identifies the current source of truth.

- [Batch import, Statistics, and matching implementation plan — 11 October 2026](batch-import-statistics-matching-plan-2026-10-11.md) — current-code audit, Loopcat Pro reuse, counting/matching rules, scoped popup design, and delivery acceptance gates; original plan; implementation is documented above.

The internal software review and planning prompt are available in the repository only. Desktop packages omit their contents; the links below open the repository copies.

- [Modern software review — 10 August 2026](https://github.com/gokhandogru/LoopCAT/blob/main/docs/loopcat-modern-software-review-2026-08-10.md)
- [Plan-mode prompt — 10 August 2026](https://github.com/gokhandogru/LoopCAT/blob/main/docs/loopcat-modernization-plan-prompt-2026-08-10.md)
- [Modernization baseline — 10 August 2026](modernization-baseline.md)
- [Implementation status](modernization-implementation-status-2026-08-10.md)
- [Completion audit — 24 August 2026, repository state updated 25 August](modernization-completion-audit-2026-08-24.md)

The automated implementation checkpoint is on `main`. The complete modernization and production-release claims remain blocked by the manual assistive-technology/zoom/visual matrix, controlled reference-device profiling, signed/notarized and clean-machine platform evidence, and the explicit 750 KB minified stretch-target decision.

- [Arabic localization](arabic-localization.md) — translation sources, RTL behavior, and automated verification.

## Project file management — 11 October 2026

Project cards/list rows, the editor, current Statistics file rows and the command palette share explicit file actions: Open, Statistics, Export translation, Rename, Update source file, Version history and Move to Trash. Selection controls appear when files are selected. Project Trash supports individual and bulk recovery; bulk Trash/restore accepts 1–50 files.

Source replacement reviews one same-format file, retains the logical file identity and order, and archives the complete previous source/translation state. Changed or ambiguously aligned sources keep empty targets with previous translations available as suggestions. Safely unchanged translations carry over; changed context removes confirmation. Incoming bilingual conflicts require explicit choices. Restoring a previous version creates a new head rather than deleting intermediate versions. Ordinary Trash supports Undo; source replacement is recovered through Version history. The review expires after 30 minutes and rejects intervening edits. Parsed reviews have a 150 MiB memory-size limit in addition to existing import limits.

Database schema 9, project package schema 7 and backup schema 8 preserve history and Trash in project packages, backups, checkpoints and workspace-folder exchange. Historical segments are separate from live queries. Copy restoration remaps version/segment references; source reconstruction content remains unchanged. Permanent Trash removal prunes affected recovery records and Undo entries. Saved Statistics remain historical; archived report segments open read-only.

Verification: `tests/unit/file-lifecycle.test.cjs` covers stale edits, replay, conservative carryover, ordering, selective Undo invalidation, project-copy and normal/streamed backup recovery. `node scripts/verify-file-management-workflow.cjs` exercises the production UI, source review accessibility, rename/update/version recovery/Trash and backup metadata. `node scripts/verify-statistics-workflow.cjs` covers mixed batch import and Statistics regressions. New interface strings use the existing translation lookup with English fallback where catalog translations are unavailable. No vendor score parity or large-project latency certification is implied.

- [Compact workspace UI verification](workspace-ui-verification-20261012.md) — coordinated toolbars, shared menus, file rows, localized layouts, and automated checks.
