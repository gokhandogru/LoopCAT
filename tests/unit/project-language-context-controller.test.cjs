const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProjectLanguageContextController, overrides = {}) {
  const calls = [];
  let project = overrides.project === undefined ? { sourceLang: " EN ", targetLang: " TR " } : overrides.project;
  let desktop =
    overrides.desktop === undefined
      ? {
          setSpellCheckerLanguages(languages) {
            calls.push(["setSpellCheckerLanguages", languages]);
            return { ok: true, languages };
          }
        }
      : overrides.desktop;
  const controller = createProjectLanguageContextController({
    getProject: () => project,
    languageInput: {
      normalizeInput(value) {
        calls.push(["normalizeInput", value]);
        return String(value || "")
          .trim()
          .toLowerCase();
      },
      pairDisplay(source, target) {
        calls.push(["pairDisplay", source, target]);
        return `pair:<${source}>-><${target}>`;
      }
    },
    getDesktop: () => desktop,
    warn(...args) {
      calls.push(["warn", ...args]);
    }
  });
  return {
    calls,
    controller,
    setDesktop(value) {
      desktop = value;
    },
    setProject(value) {
      project = value;
    }
  };
}

test("ProjectLanguageContextController preserves current and explicit pair display, keys, targets, and empty fallbacks", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  const { controller } = createHarness(createProjectLanguageContextController);

  assert.equal(controller.display(), "pair:< EN >->< TR >");
  assert.equal(controller.display({ sourceLang: "ca", targetLang: "tr" }), "pair:<ca>-><tr>");
  assert.equal(controller.display(null), "");
  assert.equal(controller.key(), "en::tr");
  assert.equal(controller.key({ sourceLang: "", targetLang: "tr" }), "::tr");
  assert.equal(controller.key(null), "");
  assert.equal(controller.target(), "tr");
  assert.equal(controller.target({ targetLang: " CA " }), "ca");
  assert.equal(controller.target(null), "");
});

test("ProjectLanguageContextController preserves desktop language arrays and duplicate suppression", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  const { calls, controller, setProject } = createHarness(createProjectLanguageContextController);

  assert.deepEqual(await controller.syncDesktopSpellcheck(), { ok: true, languages: ["tr"] });
  assert.equal(await controller.syncDesktopSpellcheck(), null);
  assert.equal(calls.filter(([name]) => name === "setSpellCheckerLanguages").length, 1);

  setProject({ sourceLang: "en", targetLang: "" });
  assert.deepEqual(await controller.syncDesktopSpellcheck(), { ok: true, languages: [] });
  assert.deepEqual(
    calls.filter(([name]) => name === "setSpellCheckerLanguages").map((entry) => entry[1]),
    [["tr"], []]
  );
});

test("ProjectLanguageContextController caches before bridge availability and does not replay an unchanged target", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  const { calls, controller, setDesktop, setProject } = createHarness(createProjectLanguageContextController, {
    desktop: null
  });

  assert.equal(await controller.syncDesktopSpellcheck(), null);
  setDesktop({
    setSpellCheckerLanguages(languages) {
      calls.push(["lateSetSpellCheckerLanguages", languages]);
      return languages;
    }
  });
  assert.equal(await controller.syncDesktopSpellcheck(), null);
  assert.equal(
    calls.some(([name]) => name === "lateSetSpellCheckerLanguages"),
    false
  );

  setProject({ sourceLang: "en", targetLang: "ca" });
  assert.deepEqual(await controller.syncDesktopSpellcheck(), ["ca"]);
  assert.deepEqual(calls.find(([name]) => name === "lateSetSpellCheckerLanguages")[1], ["ca"]);
});

test("ProjectLanguageContextController contains desktop rejection, warns exactly once, and preserves the cached target", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  const failure = new Error("bridge failed");
  const { calls, controller } = createHarness(createProjectLanguageContextController, {
    desktop: {
      setSpellCheckerLanguages() {
        calls.push(["rejectingDesktop"]);
        throw failure;
      }
    }
  });

  assert.equal(await controller.syncDesktopSpellcheck(), null);
  assert.equal(await controller.syncDesktopSpellcheck(), null);
  assert.equal(calls.filter(([name]) => name === "rejectingDesktop").length, 1);
  assert.deepEqual(
    calls.find(([name]) => name === "warn"),
    ["warn", "Desktop spellcheck language sync failed.", failure]
  );
});

test("ProjectLanguageContextController preserves target element lang assignment, removal, and absent-element behavior", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  const { controller, setProject } = createHarness(createProjectLanguageContextController);
  const removed = [];
  const element = {
    lang: "",
    removeAttribute(name) {
      removed.push(name);
      this.lang = "";
    }
  };

  assert.equal(controller.applyTargetLanguage(element), undefined);
  assert.equal(element.lang, "tr");
  assert.deepEqual(removed, []);
  setProject({ sourceLang: "en", targetLang: "" });
  assert.equal(controller.applyTargetLanguage(element), undefined);
  assert.deepEqual(removed, ["lang"]);
  assert.equal(controller.applyTargetLanguage(null), undefined);
});

test("ProjectLanguageContextController validates boundaries and exposes an immutable API", async () => {
  const { createProjectLanguageContextController } = await moduleAt(
    "src/features/projects/project-language-context-controller.js"
  );
  assert.throws(
    () => createProjectLanguageContextController({}),
    /requires project, language-input, desktop, and warning boundaries/
  );
  const { controller } = createHarness(createProjectLanguageContextController);
  assert.equal(Object.isFrozen(controller), true);
});
