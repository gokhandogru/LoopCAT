const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBridge } = require("../../scripts/opus-cat-web-bridge.cjs");
const { createProtectedCredentials } = require("../../desktop/protected-credentials.cjs");
const { createVerifiedExports } = require("../../desktop/verified-export.cjs");

async function listen(server, t) {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("R8 bridge denies forged origins/hosts/capabilities and sends text only in authenticated POST", async (t) => {
  let upstreamUrl;
  const upstream = http.createServer((req, res) => {
    upstreamUrl = req.url;
    res.end(JSON.stringify({ translation: "Merhaba" }));
  });
  const target = await listen(upstream, t);
  const bridge = createBridge({ port: 0, targetBaseUrl: target, origins: ["http://localhost:4173"] });
  const base = await listen(bridge, t);
  for (const origin of ["null", "http://evil.example", "http://localhost:4173.evil.example"]) {
    const response = await fetch(`${base}/loopcat-session`, { headers: { Origin: origin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const forgedHostStatus = await new Promise((resolve, reject) => {
    http
      .get(
        `${base}/loopcat-session`,
        { headers: { Origin: "http://localhost:4173", Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        }
      )
      .on("error", reject);
  });
  assert.equal(forgedHostStatus, 403);
  const headers = { Origin: "http://localhost:4173", "Content-Type": "application/json" };
  const session = await fetch(`${base}/loopcat-session`, { headers });
  const { capability } = await session.json();
  assert.match(capability, /^[a-f0-9]{64}$/);
  assert.equal(session.headers.get("access-control-allow-private-network"), null);
  const url = `${base}/MTRestService/TranslateJson`;
  assert.equal((await fetch(url, { method: "POST", headers, body: "{}" })).status, 403);
  headers["X-LoopCAT-Capability"] = capability;
  assert.equal((await fetch(url, { headers })).status, 405);
  assert.equal((await fetch(`${url}?input=secret`, { method: "POST", headers, body: "{}" })).status, 400);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ input: "Private translation", srcLangCode: "en", trgLangCode: "tr" })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).translation, "Merhaba");
  assert.equal(new URL(upstreamUrl, target).searchParams.get("input"), "Private translation");
});

test("R8 bridge bounds upstream duration and concurrency", async (t) => {
  let started;
  const reached = new Promise((resolve) => {
    started = resolve;
  });
  const target = await listen(
    http.createServer(() => started()),
    t
  );
  const base = await listen(createBridge({ port: 0, targetBaseUrl: target, timeoutMs: 150, concurrency: 1 }), t);
  const headers = { Origin: "http://localhost:4173", "Content-Type": "application/json" };
  headers["X-LoopCAT-Capability"] = (await (await fetch(`${base}/loopcat-session`, { headers })).json()).capability;
  const url = `${base}/MTRestService/TranslateJson`;
  const first = fetch(url, { method: "POST", headers, body: "{}" });
  await reached;
  assert.equal((await fetch(url, { method: "POST", headers, body: "{}" })).status, 429);
  assert.equal((await first).status, 504);
});

test("R8 bridge rejects non-loopback binding and upstreams", () => {
  assert.throws(() => createBridge({ host: "0.0.0.0" }), /loopback/);
  assert.throws(() => createBridge({ targetBaseUrl: "http://example.com" }), /loopback/);
  assert.throws(() => createBridge({ origins: ["null"] }));
});

test("R16 protected credentials return references, bind operations to their endpoint, and redact responses", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "loopcat-credentials-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "test-protected",
    encryptString: (value) => Buffer.from(value).map((byte) => byte ^ 0x5a),
    decryptString: (bytes) =>
      Buffer.from(bytes)
        .map((byte) => byte ^ 0x5a)
        .toString()
  };
  let sent;
  const service = createProtectedCredentials({
    directory,
    safeStorage,
    isAllowedUrl: () => true,
    fetchImpl: (url, request) => {
      sent = { url, request };
      return Promise.resolve(new Response("Never show test-private-key", { status: 400 }));
    }
  });
  const result = await service.save({
    scope: "provider",
    baseUrl: "https://api.example/v1",
    secret: "test-private-key"
  });
  assert.equal(result.verified, true);
  assert.match(result.reference, /^loopcat-credential:/);
  assert.ok(
    !(await fs.readFile(path.join(directory, "protected-ai-credentials.json"), "utf8")).includes("test-private-key")
  );
  await assert.rejects(
    service.perform({
      reference: result.reference,
      url: "https://evil.example/v1/chat",
      headers: { Authorization: `Bearer ${result.reference}` }
    }),
    /endpoint/
  );
  await assert.rejects(
    service.perform({ reference: result.reference, url: "https://api.example/v10/chat" }),
    /endpoint/
  );
  const response = await service.perform({
    reference: result.reference,
    url: "https://api.example/v1/chat",
    headers: { Authorization: `Bearer ${result.reference}` }
  });
  assert.equal(sent.request.headers.Authorization, "Bearer test-private-key");
  assert.equal(sent.request.redirect, "error");
  assert.equal(response.text, "Never show [redacted]");
  await service.save({ scope: "provider", baseUrl: "https://api.example/v1", secret: "" });
  await assert.rejects(service.perform({ reference: result.reference, url: "https://api.example/v1/chat" }), /removed/);
});

test("R16 basic_text backends never remember a secret", async () => {
  const service = createProtectedCredentials({
    directory: "unused",
    safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "basic_text" }
  });
  assert.equal(
    (await service.save({ scope: "provider", baseUrl: "https://api.example", secret: "private" })).stored,
    false
  );
});

test("R13 native export verifies readback, keeps the overwritten file, and rejects another renderer", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "loopcat-export-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, "output.txt");
  await fs.writeFile(destination, "previous output");
  const service = createVerifiedExports({
    windowFor: () => ({}),
    dialog: { showSaveDialog: () => Promise.resolve({ filePath: destination }) }
  });
  const owner = {};
  const session = await service.begin(owner, { filename: "output.txt" });
  assert.throws(() => service.write({}, { id: session.id, bytes: Buffer.from("forged") }), /session/);
  await service.write(owner, { id: session.id, bytes: Buffer.from("new ") });
  await service.write(owner, { id: session.id, bytes: Buffer.from("output") });
  assert.equal(await fs.readFile(destination, "utf8"), "previous output");
  assert.equal((await service.finish(owner, session)).verified, true);
  assert.equal(await fs.readFile(destination, "utf8"), "new output");
  assert.equal(await fs.readFile(`${destination}.${session.id}.previous`, "utf8"), "previous output");
  const canceled = await service.begin(owner, { filename: "output.txt" });
  await service.write(owner, { id: canceled.id, bytes: Buffer.from("incomplete") });
  await service.abort(owner, canceled.id);
  assert.equal(await fs.readFile(destination, "utf8"), "new output");
});
