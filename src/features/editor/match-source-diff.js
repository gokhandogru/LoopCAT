/** Build a bounded word-level diff from the TM source to the current source. */
export function diffMatchSource(tmSource, currentSource, locale) {
  const before = String(tmSource ?? "");
  const after = String(currentSource ?? "");
  if (before === after) return [{ kind: "equal", text: before }];
  let segmenter;
  try {
    segmenter =
      typeof Intl.Segmenter === "function" ? new Intl.Segmenter(locale || undefined, { granularity: "word" }) : null;
  } catch {
    segmenter = null;
  }
  const tokenize = (value) =>
    segmenter
      ? Array.from(segmenter.segment(value), (item) => item.segment)
      : value.match(/[\p{L}\p{M}\p{N}_]+|\s+|[^\p{L}\p{M}\p{N}_\s]/gu) || [];
  const oldTokens = tokenize(before),
    newTokens = tokenize(after);
  const rows = oldTokens.length + 1,
    cols = newTokens.length + 1;
  // Avoid quadratic work on unusually long or untrusted translation units.
  if (rows * cols > 100000)
    return [
      { kind: "removed", text: before },
      { kind: "added", text: after }
    ];
  const lengths = new Uint32Array(rows * cols);
  for (let i = oldTokens.length - 1; i >= 0; i--) {
    for (let j = newTokens.length - 1; j >= 0; j--) {
      lengths[i * cols + j] =
        oldTokens[i] === newTokens[j]
          ? 1 + lengths[(i + 1) * cols + j + 1]
          : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
    }
  }
  const parts = [];
  function push(kind, value) {
    if (!value) return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += value;
    else parts.push({ kind, text: value });
  }
  let i = 0,
    j = 0;
  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i] === newTokens[j]) {
      push("equal", oldTokens[i]);
      i++;
      j++;
    } else if (
      i < oldTokens.length &&
      (j === newTokens.length || lengths[(i + 1) * cols + j] >= lengths[i * cols + j + 1])
    ) {
      push("removed", oldTokens[i++]);
    } else {
      push("added", newTokens[j++]);
    }
  }
  return parts;
}
