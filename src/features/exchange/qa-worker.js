import { runPackQa } from "./evaluator.js";

// This bundled worker receives data only. It never executes pack-provided code.
let records = [],
  context = {};
self.onmessage = ({ data }) => {
  try {
    if (data.records) {
      records = data.records;
      context = data.context;
    }
    self.postMessage({ findings: runPackQa(records, data.rows, { ...context, remaining: data.remaining }) });
  } catch (error) {
    self.postMessage({ error: String(error.message || error) });
  }
};
