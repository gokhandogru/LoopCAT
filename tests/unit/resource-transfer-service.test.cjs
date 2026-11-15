const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const load = () => import(pathToFileURL(path.join(root, "src/features/resources/resource-transfer-service.js")).href);

async function harness(existing = []) {
  const { createResourceTransferService } = await load();
  let counter = 0;
  const stored = new Map(existing.map((entry) => [entry.id, entry]));
  const resources = new Map([
    ["tb-existing", { id: "tb-existing", type: "termbase", name: "Terms", sourceLang: "en", targetLang: "tr" }]
  ]);
  const storage = {
    makeId: (prefix) => `${prefix}-${++counter}`,
    getAll: (store) => Promise.resolve(store === "resources" ? [...resources.values()] : [...stored.values()]),
    get: (store, id) => Promise.resolve(store === "resources" ? resources.get(id) : stored.get(id)),
    getAllByIndex: (_store, _index, id) =>
      Promise.resolve([...stored.values()].filter((entry) => entry.resourceId === id))
  };
  const writes = [];
  const save = (entries) => {
    writes.push(entries);
    for (const entry of entries) stored.set(entry.id, entry);
    return Promise.resolve(entries.length);
  };
  const tm = { normalizeText: (text) => String(text).toLowerCase().replace(/\s+/g, " ").trim(), importTmEntries: save };
  const context = { window: { CatHan: { storage, tm } }, TextDecoder, setTimeout };
  for (const name of ["tmx.js", "tbx.js", "termbase.js"])
    vm.runInNewContext(fs.readFileSync(path.join(root, name), "utf8"), context, { filename: name });
  const termbase = { ...context.window.CatHan.termbase, importTerms: save };
  const project = {
    createResource: (input) => {
      const resource = { ...input, id: storage.makeId("resource") };
      resources.set(resource.id, resource);
      return Promise.resolve(resource);
    }
  };
  const service = createResourceTransferService({
    storage,
    tm,
    termbase,
    tmx: context.window.CatHan.tmx,
    tbx: context.window.CatHan.tbx,
    project
  });
  return { service, stored, resources, writes, storage };
}
const file = (name, text) => {
  const result = new Blob([text]);
  Object.defineProperty(result, "name", { value: name });
  return result;
};

function dialogDocument() {
  const document = {
    defaultView: { navigator: { language: "en-US" } },
    getElementById: () => null,
    createElement(tag) {
      const handlers = new Map();
      const node = {
        tag,
        children: [],
        attributes: new Map(),
        value: "",
        isConnected: true,
        classList: { toggle() {} },
        setAttribute(key, value) {
          this.attributes.set(key, value);
        },
        append(...children) {
          this.children.push(...children);
        },
        prepend(...children) {
          this.children.unshift(...children);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        addEventListener(event, handler) {
          handlers.set(event, [...(handlers.get(event) || []), handler]);
        },
        async dispatch(event) {
          await Promise.all((handlers.get(event) || []).map((handler) => handler({ target: node })));
        },
        showModal() {},
        close() {
          this.isConnected = false;
        },
        remove() {
          this.isConnected = false;
        },
        querySelectorAll(selector) {
          return descend(this).filter((item) => selector.split(",").includes(item.tag));
        },
        get textContent() {
          return this.children.map((child) => child?.textContent ?? String(child)).join("");
        },
        set textContent(value) {
          this.children = [String(value)];
        }
      };
      return node;
    }
  };
  document.body = document.createElement("body");
  return document;
}
function descend(node) {
  return [node, ...(node.children || []).flatMap((child) => (typeof child === "object" ? descend(child) : []))];
}

test("resource import dialog normalizes friendly language choices before preview and commit, and surfaces partial errors", async () => {
  const { createResourceUi } = await import("../../src/features/resources/resource-ui.js");
  const { openResourceImportDialog } = await import("../../src/features/resources/resource-import-dialog.js");
  const { service, resources, writes, storage } = await harness();
  const document = dialogDocument();
  const ui = createResourceUi(document, {
    source: (text) => (text === "Save" ? "Desa" : text),
    getLocale: () => "en-US"
  });
  assert.equal(
    ui.select("Destination", [["a", "Save"]], "a", { literalChoices: true }).children[0].textContent,
    "Save"
  );
  const transfer = {
    ...service,
    async commitImport(...args) {
      const result = await service.commitImport(...args);
      return { ...result, errors: ["Storage capacity exceeded."] };
    }
  };
  const view = await openResourceImportDialog({ ui, transfer, storage, type: "tb" });
  const all = () => descend(view);
  const field = (label) =>
    all().find((item) => item.tag === "label" && item.children[0].textContent === label).children[1];
  field("Resource name").value = "Friendly labels";
  field("Source language").value = "English (en)";
  field("Target language").value = "Türkçe (tr)";
  field("File").files = [file("terms.csv", "source,target\nhello,merhaba")];
  await all()
    .find((item) => item.tag === "button" && item.textContent === "Review import")
    .dispatch("click");
  const apply = all().find((item) => item.tag === "button" && item.textContent === "Import reviewed entries");
  assert.equal(Boolean(apply.disabled), false);
  await apply.dispatch("click");
  const resource = [...resources.values()].find((item) => item.name === "Friendly labels");
  assert.equal(resource.sourceLang, "en");
  assert.equal(resource.targetLang, "tr");
  assert.equal(writes[0][0].sourceLang, "en");
  assert.equal(writes[0][0].targetLang, "tr");
  const status = all().find((item) => item.attributes?.get("role") === "alert");
  assert.match(status.textContent, /Import stopped/);
  assert.match(status.textContent, /Storage capacity exceeded/);
});

test("term-list preview maps real columns, preserves quoted content/metadata, reports invalid rows, and skips exact duplicates", async () => {
  const existing = {
    id: "old",
    resourceId: "tb-existing",
    sourceTerm: "friend",
    targetTerm: "arkadaş",
    sourceLang: "en",
    targetLang: "tr",
    notes: ""
  };
  const { service, writes } = await harness([existing]);
  const preview = await service.prepareImport(
    file(
      "terms.csv",
      'Translation,Original,Notes,Status,Definition,Domain\narkadaş,friend,,,,\ndost,friend,"a, b",admitted,Companion,social\n,missing,,,,\nmerhaba,hello,"two\nlines",preferred,,social'
    ),
    { type: "tb", resourceId: "tb-existing", mapping: { source: 1, target: 0, notes: 2, status: 3, hasHeader: true } }
  );
  assert.equal(preview.columns[0].label, "Translation");
  assert.equal(preview.total, 4);
  assert.equal(preview.valid, 3);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.duplicates.exact, 1);
  assert.equal(preview.rows[1].status, "admitted");
  assert.equal(preview.rows[1].definition, "Companion");
  assert.equal(preview.rows[2].notes, "two\nlines");
  const result = await service.commitImport(preview);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1);
  assert.equal(
    writes.flat().some((entry) => entry.id === "old"),
    false
  );
  await assert.rejects(service.commitImport(preview), /new import preview/);
});

test("TMX import detects languages, retains markup as text, and preserves normalized case variants", async () => {
  const { service, writes } = await harness();
  const xml =
    '<tmx version="1.4"><header srclang="en"/><body><tu><tuv xml:lang="en"><seg>&lt;b&gt;Hello&lt;/b&gt;</seg></tuv><tuv xml:lang="tr"><seg>&lt;b&gt;Merhaba&lt;/b&gt;</seg></tuv></tu><tu><tuv xml:lang="en"><seg>&lt;b&gt;HELLO&lt;/b&gt;</seg></tuv><tuv xml:lang="tr"><seg>&lt;b&gt;MERHABA&lt;/b&gt;</seg></tuv></tu></body></tmx>';
  const preview = await service.prepareImport(file("memory.tmx", xml), { type: "tm" });
  assert.equal(preview.sourceLang, "en");
  assert.equal(preview.targetLang, "tr");
  assert.equal(preview.rows[0].source, "<b>Hello</b>");
  const result = await service.commitImport(preview);
  assert.equal(result.imported, 2);
  assert.equal(writes.length, 2);
  const exported = service.exportEntries("tm", result.resource, writes.flat());
  assert.ok(exported.content.includes("&lt;b&gt;Hello&lt;/b&gt;"));
  assert.ok(exported.filename.endsWith(".tmx"));
});

test("TBX import remaps identities and preserves rich term metadata on export", async () => {
  const { service, writes } = await harness();
  const xml =
    '<tbx><text><body><termEntry id="external"><langSet xml:lang="en"><tig><term>colour</term></tig></langSet><langSet xml:lang="tr"><tig><term>renk</term></tig></langSet><descrip type="x-loopcat-conceptId">old-concept</descrip><descrip type="termStatus">admitted</descrip><descrip type="definition">Visible property</descrip><descrip type="domain">Design</descrip></termEntry></body></text></tbx>';
  const preview = await service.prepareImport(file("terms.tbx", xml), { type: "tb" });
  const result = await service.commitImport(preview);
  const term = writes[0][0];
  assert.notEqual(term.conceptId, "old-concept");
  assert.equal(term.domain, "Design");
  assert.equal(term.status, "admitted");
  assert.ok(service.exportEntries("tb", result.resource, [term]).content.includes("Visible property"));
});

test("TBX import retains an explicit distinct concept even when its terms and metadata match", async () => {
  const xml =
    '<tbx><text><body><termEntry id="external"><langSet xml:lang="en"><tig><term>bank</term></tig></langSet><langSet xml:lang="tr"><tig><term>banka</term></tig></langSet><descrip type="x-loopcat-conceptId">imported-concept</descrip></termEntry></body></text></tbx>';
  const first = await harness();
  const parsed = await first.service.prepareImport(file("concept.tbx", xml), {
    type: "tb",
    sourceLang: "en",
    targetLang: "tr"
  });
  const existing = {
    ...parsed.rows[0],
    id: "existing-entry",
    resourceId: "tb-existing",
    conceptId: "different-concept"
  };
  const { service } = await harness([existing]);
  const preview = await service.prepareImport(file("concept.tbx", xml), { type: "tb", resourceId: "tb-existing" });
  assert.equal(preview.duplicates.exact, 0);
  assert.equal((await service.commitImport(preview)).imported, 1);
});

test("import cancellation retains already committed batches and reports exact progress", async () => {
  const { service, stored } = await harness();
  const text = ["source,target", ...Array.from({ length: 250 }, (_, index) => `source ${index},target ${index}`)].join(
    "\n"
  );
  const preview = await service.prepareImport(file("large.csv", text), {
    type: "tb",
    sourceLang: "en",
    targetLang: "tr"
  });
  const abort = new AbortController();
  const result = await service.commitImport(preview, {
    signal: abort.signal,
    onProgress: () => {
      abort.abort();
    }
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.imported, 100);
  assert.equal(stored.size, 100);
});

test("preview rejects missing languages or ambiguous column mappings and commit rechecks archived destinations", async () => {
  const { service, resources } = await harness();
  const missing = await service.prepareImport(file("terms.csv", "source,target\na,b"), { type: "tb" });
  assert.ok(missing.validation.errors.length);
  await assert.rejects(service.commitImport(missing), /languages/);
  const preview = await service.prepareImport(file("terms.csv", "source,target\na,b"), {
    type: "tb",
    resourceId: "tb-existing"
  });
  resources.get("tb-existing").archived = true;
  await assert.rejects(service.commitImport(preview), /archived/);
});

test("TMX preview never relabels an unrelated language as the requested target", async () => {
  const { service } = await harness();
  const xml =
    '<tmx version="1.4"><header srclang="en"/><body><tu><tuv xml:lang="en"><seg>Hello</seg></tuv><tuv xml:lang="fr"><seg>Bonjour</seg></tuv></tu><tu><tuv xml:lang="en"><seg>Friend</seg></tuv><tuv xml:lang="tr"><seg>Arkadaş</seg></tuv></tu></body></tmx>';
  const preview = await service.prepareImport(file("mixed.tmx", xml), {
    type: "tm",
    sourceLang: "en",
    targetLang: "tr"
  });
  assert.equal(preview.valid, 1);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.rows[0].target, "Arkadaş");
});
