const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProjectDocumentCatalogService, overrides = {}) {
  const calls = [];
  const project = overrides.project === undefined ? { sourceFileName: "Project source.docx" } : overrides.project;
  const manifest = overrides.manifest || [
    { id: "manifest-a", name: "Manifest A", type: "HTML" },
    { id: "", name: "Invalid", type: "txt" },
    null,
    { id: "manifest-a", name: "Duplicate", type: "txt" },
    { id: "metadata-only", name: "", type: "" }
  ];
  const segments = overrides.segments || [
    { id: "a-1", documentId: "manifest-a", documentName: "Segment A", documentType: "txt" },
    { id: "default-1", documentName: "Default segment", documentType: "XLIFF" },
    { id: "b-1", documentId: "doc-b", documentName: "", documentType: "JSON" },
    { id: "metadata-1", documentId: "metadata-only", documentName: "Metadata segment", documentType: "TBX" }
  ];
  let selectedDocumentId = overrides.selectedDocumentId || "";
  const service = createProjectDocumentCatalogService({
    getProject() {
      calls.push(["getProject"]);
      return project;
    },
    getManifest(value) {
      calls.push(["getManifest", value]);
      return manifest;
    },
    getSegments() {
      calls.push(["getSegments"]);
      return segments;
    },
    getSelectedDocumentId() {
      calls.push(["getSelectedDocumentId"]);
      return selectedDocumentId;
    },
    normalizeType(value) {
      calls.push(["normalizeType", value]);
      return String(value || "").toLowerCase();
    }
  });
  return {
    calls,
    manifest,
    project,
    segments,
    service,
    setSelectedDocumentId(value) {
      selectedDocumentId = value;
    }
  };
}

test("ProjectDocumentCatalogService preserves manifest-first reconciliation, invalid and duplicate rejection, fallbacks, and order", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  const { manifest, project, segments, service } = createHarness(createProjectDocumentCatalogService);
  const manifestSnapshot = structuredClone(manifest);
  const projectSnapshot = structuredClone(project);
  const segmentSnapshot = structuredClone(segments);

  assert.deepEqual(service.list(), [
    { id: "manifest-a", name: "Manifest A", type: "html" },
    { id: "metadata-only", name: "Project source.docx", type: "docx" },
    { id: "default-document", name: "Default segment", type: "xliff" },
    { id: "doc-b", name: "Project source.docx", type: "json" }
  ]);
  assert.deepEqual(manifest, manifestSnapshot);
  assert.deepEqual(project, projectSnapshot);
  assert.deepEqual(segments, segmentSnapshot);
});

test("ProjectDocumentCatalogService preserves Document/docx fallbacks without a project source filename", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  const { service } = createHarness(createProjectDocumentCatalogService, {
    project: null,
    manifest: [{ id: "manifest", name: "", type: "" }],
    segments: [{ id: "segment", documentId: "segment-doc", documentName: "", documentType: "" }]
  });

  assert.deepEqual(service.list(), [
    { id: "manifest", name: "Document", type: "docx" },
    { id: "segment-doc", name: "Document", type: "docx" }
  ]);
});

test("ProjectDocumentCatalogService preserves standalone type normalization and exact document segment filtering", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  const { segments, service } = createHarness(createProjectDocumentCatalogService);

  assert.equal(service.type({ type: "SDLXLIFF" }), "sdlxliff");
  assert.equal(service.type(null), "");
  assert.deepEqual(service.segments("manifest-a"), [segments[0]]);
  assert.deepEqual(service.segments("default-document"), []);
  assert.deepEqual(service.segments("missing"), []);
});

test("ProjectDocumentCatalogService preserves selected-document and all-segment current scopes", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  const { segments, service, setSelectedDocumentId } = createHarness(createProjectDocumentCatalogService);

  assert.equal(service.currentSegments(), segments);
  setSelectedDocumentId("manifest-a");
  assert.deepEqual(service.currentSegments(), [segments[0]]);
  assert.notEqual(service.currentSegments(), segments);
  setSelectedDocumentId("missing");
  assert.deepEqual(service.currentSegments(), []);
});

test("ProjectDocumentCatalogService preserves selected document null, found, and missing fallbacks", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  const { calls, service, setSelectedDocumentId } = createHarness(createProjectDocumentCatalogService);

  assert.equal(service.selected(), null);
  assert.equal(
    calls.some(([name]) => name === "getManifest"),
    false
  );
  setSelectedDocumentId("doc-b");
  assert.deepEqual(service.selected(), { id: "doc-b", name: "Project source.docx", type: "json" });
  setSelectedDocumentId("missing");
  assert.equal(service.selected(), null);
});

test("ProjectDocumentCatalogService validates boundaries and exposes an immutable API", async () => {
  const { createProjectDocumentCatalogService } = await moduleAt(
    "src/features/projects/project-document-catalog-service.js"
  );
  assert.throws(
    () => createProjectDocumentCatalogService({}),
    /requires project, manifest, segment, selection, and type-normalization boundaries/
  );
  const { service } = createHarness(createProjectDocumentCatalogService);
  assert.equal(Object.isFrozen(service), true);
});
