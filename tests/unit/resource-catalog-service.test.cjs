const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("ResourceCatalogService preserves delimiter-safe keys, language-pair derivation, and descriptor fallbacks", async () => {
  const { createResourceCatalogService } = await moduleAt("src/features/resources/resource-catalog-service.js");
  const service = createResourceCatalogService({ getState: () => null });

  const delimitedKey = service.key({ tmName: "Legal::Reviewed", sourceLang: "en-US", targetLang: "tr-TR" }, "tmName");
  assert.equal(delimitedKey, "Legal::Reviewed::en-US::tr-TR");
  assert.deepEqual(service.labelFromKey(delimitedKey), {
    name: "Legal::Reviewed",
    sourceLang: "en-US",
    targetLang: "tr-TR",
    languagePair: "en-US::tr-TR"
  });
  assert.equal(
    service.key({ termBaseName: "Terms", languagePair: "ca-ES::tr-TR", sourceLang: "ignored" }, "termBaseName"),
    "Terms::ca-ES::tr-TR"
  );
  assert.equal(service.key({}, "tmName"), "Unnamed resource::::");
  assert.deepEqual(service.labelFromKey(""), {
    name: "Unnamed resource",
    sourceLang: "",
    targetLang: "",
    languagePair: "::"
  });
});

test("ResourceCatalogService preserves grouping, counts, latest updates, and deterministic catalog ordering", async () => {
  const { createResourceCatalogService } = await moduleAt("src/features/resources/resource-catalog-service.js");
  const service = createResourceCatalogService({ getState: () => null });
  const records = [
    {
      id: "z-1",
      tmName: "Zulu",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "a-tr",
      tmName: "Alpha",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      updatedAt: "2026-02-01T00:00:00.000Z"
    },
    {
      id: "a-ca",
      tmName: "Alpha",
      sourceLang: "en",
      targetLang: "ca",
      languagePair: "en::ca",
      updatedAt: "2026-03-01T00:00:00.000Z"
    },
    {
      id: "a-tr-latest",
      tmName: "Alpha",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      updatedAt: "2026-04-01T00:00:00.000Z"
    }
  ];

  const summaries = service.summarize(records, "tmName");

  assert.deepEqual(
    summaries.map(({ name, languagePair, count, updatedAt }) => ({ name, languagePair, count, updatedAt })),
    [
      {
        name: "Alpha",
        languagePair: "en::ca",
        count: 1,
        updatedAt: "2026-03-01T00:00:00.000Z"
      },
      {
        name: "Alpha",
        languagePair: "en::tr",
        count: 2,
        updatedAt: "2026-04-01T00:00:00.000Z"
      },
      {
        name: "Zulu",
        languagePair: "en::tr",
        count: 1,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  );
  assert.equal(records[1].updatedAt, "2026-02-01T00:00:00.000Z");
});

test("ResourceCatalogService preserves TM and termbase matching, selected fallbacks, deduplication, and name order", async () => {
  const { createResourceCatalogService } = await moduleAt("src/features/resources/resource-catalog-service.js");
  const state = {
    tmEntries: [
      { id: "tm-tr", tmName: "Beta", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" },
      { id: "tm-ca", tmName: "Catalan", sourceLang: "en", targetLang: "ca", languagePair: "en::ca" }
    ],
    terms: [{ id: "tb-tr", termBaseName: "Terms", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" }]
  };
  const service = createResourceCatalogService({ getState: () => state });

  assert.deepEqual(
    service
      .matching("tm", "en", "tr", ["Selected only", "Beta", "Alpha"])
      .map((item) => [item.name, item.count, item.key]),
    [
      ["Alpha", 0, "Alpha::en::tr"],
      ["Beta", 1, "Beta::en::tr"],
      ["Selected only", 0, "Selected only::en::tr"]
    ]
  );
  assert.deepEqual(
    service.matching("tb", "en", "tr").map((item) => item.name),
    ["Terms"]
  );
  assert.deepEqual(
    service.matching("tb", "en", "ca").map((item) => item.name),
    []
  );
});

test("ResourceCatalogService uses an empty state fallback and exposes an immutable checked API", async () => {
  const { createResourceCatalogService } = await moduleAt("src/features/resources/resource-catalog-service.js");
  assert.throws(() => createResourceCatalogService(), /requires a resource-state boundary/);
  const service = createResourceCatalogService({ getState: () => undefined });

  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(service.matching("tm", "en", "tr", ["Linked"]), [
    {
      key: "Linked::en::tr",
      name: "Linked",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      count: 0,
      updatedAt: ""
    }
  ]);
});
