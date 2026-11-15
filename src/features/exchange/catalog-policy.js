// Device-local trust state. Projects cannot supply/restore a catalog checkpoint.
export const checkpointKey = (id) => `loopcat.exchange.catalog.v1:${id}`;
export function assertRecordAllowed(record, storage = undefined) {
  const origin = record?.catalogOrigin;
  if (!origin) return true;
  const raw = (storage || globalThis.localStorage)?.getItem(checkpointKey(origin.catalogId));
  const state = raw ? JSON.parse(raw) : null;
  if (
    !state ||
    state.fingerprint !== origin.fingerprint ||
    state.versions?.[`${record.id}@${record.version}`] !== record.digest ||
    !Array.isArray(state.revoked)
  )
    throw new Error("Trusted catalog history unavailable. Import a current signed snapshot.");
  if (state.revoked.includes(record.digest)) throw new Error("This exact pack was withdrawn by its catalog signer.");
  // Already installed packs remain available offline without a live freshness check.
  return true;
}
export function assertCatalogInstall(record, info, storage = undefined, now = Date.now()) {
  if (!info?.catalogId) return undefined;
  const catalogOrigin = { catalogId: info.catalogId, fingerprint: info.fingerprint };
  if (!Number.isFinite(info.expires) || info.expires <= now)
    throw new Error("Catalog preview expired. Reopen its signed snapshot.");
  assertRecordAllowed({ ...record, catalogOrigin }, storage);
  return catalogOrigin;
}
export async function enforceCatalogAdvisories(repo, verified) {
  const withdrawn = new Set(verified.checkpoint.revoked);
  if (!withdrawn.size) return 0;
  const rows = await (repo.describe ? repo.describe() : repo.list());
  let count = 0;
  for (const r of rows) {
    if (
      r.catalogOrigin?.catalogId !== verified.catalogId ||
      r.catalogOrigin?.fingerprint !== verified.checkpoint.fingerprint ||
      !withdrawn.has(r.digest)
    )
      continue;
    repo.notifyWithdrawal?.(r);
    // Disable active slots and cancel jobs, preserve bytes for inspection and
    // manual removal. snapshot() independently denies the artifact if interrupted.
    for (const project of await repo.affectedProjects(r.id, r.version)) {
      // Check the current exact version; do not disable a newer safe version.
      const binding = (await repo.requirements(project)).find((pin) => pin.id === r.id);
      if (binding?.digest === r.digest) await repo.disable(project, r.id, r.digest);
    }
    count++;
  }
  return count;
}
