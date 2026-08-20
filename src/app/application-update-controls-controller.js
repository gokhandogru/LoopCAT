export function createApplicationUpdateControlsController({ elements, actions }) {
  if (!actions?.activate || !actions?.defer) {
    throw new TypeError("ApplicationUpdateControlsController requires activate and defer actions.");
  }
  for (const element of [elements?.reloadButton, elements?.deferButton]) {
    if (element && (!element.addEventListener || !element.removeEventListener)) {
      throw new TypeError("ApplicationUpdateControlsController requires checked optional button elements.");
    }
  }

  let mounted = false;
  const reloadClickListener = () => {
    void actions.activate();
  };
  const deferClickListener = () => actions.defer();

  function mount() {
    if (mounted) return false;
    elements?.reloadButton?.addEventListener("click", reloadClickListener);
    elements?.deferButton?.addEventListener("click", deferClickListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements?.reloadButton?.removeEventListener("click", reloadClickListener);
    elements?.deferButton?.removeEventListener("click", deferClickListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
