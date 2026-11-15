const fs = require("node:fs");
const path = require("node:path");

const FILES = [
  "resource-ui.js",
  "resource-library-controller.js",
  "resource-editor-composition.js",
  "resource-import-dialog.js",
  "resource-transfer-service.js",
  "resource-query-service.js",
  "resource-query-worker-runtime.js",
  "resource-edit-repository.js"
];
const INTERNAL = new Set([
  "AbortError",
  "Error",
  "TypeError",
  "Enter",
  "AltGraph",
  "Control+S Meta+S",
  "Control+Enter Meta+Enter",
  "Ctrl/Cmd+S",
  "Column",
  "Relationship",
  "Id",
  "TargetMode",
  "External",
  "StorageConflictError",
  "OperationStoppedError",
  "Unrecognized bundled worker."
]);

// The resource UI uses small DOM helpers rather than HTML templates. Keep this
// extraction scoped to those modules; identifiers and dynamic user data are not
// catalog messages. Source modules use JSON-compatible double-quoted literals.
function collectResourceMessages(root) {
  const messages = new Map();
  for (const file of FILES) {
    const relative = `src/features/resources/${file}`;
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    for (const match of source.matchAll(/(["'])(?:\\.|(?!\1)[^\r\n\\])*\1/g)) {
      let text;
      try {
        text =
          match[1] === '"'
            ? JSON.parse(match[0]).trim()
            : match[0]
                .slice(1, -1)
                .replace(/\\(['"\\])/g, "$1")
                .trim();
      } catch {
        continue;
      }
      const directTranslation = /\bt\(\s*$/.test(source.slice(Math.max(0, match.index - 30), match.index));
      const message =
        directTranslation ||
        /^[A-Z][a-z]/.test(text) ||
        (/^[A-Z]{2,4}$/.test(text) && ["TMX", "TBX", "CSV", "TSV", "QA"].includes(text));
      if (
        message &&
        !INTERNAL.has(text) &&
        !/^(?:ResourceEditRepository|Resource queries|Resource transfer).*require/.test(text)
      ) {
        if (!messages.has(text)) messages.set(text, new Set());
        messages.get(text).add(relative);
      }
    }
  }
  for (const message of [
    "Column {number}",
    "Could not parse {label}.",
    "{label} must not contain a document type declaration.",
    "Export format",
    "Choose an export format.",
    "completed",
    "partial",
    "cancelled",
    "failed",
    "undone"
  ]) {
    messages.set(message, new Set(["src/features/resources/"]));
  }
  return messages;
}

module.exports = { collectResourceMessages };
