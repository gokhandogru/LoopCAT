const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("report templates escape every interpolated value", async () => {
  const { reportHtml } = await moduleAt("src/reports/html-template.js");
  const output = reportHtml`<p>${'<script>alert("x")</script>'}</p>`;
  assert.equal(output, "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
});

test("report finalization rejects executable markup and incomplete CSP", async () => {
  const { finalizeReportDocument } = await moduleAt("src/reports/report-document.js");
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const safe = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>Report</body></html>`;
  assert.equal(finalizeReportDocument(safe), safe);
  assert.throws(() => finalizeReportDocument(safe.replace("Report", '<img src="x" onerror="alert(1)">')));
  assert.throws(() => finalizeReportDocument("<!doctype html><html><body>Missing CSP</body></html>"));
});
