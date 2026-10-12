import "../../../statistics-core.js";
import "../linguistics/core.js";

/** @param {any} options */
export function createStatisticsController(options) {
  const { document: doc, session, selection, translate: t } = options;
  const domain = globalThis.LoopCATStatistics;
  const labels = {
    context: "Context",
    exact: "100%",
    repetition: "Repetitions",
    "95-99": "95–99%",
    "85-94": "85–94%",
    "75-84": "75–84%",
    "50-74": "50–74%",
    new: "New / no match",
    incomplete: "Incomplete"
  };
  const node = (tag, text = "", parent = null) => {
    const element = doc.createElement(tag);
    if (text) element.textContent = t(text);
    parent?.append(element);
    return element;
  };
  const button = (text, parent, action) => {
    const b = node("button", text, parent);
    b.type = "button";
    b.addEventListener("click", () => void Promise.resolve().then(action).catch(fail));
    return b;
  };
  const dialog = node("dialog");
  dialog.className = "statistics-dialog";
  dialog.id = "statisticsDialog";
  doc.body.append(dialog);
  const header = node("header", "", dialog);
  header.className = "statistics-heading";
  node("h2", "Statistics", header).id = "statisticsTitle";
  dialog.setAttribute("aria-labelledby", "statisticsTitle");
  let advanced = false,
    snapshot = null,
    abort = null,
    openSelection = [],
    resources = [],
    links = [],
    changed = true,
    timer = null,
    run = 0;
  let view, advancedArea;
  function toggleView() {
    advanced = !advanced;
    view.textContent = t(advanced ? "Simple" : "Advanced");
    advancedArea.hidden = !advanced;
    render();
  }
  view = button("Advanced", header, toggleView);
  const close = button("Close", header, () => dialog.close());
  const controls = node("div", "", dialog);
  controls.className = "statistics-controls";
  const scopeLabel = node("label", "Scope ", controls),
    scopeSelect = node("select", "", scopeLabel);
  for (const [value, text] of [
    ["project", "Project"],
    ["file", "Current file"],
    ["files", "Selected files"],
    ["segments", "Selected segments"]
  ]) {
    const item = node("option", text, scopeSelect);
    item.value = value;
  }
  const scopeSummary = node("p", "", dialog);
  const fileChoices = node("fieldset", "", dialog);
  node("legend", "Files to analyze", fileChoices);
  fileChoices.hidden = true;
  advancedArea = node("section", "", dialog);
  advancedArea.hidden = true;
  const settings = node("details", "", advancedArea);
  node("summary", "Analysis settings", settings);
  const checks = {};
  for (const [name, label, value] of [
    ["remaining", "Remaining unconfirmed work", false],
    ["excludeLocked", "Exclude locked content", false],
    ["crossFileRepetitions", "Cross-file repetitions", true],
    ["repetitionsFirst", "Repetitions before exact matches", false],
    ["internalFuzzy", "Estimate internal fuzzy reuse", false],
    ["exhaustive", "Complete TM search (slower for large memories)", false],
    ["weighted", "Show weighted words", false]
  ]) {
    const labelNode = node("label", "", settings),
      input = node("input", "", labelNode);
    input.type = "checkbox";
    input.checked = value;
    labelNode.append(doc.createTextNode(t(label)));
    checks[name] = input;
    input.addEventListener("change", dirty);
  }
  const tmChoices = node("fieldset", "", settings);
  node("legend", "Translation memories — report-only overrides", tmChoices);
  const weights = node("fieldset", "", settings);
  node("legend", "Weights (% payable; default 100%)", weights);
  const weightInputs = {};
  for (const band of domain.bands) {
    const label = node("label", labels[band] + " ", weights),
      input = node("input", "", label);
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = "100";
    input.setAttribute("aria-label", t(labels[band] + " weight"));
    input.addEventListener("change", dirty);
    weightInputs[band] = input;
  }
  const rateLabel = node("label", "Price per weighted word ", settings),
    rate = node("input", "", rateLabel);
  rate.type = "number";
  rate.min = "0";
  rate.step = "0.001";
  rate.value = "0";
  rate.addEventListener("change", dirty);
  const currencyLabel = node("label", "Currency ", settings),
    currency = node("input", "", currencyLabel);
  currency.value = "EUR";
  currency.maxLength = 8;
  currency.addEventListener("change", dirty);
  const meta = node("p", "", dialog);
  meta.setAttribute("role", "status");
  meta.setAttribute("aria-live", "polite");
  const results = node("section", "", dialog),
    details = node("section", "", advancedArea);
  dialog.insertBefore(results, advancedArea);
  const actions = node("footer", "", dialog);
  actions.className = "statistics-controls";
  const calculateButton = button("Calculate", actions, calculate);
  const cancel = button("Cancel calculation", actions, () => {
    run++;
    abort?.abort();
    abort = null;
    calculateButton.disabled = false;
    cancel.hidden = true;
    meta.textContent = t("Calculation canceled. Previous results retained.");
  });
  cancel.hidden = true;
  const saveButton = button("Save snapshot", actions, async () => {
    if (!snapshot || changed) throw Error(t("Calculate current settings before saving a snapshot."));
    if (!snapshot.complete)
      throw Error(t("Complete the analysis before saving a quote snapshot. Partial reports can be exported."));
    await options.save(snapshot);
    await renderSaved();
    meta.textContent = t("Snapshot saved. Later TM changes will not change this report.");
  });
  for (const format of ["csv", "html", "json"])
    button("Export " + format.toUpperCase(), actions, () => {
      if (!snapshot) throw Error(t("Calculate statistics first."));
      options.download(
        `LoopCAT-Statistics-${snapshot.id}.${format}`,
        domain.exportReport(snapshot, format),
        format === "json" ? "application/json" : format === "html" ? "text/html" : "text/csv"
      );
    });
  const saved = node("details", "", dialog);
  node("summary", "Saved snapshots", saved);
  const savedList = node("div", "", saved);
  function fail(error) {
    meta.textContent = String(error?.message || error);
  }
  function dirty() {
    changed = true;
    run++;
    abort?.abort();
    abort = null;
    calculateButton.disabled = false;
    cancel.hidden = true;
    meta.textContent = t("Settings changed. Calculate again.");
    saveButton.disabled = true;
  }
  function scope() {
    if (scopeSelect.value === "segments") return { kind: "segments", segmentIds: openSelection };
    if (scopeSelect.value === "file") return { kind: "files", documentIds: [options.getDocumentId()].filter(Boolean) };
    if (scopeSelect.value === "files")
      return {
        kind: "files",
        documentIds: [...fileChoices.querySelectorAll("input:checked")].map((input) => input.value)
      };
    return { kind: "project" };
  }
  scopeSelect.addEventListener("change", () => {
    fileChoices.hidden = scopeSelect.value !== "files";
    dirty();
    updateScopeSummary();
  });
  function updateScopeSummary() {
    const p = session.getProject();
    scopeSummary.textContent = `${p?.name || ""} · ${p?.sourceLang || ""} → ${p?.targetLang || ""} · ${scopeSelect.value === "segments" ? openSelection.length + " " + t("selected segments") : t("Source content in the chosen scope")}`;
    if (scopeSelect.value === "segments") {
      const visible = new Set(options.getVisibleSegments().map((s) => s.id));
      const hidden = openSelection.filter((id) => !visible.has(id)).length;
      if (hidden) scopeSummary.textContent += ` · ${hidden} ${t("selected segments hidden by the current filter")}`;
    }
  }
  function settingsValue() {
    return {
      ...Object.fromEntries(Object.entries(checks).map(([key, input]) => [key, input.checked])),
      weights: Object.fromEntries(
        Object.entries(weightInputs).map(([key, input]) => [key, Math.max(0, Math.min(100, Number(input.value)))])
      ),
      rate: Math.max(0, Number(rate.value)),
      currency: currency.value
    };
  }
  function table(parent, columns, rows) {
    const wrap = node("div", "", parent);
    wrap.className = "statistics-table-wrap";
    const tableNode = node("table", "", wrap);
    const head = node("tr", "", node("thead", "", tableNode));
    columns.forEach((text) => {
      node("th", text, head).scope = "col";
    });
    const body = node("tbody", "", tableNode);
    rows.forEach((cells) => {
      const row = node("tr", "", body);
      cells.forEach((value) => node("td", String(value), row));
    });
    return body;
  }
  function showRows(band) {
    details.replaceChildren();
    node("h3", labels[band], details);
    const matching = snapshot.rows.filter((row) => row.band === band);
    node("p", `${matching.length} segments`, details);
    // Paginate segment drilldown; never put a huge project into the DOM.
    let page = 0;
    const area = node("div", "", details),
      nav = node("div", "", details);
    const draw = () => {
      area.replaceChildren();
      for (const row of matching.slice(page * 50, page * 50 + 50)) {
        const item = node("div", "", area);
        button(
          `${snapshot.files.find((f) => f.id === row.documentId)?.name || "Document"} · ${(row.index ?? 0) + 1} · ${row.words} words`,
          item,
          () => {
            dialog.close();
            return options.openSegment(row.segmentId);
          }
        );
        node(
          "p",
          `${row.rawScore}% → ${row.score}% · ${row.resourceName} · ${(row.adjustments || []).map((a) => a.reason + " −" + a.points).join("; ")} · ${row.compatibility || ""}`,
          item
        );
      }
      nav.replaceChildren();
      if (page)
        button("Previous", nav, () => {
          page--;
          draw();
        });
      if ((page + 1) * 50 < matching.length)
        button("Next", nav, () => {
          page++;
          draw();
        });
    };
    draw();
    advanced = true;
    advancedArea.hidden = false;
    view.textContent = t("Simple");
  }
  function render() {
    results.replaceChildren();
    details.replaceChildren();
    saveButton.disabled = !snapshot || changed;
    if (!snapshot) return;
    node("p", `${t("Report scope")}: ${snapshot.scope.kind} · ${snapshot.createdAt}`, results);
    const totals = node("div", "", results);
    totals.className = "statistics-cards";
    for (const [name, value] of [
      [snapshot.countingComplete ? "Source words" : "Known source words", snapshot.totals.words],
      ["Segments", snapshot.totals.segments],
      ["Files", snapshot.files.length]
    ]) {
      const card = node("div", "", totals);
      node("strong", Number(value).toLocaleString(), card);
      node("span", name, card);
    }
    if (snapshot.options.weighted) {
      node(
        "p",
        `${t("Weighted words")}: ${snapshot.weightedWords.toFixed(2)} · ${t("Estimated cost")}: ${(snapshot.weightedWords * (snapshot.options.rate || 0)).toFixed(2)} ${snapshot.options.currency || ""}`,
        results
      );
    }
    const list = advanced
      ? snapshot.buckets
      : [
          {
            band: "exact",
            words: snapshot.buckets
              .filter((b) => ["context", "exact"].includes(b.band))
              .reduce((n, b) => n + b.words, 0)
          },
          {
            band: "fuzzy",
            words: snapshot.buckets.filter((b) => b.band.includes("-")).reduce((n, b) => n + b.words, 0)
          },
          ...snapshot.buckets.filter((b) => ["repetition", "new", "incomplete"].includes(b.band))
        ];
    const body = table(
      results,
      advanced
        ? ["Category", "Source words", "Segments", "Characters", "Tags", "%"]
        : ["Category", "Source words", "%"],
      list.map((b) => [
        b.band === "fuzzy" ? "Fuzzy matches" : labels[b.band],
        b.words,
        ...(advanced ? [b.segments, b.characters, b.tags] : []),
        snapshot.totals.words ? ((b.words / snapshot.totals.words) * 100).toFixed(1) : "0.0"
      ])
    );
    if (advanced)
      [...body.children].forEach((row, index) => {
        const cell = row.firstChild;
        cell.textContent = "";
        button(labels[list[index].band], cell, () => showRows(list[index].band));
      });
    if (!advanced) {
      const expand = node("details", "", results);
      node("summary", "Fuzzy match bands", expand);
      table(
        expand,
        ["Category", "Source words"],
        snapshot.buckets.filter((b) => b.band.includes("-")).map((b) => [labels[b.band], b.words])
      );
    }
    if (advanced) {
      node("h3", "Files", details);
      table(
        details,
        ["File", "Source words", "Segments", "Characters", "Tags"],
        snapshot.files.map((f) => [f.name, f.totals.words, f.totals.segments, f.totals.characters, f.totals.tags])
      );
      for (const file of snapshot.files) {
        const exp = node("details", "", details);
        node("summary", file.name, exp);
        const current = session.getProject()?.documents?.find((d) => d.id === file.id);
        if (current && !changed) options.mountFileActions?.(exp, current);
        table(
          exp,
          ["Category", "Source words"],
          file.buckets.map((b) => [labels[b.band], b.words])
        );
      }
      node("h3", "TM contributions — best result counted once", details);
      table(
        details,
        ["TM", "Penalty", "Source words", "Segments"],
        snapshot.memories.map((m) => [m.name, m.penalty, m.words, m.segments])
      );
      node(
        "p",
        `${snapshot.excludedSegments} excluded · ${snapshot.countingVersion} · ${snapshot.matchingVersion} · ${snapshot.runtimeVersion}`,
        details
      );
      if (snapshot.options.internalFuzzy) {
        node("h3", "Estimated internal fuzzy reuse", details);
        table(
          details,
          ["Category", "Estimated words"],
          snapshot.estimatedBuckets.map((b) => [labels[b.band], b.words])
        );
      }
    }
    for (const limitation of snapshot.limitations) node("p", limitation, results);
    if (!snapshot.memories.length) node("p", "No TM selected. Source counts and repetitions are available.", results);
  }
  async function calculate() {
    const current = ++run;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    cancel.hidden = false;
    calculateButton.disabled = true;
    try {
      await options.flush();
      const project = structuredClone(session.getProject()),
        segments = structuredClone(session.getSegments());
      const selectedLinks = [...tmChoices.querySelectorAll("input[data-tm]:checked")].map((input) => ({
        ...links.find((l) => l.resourceId === input.dataset.tm),
        lookup: true,
        penalty: Math.max(0, Math.min(30, Number(input.parentElement.querySelector("input[data-penalty]").value) || 0)),
        priority: Math.max(0, Number(input.parentElement.querySelector("input[data-priority]").value) || 0)
      }));
      resources = await options.listResources();
      const ids = new Set(selectedLinks.map((l) => l.resourceId));
      const entries = (await options.listEntries(project)).filter((e) => ids.has(e.resourceId));
      const request = {
        project,
        segments,
        entries,
        resources,
        resourceLinks: selectedLinks,
        scope: scope(),
        options: settingsValue(),
        id: `analysis-${crypto.randomUUID()}`,
        runtimeVersion: navigator.userAgent,
        generation: domain.fingerprint(project, segments, resources)
      };
      domain.resolveScope(project, segments, request.scope);
      const value = await options.analyze(request, signal, (progress) => {
        if (current === run) meta.textContent = `${t("Analyzing")} ${progress.scanned}/${progress.total}`;
      });
      if (signal.aborted || current !== run || session.getProject()?.id !== project.id) return;
      snapshot = value;
      const latestResources = await options.listResources();
      if (signal.aborted || current !== run) return;
      changed = domain.fingerprint(session.getProject(), session.getSegments(), latestResources) !== value.generation;
      render();
      meta.textContent = `${value.createdAt} · ${t(changed ? "Out of date — project or TM changed. Calculate again." : value.complete ? "Complete" : "Incomplete analysis")}`;
    } catch (error) {
      if (current === run && error.name !== "AbortError") fail(error);
    } finally {
      if (current === run) {
        calculateButton.disabled = false;
        cancel.hidden = true;
        abort = null;
      }
    }
  }
  function renderSaved() {
    savedList.replaceChildren();
    for (const report of session.getProject()?.statisticsSnapshots || []) {
      const row = node("div", "", savedList);
      button(report.createdAt, row, () => {
        snapshot = report;
        changed = true;
        render();
        meta.textContent = t("Saved snapshot — original calculation and settings.");
      });
      button("Delete snapshot", row, async () => {
        await options.removeSnapshot(report.id);
        await renderSaved();
      });
    }
  }
  async function open(kind = "project", documentIds = null) {
    if (!session.getProject()) return;
    if (snapshot?.projectId !== session.getProject().id) snapshot = null;
    changed = true;
    render();
    openSelection = selection.ids();
    scopeSelect.value = kind;
    scopeSelect.querySelector('option[value="segments"]').disabled = !openSelection.length;
    scopeSelect.querySelector('option[value="file"]').disabled = !options.getDocumentId();
    fileChoices.replaceChildren();
    node("legend", "Files to analyze", fileChoices);
    for (const file of session.getProject().documents || []) {
      const label = node("label", "", fileChoices),
        input = node("input", "", label);
      input.type = "checkbox";
      input.value = file.id;
      input.checked = !documentIds || documentIds.includes(file.id);
      input.addEventListener("change", dirty);
      label.append(doc.createTextNode(file.name));
    }
    fileChoices.hidden = kind !== "files";
    links = (session.getProject().resourceLinks || []).filter((l) => l.type === "tm");
    tmChoices.replaceChildren();
    node("legend", "Translation memories — report-only overrides", tmChoices);
    for (const link of links) {
      const label = node("label", "", tmChoices),
        input = node("input", "", label);
      input.type = "checkbox";
      input.dataset.tm = link.resourceId;
      input.checked = link.lookup !== false;
      label.append(doc.createTextNode(link.cachedName || link.name));
      input.addEventListener("change", dirty);
      const penalty = node("input", "", label);
      penalty.type = "number";
      penalty.min = "0";
      penalty.max = "30";
      penalty.value = String(link.penalty || 0);
      penalty.dataset.penalty = link.resourceId;
      penalty.setAttribute("aria-label", t("TM penalty"));
      penalty.addEventListener("change", dirty);
      const priority = node("input", "", label);
      priority.type = "number";
      priority.min = "0";
      priority.value = String(link.priority || 0);
      priority.dataset.priority = link.resourceId;
      priority.setAttribute("aria-label", t("TM priority (lower first)"));
      priority.addEventListener("change", dirty);
    }
    updateScopeSummary();
    await renderSaved();
    options.showDialog(dialog, close);
    await calculate();
    clearInterval(timer);
    if (!dialog.open) return;
    timer = setInterval(async () => {
      if (!dialog.open || !snapshot || abort || changed) return;
      let latest;
      try {
        latest = await options.listResources();
      } catch (error) {
        fail(error);
        return;
      }
      if (domain.fingerprint(session.getProject(), session.getSegments(), latest) !== snapshot.generation) {
        changed = true;
        saveButton.disabled = true;
        meta.textContent = t("Out of date — project or TM changed. Calculate again.");
      }
    }, 2000);
  }
  dialog.addEventListener("close", () => {
    run++;
    abort?.abort();
    abort = null;
    clearInterval(timer);
  });
  const { projectStatistics, statisticsMenu, selectionHost, selectAll } = options.hosts;
  const projectButton = button("Statistics", projectStatistics, () => open("project"));
  projectButton.id = "statisticsBtn";
  const fileButton = button("File statistics", statisticsMenu, () => open("file"));
  button("Project statistics", statisticsMenu, () => open("project"));
  const selectionButton = button("Selected segments (0)", statisticsMenu, () => open("segments"));
  const selectedLabel = node("span", "", selectionHost);
  button("Statistics", selectionHost, () => open("segments"));
  button("Select filtered segments", selectionHost, () => {
    selection.select(options.getVisibleSegments());
    options.refreshRows();
  });
  button("Clear selection", selectionHost, () => {
    selection.clear();
    options.refreshRows();
  });
  selectAll.addEventListener("change", () => {
    const rows = options.getVisibleSegments();
    if (selectAll.checked) selection.select(rows);
    else for (const row of rows) selection.toggle(row.id, false, false, []);
    options.refreshRows();
  });
  function refreshControls() {
    const count = selection.ids().length;
    selectionHost.hidden = !count;
    selectedLabel.textContent = t("Selected segments: {count}", { count });
    selectionButton.textContent = t("Selected segments: {count}", { count });
    selectionButton.disabled = !count;
    selectionButton.title = count ? "" : t("Select segments first.");
    fileButton.disabled = !options.getDocumentId();
    fileButton.title = fileButton.disabled ? t("Select a file first.") : "";
    const visible = options.getVisibleSegments(),
      selected = visible.filter((row) => selection.has(row.id)).length;
    selectAll.checked = !!visible.length && selected === visible.length;
    selectAll.indeterminate = selected > 0 && selected < visible.length;
    selectAll.disabled = !visible.length;
    selectionHost.parentElement.classList.toggle("has-selection", !!count);
  }
  selection.subscribe(refreshControls);
  refreshControls();
  session.subscribe?.(() => selection.sync(session.getProject()?.id || "", session.getSegments()));
  return { open, calculate, refreshControls, getSnapshot: () => snapshot };
}
