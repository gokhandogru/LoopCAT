export function createInspectorToggleController({ element, state, layout, presentation, frame, selection }) {
  if (!state?.getOpen || !state?.setOpen || !layout?.setOpen || !presentation?.renderEditor) {
    throw new TypeError("InspectorToggleController requires state, layout, and editor-presentation boundaries.");
  }
  if (!frame?.request || !selection?.getSelected) {
    throw new TypeError("InspectorToggleController requires animation-frame and selected-tab-query boundaries.");
  }
  if (element && (!element.addEventListener || !element.removeEventListener || !element.focus)) {
    throw new TypeError("InspectorToggleController requires a checked optional toggle element.");
  }

  let mounted = false;

  const toggleClickListener = () => {
    state.setOpen(!state.getOpen());
    void layout.setOpen(state.getOpen());
    presentation.renderEditor();
    if (state.getOpen()) {
      frame.request(() => selection.getSelected()?.focus());
    } else {
      element.focus();
    }
  };

  function mount() {
    if (mounted) return false;
    element?.addEventListener("click", toggleClickListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    element?.removeEventListener("click", toggleClickListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
