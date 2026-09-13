const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

function createProtectedCredentials({ directory, safeStorage, fetchImpl, isAllowedUrl }) {
  const file = path.join(directory, "protected-ai-credentials.json");
  let tail = Promise.resolve();
  const supported = () =>
    safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  const reference = (scope) => `loopcat-credential:${createHash("sha256").update(scope).digest("hex")}`;
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error("Protected credential storage could not be read.");
    }
  }
  function save({ scope, baseUrl, secret }) {
    if (typeof scope !== "string" || scope.length > 2048 || typeof secret !== "string" || secret.length > 16384)
      return Promise.reject(new Error("Invalid credential request."));
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
      return Promise.reject(new Error("Credential endpoints require HTTPS or loopback."));
    if (url.username || url.password || url.search || url.hash)
      return Promise.reject(new Error("Invalid credential endpoint."));
    const operation = tail.then(async () => {
      if (secret && !supported())
        return { stored: false, reason: "Protected storage is unavailable; key remains session-only." };
      const ref = reference(scope);
      const records = await read();
      if (secret) {
        const encrypted = safeStorage.encryptString(
          JSON.stringify({ secret, origin: url.origin, basePath: url.pathname.replace(/\/$/, "") })
        );
        if (JSON.parse(safeStorage.decryptString(encrypted)).secret !== secret)
          throw new Error("Credential encryption verification failed.");
        records[ref] = encrypted.toString("base64");
      } else delete records[ref];
      await fs.mkdir(directory, { recursive: true });
      const temporary = `${file}.pending`;
      const handle = await fs.open(temporary, "w", 0o600);
      try {
        await handle.writeFile(JSON.stringify(records));
        await handle.sync();
      } finally {
        await handle.close();
      }
      const verified = JSON.parse(await fs.readFile(temporary, "utf8"));
      if (secret && JSON.parse(safeStorage.decryptString(Buffer.from(verified[ref], "base64"))).secret !== secret)
        throw new Error("Credential readback verification failed.");
      await fs.rename(temporary, file);
      return { stored: Boolean(secret), reference: ref, verified: true };
    });
    tail = operation.catch(() => {});
    return operation;
  }
  async function perform({ reference: ref, url, method = "POST", body, headers = {}, timeoutMs = 120000 }) {
    if (!supported() || !/^loopcat-credential:[a-f0-9]{64}$/.test(ref))
      throw new Error("Protected credential is unavailable.");
    if (!["GET", "POST"].includes(method) || (body && Buffer.byteLength(body) > 8 * 1024 * 1024))
      throw new Error("Provider request exceeds its limits.");
    const encrypted = (await read())[ref];
    if (!encrypted) throw new Error("Saved provider credential was removed. Add it again.");
    const credential = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64")));
    const endpoint = new URL(url);
    if (
      endpoint.origin !== credential.origin ||
      endpoint.username ||
      endpoint.password ||
      !(endpoint.pathname === credential.basePath || endpoint.pathname.startsWith(`${credential.basePath}/`)) ||
      !isAllowedUrl(endpoint.href)
    )
      throw new Error("Credential cannot be used for this provider endpoint.");
    const requestHeaders = { "Content-Type": "application/json", Accept: "application/json" };
    for (const [key, value] of Object.entries(headers)) {
      if (/^(authorization|x-api-key|api-key|x-goog-api-key)$/i.test(key))
        requestHeaders[key] = String(value).replace(ref, credential.secret);
      else if (
        /^(anthropic-version|openai-organization|openai-project)$/i.test(key) &&
        typeof value === "string" &&
        value.length < 256
      )
        requestHeaders[key] = value;
    }
    const response = await fetchImpl(endpoint.href, {
      method,
      headers: requestHeaders,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(600000, Math.max(1000, timeoutMs)))
    });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Provider response exceeds its size limit.");
      }
      chunks.push(Buffer.from(value));
    }
    // A provider error must not echo a credential into renderer diagnostics.
    const text = Buffer.concat(chunks).toString("utf8").split(credential.secret).join("[redacted]");
    return { status: response.status, ok: response.ok, text };
  }
  return Object.freeze({ save, perform, supported });
}
module.exports = { createProtectedCredentials };
