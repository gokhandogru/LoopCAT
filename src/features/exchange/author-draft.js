// A private editing document. It may be incomplete and is never an installable pack.
const MAX_BYTES = 1024 * 1024;
const invalid = () => {
  throw new Error("Invalid or oversized private author draft.");
};
function record(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some((k) => !keys.includes(k)))
    invalid();
}
function strings(value, keys) {
  for (const k of keys)
    if (Object.hasOwn(value, k) && (typeof value[k] !== "string" || value[k].length > 16384)) invalid();
}
function check(draft) {
  const meta = ["id", "name", "version", "publisher", "description", "license", "attribution"];
  record(draft, [
    "format",
    "schemaVersion",
    "kind",
    "entries",
    "languages",
    "allowTermCopy",
    "exchangeAuthorSelection",
    ...meta
  ]);
  if (
    draft.format !== "loopcat-pack" ||
    draft.schemaVersion !== 1 ||
    !["terminology", "qa"].includes(draft.kind) ||
    !Array.isArray(draft.entries) ||
    draft.entries.length > 500 ||
    (draft.kind === "qa" && draft.entries.length > 100)
  )
    invalid();
  strings(draft, meta);
  record(draft.languages, ["source", "target"]);
  strings(draft.languages, ["source", "target"]);
  if (draft.allowTermCopy !== undefined && (draft.kind !== "terminology" || typeof draft.allowTermCopy !== "boolean"))
    invalid();
  const selection = draft.exchangeAuthorSelection;
  if (
    !Array.isArray(selection) ||
    selection.length !== draft.entries.length ||
    selection.some((v) => typeof v !== "boolean")
  )
    invalid();
  for (const row of draft.entries) {
    const keys =
      draft.kind === "terminology"
        ? ["sourceTerm", "targetTerm", "conceptId", "domain", "attribution", "status"]
        : ["id", "op", "source", "message", "severity"];
    record(row, [...keys, "caseSensitive", ...(draft.kind === "qa" ? ["targets", "examples"] : [])]);
    strings(row, keys);
    if (row.caseSensitive !== undefined && typeof row.caseSensitive !== "boolean") invalid();
    if (draft.kind === "qa") {
      if (
        !Array.isArray(row.targets) ||
        row.targets.length > 32 ||
        row.targets.some((v) => typeof v !== "string" || v.length > 16384) ||
        !Array.isArray(row.examples) ||
        row.examples.length > 16
      )
        invalid();
      for (const e of row.examples) {
        record(e, ["source", "target", "expect"]);
        strings(e, ["source", "target"]);
        if (!["pass", "fail"].includes(e.expect)) invalid();
      }
    }
  }
  return draft;
}
export function encodeAuthorDraft(input) {
  const file = new Blob(
    [JSON.stringify({ format: "loopcat-private-author-draft", schemaVersion: 1, draft: check(input) })],
    { type: "application/json" }
  );
  if (file.size > MAX_BYTES) invalid();
  return file;
}
export async function readAuthorDraft(file) {
  if (!file || file.size > MAX_BYTES) invalid();
  const json = JSON.parse(await file.text());
  record(json, ["format", "schemaVersion", "draft"]);
  if (json.format !== "loopcat-private-author-draft" || json.schemaVersion !== 1) invalid();
  return check(json.draft);
}
