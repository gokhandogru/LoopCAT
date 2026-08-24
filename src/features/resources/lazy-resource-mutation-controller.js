import { validateResourceMutationControllerOptions } from "./resource-mutation-controller-contract.js";

const API_ORDER = Object.freeze(["saveTmEntry", "saveTerm", "deleteTmEntry", "deleteTerm", "deleteResource"]);

function defaultLoader() {
  return import("./install-resource-mutation-controller.js");
}

export function createLazyResourceMutationController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy resource mutation requires a load function.");
  validateResourceMutationControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createResourceMutationController !== "function") {
            throw new TypeError("Lazy resource mutation did not install its implementation factory.");
          }
          return implementation.createResourceMutationController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy resource mutation implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Resource mutation implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    return implementation[method](...args);
  }

  return Object.freeze({
    saveTmEntry: (...args) => invoke("saveTmEntry", args),
    saveTerm: (...args) => invoke("saveTerm", args),
    deleteTmEntry: (...args) => invoke("deleteTmEntry", args),
    deleteTerm: (...args) => invoke("deleteTerm", args),
    deleteResource: (...args) => invoke("deleteResource", args)
  });
}

export function createResourceMutationController(options) {
  return createLazyResourceMutationController(options);
}
