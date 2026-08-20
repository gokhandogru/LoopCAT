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

  function clear() {
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

  function render() {
    const root = getRoot();
    const qaChecks = session.getQaChecks();
    const checks = filter ? qaChecks.filter((check) => check.type === filter) : qaChecks;
    if (!qaChecks.length) {
      root.textContent = localization.source("No QA issues found.");
      root.classList.add("muted");
      return;
    }
    root.classList.remove("muted");
    const counts = summary(qaChecks);
    const fragment = dom.createDocumentFragment();
    const summaryWrap = dom.createElement("div");
    summaryWrap.className = "qa-summary";
    const allButton = dom.createElement("button");
    allButton.type = "button";
    allButton.className = filter ? "" : "active";
    allButton.textContent = localization.source("All {value1}", { value1: qaChecks.length });
    allButton.addEventListener("click", () => {
      filter = "";
      render();
    });
    summaryWrap.append(allButton);
    Object.entries(counts)
      .filter(([type]) => !["error", "warning", "info"].includes(type))
      .forEach(([type, count]) => {
        const button = dom.createElement("button");
        button.type = "button";
        button.className = filter === type ? "active" : "";
        button.textContent = `${localization.source(type)} ${count}`;
        button.addEventListener("click", () => {
          filter = filter === type ? "" : type;
          render();
        });
        summaryWrap.append(button);
      });
    fragment.append(summaryWrap);
    checks.slice(0, 100).forEach((check) => {
      const card = dom.createElement("article");
      card.className = "qa-card";
      const hint = fixHint(check);
      replaceSafeHtml(
        card,
        `<header><strong>${escapeHtml(localization.source(check.type))}</strong><span class="severity-pill ${escapeHtml(check.severity || "info")}">${escapeHtml(localization.source(check.severity || "info"))}</span><span>#${escapeHtml(check.label)}</span></header><p>${escapeHtml(message(check))}</p>${hint ? `<p class="muted">${escapeHtml(hint)}</p>` : ""}`
      );
      const button = dom.createElement("button");
      button.type = "button";
      button.textContent = localization.label("go");
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
  }

  return Object.freeze({ clear, fixHint, message, render, summary });
}
