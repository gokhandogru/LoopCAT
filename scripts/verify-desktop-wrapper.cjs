const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const desktopMainPath = path.join(root, "desktop", "main.cjs");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) failures.push(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function assertNull(value, message) {
  if (value !== null) failures.push(`${message} Expected null, got ${JSON.stringify(value)}.`);
}

function normalizeFilePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

const wrapper = require(desktopMainPath);
const { runtimeAssets: expectedRuntimeFiles } = require(path.join(root, "config", "production-assets.js"));

const requiredExports = [
  "APP_SCHEME",
  "APP_HOST",
  "APP_ROOT",
  "SPELLCHECKER_DICTIONARY_DOWNLOAD_URL",
  "ALLOWED_EXTERNAL_HOSTS",
  "ALLOWED_APP_FILES",
  "normalizeAppRelativePath",
  "canonicalSpellCheckerLanguageCode",
  "spellCheckerLanguageCandidates",
  "selectSpellCheckerLanguages",
  "buildSpellCheckerContextMenuTemplate",
  "isAllowedAppPath",
  "resolveAppFile",
  "isAllowedOpenAiResponsesUrl",
  "isAllowedNetworkRequest",
  "isAllowedOpusCatRuntimeUrl",
  "opusCatCorsResponseHeaders",
  "isAllowedGeminiUrl",
  "isAllowedHostedOpenAiCompatibleUrl",
  "isLoopcatUrl",
  "isLoopcatOrigin",
  "isAllowedAppNavigationUrl",
  "isExternalHttpsUrl",
  "lmStudioCliCandidates",
  "startLmStudioServerFromDesktop",
  "desktopCreatorIdentity",
  "createRendererWebPreferences"
];

for (const exportName of requiredExports) {
  assert(Object.hasOwn(wrapper, exportName), `desktop/main.cjs must export ${exportName} for wrapper verification.`);
}

assertEqual(wrapper.APP_SCHEME, "loopcat", "The desktop app protocol must stay private and stable.");
assertEqual(wrapper.APP_HOST, "app", "The desktop app host must stay stable.");
assertEqual(wrapper.SPELLCHECKER_DICTIONARY_DOWNLOAD_URL, "loopcat://app/spellcheck-dictionaries/", "Spellchecker dictionary downloads must stay pinned to the app origin.");
assertEqual(wrapper.OPENAI_RESPONSES_URL, "https://api.openai.com/v1/responses", "The explicit external AI endpoint must stay narrow.");
assertEqual(path.resolve(wrapper.APP_ROOT), root, "The desktop app root must be the repository root.");
assert(wrapper.ALLOWED_APP_FILES instanceof Set, "ALLOWED_APP_FILES must be a Set.");
assert(wrapper.ALLOWED_EXTERNAL_HOSTS instanceof Set, "ALLOWED_EXTERNAL_HOSTS must be a Set.");
assert(!wrapper.ALLOWED_EXTERNAL_HOSTS.has("chatgpt.com"), "Desktop external host allowlist must not include the removed ChatGPT action host.");
assert(!wrapper.ALLOWED_EXTERNAL_HOSTS.has("example.com"), "Desktop external host allowlist must not include generic HTTPS hosts.");

for (const relativePath of expectedRuntimeFiles) {
  assert(wrapper.ALLOWED_APP_FILES.has(relativePath), `Desktop protocol allowlist is missing ${relativePath}.`);
  assert(wrapper.isAllowedAppPath(relativePath), `Desktop protocol must allow ${relativePath}.`);
  assert(fs.existsSync(path.join(root, relativePath)), `Desktop protocol allowlisted file is missing on disk: ${relativePath}.`);
}

for (const relativePath of wrapper.ALLOWED_APP_FILES) {
  assert(expectedRuntimeFiles.includes(relativePath), `Desktop protocol allowlist contains an unexpected file: ${relativePath}.`);
  assert(fs.existsSync(path.join(root, relativePath)), `Desktop protocol allowlist contains a missing file: ${relativePath}.`);
}

for (const forbiddenPath of [
  "package.json",
  "README.md",
  "docs/desktop-packaging.md",
  "test-runner.html",
  "smoke-test.html",
  "regression-test.html",
  "offline-shell-test.html",
  "large-project-test.html",
  "desktop/main.cjs",
  "scripts/verify-release.cjs",
  "node_modules/electron/index.js",
  "dist/win-unpacked/resources/app.asar"
]) {
  assert(!wrapper.ALLOWED_APP_FILES.has(forbiddenPath), `Desktop protocol allowlist must not expose ${forbiddenPath}.`);
  assert(!wrapper.isAllowedAppPath(forbiddenPath), `Desktop protocol must deny ${forbiddenPath}.`);
}

for (const [input, expected] of [
  ["", "index.html"],
  ["./index.html", "index.html"],
  ["styles.css", "styles.css"],
  ["i18n/locales/en-US.js", "i18n/locales/en-US.js"],
  ["icons/loopcat-icon.svg", "icons/loopcat-icon.svg"],
  ["icons//loopcat-icon.svg", "icons/loopcat-icon.svg"]
]) {
  assertEqual(wrapper.normalizeAppRelativePath(input), expected, `normalizeAppRelativePath(${JSON.stringify(input)}) returned the wrong path.`);
}

for (const input of [
  "../index.html",
  "icons/../index.html",
  "..\\index.html",
  "/index.html",
  "C:/index.html",
  "styles.css/../../index.html"
]) {
  assertEqual(wrapper.normalizeAppRelativePath(input), "", `normalizeAppRelativePath(${JSON.stringify(input)}) must reject unsafe input.`);
}

for (const [url, expectedFile] of [
  ["loopcat://app", "index.html"],
  ["loopcat://app/", "index.html"],
  ["loopcat://app/index.html", "index.html"],
  ["loopcat://app/styles.css", "styles.css"],
  ["loopcat://app/liquid-glass/styles.css", "liquid-glass/styles.css"],
  ["loopcat://app/config/production-assets.js", "config/production-assets.js"],
  ["loopcat://app/icons/loopcat-icon.svg", "icons/loopcat-icon.svg"],
  ["loopcat://app/icons/loopcat-icon.png", "icons/loopcat-icon.png"]
]) {
  const resolved = wrapper.resolveAppFile(url);
  assert(resolved, `resolveAppFile(${url}) must resolve to a file.`);
  assertEqual(normalizeFilePath(path.relative(root, resolved)), expectedFile, `resolveAppFile(${url}) resolved the wrong file.`);
}

for (const url of [
  "https://app/index.html",
  "file:///index.html",
  "loopcat://evil/index.html",
  "loopcat://app/package.json",
  "loopcat://app/test-runner.html",
  "loopcat://app/desktop/main.cjs",
  "loopcat://app/%2e%2e/index.html",
  "loopcat://app/icons/%2e%2e/index.html",
  "loopcat://app/%2findex.html",
  "loopcat://app/%5cindex.html"
]) {
  assertNull(wrapper.resolveAppFile(url), `resolveAppFile(${url}) must reject unsafe or non-runtime URLs.`);
}

assert(wrapper.isLoopcatUrl("loopcat://app/index.html"), "isLoopcatUrl must accept the app origin.");
assert(!wrapper.isLoopcatUrl("loopcat://evil/index.html"), "isLoopcatUrl must reject other loopcat hosts.");
assert(!wrapper.isLoopcatUrl("https://app/index.html"), "isLoopcatUrl must reject web URLs.");
assert(wrapper.isLoopcatOrigin("loopcat://app/index.html"), "isLoopcatOrigin must accept the app origin.");
assert(!wrapper.isLoopcatOrigin("loopcat://evil/index.html"), "isLoopcatOrigin must reject other loopcat hosts.");
assert(!wrapper.isLoopcatOrigin("null"), "isLoopcatOrigin must reject opaque or invalid origins.");
for (const url of [
  "loopcat://app",
  "loopcat://app/",
  "loopcat://app/index.html",
  "loopcat://app/index.html#editor"
]) {
  assert(wrapper.isAllowedAppNavigationUrl(url), `Desktop top-level navigation must allow the app shell URL ${url}.`);
}
for (const url of [
  "loopcat://app/styles.css",
  "loopcat://app/service-worker.js",
  "loopcat://app/icons/loopcat-icon.svg",
  "loopcat://app/test-runner.html",
  "loopcat://evil/index.html",
  "https://chatgpt.com/",
  "file:///tmp/source.docx"
]) {
  assert(!wrapper.isAllowedAppNavigationUrl(url), `Desktop top-level navigation must deny ${url}.`);
}
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/"), "isExternalHttpsUrl must reject the removed ChatGPT external action.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/?q=Translate"), "isExternalHttpsUrl must reject removed ChatGPT prompt URLs.");
assert(!wrapper.isExternalHttpsUrl("https://example.com/path?q=1"), "isExternalHttpsUrl must reject generic HTTPS links.");
assert(!wrapper.isExternalHttpsUrl("https://api.openai.com/v1/responses"), "isExternalHttpsUrl must not open the API endpoint in the system browser.");
assert(!wrapper.isExternalHttpsUrl("https://user:pass@chatgpt.com/"), "isExternalHttpsUrl must reject credential-bearing URLs.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com:444/"), "isExternalHttpsUrl must reject non-default ChatGPT ports.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/gpts"), "isExternalHttpsUrl must reject non-action ChatGPT paths.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/?token=sk-chatgpt-query-token-that-must-not-open"), "isExternalHttpsUrl must reject non-prompt ChatGPT query parameters.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/?q=Translate&token=sk-chatgpt-query-token-that-must-not-open"), "isExternalHttpsUrl must reject credential-looking ChatGPT query variants.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/?q=Translate&q=Again"), "isExternalHttpsUrl must reject duplicated ChatGPT prompt query parameters.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/?q="), "isExternalHttpsUrl must reject empty ChatGPT prompt query parameters.");
assert(!wrapper.isExternalHttpsUrl("https://chatgpt.com/#external"), "isExternalHttpsUrl must reject fragment-bearing ChatGPT URLs.");
assert(!wrapper.isExternalHttpsUrl("http://chatgpt.com/"), "isExternalHttpsUrl must reject insecure HTTP links.");
assert(!wrapper.isExternalHttpsUrl("loopcat://app/index.html"), "isExternalHttpsUrl must reject app-shell URLs.");
assert(!wrapper.isExternalHttpsUrl("file:///tmp/source.docx"), "isExternalHttpsUrl must reject file URLs.");
assert(!wrapper.isExternalHttpsUrl("javascript:alert(1)"), "isExternalHttpsUrl must reject script URLs.");

assert(wrapper.isAllowedOpenAiResponsesUrl("https://api.openai.com/v1/responses"), "isAllowedOpenAiResponsesUrl must allow the exact OpenAI Responses endpoint.");
assert(wrapper.isAllowedOpenAiResponsesUrl("https://api.openai.com/v1/models"), "isAllowedOpenAiResponsesUrl must allow the exact OpenAI Models endpoint.");
for (const url of [
  "http://api.openai.com/v1/responses",
  "https://api.openai.com/v1/chat/completions",
  "https://api.openai.com/v1/models?limit=20",
  "https://user:pass@api.openai.com/v1/responses",
  "https://api.openai.com:444/v1/responses",
  "https://api.openai.com/v1/responses?store=true",
  "https://api.openai.com/v1/responses#fragment",
  "https://api.openai.com/v1/responses/"
]) {
  assert(!wrapper.isAllowedOpenAiResponsesUrl(url), `isAllowedOpenAiResponsesUrl must reject ${url}.`);
}

assert(wrapper.LOCAL_AI_RUNTIME_HOSTS.has("localhost"), "Desktop local AI allowlist must include localhost.");
assert(wrapper.LOCAL_AI_RUNTIME_PORTS.has("11434"), "Desktop local AI allowlist must include Ollama's default port.");
assert(wrapper.LOCAL_AI_RUNTIME_PORTS.has("1234"), "Desktop local AI allowlist must include LM Studio's default port.");
assertEqual(wrapper.OPUS_CAT_RUNTIME_PORT, "8500", "Desktop OPUS-CAT allowlist must pin the default local OPUS-CAT HTTP port.");
assert(wrapper.OLLAMA_CLOUD_HOST === "ollama.com", "Desktop hosted Ollama allowlist must pin ollama.com.");
assert(wrapper.GEMINI_HOST === "generativelanguage.googleapis.com", "Desktop Gemini allowlist must pin the Gemini API host.");
assert(wrapper.ANTHROPIC_HOST === "api.anthropic.com", "Desktop Anthropic allowlist must pin the Anthropic API host.");
assert(wrapper.COHERE_HOST === "api.cohere.com", "Desktop Cohere allowlist must pin the Cohere API host.");
assert(wrapper.AZURE_OPENAI_HOST_SUFFIXES.includes(".openai.azure.com"), "Desktop Azure OpenAI allowlist must include Azure OpenAI resource hosts.");
assert(wrapper.AZURE_OPENAI_API_PATHS.has("/openai/v1/responses"), "Desktop Azure OpenAI allowlist must include the Responses endpoint.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS instanceof Map, "Desktop hosted OpenAI-compatible allowlist must be a Map.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.deepseek.com"), "Desktop hosted OpenAI-compatible allowlist must include DeepSeek.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.mistral.ai"), "Desktop hosted OpenAI-compatible allowlist must include Mistral AI.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.x.ai"), "Desktop hosted OpenAI-compatible allowlist must include xAI.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.perplexity.ai"), "Desktop hosted OpenAI-compatible allowlist must include Perplexity.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.groq.com"), "Desktop hosted OpenAI-compatible allowlist must include Groq.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.together.ai"), "Desktop hosted OpenAI-compatible allowlist must include Together AI.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("openrouter.ai"), "Desktop hosted OpenAI-compatible allowlist must include OpenRouter.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("router.huggingface.co"), "Desktop hosted OpenAI-compatible allowlist must include Hugging Face Inference Providers.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.deepinfra.com"), "Desktop hosted OpenAI-compatible allowlist must include DeepInfra.");
assert(wrapper.HOSTED_OPENAI_COMPATIBLE_API_PATHS.has("api.fireworks.ai"), "Desktop hosted OpenAI-compatible allowlist must include Fireworks AI.");

assertEqual(wrapper.canonicalSpellCheckerLanguageCode("pt_br"), "pt-BR", "Spellchecker language normalization must canonicalize locale separators.");
assertEqual(wrapper.canonicalSpellCheckerLanguageCode("Bearer token"), "", "Spellchecker language normalization must reject non-language metadata.");
assert(wrapper.spellCheckerLanguageCandidates("en").includes("en-US"), "Spellchecker language candidates must include English locale fallback.");
assertEqual(
  wrapper.selectSpellCheckerLanguages(["en"], ["fr", "en-US", "tr"])[0],
  "en-US",
  "Spellchecker language selection must pick a supported English locale fallback."
);
assertEqual(
  wrapper.selectSpellCheckerLanguages(["pt-BR"], ["pt-PT", "tr"])[0],
  "pt-PT",
  "Spellchecker language selection must fall back to a supported same-language locale."
);
assertEqual(
  wrapper.selectSpellCheckerLanguages(["zz"], ["en-US", "tr"]).length,
  0,
  "Spellchecker language selection must not silently fall back to an unrelated language."
);
const spellingMenuTemplate = wrapper.buildSpellCheckerContextMenuTemplate({
  isEditable: true,
  misspelledWord: "exampull",
  dictionarySuggestions: ["example", "examples", "example"]
});
assert(spellingMenuTemplate.some((item) => item.spellcheckReplacement === "example"), "Spellchecker context menu must expose replacement suggestions.");
assert(spellingMenuTemplate.some((item) => item.spellcheckAddWord === "exampull"), "Spellchecker context menu must expose add-to-dictionary.");
assertEqual(wrapper.buildSpellCheckerContextMenuTemplate({ isEditable: false }).length, 0, "Spellchecker context menu must stay out of non-editable content.");

for (const url of [
  "http://localhost:11434/api/version",
  "http://127.0.0.1:11434/api/tags",
  "http://localhost:11434/api/chat",
  "http://localhost:11434/api/pull",
  "http://localhost:1234/v1/models",
  "http://127.0.0.1:1234/v1/chat/completions"
]) {
  assert(wrapper.isAllowedLocalAiRuntimeUrl(url), `isAllowedLocalAiRuntimeUrl must allow ${url}.`);
}
for (const url of [
  "http://localhost:11435/api/chat",
  "http://localhost:11434/api/show",
  "http://localhost:11434/api/chat?token=sk-local-ai-query-token-that-must-not-pass",
  "http://user:pass@localhost:11434/api/chat",
  "http://example.com:11434/api/chat",
  "https://localhost:11434/api/chat"
]) {
  assert(!wrapper.isAllowedLocalAiRuntimeUrl(url), `isAllowedLocalAiRuntimeUrl must reject ${url}.`);
}
for (const url of [
  "http://localhost:8500/MTRestService/ListSupportedLanguagePairs?tokenCode=0",
  "http://127.0.0.1:8500/MTRestService/GetLanguagePairModelTags?tokenCode=0&srcLangCode=en&trgLangCode=tr",
  "http://localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr&modelTag=&inputIsSingleSentence=true"
]) {
  assert(wrapper.isAllowedOpusCatRuntimeUrl(url), `isAllowedOpusCatRuntimeUrl must allow ${url}.`);
}
for (const url of [
  "http://localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&apiKey=sk-opus-cat-query-token-that-must-not-pass&srcLangCode=en&trgLangCode=tr",
  "http://localhost:8500/MTRestService/TranslateJson?tokenCode=0&tokenCode=1&input=Hello&srcLangCode=en&trgLangCode=tr",
  "http://localhost:8500/MTRestService/Unknown?tokenCode=0",
  "http://localhost:8501/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr",
  "http://user:pass@localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr",
  "https://localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr"
]) {
  assert(!wrapper.isAllowedOpusCatRuntimeUrl(url), `isAllowedOpusCatRuntimeUrl must reject ${url}.`);
}
const opusCatCorsHeaders = wrapper.opusCatCorsResponseHeaders({
  "Content-Type": ["application/json; charset=utf-8"],
  "Access-Control-Allow-Origin": ["https://unexpected.example"],
  Server: ["Microsoft-HTTPAPI/2.0"]
});
assertEqual(opusCatCorsHeaders["Access-Control-Allow-Origin"]?.[0], "*", "OPUS-CAT desktop response headers must allow the renderer to read local MT JSON.");
assertEqual(opusCatCorsHeaders["Access-Control-Allow-Methods"]?.[0], "GET", "OPUS-CAT desktop response headers must expose the local GET API.");
assertEqual(opusCatCorsHeaders["Content-Type"]?.[0], "application/json; charset=utf-8", "OPUS-CAT desktop response headers must preserve normal response metadata.");
assert(!Object.hasOwn(opusCatCorsHeaders, "access-control-allow-origin"), "OPUS-CAT desktop response headers must avoid duplicate CORS header casing.");
for (const url of [
  "https://ollama.com/api/tags",
  "https://ollama.com/api/chat"
]) {
  assert(wrapper.isAllowedOllamaCloudUrl(url), `isAllowedOllamaCloudUrl must allow ${url}.`);
}
for (const url of [
  "https://ollama.com/api/pull",
  "https://ollama.com/api/version",
  "https://ollama.com/api/chat?model=gpt-oss",
  "https://user:pass@ollama.com/api/chat",
  "https://api.ollama.com/api/chat",
  "http://ollama.com/api/chat"
]) {
  assert(!wrapper.isAllowedOllamaCloudUrl(url), `isAllowedOllamaCloudUrl must reject ${url}.`);
}

for (const url of [
  "https://generativelanguage.googleapis.com/v1beta/models",
  "https://generativelanguage.googleapis.com/v1beta/interactions"
]) {
  assert(wrapper.isAllowedGeminiUrl(url), `isAllowedGeminiUrl must allow ${url}.`);
}

for (const url of [
  "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-query-key-that-must-not-pass",
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  "https://generativelanguage.googleapis.com/v1/models",
  "https://generativelanguage.googleapis.com:444/v1beta/interactions",
  "https://user:pass@generativelanguage.googleapis.com/v1beta/interactions",
  "http://generativelanguage.googleapis.com/v1beta/interactions"
]) {
  assert(!wrapper.isAllowedGeminiUrl(url), `isAllowedGeminiUrl must reject ${url}.`);
}

for (const url of [
  "https://api.anthropic.com/v1/models",
  "https://api.anthropic.com/v1/messages"
]) {
  assert(wrapper.isAllowedAnthropicUrl(url), `isAllowedAnthropicUrl must allow ${url}.`);
}

for (const url of [
  "https://api.anthropic.com/v1/messages?anthropic-version=2023-06-01",
  "https://api.anthropic.com/v1/messages/count_tokens",
  "https://api.anthropic.com/v1/complete",
  "https://api.anthropic.com:444/v1/messages",
  "https://user:pass@api.anthropic.com/v1/messages",
  "http://api.anthropic.com/v1/messages"
]) {
  assert(!wrapper.isAllowedAnthropicUrl(url), `isAllowedAnthropicUrl must reject ${url}.`);
}

for (const url of [
  "https://api.cohere.com/v1/models",
  "https://api.cohere.com/v2/chat"
]) {
  assert(wrapper.isAllowedCohereUrl(url), `isAllowedCohereUrl must allow ${url}.`);
}

for (const url of [
  "https://api.cohere.com/v2/chat?key=cohere-query-key-that-must-not-pass",
  "https://api.cohere.com/v1/chat",
  "https://api.cohere.com/v2/rerank",
  "https://api.cohere.com:444/v2/chat",
  "https://user:pass@api.cohere.com/v2/chat",
  "http://api.cohere.com/v2/chat"
]) {
  assert(!wrapper.isAllowedCohereUrl(url), `isAllowedCohereUrl must reject ${url}.`);
}

for (const url of [
  "https://loopcat-test.openai.azure.com/openai/v1/models",
  "https://loopcat-test.openai.azure.com/openai/v1/responses",
  "https://loopcat-test.openai.azure.com/openai/v1/chat/completions",
  "https://loopcat-test.services.ai.azure.com/openai/v1/responses"
]) {
  assert(wrapper.isAllowedAzureOpenAiUrl(url), `isAllowedAzureOpenAiUrl must allow ${url}.`);
}

for (const url of [
  "https://openai.azure.com/openai/v1/responses",
  "https://loopcat-test.openai.azure.com/openai/v1/responses?api-version=2024-10-21",
  "https://loopcat-test.openai.azure.com/openai/deployments/deploy/chat/completions",
  "https://loopcat-test.openai.azure.com:444/openai/v1/responses",
  "https://user:pass@loopcat-test.openai.azure.com/openai/v1/responses",
  "https://loopcat-test.openai.azure.com.evil.example/openai/v1/responses",
  "http://loopcat-test.openai.azure.com/openai/v1/responses"
]) {
  assert(!wrapper.isAllowedAzureOpenAiUrl(url), `isAllowedAzureOpenAiUrl must reject ${url}.`);
}

for (const url of [
  "https://api.deepseek.com/models",
  "https://api.deepseek.com/chat/completions",
  "https://api.mistral.ai/v1/models",
  "https://api.mistral.ai/v1/chat/completions",
  "https://api.x.ai/v1/models",
  "https://api.x.ai/v1/responses",
  "https://api.x.ai/v1/chat/completions",
  "https://api.perplexity.ai/v1/models",
  "https://api.perplexity.ai/v1/sonar",
  "https://api.perplexity.ai/chat/completions",
  "https://api.groq.com/openai/v1/models",
  "https://api.groq.com/openai/v1/chat/completions",
  "https://api.together.ai/v1/models",
  "https://api.together.ai/v1/chat/completions",
  "https://openrouter.ai/api/v1/models",
  "https://openrouter.ai/api/v1/chat/completions",
  "https://router.huggingface.co/v1/models",
  "https://router.huggingface.co/v1/chat/completions",
  "https://api.deepinfra.com/v1/openai/models",
  "https://api.deepinfra.com/v1/openai/chat/completions",
  "https://api.fireworks.ai/inference/v1/models",
  "https://api.fireworks.ai/inference/v1/chat/completions"
]) {
  assert(wrapper.isAllowedHostedOpenAiCompatibleUrl(url), `isAllowedHostedOpenAiCompatibleUrl must allow ${url}.`);
}

for (const url of [
  "https://api.deepseek.com/v1/chat/completions",
  "https://api.mistral.ai/v1/chat/completions?model=mistral-large",
  "https://api.x.ai/chat/completions",
  "https://api.perplexity.ai/v1/chat/completions",
  "https://api.perplexity.ai/v1/sonar?model=sonar-pro",
  "https://api.perplexity.ai/chat/completions?model=sonar-pro",
  "https://api.groq.com/v1/chat/completions",
  "https://api.together.ai/models",
  "https://user:pass@openrouter.ai/api/v1/chat/completions",
  "https://router.huggingface.co:444/v1/models",
  "https://api.deepinfra.com/v1/chat/completions",
  "https://api.fireworks.ai/v1/chat/completions",
  "https://api.deepinfra.com/v1/openai/chat/completions?model=llama",
  "https://api.fireworks.ai/inference/v1/models?limit=20",
  "http://api.deepseek.com/chat/completions",
  "https://example.com/v1/chat/completions"
]) {
  assert(!wrapper.isAllowedHostedOpenAiCompatibleUrl(url), `isAllowedHostedOpenAiCompatibleUrl must reject ${url}.`);
}

const devRendererPreferences = wrapper.createRendererWebPreferences({ rendererSandbox: true, isPackaged: false });
const packagedRendererPreferences = wrapper.createRendererWebPreferences({ rendererSandbox: true, isPackaged: true });
const fallbackRendererPreferences = wrapper.createRendererWebPreferences({ rendererSandbox: false, isPackaged: true });
assertEqual(devRendererPreferences.contextIsolation, true, "Desktop renderer must keep context isolation enabled.");
assertEqual(normalizeFilePath(devRendererPreferences.preload), normalizeFilePath(path.join(root, "desktop", "preload.cjs")), "Desktop renderer must load the narrow LoopCAT preload bridge.");
assertEqual(devRendererPreferences.nodeIntegration, false, "Desktop renderer must keep Node integration disabled.");
assertEqual(devRendererPreferences.nodeIntegrationInWorker, false, "Desktop renderer must keep Node integration disabled in workers.");
assertEqual(devRendererPreferences.nodeIntegrationInSubFrames, false, "Desktop renderer must keep Node integration disabled in subframes.");
assertEqual(devRendererPreferences.sandbox, true, "Desktop renderer preferences must preserve explicit sandbox enablement.");
assertEqual(devRendererPreferences.webSecurity, true, "Desktop renderer must keep web security enabled.");
assertEqual(devRendererPreferences.allowRunningInsecureContent, false, "Desktop renderer must reject insecure content.");
assertEqual(devRendererPreferences.webviewTag, false, "Desktop renderer must keep webview tags disabled.");
assertEqual(devRendererPreferences.enableWebSQL, false, "Desktop renderer must keep legacy WebSQL disabled.");
assertEqual(devRendererPreferences.spellcheck, true, "Desktop renderer must keep native spellcheck enabled.");
assertEqual(devRendererPreferences.navigateOnDragDrop, false, "Desktop renderer must not navigate when a file is dragged onto the app.");
assertEqual(devRendererPreferences.devTools, true, "Development desktop runs may keep DevTools available.");
assertEqual(packagedRendererPreferences.devTools, false, "Packaged desktop runs must not expose DevTools.");
assertEqual(fallbackRendererPreferences.sandbox, true, "Desktop renderer preferences must reject attempts to disable the OS sandbox.");

const windowsLmStudioCandidates = wrapper.lmStudioCliCandidates("win32", {
  LOCALAPPDATA: "C:\\Users\\translator\\AppData\\Local"
}, "C:\\Users\\translator").map(normalizeFilePath);
assert(windowsLmStudioCandidates.includes("C:/Users/translator/.lmstudio/bin/lms.exe"), "Desktop LM Studio helper must look for the default Windows lms.exe CLI.");
assert(windowsLmStudioCandidates.includes("lms.exe"), "Desktop LM Studio helper must fall back to lms.exe on PATH.");
const linuxLmStudioCandidates = wrapper.lmStudioCliCandidates("linux", {}, "/home/translator").map(normalizeFilePath);
assert(linuxLmStudioCandidates.includes("/home/translator/.lmstudio/bin/lms"), "Desktop LM Studio helper must look for the default Unix lms CLI.");
assert(linuxLmStudioCandidates.includes("lms"), "Desktop LM Studio helper must fall back to lms on PATH.");

for (const url of [
  "loopcat://app/index.html",
  "loopcat://app/service-worker.js",
  pathToFileURL(path.join(root, "index.html")).toString(),
  pathToFileURL(path.join(root, "icons", "loopcat-icon.svg")).toString(),
  "data:text/plain,LoopCAT",
  "blob:loopcat://app/runtime-cache",
  "about:blank",
  "https://api.openai.com/v1/responses",
  "https://api.openai.com/v1/models",
  "https://generativelanguage.googleapis.com/v1beta/interactions",
  "https://api.anthropic.com/v1/messages",
  "https://api.cohere.com/v2/chat",
  "https://loopcat-test.openai.azure.com/openai/v1/responses",
  "https://ollama.com/api/chat",
  "https://api.deepseek.com/chat/completions",
  "https://api.mistral.ai/v1/models",
  "https://api.x.ai/v1/responses",
  "https://api.perplexity.ai/v1/sonar",
  "https://api.perplexity.ai/chat/completions",
  "https://api.groq.com/openai/v1/chat/completions",
  "https://api.together.ai/v1/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
  "https://router.huggingface.co/v1/chat/completions",
  "https://api.deepinfra.com/v1/openai/chat/completions",
  "https://api.fireworks.ai/inference/v1/chat/completions",
  "http://localhost:11434/api/chat",
  "http://127.0.0.1:1234/v1/models",
  "http://localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr&modelTag=&inputIsSingleSentence=true"
]) {
  assert(wrapper.isAllowedNetworkRequest(url), `Desktop network boundary must allow ${url}.`);
}

for (const url of [
  "loopcat://evil/index.html",
  `${wrapper.SPELLCHECKER_DICTIONARY_DOWNLOAD_URL}en-US.bdic`,
  "loopcat://app/test-runner.html",
  pathToFileURL(path.join(root, "package.json")).toString(),
  pathToFileURL(path.resolve(root, "..", "outside.txt")).toString(),
  "http://api.openai.com/v1/responses",
  "https://api.openai.com/v1/chat/completions",
  "https://api.openai.com/v1/models?limit=20",
  "https://user:pass@api.openai.com/v1/responses",
  "https://api.openai.com:444/v1/responses",
  "https://api.openai.com/v1/responses?store=true",
  "https://api.openai.com/v1/responses#fragment",
  "https://generativelanguage.googleapis.com/v1beta/interactions?key=gemini-query-key-that-must-not-pass",
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  "https://api.anthropic.com/v1/messages?x-api-key=anthropic-query-key-that-must-not-pass",
  "https://api.anthropic.com/v1/messages/count_tokens",
  "https://api.cohere.com/v2/chat?key=cohere-query-key-that-must-not-pass",
  "https://api.cohere.com/v2/rerank",
  "https://loopcat-test.openai.azure.com/openai/v1/responses?api-version=2024-10-21",
  "https://loopcat-test.openai.azure.com/openai/deployments/deploy/chat/completions",
  "https://ollama.com/api/version",
  "https://ollama.com/api/chat?token=sk-ollama-cloud-query-token-that-must-not-pass",
  "https://api.ollama.com/api/chat",
  "https://api.deepseek.com/v1/chat/completions",
  "https://api.mistral.ai/v1/models?limit=20",
  "https://api.x.ai/v1/responses?store=true",
  "https://api.x.ai/v1/chat/completions?model=grok",
  "https://api.perplexity.ai/v1/chat/completions",
  "https://api.perplexity.ai/v1/sonar?token=sk-perplexity-query-token-that-must-not-pass",
  "https://api.groq.com/v1/chat/completions",
  "https://user:pass@openrouter.ai/api/v1/chat/completions",
  "https://router.huggingface.co:444/v1/models",
  "https://api.deepinfra.com/v1/openai/chat/completions?token=sk-deepinfra-query-token-that-must-not-pass",
  "https://api.fireworks.ai/v1/chat/completions",
  "https://chatgpt.com/",
  "https://example.com/script.js",
  "http://localhost:11435/api/chat",
  "http://localhost:11434/api/show",
  "http://localhost:8500/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr&apiKey=sk-opus-cat-query-token-that-must-not-pass",
  "http://localhost:8501/MTRestService/TranslateJson?tokenCode=0&input=Hello&srcLangCode=en&trgLangCode=tr",
  "http://user:pass@localhost:11434/api/chat",
  "http://example.com:11434/api/chat",
  "devtools://devtools/bundled/inspector.html"
]) {
  assert(!wrapper.isAllowedNetworkRequest(url), `Desktop network boundary must deny ${url}.`);
}

if (failures.length) {
  console.error("Desktop wrapper verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Desktop wrapper verification passed.");
