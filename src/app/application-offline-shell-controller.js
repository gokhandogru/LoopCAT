/**
 * Owns application-level offline shell registration, cache warmup, update
 * presentation, and the current update-controller lifecycle. Update policy,
 * persistence, localization, browser primitives, and controls stay injected.
 *
 * @param {{
 *   browser: {
 *     hasServiceWorker: () => boolean,
 *     getServiceWorker: () => any,
 *     hasCacheStorage: () => boolean,
 *     getCacheStorage: () => any,
 *     fetchAsset: (asset: string) => Promise<any>,
 *     location: any,
 *     setTimeout: (callback: (...args: any[]) => void, timeoutMs: number) => any
 *   },
 *   updates: { create: (options: object) => any, trustScriptUrl: (value: string) => any },
 *   assets: { cachePrefix: string, warmup: readonly string[] },
 *   persistence: { flush: () => Promise<unknown>, shouldSaveRecovery: () => boolean, saveRecovery: () => Promise<unknown> },
 *   presentation: {
 *     elements?: { banner?: any, title?: any, message?: any, reloadButton?: any, deferButton?: any },
 *     localize: (value: string) => string,
 *     setStatus: (message: string, mode?: string) => void
 *   },
 *   logger: { warn: (...values: any[]) => void }
 * }} options
 */
export function createApplicationOfflineShellController(options) {
  const browser = options?.browser;
  const updates = options?.updates;
  const assets = options?.assets;
  const persistence = options?.persistence;
  const presentation = options?.presentation;
  const logger = options?.logger;

  if (
    typeof browser?.hasServiceWorker !== "function" ||
    typeof browser?.getServiceWorker !== "function" ||
    typeof browser?.hasCacheStorage !== "function" ||
    typeof browser?.getCacheStorage !== "function" ||
    typeof browser?.fetchAsset !== "function" ||
    !browser?.location ||
    typeof browser?.setTimeout !== "function"
  ) {
    throw new TypeError("ApplicationOfflineShellController requires checked browser boundaries.");
  }
  if (typeof updates?.create !== "function" || typeof updates?.trustScriptUrl !== "function") {
    throw new TypeError("ApplicationOfflineShellController requires update-controller boundaries.");
  }
  if (!String(assets?.cachePrefix || "").trim() || !Array.isArray(assets?.warmup)) {
    throw new TypeError("ApplicationOfflineShellController requires offline cache assets.");
  }
  if (
    typeof persistence?.flush !== "function" ||
    typeof persistence?.shouldSaveRecovery !== "function" ||
    typeof persistence?.saveRecovery !== "function"
  ) {
    throw new TypeError("ApplicationOfflineShellController requires persistence boundaries.");
  }
  if (
    typeof presentation?.localize !== "function" ||
    typeof presentation?.setStatus !== "function" ||
    typeof logger?.warn !== "function"
  ) {
    throw new TypeError("ApplicationOfflineShellController requires presentation and logger boundaries.");
  }

  const elements = presentation.elements || {};
  const warmupAssets = Object.freeze([...assets.warmup]);
  let updateController = null;

  async function waitForReady(timeoutMs = 10000) {
    if (!browser.hasServiceWorker()) return null;
    try {
      const serviceWorker = browser.getServiceWorker();
      return await Promise.race([
        serviceWorker.ready,
        new Promise((_, reject) => {
          browser.setTimeout(() => reject(new Error("Timed out waiting for offline app shell")), timeoutMs);
        })
      ]);
    } catch {
      return null;
    }
  }

  async function waitForController(timeoutMs = 10000) {
    if (!browser.hasServiceWorker()) return false;
    const serviceWorker = browser.getServiceWorker();
    if (serviceWorker.controller) return true;
    try {
      await Promise.race([
        new Promise((resolve) => {
          serviceWorker.addEventListener("controllerchange", resolve, { once: true });
        }),
        new Promise((_, reject) => {
          browser.setTimeout(() => reject(new Error("Timed out waiting for offline app shell control")), timeoutMs);
        })
      ]);
    } catch {
      return false;
    }
    return Boolean(serviceWorker.controller);
  }

  async function warmCache() {
    if (!browser.hasServiceWorker() || !browser.hasCacheStorage()) return;
    try {
      await waitForReady();
      await waitForController();
      const cacheStorage = browser.getCacheStorage();
      const cacheName = (await cacheStorage.keys()).find((name) => name.startsWith(assets.cachePrefix));
      if (!cacheName) return;
      const cache = await cacheStorage.open(cacheName);
      await Promise.all(
        warmupAssets.map(async (asset) => {
          try {
            if (await cache.match(asset)) return;
            const response = await browser.fetchAsset(asset);
            if (!response) return;
            await cache.put(asset, response.clone());
          } catch (error) {
            logger.warn("Offline app shell warmup failed.", asset, error);
          }
        })
      );
    } catch (error) {
      logger.warn("Offline app shell warmup failed.", error);
    }
  }

  function renderUpdateState(update) {
    if (!elements.banner) return;
    const hidden = !update || update.state === "deferred";
    elements.banner.classList.toggle("hidden", hidden);
    if (hidden) return;
    const messages = {
      ready: ["Update ready", "Reload when convenient. LoopCAT will save pending local work first."],
      saving: ["Saving before update", "Pending segment and workspace changes are being saved locally."],
      activating: ["Applying update", "The new offline app shell is ready. LoopCAT will reload shortly."],
      reloading: ["Reloading LoopCAT", "Your saved project and workspace state will be restored."],
      error: ["Update paused", update.message || "Your current version is still active and your work was preserved."]
    };
    const [title, message] = messages[update.state] || messages.ready;
    elements.title.textContent = presentation.localize(title);
    elements.message.textContent = presentation.localize(message);
    const busy = ["saving", "activating", "reloading"].includes(update.state);
    elements.reloadButton.disabled = busy;
    elements.deferButton.disabled = busy;
    elements.reloadButton.textContent =
      update.state === "error" ? presentation.localize("Try again") : presentation.localize("Reload now");
  }

  function register() {
    if (!browser.hasServiceWorker()) return;
    const serviceWorker = browser.getServiceWorker();
    if (browser.location.protocol === "loopcat:") {
      serviceWorker
        .getRegistrations?.()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error) => {
          logger.warn("Desktop service worker cleanup failed.", error);
        });
      return;
    }
    if (!["http:", "https:"].includes(browser.location.protocol)) return;
    updateController = updates.create({
      serviceWorker,
      location: browser.location,
      trustScriptUrl: updates.trustScriptUrl,
      beforeActivate: async () => {
        await persistence.flush();
        if (persistence.shouldSaveRecovery()) await persistence.saveRecovery();
      },
      onStateChange: renderUpdateState,
      onError: (error) =>
        presentation.setStatus(error?.message || "Offline update failed; current version remains active", "dirty")
    });
    updateController
      ?.initialize?.("./service-worker.js")
      .then(async () => {
        await warmCache();
      })
      .catch((error) => {
        logger.warn("Offline app shell registration failed.", error);
      });
  }

  function activate() {
    return updateController?.activate?.();
  }

  function defer() {
    return updateController?.defer?.();
  }

  return Object.freeze({ activate, defer, register });
}
