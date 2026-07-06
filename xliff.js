(() => {
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

function localName(element) {
  return String(element?.localName || "").toLowerCase();
}

function directChildrenByName(element, name) {
  return Array.from(element?.childNodes || []).filter((child) => child.nodeType === Node.ELEMENT_NODE && localName(child) === name);
}

function firstChildByName(element, name) {
  return directChildrenByName(element, name)[0] || null;
}

function descendantsByName(element, name) {
  return Array.from(element?.getElementsByTagNameNS?.("*", name) || []);
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

function xliffNodeContent(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const name = localName(node);
  const children = Array.from(node.childNodes).map(xliffNodeContent).join("");
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

function statusForTarget(targetElement, targetText) {
  if (!String(targetText || "").trim()) return "empty";
  const state = String(attr(targetElement, "state") || attr(targetElement, "state-qualifier") || "").toLowerCase();
  if (state.includes("translated") || state.includes("final") || state.includes("signed-off")) return "confirmed";
  return "draft";
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
    const source = xliffNodeContent(sourceElement).trim();
    const target = xliffNodeContent(targetElement).trim();
    const notes = directChildrenByName(unit, "note").map((note) => (note.textContent || "").trim()).filter(Boolean);
    const fileInfo = fileOriginalByUnit.get(unit) || {};
    return {
      text: source,
      target,
      key: attr(unit, "id") || `trans-unit-${index + 1}`,
      status: statusForTarget(targetElement, target),
      tags: detectTags(source),
      comment: notes.join("\n"),
      structure: {
        format: "xliff",
        version: "1.2",
        unitId: attr(unit, "id") || "",
        unitIndex: index,
        fileOriginal: fileInfo.original || "",
        fileIndex: fileInfo.fileIndex || 0,
        sourceLang: fileInfo.sourceLang || "",
        targetLang: fileInfo.targetLang || ""
      }
    };
  }).filter((unit) => unit.text);
}

function xliff20Segments(xml) {
  const units = descendantsByName(xml, "unit");
  return units.flatMap((unit, unitIndex) => descendantsByName(unit, "segment").map((segment, segmentIndex) => {
    const sourceElement = firstChildByName(segment, "source");
    const targetElement = firstChildByName(segment, "target");
    const source = xliffNodeContent(sourceElement).trim();
    const target = xliffNodeContent(targetElement).trim();
    return {
      text: source,
      target,
      key: `${attr(unit, "id") || `unit-${unitIndex + 1}`}:${attr(segment, "id") || segmentIndex + 1}`,
      status: statusForTarget(targetElement, target),
      tags: detectTags(source),
      structure: {
        format: "xliff",
        version: "2.0",
        unitId: attr(unit, "id") || "",
        segmentId: attr(segment, "id") || "",
        unitIndex,
        segmentIndex
      }
    };
  })).filter((unit) => unit.text);
}

function parseXliffText(text, fileName = "file.xlf") {
  const xml = parseXml(text);
  const version = attr(xml.documentElement, "version") || "1.2";
  const segments = version.startsWith("2") ? xliff20Segments(xml) : transUnitSegments(xml);
  if (!segments.length) throw new Error("No translatable XLIFF units were found.");
  const ext = fileName.split(".").pop().toLowerCase() || "xlf";
  return {
    fileName,
    documentName: stripExt(fileName),
    documentType: ["xlf", "xliff", "sdlxliff"].includes(ext) ? ext : "xlf",
    segments,
    structure: {
      format: "xliff",
      version,
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

function stateFor(segment) {
  if (segment.status === "confirmed") return "translated";
  if (segment.status === "draft") return "needs-review-translation";
  return "new";
}

function buildXliff(project, segments) {
  const metadata = xliffProjectMetadata(project);
  const units = (segments || [])
    .map((segment, index) => xliffSegmentRecord(segment, index))
    .map((segment, index) => `      <trans-unit id="${esc(segment.id || index + 1)}" resname="${index + 1}">
        <source>${xliffInlineContent(segment.source)}</source>
        <target state="${stateFor(segment)}">${xliffInlineContent(segment.target || "")}</target>
        <note>LoopCAT segment ${index + 1}</note>
      </trans-unit>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${esc(metadata.name)}" source-language="${esc(metadata.sourceLang)}" target-language="${esc(metadata.targetLang)}" datatype="plaintext">
    <body>
${units}
    </body>
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
  const existing = firstChildByName(parent, name);
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

function findSegmentForXliff20(segments, unit, segmentElement, unitIndex, segmentIndex) {
  const unitId = attr(unit, "id");
  const segmentId = attr(segmentElement, "id");
  return segments.find((segment) => sameStructureIndex(segment, unitIndex, "unitIndex") && sameStructureIndex(segment, segmentIndex, "segmentIndex"))
    || (unitId && segmentId ? segments.find((segment) => segment.structure?.unitId === unitId && segment.structure?.segmentId === segmentId) : null)
    || segments.find((segment) => sameStructureIndex(segment, segmentIndex, "segmentIndex"))
    || null;
}

function updateTargetElement(xml, targetElement, segment) {
  targetElement.setAttribute("state", stateFor(segment));
  appendInlineFragment(xml, targetElement, xliffInlineContent(segment.target || ""));
}

function updateXliff12Targets(xml, segments) {
  descendantsByName(xml, "trans-unit").forEach((unit, index) => {
    const segment = findSegmentForTransUnit(segments, unit, index);
    if (!segment) return;
    const sourceElement = firstChildByName(unit, "source") || firstChildByName(firstChildByName(unit, "seg-source"), "mrk");
    const targetElement = ensureDirectChildAfter(xml, unit, "target", sourceElement);
    updateTargetElement(xml, targetElement, segment);
  });
}

function updateXliff20Targets(xml, segments) {
  descendantsByName(xml, "unit").forEach((unit, unitIndex) => {
    descendantsByName(unit, "segment").forEach((segmentElement, segmentIndex) => {
      const segment = findSegmentForXliff20(segments, unit, segmentElement, unitIndex, segmentIndex);
      if (!segment) return;
      const sourceElement = firstChildByName(segmentElement, "source");
      const targetElement = ensureDirectChildAfter(xml, segmentElement, "target", sourceElement);
      updateTargetElement(xml, targetElement, segment);
    });
  });
}

function buildTargetXliff(project, segments, structure = null) {
  if (!structure?.source) throw new Error("XLIFF reconstruction source data is missing.");
  const targetSegments = Array.isArray(segments) ? segments : [];
  const xml = parseXml(structure.source);
  const version = attr(xml.documentElement, "version") || structure.version || "1.2";
  if (version.startsWith("2")) updateXliff20Targets(xml, targetSegments);
  else updateXliff12Targets(xml, targetSegments);
  return serializeXml(xml);
}

window.CatHan.xliff = { buildXliff, buildTargetXliff, parseXliffFile, parseXliffText };
})();
