# LoopCAT modernization implementation status

Status date: 2026-08-13
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
- A checked quality/review controller now owns Comments and Quality Workbench rendering, review/profile/decision form values and event lifecycles, delegated risk navigation, in-progress form preservation, deterministic empty states, and focus restoration across risk-list rendering. Quality scoring, QA, persistence, commands, status/activity, workspace dirtiness, AI review safeguards, and Quality Passport/report generation remain injected domain boundaries.
- A checked recovery/workspace controller now owns workspace health and local-storage presentation, connected/unsupported/busy control states, project-folder status, recovery and backup-reminder rendering, workspace action listeners, recovery dismissal, menu access, cleanup, and visible focus restoration when recovery UI disappears. Directory handles, workspace manifest v1, project-package schema 5, database/backup schema 6, dirty-marker persistence, pending-save flushes, autosave, package validation/import conflict policy, repair, redaction, jobs, and status remain injected domain boundaries. The recovery-folder action now stops the application outside-click handler from immediately closing the menu.
- A checked import/export controller now owns project-file, project-package, browser-backup, TMX, TBX, term-list, delivery, project-report, Quality Passport, and anonymized-report event lifecycles; sequential multi-file input reset; one shared import busy state; safe validation-report DOM; delegated dismissal; auto-dismiss timing; and visible focus restoration. Parsers, encoding detection, format reconstruction, package/backup replacement, pending-save flushes, report generation, downloads, validation/redaction policy, activity history, workspace dirtiness, storage, and status remain injected application boundaries.
- A checked AI administration controller now owns global and project provider-form values, provider preset/model options, safe provider-summary DOM, privacy/status/progress/busy presentation, prompt previews, output disclosure, static contextual/command-centre action listeners, language-field event lifecycle, and cleanup. Provider registries/adapters, endpoint allowlists, credential storage, prompt construction, external-send consent, batches/cancellation, suggestions, commands/Undo, provenance, project persistence, activity history, redaction, and status/error decisions remain injected application boundaries.
- A checked immutable compatibility-module registry now makes the runtime installer the single bridge from the legacy `window.CatHan` module namespace into the application runtime. `app.js` reads only `window.CatHan.appRuntime`; storage, projects, AI, encoding, format handlers, workspace storage, i18n, focus, workers, QA, validation, analysis, and quality APIs are injected through the runtime. Release verification rejects direct feature-global access returning to the coordinator.
- AppStore is now the sole writer for application route, selected project/document identity, active segment identity, and Focus mode. Editor filters are owned by one checked FilterStore, while a checked EditorSessionStore owns project/session record replacement behind a temporary compatibility bridge.
- A checked SegmentGridController now owns the virtual window, coalesced scroll and row-update frames, active-segment dispatch, visibility scrolling, and focused target-editor lookup. A checked EditorContextController coordinates Matches, Terms, Review, History, AI suggestions, and Quality refreshes while their domain services and renderers remain injected.
- The 6,367-line application workflow characterization driver now lives under `tests/app-workflow/` and is composed into `app.js` lexical scope only by the test renderer build. Source and artifact checks reject the driver from the production graph while the existing deep browser workflow remains unchanged.
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

- Packaged production JavaScript graph: 2,390,004 bytes across five modules, including both mutually exclusive startup paths.
- Hosted/desktop initial production `app.js`: 950,431 bytes minified and 261,550 bytes gzip. Its two locale chunks remain lazy.
- Direct-file web fallback `app-file.js`: 1,194,980 bytes minified and 345,429 bytes gzip; it is self-contained because browsers block module imports from `file://` and is not executed by HTTP(S) or Electron.
- Initial synchronous JavaScript is more than 40% below the recorded approximately 2.62 MB baseline. Hosted gzip remains within the 250 KiB-class budget but is 11,550 bytes above a strict 250,000-byte interpretation; the hosted entry remains 200,431 bytes above the 750 KB minified stretch target.
- Visual verification passes 81 deterministic screenshots covering 1440×900, 1366×768, and 1024×768, including an actionable import-validation failure, visible focus recovery, the local recovery panel and open workspace-status menu, populated Comments and Quality Workbench inspectors, Resources TM dashboard/detail, termbase dashboard, populated resource Trash, post-restore empty Trash, the TM threshold and OPUS-CAT help dialogs, provider administration/AI Command Centre, light/dark, inspector open/closed, Focus mode, AI, status, and compact-density states.
- Automated accessibility checks pass the deterministic Projects, import-validation error and focus-return path, actionable local recovery panel, open workspace-status menu, Resources translation-memory/termbase empty states, populated resource Trash, populated Comments and Quality Workbench states, AI provider administration/Command Centre and focus-return path, New project dialog, About dialog, TM threshold dialog, OPUS-CAT help dialog, and command-palette states with zero blocking findings. This is not a WCAG conformance claim.
- The full Electron browser suite passes security, offline shell, smoke, regression, application workflow, workspace storage, package round trip, and large-project coverage.
- The packaged Windows desktop passes artifact inspection, fuse verification, renderer OS sandbox verification, GPU-enabled startup, and the explicit GPU-disabled fallback.

## Partial roadmap packages

### P1-08 — Remaining `app.js` extraction

The new checked boundaries are active, but `app.js` remains the compatibility coordinator and is still 13,820 source lines. The 6,367-line workflow driver is now external and composed only into the test graph, but the roadmap's source goal of a bootstrap under 300 lines is not met.

The synchronous dialog-lifecycle, async project-dialog, TM-threshold, OPUS-CAT help, Resources, quality/review, recovery/workspace, import/export/report, and AI provider-administration/command-centre UI slices are complete. All 18 AI registry positions now install through checked adapters rather than provider implementations in `ai.js`. This includes the hosted OpenAI-compatible family (Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, and Fireworks AI), the native Responses family (OpenAI, xAI, and Azure OpenAI), native chat-completion providers (DeepSeek and Mistral), Perplexity Sonar, Google Gemini Interactions, Anthropic Messages, Cohere Chat V2, local/hosted Ollama, loopback/allowlisted OpenAI-compatible servers, and OPUS-CAT direct/bridge MTRestService. Their original registry positions, endpoints, credentials, payloads, parsing, metadata, timeout/cancellation behavior, redacted errors, consent rules, and temporary compatibility exports are characterized independently. Release verification now rejects any provider object implementation or provider registration returning to `ai.js`. The explicit-consent direct OpenAI suggestion flow remains separate and unchanged in the AI façade. Still required before this package is complete:

1. Remove the temporary EditorSessionStore compatibility accessors by moving project/session reads and replacement writes behind explicit injected controller/repository interfaces. AppStore navigation/selection ownership is complete.
2. Reduce the remaining `app.js` compatibility coordinator toward the roadmap's bootstrap-only goal, one characterized feature boundary at a time.
3. Keep each extraction behavior-preserving and run the focused feature suite plus the full browser/release suite at each family boundary.

### P2-05 — Performance stretch target

Lazy locale chunks, production/test graph separation, minification, update lifecycle, and offline asset generation are delivered. The hosted/desktop initial bundle meets the relative-reduction and 250 KiB-class gzip targets but remains 200,431 bytes above the 750 KB minified stretch target. The separately loaded direct-file fallback is a compatibility artifact and must be tracked independently. Further reduction should come from the P1-08 feature extractions and lazy loading of the remaining uncommon feature families, not from removing offline capability or mature format support.

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

Continue P1-08 by removing the temporary EditorSessionStore compatibility bridge for the first project/session record family. The AppStore navigation/selection slice is complete.

Entry criteria:

- Characterize project-list, current-project, and session-array replacement across project/file switching, imports, Trash restore, Undo/Redo, and reload recovery.
- Preserve the completed AppStore characterization across Projects → dashboard → editor, project/file switching, Focus mode, filters, Undo/Redo, and reload recovery while project/session ownership moves.
- Preserve the extracted compatibility-module registry, provider installer, all registry positions, provider selection/administration, endpoint allowlists, key storage, consent/redaction, jobs, commands/Undo, persistence, status, and offline behavior.
- Move one project/session field family at a time behind explicit EditorSessionStore selectors/actions and injected repository/controller calls; retain a narrow read-only compatibility accessor only until that family has no direct legacy writer.
- Do not combine state ownership changes with visual redesign, storage migration, provider changes, or new features.

Exit criteria:

- EditorSessionStore is the only writer for the selected project/session record family, with checked selectors/actions and no new global mutable state.
- The migrated family no longer relies on `attachCompatibility` setters, while unmigrated readers continue through narrow read-only accessors.
- Focused controller/repository tests, provider adapter tests, security policy, AI UX, web/desktop smoke, app workflow, package/workspace round trips, and FULL-SUITE gates pass with no intended user-visible difference.

Continue until `app.js` is a bootstrap-only compatibility entry and the façade can be removed without changing mature LoopCAT behavior.
