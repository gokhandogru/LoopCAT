# LoopCAT file-format review — 15 November 2026

**Follow-up:** the [Office/DTP formatting repair and native verification](office-dtp-formatting-2026-11-15.md) supersedes the generic Office run-flattening and mixed-wrapper limitations recorded in this initial review. It adds native Word/Excel/PowerPoint checks and stronger IDML structural verification; InDesign rendering remains unverified.

This review covers the development checkout, not previously published installers. It inventories all 55 document extensions offered by the import picker plus resource exchange and portable project formats, fixes observed data-loss defects, and adds repeatable tests using actual browser XML parsers and ZIP reconstruction. Tests use generated fixtures and isolated storage; they do not open user projects.

## What “supported” means here

LoopCAT has separate **document translation**, **translation-memory/terminology**, and **project/package** paths. Importing a TMX as a document preserves its original multilingual structure; importing it into a TM converts it to normalized bilingual records. Those are different contracts. “Export original format” requires the original reconstruction data retained by the project. TXT, bilingual DOCX and generic XLIFF are additional delivery/review outputs.

Passing fixtures demonstrate the tested structures and error handling. They do not certify every vendor extension, native-application visual layout, embedded object, macro, schema dialect, or arbitrary file in the format. Unsupported features and extensions are listed below.

## Document support matrix

All listed extensions have an import path and an original-format export path. The tests exercise translation followed by export and re-import, plus relevant preservation assertions.

| Family | Extensions | Verified behavior and qualification |
| --- | --- | --- |
| Word | `.docx` | Main document, tables, headers, footers, footnotes, endnotes, comments, inline formatting and literal entities; unrelated ZIP parts retained. Native Word rendering still requires visual qualification. |
| Other Word packages | `.docm`, `.dotx`, `.dotm` | Package text round trips and unrelated parts retained. Uses the general OpenXML filter, not the richer primary DOCX filter. |
| Excel | `.xlsx`, `.xlsm`, `.xltx`, `.xltm` | Shared/inline strings, relationship-selected sheets, Excel escapes, phonetic annotation exclusion, formula/nontext preservation. Multilingual column mode additionally verifies selected source/target cells, blank targets, sparse columns, worksheets, styles and persisted mappings. |
| PowerPoint | `.pptx`, `.pptm`, `.ppsx`, `.ppsm`, `.potx`, `.potm` | Slides and notes, Unicode translation, ZIP entries and unrelated parts. Rich text can flatten within a translated text container. |
| OpenDocument | `.odt`, `.ott`, `.ods`, `.ots`, `.odp`, `.otp` | Text content and package round trips, inline XML and namespaces, unchanged package members. Complex fields/layouts are not comprehensively qualified. |
| XLIFF | `.xlf`, `.xliff`, `.sdlxliff` | XLIFF 1.2, 2.0/2.1/2.2 Core; original inline IDs/native codes, whitespace, locked units, SDL segmented markers and target reconstruction. Generated XLIFF 2.2 also checked against the bundled Core XSD. |
| TMX documents | `.tmx` | Selected language pair, exact/unique-base-language matching, existing targets/status, inline codes, other variants, metadata, packages/reopening and source updates in existing workflow verification. |
| Gettext | `.po`, `.pot` | Contexts, comments, flags, existing plural slots, placeholders, multiline values, obsolete records and target reconstruction. Declared legacy encoding and UTF-8 fallback headers checked. |
| Other bilingual XML | `.ttx`, `.txml` | Common source/target and Tuv forms, inline codes, target creation, language ordering and unrelated variants. Full proprietary vendor compatibility is not certified. |
| Web markup | `.html`, `.htm`, `.xhtml` | Block text, mixed inline markup, HTML direct text and translatable attributes; XML namespaces and nested attributes; scripts and opted-out content. HTML export uses UTF-8 declarations. |
| Markdown | `.md`, `.markdown` | Headings, paragraphs, lists, quotes, links and preserved front matter; fenced/indented code excluded. Tables, image-only alt text, link-reference titles and front-matter values are not extracted. |
| JSON | `.json` | Nested objects/arrays, root strings, exact dotted/bracketed keys, Unicode and non-string preservation; invalid paths rejected. Generic JSON translates every string value; it is not schema-aware. |
| YAML | `.yaml`, `.yml` | Simple block mappings/sequences, quoted/plain scalar strings, literal/folded blocks, comments, numeric/boolean exclusion and newline handling. Flow collections, anchors, aliases, tags, multiline quoted/plain scalars and some YAML-specific escapes fail explicitly; this is not a full YAML parser. |
| Delimited files | `.csv`, `.tsv` | Recognized key/source/target headers, comma/semicolon/tab detection, quoted multiline fields, Unicode, empty targets and untouched columns. Unterminated quotes reject. Without recognized headers, the existing heuristic treats column 2 as source when present; review the import. |
| Android XML | `.xml` with `resources` root | Strings, arrays, existing plural quantities, translatable flags, resource references, inline namespaces, literal CDATA and apostrophe escaping. It does not generate missing target-language plural categories or run Android resource compilation. |
| Generic XML / publishing XML | `.xml`, `.dita`, `.xini`, `.wix` | Meaningful text, selected translatable attributes, inline XML/namespaces, literal text and opt-outs. Uses heuristics, not a schema-specific filter for every XML vocabulary. |
| Apple strings | `.strings` | Multiple entries per line, comments, Unicode escapes, literal backslashes, target quoting and whitespace. `.stringsdict` and `.xcstrings` are not supported filters. |
| Java resources | `.properties` | Escaped keys, whitespace/colon/equal separators, continuations, leading spaces, Unicode escaping and preserved comments. |
| .NET resources | `.resx` | String resource values; numeric/binary/typed non-string data preserved rather than translated. |
| Qt Linguist | `.ts` XML | Existing plural/length variants, placeholder context, obsolete/vanished exclusion, unfinished states and malformed XML rejection. Empty plural structures require initialization in Qt Linguist. |
| Code resource strings | `.php`, non-XML `.ts` | Quoted literals and reconstruction, with PHP resource keys/comments excluded and quote/interpolation escaping. Not a full PHP/TypeScript parser; heredoc/nowdoc, templates and complex expressions are unqualified. |
| DTD | `.dtd` | Internal general-entity string values and XML-safe output escaping; external/parameter entities untouched. |
| InDesign/InCopy | `.idml`, `.icml` | Story/Content text, safe style grouping, preserved breaks/style distinctions and unrelated ZIP content. InDesign visual layout/overset text needs native checking. |
| FrameMaker | `.mif` | Basic String-record translation and surrounding markup retained. Complex MIF escapes and native FrameMaker compatibility remain unqualified. |
| Subtitles | `.srt`, `.vtt`, `.sbv` | Cue text, identifiers/timing/settings, multiline Unicode; WebVTT notes/styles/regions preserved; malformed timing/header checks. No reading-speed, overlap or player-rendering certification. |
| Plain text | `.txt` | Paragraph reconstruction, separators and UTF-8/UTF-16/supported single-byte encodings. |

## Resources and portable formats

| Path | Import | Export | Qualification |
| --- | --- | --- | --- |
| Translation memories | TMX | TMX; resource CSV/TSV where provided by the resource library | Correct language selection and Unicode/CDATA; normalized bilingual entries, not an archival copy of native TMX inline codes/properties. |
| Terminology | TBX, CSV, TSV, XLSX | TBX, CSV, TSV | Selected language pairs, synonyms, concept IDs, term status, independent notes/examples; XLSX terminology import uses the first worksheet and supports selected columns. There is no XLSX glossary export. |
| TBX versions | Common v2 `martif` and v3 `tbx` structures | Consistent v2-style `martif` envelope | LoopCAT custom metadata is retained. Full ISO/TBX-Basic/TBX-Min dialect schema conformance is not asserted. |
| Projects / workspaces | Existing LoopCAT JSON/archive packages and backups | Corresponding package/backup formats | Reconstruction metadata must travel with segments. Existing package/recovery browser suites cover these independently of source-format filters. |
| Review / alternate delivery | — | Target TXT, target DOCX, bilingual DOCX, generic XLIFF 1.2/2.2, reports | These are alternate artifacts; they do not reconstruct an arbitrary original PDF, legacy Office file or DTP document. |

## Defects repaired in this review

- XLIFF 1.2 exports could replace native inline identities and lose SDL segmentation; round trips now retain the original code/segment mapping.
- TMX/TBX resource parsing could select unrelated language variants, import commented records or damage CDATA literals. Selection/validation and text extraction are corrected; TMX timestamps and the TBX v2 export envelope are corrected.
- DOCX literal entities could be decoded twice around styled text. General Excel filters could miss relationship-named worksheets, include phonetic annotations and mishandle `_xNNNN_` escapes. Package mismatches and invalid mappings are rejected.
- Properties continuation lines/whitespace separators, Apple string escapes, PHP keys/comments/quote handling, DTD entity quoting, RESX non-string selection and Qt plural/length variants are corrected.
- SRT/VTT/SBV parsing preserves non-cue metadata and rejects malformed inputs more reliably.
- HTML omitted mixed text/attributes. XML nested attribute translations could be written to detached nodes. Literal CDATA and namespaced inline markup reconstruction are corrected.
- Markdown mixed/short code fences could expose code for translation. YAML block whitespace and unsupported constructs, JSON path safety and unterminated delimited fields receive explicit handling.
- PO charset declarations now follow the output bytes after encoding fallback. HTML charset declarations and delivery MIME types are corrected.

## Remaining boundaries and priorities

1. **Native visual qualification:** use representative client DOCX/XLSX/PPTX/ODF/IDML/ICML files in their authoring applications. Synthetic ZIP checks cannot establish layout, line wrapping, field behavior or overset-text fidelity. General OpenXML filters can flatten run styling and do not extract every chart, SmartArt, drawing or embedded document.
2. **Plural and vendor semantics:** PO/POT preserves existing slots/fuzzy flags without generating the target language's plural rules or clearing fuzzy. Qt needs pre-existing plural slots. SDL workflow/review metadata, arbitrary XLIFF 1.2 annotations/custom elements and all proprietary TTX/TXML/XINI dialects are not fully mapped.
3. **Unsupported common inputs:** PDF/OCR, RTF, legacy binary `.doc`/`.xls`/`.ppt`, `.xlsb`, raw `.indd`, `.stringsdict`, `.xcstrings`, `.resw`, `.wxl`, `.arb`, `.mqxliff`, `.mxliff`, `.sdlppx`/`.sdlrpx`, `.mqout`/`.mqback`, `.xlz`, `.xliff.zip` and archive batches have no dedicated accepted import path. Use a qualified conversion or appropriate exchange export before importing; changing an extension alone does not prove compatibility.
4. **Encodings:** UTF and supported single-byte encodings are preserved when representable; other encodings or unrepresentable targets become UTF-8. Automatic detection is heuristic. Unicode fallback is tested, but arbitrary codepage identification is not guaranteed.
5. **Resource and XML schemas:** glossary imports normalize records; generic XML, MIF and code-literal extraction remain format subsets. TBX custom fields need recipient-tool compatibility checks. General JSON includes non-UI strings unless the user supplies a resource-only file.

## Reproduce verification

```powershell
pnpm verify:file-formats
pnpm test:unit
pnpm verify:browser-runner
```

On hosts where the existing Electron test renderer cannot launch under its sandbox, the repository runners support `$env:LOOPCAT_BROWSER_RUNNER_NO_SANDBOX = '1'` for isolated fixture execution. This does not change production app settings.

`verify:file-formats` runs the new text/web, Office, glossary, bilingual and software-resource checks, existing multilingual Excel parser/workflow checks, TMX document workflow, and XLIFF 2.2 XSD validation. Generated review output/logs are under ignored `test-artifacts/file-formats/`; fixture browser profiles are isolated under `tmp/`.

Verified checks:

- Full unit suite: **1,730 passed, 0 failed, 0 skipped**.
- Text/web filter review: **27 real-browser cases passed**, including negative cases and reordered attributes/nested opt-outs.
- Office/publishing review: **22 extensions passed** parser/export/re-import and ZIP-preservation checks.
- Glossary review: both XLSX import routes, CSV/TSV round trips, formula/phonetic/escape handling and malformed input checks passed.
- Bilingual review: **27 real-browser checks passed**; software XML review: **7 cases passed**, including older saved RESX/Qt mappings.
- Existing multilingual Excel parser and complete production-renderer workflow passed.
- Existing TMX document workflow passed: import/review, export, source update, packages, backup, reload and accessibility.
- Bundled and generated XLIFF 2.2 documents passed Core XSD validation.
- Full browser runner: **all nine suites passed** — reliability, security policy, offline shell, smoke, regression, application workflow, workspace storage, package round trip and large project.
- Aggregate `pnpm verify:file-formats` command passed end to end (invoked as `node scripts/verify-file-formats.cjs` with the host test-renderer flag).
- TypeScript, targeted ESLint/Prettier, i18n validation, import boundaries, renderer-build verification and `git diff --check` passed.

The first integrated run exposed a missing translation for a new error and an SRT error-message compatibility issue; both were repaired before the passing rerun. This host also required the documented renderer flag in the existing TMX workflow runner; its opt-in flag handling was aligned with the other fixture runners. No installer/release publication is included in this review.

## Reference standards used for edge cases

- [YAML 1.2.2 specification](https://yaml.org/spec/1.2.2/) — folding, indentation and chomping semantics; supports the explicitly limited YAML contract above.
- [Android string resources](https://developer.android.com/guide/topics/resources/string-resource) — resource references, plural resources and resource-string escaping.
- [Java Properties](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Properties.html), [PHP strings](https://www.php.net/manual/en/language.types.string.php), and [Qt TS schema](https://doc.qt.io/qt-6/linguist-ts-file-format.html) — resource escaping, continuation and plural/byte-node behavior.
- [TBX v3 versus v2](https://www.tbxinfo.net/tbx-version-3-vs-version-2/) — distinction between the `martif` and `tbx` envelopes; export dialect limits remain explicit.
- Bundled XLIFF 2.2 Core XSD: `tests/schemas/xliff-2.2/xliff_core_2.2.xsd`.
