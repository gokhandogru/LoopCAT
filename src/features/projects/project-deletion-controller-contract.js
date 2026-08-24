export function validateProjectDeletionControllerOptions(options) {
  const session = options?.session;
  const confirmation = options?.confirmation;
  const text = options?.text;
  const autosave = options?.autosave;
  const commands = options?.commands;
  const commandState = options?.commandState;
  const workspace = options?.workspace;
  const navigation = options?.navigation;
  const projects = options?.projects;
  const segments = options?.segments;
  const histories = options?.histories;
  const activity = options?.activity;
  const summaries = options?.summaries;
  const home = options?.home;
  const status = options?.status;
  const history = options?.history;
  const test = options?.test;
  const logger = options?.logger;

  if (
    typeof session?.getProject !== "function" ||
    typeof session.getProjects !== "function" ||
    typeof session.getSegments !== "function" ||
    typeof session.replaceProject !== "function" ||
    typeof session.replaceProjects !== "function" ||
    typeof session.replaceSegments !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires project session boundaries.");
  }
  if (typeof confirmation?.ask !== "function" || typeof text?.safe !== "function") {
    throw new TypeError("ProjectDeletionController requires confirmation and text-safety boundaries.");
  }
  if (typeof autosave?.flush !== "function") {
    throw new TypeError("ProjectDeletionController requires an autosave boundary.");
  }
  if (
    typeof commands?.createProjectDelete !== "function" ||
    typeof commands.createDocumentDelete !== "function" ||
    typeof commands.execute !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires reversible command boundaries.");
  }
  if (typeof commandState?.selectProject !== "function") {
    throw new TypeError("ProjectDeletionController requires a command-state boundary.");
  }
  if (typeof workspace?.clear !== "function" || typeof workspace.mark !== "function") {
    throw new TypeError("ProjectDeletionController requires workspace-dirty boundaries.");
  }
  if (
    typeof navigation?.openProjects !== "function" ||
    typeof navigation.clearSelection !== "function" ||
    typeof navigation.selectDocument !== "function" ||
    typeof navigation.selectSegment !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires navigation boundaries.");
  }
  if (
    typeof projects?.load !== "function" ||
    typeof segments?.list !== "function" ||
    typeof histories?.prepare !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires project and segment repository boundaries.");
  }
  if (
    typeof activity?.log !== "function" ||
    typeof summaries?.refresh !== "function" ||
    typeof home?.show !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires activity and presentation boundaries.");
  }
  if (typeof status?.set !== "function" || typeof history?.render !== "function") {
    throw new TypeError("ProjectDeletionController requires status and history boundaries.");
  }
  if (
    typeof test?.projectDeleteFails !== "function" ||
    typeof test.documentDeleteFails !== "function" ||
    typeof test.documentActivityFails !== "function"
  ) {
    throw new TypeError("ProjectDeletionController requires checked test boundaries.");
  }
  if (typeof logger?.warn !== "function") {
    throw new TypeError("ProjectDeletionController requires a warning logger boundary.");
  }
}
