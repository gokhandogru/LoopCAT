const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-openai-suggestion-controller.js")).href);
}

function createHarness(createAiOpenAiSuggestionController, overrides = {}) {
  const originalProject = {
    id: "p1",
    aiSettings: {
      enabled: true,
      provider: "OpenAI",
      model: "original-model",
      sendSourceToAi: true,
      useTmContext: true,
      useTermbaseContext: true,
      styleGuide: "Original style"
    }
  };
  let project = structuredClone(originalProject);
  let projects = [project, { id: "p2", aiSettings: {} }];
  const segment = {
    id: "s1",
    source: overrides.emptySource ? "" : "Source text",
    target: "Target text"
  };
  const calls = [];
  const statuses = [];
  let activeIndex = overrides.noSegment ? 5 : 0;
  let updateCount = 0;
  const globalForm = {
    enabled: overrides.enabled !== false,
    provider: overrides.provider || "OpenAI",
    model: overrides.model || "new-model",
    sendSourceToAi: overrides.sendSourceToAi !== false,
    useTmContext: overrides.useTmContext !== false,
    useTermbaseContext: overrides.useTermbaseContext !== false,
    styleGuide: overrides.styleGuide === undefined ? "New style" : overrides.styleGuide
  };
  const secrets = {
    openAiKey: overrides.typedKey === undefined ? "typed-key" : overrides.typedKey,
    rememberOpenAiKey: overrides.rememberOpenAiKey !== false
  };

  const controller = createAiOpenAiSuggestionController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getProjects: () => projects,
      getSegments: () => [segment],
      replaceProject: (value) => {
        calls.push(["replaceProject", value.aiSettings?.model]);
        project = value;
      },
      replaceProjects: (value) => {
        calls.push(["replaceProjects", value.map((item) => item.aiSettings?.model || "")]);
        projects = value;
      }
    },
    selection: { getActiveIndex: () => activeIndex },
    administration: {
      readGlobalForm: () => {
        calls.push(["readGlobalForm"]);
        return globalForm;
      },
      readSecrets: () => {
        calls.push(["readSecrets"]);
        return secrets;
      }
    },
    settings: {
      normalize: (value) => {
        calls.push(["normalize"]);
        return { ...value };
      }
    },
    provider: {
      isOpenAi: (value) => String(value.provider).toLowerCase() === "openai",
      appearsOffline: () => Boolean(overrides.offline),
      request: (request) => {
        calls.push([
          "request",
          request.segment.id,
          request.tmMatches.length,
          request.terms.length,
          request.project.aiSettings.model
        ]);
        return overrides.requestError
          ? Promise.reject(overrides.requestError)
          : Promise.resolve({ id: "suggestion-1", suggestedTarget: "Suggested target" });
      }
    },
    keys: {
      readStored: () => {
        calls.push(["readStored"]);
        return overrides.storedKey || "";
      },
      snapshot: () => {
        calls.push(["keySnapshot"]);
        return { local: "previous-key", session: null };
      },
      save: (value, remember) => {
        calls.push(["keySave", value, remember]);
        if (overrides.keySaveError) throw overrides.keySaveError;
      },
      restore: (snapshot) => calls.push(["keyRestore", snapshot.local])
    },
    consent: {
      externalShare: (details) => {
        calls.push(["consent", details]);
        return overrides.consent !== false;
      }
    },
    persistence: {
      updateProject: (value) => {
        updateCount += 1;
        calls.push(["updateProject", updateCount, value.aiSettings?.model]);
        if (updateCount === 1 && overrides.updateError) return Promise.reject(overrides.updateError);
        if (updateCount > 1 && overrides.rollbackError) return Promise.reject(overrides.rollbackError);
        return Promise.resolve(structuredClone(value));
      }
    },
    context: {
      forSegment: (value, aiSettings) => {
        calls.push(["context", value.id, aiSettings.model]);
        return Promise.resolve([[{ id: "tm-1" }], [{ id: "term-1" }]]);
      }
    },
    suggestions: {
      append: (value, suggestion) => {
        calls.push(["append", value.id, suggestion.id]);
        return Promise.resolve(
          overrides.appendResult === undefined ? { ok: true, activityLogged: true } : overrides.appendResult
        );
      }
    },
    presentation: { renderEditor: () => calls.push(["renderEditor"]) },
    workspace: {
      markDirty: () => calls.push(["markDirty"]),
      markRollbackDirty: (projectId) => calls.push(["markRollbackDirty", projectId])
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    defaults: { model: "default-model" },
    testHooks: {
      beforeProjectSave: () => {
        calls.push(["beforeProjectSave"]);
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      }
    },
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });

  return {
    calls,
    controller,
    originalProject,
    project: () => project,
    projects: () => projects,
    setActiveIndex: (value) => {
      activeIndex = value;
    },
    statuses
  };
}

test("direct OpenAI suggestion preserves project, segment, enabled, sharing, provider, source, offline, and key safeguards", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const cases = [
    [{ noProject: true }, null],
    [{ noSegment: true }, null],
    [{ enabled: false }, "Enable AI helpers"],
    [{ sendSourceToAi: false }, "source sharing"],
    [{ provider: "Anthropic" }, "Choose OpenAI"],
    [{ emptySource: true }, "no source text"],
    [{ offline: true, typedKey: "", storedKey: "" }, "appears to be offline"],
    [{ typedKey: "", storedKey: "" }, "Add your OpenAI API key"]
  ];
  for (const [options, expected] of cases) {
    const harness = createHarness(createAiOpenAiSuggestionController, options);
    assert.equal(await harness.controller.create(), undefined);
    if (expected) assert.match(harness.statuses.at(-1)[0], new RegExp(expected));
    else assert.equal(harness.statuses.length, 0);
    assert.equal(
      harness.calls.some(([name]) => name === "updateProject"),
      false
    );
    assert.equal(
      harness.calls.some(([name]) => name === "keySave"),
      false
    );
    assert.equal(
      harness.calls.some(([name]) => name === "request"),
      false
    );
  }
});

test("direct OpenAI suggestion discloses optional local context and cancels before setup", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, { consent: false });

  await harness.controller.create();

  const consent = harness.calls.find(([name]) => name === "consent")[1];
  assert.deepEqual(consent, {
    provider: "OpenAI",
    includesSourceText: true,
    contextLabels: ["local TM matches", "local termbase hits", "style instructions"]
  });
  assert.deepEqual(harness.statuses.at(-1), ["OpenAI suggestion canceled", "dirty"]);
  assert.equal(
    harness.calls.some(([name]) => name === "keySnapshot"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "updateProject"),
    false
  );
});

test("direct OpenAI suggestion persists settings and key before routing context, provider, and suggestion storage", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController);

  await harness.controller.create();

  assert.equal(harness.project().aiSettings.model, "new-model");
  assert.equal(harness.projects()[0].aiSettings.model, "new-model");
  assert.ok(harness.calls.some(([name, value, remember]) => name === "keySave" && value === "typed-key" && remember));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.deepEqual(
    harness.calls.filter(([name]) => ["context", "request", "append"].includes(name)).map(([name]) => name),
    ["context", "request", "append"]
  );
  assert.deepEqual(harness.statuses.at(-1), ["OpenAI suggestion ready for review", "saved"]);
});

test("direct OpenAI suggestion setup failure restores exact project, list, and key snapshots", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, {
    beforeSaveError: new Error("settings unavailable")
  });

  await harness.controller.create();

  assert.deepEqual(harness.project(), harness.originalProject);
  assert.equal(harness.projects()[0].aiSettings.model, "original-model");
  assert.ok(harness.calls.some(([name]) => name === "keyRestore"));
  assert.ok(harness.calls.some(([name]) => name === "renderEditor"));
  assert.deepEqual(harness.statuses.at(-1), ["settings unavailable", "dirty"]);
  assert.equal(
    harness.calls.some(([name]) => name === "request"),
    false
  );
});

test("direct OpenAI suggestion key failure rolls persisted settings back before restoring the key", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, {
    keySaveError: new Error("key storage unavailable")
  });

  await harness.controller.create();

  assert.equal(harness.calls.filter(([name]) => name === "updateProject").length, 2);
  assert.deepEqual(harness.project(), harness.originalProject);
  assert.equal(harness.projects()[0].aiSettings.model, "original-model");
  assert.ok(harness.calls.some(([name]) => name === "keyRestore"));
  assert.deepEqual(harness.statuses.at(-1), ["key storage unavailable", "dirty"]);
});

test("direct OpenAI suggestion rollback failure restores memory and marks the original project dirty", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, {
    keySaveError: new Error("key storage unavailable"),
    rollbackError: new Error("rollback storage unavailable")
  });

  await harness.controller.create();

  assert.deepEqual(harness.project(), harness.originalProject);
  assert.equal(harness.projects()[0].aiSettings.model, "original-model");
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name, projectId]) => name === "markRollbackDirty" && projectId === "p1"));
});

test("direct OpenAI provider failure keeps saved settings and key without appending a suggestion", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, {
    requestError: new Error("provider could not connect")
  });

  await harness.controller.create();

  assert.equal(harness.project().aiSettings.model, "new-model");
  assert.ok(harness.calls.some(([name]) => name === "keySave"));
  assert.equal(
    harness.calls.some(([name]) => name === "append"),
    false
  );
  assert.deepEqual(harness.statuses.at(-1), ["provider could not connect", "dirty"]);
});

test("direct OpenAI suggestion preserves the shared storage activity-warning result", async () => {
  const { createAiOpenAiSuggestionController } = await loadFactory();
  const harness = createHarness(createAiOpenAiSuggestionController, {
    appendResult: { ok: true, activityLogged: false }
  });

  await harness.controller.create();

  assert.deepEqual(harness.statuses.at(-1), ["OpenAI suggestion ready for review; activity log failed", "dirty"]);
});
