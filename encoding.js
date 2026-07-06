(() => {
const utf8Encoder = new TextEncoder();
const singleByteMaps = new Map();

const ENCODING_ALIASES = new Map([
  ["auto", "auto"],
  ["utf8", "utf-8"],
  ["utf-8", "utf-8"],
  ["utf8bom", "utf-8"],
  ["utf-16", "utf-16le"],
  ["utf16", "utf-16le"],
  ["utf-16le", "utf-16le"],
  ["utf16le", "utf-16le"],
  ["utf-16be", "utf-16be"],
  ["utf16be", "utf-16be"],
  ["shift-jis", "shift_jis"],
  ["shift_jis", "shift_jis"],
  ["sjis", "shift_jis"],
  ["x-sjis", "shift_jis"],
  ["eucjp", "euc-jp"],
  ["euc-jp", "euc-jp"],
  ["gbk", "gb18030"],
  ["gb2312", "gb18030"],
  ["gb18030", "gb18030"],
  ["big5", "big5"],
  ["big-5", "big5"],
  ["euckr", "euc-kr"],
  ["euc-kr", "euc-kr"],
  ["ks_c_5601-1987", "euc-kr"],
  ["latin1", "windows-1252"],
  ["iso-8859-1", "windows-1252"],
  ["iso8859-1", "windows-1252"],
  ["us-ascii", "windows-1252"],
  ["ascii", "windows-1252"]
]);

const SINGLE_BYTE_ENCODINGS = new Set([
  "windows-1250", "windows-1251", "windows-1252", "windows-1253", "windows-1254", "windows-1255", "windows-1256", "windows-1257", "windows-1258",
  "iso-8859-2", "iso-8859-3", "iso-8859-4", "iso-8859-5", "iso-8859-6", "iso-8859-7", "iso-8859-8", "iso-8859-10", "iso-8859-13", "iso-8859-14", "iso-8859-15", "iso-8859-16",
  "iso-8859-9", "macintosh", "x-mac-cyrillic"
]);

const TEXT_ENCODING_OPTIONS = [
  ["auto", "Auto"],
  ["utf-8", "UTF-8"],
  ["utf-16le", "UTF-16 LE"],
  ["utf-16be", "UTF-16 BE"],
  ["windows-1250", "Windows-1250 Central European"],
  ["windows-1251", "Windows-1251 Cyrillic"],
  ["windows-1252", "Windows-1252 Western"],
  ["windows-1253", "Windows-1253 Greek"],
  ["windows-1254", "Windows-1254 Turkish"],
  ["windows-1255", "Windows-1255 Hebrew"],
  ["windows-1256", "Windows-1256 Arabic"],
  ["windows-1257", "Windows-1257 Baltic"],
  ["windows-1258", "Windows-1258 Vietnamese"],
  ["iso-8859-2", "ISO-8859-2 Central European"],
  ["iso-8859-5", "ISO-8859-5 Cyrillic"],
  ["iso-8859-6", "ISO-8859-6 Arabic"],
  ["iso-8859-7", "ISO-8859-7 Greek"],
  ["iso-8859-8", "ISO-8859-8 Hebrew"],
  ["iso-8859-9", "ISO-8859-9 Turkish"],
  ["iso-8859-15", "ISO-8859-15 Western"],
  ["shift_jis", "Shift_JIS Japanese"],
  ["euc-jp", "EUC-JP Japanese"],
  ["gb18030", "GB18030 Chinese"],
  ["big5", "Big5 Chinese"],
  ["euc-kr", "EUC-KR Korean"]
];

const AUTO_CANDIDATES = [
  "windows-1252", "windows-1254", "windows-1251", "windows-1256", "windows-1255",
  "shift_jis", "euc-jp", "gb18030", "big5", "euc-kr",
  "iso-8859-2", "iso-8859-5", "iso-8859-6", "iso-8859-7", "iso-8859-8", "iso-8859-9", "iso-8859-15"
];

const SCRIPT_PATTERNS = {
  "windows-1251": /[\u0400-\u04ff]/g,
  "iso-8859-5": /[\u0400-\u04ff]/g,
  "windows-1256": /[\u0600-\u06ff]/g,
  "iso-8859-6": /[\u0600-\u06ff]/g,
  "windows-1255": /[\u0590-\u05ff]/g,
  "iso-8859-8": /[\u0590-\u05ff]/g,
  "shift_jis": /[\u3040-\u30ff\u3400-\u9fff]/g,
  "euc-jp": /[\u3040-\u30ff\u3400-\u9fff]/g,
  "gb18030": /[\u3400-\u9fff]/g,
  "big5": /[\u3400-\u9fff]/g,
  "euc-kr": /[\uac00-\ud7af]/g,
  "windows-1254": /[\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]/g,
  "iso-8859-9": /[\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]/g,
  "windows-1253": /[\u0370-\u03ff]/g,
  "iso-8859-7": /[\u0370-\u03ff]/g
};

function normalizeEncodingLabel(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "");
  if (!raw) return "auto";
  if (/^windows125\d$/.test(raw)) return raw.replace("windows", "windows-");
  if (/^cp125\d$/.test(raw)) return raw.replace("cp", "windows-");
  if (/^iso8859\d+$/i.test(raw)) return raw.replace("iso8859", "iso-8859-");
  return ENCODING_ALIASES.get(raw) || raw;
}

function decoderFor(label, fatal = false) {
  return new TextDecoder(normalizeEncodingLabel(label), { fatal });
}

function decodeBytes(bytes, label, options = {}) {
  const clean = normalizeEncodingLabel(label);
  return decoderFor(clean, Boolean(options.fatal)).decode(bytes);
}

function byteAsciiPreview(bytes, limit = 4096) {
  let text = "";
  const length = Math.min(bytes.length, limit);
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index];
    text += byte === 0 ? " " : String.fromCharCode(byte);
  }
  return text;
}

function utf16Preview(bytes, littleEndian) {
  const length = Math.min(bytes.length - (bytes.length % 2), 4096);
  let text = "";
  for (let index = 0; index < length; index += 2) {
    const code = littleEndian ? bytes[index] | (bytes[index + 1] << 8) : (bytes[index] << 8) | bytes[index + 1];
    text += String.fromCharCode(code);
  }
  return text;
}

function declaredEncoding(bytes, file = {}) {
  const mimeCharset = String(file.type || "").match(/charset\s*=\s*([^;]+)/i)?.[1];
  if (mimeCharset) return mimeCharset.replace(/^["']|["']$/g, "");
  const ascii = byteAsciiPreview(bytes);
  const utf16le = utf16Preview(bytes, true);
  const utf16be = utf16Preview(bytes, false);
  const joined = `${ascii}\n${utf16le}\n${utf16be}`;
  return joined.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1] ||
    joined.match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9._:-]+)/i)?.[1] ||
    joined.match(/@charset\s+["']([^"']+)["']/i)?.[1] ||
    "";
}

function sniffBom(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "utf-8", bom: true, detectedFrom: "bom" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", bom: true, detectedFrom: "bom" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", bom: true, detectedFrom: "bom" };
  return null;
}

function sniffUtf16NoBom(bytes) {
  const limit = Math.min(bytes.length - (bytes.length % 2), 2048);
  if (limit < 16) return "";
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < limit; index += 2) {
    if (bytes[index] === 0) evenZeros += 1;
    if (bytes[index + 1] === 0) oddZeros += 1;
  }
  const pairs = limit / 2;
  if (oddZeros / pairs > 0.35 && evenZeros / pairs < 0.08) return "utf-16le";
  if (evenZeros / pairs > 0.35 && oddZeros / pairs < 0.08) return "utf-16be";
  return "";
}

function tryDecodeCandidate(bytes, encoding) {
  try {
    const text = decodeBytes(bytes, encoding);
    return { encoding, text, score: scoreDecodedText(text, encoding) };
  } catch {
    return null;
  }
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function scoreDecodedText(text, encoding) {
  const length = Math.max(1, text.length);
  const replacement = countMatches(text, /\ufffd/g);
  const controls = countMatches(text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g);
  const scriptPattern = SCRIPT_PATTERNS[encoding];
  const scriptCount = scriptPattern ? countMatches(text, scriptPattern) : 0;
  const letters = countMatches(text, /\p{L}/gu);
  const whitespace = countMatches(text, /\s/g);
  return (scriptCount * 18) + (letters * 0.5) + (whitespace * 0.2) - (replacement * 120) - (controls * 30) - (length > 0 ? Math.abs(length - text.trim().length) * 0.01 : 0);
}

function canEncodeText(text, encoding) {
  try {
    encodeText(text, encoding, { allowFallback: false });
    return true;
  } catch {
    return false;
  }
}

function singleByteEncodeMap(encoding) {
  const clean = normalizeEncodingLabel(encoding);
  if (singleByteMaps.has(clean)) return singleByteMaps.get(clean);
  const map = new Map();
  for (let byte = 0; byte <= 0xff; byte += 1) {
    const char = decodeBytes(new Uint8Array([byte]), clean);
    if (char && char !== "\ufffd" && Array.from(char).length === 1 && !map.has(char)) map.set(char, byte);
  }
  singleByteMaps.set(clean, map);
  return map;
}

function encodeSingleByte(text, encoding) {
  const map = singleByteEncodeMap(encoding);
  const bytes = [];
  for (const char of String(text || "")) {
    const byte = map.get(char);
    if (byte === undefined) throw new Error(`Text contains a character that cannot be written as ${encoding}.`);
    bytes.push(byte);
  }
  return new Uint8Array(bytes);
}

function encodeUtf16(text, littleEndian, bom) {
  const value = String(text || "");
  const bomLength = bom ? 2 : 0;
  const bytes = new Uint8Array((value.length * 2) + bomLength);
  let offset = 0;
  if (bom) {
    bytes[0] = littleEndian ? 0xff : 0xfe;
    bytes[1] = littleEndian ? 0xfe : 0xff;
    offset = 2;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (littleEndian) {
      bytes[offset++] = code & 0xff;
      bytes[offset++] = code >>> 8;
    } else {
      bytes[offset++] = code >>> 8;
      bytes[offset++] = code & 0xff;
    }
  }
  return bytes;
}

function utf8Bytes(text, bom = false) {
  const body = utf8Encoder.encode(String(text || ""));
  if (!bom) return body;
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return bytes;
}

function encodeText(text, encodingInfo = "utf-8", options = {}) {
  const source = typeof encodingInfo === "object" && encodingInfo ? encodingInfo : { encoding: encodingInfo };
  const requested = normalizeEncodingLabel(source.encoding || "utf-8");
  const bom = Boolean(source.bom);
  try {
    if (requested === "utf-8" || requested === "auto") return { content: utf8Bytes(text, requested === "utf-8" && bom), encoding: "utf-8", preserved: requested === "utf-8" };
    if (requested === "utf-16le") return { content: encodeUtf16(text, true, bom), encoding: requested, preserved: true };
    if (requested === "utf-16be") return { content: encodeUtf16(text, false, bom), encoding: requested, preserved: true };
    if (SINGLE_BYTE_ENCODINGS.has(requested)) return { content: encodeSingleByte(text, requested), encoding: requested, preserved: true };
    throw new Error(`Writing ${requested} is not supported.`);
  } catch (error) {
    if (!options.allowFallback) throw error;
    return { content: utf8Bytes(text), encoding: "utf-8", preserved: false, fallbackReason: error.message || String(error) };
  }
}

function sourceEncodingRecord(encoding, detectedFrom, bom = false) {
  const clean = normalizeEncodingLabel(encoding);
  return {
    encoding: clean,
    detectedFrom,
    bom: Boolean(bom),
    canPreserve: clean === "utf-8" || clean === "utf-16le" || clean === "utf-16be" || SINGLE_BYTE_ENCODINGS.has(clean)
  };
}

function decodeTextBytes(rawBytes, options = {}) {
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || []);
  const override = normalizeEncodingLabel(options.encoding || "auto");
  if (override !== "auto") {
    const text = decodeBytes(bytes, override);
    return { text, ...sourceEncodingRecord(override, "manual", sniffBom(bytes)?.bom) };
  }
  const bom = sniffBom(bytes);
  if (bom) return { text: decodeBytes(bytes, bom.encoding), ...sourceEncodingRecord(bom.encoding, bom.detectedFrom, true) };
  const declared = normalizeEncodingLabel(declaredEncoding(bytes, options.file || {}));
  if (declared && declared !== "auto") {
    try {
      return { text: decodeBytes(bytes, declared), ...sourceEncodingRecord(declared, "declaration", false) };
    } catch {}
  }
  const utf16 = sniffUtf16NoBom(bytes);
  if (utf16) return { text: decodeBytes(bytes, utf16), ...sourceEncodingRecord(utf16, "pattern", false) };
  try {
    return { text: decodeBytes(bytes, "utf-8", { fatal: true }), ...sourceEncodingRecord("utf-8", "utf8", false) };
  } catch {}
  const candidates = AUTO_CANDIDATES
    .map((encoding) => tryDecodeCandidate(bytes, encoding))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0] || { encoding: "windows-1252", text: decodeBytes(bytes, "windows-1252") };
  return { text: best.text, ...sourceEncodingRecord(best.encoding, "heuristic", false) };
}

async function decodeTextFile(file, options = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeTextBytes(bytes, { ...options, file });
}

window.CatHan = window.CatHan || {};
window.CatHan.encoding = {
  TEXT_ENCODING_OPTIONS,
  SINGLE_BYTE_ENCODINGS,
  normalizeEncodingLabel,
  decodeTextBytes,
  decodeTextFile,
  encodeText,
  canEncodeText
};
})();
