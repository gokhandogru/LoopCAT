#!/usr/bin/env node
"use strict";

const DEFAULT_TIMEOUT_MS = 120000;
const ANTHROPIC_VERSION = "2023-06-01";

const PROVIDERS = {
  openai: {
    label: "OpenAI",
    env: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/responses",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: responsesBody,
    output: extractResponseText
  },
  deepseek: {
    label: "DeepSeek",
    env: "DEEPSEEK_API_KEY",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
    normalize: normalizeDeepSeekBaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  gemini: {
    label: "Google Gemini",
    env: "GEMINI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.5-flash",
    normalize: normalizeV1BetaBaseUrl,
    modelsPath: "/models",
    chatPath: "/interactions",
    auth: (key, extra = {}) => ({ ...extra, "x-goog-api-key": key }),
    modelNames: (data) => Array.isArray(data?.models) ? data.models.map((model) => String(model.name || "").replace(/^models\//, "").trim()).filter(Boolean) : [],
    body: (model, prompt) => ({
      model: model.replace(/^models\//, ""),
      input: prompt,
      stream: false,
      store: false,
      system_instruction: translationSystemPrompt(),
      generation_config: { temperature: 0.1 }
    }),
    output: extractGeminiText
  },
  anthropic: {
    label: "Anthropic Claude",
    env: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/messages",
    auth: (key, extra = {}) => ({ ...extra, "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }),
    modelNames: dataModelNames,
    body: (model, prompt) => ({
      model,
      max_tokens: 1200,
      system: translationSystemPrompt(),
      messages: [{ role: "user", content: prompt }]
    }),
    output: extractAnthropicText
  },
  cohere: {
    label: "Cohere Command",
    env: "COHERE_API_KEY",
    defaultBaseUrl: "https://api.cohere.com",
    defaultModel: "command-a-translate-08-2025",
    normalize: normalizeCohereBaseUrl,
    modelsPath: "/v1/models",
    chatPath: "/v2/chat",
    auth: (key, extra = {}) => bearerAuthHeaders(key, { ...extra, "Client-Name": "LoopCAT" }),
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractCohereText
  },
  mistral: {
    label: "Mistral AI",
    env: "MISTRAL_API_KEY",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  xai: {
    label: "xAI Grok",
    env: "XAI_API_KEY",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.3",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/responses",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: responsesBody,
    output: extractResponseText
  },
  perplexity: {
    label: "Perplexity Sonar",
    env: "PERPLEXITY_API_KEY",
    defaultBaseUrl: "https://api.perplexity.ai/v1",
    defaultModel: "sonar-pro",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/sonar",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: (model, prompt) => ({
      model,
      messages: [
        { role: "system", content: `${translationSystemPrompt()} Do not browse, cite sources, or add related questions.` },
        { role: "user", content: prompt }
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 1200,
      disable_search: true,
      return_images: false,
      return_related_questions: false
    }),
    output: extractChatText
  },
  groq: {
    label: "Groq",
    env: "GROQ_API_KEY",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    normalize: normalizeGroqBaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  together: {
    label: "Together AI",
    env: "TOGETHER_API_KEY",
    defaultBaseUrl: "https://api.together.ai/v1",
    defaultModel: "MiniMaxAI/MiniMax-M3",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  openrouter: {
    label: "OpenRouter",
    env: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "~openai/gpt-latest",
    normalize: normalizeOpenRouterBaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  huggingface: {
    label: "Hugging Face Inference Providers",
    env: "HUGGINGFACE_API_KEY",
    defaultBaseUrl: "https://router.huggingface.co/v1",
    defaultModel: "openai/gpt-oss-120b:cerebras",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  deepinfra: {
    label: "DeepInfra",
    env: "DEEPINFRA_API_KEY",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    normalize: normalizeDeepInfraBaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  fireworks: {
    label: "Fireworks AI",
    env: "FIREWORKS_API_KEY",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    normalize: normalizeFireworksBaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText
  },
  "azure-openai": {
    label: "Azure OpenAI",
    env: "AZURE_OPENAI_API_KEY",
    defaultBaseUrl: "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1",
    defaultModel: "gpt-4.1-nano",
    normalize: normalizeAzureOpenAiBaseUrl,
    modelsPath: "/models",
    chatPath: "/responses",
    auth: (key, extra = {}) => ({ ...extra, "api-key": key }),
    modelNames: dataModelNames,
    body: responsesBody,
    output: extractResponseText
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    env: "OPENAI_COMPATIBLE_API_KEY",
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModel: "translategemma",
    normalize: normalizeV1BaseUrl,
    modelsPath: "/models",
    chatPath: "/chat/completions",
    auth: bearerAuthHeaders,
    modelNames: dataModelNames,
    body: chatCompletionsBody,
    output: extractChatText,
    allowNoKeyWhenLoopback: true
  }
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeUrl(value, fallback) {
  const raw = trimTrailingSlashes(String(value || fallback || "").trim());
  const url = new URL(raw || fallback);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  url.hash = "";
  url.search = "";
  return trimTrailingSlashes(url.href);
}

function normalizeV1BaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1`;
}

function normalizeV1BetaBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1beta")) return trimTrailingSlashes(`${url.origin}${path}`);
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1beta`;
}

function normalizeDeepSeekBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");
  const cleanPath = path === "/v1" ? "" : path.replace(/\/v1$/, "");
  return trimTrailingSlashes(`${url.origin}${cleanPath === "/" ? "" : cleanPath}`);
}

function normalizeCohereBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/v[12]$/, "");
  return trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`);
}

function normalizeGroqBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/openai\/v1$/, "").replace(/\/openai$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/openai/v1`;
}

function normalizeOpenRouterBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/api\/v1$/, "").replace(/\/api$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/api/v1`;
}

function normalizeDeepInfraBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/v1\/openai$/, "").replace(/\/openai$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/v1/openai`;
}

function normalizeFireworksBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/inference\/v1$/, "").replace(/\/inference$/, "").replace(/\/v1$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/inference/v1`;
}

function normalizeAzureOpenAiBaseUrl(baseUrl, fallback) {
  const normalized = normalizeUrl(baseUrl, fallback);
  const url = new URL(normalized);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/openai\/v1$/, "").replace(/\/openai$/, "");
  return `${trimTrailingSlashes(`${url.origin}${path === "/" ? "" : path}`)}/openai/v1`;
}

function apiUrl(baseUrl, endpoint) {
  const cleanEndpoint = String(endpoint || "").replace(/^\/+/, "");
  return `${baseUrl}/${cleanEndpoint}`;
}

function isLoopback(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function bearerAuthHeaders(key, extra = {}) {
  const cleanKey = String(key || "").trim();
  return cleanKey ? { ...extra, Authorization: `Bearer ${cleanKey}` } : { ...extra };
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs} ms: ${url}`);
    throw new Error(`Request failed: ${url} (${error.message || error})`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Provider returned non-JSON response from ${url}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
    throw new Error(`Provider request failed at ${url}: ${message}`);
  }
  return data;
}

function dataModelNames(data) {
  return Array.isArray(data?.data)
    ? data.data.map((model) => String(model.id || model.name || "").trim()).filter(Boolean)
    : [];
}

function modelIsListed(models, modelName) {
  const clean = String(modelName || "").trim();
  if (!clean) return false;
  return models.some((model) => model === clean || model.endsWith(`/${clean}`));
}

function translationSystemPrompt() {
  return "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";
}

function buildTranslationPrompt({ sourceLanguage, sourceCode, targetLanguage, targetCode, text }) {
  return [
    `You are a professional ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) translator.`,
    `Produce only the ${targetLanguage} translation, without any additional explanations or commentary. Please translate the following ${sourceLanguage} text into ${targetLanguage}:`,
    "",
    text,
    "",
    "CAT-tool requirements:",
    "Preserve placeholders exactly, including {name}, %s, %1$s, {{variable}}, <0>...</0>, XML/HTML tags, ICU syntax, markdown links, and escaped newline sequences.",
    "Do not add explanations, quotes, markdown, comments, or alternative translations."
  ].join("\n");
}

function chatCompletionsBody(model, prompt) {
  return {
    model,
    messages: [
      { role: "system", content: translationSystemPrompt() },
      { role: "user", content: prompt }
    ],
    stream: false,
    temperature: 0.1,
    max_tokens: 1200
  };
}

function responsesBody(model, prompt) {
  return {
    model,
    store: false,
    instructions: translationSystemPrompt(),
    input: prompt,
    max_output_tokens: 1200
  };
}

function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text || part?.content || "").join("").trim();
  }
  return extractResponseText(data);
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  if (typeof data?.text === "string") return data.text.trim();
  const output = Array.isArray(data?.output) ? data.output : [];
  const text = output.flatMap((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    return content.map((part) => part?.text || part?.content || "").filter(Boolean);
  }).join("");
  return text.trim();
}

function extractGeminiText(data) {
  const candidateText = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts.map((part) => part?.text || "").join("")
    : "";
  if (candidateText.trim()) return candidateText.trim();
  if (Array.isArray(data?.steps)) {
    return data.steps.flatMap((step) => {
      if (typeof step?.output_text === "string") return [step.output_text];
      const content = Array.isArray(step?.content) ? step.content : [];
      return content.map((part) => part?.text || "").filter(Boolean);
    }).join("").trim();
  }
  return extractResponseText(data);
}

function extractAnthropicText(data) {
  const content = Array.isArray(data?.content) ? data.content : [];
  return content.map((part) => typeof part === "string" ? part : part?.text || "").join("").trim();
}

function extractCohereText(data) {
  const content = data?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").join("").trim();
  }
  return extractChatText(data);
}

function printUsage() {
  const providers = Object.keys(PROVIDERS).join(", ");
  console.log(`LoopCAT live hosted-provider verifier

Usage:
  node scripts/verify-live-ai-provider.cjs --provider <id> [options]

Providers:
  ${providers}

Options:
  --provider <id>          Required provider id.
  --base-url <url>         Override provider base URL.
  --model <name>           Override model/deployment name.
  --api-key <key>          API key. Prefer the provider env var.
  --text <text>            Source text for the translation probe.
  --timeout-ms <number>    Default: ${DEFAULT_TIMEOUT_MS}
  --strict-model-check     Fail when model refresh does not list the requested model.
  --skip-model-check       Do not warn or fail when the requested model is not listed.
  --help                   Show this help.

Examples:
  OPENAI_API_KEY=... node scripts/verify-live-ai-provider.cjs --provider openai --model gpt-5.5
  GEMINI_API_KEY=... node scripts/verify-live-ai-provider.cjs --provider gemini --model gemini-3.5-flash
  MISTRAL_API_KEY=... node scripts/verify-live-ai-provider.cjs --provider mistral --model mistral-large-latest
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const providerId = String(args.provider || "").trim();
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Choose a provider with --provider. Supported providers: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  const baseUrl = provider.normalize(args["base-url"] || provider.defaultBaseUrl, provider.defaultBaseUrl);
  const model = String(args.model || provider.defaultModel).trim();
  const apiKey = String(args["api-key"] || process.env[provider.env] || "").trim();
  if (!apiKey && !(provider.allowNoKeyWhenLoopback && isLoopback(baseUrl))) {
    throw new Error(`${provider.label} requires an API key. Set ${provider.env} or pass --api-key.`);
  }
  const timeoutMs = Number.isFinite(Number(args["timeout-ms"]))
    ? Math.max(5000, Math.round(Number(args["timeout-ms"])))
    : DEFAULT_TIMEOUT_MS;
  const text = args.text || "Hello from LoopCAT.";
  const prompt = buildTranslationPrompt({
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    text
  });

  console.log("LoopCAT live hosted-provider verifier");
  console.log(`Provider: ${provider.label}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);

  const models = await fetchJson(apiUrl(baseUrl, provider.modelsPath), {
    method: "GET",
    headers: provider.auth(apiKey)
  }, timeoutMs);
  const modelList = provider.modelNames(models);
  console.log(`Model refresh: ok (${modelList.length} model${modelList.length === 1 ? "" : "s"})`);
  if (!args["skip-model-check"] && !modelIsListed(modelList, model)) {
    const message = `Requested model was not listed by ${provider.label}: ${model}.`;
    if (args["strict-model-check"]) throw new Error(message);
    console.warn(`Warning: ${message} Continuing because some providers list families or omit deployments.`);
  }

  const started = Date.now();
  const result = await fetchJson(apiUrl(baseUrl, provider.chatPath), {
    method: "POST",
    headers: provider.auth(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(provider.body(model, prompt))
  }, timeoutMs);
  const output = provider.output(result);
  if (!output) throw new Error(`${provider.label} returned an empty or malformed translation response.`);
  console.log(`Translation probe: ok (${Date.now() - started} ms)`);
  console.log(`Output preview: ${output.slice(0, 240)}`);
}

main().catch((error) => {
  console.error(`Live provider verification failed: ${error.message || error}`);
  process.exitCode = 1;
});
