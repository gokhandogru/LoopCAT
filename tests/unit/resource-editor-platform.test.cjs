const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  resourceEditorRoute,
  createResourceEditorWindows,
  createQuitCoordinator
} = require("../../desktop/resource-editor-windows.cjs");

test("desktop resource hashes cannot widen the trusted application navigation boundary", () => {
  const { isAllowedAppNavigationUrl } = require("../../desktop/main.cjs");
  assert.equal(isAllowedAppNavigationUrl("loopcat://app/index.html#resource/tm/a%2Fb%3Fc"), true);
  for (const url of [
    "loopcat://app/%2e%2e/index.html",
    "loopcat://app/icons/%2e%2e/index.html",
    "loopcat://evil/index.html#resource/tm/a",
    "https://example.test/index.html#resource/tm/a",
    "loopcat://app/desktop/main.cjs#resource/tm/a"
  ]) {
    assert.equal(isAllowedAppNavigationUrl(url), false, url);
  }
});

test("resource routes round-trip identifiers and desktop agrees with the shared renderer", async () => {
  const { formatResourceEditorRoute, parseResourceEditorRoute } =
    await import("../../src/features/resources/resource-editor-route.js");
  for (const type of ["tm", "tb"]) {
    const descriptor = { type, resourceId: "Turkish / İngilizce?#%", entryId: "entry / ?#%" };
    const hash = formatResourceEditorRoute(descriptor);
    assert.deepEqual(parseResourceEditorRoute(hash), descriptor);
    assert.equal(resourceEditorRoute(descriptor), hash);
  }
  for (const hash of [
    "#projects",
    "#resource/tm/",
    "#resource/tm/id?entry=",
    "#resource/tm/id?url=https://evil",
    "#resource/tm/%ZZ",
    "#resource/tm/id?entry=%00",
    "#resource/other/id",
    "#resource/tm/id/extra"
  ]) {
    assert.equal(parseResourceEditorRoute(hash), null, hash);
  }
  for (const descriptor of [
    { type: "project", resourceId: "id" },
    { type: "tm", resourceId: "" },
    { type: "tb", resourceId: "\u0000" },
    { type: "tm", resourceId: "a".repeat(513) }
  ]) {
    assert.throws(() => formatResourceEditorRoute(descriptor));
    assert.throws(() => resourceEditorRoute(descriptor));
  }
});

function browserFixture(protocol = "https:", popup = true) {
  const calls = [];
  const messages = [];
  const child = {
    closed: false,
    focus: () => calls.push("focus"),
    postMessage: (message, origin) => messages.push({ message, origin })
  };
  const browser = {
    navigator: {},
    location: { protocol, href: `${protocol}//example.test/loopcat/index.html#resources`, hash: "#resources" },
    open: (url, name) => {
      calls.push({ url, name });
      return popup ? child : null;
    }
  };
  return { browser, calls, child, messages };
}

test("browser open is synchronous with the user gesture and reuses dirty tabs without navigating them", async () => {
  const { createBrowserPlatform } = await import("../../src/platform/browser-platform.js");
  const { browser, calls, child, messages } = browserFixture();
  const platform = createBrowserPlatform(browser);
  const first = platform.openResourceEditor({ type: "tm", resourceId: "one" });
  assert.equal(calls[0].url, "https://example.test/loopcat/index.html#resource/tm/one");
  assert.deepEqual(await first, { opened: true, mode: "tab" });
  await platform.openResourceEditor({ type: "tm", resourceId: "one", entryId: "another" });
  assert.equal(calls.filter((call) => typeof call === "object").length, 1);
  assert.deepEqual(messages, [
    {
      origin: "https://example.test",
      message: { type: "loopcat-resource-select", resourceType: "tm", resourceId: "one", entryId: "another" }
    }
  ]);
  child.closed = true;
  await platform.openResourceEditor({ type: "tm", resourceId: "one" });
  assert.equal(calls.filter((call) => typeof call === "object").length, 2);
});

test("blocked popups and local files use the same-tab resource route", async () => {
  const { createBrowserPlatform } = await import("../../src/platform/browser-platform.js");
  for (const protocol of ["https:", "file:"]) {
    const { browser, calls } = browserFixture(protocol, false);
    const platform = createBrowserPlatform(browser);
    assert.deepEqual(await platform.openResourceEditor({ type: "tb", resourceId: "terms" }), {
      opened: true,
      mode: "same-tab"
    });
    assert.equal(browser.location.hash, "#resource/tb/terms");
    assert.equal(calls.length, protocol === "file:" ? 0 : 1);
  }
});

test("Electron platform passes only the validated descriptor to its narrow bridge", async () => {
  const { createElectronPlatform } = await import("../../src/platform/electron-platform.js");
  let passed;
  const platform = createElectronPlatform({
    getRuntimeStatus() {},
    openResourceEditor(request) {
      passed = request;
      return Promise.resolve({ opened: true, mode: "window" });
    }
  });
  await platform.openResourceEditor({ type: "tb", resourceId: "a", entryId: "b", url: "https://evil" });
  assert.deepEqual(passed, { type: "tb", resourceId: "a", entryId: "b" });
  assert.throws(() => platform.openResourceEditor({ type: "project", resourceId: "a" }));
});

test("Back to Resources focuses a same-origin opener and local-file/direct editors use the current tab", async () => {
  const { createBrowserPlatform } = await import("../../src/platform/browser-platform.js");
  const { browser } = browserFixture();
  const messages = [];
  browser.opener = {
    closed: false,
    location: { origin: "https://example.test" },
    postMessage: (message, origin) => messages.push({ message, origin }),
    focus() {}
  };
  assert.deepEqual(await createBrowserPlatform(browser).openResourceLibrary(), { opened: true, mode: "opener" });
  assert.deepEqual(messages, [{ message: { type: "loopcat-resource-library-open" }, origin: "https://example.test" }]);
  browser.opener.location.origin = "https://untrusted.example";
  assert.deepEqual(await createBrowserPlatform(browser).openResourceLibrary(), { opened: true, mode: "same-tab" });
  assert.equal(browser.location.hash, "resources");
  const { browser: local } = browserFixture("file:");
  assert.deepEqual(await createBrowserPlatform(local).openResourceLibrary(), { opened: true, mode: "same-tab" });
});

test("native resource windows focus existing editors and unregister closed windows", () => {
  const created = [];
  const manager = createResourceEditorWindows({
    createWindow(hash, type) {
      const window = new EventEmitter();
      window.webContents = {
        send: (channel, request) => {
          window.selection = { channel, request };
        }
      };
      window.isDestroyed = () => false;
      window.isMinimized = () => true;
      window.restore = () => {
        window.restored = true;
      };
      window.show = () => {};
      window.focus = () => {
        window.focused = true;
      };
      created.push({ hash, type, window });
      return window;
    }
  });
  manager.open({ type: "tm", resourceId: "a" });
  manager.open({ type: "tm", resourceId: "a", entryId: "other" });
  assert.equal(created.length, 1);
  assert.equal(created[0].window.focused, true);
  assert.equal(created[0].window.restored, true);
  assert.deepEqual(created[0].window.selection, {
    channel: "loopcat:resource-editor-select",
    request: { resourceType: "tm", resourceId: "a", entryId: "other" }
  });
  created[0].window.emit("closed");
  manager.open({ type: "tm", resourceId: "a" });
  manager.open({ type: "tb", resourceId: "a" });
  assert.equal(created.length, 3);
  assert.equal(created[2].hash, "#resource/tb/a");
});

test("Quit waits for each editor and cancellation keeps remaining windows open", async () => {
  const live = ["library", "tm", "tb"];
  const attempts = [];
  let quit = 0;
  let cancel = true;
  const coordinator = createQuitCoordinator({
    windows: () => live,
    closeWindow: (window) => {
      attempts.push(window);
      if (window === "tm" && cancel) return Promise.resolve(false);
      live.shift();
      return Promise.resolve(true);
    },
    quit: () => quit++
  });
  coordinator.beforeQuit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.deepEqual(attempts, ["library", "tm"]);
  assert.deepEqual(live, ["tm", "tb"]);
  assert.equal(quit, 0);
  cancel = false;
  coordinator.beforeQuit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(quit, 1);
  coordinator.beforeQuit({
    preventDefault() {
      assert.fail("completed quit must not be prevented");
    }
  });
});
