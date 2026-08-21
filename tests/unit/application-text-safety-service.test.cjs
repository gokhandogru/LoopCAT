const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const SENSITIVE_PATTERN =
  /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-text-safety-service.js")).href);
}

function createService(createApplicationTextSafetyService, pattern = SENSITIVE_PATTERN) {
  return createApplicationTextSafetyService({ patterns: { sensitiveValue: pattern } });
}

test("ApplicationTextSafetyService preserves every stable lowercasing branch and immutable API", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  assert.equal(Object.isFrozen(service), true);
  for (const [value, expected] of [
    [undefined, ""],
    [null, ""],
    [false, ""],
    [0, ""],
    [Number.NaN, ""],
    [42, "42"],
    [" Mixed CASE ", " mixed case "],
    ["Iİıi", "ii̇ıi"]
  ]) {
    assert.equal(service.stableLower(value), expected);
  }
});

test("ApplicationTextSafetyService recreates global case-insensitive redaction on every call", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const injected = /token-[a-z0-9]{4}/gy;
  injected.lastIndex = 7;
  const service = createService(createApplicationTextSafetyService, injected);
  assert.equal(service.redactSensitiveText("TOKEN-ab12 then token-cd34"), "[redacted secret] then [redacted secret]");
  assert.equal(service.redactSensitiveText("token-ef56"), "[redacted secret]");
  assert.equal(injected.lastIndex, 7);
  assert.equal(service.redactSensitiveText(0), "");
});

test("ApplicationTextSafetyService preserves ordered HTML escaping and falsy coercion", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  assert.equal(service.escapeHtml(`&<>"`), "&amp;&lt;&gt;&quot;");
  assert.equal(service.escapeHtml("&amp;"), "&amp;amp;");
  assert.equal(service.escapeHtml(27), "27");
  assert.equal(service.escapeHtml(0), "");
  assert.equal(service.escapeHtml(null), "");
});

test("ApplicationTextSafetyService preserves safe-text trimming redaction and fallback timing", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  assert.equal(service.displaySafeText("  visible text  ", "fallback"), "visible text");
  assert.equal(service.displaySafeText("  ", " fallback untouched "), " fallback untouched ");
  assert.equal(service.displaySafeText(null, 17), 17);
  assert.equal(service.displaySafeText(" Bearer abcdefghijkl ", "fallback"), "[redacted secret]");
});

test("ApplicationTextSafetyService composes safe HTML through exact text and escape policy", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  assert.equal(
    service.displaySafeHtml(` <Bearer abcdefghijkl & "label"> `),
    "&lt;[redacted secret] &amp; &quot;label&quot;&gt;"
  );
  assert.equal(service.displaySafeHtml("", "<fallback>"), "&lt;fallback&gt;");
  assert.equal(service.displaySafeHtml("", 0), "");
});

test("ApplicationTextSafetyService preserves Unicode file stems redaction and fallback", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  for (const [value, expected] of [
    [undefined, "export"],
    [null, "export"],
    ["", "export"],
    ["   ", "export"],
    ["Türkçe proje 2026.xlf", "Türkçe_proje_2026_xlf"],
    ["日本語-δοκιμή", "日本語-δοκιμή"],
    ["a___b...c", "a_b_c"],
    ["Bearer abcdefghijkl.txt", "_redacted_secret_"]
  ]) {
    assert.equal(service.fileSafeName(value), expected);
  }
});

test("ApplicationTextSafetyService preserves every regular-expression metacharacter escape", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  const service = createService(createApplicationTextSafetyService);
  const metacharacters = ".*+?^${}()|[]\\";
  assert.equal(service.escapeRegExp(metacharacters), "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  assert.equal(service.escapeRegExp("plain-text"), "plain-text");
  assert.equal(service.escapeRegExp(0), "");
});

test("ApplicationTextSafetyService validates its sensitive-value pattern boundary", async () => {
  const { createApplicationTextSafetyService } = await loadFactory();
  for (const patterns of [undefined, null, {}, { sensitiveValue: null }, { sensitiveValue: "secret" }]) {
    assert.throws(() => createApplicationTextSafetyService({ patterns }), /checked sensitive-value pattern/);
  }
});
