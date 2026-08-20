import { groupCommandResults, searchCommands } from "./command-search.js";

const RECENT_LIMIT = 8;

export function createPaletteController({
  overlay,
  input,
  results,
  closeButton,
  triggerButton,
  appShell,
  getCommands,
  translate = (value) => value,
  focusController,
  preferencesRepository,
  onError = (_error) => {}
}) {
  if (!overlay || !input || !results || typeof getCommands !== "function") {
    throw new TypeError("PaletteController requires its overlay, input, results, and command source.");
  }
  if (triggerButton && (!triggerButton.addEventListener || !triggerButton.removeEventListener)) {
    throw new TypeError("PaletteController requires a checked optional trigger button.");
  }

  let recentCommandIds = [];
  let activeIndex = 0;
  let visibleCommands = [];
  let returnTarget = null;
  let initialized = false;
  let triggerMounted = false;

  function isOpen() {
    return !overlay.classList.contains("hidden");
  }

  function syncActiveOption() {
    const options = Array.from(results.querySelectorAll("[role='option']"));
    if (!options.length) {
      activeIndex = 0;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    activeIndex = Math.max(0, Math.min(activeIndex, options.length - 1));
    options.forEach((option, index) => {
      const active = index === activeIndex;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
      option.tabIndex = -1;
    });
    const active = options[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function render() {
    const query = input.value.trim();
    visibleCommands = searchCommands(getCommands(), query, recentCommandIds);
    activeIndex = 0;
    if (!visibleCommands.length) {
      const empty = document.createElement("div");
      empty.className = "command-empty muted";
      empty.textContent = translate("No commands match.");
      empty.setAttribute("role", "status");
      results.replaceChildren(empty);
      input.removeAttribute("aria-activedescendant");
      return;
    }

    const fragment = document.createDocumentFragment();
    const groups = groupCommandResults(visibleCommands, recentCommandIds, Boolean(query));
    let optionIndex = 0;
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "command-group";
      section.setAttribute("role", "group");
      section.setAttribute("aria-label", translate(group.group));
      const heading = document.createElement("div");
      heading.className = "command-group-label";
      heading.textContent = translate(group.group);
      heading.setAttribute("aria-hidden", "true");
      section.append(heading);
      for (const command of group.commands) {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `loopcat-command-option-${optionIndex}`;
        option.className = "command-item";
        option.dataset.commandId = command.id;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.disabled = !command.enabled;
        const label = document.createElement("span");
        label.className = "command-label";
        label.textContent = translate(command.label);
        option.append(label);
        if (command.shortcut) {
          const shortcutElement = document.createElement("kbd");
          shortcutElement.textContent = String(command.shortcut);
          option.append(shortcutElement);
        }
        if (!command.enabled && command.disabledReason) {
          option.title = translate(command.disabledReason);
          option.setAttribute("aria-description", translate(command.disabledReason));
        }
        const currentIndex = optionIndex;
        option.addEventListener("pointermove", () => {
          activeIndex = currentIndex;
          syncActiveOption();
        });
        option.addEventListener("click", () => void execute(command));
        section.append(option);
        optionIndex += 1;
      }
      fragment.append(section);
    }
    results.replaceChildren(fragment);
    syncActiveOption();
  }

  async function remember(commandId) {
    recentCommandIds = [commandId, ...recentCommandIds.filter((id) => id !== commandId)].slice(0, RECENT_LIMIT);
    if (!preferencesRepository) return;
    await preferencesRepository.patch({ recentCommandIds });
  }

  async function execute(command = visibleCommands[activeIndex]) {
    if (!command?.enabled) return;
    close();
    try {
      await command.run();
      await remember(command.id);
    } catch (error) {
      onError(error);
    }
  }

  function close() {
    if (!isOpen()) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    input.setAttribute("aria-expanded", "false");
    appShell?.removeAttribute("inert");
    focusController?.close?.(overlay);
    if (!focusController && returnTarget?.focus) returnTarget.focus();
    input.value = "";
    input.removeAttribute("aria-activedescendant");
    activeIndex = 0;
  }

  function open() {
    if (isOpen()) return;
    returnTarget = document.activeElement;
    input.value = "";
    render();
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    input.setAttribute("aria-expanded", "true");
    appShell?.setAttribute("inert", "");
    if (focusController?.open) focusController.open(overlay, { initialFocus: input, returnTarget });
    else input.focus();
  }

  const triggerClickListener = () => open();

  function mountTrigger() {
    if (triggerMounted) return false;
    triggerButton?.addEventListener("click", triggerClickListener);
    triggerMounted = true;
    return true;
  }

  function unmountTrigger() {
    if (!triggerMounted) return false;
    triggerButton?.removeEventListener("click", triggerClickListener);
    triggerMounted = false;
    return true;
  }

  function handleInputKeydown(event) {
    if (!visibleCommands.length && event.key !== "Escape") return;
    if (event.key === "ArrowDown") activeIndex = (activeIndex + 1) % visibleCommands.length;
    else if (event.key === "ArrowUp") activeIndex = (activeIndex - 1 + visibleCommands.length) % visibleCommands.length;
    else if (event.key === "Home") activeIndex = 0;
    else if (event.key === "End") activeIndex = visibleCommands.length - 1;
    else if (event.key === "Enter") {
      event.preventDefault();
      void execute();
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    } else return;
    event.preventDefault();
    syncActiveOption();
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    input.addEventListener("input", render);
    input.addEventListener("keydown", handleInputKeydown);
    closeButton?.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    if (preferencesRepository) {
      const preferences = await preferencesRepository.read();
      recentCommandIds = Array.isArray(preferences.recentCommandIds)
        ? preferences.recentCommandIds.filter((id) => typeof id === "string").slice(0, RECENT_LIMIT)
        : [];
    }
  }

  return Object.freeze({ close, initialize, isOpen, mountTrigger, open, render, unmountTrigger });
}
