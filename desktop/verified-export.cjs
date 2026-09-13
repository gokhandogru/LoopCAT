const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

function createVerifiedExports({ dialog, windowFor }) {
  const sessions = new Map();
  const choosing = new Set();
  async function hashFile(file) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
  }
  function owned(owner, id) {
    const session = sessions.get(id);
    if (!session || session.owner !== owner) throw new Error("Export session is unavailable.");
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      void abort(owner, id);
    }, 120000);
    session.timer.unref?.();
    return session;
  }
  async function begin(owner, { filename }) {
    if (
      typeof filename !== "string" ||
      filename.length > 200 ||
      path.basename(filename) !== filename ||
      /[\\/:\x00-\x1f]/.test(filename)
    )
      throw new Error("Invalid export filename.");
    if (choosing.has(owner) || [...sessions.values()].some((session) => session.owner === owner))
      throw new Error("Finish the current export first.");
    choosing.add(owner);
    try {
      const picked = await dialog.showSaveDialog(windowFor(owner), {
        title: "Save and verify LoopCAT export",
        defaultPath: filename
      });
      if (picked.canceled || !picked.filePath) return { canceled: true };
      const id = randomUUID();
      const temporary = `${picked.filePath}.${id}.pending`;
      const handle = await fs.open(temporary, "wx", 0o600);
      sessions.set(id, {
        owner,
        temporary,
        destination: picked.filePath,
        handle,
        hash: createHash("sha256"),
        bytes: 0,
        queuedBytes: 0,
        tail: Promise.resolve(),
        timer: null
      });
      owned(owner, id);
      return { id, canceled: false };
    } finally {
      choosing.delete(owner);
    }
  }
  function write(owner, { id, bytes }) {
    const session = owned(owner, id);
    if (session.finishing) throw new Error("Export is already being verified.");
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024)
      throw new Error("Export chunk exceeds its size limit.");
    if (session.queuedBytes + bytes.byteLength > 4 * 1024 * 1024)
      throw new Error("Export write queue is full; await each chunk before sending more.");
    session.queuedBytes += bytes.byteLength;
    const snapshot = Buffer.from(bytes);
    const operation = session.tail
      .then(async () => {
        session.bytes += snapshot.length;
        if (session.bytes > 32 * 1024 * 1024 * 1024) throw new Error("Export exceeds its size limit.");
        await session.handle.writeFile(snapshot);
        session.hash.update(snapshot);
      })
      .finally(() => {
        session.queuedBytes -= snapshot.length;
      });
    session.tail = operation;
    return operation;
  }
  async function finish(owner, { id }) {
    const session = owned(owner, id);
    if (session.finishing) throw new Error("Export verification is already running.");
    session.finishing = true;
    clearTimeout(session.timer);
    try {
      await session.tail;
      await session.handle.sync();
      await session.handle.close();
      const expected = session.hash.digest("hex");
      if ((await hashFile(session.temporary)) !== expected) throw new Error("Export readback verification failed.");
      // Keep the overwritten file recoverable. The replacement is promoted only
      // after its temporary file has been fully written and checked.
      try {
        await fs.copyFile(session.destination, `${session.destination}.${id}.previous`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await fs.rename(session.temporary, session.destination);
      if ((await hashFile(session.destination)) !== expected)
        throw new Error("Final export verification failed; the previous file was retained.");
      return { written: true, verified: true, digest: expected, bytes: session.bytes };
    } finally {
      clearTimeout(session.timer);
      sessions.delete(id);
      await session.handle.close().catch(() => {});
    }
  }
  async function abort(owner, id) {
    const session = sessions.get(id);
    if (!session || session.owner !== owner) return;
    if (session.finishing) return; // Never interrupt a verified replacement between readback and promotion.
    sessions.delete(id);
    clearTimeout(session.timer);
    await session.tail.catch(() => {});
    await session.handle.close().catch(() => {});
    await fs.unlink(session.temporary).catch(() => {});
  }
  return Object.freeze({ begin, write, finish, abort });
}
module.exports = { createVerifiedExports };
