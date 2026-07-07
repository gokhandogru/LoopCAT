const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const i18nDir = path.join(root, "i18n");
const sourcePath = path.join(i18nDir, "source.en-US.json");
const localeDir = path.join(i18nDir, "locales");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function jsString(value) {
  return JSON.stringify(value);
}

function writeSourceJs() {
  const source = readJson(sourcePath);
  const outPath = path.join(i18nDir, "source.en-US.js");
  const js = `window.CatHan = window.CatHan || {};\nwindow.CatHan.i18n.registerSource(${jsString(source)});\n`;
  fs.writeFileSync(outPath, js, "utf8");
  console.log(`Compiled ${path.relative(root, outPath)}.`);
}

function writeLocaleJs(filePath) {
  const catalog = readJson(filePath);
  const outPath = filePath.replace(/\.json$/i, ".js");
  const js = `window.CatHan = window.CatHan || {};\nwindow.CatHan.i18n.registerLocale(${jsString(catalog)});\n`;
  fs.writeFileSync(outPath, js, "utf8");
  console.log(`Compiled ${path.relative(root, outPath)}.`);
}

function main() {
  if (!fs.existsSync(sourcePath)) throw new Error("Run i18n:extract before i18n:compile.");
  if (!fs.existsSync(localeDir)) throw new Error("Run i18n:sync before i18n:compile.");
  writeSourceJs();
  fs.readdirSync(localeDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .forEach((name) => writeLocaleJs(path.join(localeDir, name)));
}

main();
