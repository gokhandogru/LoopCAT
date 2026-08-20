const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "i18n", "source.en-US.json");
const indexPath = path.join(root, "index.html");
const appPath = path.join(root, "app.js");
const qaPath = path.join(root, "qa.js");
const deliveryExportControllerPath = path.join(
  root,
  "src",
  "features",
  "import-export",
  "delivery-export-controller.js"
);
const projectResourceTransferControllerPath = path.join(
  root,
  "src",
  "features",
  "import-export",
  "project-resource-transfer-controller.js"
);
const resourceLibraryImportControllerPath = path.join(
  root,
  "src",
  "features",
  "resources",
  "resource-library-import-controller.js"
);
const resourceLibraryExportControllerPath = path.join(
  root,
  "src",
  "features",
  "resources",
  "resource-library-export-controller.js"
);
const resourcesPresentationServicePath = path.join(
  root,
  "src",
  "features",
  "resources",
  "resources-presentation-service.js"
);
const resourceCatalogServicePath = path.join(root, "src", "features", "resources", "resource-catalog-service.js");
const projectResourceSelectionControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-resource-selection-controller.js"
);
const projectLanguagePairShortcutsControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-language-pair-shortcuts-controller.js"
);
const projectLanguageContextControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-language-context-controller.js"
);
const projectDocumentStatisticsServicePath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-document-statistics-service.js"
);
const projectDocumentCatalogServicePath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-document-catalog-service.js"
);
const textEncodingInputServicePath = path.join(
  root,
  "src",
  "features",
  "import-export",
  "text-encoding-input-service.js"
);
const protectedTagInspectionServicePath = path.join(
  root,
  "src",
  "features",
  "editor",
  "protected-tag-inspection-service.js"
);
const protectedTextReplacementServicePath = path.join(
  root,
  "src",
  "features",
  "editor",
  "protected-text-replacement-service.js"
);
const segmentProvenanceServicePath = path.join(root, "src", "features", "editor", "segment-provenance-service.js");
const segmentFilterServicePath = path.join(root, "src", "features", "editor", "segment-filter-service.js");
const segmentProgressServicePath = path.join(root, "src", "features", "editor", "segment-progress-service.js");
const segmentTargetStateServicePath = path.join(root, "src", "features", "editor", "segment-target-state-service.js");
const segmentCommandRestorationControllerPath = path.join(
  root,
  "src",
  "features",
  "editor",
  "segment-command-restoration-controller.js"
);
const segmentConfirmationStateServicePath = path.join(
  root,
  "src",
  "features",
  "editor",
  "segment-confirmation-state-service.js"
);
const segmentTmSaveControllerPath = path.join(root, "src", "features", "editor", "segment-tm-save-controller.js");
const concordanceControllerPath = path.join(root, "src", "features", "editor", "concordance-controller.js");
const qualityPresentationServicePath = path.join(root, "src", "features", "quality", "quality-presentation-service.js");
const segmentNavigationControllerPath = path.join(
  root,
  "src",
  "features",
  "editor",
  "segment-navigation-controller.js"
);
const segmentDraftApplicationServicePath = path.join(
  root,
  "src",
  "features",
  "editor",
  "segment-draft-application-service.js"
);
const languageInputServicePath = path.join(root, "src", "i18n", "language-input-service.js");
const resourceMutationControllerPath = path.join(
  root,
  "src",
  "features",
  "resources",
  "resource-mutation-controller.js"
);
const reportPresentationPath = path.join(root, "src", "reports", "report-presentation-service.js");
const reportDocumentCompositionPath = path.join(root, "src", "reports", "report-document-composition-service.js");
const reportExportControllerPath = path.join(root, "src", "reports", "report-export-controller.js");

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function hash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function slug(value) {
  const clean = String(value || "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 42);
  return clean || "message";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeJsString(raw) {
  try {
    return Function(`"use strict"; return (${raw});`)();
  } catch {
    return "";
  }
}

function templateMessage(raw) {
  const content = raw.slice(1, -1);
  let index = 0;
  return content
    .replace(/\$\{[^}]+\}/g, () => {
      index += 1;
      return `{value${index}}`;
    })
    .replace(/\\`/g, "`")
    .replace(/\\n/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"');
}

function looksHuman(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 500) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^(https?:|data:|blob:|\.\/|\/|\#|\.)/.test(text)) return false;
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return false;
  if (/\$\{[^}]*\}/.test(text)) return false;
  if (/\b(?:function|const|let|var|return|=>|querySelector|classList|dataset)\b/.test(text)) return false;
  if (/[\[\]{}()]/.test(text) && /(?:=>|=|;|::|\.map|\.filter|\.join|data-|class=|id=)/.test(text)) return false;
  if (/^\[[^\]]+\](?::(?:checked|disabled|focus))?$/i.test(text)) return false;
  if (/^[.#]?[a-z0-9_-]+$/i.test(text) && /[-_]/.test(text) && !/\s/.test(text)) return false;
  if (/^[a-z][a-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/.test(text)) return false;
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(js|css|html|json|xml|docx|tmx|tbx|xlf|xliff|txt|md|png|svg|ico)$/i.test(text)) return false;
  if (/^[A-Z_]{3,}$/.test(text)) return false;
  return true;
}

function add(messagesByText, text, description, location) {
  const message = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!looksHuman(message)) return;
  if (!messagesByText.has(message)) {
    messagesByText.set(message, { description, locations: [] });
  }
  const entry = messagesByText.get(message);
  if (description && !entry.description) entry.description = description;
  if (location && !entry.locations.includes(location)) entry.locations.push(location);
}

function extractHtml(messagesByText) {
  const html = read(indexPath);
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<template[\s\S]*?<\/template>/gi, "");
  for (const match of withoutScripts.matchAll(/>([^<>]+)</g)) {
    add(messagesByText, decodeHtml(match[1]), "Static interface text from index.html.", "index.html");
  }
  for (const match of withoutScripts.matchAll(/\s(placeholder|title|aria-label)="([^"]+)"/g)) {
    add(messagesByText, decodeHtml(match[2]), `Static ${match[1]} attribute from index.html.`, "index.html");
  }
}

function extractHtmlTemplateText(messagesByText, value, location, sourceName = "app.js") {
  for (const match of value.matchAll(/>([^<>]+)</g)) {
    add(messagesByText, decodeHtml(match[1]), `Generated interface text from ${sourceName} HTML template.`, location);
  }
}

function extractScript(messagesByText, filePath, sourceName) {
  const full = read(filePath);
  const lines = full.split(/\r?\n/);
  const stringPattern = /(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
  lines.forEach((line, index) => {
    const location = `${sourceName}:${index + 1}`;
    const likelyUiLine =
      /uiSource\(|uiLocalizationService\.(?:source|sourceHtml|confirm|alert)\(|localization\.source(?:Html)?\(|reportText\(|reportHtml\(|textContent\s*=|innerHTML\s*=|setSaveStatus\(|setLocalAiStatus\(|window\.confirm\(|confirmExternalAiPromptShare\(|new Error\(|throw new Error\(|message:|fixHint:|label:|title:|aria-label|placeholder|button\.textContent|option\.textContent|return \{|\[/.test(
        line
      );
    if (!likelyUiLine) return;
    for (const match of line.matchAll(stringPattern)) {
      const raw = match[0];
      const quote = raw[0];
      const value = quote === "`" ? templateMessage(raw) : decodeJsString(raw);
      if (quote === "`" && /<[^>]+>/.test(value)) extractHtmlTemplateText(messagesByText, value, location, sourceName);
      add(messagesByText, value, `Generated interface text from ${sourceName}.`, location);
    }
  });
}

function existingMessages() {
  if (!fs.existsSync(sourcePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(sourcePath, "utf8")).messages || {};
  } catch {
    return {};
  }
}

function main() {
  const messagesByText = new Map();
  extractHtml(messagesByText);
  extractScript(messagesByText, appPath, "app.js");
  extractScript(messagesByText, qaPath, "qa.js");
  extractScript(
    messagesByText,
    deliveryExportControllerPath,
    "src/features/import-export/delivery-export-controller.js"
  );
  extractScript(
    messagesByText,
    projectResourceTransferControllerPath,
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  extractScript(
    messagesByText,
    resourceLibraryImportControllerPath,
    "src/features/resources/resource-library-import-controller.js"
  );
  extractScript(
    messagesByText,
    resourceLibraryExportControllerPath,
    "src/features/resources/resource-library-export-controller.js"
  );
  extractScript(
    messagesByText,
    resourcesPresentationServicePath,
    "src/features/resources/resources-presentation-service.js"
  );
  extractScript(messagesByText, resourceCatalogServicePath, "src/features/resources/resource-catalog-service.js");
  extractScript(
    messagesByText,
    projectResourceSelectionControllerPath,
    "src/features/projects/project-resource-selection-controller.js"
  );
  extractScript(
    messagesByText,
    projectLanguagePairShortcutsControllerPath,
    "src/features/projects/project-language-pair-shortcuts-controller.js"
  );
  extractScript(
    messagesByText,
    projectLanguageContextControllerPath,
    "src/features/projects/project-language-context-controller.js"
  );
  extractScript(
    messagesByText,
    projectDocumentStatisticsServicePath,
    "src/features/projects/project-document-statistics-service.js"
  );
  extractScript(
    messagesByText,
    projectDocumentCatalogServicePath,
    "src/features/projects/project-document-catalog-service.js"
  );
  extractScript(
    messagesByText,
    textEncodingInputServicePath,
    "src/features/import-export/text-encoding-input-service.js"
  );
  extractScript(
    messagesByText,
    protectedTagInspectionServicePath,
    "src/features/editor/protected-tag-inspection-service.js"
  );
  extractScript(
    messagesByText,
    protectedTextReplacementServicePath,
    "src/features/editor/protected-text-replacement-service.js"
  );
  extractScript(messagesByText, segmentProvenanceServicePath, "src/features/editor/segment-provenance-service.js");
  extractScript(messagesByText, segmentFilterServicePath, "src/features/editor/segment-filter-service.js");
  extractScript(messagesByText, segmentProgressServicePath, "src/features/editor/segment-progress-service.js");
  extractScript(messagesByText, segmentTargetStateServicePath, "src/features/editor/segment-target-state-service.js");
  extractScript(
    messagesByText,
    segmentCommandRestorationControllerPath,
    "src/features/editor/segment-command-restoration-controller.js"
  );
  extractScript(
    messagesByText,
    segmentConfirmationStateServicePath,
    "src/features/editor/segment-confirmation-state-service.js"
  );
  extractScript(messagesByText, segmentTmSaveControllerPath, "src/features/editor/segment-tm-save-controller.js");
  extractScript(messagesByText, concordanceControllerPath, "src/features/editor/concordance-controller.js");
  extractScript(messagesByText, qualityPresentationServicePath, "src/features/quality/quality-presentation-service.js");
  extractScript(
    messagesByText,
    segmentNavigationControllerPath,
    "src/features/editor/segment-navigation-controller.js"
  );
  extractScript(
    messagesByText,
    segmentDraftApplicationServicePath,
    "src/features/editor/segment-draft-application-service.js"
  );
  extractScript(messagesByText, languageInputServicePath, "src/i18n/language-input-service.js");
  extractScript(
    messagesByText,
    resourceMutationControllerPath,
    "src/features/resources/resource-mutation-controller.js"
  );
  extractScript(messagesByText, reportPresentationPath, "src/reports/report-presentation-service.js");
  extractScript(messagesByText, reportDocumentCompositionPath, "src/reports/report-document-composition-service.js");
  extractScript(messagesByText, reportExportControllerPath, "src/reports/report-export-controller.js");

  const existing = existingMessages();
  const existingByMessage = new Map(
    Object.entries(existing).map(([key, entry]) => [String(entry.message || entry), key])
  );
  const messages = { ...existing };
  for (const [message, info] of messagesByText.entries()) {
    const key = existingByMessage.get(message) || `auto.${slug(message)}.${hash(message)}`;
    const existingEntry = messages[key] || {};
    messages[key] = {
      message,
      description: existingEntry.description || info.description || "",
      locations: Array.from(new Set([...(existingEntry.locations || []), ...info.locations])).sort()
    };
  }

  const sorted = Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, `${JSON.stringify({ locale: "en-US", messages: sorted }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(root, sourcePath)} with ${Object.keys(sorted).length} source messages.`);
}

main();
