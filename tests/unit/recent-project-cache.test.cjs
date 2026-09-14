const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function harness() {
  const { createRecentProjectCache } = await import(
    pathToFileURL(path.resolve(__dirname, "../../src/features/projects/recent-project-cache.js"))
  );
  let generation = "1:original";
  let text = "original";
  const reads = [];
  const preferences = new Map();
  const cache = createRecentProjectCache({
    repository: {
      stamp: () => Promise.resolve(generation),
      segments: (id) => {
        reads.push(id);
        return Promise.resolve([{ id, target: text }]);
      },
      activity: () => Promise.resolve([])
    },
    preferences: { getItem: (key) => preferences.get(key), setItem: (key, value) => preferences.set(key, value) },
    preferenceKey: "test"
  });
  return {
    cache,
    reads,
    preferences,
    change: (stamp) => {
      generation = stamp;
      text = "new";
    }
  };
}

test("Recent projects warm only three eligible projects, prefer access/creation, and consume without rereading", async () => {
  const h = await harness();
  h.cache.remember("old");
  const projects = ["old", "new", "third", "fourth"].map((id, i) => ({
    id,
    createdAt: new Date(100000 - i * 1000).toISOString(),
    catalogProgress: { total: 7 }
  }));
  h.cache.schedule([...projects, { id: "preview", catalogUnverified: true }]);
  await wait(350);
  assert.deepEqual(h.reads, ["old", "new", "third"]);
  const cached = await h.cache.take("old");
  assert.equal(cached.segments[0].target, "original");
  assert.equal(h.reads.length, 3);
  cached.segments[0].target = "edited";
  assert.equal((await h.cache.take("old")).segments[0].target, "original");
  h.cache.invalidate();
});

test("An external commit or same-generation restore invalidates prefetched editor content", async () => {
  for (const stamp of ["2:original", "1:restored"]) {
    const h = await harness();
    h.cache.schedule([{ id: "p" }]);
    await wait(160);
    h.change(stamp);
    assert.equal((await h.cache.take("p")).segments[0].target, "new");
    assert.equal(h.reads.length, 2);
    h.cache.invalidate();
  }
});

test("Local invalidation cancels pending warmup and oversized projects remain available on demand", async () => {
  const h = await harness();
  h.cache.schedule([{ id: "canceled" }]);
  h.cache.invalidate();
  await wait(150);
  assert.deepEqual(h.reads, []);
  h.cache.schedule([{ id: "large", catalogProgress: { total: 100000 } }]);
  await wait(150);
  assert.deepEqual(h.reads, []);
  assert.equal((await h.cache.take("large")).segments.length, 1);
  h.cache.invalidate();
});
