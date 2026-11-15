# Resources upgrade verification — 12 November 2026

This record applies to the shared Resources implementation in the working checkout. It does not certify the previously published downloads. Tests use isolated profiles; they do not edit the translator's working database.

## Completed checks

| Area | Evidence |
| --- | --- |
| Unit regressions | 1,716 tests passed, including atomic resource edits, stale-write rejection, token-index consistency, shared TB concepts, duplicate identity remapping, durable drafts, partial operations, conflict-safe Undo, global query pagination, and import/export preservation. |
| Static checks | ESLint, Prettier, TypeScript, CSS lint, import boundaries, localization validation, and release-contract checks. |
| Whole application | The browser runner passed Reliability, Security, Offline, Smoke, Regression, App workflow, Workspace storage, Package roundtrip, and Large project suites, including resource changes propagating to linked projects. |
| Shared editor | Isolated Electron/Chromium workflow checks library opening, searches beyond page one, save-and-next, crash/reload draft recovery, bulk preview/cancel/apply/Undo, term status/metadata/new terms, and Back to Resources. The added navigation regression covers both entry 150→151 on page two and entry 199→200 across the page boundary. |
| Native Windows lifecycle | Actual development and packaged main-process/preload checks cover independent sandboxed windows, shared storage, repeated Open, dirty-close Cancel, operation after the library closes, library recreation on Back, and termbase Discard. |
| Browser engines | Firefox 159 and WebKit 27.2 each completed 13 TM/TB, draft-recovery, new-entry, page-two navigation, friendly-language CSV-import, accessibility, and narrow Arabic RTL checks with no page/console errors. |
| Accessibility | Automated WCAG A/AA scans and 520 CSS-pixel RTL layout checks. A selected-row contrast issue and the import file chooser's inherited hidden style were corrected during verification. |
| Localization | 3,148 source messages validated; new Resources labels are translated into Turkish, Spanish, Catalan, and Arabic. User resource names, source/target content, and imported column names remain literal. |

## Performance qualification

Reference system: Windows 11 (build 22631), Intel Core i7-8550U, eight logical processors, approximately 15.9 GiB RAM; Electron 43.3.0 / Chromium 150. Measurements use synthetic bilingual TM records in real IndexedDB and the production query worker, with 100 result rows returned per page.

The completed 100,000-entry workflow probe measured **3,850 ms cold**, **1 ms for a cached page**, and an **18 ms maximum main-thread timer gap**. A separate worker profile measured 3,451 ms cold, including 2,875 ms for IndexedDB reading and 533 ms for filtering/sorting, with a 155 ms exact search. Unrelated project writes no longer invalidate a resource's cache; generations are scoped to the affected resource.

The two-second cold-load target is **not met** on this reference system. The broader regression timeout in the test harness is not the product performance target. Windows WebKit also took roughly 54 seconds to import the 240-entry test fixture in one run; the editing workflows passed, but this is not evidence of fast Safari import performance.

The **1,000,000-entry stress test passed**: 39,126 ms cold, 2 ms cached page, 1,728 ms exact search for the final entry, and a 35 ms maximum main-thread timer gap. Returned pages remained bounded to 100 rows. The initial 20-minute fixture-construction deadline expired at 978,000 synthetic rows; the same isolated profile was resumed and the remaining 22,000 rows added before measuring. Fixture construction is excluded from these query timings. This demonstrates bounded, responsive query processing at that scale, not a fast first load.

## Release qualification still required

- Run the configured Windows/macOS/Linux release matrix and actual Safari checks. WebKit on Windows is not Safari on macOS.
- Complete human keyboard, screen-reader, 200% zoom, CJK IME, and native file-dialog checks across the target platforms. Automated accessibility scans alone do not establish full accessibility conformance.
- Resolve the cold-load target and investigate the Windows WebKit import timing before a performance qualification claim.

## Repeatable commands and artifacts

Run `pnpm verify:resources`, `pnpm verify:resource-native`, and `pnpm verify:resource-browsers`. For a million-entry probe, build the renderer and run `node scripts/verify-resource-workspace.cjs --million`. The native smoke script also accepts a packaged executable path. These checks are wired into the shared release workflow.

Local reports and screenshots are under `test-artifacts/resources-workspace/`, `test-artifacts/resources-workspace-ui/`, `test-artifacts/resources-workspace-million/`, `test-artifacts/resources-native/`, and `test-artifacts/resource-browsers/`. Keep these alongside the revision's release evidence rather than substituting them for signed-artifact and clean-machine checks.
