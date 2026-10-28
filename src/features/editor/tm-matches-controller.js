import { diffMatchSource } from "./match-source-diff.js";

/**
 * Owns active-segment TM-match lookup, stale-result suppression, localized safe
 * presentation, and target-insertion intent. Session records, TM selection and
 * lookup, localization, target commands, and browser DOM primitives are injected.
 *
 * @param {{
 *   root: any,
 *   session: { getProject: () => any, getActiveSegment: () => any },
 *   tm: { getNames: () => string[], getLinks?: () => any[], context?: (segment: any) => object, findMatches: (options: object) => Promise<any[]> },
 *   localization: {
 *     source: (text: string) => string,
 *     label: (key: string) => string,
 *     labelHtml: (key: string, values?: object) => string
 *   },
 *   text: { escapeHtml: (value: unknown) => string },
 *   safeHtml: { replace: (element: any, html: string) => unknown },
 *   target: { insert: (value: string, provenance: object) => unknown },
 *   dom: { createElement: (tagName: string) => any, createFragment: () => any }
 * }} options
 */
export function createTmMatchesController(options) {
  const root = options?.root;
  const session = options?.session;
  const tm = options?.tm;
  const localization = options?.localization;
  const text = options?.text;
  const safeHtml = options?.safeHtml;
  const target = options?.target;
  const dom = options?.dom;
  if (
    !root?.classList ||
    typeof root.replaceChildren !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getActiveSegment !== "function"
  ) {
    throw new TypeError("TmMatchesController requires a results root and session boundaries.");
  }
  if (typeof tm?.getNames !== "function" || typeof tm?.findMatches !== "function") {
    throw new TypeError("TmMatchesController requires TM selection and lookup boundaries.");
  }
  if (
    typeof localization?.source !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof text?.escapeHtml !== "function" ||
    typeof safeHtml?.replace !== "function" ||
    typeof target?.insert !== "function"
  ) {
    throw new TypeError("TmMatchesController requires presentation and target-insertion boundaries.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom?.createFragment !== "function") {
    throw new TypeError("TmMatchesController requires browser DOM boundaries.");
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
    const hasResourceLinks = typeof tm.getLinks === "function";
    const hasContext = typeof tm.context === "function";
    const matches = await tm.findMatches({
      source: segment.source,
      sourceLang: session.getProject().sourceLang,
      targetLang: session.getProject().targetLang,
      tmNames: tm.getNames(),
      ...(hasResourceLinks ? { resourceLinks: tm.getLinks() || [] } : {}),
      ...(hasContext ? { context: tm.context(segment) || {} } : {})
    });
    if (segment.previousTranslation?.target)
      matches.push({
        id: "previous-source-version",
        source: segment.previousTranslation.source,
        target: segment.previousTranslation.target,
        score: 0,
        effectiveScore: 0,
        rawScore: 0,
        tmName: localization.source("Previous source version — review before use"),
        matchKind: "historical suggestion",
        safeToApply: true
      });
    if (session.getProject()?.id !== projectId || session.getActiveSegment()?.id !== segmentId) return;
    currentResults = matches.slice();
    resultContext = Object.freeze({ projectId, segmentId });
    root.classList.toggle("muted", !matches.length);
    if (!matches.length) {
      root.textContent = localization.source("No TM matches.");
      return;
    }
    const fragment = dom.createFragment();
    matches.forEach((match) => {
      const card = dom.createElement("article");
      card.className = "match-card compact-match-row";
      card.tabIndex = 0;
      card.setAttribute("data-match-id", String(match.id || ""));
      card.setAttribute("role", "button");
      card.setAttribute("aria-disabled", String(match.safeToApply === false));
      card.title = localization.source(
        match.safeToApply === false ? "Protected codes require manual review." : "Double-click or press Enter to insert"
      );
      const translatedTarget = match.adaptedTarget || match.target;
      const sourceDiff = diffMatchSource(match.source, segment.source, session.getProject()?.sourceLang);
      const diffHtml = sourceDiff
        .map((part) => {
          const escaped = text.escapeHtml(part.text);
          if (part.kind === "equal") return escaped;
          const label = localization.source(part.kind === "removed" ? "Only in TM source" : "Only in current source");
          const tag = part.kind === "removed" ? "del" : "ins";
          return `<${tag} class="match-diff-${part.kind}" title="${text.escapeHtml(label)}" aria-label="${text.escapeHtml(label + ": " + part.text)}">${escaped}</${tag}>`;
        })
        .join("");
      safeHtml.replace(
        card,
        `<header class="match-meta"><strong class="match-score">${match.id === "previous-source-version" ? text.escapeHtml(localization.source("Previous translation")) : `${Number(match.effectiveScore ?? match.score)}%`}</strong><span class="match-resource">${text.escapeHtml(match.tmName || match.resourceName || "")}</span></header>
      <p class="match-source" dir="auto">${diffHtml}</p>
      <p class="match-target" dir="auto"><strong>${text.escapeHtml(translatedTarget)}</strong></p>${match.safeToApply === false ? `<span class="match-warning">${text.escapeHtml(localization.source("Protected codes require manual review."))}</span>` : ""}${match.adaptedTarget ? `<span class="match-warning">${text.escapeHtml(localization.source("Adapted preview"))}</span>` : ""}`
      );
      for (const selector of [".match-source", ".match-target"]) {
        const element = card.querySelector?.(selector);
        if (element) element.dir = "auto";
      }
      function insert() {
        if (
          match.safeToApply === false ||
          session.getProject()?.id !== projectId ||
          session.getActiveSegment()?.id !== segmentId
        )
          return;
        return target.insert(translatedTarget, {
          channel: "match",
          resourceId: match.id || "",
          ...(match.adaptedTarget ? { adapted: true } : {})
        });
      }
      card.addEventListener("dblclick", insert);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.repeat) {
          event.preventDefault();
          insert();
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
