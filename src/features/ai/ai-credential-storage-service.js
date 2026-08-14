export const AI_CREDENTIAL_STORAGE_KEYS = Object.freeze({
  openAi: "loopcat.openai.apiKey",
  localAiLegacy: "loopcat.localAi.apiKey"
});

/**
 * Owns browser-only OpenAI and provider-scoped local/hosted AI key storage,
 * warning containment, snapshots/restoration, precedence, legacy cleanup,
 * save rollback, and storage labels. Browser storage access, settings and
 * provider normalization, test-failure policy, presentation, and status
 * remain injected.
 *
 * @param {{
 *   storage: { get: (kind: "local" | "session") => Storage },
 *   settings: {
 *     readLocal: () => any,
 *     normalizeLocal: (settings: any) => any,
 *     normalizeProviderBaseUrl: (providerId: string, baseUrl: string) => string
 *   },
 *   defaults: { ollamaBaseUrl: string, openAiBaseUrl: string },
 *   failures?: { beforeOpenAiSave?: () => boolean | string },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiCredentialStorageService(options) {
  const storageBoundary = options?.storage;
  const settingsBoundary = options?.settings;
  const defaults = options?.defaults;
  if (
    typeof storageBoundary?.get !== "function" ||
    typeof settingsBoundary?.readLocal !== "function" ||
    typeof settingsBoundary?.normalizeLocal !== "function" ||
    typeof settingsBoundary?.normalizeProviderBaseUrl !== "function" ||
    !defaults?.ollamaBaseUrl ||
    !defaults?.openAiBaseUrl
  ) {
    throw new TypeError(
      "AiCredentialStorageService requires storage, settings, normalization, and default boundaries."
    );
  }

  const failures = options.failures || {};
  const logger = options.logger || console;

  function storageFor(label, kind) {
    try {
      return storageBoundary.get(kind);
    } catch (error) {
      logger.warn?.(`${label} ${kind} key storage is unavailable.`, error);
      return null;
    }
  }

  function readStorageItem(label, kind, key) {
    const storage = storageFor(label, kind);
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch (error) {
      logger.warn?.(`${label} ${kind} key storage read failed.`, error);
      return null;
    }
  }

  function writeStorageItem(label, kind, key, value) {
    const storage = storageFor(label, kind);
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      logger.warn?.(`${label} ${kind} key storage write failed.`, error);
      return false;
    }
  }

  function removeStorageItem(label, kind, key) {
    const storage = storageFor(label, kind);
    if (!storage) return true;
    try {
      storage.removeItem(key);
      return true;
    } catch (error) {
      logger.warn?.(`${label} ${kind} key storage clear failed.`, error);
      return false;
    }
  }

  function openAiSnapshot() {
    return {
      local: readStorageItem("OpenAI", "local", AI_CREDENTIAL_STORAGE_KEYS.openAi),
      session: readStorageItem("OpenAI", "session", AI_CREDENTIAL_STORAGE_KEYS.openAi)
    };
  }

  function restoreOpenAiSnapshot(snapshot = {}) {
    const localOk =
      snapshot.local !== null && snapshot.local !== undefined
        ? writeStorageItem("OpenAI", "local", AI_CREDENTIAL_STORAGE_KEYS.openAi, snapshot.local)
        : removeStorageItem("OpenAI", "local", AI_CREDENTIAL_STORAGE_KEYS.openAi);
    const sessionOk =
      snapshot.session !== null && snapshot.session !== undefined
        ? writeStorageItem("OpenAI", "session", AI_CREDENTIAL_STORAGE_KEYS.openAi, snapshot.session)
        : removeStorageItem("OpenAI", "session", AI_CREDENTIAL_STORAGE_KEYS.openAi);
    if (!localOk || !sessionOk) throw new Error("OpenAI key storage restore failed.");
    return true;
  }

  function safeRestoreOpenAiSnapshot(snapshot) {
    try {
      restoreOpenAiSnapshot(snapshot);
      return true;
    } catch (error) {
      logger.warn?.("OpenAI key storage restore failed.", error);
      return false;
    }
  }

  function storedOpenAiKey() {
    const snapshot = openAiSnapshot();
    return snapshot.session || snapshot.local || "";
  }

  function saveOpenAiKey(value, remember) {
    const key = String(value || "").trim();
    const previousKey = openAiSnapshot();
    try {
      restoreOpenAiSnapshot({ local: null, session: null });
      const forcedKeyStorageFailure = failures.beforeOpenAiSave?.();
      if (forcedKeyStorageFailure) {
        throw new Error(
          typeof forcedKeyStorageFailure === "string" ? forcedKeyStorageFailure : "Simulated OpenAI key storage failure"
        );
      }
      if (!key) return;
      const saved = remember
        ? writeStorageItem("OpenAI", "local", AI_CREDENTIAL_STORAGE_KEYS.openAi, key)
        : writeStorageItem("OpenAI", "session", AI_CREDENTIAL_STORAGE_KEYS.openAi, key);
      if (!saved) throw new Error("OpenAI key could not be saved in this browser.");
    } catch (error) {
      safeRestoreOpenAiSnapshot(previousKey);
      throw error;
    }
  }

  function openAiStorageLabel() {
    const snapshot = openAiSnapshot();
    if (snapshot.local) return "Saved in this browser";
    if (snapshot.session) return "Saved for this tab";
    return "Not saved";
  }

  function localAiStorageKey(settings = settingsBoundary.readLocal()) {
    const clean = settingsBoundary.normalizeLocal(settings || {});
    const providerId = String(clean.providerId || clean.provider || "ollama").trim() || "ollama";
    const fallbackBaseUrl =
      clean.baseUrl || (providerId === "ollama" ? defaults.ollamaBaseUrl : defaults.openAiBaseUrl);
    const normalizedBaseUrl = settingsBoundary.normalizeProviderBaseUrl(providerId, fallbackBaseUrl);
    return `${AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy}:${providerId}:${normalizedBaseUrl}`;
  }

  function writeLocalAiStorage(kind, value, settings = settingsBoundary.readLocal()) {
    const scopedWriteOk = writeStorageItem("Local AI", kind, localAiStorageKey(settings), value);
    const legacyClearOk = removeStorageItem("Local AI", kind, AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy);
    return scopedWriteOk && legacyClearOk;
  }

  function removeLocalAiStorage(kind, settings = settingsBoundary.readLocal()) {
    const scopedClearOk = removeStorageItem("Local AI", kind, localAiStorageKey(settings));
    const legacyClearOk = removeStorageItem("Local AI", kind, AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy);
    return scopedClearOk && legacyClearOk;
  }

  function localAiSnapshot(settings = settingsBoundary.readLocal()) {
    const scopedKey = localAiStorageKey(settings);
    return {
      key: scopedKey,
      local: readStorageItem("Local AI", "local", scopedKey),
      session: readStorageItem("Local AI", "session", scopedKey),
      legacyLocal: readStorageItem("Local AI", "local", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy),
      legacySession: readStorageItem("Local AI", "session", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy)
    };
  }

  function restoreLocalAiSnapshot(snapshot = {}) {
    const scopedKey = snapshot.key || AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy;
    const localOk =
      snapshot.local !== null && snapshot.local !== undefined
        ? writeStorageItem("Local AI", "local", scopedKey, snapshot.local)
        : removeStorageItem("Local AI", "local", scopedKey);
    const sessionOk =
      snapshot.session !== null && snapshot.session !== undefined
        ? writeStorageItem("Local AI", "session", scopedKey, snapshot.session)
        : removeStorageItem("Local AI", "session", scopedKey);
    const legacyLocalOk =
      snapshot.legacyLocal !== null && snapshot.legacyLocal !== undefined
        ? writeStorageItem("Local AI", "local", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy, snapshot.legacyLocal)
        : removeStorageItem("Local AI", "local", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy);
    const legacySessionOk =
      snapshot.legacySession !== null && snapshot.legacySession !== undefined
        ? writeStorageItem("Local AI", "session", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy, snapshot.legacySession)
        : removeStorageItem("Local AI", "session", AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy);
    if (!localOk || !sessionOk || !legacyLocalOk || !legacySessionOk) {
      throw new Error("Local AI key storage restore failed.");
    }
    return true;
  }

  function safeRestoreLocalAiSnapshot(snapshot) {
    try {
      restoreLocalAiSnapshot(snapshot);
      return true;
    } catch (error) {
      logger.warn?.("Local AI key storage restore failed.", error);
      return false;
    }
  }

  function storedLocalAiKey(settings = settingsBoundary.readLocal()) {
    const snapshot = localAiSnapshot(settings);
    return snapshot.session || snapshot.local || "";
  }

  function saveLocalAiKey(value, remember, settings = settingsBoundary.readLocal()) {
    const key = String(value || "").trim();
    const previousKey = localAiSnapshot(settings);
    try {
      const localOk = removeLocalAiStorage("local", settings);
      const sessionOk = removeLocalAiStorage("session", settings);
      if (!localOk || !sessionOk) throw new Error("Local AI key storage could not be cleared.");
      if (!key) return;
      const saved = remember
        ? writeLocalAiStorage("local", key, settings)
        : writeLocalAiStorage("session", key, settings);
      if (!saved) throw new Error("Local AI key could not be saved in this browser.");
    } catch (error) {
      safeRestoreLocalAiSnapshot(previousKey);
      throw error;
    }
  }

  function localAiStorageLabel(settings = settingsBoundary.readLocal()) {
    const snapshot = localAiSnapshot(settings);
    if (snapshot.local) return "Saved in this browser for this provider";
    if (snapshot.session) return "Saved for this tab and provider";
    return "Not saved";
  }

  return Object.freeze({
    localAiSnapshot,
    localAiStorageKey,
    localAiStorageLabel,
    openAiSnapshot,
    openAiStorageLabel,
    restoreLocalAiSnapshot,
    restoreOpenAiSnapshot,
    safeRestoreLocalAiSnapshot,
    safeRestoreOpenAiSnapshot,
    saveLocalAiKey,
    saveOpenAiKey,
    storedLocalAiKey,
    storedOpenAiKey
  });
}
