const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rendererRoot = path.join(root, ".cache", "renderer");
const productionAssets = JSON.parse(fs.readFileSync(path.join(rendererRoot, "production", "assets.json"), "utf8"));
const testAssets = JSON.parse(fs.readFileSync(path.join(rendererRoot, "test", "assets.json"), "utf8"));
const rendererMetafile = JSON.parse(fs.readFileSync(path.join(rendererRoot, "metafile.json"), "utf8"));
const readGraph = (variant, assets) =>
  assets.map((asset) => fs.readFileSync(path.join(rendererRoot, variant, asset), "utf8")).join("\n");
const production = readGraph("production", productionAssets);
const test = readGraph("test", testAssets);
const productionIndex = fs.readFileSync(path.join(rendererRoot, "production", "index.html"), "utf8");
const desktopIndex = fs.readFileSync(path.join(rendererRoot, "production", "desktop-index.html"), "utf8");
const testIndex = fs.readFileSync(path.join(rendererRoot, "test", "index.html"), "utf8");
const forbiddenProductionMarkers = [
  "runAppWorkflowTest",
  "app-workflow-test",
  "_TEST_FLAG",
  "Simulated autosave save failure",
  "Simulated AI apply save failure",
  "APP WORKFLOW TEST"
];
const normalizePath = (value) => String(value || "").replaceAll("\\", "/");
const productionOutputs = Object.entries(rendererMetafile.production?.outputs || {});
const productionEntryOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/entry/production.js"
);
const providerInstallerOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/ai/providers/install-extracted-providers.js"
);
const reportDocumentOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/reports/report-document-composition-service.js"
);
const reportServicesOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/reports/install-report-services.js"
);
const localizationOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "localization.js"
);
const docxOutput = productionOutputs.find(([, output]) => normalizePath(output.entryPoint) === "docx.js");
const xliffOutput = productionOutputs.find(([, output]) => normalizePath(output.entryPoint) === "xliff.js");
const aiCommandControllersOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/ai/install-ai-command-controllers.js"
);
const aiCommandDomainOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "ai-command-domain.js"
);
const aiProjectBriefOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/ai/install-ai-project-brief-controller.js"
);
const aiOpenAiSuggestionOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/ai/install-ai-openai-suggestion-controller.js"
);
const aiSuggestionApplicationOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/ai/install-ai-suggestion-application-controller.js"
);
const deliveryExportOutput = productionOutputs.find(
  ([, output]) =>
    normalizePath(output.entryPoint) === "src/features/import-export/install-delivery-export-controller.js"
);
const projectResourceTransferOutput = productionOutputs.find(
  ([, output]) =>
    normalizePath(output.entryPoint) === "src/features/import-export/install-project-resource-transfer-controller.js"
);
const projectImportRestoreOutput = productionOutputs.find(
  ([, output]) =>
    normalizePath(output.entryPoint) === "src/features/import-export/install-project-import-restore-controller.js"
);
const projectDocumentImportOutput = productionOutputs.find(
  ([, output]) =>
    normalizePath(output.entryPoint) === "src/features/import-export/install-project-document-import-controller.js"
);
const resourceLibraryImportOutput = productionOutputs.find(
  ([, output]) =>
    normalizePath(output.entryPoint) === "src/features/resources/install-resource-library-import-controller.js"
);
const resourceMutationOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/resources/install-resource-mutation-controller.js"
);
const projectExportOutput = productionOutputs.find(
  ([, output]) => normalizePath(output.entryPoint) === "src/features/import-export/install-project-export-controller.js"
);
const aiCommandControllerSources = [
  "src/features/ai/ai-alternatives-controller.js",
  "src/features/ai/ai-draft-editing-controller.js",
  "src/features/ai/ai-pretranslation-controller.js",
  "src/features/ai/ai-review-controller.js",
  "src/features/ai/ai-tag-repair-controller.js",
  "src/features/ai/ai-terminology-application-controller.js",
  "src/features/ai/ai-terminology-extraction-controller.js"
];
const eagerProviderImplementationSources = [
  "src/ai/providers/anthropic-provider-adapter.js",
  "src/ai/providers/cohere-provider-adapter.js",
  "src/ai/providers/gemini-provider-adapter.js",
  "src/ai/providers/groq-provider-adapter.js",
  "src/ai/providers/hosted-provider-adapters.js",
  "src/ai/providers/native-chat-provider-adapters.js",
  "src/ai/providers/native-openai-provider-adapters.js",
  "src/ai/providers/ollama-provider-adapter.js",
  "src/ai/providers/openai-compatible-hosted-provider-adapter.js",
  "src/ai/providers/openai-compatible-provider-adapter.js",
  "src/ai/providers/openai-responses-provider-adapter.js",
  "src/ai/providers/opus-cat-provider-adapter.js",
  "src/ai/providers/perplexity-provider-adapter.js"
];

const failures = [];
for (const marker of forbiddenProductionMarkers) {
  if (production.includes(marker)) failures.push(`Production renderer contains test-only marker: ${marker}`);
}
if (!test.includes("app-workflow-test")) failures.push("Test renderer is missing the workflow-test route.");
if (!test.includes("runAppWorkflowTest"))
  failures.push("Test renderer is missing the workflow characterization driver.");
if (!productionIndex.includes('<script src="./bootstrap.js"></script>'))
  failures.push("Production index does not load the protocol-aware renderer bootstrap.");
if (!desktopIndex.includes('<script type="module" src="./app.js"></script>'))
  failures.push("Desktop index does not load the proven static ES-module renderer entry.");
if (desktopIndex.includes('<script src="./bootstrap.js"></script>'))
  failures.push("Desktop index must not use the file-protocol bootstrap.");
if (productionIndex.includes('storage.js"></script>'))
  failures.push("Production index still loads the legacy renderer script graph.");
if (!testIndex.includes('<script type="module" src="/renderer-test/app.js"></script>'))
  failures.push("Test index does not load the isolated test renderer entry.");
if (!productionAssets.some((asset) => asset.startsWith("chunks/") && asset.endsWith(".js")))
  failures.push("Production renderer is missing lazy ES-module chunks.");
if (!productionEntryOutput) {
  failures.push("Production renderer metafile is missing the hosted application entry.");
} else {
  const [, output] = productionEntryOutput;
  const providerChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/install-extracted-providers-")
  );
  if (!providerChunkImport) failures.push("Hosted startup entry does not lazy-load the extracted AI provider chunk.");
  const reportDocumentChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/report-document-composition-service-")
  );
  if (!reportDocumentChunkImport)
    failures.push("Hosted startup entry does not lazy-load the report-document composition chunk.");
  if (Object.hasOwn(output.inputs || {}, "src/reports/report-document-composition-service.js"))
    failures.push("Hosted startup entry eagerly contains report-document composition.");
  const reportServicesChunkImport = (output.imports || []).find(
    (entry) => entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/install-report-services-")
  );
  if (!reportServicesChunkImport)
    failures.push("Hosted startup entry does not lazy-load the consolidated report-services chunk.");
  const localizationChunkImport = (output.imports || []).find(
    (entry) => entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/localization-")
  );
  if (!localizationChunkImport)
    failures.push("Hosted startup entry does not lazy-load the localization implementation chunk.");
  if (Object.hasOwn(output.inputs || {}, "localization.js"))
    failures.push("Hosted startup entry eagerly contains the localization implementation.");
  const docxChunkImport = (output.imports || []).find(
    (entry) => entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/docx-")
  );
  if (!docxChunkImport) failures.push("Hosted startup entry does not lazy-load the DOCX implementation chunk.");
  if (Object.hasOwn(output.inputs || {}, "docx.js"))
    failures.push("Hosted startup entry eagerly contains the DOCX archive implementation.");
  if (!Object.hasOwn(output.inputs || {}, "protected-tags.js"))
    failures.push("Hosted startup entry is missing the synchronous protected-tag detector.");
  const xliffChunkImport = (output.imports || []).find(
    (entry) => entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/xliff-")
  );
  if (!xliffChunkImport) failures.push("Hosted startup entry does not lazy-load the XLIFF implementation chunk.");
  if (Object.hasOwn(output.inputs || {}, "xliff.js"))
    failures.push("Hosted startup entry eagerly contains the XLIFF implementation.");
  const aiCommandControllersChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/install-ai-command-controllers-")
  );
  if (!aiCommandControllersChunkImport)
    failures.push("Hosted startup entry does not lazy-load the optional AI command-controller implementations.");
  for (const source of aiCommandControllerSources) {
    if (Object.hasOwn(output.inputs || {}, source))
      failures.push(`Hosted startup entry eagerly contains AI command-controller implementation: ${source}`);
  }
  const aiCommandDomainChunkImport = (output.imports || []).find(
    (entry) => entry.kind === "dynamic-import" && normalizePath(entry.path).includes("/chunks/ai-command-domain-")
  );
  if (!aiCommandDomainChunkImport)
    failures.push("Hosted startup entry does not lazy-load the AI command-domain implementation.");
  if (Object.hasOwn(output.inputs || {}, "ai-command-domain.js"))
    failures.push("Hosted startup entry eagerly contains the AI command-domain implementation.");
  const deliveryExportChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-delivery-export-controller-")
  );
  if (!deliveryExportChunkImport)
    failures.push("Hosted startup entry does not lazy-load the delivery-export implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/import-export/delivery-export-controller.js"))
    failures.push("Hosted startup entry eagerly contains the delivery-export implementation.");
  const projectResourceTransferChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-project-resource-transfer-controller-")
  );
  if (!projectResourceTransferChunkImport)
    failures.push("Hosted startup entry does not lazy-load the project-resource transfer implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/import-export/project-resource-transfer-controller.js"))
    failures.push("Hosted startup entry eagerly contains the project-resource transfer implementation.");
  const projectImportRestoreChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-project-import-restore-controller-")
  );
  if (!projectImportRestoreChunkImport)
    failures.push("Hosted startup entry does not lazy-load the project-import/restore implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/import-export/project-import-restore-controller.js"))
    failures.push("Hosted startup entry eagerly contains the project-import/restore implementation.");
  const projectDocumentImportChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-project-document-import-controller-")
  );
  if (!projectDocumentImportChunkImport)
    failures.push("Hosted startup entry does not lazy-load the project-document import implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/import-export/project-document-import-controller.js"))
    failures.push("Hosted startup entry eagerly contains the project-document import implementation.");
  const resourceLibraryImportChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-resource-library-import-controller-")
  );
  if (!resourceLibraryImportChunkImport)
    failures.push("Hosted startup entry does not lazy-load the Resources-library import implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/resources/resource-library-import-controller.js"))
    failures.push("Hosted startup entry eagerly contains the Resources-library import implementation.");
  const resourceMutationChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-resource-mutation-controller-")
  );
  if (!resourceMutationChunkImport)
    failures.push("Hosted startup entry does not lazy-load the resource-mutation implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/resources/resource-mutation-controller.js"))
    failures.push("Hosted startup entry eagerly contains the resource-mutation implementation.");
  const aiProjectBriefChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-ai-project-brief-controller-")
  );
  if (!aiProjectBriefChunkImport)
    failures.push("Hosted startup entry does not lazy-load the AI project-brief implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/ai/ai-project-brief-controller.js"))
    failures.push("Hosted startup entry eagerly contains the AI project-brief implementation.");
  const aiOpenAiSuggestionChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-ai-openai-suggestion-controller-")
  );
  if (!aiOpenAiSuggestionChunkImport)
    failures.push("Hosted startup entry does not lazy-load the direct OpenAI suggestion implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/ai/ai-openai-suggestion-controller.js"))
    failures.push("Hosted startup entry eagerly contains the direct OpenAI suggestion implementation.");
  const aiSuggestionApplicationChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-ai-suggestion-application-controller-")
  );
  if (!aiSuggestionApplicationChunkImport)
    failures.push("Hosted startup entry does not lazy-load the AI suggestion-application implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/ai/ai-suggestion-application-controller.js"))
    failures.push("Hosted startup entry eagerly contains the AI suggestion-application implementation.");
  const projectExportChunkImport = (output.imports || []).find(
    (entry) =>
      entry.kind === "dynamic-import" &&
      normalizePath(entry.path).includes("/chunks/install-project-export-controller-")
  );
  if (!projectExportChunkImport)
    failures.push("Hosted startup entry does not lazy-load the project-export implementation.");
  if (Object.hasOwn(output.inputs || {}, "src/features/import-export/project-export-controller.js"))
    failures.push("Hosted startup entry eagerly contains the project-export implementation.");
  for (const source of [
    "src/reports/report-data-service.js",
    "src/reports/report-document.js",
    "src/reports/report-export-controller.js"
  ]) {
    if (Object.hasOwn(output.inputs || {}, source))
      failures.push(`Hosted startup entry eagerly contains report implementation: ${source}`);
  }
  for (const source of eagerProviderImplementationSources) {
    if (Object.hasOwn(output.inputs || {}, source))
      failures.push(`Hosted startup entry eagerly contains AI provider implementation: ${source}`);
  }
}
if (!aiSuggestionApplicationOutput) {
  failures.push("Production renderer metafile is missing the AI suggestion-application implementation chunk entry.");
} else {
  const [outputPath, output] = aiSuggestionApplicationOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("AI suggestion-application implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/ai/ai-suggestion-application-controller.js"))
    failures.push("AI suggestion-application implementation chunk is missing its controller source.");
}
if (!aiOpenAiSuggestionOutput) {
  failures.push("Production renderer metafile is missing the direct OpenAI suggestion implementation chunk entry.");
} else {
  const [outputPath, output] = aiOpenAiSuggestionOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Direct OpenAI suggestion implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/ai/ai-openai-suggestion-controller.js"))
    failures.push("Direct OpenAI suggestion implementation chunk is missing its controller source.");
}
if (!aiProjectBriefOutput) {
  failures.push("Production renderer metafile is missing the AI project-brief implementation chunk entry.");
} else {
  const [outputPath, output] = aiProjectBriefOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("AI project-brief implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/ai/ai-project-brief-controller.js"))
    failures.push("AI project-brief implementation chunk is missing its controller source.");
}
if (!projectExportOutput) {
  failures.push("Production renderer metafile is missing the project-export implementation chunk entry.");
} else {
  const [outputPath, output] = projectExportOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Project-export implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/import-export/project-export-controller.js"))
    failures.push("Project-export implementation chunk is missing its controller source.");
}
if (!resourceMutationOutput) {
  failures.push("Production renderer metafile is missing the resource-mutation implementation chunk entry.");
} else {
  const [outputPath, output] = resourceMutationOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Resource-mutation implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/resources/resource-mutation-controller.js"))
    failures.push("Resource-mutation implementation chunk is missing its controller source.");
}
if (!resourceLibraryImportOutput) {
  failures.push("Production renderer metafile is missing the Resources-library import implementation chunk entry.");
} else {
  const [outputPath, output] = resourceLibraryImportOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Resources-library import implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/resources/resource-library-import-controller.js"))
    failures.push("Resources-library import implementation chunk is missing its controller source.");
}
if (!projectDocumentImportOutput) {
  failures.push("Production renderer metafile is missing the project-document import implementation chunk entry.");
} else {
  const [outputPath, output] = projectDocumentImportOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Project-document import implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/import-export/project-document-import-controller.js"))
    failures.push("Project-document import implementation chunk is missing its controller source.");
}
if (!projectImportRestoreOutput) {
  failures.push("Production renderer metafile is missing the project-import/restore implementation chunk entry.");
} else {
  const [outputPath, output] = projectImportRestoreOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Project-import/restore implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/import-export/project-import-restore-controller.js"))
    failures.push("Project-import/restore implementation chunk is missing its controller source.");
}
if (!projectResourceTransferOutput) {
  failures.push("Production renderer metafile is missing the project-resource transfer implementation chunk entry.");
} else {
  const [outputPath, output] = projectResourceTransferOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Project-resource transfer implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/import-export/project-resource-transfer-controller.js"))
    failures.push("Project-resource transfer implementation chunk is missing its controller source.");
}
if (!deliveryExportOutput) {
  failures.push("Production renderer metafile is missing the delivery-export implementation chunk entry.");
} else {
  const [outputPath, output] = deliveryExportOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Delivery-export implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/features/import-export/delivery-export-controller.js"))
    failures.push("Delivery-export implementation chunk is missing its controller source.");
}
if (!aiCommandDomainOutput) {
  failures.push("Production renderer metafile is missing the AI command-domain implementation chunk entry.");
} else {
  const [outputPath, output] = aiCommandDomainOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("AI command-domain implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "ai-command-domain.js"))
    failures.push("AI command-domain implementation chunk is missing its source module.");
}
if (!aiCommandControllersOutput) {
  failures.push("Production renderer metafile is missing the AI command-controller implementation chunk entry.");
} else {
  const [outputPath, output] = aiCommandControllersOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("AI command-controller implementation chunk is missing from the production asset manifest.");
  for (const source of aiCommandControllerSources) {
    if (!Object.hasOwn(output.inputs || {}, source))
      failures.push(`AI command-controller implementation chunk is missing source: ${source}`);
  }
}
if (!xliffOutput) {
  failures.push("Production renderer metafile is missing the XLIFF implementation chunk entry.");
} else {
  const [outputPath, output] = xliffOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("XLIFF implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "xliff.js"))
    failures.push("XLIFF implementation chunk is missing its source module.");
}
if (!docxOutput) {
  failures.push("Production renderer metafile is missing the DOCX implementation chunk entry.");
} else {
  const [outputPath, output] = docxOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("DOCX implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "docx.js"))
    failures.push("DOCX implementation chunk is missing its source module.");
}
if (!localizationOutput) {
  failures.push("Production renderer metafile is missing the localization implementation chunk entry.");
} else {
  const [outputPath, output] = localizationOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Localization implementation chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "localization.js"))
    failures.push("Localization implementation chunk is missing its source module.");
}
if (!reportServicesOutput) {
  failures.push("Production renderer metafile is missing the consolidated report-services chunk entry.");
} else {
  const [outputPath, output] = reportServicesOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Consolidated report-services chunk is missing from the production asset manifest.");
  for (const source of [
    "src/reports/install-report-services.js",
    "src/reports/report-data-service.js",
    "src/reports/report-document.js",
    "src/reports/report-export-controller.js"
  ]) {
    if (!Object.hasOwn(output.inputs || {}, source))
      failures.push(`Consolidated report-services chunk is missing implementation source: ${source}`);
  }
}
if (!reportDocumentOutput) {
  failures.push("Production renderer metafile is missing the report-document composition chunk entry.");
} else {
  const [outputPath, output] = reportDocumentOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Report-document composition chunk is missing from the production asset manifest.");
  if (!Object.hasOwn(output.inputs || {}, "src/reports/report-document-composition-service.js"))
    failures.push("Report-document composition chunk is missing its implementation source.");
}
if (!providerInstallerOutput) {
  failures.push("Production renderer metafile is missing the extracted AI provider chunk entry.");
} else {
  const [outputPath, output] = providerInstallerOutput;
  const relativeOutputPath = normalizePath(path.relative(path.join(rendererRoot, "production"), outputPath));
  if (!productionAssets.includes(relativeOutputPath))
    failures.push("Extracted AI provider chunk is missing from the production asset manifest.");
  for (const source of eagerProviderImplementationSources) {
    if (!Object.hasOwn(output.inputs || {}, source))
      failures.push(`Extracted AI provider chunk is missing implementation source: ${source}`);
  }
}
for (const requiredAsset of ["app.js", "app-file.js", "bootstrap.js"]) {
  if (!productionAssets.includes(requiredAsset)) failures.push(`Production renderer is missing ${requiredAsset}.`);
}
if (!production.includes("loopcat-bootstrap"))
  failures.push("Production renderer is missing the allowlisted Trusted Types bootstrap policy.");
if (!productionAssets.every((asset) => fs.existsSync(path.join(rendererRoot, "production", asset))))
  failures.push("Production renderer asset manifest contains a missing file.");

if (failures.length) {
  console.error("Renderer build verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Renderer build verification passed (production graph ${Buffer.byteLength(production)} bytes across ${productionAssets.length} modules; test graph ${Buffer.byteLength(test)} bytes across ${testAssets.length} modules).`
);
