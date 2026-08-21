const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const i18nDir = path.join(root, "i18n");
const sourcePath = path.join(i18nDir, "source.en-US.json");
const localeDir = path.join(i18nDir, "locales");
const indexPath = path.join(root, "index.html");
const appPath = path.join(root, "app.js");
const applicationValidationPresentationControllerPath = path.join(
  root,
  "src",
  "app",
  "application-validation-presentation-controller.js"
);
const applicationSaveStatusControllerPath = path.join(root, "src", "app", "application-save-status-controller.js");
const focusModeControllerPath = path.join(root, "src", "features", "editor", "focus-mode-controller.js");
const editorShellPresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "editor",
  "editor-shell-presentation-controller.js"
);
const documentFilterPresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "editor",
  "document-filter-presentation-controller.js"
);
const projectAnalysisControllerPath = path.join(root, "src", "features", "projects", "project-analysis-controller.js");
const projectListPresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-list-presentation-controller.js"
);
const projectHomePresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "project-home-presentation-controller.js"
);
const languagePairFilterPresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "language-pair-filter-presentation-controller.js"
);
const projectsViewPresentationControllerPath = path.join(
  root,
  "src",
  "features",
  "projects",
  "projects-view-presentation-controller.js"
);
const segmentStatusPresentationServicePath = path.join(
  root,
  "src",
  "features",
  "editor",
  "segment-status-presentation-service.js"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function placeholderSet(message) {
  const set = new Set();
  String(message || "").replace(/\{([\w.-]+)(?:\s*,[^}]*)?\}/g, (_, name) => {
    set.add(name);
    return "";
  });
  return set;
}

function samePlaceholders(source, target) {
  const sourceSet = placeholderSet(source);
  const targetSet = placeholderSet(target);
  return {
    missing: [...sourceSet].filter((key) => !targetSet.has(key)),
    extra: [...targetSet].filter((key) => !sourceSet.has(key))
  };
}

function collectDataKeys(html) {
  const keys = [];
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) keys.push(match[1]);
  return keys;
}

function collectCodeKeys(js) {
  const keys = [];
  for (const match of js.matchAll(
    /\b(?:t|uiT|uiLocalizationService\.translate|localization\.translate)\(\s*["']([^"']+)["']/g
  )) {
    keys.push(match[1]);
  }
  for (const match of js.matchAll(
    /\b(?:uiLabel(?:Html)?|uiLocalizationService\.label(?:Html)?|localization\.label(?:Html)?)\(\s*["']([^"']+)["']/g
  )) {
    keys.push(`ui.label.${match[1]}`);
  }
  return keys;
}

function validate() {
  const errors = [];
  const source = readJson(sourcePath);
  const sourceMessages = source.messages || {};
  Object.entries(sourceMessages).forEach(([key, entry]) => {
    if (!entry?.message) errors.push(`Source key ${key} has no message.`);
  });

  if (fs.existsSync(localeDir)) {
    fs.readdirSync(localeDir)
      .filter((name) => name.endsWith(".json"))
      .forEach((name) => {
        const localePath = path.join(localeDir, name);
        const locale = readJson(localePath);
        const messages = locale.messages || {};
        Object.keys(sourceMessages).forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(messages, key)) {
            errors.push(`${name} is missing key ${key}.`);
            return;
          }
          const target = messages[key];
          if (locale.locale !== source.locale && !String(target || "").trim()) return;
          const placeholders = samePlaceholders(sourceMessages[key].message, target);
          placeholders.missing.forEach((placeholder) =>
            errors.push(`${name}:${key} is missing placeholder {${placeholder}}.`)
          );
          placeholders.extra.forEach((placeholder) =>
            errors.push(`${name}:${key} has unknown placeholder {${placeholder}}.`)
          );
        });
        Object.keys(messages).forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(sourceMessages, key)) errors.push(`${name} has extra key ${key}.`);
        });
      });
  }

  const referencedKeys = [
    ...collectDataKeys(fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : ""),
    ...collectCodeKeys(fs.existsSync(appPath) ? fs.readFileSync(appPath, "utf8") : ""),
    ...collectCodeKeys(
      fs.existsSync(applicationValidationPresentationControllerPath)
        ? fs.readFileSync(applicationValidationPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(applicationSaveStatusControllerPath)
        ? fs.readFileSync(applicationSaveStatusControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(fs.existsSync(focusModeControllerPath) ? fs.readFileSync(focusModeControllerPath, "utf8") : ""),
    ...collectCodeKeys(
      fs.existsSync(editorShellPresentationControllerPath)
        ? fs.readFileSync(editorShellPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(documentFilterPresentationControllerPath)
        ? fs.readFileSync(documentFilterPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(projectAnalysisControllerPath) ? fs.readFileSync(projectAnalysisControllerPath, "utf8") : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(projectListPresentationControllerPath)
        ? fs.readFileSync(projectListPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(projectHomePresentationControllerPath)
        ? fs.readFileSync(projectHomePresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(languagePairFilterPresentationControllerPath)
        ? fs.readFileSync(languagePairFilterPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(projectsViewPresentationControllerPath)
        ? fs.readFileSync(projectsViewPresentationControllerPath, "utf8")
        : ""
    ),
    ...collectCodeKeys(
      fs.existsSync(segmentStatusPresentationServicePath)
        ? fs.readFileSync(segmentStatusPresentationServicePath, "utf8")
        : ""
    )
  ];
  referencedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(sourceMessages, key))
      errors.push(`Referenced i18n key is missing from source: ${key}`);
  });

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(
    `Validated ${Object.keys(sourceMessages).length} source messages and ${referencedKeys.length} explicit key references.`
  );
}

validate();
