const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("status controller keeps save and background jobs in separate channels", async () => {
  const [{ createSaveStore }, { createJobStore }, { createNoticeStore }, { createStatusController }] =
    await Promise.all([
      moduleAt("src/status/save-store.js"),
      moduleAt("src/status/job-store.js"),
      moduleAt("src/status/notice-store.js"),
      moduleAt("src/status/status-controller.js")
    ]);
  const saveStore = createSaveStore();
  const jobStore = createJobStore();
  const noticeStore = createNoticeStore();
  const controller = createStatusController({ saveStore, jobStore, noticeStore });

  controller.fromLegacy({ text: "Saving..." });
  controller.fromLegacy({ text: "Import project: parsing" });
  assert.equal(saveStore.getState().status, "saving");
  assert.equal(jobStore.get("legacy-operation").status, "running");

  controller.fromLegacy({ text: "Project package imported", mode: "saved" });
  assert.equal(jobStore.get("legacy-operation").status, "completed");
  assert.equal(noticeStore.list().at(-1).message, "Project package imported");
});

test("normalized errors explain preservation and redact secrets and paths", async () => {
  const { normalizeError } = await moduleAt("src/status/error-model.js");
  const normalized = normalizeError(new Error("api_key=secret-value failed at C:\\Users\\Person\\project.loopcat"), {
    retryable: true,
    nextActions: ["Retry"]
  });
  assert.equal(normalized.retryable, true);
  assert.equal(normalized.preserved, "Your existing work was preserved.");
  assert(!normalized.whatHappened.includes("secret-value"));
  assert(!normalized.whatHappened.includes("Person"));
});
