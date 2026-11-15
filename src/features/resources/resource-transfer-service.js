import { resourcePairKey, resourceSourceKey } from "./resource-query-core.js";

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const pause = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
const clean = (value) => String(value ?? "").trim();
const normalizedHeader = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[\s_-]/g, "");
const FIELD_ALIASES = {
  source: ["source", "sourceterm", "src", "term"],
  target: ["target", "targetterm", "translation", "tgt", "preferredterm", "approvedterm"],
  notes: ["note", "notes", "comment", "comments"],
  status: ["status", "termstatus", "forbidden", "isforbidden"],
  definition: ["definition"],
  domain: ["domain"],
  subject: ["subject", "subjectfield"],
  partOfSpeech: ["partofspeech", "pos"],
  usageExample: ["usageexample", "example", "context"],
  caseSensitivity: ["casesensitivity"],
  matchMode: ["matchmode"],
  fuzzyThreshold: ["fuzzythreshold"]
};

export function readDelimitedResourceRows(text, fileName = "") {
  const firstLine = String(text).split(/\r?\n/, 1)[0];
  const delimiter =
    /\.tsv$/i.test(fileName) || firstLine.includes("\t")
      ? "\t"
      : (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0)
        ? ";"
        : ",";
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (quoted || !value.length) quoted = !quoted;
      else value += char;
    } else if (!quoted && char === delimiter) {
      row.push(value);
      value = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("The term list contains an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => clean(cell))) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function xmlDocument(text, label) {
  if (/<!DOCTYPE/i.test(text)) throw new Error(`${label} must not contain a document type declaration.`);
  const host = /** @type {any} */ (globalThis);
  const trusted = host.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const document = new DOMParser().parseFromString(trusted, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`Could not parse ${label}.`);
  return document;
}

function decodeWorkbookText(value) {
  return String(value || "").replace(/_x([0-9a-f]{4})_/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function workbookStringText(element) {
  const children = Array.from(element?.children || []);
  const text =
    children
      .filter((child) => child.localName === "t")
      .map((child) => child.textContent || "")
      .join("") ||
    children
      .filter((child) => child.localName === "r")
      .map((run) =>
        Array.from(run.children)
          .filter((child) => child.localName === "t")
          .map((child) => child.textContent || "")
          .join("")
      )
      .join("");
  return decodeWorkbookText(text);
}

function workbookPartPath(target) {
  if (!target || target.includes("\\") || target.split("/").includes(".."))
    throw new Error("The worksheet path is invalid.");
  return target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`;
}

async function readWorkbookRows(file) {
  const { readEntries } = await import("../import-export/archive-adapter.js");
  const entries = await readEntries(await file.arrayBuffer(), { maxBytes: MAX_FILE_BYTES });
  const decoder = new TextDecoder();
  const content = (path) => (entries.has(path) ? decoder.decode(entries.get(path).data) : "");
  const workbook = xmlDocument(content("xl/workbook.xml"), "Excel workbook");
  const relationships = xmlDocument(content("xl/_rels/workbook.xml.rels"), "Excel workbook relationships");
  const first = workbook.getElementsByTagNameNS("*", "sheet")[0];
  if (!first) throw new Error("No worksheet was found in the Excel workbook.");
  const relationId = Array.from(first.attributes).find((attribute) => attribute.localName === "id")?.value;
  const relation = Array.from(relationships.getElementsByTagNameNS("*", "Relationship")).find(
    (item) => item.getAttribute("Id") === relationId
  );
  if (!relation || relation.getAttribute("TargetMode") === "External")
    throw new Error("The first worksheet is not stored in the workbook.");
  const target = relation.getAttribute("Target") || "";
  const path = workbookPartPath(target);
  if (!entries.has(path)) throw new Error("The first worksheet could not be read.");
  const sharedRelation = Array.from(relationships.getElementsByTagNameNS("*", "Relationship")).find(
    (item) => item.getAttribute("TargetMode") !== "External" && /\/sharedStrings$/.test(item.getAttribute("Type") || "")
  );
  const sharedText = content(
    sharedRelation ? workbookPartPath(sharedRelation.getAttribute("Target")) : "xl/sharedStrings.xml"
  );
  const shared = sharedText
    ? Array.from(xmlDocument(sharedText, "Excel shared strings").getElementsByTagNameNS("*", "si"), workbookStringText)
    : [];
  const sheet = xmlDocument(content(path), "Excel worksheet");
  const rows = [];
  for (const rowElement of Array.from(sheet.getElementsByTagNameNS("*", "row"))) {
    const row = [];
    for (const cell of Array.from(rowElement.getElementsByTagNameNS("*", "c"))) {
      const letters = cell.getAttribute("r")?.match(/^[A-Z]+/i)?.[0];
      const index = letters
        ? Array.from(letters.toUpperCase()).reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1
        : row.length;
      if (index > 16383) throw new Error("The worksheet contains an invalid column reference.");
      if (cell.getElementsByTagNameNS("*", "f").length) {
        row[index] = "";
        continue;
      }
      const value = cell.getElementsByTagNameNS("*", "v")[0]?.textContent || "";
      if (cell.getAttribute("t") === "s" && (!/^\d+$/.test(value.trim()) || Number(value) >= shared.length))
        throw new Error("Excel cell has an invalid shared-string reference.");
      row[index] =
        cell.getAttribute("t") === "s"
          ? shared[Number(value)]
          : cell.getAttribute("t") === "inlineStr"
            ? workbookStringText(cell.getElementsByTagNameNS("*", "is")[0])
            : decodeWorkbookText(value);
    }
    if (row.some((cell) => clean(cell))) rows.push(row);
  }
  return { rows, sheetName: first.getAttribute("name") || "" };
}

function inferredMapping(rows, options) {
  const header = rows[0] || [];
  const result = /** @type {any} */ ({});
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const names = [
      ...aliases,
      ...(field === "source" ? [options.sourceLang] : field === "target" ? [options.targetLang] : [])
    ]
      .filter(Boolean)
      .map(normalizedHeader);
    result[field] = header.findIndex((value) => names.includes(normalizedHeader(value)));
  }
  result.hasHeader = result.source >= 0 && result.target >= 0;
  if (!result.hasHeader)
    Object.assign(result, {
      source: 0,
      target: 1,
      notes: header.length > 2 ? 2 : -1,
      status: header.length > 3 ? 3 : -1
    });
  return { ...result, ...options.mapping };
}

async function textFile(file) {
  if (typeof file.arrayBuffer !== "function") return file.text();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const encoding =
    bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding).decode(buffer);
}

function xmlLanguages(text) {
  return [
    ...new Set(
      Array.from(text.matchAll(/(?:xml:lang|\blang)\s*=\s*["']([^"']+)["']/gi), (match) => match[1]).filter(
        (language) => language !== "*all*"
      )
    )
  ];
}

function selectedLanguageUnits(text, format, sourceLang, targetLang) {
  const names = format === "tmx" ? "tu" : "termEntry|conceptEntry";
  const blocks = new RegExp(`<((?:[\\w.-]+:)?(?:${names}))\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  const canonical = (language) => clean(language).replaceAll("_", "-").toLowerCase();
  let total = 0;
  const filtered = text.replace(blocks, (block) => {
    total += 1;
    const languages = xmlLanguages(block).map(canonical);
    const source = canonical(sourceLang),
      target = canonical(targetLang);
    const pick = (expected, excluded = -1) => {
      const exact = languages.findIndex((language, index) => index !== excluded && language === expected);
      return exact >= 0
        ? exact
        : languages.findIndex(
            (language, index) => index !== excluded && language.split("-")[0] === expected.split("-")[0]
          );
    };
    const sourceIndex = pick(source);
    return sourceIndex >= 0 && pick(target, sourceIndex) >= 0 ? block : "";
  });
  return { text: filtered, total };
}

function duplicateSummary(rows, existing, type, preserveConcepts = false) {
  const pairs = new Set(existing.map((row) => resourcePairKey(row, type)));
  const concepts = new Map();
  const sources = new Map();
  for (const row of existing) {
    const pair = resourcePairKey(row, type);
    if (!concepts.has(pair)) concepts.set(pair, new Set());
    concepts.get(pair).add(row.conceptId || "");
    const source = resourceSourceKey(row, type);
    if (!sources.has(source)) sources.set(source, new Set());
    sources.get(source).add(type === "tm" ? row.target : row.targetTerm);
  }
  let exact = 0,
    alternatives = 0;
  const unique = [];
  for (const row of rows) {
    const pair = resourcePairKey(row, type);
    const source = resourceSourceKey(row, type);
    const target = type === "tm" ? row.target : row.targetTerm;
    const distinctConcept =
      type === "tb" &&
      preserveConcepts &&
      row.conceptId &&
      concepts.has(pair) &&
      !concepts.get(pair).has(row.conceptId);
    if (pairs.has(pair) && !distinctConcept) {
      exact += 1;
      continue;
    }
    if (sources.has(source) && !sources.get(source).has(target)) alternatives += 1;
    pairs.add(pair);
    if (!concepts.has(pair)) concepts.set(pair, new Set());
    concepts.get(pair).add(row.conceptId || "");
    if (!sources.has(source)) sources.set(source, new Set());
    sources.get(source).add(target);
    unique.push(row);
  }
  return { exact, alternatives, unique };
}

/** @param {{storage:any,tm:any,termbase:any,tmx:any,tbx:any,project:any}} dependencies */
export function createResourceTransferService({ storage, tm, termbase, tmx, tbx, project }) {
  if (!storage?.get || !storage?.getAllByIndex || !project?.createResource)
    throw new TypeError("Resource transfer requires storage and resource creation.");
  const originals = new WeakMap();
  const committed = new WeakSet();
  const readExisting = (type, resourceId) =>
    resourceId
      ? storage.getAllByIndex(type === "tm" ? "tmEntries" : "terms", "resourceId", resourceId)
      : Promise.resolve([]);

  async function prepareImport(file, input = {}) {
    const options = /** @type {any} */ (input);
    if (!file || Number(file.size) > MAX_FILE_BYTES) throw new Error("Choose a resource file smaller than 150 MB.");
    const type = options.type === "tm" ? "tm" : "tb";
    const resource = options.resourceId ? await storage.get("resources", options.resourceId) : null;
    if (options.resourceId && !resource) throw new Error("The destination resource no longer exists.");
    if (resource && resource.type !== (type === "tm" ? "tm" : "termbase"))
      throw new Error("The destination resource has the wrong type.");
    if (resource?.archived) throw new Error("Restore this resource before importing entries.");
    const fileName = String(file.name || "resource");
    const extension = fileName.split(".").at(-1).toLowerCase();
    const format =
      type === "tm"
        ? "tmx"
        : extension === "xlsx"
          ? "xlsx"
          : extension === "tbx"
            ? "tbx"
            : extension === "tsv"
              ? "tsv"
              : "csv";
    if (
      (type === "tm" && extension !== "tmx") ||
      (type === "tb" && !["tbx", "xlsx", "csv", "tsv", "txt"].includes(extension))
    )
      throw new Error(
        type === "tm" ? "Choose a TMX translation-memory file." : "Choose a TBX, CSV, TSV or XLSX termbase file."
      );
    const source = format === "xlsx" ? "" : await textFile(file);
    const detectedLanguages = ["tmx", "tbx"].includes(format) ? xmlLanguages(source) : [];
    const sourceLang = clean(resource?.sourceLang || options.sourceLang || detectedLanguages[0]);
    const targetLang = clean(
      resource?.targetLang || options.targetLang || detectedLanguages.find((language) => language !== sourceLang)
    );
    const name = clean(resource?.name || options.name || fileName.replace(/\.[^.]+$/, ""));
    const validation = { errors: [], warnings: [], invalidRows: [] };
    if (!sourceLang || !targetLang) validation.errors.push("Choose source and target languages before importing.");
    let invalidCount = 0;
    let rows = [],
      columns = [],
      mapping = null,
      sheetName = "",
      rawRows = [];
    if (["csv", "tsv", "xlsx"].includes(format)) {
      if (format === "xlsx") {
        const workbook = await readWorkbookRows(file);
        rawRows = workbook.rows;
        sheetName = workbook.sheetName;
        validation.warnings.push("The first worksheet is used. Formula cells are not imported.");
      } else rawRows = readDelimitedResourceRows(source, fileName);
      mapping = inferredMapping(rawRows, { sourceLang, targetLang, mapping: options.mapping });
      const width = rawRows.reduce((max, row) => Math.max(max, row.length), 0);
      columns = Array.from({ length: width }, (_, index) => ({
        index,
        label: mapping.hasHeader ? clean(rawRows[0]?.[index]) || `Column ${index + 1}` : `Column ${index + 1}`
      }));
      if (
        !Number.isInteger(mapping.source) ||
        !Number.isInteger(mapping.target) ||
        mapping.source < 0 ||
        mapping.target < 0 ||
        mapping.source >= width ||
        mapping.target >= width ||
        mapping.source === mapping.target
      )
        validation.errors.push("Choose different source and target columns.");
      if (!validation.errors.length) {
        const data = rawRows.slice(mapping.hasHeader ? 1 : 0);
        const valid = [];
        for (let index = 0; index < data.length; index += 1) {
          const row = data[index];
          if (!clean(row[mapping.source]) || !clean(row[mapping.target])) {
            validation.invalidRows.push({
              row: index + (mapping.hasHeader ? 2 : 1),
              reason: "Missing source or target term"
            });
            continue;
          }
          valid.push(row);
        }
        if (valid.length) {
          const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
          const canonical = [
            "source\ttarget\tnotes\tstatus",
            ...valid.map((row) =>
              [row[mapping.source], row[mapping.target], row[mapping.notes] || "", row[mapping.status] || ""]
                .map(quote)
                .join("\t")
            )
          ].join("\n");
          rows = await termbase.parseTermList(canonical, {
            sourceLang,
            targetLang,
            termBaseName: name,
            fileName: "mapped.tsv"
          });
          rows = rows.map((term, index) => {
            const raw = valid[index];
            const metadata = Object.fromEntries(
              Object.keys(FIELD_ALIASES)
                .filter((field) => !["source", "target", "notes", "status"].includes(field) && mapping[field] >= 0)
                .map((field) => [field, clean(raw[mapping[field]])])
            );
            const status = clean(raw[mapping.status]).toLowerCase();
            return { ...term, ...metadata, ...(status === "admitted" ? { status, isForbidden: false } : {}) };
          });
        }
      }
      invalidCount = validation.invalidRows.length;
    } else if (!validation.errors.length) {
      const units = selectedLanguageUnits(source, format, sourceLang, targetLang);
      if (format === "tmx")
        rows = await (tmx.parseTmxAsync || tmx.parseTmx)(
          units.text,
          { sourceLang, targetLang, tmName: name, projectName: "Resources import" },
          { yieldFn: pause }
        );
      else
        rows = await (tbx.parseTbxAsync || tbx.parseTbx)(
          units.text,
          { sourceLang, targetLang, termBaseName: name },
          { yieldFn: pause }
        );
      invalidCount = Math.max(0, units.total - rows.length);
      if (invalidCount)
        validation.invalidRows.push({
          count: invalidCount,
          reason: "Entries without both selected language texts were skipped."
        });
    }
    if (!rows.length && !validation.errors.length)
      validation.errors.push("No valid entries were found for the selected languages and columns.");
    const existing = await readExisting(type, resource?.id);
    const duplicates = duplicateSummary(rows, existing, type, format === "tbx");
    if (detectedLanguages.length > 2)
      validation.warnings.push(
        "Only the selected language pair will be imported; the other languages are kept in your original file."
      );
    const preview = {
      type,
      resourceId: resource?.id || "",
      name,
      sourceLang,
      targetLang,
      detectedLanguages,
      fileName,
      format,
      sheetName,
      rows,
      sampleRows: rows.slice(0, 10),
      rawSampleRows: rawRows.slice(0, 6),
      columns,
      mapping,
      validation,
      duplicates: { exact: duplicates.exact, alternatives: duplicates.alternatives },
      total: rows.length + invalidCount,
      valid: rows.length,
      invalid: invalidCount
    };
    originals.set(preview, structuredClone(preview));
    return preview;
  }

  async function commitImport(preview, options = {}) {
    const { signal, onProgress } = /** @type {any} */ (options);
    const original = originals.get(preview);
    if (!original || committed.has(preview)) throw new Error("Prepare a new import preview before importing.");
    if (original.validation.errors.length) throw new Error(original.validation.errors.join(" "));
    signal?.throwIfAborted();
    let resource = original.resourceId ? await storage.get("resources", original.resourceId) : null;
    if (original.resourceId && (!resource || resource.archived))
      throw new Error("The destination was removed or archived. Prepare the import again.");
    if (resource && (resource.sourceLang !== original.sourceLang || resource.targetLang !== original.targetLang))
      throw new Error("The destination languages changed. Prepare the import again.");
    const duplicateCheck = duplicateSummary(
      original.rows,
      await readExisting(original.type, resource?.id),
      original.type,
      original.format === "tbx"
    );
    signal?.throwIfAborted();
    if (!resource)
      resource = await project.createResource({
        type: original.type === "tm" ? "tm" : "termbase",
        name: original.name,
        sourceLang: original.sourceLang,
        targetLang: original.targetLang,
        languages: [original.sourceLang, original.targetLang]
      });
    committed.add(preview);
    const result = {
      resource,
      imported: 0,
      skipped: duplicateCheck.exact,
      invalid: original.invalid,
      alternatives: duplicateCheck.alternatives,
      cancelled: false,
      errors: []
    };
    const concepts = new Map();
    const makeId = (prefix) => storage.makeId?.(prefix) || `${prefix}-${crypto.randomUUID()}`;
    for (let offset = 0; offset < duplicateCheck.unique.length; offset += 100) {
      if (signal?.aborted) {
        result.cancelled = true;
        break;
      }
      const batch = duplicateCheck.unique.slice(offset, offset + 100).map((row) => {
        const entry = {
          ...row,
          id: makeId(original.type === "tm" ? "tm" : "term"),
          resourceId: resource.id,
          sourceLang: resource.sourceLang,
          targetLang: resource.targetLang,
          ...(original.type === "tm" ? { tmName: resource.name, isSeeded: true } : { termBaseName: resource.name })
        };
        delete entry.storageVersion;
        delete entry.storageWriter;
        delete entry.storageGeneration;
        if (original.type === "tb") {
          const concept = row.conceptId || row.id || entry.id;
          if (!concepts.has(concept)) concepts.set(concept, makeId("concept"));
          entry.conceptId = concepts.get(concept);
          entry.sourceDesignationId = makeId("term-designation");
          entry.targetDesignationId = makeId("term-designation");
        }
        return entry;
      });
      try {
        if (original.type === "tm") {
          // The legacy TM importer folds text within each call. Separate only
          // collisions so case/spacing variants remain distinct reviewed units.
          const groups = [];
          const keys = [];
          for (const entry of batch) {
            const normalize = tm.normalizeText || ((text) => clean(text).toLowerCase());
            const key = JSON.stringify([normalize(entry.source), normalize(entry.target)]);
            let index = keys.findIndex((seen) => !seen.has(key));
            if (index < 0) {
              index = groups.length;
              groups.push([]);
              keys.push(new Set());
            }
            keys[index].add(key);
            groups[index].push(entry);
          }
          for (const group of groups) {
            const count = await tm.importTmEntries(group);
            result.imported += typeof count === "number" ? count : group.length;
          }
        } else {
          const count = await termbase.importTerms(batch);
          result.imported += typeof count === "number" ? count : batch.length;
        }
      } catch (error) {
        result.errors.push(error.message || String(error));
        // A legacy importer can commit records before index maintenance fails.
        // Recount persisted identities so the report never labels them unsaved.
        const persisted = await Promise.all(
          batch.map((entry) => storage.get(original.type === "tm" ? "tmEntries" : "terms", entry.id))
        );
        const completedBeforeBatch = offset;
        result.imported = completedBeforeBatch + persisted.filter(Boolean).length;
        break;
      }
      await onProgress?.({ saved: result.imported, total: duplicateCheck.unique.length, skipped: result.skipped });
      await pause();
    }
    return result;
  }

  function exportEntries(type, resource, entries, format = type === "tm" ? "tmx" : "tbx") {
    if (!Array.isArray(entries)) throw new TypeError("Choose committed entries to export.");
    if (!resource?.sourceLang || !resource?.targetLang) throw new Error("Resource languages are required for export.");
    const name =
      clean(resource.name || "resource")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/[. ]+$/, "") || "resource";
    const stem = `${name}_${resource.sourceLang}-${resource.targetLang}`;
    if (type === "tm" && format === "tmx")
      return {
        filename: `${stem}.tmx`,
        content: tmx.buildTmx(entries, { ...resource, tmName: resource.name }),
        mimeType: "application/xml"
      };
    if (type !== "tm" && format === "tbx")
      return {
        filename: `${stem}.tbx`,
        content: tbx.buildTbx(entries, { ...resource, termBaseName: resource.name }),
        mimeType: "application/xml"
      };
    if (format === "csv" || format === "tsv") {
      const fields =
        type === "tm"
          ? ["source", "target", "sourceLang", "targetLang", "projectName", "domain", "createdAt", "updatedAt"]
          : [
              "sourceTerm",
              "targetTerm",
              "sourceLang",
              "targetLang",
              "notes",
              "status",
              "definition",
              "domain",
              "subject",
              "partOfSpeech",
              "usageExample",
              "caseSensitivity",
              "matchMode",
              "fuzzyThreshold"
            ];
      const delimiter = format === "tsv" ? "\t" : ",";
      const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      return {
        filename: `${stem}.${format}`,
        content:
          "\uFEFF" +
          [
            fields,
            ...entries.map((row) =>
              fields.map((field) => (field === "status" && row.isForbidden ? "forbidden" : row[field]))
            )
          ]
            .map((row) => row.map(cell).join(delimiter))
            .join("\r\n"),
        mimeType: format === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/csv;charset=utf-8"
      };
    }
    throw new Error("Choose a supported export format.");
  }
  return Object.freeze({ prepareImport, commitImport, exportEntries });
}
