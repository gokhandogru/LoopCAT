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

// A percent sign is also ordinary punctuation (Turkish writes 1% as %1).
// Only an explicit format declaration can make a numeric/space printf form
// or a Qt numbered argument unambiguous. Never infer a dialect from language.
const C_PERCENT_PATTERN = /%%|%(?:[1-9]\d*\$)?[-+#0 'I]*(?:\d+|\*(?:[1-9]\d*\$)?)?(?:\.(?:\d*|\*(?:[1-9]\d*\$)?))?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspnbB]/g;
const OBJC_PERCENT_PATTERN = /%%|%(?:[1-9]\d*\$)?[-+#0 ']*(?:\d+|\*(?:[1-9]\d*\$)?)?(?:\.(?:\d*|\*(?:[1-9]\d*\$)?))?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspnbB@]/g;
const PYTHON_PERCENT_PATTERN = /%%|%(?:\([^()\r\n]+\))?[#0 +\-]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]?[diouxXeEfFgGcrsa]/g;
const QT_PERCENT_PATTERN = /%L?[1-9]\d?(?!\d)/g;
const QT_PLURAL_PERCENT_PATTERN = /%L?n/g;
// In PO without metadata, keep common %s/%d, explicit positional %1$s and named
// %(name)s tokens. Widths, precision, spaces and bare %number stay editable.
const CONSERVATIVE_PERCENT_PATTERN = /%%|%(?:[1-9]\d*\$[-+#0]*(?:\d+|\*)?(?:\.\d+)?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspnbB@]|[-+#]*(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspnbB@](?![\p{L}\p{N}_]))/gu;
// Other formats retain complete printf tokens, with no whitespace-consuming
// flags or partial-word matches. Bare percent-number forms are still text.
const GENERIC_PERCENT_PATTERN = /%%|%(?:[1-9]\d*\$)?[-+#0]*(?:\d+|\*)?(?:\.\d+)?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspnbB@](?![\p{L}\p{N}_])/gu;
const NAMED_PERCENT_PATTERN = /%%|%\([^()\r\n]+\)[#0 +\-]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]?[diouxXeEfFgGcrsa]/g;

function percentPatterns(context) {
  const flags = new Set(Array.isArray(context?.formatFlags) ? context.formatFlags : []);
  const declared = [...flags].filter((flag) => /-format$/.test(flag) && !/^(?:no-|possible-)/.test(flag));
  const grammars = [
    ["c-format", C_PERCENT_PATTERN],
    ["objc-format", OBJC_PERCENT_PATTERN],
    ["python-format", PYTHON_PERCENT_PATTERN],
    ["qt-format", QT_PERCENT_PATTERN],
    ["qt-plural-format", QT_PLURAL_PERCENT_PATTERN]
  ];
  if (declared.length) {
    // An unsupported dialect is not evidence for treating it as printf.
    return grammars.filter(([flag]) => flags.has(flag) && !flags.has(`no-${flag}`)).map(([, pattern]) => pattern);
  }
  return [
    ...(!flags.has("no-c-format") && !flags.has("no-objc-format")
      ? [context?.format === "po" ? CONSERVATIVE_PERCENT_PATTERN : GENERIC_PERCENT_PATTERN]
      : []),
    ...(!flags.has("no-python-format") ? [NAMED_PERCENT_PATTERN] : [])
  ];
}

function detectProtectedTags(text, context = {}) {
  text = String(text || "");
  const patterns = [
    { type: "tag", pattern: /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?>/g },
    ...percentPatterns(context).map((pattern) => ({ type: "placeholder", pattern })),
    { type: "placeholder", pattern: /&(?:[A-Za-z][A-Za-z0-9]+|#\d+|#x[A-Fa-f0-9]+);/g },
    { type: "variable", pattern: /(?<![%\d])\$[A-Za-z_][A-Za-z0-9_.-]*/g },
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
      // Consuming the escape prevents the second % in %%s becoming a token.
      if (match[0] === "%%") continue;
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

const host = typeof window !== "undefined" ? window : globalThis;
host.CatHan = host.CatHan || {};
host.CatHan.protectedTags = { detectProtectedTags };
})();
