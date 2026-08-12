(() => {
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_REQUEST_TIMEOUT_MS = 45000;
const OPENAI_DEFAULT_MODEL = "gpt-5.5";
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash";
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const COHERE_DEFAULT_BASE_URL = "https://api.cohere.com";
const COHERE_DEFAULT_MODEL = "command-a-translate-08-2025";
const MISTRAL_DEFAULT_BASE_URL = "https://api.mistral.ai/v1";
const MISTRAL_DEFAULT_MODEL = "mistral-large-latest";
const XAI_DEFAULT_BASE_URL = "https://api.x.ai/v1";
const XAI_DEFAULT_MODEL = "grok-4.3";
const PERPLEXITY_DEFAULT_BASE_URL = "https://api.perplexity.ai/v1";
const PERPLEXITY_DEFAULT_MODEL = "sonar-pro";
const GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const TOGETHER_DEFAULT_BASE_URL = "https://api.together.ai/v1";
const TOGETHER_DEFAULT_MODEL = "MiniMaxAI/MiniMax-M3";
const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "~openai/gpt-latest";
const HUGGINGFACE_DEFAULT_BASE_URL = "https://router.huggingface.co/v1";
const HUGGINGFACE_DEFAULT_MODEL = "openai/gpt-oss-120b:cerebras";
const DEEPINFRA_DEFAULT_BASE_URL = "https://api.deepinfra.com/v1/openai";
const DEEPINFRA_DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-70B-Instruct";
const FIREWORKS_DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1";
const FIREWORKS_DEFAULT_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct";
const AZURE_OPENAI_DEFAULT_BASE_URL = "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1";
const AZURE_OPENAI_DEFAULT_MODEL = "gpt-4.1-nano";
const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
const LM_STUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
const OPUS_CAT_DEFAULT_BASE_URL = "http://localhost:8500";
const OPUS_CAT_IPV4_BASE_URL = "http://127.0.0.1:8500";
const OPUS_CAT_WEB_BRIDGE_BASE_URL = "http://127.0.0.1:8502";
const OPUS_CAT_WEB_BRIDGE_LOCALHOST_URL = "http://localhost:8502";
const DEFAULT_LOCAL_AI_MODEL = "translategemma";
const OPUS_CAT_DEFAULT_MODEL = "default";
const OPENAI_COMPATIBLE_HOSTED_ALLOWED_HOSTS = new Set([
  "api.deepseek.com",
  "api.mistral.ai",
  "api.x.ai",
  "api.perplexity.ai",
  "api.groq.com",
  "api.together.ai",
  "openrouter.ai",
  "router.huggingface.co",
  "api.deepinfra.com",
  "api.fireworks.ai"
]);
const OPENAI_COMPATIBLE_NO_V1_HOSTS = new Set(["api.deepseek.com", "api.perplexity.ai", "api.deepinfra.com"]);
const OPENAI_COMPATIBLE_ENDPOINT_PATH_OVERRIDES = new Map([
  ["api.perplexity.ai", new Map([
    ["models", "/v1/models"],
    ["chat/completions", "/chat/completions"]
  ])]
]);
const LOCAL_AI_PROVIDER_PRESETS = [
  { id: "ollama-local", label: "Ollama local", providerId: "ollama", baseUrl: OLLAMA_DEFAULT_BASE_URL, model: DEFAULT_LOCAL_AI_MODEL },
  { id: "ollama-local-cloud", label: "Ollama cloud model via local Ollama", providerId: "ollama", baseUrl: OLLAMA_DEFAULT_BASE_URL, model: "gpt-oss:120b-cloud" },
  { id: "ollama-cloud", label: "Ollama Cloud direct", providerId: "ollama", baseUrl: OLLAMA_CLOUD_BASE_URL, model: "gpt-oss:120b" },
  { id: "openai", label: "OpenAI", providerId: "openai", baseUrl: OPENAI_DEFAULT_BASE_URL, model: OPENAI_DEFAULT_MODEL },
  { id: "gemini", label: "Google Gemini", providerId: "gemini", baseUrl: GEMINI_DEFAULT_BASE_URL, model: GEMINI_DEFAULT_MODEL },
  { id: "anthropic", label: "Anthropic Claude", providerId: "anthropic", baseUrl: ANTHROPIC_DEFAULT_BASE_URL, model: ANTHROPIC_DEFAULT_MODEL },
  { id: "cohere", label: "Cohere Command", providerId: "cohere", baseUrl: COHERE_DEFAULT_BASE_URL, model: COHERE_DEFAULT_MODEL },
  { id: "mistral", label: "Mistral AI", providerId: "mistral", baseUrl: MISTRAL_DEFAULT_BASE_URL, model: MISTRAL_DEFAULT_MODEL },
  { id: "xai", label: "xAI Grok", providerId: "xai", baseUrl: XAI_DEFAULT_BASE_URL, model: XAI_DEFAULT_MODEL },
  { id: "azure-openai", label: "Azure OpenAI", providerId: "azure-openai", baseUrl: AZURE_OPENAI_DEFAULT_BASE_URL, model: AZURE_OPENAI_DEFAULT_MODEL },
  { id: "lm-studio", label: "LM Studio local", providerId: "openai-compatible", baseUrl: LM_STUDIO_DEFAULT_BASE_URL, model: DEFAULT_LOCAL_AI_MODEL },
  { id: "opus-cat", label: "OPUS-CAT local", providerId: "opus-cat", baseUrl: OPUS_CAT_DEFAULT_BASE_URL, model: OPUS_CAT_DEFAULT_MODEL },
  { id: "deepseek", label: "DeepSeek", providerId: "deepseek", baseUrl: DEEPSEEK_DEFAULT_BASE_URL, model: DEEPSEEK_DEFAULT_MODEL },
  { id: "perplexity", label: "Perplexity Sonar", providerId: "perplexity", baseUrl: PERPLEXITY_DEFAULT_BASE_URL, model: PERPLEXITY_DEFAULT_MODEL },
  { id: "groq", label: "Groq", providerId: "groq", baseUrl: GROQ_DEFAULT_BASE_URL, model: GROQ_DEFAULT_MODEL },
  { id: "together", label: "Together AI", providerId: "together", baseUrl: TOGETHER_DEFAULT_BASE_URL, model: TOGETHER_DEFAULT_MODEL },
  { id: "openrouter", label: "OpenRouter", providerId: "openrouter", baseUrl: OPENROUTER_DEFAULT_BASE_URL, model: OPENROUTER_DEFAULT_MODEL },
  { id: "huggingface", label: "Hugging Face Inference Providers", providerId: "huggingface", baseUrl: HUGGINGFACE_DEFAULT_BASE_URL, model: HUGGINGFACE_DEFAULT_MODEL },
  { id: "deepinfra", label: "DeepInfra", providerId: "deepinfra", baseUrl: DEEPINFRA_DEFAULT_BASE_URL, model: DEEPINFRA_DEFAULT_MODEL },
  { id: "fireworks", label: "Fireworks AI", providerId: "fireworks", baseUrl: FIREWORKS_DEFAULT_BASE_URL, model: FIREWORKS_DEFAULT_MODEL }
];
const LOCAL_AI_PROVIDER_GUIDANCE = {
  ollama: {
    local: "Best for private offline pre-translation, local model experiments, and small-batch drafting on the translator's own PC.",
    cloud: "Best for larger Ollama-hosted models while keeping the same Ollama workflow; source text may be processed outside the PC after confirmation.",
    hosted: "Best for direct hosted Ollama models when the translator intentionally signs in and confirms external source sharing."
  },
  openai: {
    hosted: "Best for high-quality pre-translation, review, rewriting, terminology-aware editing, and project brief generation when hosted processing is allowed."
  },
  deepseek: {
    hosted: "Best for cost-conscious technical translation, reasoning-heavy review, and batch QA when hosted processing is allowed."
  },
  gemini: {
    hosted: "Best for long-context project briefs, style-context synthesis, and multilingual draft generation when hosted processing is allowed."
  },
  anthropic: {
    hosted: "Best for careful review comments, nuance-preserving rewrites, and style-sensitive translator assistance."
  },
  cohere: {
    hosted: "Best for enterprise multilingual workflows, terminology-sensitive drafting, and controlled business translation tasks."
  },
  mistral: {
    hosted: "Best for fast European-hosted drafting, concise UI localization, and instruction-following translation tasks."
  },
  xai: {
    hosted: "Best for hosted general-purpose drafting and review when the project accepts external processing."
  },
  perplexity: {
    hosted: "Best for Sonar-based review or translation tasks with search disabled, keeping CAT output free of citations and commentary."
  },
  groq: {
    hosted: "Best for very fast OpenAI-compatible draft generation and QA on supported hosted models."
  },
  together: {
    hosted: "Best for trying many open-weight hosted models through one OpenAI-compatible workflow."
  },
  openrouter: {
    hosted: "Best for routing a project through many commercial and open models while keeping one LoopCAT provider adapter."
  },
  huggingface: {
    hosted: "Best for Hugging Face-hosted open models and provider-routed experiments with explicit external sharing."
  },
  deepinfra: {
    hosted: "Best for hosted open-weight model translation and review through an OpenAI-compatible inference API."
  },
  fireworks: {
    hosted: "Best for low-latency hosted open-model drafting, alternatives, and batch review."
  },
  "azure-openai": {
    hosted: "Best for organization-managed OpenAI deployments, compliance-bound projects, and deployment-name based model control."
  },
  "openai-compatible": {
    local: "Best for LM Studio and other loopback OpenAI-compatible servers so translators can use local models without changing the workflow.",
    hosted: "Best only for explicitly allowlisted compatible providers; add a named preset before using a hosted custom endpoint."
  },
  "opus-cat": {
    local: "Best for private offline neural MT through the local OPUS-CAT MT Engine and installed OPUS-MT language-pair models.",
    hosted: "Best only when an OPUS-CAT engine is intentionally exposed on a trusted private network; LoopCAT treats non-loopback OPUS-CAT URLs as external processing."
  }
};
const LOCAL_AI_SETTINGS_STORAGE = "loopcat.localAi.settings";
const DEFAULT_LOCAL_AI_TIMEOUT_MS = 120000;
const LOCAL_AI_PROVIDER_IDS = new Set(["ollama", "openai", "deepseek", "gemini", "anthropic", "cohere", "mistral", "xai", "perplexity", "groq", "together", "openrouter", "huggingface", "deepinfra", "fireworks", "azure-openai", "openai-compatible", "opus-cat"]);
const LOCAL_AI_PRETRANSLATION_MODES = new Set(["selected", "untranslated", "visible", "project"]);
const LOCAL_AI_VARIANT_MODES = new Set(["standard", "formal", "concise", "locale", "plain"]);
const LOCAL_AI_ADAPT_MODES = new Set(["simplify", "formalize", "localize", "shorten"]);
const AI_REVIEW_RISK_LEVELS = ["none", "low", "medium", "high", "critical"];
const AI_REVIEW_RISK_SCORES = { none: 0, low: 25, medium: 50, high: 75, critical: 100 };
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

const LANGUAGE_NAMES = {
  ar: "Arabic",
  ca: "Catalan",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  uk: "Ukrainian",
  zh: "Chinese"
};

function makeId(prefix) {
  return window.CatHan.storage?.makeId ? window.CatHan.storage.makeId(prefix) : `${prefix}-${Date.now()}`;
}

function compactText(value, maxLength = 1200) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function compactPromptContext(value, maxLength) {
  return compactText(redactSensitiveText(value), maxLength);
}

function aiContextRecords(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function languageNameForCode(code, fallback = "") {
  const clean = String(code || "").trim();
  return LANGUAGE_NAMES[clean.toLowerCase()] || fallback || clean || "language";
}

function normalizedPositiveInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeUrl(value, fallback) {
  const raw = trimTrailingSlashes(String(value || fallback || "").trim());
  try {
    const url = new URL(raw || fallback);
    if (!["http:", "https:"].includes(url.protocol)) return trimTrailingSlashes(fallback);
    url.hash = "";
    url.search = "";
    return trimTrailingSlashes(url.href);
  } catch {
    return trimTrailingSlashes(fallback);
  }
}

function normalizeOllamaBaseUrl(baseUrl = OLLAMA_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, OLLAMA_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const rawPath = url.pathname.replace(/\/+$/, "");
  const pathWithoutApi = rawPath === "/api" ? "" : rawPath.replace(/\/api$/, "");
  const rootPath = pathWithoutApi === "/" ? "" : pathWithoutApi;
  const rootBaseUrl = trimTrailingSlashes(`${url.origin}${rootPath}`);
  return {
    rootBaseUrl,
    apiBaseUrl: `${rootBaseUrl}/api`
  };
}

function ollamaApiUrl(baseUrl, endpoint) {
  const { apiBaseUrl } = normalizeOllamaBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?api\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function normalizeOpusCatBaseUrl(baseUrl = OPUS_CAT_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, OPUS_CAT_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/mtrestservice$/i, "");
  return trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`);
}

function opusCatApiUrl(baseUrl, endpoint) {
  const rootBaseUrl = normalizeOpusCatBaseUrl(baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
  const cleanEndpoint = String(endpoint || "")
    .replace(/^\/?mtrestservice\/?/i, "")
    .replace(/^\/+/, "");
  return `${rootBaseUrl}/MTRestService/${cleanEndpoint}`;
}

function opusCatConnectionCandidates(baseUrl = OPUS_CAT_DEFAULT_BASE_URL) {
  const configuredBaseUrl = normalizeOpusCatBaseUrl(baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
  if (!isLoopbackBaseUrl(configuredBaseUrl, OPUS_CAT_DEFAULT_BASE_URL)) return [configuredBaseUrl];
  return Array.from(new Set([
    configuredBaseUrl,
    OPUS_CAT_DEFAULT_BASE_URL,
    OPUS_CAT_IPV4_BASE_URL,
    OPUS_CAT_WEB_BRIDGE_BASE_URL,
    OPUS_CAT_WEB_BRIDGE_LOCALHOST_URL
  ].map((candidate) => normalizeOpusCatBaseUrl(candidate))));
}

function isKnownLocalOpusCatBaseUrl(baseUrl) {
  const normalized = normalizeOpusCatBaseUrl(baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
  return opusCatConnectionCandidates(OPUS_CAT_DEFAULT_BASE_URL).includes(normalized);
}

function opusCatConnectionMode(baseUrl) {
  try {
    return new URL(normalizeOpusCatBaseUrl(baseUrl)).port === "8502" ? "browser bridge" : "direct engine";
  } catch {
    return "configured endpoint";
  }
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl = LM_STUDIO_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, LM_STUDIO_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  const hostname = url.hostname.toLowerCase();
  if (OPENAI_COMPATIBLE_NO_V1_HOSTS.has(hostname)) {
    path = path.endsWith("/v1") ? path.slice(0, -3) || "/" : path;
    return trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`);
  }
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeOpenAiBaseUrl(baseUrl = OPENAI_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, OPENAI_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeDeepSeekBaseUrl(baseUrl = DEEPSEEK_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, DEEPSEEK_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  const cleanPath = path === "/v1" ? "" : path.replace(/\/v1$/, "");
  return trimTrailingSlashes(`${url.origin}${cleanPath === "/" ? "" : cleanPath}`);
}

function normalizeGeminiBaseUrl(baseUrl = GEMINI_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, GEMINI_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1beta")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1beta`;
}

function normalizeAnthropicBaseUrl(baseUrl = ANTHROPIC_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, ANTHROPIC_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeCohereBaseUrl(baseUrl = COHERE_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, COHERE_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/v[12]$/, "");
  return trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`);
}

function normalizeMistralBaseUrl(baseUrl = MISTRAL_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, MISTRAL_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeXAiBaseUrl(baseUrl = XAI_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, XAI_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizePerplexityBaseUrl(baseUrl = PERPLEXITY_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, PERPLEXITY_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeGroqBaseUrl(baseUrl = GROQ_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, GROQ_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/openai\/v1$/, "").replace(/\/openai$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/openai/v1`;
}

function normalizeTogetherBaseUrl(baseUrl = TOGETHER_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, TOGETHER_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeOpenRouterBaseUrl(baseUrl = OPENROUTER_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, OPENROUTER_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/api\/v1$/, "").replace(/\/api$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/api/v1`;
}

function normalizeHuggingFaceBaseUrl(baseUrl = HUGGINGFACE_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, HUGGINGFACE_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeDeepInfraBaseUrl(baseUrl = DEEPINFRA_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, DEEPINFRA_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/v1\/openai$/, "").replace(/\/openai$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1/openai`;
}

function normalizeFireworksBaseUrl(baseUrl = FIREWORKS_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, FIREWORKS_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/inference\/v1$/, "").replace(/\/inference$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/inference/v1`;
}

function normalizeAzureOpenAiBaseUrl(baseUrl = AZURE_OPENAI_DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, AZURE_OPENAI_DEFAULT_BASE_URL);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/openai\/v1$/, "").replace(/\/openai$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/openai/v1`;
}

function openAiApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeOpenAiBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function deepSeekApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeDeepSeekBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function geminiApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeGeminiBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1beta\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function anthropicApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeAnthropicBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function cohereApiUrl(baseUrl, endpoint) {
  const rootBaseUrl = normalizeCohereBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/+/, "");
  const versionedEndpoint = /^v[12]\//.test(cleanEndpoint) ? cleanEndpoint : `v2/${cleanEndpoint}`;
  return `${rootBaseUrl}/${versionedEndpoint}`;
}

function mistralApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeMistralBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function xAiApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeXAiBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function perplexityApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizePerplexityBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function groqApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeGroqBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?openai\/v1\/?/, "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function togetherApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeTogetherBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function openRouterApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeOpenRouterBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?api\/v1\/?/, "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function huggingFaceApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeHuggingFaceBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function deepInfraApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeDeepInfraBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/openai\/?/, "").replace(/^\/?openai\/?/, "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function fireworksApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeFireworksBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?inference\/v1\/?/, "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function azureOpenAiApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeAzureOpenAiBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?openai\/v1\/?/, "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function openAiCompatibleApiUrl(baseUrl, endpoint) {
  const apiBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  const cleanEndpoint = String(endpoint || "").replace(/^\/?v1\/?/, "").replace(/^\/+/, "");
  try {
    const host = new URL(apiBaseUrl).hostname.toLowerCase();
    const overridePath = OPENAI_COMPATIBLE_ENDPOINT_PATH_OVERRIDES.get(host)?.get(cleanEndpoint);
    if (overridePath) return `${new URL(apiBaseUrl).origin}${overridePath}`;
  } catch {
    // Fall through to the standard OpenAI-compatible path shape.
  }
  return `${apiBaseUrl}/${cleanEndpoint}`;
}

function normalizedProviderBaseUrl(providerId, baseUrl) {
  if (providerId === "ollama") return normalizeOllamaBaseUrl(baseUrl || OLLAMA_DEFAULT_BASE_URL).rootBaseUrl;
  if (providerId === "openai") return normalizeOpenAiBaseUrl(baseUrl || OPENAI_DEFAULT_BASE_URL);
  if (providerId === "deepseek") return normalizeDeepSeekBaseUrl(baseUrl || DEEPSEEK_DEFAULT_BASE_URL);
  if (providerId === "gemini") return normalizeGeminiBaseUrl(baseUrl || GEMINI_DEFAULT_BASE_URL);
  if (providerId === "anthropic") return normalizeAnthropicBaseUrl(baseUrl || ANTHROPIC_DEFAULT_BASE_URL);
  if (providerId === "cohere") return normalizeCohereBaseUrl(baseUrl || COHERE_DEFAULT_BASE_URL);
  if (providerId === "mistral") return normalizeMistralBaseUrl(baseUrl || MISTRAL_DEFAULT_BASE_URL);
  if (providerId === "xai") return normalizeXAiBaseUrl(baseUrl || XAI_DEFAULT_BASE_URL);
  if (providerId === "perplexity") return normalizePerplexityBaseUrl(baseUrl || PERPLEXITY_DEFAULT_BASE_URL);
  if (providerId === "groq") return normalizeGroqBaseUrl(baseUrl || GROQ_DEFAULT_BASE_URL);
  if (providerId === "together") return normalizeTogetherBaseUrl(baseUrl || TOGETHER_DEFAULT_BASE_URL);
  if (providerId === "openrouter") return normalizeOpenRouterBaseUrl(baseUrl || OPENROUTER_DEFAULT_BASE_URL);
  if (providerId === "huggingface") return normalizeHuggingFaceBaseUrl(baseUrl || HUGGINGFACE_DEFAULT_BASE_URL);
  if (providerId === "deepinfra") return normalizeDeepInfraBaseUrl(baseUrl || DEEPINFRA_DEFAULT_BASE_URL);
  if (providerId === "fireworks") return normalizeFireworksBaseUrl(baseUrl || FIREWORKS_DEFAULT_BASE_URL);
  if (providerId === "azure-openai") return normalizeAzureOpenAiBaseUrl(baseUrl || AZURE_OPENAI_DEFAULT_BASE_URL);
  if (providerId === "openai-compatible") return normalizeOpenAiCompatibleBaseUrl(baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
  if (providerId === "opus-cat") return normalizeOpusCatBaseUrl(baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
  return normalizeUrl(baseUrl || "", "");
}

function localAiProviderPresetById(presetId) {
  const id = String(presetId || "").trim();
  return LOCAL_AI_PROVIDER_PRESETS.find((preset) => preset.id === id) || null;
}

function localAiProviderPresetForSettings(settings = {}) {
  const providerId = String(settings.providerId || settings.provider || "").trim() || "ollama";
  const fallbackBaseUrl = providerId === "openai"
    ? OPENAI_DEFAULT_BASE_URL
    : providerId === "deepseek"
      ? DEEPSEEK_DEFAULT_BASE_URL
    : providerId === "gemini"
      ? GEMINI_DEFAULT_BASE_URL
    : providerId === "anthropic"
      ? ANTHROPIC_DEFAULT_BASE_URL
    : providerId === "cohere"
      ? COHERE_DEFAULT_BASE_URL
    : providerId === "mistral"
      ? MISTRAL_DEFAULT_BASE_URL
    : providerId === "xai"
      ? XAI_DEFAULT_BASE_URL
    : providerId === "perplexity"
      ? PERPLEXITY_DEFAULT_BASE_URL
    : providerId === "groq"
      ? GROQ_DEFAULT_BASE_URL
    : providerId === "together"
      ? TOGETHER_DEFAULT_BASE_URL
    : providerId === "openrouter"
      ? OPENROUTER_DEFAULT_BASE_URL
    : providerId === "huggingface"
      ? HUGGINGFACE_DEFAULT_BASE_URL
    : providerId === "deepinfra"
      ? DEEPINFRA_DEFAULT_BASE_URL
    : providerId === "fireworks"
      ? FIREWORKS_DEFAULT_BASE_URL
    : providerId === "azure-openai"
      ? AZURE_OPENAI_DEFAULT_BASE_URL
    : providerId === "openai-compatible"
      ? LM_STUDIO_DEFAULT_BASE_URL
    : providerId === "opus-cat"
      ? OPUS_CAT_DEFAULT_BASE_URL
      : OLLAMA_DEFAULT_BASE_URL;
  const normalizedBaseUrl = normalizedProviderBaseUrl(providerId, settings.baseUrl || settings.localBaseUrl || fallbackBaseUrl);
  const model = String(settings.model || settings.localModel || "").trim();
  const matchingPresets = LOCAL_AI_PROVIDER_PRESETS.filter((preset) => (
    preset.providerId === providerId &&
    (
      normalizedProviderBaseUrl(preset.providerId, preset.baseUrl) === normalizedBaseUrl ||
      (providerId === "opus-cat" && preset.id === "opus-cat" && isKnownLocalOpusCatBaseUrl(normalizedBaseUrl))
    )
  ));
  return matchingPresets.find((preset) => model && preset.model === model) || matchingPresets[0] || null;
}

function normalizedHostname(baseUrl, fallback = OLLAMA_DEFAULT_BASE_URL) {
  try {
    return new URL(normalizeUrl(baseUrl, fallback)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLoopbackHostname(hostname) {
  const clean = String(hostname || "").toLowerCase();
  return clean === "localhost" || clean === "127.0.0.1" || clean === "::1" || clean === "[::1]";
}

function isLoopbackBaseUrl(baseUrl, fallback = OLLAMA_DEFAULT_BASE_URL) {
  return isLoopbackHostname(normalizedHostname(baseUrl, fallback));
}

function isAllowedOpenAiCompatibleHostedBaseUrl(baseUrl = LM_STUDIO_DEFAULT_BASE_URL) {
  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
  if (isLoopbackBaseUrl(normalized, LM_STUDIO_DEFAULT_BASE_URL)) return true;
  return OPENAI_COMPATIBLE_HOSTED_ALLOWED_HOSTS.has(normalizedHostname(normalized, LM_STUDIO_DEFAULT_BASE_URL));
}

function assertOpenAiCompatibleHostedAllowed(baseUrl = LM_STUDIO_DEFAULT_BASE_URL) {
  if (isAllowedOpenAiCompatibleHostedBaseUrl(baseUrl)) return;
  throw new Error("This hosted OpenAI-compatible endpoint is not in LoopCAT's explicit provider allowlist. Choose a named hosted provider preset or use a loopback server such as LM Studio.");
}

function isOllamaCloudBaseUrl(baseUrl) {
  return normalizedHostname(normalizeOllamaBaseUrl(baseUrl).rootBaseUrl, OLLAMA_CLOUD_BASE_URL) === "ollama.com";
}

function isOllamaCloudModel(model) {
  return /(?:-cloud|:cloud)(?:$|[:\s])/i.test(String(model || "").trim());
}

function localAiProviderNeedsApiKey(providerId, baseUrl) {
  if (providerId === "ollama") return isOllamaCloudBaseUrl(baseUrl);
  if (providerId === "openai") return true;
  if (providerId === "deepseek") return true;
  if (providerId === "gemini") return true;
  if (providerId === "anthropic") return true;
  if (providerId === "cohere") return true;
  if (providerId === "mistral") return true;
  if (providerId === "xai") return true;
  if (providerId === "perplexity") return true;
  if (providerId === "groq") return true;
  if (providerId === "together") return true;
  if (providerId === "openrouter") return true;
  if (providerId === "huggingface") return true;
  if (providerId === "deepinfra") return true;
  if (providerId === "fireworks") return true;
  if (providerId === "azure-openai") return true;
  if (providerId === "openai-compatible") return !isLoopbackBaseUrl(baseUrl, LM_STUDIO_DEFAULT_BASE_URL);
  if (providerId === "opus-cat") return false;
  return false;
}

function localAiProviderSharesExternally(providerId, baseUrl, model = "") {
  if (providerId === "ollama") {
    const rootBaseUrl = normalizeOllamaBaseUrl(baseUrl).rootBaseUrl;
    return !isLoopbackBaseUrl(rootBaseUrl, OLLAMA_DEFAULT_BASE_URL) || isOllamaCloudModel(model);
  }
  if (providerId === "openai") return true;
  if (providerId === "deepseek") return true;
  if (providerId === "gemini") return true;
  if (providerId === "anthropic") return true;
  if (providerId === "cohere") return true;
  if (providerId === "mistral") return true;
  if (providerId === "xai") return true;
  if (providerId === "perplexity") return true;
  if (providerId === "groq") return true;
  if (providerId === "together") return true;
  if (providerId === "openrouter") return true;
  if (providerId === "huggingface") return true;
  if (providerId === "deepinfra") return true;
  if (providerId === "fireworks") return true;
  if (providerId === "azure-openai") return true;
  if (providerId === "openai-compatible") return !isLoopbackBaseUrl(baseUrl, LM_STUDIO_DEFAULT_BASE_URL);
  if (providerId === "opus-cat") return !isLoopbackBaseUrl(baseUrl, OPUS_CAT_DEFAULT_BASE_URL);
  return true;
}

function localAiProviderGuidance(settings = {}) {
  const providerId = String(settings.providerId || settings.provider || "ollama").trim() || "ollama";
  const model = String(settings.model || settings.localModel || "").trim();
  const baseUrl = settings.baseUrl || settings.localBaseUrl || (
    providerId === "openai-compatible" ? LM_STUDIO_DEFAULT_BASE_URL : OLLAMA_DEFAULT_BASE_URL
  );
  const guidance = LOCAL_AI_PROVIDER_GUIDANCE[providerId] || null;
  if (!guidance) return "Best for provider-specific AI assistance through LoopCAT's shared translation workflow.";
  if (providerId === "ollama") {
    if (isOllamaCloudBaseUrl(baseUrl)) return guidance.hosted;
    if (isOllamaCloudModel(model)) return guidance.cloud;
    return guidance.local;
  }
  if (providerId === "openai-compatible" && !localAiProviderSharesExternally(providerId, baseUrl, model)) {
    return guidance.local;
  }
  if (providerId === "opus-cat" && !localAiProviderSharesExternally(providerId, baseUrl, model)) {
    return guidance.local;
  }
  return guidance.hosted || guidance.local || "Best for provider-specific AI assistance through LoopCAT's shared translation workflow.";
}

function bearerAuthHeaders(config = {}, headers = {}) {
  const apiKey = String(config.apiKey || "").trim();
  return apiKey
    ? { ...headers, Authorization: `Bearer ${apiKey}` }
    : { ...headers };
}

function geminiAuthHeaders(config = {}, headers = {}) {
  const apiKey = String(config.apiKey || "").trim();
  return apiKey
    ? { ...headers, "x-goog-api-key": apiKey }
    : { ...headers };
}

function anthropicAuthHeaders(config = {}, headers = {}) {
  const apiKey = String(config.apiKey || "").trim();
  const baseHeaders = { ...headers, "anthropic-version": ANTHROPIC_VERSION };
  return apiKey
    ? { ...baseHeaders, "x-api-key": apiKey }
    : baseHeaders;
}

function cohereAuthHeaders(config = {}, headers = {}) {
  return bearerAuthHeaders(config, { ...headers, "X-Client-Name": "LoopCAT" });
}

function azureOpenAiAuthHeaders(config = {}, headers = {}) {
  const apiKey = String(config.apiKey || "").trim();
  return apiKey
    ? { ...headers, "api-key": apiKey }
    : { ...headers };
}

function defaultLocalAiSettings(settings = {}, project = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const providerId = LOCAL_AI_PROVIDER_IDS.has(String(source.providerId || source.provider || "").trim())
    ? String(source.providerId || source.provider).trim()
    : "ollama";
  const fallbackBaseUrl = providerId === "openai"
    ? OPENAI_DEFAULT_BASE_URL
    : providerId === "deepseek"
      ? DEEPSEEK_DEFAULT_BASE_URL
    : providerId === "gemini"
      ? GEMINI_DEFAULT_BASE_URL
    : providerId === "anthropic"
      ? ANTHROPIC_DEFAULT_BASE_URL
    : providerId === "cohere"
      ? COHERE_DEFAULT_BASE_URL
    : providerId === "mistral"
      ? MISTRAL_DEFAULT_BASE_URL
    : providerId === "xai"
      ? XAI_DEFAULT_BASE_URL
    : providerId === "perplexity"
      ? PERPLEXITY_DEFAULT_BASE_URL
    : providerId === "groq"
      ? GROQ_DEFAULT_BASE_URL
    : providerId === "together"
      ? TOGETHER_DEFAULT_BASE_URL
    : providerId === "openrouter"
      ? OPENROUTER_DEFAULT_BASE_URL
    : providerId === "huggingface"
      ? HUGGINGFACE_DEFAULT_BASE_URL
    : providerId === "deepinfra"
      ? DEEPINFRA_DEFAULT_BASE_URL
    : providerId === "fireworks"
      ? FIREWORKS_DEFAULT_BASE_URL
    : providerId === "azure-openai"
      ? AZURE_OPENAI_DEFAULT_BASE_URL
    : providerId === "openai-compatible"
      ? LM_STUDIO_DEFAULT_BASE_URL
    : providerId === "opus-cat"
      ? OPUS_CAT_DEFAULT_BASE_URL
      : OLLAMA_DEFAULT_BASE_URL;
  const fallbackModel = providerId === "openai"
    ? OPENAI_DEFAULT_MODEL
    : providerId === "deepseek"
      ? DEEPSEEK_DEFAULT_MODEL
    : providerId === "gemini"
      ? GEMINI_DEFAULT_MODEL
      : providerId === "anthropic"
        ? ANTHROPIC_DEFAULT_MODEL
    : providerId === "cohere"
      ? COHERE_DEFAULT_MODEL
    : providerId === "mistral"
      ? MISTRAL_DEFAULT_MODEL
    : providerId === "xai"
      ? XAI_DEFAULT_MODEL
    : providerId === "perplexity"
      ? PERPLEXITY_DEFAULT_MODEL
    : providerId === "groq"
      ? GROQ_DEFAULT_MODEL
    : providerId === "together"
      ? TOGETHER_DEFAULT_MODEL
    : providerId === "openrouter"
      ? OPENROUTER_DEFAULT_MODEL
    : providerId === "huggingface"
      ? HUGGINGFACE_DEFAULT_MODEL
    : providerId === "deepinfra"
      ? DEEPINFRA_DEFAULT_MODEL
    : providerId === "fireworks"
      ? FIREWORKS_DEFAULT_MODEL
    : providerId === "azure-openai"
          ? AZURE_OPENAI_DEFAULT_MODEL
    : providerId === "opus-cat"
      ? OPUS_CAT_DEFAULT_MODEL
      : DEFAULT_LOCAL_AI_MODEL;
  const sourceCode = redactSensitiveText(source.sourceCode || source.localSourceCode || project?.sourceLang || "en").trim() || "en";
  const targetCode = redactSensitiveText(source.targetCode || source.localTargetCode || project?.targetLang || "tr").trim() || "tr";
  const mode = String(source.mode || source.localPretranslateMode || "untranslated").trim();
  const variantMode = String(source.variantMode || source.localVariantMode || "standard").trim();
  const adaptMode = String(source.adaptMode || source.localAdaptMode || "simplify").trim();
  return {
    providerId,
    baseUrl: normalizeUrl(source.baseUrl || source.localBaseUrl, fallbackBaseUrl),
    model: redactSensitiveText(source.model || source.localModel || fallbackModel).trim() || fallbackModel,
    sourceCode,
    sourceLanguage: redactSensitiveText(source.sourceLanguage || source.localSourceLang || languageNameForCode(sourceCode, sourceCode)).trim() || sourceCode,
    targetCode,
    targetLanguage: redactSensitiveText(source.targetLanguage || source.localTargetLang || languageNameForCode(targetCode, targetCode)).trim() || targetCode,
    mode: LOCAL_AI_PRETRANSLATION_MODES.has(mode) ? mode : "untranslated",
    variantMode: LOCAL_AI_VARIANT_MODES.has(variantMode) ? variantMode : "standard",
    adaptMode: LOCAL_AI_ADAPT_MODES.has(adaptMode) ? adaptMode : "simplify",
    concurrency: normalizedPositiveInteger(source.concurrency || source.localConcurrency, 1, 1, 2),
    timeoutMs: normalizedPositiveInteger(source.timeoutMs || source.localTimeoutMs, DEFAULT_LOCAL_AI_TIMEOUT_MS, 5000, 600000),
    overwriteExisting: Boolean(source.overwriteExisting || source.localOverwrite),
    preserveConfirmedLocked: source.preserveConfirmedLocked !== false && source.localPreserveConfirmedLocked !== false,
    includeNearbyContext: source.includeNearbyContext !== false && source.localIncludeNearbyContext !== false
  };
}

function projectLocalAiSettings(project = null) {
  const ai = project?.aiSettings || {};
  return defaultLocalAiSettings({
    providerId: ai.localProvider || ai.localProviderId,
    baseUrl: ai.localBaseUrl,
    model: ai.localModel,
    sourceCode: ai.localSourceCode || project?.sourceLang,
    sourceLanguage: ai.localSourceLang,
    targetCode: ai.localTargetCode || project?.targetLang,
    targetLanguage: ai.localTargetLang,
    mode: ai.localPretranslateMode,
    variantMode: ai.localVariantMode,
    adaptMode: ai.localAdaptMode,
    concurrency: ai.localConcurrency,
    timeoutMs: ai.localTimeoutMs,
    overwriteExisting: ai.localOverwrite,
    preserveConfirmedLocked: ai.localPreserveConfirmedLocked,
    includeNearbyContext: ai.localIncludeNearbyContext
  }, project);
}

function localAiSettingsForProjectUpdate(settings = {}, project = null) {
  const clean = defaultLocalAiSettings(settings, project);
  return {
    localProvider: clean.providerId,
    localBaseUrl: clean.baseUrl,
    localModel: clean.model,
    localSourceLang: clean.sourceLanguage,
    localSourceCode: clean.sourceCode,
    localTargetLang: clean.targetLanguage,
    localTargetCode: clean.targetCode,
    localPretranslateMode: clean.mode,
    localVariantMode: clean.variantMode,
    localAdaptMode: clean.adaptMode,
    localConcurrency: clean.concurrency,
    localTimeoutMs: clean.timeoutMs,
    localOverwrite: clean.overwriteExisting,
    localPreserveConfirmedLocked: clean.preserveConfirmedLocked,
    localIncludeNearbyContext: clean.includeNearbyContext
  };
}

function readLocalAiSettings() {
  try {
    return defaultLocalAiSettings(JSON.parse(localStorage.getItem(LOCAL_AI_SETTINGS_STORAGE) || "{}"));
  } catch {
    return defaultLocalAiSettings();
  }
}

function saveLocalAiSettings(settings) {
  const clean = defaultLocalAiSettings(settings);
  try {
    localStorage.setItem(LOCAL_AI_SETTINGS_STORAGE, JSON.stringify(clean));
  } catch (error) {
    console.warn("Local AI settings could not be saved.", error);
  }
  return clean;
}

const localAISettingsStore = {
  key: LOCAL_AI_SETTINGS_STORAGE,
  defaults: defaultLocalAiSettings,
  read: readLocalAiSettings,
  save: saveLocalAiSettings,
  projectSettings: projectLocalAiSettings,
  projectUpdateFields: localAiSettingsForProjectUpdate
};

function suggestionPrompt({ segment, tmMatches = [], terms = [], project = null }) {
  const targetLanguage = redactSensitiveText(project?.targetLang || "target language");
  const sourceLanguage = redactSensitiveText(project?.sourceLang || "source language");
  const tmContext = aiContextRecords(tmMatches)
    .filter((match) => match.source && match.target)
    .slice(0, 3)
    .map((match, index) => `${index + 1}. ${match.score || 0}% | ${compactPromptContext(match.source, 260)} => ${compactPromptContext(match.target, 260)}`)
    .join("\n");
  const termContext = aiContextRecords(terms)
    .filter((term) => term.sourceTerm && term.targetTerm)
    .slice(0, 12)
    .map((term) => `- ${compactPromptContext(term.sourceTerm, 180)} => ${compactPromptContext(term.targetTerm, 180)}${term.notes ? ` (${compactPromptContext(term.notes, 240)})` : ""}`)
    .join("\n");
  return [
    `Source language: ${sourceLanguage}`,
    `Target language: ${targetLanguage}`,
    project?.domain ? `Domain: ${redactSensitiveText(project.domain)}` : "",
    project?.aiSettings?.styleGuide ? `Style guide: ${redactSensitiveText(project.aiSettings.styleGuide)}` : "",
    tmContext ? `Translation memory context:\n${tmContext}` : "",
    termContext ? `Termbase context:\n${termContext}` : "",
    "Translate the source segment below. Preserve inline tags, placeholders, variables, numbers, and punctuation unless the target language requires a natural adjustment.",
    "Return only the translated target segment, with no commentary.",
    `Source segment:\n${segment?.source || ""}`
  ].filter(Boolean).join("\n\n");
}

function glossaryPromptBlock(glossaryTerms = []) {
  const terms = aiContextRecords(glossaryTerms)
    .filter((term) => term.sourceTerm && term.targetTerm)
    .slice(0, 12)
    .map((term) => `- ${compactPromptContext(term.sourceTerm, 120)} => ${compactPromptContext(term.targetTerm, 120)}`);
  return terms.length ? `\n\nProject glossary hints:\n${terms.join("\n")}` : "";
}

function translationMemoryPromptBlock(tmMatches = []) {
  const matches = aiContextRecords(tmMatches)
    .filter((match) => match.source && match.target)
    .slice(0, 3)
    .map((match, index) => {
      const score = Number(match.score || 0);
      return `${index + 1}. ${Number.isFinite(score) ? Math.round(score) : 0}% | ${compactPromptContext(match.source, 220)} => ${compactPromptContext(match.target, 220)}`;
    });
  return matches.length ? `\n\nTranslation memory hints:\n${matches.join("\n")}` : "";
}

function surroundingSegmentPromptBlock(surroundingSegments = []) {
  const context = aiContextRecords(surroundingSegments)
    .filter((segment) => segment.source)
    .slice(0, 4)
    .map((segment) => {
      const relation = compactPromptContext(segment.relation || segment.label || "Nearby segment", 80);
      const source = compactPromptContext(segment.source, 220);
      const target = compactPromptContext(segment.target || "", 220);
      return target
        ? `- ${relation} source: ${source}\n  ${relation} target draft: ${target}`
        : `- ${relation} source: ${source}`;
    });
  return context.length
    ? `\n\nNearby segment context (do not translate this context; use it only to resolve meaning, terminology, pronouns, UI flow, and tone):\n${context.join("\n")}`
    : "";
}

function buildTranslateGemmaPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const text = String(request.text ?? request.segment?.source ?? "");
  const rules = [
    "CAT-tool requirements:",
    "- Preserve placeholders exactly, including {name}, %s, %1$s, {{variable}}, <0>...</0>, XML/HTML tags, ICU syntax, markdown links, and escaped newline sequences.",
    "- Do not add explanations, quotes, markdown, comments, or alternative translations.",
    "- Preserve leading/trailing whitespace unless the editor normalizes it.",
    "- Keep numbers, product names, keyboard shortcuts, file paths, and variables unchanged unless translation requires surrounding grammar changes.",
    "- Do not translate locked placeholders or tags."
  ].join("\n");
  return [
    `You are a professional ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLanguage} text while adhering to ${targetLanguage} grammar, vocabulary, and cultural sensitivities.`,
    `Produce only the ${targetLanguage} translation, without any additional explanations or commentary.`,
    rules + surroundingSegmentPromptBlock(request.surroundingSegments) + translationMemoryPromptBlock(request.tmMatches) + glossaryPromptBlock(request.glossaryTerms),
    `Please translate the following ${sourceLanguage} text into ${targetLanguage}:\n\n${text}`
  ].join("\n\n");
}

function buildAiReviewPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const rules = [
    "Review checklist:",
    "- Meaning accuracy, omissions, additions, mistranslations, fluency, grammar, register, and locale fit.",
    "- Placeholder, tag, variable, markdown link, ICU syntax, number, date, product-name, keyboard-shortcut, and file-path preservation.",
    "- Terminology consistency with any project glossary hints.",
    "- Do not rewrite the full translation unless a short replacement fragment is needed to explain a fix.",
    "- If there are no issues, return exactly: No issues found.",
    "- If there are issues, return concise bullet points in this format: Severity | Issue | Suggested fix.",
    "- Use one of these severity labels at the start of each issue: Critical, High, Medium, Low, or Info."
  ].join("\n");
  return [
    `You are a senior translation reviewer for a CAT tool. Review one ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) segment.`,
    rules + glossaryPromptBlock(request.glossaryTerms),
    `Source ${sourceLanguage} text:\n${sourceText}`,
    `Target ${targetLanguage} text:\n${targetText}`
  ].join("\n\n");
}

function normalizeAiReviewRiskLevel(value) {
  const clean = String(value || "").trim().toLocaleLowerCase("en-US");
  if (!clean || /^no issues? found\.?$/.test(clean)) return "none";
  if (/\b(?:critical|blocker|blocking|fatal)\b/.test(clean)) return "critical";
  if (/\b(?:high|major|severe|serious|error)\b/.test(clean)) return "high";
  if (/\b(?:medium|moderate|warning|warn)\b/.test(clean)) return "medium";
  if (/\b(?:low|minor|info|informational|note|style|suggestion)\b/.test(clean)) return "low";
  if (AI_REVIEW_RISK_LEVELS.includes(clean)) return clean;
  return "";
}

function aiReviewRiskLabel(level) {
  return {
    none: "No issues found",
    low: "Low risk",
    medium: "Medium risk",
    high: "High risk",
    critical: "Critical risk"
  }[level] || "Unranked risk";
}

function parseAiReviewRisk(reviewText = "") {
  const text = String(reviewText || "").trim();
  if (!text || /^no issues? found\.?$/i.test(text)) {
    return { level: "none", score: 0, issueCount: 0, label: aiReviewRiskLabel("none") };
  }
  const order = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  let strongest = "low";
  let issueCount = 0;
  lines.forEach((line) => {
    if (/^no issues? found\.?$/i.test(line)) return;
    issueCount += 1;
    const severityCell = line.split("|")[0] || "";
    const level = normalizeAiReviewRiskLevel(severityCell) || normalizeAiReviewRiskLevel(line) || "low";
    if (order[level] > order[strongest]) strongest = level;
  });
  if (!issueCount) return { level: "none", score: 0, issueCount: 0, label: aiReviewRiskLabel("none") };
  return {
    level: strongest,
    score: AI_REVIEW_RISK_SCORES[strongest] ?? AI_REVIEW_RISK_SCORES.low,
    issueCount,
    label: aiReviewRiskLabel(strongest)
  };
}

function protectedTokenList(request = {}) {
  const fromRequest = Array.isArray(request.protectedTokens) ? request.protectedTokens : [];
  const fromSegment = Array.isArray(request.segment?.tags)
    ? request.segment.tags.map((tag) => tag?.text || tag?.label || "")
    : [];
  const source = String(request.sourceText ?? request.segment?.source ?? "");
  const placeholderPattern = /(\{\{[^{}]+\}\}|\{[^{}\s]+\}|%[0-9]*\$?[sdif]|<\d+>|<\/\d+>|<\/?[A-Za-z][^>\s]*(?:\s[^>]*)?>|\\n|\[[^\]]+\]\([^)]+\))/g;
  const fromSource = source.match(placeholderPattern) || [];
  return [...new Set([...fromRequest, ...fromSegment, ...fromSource].map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildTagRepairPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const tokens = protectedTokenList({ ...request, sourceText });
  const tokenBlock = tokens.length
    ? `Protected tokens that must appear exactly as written:\n${tokens.map((token) => `- ${token}`).join("\n")}`
    : "No explicit protected tokens were detected, but preserve any placeholders, tags, variables, markdown links, numbers, and escaped newline sequences already present.";
  return [
    `You are repairing one ${targetLanguage} (${targetCode}) CAT-tool target segment translated from ${sourceLanguage} (${sourceCode}).`,
    "Return only the corrected target segment. Do not explain, quote, wrap in markdown, or include alternatives.",
    "Fix only placeholder, tag, variable, markdown link, escaped newline, number, and obvious spacing issues needed to make the target safe for export. Do not otherwise retranslate or polish the segment.",
    tokenBlock,
    `Source ${sourceLanguage} text:\n${sourceText}`,
    `Current target ${targetLanguage} text:\n${targetText}`
  ].join("\n\n");
}

function targetVariantModeSpec(mode = "standard") {
  const clean = LOCAL_AI_VARIANT_MODES.has(String(mode || "").trim()) ? String(mode).trim() : "standard";
  const specs = {
    standard: {
      labels: ["Literal", "Fluent", "Terminology-strict"],
      guidance: "Balance meaning fidelity, natural target-language flow, and project terminology."
    },
    formal: {
      labels: ["Formal", "Neutral-formal", "Formal-terminology-strict"],
      guidance: "Make the alternatives more formal and polished while preserving exact meaning and project terminology."
    },
    concise: {
      labels: ["Concise", "Short UI", "Concise-terminology-strict"],
      guidance: "Make the alternatives shorter and easier to scan, suitable for UI or space-constrained text, without dropping required meaning."
    },
    locale: {
      labels: ["Locale-native", "Culturally-adapted", "Locale-terminology-strict"],
      guidance: "Adapt phrasing naturally for the target locale while preserving product names, facts, placeholders, tags, and terminology."
    },
    plain: {
      labels: ["Plain-language", "Screen-reader-friendly", "Plain-terminology-strict"],
      guidance: "Make the alternatives clear, direct, and accessible, avoiding unnecessary complexity while preserving meaning."
    }
  };
  return specs[clean] || specs.standard;
}

function buildTargetVariantsPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const tokens = protectedTokenList({ ...request, sourceText });
  const variantSpec = targetVariantModeSpec(request.variantMode);
  const labelLines = variantSpec.labels.map((label) => `${label}: <target-language text>`).join("\n");
  const tokenBlock = tokens.length
    ? `Protected tokens that must appear exactly as written in every alternative:\n${tokens.map((token) => `- ${token}`).join("\n")}`
    : "No explicit protected tokens were detected, but preserve any placeholders, tags, variables, markdown links, numbers, and escaped newline sequences already present.";
  const targetBlock = targetText.trim()
    ? `Current target ${targetLanguage} draft:\n${targetText}`
    : `Current target ${targetLanguage} draft:\nNo target draft is available yet. Generate alternatives directly from the source.`;
  return [
    `You are generating reviewable ${targetLanguage} (${targetCode}) alternatives for one ${sourceLanguage} (${sourceCode}) CAT-tool segment.`,
    `Return exactly three alternatives, one per line, using this format:\n${labelLines}`,
    variantSpec.guidance,
    "Do not add explanations, quotes, markdown, comments, JSON, or alternative headings beyond the three required labels.",
    "Each alternative must preserve placeholders, tags, variables, markdown links, ICU syntax, escaped newline sequences, keyboard shortcuts, file paths, product names, and numbers unless target-language grammar requires surrounding word changes.",
    tokenBlock + glossaryPromptBlock(request.glossaryTerms),
    `Source ${sourceLanguage} text:\n${sourceText}`,
    targetBlock
  ].join("\n\n");
}

function buildStylePolishPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const tokens = protectedTokenList({ ...request, sourceText });
  const tokenBlock = tokens.length
    ? `Protected tokens that must appear exactly as written:\n${tokens.map((token) => `- ${token}`).join("\n")}`
    : "No explicit protected tokens were detected, but preserve any placeholders, tags, variables, markdown links, numbers, keyboard shortcuts, file paths, and escaped newline sequences already present.";
  const project = request.project || {};
  const styleGuide = redactSensitiveText(request.styleGuide || project?.aiSettings?.styleGuide || "").trim();
  return [
    `You are polishing one ${targetLanguage} (${targetCode}) CAT-tool target segment translated from ${sourceLanguage} (${sourceCode}).`,
    "Return only one improved target segment. Do not explain, quote, wrap in markdown, include alternatives, or add comments.",
    "Improve fluency, grammar, register, terminology consistency, and fit with project style instructions while preserving the exact source meaning. Do not add or remove facts.",
    tokenBlock + translationMemoryPromptBlock(request.tmMatches) + glossaryPromptBlock(request.glossaryTerms),
    styleGuide ? `Project style instructions:\n${compactPromptContext(styleGuide, 1200)}` : "Project style instructions:\nNo explicit style guide is available. Polish conservatively.",
    `Source ${sourceLanguage} text:\n${sourceText}`,
    `Current target ${targetLanguage} draft:\n${targetText}`
  ].join("\n\n");
}

function targetAdaptModeSpec(mode = "simplify") {
  const clean = LOCAL_AI_ADAPT_MODES.has(String(mode || "").trim()) ? String(mode).trim() : "simplify";
  const specs = {
    simplify: {
      label: "Simplify and clarify",
      guidance: "Make the target easier to understand, more direct, and more accessible while preserving the full source meaning."
    },
    formalize: {
      label: "Formalize",
      guidance: "Make the target more formal, polite, and publication-ready while preserving the full source meaning."
    },
    localize: {
      label: "Locale-adapt",
      guidance: "Make the target sound natural for the target locale, including idiom, date/unit conventions, and UI phrasing when appropriate, while preserving facts and values."
    },
    shorten: {
      label: "Shorten",
      guidance: "Make the target shorter and more scannable for UI or constrained layouts without omitting required meaning."
    }
  };
  return specs[clean] || specs.simplify;
}

function buildDraftAdaptationPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const tokens = protectedTokenList({ ...request, sourceText });
  const modeSpec = targetAdaptModeSpec(request.adaptMode);
  const tokenBlock = tokens.length
    ? `Protected tokens that must appear exactly as written:\n${tokens.map((token) => `- ${token}`).join("\n")}`
    : "No explicit protected tokens were detected, but preserve placeholders, tags, variables, markdown links, ICU syntax, escaped newline sequences, numbers, keyboard shortcuts, file paths, and product names already present.";
  const project = request.project || {};
  const styleGuide = redactSensitiveText(request.styleGuide || project?.aiSettings?.styleGuide || "").trim();
  return [
    `You are adapting one ${targetLanguage} (${targetCode}) CAT-tool target segment translated from ${sourceLanguage} (${sourceCode}).`,
    "Return only one adapted target segment. Do not explain, quote, wrap in markdown, include alternatives, or add comments.",
    `Adaptation task: ${modeSpec.label}. ${modeSpec.guidance}`,
    "Preserve exact source meaning, required terminology, placeholders, tags, variables, markdown links, ICU syntax, escaped newline sequences, numbers, keyboard shortcuts, file paths, and product names unless the adaptation task requires surrounding grammar changes.",
    tokenBlock + translationMemoryPromptBlock(request.tmMatches) + glossaryPromptBlock(request.glossaryTerms),
    styleGuide ? `Project style instructions:\n${compactPromptContext(styleGuide, 1200)}` : "Project style instructions:\nNo explicit style guide is available. Adapt conservatively.",
    `Source ${sourceLanguage} text:\n${sourceText}`,
    `Current target ${targetLanguage} draft:\n${targetText}`
  ].join("\n\n");
}

function buildTerminologyExtractionPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const targetBlock = targetText.trim()
    ? `Target ${targetLanguage} text:\n${targetText}`
    : `Target ${targetLanguage} text:\nNo target draft is available yet. Propose target terms from the source context.`;
  return [
    `You are extracting terminology candidates for a ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) CAT-tool termbase.`,
    "Return only a JSON array with up to five objects. Each object must use exactly these keys: sourceTerm, targetTerm, note.",
    "Extract only reusable product terms, UI labels, domain terms, named features, or multi-word concepts. Do not include ordinary function words, full sentences, placeholders, tags, variables, numbers by themselves, or duplicates.",
    "Keep sourceTerm and targetTerm concise. If the existing target draft contains the term translation, prefer that wording. If no useful term exists, return [].",
    `Source ${sourceLanguage} text:\n${sourceText}`,
    targetBlock
  ].join("\n\n");
}

function terminologyApplicationBlocks(terms = []) {
  const records = aiContextRecords(terms)
    .filter((term) => term.sourceTerm && term.targetTerm)
    .slice(0, 16);
  const approved = records
    .filter((term) => !term.isForbidden)
    .map((term) => `- ${compactPromptContext(term.sourceTerm, 100)} => ${compactPromptContext(term.targetTerm, 100)}${term.notes ? ` (${compactPromptContext(term.notes, 160)})` : ""}`);
  const forbidden = records
    .filter((term) => term.isForbidden)
    .map((term) => `- ${compactPromptContext(term.sourceTerm, 100)} must not be translated as ${compactPromptContext(term.targetTerm, 100)}${term.notes ? ` (${compactPromptContext(term.notes, 160)})` : ""}`);
  return {
    approved,
    forbidden
  };
}

function buildTerminologyApplicationPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const sourceText = String(request.sourceText ?? request.segment?.source ?? "");
  const targetText = String(request.targetText ?? request.segment?.target ?? "");
  const tokens = protectedTokenList({ ...request, sourceText });
  const { approved, forbidden } = terminologyApplicationBlocks(request.glossaryTerms || request.terms || []);
  const tokenBlock = tokens.length
    ? `Protected tokens that must appear exactly as written:\n${tokens.map((token) => `- ${token}`).join("\n")}`
    : "No explicit protected tokens were detected, but preserve placeholders, tags, variables, markdown links, numbers, keyboard shortcuts, file paths, and escaped newline sequences already present.";
  return [
    `You are applying project terminology to one ${targetLanguage} (${targetCode}) CAT-tool target segment translated from ${sourceLanguage} (${sourceCode}).`,
    "Return only one revised target segment. Do not explain, quote, wrap in markdown, include alternatives, or add comments.",
    "Apply approved terminology when the source segment contains the matching source term. Avoid forbidden target terms. Preserve exact source meaning and do not rewrite unrelated wording unless needed for grammar around the term.",
    tokenBlock,
    approved.length ? `Approved project terminology:\n${approved.join("\n")}` : "Approved project terminology:\nNo approved matching terms are available.",
    forbidden.length ? `Forbidden terminology to avoid:\n${forbidden.join("\n")}` : "Forbidden terminology to avoid:\nNo forbidden matching terms are available.",
    `Source ${sourceLanguage} text:\n${sourceText}`,
    `Current target ${targetLanguage} draft:\n${targetText}`
  ].join("\n\n");
}

function buildProjectBriefPrompt(request = {}) {
  const sourceCode = redactSensitiveText(request.sourceCode || request.project?.sourceLang || "und").trim() || "und";
  const targetCode = redactSensitiveText(request.targetCode || request.project?.targetLang || "und").trim() || "und";
  const sourceLanguage = redactSensitiveText(request.sourceLanguage || languageNameForCode(sourceCode, "source language")).trim() || "source language";
  const targetLanguage = redactSensitiveText(request.targetLanguage || languageNameForCode(targetCode, "target language")).trim() || "target language";
  const project = request.project || {};
  const documents = (request.documents || [])
    .map((item) => compactPromptContext(item?.name || item?.fileName || item?.id || "", 120))
    .filter(Boolean)
    .slice(0, 8);
  const terms = (request.terms || [])
    .map((term) => `${compactPromptContext(term.sourceTerm, 80)} -> ${compactPromptContext(term.targetTerm, 80)}`)
    .filter((item) => item.trim() !== "->")
    .slice(0, 12);
  const samples = (request.sampleSegments || [])
    .map((segment, index) => {
      const source = compactPromptContext(segment.source || segment.text || "", 240);
      const target = compactPromptContext(segment.target || "", 240);
      if (!source && !target) return "";
      return `${index + 1}. Source: ${source}\n   Target: ${target || "(empty)"}`;
    })
    .filter(Boolean)
    .slice(0, 6);
  return [
    `Create a concise translation project brief for a ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) CAT-tool project.`,
    "Return only reusable project instructions for translators and AI assistants. Use short bullets under these headings: Domain, Audience, Tone, Terminology, Formatting, Risks.",
    "Do not include secrets, API keys, private credentials, generic encouragement, markdown tables, or source text longer than needed. Do not invent client requirements that are not supported by the metadata or samples.",
    `Project name: ${compactPromptContext(project.name || "Untitled project", 120)}`,
    `Domain: ${compactPromptContext(project.domain || "Not specified", 160)}`,
    documents.length ? `Documents:\n${documents.map((name) => `- ${name}`).join("\n")}` : "Documents: Not specified",
    terms.length ? `Existing termbase hints:\n${terms.map((term) => `- ${term}`).join("\n")}` : "Existing termbase hints: None",
    samples.length ? `Representative segments:\n${samples.join("\n")}` : "Representative segments: None"
  ].join("\n\n");
}

function parseTargetVariantSuggestions(rawOutput, sourceText = "") {
  const cleaned = stripModelWrapper(rawOutput, sourceText).replace(/^\s*```(?:json|text)?\s*|\s*```\s*$/gi, "").trim();
  if (!cleaned) return [];
  try {
    const data = JSON.parse(cleaned);
    const items = Array.isArray(data) ? data : Array.isArray(data?.alternatives) ? data.alternatives : Array.isArray(data?.variants) ? data.variants : [];
    const parsed = items.map((item, index) => {
      if (typeof item === "string") return { label: `Alternative ${index + 1}`, suggestedTarget: cleanModelTranslationOutput(item, sourceText) };
      const label = String(item?.label || item?.mode || item?.type || `Alternative ${index + 1}`).trim();
      const suggestedTarget = cleanModelTranslationOutput(item?.suggestedTarget || item?.target || item?.translation || item?.text || "", sourceText);
      return { label, suggestedTarget };
    }).filter((item) => item.suggestedTarget);
    if (parsed.length) return dedupeTargetVariants(parsed);
  } catch {}
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^```/.test(line) && !/^here (?:are|is)\b/i.test(line));
  const parsed = [];
  for (const line of lines) {
    const normalized = line.replace(/^[>*\-\s]+/, "").trim();
    const labelled = normalized.match(/^(?:\d+[\).]\s*)?([A-Za-z][A-Za-z\s-]{1,32})\s*[:\-]\s*(.+)$/);
    const numbered = normalized.match(/^\d+[\).]\s*(.+)$/);
    if (labelled) {
      parsed.push({
        label: labelled[1].replace(/\s+/g, " ").trim(),
        suggestedTarget: cleanModelTranslationOutput(labelled[2], sourceText)
      });
    } else if (numbered) {
      parsed.push({
        label: `Alternative ${parsed.length + 1}`,
        suggestedTarget: cleanModelTranslationOutput(numbered[1], sourceText)
      });
    } else if (lines.length <= 4 && !/[{}[\]]/.test(normalized)) {
      parsed.push({
        label: `Alternative ${parsed.length + 1}`,
        suggestedTarget: cleanModelTranslationOutput(normalized, sourceText)
      });
    }
  }
  return dedupeTargetVariants(parsed.filter((item) => item.suggestedTarget));
}

function dedupeTargetVariants(variants = []) {
  const seen = new Set();
  const result = [];
  for (const variant of variants) {
    const suggestedTarget = String(variant.suggestedTarget || "").trim();
    const key = suggestedTarget.toLocaleLowerCase();
    if (!suggestedTarget || seen.has(key)) continue;
    seen.add(key);
    result.push({
      label: redactSensitiveText(variant.label || `Alternative ${result.length + 1}`).trim() || `Alternative ${result.length + 1}`,
      suggestedTarget
    });
  }
  return result.slice(0, 4);
}

function parseTerminologyExtractionSuggestions(rawOutput) {
  const cleaned = stripModelWrapper(rawOutput, "").replace(/^\s*```(?:json|text)?\s*|\s*```\s*$/gi, "").trim();
  if (!cleaned || cleaned === "[]") return [];
  try {
    const data = JSON.parse(cleaned);
    const items = Array.isArray(data) ? data : Array.isArray(data?.terms) ? data.terms : Array.isArray(data?.candidates) ? data.candidates : [];
    const parsed = items.map((item) => ({
      sourceTerm: item?.sourceTerm || item?.source || item?.term || "",
      targetTerm: item?.targetTerm || item?.target || item?.translation || "",
      note: item?.note || item?.notes || item?.reason || ""
    }));
    const deduped = dedupeTermExtractionSuggestions(parsed);
    if (deduped.length) return deduped;
  } catch {}
  const parsed = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^```/.test(line) && !/^here (?:are|is)\b/i.test(line))
    .map((line) => {
      const normalized = line.replace(/^[>*\-\d\).\s]+/, "").trim();
      const parts = normalized.split(/\s*(?:=>|->|\||\t)\s*/).map((part) => part.trim()).filter(Boolean);
      return {
        sourceTerm: parts[0] || "",
        targetTerm: parts[1] || "",
        note: parts.slice(2).join(" | ")
      };
    });
  return dedupeTermExtractionSuggestions(parsed);
}

function dedupeTermExtractionSuggestions(terms = []) {
  const seen = new Set();
  const result = [];
  for (const term of terms) {
    const sourceTerm = redactSensitiveText(term?.sourceTerm || "").trim();
    const targetTerm = redactSensitiveText(term?.targetTerm || "").trim();
    if (!sourceTerm || !targetTerm) continue;
    if (/^[{}%<>\\\d\s.,:;!?'"()[\]-]+$/.test(sourceTerm)) continue;
    if (/^(\{\{[^{}]+\}\}|\{[^{}\s]+\}|%[0-9]*\$?[sdif]|<\/?[^>]+>|\\n)$/.test(sourceTerm)) continue;
    const key = `${sourceTerm.toLocaleLowerCase()}::${targetTerm.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      sourceTerm,
      targetTerm,
      note: redactSensitiveText(term?.note || "").trim()
    });
  }
  return result.slice(0, 5);
}

function stripModelWrapper(value, sourceText = "") {
  let text = String(value || "");
  const sourceTrimmed = String(sourceText || "").trim();
  const fence = text.match(/^\s*```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$/);
  if (fence) text = fence[1];
  text = text.replace(/^\s*(?:translation|target|output)\s*:\s*/i, "");
  const trimmed = text.trim();
  const pairedQuote = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (
    pairedQuote &&
    trimmed.length > 1 &&
    !trimmed.slice(1, -1).includes("\n") &&
    !sourceTrimmed.startsWith(trimmed[0]) &&
    !sourceTrimmed.endsWith(trimmed[trimmed.length - 1])
  ) {
    text = trimmed.slice(1, -1);
  }
  return text;
}

function cleanModelTranslationOutput(value, sourceText = "") {
  const stripped = stripModelWrapper(value, sourceText);
  const source = String(sourceText || "");
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  const core = stripped.trim();
  return `${leading}${core}${trailing}`;
}

function aiContextSettings(project) {
  const settings = project?.aiSettings || {};
  return {
    useTmContext: settings.useTmContext !== false,
    useTermbaseContext: settings.useTermbaseContext !== false
  };
}

function filteredAiContext({ tmMatches = [], terms = [], project = null }) {
  const settings = aiContextSettings(project);
  const safeTmMatches = aiContextRecords(tmMatches);
  const safeTerms = aiContextRecords(terms);
  return {
    tmMatches: settings.useTmContext ? safeTmMatches : [],
    terms: settings.useTermbaseContext ? safeTerms : []
  };
}

function extractResponseText(data) {
  if (data?.output_text !== undefined && data?.output_text !== null) return String(data.output_text);
  const chunks = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  output.forEach((item) => {
    const contentList = Array.isArray(item?.content) ? item.content : [];
    contentList.forEach((content) => {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    });
  });
  return chunks.join("\n").trim();
}

function openAiProviderErrorMessage(data, status) {
  const message = data?.error?.message || `OpenAI request failed with status ${status}.`;
  return redactSensitiveText(message).trim() || "OpenAI request failed.";
}

function externalAiSourceSharingAllowed(project) {
  const settings = project?.aiSettings || {};
  return Boolean(settings.enabled && settings.sendSourceToAi);
}

function isOpenAiProvider(project) {
  return String(project?.aiSettings?.provider || "OpenAI").trim().toLowerCase() === "openai";
}

function normalizedOpenAiTimeoutMs(value) {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : OPENAI_REQUEST_TIMEOUT_MS;
}

function browserAppearsOffline() {
  return typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false;
}

async function fetchOpenAiResponse(request, timeoutMs) {
  if (browserAppearsOffline()) {
    throw new Error("OpenAI suggestions need an internet connection. LoopCAT appears to be offline.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizedOpenAiTimeoutMs(timeoutMs));
  try {
    return await fetch(OPENAI_RESPONSES_URL, { ...request, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenAI request timed out. Check your connection or try again later.");
    }
    throw new Error("OpenAI request could not connect. Check your internet connection or provider access and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function openAiSuggestion({ apiKey, segment, tmMatches = [], terms = [], project = null, timeoutMs = OPENAI_REQUEST_TIMEOUT_MS }) {
  if (!segment?.source?.trim()) throw new Error("The active segment has no source text.");
  if (!externalAiSourceSharingAllowed(project)) {
    throw new Error("OpenAI suggestions require AI helpers and source sharing to be enabled for this project.");
  }
  if (!isOpenAiProvider(project)) {
    throw new Error("Choose OpenAI as the provider before requesting an OpenAI suggestion.");
  }
  if (browserAppearsOffline()) {
    throw new Error("OpenAI suggestions need an internet connection. LoopCAT appears to be offline.");
  }
  if (!apiKey) throw new Error("Add your OpenAI API key first.");
  const context = filteredAiContext({ tmMatches, terms, project });
  const model = redactSensitiveText(project?.aiSettings?.model || "").trim() || OPENAI_DEFAULT_MODEL;
  const response = await fetchOpenAiResponse({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: "You are a professional translation assistant inside LoopCAT. Produce accurate, fluent target-language translations for individual CAT-tool segments.",
      input: suggestionPrompt({ segment, tmMatches: context.tmMatches, terms: context.terms, project }),
      max_output_tokens: 900
    })
  }, timeoutMs);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(openAiProviderErrorMessage(data, response.status));
  }
  const suggestedTarget = extractResponseText(data).trim();
  if (!suggestedTarget) throw new Error("OpenAI returned an empty suggestion.");
  return {
    id: makeId("ai-suggestion"),
    provider: "OpenAI",
    model,
    segmentId: segment.id || "",
    suggestedTarget,
    confidence: 0,
    explanation: [
      "Generated through the OpenAI Responses API.",
      context.tmMatches.length ? `Included ${Math.min(context.tmMatches.length, 3)} TM match${Math.min(context.tmMatches.length, 3) === 1 ? "" : "es"}.` : "No TM context was included.",
      context.terms.length ? `Included ${Math.min(context.terms.length, 12)} termbase hit${Math.min(context.terms.length, 12) === 1 ? "" : "s"}.` : "No termbase context was included.",
      project?.aiSettings?.styleGuide ? "Project style instructions were included." : ""
    ].filter(Boolean),
    status: "review",
    createdAt: new Date().toISOString()
  };
}

function requestDurationMs(startedAt) {
  return Math.max(0, Math.round((typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt));
}

function localAiStartedAt() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function isAbortError(error) {
  return error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("abort");
}

async function fetchJsonWithTimeout(url, options = {}, config = {}) {
  const fetchImpl = config.fetchImpl || fetch;
  const timeoutMs = normalizedPositiveInteger(config.timeoutMs, DEFAULT_LOCAL_AI_TIMEOUT_MS, 5000, 600000);
  const controller = new AbortController();
  let externalAborted = false;
  const onAbort = () => {
    externalAborted = true;
    controller.abort();
  };
  if (config.signal) {
    if (config.signal.aborted) onAbort();
    else config.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response = null;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (externalAborted || config.signal?.aborted) throw new Error("Local AI request canceled.");
    if (isAbortError(error)) throw new Error("Local AI request timed out. Try a smaller model or increase the timeout.");
    throw error;
  } finally {
    clearTimeout(timer);
    if (config.signal) config.signal.removeEventListener?.("abort", onAbort);
  }
  const data = await response.json().catch(() => null);
  return { response, data };
}

function ollamaReachableError(baseUrl) {
  const rootBaseUrl = normalizeOllamaBaseUrl(baseUrl).rootBaseUrl;
  if (isOllamaCloudBaseUrl(rootBaseUrl)) return "Ollama Cloud is not reachable. Check your connection and hosted Ollama access.";
  return `Ollama is not reachable at ${rootBaseUrl}. Start Ollama and try again.`;
}

function ollamaStatusError(data, status, model = "") {
  const raw = redactSensitiveText(data?.error || data?.message || "").trim();
  if (status === 401 || status === 403) {
    return "Ollama rejected the request. Add or check the Ollama API key for hosted Ollama.";
  }
  if (/not\s+found|model/i.test(raw) && model) {
    return `Model ${model} is not installed. Pull it from the AI Command Centre.`;
  }
  if (status === 404 && model) return `Model ${model} is not installed. Pull it from the AI Command Centre.`;
  return raw || `Ollama request failed with status ${status}.`;
}

async function ollamaJson(endpoint, options = {}, config = {}) {
  const url = ollamaApiUrl(config.baseUrl || OLLAMA_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    if (String(error?.message || "").includes("canceled") || String(error?.message || "").includes("timed out")) throw error;
    throw new Error(ollamaReachableError(config.baseUrl || OLLAMA_DEFAULT_BASE_URL));
  }
  if (!result.response?.ok) {
    throw new Error(ollamaStatusError(result.data, result.response?.status, config.model));
  }
  return result.data;
}

const OllamaProvider = {
  id: "ollama",
  name: "Ollama",
  defaultBaseUrl: OLLAMA_DEFAULT_BASE_URL,
  defaultModel: DEFAULT_LOCAL_AI_MODEL,
  async testConnection(config = {}) {
    const hosted = isOllamaCloudBaseUrl(config.baseUrl || OLLAMA_DEFAULT_BASE_URL);
    if (hosted && localAiProviderNeedsApiKey("ollama", config.baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error("Add an Ollama API key before using hosted Ollama.");
    }
    const data = hosted
      ? await ollamaJson("/tags", { method: "GET", headers: bearerAuthHeaders(config) }, config)
      : await ollamaJson("/version", { method: "GET", headers: bearerAuthHeaders(config) }, config);
    return {
      ok: true,
      provider: hosted ? "Ollama Cloud" : "Ollama",
      version: data?.version || "",
      baseUrl: normalizeOllamaBaseUrl(config.baseUrl || OLLAMA_DEFAULT_BASE_URL).rootBaseUrl
    };
  },
  async listModels(config = {}) {
    if (isOllamaCloudBaseUrl(config.baseUrl || OLLAMA_DEFAULT_BASE_URL) && !String(config.apiKey || "").trim()) {
      throw new Error("Add an Ollama API key before refreshing hosted Ollama models.");
    }
    const data = await ollamaJson("/tags", { method: "GET", headers: bearerAuthHeaders(config) }, config);
    const models = Array.isArray(data?.models)
      ? data.models.map((model) => ({
        name: String(model.name || model.model || "").trim(),
        size: model.size || 0,
        modifiedAt: model.modified_at || model.modifiedAt || ""
      })).filter((model) => model.name)
      : [];
    return { models, raw: data };
  },
  async pullModel(config = {}, modelName = DEFAULT_LOCAL_AI_MODEL, onProgress = null) {
    const model = String(modelName || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
    if (isOllamaCloudBaseUrl(config.baseUrl || OLLAMA_DEFAULT_BASE_URL)) {
      throw new Error("Model pull is only available for local Ollama. Refresh hosted Ollama models instead.");
    }
    onProgress?.({ status: "starting", model });
    const data = await ollamaJson("/pull", {
      method: "POST",
      headers: bearerAuthHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: model, stream: false })
    }, { ...config, model });
    onProgress?.({ status: "complete", model });
    return { ok: true, model, raw: data };
  },
  async translateSegment(config = {}, request = {}) {
    const settings = defaultLocalAiSettings({ ...config, model: config.model || request.model }, request.project);
    const model = String(config.model || request.model || settings.model || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
    const sourceText = String(request.text ?? request.segment?.source ?? "");
    if (!sourceText.trim()) throw new Error("The segment has no source text.");
    if (isOllamaCloudBaseUrl(config.baseUrl || settings.baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error("Add an Ollama API key before sending source text to hosted Ollama.");
    }
    const prompt = request.prompt || buildTranslateGemmaPrompt({
      sourceLanguage: request.sourceLanguage || settings.sourceLanguage,
      sourceCode: request.sourceCode || settings.sourceCode,
      targetLanguage: request.targetLanguage || settings.targetLanguage,
      targetCode: request.targetCode || settings.targetCode,
      text: sourceText,
      segment: request.segment,
      glossaryTerms: request.glossaryTerms,
      tmMatches: request.tmMatches,
      surroundingSegments: request.surroundingSegments
    });
    const startedAt = localAiStartedAt();
    const data = await ollamaJson("/chat", {
      method: "POST",
      headers: bearerAuthHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: {
          temperature: 0.1
        }
      })
    }, { ...settings, ...config, model, signal: request.signal || config.signal });
    const rawOutput = data?.message?.content;
    if (typeof rawOutput !== "string") throw new Error("Ollama returned a malformed chat response.");
    const translatedText = cleanModelTranslationOutput(rawOutput, sourceText);
    if (!translatedText.trim()) throw new Error("The model returned an empty translation for this segment.");
    return {
      translatedText,
      rawOutput,
      provider: "Ollama",
      providerId: "ollama",
      model,
      durationMs: requestDurationMs(startedAt),
      prompt,
      metadata: {
        totalDuration: data.total_duration || 0,
        loadDuration: data.load_duration || 0,
        promptEvalCount: data.prompt_eval_count || 0,
        evalCount: data.eval_count || 0
      }
    };
  }
};

function opusCatLanguageCode(value, fallback = "und") {
  const clean = String(value || fallback || "").trim().toLowerCase().replaceAll("_", "-");
  const match = clean.match(/[a-z]{2,3}/);
  return match?.[0] || String(fallback || "und").trim().toLowerCase() || "und";
}

function opusCatLanguagePairMatches(pair, sourceCode, targetCode) {
  const tokens = String(pair || "").toLowerCase().match(/[a-z]{2,3}/g) || [];
  return tokens.length >= 2 && tokens[0] === sourceCode && tokens[1] === targetCode;
}

function opusCatModelTag(model = "") {
  const tag = String(model || "").trim();
  return tag && !/^(?:default|auto)$/i.test(tag) ? tag : "";
}

function opusCatQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.set(key, String(value));
  });
  return query.toString();
}

function opusCatTranslationText(data) {
  if (typeof data === "string") return data;
  return typeof data?.translation === "string"
    ? data.translation
    : typeof data?.Translation === "string"
      ? data.Translation
      : "";
}

function opusCatReachableError(baseUrl) {
  return `OPUS-CAT MT Engine is not reachable at ${normalizeOpusCatBaseUrl(baseUrl || OPUS_CAT_DEFAULT_BASE_URL)}. Start OPUS-CAT MT Engine and try again.`;
}

function opusCatAutoConnectError() {
  return "OPUS-CAT connection failed. Open Connection help for setup steps.";
}

function opusCatStatusError(data, status) {
  const raw = redactSensitiveText(data?.error || data?.message || "").trim();
  if (status === 401 || status === 403) return "OPUS-CAT rejected the request. Check that the local MT Engine is running and accepting local API requests.";
  if (status === 404) return "OPUS-CAT did not expose the expected MTRestService endpoint. Check the OPUS-CAT MT Engine version and port.";
  return raw || `OPUS-CAT request failed with status ${status}.`;
}

async function opusCatJson(action, params = {}, options = {}, config = {}) {
  const baseUrl = normalizeOpusCatBaseUrl(config.baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
  const query = opusCatQuery(params);
  const url = `${opusCatApiUrl(baseUrl, action)}${query ? `?${query}` : ""}`;
  let result = null;
  try {
    result = await fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    if (String(error?.message || "").includes("canceled") || String(error?.message || "").includes("timed out")) throw error;
    throw new Error(opusCatReachableError(baseUrl));
  }
  if (!result.response?.ok) {
    throw new Error(opusCatStatusError(result.data, result.response?.status));
  }
  return result.data;
}

const OpusCatProvider = {
  id: "opus-cat",
  name: "OPUS-CAT",
  defaultBaseUrl: OPUS_CAT_DEFAULT_BASE_URL,
  defaultModel: OPUS_CAT_DEFAULT_MODEL,
  async testConnection(config = {}) {
    const configuredBaseUrl = normalizeOpusCatBaseUrl(config.baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
    const candidates = opusCatConnectionCandidates(configuredBaseUrl);
    let lastError = null;
    for (const baseUrl of candidates) {
      try {
        const data = await opusCatJson(
          "ListSupportedLanguagePairs",
          { tokenCode: "0" },
          { method: "GET" },
          { ...config, baseUrl, timeoutMs: Math.min(Number(config.timeoutMs) || 5000, 5000) }
        );
        const supportedLanguagePairs = Array.isArray(data) ? data.map((item) => String(item || "").trim()).filter(Boolean) : [];
        return {
          ok: true,
          provider: "OPUS-CAT",
          version: supportedLanguagePairs.length ? `${supportedLanguagePairs.length} pair${supportedLanguagePairs.length === 1 ? "" : "s"}` : "",
          baseUrl,
          connectionMode: opusCatConnectionMode(baseUrl),
          autoDiscovered: baseUrl !== configuredBaseUrl,
          modelCount: supportedLanguagePairs.length
        };
      } catch (error) {
        if (String(error?.message || "").toLowerCase().includes("canceled")) throw error;
        lastError = error;
      }
    }
    if (!isLoopbackBaseUrl(configuredBaseUrl, OPUS_CAT_DEFAULT_BASE_URL) && lastError) throw lastError;
    throw new Error(opusCatAutoConnectError());
  },
  async listModels(config = {}) {
    const settings = defaultLocalAiSettings({ ...config, providerId: "opus-cat" }, config.project);
    const baseUrl = normalizeOpusCatBaseUrl(config.baseUrl || settings.baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
    const sourceCode = opusCatLanguageCode(config.sourceCode || settings.sourceCode || config.sourceLanguage || settings.sourceLanguage || "en", "en");
    const targetCode = opusCatLanguageCode(config.targetCode || settings.targetCode || config.targetLanguage || settings.targetLanguage || "tr", "tr");
    const data = await opusCatJson("ListSupportedLanguagePairs", { tokenCode: "0" }, { method: "GET" }, { ...settings, ...config, baseUrl });
    const supportedLanguagePairs = Array.isArray(data) ? data.map((item) => String(item || "").trim()).filter(Boolean) : [];
    const pairSupported = supportedLanguagePairs.some((pair) => opusCatLanguagePairMatches(pair, sourceCode, targetCode));
    let modelTags = [];
    if (pairSupported) {
      const tagData = await opusCatJson("GetLanguagePairModelTags", {
        tokenCode: "0",
        srcLangCode: sourceCode,
        trgLangCode: targetCode
      }, { method: "GET" }, { ...settings, ...config, baseUrl });
      modelTags = Array.isArray(tagData) ? tagData.map((item) => String(item || "").trim()).filter(Boolean) : [];
    }
    const models = pairSupported
      ? [
        { name: OPUS_CAT_DEFAULT_MODEL, size: 0, modifiedAt: "" },
        ...modelTags.filter((tag) => tag !== OPUS_CAT_DEFAULT_MODEL).map((tag) => ({ name: tag, size: 0, modifiedAt: "" }))
      ]
      : [];
    return {
      models,
      raw: {
        supportedLanguagePairs,
        sourceCode,
        targetCode,
        modelTags
      }
    };
  },
  async translateSegment(config = {}, request = {}) {
    const settings = defaultLocalAiSettings({ ...config, providerId: "opus-cat", model: config.model || request.model }, request.project);
    const baseUrl = normalizeOpusCatBaseUrl(config.baseUrl || settings.baseUrl || OPUS_CAT_DEFAULT_BASE_URL);
    const model = String(config.model || request.model || settings.model || OPUS_CAT_DEFAULT_MODEL).trim() || OPUS_CAT_DEFAULT_MODEL;
    const modelTag = opusCatModelTag(model);
    const sourceText = String(request.text ?? request.segment?.source ?? "");
    if (!sourceText.trim()) throw new Error("The segment has no source text.");
    const sourceCode = opusCatLanguageCode(request.sourceCode || settings.sourceCode || request.sourceLanguage || settings.sourceLanguage || "en", "en");
    const targetCode = opusCatLanguageCode(request.targetCode || settings.targetCode || request.targetLanguage || settings.targetLanguage || "tr", "tr");
    const startedAt = localAiStartedAt();
    const data = await opusCatJson("TranslateJson", {
      tokenCode: "0",
      input: sourceText,
      srcLangCode: sourceCode,
      trgLangCode: targetCode,
      modelTag,
      inputIsSingleSentence: "true"
    }, { method: "GET" }, { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal });
    const rawOutput = opusCatTranslationText(data);
    if (typeof rawOutput !== "string") throw new Error("OPUS-CAT returned a malformed translation response.");
    const translatedText = cleanModelTranslationOutput(rawOutput, sourceText);
    if (!translatedText.trim()) throw new Error("OPUS-CAT returned an empty translation for this segment. Check that an OPUS-CAT model is installed for the selected language pair.");
    return {
      translatedText,
      rawOutput,
      provider: "OPUS-CAT",
      providerId: "opus-cat",
      model: modelTag || OPUS_CAT_DEFAULT_MODEL,
      durationMs: requestDurationMs(startedAt),
      prompt: sourceText,
      metadata: {
        sourceCode,
        targetCode,
        modelTag,
        segmentedTranslationCount: Array.isArray(data?.SegmentedTranslation) ? data.SegmentedTranslation.length : 0
      }
    };
  }
};

function openAiCompatibleStatusError(data, status, model = "") {
  const raw = redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
  if (status === 401 || status === 403) return "The OpenAI-compatible provider rejected the request. Add or check the provider API key.";
  if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by the OpenAI-compatible provider.`;
  return raw || `OpenAI-compatible request failed with status ${status}.`;
}

async function openAiCompatibleJson(endpoint, options = {}, config = {}) {
  const url = openAiCompatibleApiUrl(config.baseUrl || LM_STUDIO_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    if (String(error?.message || "").includes("canceled") || String(error?.message || "").includes("timed out")) throw error;
    throw new Error(`OpenAI-compatible provider is not reachable at ${normalizeOpenAiCompatibleBaseUrl(config.baseUrl || LM_STUDIO_DEFAULT_BASE_URL)}.`);
  }
  if (!result.response?.ok) {
    throw new Error(openAiCompatibleStatusError(result.data, result.response?.status, config.model));
  }
  return result.data;
}

const OpenAICompatibleProvider = {
  id: "openai-compatible",
  name: "LM Studio / OpenAI-compatible",
  defaultBaseUrl: LM_STUDIO_DEFAULT_BASE_URL,
  defaultModel: DEFAULT_LOCAL_AI_MODEL,
  async testConnection(config = {}) {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(config.baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
    assertOpenAiCompatibleHostedAllowed(baseUrl);
    if (localAiProviderNeedsApiKey("openai-compatible", baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error("Add a provider API key before using this hosted OpenAI-compatible endpoint.");
    }
    const data = await openAiCompatibleJson("/models", { method: "GET", headers: bearerAuthHeaders(config) }, { ...config, baseUrl });
    return {
      ok: true,
      provider: "OpenAI-compatible",
      baseUrl,
      modelCount: Array.isArray(data?.data) ? data.data.length : 0
    };
  },
  async listModels(config = {}) {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(config.baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
    assertOpenAiCompatibleHostedAllowed(baseUrl);
    if (localAiProviderNeedsApiKey("openai-compatible", baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error("Add a provider API key before refreshing models.");
    }
    const data = await openAiCompatibleJson("/models", { method: "GET", headers: bearerAuthHeaders(config) }, { ...config, baseUrl });
    const models = Array.isArray(data?.data)
      ? data.data.map((model) => {
        const created = Number(model.created);
        return {
          name: String(model.id || model.name || "").trim(),
          size: model.size || 0,
          modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : ""
        };
      }).filter((model) => model.name)
      : [];
    return { models, raw: data };
  },
  async translateSegment(config = {}, request = {}) {
    const settings = defaultLocalAiSettings({ ...config, providerId: "openai-compatible", model: config.model || request.model }, request.project);
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(config.baseUrl || settings.baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
    const model = String(config.model || request.model || settings.model || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
    const sourceText = String(request.text ?? request.segment?.source ?? "");
    if (!sourceText.trim()) throw new Error("The segment has no source text.");
    assertOpenAiCompatibleHostedAllowed(baseUrl);
    if (localAiProviderNeedsApiKey("openai-compatible", baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error("Add a provider API key before sending source text to this hosted endpoint.");
    }
    const prompt = request.prompt || buildTranslateGemmaPrompt({
      sourceLanguage: request.sourceLanguage || settings.sourceLanguage,
      sourceCode: request.sourceCode || settings.sourceCode,
      targetLanguage: request.targetLanguage || settings.targetLanguage,
      targetCode: request.targetCode || settings.targetCode,
      text: sourceText,
      segment: request.segment,
      glossaryTerms: request.glossaryTerms,
      tmMatches: request.tmMatches,
      surroundingSegments: request.surroundingSegments
    });
    const startedAt = localAiStartedAt();
    const data = await openAiCompatibleJson("/chat/completions", {
      method: "POST",
      headers: bearerAuthHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.1
      })
    }, { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal });
    const rawOutput = data?.choices?.[0]?.message?.content;
    if (typeof rawOutput !== "string") throw new Error("The OpenAI-compatible provider returned a malformed chat response.");
    const translatedText = cleanModelTranslationOutput(rawOutput, sourceText);
    if (!translatedText.trim()) throw new Error("The model returned an empty translation for this segment.");
    return {
      translatedText,
      rawOutput,
      provider: "OpenAI-compatible",
      providerId: "openai-compatible",
      model,
      durationMs: requestDurationMs(startedAt),
      prompt,
      metadata: {
        promptTokens: data?.usage?.prompt_tokens || 0,
        completionTokens: data?.usage?.completion_tokens || 0,
        totalTokens: data?.usage?.total_tokens || 0
      }
    };
  }
};

function genericPromptSystem() {
  return "You are a professional translation assistant inside LoopCAT. Follow the user's CAT-tool instruction exactly and keep the response concise.";
}

function promptTextOrThrow(request = {}) {
  const prompt = String(request.prompt || "").trim();
  if (!prompt) throw new Error("The AI command has no prompt.");
  return prompt;
}

function genericPromptResult(provider, providerId, model, prompt, rawOutput, startedAt, metadata = {}) {
  if (typeof rawOutput !== "string") throw new Error(`${provider} returned a malformed response.`);
  const text = rawOutput.trim();
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return {
    text,
    rawOutput,
    provider,
    providerId,
    model,
    durationMs: requestDurationMs(startedAt),
    prompt,
    metadata
  };
}

const providerAdapterRuntime = Object.freeze({
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_MODEL,
  GEMINI_DEFAULT_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
  COHERE_DEFAULT_BASE_URL,
  COHERE_DEFAULT_MODEL,
  XAI_DEFAULT_BASE_URL,
  XAI_DEFAULT_MODEL,
  PERPLEXITY_DEFAULT_BASE_URL,
  PERPLEXITY_DEFAULT_MODEL,
  AZURE_OPENAI_DEFAULT_BASE_URL,
  AZURE_OPENAI_DEFAULT_MODEL,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  MISTRAL_DEFAULT_BASE_URL,
  MISTRAL_DEFAULT_MODEL,
  GROQ_DEFAULT_BASE_URL,
  GROQ_DEFAULT_MODEL,
  TOGETHER_DEFAULT_BASE_URL,
  TOGETHER_DEFAULT_MODEL,
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
  HUGGINGFACE_DEFAULT_BASE_URL,
  HUGGINGFACE_DEFAULT_MODEL,
  DEEPINFRA_DEFAULT_BASE_URL,
  DEEPINFRA_DEFAULT_MODEL,
  FIREWORKS_DEFAULT_BASE_URL,
  FIREWORKS_DEFAULT_MODEL,
  azureOpenAiAuthHeaders,
  anthropicAuthHeaders,
  cohereAuthHeaders,
  bearerAuthHeaders,
  buildTranslateGemmaPrompt,
  cleanModelTranslationOutput,
  defaultLocalAiSettings,
  fetchJsonWithTimeout,
  geminiAuthHeaders,
  genericPromptResult,
  genericPromptSystem,
  openAiApiUrl,
  geminiApiUrl,
  anthropicApiUrl,
  cohereApiUrl,
  xAiApiUrl,
  perplexityApiUrl,
  azureOpenAiApiUrl,
  deepSeekApiUrl,
  mistralApiUrl,
  groqApiUrl,
  togetherApiUrl,
  openRouterApiUrl,
  huggingFaceApiUrl,
  deepInfraApiUrl,
  fireworksApiUrl,
  localAiStartedAt,
  normalizeOpenAiBaseUrl,
  normalizeGeminiBaseUrl,
  normalizeAnthropicBaseUrl,
  normalizeCohereBaseUrl,
  normalizeXAiBaseUrl,
  normalizePerplexityBaseUrl,
  normalizeAzureOpenAiBaseUrl,
  normalizeDeepSeekBaseUrl,
  normalizeMistralBaseUrl,
  normalizeGroqBaseUrl,
  normalizeTogetherBaseUrl,
  normalizeOpenRouterBaseUrl,
  normalizeHuggingFaceBaseUrl,
  normalizeDeepInfraBaseUrl,
  normalizeFireworksBaseUrl,
  promptTextOrThrow,
  redactSensitiveText,
  requestDurationMs
});

OllamaProvider.completePrompt = async function completePrompt(config = {}, request = {}) {
  const settings = defaultLocalAiSettings({ ...config, model: config.model || request.model }, request.project);
  const model = String(config.model || request.model || settings.model || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
  if (isOllamaCloudBaseUrl(config.baseUrl || settings.baseUrl) && !String(config.apiKey || "").trim()) {
    throw new Error("Add an Ollama API key before sending source text to hosted Ollama.");
  }
  const prompt = promptTextOrThrow(request);
  const messages = request.system
    ? [{ role: "system", content: String(request.system) }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];
  const startedAt = localAiStartedAt();
  const data = await ollamaJson("/chat", {
    method: "POST",
    headers: bearerAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.1 }
    })
  }, { ...settings, ...config, model, signal: request.signal || config.signal });
  return genericPromptResult("Ollama", "ollama", model, prompt, data?.message?.content, startedAt, {
    totalDuration: data.total_duration || 0,
    promptEvalCount: data.prompt_eval_count || 0,
    evalCount: data.eval_count || 0
  });
};

OpenAICompatibleProvider.completePrompt = async function completePrompt(config = {}, request = {}) {
  const settings = defaultLocalAiSettings({ ...config, providerId: "openai-compatible", model: config.model || request.model }, request.project);
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(config.baseUrl || settings.baseUrl || LM_STUDIO_DEFAULT_BASE_URL);
  const model = String(config.model || request.model || settings.model || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
  assertOpenAiCompatibleHostedAllowed(baseUrl);
  if (localAiProviderNeedsApiKey("openai-compatible", baseUrl) && !String(config.apiKey || "").trim()) {
    throw new Error("Add a provider API key before sending source text to this hosted endpoint.");
  }
  const prompt = promptTextOrThrow(request);
  const startedAt = localAiStartedAt();
  const data = await openAiCompatibleJson("/chat/completions", {
    method: "POST",
    headers: bearerAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: request.system || genericPromptSystem() },
        { role: "user", content: prompt }
      ],
      stream: false,
      temperature: 0.1
    })
  }, { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal });
  return genericPromptResult("OpenAI-compatible", "openai-compatible", model, prompt, data?.choices?.[0]?.message?.content, startedAt, {
    promptTokens: data?.usage?.prompt_tokens || 0,
    completionTokens: data?.usage?.completion_tokens || 0,
    totalTokens: data?.usage?.total_tokens || 0
  });
};

const aiProviderRegistry = (() => {
  const providers = new Map();
  return {
    reserve(id) {
      const providerId = String(id || "").trim();
      if (providerId && !providers.has(providerId)) providers.set(providerId, null);
      return providerId;
    },
    register(provider) {
      if (!provider?.id) return null;
      providers.set(provider.id, provider);
      return provider;
    },
    get(id) {
      return providers.get(id || "ollama") || providers.get("ollama");
    },
    list() {
      return Array.from(providers.values()).filter(Boolean);
    }
  };
})();

aiProviderRegistry.register(OllamaProvider);
aiProviderRegistry.reserve("openai");
aiProviderRegistry.reserve("deepseek");
aiProviderRegistry.reserve("xai");
aiProviderRegistry.reserve("perplexity");
aiProviderRegistry.reserve("groq");
aiProviderRegistry.reserve("together");
aiProviderRegistry.reserve("openrouter");
aiProviderRegistry.reserve("huggingface");
aiProviderRegistry.reserve("deepinfra");
aiProviderRegistry.reserve("fireworks");
aiProviderRegistry.reserve("gemini");
aiProviderRegistry.reserve("anthropic");
aiProviderRegistry.reserve("cohere");
aiProviderRegistry.reserve("mistral");
aiProviderRegistry.reserve("azure-openai");
aiProviderRegistry.register(OpenAICompatibleProvider);
aiProviderRegistry.register(OpusCatProvider);

function isLockedSegment(segment = {}) {
  return Boolean(segment.locked || segment.isLocked || segment.readOnly || segment.readonly || segment.status === "locked");
}

function segmentSkipReason(segment = {}, settings = {}) {
  if (!String(segment.source || "").trim()) return "empty-source";
  if (isLockedSegment(segment)) return "locked";
  if (segment.status === "confirmed") return "confirmed";
  if (!settings.overwriteExisting && String(segment.target || "").trim()) return "existing-target";
  return "";
}

function scopeSegmentsForPretranslation(segments = [], options = {}) {
  const mode = LOCAL_AI_PRETRANSLATION_MODES.has(options.mode) ? options.mode : "untranslated";
  const selectedIds = new Set(options.selectedSegmentIds || []);
  const visibleIds = new Set(options.visibleSegmentIds || []);
  if (mode === "selected") return segments.filter((segment) => selectedIds.has(segment.id));
  if (mode === "visible") return visibleIds.size ? segments.filter((segment) => visibleIds.has(segment.id)) : segments;
  return segments;
}

function selectPretranslationSegments(segments = [], options = {}) {
  const settings = defaultLocalAiSettings(options.settings || options, options.project);
  const mode = LOCAL_AI_PRETRANSLATION_MODES.has(options.mode || settings.mode) ? (options.mode || settings.mode) : "untranslated";
  const scoped = scopeSegmentsForPretranslation(segments, { ...options, mode });
  const skipped = [];
  const candidates = [];
  scoped.forEach((segment) => {
    const reason = segmentSkipReason(segment, settings);
    if (reason) {
      skipped.push({ segmentId: segment.id || "", reason });
      return;
    }
    candidates.push(segment);
  });
  return { candidates, skipped, mode };
}

function aiPretranslationMetadata(result = {}) {
  return {
    provider: redactSensitiveText(result.provider || "AI").trim() || "AI",
    providerId: redactSensitiveText(result.providerId || "").trim(),
    model: redactSensitiveText(result.model || "").trim(),
    status: "AI initiated",
    createdAt: new Date().toISOString()
  };
}

function applyAiPretranslation(segment, result) {
  segment.target = String(result.translatedText || "");
  segment.status = "draft";
  segment.reviewState = "needs-review";
  segment.aiPretranslation = aiPretranslationMetadata(result);
  delete segment.tmPretranslation;
  return segment;
}

async function pretranslateSegments(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.translateSegment) throw new Error("No local AI translation provider is available.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const selection = selectPretranslationSegments(options.segments || [], {
    ...options,
    settings,
    mode: options.mode || settings.mode
  });
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  let cursor = 0;
  const concurrency = normalizedPositiveInteger(options.concurrency || settings.concurrency, 1, 1, 2);
  const nextCandidate = () => {
    if (options.signal?.aborted) return null;
    if (cursor >= selection.candidates.length) return null;
    const segment = selection.candidates[cursor];
    cursor += 1;
    return segment;
  };
  const runOne = async (segment) => {
    try {
      const glossaryTerms = typeof options.glossaryTermsForSegment === "function"
        ? await options.glossaryTermsForSegment(segment, { project: options.project, settings })
        : options.glossaryTerms || [];
      const tmMatches = typeof options.tmMatchesForSegment === "function"
        ? await options.tmMatchesForSegment(segment, { project: options.project, settings })
        : options.tmMatches || [];
      const surroundingSegments = typeof options.surroundingSegmentsForSegment === "function"
        ? await options.surroundingSegmentsForSegment(segment, { project: options.project, settings, segments: options.segments || [] })
        : options.surroundingSegments || [];
      const result = await provider.translateSegment({ ...settings, ...(options.config || {}), signal: options.signal }, {
        project: options.project,
        segment,
        text: segment.source || "",
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        glossaryTerms,
        tmMatches,
        surroundingSegments,
        signal: options.signal
      });
      applyAiPretranslation(segment, result);
      await options.onSegmentResult?.({ segment, result });
      summary.completed += 1;
      summary.updatedSegmentIds.push(segment.id || "");
    } catch (error) {
      if (options.signal?.aborted || String(error?.message || "").includes("canceled")) {
        summary.canceled = true;
        return;
      }
      summary.failed += 1;
      summary.failures.push({
        segmentId: segment.id || "",
        message: redactSensitiveText(error?.message || "Local AI translation failed.")
      });
      options.onSegmentFailure?.({ segment, error });
    } finally {
      options.onProgress?.({ ...summary });
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, selection.candidates.length || 1)) }, async () => {
    while (!options.signal?.aborted) {
      const segment = nextCandidate();
      if (!segment) return;
      await runOne(segment);
    }
  });
  options.onProgress?.({ ...summary });
  await Promise.all(workers);
  if (options.signal?.aborted) summary.canceled = true;
  return summary;
}

const preTranslationService = {
  isLockedSegment,
  segmentSkipReason,
  selectSegments: selectPretranslationSegments,
  applyAiPretranslation,
  pretranslateSegments
};

async function reviewSegmentWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot run review commands.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  if (!targetText.trim()) throw new Error("The active segment has no target text to review.");
  const glossaryTerms = options.glossaryTerms || [];
  const prompt = options.prompt || buildAiReviewPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    segment,
    glossaryTerms
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a senior translation reviewer inside LoopCAT. Return review notes only; do not translate, rewrite the full segment, or add generic encouragement.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const reviewText = String(result.text || result.rawOutput || "").trim();
  return {
    ...result,
    reviewText,
    reviewRisk: parseAiReviewRisk(reviewText),
    prompt
  };
}

async function repairSegmentTagsWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot run tag repair commands.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  if (!targetText.trim()) throw new Error("The active segment has no target text to repair.");
  const protectedTokens = protectedTokenList({
    protectedTokens: options.protectedTokens,
    segment,
    sourceText
  });
  const prompt = options.prompt || buildTagRepairPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    protectedTokens,
    segment
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool tag repair assistant. Return only the corrected target segment and preserve protected tokens exactly.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
  if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty tag repair suggestion.");
  const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
  return {
    ...result,
    suggestedTarget,
    protectedTokens,
    warnings: missingTokens.map((token) => `Suggested target may still be missing protected token ${token}.`),
    prompt
  };
}

async function suggestSegmentVariantsWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot suggest translation alternatives.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  const protectedTokens = protectedTokenList({
    protectedTokens: options.protectedTokens,
    segment,
    sourceText
  });
  const glossaryTerms = options.glossaryTerms || [];
  const prompt = options.prompt || buildTargetVariantsPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    protectedTokens,
    segment,
    glossaryTerms,
    variantMode: options.variantMode || settings.variantMode
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool translation alternatives assistant. Return only the requested labelled target alternatives and preserve protected tokens exactly.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const variants = parseTargetVariantSuggestions(result.text || result.rawOutput || "", sourceText);
  if (!variants.length) throw new Error("The AI provider returned no usable translation alternatives.");
  const warnings = [];
  const variantsWithWarnings = variants.map((variant) => {
    const missingTokens = protectedTokens.filter((token) => !variant.suggestedTarget.includes(token));
    const variantWarnings = missingTokens.map((token) => `${variant.label} may be missing protected token ${token}.`);
    warnings.push(...variantWarnings);
    return { ...variant, warnings: variantWarnings };
  });
  return {
    ...result,
    variants: variantsWithWarnings,
    protectedTokens,
    warnings,
    prompt
  };
}

async function polishSegmentStyleWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot polish target drafts.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  if (!targetText.trim()) throw new Error("The active segment has no target text to polish.");
  const protectedTokens = protectedTokenList({
    protectedTokens: options.protectedTokens,
    segment,
    sourceText
  });
  const glossaryTerms = options.glossaryTerms || [];
  const tmMatches = options.tmMatches || [];
  const prompt = options.prompt || buildStylePolishPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    protectedTokens,
    segment,
    project: options.project,
    styleGuide: options.styleGuide,
    glossaryTerms,
    tmMatches
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool style and terminology polishing assistant. Return only the improved target segment and preserve protected tokens exactly.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
  if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty polish suggestion.");
  const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
  return {
    ...result,
    suggestedTarget,
    protectedTokens,
    warnings: missingTokens.map((token) => `Polished target may be missing protected token ${token}.`),
    prompt
  };
}

async function adaptSegmentDraftWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot adapt target drafts.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  if (!targetText.trim()) throw new Error("The active segment has no target draft to adapt.");
  const protectedTokens = protectedTokenList({
    protectedTokens: options.protectedTokens,
    segment,
    sourceText
  });
  const glossaryTerms = options.glossaryTerms || [];
  const tmMatches = options.tmMatches || [];
  const adaptMode = options.adaptMode || settings.adaptMode;
  const prompt = options.prompt || buildDraftAdaptationPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    protectedTokens,
    segment,
    project: options.project,
    styleGuide: options.styleGuide,
    glossaryTerms,
    tmMatches,
    adaptMode
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool target adaptation assistant. Return only the adapted target segment and preserve protected tokens exactly.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
  if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty adaptation suggestion.");
  const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
  return {
    ...result,
    suggestedTarget,
    protectedTokens,
    adaptMode: LOCAL_AI_ADAPT_MODES.has(String(adaptMode || "").trim()) ? String(adaptMode).trim() : "simplify",
    warnings: missingTokens.map((token) => `Adapted target may be missing protected token ${token}.`),
    prompt
  };
}

async function extractSegmentTermsWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot extract terminology.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  const prompt = options.prompt || buildTerminologyExtractionPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    segment
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool terminology extraction assistant. Return only the requested JSON array of concise termbase candidates.",
    model: options.model || settings.model,
    signal: options.signal
  });
  return {
    ...result,
    terms: parseTerminologyExtractionSuggestions(result.text || result.rawOutput || ""),
    prompt
  };
}

async function applyTerminologyWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot apply terminology.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const segment = options.segment || {};
  const sourceText = String(options.sourceText ?? segment.source ?? "");
  const targetText = String(options.targetText ?? segment.target ?? "");
  if (!sourceText.trim()) throw new Error("The active segment has no source text.");
  if (!targetText.trim()) throw new Error("The active segment has no target draft to revise.");
  const glossaryTerms = aiContextRecords(options.glossaryTerms || options.terms || [])
    .filter((term) => term.sourceTerm && term.targetTerm);
  if (!glossaryTerms.length) throw new Error("No matching project terminology is available for this segment.");
  const protectedTokens = protectedTokenList({
    protectedTokens: options.protectedTokens,
    segment,
    sourceText
  });
  const prompt = options.prompt || buildTerminologyApplicationPrompt({
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode,
    sourceText,
    targetText,
    protectedTokens,
    segment,
    glossaryTerms
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project: options.project,
    prompt,
    system: "You are a CAT-tool terminology application assistant. Return only the revised target segment and preserve protected tokens exactly.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
  if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty terminology suggestion.");
  const warnings = [];
  protectedTokens
    .filter((token) => !suggestedTarget.includes(token))
    .forEach((token) => warnings.push(`Terminology suggestion may be missing protected token ${token}.`));
  glossaryTerms.forEach((term) => {
    const targetTerm = String(term.targetTerm || "");
    if (!targetTerm) return;
    if (term.isForbidden && suggestedTarget.includes(targetTerm)) {
      warnings.push(`Terminology suggestion may still contain forbidden term ${targetTerm}.`);
    } else if (!term.isForbidden && !suggestedTarget.includes(targetTerm)) {
      warnings.push(`Terminology suggestion may still be missing approved term ${targetTerm}.`);
    }
  });
  return {
    ...result,
    suggestedTarget,
    protectedTokens,
    glossaryTerms,
    warnings,
    prompt
  };
}

async function generateProjectBriefWithAi(options = {}) {
  const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
  if (!provider?.completePrompt) throw new Error("This AI provider cannot generate project briefs.");
  const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
  const project = options.project || {};
  const prompt = options.prompt || buildProjectBriefPrompt({
    project,
    sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
    sourceCode: options.sourceCode || settings.sourceCode || project.sourceLang,
    targetLanguage: options.targetLanguage || settings.targetLanguage,
    targetCode: options.targetCode || settings.targetCode || project.targetLang,
    documents: options.documents || [],
    sampleSegments: options.sampleSegments || [],
    terms: options.terms || []
  });
  const result = await provider.completePrompt({ ...settings, ...(options.config || {}), signal: options.signal }, {
    project,
    prompt,
    system: "You are a CAT-tool project brief assistant. Return only concise reusable translation instructions with no secrets or generic filler.",
    model: options.model || settings.model,
    signal: options.signal
  });
  const brief = stripModelWrapper(result.text || result.rawOutput || "", "").trim();
  if (!brief) throw new Error("The AI provider returned an empty project brief.");
  return {
    ...result,
    brief,
    prompt
  };
}

const aiCommandService = {
  buildAiReviewPrompt,
  buildTagRepairPrompt,
  buildTargetVariantsPrompt,
  buildStylePolishPrompt,
  buildDraftAdaptationPrompt,
  buildTerminologyExtractionPrompt,
  buildTerminologyApplicationPrompt,
  parseAiReviewRisk,
  normalizeAiReviewRiskLevel,
  extractSegmentTerms: extractSegmentTermsWithAi,
  applyTerminology: applyTerminologyWithAi,
  generateProjectBrief: generateProjectBriefWithAi,
  adaptSegmentDraft: adaptSegmentDraftWithAi,
  polishSegmentStyle: polishSegmentStyleWithAi,
  repairSegmentTags: repairSegmentTagsWithAi,
  suggestSegmentVariants: suggestSegmentVariantsWithAi,
  reviewSegment: reviewSegmentWithAi
};

window.CatHan = window.CatHan || {};
window.CatHan.ai = {
  OPENAI_RESPONSES_URL,
  OPENAI_MODELS_URL,
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_DEFAULT_MODEL,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  GEMINI_DEFAULT_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_VERSION,
  COHERE_DEFAULT_BASE_URL,
  COHERE_DEFAULT_MODEL,
  MISTRAL_DEFAULT_BASE_URL,
  MISTRAL_DEFAULT_MODEL,
  AZURE_OPENAI_DEFAULT_BASE_URL,
  AZURE_OPENAI_DEFAULT_MODEL,
  XAI_DEFAULT_BASE_URL,
  XAI_DEFAULT_MODEL,
  PERPLEXITY_DEFAULT_BASE_URL,
  PERPLEXITY_DEFAULT_MODEL,
  GROQ_DEFAULT_BASE_URL,
  GROQ_DEFAULT_MODEL,
  TOGETHER_DEFAULT_BASE_URL,
  TOGETHER_DEFAULT_MODEL,
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
  HUGGINGFACE_DEFAULT_BASE_URL,
  HUGGINGFACE_DEFAULT_MODEL,
  DEEPINFRA_DEFAULT_BASE_URL,
  DEEPINFRA_DEFAULT_MODEL,
  FIREWORKS_DEFAULT_BASE_URL,
  FIREWORKS_DEFAULT_MODEL,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_CLOUD_BASE_URL,
  LM_STUDIO_DEFAULT_BASE_URL,
  OPUS_CAT_DEFAULT_BASE_URL,
  OPUS_CAT_WEB_BRIDGE_BASE_URL,
  LOCAL_AI_PROVIDER_PRESETS,
  DEFAULT_LOCAL_AI_MODEL,
  OPUS_CAT_DEFAULT_MODEL,
  DEFAULT_LOCAL_AI_TIMEOUT_MS,
  LOCAL_AI_ADAPT_MODES,
  browserAppearsOffline,
  externalAiSourceSharingAllowed,
  isOpenAiProvider,
  filteredAiContext,
  openAiSuggestion,
  buildTranslateGemmaPrompt,
  buildAiReviewPrompt,
  buildTagRepairPrompt,
  buildTargetVariantsPrompt,
  buildStylePolishPrompt,
  buildDraftAdaptationPrompt,
  buildTerminologyExtractionPrompt,
  buildTerminologyApplicationPrompt,
  buildProjectBriefPrompt,
  parseAiReviewRisk,
  normalizeAiReviewRiskLevel,
  parseTargetVariantSuggestions,
  parseTerminologyExtractionSuggestions,
  cleanModelTranslationOutput,
  normalizedProviderBaseUrl,
  normalizeOllamaBaseUrl,
  ollamaApiUrl,
  normalizeOpenAiBaseUrl,
  openAiApiUrl,
  normalizeDeepSeekBaseUrl,
  deepSeekApiUrl,
  normalizeGeminiBaseUrl,
  geminiApiUrl,
  normalizeAnthropicBaseUrl,
  anthropicApiUrl,
  normalizeCohereBaseUrl,
  cohereApiUrl,
  normalizeMistralBaseUrl,
  mistralApiUrl,
  normalizeXAiBaseUrl,
  xAiApiUrl,
  normalizePerplexityBaseUrl,
  perplexityApiUrl,
  normalizeGroqBaseUrl,
  groqApiUrl,
  normalizeTogetherBaseUrl,
  togetherApiUrl,
  normalizeOpenRouterBaseUrl,
  openRouterApiUrl,
  normalizeHuggingFaceBaseUrl,
  huggingFaceApiUrl,
  normalizeDeepInfraBaseUrl,
  deepInfraApiUrl,
  normalizeFireworksBaseUrl,
  fireworksApiUrl,
  normalizeAzureOpenAiBaseUrl,
  azureOpenAiApiUrl,
  normalizeOpenAiCompatibleBaseUrl,
  openAiCompatibleApiUrl,
  normalizeOpusCatBaseUrl,
  opusCatApiUrl,
  opusCatConnectionCandidates,
  isLoopbackBaseUrl,
  isAllowedOpenAiCompatibleHostedBaseUrl,
  isOllamaCloudBaseUrl,
  isOllamaCloudModel,
  localAiProviderPresetById,
  localAiProviderPresetForSettings,
  localAiProviderNeedsApiKey,
  localAiProviderSharesExternally,
  localAiProviderGuidance,
  defaultLocalAiSettings,
  localAISettingsStore,
  OllamaProvider,
  OpenAICompatibleProvider,
  OpusCatProvider,
  providerAdapterRuntime,
  aiProviderRegistry,
  preTranslationService,
  aiCommandService
};
})();
