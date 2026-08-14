/**
 * Owns Resources-dashboard TMX, TBX, and CSV/XLSX term-list import
 * orchestration. DOM input lifecycle, parsers, repositories, resource
 * presentation, and project dirtiness remain injected boundaries.
 *
 * @param {{
 *   forms: {
 *     tmName: () => string,
 *     tbName: () => string,
 *     tmSourceLanguageInput: any,
 *     tmTargetLanguageInput: any,
 *     tbSourceLanguageInput: any,
 *     tbTargetLanguageInput: any,
 *     normalizeLanguageInput: (element: any) => string
 *   },
 *   files: {
 *     assertSize: (file: any, label: string) => unknown,
 *     readText: (file: any) => Promise<string>,
 *     reportProgress: (phase: string, file: any, detail?: string) => Promise<any>,
 *     progressDetail: (done: number, total: number, unitLabel: string) => string,
 *     yieldToUi: () => Promise<any> | any
 *   },
 *   parsers: {
 *     parseTmx: (text: string, defaults: any, options: any) => Promise<any[]>,
 *     parseTbx: (text: string, defaults: any, options: any) => Promise<any[]>,
 *     parseTermList: (text: string, options: any) => any[] | Promise<any[]>,
 *     parseTermWorkbook: (buffer: ArrayBuffer, options: any) => any[] | Promise<any[]>
 *   },
 *   repositories: {
 *     importTmEntries: (entries: any[], options: any) => Promise<any>,
 *     importTerms: (terms: any[], options: any) => Promise<any>
 *   },
 *   resources: {
 *     markProjectsUsingDirty: (type: string, name: string, sourceLang: string, targetLang: string) => unknown,
 *     open: (type: string, key: string, options: { render: boolean, focus: boolean }) => unknown,
 *     refresh: () => Promise<any>,
 *     refreshProjectTerms: (options: { rerender: boolean }) => Promise<any>
 *   },
 *   alert: (message: string) => unknown,
 *   status: { set: (message: string, mode: string) => unknown }
 * }} options
 */
export function createResourceLibraryImportController(options) {
  const forms = options?.forms;
  const files = options?.files;
  const parsers = options?.parsers;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const alert = options?.alert;
  const status = options?.status;
  if (
    typeof forms?.tmName !== "function" ||
    typeof forms?.tbName !== "function" ||
    typeof forms?.normalizeLanguageInput !== "function" ||
    !forms?.tmSourceLanguageInput ||
    !forms?.tmTargetLanguageInput ||
    !forms?.tbSourceLanguageInput ||
    !forms?.tbTargetLanguageInput ||
    typeof files?.assertSize !== "function" ||
    typeof files?.readText !== "function" ||
    typeof files?.reportProgress !== "function" ||
    typeof files?.progressDetail !== "function" ||
    typeof files?.yieldToUi !== "function" ||
    typeof parsers?.parseTmx !== "function" ||
    typeof parsers?.parseTbx !== "function" ||
    typeof parsers?.parseTermList !== "function" ||
    typeof parsers?.parseTermWorkbook !== "function" ||
    typeof repositories?.importTmEntries !== "function" ||
    typeof repositories?.importTerms !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof resources?.open !== "function" ||
    typeof resources?.refresh !== "function" ||
    typeof resources?.refreshProjectTerms !== "function" ||
    typeof alert !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ResourceLibraryImportController requires form, file, parser, repository, resource, alert, and status boundaries."
    );
  }

  function entryLabel(count) {
    return `entr${count === 1 ? "y" : "ies"}`;
  }

  function termLabel(count) {
    return `term${count === 1 ? "" : "s"}`;
  }

  function readTmForm() {
    return {
      name: forms.tmName().trim(),
      sourceLang: forms.normalizeLanguageInput(forms.tmSourceLanguageInput),
      targetLang: forms.normalizeLanguageInput(forms.tmTargetLanguageInput)
    };
  }

  function readTbForm() {
    return {
      name: forms.tbName().trim(),
      sourceLang: forms.normalizeLanguageInput(forms.tbSourceLanguageInput),
      targetLang: forms.normalizeLanguageInput(forms.tbTargetLanguageInput)
    };
  }

  function importProgress(file, phase, label) {
    return (progress) =>
      files.reportProgress(phase, file, files.progressDetail(progress.saved, progress.total, label(progress.saved)));
  }

  async function parseTermListFile(file, parseOptions) {
    const isWorkbook =
      /\.xlsx$/i.test(file?.name || "") ||
      file?.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return isWorkbook
      ? parsers.parseTermWorkbook(await file.arrayBuffer(), parseOptions)
      : parsers.parseTermList(await files.readText(file), parseOptions);
  }

  async function importTmx(file) {
    files.assertSize(file, "TMX resource file");
    const { name: tmName, sourceLang, targetLang } = readTmForm();
    if (!tmName || !sourceLang || !targetLang) {
      alert("Enter a TM name, source language, and target language before importing.");
      return;
    }
    await files.reportProgress("Reading TMX resource", file);
    const text = await files.readText(file);
    await files.reportProgress("Parsing TMX resource", file);
    const entries = await parsers.parseTmx(
      text,
      { sourceLang, targetLang, tmName, projectName: "Resources import" },
      {
        yieldFn: files.yieldToUi,
        onProgress: (progress) =>
          files.reportProgress(
            "Parsing TMX resource",
            file,
            `${progress.percent}% - ${progress.entries} ${entryLabel(progress.entries)}`
          )
      }
    );
    await files.reportProgress("Saving TM resource entries", file, `${entries.length} ${entryLabel(entries.length)}`);
    await repositories.importTmEntries(entries, {
      onProgress: importProgress(file, "Saving TM resource entries", entryLabel),
      onIndexProgress: importProgress(file, "Indexing TM resource entries", () => "index rows")
    });
    resources.markProjectsUsingDirty("tm", tmName, sourceLang, targetLang);
    await files.reportProgress("Refreshing resources", file);
    resources.open("tm", `${tmName}::${sourceLang}::${targetLang}`, { render: false, focus: false });
    await resources.refresh();
    status.set(`Imported ${entries.length} TM entries`, "saved");
  }

  async function importTbx(file) {
    files.assertSize(file, "TBX resource file");
    const { name: termBaseName, sourceLang, targetLang } = readTbForm();
    if (!termBaseName || !sourceLang || !targetLang) {
      alert("Enter a TB name, source language, and target language before importing.");
      return;
    }
    await files.reportProgress("Reading TBX resource", file);
    const text = await files.readText(file);
    await files.reportProgress("Parsing TBX resource", file);
    const terms = await parsers.parseTbx(
      text,
      { sourceLang, targetLang, termBaseName },
      {
        yieldFn: files.yieldToUi,
        onProgress: (progress) =>
          files.reportProgress(
            "Parsing TBX resource",
            file,
            `${progress.percent}% - ${progress.terms} ${termLabel(progress.terms)}`
          )
      }
    );
    await saveTermbaseTerms(file, terms, { termBaseName, sourceLang, targetLang });
    status.set(`Imported ${terms.length} terms`, "saved");
  }

  async function saveTermbaseTerms(file, terms, { termBaseName, sourceLang, targetLang }) {
    await files.reportProgress("Saving termbase resource terms", file, `${terms.length} ${termLabel(terms.length)}`);
    await repositories.importTerms(terms, {
      onProgress: importProgress(file, "Saving termbase resource terms", termLabel),
      onIndexProgress: importProgress(file, "Indexing termbase resource terms", () => "index rows")
    });
    resources.markProjectsUsingDirty("termbase", termBaseName, sourceLang, targetLang);
    await files.reportProgress("Refreshing resources", file);
    resources.open("tb", `${termBaseName}::${sourceLang}::${targetLang}`, {
      render: false,
      focus: false
    });
    await resources.refresh();
    await resources.refreshProjectTerms({ rerender: true });
  }

  async function importTermList(file) {
    files.assertSize(file, "Term list resource file");
    const { name: termBaseName, sourceLang, targetLang } = readTbForm();
    if (!termBaseName || !sourceLang || !targetLang) {
      alert("Enter a TB name, source language, and target language before importing.");
      return;
    }
    await files.reportProgress("Reading term list resource", file);
    const terms = await parseTermListFile(file, {
      sourceLang,
      targetLang,
      termBaseName,
      fileName: file.name
    });
    await saveTermbaseTerms(file, terms, { termBaseName, sourceLang, targetLang });
    status.set(`Imported ${terms.length} ${termLabel(terms.length)}`, "saved");
  }

  return Object.freeze({ importTmx, importTbx, importTermList });
}
