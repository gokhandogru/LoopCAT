export function createFocusModeController({ elements, store, session, localization, menu, frame, editor }) {
  if (!store?.getState || (store.dispatch != null && typeof store.dispatch !== "function") || !session?.getProject) {
    throw new TypeError("FocusModeController requires checked store and session boundaries.");
  }
  if (
    !localization?.translate ||
    !menu?.closeAll ||
    !frame?.request ||
    !editor?.renderSegments ||
    !editor?.focusActive
  ) {
    throw new TypeError(
      "FocusModeController requires localization, menu, animation-frame, segment-render, and target-focus boundaries."
    );
  }
  for (const element of [elements?.body, elements?.workspace]) {
    if (!element?.classList?.toggle) {
      throw new TypeError("FocusModeController requires checked body and workspace elements.");
    }
  }
  for (const element of [elements?.toggleButton, elements?.exitButton]) {
    if (element && (!element.addEventListener || !element.removeEventListener || !element.setAttribute)) {
      throw new TypeError("FocusModeController requires checked optional button elements.");
    }
  }
  if (elements?.exitButton && !elements.exitButton.classList?.toggle) {
    throw new TypeError("FocusModeController requires a checked optional exit button.");
  }

  let mounted = false;

  function render() {
    const active = Boolean(
      store.getState().interface.focusMode && store.getState().navigation.view === "editor" && session.getProject()
    );
    elements.body.classList.toggle("focus-mode", active);
    elements.workspace.classList.toggle("focus-mode", active);
    if (elements.toggleButton) {
      elements.toggleButton.textContent = active
        ? localization.translate("app.focus.normalView")
        : localization.translate("app.focus.focus");
      elements.toggleButton.title = active
        ? localization.translate("app.focus.returnTitle")
        : localization.translate("app.focus.showOnlyTitle");
      elements.toggleButton.setAttribute("aria-pressed", String(active));
    }
    if (elements.exitButton) {
      elements.exitButton.classList.toggle("hidden", !active);
      elements.exitButton.setAttribute("aria-hidden", String(!active));
    }
  }

  function set(enabled) {
    store.dispatch?.({
      type: "interface/focus-mode-changed",
      payload: { enabled: Boolean(enabled && session.getProject()) }
    });
    render();
    menu.closeAll();
    if (!session.getProject()) return;
    frame.request(() => {
      editor.renderSegments({ preserveScroll: true });
      if (store.getState().interface.focusMode) editor.focusActive();
    });
  }

  function toggle() {
    set(!store.getState().interface.focusMode);
  }

  const exitClickListener = () => set(false);

  function mount() {
    if (mounted) return false;
    elements.toggleButton?.addEventListener("click", toggle);
    elements.exitButton?.addEventListener("click", exitClickListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.toggleButton?.removeEventListener("click", toggle);
    elements.exitButton?.removeEventListener("click", exitClickListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ render, set, toggle, mount, unmount });
}
