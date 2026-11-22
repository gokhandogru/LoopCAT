// Positions are those of native XML nodes, including the file and the 1.2 marker.
// Several native segments can legally have the same visible source or unit ID.
function location(row) {
  const s = row.structure || {};
  return JSON.stringify([s.fileIndex, s.unitIndex, s.segmentIndex ?? null, s.segmentMid || ""]);
}

export async function prepareXliffResegmentation(
  { project, document, segments },
  { parseXliffText, buildTargetXliff }
) {
  const original = project.localizationStructures?.[document.id];
  const native = { splitBilingualBlocks: false };
  const read = (xml, options) => parseXliffText(xml, document.name, options);
  if (!original?.source) throw Error("XLIFF reconstruction source data is missing.");
  if (segments.some((row) => row.structure?.xliffPart)) return null;
  const originalRows = (await read(original.source, native)).segments;
  if (
    originalRows.length !== segments.length ||
    originalRows.some((row, i) => row.text !== segments[i].source || location(row) !== location(segments[i]))
  )
    throw Error("This file has custom source edits. Its current segmentation has been kept.");
  // Start with the translator's live targets, including edits since import.
  const current = await buildTargetXliff(project, segments, original);
  const exported = (await read(current, native)).segments;
  if (
    exported.length !== segments.length ||
    exported.some(
      (row, i) =>
        location(row) !== location(segments[i]) ||
        row.text !== segments[i].source ||
        row.target !== (segments[i].target || "")
    )
  )
    throw Error("The current translations could not be aligned safely. The file was kept as it is.");
  const parsed = await read(current, { splitBilingualBlocks: true });
  if (parsed.segments.length === segments.length) return null;
  const parents = new Map(segments.map((row) => [location(row), row]));
  const parentRows = parsed.segments.map((row) => parents.get(location(row)));
  if (parents.size !== segments.length || parentRows.some((row) => !row))
    throw Error("The current translations could not be aligned safely. The file was kept as it is.");
  return {
    prepared: {
      ...parsed,
      structure: { ...original, ...parsed.structure },
      importOptions: { ...document.importOptions, splitBilingualBlocks: true }
    },
    parentRows
  };
}
