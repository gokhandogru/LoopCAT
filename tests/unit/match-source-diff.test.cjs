const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const load = () => import(pathToFileURL(path.resolve(__dirname, "../../src/features/editor/match-source-diff.js")));

test("word diff preserves both sources and identifies insertions, removals and replacements", async () => {
  const { diffMatchSource } = await load();
  for (const [oldText, currentText] of [
    ["I have many friends.", "I have a friend."],
    ["bonjour monde", "bonjour le monde"],
    ["hello brave world", "hello world"],
    ["one one two", "one two one"],
    ["你好世界", "你好新世界"],
    ["مرحبا بالعالم", "مرحبا بالعالم الجديد"],
    ["Use <tag> & 5!", "Use <tag> & 10?"],
    ["same", "same"],
    ["", "new"],
    ["old", ""]
  ]) {
    const parts = diffMatchSource(oldText, currentText);
    assert.equal(
      parts
        .filter((part) => part.kind !== "added")
        .map((part) => part.text)
        .join(""),
      oldText
    );
    assert.equal(
      parts
        .filter((part) => part.kind !== "removed")
        .map((part) => part.text)
        .join(""),
      currentText
    );
  }
  assert.deepEqual(diffMatchSource("same", "same"), [{ kind: "equal", text: "same" }]);
  const diff = diffMatchSource("I have many friends.", "I have a friend.");
  assert.ok(diff.some((part) => part.kind === "removed" && part.text.includes("many")));
  assert.ok(diff.some((part) => part.kind === "added" && part.text.includes("a")));
  assert.ok(diff.some((part) => part.kind === "removed" && part.text.includes("friends")));
  assert.ok(diff.some((part) => part.kind === "added" && part.text.includes("friend")));
});

test("long inputs use bounded fallback while preserving both versions", async () => {
  const { diffMatchSource } = await load();
  const before = "old ".repeat(600),
    after = "new ".repeat(600);
  assert.deepEqual(diffMatchSource(before, after), [
    { kind: "removed", text: before },
    { kind: "added", text: after }
  ]);
});
