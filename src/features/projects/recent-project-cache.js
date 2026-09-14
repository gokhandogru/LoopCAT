/** Disposable read cache. Database generation + restore epoch are checked on
 * both sides of a read and again at consumption; cached records never authorize writes. */
export function createRecentProjectCache({ repository, preferences, preferenceKey }) {
  const entries = new Map();
  let revision = 0;
  let warmRun = 0;
  let timer;
  let recent = [];
  try {
    const saved = JSON.parse(preferences.getItem(preferenceKey) || "[]");
    if (Array.isArray(saved))
      recent = saved.filter((item) => typeof item?.id === "string" && Number.isFinite(item.at)).slice(0, 3);
  } catch {
    /* Optional acceleration must not prevent opening a project. */
  }

  function invalidate() {
    revision += 1;
    warmRun += 1;
    entries.clear();
    clearTimeout(timer);
  }

  async function read(id, expectedRevision) {
    const before = await repository.stamp();
    const [segments, activity] = await Promise.all([repository.segments(id), repository.activity(id)]);
    const after = await repository.stamp();
    if (expectedRevision !== revision || before !== after) return null;
    return { stamp: after, segments, activity };
  }

  function remember(id) {
    recent = [{ id, at: Date.now() }, ...recent.filter((item) => item.id !== id)].slice(0, 3);
    try {
      preferences.setItem(preferenceKey, JSON.stringify(recent));
    } catch {
      /* Local preferences are optional. */
    }
  }

  async function take(id) {
    const entry = entries.get(id);
    entries.delete(id);
    if (entry) {
      const cached = await entry;
      if (cached && cached.stamp === (await repository.stamp())) return cached;
    }
    // A foreground read is never limited by the speculative cache's size cap.
    const [segments, activity] = await Promise.all([repository.segments(id), repository.activity(id)]);
    return { segments, activity };
  }

  function schedule(projects) {
    const run = ++warmRun;
    clearTimeout(timer);
    const access = new Map(recent.map((item) => [item.id, item.at]));
    const candidates = projects
      .filter((project) => !project.catalogUnverified && !project.archived && !project.deletedAt)
      .sort(
        (a, b) =>
          Math.max(access.get(b.id) || 0, Date.parse(b.createdAt) || 0) -
          Math.max(access.get(a.id) || 0, Date.parse(a.createdAt) || 0)
      )
      .slice(0, 3);
    const ids = new Set(candidates.map((project) => project.id));
    for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id);
    const expectedRevision = revision;
    timer = setTimeout(() => {
      void (async () => {
        for (const project of candidates) {
          if (expectedRevision !== revision || run !== warmRun) return;
          // Keep speculative work small; large projects still open normally.
          if (
            entries.has(project.id) ||
            (project.catalogProgress?.total || project.catalogProgress?.segments || 0) > 5000
          )
            continue;
          const job = read(project.id, expectedRevision)
            .then((value) => {
              if (!value || value.segments.length > 5000 || value.activity.length > 2000) return null;
              // Bound retained history/markup as well as row counts.
              if (JSON.stringify(value).length > 2 * 1024 * 1024) return null;
              return value;
            })
            .catch(() => null);
          entries.set(project.id, job);
          await job;
          await new Promise((resolve) => {
            setTimeout(resolve, 30);
          });
        }
      })();
    }, 100);
  }

  return Object.freeze({ take, remember, schedule, invalidate });
}
