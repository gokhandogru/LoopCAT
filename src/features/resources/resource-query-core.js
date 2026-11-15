const textOf = (value) => String(value ?? "").normalize("NFC");
const sourceOf = (row, type) => textOf(type === "tm" ? row.source : row.sourceTerm);
const targetOf = (row, type) => textOf(type === "tm" ? row.target : row.targetTerm);

export function resourceEntryStatus(row) {
  return row.isForbidden ? "forbidden" : row.status || "preferred";
}

// Case and whitespace are deliberately significant here: similar translations
// are candidates for review, never permission to discard linguistic variants.
export function resourcePairKey(row, type) {
  return JSON.stringify([
    row.sourceLang || "",
    row.targetLang || "",
    sourceOf(row, type),
    targetOf(row, type),
    ...(type === "tm"
      ? [
          row.domain || "",
          row.projectName || "",
          row.documentKey || "",
          row.documentName || "",
          row.previousSource || "",
          row.nextSource || "",
          Boolean(row.previousBoundary),
          Boolean(row.nextBoundary)
        ]
      : [
          row.domain || "",
          row.subject || "",
          row.definition || "",
          resourceEntryStatus(row),
          row.notes || "",
          row.partOfSpeech || "",
          row.usageExample || "",
          row.caseSensitivity || "insensitive",
          row.matchMode || "exact",
          row.matchMode === "fuzzy" ? row.fuzzyThreshold || 85 : ""
        ])
  ]);
}

export function resourceSourceKey(row, type) {
  return JSON.stringify([
    row.sourceLang || "",
    row.targetLang || "",
    sourceOf(row, type),
    row.domain || "",
    ...(type === "tm" ? [] : [row.subject || "", row.definition || ""])
  ]);
}

export function normalizeResourceQuery(input = {}) {
  const value = /** @type {any} */ (input);
  const type = value.type === "tm" ? "tm" : "tb";
  const query = value.query || {};
  const filters = value.filters || {};
  const fields = new Set(["source", "target", "updatedAt", "createdAt", "status", "domain", "projectName"]);
  return {
    type,
    resourceId: String(value.resourceId || ""),
    query: {
      text: textOf(query.text),
      field: ["source", "target"].includes(query.field) ? query.field : "both",
      mode: query.mode === "exact" ? "exact" : "contains",
      caseSensitive: Boolean(query.caseSensitive)
    },
    filters: {
      status: String(filters.status || ""),
      domain: String(filters.domain || ""),
      projectName: String(filters.projectName || ""),
      dateFrom: String(filters.dateFrom || ""),
      dateTo: String(filters.dateTo || ""),
      duplicates: filters.duplicates === true ? "exact" : String(filters.duplicates || "")
    },
    sort: {
      field: fields.has(value.sort?.field) ? value.sort.field : "source",
      direction: value.sort?.direction === "desc" ? "desc" : "asc"
    }
  };
}

function folded(value, language, caseSensitive = false) {
  const text = textOf(value);
  if (caseSensitive) return text;
  try {
    return text.toLocaleLowerCase(language || undefined);
  } catch {
    return text.toLowerCase();
  }
}

/** Filter and sort only inside a worker (also exported for deterministic tests). */
export async function selectResourceEntries(rows, input, options = {}) {
  const { type, query, filters, sort } = normalizeResourceQuery(input);
  const { yieldFn = () => Promise.resolve(), cancelled = () => false } = /** @type {any} */ (options);
  const assertActive = () => {
    if (cancelled()) throw new DOMException("Resource query cancelled", "AbortError");
  };
  assertActive();
  const pairs = new Map();
  const sources = new Map();
  if (filters.duplicates) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const key = resourcePairKey(row, type);
      pairs.set(key, (pairs.get(key) || 0) + 1);
      const sourceKey = resourceSourceKey(row, type);
      if (!sources.has(sourceKey)) sources.set(sourceKey, new Set());
      sources.get(sourceKey).add(targetOf(row, type));
      if (index % 1024 === 0) {
        await yieldFn();
        assertActive();
      }
    }
  }
  const hasFilters =
    query.text ||
    (filters.status && filters.status !== "all") ||
    filters.domain ||
    filters.projectName ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.duplicates;
  const matches = hasFilters ? [] : rows.slice();
  const domain = folded(filters.domain);
  const projectName = folded(filters.projectName);
  const needles = new Map();
  const matchesText = (value, language) => {
    if (!needles.has(language)) needles.set(language, folded(query.text, language, query.caseSensitive));
    const haystack = folded(value, language, query.caseSensitive);
    const needle = needles.get(language);
    return query.mode === "exact" ? haystack === needle : haystack.includes(needle);
  };
  const toDate = (value) => value && Date.parse(value);
  const from = toDate(filters.dateFrom);
  const until = toDate(filters.dateTo.length === 10 ? `${filters.dateTo}T23:59:59.999Z` : filters.dateTo);
  for (let index = 0; hasFilters && index < rows.length; index += 1) {
    const row = rows[index];
    if (index % 1024 === 0) {
      await yieldFn();
      assertActive();
    }
    if (filters.status && filters.status !== "all" && resourceEntryStatus(row) !== filters.status) continue;
    if (domain && !folded(row.domain).includes(domain)) continue;
    if (projectName && !folded(row.projectName).includes(projectName)) continue;
    const date = from || until ? Date.parse(row.updatedAt || row.createdAt || "") : 0;
    if (from && (!Number.isFinite(date) || date < from)) continue;
    if (until && (!Number.isFinite(date) || date > until)) continue;
    if (query.text) {
      const sourceMatch =
        query.field !== "target" && matchesText(type === "tm" ? row.source : row.sourceTerm, row.sourceLang);
      const targetMatch =
        !sourceMatch &&
        query.field !== "source" &&
        matchesText(type === "tm" ? row.target : row.targetTerm, row.targetLang);
      if (!sourceMatch && !targetMatch) continue;
    }
    if (filters.duplicates) {
      const exact = pairs.get(resourcePairKey(row, type)) > 1;
      const alternatives = sources.get(resourceSourceKey(row, type))?.size > 1;
      if (filters.duplicates === "exact" && !exact) continue;
      if (["alternatives", "conflicts"].includes(filters.duplicates) && !alternatives) continue;
      if (filters.duplicates === "all" && !exact && !alternatives) continue;
    }
    matches.push(row);
  }
  const fieldValue = (row) =>
    sort.field === "source"
      ? sourceOf(row, type)
      : sort.field === "target"
        ? targetOf(row, type)
        : sort.field === "status"
          ? resourceEntryStatus(row)
          : textOf(row[sort.field]);
  const language = rows[0]?.[sort.field === "target" ? "targetLang" : "sourceLang"];
  let collator;
  try {
    collator = new Intl.Collator(language || undefined, { numeric: true });
  } catch {
    collator = new Intl.Collator(undefined, { numeric: true });
  }
  const direction = sort.direction === "desc" ? -1 : 1;
  // Decorate once: map lookups and repeated normalization in a comparator
  // multiply into millions of calls for large memories.
  const decorated = new Array(matches.length);
  for (let index = 0; index < matches.length; index += 1) {
    const row = matches[index];
    decorated[index] = { row, value: fieldValue(row), id: String(row.id) };
    if (index % 4096 === 0) {
      await yieldFn();
      assertActive();
    }
  }
  decorated.sort(
    (left, right) => direction * collator.compare(left.value, right.value) || collator.compare(left.id, right.id)
  );
  for (let index = 0; index < decorated.length; index += 1) matches[index] = decorated[index].row;
  assertActive();
  return matches;
}

export function pageResourceEntries(rows, input, generation) {
  const normalized = normalizeResourceQuery(input);
  const fingerprint = JSON.stringify(normalized);
  const limit = Math.max(1, Math.min(1000, Number(input.limit) || 100));
  let offset = 0;
  let cursorReset = false;
  if (input.cursor) {
    try {
      const cursor = JSON.parse(input.cursor);
      if (
        cursor.generation !== generation ||
        cursor.query !== fingerprint ||
        !Number.isSafeInteger(cursor.offset) ||
        cursor.offset < 0
      )
        cursorReset = true;
      else offset = cursor.offset;
    } catch {
      cursorReset = true;
    }
  }
  if (typeof input.anchorId === "string") {
    const anchor = rows.findIndex((row) => row.id === input.anchorId);
    if (anchor >= 0) offset = Math.floor(anchor / limit) * limit;
  }
  if (offset >= rows.length) offset = Math.max(0, Math.ceil(rows.length / limit) - 1) * limit;
  const cursorAt = (position) => JSON.stringify({ generation, query: fingerprint, offset: position });
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    cursor: cursorAt(offset),
    pageIndex: Math.floor(offset / limit),
    previousCursor: offset ? cursorAt(Math.max(0, offset - limit)) : null,
    nextCursor: offset + limit < rows.length ? cursorAt(offset + limit) : null,
    generation,
    cursorReset
  };
}
