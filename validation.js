(() => {
  const APP_NAME = "LoopCAT";
  const LEGACY_APP_NAME = "CatHan";
  const PACKAGE_TYPE = "project-package";
  const PACKAGE_VERSION = 1;
  const MIN_SCHEMA_VERSION = 3;
  const MAX_PACKAGE_SCHEMA_VERSION = 5;
  const MAX_BACKUP_SCHEMA_VERSION = 6;
  const PACKAGE_FORMAT = "loopcat-project-package";
  const CONTRACT_VERSION = "loopcat-package-v1";
  const STORAGE_MODES = new Set(["browser-cache", "workspace-folder"]);
  const AI_API_KEY_MODES = new Set(["bring-your-own"]);
  const RESOURCE_LINK_TYPES = new Set(["tm", "termbase"]);
  const SECRET_FIELD_PATTERN = /(api[_-]?key|secret|token|authorization|bearer|password|cookie|session)/i;
  const RUNTIME_HANDLE_FIELD_PATTERN = /^(?:file|directory|browser|workspace|native|fileSystem)?[_-]?handle$/i;
  const PROVIDER_TRACE_FIELD_PATTERN =
    /^(?:responseId|requestId|prompt|promptTemplate|providerRequestId|providerResponseId|customEndpoint)$/i;
  const SENSITIVE_TEXT_VALUE_PATTERN =
    /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
  const PORTABLE_LABEL_VALUE_KEYS = new Set([
    "createdByName",
    "creatorName",
    "creatorOrigin",
    "documentName",
    "fileName",
    "filename",
    "projectName",
    "sourceFileName",
    "sourceLang",
    "targetLang",
    "termBaseName",
    "tmName"
  ]);
  const PORTABLE_LABEL_CONTAINER_KEYS = new Set([
    "documents",
    "project",
    "projects",
    "resourceLinks",
    "resourceReferences",
    "sourceAssets"
  ]);
  const PORTABLE_RECORD_ID_KEYS = new Set([
    "id",
    "projectId",
    "documentId",
    "segmentId",
    "workspaceId",
    "ownerId",
    "createdBy"
  ]);
  const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);
  const UNSAFE_HTML_TAGS = new Set([
    "script",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
    "form",
    "svg",
    "math"
  ]);
  const URL_HTML_ATTRIBUTES = new Set(["href", "src", "xlink:href", "formaction"]);
  const HTML_ENTITY_DECODE_MAP = {
    amp: "&",
    apos: "'",
    colon: ":",
    gt: ">",
    lt: "<",
    newline: "\n",
    quot: '"',
    tab: "\t"
  };
  const LOCALIZATION_TYPES = new Set([
    "docm",
    "dotx",
    "dotm",
    "xlsx",
    "xlsm",
    "xltx",
    "xltm",
    "pptx",
    "pptm",
    "ppsx",
    "ppsm",
    "potx",
    "potm",
    "odp",
    "otp",
    "ods",
    "ots",
    "odt",
    "ott",
    "html",
    "htm",
    "xhtml",
    "md",
    "markdown",
    "xlf",
    "xliff",
    "sdlxliff",
    "po",
    "pot",
    "ttx",
    "txml",
    "xini",
    "mif",
    "idml",
    "icml",
    "dita",
    "csv",
    "tsv",
    "xml",
    "dtd",
    "json",
    "yaml",
    "yml",
    "php",
    "properties",
    "ts",
    "resx",
    "wix",
    "strings",
    "srt",
    "vtt",
    "sbv",
    "txt"
  ]);

  function validXliffReconstruction(segment) {
    if (structureFormat(segment) !== "xliff" || !hasStructureNumber(segment?.structure?.unitIndex)) return false;
    if (!String(segment?.structure?.version || "1.2").startsWith("2")) return true;
    return hasStructureNumber(segment?.structure?.fileIndex) && hasStructureNumber(segment?.structure?.segmentIndex);
  }

  const RECONSTRUCTION_SEGMENT_REQUIREMENTS = {
    xlf: {
      label: "XLIFF",
      issue: "file, unit, or segment mapping data",
      valid: validXliffReconstruction
    },
    xliff: {
      label: "XLIFF",
      issue: "file, unit, or segment mapping data",
      valid: validXliffReconstruction
    },
    sdlxliff: {
      label: "SDLXLIFF",
      issue: "file, unit, or segment mapping data",
      valid: validXliffReconstruction
    },
    po: {
      label: "PO",
      issue: "msgstr line mapping data",
      valid: (segment) => structureFormat(segment) === "po" && hasStructureNumber(segment?.structure?.msgstrStart)
    },
    pot: {
      label: "PO/POT",
      issue: "msgstr line mapping data",
      valid: (segment) => structureFormat(segment) === "po" && hasStructureNumber(segment?.structure?.msgstrStart)
    },
    json: {
      label: "JSON",
      issue: "string path mapping data",
      valid: (segment) => structureFormat(segment) === "json" && Array.isArray(segment?.structure?.path)
    },
    yaml: {
      label: "YAML",
      issue: "line mapping data",
      valid: (segment) => structureFormat(segment) === "yaml" && hasStructureNumber(segment?.structure?.lineStart)
    },
    yml: {
      label: "YAML",
      issue: "line mapping data",
      valid: (segment) => structureFormat(segment) === "yaml" && hasStructureNumber(segment?.structure?.lineStart)
    },
    srt: {
      label: "SRT",
      issue: "cue timing data",
      valid: (segment) => structureFormat(segment) === "srt" && String(segment?.structure?.timing || "").trim()
    },
    html: {
      label: "HTML",
      issue: "element mapping data",
      valid: (segment) => structureFormat(segment) === "html" && hasStructureNumber(segment?.structure?.elementIndex)
    },
    htm: {
      label: "HTML",
      issue: "element mapping data",
      valid: (segment) => structureFormat(segment) === "html" && hasStructureNumber(segment?.structure?.elementIndex)
    },
    md: {
      label: "Markdown",
      issue: "line mapping data",
      valid: (segment) => structureFormat(segment) === "markdown" && hasStructureNumber(segment?.structure?.lineStart)
    },
    markdown: {
      label: "Markdown",
      issue: "line mapping data",
      valid: (segment) => structureFormat(segment) === "markdown" && hasStructureNumber(segment?.structure?.lineStart)
    },
    csv: {
      label: "CSV",
      issue: "row mapping data",
      valid: (segment) => structureFormat(segment) === "csv" && hasStructureNumber(segment?.structure?.rowIndex)
    },
    tsv: {
      label: "TSV",
      issue: "row mapping data",
      valid: (segment) => structureFormat(segment) === "tsv" && hasStructureNumber(segment?.structure?.rowIndex)
    },
    xml: {
      label: "XML",
      issue: "element mapping data",
      valid: (segment) => {
        const format = structureFormat(segment);
        return (
          (format === "android-xml" && hasStructureNumber(segment?.structure?.elementIndex)) ||
          (format === "generic-xml" && hasStructureNumber(segment?.structure?.itemIndex))
        );
      }
    },
    strings: {
      label: "iOS strings",
      issue: "line mapping data",
      valid: (segment) =>
        structureFormat(segment) === "apple-strings" && hasStructureNumber(segment?.structure?.lineIndex)
    },
    idml: {
      label: "IDML",
      issue: "story mapping data",
      valid: (segment) =>
        structureFormat(segment) === "idml" &&
        String(segment?.structure?.path || "").trim() &&
        (hasStructureNumber(segment?.structure?.contentIndex) || hasStructureNumber(segment?.structure?.paragraphIndex))
    }
  };

  const OPENXML_TYPES = [
    "docm",
    "dotx",
    "dotm",
    "xlsx",
    "xlsm",
    "xltx",
    "xltm",
    "pptx",
    "pptm",
    "ppsx",
    "ppsm",
    "potx",
    "potm"
  ];
  OPENXML_TYPES.forEach((type) => {
    RECONSTRUCTION_SEGMENT_REQUIREMENTS[type] = {
      label: "OpenXML",
      issue: "package text mapping data",
      valid: (segment) =>
        structureFormat(segment) === "openxml" &&
        String(segment?.structure?.path || "").trim() &&
        hasStructureNumber(segment?.structure?.itemIndex)
    };
  });

  const OPENDOCUMENT_TYPES = ["odt", "ott", "ods", "ots", "odp", "otp"];
  OPENDOCUMENT_TYPES.forEach((type) => {
    RECONSTRUCTION_SEGMENT_REQUIREMENTS[type] = {
      label: "OpenDocument",
      issue: "content mapping data",
      valid: (segment) =>
        structureFormat(segment) === "opendocument" &&
        String(segment?.structure?.path || "").trim() &&
        hasStructureNumber(segment?.structure?.itemIndex)
    };
  });

  ["xhtml", "dita", "xini", "wix"].forEach((type) => {
    RECONSTRUCTION_SEGMENT_REQUIREMENTS[type] = {
      label: "XML",
      issue: "element or attribute mapping data",
      valid: (segment) =>
        structureFormat(segment) === "generic-xml" && hasStructureNumber(segment?.structure?.itemIndex)
    };
  });

  ["txml", "ttx"].forEach((type) => {
    RECONSTRUCTION_SEGMENT_REQUIREMENTS[type] = {
      label: "Bilingual XML",
      issue: "source-target mapping data",
      valid: (segment) =>
        structureFormat(segment) === "bilingual-xml" && hasStructureNumber(segment?.structure?.pairIndex)
    };
  });

  Object.assign(RECONSTRUCTION_SEGMENT_REQUIREMENTS, {
    txt: {
      label: "Plain text",
      issue: "line mapping data",
      valid: (segment) => structureFormat(segment) === "plain-text" && hasStructureNumber(segment?.structure?.lineStart)
    },
    properties: {
      label: "Properties",
      issue: "property line mapping data",
      valid: (segment) => structureFormat(segment) === "properties" && hasStructureNumber(segment?.structure?.lineIndex)
    },
    php: {
      label: "PHP",
      issue: "string literal mapping data",
      valid: (segment) =>
        structureFormat(segment) === "code-string" && hasStructureNumber(segment?.structure?.tokenIndex)
    },
    ts: {
      label: "TS",
      issue: "message mapping data",
      valid: (segment) => {
        const format = structureFormat(segment);
        return (
          (format === "ts-xml" && hasStructureNumber(segment?.structure?.messageIndex)) ||
          (format === "code-string" && hasStructureNumber(segment?.structure?.tokenIndex))
        );
      }
    },
    resx: {
      label: "RESX",
      issue: "resource value mapping data",
      valid: (segment) => structureFormat(segment) === "resx" && hasStructureNumber(segment?.structure?.itemIndex)
    },
    dtd: {
      label: "DTD",
      issue: "quoted literal mapping data",
      valid: (segment) =>
        structureFormat(segment) === "quoted-text" && hasStructureNumber(segment?.structure?.tokenIndex)
    },
    mif: {
      label: "MIF",
      issue: "String mapping data",
      valid: (segment) => structureFormat(segment) === "mif" && hasStructureNumber(segment?.structure?.tokenIndex)
    },
    icml: {
      label: "ICML",
      issue: "content mapping data",
      valid: (segment) => structureFormat(segment) === "icml" && hasStructureNumber(segment?.structure?.contentIndex)
    },
    vtt: {
      label: "VTT",
      issue: "cue mapping data",
      valid: (segment) => structureFormat(segment) === "vtt" && hasStructureNumber(segment?.structure?.blockIndex)
    },
    sbv: {
      label: "SBV",
      issue: "cue mapping data",
      valid: (segment) => structureFormat(segment) === "sbv" && hasStructureNumber(segment?.structure?.blockIndex)
    }
  });

  function emptyReport() {
    return {
      ok: true,
      errors: [],
      warnings: [],
      preserved: [],
      simplified: [],
      skipped: [],
      risky: []
    };
  }

  function finalize(report) {
    report.ok = report.errors.length === 0;
    return report;
  }

  function add(report, bucket, message) {
    if (message && report[bucket]) report[bucket].push(redactSensitiveText(message));
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function structureFormat(segment) {
    return String(segment?.structure?.format || "").toLowerCase();
  }

  function hasStructureNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function reconstructionRequirementFor(type) {
    return RECONSTRUCTION_SEGMENT_REQUIREMENTS[String(type || "").toLowerCase()] || null;
  }

  function missingSegmentReconstruction(segments, type) {
    const requirement = reconstructionRequirementFor(type);
    if (!requirement) return { requirement: null, missing: [] };
    return {
      requirement,
      missing: (Array.isArray(segments) ? segments : []).filter((segment) => !requirement.valid(segment))
    };
  }

  function isIsoDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function requireString(report, object, field, label = field, bucket = "errors") {
    if (!String(object?.[field] || "").trim()) add(report, bucket, `${label} is missing.`);
  }

  function requireArray(report, object, field, label = field, bucket = "errors") {
    if (!Array.isArray(object?.[field])) add(report, bucket, `${label} must be an array.`);
  }

  function validateUniqueRecordIds(report, records, label) {
    const seen = new Set();
    (Array.isArray(records) ? records : []).forEach((record, index) => {
      if (!isObject(record) || !record.id) return;
      if (seen.has(record.id)) add(report, "errors", `${label} contain duplicate ID: ${record.id}.`);
      seen.add(record.id);
      if (typeof record.id !== "string") add(report, "errors", `${label} record ${index + 1} ID must be a string.`);
    });
  }

  function validateProjectResourceLinks(
    report,
    project,
    label = "Project",
    missingBucket = "errors",
    issueBucket = "errors"
  ) {
    if (project?.resourceLinks === undefined) {
      add(report, missingBucket, `${label} resource links are missing.`);
      return;
    }
    if (!Array.isArray(project.resourceLinks)) {
      add(report, issueBucket, `${label} resource links must be an array.`);
      return;
    }

    const linkIds = new Set();
    const linkKeys = new Set();
    let mainTmLinks = 0;
    project.resourceLinks.forEach((link, index) => {
      const linkLabel = `${label} resource link ${index + 1}`;
      if (!isObject(link)) {
        add(report, issueBucket, `${linkLabel} must be an object.`);
        return;
      }
      const type = String(link.type || "").trim();
      const name = String(link.name || "").trim();
      requireString(report, link, "type", `${linkLabel} type`, issueBucket);
      requireString(report, link, "name", `${linkLabel} name`, issueBucket);
      if (type && !RESOURCE_LINK_TYPES.has(type)) {
        add(report, issueBucket, `${linkLabel} uses unknown resource type "${link.type}".`);
      }
      if (link.id !== undefined) {
        if (typeof link.id !== "string" || !link.id.trim()) {
          add(report, issueBucket, `${linkLabel} ID must be a non-empty string.`);
        } else {
          if (linkIds.has(link.id))
            add(report, issueBucket, `Duplicate resource link ID in project manifest: ${link.id}.`);
          linkIds.add(link.id);
        }
      } else {
        add(report, "warnings", `${linkLabel} ID is missing.`);
      }
      if (RESOURCE_LINK_TYPES.has(type) && name) {
        const linkKey = `${type}::${name}`;
        if (linkKeys.has(linkKey))
          add(report, issueBucket, `Duplicate resource link in project manifest: ${type}/${name}.`);
        linkKeys.add(linkKey);
      }
      if (type === "tm" && link.role === "main") mainTmLinks += 1;
    });
    if (mainTmLinks > 1)
      add(report, issueBucket, `${label} resource links contain multiple main translation memories.`);
  }

  function detectSecretFields(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        key !== "apiKeyMode" &&
        SECRET_FIELD_PATTERN.test(key) &&
        String(item || "").trim() &&
        !isSourceJsonPath(nextPath)
      )
        findings.push(nextPath);
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSecretFields(item, nextPath));
    });
    return findings;
  }

  function detectInvalidAiKeyModes(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        key === "apiKeyMode" &&
        item !== undefined &&
        item !== null &&
        !AI_API_KEY_MODES.has(String(item || "").trim())
      ) {
        findings.push(nextPath);
      }
      if (isObject(item) || Array.isArray(item)) findings.push(...detectInvalidAiKeyModes(item, nextPath));
    });
    return findings;
  }

  function detectSensitiveAiStyleGuides(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "aiSettings" && isObject(item) && hasSensitiveTextValue(item.styleGuide)) {
        findings.push(`${nextPath}.styleGuide`);
      }
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveAiStyleGuides(item, nextPath));
    });
    return findings;
  }

  function detectSensitiveAiSettingsMetadata(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "aiSettings" && isObject(item)) {
        ["provider", "model"].forEach((settingKey) => {
          if (hasSensitiveTextValue(item[settingKey])) findings.push(`${nextPath}.${settingKey}`);
        });
      }
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveAiSettingsMetadata(item, nextPath));
    });
    return findings;
  }

  function collectSensitiveTextPaths(value, path = "") {
    if (isSourceJsonPath(path)) return [];
    if (typeof value === "string" || typeof value === "number") {
      return hasSensitiveTextValue(value) ? [path] : [];
    }
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      findings.push(...collectSensitiveTextPaths(item, nextPath));
    });
    return findings;
  }

  function detectSensitiveActivityMetadata(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "activityEvents" && Array.isArray(item)) {
        item.forEach((event, index) => {
          if (isObject(event?.detail)) {
            findings.push(...collectSensitiveTextPaths(event.detail, `${nextPath}.${index}.detail`));
          }
        });
      }
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveActivityMetadata(item, nextPath));
    });
    return findings;
  }

  function detectSensitiveProjectDomains(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "domain" && hasSensitiveTextValue(item) && !isSourceJsonPath(nextPath)) {
        findings.push(nextPath);
      }
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveProjectDomains(item, nextPath));
    });
    return findings;
  }

  function isTermRecordLike(value) {
    return Boolean(
      isObject(value) &&
      Object.prototype.hasOwnProperty.call(value, "notes") &&
      (Object.prototype.hasOwnProperty.call(value, "sourceTerm") ||
        Object.prototype.hasOwnProperty.call(value, "targetTerm"))
    );
  }

  function detectSensitiveTermNotes(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    if (isTermRecordLike(value) && hasSensitiveTextValue(value.notes) && !isSourceJsonPath(path)) {
      findings.push(path ? `${path}.notes` : "notes");
    }
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveTermNotes(item, nextPath));
    });
    return findings;
  }

  function isTmEntryLike(value) {
    return Boolean(
      isObject(value) &&
      Object.prototype.hasOwnProperty.call(value, "projectName") &&
      Object.prototype.hasOwnProperty.call(value, "source") &&
      Object.prototype.hasOwnProperty.call(value, "target")
    );
  }

  function detectSensitiveTmOrigins(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    if (isTmEntryLike(value) && hasSensitiveTextValue(value.projectName) && !isSourceJsonPath(path)) {
      findings.push(path ? `${path}.projectName` : "projectName");
    }
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveTmOrigins(item, nextPath));
    });
    return findings;
  }

  function isAiSuggestionLike(value) {
    return Boolean(
      isObject(value) &&
      (Object.prototype.hasOwnProperty.call(value, "suggestedTarget") ||
        Object.prototype.hasOwnProperty.call(value, "explanation")) &&
      (Object.prototype.hasOwnProperty.call(value, "provider") ||
        Object.prototype.hasOwnProperty.call(value, "model") ||
        Object.prototype.hasOwnProperty.call(value, "segmentId") ||
        Object.prototype.hasOwnProperty.call(value, "status"))
    );
  }

  function detectSensitiveAiSuggestionMetadata(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    if (isAiSuggestionLike(value) && !isSourceJsonPath(path)) {
      ["provider", "model", "status"].forEach((key) => {
        if (hasSensitiveTextValue(value[key])) findings.push(path ? `${path}.${key}` : key);
      });
      if (Array.isArray(value.explanation)) {
        value.explanation.forEach((item, index) => {
          if (hasSensitiveTextValue(item))
            findings.push(path ? `${path}.explanation.${index}` : `explanation.${index}`);
        });
      }
    }
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveAiSuggestionMetadata(item, nextPath));
    });
    return findings;
  }

  function isSourceJsonPath(path = "") {
    const segments = String(path || "")
      .split(".")
      .filter(Boolean);
    return segments.some((segment, index) => {
      if (segment !== "sourceJson" || index < 2 || segments[index - 2] !== "localizationStructures") return false;
      const prefix = segments.slice(0, index - 2);
      if (!prefix.length) return true;
      if (prefix.length === 1 && (prefix[0] === "project" || prefix[0] === "projects")) return true;
      return prefix.length === 2 && prefix[0] === "projects" && /^\d+$/.test(prefix[1]);
    });
  }

  function isPortableLabelPath(path = "") {
    const segments = String(path || "")
      .split(".")
      .filter(Boolean);
    const key = segments[segments.length - 1] || "";
    if (!key || isSourceJsonPath(path)) return false;
    if (PORTABLE_LABEL_VALUE_KEYS.has(key)) return true;
    return key === "name" && segments.some((segment) => PORTABLE_LABEL_CONTAINER_KEYS.has(segment));
  }

  function detectSensitivePortableLabels(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (isPortableLabelPath(nextPath) && hasSensitiveTextValue(item)) findings.push(nextPath);
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitivePortableLabels(item, nextPath));
    });
    return findings;
  }

  function detectSensitiveRecordIds(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (PORTABLE_RECORD_ID_KEYS.has(key) && hasSensitiveTextValue(item) && !isSourceJsonPath(nextPath))
        findings.push(nextPath);
      if (isObject(item) || Array.isArray(item)) findings.push(...detectSensitiveRecordIds(item, nextPath));
    });
    return findings;
  }

  function detectProviderTraceFields(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      const hasPortableValue =
        item !== undefined && item !== null && (typeof item !== "string" || Boolean(item.trim()));
      if (hasPortableValue && PROVIDER_TRACE_FIELD_PATTERN.test(key) && !isSourceJsonPath(nextPath))
        findings.push(nextPath);
      if (isObject(item) || Array.isArray(item)) findings.push(...detectProviderTraceFields(item, nextPath));
    });
    return findings;
  }

  function isRuntimeHandleLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (typeof value.getFile === "function" ||
        typeof value.getFileHandle === "function" ||
        typeof value.getDirectoryHandle === "function" ||
        (["file", "directory"].includes(value.kind) && typeof value.queryPermission === "function"))
    );
  }

  function detectRuntimeOnlyFields(value, path = "") {
    if (!isObject(value) && !Array.isArray(value)) return [];
    const findings = [];
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      const hasPortableValue =
        item !== undefined && item !== null && (typeof item !== "string" || Boolean(item.trim()));
      if (
        hasPortableValue &&
        ((RUNTIME_HANDLE_FIELD_PATTERN.test(key) && !isSourceJsonPath(nextPath)) ||
          isRuntimeHandleLike(item) ||
          typeof item === "function" ||
          typeof item === "symbol")
      )
        findings.push(nextPath);
      if (isObject(item) || Array.isArray(item)) findings.push(...detectRuntimeOnlyFields(item, nextPath));
    });
    return findings;
  }

  function hasSensitiveTextValue(value) {
    return SENSITIVE_TEXT_VALUE_PATTERN.test(String(value || ""));
  }

  function redactSensitiveText(value) {
    return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
  }

  function addSecretFindings(report, value, label) {
    const secretFields = detectSecretFields(value);
    if (secretFields.length) {
      add(report, "errors", `${label} must not include secrets: ${secretFields.join(", ")}.`);
    }
    const invalidAiKeyModes = detectInvalidAiKeyModes(value);
    if (invalidAiKeyModes.length) {
      add(report, "errors", `${label} must not include invalid AI key mode values: ${invalidAiKeyModes.join(", ")}.`);
    }
    const sensitiveAiStyleGuides = detectSensitiveAiStyleGuides(value);
    if (sensitiveAiStyleGuides.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking AI style instructions: ${sensitiveAiStyleGuides.join(", ")}.`
      );
    }
    const sensitiveAiSettingsMetadata = detectSensitiveAiSettingsMetadata(value);
    if (sensitiveAiSettingsMetadata.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking AI settings metadata: ${sensitiveAiSettingsMetadata.join(", ")}.`
      );
    }
    const sensitiveActivityMetadata = detectSensitiveActivityMetadata(value);
    if (sensitiveActivityMetadata.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking activity metadata: ${sensitiveActivityMetadata.join(", ")}.`
      );
    }
    const sensitiveProjectDomains = detectSensitiveProjectDomains(value);
    if (sensitiveProjectDomains.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking project domain metadata: ${sensitiveProjectDomains.join(", ")}.`
      );
    }
    const sensitivePortableLabels = detectSensitivePortableLabels(value);
    if (sensitivePortableLabels.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking label metadata: ${sensitivePortableLabels.join(", ")}.`
      );
    }
    const sensitiveRecordIds = detectSensitiveRecordIds(value);
    if (sensitiveRecordIds.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking record IDs: ${sensitiveRecordIds.join(", ")}.`
      );
    }
    const sensitiveTermNotes = detectSensitiveTermNotes(value);
    if (sensitiveTermNotes.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking termbase notes: ${sensitiveTermNotes.join(", ")}.`
      );
    }
    const sensitiveTmOrigins = detectSensitiveTmOrigins(value);
    if (sensitiveTmOrigins.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking TM origin metadata: ${sensitiveTmOrigins.join(", ")}.`
      );
    }
    const sensitiveAiSuggestionMetadata = detectSensitiveAiSuggestionMetadata(value);
    if (sensitiveAiSuggestionMetadata.length) {
      add(
        report,
        "errors",
        `${label} must not include credential-looking AI suggestion metadata: ${sensitiveAiSuggestionMetadata.join(", ")}.`
      );
    }
    const providerTraceFields = detectProviderTraceFields(value);
    if (providerTraceFields.length) {
      add(report, "errors", `${label} must not include AI provider trace metadata: ${providerTraceFields.join(", ")}.`);
    }
    const runtimeOnlyFields = detectRuntimeOnlyFields(value);
    if (runtimeOnlyFields.length) {
      add(
        report,
        "errors",
        `${label} must not include browser-only handles or runtime objects: ${runtimeOnlyFields.join(", ")}.`
      );
    }
  }

  function defaultAiSettings(settings = {}) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      enabled: Boolean(source.enabled),
      provider: redactSensitiveText(source.provider || "OpenAI").trim() || "OpenAI",
      model: redactSensitiveText(source.model || "gpt-5.5").trim() || "gpt-5.5",
      apiKeyMode: "bring-your-own",
      sendSourceToAi: Boolean(source.sendSourceToAi),
      useTmContext: source.useTmContext !== false,
      useTermbaseContext: source.useTermbaseContext !== false,
      styleGuide: redactSensitiveText(source.styleGuide || "").trim()
    };
  }

  function hasOriginalLocalizationStructure(structure) {
    return Boolean(
      structure?.source ||
      structure?.sourceLines ||
      structure?.sourceJson !== undefined ||
      structure?.rows ||
      structure?.packageBase64
    );
  }

  function sourceAssetById(sourceAssets) {
    const assets = new Map();
    (Array.isArray(sourceAssets) ? sourceAssets : []).forEach((asset) => {
      if (asset?.id && !assets.has(asset.id)) assets.set(asset.id, asset);
    });
    return assets;
  }

  function validateSourceAssetConsistency(report, pkg, documents) {
    if (!Array.isArray(pkg.sourceAssets)) return;
    const documentIds = new Set();
    documents.forEach((documentInfo) => {
      if (documentInfo?.id) documentIds.add(documentInfo.id);
    });
    const seenAssetIds = new Set();
    pkg.sourceAssets.forEach((asset, index) => {
      if (!isObject(asset)) {
        add(report, "warnings", `Source asset ${index + 1} must be an object.`);
        return;
      }
      if (!asset.id) {
        add(report, "warnings", `Source asset ${index + 1} has no document ID.`);
        return;
      }
      if (seenAssetIds.has(asset.id))
        add(report, "warnings", `Source assets contain duplicate document ID: ${asset.id}.`);
      seenAssetIds.add(asset.id);
      if (!documentIds.has(asset.id)) {
        add(report, "warnings", `${asset.name || asset.id} source asset is not listed in the document manifest.`);
      }
    });
    const assets = sourceAssetById(pkg.sourceAssets);
    documents.forEach((documentInfo) => {
      const asset = assets.get(documentInfo.id);
      if (!asset) {
        add(report, "warnings", `${documentInfo.name || "A document"} has no source asset summary.`);
        return;
      }
      const docxStructure =
        pkg.project?.docxStructures?.[documentInfo.id] ||
        (documentInfo.type === "docx" ? pkg.project?.docxStructure : null);
      const localizationStructure = pkg.project?.localizationStructures?.[documentInfo.id];
      const hasOriginal = Boolean(
        docxStructure?.docxPackageBase64 || hasOriginalLocalizationStructure(localizationStructure)
      );
      const hasStructure = Boolean(docxStructure || localizationStructure);
      const name = documentInfo.name || asset.name || "A source asset";
      if (asset.originalAvailable && !hasOriginal) {
        add(
          report,
          "warnings",
          `${name} source asset claims original availability, but reconstruction data is missing.`
        );
      }
      if (asset.structurePreserved && !hasStructure) {
        add(report, "warnings", `${name} source asset claims preserved structure, but structure metadata is missing.`);
      }
      if (hasOriginal && asset.originalAvailable === false) {
        add(report, "warnings", `${name} source asset summary does not report available reconstruction data.`);
      }
      if (hasStructure && asset.structurePreserved === false) {
        add(report, "warnings", `${name} source asset summary does not report preserved structure metadata.`);
      }
    });
  }

  function validateProjectPackage(pkg) {
    const report = emptyReport();
    if (!isObject(pkg)) {
      add(report, "errors", "Project package must be a JSON object.");
      return finalize(report);
    }

    const legacy = pkg.app === LEGACY_APP_NAME;
    if (![APP_NAME, LEGACY_APP_NAME].includes(pkg.app) || pkg.type !== PACKAGE_TYPE) {
      add(report, "errors", "This is not a LoopCAT project package.");
    }
    if (legacy)
      add(report, "warnings", "Legacy CatHan package accepted. Re-export it as a LoopCAT package after import.");

    const strictBucket = legacy ? "warnings" : "errors";
    if (pkg.version !== PACKAGE_VERSION) add(report, strictBucket, `Package version must be ${PACKAGE_VERSION}.`);
    if (!Number.isFinite(pkg.schemaVersion) || pkg.schemaVersion < MIN_SCHEMA_VERSION) {
      add(report, strictBucket, `Schema version must be ${MIN_SCHEMA_VERSION} or newer.`);
    } else if (pkg.schemaVersion > MAX_PACKAGE_SCHEMA_VERSION) {
      add(
        report,
        "errors",
        `Schema version ${pkg.schemaVersion} is newer than this LoopCAT build supports. Update LoopCAT before importing this package.`
      );
    }
    if (!isIsoDate(pkg.exportedAt))
      add(report, legacy ? "warnings" : "errors", "Package export timestamp is missing or invalid.");

    if (!isObject(pkg.packageMetadata)) {
      add(report, strictBucket, "Package metadata is missing.");
    } else {
      if (!legacy && pkg.packageMetadata.format !== PACKAGE_FORMAT)
        add(report, "errors", `Package format must be ${PACKAGE_FORMAT}.`);
      if (!legacy && pkg.packageMetadata.packageVersion !== pkg.version)
        add(report, "errors", "Package metadata version must match package version.");
      if (!legacy && pkg.packageMetadata.contractVersion !== CONTRACT_VERSION)
        add(report, "errors", `Package contract must be ${CONTRACT_VERSION}.`);
      requireString(report, pkg.packageMetadata, "generator", "Package generator", legacy ? "warnings" : "errors");
      requireString(report, pkg.packageMetadata, "storageMode", "Package storage mode", legacy ? "warnings" : "errors");
      if (pkg.packageMetadata.storageMode && !STORAGE_MODES.has(pkg.packageMetadata.storageMode)) {
        add(report, "warnings", `Unknown storage mode: ${pkg.packageMetadata.storageMode}.`);
      }
    }

    if (!isObject(pkg.project)) {
      add(report, "errors", "Project metadata is missing.");
    } else {
      requireString(report, pkg.project, "id", "Project ID");
      requireString(report, pkg.project, "name", "Project name");
      requireString(report, pkg.project, "sourceLang", "Project source language");
      requireString(report, pkg.project, "targetLang", "Project target language");
      requireString(report, pkg.project, "workspaceId", "Project workspace ID", strictBucket);
      requireString(report, pkg.project, "ownerId", "Project owner ID", strictBucket);
      if (!Array.isArray(pkg.project.documents)) add(report, strictBucket, "Project has no document manifest.");
      validateProjectResourceLinks(report, pkg.project, "Project", strictBucket, strictBucket);
      if (!isObject(pkg.project.qaSettings)) add(report, strictBucket, "Project QA settings are missing.");
      if (!isObject(pkg.project.aiSettings)) add(report, strictBucket, "Project AI settings are missing.");
      if (!isIsoDate(pkg.project.createdAt))
        add(report, "warnings", "Project creation timestamp is missing or invalid.");
      if (!isIsoDate(pkg.project.updatedAt)) add(report, "warnings", "Project update timestamp is missing or invalid.");
    }

    addSecretFindings(report, pkg, "Project package");

    const segments = Array.isArray(pkg?.segments) ? pkg.segments : [];
    if (!Array.isArray(pkg?.segments)) add(report, "errors", "Segments must be an array.");
    const emptyTargets = segments.filter((segment) => !String(segment.target || "").trim()).length;
    if (segments.length)
      add(report, "preserved", `${segments.length} segment${segments.length === 1 ? "" : "s"} included.`);
    if (emptyTargets)
      add(report, "warnings", `${emptyTargets} target segment${emptyTargets === 1 ? "" : "s"} are empty.`);

    const segmentIds = new Set();
    const hasDocumentManifest = Array.isArray(pkg?.project?.documents);
    const documents = hasDocumentManifest ? pkg.project.documents : [];
    const validDocuments = [];
    const documentIds = new Set();
    documents.forEach((documentInfo, index) => {
      if (!isObject(documentInfo)) {
        add(report, strictBucket, `Document ${index + 1} manifest entry must be an object.`);
        return;
      }
      validDocuments.push(documentInfo);
      requireString(report, documentInfo, "id", `Document ${index + 1} ID`, strictBucket);
      if (documentInfo.id) {
        if (documentIds.has(documentInfo.id))
          add(report, strictBucket, `Duplicate document ID in project manifest: ${documentInfo.id}.`);
        documentIds.add(documentInfo.id);
      }
      requireString(report, documentInfo, "name", `Document ${index + 1} name`, "warnings");
      requireString(report, documentInfo, "type", `Document ${index + 1} type`, "warnings");
    });
    segments.forEach((segment, index) => {
      if (!isObject(segment)) {
        add(report, "errors", `Segment ${index + 1} must be an object.`);
        return;
      }
      requireString(report, segment, "id", `Segment ${index + 1} ID`);
      if (segment.id) {
        if (segmentIds.has(segment.id)) add(report, "errors", `Duplicate segment ID: ${segment.id}.`);
        segmentIds.add(segment.id);
      }
      requireString(report, segment, "projectId", `Segment ${index + 1} project ID`);
      requireString(report, segment, "documentId", `Segment ${index + 1} document ID`, "warnings");
      if (segment.documentId && hasDocumentManifest && !documentIds.has(segment.documentId)) {
        add(
          report,
          strictBucket,
          `Segment ${segment.id || index + 1} refers to document ${segment.documentId}, but that document is not listed in the project manifest.`
        );
      }
      if (pkg.project?.id && segment.projectId && segment.projectId !== pkg.project.id) {
        add(report, "errors", `Segment ${segment.id || index + 1} belongs to a different project.`);
      }
      if (typeof segment.source !== "string")
        add(report, "errors", `Segment ${segment.id || index + 1} source text must be a string.`);
      if (segment.targetHistory !== undefined && !Array.isArray(segment.targetHistory))
        add(report, "warnings", `Segment ${segment.id || index + 1} target history must be an array.`);
      if (!Number.isFinite(segment.index))
        add(report, "warnings", `Segment ${segment.id || index + 1} index is missing or invalid.`);
      if (segment.status && !["empty", "draft", "confirmed"].includes(segment.status)) {
        add(report, "warnings", `Segment ${segment.id || index + 1} uses unknown status "${segment.status}".`);
      }
      if (!isIsoDate(segment.createdAt))
        add(report, "warnings", `Segment ${segment.id || index + 1} creation timestamp is missing or invalid.`);
      if (!isIsoDate(segment.updatedAt))
        add(report, "warnings", `Segment ${segment.id || index + 1} update timestamp is missing or invalid.`);
    });

    validDocuments.forEach((documentInfo) => {
      const type = documentInfo.type || "file";
      const documentSegments = segments.filter((segment) => segment.documentId === documentInfo.id);
      add(report, "preserved", `${documentInfo.name || "Document"} manifest preserved as ${type.toUpperCase()}.`);
      if (type === "docx" && !pkg.project.docxStructures?.[documentInfo.id] && !pkg.project.docxStructure) {
        add(report, "warnings", `${documentInfo.name || "A DOCX file"} has no DOCX reconstruction data.`);
      }
      if (LOCALIZATION_TYPES.has(type) && !pkg.project.localizationStructures?.[documentInfo.id]) {
        add(report, "warnings", `${documentInfo.name || "A localization file"} has no source structure data.`);
      }
      if (
        type === "idml" &&
        pkg.project.localizationStructures?.[documentInfo.id] &&
        !pkg.project.localizationStructures[documentInfo.id].packageBase64
      ) {
        add(report, "warnings", `${documentInfo.name || "An IDML file"} has no IDML reconstruction package data.`);
      }
      if (pkg.project.localizationStructures?.[documentInfo.id] && documentSegments.length) {
        const { requirement, missing } = missingSegmentReconstruction(documentSegments, type);
        if (requirement && missing.length) {
          add(
            report,
            "warnings",
            `${documentInfo.name || requirement.label} has ${missing.length} segment${missing.length === 1 ? "" : "s"} missing ${requirement.issue}.`
          );
        }
      }
    });
    validateSourceAssetConsistency(report, pkg, validDocuments);

    if (defaultAiSettings(pkg?.project?.aiSettings).sendSourceToAi) {
      add(report, "risky", "AI source sharing is enabled in this project.");
    }
    if (!pkg?.project?.resourceLinks?.length) add(report, "warnings", "No resource links are defined.");

    if (pkg.resources && !isObject(pkg.resources))
      add(report, "warnings", "Package resources must be an object when present.");
    if (pkg.resources?.tmEntries && !Array.isArray(pkg.resources.tmEntries)) {
      add(report, "warnings", "TM resources must be an array.");
    } else if (Array.isArray(pkg.resources?.tmEntries)) {
      validateUniqueRecordIds(report, pkg.resources.tmEntries, "TM resources");
    }
    if (pkg.resources?.terms && !Array.isArray(pkg.resources.terms)) {
      add(report, "warnings", "Termbase resources must be an array.");
    } else if (Array.isArray(pkg.resources?.terms)) {
      validateUniqueRecordIds(report, pkg.resources.terms, "Termbase resources");
    }
    if (pkg.resourceReferences && !Array.isArray(pkg.resourceReferences))
      add(report, "warnings", "Resource references must be an array.");
    if (pkg.sourceAssets && !Array.isArray(pkg.sourceAssets))
      add(report, "warnings", "Source assets must be an array.");
    if (pkg.activityEvents && !Array.isArray(pkg.activityEvents)) {
      add(report, "warnings", "Activity events must be an array.");
    } else if (Array.isArray(pkg.activityEvents)) {
      validateUniqueRecordIds(report, pkg.activityEvents, "Activity events");
      pkg.activityEvents.forEach((event, index) => {
        if (pkg.project?.id && event?.projectId && event.projectId !== pkg.project.id) {
          add(report, "errors", `Activity event ${event.id || index + 1} belongs to a different project.`);
        }
        if (hasSensitiveTextValue(event?.summary)) {
          add(
            report,
            "errors",
            `Activity event ${event?.id || index + 1} summary must not include credential-looking text.`
          );
        }
        if (hasSensitiveTextValue(event?.type)) {
          add(
            report,
            "errors",
            `Activity event ${event?.id || index + 1} type must not include credential-looking text.`
          );
        }
      });
    }

    return finalize(report);
  }

  function validateBackupFile(data) {
    const report = emptyReport();
    if (!isObject(data)) {
      add(report, "errors", "Backup file must be a JSON object.");
      return finalize(report);
    }
    if (![APP_NAME, LEGACY_APP_NAME].includes(data.app)) {
      add(report, "errors", "This is not a LoopCAT backup.");
    }
    if (!Number.isFinite(data.schemaVersion) || data.schemaVersion < MIN_SCHEMA_VERSION) {
      add(report, "warnings", `Backup schema version should be ${MIN_SCHEMA_VERSION} or newer.`);
    } else if (data.schemaVersion > MAX_BACKUP_SCHEMA_VERSION) {
      add(
        report,
        "errors",
        `Backup schema version ${data.schemaVersion} is newer than this LoopCAT build supports. Update LoopCAT before restoring this backup.`
      );
    }
    if (data.exportedAt && !isIsoDate(data.exportedAt)) add(report, "warnings", "Backup export timestamp is invalid.");
    [
      ["projects", "Projects"],
      ["segments", "Segments"],
      ["tmEntries", "Translation memory entries"],
      ["terms", "Termbase entries"],
      ["activityEvents", "Activity events"],
      ["trashEntries", "Trash entries"]
    ].forEach(([field, label]) => {
      if (data[field] === undefined) {
        if (field === "trashEntries" && Number(data.schemaVersion) < 6) return;
        add(
          report,
          ["activityEvents", "trashEntries"].includes(field) ? "warnings" : "errors",
          `${label} are missing.`
        );
      } else if (!Array.isArray(data[field])) {
        add(report, "errors", `${label} must be an array.`);
      } else {
        validateUniqueRecordIds(report, data[field], label);
        add(report, "preserved", `${data[field].length} ${label.toLowerCase()} found.`);
      }
    });
    const projectIds = new Set();
    const projectDocumentIds = new Map();
    (Array.isArray(data.projects) ? data.projects : []).forEach((project, index) => {
      if (!isObject(project)) {
        add(report, "errors", `Project ${index + 1} must be an object.`);
        return;
      }
      requireString(report, project, "id", `Project ${index + 1} ID`);
      const projectLabel = project.id || index + 1;
      if (project.id) projectIds.add(project.id);
      if (project.documents === undefined) {
        add(report, "warnings", `Project ${projectLabel} has no document manifest.`);
      } else if (!Array.isArray(project.documents)) {
        add(report, "errors", `Project ${projectLabel} document manifest must be an array.`);
      } else {
        const documentIds = new Set();
        project.documents.forEach((documentInfo, documentIndex) => {
          if (!isObject(documentInfo)) {
            add(
              report,
              "errors",
              `Project ${projectLabel} document ${documentIndex + 1} manifest entry must be an object.`
            );
            return;
          }
          requireString(report, documentInfo, "id", `Project ${projectLabel} document ${documentIndex + 1} ID`);
          if (documentInfo.id) {
            if (documentIds.has(documentInfo.id))
              add(report, "errors", `Duplicate document ID in project manifest: ${documentInfo.id}.`);
            documentIds.add(documentInfo.id);
          }
          requireString(
            report,
            documentInfo,
            "name",
            `Project ${projectLabel} document ${documentIndex + 1} name`,
            "warnings"
          );
          requireString(
            report,
            documentInfo,
            "type",
            `Project ${projectLabel} document ${documentIndex + 1} type`,
            "warnings"
          );
        });
        if (project.id) projectDocumentIds.set(project.id, documentIds);
      }
      validateProjectResourceLinks(report, project, `Project ${projectLabel}`, "warnings", "errors");
    });
    (Array.isArray(data.segments) ? data.segments : []).forEach((segment, index) => {
      if (!isObject(segment)) {
        add(report, "errors", `Segment ${index + 1} must be an object.`);
        return;
      }
      requireString(report, segment, "id", `Segment ${index + 1} ID`);
      requireString(report, segment, "projectId", `Segment ${index + 1} project ID`);
      if (segment.projectId && !projectIds.has(segment.projectId)) {
        add(report, "errors", `Segment ${segment.id || index + 1} belongs to a project not present in the backup.`);
      }
      if (
        segment.projectId &&
        segment.documentId &&
        projectDocumentIds.has(segment.projectId) &&
        !projectDocumentIds.get(segment.projectId).has(segment.documentId)
      ) {
        add(
          report,
          "errors",
          `Segment ${segment.id || index + 1} refers to document ${segment.documentId}, but that document is not listed in the restored project manifest.`
        );
      }
    });
    (Array.isArray(data.activityEvents) ? data.activityEvents : []).forEach((event, index) => {
      if (!isObject(event)) {
        add(report, "errors", `Activity event ${index + 1} must be an object.`);
        return;
      }
      requireString(report, event, "id", `Activity event ${index + 1} ID`);
      if (event.projectId && !projectIds.has(event.projectId)) {
        add(
          report,
          "errors",
          `Activity event ${event.id || index + 1} belongs to a project not present in the backup.`
        );
      }
      if (hasSensitiveTextValue(event.summary)) {
        add(
          report,
          "errors",
          `Activity event ${event.id || index + 1} summary must not include credential-looking text.`
        );
      }
      if (hasSensitiveTextValue(event.type)) {
        add(report, "errors", `Activity event ${event.id || index + 1} type must not include credential-looking text.`);
      }
    });
    addSecretFindings(report, data, "Backup file");
    return finalize(report);
  }

  function segmentProtectedTags(segment) {
    if (segment?.tags?.length) return segment.tags;
    return window.CatHan.docx?.detectProtectedTags?.(segment?.source || "") || [];
  }

  function missingProtectedTags(segment) {
    const target = String(segment?.target || "");
    const seen = new Map();
    return segmentProtectedTags(segment).filter((tag) => {
      const text = String(tag?.text || "");
      if (!text) return false;
      const used = seen.get(text) || 0;
      const occurrences = target.split(text).length - 1;
      seen.set(text, used + 1);
      return occurrences <= used;
    });
  }

  function hasUnbalancedInlineMarkup(text) {
    const stack = [];
    const pattern = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/g;
    for (const match of String(text || "").matchAll(pattern)) {
      const closing = Boolean(match[1]);
      const name = String(match[2] || "").toLowerCase();
      const raw = match[0] || "";
      if (!name || VOID_TAGS.has(name) || /\/\s*>$/.test(raw)) continue;
      if (!closing) {
        stack.push(name);
        continue;
      }
      if (stack.at(-1) !== name) return true;
      stack.pop();
    }
    return stack.length > 0;
  }

  function hasInvalidXmlCharacters(text) {
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (
        (code >= 0x00 && code <= 0x08) ||
        code === 0x0b ||
        code === 0x0c ||
        (code >= 0x0e && code <= 0x1f) ||
        code === 0xfffe ||
        code === 0xffff
      ) {
        return true;
      }
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  function isXmlDeliveryFormat(format, documentInfo) {
    const value = String(format || documentInfo?.type || "").toLowerCase();
    return [
      "docx",
      "bilingual-docx",
      "docm",
      "dotx",
      "dotm",
      "xlsx",
      "xlsm",
      "xltx",
      "xltm",
      "pptx",
      "pptm",
      "ppsx",
      "ppsm",
      "potx",
      "potm",
      "odp",
      "otp",
      "ods",
      "ots",
      "odt",
      "ott",
      "xlf",
      "xliff",
      "sdlxliff",
      "xml",
      "xhtml",
      "dita",
      "txml",
      "ttx",
      "xini",
      "resx",
      "wix",
      "ts",
      "idml",
      "icml"
    ].includes(value);
  }

  function isHtmlDeliveryFormat(format, documentInfo) {
    const value = String(format || documentInfo?.type || "").toLowerCase();
    return ["html", "htm", "xhtml"].includes(value);
  }

  function decodeHtmlAttributeEntities(value) {
    let decoded = String(value || "");
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decoded.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi, (match, entity) => {
        const key = String(entity || "").toLowerCase();
        if (key.startsWith("#x")) {
          const code = Number.parseInt(key.slice(2), 16);
          return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        if (key.startsWith("#")) {
          const code = Number.parseInt(key.slice(1), 10);
          return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return Object.prototype.hasOwnProperty.call(HTML_ENTITY_DECODE_MAP, key) ? HTML_ENTITY_DECODE_MAP[key] : match;
      });
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  }

  function compactHtmlAttributeValue(value) {
    return decodeHtmlAttributeEntities(value)
      .replace(/[\u0000-\u001f\u007f\s]+/g, "")
      .toLowerCase();
  }

  function decodeCssEscapes(value) {
    return String(value || "").replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (match, escapeValue) => {
      if (/^[0-9a-fA-F]/.test(escapeValue)) {
        const hex = escapeValue.trim();
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return escapeValue;
    });
  }

  function compactCssAttributeValue(value) {
    return compactHtmlAttributeValue(decodeCssEscapes(decodeHtmlAttributeEntities(value)));
  }

  function htmlAttributeEntries(attrs) {
    const entries = [];
    const pattern = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    for (const match of String(attrs || "").matchAll(pattern)) {
      entries.push({
        name: String(match[1] || "").toLowerCase(),
        value: match[2] ?? match[3] ?? match[4] ?? ""
      });
    }
    return entries;
  }

  function isActiveDataUrl(value) {
    return /^data:(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/i.test(value);
  }

  function hasUnsafeHtmlMarkup(text) {
    const pattern = /<\s*\/?\s*([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/g;
    for (const match of String(text || "").matchAll(pattern)) {
      const name = String(match[1] || "").toLowerCase();
      const attrs = String(match[2] || "");
      if (UNSAFE_HTML_TAGS.has(name)) return true;
      if (/\son[A-Za-z]+\s*=/i.test(attrs)) return true;
      if (/\bsrcdoc\s*=/i.test(attrs)) return true;
      if (
        /\bstyle\s*=\s*(?:"[^"]*(?:expression\s*\(|javascript:)|'[^']*(?:expression\s*\(|javascript:)|[^\s>]*(?:expression\s*\(|javascript:))/i.test(
          attrs
        )
      )
        return true;
      if (/\b(?:href|src|xlink:href|formaction)\s*=\s*(?:"\s*javascript:|'\s*javascript:|javascript:)/i.test(attrs))
        return true;
      if (
        /\b(?:href|src|xlink:href|formaction)\s*=\s*(?:"\s*data\s*:\s*(?:text\/html|image\/svg\+xml)|'\s*data\s*:\s*(?:text\/html|image\/svg\+xml)|data\s*:\s*(?:text\/html|image\/svg\+xml))/i.test(
          attrs
        )
      )
        return true;
      for (const attr of htmlAttributeEntries(attrs)) {
        const compactValue = compactHtmlAttributeValue(attr.value);
        if (/^on[a-z]/i.test(attr.name) || attr.name === "srcdoc") return true;
        if (attr.name === "style") {
          const compactCssValue = compactCssAttributeValue(attr.value);
          if (
            compactValue.includes("expression(") ||
            compactValue.includes("javascript:") ||
            compactValue.includes("vbscript:") ||
            isActiveDataUrl(compactValue) ||
            compactCssValue.includes("expression(") ||
            compactCssValue.includes("javascript:") ||
            compactCssValue.includes("vbscript:") ||
            isActiveDataUrl(compactCssValue)
          )
            return true;
        }
        if (
          URL_HTML_ATTRIBUTES.has(attr.name) &&
          (compactValue.startsWith("javascript:") ||
            compactValue.startsWith("vbscript:") ||
            isActiveDataUrl(compactValue))
        )
          return true;
      }
    }
    return false;
  }

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function containsTerm(text, term) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return false;
    return ` ${normalizeText(text)} `.includes(` ${normalizedTerm} `);
  }

  function hasForbiddenTerm(segment, terms = []) {
    return terms.some(
      (term) =>
        term?.isForbidden &&
        term.targetTerm &&
        containsTerm(segment.source, term.sourceTerm) &&
        containsTerm(segment.target, term.targetTerm)
    );
  }

  const EMPTY_TARGET_INTERCHANGE_FORMATS = new Set(["xlf", "xliff", "sdlxliff", "po", "pot", "ttx", "txml"]);
  const REVIEW_EXPORT_FORMATS = new Set(["project", "project-report", "quality-passport", "bilingual-docx"]);

  function deliveryExportPolicy({ format = "project", structure = null } = {}) {
    const exportFormat = String(format || "project")
      .trim()
      .toLowerCase();
    if (REVIEW_EXPORT_FORMATS.has(exportFormat)) return "review";
    if (EMPTY_TARGET_INTERCHANGE_FORMATS.has(exportFormat)) return "preserve-empty";
    if (exportFormat === "ts" && String(structure?.format || "").toLowerCase() === "ts-xml") return "preserve-empty";
    if (["csv", "tsv"].includes(exportFormat) && Number.isFinite(structure?.targetIndex) && structure.targetIndex >= 0)
      return "preserve-empty";
    return "source-fallback";
  }

  function planDeliveryExport({ format = "", documentInfo = null, structure = null, segments = [] } = {}) {
    const sourceSegments = Array.isArray(segments) ? segments : [];
    const policy = deliveryExportPolicy({ format: format || documentInfo?.type || "project", structure });
    let emptyTargetCount = 0;
    let draftTargetCount = 0;
    const exportSegments = sourceSegments.map((segment) => {
      const target = String(segment?.target ?? "");
      const empty = !target.trim();
      if (empty) emptyTargetCount += 1;
      else if (segment?.status !== "confirmed") draftTargetCount += 1;
      return {
        ...segment,
        target: empty && policy === "source-fallback" ? String(segment?.source ?? segment?.text ?? "") : target
      };
    });
    const sourceFallbackCount = policy === "source-fallback" ? emptyTargetCount : 0;
    const preservedEmptyTargetCount = policy === "preserve-empty" ? emptyTargetCount : 0;
    return {
      policy,
      segments: exportSegments,
      totalSegmentCount: sourceSegments.length,
      emptyTargetCount,
      sourceFallbackCount,
      preservedEmptyTargetCount,
      draftTargetCount,
      requiresConfirmation: policy !== "review" && Boolean(emptyTargetCount || draftTargetCount)
    };
  }

  function exportPlanSummary(plan) {
    return {
      policy: plan.policy,
      totalSegmentCount: plan.totalSegmentCount,
      emptyTargetCount: plan.emptyTargetCount,
      sourceFallbackCount: plan.sourceFallbackCount,
      preservedEmptyTargetCount: plan.preservedEmptyTargetCount,
      draftTargetCount: plan.draftTargetCount,
      requiresConfirmation: plan.requiresConfirmation
    };
  }

  function validateExportReadiness({
    project,
    segments = [],
    documentInfo = null,
    format = "project",
    terms = [],
    exportPlan = null,
    structure = null
  }) {
    const report = emptyReport();
    const exportFormat = String(format || "project").toLowerCase();
    const documentType = String(documentInfo?.type || "").toLowerCase();
    const localizationStructure = documentInfo ? project?.localizationStructures?.[documentInfo.id] : null;
    const plan =
      exportPlan ||
      planDeliveryExport({
        format: exportFormat,
        documentInfo,
        structure: structure || localizationStructure,
        segments
      });
    const effectiveSegments = Array.isArray(plan?.segments) ? plan.segments : segments;
    const reviewExport = plan?.policy === "review";
    const requiresCompleteTargets = !reviewExport;
    report.exportSummary = exportPlanSummary(plan);
    if (!project) add(report, "errors", "No project is open.");
    if (!segments.length && requiresCompleteTargets) {
      add(report, "errors", "No segments are available for delivery export.");
    } else if (!segments.length) {
      add(report, "warnings", "No segments are available for export.");
    }
    const emptyTargets = plan.emptyTargetCount;
    const draftTargets = plan.draftTargetCount;
    const authoredTargetSegments = segments.filter((segment) => String(segment.target || "").trim());
    const tagIssues = authoredTargetSegments.filter((segment) => missingProtectedTags(segment).length).length;
    const markupIssues = authoredTargetSegments.filter((segment) =>
      hasUnbalancedInlineMarkup(segment.target || "")
    ).length;
    const xmlCharIssues = isXmlDeliveryFormat(format, documentInfo)
      ? effectiveSegments.filter(
          (segment) => hasInvalidXmlCharacters(segment.source || "") || hasInvalidXmlCharacters(segment.target || "")
        ).length
      : 0;
    const unsafeHtmlIssues = isHtmlDeliveryFormat(format, documentInfo)
      ? effectiveSegments.filter((segment) => hasUnsafeHtmlMarkup(segment.target || "")).length
      : 0;
    const forbiddenTermIssues = terms.length
      ? authoredTargetSegments.filter((segment) => hasForbiddenTerm(segment, terms)).length
      : 0;
    if (emptyTargets && plan.policy === "source-fallback") {
      add(
        report,
        "warnings",
        `${emptyTargets} empty target segment${emptyTargets === 1 ? "" : "s"} will export source text.`
      );
    } else if (emptyTargets && plan.policy === "preserve-empty") {
      add(
        report,
        "warnings",
        `${emptyTargets} empty target segment${emptyTargets === 1 ? "" : "s"} will remain empty in the exported interchange file.`
      );
    } else if (emptyTargets) {
      add(
        report,
        "warnings",
        `${emptyTargets} empty target segment${emptyTargets === 1 ? "" : "s"} will be reported as untranslated.`
      );
    }
    if (draftTargets)
      add(
        report,
        "warnings",
        `${draftTargets} non-empty unconfirmed target segment${draftTargets === 1 ? "" : "s"} will export as written.`
      );
    if (tagIssues)
      add(report, "risky", `${tagIssues} segment${tagIssues === 1 ? "" : "s"} may be missing protected placeholders.`);
    if (markupIssues)
      add(report, "risky", `${markupIssues} segment${markupIssues === 1 ? "" : "s"} have unbalanced inline markup.`);
    if (xmlCharIssues)
      add(report, "risky", `${xmlCharIssues} segment${xmlCharIssues === 1 ? "" : "s"} contain XML-invalid characters.`);
    if (unsafeHtmlIssues)
      add(
        report,
        "risky",
        `${unsafeHtmlIssues} segment${unsafeHtmlIssues === 1 ? "" : "s"} contain unsafe HTML markup.`
      );
    if (forbiddenTermIssues)
      add(
        report,
        "risky",
        `${forbiddenTermIssues} segment${forbiddenTermIssues === 1 ? "" : "s"} contain forbidden terminology.`
      );
    if (documentInfo) add(report, "preserved", `${documentInfo.name || "Current file"} selected for ${format} export.`);
    if (format === "docx" && documentInfo && !project?.docxStructures?.[documentInfo.id] && !project?.docxStructure) {
      add(report, "errors", "DOCX reconstruction data is missing.");
    }
    if (documentInfo && LOCALIZATION_TYPES.has(documentType) && !localizationStructure) {
      if (documentType === "idml") add(report, "errors", "IDML reconstruction package data is missing.");
      else if (documentType === "xlf" || documentType === "xliff" || documentType === "sdlxliff")
        add(report, "errors", "XLIFF reconstruction source data is missing.");
      else
        add(
          report,
          "errors",
          `${documentInfo.name || "Current file"} original localization structure metadata is missing.`
        );
    }
    if (
      (format === "idml" || documentType === "idml") &&
      documentInfo &&
      localizationStructure &&
      !localizationStructure.packageBase64
    ) {
      add(report, "errors", "IDML reconstruction package data is missing.");
    }
    if (
      (format === "xlf" ||
        format === "xliff" ||
        format === "sdlxliff" ||
        documentType === "xlf" ||
        documentType === "xliff" ||
        documentType === "sdlxliff") &&
      documentInfo &&
      localizationStructure &&
      !localizationStructure.source
    ) {
      add(report, "errors", "XLIFF reconstruction source data is missing.");
    }
    if (documentInfo && localizationStructure) {
      const { requirement, missing } = missingSegmentReconstruction(segments, documentInfo.type || format);
      if (requirement && missing.length) {
        add(
          report,
          "errors",
          `${missing.length} ${requirement.label} segment${missing.length === 1 ? "" : "s"} missing ${requirement.issue}.`
        );
      }
    }
    const finalized = finalize(report);
    const deliveryRisk = tagIssues || markupIssues || xmlCharIssues || unsafeHtmlIssues || forbiddenTermIssues;
    const reviewRisk = xmlCharIssues;
    finalized.canExport = finalized.ok && !(reviewExport ? reviewRisk : deliveryRisk);
    return finalized;
  }

  function reportCount(report) {
    return ["errors", "warnings", "risky", "simplified", "skipped"].reduce(
      (sum, key) => sum + (report?.[key]?.length || 0),
      0
    );
  }

  function reportSummary(report) {
    if (!report) return "No validation report.";
    if (!report.ok) return `${report.errors.length} error${report.errors.length === 1 ? "" : "s"} found.`;
    const count = reportCount(report);
    return count ? `${count} validation note${count === 1 ? "" : "s"}.` : "No validation issues.";
  }

  window.CatHan = window.CatHan || {};
  window.CatHan.validation = {
    emptyReport,
    validateProjectPackage,
    validateBackupFile,
    planDeliveryExport,
    validateExportReadiness,
    missingProtectedTags,
    hasUnbalancedInlineMarkup,
    hasInvalidXmlCharacters,
    hasUnsafeHtmlMarkup,
    hasForbiddenTerm,
    reportCount,
    reportSummary
  };
})();
