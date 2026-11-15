// A response is authored by the learner and is not owned by the installed pack.
// Device-local ownership is intentional: uninstall never doubles as erasure.
const PREFIX = "loopcat.exchange.learner.v1:";
const validScore = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
function storageKey(pin, exerciseId) {
  return PREFIX + pin.digest + ":" + exerciseId;
}
function shuffled(seed, rotation) {
  let n = seed >>> 0;
  const arr = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((n / 0x100000000) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(rotation).concat(arr.slice(0, rotation));
}
function read(storage, key) {
  const raw = storage.getItem(key);
  if (raw == null) return null;
  if (raw.length > 20000) throw new Error("Unreadable local response. Remove it from Saved responses.");
  const v = JSON.parse(raw);
  if (
    !v ||
    v.schema !== 1 ||
    !/^[a-f\d]{64}$/.test(v.digest) ||
    !Array.isArray(v.order) ||
    v.order.length !== 4 ||
    new Set(v.order).size !== 4 ||
    !v.order.every((n) => Number.isInteger(n) && n >= 0 && n < 4)
  )
    throw new Error("Unreadable local response. Remove it from Saved responses.");
  return v;
}
export function openTrial({ storage, pack, pin, exercise, exerciseIndex = 0, seed = undefined, group = 0 }) {
  if (!/^[a-f\d]{64}$/.test(pin.digest) || !Number.isInteger(group) || group < 0 || group > 3)
    throw new Error("Invalid lesson identity or group.");
  const key = storageKey(pin, exercise.id);
  let state = read(storage, key);
  if (!state) {
    const sessionSeed = seed ?? parseInt(pin.digest.slice(0, 8), 16);
    const rotation = (exerciseIndex + group) % 4;
    state = {
      schema: 1,
      packId: pack.id,
      packVersion: pack.version,
      digest: pin.digest,
      exerciseId: exercise.id,
      group,
      seed: sessionSeed,
      order: shuffled(sessionSeed, rotation),
      rubric: [...exercise.rubric],
      choice: null,
      ratings: [],
      reason: "",
      revealed: false
    };
    storage.setItem(key, JSON.stringify(state));
  }
  function write(next) {
    const latest = read(storage, key);
    if (!latest || JSON.stringify(latest) !== JSON.stringify(state))
      throw new Error("The response changed. Reopen the lesson.");
    storage.setItem(key, JSON.stringify(next));
    state = next;
  }
  return {
    snapshot: () => structuredClone(state),
    submit(choice, ratings, reason) {
      if (state.choice !== null) throw new Error("This decision is already recorded.");
      if (
        !Number.isInteger(choice) ||
        choice < 0 ||
        choice > 3 ||
        !Array.isArray(ratings) ||
        ratings.length !== exercise.rubric.length ||
        !ratings.every(validScore) ||
        typeof reason !== "string" ||
        !reason.trim() ||
        reason.length > 1200
      )
        throw new Error("Choose a candidate, score each criterion and explain your choice.");
      write({ ...state, choice, ratings: [...ratings], reason: reason.trim() });
    },
    reveal() {
      if (state.choice === null) throw new Error("Record your judgement before revealing the labels.");
      if (!state.revealed) write({ ...state, revealed: true });
      return state.order.map((i) => exercise.candidates[i].label);
    }
  };
}
export function listResponses(storage) {
  const result = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) {
      try {
        result.push({ key, value: read(storage, key) });
      } catch {
        result.push({ key, value: null });
      }
    }
  }
  return result;
}
export function forgetResponse(storage, key) {
  if (typeof key !== "string" || !key.startsWith(PREFIX)) throw new Error("Invalid response key.");
  storage.removeItem(key);
}
export function responseEvidence(state, includeReason = false) {
  if (!state || state.choice === null) throw new Error("No submitted response.");
  return {
    format: "loopcat-study-response",
    version: 1,
    lesson: { id: state.packId, version: state.packVersion, digest: state.digest },
    exercise: state.exerciseId,
    group: state.group,
    order: state.order.map((i) => i + 1),
    selectedPosition: state.choice + 1,
    ratings: state.rubric.map((name, i) => ({ name, score: state.ratings[i] })),
    ...(includeReason ? { justification: state.reason } : {})
  };
}
