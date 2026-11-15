// Portable authored data only. Runtime addresses, credentials, participant
// records and executable prompt templates are never pack fields.
const PRIVATE =
  /(?:https?:\/\/|loopcat-credential:|Bearer\s+[\w./+=-]+|\b(?:sk-|gh[pousr]_|github_pat_|npm_)[A-Za-z\d_-]{8,}|-----BEGIN .*PRIVATE KEY-----)/i;
const ID = /^[a-z][a-z\d-]*(?:\.[a-z][a-z\d-]*)+$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z\d.-]+)?$/i;
const OPS = new Set(["generate", "compare", "terminology-critique"]);
function fail(reason) {
  throw new Error(`Invalid workflow pack: ${reason}.`);
}
function record(v, fields) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.keys(v).some((k) => !fields.includes(k))
  )
    fail("unexpected fields");
}
function str(v, max, name) {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    PRIVATE.test(v) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e]/.test(v)
  )
    fail(name);
  return v.trim();
}
function array(v, min, max, name) {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail(name);
  return v;
}
function distinct(rows, field) {
  const values = rows.map((r) => (field ? r[field] : r));
  if (new Set(values).size !== rows.length) fail("duplicate entries");
  return rows;
}
export function validateWorkflowEntries(kind, entries) {
  if (kind === "lesson") {
    return distinct(
      array(entries, 1, 32, "lesson size").map((e) => {
        record(e, ["id", "source", "rubric", "candidates"]);
        const id = str(e.id, 64, "exercise ID");
        if (!/^[a-z][a-z\d-]*$/.test(id)) fail("exercise ID");
        const rubric = distinct(
          array(e.rubric, 1, 8, "rubric size").map((v) => str(v, 120, "rubric criterion")),
          null
        );
        const candidates = array(e.candidates, 4, 4, "four frozen candidates required").map((c) => {
          record(c, ["label", "text"]);
          return { label: str(c.label, 100, "candidate label"), text: str(c.text, 4000, "candidate text") };
        });
        distinct(candidates, "label");
        return { id, source: str(e.source, 4000, "source"), rubric, candidates };
      }),
      "id"
    );
  }
  if (kind === "client") {
    return distinct(
      array(entries, 1, 32, "kit size").map((e) => {
        record(e, ["id", "version", "digest", "priority", "required"]);
        if (
          typeof e.id !== "string" ||
          e.id.length > 160 ||
          !ID.test(e.id) ||
          typeof e.version !== "string" ||
          e.version.length > 64 ||
          !VERSION.test(e.version) ||
          typeof e.digest !== "string" ||
          !/^[a-f\d]{64}$/.test(e.digest) ||
          !Number.isInteger(e.priority) ||
          e.priority < 0 ||
          e.priority > 100 ||
          typeof e.required !== "boolean"
        )
          fail("invalid kit reference");
        return { id: e.id, version: e.version, digest: e.digest, priority: e.priority, required: e.required };
      }),
      "id"
    );
  }
  if (kind === "ai") {
    return distinct(
      array(entries, 1, 3, "workflow size").map((e) => {
        record(e, ["operation", "providerIds", "maxRequests"]);
        if (!OPS.has(e.operation)) fail("unknown operation");
        const count = e.operation === "compare" ? 2 : 1;
        const providerIds = distinct(
          array(e.providerIds, count, e.operation === "compare" ? 4 : 1, "provider count").map((id) => {
            if (typeof id !== "string" || !/^[a-z][a-z\d-]{0,63}$/.test(id)) fail("invalid provider ID");
            return id;
          }),
          null
        );
        if (!Number.isInteger(e.maxRequests) || e.maxRequests < providerIds.length || e.maxRequests > 4)
          fail("request limit");
        return { operation: e.operation, providerIds, maxRequests: e.maxRequests };
      }),
      "operation"
    );
  }
  fail("unknown pack kind");
}

export const BLIND_LAB_SAMPLE = Object.freeze({
  format: "loopcat-pack",
  schemaVersion: 1,
  id: "loopcat.blind-lab",
  version: "1.0.0",
  kind: "lesson",
  name: "Blind Translation Lab",
  description:
    "Compare four frozen editorial examples before revealing their identities. No model or account required.",
  publisher: "LoopCAT",
  license: "CC0-1.0",
  languages: { source: "en", target: "ca" },
  entries: [
    {
      id: "delivery-window",
      source: "The delivery window closes at noon. Please confirm receipt.",
      rubric: ["Accuracy", "Fluency", "Terminology", "Post-editing effort"],
      candidates: [
        {
          label: "Editorial sample 1 · literal",
          text: "La finestra de lliurament es tanca al migdia. Confirmeu-ne la recepció."
        },
        {
          label: "Editorial sample 2 · idiomatic",
          text: "El termini de lliurament acaba al migdia. Confirmeu que ho heu rebut."
        },
        {
          label: "Editorial sample 3 · different register",
          text: "Tens fins al migdia per fer el lliurament. Avisa quan ho rebis."
        },
        {
          label: "Editorial sample 4 · semantic error",
          text: "El termini de lliurament comença al migdia. Confirmeu que ho heu rebut."
        }
      ]
    }
  ]
});
