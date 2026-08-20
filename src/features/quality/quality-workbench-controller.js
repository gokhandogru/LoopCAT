/**
 * Owns quality-risk queue composition/cache refresh, active evidence, workbench
 * presentation composition, QA-driven refresh, and quality-risk navigation.
 * Stores, risk/scoring primitives, QA, filters, navigation, focus, and DOM
 * presentation remain behind injected boundaries.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     getSegments: () => any[],
 *     getQaChecks: () => any[],
 *     getQualityRiskQueue: () => any,
 *     replaceQualityRiskQueue: (queue: any) => unknown
 *   },
 *   scope: { currentSegments: () => any[] },
 *   selection: { getSegment: () => any, getActiveIndex: () => number },
 *   quality: { buildRiskQueue: (options: object) => any, scoreSegment: (segment: any, index: number, options: object) => any },
 *   documents: { getSelectedId: () => string, clearSelection: () => unknown },
 *   filters: { matches: (segment: any) => boolean, reset: () => unknown },
 *   qa: { run: () => Promise<any[] | null> },
 *   navigation: { select: (index: number) => Promise<unknown> | unknown },
 *   presentation: { renderSegments: () => unknown, renderWorkbench: (viewModel: object) => unknown },
 *   focus: { target: () => unknown },
 *   status: { set: (message: string, mode?: string) => unknown }
 * }} options
 */
export function createQualityWorkbenchController(options) {
  const session = options?.session;
  const scope = options?.scope;
  const selection = options?.selection;
  const quality = options?.quality;
  const documents = options?.documents;
  const filters = options?.filters;
  const qa = options?.qa;
  const navigation = options?.navigation;
  const presentation = options?.presentation;
  const focus = options?.focus;
  const status = options?.status;
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof session?.getQaChecks !== "function" ||
    typeof session?.getQualityRiskQueue !== "function" ||
    typeof session?.replaceQualityRiskQueue !== "function"
  ) {
    throw new TypeError("QualityWorkbenchController requires session boundaries.");
  }
  if (
    typeof scope?.currentSegments !== "function" ||
    typeof selection?.getSegment !== "function" ||
    typeof selection?.getActiveIndex !== "function" ||
    typeof quality?.buildRiskQueue !== "function" ||
    typeof quality?.scoreSegment !== "function"
  ) {
    throw new TypeError("QualityWorkbenchController requires scope, selection, and quality boundaries.");
  }
  if (
    typeof documents?.getSelectedId !== "function" ||
    typeof documents?.clearSelection !== "function" ||
    typeof filters?.matches !== "function" ||
    typeof filters?.reset !== "function"
  ) {
    throw new TypeError("QualityWorkbenchController requires document and filter boundaries.");
  }
  if (
    typeof qa?.run !== "function" ||
    typeof navigation?.select !== "function" ||
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.renderWorkbench !== "function" ||
    typeof focus?.target !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "QualityWorkbenchController requires QA, navigation, presentation, focus, and status boundaries."
    );
  }

  function qaBySegment(qaChecks = session.getQaChecks()) {
    const map = new Map();
    (qaChecks || []).forEach((check) => {
      const segmentId = check?.segmentId || "";
      if (!segmentId) return;
      if (!map.has(segmentId)) map.set(segmentId, []);
      map.get(segmentId).push(check);
    });
    return map;
  }

  function buildQueue(qaChecks = session.getQaChecks()) {
    if (!session.getProject()) return null;
    return quality.buildRiskQueue({
      project: session.getProject(),
      segments: scope.currentSegments(),
      qaChecks,
      profile: session.getProject().qualityProfile
    });
  }

  function evidence(queue = null) {
    const segment = selection.getSegment();
    if (!session.getProject() || !segment) return null;
    const queuedItem = (queue?.items || []).find((item) => item.segmentId === segment.id);
    if (queuedItem) return queuedItem;
    return quality.scoreSegment(segment, selection.getActiveIndex(), {
      profile: session.getProject().qualityProfile,
      qaBySegment: qaBySegment()
    });
  }

  function render() {
    const storedQueue = session.getQualityRiskQueue();
    const queue = session.getProject()
      ? storedQueue?.projectId === session.getProject().id
        ? storedQueue
        : buildQueue()
      : null;
    if (session.getProject()) session.replaceQualityRiskQueue(queue);
    presentation.renderWorkbench({
      project: session.getProject(),
      segment: selection.getSegment(),
      activeIndex: selection.getActiveIndex(),
      profile: session.getProject()?.qualityProfile,
      queue,
      evidence: evidence(queue)
    });
  }

  async function refresh() {
    if (!session.getProject()) return null;
    const checks = await qa.run();
    if (!checks) return null;
    session.replaceQualityRiskQueue(buildQueue(checks));
    render();
    return session.getQualityRiskQueue();
  }

  async function openRisk(item) {
    const index = session.getSegments().findIndex((segment) => segment.id === item?.segmentId);
    if (index === -1) return;
    const segment = session.getSegments()[index];
    if (!filters.matches(segment)) {
      if (documents.getSelectedId() && segment.documentId !== documents.getSelectedId()) {
        documents.clearSelection();
      }
      filters.reset();
      presentation.renderSegments();
    }
    await navigation.select(index);
    presentation.renderSegments();
    focus.target();
  }

  async function nextRisk() {
    if (!session.getProject()) return;
    const storedQueue = session.getQualityRiskQueue();
    if (!storedQueue || storedQueue.projectId !== session.getProject().id) {
      session.replaceQualityRiskQueue(buildQueue());
    }
    const queue = session.getQualityRiskQueue();
    if (!queue?.items?.length) {
      status.set("No quality risks in this scope", "saved");
      return;
    }
    const indexedItems = queue.items
      .map((item) => ({
        ...item,
        globalIndex: session.getSegments().findIndex((segment) => segment.id === item.segmentId)
      }))
      .filter((item) => item.globalIndex !== -1)
      .sort((a, b) => a.globalIndex - b.globalIndex);
    const afterActive = indexedItems.find((item) => item.globalIndex > selection.getActiveIndex());
    await openRisk(afterActive || indexedItems[0] || queue.items[0]);
  }

  return Object.freeze({ buildQueue, evidence, nextRisk, openRisk, qaBySegment, refresh, render });
}
