/**
 * Owns pure literal/regex target replacement while preserving protected-token
 * spans. Form state, scope, commands, persistence, activity, and rendering
 * remain behind injected boundaries.
 *
 * @param {{
 *   detectTags: (text: string) => any[],
 *   normalizeCase: (value: unknown) => string
 * }} options
 */
export function createProtectedTextReplacementService(options) {
  const detectTags = options?.detectTags;
  const normalizeCase = options?.normalizeCase;
  if (typeof detectTags !== "function" || typeof normalizeCase !== "function") {
    throw new TypeError(
      "ProtectedTextReplacementService requires protected-tag detection and case-normalization boundaries."
    );
  }

  function replacePlain(text, findText, replacement, replaceOptions = {}) {
    const source = String(text || "");
    const find = String(findText || "");
    if (!find) return { text: source, count: 0 };
    if (replaceOptions.regex) {
      const flags = replaceOptions.caseSensitive ? "g" : "gi";
      const regex = new RegExp(find, flags);
      let emptyMatch = false;
      let count = 0;
      const replaced = source.replace(regex, (match) => {
        if (match === "") emptyMatch = true;
        count += 1;
        return replacement;
      });
      if (emptyMatch) throw new Error("Find pattern must not match empty text.");
      return { text: replaced, count };
    }
    const needle = replaceOptions.caseSensitive ? find : normalizeCase(find);
    const haystack = replaceOptions.caseSensitive ? source : normalizeCase(source);
    let cursor = 0;
    let count = 0;
    let output = "";
    while (cursor < source.length) {
      const index = haystack.indexOf(needle, cursor);
      if (index === -1) break;
      output += source.slice(cursor, index) + replacement;
      cursor = index + find.length;
      count += 1;
    }
    return { text: count ? output + source.slice(cursor) : source, count };
  }

  function replace(text, findText, replacement, replaceOptions = {}) {
    const source = String(text || "");
    const protectedTokens = detectTags(source).sort((a, b) => a.index - b.index || b.text.length - a.text.length);
    let cursor = 0;
    let count = 0;
    let output = "";
    protectedTokens.forEach((token) => {
      if (token.index < cursor) return;
      const chunk = replacePlain(source.slice(cursor, token.index), findText, replacement, replaceOptions);
      output += chunk.text + token.text;
      count += chunk.count;
      cursor = token.index + token.text.length;
    });
    const tail = replacePlain(source.slice(cursor), findText, replacement, replaceOptions);
    return { text: output + tail.text, count: count + tail.count };
  }

  return Object.freeze({ replacePlain, replace });
}
