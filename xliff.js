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

function xliffSegmentRecord(segment = {}, index = 0) {
  const source = requiredText(segment.source, `XLIFF segment ${index + 1} source text is required.`);
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
  const xml = new DOMParser().parseFromString(text, "application/xml");
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
    if (semantic) return `<${semantic}>${children}</${semantic}>`;
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

function transUnitSegments(xml) {
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
  return descendantsByName(xml, "trans-unit").map((unit, index) => {
    const sourceElement = firstChildByName(unit, "source") || firstChildByName(firstChildByName(unit, "seg-source"), "mrk");
    const targetElement = firstChildByName(unit, "target");
    const source = xliff12NodeContent(sourceElement).trim();
    const target = xliff12NodeContent(targetElement).trim();
    const notes = directChildrenByName(unit, "note").map((note) => (note.textContent || "").trim()).filter(Boolean);
    const fileInfo = fileOriginalByUnit.get(unit) || {};
    return {
      text: source,
      target,
      key: attr(unit, "id") || `trans-unit-${index + 1}`,
      status: statusForXliff12Target(targetElement, target),
      tags: detectTags(source),
      comment: notes.join("\n"),
      structure: {
        format: "xliff",
        version: "1.2",
        namespace: xml.documentElement?.namespaceURI || XLIFF_12_NAMESPACE,
        unitId: attr(unit, "id") || "",
        unitIndex: index,
        fileOriginal: fileInfo.original || "",
        fileIndex: fileInfo.fileIndex ?? 0,
        sourceLang: fileInfo.sourceLang || "",
        targetLang: fileInfo.targetLang || ""
      }
    };
  }).filter((unit) => unit.text);
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

function xliff2Segments(xml, profile) {
  validateXliff2Document(xml, profile);
  const root = xml.documentElement;
  const files = directChildrenByName(root, "file", profile.namespace);
  const fileIndexes = new Map(files.map((file, index) => [file, index]));
  const units = files.flatMap((file) => descendantsByName(file, "unit", profile.namespace).filter((unit) => ancestorByName(unit, "file") === file));
  return units.flatMap((unit, unitIndex) => {
    if (effectiveAttribute(unit, "translate", "yes").toLowerCase() === "no") return [];
    const file = ancestorByName(unit, "file");
    return directChildrenByName(unit, "segment", profile.namespace).map((segmentElement, segmentIndex) => {
      const sourceElement = firstChildByName(segmentElement, "source", profile.namespace);
      const targetElement = firstChildByName(segmentElement, "target", profile.namespace);
      const source = xliff2NodeContent(sourceElement, { counters: new Map() });
      const target = xliff2NodeContent(targetElement, { counters: new Map() });
      const state = statusForXliff2Segment(segmentElement, target);
      const notes = notesForXliff2Segment(unit, segmentElement);
      return {
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
      };
    });
  }).filter((unit) => String(unit.text || "").trim());
}

function parseXliffText(text, fileName = "file.xlf") {
  const xml = parseXml(text);
  const profile = detectXliffProfile(xml);
  const segments = profile.family === "2" ? xliff2Segments(xml, profile) : transUnitSegments(xml);
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
  const parsed = parseXliffText(decoded.text, file.name);
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
  if (segment.status === "confirmed") return "translated";
  if (segment.status === "draft") return "needs-review-translation";
  return "new";
}

function stateForXliff2(segment) {
  if (segment.status === "confirmed") return segment.reviewState === "reviewed" ? "reviewed" : "final";
  if (String(segment.target || "").trim()) return "translated";
  return "initial";
}

function buildXliff(project, segments) {
  const metadata = xliffProjectMetadata(project);
  const units = (segments || [])
    .map((segment, index) => xliffSegmentRecord(segment, index))
    .map((segment, index) => `      <trans-unit id="${esc(segment.id || index + 1)}" resname="${index + 1}">
        <source>${xliffInlineContent(segment.source)}</source>
        <target state="${stateForXliff12(segment)}">${xliffInlineContent(segment.target || "")}</target>
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
  const units = (segments || [])
    .map((segment, index) => xliffSegmentRecord(segment, index))
    .map((segment, index) => {
      const sourceInline = compileGenericXliff22Inline(segment.source);
      const targetInline = compileGenericXliff22Inline(segment.target || "", sourceInline.plan);
      const target = String(segment.target || "").trim()
        ? `\n        <target>${targetInline.output}</target>`
        : "";
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
    || (unitId ? segments.find((segment) => segment.structure?.unitId === unitId) : null)
    || segments[index]
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

function updateXliff12TargetElement(xml, targetElement, segment) {
  targetElement.setAttribute("state", stateForXliff12(segment));
  appendInlineFragment(xml, targetElement, xliffInlineContent(segment.target || ""));
}

function updateXliff12Targets(xml, segments) {
  descendantsByName(xml, "trans-unit").forEach((unit, index) => {
    const segment = findSegmentForTransUnit(segments, unit, index);
    if (!segment) return;
    const sourceElement = firstChildByName(unit, "source") || firstChildByName(firstChildByName(unit, "seg-source"), "mrk");
    const targetElement = ensureDirectChildAfter(xml, unit, "target", sourceElement);
    updateXliff12TargetElement(xml, targetElement, segment);
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
  const targetLang = cleanText(project?.targetLang) || attr(root, "trgLang");
  if (targetLang) root.setAttribute("trgLang", targetLang);
  const namespace = root.namespaceURI;
  const files = directChildrenByName(root, "file", namespace);
  const units = files.flatMap((file) => descendantsByName(file, "unit", namespace).filter((unit) => ancestorByName(unit, "file") === file));
  units.forEach((unit, unitIndex) => {
    const file = ancestorByName(unit, "file");
    directChildrenByName(unit, "segment", namespace).forEach((segmentElement, segmentIndex) => {
      const segment = findSegmentForXliff2(segments, file, unit, segmentElement, unitIndex, segmentIndex);
      if (!segment) return;
      const sourceElement = firstChildByName(segmentElement, "source", namespace);
      const targetElement = ensureDirectChildAfter(xml, segmentElement, "target", sourceElement);
      targetElement.removeAttribute("state");
      targetElement.removeAttribute("state-qualifier");
      segmentElement.setAttribute("state", stateForXliff2(segment));
      segmentElement.removeAttribute("subState");
      appendXliff2InlineContent(xml, targetElement, segment.target || "", segmentElement);
    });
  });
}

function buildTargetXliff(project, segments, structure = null) {
  if (!structure?.source) throw new Error("XLIFF reconstruction source data is missing.");
  const targetSegments = Array.isArray(segments) ? segments : [];
  const xml = parseXml(structure.source);
  const profile = detectXliffProfile(xml);
  if (profile.family === "2") {
    validateXliff2Document(xml, profile);
    updateXliff2Targets(xml, targetSegments, project);
    validateXliff2Document(xml, profile);
  } else {
    updateXliff12Targets(xml, targetSegments);
  }
  return serializeXml(xml);
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
