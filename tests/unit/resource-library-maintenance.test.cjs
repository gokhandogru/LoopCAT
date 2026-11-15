const test = require("node:test");
const assert = require("node:assert/strict");

test("library filters combine languages, linked project, search and archive state before sorting", async () => {
  const { filterResourceLibrary } = await import("../../src/features/resources/resource-library-controller.js");
  const rows = [
    { id: "a", name: "Medical TM", sourceLang: "en", targetLang: "tr", entryCount: 2, linkedProjects: [{ id: "p" }] },
    {
      id: "b",
      name: "Medical archive",
      sourceLang: "en",
      targetLang: "tr",
      archived: true,
      entryCount: 5,
      linkedProjects: [{ id: "p" }]
    },
    {
      id: "c",
      name: "Medical multilingual",
      sourceLang: "en",
      targetLang: "de",
      languages: ["en", "tr", "de"],
      entryCount: 10,
      linkedProjects: [{ id: "p" }]
    },
    {
      id: "d",
      name: "Medical other",
      sourceLang: "en",
      targetLang: "tr",
      entryCount: 100,
      linkedProjects: [{ id: "other" }]
    }
  ];
  const state = {
    search: "medical",
    language: "tr",
    project: "p",
    archive: "active",
    sort: "entryCount",
    direction: "desc"
  };
  assert.deepEqual(
    filterResourceLibrary(rows, state).map((row) => row.id),
    ["c", "a"]
  );
  assert.deepEqual(
    filterResourceLibrary(rows, { ...state, archive: "archived" }).map((row) => row.id),
    ["b"]
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b", "c", "d"]
  );
});

test("replacement previews leave protected tags and placeholders unchanged", async () => {
  const { planResourceChanges } = await import("../../src/features/resources/resource-maintenance.js");
  const before = { id: "a", source: '<span class="friend">friend</span> {0} {{friend}}', target: "friend" };
  const result = planResourceChanges([before], {
    type: "tm",
    action: "replace",
    field: "both",
    find: "friend",
    replacement: "colleague"
  });
  assert.equal(result[0].after.source, '<span class="friend">colleague</span> {0} {{friend}}');
  assert.equal(result[0].after.target, "colleague");
  assert.equal(before.target, "friend");
  assert.equal(
    planResourceChanges([before], { type: "tm", action: "replace", find: "absent", replacement: "x" }).length,
    0
  );
});

test("status previews carry forbidden semantics and deletion previews retain the reviewed record", async () => {
  const { planResourceChanges } = await import("../../src/features/resources/resource-maintenance.js");
  const before = { id: "a", sourceTerm: "word", targetTerm: "söz", status: "preferred", isForbidden: false };
  const preview = planResourceChanges([before], { type: "tb", action: "status", status: "forbidden" });
  assert.equal(preview[0].after.status, "forbidden");
  assert.equal(preview[0].after.isForbidden, true);
  assert.equal(before.status, "preferred");
  assert.deepEqual(planResourceChanges([before], { type: "tb", action: "delete" }), [{ before, delete: true }]);
});

test("duplicate cleanup requires selected keepers and preserves separate concepts and unreviewed groups", async () => {
  const { planDuplicateRemoval } = await import("../../src/features/resources/resource-maintenance.js");
  const base = { sourceTerm: "bank", targetTerm: "banka", sourceLang: "en", targetLang: "tr", conceptId: "finance" };
  const rows = [
    { ...base, id: "keep" },
    { ...base, id: "redundant" },
    { ...base, id: "other-concept", conceptId: "distinct" },
    { ...base, id: "alternative", targetTerm: "kıyı", conceptId: "river" }
  ];
  const review = planDuplicateRemoval(rows, new Set(["keep"]), { type: "tb", mode: "exact" });
  assert.deepEqual(
    review.keep.map((row) => row.id),
    ["keep"]
  );
  assert.deepEqual(
    review.remove.map((row) => row.id),
    ["redundant"]
  );
  assert.equal(planDuplicateRemoval(rows, new Set(), { type: "tb", mode: "alternatives" }).remove.length, 0);
  assert.equal(
    planDuplicateRemoval(rows, new Set(rows.map((row) => row.id)), { type: "tb", mode: "exact" }).remove.length,
    0
  );
});
