/**
 * Owns current-project termbase selector option and selection presentation.
 * Resource policy, text safety, DOM construction, and the select element remain
 * injected owners.
 *
 * @param {{
 *   select: any,
 *   resources: { termBaseNames: () => any[], primaryTermBase: () => unknown },
 *   dom: {
 *     createElement: (tagName: string) => any,
 *     createDocumentFragment: () => any
 *   },
 *   text: { displaySafeText: (value: unknown) => unknown }
 * }} options
 */
export function createTermbaseSelectPresentationController(options) {
  const select = options?.select;
  const resources = options?.resources;
  const dom = options?.dom;
  const text = options?.text;

  if (typeof resources?.termBaseNames !== "function" || typeof resources.primaryTermBase !== "function") {
    throw new TypeError("TermbaseSelectPresentationController requires resource boundaries.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom.createDocumentFragment !== "function") {
    throw new TypeError("TermbaseSelectPresentationController requires DOM creation boundaries.");
  }
  if (typeof text?.displaySafeText !== "function") {
    throw new TypeError("TermbaseSelectPresentationController requires a text-safety boundary.");
  }

  function render() {
    if (!select) return;
    const names = resources.termBaseNames();
    const current = select.value;
    const fragment = dom.createDocumentFragment();
    names.forEach((name) => {
      const option = dom.createElement("option");
      option.value = name;
      option.textContent = text.displaySafeText(name);
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = names.includes(current) ? current : resources.primaryTermBase();
  }

  return Object.freeze({ render });
}
