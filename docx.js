(() => {
const detectProtectedTags = window.CatHan?.protectedTags?.detectProtectedTags;
if (typeof detectProtectedTags !== "function") {
  throw new TypeError("DOCX requires the synchronous protected-tag detector.");
}
const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const MAX_DOCX_UNZIPPED_BYTES = 150 * 1024 * 1024;

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function writeUint16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes) {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  throw new Error("Could not read DOCX zip directory.");
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress DOCX files locally. Try a recent Chromium, Edge, or Safari version.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(arrayBufferOrBytes) {
  const bytes = arrayBufferOrBytes instanceof Uint8Array ? arrayBufferOrBytes : new Uint8Array(arrayBufferOrBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocd + 10);
  const centralDirectoryOffset = readUint32(view, eocd + 16);
  const entries = new Map();
  let ptr = centralDirectoryOffset;
  let totalUncompressedSize = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (readUint32(view, ptr) !== 0x02014b50) throw new Error("Invalid DOCX central directory.");
    const compressionMethod = readUint16(view, ptr + 10);
    const compressedSize = readUint32(view, ptr + 20);
    const uncompressedSize = readUint32(view, ptr + 24);
    const fileNameLength = readUint16(view, ptr + 28);
    const extraLength = readUint16(view, ptr + 30);
    const commentLength = readUint16(view, ptr + 32);
    const localHeaderOffset = readUint32(view, ptr + 42);
    const nameBytes = bytes.slice(ptr + 46, ptr + 46 + fileNameLength);
    const name = textDecoder.decode(nameBytes).replaceAll("\\", "/");
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_DOCX_UNZIPPED_BYTES) {
      throw new Error("DOCX package is too large after decompression. Try splitting the document or removing embedded content.");
    }

    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = await inflateRaw(compressed);
    else throw new Error(`Unsupported DOCX compression method: ${compressionMethod}`);
    if (data.length !== uncompressedSize && uncompressedSize > 0) {
      throw new Error(`DOCX entry ${name} has an unexpected decompressed size.`);
    }
    entries.set(name, { name, data });
    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function zipEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const items = Array.from(entries.values());

  items.forEach((entry) => {
    const nameBytes = textEncoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : textEncoder.encode(String(entry.data));
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  writeUint32(eocd, 0, 0x06054b50);
  writeUint16(eocd, 8, items.length);
  writeUint16(eocd, 10, items.length);
  writeUint32(eocd, 12, centralDirectory.length);
  writeUint32(eocd, 16, offset);
  writeUint16(eocd, 20, 0);

  return concatBytes([...localParts, centralDirectory, eocd]);
}

function readZipText(entries, path) {
  const entry = entries.get(path);
  return entry ? textDecoder.decode(entry.data) : "";
}

function docxTextPartPaths(entries) {
  const supported = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/;
  return Array.from(entries.keys())
    .filter((path) => supported.test(path))
    .sort((a, b) => {
      if (a === "word/document.xml") return -1;
      if (b === "word/document.xml") return 1;
      return a.localeCompare(b);
    });
}

function docxPartLabel(path) {
  if (path === "word/document.xml") return "Main document";
  if (/word\/header\d+\.xml$/.test(path)) return "Header";
  if (/word\/footer\d+\.xml$/.test(path)) return "Footer";
  if (path === "word/footnotes.xml") return "Footnotes";
  if (path === "word/endnotes.xml") return "Endnotes";
  if (path === "word/comments.xml") return "Comments";
  return path;
}

function parseXml(text, label) {
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const xml = new DOMParser().parseFromString(parserInput, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) throw new Error(`Could not parse the DOCX ${label} XML.`);
  return xml;
}

function xmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlUnescape(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function nodeText(node, scopeParagraph = null) {
  const parts = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.nodeValue);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (scopeParagraph && child.localName === "p" && child !== scopeParagraph) return;
      const name = child.localName;
      if (name === "del" || name === "moveFrom" || name === "delText") return;
      if (name === "tab") parts.push("\t");
      if (name === "br" || name === "cr") parts.push("\n");
      parts.push(nodeText(child, scopeParagraph));
    }
  });
  return parts.join("");
}

const SEMANTIC_INLINE_TAGS = new Map([
  ["b", { property: "b" }],
  ["i", { property: "i" }],
  ["u", { property: "u" }]
]);

function wrapInlineTags(tags, text) {
  return tags.reduceRight((value, tag) => `<${tag}>${value}</${tag}>`, xmlEscape(text));
}

function genericInlineTag(id, text) {
  return `<g id="${xmlEscape(id)}">${xmlEscape(text)}</g>`;
}

function serializedRunProperties(run) {
  const runProperties = directChildByName(run, "rPr");
  return runProperties ? new XMLSerializer().serializeToString(runProperties) : "";
}

function runPropertiesElement(rPrXml) {
  if (!rPrXml) return null;
  const wrapper = parseXml(`<root xmlns:w="${WORD_NS}">${rPrXml}</root>`, "run properties");
  return Array.from(wrapper.documentElement.childNodes).find(
    (child) => child.nodeType === Node.ELEMENT_NODE && /** @type {Element} */ (child).localName === "rPr"
  ) || null;
}

function runPropertyEnabled(runProperties, localNames) {
  return localNames.some((localName) => wordBooleanEnabled(directChildByName(runProperties, localName)));
}

function semanticTagsForRunProperties(rPrXml) {
  const runProperties = runPropertiesElement(rPrXml);
  if (!runProperties) return [];
  const tags = [];
  if (runPropertyEnabled(runProperties, ["b", "bCs"])) tags.push("b");
  if (runPropertyEnabled(runProperties, ["i", "iCs"])) tags.push("i");
  const underline = directChildByName(runProperties, "u");
  if (underline && wordBooleanEnabled(underline) && (underline.getAttribute("w:val") || underline.getAttribute("val") || "single") !== "none") tags.push("u");
  return tags;
}

function hasOnlySemanticRunProperties(rPrXml) {
  const runProperties = runPropertiesElement(rPrXml);
  if (!runProperties) return false;
  const allowed = new Set(["b", "bCs", "i", "iCs", "u"]);
  const children = Array.from(runProperties.childNodes).filter((child) => child.nodeType === Node.ELEMENT_NODE);
  return Boolean(children.length) && children.every((child) => allowed.has(/** @type {Element} */ (child).localName));
}

function wrapInlineTagsWithStyleId(tags, text, styleId = "") {
  return tags.reduceRight((value, tag, index) => {
    const idAttribute = index === 0 && styleId ? ` id="${xmlEscape(styleId)}"` : "";
    return `<${tag}${idAttribute}>${value}</${tag}>`;
  }, xmlEscape(text));
}

function visibleTextChunks(node, scopeParagraph, chunks = []) {
  node.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    if (scopeParagraph && child.localName === "p" && child !== scopeParagraph) return;
    const name = child.localName;
    if (name === "del" || name === "moveFrom" || name === "delText" || name === "instrText") return;
    if (name === "t") {
      chunks.push({
        text: child.textContent || "",
        rPrXml: serializedRunProperties(textNodeRun(child))
      });
      return;
    }
    if (name === "tab" || name === "br" || name === "cr" || name === "noBreakHyphen" || name === "softHyphen") {
      const text = name === "tab"
        ? "\t"
        : name === "br" || name === "cr"
          ? "\n"
          : name === "noBreakHyphen"
            ? "\u2011"
            : "\u00ad";
      chunks.push({
        text,
        rPrXml: serializedRunProperties(textNodeRun(child))
      });
      return;
    }
    visibleTextChunks(child, scopeParagraph, chunks);
  });
  return chunks;
}

function paragraphTextWithInlineTags(paragraph) {
  const runs = visibleTextChunks(paragraph, paragraph);
  const visibleRuns = runs.filter((run) => run.text.trim());
  if (!visibleRuns.length) return { text: "", inlineTags: [], baseRPrXml: "" };

  const formatLengths = new Map();
  visibleRuns.forEach((run) => {
    formatLengths.set(run.rPrXml, (formatLengths.get(run.rPrXml) || 0) + run.text.trim().length);
  });
  const formats = Array.from(formatLengths.keys());
  const baseRPrXml = formatLengths.has("")
    ? ""
    : formats.sort((a, b) => {
      const lengthDiff = (formatLengths.get(b) || 0) - (formatLengths.get(a) || 0);
      if (lengthDiff) return lengthDiff;
      return a.length - b.length;
    })[0] || "";

  if (formats.length <= 1) {
    return {
      text: runs.map((run) => run.text).join(""),
      inlineTags: [],
      baseRPrXml
    };
  }

  const formatIds = new Map();
  const inlineTags = [];
  const semanticTags = new Set();
  const text = runs.map((run) => {
    if (!run.text || run.rPrXml === baseRPrXml) return run.text;
    const semantic = semanticTagsForRunProperties(run.rPrXml);
    if (semantic.length) {
      semantic.forEach((tag) => semanticTags.add(tag));
      if (hasOnlySemanticRunProperties(run.rPrXml)) return wrapInlineTags(semantic, run.text);
      if (!formatIds.has(run.rPrXml)) {
        const id = `fmt${formatIds.size + 1}`;
        formatIds.set(run.rPrXml, id);
        inlineTags.push({ id, tag: semantic[0], rPrXml: run.rPrXml, semantic: true });
      }
      return wrapInlineTagsWithStyleId(semantic, run.text, formatIds.get(run.rPrXml));
    }
    if (!formatIds.has(run.rPrXml)) {
      const id = `fmt${formatIds.size + 1}`;
      formatIds.set(run.rPrXml, id);
      inlineTags.push({ id, rPrXml: run.rPrXml });
    }
    return genericInlineTag(formatIds.get(run.rPrXml), run.text);
  }).join("");

  semanticTags.forEach((tag) => inlineTags.push({ id: tag, tag, semantic: true }));
  return { text, inlineTags, baseRPrXml };
}

function detectInlineCodeRanges(text) {
  const ranges = [];
  for (const match of String(text || "").matchAll(/<(g|b|i|u)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
    ranges.push({ start: match.index || 0, end: (match.index || 0) + match[0].length });
  }
  return ranges;
}

const ACADEMIC_SENTENCE_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "cf",
  "fig",
  "figs",
  "eq",
  "eqs",
  "ref",
  "refs",
  "vol",
  "vols",
  "ed",
  "eds",
  "trans",
  "rev",
  "ch",
  "chs",
  "sec",
  "secs",
  "p",
  "pp",
  "bkz",
  "doc",
  "yrd"
]);

function nextVisibleCharacter(text, punctuationIndex) {
  let cursor = punctuationIndex + 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (/\s/u.test(char)) {
      cursor += 1;
      continue;
    }
    if (char === "<") {
      const close = text.indexOf(">", cursor + 1);
      if (close > cursor) {
        cursor = close + 1;
        continue;
      }
    }
    return char || "";
  }
  return "";
}

function abbreviationBeforeBoundary(text, punctuationIndex) {
  const before = text.slice(0, punctuationIndex + 1);
  const match = before.match(/(?:^|[\s([{"'])([\p{L}.]{1,24}\.)$/u);
  return match ? match[1] : "";
}

function isAbbreviationBoundary(text, punctuationIndex) {
  if (text[punctuationIndex] !== ".") return false;
  const token = abbreviationBeforeBoundary(text, punctuationIndex);
  if (!token) return false;
  if (/^(?:\p{L}{1,4}\.){2,}$/u.test(token)) return true;
  const normalized = token.toLowerCase().replace(/\.+$/g, "");
  if (ACADEMIC_SENTENCE_ABBREVIATIONS.has(normalized)) return true;
  const withoutPeriod = token.slice(0, -1);
  const next = nextVisibleCharacter(text, punctuationIndex);
  return withoutPeriod.length === 1 && withoutPeriod.toUpperCase() === withoutPeriod && /\p{Lu}/u.test(next);
}

function splitIntoSegments(text, structure) {
  const cleaned = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \f\v\u00a0]+/g, " ")
    .replace(/ *([\t\n]) */g, "$1")
    .trim();
  if (!cleaned) return [];
  const protectedRanges = [
    ...detectProtectedTags(cleaned).map((tag) => ({
      start: tag.index,
      end: tag.index + tag.text.length
    })),
    ...detectInlineCodeRanges(cleaned)
  ];
  const pieces = [];
  let start = 0;
  for (let index = 0; index < cleaned.length - 1; index += 1) {
    const char = cleaned[index];
    if (!/[.!?;:]/u.test(char) || !/\s/u.test(cleaned[index + 1] || "")) continue;
    const insideProtected = protectedRanges.some((range) => index >= range.start && index < range.end);
    if (insideProtected) continue;
    if (isAbbreviationBoundary(cleaned, index)) continue;
    const piece = cleaned.slice(start, index + 1).trim();
    if (piece) pieces.push(piece);
    start = index + 1;
  }
  const finalPiece = cleaned.slice(start).trim();
  if (finalPiece) pieces.push(finalPiece);
  return (pieces.length ? pieces : [cleaned]).map((piece, index) => ({
    text: piece,
    tags: detectProtectedTags(piece),
    structure: { ...structure, segmentInParagraph: index }
  }));
}

function closestParagraph(node) {
  let current = node?.parentElement || null;
  while (current) {
    if (current.localName === "p") return current;
    current = current.parentElement;
  }
  return null;
}

function paragraphTextNodes(paragraph) {
  return Array.from(paragraph.getElementsByTagNameNS("*", "t")).filter((node) => closestParagraph(node) === paragraph && !closestRevisionContainer(node, paragraph));
}

const WORD_VISIBLE_TEXT_CONTROL_NAMES = ["tab", "br", "cr", "noBreakHyphen", "softHyphen"];

function paragraphTextControlNodes(paragraph) {
  return WORD_VISIBLE_TEXT_CONTROL_NAMES.flatMap((localName) =>
    Array.from(paragraph.getElementsByTagNameNS("*", localName)).filter((node) => closestParagraph(node) === paragraph && !closestRevisionContainer(node, paragraph))
  );
}

function elementContainsParagraphText(element, paragraph) {
  return Array.from(element.getElementsByTagNameNS("*", "t")).some((node) => closestParagraph(node) === paragraph && !closestRevisionContainer(node, paragraph)) ||
    WORD_VISIBLE_TEXT_CONTROL_NAMES.some((localName) =>
      Array.from(element.getElementsByTagNameNS("*", localName)).some((node) => closestParagraph(node) === paragraph && !closestRevisionContainer(node, paragraph))
    );
}

function elementContainsDeletedRevisionText(element, paragraph) {
  return Array.from(element.getElementsByTagNameNS("*", "delText")).some((node) => closestParagraph(node) === paragraph) ||
    Array.from(element.getElementsByTagNameNS("*", "t")).some((node) => closestRevisionContainer(node, paragraph)?.localName === "moveFrom");
}

function deletedRevisionChildren(paragraph) {
  return Array.from(paragraph.childNodes).filter((child) => child.nodeType === Node.ELEMENT_NODE && (
    child.localName === "del" ||
    child.localName === "moveFrom" ||
    elementContainsDeletedRevisionText(child, paragraph)
  ));
}

function directChildByName(node, localName) {
  return Array.from(node?.childNodes || []).find((child) => child.nodeType === Node.ELEMENT_NODE && child.localName === localName) || null;
}

function wordBooleanEnabled(node) {
  if (!node) return false;
  const raw = node.getAttribute("w:val") || node.getAttribute("val") || node.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val");
  if (raw === null || raw === "") return true;
  return !["0", "false", "off"].includes(String(raw).toLowerCase());
}

function textNodeRun(textNode) {
  let node = textNode?.parentElement || null;
  while (node && node.localName !== "p") {
    if (node.localName === "r") return node;
    node = node.parentElement;
  }
  return null;
}

function topLevelParagraphChild(node, paragraph) {
  let current = node?.parentElement || null;
  let child = null;
  while (current && current !== paragraph) {
    child = current;
    current = current.parentElement;
  }
  return current === paragraph ? child : null;
}

const SUPPORTED_TEXT_WRAPPERS = new Set(["hyperlink", "fldSimple", "sdt", "customXml", "smartTag"]);

function commonTextWrapper(paragraph) {
  const textNodes = paragraphTextNodes(paragraph);
  if (!textNodes.length) return null;
  const wrappers = textNodes.map((node) => topLevelParagraphChild(node, paragraph));
  const first = wrappers[0];
  if (!first || !SUPPORTED_TEXT_WRAPPERS.has(first.localName)) return null;
  if (!wrappers.every((wrapper) => wrapper === first)) return null;
  if (first.localName === "sdt") return directChildByName(first, "sdtContent");
  return first;
}

function closestRevisionContainer(node, paragraph) {
  let current = node?.parentElement || null;
  while (current && current !== paragraph) {
    if (current.localName === "del" || current.localName === "moveFrom") return current;
    current = current.parentElement;
  }
  return null;
}

function runIsExplicitlyBold(run) {
  const runProperties = directChildByName(run, "rPr");
  if (!runProperties) return false;
  return wordBooleanEnabled(directChildByName(runProperties, "b")) || wordBooleanEnabled(directChildByName(runProperties, "bCs"));
}

function replacementTextNode(paragraph) {
  const textNodes = paragraphTextNodes(paragraph);
  if (textNodes.length <= 1) return textNodes[0] || null;

  const candidates = textNodes.map((node, index) => ({
    node,
    index,
    length: (node.textContent || "").trim().length,
    bold: runIsExplicitlyBold(textNodeRun(node))
  }));
  const visible = candidates.filter((candidate) => candidate.length > 0);
  const preferred = visible.filter((candidate) => !candidate.bold);
  const pool = preferred.length ? preferred : visible.length ? visible : candidates;
  return pool.reduce((best, candidate) => {
    if (!best || candidate.length > best.length) return candidate;
    return best;
  }, null)?.node || textNodes[0];
}

function replaceParagraphText(paragraph, text) {
  const textNodes = paragraphTextNodes(paragraph);
  if (!textNodes.length) return;
  const targetNode = replacementTextNode(paragraph);
  targetNode.textContent = text;
  targetNode.setAttributeNS(XML_NS, "xml:space", "preserve");
  textNodes.forEach((node) => {
    if (node !== targetNode) node.textContent = "";
  });
  deletedRevisionChildren(paragraph).forEach((child) => child.remove());
}

function runPropertiesFromXml(xml, rPrXml) {
  if (!rPrXml) return null;
  const wrapper = parseXml(`<root xmlns:w="${WORD_NS}">${rPrXml}</root>`, "run properties");
  const runProperties = Array.from(wrapper.documentElement.childNodes).find((child) => child.nodeType === Node.ELEMENT_NODE);
  return runProperties ? xml.importNode(runProperties, true) : null;
}

function ensureRunPropertiesXml(baseRPrXml, semanticTags = []) {
  if (!semanticTags.length) return baseRPrXml || "";
  const xml = parseXml(
    baseRPrXml ? `<root xmlns:w="${WORD_NS}">${baseRPrXml}</root>` : `<root xmlns:w="${WORD_NS}"><w:rPr/></root>`,
    "semantic run properties"
  );
  const runProperties = Array.from(xml.documentElement.childNodes).find(
    (child) => child.nodeType === Node.ELEMENT_NODE && /** @type {Element} */ (child).localName === "rPr"
  );
  semanticTags.forEach((tag) => {
    if (tag === "b" && !directChildByName(runProperties, "b")) runProperties.appendChild(xml.createElementNS(WORD_NS, "w:b"));
    if (tag === "i" && !directChildByName(runProperties, "i")) runProperties.appendChild(xml.createElementNS(WORD_NS, "w:i"));
    if (tag === "u" && !directChildByName(runProperties, "u")) {
      const underline = xml.createElementNS(WORD_NS, "w:u");
      underline.setAttributeNS(WORD_NS, "w:val", "single");
      runProperties.appendChild(underline);
    }
  });
  return new XMLSerializer().serializeToString(runProperties);
}

function appendRunText(xml, run, text) {
  String(text || "").split(/(\t|\n|\u2011|\u00ad)/u).forEach((part) => {
    if (!part) return;
    if (part === "\t") {
      run.appendChild(xml.createElementNS(WORD_NS, "w:tab"));
      return;
    }
    if (part === "\n") {
      run.appendChild(xml.createElementNS(WORD_NS, "w:br"));
      return;
    }
    if (part === "\u2011") {
      run.appendChild(xml.createElementNS(WORD_NS, "w:noBreakHyphen"));
      return;
    }
    if (part === "\u00ad") {
      run.appendChild(xml.createElementNS(WORD_NS, "w:softHyphen"));
      return;
    }
    const textNode = xml.createElementNS(WORD_NS, "w:t");
    textNode.setAttributeNS(XML_NS, "xml:space", "preserve");
    textNode.textContent = part;
    run.appendChild(textNode);
  });
}

function createTextRun(xml, text, rPrXml) {
  const run = xml.createElementNS(WORD_NS, "w:r");
  const runProperties = runPropertiesFromXml(xml, rPrXml);
  if (runProperties) run.appendChild(runProperties);
  appendRunText(xml, run, text);
  return run;
}

function inlineFormatMap(inlineTags = []) {
  return new Map(inlineTags.map((tag) => [tag.id, tag.rPrXml || ""]));
}

function parseInlineTaggedText(text, inlineTags = [], baseRPrXml = "") {
  const formats = inlineFormatMap(inlineTags);
  const pieces = [];
  const stack = [];
  const pattern = /<\s*(\/?)\s*(g|b|i|u)\b([^>]*)>/gi;
  let cursor = 0;
  let match;
  const activeFormat = () => {
    const exactStyle = [...stack].reverse().find((item) => item.id && formats.has(item.id));
    const semantic = stack.filter((item) => SEMANTIC_INLINE_TAGS.has(item.type)).map((item) => item.type);
    return ensureRunPropertiesXml(exactStyle ? formats.get(exactStyle.id) || "" : baseRPrXml, semantic);
  };
  const pushText = (value) => {
    if (!value) return;
    const decoded = xmlUnescape(value);
    const current = pieces.at(-1);
    const rPrXml = activeFormat();
    if (current && current.rPrXml === rPrXml) current.text += decoded;
    else pieces.push({ text: decoded, rPrXml });
  };

  while ((match = pattern.exec(text))) {
    pushText(text.slice(cursor, match.index));
    const raw = match[0];
    if (match[1]) {
      const closingType = match[2].toLowerCase();
      const closeIndex = stack.map((item) => item.type).lastIndexOf(closingType);
      if (closeIndex >= 0) stack.splice(closeIndex, 1);
    } else {
      const type = match[2].toLowerCase();
      const id = (match[3] || "").match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      if (type === "g" && id && formats.has(id)) stack.push({ type, id });
      else if (SEMANTIC_INLINE_TAGS.has(type) && id && formats.has(id)) stack.push({ type, id });
      else if (SEMANTIC_INLINE_TAGS.has(type)) stack.push({ type });
      else pushText(raw);
    }
    cursor = match.index + raw.length;
  }
  pushText(text.slice(cursor));
  return pieces.length ? pieces : [{ text: "", rPrXml: baseRPrXml || "" }];
}

function replaceParagraphWithRuns(xml, paragraph, text, structure = {}) {
  const inlineTags = structure.inlineTags || [];
  const baseRPrXml = structure.baseRPrXml || "";
  const containsTextControls = /[\t\n\u2011\u00ad]/u.test(text) || paragraphTextControlNodes(paragraph).length > 0;
  if (!inlineTags.length && !containsTextControls) {
    replaceParagraphText(paragraph, text);
    return;
  }

  const reusableWrapper = commonTextWrapper(paragraph);
  if (reusableWrapper) {
    replaceTextWrapperWithRuns(xml, paragraph, reusableWrapper, text, structure);
    return;
  }

  const children = Array.from(paragraph.childNodes);
  const removable = new Set(children.filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) return true;
    if (child.nodeType !== Node.ELEMENT_NODE || child.localName === "pPr") return false;
    return elementContainsParagraphText(child, paragraph) || elementContainsDeletedRevisionText(child, paragraph);
  }));
  const firstRemovedIndex = children.findIndex((child) => removable.has(child));
  const referenceChild = firstRemovedIndex >= 0
    ? children.slice(firstRemovedIndex + 1).find((child) => !removable.has(child)) || null
    : null;

  removable.forEach((child) => paragraph.removeChild(child));
  parseInlineTaggedText(text, inlineTags, baseRPrXml).forEach((piece) => {
    paragraph.insertBefore(createTextRun(xml, piece.text, piece.rPrXml), referenceChild);
  });
}

function replaceTextWrapperWithRuns(xml, paragraph, wrapper, text, structure = {}) {
  const children = Array.from(wrapper.childNodes);
  const removable = new Set(children.filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) return true;
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    return elementContainsParagraphText(child, paragraph) || elementContainsDeletedRevisionText(child, paragraph);
  }));
  const firstRemovedIndex = children.findIndex((child) => removable.has(child));
  const referenceChild = firstRemovedIndex >= 0
    ? children.slice(firstRemovedIndex + 1).find((child) => !removable.has(child)) || null
    : null;

  removable.forEach((child) => wrapper.removeChild(child));
  parseInlineTaggedText(text, structure.inlineTags || [], structure.baseRPrXml || "").forEach((piece) => {
    wrapper.insertBefore(createTextRun(xml, piece.text, piece.rPrXml), referenceChild);
  });
}

function translatedParagraphs(segments) {
  const byPart = new Map();
  segments.forEach((segment) => {
    const partPath = segment.structure?.partPath || "word/document.xml";
    const paragraphIndex = segment.structure?.paragraphIndex;
    if (paragraphIndex === undefined || paragraphIndex === null) return;
    if (!byPart.has(partPath)) byPart.set(partPath, new Map());
    const byParagraph = byPart.get(partPath);
    if (!byParagraph.has(paragraphIndex)) byParagraph.set(paragraphIndex, []);
    byParagraph.get(paragraphIndex).push(segment);
  });
  byPart.forEach((byParagraph) => {
    byParagraph.forEach((items) => {
      items.sort((a, b) => (a.structure?.segmentInParagraph || 0) - (b.structure?.segmentInParagraph || 0));
    });
  });
  return byPart;
}

function targetFor(segment, fallbackToSource = false) {
  const target = String(segment?.target || "");
  return target.trim() ? target : (fallbackToSource ? segment.source : "");
}

async function extractDocxSegments(file) {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipEntries(originalBytes);
  if (!entries.has("word/document.xml")) throw new Error("word/document.xml was not found in the DOCX file.");

  const textParts = {};
  const textPartSummary = [];
  const segments = [];
  docxTextPartPaths(entries).forEach((partPath) => {
    const partXml = readZipText(entries, partPath);
    const xml = parseXml(partXml, docxPartLabel(partPath));
    textParts[partPath] = partXml;
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"));
    let partSegmentCount = 0;
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const richText = paragraphTextWithInlineTags(paragraph);
      const partSegments = splitIntoSegments(richText.text, {
        type: "paragraph",
        partPath,
        partLabel: docxPartLabel(partPath),
        paragraphIndex,
        inlineTags: richText.inlineTags,
        baseRPrXml: richText.baseRPrXml
      });
      partSegmentCount += partSegments.length;
      segments.push(...partSegments);
    });
    textPartSummary.push({ path: partPath, label: docxPartLabel(partPath), paragraphs: paragraphs.length, segments: partSegmentCount });
  });

  return {
    fileName: file.name,
    segments,
    structure: {
      documentXml: textParts["word/document.xml"],
      textParts,
      textPartSummary,
      docxPackageBase64: bytesToBase64(originalBytes),
      note: "Original DOCX package is retained. Main document, headers, footers, footnotes, endnotes, comments, and text boxes in supported XML parts are extracted when present."
    }
  };
}

async function buildTargetDocx(project, segments) {
  const packageBase64 = project.docxStructure?.docxPackageBase64;
  const textParts = project.docxStructure?.textParts || { "word/document.xml": project.docxStructure?.documentXml };
  if (!packageBase64 || !textParts["word/document.xml"]) {
    throw new Error("This project does not contain the original DOCX package. Re-import the source DOCX to enable DOCX export.");
  }

  const entries = await unzipEntries(base64ToBytes(packageBase64));
  const grouped = translatedParagraphs(segments);
  grouped.forEach((byParagraph, partPath) => {
    const partXml = textParts[partPath] || readZipText(entries, partPath);
    if (!partXml) return;
    const xml = parseXml(partXml, docxPartLabel(partPath));
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"));
    byParagraph.forEach((items, paragraphIndex) => {
      const paragraph = paragraphs[paragraphIndex];
      if (!paragraph) return;
      replaceParagraphWithRuns(xml, paragraph, items.map((segment) => targetFor(segment, false)).join(" "), items[0]?.structure || {});
    });
    entries.set(partPath, {
      name: partPath,
      data: textEncoder.encode(new XMLSerializer().serializeToString(xml))
    });
  });
  return zipEntries(entries);
}

function tableCell(text, shade = "") {
  const shading = shade ? `<w:shd w:fill="${shade}"/>` : "";
  return `<w:tc>
    <w:tcPr><w:tcW w:w="4500" w:type="dxa"/>${shading}</w:tcPr>
    <w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>
  </w:tc>`;
}

function tableRow(cells) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function countBy(values, getter) {
  return (values || []).reduce((counts, value) => {
    const key = getter(value) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function summaryLine(label, counts) {
  const parts = Object.entries(counts || {}).filter(([, count]) => count > 0).map(([key, count]) => `${key}: ${count}`);
  return `${label}: ${parts.length ? parts.join(", ") : "none"}`;
}

function reviewNotesForSegment(segment) {
  const notes = [];
  if (segment.reviewState) notes.push(`Review: ${segment.reviewState}`);
  if (segment.reviewNote) notes.push(`Note: ${segment.reviewNote}`);
  (segment.comments || []).forEach((comment, index) => {
    const state = comment.state ? ` (${comment.state})` : "";
    if (comment.body) notes.push(`Comment ${index + 1}${state}: ${comment.body}`);
  });
  return notes;
}

function qaNotesForSegment(segment, qaChecks = []) {
  return (qaChecks || [])
    .filter((issue) => issue.segmentId === segment.id)
    .map((issue) => `QA ${issue.severity || "note"} ${issue.type || "check"}: ${issue.message || ""}`);
}

function reviewerNotesForSegment(segment, qaChecks = []) {
  const notes = [...reviewNotesForSegment(segment), ...qaNotesForSegment(segment, qaChecks)];
  return notes.length ? notes.join("\n") : "";
}

function buildBilingualDocumentXml(project, segments, options = {}) {
  const qaChecks = options.qaChecks || [];
  const qaBySeverity = countBy(qaChecks, (issue) => issue.severity);
  const qaByType = countBy(qaChecks, (issue) => issue.type);
  const reviewNoteCount = segments.reduce((sum, segment) =>
    sum + (segment.reviewState ? 1 : 0) + (segment.reviewNote ? 1 : 0) + (segment.comments || []).length, 0);
  const rows = [
    tableRow([
      tableCell("Source", "E7F4F0"),
      tableCell("Target", "E7F4F0"),
      tableCell("Status", "E7F4F0"),
      tableCell("Reviewer notes and QA", "E7F4F0")
    ]),
    ...segments.map((segment, index) =>
      tableRow([
        tableCell(`${index + 1}. ${segment.source}`),
        tableCell(targetFor(segment, false)),
        tableCell(segment.status),
        tableCell(reviewerNotesForSegment(segment, qaChecks))
      ])
    )
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${xmlEscape(project.name || "Bilingual export")}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlEscape(`${project.sourceLang} -> ${project.targetLang}`)}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlEscape(`Segments: ${segments.length}; review notes: ${reviewNoteCount}; QA issues: ${qaChecks.length}`)}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlEscape(summaryLine("QA by severity", qaBySeverity))}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlEscape(summaryLine("QA by type", qaByType))}</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D8DEE6"/></w:tblBorders></w:tblPr>
      ${rows}
    </w:tbl>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

function baseDocxEntries(documentXml) {
  return new Map([
    ["[Content_Types].xml", {
      name: "[Content_Types].xml",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
    }],
    ["_rels/.rels", {
      name: "_rels/.rels",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
    }],
    ["word/document.xml", { name: "word/document.xml", data: textEncoder.encode(documentXml) }]
  ]);
}

function buildBilingualDocx(project, segments, options = {}) {
  return zipEntries(baseDocxEntries(buildBilingualDocumentXml(project, segments, options)));
}

window.CatHan.docx = {
  extractDocxSegments,
  buildTargetDocx,
  buildBilingualDocx,
  detectProtectedTags
};
})();
