const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "i18n", "source.en-US.json");
const indexPath = path.join(root, "index.html");
const appPath = path.join(root, "app.js");
const qaPath = path.join(root, "qa.js");

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
  return content.replace(/\$\{[^}]+\}/g, () => {
    index += 1;
    return `{value${index}}`;
  }).replace(/\\`/g, "`").replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\"/g, '"');
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
  const message = String(text || "").replace(/\s+/g, " ").trim();
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
  const app = full.split("async function runAppWorkflowTest()")[0] || full;
  const lines = app.split(/\r?\n/);
  const stringPattern = /(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
  lines.forEach((line, index) => {
    const location = `${sourceName}:${index + 1}`;
    const likelyUiLine = /uiSource\(|reportText\(|reportHtml\(|textContent\s*=|innerHTML\s*=|setSaveStatus\(|setLocalAiStatus\(|window\.confirm\(|confirmExternalAiPromptShare\(|new Error\(|throw new Error\(|message:|fixHint:|label:|title:|aria-label|placeholder|button\.textContent|option\.textContent|return \{|\[/.test(line);
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

  const existing = existingMessages();
  const existingByMessage = new Map(Object.entries(existing).map(([key, entry]) => [String(entry.message || entry), key]));
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
