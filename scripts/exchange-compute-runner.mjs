import { Worker } from "node:worker_threads";
import { COMPUTE_MAX_BYTES } from "../src/features/exchange/compute-contract.js";

/** Developer-lab only. This runner never loads guest JS or joins the application graph. */
export function runCompute(bytes, items, { signal, deadlineMs = 1500 } = {}) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > COMPUTE_MAX_BYTES ||
    !Array.isArray(items) ||
    !items.length ||
    items.length > 64 ||
    items.some(
      (i) =>
        !i ||
        typeof i.token !== "string" ||
        typeof i.lemma !== "string" ||
        i.token.length > 96 ||
        i.lemma.length > 96 ||
        ("soften" in i && typeof i.soften !== "boolean")
    )
  )
    return Promise.reject(new Error("Compute input exceeds its limits."));
  if (signal?.aborted) return Promise.reject(new Error("Compute permission revoked."));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./exchange-compute-worker.mjs", import.meta.url), {
      resourceLimits: { maxOldGenerationSizeMb: 24, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
      execArgv: []
    });
    let settled = false;
    const stop = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      void worker.terminate().then(() => (error ? reject(error) : resolve(result)), reject);
    };
    const cancel = () => stop(new Error("Compute permission revoked."));
    const timer = setTimeout(
      () => stop(new Error("Compute deadline exceeded.")),
      Math.min(3000, Math.max(1, deadlineMs || 1))
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", (m) => stop(m.error ? new Error(m.error) : null, m.results));
    worker.once("error", (e) => stop(e));
    worker.once("exit", () => {
      if (!settled) stop(new Error("Compute worker exited."));
    });
    worker.postMessage({
      bytes,
      items: items.map((i) => ({ lemma: i.lemma, token: i.token, soften: i.soften === true }))
    });
  });
}
