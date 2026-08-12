# LoopCAT modernization baseline

**Baseline commit:** `0a2d5343d6c2a2ef859a16bc0674e128e7803d1a`  
**Captured:** 10 August 2026  
**Purpose:** Safety evidence for the incremental modernization. These measurements characterize the current application; performance targets are not claimed as achieved until controlled reference-device profiling is complete.

## Environment

- Host verification runtime: bundled Node.js 24.14.0.
- Package manager invoked by the baseline run: pnpm 11.16.0; repository contract remains pnpm 11.0.7 until the runtime package is updated deliberately.
- Application runtime: Electron 31.7.7.
- Checkout: `main`, matching `origin/main` at the baseline commit.
- User changes preserved: `docs/loopcat-modern-software-review-2026-08-10.md` and `docs/loopcat-modernization-plan-prompt-2026-08-10.md` were untracked and untouched.
- All generated profiles use isolated temporary user-data directories and the synthetic fixture at `tests/fixtures/modernization/baseline-backup.json`.

## Required verification baseline

| Command | Result | Duration |
| --- | --- | ---: |
| `pnpm verify:release` | Pass | 0.77s |
| `pnpm verify:desktop-wrapper` | Pass | 0.67s |
| `pnpm verify:ai-sidebar-ux` | Pass | 10.74s |
| `pnpm i18n:validate` | Pass; 1,816 source messages and 126 explicit keys | 0.72s |
| `pnpm verify:web-artifact` | Pass | 0.85s |
| `pnpm verify:web-smoke` | Pass | 4.79s |
| `pnpm verify:browser-runner` | Pass; all eight browser suites | 160.33s |

Raw logs and the machine-readable timing summary were written outside the repository to the current user's temporary directory under `loopcat-modernization-baseline-2026-08-10`.

## Reproducible visual and interaction capture

Run:

```powershell
pnpm verify:baseline
```

For retained local artifacts rather than a disposable verification run:

```powershell
node scripts/capture-modernization-baseline.cjs --output test-artifacts/modernization-baseline-current
```

The capture uses a deterministic project and produces 78 screenshots covering projects empty/populated, project dashboard, translation editor, import-validation error and focus recovery, resource dashboards and Trash, recovery/workspace state, new-project and focused utility dialogs, contextual AI, review/quality inspector states, responsive and compact editor checkpoints, Focus mode, command palette, and light/dark themes at 1440×900, 1366×768, and 1024×768. `baseline.json` records runtime versions, asset composition, startup sample, input-dispatch sample, scroll-frame sample, keyboard paths, and known accessibility exceptions.

## Contract baseline

- Local IndexedDB schema: 5.
- Project-package schema written by the current application: 5.
- Accepted project-package range: 3–5.
- Full-backup schema written by the current application: 5.
- Workspace manifest version: 1.
- The known `app.js` workflow-test surface remains explicitly counted by `scripts/bundle-contract.json`. `pnpm verify:bundle-contract` fails if that surface grows or if a new test/debug global appears. P0-02 must remove the allowlist and switch the contract to `strict-production`.

## Known baseline exceptions

- The runtime is Electron 31.7.7 and Windows production currently disables the Chromium sandbox.
- Hardware acceleration is disabled.
- Save/operation status is not a live region.
- Command-palette keyboard navigation and centralized focus return are incomplete.
- AI disclosure naming can become stale after expansion.
- The general focus outline does not yet meet the intended non-text contrast target.
- Controlled clean-machine cold/warm startup and large-project frame tracing have not yet been performed; the roadmap budgets remain targets pending that evidence.
