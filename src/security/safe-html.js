const FORBIDDEN_ELEMENTS = "script,style,iframe,object,embed,link,meta,base,form,svg,math";
const SAFE_ATTRIBUTES = new Set([
  "class",
  "id",
  "role",
  "title",
  "type",
  "value",
  "name",
  "placeholder",
  "for",
  "tabindex",
  "open",
  "disabled",
  "checked",
  "selected",
  "min",
  "max",
  "step",
  "colspan",
  "rowspan"
]);

let trustedPolicy = null;

function localScriptUrl(value) {
  const text = String(value || "").trim();
  const url = new URL(text, globalThis.location?.href || "https://loopcat.invalid/");
  const currentOrigin = globalThis.location?.origin;
  if (!currentOrigin && /^(?:[a-z]+:|\/\/)/i.test(text)) {
    throw new TypeError("LoopCAT script URLs must be relative when no app origin is available.");
  }
  if (currentOrigin && url.origin !== currentOrigin)
    throw new TypeError("LoopCAT script URLs must stay on the app origin.");
  if (!/\/(?:service-worker|cat-worker)\.js$/i.test(url.pathname)) {
    throw new TypeError("LoopCAT rejected an unrecognized executable asset URL.");
  }
  return text;
}

function policy() {
  if (trustedPolicy || !globalThis.trustedTypes?.createPolicy) return trustedPolicy;
  trustedPolicy = globalThis.trustedTypes.createPolicy("loopcat-sanitized-ui", {
    createHTML(value) {
      return String(value || "");
    },
    createScriptURL(value) {
      return localScriptUrl(value);
    }
  });
  return trustedPolicy;
}

export function asTrustedHtml(value) {
  return policy()?.createHTML(String(value || "")) || String(value || "");
}

export function asTrustedScriptUrl(value) {
  const safe = localScriptUrl(value);
  return policy()?.createScriptURL(safe) || safe;
}

function safeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("#") || text.startsWith("./") || text.startsWith("../") || text.startsWith("/")) return text;
  try {
    const url = new URL(text, globalThis.location?.href || "https://loopcat.invalid/");
    return ["https:", "mailto:", "blob:", "data:"].includes(url.protocol) ? text : "";
  } catch {
    return "";
  }
}

function sanitizeElement(element) {
  for (const attribute of Array.from(element.attributes || [])) {
    const name = attribute.name.toLocaleLowerCase("en-US");
    if (name.startsWith("on") || name === "style" || name === "srcdoc") {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === "href" || name === "src") {
      const value = safeUrl(attribute.value);
      if (value) element.setAttribute(attribute.name, value);
      else element.removeAttribute(attribute.name);
      continue;
    }
    if (!SAFE_ATTRIBUTES.has(name) && !name.startsWith("aria-") && !name.startsWith("data-")) {
      element.removeAttribute(attribute.name);
    }
  }
}

export function sanitizedFragment(html, documentRef = document) {
  const parser = new DOMParser();
  const source = asTrustedHtml(html);
  const parsed = parser.parseFromString(source, "text/html");
  parsed.querySelectorAll(FORBIDDEN_ELEMENTS).forEach((element) => element.remove());
  parsed.body.querySelectorAll("*").forEach(sanitizeElement);
  const fragment = documentRef.createDocumentFragment();
  for (const child of Array.from(parsed.body.childNodes)) fragment.append(documentRef.importNode(child, true));
  return fragment;
}

export function replaceWithSanitizedHtml(element, html) {
  if (!element) return null;
  element.replaceChildren(sanitizedFragment(html, element.ownerDocument || document));
  return element;
}
