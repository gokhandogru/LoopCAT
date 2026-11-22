export function createInspectorSegmentInfo({ list, empty, segmentLabels, riskLevel, dateTime, localization }) {
  const fields = Object.fromEntries(
    Array.from(list.querySelectorAll("[data-segment-info]"), (field) => [field.dataset.segmentInfo, field])
  );

  return function renderSegmentInfo({ project, segment, evidence }) {
    empty.hidden = Boolean(segment);
    list.hidden = !segment;
    if (!segment) return;
    const document = project?.documents?.find((entry) => entry.id === segment.documentId);
    fields.file.textContent = document?.name || segment.documentName || localization.label("noSourceFile");
    fields.status.textContent = segmentLabels.status(segment.status || "empty");
    fields.status.dataset.state = segment.status || "empty";
    fields.review.textContent = segmentLabels.review(segment.reviewState) || localization.source("No review state");
    fields.risk.textContent = evidence?.level ? riskLevel(evidence.level) : localization.label("notSet");
    fields.risk.dataset.state = evidence?.level || "";
    fields.updated.textContent = dateTime(segment.updatedAt || segment.createdAt) || localization.label("notSet");
  };
}
