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
  if (typeof text !== "string" || !TEXT_ENCODING_PRESERVE_FORMATS.has(normalizedFormat) || !structure?.sourceEncoding?.canPreserve || !window.CatHan.encoding) return text;
  return window.CatHan.encoding.encodeText(text, structure.sourceEncoding, { allowFallback: true }).content;
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

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress package files locally. Try a recent Chromium, Edge, or Safari version.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipPackageEntries(arrayBufferOrBytes) {
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
    else if (compressionMethod === 8) data = await inflateRaw(compressed);
    else throw new Error(`Unsupported localization package compression method: ${compressionMethod}`);
    if (data.length !== uncompressedSize && uncompressedSize > 0) throw new Error(`Localization package entry ${name} has an unexpected decompressed size.`);
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

function detectTags(text) {
  return window.CatHan.docx?.detectProtectedTags ? window.CatHan.docx.detectProtectedTags(text) : [];
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
  return typeof value === "number" && Number.isFinite(value);
}

function segmentStructureFormat(segment) {
  return String(segment?.structure?.format || "").toLowerCase();
}

const LOCALIZATION_RECONSTRUCTION_REQUIREMENTS = {
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
    current = current || { startLine: index, msgstrs: {}, msgstrRanges: {} };
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
    if (line.startsWith("#")) return;
    if (line.startsWith("msgctxt ")) {
      setActiveValue("msgctxt", poFieldValue(line, "msgctxt"), index);
      return;
    }
    if (line.startsWith("msgid ")) {
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

const SRT_TIMING_PATTERN = /^\d{1,2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2},\d{3}(?:\s+.*)?$/;

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
  const segments = normalized
    ? normalized.split(/\n{2,}/).flatMap((block, blockIndex) => {
      const lines = block.split("\n").map((line) => line.trimEnd());
      while (lines.length && !lines[0].trim()) lines.shift();
      let cueIndex = "";
      if (/^\d+$/.test(lines[0]?.trim() || "")) cueIndex = lines.shift().trim();
      const timing = lines.shift()?.trim() || "";
      if (!SRT_TIMING_PATTERN.test(timing)) return [];
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

function buildSrt(segments, structure = null) {
  if (structure?.source) {
    const missingTiming = segments.filter((segment) => !String(segment.structure?.timing || "").trim()).length;
    if (missingTiming) throw new Error(`${missingTiming} SRT segment${missingTiming === 1 ? "" : "s"} missing cue timing data.`);
  }
  const content = segments
    .map((segment, index) => {
      const cueIndex = String(segment.structure?.cueIndex || index + 1).trim() || String(index + 1);
      const timing = String(segment.structure?.timing || "00:00:00,000 --> 00:00:01,000").trim();
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
  const nextContainer = (index) => (typeof path[index + 1] === "number" ? [] : {});
  const base = root && typeof root === "object" ? root : (typeof path[0] === "number" ? [] : {});
  let cursor = base;
  path.forEach((part, index) => {
    const last = index === path.length - 1;
    if (last) {
      cursor[part] = value;
      return;
    }
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = nextContainer(index);
    cursor = cursor[part];
  });
  return base;
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
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
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
      return clean.slice(1, -1);
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
  if (/^[+-]?\d+(?:\.\d+)?$/.test(clean)) return false;
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
    if (!trimmed || trimmed.startsWith("#")) continue;
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
    if (key && !value) {
      stack.push({ indent, key: path });
      continue;
    }
    const blockMarker = value.trim();
    if (key && /^[>|][+-]?$/.test(blockMarker)) {
      const blockIndent = indent + 2;
      const blockLines = [];
      let end = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim() && indentOf(lines[cursor]) <= indent) break;
        end = cursor;
        blockLines.push(lines[cursor].slice(Math.min(blockIndent, indentOf(lines[cursor]))));
      }
      const folded = blockMarker.startsWith(">");
      const blockText = folded ? blockLines.join(" ").replace(/\s+/g, " ").trim() : blockLines.join("\n").trimEnd();
      if (blockText.trim()) {
        segments.push({
          text: blockText,
          key: path,
          structure: { format: "yaml", key: path, lineStart: index, lineEnd: end, valuePrefix, blockStyle: blockMarker, blockIndent }
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
        const indent = " ".repeat(item.blockIndent || 2);
        const blockLines = String(value).split(/\r?\n/).map((line) => `${indent}${line}`);
        lines.splice(item.lineStart, item.lineEnd - item.lineStart + 1, `${item.valuePrefix}${item.blockStyle}`, ...blockLines);
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

function parseHtml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const elements = translatableHtmlElements(doc);
  return {
    structure: { format: "html", source: text },
    segments: elements.map((element, index) => {
      const value = cleanHtmlSegment(element.innerHTML);
      return {
        text: value,
        key: `html-block-${index + 1}`,
        tags: detectTags(value),
        structure: { format: "html", elementIndex: index, selector: element.tagName.toLowerCase() }
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
  const doc = parser.parseFromString(source, "text/html");
  const elements = translatableHtmlElements(doc);
  segments.forEach((segment) => {
    const elementIndex = segment.structure?.elementIndex;
    if (typeof elementIndex !== "number" || !elements[elementIndex]) return;
    const value = targetText(segment);
    elements[elementIndex].innerHTML = value;
  });
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function isTranslatableMarkdownText(value) {
  return /[^\d\s.,:;!?()[\]{}'"`~@#$%^&*_+=|\\/<>-]/u.test(String(value || ""));
}

function isMarkdownFence(line) {
  const match = String(line || "").match(/^\s*(`{3,}|~{3,})/);
  return match ? match[1][0] : "";
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
    if (fenceMarker) {
      fence = fence ? "" : fenceMarker;
      index += 1;
      continue;
    }
    if (fence || !line.trim()) {
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
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (xmlParseError(doc)) throw new Error(`${label} is not valid XML.`);
  return doc;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializedXmlChildren(element) {
  const serializer = new XMLSerializer();
  return Array.from(element.childNodes || []).map((node) => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || "";
    return serializer.serializeToString(node);
  }).join("").trim();
}

function translatableAndroidElements(doc) {
  const root = doc.documentElement;
  if (!root || root.localName !== "resources") throw new Error("Only Android resource XML files with a <resources> root are supported.");
  const items = [];
  Array.from(root.children || []).forEach((element) => {
    const tag = element.localName;
    const name = element.getAttribute("name") || "";
    if (element.getAttribute("translatable") === "false") return;
    if (tag === "string" && name) {
      items.push({ element, key: name, kind: "string" });
      return;
    }
    if ((tag === "string-array" || tag === "plurals") && name) {
      Array.from(element.children || []).forEach((child, index) => {
        if (child.localName !== "item" || child.getAttribute("translatable") === "false") return;
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
  while (element.firstChild) element.removeChild(element.firstChild);
  const text = String(value || "");
  const wrapped = new DOMParser().parseFromString(`<wrapper>${text}</wrapper>`, "application/xml");
  if (xmlParseError(wrapped)) {
    element.textContent = text;
    return;
  }
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
    if (!Number.isFinite(elementIndex) || !items[elementIndex]) return;
    replaceXmlChildren(doc, items[elementIndex].element, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

function unescapeAppleString(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
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
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const pattern = /^(\s*)"((?:\\.|[^"\\])*)"(\s*=\s*)"((?:\\.|[^"\\])*)"(\s*;\s*(?:(?:(?:\/\/).*)|(?:\/\*.*\*\/))?\s*)$/;
  const segments = [];
  lines.forEach((line, lineIndex) => {
    const match = line.match(pattern);
    if (!match) return;
    const key = unescapeAppleString(match[2]);
    const value = unescapeAppleString(match[4]);
    if (!value.trim()) return;
    segments.push({
      text: value,
      key,
      structure: {
        format: "apple-strings",
        key,
        lineIndex,
        prefix: match[1],
        rawKey: match[2],
        separator: match[3],
        suffix: match[5]
      }
    });
  });
  if (!segments.length) throw new Error("No translatable iOS strings were found.");
  return {
    structure: { format: "apple-strings", sourceLines: lines },
    segments
  };
}

function buildAppleStrings(segments, structure = null) {
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
  const style = String(range?.getAttribute("AppliedCharacterStyle") || range?.getAttribute("CharacterStyle") || "").toLowerCase();
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
  const wrapped = new DOMParser().parseFromString(`<wrapper>${text}</wrapper>`, "application/xml");
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
      const value = idmlStyledParagraphText(paragraph);
      if (!value.trim()) return;
      const rangeContents = idmlCharacterStyleRanges(paragraph)
        .map((range) => directChildElementsByName(range, "Content")[0])
        .filter(Boolean);
      if (rangeContents.length < 2) return;
      const contentIndexes = rangeContents
        .map((element) => contents.indexOf(element))
        .filter((index) => index >= 0);
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
          contentIndexes
        }
      });
    });
    contents.forEach((element, contentIndex) => {
      if (usedContentIndexes.has(contentIndex)) return;
      const value = serializedXmlChildren(element);
      if (!value.trim()) return;
      const key = `${path}#content-${contentIndex + 1}`;
      segments.push({
        text: value,
        key,
        tags: detectTags(value),
        structure: {
          format: "idml",
          key,
          path,
          contentIndex
        }
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
      packageBase64: bytesToBase64(bytes),
      storyPaths
    }
  };
}

async function buildIdmlFile(segments, structure = null) {
  if (!structure?.packageBase64) throw new Error("IDML reconstruction data is missing.");
  const entries = await unzipPackageEntries(base64ToBytes(structure.packageBase64));
  const segmentsByPath = new Map();
  segments.forEach((segment) => {
    const path = segment.structure?.path;
    if (!path) return;
    if (!segmentsByPath.has(path)) segmentsByPath.set(path, []);
    segmentsByPath.get(path).push(segment);
  });

  for (const [path, pathSegments] of segmentsByPath.entries()) {
    if (!entries.has(path)) continue;
    const xml = parseXmlDocument(readPackageText(entries, path), `IDML story ${path}`);
    const contents = idmlContentElements(xml);
    const paragraphs = idmlParagraphStyleRanges(xml);
    pathSegments.forEach((segment) => {
      const paragraphIndex = segment.structure?.paragraphIndex;
      if (Number.isFinite(paragraphIndex) && paragraphs[paragraphIndex]) {
        replaceIdmlParagraphStyleRanges(xml, paragraphs[paragraphIndex], targetText(segment));
        return;
      }
      const contentIndex = segment.structure?.contentIndex;
      if (!Number.isFinite(contentIndex) || !contents[contentIndex]) return;
      replaceXmlChildren(xml, contents[contentIndex], targetText(segment));
    });
    entries.set(path, {
      name: path,
      data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml))
    });
  }

  return zipPackageEntries(entries);
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
const GENERIC_XML_TRANSLATABLE_ATTRS = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "caption",
  "description",
  "label",
  "placeholder",
  "prompt",
  "summary",
  "text",
  "title",
  "tooltip"
]);
const WIX_TRANSLATABLE_ATTRS = new Set(["description", "manufacturer", "name", "title"]);

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
  const candidateSet = new Set(elementCandidates);
  const items = [];

  elementCandidates.forEach((element) => {
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== doc.documentElement) {
      if (candidateSet.has(ancestor)) return;
      ancestor = ancestor.parentElement;
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
  const items = collectGenericXmlItems(doc, documentFormat);
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
    structure: { format: "generic-xml", documentFormat, source: text },
    segments
  };
}

function buildGenericXml(segments, structure = null) {
  if (!structure?.source) throw new Error("XML reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "XML");
  const items = collectGenericXmlItems(doc, structure.documentFormat || "xml");
  segments.forEach((segment) => {
    const itemIndex = segment.structure?.itemIndex;
    if (!Number.isFinite(itemIndex) || !items[itemIndex]) return;
    const item = items[itemIndex];
    if (item.kind === "attribute") {
      item.element.setAttribute(item.attrName, targetText(segment));
      return;
    }
    replaceXmlChildren(doc, item.element, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectResxItems(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "data"))
    .map((dataElement) => {
      const valueElement = childElementByLocalName(dataElement, "value");
      return valueElement ? {
        dataElement,
        valueElement,
        key: dataElement.getAttribute("name") || dataElement.getAttribute("id") || "data",
        value: serializedXmlChildren(valueElement)
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
    if (!Number.isFinite(itemIndex) || !items[itemIndex]) return;
    replaceXmlChildren(doc, items[itemIndex].valueElement, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectTsMessages(doc) {
  return Array.from(doc.getElementsByTagNameNS("*", "message"))
    .map((message, messageIndex) => {
      const sourceElement = childElementByLocalName(message, "source");
      if (!sourceElement) return null;
      let targetElement = childElementByLocalName(message, "translation");
      const source = serializedXmlChildren(sourceElement);
      const target = targetElement ? serializedXmlChildren(targetElement) : "";
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
    segments: messages.map((message, itemIndex) => ({
      text: message.source,
      target: message.target,
      key: `ts-${message.messageIndex + 1}`,
      tags: detectTags(message.source),
      structure: { format: "ts-xml", messageIndex: message.messageIndex, itemIndex }
    }))
  };
}

function buildTsXml(segments, structure = null) {
  if (!structure?.source) throw new Error("TS reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "TS XML");
  const messages = collectTsMessages(doc);
  segments.forEach((segment) => {
    const message = messages.find((item) => item.messageIndex === segment.structure?.messageIndex) || messages[segment.structure?.itemIndex];
    if (!message) return;
    let targetElement = message.targetElement;
    if (!targetElement) {
      targetElement = doc.createElementNS(message.message.namespaceURI || doc.documentElement.namespaceURI || null, "translation");
      if (message.sourceElement.nextSibling) message.message.insertBefore(targetElement, message.sourceElement.nextSibling);
      else message.message.appendChild(targetElement);
    }
    const target = targetText(segment);
    if (target.trim()) targetElement.removeAttribute("type");
    else targetElement.setAttribute("type", "unfinished");
    replaceXmlChildren(doc, targetElement, target);
  });
  return new XMLSerializer().serializeToString(doc);
}

function collectBilingualXmlPairs(doc, documentFormat) {
  const usedTargets = new Set();
  const pairs = [];
  const addPair = (sourceElement, targetElement, key) => {
    if (!sourceElement || !targetElement || usedTargets.has(targetElement)) return;
    const source = serializedXmlChildren(sourceElement);
    if (!hasMeaningfulText(source)) return;
    usedTargets.add(targetElement);
    pairs.push({
      sourceElement,
      targetElement,
      source,
      target: serializedXmlChildren(targetElement),
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
  if (!pairs.length) return parseGenericXmlText(text, documentFormat, `${documentFormat.toUpperCase()} XML`);
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
    replaceXmlChildren(doc, pairs[pairIndex].targetElement, targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
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
    if (char === "=" || char === ":") return index;
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
    .replace(/\t/g, "\\t");
}

function parsePropertiesText(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const segments = [];
  lines.forEach((line, lineIndex) => {
    if (!line.trim() || /^\s*[#!]/.test(line)) return;
    const separator = propertiesSeparatorIndex(line);
    if (separator < 0) return;
    const valueStart = separator + 1 + (line.slice(separator + 1).match(/^\s*/) || [""])[0].length;
    const rawValue = line.slice(valueStart);
    const value = decodePropertiesValue(rawValue);
    if (!hasMeaningfulText(value)) return;
    const key = line.slice(0, separator).trim();
    segments.push({
      text: value,
      key,
      structure: {
        format: "properties",
        key,
        lineIndex,
        prefix: line.slice(0, valueStart)
      }
    });
  });
  if (!segments.length) throw new Error("No translatable properties were found.");
  return { structure: { format: "properties", sourceLines: lines }, segments };
}

function buildProperties(segments, structure = null) {
  const lines = [...(structure?.sourceLines || [])];
  segments.forEach((segment) => {
    const lineIndex = segment.structure?.lineIndex;
    if (!Number.isFinite(lineIndex)) return;
    lines[lineIndex] = `${segment.structure?.prefix || ""}${encodePropertiesValue(targetText(segment))}`;
  });
  return lines.join("\n");
}

function decodeCodeString(raw) {
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

function encodeCodeString(value, quote = '"') {
  const escapedQuote = quote === "`" ? "`" : quote;
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replaceAll(escapedQuote, `\\${escapedQuote}`);
}

function parseCodeStringText(text, documentFormat = "php") {
  const source = String(text || "");
  const pattern = /(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    const quote = match[1];
    const raw = match[2] || "";
    const value = decodeCodeString(raw);
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
        quote
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
      const replacement = `${quote}${encodeCodeString(targetText(segment), quote)}${quote}`;
      output = `${output.slice(0, segment.structure.start)}${replacement}${output.slice(segment.structure.end)}`;
    });
  return output;
}

function parseQuotedText(text, documentFormat = "dtd") {
  const source = String(text || "");
  const pattern = /(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  const segments = [];
  for (const match of source.matchAll(pattern)) {
    const value = decodeCodeString(match[2] || "");
    if (!hasMeaningfulText(value)) continue;
    const tokenIndex = segments.length;
    segments.push({
      text: value,
      key: `${documentFormat}-${tokenIndex + 1}`,
      structure: {
        format: "quoted-text",
        documentFormat,
        tokenIndex,
        start: match.index,
        end: match.index + match[0].length,
        quote: match[1]
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
  if (format === "sbv") return /^\d{1,2}:\d{2}:\d{2}\.\d{3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{3}$/;
  return /^(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2}:)?\d{2}:\d{2}\.\d{3}(?:\s+.*)?$/;
}

function parseSubtitleText(text, format) {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
  const rawBlocks = source.split(/\n{2,}/).map((block) => block.split("\n"));
  const timingPattern = subtitleTimingPattern(format);
  const segments = [];
  rawBlocks.forEach((lines, blockIndex) => {
    const timingIndex = lines.findIndex((line) => timingPattern.test(line.trim()));
    if (timingIndex < 0) return;
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

function buildSubtitleText(segments, structure = null, format = "vtt") {
  const blocks = (structure?.blocks || []).map((block) => [...block]);
  segments.forEach((segment) => {
    const item = segment.structure || {};
    if (!Number.isFinite(item.blockIndex) || !blocks[item.blockIndex]) return;
    const block = blocks[item.blockIndex];
    const textStart = Number.isFinite(item.textStart) ? item.textStart : (item.timingIndex || 0) + 1;
    const oldCount = Number.isFinite(item.textLineCount) ? item.textLineCount : Math.max(0, block.length - textStart);
    const replacement = cleanSrtCueText(targetText(segment)).split("\n").filter((line) => line.trim());
    block.splice(textStart, oldCount, ...replacement);
  });
  const output = blocks.map((block) => block.join("\n")).join("\n\n");
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
    return paths.filter((path) => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(path)).sort();
  }
  if (kind === "spreadsheet") {
    return paths.filter((path) => path === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort();
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

function replaceXmlTextNodes(container, value, textName = "t") {
  const nodes = xmlTextNodesByLocalName(container, textName);
  if (!nodes.length) return false;
  const text = String(value || "");
  nodes[0].textContent = text;
  if (/^\s|\s$/.test(text)) nodes[0].setAttribute("xml:space", "preserve");
  nodes.slice(1).forEach((node) => {
    node.textContent = "";
  });
  return true;
}

function collectOpenXmlItemsForPath(doc, path, kind) {
  let containers = [];
  if (kind === "spreadsheet" && path === "xl/sharedStrings.xml") {
    containers = Array.from(doc.getElementsByTagNameNS("*", "si")).filter((node) => localNameLower(node) === "si");
  } else if (kind === "spreadsheet") {
    containers = Array.from(doc.getElementsByTagNameNS("*", "is")).filter((node) => localNameLower(node) === "is");
  } else {
    containers = Array.from(doc.getElementsByTagNameNS("*", "p")).filter((node) => localNameLower(node) === "p");
  }
  return containers
    .map((container, itemIndex) => ({
      container,
      itemIndex,
      value: xmlTextValue(container),
      key: `${path}#${itemIndex + 1}`
    }))
    .filter((item) => hasMeaningfulText(item.value));
}

async function parseOpenXmlPackageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await unzipPackageEntries(bytes);
  const kind = openXmlKindForEntries(entries);
  if (!kind) throw new Error("OpenXML package type was not recognized.");
  const textPaths = openXmlTextPaths(entries, kind);
  const segments = [];
  textPaths.forEach((path) => {
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenXML part ${path}`);
    collectOpenXmlItemsForPath(xml, path, kind).forEach((item) => {
      const itemIndex = item.itemIndex;
      segments.push({
        text: item.value,
        key: item.key,
        tags: detectTags(item.value),
        structure: {
          format: "openxml",
          kind,
          path,
          itemIndex,
          key: item.key
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
  const byPath = new Map();
  segments.forEach((segment) => {
    const path = segment.structure?.path;
    if (!path) return;
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(segment);
  });
  for (const [path, pathSegments] of byPath.entries()) {
    if (!entries.has(path)) continue;
    const xml = parseXmlDocument(readPackageText(entries, path), `OpenXML part ${path}`);
    const items = collectOpenXmlItemsForPath(xml, path, kind);
    pathSegments.forEach((segment) => {
      const itemIndex = segment.structure?.itemIndex;
      const item = items.find((candidate) => candidate.itemIndex === itemIndex);
      if (!Number.isFinite(itemIndex) || !item) return;
      replaceXmlTextNodes(item.container, targetText(segment));
    });
    entries.set(path, { name: path, data: localizationTextEncoder.encode(new XMLSerializer().serializeToString(xml)) });
  }
  return zipPackageEntries(entries);
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
  const segments = contents.map((element, contentIndex) => {
    const value = serializedXmlChildren(element);
    if (!hasMeaningfulText(value)) return null;
    return {
      text: value,
      key: `icml-content-${contentIndex + 1}`,
      tags: detectTags(value),
      structure: {
        format: "icml",
        contentIndex
      }
    };
  }).filter(Boolean);
  if (!segments.length) throw new Error("No translatable ICML content was found.");
  return {
    fileName,
    documentName: stripExt(fileName),
    documentType: "icml",
    segments,
    structure: { format: "icml", source: text }
  };
}

function buildIcmlText(segments, structure = null) {
  if (!structure?.source) throw new Error("ICML reconstruction source data is missing.");
  const doc = parseXmlDocument(structure.source, "ICML XML");
  const contents = idmlContentElements(doc);
  segments.forEach((segment) => {
    const contentIndex = segment.structure?.contentIndex;
    if (!Number.isFinite(contentIndex) || !contents[contentIndex]) return;
    replaceXmlChildren(doc, contents[contentIndex], targetText(segment));
  });
  return new XMLSerializer().serializeToString(doc);
}

async function parseLocalizationFile(file, options = {}) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "idml") return parseIdmlFile(file);
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
  if (ext === "po" || ext === "pot") {
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
    try {
      const tsXml = parseTsXmlText(text);
      segments = tsXml.segments;
      structure = tsXml.structure;
    } catch {
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
    tags: segment.tags || detectTags(segment.text)
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
  if (normalizedFormat === "po" || normalizedFormat === "pot") output = buildPo(segmentList, structure);
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
  else if (OPENXML_TYPES.has(normalizedFormat)) output = buildOpenXmlPackageFile(segmentList, structure);
  else if (OPENDOCUMENT_TYPES.has(normalizedFormat)) output = buildOpenDocumentPackageFile(segmentList, structure);
  else throw new Error(`Unsupported export format: ${normalizedFormat}`);
  return encodeLocalizationTextOutput(output, normalizedFormat, structure);
}

window.CatHan.localization = { parseLocalizationFile, buildLocalizationFile };
})();
