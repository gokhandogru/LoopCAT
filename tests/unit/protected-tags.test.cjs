const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");

function loadProtectedTags() {
  const browserWindow = { CatHan: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "protected-tags.js"), "utf8"), { window: browserWindow });
  return browserWindow.CatHan.protectedTags;
}

test("protected-tag detector preserves semantic, generic, variable, placeholder, and overlap behavior", () => {
  const protectedTags = loadProtectedTags();
  const detected = protectedTags.detectProtectedTags(
    '<strong class="lead">One</strong> <g id="fmt1">Two</g> {{user.name}} %1$s &amp;'
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(detected.map(({ id, text, type, label }) => ({ id, text, type, label })))),
    [
      { id: "tag-1", text: '<strong class="lead">', type: "tag", label: "<b>" },
      { id: "tag-2", text: "</strong>", type: "tag", label: "</b>" },
      { id: "tag-3", text: '<g id="fmt1">', type: "tag", label: "<g1>" },
      { id: "tag-4", text: "</g>", type: "tag", label: "</g1>" },
      { id: "tag-5", text: "{{user.name}}", type: "variable", label: "{{user.name}}" },
      { id: "tag-6", text: "%1$s", type: "placeholder", label: "%1$s" },
      { id: "tag-7", text: "&amp;", type: "placeholder", label: "&amp;" }
    ]
  );
});

test("protected-tag detector keeps synchronous deterministic compatibility behavior", () => {
  const protectedTags = loadProtectedTags();
  const first = protectedTags.detectProtectedTags("Use ${account} and [USER_ID].");
  const second = protectedTags.detectProtectedTags("Use ${account} and [USER_ID].");

  assert.equal(first instanceof Promise, false);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(typeof protectedTags.detectProtectedTags, "function");
});
