const test = require("node:test");
const assert = require("node:assert/strict");

function element(tag) {
  return {
    tag,
    textContent: "",
    kids: [],
    setAttribute() {},
    append(...kids) {
      this.kids.push(...kids);
    },
    replaceChildren(...kids) {
      this.kids = kids;
    }
  };
}
function tree(node) {
  return [node, ...node.kids.flatMap(tree)];
}
async function library(t, overrides = {}) {
  const [{ createLibraryUI }, { EXAMPLE_TERM_PACK: pack }] = await Promise.all([
    import("../../src/features/exchange/library-ui.js"),
    import("../../src/features/exchange/examples.js")
  ]);
  const root = element("main"),
    status = element("output"),
    project = { id: "A", name: "A" };
  const beforeLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://loopcat.invalid/") });
  t.after(() => {
    if (beforeLocation) Object.defineProperty(globalThis, "location", beforeLocation);
    else delete globalThis.location;
  });
  const ui = createLibraryUI({
    document: { createElement: element, querySelector: (selector) => (selector === "#exchangeRoot" ? root : status) },
    repo: {
      describe: () => Promise.resolve([{ id: pack.id, version: pack.version, digest: "c".repeat(64), pack }]),
      snapshot: () => Promise.resolve({ records: [] })
    },
    getProject: () => project,
    binding: () => project.id,
    ...overrides
  });
  await ui.open();
  t.after(ui.close);
  function click(label) {
    const button = tree(root).find((n) => n.tag === "button" && n.textContent === label);
    assert.ok(button, label);
    return button.onclick();
  }
  return { click, heading: () => tree(root).find((n) => n.tag === "h3")?.textContent, status };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("a completed activation cannot replace a newer QA preview", async (t) => {
  const started = deferred(),
    finish = deferred();
  const { click, heading, status } = await library(t, {
    changePin: () => {
      started.resolve();
      return finish.promise;
    }
  });
  await click("Installed");
  const pending = click("Activate for this project");
  await started.promise;
  await click("Examples");
  await click("Turkish infrastructure QA");
  assert.equal(heading(), "Turkish infrastructure QA");
  finish.resolve();
  await pending;
  assert.equal(heading(), "Turkish infrastructure QA");
  assert.equal(status.textContent, "");
});

test("leaving a QA preview terminates its worker and keeps the new page status", { timeout: 4000 }, async (t) => {
  const { click, heading, status } = await library(t);
  await click("Turkish infrastructure QA");
  const started = deferred();
  let terminated = false;
  const priorWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  class HeldWorker {
    postMessage() {
      started.resolve();
    }
    terminate() {
      terminated = true;
    }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: HeldWorker });
  t.after(() => {
    if (priorWorker) Object.defineProperty(globalThis, "Worker", priorWorker);
    else delete globalThis.Worker;
  });
  const pending = click("Try on examples");
  await started.promise;
  await click("Installed");
  await pending;
  assert.equal(terminated, true);
  assert.equal(heading(), "Installed");
  assert.equal(status.textContent, "");
});
