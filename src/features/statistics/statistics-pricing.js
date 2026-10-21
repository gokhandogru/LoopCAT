const bands = ["context", "exact", "repetition", "95-99", "85-94", "75-84", "50-74", "new", "incomplete"];

function validNumber(value, label, maximum = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(
      maximum === Infinity
        ? `${label} must be a finite, nonnegative number.`
        : `${label} must be a number between 0 and ${maximum}.`
    );
  }
  return value;
}

/**
 * Apply pricing without repeating the analysis or changing its source evidence.
 * Omitted weights retain the snapshot's weights, then default to 100% payable.
 * @param {any} snapshot
 * @param {{ rate?: number, currency?: string, weights?: Record<string, number>, rateProvided?: boolean }} pricing
 * @param {string} [id]
 */
export function withStatisticsPricing(snapshot, pricing, id = snapshot.id) {
  const previous = snapshot.options || {};
  const weights = Object.fromEntries(bands.map((band) => [band, 100]));
  Object.assign(weights, previous.weights, pricing.weights);
  for (const [band, weight] of Object.entries(weights)) validNumber(weight, `Weight for ${band}`, 100);

  const rate = validNumber(pricing.rate !== undefined ? pricing.rate : (previous.rate ?? 0), "Price per weighted word");
  const currency = pricing.currency !== undefined ? pricing.currency : (previous.currency ?? "");
  if (typeof currency !== "string") throw new Error("Currency must be text.");
  if (pricing.rateProvided !== undefined && typeof pricing.rateProvided !== "boolean") {
    throw new Error("Rate provided must be true or false.");
  }
  const rateProvided =
    pricing.rateProvided ??
    (pricing.rate !== undefined ? true : (previous.rateProvided ?? previous.rate !== undefined));
  const weightedTotal = (buckets) => {
    const total = (buckets || []).reduce((sum, bucket) => {
      const words = validNumber(bucket.words, `Source words for ${bucket.band}`);
      return sum + words * ((weights[bucket.band] ?? 100) / 100);
    }, 0);
    validNumber(total, "Weighted words");
    validNumber(total * rate, "Estimated cost");
    return total;
  };

  return {
    ...snapshot,
    id,
    options: { ...previous, weighted: true, weights, rate, currency, rateProvided },
    weightedWords: weightedTotal(snapshot.buckets),
    estimatedWeightedWords: weightedTotal(snapshot.estimatedBuckets)
  };
}
