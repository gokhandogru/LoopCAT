/**
 * Owns active-segment term lookup, stale-result suppression, localized safe
 * presentation, and term-deletion intent. Session records, termbase selection
 * and lookup, resource mutation, localization, and DOM primitives are injected.
 *
 * @param {{
 *   root: any,
 *   session: { getProject: () => any, getActiveSegment: () => any },
 *   terms: { getNames: () => string[], find: (options: object) => Promise<any[]> },
 *   localization: {
 *     source: (text: string) => string,
 *     labelHtml: (key: string) => string
 *   },
 *   text: { escapeHtml: (value: unknown) => string },
 *   safeHtml: { replace: (element: any, html: string) => unknown },
 *   mutation: { deleteTerm: (term: any, options: object) => Promise<unknown> | unknown },
 *   target?: { insert: (target: string, options?: object) => Promise<unknown> | unknown },
 *   dom: { createElement: (tagName: string) => any, createFragment: () => any }
 * }} options
 */
export function createTermSuggestionsController(options) {
  const root = options?.root;
  const session = options?.session;
  const terms = options?.terms;
  const localization = options?.localization;
  const text = options?.text;
  const safeHtml = options?.safeHtml;
  const mutation = options?.mutation;
  const target = options?.target;
  const dom = options?.dom;
  if (
    !root?.classList ||
    typeof root.replaceChildren !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getActiveSegment !== "function"
  ) {
    throw new TypeError("TermSuggestionsController requires a results root and session boundaries.");
  }
  if (typeof terms?.getNames !== "function" || typeof terms?.find !== "function") {
    throw new TypeError("TermSuggestionsController requires termbase selection and lookup boundaries.");
  }
  if (
    typeof localization?.source !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof text?.escapeHtml !== "function" ||
    typeof safeHtml?.replace !== "function" ||
    typeof mutation?.deleteTerm !== "function"
  ) {
    throw new TypeError("TermSuggestionsController requires presentation and mutation boundaries.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom?.createFragment !== "function") {
    throw new TypeError("TermSuggestionsController requires browser DOM boundaries.");
  }

  let currentResults = [];
  let resultContext = Object.freeze({ projectId: "", segmentId: "" });

  async function refresh() {
    const segment = session.getActiveSegment();
    if (!segment || !session.getProject()) {
      currentResults = [];
      resultContext = Object.freeze({ projectId: "", segmentId: "" });
      root.textContent = localization.source("No active segment.");
      root.classList.add("muted");
      return;
    }
    const segmentId = segment.id;
    const projectId = session.getProject().id;
    const suggestions = await terms.find({
      source: segment.source,
      sourceLang: session.getProject().sourceLang,
      targetLang: session.getProject().targetLang,
      termBaseNames: terms.getNames()
    });
    if (session.getProject()?.id !== projectId || session.getActiveSegment()?.id !== segmentId) return;
    currentResults = suggestions.slice();
    resultContext = Object.freeze({ projectId, segmentId });
    root.classList.toggle("muted", !suggestions.length);
    if (!suggestions.length) {
      root.textContent = localization.source("No terms found in this segment.");
      return;
    }
    const fragment = dom.createFragment();
    suggestions.forEach((term) => {
      const card = dom.createElement("article");
      card.className = `term-card${term.isForbidden ? " forbidden-term-card" : ""}`;
      safeHtml.replace(
        card,
        `<header><strong>${text.escapeHtml(term.sourceTerm)}</strong><span>${text.escapeHtml(term.targetTerm)}</span><span>${localization.labelHtml(term.isForbidden ? "forbidden" : "approved")}</span><span>${text.escapeHtml(term.termBaseName || "")}</span></header>
      ${term.notes ? `<p>${text.escapeHtml(term.notes)}</p>` : ""}`
      );
      if (!term.isForbidden && typeof target?.insert === "function") {
        const insertButton = dom.createElement("button");
        insertButton.type = "button";
        insertButton.textContent = localization.source("Insert");
        insertButton.addEventListener("click", () =>
          target.insert(term.targetTerm, {
            resourceId: term.id || "",
            sourceTerm: term.sourceTerm || ""
          })
        );
        card.append(insertButton);
      }
      const button = dom.createElement("button");
      button.textContent = localization.source("Delete");
      button.addEventListener("click", async () => {
        await mutation.deleteTerm(term, {
          refreshResourceView: false,
          refreshSuggestions: true
        });
      });
      card.append(button);
      fragment.append(card);
    });
    root.replaceChildren(fragment);
  }

  function getResults() {
    const project = session.getProject();
    const segment = session.getActiveSegment();
    if (project?.id !== resultContext.projectId || segment?.id !== resultContext.segmentId) return [];
    return currentResults.slice();
  }

  return Object.freeze({ getResults, refresh });
}
