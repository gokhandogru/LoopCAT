const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function mountPoint() {
  return {
    children: [],
    append(child) {
      this.children.push(child);
    }
  };
}

test("AI context controller separates administration from inspectable contextual output", async () => {
  const { createAiContextController } = await moduleAt("src/features/ai/ai-context-controller.js");
  const adminSection = {};
  const suggestionList = {};
  const outputDrawer = {};
  const adminMount = mountPoint();
  const suggestionMount = mountPoint();
  const outputMount = mountPoint();
  const contextualStatus = { textContent: "" };
  const controller = createAiContextController({
    adminSection,
    adminMount,
    suggestionList,
    suggestionMount,
    outputDrawer,
    outputMount,
    providerStatusText: { textContent: "Connected to local model" },
    contextualStatus
  });
  controller.mount();
  assert.equal(adminMount.children[0], adminSection);
  assert.equal(suggestionMount.children[0], suggestionList);
  assert.equal(outputMount.children[0], outputDrawer);
  assert.equal(contextualStatus.textContent, "Connected to local model");
});
