# LoopCAT Capability Documentation

This document describes the capabilities currently implemented in LoopCAT. It is written as a practical test guide: each section names what the tool is intended to do now and gives concrete checks you can run later to confirm whether the capability holds in real use.

LoopCAT is a local-first CAT tool for translation and post-editing projects. It runs as a static browser app and as an Electron desktop app, stores project data locally, and focuses on offline project safety, format reconstruction, translation memory, terminology, QA, and AI-assisted review workflows.

## 1. Core Project Workflow

LoopCAT supports a multi-project local workspace.

Current capabilities:

- Create, reopen, search, and filter local projects; move projects to local Trash after confirmation and restore them before Trash is emptied.
- Require project name plus source and target languages before saving a new project.
- Use bundled offline language/locales in language pair setup.
- Show recent/common language-pair shortcuts.
- Normalize language codes for project data, translation memories, termbases, package exports, and AI prompts.
- Keep a project dashboard with imported files, word counts, segment counts, progress, resources, domain metadata, and activity count.
- Store projects, segments, resources, settings, activity, and package metadata in local browser storage.
- Request persistent browser storage when available.
- Show workspace storage health and warn when storage is best-effort or nearly full.
- Track local activity events for imports, exports, QA, segment confirmations, resource actions, AI actions, and workspace saves.

Suggested tests:

- Create projects with several language pairs and confirm that the project list filter recognizes each pair.
- Reopen the app and confirm projects survive reload.
- Try malformed or incomplete legacy project data and confirm the app still shows safe fallback labels.
- Confirm that source and target language names/codes remain stable in TM, TB, package, and AI areas.

## 2. File Import Coverage

LoopCAT imports primary DOCX files plus many structure-preserving "Other formats".

Current import families:

- DOCX.
- XLIFF 1.2, XLIFF 2.0/2.1/2.2 Core, and SDLXLIFF.
- Modern Office package variants where supported by the localization parser.
- OpenDocument package formats.
- HTML, XHTML, XML, DITA, DTD, Markdown.
- PO and POT.
- TTX, TXML, XINI.
- IDML and ICML.
- MIF.
- JSON, YAML, CSV, TSV.
- PHP arrays, Java properties, Qt TS, RESX, WiX, iOS `.strings`.
- SRT, VTT, SBV.
- TXT and other plain-text formats.

Current import behavior:

- Imported files become separate documents inside one project.
- Newly imported files are selected immediately.
- Imports show active phase, file name, and file size while running.
- Import, restore, and workspace sync controls are disabled while a long-running import is active.
- Overlapping imports are blocked before they can mutate project data.
- Damaged and oversized files fail at the picker boundary without partially importing data.
- Structure metadata is stored so target files can later be reconstructed through the selected document.

Suggested tests:

- Import one DOCX, one XLIFF, one HTML, one CSV, one PO, one SRT, one JSON, and one Markdown file into the same project.
- Confirm each file appears in the file dashboard and document filter.
- Confirm importing a malformed file reports a visible failure and does not alter the current project.

## 3. Character Encoding Support

LoopCAT uses Unicode internally, and it can decode many older text-file encodings during import.

Current text decoding capabilities:

- UTF-8, including BOM detection.
- UTF-16 little-endian and big-endian, including BOM detection.
- Charset declarations in XML, HTML, CSS, and MIME type metadata.
- Manual text-encoding override from the Import menu.
- Windows code pages, including Windows-1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, and 1258.
- ISO-8859 families used for European, Cyrillic, Arabic, Greek, Hebrew, Turkish, and related legacy text.
- Shift_JIS and EUC-JP for Japanese import.
- GB18030 and Big5 for Chinese import.
- EUC-KR for Korean import.

Current export behavior:

- UTF-8 remains the default safe output path.
- Eligible text-based exports can preserve UTF-8, UTF-16, and single-byte legacy encodings when every target character can be represented safely.
- Unsupported multibyte legacy export encodings fall back to UTF-8 instead of corrupting text.

Resources affected:

- Project text imports.
- XLIFF imports.
- TMX imports.
- TBX imports.
- CSV/TSV terminology imports.
- Portable JSON imports.
- Structure-preserving localization imports.

Suggested tests:

- Import Windows-1254 Turkish TXT, TMX, TBX, and CSV term lists.
- Import Windows-1251 Cyrillic, Windows-1256 Arabic, Shift_JIS Japanese, and UTF-16 text files.
- Export a legacy single-byte TXT target and verify the output bytes decode back correctly.

## 4. Segment Editor

LoopCAT provides a CAT-style segment grid with source text, target text, status, protected tags, term highlights, review state, comments, and AI badges.

Current capabilities:

- Segment source text into editable translation units.
- Edit target segments in-place with local autosave.
- Keep target revision history per segment.
- Mark segments as empty, draft, confirmed, needs review, reviewed, or blocked depending on workflow.
- Confirm the current segment and move to the next open segment.
- Copy source text into target.
- Search source, target, or both.
- Use case-sensitive and regex search.
- Filter by document, segment status, review state, QA state, and AI state.
- Replace target text in visible segments or the full project.
- Replace target text while skipping protected tag and placeholder tokens.
- Split compatible unstructured or DOCX paragraph segments.
- Merge compatible unstructured or DOCX paragraph segments.
- Undo and redo coalesced target typing plus discrete Copy Source, TM/concordance insertion, protected-tag insertion, replacement, confirmation, review-state, AI application, TM/AI pretranslation, and compatible split/merge commands.
- Preserve source/target bidirectional display with automatic text direction for world scripts.

Suggested tests:

- Edit a target, reload, and confirm the edit is still present.
- Confirm a segment with a missing protected tag and verify confirmation is blocked.
- Run target replace on text containing tags and verify protected tokens are not modified.
- Split and merge a plain text segment, then export the target file.

## 5. Protected Tags, Placeholders, And Inline Markup

LoopCAT detects and protects inline elements that should survive translation.

Current capabilities:

- Detect common placeholders, variables, XML/HTML tags, numeric tags, markdown links, and escaped newline sequences.
- Display protected content as short copyable chips.
- Insert protected tokens into target segments by clicking chips.
- Warn when target segments are missing required protected tokens.
- Block delivery exports when required protected tokens are missing.
- Show semantic inline labels such as `<b>`, `<i>`, and `<u>` for supported formatting while preserving reconstruction metadata.
- Preserve DOCX run-level controls such as tabs, line breaks, no-break hyphen, soft hyphen, fields, hyperlinks, content controls, SmartTags, and custom XML in supported fixtures.

Suggested tests:

- Import HTML or DOCX with bold, italic, links, placeholders, and variables.
- Translate while omitting a tag and verify QA/export blocks it.
- Restore tags and verify export succeeds.

## 6. Translation Memory

LoopCAT includes local translation memory support.

Current capabilities:

- Save confirmed segments to project TM.
- Use a main TM and linked reference TMs.
- Show exact and fuzzy TM matches for the active segment.
- Run concordance search from selected source text with Ctrl+K or Alt+K.
- Pretranslate empty segments from TM matches above a chosen percentage.
- Import and export project TMX.
- Import, preview, edit, and export standalone TM resources.
- Move TM entries and whole translation-memory resources to local Trash with Undo/Redo and conflict-safe restoration.
- Normalize direct TM resource saves and imports so incomplete rows do not persist.
- Normalize friendly language labels before resource lookup.
- Mark linked projects dirty when a linked TM resource changes.
- Redact credential-looking origin metadata during TMX import/export.

Suggested tests:

- Confirm a segment, then verify it appears as a TM match in another similar segment.
- Import a TMX file and confirm entries are available in concordance and TM match panels.
- Edit a standalone TM row and verify linked projects become unsaved/dirty.

## 7. Termbase And Terminology

LoopCAT includes local terminology management and QA integration.

Current capabilities:

- Add local termbase entries.
- Show terms found in the active source segment.
- Highlight source terms inside the grid.
- Mark target terms as forbidden.
- Check approved and forbidden terminology in QA.
- Block delivery export when forbidden terminology appears.
- Import and export TBX.
- Import CSV, TSV, and XLSX terminology lists.
- Preview, edit, export, and import standalone termbase resources.
- Move terms and whole termbase resources to local Trash with Undo/Redo and conflict-safe restoration.
- Preserve termbase notes in TBX.
- Redact credential-looking notes during TBX and term-list import/export.
- Keep approved and forbidden terms visible in offline project reports.
- Mark linked projects dirty when a linked termbase changes.

Suggested tests:

- Add one approved term and one forbidden term.
- Run QA on a target that misses the approved term and uses the forbidden term.
- Import TBX and CSV terminology files, then edit a term in Resources.

## 8. QA, Review, And Reporting

LoopCAT includes translator QA and review workflows.

Current QA checks:

- Empty target.
- Missing protected tags/placeholders.
- Copied source.
- Number mismatches.
- Punctuation mismatches.
- Termbase usage.
- Forbidden target terms.
- Unsafe target HTML and scriptable markup for supported formats.
- XML-invalid characters before XML-backed exports.

Current review capabilities:

- Mark target rows as needs review, reviewed, or blocked.
- Save reviewer notes, structured comments, and category-backed quality decisions.
- Filter by review state.
- Export bilingual DOCX review files with segment status, reviewer notes, structured comments, and QA summaries.
- Include revision counts in reports.

Current reporting capabilities:

- Project analysis for progress, repetitions, TM leverage, untranslated segments, review flags, comments, and AI triage.
- Quality Workbench risk queue using QA issues, review state, comments, category-backed quality decisions, AI review risk, AI-initiated drafts, AI suggestions, target revision density, confirmation state, and the project quality profile.
- Project quality profile covering review standard, review depth, risk tolerance, terminology strictness, AI disclosure, audience, and tone.
- Quality Passport export with quality contract, quality score, post-editing effort estimate, risk levels, quality categories, top risk signals, QA evidence, review/AI evidence, and export-readiness notes. Segment source and target text are not included.
- Normal offline HTML project report with counts, terminology status, QA totals, and activity summaries.
- Anonymized offline HTML project report that redacts project names, file names, resource names, terminology text, activity summaries, activity types, and segment text.
- Restrictive CSP in exported report HTML.

Suggested tests:

- Run QA on a file with empty targets, missing tags, number mismatch, and forbidden terminology.
- Export normal and anonymized project reports and inspect what is included or redacted.
- Save a quality profile, classify one quality decision, refresh the risk queue, jump to the next risk, and export a Quality Passport.
- Export a bilingual DOCX review file and confirm comments/statuses are represented.

## 9. Export And Delivery

LoopCAT can export simple and structure-preserving target files.

Current export capabilities:

- Target TXT export.
- Generic XLIFF 1.2 or XLIFF 2.2 Core project handoff export.
- Current imported XLIFF/SDLXLIFF target reconstruction. XLIFF 2.x reconstruction retains the original hierarchy, notes, ignorable content, skeletons, original data, and non-Core extension XML while replacing mapped targets and segment states.
- Target DOCX reconstruction from original DOCX package.
- Bilingual DOCX review export.
- Structure-preserving localization exports for supported Other formats.
- Project TMX export.
- Project TBX export.
- Standalone TMX/TBX resource exports.
- Offline project report export.
- Anonymized project report export.
- Portable LoopCAT project package export.
- Full browser backup export.
- Workspace folder project package and backup export where supported by the browser/desktop environment.

Current export safety:

- Incomplete delivery exports require confirmation and report empty and non-empty unconfirmed target counts.
- Monolingual delivery formats use source text for empty targets without changing the editor; bilingual interchange formats preserve empty targets and untranslated states.
- Delivery export remains blocked when authored targets lose protected tags, XML-invalid output would be produced, unsafe HTML exists, reconstruction metadata is missing, or forbidden terminology appears.
- Exports obey the selected document instead of silently exporting another file.
- Download filenames are sanitized for path separators, unsafe characters, reserved Windows device names, and credential-looking values.
- Failed browser download clicks report visibly and clean up temporary links/object URLs.
- Project packages and backups are validated before export or restore.

XLIFF 2.2 scope:

- Core file/group/unit/segment hierarchy, language metadata, notes, state, `xml:space`, `originalData`, and Core inline codes are parsed and reconstructed.
- XLIFF 2.0 and 2.1 Core remain accepted for backward compatibility.
- Optional Part 2 modules and custom namespaces are preserved in current-file exports, but module-specific editing and generic module authoring are future work.
- The release gate validates both a representative Core 2.2 fixture and a live generic export against vendored official schemas.

Suggested tests:

- Export each imported file type after translating all segments.
- Export a partial DOCX and verify empty targets use source text only in the generated file.
- Export partial XLIFF 1.2 and 2.2 files and verify their targets remain explicitly empty with `new`/`initial` state.
- Cancel an incomplete export and verify that no file or activity record is created.
- Try exporting a selected document while other documents remain unfinished.

## 10. Backup, Packages, And Workspace Folder Sync

LoopCAT is designed around local recovery rather than cloud dependency.

Current capabilities:

- Export and import a single portable `.loopcat.json` project package.
- Export and restore a full browser backup.
- Validate project packages and backups before import or restore.
- Replace same-project packages only after pending segment saves are flushed.
- Preserve source assets and reconstruction metadata in project packages where needed.
- Restore full backups by replacing backed-up stores and rebuilding derived indexes.
- Connect a workspace folder and write visible project packages.
- Mark local browser-cache projects as unsaved when they are missing from the connected folder.
- Detect damaged, oversized, unreadable, stale, or invalid workspace package entries.
- Keep workspace package dirty markers across reloads for recovery.
- Show a backup reminder for long-running projects without a recent portable package export.
- Keep local Trash and command history outside the portable single-project package contract; package exports contain the active project state, while full browser backup/restore follows its separately versioned storage contract.

Suggested tests:

- Export a project package, delete the project, then re-import it.
- Export a full backup, create another project, restore the backup, and confirm data matches.
- Connect a workspace folder, save, reload, and verify unsaved package recovery prompts.

## 11. Desktop App And Offline Shell

LoopCAT can run as an offline-capable browser app or Electron desktop app.

Current capabilities:

- Static HTML/CSS/JavaScript app shell.
- Offline service-worker cache for browser/PWA use.
- Electron desktop wrapper for Windows, macOS, and Linux packaging.
- Desktop protocol `loopcat://app/` serves only bundled app files.
- Desktop renderer hardening keeps web security on and blocks insecure features.
- Browser and desktop network policy is narrow and explicit.
- Packaged Windows builds produce an installer and portable executable.
- Electron 43 runs with renderer sandboxing, context isolation, secure fuses, and hardware acceleration enabled by default; an explicit restart-based graphics fallback is available for affected machines.
- System, Light, and Dark themes plus Balanced and Compact density are remembered locally.
- The editor supports Focus mode and a remembered 280–420 px contextual inspector that changes to an overlay below 1100 px.
- A fuzzy grouped `Ctrl/Cmd+K` command palette provides keyboard navigation, shortcuts, disabled reasons, and recent commands.
- Saving, background jobs, notices, warnings, and recoverable errors use separate presentation models.
- Service-worker updates present an explicit reload/defer action and flush pending work before activation.
- Local diagnostics can be previewed and downloaded without network transmission; project text, prompts, secrets, names, and exact local paths are excluded or redacted.
- Production artifacts exclude the deep workflow driver, test route, fixtures, mocks, and test globals. The root `app.js` is a 13-line bootstrap into checked feature controllers and services.

Suggested tests:

- Launch the desktop app from `dist/win-unpacked/LoopCAT.exe`.
- Verify IndexedDB persistence in the packaged desktop app.
- Verify the app opens through `loopcat://app/index.html`.
- Confirm test/debug pages are not accessible through the desktop protocol.
- Switch themes and density, resize/close the inspector, exercise the command palette entirely by keyboard, and verify preferences survive reload.
- Export local diagnostics and confirm no source/target text, prompts, secrets, user names, project names, or exact local paths appear.

## 12. AI Capability Overview

LoopCAT has two AI areas:

- The AI Command Centre, which supports local, hosted, router, and managed AI providers through one workflow.
- The optional OpenAI helper, an older OpenAI-only suggestion flow with project-level source-sharing controls.

The AI system is designed to keep target edits reviewable. Most AI editing commands save suggestions rather than overwriting the translator's current target. AI pretranslation is the main command that writes directly to target cells, and it marks those rows as needing review.

## 13. AI Providers

The AI Command Centre currently exposes these provider presets:

| Preset | Provider id | Default base URL | Default model | Key required |
| --- | --- | --- | --- | --- |
| Ollama local | `ollama` | `http://localhost:11434` | `translategemma` | No |
| Ollama cloud model via local Ollama | `ollama` | `http://localhost:11434` | `gpt-oss:120b-cloud` | No, but confirmation is required |
| Ollama Cloud direct | `ollama` | `https://ollama.com` | `gpt-oss:120b` | Yes |
| OpenAI | `openai` | `https://api.openai.com/v1` | `gpt-5.5` | Yes |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash` | Yes |
| Anthropic Claude | `anthropic` | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` | Yes |
| Cohere Command | `cohere` | `https://api.cohere.com` | `command-a-translate-08-2025` | Yes |
| Mistral AI | `mistral` | `https://api.mistral.ai/v1` | `mistral-large-latest` | Yes |
| xAI Grok | `xai` | `https://api.x.ai/v1` | `grok-4.3` | Yes |
| Azure OpenAI | `azure-openai` | `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1` | `gpt-4.1-nano` | Yes |
| LM Studio local | `openai-compatible` | `http://localhost:1234/v1` | `translategemma` | No |
| OPUS-CAT local | `opus-cat` | `http://localhost:8500` | `default` | No |
| DeepSeek | `deepseek` | `https://api.deepseek.com` | `deepseek-v4-pro` | Yes |
| Perplexity Sonar | `perplexity` | `https://api.perplexity.ai/v1` | `sonar-pro` | Yes |
| Groq | `groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Yes |
| Together AI | `together` | `https://api.together.ai/v1` | `MiniMaxAI/MiniMax-M3` | Yes |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | `~openai/gpt-latest` | Yes |
| Hugging Face Inference Providers | `huggingface` | `https://router.huggingface.co/v1` | `openai/gpt-oss-120b:cerebras` | Yes |
| DeepInfra | `deepinfra` | `https://api.deepinfra.com/v1/openai` | `meta-llama/Meta-Llama-3.1-70B-Instruct` | Yes |
| Fireworks AI | `fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p1-8b-instruct` | Yes |

Provider features:

- Test connection.
- Refresh model list.
- Pull model for local Ollama.
- Start LM Studio server from the desktop app when LM Studio local is selected and reachable through the desktop bridge.
- Run pretranslation through `translateSegment`.
- Run review/editing/terminology/project-brief commands through `completePrompt`.
- Scope hosted provider API keys by provider and normalized base URL.
- Reuse saved OpenAI key for OpenAI Command Centre requests when no Command Centre key is typed.
- Block unsupported hosted OpenAI-compatible endpoints unless they are loopback or part of the explicit hosted allowlist.

Suggested tests:

- Select each provider preset and confirm the provider summary changes base URL, endpoints, key requirement, and best-fit guidance.
- For local Ollama, run connection test, refresh models, pull `translategemma`, and pretranslate one segment.
- For LM Studio local, select the preset and test connection against a running local server.
- For hosted providers, enter an API key, run connection test, refresh models, and run a prompt test.

## 14. AI Privacy And Safety Rules

Current AI safety behavior:

- Local loopback providers are treated as local mode.
- Hosted/network providers require confirmation before sending source text outside LoopCAT.
- Ollama cloud-suffixed models require confirmation even when the request first goes to local Ollama.
- Direct hosted Ollama requires an API key and confirmation.
- Hosted provider keys are stored only in browser or tab storage, scoped by provider and normalized base URL.
- API keys are not exported with project packages or backups.
- AI provider metadata is normalized before local segment storage and portable export.
- Provider trace metadata such as prompts, response IDs, request IDs, custom endpoints, and provider raw traces are stripped from packages/backups.
- Credential-looking values are redacted from activity events, visible status text, validation reports, package metadata, resource metadata, AI settings, and report output.
- OpenAI Responses requests set `store: false`.
- OpenAI suggestion path fails fast when the browser appears offline, before key storage or settings save.
- Hosted OpenAI-compatible custom endpoints are rejected unless they are loopback or explicitly allowlisted through known provider presets.

Suggested tests:

- Try a hosted provider command and cancel the confirmation. Confirm no target or suggestion changes.
- Save keys for two hosted providers and confirm the keys do not cross over.
- Export a project package after using AI and confirm API keys and prompt traces are absent.
- Try an unsupported hosted OpenAI-compatible endpoint and confirm it is blocked.

## 15. AI Command Centre Controls

Current controls:

- Provider preset.
- Advanced provider id.
- Base URL.
- Hosted provider API key.
- Remember key for this browser/tab.
- Test connection.
- Start LM Studio server where available.
- Refresh models.
- Model dropdown and manual model input.
- Pull model for local Ollama.
- Source and target language names.
- Source and target language codes.
- Batch mode: selected, untranslated/current document, all visible, or whole project.
- Concurrency, currently clamped to 1 or 2.
- Timeout in milliseconds, 5 seconds to 10 minutes.
- Overwrite existing target text for pretranslation, with confirmation.
- Include nearby context.
- Preserve confirmed/locked rows.
- Prompt type selector.
- Prompt preview.
- Prompt test.
- Latest AI output drawer.

Batch mode notes:

- `selected` targets the active segment.
- `untranslated` generally targets current-document untranslated segments for pretranslation, and current-document scope for several review/editing workflows.
- `visible` targets segments currently visible after filters.
- `project` targets the full project.
- Confirmed and locked segments are preserved in destructive workflows.

Suggested tests:

- Switch every batch mode and run a small AI command on a controlled fixture.
- Toggle nearby context and inspect prompt preview.
- Increase timeout and verify slow provider calls no longer fail early.

## 16. AI Prompt Test

The Prompt Test area can preview and send the same prompt families used by real AI commands.

Prompt modes:

- Pre-translation.
- Review / QA.
- Tag repair.
- Draft polish.
- Draft adaptation.
- Alternatives.
- Terminology application.
- Terminology extraction.
- Project brief.

Current behavior:

- Prompt preview uses active segment source unless sample text is typed.
- Prompt preview includes language names, language codes, project style instructions, glossary hints, protected tokens, and nearby context where relevant.
- Prompt test sends a real request to the selected provider.
- Hosted/network prompt tests ask for confirmation before sending source/context.
- Prompt output is shown in the Latest AI output area.

Suggested tests:

- Select each prompt mode and confirm the preview changes.
- Type sample text and verify it appears in the prompt.
- Run prompt test with local Ollama and inspect the latest output.

## 17. AI Pretranslation

AI pretranslation is the AI command that writes directly into target cells.

Current behavior:

- Sends segment source text to the selected provider.
- Includes source/target language names and codes.
- Includes protected-token preservation instructions.
- Includes matching TM entries when TM context is enabled.
- Includes matching termbase entries when termbase context is enabled.
- Includes up to nearby previous/next segment context when nearby context is enabled.
- Skips empty-source segments.
- Skips locked segments.
- Skips confirmed segments.
- Skips existing target text unless overwrite is enabled.
- Asks for confirmation before overwriting existing target text.
- Marks generated rows as draft.
- Marks generated rows `Needs review`.
- Stores AI pretranslation metadata with provider, provider id, model, status, and timestamp.
- Displays `AI initiated` badges in the segment grid.
- Confirming a reviewed AI-pretranslated segment clears `Needs review` but keeps the AI-initiated badge.
- Supports cancellation during batch runs.
- Reports completed, failed, skipped, and canceled counts.

Suggested tests:

- Run pretranslation on one empty segment and verify target text is written, draft status is set, and `Needs review` appears.
- Run pretranslation with existing targets and overwrite disabled, then enabled.
- Confirm an AI-pretranslated row and verify the needs-review state clears.

## 18. AI Review And Batch QA

AI review creates risk-ranked review comments rather than rewriting the target.

Current behavior:

- Requires source and target text.
- Sends the active source/target pair plus glossary hints.
- Returns concise review notes.
- If no issues are found, the expected provider output is exactly `No issues found.`
- Parses severity labels into risk levels: none, low, medium, high, critical.
- Saves review comments as open structured comments.
- Marks reviewed segments as `Needs review`.
- Stores AI review risk metadata.
- Shows AI risk badges in the segment grid.
- Supports AI segment filters for AI review risk and high AI risk.
- Batch QA skips empty-source, empty-target, locked, and confirmed segments.
- Batch QA does not add comment noise for `No issues found.` responses.
- Batch QA reports comments saved, no-issue count, failures, skips, cancellation, and highest risk.

Suggested tests:

- Review a target with a clear error and verify a comment appears with a risk badge.
- Review a correct segment and verify `No issues found.` does not create unnecessary comments in batch mode.
- Filter to high AI risk after a batch review.

## 19. AI Tag Repair

AI tag repair proposes safe target replacements when protected tags or placeholders are missing.

Current behavior:

- Requires source and target text.
- Uses detected protected tokens from the source and segment metadata.
- Instructs the provider to fix only placeholder, tag, variable, markdown link, escaped newline, number, and spacing issues.
- Saves the repaired target as an AI suggestion.
- Does not overwrite the current target until the translator applies the suggestion.
- Adds warnings if the proposed target may still be missing protected tokens.
- Batch repair selects only translated rows with protected-token mismatches.
- Batch repair skips empty-source, empty-target, locked, confirmed, no-protected-tag, and no-mismatch rows.
- Batch repair supports cancellation, failures, skipped counts, and unchanged counts.

Suggested tests:

- Import a segment with a protected placeholder, omit it in the target, then run tag repair.
- Verify the proposed repair is stored as an AI suggestion, not applied automatically.
- Apply the suggestion and verify QA/export no longer reports the missing tag.

## 20. AI Draft Polishing

AI polish improves an existing target while preserving source meaning and protected tokens.

Current behavior:

- Requires source and target text.
- Uses project style instructions, TM matches, termbase hints, and protected tokens.
- Saves the polished target as a reviewable AI suggestion.
- Does not overwrite the current target until applied.
- Batch polish skips locked, confirmed, empty-source, and empty-target rows.
- Batch polish records failures, skipped rows, unchanged rows, and cancellation.

Suggested tests:

- Create an awkward draft, run Polish draft, and verify an AI suggestion is saved.
- Confirm applying the suggestion changes the target and creates revision history.

## 21. AI Draft Adaptation

AI adaptation reshapes a target for a chosen editing goal.

Current adaptation modes:

- Simplify and clarify.
- Formalize.
- Locale-adapt.
- Shorten.

Current behavior:

- Requires source and target text.
- Uses project style instructions, TM matches, termbase hints, and protected tokens.
- Saves the adapted target as a reviewable AI suggestion.
- Does not overwrite current target until applied.
- Batch adaptation skips locked, confirmed, empty-source, and empty-target rows.

Suggested tests:

- Run each adaptation mode on the same target and compare saved suggestions.
- Verify protected placeholders survive each adaptation.

## 22. AI Alternatives

AI alternatives creates multiple reviewable target variants.

Current alternative styles:

- Standard: literal, fluent, terminology-strict.
- Formal.
- Concise/UI.
- Locale-adapted.
- Plain language.

Current behavior:

- Requires source text.
- Can use an existing target draft if present.
- Uses glossary hints and protected tokens.
- Asks for exactly three labelled alternatives.
- Saves each usable alternative as a separate AI suggestion.
- Filters out alternatives identical to the current target.
- Batch alternatives skips locked, confirmed, empty-source, and empty-target draft rows.
- Batch alternatives records suggestion count, unchanged rows, failures, skips, and cancellation.

Suggested tests:

- Run alternatives with each style and confirm three labelled suggestions are saved.
- Run batch alternatives on several drafts and verify no current target is overwritten.

## 23. AI Terminology Application

AI terminology application revises an existing target to better follow the current termbase.

Current behavior:

- Requires source and target text.
- Requires matching project terminology.
- Sends approved and forbidden terminology hints.
- Preserves protected tokens.
- Saves the revised target as an AI suggestion.
- Does not overwrite the current target until applied.
- Adds warnings if approved terms remain missing or forbidden terms remain present.
- Batch terminology application skips locked, confirmed, empty-source, empty-target, and no-termbase-hit rows.

Suggested tests:

- Add one approved term and one forbidden term, then run Apply terms on a target that violates both.
- Verify the suggestion appears and warnings are shown if the provider does not fully comply.

## 24. AI Terminology Extraction

AI terminology extraction proposes termbase candidates from segment text.

Current behavior:

- Requires source text.
- Can use current target draft when available.
- Asks the provider to return a JSON array with `sourceTerm`, `targetTerm`, and `note`.
- Saves useful term candidates into the current termbase.
- Adds notes beginning with `AI extracted term candidate. Review before relying on it.`
- Skips duplicate source/target term pairs already in the current termbase.
- Batch extraction can run on selected, visible, current-document, untranslated/current-document, or project segments depending on mode.
- Batch extraction reports saved terms, duplicate count, failures, and cancellation.

Suggested tests:

- Run Extract terms on a domain-heavy segment and verify candidates appear in the termbase.
- Run the same extraction again and verify duplicates are skipped.

## 25. AI Project Brief

AI project brief generation creates reusable translation instructions and appends them to the project style guide.

Current behavior:

- Uses project metadata, language pair, document names, sample segments, and up to 12 termbase hints.
- Does not require a selected active segment.
- For hosted providers, asks for confirmation before sending project metadata and sample text.
- Appends a block beginning with `AI project brief:` to existing style instructions.
- Saves the updated style guide into project AI settings.
- Shows the latest brief in the AI output area.
- Logs an AI project-brief activity event when possible.

Suggested tests:

- Import a project with several files and terms, generate a brief, and confirm style instructions are updated.
- Generate a second brief and confirm it appends instead of replacing the first one.

## 26. AI Suggestions

AI suggestions are reviewable alternatives stored on each segment.

Current behavior:

- Suggestions store provider, model, segment id, suggested target, confidence, explanation, status, and timestamp.
- Provider and model labels are redacted if they look credential-like.
- Explanation lines are capped and redacted.
- Suggestions can be applied to the active target.
- Applying a suggestion sets the target to draft.
- Applying a suggestion records target revision history.
- Applying a suggestion logs an activity event when possible.
- Save/apply failures roll back visible and persisted segment state.
- AI suggestion rows are filterable in the editor.

Suggested tests:

- Generate two different suggestions on one segment.
- Apply one suggestion and verify target, revision history, and activity log.
- Export a project package and verify suggestions remain review-useful but prompt traces and provider raw IDs are not present.

## 27. Optional OpenAI Helper

The optional OpenAI helper is separate from the AI Command Centre. It creates one OpenAI draft suggestion for the active segment.

Current behavior:

- Requires AI helpers enabled for the project.
- Requires provider set to OpenAI.
- Requires source sharing enabled.
- Requires active segment source text.
- Requires an OpenAI API key.
- Fails before key/settings save when the browser appears offline.
- Asks for confirmation before sending selected/source text outside LoopCAT.
- Can include local TM matches, termbase hits, and style instructions.
- Uses the OpenAI Responses API.
- Sends `store: false`.
- Saves output as an AI suggestion, not directly into the target.
- Keeps API keys in browser or tab storage only.
- Does not export API keys with project packages or backups.

Suggested tests:

- Try the helper with AI disabled, source sharing disabled, non-OpenAI provider, no key, and offline browser state.
- Enable all requirements and confirm one suggestion is saved.
- Verify the request does not overwrite the current target.

## 28. AI Analysis And Reporting

AI metadata contributes to analysis and reports without exposing segment text.

Current metrics:

- AI-initiated rows.
- Rows with AI suggestions.
- Total AI suggestions.
- AI review risk rows.
- High-risk AI review rows.

Current visible badges and filters:

- `AI initiated`.
- AI suggestion count.
- AI review risk.
- High AI risk.
- Editor filter: all AI, AI initiated, AI suggestions, AI review risk, high AI risk.

Suggested tests:

- Create one AI pretranslation, one AI suggestion, and one high-risk review comment.
- Check project analysis and offline reports for metadata counts.
- Confirm reports do not include prompt traces or provider raw responses.

## 29. Current Known Limits And Cautions

These are important when testing and documenting LoopCAT publicly:

- AI output quality depends on the selected provider/model.
- Hosted provider support depends on live provider APIs, keys, account access, and model availability.
- The default model names in the app are presets and may need to be changed to models actually available in a user's account.
- Local Ollama and LM Studio depend on local runtime installation and model availability.
- OPUS-CAT depends on a running local OPUS-CAT MT Engine plus an installed matching language-pair model; it supports pretranslation rather than prompt-based review/edit commands.
- AI suggestions are assistive, not automatically trusted translation memory.
- AI pretranslation writes targets directly but always marks them for review.
- Most AI editing commands save suggestions rather than overwriting targets.
- Legacy multibyte imports are decoded, but legacy multibyte export preservation falls back to UTF-8 when a safe encoder is not available.
- Very complex DOCX, OpenXML, OpenDocument, and DTP layouts still need real-world fixture depth beyond the current tested structures.
- Unsigned desktop builds may trigger operating-system warnings.
- Local browser storage is not a substitute for project package exports or workspace-folder backups.
- Automated modernization gates do not replace pending NVDA/VoiceOver, 200% zoom, final human visual, clean-machine, signing/notarization, storage-failure, and reference-hardware evidence.
- Hosted initial JavaScript is smaller than the recorded baseline but remains above the optional 750 KB minified stretch target; further reduction requires an explicit behavior, timing, offline, or direct-file compatibility decision.

## 30. Suggested End-To-End Acceptance Test

Use this test when deciding whether a release is good enough to share:

1. Create a project with a bundled offline language pair.
2. Import a DOCX, HTML, XLIFF, SRT, JSON, and TXT file.
3. Import a Windows-1254 TMX and TBX file.
4. Translate several segments manually.
5. Confirm some segments and verify TM matches.
6. Add approved and forbidden terminology.
7. Run QA and verify issues appear.
8. Configure local Ollama or another test provider.
9. Run AI prompt preview and prompt test.
10. Run AI pretranslation on one empty segment.
11. Run AI review on one draft.
12. Run tag repair on a segment with missing protected tokens.
13. Run polish, adaptation, alternatives, terminology application, terminology extraction, and project brief generation.
14. Apply one AI suggestion and inspect revision history.
15. Export target files for each imported document.
16. Export bilingual review DOCX.
17. Export normal and anonymized reports.
18. Export project TMX and TBX.
19. Export a portable project package.
20. Re-import the package in a clean profile and confirm files, segments, resources, AI metadata, and reports remain usable.
21. Build or launch the desktop app and repeat a small import/edit/export smoke test.
