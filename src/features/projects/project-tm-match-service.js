/**
 * Owns project TM candidate lookup plus optional worker/local ranking
 * orchestration. TM repositories, scoring policy, and worker transport remain
 * injected boundaries.
 *
 * @param {{
 *   candidates: {
 *     single: (options: object) => Promise<any[]> | any[],
 *     batch?: ((optionsList: object[]) => Promise<any[][]> | any[][]) | null
 *   },
 *   scoring: { score: (entries: any[], options: object) => any[] },
 *   worker?: {
 *     findTmMatches?: (request: object) => Promise<any[]> | any[],
 *     findTmMatchesBatch?: (request: object) => Promise<any[][]> | any[][]
 *   } | null
 * }} options
 */
export function createProjectTmMatchService(options) {
  const candidates = options?.candidates;
  const scoring = options?.scoring;
  const worker = options?.worker;
  if (typeof candidates?.single !== "function") {
    throw new TypeError("ProjectTmMatchService requires a TM candidate boundary.");
  }
  if (typeof scoring?.score !== "function") {
    throw new TypeError("ProjectTmMatchService requires a TM scoring boundary.");
  }

  const findCandidates = candidates.single;
  const score = scoring.score;

  // Async preserves the legacy rejected-promise boundary for synchronous scoring and worker failures.
  // eslint-disable-next-line require-await
  async function rank(entries, matchOptions) {
    const fallback = () => Promise.resolve(score(entries, matchOptions));
    if (!worker?.findTmMatches) return fallback();
    return worker.findTmMatches({ entries, options: matchOptions, fallback });
  }

  async function find(matchOptions) {
    const entries = await findCandidates(matchOptions);
    return rank(entries, matchOptions);
  }

  // Async preserves the legacy rejected-promise boundary for synchronous scoring and worker failures.
  // eslint-disable-next-line require-await
  async function rankBatch(candidateBatches, optionsList) {
    const fallback = () =>
      Promise.resolve(candidateBatches.map((entries, index) => score(entries, optionsList[index] || {})));
    if (!worker?.findTmMatchesBatch) return fallback();
    return worker.findTmMatchesBatch({ entries: candidateBatches, options: optionsList, fallback });
  }

  async function findBatch(optionsList) {
    const requests = Array.isArray(optionsList) ? optionsList : [];
    if (!requests.length) return [];
    const findCandidateBatches = candidates.batch;
    if (!findCandidateBatches) {
      return Promise.all(requests.map((matchOptions) => find(matchOptions)));
    }
    const candidateBatches = await findCandidateBatches(requests);
    return rankBatch(candidateBatches, requests);
  }

  return Object.freeze({ rank, find, rankBatch, findBatch });
}
