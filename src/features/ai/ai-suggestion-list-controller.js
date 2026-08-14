function requireRoot(value) {
  if (!value?.replaceChildren || !value?.classList) {
    throw new TypeError("AiSuggestionListController requires a suggestion-list root.");
  }
  return value;
}

function createElement(ownerDocument, tagName, { className = "", text = "" } = {}) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

/**
 * Owns the bounded AI suggestion-list DOM and apply-intent routing. Suggestion
 * creation/storage, commands, persistence, navigation, session state,
 * workspace, and status effects remain injected application boundaries.
 *
 * @param {{
 *   root: any,
 *   getSegment: () => any,
 *   apply: (suggestionId: string, options?: { andNext?: boolean }) => unknown,
 *   source?: (text: string, values?: Record<string, unknown>) => string,
 *   label: (key: string) => string,
 *   formatDateTime: (value: any) => string
 * }} options
 */
export function createAiSuggestionListController(options) {
  const root = requireRoot(options?.root);
  const getSegment = options?.getSegment;
  const apply = options?.apply;
  const label = options?.label;
  const formatDateTime = options?.formatDateTime;
  const source =
    typeof options?.source === "function"
      ? options.source
      : (text, values = {}) =>
          String(text || "").replace(/\{([^}]+)\}/g, (match, key) =>
            Object.hasOwn(values, key) ? String(values[key] ?? "") : match
          );
  const ownerDocument = root.ownerDocument || globalThis.document;
  if (
    typeof getSegment !== "function" ||
    typeof apply !== "function" ||
    typeof label !== "function" ||
    typeof formatDateTime !== "function" ||
    !ownerDocument?.createElement ||
    !ownerDocument?.createDocumentFragment
  ) {
    throw new TypeError(
      "AiSuggestionListController requires segment, apply, localization, date-formatting, and DOM boundaries."
    );
  }

  function render() {
    const segment = getSegment();
    const suggestions = Array.isArray(segment?.aiSuggestions) ? segment.aiSuggestions : [];
    if (!suggestions.length) {
      root.textContent = source("No AI suggestions yet.");
      root.classList.add("muted");
      return;
    }

    root.classList.remove("muted");
    const fragment = ownerDocument.createDocumentFragment();
    suggestions
      .slice()
      .reverse()
      .slice(0, 4)
      .forEach((suggestion) => {
        const card = createElement(ownerDocument, "article", { className: "ai-suggestion-card" });
        const header = createElement(ownerDocument, "header");
        const provider = createElement(ownerDocument, "strong", { text: suggestion.provider || "AI" });
        const model = createElement(ownerDocument, "span", {
          text: suggestion.model || (suggestion.confidence ? `${suggestion.confidence}%` : source("review"))
        });
        header.append(provider, model);

        const provenance = createElement(ownerDocument, "p", {
          className: "ai-suggestion-provenance muted",
          text: source("{origin} suggestion · {scope} · {date}", {
            origin: suggestion.origin || suggestion.provider || "AI",
            scope: suggestion.scope || "active segment",
            date: formatDateTime(suggestion.createdAt)
          })
        });

        const inspection = createElement(ownerDocument, "details", {
          className: "ai-suggestion-inspection"
        });
        const summary = createElement(ownerDocument, "summary", { text: source("Inspect proposed change") });
        const diff = createElement(ownerDocument, "div", { className: "ai-suggestion-diff" });
        const before = createElement(ownerDocument, "div");
        before.append(
          createElement(ownerDocument, "strong", { text: source("Current target") }),
          createElement(ownerDocument, "p", { text: segment?.target || source("Empty target") })
        );
        const after = createElement(ownerDocument, "div");
        after.append(
          createElement(ownerDocument, "strong", { text: source("Suggested target") }),
          createElement(ownerDocument, "p", { text: suggestion.suggestedTarget || "" })
        );
        diff.append(before, after);
        inspection.append(summary, diff);

        const explanation = createElement(ownerDocument, "ul");
        for (const item of suggestion.explanation || []) {
          explanation.append(createElement(ownerDocument, "li", { text: item }));
        }

        const footer = createElement(ownerDocument, "footer");
        const applyButton = createElement(ownerDocument, "button", { text: label("applyToTarget") });
        applyButton.type = "button";
        applyButton.addEventListener("click", () => void apply(suggestion.id));
        const applyNextButton = createElement(ownerDocument, "button", {
          className: "primary",
          text: source("Apply and next")
        });
        applyNextButton.type = "button";
        applyNextButton.addEventListener("click", () => void apply(suggestion.id, { andNext: true }));
        footer.append(applyButton, applyNextButton);
        card.append(header, provenance, inspection, explanation, footer);
        fragment.append(card);
      });
    root.replaceChildren(fragment);
  }

  return Object.freeze({ render });
}
