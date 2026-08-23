import { validateProjectResourceTransferControllerOptions } from "./project-resource-transfer-controller-contract.js";

const API_ORDER = Object.freeze(["importTmx", "exportTmx", "importTbx", "importTermList", "exportTbx"]);

function defaultLoader() {
  return import("./install-project-resource-transfer-controller.js");
}

export function createLazyProjectResourceTransferController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy project resource transfer requires a load function.");
  validateProjectResourceTransferControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createProjectResourceTransferController !== "function") {
            throw new TypeError("Lazy project resource transfer did not install its implementation factory.");
          }
          return implementation.createProjectResourceTransferController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy project resource transfer implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Project resource transfer implementation could not be loaded. Try again.", {
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
    exportTmx: (...args) => invoke("exportTmx", args),
    importTbx: (...args) => invoke("importTbx", args),
    importTermList: (...args) => invoke("importTermList", args),
    exportTbx: (...args) => invoke("exportTbx", args)
  });
}

export function createProjectResourceTransferController(options) {
  return createLazyProjectResourceTransferController(options);
}
