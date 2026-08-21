/**
 * Owns editor document-filter option, replacement, selection-retention, and
 * missing-document navigation-correction presentation. Navigation state,
 * document catalog policy, localization, text safety, DOM construction, and
 * the select root remain injected owners.
 *
 * @param {{
 *   select: any,
 *   navigation: {
 *     getDocumentId: () => unknown,
 *     selectDocument: (options: { documentId: unknown }) => unknown
 *   },
 *   documents: { list: () => any[] },
 *   localization: { source: (value: string) => unknown },
 *   text: { displaySafeText: (value: unknown) => unknown },
 *   dom: {
 *     createElement: (tagName: string) => any,
 *     createDocumentFragment: () => any
 *   }
 * }} options
 */
export function createDocumentFilterPresentationController(options) {
  const select = options?.select;
  const navigation = options?.navigation;
  const documents = options?.documents;
  const localization = options?.localization;
  const text = options?.text;
  const dom = options?.dom;

  if (!select || typeof select.replaceChildren !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires a document-filter select.");
  }
  if (typeof navigation?.getDocumentId !== "function" || typeof navigation.selectDocument !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires navigation boundaries.");
  }
  if (typeof documents?.list !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires a document catalog boundary.");
  }
  if (typeof localization?.source !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires a localization boundary.");
  }
  if (typeof text?.displaySafeText !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires a text-safety boundary.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom.createDocumentFragment !== "function") {
    throw new TypeError("DocumentFilterPresentationController requires DOM creation boundaries.");
  }

  function render() {
    const current = navigation.getDocumentId();
    const documentRecords = documents.list();
    const fragment = dom.createDocumentFragment();
    const allOption = dom.createElement("option");
    allOption.value = "";
    allOption.textContent = localization.source("All documents");
    fragment.append(allOption);
    documentRecords.forEach((documentInfo) => {
      const option = dom.createElement("option");
      option.value = documentInfo.id;
      option.textContent = text.displaySafeText(documentInfo.name);
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = documentRecords.some((documentInfo) => documentInfo.id === current) ? current : "";
    if (select.value !== current) navigation.selectDocument({ documentId: select.value });
  }

  return Object.freeze({ render });
}
