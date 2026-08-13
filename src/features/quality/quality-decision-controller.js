const DECISION_CATEGORIES = new Set([
  "accuracy",
  "terminology",
  "fluency",
  "style",
  "locale",
  "formatting",
  "compliance",
  "review"
]);
const DECISION_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function stableLower(value) {
  return String(value || "").toLowerCase();
}

function normalizeCategory(value) {
  const category = stableLower(value);
  return DECISION_CATEGORIES.has(category) ? category : "review";
}

function normalizeSeverity(value) {
  const severity = stableLower(value);
  return DECISION_SEVERITIES.has(severity) ? severity : "medium";
}

/**
 * Owns quality-decision normalization, structured comment creation,
 * persistence, risk refresh, optional activity status, presentation, and
 * failure recovery. Project and segment records remain owned by
 * EditorSessionStore and durable effects stay behind injected boundaries.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceQualityRiskQueue: (queue: any) => unknown },
 *   selection: { getActiveIndex: () => number },
 *   mutation: { touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown },
 *   persistence: { clearPending: (segment: any) => unknown, save: (segment: any) => Promise<unknown> },
 *   risk: { buildQueue: () => any },
 *   activity: { log: (segment: any, project: any, decision: { category: string, severity: string }) => Promise<boolean> | boolean },
 *   presentation: { clearNote: () => void, renderReview: (options?: { force?: boolean }) => void, renderWorkbench: () => void, updateRow: (index: number) => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   labels: { category: (category: string) => string, severity: (severity: string) => string },
 *   ids?: { comment?: () => string },
 *   clock?: { now?: () => string }
 * }} options
 */
export function createQualityDecisionController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const risk = options?.risk;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  const labels = options?.labels;
  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceQualityRiskQueue !== "function"
  ) {
    throw new TypeError("QualityDecisionController requires EditorSessionStore boundaries.");
  }
  if (typeof selection?.getActiveIndex !== "function") {
    throw new TypeError("QualityDecisionController requires the active segment selection boundary.");
  }
  if (
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function"
  ) {
    throw new TypeError("QualityDecisionController requires segment mutation adapters.");
  }
  if (typeof persistence?.clearPending !== "function" || typeof persistence?.save !== "function") {
    throw new TypeError("QualityDecisionController requires persistence boundaries.");
  }
  if (typeof risk?.buildQueue !== "function" || typeof activity?.log !== "function") {
    throw new TypeError("QualityDecisionController requires risk and activity boundaries.");
  }
  if (
    typeof presentation?.clearNote !== "function" ||
    typeof presentation?.renderReview !== "function" ||
    typeof presentation?.renderWorkbench !== "function" ||
    typeof presentation?.updateRow !== "function"
  ) {
    throw new TypeError("QualityDecisionController requires quality presentation boundaries.");
  }
  if (
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function" ||
    typeof labels?.category !== "function" ||
    typeof labels?.severity !== "function"
  ) {
    throw new TypeError("QualityDecisionController requires workspace, status, and label boundaries.");
  }

  const createCommentId =
    typeof options.ids?.comment === "function"
      ? options.ids.comment
      : () => `comment-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  async function save(values = {}) {
    const project = editorSessionStore.getProject();
    if (!project) return false;
    const segment = currentSegment();
    if (!segment) return false;
    const snapshot = structuredClone(segment);
    const category = normalizeCategory(values?.category);
    const severity = normalizeSeverity(values?.severity);
    const note = String(values?.note || "").trim();
    const decisionTitle = `Quality decision: ${labels.category(category)} (${labels.severity(severity)})`;
    const timestamp = now();
    try {
      segment.reviewState = "needs-review";
      segment.comments = [
        ...(segment.comments || []),
        {
          id: createCommentId(),
          body: [decisionTitle, note].filter(Boolean).join("\n"),
          state: "open",
          qualityDecision: { category, severity },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ];
      mutation.touch(segment);
      persistence.clearPending(segment);
      await persistence.save(segment);
      presentation.clearNote();
      editorSessionStore.replaceQualityRiskQueue(risk.buildQueue());
      presentation.renderReview({ force: true });
      presentation.renderWorkbench();
      presentation.updateRow(selection.getActiveIndex());
      workspace.markDirty();
      const activityLogged = await activity.log(segment, project, { category, severity });
      status.set(
        activityLogged ? "Quality decision saved" : "Quality decision saved; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderReview({ force: true });
      presentation.renderWorkbench();
      presentation.updateRow(selection.getActiveIndex());
      status.set(error?.message || "Quality decision save failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ save });
}
