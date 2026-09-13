const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("published version contract matches persistence schemas and current app labels", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const contract = vm.runInNewContext(
    read("src/config/version-contract.js").replace("export const VERSION_CONTRACT =", "")
  );
  const storage = read("storage.js");
  for (const [field, constant] of [
    ["localDatabaseSchema", "DB_VERSION"],
    ["defaultBackupSchema", "BACKUP_SCHEMA_VERSION"],
    ["projectPackageSchema", "PROJECT_PACKAGE_SCHEMA_VERSION"]
  ]) {
    assert.equal(contract[field], Number(storage.match(new RegExp(`const ${constant} = (\\d+);`))[1]), field);
  }
  const version = JSON.parse(read("package.json")).version;
  assert.equal(JSON.parse(read("manifest.webmanifest")).version, version);
  assert.ok(read("service-worker.js").includes(`const APP_VERSION = "${version}";`));
  assert.ok(read("config/production-assets.js").includes(`appVersion: "${version}"`));
  assert.ok(read("README.md").includes(`Version \`${version}\` is the current unsigned development preview`));
  assert.ok(read("docs/beginner-guide/index.html").includes(`Based on LoopCAT ${version}`));
  assert.ok(fs.existsSync(path.join(root, "docs/releases", `${version}.md`)));
});
