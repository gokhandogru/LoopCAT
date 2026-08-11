const SENSITIVE_PATTERN = /(api[_ -]?key|authorization|bearer|password|token|secret)\s*[:=]\s*[^\s,;]+/gi;
const WINDOWS_PATH_PATTERN = /[a-z]:\\(?:[^\\\s]+\\)*[^\s]+/gi;

function redact(value) {
  return String(value || "")
    .replace(SENSITIVE_PATTERN, "$1=[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[local path]")
    .slice(0, 500);
}

export function normalizeError(error, context = {}) {
  const fallback = context.fallback || "The operation could not be completed.";
  return Object.freeze({
    code: redact(context.code || error?.code || "operation_failed"),
    whatHappened: redact(context.whatHappened || error?.message || fallback),
    preserved: redact(context.preserved || "Your existing work was preserved."),
    nextActions: Object.freeze((context.nextActions || []).map(redact).filter(Boolean)),
    retryable: Boolean(context.retryable)
  });
}
