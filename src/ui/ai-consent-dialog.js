/**
 * Keep AI consent inside the renderer: native window.confirm suspends the
 * renderer and can leave desktop keyboard focus outside the editing surface.
 */
export function createAiConsentDialog({ document, focusController, translate = (text) => text }) {
  let pending = false;

  return async function confirm(message) {
    // A second click must not start a second request behind the same consent.
    if (pending) return false;
    pending = true;
    const dialog = document.createElement("dialog");
    const card = document.createElement("section");
    const heading = document.createElement("h2");
    const description = document.createElement("p");
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    const accept = document.createElement("button");
    dialog.id = "aiConsentDialog";
    heading.id = "aiConsentTitle";
    description.id = "aiConsentDescription";
    dialog.setAttribute("aria-labelledby", heading.id);
    dialog.setAttribute("aria-describedby", description.id);
    card.className = "dialog-card";
    actions.className = "dialog-actions";
    heading.textContent = translate("AI tools");
    description.textContent = translate(message);
    cancel.textContent = translate("Cancel");
    accept.textContent = translate("Continue");
    cancel.type = accept.type = "button";
    cancel.addEventListener("click", () => dialog.close("cancel"));
    accept.addEventListener("click", () => dialog.close("accept"));
    actions.append(cancel, accept);
    card.append(heading, description, actions);
    dialog.append(card);
    document.body.append(dialog);
    try {
      return await new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "accept"), { once: true });
        if (!focusController.showModal(dialog, { initialFocus: cancel, returnTarget: document.activeElement })) {
          resolve(false);
        }
      });
    } finally {
      dialog.remove();
      pending = false;
    }
  };
}
