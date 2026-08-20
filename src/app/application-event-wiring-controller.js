const requiredLifecycleNames = Object.freeze([
  "applicationMenu",
  "globalKeyboard",
  "applicationView",
  "commandButtons",
  "updateControls",
  "uiLocaleControls",
  "projectHome",
  "focusMode",
  "inspectorToggle",
  "projectFilterControls",
  "segmentActionButtons",
  "projectQa",
  "panelToggle",
  "editorFilterControls",
  "termForm",
  "projectDomain",
  "applicationPersistence"
]);

export function createApplicationEventWiringController({ checkpoint, initialization, segmentGrid, lifecycles }) {
  if (typeof checkpoint !== "function") {
    throw new TypeError("ApplicationEventWiringController requires a checkpoint reporter.");
  }
  if (!initialization?.renderLanguageDatalists || !initialization.renderTextEncodingOptions) {
    throw new TypeError("ApplicationEventWiringController requires checked UI initializers.");
  }
  if (!segmentGrid?.mountScroll || !segmentGrid.renderSegments) {
    throw new TypeError("ApplicationEventWiringController requires checked segment-grid boundaries.");
  }
  if (requiredLifecycleNames.some((name) => !lifecycles?.[name]?.mount)) {
    throw new TypeError("ApplicationEventWiringController requires checked feature lifecycles.");
  }
  if (lifecycles.palette?.mountTrigger != null && typeof lifecycles.palette.mountTrigger !== "function") {
    throw new TypeError("ApplicationEventWiringController requires a checked optional palette lifecycle.");
  }

  const scrollListener = () => {
    segmentGrid.renderSegments({ fromScroll: true, preserveScroll: true });
  };

  function wire() {
    checkpoint("rendering language datalists");
    initialization.renderLanguageDatalists();
    checkpoint("rendering text encodings");
    initialization.renderTextEncodingOptions();
    checkpoint("attaching event listeners");

    lifecycles.applicationMenu.mount();
    lifecycles.globalKeyboard.mount();
    segmentGrid.mountScroll(scrollListener);
    lifecycles.applicationView.mount();
    lifecycles.commandButtons.mount();
    lifecycles.updateControls.mount();
    lifecycles.uiLocaleControls.mount();
    lifecycles.projectHome.mount();
    lifecycles.focusMode.mount();
    lifecycles.inspectorToggle.mount();
    lifecycles.palette?.mountTrigger?.();
    lifecycles.projectFilterControls.mount();
    lifecycles.segmentActionButtons.mount();
    lifecycles.projectQa.mount();
    lifecycles.panelToggle.mount();
    lifecycles.editorFilterControls.mount();
    lifecycles.termForm.mount();
    lifecycles.projectDomain.mount();
    lifecycles.applicationPersistence.mount();
  }

  return Object.freeze({ wire });
}
