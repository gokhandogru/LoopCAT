export function createApplicationStorageDurabilityController({ context, storage, formatting, presentation, limits }) {
  if (!context?.get || !context.set) {
    throw new TypeError("ApplicationStorageDurabilityController requires a checked live context boundary.");
  }
  if (!storage?.getApi) {
    throw new TypeError("ApplicationStorageDurabilityController requires a checked storage API boundary.");
  }
  if (!formatting?.fileSize) {
    throw new TypeError("ApplicationStorageDurabilityController requires a checked file-size boundary.");
  }
  if (!presentation?.renderWorkspaceStatus) {
    throw new TypeError("ApplicationStorageDurabilityController requires a checked presentation boundary.");
  }
  if (!Number.isFinite(limits?.lowSpaceBytes) || !Number.isFinite(limits?.highUsageRatio)) {
    throw new TypeError("ApplicationStorageDurabilityController requires checked storage-warning limits.");
  }

  function formatSize(bytes) {
    return formatting.fileSize(bytes) || "0 B";
  }

  function warnings(info = context.get()) {
    if (!info?.checked || !info.supported) return [];
    const result = [];
    const usage = Number(info.usageBytes || 0);
    const quota = Number(info.quotaBytes || 0);
    if (!info.persisted) {
      result.push(
        "Browser storage is best-effort; export project packages or connect a workspace folder for recovery."
      );
    }
    if (quota > 0) {
      const remaining = quota - usage;
      const ratio = usage / quota;
      if (remaining <= limits.lowSpaceBytes || ratio >= limits.highUsageRatio) {
        result.push("Local storage is nearly full; export a backup before importing more files.");
      }
    }
    return result;
  }

  function line(info = context.get()) {
    if (!info?.checked) return "Storage: checking local persistence";
    if (!info.supported) return "Storage: browser-managed local cache";
    const mode = info.persisted ? "persistent" : "best-effort";
    const usage = Number(info.usageBytes || 0);
    const quota = Number(info.quotaBytes || 0);
    const usageText = quota > 0 ? ` - ${formatSize(usage)} of ${formatSize(quota)} used` : "";
    return `Storage: ${mode}${usageText}`;
  }

  async function refresh(options = {}) {
    const request = options.request !== false;
    const storageApi = storage.getApi();
    const next = {
      checked: true,
      supported: Boolean(storageApi),
      persisted: false,
      requested: false,
      usageBytes: 0,
      quotaBytes: 0
    };
    if (!storageApi) {
      context.set(next);
      presentation.renderWorkspaceStatus();
      return next;
    }
    try {
      next.persisted = typeof storageApi.persisted === "function" ? Boolean(await storageApi.persisted()) : false;
    } catch {
      next.persisted = false;
    }
    if (!next.persisted && request && typeof storageApi.persist === "function") {
      next.requested = true;
      try {
        next.persisted = Boolean(await storageApi.persist());
      } catch {
        next.persisted = false;
      }
    }
    try {
      if (typeof storageApi.estimate === "function") {
        const estimate = await storageApi.estimate();
        next.usageBytes = Number.isFinite(Number(estimate?.usage)) ? Number(estimate.usage) : 0;
        next.quotaBytes = Number.isFinite(Number(estimate?.quota)) ? Number(estimate.quota) : 0;
      }
    } catch {
      next.usageBytes = 0;
      next.quotaBytes = 0;
    }
    context.set(next);
    presentation.renderWorkspaceStatus();
    return next;
  }

  return Object.freeze({ formatSize, warnings, line, refresh });
}
