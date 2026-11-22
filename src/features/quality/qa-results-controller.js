import { qaIsIncomplete } from "./qa-completeness.js";

const QA_TYPE_LABELS = new Map([
  ["empty", "Empty target"],
  ["number", "Number mismatch"],
  ["tag", "Missing tag"],
  ["copy", "Copied source"],
  ["punctuation", "Punctuation"],
  ["forbidden-term", "Forbidden term"],
  ["term", "Terminology"]
]);
/**
 * Owns QA summary/filter state, localized issue presentation, dynamic filter
 * and navigation actions, and safe results-root replacement. QA calculation,
 * session records, localization, navigation, rendering, and focus remain
 * behind injected boundaries.
 *
 * @param {{
 *   session: { getQaChecks: () => any[], getSegments: () => any[] },
 *   getRoot: () => any,
 *   dom: { createElement: (tagName: string) => any, createDocumentFragment: () => any },
 *   localization: {
 *     source: (text: string, values?: object) => string,
 *     label: (key: string) => string
 *   },
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => unknown,
 *   navigation: { select: (index: number) => Promise<unknown> | unknown },
 *   presentation: { renderSegments: () => unknown },
 *   focus: { target: () => unknown }
 * }} options
 */
export function createQaResultsController(options) {
  const session = options?.session;
  const getRoot = options?.getRoot;
  const dom = options?.dom;
  const localization = options?.localization;
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  const navigation = options?.navigation;
  const presentation = options?.presentation;
  const focus = options?.focus;
  if (
    typeof session?.getQaChecks !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof getRoot !== "function" ||
    typeof dom?.createElement !== "function" ||
    typeof dom?.createDocumentFragment !== "function"
  ) {
    throw new TypeError("QaResultsController requires session, results-root, and DOM boundaries.");
  }
  if (
    typeof localization?.source !== "function" ||
    typeof localization?.label !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof replaceSafeHtml !== "function"
  ) {
    throw new TypeError("QaResultsController requires localization and safe-HTML boundaries.");
  }
  if (
    typeof navigation?.select !== "function" ||
    typeof presentation?.renderSegments !== "function" ||
    typeof focus?.target !== "function"
  ) {
    throw new TypeError("QaResultsController requires navigation, presentation, and focus boundaries.");
  }

  let filter = "";
  let completedChecks;

  function clear() {
    // QA, delivery and report runs publish a new result array before resetting the filter.
    completedChecks = session.getQaChecks();
    filter = "";
  }

  function summary(checks) {
    return checks.reduce((result, check) => {
      result[check.type] = (result[check.type] || 0) + 1;
      result[check.severity] = (result[check.severity] || 0) + 1;
      return result;
    }, {});
  }

  function message(check) {
    return localization.source(check?.message || "", check?.messageValues || {});
  }

  function fixHint(check) {
    return check?.fixHint ? localization.source(check.fixHint, check.fixHintValues || {}) : "";
  }

  function render(focusFilter) {
    const root = getRoot();
    const qaChecks = session.getQaChecks();
    const checks = filter ? qaChecks.filter((check) => check.type === filter) : qaChecks;
    if (!qaChecks.length) {
      let status = "Run QA to check this file.";
      if (qaIsIncomplete(qaChecks)) status = "Required Exchange checks: Not evaluated.";
      else if (qaChecks === completedChecks) status = "No QA issues found.";
      root.textContent = localization.source(status);
      root.classList.add("muted");
      return;
    }
    root.classList.remove("muted");
    const typeCounts = new Map();
    for (const { type } of qaChecks) {
      if (type) typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    const fragment = dom.createDocumentFragment();
    const summaryWrap = dom.createElement("div");
    summaryWrap.className = "qa-summary";
    const allButton = dom.createElement("button");
    allButton.type = "button";
    allButton.className = filter ? "" : "active";
    allButton.ariaPressed = String(!filter);
    allButton.textContent = localization.source("All {value1}", { value1: qaChecks.length });
    allButton.addEventListener("click", () => {
      filter = "";
      render("");
    });
    summaryWrap.append(allButton);
    let nextFocus = focusFilter === "" ? allButton : null;
    for (const [type, count] of typeCounts) {
      const button = dom.createElement("button");
      button.type = "button";
      button.className = filter === type ? "active" : "";
      button.ariaPressed = String(filter === type);
      button.textContent = `${localization.source(QA_TYPE_LABELS.get(type) || type)} ${count}`;
      button.addEventListener("click", () => {
        filter = filter === type ? "" : type;
        render(type);
      });
      if (focusFilter === type) nextFocus = button;
      summaryWrap.append(button);
    }
    if (qaIsIncomplete(qaChecks)) {
      const notice = dom.createElement("p");
      notice.textContent = localization.source("Required Exchange checks: Not evaluated.");
      fragment.append(notice);
    }
    fragment.append(summaryWrap);
    checks.slice(0, 100).forEach((check) => {
      const card = dom.createElement("article");
      card.className = "qa-card";
      const hint = fixHint(check);
      replaceSafeHtml(
        card,
        `<header><strong>${escapeHtml(message(check))}</strong><span class="severity-pill ${escapeHtml(check.severity || "info")}">${escapeHtml(localization.source(check.severity || "info"))}</span></header>${hint ? `<p class="muted">${escapeHtml(hint)}</p>` : ""}`
      );
      const button = dom.createElement("button");
      button.type = "button";
      button.textContent = localization.source("Go to segment {value1}", { value1: check.label });
      button.addEventListener("click", async () => {
        const index = session.getSegments().findIndex((segment) => segment.id === check.segmentId);
        if (index !== -1) {
          await navigation.select(index);
          presentation.renderSegments();
          focus.target();
        }
      });
      card.append(button);
      fragment.append(card);
    });
    root.replaceChildren(fragment);
    nextFocus?.focus?.({ preventScroll: true });
  }

  return Object.freeze({ clear, fixHint, message, render, summary });
}
