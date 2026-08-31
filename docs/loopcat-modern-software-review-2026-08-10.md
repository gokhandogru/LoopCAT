# LoopCAT modern software review

> **Historical baseline review.** This document intentionally preserves the evidence and recommendations as they stood on 10 August 2026. The Electron/runtime, sandbox/GPU policy, production/test separation, accessibility states, design system, themes, editor layout, Undo/Redo and Trash model, command palette, modular application architecture, status model, diagnostics, and lazy-loading work described here as gaps have since been implemented. See [the current capability guide](loopcat-capabilities.md), [implementation status](modernization-implementation-status-2026-08-10.md), and [completion audit](modernization-completion-audit-2026-08-24.md). Remaining work is primarily manual/platform evidence, reference-device profiling, complex-format depth, and the optional 750 KB stretch-target decision.

**Date:** 10 August 2026  
**Repository:** LoopCAT repository root\
**Branch reviewed:** `main`  
**Purpose:** Evidence-backed input for a later implementation plan. This is a review, not an implementation.

## Executive verdict

LoopCAT is already unusually strong in functional depth, local-first data safety, format handling, recoverability, AI governance, and automated regression coverage. It is not a fragile prototype. Its weakest areas are the visual strategy, interaction density, lack of undo, incomplete accessibility details, absence of dark mode, an out-of-support desktop runtime, and a UI architecture that now makes safe refinement expensive.

Against the 24 modern-software criteria in the brief, LoopCAT scores **75/120 (3.1/5)**. The product foundations are stronger than that score suggests; the score is held down by a few large gaps rather than broad mediocrity.

The right product direction is:

> **Keep LoopCAT's professional depth and trust model, but move the main editor toward the calmness already visible in Focus mode.**

The recommended visual mix is genuinely close to the proposed **70% Linear/Apple restraint + 20% professional data-tool density + 10% LoopCAT personality**, but the current Liquid Glass layer is closer to **40% restraint + 35% decorative glass/card treatment + 20% data-tool density + 5% brand**. The Loopbird and teal/cream palette are enough personality; the interface does not also need blur, large floating shells, broad shadows, and nested rounded cards everywhere.

### What should be protected

- Local-first persistence, autosave retry, backups, validation, and rollback behavior.
- Focus mode as the clearest expression of a “quiet interface, powerful functionality.”
- Semantic segment table, segment-specific editor labels, keyboard navigation, and command registry.
- Virtualized segment rendering, background worker use, indexed TM lookup, and offline shell.
- AI provenance, review states, cancellation, source-sharing controls, and suggestion-before-apply behavior.
- Translation-industry brand, terminology, and professional capability depth.
- The extensive browser, release, storage, security, format, and large-project test suite.

### What should change first

1. Put the desktop release on a supported Electron major and restore sandboxing as the production default.
2. Extract the 5,000-line browser workflow test harness from the production `app.js`, then split the UI coordinator into feature modules.
3. Replace the decorative “glass everywhere” treatment with a flatter, token-driven system and make the editor the dominant surface.
4. Add a real undo model for target edits, AI applications, term/resource changes, and local deletions.
5. Fix accessibility state announcements, dialog focus management, focus-ring contrast, and toggle naming; add automated accessibility tests.
6. Ship a properly recalibrated dark theme.

## Scope and evidence

The review combined source inspection, live browser inspection, viewport checks, static metrics, and the repository's verification commands.

### Live surfaces inspected

- Projects workspace at 1440×900.
- Project dashboard at 1440×900.
- Translation editor at 1440×900.
- New-project dialog.
- AI Command Centre.
- Editor at 1024×768 and 1366×768.
- Focus mode.
- Command palette and keyboard invocation.

The live audit used the current service-worker shell after explicitly reloading the update. The first load served the previous cached visual shell and displayed “Offline app shell updated. Reload to use the latest files.” Those stale captures were rejected and replaced.

### Verification results

All commands below passed on the reviewed checkout:

- `pnpm verify:release`
- `pnpm verify:desktop-wrapper`
- `pnpm verify:ai-sidebar-ux`
- `pnpm i18n:validate` — 1,816 source messages and 126 explicit key references validated.
- `pnpm verify:web-artifact`
- `pnpm verify:web-smoke`
- `pnpm verify:browser-runner` — security policy, offline shell, smoke, regression, real app workflow, workspace storage, package round trip, and large-project suites all passed.

### Important code metrics

| Surface | Current size / signal | Why it matters |
| --- | ---: | --- |
| `app.js` | 17,944 lines; 522 functions; 183 event listeners | UI orchestration, state, DOM rendering, commands, workflows, and a large test harness share one file. |
| `runAppWorkflowTest()` | lines 12,671–17,922, roughly 5,250 lines | About 29% of `app.js` is test code copied into web and desktop production artifacts. |
| `ai.js` | 5,115 lines; 202 functions | AI provider breadth is significant enough to warrant feature-level modularization. |
| `index.html` | 1,149 lines | The complete app shell, most forms, panels, and dialogs are eager-loaded. |
| CSS | 3,255 base lines + 1,406 Liquid Glass lines | The edition layer overrides a large base cascade and duplicates structural behavior. |
| CSS literals | 268 hex-color uses, 99 radius rules, 47 shadow rules | Tokens exist, but much of the visual system is still hard-coded. |
| Synchronous core assets | about 2.62 MB unminified | Every locale, AI code, format code, UI test code, and main coordinator is loaded up front. |
| Typography | 53 declarations at 12px, 13 at 11px, 2 at 10.5px | The interface relies heavily on small text instead of a deliberate compact type scale. |

## Audited flow

### Step 1 — Projects workspace — **Mixed**

![Projects workspace](../test-artifacts/modern-software-audit-2026-08-10/01-projects.png)

The first screen is understandable, the primary action is clear, and project search/filtering is present. The large empty canvas, floating outer shells, nested project card, broad shadows, and 28px-class radii spend substantial visual weight without improving the task. A flatter workspace with a restrained sidebar and denser project rows would feel more professional and scale better.

### Step 2 — Project dashboard — **Mixed**

![Project dashboard](../test-artifacts/modern-software-audit-2026-08-10/02-project-dashboard.png)

Recovery status is excellent and project health is legible. The page gives nearly equal weight to four headline metrics and eleven analysis cells, so the most actionable information—open work, next file, delivery risk—does not lead. The recovery banner is trustworthy but too dominant on every editor visit.

### Step 3 — Translation editor — **Mixed**

![Translation editor](../test-artifacts/modern-software-audit-2026-08-10/03-translation-editor.png)

The CAT grid, TM, terminology, status, and review signals are all useful and professionally relevant. At the same time, persistent project rail, recovery banner, project metadata, seven toolbar actions/menus, progress, nine search/filter controls, grid, and multi-panel inspector compete within one viewport. The editor is the product's core value but receives less than half of the horizontal working area at common laptop sizes.

### Step 4 — New-project dialog — **Good**

![New project dialog](../test-artifacts/modern-software-audit-2026-08-10/04-new-project-dialog.png)

This is one of the best-composed flows: focus lands correctly, frequent language pairs reduce work, source/target defaults are useful, and optional storage/resources are disclosed progressively. The backdrop blur and large radius are stylistically louder than necessary, but the interaction model is sound.

### Step 5 — AI Command Centre — **Mixed**

![AI Command Centre](../test-artifacts/modern-software-audit-2026-08-10/05-ai-command-centre.png)

AI is embedded in the professional workflow and starts with local providers, which is excellent. The panel combines provider setup, endpoint administration, model management, pretranslation, prompt testing, review, repair, draft editing, terminology, context, outputs, and a legacy OpenAI helper. This is progressive at the section level but still a configuration console rather than a contextual editing assistant.

### Step 6 — 1024×768 editor — **Functional but inefficient**

![Editor at 1024×768](../test-artifacts/modern-software-audit-2026-08-10/06-editor-1024x768.png)

There is no horizontal page overflow, and the grid remains usable. Below 1180px, the inspector is moved beneath the editor. TM, terminology, QA, comments, history, and AI therefore become vertically remote from the active segment. The project rail still consumes 210px even after a file is open.

### Step 7 — 1366×768 editor — **Mixed**

![Editor at 1366×768](../test-artifacts/modern-software-audit-2026-08-10/07-editor-1366x768.png)

This common laptop viewport retains all three columns, but the central editor becomes narrow while the project rail is mostly empty. A collapsible rail and a tabbed inspector would materially improve source/target width without hiding capability.

### Step 8 — Focus mode — **Strong**

![Focus mode](../test-artifacts/modern-software-audit-2026-08-10/08-focus-mode-1366x768.png)

Focus mode is LoopCAT's clearest design success. It is calm, readable, fast, and puts translation first. It should become the reference for the default editor shell, with compact contextual access to TM/terms/QA instead of forcing users to choose between “everything” and “almost nothing.”

### Step 9 — Command palette — **Promising but incomplete**

![Command palette](../test-artifacts/modern-software-audit-2026-08-10/09-command-palette.png)

The palette is a valuable advanced-user layer and is available through Ctrl/Cmd+Shift+P. It is hidden inside Segment tools, has no displayed shortcut hints or grouping, and code inspection found click/filter behavior but no ArrowUp/ArrowDown/Enter command navigation. The long flat list mixes frequent actions, exports, reports, and many AI actions.

## Scorecard against every criterion

| # | Criterion | Score | Current assessment | Primary improvement |
| ---: | --- | ---: | --- | --- |
| 1 | Visual restraint | 2/5 | Functional surfaces are wrapped in large radii, blur, shadows, and nested cards. | Flatten the main shell and reserve elevation for menus/dialogs. |
| 2 | Strong hierarchy | 3/5 | Clear projects/dialog hierarchy; editor and dashboard distribute emphasis too evenly. | Make “next translation action” and delivery risk dominant. |
| 3 | Excellent typography | 3/5 | Strong font family and headings, but many 10.5–12px labels and hard-coded sizes. | Establish a compact but accessible type scale. |
| 4 | Generous whitespace | 3/5 | Spacious outer shells but working width is sacrificed; editor controls remain crowded. | Spend space on text editing, not chrome. |
| 5 | Small coherent design system | 2/5 | Tokens exist, but base and edition styles duplicate and override one another. | One semantic token layer and a small component set. |
| 6 | Progressive disclosure | 4/5 | Details/menus, collapsible panels, optional setup, and Focus mode are strong. | Consolidate inspector sections and simplify AI setup. |
| 7 | Low interaction cost | 3/5 | Defaults, next-open action, shortcuts, and batch operations help; filters/toolbars are busy. | Primary-action model, smart defaults, remembered views, better palette. |
| 8 | Fast perceived performance | 4/5 | Local-first, optimistic editing, virtualization, workers, indexes, and caching are strong. | Remove eager/test payload, fix update UX, profile desktop blur with GPU enabled. |
| 9 | Purposeful micro-interactions | 4/5 | 160ms feedback, active states, progress, and reduced-motion handling are good. | Reduce shadow/transform use and add clear non-blocking Undo feedback. |
| 10 | Contextual interfaces | 3/5 | Active-segment sidebar and commands are relevant, but too much stays permanently visible. | Tabbed contextual inspector and selection/segment action bar. |
| 11 | Minimal modal interruption | 2/5 | Native dialogs are used for creation/help; native confirm/alert is also used broadly. | Inline validation, job/status panel, and Undo for reversible local actions. |
| 12 | Excellent empty states | 3/5 | File empty state explains the next step; project/resource states are mostly plain text. | Add one direct action and a short explanation to every key empty state. |
| 13 | Human-readable language | 3/5 | Most copy is action-led; “browser profile,” “Main TM / TB,” endpoints, and provider jargon leak through. | Layer technical details behind “Advanced” and use translator-first copy. |
| 14 | Visible system status | 4/5 | Saving, retry, recovery, import, storage, and AI progress are visible. | Separate global save, background jobs, notices, and errors; announce them accessibly. |
| 15 | Undo over confirmation | 1/5 | Revision history and rollback exist internally, but users cannot Undo; deletions say they cannot be undone. | Command history, target Undo/Redo, soft-delete, and Undo snackbar. |
| 16 | Excellent error recovery | 5/5 | Autosave retry, atomic restore guards, rollback, preservation messages, and failure tests are exceptional. | Present this strength through a consistent, calmer error/status model. |
| 17 | Responsive layouts | 3/5 | Breakpoints prevent overflow, but 1024px moves essential context far below and 1366px wastes rail space. | Collapsible navigation, overlay/tabbed inspector, density modes, zoom testing. |
| 18 | Accessibility by default | 3/5 | Semantic table/labels, focus styling, reduced motion/transparency, contrast and forced-colors support exist. | Fix focus contrast, live regions, focus traps/return, toggle labels; add automated and manual audits. |
| 19 | Dark mode done properly | 1/5 | Only `color-scheme: light` is implemented. | Semantic dark tokens, recalibrated surfaces/elevation, OS sync + explicit setting. |
| 20 | Personalisation without overload | 3/5 | Creator, recent language pairs, locale, project settings, and AI settings are remembered. | Remember inspector tabs, density, rail state, filters, and last workspace unobtrusively. |
| 21 | AI integrated into workflows | 4/5 | Translation, review, repair, polish, alternatives, terminology, and reports are direct actions. | Move provider administration away from everyday editing; surface context actions at the segment. |
| 22 | User control over AI | 5/5 | Suggestions are inspectable and attributable; application is explicit; pretranslation is review-marked and cancellable. | Add side-by-side diff, clearer provenance chips, and one-click revert after applying. |
| 23 | Command-driven interaction | 3/5 | A broad command registry and palette exist. | Use Ctrl/Cmd+K, grouping, fuzzy search, keyboard selection, shortcuts, and recent commands. |
| 24 | Subtle personality | 4/5 | Loopbird, teal/cream, and translation-specific details are distinctive. | Let the brand carry personality; reduce generic glass effects. |

## Detailed recommendations by criterion

### 1. Visual restraint — 2/5

**Evidence.** The Liquid Glass system defines 24–28px large radii, two multi-layer shadow tokens, 24px blur, translucent panels, and hover elevation (`liquid-glass/styles.css:1–39`, `91–135`, `174–186`). The current project, dashboard, editor, side panels, cards, inputs, and dialogs all use the treatment.

**Problem.** The appearance is contemporary but trend-led. Repetition of rounded floating containers makes the interface feel softer and less precise than a professional CAT tool. Nested borders and shadows also reduce the distinction between application shell, navigation, work surface, and transient overlays.

**Recommendation.** Create a “Quiet LoopCAT” theme as the only primary theme:

- 8px control radius, 10–12px cards, 14–16px dialogs; no 22–28px application shells.
- One canvas, one work surface, one subtle separator color.
- No backdrop blur on persistent panels; reserve blur/elevation for dialogs and menus only.
- No shadow on ordinary inputs, rows, cards, and metric cells.
- Use the Loopbird, teal accent, active row, status chips, and typography as the brand language.

**Acceptance signal.** A screenshot of the default editor should look flatter and calmer than the current Focus mode plus inspector, while keeping all core actions within one interaction.

### 2. Strong hierarchy — 3/5

**Evidence.** Projects and the new-project dialog have clear headings and actions. The project dashboard gives the same card treatment to progress, file counts, words, repetitions, TM leverage, open segments, and AI metrics. The editor places recovery, metadata, toolbar, progress, filters, rows, and inspector into one visual tier.

**Recommendation.** Define three hierarchy levels:

1. **Primary task:** translate/review the active segment and move to the next required item.
2. **Context:** TM, terminology, QA, review, AI suggestion, and file identity.
3. **Administration:** project settings, resources, provider setup, storage, recovery, exports.

Make the dashboard answer three questions first: “What remains?”, “What is risky?”, and “What should I open next?” Move secondary analysis into a collapsible “More analysis” region.

### 3. Excellent typography — 3/5

**Evidence.** Inter/system UI is a good choice, headings have controlled negative tracking, and source/target text is readable. CSS contains 53 explicit 12px declarations, 13 at 11px, and two at 10.5px. `Inter` is named but not bundled, so most installations will use the platform fallback.

**Recommendation.** Replace scattered sizes with semantic tokens:

- `--text-editor: 15–16px / 1.5`
- `--text-body: 14px / 1.45`
- `--text-compact: 13px / 1.35`
- `--text-caption: 12px / 1.35`, used sparingly
- A 20/24/30px heading scale with no additional decorative weights.

Bundle a properly licensed variable font only if consistent cross-platform metrics matter; otherwise explicitly design and test around system UI metrics. Let users scale editor text independently of chrome.

### 4. Generous whitespace — 3/5

**Evidence.** The projects workspace contains abundant empty canvas, while the editor at 1366px gives 210px to a mostly empty project rail and 320px to the inspector. The central source/target work area becomes the most compressed region.

**Recommendation.** Treat working width as the scarce resource:

- Collapse the project rail automatically after a file opens; reveal it with a compact project switcher.
- Allow inspector widths of 280–420px with drag resize and remember the choice.
- Use 12–16px internal spacing, not 18–24px outer floating margins around every shell.
- Keep generous vertical spacing in onboarding/settings; use professional density in the editor.

### 5. Small coherent design system — 2/5

**Evidence.** `styles.css` defines 16 root variables but still contains 198 hex colors. `liquid-glass/styles.css` defines 49 variables yet adds 70 hex colors and 92 `rgb/rgba` values. Across both files there are 99 radius declarations and 47 shadow declarations. Responsive and Focus-mode structure is repeated across the two layers.

**Recommendation.** Consolidate into one semantic system:

- Foundations: canvas, surface, elevated surface, text, muted text, line, focus, accent, success, warning, danger.
- Spacing: 4/8/12/16/24/32.
- Radius: 6/10/14.
- Elevation: none/subtle/dialog.
- Components: button, icon button, field, select, menu, status chip, banner, panel, dialog, row, empty state, toast.

Add a local component gallery/test page for all states, but exclude it from release artifacts. Do not preserve `styles.css` plus an edition override as two competing systems.

### 6. Progressive disclosure — 4/5

**Evidence.** Native `details` menus, collapsed utility panels, optional project storage/resources, the staged AI centre, and Focus mode are strong. Advanced provider and batch settings are already nested.

**Recommendation.** Extend the same discipline:

- Replace the long inspector stack with tabs: **Matches**, **Quality**, **Review**, **AI**, **Info**.
- Show only filters currently affecting results; move regex, case, review state, and AI state into a filter popover with an active-count badge.
- Split AI into **Use AI** and **Configure providers**. Provider setup belongs in project/settings, not the everyday segment inspector.
- Turn Focus mode from an all-or-nothing view into the basis of the default editor, with contextual drawers.

### 7. Low interaction cost — 3/5

**Strengths.** Frequent language pairs, “Next unconfirmed,” direct Confirm, Alt+Arrow navigation, Ctrl/Cmd+Shift+F Focus mode, batch operations, and command registry reduce repeated work.

**Gaps.** A user must scan multiple toolbar groups and persistent filters. The command palette is hidden inside Segment tools. Inspector state and filter choices are not visibly remembered as preferences.

**Recommendation.** Make Confirm-and-next the default completion path, offer configurable “Confirm moves to next,” expose the palette with Ctrl/Cmd+K, and create smart presets such as **Translate**, **Review**, **QA fixes**, and **AI review** that select relevant filters/inspector tabs without a settings screen.

### 8. Fast perceived performance — 4/5

**Strengths.** Segment windowing is implemented in `app.js:5322–5361`; scroll work is scheduled with `requestAnimationFrame` (`app.js:12172–12177`); TM/QA can run in a worker (`worker-client.js`); TM token indexes and chunked imports exist; target edits update before the debounced save completes; the offline shell is pre-cached.

**Gaps.** About 2.62 MB of unminified synchronous assets load at startup, including all locales, all AI/provider code, format code, and the workflow test harness. `app.disableHardwareAcceleration()` is unconditional (`desktop/main.cjs:660–662`) while the visual layer relies heavily on blur and shadows. The service worker is cache-first and requires a manual reload to adopt a new shell.

**Recommendation.** Set explicit budgets:

- Reference-laptop warm start to interactive under 1 second; cold start under 2 seconds.
- Target typing response under 50ms and no long task over 100ms during navigation/scroll.
- Move the test harness out of production immediately.
- Load only the active locale; lazy-load AI, reports, and uncommon format parsers.
- Minify production assets and keep source maps outside public artifacts if appropriate.
- Enable hardware acceleration by default; offer a diagnostic/compatibility fallback only for affected systems.
- Show a clear **Update ready — Restart/Reload** action rather than reusing the save-status pill.

### 9. Purposeful micro-interactions — 4/5

**Evidence.** Hover/focus/active transitions are short (160ms), button presses move by 1px, progress/status is visible, and reduced-motion/transparency preferences are honored.

**Recommendation.** Keep the duration and restraint but remove routine hover elevation. Add only three new interaction patterns: Undo snackbar, inspector tab transition, and background-job progress. Motion should never be required to understand a state change.

### 10. Contextual interfaces — 3/5

**Evidence.** TM and terminology update for the active segment; review/QA/AI data is segment-aware. Yet entire tools remain permanently stacked in the inspector, even when empty or unrelated to the current task.

**Recommendation.** Use a contextual inspector with a stable tab strip and badge counts. Add a compact active-segment action row for Insert match, Apply term, Run QA on segment, Ask AI, Comment, and History. When text is selected, show only selection-relevant commands such as concordance or copy.

### 11. Minimal modal interruption — 2/5

**Evidence.** Native dialogs are appropriate for new project, About, help, and TM pretranslation. However, local deletes, overwrites, duplicate imports, package replacement, external AI sends, and incomplete exports use native `window.confirm`; some failures use `window.alert`.

**Recommendation.** Keep modal confirmation only for irreversible external sends, destructive restore/replace, and ambiguous delivery exports. Replace reversible local deletion with soft-delete + Undo. Put validation errors next to their controls, and use a non-blocking status/job centre for background failures.

### 12. Excellent empty states — 3/5

**Evidence.** Empty files tell users to import a DOCX or other format. The main Projects empty state says “No projects yet. Create one to begin,” while the rail says only “No projects yet.” Term and QA empty states are plain text.

**Recommendation.** Each major empty state should contain one sentence, one primary action, and optionally one sample/import action:

- Projects: **Create project** / **Import project package**.
- Project files: **Import files** plus supported-format hint.
- TM/terms: **Add resource** / **Import TMX/TBX/CSV**.
- QA: **Run project QA**.
- AI: **Configure local provider** or “AI is optional; continue translating without it.”

### 13. Human-readable language — 3/5

**Strengths.** “Protect your work,” “Download recovery copy,” “Next unconfirmed,” and most AI action labels are direct and understandable.

**Gaps.** “browser profile,” “Main TM,” “1 TM / 1 TB,” “Base URL,” endpoint paths, provider presets, and encoding terminology appear close to everyday flows. “AI Command Centre” implies administration, which is accurate for the current panel but not ideal for the editing experience.

**Recommendation.** Use translator-first labels in the main workflow: **Translation memory**, **Termbase**, **Local AI provider**, **Connection address**. Keep abbreviations and endpoints in advanced settings. Perform a copy inventory and assign stable semantic i18n keys to critical actions/errors rather than relying mainly on auto-generated message identifiers.

### 14. Visible system status — 4/5

**Evidence.** The top status pill communicates saving, saved, retry, import phases, cancellation, connection, and some errors. Recovery banners and AI progress are also visible. Autosave failure explicitly says it is retrying.

**Gap.** The single save-status area is overloaded with global persistence, background work, validation, provider connection, and transient messages. The top status span has no `role="status"` or `aria-live`, so important changes may not be announced.

**Recommendation.** Separate:

- **Document state:** Saved / Saving / Save failed.
- **Background jobs:** imports, QA, AI, indexing, export preparation.
- **Notices:** update ready, storage pressure, recovery reminder.
- **Errors:** persistent, actionable, and dismissible.

Use `role="status"`/polite live regions for ordinary state and `role="alert"` only for blocking failures.

### 15. Undo rather than confirmation — 1/5

**Evidence.** Target revision history and robust internal rollback exist, but there is no user-facing Undo/Redo. Project, file, TM entry, term, and resource deletions explicitly say they cannot be undone.

**Recommendation.** Introduce a domain command layer:

- Undo/Redo target editing and applied AI suggestions using existing history.
- Soft-delete files/projects/resources into local Trash with a retention window.
- Undo snackbar for term/TM deletion, status/review changes, replace, split/merge, and AI apply.
- Preserve confirmation for restore/replace operations that invalidate broad state.

This command layer will also reduce mutation/rollback duplication in `app.js` and make automated tests clearer.

### 16. Excellent error recovery — 5/5

This is a standout strength. The test suite covers queued autosave retry, pending-save flush, rollback after split/merge/confirm/apply failures, non-destructive package validation, dirty workspace preservation, provider cancellation, storage failures, and redacted error output.

**Recommendation.** Do not redesign this away. Normalize the user-facing presentation around three questions: **What failed? What was preserved? What can I do next?** Every error object should carry those fields plus retry/inspect actions where applicable.

### 17. Responsive layouts — 3/5

**Evidence.** At 1180px the layout changes to a 210px rail plus editor and moves the inspector below (`liquid-glass/styles.css:1085–1124`). At 780px it becomes one column. There was no document-level horizontal overflow at 1366×768.

**Recommendation.** Define desktop-first modes rather than only stacking:

- ≥1440: optional project rail + editor + resizable inspector.
- 1100–1439: collapsed project switcher + editor + 300px inspector.
- 800–1099: editor + overlay inspector drawer.
- <800: single-column review/translation view with sticky segment actions.

Test 100%, 125%, 150%, and 200% zoom, not only viewport widths. Keep source/target columns usable down to the declared minimum.

### 18. Accessibility by default — 3/5

**Confirmed strengths.** Native headings, labels, buttons, selects, a semantic table, segment-specific accessible names, `aria-expanded`, reduced motion, reduced transparency, increased contrast, and forced colors are present. Text token contrast is strong: primary text on canvas is roughly 11:1 and muted text on surface roughly 5.17:1.

**Likely issues.** The general focus outline is translucent teal at 34% opacity, roughly 1.54:1 against white, below the usual 3:1 non-text contrast expectation when it is the only focus cue. The command palette is a custom dialog overlay without visible focus-trap/return logic or Arrow/Enter command navigation. Expanding the AI panel changes `aria-expanded` to `true` but the accessible name remains “Expand AI settings”; this was reproduced live. Save status is not a live region. Full keyboard order, screen-reader output, reflow, and target sizing were not exhaustively tested.

**Recommendation.** Add an accessibility gate:

- Axe (or equivalent) on projects, editor, every dialog, and major error/empty states.
- Keyboard tests for tab order, focus trap/return, Escape, menus, palette arrows/Enter, and no focus loss during virtualized scrolling.
- 3:1 focus indicator and non-text state contrast; 4.5:1 normal text.
- Live-region rules and accessible names that always match state.
- Manual NVDA + Windows and VoiceOver + macOS smoke checks before public releases.

This review does not claim WCAG compliance.

### 19. Dark mode done properly — 1/5

**Evidence.** The root explicitly declares `color-scheme: light`; no `prefers-color-scheme: dark` or dark token set exists.

**Recommendation.** Build dark mode from semantic roles, not inversion:

- Recalculate canvas/surface/elevated surface, border, editor row, input, selection, status chips, warning/error states, focus, and shadows.
- Keep target editor fields visually quieter than source/row selection.
- Support System / Light / Dark and remember the choice.
- Verify both normal and high-contrast variants, charts/reports, dialogs, native controls, and exported HTML where applicable.

### 20. Personalisation without overload — 3/5

**Evidence.** Recent language pairs are derived from projects (`app.js:2642–2655`), creator identity is remembered, UI locale is persisted, and project/AI settings remain local.

**Recommendation.** Remember behavior, not dozens of settings:

- Last project/file and active segment.
- Inspector tab and width.
- Collapsed project rail.
- Editor density and editor text size.
- Last meaningful filter preset per project.
- “Confirm moves next” and preferred next-item logic.

Use an unobtrusive **Reset workspace layout** action rather than a large preference screen.

### 21. AI integrated into workflows — 4/5

**Evidence.** AI actions cover pretranslation, QA/review, tag repair, polish, adaptation, alternatives, terminology, extraction, and briefs. They operate on active, visible, or project scopes and are represented in filters/reports.

**Recommendation.** Separate two products currently sharing one panel:

- **AI for translators:** Suggest alternative, Improve target, Check segment, Repair tags, Apply terms, Explain risk.
- **AI administration:** provider, endpoint, key, model, connectivity, prompt testing, batch configuration.

Place translator actions beside the target/active segment and route provider setup to project settings. Keep batch AI in a background-job drawer with previewed scope and cancellable progress.

### 22. User control over AI — 5/5

**Evidence.** Most commands store suggestions instead of overwriting; applying a suggestion creates revision history; pretranslation marks rows draft/Needs review/AI initiated; confirmed/locked rows are preserved; hosted sends require confirmation; provider/model/status/timestamp metadata is retained while sensitive traces are stripped.

**Recommendation.** Add the last mile:

- Side-by-side or inline diff before Apply.
- Clear provider/model/time/provenance chip in the suggestion card.
- **Apply and next** plus **Undo apply**.
- Explanation of which context was sent, with a compact disclosure rather than raw prompt text.
- “AI-generated” origin should survive confirmation and export metadata where appropriate.

### 23. Command-driven interaction — 3/5

**Evidence.** Ctrl/Cmd+Shift+P opens a palette containing core, QA, report, and AI actions (`app.js:2932–2964`, `5899–5905`). Ctrl/Cmd/Alt+K is reserved for concordance.

**Recommendation.** Use Ctrl/Cmd+K for a combined command/search surface and move concordance to a scoped shortcut or a palette mode. Add:

- Fuzzy matching and synonyms.
- Arrow/Enter navigation and active descendant semantics.
- Sections: Recent, Segment, Review/QA, Project, Export, AI.
- Visible shortcuts and disabled reasons.
- Recent commands and project/file switching.
- A compact palette trigger in the top bar instead of burying it in Segment tools.

### 24. Subtle personality — 4/5

The Loopbird, translation-specific language, local-first stance, teal/cream palette, and “Translation, in flow” idea form a distinctive product. The bird mark is more memorable than generic AI gradients.

**Recommendation.** Make personality editorial, not ornamental: use the bird in onboarding/empty/recovery moments, keep the teal accent, and remove most glass effects. A precise icon set and one warm illustration language would be enough.

## Cross-cutting engineering review

### A. Production UI architecture — **High priority**

`app.js` is a mutable, imperative coordinator containing state, rendering, commands, storage orchestration, imports/exports, errors, AI UI, event binding, and a large browser test. The README already acknowledges it as a planned maintainability refactor.

Split by feature without forcing a framework rewrite:

```text
src/
  app-shell/
  projects/
  editor/
    segment-grid/
    command-registry/
    inspector/
    history/
  resources/
  quality/
  ai/
  import-export/
  recovery/
  ui/
    components/
    status/
    dialogs/
    tokens/
  platform/
    browser/
    electron/
tests/
```

Use ES modules and a small build step. Incremental TypeScript or `// @ts-check` + JSDoc is preferable to an all-at-once rewrite. The goal is explicit interfaces, not framework fashion.

### B. Remove test code from production — **Immediate**

`runAppWorkflowTest()` begins at `app.js:12671` and runs only when the hash is `#app-workflow-test`, but `scripts/build-web.cjs:18–55` and `package.json:75–107` copy the same `app.js` verbatim into public artifacts. The test mutates `window.confirm`, `window.alert`, `window.fetch`, downloads, and application state when activated.

Move it to `tests/app-workflow.js`, load it only from the test runner, and add release assertions that production `app.js` contains no test fixtures, mocks, test-only flags, or `#app-workflow-test` route.

### C. State and undo model — **High priority**

The global `state` object and direct mutations are manageable only because the test suite is unusually deep. A command/reducer layer would enable Undo, clearer rollback, smaller tests, and background jobs without committing to a full reactive framework.

Define domain commands such as `EditTarget`, `ConfirmSegment`, `ApplyAiSuggestion`, `ChangeReviewState`, `SplitSegment`, `DeleteFile`, and `ReplaceTargets`. Each command should return its inverse or a recovery token and persist through one transaction boundary.

### D. CSS and component architecture — **High priority**

Retire the two-layer base/edition cascade. Use semantic design tokens, component classes, and explicit responsive layout modules. Add visual regression snapshots for the nine audited states in both light and dark themes at 1440×900, 1366×768, and 1024×768.

### E. Desktop security and runtime — **Release blocker**

`package.json` pins Electron 31.7.7. Electron's own release page marks 31.x end-of-support, while its support policy covers only the latest three stable majors. Upgrade to a supported major and establish a recurring cadence. See [Electron 31.7.7 release status](https://releases.electronjs.org/release/v31.7.7) and [Electron support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

The renderer uses good controls—context isolation, Node disabled, `webSecurity: true`, insecure content disabled, webviews disabled, navigation/window restrictions, custom protocol, permission allowlist, and CSP. However, Windows defaults to Chromium `--no-sandbox` and `sandbox: false` (`desktop/main.cjs:92–99`, `664–665`, `1231–1247`). Electron recommends sandboxing all renderers and warns against processing untrusted content unsandboxed; LoopCAT processes imported documents, so this is a production risk. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security#4-enable-process-sandboxing).

Make sandboxed rendering the default on all platforms. If a managed-machine compatibility escape hatch must remain, make it explicit, visible in diagnostics, and excluded from production release evidence. Review Electron fuses as part of the upgrade.

### F. Desktop graphics policy — **High priority for perceived performance**

Hardware acceleration is disabled unconditionally. That may reduce stability on specific machines but is a poor default for a UI using persistent blur, translucent surfaces, and shadows. Enable GPU acceleration normally, collect clean-machine evidence, and provide an opt-in “Disable hardware acceleration” troubleshooting setting or startup flag.

### G. Loading and update architecture — **Medium/high priority**

The offline strategy is robust but cache-first. Improve the lifecycle:

- Small immutable hashed assets or a generated manifest.
- Background update fetch and a dedicated update-ready notice.
- Only active locale and core editor code at startup.
- Lazy modules for AI configuration, complex format parsers, reports, and resource administration.
- No layout shift when modules appear; use small inline pending states rather than decorative skeletons where operations are local and fast.

### H. Tooling and quality gates — **High priority**

No ESLint, Prettier/Biome, TypeScript/jsconfig, Stylelint, unit-test framework, or automated accessibility dependency is configured. The custom test system is powerful but cannot replace static checks and focused unit tests.

Add:

- ESLint with security, import, promise, and accessibility-relevant rules.
- Prettier or Biome; Stylelint for tokens and forbidden literals.
- Type checking (`tsc --noEmit` or checked JSDoc initially).
- Focused unit tests for commands, reducers, validation, parsers, and status/error models.
- Existing Electron browser runner for full integration.
- Accessibility automation and screenshot/visual regression.
- Production bundle checks: size, no test harness, no debug routes, supported Electron, sandbox enabled.

### I. DOM safety — **Medium priority**

The CSP, sanitization, redaction, and regression tests are strong. `app.js` still performs 45 direct `innerHTML` assignments, and report generation uses large HTML templates. Many values are escaped, but the safety burden is distributed.

Prefer DOM construction for interface components, centralized safe-template helpers for exported reports, Trusted Types where compatible, and tests that enforce no raw untrusted interpolation.

### J. Privacy-respecting observability — **Medium priority**

Because LoopCAT is local-first, avoid default external telemetry. Add a local diagnostics screen containing startup duration, largest project, IndexedDB usage, worker availability, last failed operation, renderer sandbox/GPU status, and exportable redacted diagnostics. Offer opt-in crash reporting only if the user explicitly enables it.

## Prioritized implementation backlog

| Priority | Work package | Expected outcome | Dependencies / acceptance |
| --- | --- | --- | --- |
| P0 | Supported Electron + sandboxed renderer | Removes known runtime/security release blockers. | All desktop verification and clean-machine tests pass with sandbox on; fallback is explicit only. |
| P0 | Extract test harness from production | Smaller, safer startup payload and clearer architecture. | Production artifacts reject test route, mocks, fixtures, and test-only flags. |
| P0 | Accessibility state fixes | Removes immediate keyboard/screen-reader defects. | Toggle names match state; status live regions work; dialogs trap/return focus; focus cue ≥3:1. |
| P1 | Quiet design system | Consistent, restrained LoopCAT visual language. | Single token source; component gallery; no persistent blur; defined light/dark roles. |
| P1 | Editor shell redesign | Translation receives the majority of working space. | Collapsible project switcher; tabbed/resizable inspector; core grid usable at 1024 and 1366. |
| P1 | Domain command + Undo model | Reversible, trustworthy editing with less confirmation. | Undo/Redo target and AI apply; soft-delete; commands transaction-tested. |
| P1 | Split `app.js` into feature modules | Faster, safer delivery of future improvements. | No feature controller exceeds an agreed size; imports/interfaces explicit; behavior tests still pass. |
| P1 | Status/job/error system | Users always know what happened and what was preserved. | Separate save/jobs/notices/errors; operation objects carry retry and preservation details. |
| P2 | AI workflow separation | AI feels like a translator tool, not a provider console. | Segment actions contextual; provider administration in settings; batch jobs preview/cancel/report scope. |
| P2 | Command palette 2.0 | Expert navigation without more permanent UI. | Ctrl/Cmd+K, fuzzy/grouped results, arrow/Enter, shortcuts, recent commands, accessible focus model. |
| P2 | Dark mode | High-quality use in low-light professional environments. | System/light/dark; audited semantic states; visual snapshots; no simple inversion. |
| P2 | Responsive/personalized workspace | Natural behavior across laptop/zoom sizes. | Rail/inspector/density remembered; 100–200% zoom tests; overlay inspector below 1100px. |
| P2 | Update and startup optimization | Faster perceived launch and trustworthy upgrades. | Active-locale/lazy modules; update-ready action; reference-device performance budgets. |
| P3 | Empty-state and copy pass | Onboarding and uncommon states become self-explanatory. | Every major empty/error state has one next action; critical copy uses semantic i18n keys. |
| P3 | Local diagnostics | Better support without weakening local-first privacy. | Redacted export; no external transmission by default. |

## Suggested delivery sequence for Plan mode

1. **Foundation and release safety:** Electron, sandbox, GPU policy, production/test separation, static tooling.
2. **UI foundations:** one token system, component primitives, typography, accessibility semantics, light/dark roles.
3. **Editor architecture:** modular controllers, quiet shell, project switcher, tabbed inspector, responsive behavior.
4. **Trust interactions:** command model, Undo/Redo, soft-delete, status/jobs/errors.
5. **Power workflows:** palette 2.0, remembered layout, contextual AI, filter presets.
6. **Performance and polish:** lazy modules/locales, update lifecycle, visual regression, diagnostics, copy/empty states.

Avoid mixing the architecture extraction and full visual redesign in one unreviewable change. First create module boundaries and characterization tests, then redesign one vertical slice—Projects → dashboard → editor—using screenshot checkpoints at the audited viewports.

## Recommended success measures

- **Task clarity:** a new user can identify how to create/import/open/translate within five seconds per screen.
- **Editor space:** at 1366×768, source and target together receive at least 70% of available workspace width when the inspector is closed and at least 55% when open.
- **Interaction cost:** confirm-and-next is one action; apply-AI-and-next is one action plus a reversible Undo.
- **Accessibility:** no serious automated issues; all audited flows complete by keyboard; focus never disappears; 200% zoom is usable.
- **Performance:** reference-device warm start <1s, cold start <2s, typing response <50ms, no persistent scroll jank on the large-project fixture.
- **Maintainability:** no test code in production; checked modules; token-literal lint; feature-level tests; supported Electron major.
- **Visual restraint:** persistent UI uses no backdrop blur and at most one subtle elevation level; radii and type come only from semantic tokens.
- **AI trust:** every AI change shows origin, diff, scope, and Undo; no external send occurs without the existing explicit controls.

## Evidence limits

- The live audit used the existing smoke project and did not create/delete user projects or call real AI providers.
- The review did not perform a complete screen-reader audit, full keyboard traversal of every panel, color sampling of every state, or clean-machine native packaging on Windows/macOS/Linux.
- Screenshots cannot establish full WCAG compliance, real-world large-project perception, or the quality of every error state.
- Runtime performance budgets above are recommended targets; no controlled reference-device profiling was performed.
- No implementation files were changed as part of this review.

## Plan-mode starter

Use this report as the source of truth and ask Plan mode to produce an ordered, dependency-aware plan that starts with P0 and P1. Require each work package to name affected modules, migration strategy, characterization tests, accessibility checks, screenshot checkpoints at 1440×900 / 1366×768 / 1024×768, rollback strategy, and completion criteria. Preserve LoopCAT's local-first behavior and passing browser/release suite throughout; do not add unrelated features during the modernization.
