/**
 * Owns revision-reason localization and active-segment target-history
 * presentation. History mutation, render scheduling, localization, status/date
 * policy, escaping, and trusted-HTML enforcement remain injected boundaries.
 *
 * @param {{
 *   list?: {
 *     textContent: string,
 *     classList: { add: (name: string) => unknown, remove: (name: string) => unknown }
 *   } | null,
 *   getSegment: () => any,
 *   localization: { source: (text: string) => string, labelHtml: (key: string) => string },
 *   statusLabel: (status: string) => string,
 *   formatDateTime: (value: unknown) => string,
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => unknown
 * }} options
 */
export function createRevisionHistoryPresentationService(options) {
  const list = options?.list;
  const getSegment = options?.getSegment;
  const localization = options?.localization;
  const statusLabel = options?.statusLabel;
  const formatDateTime = options?.formatDateTime;
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  if (
    typeof getSegment !== "function" ||
    typeof localization?.source !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof statusLabel !== "function" ||
    typeof formatDateTime !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof replaceSafeHtml !== "function"
  ) {
    throw new TypeError(
      "RevisionHistoryPresentationService requires selection, localization, status, date, escaping, and safe-HTML boundaries."
    );
  }
  if (list != null && (typeof list.classList?.add !== "function" || typeof list.classList?.remove !== "function")) {
    throw new TypeError("RevisionHistoryPresentationService requires a checked optional history list.");
  }

  function reasonLabel(reason) {
    const label =
      {
        edit: "Edit",
        replace: "Replace",
        confirm: "Confirm",
        pretranslate: "Pretranslate",
        "insert-target": "Insert",
        "copy-source": "Copy source",
        "insert-tag": "Insert tag",
        "ai-suggestion": "AI suggestion",
        split: "Split",
        merge: "Merge"
      }[reason] ||
      reason ||
      "Change";
    return localization.source(label);
  }

  function render() {
    if (!list) return;
    const segment = getSegment();
    if (!segment) {
      list.textContent = localization.source("No active segment.");
      list.classList.add("muted");
      return;
    }
    const history = Array.isArray(segment.targetHistory) ? segment.targetHistory.slice().reverse() : [];
    if (!history.length) {
      list.textContent = localization.source("No target revisions yet.");
      list.classList.add("muted");
      return;
    }
    list.classList.remove("muted");
    replaceSafeHtml(
      list,
      history
        .slice(0, 8)
        .map(
          (entry) => `
    <article class="revision-card">
      <header><strong>${escapeHtml(reasonLabel(entry.reason))}</strong><span>${escapeHtml(formatDateTime(entry.updatedAt || entry.createdAt))}</span></header>
      <div class="revision-status">${escapeHtml(statusLabel(entry.fromStatus || "empty"))} -> ${escapeHtml(statusLabel(entry.toStatus || "empty"))}</div>
      <div class="revision-pair">
        <div><span>${localization.labelHtml("before")}</span><p>${escapeHtml(entry.fromTarget || "") || "&nbsp;"}</p></div>
        <div><span>${localization.labelHtml("after")}</span><p>${escapeHtml(entry.toTarget || "") || "&nbsp;"}</p></div>
      </div>
    </article>
  `
        )
        .join("")
    );
  }

  return Object.freeze({ reasonLabel, render });
}
