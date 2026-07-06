#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "translategemma";
const DEFAULT_TIMEOUT_MS = 120000;

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

function normalizeOllamaBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(baseUrl, DEFAULT_BASE_URL);
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

function isHostedOllama(baseUrl) {
  return new URL(normalizeOllamaBaseUrl(baseUrl).rootBaseUrl).hostname.toLowerCase() === "ollama.com";
}

function requestHeaders(apiKey = "", extra = {}) {
  const cleanKey = String(apiKey || "").trim();
  return cleanKey ? { ...extra, Authorization: `Bearer ${cleanKey}` } : { ...extra };
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs} ms: ${url}`);
    }
    throw new Error(`Request failed: ${url} (${error.message || error})`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Ollama returned non-JSON response from ${url}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    const message = data?.error || data?.message || `HTTP ${response.status}`;
    throw new Error(`Ollama request failed at ${url}: ${message}`);
  }
  return data;
}

function modelNames(data) {
  return Array.isArray(data?.models)
    ? data.models.map((model) => String(model.name || model.model || "").trim()).filter(Boolean)
    : [];
}

function modelIsListed(installedModels, modelName) {
  const clean = String(modelName || "").trim();
  if (!clean) return false;
  return installedModels.some((model) => (
    model === clean ||
    (!clean.includes(":") && model.startsWith(`${clean}:`))
  ));
}

function buildTranslationPrompt({ sourceLanguage, sourceCode, targetLanguage, targetCode, text }) {
  return [
    `You are a professional ${sourceLanguage} (${sourceCode}) to ${targetLanguage} (${targetCode}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLanguage} text while adhering to ${targetLanguage} grammar, vocabulary, and cultural sensitivities.`,
    `Produce only the ${targetLanguage} translation, without any additional explanations or commentary. Please translate the following ${sourceLanguage} text into ${targetLanguage}:`,
    "",
    text,
    "",
    "CAT-tool requirements:",
    "Preserve placeholders exactly, including {name}, %s, %1$s, {{variable}}, <0>...</0>, XML/HTML tags, ICU syntax, markdown links, and escaped newline sequences.",
    "Do not add explanations, quotes, markdown, comments, or alternative translations.",
    "Keep numbers, product names, keyboard shortcuts, file paths, and variables unchanged unless translation requires surrounding grammar changes."
  ].join("\n");
}

function responseText(data) {
  const content = data?.message?.content;
  if (typeof content === "string") return content.trim();
  return "";
}

function printUsage() {
  console.log(`LoopCAT live Ollama verifier

Usage:
  node scripts/verify-live-ollama.cjs [options]

Options:
  --base-url <url>          Ollama root or /api URL. Default: ${DEFAULT_BASE_URL}
  --model <name>            Model to verify. Default: ${DEFAULT_MODEL}
  --api-key <key>           Hosted Ollama API key. Prefer OLLAMA_API_KEY.
  --source-language <name>  Default: English
  --source-code <code>      Default: en
  --target-language <name>  Default: Turkish
  --target-code <code>      Default: tr
  --text <text>             Source text for the translation probe.
  --timeout-ms <number>     Default: ${DEFAULT_TIMEOUT_MS}
  --skip-model-check        Attempt /api/chat even if /api/tags does not list the model.
  --help                    Show this help.

Examples:
  node scripts/verify-live-ollama.cjs --model translategemma
  node scripts/verify-live-ollama.cjs --base-url https://ollama.com --model gpt-oss:120b --api-key %OLLAMA_API_KEY%
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const baseUrl = args["base-url"] || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
  const model = args.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const apiKey = args["api-key"] || process.env.OLLAMA_API_KEY || "";
  const timeoutMs = Number.isFinite(Number(args["timeout-ms"]))
    ? Math.max(5000, Math.round(Number(args["timeout-ms"])))
    : DEFAULT_TIMEOUT_MS;
  const sourceLanguage = args["source-language"] || "English";
  const sourceCode = args["source-code"] || "en";
  const targetLanguage = args["target-language"] || "Turkish";
  const targetCode = args["target-code"] || "tr";
  const text = args.text || "Hello from LoopCAT.";
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  const hosted = isHostedOllama(baseUrl);
  if (hosted && !String(apiKey).trim()) {
    throw new Error("Hosted Ollama requires an API key. Set OLLAMA_API_KEY or pass --api-key.");
  }

  console.log("LoopCAT live Ollama verifier");
  console.log(`Base URL: ${normalized.rootBaseUrl}`);
  console.log(`API URL: ${normalized.apiBaseUrl}`);
  console.log(`Mode: ${hosted ? "hosted Ollama" : "local Ollama"}`);
  console.log(`Model: ${model}`);

  if (!hosted) {
    const versionUrl = ollamaApiUrl(baseUrl, "/version");
    const version = await fetchJson(versionUrl, { method: "GET", headers: requestHeaders(apiKey) }, timeoutMs);
    console.log(`Version check: ok${version?.version ? ` (${version.version})` : ""}`);
  }

  const tagsUrl = ollamaApiUrl(baseUrl, "/tags");
  const tags = await fetchJson(tagsUrl, { method: "GET", headers: requestHeaders(apiKey) }, timeoutMs);
  const installedModels = modelNames(tags);
  console.log(`Model refresh: ok (${installedModels.length} model${installedModels.length === 1 ? "" : "s"})`);
  if (!args["skip-model-check"] && !modelIsListed(installedModels, model)) {
    const shown = installedModels.slice(0, 8).join(", ") || "none returned";
    throw new Error(`Model ${model} was not returned by /api/tags. Installed/visible models: ${shown}. For local Ollama, run: ollama run ${model}`);
  }

  const prompt = buildTranslationPrompt({ sourceLanguage, sourceCode, targetLanguage, targetCode, text });
  const chatStarted = Date.now();
  const chat = await fetchJson(ollamaApiUrl(baseUrl, "/chat"), {
    method: "POST",
    headers: requestHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0.1 }
    })
  }, timeoutMs);
  const output = responseText(chat);
  if (!output) throw new Error("Ollama returned an empty or malformed /api/chat response.");
  console.log(`Pre-translation chat: ok (${Date.now() - chatStarted} ms)`);
  console.log(`Output preview: ${output.slice(0, 240)}`);
}

main().catch((error) => {
  console.error(`Live Ollama verification failed: ${error.message || error}`);
  process.exitCode = 1;
});
