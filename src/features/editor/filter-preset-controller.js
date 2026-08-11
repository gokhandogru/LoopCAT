const PRESETS = Object.freeze({
  translate: Object.freeze({
    id: "translate",
    status: "open",
    reviewState: "",
    aiState: "",
    inspectorTab: "matches"
  }),
  review: Object.freeze({
    id: "review",
    status: "all",
    reviewState: "needs-review",
    aiState: "",
    inspectorTab: "review"
  }),
  "qa-fixes": Object.freeze({
    id: "qa-fixes",
    status: "all",
    reviewState: "blocked",
    aiState: "",
    inspectorTab: "quality"
  }),
  "ai-review": Object.freeze({
    id: "ai-review",
    status: "all",
    reviewState: "",
    aiState: "ai-review-risk",
    inspectorTab: "ai"
  })
});

const MAX_REMEMBERED_PROJECTS = 24;

export function filterPresetById(id) {
  return PRESETS[id] || null;
}

export function createFilterPresetController({
  select,
  preferencesRepository,
  getProjectId,
  applyFilters,
  setInspectorTab
}) {
  if (!select || !preferencesRepository || typeof applyFilters !== "function") {
    throw new TypeError("FilterPresetController requires a select, PreferencesRepository, and applyFilters callback.");
  }

  let rememberedByProject = {};

  async function persist(projectId, presetId) {
    if (!projectId || !PRESETS[presetId]) return;
    const entries = Object.entries({ ...rememberedByProject, [projectId]: presetId }).slice(-MAX_REMEMBERED_PROJECTS);
    rememberedByProject = Object.fromEntries(entries);
    await preferencesRepository.patch({ filterPresetByProject: rememberedByProject });
  }

  async function applyPreset(presetId, { remember = true } = {}) {
    const preset = filterPresetById(presetId);
    if (!preset) {
      select.value = "";
      return null;
    }
    select.value = preset.id;
    await applyFilters(preset);
    setInspectorTab?.(preset.inspectorTab);
    const projectId = getProjectId?.() || "";
    if (remember) await persist(projectId, preset.id);
    return preset;
  }

  async function restoreForProject(projectId = getProjectId?.() || "") {
    const presetId = rememberedByProject[projectId] || "";
    if (!presetId) {
      select.value = "";
      return null;
    }
    return await applyPreset(presetId, { remember: false });
  }

  function markCustom() {
    select.value = "";
  }

  async function initialize() {
    const preferences = await preferencesRepository.read();
    rememberedByProject =
      preferences.filterPresetByProject && typeof preferences.filterPresetByProject === "object"
        ? Object.fromEntries(
            Object.entries(preferences.filterPresetByProject)
              .filter(([projectId, presetId]) => projectId && PRESETS[presetId])
              .slice(-MAX_REMEMBERED_PROJECTS)
          )
        : {};
    select.addEventListener("change", () => {
      if (select.value) void applyPreset(select.value);
    });
    return Object.freeze({ ...rememberedByProject });
  }

  return Object.freeze({ applyPreset, initialize, markCustom, restoreForProject });
}

export const FILTER_PRESETS = PRESETS;
