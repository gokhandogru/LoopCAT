(() => {
  "use strict";

  const sample = "Coastal field guide";
  const pair = "English → Turkish";
  const languages = ["English", "Turkish", "Spanish", "Catalan", "Arabic"];
  const file = "Visitor guide.docx";
  const resources = [
    {
      id: "tm",
      name: "Coastal memory",
      type: "Translation memory",
      role: "Main TM",
      entries: [
        ["Visitor information", "Ziyaretçi bilgileri"],
        ["Follow the marked trail.", "İşaretli patikayı takip edin."],
        ["Tide tables", "Gelgit çizelgeleri"],
        ["Protect the shoreline.", "Kıyı şeridini koruyun."],
        ["Follow the coastal path to the lighthouse.", "Deniz fenerine ulaşmak için kıyı yolunu izleyin."]
      ]
    },
    {
      id: "tb",
      name: "Coastal glossary",
      type: "Termbase",
      role: "Active termbase",
      entries: [
        ["shoreline", "kıyı şeridi"],
        ["tide pool", "gelgit havuzu"],
        ["salt marsh", "tuzlu bataklık"],
        ["coastal path", "kıyı yolu"]
      ]
    }
  ];
  const packs = [
    {
      id: "terms",
      name: "Coastal terminology",
      kind: "Terminology",
      by: "Coastal teaching team",
      icon: "book",
      description: "Three bilingual field-guide terms with preferred Turkish forms."
    },
    {
      id: "lesson",
      name: "Blind Translation Lab",
      kind: "Teaching",
      by: "Coastal teaching team",
      icon: "layers",
      description: "Compare two translations and record your reasoning before the candidates are identified."
    }
  ];
  const state = {
    projects: [sample],
    pairs: new Map([[sample, pair]]),
    type: "all",
    resource: "",
    exchange: "examples",
    installed: new Set(),
    active: new Set(),
    choice: "",
    reasoning: "",
    revealed: false,
    report: "simple",
    scope: "project",
    baseline: null,
    resourceEdits: {},
    resourceDrafts: {},
    notice: ""
  };
  const html = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  const icon = (name, size = 18) => window.loopIcon(name, size);
  const progress = () => window.loopProgress();
  const action = (label, key, { glyph = "", style = "", value = "", attrs = "" } = {}) =>
    `<button type="button" class="btn ${style}" data-view-action="${key}" data-value="${html(value)}" ${attrs}>${glyph ? icon(glyph, 16) : ""}${html(label)}</button>`;
  const go = (label, key, glyph, primary = false) =>
    `<button type="button" class="btn${primary ? " primary" : ""}" data-go="${key}">${glyph ? icon(glyph, 16) : ""}${html(label)}</button>`;
  const title = (text, sub, actions = "") =>
    `<header class="page-head"><div><h1 tabindex="-1">${html(text)}</h1><p>${html(sub)}</p></div>${actions ? `<div class="sv-actions">${actions}</div>` : ""}</header>`;
  const notice = () =>
    `<p data-view-notice class="sv-notice" role="status"${state.notice ? "" : " hidden"}>${html(state.notice)}</p>`;
  const panel = (heading, body, end = "") =>
    `<section class="panel"><header class="panel-head"><h2>${html(heading)}</h2>${end}</header>${body}</section>`;
  const callout = (glyph, heading, text) =>
    `<div class="sv-line"><span class="sv-icon" aria-hidden="true">${icon(glyph)}</span><div><strong>${html(heading)}</strong><p>${html(text)}</p></div></div>`;
  function table(headers, rows) {
    const body = rows.replace(/<tr>([\s\S]*?)<\/tr>/g, (_, cells) => {
      let index = 0;
      return (
        "<tr>" +
        cells.replace(/<td\b/g, () => {
          const label = headers[index++];
          return label ? `<td data-label="${html(label)}"` : "<td";
        }) +
        "</tr>"
      );
    });
    return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${html(h || "Actions")}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const meter = (p) =>
    `<div class="sv-progress"><span>${p.confirmed} / ${p.total} confirmed</span><progress value="${p.confirmed}" max="${p.total || 1}" aria-label="Confirmed segments"></progress></div>`;
  const tableName = (name, glyph, detail = "") =>
    `<div class="sv-name"><span class="sv-icon" aria-hidden="true">${icon(glyph)}</span><div><strong>${html(name)}</strong>${detail ? `<small>${html(detail)}</small>` : ""}</div></div>`;
  const mode = (name, value, current, event) =>
    action(name, event, { style: "sv-mode", value, attrs: `aria-pressed="${value === current}"` });
  const group = (name, content) => `<div class="sv-modes" role="group" aria-label="${name}">${content}</div>`;
  const zero = { total: 0, confirmed: 0, draft: 0, empty: 0 };

  function projects() {
    return (
      title(
        "Projects",
        "Translation projects on this device.",
        action("New project", "new-project", { glyph: "plus", style: "primary" })
      ) +
      panel(
        "Project library",
        table(
          ["Project", "Language pair", "Progress", ""],
          state.projects
            .map(
              (name) =>
                `<tr><td>${tableName(name, "folder", name === sample ? "1 file" : "No files")}</td><td>${html(state.pairs.get(name))}</td><td>${meter(name === sample ? progress() : zero)}</td><td>${action(name === sample ? "Open project" : "View details", "open-project", { value: name, style: name === sample ? "tonal" : "" })}</td></tr>`
            )
            .join("")
        )
      )
    );
  }

  function files() {
    const p = progress();
    const details = table(
      ["File", "Source words", "Progress", ""],
      `<tr><td>${tableName(file, "file", "Word document")}</td><td>${p.words}</td><td>${meter(p)}</td><td>${go("Open editor", "editor", "arrow", true)}</td></tr>`
    );
    return (
      title(sample, `${pair} · 1 file`, go("Statistics", "statistics", "chart")) +
      panel("Files", details) +
      panel(
        "Linked resources",
        resources
          .map(
            (r) =>
              `<div class="sv-list-row">${tableName(r.name, r.id === "tm" ? "layers" : "book", r.role)}${action("View resource", "open-linked", { value: r.id })}</div>`
          )
          .join("")
      )
    );
  }

  function resourcesView() {
    if (state.resource) return resourceDetail();
    const modes = group(
      "Resource type",
      [
        ["all", "All resources"],
        ["tm", "Translation memories"],
        ["tb", "Termbases"]
      ]
        .map(([v, n]) => mode(n, v, state.type, "resource-type"))
        .join("")
    );
    const rows = resources
      .filter((r) => state.type === "all" || state.type === r.id)
      .map(
        (r) =>
          `<tr><td>${tableName(r.name, r.id === "tm" ? "layers" : "book", r.type)}</td><td>${pair}</td><td>${r.entries.length}</td><td><span class="badge">${r.role}</span></td><td>${action("Open", "open-resource", { value: r.id, attrs: `aria-label="Open ${r.name}"` })}</td></tr>`
      )
      .join("");
    return (
      title("Resources", "Translation memories and terminology available on this device.") +
      `<div class="sv-toolbar">${modes}</div>` +
      panel("Resource library", table(["Resource", "Language pair", "Entries", "Project role", ""], rows))
    );
  }

  const savedText = (r, i) => state.resourceEdits[`${r.id}-${i}`] ?? r.entries[i][1];
  window.loopResourceTarget = (id, source) => {
    const resource = resources.find((r) => r.id === id);
    const index = resource?.entries.findIndex(([text]) => text === source) ?? -1;
    return index >= 0 ? savedText(resource, index) : undefined;
  };
  function resourceDetail() {
    const r = resources.find((item) => item.id === state.resource);
    const rows = r.entries
      .map(
        ([src], i) =>
          `<tr><td>${html(src)}</td><td lang="tr">${html(savedText(r, i))}</td><td>${state.resourceDrafts[`${r.id}-${i}`] !== undefined ? '<span class="badge">Draft</span>' : r.id === "tb" ? "Preferred" : "Saved"}</td><td>${action("Edit", "edit-entry", { value: i, attrs: `aria-label="Edit ${html(src)}"` })}</td></tr>`
      )
      .join("");
    return (
      title(
        r.name,
        `${r.type} · ${pair} · ${r.role}`,
        action("Resource library", "back-resources", { glyph: "arrowLeft" })
      ) + panel("Entries", table(["Source", "Target", "State", ""], rows))
    );
  }

  function exchange() {
    const modes = group(
      "Exchange library",
      [
        ["examples", "Examples"],
        ["installed", `Installed (${state.installed.size})`]
      ]
        .map(([v, n]) => mode(n, v, state.exchange, "exchange-mode"))
        .join("")
    );
    const items = state.exchange === "installed" ? packs.filter((p) => state.installed.has(p.id)) : packs;
    const cards = items
      .map(
        (p) =>
          `<article class="panel sv-pack"><div class="sv-pack-top"><span class="sv-icon" aria-hidden="true">${icon(p.icon, 22)}</span><span class="badge">${p.kind}</span></div><h2>${p.name}</h2><small>${p.by} · v1.0</small><p>${p.description}</p><div class="sv-pack-end">${action("View pack", "pack-detail", { value: p.id })}<span class="sv-state">${state.active.has(p.id) ? "Active in this project" : state.installed.has(p.id) ? "Installed on device" : "Bundled example"}</span></div></article>`
      )
      .join("");
    return (
      title("Exchange", "Offline packs and teaching materials.") +
      `<div class="sv-toolbar">${modes}</div>` +
      (cards
        ? `<div class="sv-cards">${cards}</div>`
        : panel(
            "Installed packs",
            '<div class="sv-blank"><strong>No installed packs</strong><p>Open an example to inspect and install it on this device.</p></div>'
          ))
    );
  }

  function statistics() {
    const p = progress();
    const summary = [
      ["Source words", p.words],
      ["Segments", p.total],
      ["Confirmed", p.confirmed],
      ["Untranslated", p.empty]
    ];
    const percent = (n) => (p.total ? Math.round((n / p.total) * 100) : 0);
    const rows = [
      ["Confirmed", p.confirmed],
      ["Draft", p.draft],
      ["Untranslated", p.empty]
    ]
      .map(
        ([label, n]) =>
          `<tr><td>${label}</td><td>${n}</td><td><div class="sv-bar"><progress value="${n}" max="${p.total || 1}" aria-label="${label}"></progress><span>${percent(n)}%</span></div></td></tr>`
      )
      .join("");
    const advanced =
      state.report === "advanced"
        ? panel(
            "File breakdown",
            table(
              ["File", "Source words", "Segments", "Confirmed"],
              `<tr><td>${file}</td><td>${p.words}</td><td>${p.total}</td><td>${p.confirmed}</td></tr>`
            )
          )
        : "";
    return (
      title("Statistics", `${sample} · ${pair}`, action("Save baseline", "save-baseline", { glyph: "clock" })) +
      `<div class="sv-toolbar">${group("Report detail", mode("Simple", "simple", state.report, "report-mode") + mode("Advanced", "advanced", state.report, "report-mode"))}<label class="sv-select">Scope <select data-view-input="scope"><option value="project" ${state.scope === "project" ? "selected" : ""}>Entire project</option><option value="file" ${state.scope === "file" ? "selected" : ""}>${file}</option></select></label></div>` +
      `<section class="panel sv-metrics" aria-label="Translation statistics">${summary.map(([l, n]) => `<div><small>${l}</small><strong>${n}</strong></div>`).join("")}</section>` +
      panel(
        "Segment status",
        table(["Status", "Segments", "Share of scope"], rows),
        action("Export CSV", "export-statistics", { glyph: "download" })
      ) +
      advanced +
      (state.baseline
        ? panel(
            "Saved baseline",
            callout(
              "clock",
              state.baseline.scope,
              `${state.baseline.confirmed} of ${state.baseline.total} segments confirmed when saved.`
            )
          )
        : "")
    );
  }

  function workspace() {
    return (
      title("Workspace", "Local saving, recovery, and workspace information.") +
      panel(
        "Storage and recovery",
        callout("monitor", "Local saving", "Project edits are kept on this device.") +
          callout(
            "shield",
            "External backup not configured",
            "Connect a storage folder in LoopCAT to keep a verified copy outside this profile."
          ) +
          `<div class="sv-panel-foot">${action("Recovery options", "recovery", { glyph: "restore" })}</div>`
      ) +
      panel(
        "Workspace settings",
        `<div class="sv-list-row">${tableName("Interface language", "globe", "English · Independent of the project language pair")}${action("Language details", "language")}</div>` +
          `<div class="sv-list-row">${tableName("Trash", "restore", "Recover removed projects, files, and resources")}${action("Open Trash", "trash")}</div>` +
          `<div class="sv-list-row">${tableName("Local diagnostics", "info", "Runtime and storage information")}${action("Preview", "diagnostics", { attrs: 'aria-label="Preview local diagnostics"' })}</div>`
      )
    );
  }

  const screens = { projects, files, resources: resourcesView, exchange, statistics, workspace };
  let lastView = "";
  function render(view) {
    if (!screens[view]) return "";
    if (view !== lastView) state.notice = "";
    lastView = view;
    return `<div class="page-body sv-page" data-loop-secondary="${view}">${screens[view]()}${notice()}<dialog class="sv-dialog" aria-labelledby="sv-dialog-title"></dialog></div>`;
  }
  window.renderLoopView = render;
  const root = () => document.querySelector("[data-loop-secondary]");
  const redraw = () => {
    const node = root();
    if (node) node.outerHTML = render(node.dataset.loopSecondary);
  };
  const notify = (msg) => {
    state.notice = msg;
    const node = root()?.querySelector("[data-view-notice]");
    if (node) {
      node.hidden = false;
      node.textContent = msg;
    }
  };
  const nav = (key) => window.loopNavigate(key);
  let opener;
  function dialog(heading, content) {
    const box = root().querySelector("dialog");
    if (!box.open) opener = document.activeElement;
    box.innerHTML = `<header><h2 id="sv-dialog-title">${html(heading)}</h2>${action("Close", "close")}</header>${content}`;
    if (!box.open) box.showModal();
    else box.querySelector("h2")?.setAttribute("tabindex", "-1");
    if (box.open) box.querySelector('input:not([type="radio"]), textarea, button')?.focus();
  }
  function close(redrawPage = false) {
    const box = root()?.querySelector("dialog");
    const key = opener?.dataset.viewAction;
    const val = opener?.dataset.value;
    if (box?.open) box.close();
    if (redrawPage) redraw();
    if (opener?.isConnected) opener.focus();
    else if (key)
      [...root().querySelectorAll("[data-view-action]")]
        .find((b) => b.dataset.viewAction === key && b.dataset.value === val)
        ?.focus();
  }
  function packDialog(id) {
    const p = packs.find((item) => item.id === id);
    const installed = state.installed.has(id);
    let controls = installed
      ? '<span class="badge">Installed on device</span>'
      : action("Install on device", "install-pack", { value: id, style: "primary" });
    if (installed && id === "terms")
      controls += action(
        state.active.has(id) ? "Disable for this project" : "Activate for this project",
        "toggle-pack",
        { value: id }
      );
    if (installed && id === "lesson") controls += action("Open exercise", "lesson", { style: "primary" });
    if (installed) controls += action("Uninstall", "uninstall-pack", { value: id });
    dialog(
      p.name,
      `<p>${p.description}</p><dl class="sv-dl"><dt>Publisher</dt><dd>${p.by}</dd><dt>Version</dt><dd>1.0 · Sample pack</dd><dt>License</dt><dd>CC BY 4.0 (illustrative)</dd><dt>Origin</dt><dd>Bundled with this preview</dd><dt>Contents</dt><dd>${id === "terms" ? "3 preferred terms · English → Turkish" : "1 frozen comparison exercise"}</dd>${id === "terms" ? `<dt>Project</dt><dd>${sample} · ${state.active.has(id) ? "Active" : "Inactive"}</dd>` : ""}</dl><div class="sv-actions">${controls}</div>`
    );
  }
  function lesson() {
    const options = [
      ["A", "Lütfen işaretli patikadan ayrılmayın."],
      ["B", "Lütfen işaretli patika üzerinde kalın."]
    ];
    if (state.revealed) {
      dialog(
        "Comparison results",
        `<p>Your choice was candidate ${html(state.choice)}.</p><blockquote>${html(state.reasoning)}</blockquote><dl class="sv-dl"><dt>Candidate A</dt><dd>Reference translation</dd><dt>Candidate B</dt><dd>Frozen alternative</dd></dl>`
      );
      return;
    }
    dialog(
      "Blind Translation Lab",
      `<form data-view-form="lesson"><p lang="en">Please stay on the marked trail.</p><fieldset><legend>Which translation would you use?</legend>${options.map(([l, t]) => `<label class="sv-radio"><input type="radio" name="candidate" value="${l}" required ${state.choice === l ? "checked" : ""}><span><strong>Candidate ${l}</strong><br><span lang="tr">${t}</span></span></label>`).join("")}</fieldset><label>Your reasoning<textarea required name="reasoning" rows="3">${html(state.reasoning)}</textarea></label><button class="btn primary">Record and reveal</button></form>`
    );
  }
  function editEntry(i) {
    const r = resources.find((item) => item.id === state.resource);
    const key = `${r.id}-${i}`;
    dialog(
      "Edit resource entry",
      `<form data-view-form="entry" data-index="${i}"><label>Source<span class="sv-static">${html(r.entries[i][0])}</span></label><label>Target<textarea required name="target" lang="tr" rows="3" data-view-draft="${key}">${html(state.resourceDrafts[key] ?? savedText(r, i))}</textarea></label><div class="sv-actions"><button class="btn primary">Save entry</button>${action("Discard draft", "discard-draft", { value: key })}</div></form>`
    );
  }

  const actions = {
    close: () => close(true),
    "new-project": () => {
      const options = (selected) =>
        languages.map((name) => `<option${name === selected ? " selected" : ""}>${name}</option>`).join("");
      dialog(
        "New project",
        `<form data-view-form="project"><label>Project name<input name="name" required maxlength="80" placeholder="Project name" autocomplete="off"></label><label>Source language<select name="source">${options("English")}</select></label><label>Target language<select name="target">${options("Turkish")}</select></label><p class="muted">This design preview keeps the new project in this session.</p><button class="btn primary">Create project</button></form>`
      );
    },
    "open-project": (name) => {
      if (name === sample) nav("files");
      else dialog(name, callout("folder", "No files yet", state.pairs.get(name)));
    },
    "resource-type": (v) => {
      state.type = v;
      redraw();
    },
    "open-resource": (v) => {
      state.resource = v;
      redraw();
    },
    "open-linked": (v) => {
      state.resource = v;
      nav("resources");
    },
    "back-resources": () => {
      state.resource = "";
      redraw();
    },
    "edit-entry": (v) => editEntry(Number(v)),
    "discard-draft": (k) => {
      delete state.resourceDrafts[k];
      close(true);
      notify("Entry draft discarded.");
    },
    "exchange-mode": (v) => {
      state.exchange = v;
      redraw();
    },
    "pack-detail": packDialog,
    "install-pack": (id) => {
      state.installed.add(id);
      packDialog(id);
    },
    "uninstall-pack": (id) => {
      state.installed.delete(id);
      state.active.delete(id);
      close(true);
      notify("Pack removed from this preview.");
    },
    "toggle-pack": (id) => {
      if (state.active.has(id)) state.active.delete(id);
      else state.active.add(id);
      packDialog(id);
    },
    lesson: lesson,
    "report-mode": (v) => {
      state.report = v;
      redraw();
    },
    "save-baseline": () => {
      state.baseline = { ...progress(), scope: state.scope === "file" ? file : sample };
      redraw();
      notify("Baseline saved in this preview.");
    },
    "export-statistics": () => {
      const p = progress();
      const rows = [
        ["Scope", "Source words", "Segments", "Confirmed", "Draft", "Untranslated"],
        [state.scope === "file" ? file : sample, p.words, p.total, p.confirmed, p.draft, p.empty]
      ];
      const blob = new Blob([rows.map((row) => row.join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loopcat-sample-statistics.csv";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Sample CSV download requested.");
    },
    recovery: () =>
      dialog(
        "Recovery options",
        callout("clock", "Local checkpoint", "Recover a recent committed state from this device.") +
          callout(
            "shield",
            "Verified folder backup",
            "Recover from a connected folder or import a portable backup as copies."
          ) +
          callout("download", "Emergency bilingual export", "Rescue source and target text when local saving fails.")
      ),
    language: () =>
      dialog(
        "Interface language",
        "<p>LoopCAT supports English, Turkish, Spanish, Catalan, and Arabic. The Arabic interface mirrors navigation. Source and target text each retain their own direction.</p>"
      ),
    trash: () =>
      dialog(
        "Trash",
        '<div class="sv-blank"><strong>Trash is empty</strong><p>Removed projects, files, and resources appear here until restored or permanently deleted.</p></div>'
      ),
    diagnostics: () =>
      dialog(
        "Local diagnostics preview",
        '<dl class="sv-dl"><dt>Environment</dt><dd>Standalone design preview</dd><dt>Storage</dt><dd>Session memory</dd><dt>Network</dt><dd>No provider connected</dd></dl>'
      )
  };
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-view-action]");
    if (!btn?.closest("[data-loop-secondary]")) return;
    const { viewAction: key, value } = btn.dataset;
    actions[key]?.(value);
    if (!btn.isConnected && !root()?.querySelector("dialog[open]")) {
      const candidates = root()?.querySelectorAll("[data-view-action]") || [];
      const next = [...candidates].find((b) => b.dataset.viewAction === key && b.dataset.value === value);
      if (document.activeElement === document.body || !document.activeElement) {
        (next || root()?.querySelector("h1"))?.focus();
      }
    }
  });
  document.addEventListener(
    "cancel",
    (ev) => {
      if (ev.target.matches("dialog.sv-dialog")) {
        ev.preventDefault();
        close(true);
      }
    },
    true
  );
  document.addEventListener("change", (ev) => {
    if (ev.target.matches('[data-view-input="scope"]')) {
      state.scope = ev.target.value;
      redraw();
      root().querySelector('[data-view-input="scope"]').focus();
    }
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.dataset.viewDraft) state.resourceDrafts[ev.target.dataset.viewDraft] = ev.target.value;
    if (ev.target.matches('[data-view-form="lesson"] [name="reasoning"]')) state.reasoning = ev.target.value;
    if (ev.target.matches('[data-view-form="lesson"] [name="candidate"]')) state.choice = ev.target.value;
    if (ev.target.matches('[data-view-form="project"] input')) ev.target.setCustomValidity("");
    if (ev.target.matches('[data-view-form="project"] select')) ev.target.form.elements.target.setCustomValidity("");
  });
  document.addEventListener("submit", (ev) => {
    const form = ev.target.closest("[data-view-form]");
    if (!form) return;
    ev.preventDefault();
    const vals = new FormData(form);
    if (form.dataset.viewForm === "project") {
      const name = String(vals.get("name")).trim();
      if (!name || state.projects.some((p) => p.toLowerCase() === name.toLowerCase())) {
        form.elements.name.setCustomValidity("Enter a distinct project name.");
        form.elements.name.reportValidity();
        return;
      }
      if (vals.get("source") === vals.get("target")) {
        form.elements.target.setCustomValidity("Choose a different target language.");
        form.elements.target.reportValidity();
        return;
      }
      state.pairs.set(name, `${vals.get("source")} → ${vals.get("target")}`);
      state.projects.push(name);
      close(true);
      notify(`${name} created in this preview.`);
    } else if (form.dataset.viewForm === "entry") {
      const key = `${state.resource}-${form.dataset.index}`;
      const val = String(vals.get("target")).trim();
      if (!val) {
        form.elements.target.focus();
        return;
      }
      state.resourceEdits[key] = val;
      delete state.resourceDrafts[key];
      close(true);
      notify("Resource entry saved in this preview.");
    } else if (form.dataset.viewForm === "lesson") {
      state.choice = String(vals.get("candidate"));
      state.reasoning = String(vals.get("reasoning")).trim();
      if (!state.reasoning) {
        form.elements.reasoning.focus();
        return;
      }
      state.revealed = true;
      lesson();
    }
  });
})();
