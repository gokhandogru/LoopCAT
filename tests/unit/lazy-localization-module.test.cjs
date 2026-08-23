const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("lazy localization installs the mutable two-method compatibility facade", async () => {
  const { installLazyLocalizationModule } = await moduleAt(
    "src/features/import-export/install-lazy-localization-module.js"
  );
  const browserWindow = { CatHan: {} };
  const installation = installLazyLocalizationModule(browserWindow, { load() {} });

  assert.equal(browserWindow.CatHan.localization, installation.module);
  assert.deepEqual(Object.keys(installation.module), ["parseLocalizationFile", "buildLocalizationFile"]);
  assert.equal(typeof installation.module.parseLocalizationFile, "function");
  assert.equal(typeof installation.module.buildLocalizationFile, "function");
  assert.equal(Object.isFrozen(installation.module), false);
  const originalBuilder = installation.module.buildLocalizationFile;
  installation.module.buildLocalizationFile = () => "test override";
  assert.equal(installation.module.buildLocalizationFile(), "test override");
  installation.module.buildLocalizationFile = originalBuilder;
  assert.equal(Object.isFrozen(installation), true);
});

test("lazy localization shares one concurrent load and preserves delegate receivers, arguments, and results", async () => {
  const { installLazyLocalizationModule } = await moduleAt(
    "src/features/import-export/install-lazy-localization-module.js"
  );
  const browserWindow = { CatHan: {} };
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const installation = installLazyLocalizationModule(browserWindow, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const calls = [];
  const parseResult = { documentType: "json" };
  const buildResult = { content: "translated" };
  const implementation = {
    parseLocalizationFile(...args) {
      calls.push(["parseLocalizationFile", this, args]);
      return parseResult;
    },
    buildLocalizationFile(...args) {
      calls.push(["buildLocalizationFile", this, args]);
      return buildResult;
    }
  };

  const parsed = installation.module.parseLocalizationFile({ name: "messages.json" }, { encoding: "utf-8" });
  const built = installation.module.buildLocalizationFile("json", [{ target: "Merhaba" }], { format: "json" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  browserWindow.CatHan.localization = implementation;
  resolveLoad();

  assert.equal(await parsed, parseResult);
  assert.equal(await built, buildResult);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === implementation, args]),
    [
      ["parseLocalizationFile", true, [{ name: "messages.json" }, { encoding: "utf-8" }]],
      ["buildLocalizationFile", true, ["json", [{ target: "Merhaba" }], { format: "json" }]]
    ]
  );
  assert.equal(await installation.load(), implementation);
  assert.equal(loadCount, 1);
});

test("lazy localization propagates load failure identity and retries the next first use", async () => {
  const { installLazyLocalizationModule } = await moduleAt(
    "src/features/import-export/install-lazy-localization-module.js"
  );
  const browserWindow = { CatHan: {} };
  const expectedError = new Error("localization chunk unavailable");
  let loadCount = 0;
  const installation = installLazyLocalizationModule(browserWindow, {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      browserWindow.CatHan.localization = {
        parseLocalizationFile: () => "ready",
        buildLocalizationFile: () => "ready"
      };
    }
  });

  await assert.rejects(installation.module.parseLocalizationFile({}), (error) => error === expectedError);
  assert.equal(await installation.module.parseLocalizationFile({}), "ready");
  assert.equal(loadCount, 2);
});

test("lazy localization rejects incomplete installation and permits a repaired retry", async () => {
  const { installLazyLocalizationModule } = await moduleAt(
    "src/features/import-export/install-lazy-localization-module.js"
  );
  const browserWindow = { CatHan: {} };
  let loadCount = 0;
  const installation = installLazyLocalizationModule(browserWindow, {
    load() {
      loadCount += 1;
      browserWindow.CatHan.localization =
        loadCount === 1
          ? { parseLocalizationFile() {} }
          : { parseLocalizationFile: () => "ready", buildLocalizationFile: () => "ready" };
    }
  });

  await assert.rejects(installation.module.buildLocalizationFile("json", []), /did not install its implementation/);
  assert.equal(await installation.module.buildLocalizationFile("json", []), "ready");
  assert.equal(loadCount, 2);
});

test("lazy localization validates namespace and loader boundaries", async () => {
  const { installLazyLocalizationModule } = await moduleAt(
    "src/features/import-export/install-lazy-localization-module.js"
  );
  assert.throws(() => installLazyLocalizationModule({}), /requires the LoopCAT compatibility namespace/);
  assert.throws(() => installLazyLocalizationModule({ CatHan: {} }, { load: false }), /requires a load function/);
});
