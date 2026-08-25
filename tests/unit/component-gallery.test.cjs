const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("the test-only component gallery covers the semantic component states", () => {
  const gallery = read("tests/component-gallery/index.html");
  const requiredStyles = ["tokens.css", "themes.css", "base.css", "components.css"];
  const requiredComponents = [
    "button",
    "field",
    "select",
    "menu",
    "status",
    "banner",
    "toast",
    "dialog",
    "quick-insert",
    "panel",
    "row",
    "ai-suggestion",
    "empty-state"
  ];

  assert.match(gallery, /data-component-gallery="loopcat"/);
  for (const style of requiredStyles) assert.match(gallery, new RegExp(`src/ui/${style.replace(".", "\\.")}`));
  for (const component of requiredComponents) {
    assert.match(gallery, new RegExp(`data-component="${component}"`), `missing ${component} gallery state`);
  }
  for (const state of ["primary", "secondary", "disabled", "icon"]) {
    assert.match(gallery, new RegExp(`data-state="${state}"`), `missing ${state} control state`);
  }
  assert.match(gallery, /role="status"/);
  assert.match(gallery, /role="alert"/);
  assert.match(gallery, /<dialog open/);
  assert.match(gallery, /Apply and next/);
  assert.match(gallery, /Your current project was preserved/);
});

test("the component gallery is excluded from web and desktop production entries", () => {
  const index = read("index.html");
  const productionAssets = read("config/production-assets.js");
  const packageManifest = JSON.parse(read("package.json"));
  const packagedFiles = packageManifest.build.files || [];

  assert.doesNotMatch(index, /component-gallery/i);
  assert.doesNotMatch(productionAssets, /component-gallery/i);
  assert.equal(
    packagedFiles.some((entry) => /^tests(?:\/|\\|$)/.test(entry)),
    false
  );
});
