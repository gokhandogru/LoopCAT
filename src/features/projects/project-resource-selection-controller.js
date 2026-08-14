function requireInput(value, name) {
  if (!value || !("value" in value)) {
    throw new TypeError(`ProjectResourceSelectionController requires ${name}.`);
  }
  return value;
}

/**
 * Owns project-dialog resource picker presentation and resource-link selection
 * policy. Dialog lifecycle and project persistence remain outside this
 * controller.
 *
 * @param {{
 *   elements: {
 *     dialog: any,
 *     sourceLanguageInput: any,
 *     targetLanguageInput: any,
 *     tmResourceList: any,
 *     tbResourceList: any,
 *     newTmNameInput: any,
 *     newTermBaseNameInput: any
 *   },
 *   getProject: () => any,
 *   getMode: () => string | null | undefined,
 *   normalizeLanguageValue: (value: unknown) => string,
 *   normalizeLanguageInput: (input: any) => string,
 *   projectResources: {
 *     tmNames: (project?: any) => string[],
 *     termBaseNames: (project?: any) => string[],
 *     mainTmName: (project?: any) => string,
 *     links: (project?: any) => any[]
 *   },
 *   catalog: { matching: (type: "tm" | "tb", sourceLang: string, targetLang: string, selectedNames?: string[]) => any[] },
 *   localization: {
 *     label: (key: string, values?: Record<string, unknown>) => string,
 *     labelHtml: (key: string, values?: Record<string, unknown>) => string
 *   },
 *   presentation: {
 *     replaceSafeHtml: (element: any, html: string) => void,
 *     escapeHtml: (value: unknown) => string,
 *     displaySafeHtml: (value: unknown) => string,
 *     languagePairDisplay: (sourceLang: string, targetLang: string) => string
 *   },
 *   names: {
 *     unique: (names: string[]) => string[],
 *     clean: (value: unknown, fallback?: string) => string
 *   },
 *   makeId: (prefix: string) => string
 * }} options
 */
export function createProjectResourceSelectionController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const dialog = elements.dialog;
  const sourceLanguageInput = requireInput(elements.sourceLanguageInput, "the source-language input");
  const targetLanguageInput = requireInput(elements.targetLanguageInput, "the target-language input");
  const tmResourceList = elements.tmResourceList;
  const tbResourceList = elements.tbResourceList;
  const newTmNameInput = requireInput(elements.newTmNameInput, "the new-TM input");
  const newTermBaseNameInput = requireInput(elements.newTermBaseNameInput, "the new-termbase input");
  const getProject = options?.getProject;
  const getMode = options?.getMode;
  const normalizeLanguageValue = options?.normalizeLanguageValue;
  const normalizeLanguageInput = options?.normalizeLanguageInput;
  const projectResources = options?.projectResources;
  const catalog = options?.catalog;
  const localization = options?.localization;
  const presentation = options?.presentation;
  const names = options?.names;
  const makeId = options?.makeId;
  if (
    typeof dialog?.querySelectorAll !== "function" ||
    typeof dialog?.querySelector !== "function" ||
    !tmResourceList ||
    !tbResourceList ||
    typeof getProject !== "function" ||
    typeof getMode !== "function" ||
    typeof normalizeLanguageValue !== "function" ||
    typeof normalizeLanguageInput !== "function" ||
    typeof projectResources?.tmNames !== "function" ||
    typeof projectResources?.termBaseNames !== "function" ||
    typeof projectResources?.mainTmName !== "function" ||
    typeof projectResources?.links !== "function" ||
    typeof catalog?.matching !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof presentation?.replaceSafeHtml !== "function" ||
    typeof presentation?.escapeHtml !== "function" ||
    typeof presentation?.displaySafeHtml !== "function" ||
    typeof presentation?.languagePairDisplay !== "function" ||
    typeof names?.unique !== "function" ||
    typeof names?.clean !== "function" ||
    typeof makeId !== "function"
  ) {
    throw new TypeError(
      "ProjectResourceSelectionController requires dialog, resource, catalog, localization, presentation, name, and ID boundaries."
    );
  }

  function values() {
    return {
      sourceLang: normalizeLanguageValue(sourceLanguageInput.value),
      targetLang: normalizeLanguageValue(targetLanguageInput.value)
    };
  }

  function optionHtml(resource, type, selected, main) {
    const countLabel = resource.count
      ? localization.label(type === "tm" ? "unitCount" : "termCount", { count: resource.count })
      : localization.label("empty");
    const checkbox = `<input type="checkbox" data-resource-type="${type}" data-resource-name="${presentation.escapeHtml(resource.name)}" ${selected ? "checked" : ""}>`;
    const radio =
      type === "tm"
        ? `<input type="radio" name="projectMainTm" data-main-tm="${presentation.escapeHtml(resource.name)}" ${main ? "checked" : ""}>`
        : "";
    return `
    <label class="resource-option">
      <span class="resource-option-check">${checkbox}</span>
      <span class="resource-option-body">
        <strong>${presentation.displaySafeHtml(resource.name)}</strong>
        <span>${presentation.escapeHtml(presentation.languagePairDisplay(resource.sourceLang, resource.targetLang))} - ${countLabel}</span>
      </span>
      <span class="resource-option-main">${radio}</span>
    </label>
  `;
  }

  function render(project = getProject()) {
    const { sourceLang, targetLang } = values();
    if (!sourceLang || !targetLang) return;
    const editing = getMode() === "edit";
    const selectedTmNames = editing ? projectResources.tmNames(project) : [];
    const selectedTbNames = editing ? projectResources.termBaseNames(project) : [];
    const main = editing ? projectResources.mainTmName(project) : "";
    const tmResources = catalog.matching("tm", sourceLang, targetLang, selectedTmNames);
    const tbResources = catalog.matching("tb", sourceLang, targetLang, selectedTbNames);
    presentation.replaceSafeHtml(
      tmResourceList,
      tmResources.length
        ? tmResources
            .map((resource) =>
              optionHtml(resource, "tm", selectedTmNames.includes(resource.name), resource.name === main)
            )
            .join("")
        : `<div class="muted">${localization.labelHtml("noMatchingTms")}</div>`
    );
    presentation.replaceSafeHtml(
      tbResourceList,
      tbResources.length
        ? tbResources
            .map((resource) => optionHtml(resource, "tb", selectedTbNames.includes(resource.name), false))
            .join("")
        : `<div class="muted">${localization.labelHtml("noMatchingTbs")}</div>`
    );
  }

  function checkedNames(type) {
    return Array.from(dialog.querySelectorAll(`[data-resource-type="${type}"]:checked`)).map(
      (input) => input.dataset.resourceName
    );
  }

  function collect(existingProject = null) {
    const sourceLang = normalizeLanguageInput(sourceLanguageInput);
    const targetLang = normalizeLanguageInput(targetLanguageInput);
    const existingLinks = projectResources.links(existingProject);
    let tmNames = names.unique(checkedNames("tm"));
    let tbNames = names.unique(checkedNames("tb"));
    const newTmName = newTmNameInput.value.trim();
    const newTbName = newTermBaseNameInput.value.trim();
    let main = dialog.querySelector("[data-main-tm]:checked")?.dataset.mainTm || "";
    if (newTmName) {
      tmNames = names.unique([newTmName, ...tmNames]);
      main = newTmName;
    }
    if (!tmNames.length) {
      main = names.clean(existingProject?.mainTmName, names.clean(existingProject?.tmName, "Default TM"));
      tmNames = [main];
    }
    if (!main || !tmNames.includes(main)) main = tmNames[0];
    if (newTbName) tbNames = names.unique([...tbNames, newTbName]);
    if (!tbNames.length) tbNames = [names.clean(existingProject?.termBaseName, "Default TB")];
    return {
      sourceLang,
      targetLang,
      tmNames,
      termBaseNames: tbNames,
      mainTmName: main,
      tmName: main,
      termBaseName: tbNames[0],
      resourceLinks: [
        ...tmNames.map((name) => ({
          id: existingLinks.find((link) => link.type === "tm" && link.name === name)?.id || makeId("resource-link"),
          type: "tm",
          name,
          role: name === main ? "main" : "reference"
        })),
        ...tbNames.map((name) => ({
          id:
            existingLinks.find((link) => link.type === "termbase" && link.name === name)?.id || makeId("resource-link"),
          type: "termbase",
          name
        }))
      ]
    };
  }

  return Object.freeze({ values, render, collect });
}
