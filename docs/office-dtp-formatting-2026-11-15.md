# Office and DTP formatting preservation — 15 November 2026

This follow-up repairs the formatting-loss paths identified in the [file-format review](file-format-review-2026-11-15.md). The implementation and tests are in the development checkout. The checks cover original-format import/export, source-copy delivery, translated delivery, and reconstruction after serializing project metadata.

## Result and verification scope

Word, Excel and PowerPoint fixtures were created in **Microsoft Office 16.0, build 20527.20196** on Windows, imported through LoopCAT's browser filters, exported as both unchanged and Turkish-translated documents, and reopened in the corresponding native application. Native formatting properties were compared with the source. Word/Excel were rendered to PDF and PNG; PowerPoint was rendered to PNG. All three source-copy renders had **zero changed pixels**.

IDML/ICML verification uses a packaged fixture with designmap, stories, spreads, styles, graphics, font information, links and nested content. It checks XML/property and package preservation, including a translation that reorders differently styled runs. **InDesign is not installed on this host, so native IDML rendering and overset-text validation remain unverified.**

These results establish preservation for the tested structures. Text expansion can still alter line wrapping, pagination or frame fit; retaining a font, style and frame geometry does not guarantee that every longer translation fits the original layout.

## Implementation

### Word

`docx.js` now retains the original DOM structure for paragraphs with mixed wrappers and structural markers. Protected identities associate target text with the original runs and containers instead of flattening a paragraph into newly created runs.

- Hyperlinks and relationships, nested content controls, bookmarks, comment/field boundaries, typed breaks, drawings and nested text boxes remain attached to their content.
- Exact run properties survive, including font family/size/color, double underline, complex-script settings and explicit non-bold formatting beside bold text.
- Inserted-revision metadata is retained. The established delivery policy for deleted revisions is unchanged: deleted text is excluded/removed during changed delivery.
- Field result text stays between its field separator and end, and text runs stay after paragraph properties even when source XML contains indentation whitespace.
- A source-copy export returns the original package bytes; safe unchanged parts are not needlessly serialized.

### Excel and PowerPoint, including Office package variants

`localization.js` builds a rich-text map from the original native containers. Protected run identities refer to existing runs and formatting; opaque markers preserve structural elements such as breaks, fields and nested objects.

- Excel shared strings and inline strings retain rich run fonts, colors, sizes and emphasis. Cell styles, number formats, formulas, hyperlinks, merged cells, row/column dimensions and package relationships are retained.
- Multilingual Excel uses the existing target cell's rich formatting when present. A new target cell can retain source rich formatting. Phonetic annotations are retained on unchanged copies and removed from changed strings when they would describe obsolete source text.
- PowerPoint text keeps run properties, paragraph/bullet properties, hyperlinks, fields and shape/container metadata. Table text uses the same precise reconstruction.
- Nested text boxes are applied before containing paragraphs so parent reconstruction cannot detach their translations.
- Run reordering within a safe native parent moves the original formatting with the text. Reordering across structural barriers is rejected.
- Copy-source delivery preserves original bytes for the tested generic Word, Excel and PowerPoint packages.

Chart caches, SmartArt text, master text and embedded documents are not newly extracted by this change. Their package parts remain preserved. The new guarantee concerns the text LoopCAT actually imports, rather than extraction of every possible Office object.

### IDML and ICML

- Simple styled paragraphs retain distinct identities for their original CharacterStyleRange nodes. Reordering red/blue or otherwise different runs keeps each run's styles, colors, sizes and properties with its translated text.
- Complex paragraphs update precise Content text nodes rather than recreating their surrounding structure. Tables/cells, anchored objects/images, hyperlinks, footnotes, breaks, tabs, processing instructions and literal CDATA remain intact.
- Significant boundary whitespace is preserved.
- Source-copy IDML retains the exact original ZIP bytes; source-copy ICML retains the exact original XML.
- Duplicate, missing, stale, fractional, overlapping or out-of-range mappings fail explicitly rather than silently modifying the wrong object.

## Existing-project compatibility

Existing simple and supported legacy mappings continue to work. Unchanged legacy source copies are preserved. Previously imported rich Office segments whose metadata cannot identify the original formatting boundaries require reimport before an edited original-format export. This prevents guessing how a translation should be divided among native styles or wrappers.

Protected formatting chips must remain in the target. Missing, duplicated, unknown or illegally reparented chips are rejected. Translators can reorder styles where the native structure permits it; structural boundaries such as fields, bookmarks or anchored objects constrain movement.

## Test evidence

| Verification | Coverage |
| --- | --- |
| Native Word | Unchanged and translated DOCX reopened; font properties, hyperlinks, fields, bookmarks, paragraphs, tables, shapes, header, margins, table width and page count compared. |
| Native Excel | Unchanged and translated XLSX reopened; rich character fonts, values, formulas, number formats, fill/borders, alignment, wrapping, merged cells, column widths, row height, hyperlinks, worksheets and print area compared. |
| Native PowerPoint | Unchanged and translated PPTX reopened; rich character fonts, shape geometry/fill/line, slide dimensions, bullets, hyperlinks and table text compared. |
| Visual equality | Source-copy Word, Excel and PowerPoint renders: zero changed pixels. Translated renders inspected for retained formatting and visible content. |
| Word focused fixtures | Mixed wrappers, nested content controls/hyperlinks, fields, nested drawings/text boxes, whitespace, exact run properties, legacy field order and native-source reconstruction. |
| OOXML focused fixtures | Rich Word variants/Excel/PowerPoint, style movement, barriers, nested text boxes, multilingual target/source templates, malformed tags and legacy behavior. |
| IDML/ICML focused fixtures | 20 preservation and rejection checks, including all non-Content XML nodes/attributes and unedited package parts. |
| Existing format coverage | Existing 22-extension Office/OpenDocument/publishing suite and multilingual Excel parser verification. |

Evidence is written under ignored `test-artifacts/office-formatting/`:

- `native/source/`, `native/copy/`, `native/translated/`: actual native-created Office documents and LoopCAT exports.
- `native/*-source.json`, `native/*-copy.json`, `native/*-translated.json`: native property snapshots.
- `native/roundtrip-results.json`, `native/verify-results.json`, `native/visual-results.json`: machine-readable results.
- `native/visual-comparison.png`: source/translation comparison; full page/slide renders in `native/renders/`.
- `idml-rich-source.idml`, `idml-rich-target.idml`, `idml-rich-reordered.idml`, `idml.json`: IDML test artifacts and checks.
- `ooxml-agent/results.json`, `unit.log`, `portable.log`, `native-run.log`, `browser.log`: supporting checks and integration logs.

Final verification results:

- **8 Word**, **8 OOXML**, and **20 IDML/ICML** focused checks passed on this host.
- **6 native Office reopen/formatting comparisons** passed (source-copy and translated DOCX/XLSX/PPTX).
- All three native source-copy outputs were byte-identical to their originals; their rendered comparisons had **0 changed pixels**. Translated packages changed only `word/document.xml` plus the translated header, `xl/sharedStrings.xml`, or `ppt/slides/slide1.xml`, respectively; all other package parts were byte-preserved.
- The full **1,730-test unit suite** passed with no failures or skips.
- All **nine browser suites** passed, including regression, application workflow, workspace storage, package round trip and large project.
- `verify:office-formatting`, `verify:office-formatting:native` and the expanded `verify:file-formats` all passed.
- TypeScript, targeted ESLint and `git diff --check` passed.

The native runner prefers PowerShell 7 after the legacy Windows PowerShell host stalled during Office startup on this machine. The final end-to-end native run used the bundled PowerShell 7 host successfully.

## Reproduction

Portable browser/XML/ZIP checks:

```powershell
pnpm verify:office-formatting
pnpm verify:file-formats
pnpm test:unit
pnpm verify:browser-runner
```

Native verification, on Windows with Word, Excel, PowerPoint, Poppler and Python/Pillow available:

```powershell
pnpm verify:office-formatting:native
```

`LOOPCAT_PYTHON` and `LOOPCAT_POWERSHELL` can select interpreters. The runner also recognizes the Codex bundled Python/PowerShell runtimes and an installed PowerShell 7. The existing isolated-browser flag `LOOPCAT_BROWSER_RUNNER_NO_SANDBOX=1` can be used on test hosts that need it; production application settings are not changed.

The native runner creates dedicated fixtures, opens those fixtures and their exports, and closes its own documents. It does not open user projects or save changes to unrelated Office documents. It preserves an already-running Office application's lifetime and alert settings.
