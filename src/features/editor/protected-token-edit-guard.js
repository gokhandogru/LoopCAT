/** Raw UTF-16 ranges match textarea selection offsets; chip labels are never data. */
export function protectedTokenRanges(text, tags = []) {
  const value = String(text || "");
  const ranges = [];
  let cursor = 0;
  for (const tag of [...tags].sort(
    (a, b) => Number(a.index || 0) - Number(b.index || 0) || String(b.text || "").length - String(a.text || "").length
  )) {
    const token = String(tag?.text || "");
    if (!token) continue;
    const provided = Number.isInteger(tag.index) ? tag.index : -1;
    const start =
      provided >= cursor && value.slice(provided, provided + token.length) === token
        ? provided
        : value.indexOf(token, cursor);
    if (start < cursor) continue;
    cursor = start + token.length;
    ranges.push({ start, end: cursor, text: token });
  }
  return ranges;
}

export function normalizeProtectedSelection(selection, length, ranges) {
  const start = Math.max(0, Math.min(length, Number(selection?.start) || 0));
  const end = Math.max(start, Math.min(length, Number(selection?.end ?? start) || 0));
  if (start === end) {
    const token = ranges.find((range) => range.start < start && range.end > start);
    if (!token) return { start, end };
    const boundary = start - token.start < token.end - start ? token.start : token.end;
    return { start: boundary, end: boundary };
  }
  return ranges.reduce(
    (result, token) =>
      token.start < result.end && token.end > result.start
        ? { start: Math.min(result.start, token.start), end: Math.max(result.end, token.end) }
        : result,
    { start, end }
  );
}

export function protectedInputSelection(selection, length, ranges, inputType = "") {
  const rawStart = Math.max(0, Math.min(length, Number(selection?.start) || 0));
  const rawEnd = Math.max(rawStart, Math.min(length, Number(selection?.end ?? rawStart) || 0));
  if (rawStart === rawEnd && /^delete/.test(inputType)) {
    const backwards = /Backward$/.test(inputType);
    const forwards = /Forward$/.test(inputType);
    const token = ranges.find(
      (range) =>
        (rawStart > range.start && rawStart < range.end) ||
        (backwards && rawStart === range.end) ||
        (forwards && rawStart === range.start)
    );
    if (token) return { start: token.start, end: token.end };
  }
  return normalizeProtectedSelection({ start: rawStart, end: rawEnd }, length, ranges);
}

function occurrences(text, token) {
  return text.split(token).length - 1;
}

export function expandProtectedDeletion(previous, next, ranges) {
  let start = 0;
  let end = previous.length;
  let nextEnd = next.length;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  if (nextEnd !== start || start === end) return null;
  const selection = normalizeProtectedSelection({ start, end }, previous.length, ranges);
  return {
    value: previous.slice(0, selection.start) + previous.slice(selection.end),
    intent: { value: previous, selection, replacement: "" },
    caret: selection.start
  };
}

/** A known browser selection can authorize replacing a whole token, even when
 * old and new tags share delimiters/attributes that confuse a minimal diff. */
export function permitsProtectedEdit(previous, next, ranges, intent = null) {
  if (previous === next || !ranges.length) return true;
  let start = 0;
  let end = previous.length;
  let knownSelection = false;
  if (intent?.value === previous && typeof intent.replacement === "string") {
    const selection = intent.selection;
    const suffix = previous.slice(selection.end);
    if (next === previous.slice(0, selection.start) + intent.replacement + suffix) {
      start = selection.start;
      end = selection.end;
      knownSelection = true;
    }
  }
  if (!knownSelection) {
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let nextEnd = next.length;
    while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) {
      end--;
      nextEnd--;
    }
  }
  return ranges.every((token) => {
    const touches = start === end ? start > token.start && start < token.end : start < token.end && end > token.start;
    if (!touches || (start <= token.start && end >= token.end)) return true;
    // Native drag/drop may move a complete token in one input event. Its raw
    // bytes and multiplicity must remain intact, even if the diff cuts across it.
    return occurrences(next, token.text) >= occurrences(previous, token.text);
  });
}
