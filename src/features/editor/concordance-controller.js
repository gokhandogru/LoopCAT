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
  let activeIndex = 0;
  let visibleButtons = [];
  let returnTarget = null;

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
    visibleButtons = [];
    activeIndex = 0;
    returnTarget?.focus?.();
  }

  function syncActive() {
    if (!visibleButtons.length) return;
    activeIndex = Math.max(0, Math.min(activeIndex, visibleButtons.length - 1));
    visibleButtons.forEach((button, index) => {
      const active = index === activeIndex;
      button.classList?.toggle?.("active", active);
      button.setAttribute?.("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    visibleButtons[activeIndex]?.focus?.();
  }

  async function open() {
    if (navigation.getView() !== "editor" || !session.getProject()) return;
    const keyword = selectedKeyword();
    if (!keyword) {
      status.set("Select source or target text, then press F4 or Ctrl/Cmd+Shift+K.", "dirty");
      return;
    }
    returnTarget = dom.getActiveElement();
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
      visibleButtons = [];
      safeHtml.replace(
        elements.results,
        `<div class="muted">${localization.sourceHtml("No TM units contain this keyword.")}</div>`
      );
    } else {
      const fragment = dom.createFragment();
      visibleButtons = [];
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
        insertButton.setAttribute?.("role", "option");
        insertButton.setAttribute?.("aria-selected", "false");
        insertButton.addEventListener("click", () => {
          target.insert(entry.target, {
            channel: "concordance",
            resourceId: entry.id || ""
          });
          close();
        });
        visibleButtons.push(insertButton);
        card.querySelector("footer").append(insertButton);
        fragment.append(card);
      });
      elements.results.replaceChildren(fragment);
    }
    elements.overlay.classList.remove("hidden");
    activeIndex = 0;
    syncActive();
  }

  const handleClose = () => close();
  const handleOverlayClick = (event) => {
    if (event.target === elements.overlay) close();
  };
  const handleKeydown = (event) => {
    if (elements.overlay.classList.contains("hidden") || event.isComposing || event.getModifierState?.("AltGraph"))
      return;
    if (event.key === "ArrowDown") activeIndex = (activeIndex + 1) % visibleButtons.length;
    else if (event.key === "ArrowUp") activeIndex = (activeIndex - 1 + visibleButtons.length) % visibleButtons.length;
    else if (event.key === "Home") activeIndex = 0;
    else if (event.key === "End") activeIndex = visibleButtons.length - 1;
    else if (event.key === "Enter" && visibleButtons.length) {
      event.preventDefault?.();
      visibleButtons[activeIndex]?.click?.();
      return;
    } else if (event.key === "Escape") {
      event.preventDefault?.();
      close();
      return;
    } else return;
    if (!visibleButtons.length) return;
    event.preventDefault?.();
    syncActive();
  };

  function mount() {
    if (mounted) return false;
    elements.closeButton.addEventListener("click", handleClose);
    elements.overlay.addEventListener("click", handleOverlayClick);
    elements.overlay.addEventListener("keydown", handleKeydown);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.closeButton.removeEventListener("click", handleClose);
    elements.overlay.removeEventListener("click", handleOverlayClick);
    elements.overlay.removeEventListener("keydown", handleKeydown);
    mounted = false;
    return true;
  }

  return Object.freeze({ close, handleKeydown, highlight, mount, open, selectedKeyword, unmount });
}
