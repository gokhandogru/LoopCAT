import { caretPrefix, completePrefix, prepareCompletionCandidates } from "./predictive-typing-service.js";

function requireElement(value, label) {
  if (!value?.addEventListener || !value?.classList)
    throw new TypeError(`PredictiveTypingController requires ${label}.`);
  return value;
}

function resourceSignature(project, segment) {
  const links = (project?.resourceLinks || [])
    .map((link) => [link.resourceId, link.lookup, link.priority, link.penalty])
    .join("|");
  return `${project?.id || ""}:${segment?.id || ""}:${links}`;
}

/** Cursor-local, non-modal predictive typing over a bounded prepared cache. */
export function createPredictiveTypingController(options) {
  const listbox = requireElement(options?.elements?.listbox, "a listbox");
  const announcer = options?.elements?.announcer;
  const toggle = options?.elements?.toggle;
  const sources = options?.sources;
  const session = options?.session;
  const apply = options?.apply;
  if (typeof sources?.getTm !== "function" || typeof sources?.getTerms !== "function") {
    throw new TypeError("PredictiveTypingController requires TM and terminology sources.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getSegment !== "function" ||
    typeof apply !== "function"
  ) {
    throw new TypeError("PredictiveTypingController requires session and target-application boundaries.");
  }

  const listeners = [];
  const usageByProject = new Map();
  let mounted = false;
  let enabled = true;
  let cache = [];
  let cacheSignature = "";
  let visible = [];
  let activeIndex = 0;
  let activeEditor = null;
  let activeRowIndex = -1;
  let matchedPrefix = null;

  function persistUsage() {
    if (typeof options.preferences?.patch !== "function") return;
    const projects = Array.from(usageByProject.entries())
      .slice(-50)
      .map(([projectId, counts]) => [
        projectId,
        Object.fromEntries(
          Object.entries(counts)
            .filter(([, count]) => Number(count) > 0)
            .sort((left, right) => Number(right[1]) - Number(left[1]))
            .slice(0, 200)
        )
      ]);
    void Promise.resolve(
      options.preferences.patch({ predictiveTypingUsageByProject: Object.fromEntries(projects) })
    ).catch(() => {});
  }

  function listen(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push({ target, type, listener });
  }

  function hide() {
    visible = [];
    activeIndex = 0;
    matchedPrefix = null;
    listbox.classList.add("hidden");
    listbox.replaceChildren();
    activeEditor?.removeAttribute?.("aria-controls");
    activeEditor?.removeAttribute?.("aria-activedescendant");
    if (announcer) announcer.textContent = "";
    return true;
  }

  function prepare() {
    const project = session.getProject();
    const segment = session.getSegment();
    if (!project || !segment) {
      hide();
      return [];
    }
    const signature = resourceSignature(project, segment);
    const usage = usageByProject.get(project.id) || {};
    cache = prepareCompletionCandidates({
      tmMatches: sources.getTm(),
      termMatches: sources.getTerms(),
      locale: project.targetLang,
      usage
    });
    cacheSignature = signature;
    return cache.slice();
  }

  function protectedPosition(value, caret) {
    const before = String(value || "").slice(0, caret);
    return (
      before.lastIndexOf("<") > before.lastIndexOf(">") ||
      before.lastIndexOf("{") > before.lastIndexOf("}") ||
      before.lastIndexOf("[") > before.lastIndexOf("]")
    );
  }

  function candidatesFor(value, caret, locale) {
    const initial = caretPrefix(value, caret, locale);
    const prefixes = [initial];
    const words = initial.text.split(/\s+/u);
    for (let count = Math.min(2, words.length - 1); count >= 0; count -= 1) {
      const text = words.slice(words.length - count - 1).join(" ");
      if (text && !prefixes.some((item) => item.text === text))
        prefixes.push({ text, start: caret - text.length, end: caret });
    }
    for (const prefix of prefixes) {
      const matches = completePrefix({
        prefix: prefix.text,
        caretContext: { resourceSignature: cacheSignature },
        resourceSignature: resourceSignature(session.getProject(), session.getSegment()),
        candidates: cache,
        locale,
        limit: 6
      });
      if (matches.length) return { prefix, matches };
    }
    return { prefix: initial, matches: [] };
  }

  function syncActive() {
    const optionsNodes = Array.from(listbox.querySelectorAll?.('[role="option"]') || []);
    optionsNodes.forEach((node, index) => {
      const active = index === activeIndex;
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", String(active));
    });
    const id = optionsNodes[activeIndex]?.id || "";
    if (id) activeEditor?.setAttribute?.("aria-activedescendant", id);
  }

  function caretRectangle(editor) {
    const rect = editor.getBoundingClientRect?.();
    const ownerDocument = editor.ownerDocument || globalThis.document;
    const view = ownerDocument?.defaultView || globalThis;
    if (!rect || !ownerDocument?.body?.append || typeof view.getComputedStyle !== "function") return rect;
    const computed = view.getComputedStyle(editor);
    const mirror = ownerDocument.createElement("div");
    const marker = ownerDocument.createElement("span");
    const copiedProperties = [
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRightWidth",
      "borderTopWidth",
      "boxSizing",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "letterSpacing",
      "lineHeight",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "tabSize",
      "textIndent",
      "textTransform"
    ];
    Object.assign(mirror.style, {
      position: "fixed",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`
    });
    copiedProperties.forEach((property) => {
      mirror.style[property] = computed[property];
    });
    mirror.textContent = String(editor.value || "").slice(0, editor.selectionStart || 0);
    marker.textContent = "\u200b";
    mirror.append(marker);
    ownerDocument.body.append(mirror);
    const markerRect = marker.getBoundingClientRect();
    mirror.remove();
    return {
      left: markerRect.left - (Number(editor.scrollLeft) || 0),
      top: markerRect.top - (Number(editor.scrollTop) || 0),
      bottom: markerRect.bottom - (Number(editor.scrollTop) || 0)
    };
  }

  function position(editor) {
    const rect = caretRectangle(editor);
    if (!rect) return;
    const viewportWidth = globalThis.innerWidth || 1280;
    const viewportHeight = globalThis.innerHeight || 800;
    listbox.style.left = `${Math.max(8, Math.min(rect.left, viewportWidth - 528))}px`;
    const below = rect.bottom + 4;
    listbox.style.top = `${below + 280 < viewportHeight ? below : Math.max(8, rect.top - 284)}px`;
  }

  function render(editor, rowIndex, matches, prefix) {
    visible = matches;
    activeIndex = 0;
    activeEditor = editor;
    activeRowIndex = rowIndex;
    matchedPrefix = prefix;
    listbox.replaceChildren();
    const ownerDocument = listbox.ownerDocument || globalThis.document;
    matches.forEach((candidate, index) => {
      const option = ownerDocument.createElement("div");
      option.id = `predictive-option-${index}`;
      option.className = "predictive-typing-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      const value = ownerDocument.createElement("strong");
      value.textContent = candidate.insertion;
      const meta = ownerDocument.createElement("span");
      meta.className = "muted";
      meta.textContent = `${candidate.kind.replace(/([A-Z])/g, " $1").toLowerCase()} · ${candidate.resourceName || "project resource"}`;
      const why = ownerDocument.createElement("span");
      why.className = "muted";
      why.textContent = candidate.why;
      why.title = `Why this suggestion? ${candidate.why}`;
      option.append(value, meta, why);
      option.addEventListener("pointermove", () => {
        activeIndex = index;
        syncActive();
      });
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        void accept(index);
      });
      listbox.append(option);
    });
    listbox.classList.remove("hidden");
    editor.setAttribute?.("aria-autocomplete", "list");
    editor.setAttribute?.("aria-controls", listbox.id);
    position(editor);
    syncActive();
    if (announcer)
      announcer.textContent = `${matches.length} translation suggestion${matches.length === 1 ? "" : "s"} available.`;
  }

  function onInput(editor, rowIndex, event = {}) {
    if (!enabled || event.isComposing || event.altGraph || options.modal?.isOpen?.()) return hide();
    if (!editor || editor.selectionStart !== editor.selectionEnd) return hide();
    const project = session.getProject();
    const segment = session.getSegment();
    if (!project || !segment || protectedPosition(editor.value, editor.selectionStart)) return hide();
    if (cacheSignature !== resourceSignature(project, segment)) prepare();
    const result = candidatesFor(editor.value, editor.selectionStart, project.targetLang);
    if (!result.prefix.text || !result.matches.length) return hide();
    render(editor, rowIndex, result.matches, result.prefix);
    return result.matches;
  }

  async function accept(index = activeIndex) {
    const candidate = visible[index];
    if (!candidate || !activeEditor || !matchedPrefix) return false;
    const value = String(activeEditor.value || "");
    const expected = `${value.slice(0, matchedPrefix.start)}${candidate.insertion}${value.slice(matchedPrefix.end)}`;
    if (typeof activeEditor.setRangeText === "function") {
      activeEditor.setRangeText(candidate.insertion, matchedPrefix.start, matchedPrefix.end, "end");
    } else {
      activeEditor.value = expected;
    }
    const next = String(activeEditor.value || expected);
    const caret = matchedPrefix.start + candidate.insertion.length;
    activeEditor.setSelectionRange?.(caret, caret);
    const projectId = session.getProject()?.id || "";
    const usage = usageByProject.get(projectId) || {};
    usage[candidate.normalizedText] = (Number(usage[candidate.normalizedText]) || 0) + 1;
    usageByProject.set(projectId, usage);
    persistUsage();
    prepare();
    hide();
    await apply(activeRowIndex, next, { start: caret, end: caret, candidate });
    activeEditor?.focus?.();
    return true;
  }

  function handleKeydown(event) {
    if (
      !visible.length ||
      listbox.classList.contains("hidden") ||
      event.isComposing ||
      event.getModifierState?.("AltGraph")
    )
      return false;
    if (event.key === "ArrowDown") activeIndex = (activeIndex + 1) % visible.length;
    else if (event.key === "ArrowUp") activeIndex = (activeIndex - 1 + visible.length) % visible.length;
    else if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      void accept();
      return true;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
      return true;
    } else return false;
    event.preventDefault();
    event.stopPropagation();
    syncActive();
    return true;
  }

  function attach(editor, rowIndex) {
    editor?.setAttribute?.("aria-autocomplete", "list");
    return {
      focus: () => {
        activeEditor = editor;
        activeRowIndex = rowIndex;
        prepare();
      },
      blur: () => hide(),
      input: (event) => onInput(editor, rowIndex, { isComposing: event?.isComposing }),
      compositionstart: hide,
      compositionend: () => onInput(editor, rowIndex),
      keydown: handleKeydown
    };
  }

  async function mount() {
    if (mounted) return false;
    if (toggle) {
      const preferences = await options.preferences?.read?.();
      enabled = preferences?.predictiveTyping !== false;
      Object.entries(preferences?.predictiveTypingUsageByProject || {}).forEach(([projectId, counts]) => {
        if (!counts || typeof counts !== "object" || Array.isArray(counts)) return;
        usageByProject.set(
          projectId,
          Object.fromEntries(Object.entries(counts).filter(([, count]) => Number(count) > 0))
        );
      });
      toggle.checked = enabled;
      listen(toggle, "change", () => {
        enabled = Boolean(toggle.checked);
        if (!enabled) hide();
        void options.preferences?.patch?.({ predictiveTyping: enabled });
      });
    }
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listeners.splice(0).forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
    hide();
    mounted = false;
    return true;
  }

  return Object.freeze({
    mount,
    unmount,
    attach,
    prepare,
    onInput,
    handleKeydown,
    accept,
    hide,
    isOpen: () => visible.length > 0 && !listbox.classList.contains("hidden")
  });
}
