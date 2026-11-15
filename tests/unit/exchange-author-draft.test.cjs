const assert = require("node:assert/strict");
const test = require("node:test");

test("private draft round-trips unfinished and excluded rows; the installer rejects it", async () => {
  const { encodeAuthorDraft, readAuthorDraft } = await import("../../src/features/exchange/author-draft.js");
  const { decodePack } = await import("../../src/features/exchange/pack-format.js");
  const input = {
    format: "loopcat-pack",
    schemaVersion: 1,
    kind: "terminology",
    id: "",
    name: "",
    languages: { source: "en", target: "tr" },
    entries: [{ sourceTerm: "server" }, { sourceTerm: "private entry", caseSensitive: true }],
    exchangeAuthorSelection: [true, false]
  };
  const file = encodeAuthorDraft(input);
  assert.deepEqual(await readAuthorDraft(file), input);
  await assert.rejects(decodePack(file));
  assert.throws(() => encodeAuthorDraft({ ...input, arbitraryHostCall: "never" }));
  assert.throws(() => encodeAuthorDraft({ ...input, exchangeAuthorSelection: [true] }));
  await assert.rejects(
    readAuthorDraft({ size: 1024 * 1024 + 1, text: () => assert.fail("must not read oversized data") })
  );
  await assert.rejects(
    readAuthorDraft(
      new Blob([JSON.stringify({ format: "loopcat-private-author-draft", schemaVersion: 99, draft: input })])
    )
  );
});
