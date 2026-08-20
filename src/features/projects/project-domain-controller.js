/**
 * Owns project-domain save orchestration and form lifecycle. Project state,
 * repository persistence, summary/application presentation, workspace state,
 * status, cloning, and test-only failure policy remain injected boundaries.
 *
 * @param {{
 *   elements: { form: any, input: any },
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     replaceProject: (project: any) => unknown,
 *     replaceProjects: (projects: any[]) => unknown
 *   },
 *   repository: { update: (project: any) => Promise<any> },
 *   presentation: { refreshSummaries: () => Promise<unknown> | unknown, renderAll: () => unknown },
 *   workspace: { markDirty: () => unknown },
 *   status: { set: (message: string, mode: string) => unknown },
 *   clone: (value: any) => any,
 *   testHooks: { beforeSave: () => unknown }
 * }} options
 */
export function createProjectDomainController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const repository = options?.repository;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  const clone = options?.clone;
  const testHooks = options?.testHooks;
  if (
    typeof elements?.form?.addEventListener !== "function" ||
    typeof elements.form.removeEventListener !== "function" ||
    typeof elements.form.classList?.toggle !== "function" ||
    typeof elements?.input?.addEventListener !== "function" ||
    typeof elements.input.removeEventListener !== "function"
  ) {
    throw new TypeError("ProjectDomainController requires form and input elements.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof session.getProjects !== "function" ||
    typeof session.replaceProject !== "function" ||
    typeof session.replaceProjects !== "function" ||
    typeof repository?.update !== "function"
  ) {
    throw new TypeError("ProjectDomainController requires project session and repository boundaries.");
  }
  if (
    typeof presentation?.refreshSummaries !== "function" ||
    typeof presentation.renderAll !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function" ||
    typeof clone !== "function" ||
    typeof testHooks?.beforeSave !== "function"
  ) {
    throw new TypeError(
      "ProjectDomainController requires presentation, workspace, status, clone, and test-hook boundaries."
    );
  }

  let mounted = false;

  async function save() {
    if (!session.getProject()) return false;
    const previousProject = clone(session.getProject());
    const previousProjects = session.getProjects().map((project) => clone(project));
    const domain = elements.input.value.trim();
    try {
      testHooks.beforeSave();
      session.replaceProject(await repository.update({ ...session.getProject(), domain }));
      session.replaceProjects(
        session
          .getProjects()
          .map((project) => (project.id === session.getProject().id ? session.getProject() : project))
      );
      await presentation.refreshSummaries();
      presentation.renderAll();
      elements.form.classList.toggle("hidden", Boolean((session.getProject().domain || "").trim()));
      workspace.markDirty();
      status.set("Project domain saved", "saved");
      return true;
    } catch (error) {
      session.replaceProject(previousProject);
      session.replaceProjects(previousProjects);
      elements.form.classList.toggle("clean", domain === (session.getProject().domain || ""));
      status.set(error.message || "Project domain save failed", "dirty");
      return false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await save();
  }

  function handleInput() {
    const current = session.getProject()?.domain || "";
    elements.form.classList.toggle("clean", elements.input.value.trim() === current);
  }

  function mount() {
    if (mounted) return;
    elements.form.addEventListener("submit", handleSubmit);
    elements.input.addEventListener("input", handleInput);
    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    elements.form.removeEventListener("submit", handleSubmit);
    elements.input.removeEventListener("input", handleInput);
    mounted = false;
  }

  return Object.freeze({ mount, save, unmount });
}
