const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("locale loader resolves language fallbacks and loads only the active bundled locale", async () => {
  const { createLocaleLoader, matchingLocale } = await moduleAt("src/i18n/locale-loader.js");
  assert.equal(matchingLocale("tr"), "tr-TR");
  assert.equal(matchingLocale("ca-FR"), "ca-ES");
  const registered = [];
  const loaded = [];
  const loader = createLocaleLoader({
    i18n: { registerLocale: (catalog) => registered.push(catalog.locale) },
    browserWindow: {
      localStorage: { getItem: () => "tr" },
      navigator: { languages: ["en-US"] }
    },
    loaders: {
      "en-US": () => Promise.resolve(loaded.push("en-US")),
      "ca-ES": () => Promise.resolve(loaded.push("ca-ES")),
      "tr-TR": () => Promise.resolve(loaded.push("tr-TR"))
    }
  });
  assert.equal(await loader.initialize(), "tr-TR");
  assert.deepEqual(loaded, ["tr-TR"]);
  assert.deepEqual(registered, ["en-US", "ca-ES", "tr-TR"]);
});
