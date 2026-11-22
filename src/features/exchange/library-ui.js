import { encodePack, decodePack } from "./pack-format.js";
import { EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK } from "./examples.js";
import { createAuthorForm } from "./author-form.js";
import { readAuthorDraft } from "./author-draft.js";
import { assertCatalogInstall, enforceCatalogAdvisories } from "./catalog-policy.js";

export function createLibraryUI(options) {
  const { document: d, repo, evaluator, parseTermList, binding, getProject, changePin, invalidate } = options;
  const root = d.querySelector("#exchangeRoot"),
    status = d.querySelector("#exchangeStatus");
  let tab = "Examples",
    turn = 0,
    dispose,
    pageJobs = new AbortController(),
    previewRead,
    authorDraft;
  const source = (s, values = {}) =>
    d.defaultView?.CatHan?.i18n?.source?.(s, values) ||
    String(s).replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
  const enumLabels = {
    preferred: "Preferred term",
    admitted: "Admitted term",
    forbidden: "Forbidden term",
    "target-missing-if-source": "Require target term when source matches",
    "target-contains": "Flag target form",
    all: "All",
    warning: "Warning",
    terminology: "Terminology pack",
    qa: "QA pack",
    lesson: "Lesson pack",
    client: "Client kit",
    ai: "AI workflow pack"
  };
  function authored(node) {
    node.setAttribute("data-i18n-skip", "");
    node.dir = "auto";
    return node;
  }
  const el = (tag, text = null, cls = "") => {
    const node = d.createElement(tag);
    if (text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const note = (text) => {
    status.textContent = source(String(text || ""));
  };
  const action = (text, fn, cls = "") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = async () => {
      const startTurn = turn;
      const hadFocus = d.activeElement === b;
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        if (turn === startTurn && e?.name !== "AbortError") note(e.message || e);
      } finally {
        b.disabled = false;
        if (hadFocus && turn === startTurn && (!d.activeElement || d.activeElement === d.body)) b.focus?.();
      }
    };
    return b;
  };
  /** @param {any} root @param {string} label @param {any} value @param {any} type */
  function field(root, label, value = "", type = "text") {
    const l = el("label", null, type === "checkbox" ? "exchange-field exchange-choice" : "exchange-field");
    const node = el(Array.isArray(type) ? "select" : type === "textarea" ? "textarea" : "input");
    l.append(el("span", label), node);
    root.append(l);
    if (Array.isArray(type)) {
      for (const v of type) {
        const opt = el("option", source(enumLabels[v] || v));
        opt.value = v;
        node.append(opt);
      }
      node.value = value;
    } else if (type === "checkbox") {
      node.type = "checkbox";
      node.checked = Boolean(value);
    } else if (type !== "textarea") {
      node.type = type;
      if (type !== "file") node.value = value;
    } else node.value = value;
    if (type === "text" || type === "textarea") node.dir = "auto";
    return node;
  }
  function languagePair(pack) {
    const { source: from, target: to } = pack.languages || {};
    if (!from || !to) return null;
    const languageName = (tag) => {
      try {
        return new Intl.DisplayNames([d.documentElement?.lang || "en"], { type: "language" }).of(tag);
      } catch {
        return tag;
      }
    };
    const chip = el("span", null, "exchange-chip");
    const arrow = el("span", " → ");
    arrow.setAttribute("aria-hidden", "true");
    chip.setAttribute(
      "aria-label",
      source("Translation from {from} into {to}", { from: languageName(from), to: languageName(to) })
    );
    chip.append(authored(el("bdi", languageName(from))), arrow, authored(el("bdi", languageName(to))));
    return chip;
  }
  function packMeta(pack, badges = []) {
    const line = el("div", null, "exchange-meta");
    line.append(el("span", enumLabels[pack.kind], "exchange-chip"));
    const pair = languagePair(pack);
    if (pair) line.append(pair);
    for (const [label, cls] of badges) line.append(el("span", label, "exchange-chip " + cls));
    return line;
  }
  function emptyState(container, title, destination, label) {
    const panel = el("section", null, "exchange-panel exchange-empty");
    panel.append(
      el("p", title),
      action(label, () => show(destination))
    );
    container.append(panel);
  }
  function save(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = filename;
    d.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const ctx = { el, action, field, note, parseTermList, repo, save };
  const clean = () => {
    turn++;
    pageJobs.abort();
    pageJobs = new AbortController();
    previewRead?.abort();
    previewRead = null;
    if (typeof dispose === "function") dispose();
    dispose = null;
  };
  let body;
  const navButtons = new Map();
  function page(title, isAuthored = false, goBack = false) {
    clean();
    for (const [name, button] of navButtons) button.setAttribute("aria-current", tab === name ? "page" : "false");
    const heading = el("h3", title);
    const focusContent = goBack || body.contains?.(d.activeElement);
    heading.tabIndex = -1;
    body.replaceChildren();
    body.scrollTop = 0;
    if (goBack) {
      const back = el("div", null, "exchange-actions");
      back.append(action(source("Back to {view}", { view: source(tab) }), () => show(tab, true)));
      body.append(back);
    }
    body.append(isAuthored ? authored(heading) : heading);
    note("");
    if (focusContent) heading.focus?.();
    return heading;
  }
  function advanced() {
    return import("./advanced-ui.js");
  }
  async function refreshIfCurrent(next, started, message = "") {
    if (turn !== started) return;
    const loading = show(next);
    const refreshTurn = turn;
    await loading;
    if (turn === refreshTurn && message) note(message);
  }
  async function preview(blobOrPromise, expected = undefined, started = turn, installed = undefined) {
    if (turn !== started) return;
    previewRead?.abort();
    const reading = new AbortController();
    previewRead = reading;
    const blob = await blobOrPromise;
    if (reading.signal.aborted || turn !== started) return;
    const { pack, digest } = await decodePack(blob, { signal: reading.signal });
    if (reading.signal.aborted || turn !== started) return;
    if (
      expected &&
      (pack.id !== expected.id || pack.version !== expected.version || digest !== (expected.digest || expected.sha256))
    )
      throw Error("Pack does not match its reviewed catalog entry.");
    page(pack.name, true, true);
    const generation = turn,
      signal = pageJobs.signal;
    const summary = el("section", null, "exchange-panel");
    summary.append(packMeta(pack));
    if (pack.description) summary.append(authored(el("p", pack.description)));
    summary.append(
      publisherLine(pack),
      el(
        "p",
        expected
          ? "Exact file verified against the selected signed catalog."
          : installed?.catalogOrigin
            ? "Installed from a verified catalog."
            : "Local pack preview: publisher identity is unverified."
      )
    );
    if (pack.attribution) summary.append(authored(el("p", pack.attribution)));
    const identity = el("details");
    identity.append(
      el("summary", "File details"),
      authored(el("code", pack.id, "exchange-digest")),
      authored(el("code", "SHA-256: " + digest, "exchange-digest"))
    );
    summary.append(identity);
    if (expected?.catalogId)
      summary.append(
        el(
          "p",
          "Installing from this catalog lets its verified signer withdraw this exact version, including any previously installed local copy."
        )
      );
    body.append(summary);
    const fileActions = el("div", null, "exchange-actions");
    if (!installed)
      fileActions.append(
        action(
          "Install on this device",
          async () => {
            const origin = assertCatalogInstall({ id: pack.id, version: pack.version, digest }, expected);
            await repo.install(blob, origin);
            await refreshIfCurrent("Installed", generation, "Installed. Choose a project to activate it.");
          },
          "primary"
        )
      );
    fileActions.append(
      action("Export pack file", () => save(pack.id + "-" + pack.version + ".loopcat-pack.zip", blob))
    );
    body.append(fileActions);
    const list = el("ul", null, "exchange-preview-list");
    const exampleRow = (from, to, label = "") => {
      const li = el("li");
      const arrow = el("span", " → ");
      arrow.setAttribute("aria-hidden", "true");
      li.append(authored(el("bdi", from)), arrow, authored(el("bdi", to)));
      if (label) li.append(el("span", " · " + source(label)));
      return li;
    };
    if (pack.kind === "terminology")
      for (const term of pack.entries.slice(0, 100))
        list.append(exampleRow(term.sourceTerm, term.targetTerm, enumLabels[term.status || "preferred"]));
    if (pack.kind === "qa")
      for (const rule of pack.entries) {
        const item = el("li");
        const examples = el("ul", null, "exchange-preview-list");
        for (const e of rule.examples)
          examples.append(
            exampleRow(e.source, e.target, e.expect === "pass" ? "Passes the check" : "Triggers the check")
          );
        item.append(authored(el("strong", rule.message)), examples);
        list.append(item);
      }
    if (pack.kind === "qa" || pack.kind === "terminology") {
      const contents = el("details", null, "exchange-panel");
      contents.append(el("summary", pack.kind === "qa" ? "Rules and examples" : "Preview terms"), list);
      if (pack.kind === "terminology" && pack.entries.length > 100)
        contents.append(el("p", source("Showing 100 of {total} terms", { total: pack.entries.length })));
      body.append(contents);
    }
    if (pack.kind === "qa" || pack.kind === "terminology") {
      if (pack.kind === "terminology")
        body.append(
          el(
            "p",
            pack.allowTermCopy
              ? "Individual terms can be copied."
              : "Individual term copying is disabled by the author."
          )
        );
      const testActions = el("div", null, "exchange-actions");
      body.append(testActions);
      testActions.append(
        action("Adapt a copy", () => {
          const original = structuredClone(pack);
          authorDraft = {
            ...original,
            id: "local." + pack.id.split(".").at(-1),
            publisher: "Local author",
            name: pack.name + " (adapted)",
            attribution: [pack.attribution, pack.publisher + " · " + pack.name + " " + pack.version]
              .filter(Boolean)
              .join("; "),
            version: "1.0.0"
          };
          return show("Create", true);
        })
      );
      const record = { id: pack.id, version: pack.version, digest, pack };
      const previewRows = async (rows) => {
        const context = { sourceLang: pack.languages.source, targetLang: pack.languages.target };
        if (!rows.length) {
          note("Select segments in the editor first.");
          return;
        }
        if (rows.length > 1000) throw Error("Select up to 1,000 segments for a preview.");
        if (pack.kind === "qa") {
          const { evaluateRows } = await import("./qa-runner.js");
          const hits = await evaluateRows([record], rows, context, signal);
          if (turn !== generation) return;
          note(
            hits.length +
              " findings in " +
              rows.length +
              " segments. " +
              hits
                .slice(0, 8)
                .map((h) => h.message)
                .join(" · ")
          );
        } else {
          const hits = rows.flatMap((r) => evaluator.findPackTerms([record], r, context));
          note(
            hits.length +
              " term matches. " +
              hits
                .slice(0, 8)
                .map((h) => h.sourceTerm + " → " + h.targetTerm)
                .join(" · ")
          );
        }
      };
      testActions.append(
        action("Try on examples", () =>
          previewRows(
            pack.kind === "qa"
              ? pack.entries.flatMap((r) => r.examples).map((e, i) => ({ ...e, id: "example-" + i }))
              : pack.entries
                  .slice(0, 30)
                  .map((r, i) => ({ id: "sample-" + i, source: r.sourceTerm, target: r.targetTerm }))
          )
        ),
        action("Try on selected segments", () => {
          const selected = options.selected();
          if (selected.length && !evaluator.matchPackLanguages(pack, getProject() || {}))
            throw Error("This pack does not match the project's language pair.");
          return previewRows(selected);
        })
      );
      const versions = (await repo.describe()).filter(
        (r) =>
          r.id === pack.id &&
          r.digest !== digest &&
          r.pack.kind === pack.kind &&
          r.pack.languages?.source === pack.languages.source &&
          r.pack.languages?.target === pack.languages.target &&
          (repo.isUsable?.(r) ?? true)
      );
      if (turn !== generation) return;
      const projectPin = getProject()?.exchangeRequirements?.find((p) => p.id === pack.id);
      const defaultVersion = versions.find((v) => v.digest === projectPin?.digest)?.version || versions[0]?.version;
      const compareFrom = versions.length
        ? field(
            body,
            "Compare from installed version",
            defaultVersion,
            versions.map((v) => v.version)
          )
        : null;
      if (compareFrom)
        body.append(
          action("Compare update", async () => {
            const fromVersion = compareFrom.value;
            const previous = await repo.getPack(pack.id, fromVersion);
            if (turn !== generation || fromVersion !== compareFrom.value) return;
            if (!previous || !repo.isUsable(previous)) throw Error("The comparison version is unavailable.");
            const project = getProject();
            const selected = options.selected();
            const usingSelection = selected.length > 0;
            if (selected.length > 1000) throw Error("Select up to 1,000 segments for a preview.");
            const rows = usingSelection
              ? selected.map(({ id, index, documentId, revision, source, target }) => ({
                  id,
                  index,
                  documentId,
                  revision,
                  source,
                  target
                }))
              : (pack.kind === "qa"
                  ? [previous.pack, pack].flatMap((p) => p.entries.flatMap((r) => r.examples))
                  : [previous.pack, pack].flatMap((p) =>
                      p.entries.slice(0, 30).map((r) => ({ source: r.sourceTerm, target: r.targetTerm }))
                    )
                )
                  .slice(0, 1000)
                  .map((row, i) => ({ ...row, id: "example-" + i, index: i }));
            const context = usingSelection
              ? project
              : { sourceLang: pack.languages.source, targetLang: pack.languages.target };
            if (usingSelection && (!context || !evaluator.matchPackLanguages(pack, context)))
              throw Error("This pack does not match the project's language pair.");
            note("Comparing versions…");
            const measure = async (r) => {
              if (r.pack.kind === "qa") {
                const { evaluateRows } = await import("./qa-runner.js");
                return (await evaluateRows([r], rows, context, signal)).map((h) => h.segmentId + " · " + h.message);
              }
              return rows.flatMap((row) =>
                evaluator
                  .findPackTerms([r], row, context)
                  .map((t) => row.id + " · " + t.sourceTerm + " → " + t.targetTerm)
              );
            };
            const before = new Set(await measure(previous)),
              after = new Set(await measure(record));
            if (turn !== generation) return;
            if (!repo.isUsable(previous)) throw Error("The comparison version is unavailable.");
            const latest = usingSelection ? options.selected() : rows;
            if (
              fromVersion !== compareFrom.value ||
              (usingSelection && project?.id !== getProject()?.id) ||
              latest.length !== rows.length ||
              latest.some(
                (r, i) =>
                  r.id !== rows[i].id ||
                  r.revision !== rows[i].revision ||
                  r.source !== rows[i].source ||
                  r.target !== rows[i].target
              )
            )
              throw Error("The project or selection changed. Run the comparison again.");
            const added = [...after].filter((s) => !before.has(s)),
              removed = [...before].filter((s) => !after.has(s));
            note(
              source(usingSelection ? "Compared on selected segments." : "Compared on pack examples.") +
                " Added: " +
                added.length +
                "; removed: " +
                removed.length +
                ". " +
                [...added.slice(0, 4), ...removed.slice(0, 4)].join(" · ")
            );
          })
        );
    }
  }
  function publisherLine(pack) {
    const parts = el("p", null, "exchange-secondary");
    for (const [i, value] of [pack.publisher, pack.version, pack.license].entries()) {
      if (i) parts.append(el("span", " · "));
      parts.append(authored(el("bdi", value)));
    }
    return parts;
  }
  async function show(next, focusHeading = false) {
    tab = next;
    const heading = page(next);
    if (focusHeading) heading.focus?.();
    const generation = turn;
    if (next === "Examples") {
      body.append(
        el(
          "p",
          "Try a pack, export it to a colleague, or install it on this device. Installation does not activate it."
        )
      );
      const importBox = el("section", null, "exchange-panel");
      body.append(importBox);
      const input = field(importBox, "Import local pack", "", "file");
      input.accept = ".loopcat-pack.zip,.zip";
      const grid = el("div", null, "exchange-card-grid");
      body.append(grid);
      input.onchange = async () => {
        try {
          if (input.files?.[0]) {
            note("Reading pack…");
            await preview(input.files[0], undefined, generation);
          }
        } catch (e) {
          if (generation === turn && e?.name !== "AbortError") note(e.message);
        } finally {
          input.value = "";
        }
      };
      const { BLIND_LAB_SAMPLE } = await import("./workflow-packs.js");
      if (generation !== turn) return;
      for (const pack of [EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK, BLIND_LAB_SAMPLE]) {
        const card = el("article", null, "exchange-card");
        const open = el("h4");
        open.append(action(pack.name, () => preview(encodePack(pack), undefined, generation), "exchange-example-pick"));
        card.append(packMeta(pack), open);
        if (pack.description) card.append(authored(el("p", pack.description)));
        grid.append(card);
      }
    } else if (next === "Installed") {
      const project = getProject(),
        key = binding(project);
      const scope = el("section", null, "exchange-panel");
      scope.append(
        el(
          "p",
          project ? source("Current project: {value1}", { value1: project.name }) : "Open a project to activate packs."
        )
      );
      body.append(scope);
      const loading = el("p", "Loading installed packs…");
      body.append(loading);
      let records, act;
      try {
        [records, act] = await Promise.all([repo.describe(), key ? repo.snapshot(key).then((s) => s.records) : []]);
      } finally {
        loading.remove?.();
      }
      if (generation !== turn) return;
      const activeDigests = new Set(act.map((x) => x.digest));
      const pinsById = new Map((project?.exchangeRequirements || []).map((pin) => [pin.id, pin]));
      for (const pin of project?.exchangeRequirements || []) {
        if (pin.required && !activeDigests.has(pin.digest)) {
          const item = el("section", null, "exchange-panel");
          item.append(
            el("strong", "Required project check", "exchange-warning"),
            authored(el("p", pin.id + " " + pin.version)),
            el("p", "Not evaluated"),
            action("Remove project requirement", async () => {
              if (
                getProject()?.id !== project.id ||
                !options.confirm("Stop requiring " + pin.id + " for this project?")
              )
                return;
              await changePin(project, { type: "forget", id: pin.id, version: pin.version, digest: pin.digest });
              await refreshIfCurrent(next, generation);
            })
          );
          body.append(item);
        }
      }
      if (!records.length) {
        emptyState(body, "No packs installed.", "Examples", "Browse examples");
        return;
      }
      const filters = el("div", null, "exchange-grid");
      const search = field(filters, "Search installed packs", "", "search");
      const kind = field(filters, "Pack type", "all", ["all", ...new Set(records.map((r) => r.pack.kind))]);
      const noResults = el("p", "No packs match your search.", "exchange-secondary");
      noResults.hidden = true;
      noResults.setAttribute("role", "status");
      const grid = el("div", null, "exchange-card-grid");
      body.append(filters, noResults, grid);
      const cards = [];
      for (const r of records) {
        const enabled = activeDigests.has(r.digest);
        const card = el("article", null, enabled ? "exchange-card is-active" : "exchange-card");
        const previous = pinsById.get(r.id);
        const isRequired = previous?.digest === r.digest && previous.required;
        card.append(
          packMeta(r.pack, [
            [enabled ? "Active in this project" : "Inactive", enabled ? "is-active" : ""],
            ...(isRequired ? [["Required project check", "exchange-warning"]] : [])
          ]),
          authored(el("h4", r.pack.name)),
          publisherLine(r.pack)
        );
        const controls = el("div", null, "exchange-actions");
        controls.append(
          action("Inspect pack", () => preview(repo.exportPack(r.id, r.version), undefined, generation, r))
        );
        if (project && !enabled) {
          const required =
            r.pack.kind === "qa" ? field(card, "Required project check", previous?.required, "checkbox") : null;
          const precedence = field(card, "Project priority (lower first)", String(previous?.priority || 0), "number");
          precedence.min = "0";
          precedence.max = "100";
          if (previous && previous.digest !== r.digest)
            card.append(
              el(
                "p",
                source("This project uses version {version}. Activating this file switches versions.", previous),
                "exchange-secondary"
              )
            );
          controls.append(
            action(
              "Activate for this project",
              async () => {
                if (getProject()?.id !== project.id) throw Error("Project changed.");
                const priority = Number(precedence.value);
                if (!Number.isSafeInteger(priority) || priority < 0 || priority > 100)
                  throw Error("Priority must be between 0 and 100.");
                await changePin(project, {
                  type: "enable",
                  id: r.id,
                  version: r.version,
                  digest: r.digest,
                  required: required?.checked,
                  priority
                });
                await refreshIfCurrent(next, generation);
              },
              "primary"
            )
          );
        } else if (enabled)
          controls.append(
            action("Disable for this project", async () => {
              await changePin(project, { type: "disable", id: r.id, version: r.version, digest: r.digest });
              await refreshIfCurrent(next, generation);
            })
          );
        controls.append(
          action(
            "Uninstall from this device",
            async () => {
              const projects = await repo.affectedProjects(r.id, r.version);
              if (generation !== turn) return;
              if (
                !options.confirm(
                  source(
                    "Uninstall {pack}? Affected projects: {projects}. Accepted translations and copied terms are kept.",
                    {
                      pack: r.pack.name,
                      projects: projects.map((k) => options.projectName(k.split("@")[0])).join(", ") || source("None")
                    }
                  )
                )
              )
                return;
              await repo.uninstall(r.id, r.version);
              invalidate();
              await refreshIfCurrent(next, generation);
            },
            "danger-small"
          )
        );
        if (r.pack.kind === "lesson" || (["client", "ai"].includes(r.pack.kind) && enabled))
          controls.append(
            action(source("Open pack: {pack}", { pack: r.pack.name }), async () => {
              const installed = await repo.getPack(r.id, r.version);
              if (generation !== turn) return;
              if (!installed || installed.digest !== r.digest || !repo.isUsable(installed))
                throw Error("This pack is unavailable or withdrawn.");
              page(r.pack.name, true, true);
              const target = el("section");
              body.append(target);
              const gen = turn,
                ui = await advanced();
              if (gen !== turn) return;
              const host = r.pack.kind === "ai" ? await options.aiHost() : null;
              const out = await ui.renderAdvancedPack({
                root: target,
                pack: installed.pack,
                pin: installed,
                projectId: r.pack.kind === "lesson" && !enabled ? "" : key,
                enabled: true,
                host,
                loadAiHost: options.aiHost,
                translate: source,
                repository: repo,
                applySelection: (selectedIds) =>
                  changePin(project, {
                    type: "kit",
                    id: r.id,
                    version: r.version,
                    digest: r.digest,
                    selectedIds
                  }),
                refresh: () => refreshIfCurrent("Installed", gen)
              });
              if (gen !== turn) {
                if (typeof out === "function") out();
              } else dispose = out;
            })
          );
        card.append(controls);
        cards.push({
          card,
          record: r,
          text: [
            r.pack.name,
            r.pack.publisher,
            r.id,
            r.version,
            r.pack.license,
            r.pack.description,
            ...Object.values(r.pack.languages || {}),
            r.pack.domain
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
        });
        grid.append(card);
      }
      const filter = () => {
        const query = search.value.trim().toLocaleLowerCase();
        for (const { card, record, text } of cards)
          card.hidden = (kind.value !== "all" && kind.value !== record.pack.kind) || !text.includes(query);
        noResults.hidden = cards.some(({ card }) => !card.hidden);
      };
      search.oninput = filter;
      kind.onchange = filter;
    } else if (next === "Create") {
      const mount = el("div", null, "exchange-author");
      const type = field(body, "Pack type", authorDraft?.kind || "terminology", [
        "terminology",
        "qa",
        "lesson",
        "client",
        "ai"
      ]);
      const draftFile = field(body, "Import private author draft", "", "file");
      draftFile.accept = ".loopcat-draft.json";
      draftFile.onchange = async () => {
        try {
          if (!draftFile.files?.[0]) return;
          const data = await readAuthorDraft(draftFile.files[0]);
          if (generation !== turn) return;
          type.value = data.kind;
          await form(data);
        } catch (e) {
          if (generation === turn) note(e.message);
        } finally {
          draftFile.value = "";
        }
      };
      body.append(mount);
      let formTurn = 0;
      const fromEditor = (pack, editable = pack) => {
        if (generation !== turn) return;
        authorDraft = editable;
        return preview(encodePack(pack), undefined, generation);
      };
      async function form(draft) {
        const requested = ++formTurn;
        const kind = type.value;
        const editor = el("div", null, "exchange-author");
        if (kind === "terminology" || kind === "qa") {
          const base = draft || {
            format: "loopcat-pack",
            schemaVersion: 1,
            id: "local.my-pack",
            version: "1.0.0",
            publisher: "Local author",
            license: "All rights reserved",
            name: "My pack",
            kind,
            languages: { source: "en", target: "tr" },
            entries: []
          };
          createAuthorForm(
            {
              ...ctx,
              note: (msg) => {
                if (generation === turn) note(msg);
              }
            },
            editor,
            base,
            fromEditor
          );
        } else {
          const ui = await advanced();
          if (requested !== formTurn || generation !== turn) return;
          ui.renderAdvancedAuthor({
            root: editor,
            repository: repo,
            kind,
            initial: draft,
            onCreate: fromEditor
          });
        }
        mount.replaceChildren(editor);
      }
      type.onchange = () => {
        form().catch((e) => note(e.message));
      };
      await form(authorDraft);
      const drafts = await repo.listDrafts();
      if (generation !== turn) return;
      for (const draft of drafts) {
        const key = draft.key || draft.id;
        body.append(
          action(source("Open draft: {draft}", { draft: key }), async () => {
            const val = await repo.getDraft(key);
            if (generation !== turn) return;
            const p = val?.input || val?.value || val?.draft || val;
            type.value = p.kind;
            await form(p);
          }),
          action(source("Delete my draft: {draft}", { draft: key }), async () => {
            if (options.confirm(source("Delete this author draft?"))) {
              await repo.deleteDraft(key);
              await refreshIfCurrent(next, generation);
            }
          })
        );
      }
    } else if (next === "Lab responses") {
      const target = el("section");
      body.append(target);
      await (await advanced()).renderResponseArchive({ root: target });
    } else {
      const target = el("section");
      body.append(target);
      const { mountExchangeCatalog } = await import("./catalog-ui.js");
      if (generation !== turn) return;
      const cleanup = await mountExchangeCatalog({
        root: target,
        t: source,
        onInstall: (blob, expected) => preview(blob, expected, generation),
        onSnapshot: async (verified) => {
          const affected = await enforceCatalogAdvisories(repo, verified);
          if (affected) invalidate();
          return affected;
        }
      });
      if (generation === turn) dispose = cleanup;
      else cleanup?.();
    }
  }
  return {
    async open() {
      root.replaceChildren();
      navButtons.clear();
      const nav = el("nav", null, "exchange-nav");
      nav.setAttribute("aria-label", "Exchange library");
      body = el("section", null, "exchange-page");
      root.append(nav, body);
      if (location.protocol === "file:") {
        const mode = await repo.storageMode?.();
        const info = el(
          "p",
          mode === "session"
            ? "Session-only storage. Keep exported pack files."
            : "Treat direct-file storage as session-only until verified after restart. Keep exported pack files."
        );
        info.className = "exchange-storage-note";
        nav.after(info);
      }
      for (const name of ["Examples", "Installed", "Create", "Lab responses", "Catalog"]) {
        const button = action(name, () => show(name));
        navButtons.set(name, button);
        nav.append(button);
      }
      root.inert = true;
      try {
        await show(tab);
      } finally {
        root.inert = false;
      }
      if (location.protocol === "file:")
        note("Direct-file storage depends on this browser and file location. Keep exported pack files.");
    },
    close: clean
  };
}
