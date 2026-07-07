const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const i18nDir = path.join(root, "i18n");
const sourcePath = path.join(i18nDir, "source.en-US.json");
const localeDir = path.join(i18nDir, "locales");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceCatalog() {
  const source = readJson(sourcePath);
  if (!source?.messages) throw new Error("Run i18n:extract before i18n:sync.");
  return source;
}

function targetLocalesFromArgs() {
  const args = process.argv.slice(2);
  const locales = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--locale" && args[index + 1]) {
      locales.push(args[index + 1]);
      index += 1;
    }
  }
  return locales;
}

function existingLocaleFiles() {
  if (!fs.existsSync(localeDir)) return [];
  return fs.readdirSync(localeDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.basename(name, ".json"));
}

function syncLocale(locale, source) {
  const filePath = path.join(localeDir, `${locale}.json`);
  const current = readJson(filePath, { locale, messages: {} }) || { locale, messages: {} };
  const next = {
    locale,
    label: current.label || locale,
    dir: current.dir,
    messages: {}
  };
  Object.entries(source.messages).forEach(([key, entry]) => {
    const sourceText = String(entry.message || "");
    const existing = current.messages?.[key];
    if (locale === source.locale) {
      next.messages[key] = sourceText;
    } else if (typeof existing === "string") {
      next.messages[key] = existing;
    } else if (existing?.message) {
      next.messages[key] = String(existing.message);
    } else {
      next.messages[key] = "";
    }
  });
  if (!next.dir) delete next.dir;
  writeJson(filePath, next);
  console.log(`Synced ${path.relative(root, filePath)}.`);
}

function main() {
  const source = sourceCatalog();
  const requested = targetLocalesFromArgs();
  const locales = Array.from(new Set([source.locale, ...existingLocaleFiles(), ...requested]));
  locales.forEach((locale) => syncLocale(locale, source));
}

main();
