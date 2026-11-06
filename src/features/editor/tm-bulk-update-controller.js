import { createTmBulkUpdateService, eligibleForTmUpdate, tmUpdateLanguageMatches } from "./tm-bulk-update-service.js";

/** @param {any} options */
export function createTmBulkUpdateController(options) {
  const { document, session, localization, lifecycle } = options;
  const dialog = document.querySelector("#tmBulkUpdateDialog");
  const scope = document.querySelector("#tmBulkUpdateScope");
  const summary = document.querySelector("#tmBulkUpdateSummary");
  const report = document.querySelector("#tmBulkUpdateReport");
  const apply = document.querySelector("#tmBulkUpdateApply");
  const close = document.querySelector("#tmBulkUpdateClose");
  const service = createTmBulkUpdateService(options);
  let project = null;
  let documentId = "";
  let running = false;
  let canceled = false;
  function rows() {
    return session
      .getSegments()
      .filter((s) => s.projectId === project?.id && (scope.value === "project" || s.documentId === documentId));
  }
  function refresh() {
    const count = rows().filter(
      (s) => eligibleForTmUpdate(s) && tmUpdateLanguageMatches(s, project) && !options.missingTags(s).length
    ).length;
    const link = project?.resourceLinks?.find((item) => item.type === "tm" && item.role === "main");
    summary.textContent = localization.source("Destination: {name}. Eligible segments: {count}.", {
      name: link?.cachedName || link?.name || project?.mainTmName || "—",
      count
    });
    apply.disabled = running || !count || !link?.resourceId;
  }
  lifecycle.register({
    id: "tm-bulk-update",
    dialog,
    opener: document.querySelector("#tmBulkUpdateBtn"),
    initialFocus: scope,
    beforeOpen() {
      project = session.getProject();
      documentId = options.getDocumentId();
      scope.value = "document";
      report.textContent = "";
      refresh();
      if (!project?.resourceLinks?.some((item) => item.type === "tm" && item.role === "main" && item.resourceId)) {
        report.textContent = localization.source("Choose a main translation memory in project settings.");
      }
    },
    onCancel(event) {
      if (running) {
        event.preventDefault();
        canceled = true;
      }
    }
  });
  scope.addEventListener("change", refresh);
  close.addEventListener("click", () => {
    if (running) canceled = true;
    else lifecycle.close("tm-bulk-update");
  });
  apply.addEventListener("click", async () => {
    if (running || !project) return;
    running = true;
    canceled = false;
    apply.disabled = true;
    scope.disabled = true;
    close.textContent = localization.source("Cancel");
    dialog.setAttribute("aria-busy", "true");
    let result;
    try {
      result = await service.run({
        project,
        segments: rows(),
        canceled: () => canceled || session.getProject()?.id !== project.id,
        progress: (state) => {
          report.textContent = localization.source("Updating TM: {done} of {total} segments processed.", {
            done: state.added + state.existing + state.skipped,
            total: state.total
          });
        }
      });
      report.textContent = localization.source(
        "Added: {added}. Already present: {existing}. Skipped: {skipped}. Failed: {failed}.",
        result
      );
      if (result.canceled)
        report.textContent +=
          " " + localization.source("Canceled. Completed updates were kept; you can safely run this action again.");
      if (result.failed)
        report.textContent +=
          " " +
          localization.source(
            "Stopped after a save failure. Completed updates were kept; retry after resolving the error."
          );
      for (const error of result.errors) report.textContent += `\n${error.segmentId}: ${error.message}`;
    } catch (error) {
      report.textContent = localization.source(error.message || "TM update failed.");
    } finally {
      if (result?.added || result?.existing) {
        options.markDirty(project.id);
        try {
          await options.refresh();
        } catch {
          report.textContent +=
            " " +
            localization.source("TM saved, but the resource view could not refresh. Reopen it to see the changes.");
        }
      }
      running = false;
      scope.disabled = false;
      close.textContent = localization.source("Close");
      dialog.setAttribute("aria-busy", "false");
      refresh();
    }
  });
  return { open: () => lifecycle.open("tm-bulk-update") };
}
