import { validateProjectExportControllerOptions } from "./project-export-controller-contract.js";

const API_ORDER = Object.freeze(["exportBrowserBackup", "exportProjectPackage"]);

function defaultLoader() {
  return import("./install-project-export-controller.js");
}

export function createLazyProjectExportController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy project export requires a load function.");
  validateProjectExportControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createProjectExportController !== "function") {
            throw new TypeError("Lazy project export did not install its implementation factory.");
          }
          return implementation.createProjectExportController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy project export implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Project export implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    return implementation[method](...args);
  }

  return Object.freeze({
    exportBrowserBackup: (...args) => invoke("exportBrowserBackup", args),
    exportProjectPackage: (...args) => invoke("exportProjectPackage", args)
  });
}

export function createProjectExportController(options) {
  return createLazyProjectExportController(options);
}
