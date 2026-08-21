/**
 * Owns protected-tag and terminology DOM composition inside segment rows.
 * Segment state, term matching, selection, target mutation, and row lifecycle
 * remain behind injected application boundaries.
 *
 * @param {{
 *   document: { createElement: (name: string) => any, createTextNode: (text: string) => any },
 *   protectedTags: {
 *     displayText: (tag: any) => string,
 *     sourceTags: (segment: any) => any[],
 *     targetTags: (segment: any) => any[]
 *   },
 *   terms: {
 *     ranges: (text: string, terms: any[]) => any[],
 *     getProjectTerms: () => any[]
 *   },
 *   navigation: { select: (index: number) => Promise<any> },
 *   targetProducer: { insertProtectedTag: (text: string) => any }
 * }} options
 */
export function createSegmentMarkupPresentationService(options) {
  const ownerDocument = options?.document;
  const protectedTags = options?.protectedTags;
  const terms = options?.terms;
  const navigation = options?.navigation;
  const targetProducer = options?.targetProducer;

  if (
    typeof ownerDocument?.createElement !== "function" ||
    typeof ownerDocument?.createTextNode !== "function" ||
    typeof protectedTags?.displayText !== "function" ||
    typeof protectedTags?.sourceTags !== "function" ||
    typeof protectedTags?.targetTags !== "function" ||
    typeof terms?.ranges !== "function" ||
    typeof terms?.getProjectTerms !== "function" ||
    typeof navigation?.select !== "function" ||
    typeof targetProducer?.insertProtectedTag !== "function"
  ) {
    throw new TypeError(
      "SegmentMarkupPresentationService requires DOM, protected-tag, terminology, navigation, and target-producer boundaries."
    );
  }

  function insertAfterSelection(container, text, event) {
    event.stopPropagation();
    const rowIndex = Number(container.closest("tr")?.dataset.index);
    const ready = Number.isInteger(rowIndex) ? navigation.select(rowIndex) : Promise.resolve();
    ready.then(() => targetProducer.insertProtectedTag(text));
  }

  function appendTextWithTags(container, text, tags, { interactive = false } = {}) {
    const ordered = [...tags].sort((a, b) => a.index - b.index || b.text.length - a.text.length);
    let offset = 0;
    ordered.forEach((tag) => {
      const index = typeof tag.index === "number" && tag.index >= offset ? tag.index : text.indexOf(tag.text, offset);
      if (index === -1) return;
      if (index > offset) container.append(ownerDocument.createTextNode(text.slice(offset, index)));
      const chip = ownerDocument.createElement(interactive ? "button" : "span");
      if (interactive) chip.type = "button";
      chip.className = `tag-chip tag-chip-${tag.type || "placeholder"}${interactive ? " tag-chip-action" : ""}`;
      chip.textContent = protectedTags.displayText(tag);
      chip.title = interactive ? `Insert protected text: ${tag.text}` : `Protected text: ${tag.text}`;
      if (interactive) {
        chip.addEventListener("click", (event) => insertAfterSelection(container, tag.text, event));
      }
      container.append(chip);
      offset = index + tag.text.length;
    });
    if (offset < text.length) container.append(ownerDocument.createTextNode(text.slice(offset)));
  }

  function sourceTagMarkers(text, tags) {
    const ordered = [...tags].sort((a, b) => a.index - b.index || b.text.length - a.text.length);
    let offset = 0;
    return ordered.flatMap((tag) => {
      const index = typeof tag.index === "number" && tag.index >= offset ? tag.index : text.indexOf(tag.text, offset);
      if (index === -1) return [];
      offset = index + tag.text.length;
      return [{ type: "tag", index, length: tag.text.length, tag }];
    });
  }

  function rangesOverlap(left, right) {
    return left.index < right.index + right.length && right.index < left.index + left.length;
  }

  function appendSource(container, segment) {
    const text = segment.source || "";
    const tagMarkers = sourceTagMarkers(text, protectedTags.sourceTags(segment));
    const termMarkers = terms
      .ranges(text, terms.getProjectTerms())
      .filter((range) => !tagMarkers.some((tagMarker) => rangesOverlap(range, tagMarker)))
      .map((range) => ({ type: "term", index: range.index, length: range.length, range }));
    const markers = /** @type {any[]} */ (
      [...tagMarkers, ...termMarkers].sort((left, right) => left.index - right.index || (left.type === "tag" ? -1 : 1))
    );
    let offset = 0;
    markers.forEach((marker) => {
      if (marker.index < offset) return;
      if (marker.index > offset) container.append(ownerDocument.createTextNode(text.slice(offset, marker.index)));
      if (marker.type === "tag") {
        const chip = ownerDocument.createElement("button");
        chip.type = "button";
        chip.className = `tag-chip tag-chip-${marker.tag.type || "placeholder"} tag-chip-action`;
        chip.textContent = protectedTags.displayText(marker.tag);
        chip.title = `Insert protected text: ${marker.tag.text}`;
        chip.addEventListener("click", (event) => insertAfterSelection(container, marker.tag.text, event));
        container.append(chip);
      } else {
        const mark = ownerDocument.createElement("mark");
        mark.className = "term-highlight";
        mark.textContent = text.slice(marker.index, marker.index + marker.length);
        mark.title = `Termbase: ${marker.range.term.sourceTerm} -> ${marker.range.term.targetTerm}`;
        container.append(mark);
      }
      offset = marker.index + marker.length;
    });
    if (offset < text.length) container.append(ownerDocument.createTextNode(text.slice(offset)));
  }

  function renderTagTray(row, segment) {
    const tags = protectedTags.sourceTags(segment);
    if (!tags.length) return;
    const tray = ownerDocument.createElement("div");
    tray.className = "tag-tray";
    tags.forEach((tag) => {
      const chip = ownerDocument.createElement("button");
      chip.type = "button";
      chip.className = `tag-chip tag-chip-${tag.type || "placeholder"} tag-chip-action`;
      chip.textContent = protectedTags.displayText(tag);
      chip.title = `Insert protected text: ${tag.text}`;
      chip.addEventListener("click", () => targetProducer.insertProtectedTag(tag.text));
      tray.append(chip);
    });
    const targetCell = row.querySelector(".target-cell");
    targetCell.append(tray);
  }

  function renderTargetPreview(row, segment) {
    const preview = row.querySelector(".target-tag-preview");
    const targetCell = row.querySelector(".target-cell");
    if (!preview) return;
    const tags = protectedTags.targetTags(segment);
    preview.textContent = "";
    targetCell?.classList.toggle("has-target-preview", Boolean(tags.length));
    preview.classList.toggle("hidden", !tags.length);
    if (!tags.length) return;
    appendTextWithTags(preview, segment.target || "", tags);
    preview.onclick = () => {
      targetCell?.classList.add("editing");
      row.querySelector("textarea")?.focus();
    };
  }

  return Object.freeze({ appendSource, renderTagTray, renderTargetPreview });
}
