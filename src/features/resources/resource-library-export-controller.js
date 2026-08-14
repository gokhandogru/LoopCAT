/**
 * Owns standalone Resources-dashboard TMX/TBX export orchestration.
 * Resource lookup, builders, downloads, and status remain injected boundaries.
 *
 * @param {{
 *   resources: { labelFromKey: (key: string) => any, items: (type: string, key: string) => any[] },
 *   builders: { buildTmx: (items: any[], info: any) => any, buildTbx: (items: any[], info: any) => any },
 *   fileSafeName: (value: string) => string,
 *   download: (filename: string, content: any, type: string) => unknown,
 *   status: { set: (message: string, mode: string) => unknown }
 * }} options
 */
export function createResourceLibraryExportController(options) {
  const resources = options?.resources;
  const builders = options?.builders;
  const fileSafeName = options?.fileSafeName;
  const download = options?.download;
  const status = options?.status;
  if (
    typeof resources?.labelFromKey !== "function" ||
    typeof resources?.items !== "function" ||
    typeof builders?.buildTmx !== "function" ||
    typeof builders?.buildTbx !== "function" ||
    typeof fileSafeName !== "function" ||
    typeof download !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ResourceLibraryExportController requires resource, builder, filename, download, and status boundaries."
    );
  }

  function exportResource(type, key) {
    try {
      const info = resources.labelFromKey(key);
      const items = resources.items(type, key);
      if (type === "tm") {
        download(
          `${fileSafeName(info.name)}_${info.sourceLang}-${info.targetLang}.tmx`,
          builders.buildTmx(items, info),
          "application/xml"
        );
        status.set(`Exported ${items.length} TM entr${items.length === 1 ? "y" : "ies"}`, "saved");
        return;
      }
      download(
        `${fileSafeName(info.name)}_${info.sourceLang}-${info.targetLang}.tbx`,
        builders.buildTbx(items, info),
        "application/xml"
      );
      status.set(`Exported ${items.length} term${items.length === 1 ? "" : "s"}`, "saved");
    } catch (error) {
      status.set(error.message || "Resource export failed", "dirty");
    }
  }

  return Object.freeze({ exportResource });
}
