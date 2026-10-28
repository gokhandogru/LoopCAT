const assert = require("node:assert/strict");
const test = require("node:test");
const source = require("../../i18n/source.en-US.json").messages;
const draft = require("../../i18n/locales/es-ES.json");
const catalogs = require("../../desktop/ui-catalogs.json");
const { createNativeLocalization, UI_MESSAGES } = require("../../desktop/ui-localization.cjs");

function placeholders(message) {
  return new Set(Array.from(message.matchAll(/\{([\w.-]+)(?:\s*,[^}]*)?\}/g), (match) => match[1]));
}

test("Spanish catalog preserves source placeholders and native messages are complete", () => {
  assert.equal(draft.locale, "es-ES");
  assert.deepEqual(Object.keys(draft.messages).sort(), Object.keys(source).sort());
  for (const [key, translated] of Object.entries(draft.messages)) {
    assert.ok(source[key], key);
    assert.ok(translated.trim(), key);
    assert.deepEqual(placeholders(translated), placeholders(source[key].message), key);
  }
  for (const message of UI_MESSAGES) assert.ok(catalogs["es-ES"][message], message);
  const native = createNativeLocalization(catalogs);
  assert.equal(native.setLocale("es-ES"), "es-ES");
  assert.equal(native.translate("File"), "Archivo");
  assert.equal(native.translate('Add "{word}" to dictionary', { word: "árbol" }), "Añadir «árbol» al diccionario");
});
