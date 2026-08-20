const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/revision-history-presentation-service.js")).href);
}

function createHarness(createRevisionHistoryPresentationService, overrides = {}) {
  const calls = [];
  const classes = new Set(overrides.initialClasses || []);
  const list = overrides.withoutList
    ? null
    : {
        textContent: overrides.textContent || "initial",
        classList: {
          add(name) {
            calls.push(["classAdd", name]);
            if (overrides.classAddError) throw overrides.classAddError;
            classes.add(name);
          },
          remove(name) {
            calls.push(["classRemove", name]);
            if (overrides.classRemoveError) throw overrides.classRemoveError;
            classes.delete(name);
          }
        }
      };
  let safeHtml = null;
  const service = createRevisionHistoryPresentationService({
    list,
    getSegment() {
      calls.push(["getSegment"]);
      if (overrides.selectionError) throw overrides.selectionError;
      return Object.hasOwn(overrides, "segment") ? overrides.segment : { id: "s1", targetHistory: [] };
    },
    localization: {
      source(value) {
        calls.push(["source", value]);
        if (overrides.sourceError) throw overrides.sourceError;
        return `localized:${String(value)}`;
      },
      labelHtml(key) {
        calls.push(["labelHtml", key]);
        if (overrides.labelError) throw overrides.labelError;
        return `HTML:${key}`;
      }
    },
    statusLabel(value) {
      calls.push(["statusLabel", value]);
      if (overrides.statusError) throw overrides.statusError;
      return `status:${String(value)}`;
    },
    formatDateTime(value) {
      calls.push(["formatDateTime", value]);
      if (overrides.dateError) throw overrides.dateError;
      return `date:${String(value)}`;
    },
    escapeHtml(value) {
      calls.push(["escapeHtml", value]);
      if (overrides.escapeError) throw overrides.escapeError;
      return value === "" ? "" : `E[${String(value)}]`;
    },
    replaceSafeHtml(element, html) {
      calls.push(["replaceSafeHtml", element, html]);
      if (overrides.replaceError) throw overrides.replaceError;
      safeHtml = html;
      return overrides.replaceResult;
    }
  });
  return { calls, classes, list, service, getSafeHtml: () => safeHtml };
}

test("RevisionHistoryPresentationService preserves every reason label and fallback with one localization call", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const { calls, service } = createHarness(createRevisionHistoryPresentationService);
  const labels = {
    edit: "Edit",
    replace: "Replace",
    confirm: "Confirm",
    pretranslate: "Pretranslate",
    "insert-target": "Insert",
    "copy-source": "Copy source",
    "insert-tag": "Insert tag",
    "ai-suggestion": "AI suggestion",
    split: "Split",
    merge: "Merge"
  };

  for (const [reason, label] of Object.entries(labels)) {
    assert.equal(service.reasonLabel(reason), `localized:${label}`);
  }
  assert.equal(service.reasonLabel("custom"), "localized:custom");
  assert.equal(service.reasonLabel(""), "localized:Change");
  assert.equal(service.reasonLabel(null), "localized:Change");
  assert.deepEqual(
    calls.filter(([name]) => name === "source").map(([, value]) => value),
    [...Object.values(labels), "custom", "Change", "Change"]
  );
});

test("RevisionHistoryPresentationService preserves absent-list, missing-segment, and empty-history branches", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const absent = createHarness(createRevisionHistoryPresentationService, { withoutList: true });
  assert.equal(absent.service.render(), undefined);
  assert.deepEqual(absent.calls, []);

  const missing = createHarness(createRevisionHistoryPresentationService, { segment: null });
  assert.equal(missing.service.render(), undefined);
  assert.equal(missing.list.textContent, "localized:No active segment.");
  assert.equal(missing.classes.has("muted"), true);
  assert.deepEqual(missing.calls, [["getSegment"], ["source", "No active segment."], ["classAdd", "muted"]]);

  for (const segment of [{ id: "s1" }, { id: "s1", targetHistory: "legacy" }, { id: "s1", targetHistory: [] }]) {
    const empty = createHarness(createRevisionHistoryPresentationService, { segment });
    assert.equal(empty.service.render(), undefined);
    assert.equal(empty.list.textContent, "localized:No target revisions yet.");
    assert.equal(empty.classes.has("muted"), true);
    assert.equal(empty.getSafeHtml(), null);
  }
});

test("RevisionHistoryPresentationService preserves exact safe card markup and delegate inputs", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const entry = {
    reason: "copy-source",
    updatedAt: "updated",
    createdAt: "created",
    fromStatus: "",
    toStatus: "confirmed",
    fromTarget: "",
    toTarget: "<after>"
  };
  const harness = createHarness(createRevisionHistoryPresentationService, {
    initialClasses: ["muted"],
    segment: { id: "s1", targetHistory: [entry] },
    replaceResult: "ignored"
  });

  assert.equal(harness.service.render(), undefined);
  assert.equal(harness.classes.has("muted"), false);
  assert.equal(
    harness.getSafeHtml(),
    `
    <article class="revision-card">
      <header><strong>E[localized:Copy source]</strong><span>E[date:updated]</span></header>
      <div class="revision-status">E[status:empty] -> E[status:confirmed]</div>
      <div class="revision-pair">
        <div><span>HTML:before</span><p>&nbsp;</p></div>
        <div><span>HTML:after</span><p>E[<after>]</p></div>
      </div>
    </article>
  `
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => ["formatDateTime", "statusLabel", "labelHtml"].includes(name)),
    [
      ["formatDateTime", "updated"],
      ["statusLabel", "empty"],
      ["statusLabel", "confirmed"],
      ["labelHtml", "before"],
      ["labelHtml", "after"]
    ]
  );
});

test("RevisionHistoryPresentationService reverses a copied history and keeps only the newest eight cards", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const targetHistory = Array.from({ length: 10 }, (_, index) => ({
    reason: `reason-${index + 1}`,
    createdAt: `created-${index + 1}`,
    fromStatus: `from-${index + 1}`,
    toStatus: `to-${index + 1}`,
    fromTarget: `before-${index + 1}`,
    toTarget: `after-${index + 1}`
  }));
  const snapshot = structuredClone(targetHistory);
  const harness = createHarness(createRevisionHistoryPresentationService, {
    segment: { id: "s1", targetHistory }
  });

  harness.service.render();
  const html = harness.getSafeHtml();
  assert.equal((html.match(/class="revision-card"/g) || []).length, 8);
  assert.ok(html.indexOf("reason-10") < html.indexOf("reason-9"));
  assert.ok(html.indexOf("reason-3") > html.indexOf("reason-4"));
  assert.equal(html.includes("E[localized:reason-2]</strong>"), false);
  assert.equal(html.includes("E[localized:reason-1]</strong>"), false);
  assert.deepEqual(targetHistory, snapshot);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "formatDateTime").map(([, value]) => value),
    ["created-10", "created-9", "created-8", "created-7", "created-6", "created-5", "created-4", "created-3"]
  );
});

test("RevisionHistoryPresentationService validates boundaries and exposes an immutable API", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const valid = {
    list: null,
    getSegment: () => null,
    localization: { source: (value) => value, labelHtml: (value) => value },
    statusLabel: (value) => value,
    formatDateTime: (value) => String(value),
    escapeHtml: (value) => String(value),
    replaceSafeHtml: () => undefined
  };
  for (const key of ["getSegment", "localization", "statusLabel", "formatDateTime", "escapeHtml", "replaceSafeHtml"]) {
    const invalid = { ...valid };
    delete invalid[key];
    assert.throws(
      () => createRevisionHistoryPresentationService(invalid),
      /requires selection, localization, status, date, escaping, and safe-HTML boundaries/
    );
  }
  assert.throws(
    () => createRevisionHistoryPresentationService({ ...valid, list: { classList: {} } }),
    /checked optional history list/
  );
  assert.equal(Object.isFrozen(createHarness(createRevisionHistoryPresentationService).service), true);
});

test("RevisionHistoryPresentationService propagates selection, localization, presentation, and safe-HTML failures", async () => {
  const { createRevisionHistoryPresentationService } = await loadFactory();
  const selectionError = new Error("selection failed");
  assert.throws(
    () => createHarness(createRevisionHistoryPresentationService, { selectionError }).service.render(),
    selectionError
  );

  const sourceError = new Error("source failed");
  assert.throws(
    () => createHarness(createRevisionHistoryPresentationService, { sourceError }).service.reasonLabel("edit"),
    sourceError
  );

  const replaceError = new Error("safe replacement failed");
  const failingReplace = createHarness(createRevisionHistoryPresentationService, {
    segment: { targetHistory: [{ reason: "edit" }] },
    replaceError
  });
  assert.throws(() => failingReplace.service.render(), replaceError);
  assert.deepEqual(failingReplace.calls.at(-1).slice(0, 2), ["replaceSafeHtml", failingReplace.list]);
});
