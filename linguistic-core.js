// Adapted from Loopcat Pro source-analysis and scoring; shared by renderer and worker.
(() => {
  const COUNTING_VERSION = "loopcat-words/2";
  const MATCHING_VERSION = "loopcat-match/3";
  const formatting = /* @__PURE__ */ new Set([
    "b",
    "i",
    "u",
    "strong",
    "em",
    "span",
    "a",
    "sup",
    "sub",
    "g",
    "hi",
    "pc",
    "mrk"
  ]);
  const blocks = new Set(
    "address article aside blockquote caption dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section table tbody td tfoot th thead tr ul".split(
      " "
    )
  );
  const htmlInline = new Set(
    "abbr bdi bdo cite code data del dfn font ins kbd mark q s samp small strike time tt var".split(" ")
  );
  const voidTags = new Set(
    "area base br col embed hr img input link meta param source track wbr x bx ex cp sc ec sm".split(" ")
  );
  const nativeCode = new Set(["bpt", "ept", "it", "ph"]);
  const markupTokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z][\w:.-]*(?:\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>|\{[A-Za-z_][\w.-]*\}|%(?:\d+\$)?[sdif]/gu;
  const entity = (value) =>
    value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, id) => {
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\xA0" };
      if (named[id]) return named[id];
      const n = id.startsWith("#x") ? parseInt(id.slice(2), 16) : Number(id.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 1114111 ? String.fromCodePoint(n) : whole;
    });
  function projectSource(source, descriptor) {
    if (descriptor?.literal)
      return { text: source, codes: [], canonical: JSON.stringify([source.normalize("NFC"), []]), known: true };
    const supplied = /* @__PURE__ */ new Map(),
      used = /* @__PURE__ */ new Map(),
      structureStack = [];
    for (const code of descriptor?.codes ?? []) {
      const list = supplied.get(code.token) ?? [];
      list.push(code);
      supplied.set(code.token, list);
    }
    const codes = [];
    let balanced = true;
    let countingComplete = true;
    let text = "",
      offset = 0,
      boundary = false,
      hidden = "";
    const decode = descriptor?.encoded || /<\/?(?:p|h[1-6]|br|li|ul|ol|div|span|a|strong|em|b|i)\b/i.test(source);
    function append(value) {
      if (!value || hidden || !countingComplete) return;
      const malformed = /<(?:\/?[A-Za-z][\w:.-]*(?=\s|\/|$)|!--|!\[CDATA\[|\?)/u.exec(value);
      if (malformed) {
        countingComplete = false;
        value = value.slice(0, malformed.index);
      }
      if (decode) value = entity(value);
      if (boundary && text && value && !/[\s\0]$/u.test(text) && !/^[\s\0]/u.test(value)) text += " ";
      if (value) boundary = false;
      text += value;
    }
    const pairs = [];
    let serial = 0;
    for (const match of source.matchAll(markupTokens)) {
      const token = match[0],
        tag = /^<\/?([\w:.-]+)/.exec(token)?.[1]?.toLowerCase();
      append(source.slice(offset, match.index));
      offset = match.index + token.length;
      if (!countingComplete) break;
      if (hidden) {
        if (token.startsWith("</") && tag === hidden) hidden = "";
        else continue;
      }
      if (token.startsWith("<![CDATA[")) {
        balanced = false;
        text += token.slice(9, -3);
        continue;
      }
      if (token.startsWith("<!--") || token.startsWith("<?")) {
        balanced = false;
        continue;
      }
      const closing = token.startsWith("</");
      const standalone =
        token.endsWith("/>") || voidTags.has(tag) || nativeCode.has(tag) || tag === "script" || tag === "style";
      if (!closing && !token.endsWith("/>") && (nativeCode.has(tag) || tag === "script" || tag === "style"))
        hidden = tag;
      if (blocks.has(tag)) boundary = true;
      const candidates = supplied.get(token);
      let code =
        candidates?.find((item) => item.kind === "close" && item.pair === structureStack.at(-1)?.pair) ??
        candidates?.[Math.min(used.get(token) ?? 0, candidates.length - 1)];
      used.set(token, (used.get(token) ?? 0) + 1);
      if (!code) {
        const kind = tag && !standalone ? (closing ? "close" : "open") : "opaque";
        const pair = kind === "open" ? String(serial++) : kind === "close" ? pairs.at(-1) : void 0;
        if (kind === "open") pairs.push(pair);
        else if (kind === "close") pairs.pop();
        code = {
          token,
          kind,
          pair,
          identity: kind === "opaque" || !formatting.has(tag) ? token : tag,
          known: (formatting.has(tag) && kind !== "opaque" && tag !== "g") || ["br", "hr", "wbr"].includes(tag) || !tag
        };
      }
      if (code.kind === "open") structureStack.push(code);
      else if (code.kind === "close") {
        const opening = structureStack.pop();
        if (!opening || (opening.pair ?? opening.identity) !== (code.pair ?? code.identity)) balanced = false;
      }
      codes.push({ ...code, offset: text.length });
      if (code.kind === "opaque" && !closing) text += "\0";
    }
    append(source.slice(offset));
    if (hidden) countingComplete = false;
    const pairIds = /* @__PURE__ */ new Map();
    const canonicalCodes = codes.map((code) => {
      if (code.pair !== void 0 && !pairIds.has(code.pair)) pairIds.set(code.pair, pairIds.size);
      return [code.kind, code.identity, code.offset, code.pair === void 0 ? null : pairIds.get(code.pair)];
    });
    return {
      text,
      codes,
      canonical: JSON.stringify([text.normalize("NFC"), canonicalCodes]),
      countingComplete,
      known: countingComplete && balanced && !structureStack.length && codes.every((code) => code.known)
    };
  }
  function decodeSourceEntities(value) {
    return entity(value);
  }
  const segmenters = /* @__PURE__ */ new Map();
  function metricsSegmenter(locale, granularity) {
    const key = locale + granularity;
    let result = segmenters.get(key);
    if (!result) {
      try {
        result = new Intl.Segmenter(locale, { granularity });
      } catch {
        result = new Intl.Segmenter("und", { granularity });
      }
      if (segmenters.size > 128) segmenters.clear();
      segmenters.set(key, result);
    }
    return result;
  }
  function choiceText(value, depth = 0) {
    if (depth > 32) return value;
    const close = (start) => {
      let nesting = 1,
        quoted = false;
      for (let i = start; i < value.length; i++) {
        const c = value[i];
        if (c === "'") {
          if (value[i + 1] === "'") {
            i++;
            continue;
          }
          if (quoted || /[{}#]/.test(value[i + 1] ?? "")) {
            quoted = !quoted;
            continue;
          }
        }
        if (quoted) continue;
        if (c === "{") nesting++;
        else if (c === "}" && !--nesting) return i;
      }
      return -1;
    };
    let result = "",
      cursor = 0;
    for (const match of value.matchAll(/\{[\w.-]+\s*,\s*(?:plural|selectordinal|select)\s*,\s*/gu)) {
      if (match.index < cursor) continue;
      const end = close(match.index + 1);
      if (end < 0) continue;
      let position = match.index + match[0].length;
      const branches = [];
      let valid = true;
      const offset = /^offset:\s*\d+\s*/.exec(value.slice(position));
      if (offset) position += offset[0].length;
      while (position < end) {
        const branch = /^\s*(?:=?[\w.-]+)\s*\{/.exec(value.slice(position, end));
        if (!branch) {
          if (value.slice(position, end).trim()) valid = false;
          break;
        }
        const start = position + branch[0].length,
          finish = close(start);
        if (finish < 0 || finish > end) {
          valid = false;
          break;
        }
        branches.push(choiceText(value.slice(start, finish), depth + 1));
        position = finish + 1;
      }
      if (valid && branches.length) {
        result += value.slice(cursor, match.index) + branches.join(" ");
        cursor = end + 1;
      }
    }
    return result + value.slice(cursor);
  }
  function sourceMetrics(source, locale = "en", descriptor) {
    const projection = projectSource(descriptor?.literal ? source : choiceText(source), descriptor),
      linguistic = projection.text,
      text = linguistic.replaceAll("\0", " ");
    let words = 0,
      previous;
    for (const current of metricsSegmenter(locale, "word").segment(text)) {
      if (!current.isWordLike) continue;
      const between = previous && text.slice(previous.index + previous.segment.length, current.index);
      if (
        !previous ||
        !(
          /^[\u002d\u2010\u2011'\u2019]$/u.test(between) ||
          (/^[.,/:]$/u.test(between) && /^\p{N}+$/u.test(previous.segment) && /^\p{N}+$/u.test(current.segment))
        )
      )
        words++;
      previous = current;
    }
    const visible = linguistic.replaceAll("\0", "");
    let characters = 0,
      charactersWithoutWhitespace = 0;
    if (/^[\x00-\x7f]*$/.test(visible)) {
      characters = visible.length - (visible.match(/\r\n/g)?.length || 0);
      charactersWithoutWhitespace = visible.replace(/\s/g, "").length;
    } else {
      for (const { segment } of metricsSegmenter(locale, "grapheme").segment(visible)) {
        characters++;
        if (!/^\s+$/u.test(segment)) charactersWithoutWhitespace++;
      }
    }
    return {
      words,
      characters,
      charactersWithoutWhitespace,
      tags: projection.codes.length,
      countingComplete: projection.countingComplete !== false
    };
  }
  function remapTarget(stored, active, target, oldDescriptor, newDescriptor, targetDescriptor) {
    const old = projectSource(stored, oldDescriptor),
      next = projectSource(active, newDescriptor);
    const targetProjection = projectSource(target, targetDescriptor ?? oldDescriptor);
    if (
      old.known &&
      next.known &&
      targetProjection.known &&
      !old.codes.length &&
      !next.codes.length &&
      !targetProjection.codes.length
    )
      return target;
    if (!old.known || !next.known || old.canonical !== next.canonical) return;
    const mapping = /* @__PURE__ */ new Map();
    for (let i = 0; i < old.codes.length; i++) {
      const from = old.codes[i].token,
        to = next.codes[i].token;
      if (mapping.has(from) && mapping.get(from) !== to) return;
      mapping.set(from, to);
    }
    const targetCodes = targetProjection.codes;
    if (targetDescriptor) {
      const used = /* @__PURE__ */ new Set();
      const targetMapping = /* @__PURE__ */ new Map();
      for (const code of targetCodes) {
        const candidates = old.codes.filter(
          (source) =>
            source.kind === code.kind &&
            source.identity === code.identity &&
            (code.kind === "opaque" || source.pair === code.pair)
        );
        if (candidates.length !== 1 || used.has(candidates[0])) return;
        used.add(candidates[0]);
        const mapped = mapping.get(candidates[0].token);
        if (mapped === void 0) return;
        targetMapping.set(code.token, mapped);
      }
      mapping.clear();
      for (const [from, to] of targetMapping) mapping.set(from, to);
    }
    if (targetCodes.length !== old.codes.length || targetCodes.some((code) => !mapping.has(code.token))) return;
    if (!targetDescriptor) {
      for (const [token] of mapping)
        if (
          targetCodes.filter((code) => code.token === token).length !==
          old.codes.filter((code) => code.token === token).length
        )
          return;
    }
    const stack = [];
    for (const code of targetCodes) {
      if (code.kind === "open") stack.push(code.pair ?? code.identity);
      if (code.kind === "close" && stack.pop() !== (code.pair ?? code.identity)) return;
    }
    if (stack.length) return;
    return target.replace(markupTokens, (token) => mapping.get(token) ?? token);
  }
  function languageLocale(locale = "en") {
    try {
      return Intl.getCanonicalLocales(locale.replaceAll("_", "-"))[0] || "en";
    } catch {
      return "en";
    }
  }
  function segmenter(locale, granularity) {
    return metricsSegmenter(languageLocale(locale), granularity);
  }
  function normalizeResourceText(value, locale = "en") {
    return value.normalize("NFC").toLocaleLowerCase(languageLocale(locale)).replaceAll("\u03C2", "\u03C3");
  }
  // A batch repeatedly compares the same TM text. Cache only bounded, immutable
  // segmentation results; never cache scores or project/resource eligibility.
  const segmentationCache = new Map();
  let segmentationWeight = 0;
  function cachedSegmentation(value, locale, kind, create) {
    if (value.length > 4096) return create();
    const key = JSON.stringify([locale, kind, value]);
    const cached = segmentationCache.get(key);
    if (cached) {
      segmentationCache.delete(key);
      segmentationCache.set(key, cached);
      return cached.result;
    }
    const result = create();
    const weight = value.length + result.length + 1;
    segmentationCache.set(key, { result, weight });
    segmentationWeight += weight;
    while (segmentationWeight > 262144 || segmentationCache.size > 4096) {
      const oldest = segmentationCache.keys().next().value;
      segmentationWeight -= segmentationCache.get(oldest).weight;
      segmentationCache.delete(oldest);
    }
    return result;
  }
  function resourceWords(value, locale = "en") {
    return cachedSegmentation(value, locale, "word", () =>
      [...segmenter(locale, "word").segment(value)]
        .filter((part) => part.isWordLike)
        .map((part) => ({ text: part.segment, start: part.index, end: part.index + part.segment.length }))
    );
  }
  function containsTerm(text, term, locale) {
    const a = resourceWords(normalizeResourceText(text, locale), locale).map((x) => x.text),
      b = resourceWords(normalizeResourceText(term, locale), locale).map((x) => x.text);
    return b.length > 0 && a.some((_, i) => b.every((v, j) => v === a[i + j]));
  }
  function normalized(value, locale) {
    return normalizeResourceText(value, locale).replace(/\s+/gu, " ").trim();
  }
  function units(value, locale) {
    return cachedSegmentation(value, locale, "grapheme", () =>
      [...segmenter(locale, "grapheme").segment(value)].map((part) => part.segment)
    );
  }
  function editDistance(left, right) {
    if (left.length > right.length) return editDistance(right, left);
    let previous = new Uint32Array(left.length + 1);
    let current = new Uint32Array(left.length + 1);
    for (let i = 0; i <= left.length; i++) previous[i] = i;
    for (let j = 1; j <= right.length; j++) {
      current[0] = j;
      for (let i = 1; i <= left.length; i++)
        current[i] = Math.min(
          current[i - 1] + 1,
          previous[i] + 1,
          previous[i - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      [previous, current] = [current, previous];
    }
    return previous[left.length];
  }
  function sourceDifference(stored, active, locale = "en") {
    const a = [...segmenter(locale, "word").segment(stored)].map((part) => part.segment),
      b = [...segmenter(locale, "word").segment(active)].map((part) => part.segment);
    if (a.length * b.length > 4e4)
      return stored === active
        ? [{ kind: "equal", text: active }]
        : [
            { kind: "removed", text: stored },
            { kind: "added", text: active }
          ];
    const matrix = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i2 = a.length - 1; i2 >= 0; i2--)
      for (let j2 = b.length - 1; j2 >= 0; j2--)
        matrix[i2][j2] =
          a[i2] === b[j2] ? matrix[i2 + 1][j2 + 1] + 1 : Math.max(matrix[i2 + 1][j2], matrix[i2][j2 + 1]);
    const result = [];
    let i = 0,
      j = 0;
    const append = (kind, text) => {
      const last = result.at(-1);
      if (last?.kind === kind) last.text += text;
      else result.push({ kind, text });
    };
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        append("equal", a[i++]);
        j++;
      } else if (j < b.length && (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])) append("added", b[j++]);
      else append("removed", a[i++]);
    }
    return result;
  }
  function hasMatchingContext(stored, active) {
    const previous =
      (stored.previousBoundary === true && active.previousBoundary === true) ||
      (Boolean(stored.previousSource) &&
        active.previousSource !== void 0 &&
        stored.previousSource === active.previousSource);
    const next =
      (stored.nextBoundary === true && active.nextBoundary === true) ||
      (Boolean(stored.nextSource) && active.nextSource !== void 0 && stored.nextSource === active.nextSource);
    return previous && next && stored.documentKey !== void 0 && stored.documentKey === active.documentKey;
  }
  function scoreSource(stored, active, locale = "en", entryContext = {}, activeContext = {}, differences = true) {
    const old = projectSource(stored, entryContext.sourceDescriptor),
      current = projectSource(active, activeContext.sourceDescriptor);
    const canonical = old.known && current.known && old.canonical === current.canonical;
    const sameText = old.text.normalize("NFC") === current.text.normalize("NFC");
    const a = normalized(old.text, locale),
      b = normalized(current.text, locale);
    const opaqueA = old.codes.filter((code) => code.kind === "opaque"),
      opaqueB = current.codes.filter((code) => code.kind === "opaque");
    const opaqueSame =
      JSON.stringify(opaqueA.map((code) => [code.identity, code.offset])) ===
      JSON.stringify(opaqueB.map((code) => [code.identity, code.offset]));
    const atomic = (text, projection) => {
      let index = 0;
      const opaque = projection.codes.filter((code) => code.kind === "opaque");
      return units(text, locale).map((unit) => (unit === "\0" ? "PLACEHOLDER:" + opaque[index++]?.identity : unit));
    };
    let textScore,
      limited = false;
    if (sameText && opaqueSame) textScore = 100;
    else if (a === b && opaqueSame) textScore = 99;
    else {
      const charsA = atomic(a, old),
        charsB = atomic(b, current);
      if (charsA.length * charsB.length > 4e6) {
        limited = true;
        textScore = 0;
      } else {
        const characterScore = Math.max(
          0,
          1 - editDistance(charsA, charsB) / Math.max(1, charsA.length, charsB.length)
        );
        const wordsA = resourceWords(a, locale).map((part) => part.text),
          wordsB = resourceWords(b, locale).map((part) => part.text);
        const wordScore = Math.max(0, 1 - editDistance(wordsA, wordsB) / Math.max(1, wordsA.length, wordsB.length));
        textScore = Math.min(
          99,
          Math.round(
            100 *
              (wordsA.length === 1 && wordsB.length === 1 ? characterScore : characterScore * 0.75 + wordScore * 0.25)
          )
        );
      }
    }
    const known = old.known && current.known,
      formatDifference =
        JSON.stringify(
          old.codes
            .filter((code) => code.kind !== "opaque")
            .map((code) => [code.kind, code.identity, sameText ? code.offset : 0])
        ) !==
        JSON.stringify(
          current.codes
            .filter((code) => code.kind !== "opaque")
            .map((code) => [code.kind, code.identity, sameText ? code.offset : 0])
        );
    const adjustments = [];
    if (formatDifference) adjustments.push({ reason: "Formatting differs", points: 1 });
    if (!known && textScore === 100 && !formatDifference)
      adjustments.push({ reason: "Protected structure is unknown", points: 1 });
    const rawScore = Math.max(0, textScore - adjustments.reduce((sum, item) => sum + item.points, 0));
    const contextExact = rawScore === 100 && canonical && hasMatchingContext(entryContext, activeContext);
    const kind = contextExact
      ? "context-exact"
      : rawScore === 100 && canonical
        ? "exact"
        : a === b && opaqueSame
          ? "normalized"
          : containsTerm(current.text, old.text, locale)
            ? "subsegment"
            : "fuzzy";
    return {
      kind,
      rawScore,
      contextExact,
      sourceDiff: differences ? sourceDifference(stored, active, locale) : [],
      algorithmVersion: MATCHING_VERSION,
      textScore,
      limited,
      adjustments,
      compatibility: !known ? "unknown" : canonical ? (stored === active ? "identical" : "remappable") : "different",
      reuseEligibility: canonical
    };
  }
  function compareMatches(a, b, context = {}) {
    const review = (value) => (value.origin === "reviewed" ? 2 : value.origin === "confirmed" ? 1 : 0);
    const metadata = (value) =>
      Number(!!context.projectId && value.projectId === context.projectId) +
      Number(!!context.domain && value.domain === context.domain);
    return (
      (b.effectiveScore ?? b.score) - (a.effectiveScore ?? a.score) ||
      Number(!!b.contextExact) - Number(!!a.contextExact) ||
      review(b) - review(a) ||
      metadata(b) - metadata(a) ||
      (a.priority ?? 0) - (b.priority ?? 0) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id)
    );
  }

  // LoopCAT's source records retain their importer metadata. Unknown codes stay
  // conservative; literal source files must not accidentally become markup.
  function descriptorFor(record = {}) {
    if (record.sourceDescriptor) return record.sourceDescriptor;
    if (["txt", "text", "csv", "tsv", "md", "markdown"].includes(record.documentType))
      return { literal: true, codes: [] };
    const source = String(record.source || "");
    const inline = record.structure?.inlineTags || [];
    const stack = [];
    const codes = [];
    let serial = 0;
    for (const match of source.matchAll(markupTokens)) {
      const token = match[0],
        tagMatch = /^<\/?([A-Za-z][\w:.-]*)/u.exec(token);
      if (!tagMatch || token.endsWith("/>")) continue;
      const tag = tagMatch[1].toLowerCase();
      if ((!formatting.has(tag) && !blocks.has(tag) && !htmlInline.has(tag)) || voidTags.has(tag)) continue;
      const closing = token.startsWith("</");
      const id = /\bid=["']([^"']+)["']/.exec(token)?.[1];
      const info = inline.find((item) => item.id === id);
      const attributes = token
        .slice(tagMatch[0].length, -1)
        .replace(/\s+id=["'][^"']+["']/g, "")
        .trim();
      const opening = closing ? stack.pop() : null;
      const pair = closing ? opening?.pair : String(serial++);
      const identity = closing ? opening?.identity || tag : tag + ":" + (info?.rPrXml || attributes);
      const known = closing ? !!opening?.known && opening.tag === tag : (!id || !!info) && tag !== "g";
      const code = { token, kind: closing ? "close" : "open", identity, pair, known };
      if (!closing) stack.push({ ...code, tag });
      codes.push(code);
    }
    return { version: 1, codes };
  }
  function metricsForSegment(record = {}, locale = "en") {
    if (typeof record.source !== "string" && typeof record.source?.trim !== "function")
      return { words: 0, characters: 0, charactersWithoutWhitespace: 0, tags: 0, countingComplete: false };
    const source = typeof record.source === "string" ? record.source : record.source.trim();
    return sourceMetrics(source, locale, descriptorFor({ ...record, source }));
  }
  function projectionFor(record = {}) {
    return projectSource(String(record.source || ""), descriptorFor(record));
  }
  function lexicalKey(value) {
    return projectSource(String(value || ""))
      .text.normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
  function contextFor(segment, segments) {
    const rows = segments.filter((item) => item.documentId === segment.documentId);
    const index = rows.findIndex((item) => item.id === segment.id);
    return {
      sourceDescriptor: descriptorFor(segment),
      documentKey: segment.contextKey || `${segment.documentName || segment.documentId}#${segment.index ?? index}`,
      previousBoundary: index === 0,
      nextBoundary: index === rows.length - 1,
      previousSource: rows[index - 1]?.source,
      nextSource: rows[index + 1]?.source
    };
  }
  function contextsFor(segments) {
    const documents = new Map(),
      contexts = new Map();
    for (const segment of segments) {
      if (!documents.has(segment.documentId)) documents.set(segment.documentId, []);
      documents.get(segment.documentId).push(segment);
    }
    for (const rows of documents.values()) {
      rows.sort((a, b) => (a.index || 0) - (b.index || 0));
      rows.forEach((segment, index) =>
        contexts.set(segment.id, {
          sourceDescriptor: descriptorFor(segment),
          documentKey: segment.contextKey || `${segment.documentName || segment.documentId}#${segment.index ?? index}`,
          previousBoundary: index === 0,
          nextBoundary: index === rows.length - 1,
          previousSource: rows[index - 1]?.source,
          nextSource: rows[index + 1]?.source
        })
      );
    }
    return contexts;
  }
  function scoreEntries(entries, options = {}) {
    const source = String(options.source || ""),
      locale = options.sourceLang || "en";
    if (!source.trim()) return [];
    const links = new Map(
      (options.resourceLinks || [])
        .filter((x) => x.type === "tm" && x.lookup !== false)
        .map((x) => [x.resourceId || x.name, x])
    );
    if ("resourceLinks" in options && !links.size) return [];
    const names = new Set([...(options.tmNames || []), options.tmName].filter(Boolean));
    const byKey = new Map();
    let searchComplete = true;
    const alternatives = options.alternatives || new Map();
    if (!options.alternatives)
      for (const entry of entries || []) {
        const pair = entry.languagePair || `${entry.sourceLang}::${entry.targetLang}`;
        if (options.sourceLang && options.targetLang && pair !== `${options.sourceLang}::${options.targetLang}`)
          continue;
        if (!String(entry.target || "").trim()) continue;
        if (links.size ? !links.has(entry.resourceId || entry.tmName) : names.size && !names.has(entry.tmName))
          continue;
        const key = JSON.stringify([pair, entry.source]);
        if (!alternatives.has(key)) alternatives.set(key, new Set());
        alternatives.get(key).add(entry.target);
      }
    const activeContext = {
      ...options.context,
      sourceDescriptor:
        options.context?.sourceDescriptor || options.sourceDescriptor || descriptorFor(options.segment || { source })
    };
    for (const entry of entries || []) {
      const pair = entry.languagePair || `${entry.sourceLang}::${entry.targetLang}`;
      if (options.sourceLang && options.targetLang && pair !== `${options.sourceLang}::${options.targetLang}`) continue;
      if (!String(entry.target || "").trim()) continue;
      const link = links.get(entry.resourceId || entry.tmName);
      if (links.size ? !link : names.size && !names.has(entry.tmName)) continue;
      const descriptor = descriptorFor(entry);
      const result = scoreSource(
        String(entry.source || ""),
        source,
        locale,
        { ...entry, sourceDescriptor: descriptor },
        activeContext,
        false
      );
      if (result.limited) searchComplete = false;
      if (result.rawScore < (options.minimumScore ?? 45)) continue;
      const penalty = Math.max(0, Math.min(30, Math.round(Number(link?.penalty) || 0)));
      const ambiguityPenalty = alternatives.get(JSON.stringify([pair, entry.source]))?.size > 1 ? 1 : 0;
      let effectiveScore = Math.max(0, result.rawScore - penalty - ambiguityPenalty);
      const adaptedTarget = remapTarget(
        entry.source,
        source,
        entry.target,
        descriptor,
        activeContext.sourceDescriptor,
        entry.targetDescriptor
      );
      const unsafePenalty = adaptedTarget === undefined && effectiveScore === 100 ? 1 : 0;
      effectiveScore -= unsafePenalty;
      const scored = {
        ...entry,
        ...result,
        score: effectiveScore,
        effectiveScore,
        penalty,
        matchKind: result.contextExact && !penalty && !ambiguityPenalty ? "context-exact" : result.kind,
        adjustments: [
          ...result.adjustments,
          ...(penalty ? [{ reason: "TM resource penalty", points: penalty }] : []),
          ...(ambiguityPenalty ? [{ reason: "Multiple translations", points: ambiguityPenalty }] : []),
          ...(unsafePenalty ? [{ reason: "Target protected codes require review", points: unsafePenalty }] : [])
        ],
        resourceId: entry.resourceId || "",
        resourceName: entry.tmName || link?.cachedName || "",
        resourcePriority: Number.isFinite(link?.priority) ? link.priority : 999,
        safeToApply: adaptedTarget !== undefined,
        ...(adaptedTarget !== undefined && adaptedTarget !== entry.target
          ? { adaptedTarget, adaptation: { safe: true, target: adaptedTarget } }
          : {}),
        sourceDifferences: result.sourceDiff
          .filter((x) => x.kind !== "equal")
          .map((x) => ({ source: x.kind === "added" ? x.text : "", candidate: x.kind === "removed" ? x.text : "" })),
        provenance: [
          {
            resourceId: entry.resourceId || "",
            resourceName: entry.tmName || "",
            projectName: entry.projectName || "",
            updatedAt: entry.updatedAt || ""
          }
        ]
      };
      const key = JSON.stringify([pair, entry.source, entry.target]);
      const previous = byKey.get(key);
      if (previous) {
        const provenance = [...previous.provenance, ...scored.provenance].filter(
          (p, i, all) => all.findIndex((x) => x.resourceId === p.resourceId && x.resourceName === p.resourceName) === i
        );
        const winner = rankScoredEntries(scored, previous) < 0 ? scored : previous;
        winner.provenance = provenance;
        byKey.set(key, winner);
      } else byKey.set(key, scored);
    }
    return [...byKey.values()]
      .map((match) => ({ ...match, searchComplete }))
      .sort(rankScoredEntries)
      .slice(0, options.limit ?? 6)
      .map((match) => {
        // Only displayed matches need the word-level diff. Ranking every
        // candidate first keeps scoring identical while avoiding discarded work.
        const sourceDiff = options.differences === false ? [] : sourceDifference(match.source, source, locale);
        return {
          ...match,
          sourceDiff,
          sourceDifferences: sourceDiff
            .filter((item) => item.kind !== "equal")
            .map((item) => ({
              source: item.kind === "added" ? item.text : "",
              candidate: item.kind === "removed" ? item.text : ""
            }))
        };
      });
  }
  function rankScoredEntries(a, b) {
    return (
      b.effectiveScore - a.effectiveScore ||
      Number(b.contextExact) - Number(a.contextExact) ||
      a.resourcePriority - b.resourcePriority ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) ||
      String(a.id || "").localeCompare(String(b.id || ""))
    );
  }
  function retrievalTokens(source) {
    const key = lexicalKey(source);
    const words = resourceWords(key, "und").map((x) => x.text);
    const characters = [...key];
    const grams = characters.slice(0, -1).map((c, i) => "~" + c + characters[i + 1]);
    return [...new Set(["=" + key, ...words, ...grams])];
  }
  function createSearchIndex(entries) {
    let byToken;
    const sameProjection = new Map(),
      sameSource = new Map();
    function include(map, key, index) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(index);
    }
    entries.forEach((entry, index) => {
      const projection = projectionFor(entry);
      if (projection.known) include(sameProjection, projection.canonical, index);
      include(sameSource, entry.source, index);
    });
    const search = (source, maximum = 2000) => {
      if (entries.length <= maximum) return { entries, complete: true };
      if (!byToken) {
        byToken = new Map();
        entries.forEach((entry, index) => {
          for (const token of retrievalTokens(entry.source)) include(byToken, token, index);
        });
      }
      const hits = new Map();
      for (const token of retrievalTokens(source))
        for (const index of byToken.get(token) || [])
          hits.set(index, (hits.get(index) || 0) + (token.startsWith("=") ? 100000 : 1));
      const indices = [...hits]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maximum)
        .map((x) => x[0]);
      // The indexed search is heuristic. Never certify a negative/fuzzy result
      // from a bounded search as exhaustive; an eligible exact match is decisive.
      return { entries: indices.map((i) => entries[i]), complete: indices.length === entries.length };
    };
    // Score every entry that can attain 100% and every translation of its raw
    // source (ambiguity penalty). A safe, unpenalized 100% then wins globally,
    // including all context and priority ties, without running fuzzy search.
    search.exactCandidates = (projection) => {
      const exact = projection.known ? sameProjection.get(projection.canonical) : null;
      if (!exact) return [];
      const sourceValues = new Set(exact.map((i) => entries[i].source));
      return [...sourceValues].flatMap((value) => sameSource.get(value).map((i) => entries[i]));
    };
    return search;
  }
  function isPreservedXliffLayout(segment) {
    const kind = segment?.structure?.xliffPart?.kind;
    return (
      (kind === "blank" || kind === "markup") &&
      String(segment.source ?? segment.text ?? "").trim() === String(segment.target ?? "").trim()
    );
  }

  globalThis.LoopCATLinguistics = Object.freeze({
    isPreservedXliffLayout,
    COUNTING_VERSION,
    MATCHING_VERSION,
    projectSource,
    sourceMetrics,
    metricsForSegment,
    descriptorFor,
    projectionFor,
    lexicalKey,
    contextFor,
    contextsFor,
    scoreSource,
    scoreEntries,
    rankScoredEntries,
    remapTarget,
    resourceWords,
    retrievalTokens,
    createSearchIndex
  });
})();
