(() => {
function addProtectedToken(found, text, index, type) {
  if (!text || index < 0) return;
  found.push({ text, index, type });
}

const SEMANTIC_TAG_LABELS = new Map([
  ["strong", "b"],
  ["b", "b"],
  ["em", "i"],
  ["i", "i"],
  ["u", "u"]
]);

function displayLabelForProtectedToken(text, type) {
  if (type !== "tag") return text;
  const match = String(text || "").match(/^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b[^>]*?>$/);
  if (!match) return text;
  const closing = Boolean(match[1]);
  const rawName = match[2] || "tag";
  const name = rawName.toLowerCase();
  const labelName = SEMANTIC_TAG_LABELS.get(name) || name;
  const selfClosing = !closing && /\/\s*>$/.test(text);
  return `<${closing ? "/" : ""}${labelName}${selfClosing ? "/" : ""}>`;
}

function addDisplayLabelsForProtectedTokens(tokens) {
  const genericLabels = new Map();
  const genericStack = [];
  let genericCounter = 1;
  return tokens.map((token) => {
    if (token.type !== "tag") return { ...token, label: displayLabelForProtectedToken(token.text, token.type) };
    const text = String(token.text || "");
    const match = text.match(/^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b([^>]*?)>$/);
    if (!match) return { ...token, label: displayLabelForProtectedToken(token.text, token.type) };
    const closing = Boolean(match[1]);
    const name = String(match[2] || "").toLowerCase();
    const attrs = match[3] || "";
    const selfClosing = !closing && /\/\s*$/.test(attrs);
    if (name !== "g") return { ...token, label: displayLabelForProtectedToken(token.text, token.type) };
    if (closing) {
      const label = genericStack.pop() || "g";
      return { ...token, label: `</${label}>` };
    }
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const label = id
      ? genericLabels.get(id) || `g${genericCounter++}`
      : `g${genericCounter++}`;
    if (id && !genericLabels.has(id)) genericLabels.set(id, label);
    if (!selfClosing) genericStack.push(label);
    return { ...token, label: `<${label}${selfClosing ? "/" : ""}>` };
  });
}

function findBalancedTokens(text, opener, closer, type) {
  const found = [];
  let start = text.indexOf(opener);
  while (start !== -1) {
    let depth = 1;
    let cursor = start + opener.length;
    while (cursor < text.length) {
      if (text.startsWith(opener, cursor)) {
        depth += 1;
        cursor += opener.length;
        continue;
      }
      if (text.startsWith(closer, cursor)) {
        depth -= 1;
        cursor += closer.length;
        if (!depth) {
          addProtectedToken(found, text.slice(start, cursor), start, type);
          break;
        }
        continue;
      }
      cursor += 1;
    }
    start = text.indexOf(opener, Math.max(cursor, start + opener.length));
  }
  return found;
}

function overlaps(item, selected) {
  const start = item.index;
  const end = item.index + item.text.length;
  return selected.some((existing) => {
    const existingStart = existing.index;
    const existingEnd = existing.index + existing.text.length;
    return start < existingEnd && end > existingStart;
  });
}

function detectProtectedTags(text) {
  const patterns = [
    { type: "tag", pattern: /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?>/g },
    { type: "placeholder", pattern: /%(\d+\$)?[-+#0 ]*(\d+|\*)?(\.\d+)?[bcdeEfFgGosxX@]/g },
    { type: "placeholder", pattern: /%\([A-Za-z0-9_.:-]+\)[#0 +\-]*(\d+)?(\.\d+)?[sdif]/g },
    { type: "placeholder", pattern: /&(?:[A-Za-z][A-Za-z0-9]+|#\d+|#x[A-Fa-f0-9]+);/g },
    { type: "variable", pattern: /\$[A-Za-z_][A-Za-z0-9_.-]*/g },
    { type: "variable", pattern: /:[A-Za-z_][A-Za-z0-9_-]*/g },
    { type: "placeholder", pattern: /\[[A-Z][A-Z0-9_.:-]+\]/g }
  ];
  const found = [
    ...findBalancedTokens(text, "{{", "}}", "variable"),
    ...findBalancedTokens(text, "${", "}", "variable"),
    ...findBalancedTokens(text, "{", "}", "variable")
  ];
  patterns.forEach(({ pattern, type }) => {
    for (const match of String(text || "").matchAll(pattern)) {
      addProtectedToken(found, match[0], match.index || 0, type);
    }
  });
  const unique = [];
  const selected = [];
  found
    .sort((a, b) => a.index - b.index || b.text.length - a.text.length)
    .forEach((item) => {
      if (!overlaps(item, selected)) {
        selected.push(item);
        unique.push(item);
      }
    });
  return addDisplayLabelsForProtectedTokens(unique.map((item, index) => ({
    id: `tag-${index + 1}`,
    text: item.text,
    index: item.index,
    type: item.type || "placeholder"
  })));
}

window.CatHan = window.CatHan || {};
window.CatHan.protectedTags = { detectProtectedTags };
})();
