/**
 * Owns current-project QA execution and Run QA button lifecycle. Project and
 * document state, terminology, protected-tag policy, QA implementations,
 * presentation, activity, status, logging, and test-only failure policy remain
 * behind injected boundaries.
 *
 * @param {{
 *   elements: { runButton: any },
 *   session: {
 *     getProject: () => any,
 *     replaceQaChecks: (checks: any[]) => unknown,
 *     replaceQualityRiskQueue: (queue: any[]) => unknown
 *   },
 *   terms: { list: (query: object) => Promise<any[]>, getNames: () => string[] },
 *   documents: { currentSegments: () => any[] },
 *   tags: { sourceTags: (segment: any) => any[], missing: (segment: any) => any[] },
 *   qa: { runChecks: (segments: any[], terms: any[], options: object) => any[] },
 *   worker?: any,
 *   presentation: {
 *     clearResults: () => unknown,
 *     renderResults: () => unknown,
 *     buildRiskQueue: (checks: any[]) => any[],
 *     renderWorkbench: () => unknown
 *   },
 *   navigation: { getDocumentId: () => string },
 *   activity: { log: (type: string, summary: string, detail: object) => Promise<unknown> | unknown },
 *   status: { set: (message: string, mode: string) => unknown },
 *   logger: { warn: (message: string, error: unknown) => unknown },
 *   testHooks: { beforeRun: () => unknown, beforeActivity: () => unknown }
 * }} options
 */
export function createProjectQaController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const terms = options?.terms;
  const documents = options?.documents;
  const tags = options?.tags;
  const qa = options?.qa;
  const worker = options?.worker;
  const presentation = options?.presentation;
  const navigation = options?.navigation;
  const activity = options?.activity;
  const status = options?.status;
  const logger = options?.logger;
  const testHooks = options?.testHooks;
  if (
    typeof elements?.runButton?.addEventListener !== "function" ||
    typeof elements.runButton.removeEventListener !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session.replaceQaChecks !== "function" ||
    typeof session.replaceQualityRiskQueue !== "function"
  ) {
    throw new TypeError("ProjectQaController requires a Run QA button and session boundaries.");
  }
  if (
    typeof terms?.list !== "function" ||
    typeof terms.getNames !== "function" ||
    typeof documents?.currentSegments !== "function" ||
    typeof tags?.sourceTags !== "function" ||
    typeof tags.missing !== "function" ||
    typeof qa?.runChecks !== "function"
  ) {
    throw new TypeError("ProjectQaController requires terminology, document, tag, and QA boundaries.");
  }
  if (
    typeof presentation?.clearResults !== "function" ||
    typeof presentation.renderResults !== "function" ||
    typeof presentation.buildRiskQueue !== "function" ||
    typeof presentation.renderWorkbench !== "function"
  ) {
    throw new TypeError("ProjectQaController requires QA results and workbench presentation boundaries.");
  }
  if (
    typeof navigation?.getDocumentId !== "function" ||
    typeof activity?.log !== "function" ||
    typeof status?.set !== "function" ||
    typeof logger?.warn !== "function" ||
    typeof testHooks?.beforeRun !== "function" ||
    typeof testHooks.beforeActivity !== "function"
  ) {
    throw new TypeError("ProjectQaController requires navigation, activity, status, logger, and test-hook boundaries.");
  }

  let mounted = false;

  async function run() {
    if (!session.getProject()) return null;
    try {
      testHooks.beforeRun();
      const termRecords = await terms.list({
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseNames: terms.getNames()
      });
      const qaSegments = documents.currentSegments().map((segment) => ({
        ...segment,
        tags: tags.sourceTags(segment)
      }));
      const fallback = () =>
        Promise.resolve(
          qa.runChecks(documents.currentSegments(), termRecords, {
            missingTags: tags.missing
          })
        );
      const checks = worker?.runQaChecks
        ? await worker.runQaChecks({ segments: qaSegments, terms: termRecords, fallback })
        : await fallback();
      session.replaceQaChecks(checks);
      presentation.clearResults();
      presentation.renderResults();
      session.replaceQualityRiskQueue(presentation.buildRiskQueue(checks));
      presentation.renderWorkbench();
      try {
        testHooks.beforeActivity();
        await activity.log("qa-run", "QA checks run", {
          issueCount: checks.length,
          documentId: navigation.getDocumentId()
        });
      } catch (activityError) {
        logger.warn("QA activity log failed.", activityError);
      }
      status.set(
        checks.length ? `QA found ${checks.length} issue${checks.length === 1 ? "" : "s"}` : "QA found no issues",
        checks.length ? "dirty" : "saved"
      );
      return checks;
    } catch (error) {
      presentation.renderResults();
      status.set(error.message || "QA checks failed", "dirty");
      return null;
    }
  }

  function mount() {
    if (mounted) return;
    elements.runButton.addEventListener("click", run);
    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    elements.runButton.removeEventListener("click", run);
    mounted = false;
  }

  return Object.freeze({ mount, run, unmount });
}
