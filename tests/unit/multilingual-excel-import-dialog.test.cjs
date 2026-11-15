const assert = require("node:assert/strict");
const test = require("node:test");

function fakeDocument() {
  const document = {
    createElement(tag) {
      let ownText = "";
      const listeners = new Map();
      const element = {
        tag,
        children: [],
        attributes: new Map(),
        value: "",
        append(...children) {
          for (const child of children) {
            child.parent = element;
            element.children.push(child);
          }
        },
        replaceChildren(...children) {
          element.children = [];
          ownText = "";
          element.append(...children);
        },
        remove() {
          if (element.parent) element.parent.children = element.parent.children.filter((child) => child !== element);
        },
        setAttribute(name, value) {
          element.attributes.set(name, value);
        },
        addEventListener(type, listener) {
          listeners.set(type, [...(listeners.get(type) || []), listener]);
        },
        dispatch(type) {
          const event = { target: element, preventDefault() {} };
          for (const listener of listeners.get(type) || []) listener(event);
        },
        close() {
          element.open = false;
          element.dispatch("close");
        },
        focus() {
          document.activeElement = element;
        },
        get textContent() {
          return ownText + element.children.map((child) => child.textContent).join("");
        },
        set textContent(value) {
          ownText = String(value);
          element.children = [];
        }
      };
      return element;
    },
    getElementById(id) {
      return find(document.body, (element) => element.id === id);
    }
  };
  document.body = document.createElement("body");
  return document;
}

function find(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

const settle = () => new Promise(setImmediate);
const workbook = {
  sheets: [
    {
      name: "Languages",
      path: "xl/worksheets/sheet1.xml",
      columns: ["A", "B", "C", "D"].map((letter) => ({ letter })),
      previewRows: [
        { rowNumber: 1, cells: { B: "English", D: "Turkish" } },
        { rowNumber: 2, cells: { B: "<b>Hello</b>", D: "Merhaba" } }
      ]
    },
    {
      name: "Other sheet",
      path: "xl/worksheets/sheet2.xml",
      columns: [{ letter: "AA" }, { letter: "AB" }],
      previewRows: [{ rowNumber: 1, cells: { AA: "Other source" } }]
    }
  ]
};
const file = { name: "languages.xlsx", size: 4, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4])) };
const mapping = {
  sheetPath: "xl/worksheets/sheet1.xml",
  sourceColumn: "B",
  targetColumn: "D",
  firstRowIsHeader: true,
  importExistingTargets: true
};

async function createDialog(inspect = () => Promise.resolve(workbook)) {
  const { createMultilingualExcelImportDialog } =
    await import("../../src/features/import-export/multilingual-excel-import-dialog.js");
  const document = fakeDocument();
  const controller = createMultilingualExcelImportDialog({
    document,
    translate: (text) => text,
    inspect,
    showDialog(dialog, focus) {
      dialog.open = true;
      focus.focus();
    }
  });
  return { document, controller, get: (id) => document.getElementById(id) };
}

test("Excel dialog previews literal cells and rejects identical or out-of-range target columns", async () => {
  const { controller, get, document } = await createDialog();
  const pending = controller.configure(file, mapping);
  await settle();
  const dialog = get("multilingualExcelImportDialog");
  assert.match(dialog.textContent, /<b>Hello<\/b>/);
  assert.equal(
    find(dialog, (element) => element.tag === "b"),
    null
  );
  assert.equal(document.activeElement, get("excelImportSource"));
  const form = find(dialog, (element) => element.tag === "form");
  for (const value of ["B", "XFE", "A0", ""]) {
    get("excelImportTarget").value = value;
    get("excelImportTarget").dispatch("input");
    form.dispatch("submit");
    assert.equal(dialog.open, true);
    assert.ok(get("excelImportError").textContent);
  }
  get("excelImportTarget").value = " aa ";
  get("excelImportTarget").dispatch("input");
  form.dispatch("submit");
  assert.deepEqual(await pending, { ...mapping, targetColumn: "AA" });
  assert.equal(get("multilingualExcelImportDialog"), null);
});

test("Excel worksheet change, header and existing-target choices are captured", async () => {
  const { controller, get } = await createDialog();
  const pending = controller.configure(file, mapping);
  await settle();
  get("excelImportSheet").value = "xl/worksheets/sheet2.xml";
  get("excelImportSheet").dispatch("change");
  assert.equal(get("excelImportSource").value, "AA");
  get("excelImportTarget").value = "XFD";
  get("excelImportHeader").checked = false;
  get("excelImportExisting").checked = false;
  find(get("multilingualExcelImportDialog"), (element) => element.tag === "form").dispatch("submit");
  assert.deepEqual(await pending, {
    sheetPath: "xl/worksheets/sheet2.xml",
    sourceColumn: "AA",
    targetColumn: "XFD",
    firstRowIsHeader: false,
    importExistingTargets: false
  });
});

test("Cancel preserves the previous mapping and all-text reset is explicit", async () => {
  const { controller, get } = await createDialog();
  const before = { ...mapping };
  let pending = controller.configure(file, mapping);
  await settle();
  get("excelImportTarget").value = "C";
  find(get("multilingualExcelImportDialog"), (element) => element.textContent === "Cancel").dispatch("click");
  assert.equal(await pending, null);
  assert.deepEqual(mapping, before);
  pending = controller.configure(file, mapping);
  await settle();
  find(get("multilingualExcelImportDialog"), (element) => element.textContent === "Import all text instead").dispatch(
    "click"
  );
  assert.equal(await pending, false);
});

test("A failed workbook inspection releases the dialog for a retry", async () => {
  let attempts = 0;
  const { controller, get } = await createDialog(() =>
    ++attempts === 1 ? Promise.reject(new Error("Invalid workbook")) : Promise.resolve(workbook)
  );
  await assert.rejects(controller.configure(file), /Invalid workbook/);
  const pending = controller.configure(file);
  await settle();
  get("multilingualExcelImportDialog").close();
  assert.equal(await pending, null);
});

test("Batch review passes only saved Excel mapping to import and supports clearing it", async () => {
  const { createBatchImportController } = await import("../../src/features/import-export/batch-import-controller.js");
  for (const reset of [false, true]) {
    const document = fakeDocument();
    let previousMapping;
    const imports = [];
    let configured = false;
    const controller = createBatchImportController({
      document,
      session: { getProject: () => ({ id: "p", documents: [], importReceipts: [] }) },
      translate: (text) => text,
      accept: ".xlsx,.txt",
      encodingOptions: () => [["auto", "Automatic"]],
      showDialog(dialog) {
        dialog.open = true;
      },
      configureMultilingualExcel(_file, current) {
        previousMapping = current;
        const result = configured && reset ? false : mapping;
        configured = true;
        return Promise.resolve(result);
      },
      flush: () => Promise.resolve(),
      runTask: (_label, action) => action(),
      importFile: (_file, options) => {
        imports.push(options);
        return Promise.resolve();
      },
      finishBatch: () => Promise.resolve()
    });
    await controller.review([file]);
    const button = (text) => find(document.body, (element) => element.tag === "button" && element.textContent === text);
    button("Columns…").dispatch("click");
    await settle();
    assert.equal(previousMapping, undefined);
    assert.match(document.body.textContent, /B → D/);
    if (reset) {
      button("Columns…").dispatch("click");
      await settle();
      assert.deepEqual(previousMapping, mapping);
      assert.match(document.body.textContent, /All text/);
    }
    button("Import ready files").dispatch("click");
    await settle();
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].multilingualExcel, reset ? undefined : mapping);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
});

test("Batch column configuration and import wait for duplicate review to finish", async () => {
  const { createBatchImportController } = await import("../../src/features/import-export/batch-import-controller.js");
  const document = fakeDocument();
  let release;
  const content = new Promise((resolve) => {
    release = resolve;
  });
  const controller = createBatchImportController({
    document,
    session: { getProject: () => ({ id: "p", documents: [] }) },
    translate: (text) => text,
    accept: ".xlsx",
    encodingOptions: () => [["auto", "Automatic"]],
    showDialog(dialog) {
      dialog.open = true;
    },
    configureMultilingualExcel() {
      assert.fail("Configuration started before duplicate review completed.");
    },
    runTask() {
      assert.fail("Import started before duplicate review completed.");
    }
  });
  const reviewed = controller.review([{ ...file, arrayBuffer: () => content }]);
  await settle();
  const button = (text) => find(document.body, (element) => element.tag === "button" && element.textContent === text);
  assert.equal(button("Columns…").disabled, true);
  assert.equal(button("Import ready files").disabled, true);
  button("Columns…").dispatch("click");
  button("Import ready files").dispatch("click");
  await settle();
  release(new Uint8Array([1, 2, 3, 4]));
  await reviewed;
  assert.equal(button("Columns…").disabled, false);
  assert.equal(button("Import ready files").disabled, false);
});
