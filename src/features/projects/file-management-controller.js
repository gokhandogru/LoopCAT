/** Shared file actions; every closure captures the intended project and file. @param {any} options */
export function createFileManagementController(options) {
  const { document: doc, session, service, translate: t } = options;
  const selection = new Set();
  let selectionProject = "",
    abort = null,
    busy = false;
  const node = (tag, text = "", parent = null) => {
    const e = doc.createElement(tag);
    e.textContent = t(text);
    parent?.append(e);
    return e;
  };
  const dialog = node("dialog");
  dialog.id = "fileManagementDialog";
  dialog.className = "statistics-dialog";
  doc.body.append(dialog);
  const header = node("header", "", dialog);
  header.className = "statistics-heading";
  const title = node("h2", "File management", header);
  title.id = "fileManagementTitle";
  dialog.setAttribute("aria-labelledby", title.id);
  const status = node("p", "", dialog);
  status.setAttribute("role", "status");
  const content = node("section", "", dialog),
    footer = node("footer", "", dialog);
  footer.className = "statistics-controls";
  const fail = (error) => {
    if (!dialog.open) show("File action could not be completed");
    status.textContent = error.message || String(error);
  };
  const button = (label, parent, action) => {
    const b = node("button", label, parent);
    b.type = "button";
    b.addEventListener("click", () => void Promise.resolve().then(action).catch(fail));
    return b;
  };
  button("Close", header, () => {
    if (busy) {
      abort?.abort();
      return;
    }
    dialog.close();
  });
  dialog.addEventListener("cancel", (event) => {
    if (busy) {
      event.preventDefault();
      abort?.abort();
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    abort?.abort();
    service.cancel();
  });
  function show(label) {
    title.textContent = t(label);
    content.replaceChildren();
    footer.replaceChildren();
    status.textContent = "";
    if (!dialog.open) options.showDialog(dialog);
  }
  function assertProject(projectId) {
    if (session.getProject()?.id !== projectId)
      throw Error(t("The project changed. Reopen file actions in the intended project."));
  }
  async function mutation(projectId, action) {
    if (busy) return;
    globalThis.window?.CatHan?.ownership?.assertWritable(projectId);
    busy = true;
    try {
      assertProject(projectId);
      await options.flush();
      const result = await action();
      await options.refresh(projectId);
      return result;
    } finally {
      busy = false;
    }
  }
  function rename(projectId, file) {
    show("Rename file");
    const label = node("label", "Filename", content),
      input = node("input", "", label);
    input.value = file.name;
    input.maxLength = 240;
    node("p", "The extension is preserved. The original disk file is not renamed.", content);
    const warning = node("p", "", content);
    input.addEventListener("input", () => {
      warning.textContent = session
        .getProject()
        .documents.some((d) => d.id !== file.id && d.name.toLowerCase() === input.value.trim().toLowerCase())
        ? t("Another file has this name. Both files will remain separate.")
        : "";
    });
    button("Save name", footer, async () => {
      await mutation(projectId, () => service.rename(projectId, file.id, input.value));
      dialog.close();
    });
  }
  function review(projectId, file, preview) {
    show("Review source update");
    node(
      "p",
      `${file.name} · ${preview.rows.length} segments · ${preview.rows.filter((r) => r.safeReuse).length} carried · ${preview.rows.filter((r) => r.disposition === "changed").length} changed · ${preview.rows.filter((r) => r.disposition === "added").length} added · ${preview.rows.filter((r) => r.disposition === "ambiguous").length} ambiguous · ${preview.removed.length} unmatched old segments`,
      content
    );
    node("p", "Changed source translations remain suggestions. Applying creates a recoverable new version.", content);
    const choices = {},
      area = node("div", "", content),
      nav = node("div", "", content);
    let page = 0;
    const draw = () => {
      area.replaceChildren();
      nav.replaceChildren();
      for (const row of preview.rows.slice(page * 50, page * 50 + 50)) {
        const item = node("article", "", area);
        item.className = "file-update-row";
        node("h3", `${row.index + 1} · ${row.disposition}`, item);
        if (row.previousSource) node("p", `${t("Previous source")}: ${row.previousSource}`, item);
        node("p", `${t("New source")}: ${row.source}`, item);
        if (row.previousTarget) node("p", `${t("Previous translation")}: ${row.previousTarget}`, item);
        if (row.conflict) {
          node("p", `${t("Incoming translation")}: ${row.incomingTarget}`, item);
          const label = node("label", "Translation choice", item),
            select = node("select", "", label);
          for (const [value, text] of [
            ["", "Choose…"],
            ["current", row.safeReuse ? "Keep current translation" : "Leave target empty"],
            ["incoming", "Use incoming as draft"]
          ]) {
            const option = node("option", text, select);
            option.value = value;
          }
          select.value = choices[row.index] || "";
          select.addEventListener("change", () => {
            choices[row.index] = select.value;
          });
        }
      }
      if (page)
        button("Previous", nav, () => {
          page--;
          draw();
        });
      if ((page + 1) * 50 < preview.rows.length)
        button("Next", nav, () => {
          page++;
          draw();
        });
    };
    draw();
    if (preview.rows.some((r) => r.conflict)) {
      button("Keep current for all conflicts", footer, () => {
        choices.all = "current";
        status.textContent = t(
          "All unresolved conflicts will keep current translations, or empty targets where reuse is unsafe."
        );
      });
      button("Use incoming for all conflicts", footer, () => {
        choices.all = "incoming";
        status.textContent = t("All unresolved conflicts will use incoming translations as drafts.");
      });
    }
    if (preview.removed.length) {
      const removed = node("details", "", content);
      node("summary", "Previous segments not safely carried", removed);
      for (const row of preview.removed.slice(0, 50)) node("p", row.source, removed);
      node("p", "All prior segments remain available in Version history.", removed);
    }
    const requestId = crypto.randomUUID();
    const apply = button("Apply source update", footer, async () => {
      apply.disabled = true;
      try {
        status.textContent = t("Validating and saving…");
        await mutation(projectId, () => service.commit(preview.id, choices, requestId));
        dialog.close();
        await options.openDocument(file.id);
      } finally {
        apply.disabled = false;
      }
    });
    apply.disabled = preview.noChanges && !preview.restoredFromVersionId;
    if (apply.disabled)
      status.textContent = t("No update needed: source, extraction settings and translations are unchanged.");
  }
  function update(projectId, file) {
    show("Update source file");
    node(
      "p",
      `${file.name} · ${t("Select one replacement of the same format. Your current file is retained until you apply the review.")}`,
      content
    );
    const encodingLabel = node("label", "Encoding", content),
      encoding = node("select", "", encodingLabel);
    for (const [value, label] of options.encodingOptions()) {
      const option = node("option", label, encoding);
      option.value = value;
    }
    encoding.value = file.importOptions?.encoding || "auto";
    const label = node("label", "Replacement file", content),
      input = node("input", "", label);
    input.type = "file";
    input.accept = options.accept;
    input.addEventListener(
      "change",
      () =>
        void (async () => {
          if (!input.files?.length) return;
          abort = new AbortController();
          busy = true;
          input.disabled = true;
          try {
            assertProject(projectId);
            await options.flush();
            status.textContent = t("Parsing and comparing source…");
            const preview = await service.preview(projectId, file.id, input.files[0], {
              encoding: encoding.value,
              signal: abort.signal
            });
            assertProject(projectId);
            if (dialog.open) review(projectId, file, preview);
          } catch (error) {
            if (error.name !== "AbortError") fail(error);
            else status.textContent = t("Update canceled. The current file was retained.");
          } finally {
            busy = false;
            input.disabled = false;
          }
        })()
    );
    button("Cancel comparison", footer, () => abort?.abort());
  }
  async function history(projectId, file) {
    show("Version history");
    node("p", `${file.name} · ${t("Current version")}: ${file.sourceRevision || 1}`, content);
    const versions = await service.versions(projectId, file.id);
    if (!versions.length) node("p", "No previous source versions yet.", content);
    for (const version of versions) {
      const item = node("article", "", content);
      item.className = "file-update-row";
      node(
        "h3",
        `${t("Version")} ${version.version} · ${version.documentInfo.originalFilename || version.documentInfo.name}`,
        item
      );
      node("p", `${version.createdAt} · ${version.segmentCount} segments`, item);
      button("Inspect version", item, async () => {
        const rows = await service.versionSegments(version.id);
        show("Historical source version");
        let page = 0;
        const area = node("div", "", content),
          nav = node("div", "", content);
        const draw = () => {
          area.replaceChildren();
          nav.replaceChildren();
          for (const row of rows.slice(page * 50, page * 50 + 50)) {
            const entry = node("article", "", area);
            entry.className = "file-update-row";
            node("p", row.source, entry);
            node("p", row.target || "", entry);
            node("p", row.status || "", entry);
            for (const comment of row.comments || []) node("p", comment.text || comment, entry);
          }
          if (page)
            button("Previous", nav, () => {
              page--;
              draw();
            });
          if ((page + 1) * 50 < rows.length)
            button("Next", nav, () => {
              page++;
              draw();
            });
        };
        draw();
        button("Back to versions", footer, () => history(projectId, file));
      });
      button("Restore this version…", item, async () => {
        await options.flush();
        const preview = await service.restoreVersion(projectId, file.id, version.id);
        review(projectId, file, preview);
      });
    }
  }
  function trash(projectId, files) {
    show("Move files to Trash");
    node(
      "p",
      `${files.length} ${t("files selected. Their translations and previous versions can be restored from Project Trash.")}`,
      content
    );
    for (const file of files) node("p", file.name, content);
    button("Move to Trash", footer, async () => {
      await mutation(projectId, () =>
        options.moveTrash(
          projectId,
          files.map((f) => f.id)
        )
      );
      selection.clear();
      dialog.close();
    });
  }
  async function projectTrash() {
    const projectId = session.getProject()?.id;
    if (!projectId) return;
    show("Project Trash");
    const entries = (await options.trash.list()).filter(
      (e) => e.projectId === projectId && e.entityType === "document"
    );
    const selected = new Set();
    if (!entries.length) node("p", "No deleted files in this project.", content);
    for (const entry of entries) {
      const item = node("article", "", content);
      item.className = "file-update-row";
      const label = node("label", entry.label, item),
        checkbox = node("input", "", label);
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () =>
        checkbox.checked ? selected.add(entry.id) : selected.delete(entry.id)
      );
      button("Restore", item, async () => {
        await mutation(projectId, () => options.restoreMany([entry.id]));
        await projectTrash();
      });
    }
    if (entries.length)
      button("Restore selected", footer, async () => {
        if (!selected.size || selected.size > 50) throw Error(t("Select between 1 and 50 files."));
        await mutation(projectId, () => options.restoreMany([...selected]));
        await projectTrash();
      });
  }
  async function dispatch(action, projectId, file) {
    assertProject(projectId);
    file = session.getProject().documents.find((document) => document.id === file.id);
    if (!file) throw Error(t("This file is no longer in the project."));
    if (["rename", "update", "trash"].includes(action)) globalThis.window?.CatHan?.ownership?.assertWritable(projectId);
    await options.flush();
    switch (action) {
      case "open":
        return options.openDocument(file.id);
      case "statistics":
        return options.statistics([file.id]);
      case "export":
        return options.exportFile(file);
      case "rename":
        return rename(projectId, file);
      case "update":
        return update(projectId, file);
      case "history":
        return history(projectId, file);
      case "trash":
        return trash(projectId, [file]);
    }
  }
  function mountMenu(root, file, { selectable = false, omit = [], label = "Actions" } = {}) {
    const projectId = session.getProject()?.id;
    if (selectionProject !== projectId) {
      selection.clear();
      selectionProject = projectId;
    }
    if (selectable) {
      const label = node("label", "", root.closest(".file-card") || root),
        check = node("input", "", label);
      label.className = "file-selection";
      check.type = "checkbox";
      check.checked = selection.has(file.id);
      check.setAttribute("aria-label", t("Select file") + " " + file.name);
      check.addEventListener("change", () => {
        if (check.checked && selection.size >= 50) {
          check.checked = false;
          return;
        }
        check.checked ? selection.add(file.id) : selection.delete(file.id);
        updateSelection();
      });
    }
    const menu = node("details", "", root);
    menu.className = "menu action-menu file-action-menu";
    const panel = node("div", "", menu);
    panel.className = "menu-panel";
    node("summary", label, menu).setAttribute("aria-label", t("Actions for") + " " + file.name);
    menu.prepend(menu.querySelector("summary"));
    for (const [action, label] of [
      ["open", "Open"],
      ["statistics", "Statistics"],
      ["export", "Export translation…"],
      ["rename", "Rename…"],
      ["update", "Update source file…"],
      ["history", "Version history…"],
      ["trash", "Move to Trash…"]
    ]) {
      if (omit.includes(action)) continue;
      const b = button(label, panel, () => {
        menu.open = false;
        return dispatch(action, projectId, file);
      });
      b.dataset.fileAction = action;
      if (action === "trash") b.classList.add("menu-danger");
      if (
        ["rename", "update", "trash"].includes(action) &&
        globalThis.window?.CatHan?.ownership?.isReadOnly(projectId)
      ) {
        b.disabled = true;
        b.title = t("This project is read-only.");
      }
    }
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menu.open = false;
        menu.querySelector("summary").focus();
        event.stopPropagation();
      }
    });
  }
  const toolbar = node("div", "", options.hosts.projectTrash);
  toolbar.className = "statistics-controls";
  toolbar.id = "fileManagementToolbar";
  button("Project Trash", toolbar, projectTrash);
  const selectionActions = options.hosts.fileSelection;
  selectionActions.className = "selection-bar";
  selectionActions.hidden = true;
  const selectedLabel = node("span", "0 files selected", selectionActions);
  button("Selected file statistics", selectionActions, () => {
    if (!selection.size || selection.size > 50) throw Error(t("Select between 1 and 50 files."));
    return options.statistics([...selection]);
  });
  button("Move selected to Trash", selectionActions, () => {
    const files = (session.getProject()?.documents || []).filter((f) => selection.has(f.id));
    if (!files.length || files.length > 50) throw Error(t("Select between 1 and 50 files."));
    return trash(session.getProject().id, files);
  });
  button("Clear file selection", selectionActions, () => {
    selection.clear();
    options.render();
    updateSelection();
  });
  function updateSelection() {
    selectionActions.hidden = !selection.size;
    selectedLabel.textContent = t("Selected files: {count} / 50", { count: selection.size });
  }
  const editor = options.hosts.fileActions;
  let editorKey = "";
  editor.className = "action-group";
  editor.id = "editorFileActions";
  function refresh() {
    const project = session.getProject();
    const files = Array.isArray(project?.documents)
      ? project.documents.filter((file) => file && typeof file === "object")
      : [];
    if (selectionProject !== project?.id) {
      selection.clear();
      selectionProject = project?.id || "";
    }
    for (const selected of selection) if (!files.some((d) => d.id === selected)) selection.delete(selected);
    updateSelection();
    const file = files.find((d) => d.id === options.getDocumentId());
    const key = JSON.stringify([
      project?.id,
      file?.id,
      file?.name,
      globalThis.window?.CatHan?.ownership?.isReadOnly(project?.id)
    ]);
    if (key !== editorKey) {
      editorKey = key;
      editor.replaceChildren();
      if (file) mountMenu(editor, file, { omit: ["open", "statistics", "export"], label: "File actions" });
      else {
        const unavailable = button("File actions", editor, () => {});
        unavailable.disabled = true;
        unavailable.title = t("Select a file first.");
      }
    }
  }
  function inspectHistoricalSegment(row) {
    show("Historical source version");
    node("p", row.documentName || "", content);
    node("p", row.source, content);
    node("p", row.target || "", content);
    node("p", row.status || "", content);
    node("p", "This segment belongs to a previous source version and is read-only.", content);
  }
  return { mountMenu, dispatch, projectTrash, refresh, inspectHistoricalSegment };
}
