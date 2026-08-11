import { assertAiProvider, publicProviderDescriptor } from "./provider-contract.js";

export function createAiProviderService(registry) {
  if (!registry?.get || !registry?.list) {
    throw new TypeError("AiProviderService requires the existing provider registry.");
  }

  function get(providerId) {
    return assertAiProvider(registry.get(providerId));
  }

  return Object.freeze({
    get,
    list() {
      return registry.list().map(publicProviderDescriptor);
    },
    testConnection(providerId, config = {}) {
      return get(providerId).testConnection(config);
    },
    listModels(providerId, config = {}) {
      return get(providerId).listModels(config);
    },
    translateSegment(providerId, config = {}, request = {}) {
      return get(providerId).translateSegment(config, request);
    }
  });
}
