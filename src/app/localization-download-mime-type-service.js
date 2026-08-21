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
    if (value === "md") return "text/markdown";
    if (value === "csv") return "text/csv";
    if (value === "tsv") return "text/tab-separated-values";
    if (["xml", "dita", "txml", "ttx", "xini", "resx", "wix", "ts", "icml"].includes(value)) {
      return "application/xml";
    }
    if (value === "idml") return "application/vnd.adobe.indesign-idml-package";
    if (
      ["docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(
        value
      )
    ) {
      return "application/vnd.openxmlformats-officedocument";
    }
    if (["odt", "ott", "ods", "ots", "odp", "otp"].includes(value)) {
      return "application/vnd.oasis.opendocument";
    }
    return "text/plain";
  }

  return Object.freeze({ forExtension });
}
