import { parentPort } from "node:worker_threads";
import { checkComputeModule, encodeComputeInput, computeFinding } from "../src/features/exchange/compute-contract.js";
parentPort.once("message", async ({ bytes, items }) => {
  try {
    const safe = checkComputeModule(bytes);
    const results = [];
    const module = await WebAssembly.compile(safe);
    for (const item of items) {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
      const guest = await WebAssembly.instantiate(module, { host: { memory } });
      const args = encodeComputeInput(memory, item);
      results.push(computeFinding(item.token, guest.exports.match(...args)));
    }
    parentPort.postMessage({ results });
  } catch (e) {
    parentPort.postMessage({ error: e.message });
  }
});
