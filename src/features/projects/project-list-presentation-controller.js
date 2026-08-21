/**
 * Owns editor-shell project-list empty state, safe project-button construction,
 * active selection, open-action listeners, fragment assembly, and replacement.
 * Session state, project opening, language policy, text safety, localization,
 * safe HTML, DOM creation, and the list root remain injected owners.
 *
 * @param {{
 *   root: { replaceChildren: (...children: unknown[]) => unknown },
 *   session: { getProject: () => any, getProjects: () => any[] },
 *   dom: {
 *     createElement: (tagName: string) => any,
 *     createDocumentFragment: () => any
 *   },
 *   text: {
 *     displaySafeHtml: (value: unknown) => unknown,
 *     escapeHtml: (value: unknown) => unknown
 *   },
 *   language: { display: (project: unknown) => unknown },
 *   localization: {
 *     sourceHtml: (text: string) => unknown,
 *     labelHtml: (key: string) => unknown
 *   },
 *   presentation: { replaceSafeHtml: (target: unknown, html: string) => unknown },
 *   navigation: { open: (projectId: unknown) => unknown }
 * }} options
 */
export function createProjectListPresentationController(options) {
  const root = options?.root;
  const session = options?.session;
  const dom = options?.dom;
  const text = options?.text;
  const language = options?.language;
  const localization = options?.localization;
  const presentation = options?.presentation;
  const navigation = options?.navigation;

  if (typeof root?.replaceChildren !== "function") {
    throw new TypeError("ProjectListPresentationController requires a project-list root.");
  }
  if (typeof session?.getProject !== "function" || typeof session.getProjects !== "function") {
    throw new TypeError("ProjectListPresentationController requires project session boundaries.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom.createDocumentFragment !== "function") {
    throw new TypeError("ProjectListPresentationController requires DOM creation boundaries.");
  }
  if (typeof text?.displaySafeHtml !== "function" || typeof text.escapeHtml !== "function") {
    throw new TypeError("ProjectListPresentationController requires text-safety boundaries.");
  }
  if (typeof language?.display !== "function") {
    throw new TypeError("ProjectListPresentationController requires a language boundary.");
  }
  if (typeof localization?.sourceHtml !== "function" || typeof localization.labelHtml !== "function") {
    throw new TypeError("ProjectListPresentationController requires localization boundaries.");
  }
  if (typeof presentation?.replaceSafeHtml !== "function" || typeof navigation?.open !== "function") {
    throw new TypeError("ProjectListPresentationController requires presentation and navigation boundaries.");
  }

  function render() {
    if (!session.getProjects().length) {
      presentation.replaceSafeHtml(root, `<div class="muted">${localization.sourceHtml("No projects yet.")}</div>`);
      return;
    }
    const fragment = dom.createDocumentFragment();
    session.getProjects().forEach((project) => {
      const button = dom.createElement("button");
      button.className = `project-item ${session.getProject()?.id === project.id ? "active" : ""}`;
      presentation.replaceSafeHtml(
        button,
        `<strong>${text.displaySafeHtml(project.name)}</strong><span>${text.escapeHtml(language.display(project))}</span><span>${project.sourceFileName ? text.displaySafeHtml(project.sourceFileName) : localization.labelHtml("noSourceFile")}</span>`
      );
      button.addEventListener("click", () => navigation.open(project.id));
      fragment.append(button);
    });
    root.replaceChildren(fragment);
  }

  return Object.freeze({ render });
}
