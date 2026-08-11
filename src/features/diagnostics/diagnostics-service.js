const SENSITIVE_PATTERN = /(api[_ -]?key|authorization|bearer|password|token|secret)\s*[:=]\s*[^\s,;]+/gi;
const PATH_PATTERN = /(?:[a-z]:\\|\/(?:Users|home)\/)[^\s,;]+/gi;

function redactText(value) {
  return String(value || "")
    .replace(SENSITIVE_PATTERN, "$1=[redacted]")
    .replace(PATH_PATTERN, "[local path]")
    .slice(0, 500);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function sanitize(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/name|path|content|source|target|prompt|key|secret|token/i.test(key))
      .map(([key, item]) => [key, sanitize(item)])
  );
}

export function createDiagnosticsService({
  platform,
  browserNavigator,
  browserPerformance,
  getProjectSummary = () => ({}),
  getInterfaceSummary = () => ({}),
  getLastError = () => null,
  appVersion = ""
}) {
  if (!platform?.getRuntimeStatus) throw new TypeError("DiagnosticsService requires a platform adapter.");

  async function collect() {
    const [runtime, storageEstimate] = await Promise.all([
      platform.getRuntimeStatus(),
      browserNavigator?.storage?.estimate?.().catch?.(() => ({})) || Promise.resolve({})
    ]);
    const navigation = browserPerformance?.getEntriesByType?.("navigation")?.[0] || null;
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: { name: "LoopCAT", version: appVersion || "unknown", buildId: appVersion || "development" },
      runtime: sanitize(runtime),
      capabilities: {
        platform: platform.kind,
        offline: browserNavigator?.onLine === false,
        workers: typeof globalThis.Worker === "function",
        serviceWorker: Boolean(browserNavigator?.serviceWorker)
      },
      storage: {
        usageBytes: finiteNumber(storageEstimate?.usage),
        quotaBytes: finiteNumber(storageEstimate?.quota)
      },
      performance: navigation
        ? {
            domInteractiveMs: finiteNumber(navigation.domInteractive),
            loadCompleteMs: finiteNumber(navigation.loadEventEnd),
            transferBytes: finiteNumber(navigation.transferSize)
          }
        : {},
      projects: sanitize(await getProjectSummary()),
      interface: sanitize(getInterfaceSummary()),
      lastError: sanitize(getLastError())
    };
    return Object.freeze(payload);
  }

  return Object.freeze({
    collect,
    async serialize() {
      return `${JSON.stringify(await collect(), null, 2)}\n`;
    }
  });
}

export { redactText as redactDiagnosticText };
