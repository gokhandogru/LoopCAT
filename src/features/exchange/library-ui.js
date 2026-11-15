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
    previewRead;
  const source = (s, values = {}) =>
    d.defaultView?.CatHan?.i18n?.source?.(s, values) ||
    String(s).replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
  const enumLabels = {
    preferred: "Preferred term",
    admitted: "Admitted term",
    forbidden: "Forbidden term",
    "target-missing-if-source": "Require target term when source matches",
    "target-contains": "Flag target form",
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
  const action = (text, fn) => {
    const b = el("button", text);
    b.type = "button";
    b.onclick = async () => {
      const startTurn = turn;
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        if (turn === startTurn && e?.name !== "AbortError") note(e.message || e);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  /** @param {any} root @param {string} label @param {any} value @param {any} type */
  function field(root, label, value = "", type = "text") {
    const l = el("label", null, "exchange-field");
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
    return node;
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
  function page(title, isAuthored = false) {
    clean();
    const heading = el("h3", title);
    body.replaceChildren(isAuthored ? authored(heading) : heading);
    note("");
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
  async function preview(blobOrPromise, expected = undefined, started = turn) {
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
    page(pack.name, true);
    const generation = turn,
      signal = pageJobs.signal;
    body.append(
      authored(el("p", pack.description || source(enumLabels[pack.kind] || pack.kind))),
      authored(el("p", pack.publisher + " · " + pack.version + " · " + pack.license)),
      el(
        "p",
        expected
          ? "Exact file verified against the selected signed catalog."
          : "Local pack preview: publisher identity is unverified."
      ),
      authored(el("p", pack.attribution || "")),
      el("p", "SHA-256: " + digest, "exchange-digest")
    );
    const list = authored(el("ul"));
    if (pack.kind === "terminology")
      for (const term of pack.entries.slice(0, 100))
        list.append(el("li", term.sourceTerm + " → " + term.targetTerm + " · " + (term.status || "preferred")));
    if (pack.kind === "qa")
      for (const rule of pack.entries) {
        list.append(el("li", rule.message));
        for (const e of rule.examples) list.append(el("li", e.source + " → " + e.target + " (" + e.expect + ")"));
      }
    body.append(list);
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
      body.append(
        action("Adapt a copy", () => {
          const original = structuredClone(pack);
          page("Create");
          const draft = {
            ...original,
            id: "local." + pack.id.split(".").at(-1),
            publisher: "Local author",
            name: pack.name + " (adapted)",
            attribution: [pack.attribution, pack.publisher + " · " + pack.name + " " + pack.version]
              .filter(Boolean)
              .join("; "),
            version: "1.0.0"
          };
          const editorTurn = turn;
          createAuthorForm(
            {
              ...ctx,
              note: (msg) => {
                if (turn === editorTurn) note(msg);
              }
            },
            body,
            draft,
            (p) => preview(encodePack(p), undefined, editorTurn)
          );
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
      body.append(
        action("Try on examples", () =>
          previewRows(
            pack.kind === "qa"
              ? pack.entries.flatMap((r) => r.examples).map((e, i) => ({ ...e, id: "example-" + i }))
              : pack.entries
                  .slice(0, 30)
                  .map((r, i) => ({ id: "sample-" + i, source: r.sourceTerm, target: r.targetTerm }))
          )
        ),
        action("Try on selected segments", () => previewRows(options.selected()))
      );
      const versions = (await repo.describe()).filter((r) => r.id === pack.id && r.digest !== digest);
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
            const previous = await repo.getPack(pack.id, compareFrom.value);
            if (turn !== generation) return;
            if (!previous) throw Error("Comparison version was removed.");
            const rows = options.selected();
            if (!rows.length || rows.length > 1000) throw Error("Select 1–1,000 segments.");
            const context = getProject() || {};
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
            const added = [...after].filter((s) => !before.has(s)),
              removed = [...before].filter((s) => !after.has(s));
            note(
              "Added: " +
                added.length +
                "; removed: " +
                removed.length +
                ". " +
                [...added.slice(0, 4), ...removed.slice(0, 4)].join(" · ")
            );
          })
        );
    }
    if (expected?.catalogId)
      body.append(
        el(
          "p",
          "Installing from this catalog lets its verified signer withdraw this exact version, including any previously installed local copy."
        )
      );
    body.append(
      action("Export pack file", () => save(pack.id + "-" + pack.version + ".loopcat-pack.zip", blob)),
      action("Install on this device", async () => {
        const origin = assertCatalogInstall({ id: pack.id, version: pack.version, digest }, expected);
        await repo.install(blob, origin);
        await refreshIfCurrent("Installed", generation, "Installed. Choose a project to activate it.");
      })
    );
  }
  async function show(next) {
    tab = next;
    page(next);
    const generation = turn;
    if (next === "Examples") {
      body.append(
        el(
          "p",
          "Try a pack, export it to a colleague, or install it on this device. Installation does not activate it."
        )
      );
      const { BLIND_LAB_SAMPLE } = await import("./workflow-packs.js");
      if (generation !== turn) return;
      for (const pack of [EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK, BLIND_LAB_SAMPLE])
        body.append(action(pack.name, () => preview(encodePack(pack), undefined, generation)));
      const input = field(body, "Import local pack", "", "file");
      input.accept = ".loopcat-pack.zip,.zip";
      input.onchange = async () => {
        try {
          if (input.files?.[0]) await preview(input.files[0], undefined, generation);
        } catch (e) {
          if (generation === turn && e?.name !== "AbortError") note(e.message);
        } finally {
          input.value = "";
        }
      };
    } else if (next === "Installed") {
      const project = getProject(),
        key = binding(project),
        records = await repo.describe(),
        act = key ? (await repo.snapshot(key)).records : [];
      if (generation !== turn) return;
      body.append(
        el(
          "p",
          project ? source("Current project: {value1}", { value1: project.name }) : "Open a project to activate packs."
        )
      );
      if (!records.length) body.append(el("p", "No packs installed."));
      for (const pin of project?.exchangeRequirements || []) {
        if (pin.required && !act.some((a) => a.digest === pin.digest)) {
          const item = el("section");
          item.append(
            el("p", pin.id + " " + pin.version + " · " + source("Not evaluated")),
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
      for (const r of records) {
        const card = el("section", null, "exchange-card"),
          enabled = act.some((x) => x.digest === r.digest);
        card.append(
          authored(el("h4", r.pack.name)),
          el(
            "p",
            r.id +
              " · " +
              r.version +
              " · " +
              r.pack.license +
              " · " +
              source(enabled ? "Active in this project" : "Inactive")
          )
        );
        card.append(action("Inspect pack", () => preview(repo.exportPack(r.id, r.version), undefined, generation)));
        if (project && !enabled) {
          const previous = project.exchangeRequirements?.find((p) => p.id === r.id);
          const required =
            r.pack.kind === "qa" ? field(card, "Required project check", previous?.required, "checkbox") : null;
          const precedence = field(card, "Project priority (lower first)", String(previous?.priority || 0), "number");
          precedence.min = "0";
          precedence.max = "100";
          card.append(
            action("Activate for this project", async () => {
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
            })
          );
        } else if (enabled)
          card.append(
            action("Disable for this project", async () => {
              await changePin(project, { type: "disable", id: r.id, version: r.version, digest: r.digest });
              await refreshIfCurrent(next, generation);
            })
          );
        card.append(
          action("Uninstall from this device", async () => {
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
          })
        );
        if (r.pack.kind === "lesson" || (["client", "ai"].includes(r.pack.kind) && enabled))
          card.append(
            action(source("Open pack: {pack}", { pack: r.pack.name }), async () => {
              const installed = await repo.getPack(r.id, r.version);
              if (generation !== turn) return;
              if (!installed || installed.digest !== r.digest || !repo.isUsable(installed))
                throw Error("This pack is unavailable or withdrawn.");
              page(r.pack.name, true);
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
        body.append(card);
      }
    } else if (next === "Create") {
      const mount = el("div");
      const type = field(body, "Pack type", "terminology", ["terminology", "qa", "lesson", "client", "ai"]);
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
      async function form(draft) {
        mount.replaceChildren();
        if (type.value === "terminology" || type.value === "qa") {
          const base = draft || {
            format: "loopcat-pack",
            schemaVersion: 1,
            id: "local.my-pack",
            version: "1.0.0",
            publisher: "Local author",
            license: "All rights reserved",
            name: "My pack",
            kind: type.value,
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
            mount,
            base,
            (p) => preview(encodePack(p), undefined, generation)
          );
        } else
          (await advanced()).renderAdvancedAuthor({
            root: mount,
            repository: repo,
            kind: type.value,
            onCreate: (p) => preview(encodePack(p), undefined, generation)
          });
      }
      type.onchange = () => {
        form().catch((e) => note(e.message));
      };
      await form();
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
          if (affected) {
            invalidate();
            if (generation === turn)
              note(
                affected + " withdrawn catalog pack(s) quarantined. Installed bytes and accepted work were preserved."
              );
          }
        }
      });
      if (generation === turn) dispose = cleanup;
      else cleanup?.();
    }
  }
  return {
    async open() {
      root.replaceChildren();
      const nav = el("nav", null, "exchange-actions");
      nav.setAttribute("aria-label", "Exchange library");
      body = el("section");
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
      for (const name of ["Examples", "Installed", "Create", "Lab responses", "Catalog"])
        nav.append(action(name, () => show(name)));
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
