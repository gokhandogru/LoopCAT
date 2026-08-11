const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, ".cache", "renderer");
const productionDir = path.join(outputRoot, "production");
const testDir = path.join(outputRoot, "test");
const testBuildDeclaration = 'const LOOPCAT_TEST_BUILD = window.location.hash === "#app-workflow-test";';
const workflowTestStart = "const runAppWorkflowTest = LOOPCAT_TEST_BUILD ? async function runAppWorkflowTest() {";
const workflowTestEnd = "} : async function runAppWorkflowTestDisabled() {};";
const sourceCatalog = JSON.parse(fs.readFileSync(path.join(root, "i18n", "source.en-US.json"), "utf8"));
const testOnlyMessageKeys = new Set(
  Object.entries(sourceCatalog.messages || {})
    .filter(([, value]) => String(value?.message || value).startsWith("Simulated "))
    .map(([key]) => key)
);

function productionSourcePlugin() {
  return {
    name: "loopcat-production-source",
    setup(build) {
      build.onLoad({ filter: /app\.js$/ }, async (args) => {
        const source = await fs.promises.readFile(args.path, "utf8");
        if (!source.includes(testBuildDeclaration)) {
          throw new Error("app.js is missing the explicit test-build declaration.");
        }
        const testStart = source.indexOf(workflowTestStart);
        const testEnd = source.indexOf(workflowTestEnd, testStart);
        if (testStart === -1 || testEnd === -1) {
          throw new Error("app.js workflow characterization driver boundary is missing.");
        }
        const withoutWorkflowTest = `${source.slice(0, testStart)}${source.slice(testEnd + workflowTestEnd.length)}`;
        return {
          contents: withoutWorkflowTest
            .replace(testBuildDeclaration, "")
            .replace(/\bLOOPCAT_TEST_BUILD\b/g, "false")
            .replace(/^const [A-Z0-9_]+_TEST_FLAG = Symbol\([^\r\n]+\);\r?\n/gm, "")
            .replace(/^const RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS = new Set\(\);\r?\n/m, "")
            .replace(/^\s*await runAppWorkflowTest\(\);\r?\n/m, ""),
          loader: "js"
        };
      });

      build.onLoad({ filter: /i18n[\\/](?:source\.en-US|locales[\\/][^\\/]+)\.js$/ }, async (args) => {
        const sourceFile = args.path.endsWith(`${path.sep}source.en-US.js`);
        const jsonPath = args.path.replace(/\.js$/, ".json");
        const catalog = JSON.parse(await fs.promises.readFile(jsonPath, "utf8"));
        const messages = Object.fromEntries(
          Object.entries(catalog.messages || {})
            .filter(([key]) => !testOnlyMessageKeys.has(key))
            .map(([key, value]) => [key, sourceFile ? String(value?.message || value || "") : value])
        );
        const method = sourceFile ? "registerSource" : "registerLocale";
        return {
          contents: `window.CatHan = window.CatHan || {};\nwindow.CatHan.i18n.${method}(${JSON.stringify({ ...catalog, messages })});\n`,
          loader: "js"
        };
      });
    }
  };
}

function rendererIndex(entryMarkup, baseHref = "") {
  const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const firstScript = '    <script src="./storage.js"></script>';
  const lastScript = '    <script src="./app.js"></script>';
  const start = source.indexOf(firstScript);
  const end = source.indexOf(lastScript, start);
  if (start === -1 || end === -1) throw new Error("Could not find the legacy renderer script block in index.html.");
  const after = end + lastScript.length;
  const withEntry = `${source.slice(0, start)}    ${entryMarkup}${source.slice(after)}`;
  return baseHref ? withEntry.replace("<head>", `<head>\n    <base href="${baseHref}">`) : withEntry;
}

async function buildVariant({
  entry,
  outdir,
  plugins = [],
  minify = false,
  entryNames = "app",
  format = "esm",
  splitting = true
}) {
  fs.mkdirSync(outdir, { recursive: true });
  const result = await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outdir,
    entryNames,
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    format,
    splitting,
    platform: "browser",
    target: ["chrome128"],
    charset: "utf8",
    legalComments: "none",
    sourcemap: false,
    treeShaking: true,
    minify,
    metafile: true,
    plugins,
    logLevel: "silent"
  });
  return result.metafile;
}

function rendererAssets(metafile, outdir) {
  return Object.keys(metafile.outputs || {})
    .map((output) => path.relative(outdir, path.resolve(root, output)).replaceAll("\\", "/"))
    .filter((output) => output && !output.startsWith("../") && output.endsWith(".js"))
    .sort();
}

function generatedProductionAssetsSource(rendererAssetPaths) {
  const base = require(path.join(root, "config", "production-assets.js"));
  const runtimeAssets = [...new Set([...base.runtimeAssets, ...rendererAssetPaths])];
  const offlineAssets = [...new Set([...base.offlineAssets, ...rendererAssetPaths])];
  const webDistributionAssets = [...new Set([...base.webDistributionAssets, ...rendererAssetPaths])];
  const manifest = {
    appVersion: base.appVersion,
    contractVersion: base.contractVersion,
    runtimeAssets,
    offlineAssets,
    webDistributionAssets
  };
  return `(function publishLoopCatProductionAssets(manifest) {
  const frozen = Object.freeze({
    ...manifest,
    runtimeAssets: Object.freeze(manifest.runtimeAssets),
    offlineAssets: Object.freeze(manifest.offlineAssets),
    webDistributionAssets: Object.freeze(manifest.webDistributionAssets)
  });
  if (typeof module === "object" && module?.exports) module.exports = frozen;
  if (typeof self === "object") self.LoopCATProductionAssets = frozen;
})(${JSON.stringify(manifest, null, 2)});\n`;
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  const productionMeta = await buildVariant({
    entry: "src/entry/production.js",
    outdir: productionDir,
    plugins: [productionSourcePlugin()],
    minify: true
  });
  const fileProductionMeta = await buildVariant({
    entry: "src/entry/file-production.js",
    outdir: productionDir,
    plugins: [productionSourcePlugin()],
    minify: true,
    entryNames: "app-file",
    format: "iife",
    splitting: false
  });
  const bootstrapMeta = await buildVariant({
    entry: "src/entry/renderer-bootstrap.js",
    outdir: productionDir,
    minify: true,
    entryNames: "bootstrap",
    format: "iife",
    splitting: false
  });
  const testMeta = await buildVariant({
    entry: "src/entry/test.js",
    outdir: testDir
  });
  const productionAssets = rendererAssets(
    {
      outputs: {
        ...(productionMeta.outputs || {}),
        ...(fileProductionMeta.outputs || {}),
        ...(bootstrapMeta.outputs || {})
      }
    },
    productionDir
  );
  const testAssets = rendererAssets(testMeta, testDir);
  fs.writeFileSync(path.join(productionDir, "index.html"), rendererIndex('<script src="./bootstrap.js"></script>'));
  fs.writeFileSync(
    path.join(productionDir, "desktop-index.html"),
    rendererIndex('<script type="module" src="./app.js"></script>')
  );
  fs.writeFileSync(
    path.join(testDir, "index.html"),
    rendererIndex('<script type="module" src="/renderer-test/app.js"></script>', "/")
  );
  fs.mkdirSync(path.join(productionDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(productionDir, "config", "production-assets.js"),
    generatedProductionAssetsSource(productionAssets)
  );
  fs.writeFileSync(path.join(productionDir, "assets.json"), `${JSON.stringify(productionAssets, null, 2)}\n`);
  fs.writeFileSync(path.join(testDir, "assets.json"), `${JSON.stringify(testAssets, null, 2)}\n`);
  fs.writeFileSync(
    path.join(outputRoot, "metafile.json"),
    JSON.stringify(
      { production: productionMeta, fileProduction: fileProductionMeta, bootstrap: bootstrapMeta, test: testMeta },
      null,
      2
    )
  );
  console.log(`Built production and test renderer entries in ${path.relative(root, outputRoot)}.`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
