const ROLE_LABELS = Object.freeze({
  close: "Close",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select all",
  reload: "Reload",
  togglefullscreen: "Toggle full screen",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Actual size",
  minimize: "Minimize",
  zoom: "Zoom window"
});
const UI_MESSAGES = Object.freeze([
  ...Object.values(ROLE_LABELS),
  "File",
  "Edit",
  "View",
  "Window",
  "No spelling suggestions",
  'Add "{word}" to dictionary',
  "Output is not fully saved",
  "LoopCAT could not confirm that local saving finished.",
  "Retry saving, export the current targets, or explicitly exit. Cancel keeps the editor open.",
  "Retry",
  "Emergency Export",
  "Exit without saving",
  "Cancel",
  "Save emergency bilingual output",
  "Emergency export verified. The editor remains open.",
  "Save and verify LoopCAT export"
]);

function createNativeLocalization(catalogs = {}) {
  let locale = "en-US";
  function setLocale(value) {
    const requested = typeof value === "string" ? value : "";
    locale =
      Object.keys(catalogs).find((key) => key.toLowerCase() === requested.toLowerCase()) ||
      Object.keys(catalogs).find((key) => key.split("-")[0] === requested.toLowerCase().split("-")[0]) ||
      "en-US";
    return locale;
  }
  function translate(message, values = {}) {
    const text = catalogs[locale]?.[message] || message;
    return text.replace(/\{([\w.-]+)\}/g, (token, name) => (values[name] == null ? token : String(values[name])));
  }
  function menu(items) {
    return items.map((item) => ({
      ...item,
      ...(item.label || ROLE_LABELS[item.role] ? { label: translate(item.label || ROLE_LABELS[item.role]) } : {}),
      ...(Array.isArray(item.submenu) ? { submenu: menu(item.submenu) } : {})
    }));
  }
  return Object.freeze({ setLocale, translate, menu });
}
module.exports = { createNativeLocalization, UI_MESSAGES };
