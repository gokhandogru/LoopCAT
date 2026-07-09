const http = require("node:http");

const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = 8502;
const DEFAULT_OPUS_CAT_BASE_URL = "http://localhost:8500";

const ALLOWED_QUERY_KEYS = new Map([
  ["/mtrestservice/listsupportedlanguagepairs", new Set(["tokenCode"])],
  ["/mtrestservice/getlanguagepairmodeltags", new Set(["tokenCode", "srcLangCode", "trgLangCode"])],
  ["/mtrestservice/translatejson", new Set(["tokenCode", "input", "srcLangCode", "trgLangCode", "modelTag", "inputIsSingleSentence"])]
]);

function normalizedPositiveInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeOpusCatBaseUrl(value = DEFAULT_OPUS_CAT_BASE_URL) {
  const url = new URL(value || DEFAULT_OPUS_CAT_BASE_URL);
  if (url.protocol !== "http:") throw new Error("OPUS-CAT bridge only supports http:// OPUS-CAT endpoints.");
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase())) {
    throw new Error("OPUS-CAT bridge target must stay on localhost.");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/g, "").replace(/\/MTRestService$/i, "") || "/";
  return url;
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    ...extra
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, corsHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify(payload));
}

function requestUrl(request) {
  return new URL(request.url || "/", `http://${request.headers.host || `${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`}`);
}

function validateBridgeRequest(url) {
  const pathname = url.pathname.toLowerCase();
  const allowedKeys = ALLOWED_QUERY_KEYS.get(pathname);
  if (!allowedKeys) return `Unsupported OPUS-CAT bridge path: ${url.pathname}`;
  const keys = Array.from(url.searchParams.keys());
  if (new Set(keys).size !== keys.length) return "Duplicate query parameters are not allowed.";
  const unknownKeys = keys.filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) return `Unsupported query parameter: ${unknownKeys.join(", ")}`;
  return "";
}

function proxyOpusCat(request, response, targetBaseUrl) {
  const sourceUrl = requestUrl(request);
  const validationError = validateBridgeRequest(sourceUrl);
  if (validationError) {
    sendJson(response, 403, { error: validationError });
    return;
  }
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, targetBaseUrl);
  const upstream = http.request(targetUrl, {
    method: "GET",
    headers: {
      Accept: request.headers.accept || "application/json"
    }
  }, (upstreamResponse) => {
    const headers = {
      "Content-Type": upstreamResponse.headers["content-type"] || "application/json; charset=utf-8"
    };
    response.writeHead(upstreamResponse.statusCode || 502, corsHeaders(headers));
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    sendJson(response, 502, {
      error: `OPUS-CAT is not reachable at ${targetBaseUrl.origin}.`,
      detail: error.message
    });
  });
  upstream.end();
}

function startServer() {
  const host = process.env.LOOPCAT_OPUS_CAT_BRIDGE_HOST || DEFAULT_BRIDGE_HOST;
  const port = normalizedPositiveInteger(process.env.LOOPCAT_OPUS_CAT_BRIDGE_PORT, DEFAULT_BRIDGE_PORT, 1, 65535);
  const targetBaseUrl = normalizeOpusCatBaseUrl(process.env.OPUS_CAT_BASE_URL || DEFAULT_OPUS_CAT_BASE_URL);
  const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Only GET and OPTIONS are allowed." });
      return;
    }
    proxyOpusCat(request, response, targetBaseUrl);
  });
  server.listen(port, host, () => {
    console.log(`LoopCAT OPUS-CAT web bridge listening at http://${host}:${port}`);
    console.log(`Forwarding approved OPUS-CAT requests to ${targetBaseUrl.origin}`);
  });
  server.on("error", (error) => {
    console.error(`OPUS-CAT web bridge failed: ${error.message}`);
    process.exit(1);
  });
}

if (require.main === module) startServer();

module.exports = {
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_OPUS_CAT_BASE_URL,
  ALLOWED_QUERY_KEYS,
  normalizeOpusCatBaseUrl,
  validateBridgeRequest,
  corsHeaders
};
