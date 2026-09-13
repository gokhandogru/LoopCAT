const http = require("node:http");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = 8502;
const DEFAULT_OPUS_CAT_BASE_URL = "http://localhost:8500";
const ALLOWED_QUERY_KEYS = new Map([
  ["/mtrestservice/listsupportedlanguagepairs", new Set(["tokenCode"])],
  ["/mtrestservice/getlanguagepairmodeltags", new Set(["tokenCode", "srcLangCode", "trgLangCode"])],
  ["/mtrestservice/translatejson", new Set(["tokenCode", "input", "srcLangCode", "trgLangCode", "modelTag", "inputIsSingleSentence"])]
]);

function normalizeOpusCatBaseUrl(value = DEFAULT_OPUS_CAT_BASE_URL) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("OPUS-CAT target must be an HTTP loopback endpoint without credentials.");
  url.search = ""; url.hash = ""; url.pathname = "/";
  return url;
}

function validateBridgeRequest(url) {
  const allowed = ALLOWED_QUERY_KEYS.get(url.pathname.toLowerCase());
  if (!allowed) return "Unsupported OPUS-CAT bridge path.";
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return "Duplicate query parameters are not allowed.";
  if (keys.some((key) => !allowed.has(key))) return "Unsupported query parameter.";
  return "";
}

function corsHeaders(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-LoopCAT-Capability", "Cache-Control": "no-store" } : { "Cache-Control": "no-store" };
}

function createBridge({ host = DEFAULT_BRIDGE_HOST, port = DEFAULT_BRIDGE_PORT,
  targetBaseUrl = DEFAULT_OPUS_CAT_BASE_URL, origins = ["http://127.0.0.1:4173", "http://localhost:4173"],
  timeoutMs = 120000, maxRequestBytes = 1024 * 1024, maxResponseBytes = 8 * 1024 * 1024, concurrency = 2 } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("The bridge must bind to loopback.");
  const target = normalizeOpusCatBaseUrl(targetBaseUrl);
  const allowedOrigins = new Set(origins.map((origin) => {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error("Configure exact HTTP/HTTPS origins.");
    return origin;
  }));
  const capability = randomBytes(32).toString("hex");
  let active = 0;
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const actualPort = server.address()?.port || port;
    const hosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`, `[::1]:${actualPort}`]);
    const trusted = typeof origin === "string" && allowedOrigins.has(origin) && hosts.has(request.headers.host);
    const send = (status, data) => {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(status, { ...corsHeaders(trusted ? origin : null), "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(data));
    };
    if (!trusted) { send(403, { error: "Origin or Host is not permitted. Serve LoopCAT from a configured HTTP/HTTPS origin." }); return; }
    if (request.method === "OPTIONS") { response.writeHead(204, corsHeaders(origin)); response.end(); return; }
    // Only an explicitly permitted origin can establish a session. Never put capabilities in URLs or logs.
    if (request.url === "/loopcat-session" && request.method === "GET") { send(200, { capability }); return; }
    const supplied = Buffer.from(String(request.headers["x-loopcat-capability"] || ""));
    const expected = Buffer.from(capability);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(403, { error: "Missing or expired LoopCAT session capability." }); return; }
    if (request.method !== "POST") { send(405, { error: "OPUS-CAT bridge requests require POST." }); return; }
    if (active >= concurrency) { send(429, { error: "OPUS-CAT is busy. Retry after the current request finishes." }); return; }
    active++;
    let upstream;
    const deadline = setTimeout(() => { upstream?.destroy(); send(504, { error: "OPUS-CAT deadline exceeded." }); request.destroy(); }, timeoutMs);
    const disconnected = () => { if (!response.writableEnded) upstream?.destroy(); };
    response.once("close", disconnected);
    try {
      if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) { send(415, { error: "JSON is required." }); return; }
      let size = 0;
      const body = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxRequestBytes) { send(413, { error: "Request exceeds the size limit." }); return; }
        body.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(body).toString("utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) { send(400, { error: "Invalid request." }); return; }
      const source = new URL(request.url, target);
      if (source.search) { send(400, { error: "Use the JSON body for parameters." }); return; }
      for (const [key, value] of Object.entries(data)) {
        if (typeof value !== "string") { send(400, { error: "Parameters must be strings." }); return; }
        source.searchParams.set(key, value);
      }
      const error = validateBridgeRequest(source);
      if (error) { send(403, { error }); return; }
      await new Promise((resolve) => {
        upstream = http.get(new URL(`${source.pathname}${source.search}`, target), { headers: { Accept: "application/json" } }, (incoming) => {
          let bytes = 0;
          const chunks = [];
          incoming.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > maxResponseBytes) { incoming.destroy(); send(502, { error: "OPUS-CAT response exceeds its size limit." }); resolve(); }
            else chunks.push(chunk);
          });
          incoming.on("end", () => {
            if (!response.destroyed && !response.writableEnded) {
              response.writeHead(incoming.statusCode || 502, { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" });
              response.end(Buffer.concat(chunks));
            }
            resolve();
          });
          incoming.on("error", () => { send(502, { error: "OPUS-CAT response was interrupted." }); resolve(); });
        });
        upstream.on("error", () => { send(502, { error: "OPUS-CAT is unavailable." }); resolve(); });
      });
    } catch { send(400, { error: "Invalid or interrupted bridge request." }); }
    finally { active--; clearTimeout(deadline); response.removeListener("close", disconnected); }
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = Math.min(timeoutMs, 15000);
  return server;
}

function startServer() {
  const host = process.env.LOOPCAT_OPUS_CAT_BRIDGE_HOST || DEFAULT_BRIDGE_HOST;
  const port = Number(process.env.LOOPCAT_OPUS_CAT_BRIDGE_PORT || DEFAULT_BRIDGE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid bridge port.");
  const server = createBridge({ host, port, targetBaseUrl: process.env.OPUS_CAT_BASE_URL || DEFAULT_OPUS_CAT_BASE_URL,
    ...(process.env.LOOPCAT_OPUS_CAT_ORIGINS ? { origins: process.env.LOOPCAT_OPUS_CAT_ORIGINS.split(",").map((value) => value.trim()) } : {}) });
  server.listen(port, host, () => console.log(`LoopCAT OPUS-CAT bridge listening on http://${host}:${port}`));
  return server;
}
if (require.main === module) startServer();
module.exports = { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT, DEFAULT_OPUS_CAT_BASE_URL, ALLOWED_QUERY_KEYS,
  normalizeOpusCatBaseUrl, validateBridgeRequest, corsHeaders, createBridge, startServer };
