import { validateProjectImportRestoreControllerOptions } from "./project-import-restore-controller-contract.js";

const API_ORDER = Object.freeze([
  "importProjectPackage",
  "importProjectPackageData",
  "restoreBackupData",
  "restoreBackupFile"
]);

function defaultLoader() {
  return import("./install-project-import-restore-controller.js");
}

export function createLazyProjectImportRestoreController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy project import and restore requires a load function.");
  validateProjectImportRestoreControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createProjectImportRestoreController !== "function") {
            throw new TypeError("Lazy project import and restore did not install its implementation factory.");
          }
          return implementation.createProjectImportRestoreController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy project import and restore implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Project import and restore implementation could not be loaded. Try again.", {
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
    importProjectPackage: (...args) => invoke("importProjectPackage", args),
    importProjectPackageData: (...args) => invoke("importProjectPackageData", args),
    restoreBackupData: (...args) => invoke("restoreBackupData", args),
    restoreBackupFile: (...args) => invoke("restoreBackupFile", args)
  });
}

export function createProjectImportRestoreController(options) {
  return createLazyProjectImportRestoreController(options);
}
