// The host is lazy: projects with no Exchange requirements never open the Exchange database.
let library;
function loadLibrary() {
  return (library ||= Promise.all([import("./repository.js"), import("./evaluator.js")]).then(([store, evaluator]) => ({
    repo: store.createPackRepository(),
    evaluator
  })));
}
function refs(project) {
  return Array.isArray(project?.exchangeRequirements) ? project.exchangeRequirements : [];
}
const binding = (project) => (project?.exchangeLocalBinding ? project.id + "@" + project.exchangeLocalBinding : "");
export async function publishProjectPackChange(repo, options, project, operation) {
  if (!project) throw new Error("Open a project first.");
  const previous = binding(project);
  const assertScope = () => {
    const current = options.getProject();
    if (
      current?.id !== project.id ||
      binding(current) !== previous ||
      current.storageVersion !== project.storageVersion ||
      JSON.stringify(refs(current)) !== JSON.stringify(refs(project))
    )
      throw new Error("Project changed.");
  };
  assertScope();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("");
  return await repo.publishBinding(previous, project.id + "@" + token, refs(project), operation, (pins) => {
    assertScope();
    // The core project write checks its storageVersion in the same transaction
    // as the pointer swap. Only this device gets the new binding token.
    return options.saveProject({ ...project, exchangeLocalBinding: token, exchangeRequirements: pins });
  });
}
function pinned(records, project, kind) {
  return records.filter(
    (r) =>
      r.pack.kind === kind &&
      refs(project).some((p) => p.id === r.id && p.digest === r.digest && p.version === r.version)
  );
}
export function createExchangeHost(options) {
  let dialogUi,
    loadUi,
    localGeneration = 0;
  const jobs = new Set();
  let termCache;
  const invalidate = () => {
    localGeneration++;
    termCache?.clear();
    for (const job of jobs) job.abort();
    jobs.clear();
    options.refresh?.();
  };
  async function open() {
    const dialog = options.document.querySelector("#exchangeDialog");
    if (!dialog.open) dialog.showModal();
    try {
      if (!loadUi)
        loadUi = Promise.all([loadLibrary(), import("./library-ui.js")])
          .then(([lib, ui]) => {
            const ctx = {
              ...options,
              ...lib,
              binding,
              changePin: async (project, operation) => {
                await publishProjectPackChange(lib.repo, options, project, operation);
                invalidate();
              },
              invalidate
            };
            dialogUi = ui.createLibraryUI(ctx);
            return dialogUi;
          })
          .catch((error) => {
            loadUi = null;
            throw error;
          });
      await (await loadUi).open();
    } catch (e) {
      options.document.querySelector("#exchangeStatus").textContent = e.message;
    }
  }
  options.document.querySelector("#exchangeBtn")?.addEventListener("click", open);
  options.document
    .querySelector("#exchangeClose")
    ?.addEventListener("click", () => options.document.querySelector("#exchangeDialog").close());
  options.document.querySelector("#exchangeDialog")?.addEventListener("close", () => dialogUi?.close());
  async function terms(query) {
    const project = options.getProject(),
      key = binding(project),
      epoch = localGeneration;
    if (!key || !refs(project).some((r) => r.kind === "terminology")) {
      termCache?.clear();
      return [];
    }
    const { repo, evaluator } = await loadLibrary();
    termCache ||= evaluator.createTermSnapshotCache(repo);
    const snapshot = await termCache.read(key);
    const priorities = new Map(refs(project).map((p) => [p.id, p.priority || 0]));
    const records = pinned(snapshot.records, project, "terminology").sort(
      (a, b) => Number(priorities.get(a.id)) - Number(priorities.get(b.id))
    );
    const hits = evaluator.findPackTerms(records, { source: query.source }, project);
    return (await repo.isCurrent(key, snapshot.generation)) &&
      epoch === localGeneration &&
      !snapshot.signal.aborted &&
      binding(options.getProject()) === key &&
      records.every((r) => repo.isUsable(r))
      ? hits.map((t) => ({ ...t, exchangeReadOnly: true, exchangePriority: priorities.get(t.packId) || 0 }))
      : [];
  }
  async function qa(rows, project = options.getProject()) {
    const requirements = refs(project).filter((r) => r.kind === "qa");
    if (!requirements.length) return { findings: [], runs: [], incomplete: false };
    const rowsCopy = rows.map(({ id, index, documentId, source, target, revision }) => ({
      id,
      index,
      documentId,
      source,
      target,
      revision
    }));
    const runs = requirements.map((r) => ({ ...r, status: "Not evaluated" }));
    const key = binding(project),
      epoch = localGeneration,
      abort = new AbortController();
    const assertCurrent = () => {
      if (options.getProject()?.id !== project.id || binding(options.getProject()) !== key || localGeneration !== epoch)
        throw new DOMException("Exchange scope changed.", "AbortError");
      const byId = new Map(options.getSegments().map((r) => [r.id, r]));
      if (
        rowsCopy.some((r) => {
          const current = byId.get(r.id);
          return (
            !current || current.revision !== r.revision || current.source !== r.source || current.target !== r.target
          );
        })
      )
        throw new DOMException("Segment changed during Exchange QA.", "AbortError");
    };
    jobs.add(abort);
    let findings = [];
    try {
      if (key) {
        const { repo, evaluator } = await loadLibrary(),
          snapshot = await repo.snapshot(key, "qa");
        const active = pinned(snapshot.records, project, "qa").filter((r) =>
          evaluator.matchPackLanguages(r.pack, project)
        );
        if (active.length) {
          const runner = await import("./qa-runner.js");
          findings = await runner.evaluateRows(
            active.map(({ pack, id, digest, version }) => ({ pack, id, digest, version })),
            rowsCopy,
            { sourceLang: project.sourceLang, targetLang: project.targetLang },
            AbortSignal.any([abort.signal, snapshot.signal])
          );
          assertCurrent();
          if (!(await repo.isCurrent(key, snapshot.generation)))
            throw new DOMException("Pack changed during QA.", "AbortError");
          for (const run of runs) if (active.some((a) => a.digest === run.digest)) run.status = "Evaluated";
        }
      }
      assertCurrent();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      findings = [];
      for (const r of runs) r.status = "Not evaluated";
    } finally {
      jobs.delete(abort);
    }
    return { findings, runs, incomplete: runs.some((r) => r.required && r.status !== "Evaluated") };
  }
  return { open, terms, qa, binding };
}
