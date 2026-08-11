const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const commands = [
  { id: "confirm", label: "Confirm segment", enabled: true },
  { id: "quality-passport", label: "Export Quality Passport", enabled: true },
  { id: "local-ai-review", label: "AI review active segment", enabled: false },
  { id: "project-settings", label: "Project settings", enabled: true }
];

test("palette search ranks prefix and fuzzy command matches", async () => {
  const { searchCommands } = await moduleAt("src/features/palette/command-search.js");
  assert.equal(searchCommands(commands, "confirm")[0].id, "confirm");
  assert.equal(searchCommands(commands, "eqp")[0].id, "quality-passport");
  assert.equal(searchCommands(commands, "active review")[0].id, "local-ai-review");
});

test("palette groups recent commands first without changing command availability", async () => {
  const { groupCommandResults, searchCommands } = await moduleAt("src/features/palette/command-search.js");
  const searched = searchCommands(commands, "", ["project-settings", "local-ai-review"]);
  const groups = groupCommandResults(searched, ["project-settings", "local-ai-review"], false);
  assert.equal(groups[0].group, "Recent");
  assert.deepEqual(
    groups[0].commands.map((command) => command.id),
    ["project-settings", "local-ai-review"]
  );
  assert.equal(groups[0].commands[1].enabled, false);
});
