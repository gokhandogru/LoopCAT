/* Pure source-update alignment, adapted from LoopCAT Pro; renderer/worker shared. */
(() => {
  const linguistics = globalThis.LoopCATLinguistics;
  function compareSourceUpdate(previous, incoming, locale = "en") {
    const oldKeys = previous.map((s) => linguistics.projectionFor(s).canonical);
    const newKeys = incoming.map((s) => linguistics.projectionFor(s).canonical);
    const groups = (keys) => {
      const map = new Map();
      keys.forEach((key, index) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(index);
      });
      return map;
    };
    const oldGroups = groups(oldKeys),
      newGroups = groups(newKeys),
      used = new Set();
    const context = (keys, i) => JSON.stringify([i ? keys[i - 1] : "START", i < keys.length - 1 ? keys[i + 1] : "END"]);
    const identity = (segment) =>
      JSON.stringify([
        segment.structure?.key || "",
        segment.structure?.unitId || "",
        segment.structure?.path || null,
        segment.structure?.partPath || ""
      ]);
    const oldContexts = previous.map((s, i) => JSON.stringify([oldKeys[i], context(oldKeys, i), identity(s)]));
    const newContexts = incoming.map((s, i) => JSON.stringify([newKeys[i], context(newKeys, i), identity(s)]));
    const oldContextGroups = groups(oldContexts),
      newContextGroups = groups(newContexts);
    const rows = incoming.map((segment, index) => {
      const candidates = oldGroups.get(newKeys[index]) || [];
      let matches =
        newContextGroups.get(newContexts[index]).length === 1 ? oldContextGroups.get(newContexts[index]) || [] : [];
      if (candidates.length === 1 && newGroups.get(newKeys[index]).length === 1) matches = candidates;
      const matched = matches.length === 1 && !used.has(matches[0]) ? matches[0] : -1;
      const old = matched >= 0 ? previous[matched] : null;
      if (old) used.add(matched);
      const remapped = old
        ? linguistics.remapTarget(
            old.source,
            segment.source,
            old.target || "",
            linguistics.descriptorFor(old),
            linguistics.descriptorFor(segment)
          )
        : undefined;
      const safe = remapped !== undefined;
      const sameContext = old && oldContexts[matched] === newContexts[index];
      const incomingTarget = segment.target || "";
      const previousTarget = old?.target || "";
      const target = safe ? remapped : "";
      return {
        index,
        source: segment.source,
        incomingTarget,
        previousSource: old?.source || "",
        previousTarget,
        previousSegmentId: old?.id || "",
        target,
        safeReuse: safe,
        preservedStatus: !!(safe && sameContext),
        status: target ? (sameContext ? old.status : "draft") : "empty",
        disposition: old ? (safe ? "unchanged" : "protected") : candidates.length ? "ambiguous" : "added",
        conflict: !!incomingTarget && incomingTarget !== target,
        reviewRequired: !!target && !sameContext,
        words: linguistics.metricsForSegment(segment, locale).words
      };
    });
    // Position is reference evidence only; it never authorizes carrying a target.
    rows.forEach((row, index) => {
      if (row.previousSegmentId || !previous[index] || used.has(index)) return;
      row.previousSource = previous[index].source;
      row.previousTarget = previous[index].target || "";
      row.previousSegmentId = previous[index].id;
      if (row.disposition === "added") row.disposition = "changed";
    });
    return {
      rows,
      removed: previous.filter((_, i) => !used.has(i)).map((s) => ({ source: s.source, target: s.target || "" }))
    };
  }

  globalThis.LoopCATSourceUpdate = Object.freeze({ compareSourceUpdate });
})();
