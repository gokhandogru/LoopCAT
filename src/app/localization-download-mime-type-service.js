export function createLocalizationDownloadMimeTypeService(dependencies = {}) {
  const { normalizeExtension, xliff } = dependencies || {};
  if (
    typeof normalizeExtension !== "function" ||
    !(xliff?.documentTypes instanceof Set) ||
    typeof xliff?.mimeType !== "function"
  ) {
    throw new TypeError("LocalizationDownloadMimeTypeService requires checked normalization and XLIFF boundaries.");
  }

  function forExtension(extension, structure = null) {
    const value = normalizeExtension(extension);
    if (xliff.documentTypes.has(value)) return xliff.mimeType(structure?.version || "1.2");
    if (["html", "htm"].includes(value)) return "text/html";
    if (value === "xhtml") return "application/xhtml+xml";
    if (value === "md" || value === "markdown") return "text/markdown";
    if (value === "json") return "application/json";
    if (value === "yaml" || value === "yml") return "application/yaml";
    if (value === "vtt") return "text/vtt";
    if (value === "ts" && structure?.format === "code-string") return "text/plain";
    if (value === "csv") return "text/csv";
    if (value === "tsv") return "text/tab-separated-values";
    if (["xml", "tmx", "dita", "txml", "ttx", "xini", "resx", "wix", "ts", "icml"].includes(value)) {
      return "application/xml";
    }
    if (value === "idml") return "application/vnd.adobe.indesign-idml-package";
    const packageTypes = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docm: "application/vnd.ms-word.document.macroEnabled.12",
      dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      dotm: "application/vnd.ms-word.template.macroEnabled.12",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
      xltm: "application/vnd.ms-excel.template.macroEnabled.12",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
      ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
      ppsm: "application/vnd.ms-powerpoint.slideshow.macroEnabled.12",
      potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
      potm: "application/vnd.ms-powerpoint.template.macroEnabled.12",
      odt: "application/vnd.oasis.opendocument.text",
      ott: "application/vnd.oasis.opendocument.text-template",
      ods: "application/vnd.oasis.opendocument.spreadsheet",
      ots: "application/vnd.oasis.opendocument.spreadsheet-template",
      odp: "application/vnd.oasis.opendocument.presentation",
      otp: "application/vnd.oasis.opendocument.presentation-template"
    };
    if (Object.hasOwn(packageTypes, value)) return packageTypes[value];
    return "text/plain";
  }

  return Object.freeze({ forExtension });
}
