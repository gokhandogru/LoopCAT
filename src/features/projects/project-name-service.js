/**
 * Owns shared project-name cleanup and stable deduplication plus remembered
 * and desktop-suggested creator-name policy. Storage, identity transport, and
 * sensitive-text redaction remain injected boundaries.
 *
 * @param {{
 *   redaction: { sanitize: (value: unknown) => string },
 *   storage: {
 *     getItem: (key: string) => unknown,
 *     setItem: (key: string, value: string) => void,
 *     removeItem: (key: string) => void
 *   },
 *   identity: { available: () => boolean, read: () => Promise<any> },
 *   storageKey: string,
 *   logger: { warn: (...values: any[]) => void }
 * }} options
 */
export function createProjectNameService(options) {
  const redaction = options?.redaction;
  const storage = options?.storage;
  const identity = options?.identity;
  const storageKey = options?.storageKey;
  const logger = options?.logger;

  if (typeof redaction?.sanitize !== "function") {
    throw new TypeError("ProjectNameService requires a sensitive-text redaction boundary.");
  }
  if (
    typeof storage?.getItem !== "function" ||
    typeof storage?.setItem !== "function" ||
    typeof storage?.removeItem !== "function"
  ) {
    throw new TypeError("ProjectNameService requires browser storage boundaries.");
  }
  if (typeof identity?.available !== "function" || typeof identity?.read !== "function") {
    throw new TypeError("ProjectNameService requires desktop identity boundaries.");
  }
  if (!String(storageKey || "").trim() || typeof logger?.warn !== "function") {
    throw new TypeError("ProjectNameService requires a storage key and logger boundary.");
  }

  function unique(values) {
    return Array.from(
      new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))
    );
  }

  function clean(value, fallback = "") {
    if (typeof value !== "string" && typeof value !== "number") return fallback;
    const cleaned = String(value).trim();
    return cleaned || fallback;
  }

  function cleanCreator(value, fallback = "") {
    return clean(redaction.sanitize(value || ""), fallback).slice(0, 120);
  }

  function storedCreator() {
    try {
      return cleanCreator(storage.getItem(storageKey));
    } catch {
      return "";
    }
  }

  function rememberCreator(value) {
    const cleaned = cleanCreator(value);
    try {
      if (cleaned) storage.setItem(storageKey, cleaned);
      else storage.removeItem(storageKey);
    } catch {
      // The project keeps its creator field even if browser preference storage is unavailable.
    }
    return cleaned;
  }

  async function suggestedCreator() {
    const stored = storedCreator();
    if (stored) return stored;
    if (identity.available()) {
      try {
        const userIdentity = await identity.read();
        const desktopName = cleanCreator(userIdentity?.displayName || userIdentity?.hostName);
        if (desktopName) return desktopName;
      } catch (error) {
        logger.warn("Desktop creator identity lookup failed.", error);
      }
    }
    return "This computer";
  }

  return Object.freeze({ unique, clean, cleanCreator, storedCreator, rememberCreator, suggestedCreator });
}
