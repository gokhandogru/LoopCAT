// Experimental pure integer ABI: a guest sees one fixed page and at most a
// selected token + a glossary lemma. No application or host-operation imports.
export const COMPUTE_MAX_BYTES = 16384;
export function checkComputeModule(input) {
  const bytes = new Uint8Array(input);
  if (!bytes.length || bytes.length > COMPUTE_MAX_BYTES) throw new Error("Invalid compute module size.");
  let pos = 0,
    end = bytes.length;
  function bad() {
    throw new Error("Unsupported compute module.");
  }
  function u8() {
    if (pos >= end) bad();
    return bytes[pos++];
  }
  function number() {
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = u8();
      result += (b & 127) * 2 ** (7 * i);
      if (!(b & 128)) return result;
    }
    bad();
  }
  function str() {
    const n = number();
    if (n > 32 || pos + n > end) bad();
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(u8());
    return s;
  }
  function requireOk(v) {
    if (!v) bad();
  }
  requireOk([0, 97, 115, 109, 1, 0, 0, 0].every((x) => x === u8()));
  let mask = 0,
    previous = 0;
  while (pos < bytes.length) {
    end = bytes.length;
    const id = u8(),
      length = number();
    if (id <= previous || length > bytes.length - pos) bad();
    previous = id;
    end = pos + length;
    mask |= 1 << id;
    if (id === 1) {
      requireOk(
        number() === 1 &&
          u8() === 0x60 &&
          number() === 3 &&
          u8() === 127 &&
          u8() === 127 &&
          u8() === 127 &&
          number() === 1 &&
          u8() === 127
      );
    } else if (id === 2) {
      requireOk(
        number() === 1 &&
          str() === "host" &&
          str() === "memory" &&
          u8() === 2 &&
          u8() === 1 &&
          number() === 1 &&
          number() === 1
      );
    } else if (id === 3) {
      requireOk(number() === 1 && number() === 0);
    } else if (id === 7) {
      requireOk(number() === 1 && str() === "match" && u8() === 0 && number() === 0);
    } else if (id === 10) {
      requireOk(number() === 1);
      const n = number();
      requireOk(n === end - pos);
      const groups = number();
      requireOk(groups <= 8);
      let locals = 0;
      for (let i = 0; i < groups; i++) {
        locals += number();
        requireOk(locals <= 32 && u8() === 127);
      }
      // Whitelist opcodes too: the memory cap alone would not bound GC arrays,
      // tables or huge declarations. WebAssembly.validate checks nesting/types.
      while (pos < end) {
        const op = u8();
        if ([2, 3, 4].includes(op)) {
          requireOk(u8() === 64);
        } else if ([12, 13, 32, 33, 34, 65].includes(op)) {
          number();
        } else if (op === 47) {
          number();
          number();
        } else if (op === 64) {
          requireOk(u8() === 0);
        } else if (![5, 11, 15, 26, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 106, 107, 108, 113, 114].includes(op))
          bad();
      }
    } else bad();
    requireOk(pos === end);
  }
  requireOk(mask === ((1 << 1) | (1 << 2) | (1 << 3) | (1 << 7) | (1 << 10)) && WebAssembly.validate(bytes));
  return bytes;
}
export function encodeComputeInput(memory, { lemma, token, soften = false }) {
  if (!(memory instanceof WebAssembly.Memory) || memory.buffer.byteLength !== 65536)
    throw new Error("Invalid compute memory.");
  for (const text of [lemma, token])
    if (typeof text !== "string" || !text || text.length > 96 || !/^\p{L}+$/u.test(text))
      throw new Error("Expected bounded word and term.");
  if (typeof soften !== "boolean") throw new Error("Invalid glossary option.");
  const normalize = (s) => s.toLocaleLowerCase("tr").normalize("NFC");
  const l = normalize(lemma),
    w = normalize(token);
  if (l.length > 96 || w.length > 96) throw new Error("Normalized word exceeds limit.");
  const view = new DataView(memory.buffer);
  for (let i = 0; i < l.length; i++) view.setUint16(i * 2, l.charCodeAt(i), true);
  for (let i = 0; i < w.length; i++) view.setUint16(256 + i * 2, w.charCodeAt(i), true);
  return [l.length, w.length, soften ? 1 : 0];
}
export function computeFinding(word, code) {
  if (code !== 0 && code !== 1) throw new Error("Invalid or oversized compute output.");
  return code ? [{ kind: "termMatch", start: 0, end: word.length }] : [];
}
