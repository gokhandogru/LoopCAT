/**
 * Owns initial segment-row construction and live row presentation updates.
 * Segment state, navigation, target mutation, markup, and status policy remain
 * behind injected application boundaries.
 *
 * @param {{
 *   template: { content: { firstElementChild: { cloneNode: (deep: boolean) => any } } },
 *   body: { querySelector: (selector: string) => any },
 *   session: { getSegments: () => any[] },
 *   application: { getActiveIndex: () => number },
 *   protectedTags: { hasIssue: (segment: any) => boolean },
 *   markup: {
 *     appendSource: (container: any, segment: any) => void,
 *     renderTargetPreview: (row: any, segment: any) => void,
 *     renderTagTray: (row: any, segment: any) => void
 *   },
 *   status: { render: (row: any, segment: any) => void },
 *   localization: { source: (text: string, values?: Record<string, unknown>) => string },
 *   language: { applyTarget: (textarea: any) => void },
 *   targetEdit: { bind: (options: object) => void },
 *   navigation: { select: (index: number) => unknown }
 * }} options
 */
export function createSegmentRowPresentationService(options) {
  const template = options?.template;
  const body = options?.body;
  const session = options?.session;
  const application = options?.application;
  const protectedTags = options?.protectedTags;
  const markup = options?.markup;
  const status = options?.status;
  const localization = options?.localization;
  const language = options?.language;
  const targetEdit = options?.targetEdit;
  const navigation = options?.navigation;

  if (
    typeof template?.content?.firstElementChild?.cloneNode !== "function" ||
    typeof body?.querySelector !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof application?.getActiveIndex !== "function" ||
    typeof protectedTags?.hasIssue !== "function" ||
    typeof markup?.appendSource !== "function" ||
    typeof markup?.renderTargetPreview !== "function" ||
    typeof markup?.renderTagTray !== "function" ||
    typeof status?.render !== "function" ||
    typeof localization?.source !== "function" ||
    typeof language?.applyTarget !== "function" ||
    typeof targetEdit?.bind !== "function" ||
    typeof navigation?.select !== "function"
  ) {
    throw new TypeError(
      "SegmentRowPresentationService requires template, body, session, application, protected-tag, markup, status, localization, language, target-edit, and navigation boundaries."
    );
  }

  function create(index) {
    const segment = session.getSegments()[index];
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.index = String(index);
    row.classList.toggle("active", index === application.getActiveIndex());
    row.classList.toggle("tag-warning-row", protectedTags.hasIssue(segment));
    row.querySelector(".num-col").textContent = String(index + 1);
    const sourceCell = row.querySelector(".source-cell");
    sourceCell.textContent = "";
    sourceCell.dir = "auto";
    markup.appendSource(sourceCell, segment);
    const textarea = row.querySelector("textarea");
    textarea.dir = "auto";
    textarea.setAttribute(
      "aria-label",
      localization.source("Target translation for segment {value1}", { value1: index + 1 })
    );
    language.applyTarget(textarea);
    textarea.value = segment.target || "";
    targetEdit.bind({
      textarea,
      editingCell: row.querySelector(".target-cell"),
      index,
      segmentId: segment.id
    });
    markup.renderTargetPreview(row, segment);
    status.render(row, segment);
    markup.renderTagTray(row, segment);
    row.addEventListener("click", () => navigation.select(index));
    return row;
  }

  function update(index) {
    const row = body.querySelector(`tr[data-index="${index}"]`);
    const segment = session.getSegments()[index];
    if (!row || !segment) return;
    row.classList.toggle("active", index === application.getActiveIndex());
    row.classList.toggle("tag-warning-row", protectedTags.hasIssue(segment));
    markup.renderTargetPreview(row, segment);
    status.render(row, segment);
  }

  return Object.freeze({ create, update });
}
