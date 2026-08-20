export function createUiLocaleOrchestrationController({
  elements,
  locale,
  localization,
  dom,
  application,
  session,
  presentation,
  downloads,
  status,
  clock
}) {
  if (!localization?.source || !dom?.createOption || !dom.body) {
    throw new TypeError("UiLocaleOrchestrationController requires checked localization and DOM boundaries.");
  }
  if (!application?.dispatchLocale || !application.getView || !session?.getProject) {
    throw new TypeError("UiLocaleOrchestrationController requires checked application and session boundaries.");
  }
  for (const action of [
    "renderPanels",
    "renderFocusMode",
    "renderWorkspaceStatus",
    "renderProjectStorageStatus",
    "renderProjectsView",
    "renderResourcesView",
    "renderProjectHome",
    "renderProjectAnalysis",
    "renderEditor",
    "renderProgress",
    "renderReview",
    "renderWorkbench",
    "renderRevisionHistory",
    "renderQaResults",
    "refreshEditorContext"
  ]) {
    if (typeof presentation?.[action] !== "function") {
      throw new TypeError("UiLocaleOrchestrationController requires checked presentation actions.");
    }
  }
  if (!downloads?.write || !status?.set || !clock?.now) {
    throw new TypeError("UiLocaleOrchestrationController requires checked download, status, and clock boundaries.");
  }
  for (const action of [
    "availableLocales",
    "getLocale",
    "localizeStaticDom",
    "saveCustomLocale",
    "setLocale",
    "sourceCatalogJson"
  ]) {
    if (locale?.[action] != null && typeof locale[action] !== "function") {
      throw new TypeError("UiLocaleOrchestrationController requires checked optional locale actions.");
    }
  }
  if (elements?.localeSelect && typeof elements.localeSelect.replaceChildren !== "function") {
    throw new TypeError("UiLocaleOrchestrationController requires a checked optional locale select.");
  }

  function renderOptions() {
    if (!elements?.localeSelect || !locale?.availableLocales) return;
    const current = locale.getLocale();
    elements.localeSelect.replaceChildren(
      ...locale.availableLocales().map((catalogLocale) => {
        const option = dom.createOption();
        option.value = catalogLocale.locale;
        option.textContent = `${catalogLocale.label || catalogLocale.locale}${
          catalogLocale.custom ? ` (${localization.source("custom")})` : ""
        }`;
        return option;
      })
    );
    elements.localeSelect.value = current;
  }

  function refresh() {
    application.dispatchLocale(locale?.getLocale?.() || "");
    locale?.localizeStaticDom?.(dom.body);
    presentation.renderPanels();
    renderOptions();
    presentation.renderFocusMode();
    presentation.renderWorkspaceStatus();
    presentation.renderProjectStorageStatus();
    if (application.getView() === "projects") presentation.renderProjectsView();
    if (application.getView() === "resources") presentation.renderResourcesView();
    if (session.getProject()) {
      if (application.getView() === "project") {
        presentation.renderProjectHome();
        void presentation.renderProjectAnalysis();
      }
      presentation.renderEditor();
      presentation.renderProgress();
      presentation.renderReview();
      presentation.renderWorkbench();
      presentation.renderRevisionHistory();
      presentation.renderQaResults();
      presentation.refreshEditorContext();
    }
  }

  async function importCatalog() {
    const file = elements?.importInput?.files?.[0];
    if (!file || !locale?.saveCustomLocale) return;
    try {
      const catalog = JSON.parse(await file.text());
      const importedLocale = locale.saveCustomLocale(catalog);
      renderOptions();
      locale.setLocale(importedLocale);
      refresh();
      status.set("Interface translation imported", "saved");
    } catch (error) {
      status.set(error.message || "Interface translation import failed", "dirty");
    } finally {
      if (elements?.importInput) elements.importInput.value = "";
    }
  }

  function exportSource() {
    if (!locale?.sourceCatalogJson) return;
    downloads.write(
      `loopcat-ui-source-${clock.now().toISOString().slice(0, 10)}.json`,
      locale.sourceCatalogJson(),
      "application/json"
    );
    status.set("UI source exported", "saved");
  }

  return Object.freeze({ renderOptions, refresh, importCatalog, exportSource });
}
