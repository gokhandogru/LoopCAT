import sources from "loopcat:file-worker-sources";

// Only the direct-file entry embeds worker code. No network fetch, eval, or
// arbitrary script URL is accepted; desktop/HTTP keep their external workers.
const urls = new Map();
const policy = globalThis.trustedTypes?.createPolicy("loopcat-file-workers", {
  createScriptURL(value) {
    if (![...urls.values()].includes(value)) throw new TypeError("Unrecognized bundled worker URL.");
    return value;
  }
});
window.CatHan = window.CatHan || {};
window.CatHan.createFileWorker = (name) => {
  if (!Object.hasOwn(sources, name)) throw new TypeError("Unrecognized bundled worker.");
  if (!urls.has(name)) urls.set(name, URL.createObjectURL(new Blob([sources[name]], { type: "text/javascript" })));
  const url = urls.get(name);
  return new Worker(policy ? policy.createScriptURL(url) : url);
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
});
