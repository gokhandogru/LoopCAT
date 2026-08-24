import { validateAiProjectBriefControllerOptions } from "./ai-project-brief-controller-contract.js";

function defaultLoader() {
  return import("./install-ai-project-brief-controller.js");
}

export function createLazyAiProjectBriefController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy AI project brief requires a load function.");
  validateAiProjectBriefControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createAiProjectBriefController !== "function") {
            throw new TypeError("Lazy AI project brief did not install its implementation factory.");
          }
          return implementation.createAiProjectBriefController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || typeof implementation.generate !== "function") {
            throw new TypeError("Lazy AI project brief implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("AI project brief implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function generate(...args) {
    const implementation = await loadController();
    return implementation.generate(...args);
  }

  return Object.freeze({ generate });
}

export function createAiProjectBriefController(options) {
  return createLazyAiProjectBriefController(options);
}
