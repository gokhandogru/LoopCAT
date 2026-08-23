import {
  validateAiAlternativesControllerOptions,
  validateAiDraftEditingControllerOptions,
  validateAiPretranslationControllerOptions,
  validateAiReviewControllerOptions,
  validateAiTagRepairControllerOptions,
  validateAiTerminologyApplicationControllerOptions,
  validateAiTerminologyExtractionControllerOptions
} from "./ai-command-controller-contracts.js";

const REQUIRED_FACTORIES = Object.freeze([
  "createAiAlternativesController",
  "createAiDraftEditingController",
  "createAiPretranslationController",
  "createAiReviewController",
  "createAiTagRepairController",
  "createAiTerminologyApplicationController",
  "createAiTerminologyExtractionController"
]);

let implementationPromise = null;

function loadAiCommandControllerFactories() {
  if (!implementationPromise) {
    implementationPromise = import("./install-ai-command-controllers.js")
      .then((implementation) => {
        if (REQUIRED_FACTORIES.some((name) => typeof implementation?.[name] !== "function")) {
          throw new TypeError("Lazy AI command controllers did not install their implementation factories.");
        }
        return implementation;
      })
      .catch((error) => {
        implementationPromise = null;
        throw error;
      });
  }
  return implementationPromise;
}

export function createLazyAiCommandController({
  options,
  validate,
  factoryName,
  apiOrder,
  load = loadAiCommandControllerFactories
}) {
  if (typeof validate !== "function" || typeof load !== "function") {
    throw new TypeError("Lazy AI command controller requires validation and loading boundaries.");
  }
  if (!factoryName || !Array.isArray(apiOrder) || !apiOrder.length || !apiOrder.includes("cancel")) {
    throw new TypeError("Lazy AI command controller requires a factory name and API order including cancel.");
  }
  validate(options);
  let controller = null;
  let controllerPromise = null;
  let cancelPending = false;

  function loadController() {
    if (!controllerPromise) {
      controllerPromise = Promise.resolve()
        .then(() => load())
        .then((factories) => {
          const factory = factories?.[factoryName];
          if (typeof factory !== "function") {
            throw new TypeError("Lazy AI command controller implementation factory is unavailable.");
          }
          const implementation = factory(options);
          if (!implementation || apiOrder.some((method) => typeof implementation[method] !== "function")) {
            throw new TypeError("Lazy AI command controller implementation is incomplete.");
          }
          controller = implementation;
          return implementation;
        })
        .catch((error) => {
          controller = null;
          controllerPromise = null;
          cancelPending = false;
          throw new Error("AI command implementation could not be loaded. Try again.", { cause: error });
        });
    }
    return controllerPromise;
  }

  async function invoke(method, args) {
    const implementation = await loadController();
    const result = implementation[method](...args);
    if (cancelPending) {
      cancelPending = false;
      implementation.cancel();
    }
    return result;
  }

  function cancel() {
    if (controller) return controller.cancel();
    if (!controllerPromise) return false;
    cancelPending = true;
    return true;
  }

  const api = {};
  apiOrder.forEach((method) => {
    api[method] = method === "cancel" ? cancel : (...args) => invoke(method, args);
  });
  return Object.freeze(api);
}

export function createAiPretranslationController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiPretranslationControllerOptions,
    factoryName: "createAiPretranslationController",
    apiOrder: ["cancel", "pretranslate"]
  });
}

export function createAiReviewController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiReviewControllerOptions,
    factoryName: "createAiReviewController",
    apiOrder: ["cancel", "reviewActive", "reviewBatch"]
  });
}

export function createAiTagRepairController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiTagRepairControllerOptions,
    factoryName: "createAiTagRepairController",
    apiOrder: ["cancel", "repairActive", "repairBatch"]
  });
}

export function createAiAlternativesController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiAlternativesControllerOptions,
    factoryName: "createAiAlternativesController",
    apiOrder: ["suggestActive", "suggestBatch", "cancel"]
  });
}

export function createAiTerminologyApplicationController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiTerminologyApplicationControllerOptions,
    factoryName: "createAiTerminologyApplicationController",
    apiOrder: ["applyActive", "applyBatch", "cancel"]
  });
}

export function createAiDraftEditingController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiDraftEditingControllerOptions,
    factoryName: "createAiDraftEditingController",
    apiOrder: ["polishActive", "adaptActive", "polishBatch", "adaptBatch", "cancel"]
  });
}

export function createAiTerminologyExtractionController(options) {
  return createLazyAiCommandController({
    options,
    validate: validateAiTerminologyExtractionControllerOptions,
    factoryName: "createAiTerminologyExtractionController",
    apiOrder: ["extractActive", "extractBatch", "cancel"]
  });
}
