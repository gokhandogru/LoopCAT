const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");

function loadWorker(setup = "") {
  let listener;
  const messages = [];
  const context = {
    self: {
      addEventListener(type, callback) {
        if (type === "message") listener = callback;
      },
      postMessage(message) {
        messages.push(message);
      }
    }
  };
  vm.runInNewContext(setup + fs.readFileSync(path.join(root, "cat-worker.js"), "utf8"), context, {
    filename: "cat-worker.js"
  });
  return {
    request(data) {
      listener({ data });
      return messages.at(-1);
    }
  };
}

test("CAT worker applies concept alternatives, forbidden status, prefix, and fuzzy terminology", () => {
  const worker = loadWorker();
  const base = {
    conceptId: "concept-1",
    resourceId: "tb-1",
    sourceTerm: "automobile",
    caseSensitivity: "insensitive"
  };
  const accepted = worker.request({
    id: "qa-1",
    type: "qa",
    payload: {
      segments: [{ id: "segment-1", source: "The automobile arrived", target: "Araç geldi" }],
      terms: [
        { ...base, targetTerm: "otomobil", status: "preferred", matchMode: "exact" },
        { ...base, targetTerm: "araç", status: "admitted", matchMode: "exact" }
      ]
    }
  });
  assert.equal(accepted.ok, true);
  assert.equal(
    accepted.result.some((issue) => issue.type === "term"),
    false
  );

  const forbidden = worker.request({
    id: "qa-2",
    type: "qa",
    payload: {
      segments: [{ id: "segment-2", source: "The automobile arrived", target: "Araba geldi" }],
      terms: [
        { ...base, targetTerm: "otomobil", status: "preferred", matchMode: "exact" },
        { ...base, targetTerm: "araba", status: "forbidden", matchMode: "exact" }
      ]
    }
  });
  assert.equal(
    forbidden.result.some((issue) => issue.type === "forbidden-term"),
    true
  );

  for (const [matchMode, source, sourceTerm] of [
    ["prefix", "Automobiles arrived", "automobile"],
    ["fuzzy", "The automoblie arrived", "automobile"]
  ]) {
    const response = worker.request({
      id: `qa-${matchMode}`,
      type: "qa",
      payload: {
        segments: [{ id: `segment-${matchMode}`, source, target: "Otomobil geldi" }],
        terms: [
          {
            ...base,
            sourceTerm,
            targetTerm: "otomobil",
            status: "preferred",
            matchMode,
            fuzzyThreshold: 85
          }
        ]
      }
    });
    assert.equal(
      response.result.some((issue) => issue.type === "term"),
      false
    );
  }
});

test("CAT worker initial-sensitive terminology never depends on the UI locale", () => {
  const worker = loadWorker('String.prototype.toLocaleLowerCase = () => { throw new Error("UI locale used"); };\n');
  for (const [target, missing] of [
    ["LATIN", false],
    ["latin", true]
  ]) {
    const response = worker.request({
      id: `initial-${target}`,
      type: "qa",
      payload: {
        segments: [{ id: "segment-1", source: "Loan", target }],
        terms: [{ sourceTerm: "Loan", targetTerm: "Latin", status: "preferred", caseSensitivity: "initial-sensitive" }]
      }
    });
    assert.equal(response.ok, true);
    assert.equal(
      response.result.some((issue) => issue.type === "term"),
      missing
    );
  }
});

test("CAT worker treats an explicit empty lookup plan as no TM access", () => {
  const worker = loadWorker();
  const response = worker.request({
    id: "tm-1",
    type: "tm-match",
    payload: {
      entries: [
        {
          id: "entry-1",
          resourceId: "resource-1",
          tmName: "Hidden TM",
          sourceLang: "en",
          targetLang: "tr",
          languagePair: "en::tr",
          source: "Hello",
          target: "Merhaba"
        }
      ],
      options: {
        source: "Hello",
        sourceLang: "en",
        targetLang: "tr",
        resourceLinks: []
      }
    }
  });
  assert.equal(response.ok, true);
  assert.deepEqual(Array.from(response.result), []);
});

test("CAT worker gives useful fuzzy leverage to a close single-token typo", () => {
  const worker = loadWorker();
  const response = worker.request({
    id: "tm-fuzzy",
    type: "tm-match",
    payload: {
      entries: [
        {
          id: "entry-1",
          resourceId: "resource-1",
          tmName: "Main TM",
          sourceLang: "en",
          targetLang: "tr",
          languagePair: "en::tr",
          source: "automobile",
          target: "otomobil"
        }
      ],
      options: {
        source: "automoblie",
        sourceLang: "en",
        targetLang: "tr",
        resourceLinks: [{ resourceId: "resource-1", type: "tm", role: "main", lookup: true, priority: 0, penalty: 0 }]
      }
    }
  });
  assert.equal(response.result[0].matchKind, "fuzzy");
  assert.ok(response.result[0].effectiveScore >= 70);
});
