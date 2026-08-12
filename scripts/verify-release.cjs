const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

function readText(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath} is not valid JSON: ${error.message}`);
    return {};
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(text, snippet, message) {
  assert(text.includes(snippet), message);
}

function functionBody(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start === -1 ? 0 : start);
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start, end);
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanYamlScalar(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function pnpmImporterDevDependency(lockText, dependencyName) {
  const name = regexEscape(dependencyName);
  const pattern = new RegExp(
    `\\n\\s{6}['\"]?${name}['\"]?:\\r?\\n\\s{8}specifier:\\s*([^\\r\\n]+)\\r?\\n\\s{8}version:\\s*([^\\r\\n]+)`,
    "m"
  );
  const match = pattern.exec(lockText);
  if (!match) return null;
  return {
    specifier: cleanYamlScalar(match[1]),
    version: cleanYamlScalar(match[2]).split("(")[0]
  };
}

function normalizeLocalAsset(value) {
  const cleaned = String(value || "")
    .split("#")[0]
    .split("?")[0];
  if (!cleaned || cleaned.startsWith("data:") || /^[a-z]+:/i.test(cleaned) || cleaned.startsWith("//")) return "";
  return cleaned.replace(/^\.\//, "").replace(/^\/+/, "");
}

function localAssetsFromIndex(html) {
  const assets = [];
  const assetPattern = /<(script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = assetPattern.exec(html))) {
    const asset = normalizeLocalAsset(match[2]);
    if (asset) assets.push(asset);
  }
  return assets;
}

function packageIncludes(buildFiles, relativePath) {
  return buildFiles.some((entry) => {
    const normalizedEntry = entry.replaceAll("\\", "/");
    const normalizedPath = relativePath.replaceAll("\\", "/");
    if (normalizedEntry === normalizedPath) return true;
    if (normalizedEntry.endsWith("/**")) {
      const prefix = normalizedEntry.slice(0, -3);
      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    }
    return false;
  });
}

const requiredAppFiles = [
  "index.html",
  "styles.css",
  "liquid-glass/styles.css",
  "manifest.webmanifest",
  "service-worker.js",
  "config/production-assets.js",
  "icons/loopcat-icon.svg",
  "icons/loopcat-loopbird-mono.svg",
  "icons/loopcat-icon.png",
  "storage.js",
  "workspace-storage.js",
  "docx.js",
  "tm.js",
  "termbase.js",
  "tmx.js",
  "tbx.js",
  "encoding.js",
  "xliff.js",
  "localization.js",
  "qa.js",
  "validation.js",
  "analysis.js",
  "quality.js",
  "ai.js",
  "worker-client.js",
  "cat-worker.js",
  "project.js",
  "app.js",
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "README.md",
  "LICENSE",
  "NOTICE"
];

const requiredDesktopIconFiles = ["icons/loopcat-icon.ico", "icons/loopcat-icon.icns", "icons/loopcat-icon.png"];

const requiredReleaseFiles = [
  "pnpm-workspace.yaml",
  "scripts/build-desktop.cjs",
  "scripts/verify-release-provenance.cjs",
  "scripts/verify-release-provenance-selftest.cjs",
  "scripts/verify-signing-env.cjs",
  "scripts/verify-signing-env-selftest.cjs",
  "scripts/browser-runner-electron.cjs",
  "scripts/verify-browser-runner.cjs",
  "scripts/verify-live-ollama.cjs",
  "scripts/verify-live-ai-provider.cjs",
  "scripts/opus-cat-web-bridge.cjs",
  "scripts/build-web.cjs",
  "scripts/build-renderer.cjs",
  "scripts/verify-renderer-build.cjs",
  "scripts/prepare-desktop-app.cjs",
  "src/entry/file-production.js",
  "src/entry/production.js",
  "src/entry/renderer-bootstrap.js",
  "src/entry/test.js",
  "src/ai/providers/groq-provider-adapter.js",
  "src/ai/providers/hosted-provider-adapters.js",
  "src/ai/providers/install-extracted-providers.js",
  "src/ai/providers/native-chat-provider-adapters.js",
  "src/ai/providers/native-openai-provider-adapters.js",
  "src/ai/providers/openai-compatible-hosted-provider-adapter.js",
  "src/ai/providers/openai-responses-provider-adapter.js",
  "src/ai/providers/perplexity-provider-adapter.js",
  "src/commands/edit-target-session.js",
  "src/ui/dialog-controller.js",
  "src/features/ai/ai-administration-controller.js",
  "src/features/ai/opus-cat-help-controller.js",
  "src/features/projects/project-dialog-controller.js",
  "src/features/quality/quality-review-controller.js",
  "src/features/resources/resources-controller.js",
  "src/features/resources/tm-pretranslation-dialog-controller.js",
  "src/features/import-export/import-export-controller.js",
  "src/features/workspace/recovery-workspace-controller.js",
  "tests/unit/dialog-intent-controllers.test.cjs",
  "tests/unit/ai-administration-controller.test.cjs",
  "tests/unit/groq-provider-adapter.test.cjs",
  "tests/unit/hosted-provider-adapters.test.cjs",
  "tests/unit/native-chat-provider-adapters.test.cjs",
  "tests/unit/native-openai-provider-adapters.test.cjs",
  "tests/unit/perplexity-provider-adapter.test.cjs",
  "tests/unit/project-dialog-controller.test.cjs",
  "tests/unit/quality-review-controller.test.cjs",
  "tests/unit/import-export-controller.test.cjs",
  "tests/unit/recovery-workspace-controller.test.cjs",
  "tests/unit/resource-trash.test.cjs",
  "tests/unit/resources-controller.test.cjs",
  "scripts/generate-brand-icons.cjs",
  "scripts/publish-repository-downloads.cjs",
  "scripts/verify-web-artifact.cjs",
  "scripts/verify-web-smoke.cjs",
  "scripts/verify-desktop-wrapper.cjs",
  "scripts/verify-packaged-desktop-smoke.cjs",
  "scripts/verify-desktop-artifact.cjs",
  "scripts/verify-download-artifacts.cjs",
  "scripts/verify-download-artifacts-selftest.cjs",
  "scripts/verify-platform-signatures.cjs",
  "scripts/verify-platform-signatures-selftest.cjs",
  "scripts/generate-checksums.cjs",
  "scripts/verify-checksums.cjs",
  "scripts/verify-release-evidence.cjs",
  "scripts/verify-release-evidence-selftest.cjs",
  "scripts/capture-modernization-baseline.cjs",
  "scripts/verify-bundle-contract.cjs",
  "scripts/verify-bundle-contract-selftest.cjs",
  "scripts/bundle-contract.json",
  "config/production-assets.js",
  "scripts/verify-xliff22-schema.cjs",
  "scripts/verify-xliff22-schema.ps1",
  "tests/fixtures/xliff-2.2/core-inline-valid.xlf",
  "tests/fixtures/modernization/baseline-backup.json",
  "tests/schemas/xliff-2.2/xliff_core_2.2.xsd",
  "tests/schemas/xliff-2.2/metadata.xsd",
  "tests/schemas/xliff-2.2/xml.xsd",
  "docs/desktop-packaging.md",
  "docs/loopcat-package-format-v1.md",
  "docs/modernization-baseline.md",
  "docs/release-smoke-evidence-template.md"
];

for (const file of requiredAppFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required app file: ${file}`);
}
for (const file of requiredDesktopIconFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required desktop icon file: ${file}`);
}
for (const file of requiredReleaseFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required release file: ${file}`);
}

const packageJson = readJson("package.json");
const gitignore = readText(".gitignore");
const pnpmLock = readText("pnpm-lock.yaml");
const pnpmWorkspace = readText("pnpm-workspace.yaml");
const manifest = readJson("manifest.webmanifest");
const indexHtml = readText("index.html");
const regressionHtml = readText("regression-test.html");
const appJs = readText("app.js");
const commandBusJs = readText("src/commands/command-bus.js");
const editTargetSessionJs = readText("src/commands/edit-target-session.js");
const segmentCommandsJs = readText("src/commands/segment-commands.js");
const commandUnitTests = readText("tests/unit/commands.test.cjs");
const dialogControllerJs = readText("src/ui/dialog-controller.js");
const dialogControllerUnitTests = readText("tests/unit/dialog-controller.test.cjs");
const projectDialogControllerJs = readText("src/features/projects/project-dialog-controller.js");
const projectDialogControllerUnitTests = readText("tests/unit/project-dialog-controller.test.cjs");
const opusCatHelpControllerJs = readText("src/features/ai/opus-cat-help-controller.js");
const tmPretranslationDialogControllerJs = readText("src/features/resources/tm-pretranslation-dialog-controller.js");
const dialogIntentControllerUnitTests = readText("tests/unit/dialog-intent-controllers.test.cjs");
const aiAdministrationControllerJs = readText("src/features/ai/ai-administration-controller.js");
const aiAdministrationControllerUnitTests = readText("tests/unit/ai-administration-controller.test.cjs");
const groqProviderAdapterJs = readText("src/ai/providers/groq-provider-adapter.js");
const hostedProviderAdaptersJs = readText("src/ai/providers/hosted-provider-adapters.js");
const hostedProviderAdapterCoreJs = readText("src/ai/providers/openai-compatible-hosted-provider-adapter.js");
const nativeChatProviderAdaptersJs = readText("src/ai/providers/native-chat-provider-adapters.js");
const nativeOpenAiProviderAdaptersJs = readText("src/ai/providers/native-openai-provider-adapters.js");
const openAiResponsesProviderAdapterJs = readText("src/ai/providers/openai-responses-provider-adapter.js");
const perplexityProviderAdapterJs = readText("src/ai/providers/perplexity-provider-adapter.js");
const extractedProviderInstallerJs = readText("src/ai/providers/install-extracted-providers.js");
const groqProviderAdapterUnitTests = readText("tests/unit/groq-provider-adapter.test.cjs");
const hostedProviderAdaptersUnitTests = readText("tests/unit/hosted-provider-adapters.test.cjs");
const nativeChatProviderAdaptersUnitTests = readText("tests/unit/native-chat-provider-adapters.test.cjs");
const nativeOpenAiProviderAdaptersUnitTests = readText("tests/unit/native-openai-provider-adapters.test.cjs");
const perplexityProviderAdapterUnitTests = readText("tests/unit/perplexity-provider-adapter.test.cjs");
const productionEntryJs = readText("src/entry/production.js");
const qualityReviewControllerJs = readText("src/features/quality/quality-review-controller.js");
const qualityReviewControllerUnitTests = readText("tests/unit/quality-review-controller.test.cjs");
const recoveryWorkspaceControllerJs = readText("src/features/workspace/recovery-workspace-controller.js");
const recoveryWorkspaceControllerUnitTests = readText("tests/unit/recovery-workspace-controller.test.cjs");
const importExportControllerJs = readText("src/features/import-export/import-export-controller.js");
const importExportControllerUnitTests = readText("tests/unit/import-export-controller.test.cjs");
const resourcesControllerJs = readText("src/features/resources/resources-controller.js");
const resourcesControllerUnitTests = readText("tests/unit/resources-controller.test.cjs");
const resourceTrashUnitTests = readText("tests/unit/resource-trash.test.cjs");
const trashCommandsJs = readText("src/commands/trash-commands.js");
const trashRepositoryJs = readText("src/data/trash-repository.js");
const paletteControllerJs = readText("src/features/palette/palette-controller.js");
const updateControllerJs = readText("src/features/update/update-controller.js");
const safeHtmlJs = readText("src/security/safe-html.js");
const storageJs = readText("storage.js");
const workspaceStorageJs = readText("workspace-storage.js");
const aiJs = readText("ai.js");
const docxJs = readText("docx.js");
const xliffJs = readText("xliff.js");
const localizationJs = readText("localization.js");
const tmJs = readText("tm.js");
const termbaseJs = readText("termbase.js");
const tmxJs = readText("tmx.js");
const tbxJs = readText("tbx.js");
const encodingJs = readText("encoding.js");
const validationJs = readText("validation.js");
const packageFormatDocs = readText("docs/loopcat-package-format-v1.md");
const modernizationBaselineDocs = readText("docs/modernization-baseline.md");
const modernizationFixture = readJson("tests/fixtures/modernization/baseline-backup.json");
const bundleContract = readJson("scripts/bundle-contract.json");
const baselineCaptureScript = readText("scripts/capture-modernization-baseline.cjs");
const accessibilityVerificationScript = readText("scripts/verify-accessibility.cjs");
const bundleContractScript = readText("scripts/verify-bundle-contract.cjs");
const bundleContractSelfTestScript = readText("scripts/verify-bundle-contract-selftest.cjs");
const productionAssetsScript = readText("config/production-assets.js");
const productionAssets = require(path.join(root, "config", "production-assets.js"));
assert(
  productionAssets.appVersion === packageJson.version,
  "Canonical production asset manifest appVersion must match package.json."
);
const runtimeContract = readJson("config/runtime-contract.json");
const nodeVersionFile = readText(".node-version").trim();
const analysisJs = readText("analysis.js");
const qualityJs = readText("quality.js");
const catWorkerJs = readText("cat-worker.js");
const serviceWorker = readText("service-worker.js");
const readme = readText("README.md");
const license = readText("LICENSE");
const notice = readText("NOTICE");
const roadmap = readText("ROADMAP.md");
const securityPolicyTest = readText("security-policy-test.html");
const offlineShellTest = readText("offline-shell-test.html");
const workspaceStorageTest = readText("workspace-storage-test.html");
const packageRoundtripTest = readText("package-roundtrip-test.html");
const smokeTest = readText("smoke-test.html");
const regressionTest = readText("regression-test.html");
const testRunner = readText("test-runner.html");
const desktopMain = readText("desktop/main.cjs");
const desktopPreload = readText("desktop/preload.cjs");
const desktopRuntimeSettings = readText("desktop/runtime-settings.cjs");
const desktopBuildScript = readText("scripts/build-desktop.cjs");
const webBuildScript = readText("scripts/build-web.cjs");
const rendererBuildScript = readText("scripts/build-renderer.cjs");
const rendererVerifyScript = readText("scripts/verify-renderer-build.cjs");
const desktopStageScript = readText("scripts/prepare-desktop-app.cjs");
const webArtifactScript = readText("scripts/verify-web-artifact.cjs");
const releaseProvenanceScript = readText("scripts/verify-release-provenance.cjs");
const releaseProvenanceSelfTestScript = readText("scripts/verify-release-provenance-selftest.cjs");
const signingEnvScript = readText("scripts/verify-signing-env.cjs");
const signingEnvSelfTestScript = readText("scripts/verify-signing-env-selftest.cjs");
const browserRunnerMainScript = readText("scripts/browser-runner-electron.cjs");
const browserRunnerScript = readText("scripts/verify-browser-runner.cjs");
const liveOllamaScript = readText("scripts/verify-live-ollama.cjs");
const liveAiProviderScript = readText("scripts/verify-live-ai-provider.cjs");
const webSmokeScript = readText("scripts/verify-web-smoke.cjs");
const desktopWrapperScript = readText("scripts/verify-desktop-wrapper.cjs");
const packagedDesktopSmokeScript = readText("scripts/verify-packaged-desktop-smoke.cjs");
const electronFusesScript = readText("scripts/verify-electron-fuses.cjs");
const desktopArtifactScript = readText("scripts/verify-desktop-artifact.cjs");
const downloadArtifactsScript = readText("scripts/verify-download-artifacts.cjs");
const downloadArtifactsSelfTestScript = readText("scripts/verify-download-artifacts-selftest.cjs");
const platformSignaturesScript = readText("scripts/verify-platform-signatures.cjs");
const platformSignaturesSelfTestScript = readText("scripts/verify-platform-signatures-selftest.cjs");
const checksumScript = readText("scripts/generate-checksums.cjs");
const checksumVerifyScript = readText("scripts/verify-checksums.cjs");
const releaseEvidenceScript = readText("scripts/verify-release-evidence.cjs");
const releaseEvidenceSelfTestScript = readText("scripts/verify-release-evidence-selftest.cjs");
const desktopWorkflow = readText(".github/workflows/desktop-release.yml");
const desktopPackagingDocs = readText("docs/desktop-packaging.md");
const releaseSmokeTemplate = readText("docs/release-smoke-evidence-template.md");
const requiredAssets = new Set(requiredAppFiles);

assertIncludes(
  roadmap,
  "public release candidates must use the documented signing/notarization credentials",
  "ROADMAP.md release gate must require signed/notarized public desktop artifacts."
);
assert(
  !roadmap.includes("Build unsigned Windows, macOS, and Linux artifacts"),
  "ROADMAP.md must not present unsigned cross-platform artifacts as the public release path."
);
assertIncludes(
  gitignore,
  "test-artifacts/",
  ".gitignore must exclude generated browser profiles and smoke-test artifacts."
);
assertIncludes(gitignore, "dist/", ".gitignore must exclude generated desktop release artifacts.");
assertIncludes(gitignore, "dist-web/", ".gitignore must exclude generated static web release artifacts.");
assertIncludes(gitignore, ".cache/", ".gitignore must exclude local Electron/Electron Builder caches.");

for (const asset of localAssetsFromIndex(indexHtml)) requiredAssets.add(asset);
for (const icon of manifest.icons || []) {
  const asset = normalizeLocalAsset(icon.src);
  if (asset) requiredAssets.add(asset);
}

assert(packageJson.main === "desktop/main.cjs", "package.json main must point to desktop/main.cjs.");
assert(packageJson.scripts && packageJson.scripts.desktop, "package.json must expose a desktop run script.");
assert(
  packageJson.scripts?.["build:renderer"] === "node scripts/build-renderer.cjs",
  "package.json must expose the renderer build boundary."
);
assert(
  packageJson.scripts?.["verify:renderer"] ===
    "node scripts/build-renderer.cjs && node scripts/verify-renderer-build.cjs",
  "package.json must expose production/test renderer verification."
);
assert(packageJson.scripts && packageJson.scripts.dist, "package.json must expose a desktop distribution script.");
assert(
  packageJson.scripts?.["verify:baseline"] === "node scripts/capture-modernization-baseline.cjs --verify",
  "package.json must expose the deterministic modernization baseline verifier."
);
assert(
  packageJson.scripts?.["verify:bundle-contract"] === "node scripts/verify-bundle-contract.cjs",
  "package.json must expose the production bundle contract verifier."
);
assert(
  packageJson.scripts?.["verify:bundle-contract-selftest"] === "node scripts/verify-bundle-contract-selftest.cjs",
  "package.json must expose the bundle contract self-test."
);
assert(
  packageJson.scripts?.checksums === "node scripts/generate-checksums.cjs",
  "package.json checksums script must generate SHA-256 sums."
);

assertIncludes(
  storageJs,
  "const DB_VERSION = 6;",
  "storage.js local database schema must be version 6 after the additive Trash migration."
);
assertIncludes(
  validationJs,
  "const MIN_SCHEMA_VERSION = 3;",
  "validation.js must continue accepting package schema version 3."
);
assertIncludes(
  validationJs,
  "const MAX_PACKAGE_SCHEMA_VERSION = 5;",
  "validation.js must identify package schema version 5 as the current maximum."
);
assertIncludes(
  validationJs,
  "const MAX_BACKUP_SCHEMA_VERSION = 6;",
  "validation.js must accept default backups containing schema-6 Trash data."
);
assertIncludes(
  workspaceStorageJs,
  "const PACKAGE_SCHEMA_VERSION = window.CatHan.storage.constants.PROJECT_PACKAGE_SCHEMA_VERSION;",
  "workspace storage must consume the project-package schema contract without a stale numeric fallback."
);
assert(
  !appJs.includes("storageConstants?.SCHEMA_VERSION ||"),
  "app.js must not use a stale numeric schema fallback when writing packages or backups."
);
assertIncludes(packageFormatDocs, "Current version: `5`", "Project-package documentation must name schema version 5.");
assertIncludes(
  packageFormatDocs,
  "`3` through `5`",
  "Project-package documentation must describe the accepted schema range 3 through 5."
);
assert(modernizationFixture.schemaVersion === 5, "Modernization fixture must use the current schema version 5.");
assert(
  Array.isArray(modernizationFixture.projects) && modernizationFixture.projects.length === 1,
  "Modernization fixture must contain one deterministic project."
);
assert(
  Array.isArray(modernizationFixture.segments) && modernizationFixture.segments.length >= 6,
  "Modernization fixture must contain representative segment states."
);
assert(
  bundleContract.mode === "source-test-isolated",
  "Bundle contract must characterize the isolated source test driver while production renderer checks enforce its exclusion."
);
assert(
  bundleContract.knownMarkers?.["app.js"]?.runAppWorkflowTest === 4,
  "Bundle contract must lock the characterized workflow-test entry count."
);
assertIncludes(
  bundleContractScript,
  "forbidden production marker",
  "Bundle contract verifier must reject new test/debug markers."
);
assertIncludes(
  bundleContractSelfTestScript,
  "Injected test-only global was not rejected",
  "Bundle contract self-test must prove injected test globals fail."
);
assertIncludes(
  webBuildScript,
  'runNodeScript("verify-bundle-contract.cjs")',
  "Static web builds must enforce the production bundle contract before packaging."
);
assertIncludes(
  desktopBuildScript,
  'runNodeScript("verify-bundle-contract.cjs")',
  "Desktop builds must enforce the production bundle contract before packaging."
);
assertIncludes(baselineCaptureScript, "1440x900", "Modernization capture must cover 1440x900.");
assertIncludes(baselineCaptureScript, "1366x768", "Modernization capture must cover 1366x768.");
assertIncludes(baselineCaptureScript, "1024x768", "Modernization capture must cover 1024x768.");
assertIncludes(
  modernizationBaselineDocs,
  "performance targets are not claimed as achieved",
  "Modernization baseline must distinguish measured evidence from future performance targets."
);
assert(
  packageJson.scripts?.["verify:provenance"] === "node scripts/verify-release-provenance.cjs",
  "package.json verify:provenance script must verify release Git provenance."
);
assertIncludes(
  pnpmWorkspace,
  "electron: true",
  "pnpm-workspace.yaml must explicitly allow Electron's pinned install script for deterministic desktop builds."
);
assert(
  packageJson.scripts?.["verify:provenance-selftest"] === "node scripts/verify-release-provenance-selftest.cjs",
  "package.json verify:provenance-selftest script must exercise release provenance verifier failure modes."
);
assert(
  packageJson.scripts?.["verify:xliff22-schema"] === "node scripts/verify-xliff22-schema.cjs",
  "package.json verify:xliff22-schema script must validate XLIFF 2.2 fixtures against the vendored OASIS schema."
);
assert(
  packageJson.scripts?.["verify:signing-env"] === "node scripts/verify-signing-env.cjs",
  "package.json verify:signing-env script must verify platform signing inputs."
);
assert(
  packageJson.scripts?.["verify:signing-env-selftest"] === "node scripts/verify-signing-env-selftest.cjs",
  "package.json verify:signing-env-selftest script must exercise signing environment verifier failure modes."
);
assert(
  packageJson.scripts?.["verify:browser-runner"] === "node scripts/verify-browser-runner.cjs",
  "package.json verify:browser-runner script must execute the browser test runner."
);
assert(
  packageJson.scripts?.["verify:ai-sidebar-ux"] === "node scripts/verify-ai-sidebar-ux.cjs",
  "package.json verify:ai-sidebar-ux script must execute the AI sidebar UX verifier."
);
assert(
  packageJson.scripts?.["verify:ollama-live"] === "node scripts/verify-live-ollama.cjs",
  "package.json verify:ollama-live script must run the optional live Ollama verifier."
);
assert(
  packageJson.scripts?.["verify:ai-live"] === "node scripts/verify-live-ai-provider.cjs",
  "package.json verify:ai-live script must run the optional live hosted AI provider verifier."
);
assert(
  packageJson.scripts?.["opuscat:web-bridge"] === "node scripts/opus-cat-web-bridge.cjs",
  "package.json opuscat:web-bridge script must start the local OPUS-CAT browser bridge."
);
assert(
  packageJson.scripts?.["dist:web"] === "node scripts/build-web.cjs",
  "package.json dist:web script must build the static HTML distribution artifact."
);
assert(
  packageJson.scripts?.["dist:html"] === "node scripts/build-web.cjs",
  "package.json dist:html script must alias the static HTML distribution build."
);
assert(
  packageJson.scripts?.["verify:web-artifact"] === "node scripts/verify-web-artifact.cjs",
  "package.json verify:web-artifact script must verify the static HTML distribution artifact."
);
assert(
  packageJson.scripts?.["verify:web-smoke"] === "node scripts/verify-web-smoke.cjs",
  "package.json verify:web-smoke script must render-smoke the static HTML distribution artifact."
);
assert(
  packageJson.scripts?.["verify:desktop-wrapper"] === "node scripts/verify-desktop-wrapper.cjs",
  "package.json verify:desktop-wrapper script must inspect the desktop protocol wrapper."
);
assert(
  packageJson.scripts?.["verify:desktop-smoke"] === "node scripts/verify-packaged-desktop-smoke.cjs",
  "package.json verify:desktop-smoke script must launch the packaged desktop app."
);
assert(
  packageJson.scripts?.["verify:artifact"] === "node scripts/verify-desktop-artifact.cjs",
  "package.json verify:artifact script must inspect packaged desktop payloads."
);
assert(
  packageJson.scripts?.["verify:download-artifacts"] === "node scripts/verify-download-artifacts.cjs",
  "package.json verify:download-artifacts script must verify platform download artifacts."
);
assert(
  packageJson.scripts?.["verify:download-artifacts-selftest"] === "node scripts/verify-download-artifacts-selftest.cjs",
  "package.json verify:download-artifacts-selftest script must exercise download artifact rule failure modes."
);
assert(
  packageJson.scripts?.["verify:download-bundle"] === "node scripts/verify-download-artifacts.cjs --all",
  "package.json verify:download-bundle script must verify the final all-platform public download bundle."
);
assert(
  packageJson.scripts?.["verify:platform-signatures"] === "node scripts/verify-platform-signatures.cjs",
  "package.json verify:platform-signatures script must verify platform signatures and notarization."
);
assert(
  packageJson.scripts?.["verify:platform-signatures-selftest"] ===
    "node scripts/verify-platform-signatures-selftest.cjs",
  "package.json verify:platform-signatures-selftest script must exercise platform signature artifact rule failure modes."
);
assert(
  packageJson.scripts?.["verify:evidence"] === "node scripts/verify-release-evidence.cjs",
  "package.json verify:evidence script must validate completed release smoke evidence."
);
assert(
  packageJson.scripts?.["verify:evidence-selftest"] === "node scripts/verify-release-evidence-selftest.cjs",
  "package.json verify:evidence-selftest script must exercise release evidence verifier failure modes."
);
assert(
  packageJson.scripts?.["verify:checksums"] === "node scripts/verify-checksums.cjs",
  "package.json verify:checksums script must verify SHA-256 sums."
);
assert(packageJson.license === "Apache-2.0", "package.json license must publish LoopCAT under Apache-2.0.");
assert(packageJson.author?.name === "Dr. Gokhan Dogru", "package.json author must credit Dr. Gokhan Dogru.");
assert(
  packageJson.author?.url === "https://www.linkedin.com/in/gokhan-dogru-localization/",
  "package.json author URL must link Dr. Gokhan Dogru's LinkedIn profile."
);
assertIncludes(license, "Apache License", "LICENSE must contain the Apache License title.");
assertIncludes(license, "Version 2.0, January 2004", "LICENSE must contain Apache License 2.0 text.");
assertIncludes(
  license,
  "https://www.apache.org/licenses/LICENSE-2.0",
  "LICENSE must point to the Apache License 2.0 URL."
);
assertIncludes(notice, "Copyright 2026 Dr. Gokhan Dogru", "NOTICE must preserve Dr. Gokhan Dogru's copyright notice.");
assertIncludes(notice, "Co-created with Codex", "NOTICE must preserve the Codex co-creation attribution.");
assertIncludes(
  notice,
  "https://www.linkedin.com/in/gokhan-dogru-localization/",
  "NOTICE must link Dr. Gokhan Dogru's LinkedIn profile."
);

assertIncludes(
  liveOllamaScript,
  "normalizeOllamaBaseUrl",
  "scripts/verify-live-ollama.cjs must normalize Ollama root and /api URLs like the app."
);
assertIncludes(
  liveOllamaScript,
  'ollamaApiUrl(baseUrl, "/tags")',
  "scripts/verify-live-ollama.cjs must verify Ollama model listing through /api/tags."
);
assertIncludes(
  liveOllamaScript,
  'ollamaApiUrl(baseUrl, "/chat")',
  "scripts/verify-live-ollama.cjs must verify Ollama non-streaming chat pretranslation through /api/chat."
);
assertIncludes(
  liveOllamaScript,
  "OLLAMA_API_KEY",
  "scripts/verify-live-ollama.cjs must support hosted Ollama API keys through environment variables."
);
assertIncludes(
  liveOllamaScript,
  "Hosted Ollama requires an API key",
  "scripts/verify-live-ollama.cjs must fail hosted Ollama verification before network calls when no key is supplied."
);
assertIncludes(
  liveOllamaScript,
  "stream: false",
  "scripts/verify-live-ollama.cjs must mirror LoopCAT's initial non-streaming Ollama chat workflow."
);

assertIncludes(
  liveAiProviderScript,
  "const PROVIDERS = {",
  "scripts/verify-live-ai-provider.cjs must keep a centralized live provider registry."
);
assertIncludes(
  liveAiProviderScript,
  "openai:",
  "scripts/verify-live-ai-provider.cjs must verify OpenAI live-provider wiring."
);
assertIncludes(
  liveAiProviderScript,
  "gemini:",
  "scripts/verify-live-ai-provider.cjs must verify Gemini live-provider wiring."
);
assertIncludes(
  liveAiProviderScript,
  "deepseek:",
  "scripts/verify-live-ai-provider.cjs must verify DeepSeek live-provider wiring."
);
assertIncludes(
  liveAiProviderScript,
  "mistral:",
  "scripts/verify-live-ai-provider.cjs must verify Mistral live-provider wiring."
);
assertIncludes(
  liveAiProviderScript,
  "OPENAI_API_KEY",
  "scripts/verify-live-ai-provider.cjs must load OpenAI keys from environment variables."
);
assertIncludes(
  liveAiProviderScript,
  "GEMINI_API_KEY",
  "scripts/verify-live-ai-provider.cjs must load Gemini keys from environment variables."
);
assertIncludes(
  liveAiProviderScript,
  "store: false",
  "scripts/verify-live-ai-provider.cjs must disable provider-side storage where supported."
);
assertIncludes(
  liveAiProviderScript,
  "disable_search: true",
  "scripts/verify-live-ai-provider.cjs must disable Perplexity search for translation probes."
);
assertIncludes(
  liveAiProviderScript,
  'defaultModel: "~openai/gpt-latest"',
  "scripts/verify-live-ai-provider.cjs must keep the OpenRouter live default aligned with the AI Command Centre preset."
);
assertIncludes(
  liveAiProviderScript,
  "allowNoKeyWhenLoopback",
  "scripts/verify-live-ai-provider.cjs must allow keyless OpenAI-compatible loopback probes."
);
assertIncludes(
  liveAiProviderScript,
  "--strict-model-check",
  "scripts/verify-live-ai-provider.cjs must support strict model-list verification."
);

assertIncludes(
  releaseProvenanceScript,
  "basicGitMetadataFailure",
  "scripts/verify-release-provenance.cjs must check that local Git metadata exists before spawning Git."
);
assertIncludes(
  releaseProvenanceScript,
  "gitExecutableFailure",
  "scripts/verify-release-provenance.cjs must check that a usable Git executable is available before release provenance Git commands."
);
assertIncludes(
  releaseProvenanceScript,
  "Set GIT_BIN to a usable Git executable before packaging",
  "scripts/verify-release-provenance.cjs must report missing Git executables with a clear remediation."
);
assertIncludes(
  releaseProvenanceScript,
  "Git metadata is incomplete",
  "scripts/verify-release-provenance.cjs must report incomplete Git metadata clearly."
);
assertIncludes(
  releaseProvenanceScript,
  'git(["status", "--porcelain"]',
  "scripts/verify-release-provenance.cjs must reject dirty release checkouts."
);
assertIncludes(
  releaseProvenanceScript,
  "GITHUB_SHA",
  "scripts/verify-release-provenance.cjs must compare GitHub release SHA to checked-out HEAD."
);
assertIncludes(
  releaseProvenanceScript,
  "expectedTag = `v${packageJson.version}`",
  "scripts/verify-release-provenance.cjs must derive the expected release tag from package.json."
);
assertIncludes(
  releaseProvenanceScript,
  "Release tag",
  "scripts/verify-release-provenance.cjs must reject tag releases that do not match package.json."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "missing-git-metadata",
  "scripts/verify-release-provenance-selftest.cjs must exercise missing Git metadata rejection."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "empty-git-directory",
  "scripts/verify-release-provenance-selftest.cjs must exercise empty .git directory rejection."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "invalid-git-worktree-file",
  "scripts/verify-release-provenance-selftest.cjs must exercise invalid .git worktree file rejection."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "missing-linked-gitdir",
  "scripts/verify-release-provenance-selftest.cjs must exercise missing linked gitdir rejection."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "missing-git-executable",
  "scripts/verify-release-provenance-selftest.cjs must exercise missing Git executable rejection."
);
assertIncludes(
  releaseProvenanceSelfTestScript,
  "Release provenance verifier self-test passed",
  "scripts/verify-release-provenance-selftest.cjs must report a clear passing result."
);
assertIncludes(
  releaseEvidenceScript,
  '"Release provenance verified"',
  "scripts/verify-release-evidence.cjs must require release provenance evidence."
);
assertIncludes(
  releaseSmokeTemplate,
  "Release provenance verified",
  "Release smoke evidence template must require release provenance evidence."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:provenance -- --allow-untagged",
  "Desktop release workflow must verify release provenance before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:provenance-selftest",
  "Desktop release workflow must self-test release provenance validation before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:fuses",
  "Desktop release workflow must verify packaged Electron security fuses."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:quality",
  "Desktop release workflow must run static and focused quality gates."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:a11y",
  "Desktop release workflow must run automated accessibility checks."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:provenance",
  "Desktop packaging docs must document release provenance verification."
);
assertIncludes(
  desktopPackagingDocs,
  "DeepSeek, Mistral AI, xAI, Perplexity Sonar, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, and Fireworks AI",
  "Desktop packaging docs must document the explicit hosted AI provider network allowlist."
);
assertIncludes(
  desktopPackagingDocs,
  "local OPUS-CAT `MTRestService` actions on port `8500`",
  "Desktop packaging docs must document the local OPUS-CAT MT Engine network allowlist."
);
assertIncludes(readme, "pnpm run dist:web", "README.md must document the static HTML distribution build.");
assertIncludes(
  readme,
  "dist-web",
  "README.md must document that static HTML artifacts are written outside desktop dist."
);
assertIncludes(readme, "pnpm run verify:web-smoke", "README.md must document static HTML smoke verification.");
assertIncludes(readme, "pnpm run verify:provenance", "README.md must document release provenance verification.");
assertIncludes(readme, "Apache License 2.0", "README.md must document the Apache-2.0 license.");
assertIncludes(readme, "OPUS-CAT MT Engine", "README.md must document the OPUS-CAT MT Engine connector.");
assertIncludes(
  readme,
  "MTRestService/ListSupportedLanguagePairs",
  "README.md must document the OPUS-CAT local connection check endpoint."
);
assertIncludes(readme, "http://127.0.0.1:8502", "README.md must document the OPUS-CAT browser bridge base URL.");
assertIncludes(
  webBuildScript,
  `require(generatedProductionAssetsPath)`,
  "scripts/build-web.cjs must consume the generated production asset manifest."
);
assertIncludes(
  webArtifactScript,
  `require(generatedManifestPath)`,
  "scripts/verify-web-artifact.cjs must verify the generated production asset manifest."
);
for (const requiredWebAsset of ["LICENSE", "NOTICE", "scripts/opus-cat-web-bridge.cjs"]) {
  assert(
    productionAssets.webDistributionAssets.includes(requiredWebAsset),
    `Production asset manifest must include ${requiredWebAsset} in the static web artifact.`
  );
}
assertIncludes(indexHtml, `id="aboutBtn"`, "index.html must expose the product About button.");
assertIncludes(indexHtml, `id="aboutDialog"`, "index.html must expose the product About dialog.");
assertIncludes(
  indexHtml,
  `id="segmentToolsMenuSummary"`,
  "the editor must expose a stable visible focus-return target for Segment tools dialogs."
);
assertIncludes(indexHtml, `id="opusCatHelpDialog"`, "index.html must expose actionable OPUS-CAT web connection help.");
assertIncludes(
  indexHtml,
  `id="localAiOpusCatHelpBtn"`,
  "AI Command Centre must expose OPUS-CAT connection help after a failed test."
);
assertIncludes(
  indexHtml,
  "http://localhost:8500/MTRestService/ListSupportedLanguagePairs?tokenCode=0",
  "OPUS-CAT help must link the local engine diagnostic endpoint."
);
assertIncludes(
  indexHtml,
  "https://helsinki-nlp.github.io/OPUS-CAT/install",
  "OPUS-CAT help must link the official installation guide."
);
assertIncludes(
  indexHtml,
  "node scripts/opus-cat-web-bridge.cjs",
  "OPUS-CAT help must document the cross-platform bridge command without requiring npm."
);
assertIncludes(
  indexHtml,
  "Co-created by Dr. Gokhan Dogru and Codex",
  "index.html About dialog must credit Dr. Gokhan Dogru and Codex."
);
assertIncludes(
  indexHtml,
  "https://www.linkedin.com/in/gokhan-dogru-localization/",
  "index.html About dialog must link Dr. Gokhan Dogru's LinkedIn profile."
);
assertIncludes(
  dialogControllerJs,
  "focusController.showModal",
  "the checked dialog lifecycle must delegate containment and focus restoration to the shared focus controller."
);
assertIncludes(
  dialogControllerJs,
  "definition.returnTarget || definition.opener",
  "registered dialogs must expose an explicit visible focus-return target."
);
assertIncludes(appJs, 'id: "about"', "app.js must register About with the checked dialog lifecycle controller.");
assertIncludes(
  appJs,
  'id: "diagnostics"',
  "app.js must register Diagnostics with the checked dialog lifecycle controller."
);
assertIncludes(appJs, 'id: "trash"', "app.js must register Trash with the checked dialog lifecycle controller.");
assert(
  !appJs.includes('els.aboutBtn.addEventListener("click"') &&
    !appJs.includes('els.closeTrashBtn?.addEventListener("click"') &&
    !appJs.includes('els.closeDiagnosticsBtn?.addEventListener("click"'),
  "migrated synchronous dialogs must not retain superseded app.js lifecycle listeners."
);
assertIncludes(
  dialogControllerUnitTests,
  "DialogController owns open, close, cancel, and explicit focus-return lifecycle",
  "focused tests must characterize the synchronous dialog lifecycle."
);
assertIncludes(
  appJs,
  "dialog lifecycle controller restores the Trash opener after cancel and close",
  "the app workflow must characterize native cancel/close focus restoration for migrated dialogs."
);
assertIncludes(
  projectDialogControllerJs,
  "dialogLifecycle.register({",
  "the checked project dialog controller must register through the shared dialog lifecycle."
);
assertIncludes(
  projectDialogControllerJs,
  'id: "project"',
  "the checked project dialog controller must own the canonical project dialog registration."
);
assertIncludes(
  projectDialogControllerJs,
  "beforeOpen: prepare",
  "project dialog data and UI preparation must complete before the modal opens."
);
assertIncludes(
  projectDialogControllerJs,
  "options.renderResourcePickers?.(project)",
  "project resource rendering must remain an injected feature boundary."
);
assert(
  !appJs.includes('els.newProjectBtn.addEventListener("click"') &&
    !appJs.includes('els.projectChooseWorkspaceBtn.addEventListener("click"') &&
    !appJs.includes('els.projectForm.addEventListener("submit"') &&
    !appJs.includes("state.projectDialogMode"),
  "the migrated project dialog must not retain superseded app.js listener or mode ownership."
);
assertIncludes(
  projectDialogControllerUnitTests,
  "ProjectDialogController prepares create mode asynchronously and delegates form save",
  "focused tests must characterize async create preparation and persistence delegation."
);
assertIncludes(
  appJs,
  "project dialog controller opens the requested AI settings context",
  "the application workflow must characterize the AI settings project-dialog deep link."
);
assertIncludes(
  tmPretranslationDialogControllerJs,
  'id: "tm-pretranslation"',
  "the checked TM prompt controller must register through the shared dialog lifecycle."
);
assertIncludes(
  tmPretranslationDialogControllerJs,
  'dialog.returnValue === "apply" ? thresholdInput.value : null',
  "the checked TM prompt controller must preserve apply-versus-cancel intent without owning TM data."
);
assertIncludes(
  opusCatHelpControllerJs,
  'id: "opus-cat-help"',
  "the checked OPUS-CAT help controller must register through the shared dialog lifecycle."
);
assertIncludes(
  opusCatHelpControllerJs,
  "await retryConnection()",
  "the checked OPUS-CAT help controller must delegate connection retry instead of owning provider logic."
);
assertIncludes(
  appJs,
  "createTmPretranslationDialogController",
  "app.js must compose the checked TM threshold prompt controller."
);
assertIncludes(
  functionBody(appJs, "function requestTmPretranslationThreshold", "async function pretranslateFromTm"),
  "returnTarget: els.segmentToolsMenuSummary",
  "the TM prompt must restore focus to the visible Segment tools trigger rather than its collapsed menu item."
);
assertIncludes(appJs, "createOpusCatHelpController", "app.js must compose the checked OPUS-CAT help controller.");
assert(
  !appJs.includes("function showManagedDialog") &&
    !appJs.includes('els.localAiOpusCatHelpBtn?.addEventListener("click"') &&
    !appJs.includes('els.closeOpusCatHelpBtn?.addEventListener("click"') &&
    !appJs.includes('els.retryOpusCatConnectionBtn?.addEventListener("click"') &&
    !functionBody(appJs, "function requestTmPretranslationThreshold", "async function pretranslateFromTm").includes(
      'addEventListener("close"'
    ),
  "migrated TM and OPUS-CAT dialogs must not retain superseded app.js lifecycle listeners."
);
assertIncludes(
  dialogIntentControllerUnitTests,
  "TM pretranslation dialog controller resolves apply and cancel intent through the shared lifecycle",
  "focused tests must characterize TM threshold intent and lifecycle behavior."
);
assertIncludes(
  dialogIntentControllerUnitTests,
  "OPUS-CAT help controller owns visibility, dialog registration, retry, and listener cleanup",
  "focused tests must characterize OPUS-CAT help entry points and retry ownership."
);
assertIncludes(
  appJs,
  "TM threshold cancellation restores focus to the visible Segment tools control",
  "the app workflow must characterize TM prompt cancellation and focus return to the visible menu trigger."
);
assertIncludes(
  appJs,
  "OPUS-CAT help close restores focus to the visible connection-help entry point",
  "the app workflow must characterize OPUS-CAT help focus return above Project settings."
);
assertIncludes(
  aiAdministrationControllerJs,
  'listen(elements.saveSettingsButton, "click"',
  "the checked AI administration controller must own the global AI settings event lifecycle."
);
assertIncludes(
  aiAdministrationControllerJs,
  'listen(providerPresetSelect, "change"',
  "the checked AI administration controller must own provider-preset selection events."
);
assertIncludes(
  aiAdministrationControllerJs,
  "renderProviderSummary(view.summary || {})",
  "the checked AI administration controller must own provider-summary presentation."
);
assertIncludes(
  aiAdministrationControllerJs,
  "outputObserver?.disconnect?.()",
  "the checked AI administration controller must clean up output-disclosure observation."
);
assertIncludes(
  aiAdministrationControllerJs,
  "function renderOutput",
  "the checked AI administration controller must own command-centre output presentation."
);
assert(
  !aiAdministrationControllerJs.includes("innerHTML") &&
    !aiAdministrationControllerJs.includes("insertAdjacentHTML") &&
    !aiAdministrationControllerJs.includes("localStorage") &&
    !aiAdministrationControllerJs.includes("sessionStorage") &&
    !aiAdministrationControllerJs.includes("fetch(") &&
    !aiAdministrationControllerJs.includes("ai.js") &&
    !aiAdministrationControllerJs.includes("command-bus") &&
    !aiAdministrationControllerJs.includes("buildTranslate"),
  "the AI administration controller must use safe DOM construction and must not own credentials, providers, prompts, network calls, or commands."
);
assertIncludes(
  appJs,
  "createAiAdministrationController",
  "app.js must compose the checked AI administration controller with injected application actions."
);
assert(
  !appJs.includes('els.saveAiSettingsBtn?.addEventListener("click"') &&
    !appJs.includes('els.contextualAiTranslateBtn?.addEventListener("click"') &&
    !appJs.includes('els.openAiSuggestionBtn.addEventListener("click"') &&
    !appJs.includes('els.localAiPresetSelect?.addEventListener("change"') &&
    !appJs.includes('els.localAiProviderSelect?.addEventListener("change"') &&
    !appJs.includes('els.localAiPullModelBtn?.addEventListener("click"') &&
    !appJs.includes('els.clearOpenAiKeyBtn.addEventListener("click"'),
  "the migrated AI administration and command-centre surfaces must not retain superseded static listeners in app.js."
);
assert(
  !functionBody(appJs, "function localAiSettingsFromForm", "function assertLocalAiEndpointAllowed").includes(
    "els.localAi"
  ) &&
    !functionBody(appJs, "function renderLocalAiCommandCentre", "async function persistLocalAiSettings").includes(
      "els.localAi"
    ) &&
    (appJs.slice(0, appJs.indexOf("const runAppWorkflowTest")).match(/els\.localAiPromptOutput/g) || []).length === 1,
  "AI provider form values, command-centre rendering, and output presentation must be owned by the checked controller."
);
assertIncludes(
  aiAdministrationControllerUnitTests,
  "owns provider and command action lifecycle without owning AI effects",
  "focused tests must characterize AI administration event delegation and cleanup."
);
assertIncludes(
  aiAdministrationControllerUnitTests,
  "renders provider details with safe DOM construction",
  "focused tests must characterize safe AI provider-summary rendering."
);
assertIncludes(
  appJs,
  "checked AI administration controller owns provider form values and safe summary rendering",
  "the app workflow must characterize provider form ownership and safe rendering through the checked controller."
);
assertIncludes(
  appJs,
  "checked AI administration controller owns prompt preview events and output disclosure",
  "the app workflow must characterize AI prompt events and output disclosure through the checked controller."
);
assertIncludes(
  indexHtml,
  'class="resource-tabs" role="tablist" aria-label="Resource type"',
  "Resources must expose one semantic keyboard-operated tab list."
);
assertIncludes(
  resourcesControllerJs,
  'listen(viewButton, "click"',
  "the checked Resources controller must own Resources navigation event lifecycle."
);
assertIncludes(
  resourcesControllerJs,
  'listen(tmDashboard, "click"',
  "the checked Resources controller must delegate dynamic dashboard actions from one stable listener."
);
assertIncludes(
  resourcesControllerJs,
  'listen(tmDetail, "click"',
  "the checked Resources controller must delegate dynamic row actions from one stable listener."
);
assertIncludes(
  resourcesControllerJs,
  'handleImport(tmImportInput, "TMX resource import"',
  "the checked Resources controller must route empty-state and file-input TMX imports through the resource input."
);
assertIncludes(
  appJs,
  "createResourcesController",
  "app.js must compose the checked Resources controller with injected domain actions."
);
assert(
  !functionBody(appJs, "const state = {", "const els = {").includes('  resourceType: "tm",') &&
    !functionBody(appJs, "const state = {", "const els = {").includes("  openResource: null,") &&
    !functionBody(appJs, "const state = {", "const els = {").includes("  resourceTmEntries: [],") &&
    !functionBody(appJs, "const state = {", "const els = {").includes("  resourceTerms: [],") &&
    !appJs.includes('els.resourcesViewBtn.addEventListener("click"') &&
    !appJs.includes('els.tmResourceTab.addEventListener("click"') &&
    !appJs.includes('els.resourceTmxImportInput.addEventListener("change"'),
  "the migrated Resources family must not retain view-local state or superseded static listeners in app.js."
);
assert(
  !functionBody(appJs, "function renderResourceDashboard", "function canAddResourceToCurrentProject").includes(
    "addEventListener"
  ) &&
    !functionBody(appJs, "function renderTmEntryRow", "function renderTermRow").includes("addEventListener") &&
    !functionBody(appJs, "function renderTermRow", "async function confirmDeleteResource").includes("addEventListener"),
  "Resources dashboards and rows must use controller-owned event delegation rather than per-render listeners."
);
assertIncludes(
  resourcesControllerUnitTests,
  "ResourcesController owns tab state, selection, rendering, and keyboard navigation",
  "focused tests must characterize Resources view state and keyboard tab behavior."
);
assertIncludes(
  resourcesControllerUnitTests,
  "ResourcesController delegates imports, resource cards, rows, and cleanup without owning domain data",
  "focused tests must characterize Resources event delegation and unmount cleanup."
);
assertIncludes(
  appJs,
  "checked Resources controller owns navigation, dashboard open intent, detail rendering, and initial focus",
  "the app workflow must characterize the checked Resources controller in the real application."
);
assertIncludes(
  appJs,
  "Resources detail close restores focus to the originating resource card action",
  "the app workflow must characterize visible focus return after closing resource detail."
);
assertIncludes(
  qualityReviewControllerJs,
  'listen(reviewForm, "submit"',
  "the checked quality/review controller must own the review form event lifecycle."
);
assertIncludes(
  qualityReviewControllerJs,
  'listen(qualityForm, "submit"',
  "the checked quality/review controller must own the quality-profile event lifecycle."
);
assertIncludes(
  qualityReviewControllerJs,
  'listen(qualityRiskList, "click"',
  "the checked quality/review controller must delegate dynamic risk navigation from one stable listener."
);
assertIncludes(
  qualityReviewControllerJs,
  "restoreRiskFocus(activeRiskSegmentId)",
  "the checked quality/review controller must restore risk-action focus across rendering."
);
assert(
  !qualityReviewControllerJs.includes("innerHTML") && !qualityReviewControllerJs.includes("insertAdjacentHTML"),
  "the extracted quality/review renderer must build user-visible evidence with safe DOM construction."
);
assertIncludes(
  appJs,
  "createQualityReviewController",
  "app.js must compose the checked quality/review controller with injected domain actions."
);
assert(
  !appJs.includes('els.reviewForm?.addEventListener("submit"') &&
    !appJs.includes('els.qualityForm?.addEventListener("submit"') &&
    !appJs.includes('els.qualityDecisionForm?.addEventListener("submit"') &&
    !appJs.includes('els.refreshQualityRiskBtn?.addEventListener("click"') &&
    !appJs.includes('els.nextQualityRiskBtn?.addEventListener("click"') &&
    !appJs.includes('els.exportQualityPassportBtn?.addEventListener("click"'),
  "the migrated quality/review family must not retain superseded static listeners in app.js."
);
assert(
  !functionBody(appJs, "function renderReviewPanel", "function qualityLabel").includes("replaceSafeHtml") &&
    !functionBody(appJs, "function renderQualityWorkbench", "async function saveQualityProfileFromForm").includes(
      "createElement"
    ),
  "quality/review DOM construction must live in the checked controller rather than app.js."
);
assert(
  !functionBody(appJs, "async function saveQualityProfileFromForm", "async function refreshQualityRiskQueue").includes(
    ".value"
  ) &&
    !functionBody(appJs, "async function saveActiveReviewMetadata", "async function setActiveReviewState").includes(
      ".value"
    ),
  "quality/review domain saves must consume controller values instead of reading form DOM directly."
);
assertIncludes(
  qualityReviewControllerUnitTests,
  "owns form and action events without owning domain mutations",
  "focused tests must characterize quality/review event delegation and domain separation."
);
assertIncludes(
  qualityReviewControllerUnitTests,
  "preserves active form edits and restores risk focus across rendering",
  "focused tests must characterize quality/review focus and in-progress form preservation."
);
assertIncludes(
  appJs,
  "checked quality/review controller owns review submit, persistence delegation, and form refresh",
  "the app workflow must characterize the checked review form in the real application."
);
assertIncludes(
  appJs,
  "checked quality/review controller owns workbench rendering and redacted view state",
  "the app workflow must characterize quality rendering through the checked controller."
);
assertIncludes(
  recoveryWorkspaceControllerJs,
  'listen(chooseWorkspaceButton, "click"',
  "the checked recovery/workspace controller must own the primary workspace action lifecycle."
);
assertIncludes(
  recoveryWorkspaceControllerJs,
  'listen(saveRecoveryButton, "click"',
  "the checked recovery/workspace controller must own recovery-save intent."
);
assertIncludes(
  recoveryWorkspaceControllerJs,
  "event.stopPropagation?.()",
  "the recovery-folder action must not be cancelled by the application outside-click listener."
);
assertIncludes(
  recoveryWorkspaceControllerJs,
  "if (hadFocus) restoreMenuFocus()",
  "the checked recovery/workspace controller must restore visible focus when recovery UI disappears."
);
assert(
  !recoveryWorkspaceControllerJs.includes("innerHTML") && !recoveryWorkspaceControllerJs.includes("insertAdjacentHTML"),
  "the extracted recovery/workspace renderer must build external folder and warning labels with safe DOM construction."
);
assert(
  !recoveryWorkspaceControllerJs.includes("workspace-storage") &&
    !recoveryWorkspaceControllerJs.includes("localStorage") &&
    !recoveryWorkspaceControllerJs.includes("buildProjectPackage") &&
    !recoveryWorkspaceControllerJs.includes("importProjectPackageData"),
  "the recovery/workspace controller must not own directory handles, dirty-marker persistence, packages, or import policy."
);
assertIncludes(
  appJs,
  "createRecoveryWorkspaceController",
  "app.js must compose the checked recovery/workspace controller with injected domain actions."
);
assert(
  !appJs.includes('els.workspaceRecoverySaveBtn.addEventListener("click"') &&
    !appJs.includes('els.workspaceRecoveryOpenBtn.addEventListener("click"') &&
    !appJs.includes('els.workspaceRecoveryDismissBtn.addEventListener("click"') &&
    !appJs.includes('els.chooseWorkspaceBtn.addEventListener("click"') &&
    !appJs.includes('els.saveWorkspaceProjectBtn.addEventListener("click"') &&
    !appJs.includes('els.syncWorkspaceBtn.addEventListener("click"') &&
    !appJs.includes('els.workspaceBackupBtn.addEventListener("click"') &&
    !appJs.includes('els.repairWorkspaceBtn.addEventListener("click"'),
  "the migrated recovery/workspace family must not retain superseded static listeners in app.js."
);
assert(
  !functionBody(appJs, "function renderWorkspaceStatus", "function workspaceRecoveryProjectIds").includes(
    "replaceSafeHtml"
  ) &&
    !functionBody(appJs, "function renderWorkspaceRecoveryPanel", "function daysBetween").includes("replaceSafeHtml"),
  "workspace health and recovery DOM construction must live in the checked controller rather than app.js."
);
assertIncludes(
  recoveryWorkspaceControllerUnitTests,
  "owns workspace actions without owning storage or recovery policy",
  "focused tests must characterize recovery/workspace event delegation and domain separation."
);
assertIncludes(
  recoveryWorkspaceControllerUnitTests,
  "owns recovery dismissal and restores visible focus",
  "focused tests must characterize recovery dismissal and focus restoration."
);
assertIncludes(
  appJs,
  "checked recovery/workspace controller renders startup recovery state without owning dirty markers",
  "the app workflow must characterize startup recovery rendering through the checked controller."
);
assertIncludes(
  appJs,
  "checked recovery/workspace controller opens the workspace menu without document-click cancellation",
  "the app workflow must characterize recovery folder access and focus in the real application."
);
assertIncludes(
  importExportControllerJs,
  'listen(projectFileImportInput, "change"',
  "the checked import/export controller must own multi-file project import events."
);
assertIncludes(
  importExportControllerJs,
  'importSingle(projectPackageImportInput, "Project package import"',
  "the checked import/export controller must own project-package import events."
);
assertIncludes(
  importExportControllerJs,
  'importSingle(backupImportInput, "Backup restore"',
  "the checked import/export controller must own browser-backup restore events."
);
assertIncludes(
  importExportControllerJs,
  'listen(validationMeta, "click"',
  "the checked import/export controller must own validation dismissal through one stable listener."
);
assertIncludes(
  importExportControllerJs,
  "restoreValidationFocus()",
  "the checked import/export controller must restore visible focus after validation dismissal."
);
assert(
  !importExportControllerJs.includes("innerHTML") &&
    !importExportControllerJs.includes("insertAdjacentHTML") &&
    !importExportControllerJs.includes("storage.js") &&
    !importExportControllerJs.includes("workspace-storage") &&
    !importExportControllerJs.includes("download(") &&
    !importExportControllerJs.includes("parse"),
  "the import/export controller must use safe DOM construction and must not own storage, parsing, or download policy."
);
assertIncludes(
  appJs,
  "createImportExportController",
  "app.js must compose the checked import/export controller with injected domain actions."
);
assert(
  !appJs.includes('els.projectFileImportBtn.addEventListener("click"') &&
    !appJs.includes('els.projectsImportProjectBtn?.addEventListener("click"') &&
    !appJs.includes('els.docxInput.addEventListener("change"') &&
    !appJs.includes('els.localizationInput.addEventListener("change"') &&
    !appJs.includes('els.projectFileImportInput.addEventListener("change"') &&
    !appJs.includes('els.projectPackageImportInput.addEventListener("change"') &&
    !appJs.includes('els.backupImportInput.addEventListener("change"') &&
    !appJs.includes('els.tmxImportInput.addEventListener("change"') &&
    !appJs.includes('els.tbxImportInput.addEventListener("change"') &&
    !appJs.includes('els.termListImportInput.addEventListener("change"') &&
    !appJs.includes('els.exportProjectReportBtn.addEventListener("click"') &&
    !appJs.includes('els.backupExportBtn.addEventListener("click"'),
  "the migrated import/export/report family must not retain superseded static listeners in app.js."
);
assert(
  !functionBody(appJs, "function renderValidationReport", "async function renderProjectAnalysis").includes(
    "replaceSafeHtml"
  ),
  "validation-report DOM construction must live in the checked controller rather than app.js."
);
assertIncludes(
  importExportControllerUnitTests,
  "owns project, package, backup, TM, termbase, and report actions",
  "focused tests must characterize import/export/report event delegation and cleanup."
);
assertIncludes(
  importExportControllerUnitTests,
  "renders validation safely and restores focus on dismissal",
  "focused tests must characterize safe validation rendering and focus restoration."
);
assertIncludes(
  appJs,
  "checked import/export controller owns shared busy state while an import task runs",
  "the app workflow must characterize shared import busy state through the checked controller."
);
assertIncludes(
  appJs,
  "checked import/export controller delegates project report export",
  "the app workflow must characterize report export through the checked controller."
);
assertIncludes(
  appJs,
  "checked import/export controller restores validation focus after dismissal",
  "the app workflow must characterize validation dismissal and visible focus return."
);
assertIncludes(
  indexHtml,
  `id="saveStatus" class="save-status" role="status" aria-live="polite"`,
  "index.html must expose save and operation status as a polite live region."
);
assertIncludes(
  indexHtml,
  `id="commandPaletteOverlay" class="command-palette-overlay hidden" aria-hidden="true"`,
  "index.html must keep the closed command palette out of the accessibility tree."
);
assertIncludes(appJs, "syncPanelToggleState", "app.js must keep disclosure names and expanded states synchronized.");
assertIncludes(
  paletteControllerJs,
  "focusController.open(overlay",
  "PaletteController must contain and restore command-palette focus."
);
assertIncludes(
  commandBusJs,
  "recordApplied",
  "CommandBus must record already-applied coalesced edits without replaying input mutations."
);
assertIncludes(
  segmentCommandsJs,
  "createEditTargetCommand",
  "Segment commands must expose the reversible EditTarget boundary."
);
assertIncludes(
  editTargetSessionJs,
  "commandBus.recordApplied(command, command.appliedResult())",
  "EditTarget sessions must create one command receipt when a typing session is finalized."
);
assertIncludes(
  appJs,
  "restoreSegmentEditCommandPatch",
  "app.js must restore coalesced target patches through the persistent command boundary."
);
assertIncludes(
  appJs,
  "clearPendingSave(segment, { finalizeEdit: false })",
  "ordinary target input must retain one EditTarget session while resetting the autosave timer."
);
assertIncludes(
  appJs,
  "one coalesced EditTarget Undo restores target state, history, provenance, persistence, and selection",
  "the app workflow must characterize coalesced target-edit Undo."
);
assertIncludes(
  appJs,
  "Ctrl/Cmd+Z inside the target editor uses coalesced EditTarget Undo and restores focus",
  "the app workflow must characterize the editor's coalesced EditTarget keyboard shortcut."
);
assertIncludes(
  commandUnitTests,
  "failed EditTarget Undo preserves the applied state and remains retryable",
  "focused command tests must cover EditTarget transaction failure recovery."
);
assertIncludes(
  segmentCommandsJs,
  "createCopySourceToTargetCommand",
  "Segment commands must expose a discrete CopySourceToTarget boundary."
);
assertIncludes(
  segmentCommandsJs,
  "createInsertTmTargetCommand",
  "Segment commands must expose a reversible TM/concordance insertion boundary."
);
assertIncludes(
  segmentCommandsJs,
  "createInsertProtectedTagCommand",
  "Segment commands must expose a reversible protected-tag insertion boundary."
);
assertIncludes(
  appJs,
  "copy source finalizes pending typing, records a redacted command, and marks the workspace dirty",
  "the app workflow must characterize target-producer takeover and Undo ordering."
);
assertIncludes(
  appJs,
  "concordance insertion uses the same reversible target command with distinct provenance",
  "the app workflow must characterize concordance insertion provenance."
);
assertIncludes(
  appJs,
  "protected-tag Redo restores the target patch and post-insert caret with a monotonic revision",
  "the app workflow must characterize protected-tag persistence and caret restoration."
);
assertIncludes(
  commandUnitTests,
  "discrete target producers preserve patches, provenance boundaries, selection, and retryable Undo",
  "focused command tests must cover target-producer transaction failure recovery."
);
assertIncludes(
  segmentCommandsJs,
  "createTmPretranslationCommand",
  "Segment commands must expose an atomic TM pretranslation boundary."
);
assertIncludes(
  segmentCommandsJs,
  "createAiPretranslationCommand",
  "Segment commands must expose an atomic AI pretranslation boundary."
);
assertIncludes(
  segmentCommandsJs,
  "BATCH_RECEIPT_ID_LIMIT",
  "batch command receipts must keep affected segment IDs bounded."
);
assertIncludes(
  appJs,
  "restoreBatchTargetCommandPatches",
  "batch pretranslation Undo/Redo must share the persistent target-patch restoration boundary."
);
assertIncludes(
  appJs,
  "mid-batch AI cancellation rolls back provider output and records no partial command",
  "the app workflow must characterize AI pretranslation cancellation rollback."
);
assertIncludes(
  appJs,
  "TM pretranslation transaction failure restores every visible and persisted target",
  "the app workflow must characterize atomic TM pretranslation failure recovery."
);
assertIncludes(
  appJs,
  "Local AI pretranslation Undo restores target, history, AI provenance, review state, and persistence",
  "the app workflow must characterize AI pretranslation Undo."
);
assertIncludes(
  commandUnitTests,
  "batch pretranslation commands bound receipts and restore every private target patch atomically",
  "focused command tests must cover batch receipt bounds and atomic recovery."
);
assertIncludes(
  segmentCommandsJs,
  "createSplitSegmentCommand",
  "Segment commands must expose a reversible SplitSegment boundary."
);
assertIncludes(
  storageJs,
  "writeSegmentStructureAtomically",
  "structural segment writes and created-segment deletion must share one IndexedDB transaction."
);
assertIncludes(
  appJs,
  "restoreSplitSegmentCommandSegments",
  "SplitSegment Undo/Redo must share the atomic structural restoration boundary."
);
assertIncludes(
  appJs,
  '{ id: "split-segment", label: "Split segment"',
  "the command palette and segment button must route through the same split action."
);
assertIncludes(
  commandUnitTests,
  "SplitSegment restores ordering with a stable created ID and retryable atomic Undo",
  "focused command tests must cover SplitSegment identity and failed-Undo recovery."
);
assertIncludes(
  segmentCommandsJs,
  "createMergeSegmentCommand",
  "Segment commands must expose an independently reversible MergeSegment boundary."
);
assertIncludes(
  appJs,
  "restoreMergeSegmentCommandSegments",
  "MergeSegment Undo/Redo must share the atomic structural restoration boundary."
);
assertIncludes(
  appJs,
  '{ id: "merge-segments", label: "Merge with next segment"',
  "the command palette and segment button must route through the same merge action."
);
assertIncludes(
  commandUnitTests,
  "MergeSegment restores the deleted segment with stable IDs and retryable atomic Undo",
  "focused command tests must cover MergeSegment identity, initial failure, and failed-Undo recovery."
);
assertIncludes(
  webSmokeScript,
  "const artifactName = `${productName} Web ${packageJson.version}.zip`;",
  "scripts/verify-web-smoke.cjs must open the versioned static HTML artifact."
);
assertIncludes(
  webSmokeScript,
  "BrowserWindow",
  "scripts/verify-web-smoke.cjs must render the static HTML artifact in Electron."
);
assertIncludes(
  webSmokeScript,
  "document.documentElement.scrollWidth",
  "scripts/verify-web-smoke.cjs must check for viewport-level horizontal overflow."
);
assertIncludes(
  webSmokeScript,
  "controlOverflow",
  "scripts/verify-web-smoke.cjs must check visible controls for horizontal overflow."
);
assertIncludes(
  webSmokeScript,
  "frameworkOverlay",
  "scripts/verify-web-smoke.cjs must reject framework/runtime error overlays."
);
assertIncludes(
  webSmokeScript,
  "updateReadyVisible",
  "scripts/verify-web-smoke.cjs must reject first-load offline shell update notices."
);
assertIncludes(
  webSmokeScript,
  "mobileProjectRailHidden",
  "scripts/verify-web-smoke.cjs must reject the duplicate mobile project rail above dashboard controls."
);
assertIncludes(
  webSmokeScript,
  "projectsModeSidebarHidden",
  "scripts/verify-web-smoke.cjs must reject editor sidebar flashes in Projects mode."
);
assertIncludes(
  webSmokeScript,
  "projectNameInput",
  "scripts/verify-web-smoke.cjs must prove the New project dialog opens and focuses the project name field."
);
assertIncludes(webSmokeScript, "desktop", "scripts/verify-web-smoke.cjs must smoke test a desktop viewport.");
assertIncludes(webSmokeScript, "mobile", "scripts/verify-web-smoke.cjs must smoke test a mobile viewport.");
assert(
  packageJson.scripts?.pack === "node scripts/build-desktop.cjs --dir",
  "package.json pack script must use the desktop build wrapper."
);
assert(
  packageJson.scripts?.dist === "node scripts/build-desktop.cjs",
  "package.json dist script must use the desktop build wrapper."
);
assert(
  packageJson.scripts?.["dist:win"] === "node scripts/build-desktop.cjs --win nsis portable",
  "package.json dist:win script must use the desktop build wrapper."
);
assert(
  packageJson.scripts?.["dist:mac"] === "node scripts/build-desktop.cjs --mac dmg zip",
  "package.json dist:mac script must use the desktop build wrapper."
);
assert(
  packageJson.scripts?.["dist:linux"] === "node scripts/build-desktop.cjs --linux AppImage deb",
  "package.json dist:linux script must use the desktop build wrapper."
);
assert(/^\d+\.\d+\.\d+/.test(packageJson.version || ""), "package.json version must be a concrete semver release.");
assert(packageJson.packageManager === "pnpm@11.0.7", "package.json must pin the pnpm package manager version.");
assert(packageJson.engines?.node === ">=24 <25", "package.json must require the Node 24 LTS release line.");
assert(nodeVersionFile === "24", ".node-version must select Node 24 LTS.");
assertIncludes(desktopWorkflow, "node-version: 24", "Desktop release workflow must run on Node 24 LTS.");
assert(
  packageJson.devDependencies?.electron === runtimeContract.electronVersion,
  "Electron must match the officially verified supported runtime contract."
);
assert(
  Number(runtimeContract.electronMajor) === Number(String(runtimeContract.electronVersion).split(".")[0]),
  "Runtime contract Electron major must match its pinned version."
);
assert(
  Date.now() < Date.parse(`${runtimeContract.electronEndOfLife}T00:00:00Z`),
  "Pinned Electron has reached its recorded end-of-life date; recheck the official schedule and upgrade."
);
const packageAuthorEmail =
  typeof packageJson.author === "string"
    ? /<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/.exec(packageJson.author)?.[1]
    : packageJson.author?.email;
assert(
  /^https:\/\/[^/\s]+/i.test(packageJson.homepage || ""),
  "package.json must define an HTTPS homepage for desktop package metadata."
);
assert(
  /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(packageAuthorEmail || ""),
  "package.json author must include an email for Linux package metadata."
);
assert(
  /<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>/.test(packageJson.build?.linux?.maintainer || ""),
  "package.json Linux build metadata must define a maintainer email for DEB packages."
);
assert(/^lockfileVersion:\s*['"]?9\./m.test(pnpmLock), "pnpm-lock.yaml must use pnpm lockfile version 9.");
assertIncludes(pnpmLock, "\nimporters:\n", "pnpm-lock.yaml must define project importers.");
assertIncludes(
  workspaceStorageJs,
  "mergeManifestAndDiscoveredProjectRefs",
  "workspace-storage.js must merge manifest package refs with visible package folders for sync listings."
);
assertIncludes(
  workspaceStorageJs,
  "visibleProjectRefsFromDiscovered",
  "workspace-storage.js must compute workspace status project counts from visible package files."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package save refreshes stale embedded validation reports",
  "workspace-storage-test.html must verify workspace package saves refresh stale embedded validation reports."
);
assertIncludes(
  workspaceStorageTest,
  "workspace manifest records saved package with current validation summary",
  "workspace-storage-test.html must verify workspace manifests record current validation summaries."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package listing includes project folders missing from a stale manifest with current validation summaries without rewriting it",
  "workspace-storage-test.html must verify stale manifests do not hide project package folders and listing uses current validation summaries."
);
assertIncludes(
  workspaceStorageTest,
  "workspace status counts project folders missing from a stale manifest",
  "workspace-storage-test.html must verify workspace status counts visible project package folders missing from stale manifests."
);
assertIncludes(
  functionBody(workspaceStorageJs, "async function buildHealthReport", "window.CatHan.workspaceStorage"),
  "visibleProjectRefsFromDiscovered",
  "workspace-storage.js health reports must inspect visible package files, not only manifest refs."
);
assertIncludes(
  workspaceStorageTest,
  "workspace health counts project folders missing from a stale manifest without rewriting it",
  "workspace-storage-test.html must verify workspace health counts visible package folders missing from stale manifests."
);
assertIncludes(
  workspaceStorageTest,
  "workspace status ignores stale project refs when package files are missing",
  "workspace-storage-test.html must verify workspace status does not count stale project manifest refs whose package files are missing."
);
assertIncludes(
  workspaceStorageTest,
  "workspace status ignores empty project folders without package files",
  "workspace-storage-test.html must verify workspace status ignores empty project folders that do not contain package files."
);
assertIncludes(
  workspaceStorageJs,
  "lastSkippedProjectPackages",
  "workspace-storage.js must keep structured unreadable-package warnings from workspace scans."
);
assertIncludes(
  workspaceStorageJs,
  "previousWriteError",
  "workspace-storage.js must preserve the latest write error through status refresh scans."
);
assertIncludes(
  workspaceStorageJs,
  "validateWorkspaceProjectPackage",
  "workspace-storage.js must validate discovered workspace project packages before manifest recovery or sync listing."
);
assertIncludes(
  workspaceStorageJs,
  "validateWorkspaceBackupFile",
  "workspace-storage.js must validate backup payloads before writing them to workspace folders."
);
assertIncludes(
  workspaceStorageJs,
  "workspaceSafeLabel",
  "workspace-storage.js must redact credential-looking labels from workspace manifests and health reports."
);
assertIncludes(
  workspaceStorageTest,
  "workspace manifest load redacts credential-looking project resource and backup labels",
  "workspace-storage-test.html must verify stale workspace manifests redact credential-looking project/resource/backup labels on load."
);
assertIncludes(
  workspaceStorageTest,
  "workspace manifest writes redacted legacy project resource and backup labels after later save",
  "workspace-storage-test.html must verify later workspace manifest writes do not re-save credential-looking stale labels."
);
assertIncludes(
  workspaceStorageTest,
  "workspace status redacts credential-looking folder names",
  "workspace-storage-test.html must verify workspace status folder labels redact credential-looking text."
);
assertIncludes(
  workspaceStorageTest,
  "workspace health redacts credential-looking project and resource labels",
  "workspace-storage-test.html must verify workspace health reports redact credential-looking labels."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package scan warnings redact credential-looking folder labels",
  "workspace-storage-test.html must verify workspace scan warnings redact credential-looking external folder labels."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package scan skips unsafe credential-looking package folder paths",
  "workspace-storage-test.html must verify credential-looking package folders are skipped instead of written into workspace manifests."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package reader rejects unsafe manifest package paths before reading",
  "workspace-storage-test.html must verify manifest package paths are validated before workspace reads."
);
assertIncludes(
  workspaceStorageTest,
  "workspace status records redacted package write failures",
  "workspace-storage-test.html must verify workspace write-error status redacts credential-looking error text."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package save rejects future-schema packages before writing",
  "workspace-storage-test.html must verify workspace package writes reject unsupported future schemas before touching folder files."
);
assertIncludes(
  workspaceStorageTest,
  "workspace backup export rejects future-schema backups before writing",
  "workspace-storage-test.html must verify workspace backup exports reject unsupported future schemas before touching folder files."
);
assertIncludes(
  workspaceStorageJs,
  "writeOptionalValidationReport",
  "workspace-storage.js must treat validation-report sidecars as non-blocking diagnostics after the durable package write succeeds."
);
assertIncludes(
  workspaceStorageTest,
  "workspace validation report sidecar failure returns a redacted non-blocking warning",
  "workspace-storage-test.html must verify validation-report sidecar write failures redact warning text and do not reject successful package saves."
);
assertIncludes(
  workspaceStorageTest,
  "workspace validation report sidecar failure still commits the package and manifest",
  "workspace-storage-test.html must verify validation-report sidecar failures still commit the durable package and manifest."
);
assertIncludes(
  appJs,
  "validation report sidecar failed",
  "app.js must surface non-blocking workspace validation sidecar write failures in the save status."
);
assertIncludes(
  workspaceStorageJs,
  "scanBackupFiles",
  "workspace-storage.js must count visible workspace backup files even when the manifest is stale."
);
assertIncludes(
  workspaceStorageTest,
  "workspace backup scan skips unsafe credential-looking backup filenames",
  "workspace-storage-test.html must verify unsafe external backup filenames are skipped and redacted before status/health display."
);
assertIncludes(
  workspaceStorageTest,
  "workspace backup status ignores stale manifest refs when backup files are missing",
  "workspace-storage-test.html must verify stale backup manifest refs do not inflate visible backup counts."
);
assertIncludes(
  workspaceStorageTest,
  "workspace backup manifest write failure returns a redacted non-blocking warning",
  "workspace-storage-test.html must verify backup-manifest write failures redact warning text and do not reject successful backup files."
);
assertIncludes(
  workspaceStorageTest,
  "workspace backup manifest write failure still leaves the visible backup accounted for",
  "workspace-storage-test.html must verify visible backup files remain counted when manifest updates fail."
);
assertIncludes(
  readText("workspace-storage.js"),
  "function clearWorkspaceWriteError",
  "workspace-storage.js must clear stale write-error status after a durable manifest write succeeds."
);
assertIncludes(
  workspaceStorageTest,
  "workspace successful manifest write clears stale write failure status",
  "workspace-storage-test.html must verify recovered workspace writes do not keep stale write errors visible."
);
assertIncludes(
  appJs,
  "manifest update failed",
  "app.js must surface non-blocking workspace backup manifest update failures in the save status."
);
assertIncludes(
  workspaceStorageTest,
  "workspace recovery skips future-schema project packages",
  "workspace-storage-test.html must verify invalid future-schema workspace packages are skipped during manifest recovery."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package reader rejects future-schema project packages",
  "workspace-storage-test.html must verify direct workspace package reads reject invalid future-schema packages."
);
assertIncludes(
  workspaceStorageTest,
  "workspace health reports unreadable and invalid project packages after recovery",
  "workspace-storage-test.html must verify unreadable and invalid workspace packages remain visible after manifest recovery."
);
assertIncludes(
  appJs,
  "workspace sync reports unreadable workspace packages",
  "app workflow test must verify workspace sync surfaces unreadable package warnings."
);
assertIncludes(
  appJs,
  "workspace sync warnings redact credential-looking external labels and errors",
  "app workflow test must verify workspace sync warning labels and read errors are redacted before display."
);
assertIncludes(
  appJs,
  "function deliveryExportScope",
  "app.js must keep TXT/XLIFF delivery exports scoped to the selected document when one is selected."
);
assertIncludes(
  appJs,
  "selected target TXT export ignores unfinished unselected files",
  "app workflow test must verify selected TXT export ignores unfinished unselected files."
);
assertIncludes(
  appJs,
  "selected XLIFF export ignores unfinished unselected files",
  "app workflow test must verify selected XLIFF export ignores unfinished unselected files."
);

for (const dependencyName of [
  "@electron/fuses",
  "axe-core",
  "electron",
  "electron-builder",
  "esbuild",
  "eslint",
  "globals",
  "pixelmatch",
  "pngjs",
  "prettier",
  "stylelint",
  "typescript"
]) {
  const version = packageJson.devDependencies && packageJson.devDependencies[dependencyName];
  assert(version && /^\d+\.\d+\.\d+/.test(version), `${dependencyName} must be pinned to an exact release version.`);
  const lockDependency = pnpmImporterDevDependency(pnpmLock, dependencyName);
  assert(
    lockDependency?.specifier === version,
    `pnpm-lock.yaml must lock ${dependencyName} specifier to package.json version ${version}.`
  );
  assert(
    lockDependency?.version === version,
    `pnpm-lock.yaml must resolve ${dependencyName} to package.json version ${version}.`
  );
  const lockPackageEntry = dependencyName.startsWith("@")
    ? `  '${dependencyName}@${version}':`
    : `  ${dependencyName}@${version}:`;
  assertIncludes(
    pnpmLock,
    lockPackageEntry,
    `pnpm-lock.yaml must include the ${dependencyName}@${version} package entry.`
  );
}

const buildFiles = packageJson.build && Array.isArray(packageJson.build.files) ? packageJson.build.files : [];
assert(
  packageJson.build?.directories?.app === ".cache/desktop-app",
  "Desktop packaging must consume the production-only staged app."
);
assert(
  packageJson.build?.npmRebuild === false,
  "Desktop staging must not prune or rebuild the repository development dependency graph."
);
assert(packageJson.build?.electronFuses?.runAsNode === false, "Desktop packaging must disable Electron RunAsNode.");
assert(
  packageJson.build?.electronFuses?.enableNodeOptionsEnvironmentVariable === false,
  "Desktop packaging must disable Node options environment variables."
);
assert(
  packageJson.build?.electronFuses?.enableNodeCliInspectArguments === false,
  "Desktop packaging must disable Node inspector arguments."
);
assert(
  packageJson.build?.electronFuses?.enableEmbeddedAsarIntegrityValidation === true,
  "Desktop packaging must enable embedded ASAR integrity validation."
);
assert(
  packageJson.build?.electronFuses?.onlyLoadAppFromAsar === true,
  "Desktop packaging must load application code only from app.asar."
);
assert(
  packageJson.build?.electronFuses?.grantFileProtocolExtraPrivileges === false,
  "Desktop packaging must disable legacy file-protocol privileges."
);
const requiredProductionPackageFiles = [
  ...productionAssets.runtimeAssets,
  ...requiredDesktopIconFiles,
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "README.md",
  "LICENSE",
  "NOTICE",
  "docs/desktop-packaging.md",
  "docs/loopcat-package-format-v1.md",
  "docs/release-smoke-evidence-template.md"
];
for (const file of requiredProductionPackageFiles) {
  assert(packageIncludes(buildFiles, file), `Desktop package is missing ${file} from build.files.`);
}
assert(
  packageJson.build?.win?.icon === "icons/loopcat-icon.ico",
  "Windows desktop builds must use the generated ICO icon."
);
assert(
  packageJson.build?.mac?.icon === "icons/loopcat-icon.icns",
  "macOS desktop builds must use the generated ICNS icon."
);
assert(
  packageJson.build?.linux?.icon === "icons/loopcat-icon.png",
  "Linux desktop builds must use the generated PNG icon."
);

assert(manifest.name === "LoopCAT", "manifest.webmanifest must keep the product name.");
assert(manifest.version === packageJson.version, "manifest.webmanifest version must match package.json.");
assert(manifest.start_url === "./index.html", "manifest.webmanifest start_url must point to the local app shell.");
assert(manifest.scope === "./", "manifest.webmanifest scope must stay local.");

const remoteScriptOrStyle = /<(script|link)\b[^>]+(?:src|href)=["']https?:\/\//i;
assert(!remoteScriptOrStyle.test(indexHtml), "index.html must not load remote scripts or styles.");
assertIncludes(
  indexHtml,
  `http-equiv="Content-Security-Policy"`,
  "index.html must define a renderer Content Security Policy."
);
assertIncludes(indexHtml, `script-src 'self'`, "Content Security Policy must restrict scripts to the local app shell.");
assertIncludes(indexHtml, `worker-src 'self'`, "Content Security Policy must allow only local workers.");
assertIncludes(
  indexHtml,
  `trusted-types loopcat-bootstrap loopcat-sanitized-ui`,
  "Content Security Policy must allow only LoopCAT's bootstrap and centralized UI Trusted Types policies."
);
assertIncludes(
  indexHtml,
  `require-trusted-types-for 'script'`,
  "Content Security Policy must enforce Trusted Types for renderer injection sinks."
);
assertIncludes(
  indexHtml,
  `connect-src 'self' https://api.openai.com/v1/responses`,
  "Content Security Policy must keep network access local except the explicit OpenAI Responses endpoint."
);
assertIncludes(
  indexHtml,
  `https://api.openai.com/v1/models`,
  "Content Security Policy must allow the explicit OpenAI Models endpoint for model refresh."
);
assertIncludes(
  indexHtml,
  `https://generativelanguage.googleapis.com`,
  "Content Security Policy must allow the explicit Gemini API origin."
);
assertIncludes(
  indexHtml,
  `https://api.anthropic.com`,
  "Content Security Policy must allow the explicit Anthropic API origin."
);
assertIncludes(
  indexHtml,
  `https://api.cohere.com`,
  "Content Security Policy must allow the explicit Cohere API origin."
);
assertIncludes(
  indexHtml,
  `https://*.openai.azure.com`,
  "Content Security Policy must allow Azure OpenAI resource domains."
);
assertIncludes(
  indexHtml,
  `https://*.services.ai.azure.com`,
  "Content Security Policy must allow Azure AI Foundry resource domains."
);
assertIncludes(indexHtml, `https://ollama.com`, "Content Security Policy must allow the hosted Ollama API origin.");
assertIncludes(
  indexHtml,
  `https://api.deepseek.com`,
  "Content Security Policy must allow the explicit DeepSeek origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.mistral.ai`,
  "Content Security Policy must allow the explicit Mistral AI origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.groq.com`,
  "Content Security Policy must allow the explicit Groq origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.x.ai`,
  "Content Security Policy must allow the explicit xAI origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.perplexity.ai`,
  "Content Security Policy must allow the explicit Perplexity origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.together.ai`,
  "Content Security Policy must allow the explicit Together AI origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://openrouter.ai`,
  "Content Security Policy must allow the explicit OpenRouter origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://router.huggingface.co`,
  "Content Security Policy must allow the explicit Hugging Face Inference Providers origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.deepinfra.com`,
  "Content Security Policy must allow the explicit DeepInfra origin for native hosted pretranslation."
);
assertIncludes(
  indexHtml,
  `https://api.fireworks.ai`,
  "Content Security Policy must allow the explicit Fireworks AI origin for native hosted pretranslation."
);
assertIncludes(indexHtml, `id="localAiPresetSelect"`, "AI Command Centre must expose the provider preset selector.");
assertIncludes(
  indexHtml,
  `<option value="opus-cat">OPUS-CAT MT Engine</option>`,
  "AI Command Centre must expose OPUS-CAT MT Engine as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="gemini">Google Gemini</option>`,
  "AI Command Centre must expose Gemini as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="deepseek">DeepSeek</option>`,
  "AI Command Centre must expose DeepSeek as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="anthropic">Anthropic Claude</option>`,
  "AI Command Centre must expose Anthropic Claude as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="cohere">Cohere Command</option>`,
  "AI Command Centre must expose Cohere Command as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="mistral">Mistral AI</option>`,
  "AI Command Centre must expose Mistral AI as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="xai">xAI Grok</option>`,
  "AI Command Centre must expose xAI Grok as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="perplexity">Perplexity Sonar</option>`,
  "AI Command Centre must expose Perplexity Sonar as a provider."
);
assertIncludes(indexHtml, `<option value="groq">Groq</option>`, "AI Command Centre must expose Groq as a provider.");
assertIncludes(
  indexHtml,
  `<option value="together">Together AI</option>`,
  "AI Command Centre must expose Together AI as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="openrouter">OpenRouter</option>`,
  "AI Command Centre must expose OpenRouter as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="huggingface">Hugging Face Inference Providers</option>`,
  "AI Command Centre must expose Hugging Face Inference Providers as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="deepinfra">DeepInfra</option>`,
  "AI Command Centre must expose DeepInfra as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="fireworks">Fireworks AI</option>`,
  "AI Command Centre must expose Fireworks AI as a provider."
);
assertIncludes(
  indexHtml,
  `<option value="azure-openai">Azure OpenAI</option>`,
  "AI Command Centre must expose Azure OpenAI as a provider."
);
assertIncludes(
  indexHtml,
  `id="localAiLocalCloudPresetBtn"`,
  "AI Command Centre must expose a quick preset for Ollama cloud-suffixed models through local Ollama."
);
assertIncludes(
  indexHtml,
  `id="localAiReviewSegmentBtn"`,
  "AI Command Centre must expose the active-segment AI review command."
);
assertIncludes(indexHtml, `id="localAiReviewBatchBtn"`, "AI Command Centre must expose the batch AI QA command.");
assertIncludes(
  indexHtml,
  `id="localAiRepairTagsBtn"`,
  "AI Command Centre must expose the active-segment AI tag repair command."
);
assertIncludes(
  indexHtml,
  `id="localAiRepairTagsBatchBtn"`,
  "AI Command Centre must expose the batch AI tag repair command."
);
assertIncludes(
  indexHtml,
  `id="localAiPolishDraftBtn"`,
  "AI Command Centre must expose the active-segment AI draft polish command."
);
assertIncludes(
  indexHtml,
  `id="localAiPolishBatchBtn"`,
  "AI Command Centre must expose the batch AI draft polish command."
);
assertIncludes(
  indexHtml,
  `id="localAiAdaptModeSelect"`,
  "AI Command Centre must expose the AI draft adaptation mode selector."
);
assertIncludes(
  indexHtml,
  `id="localAiAdaptDraftBtn"`,
  "AI Command Centre must expose the active-segment AI draft adaptation command."
);
assertIncludes(
  indexHtml,
  `id="localAiAdaptBatchBtn"`,
  "AI Command Centre must expose the batch AI draft adaptation command."
);
assertIncludes(
  indexHtml,
  `id="localAiVariantModeSelect"`,
  "AI Command Centre must expose the AI alternatives style selector."
);
assertIncludes(
  indexHtml,
  `id="localAiSuggestVariantsBtn"`,
  "AI Command Centre must expose the active-segment AI alternatives command."
);
assertIncludes(
  indexHtml,
  `id="localAiSuggestVariantsBatchBtn"`,
  "AI Command Centre must expose the batch AI alternatives command."
);
assertIncludes(
  indexHtml,
  `id="localAiApplyTermsBtn"`,
  "AI Command Centre must expose the active-segment AI terminology application command."
);
assertIncludes(
  indexHtml,
  `id="localAiApplyTermsBatchBtn"`,
  "AI Command Centre must expose the batch AI terminology application command."
);
assertIncludes(
  indexHtml,
  `id="localAiExtractTermsBtn"`,
  "AI Command Centre must expose the active-segment AI terminology extraction command."
);
assertIncludes(
  indexHtml,
  `id="localAiExtractTermsBatchBtn"`,
  "AI Command Centre must expose the batch AI terminology extraction command."
);
assertIncludes(indexHtml, `id="localAiProjectBriefBtn"`, "AI Command Centre must expose the AI project brief command.");
assertIncludes(
  indexHtml,
  `id="localAiIncludeContextInput"`,
  "AI Command Centre must expose the nearby segment context toggle."
);
assertIncludes(indexHtml, `id="localAiProviderSummary"`, "AI Command Centre must expose the provider summary panel.");
assertIncludes(
  indexHtml,
  `id="localAiStartLmStudioBtn"`,
  "AI Command Centre must expose a desktop-only LM Studio server start button."
);
assertIncludes(
  indexHtml,
  `id="localAiPromptModeSelect"`,
  "AI Command Centre must expose a prompt-test mode selector for AI-native commands."
);
assertIncludes(
  indexHtml,
  `id="aiSegmentFilter"`,
  "Editor toolbar must expose AI metadata filtering for AI drafts, suggestions, and review risk."
);
assertIncludes(
  indexHtml,
  `id="focusModeBtn"`,
  "Editor toolbar must expose a Focus view toggle for noise-free segment editing."
);
assertIncludes(indexHtml, `id="exitFocusModeBtn"`, "Editor must expose an always-visible way to leave Focus view.");
assertIncludes(appJs, "function setFocusMode", "app.js must manage Focus view through explicit editor state.");
assertIncludes(appJs, "Enter Focus view", "Command palette must expose the Focus view toggle.");
assertIncludes(
  readText("styles.css"),
  ".workspace.focus-mode .sidebar",
  "styles.css must hide the right sidebar in Focus view."
);
assertIncludes(
  readText("styles.css"),
  ".workspace.focus-mode .segment-controls",
  "styles.css must hide filtering controls in Focus view so only segments remain."
);
assertIncludes(
  indexHtml,
  `local-ai-group`,
  "AI Command Centre must group provider and workflow controls into scannable sections."
);
assertIncludes(indexHtml, `Connect provider`, "AI Command Centre must start with provider connection controls.");
assertIncludes(indexHtml, `Choose model`, "AI Command Centre must put model selection before batch actions.");
assertIncludes(
  indexHtml,
  `Pre-translate`,
  "AI Command Centre must keep pre-translation as the primary workflow section."
);
assertIncludes(
  indexHtml,
  `id="localAiProviderDetails"`,
  "AI Command Centre must minimize advanced provider controls until needed."
);
assertIncludes(
  indexHtml,
  `id="localAiAdvancedSettings"`,
  "AI Command Centre must minimize advanced batch settings until needed."
);
assertIncludes(
  indexHtml,
  `class="local-ai-group local-ai-drawer"`,
  "AI Command Centre must collapse secondary AI tools into drawer sections."
);
assertIncludes(
  indexHtml,
  `id="localAiHostedKeyControls"`,
  "AI Command Centre must hide hosted-provider key controls when a local no-key provider is active."
);
assertIncludes(
  indexHtml,
  `<span>Terminology</span>`,
  "AI Command Centre must keep terminology AI commands in a named workflow section."
);
assertIncludes(
  indexHtml,
  `<span>Project context</span>`,
  "AI Command Centre must keep project-brief generation in a named workflow section."
);
assertIncludes(
  readText("styles.css"),
  ".local-ai-command-grid",
  "styles.css must keep AI-native command buttons in a compact command grid."
);
assertIncludes(
  readText("styles.css"),
  ".workspace.projects-mode .project-rail",
  "styles.css must hide the duplicate project rail on small project/dashboard screens."
);
assertIncludes(
  readText("styles.css"),
  ".workspace.projects-mode .sidebar",
  "styles.css must prevent editor sidebar first-paint flashes in project/dashboard screens."
);
assertIncludes(
  indexHtml,
  `http://localhost:11434`,
  "Content Security Policy must allow the explicit local Ollama loopback endpoint."
);
assertIncludes(
  indexHtml,
  `http://127.0.0.1:1234`,
  "Content Security Policy must allow the explicit local OpenAI-compatible loopback endpoint."
);
assertIncludes(
  indexHtml,
  `http://localhost:8500`,
  "Content Security Policy must allow the explicit local OPUS-CAT loopback endpoint."
);
assertIncludes(
  indexHtml,
  `http://127.0.0.1:8502`,
  "Content Security Policy must allow the explicit local OPUS-CAT web bridge endpoint."
);
assert(
  !indexHtml.includes(`http://[::1]`),
  "Content Security Policy must not include Chromium-invalid bracketed IPv6 loopback sources."
);
assert(
  !indexHtml.includes(`connect-src 'self' https://api.openai.com;`),
  "Content Security Policy must not allow the whole OpenAI origin."
);
assertIncludes(indexHtml, `object-src 'none'`, "Content Security Policy must disable plugin/object content.");
const openAiHelperFunction = functionBody(aiJs, "async function openAiSuggestion(", "window.CatHan =");
const geminiResponseParserFunction = functionBody(
  aiJs,
  "function extractGeminiResponseText",
  "function geminiTokenCount"
);
const defaultLocalAiSettingsFunction = functionBody(
  aiJs,
  "function defaultLocalAiSettings",
  "function readLocalAiSettings"
);
const geminiProviderFunction = functionBody(aiJs, "const GeminiProvider = {", "function openAiCompatibleStatusError");
const anthropicProviderFunction = functionBody(
  aiJs,
  "const AnthropicProvider = {",
  "function openAiCompatibleStatusError"
);
const cohereProviderFunction = functionBody(aiJs, "const CohereProvider = {", "function openAiCompatibleStatusError");
const opusCatProviderFunction = functionBody(aiJs, "const OpusCatProvider = {", "function geminiProviderAuthError");
assertIncludes(
  aiJs,
  `const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"`,
  "ai.js must keep the external OpenAI endpoint explicit and narrow."
);
assertIncludes(
  aiJs,
  `const OPENAI_MODELS_URL = "https://api.openai.com/v1/models"`,
  "ai.js must keep the external OpenAI models endpoint explicit and narrow."
);
assertIncludes(
  aiJs,
  `const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com"`,
  "ai.js must keep the DeepSeek API base URL centralized."
);
assertIncludes(
  aiJs,
  `const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"`,
  "ai.js must keep the Gemini API base URL centralized."
);
assertIncludes(
  aiJs,
  `const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1"`,
  "ai.js must keep the Anthropic API base URL centralized."
);
assertIncludes(
  aiJs,
  `const COHERE_DEFAULT_BASE_URL = "https://api.cohere.com"`,
  "ai.js must keep the Cohere API base URL centralized."
);
assertIncludes(
  aiJs,
  `const MISTRAL_DEFAULT_BASE_URL = "https://api.mistral.ai/v1"`,
  "ai.js must keep the Mistral AI base URL centralized."
);
assertIncludes(
  aiJs,
  `const XAI_DEFAULT_BASE_URL = "https://api.x.ai/v1"`,
  "ai.js must keep the xAI API base URL centralized."
);
assertIncludes(
  aiJs,
  `const PERPLEXITY_DEFAULT_BASE_URL = "https://api.perplexity.ai/v1"`,
  "ai.js must keep the Perplexity Sonar API base URL centralized."
);
assertIncludes(
  aiJs,
  `const GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"`,
  "ai.js must keep the Groq API base URL centralized."
);
assertIncludes(
  aiJs,
  `const TOGETHER_DEFAULT_BASE_URL = "https://api.together.ai/v1"`,
  "ai.js must keep the Together AI API base URL centralized."
);
assertIncludes(
  aiJs,
  `const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"`,
  "ai.js must keep the OpenRouter API base URL centralized."
);
assertIncludes(
  aiJs,
  `const HUGGINGFACE_DEFAULT_BASE_URL = "https://router.huggingface.co/v1"`,
  "ai.js must keep the Hugging Face Inference Providers API base URL centralized."
);
assertIncludes(
  aiJs,
  `const DEEPINFRA_DEFAULT_BASE_URL = "https://api.deepinfra.com/v1/openai"`,
  "ai.js must keep the DeepInfra API base URL centralized."
);
assertIncludes(
  aiJs,
  `const FIREWORKS_DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1"`,
  "ai.js must keep the Fireworks AI API base URL centralized."
);
assertIncludes(
  aiJs,
  `const AZURE_OPENAI_DEFAULT_BASE_URL = "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1"`,
  "ai.js must keep the Azure OpenAI base URL centralized."
);
assertIncludes(
  aiJs,
  `const OPUS_CAT_DEFAULT_BASE_URL = "http://localhost:8500"`,
  "ai.js must keep the local OPUS-CAT MT Engine base URL centralized."
);
assertIncludes(
  aiJs,
  `const OPUS_CAT_WEB_BRIDGE_BASE_URL = "http://127.0.0.1:8502"`,
  "ai.js must keep the OPUS-CAT browser bridge URL centralized."
);
assertIncludes(aiJs, "const GeminiProvider = {", "ai.js must implement the native Gemini provider.");
for (const provider of [
  ["deepseek", "DeepSeekProvider", "DeepSeek"],
  ["mistral", "MistralProvider", "Mistral AI"]
]) {
  const [providerId, compatibilityExport, providerName] = provider;
  assertIncludes(
    nativeChatProviderAdaptersJs,
    `id: "${providerId}"`,
    `The checked native chat adapter family must implement ${providerName}.`
  );
  assertIncludes(
    nativeChatProviderAdaptersJs,
    `compatibilityExport: "${compatibilityExport}"`,
    `The native chat adapter family must preserve the ${providerName} compatibility export.`
  );
  assertIncludes(
    defaultLocalAiSettingsFunction,
    `providerId === "${providerId}"`,
    `ai.js must preserve ${providerName} default settings.`
  );
  assertIncludes(
    aiJs,
    `aiProviderRegistry.reserve("${providerId}")`,
    `The provider registry must preserve ${providerName}'s original order before adapter installation.`
  );
}
assert(
  !["DeepSeekProvider", "MistralProvider"].some((providerName) => aiJs.includes(`const ${providerName} = {`)),
  "ai.js must not retain extracted native chat-provider implementations."
);
assertIncludes(aiJs, "deepSeekApiUrl", "ai.js must normalize DeepSeek model-list and chat-completion endpoints.");
assertIncludes(aiJs, "mistralApiUrl", "ai.js must normalize Mistral model-list and chat-completion endpoints.");
assertIncludes(
  hostedProviderAdapterCoreJs,
  "bearerAuthHeaders",
  "Native chat adapters must send API keys in authorization headers."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "max_tokens: 1200",
  "Native chat adapters must keep chat-completion output bounded."
);
assertIncludes(
  extractedProviderInstallerJs,
  "installNativeChatProviderAdapters",
  "The extracted-provider installer must register the native chat provider family."
);
assertIncludes(
  nativeChatProviderAdaptersUnitTests,
  "preserve multipart parsing, payloads, aborts, provenance, and token metadata",
  "Native chat adapters must retain focused parsing, request, abort, provenance, and token characterization."
);
assertIncludes(aiJs, "geminiAuthHeaders", "ai.js must send Gemini API keys in headers, not query strings.");
assertIncludes(aiJs, "geminiApiUrl", "ai.js must normalize Gemini model-list and interaction endpoints.");
assertIncludes(
  geminiProviderFunction,
  "store: false",
  "ai.js Gemini Interactions requests must opt out of provider-side storage."
);
assertIncludes(
  geminiResponseParserFunction,
  "Array.isArray(step?.content)",
  "ai.js Gemini response parser must read documented Interactions step content."
);
assertIncludes(aiJs, "const AnthropicProvider = {", "ai.js must implement the native Anthropic provider.");
assertIncludes(aiJs, "anthropicAuthHeaders", "ai.js must send Anthropic API keys in headers, not query strings.");
assertIncludes(aiJs, "anthropicApiUrl", "ai.js must normalize Anthropic model-list and message endpoints.");
assertIncludes(
  anthropicProviderFunction,
  "max_tokens: 1200",
  "ai.js Anthropic Messages requests must include bounded max_tokens."
);
assertIncludes(aiJs, "const CohereProvider = {", "ai.js must implement the native Cohere provider.");
assertIncludes(aiJs, "cohereAuthHeaders", "ai.js must send Cohere API keys in headers, not query strings.");
assertIncludes(aiJs, "cohereApiUrl", "ai.js must normalize Cohere model-list and chat endpoints.");
assertIncludes(
  cohereProviderFunction,
  "max_tokens: 1200",
  "ai.js Cohere Chat V2 requests must include bounded max_tokens."
);
for (const provider of [
  ["openai", "OpenAIProvider", "OpenAI"],
  ["xai", "XAIProvider", "xAI Grok"],
  ["azure-openai", "AzureOpenAIProvider", "Azure OpenAI"]
]) {
  const [providerId, compatibilityExport, providerName] = provider;
  assertIncludes(
    nativeOpenAiProviderAdaptersJs,
    `id: "${providerId}"`,
    `The checked native OpenAI adapter family must implement ${providerName}.`
  );
  assertIncludes(
    nativeOpenAiProviderAdaptersJs,
    `compatibilityExport: "${compatibilityExport}"`,
    `The native OpenAI adapter family must preserve the ${providerName} compatibility export.`
  );
  assertIncludes(
    defaultLocalAiSettingsFunction,
    `providerId === "${providerId}"`,
    `ai.js must preserve ${providerName} default settings.`
  );
  assertIncludes(
    aiJs,
    `aiProviderRegistry.reserve("${providerId}")`,
    `The provider registry must preserve ${providerName}'s original order before adapter installation.`
  );
}
assert(
  !["OpenAIProvider", "XAIProvider", "AzureOpenAIProvider"].some((providerName) =>
    aiJs.includes(`const ${providerName} = {`)
  ),
  "ai.js must not retain extracted native OpenAI-family provider implementations."
);
assertIncludes(
  extractedProviderInstallerJs,
  "installNativeOpenAiProviderAdapters",
  "The extracted-provider installer must register the native OpenAI provider family."
);
assertIncludes(
  nativeOpenAiProviderAdaptersUnitTests,
  "preserve Responses payloads, aborts, output parsing, provenance, and token metadata",
  "Native OpenAI adapters must retain focused request, abort, parsing, provenance, and token characterization."
);
assertIncludes(aiJs, "xAiApiUrl", "ai.js must normalize xAI model-list and Responses endpoints.");
assertIncludes(
  defaultLocalAiSettingsFunction,
  'providerId === "xai"',
  "ai.js must default native xAI settings to the xAI base URL/model, not Ollama."
);
assertIncludes(
  openAiResponsesProviderAdapterJs,
  "store: false",
  "Native OpenAI-family Responses requests must opt out of provider-side storage."
);
assertIncludes(
  openAiResponsesProviderAdapterJs,
  "max_output_tokens: 1200",
  "Native OpenAI-family Responses requests must include bounded max_output_tokens."
);
assertIncludes(aiJs, "perplexityApiUrl", "ai.js must normalize Perplexity Sonar model-list and Sonar endpoints.");
assertIncludes(
  defaultLocalAiSettingsFunction,
  'providerId === "perplexity"',
  "ai.js must default native Perplexity settings to the Perplexity base URL/model, not Ollama."
);
assertIncludes(
  perplexityProviderAdapterJs,
  "disable_search: true",
  "The checked Perplexity adapter must disable web search for CAT-tool translation commands."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "max_tokens: 1200",
  "The shared native chat transport must keep Perplexity Sonar output bounded."
);
assertIncludes(
  perplexityProviderAdapterJs,
  'chatEndpoint: "/sonar"',
  "The checked Perplexity adapter must use the native Sonar endpoint."
);
assertIncludes(
  perplexityProviderAdapterJs,
  "citationCount",
  "The checked Perplexity adapter must preserve citation metadata."
);
assert(
  !aiJs.includes("const PerplexityProvider = {") && !aiJs.includes("function perplexityProviderAuthError"),
  "ai.js must not retain the extracted Perplexity provider implementation."
);
assertIncludes(
  groqProviderAdapterJs,
  "export function createGroqProviderAdapter",
  "The checked Groq adapter module must implement the native Groq provider."
);
assert(
  !aiJs.includes("const GroqProvider = {") && !aiJs.includes("function groqProviderAuthError"),
  "ai.js must not retain the extracted Groq provider implementation."
);
assertIncludes(aiJs, "groqApiUrl", "ai.js must normalize Groq model-list and chat-completion endpoints.");
assertIncludes(
  defaultLocalAiSettingsFunction,
  'providerId === "groq"',
  "ai.js must default native Groq settings to the Groq base URL/model, not Ollama."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "bearerAuthHeaders",
  "The Groq adapter must send API keys in authorization headers."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "max_tokens: 1200",
  "The Groq adapter chat-completion requests must include bounded max_tokens."
);
for (const provider of [
  ["together", "TogetherProvider", "Together AI"],
  ["openrouter", "OpenRouterProvider", "OpenRouter"],
  ["huggingface", "HuggingFaceProvider", "Hugging Face Inference Providers"],
  ["deepinfra", "DeepInfraProvider", "DeepInfra"],
  ["fireworks", "FireworksProvider", "Fireworks AI"]
]) {
  const [providerId, compatibilityExport, providerName] = provider;
  assertIncludes(
    hostedProviderAdaptersJs,
    `id: "${providerId}"`,
    `The checked hosted adapter family must implement ${providerName}.`
  );
  assertIncludes(
    hostedProviderAdaptersJs,
    `compatibilityExport: "${compatibilityExport}"`,
    `The hosted adapter family must preserve the ${providerName} compatibility export.`
  );
  assertIncludes(
    defaultLocalAiSettingsFunction,
    `providerId === "${providerId}"`,
    `ai.js must preserve ${providerName} default settings.`
  );
  assertIncludes(
    aiJs,
    `aiProviderRegistry.reserve("${providerId}")`,
    `The provider registry must preserve ${providerName}'s original order before adapter installation.`
  );
}
assert(
  !["TogetherProvider", "OpenRouterProvider", "HuggingFaceProvider", "DeepInfraProvider", "FireworksProvider"].some(
    (providerName) => aiJs.includes(`const ${providerName} = {`)
  ),
  "ai.js must not retain extracted hosted-provider implementations."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "bearerAuthHeaders",
  "Hosted provider adapters must send credentials through authorization headers."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "max_tokens: 1200",
  "Hosted provider adapters must keep chat-completion output bounded."
);
assertIncludes(aiJs, "togetherApiUrl", "ai.js must preserve Together AI endpoint normalization policy.");
assertIncludes(aiJs, "openRouterApiUrl", "ai.js must preserve OpenRouter endpoint normalization policy.");
assertIncludes(aiJs, "huggingFaceApiUrl", "ai.js must preserve Hugging Face endpoint normalization policy.");
assertIncludes(aiJs, "deepInfraApiUrl", "ai.js must preserve DeepInfra endpoint normalization policy.");
assertIncludes(aiJs, "fireworksApiUrl", "ai.js must preserve Fireworks AI endpoint normalization policy.");
assertIncludes(aiJs, "azureOpenAiAuthHeaders", "ai.js must send Azure OpenAI API keys in headers, not query strings.");
assertIncludes(aiJs, "azureOpenAiApiUrl", "ai.js must normalize Azure OpenAI v1 endpoints.");
assertIncludes(
  nativeOpenAiProviderAdaptersJs,
  'authHeadersKey: "azureOpenAiAuthHeaders"',
  "The checked Azure OpenAI adapter must preserve api-key authentication."
);
assertIncludes(
  nativeOpenAiProviderAdaptersJs,
  "Azure OpenAI deployment ${model} was not found.",
  "The checked Azure OpenAI adapter must preserve deployment-specific failures."
);
assertIncludes(aiJs, "const OpusCatProvider = {", "ai.js must implement the OPUS-CAT MT Engine provider.");
assertIncludes(aiJs, "opusCatApiUrl", "ai.js must normalize OPUS-CAT MTRestService endpoints.");
assertIncludes(
  aiJs,
  "function opusCatConnectionCandidates",
  "ai.js must discover standard direct and bridged OPUS-CAT endpoints."
);
assertIncludes(
  aiJs,
  "OPUS-CAT connection failed. Open Connection help for setup steps.",
  "ai.js must keep OPUS-CAT inline failure status concise and actionable."
);
assertIncludes(
  opusCatProviderFunction,
  "connectionMode: opusCatConnectionMode(baseUrl)",
  "ai.js OPUS-CAT connection tests must report the discovered connection route."
);
assertIncludes(
  defaultLocalAiSettingsFunction,
  'providerId === "opus-cat"',
  "ai.js must default OPUS-CAT settings to the OPUS-CAT base URL/model, not Ollama."
);
assertIncludes(
  opusCatProviderFunction,
  "ListSupportedLanguagePairs",
  "ai.js OPUS-CAT provider must test and list installed language pairs."
);
assertIncludes(
  opusCatProviderFunction,
  "GetLanguagePairModelTags",
  "ai.js OPUS-CAT provider must list language-pair model tags."
);
assertIncludes(
  opusCatProviderFunction,
  "TranslateJson",
  "ai.js OPUS-CAT provider must pretranslate through the OPUS-CAT TranslateJson endpoint."
);
assertIncludes(aiJs, "aiProviderRegistry.register(OpusCatProvider)", "ai.js must register the OPUS-CAT provider.");
assertIncludes(
  aiJs,
  'if (providerId === "opus-cat") return false;',
  "ai.js must treat local OPUS-CAT as a no-key provider."
);
assertIncludes(aiJs, "function buildAiReviewPrompt", "ai.js must include a provider-neutral AI review prompt builder.");
assertIncludes(
  aiJs,
  "function parseAiReviewRisk",
  "ai.js must parse AI review severity output into structured risk metadata."
);
assertIncludes(
  aiJs,
  "function translationMemoryPromptBlock",
  "ai.js must include provider-neutral TM context for translation prompts."
);
assertIncludes(
  aiJs,
  "function surroundingSegmentPromptBlock",
  "ai.js must include provider-neutral nearby segment context for translation prompts."
);
assertIncludes(
  aiJs,
  "function buildTagRepairPrompt",
  "ai.js must include a provider-neutral AI tag repair prompt builder."
);
assertIncludes(
  aiJs,
  "function buildTargetVariantsPrompt",
  "ai.js must include a provider-neutral AI target variants prompt builder."
);
assertIncludes(aiJs, "LOCAL_AI_VARIANT_MODES", "ai.js must centralize the supported AI target-variant modes.");
assertIncludes(
  aiJs,
  "function buildStylePolishPrompt",
  "ai.js must include a provider-neutral AI draft polish prompt builder."
);
assertIncludes(
  aiJs,
  "function buildDraftAdaptationPrompt",
  "ai.js must include a provider-neutral AI draft adaptation prompt builder."
);
assertIncludes(aiJs, "LOCAL_AI_ADAPT_MODES", "ai.js must centralize the supported AI draft adaptation modes.");
assertIncludes(
  aiJs,
  "function buildTerminologyExtractionPrompt",
  "ai.js must include a provider-neutral AI terminology extraction prompt builder."
);
assertIncludes(
  aiJs,
  "function buildTerminologyApplicationPrompt",
  "ai.js must include a provider-neutral AI terminology application prompt builder."
);
assertIncludes(
  aiJs,
  "function buildProjectBriefPrompt",
  "ai.js must include a provider-neutral AI project brief prompt builder."
);
assertIncludes(aiJs, "const aiCommandService = {", "ai.js must expose AI-native commands through a central service.");
assertIncludes(aiJs, "reviewSegment: reviewSegmentWithAi", "aiCommandService must support active-segment AI review.");
assertIncludes(
  aiJs,
  "repairSegmentTags: repairSegmentTagsWithAi",
  "aiCommandService must support active-segment AI tag repair."
);
assertIncludes(
  aiJs,
  "suggestSegmentVariants: suggestSegmentVariantsWithAi",
  "aiCommandService must support active-segment AI alternatives."
);
assertIncludes(
  aiJs,
  "polishSegmentStyle: polishSegmentStyleWithAi",
  "aiCommandService must support active-segment AI draft polish."
);
assertIncludes(
  aiJs,
  "adaptSegmentDraft: adaptSegmentDraftWithAi",
  "aiCommandService must support active-segment AI draft adaptation."
);
assertIncludes(
  aiJs,
  "applyTerminology: applyTerminologyWithAi",
  "aiCommandService must support active-segment AI terminology application."
);
assertIncludes(
  aiJs,
  "extractSegmentTerms: extractSegmentTermsWithAi",
  "aiCommandService must support active-segment AI terminology extraction."
);
assertIncludes(
  aiJs,
  "generateProjectBrief: generateProjectBriefWithAi",
  "aiCommandService must support AI project brief generation."
);
assertIncludes(
  aiJs,
  ".completePrompt = async function completePrompt",
  "AI providers must expose a generic prompt-completion method for non-translation commands."
);
assertIncludes(aiJs, "const LOCAL_AI_PROVIDER_PRESETS = [", "ai.js must centralize Local AI provider presets.");
assertIncludes(
  hostedProviderAdapterCoreJs,
  "async completePrompt",
  "The native chat adapter family must route AI-native commands through chat completions."
);
assertIncludes(
  openAiResponsesProviderAdapterJs,
  "async completePrompt",
  "The native OpenAI adapter family must route AI-native commands through Responses."
);
assertIncludes(
  perplexityProviderAdapterJs,
  "createOpenAiCompatibleHostedProviderAdapter",
  "The Perplexity adapter must route translations and AI-native commands through the checked provider core."
);
assertIncludes(
  extractedProviderInstallerJs,
  "installPerplexityProviderAdapter",
  "The extracted-provider installer must register the Perplexity provider."
);
assertIncludes(
  aiJs,
  'aiProviderRegistry.reserve("perplexity")',
  "The legacy registry must preserve Perplexity's provider order while its adapter installs."
);
assertIncludes(
  perplexityProviderAdapterJs,
  "ai.PerplexityProvider = provider",
  "The Perplexity adapter must retain the temporary compatibility export."
);
assertIncludes(
  perplexityProviderAdapterUnitTests,
  "preserves Sonar no-search translation payload, abort, parsing, provenance, and citations",
  "The Perplexity adapter must retain focused payload, abort, parsing, provenance, and citation characterization."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "async completePrompt",
  "The Groq adapter must route AI-native commands through the native provider."
);
assertIncludes(
  extractedProviderInstallerJs,
  "installGroqProviderAdapter",
  "The extracted-provider installer must register the native Groq provider."
);
assertIncludes(
  aiJs,
  'aiProviderRegistry.reserve("groq")',
  "The legacy registry must preserve Groq's provider order while its adapter installs."
);
assertIncludes(
  productionEntryJs,
  'import "../ai/providers/install-extracted-providers.js"',
  "The production renderer must install extracted providers before app bootstrap."
);
assert(
  productionEntryJs.indexOf('import "../../ai.js"') <
    productionEntryJs.indexOf('import "../ai/providers/install-extracted-providers.js"'),
  "The production renderer must load the AI façade before installing extracted providers."
);
assertIncludes(
  regressionHtml,
  'import "./src/ai/providers/install-extracted-providers.js"',
  "The standalone regression harness must install extracted providers through the production adapter boundary."
);
assertIncludes(
  regressionHtml,
  'providerIds.indexOf("openai") === providerIds.indexOf("ollama") + 1',
  "The regression harness must preserve OpenAI's original provider order."
);
assertIncludes(
  regressionHtml,
  'providerIds.indexOf("xai") === providerIds.indexOf("deepseek") + 1',
  "The regression harness must preserve xAI's original provider order."
);
assertIncludes(
  regressionHtml,
  'providerIds.indexOf("together") === providerIds.indexOf("groq") + 1',
  "The regression harness must characterize provider ordering across extracted adapters."
);
assertIncludes(
  regressionHtml,
  'providerIds.indexOf("fireworks") === providerIds.indexOf("deepinfra") + 1',
  "The regression harness must preserve the complete hosted-provider family order."
);
assertIncludes(
  regressionHtml,
  'providerIds.indexOf("azure-openai") === providerIds.indexOf("mistral") + 1',
  "The regression harness must preserve Azure OpenAI's original provider order."
);
assertIncludes(
  groqProviderAdapterJs,
  "ai.GroqProvider = provider",
  "The Groq adapter must retain the temporary compatibility export."
);
assertIncludes(
  groqProviderAdapterUnitTests,
  "preserves translation payload, cancellation signal, response normalization, and provenance",
  "The Groq adapter must retain focused request, abort, normalization, and provenance characterization."
);
assertIncludes(
  hostedProviderAdapterCoreJs,
  "async completePrompt",
  "The hosted adapter core must route AI-native commands through each named provider."
);
assertIncludes(
  extractedProviderInstallerJs,
  "installHostedProviderAdapters",
  "The extracted-provider installer must register the remaining hosted provider family."
);
assertIncludes(
  hostedProviderAdaptersUnitTests,
  "preserve translation and generic-command payloads, aborts, normalization, and provenance",
  "Hosted adapters must retain focused request, abort, normalization, and provenance characterization."
);
assertIncludes(
  hostedProviderAdaptersUnitTests,
  "preserve special, redacted, cancellation, and reachability failures",
  "Hosted adapters must retain focused special-status, redaction, cancellation, and network-failure characterization."
);
assertIncludes(
  aiJs,
  'providerId: "huggingface"',
  "ai.js must expose the Hugging Face Inference Providers preset through its native provider."
);
assertIncludes(
  aiJs,
  "function localAiProviderPresetForSettings",
  "ai.js must expose provider preset matching for the AI Command Centre."
);
assertIncludes(
  aiJs,
  "OPENAI_COMPATIBLE_NO_V1_HOSTS",
  "ai.js must handle OpenAI-compatible providers that do not use a /v1 base path."
);
assertIncludes(
  aiJs,
  "OPENAI_COMPATIBLE_ENDPOINT_PATH_OVERRIDES",
  "ai.js must handle OpenAI-compatible providers with provider-specific endpoint paths."
);
assertIncludes(
  aiJs,
  "OPENAI_COMPATIBLE_HOSTED_ALLOWED_HOSTS",
  "ai.js must keep generic hosted OpenAI-compatible endpoints on an explicit allowlist."
);
assertIncludes(
  aiJs,
  "assertOpenAiCompatibleHostedAllowed",
  "ai.js must block unsupported hosted OpenAI-compatible endpoints before fetch."
);
assertIncludes(
  appJs,
  "assertLocalAiEndpointAllowed",
  "app.js must preflight unsupported hosted OpenAI-compatible endpoints before saving keys or settings."
);
assertIncludes(
  appJs,
  "opusCatApiUrl",
  "app.js must render OPUS-CAT endpoint summaries through the OPUS-CAT URL helper."
);
assertIncludes(
  appJs,
  'providerId === "opus-cat"',
  "app.js must treat OPUS-CAT as a local runtime workflow in the AI Command Centre."
);
assertIncludes(
  appJs,
  "finishLocalAiConnection",
  "app.js must save an automatically discovered OPUS-CAT endpoint after a successful connection test."
);
assertIncludes(
  appJs,
  "function showOpusCatConnectionHelp",
  "app.js must show actionable OPUS-CAT help after a failed connection test."
);
assertIncludes(
  functionBody(appJs, "async function testLocalAiConnection", "async function refreshLocalAiModels"),
  "showOpusCatConnectionHelp()",
  "app.js OPUS-CAT connection failure must open the help dialog."
);
assertIncludes(appJs, "localAiPresetSelect", "app.js must wire the Local AI provider preset selector.");
assertIncludes(
  appJs,
  "localAiLocalCloudPresetBtn",
  "app.js must wire the Ollama local cloud-model quick preset button."
);
assertIncludes(appJs, "reviewActiveSegmentWithLocalAi", "app.js must wire the active-segment AI review command.");
assertIncludes(appJs, "localAiReviewSegmentBtn", "app.js must bind the active-segment AI review button.");
assertIncludes(appJs, "reviewBatchWithLocalAi", "app.js must wire the batch AI QA command.");
assertIncludes(appJs, "localAiReviewBatchBtn", "app.js must bind the batch AI QA button.");
assertIncludes(
  appJs,
  "repairActiveSegmentTagsWithLocalAi",
  "app.js must wire the active-segment AI tag repair command."
);
assertIncludes(appJs, "localAiRepairTagsBtn", "app.js must bind the active-segment AI tag repair button.");
assertIncludes(appJs, "repairBatchTagsWithLocalAi", "app.js must wire the batch AI tag repair command.");
assertIncludes(appJs, "localAiRepairTagsBatchBtn", "app.js must bind the batch AI tag repair button.");
assertIncludes(
  appJs,
  "polishActiveSegmentDraftWithLocalAi",
  "app.js must wire the active-segment AI draft polish command."
);
assertIncludes(appJs, "localAiPolishDraftBtn", "app.js must bind the active-segment AI draft polish button.");
assertIncludes(appJs, "polishBatchDraftsWithLocalAi", "app.js must wire the batch AI draft polish command.");
assertIncludes(appJs, "localAiPolishBatchBtn", "app.js must bind the batch AI draft polish button.");
assertIncludes(
  appJs,
  "adaptActiveSegmentDraftWithLocalAi",
  "app.js must wire the active-segment AI draft adaptation command."
);
assertIncludes(appJs, "localAiAdaptDraftBtn", "app.js must bind the active-segment AI draft adaptation button.");
assertIncludes(appJs, "adaptBatchDraftsWithLocalAi", "app.js must wire the batch AI draft adaptation command.");
assertIncludes(appJs, "localAiAdaptBatchBtn", "app.js must bind the batch AI draft adaptation button.");
assertIncludes(appJs, "localAiAdaptModeSelect", "app.js must bind the AI draft adaptation mode selector.");
assertIncludes(
  appJs,
  "suggestActiveSegmentVariantsWithLocalAi",
  "app.js must wire the active-segment AI alternatives command."
);
assertIncludes(appJs, "localAiSuggestVariantsBtn", "app.js must bind the active-segment AI alternatives button.");
assertIncludes(appJs, "suggestBatchSegmentVariantsWithLocalAi", "app.js must wire the batch AI alternatives command.");
assertIncludes(appJs, "localAiSuggestVariantsBatchBtn", "app.js must bind the batch AI alternatives button.");
assertIncludes(appJs, "localAiVariantModeSelect", "app.js must bind the AI alternatives style selector.");
assertIncludes(
  appJs,
  "applyActiveSegmentTerminologyWithLocalAi",
  "app.js must wire the active-segment AI terminology application command."
);
assertIncludes(appJs, "localAiApplyTermsBtn", "app.js must bind the active-segment AI terminology application button.");
assertIncludes(
  appJs,
  "applyBatchTerminologyWithLocalAi",
  "app.js must wire the batch AI terminology application command."
);
assertIncludes(appJs, "localAiApplyTermsBatchBtn", "app.js must bind the batch AI terminology application button.");
assertIncludes(
  appJs,
  "extractActiveSegmentTermsWithLocalAi",
  "app.js must wire the active-segment AI terminology extraction command."
);
assertIncludes(
  appJs,
  "localAiExtractTermsBtn",
  "app.js must bind the active-segment AI terminology extraction button."
);
assertIncludes(appJs, "extractBatchTermsWithLocalAi", "app.js must wire the batch AI terminology extraction command.");
assertIncludes(appJs, "localAiExtractTermsBatchBtn", "app.js must bind the batch AI terminology extraction button.");
assertIncludes(appJs, "generateProjectBriefWithLocalAi", "app.js must wire the AI project brief command.");
assertIncludes(appJs, "localAiProjectBriefBtn", "app.js must bind the AI project brief button.");
assertIncludes(
  appJs,
  "tmMatchesForSegment: localAiTmMatchesForSegment",
  "app.js must pass per-segment TM hints into Local AI pretranslation."
);
assertIncludes(
  appJs,
  "glossaryTermsForSegment: localAiGlossaryTermsForSegment",
  "app.js must pass per-segment termbase hints into Local AI pretranslation."
);
assertIncludes(
  appJs,
  "surroundingSegmentsForSegment",
  "app.js must pass nearby segment context into Local AI pretranslation."
);
assertIncludes(
  appJs,
  "function localAiProviderSummaryView",
  "app.js must render AI provider locality, key, and endpoint details."
);
assertIncludes(
  aiJs,
  "LOCAL_AI_PROVIDER_GUIDANCE",
  "ai.js must keep provider best-fit guidance centralized with provider metadata."
);
assertIncludes(
  aiJs,
  "function localAiProviderGuidance",
  "ai.js must derive provider guidance from the active provider locality."
);
assertIncludes(
  aiAdministrationControllerJs,
  "local-ai-provider-guidance",
  "the checked AI administration controller must render provider best-fit guidance in the AI Command Centre summary."
);
assertIncludes(
  appJs,
  "function localAiProviderCapabilityLabels",
  "app.js must derive AI Command Centre capabilities from the active provider object."
);
assertIncludes(
  appJs,
  "Review/edit tools",
  "app.js must render AI-native review/edit command availability in the provider summary."
);
assertIncludes(
  appJs,
  "AI Command Centre explains selected provider locality, best-fit use, available tools, and endpoints",
  "app workflow test must verify the AI provider summary panel guidance and capabilities."
);
assertIncludes(
  appJs,
  "AI Command Centre groups provider and preset choices by local, hosted, router, and managed workflows",
  "app workflow test must verify AI Command Centre provider grouping."
);
assertIncludes(
  appJs,
  "checked AI administration controller owns prompt preview events and output disclosure",
  "app workflow test must verify mode-aware Prompt Test previews and sends non-translation prompts."
);
assertIncludes(
  readText("project.js"),
  "localIncludeNearbyContext: source.localIncludeNearbyContext !== false",
  "project.js must preserve the Local AI nearby-context setting during project normalization."
);
assertIncludes(
  readText("storage.js"),
  "localIncludeNearbyContext: source.localIncludeNearbyContext !== false",
  "storage.js must preserve the Local AI nearby-context setting during portable backup/export normalization."
);
assertIncludes(
  readText("project.js"),
  "localVariantMode",
  "project.js must preserve the Local AI alternatives style setting during project normalization."
);
assertIncludes(
  readText("storage.js"),
  "localVariantMode",
  "storage.js must preserve the Local AI alternatives style setting during portable backup/export normalization."
);
assertIncludes(
  readText("project.js"),
  "localAdaptMode",
  "project.js must preserve the Local AI draft adaptation mode during project normalization."
);
assertIncludes(
  readText("storage.js"),
  "localAdaptMode",
  "storage.js must preserve the Local AI draft adaptation mode during portable backup/export normalization."
);
assertIncludes(
  appJs,
  "Local AI pretranslation sends nearby segment context to provider requests",
  "app workflow test must verify nearby context reaches Local AI providers."
);
assertIncludes(
  appJs,
  "AI Command Centre distinguishes local Ollama cloud-offload models from direct hosted Ollama",
  "app workflow test must verify the local Ollama cloud-offload preset and privacy summary."
);
assertIncludes(
  appJs,
  "AI Command Centre hosted Ollama quick button selects direct hosted Ollama",
  "app workflow test must verify the hosted Ollama quick preset button."
);
assertIncludes(
  appJs,
  "Ollama local cloud-offload pretranslation asks before sending source text and honors cancellation",
  "app workflow test must verify cloud-offload local Ollama pretranslation confirmation and cancellation."
);
assertIncludes(
  appJs,
  "Ollama local cloud-offload pretranslation runs after confirmation and stores cloud model metadata",
  "app workflow test must verify cloud-offload local Ollama pretranslation after confirmation."
);
assertIncludes(
  appJs,
  "AI Command Centre direct hosted Ollama summary requires a key and disables local pull",
  "app workflow test must verify direct hosted Ollama UI safety state."
);
assertIncludes(
  appJs,
  "Direct hosted Ollama pretranslation asks before sending source text and honors cancellation",
  "app workflow test must verify direct hosted Ollama confirmation and cancellation."
);
assertIncludes(
  appJs,
  "Direct hosted Ollama pretranslation runs after confirmation with hosted key and stores hosted model metadata",
  "app workflow test must verify direct hosted Ollama pretranslation after confirmation."
);
assertIncludes(
  appJs,
  "Local AI hosted provider keys are scoped by provider and base URL",
  "app workflow test must verify hosted Local AI API keys cannot be reused across providers."
);
assertIncludes(
  appJs,
  "AI Command Centre blocks unsupported hosted OpenAI-compatible endpoints before saving keys or settings",
  "app workflow test must verify unsupported hosted-compatible endpoints fail before key/settings persistence."
);
assertIncludes(
  appJs,
  "localAiKeyStorageKey(settings",
  "app.js must scope Local AI API-key storage by active provider settings."
);
assertIncludes(
  aiAdministrationControllerJs,
  'hostedKeyControls?.classList.toggle("hidden", !view.needsKey)',
  "the checked AI administration controller must hide hosted Local AI key controls when the active provider does not need a key."
);
assertIncludes(
  aiAdministrationControllerJs,
  'pullModelWrap?.classList.toggle("hidden", !view.canPull)',
  "the checked AI administration controller must hide local model-pull controls when the active provider cannot pull models."
);
assertIncludes(appJs, "window.LoopCATDesktop", "app.js must detect the optional LoopCAT desktop bridge.");
assertIncludes(
  aiAdministrationControllerJs,
  'startLmStudioButton.classList.toggle("hidden", !view.canStartServer)',
  "the checked AI administration controller must hide the LM Studio start button when the desktop helper is unavailable."
);
assertIncludes(
  appJs,
  "startLmStudioServerFromUi(settings)",
  "app.js must let Test connection auto-start the LM Studio local server when available."
);
assertIncludes(
  readme,
  "A saved DeepSeek key is not reused for Gemini",
  "README.md must document hosted Local AI API-key scoping."
);
assertIncludes(
  readme,
  "available tools, model and translation endpoints",
  "README.md must document AI Command Centre provider guidance and capabilities."
);
assertIncludes(
  readme,
  "The `Prompt Test` area can preview and send the exact prompt family",
  "README.md must document mode-aware AI Command Centre prompt testing."
);
assertIncludes(
  readme,
  "AI-generated pretranslations, AI suggestions, and risk-ranked AI review comments",
  "README.md must document AI metadata filtering in the editor."
);
assertIncludes(
  readme,
  "AI-pretranslated rows display as `AI initiated`",
  "README.md must document the AI-pretranslation badge label."
);
assertIncludes(
  readme,
  "confirming one clears `Needs review`",
  "README.md must document the confirmed AI-pretranslation review-state transition."
);
assertIncludes(
  readme,
  "project-level AI triage metrics",
  "README.md must document project-level AI triage counts for AI-initiated rows, suggestions, and review risk."
);
assertIncludes(
  readme,
  "pnpm run verify:ollama-live",
  "README.md must document optional live Ollama verification for local and hosted runtimes."
);
assertIncludes(
  readme,
  "pnpm run verify:ai-live",
  "README.md must document optional live hosted-provider verification."
);
assertIncludes(
  readme,
  "pnpm run verify:ai-sidebar-ux",
  "README.md must document the focused AI Command Centre sidebar UX verifier."
);
assertIncludes(readme, "Start LM Studio server", "README.md must document the desktop LM Studio server start helper.");
assertIncludes(
  readme,
  "explicit hosted AI provider origins",
  "README.md must document that security-policy tests cover all explicit hosted AI origins."
);
assertIncludes(
  readme,
  "Arbitrary hosted OpenAI-compatible URLs are blocked before key storage, settings persistence, or network requests",
  "README.md must document the generic hosted OpenAI-compatible preflight."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "2026-06-30 Provider Verification Snapshot",
  "AI provider research must include the latest official-doc verification snapshot."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "verify:ai-live",
  "AI provider research must document optional live hosted-provider verification."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "Provider Use-Case Guidance",
  "AI provider research must document the provider guidance shown in the Command Centre."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "provider-derived capability labels",
  "AI provider research must document the provider capabilities shown in the Command Centre."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "Prompt Test area can switch between pre-translation",
  "AI provider research must document mode-aware AI-native prompt testing."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "segment-row badges and can be filtered from the editor toolbar",
  "AI provider research must document editor AI metadata triage."
);
assertIncludes(
  readText("docs/ai-provider-integration-research.md"),
  "Project analysis and project reports include count-only AI triage metrics",
  "AI provider research must document project-level AI triage reporting."
);
assertIncludes(
  appJs,
  "AI review active segment saves risk-ranked review comment and marks segment needs-review",
  "app workflow test must verify the active-segment AI review command stores review risk."
);
assertIncludes(
  appJs,
  "AI batch QA saves risk-ranked review comments, skips locked segments, and records segment failures",
  "app workflow test must verify the batch AI QA command stores review risk."
);
assertIncludes(appJs, "high-ai-risk", "app workflow and filters must cover high-risk AI review triage.");
assertIncludes(
  appJs,
  "AI segment filter shows AI-pretranslated rows with AI initiated row badges",
  "app workflow test must verify AI-pretranslated row badges render as AI initiated."
);
assertIncludes(
  appJs,
  "confirming reviewed AI-pretranslated segment clears needs-review and shows AI initiated",
  "app workflow test must verify confirmed AI-pretranslated rows clear needs-review and keep AI origin visible."
);
assertIncludes(
  appJs,
  "function aiPretranslationBadge",
  "app.js must centralize AI draft to AI initiated row-badge behavior."
);
assertIncludes(
  readText("styles.css"),
  "#e7f2ff",
  "styles.css must render confirmed AI-initiated segment badges with a light-blue background."
);
assertIncludes(
  appJs,
  "project report includes count-only AI triage metrics",
  "app workflow test must verify project reports expose AI triage counts without segment text."
);
assertIncludes(appJs, 'uiLabelHtml("highAiRisk")', "Project analysis must surface high-risk AI review counts.");
assertIncludes(
  readText("analysis.js"),
  "aiSuggestionSegments",
  "analysis.js must count project-level AI suggestion row metadata."
);
assertIncludes(
  regressionHtml,
  "analysis counts AI triage draft suggestion and risk metadata",
  "regression test must verify project-level AI triage analysis counters."
);
assertIncludes(
  appJs,
  "AI tag repair active segment saves review suggestion without overwriting target",
  "app workflow test must verify the active-segment AI tag repair command."
);
assertIncludes(
  appJs,
  "AI batch tag repair saves review suggestions, skips locked segments, and records failures",
  "app workflow test must verify the batch AI tag repair command."
);
assertIncludes(
  appJs,
  "AI polish active segment saves review suggestion without overwriting target",
  "app workflow test must verify the active-segment AI draft polish command."
);
assertIncludes(
  appJs,
  "AI batch polish saves review suggestions without overwriting drafts",
  "app workflow test must verify the batch AI draft polish command."
);
assertIncludes(
  appJs,
  "AI draft adaptation active segment saves review suggestion without overwriting target",
  "app workflow test must verify the active-segment AI draft adaptation command."
);
assertIncludes(
  appJs,
  "AI batch adaptation saves review suggestions without overwriting drafts",
  "app workflow test must verify the batch AI draft adaptation command."
);
assertIncludes(
  appJs,
  "AI alternatives active segment saves selected-style review suggestions without overwriting target",
  "app workflow test must verify the active-segment AI alternatives command."
);
assertIncludes(
  appJs,
  "AI batch alternatives saves review suggestions without overwriting drafts",
  "app workflow test must verify the batch AI alternatives command."
);
assertIncludes(
  appJs,
  "AI terminology application active segment saves review suggestion without overwriting target",
  "app workflow test must verify the active-segment AI terminology application command."
);
assertIncludes(
  appJs,
  "AI batch terminology application saves review suggestions, skips locked segments, and records failures",
  "app workflow test must verify the batch AI terminology application command."
);
assertIncludes(
  appJs,
  "AI term extraction active segment saves candidates to the project termbase",
  "app workflow test must verify the active-segment AI terminology extraction command."
);
assertIncludes(
  appJs,
  "AI batch term extraction saves candidates from visible segments",
  "app workflow test must verify the batch AI terminology extraction command."
);
assertIncludes(
  appJs,
  "AI project brief saves generated instructions without replacing existing style guide",
  "app workflow test must verify the AI project brief command."
);
assertIncludes(
  appJs,
  "Local AI pretranslation uses project TM and termbase hints and saves AI initiated metadata",
  "app workflow test must verify Local AI pretranslation TM and termbase hints."
);
assertIncludes(
  regressionHtml,
  "AI command service builds tag repair prompts and returns provider repair suggestions",
  "regression test must verify the provider-neutral AI tag repair command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds target variant prompts and parses provider alternatives",
  "regression test must verify the provider-neutral AI alternatives command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds style polish prompts and returns reviewable target suggestions",
  "regression test must verify the provider-neutral AI draft polish command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds draft adaptation prompts and returns reviewable target suggestions",
  "regression test must verify the provider-neutral AI draft adaptation command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds terminology application prompts and returns reviewable target suggestions",
  "regression test must verify the provider-neutral AI terminology application command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds terminology extraction prompts and parses term candidates",
  "regression test must verify the provider-neutral AI terminology extraction command."
);
assertIncludes(
  regressionHtml,
  "AI command service builds project brief prompts and returns reusable project instructions",
  "regression test must verify the provider-neutral AI project brief command."
);
assertIncludes(aiJs, "fetch(OPENAI_RESPONSES_URL", "ai.js must use the explicit OpenAI Responses endpoint constant.");
assertIncludes(
  aiJs,
  "externalAiSourceSharingAllowed(project)",
  "ai.js must enforce project-level external AI source-sharing consent before network calls."
);
assert(
  aiJs.indexOf("externalAiSourceSharingAllowed(project)") < aiJs.indexOf("fetch(OPENAI_RESPONSES_URL"),
  "ai.js must check external AI source-sharing consent before fetching the OpenAI endpoint."
);
assert(
  openAiHelperFunction.indexOf("The active segment has no source text.") <
    openAiHelperFunction.indexOf("Add your OpenAI API key first."),
  "ai.js must report empty source text before asking for an OpenAI API key."
);
assert(
  openAiHelperFunction.indexOf("externalAiSourceSharingAllowed(project)") <
    openAiHelperFunction.indexOf("Add your OpenAI API key first."),
  "ai.js must check project AI/source-sharing consent before asking for an OpenAI API key."
);
assert(
  openAiHelperFunction.indexOf("if (!isOpenAiProvider(project))") <
    openAiHelperFunction.indexOf("Add your OpenAI API key first."),
  "ai.js must check the selected provider before asking for an OpenAI API key."
);
assert(
  openAiHelperFunction.indexOf("browserAppearsOffline()") <
    openAiHelperFunction.indexOf("Add your OpenAI API key first."),
  "ai.js must report offline state before asking for an OpenAI API key."
);
assertIncludes(
  aiJs,
  "isOpenAiProvider(project)",
  "ai.js must keep OpenAI endpoint calls scoped to the OpenAI provider."
);
assert(
  aiJs.indexOf("if (!isOpenAiProvider(project))") < aiJs.indexOf("fetchOpenAiResponse({"),
  "ai.js must check the selected provider before requesting the OpenAI endpoint."
);
assertIncludes(aiJs, 'toLowerCase() === "openai"', "ai.js must match the OpenAI provider with locale-stable casing.");
assert(
  !aiJs.includes('toLocaleLowerCase() === "openai"'),
  "ai.js must not use user-locale casing for OpenAI provider detection."
);
assertIncludes(
  aiJs,
  "const OPENAI_REQUEST_TIMEOUT_MS = 45000",
  "ai.js must keep external AI requests bounded by an explicit timeout."
);
assertIncludes(aiJs, "controller.abort()", "ai.js must abort hung external AI requests.");
assertIncludes(
  aiJs,
  "OpenAI request timed out",
  "ai.js must return a recoverable timeout message for hung external AI requests."
);
assert(!aiJs.includes("mockSuggestion"), "ai.js must not expose mock AI suggestions in production builds.");
assert(
  !indexHtml.includes("mockAiSuggestionBtn"),
  "index.html must not expose a user-facing mock AI suggestion button."
);
assert(!indexHtml.includes("Mock suggestion"), "index.html must not expose user-facing mock AI copy.");
assert(!appJs.includes("createMockAiSuggestion"), "app.js must not expose user-facing mock AI suggestion actions.");
assert(!appJs.includes("mockAiSuggestionBtn"), "app.js must not wire a user-facing mock AI suggestion button.");
assert(!appJs.includes("mock-ai"), "app.js command palette must not expose mock AI suggestions.");
assertIncludes(
  aiJs,
  "function browserAppearsOffline()",
  "ai.js must expose a browser offline preflight for OpenAI calls."
);
assertIncludes(
  aiJs,
  "LoopCAT appears to be offline",
  "ai.js must fail OpenAI requests with a clear offline-first error when the browser reports offline."
);
assertIncludes(aiJs, "store: false", "ai.js must opt out of provider-side OpenAI response storage.");
assert(
  !openAiHelperFunction.includes('source: segment.source || ""'),
  "ai.js OpenAI suggestions must not return duplicated source text for local storage."
);
assert(
  !openAiHelperFunction.includes("responseId: data?.id"),
  "ai.js OpenAI suggestions must not return provider response IDs for local storage."
);
assertIncludes(
  aiJs,
  "Domain: ${redactSensitiveText(project.domain)}",
  "ai.js must redact credential-shaped project domain metadata before building OpenAI request input."
);
assertIncludes(
  aiJs,
  "redactSensitiveText(project.aiSettings.styleGuide)",
  "ai.js must redact credential-shaped style instructions before building OpenAI request input."
);
assertIncludes(
  aiJs,
  'const OPENAI_DEFAULT_MODEL = "gpt-5.5";',
  "ai.js must keep the current OpenAI default model centralized."
);
assertIncludes(
  aiJs,
  'const model = redactSensitiveText(project?.aiSettings?.model || "").trim() || OPENAI_DEFAULT_MODEL;',
  "ai.js must redact credential-shaped model labels before OpenAI request construction."
);
assertIncludes(
  aiJs,
  "compactPromptContext",
  "ai.js must redact credential-shaped local TM and termbase context before building OpenAI request input."
);
assertIncludes(
  aiJs,
  "function aiContextRecords",
  "ai.js must fail closed on malformed optional local AI context records before prompt construction."
);
assertIncludes(
  aiJs,
  "function openAiProviderErrorMessage",
  "ai.js must normalize OpenAI provider error messages before they reach the UI."
);
assertIncludes(
  functionBody(aiJs, "function openAiProviderErrorMessage", "function externalAiSourceSharingAllowed"),
  "redactSensitiveText(message)",
  "ai.js must redact credential-shaped text from OpenAI provider error messages."
);
assertIncludes(
  aiJs,
  "filteredAiContext",
  "ai.js must enforce project-level local context sharing toggles before building OpenAI prompts."
);
assertIncludes(
  aiJs,
  "const output = Array.isArray(data?.output) ? data.output : [];",
  "ai.js must normalize malformed provider output payloads before extracting response text."
);
assertIncludes(
  aiJs,
  "OpenAI request could not connect",
  "ai.js must convert provider connection failures into clear user-facing status text."
);
assertIncludes(tmJs, '.normalize("NFKC")', "tm.js must normalize text before token indexing and matching.");
assertIncludes(tmJs, ".toLowerCase()", "tm.js must use locale-stable casing for token indexing and matching.");
assert(
  !tmJs.includes(".toLocaleLowerCase()"),
  "tm.js must not use the user interface locale for TM token indexing and matching."
);
assertIncludes(
  validationJs,
  '.normalize("NFKC")',
  "validation.js must normalize text before forbidden-term export checks."
);
assertIncludes(
  validationJs,
  ".toLowerCase()",
  "validation.js must use locale-stable casing for validation labels and forbidden-term matching."
);
assert(
  !validationJs.includes(".toLocaleLowerCase()"),
  "validation.js must not use the user interface locale for package, backup, or export validation."
);
assertIncludes(
  validationJs,
  "MAX_PACKAGE_SCHEMA_VERSION",
  "validation.js must cap supported project-package schema versions."
);
assertIncludes(
  validationJs,
  "MAX_BACKUP_SCHEMA_VERSION",
  "validation.js must cap supported backup schema versions independently."
);
assertIncludes(
  validationJs,
  "newer than this LoopCAT build supports",
  "validation.js must reject portable files from newer unsupported schemas."
);
assertIncludes(
  analysisJs,
  '.normalize("NFKC").toLowerCase()',
  "analysis.js fallback normalization must be locale-stable when tm.js is unavailable."
);
assert(
  !analysisJs.includes(".toLocaleLowerCase()"),
  "analysis.js must not use the user interface locale for repetition analysis."
);
assertIncludes(
  qualityJs,
  "function buildQualityPassportData",
  "quality.js must build source-backed Quality Passport data."
);
assertIncludes(
  qualityJs,
  "function buildRiskQueue",
  "quality.js must expose risk-prioritized review queue construction."
);
assertIncludes(qualityJs, "function qualityCategoryLabel", "quality.js must label quality decision categories.");
assertIncludes(appJs, "function exportQualityPassport", "app.js must wire Quality Passport export.");
assertIncludes(appJs, "function saveQualityDecisionFromForm", "app.js must save active quality decisions.");
assertIncludes(indexHtml, "qualityForm", "index.html must expose Quality Workbench controls.");
assertIncludes(indexHtml, "qualityActiveEvidence", "index.html must expose active segment quality evidence.");
assertIncludes(indexHtml, "<h2>Comments</h2>", "index.html must label the review panel as Comments.");
assertIncludes(indexHtml, "<h2>QA Checks</h2>", "index.html must title-case the QA panel.");
assertIncludes(
  readText("styles.css"),
  ".ai-panel {\n  order: 3;",
  "styles.css must place AI Command Centre directly after termbases."
);
assertIncludes(
  readText("styles.css"),
  ".qa-panel {\n  order: 4;",
  "styles.css must place QA Checks after AI Command Centre."
);
assertIncludes(
  readText("styles.css"),
  ".review-panel {\n  order: 5;",
  "styles.css must place Comments after QA Checks."
);
assertIncludes(
  catWorkerJs,
  '.normalize("NFKC")',
  "cat-worker.js must normalize text before worker-side TM/QA matching."
);
assertIncludes(
  catWorkerJs,
  ".toLowerCase()",
  "cat-worker.js must use locale-stable casing for worker-side TM/QA matching."
);
assert(
  !catWorkerJs.includes(".toLocaleLowerCase()"),
  "cat-worker.js must not use the user interface locale for worker-side TM/QA matching."
);
assertIncludes(
  securityPolicyTest,
  "SECURITY POLICY TEST PASS",
  "security-policy-test.html must report its pass state to the browser test runner."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src does not allow the whole OpenAI origin",
  "security-policy-test.html must verify the browser CSP does not allow the whole OpenAI origin."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows the explicit Gemini API origin",
  "security-policy-test.html must verify the browser CSP allows only the explicit Gemini origin."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows the explicit Anthropic API origin",
  "security-policy-test.html must verify the browser CSP allows only the explicit Anthropic origin."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows the explicit Cohere API origin",
  "security-policy-test.html must verify the browser CSP allows only the explicit Cohere origin."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows Azure OpenAI resource domains",
  "security-policy-test.html must verify Azure OpenAI CSP access is explicit."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows explicit hosted AI provider origins",
  "security-policy-test.html must verify hosted AI CSP origins are explicit."
);
assertIncludes(
  securityPolicyTest,
  "CSP script-src stays local-only",
  "security-policy-test.html must verify local-only scripts."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper does not call network before project consent",
  "security-policy-test.html must verify external AI helpers block network calls before project consent."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper blocks unsupported providers before network request",
  "security-policy-test.html must verify unsupported providers do not call the OpenAI endpoint."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper checks project consent before API key requirement",
  "security-policy-test.html must verify blocked OpenAI helper calls do not ask for API keys before project consent."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper checks provider before API key requirement",
  "security-policy-test.html must verify blocked OpenAI helper calls do not ask for API keys before provider validation."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper checks source text before API key requirement",
  "security-policy-test.html must verify blocked OpenAI helper calls do not ask for API keys before source-text validation."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper checks offline state before API key requirement",
  "security-policy-test.html must verify blocked OpenAI helper calls do not ask for API keys while offline."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI provider detection is stable under Turkish locale casing",
  "security-policy-test.html must verify OpenAI provider matching is not broken by Turkish UI locales."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper strips disabled local TM and termbase context before request body",
  "security-policy-test.html must verify disabled local AI context is stripped before any OpenAI request body is sent."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper redacts credential-looking local TM and termbase context before request body",
  "security-policy-test.html must verify credential-shaped local TM and termbase context is not sent to OpenAI."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper ignores malformed local TM and termbase context before request body",
  "security-policy-test.html must verify malformed optional local AI context is ignored before any OpenAI request body is built."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper redacts credential-looking language domain and style metadata before request body",
  "security-policy-test.html must verify credential-shaped project language, domain, and style metadata are not sent to OpenAI."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper redacts credential-looking provider error messages",
  "security-policy-test.html must verify credential-shaped provider errors are redacted before UI display."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper reports malformed provider output as empty suggestion",
  "security-policy-test.html must verify malformed provider output reports a recoverable empty-suggestion status."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper times out hung provider requests",
  "security-policy-test.html must verify external AI requests time out cleanly."
);
assertIncludes(
  smokeTest,
  "TM normalization is stable under Turkish locale casing",
  "smoke-test.html must verify TM normalization is not broken by Turkish UI locales."
);
assertIncludes(
  smokeTest,
  "TM token index lookup is locale-stable for English source text",
  "smoke-test.html must verify TM token-index lookup is deterministic across UI locales."
);
assertIncludes(
  smokeTest,
  "worker TM normalization is stable under Turkish locale casing",
  "smoke-test.html must verify worker-side TM matching is deterministic across UI locales."
);
assertIncludes(
  regressionTest,
  "analysis fallback normalization is stable under Turkish locale casing",
  "regression-test.html must verify analysis fallback normalization is deterministic across UI locales."
);
assertIncludes(
  regressionTest,
  "export validation forbidden terminology is stable under Turkish locale casing",
  "regression-test.html must verify forbidden-term export gates are deterministic across UI locales."
);
assertIncludes(
  regressionTest,
  "Ollama base URL normalization avoids duplicate api paths",
  "regression-test.html must verify Ollama URL normalization."
);
assertIncludes(
  regressionTest,
  "Hosted Ollama requests use direct cloud model naming, local cloud-offload naming, API normalization, bearer-authenticated pretranslation, and external-sharing safeguards",
  "regression-test.html must verify hosted Ollama model naming, auth, pretranslation, and privacy guards."
);
assertIncludes(aiJs, `id: "ollama-cloud"`, "Ollama Cloud direct preset must remain available.");
assertIncludes(aiJs, `model: "gpt-oss:120b"`, "Ollama Cloud direct preset must default to the hosted API model name.");
assertIncludes(aiJs, `id: "ollama-local-cloud"`, "Ollama local cloud-offload preset must remain available.");
assertIncludes(
  aiJs,
  `model: "gpt-oss:120b-cloud"`,
  "Ollama local cloud-offload preset must default to a cloud-suffixed Ollama model name."
);
assertIncludes(
  aiJs,
  "isOllamaCloudModel(model)",
  "localAiProviderSharesExternally must treat Ollama cloud-suffixed local models as externally processed."
);
assertIncludes(
  regressionTest,
  "OpenAI provider lists models and pretranslates through Responses with storage disabled",
  "regression-test.html must verify OpenAI provider pretranslation and model refresh."
);
assertIncludes(
  regressionTest,
  "Gemini provider lists models and pretranslates through Interactions with header auth and storage disabled",
  "regression-test.html must verify Gemini provider pretranslation and model refresh."
);
assertIncludes(
  regressionTest,
  "Anthropic provider lists models and pretranslates through Messages with header auth",
  "regression-test.html must verify Anthropic provider pretranslation and model refresh."
);
assertIncludes(
  regressionTest,
  "Cohere provider lists models and pretranslates through Chat V2 with bearer auth",
  "regression-test.html must verify Cohere provider pretranslation and model refresh."
);
assertIncludes(
  regressionTest,
  "Azure OpenAI provider lists deployments and pretranslates through Responses with api-key auth",
  "regression-test.html must verify Azure OpenAI provider pretranslation and model refresh."
);
assertIncludes(
  regressionTest,
  "AI command service builds review prompts, returns provider review text, and ranks review risk",
  "regression-test.html must verify the AI review command service."
);
assertIncludes(
  regressionTest,
  "AI review risk parser ranks no-issue, warning, and high severity review output",
  "regression-test.html must verify AI review risk parsing."
);
assertIncludes(
  regressionTest,
  "OpenAI-compatible local provider lists models and parses chat completions",
  "regression-test.html must verify local OpenAI-compatible pretranslation providers."
);
assertIncludes(
  regressionTest,
  "DeepSeek provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native DeepSeek provider behavior."
);
assertIncludes(
  regressionTest,
  "Mistral provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native Mistral provider behavior."
);
assertIncludes(
  regressionTest,
  "xAI provider lists models, pretranslates, and runs AI commands through native Responses with bearer auth and storage disabled",
  "regression-test.html must verify native xAI provider behavior."
);
assertIncludes(
  regressionTest,
  "Perplexity provider lists models, pretranslates, and runs AI commands through native Sonar with bearer auth and search disabled",
  "regression-test.html must verify native Perplexity Sonar provider behavior."
);
assertIncludes(
  regressionTest,
  "Groq provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native Groq provider behavior."
);
assertIncludes(
  regressionTest,
  "Together AI provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native Together AI provider behavior."
);
assertIncludes(
  regressionTest,
  "OpenRouter provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native OpenRouter provider behavior."
);
assertIncludes(
  regressionTest,
  "Hugging Face provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native Hugging Face provider behavior."
);
assertIncludes(
  regressionTest,
  "DeepInfra provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native DeepInfra provider behavior."
);
assertIncludes(
  regressionTest,
  "Fireworks AI provider lists models, pretranslates, and runs AI commands through native chat completions with bearer auth",
  "regression-test.html must verify native Fireworks AI provider behavior."
);
assertIncludes(
  regressionTest,
  "Hosted AI provider presets use native providers instead of the generic OpenAI-compatible adapter",
  "regression-test.html must verify hosted provider presets do not regress to the generic OpenAI-compatible adapter."
);
assertIncludes(
  regressionTest,
  "Hosted OpenAI-compatible provider handles provider-specific base URLs, bearer auth, and chat completions",
  "regression-test.html must verify hosted OpenAI-compatible provider behavior."
);
assertIncludes(
  regressionTest,
  "Hosted OpenAI-compatible custom endpoints are blocked before network unless explicitly allowlisted",
  "regression-test.html must verify unsupported hosted OpenAI-compatible endpoints fail before fetch."
);
assertIncludes(
  regressionTest,
  "Local AI pretranslation skips protected segments, passes TM, glossary, and nearby context hints, writes successes, and records segment failures",
  "regression-test.html must verify Local AI pretranslation safety, TM/glossary/context hints, and failure handling."
);
assertIncludes(
  regressionTest,
  "Translate prompt includes nearby segment context while preserving the source-text separator",
  "regression-test.html must verify nearby context prompt structure."
);
for (const asset of productionAssets.offlineAssets) {
  assert(fs.existsSync(path.join(root, asset)), `Production asset manifest references missing offline asset ${asset}.`);
}
assert(productionAssets.contractVersion === 1, "Production asset manifest contract version must be 1.");
assert(
  new Set(productionAssets.runtimeAssets).size === productionAssets.runtimeAssets.length,
  "Production runtime asset manifest must not contain duplicate paths."
);
assertIncludes(
  serviceWorker,
  `importScripts("./config/production-assets.js")`,
  "service-worker.js must consume the canonical production asset manifest."
);
assertIncludes(
  webBuildScript,
  `runNodeScript("verify-renderer-build.cjs")`,
  "Web builds must verify the production renderer before packaging."
);
assertIncludes(
  desktopBuildScript,
  `runNodeScript("prepare-desktop-app.cjs")`,
  "Desktop builds must stage the production-only renderer before packaging."
);
assertIncludes(
  rendererBuildScript,
  `path.join(productionDir, "desktop-index.html")`,
  "Renderer builds must keep a static ES-module index for the private desktop protocol."
);
assertIncludes(
  rendererVerifyScript,
  "Desktop index must not use the file-protocol bootstrap.",
  "Renderer verification must prevent the file-protocol bootstrap from replacing the desktop entry."
);
assertIncludes(
  desktopStageScript,
  'asset === "index.html" ? path.join(rendererRoot, "desktop-index.html")',
  "Desktop staging must package the static desktop index instead of the file-protocol bootstrap."
);
assertIncludes(
  desktopStageScript,
  'new Set(["app-file.js", "bootstrap.js"])',
  "Desktop staging must exclude web-only startup assets from its private protocol manifest."
);
assertIncludes(
  desktopArtifactScript,
  'new Set(["app-file.js", "bootstrap.js"])',
  "Desktop artifact verification must enforce the web-only renderer asset boundary."
);
assertIncludes(
  webArtifactScript,
  "Static web production renderer contains test-only marker",
  "Web artifact verification must reject test-only renderer markers."
);
assertIncludes(
  desktopArtifactScript,
  "production renderer contains test-only marker",
  "Desktop artifact verification must reject test-only renderer markers."
);

assertIncludes(
  serviceWorker,
  `const APP_VERSION = "${packageJson.version}"`,
  "service-worker.js APP_VERSION must match package.json."
);
assertIncludes(
  serviceWorker,
  `const CACHE_PREFIX = "loopcat-offline-"`,
  "service-worker.js must keep a LoopCAT-only cache prefix."
);
assertIncludes(
  serviceWorker,
  "const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}-${STATIC_ASSET_REVISION}`",
  "service-worker.js cache name must be derived from APP_VERSION and the static asset revision."
);
assertIncludes(
  serviceWorker,
  "key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME",
  "service-worker.js must delete only old LoopCAT offline caches during activation."
);
assertIncludes(serviceWorker, "CORE_ASSET_URLS", "service-worker.js must keep an explicit core asset URL allowlist.");
assertIncludes(serviceWorker, "failedAssets", "service-worker.js must collect failed core asset cache writes.");
assertIncludes(
  serviceWorker,
  "Offline shell core asset cache failed",
  "service-worker.js must fail installation when the full offline app shell cannot be cached."
);
assertIncludes(
  serviceWorker,
  "const cache = await caches.open(CACHE_NAME)",
  "service-worker.js must read runtime responses from the current LoopCAT cache."
);
assert(
  !serviceWorker.includes("caches.match(event.request)"),
  "service-worker.js must not serve core assets from unrelated origin caches."
);
assert(
  !serviceWorker.includes("caches.match(INDEX_URL)"),
  "service-worker.js must not serve the app shell from unrelated origin caches."
);
assertIncludes(
  serviceWorker,
  "isCoreAssetRequest(event.request)",
  "service-worker.js must dynamically cache only core app-shell assets."
);
assertIncludes(
  serviceWorker,
  "isNavigationRequest(event.request)",
  "service-worker.js must detect navigation requests."
);
assertIncludes(
  serviceWorker,
  "cachedIndex()",
  "service-worker.js must fall back to the cached app shell for navigation failures."
);
assertIncludes(
  serviceWorker,
  "if (navigation) return (await cachedIndex()) || response;",
  "service-worker.js must serve cached index.html for failed navigation responses."
);
assertIncludes(
  serviceWorker,
  "if (fallback) return fallback;",
  "service-worker.js must serve cached index.html when offline navigation fetches fail."
);
assertIncludes(
  offlineShellTest,
  "OFFLINE SHELL TEST PASS",
  "offline-shell-test.html must report its pass state to the browser test runner."
);
assertIncludes(
  offlineShellTest,
  "offline navigation fallback serves cached app shell",
  "offline-shell-test.html must verify navigation fallback behavior."
);
assertIncludes(
  offlineShellTest,
  "offline shell derives every core app asset from the canonical manifest",
  "offline-shell-test.html must verify the complete service-worker core asset list is cached."
);
assertIncludes(
  offlineShellTest,
  "offline shell activation preserves unrelated origin caches",
  "offline-shell-test.html must verify service-worker activation does not delete unrelated origin caches."
);
assertIncludes(
  offlineShellTest,
  "offline shell serves core assets from the LoopCAT cache instead of unrelated caches",
  "offline-shell-test.html must verify service-worker reads ignore unrelated same-origin caches."
);
assertIncludes(
  offlineShellTest,
  "does not cache query variants",
  "offline-shell-test.html must verify runtime cache scope stays bounded."
);
assertIncludes(
  testRunner,
  "window.__loopcatBrowserRunnerStatus",
  "test-runner.html must expose a pollable runner summary for automated release checks."
);
assertIncludes(
  testRunner,
  "document.title = `LoopCAT Browser Test Runner - ${current}`",
  "test-runner.html must expose runner progress through the page title for iframe-light browser polling."
);
assertIncludes(
  testRunner,
  "frames.replaceChildren(frame)",
  "test-runner.html must keep only the active iframe alive so long browser runs stay inspectable."
);
assertIncludes(
  testRunner,
  "if (result.ok) frame.remove()",
  "test-runner.html must remove completed test iframes after successful runs."
);
assertIncludes(
  testRunner,
  "#appWorkflowTestResults",
  "test-runner.html must read the app workflow progress/result marker on timeout."
);
assertIncludes(
  testRunner,
  "./renderer-test/index.html#app-workflow-test",
  "test-runner.html must execute app workflow characterization through the isolated test renderer entry."
);
assertIncludes(
  testRunner,
  "timeout: 300000",
  "test-runner.html must give the large project fixture enough page-level time while preserving its internal performance assertions."
);
assertIncludes(
  appJs,
  "function segmentQueryMatcher",
  "app.js must compile active segment search filters once per filter pass for large-project performance."
);
assertIncludes(
  appJs,
  "positions: new Map",
  "app.js must cache visible segment positions for large-project keyboard navigation."
);
assertIncludes(
  appJs,
  "function filteredSegmentPosition",
  "app.js must expose cached visible segment position lookups."
);
assertIncludes(
  appJs,
  "const visibleIndex = filteredSegmentPosition(index)",
  "app.js must avoid rescanning visible segment indexes during keyboard navigation."
);
assertIncludes(
  appJs,
  "const segmentSourceWordCounts = new WeakMap",
  "app.js must cache per-segment source word counts outside persisted project data."
);
assertIncludes(
  appJs,
  "function sourceWordCount",
  "app.js must reuse cached source word counts during progress rendering."
);
assertIncludes(
  appJs,
  "for (const segment of state.segments)",
  "app.js must render project progress with one segment pass."
);
assertIncludes(
  appJs,
  "function projectDocumentStats",
  "app.js must compute project document stats in one shared pass for file-card rendering."
);
assertIncludes(
  appJs,
  "const documentStatsById = projectDocumentStats(documents)",
  "app.js project home rendering must reuse precomputed document stats."
);
assertIncludes(
  appJs,
  "function aggregateDocumentStats",
  "app.js must aggregate project-home totals from precomputed document stats."
);
assertIncludes(
  appJs,
  "const total = aggregateDocumentStats(documentStatsById)",
  "app.js project home rendering must avoid a second full segment pass for overall stats."
);
assertIncludes(
  appJs,
  "els.termBaseSelect.replaceChildren(fragment)",
  "app.js termbase selector options must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.projectFileList.replaceChildren(fragment)",
  "app.js project home file cards must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.projectList.replaceChildren(fragment)",
  "app.js sidebar project list must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.documentFilter.replaceChildren(fragment)",
  "app.js document filter options must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.languagePairFilter.replaceChildren(fragment)",
  "app.js language-pair filter options must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "for (const segment of segments)",
  "app.js project progress must avoid repeated status filter passes."
);
assertIncludes(
  appJs,
  "wordCount: progress.words",
  "app.js project summaries must reuse project progress word totals instead of rescanning segments."
);
assertIncludes(
  appJs,
  "searchText: projectSearchText",
  "app.js project summaries must cache dashboard search text for filtering."
);
assertIncludes(
  appJs,
  "languagePairKey: languagePairKey(project)",
  "app.js project summaries must cache dashboard language-pair keys for filtering."
);
assertIncludes(
  appJs,
  "searchText: project.searchText ||",
  "app.js project dashboard filtering must reuse cached project search text."
);
assertIncludes(
  readText("src/features/projects/projects-controller.js"),
  "root.replaceChildren(fragment)",
  "ProjectsController must render project dashboard tiles in one DOM replacement."
);
assertIncludes(
  appJs,
  "dashboard.replaceChildren(fragment)",
  "app.js resource dashboards must render cards in one DOM replacement."
);
assertIncludes(
  appJs,
  "function replaceResourceTableRows",
  "app.js resource detail tables must batch rows off-screen before replacing the table contents."
);
assertIncludes(
  appJs,
  "replaceResourceTableRows(table, entries, renderTmEntryRow)",
  "app.js TM resource detail rows must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "replaceResourceTableRows(table, terms, renderTermRow)",
  "app.js termbase resource detail rows must render in one DOM replacement."
);
assertIncludes(
  paletteControllerJs,
  "results.replaceChildren(fragment)",
  "PaletteController results must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.concordanceResults.replaceChildren(fragment)",
  "app.js concordance results must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.qaResults.replaceChildren(fragment)",
  "app.js QA result cards must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.tmMatches.replaceChildren(fragment)",
  "app.js TM match cards must render in one DOM replacement."
);
assertIncludes(
  appJs,
  "els.termSuggestions.replaceChildren(fragment)",
  "app.js term suggestion cards must render in one DOM replacement."
);
assertIncludes(appJs, "projectAnalysisRun", "app.js must guard async project analysis renders against stale updates.");
assertIncludes(
  appJs,
  'state.view !== "project"',
  "app.js must skip project analysis work when the project home panel is not visible."
);
assertIncludes(
  appJs,
  "run !== state.projectAnalysisRun",
  "app.js must ignore stale project analysis results after navigation."
);
assertIncludes(
  browserRunnerScript,
  'require("electron")',
  "scripts/verify-browser-runner.cjs must launch the installed Electron runtime."
);
assertIncludes(
  browserRunnerScript,
  'node_modules", "electron", "install.js',
  "scripts/verify-browser-runner.cjs must repair skipped Electron postinstall state before failing."
);
assertIncludes(
  browserRunnerScript,
  "ELECTRON_CACHE",
  "scripts/verify-browser-runner.cjs must use the project-local Electron cache when repairing Electron install state."
);
assertIncludes(
  browserRunnerScript,
  "browser-runner-electron.cjs",
  "scripts/verify-browser-runner.cjs must delegate to the Electron browser-runner main process."
);
assertIncludes(
  browserRunnerScript,
  "LOOPCAT_BROWSER_RUNNER_NO_SANDBOX",
  "scripts/verify-browser-runner.cjs must make the automation-only Chromium no-sandbox launch mode explicit."
);
assertIncludes(
  browserRunnerMainScript,
  "http.createServer",
  "scripts/browser-runner-electron.cjs must serve browser tests from a local HTTP origin."
);
assertIncludes(
  browserRunnerMainScript,
  "127.0.0.1",
  "scripts/browser-runner-electron.cjs must bind the browser-test server to localhost only."
);
assertIncludes(
  browserRunnerMainScript,
  "const allowedFiles = new Set",
  "scripts/browser-runner-electron.cjs must serve only an explicit browser-test allowlist."
);
assertIncludes(
  browserRunnerMainScript,
  "allowedFiles.has(relativePath)",
  "scripts/browser-runner-electron.cjs must reject non-allowlisted local files."
);
assertIncludes(
  browserRunnerMainScript,
  '"test-runner.html"',
  "scripts/browser-runner-electron.cjs must allow the browser test runner page."
);
assertIncludes(
  browserRunnerMainScript,
  '"large-project-test.html"',
  "scripts/browser-runner-electron.cjs must allow the large project browser fixture."
);
assertIncludes(
  browserRunnerMainScript,
  `require(path.join(productionRendererRoot, "config", "production-assets.js"))`,
  "scripts/browser-runner-electron.cjs must consume the production runtime manifest needed by the app workflow test."
);
assert(
  productionAssets.runtimeAssets.includes("app.js"),
  "Production runtime asset manifest must allow the app coordinator needed by the app workflow test."
);
assertIncludes(
  browserRunnerMainScript,
  '"LICENSE"',
  "scripts/browser-runner-electron.cjs must allow the offline shell to cache LICENSE."
);
assertIncludes(
  browserRunnerMainScript,
  '"NOTICE"',
  "scripts/browser-runner-electron.cjs must allow the offline shell to cache NOTICE."
);
assertIncludes(
  browserRunnerMainScript,
  "test-runner.html",
  "scripts/browser-runner-electron.cjs must load the browser test runner."
);
assertIncludes(
  browserRunnerMainScript,
  "page-title-updated",
  "scripts/browser-runner-electron.cjs must observe the runner title status."
);
assertIncludes(
  browserRunnerMainScript,
  "ALL TESTS PASS",
  "scripts/browser-runner-electron.cjs must exit successfully only after the browser runner reports all tests passed."
);
assertIncludes(
  browserRunnerMainScript,
  "TEST RUN FAILED",
  "scripts/browser-runner-electron.cjs must fail when the browser runner reports a failure."
);
assertIncludes(
  browserRunnerMainScript,
  "windowRef.destroy()",
  "scripts/browser-runner-electron.cjs must destroy the hidden browser window on timeout or failure so modal dialogs cannot leave Electron running."
);
assertIncludes(
  browserRunnerMainScript,
  "app.disableHardwareAcceleration()",
  "scripts/browser-runner-electron.cjs must disable hardware acceleration before launching hidden release tests."
);
assertIncludes(
  browserRunnerMainScript,
  "LOOPCAT_BROWSER_RUNNER_NO_SANDBOX",
  "scripts/browser-runner-electron.cjs must scope no-sandbox browser-test launches to an explicit automation environment flag."
);
assertIncludes(
  browserRunnerMainScript,
  'app.commandLine.appendSwitch("no-sandbox")',
  "scripts/browser-runner-electron.cjs must use Chromium's no-sandbox switch only when automation requests it."
);
assertIncludes(
  browserRunnerMainScript,
  "app.exit(code)",
  "scripts/browser-runner-electron.cjs must preserve nonzero exit codes for renderer launch failures."
);
assertIncludes(
  browserRunnerMainScript,
  'app.setPath("userData", runnerUserDataDir)',
  "scripts/browser-runner-electron.cjs must isolate browser-runner profile data so offline cache tests are deterministic."
);
assertIncludes(
  browserRunnerMainScript,
  "loopcat-browser-runner-",
  "scripts/browser-runner-electron.cjs must use a unique temporary user-data directory per browser verification run."
);
assertIncludes(
  browserRunnerMainScript,
  "runnerDiagnostic",
  "scripts/browser-runner-electron.cjs must include inner-frame diagnostics for timed-out browser verification runs."
);
assertIncludes(
  browserRunnerMainScript,
  "__loopcatBrowserRunnerStatus",
  "scripts/browser-runner-electron.cjs timeout diagnostics must include the browser runner status text."
);
assertIncludes(
  browserRunnerMainScript,
  "Timed out collecting browser runner diagnostics.",
  "scripts/browser-runner-electron.cjs timeout diagnostics must not hang indefinitely when a renderer is busy."
);
assertIncludes(
  browserRunnerMainScript,
  "show: false",
  "scripts/browser-runner-electron.cjs must keep release browser tests noninteractive."
);
assertIncludes(
  browserRunnerMainScript,
  "nodeIntegration: false",
  "scripts/browser-runner-electron.cjs must run browser tests without Node integration in the renderer."
);

assertIncludes(appJs, '"serviceWorker" in navigator', "app.js must guard service worker registration.");
assertIncludes(
  appJs,
  'window.location.protocol === "loopcat:"',
  "app.js must clean up stale desktop service workers without relying on unsupported loopcat Cache Storage."
);
assertIncludes(appJs, '"http:", "https:"', "app.js must limit service worker registration to browser HTTP(S) origins.");
assertIncludes(
  updateControllerJs,
  "serviceWorker.register(trustedScriptUrl)",
  "UpdateController must register the local service worker."
);
assertIncludes(
  updateControllerJs,
  "controllerchange",
  "UpdateController must wait for service worker update activation."
);
assertIncludes(
  updateControllerJs,
  "registration.waiting && serviceWorker.controller",
  "UpdateController must avoid showing the update notice during first service-worker install."
);
assertIncludes(
  updateControllerJs,
  "registration.update?.()",
  "UpdateController must check for service worker updates after registration."
);
assert(!/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(appJs), "app.js must not contain distributed raw HTML sinks.");
assert(
  !/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(localizationJs),
  "localization.js must not assign imported or translated HTML through a raw injection sink."
);
assertIncludes(
  safeHtmlJs,
  'createPolicy("loopcat-sanitized-ui"',
  "The centralized safe-DOM boundary must own the LoopCAT Trusted Types policy."
);
assertIncludes(
  indexHtml,
  `id="fileEncodingSelect"`,
  "index.html must expose a manual text-encoding override for legacy imports."
);
assertIncludes(indexHtml, `./encoding.js`, "index.html must load the text encoding helper before text import parsers.");
assertIncludes(encodingJs, "decodeTextFile", "encoding.js must expose byte-aware text file decoding.");
assertIncludes(encodingJs, "windows-1256", "encoding.js must support Arabic Windows-1256 decoding.");
assertIncludes(encodingJs, "shift_jis", "encoding.js must support Japanese Shift_JIS decoding.");
assertIncludes(encodingJs, "encodeText", "encoding.js must expose safe text encoding for preservable legacy exports.");
assertIncludes(
  appJs,
  "text import encoding override offers Arabic and Japanese legacy encodings",
  "app workflow test must verify the manual legacy encoding override is available."
);
assertIncludes(
  appJs,
  "Windows-1254 Turkish text import preserves dotted and dotless Turkish characters",
  "app workflow test must verify Turkish Windows-1254 decoding."
);
assertIncludes(
  appJs,
  "Windows-1256 Arabic text import decodes Arabic script",
  "app workflow test must verify Arabic Windows-1256 decoding."
);
assertIncludes(
  appJs,
  "Windows-1251 Cyrillic text import decodes Cyrillic script",
  "app workflow test must verify Cyrillic Windows-1251 decoding."
);
assertIncludes(
  appJs,
  "Shift_JIS Japanese text import decodes Japanese script",
  "app workflow test must verify Japanese Shift_JIS decoding."
);
assertIncludes(
  appJs,
  "UTF-16 BOM text import detects encoding before parsing",
  "app workflow test must verify UTF-16 BOM decoding."
);
assertIncludes(
  appJs,
  "TMX import decodes Windows-1254 translation memory text",
  "app workflow test must verify legacy-encoded TMX translation memory import."
);
assertIncludes(
  appJs,
  "TBX import decodes Windows-1254 termbase text",
  "app workflow test must verify legacy-encoded TBX termbase import."
);
assertIncludes(
  appJs,
  "CSV term list import uses manual Windows-1254 override for terminology text",
  "app workflow test must verify manual legacy encoding override for term-list imports."
);
assertIncludes(
  appJs,
  "safeDownloadFilename(filename)",
  "app.js must sanitize export filenames before assigning download attributes."
);
assertIncludes(
  appJs,
  "RESERVED_WINDOWS_FILENAME_PATTERN",
  "app.js must guard exported filenames against Windows reserved device names."
);
assertIncludes(
  appJs,
  "link.download = safeDownloadFilename(filename)",
  "app.js must route every browser download through the safe filename helper."
);
assertIncludes(
  appJs,
  'redactSensitiveText(filename || "")',
  "app.js must redact credential-looking text before assigning browser download filenames."
);
assertIncludes(
  appJs,
  "function displaySafeText",
  "app.js must centralize redaction for user-visible project/file/resource labels."
);
assertIncludes(
  appJs,
  "function displaySafeHtml",
  "app.js must centralize escaped redaction for rendered project/file/resource labels."
);
assertIncludes(
  functionBody(appJs, "function setSaveStatus", "function renderImportBusyState"),
  'redactSensitiveText(text || "")',
  "app.js must redact credential-looking text before displaying save/status messages."
);
assertIncludes(
  functionBody(appJs, "function clearOpenAiKey", "function openAiKeyStorageLabel"),
  'redactSensitiveText(error.message || "OpenAI key could not be cleared.")',
  "app.js must redact credential-looking text from AI key-storage status errors."
);
assertIncludes(
  appJs,
  "function sanitizeValidationReportForDisplay",
  "app.js must centralize redaction for validation report display messages."
);
assertIncludes(
  functionBody(appJs, "function sanitizeValidationReportForDisplay", "function renderValidationReport"),
  'redactSensitiveText(message || "")',
  "app.js must redact credential-looking validation report messages before display."
);
assertIncludes(
  appJs,
  "function validationAlertText",
  "app.js must sanitize project-package validation alert text before display."
);
assertIncludes(
  appJs,
  "uiAlert(validationAlertText(validation",
  "app.js project-package validation alerts must use sanitized validation text."
);
assertIncludes(
  functionBody(appJs, "function download", "function escapeHtml"),
  "finally",
  "app.js download helper must clean up temporary links even when the browser rejects the download click."
);
assertIncludes(
  functionBody(appJs, "function download", "function escapeHtml"),
  "clickAccepted ? setTimeout(revokeDownloadUrl, 1000) : revokeDownloadUrl()",
  "app.js download helper must immediately revoke temporary object URLs when the click handoff fails."
);
assertIncludes(
  appJs,
  "downloads sanitize reserved names path separators unsafe characters and credential-looking labels",
  "app workflow test must verify download filename sanitization and label redaction."
);
assertIncludes(
  appJs,
  "save status redacts credential-looking text",
  "app workflow test must verify visible save/status text redacts credential-looking values."
);
assertIncludes(
  appJs,
  "AI connection status redacts credential-looking key-storage errors",
  "app workflow test must verify AI connection status errors redact credential-looking values."
);
assertIncludes(
  appJs,
  "validation report display redacts credential-looking app-added messages",
  "app workflow test must verify validation report display and state redact credential-looking app-added messages."
);
assertIncludes(
  appJs,
  "project package validation alert redacts credential-looking errors",
  "app workflow test must verify project-package validation alerts redact credential-looking errors."
);
assertIncludes(
  appJs,
  "project and document labels redact credential-looking text in visible UI and prompts",
  "app workflow test must verify project/document labels and prompts redact credential-looking values."
);
assertIncludes(
  appJs,
  "resource labels redact credential-looking text in visible UI",
  "app workflow test must verify resource labels redact credential-looking values."
);
assertIncludes(
  appJs,
  "target TXT export click failure cleans up temporary download link and URL",
  "app workflow test must verify failed browser download clicks clean up temporary links and object URLs."
);
assertIncludes(appJs, "function stableLower(value)", "app.js must centralize locale-stable UI search casing.");
assert(
  !appJs.includes(".toLocaleLowerCase()"),
  "app.js must not use the user interface locale for editor search, replace, command, or duplicate-file matching."
);
assertIncludes(
  appJs,
  "case-insensitive target replace is stable under Turkish locale casing",
  "app workflow test must verify target replacement is not broken by Turkish UI locales."
);
assertIncludes(
  appJs,
  "duplicate file detection is stable under Turkish locale casing",
  "app workflow test must verify duplicate import detection is not broken by Turkish UI locales."
);
assertIncludes(
  appJs,
  "project domain save failure reports visible status without changing project metadata",
  "app workflow test must verify failed project domain saves do not change project metadata."
);
assertIncludes(
  appJs,
  "project settings activity log failure reports warning after successful settings save",
  "app workflow test must verify project settings are not reported failed when optional activity logging fails."
);
assertIncludes(
  appJs,
  "project creation activity log failure reports warning after successful project creation",
  "app workflow test must verify project creation is not reported failed when optional activity logging fails."
);
assertIncludes(
  appJs,
  "target TXT export failure reports visible status",
  "app workflow test must verify target TXT export failures report visible status."
);
assertIncludes(
  appJs,
  "target TXT export activity log failure reports warning after successful download",
  "app workflow test must verify successful exports are not reported failed when optional activity logging fails."
);
assertIncludes(
  appJs,
  "function exportDocumentForTypes",
  "app.js must route delivery exports through strict selected-document handling."
);
assertIncludes(
  appJs,
  "DOCX export blocks non-DOCX selected document instead of silently exporting another file",
  "app workflow test must verify DOCX export cannot silently switch away from the selected file."
);
assertIncludes(
  appJs,
  "XLIFF export failure reports visible status",
  "app workflow test must verify XLIFF export failures report visible status."
);
assertIncludes(
  appJs,
  "project TMX export failure reports visible status",
  "app workflow test must verify TMX export failures report visible status."
);
assertIncludes(
  appJs,
  "project TBX export failure reports visible status",
  "app workflow test must verify TBX export failures report visible status."
);
assertIncludes(
  appJs,
  "resource export failure reports visible status",
  "app workflow test must verify resource export failures report visible status."
);
assertIncludes(
  appJs,
  "TM resource row save failure reports visible status without changing stored entry",
  "app workflow test must verify failed TM resource-row saves report visibly and do not change stored entries."
);
assertIncludes(
  appJs,
  "term resource row save failure reports visible status without changing stored term",
  "app workflow test must verify failed term resource-row saves report visibly and do not change stored terms."
);
assertIncludes(
  appJs,
  "TM resource row delete failure reports visible status without deleting stored entry",
  "app workflow test must verify failed TM resource-row deletes report visibly and do not remove stored entries."
);
assertIncludes(
  appJs,
  "term resource row delete failure reports visible status without deleting stored term",
  "app workflow test must verify failed term resource-row deletes report visibly and do not remove stored terms."
);
assertIncludes(
  appJs,
  "term suggestion delete failure reports visible status without deleting stored term",
  "app workflow test must verify failed term suggestion deletes report visibly and do not remove stored terms."
);
assertIncludes(
  appJs,
  "TM whole resource delete failure preserves every live entry and creates no Trash item",
  "app workflow test must verify failed whole-TM deletes report visibly and do not partially delete entries."
);
assertIncludes(
  appJs,
  "termbase whole resource delete failure preserves every live term and creates no Trash item",
  "app workflow test must verify failed whole-termbase deletes report visibly and do not partially delete terms."
);
assertIncludes(
  appJs,
  "term form save failure reports visible status without changing stored terms",
  "app workflow test must verify failed sidebar term creation reports visibly and does not change stored terms."
);
assertIncludes(
  appJs,
  "failed pending save flush keeps autosave queued",
  "app workflow test must verify failed forced autosave flushes keep pending segment saves queued."
);
assertIncludes(
  functionBody(appJs, "function queueSegmentSave", "function pendingSaveRecords"),
  "AUTOSAVE_RETRY_DELAY_MS",
  "app.js background autosave failures must schedule a retry instead of leaving a dead pending timer."
);
assertIncludes(
  appJs,
  "timed autosave retry persists target after transient failure",
  "app workflow test must verify transient background autosave failures retry and persist the target text."
);
assertIncludes(
  functionBody(appJs, "async function restoreBackupData", "async function restoreBackupFile"),
  "await flushPendingSegmentSaves()",
  "app.js backup restore must flush pending target edits before replacing local stores."
);
assertIncludes(
  functionBody(appJs, "async function importProjectPackageData", "async function importProjectPackage(file)"),
  "await flushPendingSegmentSaves(replaceProjectId)",
  "app.js same-project package replacement must flush pending target edits before replacing project records."
);
assertIncludes(
  appJs,
  "backup restore stops before destructive restore when pending save flush fails",
  "app workflow test must verify backup restore refuses to replace stores when pending target saves cannot be flushed."
);
assertIncludes(
  appJs,
  "project package replacement stops before destructive import when pending save flush fails",
  "app workflow test must verify same-project package replacement refuses to replace records when pending target saves cannot be flushed."
);
assertIncludes(
  appJs,
  "file import metadata failure leaves no orphan segments",
  "app workflow test must verify failed project metadata writes do not leave imported segment orphans."
);
assertIncludes(
  appJs,
  "APP WORKFLOW PROGRESS",
  "app workflow tests must report last passed assertions through the parent runner title for timeout diagnostics."
);
assertIncludes(
  functionBody(appJs, "async function importDocx(file)", "async function importLocalization(file)"),
  'assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);',
  "app.js direct DOCX import helper must reject oversized project files before parsing."
);
assertIncludes(
  functionBody(appJs, "async function importDocx(file)", "async function importLocalization(file)"),
  "state.documentFilter = documentId",
  "app.js DOCX import must select the newly imported document like other file imports."
);
assertIncludes(
  functionBody(appJs, "async function importLocalization(file)", "async function importXliff(file)"),
  'assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);',
  "app.js direct localization import helper must reject oversized project files before parsing."
);
assertIncludes(
  functionBody(appJs, "async function importXliff(file)", "function projectHasDocumentNamed"),
  'assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);',
  "app.js direct XLIFF import helper must reject oversized project files before parsing."
);
assertIncludes(
  appJs,
  "direct DOCX import helper rejects oversized files before parsing",
  "app workflow test must verify direct DOCX import helpers cannot bypass file-size checks."
);
assertIncludes(
  appJs,
  "DOCX import selects newly imported document",
  "app workflow test must verify DOCX import lands the user on the newly imported file."
);
assertIncludes(appJs, "function renderImportBusyState", "app.js must keep a visible import busy-state guard.");
assertIncludes(
  functionBody(appJs, "const importExportController", "const projectDialogController"),
  "runImportTask: runFileImportTask",
  "app.js must inject the shared import busy-state guard into the checked import/export controller."
);
assertIncludes(
  functionBody(appJs, "const importExportController", "const projectDialogController"),
  "await flushPendingSegmentSaves();",
  "app.js must flush pending edits before checked package-import and backup-restore boundaries."
);
assertIncludes(
  functionBody(appJs, "function shouldWarnBeforeUnload()", "function handleBeforeUnload"),
  "state.importTask",
  "app.js must warn before close/reload while import or restore tasks are active."
);
assertIncludes(
  appJs,
  "overlapping import task is blocked before it mutates project data",
  "app workflow test must verify overlapping imports are blocked before state mutation."
);
assertIncludes(
  appJs,
  "overlapping workspace sync is blocked before it reads package data",
  "app workflow test must verify workspace sync cannot overlap with active imports."
);
assertIncludes(
  functionBody(appJs, "function renderImportBusyState()", "function stableLower"),
  "importExportController?.renderBusy",
  "app.js must delegate shared import-control busy state to the checked import/export controller."
);
assertIncludes(
  functionBody(appJs, "function renderImportBusyState()", "function stableLower"),
  "recoveryWorkspaceController?.renderBusy",
  "app.js must delegate workspace-sync busy state while import or restore tasks are active."
);
assertIncludes(
  functionBody(appJs, "const recoveryWorkspaceController", "const projectDialogController"),
  'runFileImportTask("Workspace sync"',
  "the checked recovery/workspace controller must receive workspace sync through the import busy-state guard."
);
assertIncludes(
  appJs,
  "active import task warns before closing",
  "app workflow test must verify active imports warn before close/reload."
);
assertIncludes(
  appJs,
  "active import progress reports phase, file name, and file size",
  "app workflow test must verify active import progress reports phase, file name, and file size."
);
assertIncludes(
  appJs,
  "function setImportProgress",
  "app.js must expose a shared import progress helper for long-running imports."
);
assertIncludes(
  appJs,
  "async function reportImportProgress",
  "app.js must yield after import progress updates before heavy import phases."
);
assertIncludes(
  appJs,
  "function yieldToUi",
  "app.js must provide a UI-yield helper for long-running import phase updates."
);
assertIncludes(
  appJs,
  "requestAnimationFrame",
  "app.js import progress must yield through requestAnimationFrame when available."
);
assertIncludes(
  appJs,
  "setTimeout(finish, 50)",
  "app.js import progress yield must have a timeout fallback for throttled background windows."
);
assertIncludes(appJs, "formatFileSize", "app.js import progress must include human-readable file sizes.");
assertIncludes(
  appJs,
  "async function refreshStorageDurability",
  "app.js must check browser storage persistence and quota for long offline projects."
);
assertIncludes(appJs, "navigator.storage", "app.js must use the browser storage API when available.");
assertIncludes(
  functionBody(appJs, "async function refreshStorageDurability", "function setImportProgress"),
  "storageApi.persist()",
  "app.js must request persistent browser storage when supported."
);
assertIncludes(
  functionBody(appJs, "async function refreshStorageDurability", "function setImportProgress"),
  "storageApi.estimate()",
  "app.js must estimate local storage usage for recoverability warnings."
);
assertIncludes(
  functionBody(appJs, "function renderWorkspaceStatus()", "function workspaceRecoveryProjectIds"),
  "storageDurabilityLine(state.storageDurability)",
  "app.js workspace health must show browser storage durability."
);
assertIncludes(
  appJs,
  "best-effort and nearly-full storage states warn before long offline projects grow",
  "app workflow test must verify browser storage durability warnings are visible."
);
assertIncludes(
  readme,
  "Request persistent browser storage",
  "README.md must document the browser storage durability check."
);
assertIncludes(
  roadmap,
  "Browser storage persistence is requested",
  "ROADMAP.md must track storage durability as part of the offline release baseline."
);
assertIncludes(
  readme,
  "Import, restore, and workspace-folder sync controls are disabled",
  "README.md must document import, restore, and workspace sync overlap protection."
);
assertIncludes(
  readme,
  "status area reports the active import phase with the file name and file size",
  "README.md must document visible active import progress."
);
assertIncludes(
  readme,
  "Import phases yield back to the browser",
  "README.md must document that long-running import progress can paint between heavy phases."
);
assertIncludes(
  readme,
  "warns before close or reload while an import or restore task is still running",
  "README.md must document active import/restore close warnings."
);
assertIncludes(
  readme,
  "expected LoopCAT release names",
  "README.md must document strict public download artifact naming."
);
assertIncludes(
  readme,
  "verify-download-artifacts-selftest.cjs",
  "README.md must document the download artifact rule self-test."
);
assertIncludes(
  readme,
  "verify-platform-signatures-selftest.cjs",
  "README.md must document the platform signature artifact rule self-test."
);
assertIncludes(
  functionBody(appJs, "function projectDocuments()", "function projectDocumentType"),
  "projectDocumentManifest(state.project)",
  "app.js document lists must include saved project document metadata even when a document has no segment rows."
);
assertIncludes(
  functionBody(appJs, "function projectDocumentManifest", "function cleanProjectResourceLinks"),
  "stableLower(cleanProjectText(documentInfo.type",
  "app.js document metadata types must be normalized before export selection."
);
assertIncludes(
  appJs,
  "localization export normalizes stored document type casing",
  "app workflow test must verify stored document type casing cannot break localization export."
);
assertIncludes(
  appJs,
  "metadata-only project documents remain visible without segment rows",
  "app workflow test must verify saved document metadata cannot disappear when no segments exist."
);
assertIncludes(
  appJs,
  "metadata-only project documents can be deleted without orphan segments",
  "app workflow test must verify metadata-only documents can be deleted cleanly."
);
assertIncludes(
  appJs,
  "direct XLIFF import helper rejects oversized files before parsing",
  "app workflow test must verify direct XLIFF import helpers cannot bypass file-size checks."
);
assertIncludes(
  appJs,
  "direct localization import helper rejects oversized files before parsing",
  "app workflow test must verify direct localization import helpers cannot bypass file-size checks."
);
assertIncludes(
  appJs,
  "localization import activity log failure reports warning after successful import",
  "app workflow test must verify successful imports are not reported failed when optional activity logging fails."
);
assertIncludes(
  appJs,
  "project package import activity log failure reports warning after successful package import",
  "app workflow test must verify successful project package imports are not reported failed when optional activity logging fails."
);
assertIncludes(
  appJs,
  "project package import activity belongs to the imported project",
  "app workflow test must verify project-package import activity is recorded on the imported project."
);
assertIncludes(
  appJs,
  "workspace sync reports validation notes from imported packages",
  "app workflow test must verify workspace sync does not hide imported package validation notes."
);
assertIncludes(
  readme,
  "workspace-folder sync runs through the same import busy-state guard",
  "README.md must document guarded workspace sync imports."
);
assertIncludes(
  appJs,
  "project package download failure does not record export success",
  "app workflow test must verify failed project-package downloads do not write export history or activity."
);
assertIncludes(
  appJs,
  "const finalWarnings = reportCount(pkg.validation);",
  "app.js must base project-package export status on the final downloaded package validation."
);
assertIncludes(
  appJs,
  'draftProjectActivityEvent(state.project, "export", "Project package exported"',
  "app.js must draft project-package export activity before download so success history can be committed only after download succeeds."
);
assertIncludes(
  appJs,
  "function reportProjectPackageExportFailure",
  "app.js must report project-package construction failures visibly before download."
);
assertIncludes(
  appJs,
  "project package export reports pending save flush failure without download or activity",
  "app workflow test must verify failed pending-save flushes block project package export without download or misleading activity."
);
assertIncludes(
  appJs,
  "target replace save failure restores visible and persisted target text",
  "app workflow test must verify failed target replacements roll back visible and persisted text."
);
assertIncludes(
  appJs,
  "direct TM save failure reports visible status",
  "app workflow test must verify direct TM-save failures report visible status."
);
assertIncludes(
  appJs,
  "direct TM save reports visible success",
  "app workflow test must verify direct TM-save success reports visible status."
);
assertIncludes(
  appJs,
  "confirm segment failure restores draft state and reports visible status",
  "app workflow test must verify failed segment confirmation rolls back visible state."
);
assertIncludes(
  appJs,
  "confirm segment post-save failure restores persisted draft state",
  "app workflow test must verify failed segment confirmation rolls back persisted state."
);
assertIncludes(
  appJs,
  "confirm TM save failure keeps segment confirmed and reports warning",
  "app workflow test must verify segment confirmation is not undone when the secondary TM save fails."
);
assertIncludes(
  appJs,
  "confirm activity log failure keeps segment confirmed and reports warning",
  "app workflow test must verify segment confirmation is not undone when optional activity logging fails."
);
assertIncludes(
  appJs,
  "review panel and review filter are available in the editor",
  "app workflow test must verify review controls are present in the editor."
);
assertIncludes(
  appJs,
  "review metadata save failure restores visible and persisted review fields",
  "app workflow test must verify failed review metadata saves roll back visible and persisted state."
);
assertIncludes(
  appJs,
  "checked quality/review controller owns review submit, persistence delegation, and form refresh",
  "app workflow test must verify the checked review form saves notes and comments."
);
assertIncludes(
  appJs,
  "quick review state failure restores visible and persisted review state",
  "app workflow test must verify failed quick-review state saves roll back visible and persisted state."
);
assertIncludes(
  appJs,
  "AI suggestion save failure restores visible and persisted suggestion list",
  "app workflow test must verify failed AI suggestion saves roll back visible and persisted state."
);
assertIncludes(
  appJs,
  "function savedAiSuggestionRecord",
  "app.js must normalize AI suggestions through an allowlist before local segment storage."
);
assertIncludes(
  appJs,
  "AI suggestion save strips provider trace metadata before local storage",
  "app workflow test must verify saved AI suggestions do not retain provider traces or duplicated source text."
);
assertIncludes(
  appJs,
  "AI suggestion apply failure restores visible and persisted target text",
  "app workflow test must verify failed AI suggestion application rolls back visible and persisted target text."
);
assertIncludes(
  appJs,
  "AI suggestion activity log failure reports warning after successful suggestion save",
  "app workflow test must verify AI suggestion activity-log failure is visible after saved suggestions."
);
assertIncludes(
  appJs,
  "AI suggestion apply activity log failure reports warning after successful target save",
  "app workflow test must verify AI suggestion apply activity-log failure is visible after saved targets."
);
assertIncludes(
  appJs,
  "project updates normalize AI settings and strip secret-shaped metadata",
  "app workflow test must verify local project updates cannot preserve secret-shaped AI settings metadata."
);
assertIncludes(
  appJs,
  "AI settings save redacts credential-looking provider and model metadata without storing typed OpenAI keys",
  "app workflow test must verify live AI settings provider/model redaction and key-storage scoping."
);
assertIncludes(
  readText("project.js"),
  'provider: redactSensitiveText(source.provider || "OpenAI").trim() || "OpenAI"',
  "project.js project AI settings normalization must redact credential-shaped provider labels."
);
assertIncludes(
  readText("project.js"),
  'model: redactSensitiveText(source.model || "gpt-5.5").trim() || "gpt-5.5"',
  "project.js project AI settings normalization must redact credential-shaped model labels."
);
assertIncludes(
  readText("project.js"),
  "const sourceLang = redactSensitiveText(cleanText(project.sourceLang",
  "project.js project identity normalization must redact credential-shaped source-language labels."
);
assertIncludes(
  readText("project.js"),
  "const targetLang = redactSensitiveText(cleanText(project.targetLang",
  "project.js project identity normalization must redact credential-shaped target-language labels."
);
assertIncludes(
  readText("project.js"),
  "function cleanPortableLabel",
  "project.js project-save resource normalization must redact credential-shaped resource labels."
);
assertIncludes(
  readText("project.js"),
  "const name = cleanPortableLabel(link.name);",
  "project.js project-save resource links must redact credential-shaped resource labels."
);
assertIncludes(
  readText("project.js"),
  "const main = cleanPortableLabel(mainTmName",
  "project.js project-save main TM metadata must redact credential-shaped resource labels."
);
assertIncludes(
  readText("project.js"),
  'name: cleanPortableLabel(documentInfo.name, "Document")',
  "project.js project-save document manifests must redact credential-shaped file labels."
);
assertIncludes(
  readText("project.js"),
  'sourceFileName: cleanPortableLabel(projectWithoutAcademicMetadata.sourceFileName || "")',
  "project.js project-save source file metadata must redact credential-shaped file labels."
);
assertIncludes(
  readText("project.js"),
  'const documentName = cleanPortableLabel(options.documentName, "Imported document");',
  "project.js segment imports must redact credential-shaped document labels before local storage."
);
assertIncludes(
  regressionTest,
  "project update redacts credential-looking provider model and style metadata",
  "regression-test.html must verify direct project updates redact credential-looking AI settings metadata."
);
assertIncludes(
  regressionTest,
  "project save redacts credential-looking language metadata",
  "regression-test.html must verify direct project saves redact credential-looking language metadata."
);
assertIncludes(
  regressionTest,
  "project save redacts credential-looking resource label metadata",
  "regression-test.html must verify direct project creation redacts credential-looking resource labels."
);
assertIncludes(
  regressionTest,
  "project update redacts credential-looking resource label metadata",
  "regression-test.html must verify direct project updates redact credential-looking resource labels."
);
assertIncludes(
  regressionTest,
  "project update redacts credential-looking file and document label metadata",
  "regression-test.html must verify direct project updates redact credential-looking file and document labels."
);
assertIncludes(
  regressionTest,
  "project segment import redacts credential-looking document label metadata",
  "regression-test.html must verify segment imports redact credential-looking document labels."
);
assertIncludes(
  regressionTest,
  "project package validation rejects credential-looking language metadata",
  "regression-test.html must verify package validation rejects credential-looking language metadata before handoff."
);
assertIncludes(
  readText("storage.js"),
  '"sourceLang", "targetLang"',
  "storage.js portable sanitization must treat source and target language metadata as redacted portable labels."
);
assertIncludes(
  validationJs,
  "PORTABLE_LABEL_VALUE_KEYS",
  "validation.js portable validation must treat source and target language metadata as sensitive portable labels."
);
assertIncludes(
  validationJs,
  '"sourceLang"',
  "validation.js must treat source language metadata as a sensitive portable label."
);
assertIncludes(
  validationJs,
  '"targetLang"',
  "validation.js must treat target language metadata as a sensitive portable label."
);
assertIncludes(
  readText("storage.js"),
  'if (key === "aiSettings") return defaultAiSettings(value);',
  "storage.js portable backup/export sanitization must normalize AI settings through an allowlist."
);
assertIncludes(
  readText("storage.js"),
  'provider: redactSensitiveText(source.provider || "OpenAI").trim() || "OpenAI"',
  "storage.js project and portable AI settings normalization must redact credential-shaped provider labels."
);
assertIncludes(
  readText("storage.js"),
  'model: redactSensitiveText(source.model || "gpt-5.5").trim() || "gpt-5.5"',
  "storage.js project and portable AI settings normalization must redact credential-shaped model labels."
);
assertIncludes(
  readText("storage.js"),
  "value.map((item) => sanitizedAiSuggestion(item, activeContext))",
  "storage.js portable backup/export sanitization must normalize AI suggestions through an allowlist."
);
assertIncludes(
  readText("storage.js"),
  'redactSensitiveText(item || "").trim()',
  "storage.js portable backup/export sanitization must redact credential-shaped AI suggestion explanations."
);
assertIncludes(
  readText("storage.js"),
  "sanitizedActivityEvent",
  "storage.js portable backup/export sanitization must normalize activity events through a safe export shape."
);
assertIncludes(
  readText("storage.js"),
  'const type = redactSensitiveText(source.type || "activity").trim() || "activity";',
  "storage.js portable activity-event types must redact credential-shaped text."
);
assertIncludes(
  readText("storage.js"),
  'detail: redactSensitivePortableStrings(sanitizePortableValue(source.detail || {}, "", [], activeContext))',
  "storage.js portable activity-event details must redact credential-shaped strings after provider trace stripping."
);
assertIncludes(
  readText("storage.js"),
  "AI activity recorded",
  "storage.js portable backup/export sanitization must redact AI activity summaries before handoff."
);
assertIncludes(
  readText("storage.js"),
  "function sanitizedActivityDetail",
  "storage.js local activity-event saves must strip provider traces and secrets before local storage."
);
assertIncludes(
  readText("storage.js"),
  "const event = localActivityEventRecord(activity);",
  "storage.js recordActivityEvent must route local activity writes through the safe local activity shape."
);
assertIncludes(
  regressionTest,
  "local activity event save strips provider trace details before storage",
  "regression-test.html must verify local activity records strip provider traces before storage."
);
assertIncludes(
  readText("storage.js"),
  "PROVIDER_TRACE_FIELD_PATTERN",
  "storage.js portable backup/export sanitization must strip provider trace fields."
);
assertIncludes(
  readText("storage.js"),
  "cookie|session",
  "storage.js portable backup/export sanitization must strip session and cookie credential fields."
);
assertIncludes(
  readText("storage.js"),
  "SENSITIVE_TEXT_VALUE_PATTERN",
  "storage.js portable backup/export sanitization must redact credential-shaped values in activity summaries."
);
assertIncludes(
  readText("storage.js"),
  'if (key === "domain" && !isSourceJsonPath(currentPath)) return redactSensitiveText(value);',
  "storage.js portable backup/export sanitization must redact credential-shaped project domain metadata."
);
assertIncludes(
  readText("storage.js"),
  'if (key === "academicMetadata" && !isSourceJsonPath(currentPath)) return undefined;',
  "storage.js portable backup/export sanitization must strip legacy academic metadata."
);
assertIncludes(
  readText("storage.js"),
  "isPortableLabelPath(currentPath)",
  "storage.js portable backup/export sanitization must redact credential-shaped app label metadata."
);
assertIncludes(
  readText("storage.js"),
  "const name = cleanPortableLabel(link.name);",
  "storage.js legacy project migration must redact credential-shaped resource-link labels."
);
assertIncludes(
  readText("storage.js"),
  "projectWithoutAcademicMetadata.mainTmName",
  "storage.js legacy project migration must redact credential-shaped main TM labels."
);
assertIncludes(
  readText("storage.js"),
  'name: cleanPortableLabel(document.name, "Document")',
  "storage.js legacy project migration must redact credential-shaped document labels."
);
assertIncludes(
  readText("storage.js"),
  'sourceFileName: cleanPortableLabel(projectWithoutAcademicMetadata.sourceFileName || "")',
  "storage.js legacy project migration must redact credential-shaped source file labels."
);
assertIncludes(
  readText("storage.js"),
  "PORTABLE_RECORD_ID_KEYS",
  "storage.js portable backup/export sanitization must identify record ID fields that may contain credential-shaped values."
);
assertIncludes(
  readText("storage.js"),
  "isPortableRecordIdPath(currentPath)",
  "storage.js portable backup/export sanitization must redact credential-shaped record IDs."
);
assertIncludes(
  readText("storage.js"),
  "function portableRecordIdReplacement",
  "storage.js portable backup/export sanitization must replace credential-shaped record IDs with non-secret surrogates."
);
assertIncludes(
  readText("storage.js"),
  'makeId("redacted-id")',
  "storage.js portable backup/export sanitization must use collision-resistant non-secret record ID surrogates."
);
assertIncludes(
  readText("storage.js"),
  'cleanPortableRecordId(source.projectId, "", activeContext)',
  "storage.js portable activity-event sanitization must redact credential-shaped activity record IDs."
);
assertIncludes(
  readText("storage.js"),
  "const portableContext = createPortableSanitizerContext();",
  "storage.js backup export must share one record-ID surrogate map across restored project stores."
);
assertIncludes(
  readText("storage.js"),
  'const importedSegments = portableRecordArray(segments, "Project package segments", portableContext);',
  "storage.js direct project-package import must share one record-ID surrogate map across package sections."
);
assertIncludes(
  readText("storage.js"),
  'const activityEvents = portableRecordArray(data.activityEvents, "Activity events", portableContext);',
  "storage.js direct backup restore must share one record-ID surrogate map across backup stores."
);
assertIncludes(
  appJs,
  "const portableContext = createPortableSanitizerContext();",
  "app.js project package export must share one record-ID surrogate map across package sections."
);
assertIncludes(
  readText("storage.js"),
  "function sanitizedTermRecord",
  "storage.js portable backup/export sanitization must redact credential-shaped termbase notes."
);
assertIncludes(
  readText("storage.js"),
  "function sanitizedTmEntryRecord",
  "storage.js portable backup/export sanitization must redact credential-shaped TM origin metadata."
);
assertIncludes(
  readText("storage.js"),
  'styleGuide: redactSensitiveText(source.styleGuide || "").trim()',
  "storage.js portable backup/export sanitization must redact credential-shaped AI style instructions."
);
assertIncludes(
  termbaseJs,
  'redactSensitiveText(term?.notes || "").trim()',
  "termbase.js must redact credential-shaped termbase notes during term normalization."
);
assertIncludes(
  tmJs,
  'redactSensitiveText(entry.projectName || "").trim()',
  "tm.js must redact credential-shaped TM origin metadata during local TM saves."
);
assertIncludes(
  tmJs,
  "function tmEntryRecord",
  "tm.js direct TM saves/imports must normalize and validate required resource fields before storage."
);
assertIncludes(
  tmJs,
  "function cleanPortableLabel",
  "tm.js direct TM saves/imports must redact credential-looking resource language and TM labels before storage."
);
assertIncludes(
  tmJs,
  'const sourceLang = requiredPortableLabel(entry.sourceLang, "TM source language is required.");',
  "tm.js direct TM saves/imports must redact credential-looking source-language labels before storage."
);
assertIncludes(tmJs, "TM source text is required.", "tm.js must reject malformed TM source text before storage.");
assertIncludes(
  tmJs,
  "function languagePairFromFields",
  "tm.js must build resource lookup language pairs only from complete normalized language metadata."
);
assertIncludes(
  tmJs,
  "if (!languagePair || !normalizeText(source)) return [];",
  "tm.js direct TM lookup must fail closed when source or language-pair metadata is incomplete."
);
assertIncludes(
  termbaseJs,
  "function termRecord",
  "termbase.js direct term saves/imports must normalize and validate required resource fields before storage."
);
assertIncludes(
  termbaseJs,
  "function cleanPortableLabel",
  "termbase.js direct term saves/imports must redact credential-looking resource language and termbase labels before storage."
);
assertIncludes(
  termbaseJs,
  'const sourceLang = requiredPortableLabel(term.sourceLang, "Term source language is required.");',
  "termbase.js direct term saves/imports must redact credential-looking source-language labels before storage."
);
assertIncludes(
  termbaseJs,
  "Term source text is required.",
  "termbase.js must reject malformed term source text before storage."
);
assertIncludes(
  termbaseJs,
  "function languagePairFromFields",
  "termbase.js must build resource lookup language pairs only from complete normalized language metadata."
);
assertIncludes(
  termbaseJs,
  "if (!languagePair || !normalizeText(source)) return [];",
  "termbase.js direct term lookup must fail closed when source or language-pair metadata is incomplete."
);
assertIncludes(
  readText("cat-worker.js"),
  "function languagePairFromFields",
  "cat-worker.js TM scoring must use the same complete language-pair normalization as the main thread."
);
assertIncludes(
  tmxJs,
  'redactSensitiveText(entry.projectName || "").trim()',
  "tmx.js TMX export must redact credential-shaped origin metadata."
);
assertIncludes(
  tmxJs,
  "function tmxResourceOptions",
  "tmx.js must validate and normalize TMX import/export resource metadata before parsing or building files."
);
assertIncludes(
  tmxJs,
  'const sourceLang = requiredPortableLabel(source.sourceLang, "TMX source language is required.");',
  "tmx.js TMX import/export must redact credential-looking source-language labels."
);
assertIncludes(
  tmxJs,
  "function languageMatches",
  "tmx.js TMX import must match raw language labels without persisting credential-looking values."
);
assertIncludes(
  tmxJs,
  "TMX source language is required.",
  "tmx.js must reject missing TMX source-language metadata with a clear error."
);
assertIncludes(
  tbxJs,
  'redactSensitiveText(term.notes || "").trim()',
  "tbx.js TBX export must redact credential-shaped termbase notes."
);
assertIncludes(
  tbxJs,
  "function tbxResourceOptions",
  "tbx.js must validate and normalize TBX import/export resource metadata before parsing or building files."
);
assertIncludes(
  tbxJs,
  'const sourceLang = requiredPortableLabel(source.sourceLang, "TBX source language is required.");',
  "tbx.js TBX import/export must redact credential-looking source-language labels."
);
assertIncludes(
  tbxJs,
  "function languageMatches",
  "tbx.js TBX import must match raw language labels without persisting credential-looking values."
);
assertIncludes(
  tbxJs,
  "TBX source language is required.",
  "tbx.js must reject missing TBX source-language metadata with a clear error."
);
assertIncludes(
  tbxJs,
  '["context", "note", "definition", "explanation"].includes(descripType(node))',
  "tbx.js TBX import must preserve context-like termbase notes."
);
assertIncludes(
  tbxJs,
  "const notes = redactSensitiveText(rawNotes).trim();",
  "tbx.js TBX import must redact credential-shaped incoming termbase notes."
);
assertIncludes(
  readText("storage.js"),
  "isSourceJsonPath",
  "storage.js provider trace sanitization must preserve original JSON source reconstruction keys."
);
assertIncludes(
  readText("storage.js"),
  'segments[index - 2] !== "localizationStructures"',
  "storage.js sourceJson privacy exception must be limited to localization reconstruction paths."
);
assertIncludes(
  validationJs,
  "PROVIDER_TRACE_FIELD_PATTERN",
  "validation.js must reject AI provider trace metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "cookie|session",
  "validation.js must reject session and cookie credential fields before package import or backup restore."
);
assertIncludes(
  validationJs,
  "SENSITIVE_TEXT_VALUE_PATTERN",
  "validation.js must reject credential-shaped values in activity summaries before package import or backup restore."
);
assertIncludes(
  validationJs,
  "type must not include credential-looking text",
  "validation.js must reject credential-shaped values in activity types before package import or backup restore."
);
assertIncludes(
  validationJs,
  "report[bucket].push(redactSensitiveText(message))",
  "validation.js must redact credential-shaped values from validation report messages before UI/report/sidecar handoff."
);
assertIncludes(
  validationJs,
  "detectSensitiveProjectDomains",
  "validation.js must reject credential-shaped project domain metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitivePortableLabels",
  "validation.js must reject credential-shaped app label metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "PORTABLE_RECORD_ID_KEYS",
  "validation.js must identify portable record ID fields that need credential-shape checks."
);
assertIncludes(
  validationJs,
  "function detectSensitiveRecordIds",
  "validation.js must reject credential-looking record IDs before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveTermNotes",
  "validation.js must reject credential-shaped termbase notes before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveTmOrigins",
  "validation.js must reject credential-shaped TM origin metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveAiSuggestionMetadata",
  "validation.js must reject credential-shaped AI suggestion metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveAiStyleGuides",
  "validation.js must reject credential-shaped AI style instructions before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveAiSettingsMetadata",
  "validation.js must reject credential-shaped AI provider/model metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "detectSensitiveActivityMetadata",
  "validation.js must reject credential-shaped activity detail metadata before package import or backup restore."
);
assertIncludes(
  validationJs,
  "AI provider trace metadata",
  "validation.js must report AI provider trace metadata clearly in validation errors."
);
assertIncludes(
  validationJs,
  "isSourceJsonPath",
  "validation.js provider trace checks must preserve original JSON source reconstruction keys."
);
assertIncludes(
  validationJs,
  'segments[index - 2] !== "localizationStructures"',
  "validation.js sourceJson privacy exception must be limited to localization reconstruction paths."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer strips AI suggestion source and provider trace metadata",
  "package-roundtrip-test.html must verify portable package sanitization strips AI suggestion source and provider traces."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts AI activity summaries and provider trace metadata",
  "package-roundtrip-test.html must verify portable package sanitization redacts AI activity summaries and provider traces."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking AI suggestion explanations",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking AI suggestion explanations."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking AI suggestion metadata",
  "package-roundtrip-test.html must verify package validation rejects credential-looking AI suggestion metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking activity summaries and types",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking activity summaries and types."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking activity summaries and types",
  "package-roundtrip-test.html must verify package validation rejects credential-looking activity summaries and types."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking AI style instructions",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking AI style instructions."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking AI style instructions",
  "package-roundtrip-test.html must verify package validation rejects credential-looking AI style instructions."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking AI provider model and activity metadata",
  "package-roundtrip-test.html must verify portable package sanitization redacts AI provider/model and activity metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking AI provider model and activity metadata",
  "package-roundtrip-test.html must verify package validation rejects AI provider/model and activity metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking project domain metadata",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking project domain metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking project domain metadata",
  "package-roundtrip-test.html must verify package validation rejects credential-looking project domain metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking label metadata",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking label metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking label metadata",
  "package-roundtrip-test.html must verify package validation rejects credential-looking label metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking record IDs",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking record IDs."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer preserves record ID relationships after redaction",
  "package-roundtrip-test.html must verify portable package sanitization keeps redacted record-ID references valid."
);
assertIncludes(
  packageRoundtripTest,
  "package validation report redacts credential-looking labels in warnings",
  "package-roundtrip-test.html must verify package validation warning text redacts credential-looking labels."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer strips legacy academic metadata",
  "package-roundtrip-test.html must verify portable package sanitization strips legacy academic metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package validation ignores legacy academic metadata",
  "package-roundtrip-test.html must verify package validation tolerates legacy academic metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking termbase notes",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking termbase notes."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking termbase notes",
  "package-roundtrip-test.html must verify package validation rejects credential-looking termbase notes."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer redacts credential-looking TM origin metadata",
  "package-roundtrip-test.html must verify portable package sanitization redacts credential-looking TM origin metadata."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects credential-looking TM origin metadata",
  "package-roundtrip-test.html must verify package validation rejects credential-looking TM origin metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking AI suggestion explanations",
  "regression-test.html must verify backup export redacts credential-looking AI suggestion explanations."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking AI suggestion metadata",
  "regression-test.html must verify backup validation rejects credential-looking AI suggestion metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking TM origin metadata",
  "regression-test.html must verify backup export redacts credential-looking TM origin metadata."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking TM origin metadata",
  "regression-test.html must verify backup validation rejects credential-looking TM origin metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking label metadata",
  "regression-test.html must verify backup export redacts credential-looking label metadata."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking label metadata",
  "regression-test.html must verify backup validation rejects credential-looking label metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking record IDs",
  "regression-test.html must verify backup export redacts credential-looking record IDs."
);
assertIncludes(
  regressionTest,
  "backup export preserves record ID relationships after redaction",
  "regression-test.html must verify backup export keeps redacted record-ID references valid."
);
assertIncludes(
  regressionTest,
  "direct project package import preserves record ID relationships after redaction",
  "regression-test.html must verify direct project-package restore keeps redacted record-ID references valid."
);
assertIncludes(
  regressionTest,
  "direct backup restore preserves record ID relationships after redaction",
  "regression-test.html must verify direct backup restore keeps redacted record-ID references valid."
);
assertIncludes(
  regressionTest,
  "project package validation rejects credential-looking record IDs",
  "regression-test.html must verify package validation rejects credential-looking record IDs."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking record IDs",
  "regression-test.html must verify backup validation rejects credential-looking record IDs."
);
assertIncludes(
  workspaceStorageTest,
  "workspace package save rejects credential-looking record IDs before writing",
  "workspace-storage-test.html must verify workspace package saves reject credential-looking record IDs before touching folder files."
);
assertIncludes(
  regressionTest,
  "backup validation report redacts credential-looking labels in warnings",
  "regression-test.html must verify backup validation warning text redacts credential-looking labels."
);
assertIncludes(
  smokeTest,
  "TBX export redacts credential-looking termbase notes",
  "smoke-test.html must verify TBX handoff files redact credential-looking termbase notes."
);
assertIncludes(
  smokeTest,
  "TBX export/import preserves termbase notes",
  "smoke-test.html must verify TBX termbase notes round trip."
);
assertIncludes(
  smokeTest,
  "TBX export/import preserves redacted termbase notes",
  "smoke-test.html must verify TBX redacted notes remain redacted after import."
);
assertIncludes(
  smokeTest,
  "TBX import redacts credential-looking termbase notes",
  "smoke-test.html must verify direct TBX import redacts credential-looking notes."
);
assertIncludes(
  smokeTest,
  "CSV term list import redacts credential-looking notes",
  "smoke-test.html must verify direct CSV term-list import redacts credential-looking notes."
);
assertIncludes(
  smokeTest,
  "XLSX term list import redacts credential-looking notes",
  "smoke-test.html must verify direct XLSX term-list import redacts credential-looking notes."
);
assertIncludes(
  smokeTest,
  "TMX export redacts credential-looking origin metadata",
  "smoke-test.html must verify direct TMX exports redact credential-looking origin metadata."
);
assertIncludes(
  smokeTest,
  "TMX import redacts credential-looking origin metadata",
  "smoke-test.html must verify direct TMX imports redact credential-looking origin metadata."
);
assertIncludes(
  validationJs,
  "Activity event ${event.id || index + 1} belongs to a different project.",
  "validation.js must reject package activity events that do not belong to the package project."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects activity events from a different project",
  "package-roundtrip-test.html must verify package validation rejects foreign-project activity events."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects AI provider trace metadata before import",
  "package-roundtrip-test.html must verify provider trace-bearing packages fail validation before import."
);
assertIncludes(
  packageRoundtripTest,
  "sessionCookie",
  "package-roundtrip-test.html must verify project-package validation rejects session cookie credential fields."
);
assertIncludes(
  packageRoundtripTest,
  "package validation blocks fake sourceJson metadata outside localization structures",
  "package-roundtrip-test.html must verify fake sourceJson fields outside localization structures do not bypass package privacy validation."
);
assertIncludes(
  packageRoundtripTest,
  "package sanitizer strips fake sourceJson metadata outside localization structures",
  "package-roundtrip-test.html must verify fake sourceJson fields outside localization structures do not bypass package sanitization."
);
assertIncludes(
  appJs,
  "project report redacts AI activity summaries and provider trace metadata",
  "app workflow test must verify project reports redact AI activity summaries and provider traces."
);
assertIncludes(
  appJs,
  "project report redacts credential-looking activity summaries and types",
  "app workflow test must verify project reports redact credential-looking activity summaries and types."
);
assertIncludes(
  appJs,
  "project report redacts credential-looking project domain metadata",
  "app workflow test must verify project reports redact credential-looking project domain metadata."
);
assertIncludes(
  appJs,
  "project report redacts credential-looking project file resource and validation labels",
  "app workflow test must verify project reports redact credential-looking label and validation-note metadata."
);
assertIncludes(
  appJs,
  "project report omits academic metadata",
  "app workflow test must verify project reports omit academic metadata."
);
assertIncludes(
  appJs,
  "project report redacts credential-looking termbase notes",
  "app workflow test must verify project reports redact credential-looking termbase notes."
);
assertIncludes(
  appJs,
  "project TMX export redacts credential-looking origin metadata",
  "app workflow test must verify project TMX exports redact credential-looking origin metadata."
);
assertIncludes(
  appJs,
  "standalone TMX resource export redacts credential-looking origin metadata",
  "app workflow test must verify standalone TMX resource exports redact credential-looking origin metadata."
);
assertIncludes(
  appJs,
  "project TBX export redacts credential-looking termbase notes",
  "app workflow test must verify project TBX exports redact credential-looking termbase notes."
);
assertIncludes(
  appJs,
  "standalone TBX resource export redacts credential-looking termbase notes",
  "app workflow test must verify standalone TBX resource exports redact credential-looking termbase notes."
);
assertIncludes(
  appJs,
  "TBX resource import preserves termbase notes",
  "app workflow test must verify TBX resource imports preserve context notes."
);
assertIncludes(
  appJs,
  "TBX resource import redacts credential-looking termbase notes",
  "app workflow test must verify TBX resource imports redact credential-looking notes before local storage."
);
assertIncludes(
  regressionTest,
  "direct project package import normalizes AI suggestion source and provider trace metadata before writing",
  "regression-test.html must verify direct project-package import strips AI suggestion source and provider traces."
);
assertIncludes(
  regressionTest,
  "project package validation rejects AI provider trace metadata",
  "regression-test.html must verify package validation rejects provider trace metadata."
);
assertIncludes(
  regressionTest,
  "backup validation rejects AI provider trace metadata",
  "regression-test.html must verify backup validation rejects provider trace metadata."
);
assertIncludes(
  regressionTest,
  "backup validation blocks fake sourceJson metadata outside localization structures",
  "regression-test.html must verify fake sourceJson fields outside localization structures do not bypass backup privacy validation."
);
assertIncludes(
  regressionTest,
  "direct backup restore sanitizes secrets browser-only handles and fake sourceJson metadata before writing",
  "regression-test.html must verify direct backup restore sanitizes fake sourceJson fields outside localization structures."
);
assertIncludes(
  regressionTest,
  "JSON source reconstruction preserves provider-like secret-like and handle-like keys",
  "regression-test.html must verify provider-like, secret-like, and handle-like source JSON keys are not stripped or rejected."
);
assertIncludes(
  regressionTest,
  "JSON localization export preserves provider-like secret-like and handle-like source keys while translating prompt",
  "regression-test.html must verify JSON export preserves provider-like, secret-like, and handle-like source keys while updating translations."
);
assertIncludes(
  regressionTest,
  "CSV source reconstruction preserves provider-like secret-like and handle-like cells",
  "regression-test.html must verify delimited source reconstruction preserves provider-like, secret-like, and handle-like source cells."
);
assertIncludes(
  regressionTest,
  "backup export strips secrets session cookies and browser-only tokens",
  "regression-test.html must verify backup export strips session/cookie credentials."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking activity summaries and types",
  "regression-test.html must verify backup export redacts credential-looking activity summaries and types."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking activity summaries",
  "regression-test.html must verify backup validation rejects credential-looking activity summaries."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking activity types",
  "regression-test.html must verify backup validation rejects credential-looking activity types."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking AI style instructions",
  "regression-test.html must verify backup export redacts credential-looking AI style instructions."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking AI style instructions",
  "regression-test.html must verify backup validation rejects credential-looking AI style instructions."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking AI provider model and activity metadata",
  "regression-test.html must verify backup export redacts AI provider/model and activity metadata."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking AI provider model and activity metadata",
  "regression-test.html must verify backup validation rejects AI provider/model and activity metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking project domain metadata",
  "regression-test.html must verify backup export redacts credential-looking project domain metadata."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking project domain metadata",
  "regression-test.html must verify backup validation rejects credential-looking project domain metadata."
);
assertIncludes(
  regressionTest,
  "backup export strips legacy academic metadata",
  "regression-test.html must verify backup export strips legacy academic metadata."
);
assertIncludes(
  regressionTest,
  "backup validation ignores legacy academic metadata",
  "regression-test.html must verify backup validation tolerates legacy academic metadata."
);
assertIncludes(
  regressionTest,
  "backup export redacts credential-looking termbase notes",
  "regression-test.html must verify backup export redacts credential-looking termbase notes."
);
assertIncludes(
  regressionTest,
  "backup validation rejects credential-looking termbase notes",
  "regression-test.html must verify backup validation rejects credential-looking termbase notes."
);
assertIncludes(
  regressionTest,
  "backup export normalizes AI settings through the allowlist",
  "regression-test.html must verify backup export strips non-allowlisted AI settings metadata."
);
assertIncludes(
  regressionTest,
  "direct backup restore normalizes AI settings through the allowlist before writing",
  "regression-test.html must verify direct backup restore strips non-allowlisted AI settings metadata."
);
assertIncludes(
  appJs,
  "QA run failure reports visible status and preserves previous QA results",
  "app workflow test must verify failed QA runs report visibly and keep previous QA results."
);
assertIncludes(
  appJs,
  "QA activity log failure still renders fresh QA results",
  "app workflow test must verify QA results render even when activity logging fails."
);
assertIncludes(
  appJs,
  "TM pretranslation transaction failure restores every visible and persisted target",
  "app workflow test must verify failed TM pretranslation rolls back visible and persisted state."
);
assertIncludes(
  appJs,
  "TM pretranslation saves one redacted atomic command for every matched target",
  "app workflow test must verify successful TM pretranslation persists target text."
);
assertIncludes(
  appJs,
  "split save failure restores visible and persisted segment list",
  "app workflow test must verify failed segment split rolls back visible and persisted state."
);
assertIncludes(
  appJs,
  "segment split saves one redacted structural command with contiguous order and stable focus",
  "app workflow test must verify successful SplitSegment command recording and ordering."
);
assertIncludes(
  appJs,
  "SplitSegment Undo atomically restores the original segment, order, persistence, and focus",
  "app workflow test must verify SplitSegment Undo against visible and persisted state."
);
assertIncludes(
  appJs,
  "SplitSegment Redo recreates the stable segment, order, targets, monotonic revisions, persistence, and focus",
  "app workflow test must verify SplitSegment Redo identity, revisions, persistence, and focus."
);
assertIncludes(
  appJs,
  "MergeSegment transaction failure leaves no missing, duplicate, reordered, or partially persisted segment",
  "app workflow test must verify failed segment merge leaves visible and persisted state atomic."
);
assertIncludes(
  appJs,
  "MergeSegment persists one redacted atomic command with contiguous order, history, and focus",
  "app workflow test must verify successful MergeSegment command recording and ordering."
);
assertIncludes(
  appJs,
  "MergeSegment Undo atomically restores both stable segment IDs, order, history, persistence, and focus",
  "app workflow test must verify MergeSegment Undo against visible and persisted state."
);
assertIncludes(
  appJs,
  "MergeSegment Redo recreates the merge with monotonic revisions and deletes only the merged-away segment",
  "app workflow test must verify MergeSegment Redo identity, revisions, persistence, and focus."
);
assertIncludes(
  appJs,
  "project delete failure reports visible status without deleting stored project",
  "app workflow test must verify failed project deletes report visibly and keep stored project records."
);
assertIncludes(
  appJs,
  "file delete failure reports visible status without deleting file segments",
  "app workflow test must verify failed file deletes report visibly and keep stored file segments."
);
assertIncludes(
  appJs,
  "file delete activity log failure reports warning while preserving the file in Trash",
  "app workflow test must verify file deletion stays recoverable when optional activity logging fails."
);
assertIncludes(
  appJs,
  "schema 6 adds Trash while project packages remain schema 5",
  "app workflow test must verify the split storage/package schema contract."
);
assertIncludes(
  appJs,
  "Undo restores a trashed project and its segments",
  "app workflow test must verify project Trash recovery."
);
assertIncludes(
  appJs,
  "Undo restores a trashed file and its segments",
  "app workflow test must verify project-file Trash recovery."
);
assertIncludes(
  storageJs,
  "async function moveResourceRecordsToTrash(resourceType, trashEntry)",
  "schema-6 storage must expose one atomic resource-to-Trash boundary."
);
assertIncludes(
  storageJs,
  'db.transaction([config.entityStore, config.indexStore, "trashEntries"], "readwrite")',
  "resource deletion must remove live records and token indexes in the same Trash transaction."
);
assertIncludes(
  storageJs,
  'db.transaction([config.entityStore, "appMeta", "trashEntries"], "readwrite")',
  "resource restoration must recreate records, dirty search indexes, and consume Trash atomically."
);
assertIncludes(
  storageJs,
  "The Trash item was preserved.",
  "resource restore conflicts must explicitly preserve the Trash recovery item."
);
assertIncludes(
  trashRepositoryJs,
  "async moveResourceEntry(resourceType, entityId)",
  "TrashRepository must support individual TM and termbase entry recovery."
);
assertIncludes(
  trashRepositoryJs,
  "async moveResource(resourceType, descriptor = {})",
  "TrashRepository must support whole translation-memory and termbase recovery."
);
assertIncludes(
  trashCommandsJs,
  "createDeleteResourceEntryCommand",
  "resource entry deletion must use a reversible domain command."
);
assertIncludes(
  trashCommandsJs,
  "createDeleteResourceCommand",
  "whole-resource deletion must use a reversible domain command."
);
assert(
  !functionBody(appJs, "async function deleteTmResourceEntry", "async function deleteTermResourceEntry").includes(
    "deleteTmEntry("
  ) &&
    !functionBody(appJs, "async function deleteTermResourceEntry", "function renderTmResourceDetail").includes(
      "deleteTerm("
    ) &&
    !functionBody(appJs, "async function confirmDeleteResource", "function exportResource").includes(
      "deleteTmEntries("
    ) &&
    !functionBody(appJs, "async function confirmDeleteResource", "function exportResource").includes("deleteTerms("),
  "user-facing Resources deletion paths must not bypass persistent Trash with hard-delete services."
);
assertIncludes(
  resourceTrashUnitTests,
  "moves only the selected translation memory name and language pair",
  "focused tests must characterize whole-resource selection without cross-language deletion."
);
assertIncludes(
  resourceTrashUnitTests,
  "refresh their recovery token on Redo",
  "focused tests must characterize resource Trash Undo/Redo recovery-token replacement."
);
assertIncludes(
  appJs,
  "TM resource row Undo restores exact content, rebuildable search indexes, and removes its Trash token",
  "the app workflow must characterize exact individual TM recovery and index rebuilding."
);
assertIncludes(
  appJs,
  "term resource row Undo restores exact metadata, rebuildable search indexes, and removes its Trash token",
  "the app workflow must characterize exact individual term recovery and index rebuilding."
);
assertIncludes(
  appJs,
  "TM whole resource restore conflict preserves both the Trash item and live resource",
  "the app workflow must characterize conflict-safe whole-resource restoration."
);
assertIncludes(
  appJs,
  "resource Trash transaction conflict rolls back every live record and preserves the existing Trash item",
  "the app workflow must force a real IndexedDB resource-Trash transaction abort and verify rollback."
);
assertIncludes(
  appJs,
  "schema-6 backup preserves resource Trash while project-package schema remains independent",
  "the app workflow must characterize resource Trash backup compatibility without changing project packages."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("03", "resource-trash-populated")',
  "visual checkpoints must include populated resource Trash at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("03", "resource-trash-empty-after-restore")',
  "visual checkpoints must include the actionable empty Trash state after resource restoration."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("05", "review-comments-inspector")',
  "visual checkpoints must include the populated Comments inspector at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("05", "quality-workbench-inspector")',
  "visual checkpoints must include the populated Quality Workbench at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("01", "workspace-recovery-local")',
  "visual checkpoints must include the local workspace recovery state at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("01", "workspace-local-status-menu")',
  "visual checkpoints must include the local workspace status menu at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("05", "editor-import-validation-error")',
  "visual checkpoints must include an actionable import-validation error at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  'captureState("05", "ai-provider-administration")',
  "visual checkpoints must include AI provider administration at all required viewports."
);
assertIncludes(
  baselineCaptureScript,
  "const expectedScreenshotCount = 81;",
  "the deterministic visual checkpoint count must include validation, quality, review, recovery/workspace, and AI administration states."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("Review comments populated")',
  "automated accessibility checks must cover the populated Comments inspector."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("Quality Workbench populated")',
  "automated accessibility checks must cover the populated Quality Workbench."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("Workspace recovery visible")',
  "automated accessibility checks must cover the actionable local recovery state."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("Workspace local status menu")',
  "automated accessibility checks must cover local workspace status and storage warnings."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("Import validation error")',
  "automated accessibility checks must cover import-validation semantics and focus recovery."
);
assertIncludes(
  accessibilityVerificationScript,
  'audit("AI provider administration and command centre")',
  "automated accessibility checks must cover AI provider administration and its dialog focus lifecycle."
);
assertIncludes(
  appJs,
  "workspace folder connection marks local projects missing from the folder dirty",
  "app workflow test must verify connecting a folder marks local browser-cache projects missing from that folder as needing package saves."
);
assertIncludes(
  appJs,
  "workspace folder connection keeps local projects clean when the folder already has their package",
  "app workflow test must verify connecting a folder does not block sync for local projects already present in the workspace manifest."
);
assertIncludes(
  appJs,
  "await flushPendingSegmentSaves(projectId)",
  "app.js must flush queued active segment saves before writing workspace project packages."
);
assertIncludes(
  appJs,
  "background workspace autosave flushes pending active segment edits before saving package",
  "app workflow test must verify background workspace autosave writes queued target edits before clearing dirty markers."
);
assertIncludes(
  appJs,
  "workspace package save activity log failure still writes package and reports warning",
  "app workflow test must verify workspace package saves are not blocked by optional activity logging."
);
assertIncludes(
  appJs,
  "failed workspace package save keeps project dirty without recording successful workspace-save activity",
  "app workflow test must verify failed workspace package writes cannot clear retry markers or create misleading save-history activity."
);
assertIncludes(
  appJs,
  "workspace backup export reports validation failure before writing folder backup",
  "app workflow test must verify workspace backup validation failures are visible and do not write folder backups."
);
assertIncludes(
  appJs,
  "project package export flushes pending segment edits",
  "app workflow test must verify project package exports include queued target edits."
);
assertIncludes(
  appJs,
  "project package export preserves pending segment revision history",
  "app workflow test must verify project package exports include queued edit revision history."
);
assertIncludes(
  readText("storage.js"),
  "deleteProjectRecords(projectId)",
  "storage.js must keep project deletion in one local database transaction."
);
assertIncludes(
  readText("storage.js"),
  "updateProjectAndDeleteDocumentSegments(project, documentId)",
  "storage.js must update file metadata and delete file segments in one local database transaction."
);
assertIncludes(
  readText("storage.js"),
  "updateProjectAndPutSegments(project, segments = [])",
  "storage.js must update project metadata and imported segments in one local database transaction."
);
assertIncludes(
  readText("project.js"),
  "appendProjectSegmentsAndUpdateProject(project, sourceSegments, options = {})",
  "project.js must expose an atomic document import helper."
);
assertIncludes(
  readText("storage.js"),
  "assertPackageRecordsBelongToProject(importedProject, importedSegments, importedActivityEvents)",
  "storage.js direct project-package import must reject records that belong to another project after sanitizing and before writing."
);
assertIncludes(
  regressionTest,
  "direct project package import rejects segments from a different project before writing",
  "regression-test.html must verify direct package import rejects foreign-project segments without writing them."
);
assertIncludes(
  regressionTest,
  "direct project package import rejects activity events from a different project before writing",
  "regression-test.html must verify direct package import rejects foreign-project activity events without writing them."
);
assertIncludes(
  validationJs,
  "Duplicate document ID in project manifest",
  "validation.js must reject duplicate project package document manifest IDs."
);
assertIncludes(
  validationJs,
  "manifest entry must be an object",
  "validation.js must report malformed document manifest entries without crashing."
);
assertIncludes(
  validationJs,
  "function validateProjectResourceLinks",
  "validation.js must validate project resource-link manifests before portable handoff."
);
assertIncludes(
  readText("project.js"),
  "function cleanResourceLinks",
  "project.js must normalize malformed legacy project resource links before saving updates."
);
assertIncludes(
  readText("project.js"),
  "function cleanDocumentManifest",
  "project.js must normalize malformed legacy project document manifests before saving updates."
);
assertIncludes(
  readText("project.js"),
  "function projectUpdateDocuments",
  "project.js must preserve existing project document manifests during stale settings-style updates."
);
assertIncludes(
  functionBody(
    readText("project.js"),
    "async function appendProjectSegmentsAndUpdateProject",
    "async function saveSegments"
  ),
  "projectUpdateRecord(project, { existingProject })",
  "project.js atomic document import helper must preserve existing document manifests when called with stale project metadata."
);
assertIncludes(
  readText("project.js"),
  "function projectIdentityFields",
  "project.js must validate required project identity fields while allowing safe legacy read fallbacks."
);
assertIncludes(
  readText("project.js"),
  "Project name is required.",
  "project.js must reject missing project names before saving new or updated projects."
);
assertIncludes(
  readText("storage.js"),
  "function normalizeProjectResourceLinks",
  "storage.js must normalize malformed legacy project resource links during local migrations."
);
assertIncludes(
  readText("storage.js"),
  "function normalizeProjectDocuments",
  "storage.js must normalize malformed legacy project document manifests during local migrations."
);
assertIncludes(
  appJs,
  "function cleanProjectResourceLinks",
  "app.js must clean malformed legacy resource links before UI summaries or package builds."
);
assertIncludes(
  appJs,
  "function projectDocumentManifest",
  "app.js must clean malformed legacy document manifests before UI views or package builds."
);
assertIncludes(
  validationJs,
  "Duplicate resource link ID in project manifest",
  "validation.js must reject duplicate project resource-link IDs."
);
assertIncludes(
  validationJs,
  "Duplicate resource link in project manifest",
  "validation.js must reject duplicate project resource-link type/name pairs."
);
assertIncludes(validationJs, "unknown resource type", "validation.js must reject unknown project resource-link types.");
assertIncludes(
  regressionTest,
  "project update normalizes malformed legacy resource links without crashing",
  "regression-test.html must verify local project updates repair malformed legacy resource links."
);
assertIncludes(
  regressionTest,
  "project update normalizes malformed legacy document manifests without crashing",
  "regression-test.html must verify local project updates repair malformed legacy document manifests."
);
assertIncludes(
  regressionTest,
  "project creation rejects missing required identity fields",
  "regression-test.html must verify direct project creation rejects missing required identity fields."
);
assertIncludes(
  regressionTest,
  "project update rejects missing required identity fields",
  "regression-test.html must verify direct project updates reject missing required identity fields."
);
assertIncludes(
  regressionTest,
  "project listing falls back for malformed legacy identity fields",
  "regression-test.html must verify malformed legacy project identity fields do not crash project listing."
);
assertIncludes(
  regressionTest,
  "direct TM save normalizes required resource fields",
  "regression-test.html must verify direct TM saves normalize resource fields before storage."
);
assertIncludes(
  regressionTest,
  "direct TM save redacts credential-looking resource language metadata",
  "regression-test.html must verify direct TM saves redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct TM import rejects malformed required fields",
  "regression-test.html must verify direct TM imports reject malformed resource records before storage."
);
assertIncludes(
  regressionTest,
  "direct TM lookup fails closed for incomplete resource metadata",
  "regression-test.html must verify direct TM lookups fail closed when resource metadata is incomplete."
);
assertIncludes(
  regressionTest,
  "direct termbase save normalizes required resource fields",
  "regression-test.html must verify direct term saves normalize resource fields before storage."
);
assertIncludes(
  regressionTest,
  "direct termbase save redacts credential-looking resource language metadata",
  "regression-test.html must verify direct term saves redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct termbase import rejects malformed required fields",
  "regression-test.html must verify direct term imports reject malformed resource records before storage."
);
assertIncludes(
  regressionTest,
  "direct termbase lookup fails closed for incomplete resource metadata",
  "regression-test.html must verify direct term lookups fail closed when resource metadata is incomplete."
);
assertIncludes(
  regressionTest,
  "direct TMX parse normalizes required resource metadata",
  "regression-test.html must verify direct TMX parsing normalizes required metadata."
);
assertIncludes(
  regressionTest,
  "direct TMX export redacts credential-looking resource language metadata",
  "regression-test.html must verify direct TMX exports redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct TMX import redacts credential-looking resource language metadata",
  "regression-test.html must verify direct TMX imports redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct TMX export rejects missing resource metadata",
  "regression-test.html must verify direct TMX export rejects incomplete metadata."
);
assertIncludes(
  regressionTest,
  "direct TBX parse normalizes required resource metadata",
  "regression-test.html must verify direct TBX parsing normalizes required metadata."
);
assertIncludes(
  regressionTest,
  "direct TBX export redacts credential-looking resource language metadata",
  "regression-test.html must verify direct TBX exports redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct TBX import redacts credential-looking resource language metadata",
  "regression-test.html must verify direct TBX imports redact credential-looking resource language metadata."
);
assertIncludes(
  regressionTest,
  "direct TBX export rejects missing resource metadata",
  "regression-test.html must verify direct TBX export rejects incomplete metadata."
);
assertIncludes(
  appJs,
  "local project resource summaries tolerate malformed legacy links",
  "app workflow test must verify project resource summaries tolerate malformed legacy links."
);
assertIncludes(
  appJs,
  "resource keys preserve names containing double-colon delimiters",
  "app workflow test must verify resource names can contain the key delimiter without corrupting language metadata."
);
assertIncludes(
  appJs,
  "project settings dialog tolerates malformed legacy resource links",
  "app workflow test must verify project settings tolerate malformed legacy resource links."
);
assertIncludes(
  appJs,
  "local project document manifests tolerate malformed legacy entries",
  "app workflow test must verify project document manifests tolerate malformed legacy entries."
);
assertIncludes(
  indexHtml,
  `id="frequentLanguagePairs"`,
  "index.html project dialog must expose frequent language-pair shortcuts."
);
assertIncludes(
  indexHtml,
  `datalist id="languageOptions"`,
  "index.html must expose shared language dropdown options for project and resource language fields."
);
assertIncludes(
  appJs,
  "LOOPCAT_LANGUAGE_CATALOG_ENTRIES",
  "app.js must bundle supported language/locales for offline dropdown use."
);
assertIncludes(appJs, "Acehnese (ace-ID)", "app.js language catalog must include locale ace-ID.");
assertIncludes(appJs, "Catalan (Valencia) (cav-ES)", "app.js language catalog must include locale cav-ES.");
assertIncludes(appJs, "Spanish (Latin America) (es-419)", "app.js language catalog must include locale es-419.");
assertIncludes(appJs, "Urdu (Latin script) (ur-Latn-PK)", "app.js language catalog must include locale ur-Latn-PK.");
assertIncludes(
  appJs,
  "function normalizeLanguageInputValue",
  "app.js must normalize friendly language labels back to stored resource/project codes."
);
assertIncludes(
  appJs,
  "function renderFrequentLanguagePairs",
  "app.js must render recent and common project language-pair shortcuts."
);
assertIncludes(
  appJs,
  "language pair dropdowns expose bundled locale labels while normalizing to codes",
  "app workflow test must verify bundled language dropdown labels normalize back to codes."
);
assertIncludes(
  appJs,
  "frequent language pair chips update project language fields as normalized codes",
  "app workflow test must verify frequent language-pair shortcuts update project codes."
);
assertIncludes(
  appJs,
  "local AI language dropdowns keep language names and codes synchronized for prompts",
  "app workflow test must verify AI language labels and codes remain synchronized."
);
assertIncludes(
  appJs,
  "linked TM resource import normalizes friendly language labels before memory lookup",
  "app workflow test must verify TM resource imports normalize dropdown language labels before lookup."
);
assertIncludes(
  appJs,
  "linked TB resource imports normalize friendly language labels before terminology lookup",
  "app workflow test must verify termbase imports normalize dropdown language labels before lookup."
);
assertIncludes(
  appJs,
  "project dialog blocks missing required fields before creation",
  "app workflow test must verify project creation does not proceed with missing required dialog fields."
);
assertIncludes(
  appJs,
  "project file views tolerate malformed legacy document manifests",
  "app workflow test must verify project file views tolerate malformed legacy document manifests."
);
assertIncludes(
  readme,
  "Normalize malformed legacy local project resource links",
  "README.md must document legacy local resource-link normalization."
);
assertIncludes(
  readme,
  "bundled offline language/locales",
  "README.md must document bundled language dropdown coverage."
);
assertIncludes(
  roadmap,
  "bundled offline language/locales",
  "ROADMAP.md must track bundled language dropdown coverage."
);
assertIncludes(
  regressionTest,
  "project package validation rejects duplicate document manifest IDs",
  "regression-test.html must verify duplicate document manifest IDs are rejected."
);
assertIncludes(
  regressionTest,
  "project package validation rejects malformed document manifest entries without crashing",
  "regression-test.html must verify malformed document manifest entries report validation errors."
);
assertIncludes(
  regressionTest,
  "project package validation rejects malformed resource link entries without crashing",
  "regression-test.html must verify malformed project package resource links report validation errors."
);
assertIncludes(
  regressionTest,
  "project package validation rejects unknown resource link types",
  "regression-test.html must verify unknown project package resource-link types are rejected."
);
assertIncludes(
  regressionTest,
  "project package validation rejects duplicate resource link IDs and names",
  "regression-test.html must verify duplicate project package resource links are rejected."
);
assertIncludes(
  validationJs,
  "not listed in the project manifest",
  "validation.js must reject modern project packages whose segments point to missing document manifest entries."
);
assertIncludes(
  regressionTest,
  "project package validation rejects segment document IDs missing from the manifest",
  "regression-test.html must verify modern packages reject segment document IDs missing from the manifest."
);
assertIncludes(
  regressionTest,
  "legacy project package validation warns about segment document IDs missing from the manifest",
  "regression-test.html must verify legacy packages warn instead of hard-failing orphan document IDs."
);
assertIncludes(
  appJs,
  "buildProjectPackage(state.project, packageSourceSegments)",
  "app workflow package-copy fixture must build from current project metadata so segment document IDs match the exported manifest."
);
assertIncludes(
  readText("storage.js"),
  "assertSegmentsBelongToRestoredProjects(segments, projects)",
  "storage.js direct backup restore must reject orphaned segments before replacing local data."
);
assertIncludes(
  readText("storage.js"),
  'assertSegmentsBelongToProjectDocuments(segments, projects, "backup")',
  "storage.js direct backup restore must reject segment document IDs missing from restored project manifests before replacing local data."
);
assertIncludes(
  readText("project.js"),
  "projectWithDocument(project, documentInfo)",
  "project.js segment append helper must keep project document manifests current for future backups."
);
assertIncludes(
  regressionTest,
  "segment import records project document manifest metadata",
  "regression-test.html must verify direct segment imports record project document manifest metadata."
);
assertIncludes(
  regressionTest,
  "project update preserves existing document manifest when stale settings data omits imported files",
  "regression-test.html must verify stale project settings updates do not drop imported file manifests."
);
assertIncludes(
  validationJs,
  "Segment ${segment.id || index + 1} belongs to a project not present in the backup.",
  "validation.js must reject backup segments without restored projects."
);
assertIncludes(
  validationJs,
  "not listed in the restored project manifest",
  "validation.js must reject backup segment document IDs that are missing from restored project manifests."
);
assertIncludes(
  regressionTest,
  "backup validation rejects duplicate project document manifest IDs",
  "regression-test.html must verify backups reject duplicate project document manifest IDs."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects duplicate project document manifest IDs before writing",
  "regression-test.html must verify direct backup restore rejects duplicate project document manifest IDs."
);
assertIncludes(
  regressionTest,
  "backup validation rejects malformed project document manifest entries",
  "regression-test.html must verify backups reject malformed project document manifest entries."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects malformed project document manifest entries before writing",
  "regression-test.html must verify direct backup restore rejects malformed project document manifest entries."
);
assertIncludes(
  readText("storage.js"),
  'assertProjectResourceLinks(projects, "backup")',
  "storage.js direct backup restore must reject malformed or duplicate backup project resource links before replacing local data."
);
assertIncludes(
  regressionTest,
  "backup validation rejects malformed project resource link entries",
  "regression-test.html must verify backups reject malformed project resource-link entries."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects malformed project resource link entries before writing",
  "regression-test.html must verify direct backup restore rejects malformed project resource-link entries."
);
assertIncludes(
  regressionTest,
  "backup validation rejects duplicate project resource link IDs and names",
  "regression-test.html must verify backups reject duplicate project resource links."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects duplicate project resource links before writing",
  "regression-test.html must verify direct backup restore rejects duplicate project resource links before replacing local data."
);
assertIncludes(
  regressionTest,
  "backup validation rejects unknown project resource link types",
  "regression-test.html must verify backups reject unknown project resource-link types."
);
assertIncludes(
  regressionTest,
  "backup validation rejects segment document IDs missing from the restored project manifest",
  "regression-test.html must verify backup validation rejects segment document IDs missing from restored project manifests."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects segment document IDs missing from the restored project manifest before writing",
  "regression-test.html must verify direct backup restore rejects segment document IDs missing from restored project manifests."
);
assertIncludes(
  regressionTest,
  "backup validation rejects segments from projects not present in the backup",
  "regression-test.html must verify backup validation rejects orphaned segments."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects orphaned segments before replacing local data",
  "regression-test.html must verify direct backup restore rejects orphaned segments without replacing local data."
);
assertIncludes(
  readText("storage.js"),
  "assertActivityEventsBelongToRestoredProjects(activityEvents, projects)",
  "storage.js direct backup restore must reject orphaned activity events before replacing local data."
);
assertIncludes(
  validationJs,
  "Activity event ${event.id || index + 1} belongs to a project not present in the backup.",
  "validation.js must reject backup activity events without restored projects."
);
assertIncludes(
  regressionTest,
  "backup validation rejects activity events from projects not present in the backup",
  "regression-test.html must verify backup validation rejects orphaned activity events."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects orphaned activity events before replacing local data",
  "regression-test.html must verify direct backup restore rejects orphaned activity events without replacing local data."
);
assertIncludes(
  validationJs,
  "detectInvalidAiKeyModes",
  "validation.js must reject abused AI key-mode metadata before portable import/restore."
);
assertIncludes(
  validationJs,
  'typeof item === "function"',
  "validation.js must reject runtime function values before portable import/restore."
);
assertIncludes(
  validationJs,
  'typeof item === "symbol"',
  "validation.js must reject runtime symbol values before portable import/restore."
);
assertIncludes(
  packageRoundtripTest,
  "package validation blocks runtime functions and symbols anywhere in package",
  "package-roundtrip-test.html must verify project-package validation rejects runtime functions and symbols."
);
assertIncludes(
  regressionTest,
  "backup validation blocks runtime functions and symbols anywhere in backup",
  "regression-test.html must verify backup validation rejects runtime functions and symbols."
);
assertIncludes(
  regressionTest,
  "backup validation rejects secret-shaped AI key mode metadata",
  "regression-test.html must verify abused AI key-mode metadata is rejected before backup restore."
);
assertIncludes(
  readText("storage.js"),
  "deleteStoresWhereAtomically(predicatesByStore)",
  "storage.js must expose an atomic multi-store delete helper for resource cleanup."
);
assertIncludes(
  readText("storage.js"),
  "Backup schema version",
  "storage.js direct backup restore must reject newer unsupported backup schemas before replacing local data."
);
assertIncludes(
  packageRoundtripTest,
  "package validation rejects future schema versions",
  "package-roundtrip-test.html must verify package validation rejects unsupported future schemas."
);
assertIncludes(
  regressionTest,
  "backup validation rejects future schema versions",
  "regression-test.html must verify backup validation rejects unsupported future schemas."
);
assertIncludes(
  regressionTest,
  "direct backup restore rejects future schema versions before writing",
  "regression-test.html must verify direct backup restore rejects unsupported future schemas before replacing local data."
);
assertIncludes(
  functionBody(readText("storage.js"), "async function importAllData", "window.CatHan ="),
  "appMeta:",
  "storage.js direct backup restore must replace TM index metadata in the same atomic restore transaction."
);
assert(
  !functionBody(readText("storage.js"), "async function importAllData", "window.CatHan =").includes(
    'await deleteWhere("appMeta"'
  ),
  "storage.js direct backup restore must not mutate TM index metadata after the main restore transaction."
);
assertIncludes(
  functionBody(readText("storage.js"), "async function importAllData", "window.CatHan ="),
  'projectDocumentIdMap(projects, "backup")',
  "storage.js direct backup restore must reject duplicate or malformed backup project document manifests before replacing local data."
);
assertIncludes(
  regressionTest,
  "direct backup restore preserves non-index app metadata during atomic restore",
  "regression-test.html must verify atomic backup restore preserves non-index app metadata."
);
assertIncludes(
  regressionTest,
  "full backup restore removes stale TM index metadata atomically",
  "regression-test.html must verify atomic backup restore removes stale TM index metadata."
);
assertIncludes(
  readText("tm.js"),
  "deleteTmEntries(ids)",
  "tm.js must support bulk TM entry deletion without record-by-record UI loops."
);
assertIncludes(
  readText("termbase.js"),
  "deleteTerms(ids)",
  "termbase.js must support bulk term deletion without record-by-record UI loops."
);
assertIncludes(
  validationJs,
  "function planDeliveryExport",
  "validation.js must provide shared format-aware delivery export planning."
);
assertIncludes(
  validationJs,
  'return "source-fallback"',
  "validation.js must classify monolingual delivery exports for source fallback."
);
assertIncludes(
  validationJs,
  'return "preserve-empty"',
  "validation.js must preserve meaningful empty targets in bilingual interchange formats."
);
assertIncludes(
  validationJs,
  "finalized.canExport",
  "validation.js must expose a machine-readable delivery export decision."
);
assertIncludes(
  appJs,
  "delivery export gate permits empty target source fallback",
  "app workflow tests must verify final delivery exports permit source fallback for untranslated segments."
);
assertIncludes(
  appJs,
  "function confirmIncompleteExport",
  "app.js must require confirmation before incomplete delivery exports."
);
assertIncludes(
  appJs,
  "Export cancelled; no file was created.",
  "app.js must report cancelled incomplete exports without claiming success."
);
assertIncludes(
  validationJs,
  "original localization structure metadata is missing",
  "validation.js must block final localization delivery when original structure metadata is missing."
);
assert(
  !validationJs.includes("Export can continue, but original localization structure metadata is incomplete."),
  "validation.js must not allow simplified final localization delivery when reconstruction metadata is missing."
);
assertIncludes(
  regressionTest,
  "delivery export validation blocks missing localization reconstruction metadata",
  "regression-test.html must verify final localization delivery blocks missing reconstruction metadata."
);
assertIncludes(
  validationJs,
  "decodeHtmlAttributeEntities",
  "validation.js must decode HTML character references before unsafe HTML attribute checks."
);
assertIncludes(
  validationJs,
  "decodeCssEscapes",
  "validation.js must decode CSS escapes before unsafe style attribute checks."
);
assertIncludes(
  regressionTest,
  "export validation rejects entity-obfuscated javascript URLs in HTML",
  "regression-test.html must verify encoded javascript URLs are blocked before HTML delivery export."
);
assertIncludes(
  regressionTest,
  "export validation rejects entity-obfuscated active data URLs in HTML",
  "regression-test.html must verify encoded active data URLs are blocked before HTML delivery export."
);
assertIncludes(
  regressionTest,
  "export validation rejects entity-obfuscated scriptable style attributes",
  "regression-test.html must verify encoded scriptable style attributes are blocked before HTML delivery export."
);
assertIncludes(
  regressionTest,
  "export validation rejects CSS-escaped scriptable style attributes",
  "regression-test.html must verify CSS-escaped scriptable style attributes are blocked before HTML delivery export."
);
assertIncludes(
  localizationJs,
  "function targetText(segment)",
  "localization.js must centralize final-delivery target text handling."
);
assertIncludes(
  localizationJs,
  "function assertLocalizationReconstruction(format, segments, structure)",
  "localization.js must centralize final-delivery reconstruction checks."
);
assertIncludes(
  localizationJs,
  "function normalizedLocalizationFormat",
  "localization.js public builder must normalize and validate direct export format labels."
);
assertIncludes(
  localizationJs,
  "function localizationSegmentArray",
  "localization.js public builder must reject malformed direct segment lists before dispatching to format builders."
);
assertIncludes(
  functionBody(
    localizationJs,
    "function buildLocalizationFile(format, segments, structure = null)",
    "window.CatHan.localization"
  ),
  "assertLocalizationReconstruction(normalizedFormat, segmentList, structure);",
  "localization.js public builder must reject missing reconstruction data before dispatching to format builders."
);
assertIncludes(
  regressionTest,
  "localization export normalizes direct format labels before dispatch",
  "regression-test.html must verify direct localization export normalizes format labels."
);
assertIncludes(
  regressionTest,
  "localization export rejects malformed direct segment lists",
  "regression-test.html must verify direct localization export rejects malformed segment lists."
);
assertIncludes(
  validationJs,
  'return typeof value === "number" && Number.isFinite(value);',
  "validation.js must require real numeric reconstruction indexes instead of accepting numeric-looking strings."
);
assertIncludes(
  regressionTest,
  "export validation rejects string reconstruction indexes before builder failure",
  "regression-test.html must verify malformed reconstruction indexes are blocked by export validation."
);
assertIncludes(
  regressionTest,
  "project package validation warns about string reconstruction indexes",
  "regression-test.html must verify malformed package reconstruction indexes are reported before handoff."
);
assertIncludes(
  regressionTest,
  "format-aware localization export falls back only in monolingual delivery formats",
  "regression-test.html must verify format-aware localization source fallback."
);
assertIncludes(
  regressionTest,
  "monolingual CSV export retains source text without mutating the target",
  "regression-test.html must verify structure-aware CSV source fallback."
);
assertIncludes(
  regressionTest,
  "Qt TS export preserves empty translations and marks them unfinished",
  "regression-test.html must verify Qt TS empty-target semantics."
);
assertIncludes(
  regressionTest,
  "bilingual XML export preserves an empty target",
  "regression-test.html must verify bilingual XML empty-target semantics."
);
assertIncludes(
  regressionTest,
  "target export rejects missing reconstruction data",
  "regression-test.html must verify localization builders reject missing reconstruction data."
);
assertIncludes(
  localizationJs,
  "function replaceIdmlParagraphStyleRanges",
  "localization.js must rebuild IDML paragraph character-style ranges from semantic inline tags."
);
assertIncludes(
  regressionTest,
  "IDML localization export preserves real character style ranges for semantic inline tags",
  "regression-test.html must verify IDML semantic inline tags rebuild real character-style ranges."
);
assertIncludes(
  localizationJs,
  "function safeArchiveEntryName",
  "localization.js must validate ZIP-backed localization archive entry paths before import/export."
);
assertIncludes(
  localizationJs,
  "function assertPackageRange",
  "localization.js must validate ZIP-backed localization archive ranges before reading."
);
assertIncludes(
  localizationJs,
  "unsafe archive entry path",
  "localization.js must reject unsafe ZIP-backed localization archive entry paths."
);
assertIncludes(
  localizationJs,
  "compressed data for ${name}",
  "localization.js must validate ZIP-backed compressed data ranges before slicing."
);
assertIncludes(
  localizationJs,
  "centralDirectoryEnd",
  "localization.js must require ZIP-backed central directory entries to consume the advertised central directory exactly."
);
assertIncludes(
  localizationJs,
  "local header name mismatch",
  "localization.js must reject ZIP-backed entries whose central and local header names disagree."
);
assertIncludes(
  localizationJs,
  "expectedCrc",
  "localization.js must read ZIP-backed localization entry CRC values before preserving packages."
);
assertIncludes(
  localizationJs,
  "failed CRC integrity validation",
  "localization.js must reject ZIP-backed localization entries whose data fails CRC integrity validation."
);
assertIncludes(
  regressionTest,
  "IDML import rejects unsafe archive entry paths",
  "regression-test.html must verify IDML imports reject unsafe archive entry paths."
);
assertIncludes(
  regressionTest,
  "IDML import rejects duplicate normalized archive entry paths",
  "regression-test.html must verify IDML imports reject duplicate normalized archive entry paths."
);
assertIncludes(
  regressionTest,
  "IDML import rejects malformed archive central directory ranges",
  "regression-test.html must verify IDML imports reject malformed ZIP central directory ranges."
);
assertIncludes(
  regressionTest,
  "IDML import rejects trailing central directory data after listed entries",
  "regression-test.html must verify IDML imports reject hidden trailing central directory data."
);
assertIncludes(
  regressionTest,
  "IDML import rejects malformed archive local header ranges",
  "regression-test.html must verify IDML imports reject malformed ZIP local header ranges."
);
assertIncludes(
  regressionTest,
  "IDML import rejects local header name mismatches",
  "regression-test.html must verify IDML imports reject ZIP local header name mismatches."
);
assertIncludes(
  regressionTest,
  "IDML import rejects archive entries with invalid CRC integrity",
  "regression-test.html must verify IDML imports reject corrupt ZIP entry data."
);
assertIncludes(
  xliffJs,
  'throw new Error("XLIFF reconstruction source data is missing.")',
  "xliff.js target reconstruction must fail when original XLIFF source data is missing."
);
assert(
  !xliffJs.includes("if (!structure?.source) return buildXliff(project, segments);"),
  "xliff.js target reconstruction must not fall back to generic XLIFF export when source structure is missing."
);
assertIncludes(
  xliffJs,
  "function xliffProjectMetadata",
  "xliff.js generic export must validate and normalize project metadata before building XLIFF."
);
assertIncludes(
  xliffJs,
  "XLIFF source language is required.",
  "xliff.js generic export must reject missing source-language metadata with a clear error."
);
assertIncludes(
  xliffJs,
  "function xliffSegmentRecord",
  "xliff.js generic export must validate segment source text before building XLIFF units."
);
assertIncludes(
  xliffJs,
  "urn:oasis:names:tc:xliff:document:2.2",
  "xliff.js must recognize the OASIS XLIFF 2.2 Core namespace."
);
assertIncludes(
  xliffJs,
  "function validateXliff2Document",
  "xliff.js must validate XLIFF 2.x structure before import and after reconstruction."
);
assertIncludes(xliffJs, "function buildXliff22", "xliff.js must provide generic XLIFF 2.2 handoff export.");
assertIncludes(
  xliffJs,
  "function appendXliff2InlineContent",
  "xliff.js must reconstruct XLIFF 2.x target inline codes from preserved templates."
);
assertIncludes(xliffJs, "application/xliff+xml", "xliff.js must expose the registered MIME type for XLIFF 2.x.");
assertIncludes(
  indexHtml,
  'id="exportXliff22Btn"',
  "index.html must expose a dedicated XLIFF 2.2 handoff export action."
);
assertIncludes(
  smokeTest,
  "XLIFF 2.2 target export reconstructs Core structure and preserves extensions",
  "smoke-test.html must verify XLIFF 2.2 target reconstruction and extension preservation."
);
assertIncludes(
  smokeTest,
  "Generic XLIFF 2.2 handoff export uses Core 2.2 inline codes and round-trips",
  "smoke-test.html must verify generic XLIFF 2.2 handoff round-trips."
);
assertIncludes(
  regressionTest,
  "XLIFF 2.2 validation rejects",
  "regression-test.html must exercise malformed XLIFF 2.2 rejection."
);
assertIncludes(
  regressionTest,
  "direct XLIFF export normalizes required project metadata",
  "regression-test.html must verify direct XLIFF export normalizes project metadata."
);
assertIncludes(
  regressionTest,
  "direct XLIFF export rejects missing project metadata",
  "regression-test.html must verify direct XLIFF export rejects incomplete project metadata."
);
assertIncludes(
  regressionTest,
  "direct XLIFF export rejects malformed segment metadata",
  "regression-test.html must verify direct XLIFF export rejects malformed segment metadata."
);
assertIncludes(
  regressionTest,
  "XLIFF 1.2 export emits an explicit empty target with new state",
  "regression-test.html must verify XLIFF 1.2 empty-target export."
);
assertIncludes(
  regressionTest,
  "XLIFF 2.2 export emits an explicit empty target with initial state",
  "regression-test.html must verify XLIFF 2.2 empty-target export."
);
assertIncludes(
  smokeTest,
  "XLIFF target export rejects missing reconstruction source data",
  "smoke-test.html must verify XLIFF target reconstruction rejects missing source data."
);
assertIncludes(
  appJs,
  "sourceFallbackCount",
  "app.js must report source fallbacks for incomplete monolingual delivery exports."
);
assertIncludes(
  appJs,
  "preservedEmptyTargetCount",
  "app.js must report preserved empty targets for incomplete interchange exports."
);
assertIncludes(appJs, "draftTargetCount", "app.js must report non-empty unconfirmed targets without replacing them.");
assertIncludes(
  docxJs,
  "function targetFor(segment, fallbackToSource = false)",
  "docx.js must default final DOCX reconstruction to target-only text."
);
assertIncludes(
  functionBody(
    docxJs,
    "function targetFor(segment, fallbackToSource = false)",
    "async function extractDocxSegments(file)"
  ),
  "return target.trim() ? target",
  "docx.js must preserve exact non-empty target text, including leading/trailing Word controls, during DOCX reconstruction."
);
assertIncludes(
  docxJs,
  "WORD_VISIBLE_TEXT_CONTROL_NAMES",
  "docx.js must treat Word tabs, line breaks, and hyphen controls as visible translatable text controls."
);
assertIncludes(
  docxJs,
  "ACADEMIC_SENTENCE_ABBREVIATIONS",
  "docx.js must protect common academic abbreviations while segmenting DOCX paragraphs."
);
assertIncludes(
  docxJs,
  "function commonTextWrapper(paragraph)",
  "docx.js must preserve supported paragraph text wrappers during styled target reconstruction."
);
assertIncludes(
  docxJs,
  'SUPPORTED_TEXT_WRAPPERS = new Set(["hyperlink", "fldSimple", "sdt", "customXml", "smartTag"])',
  "docx.js must explicitly preserve DOCX hyperlink, simple-field, content-control, custom XML, and SmartTag wrappers while rebuilding styled paragraph text."
);
assertIncludes(
  docxJs,
  'if (first.localName === "sdt") return directChildByName(first, "sdtContent")',
  "docx.js must rebuild content-control text inside w:sdtContent while preserving w:sdtPr metadata."
);
assertIncludes(
  docxJs,
  "wrapInlineTagsWithStyleId",
  "docx.js must expose semantic inline tags for complex Word run properties without losing exact reconstruction metadata."
);
assertIncludes(
  docxJs,
  "SEMANTIC_INLINE_TAGS.has(type) && id && formats.has(id)",
  "docx.js target reconstruction must preserve exact run properties when semantic inline tags carry style ids."
);
assert(
  !docxJs.includes("targetFor(segment, true)"),
  "docx.js must receive transient planned targets instead of mutating or independently resolving segment state."
);
assertIncludes(
  regressionTest,
  "DOCX target export uses source fallback without mutating empty target segments",
  "regression-test.html must verify planned DOCX source fallback is immutable."
);
assertIncludes(
  regressionTest,
  "DOCX import keeps academic abbreviations and initials inside sentence segments",
  "regression-test.html must verify DOCX segmentation protects academic abbreviations and initials."
);
assertIncludes(
  regressionTest,
  "DOCX import labels complex bold run properties with semantic inline tags",
  "regression-test.html must verify complex Word formatting gets translator-friendly semantic tags."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves exact complex run properties behind semantic inline tags",
  "regression-test.html must verify semantic style-id tags preserve exact DOCX formatting on reconstruction."
);
assertIncludes(
  regressionTest,
  "DOCX import excludes complex field instructions from plain field result segments",
  "regression-test.html must verify DOCX import does not expose hidden complex field instruction text as translatable source."
);
assertIncludes(
  regressionTest,
  "DOCX export writes translated Word tabs breaks and hyphen controls without stale source text",
  "regression-test.html must verify DOCX import/export preserves visible Word text controls without stale source text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves hyperlink wrappers with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves hyperlinks with styled text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves simple field wrappers with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves simple fields with styled text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves complex field code/result structure with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves complex field markers and styled result text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves content controls with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves content controls with styled text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves custom XML wrappers with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves custom XML wrappers with styled text."
);
assertIncludes(
  regressionTest,
  "DOCX export preserves SmartTag wrappers with semantic inline tags",
  "regression-test.html must verify DOCX target reconstruction preserves SmartTag wrappers with styled text."
);
assertIncludes(appJs, "LoopCAT Project Report", "app.js must keep offline project report generation available.");
assertIncludes(
  appJs,
  `Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
  "app.js project reports must include a restrictive CSP."
);
assertIncludes(
  appJs,
  "project report export includes restrictive CSP",
  "app workflow test must verify normal project reports include a restrictive CSP."
);
assertIncludes(
  appJs,
  "anonymized project report includes restrictive CSP",
  "app workflow test must verify anonymized project reports include a restrictive CSP."
);
const openAiSuggestionFunction = functionBody(
  appJs,
  "async function createOpenAiSuggestion()",
  "function confirmExternalAiPromptShare"
);
const saveAiSettingsFunction = functionBody(appJs, "async function saveAiSettings()", "function renderAiSuggestions()");
assert(!indexHtml.includes("chatGptBtn"), "index.html must not expose the removed GPT toolbar button.");
assert(!appJs.includes("openChatGptForSelection"), "app.js must not retain the removed ChatGPT shortcut behavior.");
assert(
  !appJs.includes("Translate selection with ChatGPT"),
  "app.js command palette must not expose the removed ChatGPT shortcut."
);
assertIncludes(
  openAiSuggestionFunction,
  "saveOpenAiKey(apiKey",
  "app.js must keep OpenAI key persistence in the OpenAI suggestion request path."
);
assertIncludes(
  saveAiSettingsFunction,
  "isOpenAiProvider({ aiSettings })",
  "app.js AI settings saves must only persist typed OpenAI keys when OpenAI is the selected provider."
);
assert(
  openAiSuggestionFunction.indexOf("if (!aiSettings.enabled)") <
    openAiSuggestionFunction.indexOf("saveOpenAiKey(apiKey"),
  "app.js must not save OpenAI keys before AI helper enablement is checked."
);
assert(
  openAiSuggestionFunction.indexOf("if (!aiSettings.sendSourceToAi)") <
    openAiSuggestionFunction.indexOf("saveOpenAiKey(apiKey"),
  "app.js must not save OpenAI keys before source-sharing consent is checked."
);
assert(
  openAiSuggestionFunction.indexOf("if (!isOpenAiProvider({ aiSettings }))") <
    openAiSuggestionFunction.indexOf("saveOpenAiKey(apiKey"),
  "app.js must not save OpenAI keys before the selected provider is verified as OpenAI."
);
assert(
  openAiSuggestionFunction.indexOf("The active segment has no source text.") <
    openAiSuggestionFunction.indexOf("saveOpenAiKey(apiKey"),
  "app.js must not save OpenAI keys or settings for empty-source OpenAI suggestion requests."
);
assert(
  openAiSuggestionFunction.indexOf("browserAppearsOffline()") < openAiSuggestionFunction.indexOf("const apiKey ="),
  "app.js must report offline OpenAI requests before reading or requiring an API key."
);
assertIncludes(
  appJs,
  "AI settings save failure reports visible status without storing API key",
  "app workflow test must verify failed AI settings saves do not persist typed API keys."
);
assertIncludes(
  appJs,
  "OpenAI key storage failure restores previous key and project settings",
  "app workflow test must verify failed OpenAI key writes roll back project AI settings."
);
assertIncludes(
  appJs,
  "browser OpenAI key storage method failure restores previous key and project settings",
  "app workflow test must verify real browser OpenAI key storage method failures roll back project AI settings."
);
assertIncludes(
  appJs,
  "AI settings save persists project settings after storing API key",
  "app workflow test must verify successful AI settings saves persist project settings and optional API key."
);
assertIncludes(
  appJs,
  'const shouldUpdateOpenAiKey = Boolean(String(apiKeyInput || "").trim())',
  "app.js must not clear an existing OpenAI key when saving settings with a blank key field."
);
assertIncludes(
  appJs,
  "AI settings save with blank key field preserves existing browser key",
  "app workflow test must verify non-key AI settings changes do not accidentally clear a stored browser key."
);
assertIncludes(
  saveAiSettingsFunction,
  'keyStorage: isOpenAiProvider({ aiSettings }) ? openAiKeyStorageLabel() : "Not applicable"',
  "app.js AI settings activity details must not report OpenAI key storage for non-OpenAI providers."
);
assertIncludes(
  appJs,
  "AI settings save does not store typed OpenAI key or report OpenAI key storage when provider is not OpenAI",
  "app workflow test must verify non-OpenAI provider settings neither store typed OpenAI keys nor report OpenAI key storage."
);
assertIncludes(
  appJs,
  "AI settings activity log failure reports warning after successful settings save",
  "app workflow test must verify optional AI settings activity-log failure is visible after settings/key save."
);
assertIncludes(
  appJs,
  "blocked OpenAI suggestion does not save typed key when AI helpers are disabled",
  "app workflow test must verify blocked OpenAI requests do not persist keys when AI is disabled."
);
assertIncludes(
  appJs,
  "blocked OpenAI suggestion does not save typed key when source sharing is disabled",
  "app workflow test must verify blocked OpenAI requests do not persist keys when source sharing is disabled."
);
assertIncludes(
  appJs,
  "blocked OpenAI suggestion does not save typed key when a different provider is selected",
  "app workflow test must verify blocked OpenAI requests do not persist keys when another provider is selected."
);
assertIncludes(
  appJs,
  "blocked OpenAI suggestion does not save typed key or changed project settings when source text is empty",
  "app workflow test must verify empty-source OpenAI requests do not persist typed keys or changed project AI settings."
);
assertIncludes(
  appJs,
  "offline OpenAI suggestion reports offline before API key requirement or settings save",
  "app workflow test must verify offline OpenAI requests report offline before asking for API keys."
);
assertIncludes(
  appJs,
  "offline OpenAI suggestion fails before source sharing confirmation or key/settings save",
  "app workflow test must verify offline OpenAI requests do not persist keys, settings, or source-sharing confirmation."
);
assertIncludes(
  openAiSuggestionFunction,
  "browserAppearsOffline()",
  "app.js must check offline state before saving OpenAI suggestion keys or settings."
);
assertIncludes(
  appJs,
  "return sanitizePortableValue(event);",
  "app.js draft project activity events must use the safe portable activity shape before direct package/workspace storage."
);
assertIncludes(
  appJs,
  "draft project activity events strip provider trace metadata before direct package or workspace storage",
  "app workflow test must verify drafted package/workspace activity events strip provider traces before direct storage."
);
assertIncludes(
  openAiSuggestionFunction,
  "contextLabels: openAiContextLabels",
  "app.js must ask for action-time confirmation that names optional local OpenAI context before sending source text."
);
assert(
  openAiSuggestionFunction.indexOf('confirmExternalAiPromptShare({ provider: "OpenAI"') <
    openAiSuggestionFunction.indexOf("saveOpenAiKey(apiKey"),
  "app.js must not save OpenAI keys before action-time OpenAI source-sharing confirmation."
);
assertIncludes(
  appJs,
  "OpenAI suggestion confirmation names optional local context before key or project settings are saved",
  "app workflow test must verify canceled OpenAI requests name optional local context and do not persist keys or project AI settings."
);
assertIncludes(
  appJs,
  "local TM matches",
  "app workflow test must verify OpenAI confirmation names optional TM context."
);
assertIncludes(
  appJs,
  "local termbase hits",
  "app workflow test must verify OpenAI confirmation names optional termbase context."
);
assertIncludes(
  appJs,
  "style instructions",
  "app workflow test must verify OpenAI confirmation names optional style-guide context."
);
assertIncludes(
  appJs,
  "OpenAI suggestion setup failure does not store typed key or changed project settings",
  "app workflow test must verify failed OpenAI suggestion setup rolls back typed keys and project AI settings."
);
assertIncludes(
  appJs,
  "OpenAI suggestion key storage failure restores previous key and project settings",
  "app workflow test must verify OpenAI suggestion setup rolls back persisted project settings when key storage fails."
);
assertIncludes(
  appJs,
  "OpenAI provider connection failure keeps saved settings and does not create a suggestion",
  "app workflow test must verify approved OpenAI provider failures keep saved settings/keys without creating suggestions."
);
assertIncludes(
  appJs,
  "Simulated OpenAI provider connection failure",
  "app workflow test must simulate provider connection failure after OpenAI setup succeeds."
);
assertIncludes(
  appJs,
  "production UI does not expose mock AI suggestions",
  "app workflow test must verify production UI does not expose mock AI suggestions."
);
assertIncludes(
  smokeTest,
  "OpenAI suggestion with explanation",
  "smoke-test.html must exercise the production OpenAI suggestion shape with a local stub."
);
assertIncludes(
  smokeTest,
  "OpenAI helper obeys disabled local context toggles",
  "smoke-test.html must verify disabled OpenAI local context toggles are enforced by the helper."
);
assertIncludes(
  regressionTest,
  "OpenAI suggestion includes TM context explanation",
  "regression-test.html must exercise production OpenAI suggestion context with a local stub."
);
assertIncludes(
  regressionTest,
  "OPUS-CAT provider lists installed language-pair model tags and pretranslates through local MTRestService",
  "regression-test.html must verify OPUS-CAT model-tag discovery and pretranslation."
);
assertIncludes(
  regressionTest,
  "Simulated browser CORS or connection failure",
  "regression-test.html must verify OPUS-CAT falls back from a browser-blocked direct endpoint to the local bridge."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper opts out of provider response storage",
  "security-policy-test.html must verify OpenAI Responses requests opt out of provider-side storage."
);
assertIncludes(
  securityPolicyTest,
  "OpenAI helper reports provider connection failures clearly",
  "security-policy-test.html must verify OpenAI provider connection failures get clear status text."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows explicit OPUS-CAT loopback endpoints",
  "security-policy-test.html must verify OPUS-CAT loopback CSP access."
);
assertIncludes(
  securityPolicyTest,
  "CSP connect-src allows explicit OPUS-CAT web bridge loopback endpoints",
  "security-policy-test.html must verify OPUS-CAT web bridge CSP access."
);
assertIncludes(
  readme,
  "OpenAI provider-stub flow",
  "README.md must describe smoke-test AI coverage as provider-stub coverage, not a mock AI flow."
);
assertIncludes(
  readme,
  "refuses OpenAI suggestions while the browser reports offline",
  "README.md must document OpenAI offline preflight before saving keys/settings."
);
assertIncludes(
  readme,
  "only when OpenAI is the selected provider",
  "README.md must document provider-scoped OpenAI key storage."
);
assertIncludes(
  readme,
  "does not store or overwrite the browser OpenAI key",
  "README.md must document non-OpenAI provider settings cannot store typed OpenAI keys."
);
assertIncludes(
  readme,
  "records OpenAI key storage as not applicable",
  "README.md must document non-OpenAI AI-settings audit details do not report OpenAI key storage."
);
assertIncludes(
  readme,
  "asks for action-time confirmation that names selected/source text plus optional local TM, termbase, and style context",
  "README.md must document explicit OpenAI confirmation for optional local context."
);
assertIncludes(
  readme,
  "sends OpenAI Responses requests with `store: false`",
  "README.md must document OpenAI response-storage opt-out."
);
assertIncludes(
  readme,
  "reports provider connection failures in plain language",
  "README.md must document clear OpenAI provider connection failure handling."
);
assertIncludes(
  readme,
  "keeps the user-approved settings and key",
  "README.md must document approved OpenAI provider failures keep settings/key but do not create suggestions."
);
assertIncludes(
  readme,
  "The former GPT toolbar shortcut has been removed",
  "README.md must document removal of the legacy GPT toolbar shortcut."
);
assertIncludes(
  roadmap,
  "Production builds no longer expose mock AI drafts",
  "ROADMAP.md must record the Phase 6 production AI decision."
);
assertIncludes(
  roadmap,
  "Typed OpenAI keys are stored locally only when OpenAI is the selected provider",
  "ROADMAP.md must record provider-scoped OpenAI key storage."
);
assertIncludes(
  roadmap,
  "Non-OpenAI AI-settings activity logs mark OpenAI key storage as not applicable",
  "ROADMAP.md must record provider-scoped AI-settings activity details."
);
assertIncludes(
  roadmap,
  "OpenAI suggestions now require action-time confirmation that names selected/source text plus optional local TM, termbase, and style context",
  "ROADMAP.md must record the Phase 6 explicit-context OpenAI confirmation."
);
assertIncludes(
  roadmap,
  "OpenAI Responses requests explicitly set `store: false`",
  "ROADMAP.md must record the Phase 6 OpenAI response-storage opt-out."
);
assertIncludes(
  roadmap,
  "OpenAI suggestions fail fast while the browser reports offline",
  "ROADMAP.md must record the Phase 6 offline AI preflight."
);
assertIncludes(
  roadmap,
  "OpenAI provider connection failures report a clear recoverable status",
  "ROADMAP.md must record the Phase 6 OpenAI connection-failure handling."
);
assertIncludes(
  roadmap,
  "Approved OpenAI provider connection failures keep already-saved settings and keys",
  "ROADMAP.md must record approved OpenAI provider failure persistence behavior."
);
assertIncludes(
  roadmap,
  "The legacy GPT toolbar shortcut has been removed",
  "ROADMAP.md must record removal of the legacy GPT toolbar shortcut."
);
assertIncludes(
  readme,
  "actual AI provider used and the configured project provider",
  "README.md must document AI activity audit details."
);
assertIncludes(
  readme,
  "exact hosted AI provider API paths used by the AI Command Centre",
  "README.md must document desktop network access for implemented hosted AI providers."
);
assertIncludes(
  appJs,
  "logOptionalProjectActivity(type, summary, detail = {}, label = summary || type)",
  "app.js must route export activity logging through an optional helper."
);
assertIncludes(
  appJs,
  "appendActivityWarning(message, activityLogged)",
  "app.js must append a warning when an export succeeds but activity logging fails."
);
assertIncludes(
  appJs,
  "IMPORT_ACTIVITY_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate import activity log failure after a successful data write."
);
assertIncludes(
  appJs,
  "PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate project settings activity log failure after a successful settings save."
);
assertIncludes(
  appJs,
  "CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate project creation activity log failure after the project is created."
);
assertIncludes(
  appJs,
  "CONFIRM_ACTIVITY_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate confirm activity log failure after a segment is confirmed."
);
assertIncludes(
  appJs,
  "WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate workspace-save activity log failure after package writing."
);
assertIncludes(
  appJs,
  "OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG",
  "app workflow tests must be able to simulate browser key-storage failure after project AI settings are written."
);
assertIncludes(
  appJs,
  "function writeOpenAiKeyStorage",
  "app.js must wrap OpenAI key writes so browser storage failures can be rolled back consistently."
);
assertIncludes(
  appJs,
  "OpenAI key could not be saved in this browser.",
  "app.js must report browser OpenAI key storage failures clearly."
);
assertIncludes(
  readText("regression-test.html"),
  "delivery export validation permits source fallback for empty target segments",
  "regression-test.html must verify final delivery validation permits planned source fallback."
);
assertIncludes(
  readText("regression-test.html"),
  "XLIFF delivery validation permits meaningful empty targets",
  "regression-test.html must verify final XLIFF validation preserves empty targets."
);
assertIncludes(
  readText("regression-test.html"),
  "bilingual review export validation permits empty target segments as review notes",
  "regression-test.html must verify review exports can document untranslated segments."
);
assertIncludes(
  readText("regression-test.html"),
  "delivery export validation blocks zero-segment files",
  "regression-test.html must verify final delivery validation blocks empty files."
);
assertIncludes(
  readText("regression-test.html"),
  "review export validation reports zero-segment projects without delivery blocking",
  "regression-test.html must verify review/report flows can diagnose empty projects."
);

assertIncludes(
  desktopMain,
  "protocol.registerSchemesAsPrivileged",
  "desktop/main.cjs must register a privileged app protocol."
);
assertIncludes(
  desktopMain,
  "allowServiceWorkers: false",
  "desktop/main.cjs must keep service workers disabled for the packaged desktop protocol because desktop offline assets are served from app.asar."
);
assertIncludes(desktopMain, "ALLOWED_APP_FILES", "desktop/main.cjs must allowlist local protocol files.");
assertIncludes(
  desktopMain,
  `require("../config/production-assets.js")`,
  "desktop/main.cjs must consume the canonical production asset manifest."
);
assert(
  productionAssets.runtimeAssets.includes("icons/loopcat-icon.svg"),
  "Production asset manifest must allowlist icon files explicitly."
);
assert(
  !desktopMain.includes("ALLOWED_APP_PREFIXES"),
  "desktop/main.cjs must not allow broad local protocol path prefixes."
);
assertIncludes(
  desktopMain,
  "normalizeAppRelativePath(relativePath)",
  "desktop/main.cjs must normalize local protocol paths before allowlist checks."
);
assertIncludes(
  desktopMain,
  `part === ".."`,
  "desktop/main.cjs must reject path traversal segments in local protocol paths."
);
assertIncludes(
  desktopMain,
  "ALLOWED_APP_FILES.has(normalized)",
  "desktop/main.cjs must serve only explicitly allowlisted local protocol files."
);
assertIncludes(
  desktopMain,
  "isAllowedAppPath(relativePath)",
  "desktop/main.cjs must reject local protocol paths outside the app allowlist."
);
assertIncludes(desktopMain, "contextIsolation: true", "desktop/main.cjs must enable context isolation.");
assertIncludes(
  desktopMain,
  "preload: DESKTOP_PRELOAD",
  "desktop/main.cjs must load the narrow desktop preload bridge."
);
assertIncludes(
  desktopMain,
  'ipcMain.handle("loopcat:start-lm-studio-server"',
  "desktop/main.cjs must expose only the fixed LM Studio server start helper over IPC."
);
assertIncludes(desktopMain, "lms.exe", "desktop/main.cjs must look for the Windows LM Studio CLI.");
assertIncludes(
  desktopMain,
  '["server", "start", "--port", "1234", "--bind", "127.0.0.1", "--cors"]',
  "desktop/main.cjs must start LM Studio with fixed local server arguments."
);
assertIncludes(
  desktopPreload,
  'contextBridge.exposeInMainWorld("LoopCATDesktop"',
  "desktop/preload.cjs must expose a narrow desktop bridge namespace."
);
assertIncludes(
  desktopPreload,
  "startLmStudioServer",
  "desktop/preload.cjs must expose the fixed LM Studio server start helper."
);
assertIncludes(desktopPreload, "Object.freeze", "desktop/preload.cjs must expose a frozen desktop bridge.");
assertIncludes(desktopPreload, "getRuntimeStatus", "desktop/preload.cjs must expose redacted local runtime status.");
assertIncludes(
  desktopPreload,
  "setHardwareAccelerationForNextLaunch",
  "desktop/preload.cjs must expose the explicit next-launch GPU fallback setting."
);
assert(!desktopPreload.includes("sendSync"), "desktop/preload.cjs must not expose synchronous IPC.");
assertIncludes(
  desktopMain,
  "nodeIntegration: false",
  "desktop/main.cjs must keep Node integration disabled in the renderer."
);
assertIncludes(
  desktopMain,
  "createRendererWebPreferences",
  "desktop/main.cjs must keep renderer web preferences centralized and testable."
);
assertIncludes(
  desktopMain,
  "nodeIntegrationInWorker: false",
  "desktop/main.cjs must keep Node integration disabled in workers."
);
assertIncludes(
  desktopMain,
  "nodeIntegrationInSubFrames: false",
  "desktop/main.cjs must keep Node integration disabled in subframes."
);
assertIncludes(
  desktopMain,
  "webSecurity: true",
  "desktop/main.cjs must explicitly keep renderer web security enabled."
);
assertIncludes(
  desktopMain,
  "allowRunningInsecureContent: false",
  "desktop/main.cjs must explicitly reject insecure renderer content."
);
assertIncludes(desktopMain, "webviewTag: false", "desktop/main.cjs must keep Electron webview tags disabled.");
assertIncludes(
  desktopMain,
  "enableWebSQL: false",
  "desktop/main.cjs must disable legacy WebSQL in the desktop renderer."
);
assertIncludes(
  desktopMain,
  "navigateOnDragDrop: false",
  "desktop/main.cjs must prevent drag-and-drop file navigation in the desktop renderer."
);
assertIncludes(
  desktopMain,
  "devTools: !isPackaged",
  "desktop/main.cjs must disable DevTools in packaged public desktop builds."
);
assertIncludes(
  desktopMain,
  "DESKTOP_RENDERER_SANDBOX_DEFAULT",
  "desktop/main.cjs must make the desktop renderer OS sandbox policy explicit."
);
assertIncludes(
  desktopMain,
  "const DESKTOP_RENDERER_SANDBOX_DEFAULT = true",
  "desktop/main.cjs must enable renderer sandboxing on every platform."
);
assertIncludes(
  desktopMain,
  "app.enableSandbox()",
  "desktop/main.cjs must globally enable Chromium renderer sandboxing before ready."
);
assertIncludes(
  desktopMain,
  "sandbox: DESKTOP_RENDERER_SANDBOX_DEFAULT",
  "desktop/main.cjs must keep every BrowserWindow sandboxed."
);
assert(
  !desktopMain.includes("retryWithoutRendererSandbox"),
  "desktop/main.cjs must not retry a public launch without the renderer sandbox."
);
assert(
  !desktopMain.includes("LOOPCAT_DESKTOP_NO_SANDBOX"),
  "desktop/main.cjs must not expose a public no-sandbox environment override."
);
assertIncludes(
  desktopRuntimeSettings,
  "LOOPCAT_DISABLE_HARDWARE_ACCELERATION",
  "desktop/runtime-settings.cjs must retain an explicit GPU troubleshooting fallback."
);
assertIncludes(
  desktopMain,
  "!DESKTOP_HARDWARE_ACCELERATION_ENABLED",
  "desktop/main.cjs must keep hardware acceleration enabled unless the explicit fallback is selected."
);
assertIncludes(
  desktopMain,
  "loopcat:get-runtime-status",
  "desktop/main.cjs must expose origin-checked runtime diagnostics."
);
assertIncludes(
  desktopMain,
  "loopcat:set-hardware-acceleration",
  "desktop/main.cjs must persist the explicit next-launch GPU setting."
);
assertIncludes(desktopMain, "configurePermissions()", "desktop/main.cjs must configure renderer permission handling.");
assertIncludes(
  desktopMain,
  `allowedPermissions = new Set(["fileSystem"])`,
  "desktop/main.cjs must restrict renderer permissions to workspace file-system access."
);
assertIncludes(
  desktopMain,
  "setPermissionRequestHandler",
  "desktop/main.cjs must deny unexpected permission requests."
);
assertIncludes(desktopMain, "setPermissionCheckHandler", "desktop/main.cjs must deny unexpected permission checks.");
assertIncludes(
  desktopMain,
  "isLoopcatOrigin",
  "desktop/main.cjs must scope allowed permissions to the bundled app origin."
);
assertIncludes(
  desktopMain,
  "isAllowedAppNavigationUrl(url)",
  "desktop/main.cjs must restrict top-level navigation to the app shell."
);
assertIncludes(
  desktopMain,
  'relativePath === "index.html"',
  "desktop/main.cjs must allow only index.html as a top-level app navigation target."
);
assertIncludes(
  desktopMain,
  "isExternalHttpsUrl(url)",
  "desktop/main.cjs must classify allowed external links through a testable HTTPS-only helper."
);
assertIncludes(
  desktopMain,
  'parsed.protocol === "https:"',
  "desktop/main.cjs must reject insecure HTTP external links."
);
assertIncludes(
  desktopMain,
  "ALLOWED_EXTERNAL_HOSTS",
  "desktop/main.cjs must keep system-browser external opens on an explicit host allowlist."
);
assertIncludes(
  desktopMain,
  "ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase())",
  "desktop/main.cjs must not open arbitrary HTTPS hosts in the system browser."
);
assertIncludes(
  desktopMain,
  "const ALLOWED_EXTERNAL_HOSTS = new Set();",
  "desktop/main.cjs must not allow removed GPT shortcut hosts in the system browser."
);
assertIncludes(desktopMain, "!parsed.port", "desktop/main.cjs must reject non-default external HTTPS ports.");
assertIncludes(desktopMain, "setWindowOpenHandler", "desktop/main.cjs must intercept renderer popup attempts.");
assertIncludes(desktopMain, 'return { action: "deny" }', "desktop/main.cjs must deny renderer-created popup windows.");
assertIncludes(
  desktopMain,
  "openExternalUrl(url)",
  "desktop/main.cjs must route external web links through the HTTPS-only opener."
);
assertIncludes(
  desktopMain,
  "configureNetworkBoundaries()",
  "desktop/main.cjs must configure renderer network request boundaries."
);
assertIncludes(
  desktopMain,
  "webRequest.onBeforeRequest",
  "desktop/main.cjs must enforce network request allowlisting at the Electron session layer."
);
assertIncludes(
  desktopMain,
  "isAllowedNetworkRequest(details.url)",
  "desktop/main.cjs must route desktop network checks through a testable helper."
);
assertIncludes(
  desktopMain,
  "webRequest.onHeadersReceived",
  "desktop/main.cjs must adjust allowed local OPUS-CAT response headers for renderer access."
);
assertIncludes(
  desktopMain,
  "isAllowedOpenAiResponsesUrl(requestUrl)",
  "desktop/main.cjs must route OpenAI network checks through an exact endpoint helper."
);
assertIncludes(
  desktopMain,
  "isAllowedLocalAiRuntimeUrl(requestUrl)",
  "desktop/main.cjs must route local AI runtime checks through an exact loopback helper."
);
assertIncludes(
  desktopMain,
  "isAllowedOpusCatRuntimeUrl(requestUrl)",
  "desktop/main.cjs must route OPUS-CAT runtime checks through an exact loopback helper."
);
assertIncludes(
  desktopMain,
  "isAllowedOllamaCloudUrl(requestUrl)",
  "desktop/main.cjs must route hosted Ollama checks through an exact hosted helper."
);
assertIncludes(
  desktopMain,
  "isAllowedGeminiUrl(requestUrl)",
  "desktop/main.cjs must route Gemini checks through an exact hosted helper."
);
assertIncludes(
  desktopMain,
  "isAllowedAzureOpenAiUrl(requestUrl)",
  "desktop/main.cjs must route Azure OpenAI checks through an exact hosted helper."
);
assertIncludes(
  desktopMain,
  "isAllowedHostedOpenAiCompatibleUrl(requestUrl)",
  "desktop/main.cjs must route hosted OpenAI-compatible checks through an exact hosted helper."
);
assertIncludes(
  desktopMain,
  "href === OPENAI_RESPONSES_URL || href === OPENAI_MODELS_URL",
  "desktop/main.cjs must reject OpenAI endpoint variants with credentials, query strings, fragments, or alternate ports."
);
assertIncludes(
  desktopMain,
  "https://api.openai.com/v1/responses",
  "desktop/main.cjs must keep the explicit external AI endpoint narrow."
);
assertIncludes(
  desktopMain,
  "LOCAL_AI_RUNTIME_PATHS",
  "desktop/main.cjs must allow only explicit local AI runtime paths."
);
assertIncludes(
  desktopMain,
  "OPUS_CAT_RUNTIME_ACTION_QUERY_KEYS",
  "desktop/main.cjs must allow only explicit OPUS-CAT MTRestService actions and query keys."
);
assertIncludes(
  desktopMain,
  "OLLAMA_CLOUD_API_PATHS",
  "desktop/main.cjs must allow only explicit hosted Ollama API paths."
);
assertIncludes(desktopMain, "GEMINI_API_PATHS", "desktop/main.cjs must allow only explicit Gemini API paths.");
assertIncludes(
  desktopMain,
  "HOSTED_OPENAI_COMPATIBLE_API_PATHS",
  "desktop/main.cjs must allow only explicit hosted OpenAI-compatible API paths."
);
assertIncludes(
  desktopMain,
  "mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`)",
  "desktop/main.cjs must load the bundled local app shell."
);
assertIncludes(
  desktopMain,
  "shell?.openExternal?.(url)",
  "desktop/main.cjs must open allowed external links outside the app."
);
assertIncludes(
  desktopMain,
  "LOOPCAT_DESKTOP_SMOKE",
  "desktop/main.cjs must expose an opt-in packaged desktop launch smoke."
);
assertIncludes(
  desktopMain,
  "LOOPCAT_DESKTOP_SMOKE_RESULT_FILE",
  "desktop/main.cjs must write packaged desktop smoke results to a caller-controlled result file."
);
assertIncludes(
  desktopMain,
  "LOOPCAT_DESKTOP_SMOKE_USER_DATA_DIR",
  "desktop/main.cjs must isolate packaged desktop smoke profile data from normal app profiles."
);
assertIncludes(
  desktopMain,
  "DESKTOP_SMOKE_NO_SANDBOX",
  "desktop/main.cjs must scope Chromium no-sandbox launches to automated packaged-smoke mode."
);
assertIncludes(
  desktopMain,
  "LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX",
  "desktop/main.cjs must require an explicit packaged-smoke flag before appending no-sandbox."
);
assertIncludes(
  desktopMain,
  "desktopRuntime",
  "desktop/main.cjs desktop smoke must record runtime security and graphics status."
);
assertIncludes(
  desktopMain,
  "chromiumNoSandbox",
  "desktop/main.cjs desktop smoke must record Chromium no-sandbox launch usage."
);
assertIncludes(
  desktopMain,
  "hardwareAccelerationEnabled",
  "desktop/main.cjs desktop smoke must record hardware acceleration status."
);
assertIncludes(
  desktopMain,
  "attachDesktopSmokeProbe(mainWindow",
  "desktop/main.cjs must attach the packaged desktop smoke probe before loading the app shell."
);
assertIncludes(
  desktopMain,
  "show: !DESKTOP_SMOKE_MODE",
  "desktop/main.cjs must keep packaged desktop smoke noninteractive."
);
assertIncludes(
  desktopMain,
  '"#projectsView"',
  "desktop/main.cjs desktop smoke must verify that the app shell rendered core project UI."
);
assertIncludes(
  desktopMain,
  "appShellAssetProbe",
  "desktop/main.cjs desktop smoke must verify bundled app-shell assets through the private app protocol."
);
assertIncludes(
  desktopMain,
  "fetchAppShellAsset",
  "desktop/main.cjs desktop smoke must fetch packaged app-shell assets."
);
assertIncludes(
  desktopMain,
  "window.CatHan.storage",
  "desktop/main.cjs desktop smoke must use the app storage API for packaged persistence checks."
);
assertIncludes(
  desktopMain,
  "window.CatHan.project",
  "desktop/main.cjs desktop smoke must use the app project API for packaged project persistence checks."
);
assertIncludes(
  desktopMain,
  "window.CatHan?.localization",
  "desktop/main.cjs desktop smoke must use the app localization API for packaged import/export checks."
);
assertIncludes(
  desktopMain,
  "window.CatHan?.xliff",
  "desktop/main.cjs desktop smoke must use the app XLIFF API for packaged import/export checks."
);
assertIncludes(
  desktopMain,
  "window.CatHan?.docx",
  "desktop/main.cjs desktop smoke must use the app DOCX API for packaged review export checks."
);
assertIncludes(
  desktopMain,
  'storage.put("appMeta"',
  "desktop/main.cjs desktop smoke must prove IndexedDB writes work in the packaged app."
);
assertIncludes(
  desktopMain,
  'storage.get("appMeta"',
  "desktop/main.cjs desktop smoke must prove IndexedDB reads work in the packaged app."
);
assertIncludes(
  desktopMain,
  'storage.deleteByKey("appMeta"',
  "desktop/main.cjs desktop smoke must clean up its IndexedDB probe record."
);
assertIncludes(
  desktopMain,
  "projectApi.createProject",
  "desktop/main.cjs desktop smoke must prove packaged project creation works."
);
assertIncludes(
  desktopMain,
  "projectApi.appendProjectSegments",
  "desktop/main.cjs desktop smoke must prove packaged segment creation works."
);
assertIncludes(
  desktopMain,
  "projectApi.saveSegment",
  "desktop/main.cjs desktop smoke must prove packaged target save works."
);
assertIncludes(
  desktopMain,
  "projectApi.getProjectSegments",
  "desktop/main.cjs desktop smoke must prove packaged target readback works."
);
assertIncludes(
  desktopMain,
  "localizationApi.parseLocalizationFile",
  "desktop/main.cjs desktop smoke must prove packaged localization import works."
);
assertIncludes(
  desktopMain,
  "localizationApi.buildLocalizationFile",
  "desktop/main.cjs desktop smoke must prove packaged localization target export works."
);
assertIncludes(
  desktopMain,
  "xliffApi.parseXliffText",
  "desktop/main.cjs desktop smoke must prove packaged XLIFF import works."
);
assertIncludes(
  desktopMain,
  "xliffApi.buildTargetXliff",
  "desktop/main.cjs desktop smoke must prove packaged XLIFF target export works."
);
assertIncludes(
  desktopMain,
  "xliffApi.buildXliff22",
  "desktop/main.cjs desktop smoke must prove packaged XLIFF 2.2 handoff export works."
);
assertIncludes(
  desktopMain,
  "XLIFF 2.2 handoff export",
  "desktop/main.cjs desktop smoke must fail if packaged XLIFF 2.2 handoff export breaks."
);
assertIncludes(
  desktopMain,
  "docxApi.extractDocxSegments",
  "desktop/main.cjs desktop smoke must prove packaged DOCX source import works."
);
assertIncludes(
  desktopMain,
  "docxApi.buildTargetDocx",
  "desktop/main.cjs desktop smoke must prove packaged target DOCX reconstruction works."
);
assertIncludes(
  desktopMain,
  "docxApi.buildBilingualDocx",
  "desktop/main.cjs desktop smoke must prove packaged bilingual DOCX generation works."
);
assertIncludes(
  desktopMain,
  "storage.exportAllData",
  "desktop/main.cjs desktop smoke must prove packaged backup export includes saved targets."
);
assertIncludes(
  desktopMain,
  "HTML target export",
  "desktop/main.cjs desktop smoke must fail if packaged HTML target export breaks."
);
assertIncludes(
  desktopMain,
  "XLIFF target export",
  "desktop/main.cjs desktop smoke must fail if packaged XLIFF target export breaks."
);
assertIncludes(
  desktopMain,
  "DOCX target export",
  "desktop/main.cjs desktop smoke must fail if packaged target DOCX export breaks."
);
assertIncludes(
  desktopMain,
  "bilingual DOCX generation",
  "desktop/main.cjs desktop smoke must fail if packaged bilingual DOCX generation breaks."
);
assertIncludes(
  desktopMain,
  "backup includes saved targets",
  "desktop/main.cjs desktop smoke must fail if packaged backup export omits saved targets."
);
assertIncludes(
  desktopMain,
  "projectApi.deleteProject",
  "desktop/main.cjs desktop smoke must clean up its packaged project persistence probe."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./index.html", "LoopCAT")',
  "desktop/main.cjs desktop smoke must verify packaged index.html is served by the private protocol."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./app.js", "cathan-local-cat")',
  "desktop/main.cjs desktop smoke must verify packaged app.js is served by the private protocol."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./src/ui/tokens.css", "--color-accent: #087b71")',
  "desktop/main.cjs desktop smoke must verify the semantic design token source is packaged."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./service-worker.js", "loopcat-offline-")',
  "desktop/main.cjs desktop smoke must verify packaged service-worker.js is included for browser/PWA builds."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./config/production-assets.js", "webDistributionAssets")',
  "desktop/main.cjs desktop smoke must verify the canonical production asset manifest is packaged."
);
assertIncludes(
  desktopMain,
  'fetchAppShellAsset("./cat-worker.js", "scoreTmEntries")',
  "desktop/main.cjs desktop smoke must verify the packaged CAT worker is available."
);
assertIncludes(
  desktopMain,
  'fetch("./test-runner.html")',
  "desktop/main.cjs desktop smoke must verify test pages are blocked by the private protocol."
);
assertIncludes(
  desktopMain,
  "test runner excluded from desktop protocol",
  "desktop/main.cjs desktop smoke must report if test pages are exposed through the private protocol."
);
assertIncludes(
  desktopBuildScript,
  "ELECTRON_CACHE",
  "scripts/build-desktop.cjs must set a project-local Electron cache."
);
assertIncludes(
  desktopBuildScript,
  "ELECTRON_BUILDER_CACHE",
  "scripts/build-desktop.cjs must set a project-local Electron Builder cache."
);
assertIncludes(
  desktopBuildScript,
  "assertPlatformBuildHost",
  "scripts/build-desktop.cjs must reject platform artifact builds on the wrong OS before cleaning dist."
);
assertIncludes(
  desktopBuildScript,
  "requestedPlatforms",
  "scripts/build-desktop.cjs must parse requested desktop build platforms before packaging."
);
assertIncludes(
  desktopBuildScript,
  "must be built on",
  "scripts/build-desktop.cjs must explain platform-specific build host requirements clearly."
);
assertIncludes(
  desktopBuildScript,
  "desktop-build.lock",
  "scripts/build-desktop.cjs must lock desktop packaging so concurrent platform builds cannot corrupt dist."
);
assertIncludes(
  desktopBuildScript,
  "acquireBuildLock",
  "scripts/build-desktop.cjs must acquire a desktop build lock before cleaning dist."
);
assertIncludes(
  desktopBuildScript,
  "Another desktop build appears to be running",
  "scripts/build-desktop.cjs must fail clearly when another desktop build owns the workspace."
);
assertIncludes(
  desktopBuildScript,
  "function isProcessAlive(pid)",
  "scripts/build-desktop.cjs must recover abandoned desktop build locks when the owner process has exited."
);
assertIncludes(
  desktopBuildScript,
  "process.kill(processId, 0)",
  "scripts/build-desktop.cjs must probe desktop build lock owner liveness portably."
);
assertIncludes(
  desktopBuildScript,
  "LOOPCAT_BUILD_LOCK_STALE_MS",
  "scripts/build-desktop.cjs must support stale desktop build lock recovery."
);
assertIncludes(
  desktopBuildScript,
  "removeBuilderDebugSidecars",
  "scripts/build-desktop.cjs must remove Electron Builder debug sidecars after packaging."
);
assertIncludes(
  desktopBuildScript,
  "Refusing to remove builder sidecar outside dist",
  "scripts/build-desktop.cjs must guard post-build sidecar cleanup to the dist directory."
);
assertIncludes(
  desktopBuildScript,
  "function removeBuildScratch()",
  "scripts/build-desktop.cjs must remove stale unpacked build scratch before packaging."
);
assertIncludes(
  desktopBuildScript,
  "builder-(?:debug|effective-config)",
  "scripts/build-desktop.cjs must remove stale builder debug sidecars before packaging."
);
assertIncludes(
  desktopBuildScript,
  "Refusing to remove build scratch outside dist",
  "scripts/build-desktop.cjs must guard scratch cleanup to the dist directory."
);
assertIncludes(
  signingEnvScript,
  '"CSC_LINK", "CSC_KEY_PASSWORD"',
  "scripts/verify-signing-env.cjs must accept standard Electron Builder certificate variables."
);
assertIncludes(
  signingEnvScript,
  '"WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"',
  "scripts/verify-signing-env.cjs must accept Windows-specific certificate variables."
);
assertIncludes(
  signingEnvScript,
  '"APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"',
  "scripts/verify-signing-env.cjs must accept App Store Connect API key notarization variables."
);
assertIncludes(
  signingEnvScript,
  '"APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"',
  "scripts/verify-signing-env.cjs must accept Apple ID notarization variables."
);
assertIncludes(
  signingEnvScript,
  '"APPLE_KEYCHAIN", "APPLE_KEYCHAIN_PROFILE"',
  "scripts/verify-signing-env.cjs must accept keychain profile notarization variables."
);
assertIncludes(
  signingEnvScript,
  "missingFromAlternative",
  "scripts/verify-signing-env.cjs must report missing variable names without printing secret values."
);
assertIncludes(
  signingEnvSelfTestScript,
  "Windows partial standard certificate",
  "scripts/verify-signing-env-selftest.cjs must reject partial Windows signing credential sets."
);
assertIncludes(
  signingEnvSelfTestScript,
  "Windows whitespace-only certificate link",
  "scripts/verify-signing-env-selftest.cjs must reject whitespace-only Windows signing credential values."
);
assertIncludes(
  signingEnvSelfTestScript,
  "macOS partial API notarization credentials",
  "scripts/verify-signing-env-selftest.cjs must reject partial macOS notarization credential sets."
);
assertIncludes(
  signingEnvSelfTestScript,
  "macOS whitespace-only certificate password",
  "scripts/verify-signing-env-selftest.cjs must reject whitespace-only macOS signing credential values."
);
assertIncludes(
  signingEnvSelfTestScript,
  "Signing environment verifier printed secret values",
  "scripts/verify-signing-env-selftest.cjs must prove signing environment verification does not print secret values."
);
assertIncludes(
  desktopWrapperScript,
  "ALLOWED_APP_FILES",
  "scripts/verify-desktop-wrapper.cjs must inspect the desktop protocol allowlist."
);
assertIncludes(
  desktopWrapperScript,
  "expectedRuntimeFiles",
  "scripts/verify-desktop-wrapper.cjs must keep an explicit expected runtime-file list."
);
assertIncludes(
  desktopWrapperScript,
  '"loopcat://app/index.html"',
  "scripts/verify-desktop-wrapper.cjs must verify bundled app-shell URL resolution."
);
assertIncludes(
  desktopWrapperScript,
  '"loopcat://app/%2e%2e/index.html"',
  "scripts/verify-desktop-wrapper.cjs must verify encoded traversal rejection."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedOpenAiResponsesUrl",
  "scripts/verify-desktop-wrapper.cjs must verify the exact OpenAI endpoint helper."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedGeminiUrl",
  "scripts/verify-desktop-wrapper.cjs must verify exact Gemini endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedAnthropicUrl",
  "scripts/verify-desktop-wrapper.cjs must verify exact Anthropic endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedCohereUrl",
  "scripts/verify-desktop-wrapper.cjs must verify exact Cohere endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedAzureOpenAiUrl",
  "scripts/verify-desktop-wrapper.cjs must verify exact Azure OpenAI endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedHostedOpenAiCompatibleUrl",
  "scripts/verify-desktop-wrapper.cjs must verify hosted OpenAI-compatible endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedOpusCatRuntimeUrl",
  "scripts/verify-desktop-wrapper.cjs must verify OPUS-CAT loopback endpoint allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "opusCatCorsResponseHeaders",
  "scripts/verify-desktop-wrapper.cjs must verify OPUS-CAT local CORS response headers."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedNetworkRequest",
  "scripts/verify-desktop-wrapper.cjs must verify desktop network request allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "isAllowedAppNavigationUrl",
  "scripts/verify-desktop-wrapper.cjs must verify top-level app navigation allowlisting."
);
assertIncludes(
  desktopWrapperScript,
  "loopcat://app/styles.css",
  "scripts/verify-desktop-wrapper.cjs must verify top-level navigation cannot open runtime assets."
);
assertIncludes(
  desktopWrapperScript,
  "isExternalHttpsUrl",
  "scripts/verify-desktop-wrapper.cjs must verify HTTPS-only external link handling."
);
assertIncludes(
  desktopWrapperScript,
  "Desktop external host allowlist must not include generic HTTPS hosts",
  "scripts/verify-desktop-wrapper.cjs must verify generic HTTPS hosts cannot be opened externally."
);
assertIncludes(
  desktopWrapperScript,
  "isExternalHttpsUrl must not open the API endpoint in the system browser",
  "scripts/verify-desktop-wrapper.cjs must verify the OpenAI API endpoint is fetch-only, not externally opened."
);
assertIncludes(
  desktopWrapperScript,
  "isExternalHttpsUrl must reject the removed ChatGPT external action",
  "scripts/verify-desktop-wrapper.cjs must verify removed ChatGPT external actions are denied."
);
assertIncludes(
  desktopWrapperScript,
  "isExternalHttpsUrl must reject removed ChatGPT prompt URLs",
  "scripts/verify-desktop-wrapper.cjs must verify removed ChatGPT prompt URLs are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://user:pass@api.openai.com/v1/responses",
  "scripts/verify-desktop-wrapper.cjs must verify credential-bearing OpenAI endpoints are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.openai.com:444/v1/responses",
  "scripts/verify-desktop-wrapper.cjs must verify alternate OpenAI endpoint ports are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.openai.com/v1/responses?store=true",
  "scripts/verify-desktop-wrapper.cjs must verify OpenAI endpoint query variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.openai.com/v1/models",
  "scripts/verify-desktop-wrapper.cjs must verify non-approved OpenAI endpoints are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.deepseek.com/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify native DeepSeek endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.mistral.ai/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify native Mistral AI endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.x.ai/v1/responses",
  "scripts/verify-desktop-wrapper.cjs must verify native xAI Responses endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.perplexity.ai/v1/sonar",
  "scripts/verify-desktop-wrapper.cjs must verify native Perplexity Sonar endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.perplexity.ai/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Perplexity legacy hosted OpenAI-compatible endpoints remain explicitly allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.groq.com/openai/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Groq hosted OpenAI-compatible endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.together.ai/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Together AI hosted OpenAI-compatible endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://openrouter.ai/api/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify OpenRouter native hosted endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://router.huggingface.co/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Hugging Face native hosted endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.deepinfra.com/v1/openai/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify DeepInfra native hosted endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.fireworks.ai/inference/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Fireworks AI native hosted endpoints are allowed."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.deepseek.com/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify native DeepSeek endpoint variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.mistral.ai/v1/chat/completions?model=mistral-large",
  "scripts/verify-desktop-wrapper.cjs must verify hosted OpenAI-compatible query variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.x.ai/v1/responses?store=true",
  "scripts/verify-desktop-wrapper.cjs must verify xAI Responses query variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.perplexity.ai/v1/chat/completions",
  "scripts/verify-desktop-wrapper.cjs must verify Perplexity unsupported endpoint variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.perplexity.ai/v1/sonar?model=sonar-pro",
  "scripts/verify-desktop-wrapper.cjs must verify Perplexity Sonar query variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://generativelanguage.googleapis.com/v1beta/interactions",
  "scripts/verify-desktop-wrapper.cjs must verify Gemini interactions endpoint access."
);
assertIncludes(
  desktopWrapperScript,
  "https://generativelanguage.googleapis.com/v1beta/interactions?key=gemini-query-key-that-must-not-pass",
  "scripts/verify-desktop-wrapper.cjs must verify Gemini query-string key variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.anthropic.com/v1/messages?x-api-key=anthropic-query-key-that-must-not-pass",
  "scripts/verify-desktop-wrapper.cjs must verify Anthropic query-string key variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://api.cohere.com/v2/chat?key=cohere-query-key-that-must-not-pass",
  "scripts/verify-desktop-wrapper.cjs must verify Cohere query-string key variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://loopcat-test.openai.azure.com/openai/v1/responses?api-version=2024-10-21",
  "scripts/verify-desktop-wrapper.cjs must verify Azure OpenAI query-string variants are denied."
);
assertIncludes(
  desktopWrapperScript,
  "http://localhost:8500/MTRestService/TranslateJson",
  "scripts/verify-desktop-wrapper.cjs must verify OPUS-CAT TranslateJson endpoint access."
);
assertIncludes(
  desktopWrapperScript,
  "http://localhost:8501/MTRestService/TranslateJson",
  "scripts/verify-desktop-wrapper.cjs must verify alternate OPUS-CAT ports are denied."
);
assertIncludes(
  desktopWrapperScript,
  "https://example.com/script.js",
  "scripts/verify-desktop-wrapper.cjs must verify arbitrary external scripts are denied."
);
assertIncludes(
  desktopWrapperScript,
  "createRendererWebPreferences",
  "scripts/verify-desktop-wrapper.cjs must verify desktop renderer web preferences."
);
assertIncludes(
  desktopWrapperScript,
  "Packaged desktop runs must not expose DevTools",
  "scripts/verify-desktop-wrapper.cjs must verify packaged DevTools are disabled."
);
assertIncludes(
  desktopWrapperScript,
  "Desktop renderer must keep webview tags disabled",
  "scripts/verify-desktop-wrapper.cjs must verify desktop webviews are disabled."
);
assertIncludes(
  desktopWrapperScript,
  "Desktop renderer must not navigate when a file is dragged onto the app",
  "scripts/verify-desktop-wrapper.cjs must verify desktop drag-drop navigation is disabled."
);
assertIncludes(
  desktopWrapperScript,
  "test-runner.html",
  "scripts/verify-desktop-wrapper.cjs must verify test files are not exposed through the desktop protocol."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "LOOPCAT_DESKTOP_SMOKE",
  "scripts/verify-packaged-desktop-smoke.cjs must launch packaged apps in desktop smoke mode."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "LOOPCAT_DESKTOP_SMOKE_RESULT_FILE",
  "scripts/verify-packaged-desktop-smoke.cjs must collect smoke results through a result file."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "LOOPCAT_DESKTOP_SMOKE_USER_DATA_DIR",
  "scripts/verify-packaged-desktop-smoke.cjs must run packaged desktop smoke in a temporary profile."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX",
  "scripts/verify-packaged-desktop-smoke.cjs must make the automation-only Chromium no-sandbox launch mode explicit."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "useNoSandboxDiagnostic",
  "scripts/verify-packaged-desktop-smoke.cjs must keep no-sandbox packaged smoke as an explicit diagnostic mode."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "Chromium no-sandbox launch mode",
  "scripts/verify-packaged-desktop-smoke.cjs must report when packaged smoke used Chromium no-sandbox launch mode."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "renderer OS sandbox",
  "scripts/verify-packaged-desktop-smoke.cjs must enforce the renderer OS sandbox during normal packaged smoke."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "hardware acceleration",
  "scripts/verify-packaged-desktop-smoke.cjs must enforce normal GPU acceleration during packaged smoke."
);
assert(
  !packagedDesktopSmokeScript.includes(
    'LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX: process.env.LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX || "1"'
  ),
  "scripts/verify-packaged-desktop-smoke.cjs must not default packaged desktop smoke to no-sandbox mode."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "win-unpacked",
  "scripts/verify-packaged-desktop-smoke.cjs must discover Windows unpacked apps."
);
assertIncludes(
  packagedDesktopSmokeScript,
  'Contents", "MacOS',
  "scripts/verify-packaged-desktop-smoke.cjs must discover macOS app bundle executables."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "linux-unpacked",
  "scripts/verify-packaged-desktop-smoke.cjs must discover Linux unpacked apps."
);
assertIncludes(
  packagedDesktopSmokeScript,
  "Packaged desktop smoke passed",
  "scripts/verify-packaged-desktop-smoke.cjs must report successful packaged app launch."
);
assert(
  packageJson.scripts?.["verify:fuses"] === "node scripts/verify-electron-fuses.cjs",
  "package.json must expose packaged Electron fuse verification."
);
assert(
  typeof packageJson.scripts?.["verify:quality"] === "string",
  "package.json must expose the static and focused quality gate."
);
assert(
  packageJson.scripts?.["verify:a11y"] === "pnpm build:renderer && electron scripts/verify-accessibility.cjs",
  "package.json must expose deterministic automated accessibility verification."
);
assert(
  packageJson.scripts?.["verify:visual"] === "pnpm verify:baseline",
  "package.json must expose deterministic visual-regression verification."
);
assertIncludes(
  electronFusesScript,
  "getCurrentFuseWire",
  "scripts/verify-electron-fuses.cjs must inspect the packaged executable fuse wire."
);
assertIncludes(
  electronFusesScript,
  "EnableEmbeddedAsarIntegrityValidation",
  "scripts/verify-electron-fuses.cjs must verify embedded ASAR integrity."
);
assertIncludes(
  electronFusesScript,
  "OnlyLoadAppFromAsar",
  "scripts/verify-electron-fuses.cjs must verify ASAR-only application loading."
);
assertIncludes(
  desktopArtifactScript,
  "app.asar",
  "scripts/verify-desktop-artifact.cjs must inspect packaged app.asar payloads."
);
assertIncludes(
  desktopArtifactScript,
  "forbiddenPatterns",
  "scripts/verify-desktop-artifact.cjs must reject non-release files from packaged payloads."
);
assertIncludes(
  desktopArtifactScript,
  "security-policy-test",
  "scripts/verify-desktop-artifact.cjs must reject browser test fixtures from packaged payloads."
);
assertIncludes(
  desktopArtifactScript,
  "localAssetsFromIndex(indexHtml)",
  "scripts/verify-desktop-artifact.cjs must derive packaged asset requirements from index.html."
);
assertIncludes(
  desktopArtifactScript,
  "serviceWorkerCoreAssets(serviceWorker)",
  "scripts/verify-desktop-artifact.cjs must verify packaged service-worker cache assets."
);
assertIncludes(
  desktopArtifactScript,
  "desktopProtocolAllowlist(desktopMain, packagedProductionAssets)",
  "scripts/verify-desktop-artifact.cjs must verify packaged desktop protocol assets."
);
assertIncludes(
  desktopArtifactScript,
  "connect-src 'self' https://api.openai.com/v1/responses",
  "scripts/verify-desktop-artifact.cjs must verify packaged CSP network boundaries."
);
assertIncludes(
  desktopArtifactScript,
  "hostedAiOrigins",
  "scripts/verify-desktop-artifact.cjs must verify packaged hosted AI provider CSP origins together."
);
assertIncludes(
  desktopArtifactScript,
  "desktop wrapper does not allow hosted AI provider hosts",
  "scripts/verify-desktop-artifact.cjs must verify packaged desktop hosted AI hosts together."
);
assertIncludes(
  desktopArtifactScript,
  "https://generativelanguage.googleapis.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged Gemini CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.anthropic.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged Anthropic CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.cohere.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged Cohere CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://ollama.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged hosted Ollama CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "http://localhost:8500",
  "scripts/verify-desktop-artifact.cjs must verify packaged OPUS-CAT CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "http://127.0.0.1:8502",
  "scripts/verify-desktop-artifact.cjs must verify packaged OPUS-CAT web bridge CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://*.openai.azure.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged Azure OpenAI CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://*.services.ai.azure.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged Azure AI Foundry CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.mistral.ai",
  "scripts/verify-desktop-artifact.cjs must verify packaged Mistral AI CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.x.ai",
  "scripts/verify-desktop-artifact.cjs must verify packaged xAI CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.perplexity.ai",
  "scripts/verify-desktop-artifact.cjs must verify packaged Perplexity CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.together.ai",
  "scripts/verify-desktop-artifact.cjs must verify packaged Together AI CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://router.huggingface.co",
  "scripts/verify-desktop-artifact.cjs must verify packaged Hugging Face CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.deepinfra.com",
  "scripts/verify-desktop-artifact.cjs must verify packaged DeepInfra CSP access."
);
assertIncludes(
  desktopArtifactScript,
  "https://api.fireworks.ai",
  "scripts/verify-desktop-artifact.cjs must verify packaged Fireworks AI CSP access."
);
assertIncludes(
  desktopArtifactScript,
  'createHash("sha256")',
  "scripts/verify-desktop-artifact.cjs must verify asar file integrity metadata."
);
assertIncludes(
  desktopArtifactScript,
  "sourceMirrorFiles",
  "scripts/verify-desktop-artifact.cjs must compare packaged source-mirrored files against the current source tree."
);
assertIncludes(
  desktopArtifactScript,
  "does not match current source file",
  "scripts/verify-desktop-artifact.cjs must reject stale desktop artifacts that do not match current bundled source files."
);
assertIncludes(
  downloadArtifactsScript,
  "Windows NSIS installer",
  "scripts/verify-download-artifacts.cjs must require Windows installer artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "Windows portable executable",
  "scripts/verify-download-artifacts.cjs must require Windows portable artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "macOS DMG",
  "scripts/verify-download-artifacts.cjs must require macOS DMG artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "macOS ZIP",
  "scripts/verify-download-artifacts.cjs must require macOS ZIP artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "Linux AppImage",
  "scripts/verify-download-artifacts.cjs must require Linux AppImage artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "Linux DEB",
  "scripts/verify-download-artifacts.cjs must require Linux DEB artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "const platformsToVerify = allPlatforms ? Object.keys(artifactRules) : [normalizedPlatform];",
  "scripts/verify-download-artifacts.cjs must support final all-platform bundle verification."
);
assertIncludes(
  downloadArtifactsScript,
  "exactFile(`${productName} Setup",
  "scripts/verify-download-artifacts.cjs must require the expected Windows installer filename."
);
assertIncludes(
  downloadArtifactsScript,
  "exactFile(`${productName} ${packageJson.version}.exe`)",
  "scripts/verify-download-artifacts.cjs must require the expected Windows portable filename."
);
assertIncludes(
  downloadArtifactsScript,
  'productVersionFile("AppImage")',
  "scripts/verify-download-artifacts.cjs must require the expected Linux AppImage filename pattern."
);
assertIncludes(
  downloadArtifactsScript,
  "debFile()",
  "scripts/verify-download-artifacts.cjs must require the expected Linux DEB filename pattern."
);
assertIncludes(
  downloadArtifactsScript,
  "has multiple matching artifacts",
  "scripts/verify-download-artifacts.cjs must reject duplicate public artifacts for the same platform format."
);
assertIncludes(
  downloadArtifactsScript,
  "isExpectedPublicDownloadArtifact",
  "scripts/verify-download-artifacts.cjs must reject unexpected public download artifact filenames."
);
assertIncludes(
  downloadArtifactsScript,
  "source|src|symbols|debug",
  "scripts/verify-download-artifacts.cjs must reject source, symbol, and debug archives as public desktop downloads."
);
assertIncludes(
  downloadArtifactsScript,
  "MIN_PUBLIC_DOWNLOAD_BYTES",
  "scripts/verify-download-artifacts.cjs must reject truncated public download artifacts."
);
assertIncludes(
  downloadArtifactsScript,
  "minimum public download size",
  "scripts/verify-download-artifacts.cjs must report undersized public download artifacts clearly."
);
assertIncludes(
  downloadArtifactsScript,
  "artifact.name.includes(version)",
  "scripts/verify-download-artifacts.cjs must require artifact filenames to include the package version."
);
assertIncludes(
  downloadArtifactsScript,
  "isDownloadCandidate",
  "scripts/verify-download-artifacts.cjs must ignore unpacked app folders and blockmap/debug sidecars."
);
assertIncludes(
  platformSignaturesScript,
  "Get-AuthenticodeSignature",
  "scripts/verify-platform-signatures.cjs must verify Windows Authenticode signatures."
);
assertIncludes(
  platformSignaturesScript,
  "function expectedPlatformArtifacts(platformName)",
  "scripts/verify-platform-signatures.cjs must select strict expected public artifacts before signature checks."
);
assertIncludes(
  platformSignaturesScript,
  "exactFile(`${productName} Setup",
  "scripts/verify-platform-signatures.cjs must require the expected Windows installer filename before signature checks."
);
assertIncludes(
  platformSignaturesScript,
  "exactFile(`${productName} ${packageJson.version}.exe`)",
  "scripts/verify-platform-signatures.cjs must require the expected Windows portable filename before signature checks."
);
assertIncludes(
  platformSignaturesScript,
  'productVersionFile("dmg")',
  "scripts/verify-platform-signatures.cjs must require expected macOS DMG filenames before notarization checks."
);
assertIncludes(
  platformSignaturesScript,
  'productVersionFile("AppImage")',
  "scripts/verify-platform-signatures.cjs must require expected Linux AppImage filenames before checksum-authenticity checks."
);
assertIncludes(
  platformSignaturesScript,
  "isDisallowedPublicArtifactName",
  "scripts/verify-platform-signatures.cjs must reject source, symbol, and debug archives before signature checks."
);
assertIncludes(
  platformSignaturesScript,
  "is not an expected",
  "scripts/verify-platform-signatures.cjs must reject unexpected public artifact names for the selected platform."
);
assertIncludes(
  platformSignaturesScript,
  "has multiple matching artifacts",
  "scripts/verify-platform-signatures.cjs must reject duplicate public artifacts for signature checks."
);
assertIncludes(
  platformSignaturesScript,
  "--artifact-selection-only",
  "scripts/verify-platform-signatures.cjs must expose a self-test-only artifact selection mode."
);
assertIncludes(
  platformSignaturesScript,
  "if ($status -eq 'NotSigned')",
  "scripts/verify-platform-signatures.cjs must normalize unsigned Windows Authenticode failures before reporting them."
);
assertIncludes(
  platformSignaturesScript,
  "file is not digitally signed",
  "scripts/verify-platform-signatures.cjs must report unsigned Windows artifacts without PowerShell execution-policy boilerplate."
);
assertIncludes(
  platformSignaturesScript,
  "Authenticode status $status",
  "scripts/verify-platform-signatures.cjs must report non-valid Windows Authenticode statuses without PowerShell stack traces."
);
assertIncludes(
  platformSignaturesScript,
  "[Console]::Error.WriteLine",
  "scripts/verify-platform-signatures.cjs must write concise PowerShell signature failures without throwing."
);
assert(
  !platformSignaturesScript.includes('throw "Authenticode status'),
  "scripts/verify-platform-signatures.cjs must not throw PowerShell Authenticode status failures."
);
assert(
  !platformSignaturesScript.includes("You cannot run this script"),
  "scripts/verify-platform-signatures.cjs must not include PowerShell execution-policy boilerplate in Authenticode failures."
);
assertIncludes(
  platformSignaturesScript,
  "Developer ID Application",
  "scripts/verify-platform-signatures.cjs must require macOS Developer ID signing."
);
assertIncludes(
  platformSignaturesScript,
  'xcrun", ["stapler", "validate"',
  "scripts/verify-platform-signatures.cjs must validate stapled macOS notarization tickets."
);
assertIncludes(
  platformSignaturesScript,
  'spctl", ["--assess"',
  "scripts/verify-platform-signatures.cjs must run macOS Gatekeeper assessments."
);
assertIncludes(
  platformSignaturesScript,
  'ditto", ["-x", "-k"',
  "scripts/verify-platform-signatures.cjs must inspect the app bundle inside macOS ZIP artifacts."
);
assertIncludes(
  platformSignaturesScript,
  "Linux public-release authenticity is checksum-based",
  "scripts/verify-platform-signatures.cjs must document Linux checksum-based authenticity."
);
assertIncludes(
  checksumScript,
  'crypto.createHash("sha256")',
  "scripts/generate-checksums.cjs must generate SHA-256 checksums."
);
assertIncludes(checksumScript, "SHA256SUMS.txt", "scripts/generate-checksums.cjs must write SHA256SUMS.txt.");
assertIncludes(
  checksumScript,
  'args.indexOf("--dist")',
  "scripts/generate-checksums.cjs must support generating checksums for a collected release folder."
);
assertIncludes(checksumScript, "path.relative(distDir", "scripts/generate-checksums.cjs must use dist-relative paths.");
assertIncludes(
  checksumScript,
  "isPublicDownloadArtifact",
  "scripts/generate-checksums.cjs must checksum public download artifacts only."
);
assertIncludes(
  checksumScript,
  "isExpectedPublicDownloadArtifact",
  "scripts/generate-checksums.cjs must checksum only expected LoopCAT public download artifact filenames."
);
assertIncludes(
  checksumScript,
  "removeNestedChecksumSidecars",
  "scripts/generate-checksums.cjs must remove nested platform checksum sidecars before writing combined release checksums."
);
assertIncludes(
  checksumScript,
  "unexpected public download artifact filenames",
  "scripts/generate-checksums.cjs must reject unexpected desktop-like public artifact filenames."
);
assertIncludes(
  checksumScript,
  "source|src|symbols|debug",
  "scripts/generate-checksums.cjs must reject source, symbol, and debug archives as public desktop downloads."
);
assertIncludes(
  checksumScript,
  "public download artifact checksum",
  "scripts/generate-checksums.cjs must report public download artifact checksum scope."
);
assertIncludes(
  checksumScript,
  "hasCurrentVersionInFilename",
  "scripts/generate-checksums.cjs must reject stale public artifacts whose filenames do not include the current package version."
);
assertIncludes(
  checksumScript,
  "filenames do not include package.json version",
  "scripts/generate-checksums.cjs must report stale public artifact filenames before writing checksums."
);
assertIncludes(
  checksumScript,
  "MIN_PUBLIC_DOWNLOAD_BYTES",
  "scripts/generate-checksums.cjs must reject truncated public downloads before writing checksums."
);
assertIncludes(
  checksumScript,
  "minimum public download size",
  "scripts/generate-checksums.cjs must report undersized public downloads clearly."
);
assertIncludes(checksumVerifyScript, "SHA256SUMS.txt", "scripts/verify-checksums.cjs must verify SHA256SUMS.txt.");
assertIncludes(
  checksumVerifyScript,
  'args.indexOf("--dist")',
  "scripts/verify-checksums.cjs must support verifying checksums for a collected release folder."
);
assertIncludes(
  checksumVerifyScript,
  "checksum does not match",
  "scripts/verify-checksums.cjs must reject mismatched checksum entries."
);
assertIncludes(
  checksumVerifyScript,
  "missing artifact",
  "scripts/verify-checksums.cjs must reject stale checksum entries."
);
assertIncludes(
  checksumVerifyScript,
  "isPublicDownloadArtifact",
  "scripts/verify-checksums.cjs must verify public download artifact checksums only."
);
assertIncludes(
  checksumVerifyScript,
  "isExpectedPublicDownloadArtifactName",
  "scripts/verify-checksums.cjs must verify only expected LoopCAT public download artifact filenames."
);
assertIncludes(
  checksumVerifyScript,
  "Nested checksum sidecar",
  "scripts/verify-checksums.cjs must reject nested platform checksum sidecars in publishable release bundles."
);
assertIncludes(
  checksumVerifyScript,
  "unexpected public download artifact filename",
  "scripts/verify-checksums.cjs must reject unexpected public artifact filenames in dist or checksum entries."
);
assertIncludes(
  checksumScript,
  "duplicate public download artifact filenames",
  "scripts/generate-checksums.cjs must reject duplicate public artifact filenames before writing checksums."
);
assertIncludes(
  checksumVerifyScript,
  "Duplicate public download artifact filename",
  "scripts/verify-checksums.cjs must reject duplicate public artifact filenames during checksum verification."
);
assertIncludes(
  checksumVerifyScript,
  "no public download artifacts",
  "scripts/verify-checksums.cjs must fail if there are no public download artifacts to verify."
);
assertIncludes(
  checksumVerifyScript,
  "hasCurrentVersionInFilename",
  "scripts/verify-checksums.cjs must reject public artifacts and checksum entries without the current package version in their filenames."
);
assertIncludes(
  checksumVerifyScript,
  "references an artifact filename without package.json version",
  "scripts/verify-checksums.cjs must reject stale-version checksum entries."
);
assertIncludes(
  checksumVerifyScript,
  "MIN_PUBLIC_DOWNLOAD_BYTES",
  "scripts/verify-checksums.cjs must reject truncated public downloads even when checksum entries exist."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "unexpected-source-zip",
  "scripts/verify-download-artifacts-selftest.cjs must exercise unexpected source ZIP rejection."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "duplicate-portable",
  "scripts/verify-download-artifacts-selftest.cjs must exercise duplicate public artifact rejection."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "truncated-installer",
  "scripts/verify-download-artifacts-selftest.cjs must exercise truncated public installer rejection."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "unexpected-checksum-entry",
  "scripts/verify-download-artifacts-selftest.cjs must exercise unexpected checksum entry rejection."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "nested-platform-checksum-sidecar",
  "scripts/verify-download-artifacts-selftest.cjs must exercise nested platform checksum sidecar cleanup."
);
assertIncludes(
  downloadArtifactsSelfTestScript,
  "Download artifact rule self-test passed",
  "scripts/verify-download-artifacts-selftest.cjs must report a clear passing result."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "unexpected-win-exe",
  "scripts/verify-platform-signatures-selftest.cjs must exercise unexpected Windows EXE rejection."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "unexpected-mac-zip",
  "scripts/verify-platform-signatures-selftest.cjs must exercise unexpected macOS ZIP rejection."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "unexpected-linux-appimage",
  "scripts/verify-platform-signatures-selftest.cjs must exercise unexpected Linux AppImage rejection."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "duplicate-platform-artifact",
  "scripts/verify-platform-signatures-selftest.cjs must exercise duplicate platform artifact rejection."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "Windows unsigned Authenticode normalization",
  "scripts/verify-platform-signatures-selftest.cjs must pin concise Windows unsigned-signature failure reporting."
);
assertIncludes(
  platformSignaturesSelfTestScript,
  "Platform signature artifact rule self-test passed",
  "scripts/verify-platform-signatures-selftest.cjs must report a clear passing result."
);
assertIncludes(
  releaseEvidenceScript,
  "Release evidence verification failed",
  "scripts/verify-release-evidence.cjs must fail incomplete completed evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "package.json version",
  "scripts/verify-release-evidence.cjs must require completed evidence to match the package.json version."
);
assertIncludes(
  releaseEvidenceScript,
  "concrete commit SHA",
  "scripts/verify-release-evidence.cjs must require completed evidence to identify a concrete commit or matching release tag."
);
assertIncludes(
  releaseEvidenceScript,
  "versioned artifact source",
  "scripts/verify-release-evidence.cjs must require completed evidence to identify the versioned artifact source."
);
assertIncludes(
  releaseEvidenceScript,
  "YYYY-MM-DD",
  "scripts/verify-release-evidence.cjs must require completed evidence to use an ISO release date."
);
assertIncludes(
  releaseEvidenceScript,
  "must not be in the future",
  "scripts/verify-release-evidence.cjs must reject future-dated release evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "sensitivePatterns",
  "scripts/verify-release-evidence.cjs must scan completed evidence for private release details."
);
assertIncludes(
  releaseEvidenceScript,
  "releaseBlockingResidualRiskPatterns",
  "scripts/verify-release-evidence.cjs must reject publishable evidence that accepts release-blocking residual risks."
);
assertIncludes(
  releaseEvidenceScript,
  "choicePlaceholderPatterns",
  "scripts/verify-release-evidence.cjs must reject unreplaced pass/fail placeholders."
);
assertIncludes(
  releaseEvidenceScript,
  "Ship / do not ship",
  "scripts/verify-release-evidence.cjs must validate the final ship decision."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "verify-release-evidence.cjs",
  "scripts/verify-release-evidence-selftest.cjs must execute the real release evidence verifier."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "complete publishable evidence",
  "scripts/verify-release-evidence-selftest.cjs must cover a passing completed evidence record."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "placeholder evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify placeholder evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "failed signing evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify failed signing evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "failed artifact launch evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify failed per-artifact launch evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "not-applicable notarization evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify not-applicable notarization evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "online-mode evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify non-offline evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "version-mismatch evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify mismatched release versions are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "commit-placeholder evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify vague commit/tag evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "tag-version-mismatch evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify mismatched release tags are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-source-version-missing evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify unversioned artifact-source evidence is rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "bad-date evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify invalid release dates are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "future-date evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify future release dates are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "required-follow-up evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify ship decisions with required pre-ship follow-up are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "blocking residual risk evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify ship decisions with release-blocking residual risks are rejected."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "secret-bearing evidence",
  "scripts/verify-release-evidence-selftest.cjs must verify secret-bearing evidence is rejected."
);
assertIncludes(
  desktopWorkflow,
  "pnpm/action-setup@v4",
  "Desktop release workflow must install the pinned pnpm toolchain."
);
assertIncludes(
  desktopWorkflow,
  "pnpm install --frozen-lockfile",
  "Desktop release workflow must use the pnpm lockfile for deterministic dependency installs."
);
assertIncludes(
  desktopWorkflow,
  "Install Linux packaging dependencies",
  "Desktop release workflow must prepare Linux packaging dependencies before Linux artifact builds."
);
assertIncludes(
  desktopWorkflow,
  "sudo apt-get install -y xvfb ruby ruby-dev build-essential rpm libarchive-tools",
  "Desktop release workflow must install Linux packaging and xvfb dependencies."
);
assertIncludes(
  desktopWorkflow,
  "sudo apt-get install -y libfuse2 || sudo apt-get install -y libfuse2t64",
  "Desktop release workflow must install the available libfuse2 package for AppImage checks."
);
assertIncludes(
  desktopWorkflow,
  "sudo gem install --no-document fpm",
  "Desktop release workflow must install fpm for Linux DEB packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:release",
  "Desktop release workflow must verify the release contract through pnpm."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:xliff22-schema",
  "Desktop release workflow must validate XLIFF 2.2 fixtures against the vendored OASIS schema."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:provenance-selftest",
  "Desktop release workflow must self-test release provenance validation before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:evidence-selftest",
  "Desktop release workflow must self-test release evidence validation before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:download-artifacts-selftest",
  "Desktop release workflow must self-test download artifact naming and checksum rules before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:platform-signatures-selftest",
  "Desktop release workflow must self-test platform signature artifact rules before packaging."
);
assertIncludes(desktopWorkflow, "web:", "Desktop release workflow must include a separate static HTML artifact job.");
assertIncludes(
  desktopWorkflow,
  "Build static HTML artifact",
  "Desktop release workflow must build the static HTML distribution separately from desktop artifacts."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run dist:web",
  "Desktop release workflow must build the static HTML distribution artifact."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:web-artifact",
  "Desktop release workflow must verify the static HTML distribution artifact before upload."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:web-smoke",
  "Desktop release workflow must render-smoke the static HTML distribution artifact before upload."
);
assertIncludes(
  desktopWorkflow,
  "name: Static-Web-Bundle",
  "Desktop release workflow must upload the static HTML artifact under a non-LoopCAT-* artifact name."
);
assertIncludes(
  desktopWorkflow,
  "dist-web/*.zip",
  "Desktop release workflow must upload the static HTML ZIP from dist-web."
);
assertIncludes(
  desktopWorkflow,
  "dist-web/SHA256SUMS.txt",
  "Desktop release workflow must upload static HTML checksums with the static web artifact."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:browser-runner",
  "Desktop release workflow must run the browser test suite before packaging."
);
assertIncludes(
  desktopWorkflow,
  "xvfb-run -a pnpm run verify:browser-runner",
  "Desktop release workflow must run browser tests under xvfb on Linux."
);
assertIncludes(
  desktopWorkflow,
  "desktopSmokeCommand: pnpm run verify:desktop-smoke",
  "Desktop release workflow must run packaged desktop smoke on Windows and macOS."
);
assertIncludes(
  desktopWorkflow,
  "desktopSmokeCommand: xvfb-run -a pnpm run verify:desktop-smoke",
  "Desktop release workflow must run packaged desktop smoke under xvfb on Linux."
);
assertIncludes(
  desktopWorkflow,
  "downloadArtifactCommand: pnpm run verify:download-artifacts -- win",
  "Desktop release workflow must verify Windows download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "downloadArtifactCommand: pnpm run verify:download-artifacts -- mac",
  "Desktop release workflow must verify macOS download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "downloadArtifactCommand: pnpm run verify:download-artifacts -- linux",
  "Desktop release workflow must verify Linux download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "release-bundle:",
  "Desktop release workflow must include a final all-platform release bundle verification job."
);
assertIncludes(
  desktopWorkflow,
  "needs: [build, web]",
  "Desktop release bundle job must run only after all platform builds and the static HTML build finish."
);
assertIncludes(
  desktopWorkflow,
  "actions/download-artifact@v4",
  "Desktop release bundle job must download platform build artifacts."
);
assertIncludes(
  desktopWorkflow,
  "pattern: LoopCAT-*",
  "Desktop release bundle job must keep downloading only LoopCAT-* desktop artifacts."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:download-bundle -- --dist release-dist",
  "Desktop release bundle job must verify all platform download artifacts together."
);
assertIncludes(
  desktopWorkflow,
  "node scripts/generate-checksums.cjs --dist release-dist",
  "Desktop release bundle job must generate combined public checksums."
);
assertIncludes(
  desktopWorkflow,
  "node scripts/verify-checksums.cjs --dist release-dist",
  "Desktop release bundle job must verify combined public checksums."
);
assertIncludes(
  desktopWorkflow,
  "LoopCAT-All-Platforms",
  "Desktop release workflow must upload a verified all-platform release bundle."
);
assertIncludes(
  desktopWorkflow,
  "platformSignatureCommand: pnpm run verify:platform-signatures -- win",
  "Desktop release workflow must verify Windows artifact signatures."
);
assertIncludes(
  desktopWorkflow,
  "platformSignatureCommand: pnpm run verify:platform-signatures -- mac",
  "Desktop release workflow must verify macOS signing and notarization."
);
assertIncludes(
  desktopWorkflow,
  "platformSignatureCommand: pnpm run verify:platform-signatures -- linux",
  "Desktop release workflow must verify Linux release authenticity expectations."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:desktop-wrapper",
  "Desktop release workflow must verify the desktop protocol wrapper before packaging."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:signing-env -- ${{ matrix.signingPlatform }}",
  "Desktop release workflow must verify platform signing inputs before packaging."
);
assertIncludes(
  desktopWorkflow,
  "CSC_LINK: ${{ secrets.CSC_LINK }}",
  "Desktop release workflow must pass standard Electron Builder certificate secrets."
);
assertIncludes(
  desktopWorkflow,
  "WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}",
  "Desktop release workflow must pass Windows-specific certificate secrets."
);
assertIncludes(
  desktopWorkflow,
  "APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}",
  "Desktop release workflow must pass App Store Connect API-key notarization secrets."
);
assertIncludes(
  desktopWorkflow,
  "APPLE_ID: ${{ secrets.APPLE_ID }}",
  "Desktop release workflow must pass Apple ID notarization secrets."
);
assertIncludes(
  desktopWorkflow,
  "APPLE_KEYCHAIN: ${{ secrets.APPLE_KEYCHAIN }}",
  "Desktop release workflow must pass keychain-profile notarization secrets."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:artifact",
  "Desktop release workflow must verify packaged desktop payloads before checksum generation."
);
assertIncludes(
  desktopWorkflow,
  "${{ matrix.downloadArtifactCommand }}",
  "Desktop release workflow must run the platform download artifact verifier."
);
assertIncludes(
  desktopWorkflow,
  "${{ matrix.platformSignatureCommand }}",
  "Desktop release workflow must run the platform signature/notarization verifier."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run checksums",
  "Desktop release workflow must generate checksums before upload."
);
assertIncludes(
  desktopWorkflow,
  "pnpm run verify:checksums",
  "Desktop release workflow must verify generated checksums before upload."
);
assertIncludes(
  desktopWorkflow,
  "uploadPath",
  "Desktop release workflow must upload only explicit public artifact paths."
);
assertIncludes(
  desktopWorkflow,
  "dist/*.exe",
  "Desktop release workflow must upload Windows public download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "dist/*.dmg",
  "Desktop release workflow must upload macOS DMG public download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "dist/*.zip",
  "Desktop release workflow must upload macOS ZIP public download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "dist/*.AppImage",
  "Desktop release workflow must upload Linux AppImage public download artifacts."
);
assertIncludes(
  desktopWorkflow,
  "dist/*.deb",
  "Desktop release workflow must upload Linux DEB public download artifacts."
);
assert(
  !desktopWorkflow.includes("path: dist/**"),
  "Desktop release workflow must not upload unpacked app folders or builder debug files."
);
assert(
  !desktopWorkflow.includes("name: LoopCAT-Web"),
  "Static web workflow artifact must not use a LoopCAT-* name that the desktop bundle downloader would collect."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:artifact") > desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must verify artifacts after artifact build."
);
assert(
  desktopWorkflow.indexOf("pnpm run dist:web") > desktopWorkflow.indexOf("web:"),
  "Desktop release workflow must build static HTML inside the web job."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:web-artifact") > desktopWorkflow.indexOf("pnpm run dist:web"),
  "Desktop release workflow must verify static HTML after building it."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:web-smoke") > desktopWorkflow.indexOf("pnpm run verify:web-artifact"),
  "Desktop release workflow must render-smoke static HTML after artifact verification."
);
assert(
  desktopWorkflow.indexOf("name: Static-Web-Bundle") > desktopWorkflow.indexOf("pnpm run verify:web-smoke"),
  "Desktop release workflow must upload the static HTML artifact after render smoke."
);
assert(
  desktopWorkflow.indexOf("pattern: LoopCAT-*") > desktopWorkflow.indexOf("name: Static-Web-Bundle"),
  "Desktop release bundle job must download desktop artifacts after the separate web artifact upload block."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:provenance-selftest") > desktopWorkflow.indexOf("pnpm run verify:release"),
  "Desktop release workflow must self-test provenance validation after the release contract check."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:provenance-selftest") <
    desktopWorkflow.indexOf("${{ matrix.browserCommand }}"),
  "Desktop release workflow must self-test provenance validation before browser tests and packaging."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:evidence-selftest") >
    desktopWorkflow.indexOf("pnpm run verify:provenance-selftest"),
  "Desktop release workflow must self-test evidence validation after provenance self-tests."
);
assert(
  desktopWorkflow.indexOf("Install Linux packaging dependencies") >
    desktopWorkflow.indexOf("pnpm install --frozen-lockfile"),
  "Desktop release workflow must install Linux packaging dependencies after project dependencies are installed."
);
assert(
  desktopWorkflow.indexOf("Install Linux packaging dependencies") < desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must install Linux packaging dependencies before artifact builds."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:evidence-selftest") <
    desktopWorkflow.indexOf("${{ matrix.browserCommand }}"),
  "Desktop release workflow must self-test evidence validation before browser tests and packaging."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:download-artifacts-selftest") >
    desktopWorkflow.indexOf("pnpm run verify:evidence-selftest"),
  "Desktop release workflow must self-test download artifact rules after evidence self-tests."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:download-artifacts-selftest") <
    desktopWorkflow.indexOf("${{ matrix.browserCommand }}"),
  "Desktop release workflow must self-test download artifact rules before browser tests and packaging."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:platform-signatures-selftest") >
    desktopWorkflow.indexOf("pnpm run verify:download-artifacts-selftest"),
  "Desktop release workflow must self-test platform signature artifact rules after download artifact self-tests."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:platform-signatures-selftest") <
    desktopWorkflow.indexOf("${{ matrix.browserCommand }}"),
  "Desktop release workflow must self-test platform signature artifact rules before browser tests and packaging."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:signing-env-selftest") >
    desktopWorkflow.indexOf("pnpm run verify:platform-signatures-selftest"),
  "Desktop release workflow must self-test signing environment verification after platform signature self-tests."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:signing-env-selftest") <
    desktopWorkflow.indexOf("${{ matrix.browserCommand }}"),
  "Desktop release workflow must self-test signing environment verification before browser tests and packaging."
);
assert(
  !desktopWorkflow.includes("--artifact-selection-only"),
  "Desktop release workflow must run real platform signature checks, not artifact-selection-only mode."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.browserCommand }}") > desktopWorkflow.indexOf("pnpm run verify:release"),
  "Desktop release workflow must run browser tests after the release contract check."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.browserCommand }}") < desktopWorkflow.indexOf("pnpm run verify:desktop-wrapper"),
  "Desktop release workflow must run browser tests before desktop wrapper verification."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:desktop-wrapper") > desktopWorkflow.indexOf("pnpm run verify:release"),
  "Desktop release workflow must verify the desktop wrapper after the release contract check."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:desktop-wrapper") < desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must verify the desktop wrapper before artifact build."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:signing-env -- ${{ matrix.signingPlatform }}") >
    desktopWorkflow.indexOf("pnpm run verify:desktop-wrapper"),
  "Desktop release workflow must verify signing inputs after the desktop wrapper check."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:signing-env -- ${{ matrix.signingPlatform }}") <
    desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must verify signing inputs before artifact build."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.desktopSmokeCommand }}") > desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must run packaged desktop smoke after artifact build."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.desktopSmokeCommand }}") < desktopWorkflow.indexOf("pnpm run verify:artifact"),
  "Desktop release workflow must run packaged desktop smoke before static artifact verification."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:artifact") <
    desktopWorkflow.indexOf("${{ matrix.downloadArtifactCommand }}"),
  "Desktop release workflow must verify packaged payloads before checking public download artifacts."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.downloadArtifactCommand }}") <
    desktopWorkflow.indexOf("${{ matrix.platformSignatureCommand }}"),
  "Desktop release workflow must verify public download artifacts before signature/notarization checks."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.platformSignatureCommand }}") < desktopWorkflow.indexOf("pnpm run checksums"),
  "Desktop release workflow must verify signatures/notarization before checksum generation."
);
assert(
  desktopWorkflow.indexOf("${{ matrix.downloadArtifactCommand }}") < desktopWorkflow.indexOf("pnpm run checksums"),
  "Desktop release workflow must verify public download artifacts before checksum generation."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:artifact") < desktopWorkflow.indexOf("pnpm run checksums"),
  "Desktop release workflow must verify artifacts before checksum generation."
);
assert(
  desktopWorkflow.indexOf("pnpm run checksums") > desktopWorkflow.indexOf("${{ matrix.command }}"),
  "Desktop release workflow must generate checksums after artifact build."
);
assert(
  desktopWorkflow.indexOf("pnpm run checksums") < desktopWorkflow.indexOf("actions/upload-artifact@v4"),
  "Desktop release workflow must generate checksums before artifact upload."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:checksums") > desktopWorkflow.indexOf("pnpm run checksums"),
  "Desktop release workflow must verify checksums after checksum generation."
);
assert(
  desktopWorkflow.indexOf("pnpm run verify:checksums") < desktopWorkflow.indexOf("actions/upload-artifact@v4"),
  "Desktop release workflow must verify checksums before artifact upload."
);

assertIncludes(
  desktopPackagingDocs,
  "docs/release-smoke-evidence-template.md",
  "Desktop packaging docs must reference the release smoke evidence template."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:evidence",
  "Desktop packaging docs must document release evidence verification."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:evidence-selftest",
  "Desktop packaging docs must document release evidence verifier self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:provenance-selftest",
  "Desktop packaging docs must document release provenance verifier self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:download-artifacts-selftest",
  "Desktop packaging docs must document download artifact rule self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "unexpected source/debug archives",
  "Desktop packaging docs must state that the download artifact self-test rejects unexpected archives."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:platform-signatures-selftest",
  "Desktop packaging docs must document platform signature artifact rule self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "unexpected source/debug-like public downloads",
  "Desktop packaging docs must state that the platform signature self-test rejects unexpected public downloads."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:signing-env-selftest",
  "Desktop packaging docs must document signing environment verifier self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "secret-bearing evidence",
  "Desktop packaging docs must describe evidence self-test rejection coverage."
);
assertIncludes(
  desktopPackagingDocs,
  "concrete commit SHA",
  "Desktop packaging docs must require concrete release commit/tag identity."
);
assertIncludes(
  desktopPackagingDocs,
  "versioned artifact bundle",
  "Desktop packaging docs must require versioned artifact-source identity."
);
assertIncludes(
  desktopPackagingDocs,
  "sudo gem install --no-document fpm",
  "Desktop packaging docs must document the Linux fpm packaging dependency."
);
assertIncludes(
  desktopPackagingDocs,
  "libfuse2t64",
  "Desktop packaging docs must document Ubuntu libfuse2 package variance for AppImage support."
);
assertIncludes(
  desktopPackagingDocs,
  "workspace build lock",
  "Desktop packaging docs must document the desktop build lock."
);
assertIncludes(
  desktopPackagingDocs,
  "removes Electron Builder debug sidecars",
  "Desktop packaging docs must document post-build debug sidecar cleanup."
);
assertIncludes(
  desktopPackagingDocs,
  "matching operating system",
  "Desktop packaging docs must document platform-specific build host requirements."
);
assertIncludes(
  desktopPackagingDocs,
  "before it cleans `dist/`",
  "Desktop packaging docs must document wrong-host build refusal before dist cleanup."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:browser-runner",
  "Desktop packaging docs must document the automated browser runner verification."
);
assertIncludes(
  desktopPackagingDocs,
  "hardware acceleration enabled",
  "Desktop packaging docs must document the normal GPU-enabled launch policy."
);
assertIncludes(
  desktopPackagingDocs,
  "sandboxed on every platform",
  "Desktop packaging docs must document the universal renderer sandbox policy."
);
assertIncludes(
  desktopPackagingDocs,
  "LOOPCAT_DISABLE_HARDWARE_ACCELERATION=1",
  "Desktop packaging docs must document the explicit GPU troubleshooting fallback."
);
assertIncludes(
  desktopPackagingDocs,
  "automation-only Chromium `--no-sandbox` mode",
  "Desktop packaging docs must document the smoke-only no-sandbox launch behavior."
);
assertIncludes(
  desktopPackagingDocs,
  "Packaged desktop smoke is strict by default",
  "Desktop packaging docs must document that packaged smoke remains a normal-launch release gate."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:desktop-wrapper",
  "Desktop packaging docs must document desktop wrapper verification."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:desktop-smoke",
  "Desktop packaging docs must document packaged desktop launch smoke verification."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:download-artifacts",
  "Desktop packaging docs must document public download artifact verification."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:download-bundle",
  "Desktop packaging docs must document final all-platform download bundle verification."
);
assertIncludes(
  desktopPackagingDocs,
  "expected public download files",
  "Desktop packaging docs must state that download verification rejects missing platform artifacts."
);
assertIncludes(
  desktopPackagingDocs,
  "duplicate artifacts make the release download set ambiguous",
  "Desktop packaging docs must state that duplicate public artifacts are rejected."
);
assertIncludes(
  desktopPackagingDocs,
  "unexpected desktop-like public downloads",
  "Desktop packaging docs must state that unexpected public artifact names are rejected."
);
assertIncludes(
  roadmap,
  "expected LoopCAT release names",
  "ROADMAP.md must document strict public download artifact naming."
);
assertIncludes(
  roadmap,
  "platform signature selection rules covered by self-tests",
  "ROADMAP.md must track platform signature artifact selection self-tests."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:platform-signatures",
  "Desktop packaging docs must document platform signature/notarization verification."
);
assertIncludes(
  desktopPackagingDocs,
  "Windows checks Authenticode signatures",
  "Desktop packaging docs must describe Windows signature verification."
);
assertIncludes(
  desktopPackagingDocs,
  "macOS checks Developer ID signing",
  "Desktop packaging docs must describe macOS signing and notarization verification."
);
assertIncludes(
  desktopPackagingDocs,
  "loopcat://app/index.html",
  "Desktop packaging docs must state that packaged smoke verifies the private app-shell URL."
);
assertIncludes(
  desktopPackagingDocs,
  "IndexedDB",
  "Desktop packaging docs must state that packaged smoke verifies local persistence."
);
assertIncludes(
  desktopPackagingDocs,
  "real project/segment data",
  "Desktop packaging docs must state that packaged smoke verifies project and segment persistence."
);
assertIncludes(
  desktopPackagingDocs,
  "serves packaged app-shell assets through the private protocol",
  "Desktop packaging docs must state that packaged smoke verifies offline desktop app-shell assets."
);
assertIncludes(
  desktopPackagingDocs,
  "keeps service workers disabled on the private desktop protocol",
  "Desktop packaging docs must state that packaged desktop offline use does not rely on service workers."
);
assertIncludes(
  desktopPackagingDocs,
  "pnpm run verify:signing-env",
  "Desktop packaging docs must document signing environment verification."
);
assertIncludes(
  desktopPackagingDocs,
  "APPLE_API_KEY",
  "Desktop packaging docs must name supported macOS notarization environment variables."
);
assertIncludes(
  desktopPackagingDocs,
  "WIN_CSC_LINK",
  "Desktop packaging docs must name Windows-specific signing environment variables."
);
assertIncludes(desktopPackagingDocs, "pnpm run checksums", "Desktop packaging docs must document checksum generation.");
assertIncludes(desktopPackagingDocs, "SHA256SUMS.txt", "Desktop packaging docs must name the checksum output file.");
assertIncludes(
  desktopPackagingDocs,
  "--checksum-file dist/SHA256SUMS.txt",
  "Desktop packaging docs must require completed release evidence to be compared with the generated checksum file."
);
assertIncludes(
  readme,
  "--checksum-file dist/SHA256SUMS.txt",
  "README.md must document checksum-file comparison for completed release evidence."
);
assertIncludes(
  desktopPackagingDocs,
  "Public all-platform release evidence cannot mark Windows signing",
  "Desktop packaging docs must state that public release signing/notarization evidence cannot be marked not applicable."
);
assertIncludes(
  desktopPackagingDocs,
  "separate launch evidence for the Windows installer, Windows portable app, macOS DMG, macOS ZIP, Linux AppImage, and Linux DEB",
  "Desktop packaging docs must require separate launch evidence for each public artifact variant."
);
assertIncludes(
  releaseEvidenceScript,
  '"Windows artifact build"',
  "scripts/verify-release-evidence.cjs must require Windows artifact build evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Platform downloadable artifacts verified"',
  "scripts/verify-release-evidence.cjs must require downloadable artifact verification evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"All-platform download bundle verified"',
  "scripts/verify-release-evidence.cjs must require final all-platform download bundle verification evidence."
);
assertIncludes(
  releaseSmokeTemplate,
  "All-platform download bundle verified",
  "Release smoke evidence template must require final all-platform download bundle verification."
);
assertIncludes(
  releaseEvidenceScript,
  '"Platform signatures and notarization verified"',
  "scripts/verify-release-evidence.cjs must require platform signature/notarization verification evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "`pnpm run verify:browser-runner`",
  "scripts/verify-release-evidence.cjs must require automated browser-runner evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Platform signing environment verified"',
  "scripts/verify-release-evidence.cjs must require platform signing environment evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Packaged desktop smoke"',
  "scripts/verify-release-evidence.cjs must require packaged desktop smoke evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"macOS artifact build"',
  "scripts/verify-release-evidence.cjs must require macOS artifact build evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Linux artifact build"',
  "scripts/verify-release-evidence.cjs must require Linux artifact build evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Artifact Checksums"',
  "scripts/verify-release-evidence.cjs must require artifact checksum evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "artifactChecksumFields",
  "scripts/verify-release-evidence.cjs must enumerate required artifact checksum fields."
);
assertIncludes(
  releaseEvidenceScript,
  "cleanMachineArtifactChoices",
  "scripts/verify-release-evidence.cjs must require platform smoke evidence to name expected artifact-tested choices."
);
assertIncludes(
  releaseEvidenceScript,
  "requireChoiceField(sections, section, label, choices)",
  "scripts/verify-release-evidence.cjs must reject vague clean-machine artifact-tested entries."
);
assertIncludes(
  releaseEvidenceScript,
  "checksumFilePath",
  "scripts/verify-release-evidence.cjs must support comparing completed evidence against a checksum file."
);
assertIncludes(
  releaseEvidenceScript,
  "must be validated with --checksum-file",
  "scripts/verify-release-evidence.cjs must require completed release evidence to be checked against generated checksums."
);
assertIncludes(
  releaseEvidenceScript,
  "parseChecksumFile",
  "scripts/verify-release-evidence.cjs must parse generated SHA256SUMS.txt files for evidence validation."
);
assertIncludes(
  releaseEvidenceScript,
  "must include a SHA-256 hash",
  "scripts/verify-release-evidence.cjs must reject completed evidence without artifact SHA-256 hashes."
);
assertIncludes(
  releaseEvidenceScript,
  "artifactChecksumPattern(label)",
  "scripts/verify-release-evidence.cjs must validate artifact checksum filenames by artifact kind."
);
assertIncludes(
  releaseEvidenceScript,
  "hash does not match",
  "scripts/verify-release-evidence.cjs must reject evidence hashes that disagree with the generated checksum file."
);
assertIncludes(
  releaseEvidenceScript,
  "repeats a SHA-256 hash",
  "scripts/verify-release-evidence.cjs must reject duplicated artifact checksum values."
);
assertIncludes(
  releaseEvidenceScript,
  "isDisallowedPublicArtifactName",
  "scripts/verify-release-evidence.cjs must reject source, symbol, and debug archives in artifact checksum evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "unsafe path",
  "scripts/verify-release-evidence.cjs must reject unsafe paths in checksum files used for release evidence validation."
);
assertIncludes(
  releaseEvidenceScript,
  "unexpected release artifact",
  "scripts/verify-release-evidence.cjs must reject unexpected checksum-file entries during evidence validation."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-hash-missing",
  "scripts/verify-release-evidence-selftest.cjs must cover missing artifact checksum hashes."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-wrong-kind",
  "scripts/verify-release-evidence-selftest.cjs must cover checksum entries that name the wrong artifact kind."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-source-archive",
  "scripts/verify-release-evidence-selftest.cjs must cover artifact checksum evidence that names source archives."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-file-mismatch",
  "scripts/verify-release-evidence-selftest.cjs must cover checksum-file mismatches."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-file-missing",
  "scripts/verify-release-evidence-selftest.cjs must cover checksum-file entries missing from generated checksums."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-file-unsafe-path",
  "scripts/verify-release-evidence-selftest.cjs must cover unsafe paths in checksum files."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "artifact-checksum-file-unexpected-entry",
  "scripts/verify-release-evidence-selftest.cjs must cover unexpected checksum-file entries."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "missing-checksum-file",
  "scripts/verify-release-evidence-selftest.cjs must cover completed evidence that omits checksum-file comparison."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "duplicate-artifact-checksum",
  "scripts/verify-release-evidence-selftest.cjs must cover duplicate artifact checksum hashes."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "invalid-windows-artifact-tested",
  "scripts/verify-release-evidence-selftest.cjs must cover vague Windows clean-machine artifact-tested evidence."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "invalid-macos-artifact-tested",
  "scripts/verify-release-evidence-selftest.cjs must cover vague macOS clean-machine artifact-tested evidence."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "invalid-linux-artifact-tested",
  "scripts/verify-release-evidence-selftest.cjs must cover vague Linux clean-machine artifact-tested evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "gh[pousr]_",
  "scripts/verify-release-evidence.cjs must reject GitHub token-shaped release evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "npm_",
  "scripts/verify-release-evidence.cjs must reject npm token-shaped release evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "secret assignment",
  "scripts/verify-release-evidence.cjs must reject copied secret assignments in release evidence."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "github-token",
  "scripts/verify-release-evidence-selftest.cjs must cover GitHub token-bearing release evidence."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "npm-token",
  "scripts/verify-release-evidence-selftest.cjs must cover npm token-bearing release evidence."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "secret-assignment",
  "scripts/verify-release-evidence-selftest.cjs must cover copied secret assignments in release evidence."
);
assertIncludes(
  releaseEvidenceScript,
  "[\\\\/]",
  "scripts/verify-release-evidence.cjs must reject Windows private paths written with either slash style."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "windows-forward-slash-path",
  "scripts/verify-release-evidence-selftest.cjs must cover Windows private paths written with forward slashes."
);
assertIncludes(
  releaseEvidenceSelfTestScript,
  "email-address",
  "scripts/verify-release-evidence-selftest.cjs must cover email-bearing release evidence."
);
assertIncludes(
  releaseEvidenceScript,
  'requirePassField(sections, section, label, ["pass"])',
  "scripts/verify-release-evidence.cjs must require signing/notarization checks to pass for publishable evidence."
);
assertIncludes(
  releaseEvidenceScript,
  '"Required follow-up before ship" must be "None"',
  "scripts/verify-release-evidence.cjs must reject publishable evidence that still has required pre-ship follow-up."
);
for (const section of [
  "## Release Candidate",
  "## Automated Gates",
  "## Artifact Checksums",
  "## Windows Clean-Machine Smoke",
  "## macOS Clean-Machine Smoke",
  "## Linux Clean-Machine Smoke",
  "## Storage Failure Evidence",
  "## Signing And Notarization Evidence",
  "## Upgrade And Migration Evidence",
  "## Release Decision"
]) {
  assertIncludes(releaseSmokeTemplate, section, `Release smoke evidence template is missing ${section}.`);
}
for (const requiredSmokeItem of [
  "Imports DOCX",
  "Imports IDML",
  "Imports XLIFF",
  "Imports Markdown",
  "Imports CSV/TSV",
  "Imports Android XML",
  "Imports iOS strings",
  "Exports target DOCX",
  "Exports current localization file",
  "Exports and re-imports project package as copy",
  "Restores browser backup in fresh profile",
  "Blocks delivery export for missing tag fixture",
  "Blocks delivery export for forbidden term fixture",
  "Large project remains usable",
  "Read-only workspace folder reports save failure",
  "`pnpm run verify:browser-runner`",
  "Platform signing environment verified",
  "Packaged desktop smoke",
  "Windows artifact build",
  "macOS artifact build",
  "Linux artifact build",
  "Windows NSIS installer",
  "Windows portable",
  "macOS DMG",
  "macOS ZIP",
  "Linux AppImage",
  "Linux DEB",
  "Platform downloadable artifacts verified",
  "Platform signatures and notarization verified",
  "Windows artifacts signed with Authenticode",
  "Windows NSIS installer launches after download",
  "Windows portable launches after download",
  "macOS artifacts signed with Developer ID Application",
  "macOS artifacts notarized and stapled",
  "macOS DMG launches after download",
  "macOS ZIP launches after download",
  "macOS Gatekeeper launches without override",
  "Linux AppImage launches after download",
  "Linux DEB installs and launches after download",
  "Linux checksums published",
  "Previous release project package imports"
]) {
  assertIncludes(
    releaseSmokeTemplate,
    requiredSmokeItem,
    `Release smoke evidence template is missing required check: ${requiredSmokeItem}.`
  );
}
assert(
  !releaseSmokeTemplate.includes("pass / fail / not applicable"),
  "Release smoke evidence template must not allow signing/notarization checks to be marked not applicable."
);

if (failures.length) {
  console.error("Release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Release verification passed.");
