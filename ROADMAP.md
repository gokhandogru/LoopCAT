# LoopCAT Product And Release Roadmap

LoopCAT is aimed at an academic translator or post-editor who downloads the app on Windows, macOS, or Linux, opens it without internet, and can finish a real project without losing work.

## How To Read This Roadmap

This roadmap is organized by status rather than by numbered phases:

- **Shipped release baseline** records behavior that already exists and must not regress.
- **Release qualification** lists the evidence required before calling a desktop build production-ready.
- **Near-term priorities** contain the remaining product and engineering work in recommended order.
- **Ongoing guardrails** define qualities that must remain true as the product evolves.
- **Delivered milestones** preserve a concise record of major completed work without presenting it as future scope.

## Current Position And Priority Order

The core offline CAT workflow, recovery model, academic review features, broad format support, and optional AI safety controls are implemented. The remaining path to a production-ready cross-platform desktop release is primarily release qualification, deeper real-world format fidelity, and sustained large-project performance.

1. Complete signed, clean-machine release qualification on Windows, macOS, and Linux.
2. Deepen DOCX and IDML fixture coverage for complex publishing structures.
3. Add true chunked import, long-duration autosave and memory profiling, and larger persistent TM indexes.
4. Split the large UI coordinator after behavior and release gates are stable.
5. Expand research-oriented revision-history exports without weakening the core workflow.

## Shipped Release Baseline

### Offline Desktop And Network Boundaries

- Static HTML/CSS/JavaScript app shell with no CDN scripts or remote styles.
- Electron desktop wrapper for Windows, macOS, and Linux packaging.
- Desktop renderer hardening explicitly keeps web security on and disables insecure content, webviews, legacy WebSQL, drag-and-drop navigation, Node.js in workers/subframes, and packaged DevTools.
- Offline service-worker shell fails installation unless every core app asset is cached, reads app-shell responses only from the current LoopCAT versioned cache, caches only core app assets, cleans up only old `loopcat-offline-*` caches, and falls back to cached `index.html` for navigation misses.
- Browser and desktop renderer network requests are allowlisted to bundled app files and the explicit OpenAI Responses API endpoint.

### Local Storage, Packages, And Recovery

- Local IndexedDB working cache with visible workspace-folder project packages.
- Browser storage persistence is requested when available, storage usage/quota is shown in workspace health, and best-effort or nearly-full storage states warn users to export project packages or backups before long offline projects grow.
- Portable `.loopcat.json` project packages with validation, activity history, resources, source-asset metadata, secret and credential-looking label stripping, browser-only handle stripping, runtime-object rejection, and source-aware preservation for real JSON keys plus CSV/TSV cells that only look like app metadata.
- Full browser backup and restore with validation before destructive replacement.
- Backup restore and same-project package replacement flush pending target edits inside the destructive helper path and stop before replacement if pending edits cannot be saved.
- Full backup restore replaces project data and TM index metadata atomically, preserving unrelated app metadata while removing stale TM index markers.

### Import, Export, And Reconstruction Safety

- DOCX plus Other formats import/export coverage where applicable, including modern Office package variants, OpenDocument, markup, localization, DTP, interchange, programming resource, subtitle, and plain-text formats, plus TMX, TBX, and CSV/TSV/XLSX term-list import/export.
- Text-based imports, including localization files, XLIFF, TMX, TBX, terminology lists, and portable JSON, decode through BOM, charset-declaration, auto-detection, or manual encoding override for UTF-8, UTF-16, Windows code pages, ISO-8859 families, Shift_JIS/EUC-JP, GB18030/Big5, and EUC-KR; eligible text exports preserve UTF and single-byte legacy encodings when safe.
- ZIP-backed IDML imports reject unsafe archive entry paths, duplicate normalized entry names, malformed ZIP central-directory or local-header ranges, trailing central-directory data after the listed entries, local header name mismatches, and entries that fail CRC integrity validation before preserving the original package for reconstruction.
- Saved project file metadata remains visible in the file dashboard and document filter even if a file has no editable segment rows.
- Saved file-type metadata is normalized before export selection and reconstruction so package/import casing differences stay harmless.
- File imports select the newly imported document immediately, including DOCX, XLIFF, and structure-preserving localization formats.
- Import, restore, and workspace-folder sync controls are disabled during active import, restore, or sync tasks; overlapping import or sync attempts are blocked before they can mutate project data, and active imports report phase, file name, and file size in the status area while yielding between heavy parse/save/refresh phases.
- Close/reload warnings include active import or restore tasks, not only pending segment saves and unsaved workspace packages.
- Timed background autosave failures stay visibly pending and retry automatically, so transient local storage failures do not leave a dead save timer.
- DOCX text-box paragraphs plus release-style headers, footers, footnotes, comments, tables, hyperlinks, simple fields, tested complex field-code/result runs with hidden instructions excluded from source text, exact leading/trailing Word tabs and manual line/hyphen controls, run-level content controls, custom XML spans, SmartTag spans, list numbering, academic abbreviation-aware segmentation, and bold/italic/underline inline text are covered by round-trip regression tests.
- Protected inline tags and placeholders shown as short copyable labels while preserving original export text; complex Word run styles can be shown as semantic `<b>`, `<i>`, or `<u>` tags while retaining hidden style ids for exact DOCX reconstruction.
- XLIFF 2.2 Core import and target reconstruction support file/group/unit/segment hierarchy, notes, `xml:space`, Core states, `originalData`, and the `cp`/`ph`/`pc`/`sc`/`ec`/`mrk`/`sm`/`em` inline vocabulary. XLIFF 2.0 and 2.1 Core documents remain compatible.
- Generic handoff can be exported as XLIFF 1.2 or XLIFF 2.2. The 2.2 path uses the registered `application/xliff+xml` MIME type and is checked against vendored OASIS schemas in the release workflow.
- Current-file XLIFF 2.x reconstruction updates only mapped target content and Core segment state while retaining groups, notes, ignorable content, original data, skeletons, custom attributes, and Part 2/custom extension XML in the source shell.
- Export gates for empty target segments, missing protected tags, unbalanced inline markup, invalid XML characters, unsafe HTML, entity-obfuscated scriptable HTML attributes, and CSS-escaped scriptable style attributes.
- Final DOCX, XLIFF target, and localization target reconstruction use target text only and do not silently reinsert source text for empty target segments.
- Delivery exports obey the selected document and block visibly when the selected file type cannot produce that export.
- Forbidden target terms in termbases are checked by QA, preserved in TBX, listed in offline project reports, and blocked in delivery export validation.
- Failed browser download clicks report visibly, remove the temporary hidden link, and revoke the temporary object URL instead of leaving export debris in long desktop sessions.

### Translation, Review, QA, And Research Evidence

- Bounded per-segment target revision history is visible in the editor, portable in backups/packages, and counted in offline reports.
- Anonymized offline project reports preserve counts while redacting project names, file names, resource names, terminology text, activity summaries, activity types, and segment text.
- Bilingual DOCX review exports include segment status, reviewer notes, structured comments, and QA summaries.
- QA, project analysis, TM/TB management, comments/review states, find/replace, and offline HTML project reports.
- Quality Workbench profile controls, LQA-style quality decision categories, risk-prioritized review navigation, and Quality Passport HTML exports are now supported so translators can produce count-only review evidence without exposing segment text.
- Locale-stable TM token normalization, QA term matching, worker matching, repetition analysis, export validation, editor search/replace, and duplicate-file detection so cross-platform project behavior does not depend on the OS/browser UI locale.

### Scale, Durability, And Workspace Synchronization

- Large-project browser coverage verifies thousands of segments, revision-aware batch saves, indexed TM lookup, QA, validation, visible workspace-package save, and backup metadata.
- Project saves require a project name plus source and target languages, while malformed legacy browser-cache projects still list with safe identity fallbacks for recovery.
- Startup recovery warning for workspace packages that were changed before the previous session closed.
- Connecting a workspace folder marks local browser-cache projects missing from that folder as unsaved without marking projects already present in the folder dirty.
- Workspace package listings merge manifest entries with visible package folders, so a valid but stale manifest cannot hide package files from sync.
- Workspace status counts visible package files, ignores stale manifest refs and empty project folders without package files, and still warns on damaged, oversized, or invalid package JSON.
- Workspace health checks count visible package folders missing from a stale manifest without rewriting the manifest during read-only diagnostics.
- Workspace manifest repair deduplicates renamed project package folders by project ID and keeps the newest visible package.
- Workspace sync preserves imported-package validation notes, records package-import activity on the imported project, and runs through the same busy-state guard as file imports so it cannot overlap with another import.
- Workspace storage tests now simulate package, resource-index, manifest, and backup-manifest write failures so failed folder saves do not advance in-memory state beyond what was actually written.
- Recovered workspace manifest writes clear stale write-error status so an old folder failure does not remain visible after a later successful save.
- Workspace backup exports validate generated backup data before folder writes and show validation details instead of creating malformed recovery files.
- Manual workspace saves commit the workspace-save activity event only after the visible project package has been written, and failed package writes keep the project marked dirty for retry instead of creating misleading save history.
- Background workspace saves flush queued active target edits before writing project packages, so folder copies are not marked clean with stale segment text.
- Browser project-package exports flush queued target edits and revision history before download, and failed pending-save flushes block the download plus export activity so portable recovery packages include the latest typed segment text.
- Backup reminder for long-running projects without a recent portable project package export.

## Release Qualification

These are release-blocking requirements. A build is not production-ready merely because it packages successfully or passes local automated checks.

### Automated And Supply-Chain Gates

- Keep the generated `pnpm-lock.yaml` in sync with `package.json`; do not hand-write it.
- Run `pnpm install --frozen-lockfile`, `pnpm run verify:release`, and the browser test runner on a clean machine.
- Verify the desktop protocol wrapper with `pnpm run verify:desktop-wrapper` so only bundled runtime files are served through `loopcat://app/` and the renderer hardening flags stay locked down.
- Build Windows, macOS, and Linux artifacts through `electron-builder`; unsigned builds are only for internal smoke, while public release candidates must use the documented signing/notarization credentials and pass platform signature verification.
- Verify packaged `app.asar` payloads with `pnpm run verify:artifact` so runtime files referenced by `index.html`, the service worker, and the desktop protocol are present, bundled source/docs files match the current source tree, network policy is preserved, integrity metadata checks pass, and test/debug files are excluded.
- Generate SHA-256 checksums for public desktop download artifacts through `pnpm run checksums`, rejecting stale or unexpected public downloads whose filenames do not match the expected LoopCAT release names and current package version.
- Reject undersized public desktop artifacts before checksum generation or publication so interrupted installer/portable builds cannot look release-ready.
- Verify generated public-artifact checksums with `pnpm run verify:checksums` before uploading artifacts, including expected-name and current-version filename checks.
- Keep public artifact and platform signature selection rules covered by self-tests so unexpected source/debug-like downloads and duplicate expected artifacts fail before release packaging or signing continues.
- Keep signing-environment rules covered by self-tests so partial or whitespace-only Windows/macOS credential sets fail before release packaging and secret values are not printed.
- Keep release provenance covered by self-tests so missing `.git`, empty `.git`, invalid worktree gitdir files, missing linked gitdirs, and missing Git executables fail before packaging.
- Recover abandoned desktop build locks when an interrupted packaging process has exited, while still rejecting concurrent live builds.
- Upload only public platform downloads plus `SHA256SUMS.txt`; keep unpacked app folders and builder debug files out of release uploads.
- Validate the completed release smoke evidence with `pnpm run verify:evidence -- path/to/completed-release-evidence.md` so placeholders, failed checks, vague platform artifact-tested choices, missing per-artifact launch evidence, and private paths are rejected before publication.

### Required Platform Evidence

- Smoke test every public artifact with import, edit, close/reopen, workspace save, package export, and target export.
- Record clean-machine results for Windows, macOS, and Linux, including every public installer, portable package, and archive type.
- Record disk-full and permission-denied results for workspace-folder saves.
- Record Windows signing plus macOS signing, notarization, stapling, and Gatekeeper results before publication.
- Disk-full, permission-denied, and clean-machine smoke-test procedures are now documented; real release candidates still need recorded results on each OS.

## Near-Term Product And Engineering Priorities

### Priority 1: Complex Format Fidelity

- Deepen DOCX reconstruction coverage for nested fields, unusual anchored shapes, complex tables, and broader real-world header, footer, footnote, and comment fixtures.
- Expand IDML fixture depth for threaded stories, footnotes, tables, anchored objects, multi-story article order, and real-world InDesign exports.
- Add module-aware editing and validation for the optional XLIFF 2.2 Part 2 modules. Current support preserves module XML during reconstruction but does not expose every module as editable LoopCAT data.
- Broaden XLIFF interoperability fixtures with files emitted by additional commercial and open-source CAT tools, especially spanning codes, subflows, resegmentation, and module-heavy documents.
- Add real-world fixtures whenever a new format relies on a less common character encoding.

### Priority 2: Performance, Scale, And Maintainability

- Add chunked imports for very large documents.
- Expand persistent indexes for large TMs while keeping TM matching and QA in workers.
- Extend large-project tests with truly long-running autosave and memory profiling.
- Split the large UI coordinator into smaller controllers after behavior stabilizes.

### Priority 3: Academic Research Workflows

- Expand revision-history export options for research workflows; bounded per-segment target history is already visible in the editor and counted in reports.

## Ongoing Product Guardrails

### Minimum Real-Project Workflow

- Keep project creation, file import, segmentation, editing, status changes, confirmation, QA, and target export stable.
- Preserve source structure for all currently supported formats and block final delivery when original reconstruction metadata is missing.
- Keep every file picker resilient: damaged or oversized files must fail without partial import.
- Keep autosave plus workspace-package dirty tracking visible so browser cache and folder copies never silently drift.
- Keep project package export/import and full backup restore as the recovery path for every project.
- Keep import/export behavior source-backed and test-driven: every new format needs round-trip fixtures and failure tests.

### Optional AI Without Breaking Offline Use

- Keep all AI features disabled by default and clearly optional.
- Never export API keys, provider tokens, session/cookie credentials, credential-looking project/file/resource labels, credential-looking record IDs, or similar secrets in packages, backups, validation reports, reports, download names, workspace manifests, or workspace files; portable export and direct restore sanitization should replace secret-shaped IDs with non-secret surrogates while keeping internal references valid.
- Typed OpenAI keys are stored locally only when OpenAI is the selected provider; saving another provider cannot overwrite browser OpenAI key storage.
- Non-OpenAI AI-settings activity logs mark OpenAI key storage as not applicable instead of reusing a saved OpenAI key status.
- Normalize project, file/document, resource, and AI settings metadata through allowlists in the project-save layer and during document imports, direct TM/termbase saves, direct TMX/terminology imports, package exports, TMX/TBX exports, backup exports, report exports, and direct backup restores so secret-shaped leftovers, credential-looking source/target language labels, project/file/resource label metadata, credential-looking TM/TMX origin metadata, credential-looking project domain metadata, credential-looking termbase notes, credential-looking provider/model labels, credential-looking style instructions, invalid key-mode metadata, custom endpoints, prompt templates, and other non-allowlisted provider metadata cannot persist or travel with a project.
- Normalize direct TM and termbase saves/imports through the shared resource-save layer so incomplete memory or terminology rows cannot become stored local resources; incomplete direct resource lookups fail closed instead of reading malformed language pairs, and TMX/TBX exchange parsing/export rejects incomplete resource metadata before handoff files are read or written.
- Normalize saved AI suggestions before local segment storage and portable handoff so review-useful target suggestions remain available while duplicated source text, provider response/request IDs, prompt traces, credential-looking explanation metadata, custom endpoints, and other provider metadata are stripped or redacted.
- Normalize AI activity event details, including drafted project-package and workspace-save records, before local storage and again before package, backup, workspace-package, and report handoff so prompt-like summaries, credential-looking activity types, provider response/request IDs, prompt traces, custom endpoints, and credential-looking provider/model detail values do not persist locally or travel outside the project cache; scrub credential-shaped values from non-AI activity summaries and types before portable/report handoff as well.
- Sanitize stale workspace manifests and workspace health reports so credential-looking project and resource labels from old or externally edited manifests are not re-saved or shown again.
- Redact credential-looking values from validation report messages, project-package validation alerts, offline project-report readiness notes, visible project/file/resource labels, confirmation prompts, save/status messages, workspace manifest project/resource/backup metadata, workspace package and backup scan warnings, workspace write errors, backup-manifest warnings, and workspace sync warnings, so malformed imported files, externally named folders, stale manifests, unsafe package paths or backup names, read errors, and write errors cannot leak secrets through diagnostic text, report HTML, browser alerts, visible UI text, or rewritten workspace metadata.
- Keep metadata stripping path-aware so original JSON source reconstruction keys such as `prompt`, `responseId`, `customEndpoint`, `password`, `accessToken`, and `fileHandle` are preserved only under real localization reconstruction data, not fake `sourceJson` metadata elsewhere.
- Make every external AI call explicit, source-sharing gated, and recoverable.
- Enforce project-level AI/source-sharing consent inside the OpenAI helper before any external network request is made.
- Enforce project-level TM and termbase context toggles inside the OpenAI helper so disabled local context cannot be sent by caller mistake.
- Redact credential-looking values from optional local TM and termbase context snippets before OpenAI request construction, while preserving the active source segment the user explicitly chose to send.
- Malformed optional local TM/termbase context now fails closed before OpenAI request construction, and malformed provider output reports a recoverable empty-suggestion status instead of a raw runtime error.
- Credential-looking source/target language metadata is redacted before project saves, package validation, portable handoff, and external AI prompt construction.
- OpenAI suggestions now require action-time confirmation that names selected/source text plus optional local TM, termbase, and style context before source text is sent or API keys/settings are saved for the request.
- OpenAI Responses requests explicitly set `store: false` so provider response storage is not silently enabled.
- OpenAI suggestions fail fast while the browser reports offline, before source-sharing confirmation, typed key storage, or project AI-settings persistence.
- OpenAI provider connection failures report a clear recoverable status instead of raw browser fetch errors.
- Approved OpenAI provider connection failures keep already-saved settings and keys but do not create AI suggestions.
- Desktop network boundaries allow only the exact OpenAI Responses endpoint and reject credential-bearing, alternate-port, query-string, fragment, and non-approved OpenAI URL variants.
- The legacy GPT toolbar shortcut has been removed from the web and desktop builds; translator-facing AI actions now route through configured provider workflows and the AI Command Centre.
- AI settings saves report optional activity-log failures visibly while keeping successful settings and local key storage intact.
- AI suggestion save/apply actions report optional activity-log failures visibly while keeping the saved suggestion or target text intact.
- Production builds no longer expose mock AI drafts; browser tests exercise the real OpenAI suggestion path with local provider stubs.
- Support offline work as the default path even when AI settings exist in a project.

## Delivered Milestones

### Desktop Reliability Foundations

- Installer signing/notarization guidance for Windows and macOS is now documented in `docs/desktop-packaging.md`.
- DOCX release smoke fixtures now cover bold/italic inline text, text boxes, footnotes, headers, footers, lists, tables, and comments.
- Release smoke evidence now has a reusable template, `pnpm run verify:release` requires it to stay present and complete, and `pnpm run verify:evidence` validates completed release-candidate evidence before publication.

### Academic CAT Minimums

- Terminology workflows support CSV/TSV/XLSX term-list import, forbidden target terms, and offline terminology report tables.
- Reviewer-friendly bilingual DOCX export with comments, QA summaries, and segment status is supported.
- Bounded per-segment target history is visible in the editor and counted in reports.
- Project-level domain metadata remains supported; the separate academic metadata section has been removed from the app.
- Language-pair setup now uses bundled offline language/locales, dropdown suggestions, and recent/common pair shortcuts while preserving normalized language codes for TM, termbase, package, and AI workflows.
- Anonymized project-report export for research documentation is supported.

### Format Depth Delivered So Far

- DOCX reconstruction ignores deleted tracked-change text, excludes hidden complex-field instructions from translatable source text, preserves Word tabs and manual line/no-break/soft-hyphen controls, exposes complex bold/italic/underline run properties through semantic tags with style ids, and preserves surrounding Word structure for mixed-style hyperlinks, simple fields, tested complex field-code/results, run-level content controls, custom XML, and SmartTag text.
- DOCX segmentation keeps common academic abbreviations and initials, such as `Prof.`, `Fig.`, `e.g.`, and `A. B. Author`, inside their sentence-level translation units.
- Markdown import/export has structure-preserving round-trip coverage for headings, paragraphs, lists, blockquotes, front matter, code fences, tables, and reference links.
- XLIFF current-file export blocks missing source reconstruction data instead of silently producing a generic XLIFF, and generic XLIFF 1.2/2.2 handoff export validates project language metadata plus segment source text before writing.
- XLIFF 2.2 Core states, hierarchy, notes, whitespace, original data, inline codes, and extension-preserving target reconstruction are covered by browser and packaged-desktop probes plus offline OASIS schema validation.
- Structure-preserving localization exports validate segment-level reconstruction maps, including subtitle cue timing, PO line indexes, JSON paths, delimited rows, HTML/XML element indexes, and IDML story positions.
- Direct localization export calls normalize format labels and reject malformed segment lists before dispatching to format-specific builders.
- Export validation requires real numeric reconstruction indexes, matching the localization builders, so malformed package metadata is reported before a target export attempt.
- PO/POT and SRT participate in package/export reconstruction validation, including SRT top-level source metadata.
- CSV/TSV localization import/export preserves rows and columns for source, target, and key-style tables.
- Android resource XML and iOS `.strings` import/export are supported for mobile localization projects.
- IDML package import/export supports story XML text while preserving the original package structure, including simple paragraph character-style ranges exposed as semantic inline tags and rebuilt as real IDML style ranges.
- Character encoding coverage keeps Unicode text native while supporting common legacy code pages for import and preservable text exports.

### Performance Foundations

- Import progress indicators report active phase, file name, and file size while yielding before heavy parsing, saving, or refreshing project data.
- TM matching and QA run in workers.
- Large-project tests cover thousands of segments, revision-aware batch saves, TM index lookup, QA, validation, workspace package save, and backup metadata.

## Production-Ready Exit Criterion

LoopCAT is production-ready for this target when a clean machine can install the app, import a real project, translate or post-edit it offline, close and reopen safely, recover from a backup/package, pass QA/export gates, and produce target files without internet access.
