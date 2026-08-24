import { validateAiSuggestionApplicationControllerOptions } from "./ai-suggestion-application-controller-contract.js";

function defaultLoader() {
  return import("./install-ai-suggestion-application-controller.js");
}

export function createLazyAiSuggestionApplicationController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy AI suggestion application requires a load function.");
  validateAiSuggestionApplicationControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createAiSuggestionApplicationController !== "function") {
            throw new TypeError("Lazy AI suggestion application did not install its implementation factory.");
          }
          return implementation.createAiSuggestionApplicationController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || typeof implementation.apply !== "function") {
            throw new TypeError("Lazy AI suggestion application implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("AI suggestion application implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function apply(...args) {
    const implementation = await loadController();
    return implementation.apply(...args);
  }

  return Object.freeze({ apply });
}

export function createAiSuggestionApplicationController(options) {
  return createLazyAiSuggestionApplicationController(options);
}
