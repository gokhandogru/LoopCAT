function defaultLoader() {
  // @ts-expect-error The legacy localization script installs its global compatibility module by side effect.
  return import("../../../localization.js");
}

export function installLazyLocalizationModule(browserWindow, options = {}) {
  const namespace = browserWindow?.CatHan;
  if (!namespace || typeof namespace !== "object") {
    throw new TypeError("Lazy localization requires the LoopCAT compatibility namespace.");
  }
  const load = Object.hasOwn(options, "load") ? options.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy localization requires a load function.");
  let loadPromise = null;
  let lazyModule;

  function loadModule() {
    if (!loadPromise) {
      loadPromise = Promise.resolve()
        .then(() => load())
        .then(() => {
          const implementation = namespace.localization;
          if (
            !implementation ||
            implementation === lazyModule ||
            typeof implementation.parseLocalizationFile !== "function" ||
            typeof implementation.buildLocalizationFile !== "function"
          ) {
            throw new TypeError("Lazy localization did not install its implementation.");
          }
          return implementation;
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadModule();
    return implementation[method](...args);
  }

  lazyModule = {
    parseLocalizationFile(...args) {
      return invoke("parseLocalizationFile", args);
    },
    buildLocalizationFile(...args) {
      return invoke("buildLocalizationFile", args);
    }
  };
  namespace.localization = lazyModule;

  return Object.freeze({ load: loadModule, module: lazyModule });
}

if (globalThis.window?.CatHan) installLazyLocalizationModule(globalThis.window);
