const VALID_PREFERENCES = new Set(["system", "light", "dark"]);

export function createThemeController({
  documentRoot,
  themeColorMeta,
  select,
  preferencesRepository,
  matchMedia = globalThis.matchMedia?.bind(globalThis)
}) {
  if (!documentRoot || !preferencesRepository) {
    throw new TypeError("ThemeController requires the document root and PreferencesRepository.");
  }

  let preference = "light";
  const mediaQuery = matchMedia?.("(prefers-color-scheme: dark)") || null;

  function resolvedTheme() {
    return preference === "system" ? (mediaQuery?.matches ? "dark" : "light") : preference;
  }

  function apply() {
    const resolved = resolvedTheme();
    documentRoot.dataset.themePreference = preference;
    documentRoot.dataset.theme = resolved;
    documentRoot.style.colorScheme = resolved;
    if (select) select.value = preference;
    if (themeColorMeta) themeColorMeta.content = resolved === "dark" ? "#111820" : "#f6f7f6";
    return resolved;
  }

  async function setPreference(value, { persist = true } = {}) {
    preference = VALID_PREFERENCES.has(value) ? value : "light";
    const resolved = apply();
    if (persist) await preferencesRepository.patch({ theme: preference });
    return resolved;
  }

  async function initialize({ freshProfile = false } = {}) {
    const preferences = await preferencesRepository.read();
    const defaultPreference = freshProfile ? "system" : "light";
    await setPreference(VALID_PREFERENCES.has(preferences.theme) ? preferences.theme : defaultPreference, {
      persist: !VALID_PREFERENCES.has(preferences.theme)
    });
    select?.addEventListener("change", () => void setPreference(select.value));
    const handleSystemThemeChange = () => {
      if (preference === "system") apply();
    };
    mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
    mediaQuery?.addListener?.(handleSystemThemeChange);
    return Object.freeze({ preference, resolved: resolvedTheme() });
  }

  return Object.freeze({ apply, getPreference: () => preference, initialize, resolvedTheme, setPreference });
}
