const { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { runInThisContext } = require("node:vm");

const root = resolve(__dirname, "..");
const schemaPath = join(root, "tests", "schemas", "xliff-2.2", "xliff_core_2.2.xsd");
const fixtureDirectory = join(root, "tests", "fixtures", "xliff-2.2");
const fixtureDocuments = process.argv.slice(2).length
  ? process.argv.slice(2).map((item) => resolve(root, item))
  : readdirSync(fixtureDirectory)
      .filter((item) => item.toLowerCase().endsWith(".xlf") || item.toLowerCase().endsWith(".xliff"))
      .sort()
      .map((item) => join(fixtureDirectory, item));

if (!fixtureDocuments.length) {
  console.error("No XLIFF 2.2 fixtures were found.");
  process.exit(1);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "loopcat-xliff22-schema-"));
const generatedDocument = join(temporaryDirectory, "loopcat-generated-2.2.xlf");
global.window = { CatHan: {} };
runInThisContext(readFileSync(join(root, "xliff.js"), "utf8"), { filename: join(root, "xliff.js") });
writeFileSync(generatedDocument, global.window.CatHan.xliff.buildXliff22({
  name: "schema-generated.html",
  sourceLang: "en",
  targetLang: "tr"
}, [{
  id: "schema-generated-1",
  source: "Open <b>file</b><br/>",
  target: "Dosyayi <b>ac</b><br/>",
  status: "confirmed"
}]), "utf8");
const documents = [...fixtureDocuments, generatedDocument];

const executable = process.platform === "win32" ? "powershell.exe" : "pwsh";
const args = process.platform === "win32"
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
  : ["-NoProfile", "-File"];
const result = spawnSync(executable, [
  ...args,
  join(__dirname, "verify-xliff22-schema.ps1"),
  "-SchemaPath",
  schemaPath,
  ...documents
], { cwd: root, encoding: "utf8" });

rmSync(temporaryDirectory, { recursive: true, force: true });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error(`Unable to run ${executable}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
