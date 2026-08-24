import { validateAiOpenAiSuggestionControllerOptions } from "./ai-openai-suggestion-controller-contract.js";

function defaultLoader() {
  return import("./install-ai-openai-suggestion-controller.js");
}

export function createLazyAiOpenAiSuggestionController(options, boundaries = {}) {
  const load = Object.hasOwn(boundaries, "load") ? boundaries.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy direct OpenAI suggestion requires a load function.");
  validateAiOpenAiSuggestionControllerOptions(options);
  let controllerPromise = null;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((implementation) => {
          if (typeof implementation?.createAiOpenAiSuggestionController !== "function") {
            throw new TypeError("Lazy direct OpenAI suggestion did not install its implementation factory.");
          }
          return implementation.createAiOpenAiSuggestionController;
        })
        .then((factory) => {
          const implementation = factory(options);
          if (!implementation || typeof implementation.create !== "function") {
            throw new TypeError("Lazy direct OpenAI suggestion implementation is incomplete.");
          }
          return implementation;
        })
        .catch((error) => {
          controllerPromise = null;
          throw new Error("Direct OpenAI suggestion implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function create(...args) {
    const implementation = await loadController();
    return implementation.create(...args);
  }

  return Object.freeze({ create });
}

export function createAiOpenAiSuggestionController(options) {
  return createLazyAiOpenAiSuggestionController(options);
}
