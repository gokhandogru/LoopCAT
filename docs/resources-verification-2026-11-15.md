# Resources follow-up verification — 15 November 2026

This supplements the [12 November evidence](resources-verification-2026-11-12.md). It applies to the working checkout, not published installers. All runtime checks used disposable test profiles.

## Changes

- Center Resources button labels and disclosure controls with consistent alignment and line height. Preserve hidden controls and left-aligned entry links.
- Keep the library Actions cell in table layout so row contents share a vertical center. Center the resource count alongside the TM/TB tabs.
- Guard asynchronous editor refreshes against replacing a newly selected or dirty entry. Avoid replacing unchanged forms during focus-triggered refreshes.
- Make the browser draft-recovery test wait for the selected form and staged draft, and exercise ordinary keyboard entry. Firefox's immediate `fill`/flush sequence intermittently failed; diagnostic and keyboard runs passed. This does not establish a general Firefox input defect.
- Add `--performance-gate` to the 100,000-entry workflow. It fails when cold time is not below 2,000 ms. Reports distinguish this target from the broader regression timeout.

## Completed locally

- Windows Electron/Chromium Resources workflows, including global search, draft recovery, paging, bulk Undo, TM/TB edits and accessibility checks.
- Windows development native-window lifecycle: 18 checks passed. No new packaged release was produced.
- Firefox 159 on Windows: 13 checks passed using keyboard draft entry; no page/console errors or automated WCAG A/AA violations.
- Playwright WebKit 27.2 on Windows: 13 checks passed; no page/console errors or automated WCAG A/AA violations. The 240-entry fixture still takes roughly a minute to import on this engine.
- Eleven targeted query/session unit tests; CSS lint, targeted ESLint and formatting checks; production renderer build.
- Visual inspection of the captured Resources library confirmed aligned row contents and button labels.

## Performance remains unqualified

Reference hardware remains the Intel Core i7-8550U, eight logical CPUs, approximately 15.9 GiB RAM, Windows build 22631, Electron 43.3.0 / Chromium 150.

The initial production-worker run measured **5,230 ms cold**, **1 ms warm paging**, **156 ms exact search**, and a **25 ms maximum main-thread timer gap**, for 100,000 synthetic bilingual entries. Cold means a new query worker with no in-memory resource cache; it is not an operating-system disk-cache flush or application-startup measurement.

The final strict run measured **3,375 ms cold**, **1 ms warm paging**, **138 ms exact search**, and a **17 ms maximum main-thread timer gap**. It correctly exited with failure because `coldTargetMet` was false. The difference between runs is not attributed to a query optimization: the production read algorithm was unchanged.

Exploratory reads did not reach the target: `getAllRecords` measured 5,478 ms overall; a fixture-only primary-key range measured 3,546 ms. The latter relies on synthetic contiguous IDs and is not a valid production resource-isolation strategy. Neither experiment was adopted. Production querying still uses the resource-ID index and preserves whole-resource locale-aware sorting and filtering.

The two-second cold-load improvement is **unfinished**. A broader regression pass is not performance qualification. Next work must reduce the full resource read cost while retaining resource isolation, global sorting, generation consistency and conflict protection; it must be measured on the production path without prewarming the worker.

Run the strict reference check with:

```sh
node scripts/build-renderer.cjs
node scripts/verify-resource-workspace.cjs --performance-gate
```

Its report is `test-artifacts/resources-workspace/report.json`; it records the measured cold time, target and target outcome even when the gate fails. Browser evidence is retained in `test-artifacts/resource-browsers/firefox-keyboard-2026-11-15.json` and `webkit-and-initial-firefox-2026-11-15.json` (the latter also retains the initial failing Firefox run).

## Platforms still unverified

Actual macOS, Linux and Safari could not run here: this is a Windows host without a configured Linux environment, accessible Mac/Linux hosts, or working GitHub runner authentication. The user explicitly requested continuing only with the current environment. Windows WebKit is not Safari verification. The shared source changes apply to all builds, but native-platform and actual Safari release qualification remain open.
