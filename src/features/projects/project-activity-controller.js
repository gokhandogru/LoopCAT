/**
 * Owns project activity recording, drafting, optional failure containment,
 * active-session refresh, and shared activity-result presentation policy.
 * Persistence, session state, workspace dirtiness, backup reminders, test
 * flags, portable sanitization, clocks, IDs, and logging remain injected owners.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     prependActivityEvent: (event: unknown) => unknown,
 *     replaceActivityEvents: (events: unknown) => unknown
 *   },
 *   repository: {
 *     record: (activity: unknown) => Promise<unknown> | unknown,
 *     list: (projectId: unknown) => Promise<unknown> | unknown
 *   },
 *   workspace: { mark: (projectId: unknown) => unknown },
 *   reminder: { render: () => unknown },
 *   ids: { make: (prefix: string) => unknown },
 *   defaults: { workspaceId: () => unknown, userId: () => unknown },
 *   clock: { iso: () => unknown },
 *   portable: { sanitize: (value: unknown) => unknown },
 *   logger: { warn: (...args: unknown[]) => unknown },
 *   testHooks: {
 *     beforeOptionalCurrent: (type: unknown) => unknown,
 *     beforeOptionalProject: (type: unknown) => unknown
 *   }
 * }} options
 */
export function createProjectActivityController(options) {
  const session = options?.session;
  const repository = options?.repository;
  const workspace = options?.workspace;
  const reminder = options?.reminder;
  const ids = options?.ids;
  const defaults = options?.defaults;
  const clock = options?.clock;
  const portable = options?.portable;
  const logger = options?.logger;
  const testHooks = options?.testHooks;

  if (
    typeof session?.getProject !== "function" ||
    typeof session.prependActivityEvent !== "function" ||
    typeof session.replaceActivityEvents !== "function"
  ) {
    throw new TypeError("ProjectActivityController requires project session boundaries.");
  }
  if (typeof repository?.record !== "function" || typeof repository.list !== "function") {
    throw new TypeError("ProjectActivityController requires activity repository boundaries.");
  }
  if (typeof workspace?.mark !== "function" || typeof reminder?.render !== "function") {
    throw new TypeError("ProjectActivityController requires workspace and reminder boundaries.");
  }
  if (
    typeof ids?.make !== "function" ||
    typeof defaults?.workspaceId !== "function" ||
    typeof defaults.userId !== "function" ||
    typeof clock?.iso !== "function" ||
    typeof portable?.sanitize !== "function"
  ) {
    throw new TypeError("ProjectActivityController requires portable activity policy boundaries.");
  }
  if (typeof logger?.warn !== "function") {
    throw new TypeError("ProjectActivityController requires an activity logger boundary.");
  }
  if (typeof testHooks?.beforeOptionalCurrent !== "function" || typeof testHooks.beforeOptionalProject !== "function") {
    throw new TypeError("ProjectActivityController requires optional-activity test boundaries.");
  }

  async function log(type, summary, detail = {}, project = session.getProject()) {
    if (!project) return null;
    const event = await repository.record({ projectId: project.id, type, summary, detail });
    if (event && session.getProject()?.id === project.id) {
      session.prependActivityEvent(event);
      reminder.render();
    }
    workspace.mark(project.id);
    return event;
  }

  function draft(project, type, summary, detail = {}) {
    const now = clock.iso();
    const event = {
      id: ids.make("activity"),
      workspaceId: project?.workspaceId || defaults.workspaceId() || "local-workspace",
      ownerId: project?.ownerId || defaults.userId() || "local-user",
      projectId: project?.id || "",
      type,
      summary: summary || type,
      detail,
      createdBy: project?.updatedBy || defaults.userId() || "local-user",
      createdAt: now
    };
    return portable.sanitize(event);
  }

  async function logOptional(type, summary, detail = {}, label = summary || type) {
    try {
      testHooks.beforeOptionalCurrent(type);
      await log(type, summary, detail);
      return true;
    } catch (activityError) {
      logger.warn(`${label} activity log failed.`, activityError);
      if (session.getProject()?.id) workspace.mark(session.getProject().id);
      return false;
    }
  }

  async function logOptionalForProject(projectId, type, summary, detail = {}, label = summary || type) {
    try {
      testHooks.beforeOptionalProject(type);
      const event = await repository.record({ projectId, type, summary, detail });
      if (session.getProject()?.id === projectId) {
        session.replaceActivityEvents(await repository.list(projectId));
        reminder.render();
      }
      workspace.mark(projectId);
      return { ok: true, event };
    } catch (activityError) {
      logger.warn(`${label} activity log failed.`, activityError);
      if (projectId) workspace.mark(projectId);
      return { ok: false, event: null };
    }
  }

  function appendWarning(message, activityLogged) {
    return activityLogged ? message : `${message}; activity log failed`;
  }

  function statusMode(mode, activityLogged) {
    return activityLogged ? mode : "dirty";
  }

  return Object.freeze({ log, draft, logOptional, logOptionalForProject, appendWarning, statusMode });
}
