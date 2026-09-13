export function createApplicationPersistenceLifecycleController({
  targets,
  visibility,
  pending,
  autosave,
  workspace,
  logger,
  emergencyText = () => "",
  flushMutations = () => Promise.resolve(),
  pauseEditing = () => () => {}
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
  let closing = false;
  let removeDesktopListener;
  let resumeEditing;
  let closeEpoch = 0;

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
    if (closing) return;
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
    removeDesktopListener = targets.window.LoopCATDesktop?.onPrepareClose?.(async ({ mode }) => {
      if (mode === "resume") {
        closeEpoch++;
        closing = false;
        resumeEditing?.();
        resumeEditing = null;
        return {};
      }
      if (mode === "emergency") {
        closeEpoch++;
        closing = false;
        resumeEditing ||= pauseEditing();
        return { text: emergencyText() };
      }
      if (pending.hasImport()) throw new Error("Wait for the current import to finish.");
      const epoch = ++closeEpoch;
      resumeEditing ||= pauseEditing();
      try {
        await autosave.flush();
        await flushMutations();
        if (epoch !== closeEpoch) throw new Error("Close request was superseded.");
        closing = true;
        return {};
      } catch (error) {
        if (epoch === closeEpoch) {
          resumeEditing?.();
          resumeEditing = null;
        }
        throw error;
      }
    });
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    targets.window.removeEventListener("beforeunload", beforeUnloadListener);
    targets.document.removeEventListener("visibilitychange", visibilityChangeListener);
    targets.window.removeEventListener("pagehide", pageHideListener);
    removeDesktopListener?.();
    closeEpoch++;
    resumeEditing?.();
    resumeEditing = null;
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
