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

test("ambiguous percentages and PO game variables never swallow surrounding prose", () => {
  const { detectProtectedTags } = loadProtectedTags();
  for (const text of [
    "%0 bites %1's bait",
    "%0 eats too much of %1's cake",
    "%0 gets a fancy mask from %1",
    "%0 come demasiado del pastel de %1",
    "%1 indirim, %25 büyüme, %1,5 düşüş ve %1.5 artış",
    "%0bites %1discount %20discount",
    "100% complete, 50% done, %%s and %%1$s",
    "%1 %0 %02d %.2f %1.5f"
  ]) {
    assert.deepEqual(
      Array.from(detectProtectedTags(text, { format: "po" }), (tag) => tag.text),
      [],
      text
    );
  }
  assert.deepEqual(
    Array.from(detectProtectedTags("Hello %s: %1$s %(name)s {{user}}"), (tag) => tag.text),
    ["%s", "%1$s", "%(name)s", "{{user}}"]
  );
});

test("non-PO printf widths remain protected without consuming prose or bare percentages", () => {
  const { detectProtectedTags } = loadProtectedTags();
  for (const context of [undefined, { format: "json" }]) {
    assert.deepEqual(
      Array.from(detectProtectedTags("%02d %.2f %1$s", context), (tag) => tag.text),
      ["%02d", "%.2f", "%1$s"]
    );
    assert.deepEqual(
      Array.from(
        detectProtectedTags("%0 bites %1's bait, %1 indirim %1,5 %0bites %1discount 100% complete", context),
        (tag) => tag.text
      ),
      []
    );
  }
});

test("declared PO printf grammars preserve valid width, space, precision and positional arguments", () => {
  const { detectProtectedTags } = loadProtectedTags();
  const cases = [
    [
      "c-format",
      "%0 e %02d %1$s %2$*3$.*4$f %zu %lld %.2f %%s",
      ["%0 e", "%02d", "%1$s", "%2$*3$.*4$f", "%zu", "%lld", "%.2f"]
    ],
    ["objc-format", "%@ %1$@ %02d", ["%@", "%1$@", "%02d"]],
    ["python-format", "%(user)s %(amount)08.2f % d %r %%s", ["%(user)s", "%(amount)08.2f", "% d", "%r"]],
    ["qt-format", "%1 bites %2's bait; %L99 %0 %100", ["%1", "%2", "%L99"]],
    ["qt-plural-format", "%n files (%Ln)", ["%n", "%Ln"]]
  ];
  for (const [flag, text, expected] of cases) {
    const detected = detectProtectedTags(text, { format: "po", formatFlags: [flag] });
    assert.deepEqual(
      Array.from(detected, (tag) => tag.text),
      expected,
      flag
    );
    for (const tag of detected) assert.equal(text.slice(tag.index, tag.index + tag.text.length), tag.text);
  }
});

test("negative and unsupported format declarations never enable another percent dialect", () => {
  const { detectProtectedTags } = loadProtectedTags();
  const detect = (text, flags) =>
    Array.from(detectProtectedTags(text, { format: "po", formatFlags: flags }), (tag) => tag.text);
  assert.deepEqual(detect("%s %1 %02d {{name}}", ["no-c-format"]), ["{{name}}"]);
  assert.deepEqual(detect("%s %02d", ["c-format", "no-c-format"]), []);
  assert.deepEqual(detect("%s %1 %(name)s", ["lisp-format"]), []);
  assert.deepEqual(detect("%1 %s %02d", ["possible-c-format"]), ["%s"]);
  assert.deepEqual(detect("%(name)s %1", ["python-format", "no-c-format"]), ["%(name)s"]);
  assert.deepEqual(detect("%1 %s", ["qt-format", "no-c-format"]), ["%1"]);
});

test("worker QA shares PO detection and exact token counts", () => {
  const runtime = vm.createContext({ self: { addEventListener() {} } });
  for (const name of ["linguistic-core.js", "statistics-core.js", "protected-tags.js", "cat-worker.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), runtime);
  }
  const segment = {
    source: "%0 bites %1's bait",
    target: "%0 muerde el anzuelo de %1",
    tags: [{ text: "%0 b" }],
    structure: { format: "po" }
  };
  assert.equal(runtime.missingTags(segment).length, 0);
  const qt = { source: "%1 %1", target: "%10 %1", structure: { format: "po", formatFlags: ["qt-format"] } };
  assert.deepEqual(
    Array.from(runtime.missingTags(qt), (tag) => tag.text),
    ["%1"]
  );
});
