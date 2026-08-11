export function createUpdateController({
  serviceWorker,
  location,
  trustScriptUrl = (value) => value,
  beforeActivate,
  onStateChange = (_state) => {},
  onError = (_error) => {}
}) {
  if (!serviceWorker?.register || !location) {
    throw new TypeError("UpdateController requires Service Worker and Location interfaces.");
  }

  let registration = null;
  let waitingWorker = null;
  let deferred = false;

  function publish(state, detail = {}) {
    onStateChange(Object.freeze({ state, deferred, ...detail }));
  }

  function detectWaitingWorker(candidate = registration?.waiting) {
    if (!candidate) return false;
    waitingWorker = candidate;
    if (!deferred) publish("ready");
    return true;
  }

  function observeInstalling(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && serviceWorker.controller)
        detectWaitingWorker(registration?.waiting || worker);
    });
  }

  async function initialize(scriptUrl = "./service-worker.js") {
    const trustedScriptUrl = trustScriptUrl(scriptUrl);
    registration = await serviceWorker.register(trustedScriptUrl);
    if (registration.waiting && serviceWorker.controller) detectWaitingWorker(registration.waiting);
    registration.addEventListener?.("updatefound", () => observeInstalling(registration.installing));
    await registration.update?.();
    return registration;
  }

  function defer() {
    deferred = true;
    publish("deferred");
  }

  async function activate() {
    const worker = waitingWorker || registration?.waiting;
    if (!worker) return false;
    deferred = false;
    publish("saving");
    try {
      await beforeActivate?.();
      publish("activating");
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out activating the offline update.")), 10000);
        serviceWorker.addEventListener(
          "controllerchange",
          () => {
            clearTimeout(timeout);
            resolve(undefined);
          },
          { once: true }
        );
        worker.postMessage({ type: "SKIP_WAITING" });
      });
      publish("reloading");
      location.reload();
      return true;
    } catch (error) {
      publish("error", { message: error?.message || String(error) });
      onError(error);
      return false;
    }
  }

  return Object.freeze({ activate, defer, detectWaitingWorker, initialize });
}
