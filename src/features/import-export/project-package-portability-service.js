/**
 * Owns project-package validation delegation, preserved-structure detection,
 * portable cloning, copy naming, record-ID collision policy, and import
 * preparation. Package persistence and application/session effects remain
 * behind their existing orchestration boundaries.
 *
 * @param {{
 *   validation: { validate: (pkg: any) => any },
 *   storage: { getAll: (storeName: string) => Promise<any[]> },
 *   records: { sanitize: (value: any) => any },
 *   ids: { make: (prefix: string) => string },
 *   projects: { getAll: () => any[] },
 *   clock: { now: () => string }
 * }} options
 */
export function createProjectPackagePortabilityService(options) {
  const validation = options?.validation;
  const storage = options?.storage;
  const records = options?.records;
  const ids = options?.ids;
  const projects = options?.projects;
  const clock = options?.clock;

  if (
    typeof validation?.validate !== "function" ||
    typeof storage?.getAll !== "function" ||
    typeof records?.sanitize !== "function" ||
    typeof ids?.make !== "function" ||
    typeof projects?.getAll !== "function" ||
    typeof clock?.now !== "function"
  ) {
    throw new TypeError(
      "ProjectPackagePortabilityService requires validation, storage, record, ID, project, and clock boundaries."
    );
  }

  function validate(pkg) {
    return validation.validate(pkg);
  }

  function hasOriginalLocalizationStructure(structure) {
    return Boolean(
      structure?.source ||
      structure?.sourceLines ||
      structure?.sourceJson !== undefined ||
      structure?.rows ||
      structure?.packageBase64
    );
  }

  function cloneRecord(record) {
    return records.sanitize(record || {});
  }

  function importedCopyName(name) {
    const base = `${String(name || "Imported project").trim() || "Imported project"} (copy)`;
    const usedNames = new Set(
      projects
        .getAll()
        .map((project) => project.name)
        .filter(Boolean)
    );
    if (!usedNames.has(base)) return base;
    let counter = 2;
    while (usedNames.has(`${base} ${counter}`)) counter += 1;
    return `${base} ${counter}`;
  }

  function storeIds(storeRecords, ignoredProjectId = "") {
    return new Set(
      (storeRecords || [])
        .filter((record) => !ignoredProjectId || record.projectId !== ignoredProjectId)
        .map((record) => record.id)
        .filter(Boolean)
    );
  }

  function remapRecordId(record, prefix, existingIds, reservedIds, forceNewId = false) {
    const next = cloneRecord(record);
    const currentId = String(next.id || "");
    if (forceNewId || !currentId || existingIds.has(currentId) || reservedIds.has(currentId)) {
      next.id = ids.make(prefix);
    }
    reservedIds.add(next.id);
    return next;
  }

  async function prepare(pkg, { replaceProjectId = "", importAsCopy = false } = {}) {
    const [existingSegments, existingActivityEvents, existingTmEntries, existingTerms] = await Promise.all([
      storage.getAll("segments"),
      storage.getAll("activityEvents"),
      storage.getAll("tmEntries"),
      storage.getAll("terms")
    ]);
    const project = cloneRecord(pkg.project);
    if (importAsCopy) {
      project.id = ids.make("project");
      project.name = importedCopyName(project.name);
      project.createdAt = clock.now();
      project.updatedAt = project.createdAt;
      project.exportHistory = [];
    }

    const segmentIds = storeIds(existingSegments, replaceProjectId);
    const activityIds = storeIds(existingActivityEvents, replaceProjectId);
    const tmIds = storeIds(existingTmEntries);
    const termIds = storeIds(existingTerms);
    const reservedSegmentIds = new Set();
    const reservedActivityIds = new Set();
    const reservedTmIds = new Set();
    const reservedTermIds = new Set();
    const segments = (pkg.segments || []).map((segment) => ({
      ...remapRecordId(segment, "segment", segmentIds, reservedSegmentIds, importAsCopy),
      projectId: project.id
    }));
    const activityEvents = (pkg.activityEvents || []).map((event) => ({
      ...remapRecordId(event, "activity", activityIds, reservedActivityIds, importAsCopy),
      projectId: project.id
    }));
    const tmEntries = (pkg.resources?.tmEntries || []).map((entry) => remapRecordId(entry, "tm", tmIds, reservedTmIds));
    const terms = (pkg.resources?.terms || []).map((term) => remapRecordId(term, "term", termIds, reservedTermIds));
    return {
      ...pkg,
      project,
      segments,
      resources: {
        ...(pkg.resources || {}),
        tmEntries,
        terms
      },
      activityEvents
    };
  }

  return Object.freeze({
    cloneRecord,
    hasOriginalLocalizationStructure,
    importedCopyName,
    prepare,
    remapRecordId,
    storeIds,
    validate
  });
}
