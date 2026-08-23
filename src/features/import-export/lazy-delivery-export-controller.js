import {
  createDeliveryCanRun,
  validateDeliveryExportControllerOptions
} from "./delivery-export-controller-contract.js";

const API_ORDER = Object.freeze([
  "canRun",
  "exportBilingualDocx",
  "exportLocalization",
  "exportTargetDocx",
  "exportTargetText",
  "exportXliff12",
  "exportXliff22"
]);

function defaultLoader() {
  return import("./install-delivery-export-controller.js");
}

export function createLazyDeliveryExportController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy delivery export requires a load function.");
  validateDeliveryExportControllerOptions(options);
  const canRun = createDeliveryCanRun({ delivery: options.delivery, status: options.status });
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createDeliveryExportController !== "function") {
            throw new TypeError("Lazy delivery export did not install its implementation factory.");
          }
          return implementation.createDeliveryExportController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy delivery export implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Delivery export implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    return implementation[method](...args);
  }

  return Object.freeze({
    canRun,
    exportBilingualDocx: (...args) => invoke("exportBilingualDocx", args),
    exportLocalization: (...args) => invoke("exportLocalization", args),
    exportTargetDocx: (...args) => invoke("exportTargetDocx", args),
    exportTargetText: (...args) => invoke("exportTargetText", args),
    exportXliff12: (...args) => invoke("exportXliff12", args),
    exportXliff22: (...args) => invoke("exportXliff22", args)
  });
}

export function createDeliveryExportController(options) {
  return createLazyDeliveryExportController(options);
}
