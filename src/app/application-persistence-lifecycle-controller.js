export function createApplicationPersistenceLifecycleController({
  targets,
  visibility,
  pending,
  autosave,
  workspace,
  logger
}) {
  if (
    !targets?.window?.addEventListener ||
    !targets.window.removeEventListener ||
    !targets?.document?.addEventListener ||
    !targets.document.removeEventListener
  ) {
    throw new TypeError("ApplicationPersistenceLifecycleController requires checked window and document targets.");
  }
  if (!visibility?.getState || !pending?.hasImport || !workspace?.hasUnsaved) {
    throw new TypeError("ApplicationPersistenceLifecycleController requires visibility and pending-work queries.");
  }
  if (!autosave?.size || !autosave?.flush || !workspace?.autosaveDirty || !logger?.warn) {
    throw new TypeError("ApplicationPersistenceLifecycleController requires persistence actions and warning logger.");
  }

  let mounted = false;

  function shouldWarn() {
    return Boolean(pending.hasImport() || autosave.size() || workspace.hasUnsaved());
  }

  function runBackgroundSave() {
    autosave
      .flush()
      .then(() => workspace.autosaveDirty())
      .catch((error) => logger.warn(error));
  }

  const beforeUnloadListener = (event) => {
    if (!shouldWarn()) return;
    event.preventDefault();
    event.returnValue = "";
  };

  const visibilityChangeListener = () => {
    if (visibility.getState() !== "hidden" || !shouldWarn()) return;
    runBackgroundSave();
  };

  const pageHideListener = () => {
    if (!shouldWarn()) return;
    runBackgroundSave();
  };

  function mount() {
    if (mounted) return false;
    targets.window.addEventListener("beforeunload", beforeUnloadListener);
    targets.document.addEventListener("visibilitychange", visibilityChangeListener);
    targets.window.addEventListener("pagehide", pageHideListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    targets.window.removeEventListener("beforeunload", beforeUnloadListener);
    targets.document.removeEventListener("visibilitychange", visibilityChangeListener);
    targets.window.removeEventListener("pagehide", pageHideListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
