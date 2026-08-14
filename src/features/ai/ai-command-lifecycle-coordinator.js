/**
 * Owns shared AI command lifecycle adaptation and ordered cancellation. Each
 * command controller retains its own running/progress/AbortController state,
 * provider work, persistence, and status decisions.
 *
 * @param {{
 *   state: { read: () => any, patch: (values: object) => void },
 *   presentation: { renderProgress: () => void },
 *   status: { set: (message: string, mode: string) => void }
 * }} options
 */
export function createAiCommandLifecycleCoordinator(options) {
  const state = options?.state;
  const presentation = options?.presentation;
  const status = options?.status;
  if (
    typeof state?.read !== "function" ||
    typeof state?.patch !== "function" ||
    typeof presentation?.renderProgress !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("AiCommandLifecycleCoordinator requires state, progress-presentation, and status boundaries.");
  }

  const owners = new Map();
  let cancelHandlers = [];

  function createLifecycle(ownerId, lifecycleOptions = {}) {
    const id = String(ownerId || "").trim();
    if (!id || owners.has(id)) {
      throw new TypeError("AiCommandLifecycleCoordinator requires a unique lifecycle owner ID.");
    }
    const owner = { abortController: null, ownsPromptBusy: false };
    owners.set(id, owner);

    function readState() {
      return state.read() || {};
    }

    /**
     * @param {{ running?: boolean, promptBusy?: boolean, abortController?: any, progress?: any }} values
     */
    function sync(values = {}) {
      const { running, promptBusy, abortController, progress } = values;
      if (lifecycleOptions.alwaysSyncProgress || progress !== undefined) {
        state.patch({ progress });
      }
      if (lifecycleOptions.trackPromptBusy) {
        if (promptBusy) {
          owner.ownsPromptBusy = true;
          state.patch({ promptBusy: true });
        } else if (owner.ownsPromptBusy) {
          state.patch({ promptBusy: false });
          owner.ownsPromptBusy = false;
        }
      }
      if (running) {
        owner.abortController = abortController;
        state.patch({ running: true, abortController });
      } else if (owner.abortController && readState().abortController === owner.abortController) {
        state.patch({ running: false, abortController: null });
        owner.abortController = null;
      }
    }

    return Object.freeze({
      isBusy: () => Boolean(readState().running),
      isRunning: () => Boolean(readState().running),
      isPromptBusy: () => Boolean(readState().promptBusy),
      sync
    });
  }

  function setCancelHandlers(handlers) {
    if (!Array.isArray(handlers) || handlers.some((handler) => typeof handler?.cancel !== "function")) {
      throw new TypeError("AiCommandLifecycleCoordinator requires ordered cancel handlers.");
    }
    cancelHandlers = handlers.slice();
  }

  function cancel() {
    for (const handler of cancelHandlers) {
      if (handler.cancel()) return true;
    }
    const currentState = state.read() || {};
    currentState.abortController?.abort();
    state.patch({
      progress: {
        ...(currentState.progress || {}),
        canceled: true
      }
    });
    presentation.renderProgress();
    status.set("Canceling local AI batch...", "dirty");
    return false;
  }

  return Object.freeze({ cancel, createLifecycle, setCancelHandlers });
}
