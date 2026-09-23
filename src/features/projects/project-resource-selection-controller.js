function requireInput(value, name) {
  if (!value || !("value" in value)) throw new TypeError(`ProjectResourceSelectionController requires ${name}.`);
  return value;
}

function copy(value) {
  if (value === null || value === undefined) return value;
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function projectBaseName(value) {
  return String(value || "").trim() || "New project";
}

function clampPenalty(value) {
  return Math.max(0, Math.min(30, Math.round(Number(value) || 0)));
}

/**
 * Owns the suspended-project-dialog resource plan. New resources remain drafts
 * until project persistence commits them together with the project record.
 */
export function createProjectResourceSelectionController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const projectDialog = elements.dialog;
  const resourceDialog = elements.resourceDialog || null;
  const sourceLanguageInput = requireInput(elements.sourceLanguageInput, "the source-language input");
  const targetLanguageInput = requireInput(elements.targetLanguageInput, "the target-language input");
  const tmResourceList = elements.tmResourceList;
  const tbResourceList = elements.tbResourceList;
  const newTmNameInput = requireInput(elements.newTmNameInput, "the new-TM input");
  const newTermBaseNameInput = requireInput(elements.newTermBaseNameInput, "the new-termbase input");
  const getProject = options?.getProject;
  const getMode = options?.getMode;
  const normalizeLanguageValue = options?.normalizeLanguageValue;
  const normalizeLanguageInput = options?.normalizeLanguageInput;
  const projectResources = options?.projectResources;
  const catalog = options?.catalog;
  const localization = options?.localization;
  const presentation = options?.presentation;
  const names = options?.names;
  const makeId = options?.makeId;
  if (
    typeof projectDialog?.querySelectorAll !== "function" ||
    typeof projectDialog?.querySelector !== "function" ||
    !tmResourceList ||
    !tbResourceList ||
    typeof getProject !== "function" ||
    typeof getMode !== "function" ||
    typeof normalizeLanguageValue !== "function" ||
    typeof normalizeLanguageInput !== "function" ||
    typeof projectResources?.tmNames !== "function" ||
    typeof projectResources?.termBaseNames !== "function" ||
    typeof projectResources?.mainTmName !== "function" ||
    typeof projectResources?.links !== "function" ||
    typeof catalog?.matching !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof presentation?.replaceSafeHtml !== "function" ||
    typeof presentation?.escapeHtml !== "function" ||
    typeof presentation?.displaySafeHtml !== "function" ||
    typeof presentation?.languagePairDisplay !== "function" ||
    typeof names?.unique !== "function" ||
    typeof names?.clean !== "function" ||
    typeof makeId !== "function"
  ) {
    throw new TypeError(
      "ProjectResourceSelectionController requires dialog, resource, catalog, localization, presentation, name, and ID boundaries."
    );
  }

  const modern = Boolean(resourceDialog?.addEventListener && elements.resourceForm?.addEventListener);
  const listeners = [];
  let mounted = false;
  let savedPlan = null;
  let workingPlan = null;
  let accepted = false;
  let availableById = new Map();

  function defaultResourceName(type) {
    const translate =
      localization.source || ((text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] || ""));
    const name = String(elements.projectNameInput?.value || "").trim() || translate("New project");
    return translate(type === "tm" ? "{name} TM" : "{name} terminology", { name });
  }

  function listen(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push({ target, type, listener });
  }

  function values() {
    return {
      sourceLang: normalizeLanguageValue(sourceLanguageInput.value),
      targetLang: normalizeLanguageValue(targetLanguageInput.value)
    };
  }

  function signature() {
    const value = values();
    return `${value.sourceLang}::${value.targetLang}`;
  }

  function optionHtml(resource, type, selected, main) {
    const countLabel = resource.count
      ? localization.label(type === "tm" ? "unitCount" : "termCount", { count: resource.count })
      : localization.label("empty");
    const checkbox = `<input type="checkbox" data-resource-type="${type}" data-resource-name="${presentation.escapeHtml(resource.name)}" ${selected ? "checked" : ""}>`;
    const radio =
      type === "tm"
        ? `<input type="radio" name="projectMainTm" data-main-tm="${presentation.escapeHtml(resource.name)}" ${main ? "checked" : ""}>`
        : "";
    return `<label class="resource-option"><span class="resource-option-check">${checkbox}</span><span class="resource-option-body"><strong>${presentation.displaySafeHtml(resource.name)}</strong><span>${presentation.escapeHtml(presentation.languagePairDisplay(resource.sourceLang, resource.targetLang))} - ${countLabel}</span></span><span class="resource-option-main">${radio}</span></label>`;
  }

  function renderLegacy(project = getProject()) {
    const { sourceLang, targetLang } = values();
    if (!sourceLang || !targetLang) return;
    const editing = getMode() === "edit";
    const selectedTmNames = editing ? projectResources.tmNames(project) : [];
    const selectedTbNames = editing ? projectResources.termBaseNames(project) : [];
    const main = editing ? projectResources.mainTmName(project) : "";
    const tmResources = catalog.matching("tm", sourceLang, targetLang, selectedTmNames);
    const tbResources = catalog.matching("tb", sourceLang, targetLang, selectedTbNames);
    presentation.replaceSafeHtml(
      tmResourceList,
      tmResources.length
        ? tmResources
            .map((resource) =>
              optionHtml(resource, "tm", selectedTmNames.includes(resource.name), resource.name === main)
            )
            .join("")
        : `<div class="muted">${localization.labelHtml("noMatchingTms")}</div>`
    );
    presentation.replaceSafeHtml(
      tbResourceList,
      tbResources.length
        ? tbResources
            .map((resource) => optionHtml(resource, "tb", selectedTbNames.includes(resource.name), false))
            .join("")
        : `<div class="muted">${localization.labelHtml("noMatchingTbs")}</div>`
    );
  }

  function selectedLinks(type) {
    return (workingPlan?.resourceLinks || [])
      .filter((link) => link.type === type)
      .sort((a, b) => a.priority - b.priority);
  }

  function renumber(type) {
    selectedLinks(type).forEach((link, index) => {
      link.priority = index;
    });
  }

  function draftResource(type, name) {
    const resourceId = makeId(type === "tm" ? "tm-resource-draft" : "termbase-resource-draft");
    const { sourceLang, targetLang } = values();
    const resource = {
      id: resourceId,
      resourceId,
      type: type === "tm" ? "tm" : "termbase",
      name,
      sourceLang,
      targetLang,
      languages: [sourceLang, targetLang],
      count: 0,
      updatedAt: "",
      draft: true
    };
    workingPlan.newResources.push(resource);
    return resource;
  }

  function linkFor(resource, type) {
    const current = selectedLinks(type);
    return type === "tm"
      ? {
          id: makeId("resource-link"),
          resourceId: resource.resourceId || resource.id,
          type: "tm",
          name: resource.name,
          cachedName: resource.name,
          role: current.length ? "reference" : "main",
          lookup: true,
          priority: current.length,
          penalty: 0
        }
      : {
          id: makeId("resource-link"),
          resourceId: resource.resourceId || resource.id,
          type: "termbase",
          name: resource.name,
          cachedName: resource.name,
          role: "termbase",
          lookup: true,
          qa: true,
          contribute: current.length === 0,
          priority: current.length
        };
  }

  function initialPlan(project = getProject()) {
    const languagePair = signature();
    if (getMode() === "edit" && project) {
      const resourceLinks = projectResources.links(project).map((link, index) => ({
        ...link,
        cachedName: link.cachedName || link.name,
        lookup: link.lookup !== false,
        priority: Number.isFinite(Number(link.priority)) ? Number(link.priority) : index,
        ...(link.type === "tm"
          ? { penalty: clampPenalty(link.penalty) }
          : { qa: link.qa !== false, contribute: Boolean(link.contribute) })
      }));
      const writable = resourceLinks.filter((link) => link.type === "termbase" && link.contribute);
      return {
        configured: true,
        reviewed: true,
        languagePair,
        resourceLinks,
        newResources: [],
        activeTermBaseId: writable.some((link) => link.resourceId === project.activeTermBaseId)
          ? project.activeTermBaseId
          : writable[0]?.resourceId || null
      };
    }
    const plan = {
      configured: false,
      reviewed: false,
      languagePair,
      resourceLinks: [],
      newResources: [],
      activeTermBaseId: null
    };
    workingPlan = plan;
    const tm = draftResource("tm", defaultResourceName("tm"));
    const tb = draftResource("termbase", defaultResourceName("termbase"));
    plan.resourceLinks.push(linkFor(tm, "tm"), linkFor(tb, "termbase"));
    plan.activeTermBaseId = tb.id;
    return plan;
  }

  function prepare(project = getProject()) {
    workingPlan = null;
    savedPlan = getMode() === "edit" && project ? initialPlan(project) : null;
    renderSummary(project);
    return savedPlan;
  }

  function allResources(type) {
    const { sourceLang, targetLang } = values();
    const drafts = (workingPlan?.newResources || []).filter(
      (resource) => resource.type === (type === "tm" ? "tm" : "termbase")
    );
    const draftIds = new Set(drafts.map((resource) => resource.resourceId || resource.id));
    const selectedNames = selectedLinks(type)
      .filter((link) => !draftIds.has(link.resourceId))
      .map((link) => link.name);
    const available = catalog.matching(type === "tm" ? "tm" : "tb", sourceLang, targetLang, selectedNames);
    const map = new Map();
    [...available, ...drafts].forEach((resource) =>
      map.set(resource.resourceId || resource.id || `${resource.name}:${type}`, resource)
    );
    selectedLinks(type).forEach((link) => {
      if (!map.has(link.resourceId))
        map.set(link.resourceId, {
          id: link.resourceId,
          resourceId: link.resourceId,
          name: link.name,
          sourceLang,
          targetLang,
          count: 0
        });
    });
    return Array.from(map.values());
  }

  function policyRow(resource, type) {
    const id = resource.resourceId || resource.id;
    const link = selectedLinks(type).find((item) => item.resourceId === id);
    const selected = Boolean(link);
    const count = Number(resource.count || 0);
    const updated = resource.updatedAt
      ? new Date(resource.updatedAt).toLocaleDateString()
      : localization.label("empty");
    const matchesSearch =
      !elements.searchInput?.value.trim() ||
      resource.name.toLocaleLowerCase().includes(elements.searchInput.value.trim().toLocaleLowerCase());
    if (!matchesSearch) return "";
    const escapedId = presentation.escapeHtml(id);
    const countLabel = localization.label(type === "tm" ? "unitCount" : "termCount", { count });
    const updatedLabel = localization.label("updatedAt", { date: updated });
    const controls =
      type === "tm"
        ? `<label><input type="radio" name="resourceMainTm" data-policy="main" data-resource-id="${escapedId}" ${link?.role === "main" ? "checked" : ""} ${selected ? "" : "disabled"}> Main</label><label><input type="checkbox" data-policy="lookup" data-resource-id="${escapedId}" ${link?.lookup !== false ? "checked" : ""} ${selected ? "" : "disabled"}> Lookup</label><label>Penalty <input type="number" min="0" max="30" value="${link?.penalty || 0}" data-policy="penalty" data-resource-id="${escapedId}" ${selected ? "" : "disabled"}></label>`
        : `<label><input type="checkbox" data-policy="lookup" data-resource-id="${escapedId}" ${link?.lookup !== false ? "checked" : ""} ${selected ? "" : "disabled"}> Lookup</label><label><input type="checkbox" data-policy="qa" data-resource-id="${escapedId}" ${link?.qa !== false ? "checked" : ""} ${selected ? "" : "disabled"}> QA</label><label><input type="checkbox" data-policy="contribute" data-resource-id="${escapedId}" ${link?.contribute ? "checked" : ""} ${selected ? "" : "disabled"}> Allow contribution</label><label><input type="radio" name="activeTermbase" data-policy="active" data-resource-id="${escapedId}" ${workingPlan?.activeTermBaseId === id ? "checked" : ""} ${selected && link?.contribute ? "" : "disabled"}> Active</label>`;
    return `<div class="resource-policy-row" data-policy-row="${escapedId}"><div class="resource-policy-identity"><label><input type="checkbox" data-policy="selected" data-resource-type="${type}" data-resource-id="${escapedId}" data-resource-name="${presentation.escapeHtml(resource.name)}" ${selected ? "checked" : ""}> <strong>${presentation.displaySafeHtml(resource.name)}</strong></label><div class="resource-policy-meta"><span>${presentation.escapeHtml(countLabel)} · ${presentation.escapeHtml(updatedLabel)}</span>${resource.draft ? '<span class="resource-policy-badge">New — created with project</span>' : ""}</div></div><div class="resource-policy-controls">${controls}${selected ? `<button type="button" data-policy="up" data-resource-id="${escapedId}" aria-label="Move ${presentation.escapeHtml(resource.name)} up">↑</button><button type="button" data-policy="down" data-resource-id="${escapedId}" aria-label="Move ${presentation.escapeHtml(resource.name)} down">↓</button>` : ""}</div></div>`;
  }

  function renderPolicies() {
    if (!modern || !workingPlan) return;
    availableById = new Map();
    const tmResources = allResources("tm");
    const tbResources = allResources("termbase");
    [...tmResources, ...tbResources].forEach((resource) =>
      availableById.set(resource.resourceId || resource.id, resource)
    );
    presentation.replaceSafeHtml(
      tmResourceList,
      tmResources.map((resource) => policyRow(resource, "tm")).join("") ||
        '<div class="muted">No compatible translation memories yet.</div>'
    );
    presentation.replaceSafeHtml(
      tbResourceList,
      tbResources.map((resource) => policyRow(resource, "termbase")).join("") ||
        '<div class="muted">No compatible termbases yet. You may leave terminology empty.</div>'
    );
    if (elements.pairLabel) {
      const { sourceLang, targetLang } = values();
      elements.pairLabel.textContent = presentation.languagePairDisplay(sourceLang, targetLang);
    }
    if (elements.message)
      elements.message.textContent = selectedLinks("tm").length ? "" : "A project must have one main TM.";
  }

  function renderSummary(project = getProject()) {
    if (!modern) return renderLegacy(project);
    const plan = savedPlan;
    const base = projectBaseName(elements.projectNameInput?.value);
    const incompatible = plan && plan.languagePair !== signature();
    if (elements.summary) {
      if (!plan) {
        presentation.replaceSafeHtml(
          elements.summary,
          '<span class="resource-summary-chip main">1 new main TM</span><span class="resource-summary-chip active">1 new active termbase</span>'
        );
      } else {
        const tmLinks = plan.resourceLinks.filter((link) => link.type === "tm");
        const tbLinks = plan.resourceLinks.filter((link) => link.type === "termbase");
        const main = tmLinks.find((link) => link.role === "main");
        const active = tbLinks.find((link) => link.resourceId === plan.activeTermBaseId);
        presentation.replaceSafeHtml(
          elements.summary,
          [
            `<span class="resource-summary-chip main">Main TM: ${presentation.displaySafeHtml(main?.name || "Review required")}</span>`,
            `<span class="resource-summary-chip">${Math.max(0, tmLinks.length - 1)} reference TM${tmLinks.length === 2 ? "" : "s"}</span>`,
            `<span class="resource-summary-chip ${active ? "active" : ""}">${tbLinks.length} termbase${tbLinks.length === 1 ? "" : "s"}${active ? ` · Active: ${presentation.displaySafeHtml(active.name)}` : ""}</span>`
          ].join("")
        );
      }
    }
    if (elements.defaultNotice) {
      elements.defaultNotice.textContent = incompatible
        ? "The language pair changed. Review Optional Resource Settings before saving."
        : plan
          ? "Resource choices are kept as a draft until you save the project."
          : localization.source
            ? localization.source("If you continue unchanged, LoopCAT will create “{tm}” and “{tb}”.", {
                tm: defaultResourceName("tm"),
                tb: defaultResourceName("termbase")
              })
            : `If you continue unchanged, LoopCAT will create “${base} TM” and “${base} terminology”.`;
      elements.defaultNotice.classList?.toggle?.("validation-error", Boolean(incompatible));
    }
  }

  function render(project = getProject()) {
    return modern ? renderSummary(project) : renderLegacy(project);
  }

  function checkedNames(type) {
    return Array.from(projectDialog.querySelectorAll(`[data-resource-type="${type}"]:checked`)).map(
      (input) => input.dataset.resourceName
    );
  }

  function collectLegacy(existingProject = null) {
    const sourceLang = normalizeLanguageInput(sourceLanguageInput);
    const targetLang = normalizeLanguageInput(targetLanguageInput);
    const existingLinks = projectResources.links(existingProject);
    let tmNames = names.unique(checkedNames("tm"));
    let tbNames = names.unique(checkedNames("tb"));
    const newTmName = newTmNameInput.value.trim();
    const newTbName = newTermBaseNameInput.value.trim();
    let main = projectDialog.querySelector("[data-main-tm]:checked")?.dataset.mainTm || "";
    if (newTmName) {
      tmNames = names.unique([newTmName, ...tmNames]);
      main = newTmName;
    }
    if (!tmNames.length) {
      main = names.clean(existingProject?.mainTmName, names.clean(existingProject?.tmName, "Default TM"));
      tmNames = [main];
    }
    if (!main || !tmNames.includes(main)) main = tmNames[0];
    if (newTbName) tbNames = names.unique([...tbNames, newTbName]);
    if (!tbNames.length) tbNames = [names.clean(existingProject?.termBaseName, "Default TB")];
    return {
      sourceLang,
      targetLang,
      tmNames,
      termBaseNames: tbNames,
      mainTmName: main,
      tmName: main,
      termBaseName: tbNames[0],
      resourceLinks: [
        ...tmNames.map((name) => ({
          id: existingLinks.find((link) => link.type === "tm" && link.name === name)?.id || makeId("resource-link"),
          type: "tm",
          name,
          role: name === main ? "main" : "reference"
        })),
        ...tbNames.map((name) => ({
          id:
            existingLinks.find((link) => link.type === "termbase" && link.name === name)?.id || makeId("resource-link"),
          type: "termbase",
          name
        }))
      ]
    };
  }

  function collect(existingProject = null) {
    if (!modern) return collectLegacy(existingProject);
    const sourceLang = normalizeLanguageInput(sourceLanguageInput);
    const targetLang = normalizeLanguageInput(targetLanguageInput);
    if (savedPlan && savedPlan.languagePair !== `${sourceLang}::${targetLang}`)
      throw new Error("The language pair changed. Review Optional Resource Settings before saving.");
    const plan = savedPlan ? copy(savedPlan) : null;
    const links = plan?.resourceLinks || [];
    const main = links.find((link) => link.type === "tm" && link.role === "main");
    const termbases = links.filter((link) => link.type === "termbase");
    return {
      sourceLang,
      targetLang,
      ...(plan
        ? {
            resourcePlan: plan,
            resourceLinks: links,
            activeTermBaseId: plan.activeTermBaseId,
            tmNames: links.filter((link) => link.type === "tm").map((link) => link.name),
            termBaseNames: termbases.map((link) => link.name),
            mainTmName: main?.name || "",
            tmName: main?.name || "",
            termBaseName: termbases[0]?.name || ""
          }
        : {})
    };
  }

  function setTab(type) {
    const activeTab = type === "termbase" ? "termbase" : "tm";
    elements.tmTab?.setAttribute?.("aria-selected", String(activeTab === "tm"));
    elements.tbTab?.setAttribute?.("aria-selected", String(activeTab === "termbase"));
    if (elements.tmPanel) elements.tmPanel.hidden = activeTab !== "tm";
    if (elements.tbPanel) elements.tbPanel.hidden = activeTab !== "termbase";
  }

  function open() {
    if (!modern) return false;
    accepted = false;
    workingPlan = copy(savedPlan) || initialPlan(getProject());
    renderPolicies();
    projectDialog.close?.("resource-settings");
    if (typeof options.dialogLifecycle?.open === "function")
      return options.dialogLifecycle.open("project-resources", {
        initialFocus: elements.searchInput || elements.tmTab,
        returnTarget: elements.openButton
      });
    resourceDialog.showModal?.();
    return true;
  }

  function finish(usePlan) {
    if (usePlan) {
      const tmLinks = selectedLinks("tm");
      if (!tmLinks.length) {
        if (elements.message) elements.message.textContent = "Select or create a translation memory.";
        return false;
      }
      if (!tmLinks.some((link) => link.role === "main")) tmLinks[0].role = "main";
      workingPlan.configured = true;
      workingPlan.reviewed = true;
      workingPlan.languagePair = signature();
      workingPlan.newResources = workingPlan.newResources.filter((resource) =>
        workingPlan.resourceLinks.some((link) => link.resourceId === resource.id)
      );
      savedPlan = copy(workingPlan);
      accepted = true;
    } else {
      workingPlan = null;
      accepted = false;
    }
    if (typeof options.dialogLifecycle?.close === "function")
      options.dialogLifecycle.close("project-resources", usePlan ? "use" : "cancel");
    else resourceDialog.close?.(usePlan ? "use" : "cancel");
    return true;
  }

  function addDraft(type) {
    const input = type === "tm" ? newTmNameInput : newTermBaseNameInput;
    const name = input.value.trim();
    if (!name || !workingPlan) return false;
    const resource = draftResource(type, name);
    const link = linkFor(resource, type);
    workingPlan.resourceLinks.push(link);
    if (type === "termbase" && link.contribute && !workingPlan.activeTermBaseId)
      workingPlan.activeTermBaseId = resource.id;
    input.value = "";
    renderPolicies();
    return true;
  }

  function removeLink(link) {
    workingPlan.resourceLinks = workingPlan.resourceLinks.filter((item) => item !== link);
    if (link.type === "tm") {
      let remaining = selectedLinks("tm");
      if (!remaining.length) {
        const resource = draftResource("tm", defaultResourceName("tm"));
        workingPlan.resourceLinks.push(linkFor(resource, "tm"));
        remaining = selectedLinks("tm");
      }
      if (!remaining.some((item) => item.role === "main")) remaining[0].role = "main";
    } else if (workingPlan.activeTermBaseId === link.resourceId) {
      workingPlan.activeTermBaseId = selectedLinks("termbase").find((item) => item.contribute)?.resourceId || null;
    }
    renumber(link.type);
  }

  function handlePolicyChange(event) {
    if (!workingPlan) return;
    const control = event.target;
    const policy = control?.dataset?.policy;
    const resourceId = control?.dataset?.resourceId;
    if (!policy || !resourceId) return;
    const type =
      control.dataset.resourceType === "termbase"
        ? "termbase"
        : availableById.get(resourceId)?.type === "termbase"
          ? "termbase"
          : "tm";
    let link = workingPlan.resourceLinks.find((item) => item.resourceId === resourceId);
    if (policy === "selected") {
      if (control.checked && !link) {
        const resource = availableById.get(resourceId);
        if (resource) {
          link = linkFor(resource, type);
          workingPlan.resourceLinks.push(link);
          if (type === "termbase" && link.contribute && !workingPlan.activeTermBaseId)
            workingPlan.activeTermBaseId = resourceId;
        }
      } else if (!control.checked && link) removeLink(link);
    } else if (link) {
      if (policy === "main")
        selectedLinks("tm").forEach((item) => {
          item.role = item === link ? "main" : "reference";
        });
      else if (policy === "lookup" || policy === "qa" || policy === "contribute") {
        link[policy] = Boolean(control.checked);
        if (policy === "contribute") {
          if (control.checked && !workingPlan.activeTermBaseId) workingPlan.activeTermBaseId = resourceId;
          if (!control.checked && workingPlan.activeTermBaseId === resourceId)
            workingPlan.activeTermBaseId =
              selectedLinks("termbase").find((item) => item.contribute && item !== link)?.resourceId || null;
        }
      } else if (policy === "active") {
        link.contribute = true;
        workingPlan.activeTermBaseId = resourceId;
      } else if (policy === "penalty") link.penalty = clampPenalty(control.value);
    }
    renderPolicies();
  }

  function handlePolicyClick(event) {
    const button = event.target?.closest?.("button[data-policy]");
    if (!button || !workingPlan) return;
    const link = workingPlan.resourceLinks.find((item) => item.resourceId === button.dataset.resourceId);
    if (!link || !["up", "down"].includes(button.dataset.policy)) return;
    const ordered = selectedLinks(link.type);
    const index = ordered.indexOf(link);
    const next = button.dataset.policy === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= ordered.length) return;
    [ordered[index].priority, ordered[next].priority] = [ordered[next].priority, ordered[index].priority];
    renderPolicies();
  }

  function recommended() {
    if (!workingPlan) return;
    const tbs = selectedLinks("termbase");
    const activeId = tbs.some((link) => link.resourceId === workingPlan.activeTermBaseId)
      ? workingPlan.activeTermBaseId
      : tbs[0]?.resourceId || null;
    workingPlan.resourceLinks.forEach((link) => {
      link.lookup = true;
      if (link.type === "tm") link.penalty = 0;
      else {
        link.qa = true;
        link.contribute = link.resourceId === activeId;
      }
    });
    workingPlan.activeTermBaseId = activeId;
    renderPolicies();
  }

  function mount() {
    if (!modern || mounted) return false;
    if (typeof options.dialogLifecycle?.register === "function") {
      options.dialogLifecycle.register({
        id: "project-resources",
        dialog: resourceDialog,
        initialFocus: elements.searchInput || elements.tmTab,
        onCancel: () => {
          accepted = false;
          workingPlan = null;
        },
        onClose: () => {
          renderSummary(getProject());
          void Promise.resolve(options.resumeProject?.()).catch(options.onError || (() => {}));
        }
      });
    }
    listen(elements.openButton, "click", () => void open());
    listen(elements.projectNameInput, "input", () => renderSummary(getProject()));
    listen(elements.cancelButton, "click", () => finish(false));
    listen(elements.resourceForm, "submit", (event) => {
      event.preventDefault();
      finish(true);
    });
    listen(elements.tmTab, "click", () => setTab("tm"));
    listen(elements.tbTab, "click", () => setTab("termbase"));
    listen(elements.searchInput, "input", renderPolicies);
    listen(elements.addTmButton, "click", () => addDraft("tm"));
    listen(elements.addTbButton, "click", () => addDraft("termbase"));
    listen(elements.recommendedButton, "click", recommended);
    listen(tmResourceList, "change", handlePolicyChange);
    listen(tbResourceList, "change", handlePolicyChange);
    listen(tmResourceList, "click", handlePolicyClick);
    listen(tbResourceList, "click", handlePolicyClick);
    mounted = true;
    setTab("tm");
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listeners.splice(0).forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
    mounted = false;
    return true;
  }

  return Object.freeze({
    values,
    prepare,
    render,
    collect,
    open,
    finish,
    mount,
    unmount,
    getPlan: () => copy(savedPlan),
    isAccepted: () => accepted
  });
}
