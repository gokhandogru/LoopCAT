const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");

function loadTbx() {
  let sequence = 0;
  const context = {
    window: {
      CatHan: {
        storage: {
          makeId(prefix) {
            sequence += 1;
            return `${prefix}-${sequence}`;
          }
        }
      }
    },
    setTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "tbx.js"), "utf8"), context, { filename: "tbx.js" });
  return context.window.CatHan.tbx;
}

test("TBX round-trip preserves LoopCAT concept, designation, and matching metadata", () => {
  const tbx = loadTbx();
  const xml = tbx.buildTbx(
    [
      {
        id: "term-1",
        conceptId: "concept-1",
        sourceDesignationId: "designation-source-1",
        targetDesignationId: "designation-target-1",
        sourceTerm: "colour",
        targetTerm: "renk",
        sourceLang: "en-GB",
        targetLang: "tr-TR",
        status: "admitted",
        caseSensitivity: "initial-sensitive",
        matchMode: "fuzzy",
        fuzzyThreshold: 91,
        definition: "Visual characteristic",
        subject: "Design",
        domain: "Branding",
        partOfSpeech: "noun",
        usageExample: "Use a vivid colour."
      }
    ],
    { sourceLang: "en-GB", targetLang: "tr-TR" }
  );

  const [term] = tbx.parseTbx(xml, {
    sourceLang: "en-GB",
    targetLang: "tr-TR",
    termBaseName: "Brand terms"
  });

  assert.equal(term.conceptId, "concept-1");
  assert.equal(term.sourceDesignationId, "designation-source-1");
  assert.equal(term.targetDesignationId, "designation-target-1");
  assert.equal(term.status, "admitted");
  assert.equal(term.caseSensitivity, "initial-sensitive");
  assert.equal(term.matchMode, "fuzzy");
  assert.equal(term.fuzzyThreshold, 91);
  assert.equal(term.definition, "Visual characteristic");
  assert.equal(term.subject, "Design");
  assert.equal(term.domain, "Branding");
  assert.equal(term.partOfSpeech, "noun");
  assert.equal(term.usageExample, "Use a vivid colour.");
});
