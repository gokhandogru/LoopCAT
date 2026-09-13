# Reliability implementation and qualification

Implementation of the accepted R1–R16 review plan, based on commit `a1e6871880e26651df74637bd75368f46d863da3`. The original review and probes remain under `output/`. This document describes the working source tree, not previously published installers. No release was published by this work.

## Finding-to-implementation checklist

Unit test filenames below are under `tests/unit/`. Real browser regressions are in `tests/reliability/browser-driver.js` and the existing HTML suites.

| Finding | Implementation | Regression evidence |
|---|---|---|
| R1 Folder generation race | Generation-checked dirty clearing; serialized manual/background writes. | Workspace dirty/save controller tests; real OPFS delayed-write case. |
| R2 Outstanding save barrier | Immutable pending/in-flight snapshots, shared flush barrier, retry obligations. | Autosave service tests; overlapping real IndexedDB flush. |
| R3 Export/read compatibility | ZIP64 packages with bounded chunks/assets; explicit legacy JSON export capped at 50 MiB. | Archive adapter tests; worker round trip above 50 MiB; existing package round trips. |
| R4 Concurrent writers | Web Locks, fenced leases, handoff, separate storage versions, CAS and conflict copies; desktop single instance. | Durable-storage tests; two real browser contexts and stale-write cases. |
| R5 Reversible restore | Validated staging, copies by default, verified rollback checkpoint, atomic replacement, separate index repair. | Durable-storage and import/restore controller tests; browser empty replacement and archive restoration. |
| R6 Failed command obligation | Command persistence preserves pre-command typing on failure; UI errors after commit do not undo output. | Command persistence/restoration tests; real failure and retry. |
| R7 Bounded expansion | Actual-byte/CRC/hash/path/duplicate limits, cancellation, failed staging cleanup and interrupted-job reclamation under Web Locks. | Archive adapter tests; forged-size and interrupted-staging browser cases. |
| R8 Local bridge | Exact loopback host/origin checks, random capability, POST, limits, deadlines, concurrency and disconnect cancellation. | Local-integration-security and OPUS adapter tests. |
| R9 Regex stalls | Worker, 200 ms debounce, two-second deadline, generation checks. | Filter/replacement tests; hostile regex with continued renderer timer progress. |
| R10 Worker stalls | Terminate/reset/reject on timeout; latest interactive lookup; bounded TM/QA batches. | Worker-recovery tests; renderer and large-project workflows. |
| R11 Journal and acknowledgement | Additive database v7-v8 migrations, atomic record/journal/generation commits, strict durability, shutdown/update editing pause and flush. | Durable-storage migration/replay tests; desktop close and lifecycle/update tests; browser checkpoint worker. |
| R12 Verified checkpoints | Deduplicated local checkpoints, external parent-linked generations, readback before pointer advance, retention, checkpoint-covered compaction. | Archive/durable-storage retention/corruption tests; real filesystem stream and shared-asset readback. |
| R13 Export completion | Await native/FSA close/readback; anchors remain “Download requested”; emergency live bilingual export. | Native/export/reminder tests; real FSA streaming completion and readback. |
| R14 Incremental operations | Cached folder metadata/direct updates, indexed collision checks, archive/hash/serialization workers, verified duplicate-DOCX migration. | Workspace browser tests; 1/10/100-project lookup benchmark; DOCX migration/round-trip tests. Legacy DOM parsing remains incomplete; see below. |
| R15 Database lifecycle | Reset failed opens; handle blocked upgrades, versionchange and closure without database deletion. | Failed-open retry test; migration and browser reopening coverage. |
| R16 Credentials | Main-process safeStorage references/provider operations, verified plaintext migration, unprotected-backend rejection, browser session default. | Local-integration-security and credential controller tests. Real OS backend qualification remains platform-specific. |

## Reviewable change groups

1. Regression baseline: original probes, reliability fixtures, browser runner repair, audit and security-sensitive lint expansion.
2. Persistence: `storage.js`, project/TM/termbase repositories, autosave/command services, ownership/lifecycle wiring and `desktop/persistence-close.cjs`.
3. Archives: archive adapter/record package/asset/worker modules, local build assets, pinned zip.js and license.
4. Recovery and delivery: reliability controls, workspace archive store, restore/export controllers, verified output services, save-state UI and documentation.
5. Security and responsiveness: OPUS bridge, protected credentials, regex worker and TM/QA worker recovery/batching.

These are working-tree groups, not separately landed commits. Schema and integration dependencies must be preserved when splitting them for review.

## Contracts and compatibility

- IndexedDB v7 adds journal, checkpoints, ownership leases, conflict copies, restore staging and binary assets; v8 adds shared resource catalogs and stable links. Targets/IDs survive upgrade. Storage versions are independent of editing revisions and portable schemas.
- Enqueue captures an immutable obligation and generation; flush resolves after covered commits. `commitMutation` validates storage versions and fencing inside the authoritative transaction. `withWorkspaceBarrier` coordinates replacement and other writers.
- Checkpoints run in a worker; small records use immutable inline JSON, large records/assets use bounded blobs/parts. Duplicate DOCX fields are removed incrementally only after exact reconstruction comparison in an unchanged verified checkpoint. Legacy reads/JSON exports reconstruct the original alias.
- Portable archive v1 uses `records-v1` chunks and SHA-256 asset descriptors. ZIP64 writes to native/filesystem destinations use backpressure and await destination closure before worker termination/readback.
- Workspace limits: 32 GiB expanded data, 100,000 entries, 16 MiB manifest, 4 MiB chunk target and 64 MiB structural record after asset separation. Source imports/reconstructed assets retain a 150 MiB bound; legacy JSON retains 50 MiB. Unsupported future schemas fail before mutation.
- Retain ten recent plus seven daily checkpoints, protecting the last two verified generations and unresolved rollback copies. Compact the journal only through a verified recovery base.
- `loopcat-v2/` preserves legacy sources. Automatic workspace-state archives use shared assets and require the whole folder; explicit portable backups include assets. Divergence stops pointer advancement and supports recovery as copies into a fresh folder.
- Credentials and operational metadata stay out of portable exports. Original source JSON and protected nested tag IDs are preserved.

## Recorded verification

Evidence is in `output/implementation-*.log` and `output/reliability-performance.json`; unavailable checks are not passes.

- Quality: **1,439 unit tests passed**, including the final superseded-close regression and the later resource/predictive-typing coverage; local verification also records passing expanded ESLint, configured formatting checks, TypeScript, stylelint and import boundaries.
- Browser: **All nine Windows Electron suites passed**: reliability, security policy, offline shell, smoke, regression, application workflow, workspace storage, package round trip and large project. The aggregate result is in `implementation-browser.log`; focused logs retain diagnosis and reruns.
- Packaged web: **build, artifact verification and smoke tests passed** for an isolated artifact under `.cache/reliability-web`. Results are recorded in the corresponding `implementation-web-*.log` files. Previously published downloads remain unchanged.
- Accessibility: automated light/dark checks passed. A temporary-profile cleanup warning did not affect assertions. Manual keyboard/assistive-technology qualification is separate.
- Static release: renderer, bundle contract, desktop wrapper and import checks passed. The legacy `verify-release` characterization still describes the pre-resource-model API/schema and must be reviewed and updated before release; it currently rejects the intentional September 11 resource changes. Provenance/signing/environment/evidence self-tests do not qualify or sign a newly packaged release.
- Audit: `implementation-audit-final.json` reports **zero advisories in every severity**. zip.js is pinned to **2.11.4**, with BSD-3-Clause license in `docs/zip-js-LICENSE.txt` and attribution in `NOTICE`.

### Reference performance

Windows x64, Intel Core i7-8550U at 1.80 GHz, eight logical CPUs, approximately 16 GiB RAM, Electron 43.3.0 / Chromium 150.0.7871.212. Recorded 2026-09-08; thirty synthetic editor input samples per size, acknowledgement checked against real IndexedDB commits.

| Segments | p95 input | p95 local save | Renderer heap sample | Verified checkpoint | Archive write |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 68.3 ms | 522.3 ms | 17.2 MB | 11.2 s | 1.69 s |
| 100,000 | 47.8 ms | 506.6 ms | 81.4 MB | 147.8 s | 15.4 s |

Routine folder saves made **five root lookups** at 1, 10 and 100 projects, taking 265, 258 and 142 ms. The 10,000-segment targets passed on this reference device. Synthetic events/frame callbacks are not physical keyboard latency; heap samples are not whole-process peak memory. There is no comparable pre-change measurement, so this is a current baseline, not a measured speedup claim.

```powershell
pnpm verify:quality
node scripts/verify-browser-runner.cjs
$env:LOOPCAT_BROWSER_TEST_FILTER = 'Performance'
node scripts/verify-browser-runner.cjs
# Release soak: not yet completed
$env:LOOPCAT_SOAK_MS = '28800000'
node scripts/verify-browser-runner.cjs
Remove-Item Env:LOOPCAT_SOAK_MS
Remove-Item Env:LOOPCAT_BROWSER_TEST_FILTER
```

## Remaining implementation and release work

The principal protection paths for all sixteen findings are implemented. The source is **not yet qualified for the complete production claims**:

- Existing DOCX/XML/HTML paths still construct DOMs on the renderer after bounded worker decompression. The milestone 4 parser migration remains incomplete for those paths; it must preserve existing reconstruction semantics.
- A 100,000-segment checkpoint takes about 148 seconds. Editing remains available, but sustained coalescing, growth, cancellation and whole-process peak memory require further profiling and the eight-hour soak. The recorded run has `soakMs: 0`.
- Real packaged close/update, forced renderer termination, quota/permission interruption, background-throttled ownership and fresh-profile original-document reconstruction require the full Windows/macOS/Linux and supported-browser fault matrix. Current unit/injected and Windows Electron tests cover subsets.
- Actual OS credential backends, signed installers, release provenance and manual accessibility remain qualification gates. Self-tests do not substitute for them.
- External shared assets and historical generation metadata are retained conservatively. Backup ZIP retention is implemented; complete shared-asset/history garbage collection and a folder-branch merge UI are not. Recovery as copies into a fresh folder is available.
- Unresolved rollback copies are intentionally retained. Verified abandoned restore previews may also retain staging space. Failed archive staging is removed; interrupted archive jobs are reclaimed on the next attempt where Web Locks are available.

See [Saving and recovering translation output](saving-and-recovery.md). Local commit, independently verified backup and confirmed delivery remain separate claims. Recovery cannot be guaranteed after deleting every independent copy or every possible hardware failure.
