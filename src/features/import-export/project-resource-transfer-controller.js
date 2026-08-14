/**
 * Owns current-project TMX/TBX import/export and CSV/XLSX term-list import
 * orchestration. File decoding, parsers, repositories, resource dirtiness,
 * presentation refreshes, downloads, and activity persistence remain injected.
 *
 * @param {{
 *   session: { getProject: () => any },
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
 *     importTerms: (terms: any[], options: any) => Promise<any>,
 *     getAllByIndex: (store: string, index: string, value: string) => Promise<any[]>,
 *     listTerms: (query: any) => Promise<any[]>
 *   },
 *   resources: {
 *     mainTmName: () => string,
 *     projectTmNames: () => string[],
 *     selectedTermBaseName: () => string,
 *     primaryTermBaseName: () => string,
 *     projectTermBaseNames: () => string[],
 *     markProjectsUsingDirty: (type: string, name: string, sourceLang: string, targetLang: string) => unknown
 *   },
 *   refresh: {
 *     tmMatches: () => Promise<any>,
 *     projectTerms: (options: { rerender: boolean }) => Promise<any>,
 *     terms: () => Promise<any>
 *   },
 *   builders: { buildTmx: (entries: any[], options: any) => any, buildTbx: (terms: any[], options: any) => any },
 *   fileSafeName: (value: string) => string,
 *   download: (filename: string, content: any, type: string) => unknown,
 *   activity: { logOptionalProject: (type: string, summary: string, detail: any, label: string) => Promise<boolean> },
 *   status: {
 *     appendActivityWarning: (message: string, activityLogged: boolean) => string,
 *     exportMode: (mode: string, activityLogged: boolean) => string,
 *     set: (message: string, mode: string) => unknown
 *   }
 * }} options
 */
export function createProjectResourceTransferController(options) {
  const session = options?.session;
  const files = options?.files;
  const parsers = options?.parsers;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const refresh = options?.refresh;
  const builders = options?.builders;
  const fileSafeName = options?.fileSafeName;
  const download = options?.download;
  const activity = options?.activity;
  const status = options?.status;
  if (
    typeof session?.getProject !== "function" ||
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
    typeof repositories?.getAllByIndex !== "function" ||
    typeof repositories?.listTerms !== "function" ||
    typeof resources?.mainTmName !== "function" ||
    typeof resources?.projectTmNames !== "function" ||
    typeof resources?.selectedTermBaseName !== "function" ||
    typeof resources?.primaryTermBaseName !== "function" ||
    typeof resources?.projectTermBaseNames !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof refresh?.tmMatches !== "function" ||
    typeof refresh?.projectTerms !== "function" ||
    typeof refresh?.terms !== "function" ||
    typeof builders?.buildTmx !== "function" ||
    typeof builders?.buildTbx !== "function" ||
    typeof fileSafeName !== "function" ||
    typeof download !== "function" ||
    typeof activity?.logOptionalProject !== "function" ||
    typeof status?.appendActivityWarning !== "function" ||
    typeof status?.exportMode !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ProjectResourceTransferController requires session, file, parser, repository, resource, refresh, builder, download, activity, and status boundaries."
    );
  }

  function tmEntryLabel(count) {
    return `entr${count === 1 ? "y" : "ies"}`;
  }

  function termLabel(count) {
    return `term${count === 1 ? "" : "s"}`;
  }

  function tmImportProgress(file, phase) {
    return (progress) =>
      files.reportProgress(
        phase,
        file,
        files.progressDetail(
          progress.saved,
          progress.total,
          phase.startsWith("Indexing") ? "index rows" : tmEntryLabel(progress.saved)
        )
      );
  }

  function termImportProgress(file, phase) {
    return (progress) =>
      files.reportProgress(
        phase,
        file,
        files.progressDetail(
          progress.saved,
          progress.total,
          phase.startsWith("Indexing") ? "index rows" : termLabel(progress.saved)
        )
      );
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
    if (!session.getProject()) return;
    files.assertSize(file, "TMX file");
    await files.reportProgress("Reading TMX", file);
    const text = await files.readText(file);
    await files.reportProgress("Parsing TMX", file);
    const entries = await parsers.parseTmx(
      text,
      {
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        tmName: resources.mainTmName(),
        projectName: `${session.getProject().name} TMX import`
      },
      {
        yieldFn: files.yieldToUi,
        onProgress: (progress) =>
          files.reportProgress(
            "Parsing TMX",
            file,
            `${progress.percent}% - ${progress.entries} ${tmEntryLabel(progress.entries)}`
          )
      }
    );
    await files.reportProgress("Saving TM entries", file, `${entries.length} ${tmEntryLabel(entries.length)}`);
    await repositories.importTmEntries(entries, {
      onProgress: tmImportProgress(file, "Saving TM entries"),
      onIndexProgress: tmImportProgress(file, "Indexing TM entries")
    });
    resources.markProjectsUsingDirty(
      "tm",
      resources.mainTmName(),
      session.getProject().sourceLang,
      session.getProject().targetLang
    );
    await files.reportProgress("Refreshing TM matches", file);
    await refresh.tmMatches();
    const activityLogged = await activity.logOptionalProject(
      "resource-import",
      "TMX imported",
      { fileName: file.name, entryCount: entries.length, tmName: resources.mainTmName() },
      "TMX import"
    );
    status.set(
      status.appendActivityWarning(`Imported ${entries.length} TM entries`, activityLogged),
      status.exportMode("saved", activityLogged)
    );
  }

  async function exportTmx() {
    if (!session.getProject()) return;
    try {
      const tmNames = new Set(resources.projectTmNames());
      const entries = (
        await repositories.getAllByIndex(
          "tmEntries",
          "languagePair",
          `${session.getProject().sourceLang}::${session.getProject().targetLang}`
        )
      ).filter((entry) => tmNames.has(entry.tmName));
      download(
        `${fileSafeName(session.getProject().name)}_project-tms.tmx`,
        builders.buildTmx(entries, { ...session.getProject(), tmName: resources.mainTmName() }),
        "application/xml"
      );
      const activityLogged = await activity.logOptionalProject(
        "resource-export",
        "TMX exported",
        { entryCount: entries.length, tmNames: Array.from(tmNames) },
        "TMX export"
      );
      status.set(
        status.appendActivityWarning(
          `Exported ${entries.length} project TM ${tmEntryLabel(entries.length)}`,
          activityLogged
        ),
        status.exportMode("saved", activityLogged)
      );
    } catch (error) {
      status.set(error.message || "TMX export failed", "dirty");
    }
  }

  async function importTbx(file) {
    if (!session.getProject()) return;
    files.assertSize(file, "TBX file");
    await files.reportProgress("Reading TBX", file);
    const text = await files.readText(file);
    await files.reportProgress("Parsing TBX", file);
    const importedTerms = await parsers.parseTbx(
      text,
      {
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseName: resources.selectedTermBaseName()
      },
      {
        yieldFn: files.yieldToUi,
        onProgress: (progress) =>
          files.reportProgress(
            "Parsing TBX",
            file,
            `${progress.percent}% - ${progress.terms} ${termLabel(progress.terms)}`
          )
      }
    );
    await files.reportProgress("Saving terms", file, `${importedTerms.length} ${termLabel(importedTerms.length)}`);
    await repositories.importTerms(importedTerms, {
      onProgress: termImportProgress(file, "Saving terms"),
      onIndexProgress: termImportProgress(file, "Indexing terms")
    });
    resources.markProjectsUsingDirty(
      "termbase",
      resources.selectedTermBaseName(),
      session.getProject().sourceLang,
      session.getProject().targetLang
    );
    await files.reportProgress("Refreshing terms", file);
    await refresh.projectTerms({ rerender: true });
    await refresh.terms();
    const activityLogged = await activity.logOptionalProject(
      "resource-import",
      "TBX imported",
      {
        fileName: file.name,
        termCount: importedTerms.length,
        termBaseName: resources.selectedTermBaseName()
      },
      "TBX import"
    );
    status.set(
      status.appendActivityWarning(`Imported ${importedTerms.length} terms`, activityLogged),
      status.exportMode("saved", activityLogged)
    );
  }

  async function importTermList(file) {
    if (!session.getProject()) return;
    files.assertSize(file, "Term list file");
    const termBaseName = resources.selectedTermBaseName();
    await files.reportProgress("Reading term list", file);
    const importedTerms = await parseTermListFile(file, {
      sourceLang: session.getProject().sourceLang,
      targetLang: session.getProject().targetLang,
      termBaseName,
      fileName: file.name
    });
    await files.reportProgress("Saving terms", file, `${importedTerms.length} ${termLabel(importedTerms.length)}`);
    await repositories.importTerms(importedTerms, {
      onProgress: termImportProgress(file, "Saving terms"),
      onIndexProgress: termImportProgress(file, "Indexing terms")
    });
    resources.markProjectsUsingDirty(
      "termbase",
      termBaseName,
      session.getProject().sourceLang,
      session.getProject().targetLang
    );
    await files.reportProgress("Refreshing terms", file);
    await refresh.projectTerms({ rerender: true });
    await refresh.terms();
    const activityLogged = await activity.logOptionalProject(
      "resource-import",
      "Term list imported",
      { fileName: file.name, termCount: importedTerms.length, termBaseName },
      "Term list import"
    );
    status.set(
      status.appendActivityWarning(
        `Imported ${importedTerms.length} ${termLabel(importedTerms.length)}`,
        activityLogged
      ),
      status.exportMode("saved", activityLogged)
    );
  }

  async function exportTbx() {
    if (!session.getProject()) return;
    try {
      const exportedTerms = await repositories.listTerms({
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseNames: resources.projectTermBaseNames()
      });
      download(
        `${fileSafeName(session.getProject().name)}_project-termbases.tbx`,
        builders.buildTbx(exportedTerms, {
          ...session.getProject(),
          termBaseName: resources.primaryTermBaseName()
        }),
        "application/xml"
      );
      const activityLogged = await activity.logOptionalProject(
        "resource-export",
        "TBX exported",
        { termCount: exportedTerms.length, termBaseNames: resources.projectTermBaseNames() },
        "TBX export"
      );
      status.set(
        status.appendActivityWarning(
          `Exported ${exportedTerms.length} project ${termLabel(exportedTerms.length)}`,
          activityLogged
        ),
        status.exportMode("saved", activityLogged)
      );
    } catch (error) {
      status.set(error.message || "TBX export failed", "dirty");
    }
  }

  return Object.freeze({ importTmx, exportTmx, importTbx, importTermList, exportTbx });
}
