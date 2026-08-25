function requireElement(value, label) {
  if (!value?.addEventListener || !value?.classList) {
    throw new TypeError(`QuickInsertController requires ${label}.`);
  }
  return value;
}

function text(value) {
  return String(value || "");
}

/**
 * Owns the contextual, keyboard-first picker for TM matches, approved terms,
 * and already-saved AI suggestions. It never starts an AI provider request.
 */
export function createQuickInsertController(options) {
  const elements = options?.elements || {};
  const overlay = requireElement(elements.overlay, "an overlay");
  const resultsRoot = requireElement(elements.results, "a results root");
  const closeButton = requireElement(elements.closeButton, "a close button");
  const meta = elements.meta;
  const session = options?.session;
  const sources = options?.sources;
  const actions = options?.actions;
  const localization = options?.localization;
  const status = options?.status;
  const focus = options?.focus;
  const ownerDocument = overlay.ownerDocument || globalThis.document;
  if (typeof session?.getProject !== "function" || typeof session?.getSegment !== "function") {
    throw new TypeError("QuickInsertController requires project and active-segment boundaries.");
  }
  if (
    typeof sources?.refreshTm !== "function" ||
    typeof sources?.getTm !== "function" ||
    typeof sources?.refreshTerms !== "function" ||
    typeof sources?.getTerms !== "function" ||
    typeof sources?.getAi !== "function"
  ) {
    throw new TypeError("QuickInsertController requires TM, termbase, and saved-AI result boundaries.");
  }
  if (
    typeof actions?.insertTm !== "function" ||
    typeof actions?.insertTerm !== "function" ||
    typeof actions?.applyAi !== "function"
  ) {
    throw new TypeError("QuickInsertController requires insertion and application actions.");
  }
  if (typeof localization?.source !== "function" || typeof status?.set !== "function") {
    throw new TypeError("QuickInsertController requires localization and status boundaries.");
  }
  if (!ownerDocument?.createElement || !ownerDocument?.createDocumentFragment) {
    throw new TypeError("QuickInsertController requires browser DOM primitives.");
  }

  let mounted = false;
  let activeIndex = 0;
  let visibleResults = [];
  let returnTarget = null;

  function isOpen() {
    return !overlay.classList.contains("hidden");
  }

  function resultButtons() {
    return Array.from(resultsRoot.querySelectorAll("[data-quick-insert-index]"));
  }

  function syncActive({ focusResult = true } = {}) {
    const buttons = resultButtons();
    if (!buttons.length) return;
    activeIndex = Math.max(0, Math.min(activeIndex, buttons.length - 1));
    buttons.forEach((button, index) => {
      const active = index === activeIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    if (focusResult) buttons[activeIndex]?.focus?.();
  }

  function buildResults() {
    const tmResults = sources
      .getTm()
      .slice(0, 4)
      .map((match) => ({
        kind: "tm",
        id: text(match.id),
        label: localization.source("TM match"),
        meta: `${Number(match.score || 0)}%${match.tmName ? ` · ${text(match.tmName)}` : ""}`,
        source: text(match.source),
        target: text(match.target),
        value: match
      }));
    const termResults = sources
      .getTerms()
      .filter((term) => !term.isForbidden && text(term.targetTerm))
      .slice(0, 3)
      .map((term) => ({
        kind: "term",
        id: text(term.id),
        label: localization.source("Approved term"),
        meta: text(term.termBaseName),
        source: text(term.sourceTerm),
        target: text(term.targetTerm),
        value: term
      }));
    const aiResults = sources
      .getAi()
      .slice()
      .reverse()
      .filter((suggestion) => text(suggestion.suggestedTarget))
      .slice(0, 2)
      .map((suggestion) => ({
        kind: "ai",
        id: text(suggestion.id),
        label: localization.source("Saved AI suggestion"),
        meta: text(suggestion.provider || suggestion.model || "AI"),
        source: localization.source("Replaces the target and marks it for review"),
        target: text(suggestion.suggestedTarget),
        value: suggestion
      }));
    return [...tmResults, ...termResults, ...aiResults].slice(0, 9);
  }

  function render() {
    visibleResults = buildResults();
    activeIndex = 0;
    resultsRoot.replaceChildren();
    if (!visibleResults.length) return false;
    const fragment = ownerDocument.createDocumentFragment();
    visibleResults.forEach((result, index) => {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = `quick-insert-result quick-insert-${result.kind}`;
      button.dataset.quickInsertIndex = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");

      const number = ownerDocument.createElement("kbd");
      number.textContent = String(index + 1);
      const heading = ownerDocument.createElement("span");
      heading.className = "quick-insert-heading";
      const label = ownerDocument.createElement("strong");
      label.textContent = result.label;
      const resultMeta = ownerDocument.createElement("span");
      resultMeta.textContent = result.meta;
      heading.append(label, resultMeta);
      const source = ownerDocument.createElement("span");
      source.className = "quick-insert-source";
      source.textContent = result.source;
      const target = ownerDocument.createElement("span");
      target.className = "quick-insert-target";
      target.textContent = result.target;
      button.append(number, heading, source, target);
      button.addEventListener("pointermove", () => {
        activeIndex = index;
        syncActive({ focusResult: false });
      });
      button.addEventListener("click", () => void execute(index));
      fragment.append(button);
    });
    resultsRoot.append(fragment);
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen()) return false;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    visibleResults = [];
    resultsRoot.replaceChildren();
    focus?.close?.(overlay);
    if (restoreFocus && !focus?.close && returnTarget?.focus) returnTarget.focus();
    return true;
  }

  async function execute(index = activeIndex) {
    const result = visibleResults[index];
    if (!result) return false;
    close({ restoreFocus: false });
    if (result.kind === "tm") {
      await actions.insertTm(result.target, { channel: "match", resourceId: result.id });
    } else if (result.kind === "term") {
      await actions.insertTerm(result.target, { resourceId: result.id, sourceTerm: result.value.sourceTerm || "" });
    } else {
      await actions.applyAi(result.id);
    }
    returnTarget?.focus?.();
    return true;
  }

  async function open() {
    const project = session.getProject();
    const segment = session.getSegment();
    if (!project || !segment) return false;
    const context = { projectId: project.id, segmentId: segment.id };
    returnTarget = ownerDocument.activeElement;
    await Promise.allSettled([sources.refreshTm(), sources.refreshTerms()]);
    if (session.getProject()?.id !== context.projectId || session.getSegment()?.id !== context.segmentId) return false;
    if (!render()) {
      status.set(localization.source("No TM, terminology, or saved AI suggestions are available."), "saved");
      return false;
    }
    if (meta) {
      meta.textContent = localization.source(
        "Choose a result. TM and AI replace the target; terms insert at the caret."
      );
    }
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    focus?.open?.(overlay, { initialFocus: resultButtons()[0], returnTarget });
    syncActive({ focusResult: !focus?.open });
    return true;
  }

  function hasSuggestions() {
    return Boolean(session.getProject() && session.getSegment() && buildResults().length);
  }

  function handleKeydown(event) {
    if (!isOpen() || event.isComposing || event.getModifierState?.("AltGraph")) return;
    const count = visibleResults.length;
    if (!count) return;
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      activeIndex = (activeIndex + 1) % count;
    } else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      activeIndex = (activeIndex - 1 + count) % count;
    } else if (event.key === "Home") {
      activeIndex = 0;
    } else if (event.key === "End") {
      activeIndex = count - 1;
    } else if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const index = Number(event.key) - 1;
      if (index >= count) return;
      event.preventDefault();
      void execute(index);
      return;
    } else if (event.key === "Enter") {
      event.preventDefault();
      void execute();
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    } else {
      return;
    }
    event.preventDefault();
    syncActive();
  }

  const closeListener = () => close();
  const overlayClickListener = (event) => {
    if (event.target === overlay) close();
  };

  function mount() {
    if (mounted) return false;
    closeButton.addEventListener("click", closeListener);
    overlay.addEventListener("click", overlayClickListener);
    overlay.addEventListener("keydown", handleKeydown);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    closeButton.removeEventListener("click", closeListener);
    overlay.removeEventListener("click", overlayClickListener);
    overlay.removeEventListener("keydown", handleKeydown);
    mounted = false;
    return true;
  }

  return Object.freeze({ close, execute, handleKeydown, hasSuggestions, isOpen, mount, open, render, unmount });
}
