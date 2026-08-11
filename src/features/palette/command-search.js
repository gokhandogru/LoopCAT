const GROUP_ORDER = Object.freeze([
  "Recent",
  "Translation",
  "Filters",
  "Review & quality",
  "Navigation",
  "Project",
  "Export",
  "AI",
  "Other"
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .trim();
}

function subsequenceScore(haystack, needle) {
  if (!needle) return 1;
  let cursor = 0;
  let gapPenalty = 0;
  let streak = 0;
  let streakBonus = 0;
  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index < 0) return Number.NEGATIVE_INFINITY;
    const gap = index - cursor;
    if (gap === 0) {
      streak += 1;
      streakBonus += streak * 2;
    } else {
      gapPenalty += gap;
      streak = 0;
    }
    cursor = index + 1;
  }
  return 30 + streakBonus - gapPenalty;
}

function commandScore(command, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return 0;
  const label = normalize(command.label);
  const id = normalize(command.id).replaceAll("-", " ");
  const keywords = normalize(Array.isArray(command.keywords) ? command.keywords.join(" ") : command.keywords);
  const searchable = `${label} ${id} ${keywords}`.trim();
  if (label === query) return 1000;
  if (label.startsWith(query)) return 800 - label.length;
  if (label.includes(query)) return 600 - label.indexOf(query);
  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.every((token) => searchable.includes(token))) return 400 - searchable.length / 100;
  return subsequenceScore(searchable, query);
}

export function inferCommandGroup(command) {
  if (command.group) return command.group;
  const id = String(command.id || "");
  if (id.startsWith("local-ai") || id.includes("openai")) return "AI";
  if (id.includes("qa") || id.includes("quality") || id.includes("review")) return "Review & quality";
  if (id.includes("report") || id.includes("export")) return "Export";
  if (id.includes("project") || id.includes("resource")) return "Project";
  if (id.includes("next") || id.includes("focus") || id.includes("concordance")) return "Navigation";
  if (id.includes("confirm") || id.includes("copy-source") || id.includes("save-tm") || id.includes("replace"))
    return "Translation";
  return "Other";
}

export function searchCommands(commands, query, recentIds = []) {
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));
  const normalizedQuery = normalize(query);
  const matches = commands
    .map((command, index) => ({
      ...command,
      group: inferCommandGroup(command),
      originalIndex: index,
      score: commandScore(command, normalizedQuery)
    }))
    .filter((command) => !normalizedQuery || Number.isFinite(command.score));

  matches.sort((left, right) => {
    if (normalizedQuery) return right.score - left.score || left.originalIndex - right.originalIndex;
    const leftRecent = recentRank.has(left.id) ? recentRank.get(left.id) : Number.POSITIVE_INFINITY;
    const rightRecent = recentRank.has(right.id) ? recentRank.get(right.id) : Number.POSITIVE_INFINITY;
    if (leftRecent !== rightRecent) return leftRecent - rightRecent;
    const leftGroup = GROUP_ORDER.indexOf(left.group);
    const rightGroup = GROUP_ORDER.indexOf(right.group);
    return leftGroup - rightGroup || left.originalIndex - right.originalIndex;
  });

  return matches;
}

export function groupCommandResults(commands, recentIds = [], hasQuery = false) {
  const recentSet = new Set(recentIds);
  const groups = new Map();
  for (const command of commands) {
    const group = !hasQuery && recentSet.has(command.id) ? "Recent" : command.group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
  }
  return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({ group, commands: groups.get(group) }));
}
