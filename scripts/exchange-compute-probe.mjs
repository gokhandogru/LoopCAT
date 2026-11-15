import { readFile } from "node:fs/promises";
import { turkishGuest } from "./exchange-compute-turkish.mjs";
import { runCompute } from "./exchange-compute-runner.mjs";
import { containsForm } from "../src/features/exchange/evaluator.js";
const rows = JSON.parse(
  await readFile(new URL("../tests/fixtures/exchange-catalog/turkish-heldout.json", import.meta.url), "utf8")
);
const findings = await runCompute(
  turkishGuest(),
  rows.map(([lemma, token, soften]) => ({ lemma, token, soften }))
);
function score(predict) {
  let truePositive = 0,
    falsePositive = 0,
    falseNegative = 0,
    trueNegative = 0;
  rows.forEach((r, i) => {
    const p = predict(r, i);
    if (r[3]) p ? truePositive++ : falseNegative++;
    else p ? falsePositive++ : trueNegative++;
  });
  return { truePositive, falsePositive, falseNegative, trueNegative };
}
console.log(
  JSON.stringify(
    {
      scope: "developer Node/Wasm lab; hand-selected evaluation fixture, not a representative corpus",
      rows: rows.length,
      declarativeLemma: score(([l, w]) => containsForm(w, l, "tr")),
      prefix: score(([l, w]) => w.startsWith(l)),
      guest: score((_r, i) => findings[i].length === 1)
    },
    null,
    2
  )
);
