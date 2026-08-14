/**
 * @param {{
 *   i18n?: {
 *     t?: (key: unknown, values?: Record<string, unknown>) => string,
 *     source?: (text: unknown, values?: Record<string, unknown>) => string,
 *     getLocale?: () => string
 *   } | null,
 *   documentElement?: { lang?: string } | null,
 *   escapeHtml?: (value: unknown) => string,
 *   confirm?: (message: string) => boolean,
 *   alert?: (message: string) => void
 * }} [options]
 */
export function createUiLocalizationService({ i18n, documentElement, escapeHtml, confirm, alert } = {}) {
  if (typeof escapeHtml !== "function") {
    throw new TypeError("UiLocalizationService requires an HTML escaping boundary.");
  }

  const translate = (key, values = {}) => (i18n?.t ? i18n.t(key, values) : key);
  const source = (text, values = {}) => (i18n?.source ? i18n.source(text, values) : String(text || ""));
  const locale = () => i18n?.getLocale?.() || documentElement?.lang || "en-US";
  const label = (key, values = {}) => translate(`ui.label.${key}`, values);
  const labelHtml = (key, values = {}) => escapeHtml(label(key, values));
  const sourceHtml = (text, values = {}) => escapeHtml(source(text, values));
  const confirmTranslated = (message, values = {}) => confirm(source(message, values));
  const alertTranslated = (message) => alert(source(message));

  return Object.freeze({
    translate,
    source,
    locale,
    label,
    labelHtml,
    sourceHtml,
    confirm: confirmTranslated,
    alert: alertTranslated
  });
}
