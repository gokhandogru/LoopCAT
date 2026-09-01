const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const clientDir = path.join(distDir, "client");
const serverDir = path.join(distDir, "server");

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", scriptName)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
}

function resolveAsset(relativePath, rendererRoot, rendererAssets) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes(":") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe Sites asset path: ${relativePath}`);
  }

  const sourceRoot = rendererAssets.has(normalized) ? rendererRoot : root;
  const sourcePath = path.resolve(sourceRoot, normalized);
  const rootPrefix = `${path.resolve(sourceRoot)}${path.sep}`;
  if (!sourcePath.startsWith(rootPrefix) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Missing Sites asset: ${normalized}`);
  }
  return { normalized, sourcePath };
}

runNodeScript("verify-bundle-contract.cjs");
runNodeScript("i18n-validate.cjs");
runNodeScript("i18n-compile.cjs");
runNodeScript("build-renderer.cjs");
runNodeScript("verify-renderer-build.cjs");

const rendererRoot = path.join(root, ".cache", "renderer", "production");
const manifestPath = path.join(rendererRoot, "config", "production-assets.js");
delete require.cache[require.resolve(manifestPath)];
const { webDistributionAssets } = require(manifestPath);
const rendererAssets = new Set([
  "index.html",
  "config/production-assets.js",
  ...JSON.parse(fs.readFileSync(path.join(rendererRoot, "assets.json"), "utf8"))
]);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(clientDir, { recursive: true });
fs.mkdirSync(serverDir, { recursive: true });

for (const relativePath of webDistributionAssets) {
  const { normalized, sourcePath } = resolveAsset(relativePath, rendererRoot, rendererAssets);
  const destinationPath = path.join(clientDir, ...normalized.split("/"));
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

const workerSource = `const worker = {
  async fetch(request, env) {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("LoopCAT site assets are unavailable.", { status: 503 });
    }

    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === "GET") {
      const url = new URL(request.url);
      if (!pathExtension(url.pathname)) {
        response = await env.ASSETS.fetch(new Request(new URL("/", url), request));
      }
    }
    return withDeploymentMetadata(response, request);
  }
};

function pathExtension(pathname) {
  const finalSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return finalSegment.includes(".");
}

async function withDeploymentMetadata(response, request) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const origin = new URL(request.url).origin;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response((await response.text()).replaceAll("__LOOPCAT_ORIGIN__", origin), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default worker;
`;

fs.writeFileSync(path.join(serverDir, "index.js"), workerSource, "utf8");
fs.writeFileSync(
  path.join(serverDir, "wrangler.json"),
  `${JSON.stringify(
    {
      name: "loopcat",
      main: "index.js",
      compatibility_date: "2026-08-31",
      assets: { directory: "../client", binding: "ASSETS", not_found_handling: "404-page" }
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Wrote Sites deployment output with ${webDistributionAssets.length} static assets.`);
