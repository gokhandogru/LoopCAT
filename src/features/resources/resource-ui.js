import { createApplicationTextSafetyService } from "../../app/application-text-safety-service.js";
import { SENSITIVE_TEXT_VALUE_PATTERN } from "../../security/sensitive-value-pattern.js";
import { replaceWithSanitizedHtml } from "../../security/safe-html.js";
import { createLanguageInputService } from "../../i18n/language-input-service.js";
import { LANGUAGE_ENTRIES, LANGUAGE_ALIAS_CODES } from "../../i18n/language-catalog.js";

/** Small DOM helpers shared by the resource library and the standalone editor. */
export function createResourceUi(document, i18n) {
  const textSafety = createApplicationTextSafetyService({
    patterns: { sensitiveValue: SENSITIVE_TEXT_VALUE_PATTERN }
  });
  const safeMetadata = textSafety.displaySafeText;
  const t = (text, values) => i18n?.source?.(text, values) || text;
  const languageInput = createLanguageInputService({
    entries: LANGUAGE_ENTRIES,
    aliases: LANGUAGE_ALIAS_CODES,
    redact: textSafety.redactSensitiveText,
    localization: { source: t },
    getLocale: () => i18n?.getLocale?.() || "en-US",
    getNavigatorLanguage: () => document.defaultView?.navigator?.language || "en",
    intl: Intl,
    datalists: { labels: document.getElementById("languageOptions") },
    escapeHtml: textSafety.escapeHtml,
    replaceSafeHtml: replaceWithSanitizedHtml
  });
  function node(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2), value);
      else if (key === "value") element.value = value;
      else element.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false) element.append(child);
    }
    return element;
  }
  const button = (label, action, attributes = {}) =>
    node("button", { type: "button", onclick: action, ...attributes }, t(label));
  function select(label, choices, value = "", { literalChoices = false } = {}) {
    const control = node("select", { "aria-label": t(label) });
    for (const choice of choices) {
      const [key, text] = Array.isArray(choice) ? choice : [choice, choice];
      control.append(node("option", { value: key, "data-i18n-skip": literalChoices }, literalChoices ? text : t(text)));
    }
    control.value = value;
    return control;
  }
  const field = (label, control) => node("label", { className: "resource-field" }, node("span", {}, t(label)), control);
  function dialog(title, content, actions = []) {
    const id = `resource-dialog-${Math.random().toString(36).slice(2)}`;
    const element = node("dialog", { className: "resource-dialog", "aria-labelledby": id });
    const close = () => {
      const request = new document.defaultView.CustomEvent("resource-request-close", { cancelable: true });
      if (element.dispatchEvent(request)) element.close();
    };
    element.append(
      node("header", {}, node("h2", { id }, t(title)), button("Close", close, { "aria-label": t("Close dialog") }))
    );
    element.append(node("div", { className: "resource-dialog-body" }, content));
    if (actions.length) element.append(node("footer", {}, actions));
    element.addEventListener("close", () => element.remove(), { once: true });
    document.body.append(element);
    element.showModal();
    return element;
  }
  function choose(title, message, choices) {
    return new Promise((resolve) => {
      let result = null;
      const element = dialog(
        title,
        node("p", {}, t(message)),
        choices.map(({ label, value, primary }) =>
          button(
            label,
            () => {
              result = value;
              element.close();
            },
            { className: primary ? "primary" : "" }
          )
        )
      );
      element.addEventListener("close", () => resolve(result), { once: true });
    });
  }
  function download({ filename, content, mimeType }) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = node("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function textPreview(text, query = "", { raw = false, language = "", caseSensitive = false } = {}) {
    const output = node("span", { className: "resource-preview", dir: "auto", lang: language, "data-i18n-skip": true });
    const parts = raw ? [String(text || "")] : String(text || "").split(/(<[^>]+>|\{\{[^}]+\}\}|\{\d+\})/g);
    for (const part of parts) {
      if (!raw && /^(<[^>]+>|\{\{[^}]+\}\}|\{\d+\})$/.test(part)) {
        output.append(node("span", { className: "resource-tag", title: part }, part));
        continue;
      }
      const fold = (value) => {
        try {
          return caseSensitive ? value : value.toLocaleLowerCase(language || undefined);
        } catch {
          return caseSensitive ? value : value.toLowerCase();
        }
      };
      const haystack = fold(part);
      const needle = fold(query);
      let from = 0;
      let at = needle ? haystack.indexOf(needle) : -1;
      while (at >= 0) {
        output.append(part.slice(from, at), node("mark", {}, part.slice(at, at + query.length)));
        from = at + query.length;
        at = haystack.indexOf(needle, from);
      }
      output.append(part.slice(from));
    }
    return output;
  }
  return { t, node, button, select, field, dialog, choose, download, textPreview, safeMetadata, languageInput };
}
