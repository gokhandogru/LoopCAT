export function createAiContextController({
  adminSection,
  adminMount,
  suggestionList,
  suggestionMount,
  outputDrawer,
  outputMount,
  providerStatusText,
  contextualStatus
}) {
  if (!adminSection || !adminMount || !suggestionList || !suggestionMount) {
    throw new TypeError("AiContextController requires administration and contextual suggestion roots.");
  }

  let observer = null;

  function syncProviderStatus() {
    if (!contextualStatus) return;
    contextualStatus.textContent = providerStatusText?.textContent?.trim() || "Provider not connected";
  }

  function mount() {
    adminMount.append(adminSection);
    suggestionMount.append(suggestionList);
    if (outputDrawer && outputMount) outputMount.append(outputDrawer);
    syncProviderStatus();
    if (providerStatusText && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(syncProviderStatus);
      observer.observe(providerStatusText, { childList: true, characterData: true, subtree: true });
    }
  }

  function unmount() {
    observer?.disconnect();
    observer = null;
  }

  return Object.freeze({ mount, syncProviderStatus, unmount });
}
