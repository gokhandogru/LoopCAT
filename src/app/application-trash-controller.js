export function createApplicationTrashController({
  elements,
  repository,
  projects,
  commandHistory,
  dialog,
  localization,
  text,
  date,
  dom,
  status
}) {
  if (
    !elements ||
    (elements.summaryButton && typeof elements.summaryButton.setAttribute !== "function") ||
    (elements.list && typeof elements.list.replaceChildren !== "function") ||
    (elements.list && !elements.emptyButton)
  ) {
    throw new TypeError("ApplicationTrashController requires checked optional element boundaries.");
  }
  if (
    repository &&
    (typeof repository.list !== "function" ||
      typeof repository.restore !== "function" ||
      typeof repository.emptyAll !== "function")
  ) {
    throw new TypeError("ApplicationTrashController requires a checked optional Trash repository.");
  }
  if (!projects?.load || !commandHistory?.synchronize || !commandHistory.render) {
    throw new TypeError("ApplicationTrashController requires checked project and command-history boundaries.");
  }
  if (!dialog?.open || !localization?.source || !localization.confirm) {
    throw new TypeError("ApplicationTrashController requires checked dialog and localization boundaries.");
  }
  if (!text?.safe || !date?.format || !dom?.createElement || !dom.createFragment) {
    throw new TypeError("ApplicationTrashController requires checked presentation boundaries.");
  }
  if (!status?.set) {
    throw new TypeError("ApplicationTrashController requires a checked status boundary.");
  }

  async function renderSummary() {
    if (!elements.summaryButton || !repository) return [];
    const entries = await repository.list();
    elements.summaryButton.textContent = entries.length
      ? localization.source("Trash ({value1})", { value1: entries.length })
      : localization.source("Trash");
    elements.summaryButton.setAttribute(
      "aria-label",
      localization.source("Trash, {value1} item(s)", { value1: entries.length })
    );
    return entries;
  }

  async function restore(entryId) {
    try {
      const entry = await repository.restore(entryId);
      await projects.load(false);
      await commandHistory.synchronize(entry, { refreshSuggestions: true });
      await renderList();
      status.set(`${entry.label || "Item"} restored from Trash`, "saved");
      commandHistory.render();
      return true;
    } catch (error) {
      status.set(error.message || "Trash restore failed. Existing work was preserved.", "dirty");
      return false;
    }
  }

  async function renderList() {
    const entries = await renderSummary();
    if (!elements.list) return entries;
    if (!entries.length) {
      const empty = dom.createElement("div");
      empty.className = "muted";
      empty.textContent = localization.source(
        "Trash is empty. Deleted projects, files, memories, and termbases will appear here."
      );
      elements.list.replaceChildren(empty);
      elements.emptyButton.disabled = true;
      return entries;
    }
    const fragment = dom.createFragment();
    entries.forEach((entry) => {
      const item = dom.createElement("article");
      item.className = "trash-item";
      const copy = dom.createElement("div");
      const title = dom.createElement("strong");
      title.textContent = text.safe(entry.label, localization.source("Deleted item"));
      const meta = dom.createElement("p");
      const entityLabel =
        entry.entityType === "document"
          ? localization.source("Project file")
          : entry.entityType === "project"
            ? localization.source("Project")
            : entry.resourceType === "tm"
              ? localization.source("Translation memory")
              : localization.source("Termbase");
      meta.textContent = `${entityLabel} · ${date.format(entry.deletedAt)}`;
      copy.append(title, meta);
      const actions = dom.createElement("div");
      actions.className = "trash-item-actions";
      const restoreButton = dom.createElement("button");
      restoreButton.type = "button";
      restoreButton.textContent = localization.source("Restore");
      restoreButton.setAttribute(
        "aria-label",
        localization.source("Restore {value1}", { value1: text.safe(entry.label) })
      );
      restoreButton.addEventListener("click", () => restore(entry.id));
      actions.append(restoreButton);
      item.append(copy, actions);
      fragment.append(item);
    });
    elements.list.replaceChildren(fragment);
    elements.emptyButton.disabled = false;
    return entries;
  }

  async function open() {
    return await (dialog.open() || false);
  }

  async function empty() {
    const entries = await repository.list();
    if (!entries.length) return false;
    const confirmed = localization.confirm("Permanently delete every item in Trash? This cannot be undone.");
    if (!confirmed) return false;
    await repository.emptyAll();
    await renderList();
    status.set("Trash emptied permanently", "saved");
    return true;
  }

  return Object.freeze({ renderSummary, restore, renderList, open, empty });
}
