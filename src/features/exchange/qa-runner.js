import { asTrustedScriptUrl } from "../../security/safe-html.js";
import { runPackQa, MAX_QA_FINDINGS } from "./evaluator.js";

// One dedicated queue per manual run. Never occupy the interactive TM worker.
export async function evaluateRows(records, rows, context, signal) {
  signal?.throwIfAborted();
  if (!records.length || !rows.length) return [];
  let worker;
  try {
    worker =
      location.protocol === "file:" && globalThis.CatHan?.createFileWorker
        ? globalThis.CatHan.createFileWorker("./exchange-worker.js")
        : new Worker(asTrustedScriptUrl("./exchange-worker.js"));
  } catch {
    worker = null;
  }
  const results = [];
  const rules = records.map((r) => {
    const pack = r.pack || r;
    return {
      digest: r.digest,
      pack: {
        kind: pack.kind,
        id: pack.id,
        version: pack.version,
        languages: pack.languages,
        entries: (pack.entries || []).map(({ id, op, source, targets, caseSensitive, severity, message }) => ({
          id,
          op,
          source,
          targets,
          caseSensitive,
          severity,
          message
        }))
      }
    };
  });
  try {
    const count = rules.reduce((n, r) => n + r.pack.entries.length, 0);
    if (!worker && (rows.length > 1000 || rows.length * count > 30000))
      throw Error("A worker is required for large Exchange QA runs.");
    const batchSize = worker ? 128 : Math.max(1, Math.min(32, Math.floor(500 / Math.max(1, count))));
    for (let start = 0; start < rows.length; start += batchSize) {
      signal?.throwIfAborted();
      const batch = rows
        .slice(start, start + batchSize)
        .map(({ id, source, target, index, documentId }) => ({ id, source, target, index, documentId }));
      const labels = new Map(batch.map((r, i) => [r.id, String(start + i + 1)]));
      if (batch.some((r) => String(r.source || "").length + String(r.target || "").length > 128 * 1024))
        throw Error("Exchange QA segment exceeds the text limit.");
      let findings;
      if (!worker) {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        signal?.throwIfAborted();
        findings = runPackQa(rules, batch, { ...context, remaining: MAX_QA_FINDINGS - results.length });
      } else {
        findings = await new Promise((resolve, reject) => {
          let timer;
          function done(fn, value) {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            fn(value);
          }
          function abort() {
            done(reject, new DOMException("Exchange check canceled", "AbortError"));
          }
          timer = setTimeout(() => done(reject, new Error("Exchange QA batch timed out.")), 15000);
          signal?.addEventListener("abort", abort, { once: true });
          worker.onmessage = ({ data }) =>
            data.error ? done(reject, new Error(data.error)) : done(resolve, data.findings);
          worker.onerror = () => done(reject, new Error("Exchange QA worker failed."));
          try {
            worker.postMessage({
              rows: batch,
              remaining: MAX_QA_FINDINGS - results.length,
              ...(start === 0 ? { records: rules, context } : {})
            });
          } catch (e) {
            done(reject, e);
          }
        });
      }
      signal?.throwIfAborted();
      for (const f of findings) results.push({ ...f, label: labels.get(f.segmentId) || f.label });
    }
    signal?.throwIfAborted();
    return results;
  } finally {
    worker?.terminate();
  }
}
