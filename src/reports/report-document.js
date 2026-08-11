const REQUIRED_CSP = Object.freeze([
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
]);

export function finalizeReportDocument(value) {
  const html = String(value || "");
  if (!/^<!doctype html>/i.test(html.trimStart())) {
    throw new Error("Exported reports require an HTML doctype.");
  }
  const cspMatch = html.match(
    /<meta\s+http-equiv=(?:"Content-Security-Policy"|'Content-Security-Policy')\s+content=(?:"([^"]+)"|'([^']+)')/i
  );
  const csp = cspMatch?.[1] || cspMatch?.[2] || "";
  for (const directive of REQUIRED_CSP) {
    if (!csp.includes(directive)) throw new Error(`Exported report CSP is missing ${directive}.`);
  }
  if (/<script\b/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) {
    throw new Error("Exported report contains an executable HTML sink.");
  }
  return html;
}

export const REPORT_CSP_DIRECTIVES = REQUIRED_CSP;
