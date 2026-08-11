const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const defaultContract = JSON.parse(fs.readFileSync(path.join(__dirname, "bundle-contract.json"), "utf8"));

function occurrences(text, marker) {
  if (!marker) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }
  return count;
}

function inspectBundleContract(contract = defaultContract, baseDir = root) {
  const failures = [];
  const measurements = {};
  for (const relativePath of contract.productionFiles || []) {
    const filePath = path.join(baseDir, relativePath);
    if (!fs.existsSync(filePath)) {
      failures.push(`Missing production source: ${relativePath}`);
      continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    measurements[relativePath] = { bytes: Buffer.byteLength(text) };
    for (const marker of contract.forbiddenMarkers || []) {
      if (text.includes(marker)) failures.push(`${relativePath} contains forbidden production marker ${JSON.stringify(marker)}.`);
    }
    const expectedMarkers = contract.knownMarkers?.[relativePath] || {};
    for (const [marker, expected] of Object.entries(expectedMarkers)) {
      const actual = occurrences(text, marker);
      measurements[relativePath].markers = measurements[relativePath].markers || {};
      measurements[relativePath].markers[marker] = actual;
      if (actual !== expected) {
        failures.push(`${relativePath} marker ${JSON.stringify(marker)} changed from the characterized count ${expected} to ${actual}.`);
      }
    }
  }
  return { failures, measurements, mode: contract.mode };
}

function main() {
  const result = inspectBundleContract();
  if (result.failures.length) {
    console.error(result.failures.join("\n"));
    process.exit(1);
  }
  console.log(`Bundle contract verification passed (${result.mode}).`);
  if (result.mode === "source-test-isolated") {
    console.log("The source test driver is characterized; verify:renderer enforces its absence from production artifacts.");
  }
}

if (require.main === module) main();

module.exports = { inspectBundleContract, occurrences };
