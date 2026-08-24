import { validateProjectDeletionControllerOptions } from "./project-deletion-controller-contract.js";

const API_ORDER = Object.freeze(["deleteProject", "deleteDocument"]);

function defaultLoader() {
  return import("./install-project-deletion-controller.js");
}

export function createLazyProjectDeletionController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy project deletion requires a load function.");
  validateProjectDeletionControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createProjectDeletionController !== "function") {
            throw new TypeError("Lazy project deletion did not install its implementation factory.");
          }
          return implementation.createProjectDeletionController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || API_ORDER.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy project deletion implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Project deletion implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    return implementation[method](...args);
  }

  return Object.freeze({
    deleteProject: (...args) => invoke("deleteProject", args),
    deleteDocument: (...args) => invoke("deleteDocument", args)
  });
}

export function createProjectDeletionController(options) {
  return createLazyProjectDeletionController(options);
}
