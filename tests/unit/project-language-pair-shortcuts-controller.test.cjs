const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProjectLanguagePairShortcutsController, overrides = {}) {
  const calls = [];
  const shortcutRoot = overrides.hasRoot === false ? null : { id: "shortcuts" };
  const controller = createProjectLanguagePairShortcutsController({
    root: shortcutRoot,
    getProjects: () => overrides.projects || [],
    getCurrentValues: () => overrides.current || { sourceLang: "en", targetLang: "tr" },
    normalizeLanguage(value) {
      calls.push(["normalizeLanguage", value]);
      return String(value || "")
        .trim()
        .toLowerCase();
    },
    defaultPairs: overrides.defaultPairs || [
      ["en", "tr"],
      ["en", "ca"],
      ["de", "tr"]
    ],
    languagePairDisplay: (source, target) => `pair:<${source}>-><${target}>`,
    escapeHtml: (value) => `escaped:${value}`,
    replaceSafeHtml(element, html) {
      calls.push(["replaceSafeHtml", element, html]);
    }
  });
  return { calls, controller, shortcutRoot };
}

test("ProjectLanguagePairShortcutsController preserves recent ordering, normalization, deduplication, and bounds", async () => {
  const { createProjectLanguagePairShortcutsController } = await moduleAt(
    "src/features/projects/project-language-pair-shortcuts-controller.js"
  );
  const projects = [
    { sourceLang: " EN ", targetLang: " TR ", updatedAt: "2026-01-02T00:00:00.000Z" },
    { sourceLang: "de", targetLang: "fr", updatedAt: "2026-01-05T00:00:00.000Z" },
    { sourceLang: "", targetLang: "tr", updatedAt: "2026-01-04T00:00:00.000Z" },
    { sourceLang: "en", targetLang: "tr", updatedAt: "2026-01-03T00:00:00.000Z" },
    { sourceLang: "ca", targetLang: "tr", updatedAt: "2026-01-01T00:00:00.000Z" },
    { sourceLang: "fr", targetLang: "de", updatedAt: "2025-12-31T00:00:00.000Z" }
  ];
  const { controller } = createHarness(createProjectLanguagePairShortcutsController, { projects });

  assert.deepEqual(controller.recent(), [
    ["de", "fr"],
    ["en", "tr"],
    ["ca", "tr"],
    ["fr", "de"]
  ]);
  assert.deepEqual(controller.recent(2), [
    ["de", "fr"],
    ["en", "tr"]
  ]);
  assert.equal(projects[0].updatedAt, "2026-01-02T00:00:00.000Z");
});

test("ProjectLanguagePairShortcutsController preserves recent-first defaults, six-pair bound, active state, and safe markup", async () => {
  const { createProjectLanguagePairShortcutsController } = await moduleAt(
    "src/features/projects/project-language-pair-shortcuts-controller.js"
  );
  const { calls, controller } = createHarness(createProjectLanguagePairShortcutsController, {
    projects: [
      { sourceLang: "fr", targetLang: "tr", updatedAt: "2026-01-04" },
      { sourceLang: "en", targetLang: "tr", updatedAt: "2026-01-03" },
      { sourceLang: "ca", targetLang: "tr", updatedAt: "2026-01-02" },
      { sourceLang: "it", targetLang: "tr", updatedAt: "2026-01-01" }
    ],
    current: { sourceLang: "en", targetLang: "tr" },
    defaultPairs: [
      ["en", "tr"],
      ["de", "tr"],
      ["es", "tr"],
      ["nl", "tr"]
    ]
  });

  assert.equal(controller.render(), undefined);

  const html = calls.find(([name]) => name === "replaceSafeHtml")[2];
  assert.equal((html.match(/<button/g) || []).length, 6);
  assert.match(html, /^<button[^>]+data-source-lang="escaped:fr"/);
  assert.equal((html.match(/class="active"/g) || []).length, 1);
  assert.match(
    html,
    /class="active" data-source-lang="escaped:en" data-target-lang="escaped:tr">escaped:pair:<en>-><tr><\/button>/
  );
  assert.doesNotMatch(html, /data-source-lang="escaped:nl"/);
});

test("ProjectLanguagePairShortcutsController preserves absent-root behavior without reading project or selection state", async () => {
  const { createProjectLanguagePairShortcutsController } = await moduleAt(
    "src/features/projects/project-language-pair-shortcuts-controller.js"
  );
  let projectReads = 0;
  let selectionReads = 0;
  const controller = createProjectLanguagePairShortcutsController({
    root: null,
    getProjects: () => {
      projectReads += 1;
      return [];
    },
    getCurrentValues: () => {
      selectionReads += 1;
      return {};
    },
    normalizeLanguage: String,
    defaultPairs: [],
    languagePairDisplay: () => "",
    escapeHtml: String,
    replaceSafeHtml: () => assert.fail("absent root must not render")
  });

  assert.equal(controller.render(), undefined);
  assert.equal(projectReads, 0);
  assert.equal(selectionReads, 0);
});

test("ProjectLanguagePairShortcutsController validates boundaries and exposes an immutable API", async () => {
  const { createProjectLanguagePairShortcutsController } = await moduleAt(
    "src/features/projects/project-language-pair-shortcuts-controller.js"
  );
  assert.throws(
    () => createProjectLanguagePairShortcutsController({}),
    /requires project, selection, language, default-pair, and safe-presentation boundaries/
  );
  const { controller } = createHarness(createProjectLanguagePairShortcutsController);
  assert.equal(Object.isFrozen(controller), true);
});
