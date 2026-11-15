import { openTrial, listResponses, forgetResponse, responseEvidence } from "./lab-session.js";
import { BLIND_LAB_SAMPLE, validateWorkflowEntries } from "./workflow-packs.js";

function el(root, tag, text = "") {
  const e = root.ownerDocument.createElement(tag);
  if (text) e.textContent = text;
  root.append(e);
  return e;
}
function action(root, label, onClick) {
  const b = el(root, "button", label);
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await onClick();
    } catch (e) {
      const msg = el(root, "p", e?.message || "Action failed.");
      msg.setAttribute("role", "alert");
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function field(root, title, value = "", multiline = false) {
  const label = el(root, "label", title + " ");
  const input = el(label, multiline ? "textarea" : "input");
  input.dir = "auto";
  input.value = value;
  return input;
}
function select(root, title, values) {
  const label = el(root, "label", title + " "),
    node = el(label, "select");
  for (const v of values) {
    const opt = el(node, "option", v);
    opt.value = v;
  }
  return node;
}
function plainDownload(root, name, value) {
  const win = root.ownerDocument.defaultView;
  const url = win.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = el(root, "a");
  a.href = url;
  a.download = name;
  try {
    a.click();
  } finally {
    a.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }
}

export function renderResponseArchive({ root, storage = root.ownerDocument.defaultView.localStorage }) {
  root.replaceChildren();
  el(root, "h3", "Saved learner responses");
  el(root, "p", "These personal records stay on this device after a lesson is removed. Exporting is optional.");
  const records = listResponses(storage);
  if (!records.length) el(root, "p", "No saved responses.");
  for (const { key, value } of records) {
    const section = el(root, "section");
    el(section, "h4", value ? `${value.packId} · ${value.exerciseId}` : "Unreadable local response");
    if (value?.choice != null) {
      const reason = field(section, "Include my written justification (it could identify me)");
      reason.type = "checkbox";
      const consent = field(section, "I agree to export these fields for research or teaching");
      consent.type = "checkbox";
      const preview = el(section, "pre");
      preview.dir = "auto";
      function update() {
        preview.textContent = JSON.stringify(responseEvidence(value, reason.checked), null, 2);
        consent.checked = false;
      }
      update();
      reason.addEventListener("change", update);
      action(section, "Download response", () => {
        if (!consent.checked) throw new Error("Review the fields and agree before exporting.");
        plainDownload(section, "loopcat-study-response.json", responseEvidence(value, reason.checked));
      });
    } else el(section, "p", "No submitted decision.");
    const del = field(section, "Confirm deletion of this local response");
    del.type = "checkbox";
    action(section, "Delete response", () => {
      if (!del.checked) throw new Error("Confirm which record to delete.");
      forgetResponse(storage, key);
      renderResponseArchive({ root, storage });
    });
  }
}

function lesson(root, pack, pin, storage, loadAiHost, signal, translate, active) {
  const control = el(root, "div");
  const selected = select(
    control,
    "Exercise",
    pack.entries.map((e) => e.id)
  );
  const group = select(control, "Assigned comparison group", ["A", "B", "C", "D"]);
  el(
    control,
    "p",
    "Compare the four frozen examples. You can reopen a saved response; its order and group are preserved."
  );
  const panel = el(root, "div");
  function start() {
    if (!active()) throw new Error("This pack is unavailable or withdrawn.");
    const n = selected.selectedIndex,
      exercise = pack.entries[n];
    const trial = openTrial({ storage, pack, pin, exercise, exerciseIndex: n, group: group.selectedIndex });
    function show() {
      const state = trial.snapshot();
      panel.replaceChildren();
      const source = el(panel, "p", exercise.source);
      source.dir = "auto";
      if (pack.languages?.source) source.lang = pack.languages.source;
      el(panel, "p", translate("Group {group}", { group: "ABCD"[state.group] }));
      for (let i = 0; i < 4; i++) {
        const c = exercise.candidates[state.order[i]];
        const heading = el(panel, "h4", translate("Candidate {candidate}", { candidate: "ABCD"[i] }));
        if (state.revealed) el(heading, "bdi", " · " + c.label).setAttribute("data-i18n-skip", "");
        const t = el(panel, "p", c.text);
        t.dir = "auto";
        if (pack.languages?.target) t.lang = pack.languages.target;
      }
      if (state.revealed && loadAiHost && pack.languages?.source && pack.languages?.target) {
        const live = el(panel, "section");
        action(live, "Compare with live engines", async () => {
          live.replaceChildren();
          el(live, "h4", "Separate live comparison");
          el(
            live,
            "p",
            "Only the lesson source and its languages are sent. These new outputs do not alter your frozen exercise or recorded judgement."
          );
          const host = await loadAiHost();
          if (!live.isConnected || signal.aborted) return;
          const ids = host.providerIds(),
            left = select(live, "First provider", ids),
            right = select(live, "Second provider", ids);
          right.selectedIndex = Math.min(1, ids.length - 1);
          const detail = el(live, "div");
          let running;
          signal.addEventListener("abort", () => running?.abort(), { once: true });
          const recipe = () => ({ operation: "compare", providerIds: [left.value, right.value], maxRequests: 2 });
          function preview() {
            running?.abort();
            detail.replaceChildren();
            try {
              const plan = host.describe(recipe());
              el(detail, "p", "Two translation requests · cost unknown. Charges may apply.");
              for (const d of plan.destinations)
                el(
                  detail,
                  "p",
                  d.id +
                    " · " +
                    d.model +
                    " · " +
                    d.baseUrl +
                    " · " +
                    (d.external ? "External processing" : "Local runtime")
                );
            } catch (e) {
              el(detail, "p", e.message);
            }
          }
          preview();
          left.onchange = right.onchange = preview;
          action(live, "Run separate comparison", async () => {
            if (running) return;
            const job = new AbortController();
            running = job;
            try {
              const results = await host.runLessonComparison(
                recipe(),
                {
                  source: exercise.source,
                  sourceLang: pack.languages.source,
                  targetLang: pack.languages.target,
                  exerciseId: exercise.id
                },
                {
                  signal: job.signal,
                  active: () => live.isConnected && active()
                }
              );
              if (!job.signal.aborted && live.isConnected)
                for (const r of results) {
                  el(detail, "h5", r.providerId + " · " + r.model);
                  el(detail, "p", r.text).dir = "auto";
                }
            } finally {
              running = null;
            }
          });
          action(live, "Cancel live comparison", () => running?.abort());
        });
      }
      if (state.choice === null) {
        const choice = select(panel, "Best candidate for post-editing", ["Choose…", "A", "B", "C", "D"]);
        const scores = exercise.rubric.map((r) =>
          select(panel, r + " (1 lowest, 5 highest)", ["Choose…", "1", "2", "3", "4", "5"])
        );
        const reason = field(panel, "Why did you choose it? Your answer stays on this device.", "", true);
        reason.maxLength = 1200;
        action(panel, "Record my decision", () => {
          if (!active()) throw new Error("This pack is unavailable or withdrawn.");
          trial.submit(
            choice.selectedIndex - 1,
            scores.map((s) => s.selectedIndex),
            reason.value
          );
          show();
        });
      } else {
        el(panel, "p", `Recorded: candidate ${"ABCD"[state.choice]}. ${state.reason}`).dir = "auto";
        if (!state.revealed)
          action(panel, "Reveal candidate identities", () => {
            if (!active()) throw new Error("This pack is unavailable or withdrawn.");
            trial.reveal();
            show();
          });
      }
    }
    show();
  }
  action(control, "Open exercise", start);
  selected.addEventListener("change", () => panel.replaceChildren());
  group.addEventListener("change", () => panel.replaceChildren());
}

function engine(root, entry, host, active, signal) {
  el(root, "h4", entry.operation);
  const info = el(root, "div");
  if (!host) {
    el(info, "p", "AI host unavailable.");
    return;
  }
  const source = field(info, "Include the active source segment");
  const adjacent = field(info, "Include previous and next source segments (up to 400 characters each)");
  const terminology = field(info, "Include matching native terminology (up to 12 pairs)");
  for (const input of [source, adjacent, terminology]) input.type = "checkbox";
  source.checked = true;
  if (entry.operation === "terminology-critique")
    el(info, "p", "Terminology critique requires sharing the current draft and matching native terminology.");
  const disclosure = el(info, "div");
  disclosure.setAttribute("aria-live", "polite");
  const sharing = () => ({ source: source.checked, adjacent: adjacent.checked, terminology: terminology.checked });
  const outputs = el(info, "div");
  outputs.setAttribute("aria-live", "polite");
  let job = null;
  signal.addEventListener("abort", () => job?.abort(), { once: true });
  const run = action(info, "Run workflow", async () => {
    if (job) return;
    const own = new AbortController();
    job = own;
    for (const input of [source, adjacent, terminology]) input.disabled = true;
    outputs.replaceChildren();
    el(outputs, "p", "Running…");
    try {
      const results = await host.run(entry, { signal: own.signal, active, sharing: sharing() });
      if (!active() || own.signal.aborted) return;
      outputs.replaceChildren();
      for (const item of results) {
        el(outputs, "h5", item.providerId + " · " + item.model);
        el(outputs, "p", item.text).dir = "auto";
        if (item.kind === "candidate") action(outputs, "Apply this draft", () => host.apply(item));
      }
    } catch (e) {
      if (active())
        outputs.replaceChildren(outputs.ownerDocument.createTextNode(own.signal.aborted ? "Canceled." : e.message));
    } finally {
      job = null;
      for (const input of [source, adjacent, terminology]) input.disabled = false;
    }
  });
  function preview() {
    job?.abort();
    outputs.replaceChildren();
    disclosure.replaceChildren();
    try {
      const plan = host.describe(entry, sharing());
      el(
        disclosure,
        "p",
        `One active segment · ${plan.fields.join(", ")}. ${plan.requestCount} request(s), limit ${plan.limit}. Cost unknown; provider charges may apply.`
      );
      for (const d of plan.destinations)
        el(
          disclosure,
          "p",
          `${d.id} · ${d.model} · ${d.baseUrl} · ${d.external ? "External processing" : "Local runtime"}`
        );
      if (plan.blocked) el(disclosure, "p", plan.blocked);
      run.disabled = Boolean(plan.blocked);
    } catch (e) {
      el(disclosure, "p", e.message);
      run.disabled = true;
    }
  }
  for (const input of [source, adjacent, terminology]) input.addEventListener("change", preview);
  preview();
  action(info, "Cancel run", () => job?.abort());
}

/** Mount inside a disposable host surface. Call the returned function whenever the active project or pack changes. */
export function renderAdvancedPack({
  root,
  pack,
  pin,
  projectId,
  enabled,
  host,
  loadAiHost = undefined,
  translate = (s, values = {}) => s.replace(/\{(\w+)\}/g, (m, k) => String(values[k] ?? m)),
  repository,
  applySelection = undefined,
  refresh = () => {},
  storage = root.ownerDocument.defaultView.localStorage
}) {
  const section = el(root, "section");
  if (!repository.isUsable(pin)) throw new Error("This pack is unavailable or withdrawn.");
  let live = true;
  const ctl = new AbortController();
  const generationSignal = projectId ? repository.signal(projectId) : null;
  const stop = () => ctl.abort();
  generationSignal?.addEventListener("abort", stop, { once: true });
  function unavailable() {
    if (!live) return;
    ctl.abort();
    section.replaceChildren();
    el(section, "p", "This pack is unavailable or withdrawn. Your saved responses are preserved.").setAttribute(
      "role",
      "status"
    );
  }
  const sameVersion = (e) => e.id === pack.id && (!e.version || e.version === pack.version);
  const unsub = repository.onChange((e) => {
    if (!sameVersion(e)) return;
    if (
      e.type === "uninstall" ||
      e.type === "adopt" ||
      (e.type === "withdrawal" &&
        e.digest === pin.digest &&
        !!pin.catalogOrigin &&
        e.catalogOrigin?.catalogId === pin.catalogOrigin.catalogId &&
        e.catalogOrigin?.fingerprint === pin.catalogOrigin.fingerprint)
    )
      unavailable();
  });
  // Same-origin storage changes also reach contexts without BroadcastChannel.
  // Recheck synchronously at action time: a consent prompt may outlive a withdrawal.
  const trustChanged = () => {
    if (!repository.isUsable(pin)) unavailable();
  };
  const browser = section.ownerDocument.defaultView;
  browser?.addEventListener("storage", trustChanged);
  const active = () => live && section.isConnected && !ctl.signal.aborted && repository.isUsable(pin);
  if (pack.kind === "client") {
    const status = el(section, "div");
    status.setAttribute("aria-live", "polite");
    Promise.all([repository.describe?.() ?? repository.list(), projectId ? repository.snapshot(projectId) : []])
      .then(([all, snap]) => {
        if (!active()) return;
        const selected = [];
        for (const e of [...pack.entries].sort((a, b) => a.priority - b.priority)) {
          const exact = all.find(
            (p) =>
              (p.pack?.id ?? p.id) === e.id && (p.pack?.version ?? p.version) === e.version && p.digest === e.digest
          );
          const other = all.some((p) => (p.pack?.id ?? p.id) === e.id);
          const pins = Array.isArray(snap) ? snap : (snap.records ?? []);
          const conflict = pins.some((p) => p.id === e.id && (p.version !== e.version || p.digest !== e.digest));
          const message = exact
            ? conflict
              ? "Installed; replaces active version"
              : "Installed"
            : other
              ? "Version or digest mismatch"
              : "Missing";
          const c = field(
            status,
            `${e.id} @ ${e.version} · priority ${e.priority} · ${e.required ? "required" : "optional"} · ${message}`
          );
          c.type = "checkbox";
          c.checked = !!exact;
          c.disabled = e.required || !exact;
          selected.push([e, c]);
        }
        el(
          status,
          "p",
          "Only selected, already installed resources are activated. This kit cannot grant network access."
        );
        action(status, "Apply selected kit to this project", async () => {
          if (!projectId) throw new Error("Open a project first.");
          const selectedIds = selected.filter(([, c]) => c.checked).map(([e]) => e.id);
          if (applySelection) await applySelection(selectedIds);
          else await repository.applyKit(projectId, pack.id, pack.version, selectedIds);
          await refresh();
        });
      })
      .catch(() => {
        if (active()) el(status, "p", "Could not read installed resources.");
      });
  } else if (!enabled) el(section, "p", "Enable this pack for the open project to use it.");
  else if (pack.kind === "lesson") lesson(section, pack, pin, storage, loadAiHost, ctl.signal, translate, active);
  else if (pack.kind === "ai") for (const entry of pack.entries) engine(section, entry, host, active, ctl.signal);
  return () => {
    live = false;
    unsub();
    browser?.removeEventListener("storage", trustChanged);
    generationSignal?.removeEventListener("abort", stop);
    ctl.abort();
    section.remove();
  };
}

export function renderAdvancedAuthor({ root, kind, onCreate, repository = undefined }) {
  const box = el(root, "section");
  el(box, "h3", "Create " + kind + " pack");
  const name = field(box, "Pack name"),
    id = field(box, "Unique publisher.name"),
    publisher = field(box, "Publisher"),
    version = field(box, "Version", "1.0.0"),
    license = field(box, "License or usage terms"),
    src = field(box, "Source language", "en"),
    tgt = field(box, "Target language", "ca");
  let entries;
  if (kind === "lesson") {
    const exercise = field(box, "Source text", BLIND_LAB_SAMPLE.entries[0].source, true);
    const rubric = field(box, "Rubric criteria, one per line", BLIND_LAB_SAMPLE.entries[0].rubric.join("\n"), true);
    const candidates = BLIND_LAB_SAMPLE.entries[0].candidates.map((c, i) => ({
      label: field(box, `Candidate ${i + 1} reveal label`, c.label),
      text: field(box, `Candidate ${i + 1} frozen text`, c.text, true)
    }));
    entries = () => [
      {
        id: "trial",
        source: exercise.value,
        rubric: rubric.value.split("\n").filter(Boolean),
        candidates: candidates.map((c) => ({ label: c.label.value, text: c.text.value }))
      }
    ];
  } else if (kind === "ai") {
    const op = select(box, "Workflow", ["generate", "compare", "terminology-critique"]),
      ids = field(box, "Approved provider IDs, separated by commas", "ollama");
    entries = () => {
      const providers = ids.value.split(",").map((s) => s.trim());
      return [{ operation: op.value, providerIds: providers, maxRequests: providers.length }];
    };
  } else if (repository) {
    const rows = el(box, "div");
    const chosen = [];
    el(rows, "p", "Choose installed resources to pin to exact versions. Only references travel with the kit.");
    repository[repository.describe ? "describe" : "list"]()
      .then((records) => {
        const allowed = records.filter((r) => r.pack.kind !== "client");
        if (!allowed.length) el(rows, "p", "Install a pack first.");
        for (const r of allowed) {
          const item = el(rows, "fieldset");
          el(item, "legend", r.pack.name + " · " + r.version);
          const include = field(item, "Include this resource"),
            required = field(item, "Required in project"),
            priority = field(item, "Priority (0–100)", String(Math.min(chosen.length, 100)));
          include.type = "checkbox";
          required.type = "checkbox";
          priority.type = "number";
          priority.min = "0";
          priority.max = "100";
          chosen.push({ r, include, required, priority });
        }
      })
      .catch(() => el(rows, "p", "Could not load installed resources."));
    entries = () =>
      chosen
        .filter((row) => row.include.checked)
        .map(({ r, required, priority }) => ({
          id: r.id,
          version: r.version,
          digest: r.digest,
          priority: Number(priority.value),
          required: required.checked
        }));
  } else {
    const refs = field(
      box,
      "Verified resource references: one per line, id | version | digest | priority (0–100) | required or optional",
      "",
      true
    );
    entries = () =>
      refs.value
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const cols = line.split("|").map((v) => v.trim());
          if (cols.length !== 5 || !["required", "optional"].includes(cols[4]) || !/^\d+$/.test(cols[3]))
            throw new Error("Invalid reference.");
          return {
            id: cols[0],
            version: cols[1],
            digest: cols[2],
            priority: Number(cols[3]),
            required: cols[4] === "required"
          };
        });
  }
  action(box, "Preview authored pack", async () => {
    await onCreate({
      format: "loopcat-pack",
      schemaVersion: 1,
      id: id.value,
      version: version.value,
      kind,
      name: name.value,
      publisher: publisher.value,
      license: license.value,
      languages: { source: src.value, target: tgt.value },
      entries: validateWorkflowEntries(kind, entries())
    });
  });
}
