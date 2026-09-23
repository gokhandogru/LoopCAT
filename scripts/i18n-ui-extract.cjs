const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");

// Syntax-based extraction covers multiline UI messages and newly added modules.
// Developer contract errors and model instructions are not interface messages.
function collectUiMessages(root) {
  const found = new Map();
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".js")) files.push(file);
    }
  }
  walk(path.join(root, "src"));
  for (const name of ["ai.js", "ai-command-domain.js", "qa.js", "quality.js", "validation.js"])
    files.push(path.join(root, name));
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).replaceAll("\\", "/");
    function add(text, node) {
      const message = text.replace(/\s+/g, " ").trim();
      if (/^[a-z][\w{}.-]*(?:\.[\w{}.-]+)+$/.test(message)) return;
      if (!/[A-Za-z]{2}/.test(message.replace(/\{[\w.-]+\}/g, "")) || message.startsWith(":root")) return;
      if (
        !/[A-Za-z]/.test(message) ||
        /^(?:[.#/]|https?:|data:)/.test(message) ||
        (/^\w+(?:[A-Z]\w*)+$/.test(message) && !/^[A-Z][a-z]+$/.test(message))
      )
        return;
      if (!/[ a-z]/.test(message) || /^(?:[a-z]+[A-Z][A-Za-z]*|[\w-]+\.(?:js|json|css|html))$/.test(message)) return;
      if (message.includes(" requires ") && /boundar|Controller|Service|Repository|Port/.test(message)) return;
      const location = `${relative}:${node.loc.start.line}`;
      const entry = found.get(message) || {
        message,
        description: "Interface message; preserve placeholders and technical names.",
        locations: []
      };
      if (!entry.locations.includes(location)) entry.locations.push(location);
      found.set(message, entry);
    }
    function visit(node) {
      if ((node.type === "Literal" && typeof node.value === "string") || node.type === "TemplateLiteral") {
        let owner = node.parent;
        while (
          owner &&
          !/Statement$/.test(owner.type) &&
          !["Property", "CallExpression", "NewExpression"].includes(owner.type)
        )
          owner = owner.parent;
        const context = owner ? code.slice(owner.range[0], owner.range[1]) : "";
        const ui =
          (typeof node.value === "string" &&
            /^(?:Best (?:for|only)|(?:Local|Hosted|Network|Ollama cloud model) AI? ?(?:mode)?)/.test(node.value)) ||
          /^labels\.push\(/.test(context) ||
          /^(?:new Error\(|(?:[\w.]+\.)?(?:source|sourceHtml|translate|reportText|reportHtml|setSaveStatus|setLocalAiStatus|confirm|alert)\(|(?:status|statusPort|saveStatus|applicationSaveStatusController)\.(?:set|setPersistence)\()/s.test(
            context
          ) ||
          /^(?:["']?\w*(?:label|title|hint|message|description|notice|warning|unavailable|failed|canceled|empty|ready|busy|progress|safeguard|tooltip|text)["']?\s*:)/i.test(
            context
          ) ||
          /^[\s\S]{0,180}\.textContent\s*=/.test(context);
        if (
          (ui || node.type === "TemplateLiteral" || (typeof node.value === "string" && /<[a-z]/i.test(node.value))) &&
          !/^(?:new TypeError|console\.|logger\.)/.test(context)
        ) {
          let value = node.value;
          if (node.type === "TemplateLiteral")
            value = node.quasis.map((part, i) => (i ? `{value${i}}` : "") + part.value.cooked).join("");
          if (/<[a-z][\s\S]*>/i.test(value)) {
            value = value.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
            for (const match of value.matchAll(/>([^<>]+)</g)) add(match[1], node);
            for (const match of value.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) add(match[1], node);
          } else if (ui) add(value, node);
        }
      }
    }
    new Linter().verify(code, {
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      plugins: { catalog: { rules: { extract: { create: () => ({ Literal: visit, TemplateLiteral: visit }) } } } },
      rules: { "catalog/extract": "error" }
    });
  }
  return [...found.values()];
}
module.exports = { collectUiMessages };
