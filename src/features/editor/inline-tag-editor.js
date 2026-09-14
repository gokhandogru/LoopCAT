import { normalizeProtectedSelection, protectedTokenRanges } from "./protected-token-edit-guard.js";

let activeDrag = null;

/** A DOM editor with the raw-string/UTF-16 selection contract used by commands.
 * Tag labels are presentation only; original markup stays in a private map.
 */
export function createInlineTagEditor(textarea, { detectTags }) {
  const ownerDocument = textarea?.ownerDocument;
  if (!ownerDocument?.createRange || !textarea.replaceWith) return textarea;
  // Rows are cloned from a template, whose inert document has no window or
  // live selection. Create the editor in the document that will host the row.
  const doc = ownerDocument.defaultView ? ownerDocument : globalThis.document;
  const editor = doc.createElement("div");
  editor.className = "target-editor";
  editor.contentEditable = "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.spellcheck = true;
  editor.tabIndex = 0;
  const rawTags = new WeakMap();
  let remembered = { start: 0, end: 0 };
  let composing = false;
  let readOnly = false;

  function raw(node) {
    if (rawTags.has(node)) return rawTags.get(node);
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeName === "BR") return "\n";
    return Array.from(node.childNodes, raw).join("");
  }
  function value() {
    if (editor.childNodes.length === 1 && editor.firstChild.nodeName === "BR") return "";
    return raw(editor);
  }
  function offsetAt(container, offset) {
    function visit(node) {
      if (rawTags.has(node)) return offset === 0 && node === container ? 0 : raw(node).length;
      if (node === container) {
        if (node.nodeType === 3) return Math.min(offset, raw(node).length);
        return Array.from(node.childNodes)
          .slice(0, offset)
          .reduce((sum, child) => sum + raw(child).length, 0);
      }
      let total = 0;
      for (const child of node.childNodes) {
        if (child === container || child.contains?.(container)) return total + visit(child);
        total += raw(child).length;
      }
      return total;
    }
    return visit(editor);
  }
  function selection() {
    const selected = doc.getSelection();
    if (selected?.rangeCount && editor.contains(selected.anchorNode) && editor.contains(selected.focusNode)) {
      const range = selected.getRangeAt(0);
      remembered = {
        start: offsetAt(range.startContainer, range.startOffset),
        end: offsetAt(range.endContainer, range.endOffset)
      };
    }
    return { ...remembered };
  }
  function pointAt(offset) {
    let remaining = offset;
    function visit(node) {
      if (rawTags.has(node)) {
        const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
        return { node: node.parentNode, offset: index + (remaining > 0 ? 1 : 0) };
      }
      if (node.nodeType === 3) return { node, offset: Math.min(remaining, raw(node).length) };
      for (const child of node.childNodes) {
        const length = raw(child).length;
        if (remaining <= length) return visit(child);
        remaining -= length;
      }
      return { node, offset: node.childNodes.length };
    }
    return visit(editor);
  }
  function setSelectionRange(start, end = start) {
    const text = value();
    remembered = normalizeProtectedSelection({ start, end }, text.length, protectedTokenRanges(text, detectTags(text)));
    if (doc.activeElement !== editor) return;
    const from = pointAt(remembered.start);
    const to = pointAt(remembered.end);
    const range = doc.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const selected = doc.getSelection();
    selected.removeAllRanges();
    selected.addRange(range);
  }
  function render(text, caret = null) {
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const tag of detectTags(text)) {
      if (tag.index < cursor || text.slice(tag.index, tag.index + tag.text.length) !== tag.text) continue;
      fragment.append(doc.createTextNode(text.slice(cursor, tag.index)));
      const chip = doc.createElement("span");
      chip.className = "tag-chip target-protected-tag";
      chip.contentEditable = "false";
      chip.textContent = tag.label || tag.text;
      chip.title = tag.text;
      chip.setAttribute("aria-label", tag.label || tag.text);
      rawTags.set(chip, tag.text);
      fragment.append(chip);
      cursor = tag.index + tag.text.length;
    }
    fragment.append(doc.createTextNode(text.slice(cursor)));
    editor.replaceChildren(fragment);
    remembered = caret || { start: text.length, end: text.length };
    setSelectionRange(remembered.start, remembered.end);
  }
  function refreshTokens() {
    if (!composing) render(value(), selection());
  }
  function setRangeText(replacement, start, end, mode = "end") {
    const text = value();
    const safe = normalizeProtectedSelection({ start, end }, text.length, protectedTokenRanges(text, detectTags(text)));
    const inserted = String(replacement).replace(/\r\n?/g, "\n");
    const caret = safe.start + inserted.length;
    render(
      text.slice(0, safe.start) + inserted + text.slice(safe.end),
      mode === "select" ? { start: safe.start, end: caret } : { start: caret, end: caret }
    );
  }
  function replaceSelection(text, inputType) {
    if (readOnly) return;
    const win = doc.defaultView;
    const before = new win.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data: text });
    if (!editor.dispatchEvent(before)) return;
    const selected = selection();
    setRangeText(text, selected.start, selected.end);
    editor.dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType, data: text }));
  }
  Object.defineProperties(editor, {
    value: { get: value, set: (text) => render(String(text || "").replace(/\r\n?/g, "\n")) },
    selectionStart: {
      get: () => selection().start,
      set: (start) => setSelectionRange(start, Math.max(start, selection().end))
    },
    selectionEnd: {
      get: () => selection().end,
      set: (end) => setSelectionRange(Math.min(selection().start, end), end)
    },
    readOnly: {
      get: () => readOnly,
      set: (state) => {
        readOnly = Boolean(state);
        editor.contentEditable = String(!readOnly);
        editor.setAttribute("aria-readonly", String(readOnly));
      }
    },
    setSelectionRange: { value: setSelectionRange },
    setRangeText: { value: setRangeText },
    refreshTokens: { value: refreshTokens },
    getCaretRect: {
      value: () => {
        const selected = doc.getSelection();
        if (!selected?.rangeCount || !editor.contains(selected.focusNode)) return null;
        const range = selected.getRangeAt(0).cloneRange();
        range.collapse(false);
        const rect = range.getClientRects()[0];
        return rect || editor.getBoundingClientRect();
      }
    }
  });
  editor.addEventListener("focus", () => setSelectionRange(remembered.start, remembered.end));
  editor.addEventListener("blur", selection);
  editor.addEventListener("compositionstart", () => {
    composing = true;
  });
  editor.addEventListener("compositionend", () => {
    composing = false;
  });
  editor.addEventListener("beforeinput", (event) => {
    if (readOnly) {
      event.preventDefault();
      return;
    }
    if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      replaceSelection("\n", "insertText");
    }
  });
  for (const type of ["copy", "cut"])
    editor.addEventListener(type, (event) => {
      if (!event.clipboardData) return;
      const text = value();
      const selected = normalizeProtectedSelection(
        selection(),
        text.length,
        protectedTokenRanges(text, detectTags(text))
      );
      if (selected.start === selected.end) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData("text/plain", text.slice(selected.start, selected.end));
      if (type === "cut" && !readOnly) {
        setSelectionRange(selected.start, selected.end);
        replaceSelection("", "deleteByCut");
      }
    });
  editor.addEventListener("paste", (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    replaceSelection(event.clipboardData.getData("text/plain"), "insertFromPaste");
  });
  editor.addEventListener("dragstart", (event) => {
    const selected = selection();
    const text = value();
    if (!event.dataTransfer || selected.start === selected.end) return;
    const safe = normalizeProtectedSelection(selected, text.length, protectedTokenRanges(text, detectTags(text)));
    const dragged = text.slice(safe.start, safe.end);
    event.dataTransfer.setData("text/plain", dragged);
    activeDrag = {
      editor,
      value: text,
      selection: safe,
      text: dragged,
      remove: () => {
        setSelectionRange(safe.start, safe.end);
        replaceSelection("", "deleteByDrag");
      }
    };
  });
  editor.addEventListener("dragover", (event) => {
    if (!readOnly) event.preventDefault();
  });
  editor.addEventListener("drop", (event) => {
    if (!event.dataTransfer || readOnly) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    let position =
      range && editor.contains(range.startContainer)
        ? offsetAt(range.startContainer, range.startOffset)
        : value().length;
    const text = event.dataTransfer.getData("text/plain");
    const drag = activeDrag;
    activeDrag = null;
    if (
      drag &&
      !drag.editor.readOnly &&
      drag.editor.isConnected &&
      !event.ctrlKey &&
      drag.editor.value === drag.value &&
      drag.text === text
    ) {
      if (drag.editor === editor && position >= drag.selection.start && position <= drag.selection.end) return;
      drag.remove();
      if (drag.editor === editor && position > drag.selection.end)
        position -= drag.selection.end - drag.selection.start;
    }
    editor.focus();
    setSelectionRange(position, position);
    replaceSelection(text, "insertFromDrop");
  });
  editor.addEventListener("dragend", () => {
    activeDrag = null;
  });
  render(textarea.value || "");
  textarea.replaceWith(editor);
  return editor;
}
