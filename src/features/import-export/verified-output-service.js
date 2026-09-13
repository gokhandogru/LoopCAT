import { readArchive } from "./archive-worker-client.js";

export function createVerifiedOutputService(window) {
  async function choose(filename, mime) {
    const desktop = window.LoopCATDesktop;
    if (desktop?.beginExport) {
      const session = await desktop.beginExport({ filename });
      if (session.canceled) throw new DOMException("Export canceled", "AbortError");
      let result;
      const writable = new WritableStream({
        async write(chunk) {
          const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          for (let offset = 0; offset < bytes.length; offset += 1024 * 1024)
            await desktop.writeExportChunk({ id: session.id, bytes: bytes.slice(offset, offset + 1024 * 1024) });
        },
        async close() {
          result = await desktop.finishExport({ id: session.id });
        },
        async abort() {
          await desktop.abortExport({ id: session.id });
        }
      });
      return { writable, verify: () => result, abort: () => desktop.abortExport({ id: session.id }) };
    }
    if (!window.showSaveFilePicker) return null;
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "LoopCAT export", accept: { [mime]: [filename.endsWith(".zip") ? ".zip" : ".json"] } }]
    });
    const writable = await handle.createWritable();
    return {
      writable,
      abort: () => writable.abort(),
      async verify(expectedDigest) {
        const checked = await readArchive(await handle.getFile(), { verifyOnly: true });
        if (checked.digest !== expectedDigest) throw new Error("Export readback differs from the written archive.");
        return { written: true, verified: true, digest: checked.digest };
      }
    };
  }
  return Object.freeze({ choose });
}
