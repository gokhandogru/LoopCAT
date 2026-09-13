/**
 * Owns project-package validation delegation, preserved-structure detection,
 * portable cloning, copy naming, record-ID collision policy, and import
 * preparation. Package persistence and application/session effects remain
 * behind their existing orchestration boundaries.
 *
 * @param {{
 *   validation: { validate: (pkg: any) => any },
 *   storage: { getAll: (storeName: string) => Promise<any[]>, getMany?: (storeName: string, keys: string[]) => Promise<any[]> },
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

  function comparableRecord(record) {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(record || {})
          .filter(([key]) => !["storageVersion", "storageWriter", "storageGeneration", "updatedAt"].includes(key))
          .sort(([left], [right]) => left.localeCompare(right))
      )
    );
  }

  function sameResourceIdentity(left, right) {
    if (!left || !right || left.type !== right.type) return false;
    if (left.type === "tm") {
      return left.sourceLang === right.sourceLang && left.targetLang === right.targetLang;
    }
    const languages = (value) => [...new Set(value?.languages || [])].sort().join("::");
    return languages(left) === languages(right);
  }

  function remapPackageRecords(
    recordsToMap,
    prefix,
    existingRecords,
    reservedIds,
    idMap,
    transform = (value) => value
  ) {
    const existingById = new Map((existingRecords || []).map((record) => [record.id, record]));
    return (recordsToMap || []).map((record) => {
      const transformed = transform(cloneRecord(record));
      const oldId = String(transformed.id || "");
      const existing = existingById.get(oldId);
      let next = transformed;
      if (
        !oldId ||
        reservedIds.has(oldId) ||
        (existing && comparableRecord(existing) !== comparableRecord(transformed))
      ) {
        next = { ...transformed, id: ids.make(prefix) };
      }
      reservedIds.add(next.id);
      if (oldId) idMap.set(oldId, next.id);
      return next;
    });
  }

  async function prepare(pkg, { replaceProjectId = "", importAsCopy = false } = {}) {
    const collisions = (storeName, records) =>
      storage.getMany
        ? storage
            .getMany(storeName, records.map((record) => record.id).filter(Boolean))
            .then((values) => values.filter(Boolean))
        : storage.getAll(storeName);
    const packagedResources = pkg.resources || {};
    const modernResourceGraph = ["resources", "tmContributions", "termConcepts", "termDesignations"].some((field) =>
      Object.hasOwn(packagedResources, field)
    );
    if (!modernResourceGraph) {
      const [existingSegments, existingActivityEvents, existingTmEntries, existingTerms] = await Promise.all([
        collisions("segments", pkg.segments || []),
        collisions("activityEvents", pkg.activityEvents || []),
        collisions("tmEntries", packagedResources.tmEntries || []),
        collisions("terms", packagedResources.terms || [])
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
      return {
        ...pkg,
        project,
        segments,
        resources: {
          ...packagedResources,
          tmEntries: (packagedResources.tmEntries || []).map((entry) =>
            remapRecordId(entry, "tm", tmIds, reservedTmIds)
          ),
          terms: (packagedResources.terms || []).map((term) => remapRecordId(term, "term", termIds, reservedTermIds))
        },
        activityEvents
      };
    }
    const [
      existingSegments,
      existingActivityEvents,
      existingResources,
      existingTmEntries,
      existingTmContributions,
      existingTerms,
      existingTermConcepts,
      existingTermDesignations
    ] = await Promise.all([
      collisions("segments", pkg.segments || []),
      collisions("activityEvents", pkg.activityEvents || []),
      collisions("resources", packagedResources.resources || []),
      collisions("tmEntries", packagedResources.tmEntries || []),
      collisions("tmContributions", packagedResources.tmContributions || []),
      collisions("terms", packagedResources.terms || []),
      collisions("termConcepts", packagedResources.termConcepts || []),
      collisions("termDesignations", packagedResources.termDesignations || [])
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
    const reservedSegmentIds = new Set();
    const reservedActivityIds = new Set();
    const reservedResourceIds = new Set();
    const reservedTmIds = new Set();
    const reservedContributionIds = new Set();
    const reservedTermIds = new Set();
    const reservedConceptIds = new Set();
    const reservedDesignationIds = new Set();
    const resourceIdMap = new Map();
    const tmEntryIdMap = new Map();
    const segmentIdMap = new Map();
    const conceptIdMap = new Map();
    const segments = (pkg.segments || [])
      .map((segment) => ({
        ...remapRecordId(segment, "segment", segmentIds, reservedSegmentIds, importAsCopy),
        projectId: project.id
      }))
      .map((segment, index) => {
        const oldId = pkg.segments?.[index]?.id;
        if (oldId) segmentIdMap.set(oldId, segment.id);
        return segment;
      });
    const activityEvents = (pkg.activityEvents || []).map((event) => ({
      ...remapRecordId(event, "activity", activityIds, reservedActivityIds, importAsCopy),
      projectId: project.id
    }));
    const existingResourceById = new Map((existingResources || []).map((resource) => [resource.id, resource]));
    const stableResources = (packagedResources.resources || []).map((resource) => {
      const incoming = cloneRecord(resource);
      const oldId = String(incoming.id || "");
      const existing = existingResourceById.get(oldId);
      let next = incoming;
      if (existing && sameResourceIdentity(existing, incoming)) next = cloneRecord(existing);
      else if (!oldId || existing || reservedResourceIds.has(oldId)) next = { ...incoming, id: ids.make("resource") };
      reservedResourceIds.add(next.id);
      if (oldId) resourceIdMap.set(oldId, next.id);
      return next;
    });
    project.resourceLinks = (project.resourceLinks || []).map((link) => {
      const resourceId = resourceIdMap.get(link.resourceId) || link.resourceId;
      const resource =
        stableResources.find((candidate) => candidate.id === resourceId) || existingResourceById.get(resourceId);
      return {
        ...link,
        resourceId,
        name: resource?.name || link.name || link.cachedName,
        cachedName: resource?.name || link.cachedName || link.name
      };
    });
    if (project.activeTermBaseId) {
      project.activeTermBaseId = resourceIdMap.get(project.activeTermBaseId) || project.activeTermBaseId;
    }
    const tmEntries = remapPackageRecords(
      packagedResources.tmEntries,
      "tm",
      existingTmEntries,
      reservedTmIds,
      tmEntryIdMap,
      (entry) => ({ ...entry, resourceId: resourceIdMap.get(entry.resourceId) || entry.resourceId })
    );
    const termConcepts = remapPackageRecords(
      packagedResources.termConcepts,
      "concept",
      existingTermConcepts,
      reservedConceptIds,
      conceptIdMap,
      (concept) => ({ ...concept, resourceId: resourceIdMap.get(concept.resourceId) || concept.resourceId })
    );
    const terms = remapPackageRecords(
      packagedResources.terms,
      "term",
      existingTerms,
      reservedTermIds,
      new Map(),
      (term) => ({
        ...term,
        resourceId: resourceIdMap.get(term.resourceId) || term.resourceId,
        conceptId: conceptIdMap.get(term.conceptId) || term.conceptId
      })
    );
    const termDesignations = remapPackageRecords(
      packagedResources.termDesignations,
      "designation",
      existingTermDesignations,
      reservedDesignationIds,
      new Map(),
      (designation) => ({
        ...designation,
        resourceId: resourceIdMap.get(designation.resourceId) || designation.resourceId,
        conceptId: conceptIdMap.get(designation.conceptId) || designation.conceptId
      })
    );
    const tmContributions = remapPackageRecords(
      packagedResources.tmContributions,
      "contribution",
      existingTmContributions,
      reservedContributionIds,
      new Map(),
      (contribution) => ({
        ...contribution,
        projectId: project.id,
        segmentId: segmentIdMap.get(contribution.segmentId) || contribution.segmentId,
        tmEntryId: tmEntryIdMap.get(contribution.tmEntryId) || contribution.tmEntryId,
        resourceId: resourceIdMap.get(contribution.resourceId) || contribution.resourceId
      })
    );
    return {
      ...pkg,
      project,
      segments,
      resources: {
        ...packagedResources,
        resources: stableResources,
        tmEntries,
        tmContributions,
        terms,
        termConcepts,
        termDesignations
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
