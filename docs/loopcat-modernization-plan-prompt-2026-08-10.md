# LoopCAT modernization — Plan mode prompt

> **Historical planning artifact.** This prompt is retained to explain the requirements and sequencing used for the 2026 modernization. It is not the current implementation backlog: all roadmap code packages described below now have implementations and automated regression evidence. Use [the current roadmap](../ROADMAP.md), [implementation status](modernization-implementation-status-2026-08-10.md), and [completion audit](modernization-completion-audit-2026-08-24.md) for present-day work.

Copy the prompt below into Plan mode from the LoopCAT repository root.

---

You are in **Plan mode** at the LoopCAT repository root. All paths below are relative to that root.

Your task is to produce a **thorough, ordered, dependency-aware implementation plan** for modernizing LoopCAT. Do not implement changes in this task. Inspect the repository and return a plan precise enough that later implementation tasks can execute it without rediscovering the architecture or making major product decisions.

## Primary source of truth

Read this review completely before planning:

`docs/loopcat-modern-software-review-2026-08-10.md`

Treat its findings, evidence, scorecard, P0–P3 backlog, constraints, and success measures as the requirements baseline. Inspect the current repository to validate exact files, dependencies, tests, build paths, and architectural seams. If the code has changed since the review, explicitly identify the difference and plan against the current code without silently discarding the review’s intent.

Use the nine audit screenshots as visual evidence:

`test-artifacts/modern-software-audit-2026-08-10`

The target product feeling is:

> **Quiet interface, powerful functionality.**

Aim for approximately **70% Linear/Apple restraint + 20% professional data-tool density + 10% distinctive LoopCAT personality**. Use this as a design principle, not as permission to copy another product.

## Required outcome

Create a roadmap and implementation plan that:

1. Starts with the P0 and P1 work, while showing how P2 and P3 depend on it.
2. Preserves LoopCAT’s mature capabilities and local-first trust model.
3. Breaks large changes into independently reviewable, reversible work packages.
4. Separates architectural preparation from visual redesign so they are not combined into one unreviewable rewrite.
5. Uses the vertical flow **Projects → project dashboard → translation editor** as the first end-to-end redesign slice.
6. Leaves the repository passing its existing release/browser suite at every merge boundary.
7. Avoids unrelated features, speculative framework migrations, and redesign for decoration’s sake.

## Non-negotiable constraints

- Preserve offline and local-first operation. Do not introduce mandatory accounts, cloud dependencies, default external telemetry, or hidden network transmission.
- Preserve all supported import/export formats, package round trips, translation memory, terminology, QA, project recovery, large-project behavior, localization, and desktop/web operation.
- Preserve AI safeguards: explicit provider choice, hosted-provider consent, inspectable suggestions, review states, attribution/provenance, cancellation, redaction, and protection of confirmed/locked segments.
- Every AI-applied change must ultimately be inspectable, editable, attributable, and reversible through the planned command/Undo model.
- Do not propose a framework rewrite merely to modernize the interface. Prefer incremental ES-module boundaries and checked JavaScript/JSDoc or incremental TypeScript unless repository evidence proves a larger migration is necessary.
- Do not mix the complete `app.js` extraction, full design-system replacement, and full editor redesign in one work package.
- Preserve user data and compatibility. Any storage/schema change needs versioning, migration tests, rollback or forward-recovery behavior, and package compatibility tests.
- Retain CSP, sanitization, permission restrictions, navigation restrictions, redaction, and other existing security strengths.
- Do not claim WCAG compliance based only on automated checks. Include keyboard, focus, zoom, contrast, reduced-motion, forced-colors, and screen-reader-oriented manual checks.
- Do not select a specific Electron target from memory. Verify the currently supported stable Electron majors using official Electron sources, then recommend the safest supported target and migration path for this repository.

## Baseline roadmap to preserve

### P0 — Release and immediate safety

- Supported Electron major and sandboxed renderer by default.
- Extract the browser workflow test harness and all test-only routes/mocks/fixtures from production artifacts.
- Fix immediate accessibility-state defects: toggle names and states, live save/operation status, dialog focus containment and restoration, command-palette focus behavior, and a clearly visible focus indicator meeting the appropriate non-text contrast requirement.

### P1 — Product and architecture foundations

- Quiet, semantic design system with one token source and restrained surfaces, radii, shadows, typography, spacing, motion, and state treatments.
- Editor-shell redesign with a collapsible project switcher, tabbed/resizable or contextual inspector, and substantially more space for source and target content.
- Domain command model with Undo/Redo, reversible AI application, transactional target edits, and soft deletion where appropriate.
- Incremental decomposition of `app.js` into explicit feature modules and controllers.
- Unified status/job/error model that distinguishes saving, background jobs, notices, warnings, and errors while explaining retry and preserved work.

### P2 — Power workflows and polish

- Separate contextual AI translation/review actions from provider and model administration.
- Command palette 2.0 with `Ctrl/Cmd+K`, fuzzy/grouped results, Arrow/Enter navigation, shortcuts, recent commands, and an accessible focus model.
- Proper system/light/dark themes built from semantic color roles, not inversion.
- Responsive and remembered workspace layout, including rail, inspector, density, and useful behavior from 100% through 200% zoom.
- Startup, locale/module loading, service-worker update lifecycle, and perceived-performance improvements.

### P3 — Completion and supportability

- Actionable empty states and a systematic human-readable copy/i18n pass.
- Privacy-respecting local diagnostics with redacted export and no default external transmission.

## Roadmap additions required by the review

Add these enabling packages to the roadmap rather than leaving them as unassigned recommendations. You may merge them into another package when dependencies and acceptance criteria remain explicit, but do not omit them:

1. **P0 — Characterization and enforcement baseline.** Before invasive refactors, record the existing critical behavior, audited screenshots, bundle composition, startup/typing/large-project performance, keyboard paths, and accessibility states. Add release assertions that prevent test/debug code from re-entering production. This is a safety prerequisite, not a new product feature.
2. **P1 — Static quality and focused-test foundation.** Introduce a minimally disruptive formatter/linter, import and promise checks, checked JavaScript/JSDoc or incremental type checking, Stylelint/token-literal enforcement, and focused unit tests for commands, reducers, validation, parsers, and status/error models. Keep the existing integration runner.
3. **P2 — DOM and template safety hardening.** Reduce distributed `innerHTML` use, define safe DOM/component construction and centralized exported-report templating, protect against raw untrusted interpolation, and evaluate Trusted Types compatibility without weakening existing functionality.

Fold these review recommendations into the most appropriate packages and make them visible in acceptance criteria:

- Make hardware acceleration the normal default after compatibility testing; retain an explicit troubleshooting fallback and surface GPU/sandbox status in diagnostics.
- Establish visual-regression checkpoints before changing the design system.
- Include filter presets and remembered recent commands/layout choices in the relevant power-user packages; do not create a broad new personalization subsystem.
- Include an actionable “update ready” lifecycle rather than relying on a passive cache-first reload notice.
- Keep dark-mode semantic roles in the P1 token foundation even if full dark-mode delivery remains P2.

Do not add other roadmap items unless repository inspection reveals a genuine blocker or missing dependency. For every addition, merge, split, reprioritization, or deferral, explain why it is necessary.

## Recommended dependency sequence

Use this as a starting hypothesis, then refine it from repository evidence:

1. **Baseline and guardrails:** characterize current behavior; capture visual/accessibility/performance baselines; add production-bundle guards.
2. **Release safety:** supported Electron, sandbox defaults, Electron fuses where appropriate, GPU/fallback policy, production/test separation, immediate accessibility defects.
3. **Development foundations:** minimal build/module strategy, lint/format/type/style checks, focused unit-test foundation, initial `app.js` seams.
4. **UI foundations:** semantic tokens, component primitives, typography and spacing, interaction/focus/motion states, light and dark roles.
5. **First vertical slice:** Projects → dashboard → editor shell, with migration behind small reversible boundaries and screenshot comparison at every audited viewport.
6. **Trust architecture:** domain commands, transaction boundaries, Undo/Redo, soft deletion, status/jobs/errors, data migration and recovery tests.
7. **Power workflows:** contextual AI, palette 2.0, inspector behavior, filter presets, remembered layout and recent actions.
8. **Performance and completion:** lazy locales/modules, update lifecycle, full dark mode, DOM safety, diagnostics, copy and empty states.

Identify which packages can run in parallel and which must remain sequential. Prefer thin vertical slices over prolonged infrastructure-only work, but never redesign behavior before its characterization coverage exists.

## Required analysis before writing the plan

Inspect at minimum:

- `package.json` and all build/release scripts.
- `app.js`, `ai.js`, `index.html`, `styles.css`, and `liquid-glass/styles.css`.
- Electron main/preload/security configuration.
- Service worker, locale loading, workers, storage, import/export, project package, TM/QA, recovery, and AI provider boundaries.
- Existing browser, smoke, regression, release, localization, package round-trip, storage, and large-project test entry points.
- Current repository status and any user changes; do not overwrite or plan around unrelated modifications.

Map the current responsibilities and propose exact extraction seams. Do not merely say “split `app.js`”; specify a safe order, interfaces between modules, state ownership, event boundaries, and how each extraction is characterized before and after.

## Work-package specification

For **every** work package, provide all of the following:

1. **ID, priority, title, and intended user outcome.**
2. **Rationale and evidence** from the review or repository.
3. **Dependencies** and work packages it unlocks.
4. **Affected modules/files**, using exact repository paths where currently knowable; distinguish new files from modified files.
5. **Architecture and state ownership**, including public interfaces/events and prohibited coupling.
6. **Migration strategy** expressed as small, reviewable steps that keep the application usable.
7. **Data/storage/package compatibility impact**, including versioning and recovery when applicable.
8. **Characterization tests** that lock current behavior before change.
9. **New automated tests and quality gates**, stating the correct test layer rather than relying only on end-to-end tests.
10. **Accessibility checks**, including semantic structure, accessible name/state/value, full keyboard path, focus order/return, contrast, 200% zoom, reduced motion, forced colors, and screen-reader spot checks where relevant.
11. **Screenshot checkpoints** at **1440×900, 1366×768, and 1024×768**. Name the exact screens/states to capture. For theme work, include light and dark. For editor work, include normal, Focus mode, inspector open/closed, recovery/status, AI suggestion, empty, loading, and error states as applicable.
12. **Performance checks** and explicit budgets where relevant.
13. **Security/privacy checks** where relevant, especially Electron, imported content, DOM templates, AI, diagnostics, and update behavior.
14. **Rollback strategy** that identifies the safe reversion boundary, feature flag or compatibility path when needed, and how user data remains valid.
15. **Completion criteria** stated as observable pass/fail conditions.
16. **Risk and effort** using relative labels such as low/medium/high and S/M/L/XL; do not invent calendar dates without team-capacity evidence.
17. **Suggested implementation slices** or commits, each small enough to review and verify independently.

## Mandatory verification gates

The plan must keep or improve the current green baseline. Include when each command runs and what new checks are added:

- `pnpm verify:release`
- `pnpm verify:desktop-wrapper`
- `pnpm verify:ai-sidebar-ux`
- `pnpm i18n:validate`
- `pnpm verify:web-artifact`
- `pnpm verify:web-smoke`
- `pnpm verify:browser-runner`

Require the full suite at phase gates and the smallest relevant checks during individual slices. Add focused tests before or alongside refactors, never after all refactoring is complete.

Also include planned gates for:

- Production bundle contains no test harness, debug route, mock, fixture, or test-only global.
- Supported Electron major, sandbox enabled in release builds, and security settings verified.
- Clean-machine desktop startup with GPU acceleration and the explicit fallback path.
- No regression in offline shell, package round trip, workspace storage, recovery, localization, AI consent, or large-project behavior.
- Bundle/startup/typing/scroll measurements compared with the captured baseline.
- Automated accessibility checks plus the manual keyboard/zoom/focus matrix.
- Visual-regression review at the required viewports.

## Product acceptance targets

Carry these targets into the appropriate packages:

- A new user can identify how to create, import, open, and begin translating within five seconds on each relevant screen.
- At 1366×768, source and target together use at least 70% of available workspace width with the inspector closed and at least 55% with it open.
- Confirm-and-next is one action; apply-AI-and-next is one action plus a reversible Undo.
- Normal editor mode approaches the calmness of current Focus mode without hiding essential professional context.
- Persistent UI uses no backdrop blur and no more than one subtle elevation level; radii, typography, spacing, colors, and motion come from semantic tokens.
- Keyboard users can complete the audited flows; focus never disappears; 200% zoom remains usable.
- Reference-device targets remain: warm start under 1 second, cold start under 2 seconds, typing response under 50 ms, and no persistent scroll jank on the large-project fixture. Mark these as targets requiring baseline validation, not already-proven facts.
- No external AI request or diagnostic transmission occurs without the existing explicit user controls.
- Every AI change exposes origin, model/provider where applicable, affected scope, review/diff, and Undo.

## Required plan output

Return the plan in this order:

1. **Executive planning summary** — recommended strategy, major dependencies, principal risks, and what must not change.
2. **Verified current-state map** — architecture, build/release, state/storage, desktop security, UI/CSS, AI, tests, and known baseline metrics, with exact paths.
3. **Roadmap change log** — show every retained, added, merged, split, reprioritized, or deferred item and justify the decision. Explicitly state if no further items are needed.
4. **Dependency graph and critical path** — text or Mermaid, showing blockers and parallelizable packages.
5. **Prioritized roadmap table** — P0 through P3 with work-package IDs, dependencies, user value, risk, effort, and phase gate.
6. **Detailed work packages** — use every field in the work-package specification above.
7. **Cross-package verification matrix** — rows for tests/checkpoints and columns for the packages or phase gates that require them.
8. **Migration and release strategy** — sequencing, feature flags only where useful, compatibility, data safety, packaging, and rollback.
9. **Definition of done for the complete modernization** — measurable product, accessibility, performance, security, maintainability, and AI-trust outcomes.
10. **Open decisions** — only decisions that materially affect scope or architecture. For each, recommend a default and explain the tradeoff; do not use routine implementation details as blockers.
11. **Recommended first implementation task** — a narrowly scoped, low-risk package that establishes safety and unlocks the next work, with exact entry/exit criteria.

The final plan should be concrete enough to guide implementation but should not contain code patches. Do not optimize for brevity: optimize for sequencing clarity, preservation of mature behavior, and verifiable completion.

---
