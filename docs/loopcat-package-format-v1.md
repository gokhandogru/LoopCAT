# LoopCAT Project Package Format v1

LoopCAT project packages are portable JSON files with the `.loopcat.json` extension. They are the stable handoff format between browser storage, workspace folders, future cloud sync, and a future hosted LoopCAT backend.

## Goals

- Preserve a complete local translation project.
- Keep the format readable, versioned, and backend-compatible.
- Allow older CatHan packages to be imported and re-exported as LoopCAT.
- Keep secrets and browser-only handles out of packages.
- Make validation results explicit before import, export, sync, or handoff.

## Top-Level Object

Required fields:

- `app`: Must be `"LoopCAT"` for new exports. Older `"CatHan"` packages may be imported as legacy packages.
- `type`: Must be `"project-package"`.
- `version`: Package contract version. Current value: `1`.
- `schemaVersion`: Project-package schema version. Current version: `5`. Current accepted range for package import: `3` through `5`; packages from newer schemas must be opened with a newer LoopCAT build. This contract is validated independently from the workspace-manifest version and from any future local-only storage schema.
- `exportedAt`: ISO timestamp for package creation.
- `packageMetadata`: Metadata about the package and storage mode.
- `project`: Project metadata and settings.
- `segments`: Ordered segment records.

Optional fields:

- `resources`: Embedded translation memory and termbase entries.
- `resourceReferences`: Lightweight list of linked resources.
- `sourceAssets`: Source document availability and structure preservation summaries.
- `activityEvents`: Import, export, QA, AI, and editing activity records.
- `validationReports`: Validation output captured at export time.

## Package Metadata

Required fields:

- `format`: Must be `"loopcat-project-package"`.
- `packageVersion`: Must match `version`.
- `contractVersion`: Must be `"loopcat-package-v1"`.
- `generator`: Human-readable generator name.
- `storageMode`: `"browser-cache"` or `"workspace-folder"`.

Workspace-folder saves may also add:

- `packagePath`
- `savedAt`

## Project

Required fields:

- `id`: Stable project ID.
- `workspaceId`: Stable workspace ID, local or cloud.
- `ownerId`: Stable owner/user ID, local or cloud.
- `name`
- `sourceLang`
- `targetLang`
- `creatorName`: Editable display name for the person or machine profile that created the project.
- `creatorOrigin`: Optional origin hint such as `manual`, `desktop-hostname`, `imported`, or `legacy`.
- `documents`: Array of source document manifest entries.
- `resourceLinks`: Array of linked TM/TB resources.
- `qaSettings`
- `aiSettings`
- `qualityProfile`
- `createdAt`
- `updatedAt`

`aiSettings` may include provider, model, source-sharing consent, context toggles, and style instructions. It must not include API keys, tokens, authorization headers, or other secrets.

`qualityProfile` may include the review standard, review depth, risk tolerance, terminology strictness, AI disclosure stance, audience, and tone used by the Quality Workbench and Quality Passport exports. It must not include client secrets, API keys, provider traces, or credentials.

Legacy packages may still contain `academicMetadata`; current LoopCAT builds ignore and strip that field during local saves, package exports, backups, and workspace writes.

## Source Reconstruction Metadata

Projects may include source-backed reconstruction metadata so target exports can rebuild the original file structure instead of producing simplified text.

Recommended project-level fields:

- `docxStructure`: Legacy single-DOCX reconstruction metadata.
- `docxStructures`: Map of document ID to DOCX reconstruction metadata for multi-file projects.
- `localizationStructures`: Map of document ID to localization reconstruction metadata.

`docxStructures` entries may include the original DOCX package encoded as `docxPackageBase64` plus Word text-part and paragraph metadata.

`localizationStructures` entries vary by format:

- XLIFF, HTML, and Android XML may store original source XML/HTML text in `source`. Imported XLIFF target-file export requires this `source` data so unit structure, XLIFF 2.x extensions, and untouched content are preserved. XLIFF structures also record `version` and `namespace`.
- JSON may store the parsed source object in `sourceJson`.
- YAML, Markdown, and iOS `.strings` may store original line arrays in `sourceLines`.
- PO/POT store original source lines for `msgstr` reconstruction, and SRT stores original source text plus per-cue timing metadata.
- CSV/TSV may store parsed rows and delimiter metadata. Rows are arrays of source-file cell text, so headers or cells named like `prompt`, `password`, `accessToken`, `fileHandle`, or `customEndpoint` remain document content rather than LoopCAT metadata.
- IDML may store the original package as `packageBase64` and the translated story paths in `storyPaths`.

When a localization structure is present, each segment for that document should also keep its segment-level reconstruction mapping, such as XLIFF unit indexes, PO `msgstr` line indexes, SRT cue timing, JSON paths, Markdown/YAML line ranges, delimited row indexes, HTML/XML element indexes, iOS strings line indexes, or IDML story/content indexes. XLIFF 2.x segments additionally keep file, unit, and segment indexes plus stable ids, group path, state, and effective `xml:space`. Delivery export is blocked when required mapping is missing because the app cannot safely place the translated target back into the original file shell.

These fields are allowed in portable project packages because they are required for local target-file reconstruction. They must still pass the privacy rules below and must never contain browser file handles, credentials, or runtime-only objects.

`sourceAssets` is a summary array generated at package export time. It should describe whether the original source/reconstruction data is available, but it is not the authoritative reconstruction data itself.

## Segments

Each segment should include:

- `id`
- `projectId`
- `documentId`
- `index`
- `documentIndex`
- `source`
- `target`
- `status`: `"empty"`, `"draft"`, or `"confirmed"` today; future statuses may be added.
- `createdAt`
- `updatedAt`

Recommended fields:

- `workspaceId`
- `ownerId`
- `documentName`
- `documentType`
- `reviewState`
- `reviewNote`
- `comment`
- `comments`
- `aiSuggestions`
- `revision`
- `tags`
- `structure`

Segment IDs must be unique inside a package. Segment `projectId` values should match `project.id`.

Structured `comments` may include optional `qualityDecision` metadata with `category` and `severity` fields. Current quality categories are `accuracy`, `terminology`, `fluency`, `style`, `locale`, `formatting`, `compliance`, and `review`; current severities are `low`, `medium`, `high`, and `critical`.

## Resources

`resources.tmEntries` embeds TM entries used by the project.

Recommended TM entry fields:

- `id`
- `source`
- `target`
- `sourceLang`
- `targetLang`
- `languagePair`
- `tmName`
- `createdAt`
- `updatedAt`

`resources.terms` embeds termbase entries used by the project.

Recommended term fields:

- `id`
- `sourceTerm`
- `targetTerm`
- `sourceLang`
- `targetLang`
- `languagePair`
- `termBaseName`
- `createdAt`
- `updatedAt`

## Privacy Rules

Packages must not contain:

- OpenAI API keys
- provider API keys
- bearer tokens
- authorization headers
- provider prompt traces
- provider request or response IDs
- custom AI provider endpoints
- browser `FileSystemHandle` objects
- local-only runtime caches that cannot be serialized safely

Browser-only values, such as the optional OpenAI API key in LoopCAT's AI settings panel, must stay in browser storage and never be written into package JSON.

Derived local indexes, such as the persistent TM token index used for faster matching, are not package fields. They are rebuilt from embedded or imported TM entries after restore/import.

Local Trash and Undo/Redo have different portability rules:

- A single-project `.loopcat.json` package contains the active project state and does not include local Trash entries or the in-memory Undo/Redo command stack.
- The current full browser-backup/storage schema is version `6` and includes sanitized `trashEntries` so local deleted items can survive a full-profile backup/restore.
- The bounded Undo/Redo command stack is runtime-only and starts empty after an application restart or restore; durable segment history and Trash records remain available through their own data models.

Before packages and backups are written, LoopCAT defensively removes secret-shaped fields such as API keys, tokens, authorization headers, passwords, AI provider trace fields such as `prompt`, `promptTemplate`, `responseId`, `requestId`, `providerRequestId`, `providerResponseId`, and `customEndpoint`, plus browser-only handle fields such as `fileHandle`, `directoryHandle`, and `workspaceHandle` from exported project, segment, resource, and activity records. Original JSON source reconstruction data under `localizationStructures/<documentId>/sourceJson` is path-aware and preserves source-file keys with those names, including common software-localization keys such as `password`, `accessToken`, and `fileHandle`, because they are real file structure rather than LoopCAT metadata. A `sourceJson` object anywhere else is not treated as reconstruction data and must not bypass privacy stripping or validation. Delimited CSV/TSV reconstruction stores those words as row cell values and preserves them for the same reason. `apiKeyMode` is preserved because it records workflow preference, not a credential.

Project package import validates the complete package for secret-shaped fields, AI provider trace fields outside original JSON `localizationStructures/<documentId>/sourceJson` reconstruction data, and browser-only handle fields outside original JSON `localizationStructures/<documentId>/sourceJson` reconstruction data before writing records. Backup restore validates top-level store shapes, blocks secret-bearing, provider-trace-bearing, or handle-bearing restore files in the UI, and sanitizes records again at the storage layer before replacing local stores.

## Compatibility

LoopCAT v1 accepts:

- New packages with `app: "LoopCAT"` and `format: "loopcat-project-package"`.
- Legacy packages with `app: "CatHan"` for import only.
- Packages whose `schemaVersion` is within the supported range documented above. Workspace-folder recovery and sync listing skip packages from newer unsupported schemas instead of adding them to the manifest.

New exports must always use:

- `app: "LoopCAT"`
- `format: "loopcat-project-package"`
- `.loopcat.json`

## Validation Levels

- `errors`: The package should not be imported or synced.
- `warnings`: The package can be used, but important metadata or content is incomplete.
- `risky`: The package may expose workflow, privacy, or delivery risk.
- `simplified`: Some source structure may not be fully preserved.
- `skipped`: Expected optional content is missing.
- `preserved`: Positive confirmation of preserved content.

The validation report is advisory for exports and blocking for imports when `errors` is not empty.
