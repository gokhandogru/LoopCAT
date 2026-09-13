/* User patterns execute only in this disposable worker. */
self.onmessage = ({ data }) => {
  try {
    const { type, pattern, caseSensitive, records, replacement = "" } = data;
    if (typeof pattern !== "string" || pattern.length > 4096 || records.length > 100000) throw new Error("Search exceeds the supported limits.");
    const regex = new RegExp(pattern, caseSensitive ? (type === "replace" ? "g" : "") : (type === "replace" ? "gi" : "i"));
    const result = records.map((record) => {
      if (type === "query") return { id: record.id, match: regex.test(record.text) };
      let count = 0;
      let cursor = 0;
      let output = "";
      const replaceChunk = (text) => text.replace(regex, (match) => {
        if (!match) throw new Error("Find pattern must not match empty text.");
        count++;
        return replacement;
      });
      for (const token of record.tokens || []) {
        if (token.index < cursor) continue;
        output += replaceChunk(record.text.slice(cursor, token.index)) + token.text;
        cursor = token.index + token.text.length;
      }
      return { id: record.id, text: output + replaceChunk(record.text.slice(cursor)), count };
    });
    self.postMessage({ ok: true, result });
  } catch (error) { self.postMessage({ ok: false, error: error.message }); }
};
