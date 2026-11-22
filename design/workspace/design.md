# LoopCAT workspace design

**Design proposal · 21 November 2026**

[Open the interactive prototype](index.html) · [Read the implementation plan](implementation.md) · [See production measurements and verification](verification.md)

A translator returning to a document should be able to answer three questions at a glance. Which file am I editing? Which segment needs my attention? Has my work been saved locally? Give those answers the strongest hierarchy. Bring matches, terminology, QA and optional AI alongside the text when they can help someone make a translation decision.

The companion walkthrough uses an English-to-Turkish *Visitor guide.docx* with eight sample segments, three initially confirmed. Its sample data illustrates the proposed layout and selected interactions. The behavior specified below also covers production workflows that require the real editor, storage, file handlers, Exchange or an AI provider.

**Try the central design decision.** On segment 04, compare the source with the 96% memory match. The match omits “old.” Insert it, add *Eski* to the Turkish target and confirm. On segment 05, select **Number mismatch** to inspect the 20/15 discrepancy, then correct it in place. Open Statistics to see the updated count, or return to the editor and switch to Focus mode. The match percentage is illustrative. Changes live in memory for this preview session.

## What informed the revision

The current editor already has five inspector tabs, keyboard commands, Focus mode, adjustable density and an inspector that becomes an overlay. A previous Windows review measured source and target together at 61.91% of a 1366px workspace with the inspector open. A later verification measured 139.8 CSS pixels above the wide grid. Those are historical reference measurements. The proposed rail spends some horizontal space to give that vertical space back to the document. Whether users see more usable text, especially with long targets, needs a paired test. [September workflow review](../../docs/ux-review-2026-09-14.md) · [October workspace verification](../../docs/workspace-ui-verification-20261012.md)

Today the global header includes Projects, Resources, Exchange, Trash and Workspace. Import, Export and segment commands live in the editor, while detailed backup controls are nested in Workspace. The proposed shell makes movement between project files, editing and statistics predictable. Moving Trash into Workspace gains space for daily work but could make recovery harder to find. Preserve an Undo action after removal and a searchable Trash command. [Application shell](../../index.html) · [Keyboard shortcuts](../../docs/keyboard-shortcuts.md)

Current CAT editors connect evidence and QA findings to the selected segment. Adopt that interaction convention, using LoopCAT’s own terminology and styling. Keep the target visible while inspecting a fuzzy match, and let a reviewer return to the same queue position after a correction. Display TM similarity with its resource and score type. An AI suggestion gets its own provenance. [memoQ editor side panel](https://docs.memoq.com/current/en/webNext-help/memoQeditor-sidepanel.html) · [Phrase CAT pane](https://support.phrase.com/hc/en-us/articles/5709683926812-CAT-Pane-TMS) · [Phrase QA pane](https://support.phrase.com/hc/en-us/articles/5709694857372-Quality-Assurance-Pane-QA-TMS)

The 2026 European Language Industry Survey describes two common post-editing situations. Clients supply pretranslations, and translators invoke MT or AI themselves. Design for both entry points and make a draft easy to compare, edit or reject. The survey is self-reported and predominantly European. The following profiles are working assumptions grounded in LoopCAT’s documented audience and capabilities, pending observation of people using the redesign. [ELIS 2026, pp. 32–33](https://elis-survey.org/wp-content/uploads/2026/03/ELIS-2026-Report.pdf#page=33) · [LoopCAT Beginner Guide](../../docs/beginner-guide/index.html)

## People and their next decisions

| Person and task | What gets priority | Tradeoff to validate |
| --- | --- | --- |
| A freelance translator resumes a multilingual job offline | Recent project, active file, language pair, editable target, local save status and Confirm. Compact rows and existing shortcuts support repetitive work. | A persistent rail costs reading width. Focus mode should reclaim it in one action and restore the previous layout. |
| A post-editor assesses someone else’s draft | Keep source, current target, suggestion origin and differing words in one reading sequence. Applying a suggestion and confirming a segment remain separate decisions. | Detailed provenance takes space. Show origin immediately and expand model, resource and revision details on demand. |
| A reviewer prepares a handoff | Start from the next flagged segment, show why it was flagged, preserve the review queue and export the Quality Passport or bilingual review file. | A risk ranking can hide low-ranked issues. Keep the full issue list and explicit severity, scope and filters. |
| A terminologist maintains shared local resources | See language pair, write/reference role and linked projects before making changes. Keep draft, saved and recovered entry states distinct in the resource editor. | Comfortable reading competes with bulk maintenance. Retain compact rows, keyboard entry and explicit selection across pages. |
| A teacher or student runs a translation exercise | Enter a frozen Exchange lesson directly, compare candidates blind and record reasoning before reveal. Offer the Beginner Guide at the point of first import. | Teaching explanations help first use but slow repeated work. Put guidance in empty states and Help, and keep recurring controls short. |

## Visual and interaction system

- **Frame.** A narrow pine rail carries icons and visible destination names. A small Loopbird anchors it at the top. Keep the existing right-facing mark in both writing directions. Group workspace-wide destinations and active-project destinations by spacing. With no project open, project-only destinations explain how to open one. [Brand guidelines](../../docs/brand-guidelines.md)
- **Reading surface.** Use warm ivory for the workspace and white for the bilingual grid. Source and target share a baseline and comparable text size. The segment number and status occupy narrow, predictable columns. Long segments grow vertically, preserving full text. Give the active target a teal outline with a subtle mint fill. Use a separate visible focus ring for keyboard movement.
- **Hierarchy.** Use a locally available sans serif with system and script fallbacks. Reserve the largest type for screen and file titles. Keep counts aligned with tabular numerals. Use monospace for literal placeholders, code and optional raw markup. Keep sparse separators in the grid, gentle rounding on controls and limited shadows on floating surfaces.
- **Color and density.** Teal identifies selection and the main action. Amber, danger red and success green accompany named states and distinctive icons. In dark mode use deep neutral surfaces, lifted editor rows and a lighter teal focus treatment. Preserve System, Light, Dark, Balanced and Compact preferences. Density adjusts padding before type size. Use equal visual weight for both languages.
- **Context.** The editor header identifies the file, language pair and confirmed count. Keep search and its active filters close to the grid. Surface Confirm on the active row or a stable action strip. Overflow actions remain keyboard reachable via menus and the existing command palette. Restore the active row, search, selection and scroll when returning from another view.
- **Small windows and zoom.** Collapse the rail into a labeled navigation control. Let target and source stack under explicit language labels when columns become unreadable. The inspector becomes a dismissible panel with a named close action and focus return. Keep confirmed count and a route out of Focus mode visible. Resize or dock panels with a keyboard-operable alternative to dragging.

## Palette and proportions

The palette narrows the brand colors to a small set of functional roles. Pine establishes orientation, the quiet canvas separates work surfaces, and the strongest teal button belongs to the current decision.

| Role | Light | Dark | Example |
| --- | --- | --- | --- |
| Navigation | `#133E39` | `#0B221E` | Persistent destination rail |
| Canvas / surface | `#F7F7F2` / `#FFFFFF` | `#15211E` / `#1C2C27` | File header and bilingual grid |
| Primary / secondary text | `#183932` / `#536860` | `#EDF4EB` / `#B5C6BB` | Translation text and provenance |
| Action / button text | `#086959` / `#FFFFFF` | `#94E5C9` / `#10392D` | Confirm and primary task actions |
| Selection / keyboard focus | `#F0F8F4` / `#007562` | `#253D34` / `#9FF2D4` | Active row and three-pixel focus outline |
| Warning / warning surface | `#855011` / `#FCF1D9` | `#F6C674` / `#46391F` | Number mismatch, with an icon and label |

Use 15px bilingual text at the reference scale with 1.55 line spacing. Let rows grow with the translation. Balanced rows start at 59px and Compact at 43px. Controls use a 6px radius and panels 12px. At widths below 1000px the sample inspector opens as a dialog. Below 651px the rail collapses and the two language fields stack. These are prototype breakpoints to recheck with production toolbars and translated labels. [Prototype styles](studio.css)

## Where each function lives

| Surface | Proposed layout and retained paths |
| --- | --- |
| Projects and setup | Use a recent-project list with pair, progress and last activity. Retain list/card preferences and search. One New project action opens a name-and-language form with optional storage, project metadata and resources behind disclosure. Empty Projects offers New project and package import. |
| Files and source changes | One row per document shows filename, format, language pair and confirmed/total. Open returns to the document. Row actions include rename, source update, translation history/restore and Trash. Import shows file, phase and validation results. Give multilingual Excel column mapping, encoding choices and batch file selection a preview step. |
| Editor and language tools | Keep target typing, Confirm, next unconfirmed and protected-token insertion within reach. Scope, case, regex and replace sit alongside search. Scope bulk replacements explicitly. Use an active-row action menu for copy source, split/merge, undo/redo and TM commands. Quick Insert, term capture, edit term and Concordance retain keyboard entry and restore the caret. |
| Matches | Group TM suggestions and terminology by type and provenance. Show a fuzzy source difference, stored target and resource name near Insert. Termbase status reads Preferred, Admitted or Forbidden. Preserve read-only Exchange overlays, prediction settings, concordance search and entry deep links. |
| Quality, Review and Info | Quality has QA checks, risk reasons, queue navigation and a route to the quality profile and Passport. Review has structured comments, notes and decisions. Info carries project context and revision evidence. Keep recoverable historical targets comparable before restoring. Point every row-level finding to its segment. |
| AI | Show tools for the active segment first. Put provider setup, models, connection test, prompt test and OPUS-CAT help behind Settings. Group polish, adaptation, alternatives, terminology, tag repair and AI QA by task. Give batch and brief actions explicit scope and reviewable outcomes. |
| Statistics and delivery | Put project/file/selection scope next to the heading. Keep baseline and current statistics labeled, with words, segments, match bands, repeats and applicable denominators. Export from the editor or file context. Group reconstructed target, XLIFF, target text, bilingual review, project/anonymized report and Quality Passport by recipient or purpose. Preflight points directly to any blocker. |
| Resources library and editors | Share search, filters, sorting and row actions across TM and termbase. Retain resource settings, project links and main/reference roles. Open launches the dedicated editor in a desktop window, browser tab or same-tab fallback. Preserve library query, selection and scroll on return. The entry editor reuses the same split-list/form pattern for drafts, duplicates, conflict comparison, bulk preview, import mapping and export scope. [Resource workflows](../../docs/resources-workspaces.md) |
| Exchange | Use the established pack library, examples, creation and catalog functions. Each pack detail shows publisher, version, license, verification and project activation. Keep install, activate, compare update, disable and uninstall distinct. Use the same preview/action pattern for client kits, private author drafts, Lab responses, research export, and exact AI-workflow destination approvals. [Exchange workflows](../../docs/loopcat-exchange.md) |
| Workspace and recovery | Place appearance, UI language/import/export, predictive typing and layout reset together. Put storage health, connected folder, package movement, backup generations, checkpoints, conflict exports and emergency bilingual export under Storage and recovery. Keep Trash, read-only window ownership/request editing, update/reload, repair, local diagnostics, Guide and About searchable and reachable. [Saving and recovery](../../docs/saving-and-recovery.md) |
| Dialogs and secondary windows | A short local decision uses a named dialog with scope and a verb-labeled action. Apply to bulk TM update/pretranslation, import settings, provider consent, resource links and restore. Longer reference views such as Concordance can stay open while inspecting segments. Keep desktop resource windows independently titled with resource and editing state. Return keyboard focus to the invoking control or its successor on close. |

## States that must remain intelligible

| Situation | What the interface tells the user |
| --- | --- |
| Typing, confirming and reviewing | Show Empty, Draft or Confirmed for translation progress. Needs review, Reviewed and Blocked are separate review decisions. Locked is an edit constraint. The file count always names its denominator, for example **3 of 8 confirmed**. Filtered counts identify the selected scope. |
| Saving and recovery | Quiet local status progresses from Saving to Saved locally after storage acknowledges the edit. Folder copy pending and External backup unavailable are separate conditions. A local failure stays visible with Retry and applicable rescue actions. Label recovered drafts before committing them. |
| QA and readiness | A missing protected token identifies the file, segment and token, with a path to fix it. Distinguish a native export blocker, an advisory warning and an Exchange check that was not evaluated. A row can be confirmed and still have a separate review or delivery issue. |
| AI, data location and trust | Name the provider, model, actual execution destination and data fields before sending. A local endpoint can route to a hosted model. Show the configured source-sharing confirmation at that boundary. Keep inserted content editable and unconfirmed. Pretranslation may populate eligible targets, so preview scope, overwrite policy and excluded rows. |
| Background and batch work | Show the operation, scope and actual completed/skipped/failed counts. Offer cancellation where supported, reporting completed work. Use a persistent inline recovery action for a failure that requires intervention. Leave routine autosave announcements quiet while typing. |
| Empty, filtered or read-only | Tailor the action to the cause. An empty file list offers Import. Zero search results offers Clear filters. A read-only project names the editing-window constraint and provides Request editing. Selection-dependent commands explain their prerequisites. |
| Destructive or external actions | Distinguish reversible Move to Trash from permanent Empty Trash. Name the affected object and count. Show applicable Undo, cancel or export paths. Preview redacted diagnostics and research export fields before a file leaves the workspace. |

## Inclusive reading and verification

Target WCAG 2.2 AA. Check normal text at 4.5:1 and large text at 3:1, plus applicable controls and state indicators at 3:1 against adjacent colors. Check keyboard-only completion, visible focus that remains clear of sticky content, pointer targets of at least 24 × 24 CSS pixels or permitted exceptions, and reflow at 320 CSS pixels. At 200% text zoom, place critical actions in reading order and allow longer labels to wrap. Test light, dark, forced colors and reduced motion using the selected row, error text, status chips and disabled or read-only controls. Automated checks complement observed NVDA and VoiceOver tasks. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Use the interface locale for shell direction, and the segment language and content for each source or target field. Isolate filenames, counts, model IDs and protected tags inside mixed-direction text. Preserve literal token order when inserting or copying. Test Arabic UI with an English source and Arabic target and a Latin UI with an Arabic source and Turkish target. Also exercise longer Turkish, Catalan and Spanish labels, diacritics, combining marks, and input-method composition before confirming a row. [W3C internationalization guidance](https://www.w3.org/International/questions/qa-html-dir) · [LoopCAT Arabic localization](../../docs/arabic-localization.md)

The proposed gains are easier resumption, fewer context changes and clearer delivery decisions. Measure them against the same tasks in today’s renderer. Observe a novice importing a first file, a translator inserting a protected tag and confirming by keyboard, a reviewer returning from an issue, a terminologist saving a recovered draft and an instructor opening a frozen exercise offline. Record completion, time, errors and points where someone asks what a status means. Use both favorable and unfavorable results to decide which layout becomes the default.
