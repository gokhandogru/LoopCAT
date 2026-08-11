const REQUIRED_METHODS = Object.freeze(["testConnection", "listModels", "translateSegment"]);

export function assertAiProvider(provider) {
  if (!provider?.id || !provider?.name) throw new TypeError("AI providers require stable id and name fields.");
  for (const method of REQUIRED_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new TypeError(`AI provider ${provider.id} is missing ${method}().`);
    }
  }
  return provider;
}

export function publicProviderDescriptor(provider) {
  const checked = assertAiProvider(provider);
  return Object.freeze({
    id: checked.id,
    name: checked.name,
    defaultBaseUrl: checked.defaultBaseUrl || "",
    defaultModel: checked.defaultModel || ""
  });
}
