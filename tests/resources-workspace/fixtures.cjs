async function seedResources() {
  const progress = window.__resourceFixtureProgress || (() => {});
  const { storage, project, tm, termbase } = window.CatHan;
  progress("create TM");
  const memory = await project.createResource({
    name: "Resource workflow TM",
    type: "tm",
    sourceLang: "en",
    targetLang: "tr"
  });
  progress("create TB");
  const glossary = await project.createResource({
    name: "Resource workflow TB",
    type: "termbase",
    sourceLang: "en",
    targetLang: "tr"
  });
  progress("import TM");
  await tm.importTmEntries(
    Array.from({ length: 240 }, (_, index) => ({
      id: `fixture-tm-${index}`,
      resourceId: memory.id,
      tmName: memory.name,
      sourceLang: "en",
      targetLang: "tr",
      source: `Source ${String(index).padStart(3, "0")}`,
      target: index === 239 ? "Beyond first hundred sentinel" : `Hedef ${index}`,
      projectName: index % 2 ? "Medical project" : "General project",
      domain: index % 2 ? "Medical" : "General"
    }))
  );
  progress("import TB");
  await termbase.importTerms(
    [
      {
        id: "fixture-term-0",
        sourceTerm: "friend",
        targetTerm: "arkadaş",
        status: "preferred",
        domain: "General",
        notes: "A colleague"
      },
      {
        id: "fixture-term-1",
        sourceTerm: "friend",
        targetTerm: "dost",
        status: "admitted",
        domain: "General",
        notes: "Literary"
      },
      {
        id: "fixture-term-2",
        sourceTerm: "friend",
        targetTerm: "ahbap",
        status: "forbidden",
        isForbidden: true,
        domain: "General"
      },
      { id: "fixture-term-3", sourceTerm: "medicine", targetTerm: "ilaç", status: "preferred", domain: "Medical" }
    ].map((entry) => ({
      ...entry,
      resourceId: glossary.id,
      termBaseName: glossary.name,
      sourceLang: "en",
      targetLang: "tr"
    }))
  );
  progress("flush fixture mutations");
  await storage.flushMutations();
  progress("fixture ready");
  return { tm: memory.id, tb: glossary.id };
}

async function seedLargeResource(count) {
  const { project, storage } = window.CatHan;
  const resource = await project.createResource({
    name: "Synthetic large TM",
    type: "tm",
    sourceLang: "en",
    targetLang: "tr"
  });
  await storage.get("appMeta", "committed-generation");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("cathan-local-cat");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // Fixture-only direct insertion avoids measuring import/journal creation rather
  // than the editor's actual IndexedDB and query-worker read path.
  for (let start = 0; start < count; start += 10000) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(["tmEntries"], "readwrite");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      const store = transaction.objectStore("tmEntries");
      for (let index = start; index < Math.min(start + 10000, count); index++) {
        store.put({
          id: `large-${index}`,
          resourceId: resource.id,
          tmName: resource.name,
          sourceLang: "en",
          targetLang: "tr",
          languagePair: "en::tr",
          source: `Large source ${String(index).padStart(6, "0")}`,
          target: `Büyük hedef ${index}`,
          updatedAt: "2026-01-01T00:00:00.000Z",
          storageVersion: 1
        });
      }
    });
  }
  db.close();
  return resource.id;
}

async function measureLargeResource(resourceId, count) {
  const url = window.CatHan.appRuntime.safeHtml.trustedScriptUrl("./resource-query-worker.js");
  const worker = new Worker(url);
  let id = 0;
  const pending = new Map();
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error.message));
    else job.resolve(data.result);
  };
  worker.onerror = (event) => {
    for (const job of pending.values()) job.reject(new Error(event.message || "Resource query worker failed"));
    pending.clear();
  };
  const query = (input) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ type: "query", id: requestId, input: { type: "tm", resourceId, limit: 100, ...input } });
    });
  let last = performance.now();
  let maximumTimerGap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumTimerGap = Math.max(maximumTimerGap, now - last);
    last = now;
  }, 16);
  try {
    const coldStart = performance.now();
    const first = await query({});
    const coldMs = performance.now() - coldStart;
    if (first.total !== count || first.rows.length !== 100 || !first.nextCursor)
      throw new Error("Large-resource first page is incomplete");
    const warmStart = performance.now();
    const second = await query({ cursor: first.nextCursor });
    const warmMs = performance.now() - warmStart;
    if (second.rows[0].id === first.rows[0].id || second.rows.length !== 100)
      throw new Error("Paging repeated the first page");
    const searchStart = performance.now();
    const final = await query({ query: { text: `Büyük hedef ${count - 1}`, field: "target", mode: "exact" } });
    const searchMs = performance.now() - searchStart;
    if (final.total !== 1 || final.rows[0].id !== `large-${count - 1}`)
      throw new Error("Search did not cover the full resource");
    // Broad cross-runner budgets catch main-thread loading or accidental page scans.
    if (coldMs > (count > 100000 ? 60000 : 8000) || warmMs > 1500 || maximumTimerGap > 500)
      throw new Error(`Resource performance budget exceeded: ${JSON.stringify({ coldMs, warmMs, maximumTimerGap })}`);
    return {
      count,
      coldTargetMs: 2000,
      coldTargetMet: coldMs < 2000,
      coldMs: Math.round(coldMs),
      warmMs: Math.round(warmMs),
      searchMs: Math.round(searchMs),
      maximumTimerGap: Math.round(maximumTimerGap)
    };
  } finally {
    clearInterval(timer);
    worker.terminate();
  }
}

module.exports = { seedResources, seedLargeResource, measureLargeResource };
