# Arabic localization

LoopCAT includes Modern Standard Arabic as the `ar` UI locale, shown as **العربية** in the workspace language selector. Regional requests such as `ar-SA` and `ar-EG` resolve to this catalog. The UI language is independent of a project's source and target languages.

## Translation sources

- `i18n/source.en-US.json`: authoritative English messages, context and placeholders.
- `i18n/locales/ar.json`: editable Arabic translations and RTL metadata.
- `src/i18n/locale-loader.js`: bundled locale registration and lazy loading.
- `docs/beginner-guide/ar.html`: Arabic in-app Beginner Guide, included in offline assets.

The Web ZIP contains generated `chunks/ar-<hash>.js` files. Edit the JSON catalog in the source checkout and rebuild; chunk names and JavaScript formatting change between builds. Desktop menu and save/recovery dialog strings are generated from the same catalogs into `desktop/ui-catalogs.json`.

```sh
pnpm i18n:extract
pnpm i18n:sync
# Translate new empty values in i18n/locales/ar.json.
pnpm i18n:validate
pnpm i18n:compile
pnpm verify:quality
pnpm verify:arabic
pnpm dist:web
```

Arabic validation rejects missing or blank entries and changed placeholders. Existing locales continue to use English fallback for new untranslated messages.

## Writing conventions

Use Modern Standard Arabic, natural sentence order, and consistent terminology:

| English | Arabic |
| --- | --- |
| Segment | مقطع |
| Source / target | المصدر / الهدف |
| Translation memory | ذاكرة ترجمة |
| Termbase | قاعدة مصطلحات |
| Pre-translation | ترجمة أولية |
| Quality assurance | ضمان الجودة |
| Confirmed | مؤكَّد |
| Draft | مسودة |

Preserve product names, model identifiers, URLs, shortcuts, format identifiers and placeholders. Do not translate project names, source/target text, terminology entries, comments, or model output automatically.

ICU plurals use Arabic's `zero`, `one`, `two`, `few`, `many`, and `other` categories. Older generated messages with English suffix arguments use `select` to consume those arguments without displaying English suffixes. Label-and-count formulations avoid incorrect Arabic inflections.

`localizeValues` in source metadata is reserved for placeholders containing application-generated messages, such as save status. It must not be applied to user content. Newly written code should prefer complete messages with explicit named arguments over concatenated sentence fragments.

## RTL behavior

- The UI root has `lang="ar"` and `dir="rtl"`; layouts use logical spacing and alignment.
- Source and target cells determine direction independently. Editing language metadata follows the project.
- Protected tag labels are isolated as LTR so a leading tag does not override Arabic text direction. Stored text is unchanged.
- Inspector tabs and resize handles follow the visual arrow direction in RTL.
- Arabic language names, including names entered with diacritics, resolve in language inputs.
- Diacritics remain attached to words during predictive completion and quick term capture. QA recognizes Arabic-Indic and Eastern Arabic-Indic digits, decimal/grouping separators, and Arabic question marks while still detecting changed numeric values.
- Arabic target DOCX paragraphs receive `w:bidi` and Arabic proofing language metadata. Bilingual exports localize interface headings while preserving source and target content.

The DOCX implementation follows [Microsoft's paragraph direction documentation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bidi) and [language metadata documentation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.languages).

## Verification

`pnpm verify:arabic` runs the production renderer in a hidden Electron window with a disposable profile and synthetic project. It writes screenshots, exported sample DOCX files, and a machine-readable report to `test-artifacts/arabic/`.

The audit covers empty and populated projects, resources, resource policies, the editor and every inspector tab, command palette, help/about/diagnostics dialogs, and all bundled AI provider settings. It checks 1440, 1024, and 768 CSS-pixel layouts, 200% zoom, light/dark editor views, untranslated visible UI text, horizontal page overflow, and clipped controls. Product names, API syntax and synthetic project content are explicitly distinguished from interface text.

Functional checks cover locale persistence and switching, RTL keyboard navigation and resizing, Arabic text with diacritics and mixed Latin/numeric content, leading protected tags, exact autosave preservation, and DOCX round trips. An axe WCAG 2.2 AA scan runs on the Arabic editor. Unit tests cover catalog completeness, placeholders, all Arabic plural categories, composed messages, language input normalization, and native menu/dialog localization.

External provider responses, operating-system-owned dialogs, and bundled third-party documentation retain the language supplied by their authors. The automated audit does not substitute for testing every operating system, screen reader, or external AI service.
