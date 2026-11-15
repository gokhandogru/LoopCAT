export async function openResourceImportDialog({
  ui,
  transfer,
  storage,
  type,
  resource = null,
  onComplete = (_result) => {},
  onBusyChange = (_busy) => {}
}) {
  const { node, button, field, select, dialog, t } = ui;
  const resources = (await storage.getAll("resources")).filter(
    (item) => item.type === (type === "tm" ? "tm" : "termbase") && !item.archived
  );
  const destination = select(
    "Destination",
    [["", t("Create new resource")], ...resources.map((item) => [item.id, ui.safeMetadata(item.name)])],
    resource?.id || "",
    { literalChoices: true }
  );
  const name = node("input", { value: resource?.name || "", required: true });
  const source = node("input", { value: resource?.sourceLang || "", list: "languageOptions", placeholder: "en" });
  const target = node("input", { value: resource?.targetLang || "", list: "languageOptions", placeholder: "tr" });
  const file = node("input", { type: "file", accept: type === "tm" ? ".tmx" : ".tbx,.csv,.tsv,.xlsx" });
  const message = node("p", { role: "status", "aria-live": "polite" });
  const previewArea = node("div", { className: "resource-import-preview" });
  const mappingArea = node("div", { className: "resource-fields" });
  let preview = null;
  let mapping;
  let running = false;
  let abort;
  let revision = 0;
  let view;
  const apply = button("Import reviewed entries", commit, { className: "primary", disabled: true });
  const review = button("Review import", prepare);
  const cancel = button("Cancel", () => (running ? abort?.abort() : view.close()));
  const content = node(
    "div",
    { className: "resource-dialog-form" },
    field("File", file),
    field("Destination", destination),
    node(
      "div",
      { className: "resource-fields" },
      field("Resource name", name),
      field("Source language", source),
      field("Target language", target)
    ),
    mappingArea,
    message,
    previewArea
  );
  view = dialog("Import resource", content, [cancel, review, apply]);
  view.addEventListener("cancel", (event) => {
    if (running) {
      event.preventDefault();
      abort?.abort();
    }
  });
  view.addEventListener("resource-request-close", (event) => {
    if (running) {
      event.preventDefault();
      abort?.abort();
    }
  });
  view.addEventListener("close", () => {
    revision++;
  });
  for (const input of [name, source, target, file])
    input.addEventListener("input", () => {
      revision++;
      preview = null;
      apply.disabled = true;
    });
  file.addEventListener("change", () => {
    mapping = undefined;
    mappingArea.replaceChildren();
    if (!name.value) name.value = file.files?.[0]?.name.replace(/\.[^.]+$/, "") || "";
  });
  destination.addEventListener("change", () => {
    revision++;
    const selected = resources.find((item) => item.id === destination.value);
    if (selected) {
      name.value = selected.name;
      source.value = selected.sourceLang;
      target.value = selected.targetLang;
    }
    for (const input of [name, source, target]) input.disabled = Boolean(selected);
    preview = null;
    apply.disabled = true;
  });
  if (resource) for (const input of [name, source, target]) input.disabled = true;
  async function prepare() {
    if (!file.files?.[0]) {
      message.textContent = t("Choose a file first.");
      return;
    }
    review.disabled = true;
    apply.disabled = true;
    preview = null;
    const requestRevision = ++revision;
    message.textContent = t("Reading and validating resource…");
    try {
      const prepared = await transfer.prepareImport(file.files[0], {
        type,
        resourceId: destination.value || undefined,
        name: name.value.trim(),
        sourceLang: ui.languageInput.normalizeElement(source),
        targetLang: ui.languageInput.normalizeElement(target),
        mapping
      });
      if (requestRevision !== revision || !view.isConnected) return;
      preview = prepared;
      if (!source.value) source.value = preview.sourceLang || "";
      if (!target.value) target.value = preview.targetLang || "";
      if (!name.value) name.value = preview.name || "";
      if (preview.columns?.length && !mappingArea.children.length) {
        mapping = { ...preview.mapping };
        for (const [key, label] of [
          ["source", "Source column"],
          ["target", "Target column"],
          ["notes", "Notes column"],
          ["status", "Status column"]
        ]) {
          const choices = preview.columns.map((column) => [String(column.index), column.label]);
          if (["notes", "status"].includes(key)) choices.unshift(["-1", t("Ignore column")]);
          const input = select(
            label,
            choices,
            String(mapping[key] ?? (key === "source" ? 0 : key === "target" ? 1 : -1)),
            { literalChoices: true }
          );
          input.addEventListener("change", () => {
            revision++;
            mapping[key] = Number(input.value);
            preview = null;
            apply.disabled = true;
          });
          mappingArea.append(field(label, input));
        }
        const advanced = node("details", {}, node("summary", {}, t("Terminology details")));
        for (const [key, label] of [
          ["definition", "Definition"],
          ["domain", "Domain"],
          ["subject", "Subject"],
          ["partOfSpeech", "Part of speech"],
          ["usageExample", "Usage example"],
          ["caseSensitivity", "Case sensitivity"],
          ["matchMode", "Matching"],
          ["fuzzyThreshold", "Fuzzy threshold"]
        ]) {
          const input = select(
            label,
            [["-1", t("Ignore column")], ...preview.columns.map((column) => [String(column.index), column.label])],
            String(mapping[key] ?? -1),
            { literalChoices: true }
          );
          input.addEventListener("change", () => {
            revision++;
            mapping[key] = Number(input.value);
            preview = null;
            apply.disabled = true;
          });
          advanced.append(field(label, input));
        }
        mappingArea.append(advanced);
        const header = node("input", { type: "checkbox", checked: mapping.hasHeader !== false });
        header.addEventListener("change", () => {
          revision++;
          mapping.hasHeader = header.checked;
          preview = null;
          apply.disabled = true;
        });
        mappingArea.append(field("First row contains headings", header));
      }
      const sourceKey = type === "tm" ? "source" : "sourceTerm";
      const targetKey = type === "tm" ? "target" : "targetTerm";
      const body = node("tbody");
      for (const row of (preview.sampleRows || preview.rows || []).slice(0, 10))
        body.append(
          node(
            "tr",
            {},
            node("td", { dir: "auto", "data-i18n-skip": true }, row[sourceKey] || ""),
            node("td", { dir: "auto", "data-i18n-skip": true }, row[targetKey] || "")
          )
        );
      previewArea.replaceChildren(
        node(
          "p",
          {},
          `${preview.total} ${t("entries")} · ${preview.duplicates?.exact || 0} ${t("exact duplicates")} · ${preview.invalid || 0} ${t("invalid entries")}`
        ),
        node("p", {}, `${t("Detected languages")}: ${(preview.detectedLanguages || []).join(" · ") || "—"}`),
        node(
          "p",
          { className: "muted" },
          t("Existing entries are preserved. Exact duplicates are skipped; alternative translations are retained.")
        ),
        node("p", { className: "muted" }, t("Preview shows the first 10 entries.")),
        node(
          "table",
          { className: "resource-data-table" },
          node(
            "thead",
            {},
            node("tr", {}, node("th", { scope: "col" }, t("Source")), node("th", { scope: "col" }, t("Target")))
          ),
          body
        )
      );
      if (preview.validation?.invalidRows?.length) {
        const validation = structuredClone(preview.validation);
        previewArea.append(
          button("Download validation report", () =>
            ui.download({
              filename: "resource-validation.json",
              content: JSON.stringify(validation, null, 2),
              mimeType: "application/json"
            })
          )
        );
      }
      message.textContent =
        [...(preview.validation?.errors || []), ...(preview.validation?.warnings || [])]
          .map((item) => t(item.message || String(item)))
          .join(" · ") || t("Review the preview, then import.");
      apply.disabled =
        !preview.valid || preview.validation?.errors?.length || !source.value || !target.value || !name.value;
    } catch (error) {
      if (requestRevision === revision) message.textContent = t(error.message);
    } finally {
      review.disabled = false;
    }
  }
  async function commit() {
    if (!preview || running) return;
    running = true;
    onBusyChange(true);
    const controls = [...content.querySelectorAll("input,select")].map((control) => ({
      control,
      disabled: control.disabled
    }));
    for (const { control } of controls) control.disabled = true;
    abort = new AbortController();
    apply.disabled = review.disabled = true;
    try {
      const result = await transfer.commitImport(preview, {
        signal: abort.signal,
        onProgress: (progress) => {
          message.textContent = `${t("Importing")} ${progress.saved ?? progress.imported ?? progress.done ?? 0} / ${progress.total || preview.total}`;
        }
      });
      const importErrors = result.errors || [];
      message.textContent = `${result.imported} / ${preview.valid} ${t("imported")} · ${result.skipped} ${t("skipped")} · ${result.invalid || 0} ${t("invalid entries")}${result.cancelled ? ` · ${t("Cancelled")}` : ""}${importErrors.length ? ` · ${t("Import stopped. Review the errors before retrying.")} ${importErrors.map((error) => t(error.message || String(error))).join(" · ")}` : ""}`;
      message.classList.toggle("error", Boolean(importErrors.length));
      message.setAttribute("role", importErrors.length ? "alert" : "status");
      const report = {
        file: preview.fileName,
        imported: result.imported,
        skipped: result.skipped,
        invalid: result.invalid,
        cancelled: result.cancelled,
        errors: result.errors
      };
      previewArea.prepend(
        button("Download import report", () =>
          ui.download({
            filename: "resource-import-report.json",
            content: JSON.stringify(report, null, 2),
            mimeType: "application/json"
          })
        )
      );
      await onComplete(result);
      preview = null;
      cancel.textContent = t("Close");
    } catch (error) {
      message.textContent = t(error.message);
      message.classList.add("error");
      message.setAttribute("role", "alert");
      apply.disabled = true;
    } finally {
      running = false;
      onBusyChange(false);
      review.disabled = false;
      for (const { control, disabled } of controls) control.disabled = disabled;
    }
  }
  return view;
}
