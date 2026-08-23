import { validateResourceLibraryImportControllerOptions } from "./resource-library-import-controller-contract.js";

const API_ORDER = Object.freeze(["importTmx", "importTbx", "importTermList"]);

function defaultLoader() {
  return import("./install-resource-library-import-controller.js");
}

export function createLazyResourceLibraryImportController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy Resources-library import requires a load function.");
  validateResourceLibraryImportControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createResourceLibraryImportController !== "function") {
            throw new TypeError("Lazy Resources-library import did not install its implementation factory.");
          }
          return implementation.createResourceLibraryImportController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy Resources-library import implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Resources-library import implementation could not be loaded. Try again.", {
            cause: error
          });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    return implementation[method](...args);
  }

  return Object.freeze({
    importTmx: (...args) => invoke("importTmx", args),
    importTbx: (...args) => invoke("importTbx", args),
    importTermList: (...args) => invoke("importTermList", args)
  });
}

export function createResourceLibraryImportController(options) {
  return createLazyResourceLibraryImportController(options);
}
