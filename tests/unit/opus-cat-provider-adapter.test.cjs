const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);
const ok = (data) => ({ response: { ok: true, status: 200 }, data });
const failed = (status, data) => ({ response: { ok: false, status }, data });

function createRuntime(results = []) {
  const calls = [];
  return {
    calls,
    OPUS_CAT_DEFAULT_BASE_URL: "http://localhost:8500",
    OPUS_CAT_DEFAULT_MODEL: "default",
    cleanModelTranslationOutput(value) {
      return String(value).replace(/^Translation:\s*/i, "").trim();
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "http://localhost:8500",
        model: config.model || "default",
        sourceLanguage: "English",
        sourceCode: "en",
        targetLanguage: "Turkish",
        targetCode: "tr"
      };
    },
    fetchJsonWithTimeout(url, options, config) {
      calls.push({ url, options, config });
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next || ok({});
    },
    isLoopbackBaseUrl(baseUrl) {
      return ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
    },
    localAiStartedAt() {
      return 100;
    },
    normalizeOpusCatBaseUrl(baseUrl) {
      return String(baseUrl || "http://localhost:8500")
        .replace(/\/+$/, "")
        .replace(/\/MTRestService$/i, "");
    },
    opusCatApiUrl(baseUrl, endpoint) {
      return `${this.normalizeOpusCatBaseUrl(baseUrl)}/MTRestService/${String(endpoint || "").replace(/^\/+/, "")}`;
    },
    opusCatConnectionCandidates(baseUrl) {
      const configured = this.normalizeOpusCatBaseUrl(baseUrl);
      if (!this.isLoopbackBaseUrl(configured)) return [configured];
      return [configured, "http://127.0.0.1:8500", "http://127.0.0.1:8502"];
    },
    opusCatConnectionMode(baseUrl) {
      return new URL(baseUrl).port === "8502" ? "browser bridge" : "direct engine";
    },
    redactSensitiveText(value) {
      return String(value).replace(/opus-secret/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("OPUS-CAT adapter preserves direct and bridge discovery, bounded probes, cancellation, and compatibility export", async () => {
  const { createOpusCatProviderAdapter, installOpusCatProviderAdapter } = await moduleAt(
    "src/ai/providers/opus-cat-provider-adapter.js"
  );
  const runtime = createRuntime([new Error("direct failed"), new Error("ipv4 failed"), ok(["en-tr", "de-fr"])]);
  const provider = createOpusCatProviderAdapter(runtime);
  const connected = await provider.testConnection({ baseUrl: "http://localhost:8500", timeoutMs: 9000 });
  assert.equal(connected.baseUrl, "http://127.0.0.1:8502");
  assert.equal(connected.connectionMode, "browser bridge");
  assert.equal(connected.autoDiscovered, true);
  assert.equal(connected.modelCount, 2);
  assert.equal(connected.version, "2 pairs");
  assert.equal(runtime.calls[0].config.timeoutMs, 5000);
  assert.equal(runtime.calls[2].url, "http://127.0.0.1:8502/MTRestService/ListSupportedLanguagePairs?tokenCode=0");

  const registered = [];
  const ai = { providerAdapterRuntime: createRuntime(), aiProviderRegistry: { register: (item) => registered.push(item) } };
  const installed = installOpusCatProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.OpusCatProvider, installed);

  const canceled = createOpusCatProviderAdapter(createRuntime([new Error("Local AI request canceled.")]));
  await assert.rejects(canceled.testConnection(), /canceled/);
});

test("OPUS-CAT adapter preserves language-pair filtering and installed model-tag discovery", async () => {
  const { createOpusCatProviderAdapter } = await moduleAt("src/ai/providers/opus-cat-provider-adapter.js");
  const runtime = createRuntime([ok(["en-tr", "de-fr"]), ok(["default", "legal-domain"]), ok(["de-fr"])]);
  const provider = createOpusCatProviderAdapter(runtime);
  const supported = await provider.listModels({ sourceCode: "en-US", targetCode: "tr_TR" });
  const unsupported = await provider.listModels({ sourceCode: "en", targetCode: "ja" });
  assert.deepEqual(supported.models, [
    { name: "default", size: 0, modifiedAt: "" },
    { name: "legal-domain", size: 0, modifiedAt: "" }
  ]);
  assert.equal(supported.raw.sourceCode, "en");
  assert.equal(supported.raw.targetCode, "tr");
  assert.equal(runtime.calls[0].url.includes("ListSupportedLanguagePairs?tokenCode=0"), true);
  const tagUrl = new URL(runtime.calls[1].url);
  assert.equal(tagUrl.pathname, "/MTRestService/GetLanguagePairModelTags");
  assert.equal(tagUrl.searchParams.get("srcLangCode"), "en");
  assert.equal(tagUrl.searchParams.get("trgLangCode"), "tr");
  assert.deepEqual(unsupported.models, []);
  assert.equal(runtime.calls.length, 3);
});

test("OPUS-CAT adapter preserves TranslateJson query encoding, default/custom model tags, abort, provenance, and segmented metadata", async () => {
  const { createOpusCatProviderAdapter, opusCatTranslationText } = await moduleAt(
    "src/ai/providers/opus-cat-provider-adapter.js"
  );
  assert.equal(opusCatTranslationText("raw"), "raw");
  assert.equal(opusCatTranslationText({ Translation: "upper" }), "upper");
  const runtime = createRuntime([
    ok({ translation: "Translation: Merhaba & hoşça kal", SegmentedTranslation: [{}, {}] }),
    ok({ Translation: "Hukuki çeviri" })
  ]);
  const provider = createOpusCatProviderAdapter(runtime);
  const signal = { aborted: false };
  const translated = await provider.translateSegment(
    { model: "default" },
    { text: "Hello & goodbye", sourceCode: "en", targetCode: "tr", signal }
  );
  const custom = await provider.translateSegment(
    { model: "legal-domain" },
    { text: "Legal text", sourceCode: "en", targetCode: "tr" }
  );
  const url = new URL(runtime.calls[0].url);
  assert.equal(url.pathname, "/MTRestService/TranslateJson");
  assert.equal(url.searchParams.get("input"), "Hello & goodbye");
  assert.equal(url.searchParams.get("modelTag"), "");
  assert.equal(url.searchParams.get("inputIsSingleSentence"), "true");
  assert.equal(runtime.calls[0].config.signal, signal);
  assert.equal(translated.translatedText, "Merhaba & hoşça kal");
  assert.equal(translated.providerId, "opus-cat");
  assert.equal(translated.model, "default");
  assert.equal(translated.metadata.segmentedTranslationCount, 2);
  assert.equal(custom.model, "legal-domain");
  assert.equal(new URL(runtime.calls[1].url).searchParams.get("modelTag"), "legal-domain");
});

test("OPUS-CAT adapter preserves actionable setup, redacted status, endpoint, and reachability failures", async () => {
  const { createOpusCatProviderAdapter } = await moduleAt("src/ai/providers/opus-cat-provider-adapter.js");
  const unavailable = createOpusCatProviderAdapter(
    createRuntime([new Error("down"), new Error("down"), new Error("down")])
  );
  await assert.rejects(unavailable.testConnection(), /Open Connection help/);

  const runtime = createRuntime([
    failed(401, { error: "credential opus-secret" }),
    failed(404, { error: "missing opus-secret" }),
    failed(429, { error: "quota opus-secret" }),
    new Error("socket failed")
  ]);
  const provider = createOpusCatProviderAdapter(runtime);
  await assert.rejects(provider.listModels(), /rejected the request/);
  await assert.rejects(provider.listModels(), /expected MTRestService endpoint/);
  await assert.rejects(provider.listModels(), (error) => error.message === "quota [redacted]");
  await assert.rejects(provider.listModels({ baseUrl: "https://engine.example" }), /not reachable at https:\/\/engine\.example/);
});
