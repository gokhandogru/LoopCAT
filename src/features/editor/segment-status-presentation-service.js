/**
 * Owns the dynamic status, review, comment, protected-tag, TM, and AI badges
 * inside a segment row. Segment state and all label/provenance policy remain
 * behind injected read-only boundaries.
 *
 * @param {{
 *   document: { createElement: (name: string) => any },
 *   labels: { status: (value: any) => string, review: (value: any) => string },
 *   protectedTags: {
 *     hasIssue: (segment: any) => boolean,
 *     missing: (segment: any) => any[],
 *     displayText: (tag: any) => string
 *   },
 *   provenance: {
 *     hasTmPretranslation: (segment: any) => boolean,
 *     tmBadge: (segment: any) => { className: string, text: string, title: string },
 *     hasAiDraft: (segment: any) => boolean,
 *     aiBadge: (segment: any) => { className: string, text: string, title: string },
 *     hasAiSuggestions: (segment: any) => boolean,
 *     aiRiskLevel: (segment: any) => string | null
 *   },
 *   localization: {
 *     label: (key: string, values?: Record<string, unknown>) => string,
 *     source: (text: string, values?: Record<string, unknown>) => string
 *   },
 *   quality: { aiReviewRisk: (riskLevel: string) => string }
 * }} options
 */
export function createSegmentStatusPresentationService(options) {
  const ownerDocument = options?.document;
  const labels = options?.labels;
  const protectedTags = options?.protectedTags;
  const provenance = options?.provenance;
  const localization = options?.localization;
  const quality = options?.quality;

  if (
    typeof ownerDocument?.createElement !== "function" ||
    typeof labels?.status !== "function" ||
    typeof labels?.review !== "function" ||
    typeof protectedTags?.hasIssue !== "function" ||
    typeof protectedTags?.missing !== "function" ||
    typeof protectedTags?.displayText !== "function" ||
    typeof provenance?.hasTmPretranslation !== "function" ||
    typeof provenance?.tmBadge !== "function" ||
    typeof provenance?.hasAiDraft !== "function" ||
    typeof provenance?.aiBadge !== "function" ||
    typeof provenance?.hasAiSuggestions !== "function" ||
    typeof provenance?.aiRiskLevel !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.source !== "function" ||
    typeof quality?.aiReviewRisk !== "function"
  ) {
    throw new TypeError(
      "SegmentStatusPresentationService requires DOM, label, protected-tag, provenance, localization, and quality boundaries."
    );
  }

  function render(row, segment) {
    const statusCell = row.querySelector(".status-col");
    const pill = row.querySelector(".status-pill");
    pill.className = `status-pill ${segment.status}`;
    pill.textContent = labels.status(segment.status);
    statusCell
      .querySelectorAll(".tag-warning, .review-pill, .comment-marker, .tm-match-badge, .ai-segment-badge")
      .forEach((item) => item.remove());
    if (provenance.hasTmPretranslation(segment)) {
      const item = provenance.tmBadge(segment);
      const badge = ownerDocument.createElement("div");
      badge.className = `tm-match-badge ${item.className}`;
      badge.textContent = item.text;
      badge.title = item.title;
      statusCell.append(badge);
    }
    if (protectedTags.hasIssue(segment)) {
      const warning = ownerDocument.createElement("div");
      warning.className = "tag-warning";
      warning.textContent = localization.label("missingValue", {
        value: protectedTags.missing(segment).map(protectedTags.displayText).join(", ")
      });
      statusCell.append(warning);
    }
    if (segment.reviewState) {
      const review = ownerDocument.createElement("div");
      review.className = `review-pill ${segment.reviewState}`;
      review.textContent = labels.review(segment.reviewState);
      statusCell.append(review);
    }
    const commentCount = (segment.comments || []).length + ((segment.reviewNote || "").trim() ? 1 : 0);
    if (commentCount) {
      const marker = ownerDocument.createElement("div");
      marker.className = "comment-marker";
      marker.textContent = localization.label("noteCount", { count: commentCount });
      statusCell.append(marker);
    }
    const aiBadges = [];
    if (provenance.hasAiDraft(segment)) {
      aiBadges.push(provenance.aiBadge(segment));
    }
    if (provenance.hasAiSuggestions(segment)) {
      aiBadges.push({
        className: "ai-suggestion",
        text: localization.label("aiSuggestionCount", { count: segment.aiSuggestions.length }),
        title: localization.source("Reviewable AI suggestions are available for this segment")
      });
    }
    const riskLevel = provenance.aiRiskLevel(segment);
    if (riskLevel) {
      aiBadges.push({
        className: `ai-risk ai-risk-${riskLevel}`,
        text: `${quality.aiReviewRisk(riskLevel)}`,
        title: localization.source("Risk-ranked AI review comment")
      });
    }
    aiBadges.forEach((item) => {
      const badge = ownerDocument.createElement("div");
      badge.className = `ai-segment-badge ${item.className}`;
      badge.textContent = item.text;
      badge.title = item.title;
      statusCell.append(badge);
    });
  }

  return Object.freeze({ render });
}
