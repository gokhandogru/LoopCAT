import "../../../statistics-core.js";
import "../linguistics/core.js";
import { withStatisticsPricing } from "./statistics-pricing.js";
import { bindSegmentSelectionToSession } from "../editor/segment-selection-store.js";

/** @param {any} options */
export function createStatisticsController(options) {
  const { document: doc, session, selection, translate } = options;
  const t = (text, values = {}) =>
    String(translate(text, values)).replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  const domain = globalThis.LoopCATStatistics;
  const labels = domain.bandLabels;
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
  const headingCopy = node("div", "", header);
  headingCopy.className = "statistics-heading-copy";
  node("h2", "Statistics", headingCopy).id = "statisticsTitle";
  const projectSummary = node("p", "", headingCopy);
  projectSummary.className = "statistics-project-summary";
  dialog.setAttribute("aria-labelledby", "statisticsTitle");
  let snapshot = null,
    abort = null,
    openSelection = [],
    links = [],
    sourcePreview = null,
    changed = true,
    timer = null,
    run = 0,
    historical = false,
    saving = false,
    retryAnalysis = false,
    pricingInvalid = false;
  const close = button("Close", header, () => dialog.close());
  const bodyArea = node("div", "", dialog);
  bodyArea.className = "statistics-body";
  const controls = node("div", "", bodyArea);
  controls.className = "statistics-scope-bar";
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
  const scopeSummary = node("span", "", controls);
  scopeSummary.className = "statistics-scope-summary";
  scopeSummary.id = "statisticsScopeSummary";
  scopeSelect.setAttribute("aria-describedby", scopeSummary.id);
  const filePicker = node("details", "", bodyArea);
  filePicker.className = "statistics-disclosure";
  node("summary", "Files to analyze", filePicker);
  const fileChoices = node("fieldset", "", filePicker);
  fileChoices.className = "statistics-file-choices";
  node("legend", "Files to analyze", fileChoices);
  filePicker.hidden = true;
  const results = node("section", "", bodyArea);
  const drilldown = node("section", "", bodyArea);
  drilldown.className = "statistics-drilldown";
  drilldown.id = "statisticsDrilldown";
  drilldown.setAttribute("aria-labelledby", "statisticsDrilldownTitle");
  drilldown.hidden = true;
  const disclosure = (label) => {
    const section = node("details", "", bodyArea);
    section.className = "statistics-disclosure";
    node("summary", label, section);
    return section;
  };
  const fileSection = disclosure("File breakdown");
  const fileDetails = node("div", "", fileSection);
  const memorySection = disclosure("TM contributions");
  const memoryDetails = node("div", "", memorySection);
  const settings = disclosure("Analysis settings");
  const settingsGrid = node("div", "", settings);
  settingsGrid.className = "statistics-settings-grid";
  const checks = {};
  for (const [name, label, value] of [
    ["remaining", "Remaining unconfirmed work", false],
    ["excludeLocked", "Exclude locked content", false],
    ["crossFileRepetitions", "Cross-file repetitions", true],
    ["repetitionsFirst", "Repetitions before exact matches", false],
    ["internalFuzzy", "Estimate internal fuzzy reuse", false],
    ["exhaustive", "Complete TM search (slower for large memories)", false]
  ]) {
    const labelNode = node("label", "", settingsGrid),
      input = node("input", "", labelNode);
    input.type = "checkbox";
    input.checked = value;
    labelNode.append(doc.createTextNode(t(label)));
    checks[name] = input;
    input.addEventListener("change", dirty);
  }
  const tmChoices = node("fieldset", "", settings);
  node("legend", "Translation memories for this analysis", tmChoices);
  const weightInputs = {};
  for (const band of domain.bands) {
    const input = node("input");
    input.type = "number";
    input.className = "statistics-weight-input";
    input.dataset.band = band;
    input.min = "0";
    input.max = "100";
    input.step = "0.1";
    input.value = "100";
    input.setAttribute("aria-label", t("Payable percentage: {category}", { category: t(labels[band]) }));
    input.addEventListener("input", reprice);
    weightInputs[band] = input;
  }
  const quote = node("div");
  quote.className = "statistics-quote";
  const quoteControls = node("div", "", quote);
  quoteControls.className = "statistics-quote-controls";
  const rateLabel = node("label", "Rate per word", quoteControls),
    rate = node("input", "", rateLabel);
  rate.id = "statisticsRate";
  rate.type = "number";
  rate.min = "0";
  rate.step = "any";
  rate.placeholder = "0.00";
  rate.addEventListener("input", reprice);
  const currencyLabel = node("label", "Currency", quoteControls),
    currency = node("input", "", currencyLabel);
  currency.id = "statisticsCurrency";
  currency.value = "EUR";
  currency.maxLength = 8;
  currency.addEventListener("input", reprice);
  node("p", "Weighted words apply the payable percentages below. No discounts are assumed.", quote).className =
    "statistics-muted";
  const saved = disclosure("Saved snapshots");
  const savedList = node("div", "", saved);
  const actions = node("footer", "", dialog);
  actions.className = "statistics-footer";
  const meta = node("p", "", actions);
  meta.className = "statistics-status";
  meta.setAttribute("role", "status");
  meta.setAttribute("aria-live", "polite");
  const secondaryActions = node("div", "", actions);
  secondaryActions.className = "statistics-footer-secondary";
  const primaryActions = node("div", "", actions);
  primaryActions.className = "statistics-footer-primary";
  const calculateButton = button("Calculate", primaryActions, calculate);
  calculateButton.id = "statisticsCalculate";
  calculateButton.className = "primary";
  const cancel = button("Cancel calculation", primaryActions, () => {
    run++;
    abort?.abort();
    abort = null;
    cancel.hidden = true;
    meta.textContent = t("Calculation canceled. Previous results retained.");
    if (!changed) sourcePreview = null;
    render();
  });
  cancel.hidden = true;
  const saveButton = button("Save snapshot", secondaryActions, async () => {
    if (saving) return;
    if (!snapshot || changed || pricingInvalid || abort)
      throw Error(t("Calculate current settings before saving a snapshot."));
    if (!snapshot.complete)
      throw Error(t("Complete the analysis before saving a quote snapshot. Partial reports can be exported."));
    const report = snapshot;
    saving = true;
    setAvailability();
    try {
      if (!(await checkFreshness(report))) return;
      await options.save(report);
      if (session.getProject()?.id !== report.projectId) return;
      renderSaved();
      if (report === snapshot && !changed)
        meta.textContent = t("Snapshot saved. Later TM changes will not change this report.");
    } finally {
      saving = false;
      setAvailability();
    }
  });
  const exportFormat = node("select", "", secondaryActions);
  exportFormat.id = "statisticsExportFormat";
  exportFormat.setAttribute("aria-label", t("Export format"));
  for (const format of ["csv", "html", "json"]) {
    const option = node("option", format.toUpperCase(), exportFormat);
    option.value = format;
  }
  const exportButton = button("Export", secondaryActions, async () => {
    if (!snapshot) throw Error(t("Calculate statistics first."));
    const format = exportFormat.value;
    const report = snapshot;
    if (!historical && !(await checkFreshness(report))) return;
    options.download(
      `LoopCAT-Statistics-${report.id}.${format}`,
      domain.exportReport(report, format, {
        locale: doc.documentElement.lang || "en",
        direction: doc.documentElement.dir,
        translate: t
      }),
      format === "json" ? "application/json" : format === "html" ? "text/html" : "text/csv"
    );
  });
  function fail(error) {
    meta.textContent = String(error?.message || error);
  }
  function dirty() {
    changed = true;
    historical = false;
    retryAnalysis = false;
    run++;
    abort?.abort();
    abort = null;
    cancel.hidden = true;
    meta.textContent = t("Settings changed. Calculate again.");
    updateScopeSummary();
    updateSourcePreview();
    render();
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
    filePicker.hidden = scopeSelect.value !== "files";
    filePicker.open = !filePicker.hidden;
    dirty();
  });
  function emptyFileScope() {
    return scopeSelect.value === "files" && !fileChoices.querySelector("input:checked");
  }
  function analysisOptions() {
    return Object.fromEntries(Object.entries(checks).map(([key, input]) => [key, input.checked]));
  }
  function updateSourcePreview() {
    sourcePreview = null;
    if (emptyFileScope()) {
      meta.textContent = t("Select at least one file to calculate statistics.");
      return;
    }
    try {
      sourcePreview = domain.sourceSummary({
        project: session.getProject(),
        segments: session.getSegments(),
        scope: scope(),
        options: analysisOptions()
      });
    } catch (error) {
      fail(error);
    }
  }
  function updateScopeSummary() {
    const p = session.getProject();
    const projectName = doc.createElement("bdi");
    projectName.textContent = p?.name || "";
    const languagePair = doc.createElement("bdi");
    languagePair.dir = "ltr";
    languagePair.textContent = `${p?.sourceLang || ""} → ${p?.targetLang || ""}`;
    projectSummary.replaceChildren(projectName, " · ", languagePair);
    const scopeNotes = [];
    if (scopeSelect.value === "file") {
      const file = p?.documents?.find((item) => item.id === options.getDocumentId());
      if (file) scopeNotes.push(file.name);
    } else if (scopeSelect.value === "files") {
      scopeNotes.push(t("{count} selected files", { count: fileChoices.querySelectorAll("input:checked").length }));
    } else if (scopeSelect.value === "segments") {
      scopeNotes.push(t("{count} selected segments", { count: openSelection.length }));
    }
    if (checks.remaining.checked) scopeNotes.push(t("Unconfirmed only"));
    if (checks.excludeLocked.checked) scopeNotes.push(t("Locked content excluded"));
    scopeSummary.textContent = scopeNotes.join(" · ");
    if (scopeSelect.value === "segments") {
      const visible = new Set(options.getVisibleSegments().map((s) => s.id));
      const hidden = openSelection.filter((id) => !visible.has(id)).length;
      if (hidden) scopeSummary.textContent += ` · ${hidden} ${t("selected segments hidden by the current filter")}`;
    }
  }
  function settingsValue() {
    return {
      ...analysisOptions(),
      weighted: true,
      ...pricingValue()
    };
  }
  function pricingValue() {
    if (rate.validity.badInput || (rate.value && !rate.validity.valid))
      throw Error(t("Enter a valid, nonnegative word rate."));
    const weights = {};
    for (const [band, input] of Object.entries(weightInputs)) {
      if (!input.value.trim() || !input.validity.valid)
        throw Error(t("Payable percentages must be between 0 and 100."));
      weights[band] = Number(input.value);
    }
    return { weights, rate: Number(rate.value || 0), currency: currency.value.trim(), rateProvided: rate.value !== "" };
  }
  function setAvailability() {
    calculateButton.textContent = t(retryAnalysis ? "Retry analysis" : snapshot ? "Recalculate" : "Calculate");
    calculateButton.disabled = !!abort || emptyFileScope();
    saveButton.disabled =
      saving || !snapshot || changed || !!sourcePreview || pricingInvalid || !snapshot.complete || !!abort;
    exportButton.disabled = !snapshot || !!sourcePreview || pricingInvalid || (!!changed && !historical) || !!abort;
    // Pending analysis settings must not trap an invalid rate in a disabled
    // field. Keep pricing correctable while retaining the previous estimate.
    const disabled = historical || !!abort;
    rate.disabled = disabled;
    currency.disabled = disabled;
    Object.values(weightInputs).forEach((input) => {
      input.disabled = disabled;
    });
  }
  function reprice() {
    if (!snapshot || changed || abort) return;
    try {
      snapshot = withStatisticsPricing(snapshot, pricingValue(), `analysis-${crypto.randomUUID()}`);
      pricingInvalid = false;
      updatePricingDisplay();
      setAvailability();
      meta.textContent = t("Estimate updated. Analysis counts unchanged.");
    } catch (error) {
      pricingInvalid = true;
      setAvailability();
      fail(error);
    }
  }
  const number = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  function money(value, code) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(value);
    } catch {
      return `${number(value, 2)} ${code || ""}`.trim();
    }
  }
  function updatePricingDisplay() {
    if (!snapshot) return;
    const weighted = results.querySelector('[data-metric="weighted"]');
    const cost = results.querySelector('[data-metric="cost"]');
    if (weighted) weighted.textContent = number(snapshot.weightedWords, 2);
    const provided = snapshot.options.rateProvided ?? snapshot.options.rate > 0;
    if (cost)
      cost.textContent = provided
        ? money(snapshot.weightedWords * snapshot.options.rate, snapshot.options.currency)
        : "—";
    const costNote = results.querySelector('[data-note="cost"]');
    if (costNote)
      costNote.textContent = t(
        !provided
          ? "Enter a word rate below"
          : !snapshot.complete
            ? "Provisional · analysis incomplete"
            : "Weighted words × rate per word"
      );
    results.querySelectorAll("[data-weighted-band]").forEach((cell) => {
      const band = cell.dataset.weightedBand;
      const words = snapshot.buckets.find((bucket) => bucket.band === band)?.words || 0;
      cell.textContent = number((words * (snapshot.options.weights?.[band] ?? 100)) / 100, 2);
    });
  }
  function table(parent, columns, rows) {
    const wrap = node("div", "", parent);
    wrap.className = "statistics-table-wrap";
    const tableNode = node("table", "", wrap);
    const head = node("tr", "", node("thead", "", tableNode));
    columns.forEach((text, index) => {
      const cell = node("th", text, head);
      cell.scope = "col";
      if (index) cell.className = "numeric";
    });
    const body = node("tbody", "", tableNode);
    rows.forEach((cells) => {
      const row = node("tr", "", body);
      cells.forEach((value, index) => {
        const cell = node("td", String(value), row);
        if (index) cell.className = "numeric";
      });
    });
    return body;
  }
  function showRows(band, trigger) {
    drilldown.replaceChildren();
    drilldown.hidden = false;
    const heading = node("div", "", drilldown);
    heading.className = "statistics-section-heading";
    const title = node("h3", labels[band], heading);
    title.id = "statisticsDrilldownTitle";
    title.tabIndex = -1;
    button("Close details", heading, () => {
      drilldown.hidden = true;
      trigger.focus();
    });
    const matching = snapshot.rows.filter((row) => row.band === band);
    node("p", t("{count} segments", { count: number(matching.length) }), drilldown).className = "statistics-muted";
    // Paginate segment drilldown; never put a huge project into the DOM.
    let page = 0;
    const area = node("div", "", drilldown),
      nav = node("div", "", drilldown);
    const draw = () => {
      area.replaceChildren();
      for (const row of matching.slice(page * 50, page * 50 + 50)) {
        const item = node("div", "", area);
        item.className = "statistics-drilldown-row";
        const words =
          row.countingComplete === false || row.words == null
            ? `${t("Known source words")} · ${number(row.words)}`
            : t("{count} words", { count: number(row.words) });
        button(
          `${snapshot.files.find((f) => f.id === row.documentId)?.name || t("Document")} · ${(row.index ?? 0) + 1} · ${words}`,
          item,
          () => {
            dialog.close();
            return options.openSegment(row.segmentId);
          }
        );
        if (row.resourceName) node("p", `${row.resourceName} · ${row.score}%`, item).className = "statistics-muted";
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
    title.focus();
  }
  function sourceCard(report, totals) {
    const card = node("div", "", totals);
    card.className = "statistics-metric is-primary";
    node("span", report.countingComplete ? "Source words" : "Known source words", card);
    node("strong", number(report.totals.words), card).dataset.metric = "source";
    const note = node(
      "small",
      t("{segments} segments · {files} files", {
        segments: number(report.totals.segments),
        files: number(report.files.length)
      }),
      card
    );
    note.dir = "auto";
  }
  function render() {
    results.replaceChildren();
    fileDetails.replaceChildren();
    memoryDetails.replaceChildren();
    drilldown.hidden = true;
    setAvailability();
    const preview = sourcePreview || (changed && !historical);
    fileSection.hidden = preview ? !sourcePreview?.files.length : !snapshot?.files.length;
    memorySection.hidden = !!preview || !snapshot?.memories.length;
    if (preview) {
      if (sourcePreview) {
        const totals = node("div", "", results);
        totals.className = "statistics-metrics";
        sourceCard(sourcePreview, totals);
        if (!sourcePreview.countingComplete)
          node("p", "Source count incomplete. Some segments could not be counted.", results).className =
            "statistics-notice";
        if (!abort) node("p", "Calculate to update the match breakdown.", results).className = "statistics-muted";
        if (sourcePreview.files.length)
          table(
            fileDetails,
            ["File", sourcePreview.countingComplete ? "Source words" : "Known source words"],
            sourcePreview.files.map((file) => [file.name, number(file.totals.words)])
          );
      }
      if (pricingInvalid || snapshot) results.append(quote);
      for (const [band, input] of Object.entries(weightInputs)) {
        if (!input.value.trim() || !input.validity.valid) {
          const label = node("label", t("Payable percentage: {category}", { category: t(labels[band]) }), results);
          label.append(input);
        }
      }
      return;
    }
    if (!snapshot) return;
    if (changed) {
      const originalScope =
        snapshot.scope.kind === "project"
          ? t("Project")
          : snapshot.scope.kind === "segments"
            ? t("Selected segments")
            : snapshot.files.map((file) => file.name).join(", ");
      node(
        "p",
        `${t(historical ? "Saved snapshot" : "Previous calculation")} · ${originalScope} · ${dateLabel(snapshot.createdAt)}. ${t("Calculate to analyze the current scope and settings.")}`,
        results
      ).className = "statistics-notice";
    }
    if (!snapshot.complete) {
      node(
        "p",
        !snapshot.countingComplete
          ? "Source count incomplete. Some segments could not be counted."
          : snapshot.searchComplete && snapshot.estimatedComplete === false
            ? "Source count and TM search complete. Internal fuzzy estimates are incomplete."
            : "Source count complete. Match analysis is incomplete.",
        results
      ).className = "statistics-notice";
    }
    const totals = node("div", "", results);
    totals.className = "statistics-metrics";
    sourceCard(snapshot, totals);
    for (const [key, label, value, note] of [
      [
        "weighted",
        "Weighted words",
        number(snapshot.weightedWords, 2),
        t(snapshot.complete ? "After match discounts" : "Provisional · analysis incomplete")
      ],
      ["cost", "Estimated cost", "—", ""]
    ]) {
      const card = node("div", "", totals);
      card.className = "statistics-metric";
      node("span", label, card);
      node("strong", value, card).dataset.metric = key;
      const metricNote = node("small", note, card);
      metricNote.dataset.note = key;
      metricNote.dir = "auto";
    }
    results.append(quote);
    const breakdown = node("section", "", results);
    breakdown.className = "statistics-breakdown";
    node("h3", "Match breakdown", breakdown);
    const list = snapshot.buckets.filter(
      (bucket) => bucket.words > 0 || bucket.segments > 0 || ["exact", "repetition", "new"].includes(bucket.band)
    );
    const body = table(
      breakdown,
      ["Category", snapshot.countingComplete ? "Source words" : "Known source words", "Payable %", "Weighted words"],
      list.map((b) => [labels[b.band], number(b.words), "", ""])
    );
    [...body.children].forEach((row, index) => {
      const bucket = list[index];
      const cell = row.firstChild;
      if (bucket.segments) {
        cell.textContent = "";
        const trigger = button(labels[bucket.band], cell, () => showRows(bucket.band, trigger));
        trigger.className = "statistics-band-button";
        trigger.setAttribute("aria-controls", drilldown.id);
      }
      row.children[2].append(weightInputs[bucket.band]);
      row.children[3].dataset.weightedBand = bucket.band;
    });
    updatePricingDisplay();
    const incompleteFiles = new Set(
      snapshot.rows.filter((row) => row.countingComplete === false || row.words == null).map((row) => row.documentId)
    );
    for (const file of snapshot.files) {
      const exp = node("details", "", fileDetails);
      exp.className = "statistics-file-detail";
      const summary = node("summary", "", exp);
      node("span", file.name, summary);
      const knownOnly = !snapshot.countingComplete && (!incompleteFiles.size || incompleteFiles.has(file.id));
      node(
        "span",
        knownOnly
          ? `${t("Known source words")} · ${number(file.totals.words)}`
          : t("{count} words", { count: number(file.totals.words) }),
        summary
      ).className = "numeric";
      const current = session.getProject()?.documents?.find((d) => d.id === file.id);
      if (current && !changed) options.mountFileActions?.(exp, current);
      table(
        exp,
        ["Category", knownOnly ? "Known source words" : "Source words"],
        file.buckets.filter((b) => b.words || b.segments).map((b) => [labels[b.band], number(b.words)])
      );
    }
    if (snapshot.memories.length) {
      node("p", "Each segment is counted once, using its best match.", memoryDetails).className = "statistics-muted";
      table(
        memoryDetails,
        ["Translation memory", snapshot.countingComplete ? "Source words" : "Known source words", "Segments"],
        snapshot.memories.map((m) => [m.name, number(m.words), number(m.segments)])
      );
    }
    if (snapshot.options.internalFuzzy) {
      const internal = node("details", "", results);
      internal.className = "statistics-disclosure";
      node("summary", "Estimated internal fuzzy reuse", internal);
      table(
        internal,
        ["Category", "Estimated words"],
        snapshot.estimatedBuckets.map((b) => [labels[b.band], b.words])
      );
    }
    for (const limitation of snapshot.limitations) node("p", limitation, results).className = "statistics-muted";
    if (!snapshot.memories.length)
      node("p", "No TM selected. Counts include source words and repetitions.", results).className = "statistics-muted";
    if (snapshot.excludedSegments)
      node(
        "p",
        t("{count} segments excluded by analysis settings.", { count: number(snapshot.excludedSegments) }),
        results
      ).className = "statistics-muted";
  }
  async function calculate() {
    if (emptyFileScope()) {
      dirty();
      return;
    }
    const current = ++run;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    const projectId = session.getProject()?.id;
    const obsolete = () => signal.aborted || current !== run || session.getProject()?.id !== projectId;
    let matching = false;
    cancel.hidden = false;
    setAvailability();
    meta.textContent = t("Analyzing…");
    try {
      await options.flush();
      if (obsolete()) return;
      // Original document binaries and saved reports are irrelevant to word counts.
      const { id, name, sourceLang, targetLang, documents, resourceLinks } = session.getProject();
      const project = structuredClone({ id, name, sourceLang, targetLang, documents, resourceLinks }),
        segments = structuredClone(session.getSegments());
      const countRequest = { project, segments, scope: scope(), options: analysisOptions() };
      sourcePreview = domain.sourceSummary(countRequest);
      historical = false;
      render();
      let calculationOptions;
      try {
        calculationOptions = settingsValue();
        pricingInvalid = false;
      } catch (error) {
        pricingInvalid = true;
        throw error;
      }
      matching = true;
      meta.textContent = t("Matching translation memories…");
      const selectedLinks = [...tmChoices.querySelectorAll("input[data-tm]:checked")].map((input) => ({
        ...links.find((l) => l.resourceId === input.dataset.tm),
        lookup: true,
        penalty: Math.max(
          0,
          Math.min(30, Number(input.closest(".statistics-tm-choice").querySelector("input[data-penalty]").value) || 0)
        ),
        priority: Math.max(
          0,
          Number(input.closest(".statistics-tm-choice").querySelector("input[data-priority]").value) || 0
        )
      }));
      const ids = selectedLinks.map((link) => link.resourceId);
      const resources = ids.length ? await options.listResources(ids) : [];
      if (obsolete()) return;
      const entries = ids.length ? await options.listEntries(project, ids) : [];
      if (obsolete()) return;
      const request = {
        ...countRequest,
        entries,
        resources,
        resourceLinks: selectedLinks,
        options: calculationOptions,
        id: `analysis-${crypto.randomUUID()}`,
        runtimeVersion: navigator.userAgent,
        generation: domain.fingerprint(project, segments, resources)
      };
      const value = await options.analyze(request, signal, (progress) => {
        if (!obsolete()) meta.textContent = `${t("Analyzing")} ${progress.scanned}/${progress.total}`;
      });
      if (obsolete()) return;
      const latestResources = ids.length ? await options.listResources(ids) : [];
      if (obsolete()) return;
      snapshot = withStatisticsPricing(value, request.options);
      pricingInvalid = false;
      retryAnalysis = false;
      changed = domain.fingerprint(session.getProject(), session.getSegments(), latestResources) !== value.generation;
      if (changed) updateSourcePreview();
      else sourcePreview = null;
      render();
      meta.textContent = `${t(changed ? "Out of date — calculate again." : value.complete ? "Complete" : "Incomplete analysis")} · ${dateLabel(value.createdAt)}`;
    } catch (error) {
      if (!obsolete() && error.name !== "AbortError") {
        changed = true;
        retryAnalysis = matching;
        render();
        fail(matching ? t("Match analysis failed: {error}", { error: error.message || String(error) }) : error);
      }
    } finally {
      if (current === run) {
        cancel.hidden = true;
        abort = null;
        setAvailability();
      }
    }
  }
  function renderSaved() {
    savedList.replaceChildren();
    const reports = session.getProject()?.statisticsSnapshots || [];
    saved.hidden = !reports.length;
    for (const report of [...reports].reverse()) {
      const row = node("div", "", savedList);
      row.className = "statistics-saved-row";
      const hasRate = report.options.rateProvided ?? report.options.rate > 0;
      const reportLabel = hasRate
        ? `${number(report.weightedWords, 2)} ${t("weighted words")} · ${money(report.weightedWords * report.options.rate, report.options.currency)}`
        : `${number(report.totals.words)} ${t("source words")}`;
      button(`${dateLabel(report.createdAt)} · ${reportLabel}`, row, () => {
        run++;
        abort?.abort();
        abort = null;
        calculateButton.disabled = false;
        cancel.hidden = true;
        snapshot = report;
        sourcePreview = null;
        changed = true;
        historical = true;
        retryAnalysis = false;
        pricingInvalid = false;
        rate.value = (report.options.rateProvided ?? report.options.rate > 0) ? String(report.options.rate || 0) : "";
        currency.value = report.options.currency || "";
        for (const [band, input] of Object.entries(weightInputs))
          input.value = String(report.options.weights?.[band] ?? 100);
        for (const [key, input] of Object.entries(checks)) input.checked = Boolean(report.options[key]);
        scopeSelect.value = report.scope.kind;
        if (report.scope.kind === "segments") {
          openSelection = [...report.scope.segmentIds];
          scopeSelect.querySelector('option[value="segments"]').disabled = false;
        }
        if (report.scope.kind === "files") {
          const ids = new Set(report.scope.documentIds);
          for (const input of fileChoices.querySelectorAll("input")) input.checked = ids.has(input.value);
        }
        filePicker.hidden = report.scope.kind !== "files";
        filePicker.open = false;
        const memories = new Map(report.memories.map((memory) => [memory.id, memory]));
        for (const input of tmChoices.querySelectorAll("input[data-tm]")) {
          const memory = memories.get(input.dataset.tm);
          input.checked = !!memory;
          if (memory) {
            const row = input.closest(".statistics-tm-choice");
            row.querySelector("[data-penalty]").value = String(memory.penalty || 0);
            if (memory.priority != null) row.querySelector("[data-priority]").value = String(memory.priority);
          }
        }
        updateScopeSummary();
        render();
        meta.textContent = t("Saved snapshot — original calculation and settings.");
      });
      button("Delete snapshot", row, async () => {
        await options.removeSnapshot(report.id);
        await renderSaved();
      });
    }
  }
  async function open(kind = "", documentIds = null) {
    if (!session.getProject()) return;
    if (!kind) {
      const preferred = options.defaultScope?.() || { kind: "project" };
      kind = preferred.kind;
      documentIds = preferred.documentIds || null;
    }
    clearInterval(timer);
    run++;
    abort?.abort();
    abort = null;
    sourcePreview = null;
    if (snapshot?.projectId !== session.getProject().id) snapshot = null;
    changed = true;
    historical = false;
    retryAnalysis = false;
    pricingInvalid = false;
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
    filePicker.hidden = kind !== "files";
    filePicker.open = kind === "files" && !documentIds?.length;
    links = (session.getProject().resourceLinks || []).filter((l) => l.type === "tm");
    tmChoices.replaceChildren();
    node("legend", "Translation memories for this analysis", tmChoices);
    tmChoices.hidden = !links.length;
    for (const link of links) {
      const row = node("div", "", tmChoices);
      row.className = "statistics-tm-choice";
      const label = node("label", "", row),
        input = node("input", "", label);
      input.type = "checkbox";
      input.dataset.tm = link.resourceId;
      input.checked = link.lookup !== false;
      label.append(doc.createTextNode(link.cachedName || link.name));
      input.addEventListener("change", dirty);
      const penalty = node("input", "", node("label", "Penalty", row));
      penalty.type = "number";
      penalty.min = "0";
      penalty.max = "30";
      penalty.value = String(link.penalty || 0);
      penalty.dataset.penalty = link.resourceId;
      penalty.setAttribute("aria-label", t("TM penalty"));
      penalty.addEventListener("change", dirty);
      const priority = node("input", "", node("label", "Priority", row));
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
    timer = setInterval(() => {
      if (!dialog.open || !snapshot || abort || changed) return;
      const report = snapshot,
        current = run;
      void checkFreshness(report).catch((error) => {
        if (dialog.open && current === run && report === snapshot) fail(error);
      });
    }, 2000);
  }
  async function checkFreshness(report) {
    const current = run;
    const ids = report.memories.map((memory) => memory.id);
    const latest = ids.length ? await options.listResources(ids) : [];
    if (!dialog.open || current !== run || report !== snapshot || changed || abort) return false;
    if (domain.fingerprint(session.getProject(), session.getSegments(), latest) === report.generation) return true;
    changed = true;
    updateSourcePreview();
    render();
    meta.textContent = t("Out of date — project or TM changed. Calculate again.");
    return false;
  }
  dialog.addEventListener("close", () => {
    // Native close events are queued. A new dialog session may already be open.
    if (dialog.open) return;
    run++;
    abort?.abort();
    abort = null;
    clearInterval(timer);
  });
  const { projectStatistics, statisticsMenu, selectionHost, selectAll } = options.hosts;
  const projectButton = button("Statistics", projectStatistics, () => open());
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
  bindSegmentSelectionToSession(session, selection, {
    getVisibleIndexes: options.getVisibleIndexes,
    onVisibleChange: refreshControls
  });
  return { open, calculate, refreshControls, getSnapshot: () => snapshot };
}
