/**
 * Owns active-segment term lookup, stale-result suppression, localized safe
 * presentation, and term-deletion intent. Session records, termbase selection
 * and lookup, resource mutation, localization, and DOM primitives are injected.
 *
 * @param {{
 *   root: any,
 *   session: { getProject: () => any, getActiveSegment: () => any },
 *   terms: { getNames: () => string[], getLinks?: () => any[], find: (options: object) => Promise<any[]> },
 *   localization: {
 *     source: (text: string) => string,
 *     labelHtml: (key: string) => string
 *   },
 *   text: { escapeHtml: (value: unknown) => string },
 *   safeHtml: { replace: (element: any, html: string) => unknown },
 *   mutation: { deleteTerm: (term: any, options: object) => Promise<unknown> | unknown, editTerm?: (term: any) => unknown },
 *   contextMenu?: { open: (options: { event: any, anchor: any, items: any[] }) => unknown },
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
  const contextMenu = options?.contextMenu;
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
      termBaseNames: terms.getNames(),
      ...(typeof terms.getLinks === "function" ? { resourceLinks: terms.getLinks() || [] } : {})
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
      const forbidden = Boolean(term.isForbidden || term.status === "forbidden");
      card.className = `term-card compact-match-row${forbidden ? " forbidden-term-card" : ""}`;
      card.tabIndex = 0;
      card.setAttribute("data-term-id", String(term.id || ""));
      card.setAttribute("role", "button");
      card.setAttribute("aria-disabled", String(forbidden || typeof target?.insert !== "function"));
      if (contextMenu) card.setAttribute("aria-haspopup", "menu");
      card.title = localization.source("Double-click or press Enter to insert. Right-click for term actions.");
      safeHtml.replace(
        card,
        `<div class="term-pair"><span class="term-source" dir="auto">${text.escapeHtml(term.sourceTerm)}</span><strong class="term-target" dir="auto">${text.escapeHtml(term.targetTerm)}</strong></div>
      <div class="match-meta"><span class="match-resource">${text.escapeHtml(term.termBaseName || "")}</span>${forbidden ? `<span class="term-warning">${localization.labelHtml("forbidden")}</span>` : ""}</div>`
      );
      function isCurrent() {
        return session.getProject()?.id === projectId && session.getActiveSegment()?.id === segmentId;
      }
      for (const selector of [".term-source", ".term-target"]) {
        const element = card.querySelector?.(selector);
        if (element) element.dir = "auto";
      }
      function insert() {
        if (!isCurrent() || forbidden || typeof target?.insert !== "function") return;
        return target.insert(term.targetTerm, {
          resourceId: term.id || "",
          sourceTerm: term.sourceTerm || ""
        });
      }
      function openMenu(event) {
        if (!isCurrent() || typeof contextMenu?.open !== "function") return;
        event.preventDefault();
        const items = [
          {
            label: localization.source("Insert"),
            disabled: forbidden || typeof target?.insert !== "function",
            action: insert
          },
          ...(typeof mutation.editTerm === "function"
            ? [{ label: localization.source("Edit term"), action: () => isCurrent() && mutation.editTerm(term) }]
            : []),
          {
            label: localization.source("Delete"),
            action: async () => {
              if (!isCurrent()) return;
              await mutation.deleteTerm(term, { refreshResourceView: false, refreshSuggestions: true });
            }
          }
        ];
        return contextMenu.open({ event, anchor: card, items });
      }
      card.addEventListener("dblclick", insert);
      card.addEventListener("contextmenu", openMenu);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.repeat) {
          event.preventDefault();
          insert();
        } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          openMenu(event);
        }
      });
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
