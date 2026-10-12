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
  async function analyze(request, progress = (_progress) => {}) {
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
    const scoped = resolveScope(project, segments, scope);
    const order = new Map((project.documents || []).map((d, i) => [d.id, i]));
    const included = scoped
      .filter((s) => (!options.remaining || s.status !== "confirmed") && (!options.excludeLocked || !locked(s)))
      .slice()
      .sort(
        (a, b) =>
          (order.get(a.documentId) ?? 999) - (order.get(b.documentId) ?? 999) ||
          (a.index ?? 0) - (b.index ?? 0) ||
          String(a.id).localeCompare(String(b.id))
      );
    const resourceLinks = request.resourceLinks || [];
    const selectedIds = new Set(resourceLinks.filter((l) => l.lookup !== false).map((l) => l.resourceId));
    const memories = (request.resources || [])
      .filter((r) => selectedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        revision: r.storageVersion || 0,
        updatedAt: r.updatedAt,
        penalty: resourceLinks.find((l) => l.resourceId === r.id)?.penalty || 0,
        words: 0,
        segments: 0
      }));
    const eligible = entries.filter(
      (e) =>
        selectedIds.has(e.resourceId) &&
        (e.languagePair || `${e.sourceLang}::${e.targetLang}`) === `${project.sourceLang}::${project.targetLang}` &&
        String(e.target || "").trim()
    );
    const search = core.createSearchIndex(eligible);
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
      excludedSegments: scoped.length - included.length,
      countingComplete: true,
      unresolvedCountingSegments: 0,
      searchComplete: true,
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
    const fileMap = new Map(),
      seen = new Map(),
      cache = new Map(),
      prior = [];
    const contexts = core.contextsFor(segments);
    const requestedFiles =
      scope.kind === "files"
        ? new Set(scope.documentIds)
        : scope.kind === "project"
          ? new Set((project.documents || []).map((d) => d.id))
          : new Set(included.map((s) => s.documentId));
    for (const id of requestedFiles)
      fileMap.set(id, {
        id,
        name: (project.documents || []).find((d) => d.id === id)?.name || id,
        totals: empty(),
        buckets: buckets()
      });
    for (let index = 0; index < included.length; index++) {
      const segment = included[index];
      const metrics = { ...core.metricsForSegment(segment, project.sourceLang), segments: 1 };
      if (!metrics.countingComplete) {
        result.countingComplete = false;
        result.unresolvedCountingSegments++;
        metrics.words = null;
      }
      const projection = core.projectionFor(segment);
      const repetitionKey = JSON.stringify([
        options.crossFileRepetitions ? "" : segment.documentId,
        projection.canonical
      ]);
      const repeated = projection.known && seen.has(repetitionKey);
      if (projection.text.trim() && projection.known) seen.set(repetitionKey, segment.id);
      const context = contexts.get(segment.id);
      const key = JSON.stringify([segment.source, context]);
      let lookup = cache.get(key);
      if (!lookup) {
        const candidates = search(segment.source, options.exhaustive ? Infinity : 2000);
        const match = core.scoreEntries(candidates.entries, {
          source: segment.source,
          segment,
          sourceLang: project.sourceLang,
          targetLang: project.targetLang,
          resourceLinks,
          context,
          limit: 1,
          minimumScore: 0,
          differences: false
        })[0];
        lookup = {
          match,
          complete:
            match?.searchComplete !== false &&
            !match?.limited &&
            (candidates.complete || (match?.score === 100 && match?.safeToApply))
        };
        cache.set(key, lookup);
      }
      const match = lookup.match;
      let band = bandFor(match);
      if (repeated && (options.repetitionsFirst || !["context", "exact"].includes(band))) band = "repetition";
      else if (!lookup.complete) band = "incomplete";
      if (!metrics.countingComplete) band = "incomplete";
      if (band === "incomplete") result.searchComplete = false;
      let estimatedBand = band;
      if (options.internalFuzzy && !["context", "exact", "repetition"].includes(band)) {
        // Bounded estimate, never presented as a real TM contribution.
        if (prior.length > 2000) {
          estimatedBand = "incomplete";
        } else {
          let best = match?.score || 0;
          for (const previous of prior)
            best = Math.max(
              best,
              core.scoreSource(
                previous.source,
                segment.source,
                project.sourceLang,
                { sourceDescriptor: core.descriptorFor(previous) },
                context,
                false
              ).rawScore
            );
          if (best > (match?.score || 0)) estimatedBand = bandFor({ score: Math.min(99, best) });
        }
      }
      prior.push(segment);
      add(result.totals, metrics);
      add(
        result.buckets.find((b) => b.band === band),
        metrics
      );
      add(
        result.estimatedBuckets.find((b) => b.band === estimatedBand),
        metrics
      );
      if (!fileMap.has(segment.documentId))
        fileMap.set(segment.documentId, {
          id: segment.documentId,
          name: segment.documentName || "Document",
          totals: empty(),
          buckets: buckets()
        });
      const file = fileMap.get(segment.documentId);
      add(file.totals, metrics);
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
      if (index % 25 === 0) {
        progress({ scanned: index + 1, total: included.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
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
    result.complete = result.countingComplete && result.searchComplete;
    if (!result.countingComplete)
      result.limitations.push(
        `${result.unresolvedCountingSegments} segments contain unrecognized markup. Only known source words are included; inspect unresolved segments before quoting.`
      );
    if (!result.searchComplete)
      result.limitations.push("Some TM searches were bounded. Incomplete words are not certified as new words.");
    if (options.internalFuzzy)
      result.limitations.push(
        "Internal fuzzy reuse is an estimate based on the displayed file order, not an existing TM match."
      );
    progress({ scanned: included.length, total: included.length });
    return result;
  }
  function exportReport(snapshot, format = "json") {
    const esc = (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
      );
    if (format === "json") return JSON.stringify(snapshot, null, 2);
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
        ["File", "Band", "Source words", "Segments", "Characters", "Tags"]
      ];
      for (const bucket of snapshot.buckets)
        rows.push(["TOTAL", bucket.band, bucket.words, bucket.segments, bucket.characters, bucket.tags]);
      for (const file of snapshot.files)
        for (const bucket of file.buckets)
          rows.push([file.name, bucket.band, bucket.words, bucket.segments, bucket.characters, bucket.tags]);
      return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    }
    return (
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>LoopCAT Statistics</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #aaa;text-align:left}pre{white-space:pre-wrap}</style><h1>Statistics — ' +
      esc(snapshot.projectName) +
      "</h1><p>" +
      esc(snapshot.createdAt) +
      " · " +
      (snapshot.complete ? "Complete" : "INCOMPLETE") +
      (snapshot.countingComplete ? "</p><p>Source words: " : "</p><p>Known source words (incomplete): ") +
      snapshot.totals.words +
      "</p><table><tr><th>Category</th><th>Source words</th><th>Segments</th></tr>" +
      snapshot.buckets
        .map((b) => "<tr><td>" + esc(b.band) + "</td><td>" + b.words + "</td><td>" + b.segments + "</td></tr>")
        .join("") +
      "</table><h2>Files</h2><table>" +
      snapshot.files.map((f) => "<tr><td>" + esc(f.name) + "</td><td>" + f.totals.words + "</td></tr>").join("") +
      "</table><h2>Method and resources</h2><pre>" +
      esc(
        JSON.stringify(
          {
            scope: snapshot.scope,
            options: snapshot.options,
            memories: snapshot.memories,
            countingVersion: snapshot.countingVersion,
            matchingVersion: snapshot.matchingVersion,
            runtimeVersion: snapshot.runtimeVersion,
            limitations: snapshot.limitations
          },
          null,
          2
        )
      ) +
      "</pre></html>"
    );
  }
  globalThis.LoopCATStatistics = Object.freeze({ bands, resolveScope, analyze, exportReport, fingerprint, locked });
})();
