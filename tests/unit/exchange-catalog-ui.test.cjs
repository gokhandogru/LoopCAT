const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, sign } = require("node:crypto");

// A DOM boundary around the real UI, signature verification and archive digest.
function documentFixture() {
  const data = new Map(),
    browserEvents = new Map();
  const browser = {
    localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
    addEventListener: (k, fn) => browserEvents.set(k, fn),
    removeEventListener: (k) => browserEvents.delete(k)
  };
  const doc = { defaultView: browser };
  doc.createElement = (tag) => {
    const element = {
      tag,
      ownerDocument: doc,
      children: [],
      attributes: {},
      events: {},
      value: "",
      disabled: false,
      text: "",
      classList: { toggle() {} },
      append(...kids) {
        for (const k of kids) {
          k.parent = this;
          this.children.push(k);
        }
      },
      replaceChildren(...kids) {
        this.children = [];
        this.append(...kids);
      },
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      addEventListener(k, fn) {
        this.events[k] = fn;
      },
      querySelectorAll(tags) {
        return tree(this).filter((n) => tags.split(",").includes(n.tag));
      },
      remove() {
        this.removed = true;
      }
    };
    Object.defineProperty(element, "textContent", {
      get() {
        return this.text + this.children.map((k) => k.textContent).join("");
      },
      set(value) {
        this.text = value;
        this.children = [];
      }
    });
    return element;
  };
  return { root: doc.createElement("main"), data, browser, browserEvents };
}
function tree(node) {
  return [node, ...node.children.flatMap(tree)];
}
async function idle(root) {
  for (let i = 0; i < 100; i++) {
    if (tree(root).find((n) => n.className === "exchange-catalog").attributes["aria-busy"] !== "true") return;
    await new Promise((r) => {
      setTimeout(r, 2);
    });
  }
  throw Error("Catalog did not finish");
}
function field(root, label) {
  return tree(root).find((n) => n.tag === "label" && n.children[0]?.textContent === label)?.children[1];
}
async function file(root, label, value) {
  const input = field(root, label);
  assert.ok(input, label);
  assert.equal(input.disabled, false, label);
  input.files = [value];
  input.events.change();
  await idle(root);
}
async function click(root, label) {
  const button = tree(root).find((n) => n.tag === "button" && n.textContent === label);
  assert.ok(button && !button.disabled && !button.hidden, label);
  button.events.click();
  await idle(root);
}
function input(root, label, value) {
  const el = field(root, label);
  el.value = value;
  tree(root)
    .find((n) => n.className === "exchange-catalog")
    .events.input({ target: el });
}
function cards(root) {
  return tree(root).filter((n) => n.className === "exchange-catalog-card");
}

test("private catalog trust, discovery, failed file recovery and cross-window withdrawal use real signatures", async (t) => {
  const [{ mountExchangeCatalog }, { encodePack }, { EXAMPLE_TERM_PACK }, { catalogHash }, { checkpointKey }] =
    await Promise.all([
      import("../../src/features/exchange/catalog-ui.js"),
      import("../../src/features/exchange/pack-format.js"),
      import("../../src/features/exchange/examples.js"),
      import("../../src/features/exchange/catalog.js"),
      import("../../src/features/exchange/catalog-policy.js")
    ]);
  const { root, data, browserEvents } = documentFixture();
  const zip = await encodePack(EXAMPLE_TERM_PACK),
    sha256 = await catalogHash(await zip.arrayBuffer());
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const anchor = {
    catalogId: "test.catalog",
    publicKey: Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64")
  };
  const entry = {
    id: EXAMPLE_TERM_PACK.id,
    version: EXAMPLE_TERM_PACK.version,
    title: "<b>Terminology</b>",
    task: "Term lookup",
    region: "TR",
    domain: "Health",
    edition: "Web and desktop",
    languages: ["en", "tr"],
    offline: true,
    sample: "A literal <script> example",
    maintainer: "Test school",
    rights: EXAMPLE_TERM_PACK.license,
    testedApp: "Development build",
    reviewedVersion: EXAMPLE_TERM_PACK.version,
    sha256,
    bytes: zip.size
  };
  const payload = {
    format: "loopcat-catalog-v1",
    catalogId: anchor.catalogId,
    sequence: 1,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    releases: [
      entry,
      { ...entry, id: "other.pack", title: "Arabic resource", languages: ["ar"], region: "EG", offline: false }
    ],
    revoked: []
  };
  const signed = (diff = {}) => {
    const p = Buffer.from(JSON.stringify({ ...payload, ...diff }));
    return new Blob([
      JSON.stringify({
        format: "loopcat-signed-index-v1",
        payload: p.toString("base64"),
        signature: sign(null, p, privateKey).toString("base64")
      })
    ]);
  };
  const installed = [],
    accepted = [];
  const dispose = mountExchangeCatalog({
    root,
    onInstall: (...args) => {
      installed.push(args);
    },
    onSnapshot: (s) => {
      accepted.push(s);
      return Promise.resolve(0);
    }
  });
  t.after(dispose);
  assert.equal(field(root, "Open signed catalog snapshot").disabled, true);
  assert.match(root.textContent, /official catalog has not been configured/);
  await file(root, "Choose a separate catalog trust file", new Blob([JSON.stringify(anchor)]));
  assert.equal(field(root, "Open signed catalog snapshot").disabled, true);
  await click(root, "Trust this fingerprint for this session");
  await file(root, "Open signed catalog snapshot", signed());
  assert.equal(cards(root).length, 2);
  assert.equal(accepted.length, 1);
  assert.equal(
    tree(root).find((n) => n.tag === "h4" && n.textContent === entry.title).attributes["data-i18n-skip"],
    ""
  );
  input(root, "Language", "tr");
  assert.equal(cards(root).length, 1);
  input(root, "Search catalog", "health school");
  assert.equal(cards(root).length, 1);
  input(root, "Domain", "Finance");
  assert.equal(cards(root).length, 0);
  assert.match(root.textContent, /No matching packs/);
  await click(root, "Clear filters");
  await file(root, "Verify local pack and preview", new Blob(["wrong"]));
  assert.equal(installed.length, 0);
  assert.match(root.textContent, /Choose the exact pack file/);
  await file(root, "Verify local pack and preview", zip);
  assert.equal(installed.length, 1);
  assert.equal(installed[0][1].catalogId, anchor.catalogId);
  await file(root, "Open signed catalog snapshot", signed({ sequence: 2, revoked: [sha256] }));
  assert.equal(cards(root).length, 2);
  assert.equal(field(root, "Verify local pack and preview"), undefined);
  await file(root, "Open signed catalog snapshot", signed());
  assert.match(root.textContent, /rollback/);
  assert.equal(accepted.length, 2);
  const checkpoint = JSON.parse(data.get(checkpointKey(anchor.catalogId)));
  data.set(checkpointKey(anchor.catalogId), JSON.stringify({ ...checkpoint, hash: "a".repeat(64) }));
  browserEvents.get("storage")({ key: checkpointKey(anchor.catalogId) });
  assert.match(root.textContent, /Open its current signed snapshot/);
  dispose();
  assert.equal(browserEvents.size, 0);
});

test("a denied trust checkpoint stays unaccepted and a retry with writable local storage recovers", async (t) => {
  const { mountExchangeCatalog } = await import("../../src/features/exchange/catalog-ui.js");
  const { root, browser, data } = documentFixture();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = {
    catalogId: "test.quota",
    publicKey: Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64")
  };
  const payload = Buffer.from(
    JSON.stringify({
      format: "loopcat-catalog-v1",
      catalogId: key.catalogId,
      sequence: 1,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      releases: [],
      revoked: []
    })
  );
  const blob = new Blob([
    JSON.stringify({
      format: "loopcat-signed-index-v1",
      payload: payload.toString("base64"),
      signature: sign(null, payload, privateKey).toString("base64")
    })
  ]);
  let accepted = 0;
  t.after(
    mountExchangeCatalog({
      root,
      onInstall: () => assert.fail("Empty catalog cannot install"),
      onSnapshot: () => {
        accepted++;
        return Promise.resolve();
      }
    })
  );
  await file(root, "Choose a separate catalog trust file", new Blob([JSON.stringify(key)]));
  await click(root, "Trust this fingerprint for this session");
  const save = browser.localStorage.setItem;
  browser.localStorage.setItem = () => {
    throw Error("Quota exceeded");
  };
  await file(root, "Open signed catalog snapshot", blob);
  assert.match(root.textContent, /Allow local storage/);
  assert.equal(accepted, 0);
  assert.equal(data.size, 0);
  browser.localStorage.setItem = save;
  await file(root, "Open signed catalog snapshot", blob);
  assert.equal(accepted, 1);
  assert.equal(data.size, 1);
  assert.match(root.textContent, /currently lists no releases/);
});
