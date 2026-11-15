// Operator CLI. The private signing key is created/held by the operator, never bundled.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decodePack } from "../src/features/exchange/pack-format.js";
import {
  catalogHash,
  verifyCatalog,
  verifyCatalogArtifact,
  CATALOG_LIMIT,
  PACK_LIMIT
} from "../src/features/exchange/catalog.js";

async function bounded(file, limit) {
  if ((await stat(file)).size > limit) throw new Error("Input file exceeds size limit.");
  return readFile(file);
}
export async function runCatalogCli([mode, ...argv]) {
  if (mode === "verify" && argv.length === 2) {
    const [snapshot, trust] = argv;
    const verified = await verifyCatalog(
      (await bounded(snapshot, CATALOG_LIMIT)).toString(),
      JSON.parse((await bounded(trust, 8192)).toString())
    );
    return `Verified ${verified.catalogId} revision ${verified.checkpoint.sequence}: ${verified.releases.length} release(s).`;
  }
  if (mode !== "sign" || argv.length !== 4)
    throw new Error(
      "Usage: node scripts/exchange-catalog.mjs sign <unsigned-index.json> <private-key.pem> <release-dir-with-packs/> <new-output-dir-existing> | verify <index.json> <key.json>"
    );
  const [source, keyPath, releaseDir, outDir] = argv;
  const payload = await bounded(source, 720 * 1024),
    p = JSON.parse(payload.toString());
  const privateKey = createPrivateKey(await bounded(keyPath, 32768));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Catalog requires an Ed25519 key.");
  if (
    path.resolve(keyPath).startsWith(path.resolve(outDir) + path.sep) ||
    path.resolve(keyPath).startsWith(path.resolve(releaseDir) + path.sep)
  )
    throw new Error("Keep the signing key outside published directories.");
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const trust = { catalogId: p.catalogId, publicKey: Buffer.from(jwk.x, "base64url").toString("base64") };
  const envelope = {
    format: "loopcat-signed-index-v1",
    payload: payload.toString("base64"),
    signature: sign(null, payload, privateKey).toString("base64")
  };
  const text = JSON.stringify(envelope),
    verified = await verifyCatalog(text, trust);
  for (const e of verified.releases) {
    if (verified.checkpoint.revoked.includes(e.sha256)) continue;
    const artifact = await bounded(path.join(releaseDir, "packs", `${e.sha256}.loopcat-pack.zip`), PACK_LIMIT);
    const { pack } = await decodePack(await verifyCatalogArtifact(new Blob([artifact]), e, verified));
    if (pack.id !== e.id || pack.version !== e.version || pack.license !== e.rights)
      throw new Error("Catalog ID, version or rights did not match pack metadata.");
  }
  await writeFile(path.join(outDir, "index.json"), text, { flag: "wx" });
  await writeFile(path.join(outDir, "catalog-key.json"), JSON.stringify(trust, null, 2), { flag: "wx" });
  return `Signed revision ${p.sequence}. Distribute the trust fingerprint independently: ${await catalogHash(Buffer.from(trust.publicKey, "base64"))}`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runCatalogCli(process.argv.slice(2)).then(console.log, (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
