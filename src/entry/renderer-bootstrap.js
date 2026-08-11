(() => {
  const FILE_ENTRY = "./app-file.js";
  const MODULE_ENTRY = "./app.js";
  const entry = window.location.protocol === "file:" ? FILE_ENTRY : MODULE_ENTRY;
  const allowedEntries = new Set([FILE_ENTRY, MODULE_ENTRY]);
  const policy = globalThis.trustedTypes?.createPolicy?.("loopcat-bootstrap", {
    createScriptURL(value) {
      const candidate = String(value || "");
      if (!allowedEntries.has(candidate)) throw new TypeError("LoopCAT renderer entry is not allowlisted.");
      return candidate;
    }
  });
  const script = document.createElement("script");
  if (entry === MODULE_ENTRY) script.type = "module";
  script.src = policy ? policy.createScriptURL(entry) : entry;
  script.addEventListener("error", () => {
    const status = document.querySelector("#saveStatus");
    if (!status) return;
    status.textContent = "LoopCAT could not start. Re-extract the complete web package and reload.";
    status.className = "save-status dirty";
    status.setAttribute("role", "alert");
  });
  document.head.append(script);
})();
