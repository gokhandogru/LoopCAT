export function createApplicationStartupController({
  reporting,
  locale,
  ui,
  wiring,
  workspace,
  durability,
  projects,
  preferences,
  workflow,
  offline,
  errors
}) {
  if (!reporting?.checkpoint || !reporting.progress) {
    throw new TypeError("ApplicationStartupController requires checked progress reporters.");
  }
  if (!locale?.initialize || !ui?.initialize || !ui.renderLocaleOptions || !wiring?.wire) {
    throw new TypeError("ApplicationStartupController requires checked locale, UI, and wiring actions.");
  }
  if (!workspace?.startAutosave || !workspace.restoreDirty || !workspace.assignStatus || !workspace.renderStatus) {
    throw new TypeError("ApplicationStartupController requires checked workspace actions.");
  }
  if (workspace.reconnect != null && typeof workspace.reconnect !== "function") {
    throw new TypeError("ApplicationStartupController requires a checked optional workspace reconnect action.");
  }
  if (!durability?.refresh || !projects?.load || !projects.count) {
    throw new TypeError("ApplicationStartupController requires checked durability and project actions.");
  }
  for (const controller of [preferences?.theme, preferences?.layout]) {
    if (controller?.initialize != null && typeof controller.initialize !== "function") {
      throw new TypeError("ApplicationStartupController requires checked optional preference controllers.");
    }
  }
  if (!workflow?.run || !offline?.register || !errors?.log || !errors.setStatus) {
    throw new TypeError("ApplicationStartupController requires checked workflow, offline, and error actions.");
  }

  async function run() {
    reporting.checkpoint("loading active interface locale");
    await locale.initialize();
    reporting.checkpoint("initializing UI and event wiring");
    ui.initialize();
    reporting.checkpoint("rendering UI locale options");
    ui.renderLocaleOptions();
    reporting.checkpoint("binding local AI drawer");
    reporting.checkpoint("wiring UI events");
    wiring.wire();
    reporting.checkpoint("starting workspace autosave");
    workspace.startAutosave();
    reporting.checkpoint("starting application bootstrap");

    reporting.progress("startup: restoring workspace state");
    workspace.restoreDirty();
    reporting.progress("startup: checking storage durability");
    await durability.refresh();
    if (workspace.reconnect) {
      reporting.progress("startup: reconnecting workspace");
      workspace.assignStatus(await workspace.reconnect());
      workspace.renderStatus();
    }
    reporting.progress("startup: loading projects");
    await projects.load(false);
    reporting.progress("startup: loading interface preferences");
    await Promise.all([
      preferences?.theme?.initialize?.({ freshProfile: projects.count() === 0 }),
      preferences?.layout?.initialize?.()
    ]);
    reporting.progress("startup: starting workflow characterization");
    await workflow.run();
    offline.register();
  }

  function start() {
    return run().catch((error) => {
      errors.log(error);
      errors.setStatus(error.message || "Startup error", "dirty");
    });
  }

  return Object.freeze({ start });
}
