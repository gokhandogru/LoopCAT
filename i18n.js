(() => {
  const DEFAULT_LOCALE = "en-US";
  const STORAGE_KEY = "loopcat.uiLocale";
  const CUSTOM_STORAGE_PREFIX = "loopcat.uiLocale.custom.";
  const SOURCE_LOCALE = "en-US";
  const RTL_LANGUAGE_PATTERN = /^(ar|arc|ckb|dv|fa|he|iw|ks|ku-Arab|nqo|ps|sd|syr|ug|ur|yi)(-|$)/i;
  const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "label"];
  const SKIP_SELECTOR = [
    "script",
    "style",
    "template",
    "textarea",
    "input",
    "datalist",
    "[contenteditable]",
    "[data-i18n-skip]",
    ".source-cell",
    ".target-cell",
    ".target-tag-preview",
    ".project-card h3",
    ".project-tile h3",
    ".file-card h3",
    ".resource-card h3",
    ".match-card p",
    ".term-card p",
    ".term-card header",
    ".revision-pair p",
    ".comment-list",
    ".ai-suggestion-list",
    ".local-ai-provider-summary-head > span",
    "#localAiPromptOutput",
    "#localAiPromptPreview",
    "#concordanceResults p"
  ].join(",");

  const sourceMessages = new Map();
  const sourceTextKeys = new Map();
  const locales = new Map();
  const nodeSources = new WeakMap();
  const attrSources = new WeakMap();
  let currentLocale = DEFAULT_LOCALE;
  let observer = null;
  let observerQueued = false;

  function storage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  function normalizeLocale(locale) {
    return String(locale || "").trim() || DEFAULT_LOCALE;
  }

  function localeFallbacks(locale) {
    const normalized = normalizeLocale(locale);
    const parts = normalized.split("-");
    const fallbacks = [normalized];
    while (parts.length > 1) {
      parts.pop();
      fallbacks.push(parts.join("-"));
    }
    if (!fallbacks.includes(DEFAULT_LOCALE)) fallbacks.push(DEFAULT_LOCALE);
    return fallbacks;
  }

  function localeDir(locale) {
    return RTL_LANGUAGE_PATTERN.test(normalizeLocale(locale)) ? "rtl" : "ltr";
  }

  function localeName(locale) {
    try {
      return new Intl.DisplayNames([currentLocale, DEFAULT_LOCALE], { type: "language" }).of(locale) || locale;
    } catch {
      return locale;
    }
  }

  function normalizeSourceEntry(entry) {
    if (typeof entry === "string") return { message: entry, description: "" };
    return {
      message: String(entry?.message || ""),
      description: String(entry?.description || ""),
      locations: Array.isArray(entry?.locations) ? entry.locations : [],
      localizeValues: Array.isArray(entry?.localizeValues) ? entry.localizeValues : []
    };
  }

  function normalizeLocaleMessages(messages = {}) {
    return Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value?.message || "")
      ])
    );
  }

  function registerSource(catalog = {}) {
    templateCache.clear();
    orderedTemplates = null;
    const messages = catalog.messages || catalog;
    Object.entries(messages || {}).forEach(([key, entry]) => {
      const normalized = normalizeSourceEntry(entry);
      if (!key || !normalized.message) return;
      sourceMessages.set(key, normalized);
      if (!sourceTextKeys.has(normalized.message)) sourceTextKeys.set(normalized.message, key);
    });
  }

  function registerLocale(catalog = {}) {
    const locale = normalizeLocale(catalog.locale || catalog.lang || catalog.id);
    const messages = normalizeLocaleMessages(catalog.messages || {});
    const meta = {
      locale,
      label: catalog.label || catalog.nativeName || catalog.name || localeName(locale),
      dir: catalog.dir || localeDir(locale),
      custom: Boolean(catalog.custom)
    };
    locales.set(locale, { ...meta, messages });
    return locale;
  }

  function sourceEntry(key) {
    return sourceMessages.get(key) || null;
  }

  function localeMessage(key, locale = currentLocale) {
    for (const candidate of localeFallbacks(locale)) {
      const found = locales.get(candidate)?.messages?.[key];
      if (typeof found === "string" && found) return found;
    }
    return sourceEntry(key)?.message || key;
  }

  function readBalancedBlock(text, openIndex) {
    let depth = 0;
    for (let index = openIndex; index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") {
        depth -= 1;
        if (depth === 0) return { body: text.slice(openIndex + 1, index), end: index + 1 };
      }
    }
    return null;
  }

  function parsePluralOptions(body) {
    const firstComma = body.indexOf(",");
    if (firstComma === -1) return null;
    const variable = body.slice(0, firstComma).trim();
    const rest = body.slice(firstComma + 1).trim();
    const kind = rest.match(/^(plural|select)\s*,/)?.[1];
    if (!kind) return null;
    let cursor = kind.length;
    while (/\s/.test(rest[cursor] || "")) cursor += 1;
    if (rest[cursor] === ",") cursor += 1;
    const options = {};
    while (cursor < rest.length) {
      while (/\s/.test(rest[cursor] || "")) cursor += 1;
      const selectorMatch = rest.slice(cursor).match(/^(=\d+|\w+)/);
      if (!selectorMatch) break;
      const selector = selectorMatch[1];
      cursor += selector.length;
      while (/\s/.test(rest[cursor] || "")) cursor += 1;
      if (rest[cursor] !== "{") break;
      const block = readBalancedBlock(rest, cursor);
      if (!block) break;
      options[selector] = block.body;
      cursor = block.end;
    }
    return variable && Object.keys(options).length ? { variable, options, kind } : null;
  }

  function formatPlural(body, values) {
    const parsed = parsePluralOptions(body);
    if (!parsed) return `{${body}}`;
    if (parsed.kind === "select") {
      return formatMessage(parsed.options[String(values?.[parsed.variable])] ?? parsed.options.other ?? "", values);
    }
    const rawValue = Number(values?.[parsed.variable] ?? 0);
    const exact = parsed.options[`=${rawValue}`];
    let selector = "other";
    if (exact == null) {
      try {
        selector = new Intl.PluralRules(currentLocale).select(rawValue);
      } catch {
        selector = rawValue === 1 ? "one" : "other";
      }
    }
    const template = exact ?? parsed.options[selector] ?? parsed.options.other ?? "";
    return formatMessage(template.replaceAll("#", new Intl.NumberFormat(currentLocale).format(rawValue)), values);
  }

  function formatMessage(message, values = {}) {
    let output = String(message || "");
    for (let index = output.indexOf("{"); index !== -1; index = output.indexOf("{", index + 1)) {
      const block = readBalancedBlock(output, index);
      if (!block) break;
      if (/^\s*[\w.-]+\s*,\s*(?:plural|select)\s*,/.test(block.body)) {
        const replacement = formatPlural(block.body, values);
        output = `${output.slice(0, index)}${replacement}${output.slice(block.end)}`;
        index += replacement.length - 1;
      }
    }
    return output.replace(/\{([\w.-]+)\}/g, (match, key) => {
      const value = values?.[key];
      return value == null ? match : String(value);
    });
  }

  function t(key, values = {}, depth = 0) {
    const args = { ...values };
    if (depth < 4 && currentLocale !== DEFAULT_LOCALE) {
      for (const name of sourceEntry(key)?.localizeValues || []) {
        if (typeof args[name] === "string") args[name] = source(args[name], {}, depth + 1);
      }
    }
    return formatMessage(localeMessage(key), args);
  }

  function templateRegexForMessage(message) {
    const names = [];
    const numeric = new Set(
      Array.from(
        String(message).matchAll(
          /\{([\w.-]+)\}\s*(?:%|(?:segment|term|termbase|resource|file|project|package|suggestion|comment|note|issue|match|model|result|candidate|save|day|entr|activit|TM|TB)\b)/g
        ),
        (match) => match[1]
      )
    );
    const inflections = new Set(
      Array.from(
        String(message).matchAll(
          /\b(?:segment|term|termbase|resource|file|project|package|suggestion|comment|note|issue|match|model|result|candidate|save|day|need|TM|TB)\{([\w.-]+)\}/g
        ),
        (match) => match[1]
      )
    );
    const entries = new Set(Array.from(String(message).matchAll(/\bentr\{([\w.-]+)\}/g), (match) => match[1]));
    const pattern = String(message || "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{([\w.-]+)\\\}/g, (_, name) => {
        names.push(name);
        return inflections.has(name)
          ? "(s?)"
          : entries.has(name)
            ? "(y|ies)"
            : numeric.has(name)
              ? "(\\d+(?:[.,]\\d+)?)"
              : "([\\s\\S]*?)";
      });
    return names.length ? { regex: new RegExp(`^${pattern}$`, "u"), names } : null;
  }

  const templateCache = new Map();
  let orderedTemplates = null;

  function sourceTemplateMatch(text) {
    const value = String(text || "");
    if (!orderedTemplates) {
      orderedTemplates = Array.from(sourceMessages.entries())
        .filter(
          ([, entry]) =>
            entry.message.includes("{") &&
            !entry.message.includes("${") &&
            !entry.message.startsWith("{name}") &&
            !/^\{[\w.-]+\}\s+(?:and|or)\s+\{/.test(entry.message) &&
            !/<\/?[a-z]/i.test(entry.message) &&
            (entry.localizeValues?.length || /[A-Za-z]{2}/.test(entry.message.replace(/\{[\w.-]+\}/g, ""))) &&
            !/\{[^}]+,\s*(plural|select),/.test(entry.message)
        )
        .sort((a, b) => b[1].message.replace(/\{[^}]+\}/g, "").length - a[1].message.replace(/\{[^}]+\}/g, "").length);
    }
    for (const [key, entry] of orderedTemplates) {
      if (!templateCache.has(key)) templateCache.set(key, templateRegexForMessage(entry.message));
      const compiled = templateCache.get(key);
      if (!compiled) continue;
      const match = value.match(compiled.regex);
      if (!match) continue;
      const values = {};
      compiled.names.forEach((name, index) => {
        values[name] = match[index + 1];
      });
      return { key, values };
    }
    return null;
  }

  function source(text, values = {}, depth = 0) {
    const value = String(text || "");
    const key = sourceTextKeys.get(value) || sourceTextKeys.get(value.replace(/\s+/g, " ").trim());
    if (key) return t(key, values, depth);
    const matched = sourceTemplateMatch(value);
    if (matched) return t(matched.key, { ...matched.values, ...values }, depth);
    return formatMessage(value, values);
  }

  function shouldSkipNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest?.(SKIP_SELECTOR));
  }

  function localizeTextNode(node) {
    if (!node?.nodeValue || shouldSkipNode(node)) return;
    const previous = nodeSources.get(node);
    const original = previous && node.nodeValue === previous.translated ? previous.source : node.nodeValue;
    const trimmed = original.replace(/\s+/g, " ").trim();
    if (!trimmed || (!sourceTextKeys.has(trimmed) && !sourceTemplateMatch(trimmed))) return;
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    const next = `${leading}${source(trimmed)}${trailing}`;
    nodeSources.set(node, { source: original, translated: next });
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function localizeAttributes(root) {
    const elements =
      root.nodeType === Node.ELEMENT_NODE
        ? [root, ...root.querySelectorAll("*")]
        : Array.from(root.querySelectorAll?.("*") || []);
    elements.forEach((element) => {
      const editableUiElement = ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(element.tagName);
      if (shouldSkipNode(element) && !editableUiElement) return;
      TRANSLATABLE_ATTRIBUTES.forEach((attr) => {
        if (!element.hasAttribute(attr)) return;
        let sources = attrSources.get(element);
        if (!sources) {
          sources = {};
          attrSources.set(element, sources);
        }
        const current = element.getAttribute(attr) || "";
        const previous = sources[attr];
        const original = previous && current === previous.translated ? previous.source : current;
        if (!sourceTextKeys.has(original) && !sourceTemplateMatch(original)) return;
        const next = source(original);
        sources[attr] = { source: original, translated: next };
        if (element.getAttribute(attr) !== next) element.setAttribute(attr, next);
      });
    });
  }

  function localizeManualKeys(root = document) {
    root.querySelectorAll?.("[data-i18n]").forEach((element) => {
      if (shouldSkipNode(element)) return;
      const next = t(element.dataset.i18n);
      if (element.textContent !== next) element.textContent = next;
    });
    TRANSLATABLE_ATTRIBUTES.forEach((attr) => {
      const dataAttr = `i18n${attr
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")}`;
      root
        .querySelectorAll?.(`[data-${dataAttr.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`)
        .forEach((element) => {
          const key = element.dataset[dataAttr];
          if (key) {
            const next = t(key);
            if (element.getAttribute(attr) !== next) element.setAttribute(attr, next);
          }
        });
    });
  }

  function localizeStaticDom(root = document.body || document) {
    localizeManualKeys(root);
    localizeAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(localizeTextNode);
  }

  function queueLocalize(root = document.body) {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      localizeStaticDom(root);
    });
  }

  function observe(root = document.body) {
    if (!root || observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === "childList" || mutation.type === "characterData" || mutation.type === "attributes"
        )
      ) {
        queueLocalize(root);
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
  }

  function applyLocaleMetadata(locale = currentLocale) {
    const normalized = normalizeLocale(locale);
    document.documentElement.lang = normalized;
    document.documentElement.dir = locales.get(normalized)?.dir || localeDir(normalized);
  }

  function setLocale(locale) {
    const normalized = normalizeLocale(locale);
    currentLocale = localeFallbacks(normalized).find((candidate) => locales.has(candidate)) || DEFAULT_LOCALE;
    storage()?.setItem(STORAGE_KEY, currentLocale);
    applyLocaleMetadata(currentLocale);
    document.querySelectorAll(".workspace-guide-link").forEach((link) => {
      link.setAttribute(
        "href",
        currentLocale === "ar" ? "./docs/beginner-guide/ar.html" : "./docs/beginner-guide/index.html"
      );
    });
    window.LoopCATDesktop?.setUiLocale?.(currentLocale)?.catch?.(() => {});
    localizeStaticDom(document.body || document);
    window.dispatchEvent(new CustomEvent("loopcat:localechange", { detail: { locale: currentLocale } }));
    return currentLocale;
  }

  function loadSavedLocale() {
    const saved = storage()?.getItem(STORAGE_KEY);
    const browserLocale = Array.from(navigator.languages || [navigator.language]).find(Boolean);
    return normalizeLocale(saved || browserLocale || DEFAULT_LOCALE);
  }

  function saveCustomLocale(catalog = {}) {
    const locale = registerLocale({ ...catalog, custom: true });
    storage()?.setItem(`${CUSTOM_STORAGE_PREFIX}${locale}`, JSON.stringify({ ...catalog, locale, custom: true }));
    return locale;
  }

  function loadCustomLocales() {
    const store = storage();
    if (!store) return;
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key?.startsWith(CUSTOM_STORAGE_PREFIX)) continue;
      try {
        registerLocale(JSON.parse(store.getItem(key) || "{}"));
      } catch {
        // Ignore malformed custom locale storage and let users import again.
      }
    }
  }

  function availableLocales() {
    return Array.from(locales.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  function sourceCatalogJson() {
    const messages = {};
    sourceMessages.forEach((entry, key) => {
      messages[key] = {
        message: entry.message,
        description: entry.description || "",
        ...(entry.localizeValues?.length ? { localizeValues: entry.localizeValues } : {}),
        ...(entry.locations?.length ? { locations: entry.locations } : {})
      };
    });
    return JSON.stringify({ locale: SOURCE_LOCALE, messages }, null, 2);
  }

  function init() {
    loadCustomLocales();
    setLocale(loadSavedLocale());
    observe(document.body);
  }

  window.CatHan = window.CatHan || {};
  window.CatHan.i18n = {
    DEFAULT_LOCALE,
    registerSource,
    registerLocale,
    saveCustomLocale,
    availableLocales,
    setLocale,
    getLocale: () => currentLocale,
    localeDir,
    localeName,
    t,
    source,
    formatMessage,
    localizeStaticDom,
    sourceCatalogJson,
    init
  };
})();
