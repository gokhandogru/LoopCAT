const assert = require("node:assert/strict");
const test = require("node:test");

test("date ordering compares creation instants and keeps undated projects last", async () => {
  const { sortProjects } = await import("../../src/features/projects/project-order.js");
  const newer = { createdAt: "2026-03-01T11:00:00Z" };
  const older = { createdAt: "2026-03-01T12:00:00+02:00", updatedAt: "2026-04-01" };
  const undated = { updatedAt: "2026-05-01" };
  const invalid = { createdAt: "unknown" };
  const projects = Object.freeze([undated, older, invalid, newer]);

  assert.deepEqual(sortProjects(projects), [newer, older, undated, invalid]);
  assert.deepEqual(sortProjects(projects, "oldest"), [older, newer, undated, invalid]);
});

test("name ordering follows the UI locale and compares numbers naturally", async () => {
  const { sortProjects } = await import("../../src/features/projects/project-order.js");
  const dotted = { name: "İpek" };
  const dotless = { name: "Isparta" };
  const two = { name: "Dosya 2" };
  const ten = { name: "dosya 10" };
  const projects = Object.freeze([ten, dotted, dotless, two]);

  assert.deepEqual(sortProjects(projects, "name-asc", "tr-TR"), [two, ten, dotless, dotted]);
  assert.deepEqual(sortProjects(projects, "name-desc", "tr-TR"), [dotted, dotless, ten, two]);
  assert.deepEqual(sortProjects(projects, "name-asc", "custom pack"), sortProjects(projects, "name-asc"));
});
