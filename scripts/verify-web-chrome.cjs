const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { webWorkflowProbe } = require("./web-workflow-probe.cjs");

async function verifyWebChrome(urls, profile) {
  profile = path.resolve(profile);
  const binary = [
    process.env.LOOPCAT_CHROME_BINARY,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].find((candidate) => candidate && fsSync.existsSync(candidate));
  if (!binary) throw new Error("Chrome is required for the packaged web regression gate.");
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank"
  ];
  if (process.platform === "linux") args.unshift("--no-sandbox");
  const child = spawn(binary, args, { windowsHide: true, stdio: "ignore" });
  let launchError;
  child.on("error", (error) => {
    launchError = error;
  });
  let socket;
  let sequence = 0;
  const pending = new Map();
  try {
    let port;
    const deadline = Date.now() + 20000;
    while (!port && Date.now() < deadline) {
      if (launchError) throw launchError;
      try {
        port = Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!port) throw new Error("Chrome debugging endpoint did not start.");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome WebSocket did not connect")), 10000);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Chrome WebSocket connection failed"));
      };
    });
    socket.onmessage = ({ data }) => {
      const reply = JSON.parse(data);
      if (reply.method === "Runtime.consoleAPICalled") {
        const message = reply.params.args.map((arg) => arg.value || arg.description).join(" ");
        if (message.startsWith("Web probe:")) console.log(message);
      }
      const request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id);
      clearTimeout(request.timer);
      if (reply.error) request.reject(new Error(reply.error.message));
      else request.resolve(reply.result);
    };
    const send = (method, params = {}, timeout = 120000) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome timed out: ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    for (const url of urls) {
      await send("Runtime.enable");
      await send("Page.navigate", { url });
      const deadline = Date.now() + 20000;
      let ready = false;
      while (!ready && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const result = await send("Runtime.evaluate", {
          expression: `location.href === ${JSON.stringify(url)} && !!window.CatHan?.appRuntime && !!document.querySelector('#newProjectBtn')`
        });
        ready = result.result?.value;
      }
      if (!ready) throw new Error(`Chrome could not start ${url}`);
      const result = await send("Runtime.evaluate", {
        expression: `(${webWorkflowProbe})()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      console.log(`Chrome ${new URL(url).protocol} workflow passed: ${result.result.value}`);
    }
    await send("Browser.close", {}, 5000).catch(() => {});
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    socket?.close();
    child.kill();
  }
}
module.exports = { verifyWebChrome };
if (require.main === module) {
  verifyWebChrome(process.argv.slice(3), process.argv[2]).then(
    () => process.exit(0),
    (error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    }
  );
}
