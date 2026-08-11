const BUNDLED_LOCALES = Object.freeze([
  Object.freeze({ locale: "en-US", label: "English (United States)", dir: "ltr" }),
  Object.freeze({ locale: "ca-ES", label: "Català (Espanya)", dir: "ltr" }),
  Object.freeze({ locale: "tr-TR", label: "Türkçe (Türkiye)", dir: "ltr" })
]);

const DEFAULT_LOADERS = Object.freeze({
  "en-US": () => Promise.resolve(),
  // @ts-expect-error Generated locale catalogs are intentional side-effect scripts.
  "ca-ES": () => import("../../i18n/locales/ca-ES.js"),
  // @ts-expect-error Generated locale catalogs are intentional side-effect scripts.
  "tr-TR": () => import("../../i18n/locales/tr-TR.js")
});

function matchingLocale(value) {
  const requested = String(value || "")
    .trim()
    .toLowerCase();
  if (!requested) return "en-US";
  return (
    BUNDLED_LOCALES.find((item) => item.locale.toLowerCase() === requested)?.locale ||
    BUNDLED_LOCALES.find((item) => item.locale.toLowerCase().split("-")[0] === requested.split("-")[0])?.locale ||
    "en-US"
  );
}

export function createLocaleLoader({ i18n, browserWindow = globalThis, loaders = DEFAULT_LOADERS }) {
  if (!i18n?.registerLocale) throw new TypeError("LocaleLoader requires the LoopCAT i18n registry.");
  const loaded = new Set(["en-US"]);
  const loading = new Map();

  function registerManifest() {
    for (const descriptor of BUNDLED_LOCALES) i18n.registerLocale({ ...descriptor, messages: {} });
  }

  function ensure(locale) {
    const resolved = matchingLocale(locale);
    if (loaded.has(resolved)) return resolved;
    if (!loading.has(resolved)) {
      const loader = loaders[resolved];
      if (!loader) throw new Error(`No bundled locale loader exists for ${resolved}.`);
      loading.set(
        resolved,
        Promise.resolve(loader()).then(() => {
          loaded.add(resolved);
          loading.delete(resolved);
          return resolved;
        })
      );
    }
    return loading.get(resolved);
  }

  async function initialize() {
    registerManifest();
    let saved = "";
    try {
      saved = browserWindow.localStorage?.getItem?.("loopcat.uiLocale") || "";
    } catch {
      saved = "";
    }
    const browserLocale = Array.from(browserWindow.navigator?.languages || [browserWindow.navigator?.language]).find(
      Boolean
    );
    return await ensure(saved || browserLocale || "en-US");
  }

  return Object.freeze({ ensure, initialize, list: () => BUNDLED_LOCALES });
}

export { BUNDLED_LOCALES, matchingLocale };
