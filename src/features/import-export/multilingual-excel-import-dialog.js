function columnNumber(value) {
  const letter = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(letter)) return 0;
  const number = [...letter].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0);
  return number <= 16384 ? number : 0;
}

/** @param {any} options */
export function createMultilingualExcelImportDialog(options) {
  const { document: doc, translate: t, inspect, showDialog } = options;
  let pending = false;

  async function configure(file, currentMapping = null) {
    if (pending) throw new Error(t("Finish the current Excel column review first."));
    pending = true;
    let dialog;
    try {
      const workbook = await inspect(file);
      if (!workbook?.sheets?.length) throw new Error(t("No worksheets were found in this workbook."));
      const node = (tag, parent = null, text = "") => {
        const element = doc.createElement(tag);
        element.textContent = String(text);
        parent?.append(element);
        return element;
      };
      dialog = node("dialog");
      dialog.id = "multilingualExcelImportDialog";
      dialog.className = "statistics-dialog multilingual-excel-dialog";
      const form = node("form", dialog);
      form.className = "excel-column-form";
      form.noValidate = true;
      const body = node("div", form);
      body.className = "excel-column-body";
      body.tabIndex = 0;
      body.setAttribute("role", "region");
      body.setAttribute("aria-labelledby", "multilingualExcelTitle");
      node("h2", body, t("Excel columns")).id = "multilingualExcelTitle";
      dialog.setAttribute("aria-labelledby", "multilingualExcelTitle");
      node("p", body, file.name).className = "excel-file-name";
      const help = node(
        "p",
        body,
        t(
          "Import one source column and one target column. Export writes translations into the target column and keeps the other columns and worksheets."
        )
      );
      help.id = "multilingualExcelHelp";
      dialog.setAttribute("aria-describedby", help.id);
      const fields = node("div", body);
      fields.className = "excel-column-fields";
      const field = (caption, id, tag = "select") => {
        const label = node("label", fields);
        node("span", label, t(caption));
        const control = node(tag, label);
        control.id = id;
        return control;
      };
      const sheetSelect = field("Worksheet", "excelImportSheet");
      for (const sheet of workbook.sheets) node("option", sheetSelect, sheet.name).value = sheet.path;
      sheetSelect.value = workbook.sheets.some((sheet) => sheet.path === currentMapping?.sheetPath)
        ? currentMapping.sheetPath
        : workbook.sheets[0].path;
      const source = field("Source column", "excelImportSource");
      const target = field("Target column", "excelImportTarget", "input");
      target.type = "text";
      target.maxLength = 3;
      target.autocomplete = "off";
      target.spellcheck = false;
      target.setAttribute("list", "excelImportTargetColumns");
      target.setAttribute("aria-describedby", "excelImportTargetHelp");
      target.value = currentMapping?.targetColumn || "B";
      const targetColumns = node("datalist", body);
      targetColumns.id = "excelImportTargetColumns";
      node("p", body, t("The target can be an empty column. Enter its letter, for example D or AA.")).id =
        "excelImportTargetHelp";
      const checks = node("div", body);
      checks.className = "excel-column-options";
      const checkbox = (caption, id, checked) => {
        const label = node("label", checks);
        const input = node("input", label);
        input.type = "checkbox";
        input.id = id;
        input.checked = checked;
        node("span", label, t(caption));
        return input;
      };
      const header = checkbox(
        "First row contains column names",
        "excelImportHeader",
        currentMapping?.firstRowIsHeader ?? true
      );
      const existing = checkbox(
        "Import existing translations as drafts",
        "excelImportExisting",
        currentMapping?.importExistingTargets ?? true
      );
      node(
        "p",
        body,
        t(
          "Empty source cells are skipped. Numbers, formulas, and merged cells in the selected columns are preserved and excluded from translation."
        )
      );
      const preview = node("div", body);
      preview.className = "statistics-table-wrap excel-column-preview";
      preview.tabIndex = 0;
      preview.setAttribute("role", "region");
      preview.setAttribute("aria-label", t("Preview of the first worksheet rows"));
      const footer = node("footer", form);
      footer.className = "excel-column-footer";
      const error = node("p", footer);
      error.id = "excelImportError";
      error.className = "excel-column-error";
      error.setAttribute("role", "alert");
      const actions = node("div", footer);
      actions.className = "statistics-controls excel-column-actions";
      const allText = node("button", actions, t("Import all text instead"));
      allText.type = "button";
      allText.className = "excel-import-all-text";
      const cancel = node("button", actions, t("Cancel"));
      cancel.type = "button";
      const apply = node("button", actions, t("Use these columns"));
      apply.type = "submit";
      apply.className = "primary";
      let result = null;
      const selectedSheet = () => workbook.sheets.find((sheet) => sheet.path === sheetSelect.value);
      const targetLetter = () => target.value.trim().toUpperCase();

      function validate() {
        const message = !columnNumber(target.value)
          ? t("Enter a target column from A to XFD.")
          : source.value === targetLetter()
            ? t("Choose different source and target columns.")
            : !columnNumber(source.value)
              ? t("Choose a source column.")
              : "";
        error.textContent = message;
        target.setAttribute("aria-invalid", message ? "true" : "false");
        apply.disabled = Boolean(message);
        return !message;
      }

      function renderPreview() {
        preview.replaceChildren();
        const table = node("table", preview);
        node("caption", table, t("Preview of the first worksheet rows"));
        const heading = node("tr", node("thead", table));
        for (const label of [t("Row"), `${t("Source")} · ${source.value}`, `${t("Target")} · ${targetLetter()}`]) {
          node("th", heading, label).scope = "col";
        }
        const body = node("tbody", table);
        for (const row of selectedSheet()?.previewRows || []) {
          const tr = node("tr", body);
          const isHeader = header.checked && row.rowNumber === 1;
          if (isHeader) tr.className = "excel-preview-header";
          node("th", tr, String(row.rowNumber) + (isHeader ? ` · ${t("Header (skipped)")}` : "")).scope = "row";
          node("td", tr, row.cells?.[source.value] || "");
          const targetCell = node("td", tr, row.cells?.[targetLetter()] || "");
          if (!existing.checked && !isHeader) targetCell.className = "excel-preview-ignored";
        }
        validate();
      }

      function renderColumns(preferredSource = source.value || "A") {
        source.replaceChildren();
        targetColumns.replaceChildren();
        const columns = selectedSheet()?.columns || [];
        for (const column of columns) {
          const fullLabel = column.label ? `${column.letter} — ${column.label}` : column.letter;
          const label = fullLabel.length > 80 ? fullLabel.slice(0, 79) + "…" : fullLabel;
          node("option", source, label).value = column.letter;
          node("option", targetColumns, label).value = column.letter;
        }
        source.value = columns.some((column) => column.letter === preferredSource)
          ? preferredSource
          : columns[0]?.letter || "";
        renderPreview();
      }

      sheetSelect.addEventListener("change", () => renderColumns());
      source.addEventListener("change", renderPreview);
      target.addEventListener("input", renderPreview);
      header.addEventListener("change", renderPreview);
      existing.addEventListener("change", renderPreview);
      allText.addEventListener("click", () => {
        result = false;
        dialog.close();
      });
      cancel.addEventListener("click", () => dialog.close());
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validate()) return;
        result = {
          sheetPath: sheetSelect.value,
          sourceColumn: source.value,
          targetColumn: targetLetter(),
          firstRowIsHeader: header.checked,
          importExistingTargets: existing.checked
        };
        dialog.close();
      });
      renderColumns(currentMapping?.sourceColumn || "A");
      doc.body.append(dialog);
      return await new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(result), { once: true });
        if (showDialog(dialog, source) === false) resolve(null);
      });
    } finally {
      dialog?.remove();
      pending = false;
    }
  }

  return Object.freeze({ configure });
}
