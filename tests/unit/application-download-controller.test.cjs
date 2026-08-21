const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-download-controller.js")).href);
}

function createHarness(createApplicationDownloadController, overrides = {}) {
  const calls = [];
  const timerCallbacks = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "download"} failed`);
  const revokeFailure = overrides.revokeFailure || new Error("revoke failed");
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  let href;
  let downloadName;
  let hidden;
  const link = {
    get href() {
      return href;
    },
    set href(value) {
      calls.push(["link.href", value]);
      fail("link.href");
      href = value;
    },
    get download() {
      return downloadName;
    },
    set download(value) {
      calls.push(["link.download", value]);
      fail("link.download");
      downloadName = value;
    },
    get hidden() {
      return hidden;
    },
    set hidden(value) {
      calls.push(["link.hidden", value]);
      fail("link.hidden");
      hidden = value;
    },
    click() {
      calls.push(["link.click"]);
      fail("link.click");
      return overrides.clickResult;
    },
    remove() {
      calls.push(["link.remove"]);
      fail("link.remove");
      return overrides.removeResult;
    }
  };
  const blob = overrides.blob || Object.freeze({ kind: "blob" });
  const url = overrides.url || "blob:loopcat-download";
  const redaction = {
    sanitize(value) {
      calls.push(["redaction.sanitize", value]);
      fail("redaction.sanitize");
      return overrides.sanitize ? overrides.sanitize(value) : String(value || "");
    }
  };
  const blobs = {
    create(parts, options) {
      calls.push(["blobs.create", parts, options]);
      fail("blobs.create");
      return blob;
    }
  };
  const urls = {
    create(value) {
      calls.push(["urls.create", value]);
      fail("urls.create");
      return url;
    },
    revoke(value) {
      calls.push(["urls.revoke", value]);
      if (overrides.revokeThrows) throw revokeFailure;
      fail("urls.revoke");
      return overrides.revokeResult;
    }
  };
  const dom = {
    createLink() {
      calls.push(["dom.createLink"]);
      fail("dom.createLink");
      return link;
    },
    append(value) {
      calls.push(["dom.append", value]);
      fail("dom.append");
      return overrides.appendResult;
    }
  };
  const scheduler = {
    timer(callback, delay) {
      calls.push(["scheduler.timer", callback, delay]);
      fail("scheduler.timer");
      timerCallbacks.push(callback);
      if (overrides.timerImmediately) callback();
      return overrides.timerResult;
    }
  };
  const controller = createApplicationDownloadController({ redaction, blobs, urls, dom, scheduler });
  return {
    blob,
    blobs,
    calls,
    controller,
    dom,
    failure,
    link,
    redaction,
    revokeFailure,
    scheduler,
    timerCallbacks,
    url,
    urls
  };
}

test("ApplicationDownloadController preserves every safe filename branch and immutable API", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const harness = createHarness(createApplicationDownloadController);
  assert.equal(Object.isFrozen(harness.controller), true);
  for (const [filename, fallback, expected] of [
    ["report.xlf", undefined, "report.xlf"],
    ["C:\\exports\\report.xlf", undefined, "report.xlf"],
    ["../nested/report.xlf", undefined, "report.xlf"],
    ["unsafe:name/target?.xlf", undefined, "target_.xlf"],
    ["  many\t spaces___and??marks.txt... ", undefined, "many_ spaces_and_marks.txt"],
    ["\u0000bad\u007fname.txt", undefined, "_bad_name.txt"],
    [".", "fallback.txt", "fallback.txt"],
    ["..", "fallback.txt", "fallback.txt"],
    ["", "CON.txt", "loopcat_CON.txt"],
    ["PRN", undefined, "loopcat_PRN"],
    ["lpt9.log", undefined, "loopcat_lpt9.log"],
    ["lpt10.log", undefined, "lpt10.log"],
    ["report.txt... ", undefined, "report.txt"],
    ["", "", "loopcat-export"]
  ]) {
    assert.equal(harness.controller.safeFilename(filename, fallback), expected, `${filename} -> ${expected}`);
  }
  const bounded = harness.controller.safeFilename(`${"a".repeat(200)}.xlf`);
  assert.equal(bounded.length, 180);
  assert.equal(bounded.endsWith(".xlf"), true);
  const longExtension = harness.controller.safeFilename(`${"b".repeat(180)}.${"c".repeat(17)}`);
  assert.equal(longExtension.length, 180);
  assert.equal(longExtension.includes("."), false);
});

test("ApplicationDownloadController redacts fallback and requested names before normalization", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const harness = createHarness(createApplicationDownloadController, {
    sanitize(value) {
      if (String(value).includes("Bearer")) return "[redacted secret].txt";
      return String(value || "");
    }
  });
  assert.equal(
    harness.controller.safeFilename("Bearer download-label-token-that-must-not-appear.txt", "Bearer fallback"),
    "[redacted secret].txt"
  );
  assert.deepEqual(harness.calls, [
    ["redaction.sanitize", "Bearer fallback"],
    ["redaction.sanitize", "Bearer download-label-token-that-must-not-appear.txt"]
  ]);
});

test("ApplicationDownloadController preserves exact accepted-click construction and delayed cleanup", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const content = Object.freeze({ payload: "report" });
  const harness = createHarness(createApplicationDownloadController, {
    timerResult: 44,
    clickResult: "ignored",
    removeResult: "ignored"
  });
  assert.equal(harness.controller.download("../CON.txt", content, "text/plain"), undefined);
  assert.equal(harness.link.href, harness.url);
  assert.equal(harness.link.download, "loopcat_CON.txt");
  assert.equal(harness.link.hidden, true);
  assert.equal(harness.timerCallbacks.length, 1);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    [
      "blobs.create",
      "urls.create",
      "dom.createLink",
      "link.href",
      "redaction.sanitize",
      "redaction.sanitize",
      "link.download",
      "link.hidden",
      "dom.append",
      "link.click",
      "link.remove",
      "scheduler.timer"
    ]
  );
  assert.deepEqual(harness.calls[0], ["blobs.create", [content], { type: "text/plain" }]);
  assert.equal(harness.calls[1][1], harness.blob);
  assert.equal(harness.calls.at(-1)[2], 1000);
  harness.timerCallbacks[0]();
  assert.deepEqual(harness.calls.at(-1), ["urls.revoke", harness.url]);
});

test("ApplicationDownloadController preserves default MIME type and synchronous timer callback", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const harness = createHarness(createApplicationDownloadController, {
    timerImmediately: true,
    revokeThrows: true
  });
  assert.equal(harness.controller.download("report.bin", "content"), undefined);
  assert.deepEqual(harness.calls[0], ["blobs.create", ["content"], { type: "application/octet-stream" }]);
  assert.deepEqual(
    harness.calls.slice(-2).map(([name]) => name),
    ["scheduler.timer", "urls.revoke"]
  );
});

test("ApplicationDownloadController immediately cleans failed clicks and preserves the click error", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const harness = createHarness(createApplicationDownloadController, {
    failAt: "link.click",
    revokeThrows: true
  });
  assert.throws(
    () => harness.controller.download("report.txt", "content", "text/plain"),
    (error) => error === harness.failure
  );
  assert.deepEqual(
    harness.calls.slice(-3).map(([name]) => name),
    ["link.click", "link.remove", "urls.revoke"]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "scheduler.timer"),
    false
  );
});

test("ApplicationDownloadController preserves removal and timer failure precedence", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const removal = createHarness(createApplicationDownloadController, { failAt: "link.remove" });
  assert.throws(
    () => removal.controller.download("report.txt", "content"),
    (error) => error === removal.failure
  );
  assert.deepEqual(
    removal.calls.slice(-2).map(([name]) => name),
    ["link.click", "link.remove"]
  );
  assert.equal(
    removal.calls.some(([name]) => name === "scheduler.timer"),
    false
  );
  assert.equal(
    removal.calls.some(([name]) => name === "urls.revoke"),
    false
  );

  const timer = createHarness(createApplicationDownloadController, { failAt: "scheduler.timer" });
  assert.throws(
    () => timer.controller.download("report.txt", "content"),
    (error) => error === timer.failure
  );
  assert.deepEqual(
    timer.calls.slice(-3).map(([name]) => name),
    ["link.click", "link.remove", "scheduler.timer"]
  );
  assert.equal(
    timer.calls.some(([name]) => name === "urls.revoke"),
    false
  );
});

test("ApplicationDownloadController preserves every pre-click primary failure boundary", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  for (const [failAt, finalCall] of [
    ["blobs.create", "blobs.create"],
    ["urls.create", "urls.create"],
    ["dom.createLink", "dom.createLink"],
    ["link.href", "link.href"],
    ["redaction.sanitize", "redaction.sanitize"],
    ["link.download", "link.download"],
    ["link.hidden", "link.hidden"],
    ["dom.append", "dom.append"]
  ]) {
    const harness = createHarness(createApplicationDownloadController, { failAt });
    assert.throws(
      () => harness.controller.download("report.txt", "content"),
      (error) => error === harness.failure,
      failAt
    );
    assert.equal(harness.calls.at(-1)[0], finalCall, failAt);
    assert.equal(
      harness.calls.some(([name]) => name === "link.remove"),
      false,
      failAt
    );
    assert.equal(
      harness.calls.some(([name]) => name === "urls.revoke"),
      false,
      failAt
    );
  }
});

test("ApplicationDownloadController validates every injected owner", async () => {
  const { createApplicationDownloadController } = await loadFactory();
  const valid = {
    redaction: { sanitize() {} },
    blobs: { create() {} },
    urls: { create() {}, revoke() {} },
    dom: { createLink() {}, append() {} },
    scheduler: { timer() {} }
  };
  for (const [key, value, message] of [
    ["redaction", null, "checked redaction boundary"],
    ["blobs", null, "checked Blob boundary"],
    ["urls", null, "checked object-URL boundaries"],
    ["urls", { create() {} }, "checked object-URL boundaries"],
    ["dom", null, "checked download-link boundaries"],
    ["dom", { createLink() {} }, "checked download-link boundaries"],
    ["scheduler", null, "checked timer boundary"]
  ]) {
    assert.throws(() => createApplicationDownloadController({ ...valid, [key]: value }), new RegExp(message));
  }
});
