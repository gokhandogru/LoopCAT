/**
 * Owns current-project analysis sequencing, asynchronous stale-result
 * suppression, linked-TM filtering, metric composition, and safe presentation.
 * Session/navigation state, TM persistence, resource policy, analysis domain
 * logic, localization, date formatting, and DOM effects remain injected.
 *
 * @param {{
 *   session: { getProject: () => any, getSegments: () => any[] },
 *   navigation: { getView: () => unknown },
 *   tm: { listByIndex: (store: string, index: string, key: string) => Promise<any[]> | any[] },
 *   resources: { tmNames: (project: unknown) => unknown[] },
 *   analysis: { build: (project: unknown, segments: any[], tmEntries: any[]) => any },
 *   date: { format: (value: unknown) => unknown },
 *   localization: {
 *     label: (key: string, values?: unknown) => unknown,
 *     labelHtml: (key: string) => unknown,
 *     sourceHtml: (text: string) => unknown
 *   },
 *   presentation: {
 *     hasRoot: () => unknown,
 *     setMeta: (text: unknown) => unknown,
 *     replace: (html: string) => unknown
 *   }
 * }} options
 */
export function createProjectAnalysisController(options) {
  const session = options?.session;
  const navigation = options?.navigation;
  const tm = options?.tm;
  const resources = options?.resources;
  const analysis = options?.analysis;
  const date = options?.date;
  const localization = options?.localization;
  const presentation = options?.presentation;

  if (typeof session?.getProject !== "function" || typeof session.getSegments !== "function") {
    throw new TypeError("ProjectAnalysisController requires project session boundaries.");
  }
  if (typeof navigation?.getView !== "function") {
    throw new TypeError("ProjectAnalysisController requires a navigation boundary.");
  }
  if (typeof tm?.listByIndex !== "function" || typeof resources?.tmNames !== "function") {
    throw new TypeError("ProjectAnalysisController requires TM and resource boundaries.");
  }
  if (typeof analysis?.build !== "function" || typeof date?.format !== "function") {
    throw new TypeError("ProjectAnalysisController requires analysis and date boundaries.");
  }
  if (
    typeof localization?.label !== "function" ||
    typeof localization.labelHtml !== "function" ||
    typeof localization.sourceHtml !== "function"
  ) {
    throw new TypeError("ProjectAnalysisController requires localization boundaries.");
  }
  if (
    typeof presentation?.hasRoot !== "function" ||
    typeof presentation.setMeta !== "function" ||
    typeof presentation.replace !== "function"
  ) {
    throw new TypeError("ProjectAnalysisController requires presentation boundaries.");
  }

  let analysisRun = 0;

  async function render() {
    const run = (analysisRun += 1);
    const project = session.getProject();
    if (!project || navigation.getView() !== "project" || !presentation.hasRoot()) return;
    const segments = session.getSegments();
    const tmEntries = await tm.listByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`);
    if (run !== analysisRun || navigation.getView() !== "project" || session.getProject()?.id !== project.id) return;
    const tmNames = new Set(resources.tmNames(project));
    const result = analysis.build(
      project,
      segments,
      tmEntries.filter((entry) => tmNames.has(entry.tmName))
    );
    const ai = result.ai || {};
    presentation.setMeta(
      localization.label("generatedAt", {
        date: date.format(result.generatedAt)
      })
    );
    presentation.replace(`
    <div><strong>${result.totals.confirmedPercent}%</strong><span>${localization.labelHtml("confirmed")}</span></div>
    <div><strong>${result.totals.untranslated}</strong><span>${localization.sourceHtml("empty targets")}</span></div>
    <div><strong>${result.totals.repetitions}</strong><span>${localization.labelHtml("repetitions")}</span></div>
    <div><strong>${result.leverage.exact}</strong><span>${localization.labelHtml("exactTm")}</span></div>
    <div><strong>${result.leverage.fuzzy95 + result.leverage.fuzzy85}</strong><span>${localization.labelHtml("strongFuzzy")}</span></div>
    <div><strong>${result.totals.segments - result.totals.confirmed}</strong><span>${localization.labelHtml("openSegments")}</span></div>
    <div><strong>${result.totals.files}</strong><span>${localization.labelHtml("files")}</span></div>
    <div><strong>${result.totals.words}</strong><span>${localization.labelHtml("sourceWords")}</span></div>
    <div><strong>${ai.drafts || 0}</strong><span>${localization.sourceHtml("AI initiated")}</span></div>
    <div><strong>${ai.suggestionSegments || 0}</strong><span>${localization.labelHtml("aiSuggestionRows")}</span></div>
    <div><strong>${ai.highRisk || 0}</strong><span>${localization.labelHtml("highAiRisk")}</span></div>
  `);
  }

  return Object.freeze({ render });
}
