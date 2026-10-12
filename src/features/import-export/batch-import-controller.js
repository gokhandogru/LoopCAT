export const BATCH_IMPORT_LIMITS = Object.freeze({ files: 50, bytes: 100 * 1024 * 1024 });

export function validateImportBatch(files) {
  if (!files.length) return;
  if (files.length > BATCH_IMPORT_LIMITS.files) throw new Error("Select at most 50 files per batch.");
  if (
    files.some((file) => !Number.isFinite(file.size) || file.size < 0) ||
    files.reduce((sum, file) => sum + file.size, 0) > BATCH_IMPORT_LIMITS.bytes
  )
    throw new Error("The combined batch size must not exceed 100 MiB.");
}

/** @param {any} options */
export function createBatchImportController(options) {
  const { document: doc, session, translate: t } = options;
  const node = (tag, text = "", parent = null) => {
    const element = doc.createElement(tag);
    element.textContent = t(text);
    parent?.append(element);
    return element;
  };
  const dialog = node("dialog");
  dialog.className = "statistics-dialog batch-import-dialog";
  dialog.id = "batchImportDialog";
  doc.body.append(dialog);
  node("h2", "Import files", dialog).id = "batchImportTitle";
  dialog.setAttribute("aria-labelledby", "batchImportTitle");
  node(
    "p",
    "Up to 50 mixed-format files, 100 MiB combined. Imported files are retained if another file fails.",
    dialog
  );
  const summary = node("p", "", dialog);
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const queue = node("div", "", dialog);
  queue.className = "statistics-table-wrap";
  const actions = node("div", "", dialog);
  actions.className = "statistics-controls";
  const button = (text, action) => {
    const b = node("button", text, actions);
    b.type = "button";
    b.addEventListener(
      "click",
      () =>
        void Promise.resolve()
          .then(action)
          .catch((error) => {
            summary.textContent = error.message;
          })
    );
    return b;
  };
  let rows = [],
    projectId = "",
    batchId = "",
    running = false,
    canceled = false;
  const start = button("Import ready files", () => run());
  const retry = button("Retry failed files", () => run(true));
  retry.hidden = true;
  const cancel = button("Cancel", () => {
    if (running) {
      canceled = true;
      summary.textContent = t("Stopping after the current operation. Committed files will be retained.");
    } else dialog.close();
  });
  const stats = button("View statistics", () => {
    dialog.close();
    options.openStatistics();
  });
  stats.hidden = true;
  dialog.addEventListener("cancel", (event) => {
    if (running) {
      event.preventDefault();
      canceled = true;
    }
  });
  function render() {
    queue.replaceChildren();
    const table = node("table", "", queue),
      header = node("tr", "", node("thead", "", table));
    for (const title of ["Import", "File", "Format / size", "Encoding", "Result"])
      node("th", title, header).scope = "col";
    const body = node("tbody", "", table);
    for (const row of rows) {
      const tr = node("tr", "", body),
        check = node("input", "", node("td", "", tr));
      check.type = "checkbox";
      check.checked = row.include;
      check.disabled = running || row.state === "imported" || row.state === "unsupported";
      check.setAttribute("aria-label", t("Import ") + row.file.name);
      check.addEventListener("change", () => {
        row.include = check.checked;
      });
      node("td", row.file.name, tr);
      node("td", `${row.extension.toUpperCase()} · ${(row.file.size / 1024).toFixed(1)} KiB`, tr);
      const select = node("select", "", node("td", "", tr));
      select.setAttribute("aria-label", t("Encoding for ") + row.file.name);
      select.disabled = running || row.state === "imported";
      for (const [value, label] of options.encodingOptions()) {
        const entry = node("option", label, select);
        entry.value = value;
      }
      select.value = row.encoding;
      select.addEventListener("change", () => {
        row.encoding = select.value;
        row.state = "ready";
      });
      node("td", row.message || row.state, tr);
    }
  }
  async function run(retryOnly = false) {
    if (running) return;
    if (session.getProject()?.id !== projectId)
      throw Error(t("The project changed. Review these files in the intended project."));
    const pending = rows.filter(
      (r) =>
        r.include &&
        r.state !== "imported" &&
        r.state !== "unsupported" &&
        (!retryOnly || ["failed", "canceled"].includes(r.state))
    );
    if (!pending.length) {
      summary.textContent = t("No ready files selected.");
      return;
    }
    validateImportBatch(pending.map((r) => r.file));
    running = true;
    canceled = false;
    start.disabled = true;
    retry.disabled = true;
    stats.hidden = true;
    render();
    const batch = { id: batchId, projectId, committed: [], canceled: () => canceled };
    let batchError = "";
    try {
      const completed = await options.runTask("Batch file import", async () => {
        await options.flush();
        try {
          for (let index = 0; index < pending.length; index++) {
            const row = pending[index];
            if (canceled) {
              row.state = "canceled";
              continue;
            }
            if (session.getProject()?.id !== projectId) throw Error("Project changed during import.");
            row.state = "reading";
            row.message = "";
            summary.textContent = `${t("Importing")} ${index + 1}/${pending.length} — ${row.file.name}`;
            render();
            try {
              const fingerprint = row.fingerprint;
              await options.importFile(row.file, {
                batch,
                rowId: row.id,
                fingerprint,
                encoding: row.encoding,
                acceptDuplicate: true,
                allowLanguageMismatch: row.allowLanguageMismatch
              });
              row.state = "imported";
              row.message = t("Imported");
            } catch (error) {
              const committed = (session.getProject()?.importReceipts || []).some(
                (r) => r.importKey === `${batchId}:${row.id}`
              );
              row.state = committed ? "imported" : error.name === "AbortError" ? "canceled" : "failed";
              row.message = error.message;
              if (error.code === "LANGUAGE_MISMATCH") {
                row.allowLanguageMismatch = options.confirm(
                  `${row.file.name}: ${error.message} Import this file with the existing project languages?`
                );
                row.message += row.allowLanguageMismatch ? " — " + t("Approved for retry") : "";
              }
              if (/quota|ownership|read.only|conflict|project changed|storage|database/i.test(error.message)) {
                canceled = true;
                summary.textContent = error.message;
              }
            }
            render();
            await new Promise((resolve) => {
              setTimeout(resolve, 0);
            });
          }
        } finally {
          await options.finishBatch(batch);
        }
      });
      if (completed === false)
        batchError = t("Import stopped. Check the application status for the error; committed files are retained.");
    } catch (error) {
      batchError = error.message;
    } finally {
      for (const row of pending) if (["ready", "reading"].includes(row.state)) row.state = "canceled";
      running = false;
      start.disabled = false;
      retry.disabled = false;
      retry.hidden = !rows.some((r) => ["failed", "canceled"].includes(r.state));
      stats.hidden = !rows.some((r) => r.state === "imported");
      cancel.textContent = t("Close");
      summary.textContent = `${rows.filter((r) => r.state === "imported").length} ${t("imported")} · ${rows.filter((r) => r.state === "failed").length} ${t("failed")} · ${rows.filter((r) => !r.include || r.state === "unsupported").length} ${t("skipped")} · ${rows.filter((r) => r.state === "canceled").length} ${t("canceled")}`;
      if (batchError) summary.textContent += " · " + batchError;
      render();
    }
  }
  async function review(files) {
    if (dialog.open || running) throw Error(t("Finish the current import review first."));
    validateImportBatch(files);
    if (!files.length) return;
    projectId = session.getProject()?.id;
    if (!projectId) throw Error(t("Open a project first."));
    batchId = crypto.randomUUID();
    const names = new Set((session.getProject().documents || []).map((d) => d.name.toLowerCase()));
    const extensions = new Set(
      options.accept
        .split(",")
        .filter((x) => x.startsWith("."))
        .map((x) => x.slice(1))
    );
    rows = files.map((file) => {
      const extension = file.name.split(".").pop().toLowerCase(),
        duplicate = names.has(file.name.toLowerCase());
      names.add(file.name.toLowerCase());
      const supported = extensions.has(extension);
      return {
        file,
        extension,
        id: crypto.randomUUID(),
        encoding: "auto",
        include: supported && !duplicate,
        state: supported ? "ready" : "unsupported",
        allowLanguageMismatch: false,
        message: !supported
          ? t("Unsupported format")
          : duplicate
            ? t("Same name already present — select to import another copy")
            : ""
      };
    });
    retry.hidden = true;
    stats.hidden = true;
    cancel.textContent = t("Cancel");
    summary.textContent = `${files.length} ${t("files selected")}`;
    render();
    start.disabled = true;
    options.showDialog(dialog, start);
    summary.textContent = t("Checking file contents for duplicates…");
    const documentIds = new Set((session.getProject().documents || []).map((d) => d.id));
    const fingerprints = new Map(
      (session.getProject().importReceipts || [])
        .filter((r) => documentIds.has(r.documentId))
        .map((r) => [r.fingerprint, r.name])
    );
    const reviewedRows = rows;
    for (const row of reviewedRows) {
      if (row.state === "unsupported") continue;
      try {
        row.fingerprint = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", await row.file.arrayBuffer()))
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (fingerprints.has(row.fingerprint)) {
          row.include = false;
          row.message = `${t("Identical content")}: ${fingerprints.get(row.fingerprint)} — ${t("select to import another copy")}`;
        }
        fingerprints.set(row.fingerprint, row.file.name);
      } catch (error) {
        row.include = false;
        row.state = "unsupported";
        row.message = `${t("Cannot read file")}: ${error.message}`;
      }
    }
    if (rows !== reviewedRows) return;
    render();
    start.disabled = false;
    summary.textContent = `${files.length} ${t("files reviewed")} · ${t("Previously committed copies are excluded; select them explicitly to import again.")}`;
  }
  return { review };
}
