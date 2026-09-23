function requireElement(value, label) {
  if (!value?.addEventListener) throw new TypeError(`QuickTermCaptureController requires ${label}.`);
  return value;
}

function wordAtCaret(value, caret) {
  const text = String(value || "");
  const position = Math.max(0, Math.min(text.length, Number(caret) || 0));
  const left = text.slice(0, position).match(/[\p{L}\p{M}\p{N}_'-]+$/u)?.[0] || "";
  const right = text.slice(position).match(/^[\p{L}\p{M}\p{N}_'-]+/u)?.[0] || "";
  return left + right;
}

/** Compact multi-termbase capture routed through the atomic term-pair service. */
export function createQuickTermCaptureController(options) {
  const elements = options?.elements || {};
  const dialog = requireElement(elements.dialog, "a dialog");
  const form = requireElement(elements.form, "a form");
  const sourceInput = requireElement(elements.source, "a source input");
  const targetInput = requireElement(elements.target, "a target input");
  const extrasRoot = requireElement(elements.extras, "an extra-termbase list");
  const session = options?.session;
  const resources = options?.resources;
  const repository = options?.repository;
  if (typeof session?.getProject !== "function" || typeof session?.getSegment !== "function") {
    throw new TypeError("QuickTermCaptureController requires project and segment boundaries.");
  }
  if (typeof resources?.links !== "function" || typeof repository?.savePair !== "function") {
    throw new TypeError("QuickTermCaptureController requires resource and term-pair boundaries.");
  }

  const rememberedExtras = new Map();
  const listeners = [];
  let mounted = false;
  let busy = false;
  let rememberedLoaded = false;

  async function loadRemembered() {
    if (rememberedLoaded) return;
    rememberedLoaded = true;
    const preferences = await options.preferences?.read?.();
    Object.entries(preferences?.termCaptureExtraTermBasesByProject || {}).forEach(([projectId, resourceIds]) => {
      if (Array.isArray(resourceIds)) rememberedExtras.set(projectId, new Set(resourceIds.filter(Boolean)));
    });
  }

  function persistRemembered() {
    if (typeof options.preferences?.patch !== "function") return;
    const values = Object.fromEntries(
      Array.from(rememberedExtras.entries())
        .slice(-100)
        .map(([projectId, resourceIds]) => [projectId, Array.from(resourceIds).slice(0, 50)])
    );
    void Promise.resolve(options.preferences.patch({ termCaptureExtraTermBasesByProject: values })).catch(() => {});
  }

  function listen(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push({ target, type, listener });
  }

  function projectLinks(project) {
    return resources.links(project).filter((link) => link.type === "termbase" && link.contribute);
  }

  function activeLink(project) {
    return projectLinks(project).find((link) => link.resourceId === project?.activeTermBaseId) || null;
  }

  function renderExtras(project) {
    const active = activeLink(project);
    const remembered = rememberedExtras.get(project.id) || new Set();
    extrasRoot.replaceChildren();
    const ownerDocument = extrasRoot.ownerDocument || globalThis.document;
    const links = projectLinks(project).filter((link) => link.resourceId !== active?.resourceId);
    if (!links.length) {
      const message = ownerDocument.createElement("p");
      message.className = "muted";
      message.textContent = "No other contribution-enabled termbases.";
      extrasRoot.append(message);
      return;
    }
    links.forEach((link) => {
      const label = ownerDocument.createElement("label");
      label.className = "checkbox-row";
      const checkbox = ownerDocument.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = link.resourceId;
      checkbox.dataset.extraTermbase = link.resourceId;
      checkbox.checked = remembered.has(link.resourceId);
      const name = ownerDocument.createElement("span");
      name.textContent = link.cachedName || link.name;
      label.append(checkbox, name);
      extrasRoot.append(label);
    });
  }

  async function open() {
    await loadRemembered().catch(() => {});
    const project = session.getProject();
    const segment = session.getSegment();
    if (!project || !segment) return false;
    const active = activeLink(project);
    if (!active) {
      options.status?.set?.(
        "Term capture is disabled. Enable contribution for a termbase in Optional Resource Settings.",
        "dirty"
      );
      return false;
    }
    const editor = options.selection?.targetEditor?.();
    const selectionStart = Number(editor?.selectionStart);
    const selectionEnd = Number(editor?.selectionEnd);
    const selectedTarget =
      editor && selectionEnd > selectionStart
        ? String(editor.value || "").slice(selectionStart, selectionEnd)
        : wordAtCaret(
            editor?.value || segment.target,
            Number.isFinite(selectionStart) ? selectionStart : String(segment.target || "").length
          );
    const selectedSource = String(options.selection?.sourceText?.() || "").trim();
    sourceInput.value = selectedSource;
    targetInput.value = selectedTarget;
    form.reset?.();
    sourceInput.value = selectedSource;
    targetInput.value = selectedTarget;
    if (elements.message) elements.message.textContent = `Active termbase: ${active.cachedName || active.name}`;
    renderExtras(project);
    await options.dialogLifecycle?.open?.("quick-term-capture", { initialFocus: sourceInput, returnTarget: editor });
    if (!options.dialogLifecycle?.open) dialog.showModal?.();
    return true;
  }

  function selectedExtraIds() {
    return Array.from(extrasRoot.querySelectorAll?.("[data-extra-termbase]:checked") || []).map((input) => input.value);
  }

  async function save() {
    const project = session.getProject();
    const active = activeLink(project);
    if (!project || !active || busy) return false;
    if (!sourceInput.value.trim() || !targetInput.value.trim()) {
      form.reportValidity?.();
      return false;
    }
    busy = true;
    elements.submit?.setAttribute?.("aria-busy", "true");
    try {
      const extraTermBaseIds = selectedExtraIds();
      rememberedExtras.set(project.id, new Set(extraTermBaseIds));
      persistRemembered();
      const result = await repository.savePair({
        projectId: project.id,
        activeTermBaseId: active.resourceId,
        extraTermBaseIds,
        source: sourceInput.value,
        target: targetInput.value,
        metadata: {
          status: elements.status?.value || "preferred",
          caseSensitivity: elements.caseSensitivity?.value || "insensitive",
          matchMode: elements.matchMode?.value || "exact",
          fuzzyThreshold: Number(elements.fuzzyThreshold?.value) || 85,
          definition: elements.definition?.value || "",
          subject: elements.subject?.value || "",
          domain: elements.domain?.value || "",
          partOfSpeech: elements.partOfSpeech?.value || "",
          usageExample: elements.usageExample?.value || "",
          notes: elements.notes?.value || ""
        }
      });
      await Promise.allSettled([options.refresh?.projectTerms?.({ rerender: true }), options.refresh?.suggestions?.()]);
      options.workspace?.markDirty?.(project.id);
      const savedCount = result.saved?.length || 0;
      const skippedCount = result.skipped?.length || 0;
      const alternatives = Array.from(
        new Set(
          (result.alternatives || []).map((alternative) => String(alternative.target || "").trim()).filter(Boolean)
        )
      );
      const alternativeNote = alternatives.length
        ? `; existing alternative${alternatives.length === 1 ? "" : "s"} kept: ${alternatives.slice(0, 3).join(" / ")}`
        : "";
      options.status?.set?.(
        `Saved to ${savedCount} termbase${savedCount === 1 ? "" : "s"}${skippedCount ? `; skipped ${skippedCount} exact duplicate${skippedCount === 1 ? "" : "s"}` : ""}${alternativeNote}.`,
        "saved"
      );
      options.dialogLifecycle?.close?.("quick-term-capture", "saved");
      if (!options.dialogLifecycle?.close) dialog.close?.("saved");
      return result;
    } catch (error) {
      if (elements.message) elements.message.textContent = error?.message || "Term could not be saved.";
      options.status?.set?.(error?.message || "Term could not be saved.", "dirty");
      return false;
    } finally {
      busy = false;
      elements.submit?.setAttribute?.("aria-busy", "false");
    }
  }

  function mount() {
    if (mounted) return false;
    options.dialogLifecycle?.register?.({ id: "quick-term-capture", dialog, initialFocus: sourceInput });
    listen(form, "submit", (event) => {
      event.preventDefault();
      void save();
    });
    listen(form, "keydown", (event) => {
      if (event.isComposing || event.getModifierState?.("AltGraph")) return;
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void save();
      }
    });
    for (const button of [elements.close, elements.cancel])
      listen(
        button,
        "click",
        () => options.dialogLifecycle?.close?.("quick-term-capture", "cancel") || dialog.close?.("cancel")
      );
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listeners.splice(0).forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount, open, save, wordAtCaret });
}
