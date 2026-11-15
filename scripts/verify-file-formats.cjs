/* Repeatable file-filter review: generated fixtures, real DOM/ZIP round trips and schema checks. */
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const checks = [
  ["--test", "tests/unit/bilingual-format-resources.test.cjs", "tests/unit/software-format-roundtrip.test.cjs", "tests/unit/po-placeholders.test.cjs", "tests/unit/po-export-placeholders.test.cjs", "tests/unit/tbx-concept-metadata.test.cjs", "tests/unit/localization-download-mime-type-service.test.cjs"],
  ["scripts/web-text-format-review.cjs"],
  ["scripts/verify-office-formatting.cjs"],
  ["scripts/office-resource-format-review.cjs"],
  ["scripts/bilingual-format-roundtrip.cjs"],
  ["scripts/software-format-roundtrip.cjs"],
  ["scripts/verify-xliff22-schema.cjs"],
  ["scripts/build-renderer.cjs"],
  ["scripts/verify-tmx-workflow.cjs"],
  ["scripts/verify-multilingual-excel-workflow.cjs"]
];
for (const args of checks) {
  console.log(`\nRunning ${args.join(" ")}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env, timeout: 300000 });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nFile-format verification passed.");
