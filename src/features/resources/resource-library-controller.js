import { createResourceUi } from "./resource-ui.js";
import { openResourceImportDialog } from "./resource-import-dialog.js";

export function filterResourceLibrary(resources, state) {
  const text = String(state.search || "").toLocaleLowerCase();
  const direction = state.direction === "desc" ? -1 : 1;
  return resources
    .filter(
      (item) =>
        (!text || item.name.toLocaleLowerCase().includes(text)) &&
        (!state.language || [item.sourceLang, item.targetLang, ...(item.languages || [])].includes(state.language)) &&
        (!state.project || (item.linkedProjects || []).some((project) => project.id === state.project)) &&
        (state.archive === "all" || (state.archive === "archived" ? item.archived : !item.archived))
    )
    .sort((a, b) => {
      const field = state.sort || "name";
      const left =
        field === "entryCount"
          ? Number(a.entryCount || 0)
          : field === "linkedProjects"
            ? (a.linkedProjects || []).length
            : String(a[field] || "");
      const right =
        field === "entryCount"
          ? Number(b.entryCount || 0)
          : field === "linkedProjects"
            ? (b.linkedProjects || []).length
            : String(b[field] || "");
      return (
        (typeof left === "number" ? left - Number(right) : left.localeCompare(String(right))) * direction ||
        a.id.localeCompare(b.id)
      );
    });
}

export function createResourceLibraryController({
  document,
  root,
  storage,
  project,
  platform,
  transfer,
  i18n,
  refresh,
  reportError,
  normalizeLanguage = (input) => input.value.trim()
}) {
  const ui = createResourceUi(document, i18n);
  const { node, button, field, select, dialog, t, safeMetadata } = ui;
  const storageKey = "loopcat.resource-library.v1";
  let preferences;
  try {
    preferences = JSON.parse(document.defaultView.localStorage.getItem(storageKey) || "{}");
  } catch {
    preferences = {};
  }
  let state = {
    search: "",
    language: "",
    project: "",
    archive: "active",
    sort: "name",
    direction: "asc",
    density: "compact",
    ...preferences
  };
  let catalog = { type: "tm", resources: [] };
  let optionsKey = "";
  let mounted = false;
  let restoreScroll = true;
  const scrollNodes = () => {
    const nodes = [];
    for (let element = root; element; element = element.parentElement) nodes.push(element);
    return nodes;
  };
  const search = node("input", {
    type: "search",
    value: state.search,
    placeholder: t("Search resources"),
    "aria-label": t("Search resources")
  });
  const language = select("Language", [["", "All languages"]]);
  const linkedProject = select("Linked project", [["", "All projects"]]);
  const archive = select(
    "Resource state",
    [
      ["active", "Active"],
      ["archived", "Archived"],
      ["all", "All resources"]
    ],
    state.archive
  );
  const density = select(
    "Row density",
    [
      ["compact", "Compact"],
      ["comfortable", "Comfortable"]
    ],
    state.density
  );
  const columns = [
    ["name", "Name"],
    ["sourceLang", "Languages"],
    ["entryCount", "Entries"],
    ["linkedProjects", "Linked projects"],
    ["updatedAt", "Updated"]
  ];
  const sortBy = select("Sort by", columns, state.sort);
  const sortDirection = select(
    "Sort direction",
    [
      ["asc", "Ascending"],
      ["desc", "Descending"]
    ],
    state.direction
  );
  const filterSummary = node("summary", {}, t("Filters and display"));
  const resultCount = node("span", { className: "muted", role: "status", "aria-live": "polite" });
  function remember() {
    try {
      document.defaultView.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Optional view preference. */
    }
  }
  document.addEventListener(
    "scroll",
    () => {
      if (root.classList.contains("hidden") || restoreScroll) return;
      state.scrollPositions = scrollNodes().map((element) => element.scrollTop);
      remember();
    },
    true
  );
  function bind(input, key, event = "change") {
    input.addEventListener(event, () => {
      state[key] = input.value;
      remember();
      renderTables();
    });
  }
  bind(search, "search", "input");
  bind(language, "language");
  bind(linkedProject, "project");
  bind(archive, "archive");
  bind(density, "density");
  bind(sortBy, "sort");
  bind(sortDirection, "direction");
  const run = (action) => void Promise.resolve().then(action).catch(reportError);
  function create() {
    const type = catalog.type;
    const name = node("input", { required: true, autofocus: true });
    const source = node("input", { list: "languageOptions", value: "en", required: true });
    const target = node("input", { list: "languageOptions", value: "", required: true });
    const error = node("p", { role: "alert" });
    const form = node(
      "form",
      {},
      field("Resource name", name),
      node("div", { className: "resource-fields" }, field("Source language", source), field("Target language", target)),
      error
    );
    const submit = node("button", { type: "submit", className: "primary" }, t("Create resource"));
    form.append(node("footer", {}, submit));
    const view = dialog(type === "tm" ? "New translation memory" : "New termbase", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const sourceLang = normalizeLanguage(source);
        const targetLang = normalizeLanguage(target);
        if (!name.value.trim() || !sourceLang || !targetLang)
          throw new Error(t("Enter a resource name and both languages first."));
        const resource = await project.createResource({
          name: name.value.trim(),
          type: type === "tm" ? "tm" : "termbase",
          sourceLang,
          targetLang,
          languages: [sourceLang, targetLang]
        });
        view.close();
        await refresh();
        await platform.openResourceEditor({ type, resourceId: resource.id });
      } catch (failure) {
        error.textContent = t(failure.message);
        submit.disabled = false;
      }
    });
  }
  function linkedDetails(resource) {
    const list = node("ul");
    for (const linked of resource.linkedProjects || [])
      list.append(
        node(
          "li",
          {},
          node("strong", { "data-i18n-skip": true }, safeMetadata(linked.name)),
          ` · ${[linked.role, linked.lookup !== false ? t("Lookup") : "", linked.qa ? t("QA") : "", linked.contribute ? t("Write") : ""].filter(Boolean).join(" · ")}`
        )
      );
    dialog(
      "Linked projects",
      node(
        "div",
        {},
        node("h3", { "data-i18n-skip": true }, safeMetadata(resource.name)),
        list.children.length ? list : node("p", {}, t("No linked projects"))
      )
    );
  }
  function action(label, resource, type, name, extra = {}) {
    const control = button(label === resource.name ? "Open" : label, null, {
      "data-resource-action": name,
      "data-resource-type": type,
      "data-resource-id": resource.id,
      "data-resource-key": resource.id,
      "aria-label": `${t(label === resource.name ? "Open" : label)} ${safeMetadata(resource.name)}`,
      ...extra
    });
    if (label === resource.name) {
      control.textContent = safeMetadata(resource.name);
      control.setAttribute("data-i18n-skip", "");
    }
    return control;
  }
  function renderTables() {
    root.dataset.density = state.density;
    sortBy.value = state.sort;
    sortDirection.value = state.direction;
    const filterCount = [state.language, state.project, state.archive !== "active"].filter(Boolean).length;
    filterSummary.textContent = [t("Filters and display"), filterCount || ""].filter(Boolean).join(" · ");
    let activeCount = 0;
    for (const type of ["tm", "tb"]) {
      const dashboard = root.querySelector(type === "tm" ? "#tmResourceDashboard" : "#tbResourceDashboard");
      const available = catalog.resources.filter((item) => item.type === (type === "tm" ? "tm" : "termbase"));
      const resources = filterResourceLibrary(available, state);
      if (type === catalog.type) activeCount = resources.length;
      const table = node("table", {
        className: "resource-library-table",
        role: "table",
        "aria-label": t(type === "tm" ? "Translation memories" : "Termbases")
      });
      const heading = node("tr", { role: "row" });
      for (const [key, label] of columns) {
        const th = node("th", {
          scope: "col",
          role: "columnheader",
          "aria-label": t(label),
          "data-sort-key": key,
          "aria-sort": state.sort === key ? (state.direction === "asc" ? "ascending" : "descending") : "none"
        });
        th.append(
          button(label, () => {
            state.direction = state.sort === key && state.direction === "asc" ? "desc" : "asc";
            state.sort = key;
            remember();
            renderTables();
            dashboard.querySelector(`th[data-sort-key="${key}"] button`)?.focus();
          })
        );
        heading.append(th);
      }
      heading.append(node("th", { scope: "col", role: "columnheader" }, t("Actions")));
      const body = node("tbody", { role: "rowgroup" });
      for (const resource of resources) {
        const actions = node(
          "details",
          { className: "resource-overflow" },
          node("summary", { "aria-label": `${t("Actions for")} ${safeMetadata(resource.name)}` }, t("Actions"))
        );
        const menu = node("div", { className: "resource-action-menu" });
        for (const [label, name] of [
          ["Rename", "rename"],
          ["Duplicate", "duplicate"],
          ["Export", "export"],
          [resource.archived ? "Restore" : "Archive", resource.archived ? "restore" : "archive"],
          ["Move to Trash", "delete-resource"]
        ])
          menu.append(action(label, resource, type, name));
        actions.append(menu);
        const row = node(
          "tr",
          { role: "row", "data-library-id": resource.id, className: state.selected === resource.id ? "selected" : "" },
          node(
            "th",
            { scope: "row", role: "rowheader" },
            action(resource.name, resource, type, "open", {
              className: "resource-name-link",
              dir: "auto",
              "aria-current": state.selected === resource.id ? "true" : null
            }),
            resource.archived ? node("span", { className: "resource-badge" }, t("Archived")) : null
          ),
          node(
            "td",
            { role: "cell" },
            node("bdi", { dir: "ltr" }, `${resource.sourceLang || "—"} → ${resource.targetLang || "—"}`)
          ),
          node(
            "td",
            { role: "cell", "data-label": t("Entries") },
            resource.catalogPending ? "…" : (resource.entryCount ?? 0).toLocaleString(i18n?.getLocale?.())
          ),
          node(
            "td",
            { role: "cell", "data-label": t("Linked projects") },
            button(String(resource.linkedProjects?.length || 0), () => linkedDetails(resource), {
              "aria-label": `${t("Linked projects")}: ${resource.linkedProjects?.length || 0} · ${safeMetadata(resource.name)}`
            })
          ),
          node(
            "td",
            { role: "cell", "data-label": t("Updated") },
            resource.updatedAt ? new Date(resource.updatedAt).toLocaleDateString(i18n?.getLocale?.()) : "—"
          ),
          node(
            "td",
            { role: "cell", className: "resource-library-actions" },
            action("Open", resource, type, "open"),
            actions
          )
        );
        row.addEventListener("click", () => {
          state.selected = resource.id;
          state.scrollPositions = scrollNodes().map((element) => element.scrollTop);
          remember();
          for (const item of root.querySelectorAll("tr[data-library-id]")) {
            const current = item.dataset.libraryId === resource.id;
            item.classList.toggle("selected", current);
            item.querySelector(".resource-name-link")?.setAttribute("aria-current", String(current));
          }
        });
        body.append(row);
      }
      table.append(node("thead", { role: "rowgroup" }, heading), body);
      dashboard.replaceChildren(
        resources.length
          ? table
          : !available.length
            ? node(
                "div",
                { className: "resource-empty" },
                node("h3", {}, t(type === "tm" ? "No translation memories yet." : "No termbases yet.")),
                button(type === "tm" ? "New translation memory" : "New termbase", () => run(create))
              )
            : node(
                "div",
                { className: "resource-empty" },
                node("h3", {}, t("No matching resources")),
                node("p", {}, t("Clear the filters, create a resource, or import a file.")),
                button("Clear filters", () => {
                  state = {
                    ...state,
                    search: "",
                    language: "",
                    project: "",
                    archive: available.every((resource) => resource.archived) ? "all" : "active"
                  };
                  search.value = language.value = linkedProject.value = "";
                  archive.value = state.archive;
                  remember();
                  renderTables();
                })
              )
      );
    }
    resultCount.textContent = `${t("Search results")} · ${activeCount.toLocaleString(i18n?.getLocale?.())}`;
  }
  function render(next) {
    catalog = next;
    state.type = next.type;
    remember();
    if (!mounted) {
      root.classList.add("resources-upgraded");
      const toolbar = node(
        "div",
        { className: "resource-library-toolbar" },
        search,
        node(
          "details",
          { className: "resource-library-filters" },
          filterSummary,
          node(
            "div",
            { className: "resource-filter-fields" },
            field("Language", language),
            field("Linked project", linkedProject),
            field("Resource state", archive),
            field("Row density", density),
            node(
              "div",
              { className: "resource-library-mobile-sort" },
              field("Sort by", sortBy),
              field("Sort direction", sortDirection)
            )
          )
        )
      );
      root.querySelector(".resources-header").append(
        node(
          "div",
          { className: "resource-toolbar-actions" },
          button("New", () => run(create), { className: "primary" }),
          button("Import", () =>
            run(() => openResourceImportDialog({ ui, transfer, storage, type: catalog.type, onComplete: refresh }))
          )
        )
      );
      const tabs = root.querySelector(".resource-tabs");
      const tabsRow = document.createElement("div");
      tabsRow.className = "resource-tabs-row";
      tabs.before(tabsRow, toolbar);
      tabsRow.append(tabs, resultCount);
      mounted = true;
    }
    const key = JSON.stringify(
      catalog.resources.map((resource) => [
        resource.id,
        resource.sourceLang,
        resource.targetLang,
        resource.linkedProjects
      ])
    );
    if (key !== optionsKey) {
      optionsKey = key;
      const languages = [
        ...new Set(
          catalog.resources
            .flatMap((item) => [item.sourceLang, item.targetLang, ...(item.languages || [])])
            .filter(Boolean)
        )
      ].sort();
      language.replaceChildren(
        node("option", { value: "" }, t("All languages")),
        ...languages.map((value) => node("option", { value }, value))
      );
      const projects = new Map(
        catalog.resources.flatMap((item) => (item.linkedProjects || []).map((project) => [project.id, project.name]))
      );
      linkedProject.replaceChildren(
        node("option", { value: "" }, t("All projects")),
        ...[...projects].map(([id, name]) => node("option", { value: id, "data-i18n-skip": true }, safeMetadata(name)))
      );
      language.value = state.language;
      linkedProject.value = state.project;
    }
    renderTables();
    if (restoreScroll && !root.classList.contains("hidden"))
      document.defaultView.requestAnimationFrame(() => {
        scrollNodes().forEach((element, index) => {
          element.scrollTop = state.scrollPositions?.[index] || 0;
        });
        restoreScroll = false;
      });
  }
  return Object.freeze({ render, getPreferredType: () => (state.type === "tb" ? "tb" : "tm") });
}
