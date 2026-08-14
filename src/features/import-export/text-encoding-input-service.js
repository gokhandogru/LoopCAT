const FALLBACK_OPTIONS = [
  ["auto", "Auto"],
  ["utf-8", "UTF-8"]
];

/**
 * Owns the import-encoding selector's option, default, selection, and decoder
 * option policy. Codec implementation, file reads, parsing, and persistence
 * remain behind injected boundaries.
 *
 * @param {{
 *   select?: any,
 *   getOptions: () => Array<[unknown, unknown]> | null | undefined,
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => void
 * }} options
 */
export function createTextEncodingInputService(options) {
  const select = options?.select;
  const getOptions = options?.getOptions;
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  if (typeof getOptions !== "function" || typeof escapeHtml !== "function" || typeof replaceSafeHtml !== "function") {
    throw new TypeError(
      "TextEncodingInputService requires encoding-option, escaping, and safe-presentation boundaries."
    );
  }

  function renderOptions() {
    if (!select) return;
    const encodingOptions = getOptions() || FALLBACK_OPTIONS;
    replaceSafeHtml(
      select,
      encodingOptions
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join("")
    );
    select.value = "auto";
  }

  function selectedEncoding() {
    return select?.value || "auto";
  }

  function decodingOptions() {
    return { encoding: selectedEncoding() };
  }

  return Object.freeze({ renderOptions, selectedEncoding, decodingOptions });
}
