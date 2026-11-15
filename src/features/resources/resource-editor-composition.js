import { createResourceUi } from "./resource-ui.js";
import { createResourceEditorSession } from "./resource-editor-session.js";
import { createResourceEditRepository } from "./resource-edit-repository.js";
import { createResourceQueryService } from "./resource-query-service.js";
import { createResourceTransferService } from "./resource-transfer-service.js";
import { openResourceImportDialog } from "./resource-import-dialog.js";
import { planResourceChanges, planDuplicateRemoval } from "./resource-maintenance.js";
import { createThemeController } from "../../ui/theme-controller.js";

/** Resource-only startup: no project ownership, project editor, or backup timers. */
export async function installResourceEditorComposition({ appRuntime, compatibilityModules: modules, window, route }) {
  const { document } = window;
  const { storage, i18n } = modules;
  const ui = createResourceUi(document, i18n);
  const { node, button, select, field, dialog, choose, t, safeMetadata } = ui;
  async function returnToLibrary() {
    const opened = await appRuntime.platform.openResourceLibrary();
    if (opened.mode !== "same-tab") window.close();
  }
  const locale = await appRuntime.localeLoader.initialize();
  i18n.setLocale(locale);
  await createThemeController({
    documentRoot: document.documentElement,
    preferencesRepository: appRuntime.preferencesRepository,
    themeColorMeta: document.querySelector('meta[name="theme-color"]'),
    select: null
  }).initialize();
  if (window.LoopCATDesktop?.consumeRecoveryRequest) {
    const recoveryRequest = await window.LoopCATDesktop.consumeRecoveryRequest();
    if (recoveryRequest.needed) await storage.replayCommittedJournal();
  }
  document.body.classList.add("resource-editor-window");
  const languages = document.getElementById("languageOptions");
  const root = node("main", { className: "resource-editor", id: "resourceEditor", "aria-label": t("Resource editor") });
  document.body.replaceChildren(root);
  if (languages) document.body.append(languages);
  ui.languageInput.renderDatalists();
  const queryService = createResourceQueryService({ storage });
  const repository = createResourceEditRepository({ storage, tm: modules.tm, termbase: modules.termbase });
  const transfer = createResourceTransferService({ ...modules });
  const type = route.type;
  const store = type === "tm" ? "tmEntries" : "terms";
  const sourceKey = type === "tm" ? "source" : "sourceTerm";
  const targetKey = type === "tm" ? "target" : "targetTerm";
  let resource = await storage.get("resources", route.resourceId);
  if (!resource || resource.type !== (type === "tm" ? "tm" : "termbase")) {
    root.append(
      node("h1", {}, t("Resource unavailable")),
      node("p", {}, t("This resource may have been removed. Return to Resources to choose another.")),
      button("Back to Resources", returnToLibrary)
    );
    return;
  }
  document.title = `${safeMetadata(resource.name)} — ${type === "tm" ? t("Translation memory") : t("Termbase")} — LoopCAT`;
  let rows = [];
  let result = { rows: [], total: 0, nextCursor: null, previousCursor: null, pageIndex: 0, generation: "" };
  let cursor = null;
  let selectedId = "";
  let activeRecord = null;
  let queryEpoch = 0;
  let queryAbort;
  let operationAbort;
  let busy = false;
  let closing = false;
  let lastOperation = "";
  const checked = new Set();
  const sessionId = storage.makeId("resource-session");
  const status = node("p", {
    id: "resourceEditorStatus",
    className: "resource-editor-status",
    role: "status",
    "aria-live": "polite"
  });
  const draftStatus = node("span", { id: "resourceDraftStatus", className: "resource-save-state" });
  const recovery = node("div", { className: "resource-recovery", hidden: true });
  const heading = node("h1", { "data-i18n-skip": true }, safeMetadata(resource.name));
  const subtitle = node("p", { className: "muted" }, `${resource.sourceLang || "—"} → ${resource.targetLang || "—"}`);
  const saveAll = button("Save all", () => run(() => save()), {
    id: "resourceSaveAll",
    className: "primary",
    disabled: true
  });
  const undo = button("Undo last operation", () => run(undoLast), { disabled: true });
  const search = node("input", {
    id: "resourceSearch",
    type: "search",
    placeholder: t("Search entries"),
    "aria-label": t("Search entries")
  });
  const searchField = select(
    "Search in",
    [
      ["both", "Source and target"],
      ["source", "Source"],
      ["target", "Target"]
    ],
    "both"
  );
  const searchMode = select(
    "Search mode",
    [
      ["contains", "Contains"],
      ["exact", "Exact match"]
    ],
    "contains"
  );
  const matchCase = node("input", { type: "checkbox" });
  const termStatus = select("Term status", [
    ["", "All statuses"],
    ["preferred", "Preferred"],
    ["admitted", "Admitted"],
    ["forbidden", "Forbidden"]
  ]);
  const domain = node("input", { placeholder: t("Domain"), "aria-label": t("Domain") });
  const provenance = node("input", { placeholder: t("Project / provenance"), "aria-label": t("Project / provenance") });
  const dateFrom = node("input", { type: "date", "aria-label": t("Updated from") });
  const dateTo = node("input", { type: "date", "aria-label": t("Updated until") });
  const duplicates = select("Duplicate review", [
    ["", "All entries"],
    ["exact", "Identical pairs"],
    ["alternatives", "Same-source alternatives"]
  ]);
  const sort = select(
    "Sort entries",
    [
      ["source", "Source"],
      ["target", "Target"],
      ["updatedAt", "Updated"],
      ["createdAt", "Created"]
    ],
    "source"
  );
  const direction = select(
    "Sort direction",
    [
      ["asc", "Ascending"],
      ["desc", "Descending"]
    ],
    "asc"
  );
  const raw = node("input", { type: "checkbox" });
  const filterChips = node("div", { className: "resource-filter-chips" });
  const filterDetails = node(
    "details",
    { className: "resource-editor-filters" },
    node("summary", {}, t("Filters and display")),
    node(
      "div",
      { className: "resource-filter-fields" },
      type === "tb" ? field("Term status", termStatus) : null,
      field("Domain", domain),
      type === "tm" ? field("Project / provenance", provenance) : null,
      field("Updated from", dateFrom),
      field("Updated until", dateTo),
      field("Duplicate review", duplicates),
      field("Sort by", sort),
      field("Sort direction", direction),
      field("Raw markup", raw)
    )
  );
  const selectedCount = node("span");
  const keepSelected = button("Keep selected versions", () => run(reviewDuplicates), { hidden: true });
  const bulk = node(
    "div",
    { className: "resource-bulk-toolbar", hidden: true },
    selectedCount,
    button("Select all matching results", () =>
      run(async () => {
        for (const row of await matching()) checked.add(row.id);
        renderRows();
      })
    ),
    button("Clear selection", () => {
      checked.clear();
      renderRows();
    }),
    button("Find and replace", () => run(() => maintenance("replace"))),
    type === "tb" ? button("Change status", () => run(() => maintenance("status"))) : null,
    button("Move to Trash", () => run(() => maintenance("delete"))),
    keepSelected
  );
  const tableBody = node("tbody");
  const pageCheck = node("input", { type: "checkbox", "aria-label": t("Select this page") });
  const table = node(
    "table",
    { className: "resource-data-table", "aria-label": t("Resource entries") },
    node(
      "thead",
      {},
      node(
        "tr",
        {},
        node("th", { scope: "col" }, pageCheck),
        node("th", { scope: "col" }, `${t("Source")} · ${resource.sourceLang || ""}`),
        node("th", { scope: "col" }, `${t("Target")} · ${resource.targetLang || ""}`),
        node("th", { scope: "col" }, t(type === "tb" ? "Status" : "Updated"))
      )
    ),
    tableBody
  );
  const resultsCount = node("span", { role: "status", "aria-live": "polite" });
  const prev = button(
    "Previous",
    () => {
      cursor = result.previousCursor;
      run(load);
    },
    { disabled: true }
  );
  const next = button(
    "Next",
    () => {
      cursor = result.nextCursor;
      run(load);
    },
    { disabled: true }
  );
  const tablePane = node(
    "section",
    { className: "resource-results-pane", "aria-label": t("Search results") },
    bulk,
    node("div", { className: "resource-results-scroll" }, table),
    node("footer", { className: "resource-pagination" }, resultsCount, prev, next)
  );
  const inspector = node("section", {
    className: "resource-entry-inspector",
    "aria-label": t("Selected entry"),
    id: "resourceEntryInspector"
  });
  const split = node("div", { className: "resource-editor-split" }, tablePane, inspector);
  root.append(
    node(
      "header",
      { className: "resource-editor-heading" },
      node(
        "div",
        {},
        node("span", { className: "resource-eyebrow" }, t(type === "tm" ? "Translation memory" : "Termbase")),
        heading,
        subtitle
      ),
      node(
        "div",
        { className: "resource-toolbar-actions" },
        draftStatus,
        saveAll,
        button("Back to Resources", () => run(back))
      )
    ),
    recovery,
    node(
      "div",
      { className: "resource-editor-toolbar" },
      search,
      searchField,
      searchMode,
      field("Match case", matchCase),
      button("Add entry", addEntry, { id: "resourceAddEntry" }),
      button("Import", () =>
        run(() =>
          openResourceImportDialog({
            ui,
            transfer,
            storage,
            type,
            resource,
            onBusyChange: setBusy,
            onComplete: async () => {
              queryService.invalidate(resource.id);
              await load();
            }
          })
        )
      ),
      button("Export", () => run(exportResource)),
      button("Find and replace", () => run(() => maintenance("replace"))),
      undo
    ),
    filterDetails,
    filterChips,
    status,
    split
  );
  function message(text, error = false) {
    status.textContent = t(text);
    status.classList.toggle("error", error);
  }
  function run(task) {
    return Promise.resolve()
      .then(task)
      .catch((error) => {
        if (error.name !== "AbortError") message(error.message || String(error), true);
      });
  }
  function setBusy(value) {
    busy = value;
    updateActions();
  }
  const session = createResourceEditorSession({
    repository,
    resourceId: resource.id,
    type,
    sessionId,
    onChange: () => {
      const count = session.size();
      draftStatus.textContent = session.isSaving()
        ? t("Saving…")
        : count
          ? `${count} ${t("unsaved changes")}`
          : t("Changes saved");
      updateActions();
      for (const row of tableBody.querySelectorAll("tr[data-entry-id]"))
        row.classList.toggle("has-draft", Boolean(session.get(row.dataset.entryId)));
      if (session.getFailure())
        message(`${t("Draft needs attention")}: ${session.getFailure().message || session.getFailure()}`, true);
    }
  });
  function updateActions() {
    saveAll.disabled = !session.size() || session.isSaving() || busy || resource.archived;
    undo.disabled = !lastOperation || session.size() > 0 || session.isSaving() || busy || resource.archived;
    inspector
      .querySelector("fieldset")
      ?.toggleAttribute("disabled", session.isSaving() || busy || Boolean(resource.archived));
    root.querySelector("#resourceAddEntry").disabled = session.isSaving() || busy || Boolean(resource.archived);
    for (const control of bulk.querySelectorAll("button")) control.disabled = session.isSaving() || busy;
  }
  function queryOptions() {
    return {
      type,
      resourceId: resource.id,
      query: { text: search.value, field: searchField.value, mode: searchMode.value, caseSensitive: matchCase.checked },
      filters: {
        status: termStatus.value,
        domain: domain.value,
        projectName: provenance.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        duplicates: duplicates.value
      },
      sort: { field: sort.value, direction: direction.value },
      cursor,
      limit: 100
    };
  }
  function matching() {
    return queryService.getMatchingEntries({ ...queryOptions(), cursor: null });
  }
  function renderRows() {
    const fragment = document.createDocumentFragment();
    for (const record of rows) {
      const values = session.get(record.id)?.values || record;
      const check = node("input", {
        type: "checkbox",
        checked: checked.has(record.id),
        "aria-label": `${t("Select entry")}: ${String(values[sourceKey]).slice(0, 80)}`
      });
      check.addEventListener("change", () => {
        if (check.checked) checked.add(record.id);
        else checked.delete(record.id);
        updateSelection();
      });
      const open = button("", () => selectEntry(record), {
        className: "resource-entry-link",
        "aria-label": `${t("Edit entry")}: ${String(values[sourceKey]).slice(0, 120)}`
      });
      open.append(
        ui.textPreview(
          String(values[sourceKey] || "").slice(0, 400),
          searchField.value !== "target" ? search.value : "",
          { raw: raw.checked, language: resource.sourceLang, caseSensitive: matchCase.checked }
        )
      );
      const row = node(
        "tr",
        {
          "data-entry-id": record.id,
          className: `${selectedId === record.id ? "selected" : ""} ${session.get(record.id) ? "has-draft" : ""}`
        },
        node("td", {}, check),
        node(
          "th",
          { scope: "row" },
          open,
          session.get(record.id) ? node("span", { className: "resource-badge" }, t("Draft")) : null
        ),
        node(
          "td",
          {},
          ui.textPreview(
            String(values[targetKey] || "").slice(0, 400),
            searchField.value !== "source" ? search.value : "",
            { raw: raw.checked, language: resource.targetLang, caseSensitive: matchCase.checked }
          )
        ),
        node(
          "td",
          {},
          type === "tb"
            ? node(
                "span",
                { className: `resource-badge status-${values.status || "preferred"}` },
                t(
                  values.status === "forbidden" || values.isForbidden
                    ? "Forbidden"
                    : values.status === "admitted"
                      ? "Admitted"
                      : "Preferred"
                )
              )
            : values.updatedAt
              ? new Date(values.updatedAt).toLocaleDateString(locale)
              : "—"
        )
      );
      row.addEventListener("click", (event) => {
        if (!event.target.closest("button,input")) selectEntry(record);
      });
      fragment.append(row);
    }
    if (!rows.length)
      fragment.append(
        node(
          "tr",
          {},
          node(
            "td",
            { colspan: "4", className: "resource-empty" },
            t("No matching entries. Adjust the filters or add an entry.")
          )
        )
      );
    tableBody.replaceChildren(fragment);
    resultsCount.textContent = `${result.total} ${t("matching entries")} · ${t("Page")} ${result.pageIndex + 1}`;
    prev.disabled = !result.previousCursor;
    next.disabled = !result.nextCursor;
    updateSelection();
  }
  function updateSelection() {
    bulk.hidden = !checked.size;
    keepSelected.hidden = !duplicates.value;
    selectedCount.textContent = `${checked.size} ${t("selected")}`;
    pageCheck.checked = Boolean(rows.length && rows.every((record) => checked.has(record.id)));
    pageCheck.indeterminate = rows.some((record) => checked.has(record.id)) && !pageCheck.checked;
  }
  pageCheck.addEventListener("change", () => {
    for (const row of rows)
      if (pageCheck.checked) checked.add(row.id);
      else checked.delete(row.id);
    renderRows();
  });
  function renderChips() {
    const chips = [];
    for (const [control, label] of [
      [search, "Search"],
      [domain, "Domain"],
      [provenance, "Provenance"],
      [termStatus, "Status"],
      [dateFrom, "From"],
      [dateTo, "Until"],
      [duplicates, "Duplicate review"]
    ]) {
      if (control.value)
        chips.push(
          button(`${t(label)}: ${control.value} ×`, () => {
            control.value = "";
            resetQuery();
          })
        );
    }
    if (chips.length)
      chips.push(
        button("Clear filters", () => {
          for (const control of [search, domain, provenance, termStatus, dateFrom, dateTo, duplicates])
            control.value = "";
          resetQuery();
        })
      );
    filterChips.replaceChildren(...chips);
  }
  async function load({ anchorId = "" } = {}) {
    queryAbort?.abort();
    queryAbort = new AbortController();
    const epoch = ++queryEpoch;
    table.setAttribute("aria-busy", "true");
    try {
      const response = await queryService.queryResourceEntries({
        ...queryOptions(),
        anchorId,
        signal: queryAbort.signal
      });
      if (epoch !== queryEpoch) return;
      result = response;
      rows = response.rows;
      cursor = response.cursor;
      renderRows();
      renderChips();
      subtitle.textContent = `${resource.sourceLang || "—"} → ${resource.targetLang || "—"} · ${result.total} ${t("matching entries")}${resource.archived ? ` · ${t("Archived")}` : ""}`;
    } finally {
      if (epoch === queryEpoch) table.removeAttribute("aria-busy");
    }
  }
  let searchTimer;
  function resetQuery() {
    cursor = null;
    checked.clear();
    run(load);
  }
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetQuery, 180);
  });
  for (const control of [
    searchField,
    searchMode,
    matchCase,
    termStatus,
    domain,
    provenance,
    dateFrom,
    dateTo,
    duplicates,
    sort,
    direction
  ])
    control.addEventListener("change", resetQuery);
  raw.addEventListener("change", renderRows);
  function selectEntry(record) {
    selectedId = record.id;
    activeRecord = record;
    root.classList.add("entry-selected");
    renderInspector();
    for (const row of tableBody.querySelectorAll("tr[data-entry-id]"))
      row.classList.toggle("selected", row.dataset.entryId === selectedId);
  }
  function renderInspector() {
    if (!activeRecord) {
      inspector.replaceChildren(
        node(
          "div",
          { className: "resource-empty" },
          node("h2", {}, t("Select an entry")),
          node("p", {}, t("Choose a source entry to review and edit its details."))
        )
      );
      return;
    }
    const values = session.get(selectedId)?.values || activeRecord;
    const form = node("form", { id: "resourceEntryForm" });
    const fields = node("fieldset", {
      className: "resource-entry-fields",
      disabled: busy || session.isSaving() || resource.archived
    });
    const title = node("h2", {}, activeRecord._new ? t("New entry") : t("Edit entry"));
    const addField = (key, label, multiline = false, choices = null) => {
      const control = choices
        ? select(label, choices, String(values[key] ?? ""))
        : node(multiline ? "textarea" : "input", {
            value: values[key] || "",
            rows: multiline ? (key === sourceKey || key === targetKey ? 5 : 3) : undefined
          });
      control.name = key;
      if ([sourceKey, targetKey].includes(key)) {
        control.required = true;
        control.dir = "auto";
        control.lang = key === sourceKey ? resource.sourceLang : resource.targetLang;
      }
      control.addEventListener(choices ? "change" : "input", () => {
        const patch = { [key]: key === "fuzzyThreshold" ? Number(control.value) : control.value };
        if (key === "status") patch.isForbidden = control.value === "forbidden";
        session.edit(activeRecord, patch);
      });
      return field(label, control);
    };
    fields.append(
      addField(sourceKey, type === "tm" ? "Source segment" : "Source term", true),
      addField(targetKey, type === "tm" ? "Target segment" : "Target term", true)
    );
    if (type === "tb") {
      fields.append(
        addField("status", "Term status", false, [
          ["preferred", "Preferred"],
          ["admitted", "Admitted"],
          ["forbidden", "Forbidden"]
        ]),
        addField("definition", "Definition", true),
        addField("usageExample", "Usage example", true),
        addField("notes", "Notes", true)
      );
      const advanced = node(
        "details",
        {},
        node("summary", {}, t("Terminology details")),
        addField("domain", "Domain"),
        addField("subject", "Subject"),
        addField("partOfSpeech", "Part of speech"),
        addField("matchMode", "Matching", false, [
          ["exact", "Exact"],
          ["prefix", "Prefix"],
          ["fuzzy", "Fuzzy"]
        ]),
        addField("fuzzyThreshold", "Fuzzy threshold")
      );
      advanced.append(
        addField("caseSensitivity", "Case sensitivity", false, [
          ["insensitive", "Case insensitive"],
          ["sensitive", "Case sensitive"],
          ["initial-sensitive", "Initial letter sensitive"]
        ])
      );
      if (values.conceptId)
        advanced.append(
          node(
            "p",
            { className: "muted" },
            t("Definition and domain changes also update linked entries in this concept.")
          )
        );
      fields.append(advanced);
    } else {
      fields.append(
        node(
          "details",
          {},
          node("summary", {}, t("Entry details")),
          addField("domain", "Domain"),
          node(
            "dl",
            {},
            node("dt", {}, t("Provenance")),
            node("dd", { "data-i18n-skip": true }, safeMetadata(values.projectName) || "—"),
            node("dt", {}, t("Created")),
            node("dd", {}, values.createdAt || "—"),
            node("dt", {}, t("Updated")),
            node("dd", {}, values.updatedAt || "—")
          )
        )
      );
    }
    fields.append(
      node(
        "div",
        { className: "resource-form-actions" },
        node(
          "button",
          { type: "submit", className: "primary", "aria-keyshortcuts": "Control+S Meta+S", title: "Ctrl/Cmd+S" },
          t("Save")
        ),
        button("Save and next", () => run(() => save([selectedId], true)), {
          "aria-keyshortcuts": "Control+Enter Meta+Enter",
          title: "Ctrl/Cmd+Enter"
        }),
        button("Discard", () =>
          run(async () => {
            await session.discard(selectedId);
            if (activeRecord._new) activeRecord = null;
            renderInspector();
            renderRows();
          })
        ),
        button("Move to Trash", () => run(() => maintenance("delete", [activeRecord])), {
          disabled: Boolean(activeRecord._new)
        })
      )
    );
    form.append(fields);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run(() => save([selectedId]));
    });
    inspector.replaceChildren(
      button(
        "Back to results",
        () => {
          root.classList.remove("entry-selected");
          tableBody.querySelector("button")?.focus();
        },
        { className: "resource-back-results" }
      ),
      title,
      form
    );
  }
  function addEntry() {
    if (busy || resource.archived) return;
    const record = {
      id: storage.makeId(type === "tm" ? "tm" : "term"),
      _new: true,
      resourceId: resource.id,
      [sourceKey]: "",
      [targetKey]: "",
      sourceLang: resource.sourceLang,
      targetLang: resource.targetLang,
      ...(type === "tm"
        ? { tmName: resource.name, isSeeded: true }
        : { termBaseName: resource.name, status: "preferred", matchMode: "exact" })
    };
    session.edit(record, {});
    selectEntry(record);
    inspector.querySelector("textarea")?.focus();
  }
  async function save(ids, advance = false) {
    if (busy || session.isSaving()) return false;
    const focused = inspector.contains(document.activeElement) ? document.activeElement : null;
    const editingFocus = focused?.name
      ? { name: focused.name, start: focused.selectionStart, end: focused.selectionEnd }
      : null;
    const pending = ids ? ids.map((id) => session.get(id)).filter(Boolean) : session.values();
    if (
      pending.some(
        (draft) => !String(draft.values[sourceKey] || "").trim() || !String(draft.values[targetKey] || "").trim()
      )
    )
      throw new Error(t("Enter source and target text before saving."));
    setBusy(true);
    try {
      const selectedIndex = rows.findIndex((row) => row.id === selectedId);
      let nextId = advance && selectedIndex >= 0 ? rows[selectedIndex + 1]?.id : null;
      if (advance && selectedIndex >= 0 && !nextId && result.nextCursor) {
        const following = await queryService.queryResourceEntries({ ...queryOptions(), cursor: result.nextCursor });
        nextId = following.rows[0]?.id;
      }
      const saved = await session.save(resource, ids);
      if (saved.operationId) lastOperation = saved.operationId;
      queryService.invalidate(resource.id);
      if (saved.failed?.length) {
        message(t("Some changes could not be saved. Your drafts are preserved."), true);
        await showConflict(saved.failed[0]);
      } else message(t("Changes saved"));
      if (selectedId) activeRecord = (await storage.get(store, selectedId)) || activeRecord;
      const preservedEntry = ids ? selectedId : rows[0]?.id || selectedId;
      await load({ anchorId: (!saved.failed?.length && advance ? nextId : preservedEntry) || preservedEntry });
      if (!saved.failed?.length && advance) {
        if (nextId) {
          const record = rows.find((row) => row.id === nextId);
          if (record) selectEntry(record);
          else renderInspector();
        } else renderInspector();
        inspector.querySelector("textarea")?.focus();
      } else {
        renderInspector();
        if (editingFocus) {
          const field = inspector.querySelector(`[name="${editingFocus.name}"]`);
          field?.focus();
          if (typeof editingFocus.start === "number" && field?.setSelectionRange)
            field.setSelectionRange(editingFocus.start, editingFocus.end);
        }
      }
      updateActions();
      return !saved.failed?.length;
    } finally {
      setBusy(false);
    }
  }
  async function showConflict(failed) {
    const draft = failed.draft || session.get(failed.entryId);
    if (!draft) return;
    const current = await storage.get(store, draft.entryId);
    const content = node(
      "div",
      {},
      node("p", {}, failed.error?.message || String(failed.error || t("The stored entry changed."))),
      node(
        "div",
        { className: "resource-conflict-columns" },
        node(
          "section",
          {},
          node("h3", {}, t("Stored version")),
          node("pre", {}, current ? `${current[sourceKey]}\n\n${current[targetKey]}` : t("Entry removed"))
        ),
        node(
          "section",
          {},
          node("h3", {}, t("Your draft")),
          node("pre", {}, `${draft.values[sourceKey]}\n\n${draft.values[targetKey]}`)
        )
      )
    );
    const view = dialog("Review conflicting changes", content);
    view.append(
      node(
        "footer",
        {},
        button("Keep editing", () => view.close()),
        button("Use stored version", () =>
          run(async () => {
            await session.discard(draft.entryId);
            activeRecord = current;
            renderInspector();
            view.close();
          })
        ),
        current
          ? button("Keep my changes for review", () =>
              run(async () => {
                await session.rebase(draft.entryId, current);
                message(t("Draft rebased. Review the fields and Save to apply your changes."));
                view.close();
              })
            )
          : null
      )
    );
  }
  async function reviewDuplicates() {
    if (busy || session.isSaving()) return;
    const review = planDuplicateRemoval(await matching(), checked, { type, mode: duplicates.value });
    if (!review.remove.length) {
      message(t("Select a version to keep in each duplicate group you want to review."));
      return;
    }
    await maintenance("delete", review.remove, review.keep);
  }
  async function maintenance(action, explicitRows = null, retainedRows = []) {
    if (busy) return;
    if (session.size()) {
      message(t("Save or discard pending edits before a bulk operation."), true);
      return;
    }
    const candidates = explicitRows || (await matching()).filter((row) => !checked.size || checked.has(row.id));
    if (!candidates.length) {
      message(t("No entries selected."));
      return;
    }
    const scope = checked.size || explicitRows ? t("selected entries") : t("matching entries");
    const find = node("input", { "aria-label": t("Find text") });
    const replacement = node("input", { "aria-label": t("Replacement text") });
    const side = select(
      "Replace in",
      [
        ["target", "Target"],
        ["source", "Source"],
        ["both", "Source and target"]
      ],
      "target"
    );
    const newStatus = select(
      "New status",
      [
        ["preferred", "Preferred"],
        ["admitted", "Admitted"],
        ["forbidden", "Forbidden"]
      ],
      "preferred"
    );
    const preview = node("div");
    const operationError = node("p", { role: "alert" });
    let changes = [];
    let previewPage = 0;
    const apply = button(
      action === "delete" ? "Move reviewed entries to Trash" : "Apply reviewed changes",
      () => run(commit),
      {
        disabled: true,
        className: "primary"
      }
    );
    const build = () => {
      changes = planResourceChanges(candidates, {
        type,
        action,
        find: find.value,
        replacement: replacement.value,
        field: side.value,
        status: newStatus.value
      });
      previewPage = 0;
      renderPreview();
    };
    function renderPreview() {
      const body = node("tbody");
      for (const change of changes.slice(previewPage * 100, (previewPage + 1) * 100))
        body.append(
          node(
            "tr",
            {},
            node("td", { dir: "auto", "data-i18n-skip": true }, change.before[sourceKey]),
            node("td", { dir: "auto", "data-i18n-skip": true }, change.before[targetKey]),
            node(
              "td",
              { dir: "auto", "data-i18n-skip": true },
              change.delete
                ? t("Move to Trash")
                : action === "status"
                  ? t(
                      change.after.status === "forbidden"
                        ? "Forbidden"
                        : change.after.status === "admitted"
                          ? "Admitted"
                          : "Preferred"
                    )
                  : `${change.after[sourceKey]} → ${change.after[targetKey]}`
            )
          )
        );
      preview.replaceChildren(
        node("p", {}, `${changes.length} ${t("entries will change")} · ${t("Page")} ${previewPage + 1}`),
        node(
          "table",
          { className: "resource-data-table" },
          node(
            "thead",
            {},
            node(
              "tr",
              {},
              node("th", { scope: "col" }, t("Source")),
              node("th", { scope: "col" }, t("Before")),
              node("th", { scope: "col" }, t("After"))
            )
          ),
          body
        ),
        node(
          "div",
          { className: "resource-toolbar-actions" },
          button(
            "Previous",
            () => {
              previewPage--;
              renderPreview();
            },
            { disabled: !previewPage }
          ),
          button(
            "Next",
            () => {
              previewPage++;
              renderPreview();
            },
            { disabled: (previewPage + 1) * 100 >= changes.length }
          )
        )
      );
      apply.disabled = !changes.length;
    }
    const view = dialog(
      action === "delete" ? "Review removal" : action === "status" ? "Change term status" : "Find and replace",
      node(
        "div",
        {},
        node("p", {}, `${candidates.length} ${scope}`),
        retainedRows.length
          ? node(
              "p",
              {},
              `${retainedRows.length} ${t("selected versions will be kept. Only the listed redundant entries will be removed.")}`
            )
          : null,
        action === "replace"
          ? node(
              "div",
              { className: "resource-fields" },
              field("Find text (case sensitive)", find),
              field("Replacement text", replacement),
              side,
              node("p", { className: "muted" }, t("Literal replacement preserves protected tags."))
            )
          : action === "status"
            ? newStatus
            : node(
                "p",
                {},
                t("Choose only redundant entries. Alternative translations and different concepts may be valid.")
              ),
        operationError,
        preview
      ),
      [
        button("Cancel", () => (operationAbort ? operationAbort.abort() : view.close())),
        button("Preview changes", build),
        apply
      ]
    );
    for (const control of [find, replacement, side, newStatus])
      control.addEventListener("input", () => {
        changes = [];
        apply.disabled = true;
      });
    view.addEventListener("cancel", (event) => {
      if (busy) {
        event.preventDefault();
        operationAbort?.abort();
      }
    });
    view.addEventListener("resource-request-close", (event) => {
      if (busy) {
        event.preventDefault();
        operationAbort?.abort();
      }
    });
    if (action === "delete") build();
    async function commit() {
      if (!changes.length || busy) return;
      const reviewed = changes;
      for (const control of view.querySelectorAll("input,select")) control.disabled = true;
      setBusy(true);
      operationAbort = new AbortController();
      apply.disabled = true;
      try {
        for (const kept of retainedRows) {
          const current = await storage.get(store, kept.id);
          if (!current || current.storageVersion !== kept.storageVersion)
            throw new Error(t("A version chosen to keep changed. Review the duplicate group again."));
        }
        const receipt = await repository.applyOperation(type, resource, reviewed, {
          signal: operationAbort.signal,
          onProgress: (progress) => {
            message(`${t("Applying changes")} ${progress.applied || 0} / ${reviewed.length}`);
          }
        });
        lastOperation = receipt.operationId;
        message(
          `${receipt.applied} / ${reviewed.length} ${t("entries changed")} · ${t(receipt.status)}${receipt.errors?.length ? ` · ${receipt.errors.map((error) => t(error.message)).join(" · ")}` : ""}`,
          Boolean(receipt.errors?.length)
        );
        checked.clear();
        queryService.invalidate(resource.id);
        await load();
        if (selectedId) {
          activeRecord = await storage.get(store, selectedId);
          renderInspector();
        }
        view.close();
      } catch (error) {
        operationError.textContent = t(error.message || String(error));
        for (const control of view.querySelectorAll("input,select")) control.disabled = false;
        changes = [];
        apply.disabled = true;
        queryService.invalidate(resource.id);
      } finally {
        setBusy(false);
        operationAbort = null;
      }
    }
  }
  async function undoLast() {
    if (!lastOperation || busy || session.size()) return;
    setBusy(true);
    try {
      const receipt = await repository.undoOperation(lastOperation);
      message(`${t("Undo")}: ${receipt.applied ?? receipt.restored ?? 0} · ${t(receipt.status)}`);
      queryService.invalidate(resource.id);
      await load();
      activeRecord = selectedId ? await storage.get(store, selectedId) : null;
      renderInspector();
      lastOperation = "";
    } finally {
      setBusy(false);
    }
  }
  async function exportResource() {
    if (session.size()) {
      const choice = await choose("Export resource", "There are unsaved changes.", [
        { label: "Save and export", value: "save", primary: true },
        { label: "Export saved version", value: "stored" },
        { label: "Cancel", value: "cancel" }
      ]);
      if (!choice || choice === "cancel" || (choice === "save" && !(await save()))) return;
    }
    const scope = await choose("Export entries", "Choose which committed entries to export.", [
      { label: "All entries", value: "all", primary: true },
      { label: "Filtered entries", value: "filtered" },
      ...(checked.size ? [{ label: "Selected entries", value: "selected" }] : []),
      { label: "Cancel", value: "cancel" }
    ]);
    if (!scope || scope === "cancel") return;
    let entries = await queryService.getMatchingEntries(
      scope === "all" ? { type, resourceId: resource.id } : { ...queryOptions(), cursor: null }
    );
    if (scope === "selected") entries = entries.filter((entry) => checked.has(entry.id));
    const format = await choose("Export format", "Choose a file format.", [
      { label: type === "tm" ? "TMX" : "TBX", value: type === "tm" ? "tmx" : "tbx", primary: true },
      { label: "CSV", value: "csv" },
      { label: "TSV", value: "tsv" },
      { label: "Cancel", value: "cancel" }
    ]);
    if (!format || format === "cancel") return;
    const output = await transfer.exportEntries(type, resource, entries, format);
    ui.download(output);
    message(`${t("Download requested")}: ${entries.length} ${t("entries")}`);
  }
  async function canClose() {
    if (busy || session.isSaving()) {
      message(t("Wait for the operation to finish or cancel it."), true);
      return false;
    }
    if (!session.size()) return true;
    const choice = await choose("Unsaved resource changes", "Save your changes before leaving?", [
      { label: "Save all", value: "save", primary: true },
      { label: "Discard changes", value: "discard" },
      { label: "Cancel", value: "cancel" }
    ]);
    if (choice === "save") return save();
    if (choice === "discard") {
      await session.discardAll();
      return true;
    }
    return false;
  }
  async function back() {
    if (await canClose()) {
      closing = true;
      await returnToLibrary();
    }
  }
  window.addEventListener("beforeunload", (event) => {
    if (!closing && (session.size() || busy)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.LoopCATDesktop?.onPrepareClose?.(async ({ mode }) => {
    if (mode === "resume") {
      closing = false;
      return {};
    }
    if (mode === "emergency")
      return {
        text: session
          .values()
          .map((draft) => `${draft.values[sourceKey]}\t${draft.values[targetKey]}`)
          .join("\n")
      };
    if (!(await canClose())) return { cancelled: true };
    await session.flush();
    await storage.flushMutations?.();
    closing = true;
    return {};
  });
  root.addEventListener("keydown", (event) => {
    if (event.isComposing || event.getModifierState?.("AltGraph")) return;
    if (event.key === "F2" && selectedId) {
      event.preventDefault();
      inspector.querySelector("textarea")?.focus();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      run(() => save(selectedId ? [selectedId] : undefined));
    } else if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      run(() => save([selectedId], true));
    }
  });
  let refreshTimer;
  async function refreshExternal() {
    if (busy || session.isSaving()) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => run(refreshExternal), 200);
      return;
    }
    const current = await storage.get("resources", route.resourceId);
    if (!current) {
      resource = { ...resource, archived: true };
      updateActions();
      message(t("This resource was removed elsewhere. Your drafts are preserved."), true);
      return;
    }
    resource = current;
    updateActions();
    heading.textContent = safeMetadata(resource.name);
    document.title = `${safeMetadata(resource.name)} — LoopCAT`;
    queryService.invalidate(resource.id);
    await load({ anchorId: selectedId || rows[0]?.id || "" });
    if (activeRecord && !session.get(selectedId)) {
      const entryId = selectedId;
      const currentEntry = await storage.get(store, entryId);
      // Focus notifications can finish after the user has selected or edited
      // an entry. Never replace that form, or an unchanged form whose focused
      // input is about to receive a browser input/composition event.
      if (selectedId !== entryId || session.get(entryId) || busy || session.isSaving()) return;
      if (currentEntry?.storageVersion !== activeRecord?.storageVersion || !currentEntry) {
        activeRecord = currentEntry;
        renderInspector();
      }
    }
  }
  window.addEventListener("loopcat-resources-changed", (event) => {
    // Local saves/imports/bulk operations refresh explicitly after their receipts settle.
    if (event.detail?.external === false) return;
    if (!event.detail?.resourceIds?.length || event.detail.resourceIds.includes(resource.id)) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => run(refreshExternal), 150);
    }
  });
  window.addEventListener("focus", () =>
    run(async () => {
      const [generation, epoch] = await Promise.all([
        storage.get("appMeta", `resource-generation:${resource.id}`),
        storage.get("appMeta", "catalog-epoch")
      ]);
      if (`${Number(generation?.value || 0)}:${epoch?.value || ""}` !== result.generation) await refreshExternal();
    })
  );
  async function selectRequestedEntry(request) {
    if (request?.resourceId !== resource.id || request.resourceType !== type || typeof request.entryId !== "string")
      return;
    const record = await storage.get(store, request.entryId);
    if (record?.resourceId === resource.id) {
      selectEntry(record);
      inspector.querySelector("textarea")?.focus();
    }
  }
  window.LoopCATDesktop?.onResourceEditorSelect?.((request) => run(() => selectRequestedEntry(request)));
  window.addEventListener("message", (event) => {
    if (
      window.location.origin !== "null" &&
      event.origin === window.location.origin &&
      event.data?.type === "loopcat-resource-select"
    )
      run(() => selectRequestedEntry(event.data));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run(() => session.flush());
  });
  renderInspector();
  draftStatus.textContent = t("Changes saved");
  await load({ anchorId: route.entryId || "" });
  const recovered = await repository.loadDrafts(resource.id);
  if (recovered.length) {
    recovery.hidden = false;
    recovery.append(
      node("span", {}, `${recovered.length} ${t("saved drafts available")}`),
      button("Review recovered drafts", () => {
        const body = node("div");
        const checks = recovered.map((draft) => {
          const control = node("input", { type: "checkbox" });
          body.append(
            field(`${draft.updatedAt || ""} · ${String(draft.values?.[sourceKey] || "").slice(0, 80)}`, control)
          );
          return { draft, control };
        });
        body.prepend(
          node(
            "p",
            {},
            t("Recover drafts only from editors you have closed. Other open editors may still be using their drafts.")
          )
        );
        const view = dialog("Recover resource drafts", body, [
          button("Recover selected drafts", () =>
            run(async () => {
              const selected = checks.filter((item) => item.control.checked).map((item) => item.draft);
              await session.recover(selected);
              if (selected[0]) selectEntry({ ...selected[0].values, _new: !selected[0].before });
              message(t("Draft recovered. Save to apply these changes."));
              view.close();
              recovery.hidden = true;
            })
          )
        ]);
      })
    );
  }
  if (route.entryId) {
    const record = await storage.get(store, route.entryId);
    if (record?.resourceId === resource.id) selectEntry(record);
  }
  const operations =
    (await storage.getAllByIndex?.("resourceOperations", "resourceId", resource.id).catch(() => [])) || [];
  const recent = operations
    .filter((item) => item.kind === "operation" && item.applied > (item.undone || 0))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  if (recent) lastOperation = recent.id;
  updateActions();
  if ("serviceWorker" in window.navigator && ["http:", "https:"].includes(window.location.protocol))
    window.navigator.serviceWorker
      .register(appRuntime.safeHtml.trustedScriptUrl("./service-worker.js"))
      .catch(() => {});
  window.CatHan.resourceEditor = {
    query: queryService,
    session,
    repository,
    refresh: load,
    getResource: () => resource
  };
}
