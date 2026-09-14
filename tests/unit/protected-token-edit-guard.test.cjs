const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const runtime = vm.createContext({ window: {} });
vm.runInContext(readFileSync(path.join(root, "protected-tags.js"), "utf8"), runtime);
const detect = runtime.window.CatHan.protectedTags.detectProtectedTags;
const load = () => import(pathToFileURL(path.join(root, "src/features/editor/protected-token-edit-guard.js")).href);

test("editing guards preserve original XML attributes, variables, printf placeholders, and entities", async () => {
  const { protectedTokenRanges, permitsProtectedEdit } = await load();
  const pairs = [
    ['<g id="fmt1" ctype="x-bold">', '<g id="fmt2" ctype="x-bold">'],
    ['<strong class="lead">', '<strong class="body">'],
    ["{{user.name}}", "{{user.code}}"],
    ["${account}", "${accounts}"],
    ["%1$s", "%2$s"],
    ["&amp;", "&lt;"]
  ];
  for (const [token, changed] of pairs) {
    const previous = `😀 قبل ${token} sonra`;
    const next = previous.replace(token, changed);
    const ranges = protectedTokenRanges(previous, detect(previous));
    assert.equal(ranges.length, 1, token);
    assert.equal(ranges[0].text, token, "raw markup, never shortened display label");
    assert.equal(permitsProtectedEdit(previous, next, ranges), false, token);
    assert.equal(
      permitsProtectedEdit(previous, next, ranges, {
        value: previous,
        selection: { start: ranges[0].start, end: ranges[0].end },
        replacement: changed
      }),
      true,
      `an explicitly selected whole ${token} can be replaced`
    );
  }
});

test("identical repeated tags cannot hide a damaged occurrence but can be moved or removed atomically", async () => {
  const { protectedTokenRanges, permitsProtectedEdit } = await load();
  const previous = '<g id="same">first <g id="same">second';
  const ranges = protectedTokenRanges(previous, detect(previous));
  assert.equal(ranges.length, 2);
  assert.equal(permitsProtectedEdit(previous, previous.replace('id="same"', 'id="oops"'), ranges), false);
  assert.equal(permitsProtectedEdit(previous, 'first <g id="same"><g id="same">second', ranges), true);
  assert.equal(
    permitsProtectedEdit(previous, previous.slice(ranges[0].end), ranges, {
      value: previous,
      selection: { start: 0, end: ranges[0].end },
      replacement: ""
    }),
    true
  );
});

test("UTF-16 selections around emoji and RTL text preserve only whole token boundaries", async () => {
  const { protectedTokenRanges, normalizeProtectedSelection, protectedInputSelection } = await load();
  const value = '😀 مرحبا <g id="one">世界</g> שלום';
  const ranges = protectedTokenRanges(value, detect(value));
  const first = ranges[0];
  assert.equal(value.slice(first.start, first.end), '<g id="one">');
  assert.deepEqual(normalizeProtectedSelection({ start: first.start + 1, end: first.end - 1 }, value.length, ranges), {
    start: first.start,
    end: first.end
  });
  assert.deepEqual(
    protectedInputSelection({ start: first.end, end: first.end }, value.length, ranges, "deleteContentBackward"),
    { start: first.start, end: first.end }
  );
  const plain = { start: first.end, end: first.end + 2 };
  assert.deepEqual(normalizeProtectedSelection(plain, value.length, ranges), plain);
});

test("fallback deletion expands broken delimiters without changing surrounding translated text", async () => {
  const { protectedTokenRanges, expandProtectedDeletion, permitsProtectedEdit } = await load();
  const previous = 'Before <g id="one">çeviri</g> after';
  const partial = previous.replace('id="one">', 'id="one"');
  const ranges = protectedTokenRanges(previous, detect(previous));
  const corrected = expandProtectedDeletion(previous, partial, ranges);
  assert.equal(corrected.value, "Before çeviri</g> after");
  assert.equal(permitsProtectedEdit(previous, corrected.value, ranges, corrected.intent), true);
  assert.equal(
    expandProtectedDeletion(previous, previous.replace('id="one"', 'id="two"'), ranges),
    null,
    "a replacement must not be disguised as an atomic deletion"
  );
});
