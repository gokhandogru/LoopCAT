# LoopCAT

LoopCAT is a local-first browser CAT tool MVP. It runs as static HTML, CSS, and JavaScript and stores project data, segments, translation memory entries, and termbase entries in IndexedDB.

## How to Install

Download LoopCAT from the [LoopCAT v0.0.2 release](https://github.com/gokhandogru/LoopCAT/releases/tag/v0.0.2). Use the release assets below instead of GitHub's automatic source-code ZIP:

- Web version: download [`LoopCAT.Web.0.0.2.zip`](https://github.com/gokhandogru/LoopCAT/releases/download/v0.0.2/LoopCAT.Web.0.0.2.zip), extract it, and open `index.html`. For installable offline PWA behavior, serve the extracted folder from a local or hosted HTTP/HTTPS origin; direct `file://` opening still runs the app, but browsers do not allow service-worker installation from local files.
- Windows desktop installer: download [`LoopCAT.Windows.Setup.0.0.2.zip`](https://github.com/gokhandogru/LoopCAT/releases/download/v0.0.2/LoopCAT.Windows.Setup.0.0.2.zip), extract it, and run `LoopCAT Setup 0.0.2.exe`.
- Windows portable desktop: download [`LoopCAT.0.0.2.Portable.zip`](https://github.com/gokhandogru/LoopCAT/releases/download/v0.0.2/LoopCAT.0.0.2.Portable.zip), extract it, and run `LoopCAT 0.0.2.exe` without installing.

The release also includes [`LoopCAT.0.0.2.SHA256SUMS.txt`](https://github.com/gokhandogru/LoopCAT/releases/download/v0.0.2/LoopCAT.0.0.2.SHA256SUMS.txt) so you can verify the downloaded ZIP files.

### Connect LM Studio with TranslateGemma 4B

1. Install [LM Studio](https://lmstudio.ai/) and download or import a TranslateGemma 4B model, such as a `translategemma-4b-it` GGUF build. Google's [Gemma with LM Studio guide](https://ai.google.dev/gemma/docs/integrations/lmstudio) describes using LM Studio's model downloader or importing a local GGUF file, and Google's [TranslateGemma announcement](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/) describes the 4B, 12B, and 27B translation model family.
2. In LM Studio, load the TranslateGemma 4B model, open the `Developer` tab, and start the local server. LM Studio documents its [OpenAI-compatible base URL](https://lmstudio.ai/docs/developer/openai-compat) as `http://localhost:1234/v1` when the server runs on port `1234`.
3. If you use LoopCAT in the browser/PWA build, enable CORS for the local LM Studio server, or start it with `lms server start --port 1234 --bind 127.0.0.1 --cors`. LM Studio's [`lms server start` docs](https://lmstudio.ai/docs/cli/serve/server-start) note that CORS is off unless enabled and that `127.0.0.1` keeps the server on localhost; keep it bound to `127.0.0.1` unless you intentionally want another device on your network to reach it.
4. In LoopCAT, open `AI Command Centre`, choose provider preset `LM Studio local`, keep base URL `http://localhost:1234/v1`, leave the API key empty for local loopback use, then click `Test connection`.
5. Click `Refresh models`, choose the exact model ID shown by LM Studio, confirm the project source and target languages, then run `Pre-translate`. LoopCAT marks generated text as AI-initiated and leaves it ready for human review.

## License

LoopCAT is released under the Apache License 2.0. Copyright 2026 Dr. Gokhan Dogru. See `LICENSE` and `NOTICE` for the license text and attribution notice.

## MVP Scope

This first version is intentionally focused on a reliable editing loop:

- Create and reopen local projects.
- Use a Projects view to browse many projects across different language pairs.
- Choose project and resource languages from bundled offline language/locales plus recent language-pair shortcuts while LoopCAT stores normalized codes for TM, termbase, package, and AI matching.
- Open a project into a file dashboard before entering the translation editor.
- Review file-level word counts, segment counts, and progress inside each project.
- Keep saved file records visible even when a file has no editable segment rows.
- Normalize saved file-type metadata so package/import casing differences do not break export.
- Manage translation memories and termbases from a dedicated Resources area.
- Search projects and filter by language pair.
- Import `.docx` files and extract translatable text.
- Import Other formats, including modern Office package variants, OpenDocument files, HTML/XHTML/Markdown, XLIFF/SDLXLIFF/PO/TTX/TXML/XINI, IDML/ICML/MIF/DITA, CSV/TSV/XML/DTD/JSON/YAML, PHP/properties/TS/RESX/WiX/strings, SRT/VTT/SBV, and TXT.
- Decode text-based imports with BOM, charset-declaration, auto-detection, or manual override for UTF-8, UTF-16, Windows code pages, ISO-8859 families, Shift_JIS/EUC-JP, GB18030/Big5, and EUC-KR; eligible text exports preserve UTF and single-byte legacy encodings when the target text can be represented safely.
- Keep inline tags, placeholders, and variables visible as short protected copyable chips while translating, including semantic labels such as `<b>` and `<i>` for bold and italic markup; complex Word runs keep hidden style ids so exact DOCX reconstruction metadata is not flattened.
- Keep several imported documents inside one project.
- Delete projects or individual files after an in-app confirmation prompt.
- Filter the editor by document.
- Segment source text into editable translation units, with DOCX import protection for common academic abbreviations and initials.
- Edit target segments in a CAT-style grid.
- Use native browser/Electron spellcheck in target segment editors, with the desktop wrapper syncing spellcheck to the active project target language where the runtime supports it.
- Choose the LoopCAT interface language from the Workspace menu, including built-in English and Turkish, import custom UI translation JSON, and export the English UI source catalog for translators.
- Keep bounded per-segment target revision history for post-editing review.
- Search and filter segments while translating, including AI-generated pretranslations, AI suggestions, and risk-ranked AI review comments. AI-pretranslated rows display as `AI initiated`; confirming one clears `Needs review` while keeping the AI origin visible.
- Search by source, target, or both, with optional regex and case-sensitive matching.
- Move directly to the next open segment.
- Copy source into target for segments that should be carried over.
- Pretranslate empty segments from TM matches above a chosen percentage.
- Run concordance search from the current TM with Ctrl+K or Alt+K on selected source text.
- Show protected placeholders as inline tag chips.
- Insert protected placeholders into target segments.
- Prevent confirming a segment when protected placeholders are missing.
- Run QA checks for empty targets, missing tags, copied source, number mismatches, punctuation mismatches, and termbase usage, with severity, fix hints, counts, filtering, and jump-to-issue navigation.
- Configure a project quality profile for the review standard, review depth, risk tolerance, terminology strictness, AI disclosure stance, audience, and tone.
- Use the Quality Workbench to calculate a risk queue from QA issues, review comments, AI review risk, AI-initiated drafts, revision density, confirmation state, terminology strictness, and profile settings, then jump to the next highest-priority segment.
- Classify active-segment quality decisions with LQA-style categories such as accuracy, terminology, fluency, style, locale, formatting, compliance, and review.
- Block delivery exports when target segments are still empty or protected tags/placeholders are missing.
- Merge with the next segment or split the active segment when the source format can be reconstructed safely, such as unstructured text or compatible DOCX paragraph segments.
- Autosave segment changes locally, retrying transient background save failures and keeping queued edits pending if a forced save flush fails.
- Request persistent browser storage when available, estimate local storage usage, and warn in the Workspace menu if storage remains best-effort or nearly full.
- Confirm segments and save them to a local translation memory.
- Mark segments as needs review, reviewed, or blocked; filter by review state; and save reviewer notes, structured comments, and category-backed quality decisions.
- Show exact and fuzzy TM matches for the active segment.
- Add local termbase entries and show terms found in the active source segment.
- Mark target terms as forbidden and block delivery exports when forbidden terminology appears.
- Import/export TMX and TBX with termbase notes preserved, and import CSV/TSV/XLSX terminology lists.
- Preview, edit, export, import, and delete TM/TB resources across language pairs.
- Normalize direct TM and termbase saves/imports so malformed or incomplete resource rows are rejected before they can be stored, fail closed on incomplete direct resource lookups, and reject incomplete TMX/TBX exchange metadata before parsing or export.
- Export/import a project backup.
- Restore full browser backups by replacing the backed-up stores and rebuilding derived indexes.
- Export/import a single portable LoopCAT project package with validation warnings.
- Reject malformed, unknown, or duplicate TM/termbase resource links in project packages and backups before import or restore.
- Normalize malformed legacy local project resource links, document manifests, and identity fields on update/startup so older browser-cache projects still open with a usable label, language pair, main TM, termbase, and file list while new project saves still require a name plus source and target languages.
- Open newly imported project files immediately so the translator lands on the file they just added.
- Show validation reports for project packages, export readiness, and backup restore checks.
- Review project analysis for progress, repetitions, TM leverage, untranslated segments, review flags, and comments.
- Export offline project reports with terminology status tables for approved and forbidden terms.
- Export a Quality Passport HTML report with the project quality contract, quality score, post-editing effort estimate, risk queue, quality category breakdowns, QA evidence, review/AI evidence, and export-readiness notes while omitting segment text.
- Export anonymized offline project reports for research documentation.
- Include target revision counts in offline project reports while keeping segment text out of the report.
- Track local activity events for imports, exports, QA runs, segment confirmations, review changes, and AI actions, including the actual AI provider used and the configured project provider where they differ.
- Store local workspace/user metadata so projects remain local-first while staying ready for future sync or team ownership.
- Save project-scoped AI settings without sending content unless the user explicitly enables source sharing.
- Store an optional OpenAI API key locally in the browser, outside project packages and backups, only when OpenAI is the selected provider.
- Configure a local-first AI Command Centre for Ollama, OPUS-CAT, and OpenAI-compatible local runtimes, list installed local models or OPUS-CAT model tags, pull `translategemma` for Ollama, test a sample prompt, pre-translate eligible editor segments through the selected provider, review active drafts, request AI tag-repair suggestions for one segment or batches, polish one draft or draft batches, adapt active or batched drafts for clarity, formality, locale fit, or brevity, generate reviewable target alternatives in selectable styles for one draft or batches, apply matching project terminology to active or batched drafts as review suggestions, extract active or batch termbase candidates, generate a reusable project brief, surface AI initiated/suggestion/risk badges directly in the segment grid, clear `Needs review` on confirmed AI-pretranslations, and show project-level AI triage metrics for AI-initiated rows, suggestions, and review risk in analysis and reports.
- Generate OpenAI draft suggestions for the active segment with optional TM, termbase, and style-guide context while explicitly opting out of provider response storage.
- Ignore malformed optional local TM/termbase context before AI request construction and report malformed provider output as an empty suggestion instead of a raw failure.
- Keep user-facing AI suggestions on the real provider path only; production builds do not expose mock AI drafts.
- Redact credential-looking source/target language metadata before project saves, package validation, and external AI prompt construction.
- Export the current target text as a simple `.txt` file.
- Export the current project as XLIFF 1.2.
- Export imported Other formats target files back through their original structure, including package-preserving Office/OpenDocument/DTP exports and text/XML/resource/subtitle formats.
- Validate direct localization export format labels and segment lists before building target files.
- Preserve literal source-file keys and cells that look like private metadata, such as JSON keys or CSV/TSV headers named `prompt`, `password`, `accessToken`, or `fileHandle`, while still stripping real app secrets and AI provider traces from packages and backups.
- Export XLIFF with protected inline markup for handoff, with direct export metadata validated before a handoff file is built.
- Export imported XLIFF files back into their original unit structure, with delivery blocked if the required source reconstruction data is missing.
- Export a target `.docx` from the original DOCX package.
- Keep delivery exports bound to the selected document so a mixed project cannot silently export a different file.
- Export a bilingual review `.docx` with segment status, reviewer notes, structured comments, and QA summaries.
- Install as an offline-capable web app when served locally or wrapped in a desktop shell.

## Deliberately Deferred

These are not part of the robust MVP yet:

- Perfect reconstruction for every complex feature in DOCX/OpenXML/OpenDocument/DTP files. The app preserves original packages and rewrites mapped text in-place, but very deep layout constructs such as SmartArt, unusual embedded objects, advanced spreadsheet rich-text runs, complex nested fields, and untested publisher-specific structures still need fixture coverage.
- Optional offline spellcheck language-pack management and QA spellcheck dictionaries beyond native browser/Electron spellcheck.
- Persistent inverted-index tables and chunked indexing for very large TMs.
- Server sync, collaboration, or cloud storage.

## Architecture

The code is split by responsibility so the app can grow without becoming one large script:

- `index.html` defines the static UI shell.
- `manifest.webmanifest` and `service-worker.js` define the installable offline app shell.
- `scripts/build-web.cjs` creates the static HTML distribution ZIP in `dist-web/`.
- `scripts/opus-cat-web-bridge.cjs` is the optional local bridge for using OPUS-CAT from the plain web `index.html` build when the browser blocks OPUS-CAT's direct local HTTP response.
- `i18n.js`, `i18n/source.en-US.json`, and `i18n/locales/*.json` own UI internationalization for the app shell and generated interface text; compiled `*.js` catalog files are bundled so the static app still works offline and from local files.
- `scripts/i18n-extract.cjs`, `scripts/i18n-sync.cjs`, `scripts/i18n-validate.cjs`, and `scripts/i18n-compile.cjs` maintain the source catalog, create target locale files, validate placeholders/keys, and compile runtime catalogs. To add a locale, run `node scripts/i18n-sync.cjs --locale ca-ES`, translate `i18n/locales/ca-ES.json`, then run `node scripts/i18n-validate.cjs` and `node scripts/i18n-compile.cjs`.
- `scripts/verify-web-artifact.cjs` verifies the static HTML ZIP, version alignment, checksums, and runtime asset list.
- `scripts/verify-web-smoke.cjs` extracts the static HTML ZIP, serves it from localhost, and checks desktop/mobile rendering, console health, horizontal overflow, and the New project and About dialogs.
- `package.json` and `desktop/main.cjs` define the Electron desktop wrapper for Windows, macOS, and Linux packaging.
- `scripts/verify-release.cjs` checks the offline desktop release contract before packaging.
- `scripts/verify-live-ollama.cjs` optionally checks a real local or hosted Ollama runtime by listing models and running one non-streaming `/api/chat` translation probe with the selected model.
- `scripts/verify-live-ai-provider.cjs` optionally checks a configured hosted AI provider by refreshing models and running one short translation probe without printing API keys.
- `scripts/verify-desktop-wrapper.cjs` checks the desktop `loopcat://app/` protocol allowlist, URL/path safety, and renderer network request allowlist before packaging.
- `scripts/verify-packaged-desktop-smoke.cjs` launches the unpacked packaged desktop app in hidden smoke mode and verifies the bundled app shell renders through `loopcat://app/index.html` with packaged app-shell assets, working IndexedDB, real project/segment persistence, packaged HTML, XLIFF, and target DOCX import/export probes, bilingual DOCX generation, backup export with saved targets, and test pages blocked from the desktop protocol in an isolated temporary profile.
- `scripts/verify-desktop-artifact.cjs` inspects packaged `app.asar` payloads for required runtime files derived from the app shell/service worker/desktop protocol, source-file freshness, integrity metadata, network policy, and accidental test/debug files.
- `scripts/verify-checksums.cjs` checks `dist/SHA256SUMS.txt` against the generated public desktop download artifacts and rejects public artifacts whose filenames do not match the expected LoopCAT release names and current package version or whose file size indicates a truncated/interrupted build.
- `scripts/verify-release-provenance-selftest.cjs` proves the provenance verifier rejects missing `.git`, empty `.git`, invalid worktree gitdir files, missing linked gitdirs, and missing Git executables before Git commands are trusted.
- `scripts/verify-download-artifacts-selftest.cjs` proves the release artifact and checksum verifiers reject unexpected source/debug archives, duplicate public downloads, truncated public downloads, and bad checksum entries.
- `scripts/verify-platform-signatures-selftest.cjs` proves the platform signature verifier rejects unexpected source/debug-like public downloads and duplicate expected artifacts before any signing or notarization tool is trusted.
- `scripts/verify-signing-env-selftest.cjs` proves the signing environment verifier accepts complete Windows/macOS credential sets, rejects partial or whitespace-only sets, keeps Linux checksum-gated, and does not print secret values.
- `scripts/verify-release-evidence.cjs` checks completed clean-machine release evidence for missing results, unresolved placeholders, failed checks, vague release identity, platform-specific artifact-tested choices, and private release details.
- `scripts/verify-release-evidence-selftest.cjs` proves the evidence verifier accepts a completed publishable record and rejects placeholders, vague commit/tag or artifact-source identity, failed signing, not-applicable notarization, online-mode evidence, and secret-bearing notes.
- `.github/workflows/desktop-release.yml` builds downloadable desktop artifacts for Windows, macOS, and Linux.
- `styles.css` contains the application layout and visual system.
- `app.js` wires UI events and coordinates app state.
- `storage.js` owns IndexedDB setup and generic persistence helpers.
- `project.js` owns project and segment operations.
- `docx.js` owns DOCX zip reading, Word XML extraction, and segmentation.
- `localization.js` owns Other formats localization and package filters beyond primary DOCX, including OpenXML variants, OpenDocument, markup, resource, XML, DTP, subtitle, plain-text, and programming-file import/export.
- `qa.js` owns QA checks and terminology validation.
- `validation.js` owns validation report shapes for packages, backup, and export readiness.
- `analysis.js` owns project analysis and TM leverage summaries.
- `ai.js` owns local AI governance helpers, the local provider registry, Ollama/TranslateGemma pre-translation, and the explicit OpenAI suggestion path.
- `worker-client.js` and `cat-worker.js` move TM matching and QA scoring off the UI thread when workers are available.
- `tm.js` owns translation memory storage and fuzzy matching.
- `tmx.js` owns TMX parsing and generation.
- `termbase.js` owns termbase storage and term lookup.
- `tbx.js` owns TBX parsing and generation.
- `xliff.js` owns XLIFF import and generation for project handoff.

`docx.js` keeps DOCX package reading, target reconstruction, bilingual export, and placeholder detection separate from project storage.

The portable project contract is documented in `docs/loopcat-package-format-v1.md`.

The current feature and AI capability inventory is documented in `docs/loopcat-capabilities.md`.

The multi-provider AI plan and research matrix are documented in `docs/ai-provider-integration-research.md`.

The local database also maintains a derived `tmTokenIndex` store for faster TM candidate lookup. It is rebuilt from TM entries and is intentionally excluded from project packages and backups.

## Local AI Command Centre

LoopCAT can pre-translate segments through Ollama, OPUS-CAT MT Engine, OpenAI, DeepSeek, Azure OpenAI, Gemini, Anthropic Claude, Cohere Command, Mistral AI, xAI Grok, Perplexity Sonar, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, Fireworks AI, and OpenAI-compatible runtimes from the AI Command Centre. It defaults to local loopback providers, so source text stays on the machine unless the user intentionally chooses a hosted provider URL and confirms the external send.

Hosted provider API keys are kept only in this browser or tab, scoped to the selected provider and normalized base URL, and never exported with project packages or backups. A saved DeepSeek key is not reused for Gemini, Ollama Cloud, or another hosted provider.

The provider summary in the AI Command Centre shows locality, key requirements, available tools, model and translation endpoints, and a short best-fit guidance line for the selected provider, such as private offline drafting for local Ollama, installed OPUS-MT pre-translation through OPUS-CAT, long-context project briefs for Gemini, or organization-managed deployment workflows for Azure OpenAI.

The `Prompt Test` area can preview and send the exact prompt family for pre-translation, review/QA, tag repair, polishing, adaptation, alternatives, terminology application/extraction, and project-brief generation. Use the prompt type selector before testing a provider so you can see what source, target, project, and terminology context will be sent.

Project analysis and offline project reports include project-level AI triage metrics for AI-initiated rows, segments with AI suggestions, total AI suggestions, AI review risk, and high-risk AI review rows. These report counts stay metadata-only; segment text, prompt traces, and provider responses are not included.

1. Install Ollama for Windows from the official [Ollama Windows download page](https://ollama.com/download/windows). Ollama documents Windows installs as user-directory installs that do not require Administrator rights; model files need additional disk space.
2. Start Ollama, then install a translation-capable model:

   ```powershell
   ollama run translategemma
   ```

   You can also use the AI Command Centre's `Pull model` button for `translategemma`, or enter another local model name such as `translategemma:4b`, `translategemma:12b`, or any model installed in Ollama.
3. Open a LoopCAT project and an imported file.
4. In `AI Command Centre`, keep provider `Ollama` and base URL `http://localhost:11434`. The provider summary should show `Local loopback`, `No API key`, and the `/api/chat` translation endpoint.
5. Click `Test connection`, then `Refresh models`.
6. Select or type `translategemma`.
7. Confirm source and target language names/codes.
8. Choose a translation mode. LoopCAT always skips confirmed or locked segments; existing draft target text is skipped unless overwrite is enabled. Leave `Include nearby segment context` enabled when short UI strings need surrounding context, or turn it off for the narrowest possible prompt.
9. Click `Pre-translate`. LoopCAT sends matched project TM entries, termbase entries, and optional nearby segment context as hints for each segment, writes AI-initiated target text into eligible target cells, and marks it for review.
10. To review an existing draft, click `AI review active segment`. LoopCAT sends the active source and target to the configured provider, returns concise risk-ranked review notes, saves them as an open review comment, and marks the segment `Needs review`.
11. To review multiple drafts, choose a mode such as `selected`, `all visible`, or `all project segments`, then click `AI QA batch`. LoopCAT reviews only segments that already have target text, skips locked or confirmed rows, saves risk-ranked comments only when issues are returned, counts `No issues found.` responses without adding comment noise, and lets you cancel the batch.
12. To repair placeholder or tag mismatches, click `Suggest tag repair`. LoopCAT saves the corrected target as an AI suggestion for review and does not overwrite the current target until the translator applies it.
13. To repair placeholder or tag mismatches across several drafts, choose a mode such as `all visible` or `all project segments`, then click `Repair tags batch`. LoopCAT only sends translated rows with missing protected tokens, skips locked or confirmed rows, saves reviewable AI suggestions, records segment-level failures, and lets you cancel the batch.
14. To align an existing draft with the project brief, terminology, and TM context, click `Polish draft`. LoopCAT saves the polished target as a reviewable AI suggestion without overwriting the current target.
15. To polish several existing drafts, choose a mode such as `all visible` or `all project segments`, then click `Polish drafts batch`. LoopCAT skips locked, confirmed, and empty-target rows, saves reviewable AI suggestions without overwriting current targets, records segment-level failures, and lets you cancel the batch.
16. To reshape an active draft for a specific editing goal, choose an `Adaptation` mode such as simplify/clarify, formalize, locale-adapt, or shorten, then click `Adapt draft`. LoopCAT saves one reviewable AI suggestion without overwriting the current target.
17. To adapt several drafts, choose a mode such as `all visible` or `all project segments`, select the adaptation mode, then click `Adapt drafts batch`. LoopCAT skips locked, confirmed, and empty-target rows, records segment-level failures, and saves review suggestions without overwriting current targets.
18. To compare phrasings, choose an `Alternative style` such as literal/fluent/terminology-strict, formal, concise/UI, locale-adapted, or plain language, then click `Suggest alternatives`. LoopCAT saves the returned alternatives as AI suggestions for review without overwriting the current target.
19. To compare phrasings across several drafts, choose a mode such as `all visible` or `all project segments`, choose an `Alternative style`, then click `Suggest alternatives batch`. LoopCAT skips locked, confirmed, and empty-target rows, records segment-level failures, and saves multiple review suggestions per successful segment without overwriting targets.
20. To enforce existing project terminology on the active draft, click `Apply terms`. LoopCAT sends matching termbase hits plus the active source and target draft, then saves the revised target as an AI suggestion for review without overwriting the current target.
21. To enforce terminology across several drafts, choose a mode such as `all visible` or `all project segments`, then click `Apply terms batch`. LoopCAT skips locked, confirmed, empty-target, and no-termbase-hit rows, saves reviewable AI suggestions without overwriting current targets, records segment-level failures, and lets you cancel the batch.
22. To build terminology while translating, click `Extract terms`. LoopCAT asks the configured provider for concise termbase candidates from the active source and target, skips duplicates in the current termbase, and saves new candidates for human review.
23. To harvest terminology from more context, choose a translation mode such as `all visible` or `all project segments`, then click `Extract terms batch`. LoopCAT processes matching source/target snippets, saves only new term candidates, records segment-level failures without stopping the whole run, and lets you cancel the batch.
24. To prepare reusable context, click `Generate project brief`. LoopCAT uses project metadata, document names, sample segments, and termbase hints to append a concise brief to the existing project style instructions.

Optional live Ollama verification:

- Local Ollama with TranslateGemma:

  ```powershell
  pnpm run verify:ollama-live -- --base-url http://localhost:11434 --model translategemma
  ```

- Direct hosted Ollama:

  ```powershell
  $env:OLLAMA_API_KEY="your-hosted-ollama-key"
  pnpm run verify:ollama-live -- --base-url https://ollama.com --model gpt-oss:120b
  ```

The live verifier uses the same `/api/tags` and non-streaming `/api/chat` shape as the AI Command Centre, checks that the requested model is visible, sends one short translation probe, and never prints the API key.

Optional live hosted-provider verification:

```powershell
$env:OPENAI_API_KEY="your-openai-key"
pnpm run verify:ai-live -- --provider openai --model gpt-5.5

$env:GEMINI_API_KEY="your-gemini-key"
pnpm run verify:ai-live -- --provider gemini --model gemini-3.5-flash

$env:MISTRAL_API_KEY="your-mistral-key"
pnpm run verify:ai-live -- --provider mistral --model mistral-large-latest
```

The hosted-provider verifier currently covers OpenAI, DeepSeek, Gemini, Anthropic, Cohere, Mistral, xAI, Perplexity, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, Fireworks AI, Azure OpenAI, and OpenAI-compatible loopback servers. Its defaults mirror the AI Command Centre presets, but you can pass `--model` for a specific deployment or provider-listed model. It sends the sample source text to the selected provider, checks model listing by default, supports `--strict-model-check` for CI-like probes, and never prints the API key.

Hosted Ollama:

1. In the AI Command Centre, choose provider `Ollama` and click `Use hosted Ollama`, or set base URL to `https://ollama.com`.
2. Add the hosted Ollama API key in `Hosted provider API key`. The key is kept in browser storage only and is never exported with project packages.
3. Click `Test connection`, `Refresh models`, choose a hosted model such as `gpt-oss:120b`, then run `Pre-translate`.
4. LoopCAT asks for confirmation before sending source text to hosted Ollama.

Ollama cloud model through local Ollama:

1. Sign in to Ollama locally and keep the local Ollama runtime running.
2. In `Provider preset`, choose `Ollama cloud model via local Ollama`, or click `Use local cloud model`.
3. Keep base URL `http://localhost:11434` and model `gpt-oss:120b-cloud`, or enter another cloud-suffixed Ollama model.
4. LoopCAT still asks for confirmation because cloud-suffixed Ollama models may be processed through Ollama Cloud, even though the API request first goes to local Ollama.

LM Studio with TranslateGemma 4B or another local OpenAI-compatible server:

1. Install LM Studio, download or import a TranslateGemma 4B model such as `translategemma-4b-it`, and load it in LM Studio.
2. Open LM Studio's `Developer` tab and start the local server. Use base URL `http://localhost:1234/v1` unless you changed the server port.
3. In the LoopCAT desktop app, choose provider preset `LM Studio local`, then click `Start LM Studio server` if the server is stopped; `Test connection` also tries this once automatically for the local LM Studio preset.
4. In a browser/PWA build, start the server from LM Studio with CORS enabled or run `lms server start --port 1234 --bind 127.0.0.1 --cors`.
5. Click `Test connection`, `Refresh models`, choose the exact model ID shown by LM Studio, such as `translategemma-4b-it`, confirm the project source and target languages, and run `Pre-translate`.

### OPUS-CAT MT Engine

1. Install OPUS-CAT MT Engine from the official OPUS-CAT install page, start the engine, and install the source-target OPUS-MT model pairs you need inside OPUS-CAT.
2. In `AI Command Centre`, choose provider preset `OPUS-CAT local`, or choose provider `OPUS-CAT MT Engine`.
3. Keep the OPUS-CAT preset base URL at `http://localhost:8500`. LoopCAT also accepts `http://localhost:8500/MTRestService` and normalizes it to the engine root.
4. Click `Test connection`. LoopCAT automatically tries the configured URL, the standard IPv4/localhost engine addresses on port `8500`, and the compatibility web bridge on port `8502`. It saves the first readable endpoint, so the web build does not need a manual URL change.
5. A CORS-enabled OPUS-CAT engine connects directly from supported browsers. For an older engine whose HTTP API does not expose browser CORS headers, start the included compatibility bridge with `pnpm run opuscat:web-bridge` or `node scripts/opus-cat-web-bridge.cjs`; LoopCAT discovers it automatically at `http://127.0.0.1:8502`.
6. Confirm the project source and target language codes match an installed OPUS-CAT language pair, then click `Refresh models`.
7. Choose `default` or a listed OPUS-CAT model tag, then run `Pre-translate`.
8. OPUS-CAT is a machine-translation pre-translation connector. AI review/QA, tag repair, polish, adaptation, alternatives, terminology extraction/application, and project briefs need an LLM provider.

The browser sandbox cannot launch OPUS-CAT, Node.js, or another local executable from `index.html`. Fully automatic browser connection therefore requires either a running CORS-enabled OPUS-CAT engine or a bridge/launcher that was started outside the browser. The LoopCAT desktop wrapper supplies this compatibility layer internally.

Hugging Face Inference Providers:

1. In `Provider preset`, choose `Hugging Face Inference Providers`, or choose provider `Hugging Face Inference Providers`.
2. Use base URL `https://router.huggingface.co/v1`.
3. Add the Hugging Face token in `Hosted provider API key`.
4. Keep the preset model `openai/gpt-oss-120b:cerebras`, refresh models, or type another model exposed by the Hugging Face router.
5. Click `Test connection`, then `Pre-translate`.
6. LoopCAT sends Hugging Face chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

OpenAI pre-translation:

1. Choose provider `OpenAI`.
2. Use base URL `https://api.openai.com/v1`.
3. Enter a hosted provider API key in the AI Command Centre, or save an OpenAI key in the `Cloud suggestion` section.
4. Click `Test connection`, `Refresh models`, choose an OpenAI model, and run `Pre-translate`.
5. LoopCAT sends Responses API requests with provider-side storage disabled and asks for confirmation before source text leaves LoopCAT.

DeepSeek pre-translation:

1. Choose provider preset `DeepSeek`, or choose provider `DeepSeek`.
2. Use base URL `https://api.deepseek.com`.
3. Enter a DeepSeek API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a DeepSeek model such as `deepseek-v4-pro`, and run `Pre-translate`.
5. LoopCAT sends DeepSeek chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Azure OpenAI pre-translation:

1. Choose provider preset `Azure OpenAI`, or choose provider `Azure OpenAI`.
2. Set base URL to your Azure resource's v1 endpoint, for example `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1`.
3. Enter the Azure OpenAI API key in `Hosted provider API key`.
4. Use `Model name` for the Azure deployment name, such as the deployment you created for `gpt-4.1-nano`.
5. Click `Test connection`, `Refresh models` if your resource exposes model listing, then run `Pre-translate`.
6. LoopCAT sends Azure OpenAI Responses API requests with `store: false`, sends the key in the `api-key` header, and asks for confirmation before source text leaves LoopCAT.

Gemini pre-translation:

1. Choose provider preset `Google Gemini`, or choose provider `Google Gemini`.
2. Use base URL `https://generativelanguage.googleapis.com/v1beta`.
3. Enter a Gemini API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Gemini model, and run `Pre-translate`.
5. LoopCAT sends Gemini Interactions API requests with the API key in a header, not in the URL, disables provider-side interaction storage with `store: false`, and asks for confirmation before source text leaves LoopCAT.

Anthropic Claude pre-translation:

1. Choose provider preset `Anthropic Claude`, or choose provider `Anthropic Claude`.
2. Use base URL `https://api.anthropic.com/v1`.
3. Enter an Anthropic API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Claude model, and run `Pre-translate`.
5. LoopCAT sends Anthropic Messages API requests with the API key in the `x-api-key` header, pins `anthropic-version`, and asks for confirmation before source text leaves LoopCAT.

Cohere Command pre-translation:

1. Choose provider preset `Cohere Command`, or choose provider `Cohere Command`.
2. Use base URL `https://api.cohere.com`.
3. Enter a Cohere API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Cohere model, and run `Pre-translate`.
5. LoopCAT sends Cohere Chat V2 requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Mistral AI pre-translation:

1. Choose provider preset `Mistral AI`, or choose provider `Mistral AI`.
2. Use base URL `https://api.mistral.ai/v1`.
3. Enter a Mistral API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Mistral model such as `mistral-large-latest`, and run `Pre-translate`.
5. LoopCAT sends Mistral chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

xAI Grok pre-translation:

1. Choose provider preset `xAI Grok`, or choose provider `xAI Grok`.
2. Use base URL `https://api.x.ai/v1`.
3. Enter an xAI API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose an xAI model such as `grok-4.3`, and run `Pre-translate`.
5. LoopCAT sends xAI Responses API requests with `store: false`, sends the key in the bearer-auth header, and asks for confirmation before source text leaves LoopCAT.

Perplexity Sonar pre-translation:

1. Choose provider preset `Perplexity Sonar`, or choose provider `Perplexity Sonar`.
2. Use base URL `https://api.perplexity.ai/v1`.
3. Enter a Perplexity API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Sonar model such as `sonar-pro`, and run `Pre-translate`.
5. LoopCAT sends Perplexity Sonar requests to `/v1/sonar` with bearer auth, disables search for CAT-tool translation and AI commands, and asks for confirmation before source text leaves LoopCAT.

Groq pre-translation:

1. Choose provider preset `Groq`, or choose provider `Groq`.
2. Use base URL `https://api.groq.com/openai/v1`.
3. Enter a Groq API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Groq model such as `llama-3.3-70b-versatile`, and run `Pre-translate`.
5. LoopCAT sends Groq chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Together AI pre-translation:

1. Choose provider preset `Together AI`, or choose provider `Together AI`.
2. Use base URL `https://api.together.ai/v1`.
3. Enter a Together AI API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Together model such as `MiniMaxAI/MiniMax-M3`, and run `Pre-translate`.
5. LoopCAT sends Together AI chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

OpenRouter pre-translation:

1. Choose provider preset `OpenRouter`, or choose provider `OpenRouter`.
2. Use base URL `https://openrouter.ai/api/v1`.
3. Enter an OpenRouter API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose an OpenRouter model such as `openai/gpt-4.1-mini`, and run `Pre-translate`.
5. LoopCAT sends OpenRouter chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Hugging Face Inference Providers pre-translation:

1. Choose provider preset `Hugging Face Inference Providers`, or choose provider `Hugging Face Inference Providers`.
2. Use base URL `https://router.huggingface.co/v1`.
3. Enter a Hugging Face token in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a router model such as `openai/gpt-oss-120b:cerebras`, and run `Pre-translate`.
5. LoopCAT sends Hugging Face chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

DeepInfra pre-translation:

1. Choose provider preset `DeepInfra`, or choose provider `DeepInfra`.
2. Use base URL `https://api.deepinfra.com/v1/openai`.
3. Enter a DeepInfra API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a DeepInfra model such as `meta-llama/Meta-Llama-3.1-70B-Instruct`, and run `Pre-translate`.
5. LoopCAT sends DeepInfra chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Fireworks AI pre-translation:

1. Choose provider preset `Fireworks AI`, or choose provider `Fireworks AI`.
2. Use base URL `https://api.fireworks.ai/inference/v1`.
3. Enter a Fireworks AI API key in `Hosted provider API key`.
4. Click `Test connection`, `Refresh models`, choose a Fireworks model such as `accounts/fireworks/models/llama-v3p1-8b-instruct`, and run `Pre-translate`.
5. LoopCAT sends Fireworks AI chat-completion requests with bearer auth in a header, not in the URL, and asks for confirmation before source text leaves LoopCAT.

Troubleshooting:

- If LoopCAT says Ollama is not reachable, start Ollama and test `http://localhost:11434/api/version`.
- If LoopCAT cannot auto-connect to OPUS-CAT, start OPUS-CAT MT Engine and test `http://localhost:8500/MTRestService/ListSupportedLanguagePairs?tokenCode=0`. If that URL works but the plain web build still fails, the engine needs CORS support or the included compatibility bridge.
- If OPUS-CAT model refresh returns no pair-specific tags, install or enable that source-target language pair in OPUS-CAT and check the language codes in LoopCAT.
- If the model is not installed, run `ollama run translategemma` or use `Pull model`.
- `Pull model` applies to local Ollama. OPUS-CAT models are installed in OPUS-CAT. Hosted Ollama, OpenAI, DeepSeek, Mistral AI, xAI Grok, Perplexity Sonar, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, Fireworks AI, and OpenAI-compatible providers list the models exposed by the provider.
- The first response can be slow while Ollama loads the model.
- The first OPUS-CAT response can be slow while the engine loads the selected language-pair model.
- If the PC runs out of memory, use a smaller model tag or close other heavy apps.
- Local AI output is a draft. Review terminology, placeholders, tags, numbers, and tone before confirming segments.
- AI review notes are advisory. They are saved as review comments, never as confirmed corrections.

## Browser Tests

- `test-runner.html` runs the current browser test pages in sequence and summarizes the result.
- `security-policy-test.html` checks the renderer CSP keeps scripts/workers local and narrows external connections to the exact OpenAI endpoints, explicit hosted AI provider origins, Azure resource domains, hosted Ollama, OPUS-CAT loopback, and explicit local AI loopback origins used by the app.
- `offline-shell-test.html` checks service-worker install, core app-shell caching, navigation fallback, and bounded runtime caching.
- `smoke-test.html` checks the broad local editing, resources, import/export, QA, and OpenAI provider-stub flow.
- `regression-test.html` checks schema defaults, analysis, validation, backup shape, forbidden-term export gates, DOCX text boxes plus header/footer/footnote/comment/table/list reconstruction, and localization import/export behavior.
- `index.html#app-workflow-test` checks the real app workflow for project creation, file import, pending segment save flush, backup export, term-list import, and terminology details in offline project reports.
- `pnpm run verify:ai-sidebar-ux` opens the real app shell in Electron and checks the AI Command Centre order for the LM Studio local workflow: connect provider, choose model, pre-translate, then collapsed optional tools.
- `workspace-storage-test.html` checks visible workspace package saves, simulated write-failure rollback behavior, manifest recovery, resource index recovery, unreadable package warnings, and health repair behavior.
- `package-roundtrip-test.html` checks the stable `.loopcat.json` contract, JSON serialization, privacy rules, and package import restoration.
- `large-project-test.html` checks thousands of segments, revision-aware batch saves, indexed TM lookup, QA, validation, visible workspace package save, and full backup metadata.

## Local-First Notes

LoopCAT does not include external CDN links or remote scripts. Imported files are read locally in the browser. Data remains in the browser profile where the app is opened. Local AI pre-translation sends source strings only to the configured loopback provider URL, such as Ollama at `http://localhost:11434`, LM Studio at `http://localhost:1234/v1`, or OPUS-CAT at `http://localhost:8500/MTRestService/TranslateJson`, and does not require an API key. When nearby context is enabled, LoopCAT includes compact previous/next segment snippets in the same provider request; OPUS-CAT receives only the segment text plus language codes because it is a plain MT engine connector. Hosted-provider confirmations explicitly name this context before anything leaves LoopCAT.

Hosted Ollama uses `https://ollama.com` only after the user configures that URL, supplies a hosted key, and confirms that source text may leave LoopCAT. Azure OpenAI uses only Azure resource domains such as `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1` or `https://YOUR-RESOURCE-NAME.services.ai.azure.com/openai/v1` after the user chooses Azure OpenAI, supplies a key, and confirms external source sharing; API keys are sent in the `api-key` header rather than query strings, and Responses requests include `store: false`. DeepSeek uses `https://api.deepseek.com` only after the user chooses DeepSeek, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. Gemini uses `https://generativelanguage.googleapis.com/v1beta` only after the user chooses Gemini, supplies a key, and confirms external source sharing; API keys are sent in headers rather than query strings, and Interactions requests include `store: false`. Anthropic uses `https://api.anthropic.com/v1` only after the user chooses Anthropic Claude, supplies a key, and confirms external source sharing; API keys are sent in the `x-api-key` header with an explicit API-version header rather than query strings.

Cohere uses `https://api.cohere.com` only after the user chooses Cohere Command, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. Mistral AI uses `https://api.mistral.ai/v1` only after the user chooses Mistral AI, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. xAI Grok uses `https://api.x.ai/v1` only after the user chooses xAI Grok, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings, and Responses requests include `store: false`. Perplexity Sonar uses `https://api.perplexity.ai/v1` only after the user chooses Perplexity Sonar, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings, and Sonar translation/AI-command requests disable search.

Groq uses `https://api.groq.com/openai/v1` only after the user chooses Groq, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. Together AI uses `https://api.together.ai/v1` only after the user chooses Together AI, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. OpenRouter uses `https://openrouter.ai/api/v1` only after the user chooses OpenRouter, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. Hugging Face Inference Providers uses `https://router.huggingface.co/v1` only after the user chooses Hugging Face Inference Providers, supplies a token, and confirms external source sharing; tokens are sent with bearer auth in headers rather than query strings. DeepInfra uses `https://api.deepinfra.com/v1/openai` only after the user chooses DeepInfra, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings. Fireworks AI uses `https://api.fireworks.ai/inference/v1` only after the user chooses Fireworks AI, supplies a key, and confirms external source sharing; API keys are sent with bearer auth in headers rather than query strings.

The generic OpenAI-compatible provider is kept for local loopback servers such as LM Studio and for explicitly allowlisted hosted-compatible provider origins. Arbitrary hosted OpenAI-compatible URLs are blocked before key storage, settings persistence, or network requests, and should be added as named provider presets with explicit origin/path allowlists. OpenAI pre-translation uses the exact `https://api.openai.com/v1/responses` endpoint with `store: false`, and OpenAI model refresh uses only `https://api.openai.com/v1/models`. Network calls to external AI happen only when the user explicitly enables an external AI provider and source sharing for a project or confirms a hosted provider action in the AI Command Centre.

The OpenAI helper enforces project-level source-sharing consent, an OpenAI provider selection, and project TM/termbase context toggles before it can call the network. It refuses OpenAI suggestions while the browser reports offline before asking for or saving typed keys or changed AI settings, asks for action-time confirmation that names selected/source text plus optional local TM, termbase, and style context before saving keys or settings, redacts credential-looking project domain, style, local TM, and local termbase context snippets before building the provider request while preserving the active source segment the user chose to send, sends OpenAI Responses requests with `store: false`, times out hung provider requests, reports provider connection failures in plain language, and stores a typed OpenAI key only when the user saves AI settings with OpenAI selected or starts an allowed OpenAI suggestion after those gates pass. The former GPT toolbar shortcut has been removed; use the AI Command Centre or configured provider actions instead.

The browser CSP plus desktop wrapper both narrow external AI access to the exact OpenAI Responses and Models API endpoints used by the app, Azure OpenAI `/openai/v1/models`, `/openai/v1/responses`, and `/openai/v1/chat/completions` on Azure resource domains, DeepSeek `/models` and `/chat/completions`, Gemini `/v1beta/models` and `/v1beta/interactions`, Anthropic `/v1/models` and `/v1/messages`, Cohere `/v1/models` and `/v2/chat`, Mistral `/v1/models` and `/v1/chat/completions`, xAI `/v1/models` and `/v1/responses`, Perplexity `/v1/models` and `/v1/sonar`, Groq `/openai/v1/models` and `/openai/v1/chat/completions`, Together AI `/v1/models` and `/v1/chat/completions`, OpenRouter `/api/v1/models` and `/api/v1/chat/completions`, Hugging Face Inference Providers `/v1/models` and `/v1/chat/completions`, DeepInfra `/v1/openai/models` and `/v1/openai/chat/completions`, Fireworks AI `/inference/v1/models` and `/inference/v1/chat/completions`, hosted Ollama `/api/tags` and `/api/chat`, explicit hosted OpenAI-compatible model/chat paths, explicit loopback Ollama/OpenAI-compatible origins, and local OPUS-CAT `MTRestService` actions on port `8500`. The desktop wrapper also rejects credential-bearing, alternate-port, query-string, fragment, legacy deployment-path, and non-approved OpenAI/Azure/DeepSeek/Gemini/Anthropic/Cohere/Mistral/xAI/Perplexity/Groq/Together/OpenRouter/HuggingFace/DeepInfra/Fireworks/hosted-compatible/OPUS-CAT URL variants, and it does not allow the removed GPT shortcut to open `chatgpt.com` in the system browser.

Project packages, workspace manifests, standalone TMX/TBX resource exports, validation reports and alerts, offline project-report readiness notes, visible project/file/resource labels, confirmation prompts, save/status messages, and browser/workspace backups are sanitized before export or display so API keys, bearer tokens, authorization headers, passwords, session or cookie credentials, credential-looking project/file/resource label metadata, credential-looking record IDs, credential-looking TM/TMX origin metadata, credential-looking project domain metadata, credential-looking termbase notes, credential-looking AI style instructions, and browser-only file/workspace handles are not written into handoff files or surfaced through visible UI text. Credential-looking record IDs are replaced with non-secret local surrogates during portable export so project, document, segment, activity, and AI-suggestion references remain internally consistent. Direct TMX, TBX, CSV/TSV, and XLSX resource imports also redact credential-looking origin or note fragments before saving imported resources locally. The non-secret `apiKeyMode` preference is preserved.
Project, file/document, resource, and AI settings metadata are normalized through allowlists in the project-save layer, document import helpers, direct TM/termbase saves, TMX/TBX import/export helpers, and before package exports, backup exports, report exports, and direct backup restores, so secret-shaped leftovers, abused key-mode values, credential-looking project domain metadata, source/target language labels, source file names, document names, TM/termbase labels, provider labels, model labels, style instructions, custom endpoints, prompt templates, and other non-allowlisted provider metadata are stripped or rejected before they can persist or travel with a project.
Saved AI suggestions are normalized before local segment storage and again for packages and backups: LoopCAT preserves review-useful suggestion text, provider/model labels, status, redacted explanations, and timestamps, while stripping duplicated source text, provider response/request IDs, prompt traces, custom endpoints, and other provider metadata from local and portable records. Activity event details, including drafted project-package and workspace-save activity records, are normalized before local activity storage, and AI activity events are normalized again on export and report generation, so prompt-like summaries, credential-looking activity types, provider trace details, and credential-looking provider/model detail values do not persist locally or travel in project packages, backups, workspace packages, or HTML project reports. Non-AI activity summaries and types are also scrubbed for credential-shaped values before portable/report handoff. Original JSON source reconstruction data is exempt from metadata key stripping only under `localizationStructures/<documentId>/sourceJson`, so source files whose real keys are named `prompt`, `responseId`, `customEndpoint`, `password`, `accessToken`, or `fileHandle` can still round-trip correctly without allowing fake `sourceJson` metadata elsewhere to bypass privacy checks.

Imported project packages and restored backups are validated before they replace local work. Secret-bearing, provider-trace-bearing, handle-bearing, runtime-object-bearing, duplicate-document-manifest, or foreign-project activity packages/backups are rejected, malformed package manifests and backup stores are blocked, and project packages and backups reject orphaned segment document IDs when a project manifest is present. The lower-level restore path still strips secret-shaped, provider-trace, and browser-only handle fields defensively before writing records, and uses one non-secret surrogate map across related stores so direct restores cannot split project, document, segment, activity, or AI-suggestion references while replacing credential-looking IDs.
Backup restore and same-project package replacement flush pending target edits inside the destructive helper path before local stores or project records are replaced. If that flush fails, LoopCAT stops the restore/import and keeps the pending edit queued for retry.
IDML package imports reject unsafe archive entry paths such as absolute paths or `..` traversal, duplicate normalized entry names, malformed ZIP central-directory or local-header ranges, trailing central-directory data after the listed entries, local header name mismatches, and entries that fail CRC integrity validation before the original package is preserved for reconstruction.
Full backup restore replaces restored data and TM index metadata in one atomic local transaction, preserving unrelated app metadata while removing stale TM index markers from the previous local database.

Malformed package or backup JSON is reported through the validation panel and does not leave the file picker stuck or partially restore data.

Damaged project, TMX, TBX, and CSV/TSV/XLSX term-list imports are also caught at the picker boundary. LoopCAT reports the import failure in the validation panel, resets the picker, and keeps existing project data unchanged.
Import, restore, and workspace-folder sync controls are disabled while an import, restore, or sync task is running; overlapping import or sync attempts are blocked before they can mutate project data. The status area reports the active import phase with the file name and file size for long-running imports. Import phases yield back to the browser before heavy parsing, saving, and refresh work so progress can paint on slower machines.
LoopCAT warns before close or reload while an import or restore task is still running.
LoopCAT asks the browser for persistent local storage when that API is available, shows whether storage is persistent or best-effort in the Workspace menu, refreshes the usage estimate after imports and restores, and warns before long projects grow when the browser reports low remaining quota. These warnings do not replace project-package exports or workspace-folder saves; they are an early signal to create a recoverable copy outside the browser profile.
Document imports commit project metadata and imported segment records in one local database transaction, so a failed metadata write cannot leave orphaned imported segments behind.
If project creation succeeds but the optional creation activity log cannot be written, LoopCAT keeps the new project, opens it, reports the activity-log warning separately, and keeps the workspace package dirty for the next save.
If project settings are saved but the optional settings activity log cannot be written, LoopCAT keeps the saved settings, reports the activity-log warning separately, and keeps the workspace package dirty for the next save.
If an import succeeds but the optional project activity log cannot be written, LoopCAT keeps the imported document, resource, or project package, reports the activity-log warning separately, and keeps the workspace package dirty for the next save.
Project-package import activity is recorded on the imported project, and workspace-folder sync runs through the same import busy-state guard as file imports, reports validation notes from imported packages, and refuses to overlap with active imports.
Project-package exports flush queued target edits and revision history into the package before download. If queued edits cannot be saved first, LoopCAT reports the failure and does not start a package download or record export activity. Export history and the matching export activity are recorded only after the browser download handoff succeeds, so a failed download cannot look like a successful portable backup.
If a segment confirmation fails while saving, LoopCAT restores the segment to its previous draft state in the editor and stored project data, then reports the failure in the visible save/status area.
If segment confirmation succeeds but the secondary translation-memory update fails, LoopCAT keeps the segment confirmed, reports the TM-save warning separately, and keeps the workspace package dirty for the next save.
If segment confirmation succeeds but the optional confirmation activity log cannot be written, LoopCAT keeps the segment confirmed, reports the activity-log warning separately, and keeps the workspace package dirty for the next save.
If saving the active segment to translation memory fails, LoopCAT keeps the editor state unchanged and reports the failure in the same visible status area.
If a timed background autosave fails, LoopCAT keeps the target edit pending, reports that autosave will retry, and retries the local save automatically instead of leaving a dead pending timer.
If TM pretranslation fails while applying a batch, LoopCAT restores the affected empty targets in the editor and stored project data instead of leaving unsaved machine-filled text on screen.
If target find/replace fails while saving a batch edit, LoopCAT restores the previous target text in the editor and stored project data.
If review metadata or quick review-state saves fail, LoopCAT restores the previous review state, note, and structured comments in the editor and stored project data.
If sidebar term creation, term suggestion deletion, or TM/termbase resource row saves/deletes fail, LoopCAT reports the failure in the visible status area and leaves the stored terminology or memory record unchanged.
Whole-resource TM and termbase deletion runs as a bulk cleanup instead of a visible row-by-row loop; if that delete fails, LoopCAT reports the failure and leaves the stored resource records intact.
If project or project-file deletion fails, LoopCAT reports the failure visibly, keeps the stored project/file records intact, and preserves flushed target edits before the user tries the delete again. If a project-file delete succeeds but the optional activity log cannot be written, LoopCAT keeps the file deleted, keeps the project marked dirty for the next workspace/package save, and reports the log warning separately.
If an AI suggestion cannot be saved or applied to the target segment, LoopCAT restores the previous suggestion list or target text in the editor and stored project data.
If an AI suggestion is saved or applied but the optional AI activity log cannot be written, LoopCAT keeps the saved suggestion or target text, reports the activity-log warning separately, and keeps the project dirty for the next workspace/package save.
If QA calculation fails, LoopCAT reports the failure and keeps the previous QA results visible; if only activity logging fails, the fresh QA results still render.
If project domain or AI settings saves fail, LoopCAT reports the failure visibly, leaves project metadata unchanged, and does not store a typed API key from a failed AI settings save.
If a typed OpenAI key is present while saving settings for a non-OpenAI provider, LoopCAT saves the project settings, does not store or overwrite the browser OpenAI key, and records OpenAI key storage as not applicable in the local activity detail.
If AI settings and optional local key storage succeed but the AI-settings activity log cannot be written, LoopCAT keeps the saved settings, reports the activity-log warning separately, and keeps the project dirty for the next workspace/package save.
If browser key storage rejects an OpenAI API key write, LoopCAT restores the previous key and rolls back already-written project AI settings instead of leaving a half-saved setup.
If an OpenAI suggestion request cannot save its project AI settings before the external request starts, LoopCAT rolls back the project settings, restores prior key storage, and does not store the typed key.
If an approved OpenAI provider request cannot connect after settings and key storage succeed, LoopCAT keeps the user-approved settings and key, reports the connection failure clearly, and does not create an AI suggestion.
The former GPT toolbar shortcut has been removed from the web and desktop builds. Translator-facing AI actions now run through the AI Command Centre or the configured provider panels, where source sharing, provider settings, and local-first routing are visible before any request is made.
If split or merge fails while saving structural segment edits, LoopCAT restores the previous segment list in the editor and stored project data, including the deleted segment in a failed merge.

Target TXT, DOCX, XLIFF, and Other formats delivery exports are blocked when no segments are available, target segments are still empty, protected inline tags or placeholders are missing, original structure metadata or required reconstruction maps such as package item indexes or subtitle cue timing are missing, malformed reconstruction indexes are present, unsafe HTML including entity-obfuscated or CSS-escaped scriptable attributes is present, or forbidden target terminology appears. Final DOCX, XLIFF target, and localization reconstruction use target text only and do not silently reinsert source text for empty target segments. DOCX and localization exports obey the selected document and show a visible warning instead of silently switching to another file type. Target TXT and generic XLIFF exports also obey the selected document when one is selected; choosing All documents exports the whole project. Bilingual review exports remain available for review workflows and can document empty or untranslated projects, but XML-invalid characters are still blocked so XML-backed delivery files are not corrupted.
If an export download succeeds but the optional project activity log cannot be written, LoopCAT keeps the downloaded file as a successful export, reports the activity-log warning separately, and keeps the workspace package dirty for the next save.

Exported download names are sanitized centrally so project names, language codes, and document names cannot create path-like filenames, Windows reserved device names, control characters, credential-looking label fragments, or other unsafe filename characters.
If a browser or desktop download step fails, LoopCAT reports the export failure in the visible save/status area instead of silently dropping the action. If the browser refuses the temporary download click after an object URL has already been created, LoopCAT removes the hidden download link and revokes that temporary URL immediately.

When opened through a local web server, LoopCAT registers `service-worker.js` and caches the complete application shell for offline browser/PWA use. The service worker fails installation if any core app-shell file cannot be cached, navigation misses fall back to cached `index.html`, reads only the current LoopCAT versioned cache for app-shell responses, cleans up only old `loopcat-offline-*` caches, and the runtime cache is bounded to app-shell assets so unrelated local pages or other local-tool caches are not silently stored, deleted, or served as LoopCAT files. When opened directly as `file://`, browsers do not allow service workers, so the app still runs from local files but cannot use the installable web-app cache.

For a distributable static HTML build, run `pnpm run dist:web` or `pnpm run dist:html`, then `pnpm run verify:web-artifact` and `pnpm run verify:web-smoke`. The generated ZIP and checksum file are written to `dist-web/` instead of desktop `dist/` so the HTML bundle cannot be confused with the macOS desktop ZIP during desktop release verification. Serve the extracted folder from a local or hosted HTTPS/HTTP origin for installable offline PWA behavior; direct `file://` opening remains useful for quick local use but cannot register the service worker.

For downloadable desktop builds, use the Electron wrapper documented in `docs/desktop-packaging.md`. It serves the bundled files offline through a private `loopcat://app/` protocol, keeps Node.js disabled in the renderer and in workers/subframes, keeps renderer web security enabled, disables insecure content, Electron webviews, legacy WebSQL, drag-and-drop navigation, and packaged DevTools, keeps top-level navigation pinned to the bundled `index.html` shell, denies renderer-created popup windows, blocks system-browser external opens by default, blocks renderer network requests except bundled app files, explicit local AI loopback API paths, exact hosted AI provider API paths used by the AI Command Centre, and the exact OpenAI Responses/Models endpoints, targets Windows, macOS, and Linux through `electron-builder`, uploads only public download artifacts plus checksums from CI, and includes signing, clean-machine smoke, per-artifact launch evidence, storage-failure, and upgrade checklists. Use `docs/release-smoke-evidence-template.md` to record platform evidence and public artifact SHA-256 hashes for each release candidate, then run `pnpm run verify:evidence -- path/to/completed-release-evidence.md --checksum-file dist/SHA256SUMS.txt` before publication.

Before packaging a release, run `pnpm run verify:provenance -- --allow-untagged`, `pnpm install --frozen-lockfile`, `pnpm run verify:release`, then run the browser tests and a small manual import/edit/export smoke test. The provenance gate fails before packaging if Git is not available, Git metadata such as `.git/HEAD` is missing, the checkout is dirty, or the checked-out commit does not match the release tag or CI SHA. The browser runner includes a large-project fixture so release checks cover academic-length package, autosave, QA, and backup behavior. Tagged releases can use the desktop release workflow to produce platform-specific artifacts, verify the combined Windows/macOS/Linux download bundle, and publish a combined `SHA256SUMS.txt` checksum file.

The offline cache name is tied to the app version. When preparing a release, bump `package.json` and keep `manifest.webmanifest` plus `service-worker.js` on the same version; `pnpm run verify:release` fails if they drift.

Projects now carry local workspace/user metadata, resource links, QA settings, AI settings, export history, and activity events. These fields are intentionally local placeholders today, but they keep the data model ready for optional encrypted backup, project sharing, or team workspaces later.

Normal project reports include project counts, terminology status, QA totals, export-readiness notes, and activity summaries without segment text, while redacting credential-looking project/file/resource labels, validation-note labels, project domain metadata, termbase notes, activity summaries, and activity types. Anonymized project reports keep counts but redact project names, file names, resource names, terminology text, credential-looking project domain metadata, activity summaries, activity types, and segment text. Exported report HTML includes a restrictive CSP that disables scripts, network connections, forms, object content, and base URL changes.

When a workspace folder is connected, LoopCAT saves visible project package folders and keeps a `loopcat-workspace.json` manifest plus a resource index. If that manifest is missing or damaged, the workspace layer can rebuild it by scanning existing `projects/*/project.loopcat.json` packages and deduplicating renamed project folders by project ID. If the manifest is valid but stale, package listings still merge manifest entries with visible package folders so sync can see project packages that were written before an interrupted manifest update. Stale workspace manifests are rewritten through a fixed project/resource/backup metadata shape, so credential-looking labels, backup paths, unsafe package paths, and unknown legacy fields are redacted or dropped before they are shown or written again. Workspace scans skip credential-looking package folder names and backup filenames instead of recording those external paths in the manifest or backup count. Workspace health reports, validation sidecars, workspace package scan warnings, workspace write errors, backup-manifest warnings, and workspace sync warnings also redact credential-looking project, folder, resource, backup, read-error, and write-error text. Workspace package and backup counts are based on visible safe files in the folder, with manifest metadata used only to enrich matching visible files. Empty project folders without a `project.loopcat.json` file are ignored; damaged, oversized, invalid, or unsafe-path package files still produce visible warnings.
Workspace health checks also inspect visible package files, so a project package present in the folder but missing from a stale manifest is counted and reported without rewriting the manifest during a read-only health check.

When a folder is connected after work already exists in the browser cache, LoopCAT compares local project IDs with the workspace manifest. Local projects missing from the visible folder are marked unsaved immediately, while projects already present in the folder stay clean so workspace sync is not blocked unnecessarily.

Workspace-folder edits are tracked separately from browser-cache autosaves. If project packages have not yet been written to the connected folder, LoopCAT marks them as unsaved, flushes queued target edits before background package saves, and warns before closing so visible folder copies do not silently lag behind the browser cache.

If a manual workspace package save succeeds but the optional workspace-save activity log cannot be written, LoopCAT still writes the package, reports the activity-log warning separately, and keeps the project marked dirty for the next workspace save attempt.

If the workspace package write itself fails, LoopCAT does not record a successful workspace-save activity event and keeps the project marked dirty for retry. Save history is committed only after the visible folder package has been written.

Workspace package, resource-index, manifest, and backup-manifest write failures are tested with simulated operating-system write errors. Failed package, resource-index, and project-manifest writes keep the browser-cache work dirty and do not advance the in-memory workspace manifest ahead of what was actually written to the visible folder. After a later durable manifest write succeeds, stale write-error status is cleared so recovered folders do not keep showing an old failure. The separate `validation-report.json` sidecar is treated as a non-blocking diagnostic: if it cannot be written after the package itself is saved, LoopCAT reports the warning but still commits the durable package and manifest. Workspace backup files are also durable artifacts: if the backup JSON is written but the workspace manifest update fails, LoopCAT reports the manifest warning while still counting the visible backup file; stale manifest entries no longer inflate the backup count after a backup file is removed from the folder.
Workspace backup exports validate the generated backup before writing to the connected folder. If local data is malformed, LoopCAT shows the validation report and stops before creating a backup file.

If the app opens after a previous session ended with unsaved workspace packages, LoopCAT shows a recovery banner with the affected projects and a direct package-save action before the user syncs from the folder.

Long-running projects also show a backup reminder when there is no recent portable project package export, with a direct export action and a one-day remind-later option.

For best results, open `index.html` in a modern Chromium-based browser, Edge, or Safari with support for `DecompressionStream`.
