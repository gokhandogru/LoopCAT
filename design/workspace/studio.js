(function workspacePreview() {
  "use strict";
  const rows = [
    ["The coastal path", "Kıyı yolu", "confirmed"],
    ["Start at the visitor centre.", "Ziyaretçi merkezinden başlayın.", "confirmed"],
    ["The route follows the edge of the bay.", "Rota, koyun kıyısını izler.", "confirmed"],
    ["Follow the coastal path to the old lighthouse.", "Eski deniz fenerine giden kıyı patikasını izleyin.", "draft"],
    ["The crossing takes about 20 minutes.", "Geçiş yaklaşık 15 dakika sürer.", "draft"],
    ["Check the tide tables before you leave.", "", "empty"],
    ["The last ferry departs at {time}.", "", "empty"],
    ["Please leave the shoreline as you found it.", "", "empty"]
  ].map(([source, target, status]) => ({ source, target, status, origin: "", comments: [] }));
  const savedAiTarget = "Eski deniz fenerine ulaşmak için kıyı yolunu izleyin.";
  const destinations = {
    projects: ["Projects", "folder"],
    files: ["Files", "files"],
    editor: ["Editor", "edit"],
    statistics: ["Statistics", "chart"],
    resources: ["Resources", "layers"],
    exchange: ["Exchange", "exchange"],
    workspace: ["Workspace", "settings"]
  };
  const statuses = {
    confirmed: ["Confirmed", "circleCheck"],
    draft: ["Draft", "draft"],
    empty: ["Untranslated", "circle"]
  };
  const tabs = ["Matches", "Quality", "Review", "AI", "Info"];
  const narrow = matchMedia("(max-width: 999px)");
  const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
  const state = {
    compact: false,
    view: "editor",
    active: 3,
    tab: "Matches",
    inspector: true,
    focus: false,
    filters: false,
    search: "",
    status: "all",
    history: [],
    dark: false,
    gridScroll: 0
  };
  const byId = (id) => document.getElementById(id);
  const icon = window.loopIcon;
  const safe = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  const markup = (text) => safe(text).replace(/\{time\}/g, '<bdi class="tag-chip">{time}</bdi>');
  const button = (action, name, glyph, extra = "") =>
    `<button type="button" class="btn ${extra}" data-action="${action}">${icon(glyph, 15)}${name}</button>`;
  const square = (action, label, glyph) =>
    `<button type="button" class="square" data-action="${action}" aria-label="${label}" title="${label}">${icon(glyph, 17)}</button>`;
  const progress = () => ({
    total: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    draft: rows.filter((r) => r.status === "draft").length,
    empty: rows.filter((r) => r.status === "empty").length,
    words: rows.reduce(
      (n, r) =>
        n +
        r.source
          .replace("{time}", "")
          .trim()
          .split(/\s+/)
          .filter((w) => /\p{L}|\d/u.test(w)).length,
      0
    )
  });
  window.loopProgress = progress;
  const overlay = byId("overlay");
  let overlayOpener = null;
  let timer;
  const notice = (msg) => {
    clearTimeout(timer);
    byId("notice").textContent = msg;
    timer = setTimeout(() => {
      byId("notice").textContent = "";
    }, 3600);
  };
  function issues(i) {
    const r = rows[i];
    if (!r.target.trim()) return [];
    const result = [];
    if (r.source.includes("20") && !/\b20\b/.test(r.target))
      result.push(["Number mismatch", "The source says 20 minutes. Check the number in the target."]);
    if (r.source.includes("{time}") && !r.target.includes("{time}"))
      result.push(["Missing protected tag", "Insert {time} before confirming this segment."]);
    return result;
  }
  const visibleRows = () =>
    rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          (state.status === "all" || r.status === state.status) &&
          (r.source + " " + r.target).toLowerCase().includes(state.search.trim().toLowerCase())
      );
  function navigation() {
    const link = (view) =>
      `<button class="rail-link" data-go="${view}" ${state.view === view ? 'aria-current="page"' : ""}>${icon(destinations[view][1], 20)}<span>${destinations[view][0]}</span></button>`;
    byId("rail").innerHTML =
      `<button class="logo" data-go="projects" aria-label="LoopCAT projects"><img src="../../icons/loopcat-loopbird-mono.svg" alt=""><span>LoopCAT</span></button>
      <div class="nav-group">${link("projects")}${link("resources")}${link("exchange")}</div>
      <div class="nav-group">${link("files")}${link("editor")}${link("statistics")}</div>
      <div class="nav-group nav-bottom">${link("workspace")}</div>`;
    const sep = `<span class="crumb-sep" aria-hidden="true">${icon("chevron", 12)}</span>`;
    const projectView = ["editor", "files", "statistics"].includes(state.view);
    const activeProject = "Coastal field guide";
    byId("crumbs").innerHTML =
      (projectView
        ? `<span class="inline parent-crumb"><button data-go="projects">Projects</button>${sep}</span><button data-go="files">${safe(activeProject)}</button>${sep}`
        : `<span class="inline parent-crumb">${icon("monitor", 15)} Local workspace ${sep}</span>`) +
      `<strong>${destinations[state.view][0]}</strong>`;
    byId("theme").innerHTML = icon(state.dark ? "sun" : "moon", 17);
    byId("theme").setAttribute("aria-label", `Use ${state.dark ? "light" : "dark"} theme`);
    byId("theme").title = byId("theme").getAttribute("aria-label");
    byId("nav-toggle").innerHTML = icon("menu");
    document.querySelector(".command-trigger").innerHTML =
      `${icon("search", 15)}<span>Find a command</span><kbd>F2</kbd>`;
  }
  function closeNavigation() {
    document.body.classList.remove("navigation-open");
    byId("nav-toggle").setAttribute("aria-expanded", "false");
  }
  function navigate(view) {
    if (!Object.hasOwn(destinations, view)) return;
    if (state.view === "editor")
      state.gridScroll = document.querySelector(".seg-scroll")?.scrollTop ?? state.gridScroll;
    if (overlay.open) overlay.close();
    closeNavigation();
    state.focus = false;
    state.view = view;
    if (location.hash.slice(1) !== view) history.pushState(null, "", "#" + view);
    render();
    byId("content").focus({ preventScroll: true });
  }
  window.loopNavigate = navigate;
  function progressMarkup() {
    const p = progress();
    return `<div class="progress-title"><span><strong>${p.confirmed} of ${p.total}</strong> confirmed</span><strong>${Math.round((p.confirmed / p.total) * 100)}%</strong></div><progress aria-label="Confirmed segments" value="${p.confirmed}" max="${p.total}"></progress>`;
  }
  function rowMarkup({ r, i }) {
    const active = i === state.active,
      [label, glyph] = statuses[r.status];
    let source = markup(r.source);
    const term = active ? termFor(i) : null;
    if (term)
      source = source.replace(
        new RegExp(term.source, "i"),
        (matched) => '<span class="term-link">' + matched + "</span>"
      );
    const problem = issues(i)[0];
    const flag = problem
      ? '<button class="row-alert" data-risk="' +
        i +
        '" aria-label="Inspect ' +
        safe(problem[0]) +
        " in segment " +
        (i + 1) +
        '">' +
        icon("info", 12) +
        safe(problem[0]) +
        "</button>"
      : "";
    const target = active
      ? `<textarea id="active-target" spellcheck="false" lang="tr" dir="auto" aria-label="Turkish target for segment ${i + 1}">${safe(r.target)}</textarea><div class="active-foot"><span id="active-state" class="seg-state ${r.status}">${icon(glyph, 13)}${label}</span><button class="btn primary" data-action="confirm" ${r.target.trim() ? "" : "disabled"}>${icon("check", 14)}Confirm <span class="key">${mod} ↵</span></button></div>`
      : `<button class="target-open ${r.status}" data-row="${i}" aria-label="Edit target for segment ${i + 1}"><span lang="tr" dir="auto">${r.target ? markup(r.target) : "Enter translation…"}</span></button>`;
    return `<div class="segment ${active ? "active" : ""}" role="row" aria-label="Segment ${i + 1}, ${label}"><div role="cell"><button class="seg-id" aria-label="Select segment ${i + 1}, ${label}" title="Segment ${i + 1} · ${label}" data-row="${i}"><b>${String(i + 1).padStart(2, "0")}</b><span class="${r.status}">${icon(glyph, 13)}</span></button></div><div class="source-cell" lang="en" dir="auto" role="cell">${source}</div><div class="target-cell" role="cell">${target}${flag}</div></div>`;
  }
  function grid() {
    const visible = visibleRows();
    return `<section class="panel editor-board" aria-label="Bilingual editor">
      <div class="panel-head"><div class="board-heading">${icon("grid", 18)}<h2>Segments</h2></div><div class="tools">${button("filters", `<span>${state.filters ? "Close search" : "Find segments"}</span>`, "search", "subtle find-trigger")}${button("next", "Next unconfirmed", "next", "subtle")}<i class="tool-divider"></i>${square("inspector", state.inspector && !narrow.matches ? "Hide inspector" : "Show inspector", "panel")}${square("editor-tools", "Editor actions", "more")}</div></div>
      ${state.filters ? `<div class="board-options"><input id="query" aria-label="Find in source or target" placeholder="Find in source or target" value="${safe(state.search)}"><select aria-label="Segment status filter" id="status-filter">${[["all", "All statuses"], ...Object.entries(statuses).map(([v, s]) => [v, s[0]])].map(([v, s]) => `<option value="${v}" ${state.status === v ? "selected" : ""}>${s}</option>`).join("")}</select><span class="note" id="results-count">${visible.length} results</span></div>` : ""}
      <div role="table" aria-label="English to Turkish translation segments" class="seg-table"><div class="grid-labels" role="row"><span role="columnheader">#</span><span role="columnheader">Source <b>EN</b></span><span role="columnheader">Target <b>TR</b></span></div><div class="seg-scroll" role="rowgroup">${visible.map(rowMarkup).join("") || '<p class="empty-msg">No segments match these filters.</p>'}</div></div>
    </section>`;
  }
  function termFor(i) {
    if (![0, 3, 7].includes(i)) return null;
    const source = i === 7 ? "shoreline" : "coastal path";
    const target = window.loopResourceTarget?.("tb", source) || (i === 7 ? "kıyı şeridi" : "kıyı yolu");
    return { source, target };
  }
  const matchSource = "Follow the coastal path to the lighthouse.";
  const matchTarget = () =>
    window.loopResourceTarget?.("tm", matchSource) || "Deniz fenerine ulaşmak için kıyı yolunu izleyin.";
  function matches() {
    const term = termFor(state.active);
    return `<section class="ins-group"><h3 class="card-label"><span class="inline">${icon("layers", 16)} Translation memory</span></h3>${
      state.active === 3
        ? `<div class="evidence"><div class="evidence-meta"><span class="match-score"><strong>96%</strong><small>match</small></span><span>Coastal memory</span></div><p class="sample-source" lang="en">${matchSource}</p><p class="sample-target" lang="tr">${safe(matchTarget())}</p><p class="note">Current source adds “old”.</p>${button("insert", "Insert match", "arrow", "tonal match-act")}</div>`
        : `<p class="note">No memory matches for this segment.</p>`
    }</section>
      <section class="ins-group terms"><h3 class="card-label"><span class="inline">${icon("book", 16)} Terminology</span></h3>${term ? `<div class="term-pair"><b lang="en">${term.source}</b><span lang="tr">${safe(term.target)}</span></div><p class="note">Coastal glossary · Preferred</p>` : `<p class="note">No matching terms in Coastal glossary.</p>`}</section>`;
  }
  function inspectorBody() {
    const r = rows[state.active],
      list = issues(state.active);
    if (state.tab === "Matches") return matches();
    if (state.tab === "Quality") {
      const next = rows.findIndex((_, i) => i !== state.active && issues(i).length);
      return `<h3>Segment checks</h3>${list.length ? list.map(([title, desc]) => `<div class="quality-note"><strong>${title}</strong><p>${desc}</p>${title.includes("tag") ? button("tag", "Insert protected tag", "tag") : button("edit-target", "Edit target", "draft")}</div>`).join("") : `<p class="note">${r.target ? "No sample checks flagged this target." : "Enter a target to check this segment."}</p>`}${next >= 0 ? button("next-risk", `Go to issue · Segment ${next + 1}`, "next") : ""}`;
    }
    if (state.tab === "Review")
      return `<h3>Review comments</h3>${r.comments.length ? r.comments.map((c) => `<p class="review-note">${safe(c)}</p>`).join("") : '<p class="note">No comments on this segment.</p>'}<label>New comment<textarea id="review-text" aria-label="New review comment"></textarea></label>${button("comment", "Add comment", "note")}`;
    if (state.tab === "AI") {
      const suggestion = state.active === 3 ? `<section class="ins-group"><h3>Saved suggestion</h3><div class="evidence"><span class="note">Ollama · Local · Sample result</span><p lang="tr" class="sample-target">${savedAiTarget}</p>${r.target === savedAiTarget ? '<span class="note">Matches the current target.</span>' : button("apply-ai", "Apply as draft", "arrow", "tonal match-act")}</div></section>` : "";
      return `${suggestion}<section class="ins-group"><h3>New AI request</h3><p class="note">No provider is connected in this sample workspace.</p>${button("request-preview", "Preview request", "shield")}</section>`;
    }
    return `<h3>Segment information</h3><div class="term-pair"><b>Visitor guide.docx</b><span>Segment ${state.active + 1} of ${rows.length}</span></div><p class="note">English (en) → Turkish (tr)</p>${r.origin ? `<p class="note">Last inserted from ${safe(r.origin)}</p>` : ""}<p class="seg-state ${r.status}">${icon(statuses[r.status][1], 15)}${statuses[r.status][0]}</p>${r.source.includes("{time}") ? button("tag", "Insert protected tag", "tag") : ""}`;
  }
  function inspector(inDialog = false) {
    if (!visibleRows().length)
      return `<aside class="panel inspector"><div class="inspector-top"><h2${inDialog ? ' id="dialog-title"' : ""}>Inspector</h2>${square(inDialog ? "dismiss" : "inspector", "Close inspector", "close")}</div><p class="empty-msg">No segment in the current filter.</p></aside>`;
    return `<aside aria-label="Segment inspector" class="panel inspector"><div class="inspector-top"><h2${inDialog ? ' id="dialog-title"' : ""}>Inspector</h2><span class="inline">Segment ${String(state.active + 1).padStart(2, "0")}${square(inDialog ? "dismiss" : "inspector", "Close inspector", "close")}</span></div>
      <div class="inspect-tabs" role="tablist" aria-label="Inspector tools">${tabs.map((t) => `<button role="tab" ${t === state.tab ? 'tabindex="0"' : 'tabindex="-1"'} aria-selected="${t === state.tab}" id="tab-${t}" aria-controls="inspect-body" data-tab="${t}">${t}</button>`).join("")}</div>
      <div class="inspect-body" role="tabpanel" id="inspect-body" aria-labelledby="tab-${state.tab}">${inspectorBody()}</div></aside>`;
  }
  function render() {
    document.body.classList.toggle("focus", state.focus);
    document.body.classList.toggle("compact", state.compact);
    navigation();
    const main = byId("content");
    main.classList.toggle("editor-page", state.view === "editor");
    if (state.view === "editor") {
      main.innerHTML = `<header class="page-head"><div class="title-lock"><div class="file-symbol">${icon("file", 29)}</div><div><h1>Visitor guide.docx</h1><div class="subline"><span lang="en">English</span>${icon("arrow", 13)}<span>Turkish</span><span aria-hidden="true">·</span><span>Word document</span></div></div></div><div class="inline editor-header-actions"><div class="progress-box" id="file-progress">${progressMarkup()}</div>${button("focus", state.focus ? "Exit focus" : "Focus mode", "expand")}${button("export", "Export", "download")}</div></header><div class="editor-layout ${state.inspector && !state.focus && !narrow.matches ? "" : "no-inspector"}">${grid()}${state.inspector && !state.focus && !narrow.matches ? inspector() : ""}</div>`;
      const scroll = main.querySelector(".seg-scroll");
      if (scroll) scroll.scrollTop = state.gridScroll;
      byId("foot-context").textContent = `${progress().words} source words · 8 segments`;
    } else {
      main.innerHTML = window.renderLoopView(state.view);
      byId("foot-context").textContent = destinations[state.view][0];
    }
  }
  function rerender(focusTarget = false) {
    state.gridScroll = document.querySelector(".seg-scroll")?.scrollTop ?? state.gridScroll;
    render();
    if (focusTarget) byId("active-target")?.focus({ preventScroll: false });
  }
  function openDialog(title, body, focusSelector, opener = document.activeElement) {
    if (overlay.open) overlay.close();
    overlayOpener = opener;
    overlay.className = "";
    overlay.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${square("dismiss", "Close dialog", "close")}</div><div class="dialog-body">${body}</div>`;
    overlay.showModal();
    if (focusSelector) overlay.querySelector(focusSelector)?.focus();
  }
  function showNarrowInspector() {
    overlayOpener = document.querySelector('[data-action="inspector"]');
    overlay.className = "inspector-dialog";
    overlay.innerHTML = inspector(true);
    overlay.showModal();
    overlay.querySelector('[aria-selected="true"]')?.focus();
  }
  overlay.addEventListener("close", () => {
    if (overlay.open) return;
    overlay.innerHTML = "";
    overlay.className = "";
    if (overlayOpener?.isConnected) overlayOpener.focus({ preventScroll: true });
    overlayOpener = null;
  });
  function select(i, focus = true) {
    if (!Number.isInteger(i) || !rows[i]) return;
    state.active = i;
    rerender(focus);
  }
  function nextOpen() {
    const visible = visibleRows().map((x) => x.i);
    const next = [...visible.filter((i) => i > state.active), ...visible.filter((i) => i <= state.active)].find(
      (i) => rows[i].status !== "confirmed"
    );
    if (next !== undefined) select(next);
    else {
      rerender();
      notice("No unconfirmed segments in this view.");
    }
  }
  function remember(i) {
    const r = rows[i];
    state.history.push({ i, target: r.target, status: r.status, origin: r.origin });
  }
  function editValue(value) {
    const r = rows[state.active];
    if (r.target === value) return;
    r.target = value;
    r.status = value.trim() ? "draft" : "empty";
  }
  function undo() {
    const last = state.history.pop();
    if (!last) {
      notice("No preview action to undo.");
      return;
    }
    Object.assign(rows[last.i], { target: last.target, status: last.status, origin: last.origin });
    select(last.i);
    notice("Last action undone.");
  }
  function confirm() {
    const r = rows[state.active];
    if (!r.target.trim()) return;
    if (r.source.includes("{time}") && !r.target.includes("{time}")) {
      notice("Insert the missing {time} tag before confirming.");
      return;
    }
    remember(state.active);
    r.status = "confirmed";
    nextOpen();
  }
  function perform(action) {
    const r = rows[state.active];
    switch (action) {
      case "theme":
        state.dark = !state.dark;
        document.documentElement.dataset.theme = state.dark ? "dark" : "light";
        navigation();
        byId("theme").focus();
        break;
      case "commands": {
        const entries = Object.entries(destinations)
          .map(([v, [name, glyph]]) => `<button data-go="${v}">${icon(glyph, 16)}${name}</button>`)
          .join("");
        openDialog(
          "Find a command",
          `<input id="command-query" aria-label="Search commands" placeholder="Search commands…"><div class="command-list">${entries}${state.view === "editor" ? '<button data-action="focus">Toggle focus mode</button><button data-action="next">Next unconfirmed</button>' : ""}</div><span class="note" id="command-empty" hidden>No matching commands.</span>`,
          "input"
        );
        break;
      }
      case "filters":
        state.filters = !state.filters;
        if (!state.filters) {
          state.search = "";
          state.status = "all";
        }
        rerender();
        (byId("query") || document.querySelector('[data-action="filters"]')).focus();
        break;
      case "next":
        if (overlay.open) overlay.close();
        nextOpen();
        break;
      case "confirm":
        confirm();
        break;
      case "focus":
        if (overlay.open) overlay.close();
        state.focus = !state.focus;
        rerender(true);
        break;
      case "inspector":
        if (narrow.matches) {
          showNarrowInspector();
          break;
        }
        state.inspector = !state.inspector;
        rerender();
        document.querySelector('[data-action="inspector"]').focus();
        break;
      case "insert":
      case "apply-ai":
      case "tag":
        if (action === "tag" && (r.target.includes("{time}") || !r.source.includes("{time}"))) {
          notice("No missing protected tag.");
          break;
        }
        remember(state.active);
        if (action === "insert" || action === "apply-ai") {
          const ai = action === "apply-ai";
          editValue(ai ? savedAiTarget : matchTarget());
          r.status = "draft";
          r.origin = ai ? "Saved local AI suggestion · Ollama" : "Coastal memory · 96% TM match";
        } else {
          const field = byId("active-target");
          const pos = field?.selectionStart ?? r.target.length;
          editValue(r.target.slice(0, pos) + "{time}" + r.target.slice(field?.selectionEnd ?? pos));
        }
        if (overlay.open) overlay.close();
        rerender(true);
        break;
      case "next-risk": {
        const i = rows.findIndex((_, i) => i !== state.active && issues(i).length);
        if (overlay.open) overlay.close();
        select(i);
        break;
      }
      case "edit-target":
        if (overlay.open) overlay.close();
        byId("active-target")?.focus();
        break;
      case "comment": {
        const field = byId("review-text");
        if (!field.value.trim()) {
          field.focus();
          return;
        }
        r.comments.push(field.value.trim());
        byId("inspect-body").innerHTML = inspectorBody();
        byId("review-text").focus();
        notice("Comment added to this segment.");
        break;
      }
      case "request-preview":
        openDialog(
          "AI request preview",
          `<div class="evidence"><strong>Source text</strong><p>${markup(r.source)}</p><p class="note">English → Turkish · Segment ${state.active + 1}</p></div><p>Destination: no provider configured. This preview sends no text.</p>`
        );
        break;
      case "editor-tools": {
        const commands = [
          ["undo", "Undo last action", "restore"],
          ["focus", "Toggle focus mode", "expand"],
          ["density", state.compact ? "Use balanced density" : "Use compact density", "list"],
          ["filters", "Search and filters", "filter"],
          ["export", "Export file", "download"]
        ];
        if (r.source.includes("{time}")) commands.unshift(["tag", "Insert protected tag", "tag"]);
        openDialog(
          "Editor actions",
          `<div class="command-list">${commands.map(([cmd, name, g]) => `<button data-menu-action="${cmd}">${icon(g, 16)}${name}</button>`).join("")}<button data-go="statistics">${icon("chart", 16)}Statistics</button><button data-go="files">${icon("files", 16)}Back to files</button></div>`
        );
        break;
      }
      case "density":
        state.compact = !state.compact;
        rerender(true);
        break;
      case "export": {
        const p = progress();
        openDialog(
          "Export file",
          `<h3>Visitor guide.docx</h3><p class="note">English → Turkish · ${p.confirmed} confirmed · ${p.draft} draft · ${p.empty} untranslated</p><fieldset class="export-options"><legend>Sample download</legend><label><input type="radio" name="deliverable" value="bilingual" checked>Bilingual working copy</label><small>Source, target and segment status · TXT</small><label><input type="radio" name="deliverable" value="target">Target text</label><small>Turkish translations in segment order · TXT</small></fieldset>${p.empty ? '<p class="quality-note">Untranslated targets will be blank.</p>' : ""}${button("download-preview", "Download sample", "download", "primary")}`
        );
        break;
      }
      case "download-preview": {
        const bilingual = overlay.querySelector("input:checked").value === "bilingual";
        const body = rows
          .map((r, i) => (bilingual ? `[${i + 1} · ${statuses[r.status][0]}]\n${r.source}\n${r.target}` : r.target))
          .join("\n\n");
        const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "Visitor guide - " + (bilingual ? "bilingual" : "tr") + ".txt";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        overlay.close();
        notice("Sample download requested.");
        break;
      }
      case "undo":
        undo();
        break;
      case "dismiss":
        overlay.close();
        break;
    }
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.id === "nav-toggle") {
      const open = document.body.classList.toggle("navigation-open");
      el.setAttribute("aria-expanded", String(open));
      return;
    }
    if (el.dataset.go) {
      navigate(el.dataset.go);
      return;
    }
    if (el.dataset.risk !== undefined) {
      state.active = Number(el.dataset.risk);
      state.tab = "Quality";
      state.inspector = true;
      state.focus = false;
      rerender();
      if (narrow.matches) showNarrowInspector();
      else byId("tab-Quality")?.focus();
      return;
    }
    if (el.dataset.row !== undefined) {
      select(Number(el.dataset.row));
      return;
    }
    if (el.dataset.tab) {
      state.tab = el.dataset.tab;
      const region = el.closest(".inspector");
      region.querySelectorAll('[role="tab"]').forEach((btn) => {
        btn.setAttribute("aria-selected", String(btn === el));
        btn.tabIndex = btn === el ? 0 : -1;
      });
      const body = region.querySelector('[role="tabpanel"]');
      body.setAttribute("aria-labelledby", el.id);
      body.innerHTML = inspectorBody();
      return;
    }
    if (el.dataset.menuAction) {
      overlay.close();
      perform(el.dataset.menuAction);
      return;
    }
    if (el.dataset.action) perform(el.dataset.action);
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "active-target") {
      editValue(el.value);
      const r = rows[state.active],
        [label, glyph] = statuses[r.status];
      const status = byId("active-state");
      status.className = "seg-state " + r.status;
      status.innerHTML = icon(glyph, 13) + label;
      const current = el.closest(".segment");
      current.setAttribute("aria-label", `Segment ${state.active + 1}, ${label}`);
      const idButton = current.querySelector(".seg-id");
      idButton.setAttribute("aria-label", `Select segment ${state.active + 1}, ${label}`);
      idButton.title = `Segment ${state.active + 1} · ${label}`;
      idButton.querySelector("span").className = r.status;
      idButton.querySelector("span").innerHTML = icon(glyph, 13);
      byId("file-progress").innerHTML = progressMarkup();
      current.querySelector('[data-action="confirm"]').disabled = !r.target.trim();
      const existingFlag = current.querySelector(".row-alert");
      const problem = issues(state.active)[0];
      if (!problem) existingFlag?.remove();
      if (problem && !existingFlag) {
        const b = document.createElement("button");
        b.className = "row-alert";
        b.dataset.risk = state.active;
        b.textContent = problem[0];
        current.querySelector(".target-cell").append(b);
      }
      if (["Info", "Quality"].includes(state.tab) && byId("inspect-body"))
        byId("inspect-body").innerHTML = inspectorBody();
    }
    if (el.id === "query") {
      state.search = el.value;
      filterRows();
    }
    if (el.id === "command-query") {
      const items = [...overlay.querySelectorAll(".command-list button")];
      items.forEach((b) => {
        b.hidden = !b.textContent.toLowerCase().includes(el.value.toLowerCase());
      });
      byId("command-empty").hidden = items.some((b) => !b.hidden);
    }
  });
  function filterRows() {
    let visible = visibleRows();
    if (visible.length && !visible.some((v) => v.i === state.active)) state.active = visible[0].i;
    const caret = byId("query")?.selectionStart ?? 0;
    const id = document.activeElement.id;
    rerender();
    byId(id)?.focus({ preventScroll: true });
    if (id === "query") byId(id).setSelectionRange(caret, caret);
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "status-filter") {
      state.status = e.target.value;
      filterRows();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.getModifierState("AltGraph")) return;
    if (e.target.closest?.("dialog") && e.target.closest("dialog") !== overlay) return;
    if (e.key === "Escape" && document.body.classList.contains("navigation-open")) {
      closeNavigation();
      byId("nav-toggle").focus();
      return;
    }
    const tab = e.target.closest?.("[data-tab]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const i = tabs.indexOf(state.tab);
      const j =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      const target = byId("tab-" + tabs[j]);
      target.focus();
      target.click();
      return;
    }
    if (overlay.open) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && state.view === "editor" && !e.shiftKey) {
      e.preventDefault();
      if (!state.filters) perform("filters");
      else byId("query")?.focus();
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      perform("commands");
      return;
    }
    if (state.view !== "editor") return;
    if (e.key === "Escape" && state.focus) {
      perform("focus");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      perform("focus");
      return;
    }
    if (e.target.id === "active-target" && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      confirm();
      return;
    }
    if (e.target.id === "active-target" && e.key === "F8") {
      e.preventDefault();
      perform("tag");
      return;
    }
    if (e.altKey && e.key === "Enter") {
      e.preventDefault();
      nextOpen();
    }
  });
  narrow.addEventListener("change", () => {
    if (overlay.open && overlay.classList.contains("inspector-dialog")) overlay.close();
    if (state.view === "editor") rerender();
  });
  window.addEventListener("hashchange", () => {
    const view = location.hash.slice(1) || "editor";
    if (Object.hasOwn(destinations, view) && state.view !== view) navigate(view);
  });
  const initial = location.hash.slice(1);
  if (Object.hasOwn(destinations, initial)) state.view = initial;
  render();
})();
