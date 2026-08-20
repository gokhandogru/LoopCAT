/**
 * Owns direct segment-to-translation-memory persistence and the active-segment
 * save action. Segment selection, TM naming/repository work, match refresh,
 * workspace dirtiness, and status presentation remain injected boundaries.
 *
 * @param {{
 *   session: { getProject: () => any },
 *   selection: { getActiveSegment: () => any },
 *   tm: { saveEntry: (entry: object) => Promise<any>, mainName: (project: any) => string, refreshMatches: () => Promise<unknown> },
 *   workspace: { markDirty: (projectId: string) => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   testHooks?: { beforeSave?: (segment: any) => void }
 * }} options
 */
export function createSegmentTmSaveController(options) {
  const session = options?.session;
  const selection = options?.selection;
  const tm = options?.tm;
  const workspace = options?.workspace;
  const status = options?.status;
  if (typeof session?.getProject !== "function" || typeof selection?.getActiveSegment !== "function") {
    throw new TypeError("SegmentTmSaveController requires session and selection boundaries.");
  }
  if (
    typeof tm?.saveEntry !== "function" ||
    typeof tm?.mainName !== "function" ||
    typeof tm?.refreshMatches !== "function"
  ) {
    throw new TypeError("SegmentTmSaveController requires translation-memory boundaries.");
  }
  if (typeof workspace?.markDirty !== "function" || typeof status?.set !== "function") {
    throw new TypeError("SegmentTmSaveController requires workspace and status boundaries.");
  }

  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};

  async function save(segment, project = session.getProject()) {
    if (!segment || !project || !segment.source.trim() || !segment.target.trim()) return null;
    beforeSave(segment);
    const entry = await tm.saveEntry({
      source: segment.source,
      target: segment.target,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      projectName: project.name,
      tmName: tm.mainName(project)
    });
    workspace.markDirty(project.id);
    return entry;
  }

  async function saveActive(saveOptions = {}) {
    const { reportStatus = true } = saveOptions || {};
    const segment = selection.getActiveSegment();
    if (!segment || !session.getProject() || !segment.source.trim() || !segment.target.trim()) return null;
    try {
      const entry = await save(segment, session.getProject());
      await tm.refreshMatches();
      if (reportStatus) status.set("Segment saved to TM", "saved");
      return entry;
    } catch (error) {
      if (!reportStatus) throw error;
      status.set(error.message || "Save to TM failed", "dirty");
      return null;
    }
  }

  return Object.freeze({ save, saveActive });
}
