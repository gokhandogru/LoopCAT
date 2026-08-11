const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
const failures = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : entry.isFile() && entry.name.endsWith(".js") ? [filePath] : [];
  });
}

for (const filePath of walk(sourceRoot)) {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  const source = fs.readFileSync(filePath, "utf8");
  const imports = Array.from(
    source.matchAll(/\b(?:import\s+(?:[^"']+?\s+from\s+)?|import\s*\()(["'])([^"']+)\1/g),
    (match) => match[2]
  );
  for (const specifier of imports) {
    const normalized = specifier.replaceAll("\\", "/");
    if (relativePath !== "src/entry/test.js" && /(?:^|\/)tests?(?:\/|$)|(?:^|\/)testing(?:\/|$)/i.test(normalized)) {
      failures.push(`${relativePath} imports test-only module ${specifier}`);
    }
    if (!relativePath.startsWith("src/entry/") && /(?:^|\/)app\.js$/i.test(normalized)) {
      failures.push(`${relativePath} imports the legacy application coordinator outside a renderer entry`);
    }
  }
}

if (failures.length) {
  console.error("Import-boundary verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Import-boundary verification passed.");
