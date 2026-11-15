import { resourcePairKey, resourceSourceKey } from "./resource-query-core.js";

/** Review only groups with an explicitly selected keeper; concepts stay distinct. */
export function planDuplicateRemoval(rows, keepIds, { type, mode }) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      mode === "exact" ? resourcePairKey(row, type) : resourceSourceKey(row, type),
      type === "tb" ? row.conceptId || "" : ""
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const keep = [];
  const remove = [];
  if (!["exact", "alternatives"].includes(mode)) return { keep, remove };
  for (const group of groups.values()) {
    const retained = group.filter((row) => keepIds.has(row.id));
    if (retained.length && retained.length < group.length) {
      keep.push(...retained);
      remove.push(...group.filter((row) => !keepIds.has(row.id)));
    }
  }
  return { keep, remove };
}

/** Literal replacement never changes protected markup. */
export function replaceResourceText(text, find, replacement) {
  if (!find) return String(text || "");
  return String(text || "")
    .split(/(<[^>]*>|\{\{[^}]*\}\}|\{\d+\})/g)
    .map((part) => (/^(<[^>]*>|\{\{[^}]*\}\}|\{\d+\})$/.test(part) ? part : part.split(find).join(replacement)))
    .join("");
}

export function planResourceChanges(
  rows,
  { type, action, field = "target", find = "", replacement = "", status = "preferred" }
) {
  const sourceKey = type === "tm" ? "source" : "sourceTerm";
  const targetKey = type === "tm" ? "target" : "targetTerm";
  const changes = [];
  for (const before of rows) {
    if (action === "delete") {
      changes.push({ before, delete: true });
      continue;
    }
    const after = { ...before };
    if (action === "status" && type === "tb") {
      after.status = status;
      after.isForbidden = status === "forbidden";
    }
    if (action === "replace") {
      if (["source", "both"].includes(field))
        after[sourceKey] = replaceResourceText(before[sourceKey], find, replacement);
      if (["target", "both"].includes(field))
        after[targetKey] = replaceResourceText(before[targetKey], find, replacement);
    }
    if ([sourceKey, targetKey, "status", "isForbidden"].some((key) => before[key] !== after[key]))
      changes.push({ before, after });
  }
  return changes;
}
