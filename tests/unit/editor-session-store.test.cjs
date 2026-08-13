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

test("EditorSessionStore compatibility bridge delegates replacements without duplicating ownership", async () => {
  const { createEditorSessionStore, EDITOR_SESSION_FIELDS } = await moduleAt(
    "src/features/editor/editor-session-store.js"
  );
  const store = createEditorSessionStore();
  const compatibility = store.attachCompatibility({ transient: true });

  compatibility.projects = [{ id: "project-1" }];
  compatibility.projectSummaryRevisions = new Map([["project-1", 2]]);

  assert.deepEqual(store.getState().projects, [{ id: "project-1" }]);
  assert.equal(store.getState().projectSummaryRevisions.get("project-1"), 2);
  assert.equal(compatibility.projects, store.getState().projects);
  assert.equal(compatibility.transient, true);
  assert.deepEqual(
    EDITOR_SESSION_FIELDS.filter((name) => Object.prototype.hasOwnProperty.call(compatibility, name)),
    [...EDITOR_SESSION_FIELDS]
  );
  assert.throws(() => store.attachCompatibility({ project: null }), /cannot attach over existing state\.project/);
  assert.throws(() => {
    compatibility.segments = null;
  }, /segments must be an array/);
});
