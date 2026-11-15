// Offline author/maintainer CLI: exactly the same codec and fixture validator as the app.
import fs from "node:fs/promises";
import path from "node:path";
import { encodePack, decodePack, PACK_LIMITS } from "../src/features/exchange/pack-format.js";
import { EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK } from "../src/features/exchange/examples.js";
import { BLIND_LAB_SAMPLE } from "../src/features/exchange/workflow-packs.js";

async function boundedFile(file, limit) {
  const fd = await fs.open(file, "r");
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.size > limit) throw Error("Input exceeds the file limit.");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await fd.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw Error("Input was truncated.");
      offset += bytesRead;
    }
    return bytes;
  } finally {
    await fd.close();
  }
}
async function output(pack, filename) {
  const blob = await encodePack(pack),
    bytes = Buffer.from(await blob.arrayBuffer()),
    decoded = await decodePack(blob);
  try {
    await fs.writeFile(filename, bytes, { flag: "wx" });
  } catch (err) {
    if (err.code !== "EEXIST" || !(await boundedFile(filename, 8 * 1024 * 1024)).equals(bytes)) throw err;
  }
  console.log(decoded.digest + "  " + filename);
}
async function main([cmd, input, dest]) {
  if (cmd === "examples" && input && !dest) {
    await fs.mkdir(input, { recursive: true });
    for (const pack of [EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK, BLIND_LAB_SAMPLE])
      await output(pack, path.join(input, pack.id + "-" + pack.version + ".loopcat-pack.zip"));
    return;
  }
  if (cmd === "build" && input && dest) {
    await output(JSON.parse((await boundedFile(input, PACK_LIMITS.expanded)).toString("utf8")), dest);
    return;
  }
  if (cmd === "check" && input && !dest) {
    const { pack, digest } = await decodePack(new Blob([await boundedFile(input, 8 * 1024 * 1024)]));
    console.log(
      JSON.stringify({
        id: pack.id,
        version: pack.version,
        kind: pack.kind,
        entries: pack.entries.length,
        sha256: digest
      })
    );
    return;
  }
  throw Error(
    "Usage: node scripts/exchange-packs.mjs examples DIRECTORY | build PACK.json OUTPUT.loopcat-pack.zip | check FILE.loopcat-pack.zip"
  );
}
main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
