# AI Provider Integration Research

Current implementation status:

- Implemented: local Ollama through `/api/version`, `/api/tags`, `/api/pull`, and `/api/chat`.
- Implemented and workflow-tested: hosted Ollama direct API for `/api/tags` and `/api/chat` with bearer-key auth, using hosted model names such as `gpt-oss:120b`, explicit external-source confirmation, and AI-draft metadata storage.
- Implemented: Ollama cloud-offload models through local Ollama, using loopback API calls with cloud-suffixed model names such as `gpt-oss:120b-cloud` and explicit external-processing confirmation.
- Implemented: the AI Command Centre exposes separate quick buttons for direct hosted Ollama and local Ollama cloud-offload models so the two privacy modes are visually distinct.
- Implemented: local OpenAI-compatible `/v1/models` and `/v1/chat/completions`, suitable for LM Studio and similar loopback servers.
- Implemented: local OPUS-CAT MT Engine through `MTRestService/ListSupportedLanguagePairs`, `MTRestService/GetLanguagePairModelTags`, and `MTRestService/TranslateJson`, with automatic discovery of direct CORS-enabled engine endpoints and the loopback browser bridge.
- Implemented: generic hosted OpenAI-compatible URLs are accepted only for explicitly allowlisted provider origins; arbitrary hosted compatible endpoints fail before the network request and should be promoted to named provider presets with exact origin/path allowlists.
- Implemented: native Hugging Face Inference Providers through the router `GET /v1/models` and `POST /v1/chat/completions` endpoints with bearer-token auth.
- Implemented: explicit OpenAI Responses API single-segment suggestions and batch pretranslation with `store: false`.
- Implemented: native DeepSeek through `GET /models` and `POST /chat/completions` with bearer header auth.
- Implemented: Azure OpenAI through resource-specific `/openai/v1/models` and `/openai/v1/responses` endpoints with `api-key` header auth and deployment-name model fields.
- Implemented: native Gemini through `GET /v1beta/models` and `POST /v1beta/interactions` with API-key header auth, `store: false`, and documented `steps[].content[]` response parsing.
- Implemented: native Anthropic Claude through `GET /v1/models` and `POST /v1/messages` with `x-api-key` and `anthropic-version` header auth.
- Implemented: native Cohere Command through `GET /v1/models` and `POST /v2/chat` with bearer header auth.
- Implemented: native Mistral AI through `GET /v1/models` and `POST /v1/chat/completions` with bearer header auth.
- Implemented: native xAI Grok through `GET /v1/models` and `POST /v1/responses` with bearer header auth and `store: false`.
- Implemented: native Perplexity Sonar through `GET /v1/models` and `POST /v1/sonar` with bearer header auth and search disabled for translation/AI-command requests.
- Implemented: native Groq through `GET /openai/v1/models` and `POST /openai/v1/chat/completions` with bearer header auth.
- Implemented: native Together AI through `GET /v1/models` and `POST /v1/chat/completions` with bearer header auth.
- Implemented: native OpenRouter through `GET /api/v1/models` and `POST /api/v1/chat/completions` with bearer header auth.
- Implemented: native DeepInfra through `GET /v1/openai/models` and `POST /v1/openai/chat/completions` with bearer header auth.
- Implemented: native Fireworks AI through `GET /inference/v1/models` and `POST /inference/v1/chat/completions` with bearer header auth.
- Implemented: Local AI pretranslation now passes matched project TM entries, termbase entries, and optional nearby segment snippets as per-segment context hints through the shared provider workflow.
- Implemented: AI-generated pretranslations, AI suggestions, and risk-ranked AI review comments are visible as segment-row badges and can be filtered from the editor toolbar; AI-pretranslated rows display as `AI initiated`, and confirmation clears the `Needs review` row state.
- Implemented: Project analysis and project reports include count-only AI triage metrics for AI-initiated rows, AI suggestions, and risk-ranked AI review rows without including segment text or provider prompt traces.
- Implemented: the AI Command Centre now shows a provider summary with locality, API-key requirement, model-list endpoint, and translation endpoint derived from the active provider configuration.
- Implemented: the AI Command Centre provider summary now includes centralized provider guidance and provider-derived capability labels, so translators can choose a provider by privacy mode, available AI tools, and best-fit task, not just endpoint shape.
- Implemented: the AI Command Centre Prompt Test area can switch between pre-translation, review/QA, tag repair, polish, adaptation, alternatives, terminology application/extraction, and project-brief prompts, then send the selected prompt family through the configured provider.
- Implemented: active-segment AI review command through the shared provider registry; it saves risk-ranked review notes as open segment comments instead of overwriting translations.
- Implemented: active-segment and batch AI tag repair through the shared provider registry; it saves protected-token repair suggestions for review without overwriting drafts and records segment-level batch failures.
- Implemented: active-segment and batch AI draft polish through the shared provider registry; it uses project style instructions, TM matches, termbase hints, and protected-token rules to save reviewable target suggestions without overwriting drafts.
- Implemented: batch AI QA through the shared provider registry; it reviews translated draft segments, skips locked or confirmed rows, saves risk-ranked issue comments, counts no-issue responses, and records segment-level failures without aborting the full pass.
- Implemented: active-segment and batch AI target alternatives through the shared provider registry; it saves selectable literal/fluent/terminology-strict, formal, concise/UI, locale-adapted, or plain-language variants as reviewable AI suggestions without overwriting target cells and records segment-level batch failures without stopping the whole pass.
- Implemented: active-segment and batch AI draft adaptation through the shared provider registry; it saves simplify/clarify, formalize, locale-adapt, or shorten transformations as reviewable target suggestions without overwriting target cells and records segment-level batch failures without stopping the whole pass.
- Implemented: active-segment and batch AI terminology application through the shared provider registry; it uses matching project termbase hits to revise target drafts as reviewable suggestions without overwriting target cells and records segment-level batch failures without stopping the full pass.
- Implemented: active-segment and batch AI terminology extraction through the shared provider registry; it saves deduplicated termbase candidates into the current project termbase for human review and records segment-level batch failures without stopping the whole run.
- Implemented: AI project brief generation through the shared provider registry; it appends concise reusable context to existing project style instructions without replacing translator-written notes.
- Implemented: hosted Local AI API keys are scoped by provider and normalized base URL in browser/session storage, so a saved key for one hosted provider cannot be reused by another provider.
- Implemented: optional live Ollama verification through `pnpm run verify:ollama-live -- ...`, covering local or hosted `/api/tags` plus non-streaming `/api/chat` with the selected model and without printing hosted API keys.
- Implemented: optional live hosted-provider verification through `pnpm run verify:ai-live -- --provider ...`, covering model refresh plus one short translation probe for OpenAI, DeepSeek, Gemini, Anthropic, Cohere, Mistral, xAI, Perplexity, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, Fireworks AI, Azure OpenAI, and OpenAI-compatible loopback servers without printing API keys.
- Not implemented yet: additional provider-native adapters where a hosted compatibility route is not enough.

## 2026-06-30 Provider Verification Snapshot

The provider map was rechecked against official provider documentation on 2026-06-30. Keep this section current whenever defaults, endpoint paths, or provider semantics change.

- Ollama: local and hosted flows use the same Ollama API shape: `/api/version`, `/api/tags`, `/api/pull`, and `/api/chat`. Local pull remains disabled for hosted Ollama.
- OpenAI: LoopCAT uses `/v1/models` for model discovery and `/v1/responses` for hosted translation and AI commands, with provider-side storage disabled by request.
- Google Gemini: LoopCAT uses the Gemini API model list and the stateless Interactions path with `store: false`; this keeps Gemini aligned with LoopCAT's "do not retain by default" hosted-provider posture.
- DeepSeek: LoopCAT normalizes DeepSeek to `https://api.deepseek.com` without inserting `/v1`, because the official OpenAI-compatible examples use `/chat/completions` and `/models` from that root. The default models track current V4 names; older aliases should be treated as compatibility only.
- Mistral AI, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, and Fireworks AI: these remain good fits for the OpenAI-compatible chat-completion pattern, but LoopCAT keeps named native adapters so URL allowlists, defaults, and UX copy stay explicit.
- Anthropic and Cohere: these are provider-native rather than generic OpenAI-compatible; LoopCAT keeps their message/chat request shapes separate.
- Perplexity: translation/review requests use Sonar with search disabled so CAT-tool output does not include citations, related questions, or web-research commentary.
- Azure OpenAI: LoopCAT treats the model field as the deployment name and limits traffic to Azure OpenAI resource domains plus the v1 OpenAI-compatible paths.
- Generic OpenAI-compatible: loopback servers such as LM Studio stay enabled by default; hosted-compatible URLs must be explicitly allowlisted and promoted to named presets before keys, settings, or requests are accepted.
- OPUS-CAT: LoopCAT treats OPUS-CAT as a local MT-engine connector rather than a prompt-completion provider. It sends plain segment text plus source/target language codes to the local `MTRestService` API and exposes only connection test, installed model-tag refresh, and pre-translation.
- Verification tooling: `verify:ollama-live` remains the exact Ollama API probe, while `verify:ai-live` exercises the provider-native hosted adapters with one key-scoped, non-secret model-list and translation probe.

## Provider Matrix

| Provider | Primary API shape | Model list | Chat/translation endpoint | LoopCAT adapter fit |
| --- | --- | --- | --- | --- |
| Ollama local | Ollama API | `GET /api/tags` | `POST /api/chat` | Existing `OllamaProvider` |
| Ollama hosted | Ollama API with bearer key | `GET https://ollama.com/api/tags` | `POST https://ollama.com/api/chat` | Existing `OllamaProvider` when base URL is `https://ollama.com`; direct hosted presets use model names such as `gpt-oss:120b` |
| Ollama cloud model via local Ollama | Local Ollama API with cloud-suffixed model name | `GET http://localhost:11434/api/tags` | `POST http://localhost:11434/api/chat` | Existing `OllamaProvider`; LoopCAT treats `*-cloud` / `:cloud` models as externally processed and asks for confirmation |
| LM Studio | OpenAI-compatible local API | `GET /v1/models` | `POST /v1/chat/completions` | Existing `OpenAICompatibleProvider` |
| OPUS-CAT MT Engine | OPUS-CAT local HTTP API | `GET /MTRestService/ListSupportedLanguagePairs` and `GET /MTRestService/GetLanguagePairModelTags` | `GET /MTRestService/TranslateJson` | Existing `OpusCatProvider`, pre-translation only |
| OpenAI | Responses API and Chat Completions | `GET /v1/models` | `POST /v1/responses` or `/v1/chat/completions` | Existing `OpenAIProvider` uses Responses for suggestions and pretranslation |
| Google Gemini | Gemini Developer API Interactions | `GET /v1beta/models` | `POST /v1beta/interactions` | Checked Gemini adapter with storage disabled |
| Anthropic Claude | Messages API | `GET /v1/models` | `POST /v1/messages` | Checked Anthropic adapter with versioned header auth |
| Mistral AI | Mistral chat completion API | `GET /v1/models` | `POST /v1/chat/completions` | Existing `MistralProvider` |
| DeepSeek | DeepSeek chat completion API | `GET /models` | `POST /chat/completions` | Existing `DeepSeekProvider` without automatic `/v1` base-path insertion |
| Cohere | Cohere Chat API v2 | `GET /v1/models` | `POST /v2/chat` | Existing `CohereProvider` |
| xAI | xAI Responses API | `GET /v1/models` | `POST /v1/responses` | Existing `XAIProvider` with `store: false` |
| Perplexity | Sonar API | `GET /v1/models` | `POST /v1/sonar` | Checked Perplexity adapter with search disabled |
| Groq | OpenAI-compatible chat API | `GET /openai/v1/models` | `POST /openai/v1/chat/completions` | Existing `GroqProvider` |
| Together AI | OpenAI-compatible chat API | `GET /v1/models` | `POST /v1/chat/completions` | Existing `TogetherProvider` |
| OpenRouter | OpenAI-compatible routing API | `GET /api/v1/models` | `POST /api/v1/chat/completions` | Existing `OpenRouterProvider` |
| Azure OpenAI | Azure resource-specific OpenAI v1 APIs | `GET /openai/v1/models` | `POST /openai/v1/responses` | Existing `AzureOpenAIProvider`, with `model` used as the deployment name |
| Hugging Face Inference Providers | Router OpenAI-compatible chat API | `GET /v1/models` | `POST /v1/chat/completions` | Existing `HuggingFaceProvider` |
| DeepInfra | OpenAI-compatible inference API | `GET /v1/openai/models` | `POST /v1/openai/chat/completions` | Existing `DeepInfraProvider` |
| Fireworks AI | OpenAI-compatible inference API | `GET /inference/v1/models` | `POST /inference/v1/chat/completions` | Existing `FireworksProvider` |

## Provider Use-Case Guidance

This guidance is shown directly in the AI Command Centre provider summary.

| Provider mode | Best-fit LoopCAT work |
| --- | --- |
| Ollama local | Private offline pre-translation, local model experiments, and small-batch drafting on the translator's PC |
| Ollama cloud via local Ollama | Larger Ollama-hosted models while preserving the local Ollama workflow, with explicit external-processing confirmation |
| Hosted Ollama | Direct hosted Ollama models after sign-in, hosted key entry, and external source-sharing confirmation |
| LM Studio / local OpenAI-compatible | Local OpenAI-compatible models without changing the shared pre-translation and AI-command workflow |
| OPUS-CAT local | Private offline neural MT using OPUS-CAT MT Engine and installed OPUS-MT language-pair models; pre-translation only |
| OpenAI / Azure OpenAI | High-quality hosted pre-translation, review, rewriting, terminology-aware editing, and organization-managed deployment workflows |
| Gemini | Long-context project briefs, style-context synthesis, and multilingual draft generation |
| DeepSeek | Cost-conscious technical translation, reasoning-heavy review, and batch QA |
| Anthropic Claude | Careful review comments, nuance-preserving rewrites, and style-sensitive translator assistance |
| Cohere / Mistral | Enterprise multilingual, terminology-sensitive, concise UI localization, and instruction-following translation tasks |
| Groq / Together / OpenRouter / Hugging Face / DeepInfra / Fireworks | Fast hosted open-model experimentation, alternatives, and batch review through explicit provider presets |
| Perplexity Sonar | Sonar translation/review with search disabled, only when the project accepts hosted processing |

Official docs used for the implementation map:

- Ollama API and cloud docs: https://docs.ollama.com/api and https://docs.ollama.com/cloud
- OpenAI API docs: https://platform.openai.com/docs and https://platform.openai.com/docs/models
- Google Gemini API docs: https://ai.google.dev/gemini-api/docs
- Anthropic Messages API docs: https://docs.anthropic.com/en/api/messages
- Mistral AI API docs: https://docs.mistral.ai/api/
- DeepSeek API docs: https://api-docs.deepseek.com/
- Cohere API docs: https://docs.cohere.com/v2/reference/chat
- xAI API docs: https://docs.x.ai/docs
- Groq API docs: https://console.groq.com/docs
- Together AI API docs: https://docs.together.ai/docs/openai-api-compatibility
- OpenRouter API docs: https://openrouter.ai/docs
- Perplexity Sonar API docs: https://docs.perplexity.ai/api-reference/sonar-post and https://docs.perplexity.ai/api-reference/models
- Azure OpenAI docs: https://learn.microsoft.com/azure/ai-services/openai/
- Hugging Face Inference Providers docs: https://huggingface.co/docs/inference-providers/
- DeepInfra OpenAI-compatible API docs: https://deepinfra.com/docs/openai_api
- Fireworks AI API docs: https://docs.fireworks.ai/api-reference/post-chatcompletions
- OPUS-CAT docs and source: https://helsinki-nlp.github.io/OPUS-CAT/install and https://github.com/Helsinki-NLP/OPUS-CAT

## Recommended Architecture

Keep one workflow and multiple adapters:

1. `AIProvider` stays the boundary for `testConnection`, `listModels`, and `translateSegment`.
2. Provider adapters should return the same `translatedText`, `rawOutput`, `provider`, `providerId`, `model`, `durationMs`, and token metadata shape.
3. Prompt building should stay provider-neutral. Provider adapters can add system/developer-message wrappers, but the CAT translation rules should come from one shared prompt builder.
4. Secrets should stay browser-only. Project packages should store provider IDs, base URLs, model names, and policy flags, but never API keys.
5. Hosted provider API keys should be scoped by provider and normalized base URL so switching providers cannot reuse a stale credential.
6. Hosted providers must require action-time confirmation before source text is sent outside LoopCAT.
7. Browser CSP and Electron network guards should allow only implemented hosted provider origins and exact API paths. Do not add wildcard provider access.

## Next Provider Work

Highest-value next adapters:

1. Provider-native adapters only where OpenAI-compatible behavior is not enough for production quality or model discovery.
2. AI-native commands on top of the shared provider registry: active-segment and batch AI review, active and batch tag-repair suggestions, active and batch draft polishing, active and batch draft adaptation, active and batch target alternatives, active and batch terminology application, terminology extraction, and project brief generation are implemented.
3. Provider-specific glossary/context tuning can build on the shared per-segment TM, glossary, and nearby-context callbacks now used by Local AI pretranslation.

## AI-Native CAT Tool Ideas

Keep these as translator-controlled commands rather than hidden automation:

- Batch pretranslate with provider/model presets per project or client.
- Active-segment and batch alternatives: literal, fluent, terminology-strict, formal, concise/UI, locale-adapted, and plain-language variants are implemented through the same command service; client-specific variants can reuse the same mode pattern.
- AI QA pass: placeholder/tag preservation, number mismatch explanation, terminology consistency, and tone/style checks. Active-segment and batch review are implemented; deeper structured QA scoring can build on the same service.
- Terminology extraction from the active source/target segment and from selected/visible/project batches into the current project termbase is implemented with the same parser and provider service.
- TM-assisted prompt context, nearby segment context, and semantic TM search.
- Segment repair commands: preserve tags in active or batch mode, fix punctuation, polish active or batched drafts against style/TM/termbase context, adapt active or batched drafts for simplification, formalization, locale fit, or brevity, and apply matched glossary entries to active or batched drafts are implemented.
- Project brief generator from domain, file names, termbase, and sample segments is implemented and appends to the existing project style instructions.
- Reviewer mode: implemented as active-segment and batch AI QA that explains likely mistranslations, stores structured review-risk metadata, and never auto-confirms segments.
- Context harvester: summarize surrounding strings and file/resource metadata for UI/app localization. The mode-aware Prompt Test preview now exposes the prompt family and static context that each AI-native command will send.

Each command should show what will be sent, ask for confirmation for hosted providers, and save outputs as reviewable drafts rather than confirmed translations.
