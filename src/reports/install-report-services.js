import { createReportDataService } from "./report-data-service.js";
import { finalizeReportDocument } from "./report-document.js";
import { createReportExportController } from "./report-export-controller.js";

export function installReportServices(options) {
  const data = createReportDataService(options?.data);
  const exports = createReportExportController({
    ...options?.exports,
    data,
    finalizeDocument: finalizeReportDocument
  });
  return Object.freeze({ data, exports });
}
