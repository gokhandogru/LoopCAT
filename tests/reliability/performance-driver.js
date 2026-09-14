import { writeArchive, readArchive } from "../../src/features/import-export/archive-worker-client.js";

export async function runPerformance(storage, output) {
  const metrics = {
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    samples: [],
    folders: [],
    soakMs: 0
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (read, label, timeout = 60000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = await read();
      if (value) return value;
      await delay(10);
    }
    throw new Error("Timed out: " + label);
  };
  const percentile = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  const pid = "performance-project";
  const project = {
    id: pid,
    name: "Performance reference",
    sourceLang: "en",
    targetLang: "tr",
    documents: [{ id: "d", name: "reference.txt", type: "txt" }],
    tmName: "Reference TM",
    termBaseName: "Reference TB"
  };
  await storage.put("projects", project);
  let previousCount = 0;
  const sizes = new URLSearchParams(location.search).get("segments") === "10000" ? [10000] : [10000, 100000];
  for (const count of sizes) {
    output.textContent = `Seeding ${count} segments...`;
    const seedStarted = performance.now();
    for (let start = previousCount; start < count; start += 1000) {
      await storage.bulkPut(
        "segments",
        Array.from({ length: Math.min(1000, count - start) }, (_, offset) => ({
          id: `perf-${start + offset}`,
          projectId: pid,
          documentId: "d",
          documentName: "reference.txt",
          documentType: "txt",
          index: start + offset,
          documentIndex: start + offset,
          source: `Reference source ${start + offset}`,
          target: "Çeviri",
          status: "draft",
          revision: 1,
          tags: [],
          comments: [],
          targetHistory: []
        }))
      );
    }
    await storage.releaseProject(pid);
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
    frame.title = "Reference editor";
    frame.src = "/index.html";
    document.body.append(frame);
    const doc = () => frame.contentDocument;
    const open = await wait(() => doc()?.querySelector(".project-tile button.primary"), "project listing");
    open.click();
    (await wait(() => doc()?.querySelector(".file-card button.primary"), "project dashboard")).click();
    const field = await wait(
      () => doc()?.querySelector("#segmentBody .target-editor[contenteditable=true]"),
      "editable segment"
    );
    field.focus();
    const input = [];
    const dispatch = [];
    const save = [];
    const duration = Number(new URLSearchParams(location.search).get("soakMs")) || 0;
    const end = performance.now() + (count === 100000 ? duration : 0);
    let index = 0;
    do {
      const text = `Reference target ${count} ${index++} 🎯`;
      const started = performance.now();
      field.value = text;
      field.dispatchEvent(
        new frame.contentWindow.InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      );
      dispatch.push(performance.now() - started);
      await Promise.race([
        new Promise((resolve) =>
          frame.contentWindow.requestAnimationFrame(() => frame.contentWindow.requestAnimationFrame(resolve))
        ),
        delay(3000).then(() => {
          throw new Error("Reference renderer did not produce an animation frame within three seconds.");
        })
      ]);
      input.push(performance.now() - started);
      await wait(
        async () => (await storage.get("segments", "perf-0"))?.target === text,
        "local acknowledgement",
        10000
      );
      save.push(performance.now() - started);
      output.textContent = `${count} segments: ${index} acknowledged edits; p95 input ${percentile(input).toFixed(1)} ms; p95 save ${percentile(save).toFixed(1)} ms`;
    } while (index < 30 || performance.now() < end);
    metrics.samples.push({
      segments: count,
      edits: index,
      seedMs: performance.now() - seedStarted - save.reduce((sum, value) => sum + value, 0),
      inputP95Ms: percentile(input),
      inputDispatchP95Ms: percentile(dispatch),
      saveP95Ms: percentile(save),
      rendererHeapBytes: frame.contentWindow.performance.memory?.usedJSHeapSize || null
    });
    metrics.soakMs = duration;
    frame.remove();
    await delay(100);
    output.textContent += "\nWriting and verifying committed archive...";
    const checkpointStarted = performance.now();
    const descriptor = await storage.createArchiveExport();
    const checkpointMs = performance.now() - checkpointStarted;
    output.textContent += `\nCheckpoint verified in ${checkpointMs.toFixed(0)} ms. Streaming ZIP...`;
    let bytes = 0;
    const started = performance.now();
    const archive = await writeArchive(
      descriptor,
      new WritableStream({
        write(chunk) {
          bytes += chunk.length;
        }
      })
    );
    metrics.samples.at(-1).archive = {
      checkpointMs,
      writeMs: performance.now() - started,
      bytes,
      chunks: archive.manifest.chunks.length
    };
    console.error("LOOPCAT_PERFORMANCE " + JSON.stringify({ ...metrics, partial: true }));
    previousCount = count;
  }
  const root = await navigator.storage.getDirectory();
  const { createWorkspaceArchiveStore } = await import("../../src/features/workspace/workspace-archive-store.js");
  let folderReads = 0;
  const counted = {
    getDirectoryHandle(...args) {
      folderReads++;
      return root.getDirectoryHandle(...args);
    }
  };
  const folder = createWorkspaceArchiveStore(counted);
  let previous = 0;
  for (const count of [1, 10, 100]) {
    for (let i = previous; i < count; i++)
      await folder.saveProjectPackage({
        app: "LoopCAT",
        project: { id: `folder-${i}`, name: `Project ${i}` },
        segments: [{ id: `folder-s-${i}`, target: "Preserved" }]
      });
    const readsBefore = folderReads;
    const started = performance.now();
    await folder.saveProjectPackage({
      app: "LoopCAT",
      project: { id: "folder-0", name: "Project 0" },
      segments: [{ id: "folder-s-0", target: `Generation at ${count}` }]
    });
    metrics.folders.push({
      projects: count,
      saveMs: performance.now() - started,
      rootLookups: folderReads - readsBefore
    });
    previous = count;
  }
  const checked = await readArchive(await folder.file((await folder.load()).projects[0].packagePath), {
    verifyOnly: true
  });
  if (!checked.verified) throw new Error("Final folder package was not verified.");
  metrics.passed10kTargets = metrics.samples[0].inputP95Ms < 100 && metrics.samples[0].saveP95Ms < 2000;
  console.error("LOOPCAT_PERFORMANCE " + JSON.stringify(metrics));
  output.textContent =
    JSON.stringify(metrics, null, 2) +
    (metrics.passed10kTargets ? "\nPERFORMANCE TEST PASS" : "\nPERFORMANCE TEST FAIL Reference targets exceeded");
  parent.postMessage({ type: "loopcat-test-result", text: output.textContent }, location.origin);
}
