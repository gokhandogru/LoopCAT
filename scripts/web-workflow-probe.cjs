// Runs against the extracted production ZIP, without the test-only renderer.
async function webWorkflowProbe() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${label}; ${document.querySelector("#saveStatus")?.textContent}`);
  };
  await wait(() => window.CatHan?.docx && window.CatHan?.workerClient, "web runtime");
  const api = window.CatHan;
  console.log("Web probe: DOCX import/export");
  const project = { name: "Web workflow", sourceLang: "en", targetLang: "tr" };
  const blob = await api.docx.buildBilingualDocx(project, [{ source: "Hello world.", target: "", status: "empty" }]);
  const file = new File([blob], "workflow.docx");
  const parsed = await api.docx.extractDocxSegments(file);
  check(
    parsed.segments.some((segment) => segment.text.includes("Hello world")),
    "DOCX archive import lost source text"
  );
  const translated = parsed.segments.map((segment) => ({ ...segment, source: segment.text, target: "Merhaba dünya." }));
  const exported = await api.docx.buildTargetDocx({ ...project, docxStructure: parsed.structure }, translated);
  const reread = await api.docx.extractDocxSegments(new File([exported], "translated.docx"));
  check(
    reread.segments.some((segment) => segment.text.includes("Merhaba")),
    "DOCX export did not preserve translation"
  );
  const scores = await api.workerClient.analyzeTm({ sources: ["Hello world."], entries: ["Hello world."] });
  console.log("Web probe: TM analysis complete");
  check(scores[0] === 100, "Background TM analysis failed");
  const matches = await api.workerClient.findTmMatches({
    entries: [{ id: "web-tm", source: "Hello world.", target: "Merhaba dünya." }],
    options: { source: "Hello world." }
  });
  check(matches.length > 0, "Background TM matching failed");
  await api.workerClient.runQaChecks({ segments: translated, terms: [] });
  document.querySelector("#newProjectBtn").click();
  console.log("Web probe: project creation");
  await wait(() => document.querySelector("#projectDialog").open, "new project dialog");
  document.querySelector("#projectNameInput").value = "Packaged web workflow";
  document.querySelector("#sourceLangInput").value = "en";
  document.querySelector("#targetLangInput").value = "tr";
  document.querySelector("#projectForm").requestSubmit();
  await wait(() => !document.querySelector("#projectHomeView").classList.contains("hidden"), "project creation");
  const input = document.querySelector("#projectFileImportInput");
  const files = new DataTransfer();
  files.items.add(file);
  input.files = files.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(() => document.querySelector(".file-card button.primary"), "file import");
  console.log("Web probe: UI import complete");
  document.querySelector(".file-card button.primary").click();
  await wait(() => document.querySelector("#segmentBody .target-editor"), "segment editor");
  const editor = document.querySelector("#segmentBody .target-editor");
  editor.focus();
  if (editor.isContentEditable) editor.textContent = "Merhaba dünya.";
  else editor.value = "Merhaba dünya.";
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "Merhaba dünya." }));
  await wait(
    async () => (await api.storage.getAll("segments")).some((segment) => segment.target === "Merhaba dünya."),
    "persisted edit"
  );
  document.querySelector("#confirmBtn").click();
  await wait(
    async () =>
      (await api.storage.getAll("segments")).some(
        (segment) => segment.target === "Merhaba dünya." && segment.status === "confirmed"
      ),
    "persisted confirmation"
  );
  const checkpoint = await api.archive.createCheckpoint("web-regression");
  console.log("Web probe: checkpoint complete");
  check(checkpoint?.id, "Workspace checkpoint failed");
  check(
    checkpoint.counts.segments === (await api.storage.getAll("segments")).length,
    "Checkpoint worker cannot see the editor workspace"
  );
  const backup = await api.archive.writePackage(await api.storage.createArchiveExport());
  const restored = await api.archive.readPackage(backup.data);
  check(
    restored.value.segments.some((segment) => segment.target === "Merhaba dünya." && segment.status === "confirmed"),
    "Workspace backup round trip lost the confirmed translation"
  );
  const regexUrl = "./regex-worker.js";
  const regex = api.createFileWorker?.(regexUrl) || new Worker(api.appRuntime.safeHtml.trustedScriptUrl(regexUrl));
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Regex worker timed out")), 4000);
      regex.onmessage = ({ data }) => {
        clearTimeout(timer);
        data.ok ? resolve(data.result) : reject(new Error(data.error));
      };
      regex.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Regex worker failed"));
      };
      regex.postMessage({ type: "query", pattern: "Merhaba", records: [{ id: "one", text: "Merhaba dünya." }] });
    });
    check(result[0].match, "Regex search missed text");
  } finally {
    regex.terminate();
  }
  return "DOCX import/export, TM matches/analysis, QA, project creation, typing, durable confirmation, checkpoint, backup round trip, regex";
}

module.exports = { webWorkflowProbe };
