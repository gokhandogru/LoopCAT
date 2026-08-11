const assert = require("node:assert/strict");
const test = require("node:test");
const { PNG } = require("pngjs");

test("visual regression primitive detects a changed pixel", async () => {
  const { default: pixelmatch } = await import("pixelmatch");
  const before = new PNG({ width: 2, height: 2 });
  const after = new PNG({ width: 2, height: 2 });
  before.data.fill(255);
  after.data.fill(255);
  after.data[0] = 0;
  const diff = new PNG({ width: 2, height: 2 });
  assert.equal(pixelmatch(before.data, after.data, diff.data, 2, 2, { threshold: 0.1 }), 1);
});
