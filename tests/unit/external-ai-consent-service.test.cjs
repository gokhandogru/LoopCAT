const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/external-ai-consent-service.js")).href);
}

function createHarness(createService, responses = []) {
  const questions = [];
  const service = createService({
    confirm(message) {
      questions.push(message);
      return responses.length ? responses.shift() : true;
    }
  });
  return { questions, service };
}

test("external AI consent normalizes blank, trimmed, and duplicate disclosure labels in stable order", async () => {
  const { createExternalAiConsentService } = await loadFactory();
  const { service } = createHarness(createExternalAiConsentService);
  assert.equal(
    service.humanReadableList([" first ", "", null, "second", "first", " third "]),
    "first, second, and third"
  );
});

test("external AI consent preserves zero, one, two, and Oxford-comma list grammar", async () => {
  const { createExternalAiConsentService } = await loadFactory();
  const { service } = createHarness(createExternalAiConsentService);
  assert.equal(service.humanReadableList([]), "");
  assert.equal(service.humanReadableList(["one"]), "one");
  assert.equal(service.humanReadableList(["one", "two"]), "one and two");
  assert.equal(service.humanReadableList(["one", "two", "three"]), "one, two, and three");
});

test("external AI consent includes source text, mandatory project instructions, and normalized context", async () => {
  const { createExternalAiConsentService } = await loadFactory();
  const harness = createHarness(createExternalAiConsentService);
  assert.equal(
    harness.service.confirmShare({
      provider: "Hosted AI",
      includesSourceText: true,
      contextLabels: ["translation-memory matches", " termbase matches ", "", "translation-memory matches"]
    }),
    true
  );
  assert.deepEqual(harness.questions, [
    "Open Hosted AI and send selected/source text, project instructions, translation-memory matches, and termbase matches outside LoopCAT?"
  ]);
});

test("external AI consent omits optional source text and deduplicates mandatory project instructions", async () => {
  const { createExternalAiConsentService } = await loadFactory();
  const harness = createHarness(createExternalAiConsentService);
  harness.service.confirmShare({
    provider: "Local gateway",
    includesSourceText: false,
    contextLabels: ["project instructions", "configured provider URL"]
  });
  assert.deepEqual(harness.questions, [
    "Open Local gateway and send project instructions and configured provider URL outside LoopCAT?"
  ]);
});

test("external AI consent propagates accepted and canceled confirmation results unchanged", async () => {
  const { createExternalAiConsentService } = await loadFactory();
  const harness = createHarness(createExternalAiConsentService, [false, "accepted"]);
  assert.equal(harness.service.confirmShare({ provider: "Provider A", includesSourceText: false }), false);
  assert.equal(harness.service.confirmShare({ provider: "Provider B", includesSourceText: true }), "accepted");
});
