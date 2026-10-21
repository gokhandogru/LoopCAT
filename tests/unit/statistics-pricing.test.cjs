const assert = require("node:assert/strict");
const test = require("node:test");

const loadPricing = () => import("../../src/features/statistics/statistics-pricing.js");
const fixture = () => ({
  id: "analysis-original",
  options: { weights: { exact: 15 }, remaining: true, customSetting: "retained" },
  buckets: [
    { band: "new", words: 4 },
    { band: "repetition", words: 76 }
  ],
  estimatedBuckets: [
    { band: "new", words: 2 },
    { band: "repetition", words: 78 }
  ],
  weightedWords: 80,
  estimatedWeightedWords: 80,
  complete: false,
  countingComplete: true,
  searchComplete: false,
  limitations: ["Some searches were bounded."],
  rows: [{ id: "row", words: 80 }],
  customEvidence: { fingerprint: "unchanged" }
});

test("pricing applies payable percentages to the existing analysis and internal reuse estimate", async () => {
  const { withStatisticsPricing } = await loadPricing();
  const updated = withStatisticsPricing(fixture(), { rate: 0.1, currency: "EUR", weights: { repetition: 10 } });
  assert.ok(Math.abs(updated.weightedWords - 11.6) < 1e-12);
  assert.ok(Math.abs(updated.weightedWords * updated.options.rate - 1.16) < 1e-12);
  assert.equal(updated.estimatedWeightedWords, 9.8);
  assert.equal(updated.options.weighted, true);
  assert.equal(updated.options.currency, "EUR");
  assert.equal(updated.options.rateProvided, true);
  assert.equal(updated.options.weights.exact, 15);
  assert.equal(updated.options.weights.new, 100);
});

test("pricing preserves immutable source evidence, incomplete flags and unknown options", async () => {
  const { withStatisticsPricing } = await loadPricing();
  const original = fixture();
  const before = structuredClone(original);
  Object.freeze(original.options.weights);
  Object.freeze(original.options);
  original.buckets.forEach(Object.freeze);
  Object.freeze(original.buckets);
  Object.freeze(original);
  const pricing = Object.freeze({ rate: 0.1, weights: Object.freeze({ repetition: 10 }) });
  const updated = withStatisticsPricing(original, pricing, "estimate-updated");
  assert.deepEqual(original, before);
  assert.notEqual(updated, original);
  assert.notEqual(updated.options, original.options);
  assert.notEqual(updated.options.weights, original.options.weights);
  assert.equal(updated.id, "estimate-updated");
  assert.equal(original.id, "analysis-original");
  assert.equal(updated.options.remaining, true);
  assert.equal(updated.options.customSetting, "retained");
  assert.equal(updated.complete, false);
  assert.equal(updated.countingComplete, true);
  assert.equal(updated.searchComplete, false);
  for (const key of ["buckets", "estimatedBuckets", "rows", "limitations", "customEvidence"]) {
    assert.equal(updated[key], original[key]);
  }
});

test("fractional weights and the 0% and 100% boundaries do not round word quantities", async () => {
  const { withStatisticsPricing } = await loadPricing();
  const original = fixture();
  for (const [weight, expected] of [
    [0, 4],
    [12.5, 13.5],
    [100, 80]
  ]) {
    const updated = withStatisticsPricing(original, { rate: 0, weights: { repetition: weight } });
    assert.equal(updated.weightedWords, expected);
    assert.equal(updated.options.rate, 0);
    assert.equal(updated.options.rateProvided, true);
  }
  assert.equal(withStatisticsPricing(original, { rate: 0, weights: { repetition: 0, new: 0 } }).weightedWords, 0);
});

test("unset rates are distinct from a legitimate zero price and persist across weight edits", async () => {
  const { withStatisticsPricing } = await loadPricing();
  const unset = withStatisticsPricing(fixture(), {});
  assert.equal(unset.options.rate, 0);
  assert.equal(unset.options.rateProvided, false);
  assert.equal(unset.id, "analysis-original");
  const edited = withStatisticsPricing(unset, { weights: { repetition: 20 } });
  assert.equal(edited.options.rateProvided, false);
  const zero = withStatisticsPricing(edited, { rate: 0 });
  assert.equal(zero.options.rateProvided, true);
  const cleared = withStatisticsPricing(zero, { rate: 0, rateProvided: false });
  assert.equal(cleared.options.rateProvided, false);
  const existing = withStatisticsPricing({ ...fixture(), options: { rate: 0.25, currency: "TRY" } }, {});
  assert.equal(existing.options.rate, 0.25);
  assert.equal(existing.options.currency, "TRY");
  assert.equal(existing.options.rateProvided, true);
});

test("invalid prices and payable percentages fail before creating an invalid budget", async () => {
  const { withStatisticsPricing } = await loadPricing();
  for (const rate of [NaN, Infinity, -Infinity, -0.01, "", "0.1", false, null]) {
    assert.throws(() => withStatisticsPricing(fixture(), { rate }), /Price per weighted word/);
  }
  for (const weight of [NaN, Infinity, -Infinity, -0.01, 100.01, "", "10", false]) {
    assert.throws(
      () => withStatisticsPricing(fixture(), { rate: 0.1, weights: { repetition: weight } }),
      /Weight for repetition.*between 0 and 100/
    );
  }
  assert.throws(() => withStatisticsPricing(fixture(), { currency: 123 }), /Currency must be text/);
  assert.throws(() => withStatisticsPricing(fixture(), { rateProvided: "false" }), /Rate provided/);
  assert.throws(() => withStatisticsPricing(fixture(), { rate: Number.MAX_VALUE }), /Estimated cost/);
  assert.throws(
    () => withStatisticsPricing({ ...fixture(), buckets: [{ band: "new", words: NaN }] }, { rate: 0.1 }),
    /Source words for new/
  );
});
