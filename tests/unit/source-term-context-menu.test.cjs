const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");

test("source context menu captures selection before focus changes and rejects stale segments", async () => {
  const { installSourceTermContextMenu } = await import(
    pathToFileURL(path.join(root, "src/features/editor/source-term-context-menu.js"))
  );
  let listener,
    menu,
    opened,
    selected = false;
  const project = { id: "p" },
    segments = [{ id: "one" }, { id: "two" }];
  const cell = { contains: (node) => node.inside, closest: () => ({ dataset: { index: "1" } }) };
  const node = { inside: true, parentElement: { closest: () => null } };
  const range = { startContainer: node, endContainer: node, cloneContents: () => ({ querySelector: () => null }) };
  const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => " selected phrase " };
  const body = {
    contains: () => true,
    addEventListener: (_, cb) => {
      listener = cb;
    },
    removeEventListener: (_, cb) => {
      assert.equal(cb, listener);
    }
  };
  const dispose = installSourceTermContextMenu({
    body,
    window: { getSelection: () => selection },
    contextMenu: {
      open: (value) => {
        menu = value;
      }
    },
    session: {
      getProject: () => project,
      getSegments: () => segments,
      getActiveSegment: () => (selected ? segments[1] : segments[0])
    },
    navigation: {
      select: () => {
        selected = true;
      }
    },
    capture: {
      open: (value) => {
        opened = value;
      }
    },
    localization: { source: (text) => text }
  });
  listener({ target: { closest: () => cell } });
  selection.toString = () => "";
  await menu.items[0].action();
  assert.deepEqual(opened, {
    sourceText: "selected phrase",
    targetText: "",
    activeOnly: true,
    projectId: "p",
    segmentId: "two"
  });
  opened = null;
  segments[1] = { id: "changed" };
  await menu.items[0].action();
  assert.equal(opened, null);
  dispose();
});

test("source menu ignores cross-cell selection, protected tags and empty selection", async () => {
  const { installSourceTermContextMenu } = await import(
    pathToFileURL(path.join(root, "src/features/editor/source-term-context-menu.js"))
  );
  let listener,
    opens = 0;
  const cell = { contains: (node) => node.inside, closest: () => ({ dataset: { index: "0" } }) };
  const node = { inside: true, parentElement: { closest: () => null } };
  const range = {
    startContainer: node,
    endContainer: { inside: false },
    cloneContents: () => ({ querySelector: () => null })
  };
  const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => "word" };
  installSourceTermContextMenu({
    body: {
      contains: () => true,
      addEventListener: (_, cb) => {
        listener = cb;
      },
      removeEventListener() {}
    },
    window: { getSelection: () => selection },
    contextMenu: {
      open: () => {
        opens++;
      }
    },
    session: { getProject: () => ({ id: "p" }), getSegments: () => [{ id: "s" }] },
    navigation: {},
    capture: {},
    localization: { source: (v) => v }
  });
  const event = { target: { closest: () => cell } };
  listener(event);
  range.endContainer = node;
  range.cloneContents = () => ({ querySelector: () => ({}) });
  listener(event);
  range.cloneContents = () => ({ querySelector: () => null });
  selection.isCollapsed = true;
  listener(event);
  assert.equal(opens, 0);
});
