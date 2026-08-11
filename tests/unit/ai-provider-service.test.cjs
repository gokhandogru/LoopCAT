const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("AI provider service validates adapters and exposes only public descriptors", async () => {
  const { createAiProviderService } = await moduleAt("src/ai/providers/legacy-registry-adapter.js");
  const provider = {
    id: "local",
    name: "Local provider",
    defaultBaseUrl: "http://127.0.0.1:1000",
    defaultModel: "model",
    secret: "must-not-leak",
    testConnection: () => Promise.resolve({ ok: true }),
    listModels: () => Promise.resolve({ models: [] }),
    translateSegment: (_config, request) => Promise.resolve({ translatedText: request.text })
  };
  const service = createAiProviderService({ get: () => provider, list: () => [provider] });
  assert.deepEqual(service.list(), [
    {
      id: "local",
      name: "Local provider",
      defaultBaseUrl: "http://127.0.0.1:1000",
      defaultModel: "model"
    }
  ]);
  assert.equal((await service.translateSegment("local", {}, { text: "Target" })).translatedText, "Target");
});
