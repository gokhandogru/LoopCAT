/**
 * Owns active-segment TM-match lookup, stale-result suppression, localized safe
 * presentation, and target-insertion intent. Session records, TM selection and
 * lookup, localization, target commands, and browser DOM primitives are injected.
 *
 * @param {{
 *   root: any,
 *   session: { getProject: () => any, getActiveSegment: () => any },
 *   tm: { getNames: () => string[], findMatches: (options: object) => Promise<any[]> },
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

  async function refresh() {
    const segment = session.getActiveSegment();
    if (!segment || !session.getProject()) {
      root.textContent = localization.source("No active segment.");
      root.classList.add("muted");
      return;
    }
    const segmentId = segment.id;
    const projectId = session.getProject().id;
    const matches = await tm.findMatches({
      source: segment.source,
      sourceLang: session.getProject().sourceLang,
      targetLang: session.getProject().targetLang,
      tmNames: tm.getNames()
    });
    if (session.getProject()?.id !== projectId || session.getActiveSegment()?.id !== segmentId) return;
    root.classList.toggle("muted", !matches.length);
    if (!matches.length) {
      root.textContent = localization.source("No TM matches.");
      return;
    }
    const fragment = dom.createFragment();
    matches.forEach((match) => {
      const card = dom.createElement("article");
      card.className = "match-card";
      safeHtml.replace(
        card,
        `<header><strong>${localization.labelHtml("matchPercent", { score: match.score })}</strong><span>${text.escapeHtml(match.tmName || "")}</span></header>
      <p>${text.escapeHtml(match.source)}</p>
      <p><strong>${text.escapeHtml(match.target)}</strong></p>
      ${match.projectName ? `<p class="muted">${text.escapeHtml(match.projectName)}</p>` : ""}`
      );
      const button = dom.createElement("button");
      button.textContent = localization.label("insert");
      button.addEventListener("click", () =>
        target.insert(match.target, {
          channel: "match",
          resourceId: match.id || ""
        })
      );
      card.append(button);
      fragment.append(card);
    });
    root.replaceChildren(fragment);
  }

  return Object.freeze({ refresh });
}
