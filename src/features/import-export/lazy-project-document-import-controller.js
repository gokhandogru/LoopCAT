import {
  createProjectDocumentDuplicatePolicy,
  validateProjectDocumentImportControllerOptions
} from "./project-document-import-controller-contract.js";

const API_ORDER = Object.freeze([
  "confirmDuplicate",
  "hasDocumentNamed",
  "importDocx",
  "importFile",
  "importLocalization",
  "importXliff"
]);

function defaultLoader() {
  return import("./install-project-document-import-controller.js");
}

export function createLazyProjectDocumentImportController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy project-document import requires a load function.");
  validateProjectDocumentImportControllerOptions(options);
  const duplicatePolicy = createProjectDocumentDuplicatePolicy(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createProjectDocumentImportController !== "function") {
            throw new TypeError("Lazy project-document import did not install its implementation factory.");
          }
          return implementation.createProjectDocumentImportController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy project-document import implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Project-document import implementation could not be loaded. Try again.", {
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
    confirmDuplicate: duplicatePolicy.confirmDuplicate,
    hasDocumentNamed: duplicatePolicy.hasDocumentNamed,
    importDocx: (...args) => invoke("importDocx", args),
    importFile: (...args) => invoke("importFile", args),
    importLocalization: (...args) => invoke("importLocalization", args),
    importXliff: (...args) => invoke("importXliff", args)
  });
}

export function createProjectDocumentImportController(options) {
  return createLazyProjectDocumentImportController(options);
}
