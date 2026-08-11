function formatBytes(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = -1;
  do {
    amount /= 1024;
    unit += 1;
  } while (amount >= 1024 && unit < units.length - 1);
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

function addDefinition(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

export function createDiagnosticsController({
  dialog,
  summaryList,
  preview,
  message,
  exportButton,
  hardwareButton,
  service,
  platform,
  download,
  translate = (value) => value
}) {
  if (!dialog || !summaryList || !preview || !service) {
    throw new TypeError("DiagnosticsController requires its dialog, summary, preview, and service.");
  }

  let latest = null;

  async function refresh() {
    latest = await service.collect();
    const runtime = latest.runtime || {};
    summaryList.replaceChildren();
    addDefinition(summaryList, translate("App version"), latest.app.version);
    addDefinition(summaryList, translate("Platform"), runtime.platform || latest.capabilities.platform || "web");
    addDefinition(
      summaryList,
      translate("Renderer sandbox"),
      runtime.rendererSandbox === false ? "Disabled" : "Enabled"
    );
    addDefinition(
      summaryList,
      translate("Hardware acceleration"),
      runtime.hardwareAccelerationEnabled === false ? "Disabled for troubleshooting" : "Enabled"
    );
    addDefinition(summaryList, translate("Storage used"), formatBytes(latest.storage.usageBytes));
    addDefinition(summaryList, translate("Storage available"), formatBytes(latest.storage.quotaBytes));
    addDefinition(summaryList, translate("Local projects"), String(latest.projects.projectCount ?? 0));
    addDefinition(summaryList, translate("Local segments"), String(latest.projects.segmentCount ?? 0));
    preview.textContent = `${JSON.stringify(latest, null, 2)}\n`;
    if (hardwareButton) {
      hardwareButton.hidden = platform.kind !== "electron";
      hardwareButton.textContent =
        runtime.hardwareAccelerationEnabled === false
          ? translate("Enable hardware acceleration next launch")
          : translate("Disable hardware acceleration next launch");
      hardwareButton.dataset.nextEnabled = String(runtime.hardwareAccelerationEnabled === false);
    }
    return latest;
  }

  async function exportDiagnostics() {
    const text = await service.serialize();
    await download?.(text, "loopcat-diagnostics.json", "application/json");
    if (message) message.textContent = translate("Redacted diagnostics exported locally. Nothing was transmitted.");
  }

  async function toggleHardwareAcceleration() {
    if (!hardwareButton || platform.kind !== "electron") return;
    const enabled = hardwareButton.dataset.nextEnabled === "true";
    const result = await platform.setHardwareAccelerationForNextLaunch(enabled);
    if (message) {
      message.textContent = result?.ok
        ? translate("The change will take effect after LoopCAT restarts.")
        : translate(result?.message || "The local runtime setting could not be changed.");
    }
    await refresh();
  }

  exportButton?.addEventListener("click", () => void exportDiagnostics());
  hardwareButton?.addEventListener("click", () => void toggleHardwareAcceleration());

  return Object.freeze({ exportDiagnostics, refresh, toggleHardwareAcceleration });
}
