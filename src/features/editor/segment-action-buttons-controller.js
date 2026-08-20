export function createSegmentActionButtonsController({ elements, actions }) {
  const saveTmButton = elements?.saveTmButton;
  const nextOpenButton = elements?.nextOpenButton;
  if (!saveTmButton?.addEventListener || !saveTmButton?.removeEventListener) {
    throw new TypeError("SegmentActionButtonsController requires a checked Save to TM button.");
  }
  if (!nextOpenButton?.addEventListener || !nextOpenButton?.removeEventListener) {
    throw new TypeError("SegmentActionButtonsController requires a checked Next open button.");
  }
  if (!actions?.saveToTm || !actions?.nextOpen) {
    throw new TypeError("SegmentActionButtonsController requires checked segment actions.");
  }

  let mounted = false;
  const saveTmListener = actions.saveToTm;
  const nextOpenListener = actions.nextOpen;

  function mount() {
    if (mounted) return false;
    saveTmButton.addEventListener("click", saveTmListener);
    nextOpenButton.addEventListener("click", nextOpenListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    saveTmButton.removeEventListener("click", saveTmListener);
    nextOpenButton.removeEventListener("click", nextOpenListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
