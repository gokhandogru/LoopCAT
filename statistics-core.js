/* Pure, versioned Statistics domain. No storage, UI, or network access. */
(() => {
  const bands = ["context", "exact", "repetition", "95-99", "85-94", "75-84", "50-74", "new", "incomplete"];
  const empty = () => ({ words: 0, segments: 0, characters: 0, charactersWithoutWhitespace: 0, tags: 0 });
  const buckets = () => bands.map((band) => ({ band, ...empty() }));
  function add(total, counts) {
    for (const key of Object.keys(empty())) total[key] += counts[key] || 0;
  }
  function bandFor(match) {
    if (!match || match.score < 50) return "new";
    if (match.score === 100 && match.contextExact && match.safeToApply) return "context";
    if (match.score === 100 && match.safeToApply) return "exact";
    return match.score >= 95 ? "95-99" : match.score >= 85 ? "85-94" : match.score >= 75 ? "75-84" : "50-74";
  }
  function resolveScope(project, segments, scope = { kind: "project" }) {
    if (!project?.id) throw Error("Open a project before calculating statistics.");
    const documentIds = new Set((project.documents || []).map((x) => x.id));
    segments.forEach((s) => {
      if (s.projectId && s.projectId !== project.id) throw Error("Statistics contains segments from another project.");
      documentIds.add(s.documentId);
    });
    if (scope.kind === "project") return segments;
    if (scope.kind === "files") {
      const ids = new Set(scope.documentIds || []);
      if (!ids.size || [...ids].some((id) => !documentIds.has(id)))
        throw Error("Select existing files in this project.");
      return segments.filter((s) => ids.has(s.documentId));
    }
    if (scope.kind === "segments") {
      const ids = new Set(scope.segmentIds || []),
        known = new Set(segments.map((s) => s.id));
      if (!ids.size || [...ids].some((id) => !known.has(id)))
        throw Error("The selected segments are empty or no longer available.");
      return segments.filter((s) => ids.has(s.id));
    }
    throw Error("Unknown statistics scope.");
  }
  function locked(segment) {
    return Boolean(
      segment.locked || segment.isLocked || segment.readOnly || segment.readonly || segment.status === "locked"
    );
  }
  function workload(project, segments, scope, options) {
    const scoped = resolveScope(project, segments, scope);
    const order = new Map((project.documents || []).map((d, i) => [d.id, i]));
    const included = scoped
      .filter((s) => (!options.remaining || s.status !== "confirmed") && (!options.excludeLocked || !locked(s)))
      .sort(
        (a, b) =>
          (order.get(a.documentId) ?? Infinity) - (order.get(b.documentId) ?? Infinity) ||
          (a.index ?? 0) - (b.index ?? 0) ||
          String(a.id).localeCompare(String(b.id))
      );
    const requestedFiles =
      scope.kind === "files"
        ? scope.documentIds
        : scope.kind === "project"
          ? (project.documents || []).map((d) => d.id)
          : scoped.map((s) => s.documentId);
    const names = new Map((project.documents || []).map((d) => [d.id, d.name]));
    const newFile = (id, name) => ({
      id,
      name,
      totals: empty(),
      countingComplete: true,
      unresolvedCountingSegments: 0
    });
    /** @type {Map<string,ReturnType<typeof newFile> & {buckets?:ReturnType<typeof buckets>}>} */
    const files = new Map([...new Set(requestedFiles)].map((id) => [id, newFile(id, names.get(id) || id)]));
    for (const s of included)
      if (!files.has(s.documentId))
        files.set(s.documentId, newFile(s.documentId, s.documentName || s.documentId || "Document"));
    return { included, files, excludedSegments: scoped.length - included.length };
  }
  function countRow(segment, language) {
    return { ...globalThis.LoopCATLinguistics.metricsForSegment(segment, language), segments: 1 };
  }
  function addFileRow(file, metrics) {
    add(file.totals, metrics);
    if (!metrics.countingComplete) {
      file.countingComplete = false;
      file.unresolvedCountingSegments++;
    }
  }
  function sourceSummary({ project, segments, scope = { kind: "project" }, options = {} }) {
    const { included, files, excludedSegments } = workload(project, segments, scope, options);
    const totals = empty();
    let unresolvedCountingSegments = 0;
    for (const segment of included) {
      const metrics = countRow(segment, project.sourceLang);
      add(totals, metrics);
      addFileRow(files.get(segment.documentId), metrics);
      if (!metrics.countingComplete) unresolvedCountingSegments++;
    }
    return {
      totals,
      files: [...files.values()],
      excludedSegments,
      countingComplete: unresolvedCountingSegments === 0,
      unresolvedCountingSegments
    };
  }
  function fingerprint(project, segments, resources = []) {
    let hash = 2166136261;
    const consume = (value) => {
      for (const char of String(value ?? "")) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
    };
    consume(
      JSON.stringify([
        project?.id,
        project?.sourceLang,
        project?.targetLang,
        project?.documents,
        project?.resourceLinks
      ])
    );
    for (const s of segments)
      consume(
        JSON.stringify([s.id, s.revision, s.source, s.target, s.status, s.structure, s.sourceDescriptor, locked(s)])
      );
    for (const r of resources) consume(JSON.stringify([r.id, r.storageVersion, r.updatedAt]));
    return (hash >>> 0).toString(16);
  }
  async function analyze(request, progress = (_progress) => {}, signal) {
    signal?.throwIfAborted();
    const core = globalThis.LoopCATLinguistics;
    const { project, segments, entries = [], scope = { kind: "project" } } = request;
    const options = {
      remaining: false,
      excludeLocked: false,
      crossFileRepetitions: true,
      repetitionsFirst: false,
      internalFuzzy: false,
      weighted: false,
      weights: {},
      ...request.options
    };
    const { included, files: fileMap, excludedSegments } = workload(project, segments, scope, options);
    const resourceLinks = (request.resourceLinks || []).filter((l) => l.type === "tm" && l.lookup !== false);
    const selectedIds = new Set(resourceLinks.filter((l) => l.lookup !== false).map((l) => l.resourceId));
    const memories = (request.resources || [])
      .filter((r) => selectedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        revision: r.storageVersion || 0,
        updatedAt: r.updatedAt,
        penalty: resourceLinks.find((l) => l.resourceId === r.id)?.penalty || 0,
        priority: resourceLinks.find((l) => l.resourceId === r.id)?.priority || 0,
        words: 0,
        segments: 0
      }));
    const eligible = entries.filter(
      (e) =>
        selectedIds.has(e.resourceId) &&
        (e.languagePair || `${e.sourceLang}::${e.targetLang}`) === `${project.sourceLang}::${project.targetLang}` &&
        typeof e.source === "string" &&
        e.source.trim() &&
        typeof e.target === "string" &&
        e.target.trim()
    );
    progress({ scanned: 0, total: included.length });
    const alternatives = new Map();
    for (const entry of eligible) {
      const key = JSON.stringify([entry.languagePair || `${entry.sourceLang}::${entry.targetLang}`, entry.source]);
      if (!alternatives.has(key)) alternatives.set(key, new Set());
      alternatives.get(key).add(entry.target);
    }
    const search = eligible.length ? core.createSearchIndex(eligible) : null;
    const result = {
      schemaVersion: 1,
      id: request.id || `analysis-${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      sourceLanguage: project.sourceLang,
      targetLanguage: project.targetLang,
      scope: structuredClone(scope),
      options: structuredClone(options),
      createdAt: new Date().toISOString(),
      countingVersion: core.COUNTING_VERSION,
      matchingVersion: core.MATCHING_VERSION,
      runtimeVersion: request.runtimeVersion || "unknown",
      generation: request.generation || fingerprint(project, segments, request.resources),
      totals: empty(),
      excludedSegments,
      countingComplete: true,
      unresolvedCountingSegments: 0,
      structuralSegments: 0,
      searchComplete: true,
      unresolvedMatchingSegments: 0,
      estimatedComplete: true,
      complete: true,
      buckets: buckets(),
      estimatedBuckets: buckets(),
      rows: [],
      files: [],
      memories,
      limitations: [],
      weightedWords: 0,
      estimatedWeightedWords: 0
    };
    const seen = new Set(),
      cache = new Map(),
      prior = [];
    const contexts = search ? core.contextsFor(segments) : null;
    for (const file of fileMap.values()) file.buckets = buckets();
    let resumed = Date.now();
    async function yieldToUi(scanned) {
      progress({ scanned, total: included.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      resumed = Date.now();
    }
    for (let index = 0; index < included.length; index++) {
      const segment = included[index];
      signal?.throwIfAborted();
      const metrics = countRow(segment, project.sourceLang);
      if (!metrics.countingComplete) {
        result.countingComplete = false;
        result.unresolvedCountingSegments++;
      }
      const projection = core.projectionFor(segment);
      const structural = metrics.countingComplete && !projection.text.replaceAll("\0", "").trim();
      if (structural) result.structuralSegments++;
      const repetitionKey = JSON.stringify([
        options.crossFileRepetitions ? "" : segment.documentId,
        projection.known ? projection.canonical : [segment.source, core.descriptorFor(segment)]
      ]);
      const repeated = metrics.countingComplete && seen.has(repetitionKey);
      if (metrics.countingComplete && !structural) seen.add(repetitionKey);
      const context =
        contexts?.get(segment.id) ||
        (options.internalFuzzy ? { sourceDescriptor: core.descriptorFor(segment) } : undefined);
      const key = search ? JSON.stringify([segment.source, context, repeated]) : "";
      let lookup = search && !structural ? cache.get(key) : { complete: true };
      if (!lookup && !(repeated && options.repetitionsFirst)) {
        const scoring = {
          source: segment.source,
          segment,
          sourceLang: project.sourceLang,
          targetLang: project.targetLang,
          resourceLinks,
          context,
          limit: 1,
          minimumScore: 0,
          alternatives,
          differences: false
        };
        async function score(candidates) {
          let best,
            complete = true;
          for (let i = 0; i < candidates.length; i += 32) {
            const match = core.scoreEntries(candidates.slice(i, i + 32), scoring)[0];
            if (match?.searchComplete === false) complete = false;
            if (match && (!best || core.rankScoredEntries(match, best) < 0)) best = match;
            if (Date.now() - resumed >= 30) await yieldToUi(index);
          }
          return best && { ...best, searchComplete: complete };
        }
        const exactCandidates = search.exactCandidates(projection);
        const exact = await score(exactCandidates);
        if ((exact?.score === 100 && exact.safeToApply) || repeated) {
          lookup = { match: exact, complete: true };
        } else if (exactCandidates.length === eligible.length) {
          lookup = { match: exact, complete: exact?.searchComplete !== false && !exact?.limited };
        } else {
          const candidates = search(segment.source, options.exhaustive ? Infinity : 2000);
          const match = await score(candidates.entries);
          lookup = { match, complete: candidates.complete && match?.searchComplete !== false && !match?.limited };
        }
        cache.set(key, lookup);
      }
      lookup ??= { complete: true };
      const match = lookup.match;
      let band = bandFor(match);
      if (!lookup.complete) {
        band = "incomplete";
        result.searchComplete = false;
        result.unresolvedMatchingSegments++;
      } else if (repeated && (options.repetitionsFirst || !["context", "exact"].includes(band))) band = "repetition";
      if (!metrics.countingComplete) band = "incomplete";
      let estimatedBand = band;
      if (options.internalFuzzy && !structural && !["incomplete", "context", "exact", "repetition"].includes(band)) {
        // Bounded estimate, never presented as a real TM contribution.
        if (!options.exhaustive && prior.length > 2000) {
          estimatedBand = "incomplete";
          result.estimatedComplete = false;
        } else {
          let best = match?.score || 0;
          for (const previous of prior) {
            if (Date.now() - resumed >= 30) await yieldToUi(index);
            const compared = core.scoreSource(
              previous.source,
              segment.source,
              project.sourceLang,
              { sourceDescriptor: core.descriptorFor(previous) },
              context,
              false
            );
            if (compared.limited) {
              result.estimatedComplete = false;
              estimatedBand = "incomplete";
              break;
            }
            best = Math.max(best, compared.rawScore);
          }
          if (estimatedBand !== "incomplete" && best > (match?.score || 0))
            estimatedBand = bandFor({ score: Math.min(99, best) });
        }
      }
      if (options.internalFuzzy && !structural) prior.push(segment);
      add(result.totals, metrics);
      add(
        result.buckets.find((b) => b.band === band),
        metrics
      );
      add(
        result.estimatedBuckets.find((b) => b.band === estimatedBand),
        metrics
      );
      const file = fileMap.get(segment.documentId);
      addFileRow(file, metrics);
      add(
        file.buckets.find((b) => b.band === band),
        metrics
      );
      if (!["new", "incomplete", "repetition"].includes(band)) {
        const memory = memories.find((m) => m.id === match?.resourceId);
        if (memory) {
          memory.words += metrics.words;
          memory.segments++;
        }
      }
      result.rows.push({
        segmentId: segment.id,
        documentId: segment.documentId,
        index: segment.index,
        revision: segment.revision || 0,
        ...metrics,
        structural,
        band,
        estimatedBand,
        score: match?.score || 0,
        rawScore: match?.rawScore || 0,
        resourceId: match?.resourceId || "",
        resourceName: match?.resourceName || "",
        compatibility: match?.compatibility,
        adjustments: match?.adjustments || [],
        limited: !lookup.complete
      });
      if (Date.now() - resumed >= 30 || index === 0) await yieldToUi(index + 1);
    }
    result.files = [...fileMap.values()];
    for (const bucket of result.buckets)
      result.weightedWords +=
        bucket.words *
        (Number.isFinite(Number(options.weights[bucket.band]))
          ? Math.max(0, Math.min(100, Number(options.weights[bucket.band]))) / 100
          : 1);
    for (const bucket of result.estimatedBuckets)
      result.estimatedWeightedWords +=
        bucket.words *
        (Number.isFinite(Number(options.weights[bucket.band]))
          ? Math.max(0, Math.min(100, Number(options.weights[bucket.band]))) / 100
          : 1);
    result.complete = result.countingComplete && result.searchComplete && result.estimatedComplete;
    if (!result.countingComplete)
      result.limitations.push(
        "Some source content could not be read. The total includes only words that could be counted."
      );
    if (!result.searchComplete)
      result.limitations.push("Some TM searches were bounded. Incomplete words are not certified as new words.");
    if (options.internalFuzzy)
      result.limitations.push(
        "Internal fuzzy reuse is an estimate based on the displayed file order, not an existing TM match."
      );
    if (!result.estimatedComplete) result.limitations.push("Some internal fuzzy comparisons were bounded.");
    progress({ scanned: included.length, total: included.length });
    return result;
  }
  function exportReport(
    snapshot,
    format = "json",
    { locale = "en", direction = "ltr", translate = (value) => value } = {}
  ) {
    const esc = (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
      );
    if (format === "json") return JSON.stringify(snapshot, null, 2);
    const wordLabel = snapshot.countingComplete === false ? "Known source words" : "Source words";
    if (format === "csv") {
      const cell = (value) =>
        '"' +
        String(value ?? "")
          .replace(/^(?:\s*[=+@\-]|[\t\r])/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const rows = [
        ["LoopCAT Statistics", snapshot.projectName, snapshot.createdAt, snapshot.complete ? "Complete" : "INCOMPLETE"],
        ["Scope", JSON.stringify(snapshot.scope)],
        ["Counting", snapshot.countingVersion, "Matching", snapshot.matchingVersion],
        ["Options", JSON.stringify(snapshot.options)],
        ["TMs", JSON.stringify(snapshot.memories)],
        ["File", "Band", wordLabel, "Segments", "Characters", "Tags"]
      ];
      for (const bucket of snapshot.buckets)
        rows.push(["TOTAL", bucket.band, bucket.words, bucket.segments, bucket.characters, bucket.tags]);
      for (const file of snapshot.files)
        for (const bucket of file.buckets)
          rows.push([file.name, bucket.band, bucket.words, bucket.segments, bucket.characters, bucket.tags]);
      if (!snapshot.complete)
        for (const limitation of snapshot.limitations || []) rows.push(["Limitation", limitation]);
      return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    }
    const label = (value) => esc(translate(value));
    const methods = {
      scope: snapshot.scope,
      options: snapshot.options,
      memories: snapshot.memories,
      countingVersion: snapshot.countingVersion,
      matchingVersion: snapshot.matchingVersion,
      runtimeVersion: snapshot.runtimeVersion,
      limitations: snapshot.limitations
    };
    const breakdown = snapshot.buckets
      .map(
        (bucket) =>
          `<tr><th scope="row">${label(bandLabels[bucket.band] || bucket.band)}</th><td>${esc(bucket.words)}</td><td>${esc(bucket.segments)}</td></tr>`
      )
      .join("");
    const files = snapshot.files
      .map((file) => `<tr><th scope="row"><bdi>${esc(file.name)}</bdi></th><td>${esc(file.totals.words)}</td></tr>`)
      .join("");
    return `<!doctype html>
<html lang="${esc(locale)}" dir="${direction === "rtl" ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${label("Statistics")} — ${esc(snapshot.projectName)}</title>
<style>
  :root {color-scheme: light dark; --canvas: #f7f7f2; --surface: #fff; --subtle: #f2f5f2; --text: #183932; --muted: #536860; --line: #c5d1c9; --accent: #086959; --warning: #855011}
  * {box-sizing: border-box}
  body {margin: 0; background: var(--canvas); color: var(--text); font: 1rem/1.5 system-ui, sans-serif}
  main {max-inline-size: 58rem; margin: 2rem auto; padding: clamp(1rem, 4vw, 2.5rem); background: var(--surface); border: 1px solid var(--line); border-block-start: .25rem solid var(--accent); border-radius: .65rem; overflow-wrap: anywhere}
  header {padding-block-end: 1.2rem; border-block-end: 1px solid var(--line)}
  header p, h1, h2 {margin: 0}
  header p {color: var(--muted)}
  h1 {font-size: clamp(1.5rem, 5vw, 2.3rem); line-height: 1.18; margin-block: .25rem .5rem}
  h2 {font-size: 1.12rem}
  section {margin-block-start: 1.5rem}
  .status {font-weight: 650; color: var(--accent)}
  .incomplete {color: var(--warning)}
  .metric {font-size: 1.12rem; margin: 1rem 0 0}
  .metric strong {font-variant-numeric: tabular-nums}
  table {width: 100%; border-collapse: collapse}
  caption {padding-block-end: .5rem; text-align: start; font-size: 1.12rem; font-weight: 650}
  th, td {padding: .5rem clamp(.35rem, 1.5vw, .9rem); border-block-end: 1px solid var(--line); text-align: end; font-variant-numeric: tabular-nums; vertical-align: top}
  th:first-child {text-align: start}
  thead th {color: var(--muted); background: var(--subtle); font-size: .85rem}
  tbody th {font-weight: 500}
  pre {max-inline-size: 100%; padding: .8rem; background: var(--subtle); color: var(--text); border: 1px solid var(--line); border-radius: .4rem; white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; font: .83rem/1.5 ui-monospace, monospace}
  @media (prefers-color-scheme: dark) { :root {--canvas: #15211e; --surface: #1c2c26; --subtle: #243830; --text: #e9f4ee; --muted: #b3c7bc; --line: #4b6457; --accent: #91e1c5; --warning: #f5c17b} }
  @media (max-width: 40rem) {main {margin: 0; border-inline: 0; border-radius: 0}}
  @page {margin: 1.6cm}
  @media print {
    :root {color-scheme: light; --canvas: white; --surface: white; --subtle: #f2f5f2; --text: #152d26; --muted: #385447; --line: #829b8c; --accent: #075544; --warning: #684009}
    main {max-inline-size: none; margin: 0; padding: 0; border: 0}
    h1, h2, caption, header {break-after: avoid}
    tr {break-inside: avoid}
    thead {display: table-header-group}
    pre {border: 0; background: white}
  }
</style></head><body><main>
<header><p>LoopCAT · ${label("Statistics")}</p><h1><bdi>${esc(snapshot.projectName)}</bdi></h1>
<p><time datetime="${esc(snapshot.createdAt)}"><bdi>${esc(snapshot.createdAt)}</bdi></time> · <data class="status${snapshot.complete ? "" : " incomplete"}" value="${snapshot.complete ? "COMPLETE" : "INCOMPLETE"}">${label(snapshot.complete ? "Complete" : "Incomplete")}</data></p></header>
<p class="metric">${label(snapshot.countingComplete ? "Source words" : "Known source words (incomplete)")} · <strong>${esc(snapshot.totals.words)}</strong></p>
${snapshot.complete ? "" : (snapshot.limitations || []).map((note) => `<p>${label(note)}</p>`).join("")}
<section><table><caption>${label("Match breakdown")}</caption><thead><tr><th scope="col">${label("Category")}</th><th scope="col">${label(wordLabel)}</th><th scope="col">${label("Segments")}</th></tr></thead><tbody>${breakdown}</tbody></table></section>
<section><table><caption>${label("Files")}</caption><thead><tr><th scope="col">${label("File")}</th><th scope="col">${label(wordLabel)}</th></tr></thead><tbody>${files}</tbody></table></section>
<section><h2>${label("Method and resources")}</h2><pre dir="ltr">${esc(JSON.stringify(methods, null, 2))}</pre></section>
</main></body></html>`;
  }
  const bandLabels = Object.freeze({
    context: "Context matches",
    exact: "100% matches",
    repetition: "Repetitions",
    "95-99": "95–99%",
    "85-94": "85–94%",
    "75-84": "75–84%",
    "50-74": "50–74%",
    new: "New / no match",
    incomplete: "Incomplete"
  });
  globalThis.LoopCATStatistics = Object.freeze({
    bands,
    bandLabels,
    resolveScope,
    sourceSummary,
    analyze,
    exportReport,
    fingerprint,
    locked
  });
})();
