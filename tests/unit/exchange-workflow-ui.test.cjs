const test = require("node:test"),
  assert = require("node:assert/strict");
const api = import("../../src/features/exchange/advanced-ui.js");
function surface() {
  let root;
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k)
  };
  const doc = {
    createElement: (tag) => node(tag),
    createTextNode: (text) => Object.assign(node("text"), { textContent: text })
  };
  function node(tag) {
    return {
      tag,
      ownerDocument: doc,
      kids: [],
      events: {},
      attrs: {},
      className: "",
      textContent: "",
      value: "",
      selectedIndex: 0,
      get isConnected() {
        return this === root || Boolean(this.parent?.isConnected);
      },
      append(...kids) {
        for (const child of kids) {
          child.parent = this;
          this.kids.push(child);
        }
      },
      replaceChildren(...kids) {
        for (const child of this.kids) child.parent = null;
        this.kids = [];
        this.append(...kids);
      },
      remove() {
        if (this.parent) this.parent.kids = this.parent.kids.filter((n) => n !== this);
        this.parent = null;
      },
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      addEventListener(k, f) {
        this.events[k] = f;
      },
      focus() {
        doc.activeElement = this;
      }
    };
  }
  root = node("main");
  const tree = (n) => [n, ...n.kids.flatMap(tree)];
  const all = () => tree(root),
    find = (text) => all().find((n) => n.textContent === text);
  return {
    root,
    storage,
    doc,
    all,
    find,
    click: (text) => find(text).events.click(),
    field: (text) => find(text + " ").kids[0],
    repository: { isUsable: () => true, onChange: () => () => {}, signal: () => new AbortController().signal }
  };
}
async function engine(host) {
  const f = surface(),
    { renderAdvancedPack } = await api;
  f.dispose = renderAdvancedPack({
    root: f.root,
    storage: f.storage,
    repository: f.repository,
    projectId: "p",
    enabled: true,
    pin: {},
    pack: { kind: "ai", entries: [{ operation: "generate", providerIds: ["ollama"], maxRequests: 1 }] },
    host: { describe: () => ({ fields: ["source"], destinations: [], requestCount: 1, limit: 1 }), ...host }
  });
  return f;
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("canceling an AI run immediately updates its controls and discards a late provider answer", async () => {
  const ready = deferred();
  let request;
  const f = await engine({
    run: (_e, o) => {
      request = o;
      return ready.promise;
    }
  });
  assert.equal(f.find("Cancel run").disabled, true);
  const pending = f.click("Run workflow");
  assert.equal(f.find("Run workflow").disabled, true);
  assert.equal(f.find("Cancel run").disabled, false);
  await f.click("Cancel run");
  assert.equal(request.signal.aborted, true);
  assert.equal(f.find("Cancel run").disabled, true);
  assert.ok(f.find("Canceled."));
  ready.resolve([{ providerId: "ollama", model: "m", text: "late", kind: "candidate" }]);
  await pending;
  assert.equal(f.find("late"), undefined);
  assert.equal(f.find("Apply this draft"), undefined);
  assert.equal(f.find("Run workflow").disabled, false);
  f.dispose();
});

test("provider and protected-apply failures never report success; successful application disables repeat apply", async () => {
  let fails = true,
    applyResult = false;
  const f = await engine({
    run: () => {
      if (fails) throw Error("Provider unavailable");
      return [{ providerId: "ollama", model: "m", text: "draft", kind: "candidate" }];
    },
    apply: () => applyResult
  });
  await f.click("Run workflow");
  assert.ok(f.find("Provider unavailable"));
  assert.equal(f.find("Apply this draft"), undefined);
  fails = false;
  await f.click("Run workflow");
  await f.click("Apply this draft");
  assert.equal(f.find("Draft applied."), undefined);
  assert.ok(f.find("The draft was not applied. Check the segment and save status."));
  applyResult = true;
  await f.click("Apply this draft");
  assert.ok(f.find("Draft applied."));
  assert.equal(f.find("Apply this draft").disabled, true);
  assert.equal(f.find("The draft was not applied. Check the segment and save status."), undefined);
  f.dispose();
});

test("instructor authors a portable frozen lesson; blind order survives reopening and response deletion remains explicit", async () => {
  const { renderAdvancedAuthor, renderAdvancedPack, renderResponseArchive } = await api;
  const { encodePack, decodePack } = await import("../../src/features/exchange/pack-format.js");
  const { listResponses } = await import("../../src/features/exchange/lab-session.js");
  const f = surface();
  let record;
  renderAdvancedAuthor({
    root: f.root,
    kind: "lesson",
    onCreate: async (p) => {
      record = await decodePack(await encodePack(p));
    }
  });
  for (const [name, value] of [
    ["Pack name", "Classroom exercise"],
    ["Unique publisher.name", "school.exercise"],
    ["Publisher", "Instructor"],
    ["License or usage terms", "CC0-1.0"]
  ])
    f.field(name).value = value;
  await f.click("Preview authored pack");
  assert.equal(record.pack.entries[0].candidates.length, 4);
  f.root.replaceChildren();
  const mount = () =>
    renderAdvancedPack({
      root: f.root,
      pack: record.pack,
      pin: record,
      storage: f.storage,
      repository: f.repository,
      projectId: "",
      enabled: true
    });
  let dispose = mount();
  await f.click("Open exercise");
  const order = () =>
    f
      .all()
      .filter((n) => n.tag === "p" && n.lang === "ca")
      .map((n) => n.textContent);
  const first = order();
  assert.equal(first.length, 4);
  assert.ok(!f.all().some((n) => /Editorial sample/.test(n.textContent)));
  dispose();
  dispose = mount();
  await f.click("Open exercise");
  assert.deepEqual(order(), first);
  f.field("Best candidate for post-editing").selectedIndex = 2;
  for (const name of record.pack.entries[0].rubric) f.field(name + " (1 lowest, 5 highest)").selectedIndex = 4;
  f.field("Why did you choose it? Your answer stays on this device.").value = "Clear meaning.";
  await f.click("Record my decision");
  assert.equal(f.doc.activeElement.textContent, "Recorded: candidate B. Clear meaning.");
  await f.click("Reveal candidate identities");
  assert.ok(f.all().some((n) => /Editorial sample/.test(n.textContent)));
  dispose();
  renderResponseArchive({ root: f.root, storage: f.storage });
  assert.equal(f.all().find((n) => n.tag === "pre").tabIndex, 0, "Response preview is keyboard-scrollable.");
  assert.ok(!f.all().some((n) => n.textContent.includes("Clear meaning.")));
  await f.click("Delete response");
  assert.equal(listResponses(f.storage).length, 1);
  f.field("Confirm deletion of this local response").checked = true;
  await f.click("Delete response");
  assert.equal(listResponses(f.storage).length, 0);
  assert.equal(f.doc.activeElement.textContent, "Saved learner responses");
});

test("changing the open exercise cancels its live comparison and ignores a delayed completion", async () => {
  const { renderAdvancedPack } = await api,
    { BLIND_LAB_SAMPLE: pack } = await import("../../src/features/exchange/workflow-packs.js");
  const { openTrial } = await import("../../src/features/exchange/lab-session.js");
  const f = surface(),
    pin = { digest: "a".repeat(64) },
    trial = openTrial({ storage: f.storage, pack, pin, exercise: pack.entries[0] });
  trial.submit(0, [3, 3, 3, 3], "Clear.");
  trial.reveal();
  const pending = deferred();
  let request;
  const dispose = renderAdvancedPack({
    root: f.root,
    pack,
    pin,
    storage: f.storage,
    repository: f.repository,
    projectId: "",
    enabled: true,
    loadAiHost: () => ({
      providerIds: () => ["a", "b"],
      describe: () => ({ destinations: [] }),
      runLessonComparison: (_e, _s, o) => {
        request = o;
        return pending.promise;
      }
    })
  });
  await f.click("Open exercise");
  await f.click("Compare with live engines");
  const run = f.click("Run separate comparison");
  f.field("Exercise").events.change();
  assert.equal(request.signal.aborted, true);
  assert.equal(request.active(), false);
  pending.resolve([{ providerId: "a", model: "m", text: "stale" }]);
  await run;
  assert.equal(f.find("stale"), undefined);
  dispose();
});
