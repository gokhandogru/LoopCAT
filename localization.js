(() => {
const localizationTextDecoder = new TextDecoder("utf-8");
const localizationTextEncoder = new TextEncoder();
const MAX_LOCALIZATION_UNZIPPED_BYTES = 150 * 1024 * 1024;
const TEXT_ENCODING_PRESERVE_FORMATS = new Set([
  "po", "pot", "srt", "vtt", "sbv", "json", "yaml", "yml", "md", "markdown",
  "csv", "tsv", "strings", "txt", "properties", "php", "ts", "dtd", "mif"
]);

function stripExt(name) {
  return String(name || "file").replace(/\.[^.]+$/, "");
}

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
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decodeLocalizationTextFile(file, options = {}) {
  if (window.CatHan.encoding) return window.CatHan.encoding.decodeTextFile(file, options);
  return { text: await file.text(), encoding: "utf-8", detectedFrom: "fallback", bom: false, canPreserve: true };
}

function sourceEncodingInfo(decoded = {}) {
  return {
    encoding: decoded.encoding || "utf-8",
    detectedFrom: decoded.detectedFrom || "fallback",
    bom: Boolean(decoded.bom),
    canPreserve: Boolean(decoded.canPreserve)
  };
}

function withSourceEncoding(structure, decoded) {
  return structure ? { ...structure, sourceEncoding: sourceEncodingInfo(decoded) } : structure;
}

function encodeLocalizationTextOutput(text, normalizedFormat, structure) {
  if (typeof text !== "string" || !TEXT_ENCODING_PRESERVE_FORMATS.has(normalizedFormat) || !window.CatHan.encoding) return text;
  const source = structure?.sourceEncoding?.canPreserve ? structure.sourceEncoding : { encoding: "utf-8" };
  const encoded = window.CatHan.encoding.encodeText(text, source, { allowFallback: true });
  if (["po", "pot"].includes(normalizedFormat)) {
    // Headers must describe actual output bytes, including manual overrides and Unicode fallback.
    const charset = encoded.encoding === "utf-8" ? "UTF-8" : encoded.encoding;
    text = text.replace(/(Content-Type:[^\r\n]*?charset\s*=\s*)[\w.-]+/i, (_, prefix) => prefix + charset);
    return window.CatHan.encoding.encodeText(text, { ...source, encoding: encoded.encoding }).content;
  }
  return encoded.content;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  throw new Error("Could not read the localization package zip directory.");
}

function assertPackageRange(bytes, offset, length, label) {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error(`Invalid localization package ${label} range.`);
  }
}

function safeArchiveEntryName(rawName) {
  const name = String(rawName || "").replaceAll("\\", "/");
  if (!name || name.includes("\0") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw new Error(`Localization package has an unsafe archive entry path: ${name || "(empty)"}.`);
  }
  const parts = name.split("/");
  const isDirectory = parts[parts.length - 1] === "";
  const fileParts = isDirectory ? parts.slice(0, -1) : parts;
  if (!fileParts.length || fileParts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Localization package has an unsafe archive entry path: ${name}.`);
  }
  return isDirectory ? "" : fileParts.join("/");
}

async function inflateRaw(bytes, limit = MAX_LOCALIZATION_UNZIPPED_BYTES) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress package files locally. Try a recent Chromium, Edge, or Safari version.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("Localization archive expanded beyond its declared size or limit.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(error); throw error; }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function unzipPackageEntries(arrayBufferOrBytes) {
  if (window.CatHan?.archive) return window.CatHan.archive.readEntries(arrayBufferOrBytes);
  const bytes = arrayBufferOrBytes instanceof Uint8Array ? arrayBufferOrBytes : new Uint8Array(arrayBufferOrBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocd + 10);
  const centralDirectorySize = readUint32(view, eocd + 12);
  const centralDirectoryOffset = readUint32(view, eocd + 16);
  assertPackageRange(bytes, centralDirectoryOffset, centralDirectorySize, "central directory");
  if (centralDirectoryOffset + centralDirectorySize > eocd) throw new Error("Invalid localization package central directory range.");
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const entries = new Map();
  let ptr = centralDirectoryOffset;
  let totalUncompressedSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    assertPackageRange(bytes, ptr, 46, "central directory entry");
    if (readUint32(view, ptr) !== 0x02014b50) throw new Error("Invalid localization package central directory.");
    const compressionMethod = readUint16(view, ptr + 10);
    const expectedCrc = readUint32(view, ptr + 16);
    const compressedSize = readUint32(view, ptr + 20);
    const uncompressedSize = readUint32(view, ptr + 24);
    const fileNameLength = readUint16(view, ptr + 28);
    const extraLength = readUint16(view, ptr + 30);
    const commentLength = readUint16(view, ptr + 32);
    const localHeaderOffset = readUint32(view, ptr + 42);
    const centralEntryLength = 46 + fileNameLength + extraLength + commentLength;
    assertPackageRange(bytes, ptr, centralEntryLength, "central directory entry");
    const nameBytes = bytes.slice(ptr + 46, ptr + 46 + fileNameLength);
    const name = safeArchiveEntryName(localizationTextDecoder.decode(nameBytes));
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_LOCALIZATION_UNZIPPED_BYTES) {
      throw new Error("Localization package is too large after decompression. Try splitting the project or removing embedded content.");
    }
    if (!name) {
      ptr += centralEntryLength;
      continue;
    }

    assertPackageRange(bytes, localHeaderOffset, 30, `local header for ${name}`);
    if (readUint32(view, localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid localization package local header for ${name}.`);
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    assertPackageRange(bytes, localHeaderOffset, 30 + localNameLength + localExtraLength, `local header for ${name}`);
    const localNameBytes = bytes.slice(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength);
    const localName = safeArchiveEntryName(localizationTextDecoder.decode(localNameBytes));
    if (localName !== name) throw new Error(`Localization package local header name mismatch for ${name}.`);
    assertPackageRange(bytes, dataStart, compressedSize, `compressed data for ${name}`);
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = await inflateRaw(compressed, uncompressedSize);
    else throw new Error(`Unsupported localization package compression method: ${compressionMethod}`);
    if (data.length !== uncompressedSize) throw new Error(`Localization package entry ${name} has an unexpected decompressed size.`);
    if (crc32(data) !== expectedCrc) throw new Error(`Localization package entry ${name} failed CRC integrity validation.`);
    if (entries.has(name)) throw new Error(`Localization package has duplicate archive entry path: ${name}.`);
    entries.set(name, { name, data });
    ptr += centralEntryLength;
  }

  if (ptr !== centralDirectoryEnd) throw new Error("Invalid localization package central directory range.");
  return entries;
}

function zipPackageEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const seenNames = new Set();
  const items = Array.from(entries.values()).flatMap((entry) => {
    const entryName = safeArchiveEntryName(entry.name);
    if (!entryName) return [];
    if (seenNames.has(entryName)) throw new Error(`Localization package has duplicate archive entry path: ${entryName}.`);
    seenNames.add(entryName);
    return [{ ...entry, name: entryName }];
  });

  items.forEach((entry) => {
    const nameBytes = localizationTextEncoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : localizationTextEncoder.encode(String(entry.data));
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

function readPackageText(entries, path) {
  const entry = entries.get(path);
  return entry ? localizationTextDecoder.decode(entry.data) : "";
}

function detectTags(text, context) {
  return window.CatHan.docx?.detectProtectedTags ? window.CatHan.docx.detectProtectedTags(text, context) : [];
}

function targetText(segment) {
  return String(segment?.target || "");
}

function normalizedLocalizationFormat(format) {
  const value = String(format || "").trim().toLowerCase();
  if (!value) throw new Error("Localization export format is required.");
  return value;
}

function localizationSegmentArray(segments) {
  if (!Array.isArray(segments)) throw new Error("Localization export segments must be an array.");
  return segments;
}

function hasOwnValue(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function hasStructureNumber(value) {
  return Number.isInteger(value) && value >= 0;
}

function segmentStructureFormat(segment) {
  return String(segment?.structure?.format || "").toLowerCase();
}

const LOCALIZATION_RECONSTRUCTION_REQUIREMENTS = {
  tmx: {
    label: "TMX",
    issue: "translation unit or language variant mapping data",
    hasOriginal: (structure) => structure?.format === "tmx" && Boolean(structure.source && structure.sourceLang && structure.targetLang),
    validSegment: (segment) => segmentStructureFormat(segment) === "tmx" &&
      Number.isInteger(segment.structure.unitIndex) && segment.structure.unitIndex >= 0 &&
      Number.isInteger(segment.structure.sourceVariantIndex) && segment.structure.sourceVariantIndex >= 0 &&
      Number.isInteger(segment.structure.targetVariantIndex) && segment.structure.targetVariantIndex >= -1 &&
      Array.isArray(segment.structure.inlineCodes)
  },
  po: {
    label: "PO",
    issue: "msgstr line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "po" && hasStructureNumber(segment?.structure?.msgstrStart)
  },
  pot: {
    label: "PO/POT",
    issue: "msgstr line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "po" && hasStructureNumber(segment?.structure?.msgstrStart)
  },
  json: {
    label: "JSON",
    issue: "string path mapping data",
    hasOriginal: (structure) => hasOwnValue(structure, "sourceJson"),
    validSegment: (segment) => segmentStructureFormat(segment) === "json" && Array.isArray(segment?.structure?.path)
  },
  yaml: {
    label: "YAML",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "yaml" && hasStructureNumber(segment?.structure?.lineStart)
  },
  yml: {
    label: "YAML",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "yaml" && hasStructureNumber(segment?.structure?.lineStart)
  },
  srt: {
    label: "SRT",
    issue: "cue timing data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "srt" && String(segment?.structure?.timing || "").trim()
  },
  html: {
    label: "HTML",
    issue: "element mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "html" && hasStructureNumber(segment?.structure?.elementIndex)
  },
  htm: {
    label: "HTML",
    issue: "element mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "html" && hasStructureNumber(segment?.structure?.elementIndex)
  },
  md: {
    label: "Markdown",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "markdown" && hasStructureNumber(segment?.structure?.lineStart)
  },
  markdown: {
    label: "Markdown",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "markdown" && hasStructureNumber(segment?.structure?.lineStart)
  },
  csv: {
    label: "CSV",
    issue: "row mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.rows),
    validSegment: (segment) => segmentStructureFormat(segment) === "csv" && hasStructureNumber(segment?.structure?.rowIndex)
  },
  tsv: {
    label: "TSV",
    issue: "row mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.rows),
    validSegment: (segment) => segmentStructureFormat(segment) === "tsv" && hasStructureNumber(segment?.structure?.rowIndex)
  },
  xml: {
    label: "Android XML",
    issue: "element mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "android-xml" && hasStructureNumber(segment?.structure?.elementIndex)
  },
  strings: {
    label: "iOS strings",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "apple-strings" && hasStructureNumber(segment?.structure?.lineIndex)
  },
  idml: {
    label: "IDML",
    issue: "story mapping data",
    hasOriginal: (structure) => Boolean(structure?.packageBase64),
    validSegment: (segment) => segmentStructureFormat(segment) === "idml" &&
      String(segment?.structure?.path || "").trim() &&
      (hasStructureNumber(segment?.structure?.contentIndex) || hasStructureNumber(segment?.structure?.paragraphIndex))
  }
};

const OPENXML_TYPES = new Set(["docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm", "ppsx", "ppsm", "potx", "potm"]);
const OPENDOCUMENT_TYPES = new Set(["odt", "ott", "ods", "ots", "odp", "otp"]);
const GENERIC_XML_TYPES = new Set(["xhtml", "dita", "xini", "wix"]);
const BILINGUAL_XML_TYPES = new Set(["txml", "ttx"]);

const openXmlRequirement = {
  label: "OpenXML",
  issue: "package text mapping data",
  hasOriginal: (structure) => Boolean(structure?.packageBase64),
  validSegment: (segment) => segmentStructureFormat(segment) === "openxml" &&
    String(segment?.structure?.path || "").trim() &&
    hasStructureNumber(segment?.structure?.itemIndex)
};
OPENXML_TYPES.forEach((format) => {
  LOCALIZATION_RECONSTRUCTION_REQUIREMENTS[format] = { ...openXmlRequirement };
});

const openDocumentRequirement = {
  label: "OpenDocument",
  issue: "content mapping data",
  hasOriginal: (structure) => Boolean(structure?.packageBase64),
  validSegment: (segment) => segmentStructureFormat(segment) === "opendocument" &&
    String(segment?.structure?.path || "").trim() &&
    hasStructureNumber(segment?.structure?.itemIndex)
};
OPENDOCUMENT_TYPES.forEach((format) => {
  LOCALIZATION_RECONSTRUCTION_REQUIREMENTS[format] = { ...openDocumentRequirement };
});

const genericXmlRequirement = {
  label: "XML",
  issue: "element or attribute mapping data",
  hasOriginal: (structure) => Boolean(structure?.source),
  validSegment: (segment) => segmentStructureFormat(segment) === "generic-xml" &&
    hasStructureNumber(segment?.structure?.itemIndex)
};
["xhtml", "dita", "xini", "wix"].forEach((format) => {
  LOCALIZATION_RECONSTRUCTION_REQUIREMENTS[format] = { ...genericXmlRequirement };
});

const bilingualXmlRequirement = {
  label: "Bilingual XML",
  issue: "source-target mapping data",
  hasOriginal: (structure) => Boolean(structure?.source),
  validSegment: (segment) => segmentStructureFormat(segment) === "bilingual-xml" &&
    hasStructureNumber(segment?.structure?.pairIndex)
};
["txml", "ttx"].forEach((format) => {
  LOCALIZATION_RECONSTRUCTION_REQUIREMENTS[format] = { ...bilingualXmlRequirement };
});

Object.assign(LOCALIZATION_RECONSTRUCTION_REQUIREMENTS, {
  xml: {
    label: "XML",
    issue: "element mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => {
      const format = segmentStructureFormat(segment);
      return (format === "android-xml" && hasStructureNumber(segment?.structure?.elementIndex)) ||
        (format === "generic-xml" && hasStructureNumber(segment?.structure?.itemIndex));
    }
  },
  txt: {
    label: "Plain text",
    issue: "line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "plain-text" && hasStructureNumber(segment?.structure?.lineStart)
  },
  properties: {
    label: "Properties",
    issue: "property line mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.sourceLines),
    validSegment: (segment) => segmentStructureFormat(segment) === "properties" && hasStructureNumber(segment?.structure?.lineIndex)
  },
  php: {
    label: "PHP",
    issue: "string literal mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "code-string" && hasStructureNumber(segment?.structure?.tokenIndex)
  },
  ts: {
    label: "TS",
    issue: "message mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => {
      const format = segmentStructureFormat(segment);
      return (format === "ts-xml" && hasStructureNumber(segment?.structure?.messageIndex)) ||
        (format === "code-string" && hasStructureNumber(segment?.structure?.tokenIndex));
    }
  },
  resx: {
    label: "RESX",
    issue: "resource value mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "resx" && hasStructureNumber(segment?.structure?.itemIndex)
  },
  dtd: {
    label: "DTD",
    issue: "quoted literal mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "quoted-text" && hasStructureNumber(segment?.structure?.tokenIndex)
  },
  mif: {
    label: "MIF",
    issue: "String mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "mif" && hasStructureNumber(segment?.structure?.tokenIndex)
  },
  icml: {
    label: "ICML",
    issue: "content mapping data",
    hasOriginal: (structure) => Boolean(structure?.source),
    validSegment: (segment) => segmentStructureFormat(segment) === "icml" && hasStructureNumber(segment?.structure?.contentIndex)
  },
  vtt: {
    label: "VTT",
    issue: "cue mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.blocks),
    validSegment: (segment) => segmentStructureFormat(segment) === "vtt" && hasStructureNumber(segment?.structure?.blockIndex)
  },
  sbv: {
    label: "SBV",
    issue: "cue mapping data",
    hasOriginal: (structure) => Array.isArray(structure?.blocks),
    validSegment: (segment) => segmentStructureFormat(segment) === "sbv" && hasStructureNumber(segment?.structure?.blockIndex)
  }
});

function assertLocalizationReconstruction(format, segments, structure) {
  const normalizedFormat = String(format || "").toLowerCase();
  const requirement = LOCALIZATION_RECONSTRUCTION_REQUIREMENTS[normalizedFormat];
  if (!requirement) return;
  if (!requirement.hasOriginal(structure)) {
    throw new Error(`${requirement.label} reconstruction data is missing.`);
  }
  const missing = (segments || []).filter((segment) => !requirement.validSegment(segment));
  if (missing.length) {
    throw new Error(`${missing.length} ${requirement.label} segment${missing.length === 1 ? "" : "s"} missing ${requirement.issue}.`);
  }
}

function unquotePo(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value.replace(/^"|"$/g, "");
  }
}

function quotePo(value) {
  return JSON.stringify(String(value || ""));
}

function poFieldValue(line, keyword) {
  return unquotePo(line.slice(keyword.length).trim());
}

function pluralMsgstrMatch(line) {
  return line.match(/^msgstr\[(\d+)\]\s+(.*)$/);
}

function parsePo(text) {
  const units = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let current = null;
  let active = null;
  const ensureCurrent = (index) => {
    current = current || { startLine: index, msgstrs: {}, msgstrRanges: {}, formatFlags: [] };
    current.msgstrs = current.msgstrs || {};
    current.msgstrRanges = current.msgstrRanges || {};
    return current;
  };
  const flush = (endLine) => {
    if (current?.msgid || current?.msgidPlural) {
      current.endLine = endLine;
      units.push(current);
    }
    current = null;
    active = null;
  };
  const setActiveValue = (kind, value, index, pluralIndex = null) => {
    const unit = ensureCurrent(index);
    if (kind === "msgctxt") {
      unit.msgctxt = value;
      unit.msgctxtStart = index;
      unit.msgctxtEnd = index;
    } else if (kind === "msgid") {
      unit.msgid = value;
      unit.msgidStart = index;
      unit.msgidEnd = index;
    } else if (kind === "msgidPlural") {
      unit.msgidPlural = value;
      unit.msgidPluralStart = index;
      unit.msgidPluralEnd = index;
    } else if (kind === "msgstr") {
      unit.msgstr = value;
      unit.msgstrStart = index;
      unit.msgstrEnd = index;
    } else if (kind === "msgstrPlural") {
      unit.msgstrs[pluralIndex] = value;
      unit.msgstrRanges[pluralIndex] = { start: index, end: index };
    }
    active = { kind, pluralIndex };
  };
  const appendActiveValue = (value, index) => {
    if (!current || !active) return;
    if (active.kind === "msgctxt") {
      current.msgctxt = `${current.msgctxt || ""}${value}`;
      current.msgctxtEnd = index;
    } else if (active.kind === "msgid") {
      current.msgid = `${current.msgid || ""}${value}`;
      current.msgidEnd = index;
    } else if (active.kind === "msgidPlural") {
      current.msgidPlural = `${current.msgidPlural || ""}${value}`;
      current.msgidPluralEnd = index;
    } else if (active.kind === "msgstr") {
      current.msgstr = `${current.msgstr || ""}${value}`;
      current.msgstrEnd = index;
    } else if (active.kind === "msgstrPlural") {
      const pluralIndex = active.pluralIndex;
      current.msgstrs[pluralIndex] = `${current.msgstrs[pluralIndex] || ""}${value}`;
      current.msgstrRanges[pluralIndex].end = index;
    }
  };
  lines.forEach((line, index) => {
    if (!line.trim()) {
      flush(index - 1);
      return;
    }
    if (line.startsWith("#~")) {
      // Obsolete entries and their flags must never affect a following active entry.
      flush(index - 1);
      return;
    }
    if (line.startsWith("#")) {
      // Comments can begin a new entry even when the file omits a blank separator.
      if (current && (current.msgstrStart !== undefined || Object.keys(current.msgstrRanges).length)) {
        flush(index - 1);
      }
      if (line.startsWith("#,")) {
        const unit = ensureCurrent(index);
        const flags = line.slice(2).split(",").map((flag) => flag.trim()).filter(Boolean);
        unit.formatFlags = [...new Set([...unit.formatFlags, ...flags])];
      }
      active = null;
      return;
    }
    if (line.startsWith("msgctxt ")) {
      if (current?.msgidStart !== undefined) flush(index - 1);
      setActiveValue("msgctxt", poFieldValue(line, "msgctxt"), index);
      return;
    }
    if (line.startsWith("msgid ")) {
      if (current?.msgidStart !== undefined) flush(index - 1);
      setActiveValue("msgid", poFieldValue(line, "msgid"), index);
      return;
    }
    if (line.startsWith("msgid_plural ")) {
      setActiveValue("msgidPlural", poFieldValue(line, "msgid_plural"), index);
      return;
    }
    if (line.startsWith("msgstr ")) {
      setActiveValue("msgstr", poFieldValue(line, "msgstr"), index);
      return;
    }
    const pluralMatch = pluralMsgstrMatch(line);
    if (pluralMatch) {
      setActiveValue("msgstrPlural", unquotePo(pluralMatch[2].trim()), index, pluralMatch[1]);
      return;
    }
    if (line.trim().startsWith('"') && current && active) {
      appendActiveValue(unquotePo(line.trim()), index);
    }
  });
  flush(lines.length - 1);
  const segments = [];
  units.forEach((unit, unitIndex) => {
    const key = `po-${unitIndex + 1}`;
    if (unit.msgidPlural) {
      Object.keys(unit.msgstrs)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((pluralIndex) => {
          const range = unit.msgstrRanges[pluralIndex];
          segments.push({
            text: pluralIndex === "0" ? unit.msgid : unit.msgidPlural,
            target: unit.msgstrs[pluralIndex] || "",
            key: `${key}-plural-${pluralIndex}`,
            structure: {
              format: "po",
              formatFlags: [...unit.formatFlags],
              key: `${key}-plural-${pluralIndex}`,
              lineStart: unit.startLine,
              lineEnd: unit.endLine,
              msgstrStart: range.start,
              msgstrEnd: range.end,
              pluralIndex
            }
          });
        });
      return;
    }
    segments.push({
      text: unit.msgid,
      target: unit.msgstr || "",
      key,
      structure: {
        format: "po",
        formatFlags: [...unit.formatFlags],
        key,
        lineStart: unit.startLine,
        lineEnd: unit.endLine,
        msgstrStart: unit.msgstrStart,
        msgstrEnd: unit.msgstrEnd
      }
    });
  });
  return {
    structure: { format: "po", sourceLines: lines },
    segments
  };
}

function buildPo(segments, structure = null) {
  const sourceLines = structure?.sourceLines;
  if (sourceLines) {
    const lines = [...sourceLines];
    [...segments]
      .filter((segment) => segment.structure?.format === "po" && Number.isFinite(segment.structure?.msgstrStart))
      .sort((a, b) => b.structure.msgstrStart - a.structure.msgstrStart)
      .forEach((segment) => {
        const start = segment.structure.msgstrStart;
        const end = Number.isFinite(segment.structure.msgstrEnd) ? segment.structure.msgstrEnd : start;
        const pluralIndex = segment.structure.pluralIndex;
        const label = pluralIndex === undefined ? "msgstr" : `msgstr[${pluralIndex}]`;
        lines.splice(start, end - start + 1, `${label} ${quotePo(segment.target || "")}`);
      });
    return lines.join("\n");
  }
  return segments
    .map((segment) => `msgid ${quotePo(segment.source || segment.text || "")}\nmsgstr ${quotePo(segment.target || "")}`)
    .join("\n\n");
}

const SRT_TIMING_PATTERN = /^\d+:\d{2}:\d{2},\d{3}\s+-->\s+\d+:\d{2}:\d{2},\d{3}(?:\s+.*)?$/;

function cleanSrtCueText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join("\n");
}

function parseSrt(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!normalized.split("\n").some((line) => SRT_TIMING_PATTERN.test(line.trim()))) throw new Error("No valid SRT cues were found.");
  const segments = normalized
    ? normalized.split(/\n[ \t]*\n(?:[ \t]*\n)*/).flatMap((block, blockIndex) => {
      const lines = block.split("\n").map((line) => line.trimEnd());
      while (lines.length && !lines[0].trim()) lines.shift();
      let cueIndex = "";
      if (/^\d+$/.test(lines[0]?.trim() || "")) cueIndex = lines.shift().trim();
      const timing = lines.shift()?.trim() || "";
      if (!SRT_TIMING_PATTERN.test(timing)) throw new Error(`SRT cue ${blockIndex + 1} has invalid timing data.`);
      const text = cleanSrtCueText(lines.join("\n"));
      if (!text.trim()) return [];
      const key = cueIndex || String(blockIndex + 1);
      return [{
        text,
        key,
        structure: { format: "srt", cueIndex: key, timing }
      }];
    })
    : [];
  if (!segments.length) throw new Error("No valid SRT cues were found.");
  return segments;
}

function editedSubtitleTiming(segment, original, format) {
  if (segment.subtitle?.sourceTimingConflict) throw new Error("Review the incoming subtitle timing before exporting.");
  const timing = segment.subtitle?.timing;
  if (!timing) {
    const stamps = [...String(original).matchAll(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/g)];
    const values = stamps.map((stamp) => ((Number(stamp[1] || 0) * 60 + Number(stamp[2])) * 60 + Number(stamp[3])) * 1000 + Number(stamp[4]));
    if (stamps.length !== 2 || stamps.some((stamp) => Number(stamp[2]) > 59 || Number(stamp[3]) > 59) ||
        values.some((value) => !Number.isSafeInteger(value)) || values[1] <= values[0]) {
      throw new Error("Subtitle cue has invalid timing data.");
    }
    return original;
  }
  if (segment.subtitle.version !== 1 || !Number.isSafeInteger(timing.startMs) ||
      !Number.isSafeInteger(timing.endMs) || timing.startMs < 0 || timing.endMs <= timing.startMs) {
    throw new Error("Subtitle cue has invalid edited timing data.");
  }
  const timestamp = (milliseconds) => {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor(milliseconds / 60000) % 60;
    const seconds = Math.floor(milliseconds / 1000) % 60;
    const separator = format === "srt" ? "," : ".";
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(milliseconds % 1000).padStart(3, "0")}`;
  };
  const suffix = format === "sbv" ? "" : (String(original).match(/-->\s*\S+(.*)$/)?.[1] || "");
  const separator = format === "sbv" ? "," : " --> ";
  return `${timestamp(timing.startMs)}${separator}${timestamp(timing.endMs)}${suffix}`;
}

function buildSrt(segments, structure = null) {
  const edited = segments.some((segment) => segment.subtitle?.cues || segment.subtitle?.timing);
  if (edited) segments = expandSubtitleSegments(segments);
  if (edited) segments.sort((a, b) => subtitleStartTime(editedSubtitleTiming(a, a.structure?.timing, "srt")) - subtitleStartTime(editedSubtitleTiming(b, b.structure?.timing, "srt")));
  if (structure?.source) {
    const missingTiming = segments.filter((segment) => !String(segment.structure?.timing || "").trim()).length;
    if (missingTiming) throw new Error(`${missingTiming} SRT segment${missingTiming === 1 ? "" : "s"} missing cue timing data.`);
  }
  const content = segments
    .map((segment, index) => {
      const cueIndex = edited ? String(index + 1) : String(segment.structure?.cueIndex || index + 1).trim() || String(index + 1);
      const timing = editedSubtitleTiming(segment, String(segment.structure?.timing || "00:00:00,000 --> 00:00:01,000").trim(), "srt");
      if (!SRT_TIMING_PATTERN.test(timing)) throw new Error(`SRT cue ${cueIndex} has invalid timing data.`);
      return `${cueIndex}\n${timing}\n${cleanSrtCueText(segment.target || "")}`;
    })
    .join("\n\n");
  return content ? `${content}\n` : "";
}

function jsonPathLabel(path) {
  if (!path.length) return "$";
  return path.map((part, index) => {
    if (typeof part === "number") return `[${part}]`;
    const clean = String(part);
    return index === 0 ? clean : `.${clean}`;
  }).join("");
}

function flattenJson(value, path = []) {
  if (typeof value === "string") return [{ key: jsonPathLabel(path), path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenJson(item, [...path, index]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flattenJson(item, [...path, key]));
  }
  return [];
}

function setLegacyPath(root, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor = root;
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    if (last) {
      cursor[part] = value;
      return;
    }
    cursor[part] = cursor[part] || (/^\d+$/.test(parts[index + 1]) ? [] : {});
    cursor = cursor[part];
  });
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function setJsonPath(root, path, value) {
  if (!path.length) return value;
  let cursor = root;
  path.forEach((part, index) => {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      throw new Error("JSON reconstruction path does not exist in the original file.");
    }
    const last = index === path.length - 1;
    if (last) {
      if (typeof cursor[part] !== "string") throw new Error("JSON reconstruction path must identify a string.");
      Object.defineProperty(cursor, part, { value, writable: true, enumerable: true, configurable: true });
      return;
    }
    cursor = cursor[part];
  });
  return root;
}

function parseJson(text) {
  const parsed = JSON.parse(text);
  return {
    structure: { format: "json", sourceJson: parsed },
    segments: flattenJson(parsed).map((unit) => ({
      text: unit.text,
      key: unit.key,
      structure: { format: "json", key: unit.key, path: unit.path }
    }))
  };
}

function buildJson(segments, structure = null) {
  let root = Object.prototype.hasOwnProperty.call(structure || {}, "sourceJson") ? cloneJson(structure.sourceJson) : {};
  segments.forEach((segment) => {
    const value = segment.target || "";
    if (Array.isArray(segment.structure?.path)) {
      root = setJsonPath(root, segment.structure.path, value);
    } else if ((segment.structure?.key || segment.id) === "$") {
      root = value;
    } else {
      setLegacyPath(root, segment.structure?.key || segment.id, value);
    }
  });
  return JSON.stringify(root, null, 2);
}

function indentOf(line) {
  return (line.match(/^\s*/) || [""])[0].length;
}

function stripYamlComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote === '"' && char === "\\") { index += 1; continue; }
    if (quote === "'" && char === "'" && value[index + 1] === "'") { index += 1; continue; }
    if (quote && char === quote) quote = "";
    else if (!quote && index === value.search(/\S/) && (char === '"' || char === "'")) quote = char;
    if (char === "#" && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return { value: value.slice(0, index).trimEnd(), comment: value.slice(index) };
    }
  }
  return { value: value.trimEnd(), comment: "" };
}

function unquoteYamlValue(value) {
  const clean = value.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    try {
      return JSON.parse(clean);
    } catch {
      throw new Error("This YAML quoted scalar uses unsupported escapes. Use JSON-compatible double quotes or YAML single quotes.");
    }
  }
  if (clean.startsWith("'") && clean.endsWith("'")) return clean.slice(1, -1).replaceAll("''", "'");
  return clean;
}

function quoteYamlValue(value) {
  return JSON.stringify(String(value || ""));
}

function isTranslatableYamlScalar(value) {
  const clean = value.trim();
  if (!clean || /^[\[{]/.test(clean)) return false;
  if (/^(?:true|false|null|~)$/i.test(clean)) return false;
  if (/^[+-]?(?:0x[\da-f]+|0o[0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\.inf|\.nan)$/i.test(clean)) return false;
  return /[^\d\s.,:;!?()[\]{}'"`~@#$%^&*_+=|\\/<>-]/u.test(unquoteYamlValue(clean));
}

function yamlParentPath(stack, indent) {
  while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
  return stack.at(-1)?.key || "";
}

function yamlKeyMatch(body) {
  const match = String(body || "").match(/^((?:"(?:\\.|[^"])*"|'(?:[^']|'')*'|[\w.-]+))(\s*:\s*)(.*)$/);
  if (!match) return null;
  return {
    rawKey: match[1],
    key: unquoteYamlValue(match[1]),
    separator: match[2],
    rawValue: match[3]
  };
}

function parseYaml(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const segments = [];
  const stack = [];
  const arrayCounters = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^(?:---|\.\.\.)(?:\s+#.*)?$/.test(trimmed) || /^%YAML\s/.test(trimmed)) continue;
    const indent = indentOf(line);
    let parentPath = yamlParentPath(stack, indent);
    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    let body = trimmed;
    let prefix = line.slice(0, line.indexOf(trimmed));
    let arrayItemPath = "";
    if (listMatch) {
      body = listMatch[2];
      const counterKey = `${parentPath}@${indent}`;
      const itemIndex = arrayCounters.get(counterKey) || 0;
      arrayCounters.set(counterKey, itemIndex + 1);
      arrayItemPath = `${parentPath || "items"}[${itemIndex}]`;
      prefix = `${listMatch[1]}- `;
      stack.push({ indent, key: arrayItemPath });
      parentPath = arrayItemPath;
    }
    const keyMatch = yamlKeyMatch(body);
    const key = keyMatch ? keyMatch.key : "";
    const valuePrefix = keyMatch ? `${prefix}${keyMatch.rawKey}${keyMatch.separator}` : prefix;
    const rawValue = keyMatch ? keyMatch.rawValue : body;
    const path = key ? [parentPath, key].filter(Boolean).join(".") : parentPath;
    const { value, comment } = stripYamlComment(rawValue);
    if (!keyMatch && !listMatch) throw new Error(`Unsupported YAML scalar layout on line ${index + 1}. Use single-line scalars or literal/folded blocks.`);
    if (/^[\[{&*!]/.test(value.trim())) throw new Error(`YAML flow collections, anchors, aliases and tags are not supported (line ${index + 1}). Expand them before importing.`);
    if ((value.trim().startsWith('"') && !value.trim().endsWith('"')) || (value.trim().startsWith("'") && !value.trim().endsWith("'"))) throw new Error(`Multiline YAML quoted scalars are not supported (line ${index + 1}). Use a block scalar.`);
    if (key && !value) {
      stack.push({ indent, key: path });
      continue;
    }
    const blockMarker = value.trim();
    if (/^[>|](?:[1-9][+-]?|[+-][1-9]?|)?$/.test(blockMarker)) {
      const explicitIndent = Number(blockMarker.match(/[1-9]/)?.[0] || 0);
      const blockBaseIndent = indent + (listMatch && keyMatch ? 2 : 0);
      const firstContent = lines.slice(index + 1).find((line) => line.trim());
      const blockIndent = explicitIndent ? blockBaseIndent + explicitIndent : Math.max(blockBaseIndent + 1, firstContent ? indentOf(firstContent) : blockBaseIndent + 2);
      const blockLines = [];
      let end = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim() && indentOf(lines[cursor]) <= blockBaseIndent) break;
        if (lines[cursor].trim() && indentOf(lines[cursor]) < blockIndent) throw new Error(`Invalid YAML block indentation on line ${cursor + 1}.`);
        end = cursor;
        blockLines.push(lines[cursor].slice(Math.min(blockIndent, indentOf(lines[cursor]))));
      }
      let blockText = "";
      blockLines.forEach((line, lineIndex) => {
        blockText += line;
        if (lineIndex === blockLines.length - 1) { if (end < lines.length - 1) blockText += "\n"; return; }
        const next = blockLines[lineIndex + 1];
        if (!blockMarker.startsWith(">") || /^\s/.test(line) || /^\s/.test(next)) blockText += "\n";
        else if (line && next) blockText += " ";
        else if (!line) blockText += "\n";
      });
      if (blockMarker.includes("-")) blockText = blockText.replace(/\n+$/, "");
      else if (!blockMarker.includes("+")) blockText = blockText.replace(/\n+$/, "") + (blockLines.length && (end < lines.length - 1 || blockLines.at(-1) === "") ? "\n" : "");
      if (blockText.trim()) {
        segments.push({
          text: blockText,
          key: path,
          structure: { format: "yaml", key: path, lineStart: index, lineEnd: end, valuePrefix, blockStyle: blockMarker, blockIndent, blockBaseIndent, comment, originalText: blockText }
        });
      }
      index = end;
      continue;
    }
    if (isTranslatableYamlScalar(value)) {
      segments.push({
        text: unquoteYamlValue(value),
        key: path,
        structure: { format: "yaml", key: path, lineStart: index, lineEnd: index, valuePrefix, comment }
      });
    }
  }
  return segments;
}

function buildYaml(segments, structure = null) {
  const sourceLines = structure?.sourceLines || segments.find((segment) => segment.structure?.sourceLines)?.structure.sourceLines;
  if (!sourceLines) {
    return segments
      .map((segment) => `${segment.structure?.key || segment.id}: ${quoteYamlValue(segment.target || "")}`)
      .join("\n");
  }
  const lines = [...sourceLines];
  [...segments]
    .filter((segment) => segment.structure?.format === "yaml")
    .sort((a, b) => (b.structure?.lineStart || 0) - (a.structure?.lineStart || 0))
    .forEach((segment) => {
      const item = segment.structure;
      const value = segment.target || "";
      if (item.blockStyle) {
        if (item.originalText !== undefined && value === item.originalText) return;
        const indent = " ".repeat(item.blockIndent || 2);
        const normalized = String(value).replace(/\r\n/g, "\n");
        if (/^[ \t]/.test(normalized)) {
          // Quoted scalars preserve leading content spaces without ambiguous indentation.
          lines.splice(item.lineStart, item.lineEnd - item.lineStart + 1, `${item.valuePrefix}${quoteYamlValue(normalized)}${item.comment ? ` ${item.comment}` : ""}`);
          return;
        }
        const ending = normalized.match(/\n+$/)?.[0].length || 0;
        const blockStyle = ending === 0 ? "|-" : ending === 1 ? "|" : "|+";
        const content = ending ? normalized.slice(0, -1) : normalized;
        const blockLines = content.split("\n").map((line) => `${indent}${line}`);
        if (item.lineEnd === lines.length - 1 && ending) blockLines.push("");
        lines.splice(item.lineStart, item.lineEnd - item.lineStart + 1, `${item.valuePrefix}${blockStyle}${item.comment ? ` ${item.comment}` : ""}`, ...blockLines);
        return;
      }
      const comment = item.comment ? ` ${item.comment}` : "";
      lines[item.lineStart] = `${item.valuePrefix}${quoteYamlValue(value)}${comment}`;
    });
  return lines.join("\n");
}

const htmlBlockSelector = [
  "title",
  "body",
  "main",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dt",
  "dd",
  "figcaption",
  "caption",
  "th",
  "td",
  "blockquote",
  "button",
  "label",
  "legend",
  "option"
].join(",");

function cleanHtmlSegment(value) {
  return String(value || "").trim();
}

function translatableHtmlElements(doc) {
  return Array.from(doc.querySelectorAll(htmlBlockSelector)).filter((element) => {
    if (element.closest("script, style, noscript, template, svg, canvas")) return false;
    if (!String(element.textContent || "").trim()) return false;
    const nested = Array.from(element.querySelectorAll(htmlBlockSelector)).some((child) => child !== element);
    return !nested;
  });
}

const GENERIC_XML_TRANSLATABLE_ATTRS = new Set([
  "alt", "aria-description", "aria-label", "caption", "description", "label", "placeholder", "prompt", "summary", "text", "title", "tooltip"
]);
const WIX_TRANSLATABLE_ATTRS = new Set(["description", "manufacturer", "name", "title"]);

function translatedAttributeElement(doc, item) {
  if (doc.documentElement.contains(item.element)) return item.element;
  const attributes = Array.from(item.element.attributes).filter((attr) => !attr.name.startsWith("xmlns"));
  const mutable = new Set([...GENERIC_XML_TRANSLATABLE_ATTRS, ...WIX_TRANSLATABLE_ATTRS]);
  const stable = attributes.filter((attr) => !mutable.has(attr.name.toLowerCase()));
  let candidates = Array.from(doc.getElementsByTagNameNS(item.element.namespaceURI || "*", item.element.localName))
    .filter((element) => stable.every((attr) => element.getAttribute(attr.name) === attr.value));
  if (candidates.length > 1) candidates = candidates.filter((element) => attributes.every((attr) => element.getAttribute(attr.name) === attr.value));
  if (candidates.length !== 1) throw new Error("Translated inline attributes are ambiguous after markup changes. Preserve each original inline element identity before exporting.");
  return candidates[0];
}

function htmlLocalizationItems(doc) {
  const excluded = (element) => element.closest('script, style, noscript, template, svg, canvas, [translate="no"], [translatable="false"]');
  const blocks = translatableHtmlElements(doc).filter((element) => !excluded(element) && !element.querySelector('[translate="no"], [translatable="false"]'));
  const covered = (element) => blocks.some((block) => block === element || block.contains(element));
  /** @type {Array<{element: Element, kind: string, value?: string, node?: Node, attrName?: string}>} */
  const items = blocks.map((element) => ({ element, kind: "element", value: cleanHtmlSegment(element.innerHTML) }));
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue.trim() || excluded(node.parentElement) || covered(node.parentElement)) continue;
    items.push({ element: node.parentElement, node, kind: "text", value: node.nodeValue });
  }
  for (const element of doc.querySelectorAll("*")) {
    if (excluded(element)) continue;
    for (const name of ["alt", "title", "placeholder", "aria-label", "aria-description"]) {
      const value = element.getAttribute(name);
      if (value?.trim()) items.push({ element, kind: "attribute", attrName: name, value });
    }
  }
  return items;
}

function parseHtml(text) {
  const parser = new DOMParser();
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const doc = parser.parseFromString(parserInput, "text/html");
  const items = htmlLocalizationItems(doc);
  return {
    structure: { format: "html", source: text, htmlMappingVersion: 2 },
    segments: items.map((item, index) => {
      const { element, value } = item;
      return {
        text: value,
        key: `html-block-${index + 1}`,
        tags: item.kind === "element" ? detectTags(value) : [],
        structure: { format: "html", elementIndex: index, kind: item.kind, selector: element.tagName.toLowerCase() }
      };
    })
  };
}

function buildHtml(segments, structure = null) {
  const source = structure?.source || segments.find((segment) => segment.structure?.htmlSource)?.structure?.htmlSource;
  if (!source) {
    return segments.map((segment) => targetText(segment)).join("\n\n");
  }
  const parser = new DOMParser();
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(source) || source;
  const doc = parser.parseFromString(parserInput, "text/html");
  /** @type {Array<{element: Element, kind: string, node?: Node, attrName?: string}>} */
  const items = structure?.htmlMappingVersion === 2 ? htmlLocalizationItems(doc) : translatableHtmlElements(doc).map((element) => ({ element, kind: "element" }));
  const ordered = [...segments].sort((a, b) => Number(items[a.structure.elementIndex]?.kind === "attribute") - Number(items[b.structure.elementIndex]?.kind === "attribute"));
  let attributeElements;
  ordered.forEach((segment) => {
    const elementIndex = segment.structure?.elementIndex;
    const item = items[elementIndex];
    if (!item) throw new Error("HTML reconstruction element is missing.");
    const value = targetText(segment);
    if (item.kind === "attribute") {
      attributeElements ||= new Map(items.filter((entry) => entry.kind === "attribute").map((entry) => [entry, translatedAttributeElement(doc, entry)]));
      const element = attributeElements.get(item);
      element.setAttribute(item.attrName, value);
      return;
    }
    if (item.kind === "text") { item.node.nodeValue = value; return; }
    const safeFragment = window.CatHan?.appRuntime?.safeHtml?.fragment?.(value, doc);
    if (safeFragment) {
      item.element.replaceChildren(safeFragment);
      return;
    }
    const fragmentInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(`<body>${value}</body>`) || `<body>${value}</body>`;
    const fragmentDocument = parser.parseFromString(fragmentInput, "text/html");
    item.element.replaceChildren(...Array.from(fragmentDocument.body.childNodes));
  });
  for (const meta of doc.querySelectorAll("meta[charset]")) meta.setAttribute("charset", "utf-8");
  for (const meta of doc.querySelectorAll('meta[http-equiv="Content-Type" i]')) meta.setAttribute("content", "text/html; charset=utf-8");
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function isTranslatableMarkdownText(value) {
  return /[^\d\s.,:;!?()[\]{}'"`~@#$%^&*_+=|\\/<>-]/u.test(String(value || ""));
}

function isMarkdownFence(line) {
  const match = String(line || "").match(/^ {0,3}(`{3,}|~{3,})/);
  return match ? match[1] : "";
}

function isMarkdownTableLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(trimmed)) return true;
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isMarkdownReferenceLine(line) {
  return /^\s{0,3}\[[^\]]+\]:\s+/i.test(String(line || ""));
}

function isMarkdownHorizontalRule(line) {
  return /^\s{0,3}(?:[-*_]\s*){3,}$/.test(String(line || ""));
}

function isMarkdownImageOnlyLine(line) {
  return /^\s*!\[[^\]]*\]\([^)]+\)(?:\s+["'][^"']+["'])?\s*$/.test(String(line || ""));
}

function markdownHeadingMatch(line) {
  return String(line || "").match(/^(\s{0,3}#{1,6}\s+)(.*?)(\s+#+\s*)?$/);
}

function markdownListMatch(line) {
  return String(line || "").match(/^(\s{0,3}(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)(.+?)(\s*)$/);
}

function markdownQuoteMatch(line) {
  return String(line || "").match(/^(\s{0,3}>+\s?)(.+?)(\s*)$/);
}

function isMarkdownBlockBoundary(line) {
  return !String(line || "").trim() ||
    isMarkdownFence(line) ||
    markdownHeadingMatch(line) ||
    markdownListMatch(line) ||
    markdownQuoteMatch(line) ||
    isMarkdownTableLine(line) ||
    isMarkdownReferenceLine(line) ||
    isMarkdownHorizontalRule(line) ||
    isMarkdownImageOnlyLine(line);
}

function parseMarkdown(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const segments = [];
  let index = 0;
  let fence = "";
  let sequence = 1;

  if (lines[0]?.trim() === "---") {
    for (let cursor = 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].trim() === "---") {
        index = cursor + 1;
        break;
      }
    }
  }

  const pushLineSegment = (kind, lineIndex, prefix, value, suffix = "") => {
    const textValue = String(value || "");
    if (!isTranslatableMarkdownText(textValue)) return;
    const key = `md-${sequence}`;
    sequence += 1;
    segments.push({
      text: textValue,
      key,
      structure: {
        format: "markdown",
        kind,
        key,
        lineStart: lineIndex,
        lineEnd: lineIndex,
        prefix,
        suffix
      }
    });
  };

  while (index < lines.length) {
    const line = lines[index];
    const fenceMarker = isMarkdownFence(line);
    if (fence) {
      if (fenceMarker && fenceMarker[0] === fence[0] && fenceMarker.length >= fence.length && line.trim() === fenceMarker) fence = "";
      index += 1;
      continue;
    }
    if (fenceMarker) {
      fence = fenceMarker;
      index += 1;
      continue;
    }
    if (!line.trim() || /^(?: {4}|\t)/.test(line)) {
      index += 1;
      continue;
    }
    if (isMarkdownTableLine(line) || isMarkdownReferenceLine(line) || isMarkdownHorizontalRule(line) || isMarkdownImageOnlyLine(line)) {
      index += 1;
      continue;
    }

    const heading = markdownHeadingMatch(line);
    if (heading) {
      pushLineSegment("heading", index, heading[1], heading[2], heading[3] || "");
      index += 1;
      continue;
    }

    const list = markdownListMatch(line);
    if (list) {
      pushLineSegment("list", index, list[1], list[2], list[3] || "");
      index += 1;
      continue;
    }

    const quote = markdownQuoteMatch(line);
    if (quote) {
      pushLineSegment("blockquote", index, quote[1], quote[2], quote[3] || "");
      index += 1;
      continue;
    }

    const start = index;
    const paragraphLines = [];
    while (index < lines.length && !isMarkdownBlockBoundary(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    const paragraphText = paragraphLines.join("\n").trim();
    if (isTranslatableMarkdownText(paragraphText)) {
      const key = `md-${sequence}`;
      sequence += 1;
      segments.push({
        text: paragraphText,
        key,
        structure: {
          format: "markdown",
          kind: "paragraph",
          key,
          lineStart: start,
          lineEnd: index - 1
        }
      });
    }
  }

  if (!segments.length) throw new Error("No translatable Markdown text was found.");
  return {
    structure: { format: "markdown", sourceLines: lines },
    segments
  };
}

function buildMarkdown(segments, structure = null) {
  const sourceLines = structure?.sourceLines;
  if (!sourceLines) {
    return segments.map((segment) => targetText(segment)).join("\n\n");
  }
  const lines = [...sourceLines];
  [...segments]
    .filter((segment) => segment.structure?.format === "markdown" && Number.isFinite(segment.structure?.lineStart))
    .sort((a, b) => b.structure.lineStart - a.structure.lineStart)
    .forEach((segment) => {
      const item = segment.structure;
      const value = targetText(segment).replace(/\r/g, "");
      const start = item.lineStart;
      const end = Number.isFinite(item.lineEnd) ? item.lineEnd : start;
      if (item.kind === "paragraph") {
        lines.splice(start, end - start + 1, ...value.split("\n"));
        return;
      }
      const singleLineValue = value.split("\n").join(" ");
      lines.splice(start, end - start + 1, `${item.prefix || ""}${singleLineValue}${item.suffix || ""}`);
  });
  return lines.join("\n");
}

function countDelimitedColumns(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimitedDelimiter(text, fileName = "") {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const sample = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  return [",", ";", "\t"]
    .map((delimiter) => ({ delimiter, count: countDelimitedColumns(sample, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const value = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("The delimited localization file has an unterminated quoted field.");
  row.push(cell);
  if (row.length > 1 || row.some((item) => String(item || "").trim())) rows.push(row);
  return rows;
}

function quoteDelimitedCell(value, delimiter) {
  const text = String(value ?? "");
  const needsQuotes = text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter) || /^\s|\s$/.test(text);
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeDelimitedRows(rows, delimiter) {
  return rows.map((row) => row.map((cell) => quoteDelimitedCell(cell, delimiter)).join(delimiter)).join("\n");
}

function normalizedDelimitedHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function delimitedHeaderIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizedDelimitedHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizedDelimitedHeader(header)));
}

function parseDelimitedLocalization(text, fileName, format) {
  const delimiter = detectDelimitedDelimiter(text, fileName);
  const rows = parseDelimitedRows(text, delimiter);
  if (!rows.length) throw new Error("The delimited localization file is empty.");

  const firstRow = rows[0] || [];
  const sourceAliases = ["source", "source text", "sourcetext", "src", "text", "string", "value", "original", "english", "en"];
  const targetAliases = ["target", "target text", "targettext", "translation", "translated", "trans", "tr"];
  const keyAliases = ["key", "id", "name", "context", "msgctxt", "identifier"];
  const headerSource = delimitedHeaderIndex(firstRow, sourceAliases);
  const headerTarget = delimitedHeaderIndex(firstRow, targetAliases);
  const headerKey = delimitedHeaderIndex(firstRow, keyAliases);
  const hasHeader = headerSource >= 0 || headerTarget >= 0 || headerKey >= 0;
  const sourceIndex = headerSource >= 0 ? headerSource : hasHeader ? Math.max(0, firstRow.findIndex((cell, index) => index !== headerTarget && index !== headerKey)) : (firstRow.length > 1 ? 1 : 0);
  const targetIndex = headerTarget >= 0 ? headerTarget : -1;
  const writeIndex = targetIndex >= 0 ? targetIndex : sourceIndex;
  const keyIndex = headerKey >= 0 ? headerKey : (sourceIndex === 0 ? -1 : 0);
  const startRow = hasHeader ? 1 : 0;
  const segments = [];

  rows.slice(startRow).forEach((row, offset) => {
    const rowIndex = startRow + offset;
    const source = row[sourceIndex] || "";
    if (!String(source).trim()) return;
    const key = keyIndex >= 0 && row[keyIndex] ? row[keyIndex] : `${format}-${rowIndex + 1}`;
    segments.push({
      text: source,
      target: targetIndex >= 0 ? row[targetIndex] || "" : "",
      key,
      structure: {
        format,
        key,
        rowIndex,
        sourceIndex,
        targetIndex,
        writeIndex
      }
    });
  });

  if (!segments.length) throw new Error("No translatable rows were found in the delimited localization file.");
  return {
    structure: { format, delimiter, rows, hasHeader, sourceIndex, targetIndex, writeIndex, keyIndex },
    segments
  };
}

function buildDelimitedLocalization(segments, structure = null, fallbackDelimiter = ",") {
  const delimiter = structure?.delimiter || fallbackDelimiter;
  const sourceRows = structure?.rows;
  if (!sourceRows) {
    return serializeDelimitedRows(segments.map((segment) => [segment.structure?.key || segment.id || "", segment.source || segment.text || "", segment.target || ""]), delimiter);
  }
  const rows = sourceRows.map((row) => [...row]);
  segments.forEach((segment) => {
    const item = segment.structure || {};
    if (!Number.isFinite(item.rowIndex)) return;
    const row = rows[item.rowIndex] || [];
    const writeIndex = Number.isFinite(item.writeIndex) ? item.writeIndex : Number.isFinite(item.targetIndex) && item.targetIndex >= 0 ? item.targetIndex : item.sourceIndex || 0;
    row[writeIndex] = targetText(segment);
    rows[item.rowIndex] = row;
  });
  return serializeDelimitedRows(rows, delimiter);
}

function xmlParseError(doc) {
  return doc.querySelector("parsererror");
}

function parseXmlDocument(text, label = "XML") {
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const doc = new DOMParser().parseFromString(parserInput, "application/xml");
  if (xmlParseError(doc)) throw new Error(`${label} is not valid XML.`);
  return doc;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializedXmlChildren(element, preserveWhitespace = false) {
  const serializer = new XMLSerializer();
  const mixedContent = element.children.length > 0;
  const value = Array.from(element.childNodes || []).map((node) => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return mixedContent ? escapeXml(node.nodeValue || "") : node.nodeValue || "";
    return serializer.serializeToString(node);
  }).join("");
  return preserveWhitespace ? value : value.trim();
}

function translatableAndroidElements(doc) {
  const root = doc.documentElement;
  if (!root || root.localName !== "resources") throw new Error("Only Android resource XML files with a <resources> root are supported.");
  const items = [];
  Array.from(root.children || []).forEach((element) => {
    const tag = element.localName;
    const name = element.getAttribute("name") || "";
    if (element.getAttribute("translatable") === "false") return;
    if (!element.children.length && /^\s*[@?](?:[\w.]+:)?[\w.]+\/[\w.]+\s*$/.test(element.textContent)) return;
    if (tag === "string" && name) {
      items.push({ element, key: name, kind: "string" });
      return;
    }
    if ((tag === "string-array" || tag === "plurals") && name) {
      Array.from(element.children || []).forEach((child, index) => {
        if (child.localName !== "item" || child.getAttribute("translatable") === "false") return;
        if (!child.children.length && /^\s*[@?](?:[\w.]+:)?[\w.]+\/[\w.]+\s*$/.test(child.textContent)) return;
        const quantity = child.getAttribute("quantity") || "";
        const key = tag === "plurals" && quantity ? `${name}.${quantity}` : `${name}[${index}]`;
        items.push({ element: child, key, kind: tag === "plurals" ? "plural" : "array-item", parentName: name, quantity, itemIndex: index });
      });
      return;
    }
    if (tag === "item" && element.getAttribute("type") === "string" && name) {
      items.push({ element, key: name, kind: "typed-item" });
    }
  });
  return items;
}

function parseAndroidXml(text) {
  const doc = parseXmlDocument(text, "Android resource XML");
  const items = translatableAndroidElements(doc);
  const segments = items.map((item, index) => ({
    text: serializedXmlChildren(item.element),
    key: item.key,
    tags: detectTags(serializedXmlChildren(item.element)),
    structure: {
      format: "android-xml",
      key: item.key,
      elementIndex: index,
      kind: item.kind,
      parentName: item.parentName || "",
      quantity: item.quantity || "",
      itemIndex: item.itemIndex
    }
  })).filter((segment) => segment.text.trim());
  if (!segments.length) throw new Error("No translatable Android XML resources were found.");
  return {
    structure: { format: "android-xml", source: text },
    segments
  };
}

function replaceXmlChildren(doc, element, value) {
  const text = String(value || "");
  if (!element.children.length) {
    element.textContent = text;
    return;
  }
  const namespaces = new Map();
  for (let ancestor = element; ancestor?.nodeType === Node.ELEMENT_NODE; ancestor = ancestor.parentNode) {
    for (const attr of ancestor.attributes) {
      if ((attr.name === "xmlns" || attr.prefix === "xmlns") && !namespaces.has(attr.name)) namespaces.set(attr.name, attr.value);
    }
  }
  const declarations = Array.from(namespaces, ([name, uri]) => ` ${name}="${escapeXml(uri).replaceAll('"', "&quot;")}"`).join("");
  const wrappedText = `<wrapper${declarations}>${text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, "&amp;")}</wrapper>`;
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(wrappedText) || wrappedText;
  const wrapped = new DOMParser().parseFromString(parserInput, "application/xml");
  if (xmlParseError(wrapped)) {
    throw new Error("Translated inline XML is not well formed. Check its tags and entities before exporting.");
  }
  while (element.firstChild) element.removeChild(element.firstChild);
  Array.from(wrapped.documentElement.childNodes).forEach((child) => {
    element.appendChild(doc.importNode(child, true));
  });
}

function buildAndroidXml(segments, structure = null) {
  const source = structure?.source;
  if (!source) {
    const body = segments.map((segment) => `  <string name="${String(segment.structure?.key || segment.key || segment.id || "string").replaceAll('"', "&quot;")}">${escapeXml(targetText(segment))}</string>`).join("\n");
    return `<resources>\n${body}\n</resources>`;
  }
  const doc = parseXmlDocument(source, "Android resource XML");
  const items = translatableAndroidElements(doc);
  segments.forEach((segment) => {
    const elementIndex = segment.structure?.elementIndex;
    const item = segment.structure?.key ? items.find((candidate) => candidate.key === segment.structure.key) : items[elementIndex];
    if (!item) throw new Error("Android resource mapping is missing or no longer translatable. Reimport the original file.");
    const keepQuotedWrapper = !item.element.children.length && /^"[\s\S]*"$/.test(item.element.textContent.trim()) && /^"[\s\S]*"$/.test(targetText(segment).trim());
    replaceXmlChildren(doc, item.element, targetText(segment));
    const walker = doc.createTreeWalker(item.element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const value = walker.currentNode.nodeValue;
      const first = value.search(/\S/), last = value.trimEnd().length - 1;
      walker.currentNode.nodeValue = value.replace(/\\[\s\S]|['"]/g, (token, index) => token.startsWith("\\") || (keepQuotedWrapper && token === '"' && (index === first || index === last)) ? token : `\\${token}`);
    }
  });
  return new XMLSerializer().serializeToString(doc);
}

function unescapeAppleString(value) {
  return String(value || "").replace(/\\[uU]([0-9a-fA-F]{4})|\\([0-7]{1,3})|\\([\s\S])/g, (_match, hex, octal, escaped) => {
    if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
    if (octal) return String.fromCharCode(Number.parseInt(octal, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[escaped] ?? escaped;
  });
}

function escapeAppleString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
}

function parseAppleStrings(text) {
  const source = text.replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"((?:\\[\s\S]|[^"\\])*)"\s*=\s*"((?:\\[\s\S]|[^"\\])*)"\s*;/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    if (match[1] === undefined) continue;
    const key = unescapeAppleString(match[1]);
    const value = unescapeAppleString(match[2]);
    if (!value.trim()) continue;
    const valueStart = match.index + match[0].indexOf('"', match[1].length + 2) + 1;
    segments.push({
      text: value,
      key,
      structure: {
        format: "apple-strings",
        key,
        lineIndex: source.slice(0, match.index).split("\n").length - 1,
        start: valueStart,
        end: valueStart + match[2].length
      }
    });
  }
  if (!segments.length) throw new Error("No translatable iOS strings were found.");
  return {
    structure: { format: "apple-strings", source, sourceLines: lines },
    segments
  };
}

function buildAppleStrings(segments, structure = null) {
  if (typeof structure?.source === "string" && segments.every((segment) => Number.isInteger(segment.structure?.start))) {
    let output = structure.source;
    [...segments].sort((a, b) => b.structure.start - a.structure.start).forEach((segment) => {
      output = `${output.slice(0, segment.structure.start)}${escapeAppleString(targetText(segment))}${output.slice(segment.structure.end)}`;
    });
    return output;
  }
  const sourceLines = structure?.sourceLines;
  if (!sourceLines) {
    return segments.map((segment) => `"${escapeAppleString(segment.structure?.key || segment.key || segment.id || "")}" = "${escapeAppleString(targetText(segment))}";`).join("\n");
  }
  const lines = [...sourceLines];
  segments.forEach((segment) => {
    const item = segment.structure || {};
    if (!Number.isFinite(item.lineIndex)) return;
    lines[item.lineIndex] = `${item.prefix || ""}"${item.rawKey || escapeAppleString(item.key || segment.key || "")}"${item.separator || " = "}"${escapeAppleString(targetText(segment))}"${item.suffix || ";"}`;
  });
  return lines.join("\n");
}

function idmlStoryPaths(entries) {
  return Array.from(entries.keys())
    .filter((path) => /^Stories\/[^/]+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b));
}

function idmlContentElements(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "Content"));
}

function directChildElementsByName(element, name) {
  return Array.from(element?.childNodes || []).filter((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === name);
}

function idmlParagraphStyleRanges(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "ParagraphStyleRange"));
}

function idmlCharacterStyleRanges(paragraph) {
  return directChildElementsByName(paragraph, "CharacterStyleRange");
}

function idmlStyleTag(range) {
  const style = [range?.getAttribute("AppliedCharacterStyle"), range?.getAttribute("CharacterStyle"), range?.getAttribute("FontStyle")].filter(Boolean).join(" ").toLowerCase();
  if (/(?:^|[/._ -])(?:bold|strong|semibold|demibold)(?:$|[/._ -])/i.test(style)) return "b";
  if (/(?:^|[/._ -])(?:italic|oblique|emphasis)(?:$|[/._ -])/i.test(style)) return "i";
  if (/(?:^|[/._ -])(?:underline|underlined)(?:$|[/._ -])/i.test(style)) return "u";
  return "";
}

function semanticWrap(tag, value) {
  return tag && String(value || "").trim() ? `<${tag}>${value}</${tag}>` : value;
}

function idmlStyledParagraphText(paragraph) {
  const ranges = idmlCharacterStyleRanges(paragraph);
  if (ranges.length < 2) return "";
  // Semantic tags cannot represent repeated distinct styles, embedded objects,
  // line breaks, or multiple Content nodes without losing their identities.
  // Keep those paragraphs as individual Content segments instead.
  const tags = ranges.map(idmlStyleTag);
  const signatures = new Map();
  const distinctStyles = ranges.some((range, index) => {
    const signature = JSON.stringify(Array.from(range.attributes).map((attribute) => [attribute.name, attribute.value]).sort()) +
      directChildElementsByName(range, "Properties").map((node) => new XMLSerializer().serializeToString(node)).join("");
    const previous = signatures.get(tags[index]);
    signatures.set(tags[index], signature);
    return previous !== undefined && previous !== signature;
  });
  if (distinctStyles || ranges.some((range) =>
    directChildElementsByName(range, "Content").length !== 1 ||
    Array.from(range.children).some((child) => !["Content", "Properties"].includes(child.localName)))) return "";
  return ranges
    .map((range) => {
      const content = directChildElementsByName(range, "Content")[0];
      return content ? semanticWrap(idmlStyleTag(range), serializedXmlChildren(content)) : "";
    })
    .join("");
}

function combineInlinePieces(pieces) {
  return pieces.reduce((combined, piece) => {
    if (!piece.text) return combined;
    const previous = combined[combined.length - 1];
    if (previous && previous.tag === piece.tag) previous.text += piece.text;
    else combined.push({ ...piece });
    return combined;
  }, []);
}

function parseSemanticInlinePieces(value) {
  const text = String(value || "");
  if (!text) return [{ tag: "", text: "" }];
  const wrappedText = `<wrapper>${text}</wrapper>`;
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(wrappedText) || wrappedText;
  const wrapped = new DOMParser().parseFromString(parserInput, "application/xml");
  if (xmlParseError(wrapped)) return [{ tag: "", text }];
  const serializer = new XMLSerializer();
  const pieces = [];
  const visit = (node, activeTag = "") => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      pieces.push({ tag: activeTag, text: node.nodeValue || "" });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = ["b", "i", "u"].includes(node.localName) ? node.localName : activeTag;
    if (tag !== activeTag) {
      Array.from(node.childNodes || []).forEach((child) => visit(child, tag));
      return;
    }
    pieces.push({ tag: activeTag, text: serializer.serializeToString(node) });
  };
  Array.from(wrapped.documentElement.childNodes || []).forEach((child) => visit(child));
  const combined = combineInlinePieces(pieces);
  return combined.length ? combined : [{ tag: "", text: "" }];
}

function setIdmlRangeContent(doc, range, value) {
  let content = directChildElementsByName(range, "Content")[0];
  if (!content) {
    content = doc.createElementNS(range.namespaceURI || doc.documentElement.namespaceURI || null, "Content");
    range.appendChild(content);
  }
  directChildElementsByName(range, "Content")
    .filter((item) => item !== content)
    .forEach((item) => item.parentNode?.removeChild(item));
  replaceXmlChildren(doc, content, value);
}

function replaceIdmlParagraphStyleRanges(doc, paragraph, value) {
  const ranges = idmlCharacterStyleRanges(paragraph);
  if (!ranges.length) return false;
  const templateByTag = new Map();
  ranges.forEach((range) => {
    const tag = idmlStyleTag(range);
    if (!templateByTag.has(tag)) templateByTag.set(tag, range);
  });
  const fallbackTemplate = templateByTag.get("") || ranges[0];
  const firstRange = ranges[0];
  const pieces = parseSemanticInlinePieces(value);
  pieces.forEach((piece) => {
    const template = templateByTag.get(piece.tag) || fallbackTemplate;
    const nextRange = template.cloneNode(true);
    setIdmlRangeContent(doc, nextRange, piece.text);
    firstRange.parentNode.insertBefore(nextRange, firstRange);
  });
  ranges.forEach((range) => range.parentNode?.removeChild(range));
  return true;
}

function idmlSimpleParagraphRanges(paragraph) {
  const ranges = idmlCharacterStyleRanges(paragraph);
  if (ranges.length < 2 || Array.from(paragraph.children).some((child) => !["CharacterStyleRange", "Properties"].includes(child.localName))) return [];
  if (ranges.some((range) => {
    const contents = directChildElementsByName(range, "Content");
    return contents.length !== 1 || Array.from(range.children).some((child) => !["Content", "Properties"].includes(child.localName)) ||
      Array.from(contents[0].childNodes).some((child) => ![Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(child.nodeType));
  })) return [];
  return ranges;
}

function idmlInlineRangeMap(paragraph, contents) {
  return idmlSimpleParagraphRanges(paragraph).map((range, rangeIndex) => {
    const contentIndex = contents.indexOf(directChildElementsByName(range, "Content")[0]);
    return { id: `idml-c${contentIndex}`, tag: idmlStyleTag(range) || "g", contentIndex, rangeIndex };
  });
}

function idmlInlineRangeText(mapping, contents) {
  return mapping.map((item) => `<${item.tag} id="${item.id}">${escapeXml(contents[item.contentIndex].textContent)}</${item.tag}>`).join("");
}

function idmlTextPieces(element) {
  const children = Array.from(element.childNodes);
  if (children.every((node) => [Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(node.nodeType))) return [{ value: element.textContent }];
  return children.flatMap((node, textNodeIndex) => [Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(node.nodeType) ? [{ value: node.nodeValue, textNodeIndex }] : []);
}

function setIdmlLiteralText(element, value, textNodeIndex) {
  const text = String(value || "");
  for (const character of text) {
    const code = character.codePointAt(0);
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) throw new Error("IDML translation contains an XML-invalid character.");
  }
  if (textNodeIndex !== undefined) {
    const node = element.childNodes[textNodeIndex];
    if (!Number.isInteger(textNodeIndex) || !node || ![Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(node.nodeType)) throw new Error("IDML Content text-node mapping is invalid. Reimport the original file.");
    if (node.nodeValue === text) return false;
    if (node.nodeType === Node.CDATA_SECTION_NODE && text.includes("]]>")) node.parentNode.replaceChild(element.ownerDocument.createTextNode(text), node);
    else node.nodeValue = text;
    return true;
  }
  if (Array.from(element.childNodes).some((node) => ![Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(node.nodeType))) throw new Error("IDML Content contains structural nodes. Reimport it to preserve those nodes.");
  if (element.textContent === text) return false;
  if (element.childNodes.length === 1 && !(element.firstChild.nodeType === Node.CDATA_SECTION_NODE && text.includes("]]>"))) element.firstChild.nodeValue = text;
  else element.textContent = text;
  return true;
}

function replaceIdmlMappedRanges(doc, paragraph, contents, segment) {
  const expected = idmlInlineRangeMap(paragraph, contents);
  if (!expected.length || JSON.stringify(expected) !== JSON.stringify(segment.structure.inlineRanges)) throw new Error("IDML style mapping no longer matches the original paragraph. Reimport the original file.");
  const value = targetText(segment);
  if (value === idmlInlineRangeText(expected, contents)) return false;
  const safeValue = value.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, "&amp;");
  const parsed = parseXmlDocument(`<idml-target>${safeValue}</idml-target>`, "IDML translated style tags");
  const byId = new Map(expected.map((item) => [item.id, item]));
  const used = new Set();
  const ordered = Array.from(parsed.documentElement.childNodes).map((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) throw new Error("Keep all IDML translated text inside its original style tags.");
    const element = /** @type {Element} */ (node);
    const id = element.getAttribute("id");
    const item = byId.get(id);
    if (!item || used.has(id) || element.localName !== item.tag || element.attributes.length !== 1 || element.children.length || Array.from(element.childNodes).some((child) => child.nodeType !== Node.TEXT_NODE && child.nodeType !== Node.CDATA_SECTION_NODE)) throw new Error("IDML translation has missing, duplicate or changed style tags.");
    used.add(id);
    return { item, value: element.textContent };
  });
  if (used.size !== expected.length) throw new Error("IDML translation is missing original style tags.");
  const ranges = idmlSimpleParagraphRanges(paragraph);
  ordered.forEach(({ item, value: translated }) => setIdmlLiteralText(contents[item.contentIndex], translated));
  if (ordered.some(({ item }, index) => item.rangeIndex !== index)) {
    const positions = ranges.map((range) => {
      const marker = doc.createComment("loopcat-idml-position");
      range.parentNode.replaceChild(marker, range);
      return marker;
    });
    positions.forEach((marker, index) => marker.parentNode.replaceChild(ranges[ordered[index].item.rangeIndex], marker));
  }
  return true;
}

async function parseIdmlFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipPackageEntries(bytes);
  if (!entries.has("designmap.xml")) throw new Error("IDML package is missing designmap.xml.");
  const storyPaths = idmlStoryPaths(entries);
  if (!storyPaths.length) throw new Error("IDML package has no story XML files.");
  const segments = [];
  storyPaths.forEach((path) => {
    const xml = parseXmlDocument(readPackageText(entries, path), `IDML story ${path}`);
    const usedContentIndexes = new Set();
    const contents = idmlContentElements(xml);
    idmlParagraphStyleRanges(xml).forEach((paragraph, paragraphIndex) => {
      const inlineRanges = idmlInlineRangeMap(paragraph, contents);
      if (!inlineRanges.length || !inlineRanges.some((item) => contents[item.contentIndex].textContent.trim())) return;
      const value = idmlInlineRangeText(inlineRanges, contents);
      const contentIndexes = inlineRanges.map((item) => item.contentIndex);
      contentIndexes.forEach((index) => usedContentIndexes.add(index));
      const key = `${path}#paragraph-${paragraphIndex + 1}`;
      segments.push({
        text: value,
        key,
        tags: detectTags(value),
        structure: {
          format: "idml",
          key,
          path,
          paragraphIndex,
          contentIndex: contentIndexes[0],
          contentIndexes,
          idmlVersion: 2,
          inlineRanges
        }
      });
    });
    contents.forEach((element, contentIndex) => {
      if (usedContentIndexes.has(contentIndex)) return;
      idmlTextPieces(element).forEach(({ value, textNodeIndex }) => {
        if (!value.trim()) return;
        const key = `${path}#content-${contentIndex + 1}${textNodeIndex === undefined ? "" : `-text-${textNodeIndex}`}`;
        segments.push({
          text: value,
          key,
          tags: detectTags(value).filter((tag) => tag.type !== "tag"),
          structure: { format: "idml", key, path, contentIndex, idmlVersion: 2, ...(textNodeIndex === undefined ? {} : { textNodeIndex }) }
        });
      });
    });
  });
  if (!segments.length) throw new Error("No translatable IDML story content was found.");
  return {
    fileName: file.name,
    documentName: stripExt(file.name),
    documentType: "idml",
    segments,
    structure: {
      format: "idml",
      idmlVersion: 2,
      packageBase64: bytesToBase64(bytes),
      storyPaths
    }
  };
}

async function buildIdmlFile(segments, structure = null) {
  if (!structure?.packageBase64) throw new Error("IDML reconstruction data is missing.");
  const entries = await unzipPackageEntries(base64ToBytes(structure.packageBase64));
  const allowedPaths = new Set(idmlStoryPaths(entries));
  const segmentsByPath = new Map();
  segments.forEach((segment) => {
    const path = segment.structure?.path;
    if (!allowedPaths.has(path)) throw new Error("IDML story mapping is missing or invalid. Reimport the original file.");
    if (!segmentsByPath.has(path)) segmentsByPath.set(path, []);
    segmentsByPath.get(path).push(segment);
  });

  let changed = false;
  for (const [path, pathSegments] of segmentsByPath.entries()) {
    const xml = parseXmlDocument(readPackageText(entries, path), `IDML story ${path}`);
    const contents = idmlContentElements(xml);
    const paragraphs = idmlParagraphStyleRanges(xml);
    const occupied = new Set();
    const occupy = (contentIndex, nodeIndex) => {
      if (!Number.isInteger(contentIndex) || contentIndex < 0 || !contents[contentIndex]) throw new Error("IDML Content mapping is invalid. Reimport the original file.");
      const key = `${contentIndex}:${nodeIndex === undefined ? "all" : nodeIndex}`;
      if (occupied.has(key) || occupied.has(`${contentIndex}:all`) || (nodeIndex === undefined && [...occupied].some((value) => value.startsWith(`${contentIndex}:`)))) throw new Error("IDML contains duplicate or overlapping Content mappings.");
      occupied.add(key);
    };
    pathSegments.forEach((segment) => {
      if (hasOwnValue(segment.structure, "paragraphIndex") && (!Number.isInteger(segment.structure.paragraphIndex) || segment.structure.paragraphIndex < 0)) throw new Error("IDML paragraph mapping is invalid.");
      if (segment.structure?.idmlVersion === 2 && hasOwnValue(segment.structure, "paragraphIndex") && !Array.isArray(segment.structure.inlineRanges)) throw new Error("IDML style mapping is missing. Reimport the original file.");
      if (segment.structure?.inlineRanges) segment.structure.inlineRanges.forEach((item) => occupy(item.contentIndex));
      else if (Number.isInteger(segment.structure?.paragraphIndex)) {
        const paragraph = paragraphs[segment.structure.paragraphIndex];
        if (!paragraph) throw new Error("IDML paragraph mapping is invalid.");
        idmlCharacterStyleRanges(paragraph).flatMap((range) => directChildElementsByName(range, "Content")).forEach((content) => occupy(contents.indexOf(content)));
      } else occupy(segment.structure?.contentIndex, segment.structure?.textNodeIndex);
    });
    let storyChanged = false;
    pathSegments.forEach((segment) => {
      const paragraphIndex = segment.structure?.paragraphIndex;
      if (segment.structure?.inlineRanges) {
        if (!Number.isInteger(paragraphIndex) || !paragraphs[paragraphIndex]) throw new Error("IDML paragraph mapping is invalid.");
        storyChanged = replaceIdmlMappedRanges(xml, paragraphs[paragraphIndex], contents, segment) || storyChanged;
        return;
      }
      if (Number.isFinite(paragraphIndex) && paragraphs[paragraphIndex]) {
        if (targetText(segment) === idmlStyledParagraphText(paragraphs[paragraphIndex])) return;
        replaceIdmlParagraphStyleRanges(xml, paragraphs[paragraphIndex], targetText(segment));
        storyChanged = true;
        return;
      }
      const contentIndex = segment.structure?.contentIndex;
      storyChanged = setIdmlLiteralText(contents[contentIndex], targetText(segment), segment.structure?.textNodeIndex) || storyChanged;
    });
    if (!storyChanged) continue;
    changed = true;
    entries.set(path, {
      name: path,
      data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml))
    });
  }

  return changed ? zipPackageEntries(entries) : base64ToBytes(structure.packageBase64);
}

function localNameLower(element) {
  return String(element?.localName || element?.nodeName || "").toLowerCase();
}

function childElementByLocalName(element, name) {
  const expected = String(name || "").toLowerCase();
  return Array.from(element?.childNodes || []).find((child) => child.nodeType === Node.ELEMENT_NODE && localNameLower(child) === expected) || null;
}

function descendantsByLocalName(element, name) {
  const expected = String(name || "").toLowerCase();
  return Array.from(element?.getElementsByTagNameNS?.("*", name) || [])
    .filter((child) => localNameLower(child) === expected);
}

function hasMeaningfulText(value) {
  return /\p{L}|\p{N}/u.test(String(value || ""));
}

function elementOptedOut(element) {
  let cursor = element;
  while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
    const translate = String(cursor.getAttribute("translate") || "").toLowerCase();
    const translatable = String(cursor.getAttribute("translatable") || "").toLowerCase();
    if (translate === "no" || translatable === "false") return true;
    cursor = cursor.parentNode;
  }
  return false;
}

function hasMeaningfulDirectText(element) {
  return Array.from(element?.childNodes || []).some((child) =>
    (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) &&
      hasMeaningfulText(child.nodeValue || "")
  );
}

function xmlElementKey(element, fallback) {
  return element?.getAttribute?.("id") ||
    element?.getAttribute?.("name") ||
    element?.getAttribute?.("key") ||
    element?.getAttribute?.("resname") ||
    fallback;
}

const GENERIC_XML_SKIP_ELEMENTS = new Set(["script", "style", "meta", "link", "base"]);

function isGenericXmlAttributeTranslatable(element, attr, documentFormat) {
  const name = String(attr?.name || "").toLowerCase();
  if (!hasMeaningfulText(attr?.value || "")) return false;
  if (/^(?:id|key|ref|href|src|type|class|style|lang|xml:lang|xmlns)/i.test(name)) return false;
  if (GENERIC_XML_TRANSLATABLE_ATTRS.has(name)) return true;
  if (documentFormat === "wix" && WIX_TRANSLATABLE_ATTRS.has(name)) return true;
  return false;
}

function collectGenericXmlItems(doc, documentFormat = "xml", options = {}) {
  const includeAttributes = options.includeAttributes !== false;
  const elements = Array.from(doc.getElementsByTagName("*"));
  const elementCandidates = elements.filter((element) => {
    if (element === doc.documentElement && element.children.length) return false;
    if (GENERIC_XML_SKIP_ELEMENTS.has(localNameLower(element))) return false;
    if (elementOptedOut(element)) return false;
    if (!hasMeaningfulDirectText(element)) return false;
    const value = serializedXmlChildren(element);
    return hasMeaningfulText(value);
  });
  const textOnly = new Set(options.protectNestedOptOut ? elementCandidates.filter((element) => element.querySelector('[translate="no"], [translatable="false"]')) : []);
  const candidateSet = new Set(elementCandidates.filter((element) => !textOnly.has(element)));
  const items = [];

  elementCandidates.forEach((element) => {
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== doc.documentElement) {
      if (candidateSet.has(ancestor)) return;
      ancestor = ancestor.parentElement;
    }
    if (textOnly.has(element)) {
      for (const node of element.childNodes) {
        if (![Node.TEXT_NODE, Node.CDATA_SECTION_NODE].includes(node.nodeType) || !hasMeaningfulText(node.nodeValue)) continue;
        items.push({ kind: "text", element, node, value: node.nodeValue, key: `${xmlElementKey(element, localNameLower(element))}#text-${items.length}` });
      }
      return;
    }
    const value = serializedXmlChildren(element);
    if (!hasMeaningfulText(value)) return;
    items.push({
      kind: "element",
      element,
      value,
      key: xmlElementKey(element, `${localNameLower(element)}-${items.length + 1}`)
    });
  });

  if (includeAttributes) {
    elements.forEach((element) => {
      if (elementOptedOut(element)) return;
      Array.from(element.attributes || []).forEach((attr) => {
        if (!isGenericXmlAttributeTranslatable(element, attr, documentFormat)) return;
        items.push({
          kind: "attribute",
          element,
          attrName: attr.name,
          value: attr.value,
          key: `${xmlElementKey(element, localNameLower(element))}@${attr.name}`
        });
      });
    });
  }

  return items;
}

function parseGenericXmlText(text, documentFormat = "xml", label = "XML") {
  const doc = parseXmlDocument(text, label);
  const items = collectGenericXmlItems(doc, documentFormat, { protectNestedOptOut: true });
  const segments = items.map((item, itemIndex) => ({
    text: item.value,
    key: item.key,
    tags: item.kind === "element" ? detectTags(item.value) : [],
    structure: {
      format: "generic-xml",
      documentFormat,
      itemIndex,
      kind: item.kind,
      key: item.key,
      attrName: item.attrName || ""
    }
  })).filter((segment) => hasMeaningfulText(segment.text));
  if (!segments.length) throw new Error(`No translatable ${label} content was found.`);
  return {
    structure: { format: "generic-xml", documentFormat, source: text, xmlMappingVersion: 2 },
    segments
  };
}

function buildGenericXml(segments, structure = null) {
  if (!structure?.source) throw new Error("XML reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "XML");
  const items = collectGenericXmlItems(doc, structure.documentFormat || "xml", { protectNestedOptOut: structure.xmlMappingVersion === 2 });
  const ordered = [...segments].sort((a, b) => Number(items[a.structure.itemIndex]?.kind === "attribute") - Number(items[b.structure.itemIndex]?.kind === "attribute"));
  let attributeElements;
  ordered.forEach((segment) => {
    const itemIndex = segment.structure?.itemIndex;
    if (!items[itemIndex]) throw new Error("XML reconstruction element is missing.");
    const item = items[itemIndex];
    if (item.kind === "text") { item.node.nodeValue = targetText(segment); return; }
    if (item.kind === "attribute") {
      attributeElements ||= new Map(items.filter((entry) => entry.kind === "attribute").map((entry) => [entry, translatedAttributeElement(doc, entry)]));
      const element = attributeElements.get(item);
      element.setAttribute(item.attrName, targetText(segment));
      return;
    }
    replaceXmlChildren(doc, item.element, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectResxItems(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "data"))
    .filter((dataElement) => {
      const type = dataElement.getAttribute("type") || "";
      return !dataElement.hasAttribute("mimetype") && (!type || /^System\.String(?:\s*,|$)/i.test(type));
    })
    .map((dataElement) => {
      const valueElement = childElementByLocalName(dataElement, "value");
      return valueElement ? {
        dataElement,
        valueElement,
        key: dataElement.getAttribute("name") || dataElement.getAttribute("id") || "data",
        value: valueElement.textContent || ""
      } : null;
    })
    .filter((item) => item && hasMeaningfulText(item.value));
}

function parseResxText(text) {
  const doc = parseXmlDocument(text, "RESX XML");
  const items = collectResxItems(doc);
  if (!items.length) throw new Error("No translatable RESX values were found.");
  return {
    structure: { format: "resx", source: text },
    segments: items.map((item, itemIndex) => ({
      text: item.value,
      key: item.key,
      tags: detectTags(item.value),
      structure: { format: "resx", itemIndex, key: item.key }
    }))
  };
}

function buildResx(segments, structure = null) {
  if (!structure?.source) throw new Error("RESX reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "RESX XML");
  const items = collectResxItems(doc);
  segments.forEach((segment) => {
    const itemIndex = segment.structure?.itemIndex;
    const key = segment.structure?.key;
    const item = key ? items.find((candidate) => candidate.key === key) : items[itemIndex];
    if (!item) throw new Error("RESX resource mapping is missing or refers to a non-string resource. Reimport this file before exporting.");
    item.valueElement.textContent = targetText(segment);
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectTsMessages(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "message"))
    .map((message, messageIndex) => {
      const sourceElement = childElementByLocalName(message, "source");
      if (!sourceElement) return null;
      const targetElement = childElementByLocalName(message, "translation");
      if (["obsolete", "vanished"].includes(targetElement?.getAttribute("type"))) return null;
      const source = serializedXmlChildren(sourceElement, true);
      const target = targetElement ? serializedXmlChildren(targetElement, true) : "";
      return hasMeaningfulText(source) ? { message, messageIndex, sourceElement, targetElement, source, target } : null;
    })
    .filter(Boolean);
}

function parseTsXmlText(text) {
  const doc = parseXmlDocument(text, "TS XML");
  if (localNameLower(doc.documentElement) !== "ts") throw new Error("The file is not a Qt TS XML file.");
  const messages = collectTsMessages(doc);
  if (!messages.length) throw new Error("No translatable TS messages were found.");
  return {
    structure: { format: "ts-xml", source: text },
    segments: messages.flatMap((message, itemIndex) => {
      const plurals = message.targetElement ? directChildElementsByName(message.targetElement, "numerusform") : [];
      if (message.message.getAttribute("numerus") === "yes" && !plurals.length) {
        throw new Error("Qt TS plural forms are missing. Initialize target-language plural forms in Qt Linguist before importing.");
      }
      const forms = plurals.length ? plurals.map((element, pluralIndex) => ({ element, pluralIndex })) : [{ element: message.targetElement }];
      return forms.flatMap(({ element, pluralIndex }) => {
        const variants = element ? directChildElementsByName(element, "lengthvariant") : [];
        const values = variants.length ? variants.map((node, lengthVariantIndex) => ({ node, lengthVariantIndex })) : [{ node: element }];
        return values.map(({ node, lengthVariantIndex }) => {
          const formatFlags = ["qt-format", "qt-plural-format"];
          return {
            text: message.source,
            target: node ? serializedXmlChildren(node, true) : "",
            key: `ts-${message.messageIndex + 1}${pluralIndex === undefined ? "" : `-plural-${pluralIndex}`}${lengthVariantIndex === undefined ? "" : `-variant-${lengthVariantIndex}`}`,
            tags: detectTags(message.source, { formatFlags }),
            structure: { format: "ts-xml", messageIndex: message.messageIndex, itemIndex, pluralIndex, lengthVariantIndex, formatFlags }
          };
        });
      });
    })
  };
}

function buildTsXml(segments, structure = null) {
  if (!structure?.source) throw new Error("TS reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "TS XML");
  const messages = collectTsMessages(doc);
  segments.forEach((segment) => {
    const message = Number.isInteger(segment.structure?.messageIndex)
      ? messages.find((item) => item.messageIndex === segment.structure.messageIndex)
      : messages[segment.structure?.itemIndex];
    if (!message) return;
    let targetElement = message.targetElement;
    if (!targetElement) {
      targetElement = doc.createElementNS(message.message.namespaceURI || doc.documentElement.namespaceURI || null, "translation");
      if (message.sourceElement.nextSibling) message.message.insertBefore(targetElement, message.sourceElement.nextSibling);
      else message.message.appendChild(targetElement);
    }
    let valueElement = targetElement;
    if (Number.isInteger(segment.structure?.pluralIndex)) valueElement = directChildElementsByName(valueElement, "numerusform")[segment.structure.pluralIndex];
    if (Number.isInteger(segment.structure?.lengthVariantIndex)) valueElement = valueElement && directChildElementsByName(valueElement, "lengthvariant")[segment.structure.lengthVariantIndex];
    if (!valueElement) throw new Error("Qt TS plural or length-variant reconstruction data is invalid.");
    if (!valueElement.children.length && message.sourceElement.children.length) {
      valueElement.replaceChildren(...Array.from(message.sourceElement.childNodes, (node) => node.cloneNode(true)));
    }
    replaceXmlChildren(doc, valueElement, targetText(segment));
  });
  messages.forEach((message) => {
    const targetElement = childElementByLocalName(message.message, "translation");
    if (!targetElement) return;
    const messageSegments = segments.filter((segment) => segment.structure?.messageIndex === message.messageIndex);
    if (messageSegments.length && messageSegments.every((segment) => targetText(segment).trim())) targetElement.removeAttribute("type");
    else targetElement.setAttribute("type", "unfinished");
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectBilingualXmlPairs(doc, documentFormat) {
  const usedSources = new Set();
  const pairs = [];
  const addPair = (sourceElement, targetElement, key, targetName = "target", targetLanguage = "") => {
    if (!sourceElement || usedSources.has(sourceElement)) return;
    const source = serializedXmlChildren(sourceElement);
    if (!hasMeaningfulText(source)) return;
    usedSources.add(sourceElement);
    pairs.push({
      sourceElement,
      targetElement,
      source,
      target: targetElement ? serializedXmlChildren(targetElement) : "",
      targetName,
      targetLanguage,
      key: key || xmlElementKey(sourceElement.parentElement, `${documentFormat}-${pairs.length + 1}`)
    });
  };

  Array.from(doc.getElementsByTagNameNS("*", "trans-unit")).forEach((unit, index) => {
    addPair(childElementByLocalName(unit, "source"), childElementByLocalName(unit, "target"), unit.getAttribute("id") || `trans-unit-${index + 1}`);
  });

  Array.from(doc.getElementsByTagNameNS("*", "segment")).forEach((unit, index) => {
    addPair(childElementByLocalName(unit, "source"), childElementByLocalName(unit, "target"), unit.getAttribute("id") || `segment-${index + 1}`);
  });

  Array.from(doc.getElementsByTagNameNS("*", "Tu")).forEach((unit, index) => {
    const variants = Array.from(unit.children || []).filter((element) => localNameLower(element) === "tuv");
    if (variants.length) {
      const settings = doc.querySelector("UserSettings");
      const sourceLanguage = (settings?.getAttribute("SourceLanguage") || "").toLowerCase();
      const targetLanguage = settings?.getAttribute("TargetLanguage") || "";
      const sourceVariant = variants.find((variant) => (variant.getAttribute("Lang") || "").toLowerCase() === sourceLanguage) || variants[0];
      const targetVariant = variants.find((variant) => targetLanguage && (variant.getAttribute("Lang") || "").toLowerCase() === targetLanguage.toLowerCase()) || variants.find((variant) => variant !== sourceVariant);
      if (!targetVariant && !targetLanguage) throw new Error("TTX target-language metadata is missing.");
      addPair(sourceVariant, targetVariant, unit.getAttribute("id") || `tu-${index + 1}`, "Tuv", targetLanguage);
      return;
    }
    const segs = descendantsByLocalName(unit, "seg");
    if (segs.length >= 2) addPair(segs[0], segs[1], unit.getAttribute("id") || `tu-${index + 1}`);
  });

  if (!pairs.length) {
    Array.from(doc.getElementsByTagNameNS("*", "source")).forEach((sourceElement, index) => {
      const parent = sourceElement.parentElement;
      addPair(sourceElement, childElementByLocalName(parent, "target") || childElementByLocalName(parent, "translation"), xmlElementKey(parent, `source-${index + 1}`));
    });
  }

  return pairs;
}

function parseBilingualXmlText(text, documentFormat) {
  const doc = parseXmlDocument(text, `${documentFormat.toUpperCase()} XML`);
  const pairs = collectBilingualXmlPairs(doc, documentFormat);
  if (!pairs.length) throw new Error(`No translatable ${documentFormat.toUpperCase()} source units were found.`);
  return {
    structure: { format: "bilingual-xml", documentFormat, source: text },
    segments: pairs.map((pair, pairIndex) => ({
      text: pair.source,
      target: pair.target,
      key: pair.key,
      tags: detectTags(pair.source),
      structure: { format: "bilingual-xml", documentFormat, pairIndex, key: pair.key }
    }))
  };
}

function buildBilingualXml(segments, structure = null) {
  if (!structure?.source) throw new Error("Bilingual XML reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "Bilingual XML");
  const pairs = collectBilingualXmlPairs(doc, structure.documentFormat || "xml");
  segments.forEach((segment) => {
    const pairIndex = segment.structure?.pairIndex;
    if (!Number.isFinite(pairIndex) || !pairs[pairIndex]) return;
    const pair = pairs[pairIndex];
    if (!pair.targetElement) {
      pair.targetElement = doc.createElementNS(pair.sourceElement.namespaceURI, pair.targetName);
      if (pair.targetLanguage) pair.targetElement.setAttribute("Lang", pair.targetLanguage);
      pair.sourceElement.parentNode.insertBefore(pair.targetElement, pair.sourceElement.nextSibling);
    }
    if (!pair.targetElement.children.length && pair.sourceElement.children.length) {
      pair.targetElement.replaceChildren(...Array.from(pair.sourceElement.childNodes, (node) => node.cloneNode(true)));
    }
    replaceXmlChildren(doc, pair.targetElement, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

function tmxChildren(element, name) {
  return Array.from(element?.children || []).filter((child) => localNameLower(child) === name);
}

function tmxDocument(text) {
  const doc = parseXmlDocument(text, "TMX");
  if (localNameLower(doc.documentElement) !== "tmx" || !childElementByLocalName(doc.documentElement, "body")) {
    throw new Error("The TMX file must contain a tmx root and a body.");
  }
  return doc;
}

function tmxLanguage(value) {
  return String(value || "").trim().replaceAll("_", "-").toLowerCase();
}

function tmxVariantIndex(variants, language, excluded = -1) {
  const expected = tmxLanguage(language);
  const candidates = variants.map((variant, index) => ({
    index,
    language: tmxLanguage(variant.getAttribute("xml:lang") || variant.getAttribute("lang"))
  })).filter((item) => item.index !== excluded);
  const exact = candidates.filter((item) => item.language === expected);
  const matches = exact.length ? exact : candidates.filter((item) => item.language.split("-")[0] === expected.split("-")[0]);
  if (matches.length > 1) throw new Error(`TMX contains ambiguous language variants for ${language}. Choose a project language with an exact locale match.`);
  return matches[0]?.index ?? -1;
}

// Keep native inline code payloads intact, while exposing ordinary text and hi
// contents for editing. Only these original XML tokens are reconstructed as XML.
function tmxContent(element, codes) {
  const serializer = new XMLSerializer();
  return Array.from(element?.childNodes || []).map((node) => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || "";
    if (node.nodeType === Node.ELEMENT_NODE && localNameLower(node) === "hi") {
      const open = serializer.serializeToString(node.cloneNode(false)).replace(/\/>$/, ">");
      const close = `</${node.nodeName}>`;
      codes.push(open, close);
      return open + tmxContent(node, codes) + close;
    }
    const code = serializer.serializeToString(node);
    codes.push(code);
    return code;
  }).join("");
}

function parseTmxDocument(text, options) {
  const { sourceLang, targetLang, importedTranslationStatus = "draft" } = options;
  if (!tmxLanguage(sourceLang) || !tmxLanguage(targetLang) || tmxLanguage(sourceLang) === tmxLanguage(targetLang)) {
    throw new Error("TMX document import requires distinct project source and target languages.");
  }
  if (!["draft", "confirmed"].includes(importedTranslationStatus)) throw new Error("Choose Draft or Confirmed for imported TMX translations.");
  const doc = tmxDocument(text);
  const units = tmxChildren(childElementByLocalName(doc.documentElement, "body"), "tu");
  const segments = [];
  units.forEach((unit, unitIndex) => {
    const variants = tmxChildren(unit, "tuv");
    const sourceVariantIndex = tmxVariantIndex(variants, sourceLang);
    if (sourceVariantIndex < 0) throw new Error(`TMX unit ${unitIndex + 1} has no source variant matching ${sourceLang}. Check the project language pair.`);
    const sourceElement = childElementByLocalName(variants[sourceVariantIndex], "seg");
    if (!sourceElement) throw new Error(`TMX unit ${unitIndex + 1} is missing its source seg element.`);
    const targetVariantIndex = tmxVariantIndex(variants, targetLang, sourceVariantIndex);
    const inlineCodes = [];
    const source = tmxContent(sourceElement, inlineCodes);
    const target = tmxContent(childElementByLocalName(variants[targetVariantIndex], "seg"), inlineCodes);
    if (!source.trim()) return;
    segments.push({
      text: source,
      target,
      status: target.trim() ? importedTranslationStatus : "empty",
      tags: detectTags(source),
      structure: {
        format: "tmx", unitIndex, sourceVariantIndex, targetVariantIndex,
        key: unit.getAttribute("tuid") || `tmx-${unitIndex + 1}`,
        inlineCodes: [...new Set(inlineCodes)]
      }
    });
  });
  if (!segments.length) throw new Error("No translatable TMX source segments were found.");
  return { segments, structure: { format: "tmx", source: text, sourceLang, targetLang } };
}

function buildTmxDocument(segments, structure) {
  const doc = tmxDocument(structure.source);
  const units = tmxChildren(childElementByLocalName(doc.documentElement, "body"), "tu");
  const seen = new Set();
  for (const segment of segments) {
    const mapping = segment.structure;
    const unit = units[mapping.unitIndex];
    const variants = tmxChildren(unit, "tuv");
    if (!unit || !variants[mapping.sourceVariantIndex] || seen.has(mapping.unitIndex) ||
        mapping.sourceVariantIndex === mapping.targetVariantIndex ||
        (mapping.targetVariantIndex >= 0 && !variants[mapping.targetVariantIndex])) {
      throw new Error("TMX translation unit or language variant mapping is invalid.");
    }
    seen.add(mapping.unitIndex);
    let targetVariant = variants[mapping.targetVariantIndex];
    const create = (name) => doc.createElementNS(unit.namespaceURI, unit.prefix ? `${unit.prefix}:${name}` : name);
    if (!targetVariant) {
      targetVariant = create("tuv");
      targetVariant.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", structure.targetLang);
      unit.appendChild(targetVariant);
    }
    let targetElement = childElementByLocalName(targetVariant, "seg");
    if (!targetElement) {
      targetElement = create("seg");
      targetVariant.appendChild(targetElement);
    }
    const codes = [...new Set(mapping.inlineCodes)].filter(Boolean).sort((a, b) => b.length - a.length);
    const pattern = codes.length ? new RegExp(`(${codes.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g") : null;
    const value = targetText(segment);
    const content = pattern ? value.split(pattern).map((part) => codes.includes(part) ? part : escapeXml(part)).join("") : escapeXml(value);
    const fragment = parseXmlDocument(`<wrapper>${content}</wrapper>`, "TMX target inline content");
    targetElement.replaceChildren(...Array.from(fragment.documentElement.childNodes, (node) => doc.importNode(node, true)));
  }
  // XMLSerializer emits Unicode; do not retain a legacy encoding declaration.
  return new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^?]*\?>\s*/i, "");
}

function splitTextBlocks(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let start = -1;
  let current = [];
  const flush = (endIndex) => {
    if (start < 0 || !current.length) return;
    blocks.push({ start, end: endIndex, text: current.join("\n").trim() });
    start = -1;
    current = [];
  };
  lines.forEach((line, index) => {
    if (!line.trim()) {
      flush(index - 1);
      return;
    }
    if (start < 0) start = index;
    current.push(line);
  });
  flush(lines.length - 1);
  return { lines, blocks };
}

function parsePlainText(text, documentFormat = "txt") {
  const { lines, blocks } = splitTextBlocks(text);
  const segments = blocks
    .filter((block) => hasMeaningfulText(block.text))
    .map((block, index) => ({
      text: block.text,
      key: `${documentFormat}-${index + 1}`,
      structure: {
        format: "plain-text",
        documentFormat,
        lineStart: block.start,
        lineEnd: block.end
      }
    }));
  if (!segments.length) throw new Error("No translatable plain-text content was found.");
  return { structure: { format: "plain-text", documentFormat, sourceLines: lines }, segments };
}

function buildPlainText(segments, structure = null) {
  const lines = [...(structure?.sourceLines || [])];
  [...segments]
    .filter((segment) => Number.isFinite(segment.structure?.lineStart))
    .sort((a, b) => b.structure.lineStart - a.structure.lineStart)
    .forEach((segment) => {
      const start = segment.structure.lineStart;
      const end = Number.isFinite(segment.structure.lineEnd) ? segment.structure.lineEnd : start;
      const replacement = String(targetText(segment)).replace(/\r/g, "").split("\n");
      lines.splice(start, end - start + 1, ...replacement);
    });
  return lines.join("\n");
}

function propertiesSeparatorIndex(line) {
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "=" || char === ":" || /[ \t\f]/.test(char)) return index;
  }
  return -1;
}

function decodePropertiesValue(value) {
  return String(value || "").replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (match, hex, escaped) => {
    if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === "f") return "\f";
    return escaped;
  });
}

function encodePropertiesValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/^ +/, (spaces) => spaces.replace(/ /g, "\\ "))
    .replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function parsePropertiesText(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const segments = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].trim() || /^[ \t\f]*[#!]/.test(lines[lineIndex])) continue;
    const firstLine = lineIndex;
    let line = lines[lineIndex].replace(/^[ \t\f]+/, "");
    while ((line.match(/\\+$/)?.[0].length || 0) % 2 === 1) {
      line = line.slice(0, -1);
      if (++lineIndex >= lines.length) break;
      line += lines[lineIndex].replace(/^[ \t\f]+/, "");
    }
    const separator = propertiesSeparatorIndex(line);
    if (separator < 0) continue;
    let valueStart = separator;
    while (/[ \t\f]/.test(line[valueStart] || "") && valueStart < line.length) valueStart += 1;
    if (line[valueStart] === "=" || line[valueStart] === ":") valueStart += 1;
    while (/[ \t\f]/.test(line[valueStart] || "") && valueStart < line.length) valueStart += 1;
    const rawValue = line.slice(valueStart);
    const value = decodePropertiesValue(rawValue);
    if (!hasMeaningfulText(value)) continue;
    const key = decodePropertiesValue(line.slice(0, separator));
    segments.push({
      text: value,
      key,
      structure: {
        format: "properties",
        key,
        lineIndex: firstLine,
        lineEnd: Math.min(lineIndex, lines.length - 1),
        prefix: `${lines[firstLine].match(/^[ \t\f]*/)[0]}${line.slice(0, valueStart)}`
      }
    });
  }
  if (!segments.length) throw new Error("No translatable properties were found.");
  return { structure: { format: "properties", sourceLines: lines }, segments };
}

function buildProperties(segments, structure = null) {
  const lines = [...(structure?.sourceLines || [])];
  [...segments].sort((a, b) => b.structure.lineIndex - a.structure.lineIndex).forEach((segment) => {
    const lineIndex = segment.structure?.lineIndex;
    if (!Number.isFinite(lineIndex)) return;
    const lineEnd = Number.isInteger(segment.structure.lineEnd) ? segment.structure.lineEnd : lineIndex;
    lines.splice(lineIndex, lineEnd - lineIndex + 1, `${segment.structure?.prefix || ""}${encodePropertiesValue(targetText(segment))}`);
  });
  return lines.join("\n");
}

function decodeCodeString(raw, quote, documentFormat) {
  if (documentFormat === "php" && quote === "'") return String(raw || "").replace(/\\(['\\])/g, "$1");
  if (documentFormat === "php") {
    return String(raw || "").replace(/\\u\{([0-9a-fA-F]+)\}|\\x([0-9a-fA-F]{1,2})|\\([0-7]{1,3})|\\([\s\S])/g, (match, unicode, hex, octal, escaped) => {
      if (unicode) {
        const codePoint = Number.parseInt(unicode, 16);
        if (codePoint > 0x10ffff) throw new Error("Invalid PHP Unicode escape.");
        return String.fromCodePoint(codePoint);
      }
      if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
      if (octal) return String.fromCharCode(Number.parseInt(octal, 8) % 256);
      return ({ n: "\n", r: "\r", t: "\t", v: "\v", e: "\x1b", f: "\f", '"': '"', "\\": "\\", $: "$" })[escaped] ?? match;
    });
  }
  return String(raw || "").replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\(.)/g, (match, codePoint, unicode, hex, escaped) => {
    if (codePoint) {
      const value = Number.parseInt(codePoint, 16);
      return Number.isFinite(value) && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    if (unicode) return String.fromCharCode(Number.parseInt(unicode, 16));
    if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    return escaped;
  });
}

function encodeCodeString(value, quote = '"', documentFormat, interpolation = []) {
  if (documentFormat === "php" && quote === "'") return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedQuote = quote === "`" ? "`" : quote;
  let output = String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replaceAll(escapedQuote, `\\${escapedQuote}`);
  if (documentFormat === "php") {
    output = output.replace(/\$/g, "\\$");
    for (const token of interpolation) {
      const encoded = token.replace(/\$/g, "\\$");
      output = output.replace(encoded, token);
    }
  }
  return output;
}

function parseCodeStringText(text, documentFormat = "php") {
  const source = String(text || "");
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|#[^\r\n]*|(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    if (!match[1]) continue;
    const quote = match[1];
    const raw = match[2] || "";
    const after = source.slice(match.index + match[0].length);
    const before = source.slice(0, match.index);
    // Resource identifiers and comments are scaffolding, never translations.
    if (/^\s*(?:=>|:)/.test(after) || (/\[\s*$/.test(before) && /^\s*\]/.test(after))) continue;
    if (documentFormat === "php" && quote === "`") continue;
    const value = decodeCodeString(raw, quote, documentFormat);
    if (!hasMeaningfulText(value)) continue;
    const tokenIndex = segments.length;
    segments.push({
      text: value,
      key: `${documentFormat}-${tokenIndex + 1}`,
      structure: {
        format: "code-string",
        documentFormat,
        tokenIndex,
        start: match.index,
        end: match.index + match[0].length,
        quote,
        interpolation: documentFormat === "php" && quote === '"'
          ? Array.from(raw.matchAll(/\\[\s\S]|(\$[A-Za-z_\x80-\uffff][\w\x80-\uffff]*)/g), (item) => item[1]).filter(Boolean)
          : []
      }
    });
  }
  if (!segments.length) throw new Error(`No translatable ${documentFormat.toUpperCase()} string literals were found.`);
  return { structure: { format: "code-string", documentFormat, source }, segments };
}

function buildCodeStringText(segments, structure = null) {
  let output = String(structure?.source || "");
  [...segments]
    .filter((segment) => Number.isFinite(segment.structure?.start) && Number.isFinite(segment.structure?.end))
    .sort((a, b) => b.structure.start - a.structure.start)
    .forEach((segment) => {
      const quote = segment.structure?.quote || '"';
      const value = targetText(segment);
      const encoded = structure?.documentFormat === "dtd"
        ? value.replace(/&(?!(?:[A-Za-z_:][\w.:-]*|#\d+|#x[\da-fA-F]+);)/g, "&amp;").replace(/%/g, "&#37;").replace(/</g, "&lt;").replaceAll(quote, quote === '"' ? "&quot;" : "&apos;")
        : encodeCodeString(value, quote, structure?.documentFormat, segment.structure?.interpolation || []);
      const replacement = `${quote}${encoded}${quote}`;
      output = `${output.slice(0, segment.structure.start)}${replacement}${output.slice(segment.structure.end)}`;
    });
  return output;
}

function parseQuotedText(text, documentFormat = "dtd") {
  const source = String(text || "");
  const pattern = /<!--[\s\S]*?-->|<!ENTITY\s+([\w.:-]+)\s+(["'])([\s\S]*?)\2\s*>/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    if (!match[1]) continue;
    const value = (match[3] || "").replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
      const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      if (named[entity]) return named[entity];
      const value = entity.startsWith("&#x") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
      if (value > 0x10ffff) throw new Error("Invalid DTD character reference.");
      return String.fromCodePoint(value);
    });
    if (!hasMeaningfulText(value)) continue;
    const tokenIndex = segments.length;
    segments.push({
      text: value,
      key: match[1],
      structure: {
        format: "quoted-text",
        documentFormat,
        tokenIndex,
        start: match.index + match[0].indexOf(match[2]),
        end: match.index + match[0].indexOf(match[2]) + match[3].length + 2,
        quote: match[2]
      }
    });
  }
  if (!segments.length) throw new Error(`No translatable ${documentFormat.toUpperCase()} quoted text was found.`);
  return { structure: { format: "quoted-text", documentFormat, source }, segments };
}

function parseMifText(text) {
  const source = String(text || "");
  const pattern = /(<String\s+`)((?:\\[\s\S]|[^'\\])*)('>)/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    const value = decodeCodeString(match[2] || "");
    if (!hasMeaningfulText(value)) continue;
    const tokenIndex = segments.length;
    segments.push({
      text: value,
      key: `mif-${tokenIndex + 1}`,
      structure: {
        format: "mif",
        tokenIndex,
        start: match.index,
        end: match.index + match[0].length,
        prefix: match[1],
        suffix: match[3]
      }
    });
  }
  if (!segments.length) throw new Error("No translatable MIF strings were found.");
  return { structure: { format: "mif", source }, segments };
}

function buildMifText(segments, structure = null) {
  let output = String(structure?.source || "");
  [...segments]
    .filter((segment) => Number.isFinite(segment.structure?.start) && Number.isFinite(segment.structure?.end))
    .sort((a, b) => b.structure.start - a.structure.start)
    .forEach((segment) => {
      const replacement = `${segment.structure?.prefix || "<String `"}${encodeCodeString(targetText(segment), "'")}${segment.structure?.suffix || "'>"}`;
      output = `${output.slice(0, segment.structure.start)}${replacement}${output.slice(segment.structure.end)}`;
    });
  return output;
}

function subtitleTimingPattern(format) {
  if (format === "sbv") return /^\d+:\d{2}:\d{2}\.\d{3}\s*,\s*\d+:\d{2}:\d{2}\.\d{3}$/;
  return /^(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}(?:\s+.*)?$/;
}

function parseSubtitleText(text, format) {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (format === "vtt" && !/^WEBVTT(?:[ \t]|\n|$)/.test(source)) throw new Error("WebVTT files must begin with a WEBVTT header.");
  const rawBlocks = source.split(/\n[ \t]*\n(?:[ \t]*\n)*/).map((block) => block.split("\n"));
  const timingPattern = subtitleTimingPattern(format);
  const segments = [];
  rawBlocks.forEach((lines, blockIndex) => {
    if (format === "vtt" && /^(?:WEBVTT|NOTE|STYLE|REGION)(?:[ \t]|$)/.test(lines[0])) return;
    const timingIndex = lines.findIndex((line) => timingPattern.test(line.trim()));
    if (timingIndex < 0) {
      if (lines.some((line) => line.trim())) throw new Error(`${format.toUpperCase()} cue ${blockIndex + 1} has invalid timing data.`);
      return;
    }
    const textStart = timingIndex + 1;
    const cueText = lines.slice(textStart).map((line) => line.trimEnd()).filter((line) => line.trim()).join("\n");
    if (!hasMeaningfulText(cueText)) return;
    const cueId = timingIndex > 0 ? lines[timingIndex - 1].trim() : `${format}-${segments.length + 1}`;
    segments.push({
      text: cueText,
      key: cueId || `${format}-${segments.length + 1}`,
      structure: {
        format,
        blockIndex,
        timingIndex,
        textStart,
        textLineCount: Math.max(0, lines.length - textStart),
        cueId
      }
    });
  });
  if (!segments.length) throw new Error(`No valid ${format.toUpperCase()} cues were found.`);
  return { structure: { format, blocks: rawBlocks, sourceEndedWithNewline: /\n$/.test(source) }, segments };
}

function expandSubtitleSegments(segments) {
  return segments.flatMap((segment) => {
    if (!segment.subtitle?.cues) return [segment];
    if (segment.subtitle.version !== 1 || segment.subtitle.needsBoundaries || segment.subtitle.sourceTimingConflict) throw new Error("Review the subtitle timing and text boundaries before exporting.");
    const target = String(segment.target || "");
    let boundary = 0;
    const expanded = segment.subtitle.cues.map((cue) => {
      if (cue.from !== boundary || !Number.isInteger(cue.to) || cue.to < cue.from || cue.to > target.length) throw new Error("Invalid subtitle text boundary.");
      boundary = cue.to;
      return { ...segment, target: target.slice(cue.from, cue.to), subtitle: { version: 1, timing: cue } };
    });
    if (!expanded.length || boundary !== target.length) throw new Error("Invalid subtitle text boundary.");
    return expanded;
  });
}

function subtitleStartTime(line) {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/.exec(String(line).trim());
  return match ? ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]) : 0;
}

function buildSubtitleText(segments, structure = null, _format = "vtt") {
  const blocks = (structure?.blocks || []).map((block) => [...block]);
  const removedBlocks = new Set(segments.flatMap((segment) => segment.subtitle?.removedBlocks || []));
  const replacements = new Map();
  segments.forEach((segment) => {
    const item = segment.structure || {};
    if (!Number.isFinite(item.blockIndex) || !blocks[item.blockIndex]) return;
    const block = blocks[item.blockIndex];
    if (segment.subtitle?.cues) {
      const cues = expandSubtitleSegments([segment]);
      replacements.set(item.blockIndex, cues.map((cue, index) => {
        const prefix = block.slice(0, item.textStart);
        prefix[item.timingIndex || 0] = editedSubtitleTiming(cue, block[item.timingIndex || 0], _format);
        if (index && item.timingIndex > 0) prefix[item.timingIndex - 1] = `${item.cueId || "cue"}-split-${index + 1}`;
        return [...prefix, ...cleanSrtCueText(cue.target).split("\n")];
      }));
      return;
    }
    block[item.timingIndex || 0] = editedSubtitleTiming(segment, block[item.timingIndex || 0], _format);
    const textStart = Number.isFinite(item.textStart) ? item.textStart : (item.timingIndex || 0) + 1;
    const oldCount = Number.isFinite(item.textLineCount) ? item.textLineCount : Math.max(0, block.length - textStart);
    const replacement = cleanSrtCueText(targetText(segment)).split("\n").filter((line) => line.trim());
    block.splice(textStart, oldCount, ...replacement);
  });
  let outputBlocks = blocks.flatMap((block, index) => removedBlocks.has(index) ? [] : replacements.get(index) || [block]);
  if (segments.some((segment) => segment.subtitle)) {
    const cueLine = (block) => /^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block[0]) ? null : block.find((line) => subtitleTimingPattern(_format).test(line));
    const sorted = outputBlocks.filter((block) => cueLine(block)).sort((a, b) => subtitleStartTime(cueLine(a)) - subtitleStartTime(cueLine(b)));
    let index = 0;
    outputBlocks = outputBlocks.map((block) => cueLine(block) ? sorted[index++] : block);
  }
  const output = outputBlocks.map((block) => block.join("\n")).join("\n\n");
  return structure?.sourceEndedWithNewline ? `${output}\n` : output;
}

function openXmlKindForEntries(entries) {
  if (entries.has("word/document.xml")) return "word";
  if (entries.has("xl/workbook.xml") || entries.has("xl/sharedStrings.xml")) return "spreadsheet";
  if (entries.has("ppt/presentation.xml")) return "presentation";
  return "";
}

function openXmlTextPaths(entries, kind) {
  const paths = Array.from(entries.keys());
  if (kind === "word") {
    return paths.filter((path) => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(path)).sort();
  }
  if (kind === "spreadsheet") {
    const workbook = entries.has("xl/_rels/workbook.xml.rels") ? excelWorkbook(entries) : null;
    return workbook
      ? [...(entries.has(workbook.sharedStringsPath) ? [workbook.sharedStringsPath] : []), ...workbook.sheets.map((sheet) => sheet.path)]
      : paths.filter((path) => path === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/i.test(path)).sort();
  }
  if (kind === "presentation") {
    return paths.filter((path) => /^ppt\/(?:slides\/slide|notesSlides\/notesSlide)\d+\.xml$/i.test(path)).sort();
  }
  return [];
}

function xmlTextNodesByLocalName(container, name = "t") {
  return Array.from(container.getElementsByTagNameNS("*", name)).filter((node) => localNameLower(node) === name);
}

function xmlTextValue(container, name = "t") {
  return xmlTextNodesByLocalName(container, name).map((node) => node.textContent || "").join("");
}

const OPENXML_PROPERTIES = new Set(["ppr", "rpr", "endpararpr", "phoneticpr", "rph"]);

function openXmlTextModel(container, kind) {
  const spreadsheet = kind === "spreadsheet";
  const leaves = localNameLower(container) === "v" ? [container] : xmlTextNodesByLocalName(container).filter((node) => {
    for (let parent = node.parentElement; parent && parent !== container; parent = parent.parentElement) {
      if (["rph", "fld", "fldsimple", "del"].includes(localNameLower(parent))) return false;
      if (localNameLower(parent) === "p") return false;
    }
    return true;
  });
  const leafSet = new Set(leaves);
  const decode = (value) => spreadsheet ? decodeExcelText(value) : value;
  const plain = leaves.map((node) => decode(node.textContent || "")).join("");
  const records = new Map();
  const hasLeaf = (node) => leaves.some((leaf) => node === leaf || node.contains(leaf));
  const children = (node) => Array.from(node.children).filter((child) => !OPENXML_PROPERTIES.has(localNameLower(child)));
  const collapsible = (node) => {
    if (leafSet.has(node)) return true;
    const flow = children(node);
    return flow.length === 1 && hasLeaf(flow[0]) && collapsible(flow[0]);
  };
  const record = (node, parent) => {
    const id = `o${records.size + 1}`;
    const item = { id, node, parent, type: "opaque", children: [], leaf: null, group: 0 };
    records.set(id, item);
    if (hasLeaf(node)) {
      item.type = collapsible(node) ? "text" : "branch";
      if (item.type === "text") item.leaf = leaves.find((leaf) => node === leaf || node.contains(leaf));
      else {
        let group = 0;
        item.children = children(node).map((child) => {
          const childItem = record(child, id); childItem.group = group;
          if (childItem.type === "opaque") group += 1;
          return childItem;
        });
      }
    }
    return item;
  };
  const root = record(container, "");
  const encode = (item) => item.type === "opaque" ? `<x id="${item.id}"/>` :
    `<g id="${item.id}">${item.type === "text" ? escapeXml(decode(item.leaf.textContent || "")) : item.children.map(encode).join("")}</g>`;
  // Identical unstyled spreadsheet runs have no distinct formatting to map.
  const simpleSpreadsheetRuns = spreadsheet && leaves.length > 1 && children(container).every((child) =>
    localNameLower(child) === "r" && !child.attributes.length && Array.from(child.children).every((part) => localNameLower(part) === "t"));
  const rich = root.type === "branch" && !simpleSpreadsheetRuns;
  const value = rich ? root.children.map(encode).join("") : plain;
  return { container, kind, leaves, plain, rich, value, root, records };
}

function openXmlSetLeafText(node, value, kind) {
  node.textContent = kind === "spreadsheet" ? encodeExcelText(value) : value;
  if (localNameLower(node) !== "v") node.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
}

function applyOpenXmlTextModel(model, value, allowRich = true) {
  const text = String(value || "");
  if (text === model.value || (!allowRich && text === model.plain)) return false;
  if (!model.rich) {
    if (!model.leaves.length) throw new Error("OpenXML text leaf mapping is missing.");
    openXmlSetLeafText(model.leaves[0], text, model.kind);
    model.leaves.slice(1).forEach((node) => openXmlSetLeafText(node, "", model.kind));
  } else {
    if (!allowRich && text) throw new Error("This saved Office segment predates formatting-preserving import. Reimport the original file before changing its rich text.");
    if (!text) model.leaves.forEach((node) => openXmlSetLeafText(node, "", model.kind));
    else {
      const markup = `<root>${text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, "&amp;")}</root>`;
      const target = parseXmlDocument(markup, "Office formatting tags").documentElement;
      const seen = new Set();
      const rebuildChildren = (original, translated, destination) => {
        let group = 0;
        const nodes = [];
        for (const child of translated.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && !child.nodeValue) continue;
          if (child.nodeType !== Node.ELEMENT_NODE || !["g", "x"].includes(child.localName) || child.attributes.length !== 1) throw new Error("Keep translated Office text inside its original formatting tags.");
          const item = model.records.get(child.getAttribute("id"));
          if (!item || item.parent !== original.id || seen.has(item.id) || item.group !== group || child.localName !== (item.type === "opaque" ? "x" : "g")) throw new Error("Office formatting tags are missing, duplicated, moved across a structural boundary or invalid.");
          seen.add(item.id);
          const node = item.node.cloneNode(true);
          if (item.type === "opaque") {
            if (child.childNodes.length) throw new Error("Office control tags cannot contain translated text.");
            group += 1;
          } else if (item.type === "text") {
            if (child.children.length) throw new Error("Office text tags cannot contain additional markup.");
            const leaf = localNameLower(node) === "t" || localNameLower(node) === "v" ? node : xmlTextNodesByLocalName(node)[0];
            openXmlSetLeafText(leaf, child.textContent, model.kind);
          } else rebuildChildren(item, child, node);
          nodes.push(node);
        }
        if (nodes.length !== original.children.length) throw new Error("Keep every original Office formatting and control tag when translating.");
        for (const child of Array.from(destination.childNodes)) {
          if (child.nodeType !== Node.ELEMENT_NODE || !OPENXML_PROPERTIES.has(localNameLower(child))) child.remove();
        }
        const end = Array.from(destination.children).find((child) => localNameLower(child) === "endpararpr");
        for (const node of nodes) destination.insertBefore(node, end || null);
      };
      rebuildChildren(model.root, target, model.container);
    }
  }
  if (model.kind === "spreadsheet") excelChildren(model.container, "rPh").forEach((node) => node.remove());
  return true;
}

function collectOpenXmlItemsForPath(doc, path, kind) {
  let containers = [];
  if (kind === "spreadsheet" && localNameLower(doc.documentElement) === "sst") {
    containers = Array.from(doc.getElementsByTagNameNS("*", "si")).filter((node) => localNameLower(node) === "si");
  } else if (kind === "spreadsheet") {
    // Preserve existing inline-string indexes in saved projects. Static string
    // value cells are newly supported and are appended after those mappings.
    containers = Array.from(doc.getElementsByTagNameNS("*", "is"));
    containers.push(...Array.from(doc.getElementsByTagNameNS("*", "c")).flatMap((cell) =>
      cell.getAttribute("t") === "str" && !excelChildren(cell, "f").length ? excelChildren(cell, "v") : []));
  } else {
    containers = Array.from(doc.getElementsByTagNameNS("*", "p")).filter((node) => localNameLower(node) === "p");
  }
  return containers
    .map((container, itemIndex) => ({
      container,
      itemIndex,
      value: kind === "spreadsheet"
        ? (localNameLower(container) === "v" ? decodeExcelText(container.textContent || "") : excelStringValue(container))
        : xmlTextValue(container),
      key: `${path}#${itemIndex + 1}`
    }))
    .filter((item) => hasMeaningfulText(item.value));
}

const EXCEL_TYPES = new Set(["xlsx", "xlsm", "xltx", "xltm"]);
const EXCEL_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function excelColumnNumber(value) {
  const letters = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(letters)) return 0;
  const number = [...letters].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
  return number <= 16384 ? number : 0;
}

function excelColumnLetter(number) {
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + number % 26) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

function excelCellAddress(value) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(String(value || "").toUpperCase());
  if (!match || !excelColumnNumber(match[1]) || Number(match[2]) > 1048576) return null;
  return { reference: match[0], column: match[1], columnNumber: excelColumnNumber(match[1]), rowNumber: Number(match[2]) };
}

function excelChildren(element, name) {
  return Array.from(element?.children || []).filter((child) => localNameLower(child) === name.toLowerCase());
}

function decodeExcelText(value) {
  return String(value || "").replace(/_x([0-9a-f]{4})_/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function encodeExcelText(value) {
  return String(value).replace(/_x[0-9a-f]{4}_/gi, (code) => `_x005F_${code.slice(1)}`)
    .replace(/[\x00-\x08\x0b-\x0d\x0e-\x1f]/g, (character) => `_x${character.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}_`);
}

function excelStringValue(element) {
  // Phonetic annotations also contain <t> elements, but are not the cell's text.
  return decodeExcelText(excelChildren(element, "t").map((node) => node.textContent || "").join("") ||
    excelChildren(element, "r").map((run) => excelChildren(run, "t").map((node) => node.textContent || "").join("")).join(""));
}

function excelCellValue(cell, sharedStrings) {
  if (!cell) return { text: "", translatable: true };
  const type = cell.getAttribute("t") || "";
  const raw = excelChildren(cell, "v")[0]?.textContent || "";
  if (excelChildren(cell, "f").length) return { text: `=${excelChildren(cell, "f")[0].textContent || ""}`, translatable: false };
  if (type === "s") {
    if (!/^\d+$/.test(raw.trim()) || Number(raw) >= sharedStrings.length) throw new Error("Excel cell has an invalid shared-string reference.");
    return { text: sharedStrings[Number(raw)], translatable: true };
  }
  if (type === "inlineStr") return { text: excelStringValue(excelChildren(cell, "is")[0]), translatable: true };
  if (type === "str") return { text: decodeExcelText(raw), translatable: true };
  return { text: raw, translatable: !raw };
}

function excelRelationshipPath(target) {
  const parts = String(target || "").startsWith("/") ? [] : ["xl"];
  for (const part of String(target || "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("Excel worksheet relationship escapes the package.");
      parts.pop();
    } else parts.push(part);
  }
  return safeArchiveEntryName(parts.join("/"));
}

function excelWorkbook(entries) {
  if (!entries.has("xl/workbook.xml") || !entries.has("xl/_rels/workbook.xml.rels")) {
    throw new Error("Excel workbook or worksheet relationships are missing.");
  }
  const workbook = parseXmlDocument(readPackageText(entries, "xl/workbook.xml"), "Excel workbook");
  const relationships = parseXmlDocument(readPackageText(entries, "xl/_rels/workbook.xml.rels"), "Excel workbook relationships");
  const relations = Array.from(relationships.getElementsByTagNameNS("*", "Relationship"));
  const byId = new Map(relations
    .filter((relation) => relation.getAttribute("TargetMode") !== "External" && /\/worksheet$/.test(relation.getAttribute("Type") || ""))
    .map((relation) => [relation.getAttribute("Id"), excelRelationshipPath(relation.getAttribute("Target"))]));
  const sharedStringsRelation = relations.find((relation) => relation.getAttribute("TargetMode") !== "External" && /\/sharedStrings$/.test(relation.getAttribute("Type") || ""));
  const sharedStringsPath = sharedStringsRelation ? excelRelationshipPath(sharedStringsRelation.getAttribute("Target")) : "xl/sharedStrings.xml";
  const sharedStringNodes = entries.has(sharedStringsPath)
    ? Array.from(parseXmlDocument(readPackageText(entries, sharedStringsPath), "Excel shared strings")
      .getElementsByTagNameNS("*", "si"))
    : [];
  const sharedStrings = sharedStringNodes.map(excelStringValue);
  const sheets = Array.from(workbook.getElementsByTagNameNS("*", "sheet")).flatMap((sheet) => {
    const relationshipId = Array.from(sheet.attributes).find((attribute) => attribute.localName === "id")?.value;
    const path = byId.get(relationshipId);
    if (!path) return [];
    if (!entries.has(path)) throw new Error(`Excel worksheet ${sheet.getAttribute("name")} is missing.`);
    return [{ name: sheet.getAttribute("name") || path, path, hidden: sheet.getAttribute("state") === "hidden" || sheet.getAttribute("state") === "veryHidden" }];
  });
  if (!sheets.length) throw new Error("No Excel worksheets were found.");
  return { sheets, sharedStrings, sharedStringsPath, sharedStringNodes };
}

function excelCellStringNode(cell, workbook) {
  if (!cell) return null;
  if (cell.getAttribute("t") === "s") return workbook.sharedStringNodes[Number(excelChildren(cell, "v")[0]?.textContent)];
  return excelChildren(cell, "is")[0] || null;
}

function excelInlineFromTemplate(xml, template) {
  const inline = xml.createElementNS(xml.documentElement.namespaceURI || EXCEL_NAMESPACE, "is");
  if (template) {
    for (const attr of template.attributes) if (!attr.name.startsWith("xmlns")) inline.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
    for (const child of template.childNodes) inline.append(xml.importNode(child, true));
  } else inline.append(xml.createElementNS(xml.documentElement.namespaceURI || EXCEL_NAMESPACE, "t"));
  return inline;
}

function excelSheetRows(xml) {
  const data = xml.getElementsByTagNameNS("*", "sheetData")[0];
  if (!data) throw new Error("Excel worksheet data is missing.");
  let previousRow = 0;
  return excelChildren(data, "row").map((row) => {
    const rowNumber = Number(row.getAttribute("r") || previousRow + 1);
    if (!Number.isInteger(rowNumber) || rowNumber <= previousRow || rowNumber > 1048576) throw new Error("Excel worksheet row references are invalid.");
    previousRow = rowNumber;
    const cells = new Map();
    let previousColumn = 0;
    for (const cell of excelChildren(row, "c")) {
      const address = excelCellAddress(cell.getAttribute("r") || `${excelColumnLetter(previousColumn + 1)}${rowNumber}`);
      if (!address || address.rowNumber !== rowNumber || cells.has(address.column)) throw new Error("Excel worksheet cell references are invalid.");
      previousColumn = address.columnNumber;
      cells.set(address.column, cell);
    }
    return { row, rowNumber, cells };
  });
}

function excelMergedRanges(xml) {
  return Array.from(xml.getElementsByTagNameNS("*", "mergeCell")).map((element) => {
    const [start, end] = (element.getAttribute("ref") || "").split(":").map(excelCellAddress);
    if (!start || !end) throw new Error("Excel merged-cell range is invalid.");
    return { start, end };
  });
}

function excelCellIsMerged(ranges, column, rowNumber) {
  return ranges.some(({ start, end }) => rowNumber >= start.rowNumber && rowNumber <= end.rowNumber &&
    column >= start.columnNumber && column <= end.columnNumber);
}

async function inspectMultilingualExcel(file) {
  if (!EXCEL_TYPES.has(file.name.split(".").pop().toLowerCase())) throw new Error("Choose an Excel .xlsx, .xlsm, .xltx or .xltm workbook.");
  const entries = await unzipPackageEntries(new Uint8Array(await file.arrayBuffer()));
  const workbook = excelWorkbook(entries);
  return { sheets: workbook.sheets.map((sheet) => {
    const xml = parseXmlDocument(readPackageText(entries, sheet.path), `Excel worksheet ${sheet.name}`);
    const rows = excelSheetRows(xml);
    let lastColumn = 26;
    rows.forEach(({ cells }) => cells.forEach((_, letter) => { lastColumn = Math.max(lastColumn, excelColumnNumber(letter)); }));
    const previewRows = rows.slice(0, 8).map(({ rowNumber, cells }) => ({
      rowNumber,
      cells: Object.fromEntries(Array.from(cells, ([letter, cell]) => [letter, excelCellValue(cell, workbook.sharedStrings).text]))
    }));
    return { ...sheet, columns: Array.from({ length: lastColumn }, (_, index) => {
      const letter = excelColumnLetter(index + 1);
      return { letter, label: previewRows.find((row) => row.rowNumber === 1)?.cells[letter] || "" };
    }), previewRows };
  }) };
}

function normalizeExcelMapping(mapping, workbook) {
  const sourceColumn = String(mapping?.sourceColumn || "").trim().toUpperCase();
  const targetColumn = String(mapping?.targetColumn || "").trim().toUpperCase();
  if (!excelColumnNumber(sourceColumn) || !excelColumnNumber(targetColumn)) throw new Error("Choose source and target columns between A and XFD.");
  if (sourceColumn === targetColumn) throw new Error("Source and target must use different columns.");
  const sheet = workbook.sheets.find((item) => item.path === mapping.sheetPath);
  if (!sheet) throw new Error("Choose a worksheet from this Excel workbook.");
  return {
    sheetPath: sheet.path,
    sheetName: sheet.name,
    sourceColumn,
    targetColumn,
    firstRowIsHeader: mapping.firstRowIsHeader !== false,
    importExistingTargets: mapping.importExistingTargets !== false
  };
}

async function parseMultilingualExcelFile(file, mapping) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipPackageEntries(bytes);
  const workbook = excelWorkbook(entries);
  const settings = normalizeExcelMapping(mapping, workbook);
  const xml = parseXmlDocument(readPackageText(entries, settings.sheetPath), `Excel worksheet ${settings.sheetName}`);
  const rows = excelSheetRows(xml);
  const mergedRanges = excelMergedRanges(xml);
  const skippedRows = { emptySource: 0, nonTextSource: 0, nonTextTarget: 0, mergedCells: 0 };
  const segments = [];
  for (const { rowNumber, cells } of rows) {
    if (settings.firstRowIsHeader && rowNumber === 1) continue;
    if ([settings.sourceColumn, settings.targetColumn].some((letter) => excelCellIsMerged(mergedRanges, excelColumnNumber(letter), rowNumber))) {
      skippedRows.mergedCells += 1;
      continue;
    }
    const source = excelCellValue(cells.get(settings.sourceColumn), workbook.sharedStrings);
    const target = excelCellValue(cells.get(settings.targetColumn), workbook.sharedStrings);
    if (!source.translatable) { skippedRows.nonTextSource += 1; continue; }
    if (!source.text.trim()) { skippedRows.emptySource += 1; continue; }
    if (!target.translatable) { skippedRows.nonTextTarget += 1; continue; }
    const sourceCell = `${settings.sourceColumn}${rowNumber}`;
    const targetCell = `${settings.targetColumn}${rowNumber}`;
    const key = `${settings.sheetPath}#${sourceCell}`;
    const targetTemplate = excelCellStringNode(cells.get(settings.targetColumn), workbook);
    const sourceTemplate = excelCellStringNode(cells.get(settings.sourceColumn), workbook);
    const template = targetTemplate || sourceTemplate;
    const model = template ? openXmlTextModel(template, "spreadsheet") : null;
    const richSource = !targetTemplate && model?.rich;
    const text = richSource ? model.value : source.text;
    const existingTarget = settings.importExistingTargets ? (targetTemplate && model?.rich ? model.value : target.text) : "";
    const tags = detectTags(text);
    if (targetTemplate && model?.rich) tags.push(...detectTags(model.value).filter((tag) => tag.type === "tag"));
    segments.push({
      text,
      target: existingTarget,
      status: existingTarget.trim() ? "draft" : "empty",
      key,
      tags,
      structure: { format: "openxml", kind: "spreadsheet", path: settings.sheetPath, itemIndex: rowNumber - 1, sourceCell, targetCell, key,
        richTextVersion: 1, richTextTemplate: targetTemplate ? "target" : "source" }
    });
  }
  if (!segments.length) throw new Error("No text rows were found in the selected Excel columns. Check the worksheet, header and column choices. Blank sources, numbers, formulas and merged cells are skipped.");
  const extension = file.name.split(".").pop().toLowerCase();
  return {
    fileName: file.name,
    documentName: stripExt(file.name),
    documentType: extension,
    segments,
    structure: { format: "openxml", kind: "spreadsheet", extension, packageBase64: bytesToBase64(bytes),
      textPaths: [settings.sheetPath], multilingualExcel: { ...settings, skippedRows } }
  };
}

async function buildMultilingualExcelFile(segments, structure) {
  if (!structure?.packageBase64) throw new Error("Excel reconstruction package data is missing.");
  const entries = await unzipPackageEntries(base64ToBytes(structure.packageBase64));
  const workbook = excelWorkbook(entries);
  const settings = normalizeExcelMapping(structure.multilingualExcel, workbook);
  const xml = parseXmlDocument(readPackageText(entries, settings.sheetPath), `Excel worksheet ${settings.sheetName}`);
  const rows = excelSheetRows(xml);
  const byRow = new Map(rows.map((row) => [row.rowNumber, row]));
  const mergedRanges = excelMergedRanges(xml);
  const visited = new Set();
  let changed = false;
  for (const segment of segments) {
    const sourceAddress = excelCellAddress(segment.structure?.sourceCell);
    const targetAddress = excelCellAddress(segment.structure?.targetCell);
    if (segment.structure?.path !== settings.sheetPath || !sourceAddress || !targetAddress ||
        sourceAddress.column !== settings.sourceColumn || targetAddress.column !== settings.targetColumn ||
        sourceAddress.rowNumber !== targetAddress.rowNumber || visited.has(targetAddress.reference)) {
      throw new Error("Excel source or target cell mapping is missing, duplicated or inconsistent.");
    }
    visited.add(targetAddress.reference);
    const record = byRow.get(targetAddress.rowNumber);
    if (!record || (settings.firstRowIsHeader && record.rowNumber === 1)) throw new Error("Excel mapped row is missing or refers to the header.");
    if ([sourceAddress, targetAddress].some((address) => excelCellIsMerged(mergedRanges, address.columnNumber, address.rowNumber))) throw new Error("Excel mapped cells cannot be merged.");
    const sourceValue = excelCellValue(record.cells.get(settings.sourceColumn), workbook.sharedStrings);
    let targetCell = record.cells.get(settings.targetColumn);
    const targetValue = excelCellValue(targetCell, workbook.sharedStrings);
    if (!sourceValue.translatable || !sourceValue.text.trim() || !targetValue.translatable) throw new Error("Excel mapped row contains a blank source, number or formula.");
    const translated = targetText(segment);
    const template = segment.structure.richTextTemplate === "source"
      ? excelCellStringNode(record.cells.get(settings.sourceColumn), workbook)
      : excelCellStringNode(targetCell, workbook);
    const inline = excelInlineFromTemplate(xml, template);
    const model = openXmlTextModel(inline, "spreadsheet");
    if (targetValue.text === translated || (segment.structure.richTextTemplate === "target" && translated === model.value)) continue;
    applyOpenXmlTextModel(model, translated, segment.structure.richTextVersion === 1);
    if (excelStringValue(inline).length > 32767) throw new Error(`Excel target cell ${targetAddress.reference} exceeds the 32,767-character cell limit.`);
    if (!targetCell) {
      targetCell = xml.createElementNS(xml.documentElement.namespaceURI || EXCEL_NAMESPACE, "c");
      targetCell.setAttribute("r", targetAddress.reference);
      const nextCell = Array.from(record.cells).find(([letter]) => excelColumnNumber(letter) > targetAddress.columnNumber)?.[1];
      for (const [letter, cell] of record.cells) if (!cell.hasAttribute("r")) cell.setAttribute("r", `${letter}${record.rowNumber}`);
      record.row.insertBefore(targetCell, nextCell || excelChildren(record.row, "extLst")[0] || null);
      record.cells.set(settings.targetColumn, targetCell);
      // Row spans are optional optimization hints and must not exclude a newly added target column.
      record.row.removeAttribute("spans");
    }
    targetCell.setAttribute("t", "inlineStr");
    for (const child of [...excelChildren(targetCell, "v"), ...excelChildren(targetCell, "is")]) child.remove();
    targetCell.insertBefore(inline, excelChildren(targetCell, "extLst")[0] || null);
    changed = true;
  }
  if (!changed) return base64ToBytes(structure.packageBase64);
  const dimension = xml.getElementsByTagNameNS("*", "dimension")[0];
  if (dimension) {
    let minColumn = 16384, maxColumn = 1, minRow = 1048576, maxRow = 1;
    for (const { rowNumber, cells } of rows) for (const letter of cells.keys()) {
      minColumn = Math.min(minColumn, excelColumnNumber(letter)); maxColumn = Math.max(maxColumn, excelColumnNumber(letter));
      minRow = Math.min(minRow, rowNumber); maxRow = Math.max(maxRow, rowNumber);
    }
    for (const reference of (dimension.getAttribute("ref") || "").split(":")) {
      const address = excelCellAddress(reference);
      if (address) { minColumn = Math.min(minColumn, address.columnNumber); maxColumn = Math.max(maxColumn, address.columnNumber); minRow = Math.min(minRow, address.rowNumber); maxRow = Math.max(maxRow, address.rowNumber); }
    }
    dimension.setAttribute("ref", `${excelColumnLetter(minColumn)}${minRow}:${excelColumnLetter(maxColumn)}${maxRow}`);
  }
  entries.set(settings.sheetPath, { name: settings.sheetPath, data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml)) });
  return zipPackageEntries(entries);
}

async function parseOpenXmlPackageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipPackageEntries(bytes);
  const kind = openXmlKindForEntries(entries);
  if (!kind) throw new Error("OpenXML package type was not recognized.");
  const extension = file.name.split(".").pop().toLowerCase();
  const expectedKind = EXCEL_TYPES.has(extension) ? "spreadsheet" : ["docm", "dotx", "dotm"].includes(extension) ? "word" : "presentation";
  if (kind !== expectedKind) throw new Error("OpenXML package contents do not match the file extension.");
  const textPaths = openXmlTextPaths(entries, kind);
  const segments = [];
  textPaths.forEach((path) => {
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenXML part ${path}`);
    collectOpenXmlItemsForPath(xml, path, kind).forEach((item) => {
      const itemIndex = item.itemIndex;
      const model = openXmlTextModel(item.container, kind);
      if (!hasMeaningfulText(model.plain)) return;
      segments.push({
        text: model.value,
        key: item.key,
        tags: detectTags(model.value),
        structure: {
          format: "openxml",
          kind,
          path,
          itemIndex,
          key: item.key,
          richTextVersion: 1
        }
      });
    });
  });
  if (!segments.length) throw new Error("No translatable OpenXML text was found.");
  const ext = file.name.split(".").pop().toLowerCase();
  return {
    fileName: file.name,
    documentName: stripExt(file.name),
    documentType: ext,
    segments,
    structure: {
      format: "openxml",
      kind,
      extension: ext,
      packageBase64: bytesToBase64(bytes),
      textPaths
    }
  };
}

async function buildOpenXmlPackageFile(segments, structure = null) {
  if (!structure?.packageBase64) throw new Error("OpenXML reconstruction package data is missing.");
  const entries = await unzipPackageEntries(base64ToBytes(structure.packageBase64));
  const kind = structure.kind || openXmlKindForEntries(entries);
  const validPaths = new Set(openXmlTextPaths(entries, kind));
  const byPath = new Map();
  let changed = false;
  segments.forEach((segment) => {
    const path = segment.structure?.path;
    if (!validPaths.has(path)) throw new Error("OpenXML text part mapping is missing or invalid.");
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(segment);
  });
  for (const [path, pathSegments] of byPath.entries()) {
    if (!entries.has(path)) continue;
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenXML part ${path}`);
    const items = collectOpenXmlItemsForPath(xml, path, kind);
    const visited = new Set();
    let partChanged = false;
    const depth = (segment) => {
      let node = items.find((item) => item.itemIndex === segment.structure?.itemIndex)?.container, level = 0;
      while (node?.parentElement) { level += 1; node = node.parentElement; }
      return level;
    };
    // A containing paragraph can clone an opaque drawing/textbox. Translate
    // nested paragraphs first so their current content travels with that clone.
    [...pathSegments].sort((left, right) => depth(right) - depth(left)).forEach((segment) => {
      const itemIndex = segment.structure?.itemIndex;
      const item = items.find((candidate) => candidate.itemIndex === itemIndex);
      if (!Number.isInteger(itemIndex) || !item || visited.has(itemIndex)) throw new Error("OpenXML text mapping is missing, invalid or duplicated.");
      visited.add(itemIndex);
      const translated = targetText(segment);
      if (segment.structure.richTextVersion !== 1 && translated === item.value) return;
      const model = openXmlTextModel(item.container, kind);
      const changedItem = applyOpenXmlTextModel(model, translated, segment.structure.richTextVersion === 1);
      if (kind === "spreadsheet" && openXmlTextModel(item.container, kind).plain.length > 32767) throw new Error("Excel text exceeds the 32,767-character cell limit.");
      partChanged ||= changedItem;
    });
    if (partChanged) entries.set(path, { name: path, data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml)) });
    changed ||= partChanged;
  }
  return changed ? zipPackageEntries(entries) : base64ToBytes(structure.packageBase64);
}

function openDocumentTextPaths(entries) {
  return ["content.xml", "styles.xml"].filter((path) => entries.has(path));
}

function collectOpenDocumentItemsForPath(doc, path) {
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => ["p", "h"].includes(localNameLower(element)) && !elementOptedOut(element))
    .map((element, itemIndex) => ({
      element,
      itemIndex,
      value: serializedXmlChildren(element),
      key: `${path}#${itemIndex + 1}`
    }))
    .filter((item) => hasMeaningfulText(item.value));
}

async function parseOpenDocumentPackageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipPackageEntries(bytes);
  if (!entries.has("content.xml")) throw new Error("OpenDocument package is missing content.xml.");
  const textPaths = openDocumentTextPaths(entries);
  const segments = [];
  textPaths.forEach((path) => {
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenDocument part ${path}`);
    collectOpenDocumentItemsForPath(xml, path).forEach((item) => {
      segments.push({
        text: item.value,
        key: item.key,
        tags: detectTags(item.value),
        structure: {
          format: "opendocument",
          path,
          itemIndex: item.itemIndex,
          key: item.key
        }
      });
    });
  });
  if (!segments.length) throw new Error("No translatable OpenDocument text was found.");
  const ext = file.name.split(".").pop().toLowerCase();
  return {
    fileName: file.name,
    documentName: stripExt(file.name),
    documentType: ext,
    segments,
    structure: {
      format: "opendocument",
      extension: ext,
      packageBase64: bytesToBase64(bytes),
      textPaths
    }
  };
}

async function buildOpenDocumentPackageFile(segments, structure = null) {
  if (!structure?.packageBase64) throw new Error("OpenDocument reconstruction package data is missing.");
  const entries = await unzipPackageEntries(base64ToBytes(structure.packageBase64));
  const byPath = new Map();
  segments.forEach((segment) => {
    const path = segment.structure?.path;
    if (!path) return;
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(segment);
  });
  for (const [path, pathSegments] of byPath.entries()) {
    if (!entries.has(path)) continue;
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenDocument part ${path}`);
    const items = collectOpenDocumentItemsForPath(xml, path);
    pathSegments.forEach((segment) => {
      const itemIndex = segment.structure?.itemIndex;
      const item = items.find((candidate) => candidate.itemIndex === itemIndex);
      if (!Number.isFinite(itemIndex) || !item) return;
      replaceXmlChildren(xml, item.element, targetText(segment));
    });
    entries.set(path, { name: path, data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml)) });
  }
  return zipPackageEntries(entries);
}

function parseIcmlText(text, fileName = "file.icml") {
  const doc = parseXmlDocument(text, "ICML XML");
  const contents = idmlContentElements(doc);
  const segments = contents.flatMap((element, contentIndex) => idmlTextPieces(element).flatMap(({ value, textNodeIndex }) => {
    if (!value.trim()) return [];
    return [{
      text: value,
      key: `icml-content-${contentIndex + 1}${textNodeIndex === undefined ? "" : `-text-${textNodeIndex}`}`,
      tags: detectTags(value).filter((tag) => tag.type !== "tag"),
      structure: { format: "icml", contentIndex, idmlVersion: 2, ...(textNodeIndex === undefined ? {} : { textNodeIndex }) }
    }];
  }));
  if (!segments.length) throw new Error("No translatable ICML content was found.");
  return {
    fileName,
    documentName: stripExt(fileName),
    documentType: "icml",
    segments,
    structure: { format: "icml", source: text, idmlVersion: 2 }
  };
}

function buildIcmlText(segments, structure = null) {
  if (!structure?.source) throw new Error("ICML reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "ICML XML");
  const contents = idmlContentElements(doc);
  const occupied = new Set();
  let changed = false;
  segments.forEach((segment) => {
    const contentIndex = segment.structure?.contentIndex;
    const nodeIndex = segment.structure?.textNodeIndex;
    if (!Number.isInteger(contentIndex) || contentIndex < 0 || !contents[contentIndex]) throw new Error("ICML Content mapping is invalid. Reimport the original file.");
    const key = `${contentIndex}:${nodeIndex === undefined ? "all" : nodeIndex}`;
    if (occupied.has(key) || occupied.has(`${contentIndex}:all`) || (nodeIndex === undefined && [...occupied].some((value) => value.startsWith(`${contentIndex}:`)))) throw new Error("ICML contains duplicate or overlapping Content mappings.");
    occupied.add(key);
    changed = setIdmlLiteralText(contents[contentIndex], targetText(segment), nodeIndex) || changed;
  });
  return changed ? new XMLSerializer().serializeToString(doc) : structure.source;
}

async function parseLocalizationFile(file, options = {}) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "idml") return parseIdmlFile(file);
  if (EXCEL_TYPES.has(ext) && options.multilingualExcel) return parseMultilingualExcelFile(file, options.multilingualExcel);
  if (OPENXML_TYPES.has(ext)) return parseOpenXmlPackageFile(file);
  if (OPENDOCUMENT_TYPES.has(ext)) return parseOpenDocumentPackageFile(file);
  const decoded = await decodeLocalizationTextFile(file, options);
  const text = decoded.text;
  if (ext === "icml") {
    const parsed = parseIcmlText(text, file.name);
    parsed.structure = withSourceEncoding(parsed.structure, decoded);
    return parsed;
  }
  let segments;
  let structure = null;
  if (ext === "tmx") {
    const tmx = parseTmxDocument(text, options);
    segments = tmx.segments;
    structure = tmx.structure;
  }
  else if (ext === "po" || ext === "pot") {
    const po = parsePo(text);
    segments = po.segments;
    structure = po.structure;
  }
  else if (ext === "srt") {
    segments = parseSrt(text);
    structure = { format: "srt", source: text.replace(/\r/g, "") };
  }
  else if (ext === "vtt" || ext === "sbv") {
    const subtitle = parseSubtitleText(text, ext);
    segments = subtitle.segments;
    structure = subtitle.structure;
  }
  else if (ext === "json") {
    const json = parseJson(text);
    segments = json.segments;
    structure = json.structure;
  }
  else if (ext === "yml" || ext === "yaml") {
    segments = parseYaml(text);
    structure = { format: "yaml", sourceLines: text.replace(/\r/g, "").split("\n") };
  }
  else if (ext === "html" || ext === "htm") {
    const html = parseHtml(text);
    segments = html.segments;
    structure = html.structure;
  }
  else if (GENERIC_XML_TYPES.has(ext)) {
    const genericXml = parseGenericXmlText(text, ext, `${ext.toUpperCase()} XML`);
    segments = genericXml.segments;
    structure = genericXml.structure;
  }
  else if (BILINGUAL_XML_TYPES.has(ext)) {
    const bilingualXml = parseBilingualXmlText(text, ext);
    segments = bilingualXml.segments;
    structure = bilingualXml.structure;
  }
  else if (ext === "md" || ext === "markdown") {
    const markdown = parseMarkdown(text);
    segments = markdown.segments;
    structure = markdown.structure;
  }
  else if (ext === "csv" || ext === "tsv") {
    const delimited = parseDelimitedLocalization(text, file.name, ext);
    segments = delimited.segments;
    structure = delimited.structure;
  }
  else if (ext === "xml") {
    const doc = parseXmlDocument(text, "XML");
    if (localNameLower(doc.documentElement) === "resources") {
      const android = parseAndroidXml(text);
      segments = android.segments;
      structure = android.structure;
    } else {
      const genericXml = parseGenericXmlText(text, "xml", "XML");
      segments = genericXml.segments;
      structure = genericXml.structure;
    }
  }
  else if (ext === "strings") {
    const apple = parseAppleStrings(text);
    segments = apple.segments;
    structure = apple.structure;
  }
  else if (ext === "txt") {
    const plainText = parsePlainText(text, ext);
    segments = plainText.segments;
    structure = plainText.structure;
  }
  else if (ext === "properties") {
    const properties = parsePropertiesText(text);
    segments = properties.segments;
    structure = properties.structure;
  }
  else if (ext === "php") {
    const codeStrings = parseCodeStringText(text, ext);
    segments = codeStrings.segments;
    structure = codeStrings.structure;
  }
  else if (ext === "ts") {
    if (/^\s*(?:<\?xml\b|<!DOCTYPE\s+TS\b|<TS\b)/i.test(text)) {
      const tsXml = parseTsXmlText(text);
      segments = tsXml.segments;
      structure = tsXml.structure;
    } else {
      const codeStrings = parseCodeStringText(text, ext);
      segments = codeStrings.segments;
      structure = codeStrings.structure;
    }
  }
  else if (ext === "resx") {
    const resx = parseResxText(text);
    segments = resx.segments;
    structure = resx.structure;
  }
  else if (ext === "dtd") {
    const quoted = parseQuotedText(text, ext);
    segments = quoted.segments;
    structure = quoted.structure;
  }
  else if (ext === "mif") {
    const mif = parseMifText(text);
    segments = mif.segments;
    structure = mif.structure;
  } else throw new Error(`Unsupported localization format: .${ext}`);
  segments = segments.map((segment) => ({
    ...segment,
    tags: segment.tags || detectTags(segment.text, segment.structure)
  }));
  structure = withSourceEncoding(structure, decoded);
  return {
    fileName: file.name,
    documentName: stripExt(file.name),
    documentType: ext,
    segments,
    structure
  };
}

function buildLocalizationFile(format, segments, structure = null) {
  const normalizedFormat = normalizedLocalizationFormat(format);
  const segmentList = localizationSegmentArray(segments);
  assertLocalizationReconstruction(normalizedFormat, segmentList, structure);
  let output;
  if (normalizedFormat === "tmx") output = buildTmxDocument(segmentList, structure);
  else if (normalizedFormat === "po" || normalizedFormat === "pot") output = buildPo(segmentList, structure);
  else if (normalizedFormat === "srt") output = buildSrt(segmentList, structure);
  else if (normalizedFormat === "vtt" || normalizedFormat === "sbv") output = buildSubtitleText(segmentList, structure, normalizedFormat);
  else if (normalizedFormat === "json") output = buildJson(segmentList, structure);
  else if (normalizedFormat === "yaml" || normalizedFormat === "yml") output = buildYaml(segmentList, structure);
  else if (normalizedFormat === "html" || normalizedFormat === "htm") output = buildHtml(segmentList, structure);
  else if (GENERIC_XML_TYPES.has(normalizedFormat)) output = buildGenericXml(segmentList, structure);
  else if (BILINGUAL_XML_TYPES.has(normalizedFormat)) output = structure?.format === "generic-xml"
    ? buildGenericXml(segmentList, structure)
    : buildBilingualXml(segmentList, structure);
  else if (normalizedFormat === "md" || normalizedFormat === "markdown") output = buildMarkdown(segmentList, structure);
  else if (normalizedFormat === "csv") output = buildDelimitedLocalization(segmentList, structure, ",");
  else if (normalizedFormat === "tsv") output = buildDelimitedLocalization(segmentList, structure, "\t");
  else if (normalizedFormat === "xml") output = structure?.format === "generic-xml" ? buildGenericXml(segmentList, structure) : buildAndroidXml(segmentList, structure);
  else if (normalizedFormat === "strings") output = buildAppleStrings(segmentList, structure);
  else if (normalizedFormat === "txt") output = buildPlainText(segmentList, structure);
  else if (normalizedFormat === "properties") output = buildProperties(segmentList, structure);
  else if (normalizedFormat === "php") output = buildCodeStringText(segmentList, structure);
  else if (normalizedFormat === "ts") output = structure?.format === "ts-xml" ? buildTsXml(segmentList, structure) : buildCodeStringText(segmentList, structure);
  else if (normalizedFormat === "resx") output = buildResx(segmentList, structure);
  else if (normalizedFormat === "dtd") output = buildCodeStringText(segmentList, structure);
  else if (normalizedFormat === "mif") output = buildMifText(segmentList, structure);
  else if (normalizedFormat === "icml") output = buildIcmlText(segmentList, structure);
  else if (normalizedFormat === "idml") output = buildIdmlFile(segmentList, structure);
  else if (EXCEL_TYPES.has(normalizedFormat) && structure?.multilingualExcel) output = buildMultilingualExcelFile(segmentList, structure);
  else if (OPENXML_TYPES.has(normalizedFormat)) output = buildOpenXmlPackageFile(segmentList, structure);
  else if (OPENDOCUMENT_TYPES.has(normalizedFormat)) output = buildOpenDocumentPackageFile(segmentList, structure);
  else throw new Error(`Unsupported export format: ${normalizedFormat}`);
  return encodeLocalizationTextOutput(output, normalizedFormat, structure);
}

window.CatHan.localization = { parseLocalizationFile, buildLocalizationFile, inspectMultilingualExcel };
})();
