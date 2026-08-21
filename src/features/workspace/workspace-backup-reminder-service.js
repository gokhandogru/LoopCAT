const BACKUP_REMINDER_STORAGE = "loopcat.backupReminder.dismissedUntil";
const BACKUP_REMINDER_PROJECT_DAYS = 7;
const BACKUP_REMINDER_EXPORT_DAYS = 7;
const BACKUP_REMINDER_ACTIVITY_COUNT = 25;
const BACKUP_REMINDER_ACTIVITY_SINCE_EXPORT = 10;
const BACKUP_REMINDER_DISMISS_HOURS = 24;

/**
 * Owns project-package backup-reminder policy, dismissal persistence, and
 * presentation orchestration. Project/activity records, browser storage, clock
 * primitives, export history writes, and recovery DOM rendering stay injected.
 */
export function createWorkspaceBackupReminderService({ session, storage, clock, recovery }) {
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getActivityEvents !== "function" ||
    typeof storage?.getItem !== "function" ||
    typeof storage?.setItem !== "function" ||
    typeof storage?.removeItem !== "function" ||
    typeof clock?.now !== "function" ||
    typeof clock?.nowMs !== "function" ||
    typeof clock?.create !== "function" ||
    typeof recovery?.render !== "function"
  ) {
    throw new TypeError(
      "WorkspaceBackupReminderService requires checked session, storage, clock, and recovery boundaries."
    );
  }

  function daysBetween(fromIso, toDate = clock.now()) {
    const from = clock.create(fromIso || 0);
    if (!Number.isFinite(from.getTime())) return Infinity;
    return Math.max(0, Math.floor((toDate.getTime() - from.getTime()) / 86400000));
  }

  function dismissals() {
    try {
      const parsed = JSON.parse(storage.getItem(BACKUP_REMINDER_STORAGE) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      storage.removeItem(BACKUP_REMINDER_STORAGE);
      return {};
    }
  }

  function isDismissed(projectId, now = clock.now()) {
    const until = dismissals()[projectId];
    return until ? clock.create(until).getTime() > now.getTime() : false;
  }

  function render() {
    const reminderInfo = info();
    recovery.render({ info: reminderInfo });
  }

  function dismiss(projectId = session.getProject()?.id, hours = BACKUP_REMINDER_DISMISS_HOURS) {
    if (!projectId) return;
    const dismissed = dismissals();
    dismissed[projectId] = clock.create(clock.nowMs() + hours * 60 * 60 * 1000).toISOString();
    try {
      storage.setItem(BACKUP_REMINDER_STORAGE, JSON.stringify(dismissed));
    } catch {
      // The reminder is advisory; failing to persist dismissal should not interrupt editing.
    }
    render();
  }

  function latestExport(project = session.getProject()) {
    const history = (project?.exportHistory || []).filter(
      (entry) => entry.type === "project-package" && entry.createdAt
    );
    return history.sort((a, b) => clock.create(b.createdAt || 0) - clock.create(a.createdAt || 0))[0] || null;
  }

  function info(project = session.getProject(), activityEvents = session.getActivityEvents(), now = clock.now()) {
    if (!project || isDismissed(project.id, now)) return null;
    const latest = latestExport(project);
    const projectAgeDays = daysBetween(project.createdAt, now);
    const daysSinceExport = latest ? daysBetween(latest.createdAt, now) : Infinity;
    const exportTime = latest ? clock.create(latest.createdAt).getTime() : 0;
    const activitiesSinceExport = (activityEvents || []).filter(
      (event) => clock.create(event.createdAt || 0).getTime() > exportTime
    ).length;
    const isLongRunning =
      projectAgeDays >= BACKUP_REMINDER_PROJECT_DAYS || (activityEvents || []).length >= BACKUP_REMINDER_ACTIVITY_COUNT;
    const needsBackup =
      !latest ||
      daysSinceExport >= BACKUP_REMINDER_EXPORT_DAYS ||
      activitiesSinceExport >= BACKUP_REMINDER_ACTIVITY_SINCE_EXPORT;
    if (!isLongRunning || !needsBackup) return null;
    const reason = !latest
      ? `This project is ${projectAgeDays} day${projectAgeDays === 1 ? "" : "s"} old and has no project package export yet.`
      : `${activitiesSinceExport} project activit${activitiesSinceExport === 1 ? "y has" : "ies have"} happened since the last project package export.`;
    return {
      reason,
      projectAgeDays,
      daysSinceExport,
      activitiesSinceExport
    };
  }

  return Object.freeze({ daysBetween, dismissals, isDismissed, dismiss, latestExport, info, render });
}
