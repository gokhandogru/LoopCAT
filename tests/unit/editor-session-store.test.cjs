"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("EditorSessionStore owns current project data behind a checked immutable snapshot", async () => {
  const { createEditorSessionStore } = await moduleAt("src/features/editor/editor-session-store.js");
  const store = createEditorSessionStore();
  const changes = [];
  store.subscribe((next, previous, patch) => changes.push({ next, previous, patch }));

  const project = { id: "project-1", name: "Project" };
  const segments = [{ id: "segment-1", projectId: project.id }];
  const next = store.replace({ project, segments, ignored: true });

  assert.equal(Object.isFrozen(next), true);
  assert.equal(next.project, project);
  assert.equal(next.segments, segments);
  assert.equal("ignored" in next, false);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].previous.project, null);
  assert.deepEqual(changes[0].patch, { project, segments });
});

test("EditorSessionStore compatibility bridge delegates only unmigrated replacements", async () => {
  const { createEditorSessionStore, EDITOR_SESSION_COMPATIBILITY_FIELDS } = await moduleAt(
    "src/features/editor/editor-session-store.js"
  );
  const store = createEditorSessionStore();
  const compatibility = store.attachCompatibility({ transient: true });

  compatibility.projects = [{ id: "project-1" }];

  assert.deepEqual(store.getState().projects, [{ id: "project-1" }]);
  assert.equal(compatibility.projects, store.getState().projects);
  assert.equal(Object.prototype.hasOwnProperty.call(compatibility, "projectSummaries"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compatibility, "projectSummaryRevisions"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compatibility, "projectTerms"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compatibility, "activityEvents"), false);
  assert.equal(compatibility.transient, true);
  assert.deepEqual(
    EDITOR_SESSION_COMPATIBILITY_FIELDS.filter((name) => Object.prototype.hasOwnProperty.call(compatibility, name)),
    [...EDITOR_SESSION_COMPATIBILITY_FIELDS]
  );
  assert.throws(() => store.attachCompatibility({ project: null }), /cannot attach over existing state\.project/);
  assert.throws(() => {
    compatibility.segments = null;
  }, /segments must be an array/);
});

test("EditorSessionStore explicitly owns project summaries and copy-on-write revisions", async () => {
  const { createEditorSessionStore } = await moduleAt("src/features/editor/editor-session-store.js");
  const store = createEditorSessionStore({
    projectSummaries: [{ id: "project-1", wordCount: 4 }],
    projectSummaryRevisions: new Map([
      ["project-1", 2],
      ["removed-project", 7]
    ])
  });
  const originalRevisionMap = store.getState().projectSummaryRevisions;

  store.markProjectSummaryDirty("project-1");
  assert.equal(store.getProjectSummaryRevision("project-1"), 3);
  assert.equal(originalRevisionMap.get("project-1"), 2);

  store.pruneProjectSummaryRevisions(new Set(["project-1"]));
  assert.equal(store.getProjectSummaryRevision("removed-project"), 0);
  assert.deepEqual(Array.from(store.getState().projectSummaryRevisions), [["project-1", 3]]);

  const summaries = [{ id: "project-1", wordCount: 8 }];
  assert.equal(store.replaceProjectSummaries(summaries), summaries);
  assert.equal(store.getProjectSummaries(), summaries);
});

test("EditorSessionStore explicitly owns project terms and deduplicated activity events", async () => {
  const { createEditorSessionStore } = await moduleAt("src/features/editor/editor-session-store.js");
  const originalTerm = { id: "term-1", sourceTerm: "source" };
  const originalEvent = { id: "activity-1", type: "project-opened" };
  const store = createEditorSessionStore({
    projectTerms: [originalTerm],
    activityEvents: [originalEvent]
  });

  assert.deepEqual(store.getProjectTerms(), [originalTerm]);
  assert.deepEqual(store.getActivityEvents(), [originalEvent]);

  const projectTerms = [{ id: "term-2", sourceTerm: "updated" }];
  assert.equal(store.replaceProjectTerms(projectTerms), projectTerms);
  assert.equal(store.getProjectTerms(), projectTerms);

  const olderEvent = { id: "activity-2", type: "import" };
  const updatedOriginalEvent = { ...originalEvent, summary: "Opened again" };
  store.replaceActivityEvents([originalEvent, olderEvent]);
  const activityEvents = store.prependActivityEvent(updatedOriginalEvent);

  assert.deepEqual(activityEvents, [updatedOriginalEvent, olderEvent]);
  assert.equal(store.getActivityEvents(), activityEvents);
  assert.throws(() => store.replaceProjectTerms(null), /projectTerms must be an array/);
  assert.throws(() => store.replaceActivityEvents(null), /activityEvents must be an array/);
});
