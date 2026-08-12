# LoopCAT modernization implementation status

Status date: 2026-08-12
Baseline commit: `0a2d5343d6c2a2ef859a16bc0674e128e7803d1a`
Implementation state: substantial P0-P3 delivery, with P1-08 extraction and the performance stretch target still partial

This document records what the current working tree implements from the 2026 modernization roadmap. It supplements, and does not replace, the review and plan. The repository must not be described as having completed the entire roadmap until the partial items below and the remaining manual/platform gates are closed.

## Delivered

- Deterministic characterization fixtures, bundle/version-contract enforcement, three-viewport screenshot capture, accessibility automation, and focused unit/static gates.
- Separate esbuild production/test renderer graphs. Production verification rejects workflow harnesses, mocks, fixtures, debug routes, source test globals, and test imports.
- One generated production asset manifest used by renderer staging, web packaging, desktop packaging/protocol allowlisting, service-worker caching, and artifact verification.
- Electron 43.3.0, electron-builder 26.15.3, Node 24 tooling, renderer sandboxing, context isolation, secure fuses, hardware acceleration by default, and an explicit restart-based GPU fallback.
- Immediate accessibility repairs for live status, focus visibility, modal focus containment/restoration, disclosure state, and command-palette keyboard behavior.
- A checked shared dialog-lifecycle controller now owns open, close, native cancel, initial focus, and explicit focus return for About, Diagnostics, Trash, the TM pretranslation threshold prompt, and OPUS-CAT connection help. Feature-local adapters return only user intent: TM matching and provider/network ownership remain in their existing services. TM cancel returns to the visible Segment tools trigger; OPUS-CAT help returns to its visible Project settings entry point. The superseded `showManagedDialog` helper and direct TM/OPUS lifecycle listeners are removed.
- A checked project-dialog controller owns create/edit mode, asynchronous resource preparation, field and delegated dynamic listeners, workspace-folder interaction, AI-settings deep linking, and lifecycle delegation. The existing domain save service remains the only persistence/validation boundary, and no project/resource/workspace data moved into UI state.
- A checked Resources controller now owns Resources navigation, TM/termbase tab state and keyboard behavior, view-local resource selection, language-field normalization, import-input lifecycle, card/detail/row event delegation, initial focus, and focus restoration across asynchronous resource refreshes. Existing parsers, storage, exports, validation, linked-project dirtiness, and recovery boundaries remain injected domain services. Empty Resources actions now open the dedicated resource import inputs instead of the project-level import inputs.
- Checked JavaScript/JSDoc, ESLint, Prettier, Stylelint/token enforcement, import-boundary checks, Node focused tests, axe checks, and visual regression checks. Prettier now follows the repository's `.gitattributes` LF contract, so the formatting gate is reproducible on a clean checkout.
- Explicit app store, navigation, platform, repository, preference, status/job/error, feature-controller, command, palette, theme, layout, update, diagnostics, safe-DOM, and report-template boundaries under `src/`.
- A quiet semantic design system with restrained surfaces, no persistent blur, semantic light/dark roles, Balanced/Compact density, remembered inspector/layout preferences, and responsive Projects → dashboard → editor layouts.
- Contextual inspector tabs, fuzzy/grouped `Ctrl/Cmd+K` palette, recent commands, filter presets, contextual AI suggestions, separated provider administration, inspectable provenance, AI apply-and-next, and reversible AI application.
- IndexedDB schema 6 with persistent manual Trash for projects, project files, individual TM entries, individual terms, whole translation memories, and whole termbases while preserving project-package schema 5 and compatibility with existing package/backup paths.
- Transactional project/file Trash, segment confirmation/confirm-and-next, quick review-state, target replacement, segment splitting/merging, and AI-application operations with Undo/Redo. Command restores use monotonic revisions so IndexedDB's stale-write protection cannot silently reject an Undo.
- Resource deletion now uses the same bounded command/Undo/Redo model instead of immediate confirmation and hard deletion. Resource records and their token indexes are removed atomically; restoration recreates exact content and metadata, marks indexes for safe lazy rebuild, refreshes linked projects, and blocks ID or same-name/language-pair conflicts without overwriting live data or discarding the Trash item. Empty Trash remains the only irreversible deletion action.
- `SplitSegment` and `MergeSegment` use independent typed structural commands over one atomic IndexedDB boundary. Merge updates the surviving segment and deletes the merged-away segment in one transaction; Undo restores both stable IDs/order/history, Redo deletes only the merged-away segment with monotonic revisions, and a forced first-transaction failure records no command or partial state.
- Ordinary target typing now uses coalesced `EditTarget` commands: one continuous typing session creates one redacted Undo receipt while preserving the 450 ms autosave/retry path, exact target history/provenance restoration, persisted Undo/Redo, active selection, and monotonic revisions.
- Copy Source, TM-match/concordance insertion, and protected-tag insertion now use discrete redacted commands. A pending typing session is finalized below the producer command, and Undo/Redo restores target state, persistence, selection, provenance boundaries, monotonic revisions, and protected-tag caret placement.
- TM and Local/Hosted AI pretranslation now use atomic, bounded batch commands. TM applies all matched patches in one storage transaction; AI persists successful provider results only after completion, rolls back all in-memory output on cancellation, preserves confirmed/locked safeguards, and exposes one redacted Undo/Redo operation with TM/AI provenance and review-state restoration.
- Actionable service-worker update lifecycle that waits for user action and flushes pending saves before activation/reload.
- Centralized trusted DOM/report boundaries, CSP Trusted Types enforcement in Electron/Chromium, safe worker/service-worker URL construction, and no remaining unallowlisted raw `innerHTML` writes in application code.
- Local-only redacted diagnostics covering runtime, sandbox/GPU status, storage estimates, update state, and normalized errors without source, target, prompt, key, or exact-path content.
- Translator-first modernization copy in English, Catalan, and Turkish. The locale catalogs validate with no blank Catalan or Turkish messages.
- The downloadable web package now selects a self-contained `file://` renderer entry while HTTP(S) retains lazy ES modules; direct-file and hosted smoke tests exercise real New project and About interactions, and Electron keeps its static private-protocol entry.

## Measured results

- Packaged production JavaScript graph: 2,374,860 bytes across five modules, including both mutually exclusive startup paths.
- Hosted/desktop initial production `app.js`: 943,832 bytes minified and 251,718 bytes gzip (approximately 245.8 KiB). Its two locale chunks remain lazy.
- Direct-file web fallback `app-file.js`: 1,187,408 bytes minified and 335,321 bytes gzip; it is self-contained because browsers block module imports from `file://` and is not executed by HTTP(S) or Electron.
- Initial synchronous JavaScript is more than 40% below the recorded approximately 2.62 MB baseline. The roadmap's 250 KB gzip target is met; the 750 KB minified stretch target is not yet met.
- Visual verification passes 63 deterministic screenshots covering 1440×900, 1366×768, and 1024×768, including Resources TM dashboard/detail, termbase dashboard, populated resource Trash, post-restore empty Trash, the TM threshold and OPUS-CAT help dialogs, light/dark, inspector open/closed, Focus mode, AI, status, and compact-density states.
- Automated accessibility checks pass the deterministic Projects, Resources translation-memory/termbase empty states, populated resource Trash, New project dialog, About dialog, TM threshold dialog, OPUS-CAT help dialog, and command-palette states with zero blocking findings. This is not a WCAG conformance claim.
- The full Electron browser suite passes security, offline shell, smoke, regression, application workflow, workspace storage, package round trip, and large-project coverage.
- The packaged Windows desktop passes artifact inspection, fuse verification, renderer OS sandbox verification, GPU-enabled startup, and the explicit GPU-disabled fallback.

## Partial roadmap packages

### P1-08 — Remaining `app.js` extraction

The new checked boundaries are active, but `app.js` remains the compatibility coordinator and is still approximately 20,000 source lines, including the isolated workflow-test source section. Production strips the test driver, but the roadmap's source goal of a bootstrap under 300 lines is not met.

The synchronous dialog-lifecycle, async project-dialog, TM-threshold, OPUS-CAT help, and Resources slices are complete. Still required before this package is complete:

1. Extract quality/review, recovery/workspace, import/export/reports, and the remaining AI UI orchestration one family at a time.
2. Move provider implementations from the `ai.js` façade into independently tested adapters without changing provider behavior or consent rules.
3. Replace remaining mutable compatibility state with injected repositories/controllers and remove new code's reliance on `window.CatHan`.
4. Keep each extraction behavior-preserving and run the focused feature suite plus the full browser/release suite at each family boundary.

### P2-05 — Performance stretch target

Lazy locale chunks, production/test graph separation, minification, update lifecycle, and offline asset generation are delivered. The hosted/desktop initial bundle meets the relative-reduction and 250 KiB-class gzip targets but remains 193,832 bytes above the 750 KB minified stretch target. The separately loaded direct-file fallback is a compatibility artifact and must be tracked independently. Further reduction should come from the P1-08 feature extractions and lazy loading of the remaining uncommon feature families, not from removing offline capability or mature format support.

## Manual and external release gates still required

- NVDA/Windows and VoiceOver/macOS audited-flow checks, including keyboard, focus return, 200% zoom, reduced motion, increased contrast, and forced colors.
- Signed packaged smoke/artifact evidence on macOS and Linux in addition to the completed Windows evidence.
- Cold/warm startup, typing latency, long-task, and large-project scroll measurements on the named reference laptop. The roadmap targets remain targets until this evidence is recorded.
- Final release-candidate visual review by a human at all three required viewports and both themes.

## Current green automated gates

- `pnpm verify:release`
- `pnpm verify:desktop-wrapper`
- `pnpm verify:ai-sidebar-ux`
- `pnpm i18n:validate`
- `pnpm verify:web-artifact`
- `pnpm verify:web-smoke`
- `pnpm verify:browser-runner`
- `pnpm verify:quality`
- `pnpm verify:a11y`
- `pnpm verify:visual`
- `pnpm verify:artifact`
- `pnpm verify:fuses`
- `pnpm verify:desktop-smoke`

## Recommended next implementation task

Continue P1-08 with a behavior-preserving quality/review extraction.

Entry criteria:

- Preserve the quality profile, structured review decisions/comments, QA and category-risk aggregation, segment selection/focus, report/passport outputs, command/status boundaries, AI safeguards, and all storage/package contracts.
- Characterize quality-workbench rendering, profile persistence, decision save/failure paths, active-segment review-state changes, comments/category/severity metadata, filtering, report aggregation, and keyboard/focus behavior before moving ownership.
- Extract checked quality/review state and DOM/event ownership behind injected repositories, commands, status/error services, report boundaries, and one owned DOM root. Do not move QA, report generation, AI, or persistence logic into the controller.
- Keep the extraction behavior-preserving: no information-hierarchy or visual redesign in this slice.

Exit criteria:

- Quality/review view state, rendering, delegated events, focus restoration, and cleanup are owned by an explicit checked controller; domain changes still cross the existing command/repository boundaries.
- Existing quality profiles, review decisions, comments, category/severity evidence, filters, reports, AI provenance, and package/recovery behavior are unchanged under characterization tests.
- Focused controller/state tests, accessibility/visual checks, web/desktop smoke, app workflow, package/workspace round trips, and FULL-SUITE gates pass with no intended visual difference.

After the quality/review family, continue P1-08 with recovery/workspace, import/export/reports, and the remaining AI UI orchestration one behavior-preserving boundary at a time.
