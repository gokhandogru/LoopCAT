# Batch import, matching, and Statistics — implementation

Implemented 11 October 2026. The original design is in [the implementation plan](batch-import-statistics-matching-plan-2026-10-11.md).

## User workflows

- Select up to 50 mixed supported source files, at most 100 MiB combined. Review formats, sizes, encoding, duplicate names and identical contents. Duplicate copies are unchecked until explicitly selected. Existing importer archive expansion and format validation remain active.
- Files commit independently through the existing journal, with SHA-256 import receipts in the same project mutation. Ordinary parse failures do not stop later files. Cancellation retains committed files; failed/canceled rows can be retried. Reselecting files after a restart detects already committed content using receipts. Browser file handles and unfinished parsing jobs are not persisted.
- Open Statistics from the project toolbar, editor file/selection controls, or command palette. Choose Project, Current file, Selected files, or Selected segments. Editor checkboxes support Shift range selection; filtered selection includes off-screen rows.
- Simple shows source words, segments, files, exclusive workload categories, and expandable fuzzy bands. Advanced exposes per-file breakdowns, winning TM contributions, segment drilldown, penalties/priority, status/lock/repetition rules, weights and optional price/currency. Internal fuzzy reuse is explicitly an estimate.
- Save a baseline, or export CSV, printable HTML, or versioned JSON. Reports contain counts and settings, not source/target segment text. Up to 20 saved snapshots / 10 MB of serialized snapshot metadata are allowed per project; saved reports are never automatically discarded.

## Counting and matching

`linguistic-core.js` adapts Loopcat Pro's source projection, counting and scoring domain to a dependency-free shared renderer/worker module. `statistics-core.js` owns scope, exclusive classification, repetition precedence, report generation, and exports.

Counts use source-language `Intl.Segmenter` word and grapheme boundaries. Recognized formatting and placeholders do not contribute words; internal formatting does not split a word. Internal apostrophes/hyphens and numeric separators join adjacent word spans. ICU choice branches count their translatable text. Plain-text formats retain literal markup-looking text. Importers already decode document XML, so counts do not decode it again. Unknown markup produces an unresolved count, a known-word subtotal, and an incomplete report, rather than a fabricated final quote.

The matcher compares linguistic text and protected structure separately. A formatting-only difference receives a one-point explained adjustment rather than edit distance over tag attributes. Proven equivalent DOCX formatting IDs can remap safely; unknown or incompatible code structures disable automatic insertion/pretranslation. Resource penalties and ambiguous translations are explicit. Duplicate source/target results retain the best effective score and merge provenance. Context requires real neighbor/boundary evidence; document position alone is insufficient.

Statistics, editor suggestions, and background project analysis use the shared scorer. The TM index version changes with the matcher and rebuilds lazily; indexed retrieval includes an exact-text key, words, and character bigrams. Statistics uses exhaustive scoring up to 2,000 candidates; larger heuristic searches remain visibly incomplete unless an eligible exact result is decisive. Advanced offers a complete-search option. Computation runs in a separate cancelable worker with progress and revision checks. Incomplete reports can be exported with their warning, but cannot be saved as final quote snapshots.

The category bands follow common CAT conventions. Numerical parity with a particular memoQ/Trados version or configured word-count profile has **not** been established. These tools use their own configurable counting and penalty policies; this implementation must not be marketed as reproducing their proprietary percentages exactly.

## Persistence and compatibility

Snapshots (`schemaVersion: 1`) and bounded receipts are optional project metadata; no new object stores or IndexedDB version change is required. Existing schema-8 databases and schema-6 project packages/schema-7 backups retain these fields. Validation rejects malformed/oversized report metadata. Older projects simply have no reports/receipts. Matching indexes are disposable and rebuilt by their own version marker. Stored quote values remain unchanged when sources or TMs subsequently change; recomputing against an old TM still requires its archived contents.

## Validation evidence

- Full unit suite: 1,533 passing tests, including tag/count regressions, worker parity, best-score deduplication, ambiguity, scopes, repetition totals, selection, receipt replay, cancellation-before-commit, and 50/51-file/byte boundaries.
- Production Electron workflow (`node scripts/verify-statistics-workflow.cjs`, after renderer build): 20 mixed HTML/JSON/TXT files committed; 80 source words, 76 repeated words; one persisted baseline and 20 receipts. Corrupt JSON followed by a valid TXT produced one failure and one success. Adding that file changed the live report to 83 words while the saved baseline stayed 80.
- Portable backup export, validation and restore preparation preserved the baseline and all receipts; a malformed negative-count snapshot was rejected.
- Statistics dialog passed axe WCAG A/AA serious/critical checks. Styled desktop and narrow RTL screenshots were inspected. The verification script uses a separate temporary profile, not the user's projects.
- Type checking, lint, style checks, import boundaries and production renderer verification are part of the final check set.

## Measured limits and release follow-up

A cold full no-TM analysis of 10,000 unique six-word segments took 4.923 seconds in Node 24.19.0 on this Windows host, including contexts, character/tag metrics, per-row report generation, and yielding. This is not the original one-second warm-count target. The 100,000-TU/10,000-segment target and packaged cross-platform performance envelope have not been certified; exhaustive large-TM searches can be slow. Indexed searches expose their completeness and can be expanded rather than labeling unsearched content as new words.

UI strings use LoopCAT's localization boundary and English fallback. Complete translated catalogs and vendor-specific benchmark corpora remain separate release validation work. No release installers, downloadable bundles, or public deployment were produced by this change.
