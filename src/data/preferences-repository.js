const PREFERENCES_KEY = "modernization.preferences";
const PREFERENCES_VERSION = 1;

export function createPreferencesRepository(storageRepository) {
  if (!storageRepository?.get || !storageRepository?.put) {
    throw new TypeError("PreferencesRepository requires a StorageRepository.");
  }

  let cachedPreferences = null;
  let loadPromise = null;
  let writeQueue = Promise.resolve();

  function load() {
    if (cachedPreferences) return Promise.resolve(cachedPreferences);
    if (!loadPromise) {
      loadPromise = storageRepository.get("appMeta", PREFERENCES_KEY).then((record) => {
        cachedPreferences =
          record && record.version === PREFERENCES_VERSION && typeof record.preferences === "object"
            ? { ...record.preferences }
            : {};
        return cachedPreferences;
      });
    }
    return loadPromise;
  }

  async function persist(preferences) {
    const record = {
      key: PREFERENCES_KEY,
      version: PREFERENCES_VERSION,
      preferences: { ...(preferences || {}) },
      updatedAt: new Date().toISOString()
    };
    await storageRepository.put("appMeta", record);
    cachedPreferences = { ...record.preferences };
    return Object.freeze({ ...cachedPreferences });
  }

  async function read() {
    await writeQueue;
    const preferences = await load();
    return Object.freeze({ ...preferences });
  }

  function write(preferences) {
    writeQueue = writeQueue.then(async () => {
      await load();
      return persist(preferences);
    });
    return writeQueue;
  }

  function patch(changes) {
    writeQueue = writeQueue.then(async () => {
      const current = await load();
      return persist({ ...current, ...(changes || {}) });
    });
    return writeQueue;
  }

  return Object.freeze({ patch, read, write });
}
