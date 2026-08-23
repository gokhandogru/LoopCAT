function defaultLoader() {
  // @ts-expect-error The legacy DOCX script installs its global compatibility module by side effect.
  return import("../../../docx.js");
}

export function installLazyDocxModule(browserWindow, options = {}) {
  const namespace = browserWindow?.CatHan;
  if (!namespace || typeof namespace !== "object") {
    throw new TypeError("Lazy DOCX requires the LoopCAT compatibility namespace.");
  }
  const detectProtectedTags = namespace.protectedTags?.detectProtectedTags;
  if (typeof detectProtectedTags !== "function") {
    throw new TypeError("Lazy DOCX requires the synchronous protected-tag detector.");
  }
  const load = Object.hasOwn(options, "load") ? options.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy DOCX requires a load function.");
  let loadPromise = null;
  let lazyModule;

  function loadModule() {
    if (!loadPromise) {
      loadPromise = Promise.resolve()
        .then(() => load())
        .then(() => {
          const implementation = namespace.docx;
          if (
            !implementation ||
            implementation === lazyModule ||
            typeof implementation.extractDocxSegments !== "function" ||
            typeof implementation.buildTargetDocx !== "function" ||
            typeof implementation.buildBilingualDocx !== "function" ||
            typeof implementation.detectProtectedTags !== "function"
          ) {
            throw new TypeError("Lazy DOCX did not install its implementation.");
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
    extractDocxSegments(...args) {
      return invoke("extractDocxSegments", args);
    },
    buildTargetDocx(...args) {
      return invoke("buildTargetDocx", args);
    },
    buildBilingualDocx(...args) {
      return invoke("buildBilingualDocx", args);
    },
    detectProtectedTags
  };
  namespace.docx = lazyModule;

  return Object.freeze({ load: loadModule, module: lazyModule });
}

if (globalThis.window?.CatHan) installLazyDocxModule(globalThis.window);
