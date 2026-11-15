// The desktop host validates the same narrow descriptor as the renderer route.
// No renderer-supplied URL or BrowserWindow option reaches the native host.
function resourceEditorRoute(request) {
  if (!request || !["tm", "tb"].includes(request.type)) throw new TypeError("Invalid resource editor request.");
  const identifier = (value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value))
      throw new TypeError("Invalid resource editor identifier.");
    return encodeURIComponent(value);
  };
  return `#resource/${request.type}/${identifier(request.resourceId)}${request.entryId === undefined ? "" : `?entry=${identifier(request.entryId)}`}`;
}

function createResourceEditorWindows({
  createWindow,
  focusWindow = (window) => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}) {
  const windows = new Map();
  function open(request) {
    const hash = resourceEditorRoute(request);
    const key = `${request.type}:${request.resourceId}`;
    const existing = windows.get(key);
    if (existing && !existing.isDestroyed()) {
      focusWindow(existing);
      if (request.entryId !== undefined) {
        existing.webContents.send("loopcat:resource-editor-select", {
          resourceType: request.type,
          resourceId: request.resourceId,
          entryId: request.entryId
        });
      }
      // Never navigate an existing editor: its unsaved draft belongs to that window.
      return { opened: true, mode: "window" };
    }
    const window = createWindow(hash, request.type);
    windows.set(key, window);
    window.once("closed", () => {
      if (windows.get(key) === window) windows.delete(key);
    });
    return { opened: true, mode: "window" };
  }
  return Object.freeze({ open });
}

function createQuitCoordinator({ windows, closeWindow, quit, warn = console.warn }) {
  let permitted = false;
  let pending = null;
  function beforeQuit(event) {
    if (permitted) return;
    event.preventDefault();
    if (pending) return;
    pending = (async () => {
      // Each editor gets its own Save/Discard/Cancel decision before the next closes.
      while (windows().length) {
        if (!(await closeWindow(windows()[0]))) return;
      }
      permitted = true;
      quit();
    })()
      .catch((error) => warn("LoopCAT could not finish closing its windows.", error))
      .finally(() => {
        pending = null;
      });
  }
  return Object.freeze({ beforeQuit });
}

module.exports = { resourceEditorRoute, createResourceEditorWindows, createQuitCoordinator };
