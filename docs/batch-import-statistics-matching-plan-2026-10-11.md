# LoopCAT: batch import, trustworthy matching, and Statistics

Date: 11 October 2026. Status: core delivery implemented; see [implementation and validation notes](statistics-implementation-2026-10-11.md) for evidence and remaining calibration limits. The sections below retain the original design and release targets.

## 1. Recommended outcome and order

Make LoopCAT useful for accepting a job, estimating its workload, translating it, and explaining the result to a client. Deliver reliable mixed-format batch import and a Statistics popup backed by the same counting and matching rules as the editor.

Implement in this order:

1. Establish shared text, count, match, and report contracts with regression fixtures.
2. Harden batch import into a complete workflow. This can progress alongside matching once contracts are settled.
3. Correct matching, candidate retrieval, context handling, and worker/local parity.
4. Build scoped statistics and real multi-segment selection on those foundations.
5. Deliver Simple/Advanced Statistics, saved reports, exports, and measured release validation.

Do not ship a polished statistics screen on the existing scoring path: current analysis and editor results demonstrably disagree. Reuse Loopcat Pro's domain logic, contracts, and tests where suitable, adapting them to LoopCAT's JavaScript, IndexedDB, browser/desktop architecture.

## 2. What the audit established

The target is `D:/Gokhan Codex/CatHan`, package `loopcat`. The reference is `D:/Gokhan Codex/LoopCAT-Pro`, package `loopcat-pro`. Only the target receives implementation work.

| Area | Existing evidence | Consequence |
| --- | --- | --- |
| Multiple import | `index.html` already has a multiple-file input; `importManyProjectFiles()` in `src/features/import-export/import-export-controller.js` loops sequentially. | Productize existing functionality; do not build another importer. |
| Batch failure | The loop has one outer catch; the file-import service can return `false` after handling an error, and the loop ignores that outcome. Busy handling and refresh run per file. | Add a batch coordinator, explicit per-file outcomes, one busy lifetime, and bounded refresh work. |
| Persistence | `project-document-import-controller.js` rereads project segments and refreshes views after each file. Existing append writes use the storage mutation/journal path. | Flush pending edits first, fence project identity, reuse atomic commits, and defer expensive refreshes. |
| Counts | `analysis.js` and `src/features/editor/segment-progress-service.js` split on whitespace. | Tags, punctuation-only strings, and languages without spaces are miscounted. Replace every relevant count consumer. |
| Statistics | `analysis.js` provides segment-based match buckets; repetitions overlap the leverage totals. | Add mutually exclusive word-based categories and keep descriptive repetition metrics separate. |
| Resource rules | `src/app/application-composition.js` sends only source strings to TM analysis, losing resource penalties, lookup settings, target usability, and context. | Analysis must call the same resource-aware matcher as the editor. |
| Selection | Current selection integration supplies one active segment. | Selected-segment analysis requires an actual stable-ID multi-selection model. |
| Matching | `tm.js` and `cat-worker.js` duplicate scoring; `tm-analysis` uses another calculation. | Share one pure scoring implementation and result contract. |

Read-only probes against the present implementation produced these results; they are regression evidence, not desired scores:

| Comparison | Editor scorer | Analysis scorer |
| --- | ---: | ---: |
| `Click Save` vs `<b>Click Save</b>` | 84% | 71% |
| `Click Save` vs the same text inside a span with long class/style attributes | Candidate rejected | 16% |
| `<g id="1">Save changes</g>` vs the same text with ID `2388` | 76% | 83% |
| `Hello world!` vs `Hello world.` | 99% | 100% |

Additional probes found that a newer duplicate with a 30-point TM penalty can replace an unpenalized 100% result, and matching `documentKey` alone can grant a context match despite differing neighboring text. A styled two-word string counts as seven words under the current whitespace counter.

### Reuse from Loopcat Pro

| Reference module | Adaptation |
| --- | --- |
| `packages/resources/src/source-analysis.ts` | Source projections, protected-code descriptors, Unicode metrics, safe tag remapping, version identifiers, and fixtures. |
| `packages/resources/src/scoring.ts` and `recognition.ts` | Lexical scoring, explicit adjustments, structure compatibility, recognition, and regression cases. |
| `packages/contracts/src/statistics.ts` | Scope union, exclusive buckets, rows, immutable snapshots, versions, and completeness metadata. |
| `packages/storage/src/statistics.ts` | Classification and aggregation policy; replace storage access with LoopCAT repositories. |
| `apps/desktop/src/main/statistics-worker.ts`, `apps/desktop/src/main/statistics-queries.ts` | Background-job and candidate-completeness design; implement with LoopCAT web workers. |
| `apps/desktop/src/renderer/Statistics.tsx` | Interaction patterns and progressive detail; rebuild using LoopCAT controllers, native dialog, design tokens, and localization. |
| `apps/desktop/src/main/import-session.ts`, `reviewed-imports.ts`, and `apps/desktop/src/renderer/ImportPreview.tsx` | Reviewed queue, limits, cancellation, per-file settings, and generation checks. |
| `packages/storage/src/import-receipts.ts` | Fingerprints and replay-safe commit receipts, adapted to the per-file commit policy below. Pro currently uses a whole-batch atomic commit. |
| `tests/storage/source-analysis.test.ts`, `statistics.test.ts`, `matching-index.test.ts`, and `tests/e2e/statistics-batch.spec.ts` | Behavioral fixtures and workflow checks, extended for LoopCAT-specific storage and formats. |

Pro's implementation is a starting point, not proof of correctness in LoopCAT. Audit descriptor coverage for LoopCAT's DOCX, XLIFF, HTML, and localization representations, language handling, candidate truncation, and quote reproducibility. Its existing snapshot jobs are session-bound; durable quote history needs additional work. Its recorded large-scale benchmark uses highly repetitive source patterns, so add representative unique-source workloads. Do not transplant SQLite, Electron-only APIs, or React into the existing renderer. Preserve applicable license notices on copied material.

## 3. Mixed-format batch import

### Product decisions

- One **Add files** action accepts a mixture of currently supported source formats, including DOCX, XLIFF, TXT, HTML, and localization files. Resource imports and project/backup restore remain separate workflows.
- Initial limit: **50 files per batch**, **100 MiB combined**. Preserve the existing **100 MiB per-file** ceiling within that combined limit. These are starting operational limits, not a project-wide file limit; show them before selection. Verify 20 mixed files and the 50-file boundary before release.
- Parse and commit sequentially to control memory and write conflicts. Selecting files together does not require parsing every file concurrently.
- Review the queue before import: filename, detected format, size, encoding where applicable, duplicate warning, readiness/error. Let users remove invalid rows and import the remaining ready files.
- Offer **Skip** or **Import as another file** for duplicates; do not overwrite an existing document implicitly. Identify same-name files separately from content-identical files. Reuse hashes for safe retry receipts where practical.
- Use the format registry for extensions and validation. Unknown, corrupt, encrypted, incompatible-language bilingual, or unsupported files get an actionable per-file result. A bilingual language mismatch needs an explicit per-file decision; do not silently change the project's languages.

### Execution and recovery

1. Flush pending editor saves. Capture project ID, language pair, ownership/generation, and the reviewed queue.
2. Acquire the existing import/restore/sync guard for the entire batch. Navigation must not redirect a running job's writes to another project.
3. Parse each file using existing format services. Preserve structures, inline metadata, original bytes, and empty-document manifest entries. Retain the existing 150 MiB expanded-content limit for DOCX/localization packages, archive integrity checks, and entry limits; bound retained parsed/reconstruction data as well. Release per-file temporary buffers after commit.
4. Commit each file and its success receipt atomically through the existing mutation journal. Storage quota failure must not leave a half-document or a false success receipt.
5. Continue after an ordinary file parse failure. Stop on lost ownership, project replacement, persistent storage failure, or cancellation. Keep files already committed.
6. Update lightweight progress after each file; refresh the full project/editor once on completion or cancellation. Select the first successfully imported file, with links to open any result.

Progress reads “Importing 7 of 20 — filename — reading/saving,” followed by a summary such as “18 imported, 1 skipped, 1 failed.” **Cancel** stops queued work and aborts parsing where safe; an in-progress transaction is resolved before its outcome is reported. Never label a committed file canceled.

Provide **Retry failed files** without repeating successful commits. After interruption/restart, reconcile receipts and show completed versus unfinished work. Browser file access may require reselecting unfinished files; do not promise automatic restart from unavailable file handles. Document deletion continues through existing Trash/undo behavior.

## 4. Counting and matching rules

### One versioned source projection

Create one pure linguistic projection used by counts, indexing, scoring, and repetitions. It exposes visible text, protected code structure, placeholders, and recognition metadata while preserving the original source for editing and export.

- Use importer metadata first: distinguish formatting from literal text, opaque placeholders, and XLIFF payloads. Never remove every angle-bracket expression with a blanket regular expression.
- Recognized formatting contributes no words. Formatting inside a word must not split it: `trans<b>la</b>tion` counts as one. Line-break codes and opaque placeholders have explicit boundary rules.
- Count translatable ICU branch text, not selector grammar; count each branch once. Respect extraction exclusions such as hidden field instructions and nontranslatable attributes. Do not decode literal entities twice.
- Use locale-aware word segmentation and grapheme counts, adapting Pro's `Intl.Segmenter` implementation. Specify apostrophe, hyphen, decimal, date, URL, number-only, NBSP, and soft-hyphen behavior with golden fixtures. A provisional default treats an internal hyphen/apostrophe as part of one word and a numeric expression as one unit.
- Whitespace-only, punctuation-only, and tags-only text contribute zero source words. Tags and placeholders remain separately countable. Source language, never OS/UI language, selects counting behavior.
- Show characters with/without spaces. For Chinese/Japanese and other languages without whitespace boundaries, provide explicit language-appropriate units; do not imply that word estimates and Asian character billing are interchangeable. Include CJK, Thai, Turkish, Catalan, Arabic, and mixed-script fixtures.
- Name the default profile **LoopCAT counting v1**. Record engine/runtime and profile versions. `Intl.Segmenter` can vary with browser ICU data: immutable reports preserve original results, and cross-runtime golden tests gate release. Do not silently fall back to whitespace splitting if segmentation is unavailable.

Unicode provides boundary rules and permits documented language tailoring; it does not define one universal commercial billing count. [Unicode UAX #29](https://www.unicode.org/reports/tr29/)

### Match calculation and safety

The goal is conventional CAT behavior with explainable results. The reviewed vendor documentation defines configurable categories and penalties, not one universal fuzzy-scoring formula. Exact memoQ/Trados percentage identity therefore requires a named version/settings benchmark and must not be promised from code similarity alone. memoQ itself notes that tool statistics can differ. [memoQ weighted counts](https://docs.memoq.com/current/en/Concepts/concepts-weighted-word-counts.html)

1. Retrieve candidates using projected linguistic text, an exact/canonical index, and word/character recall paths. Tag IDs, long attributes, first-token truncation, and short/CJK segments must not prevent a good candidate from reaching the scorer.
2. Adapt Pro's lexical scorer as the initial implementation and calibrate it against the fixture corpus. Base fuzzy similarity on text alignment, including word order and character evidence; do not retain serialized markup as lexical content or simply increase all scores.
3. Compute separate, explicit adjustments for case, punctuation, substantive formatting differences, unsafe code mismatches, resource penalties, and ambiguous translations. Charge each difference once: do not subtract an adjustment already represented in the lexical score. Cosmetic tag-ID changes with proven equivalent structure receive no lexical penalty. Missing tags/placeholders remain visible risks.
4. Return `rawScore`, `effectiveScore`, `matchKind`, adjustment reasons, resource provenance, tag compatibility, and candidate-search completeness. Use the effective score consistently in suggestions, pretranslation thresholds, statistics bands, and reports.
5. Require text plus compatible known structure for 100%. Require explicit valid neighbor/boundary context for the context category. A document name, position, or key alone cannot prove context; missing legacy metadata means exact at most. Do not add a 102%/PerfectMatch category without its own implemented semantics.
6. Keep canonical normalization for retrieval separate from exact-match eligibility. Case, punctuation, numbers, and meaning-changing placeholders must not disappear into a misleading exact match.
7. Deduplicate identical source/target candidates by the highest effective score, then deterministic resource priority and tie-breaks. Merge provenance. A newer lower score must not replace a better score. Distinct target translations remain inspectable.
8. Prove one-to-one code remapping before adapting stored targets. Unknown/missing/duplicated codes disable automatic application even when textual similarity is high. Preserve current tag QA and delivery validation.

Trados documents separate formatting penalties and other adjustments; this supports an explicit penalty model instead of treating tag syntax as ordinary text. Final LoopCAT defaults should be calibrated and documented, not labeled vendor defaults. [RWS TM penalties](https://developers.rws.com/studio-api-docs/apiconcepts/projectautomation/setting_tm_penalties.html)

Bundle the same pure scorer into the UI and worker. Their complete results, including adaptation and differences, must agree. Version and rebuild the TM indexes with recoverable migration; do not rewrite original TM entries or historic reports. If search is capped or times out, expose **Incomplete analysis** and retry/expand it. An unsearched candidate is not evidence of “No match.”

## 5. Statistics calculation and scope

### Scope and inclusion

Support **Project**, **Current file**, **Selected files**, and **Selected segments**. Each request resolves to an immutable set of document/segment IDs and revisions. Reject mixed-project or deleted IDs explicitly. No selected segments means a disabled action with a reason, not fallback to the whole project.

Add checkbox selection and Shift-range selection to the virtualized editor, with keyboard support, a visible selected count, **Select filtered segments (N)**, and Clear selection. That action selects every filter-matching row, not only the currently rendered viewport. Keep active editing and selection separate. Retain explicit selections across filtering while showing how many are hidden; the statistics summary identifies the actual set. Capture selected IDs when opening/running the dialog so subsequent navigation cannot silently change a report.

Default to **All source content** in the selected scope, regardless of translated status. Offer **Remaining work** using unconfirmed segments and explain that definition. Additional advanced status filters use only real stored states. Display included and excluded counts. Locks remain included by default; an explicit **Exclude locked content** option should reuse the existing pretranslation lock guard (`locked`, `isLocked`, `readOnly`, `readonly`, or locked status). A blocked review flag is not a lock. Keep genuinely nontranslatable extraction exclusions separate from user-locked translatable content.

Use all lookup-enabled project TMs with the correct language direction by default; expose a selectable subset, priority, and penalties in Advanced. TM selection/priority/penalty overrides here apply only to this report and are clearly marked; persistent project settings remain a separate action. TMs with lookup disabled remain excluded unless explicitly selected for an analysis-only override. Never bypass resource access restrictions. With no TM, counts and repetitions still work and the UI says “No TM selected.”

### Exclusive workload categories

Each included segment contributes its entire source word count to exactly one workload category:

| Category | Classification |
| --- | --- |
| Context | Verified context-exact result with no disqualifying adjustments. |
| 100% | Exact reusable match under the selected penalty policy. |
| Repetitions | An eligible later occurrence of the same canonical source within scope, when no higher-priority exact/context category applies. |
| 95–99%, 85–94%, 75–84%, 50–74% | Best usable effective fuzzy match. |
| New / no match | No eligible result at or above 50%, after a complete search. |
| Incomplete | Search or source interpretation could not establish a reliable category. |

Keep a context badge distinct from numerical adjustments: a penalized context result can belong to a fuzzy band. Define one integer score quantization rule in the matcher; the UI and bucket logic must use the same value. Category words and segments must sum exactly to included totals. Percentages use source words, with rounding only for display.

Track `countingComplete` separately from `searchComplete`. A segment with a known word count but unresolved TM search contributes its words to Incomplete. If source interpretation prevents a reliable count, track that segment as pending counting with no invented zero count; show **Known source words — N segments unresolved**, and reconcile the word table to that explicitly partial subtotal. Neither view nor export may call it a complete project total or final quote.

These fuzzy bands align with the default categories documented by Trados. [RWS analysis reports](https://developers.rws.com/studio-api-docs/apiconcepts/projectautomation/generating_the_task_report.html)

Repetition rules:

- The first occurrence is counted normally; subsequent eligible occurrences are repetitions. A four-word sentence appearing three times yields eight repeated words, not twelve. [memoQ repetition example](https://support.memoq.com/hc/en-us/articles/360010378439-What-counts-as-a-repetition)
- Use canonical text plus compatible code structure. Ignore incidental tag IDs, but preserve substantive case/punctuation/placeholder differences unless a named policy explicitly allows them.
- Evaluate within scope, using stable document-manifest order and segment order. References outside selected files/segments do not silently create repetitions.
- Default cross-file repetition detection on for any scope spanning multiple documents, including selected segments; within-file detection remains enabled for single-file scope. Provide an advanced **Count each file independently** choice for separately assigned files.
- Default precedence: context/exact, then repetitions, then fuzzy/new. Offer **Repetitions before exact matches** as an explicit alternative and record it in the report.
- A descriptive “all repeated occurrences” metric may overlap TM categories; keep it labeled and out of the additive workload table.
- Project per-file breakdowns inherit project classification so they sum to the project result. A new standalone file analysis may differ; label it as a separate calculation. memoQ documents the same scope-dependent issue. [memoQ Statistics](https://docs.memoq.com/current/en/Workspace/statistics.html)

Optional **Internal fuzzy reuse** estimates similarity to earlier source segments. Default it off; show an estimated alternative breakdown, using the same scorer, separately from existing TM leverage. Do not write hypothetical translations into a TM or count the estimate twice. This is useful for a single translator but depends on work order and assignment.

### Multi-TM accounting and estimates

Choose the best eligible effective result across selected TMs once per segment. Show which TM supplied the winning match. Per-TM winning contributions are additive; independent “coverage if this TM alone were used” results are explicitly non-additive. Exclude empty/invalid target units and retain ambiguity warnings.

Keep **source words**, **weighted words**, and **estimated cost** distinct. Weighted words are optional: `sum(category source words × agreed category weight)`. Default weights to 100% until a user chooses a named rate profile; do not invent a commercial discount as a standard. Add optional price per weighted word and currency in Advanced. Round money only at the stated final calculation step. Optional tag effort is a separately labeled adjustment and never changes the raw linguistic word count.

A saved quote snapshot records source/TM revisions, resource selection, penalties, scope, order, counting/matching versions, rate profile, timestamp, and completeness. Save a baseline before translation; later TM growth must not rewrite the original quote. Preserve the computed rows/totals for repeatable display and export. Recomputing against an old TM revision additionally requires an archived copy of that TM; revision labels alone cannot reconstruct it. Current leverage is a fresh analysis, not proof of the match originally used during translation. Reuse existing provenance where available; post-translation billing reconciliation is a separate later feature.

## 6. Popup design

Use one accessible, resizable-in-layout native `<dialog>` that feels like a separate Statistics window on both Web and Desktop. Target approximately 1040 px wide on a laptop, constrained to the viewport; full-screen layout on narrow displays. Do not introduce a second Electron renderer/database owner merely for this feature.

Open it from the project toolbar, file actions, editor selection actions, and command palette. Project entry defaults to Project; file entry to Current file; selection entry to Selected segments. Persist view/detail preferences but always make the current scope explicit.

```text
Statistics                                    [Simple | Advanced]  [Close]
Scope [Project v]       20 files · English → Turkish
All source content · 2 TMs · cross-file repetitions on

Source words       New words       Repeated words       TM-covered words
12,400             4,100           1,300                7,000

Category                         Source words            %
Exact and context                     3,000           24.2
Fuzzy matches                         4,000           32.3
Repetitions                           1,300           10.5
New / no match                        4,100           33.1
Total                                12,400          100.0

Calculated just now · Complete
[Calculate again]                  [Save snapshot] [Export v]
```

Illustrative numbers only; rounding can make displayed category percentages differ slightly from 100%.

**Simple** shows the scope, raw source words, four clear categories, selected-TM summary, and result freshness. Expanding fuzzy matches reveals the four familiar bands without switching views. No weighted estimate appears until weights have been configured. Counts appear promptly; a TM run shows progress separately. An incomplete run has a visible extra category and cannot masquerade as a finished quote.

**Advanced** keeps the same result and adds tabs for **Breakdown**, **Files**, **TMs**, and **Settings**. Include segments, words, characters, tags, word percentages, optional weighted counts, per-file totals, TM contribution, exclusions, repetition policy, internal-fuzzy estimates, and calculation versions. A category can drill down to its segments; a match inspector explains “text similarity, adjustments, final score” and highlights actual text/code differences. Returning to Simple does not reset options or recompute.

Use existing LoopCAT colors, spacing, localization, RTL support, and keyboard conventions. Provide a dialog title, focus trap/return, Escape close, accessible tables, visible busy/cancel controls, and an `aria-live` completion summary. Do not communicate match bands by color alone. Dirty settings show **Recalculate needed**; changed project/TM data show **Out of date**, retaining the previous result until a new complete snapshot is ready.

Exports: UTF-8 CSV with project and per-file breakdowns, escaped spreadsheet-sensitive cells, a printable HTML report, and versioned JSON for reproducibility. Use the same snapshot for all outputs. By default include counts/settings, not segment text. Preserve existing Quality Passport/research reporting and add access to the new statistics report without conflating their metrics.

## 7. Technical boundaries and persistence

Proposed modules under the existing feature architecture:

- `src/features/linguistics/`: projection, source metrics, canonical structure, matching policy; pure functions with fixtures.
- `src/features/import-export/`: batch coordinator and queue presentation, adapting the existing document importer and progress controller.
- `src/features/statistics/`: scope resolver, analysis job, category aggregator, snapshot repository, dialog, and export controller.
- `src/features/editor/`: stable-ID segment selection integrated with the existing virtualized grid and active editor state.

Keep `project-tm-match-service.js` as the orchestration boundary. Adapt `tm.js`, `cat-worker.js`, `worker-client.js`, `analysis.js`, project progress/summary consumers, and application composition to shared policies. Avoid building a second independent reporting scorer.

An analysis request contains project generation, scope IDs/revisions, ordered files, selected TM IDs/revisions, options, and engine versions. Capture a consistent input snapshot or detect revision changes and mark the run stale; never silently combine different generations. Worker jobs receive bounded chunks, report progress, allow cancellation, and publish atomically only when still current.

Cache per-segment counts by source/descriptor/language/profile; match results additionally depend on context, TM generations, penalties, and scorer version. Repetition classification additionally depends on scope/order. Target/status edits invalidate only the metrics they affect unless they also save into a selected TM. Imported/deleted files, split/merge, TM updates, and setting changes invalidate the corresponding results.

Add IndexedDB report/receipt metadata through the established ownership/journal layer. Plan explicit migrations from the current database version 8 and package/backup versions 6/7 if new persisted fields/stores require them. Old projects must open without analysis metadata; new caches rebuild lazily. Saved reports need deliberate backup/package support with size limits and schema validation. Live jobs and worker handles must never be serialized.

Keep snapshot retention bounded, with user-saved quote baselines retained until explicitly removed. Use resource revision counters/content generations rather than filenames or timestamps alone for invalidation. Existing source/target/reconstruction data remains authoritative during migration or index rebuild.

## 8. Checkpoints and acceptance gates

| Checkpoint | Deliverables | Gate before proceeding |
| --- | --- | --- |
| A — contracts and regression corpus | Projection/scoring adapters, expected count rules, scope/result contracts, current defect fixtures, Pro reuse inventory. | Hand-reviewed expected outputs for tags, languages, placeholders, repetitions, and multi-TM cases; no unproven vendor-parity label. |
| B — batch import | Review queue, 50-file/100-MiB limits, atomic per-file receipts, cancellation/retry, one batch guard, reduced refreshes. | 20 mixed supported files and 50-file boundary; corrupt file does not lose successful files; edited targets, restore, and reconstruction preserved. |
| C — matcher/counting foundation | Shared worker/local scorer and counter, safe adaptation, candidate recall, penalties, context fix, dedup fix, versioned index migration. | Golden counts; editor/pretranslation/statistics query parity; tag regressions resolved; no unsafe exact/context upgrades. |
| D — scoped analysis | Multi-selection, exclusive buckets, resource-aware jobs, repetitions, incomplete-state handling, snapshots/cache. | Exact accounting invariants across project/file/selection and repeated runs; canceled/stale jobs never replace a valid result. |
| E — finished Statistics | Simple/Advanced popup, drilldown, optional weights/cost, saved baselines, CSV/HTML/JSON export, localized UI. | Keyboard/RTL/zoom checks, report/UI equality, migration/backup round trips, browser and packaged desktop performance evidence. |

Important regression scenarios:

- Import: 0/1/20/50/51 files; mixed uppercase extensions; duplicate names and identical content; unsupported/corrupt middle file; empty document; encoding overrides; exact size limits; cancel during parse/commit; retry after reload; quota/ownership loss; pending unsaved editor text; subsequent original-format export.
- Counts: plain/tagged equivalence; formatting inside a word; opaque placeholders; literal HTML-looking text; ICU branches; entities; DOCX hidden instructions; punctuation-only and tags-only rows; apostrophes/hyphens/numbers; CJK/Thai/Arabic/mixed scripts; language/profile changes.
- Matching: long tag attributes, changed tag IDs, safe versus unsafe code structures; punctuation/case/number/negation changes; distinct translations; penalized duplicate ordering; disabled/wrong-direction/empty-target TMs; real versus false context; worker fallback parity; short and long segments.
- Retrieval: compare indexed top results against exhaustive scoring on a tractable test corpus, including cases past the existing 24-token/600-candidate limits. Exhaustive scoring validates retrieval recall; vendor comparisons separately validate calibration.
- Analysis: three identical four-word segments with no TM produce 12 total words, 8 repetition words, 4 new words; a selected scope containing only one occurrence has no in-scope repetition. Reordering changes assignment predictably, not total source words. Per-file breakdowns and exclusive buckets reconcile exactly.
- Quotes: save a report, translate/add TM entries, rerun, and confirm the baseline remains unchanged. Incomplete TM search is never exported as an unqualified final quote; an explicitly labeled partial report is permitted.

Performance validation uses a recorded reference machine and both browser and packaged desktop. Initial targets, to verify rather than claim as achieved: warm counts for 10,000 segments within 1 second; 95th-percentile interactive TM lookup within 250 ms on a 100,000-unit TM; full analysis of 10,000 segments against that TM within 30 seconds; progress at least once per second and responsive cancellation. Include a larger stress case, memory/storage measurements, and chunk-size tuning. Keep full analysis off the main thread and avoid repeated whole-project/TM cloning.

Run targeted unit/integration tests at each checkpoint, then repository lint/type/build/import-boundary checks and relevant browser, accessibility, storage/recovery, format round-trip, and packaged-desktop checks. Publish actual measurements and known limits. Do not claim memoQ/Trados numerical parity without running the same bilingual fixtures/TMs, segmentation, versions, settings, and penalties in those applications and recording the differences.

## 9. Scope of this delivery

The requested release includes robust multi-file import, corrected counting and matching, scoped Simple/Advanced Statistics, multi-TM analysis, repetitions, saved reports, and optional weighted estimates. Internal fuzzy estimates belong in Advanced and may be enabled after their correctness/performance gate passes.

Defer team assignment, invoicing, server collaboration, native detached windows, PerfectMatch/document-alignment features, and full post-translation billing reconciliation. They are separate products or depend on evidence/data not currently present. The only optional input still useful for calibration is a real source/TM pair that produced a surprising score; the demonstrated regressions already permit implementation to begin.
