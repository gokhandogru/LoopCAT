export function escapeReportHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function reportHtml(strings, ...values) {
  return strings.reduce(
    (result, part, index) => `${result}${part}${index < values.length ? escapeReportHtml(values[index]) : ""}`,
    ""
  );
}
