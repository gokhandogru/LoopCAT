const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../..");
const source = require("../../i18n/source.en-US.json");
const arabic = require("../../i18n/locales/ar.json");

function runtime() {
  const element = { nodeType: 1, querySelectorAll: () => [], hasAttribute: () => false };
  const guide = {
    setAttribute(_name, value) {
      this.href = value;
    }
  };
  const document = {
    documentElement: {},
    body: element,
    querySelectorAll: (selector) => (selector === ".workspace-guide-link" ? [guide] : []),
    createTreeWalker: () => ({ nextNode: () => null })
  };
  const window = { localStorage: { setItem() {} }, dispatchEvent() {} };
  const context = vm.createContext({
    window,
    document,
    Intl,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    CustomEvent: class {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), context);
  const i18n = window.CatHan.i18n;
  i18n.registerSource(source);
  i18n.registerLocale(arabic);
  i18n.setLocale("ar-EG");
  return { i18n, document, guide };
}

test("Arabic covers every source key and all six plural categories", () => {
  assert.deepEqual(Object.keys(arabic.messages).sort(), Object.keys(source.messages).sort());
  const { i18n, document } = runtime();
  assert.equal(i18n.getLocale(), "ar");
  assert.equal(document.documentElement.dir, "rtl");
  const counts = [0, 1, 2, 3, 11, 100, 102, 1.5];
  for (const [key, entry] of Object.entries(source.messages)) {
    assert.ok(arabic.messages[key]?.trim(), key);
    if (!entry.message.includes(", plural,")) continue;
    for (const category of new Intl.PluralRules("ar").resolvedOptions().pluralCategories) {
      assert.match(arabic.messages[key], new RegExp("\\b" + category + "\\s*\\{"), key + ":" + category);
    }
    for (const count of counts) {
      const output = i18n.t(key, {
        count,
        packages: count,
        resources: count,
        backups: count,
        keyword: "needle",
        resource: "resource",
        pair: "en → ar"
      });
      assert.doesNotMatch(output, /\{[^}]*\}|\b(?:plural|select)\b/, key + ":" + count);
      assert.match(output, /\p{Script=Arabic}/u, key + ":" + count);
    }
  }
  const suggestions = Object.keys(source.messages).find(
    (k) => source.messages[k].message === "{count, plural, one {# AI suggestion} other {# AI suggestions}}"
  );
  assert.equal(i18n.t(suggestions, { count: 2 }), "اقتراحان للذكاء الاصطناعي");
  assert.equal(
    i18n.t(suggestions, { count: 11 }),
    `${new Intl.NumberFormat("ar").format(11)} اقتراحًا للذكاء الاصطناعي`
  );
});

test("Arabic templates handle English inflections, empty optional fields, and composed status messages", () => {
  const { i18n } = runtime();
  for (const count of [1, 2, 11, 100]) {
    const output = i18n.source(`Pretranslated ${count} segment${count === 1 ? "" : "s"} at 95%+; Undo is available`);
    assert.match(output, /أُنجزت الترجمة الأولية/);
    assert.doesNotMatch(output, /[A-Za-z]|\{value/);
  }
  const status = i18n.source("Local save up to date · External backup not configured");
  assert.match(status, /الحفظ المحلي محدّث/);
  assert.doesNotMatch(status, /[A-Za-z]/);
  const backup = i18n.source(
    "This project is 7 days old and has no project package export yet. Export a portable project package so this work can be recovered outside this browser profile."
  );
  assert.doesNotMatch(backup, /[A-Za-z]|\{value/);
  assert.match(backup, /صدّر حزمة مشروع/);
  assert.equal(
    i18n.source(
      "Confirmed and locked segments are preserved. Existing target text is skipped unless overwrite is\n enabled."
    ),
    "تُحفظ المقاطع المؤكَّدة والمقفلة دون تغيير. يُتجاوز النص الهدف الموجود ما لم يُفعَّل الاستبدال."
  );
  assert.equal(i18n.source("Open project {value1}", { value1: "Open" }), "فتح المشروع Open");
  assert.equal(i18n.source("Minimize Project analysis"), "طي تحليل المشروع");
  assert.equal(i18n.source("1 TM"), "ذاكرات الترجمة: 1");
  assert.equal(
    i18n.source("A customer's arbitrary text and another sentence"),
    "A customer's arbitrary text and another sentence"
  );
  const metadata = "الإنجليزية (en) - ذاكرة الترجمة الرئيسية: My TM - 1 TM - 1 TB";
  assert.equal(i18n.source(metadata), metadata);
});

test("Arabic language names normalize without changing unknown non-Latin input", async () => {
  const { createLanguageInputService } = await import(
    pathToFileURL(path.join(root, "src/i18n/language-input-service.js"))
  );
  const { i18n } = runtime();
  const service = createLanguageInputService({
    entries: [
      ["ar", "Arabic"],
      ["en", "English"],
      ["pl", "Polish"]
    ],
    aliases: {},
    redact: String,
    localization: i18n,
    getLocale: () => "ar",
    getNavigatorLanguage: () => "ar",
    intl: Intl,
    escapeHtml: String,
    replaceSafeHtml() {}
  });
  assert.equal(service.normalizeInput("العربية"), "ar");
  assert.equal(service.normalizeInput("الْعَرَبِيَّة"), "ar");
  assert.equal(service.normalizeInput("الإنجليزية"), "en");
  assert.equal(service.normalizeInput("البولندية"), "pl");
  assert.equal(service.normalizeInput("لغة غير معروفة"), "لغة غير معروفة");
  assert.equal(service.normalizeInput("!!!"), "!!!");
  assert.equal(service.nameForUi("pl"), "البولندية");
});

test("Native menus and recovery dialogs use the shared Arabic catalog", () => {
  const { createNativeLocalization, UI_MESSAGES } = require("../../desktop/ui-localization.cjs");
  const catalogs = require("../../desktop/ui-catalogs.json");
  const native = createNativeLocalization(catalogs);
  native.setLocale("ar-SA");
  for (const text of UI_MESSAGES) assert.match(native.translate(text), /\p{Script=Arabic}/u, text);
  assert.equal(native.menu([{ label: "Edit", submenu: [{ role: "copy" }] }])[0].submenu[0].label, "نسخ");
  assert.equal(native.translate('Add "{word}" to dictionary', { word: "LoopCAT" }), "إضافة «LoopCAT» إلى القاموس");
  native.setLocale("en-US");
  assert.equal(native.translate("Copy"), "Copy");
});

test("Arabic help switches with the locale and desktop guide navigation is restricted", () => {
  const { i18n, guide } = runtime();
  assert.equal(guide.href, "./docs/beginner-guide/ar.html");
  i18n.setLocale("en-US");
  assert.equal(guide.href, "./docs/beginner-guide/index.html");
  const { APP_SCHEME, APP_HOST, isBundledGuideUrl } = require("../../desktop/main.cjs");
  const base = `${APP_SCHEME}://${APP_HOST}`;
  assert.equal(isBundledGuideUrl(base + "/docs/beginner-guide/ar.html#editor"), true);
  assert.equal(isBundledGuideUrl(base + "/docs/beginner-guide/index.html"), true);
  for (const url of [
    "https://example.com/docs/beginner-guide/ar.html",
    base + "/index.html",
    base + "/docs/beginner-guide/../../index.html",
    base + "/docs/beginner-guide/ar.html?script=1"
  ])
    assert.equal(isBundledGuideUrl(url), false, url);
});

test("Arabic diacritics stay attached in predictive completion and term capture", async () => {
  const { caretPrefix, prepareCompletionCandidates, completePrefix } = await import(
    pathToFileURL(path.join(root, "src/features/editor/predictive-typing-service.js"))
  );
  const text = "كِتاب";
  assert.equal(caretPrefix(text, text.length, "ar").text, text);
  const candidates = prepareCompletionCandidates({
    locale: "ar",
    termMatches: [{ sourceTerm: "book", targetTerm: "كِتابة", status: "preferred" }]
  });
  assert.equal(completePrefix({ prefix: text, locale: "ar", candidates })[0].insertion, "كِتابة");
  const { createQuickTermCaptureController } = await import(
    pathToFileURL(path.join(root, "src/features/editor/quick-term-capture-controller.js"))
  );
  const element = { addEventListener() {} };
  const controller = createQuickTermCaptureController({
    elements: { dialog: element, form: element, source: element, target: element, extras: element },
    session: { getProject() {}, getSegment() {} },
    resources: { links() {} },
    repository: { savePair() {} }
  });
  for (let caret = 1; caret < text.length; caret++)
    assert.equal(controller.wordAtCaret("هذا " + text + " جديد", 4 + caret), text);
});

test("Main-thread and worker QA recognize Arabic digits and punctuation without hiding numeric changes", () => {
  const context = vm.createContext({ window: { CatHan: {} }, self: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(root, "qa.js"), "utf8"), context);
  const main = context.window.CatHan.qa.runQaChecks;
  vm.runInContext(fs.readFileSync(path.join(root, "cat-worker.js"), "utf8"), context);
  const worker = context.runQaChecks;
  for (const run of [main, worker]) {
    for (const target of ["هل السعر ١٢٣٫٤٥؟", "هل السعر ۱۲۳٫۴۵؟"]) {
      const issues = run([{ id: "ar", source: "Is the price 123.45?", target }]);
      assert.equal(issues.filter((i) => ["number", "punctuation"].includes(i.type)).length, 0, target);
    }
    assert.equal(
      run([{ source: "Total 1,234.", target: "المجموع ١٬٢٣٤." }]).filter((i) => i.type === "number").length,
      0
    );
    assert.equal(
      run([{ source: "Price 123.45?", target: "هل السعر ١٢٤٫٤٥؟" }]).filter((i) => i.type === "number").length,
      1
    );
  }
});
