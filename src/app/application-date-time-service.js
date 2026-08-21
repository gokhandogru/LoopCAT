/**
 * Owns shared application date and date-time formatting policy. Localization,
 * active locale state, and browser date/format construction remain injected
 * owners so their call-time behavior stays observable to existing consumers.
 */
export function createApplicationDateTimeService({ localization, locale, formatter, date }) {
  if (
    typeof localization?.source !== "function" ||
    typeof locale?.get !== "function" ||
    typeof formatter?.create !== "function" ||
    typeof date?.create !== "function"
  ) {
    throw new TypeError(
      "ApplicationDateTimeService requires checked localization, locale, formatter, and date boundaries."
    );
  }

  function formatDate(value) {
    if (!value) return localization.source("Never");
    const instance = formatter.create(locale.get() || undefined, { dateStyle: "medium" });
    return instance.format(date.create(value));
  }

  function formatDateTime(value) {
    if (!value) return localization.source("Never");
    const instance = formatter.create(locale.get() || undefined, { dateStyle: "medium", timeStyle: "short" });
    return instance.format(date.create(value));
  }

  return Object.freeze({ date: formatDate, dateTime: formatDateTime });
}
