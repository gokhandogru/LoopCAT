/**
 * Owns concordance keyword selection, linked-TM search, safe result rendering,
 * target insertion intent, and overlay lifecycle. Repository, localization,
 * resource selection, target commands, and browser DOM primitives are injected.
 *
 * @param {{
 *   elements: { overlay: any, closeButton: any, meta: any, results: any },
 *   session: { getProject: () => any },
 *   navigation: { getView: () => string },
 *   tm: { listEntries: () => Promise<any[]>, getNames: () => string[] },
 *   resources: { summary: () => any },
 *   languages: { display: () => string },
 *   localization: { label: (key: string, values?: object) => string, source: (text: string) => string, sourceHtml: (text: string) => string },
 *   text: { normalizeCase: (text: string) => string, escapeHtml: (text: any) => string, escapeRegExp: (text: string) => string },
 *   safeHtml: { replace: (element: any, html: string) => unknown },
 *   target: { insert: (target: string, provenance: object) => unknown },
 *   status: { set: (message: string, mode?: string) => void },
 *   dom: { getSelection: () => any, getActiveElement: () => any, createElement: (tagName: string) => any, createFragment: () => any }
 * }} options
 */
export function createConcordanceController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const navigation = options?.navigation;
  const tm = options?.tm;
  const resources = options?.resources;
  const languages = options?.languages;
  const localization = options?.localization;
  const text = options?.text;
  const safeHtml = options?.safeHtml;
  const target = options?.target;
  const status = options?.status;
  const dom = options?.dom;
  if (
    !elements?.overlay?.classList ||
    typeof elements.overlay.addEventListener !== "function" ||
    typeof elements.overlay.removeEventListener !== "function" ||
    typeof elements?.closeButton?.addEventListener !== "function" ||
    typeof elements.closeButton.removeEventListener !== "function" ||
    typeof elements?.results?.replaceChildren !== "function"
  ) {
    throw new TypeError("ConcordanceController requires overlay elements.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof navigation?.getView !== "function" ||
    typeof tm?.listEntries !== "function" ||
    typeof tm?.getNames !== "function" ||
    typeof resources?.summary !== "function" ||
    typeof languages?.display !== "function"
  ) {
    throw new TypeError("ConcordanceController requires session, TM, resource, and language boundaries.");
  }
  if (
    typeof localization?.label !== "function" ||
    typeof localization?.source !== "function" ||
    typeof localization?.sourceHtml !== "function" ||
    typeof text?.normalizeCase !== "function" ||
    typeof text?.escapeHtml !== "function" ||
    typeof text?.escapeRegExp !== "function" ||
    typeof safeHtml?.replace !== "function" ||
    typeof target?.insert !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("ConcordanceController requires presentation and target-insertion boundaries.");
  }
  if (
    typeof dom?.getSelection !== "function" ||
    typeof dom?.getActiveElement !== "function" ||
    typeof dom?.createElement !== "function" ||
    typeof dom?.createFragment !== "function"
  ) {
    throw new TypeError("ConcordanceController requires browser DOM boundaries.");
  }

  let mounted = false;

  function selectedKeyword() {
    const selection = dom.getSelection()?.toString().trim();
    if (selection) return selection.replace(/\s+/g, " ");
    const active = dom.getActiveElement();
    if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") {
      const value = active.value || "";
      const selected = value.slice(active.selectionStart || 0, active.selectionEnd || 0).trim();
      if (selected) return selected.replace(/\s+/g, " ");
    }
    return "";
  }

  function highlight(textValue, keyword) {
    const escaped = text.escapeHtml(textValue);
    const pattern = new RegExp(text.escapeRegExp(text.escapeHtml(keyword)), "gi");
    return escaped.replace(pattern, (match) => `<mark>${match}</mark>`);
  }

  function close() {
    elements.overlay.classList.add("hidden");
    elements.results.replaceChildren();
  }

  async function open() {
    if (navigation.getView() !== "editor" || !session.getProject()) return;
    const keyword = selectedKeyword();
    if (!keyword) {
      status.set("Select a source word, then press Ctrl+K or Alt+K.", "dirty");
      return;
    }
    const query = text.normalizeCase(keyword);
    const entries = await tm.listEntries();
    const tmNames = new Set(tm.getNames());
    const results = entries
      .filter(
        (entry) =>
          entry.sourceLang === session.getProject().sourceLang && entry.targetLang === session.getProject().targetLang
      )
      .filter((entry) => tmNames.has(entry.tmName))
      .filter((entry) => text.normalizeCase(entry.source).includes(query))
      .sort(
        (left, right) =>
          new Date(right.updatedAt || right.createdAt || 0).getTime() -
          new Date(left.updatedAt || left.createdAt || 0).getTime()
      );
    elements.meta.textContent = localization.label("concordanceResultSummary", {
      keyword,
      resource: resources.summary().tmLabel,
      pair: languages.display(),
      count: results.length
    });
    if (!results.length) {
      safeHtml.replace(
        elements.results,
        `<div class="muted">${localization.sourceHtml("No TM units contain this keyword.")}</div>`
      );
    } else {
      const fragment = dom.createFragment();
      results.forEach((entry) => {
        const card = dom.createElement("article");
        card.className = "concordance-card";
        safeHtml.replace(
          card,
          `
        <p class="concordance-source">${highlight(entry.source, keyword)}</p>
        <p class="concordance-target">${highlight(entry.target, keyword)}</p>
        <footer><span>${text.escapeHtml(entry.projectName || entry.tmName || "")}</span></footer>
      `
        );
        const insertButton = dom.createElement("button");
        insertButton.type = "button";
        insertButton.textContent = localization.source("Insert target");
        insertButton.addEventListener("click", () => {
          target.insert(entry.target, {
            channel: "concordance",
            resourceId: entry.id || ""
          });
          close();
        });
        card.querySelector("footer").append(insertButton);
        fragment.append(card);
      });
      elements.results.replaceChildren(fragment);
    }
    elements.overlay.classList.remove("hidden");
  }

  const handleClose = () => close();
  const handleOverlayClick = (event) => {
    if (event.target === elements.overlay) close();
  };

  function mount() {
    if (mounted) return false;
    elements.closeButton.addEventListener("click", handleClose);
    elements.overlay.addEventListener("click", handleOverlayClick);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.closeButton.removeEventListener("click", handleClose);
    elements.overlay.removeEventListener("click", handleOverlayClick);
    mounted = false;
    return true;
  }

  return Object.freeze({ close, highlight, mount, open, selectedKeyword, unmount });
}
