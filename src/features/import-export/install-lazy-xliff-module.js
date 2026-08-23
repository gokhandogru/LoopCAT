function defaultLoader() {
  // @ts-expect-error The legacy XLIFF script installs its global compatibility module by side effect.
  return import("../../../xliff.js");
}

function xliffMimeType(version = "1.2") {
  return String(version).startsWith("2") ? "application/xliff+xml" : "application/x-xliff+xml";
}

export function installLazyXliffModule(browserWindow, options = {}) {
  const namespace = browserWindow?.CatHan;
  if (!namespace || typeof namespace !== "object") {
    throw new TypeError("Lazy XLIFF requires the LoopCAT compatibility namespace.");
  }
  const load = Object.hasOwn(options, "load") ? options.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy XLIFF requires a load function.");
  let loadPromise = null;
  let lazyModule;

  function loadModule() {
    if (!loadPromise) {
      loadPromise = Promise.resolve()
        .then(() => load())
        .then(() => {
          const implementation = namespace.xliff;
          if (
            !implementation ||
            implementation === lazyModule ||
            typeof implementation.buildXliff !== "function" ||
            typeof implementation.buildXliff22 !== "function" ||
            typeof implementation.buildTargetXliff !== "function" ||
            typeof implementation.detectXliffProfile !== "function" ||
            typeof implementation.parseXliffFile !== "function" ||
            typeof implementation.parseXliffText !== "function" ||
            typeof implementation.validateXliff2Document !== "function" ||
            typeof implementation.xliffMimeType !== "function"
          ) {
            throw new TypeError("Lazy XLIFF did not install its implementation.");
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
    buildXliff(...args) {
      return invoke("buildXliff", args);
    },
    buildXliff22(...args) {
      return invoke("buildXliff22", args);
    },
    buildTargetXliff(...args) {
      return invoke("buildTargetXliff", args);
    },
    detectXliffProfile(...args) {
      return invoke("detectXliffProfile", args);
    },
    parseXliffFile(...args) {
      return invoke("parseXliffFile", args);
    },
    parseXliffText(...args) {
      return invoke("parseXliffText", args);
    },
    validateXliff2Document(...args) {
      return invoke("validateXliff2Document", args);
    },
    xliffMimeType
  };
  namespace.xliff = lazyModule;

  return Object.freeze({ load: loadModule, module: lazyModule });
}

if (globalThis.window?.CatHan) installLazyXliffModule(globalThis.window);
