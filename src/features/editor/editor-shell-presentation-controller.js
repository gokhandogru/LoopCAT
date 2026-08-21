/**
 * Owns editor-shell visibility, project metadata, and dependent presentation.
 * Navigation, session state, feature renderers, DOM roots, localization, text
 * safety, resource policy, AI state, workspace state, and quality remain
 * injected owners.
 *
 * @param {any} options
 */
export function createEditorShellPresentationController(options) {
  const elements = options?.elements;
  const application = options?.application;
  const session = options?.session;
  const vertical = options?.vertical;
  const localization = options?.localization;
  const language = options?.language;
  const workspace = options?.workspace;
  const focus = options?.focus;
  const resources = options?.resources;
  const documents = options?.documents;
  const text = options?.text;
  const ai = options?.ai;
  const presentation = options?.presentation;

  for (const key of [
    "workspace",
    "sidebar",
    "projectsView",
    "resourcesView",
    "projectHomeView",
    "emptyState",
    "editorView"
  ]) {
    if (typeof elements?.[key]?.classList?.toggle !== "function") {
      throw new TypeError(`EditorShellPresentationController requires elements.${key}.`);
    }
  }
  if (
    !elements?.projectTitle ||
    !elements.projectMeta ||
    !elements.projectDomainEditInput ||
    !elements.projectInfo ||
    typeof elements?.domainForm?.classList?.add !== "function" ||
    typeof elements.domainForm.classList.toggle !== "function" ||
    (elements.inspectorToggleButton && typeof elements.inspectorToggleButton.setAttribute !== "function")
  ) {
    throw new TypeError("EditorShellPresentationController requires project and inspector elements.");
  }
  if (
    typeof application?.getNavigation !== "function" ||
    typeof application.syncLegacy !== "function" ||
    typeof application.dispatchLocale !== "function" ||
    typeof application.getInspectorOpen !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires application boundaries.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof session.getSegments !== "function" ||
    typeof session.getActivityEvents !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires session boundaries.");
  }
  if (typeof vertical?.getState !== "function") {
    throw new TypeError("EditorShellPresentationController requires a vertical-feature boundary.");
  }
  if (
    typeof localization?.locale !== "function" ||
    typeof localization.source !== "function" ||
    typeof localization.label !== "function" ||
    typeof localization.sourceHtml !== "function" ||
    typeof localization.labelHtml !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires localization boundaries.");
  }
  if (typeof language?.syncDesktopSpellcheck !== "function" || typeof language.display !== "function") {
    throw new TypeError("EditorShellPresentationController requires language boundaries.");
  }
  if (typeof workspace?.renderStatus !== "function" || typeof workspace.renderBackupReminder !== "function") {
    throw new TypeError("EditorShellPresentationController requires workspace boundaries.");
  }
  if (typeof focus?.render !== "function") {
    throw new TypeError("EditorShellPresentationController requires a focus boundary.");
  }
  if (typeof resources?.summary !== "function" || typeof documents?.list !== "function") {
    throw new TypeError("EditorShellPresentationController requires resource and document boundaries.");
  }
  if (
    typeof text?.displaySafeText !== "function" ||
    typeof text.displaySafeHtml !== "function" ||
    typeof text.escapeHtml !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires text-safety boundaries.");
  }
  if (
    typeof ai?.normalizeSettings !== "function" ||
    typeof ai.storedKey !== "function" ||
    typeof ai.openAiSnapshot !== "function" ||
    typeof ai.storageLabel !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires AI settings boundaries.");
  }
  if (
    typeof presentation?.replaceSafeHtml !== "function" ||
    typeof presentation.renderAiAdministration !== "function" ||
    typeof presentation.renderAiCommandCentre !== "function" ||
    typeof presentation.renderQualityWorkbench !== "function" ||
    typeof presentation.renderTermbaseSelect !== "function"
  ) {
    throw new TypeError("EditorShellPresentationController requires presentation boundaries.");
  }

  function render() {
    const navigation = application.getNavigation();
    application.syncLegacy({
      view: navigation.view,
      projectId: navigation.projectId,
      documentId: navigation.documentId,
      segmentId: navigation.segmentId,
      activeIndex: navigation.activeIndex
    });
    application.dispatchLocale(localization.locale() || "");
    const hasProject = Boolean(session.getProject());
    void language.syncDesktopSpellcheck();
    workspace.renderStatus();
    workspace.renderBackupReminder();
    const verticalFeatures = vertical.getState();
    if (verticalFeatures?.editor) {
      verticalFeatures.editor.renderShell({
        view: application.getNavigation().view,
        hasProject,
        inspectorOpen: application.getInspectorOpen()
      });
      verticalFeatures.inspector.setVisible(
        application.getNavigation().view === "editor" && application.getInspectorOpen()
      );
      verticalFeatures.dashboard.setVisible(application.getNavigation().view === "project" && hasProject);
    } else {
      elements.workspace.classList.toggle("projects-mode", application.getNavigation().view !== "editor");
      elements.sidebar.classList.toggle("hidden", application.getNavigation().view !== "editor");
      elements.projectsView.classList.toggle("hidden", application.getNavigation().view !== "projects");
      elements.resourcesView.classList.toggle("hidden", application.getNavigation().view !== "resources");
      elements.projectHomeView.classList.toggle(
        "hidden",
        application.getNavigation().view !== "project" || !hasProject
      );
      elements.emptyState.classList.toggle("hidden", application.getNavigation().view !== "editor" || hasProject);
      elements.editorView.classList.toggle("hidden", application.getNavigation().view !== "editor" || !hasProject);
    }
    focus.render();
    if (elements.inspectorToggleButton) {
      elements.inspectorToggleButton.setAttribute("aria-expanded", String(application.getInspectorOpen()));
      elements.inspectorToggleButton.textContent = application.getInspectorOpen()
        ? localization.source("Hide inspector")
        : localization.source("Show inspector");
    }
    if (!session.getProject()) return;

    const resourceSummary = resources.summary();
    elements.projectTitle.textContent = text.displaySafeText(session.getProject().name);
    elements.projectMeta.textContent = `${language.display()} - ${localization.label("mainTm")}: ${text.displaySafeText(resourceSummary.mainTm, localization.label("none"))} - ${text.displaySafeText(resourceSummary.tmLabel)} - ${text.displaySafeText(resourceSummary.tbLabel)}`;
    elements.projectDomainEditInput.value = session.getProject().domain || "";
    elements.domainForm.classList.add("clean");
    elements.domainForm.classList.toggle("hidden", Boolean((session.getProject().domain || "").trim()));
    presentation.replaceSafeHtml(
      elements.projectInfo,
      `
    <dt>${localization.labelHtml("name")}</dt><dd>${text.displaySafeHtml(session.getProject().name)}</dd>
    <dt>${localization.sourceHtml("Creator")}</dt><dd>${text.displaySafeHtml(session.getProject().creatorName || localization.label("notSet"))}</dd>
    <dt>${localization.sourceHtml("Domain")}</dt><dd>${text.displaySafeHtml(session.getProject().domain || localization.label("notSet"))}</dd>
    <dt>${localization.labelHtml("languages")}</dt><dd>${text.escapeHtml(language.display())}</dd>
    <dt>${localization.sourceHtml("Workspace")}</dt><dd>${text.escapeHtml(session.getProject().workspaceId || "local-workspace")}</dd>
    <dt>${localization.labelHtml("sourceFile")}</dt><dd>${text.displaySafeHtml(session.getProject().sourceFileName || localization.label("notImported"))}</dd>
    <dt>${localization.labelHtml("mainTm")}</dt><dd>${text.displaySafeHtml(resourceSummary.mainTm)}</dd>
    <dt>${localization.labelHtml("linkedTms")}</dt><dd>${text.displaySafeHtml(resourceSummary.tmNames.join(", "))}</dd>
    <dt>${localization.labelHtml("linkedTbs")}</dt><dd>${text.displaySafeHtml(resourceSummary.tbNames.join(", "))}</dd>
    <dt>${localization.sourceHtml("Documents")}</dt><dd>${documents.list().length || 0}</dd>
    <dt>${localization.labelHtml("segmentsTitle")}</dt><dd>${session.getSegments().length}</dd>
    <dt>${localization.labelHtml("activity")}</dt><dd>${localization.labelHtml("eventCount", { count: session.getActivityEvents().length })}</dd>
  `
    );
    const aiSettings = ai.normalizeSettings(session.getProject().aiSettings);
    presentation.renderAiAdministration({
      settings: aiSettings,
      storedKey: ai.storedKey(),
      rememberKey: Boolean(ai.openAiSnapshot().local),
      storageText: `OpenAI key: ${ai.storageLabel()}. API keys stay in this browser and are never exported with project packages.`
    });
    presentation.renderAiCommandCentre();
    presentation.renderQualityWorkbench();
    presentation.renderTermbaseSelect();
  }

  return Object.freeze({ render });
}
