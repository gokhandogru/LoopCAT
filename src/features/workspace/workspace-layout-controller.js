const VALID_DENSITIES = new Set(["balanced", "compact"]);
const DEFAULT_INSPECTOR_WIDTH = 320;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 420;

function normalizeInspectorWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return DEFAULT_INSPECTOR_WIDTH;
  return Math.round(Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, width)));
}

export function createWorkspaceLayoutController({
  documentRoot,
  workspace,
  densitySelect,
  resetButton,
  inspector,
  inspectorResizer,
  preferencesRepository,
  onInspectorPreference
}) {
  if (!documentRoot || !workspace || !preferencesRepository) {
    throw new TypeError("WorkspaceLayoutController requires roots and PreferencesRepository.");
  }

  let density = "balanced";
  let inspectorOpen = true;
  let inspectorWidth = DEFAULT_INSPECTOR_WIDTH;

  function apply() {
    documentRoot.dataset.density = density;
    workspace.dataset.density = density;
    if (densitySelect) densitySelect.value = density;
    workspace.style?.setProperty?.("--inspector-width", `${inspectorWidth}px`);
    if (inspector) inspector.style?.setProperty?.("--inspector-width", `${inspectorWidth}px`);
    if (inspectorResizer) {
      inspectorResizer.setAttribute("aria-valuemin", String(MIN_INSPECTOR_WIDTH));
      inspectorResizer.setAttribute("aria-valuemax", String(MAX_INSPECTOR_WIDTH));
      inspectorResizer.setAttribute("aria-valuenow", String(inspectorWidth));
      inspectorResizer.setAttribute("aria-valuetext", `${inspectorWidth} pixels wide`);
    }
    onInspectorPreference?.(inspectorOpen);
  }

  async function setDensity(value, { persist = true } = {}) {
    density = VALID_DENSITIES.has(value) ? value : "balanced";
    apply();
    if (persist) await preferencesRepository.patch({ density });
    return density;
  }

  async function setInspectorOpen(value, { persist = true } = {}) {
    inspectorOpen = value !== false;
    onInspectorPreference?.(inspectorOpen);
    if (persist) await preferencesRepository.patch({ inspectorOpen });
    return inspectorOpen;
  }

  async function setInspectorWidth(value, { persist = true } = {}) {
    inspectorWidth = normalizeInspectorWidth(value);
    apply();
    if (persist) await preferencesRepository.patch({ inspectorWidth });
    return inspectorWidth;
  }

  async function reset() {
    density = "balanced";
    inspectorOpen = true;
    inspectorWidth = DEFAULT_INSPECTOR_WIDTH;
    apply();
    await preferencesRepository.patch({ density, inspectorOpen, inspectorWidth });
  }

  function bindInspectorResizer() {
    if (!inspectorResizer) return;
    inspectorResizer.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? MIN_INSPECTOR_WIDTH
          : event.key === "End"
            ? MAX_INSPECTOR_WIDTH
            : inspectorWidth + (event.key === "ArrowLeft" ? 16 : -16);
      void setInspectorWidth(next);
    });
    inspectorResizer.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = inspectorWidth;
      inspectorResizer.setPointerCapture?.(event.pointerId);
      const move = (moveEvent) => {
        void setInspectorWidth(startWidth + startX - moveEvent.clientX, { persist: false });
      };
      const finish = () => {
        inspectorResizer.removeEventListener("pointermove", move);
        inspectorResizer.removeEventListener("pointerup", finish);
        inspectorResizer.removeEventListener("pointercancel", finish);
        void preferencesRepository.patch({ inspectorWidth });
      };
      inspectorResizer.addEventListener("pointermove", move);
      inspectorResizer.addEventListener("pointerup", finish);
      inspectorResizer.addEventListener("pointercancel", finish);
    });
  }

  async function initialize() {
    const preferences = await preferencesRepository.read();
    density = VALID_DENSITIES.has(preferences.density) ? preferences.density : "balanced";
    inspectorOpen = preferences.inspectorOpen !== false;
    inspectorWidth = normalizeInspectorWidth(preferences.inspectorWidth);
    apply();
    densitySelect?.addEventListener("change", () => void setDensity(densitySelect.value));
    resetButton?.addEventListener("click", () => void reset());
    bindInspectorResizer();
    return Object.freeze({ density, inspectorOpen, inspectorWidth });
  }

  return Object.freeze({
    getState: () => Object.freeze({ density, inspectorOpen, inspectorWidth }),
    initialize,
    reset,
    setDensity,
    setInspectorOpen,
    setInspectorWidth
  });
}

export const INSPECTOR_WIDTH = Object.freeze({
  default: DEFAULT_INSPECTOR_WIDTH,
  min: MIN_INSPECTOR_WIDTH,
  max: MAX_INSPECTOR_WIDTH
});
