(() => {
const XLIFF_12_NAMESPACE = "urn:oasis:names:tc:xliff:document:1.2";
const XLIFF_20_NAMESPACE = "urn:oasis:names:tc:xliff:document:2.0";
const XLIFF_22_NAMESPACE = "urn:oasis:names:tc:xliff:document:2.2";
const XLIFF_2_VERSIONS = new Set(["2.0", "2.1", "2.2"]);
const XLIFF_2_INLINE_NAMES = new Set(["cp", "ph", "pc", "sc", "ec", "mrk", "sm", "em"]);
const XLIFF_2_PAIRED_INLINE_NAMES = new Set(["pc", "mrk"]);
const XLIFF_2_STATES = new Set(["initial", "translated", "reviewed", "final"]);
const GENERIC_VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function requiredText(value, message) {
  const text = cleanText(value);
  if (!text) throw new Error(message);
  return text;
}

function xliffProjectMetadata(project = {}) {
  const source = project || {};
  const name = cleanText(source.sourceFileName) || requiredText(source.name, "XLIFF project name is required.");
  return {
    name,
    sourceLang: requiredText(source.sourceLang, "XLIFF source language is required."),
    targetLang: requiredText(source.targetLang, "XLIFF target language is required.")
  };
}

/** @param {Record<string, any>} segment @returns {Record<string, any>} */
function xliffSegmentRecord(segment = {}, index = 0) {
  const source = segment.literalContent ? String(segment.source ?? "") : requiredText(segment.source, `XLIFF segment ${index + 1} source text is required.`);
  return {
    ...segment,
    source,
    target: String(segment.target ?? "")
  };
}

function attr(element, name) {
  return element?.getAttribute(name) || element?.getAttributeNS?.("", name) || "";
}

function xmlAttr(element, name) {
  return element?.getAttributeNS?.(XML_NAMESPACE, name) || element?.getAttribute?.(`xml:${name}`) || "";
}

function localName(element) {
  return String(element?.localName || "").toLowerCase();
}

function directChildrenByName(element, name, namespace = "") {
  return Array.from(element?.childNodes || []).filter((child) =>
    child.nodeType === Node.ELEMENT_NODE &&
    localName(child) === name &&
    (!namespace || child.namespaceURI === namespace)
  );
}

function firstChildByName(element, name, namespace = "") {
  return directChildrenByName(element, name, namespace)[0] || null;
}

function descendantsByName(element, name, namespace = "") {
  const descendants = Array.from(element?.getElementsByTagNameNS?.("*", name) || []);
  return namespace ? descendants.filter((item) => item.namespaceURI === namespace) : descendants;
}

function ancestorByName(element, name) {
  let current = element?.parentElement || null;
  while (current) {
    if (localName(current) === name) return current;
    current = current.parentElement;
  }
  return null;
}

function stripExt(name) {
  return String(name || "file").replace(/\.[^.]+$/, "");
}

function detectTags(text) {
  return window.CatHan.docx?.detectProtectedTags ? window.CatHan.docx.detectProtectedTags(text) : [];
}

function parseXml(text) {
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const xml = new DOMParser().parseFromString(parserInput, "application/xml");
  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error("The XLIFF file is not valid XML.");
  return xml;
}

function serializeXml(xml) {
  const text = new XMLSerializer().serializeToString(xml);
  return text.startsWith("<?xml") ? text : `<?xml version="1.0" encoding="UTF-8"?>\n${text}`;
}

function detectXliffProfile(xml) {
  const root = xml?.documentElement;
  if (!root || localName(root) !== "xliff") throw new Error("The XML document does not have an XLIFF root element.");
  const version = attr(root, "version") || "1.2";
  const namespace = String(root.namespaceURI || "");
  if (XLIFF_2_VERSIONS.has(version)) {
    const acceptedNamespaces = version === "2.2"
      ? new Set([XLIFF_22_NAMESPACE])
      : new Set([XLIFF_20_NAMESPACE, XLIFF_22_NAMESPACE]);
    if (!acceptedNamespaces.has(namespace)) {
      throw new Error(`XLIFF ${version} requires the corresponding OASIS 2.x namespace.`);
    }
    return { family: "2", version, namespace };
  }
  if (version.startsWith("1")) {
    if (namespace && namespace !== XLIFF_12_NAMESPACE) throw new Error(`Unsupported XLIFF ${version} namespace.`);
    return { family: "1", version, namespace: namespace || XLIFF_12_NAMESPACE };
  }
  throw new Error(`Unsupported XLIFF version: ${version}.`);
}

function effectiveAttribute(element, name, fallback = "") {
  let current = element;
  while (current) {
    const value = attr(current, name);
    if (value) return value;
    current = current.parentElement;
  }
  return fallback;
}

function effectiveXmlSpace(element) {
  let current = element;
  while (current) {
    const value = xmlAttr(current, "space");
    if (value) return value;
    current = current.parentElement;
  }
  return "default";
}

function validateUniqueIds(elements, label) {
  const seen = new Set();
  elements.forEach((element) => {
    const id = attr(element, "id");
    if (!id) throw new Error(`${label} id is required.`);
    if (seen.has(id)) throw new Error(`${label} ids must be unique within their XLIFF scope.`);
    seen.add(id);
  });
}

function validXliff2CodePoint(hex) {
  if (!/^(?:[0-9A-Fa-f]{2}){2,3}$/.test(hex)) return false;
  const value = Number.parseInt(hex, 16);
  if (value > 0x10ffff) return false;
  const validXmlCharacter = value === 0x9 || value === 0xa || value === 0xd ||
    (value >= 0x20 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff);
  return !validXmlCharacter;
}

function collectXliff2InlineIds(unit, content) {
  const namespace = unit.namespaceURI;
  const maps = { source: new Map(), target: new Map() };
  content.forEach((item) => {
    for (const kind of ["source", "target"]) {
      const container = firstChildByName(item, kind, namespace);
      if (!container) continue;
      for (const element of Array.from(container.getElementsByTagNameNS(namespace, "*"))) {
        const id = attr(element, "id");
        if (!id) continue;
        if (maps[kind].has(id)) throw new Error(`XLIFF 2.x inline ids must be unique within unit ${kind} content.`);
        maps[kind].set(id, localName(element));
      }
    }
  });
  return maps;
}

function validateXliff2Inline(unit, segment, unitInlineIds) {
  const namespace = unit.namespaceURI;
  const originalData = firstChildByName(unit, "originaldata", namespace);
  const dataElements = directChildrenByName(originalData, "data", namespace);
  if (originalData && !dataElements.length) throw new Error("XLIFF 2.x originalData requires at least one data element.");
  validateUniqueIds(dataElements, "XLIFF 2.x originalData data");
  const dataIds = new Set(dataElements.map((item) => attr(item, "id")));
  for (const kind of ["source", "target"]) {
    const container = firstChildByName(segment, kind, namespace);
    if (!container) continue;
    const elements = Array.from(container.getElementsByTagNameNS("*", "*")).filter((element) => element.namespaceURI === unit.namespaceURI);
    const idTypes = unitInlineIds[kind];
    for (const element of elements) {
      if (element.namespaceURI !== unit.namespaceURI) continue;
      const name = localName(element);
      if (!XLIFF_2_INLINE_NAMES.has(name)) throw new Error(`Unsupported XLIFF 2.x inline element <${name}>.`);
      if (["ph", "pc", "sc", "mrk", "sm"].includes(name) && !attr(element, "id")) {
        throw new Error(`XLIFF 2.x <${name}> inline codes require an id.`);
      }
      if (name === "cp" && !validXliff2CodePoint(attr(element, "hex"))) {
        throw new Error("XLIFF 2.x <cp> requires a hexadecimal code point that is invalid in XML.");
      }
      if (name === "ec" && !attr(element, "id") && !attr(element, "startRef")) {
        throw new Error("XLIFF 2.x <ec> inline codes require an id or startRef.");
      }
      if (name === "ec" && attr(element, "startRef") && idTypes.get(attr(element, "startRef")) !== "sc") {
        throw new Error("XLIFF 2.x <ec> startRef does not reference a start code in the same content.");
      }
      if (name === "em" && idTypes.get(attr(element, "startRef")) !== "sm") {
        throw new Error("XLIFF 2.x <em> startRef does not reference a start marker in the same content.");
      }
      if (attr(element, "copyOf") && !idTypes.has(attr(element, "copyOf"))) {
        throw new Error("XLIFF 2.x inline copyOf does not reference a code in the same content.");
      }
      for (const referenceName of ["dataRef", "dataRefStart", "dataRefEnd"]) {
        const reference = attr(element, referenceName);
        if (reference && !dataIds.has(reference)) throw new Error(`XLIFF 2.x inline ${referenceName} does not reference unit originalData.`);
      }
    }
  }
}

function validateXliff2Document(xml, profile) {
  const root = xml.documentElement;
  if (!attr(root, "srcLang")) throw new Error("XLIFF 2.x srcLang is required.");
  const targets = descendantsByName(root, "target").filter((element) => element.namespaceURI === profile.namespace);
  if (targets.length && !attr(root, "trgLang")) throw new Error("XLIFF 2.x trgLang is required when target elements are present.");
  const files = directChildrenByName(root, "file", profile.namespace);
  if (!files.length) throw new Error("XLIFF 2.x requires at least one file element.");
  validateUniqueIds(files, "XLIFF 2.x file");
  files.forEach((file) => {
    const units = descendantsByName(file, "unit", profile.namespace).filter((unit) => ancestorByName(unit, "file") === file);
    const groups = descendantsByName(file, "group", profile.namespace).filter((group) => ancestorByName(group, "file") === file);
    validateUniqueIds(units, "XLIFF 2.x unit");
    validateUniqueIds(groups, "XLIFF 2.x group");
    units.forEach((unit) => {
      const segments = directChildrenByName(unit, "segment", profile.namespace);
      const content = [...segments, ...directChildrenByName(unit, "ignorable", profile.namespace)];
      if (!content.length) throw new Error("XLIFF 2.x units require at least one segment or ignorable element.");
      const unitInlineIds = collectXliff2InlineIds(unit, content);
      const segmentIds = new Set();
      content.forEach((segment) => {
        const segmentId = attr(segment, "id");
        if (segmentId && segmentIds.has(segmentId)) throw new Error("XLIFF 2.x segment ids must be unique within a unit.");
        if (segmentId) segmentIds.add(segmentId);
        const source = directChildrenByName(segment, "source", profile.namespace);
        const target = directChildrenByName(segment, "target", profile.namespace);
        if (source.length !== 1 || target.length > 1) throw new Error("XLIFF 2.x segments require one source and at most one target.");
        if (localName(segment) === "segment") {
          const state = attr(segment, "state");
          if (state && !XLIFF_2_STATES.has(state)) throw new Error(`Unsupported XLIFF 2.x segment state: ${state}.`);
          if (attr(segment, "subState") && !state) throw new Error("XLIFF 2.x subState requires an explicit state.");
        }
        validateXliff2Inline(unit, segment, unitInlineIds);
      });
    });
  });
  return profile;
}

function semanticTagForXliffElement(element) {
  const type = `${attr(element, "ctype")} ${attr(element, "type")}`.toLowerCase();
  if (type.includes("bold")) return "b";
  if (type.includes("italic")) return "i";
  if (type.includes("underlin")) return "u";
  const id = attr(element, "id").toLowerCase();
  if (id === "b" || id === "i" || id === "u") return id;
  return "";
}

function genericTagId(rawAttributes) {
  return (rawAttributes || "").match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || "";
}

function formatHtmlTagAsXliffPh(rawTag, fallbackId) {
  const tagMatch = rawTag.match(/^<\s*\/?\s*([A-Za-z][A-Za-z0-9:-]*)/);
  const name = tagMatch?.[1]?.toLowerCase() || "tag";
  const id = genericTagId(rawTag) || fallbackId;
  return `<ph id="${esc(id)}" ctype="x-${esc(name)}">${escText(rawTag)}</ph>`;
}

function xliffInlineContent(value) {
  const text = String(value || "");
  const pattern = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/g;
  let cursor = 0;
  let output = "";
  let match;
  let placeholderCount = 0;
  const semanticCounts = new Map();
  while ((match = pattern.exec(text))) {
    output += escText(text.slice(cursor, match.index));
    const tagName = match[2].toLowerCase();
    if (match[1]) {
      output += ["g", "b", "i", "u"].includes(tagName) ? "</g>" : formatHtmlTagAsXliffPh(match[0], `ph${++placeholderCount}`);
    } else {
      const rawId = (match[3] || "").match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      if (["g", "b", "i", "u"].includes(tagName)) {
        const semanticCount = tagName === "g" ? 0 : (semanticCounts.get(tagName) || 0) + 1;
        if (tagName !== "g") semanticCounts.set(tagName, semanticCount);
        const id = tagName === "g" ? rawId : rawId || (semanticCount === 1 ? tagName : `${tagName}${semanticCount}`);
        const ctype = tagName === "b" ? "x-bold" : tagName === "i" ? "x-italic" : tagName === "u" ? "x-underline" : "";
        const ctypeAttr = ctype ? ` ctype="${ctype}"` : "";
        output += id ? `<g id="${esc(id)}"${ctypeAttr}>` : escText(match[0]);
      } else {
        output += formatHtmlTagAsXliffPh(match[0], `ph${++placeholderCount}`);
      }
    }
    cursor = match.index + match[0].length;
  }
  output += escText(text.slice(cursor));
  return output;
}

function xliff12NodeContent(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const name = localName(node);
  const children = Array.from(node.childNodes).map(xliff12NodeContent).join("");
  if (name === "source" || name === "target" || name === "seg-source" || name === "mrk") return children;
  if (name === "g") {
    const semantic = semanticTagForXliffElement(node);
    if (semantic) return `${xliff12SemanticOpening(node, semantic)}${children}</${semantic}>`;
    const id = attr(node, "id");
    return id ? `<g id="${id}">${children}</g>` : children;
  }
  if (name === "ph" || name === "x" || name === "bx" || name === "ex" || name === "bpt" || name === "ept" || name === "it") {
    const content = children.trim();
    if (content) return content;
    const id = attr(node, "id") || attr(node, "rid") || name;
    return `<${name} id="${id}"/>`;
  }
  return children;
}

function xliff12SemanticOpening(node, semantic) {
  let container = node.parentElement;
  while (container?.parentElement && !["source", "target", "seg-source"].includes(localName(container))) container = container.parentElement;
  const peers = descendantsByName(container, "g").filter((peer) => semanticTagForXliffElement(peer) === semantic);
  // Repeated semantic tags need identity so reordering cannot swap native codes.
  return peers.length > 1 && attr(node, "id") ? `<${semantic} id="${esc(attr(node, "id"))}">` : `<${semantic}>`;
}

function inlineKey(node, counters) {
  const name = localName(node);
  const stable = attr(node, "id") || attr(node, "startRef") || attr(node, "hex");
  const base = stable ? `${name}:${stable}` : name;
  const count = (counters.get(base) || 0) + 1;
  counters.set(base, count);
  return stable && count === 1 ? base : `${base}:${count}`;
}

function canonicalInlineAttributes(node, key) {
  const names = ["id", "startRef", "hex", "copyOf"];
  const values = names
    .map((name) => [name, attr(node, name)])
    .filter(([, value]) => value)
    .map(([name, value]) => ` ${name}="${esc(value)}"`)
    .join("");
  return `${values} data-lc-key="${esc(key)}"`;
}

function xliff2NodeContent(node, context = { counters: new Map() }) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const name = localName(node);
  if (name === "source" || name === "target") {
    return Array.from(node.childNodes).map((child) => xliff2NodeContent(child, context)).join("");
  }
  if (!XLIFF_2_INLINE_NAMES.has(name)) {
    if (String(node.namespaceURI || "").startsWith("urn:oasis:names:tc:xliff:")) {
      throw new Error(`Unsupported XLIFF 2.x inline element <${name}>.`);
    }
    return Array.from(node.childNodes).map((child) => xliff2NodeContent(child, context)).join("");
  }
  const key = inlineKey(node, context.counters);
  const attributes = canonicalInlineAttributes(node, key);
  if (XLIFF_2_PAIRED_INLINE_NAMES.has(name)) {
    const children = Array.from(node.childNodes).map((child) => xliff2NodeContent(child, context)).join("");
    return `<${name}${attributes}>${children}</${name}>`;
  }
  return `<${name}${attributes}/>`;
}

function statusForXliff12Target(targetElement, targetText) {
  if (!String(targetText || "").trim()) return "empty";
  const state = String(attr(targetElement, "state") || attr(targetElement, "state-qualifier") || "").toLowerCase();
  if (state.includes("translated") || state.includes("final") || state.includes("signed-off")) return "confirmed";
  return "draft";
}

function statusForXliff2Segment(segmentElement, targetText) {
  if (!String(targetText || "").trim()) return { status: "empty", reviewState: "" };
  const state = String(attr(segmentElement, "state") || "initial").toLowerCase();
  if (state === "final") return { status: "confirmed", reviewState: "" };
  if (state === "reviewed") return { status: "confirmed", reviewState: "reviewed" };
  return { status: "draft", reviewState: "" };
}

const HTML_BLOCK_NAMES = new Set("address article aside blockquote dd div dl dt figcaption footer h1 h2 h3 h4 h5 h6 header li main ol p section td th tr ul".split(" "));
const HTML_INLINE_NAMES = new Set("a abbr b bdi bdo cite code del em i ins kbd mark q s samp small span strong sub sup time u var".split(" "));

function characterContent(element) {
  return Array.from(element?.childNodes || []).every((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE);
}

// Use offsets in the original literal payload. Parsing HTML into a DOM and serializing
// it would normalize quotes, spaces, malformed markup, and the translator's target HTML.
function literalLayout(text) {
  const slots = [];
  const boundaries = [];
  const blocks = [];
  const inline = [];
  const tokens = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>|\r\n|[\n\r\u2028\u2029]/gi;
  let start = 0;
  let textInSlot = false;
  let cursor = 0;
  function slot(end) {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    slots.push({ start: start + leading, end: start + leading + value.length, value, role: blocks.at(-1) || "", visible: textInSlot });
    textInSlot = false;
  }
  for (const match of text.matchAll(tokens)) {
    const [token, rawName] = match;
    const name = (rawName || "").toLowerCase();
    if (text.slice(cursor, match.index).trim()) textInSlot = true;
    cursor = match.index + token.length;
    if (token.startsWith("<!--") || ["pre", "script", "style", "textarea"].includes(name)) return null;
    const closing = token.startsWith("</");
    if (HTML_INLINE_NAMES.has(name)) {
      if (closing && inline.pop() !== name) return null;
      if (!closing && !/\/\s*>$/.test(token)) inline.push(name);
      continue;
    }
    if (!(HTML_BLOCK_NAMES.has(name) || name === "br" || name === "hr")) continue;
    // Crossing a native formatting pair would hand the editor an unmatched tag.
    if (inline.length) continue;
    slot(match.index);
    start = cursor;
    boundaries.push(name ? (closing ? "/" : "") + name : "\n");
    if (HTML_BLOCK_NAMES.has(name)) {
      if (closing) {
        const depth = blocks.lastIndexOf(name);
        if (depth !== -1) blocks.length = depth;
      } else if (!/\/\s*>$/.test(token)) blocks.push(name);
    }
  }
  if (inline.length) return null;
  if (text.slice(cursor).trim()) textInSlot = true;
  slot(text.length);
  return { slots, signature: boundaries.join("|") };
}

function bilingualLayout(source, target) {
  function hardLines(text) {
    const spans = [];
    let start = 0;
    for (const delimiter of text.matchAll(/\r\n|[\n\r]/g)) {
      spans.push({ start, end: delimiter.index, value: text.slice(start, delimiter.index) });
      start = delimiter.index + delimiter[0].length;
    }
    spans.push({ start, end: text.length, value: text.slice(start) });
    return spans;
  }
  if (/[\n\r]/.test(source)) {
    const sourceRows = hardLines(source);
    const targetRows = hardLines(target);
    if (targetRows.length === sourceRows.length) return { sourceRows, targetRows, template: target, empty: false, physical: true };
    if (!target.trim()) return { sourceRows, targetRows: sourceRows, template: source, empty: true, physical: true };
  }
  // A single physical line can still contain several explicit HTML blocks.
  // Use them only when their translated counterparts can be paired.
  const htmlBlocks = /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|footer|h[1-6]|header|hr|li|main|ol|p|section|td|th|tr|ul)(?=[\s/>])/i;
  if (!htmlBlocks.test(source)) return null;
  const left = literalLayout(source);
  if (!left) return null;
  const sourceRows = left.slots.filter((slot) => slot.visible);
  if (sourceRows.length < 2) return null;
  if (!target.trim()) return { sourceRows, targetRows: sourceRows, template: source, empty: true };
  const right = literalLayout(target);
  if (!right) return null;
  let targetRows;
  if (left.signature === right.signature) {
    if (left.slots.some((slot, i) => !slot.visible && right.slots[i].visible)) return null;
    targetRows = right.slots.filter((_, i) => left.slots[i].visible);
  } else {
    // A translator can change the number of blank lines between the same blocks.
    // Never place a translation by position when its block roles or counts differ.
    const collapseBreaks = (signature) => signature.replace(/\bbr(?:\|br)+\b/g, "br");
    if (collapseBreaks(left.signature) !== collapseBreaks(right.signature)) return null;
    targetRows = right.slots.filter((slot) => slot.visible);
    if (targetRows.length !== sourceRows.length || targetRows.some((slot, i) => slot.role !== sourceRows[i].role)) return null;
  }
  return { sourceRows, targetRows, template: target, empty: false };
}

function xliffPartKind(value) {
  if (!value.trim()) return "blank";
  const visible = value.replace(/<!--[\s\S]*?-->|<\/?[a-z][\w:-]*(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/gi, "");
  return visible.trim() ? "text" : "markup";
}

function splitBilingualRow(row, sourceElement, targetElement, options) {
  if (!characterContent(sourceElement) || !characterContent(targetElement)) return [row];
  row.structure.literalContent = true;
  if (options.splitBilingualBlocks === false || effectiveAttribute(sourceElement, "canResegment", "yes").toLowerCase() === "no") return [row];
  const layout = bilingualLayout(row.text, row.target);
  if (!layout) return [row];
  return layout.sourceRows.map((span, index) => {
    const target = layout.empty ? "" : layout.targetRows[index].value;
    return {
      ...row,
      key: row.key + ":part-" + (index + 1),
      text: span.value,
      target,
      status: target ? row.status : "empty",
      tags: detectTags(span.value),
      structure: { ...row.structure, xliffPart: { index, count: layout.sourceRows.length, kind: xliffPartKind(span.value), lineBreakAfter: Boolean(layout.physical && index + 1 < layout.sourceRows.length) } }
    };
  });
}

function transUnitSegments(xml, options) {
  const files = descendantsByName(xml, "file");
  const fileOriginalByUnit = new Map();
  files.forEach((file, fileIndex) => {
    descendantsByName(file, "trans-unit").forEach((unit) => {
      fileOriginalByUnit.set(unit, {
        fileIndex,
        original: attr(file, "original"),
        sourceLang: attr(file, "source-language"),
        targetLang: attr(file, "target-language")
      });
    });
  });
  return descendantsByName(xml, "trans-unit").flatMap((unit, index) => {
    if (effectiveAttribute(unit, "translate", "yes").toLowerCase() === "no") return [];
    const segmentedSource = firstChildByName(unit, "seg-source");
    const markers = descendantsByName(segmentedSource, "mrk").filter((node) => attr(node, "mtype") === "seg");
    const targetContainer = firstChildByName(unit, "target");
    const targetMarkers = descendantsByName(targetContainer, "mrk").filter((node) => attr(node, "mtype") === "seg");
    for (const list of [markers, targetMarkers]) {
      const ids = list.map((node) => attr(node, "mid"));
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("Segmented XLIFF 1.2 markers require unique mid values.");
    }
    const targetByMid = new Map(targetMarkers.map((node) => [attr(node, "mid"), node]));
    const unmatchedTarget = markers.length > 0 && Boolean(targetMarkers.length || xliff12NodeContent(targetContainer).trim()) &&
      (targetByMid.size !== markers.length || markers.some((node) => !targetByMid.has(attr(node, "mid"))));
    // A segmented source does not establish where an unmarked target translation
    // belongs. Keep all original target material visible in one native unit.
    const byMid = markers.length > 0 && !unmatchedTarget;
    const sourceElements = byMid ? markers : [firstChildByName(unit, "source") || segmentedSource];
    return sourceElements.flatMap((sourceElement) => {
      const segmentMid = byMid ? attr(sourceElement, "mid") : "";
      const targetElement = byMid ? targetByMid.get(segmentMid) : targetContainer;
      const source = xliff12NodeContent(sourceElement);
      const target = xliff12NodeContent(targetElement);
      const notes = directChildrenByName(unit, "note").map((note) => (note.textContent || "").trim()).filter(Boolean);
      const fileInfo = fileOriginalByUnit.get(unit) || {};
      return splitBilingualRow({
        text: source,
        target,
        key: `${attr(unit, "id") || `trans-unit-${index + 1}`}${segmentMid ? `:${segmentMid}` : ""}`,
        status: statusForXliff12Target(targetContainer, target),
        tags: detectTags(source),
        comment: notes.join("\n"),
        structure: {
          format: "xliff",
          version: "1.2",
          namespace: xml.documentElement?.namespaceURI || XLIFF_12_NAMESPACE,
          unitId: attr(unit, "id") || "",
          unitIndex: index,
          segmentMid,
          ...(unmatchedTarget && targetMarkers.length ? { unmappedTargetMarkers: true } : {}),
          fileOriginal: fileInfo.original || "",
          fileIndex: fileInfo.fileIndex ?? 0,
          sourceLang: fileInfo.sourceLang || "",
          targetLang: fileInfo.targetLang || ""
        }
      }, sourceElement, targetElement, unmatchedTarget ? { splitBilingualBlocks: false } : options);
    });
  }).filter((unit) => unit.structure?.xliffPart || unit.text.trim());
}

function groupPathForUnit(unit) {
  const path = [];
  let current = unit.parentElement;
  while (current && localName(current) !== "file") {
    if (localName(current) === "group" && current.namespaceURI === unit.namespaceURI) path.unshift(attr(current, "id") || "");
    current = current.parentElement;
  }
  return path;
}

function notesForXliff2Segment(unit, segmentElement) {
  const namespace = unit.namespaceURI;
  const notes = directChildrenByName(firstChildByName(unit, "notes", namespace), "note", namespace);
  const segmentId = attr(segmentElement, "id");
  return notes.filter((note) => {
    const ref = attr(note, "ref");
    if (!ref || !segmentId) return !ref;
    return ref === `#${segmentId}` || ref.endsWith(`/${segmentId}`);
  }).map((note) => (note.textContent || "").trim()).filter(Boolean);
}

function xliff2Segments(xml, profile, options) {
  validateXliff2Document(xml, profile);
  const root = xml.documentElement;
  const files = directChildrenByName(root, "file", profile.namespace);
  const fileIndexes = new Map(files.map((file, index) => [file, index]));
  const units = files.flatMap((file) => descendantsByName(file, "unit", profile.namespace).filter((unit) => ancestorByName(unit, "file") === file));
  return units.flatMap((unit, unitIndex) => {
    if (effectiveAttribute(unit, "translate", "yes").toLowerCase() === "no") return [];
    const file = ancestorByName(unit, "file");
    return directChildrenByName(unit, "segment", profile.namespace).flatMap((segmentElement, segmentIndex) => {
      const sourceElement = firstChildByName(segmentElement, "source", profile.namespace);
      const targetElement = firstChildByName(segmentElement, "target", profile.namespace);
      const source = xliff2NodeContent(sourceElement, { counters: new Map() });
      const target = xliff2NodeContent(targetElement, { counters: new Map() });
      const state = statusForXliff2Segment(segmentElement, target);
      const notes = notesForXliff2Segment(unit, segmentElement);
      return splitBilingualRow({
        text: source,
        target,
        key: `${attr(file, "id")}:${attr(unit, "id")}:${attr(segmentElement, "id") || segmentIndex + 1}`,
        status: state.status,
        reviewState: state.reviewState,
        tags: detectTags(source),
        comment: notes.join("\n"),
        structure: {
          format: "xliff",
          version: profile.version,
          namespace: profile.namespace,
          fileId: attr(file, "id"),
          fileOriginal: attr(file, "original"),
          fileIndex: fileIndexes.get(file) ?? 0,
          groupPath: groupPathForUnit(unit),
          unitId: attr(unit, "id"),
          segmentId: attr(segmentElement, "id"),
          unitIndex,
          segmentIndex,
          xmlSpace: effectiveXmlSpace(sourceElement),
          sourceLang: attr(root, "srcLang"),
          targetLang: attr(root, "trgLang"),
          originalState: attr(segmentElement, "state"),
          originalSubState: attr(segmentElement, "subState")
        }
      }, sourceElement, targetElement, options);
    });
  }).filter((unit) => unit.structure?.xliffPart || String(unit.text || "").trim());
}

function parseXliffText(text, fileName = "file.xlf", options = {}) {
  const xml = parseXml(text);
  const profile = detectXliffProfile(xml);
  const segments = profile.family === "2" ? xliff2Segments(xml, profile, options) : transUnitSegments(xml, options);
  if (!segments.length) throw new Error("No translatable XLIFF units were found.");
  const ext = fileName.split(".").pop().toLowerCase() || "xlf";
  return {
    fileName,
    documentName: stripExt(fileName),
    documentType: ["xlf", "xliff", "sdlxliff"].includes(ext) ? ext : "xlf",
    segments,
    structure: {
      format: "xliff",
      version: profile.version,
      namespace: profile.namespace,
      sourceLang: profile.family === "2" ? attr(xml.documentElement, "srcLang") : "",
      targetLang: profile.family === "2" ? attr(xml.documentElement, "trgLang") : "",
      source: text
    }
  };
}

async function parseXliffFile(file, options = {}) {
  const decoded = window.CatHan.encoding
    ? await window.CatHan.encoding.decodeTextFile(file, options)
    : { text: await file.text(), encoding: "utf-8", detectedFrom: "fallback" };
  const parsed = parseXliffText(decoded.text, file.name, options);
  parsed.structure = {
    ...parsed.structure,
    sourceEncoding: {
      encoding: decoded.encoding,
      detectedFrom: decoded.detectedFrom,
      bom: Boolean(decoded.bom),
      canPreserve: Boolean(decoded.canPreserve)
    }
  };
  return parsed;
}

function stateForXliff12(segment) {
  if (!String(segment.target || "").trim()) return "new";
  if (segment.status === "confirmed") return "translated";
  if (segment.status === "draft") return "needs-review-translation";
  return "new";
}

function stateForXliff2(segment) {
  if (segment.status === "confirmed") return segment.reviewState === "reviewed" ? "reviewed" : "final";
  if (String(segment.target || "").trim()) return "translated";
  return "initial";
}

function genericBilingualRows(project, segments) {
  const groups = new Map();
  const ordered = [];
  for (const segment of segments || []) {
    if (!segment.structure?.xliffPart) {
      ordered.push([{ ...segment, literalContent: Boolean(segment.structure?.literalContent) }]);
      continue;
    }
    const key = JSON.stringify([segment.documentId || "", nativeRowKey(segment.structure)]);
    if (!groups.has(key)) { groups.set(key, []); ordered.push(groups.get(key)); }
    groups.get(key).push(segment);
  }
  const sources = new Map();
  return ordered.flatMap((rows) => {
    if (!rows[0].structure?.xliffPart) return rows;
    rows.sort((a,b) => a.structure.xliffPart.index - b.structure.xliffPart.index);
    const first = rows[0];
    const complete = rows.length === first.structure.xliffPart.count && rows.every((row,index) => row.structure.xliffPart.index === index);
    if (complete) {
      const document = project?.localizationStructures?.[first.documentId];
      let source, target;
      if (document?.source) {
        if (!sources.has(document)) {
          const xml = parseXml(document.source), profile = detectXliffProfile(xml);
          const documentRows = (segments || []).filter((row) => row.documentId === first.documentId && row.structure?.xliffPart);
          sources.set(document, new Map(assembleBilingualRows(documentRows, xml, profile).map((row) => [nativeRowKey(row.structure), row])));
        }
        const native = sources.get(document).get(nativeRowKey(first.structure));
        source = native?.text;
        target = native?.target;
      } else if (rows.some((row) => row.structure.xliffPart.lineBreakAfter)) {
        source = rows.map((row) => row.source ?? row.text ?? "").join("\n");
        target = rows.map((row) => row.target || "").join("\n");
      }
      if (source != null) {
        const translatable = rows.filter((row) => row.structure.xliffPart.kind === "text");
        return [{ ...first, source, target, literalContent: true, status: translatable.every((row) => row.status === "confirmed") ? "confirmed" : target.trim() ? "draft" : "empty" }];
      }
    }
    return rows.map((row) => ({ ...row, source: row.source ?? row.text, literalContent: true }));
  });
}

function buildXliff(project, segments) {
  const metadata = xliffProjectMetadata(project);
  const units = genericBilingualRows(project, segments)
    .map((segment, index) => xliffSegmentRecord(segment, index))
    .map((segment, index) => `      <trans-unit id="${esc(segment.id || index + 1)}" resname="${index + 1}">
        <source>${segment.literalContent ? escText(segment.source) : xliffInlineContent(segment.source)}</source>
        <target state="${stateForXliff12(segment)}">${segment.literalContent ? escText(segment.target) : xliffInlineContent(segment.target || "")}</target>
        <note>LoopCAT segment ${index + 1}</note>
      </trans-unit>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="${XLIFF_12_NAMESPACE}">
  <file original="${esc(metadata.name)}" source-language="${esc(metadata.sourceLang)}" target-language="${esc(metadata.targetLang)}" datatype="plaintext">
    <body>
${units}
    </body>
  </file>
</xliff>`;
}

function tokenizeGenericInline(value) {
  const text = String(value || "");
  const pattern = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/g;
  const tokens = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) tokens.push({ type: "text", raw: text.slice(cursor, match.index) });
    const name = match[2].toLowerCase();
    const closing = Boolean(match[1]);
    const selfClosing = !closing && (/\/\s*>$/.test(match[0]) || GENERIC_VOID_TAGS.has(name));
    tokens.push({ type: "tag", raw: match[0], name, closing, selfClosing, pair: -1 });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ type: "text", raw: text.slice(cursor) });
  const stack = [];
  tokens.forEach((token, index) => {
    if (token.type !== "tag" || token.selfClosing) return;
    if (!token.closing) {
      stack.push(index);
      return;
    }
    const openerIndex = stack.pop();
    if (openerIndex === undefined || tokens[openerIndex].name !== token.name) throw new Error("XLIFF 2.2 export requires balanced inline markup.");
    tokens[openerIndex].pair = index;
    token.pair = openerIndex;
  });
  if (stack.length) throw new Error("XLIFF 2.2 export requires balanced inline markup.");
  return tokens;
}

function compileGenericXliff22Inline(value, sourcePlan = null) {
  const tokens = tokenizeGenericInline(value);
  const signatureCounts = new Map();
  const matchedSignatures = new Set();
  const plan = sourcePlan || new Map();
  const data = sourcePlan ? [] : [];
  let codeCounter = sourcePlan ? sourcePlan.size : 0;
  let dataCounter = sourcePlan ? Array.from(sourcePlan.values()).reduce((max, item) => Math.max(max, item.dataEndNumber || item.dataNumber || 0), 0) : 0;
  const output = tokens.map((token) => {
    if (token.type === "text") return escText(token.raw);
    if (token.closing) return "</pc>";
    const kind = token.selfClosing ? "standalone" : "paired";
    const signatureBase = `${kind}:${token.name}`;
    const signatureCount = (signatureCounts.get(signatureBase) || 0) + 1;
    signatureCounts.set(signatureBase, signatureCount);
    const signature = `${signatureBase}:${signatureCount}`;
    let descriptor = plan.get(signature);
    if (sourcePlan && !descriptor) throw new Error("XLIFF 2.2 target inline markup does not match the source.");
    if (!descriptor) {
      const codeId = `c${++codeCounter}`;
      if (token.selfClosing) {
        descriptor = { codeId, dataId: `d${++dataCounter}`, dataNumber: dataCounter, raw: token.raw, name: token.name, kind };
      } else {
        const closingRaw = tokens[token.pair]?.raw || `</${token.name}>`;
        descriptor = {
          codeId,
          dataStartId: `d${++dataCounter}`,
          dataStartNumber: dataCounter,
          dataEndId: `d${++dataCounter}`,
          dataEndNumber: dataCounter,
          raw: token.raw,
          closingRaw,
          name: token.name,
          kind
        };
      }
      plan.set(signature, descriptor);
      data.push(descriptor);
    }
    matchedSignatures.add(signature);
    if (token.selfClosing) return `<ph id="${descriptor.codeId}" dataRef="${descriptor.dataId}" type="fmt"/>`;
    const subtype = ["b", "strong"].includes(token.name)
      ? " xlf:b"
      : ["i", "em"].includes(token.name)
        ? " xlf:i"
        : token.name === "u"
          ? " xlf:u"
          : "";
    const subtypeAttribute = subtype ? ` subType="${subtype.trim()}"` : "";
    return `<pc id="${descriptor.codeId}" dataRefStart="${descriptor.dataStartId}" dataRefEnd="${descriptor.dataEndId}" type="fmt"${subtypeAttribute}>`;
  }).join("");
  if (sourcePlan && cleanText(value)) {
    for (const signature of sourcePlan.keys()) {
      if (!matchedSignatures.has(signature)) throw new Error("XLIFF 2.2 target inline markup does not match the source.");
    }
  }
  return { output, plan, data };
}

function originalDataXml(descriptors) {
  const rows = [];
  descriptors.forEach((item) => {
    if (item.kind === "standalone") rows.push(`        <data id="${item.dataId}">${escText(item.raw)}</data>`);
    else {
      rows.push(`        <data id="${item.dataStartId}">${escText(item.raw)}</data>`);
      rows.push(`        <data id="${item.dataEndId}">${escText(item.closingRaw)}</data>`);
    }
  });
  return rows.length ? `\n      <originalData>\n${rows.join("\n")}\n      </originalData>` : "";
}

function buildXliff22(project, segments) {
  const metadata = xliffProjectMetadata(project);
  const units = genericBilingualRows(project, segments)
    .map((segment, index) => xliffSegmentRecord(segment, index))
    .map((segment, index) => {
      const sourceInline = segment.literalContent ? { output: escText(segment.source), data: [] } : compileGenericXliff22Inline(segment.source);
      const targetInline = segment.literalContent ? { output: escText(segment.target) } : compileGenericXliff22Inline(segment.target || "", sourceInline.plan);
      const target = `\n        <target>${targetInline.output}</target>`;
      return `    <unit id="u${index + 1}" name="${esc(segment.id || `segment-${index + 1}`)}">
      <notes>
        <note id="n${index + 1}" ref="#s${index + 1}">LoopCAT segment ${index + 1}</note>
      </notes>${originalDataXml(sourceInline.data)}
      <segment id="s${index + 1}" state="${stateForXliff2(segment)}">
        <source>${sourceInline.output}</source>${target}
      </segment>
    </unit>`;
    }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="${XLIFF_22_NAMESPACE}" version="2.2" srcLang="${esc(metadata.sourceLang)}" trgLang="${esc(metadata.targetLang)}">
  <file id="f1" original="${esc(metadata.name)}">
${units}
  </file>
</xliff>`;
}

function removeChildren(element) {
  Array.from(element.childNodes || []).forEach((child) => element.removeChild(child));
}

function appendInlineFragment(xml, element, content) {
  removeChildren(element);
  const namespace = xml.documentElement?.namespaceURI || "";
  const wrapperXml = namespace
    ? `<root xmlns="${namespace}">${content}</root>`
    : `<root>${content}</root>`;
  const fragment = parseXml(wrapperXml);
  Array.from(fragment.documentElement.childNodes).forEach((child) => {
    element.appendChild(xml.importNode(child, true));
  });
}

function ensureDirectChildAfter(xml, parent, name, afterElement = null) {
  const existing = firstChildByName(parent, name, parent.namespaceURI || "");
  if (existing) return existing;
  const element = xml.createElementNS(parent.namespaceURI || xml.documentElement?.namespaceURI || null, name);
  if (afterElement?.nextSibling) parent.insertBefore(element, afterElement.nextSibling);
  else parent.appendChild(element);
  return element;
}

function sameStructureIndex(segment, index, field = "unitIndex") {
  return Number.isFinite(Number(segment?.structure?.[field])) && Number(segment.structure[field]) === index;
}

function findSegmentForTransUnit(segments, unit, index) {
  const unitId = attr(unit, "id");
  return segments.find((segment) => sameStructureIndex(segment, index, "unitIndex"))
    || (unitId ? segments.find((segment) => segment.structure?.unitIndex == null && segment.structure?.unitId === unitId) : null)
    || (segments.every((segment) => !segment.structure) ? segments[index] : null)
    || null;
}

function findSegmentForXliff2(segments, file, unit, segmentElement, unitIndex, segmentIndex) {
  const fileId = attr(file, "id");
  const unitId = attr(unit, "id");
  const segmentId = attr(segmentElement, "id");
  return segments.find((segment) =>
    sameStructureIndex(segment, unitIndex, "unitIndex") &&
    sameStructureIndex(segment, segmentIndex, "segmentIndex") &&
    (!segment.structure?.fileId || segment.structure.fileId === fileId)
  ) || (unitId && segmentId
    ? segments.find((segment) => segment.structure?.fileId === fileId && segment.structure?.unitId === unitId && segment.structure?.segmentId === segmentId)
    : null) || null;
}

function nativeRowKey(structure) {
  return JSON.stringify([structure?.unitIndex, structure?.segmentIndex ?? null, structure?.segmentMid || ""]);
}

function preserveLineWrapper(original, edited) {
  if (!edited.trim() || /<\/?[a-z][\w:-]*(?=[\s/>])/i.test(edited)) return edited;
  // Pasting plain text into a heading/paragraph should keep its authored
  // enclosure and attributes. Inline markup inside a sentence belongs to the edit.
  const wrapped = /^(\s*)(<([a-z][\w:-]*)(?=[\s>])(?:[^<>"']|"[^"]*"|'[^']*')*>)([\s\S]*)(<\/\3\s*>)(\s*)$/i.exec(original);
  if (!wrapped || !HTML_BLOCK_NAMES.has(wrapped[3].toLowerCase()) || /<\/?[a-z]/i.test(wrapped[4])) return edited;
  return wrapped[1] + wrapped[2] + edited + wrapped[5] + wrapped[6];
}

function assembleBilingualRows(segments, xml, profile) {
  const groups = new Map();
  const combined = [];
  for (const segment of segments) {
    if (!segment.structure?.xliffPart) { combined.push(segment); continue; }
    const key = nativeRowKey(segment.structure);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segment);
  }
  if (!groups.size) return combined;
  const options = { splitBilingualBlocks: false };
  const nativeRows = profile.family === "2" ? xliff2Segments(xml, profile, options) : transUnitSegments(xml, options);
  for (const native of nativeRows) {
    const key = nativeRowKey(native.structure);
    const parts = groups.get(key);
    if (!parts) continue;
    groups.delete(key);
    const layout = bilingualLayout(native.text, native.target);
    const byIndex = new Map(parts.map((row) => [row.structure.xliffPart.index, row]));
    if (!layout || byIndex.size !== parts.length || parts.some(({ structure: { xliffPart: part } }) =>
      !Number.isInteger(part.index) || part.index < 0 || part.index >= layout.sourceRows.length || part.count !== layout.sourceRows.length)) {
      throw new Error("XLIFF row boundaries do not match the original bilingual unit.");
    }
    let targetChanged = false, statusChanged = false, allConfirmed = true, allReviewed = true;
    const replacements = layout.targetRows.map((span, index) => {
      const original = layout.empty ? "" : span.value;
      const row = byIndex.get(index);
      const target = row ? String(row.target ?? "") : original;
      const originalStatus = original ? native.status : "empty";
      targetChanged ||= original !== target;
      statusChanged ||= Boolean(row?.status && row.status !== originalStatus) || (row?.reviewState != null && (row.reviewState === "reviewed") !== (native.reviewState === "reviewed"));
      const sourceValue = layout.sourceRows[index].value;
      const kind = xliffPartKind(sourceValue);
      if (kind === "text") {
        allConfirmed &&= (row?.status || originalStatus) === "confirmed";
        allReviewed &&= (row?.reviewState ?? native.reviewState) === "reviewed";
      }
      const value = layout.empty && kind !== "text" && !target ? sourceValue : preserveLineWrapper(layout.empty ? sourceValue : original, target);
      return { start: span.start, end: span.end, value };
    });
    let target = native.target;
    if (targetChanged) {
      let cursor = 0;
      const chunks = [];
      for (const edit of replacements) {
        chunks.push(layout.template.slice(cursor, edit.start), edit.value);
        cursor = edit.end;
      }
      chunks.push(layout.template.slice(cursor));
      target = chunks.join("");
    }
    combined.push({
      ...native, target,
      status: statusChanged ? (allConfirmed ? "confirmed" : target.trim() ? "draft" : "empty") : native.status,
      reviewState: statusChanged ? (allReviewed ? "reviewed" : "") : native.reviewState,
      literalEdits: targetChanged ? { template: layout.template, replacements } : null
    });
  }
  if (groups.size) throw new Error("An original XLIFF unit for these rows is missing.");
  return combined;
}

function writeCharacterValue(node, value) {
  if (node.nodeType !== Node.CDATA_SECTION_NODE || !value.includes("]]>")) { node.data = value; return; }
  // XML forbids a literal CDATA terminator inside one CDATA section.
  const pieces = value.split("]]>");
  node.data = pieces[0] + "]]";
  let previous = node;
  for (let i = 1; i < pieces.length; i++) {
    const next = node.ownerDocument.createCDATASection(">" + pieces[i] + (i < pieces.length - 1 ? "]]" : ""));
    previous.after(next);
    previous = next;
  }
}

function replaceCharacterRange(element, first, last, value) {
  let offset = 0, inserted = false;
  for (const node of Array.from(element.childNodes)) {
    const end = offset + node.length;
    if (offset <= last && end >= first) {
      const a = Math.max(0, first - offset), b = Math.min(node.length, last - offset);
      const updated = node.data.slice(0, a) + (inserted ? "" : value) + node.data.slice(b);
      if (updated !== node.data) writeCharacterValue(node, updated);
      inserted = true;
    }
    offset = end;
  }
}

function updateLiteralTarget(xml, target, source, segment) {
  const value = String(segment.target ?? "");
  if (target.textContent === value) return;
  const plan = segment.literalEdits;
  if (!target.hasChildNodes() || (plan && target.textContent !== plan.template && source.textContent === plan.template)) {
    removeChildren(target);
    if (plan && source.textContent === plan.template) {
      for (const child of source.childNodes) target.appendChild(xml.importNode(child, true));
    } else target.appendChild(source.firstChild?.nodeType === Node.CDATA_SECTION_NODE ? xml.createCDATASection("") : xml.createTextNode(""));
  }
  if (plan && target.textContent === plan.template) {
    for (let i = plan.replacements.length - 1; i >= 0; i--) {
      const { start, end, value: replacement } = plan.replacements[i];
      if (plan.template.slice(start, end) !== replacement) replaceCharacterRange(target, start, end, replacement);
    }
  } else {
    const original = target.textContent;
    let a = 0, b = original.length, c = value.length;
    while (a < b && a < c && original[a] === value[a]) a++;
    while (b > a && c > a && original[b - 1] === value[c - 1]) { b--; c--; }
    replaceCharacterRange(target, a, b, value.slice(a, c));
  }
}

function xliff12ReconstructedContent(value, sourceElement, targetElement) {
  const templates = new Map();
  const serializer = new XMLSerializer();
  // Map the editor's short tokens back to the original inline XML. Rebuilding
  // them as generic <g>/<ph> codes loses vendor IDs, rid links and native data.
  for (const container of [sourceElement, targetElement].filter(Boolean)) {
    const localTemplates = new Map();
    const add = (token, xmlText) => {
      if (!token) return;
      if (!localTemplates.has(token)) localTemplates.set(token, []);
      localTemplates.get(token).push(xmlText);
    };
    const visit = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const name = localName(node);
      if (["ph", "x", "bx", "ex", "bpt", "ept", "it"].includes(name)) {
        add(xliff12NodeContent(node), serializer.serializeToString(node));
        return;
      }
      if (name === "g") {
        const semantic = semanticTagForXliffElement(node);
        const token = semantic ? xliff12SemanticOpening(node, semantic) : attr(node, "id") ? `<g id="${attr(node, "id")}">` : "";
        const opening = serializer.serializeToString(node.cloneNode(false)).replace(/\/>$/, ">");
        add(token, opening);
        Array.from(node.childNodes).forEach(visit);
        add(semantic ? `</${semantic}>` : token ? "</g>" : "", `</${node.nodeName}>`);
        return;
      }
      Array.from(node.childNodes).forEach(visit);
    };
    Array.from(container.childNodes).forEach(visit);
    for (const [token, values] of localTemplates) {
      const existing = templates.get(token) || [];
      templates.set(token, values.concat(existing.slice(values.length)));
    }
  }
  if (!templates.size) return escText(value);
  const escaped = [...templates.keys()].sort((a, b) => b.length - a.length).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(escaped.join("|"), "g");
  const counts = new Map();
  let output = "", cursor = 0, match;
  while ((match = pattern.exec(String(value || "")))) {
    output += escText(String(value || "").slice(cursor, match.index));
    const index = counts.get(match[0]) || 0;
    const template = templates.get(match[0])[index];
    if (template == null) throw new Error("XLIFF 1.2 target contains duplicated inline codes.");
    counts.set(match[0], index + 1);
    output += template;
    cursor = match.index + match[0].length;
  }
  return output + escText(String(value || "").slice(cursor));
}

function updateXliff12TargetElement(xml, targetElement, segment, sourceElement) {
  if (segment.structure?.unmappedTargetMarkers) {
    // An edit contained in one text node has an unambiguous owner, even when
    // the target producer's mids differ. Never flatten or guess across markers.
    const value = String(segment.target ?? ""), original = xliff12NodeContent(targetElement);
    if (value === original) return;
    let start = 0, oldEnd = original.length, newEnd = value.length;
    while (start < oldEnd && start < newEnd && original[start] === value[start]) start++;
    while (oldEnd > start && newEnd > start && original[oldEnd - 1] === value[newEnd - 1]) { oldEnd--; newEnd--; }
    if (targetElement.textContent === original) {
      const walker = xml.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_CDATA_SECTION);
      let offset = 0, node;
      while ((node = walker.nextNode())) {
        if (start >= offset && oldEnd <= offset + node.length) {
          writeCharacterValue(node, node.data.slice(0, start - offset) + value.slice(start, newEnd) + node.data.slice(oldEnd - offset));
          return;
        }
        offset += node.length;
      }
    }
    throw new Error("The edited target spans unmatched XLIFF segment markers.");
  }
  if (characterContent(sourceElement) && characterContent(targetElement)) {
    updateLiteralTarget(xml, targetElement, sourceElement, segment);
    return;
  }
  const content = xliff12ReconstructedContent(segment.target || "", sourceElement, targetElement);
  appendInlineFragment(xml, targetElement, content);
}

function updateXliff12Targets(xml, segments) {
  descendantsByName(xml, "trans-unit").forEach((unit, index) => {
    if (effectiveAttribute(unit, "translate", "yes").toLowerCase() === "no") return;
    const segmented = segments.filter((segment) => sameStructureIndex(segment, index) && segment.structure?.segmentMid);
    if (segmented.length) {
      const segmentedSource = firstChildByName(unit, "seg-source");
      const sourceMarkers = descendantsByName(segmentedSource, "mrk").filter((node) => attr(node, "mtype") === "seg");
      const existing = firstChildByName(unit, "target");
      if (!existing && segmented.every((segment) => !segment.target)) return;
      const target = existing || ensureDirectChildAfter(xml, unit, "target", segmentedSource || firstChildByName(unit, "source"));
      const targetMarkers = descendantsByName(target, "mrk").filter((node) => attr(node, "mtype") === "seg");
      if (!targetMarkers.length) {
        if (segmented.every((segment) => !segment.target)) return;
        if ((target.textContent || "").trim()) throw new Error("Segmented XLIFF target is missing segment markers.");
        Array.from(segmentedSource.childNodes).forEach((child) => target.appendChild(xml.importNode(child, true)));
        descendantsByName(target, "mrk").filter((node) => attr(node, "mtype") === "seg").forEach(removeChildren);
      }
      let stateChanged = false;
      for (const segment of segmented) {
        const mid = segment.structure.segmentMid;
        const source = sourceMarkers.find((node) => attr(node, "mid") === mid);
        const marker = descendantsByName(target, "mrk").find((node) => attr(node, "mtype") === "seg" && attr(node, "mid") === mid);
        if (!marker && !segment.target) continue;
        if (!source || !marker) throw new Error(`XLIFF segment marker ${mid} is missing.`);
        const originalValue = xliff12NodeContent(marker);
        stateChanged ||= Boolean(segment.status && segment.status !== statusForXliff12Target(target, originalValue));
        if (originalValue !== String(segment.target ?? "")) updateXliff12TargetElement(xml, marker, segment, source);
      }
      if (stateChanged || !existing) target.setAttribute("state", segmented.every((segment) => segment.status === "confirmed") ? "translated" : "needs-review-translation");
      return;
    }
    const segment = findSegmentForTransUnit(segments, unit, index);
    if (!segment) return;
    const sourceElement = firstChildByName(unit, "source") || firstChildByName(firstChildByName(unit, "seg-source"), "mrk");
    const existing = firstChildByName(unit, "target");
    const originalValue = xliff12NodeContent(existing);
    const contentChanged = originalValue !== String(segment.target ?? "");
    const stateChanged = segment.status && segment.status !== statusForXliff12Target(existing, originalValue);
    if (!contentChanged && !stateChanged) return;
    const targetElement = existing || ensureDirectChildAfter(xml, unit, "target", sourceElement);
    if (stateChanged || !existing) targetElement.setAttribute("state", stateForXliff12(segment));
    if (contentChanged) updateXliff12TargetElement(xml, targetElement, segment, sourceElement);
  });
}

function templateMapForXliff2Segment(segmentElement) {
  const templates = new Map();
  for (const container of [firstChildByName(segmentElement, "target", segmentElement.namespaceURI), firstChildByName(segmentElement, "source", segmentElement.namespaceURI)].filter(Boolean)) {
    const counters = new Map();
    for (const node of Array.from(container.getElementsByTagNameNS("*", "*"))) {
      if (!XLIFF_2_INLINE_NAMES.has(localName(node))) continue;
      const key = inlineKey(node, counters);
      if (!templates.has(key)) templates.set(key, node);
    }
  }
  return templates;
}

function prepareXliff2InternalFragment(content) {
  const text = String(content || "");
  const pattern = /<\s*(\/?)\s*(cp|ph|pc|sc|ec|mrk|sm|em)\b([^>]*)>/gi;
  let output = "";
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    output += escText(text.slice(cursor, match.index));
    output += match[0];
    cursor = match.index + match[0].length;
  }
  output += escText(text.slice(cursor));
  return output;
}

function copyInternalIdentityAttributes(source, target) {
  for (const name of ["id", "startRef", "hex", "copyOf"]) {
    const value = attr(source, name);
    if (value) target.setAttribute(name, value);
  }
}

function appendXliff2InlineNode(xml, parent, node, templates) {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    parent.appendChild(xml.createTextNode(node.nodeValue || ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const name = localName(node);
  if (!XLIFF_2_INLINE_NAMES.has(name)) throw new Error(`XLIFF 2.x target contains unsupported inline tag <${name}>.`);
  const key = attr(node, "data-lc-key");
  const template = key ? templates.get(key) : null;
  const element = template
    ? xml.importNode(template, false)
    : xml.createElementNS(xml.documentElement.namespaceURI, name);
  element.removeAttribute("data-lc-key");
  copyInternalIdentityAttributes(node, element);
  parent.appendChild(element);
  Array.from(node.childNodes).forEach((child) => appendXliff2InlineNode(xml, element, child, templates));
}

function appendXliff2InlineContent(xml, targetElement, content, segmentElement) {
  const namespace = xml.documentElement.namespaceURI;
  const prepared = prepareXliff2InternalFragment(content);
  const fragment = parseXml(`<root xmlns="${namespace}">${prepared}</root>`);
  const templates = templateMapForXliff2Segment(segmentElement);
  removeChildren(targetElement);
  Array.from(fragment.documentElement.childNodes).forEach((child) => appendXliff2InlineNode(xml, targetElement, child, templates));
}

function updateXliff2Targets(xml, segments, project) {
  const root = xml.documentElement;
  const namespace = root.namespaceURI;
  const files = directChildrenByName(root, "file", namespace);
  const units = files.flatMap((file) => descendantsByName(file, "unit", namespace).filter((unit) => ancestorByName(unit, "file") === file));
  units.forEach((unit, unitIndex) => {
    const file = ancestorByName(unit, "file");
    directChildrenByName(unit, "segment", namespace).forEach((segmentElement, segmentIndex) => {
      const segment = findSegmentForXliff2(segments, file, unit, segmentElement, unitIndex, segmentIndex);
      if (!segment) return;
      const sourceElement = firstChildByName(segmentElement, "source", namespace);
      const existing = firstChildByName(segmentElement, "target", namespace);
      const originalValue = xliff2NodeContent(existing);
      const originalState = statusForXliff2Segment(segmentElement, originalValue);
      const contentChanged = originalValue !== String(segment.target ?? "");
      const stateChanged = (segment.status && segment.status !== originalState.status) ||
        (segment.reviewState != null && (segment.reviewState === "reviewed") !== (originalState.reviewState === "reviewed"));
      if (!contentChanged && !stateChanged) return;
      if (stateChanged || (!existing && contentChanged)) {
        const state = stateForXliff2(segment);
        if (attr(segmentElement, "state") !== state) {
          segmentElement.setAttribute("state", state);
          segmentElement.removeAttribute("subState");
        }
      }
      if (!contentChanged) return;
      const targetElement = existing || ensureDirectChildAfter(xml, segmentElement, "target", sourceElement);
      if (!attr(root, "trgLang") && cleanText(project?.targetLang)) root.setAttribute("trgLang", cleanText(project.targetLang));
      if (characterContent(sourceElement) && characterContent(targetElement)) updateLiteralTarget(xml, targetElement, sourceElement, segment);
      else appendXliff2InlineContent(xml, targetElement, segment.target || "", segmentElement);
    });
  });
}

// The DOM normalizes declarations, entity spellings and physical newlines. For
// text-only edits splice the changed character range into the original XML.
function originalTextExport(input, before, after) {
  if (/<!DOCTYPE\b/i.test(input)) return null;
  const changes = new Map();
  const pending = [[before.documentElement, after.documentElement]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return null;
    if (a.nodeType === Node.TEXT_NODE || a.nodeType === Node.CDATA_SECTION_NODE) {
      if (a.data !== b.data) changes.set(a, b.data);
    } else if (a.nodeType === Node.ELEMENT_NODE) {
      if (!a.cloneNode(false).isEqualNode(b.cloneNode(false)) || a.childNodes.length !== b.childNodes.length) return null;
      for (let i = 0; i < a.childNodes.length; i++) pending.push([a.childNodes[i], b.childNodes[i]]);
    } else if (!a.isEqualNode(b)) return null;
  }
  if (!changes.size) return input;
  const elements = Array.from(before.getElementsByTagName("*"));
  const stack = [];
  const patches = [];
  let elementIndex = 0;
  const tokens = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/[^>]*>|<(?:[^<>"']|"[^"]*"|'[^']*')+>|[^<]+/g;
  for (const { 0: token, index } of input.matchAll(tokens)) {
    if (token.startsWith("<?") || token.startsWith("<!--")) continue;
    if (token.startsWith("</")) { stack.pop(); continue; }
    const cdata = token.startsWith("<![CDATA[");
    if (token[0] === "<" && !cdata) {
      const element = elements[elementIndex++];
      if (!element) return null;
      if (!token.endsWith("/>")) stack.push({ nodes: Array.from(element.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE), cursor: 0 });
      continue;
    }
    const frame = stack.at(-1);
    if (!frame) continue;
    const node = frame.nodes[frame.cursor++];
    if (!node || !changes.has(node)) continue;
    const raw = cdata ? token.slice(9, -3) : token;
    const value = changes.get(node);
    let prefix = 0, suffix = 0;
    while (prefix < value.length && prefix < node.length && node.data[prefix] === value[prefix]) prefix++;
    while (suffix < value.length - prefix && suffix < node.length - prefix && node.data[node.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++;
    let logical = 0, start = -1, end = -1;
    // Walk Unicode code points and XML references together. An entity or
    // surrogate pair is never cut in half, even when a translated emoji changes.
    const atoms = cdata ? /\r\n?|[\s\S]/gu : /&(?:#x[\da-f]+|#\d+|amp|lt|gt|apos|quot);|\r\n?|[\s\S]/giu;
    const decoded = [];
    for (const { 0: atom, index: offset } of raw.matchAll(atoms)) {
      let char = atom;
      if (atom[0] === "\r") char = "\n";
      else if (!cdata && atom[0] === "&" && atom.length > 1) {
        if (atom[1] === "#") char = String.fromCodePoint(atom[2].toLowerCase() === "x" ? parseInt(atom.slice(3), 16) : parseInt(atom.slice(2), 10));
        else char = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[atom];
      }
      if (logical <= prefix) start = offset;
      if (logical === node.length - suffix) end = offset;
      if (logical < prefix && logical + char.length > prefix) prefix = logical;
      if (logical < node.length - suffix && logical + char.length > node.length - suffix) suffix = node.length - logical - char.length;
      decoded.push(char); logical += char.length;
    }
    if (logical === prefix) start = raw.length;
    if (logical === node.length - suffix) end = raw.length;
    if (start < 0 || end < start || decoded.join("") !== node.data) return null;
    const replacement = value.slice(prefix, value.length - suffix);
    if (cdata && (raw.slice(0, start) + replacement + raw.slice(end)).includes("]]>")) return null;
    const base = index + (cdata ? 9 : 0);
    patches.push({ start: base + start, end: base + end, value: cdata ? replacement : escText(replacement) });
    changes.delete(node);
  }
  if (changes.size) return null;
  let cursor = 0;
  const result = [];
  for (const patch of patches) {
    result.push(input.slice(cursor, patch.start), patch.value);
    cursor = patch.end;
  }
  return result.join("") + input.slice(cursor);
}

function buildTargetXliff(project, segments, structure = null) {
  if (!structure?.source) throw new Error("XLIFF reconstruction source data is missing.");
  const xml = parseXml(structure.source);
  const profile = detectXliffProfile(xml);
  const targetSegments = assembleBilingualRows(Array.isArray(segments) ? segments : [], xml, profile);
  const original = xml.cloneNode(true);
  if (profile.family === "2") {
    validateXliff2Document(xml, profile);
    updateXliff2Targets(xml, targetSegments, project);
    validateXliff2Document(xml, profile);
  } else {
    updateXliff12Targets(xml, targetSegments);
  }
  if (xml.isEqualNode(original)) return structure.source;
  return originalTextExport(structure.source, original, xml) ?? serializeXml(xml);
}

function xliffMimeType(version = "1.2") {
  return String(version).startsWith("2") ? "application/xliff+xml" : "application/x-xliff+xml";
}

window.CatHan.xliff = {
  buildXliff,
  buildXliff22,
  buildTargetXliff,
  detectXliffProfile,
  parseXliffFile,
  parseXliffText,
  validateXliff2Document,
  xliffMimeType
};
})();
