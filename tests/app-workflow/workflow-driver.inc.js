const runAppWorkflowTest = LOOPCAT_TEST_BUILD ? async function runAppWorkflowTest() {
  if (window.location.hash !== "#app-workflow-test") return;
  const out = [];
  const publishProgress = () => {
    let output = document.querySelector("#appWorkflowTestResults");
    if (!output) {
      output = document.createElement("pre");
      output.id = "appWorkflowTestResults";
      output.hidden = true;
      document.body.append(output);
    }
    output.textContent = `APP WORKFLOW TEST RUNNING\n${out.join("\n")}`;
  };
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    out.push(`PASS ${label}`);
    window.__loopcatAppWorkflowProgress = label;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.document.title = `LoopCAT Browser Test Runner - APP WORKFLOW PROGRESS ${label}`;
      }
    } catch {}
    publishProgress();
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10000) {
      const value = predicate();
      if (value) return value;
      await delay(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const publish = (ok, error = null) => {
    const resultText = ok
      ? `APP WORKFLOW TEST PASS\n${out.join("\n")}`
      : `APP WORKFLOW TEST FAIL\n${error?.stack || error?.message || error}`;
    let output = document.querySelector("#appWorkflowTestResults");
    if (!output) {
      output = document.createElement("pre");
      output.id = "appWorkflowTestResults";
      output.hidden = true;
      document.body.append(output);
    }
    output.textContent = resultText;
    window.parent?.postMessage({ type: "loopcat-test-result", name: "App workflow", text: resultText }, "*");
  };

  try {
    assert(Boolean(document.querySelector('link[rel="manifest"]')), "installable app manifest linked");
    const workflowDatabase = await storageApi.openDatabase();
    assert(
      workflowDatabase.version === 6 &&
        workflowDatabase.objectStoreNames.contains("trashEntries") &&
        storageConstants.PROJECT_PACKAGE_SCHEMA_VERSION === 5 &&
        storageConstants.BACKUP_SCHEMA_VERSION === 6,
      "schema 6 adds Trash while project packages remain schema 5"
    );
    const productionMockAiSelector = "#mock" + "AiSuggestionBtn";
    assert(!document.querySelector(productionMockAiSelector), "production UI does not expose mock AI suggestions");
    assert(
      Boolean(document.querySelector('label.compact-field input#tmResourceNameInput')) &&
        Boolean(document.querySelector('#sourceTermInput[aria-label="Source term"]')),
      "resource creation controls keep persistent and assistive labels"
    );
    const originalStorageDurability = state.storageDurability;
    state.storageDurability = { checked: true, supported: true, persisted: true, requested: true, usageBytes: 10 * 1024 * 1024, quotaBytes: 1000 * 1024 * 1024 };
    renderWorkspaceStatus();
    assert(
      els.workspaceHealth.textContent.includes("Storage: persistent") &&
        els.workspaceHealth.textContent.includes("10 MB of 1000 MB used"),
      "persistent storage status is visible in workspace health"
    );
    state.storageDurability = { checked: true, supported: true, persisted: false, requested: true, usageBytes: 920 * 1024 * 1024, quotaBytes: 1000 * 1024 * 1024 };
    renderWorkspaceStatus();
    assert(
      els.workspaceHealth.textContent.includes("Storage: best-effort") &&
        els.workspaceHealth.textContent.includes("export project packages") &&
        els.workspaceHealth.textContent.includes("Local storage is nearly full"),
      "best-effort and nearly-full storage states warn before long offline projects grow"
    );
    state.storageDurability = originalStorageDurability;
    renderWorkspaceStatus();
    let finishLongImport = null;
    const longImportFile = { name: "large-import.docx", size: 12 * 1024 * 1024 };
    const longImportTask = runFileImportTask("Project file import", () => new Promise((resolve) => {
      setImportProgress("Reading large project file", longImportFile);
      finishLongImport = resolve;
    }));
    assert(
      importExportController?.getState?.().busy &&
        els.projectFileImportBtn.disabled &&
        els.docxInput.disabled &&
        els.localizationInput.disabled &&
        els.projectPackageImportInput.disabled &&
        els.backupImportInput.disabled &&
        els.syncWorkspaceBtn.disabled,
      "checked import/export controller owns shared busy state while an import task runs"
    );
    assert(
      els.saveStatus.textContent.includes("Project file import: Reading large project file") &&
        els.saveStatus.textContent.includes("large-import.docx") &&
        els.saveStatus.textContent.includes(formatFileSize(longImportFile.size)),
      "active import progress reports phase, file name, and file size"
    );
    let overlappingImportRan = false;
    const overlappingImportResult = await runFileImportTask("TMX import", () => {
      overlappingImportRan = true;
    });
    assert(!overlappingImportResult && !overlappingImportRan && els.saveStatus.textContent.includes("still running"), "overlapping import task is blocked before it mutates project data");
    let overlappingWorkspaceSyncRan = false;
    const overlappingWorkspaceSyncResult = await runFileImportTask("Workspace sync", () => {
      overlappingWorkspaceSyncRan = true;
    });
    assert(!overlappingWorkspaceSyncResult && !overlappingWorkspaceSyncRan && els.saveStatus.textContent.includes("still running"), "overlapping workspace sync is blocked before it reads package data");
    const importBeforeUnloadEvent = {
      prevented: false,
      returnValue: null,
      preventDefault() {
        this.prevented = true;
      }
    };
    handleBeforeUnload(importBeforeUnloadEvent);
    assert(importBeforeUnloadEvent.prevented && importBeforeUnloadEvent.returnValue === "", "active import task warns before closing");
    finishLongImport?.();
    assert(
      (await longImportTask) &&
        !importExportController?.getState?.().busy &&
        !els.projectFileImportBtn.disabled &&
        !els.docxInput.disabled &&
        !els.localizationInput.disabled &&
        !els.projectPackageImportInput.disabled &&
        !els.backupImportInput.disabled,
      "checked import/export controller restores import controls after an import task finishes"
    );
    const splitFixture = "First <b>bold part</b> continues. Second sentence.";
    const splitFixtureIndex = mappedSourceSplitIndex(splitFixture, "Hedef metin burada daha uzun olabilir.", 16);
    assert(splitFixtureIndex > 0 && splitFixtureIndex < splitFixture.length && !splitProtectedRanges(splitFixture).some((range) => splitFixtureIndex > range.start && splitFixtureIndex < range.end), "segment split maps target cursor to safe source boundary");
    els.newProjectBtn.focus();
    await openProjectDialog("create");
    assert(
      projectDialogController?.getMode?.() === "create" &&
        els.projectDialogTitle.textContent === "New project" &&
        els.saveProjectBtn.textContent === "Create",
      "checked project dialog controller prepares create mode before opening"
    );
    assert(document.activeElement === document.querySelector("#projectNameInput"), "project dialog moves focus to its first required field");
    const catalanTurkishQuickPair = Array.from(els.frequentLanguagePairs.querySelectorAll("button"))
      .find((button) => button.dataset.sourceLang === "ca" && button.dataset.targetLang === "tr");
    const languageOptionValues = Array.from(els.languageOptions.querySelectorAll("option")).map((option) => option.value);
    assert(
      Boolean(catalanTurkishQuickPair) &&
        normalizeLanguageInputValue("English (en)") === "en" &&
        normalizeLanguageInputValue("Turkish (tr)") === "tr" &&
        normalizeLanguageInputValue("English (USA)") === "en-US" &&
        normalizeLanguageInputValue("Spanish (Latin America) (es-419)") === "es-419" &&
        normalizeLanguageInputValue("Urdu (Latin script) (ur-Latn-PK)") === "ur-Latn-PK" &&
        languageOptionValues.length > 500 &&
        languageOptionValues.includes("Acehnese (ace-ID)") &&
        languageOptionValues.includes("Catalan (Valencia) (cav-ES)") &&
        languageOptionValues.includes("Spanish (Latin America) (es-419)") &&
        languageOptionValues.includes("Urdu (Latin script) (ur-Latn-PK)"),
      "language pair dropdowns expose bundled locale labels while normalizing to codes"
    );
    catalanTurkishQuickPair.click();
    assert(
      projectDialogValues().sourceLang === "ca" &&
        projectDialogValues().targetLang === "tr" &&
        document.querySelector("#sourceLangInput").value === languageOptionValue("ca") &&
        document.querySelector("#targetLangInput").value === languageOptionValue("tr"),
      "frequent language pair chips update project language fields as normalized codes"
    );
    document.querySelector("#projectNameInput").value = "";
    document.querySelector("#sourceLangInput").value = languageOptionValue("en");
    document.querySelector("#targetLangInput").value = languageOptionValue("tr");
    const invalidDialogProjectCount = state.projects.length;
    const invalidDialogProject = await saveProjectFromDialog();
    assert(
      !invalidDialogProject &&
        state.projects.length === invalidDialogProjectCount &&
        els.saveStatus.textContent === "Complete required project fields.",
      "project dialog blocks missing required fields before creation"
    );
    els.projectDialog.close();
    await Promise.resolve();
    assert(document.activeElement === els.newProjectBtn, "project dialog restores focus to its opener");

    els.aboutBtn.focus();
    els.aboutBtn.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      els.aboutDialog.open && document.activeElement === els.closeAboutBtn,
      "dialog lifecycle controller opens About with contained initial focus"
    );
    els.closeAboutBtn.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      !els.aboutDialog.open && document.activeElement === els.aboutBtn,
      "dialog lifecycle controller restores the About opener after close"
    );

    els.diagnosticsBtn.focus();
    els.diagnosticsBtn.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      els.diagnosticsDialog.open && document.activeElement === els.closeDiagnosticsBtn,
      "dialog lifecycle controller opens Diagnostics without taking ownership of feature data"
    );
    els.closeDiagnosticsBtn.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      !els.diagnosticsDialog.open && document.activeElement === els.workspaceMenuSummary,
      "dialog lifecycle controller restores the visible Diagnostics menu trigger after close"
    );

    els.trashBtn.focus();
    const trashOpenResult = await openTrash();
    assert(
      trashOpenResult &&
        els.trashDialog.open &&
        document.activeElement === els.closeTrashBtn &&
        Boolean(els.trashList.textContent.trim()),
      "dialog lifecycle controller prepares Trash before opening with contained focus"
    );
    els.trashDialog.dispatchEvent(new Event("cancel"));
    els.trashDialog.close();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      !els.trashDialog.open && document.activeElement === els.trashBtn,
      "dialog lifecycle controller restores the Trash opener after cancel and close"
    );

    const project = await createProject({
      name: `Workflow ${Date.now()}`,
      domain: "Regression",
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await loadProjects(false);
    await openProject(project.id);
    assert(state.project?.id === project.id, "real app project creation");
    els.localAiSourceCodeInput.value = "en";
    els.localAiSourceLangInput.value = languageOptionValue("es");
    els.localAiSourceLangInput.dispatchEvent(new Event("change", { bubbles: true }));
    els.localAiTargetLangInput.value = "Turkish";
    els.localAiTargetCodeInput.value = languageOptionValue("ca");
    els.localAiTargetCodeInput.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    const syncedLocalAiSettings = localAiSettingsFromForm();
    assert(
      syncedLocalAiSettings.sourceCode === "es" &&
        syncedLocalAiSettings.sourceLanguage === languageNameForUi("es") &&
        syncedLocalAiSettings.targetCode === "ca" &&
        syncedLocalAiSettings.targetLanguage === languageNameForUi("ca"),
      "local AI language dropdowns keep language names and codes synchronized for prompts"
    );
    const malformedResourceSummary = projectResourceSummary({
      ...state.project,
      resourceLinks: [
        null,
        { id: "legacy-workflow-main-tm", type: "tm", name: "Workflow TM", role: "main" },
        { id: "legacy-workflow-invalid-link", type: "glossary", name: "Ignored glossary" },
        { id: "legacy-workflow-tb", type: "termbase", name: "Workflow TB" },
        { id: "legacy-workflow-duplicate-tm", type: "tm", name: "Workflow TM" }
      ]
    });
    assert(
      malformedResourceSummary.mainTm === "Workflow TM" &&
        malformedResourceSummary.tmNames.length === 1 &&
        malformedResourceSummary.tbNames.includes("Workflow TB"),
      "local project resource summaries tolerate malformed legacy links"
    );
    const delimiterResourceKey = resourceKey({ tmName: "Workflow::TM", sourceLang: "en", targetLang: "tr" }, "tmName");
    const delimiterResourceInfo = resourceLabelFromKey(delimiterResourceKey);
    assert(
      delimiterResourceKey === "Workflow::TM::en::tr" &&
        delimiterResourceInfo.name === "Workflow::TM" &&
        delimiterResourceInfo.sourceLang === "en" &&
        delimiterResourceInfo.targetLang === "tr",
      "resource keys preserve names containing double-colon delimiters"
    );
    const legacyDocumentManifest = projectDocumentManifest({
      ...state.project,
      sourceFileName: "legacy-source.html",
      documents: [
        null,
        { id: "legacy-workflow-doc", name: "Legacy workflow.HTML", type: "HTML" },
        { id: "legacy-workflow-doc", name: "Duplicate legacy workflow.html", type: "html" },
        { name: "Missing id.html", type: "html" }
      ]
    });
    assert(
      legacyDocumentManifest.length === 1 &&
        legacyDocumentManifest[0].id === "legacy-workflow-doc" &&
        legacyDocumentManifest[0].type === "html",
      "local project document manifests tolerate malformed legacy entries"
    );
    const originalWorkflowProject = state.project;
    state.project = { ...state.project, documents: { malformed: true } };
    renderProjectHome();
    renderDocumentFilter();
    assert(
      projectDocuments().every((documentInfo) => documentInfo.id) &&
        !els.projectFileList.textContent.includes("[object Object]"),
      "project file views tolerate malformed legacy document manifests"
    );
    state.project = originalWorkflowProject;
    const originalProjectDomain = state.project.domain;
    els.projectDomainEditInput.value = "Unstored workflow domain";
    setHiddenSegmentField(state.project, PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG, true);
    const failedDomainSave = await saveProjectDomainFromForm();
    assert(
      !failedDomainSave &&
        els.saveStatus.textContent.includes("Simulated project domain save failure") &&
        state.project.domain === originalProjectDomain &&
        els.projectDomainEditInput.value === "Unstored workflow domain",
      "project domain save failure reports visible status without changing project metadata"
    );
    Reflect.deleteProperty(state.project, PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG);
    els.projectDomainEditInput.value = "Workflow saved domain";
    const successfulDomainSave = await saveProjectDomainFromForm();
    assert(successfulDomainSave && state.project.domain === "Workflow saved domain", "project domain save persists metadata");
    await openProjectDialog("edit");
    assert(
      projectDialogController?.isEditing?.() &&
        els.projectDialogTitle.textContent === "Project settings" &&
        els.saveProjectBtn.textContent === "Save settings" &&
        els.projectAdvancedOptions.open,
      "checked project dialog controller prepares edit mode from current project state"
    );
    els.projectAiOptions.open = true;
    setOpusCatConnectionHelpVisible(true);
    els.localAiOpusCatHelpBtn.focus();
    els.localAiOpusCatHelpBtn.click();
    await yieldToUi();
    assert(
      els.opusCatHelpDialog.open &&
        document.activeElement === els.closeOpusCatHelpBtn &&
        els.projectDialog.open,
      "OPUS-CAT help opens through the shared lifecycle with initial focus above Project settings"
    );
    els.closeOpusCatHelpBtn.click();
    await yieldToUi();
    assert(
      !els.opusCatHelpDialog.open &&
        els.projectDialog.open &&
        document.activeElement === els.localAiOpusCatHelpBtn,
      "OPUS-CAT help close restores focus to the visible connection-help entry point"
    );
    setOpusCatConnectionHelpVisible(false);
    const legacyDialogSettings = collectProjectResourceSettings({
      ...state.project,
      resourceLinks: [
        null,
        { id: "legacy-dialog-main-tm", type: "tm", name: mainTmName(state.project), role: "main" },
        { id: "legacy-dialog-invalid-link", type: "glossary", name: "Ignored glossary" },
        { id: "legacy-dialog-tb", type: "termbase", name: primaryTermBaseName(state.project) }
      ]
    });
    assert(
      legacyDialogSettings.resourceLinks.some((link) => link.id === "legacy-dialog-main-tm") &&
        legacyDialogSettings.resourceLinks.some((link) => link.id === "legacy-dialog-tb") &&
        !legacyDialogSettings.resourceLinks.some((link) => link.type === "glossary"),
      "project settings dialog tolerates malformed legacy resource links"
    );
    document.querySelector("#projectDomainInput").value = "Settings activity warning";
    if (els.saveProjectToFolderInput) els.saveProjectToFolderInput.checked = false;
    setHiddenSegmentField(els.projectForm, PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG, true);
    const settingsActivityProject = await saveProjectFromDialog();
    assert(
      settingsActivityProject?.id === project.id &&
        state.project.domain === "Settings activity warning" &&
        els.saveStatus.textContent.includes("activity log failed") &&
        state.workspaceDirtyProjectIds.has(project.id),
      "project settings activity log failure reports warning after successful settings save"
    );
    Reflect.deleteProperty(els.projectForm, PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG);

    const file = new File(["<!doctype html><html><body><p>Hello world.</p></body></html>"], "workflow.html", { type: "text/html" });
    await importLocalization(file);
    const documentInfo = state.project.documents.find((item) => item.name === "workflow.html");
    assert(Boolean(documentInfo), "real app HTML file import");
    const workflowSegmentIndex = state.segments.findIndex((segment) => segment.documentId === documentInfo.id);
    state.segments[workflowSegmentIndex].target = "Merhaba dunya.";
    state.segments[workflowSegmentIndex].status = "draft";
    touchSegment(state.segments[workflowSegmentIndex]);
    await saveSegment(state.segments[workflowSegmentIndex]);
    state.project = await updateProject({
      ...state.project,
      documents: state.project.documents.map((item) => (item.id === documentInfo.id ? { ...item, type: "HTML" } : item))
    });
    state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
    selectApplicationDocument(documentInfo.id);
    const caseInsensitiveTypeDownloads = [];
    const originalCaseCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalCaseAnchorClick = HTMLAnchorElement.prototype.click;
    const originalCaseConfirm = window.confirm;
    URL.createObjectURL = (blob) => {
      caseInsensitiveTypeDownloads.push({ type: blob.type, blob });
      return originalCaseCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopCaseInsensitiveTypeClick() {};
    window.confirm = () => true;
    try {
      await exportLocalization();
      assert(
        caseInsensitiveTypeDownloads.some((item) => item.type === "text/html") &&
          projectDocuments().find((item) => item.id === documentInfo.id)?.type === "html",
        "localization export normalizes stored document type casing"
      );
    } finally {
      URL.createObjectURL = originalCaseCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalCaseAnchorClick;
      window.confirm = originalCaseConfirm;
    }
    state.project = await updateProject({
      ...state.project,
      documents: state.project.documents.map((item) => (item.id === documentInfo.id ? { ...item, type: "html" } : item))
    });
    state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
    const roundTripLocalizationFixture = async (name, sourceText, targetTextValue, expectedText = targetTextValue) => {
      const parsed = await parseLocalizationFile(new File([sourceText], name, { type: "text/plain" }));
      const translated = parsed.segments.map((segment) => ({
        ...segment,
        target: segment.text === "Hello world" || segment.source === "Hello world" ? targetTextValue : (segment.target || segment.text),
        status: "draft"
      }));
      const output = await buildLocalizationFile(parsed.documentType, translated, parsed.structure);
      const outputText = typeof output === "string" ? output : new TextDecoder().decode(output);
      assert(outputText.includes(expectedText), `${name} other format round-trip`);
    };
    const sdlxliffFixture = `<?xml version="1.0" encoding="UTF-8"?><xliff version="1.2"><file original="workflow.sdlxliff" source-language="en" target-language="tr"><body><trans-unit id="1"><source>Hello world</source><target></target></trans-unit></body></file></xliff>`;
    const sdlxliffParsed = await parseXliffFile(new File([sdlxliffFixture], "workflow.sdlxliff", { type: "application/x-xliff+xml" }));
    assert(sdlxliffParsed.documentType === "sdlxliff", "SDLXLIFF import preserves document type");
    const sdlxliffOutput = buildTargetXliff(state.project, sdlxliffParsed.segments.map((segment) => ({ ...segment, target: "Merhaba dunya", status: "draft" })), sdlxliffParsed.structure);
    assert(sdlxliffOutput.includes("Merhaba dunya"), "SDLXLIFF target export updates original XLIFF structure");
    await roundTripLocalizationFixture("workflow.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello world</p></body></html>`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.txml", `<txml><segment><source>Hello world</source><target></target></segment></txml>`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.resx", `<root><data name="Greeting"><value>Hello world</value></data></root>`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.ts", `<TS><context><message><source>Hello world</source><translation type="unfinished"></translation></message></context></TS>`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.properties", "greeting=Hello world", "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello world\n", "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.txt", "Hello world\n\nSecond paragraph", "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.dtd", `<!ENTITY greeting "Hello world">`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.php", `<?php return ["greeting" => "Hello world"];`, "Merhaba dunya");
    await roundTripLocalizationFixture("workflow.mif", "<String `Hello world'>", "Merhaba dunya");
    assert(
      els.fileEncodingSelect &&
        Array.from(els.fileEncodingSelect.options).some((option) => option.value === "windows-1256") &&
        Array.from(els.fileEncodingSelect.options).some((option) => option.value === "shift_jis"),
      "text import encoding override offers Arabic and Japanese legacy encodings"
    );
    const windows1254Text = "Istanbul ışık\n\nÇeviri";
    const windows1254Bytes = encodingApi.encodeText(windows1254Text, "windows-1254").content;
    const windows1254Parsed = await parseLocalizationFile(new File([windows1254Bytes], "workflow-windows-1254.txt", { type: "text/plain" }), { encoding: "windows-1254" });
    assert(
      windows1254Parsed.segments[0]?.text === "Istanbul ışık" &&
        windows1254Parsed.structure?.sourceEncoding?.encoding === "windows-1254",
      "Windows-1254 Turkish text import preserves dotted and dotless Turkish characters"
    );
    const windows1254Output = await buildLocalizationFile("txt", [{ ...windows1254Parsed.segments[0], target: "Işık çıktı" }], windows1254Parsed.structure);
    assert(
      windows1254Output instanceof Uint8Array &&
        encodingApi.decodeTextBytes(windows1254Output, { encoding: "windows-1254" }).text.includes("Işık çıktı"),
      "text export preserves single-byte legacy encoding when every target character is encodable"
    );
    const arabicBytes = encodingApi.encodeText("سلام", "windows-1256").content;
    const arabicParsed = await parseLocalizationFile(new File([arabicBytes], "workflow-arabic.txt", { type: "text/plain" }), { encoding: "windows-1256" });
    assert(arabicParsed.segments[0]?.text === "سلام", "Windows-1256 Arabic text import decodes Arabic script");
    const cyrillicBytes = encodingApi.encodeText("Привет", "windows-1251").content;
    const cyrillicParsed = await parseLocalizationFile(new File([cyrillicBytes], "workflow-cyrillic.txt", { type: "text/plain" }), { encoding: "windows-1251" });
    assert(cyrillicParsed.segments[0]?.text === "Привет", "Windows-1251 Cyrillic text import decodes Cyrillic script");
    const shiftJisBytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
    const shiftJisParsed = await parseLocalizationFile(new File([shiftJisBytes], "workflow-shift-jis.txt", { type: "text/plain" }), { encoding: "shift_jis" });
    assert(shiftJisParsed.segments[0]?.text === "日本語", "Shift_JIS Japanese text import decodes Japanese script");
    const utf16Bytes = encodingApi.encodeText("שלום", { encoding: "utf-16le", bom: true }).content;
    const utf16Parsed = await parseLocalizationFile(new File([utf16Bytes], "workflow-utf16.txt", { type: "text/plain" }));
    assert(
      utf16Parsed.segments[0]?.text === "שלום" &&
        utf16Parsed.structure?.sourceEncoding?.encoding === "utf-16le" &&
        utf16Parsed.structure?.sourceEncoding?.bom,
      "UTF-16 BOM text import detects encoding before parsing"
    );
    const windows1254TmxText = `<?xml version="1.0" encoding="windows-1254"?>
<tmx version="1.4">
  <body>
    <tu>
      <tuv xml:lang="en"><seg>Light source</seg></tuv>
      <tuv xml:lang="tr"><seg>I\u015f\u0131k \u00e7\u0131kt\u0131</seg></tuv>
    </tu>
  </body>
</tmx>`;
    const windows1254TmxEntries = parseTmx(
      await readImportTextFile(new File([encodingApi.encodeText(windows1254TmxText, "windows-1254").content], "workflow-windows-1254.tmx", { type: "application/xml" })),
      { sourceLang: "en", targetLang: "tr", tmName: "Encoding TM", projectName: "Encoding test" }
    );
    assert(windows1254TmxEntries[0]?.target === "I\u015f\u0131k \u00e7\u0131kt\u0131", "TMX import decodes Windows-1254 translation memory text");
    const windows1254TbxText = `<?xml version="1.0" encoding="windows-1254"?>
<tbx>
  <text>
    <body>
      <termEntry id="encoding-term">
        <langSet xml:lang="en"><tig><term>light term</term></tig></langSet>
        <langSet xml:lang="tr"><tig><term>\u0131\u015f\u0131k terimi</term></tig></langSet>
        <descrip type="context">\u00c7al\u0131\u015fma notu</descrip>
      </termEntry>
    </body>
  </text>
</tbx>`;
    const windows1254TbxTerms = parseTbx(
      await readImportTextFile(new File([encodingApi.encodeText(windows1254TbxText, "windows-1254").content], "workflow-windows-1254.tbx", { type: "application/xml" })),
      { sourceLang: "en", targetLang: "tr", termBaseName: "Encoding TB" }
    );
    assert(
      windows1254TbxTerms[0]?.targetTerm === "\u0131\u015f\u0131k terimi" &&
        windows1254TbxTerms[0]?.notes === "\u00c7al\u0131\u015fma notu",
      "TBX import decodes Windows-1254 termbase text"
    );
    await setActiveSegment(workflowSegmentIndex);
    const regionalLocaleTmx = `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <body>
    <tu>
      <tuv xml:lang="en-US"><seg>Hello world.</seg></tuv>
      <tuv xml:lang="tr-TR"><seg>Merhaba dunya.</seg></tuv>
    </tu>
    <tu>
      <tuv><seg>No locale TM source.</seg></tuv>
      <tuv><seg>Yerelsiz TM hedefi.</seg></tuv>
    </tu>
  </body>
</tmx>`;
    const regionalLocaleTmxOk = await runFileImportTask("TMX import", () => handleTmxImport(new File([regionalLocaleTmx], "workflow-regional.tmx", { type: "application/xml" })));
    const importedRegionalTmEntries = await listTmEntries({ sourceLang: "en", targetLang: "tr", tmNames: [mainTmName()] });
    assert(
      regionalLocaleTmxOk &&
        importedRegionalTmEntries.some((entry) => entry.source === "Hello world." && entry.target === "Merhaba dunya." && entry.sourceLang === "en" && entry.targetLang === "tr") &&
        importedRegionalTmEntries.some((entry) => entry.source === "No locale TM source." && entry.target === "Yerelsiz TM hedefi."),
      "TMX import accepts regional and missing locale metadata while storing project languages"
    );
    assert(
      Array.from(els.tmMatches.querySelectorAll(".match-card")).some((card) => card.textContent.includes("100%") && card.textContent.includes("Merhaba dunya.")),
      "TMX import refreshes sidebar matches with match rates"
    );
    const regionalLocaleTbx = `<?xml version="1.0" encoding="UTF-8"?>
<tbx>
  <text>
    <body>
      <termEntry id="regional-term">
        <langSet xml:lang="en-GB"><tig><term>Hello</term></tig></langSet>
        <langSet xml:lang="tr-TR"><tig><term>Merhaba</term></tig></langSet>
      </termEntry>
      <termEntry id="missing-locale-term">
        <langSet><tig><term>world</term></tig></langSet>
        <langSet><tig><term>dunya</term></tig></langSet>
      </termEntry>
    </body>
  </text>
</tbx>`;
    const regionalLocaleTbxOk = await runFileImportTask("TBX import", () => handleTbxImport(new File([regionalLocaleTbx], "workflow-regional.tbx", { type: "application/xml" })));
    const importedRegionalTerms = await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: projectTermBaseNames() });
    assert(
      regionalLocaleTbxOk &&
        importedRegionalTerms.some((term) => term.sourceTerm === "Hello" && term.targetTerm === "Merhaba" && term.sourceLang === "en" && term.targetLang === "tr") &&
        importedRegionalTerms.some((term) => term.sourceTerm === "world" && term.targetTerm === "dunya"),
      "TBX import accepts regional and missing locale metadata while storing project languages"
    );
    assert(
      Array.from(els.termSuggestions.querySelectorAll(".term-card")).some((card) => card.textContent.includes("Hello") && card.textContent.includes("Merhaba")),
      "TBX import refreshes termbase sidebar suggestions"
    );
    const previousEncodingSelection = els.fileEncodingSelect.value;
    els.fileEncodingSelect.value = "windows-1254";
    try {
      const windows1254TermCsvText = "source,target,notes\nlight,\u0131\u015f\u0131k,\u00c7al\u0131\u015fma notu";
      const windows1254CsvTerms = await parseTermListFile(
        new File([encodingApi.encodeText(windows1254TermCsvText, "windows-1254").content], "workflow-windows-1254.csv", { type: "text/csv" }),
        { sourceLang: "en", targetLang: "tr", termBaseName: "Encoding TB", fileName: "workflow-windows-1254.csv" }
      );
      assert(
        windows1254CsvTerms[0]?.targetTerm === "\u0131\u015f\u0131k" &&
          windows1254CsvTerms[0]?.notes === "\u00c7al\u0131\u015fma notu",
        "CSV term list import uses manual Windows-1254 override for terminology text"
      );
    } finally {
      els.fileEncodingSelect.value = previousEncodingSelection || "auto";
    }
    const openXmlBytes = buildBilingualDocx(
      { name: "Workflow OpenXML", sourceLang: "en", targetLang: "tr" },
      [{ source: "Hello world", target: "", status: "empty" }]
    );
    const docmParsed = await parseLocalizationFile(new File([openXmlBytes], "workflow.docm", { type: "application/vnd.ms-word.document.macroEnabled.12" }));
    const docmTranslated = docmParsed.segments.map((segment) => ({
      ...segment,
      target: segment.text.includes("Hello world") ? "Merhaba dunya" : segment.text,
      status: "draft"
    }));
    const docmOutput = await buildLocalizationFile(docmParsed.documentType, docmTranslated, docmParsed.structure);
    const docmRoundTrip = await parseLocalizationFile(new File([docmOutput], "workflow.docm", { type: "application/vnd.ms-word.document.macroEnabled.12" }));
    assert(docmRoundTrip.segments.some((segment) => segment.text.includes("Merhaba dunya")), "DOCM OpenXML package round-trips translated text");
    const metadataOnlyDocument = { id: `doc-empty-${Date.now()}`, name: "metadata-only.html", type: "html" };
    state.project = await updateProject({
      ...state.project,
      documents: [...(state.project.documents || []), metadataOnlyDocument]
    });
    state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
    renderProjectHome();
    renderDocumentFilter();
    assert(
      projectDocuments().some((item) => item.id === metadataOnlyDocument.id) &&
        els.projectFileList.textContent.includes("metadata-only.html") &&
        Array.from(els.documentFilter.options).some((option) => option.value === metadataOnlyDocument.id),
      "metadata-only project documents remain visible without segment rows"
    );
    const originalMetadataOnlyConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const deletedMetadataOnlyDocument = await confirmDeleteFile(metadataOnlyDocument);
      assert(
        deletedMetadataOnlyDocument &&
          !projectDocuments().some((item) => item.id === metadataOnlyDocument.id) &&
          !Array.from(els.documentFilter.options).some((option) => option.value === metadataOnlyDocument.id),
        "metadata-only project documents can be deleted without orphan segments"
      );
    } finally {
      window.confirm = originalMetadataOnlyConfirm;
    }
    const atomicImportDocumentCount = state.project.documents.length;
    state.project.__atomicImportFailureProbe = () => {};
    let atomicImportError = "";
    try {
      await importLocalization(new File(["<!doctype html><html><body><p>Atomic import failure.</p></body></html>"], "workflow-atomic-import-failure.html", { type: "text/html" }));
    } catch (error) {
      atomicImportError = error.message || String(error);
    } finally {
      delete state.project.__atomicImportFailureProbe;
    }
    const storedProjectAfterAtomicImportFailure = (await listProjects()).find((item) => item.id === project.id);
    const storedSegmentsAfterAtomicImportFailure = await getProjectSegments(project.id);
    assert(
      atomicImportError &&
        state.project.documents.length === atomicImportDocumentCount &&
        (storedProjectAfterAtomicImportFailure?.documents || []).length === atomicImportDocumentCount &&
        !storedSegmentsAfterAtomicImportFailure.some((segment) => segment.documentName === "workflow-atomic-import-failure.html"),
      "file import metadata failure leaves no orphan segments"
    );
    setHiddenSegmentField(state, IMPORT_ACTIVITY_FAILURE_TEST_FLAG, true);
    const importActivityFailureDocumentCount = state.project.documents.length;
    await importLocalization(new File(["<!doctype html><html><body><p>Import activity warning.</p></body></html>"], "workflow-import-activity-warning.html", { type: "text/html" }));
    const importActivityFailureDocument = state.project.documents.find((item) => item.name === "workflow-import-activity-warning.html");
    const importActivityFailureSegmentIndex = state.segments.findIndex((segment) => segment.documentId === importActivityFailureDocument?.id);
    assert(
      Boolean(importActivityFailureDocument) &&
        state.project.documents.length === importActivityFailureDocumentCount + 1 &&
        importActivityFailureSegmentIndex >= 0 &&
        els.saveStatus.textContent.includes("activity log failed") &&
        state.workspaceDirtyProjectIds.has(project.id),
      "localization import activity log failure reports warning after successful import"
    );
    assert(
      "IMPORT".toLocaleLowerCase("tr") !== "import" &&
        projectHasDocumentNamed("WORKFLOW-IMPORT-ACTIVITY-WARNING.HTML"),
      "duplicate file detection is stable under Turkish locale casing"
    );
    Reflect.deleteProperty(state, IMPORT_ACTIVITY_FAILURE_TEST_FLAG);
    const docxLandingBytes = buildBilingualDocx(
      { name: "Workflow DOCX landing", sourceLang: "en", targetLang: "tr" },
      [{ source: "DOCX import landing source.", target: "", status: "empty" }]
    );
    await importDocx(new File([docxLandingBytes], "workflow-docx-landing.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const docxLandingDocument = state.project.documents.find((item) => item.name === "workflow-docx-landing.docx");
    assert(
      docxLandingDocument &&
        currentDocumentId() === docxLandingDocument.id &&
        els.documentFilter.value === docxLandingDocument.id &&
        currentActiveIndex() >= 0 &&
        state.segments[currentActiveIndex()]?.documentId === docxLandingDocument.id,
      "DOCX import selects newly imported document"
    );
    const completedDocxLandingSegments = state.segments
      .filter((segment) => segment.documentId === docxLandingDocument.id)
      .map((segment) => ({ ...segment, target: segment.source || "DOCX landing target", status: "draft" }));
    await saveSegments(completedDocxLandingSegments);
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
    updateSegmentDraft(importActivityFailureSegmentIndex, "İçe aktarma etkinlik uyarısı hedefi");
    await flushPendingSegmentSaves(project.id);
    await openProjectFile(documentInfo.id);
    state.inspectorOpen = true;
    verticalFeatureState?.inspector?.setContext?.({ tab: "ai" });
    renderEditor();
    els.openProjectAiSettingsBtn.focus();
    els.openProjectAiSettingsBtn.click();
    await waitFor(
      () => els.projectDialog.open && els.projectAiOptions.open && document.activeElement === els.localAiPresetSelect,
      "project AI settings deep link"
    );
    assert(
      projectDialogController?.isEditing?.() && els.projectAdvancedOptions.open,
      "project dialog controller opens the requested AI settings context"
    );
    els.cancelProjectBtn.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(
      document.activeElement === els.openProjectAiSettingsBtn,
      "project dialog controller restores the AI settings opener after close"
    );
    verticalFeatureState?.inspector?.setContext?.({ tab: "matches" });
    renderEditor();
    const segmentIndex = state.segments.findIndex((segment) => segment.documentId === documentInfo.id);
    const projectToolbarBounds = document.querySelector(".project-toolbar")?.getBoundingClientRect();
    const toolbarActionsBounds = document.querySelector(".project-toolbar .toolbar-actions")?.getBoundingClientRect();
    const progressBounds = document.querySelector(".progress-wrap")?.getBoundingClientRect();
    assert(
      Boolean(projectToolbarBounds && toolbarActionsBounds && progressBounds) &&
        toolbarActionsBounds.bottom <= projectToolbarBounds.bottom + 1 &&
        toolbarActionsBounds.bottom <= progressBounds.top + 1,
      "responsive editor toolbar keeps every action above the progress panel"
    );
    const editorAreaBounds = document.querySelector(".editor-area")?.getBoundingClientRect();
    const editorImportMenu = document.querySelector("#editorImportMenu");
    editorImportMenu.open = true;
    const editorImportPanelBounds = editorImportMenu.querySelector(":scope > .menu-panel")?.getBoundingClientRect();
    editorImportMenu.open = false;
    assert(
      Boolean(editorAreaBounds && editorImportPanelBounds) &&
        editorImportPanelBounds.left >= editorAreaBounds.left - 1 &&
        editorImportPanelBounds.right <= editorAreaBounds.right + 1,
      "editor Import menu opens fully inside the rounded editor surface"
    );
    assert(
      document.querySelectorAll("#newProjectBtn").length === 1 && !document.querySelector("#newProjectFromDashboardBtn"),
      "Projects view exposes one non-duplicated New project action"
    );
    const saveStatusStyle = getComputedStyle(els.saveStatus);
    assert(
      saveStatusStyle.display.endsWith("flex") && saveStatusStyle.alignItems === "center" && saveStatusStyle.justifyContent === "center",
      "save status pill centers its label in both axes"
    );
    assert(
      els.saveStatus.getAttribute("role") === "status" &&
        els.saveStatus.getAttribute("aria-live") === "polite" &&
        els.saveStatus.getAttribute("aria-atomic") === "true",
      "save and operation status exposes one polite atomic live region"
    );
    els.confirmBtn.focus();
    openCommandPalette();
    await Promise.resolve();
    const paletteFocusable = focusController?.visibleFocusableElements?.(els.commandPaletteOverlay) || [];
    const paletteLast = paletteFocusable.at(-1);
    assert(document.activeElement === els.commandPaletteInput, "command palette moves focus to command search");
    paletteLast?.focus();
    paletteLast?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert(document.activeElement === paletteFocusable[0], "command palette contains forward Tab focus");
    closeCommandPalette();
    await Promise.resolve();
    assert(document.activeElement === els.confirmBtn, "command palette restores focus to its opener");
    els.brandHomeLink.click();
    assert(
      currentApplicationView() === "projects" && !els.projectsView.classList.contains("hidden"),
      "LoopCAT brand navigates to the Projects view"
    );
    showProjectHome();
    const analysisPanel = document.querySelector(".analysis-panel");
    const analysisToggle = analysisPanel?.querySelector("[data-panel-toggle]");
    analysisToggle?.click();
    assert(
      analysisPanel?.classList.contains("collapsed") &&
        analysisToggle?.getAttribute("aria-expanded") === "false" &&
        analysisToggle?.getAttribute("aria-label")?.startsWith(uiSource("Expand")) &&
        getComputedStyle(document.querySelector("#projectAnalysisContent")).display === "none",
      "Project analysis can be collapsed"
    );
    analysisToggle?.click();
    assert(
      !analysisPanel?.classList.contains("collapsed") &&
        analysisToggle?.getAttribute("aria-expanded") === "true" &&
        analysisToggle?.getAttribute("aria-label")?.startsWith(uiSource("Minimize")),
      "Project analysis can be expanded"
    );
    await openProjectFile(documentInfo.id);
    const activeTargetEditor = els.segmentBody.querySelector(`tr[data-index="${segmentIndex}"] textarea`);
    assert(
      activeTargetEditor?.getAttribute("aria-label") === uiSource("Target translation for segment {value1}", { value1: segmentIndex + 1 }),
      "segment target editors expose a segment-specific accessible name"
    );
    assert(
      els.projectList.closest(".project-rail").scrollWidth <= els.projectList.closest(".project-rail").clientWidth + 2,
      "project navigation labels wrap without horizontal scrolling"
    );
    assert(Boolean(els.focusModeBtn && els.exitFocusModeBtn), "focus view controls are available in the editor");
    setFocusMode(true);
    assert(
      currentFocusMode() &&
        document.body.classList.contains("focus-mode") &&
        els.workspace.classList.contains("focus-mode") &&
        els.focusModeBtn.getAttribute("aria-pressed") === "true" &&
        !els.exitFocusModeBtn.classList.contains("hidden") &&
        Boolean(els.segmentBody.querySelector(`tr[data-index="${segmentIndex}"] textarea`)),
      "focus view switches the editor into a noise-free segment layout"
    );
    setFocusMode(false);
    assert(
      !currentFocusMode() &&
        !document.body.classList.contains("focus-mode") &&
        !els.workspace.classList.contains("focus-mode") &&
        els.focusModeBtn.getAttribute("aria-pressed") === "false" &&
        els.exitFocusModeBtn.classList.contains("hidden"),
      "focus view returns to the full editor layout"
    );
    const autosaveRetryText = `Otomatik kayit yeniden deneme hedefi ${Date.now()}`;
    setHiddenSegmentField(state.segments[segmentIndex], AUTOSAVE_SAVE_FAILURE_TEST_FLAG, true);
    updateSegmentDraft(segmentIndex, autosaveRetryText);
    await waitFor(() => els.saveStatus.textContent.includes("retrying autosave") && state.saveTimers.has(state.segments[segmentIndex].id), "autosave retry after transient failure");
    assert(state.saveTimers.has(state.segments[segmentIndex].id), "timed autosave failure stays queued for retry");
    await waitFor(() => !state.saveTimers.has(state.segments[segmentIndex].id), "autosave retry saved target");
    const autosaveRetryStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(autosaveRetryStored?.target === autosaveRetryText, "timed autosave retry persists target after transient failure");
    const editTargetBefore = targetCommandPatch(state.segments[segmentIndex]);
    const editTargetSteps = [
      `Birlesik duzenleme ilk ${Date.now()}`,
      `Birlesik duzenleme ikinci ${Date.now()}`,
      `Birlesik duzenleme son ${Date.now()}`
    ];
    editTargetSteps.forEach((value) => updateSegmentDraft(segmentIndex, value));
    assert(
      appRuntime.commands.editTargetSessions.has(state.segments[segmentIndex].id),
      "continuous target typing keeps one in-memory EditTarget session"
    );
    await flushPendingSegmentSaves(project.id);
    assert(
      !appRuntime.commands.editTargetSessions.has(state.segments[segmentIndex].id),
      "pending-save flush finalizes the coalesced EditTarget session"
    );
    const editTargetApplied = targetCommandPatch(state.segments[segmentIndex]);
    const editTargetUndo = await undoLastCommand();
    const editTargetStoredAfterUndo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      editTargetUndo?.receipt?.commandId === "edit-target" &&
        state.segments[segmentIndex].target === editTargetBefore.target &&
        state.segments[segmentIndex].status === editTargetBefore.status &&
        JSON.stringify(state.segments[segmentIndex].targetHistory) === JSON.stringify(editTargetBefore.targetHistory) &&
        JSON.stringify(targetCommandPatch(state.segments[segmentIndex]).tmPretranslation) ===
          JSON.stringify(editTargetBefore.tmPretranslation) &&
        JSON.stringify(targetCommandPatch(state.segments[segmentIndex]).aiApplication) ===
          JSON.stringify(editTargetBefore.aiApplication) &&
        editTargetStoredAfterUndo?.target === editTargetBefore.target &&
        currentActiveIndex() === segmentIndex,
      "one coalesced EditTarget Undo restores target state, history, provenance, persistence, and selection"
    );
    const editTargetUndoRevision = Number(state.segments[segmentIndex].revision || 0);
    await redoLastCommand();
    const editTargetStoredAfterRedo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      state.segments[segmentIndex].target === editTargetApplied.target &&
        state.segments[segmentIndex].status === editTargetApplied.status &&
        JSON.stringify(state.segments[segmentIndex].targetHistory) === JSON.stringify(editTargetApplied.targetHistory) &&
        Number(state.segments[segmentIndex].revision || 0) > editTargetUndoRevision &&
        editTargetStoredAfterRedo?.target === editTargetApplied.target &&
        currentActiveIndex() === segmentIndex,
      "EditTarget Redo reapplies the coalesced patch with a monotonic revision"
    );
    const keyboardEditBefore = targetCommandPatch(state.segments[segmentIndex]);
    const keyboardEditTarget = `Klavye geri alma hedefi ${Date.now()}`;
    const keyboardEditTextarea = els.segmentBody.querySelector(`tr[data-index="${segmentIndex}"] textarea`);
    keyboardEditTextarea.value = keyboardEditTarget;
    keyboardEditTextarea.dispatchEvent(new Event("input", { bubbles: true }));
    const keyboardUndoEvent = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    keyboardEditTextarea.dispatchEvent(keyboardUndoEvent);
    await waitFor(
      () =>
        state.segments[segmentIndex]?.target === keyboardEditBefore.target &&
        els.saveStatus.textContent.includes("Undo target edit") &&
        document.activeElement?.matches?.(`tr[data-index="${segmentIndex}"] textarea`),
      "coalesced EditTarget keyboard Undo"
    );
    const keyboardUndoStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      keyboardUndoEvent.defaultPrevented &&
        keyboardUndoStored?.target === keyboardEditBefore.target &&
        document.activeElement?.matches?.(`tr[data-index="${segmentIndex}"] textarea`),
      "Ctrl/Cmd+Z inside the target editor uses coalesced EditTarget Undo and restores focus"
    );
    const keyboardRedoTextarea = els.segmentBody.querySelector(`tr[data-index="${segmentIndex}"] textarea`);
    const keyboardRedoEvent = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    keyboardRedoTextarea.dispatchEvent(keyboardRedoEvent);
    await waitFor(
      () =>
        state.segments[segmentIndex]?.target === keyboardEditTarget &&
        els.saveStatus.textContent.includes("Redid target edit") &&
        document.activeElement?.matches?.(`tr[data-index="${segmentIndex}"] textarea`),
      "coalesced EditTarget keyboard Redo"
    );
    const keyboardRedoStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      keyboardRedoEvent.defaultPrevented &&
        keyboardRedoStored?.target === keyboardEditTarget &&
        document.activeElement?.matches?.(`tr[data-index="${segmentIndex}"] textarea`),
      "Ctrl/Cmd+Shift+Z inside the target editor redoes the coalesced EditTarget command"
    );
    const targetText = `Aninda yedeklenen hedef ${Date.now()}`;
    updateSegmentDraft(segmentIndex, targetText);
    assert(state.saveTimers.size > 0, "pending save created");
    assert(state.segments[segmentIndex].targetHistory?.some((entry) => entry.reason === "edit" && entry.toTarget === targetText), "segment edit records target revision history");
    setHiddenSegmentField(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG, true);
    let pendingFlushError = "";
    try {
      await flushPendingSegmentSaves(project.id);
    } catch (error) {
      pendingFlushError = error.message || String(error);
    }
    assert(pendingFlushError.includes("Simulated pending save flush failure") && state.saveTimers.has(state.segments[segmentIndex].id), "failed pending save flush keeps autosave queued");
    Reflect.deleteProperty(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG);
    await flushPendingSegmentSaves(project.id);
    assert(!state.saveTimers.has(state.segments[segmentIndex].id), "recovered pending save flush clears autosave queue");
    const restoreGuardBackup = await exportAllData();
    const restoreGuardText = `Geri yukleme oncesi bekleyen hedef ${Date.now()}`;
    updateSegmentDraft(segmentIndex, restoreGuardText);
    setHiddenSegmentField(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG, true);
    let restoreGuardError = "";
    try {
      await restoreBackupData(restoreGuardBackup);
    } catch (error) {
      restoreGuardError = error.message || String(error);
    }
    assert(
      restoreGuardError.includes("Simulated pending save flush failure") &&
        state.project?.id === project.id &&
        state.saveTimers.has(state.segments[segmentIndex].id),
      "backup restore stops before destructive restore when pending save flush fails"
    );
    Reflect.deleteProperty(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG);
    await flushPendingSegmentSaves(project.id);
    const replaceGuardPackage = await buildProjectPackage(state.project);
    const replaceGuardText = `Paket degisimi oncesi bekleyen hedef ${Date.now()}`;
    updateSegmentDraft(segmentIndex, replaceGuardText);
    setHiddenSegmentField(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG, true);
    let replaceGuardError = "";
    try {
      await importProjectPackageData(replaceGuardPackage, {
        replaceExisting: true,
        sourceName: "pending-flush-replace-guard.loopcat.json",
        suppressAlert: true,
        open: false
      });
    } catch (error) {
      replaceGuardError = error.message || String(error);
    }
    assert(
      replaceGuardError.includes("Simulated pending save flush failure") &&
        state.project?.id === project.id &&
        state.saveTimers.has(state.segments[segmentIndex].id),
      "project package replacement stops before destructive import when pending save flush fails"
    );
    Reflect.deleteProperty(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG);
    await flushPendingSegmentSaves(project.id);
    const backupTargetText = `Aninda yedeklenen hedef ${Date.now()}`;
    updateSegmentDraft(segmentIndex, backupTargetText);
    assert(state.saveTimers.size > 0, "pending save recreated before backup export");

    const capturedDownloads = [];
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      blob.text().then((text) => capturedDownloads.push({ type: blob.type, text }));
      return originalCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopDownloadClick() {};
    try {
      els.backupExportBtn.click();
      const backupDownload = await waitFor(() => capturedDownloads.find((item) => item.type === "application/json"), "backup download");
      const backup = JSON.parse(backupDownload.text);
      assert((backup.segments || []).some((segment) => segment.target === backupTargetText), "browser backup flushes pending segment edits");
      assert((backup.segments || []).some((segment) => segment.targetHistory?.some((entry) => entry.reason === "edit" && entry.toTarget === backupTargetText)), "browser backup preserves segment revision history");
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }

    els.replaceFindInput.value = "Aninda";
    els.replaceWithInput.value = "AnÄ±nda";
    const targetBeforeReplaceCommand = state.segments[segmentIndex].target;
    clearWorkspaceDirtyMarkers();
    const replaceResult = await replaceTargetText("visible");
    assert(state.segments[segmentIndex].targetHistory?.some((entry) => entry.reason === "replace"), "replace records target revision history");
    assert(replaceResult.replacementCount === 1 && state.segments[segmentIndex].target.startsWith("AnÄ±nda"), "visible target replace updates matching segment");
    const replacedSegments = await getProjectSegments(project.id);
    assert(replacedSegments.some((segment) => segment.target.startsWith("AnÄ±nda")), "target replace saves immediately");
    const undoReplaceCommand = await undoLastCommand();
    const undoReplaceStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      state.segments[segmentIndex].target === targetBeforeReplaceCommand &&
        undoReplaceStored?.target === targetBeforeReplaceCommand &&
        currentActiveIndex() === segmentIndex,
      `Undo restores target replacement atomically and preserves selection (${JSON.stringify({
        visible: state.segments[segmentIndex].target,
        stored: undoReplaceStored?.target,
        expected: targetBeforeReplaceCommand,
        activeIndex: currentActiveIndex(),
        segmentIndex,
        commandId: undoReplaceCommand?.receipt?.commandId || "none"
      })})`
    );
    await redoLastCommand();
    const redoReplaceStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      state.segments[segmentIndex].target.startsWith("AnÄ±nda") && redoReplaceStored?.target.startsWith("AnÄ±nda"),
      "Redo reapplies target replacement atomically"
    );
    assert(state.workspaceDirtyProjectIds.has(project.id), "target replace marks workspace package dirty");
    assert(currentActivityEvents().some((event) => event.type === "replace-target"), "target replace records project activity");
    const beforeFailedReplaceTarget = state.segments[segmentIndex].target;
    els.replaceFindInput.value = "hedef";
    els.replaceWithInput.value = "Kaydedilemeyen";
    setHiddenSegmentField(state.segments[segmentIndex], REPLACE_SAVE_FAILURE_TEST_FLAG, true);
    const failedReplaceResult = await replaceTargetText("visible");
    const afterFailedReplaceStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      failedReplaceResult.segmentCount === 0 &&
        els.saveStatus.textContent.includes("Simulated replace save failure") &&
        state.segments[segmentIndex].target === beforeFailedReplaceTarget &&
        afterFailedReplaceStored?.target === beforeFailedReplaceTarget,
      "target replace save failure restores visible and persisted target text"
    );
    const protectedReplace = replaceOutsideProtectedTokens("<b>bold</b> %s b", "b", "strong", { regex: false, caseSensitive: true });
    assert(protectedReplace.text === "<b>strongold</b> %s strong", "target replace skips protected tag and placeholder tokens");
    const localeStableReplace = replaceOutsideProtectedTokens("INSTALL token", "install", "kur", { regex: false, caseSensitive: false });
    assert(
      "INSTALL".toLocaleLowerCase("tr") !== "install" && localeStableReplace.text === "kur token",
      "case-insensitive target replace is stable under Turkish locale casing"
    );

    await setActiveSegment(segmentIndex);
    assert(Boolean(els.reviewForm && els.reviewStateFilter), "review panel and review filter are available in the editor");
    const reviewBaseline = structuredClone(state.segments[segmentIndex]);
    els.reviewStateSelect.value = "needs-review";
    els.reviewNoteInput.value = "This review note must roll back.";
    els.reviewCommentInput.value = "This review comment must roll back.";
    setHiddenSegmentField(state.segments[segmentIndex], REVIEW_METADATA_SAVE_FAILURE_TEST_FLAG, true);
    await saveActiveReviewMetadata();
    const failedReviewStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      els.saveStatus.textContent.includes("Simulated review metadata save failure") &&
        (state.segments[segmentIndex].reviewState || "") === (reviewBaseline.reviewState || "") &&
        (state.segments[segmentIndex].reviewNote || "") === (reviewBaseline.reviewNote || "") &&
        (state.segments[segmentIndex].comments || []).length === (reviewBaseline.comments || []).length &&
        (failedReviewStored?.reviewNote || "") === (reviewBaseline.reviewNote || ""),
      "review metadata save failure restores visible and persisted review fields"
    );
    els.reviewStateSelect.value = "needs-review";
    els.reviewNoteInput.value = "Saved review note";
    els.reviewCommentInput.value = "Saved review comment";
    const reviewSubmitEvent = new Event("submit", { bubbles: true, cancelable: true });
    const reviewSubmitResult = els.reviewForm.dispatchEvent(reviewSubmitEvent);
    await waitFor(() => els.saveStatus.textContent === "Review saved", "checked review form submit");
    const savedReviewStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      !reviewSubmitResult &&
        reviewSubmitEvent.defaultPrevented &&
        els.saveStatus.textContent === "Review saved" &&
        savedReviewStored?.reviewState === "needs-review" &&
        savedReviewStored?.reviewNote === "Saved review note" &&
        savedReviewStored?.comments?.some((comment) => comment.body === "Saved review comment") &&
        els.reviewCommentInput.value === "",
      "checked quality/review controller owns review submit, persistence delegation, and form refresh"
    );
    setHiddenSegmentField(state.segments[segmentIndex], REVIEW_STATE_SAVE_FAILURE_TEST_FLAG, true);
    await setActiveReviewState("reviewed");
    const failedReviewStateStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      els.saveStatus.textContent.includes("Simulated review state save failure") &&
        state.segments[segmentIndex].reviewState === "needs-review" &&
        failedReviewStateStored?.reviewState === "needs-review",
      "quick review state failure restores visible and persisted review state"
    );
    await setActiveReviewState("reviewed");
    const savedReviewStateStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      els.saveStatus.textContent.includes("Marked reviewed") &&
        savedReviewStateStored?.reviewState === "reviewed",
      "quick review state saves selected review state"
    );
    await undoLastCommand();
    const undoneReviewStateStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      currentActiveIndex() === segmentIndex &&
        state.segments[segmentIndex].reviewState === "needs-review" &&
        undoneReviewStateStored?.reviewState === "needs-review",
      "Undo restores quick review state and active segment"
    );
    await redoLastCommand();
    const redoneReviewStateStored = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      currentActiveIndex() === segmentIndex &&
        state.segments[segmentIndex].reviewState === "reviewed" &&
        redoneReviewStateStored?.reviewState === "reviewed",
      "Redo reapplies quick review state and active segment"
    );

    const aiReviewProvider = aiProviderService.get("ollama");
    const originalAiReviewCompletePrompt = aiReviewProvider.completePrompt;
    const originalAiReviewSegmentFilter = currentEditorFilters().aiState;
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-review-model";
      setSegmentTargetAndStatus(state.segments[segmentIndex], "AI review target with 42", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      await saveSegment(state.segments[segmentIndex]);
      aiReviewProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Review checklist:") &&
            request.prompt.includes("Source English text:") &&
            request.prompt.includes("Target Turkish text:") &&
            request.system.includes("senior translation reviewer"),
          "AI review command sends review prompt instead of translation prompt"
        );
        return {
          text: "Warning | Number check | Confirm whether 42 is preserved naturally.",
          provider: "Mock Review AI",
          providerId: "ollama",
          model: "workflow-review-model"
        };
      };
      const aiReviewSaved = await reviewActiveSegmentWithLocalAi();
      const aiReviewStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = "ai-review-risk";
      updateEditorFilters({ aiState: "ai-review-risk" });
      renderSegments();
      assert(
        aiReviewSaved &&
          aiReviewStored?.reviewState === "needs-review" &&
          aiReviewStored?.aiReviewRisk?.level === "medium" &&
          filteredSegmentIndexes().includes(segmentIndex) &&
          els.segmentBody.textContent.includes("Medium risk") &&
          aiReviewStored?.comments?.some((comment) =>
            comment.body.includes("AI review by Mock Review AI") &&
              comment.body.includes("Risk: Medium") &&
              comment.body.includes("Number check") &&
              comment.aiReviewRisk?.level === "medium"
          ) &&
          els.localAiPromptOutput.textContent.includes("Risk: Medium") &&
          els.localAiPromptOutput.textContent.includes("Number check"),
        "AI review active segment saves risk-ranked review comment and marks segment needs-review"
      );
    } finally {
      aiReviewProvider.completePrompt = originalAiReviewCompletePrompt;
      updateEditorFilters({ aiState: originalAiReviewSegmentFilter });
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = originalAiReviewSegmentFilter;
      renderSegments();
    }

    const originalAiBatchReviewCompletePrompt = aiReviewProvider.completePrompt;
    const aiBatchReviewIndexes = state.segments.map((_, index) => index).slice(0, 3);
    const aiBatchReviewSnapshots = new Map(aiBatchReviewIndexes.map((index) => [state.segments[index].id, structuredClone(state.segments[index])]));
    const originalBatchReviewFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      aiSegmentFilter: currentEditorFilters().aiState,
      localAiMode: els.localAiModeSelect?.value || ""
    };
    try {
      assert(aiBatchReviewIndexes.length === 3, "workflow fixture has enough segments for batch AI QA");
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-batch-review-model";
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      selectApplicationDocument("");
      updateEditorFilters({
        query: "workflow batch qa",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: "",
        aiState: ""
      });
      const issueSegment = state.segments[aiBatchReviewIndexes[0]];
      const failedSegment = state.segments[aiBatchReviewIndexes[1]];
      const lockedSegment = state.segments[aiBatchReviewIndexes[2]];
      issueSegment.source = "Workflow batch QA source with number 42";
      failedSegment.source = "Workflow batch QA source failure case";
      lockedSegment.source = "Workflow batch QA source locked case";
      issueSegment.locked = false;
      failedSegment.locked = false;
      lockedSegment.locked = true;
      setSegmentTargetAndStatus(issueSegment, "Workflow batch QA target with number 24", "draft", "edit");
      setSegmentTargetAndStatus(failedSegment, "Workflow batch QA target failure case", "draft", "edit");
      setSegmentTargetAndStatus(lockedSegment, "Workflow batch QA target locked case", "draft", "edit");
      [issueSegment, failedSegment, lockedSegment].forEach((segment) => {
        touchSegment(segment);
        clearPendingSave(segment);
      });
      await saveSegments([issueSegment, failedSegment, lockedSegment]);
      const issueCommentBaseline = (issueSegment.comments || []).length;
      const failedCommentBaseline = (failedSegment.comments || []).length;
      const lockedCommentBaseline = (lockedSegment.comments || []).length;
      aiReviewProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Review checklist:") &&
            request.prompt.includes("Source English text:") &&
            request.prompt.includes("Target Turkish text:") &&
            request.system.includes("senior translation reviewer"),
          "AI batch QA sends review prompts instead of translation prompts"
        );
        if (request.prompt.includes("failure case")) throw new Error("Mock batch QA segment failure");
        return {
          text: "High | Number mismatch | Keep 42 instead of 24.",
          provider: "Mock Batch QA",
          providerId: "ollama",
          model: "workflow-batch-review-model"
        };
      };
      const batchReviewSummary = await reviewBatchWithLocalAi();
      const batchReviewStored = await getProjectSegments(project.id);
      const storedIssueSegment = batchReviewStored.find((segment) => segment.id === issueSegment.id);
      const storedFailedSegment = batchReviewStored.find((segment) => segment.id === failedSegment.id);
      const storedLockedSegment = batchReviewStored.find((segment) => segment.id === lockedSegment.id);
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = "high-ai-risk";
      updateEditorFilters({ aiState: "high-ai-risk" });
      renderSegments();
      assert(
        batchReviewSummary?.commented === 1 &&
          batchReviewSummary?.failed === 1 &&
          batchReviewSummary?.skipped === 1 &&
          batchReviewSummary?.riskCounts?.high === 1 &&
          batchReviewSummary?.highestRisk === "high" &&
          filteredSegmentIndexes().some((index) => state.segments[index]?.id === issueSegment.id) &&
          els.segmentBody.textContent.includes("High risk") &&
          storedIssueSegment?.reviewState === "needs-review" &&
          storedIssueSegment?.aiReviewRisk?.level === "high" &&
          (storedIssueSegment?.comments || []).length === issueCommentBaseline + 1 &&
          storedIssueSegment?.comments?.some((comment) =>
            comment.body.includes("AI review by Mock Batch QA") &&
              comment.body.includes("Risk: High") &&
              comment.body.includes("Number mismatch") &&
              comment.aiReviewRisk?.level === "high"
          ) &&
          (storedFailedSegment?.comments || []).length === failedCommentBaseline &&
          (storedLockedSegment?.comments || []).length === lockedCommentBaseline &&
          els.localAiPromptOutput.textContent.includes("High risk: 1") &&
          els.localAiPromptOutput.textContent.includes("Mock batch QA segment failure"),
        "AI batch QA saves risk-ranked review comments, skips locked segments, and records segment failures"
      );
    } finally {
      aiReviewProvider.completePrompt = originalAiBatchReviewCompletePrompt;
      selectApplicationDocument(originalBatchReviewFilters.documentFilter);
      updateEditorFilters({
        query: originalBatchReviewFilters.segmentQuery,
        scope: originalBatchReviewFilters.segmentSearchScope,
        regex: originalBatchReviewFilters.segmentRegex,
        caseSensitive: originalBatchReviewFilters.segmentCaseSensitive,
        status: originalBatchReviewFilters.segmentStatusFilter,
        reviewState: originalBatchReviewFilters.reviewStateFilter,
        aiState: originalBatchReviewFilters.aiSegmentFilter
      });
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = originalBatchReviewFilters.aiSegmentFilter;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalBatchReviewFilters.localAiMode;
      const restoredBatchReviewSegments = Array.from(aiBatchReviewSnapshots.values()).map((snapshot) => {
        const current = state.segments.find((segment) => segment.id === snapshot.id);
        return {
          ...snapshot,
          revision: Math.max(Number(snapshot.revision || 0), Number(current?.revision || 0)) + 1,
          updatedAt: new Date().toISOString()
        };
      });
      if (restoredBatchReviewSegments.length) await saveSegments(restoredBatchReviewSegments);
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
      selectApplicationSegment(
        Math.max(0, state.segments.findIndex((segment) => segment.id === state.segments[segmentIndex]?.id))
      );
      renderAll();
    }

    const aiRepairProvider = aiProviderService.get("ollama");
    const originalAiRepairCompletePrompt = aiRepairProvider.completePrompt;
    const aiRepairSegmentSnapshot = structuredClone(state.segments[segmentIndex]);
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-repair-model";
      state.segments[segmentIndex].tags = [{ text: "<0>" }, { text: "</0>" }, { text: "{name}" }, { text: "\\n" }];
      setSegmentTargetAndStatus(state.segments[segmentIndex], "Open {name} with Ctrl+S.", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      await saveSegment(state.segments[segmentIndex]);
      const aiRepairOriginalTarget = state.segments[segmentIndex].target;
      aiRepairProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Return only the corrected target segment") &&
            request.prompt.includes("Protected tokens that must appear exactly as written:") &&
            request.prompt.includes("Source English text:") &&
            request.prompt.includes("Current target Turkish text:") &&
            request.system.includes("tag repair assistant"),
          "AI tag repair command sends repair prompt instead of translation prompt"
        );
        return {
          text: "Open <0>{name}</0> with Ctrl+S\\n.",
          provider: "Mock Repair AI",
          providerId: "ollama",
          model: "workflow-repair-model"
        };
      };
      const aiRepairSaved = await repairActiveSegmentTagsWithLocalAi();
      const aiRepairStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      assert(
        aiRepairSaved &&
          aiRepairStored?.target === aiRepairOriginalTarget &&
          aiRepairStored?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Repair AI" && suggestion.suggestedTarget.includes("<0>{name}</0>")) &&
          els.localAiPromptOutput.textContent.includes("<0>{name}</0>"),
        "AI tag repair active segment saves review suggestion without overwriting target"
      );
    } finally {
      aiRepairProvider.completePrompt = originalAiRepairCompletePrompt;
      const aiRepairRestoreRevision = Number(state.segments[segmentIndex]?.revision || 0);
      Reflect.ownKeys(state.segments[segmentIndex]).forEach((key) => delete state.segments[segmentIndex][key]);
      Object.assign(state.segments[segmentIndex], aiRepairSegmentSnapshot);
      state.segments[segmentIndex].revision = Math.max(Number(aiRepairSegmentSnapshot.revision || 0), aiRepairRestoreRevision) + 1;
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const restoredAiRepairSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], restoredAiRepairSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      updateRow(segmentIndex);
    }

    const originalAiBatchRepairCompletePrompt = aiRepairProvider.completePrompt;
    const aiBatchRepairIndexes = state.segments.map((_, index) => index).slice(0, 3);
    const aiBatchRepairSnapshots = new Map(aiBatchRepairIndexes.map((index) => [state.segments[index].id, structuredClone(state.segments[index])]));
    const originalBatchRepairFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      localAiMode: els.localAiModeSelect?.value || ""
    };
    try {
      assert(aiBatchRepairIndexes.length === 3, "workflow fixture has enough segments for batch AI tag repair");
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-batch-repair-model";
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      selectApplicationDocument("");
      updateEditorFilters({
        query: "workflow batch tag repair",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: ""
      });
      const repairedSegment = state.segments[aiBatchRepairIndexes[0]];
      const failedSegment = state.segments[aiBatchRepairIndexes[1]];
      const lockedSegment = state.segments[aiBatchRepairIndexes[2]];
      repairedSegment.source = "Workflow batch tag repair alpha <0>{name}</0>.";
      failedSegment.source = "Workflow batch tag repair failure case <0>{count}</0>.";
      lockedSegment.source = "Workflow batch tag repair locked case <0>{name}</0>.";
      repairedSegment.tags = [{ text: "<0>" }, { text: "</0>" }, { text: "{name}" }];
      failedSegment.tags = [{ text: "<0>" }, { text: "</0>" }, { text: "{count}" }];
      lockedSegment.tags = [{ text: "<0>" }, { text: "</0>" }, { text: "{name}" }];
      repairedSegment.locked = false;
      failedSegment.locked = false;
      lockedSegment.locked = true;
      setSegmentTargetAndStatus(repairedSegment, "Workflow batch tag repair alpha {name}.", "draft", "batch-repair-test");
      setSegmentTargetAndStatus(failedSegment, "Workflow batch tag repair failure case {count}.", "draft", "batch-repair-test");
      setSegmentTargetAndStatus(lockedSegment, "Workflow batch tag repair locked case {name}.", "draft", "batch-repair-test");
      const repairedSuggestionBaseline = (repairedSegment.aiSuggestions || []).length;
      const failedSuggestionBaseline = (failedSegment.aiSuggestions || []).length;
      const lockedSuggestionBaseline = (lockedSegment.aiSuggestions || []).length;
      [repairedSegment, failedSegment, lockedSegment].forEach((segment) => {
        touchSegment(segment);
        clearPendingSave(segment);
      });
      const savedAiBatchRepairSegments = await saveSegments([repairedSegment, failedSegment, lockedSegment]);
      savedAiBatchRepairSegments.forEach((savedSegment) => {
        const index = state.segments.findIndex((segment) => segment.id === savedSegment.id);
        if (index === -1) return;
        Object.assign(state.segments[index], savedSegment);
        prepareSegmentHistoryState(state.segments[index]);
      });
      aiRepairProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Return only the corrected target segment") &&
            request.prompt.includes("Protected tokens that must appear exactly as written:") &&
            request.prompt.includes("Current target Turkish text:") &&
            request.system.includes("tag repair assistant"),
          "AI batch tag repair sends repair prompts instead of translation prompts"
        );
        if (request.prompt.includes("failure case")) throw new Error("Mock batch tag repair failure");
        return {
          text: "Workflow batch tag repair alpha <0>{name}</0>.",
          provider: "Mock Batch Repair AI",
          providerId: "ollama",
          model: "workflow-batch-repair-model"
        };
      };
      const aiBatchRepairSummary = await repairBatchTagsWithLocalAi();
      const aiBatchRepairStored = await getProjectSegments(project.id);
      const storedRepairedSegment = aiBatchRepairStored.find((segment) => segment.id === repairedSegment.id);
      const storedFailedRepairSegment = aiBatchRepairStored.find((segment) => segment.id === failedSegment.id);
      const storedLockedRepairSegment = aiBatchRepairStored.find((segment) => segment.id === lockedSegment.id);
      assert(aiBatchRepairSummary?.suggested === 1, "AI batch tag repair creates one review suggestion");
      assert(aiBatchRepairSummary?.failed === 1, "AI batch tag repair records one segment failure");
      assert(aiBatchRepairSummary?.skipped === 1, "AI batch tag repair skips the locked segment");
      assert(storedRepairedSegment?.target === "Workflow batch tag repair alpha {name}.", "AI batch tag repair does not overwrite the repaired segment target");
      assert((storedRepairedSegment?.aiSuggestions || []).length === repairedSuggestionBaseline + 1, "AI batch tag repair persists the repaired segment suggestion");
      assert(
        storedRepairedSegment?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Batch Repair AI" && suggestion.suggestedTarget.includes("<0>{name}</0>")),
        "AI batch tag repair stores the corrected protected-token suggestion"
      );
      assert((storedFailedRepairSegment?.aiSuggestions || []).length === failedSuggestionBaseline, "AI batch tag repair does not save suggestions for failed segments");
      assert((storedLockedRepairSegment?.aiSuggestions || []).length === lockedSuggestionBaseline, "AI batch tag repair does not save suggestions for locked segments");
      assert(els.localAiPromptOutput.textContent.includes("Mock batch tag repair failure"), "AI batch tag repair reports segment-level failures");
      assert(
        aiBatchRepairSummary?.suggested === 1 &&
          aiBatchRepairSummary?.failed === 1 &&
          aiBatchRepairSummary?.skipped === 1 &&
          storedRepairedSegment?.target === "Workflow batch tag repair alpha {name}." &&
          (storedRepairedSegment?.aiSuggestions || []).length === repairedSuggestionBaseline + 1 &&
          storedRepairedSegment?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Batch Repair AI" && suggestion.suggestedTarget.includes("<0>{name}</0>")) &&
          (storedFailedRepairSegment?.aiSuggestions || []).length === failedSuggestionBaseline &&
          (storedLockedRepairSegment?.aiSuggestions || []).length === lockedSuggestionBaseline &&
          els.localAiPromptOutput.textContent.includes("Mock batch tag repair failure"),
        "AI batch tag repair saves review suggestions, skips locked segments, and records failures"
      );
    } finally {
      aiRepairProvider.completePrompt = originalAiBatchRepairCompletePrompt;
      selectApplicationDocument(originalBatchRepairFilters.documentFilter);
      updateEditorFilters({
        query: originalBatchRepairFilters.segmentQuery,
        scope: originalBatchRepairFilters.segmentSearchScope,
        regex: originalBatchRepairFilters.segmentRegex,
        caseSensitive: originalBatchRepairFilters.segmentCaseSensitive,
        status: originalBatchRepairFilters.segmentStatusFilter,
        reviewState: originalBatchRepairFilters.reviewStateFilter
      });
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalBatchRepairFilters.localAiMode;
      const restoredBatchRepairSegments = Array.from(aiBatchRepairSnapshots.values()).map((snapshot) => {
        const current = state.segments.find((segment) => segment.id === snapshot.id);
        return {
          ...snapshot,
          revision: Math.max(Number(snapshot.revision || 0), Number(current?.revision || 0)) + 1,
          updatedAt: new Date().toISOString()
        };
      });
      if (restoredBatchRepairSegments.length) await saveSegments(restoredBatchRepairSegments);
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
      selectApplicationSegment(
        Math.max(0, state.segments.findIndex((segment) => segment.id === state.segments[segmentIndex]?.id))
      );
      renderAll();
    }

    const aiVariantsProvider = aiProviderService.get("ollama");
    const originalAiVariantsCompletePrompt = aiVariantsProvider.completePrompt;
    const aiVariantsSegmentSnapshot = structuredClone(state.segments[segmentIndex]);
    const aiVariantsProjectSettingsSnapshot = structuredClone(state.project.aiSettings || {});
    const originalAiVariantsMode = els.localAiVariantModeSelect?.value || "";
    const originalAiVariantsFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      localAiMode: els.localAiModeSelect?.value || "",
      activeSegmentId: state.segments[segmentIndex]?.id || ""
    };
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-variants-model";
      if (els.localAiVariantModeSelect) els.localAiVariantModeSelect.value = "concise";
      setSegmentTargetAndStatus(state.segments[segmentIndex], "Workflow variants baseline target", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      await saveSegment(state.segments[segmentIndex]);
      const aiVariantsOriginalTarget = state.segments[segmentIndex].target;
      const aiVariantsOriginalSuggestionCount = (state.segments[segmentIndex].aiSuggestions || []).length;
      aiVariantsProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Return exactly three alternatives") &&
            request.prompt.includes("Concise: <target-language text>") &&
            request.prompt.includes("Short UI: <target-language text>") &&
            request.prompt.includes("Current target Turkish draft:") &&
            request.system.includes("translation alternatives assistant"),
          "AI alternatives command sends selected variant style prompt instead of translation prompt"
        );
        if (request.prompt.includes("Workflow batch variants failure draft")) throw new Error("Mock batch alternatives failure");
        if (request.prompt.includes("Workflow batch variants alpha draft")) {
          return {
            text: [
              "Concise: Workflow batch variants alpha concise",
              "Short UI: Workflow batch variants alpha short UI",
              "Concise-terminology-strict: Workflow batch variants alpha strict"
            ].join("\n"),
            provider: "Mock Variants AI",
            providerId: "ollama",
            model: "workflow-variants-model"
          };
        }
        if (request.prompt.includes("Workflow batch variants beta draft")) {
          return {
            text: [
              "Concise: Workflow batch variants beta concise",
              "Short UI: Workflow batch variants beta short UI",
              "Concise-terminology-strict: Workflow batch variants beta strict"
            ].join("\n"),
            provider: "Mock Variants AI",
            providerId: "ollama",
            model: "workflow-variants-model"
          };
        }
        return {
          text: [
            "Concise: Workflow concise alternative",
            "Short UI: Workflow short UI alternative",
            "Concise-terminology-strict: Workflow concise terminology alternative"
          ].join("\n"),
          provider: "Mock Variants AI",
          providerId: "ollama",
          model: "workflow-variants-model"
        };
      };
      const aiVariantsSaved = await suggestActiveSegmentVariantsWithLocalAi();
      const aiVariantsStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      assert(
          aiVariantsSaved &&
          aiVariantsStored?.target === aiVariantsOriginalTarget &&
          (aiVariantsStored?.aiSuggestions || []).length === aiVariantsOriginalSuggestionCount + 3 &&
          aiVariantsStored?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Variants AI" && suggestion.suggestedTarget === "Workflow short UI alternative") &&
          els.localAiPromptOutput.textContent.includes("Workflow concise terminology alternative"),
        "AI alternatives active segment saves selected-style review suggestions without overwriting target"
      );
      await importLocalization(new File(["<!doctype html><html><body><p>Workflow batch variants alpha source.</p><p>Workflow batch variants beta source.</p><p>Workflow batch variants failure source.</p><p>Workflow batch variants locked source.</p></body></html>"], "workflow-ai-batch-variants.html", { type: "text/html" }));
      const aiBatchVariantsDocument = state.project.documents.find((item) => item.name === "workflow-ai-batch-variants.html");
      await openProjectFile(aiBatchVariantsDocument.id);
      updateEditorFilters({
        query: "",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: ""
      });
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      if (els.localAiVariantModeSelect) els.localAiVariantModeSelect.value = "concise";
      const aiBatchVariantsIndexes = state.segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => segment.documentId === aiBatchVariantsDocument.id);
      for (const { segment } of aiBatchVariantsIndexes) {
        const source = String(segment.source || "");
        const target = source.includes("alpha")
          ? "Workflow batch variants alpha draft"
          : source.includes("beta")
            ? "Workflow batch variants beta draft"
            : source.includes("failure")
              ? "Workflow batch variants failure draft"
              : "Workflow batch variants locked draft";
        setSegmentTargetAndStatus(segment, target, "draft", "batch-variants-test");
        segment.locked = source.includes("locked");
        touchSegment(segment);
        clearPendingSave(segment);
      }
      const savedAiBatchVariantsSegments = await saveSegments(aiBatchVariantsIndexes.map(({ segment }) => segment));
      savedAiBatchVariantsSegments.forEach((savedSegment) => {
        const index = state.segments.findIndex((segment) => segment.id === savedSegment.id);
        if (index === -1) return;
        Object.assign(state.segments[index], savedSegment);
        prepareSegmentHistoryState(state.segments[index]);
      });
      if (els.localAiVariantModeSelect) els.localAiVariantModeSelect.value = "concise";
      const aiBatchVariantsSummary = await suggestBatchSegmentVariantsWithLocalAi();
      const aiBatchVariantsStored = await getProjectSegments(project.id);
      const aiBatchVariantsSegments = aiBatchVariantsStored.filter((segment) => segment.documentId === aiBatchVariantsDocument.id);
      const failedBatchVariantsSegment = aiBatchVariantsSegments.find((segment) => String(segment.source || "").includes("failure"));
      const lockedBatchVariantsSegment = aiBatchVariantsSegments.find((segment) => String(segment.source || "").includes("locked"));
      assert(aiBatchVariantsSummary?.suggested === 6, "AI batch alternatives creates six review suggestions");
      assert(aiBatchVariantsSummary?.failed === 1, "AI batch alternatives records one segment failure");
      assert(aiBatchVariantsSummary?.skipped === 1, "AI batch alternatives skips the locked segment");
      assert(aiBatchVariantsSegments.every((segment) => String(segment.target || "").includes("draft")), "AI batch alternatives does not overwrite draft targets");
      assert(
        aiBatchVariantsSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch variants alpha short UI")) &&
          aiBatchVariantsSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch variants beta strict")),
        "AI batch alternatives persists successful suggestions"
      );
      assert(!(failedBatchVariantsSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Variants AI"), "AI batch alternatives does not save suggestions for failed segments");
      assert(!(lockedBatchVariantsSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Variants AI"), "AI batch alternatives does not save suggestions for locked segments");
      assert(els.localAiPromptOutput.textContent.includes("6 alternative suggestions saved"), "AI batch alternatives reports saved suggestion count");
      assert(els.localAiPromptOutput.textContent.includes("Mock batch alternatives failure"), "AI batch alternatives reports segment-level failures");
      assert(
        aiBatchVariantsSummary?.suggested === 6 &&
          aiBatchVariantsSummary?.failed === 1 &&
          aiBatchVariantsSummary?.skipped === 1 &&
          aiBatchVariantsSegments.every((segment) => String(segment.target || "").includes("draft")) &&
          aiBatchVariantsSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch variants alpha short UI")) &&
          aiBatchVariantsSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch variants beta strict")) &&
          !(failedBatchVariantsSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Variants AI") &&
          !(lockedBatchVariantsSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Variants AI") &&
          els.localAiPromptOutput.textContent.includes("Mock batch alternatives failure"),
        "AI batch alternatives saves review suggestions without overwriting drafts"
      );
    } finally {
      aiVariantsProvider.completePrompt = originalAiVariantsCompletePrompt;
      if (els.localAiVariantModeSelect) els.localAiVariantModeSelect.value = originalAiVariantsMode;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalAiVariantsFilters.localAiMode;
      selectApplicationDocument(originalAiVariantsFilters.documentFilter);
      updateEditorFilters({
        query: originalAiVariantsFilters.segmentQuery,
        scope: originalAiVariantsFilters.segmentSearchScope,
        regex: originalAiVariantsFilters.segmentRegex,
        caseSensitive: originalAiVariantsFilters.segmentCaseSensitive,
        status: originalAiVariantsFilters.segmentStatusFilter,
        reviewState: originalAiVariantsFilters.reviewStateFilter
      });
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings(aiVariantsProjectSettingsSnapshot)
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const aiVariantsRestoreRevision = Number(state.segments[segmentIndex]?.revision || 0);
      Reflect.ownKeys(state.segments[segmentIndex]).forEach((key) => delete state.segments[segmentIndex][key]);
      Object.assign(state.segments[segmentIndex], aiVariantsSegmentSnapshot);
      state.segments[segmentIndex].revision = Math.max(Number(aiVariantsSegmentSnapshot.revision || 0), aiVariantsRestoreRevision) + 1;
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const restoredAiVariantsSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], restoredAiVariantsSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      renderDocumentFilter();
      renderSegments();
      const restoreAiVariantsIndex = state.segments.findIndex((segment) => segment.id === originalAiVariantsFilters.activeSegmentId);
      if (restoreAiVariantsIndex >= 0) await setActiveSegment(restoreAiVariantsIndex);
      updateRow(segmentIndex);
    }

    const aiApplyTermsProvider = aiProviderService.get("ollama");
    const originalAiApplyTermsCompletePrompt = aiApplyTermsProvider.completePrompt;
    const aiApplyTermsSegmentSnapshot = structuredClone(state.segments[segmentIndex]);
    let aiApplyTermsTerm = null;
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-apply-terms-model";
      const applyTermsSourceTerm = `workflow apply terminology ${Date.now()}`;
      const applyTermsTargetTerm = "workflow applied terminology";
      state.segments[segmentIndex].source = `Use {name} with ${applyTermsSourceTerm}.`;
      state.segments[segmentIndex].tags = [{ text: "{name}" }];
      setSegmentTargetAndStatus(state.segments[segmentIndex], "Use {name} with draft wording.", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const savedAiApplyTermsFixtureSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], savedAiApplyTermsFixtureSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      const aiApplyTermsOriginalTarget = state.segments[segmentIndex].target;
      const aiApplyTermsOriginalSuggestionCount = (state.segments[segmentIndex].aiSuggestions || []).length;
      aiApplyTermsTerm = await saveTerm({
        sourceTerm: applyTermsSourceTerm,
        targetTerm: applyTermsTargetTerm,
        notes: "Workflow AI terminology application fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      });
      aiApplyTermsProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Apply approved terminology") &&
            request.prompt.includes("Approved project terminology:") &&
            request.prompt.includes(applyTermsTargetTerm) &&
            request.prompt.includes("Current target Turkish draft:") &&
            request.system.includes("terminology application assistant"),
          "AI terminology application command sends termbase application prompt instead of translation prompt"
        );
        return {
          text: `Use {name} with ${applyTermsTargetTerm}.`,
          provider: "Mock Terminology AI",
          providerId: "ollama",
          model: "workflow-apply-terms-model"
        };
      };
      const aiApplyTermsSaved = await applyActiveSegmentTerminologyWithLocalAi();
      const aiApplyTermsStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      assert(
        aiApplyTermsSaved &&
          aiApplyTermsStored?.target === aiApplyTermsOriginalTarget &&
          (aiApplyTermsStored?.aiSuggestions || []).length === aiApplyTermsOriginalSuggestionCount + 1 &&
          aiApplyTermsStored?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Terminology AI" && suggestion.suggestedTarget.includes(applyTermsTargetTerm)) &&
          els.localAiPromptOutput.textContent.includes(applyTermsTargetTerm),
        "AI terminology application active segment saves review suggestion without overwriting target"
      );
    } finally {
      aiApplyTermsProvider.completePrompt = originalAiApplyTermsCompletePrompt;
      if (aiApplyTermsTerm?.id) await deleteTerm(aiApplyTermsTerm.id);
      const aiApplyTermsRestoreRevision = Number(state.segments[segmentIndex]?.revision || 0);
      Reflect.ownKeys(state.segments[segmentIndex]).forEach((key) => delete state.segments[segmentIndex][key]);
      Object.assign(state.segments[segmentIndex], aiApplyTermsSegmentSnapshot);
      state.segments[segmentIndex].revision = Math.max(Number(aiApplyTermsSegmentSnapshot.revision || 0), Number(aiApplyTermsRestoreRevision || 0)) + 1;
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const restoredAiApplyTermsSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], restoredAiApplyTermsSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      updateRow(segmentIndex);
    }

    const originalAiBatchApplyTermsCompletePrompt = aiApplyTermsProvider.completePrompt;
    const aiBatchApplyTermsIndexes = state.segments.map((_, index) => index).slice(0, 3);
    const aiBatchApplyTermsSnapshots = new Map(aiBatchApplyTermsIndexes.map((index) => [state.segments[index].id, structuredClone(state.segments[index])]));
    const originalBatchApplyTermsFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      localAiMode: els.localAiModeSelect?.value || ""
    };
    const aiBatchApplyTermsSavedTerms = [];
    try {
      assert(aiBatchApplyTermsIndexes.length === 3, "workflow fixture has enough segments for batch AI terminology application");
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-batch-apply-terms-model";
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      selectApplicationDocument("");
      updateEditorFilters({
        query: "workflow batch apply terminology",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: ""
      });
      const suggestedSegment = state.segments[aiBatchApplyTermsIndexes[0]];
      const failedSegment = state.segments[aiBatchApplyTermsIndexes[1]];
      const lockedSegment = state.segments[aiBatchApplyTermsIndexes[2]];
      const batchApplySourceTerm = `workflow batch apply terminology ${Date.now()}`;
      const batchApplyFailedTerm = `${batchApplySourceTerm} failure`;
      const batchApplyLockedTerm = `${batchApplySourceTerm} locked`;
      const batchApplyTargetTerm = "batch applied terminology";
      suggestedSegment.source = `Use ${batchApplySourceTerm} in the workflow batch apply terminology segment.`;
      failedSegment.source = `Use ${batchApplyFailedTerm} in the workflow batch apply terminology failure case.`;
      lockedSegment.source = `Use ${batchApplyLockedTerm} in the workflow batch apply terminology locked case.`;
      suggestedSegment.tags = [];
      failedSegment.tags = [];
      lockedSegment.tags = [];
      suggestedSegment.locked = false;
      failedSegment.locked = false;
      lockedSegment.locked = true;
      setSegmentTargetAndStatus(suggestedSegment, "Use old term in the workflow batch apply terminology segment.", "draft", "batch-apply-terms-test");
      setSegmentTargetAndStatus(failedSegment, "Use old term in the workflow batch apply terminology failure case.", "draft", "batch-apply-terms-test");
      setSegmentTargetAndStatus(lockedSegment, "Use old term in the workflow batch apply terminology locked case.", "draft", "batch-apply-terms-test");
      const suggestedOriginalTarget = suggestedSegment.target;
      const failedOriginalTarget = failedSegment.target;
      const lockedOriginalTarget = lockedSegment.target;
      const suggestedSuggestionBaseline = (suggestedSegment.aiSuggestions || []).length;
      const failedSuggestionBaseline = (failedSegment.aiSuggestions || []).length;
      const lockedSuggestionBaseline = (lockedSegment.aiSuggestions || []).length;
      [suggestedSegment, failedSegment, lockedSegment].forEach((segment) => {
        touchSegment(segment);
        clearPendingSave(segment);
      });
      const savedAiBatchApplyTermsSegments = await saveSegments([suggestedSegment, failedSegment, lockedSegment]);
      savedAiBatchApplyTermsSegments.forEach((savedSegment) => {
        const index = state.segments.findIndex((segment) => segment.id === savedSegment.id);
        if (index === -1) return;
        Object.assign(state.segments[index], savedSegment);
        prepareSegmentHistoryState(state.segments[index]);
      });
      aiBatchApplyTermsSavedTerms.push(await saveTerm({
        sourceTerm: batchApplySourceTerm,
        targetTerm: batchApplyTargetTerm,
        notes: "Workflow batch AI terminology application fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      }));
      aiBatchApplyTermsSavedTerms.push(await saveTerm({
        sourceTerm: batchApplyFailedTerm,
        targetTerm: "batch failed terminology",
        notes: "Workflow batch AI terminology application failure fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      }));
      aiApplyTermsProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Apply approved terminology") &&
            request.prompt.includes("Approved project terminology:") &&
            request.prompt.includes("Current target Turkish draft:") &&
            request.system.includes("terminology application assistant"),
          "AI batch terminology application sends termbase application prompts instead of translation prompts"
        );
        if (request.prompt.includes("failure case")) throw new Error("Mock batch terminology application failure");
        return {
          text: `Use ${batchApplyTargetTerm} in the workflow batch apply terminology segment.`,
          provider: "Mock Batch Terminology AI",
          providerId: "ollama",
          model: "workflow-batch-apply-terms-model"
        };
      };
      const aiBatchApplyTermsSummary = await applyBatchTerminologyWithLocalAi();
      const aiBatchApplyTermsStored = await getProjectSegments(project.id);
      const storedSuggestedSegment = aiBatchApplyTermsStored.find((segment) => segment.id === suggestedSegment.id);
      const storedFailedSegment = aiBatchApplyTermsStored.find((segment) => segment.id === failedSegment.id);
      const storedLockedSegment = aiBatchApplyTermsStored.find((segment) => segment.id === lockedSegment.id);
      assert(
        aiBatchApplyTermsSummary?.suggested === 1 &&
          aiBatchApplyTermsSummary?.failed === 1 &&
          aiBatchApplyTermsSummary?.skipped === 1 &&
          storedSuggestedSegment?.target === suggestedOriginalTarget &&
          storedFailedSegment?.target === failedOriginalTarget &&
          storedLockedSegment?.target === lockedOriginalTarget &&
          (storedSuggestedSegment?.aiSuggestions || []).length === suggestedSuggestionBaseline + 1 &&
          storedSuggestedSegment?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Batch Terminology AI" && suggestion.suggestedTarget.includes(batchApplyTargetTerm)) &&
          (storedFailedSegment?.aiSuggestions || []).length === failedSuggestionBaseline &&
          (storedLockedSegment?.aiSuggestions || []).length === lockedSuggestionBaseline &&
          els.localAiPromptOutput.textContent.includes("Mock batch terminology application failure"),
        "AI batch terminology application saves review suggestions, skips locked segments, and records failures"
      );
    } finally {
      aiApplyTermsProvider.completePrompt = originalAiBatchApplyTermsCompletePrompt;
      await Promise.all(aiBatchApplyTermsSavedTerms.filter((term) => term?.id).map((term) => deleteTerm(term.id)));
      selectApplicationDocument(originalBatchApplyTermsFilters.documentFilter);
      updateEditorFilters({
        query: originalBatchApplyTermsFilters.segmentQuery,
        scope: originalBatchApplyTermsFilters.segmentSearchScope,
        regex: originalBatchApplyTermsFilters.segmentRegex,
        caseSensitive: originalBatchApplyTermsFilters.segmentCaseSensitive,
        status: originalBatchApplyTermsFilters.segmentStatusFilter,
        reviewState: originalBatchApplyTermsFilters.reviewStateFilter
      });
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalBatchApplyTermsFilters.localAiMode;
      const restoredBatchApplyTermsSegments = Array.from(aiBatchApplyTermsSnapshots.values()).map((snapshot) => {
        const current = state.segments.find((segment) => segment.id === snapshot.id);
        return {
          ...snapshot,
          revision: Math.max(Number(snapshot.revision || 0), Number(current?.revision || 0)) + 1,
          updatedAt: new Date().toISOString()
        };
      });
      if (restoredBatchApplyTermsSegments.length) await saveSegments(restoredBatchApplyTermsSegments);
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
      selectApplicationSegment(
        Math.max(0, state.segments.findIndex((segment) => segment.id === state.segments[segmentIndex]?.id))
      );
      renderAll();
    }

    const aiPolishProvider = aiProviderService.get("ollama");
    const originalAiPolishCompletePrompt = aiPolishProvider.completePrompt;
    const aiPolishSegmentSnapshot = structuredClone(state.segments[segmentIndex]);
    const aiPolishProjectSettingsSnapshot = structuredClone(state.project.aiSettings || {});
    const originalAiPolishFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      localAiMode: els.localAiModeSelect?.value || "",
      activeIndex: currentActiveIndex()
    };
    let aiPolishTerm = null;
    let aiPolishTmEntry = null;
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-polish-model";
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings({
          ...state.project.aiSettings,
          styleGuide: "Workflow polish style: use concise UI wording."
        })
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const polishSourceTerm = `workflow polish term ${Date.now()}`;
      const polishTargetTerm = "workflow polish target term";
      state.segments[segmentIndex].source = `Open {name} with ${polishSourceTerm}.`;
      state.segments[segmentIndex].tags = [{ text: "{name}" }];
      setSegmentTargetAndStatus(state.segments[segmentIndex], "Open {name} with verbose workflow wording.", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const savedAiPolishFixtureSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], savedAiPolishFixtureSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      const aiPolishOriginalTarget = state.segments[segmentIndex].target;
      const aiPolishOriginalSuggestionCount = (state.segments[segmentIndex].aiSuggestions || []).length;
      aiPolishTerm = await saveTerm({
        sourceTerm: polishSourceTerm,
        targetTerm: polishTargetTerm,
        notes: "Workflow AI polish fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      });
      aiPolishTmEntry = await saveTmEntry({
        source: state.segments[segmentIndex].source,
        target: "Open {name} using concise TM wording.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        projectName: state.project.name,
        tmName: mainTmName()
      });
      aiPolishProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Return only one improved target segment") &&
            request.prompt.includes("Workflow polish style") &&
            request.prompt.includes("Project style instructions:") &&
            request.system.includes("style and terminology polishing assistant"),
          "AI polish command sends style, TM, and termbase context"
        );
        if (request.prompt.includes(polishSourceTerm)) {
          assert(
            request.prompt.includes("Translation memory hints:") &&
              request.prompt.includes("Project glossary hints:") &&
              request.prompt.includes(polishTargetTerm),
            "AI polish active command sends matched TM and termbase hints"
          );
        }
        if (request.prompt.includes("Workflow batch polish alpha draft")) {
          return {
            text: "Workflow batch polish alpha improved",
            provider: "Mock Polish AI",
            providerId: "ollama",
            model: "workflow-polish-model"
          };
        }
        if (request.prompt.includes("Workflow batch polish beta draft")) {
          return {
            text: "Workflow batch polish beta improved",
            provider: "Mock Polish AI",
            providerId: "ollama",
            model: "workflow-polish-model"
          };
        }
        return {
          text: "Open {name} using concise workflow wording.",
          provider: "Mock Polish AI",
          providerId: "ollama",
          model: "workflow-polish-model"
        };
      };
      const aiPolishSaved = await polishActiveSegmentDraftWithLocalAi();
      const aiPolishStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      assert(
        aiPolishSaved &&
          aiPolishStored?.target === aiPolishOriginalTarget &&
          (aiPolishStored?.aiSuggestions || []).length === aiPolishOriginalSuggestionCount + 1 &&
          aiPolishStored?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Polish AI" && suggestion.suggestedTarget === "Open {name} using concise workflow wording.") &&
          els.localAiPromptOutput.textContent.includes("concise workflow wording"),
        "AI polish active segment saves review suggestion without overwriting target"
      );
      await importLocalization(new File(["<!doctype html><html><body><p>Workflow batch polish alpha source.</p><p>Workflow batch polish beta source.</p></body></html>"], "workflow-ai-batch-polish.html", { type: "text/html" }));
      const aiBatchPolishDocument = state.project.documents.find((item) => item.name === "workflow-ai-batch-polish.html");
      await openProjectFile(aiBatchPolishDocument.id);
      updateEditorFilters({
        query: "",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: ""
      });
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = "shorten";
      const aiBatchPolishIndexes = state.segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => segment.documentId === aiBatchPolishDocument.id);
      for (const { segment } of aiBatchPolishIndexes) {
        setSegmentTargetAndStatus(segment, segment.source.includes("alpha") ? "Workflow batch polish alpha draft" : "Workflow batch polish beta draft", "draft", "batch-polish-test");
        segment.locked = false;
        touchSegment(segment);
        clearPendingSave(segment);
      }
      const savedAiBatchPolishSegments = await saveSegments(aiBatchPolishIndexes.map(({ segment }) => segment));
      savedAiBatchPolishSegments.forEach((savedSegment) => {
        const index = state.segments.findIndex((segment) => segment.id === savedSegment.id);
        if (index === -1) return;
        Object.assign(state.segments[index], savedSegment);
        prepareSegmentHistoryState(state.segments[index]);
      });
      const aiBatchPolishSummary = await polishBatchDraftsWithLocalAi();
      const aiBatchPolishStored = await getProjectSegments(project.id);
      const aiBatchPolishSegments = aiBatchPolishStored.filter((segment) => segment.documentId === aiBatchPolishDocument.id);
      assert(
        aiBatchPolishSummary?.suggested === 2 &&
          aiBatchPolishSegments.every((segment) => String(segment.target || "").includes("draft")) &&
          aiBatchPolishSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch polish alpha improved")) &&
          aiBatchPolishSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch polish beta improved")) &&
          els.localAiPromptOutput.textContent.includes("2 polish suggestions saved"),
        "AI batch polish saves review suggestions without overwriting drafts"
      );
    } finally {
      aiPolishProvider.completePrompt = originalAiPolishCompletePrompt;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalAiPolishFilters.localAiMode;
      selectApplicationDocument(originalAiPolishFilters.documentFilter);
      updateEditorFilters({
        query: originalAiPolishFilters.segmentQuery,
        scope: originalAiPolishFilters.segmentSearchScope,
        regex: originalAiPolishFilters.segmentRegex,
        caseSensitive: originalAiPolishFilters.segmentCaseSensitive,
        status: originalAiPolishFilters.segmentStatusFilter,
        reviewState: originalAiPolishFilters.reviewStateFilter
      });
      if (aiPolishTerm?.id) await deleteTerm(aiPolishTerm.id);
      if (aiPolishTmEntry?.id) await deleteTmEntry(aiPolishTmEntry.id);
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings(aiPolishProjectSettingsSnapshot)
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const aiPolishRestoreRevision = Number(state.segments[segmentIndex]?.revision || 0);
      Reflect.ownKeys(state.segments[segmentIndex]).forEach((key) => delete state.segments[segmentIndex][key]);
      Object.assign(state.segments[segmentIndex], aiPolishSegmentSnapshot);
      state.segments[segmentIndex].revision = Math.max(Number(aiPolishSegmentSnapshot.revision || 0), aiPolishRestoreRevision) + 1;
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const restoredAiPolishSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], restoredAiPolishSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      renderDocumentFilter();
      renderSegments();
      if (Number.isInteger(originalAiPolishFilters.activeIndex) && originalAiPolishFilters.activeIndex >= 0) await setActiveSegment(originalAiPolishFilters.activeIndex);
      updateRow(segmentIndex);
    }

    const aiAdaptProvider = aiProviderService.get("ollama");
    const originalAiAdaptCompletePrompt = aiAdaptProvider.completePrompt;
    const aiAdaptSegmentSnapshot = structuredClone(state.segments[segmentIndex]);
    const aiAdaptProjectSettingsSnapshot = structuredClone(state.project.aiSettings || {});
    const originalAiAdaptMode = els.localAiAdaptModeSelect?.value || "";
    let aiAdaptTerm = null;
    let aiAdaptTmEntry = null;
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-adapt-model";
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = "shorten";
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings({
          ...state.project.aiSettings,
          styleGuide: "Workflow adaptation style: keep target UI copy short."
        })
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const adaptSourceTerm = `workflow adapt term ${Date.now()}`;
      const adaptTargetTerm = "workflow adapted term";
      state.segments[segmentIndex].source = `Open {name} with ${adaptSourceTerm} before deployment.`;
      state.segments[segmentIndex].tags = [{ text: "{name}" }];
      setSegmentTargetAndStatus(state.segments[segmentIndex], "Open {name} with a long workflow adaptation draft before deployment.", "draft", "edit");
      touchSegment(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const savedAiAdaptFixtureSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], savedAiAdaptFixtureSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      const aiAdaptOriginalTarget = state.segments[segmentIndex].target;
      const aiAdaptOriginalSuggestionCount = (state.segments[segmentIndex].aiSuggestions || []).length;
      aiAdaptTerm = await saveTerm({
        sourceTerm: adaptSourceTerm,
        targetTerm: adaptTargetTerm,
        notes: "Workflow AI adaptation fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      });
      aiAdaptTmEntry = await saveTmEntry({
        source: state.segments[segmentIndex].source,
        target: "Open {name} with concise adaptation TM wording.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        projectName: state.project.name,
        tmName: mainTmName()
      });
      aiAdaptProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Adaptation task: Shorten") &&
            request.prompt.includes("Workflow adaptation style") &&
            request.prompt.includes("Project style instructions:") &&
            request.prompt.includes("Translation memory hints:") &&
            request.prompt.includes("Project glossary hints:") &&
            request.prompt.includes(adaptTargetTerm) &&
            request.system.includes("target adaptation assistant"),
          "AI draft adaptation command sends adaptation prompt with style, TM, and termbase context"
        );
        return {
          text: `Open {name} with ${adaptTargetTerm}.`,
          provider: "Mock Adapt AI",
          providerId: "ollama",
          model: "workflow-adapt-model"
        };
      };
      const aiAdaptSaved = await adaptActiveSegmentDraftWithLocalAi();
      const aiAdaptStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      const aiAdaptStoredProject = (await listProjects()).find((item) => item.id === project.id);
      assert(
        aiAdaptSaved &&
          aiAdaptStored?.target === aiAdaptOriginalTarget &&
          (aiAdaptStored?.aiSuggestions || []).length === aiAdaptOriginalSuggestionCount + 1 &&
          aiAdaptStored?.aiSuggestions?.some((suggestion) => suggestion.provider === "Mock Adapt AI" && suggestion.suggestedTarget.includes(adaptTargetTerm)) &&
          aiAdaptStoredProject?.aiSettings?.localAdaptMode === "shorten" &&
          els.localAiPromptOutput.textContent.includes(adaptTargetTerm),
        "AI draft adaptation active segment saves review suggestion without overwriting target"
      );
    } finally {
      aiAdaptProvider.completePrompt = originalAiAdaptCompletePrompt;
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = originalAiAdaptMode;
      if (aiAdaptTerm?.id) await deleteTerm(aiAdaptTerm.id);
      if (aiAdaptTmEntry?.id) await deleteTmEntry(aiAdaptTmEntry.id);
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings(aiAdaptProjectSettingsSnapshot)
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const aiAdaptRestoreRevision = Number(state.segments[segmentIndex]?.revision || 0);
      Reflect.ownKeys(state.segments[segmentIndex]).forEach((key) => delete state.segments[segmentIndex][key]);
      Object.assign(state.segments[segmentIndex], aiAdaptSegmentSnapshot);
      state.segments[segmentIndex].revision = Math.max(Number(aiAdaptSegmentSnapshot.revision || 0), aiAdaptRestoreRevision) + 1;
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      clearPendingSave(state.segments[segmentIndex]);
      const restoredAiAdaptSegment = await saveSegment(state.segments[segmentIndex]);
      Object.assign(state.segments[segmentIndex], restoredAiAdaptSegment);
      prepareSegmentHistoryState(state.segments[segmentIndex]);
      updateRow(segmentIndex);
    }

    const aiBatchAdaptProvider = aiProviderService.get("ollama");
    const originalAiBatchAdaptCompletePrompt = aiBatchAdaptProvider.completePrompt;
    const aiBatchAdaptProjectSettingsSnapshot = structuredClone(state.project.aiSettings || {});
    const originalAiBatchAdaptFilters = {
      documentFilter: currentDocumentId(),
      segmentQuery: currentEditorFilters().query,
      segmentSearchScope: currentEditorFilters().scope,
      segmentRegex: currentEditorFilters().regex,
      segmentCaseSensitive: currentEditorFilters().caseSensitive,
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      localAiMode: els.localAiModeSelect?.value || "",
      localAiAdaptMode: els.localAiAdaptModeSelect?.value || "",
      activeSegmentId: state.segments[segmentIndex]?.id || ""
    };
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-batch-adapt-model";
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = "shorten";
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings({
          ...state.project.aiSettings,
          styleGuide: "Workflow batch adaptation style: keep UI drafts compact."
        })
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      await importLocalization(new File(["<!doctype html><html><body><p>Workflow batch adapt alpha source.</p><p>Workflow batch adapt beta source.</p><p>Workflow batch adapt failure source.</p><p>Workflow batch adapt locked source.</p></body></html>"], "workflow-ai-batch-adapt.html", { type: "text/html" }));
      const aiBatchAdaptDocument = state.project.documents.find((item) => item.name === "workflow-ai-batch-adapt.html");
      await openProjectFile(aiBatchAdaptDocument.id);
      updateEditorFilters({
        query: "",
        scope: "both",
        regex: false,
        caseSensitive: false,
        status: "all",
        reviewState: ""
      });
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      const aiBatchAdaptIndexes = state.segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => segment.documentId === aiBatchAdaptDocument.id);
      for (const { segment } of aiBatchAdaptIndexes) {
        const source = String(segment.source || "");
        const target = source.includes("alpha")
          ? "Workflow batch adapt alpha verbose draft"
          : source.includes("beta")
            ? "Workflow batch adapt beta verbose draft"
            : source.includes("failure")
              ? "Workflow batch adapt failure verbose draft"
              : "Workflow batch adapt locked verbose draft";
        setSegmentTargetAndStatus(segment, target, "draft", "batch-adapt-test");
        segment.locked = source.includes("locked");
        touchSegment(segment);
        clearPendingSave(segment);
      }
      const savedAiBatchAdaptSegments = await saveSegments(aiBatchAdaptIndexes.map(({ segment }) => segment));
      savedAiBatchAdaptSegments.forEach((savedSegment) => {
        const index = state.segments.findIndex((segment) => segment.id === savedSegment.id);
        if (index === -1) return;
        Object.assign(state.segments[index], savedSegment);
        prepareSegmentHistoryState(state.segments[index]);
      });
      aiBatchAdaptProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Adaptation task: Shorten") &&
            request.prompt.includes("Current target") &&
            request.system.includes("target adaptation assistant"),
          "AI batch draft adaptation sends adaptation prompts with mode and draft context"
        );
        if (request.prompt.includes("Workflow batch adapt failure verbose draft")) throw new Error("Mock batch adaptation failure");
        if (request.prompt.includes("Workflow batch adapt alpha verbose draft")) {
          return {
            text: "Workflow batch adapt alpha short",
            provider: "Mock Batch Adapt AI",
            providerId: "ollama",
            model: "workflow-batch-adapt-model"
          };
        }
        if (request.prompt.includes("Workflow batch adapt beta verbose draft")) {
          return {
            text: "Workflow batch adapt beta short",
            provider: "Mock Batch Adapt AI",
            providerId: "ollama",
            model: "workflow-batch-adapt-model"
          };
        }
        return {
          text: "Workflow batch adapt unchanged",
          provider: "Mock Batch Adapt AI",
          providerId: "ollama",
          model: "workflow-batch-adapt-model"
        };
      };
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = "shorten";
      const aiBatchAdaptSummary = await adaptBatchDraftsWithLocalAi();
      const aiBatchAdaptStored = await getProjectSegments(project.id);
      const aiBatchAdaptSegments = aiBatchAdaptStored.filter((segment) => segment.documentId === aiBatchAdaptDocument.id);
      const failedBatchAdaptSegment = aiBatchAdaptSegments.find((segment) => String(segment.source || "").includes("failure"));
      const lockedBatchAdaptSegment = aiBatchAdaptSegments.find((segment) => String(segment.source || "").includes("locked"));
      assert(aiBatchAdaptSummary?.total === 3, "AI batch adaptation selects eligible draft segments");
      assert(aiBatchAdaptSummary?.suggested === 2, "AI batch adaptation creates two review suggestions");
      assert(aiBatchAdaptSummary?.failed === 1, "AI batch adaptation records one segment failure");
      assert(aiBatchAdaptSummary?.skipped === 1, "AI batch adaptation skips the locked segment");
      assert(aiBatchAdaptSegments.every((segment) => String(segment.target || "").includes("draft")), "AI batch adaptation does not overwrite draft targets");
      assert(
        aiBatchAdaptSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch adapt alpha short")) &&
          aiBatchAdaptSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch adapt beta short")),
        "AI batch adaptation persists successful suggestions"
      );
      assert(!(failedBatchAdaptSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Batch Adapt AI"), "AI batch adaptation does not save suggestions for failed segments");
      assert(!(lockedBatchAdaptSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Batch Adapt AI"), "AI batch adaptation does not save suggestions for locked segments");
      assert(els.localAiPromptOutput.textContent.includes("2 adaptation suggestions saved"), "AI batch adaptation reports saved suggestion count");
      assert(els.localAiPromptOutput.textContent.includes("Mock batch adaptation failure"), "AI batch adaptation reports segment-level failures");
      assert(
        aiBatchAdaptSummary?.suggested === 2 &&
          aiBatchAdaptSummary?.failed === 1 &&
          aiBatchAdaptSummary?.skipped === 1 &&
          aiBatchAdaptSegments.every((segment) => String(segment.target || "").includes("draft")) &&
          aiBatchAdaptSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch adapt alpha short")) &&
          aiBatchAdaptSegments.some((segment) => segment.aiSuggestions?.some((suggestion) => suggestion.suggestedTarget === "Workflow batch adapt beta short")) &&
          !(failedBatchAdaptSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Batch Adapt AI") &&
          !(lockedBatchAdaptSegment?.aiSuggestions || []).some((suggestion) => suggestion.provider === "Mock Batch Adapt AI") &&
          els.localAiPromptOutput.textContent.includes("2 adaptation suggestions saved") &&
          els.localAiPromptOutput.textContent.includes("Mock batch adaptation failure"),
        "AI batch adaptation saves review suggestions without overwriting drafts"
      );
    } finally {
      aiBatchAdaptProvider.completePrompt = originalAiBatchAdaptCompletePrompt;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalAiBatchAdaptFilters.localAiMode;
      if (els.localAiAdaptModeSelect) els.localAiAdaptModeSelect.value = originalAiBatchAdaptFilters.localAiAdaptMode;
      selectApplicationDocument(originalAiBatchAdaptFilters.documentFilter);
      updateEditorFilters({
        query: originalAiBatchAdaptFilters.segmentQuery,
        scope: originalAiBatchAdaptFilters.segmentSearchScope,
        regex: originalAiBatchAdaptFilters.segmentRegex,
        caseSensitive: originalAiBatchAdaptFilters.segmentCaseSensitive,
        status: originalAiBatchAdaptFilters.segmentStatusFilter,
        reviewState: originalAiBatchAdaptFilters.reviewStateFilter
      });
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings(aiBatchAdaptProjectSettingsSnapshot)
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
      renderDocumentFilter();
      renderSegments();
      const restoreBatchAdaptIndex = state.segments.findIndex((segment) => segment.id === originalAiBatchAdaptFilters.activeSegmentId);
      if (restoreBatchAdaptIndex >= 0) await setActiveSegment(restoreBatchAdaptIndex);
    }

    const aiTermsProvider = aiProviderService.get("ollama");
    const originalAiTermsCompletePrompt = aiTermsProvider.completePrompt;
    const originalAiTermsMode = els.localAiModeSelect?.value || "";
    const originalAiTermsDocumentFilter = currentDocumentId();
    const originalAiTermsActiveIndex = currentActiveIndex();
    let aiExtractedTermIds = [];
    let aiTermsPromptCount = 0;
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-terms-model";
      renderTermbaseSelect();
      if (els.termBaseSelect) els.termBaseSelect.value = "Workflow TB";
      aiTermsProvider.completePrompt = async (_config, request) => {
        aiTermsPromptCount += 1;
        assert(
          request.prompt.includes("Return only a JSON array") &&
            request.prompt.includes("sourceTerm, targetTerm, note") &&
            request.prompt.includes("Source English text:") &&
            request.system.includes("terminology extraction assistant"),
          "AI term extraction command sends terminology prompt instead of translation prompt"
        );
        if (aiTermsPromptCount > 1) {
          return {
            text: JSON.stringify([
              { sourceTerm: `workflow ai batch source term ${aiTermsPromptCount}`, targetTerm: `workflow ai batch target term ${aiTermsPromptCount}`, note: "Workflow batch candidate" }
            ]),
            provider: "Mock Terms AI",
            providerId: "ollama",
            model: "workflow-terms-model"
          };
        }
        return {
          text: JSON.stringify([
            { sourceTerm: "workflow ai source term", targetTerm: "workflow ai target term", note: "Workflow test candidate" },
            { sourceTerm: "workflow ai second term", targetTerm: "workflow ai second target", note: "Workflow test second candidate" }
          ]),
          provider: "Mock Terms AI",
          providerId: "ollama",
          model: "workflow-terms-model"
        };
      };
      const aiTermsSaved = await extractActiveSegmentTermsWithLocalAi();
      const aiTermsStored = (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: ["Workflow TB"] }))
        .filter((term) => term.sourceTerm.startsWith("workflow ai "));
      aiExtractedTermIds = aiTermsStored.map((term) => term.id);
      assert(
        aiTermsSaved &&
          aiTermsStored.length === 2 &&
          aiTermsStored.some((term) => term.sourceTerm === "workflow ai source term" && term.targetTerm === "workflow ai target term") &&
          aiTermsStored.every((term) => term.notes.includes("AI extracted term candidate")) &&
          els.localAiPromptOutput.textContent.includes("workflow ai second term"),
        "AI term extraction active segment saves candidates to the project termbase"
      );
      await importLocalization(new File(["<!doctype html><html><body><p>Workflow batch source alpha.</p><p>Workflow batch source beta.</p></body></html>"], "workflow-ai-batch-terms.html", { type: "text/html" }));
      const aiBatchTermsDocument = state.project.documents.find((item) => item.name === "workflow-ai-batch-terms.html");
      await openProjectFile(aiBatchTermsDocument.id);
      if (els.localAiModeSelect) els.localAiModeSelect.value = "visible";
      const batchTermsResult = await extractBatchTermsWithLocalAi();
      const aiBatchTermsStored = (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: ["Workflow TB"] }))
        .filter((term) => term.sourceTerm.startsWith("workflow ai batch source term"));
      aiExtractedTermIds.push(...aiBatchTermsStored.map((term) => term.id));
      assert(
        batchTermsResult?.savedTerms?.length >= 2 &&
          aiBatchTermsStored.length >= 2 &&
          els.localAiPromptOutput.textContent.includes("workflow ai batch source term") &&
          els.saveStatus.textContent.includes("batch AI term extraction"),
        "AI batch term extraction saves candidates from visible segments"
      );
    } finally {
      aiTermsProvider.completePrompt = originalAiTermsCompletePrompt;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalAiTermsMode;
      selectApplicationDocument(originalAiTermsDocumentFilter);
      renderDocumentFilter();
      renderSegments();
      if (Number.isInteger(originalAiTermsActiveIndex) && originalAiTermsActiveIndex >= 0) await setActiveSegment(originalAiTermsActiveIndex);
      if (aiExtractedTermIds.length) {
        await deleteTerms(aiExtractedTermIds);
        markProjectsUsingResourceDirty("termbase", "Workflow TB", state.project.sourceLang, state.project.targetLang);
        await refreshProjectTerms({ rerender: true });
        await refreshTerms();
      }
    }

    const aiBriefProvider = aiProviderService.get("ollama");
    const originalAiBriefCompletePrompt = aiBriefProvider.completePrompt;
    const originalAiBriefSettings = structuredClone(state.project.aiSettings || {});
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-brief-model";
      els.aiStyleGuideInput.value = "Existing workflow style instruction.";
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings({
          ...state.project.aiSettings,
          styleGuide: els.aiStyleGuideInput.value
        })
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      aiBriefProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Create a concise translation project brief") &&
            request.prompt.includes("Domain, Audience, Tone, Terminology, Formatting, Risks") &&
            request.prompt.includes("Representative segments:") &&
            request.system.includes("project brief assistant"),
          "AI project brief command sends project context prompt instead of translation prompt"
        );
        return {
          text: "Domain\n- Workflow localization.\nTone\n- Clear and action-oriented.\nRisks\n- Preserve UI labels.",
          provider: "Mock Brief AI",
          providerId: "ollama",
          model: "workflow-brief-model"
        };
      };
      const aiBriefSaved = await generateProjectBriefWithLocalAi();
      const storedBriefProject = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        aiBriefSaved &&
          state.project.aiSettings?.styleGuide.includes("Existing workflow style instruction.") &&
          state.project.aiSettings?.styleGuide.includes("AI project brief:") &&
          state.project.aiSettings?.styleGuide.includes("Workflow localization") &&
          storedBriefProject?.aiSettings?.styleGuide === state.project.aiSettings?.styleGuide &&
          els.aiStyleGuideInput.value.includes("AI project brief:") &&
          els.localAiPromptOutput.textContent.includes("Preserve UI labels"),
        "AI project brief saves generated instructions without replacing existing style guide"
      );
    } finally {
      aiBriefProvider.completePrompt = originalAiBriefCompletePrompt;
      state.project = await updateProject({
        ...state.project,
        aiSettings: defaultAiSettings(originalAiBriefSettings)
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      if (els.aiStyleGuideInput) els.aiStyleGuideInput.value = state.project.aiSettings?.styleGuide || "";
    }

    const aiSuggestionBaseline = structuredClone(state.segments[segmentIndex]);
    const failedAiSuggestion = {
      id: makeId("ai-suggestion"),
      provider: "Test provider",
      model: "workflow-test",
      suggestedTarget: "Unsaved AI suggestion target",
      explanation: ["Must roll back when suggestion save fails."]
    };
    setHiddenSegmentField(state.segments[segmentIndex], AI_APPEND_SAVE_FAILURE_TEST_FLAG, true);
    const failedAiSuggestionSave = await appendAiSuggestion(state.segments[segmentIndex], failedAiSuggestion, "ai-test-suggestion", "AI suggestion created");
    const failedAiSuggestionStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      !failedAiSuggestionSave &&
        els.saveStatus.textContent.includes("Simulated AI suggestion save failure") &&
        (state.segments[segmentIndex].aiSuggestions || []).length === (aiSuggestionBaseline.aiSuggestions || []).length &&
        (failedAiSuggestionStored?.aiSuggestions || []).length === (aiSuggestionBaseline.aiSuggestions || []).length,
      "AI suggestion save failure restores visible and persisted suggestion list"
    );
    const savedAiSuggestion = {
      id: makeId("ai-suggestion"),
      provider: "Test provider",
      model: "workflow-test",
      source: "Duplicated AI suggestion source text must not be stored locally.",
      suggestedTarget: "Saved AI suggestion target",
      explanation: ["Saved local suggestion for workflow test."],
      responseId: "workflow-response-id-that-must-not-store",
      customEndpoint: "https://provider.example/trace-that-must-not-store"
    };
    const successfulAiSuggestionSave = await appendAiSuggestion(state.segments[segmentIndex], savedAiSuggestion, "ai-test-suggestion", "AI suggestion created");
    const savedAiSuggestionStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    const savedAiSuggestionRecordJson = JSON.stringify(savedAiSuggestionStored?.aiSuggestions?.find((suggestion) => suggestion.id === savedAiSuggestion.id) || {});
    const savedAiSuggestionActivityJson = JSON.stringify(currentActivityEvents().find((event) => event.type === "ai-test-suggestion" && event.detail?.segmentId === state.segments[segmentIndex].id) || {});
    assert(
      successfulAiSuggestionSave &&
        savedAiSuggestionStored?.aiSuggestions?.some((suggestion) => suggestion.id === savedAiSuggestion.id),
      "AI suggestion save persists suggestion list"
    );
    assert(
      !savedAiSuggestionRecordJson.includes("Duplicated AI suggestion source text") &&
        !savedAiSuggestionRecordJson.includes("workflow-response-id-that-must-not-store") &&
        !savedAiSuggestionRecordJson.includes("trace-that-must-not-store") &&
        !savedAiSuggestionActivityJson.includes("workflow-response-id-that-must-not-store"),
      "AI suggestion save strips provider trace metadata before local storage"
    );
    const draftedPackageActivity = draftProjectActivityEvent(project, "export", "Package export Bearer workflow-draft-activity-summary-token-that-must-not-store", {
      filename: "Bearer workflow-draft-activity-file-token-that-must-not-store.loopcat.json",
      prompt: "Draft activity prompt trace must not be stored.",
      promptTemplate: "Draft activity prompt template must not be stored.",
      responseId: "workflow-draft-activity-response-id-that-must-not-store",
      providerRequestId: "workflow-draft-activity-request-id-that-must-not-store",
      providerResponseId: "workflow-draft-activity-provider-response-id-that-must-not-store",
      customEndpoint: "https://provider.example/draft-activity-trace-that-must-not-store",
      nested: {
        keep: "ordinary draft detail",
        authorizationHeader: "Bearer workflow-draft-activity-auth-token-that-must-not-store"
      },
      keep: "ordinary draft detail"
    });
    const draftedPackageActivityJson = JSON.stringify(draftedPackageActivity);
    assert(
      draftedPackageActivity.type === "export" &&
        draftedPackageActivity.summary.includes("[redacted secret]") &&
        draftedPackageActivity.detail.filename.includes("[redacted secret]") &&
        draftedPackageActivity.detail.keep === "ordinary draft detail" &&
        draftedPackageActivity.detail.nested.keep === "ordinary draft detail" &&
        !draftedPackageActivityJson.includes("Draft activity prompt trace") &&
        !draftedPackageActivityJson.includes("workflow-draft-activity-response-id") &&
        !draftedPackageActivityJson.includes("workflow-draft-activity-request-id") &&
        !draftedPackageActivityJson.includes("workflow-draft-activity-provider-response-id") &&
        !draftedPackageActivityJson.includes("draft-activity-trace-that-must-not-store") &&
        !draftedPackageActivityJson.includes("workflow-draft-activity-file-token-that-must-not-store") &&
        !draftedPackageActivityJson.includes("workflow-draft-activity-auth-token-that-must-not-store"),
      "draft project activity events strip provider trace metadata before direct package or workspace storage"
    );
    const activityWarningAiSuggestion = {
      id: makeId("ai-suggestion"),
      provider: "Test provider",
      model: "workflow-test",
      suggestedTarget: "AI suggestion saved while activity log fails",
      explanation: ["Activity log failure warning fixture."]
    };
    setHiddenSegmentField(state.segments[segmentIndex], AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG, true);
    const aiSuggestionActivityWarning = await appendAiSuggestion(state.segments[segmentIndex], activityWarningAiSuggestion, "ai-test-suggestion", "AI suggestion created");
    const aiSuggestionActivityWarningStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      aiSuggestionActivityWarning?.ok &&
        aiSuggestionActivityWarning.activityLogged === false &&
        aiSuggestionActivityWarningStored?.aiSuggestions?.some((suggestion) => suggestion.id === activityWarningAiSuggestion.id) &&
        els.saveStatus.textContent.includes("activity log failed") &&
        state.workspaceDirtyProjectIds.has(project.id),
      "AI suggestion activity log failure reports warning after successful suggestion save"
    );
    Reflect.deleteProperty(state.segments[segmentIndex], AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG);
    const aiApplyTargetBeforeFailure = state.segments[segmentIndex].target;
    const aiApplyHistoryBeforeFailure = state.segments[segmentIndex].targetHistory?.length || 0;
    setHiddenSegmentField(state.segments[segmentIndex], AI_APPLY_SAVE_FAILURE_TEST_FLAG, true);
    const failedAiApply = await applyAiSuggestion(savedAiSuggestion.id);
    const failedAiApplyStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      !failedAiApply &&
        els.saveStatus.textContent.includes("Simulated AI apply save failure") &&
        state.segments[segmentIndex].target === aiApplyTargetBeforeFailure &&
        (state.segments[segmentIndex].targetHistory?.length || 0) === aiApplyHistoryBeforeFailure &&
        failedAiApplyStored?.target === aiApplyTargetBeforeFailure,
      "AI suggestion apply failure restores visible and persisted target text"
    );
    setHiddenSegmentField(state.segments[segmentIndex], AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG, true);
    const aiApplyActivityWarning = await applyAiSuggestion(activityWarningAiSuggestion.id);
    const aiApplyActivityWarningStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      aiApplyActivityWarning &&
        aiApplyActivityWarningStored?.target === activityWarningAiSuggestion.suggestedTarget &&
        els.saveStatus.textContent.includes("activity log failed") &&
        state.workspaceDirtyProjectIds.has(project.id),
      "AI suggestion apply activity log failure reports warning after successful target save"
    );
    Reflect.deleteProperty(state.segments[segmentIndex], AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG);
    const successfulAiApply = await applyAiSuggestion(savedAiSuggestion.id);
    const savedAiApplyStored = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
    assert(
      successfulAiApply &&
        savedAiApplyStored?.target === savedAiSuggestion.suggestedTarget,
      "AI suggestion apply persists target text"
    );

    state.qaChecks = [{ id: "existing-qa-fixture", type: "existing", severity: "info", segmentId: state.segments[segmentIndex].id, label: "fixture", message: "Existing QA fixture." }];
    renderQaResults();
    setHiddenSegmentField(state.project, QA_RUN_FAILURE_TEST_FLAG, true);
    const failedQaRun = await runProjectQa();
    assert(
      failedQaRun === null &&
        els.saveStatus.textContent.includes("Simulated QA run failure") &&
        state.qaChecks.some((check) => check.id === "existing-qa-fixture"),
      "QA run failure reports visible status and preserves previous QA results"
    );
    Reflect.deleteProperty(state.project, QA_RUN_FAILURE_TEST_FLAG);
    setHiddenSegmentField(state.project, QA_ACTIVITY_FAILURE_TEST_FLAG, true);
    const qaWithActivityFailure = await runProjectQa();
    assert(
      Array.isArray(qaWithActivityFailure) &&
        els.saveStatus.textContent.startsWith("QA found") &&
        !state.qaChecks.some((check) => check.id === "existing-qa-fixture"),
      "QA activity log failure still renders fresh QA results"
    );
    Reflect.deleteProperty(state.project, QA_ACTIVITY_FAILURE_TEST_FLAG);
    const successfulQaRun = await runProjectQa();
    assert(Array.isArray(successfulQaRun) && els.saveStatus.textContent.startsWith("QA found"), "QA run reports visible result status");

    clearWorkspaceDirtyMarkers();
    await setActiveSegment(segmentIndex);
    const originalWindowConfirm = window.confirm;
    const originalFetch = window.fetch;
    const originalStorageSetItem = Storage.prototype.setItem;
    const originalAiSettings = state.project.aiSettings;
    const originalLocalOpenAiKey = localStorage.getItem(OPENAI_KEY_STORAGE);
    const originalSessionOpenAiKey = sessionStorage.getItem(OPENAI_KEY_STORAGE);
    const openAiConfirms = [];
    window.confirm = (message) => {
      openAiConfirms.push(message);
      return true;
    };
    try {
      sessionStorage.removeItem(OPENAI_KEY_STORAGE);
      localStorage.removeItem(OPENAI_KEY_STORAGE);
      els.openAiApiKeyInput.value = "sk-blocked-openai-key";
      els.rememberOpenAiKeyInput.checked = true;
      els.aiProviderInput.value = "OpenAI";
      els.aiModelInput.value = "test-model";
      els.aiUseTmInput.checked = false;
      els.aiUseTbInput.checked = false;
      els.aiStyleGuideInput.value = "";
      els.aiEnabledInput.checked = true;
      els.aiSendSourceInput.checked = true;
      setHiddenSegmentField(state.project, AI_SETTINGS_SAVE_FAILURE_TEST_FLAG, true);
      const failedAiSettingsSave = await saveAiSettings();
      assert(
        !failedAiSettingsSave &&
          els.saveStatus.textContent.includes("Simulated AI settings save failure") &&
          !storedOpenAiKey() &&
          JSON.stringify(state.project.aiSettings || {}) === JSON.stringify(originalAiSettings || {}),
        "AI settings save failure reports visible status without storing API key"
      );
      Reflect.deleteProperty(state.project, AI_SETTINGS_SAVE_FAILURE_TEST_FLAG);
      localStorage.setItem(OPENAI_KEY_STORAGE, "sk-existing-openai-key");
      setHiddenSegmentField(state, OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG, true);
      const failedOpenAiKeyStorageSave = await saveAiSettings();
      const storedProjectAfterKeyStorageFailure = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !failedOpenAiKeyStorageSave &&
          els.saveStatus.textContent.includes("Simulated OpenAI key storage failure") &&
          storedOpenAiKey() === "sk-existing-openai-key" &&
          JSON.stringify(state.project.aiSettings || {}) === JSON.stringify(originalAiSettings || {}) &&
          JSON.stringify(storedProjectAfterKeyStorageFailure?.aiSettings || {}) === JSON.stringify(originalAiSettings || {}),
        "OpenAI key storage failure restores previous key and project settings"
      );
      Reflect.deleteProperty(state, OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG);
      Storage.prototype.setItem = function setItemWithOpenAiFailure(key, value) {
        if (this === localStorage && key === OPENAI_KEY_STORAGE && value === "sk-browser-storage-failure") {
          throw new Error("Simulated browser OpenAI key storage failure");
        }
        return originalStorageSetItem.call(this, key, value);
      };
      els.openAiApiKeyInput.value = "sk-browser-storage-failure";
      const failedBrowserOpenAiKeyStorageSave = await saveAiSettings();
      const storedProjectAfterBrowserKeyFailure = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !failedBrowserOpenAiKeyStorageSave &&
          els.saveStatus.textContent.includes("OpenAI key could not be saved") &&
          storedOpenAiKey() === "sk-existing-openai-key" &&
          JSON.stringify(state.project.aiSettings || {}) === JSON.stringify(originalAiSettings || {}) &&
          JSON.stringify(storedProjectAfterBrowserKeyFailure?.aiSettings || {}) === JSON.stringify(originalAiSettings || {}),
        "browser OpenAI key storage method failure restores previous key and project settings"
      );
      Storage.prototype.setItem = originalStorageSetItem;
      els.openAiApiKeyInput.value = "sk-blocked-openai-key";
      const successfulAiSettingsSave = await saveAiSettings();
      assert(
        successfulAiSettingsSave &&
          storedOpenAiKey() === "sk-blocked-openai-key" &&
          state.project.aiSettings?.enabled === true,
        "AI settings save persists project settings after storing API key"
      );
      els.openAiApiKeyInput.value = "";
      els.aiModelInput.value = "test-model-key-preserved";
      const preservedKeySettingsSave = await saveAiSettings();
      assert(
        preservedKeySettingsSave &&
          storedOpenAiKey() === "sk-blocked-openai-key" &&
          state.project.aiSettings?.model === "test-model-key-preserved",
        "AI settings save with blank key field preserves existing browser key"
      );
      els.aiProviderInput.value = "Bearer workflow-ai-provider-token-that-must-redact";
      els.aiModelInput.value = "Bearer workflow-ai-model-token-that-must-redact";
      els.openAiApiKeyInput.value = "sk-ai-provider-model-redaction-key-that-must-not-store";
      const redactedAiSettingsMetadataSave = await saveAiSettings();
      const redactedAiSettingsMetadataActivity = currentActivityEvents().find(
        (event) =>
          event.type === "ai-settings" &&
          String(event.detail?.provider || "").includes("[redacted secret]") &&
          String(event.detail?.model || "").includes("[redacted secret]")
      );
      const storedProjectAfterAiSettingsMetadataRedaction = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        redactedAiSettingsMetadataSave &&
          storedOpenAiKey() === "sk-blocked-openai-key" &&
          !JSON.stringify(state.project.aiSettings || {}).includes("workflow-ai-provider-token-that-must-redact") &&
          !JSON.stringify(state.project.aiSettings || {}).includes("workflow-ai-model-token-that-must-redact") &&
          JSON.stringify(state.project.aiSettings || {}).includes("[redacted secret]") &&
          JSON.stringify(storedProjectAfterAiSettingsMetadataRedaction?.aiSettings || {}) === JSON.stringify(state.project.aiSettings || {}) &&
          redactedAiSettingsMetadataActivity &&
          !JSON.stringify(redactedAiSettingsMetadataActivity).includes("workflow-ai-provider-token-that-must-redact") &&
          !JSON.stringify(redactedAiSettingsMetadataActivity).includes("workflow-ai-model-token-that-must-redact") &&
          redactedAiSettingsMetadataActivity.detail?.keyStorage === "Not applicable",
        "AI settings save redacts credential-looking provider and model metadata without storing typed OpenAI keys"
      );
      els.aiProviderInput.value = "Anthropic";
      els.aiModelInput.value = "test-model-non-openai-provider";
      els.openAiApiKeyInput.value = "sk-non-openai-provider-should-not-store";
      const nonOpenAiProviderSettingsSave = await saveAiSettings();
      const nonOpenAiProviderSettingsActivity = currentActivityEvents().find(
        (event) =>
          event.type === "ai-settings" &&
          event.detail?.provider === "Anthropic" &&
          event.detail?.model === "test-model-non-openai-provider"
      );
      assert(
        nonOpenAiProviderSettingsSave &&
          storedOpenAiKey() === "sk-blocked-openai-key" &&
          state.project.aiSettings?.provider === "Anthropic" &&
          state.project.aiSettings?.model === "test-model-non-openai-provider" &&
          nonOpenAiProviderSettingsActivity?.detail?.keyStorage === "Not applicable",
        "AI settings save does not store typed OpenAI key or report OpenAI key storage when provider is not OpenAI"
      );
      els.aiProviderInput.value = "OpenAI";
      state.project = await updateProject({
        ...state.project,
        aiSettings: {
          ...state.project.aiSettings,
          apiKey: "sk-local-ai-metadata-that-must-strip",
          bearerToken: "bearer-local-ai-metadata-that-must-strip",
          apiKeyMode: "sk-abused-api-key-mode-that-must-normalize",
          styleGuide: "Use Bearer ai-style-token-that-must-redact"
        }
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const storedProjectAfterAiMetadataNormalization = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !JSON.stringify(state.project.aiSettings || {}).includes("sk-local-ai-metadata") &&
          !JSON.stringify(state.project.aiSettings || {}).includes("bearer-local-ai-metadata") &&
          !JSON.stringify(state.project.aiSettings || {}).includes("ai-style-token-that-must-redact") &&
          JSON.stringify(state.project.aiSettings || {}).includes("[redacted secret]") &&
          state.project.aiSettings?.apiKeyMode === "bring-your-own" &&
          JSON.stringify(storedProjectAfterAiMetadataNormalization?.aiSettings || {}) === JSON.stringify(state.project.aiSettings || {}),
        "project updates normalize AI settings and strip secret-shaped metadata and style instructions"
      );
      els.aiModelInput.value = "test-model-activity-warning";
      els.openAiApiKeyInput.value = "sk-ai-settings-activity-warning-key";
      setHiddenSegmentField(state.project, AI_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG, true);
      const aiSettingsActivityWarning = await saveAiSettings();
      const storedProjectAfterAiSettingsActivityWarning = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        aiSettingsActivityWarning &&
          storedOpenAiKey() === "sk-ai-settings-activity-warning-key" &&
          state.project.aiSettings?.model === "test-model-activity-warning" &&
          storedProjectAfterAiSettingsActivityWarning?.aiSettings?.model === "test-model-activity-warning" &&
          els.saveStatus.textContent.includes("activity log failed") &&
          state.workspaceDirtyProjectIds.has(project.id),
        "AI settings activity log failure reports warning after successful settings save"
      );
      Reflect.deleteProperty(state.project, AI_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG);
      sessionStorage.removeItem(OPENAI_KEY_STORAGE);
      localStorage.removeItem(OPENAI_KEY_STORAGE);
      els.aiEnabledInput.checked = false;
      els.aiSendSourceInput.checked = true;
      await createOpenAiSuggestion();
      assert(!storedOpenAiKey() && els.saveStatus.textContent.includes("Enable AI helpers"), "blocked OpenAI suggestion does not save typed key when AI helpers are disabled");
      els.aiEnabledInput.checked = true;
      els.aiSendSourceInput.checked = false;
      await createOpenAiSuggestion();
      assert(!storedOpenAiKey() && els.saveStatus.textContent.includes("source sharing"), "blocked OpenAI suggestion does not save typed key when source sharing is disabled");
      els.aiSendSourceInput.checked = true;
      els.aiProviderInput.value = "Anthropic";
      await createOpenAiSuggestion();
      assert(!storedOpenAiKey() && els.saveStatus.textContent.includes("Choose OpenAI"), "blocked OpenAI suggestion does not save typed key when a different provider is selected");
      els.aiProviderInput.value = "OpenAI";
      els.aiModelInput.value = "model-empty-source-must-not-save";
      els.openAiApiKeyInput.value = "sk-openai-empty-source-key";
      els.rememberOpenAiKeyInput.checked = true;
      const aiSettingsBeforeEmptySourceOpenAi = structuredClone(state.project.aiSettings || {});
      const openAiConfirmCountBeforeEmptySource = openAiConfirms.length;
      const sourceBeforeEmptySourceOpenAi = state.segments[segmentIndex].source;
      state.segments[segmentIndex].source = "";
      try {
        await createOpenAiSuggestion();
      } finally {
        state.segments[segmentIndex].source = sourceBeforeEmptySourceOpenAi;
      }
      const storedProjectAfterEmptySourceOpenAi = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !storedOpenAiKey() &&
          els.saveStatus.textContent.includes("no source text") &&
          openAiConfirms.length === openAiConfirmCountBeforeEmptySource &&
          state.project.aiSettings?.model !== "model-empty-source-must-not-save" &&
          JSON.stringify(storedProjectAfterEmptySourceOpenAi?.aiSettings || {}) === JSON.stringify(aiSettingsBeforeEmptySourceOpenAi),
        "blocked OpenAI suggestion does not save typed key or changed project settings when source text is empty"
      );
      els.aiModelInput.value = "model-offline-no-key-must-not-save";
      els.openAiApiKeyInput.value = "";
      els.rememberOpenAiKeyInput.checked = true;
      const aiSettingsBeforeOfflineNoKeyOpenAi = structuredClone(state.project.aiSettings || {});
      const openAiConfirmCountBeforeOfflineNoKey = openAiConfirms.length;
      const navigatorOnlineDescriptorForNoKey = Object.getOwnPropertyDescriptor(navigator, "onLine");
      try {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
        await createOpenAiSuggestion();
      } finally {
        if (navigatorOnlineDescriptorForNoKey) Object.defineProperty(navigator, "onLine", navigatorOnlineDescriptorForNoKey);
        else Reflect.deleteProperty(navigator, "onLine");
      }
      const storedProjectAfterOfflineNoKeyOpenAi = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !storedOpenAiKey() &&
          els.saveStatus.textContent.includes("appears to be offline") &&
          !els.saveStatus.textContent.includes("Add your OpenAI API key") &&
          state.project.aiSettings?.model !== "model-offline-no-key-must-not-save" &&
          JSON.stringify(storedProjectAfterOfflineNoKeyOpenAi?.aiSettings || {}) === JSON.stringify(aiSettingsBeforeOfflineNoKeyOpenAi) &&
          openAiConfirms.length === openAiConfirmCountBeforeOfflineNoKey,
        "offline OpenAI suggestion reports offline before API key requirement or settings save"
      );
      els.aiModelInput.value = "model-offline-must-not-save";
      els.openAiApiKeyInput.value = "sk-openai-offline-key";
      els.rememberOpenAiKeyInput.checked = true;
      const aiSettingsBeforeOfflineOpenAi = structuredClone(state.project.aiSettings || {});
      const openAiConfirmCountBeforeOffline = openAiConfirms.length;
      const navigatorOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
      try {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
        await createOpenAiSuggestion();
      } finally {
        if (navigatorOnlineDescriptor) Object.defineProperty(navigator, "onLine", navigatorOnlineDescriptor);
        else Reflect.deleteProperty(navigator, "onLine");
      }
      const storedProjectAfterOfflineOpenAi = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        !storedOpenAiKey() &&
          els.saveStatus.textContent.includes("appears to be offline") &&
          state.project.aiSettings?.model !== "model-offline-must-not-save" &&
          JSON.stringify(storedProjectAfterOfflineOpenAi?.aiSettings || {}) === JSON.stringify(aiSettingsBeforeOfflineOpenAi) &&
          openAiConfirms.length === openAiConfirmCountBeforeOffline,
        "offline OpenAI suggestion fails before source sharing confirmation or key/settings save"
      );
      els.aiModelInput.value = "model-canceled-before-save";
      els.openAiApiKeyInput.value = "sk-openai-canceled-key";
      els.rememberOpenAiKeyInput.checked = true;
      els.aiUseTmInput.checked = true;
      els.aiUseTbInput.checked = true;
      els.aiStyleGuideInput.value = "External AI confirmation style fixture";
      window.confirm = (message) => {
        openAiConfirms.push(message);
        return false;
      };
      await createOpenAiSuggestion();
      const storedProjectAfterOpenAiCancel = (await listProjects()).find((item) => item.id === state.project.id);
      const canceledOpenAiConfirm = openAiConfirms.find((message) => message.includes("OpenAI") && message.includes("outside LoopCAT"));
      assert(
        canceledOpenAiConfirm &&
          canceledOpenAiConfirm.includes("local TM matches") &&
          canceledOpenAiConfirm.includes("local termbase hits") &&
          canceledOpenAiConfirm.includes("style instructions") &&
          !storedOpenAiKey() &&
          els.saveStatus.textContent.includes("OpenAI suggestion canceled") &&
          state.project.aiSettings?.model !== "model-canceled-before-save" &&
          JSON.stringify(storedProjectAfterOpenAiCancel?.aiSettings || {}) === JSON.stringify(state.project.aiSettings || {}),
        "OpenAI suggestion confirmation names optional local context before key or project settings are saved"
      );
      window.confirm = (message) => {
        openAiConfirms.push(message);
        return true;
      };
      els.aiModelInput.value = "model-that-must-not-save";
      els.openAiApiKeyInput.value = "sk-openai-setup-failure-key";
      els.rememberOpenAiKeyInput.checked = true;
      setHiddenSegmentField(state.project, AI_SETTINGS_SAVE_FAILURE_TEST_FLAG, true);
      await createOpenAiSuggestion();
      assert(
        !storedOpenAiKey() &&
          els.saveStatus.textContent.includes("Simulated AI settings save failure") &&
          state.project.aiSettings?.model !== "model-that-must-not-save",
        "OpenAI suggestion setup failure does not store typed key or changed project settings"
      );
      Reflect.deleteProperty(state.project, AI_SETTINGS_SAVE_FAILURE_TEST_FLAG);
      const aiSettingsBeforeOpenAiKeyFailure = structuredClone(state.project.aiSettings || {});
      localStorage.setItem(OPENAI_KEY_STORAGE, "sk-existing-openai-key");
      els.aiModelInput.value = "model-key-storage-failure";
      els.openAiApiKeyInput.value = "sk-openai-key-storage-failure";
      els.rememberOpenAiKeyInput.checked = true;
      setHiddenSegmentField(state, OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG, true);
      await createOpenAiSuggestion();
      const storedProjectAfterOpenAiKeyFailure = (await listProjects()).find((item) => item.id === state.project.id);
      assert(
        storedOpenAiKey() === "sk-existing-openai-key" &&
          els.saveStatus.textContent.includes("Simulated OpenAI key storage failure") &&
          JSON.stringify(state.project.aiSettings || {}) === JSON.stringify(aiSettingsBeforeOpenAiKeyFailure) &&
          JSON.stringify(storedProjectAfterOpenAiKeyFailure?.aiSettings || {}) === JSON.stringify(aiSettingsBeforeOpenAiKeyFailure),
        "OpenAI suggestion key storage failure restores previous key and project settings"
      );
      Reflect.deleteProperty(state, OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG);
      els.aiEnabledInput.checked = true;
      els.aiSendSourceInput.checked = true;
      els.aiProviderInput.value = "OpenAI";
      els.aiModelInput.value = "model-provider-connection-failure";
      els.openAiApiKeyInput.value = "sk-openai-provider-connection-failure";
      els.rememberOpenAiKeyInput.checked = true;
      els.aiUseTmInput.checked = false;
      els.aiUseTbInput.checked = false;
      els.aiStyleGuideInput.value = "";
      window.confirm = (message) => {
        openAiConfirms.push(message);
        return true;
      };
      const suggestionCountBeforeOpenAiConnectionFailure = (state.segments[segmentIndex].aiSuggestions || []).length;
      window.fetch = async () => {
        throw new TypeError("Simulated OpenAI provider connection failure");
      };
      await createOpenAiSuggestion();
      window.fetch = originalFetch;
      const storedProjectAfterOpenAiConnectionFailure = (await listProjects()).find((item) => item.id === state.project.id);
      const storedSegmentAfterOpenAiConnectionFailure = (await getProjectSegments(project.id)).find((segment) => segment.id === state.segments[segmentIndex].id);
      assert(
        storedOpenAiKey() === "sk-openai-provider-connection-failure" &&
          state.project.aiSettings?.model === "model-provider-connection-failure" &&
          storedProjectAfterOpenAiConnectionFailure?.aiSettings?.model === "model-provider-connection-failure" &&
          (state.segments[segmentIndex].aiSuggestions || []).length === suggestionCountBeforeOpenAiConnectionFailure &&
          (storedSegmentAfterOpenAiConnectionFailure?.aiSuggestions || []).length === suggestionCountBeforeOpenAiConnectionFailure &&
          els.saveStatus.textContent.includes("could not connect"),
        "OpenAI provider connection failure keeps saved settings and does not create a suggestion"
      );

    } finally {
      window.confirm = originalWindowConfirm;
      window.fetch = originalFetch;
      Storage.prototype.setItem = originalStorageSetItem;
      sessionStorage.removeItem(OPENAI_KEY_STORAGE);
      localStorage.removeItem(OPENAI_KEY_STORAGE);
      if (originalLocalOpenAiKey !== null) localStorage.setItem(OPENAI_KEY_STORAGE, originalLocalOpenAiKey);
      if (originalSessionOpenAiKey !== null) sessionStorage.setItem(OPENAI_KEY_STORAGE, originalSessionOpenAiKey);
      state.project = await updateProject({ ...state.project, aiSettings: originalAiSettings });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      renderEditor();
    }
    await setActiveSegment(segmentIndex);
    const producerBeforeTyping = targetCommandPatch(state.segments[segmentIndex]);
    const producerPendingTyping = `Pending typing before copy ${Date.now()}`;
    updateSegmentDraft(segmentIndex, producerPendingTyping);
    assert(
      appRuntime.commands.editTargetSessions.has(state.segments[segmentIndex].id),
      "non-typing target producer starts with a pending EditTarget session"
    );
    clearWorkspaceDirtyMarkers();
    const copySourceCommand = await copySourceToTarget();
    const copiedSourcePatch = targetCommandPatch(state.segments[segmentIndex]);
    assert(
      copySourceCommand?.receipt?.commandId === "copy-source-to-target" &&
        copySourceCommand.receipt.provenance?.producer === "copy-source" &&
        !JSON.stringify(copySourceCommand.receipt).includes(state.segments[segmentIndex].source) &&
        !appRuntime.commands.editTargetSessions.has(state.segments[segmentIndex].id) &&
        state.workspaceDirtyProjectIds.has(project.id),
      "copy source finalizes pending typing, records a redacted command, and marks the workspace dirty"
    );
    const undoCopySource = await undoLastCommand();
    const storedAfterUndoCopy = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      undoCopySource?.receipt?.commandId === "copy-source-to-target" &&
        state.segments[segmentIndex].target === producerPendingTyping &&
        storedAfterUndoCopy?.target === producerPendingTyping,
      "first Undo after copy source restores the pending typed target and persistence"
    );
    const undoProducerTyping = await undoLastCommand();
    assert(
      undoProducerTyping?.receipt?.commandId === "edit-target" &&
        state.segments[segmentIndex].target === producerBeforeTyping.target,
      "second Undo after copy source restores the state before pending typing"
    );
    await redoLastCommand();
    const copyRedoRevisionBefore = Number(state.segments[segmentIndex].revision || 0);
    await redoLastCommand();
    const storedAfterRedoCopy = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      state.segments[segmentIndex].target === copiedSourcePatch.target &&
        JSON.stringify(state.segments[segmentIndex].targetHistory) === JSON.stringify(copiedSourcePatch.targetHistory) &&
        Number(state.segments[segmentIndex].revision || 0) > copyRedoRevisionBefore &&
        storedAfterRedoCopy?.target === copiedSourcePatch.target,
      "copy-source Redo restores target history and persistence with a monotonic revision"
    );

    clearWorkspaceDirtyMarkers();
    await setActiveSegment(segmentIndex);
    const beforeTmInsert = targetCommandPatch(state.segments[segmentIndex]);
    const tmInsertedTarget = `TM inserted target ${Date.now()}`;
    const tmInsertCommand = await insertTarget(tmInsertedTarget, { channel: "match", resourceId: "workflow-tm-match" });
    assert(
      tmInsertCommand?.receipt?.commandId === "insert-tm-target" &&
        tmInsertCommand.receipt.provenance?.channel === "match" &&
        tmInsertCommand.receipt.provenance?.resourceId === "workflow-tm-match" &&
        !JSON.stringify(tmInsertCommand.receipt).includes(tmInsertedTarget) &&
        state.workspaceDirtyProjectIds.has(project.id),
      "TM match insertion records a redacted reversible command and marks the workspace dirty"
    );
    assert(
      state.segments[segmentIndex].targetHistory?.some(
        (entry) => entry.reason === "insert-target" && entry.toTarget === tmInsertedTarget
      ),
      "TM target insertion records target revision history"
    );
    const undoTmInsert = await undoLastCommand();
    const tmUndoRevision = Number(state.segments[segmentIndex].revision || 0);
    const storedAfterTmUndo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      undoTmInsert?.receipt?.commandId === "insert-tm-target" &&
        state.segments[segmentIndex].target === beforeTmInsert.target &&
        storedAfterTmUndo?.target === beforeTmInsert.target,
      "TM target Undo restores target state and persistence"
    );
    await redoLastCommand();
    const storedAfterTmRedo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[segmentIndex].id
    );
    assert(
      state.segments[segmentIndex].target === tmInsertedTarget &&
        Number(state.segments[segmentIndex].revision || 0) > tmUndoRevision &&
        storedAfterTmRedo?.target === tmInsertedTarget,
      "TM target Redo persists the insertion with a monotonic revision"
    );
    const concordanceTarget = `Concordance inserted target ${Date.now()}`;
    const concordanceCommand = await insertTarget(concordanceTarget, {
      channel: "concordance",
      resourceId: "workflow-concordance-entry"
    });
    const undoConcordance = await undoLastCommand();
    assert(
      concordanceCommand?.receipt?.provenance?.channel === "concordance" &&
        undoConcordance?.receipt?.commandId === "insert-tm-target" &&
        state.segments[segmentIndex].target === tmInsertedTarget,
      "concordance insertion uses the same reversible target command with distinct provenance"
    );
    await redoLastCommand();
    await saveTerm({
      sourceTerm: "Hello",
      targetTerm: "forbidden-report-term",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      notes: "Report terminology fixture Bearer report-term-note-token-that-must-not-appear",
      termBaseName: "Workflow TB",
      isForbidden: true
    });
    const forbiddenDeliveryReport = validateExportReadiness({
      project: state.project,
      segments: [{ ...state.segments[segmentIndex], target: "forbidden-report-term" }],
      format: "txt",
      terms: [{ sourceTerm: "Hello", targetTerm: "forbidden-report-term", isForbidden: true }]
    });
    assert(!canRunDeliveryExport(forbiddenDeliveryReport) && forbiddenDeliveryReport.risky.some((item) => item.includes("forbidden terminology")), "delivery export gate blocks forbidden terminology");
    const emptyTargetDeliveryReport = validateExportReadiness({
      project: state.project,
      segments: [{ ...state.segments[segmentIndex], target: "" }],
      format: "txt",
      terms: []
    });
    assert(
      canRunDeliveryExport(emptyTargetDeliveryReport) &&
        emptyTargetDeliveryReport.warnings.some((item) => item.includes("will export source text")) &&
        emptyTargetDeliveryReport.exportSummary.sourceFallbackCount === 1,
      "delivery export gate permits empty target source fallback"
    );
    await setActiveSegment(segmentIndex);
    let confirmRollbackSegment = state.segments[segmentIndex];
    setHiddenSegmentField(confirmRollbackSegment, SAVE_TM_FAILURE_TEST_FLAG, true);
    const failedDirectTmSave = await saveActiveSegmentToTm();
    assert(!failedDirectTmSave && els.saveStatus.textContent.includes("Simulated TM save failure"), "direct TM save failure reports visible status");
    Reflect.deleteProperty(confirmRollbackSegment, SAVE_TM_FAILURE_TEST_FLAG);
    const successfulDirectTmSave = await saveActiveSegmentToTm();
    assert(successfulDirectTmSave && els.saveStatus.textContent === "Segment saved to TM", "direct TM save reports visible success");

    const pretranslateSource = "Pretranslate source phrase.";
    const pretranslateTarget = `TM onayli hedef ${Date.now()}`;
    const secondPretranslateSource = "Second pretranslate source phrase.";
    const secondPretranslateTarget = `Ikinci TM hedefi ${Date.now()}`;
    await importLocalization(
      new File(
        [`<!doctype html><html><body><p>${pretranslateSource}</p><p>${secondPretranslateSource}</p></body></html>`],
        "workflow-pretranslate.html",
        { type: "text/html" }
      )
    );
    const pretranslateDocument = state.project.documents.find((item) => item.name === "workflow-pretranslate.html");
    await saveTmEntry({
      source: pretranslateSource,
      target: pretranslateTarget,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: mainTmName()
    });
    await saveTmEntry({
      source: secondPretranslateSource,
      target: secondPretranslateTarget,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: mainTmName()
    });
    await openProjectFile(pretranslateDocument.id);
    const pretranslateSegmentIndex = state.segments.findIndex((segment) => segment.documentId === pretranslateDocument.id);
    const secondPretranslateSegmentIndex = state.segments.findIndex(
      (segment) => segment.documentId === pretranslateDocument.id && segment.source === secondPretranslateSource
    );
    const pretranslateSegment = state.segments[pretranslateSegmentIndex];
    const originalPrompt = window.prompt;
    let browserPromptCalls = 0;
    window.prompt = () => {
      browserPromptCalls += 1;
      return "80";
    };
    const runTmPretranslationFromDialog = async () => {
      els.segmentToolsMenuSummary.focus();
      const pending = pretranslateFromTm();
      await yieldToUi();
      assert(
        els.tmPretranslateDialog.open &&
          document.activeElement === els.tmPretranslateThresholdInput &&
          browserPromptCalls === 0,
        "TM pretranslation uses the shared in-app threshold dialog with initial focus instead of a browser prompt"
      );
      els.tmPretranslateThresholdInput.value = "80";
      els.tmPretranslateDialog.close("apply");
      return pending;
    };
    let tmPretranslationCommand = null;
    try {
      els.segmentToolsMenuSummary.focus();
      const canceledPretranslation = pretranslateFromTm();
      await yieldToUi();
      els.tmPretranslateDialog.close("cancel");
      assert(
        (await canceledPretranslation) === null && document.activeElement === els.segmentToolsMenuSummary,
        "TM threshold cancellation restores focus to the visible Segment tools control"
      );
      setHiddenSegmentField(pretranslateSegment, PRETRANSLATE_SAVE_FAILURE_TEST_FLAG, true);
      await runTmPretranslationFromDialog();
      const failedPretranslationSegments = (await getProjectSegments(project.id)).filter(
        (segment) => segment.documentId === pretranslateDocument.id
      );
      assert(
        els.saveStatus.textContent.includes("Simulated pretranslation save failure") &&
          state.segments[pretranslateSegmentIndex].target === "" &&
          state.segments[secondPretranslateSegmentIndex].target === "" &&
          failedPretranslationSegments.every((segment) => segment.target === ""),
        "TM pretranslation transaction failure restores every visible and persisted target"
      );
      tmPretranslationCommand = await runTmPretranslationFromDialog();
    } finally {
      window.prompt = originalPrompt;
    }
    const successfulPretranslationSegments = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === pretranslateDocument.id
    );
    assert(
      tmPretranslationCommand?.receipt?.commandId === "tm-pretranslate" &&
        tmPretranslationCommand.receipt.provenance?.affectedCount === 2 &&
        !JSON.stringify(tmPretranslationCommand.receipt).includes(pretranslateTarget) &&
        els.saveStatus.textContent.includes("Pretranslated 2 segments") &&
        successfulPretranslationSegments.some(
          (segment) => segment.target === pretranslateTarget && segment.tmPretranslation?.score === 100
        ) &&
        successfulPretranslationSegments.some(
          (segment) => segment.target === secondPretranslateTarget && segment.tmPretranslation?.score === 100
        ),
      "TM pretranslation saves one redacted atomic command for every matched target"
    );
    const undoTmPretranslation = await undoLastCommand();
    const tmPretranslationUndoRevisions = state.segments
      .filter((segment) => segment.documentId === pretranslateDocument.id)
      .map((segment) => Number(segment.revision || 0));
    const storedAfterTmPretranslationUndo = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === pretranslateDocument.id
    );
    assert(
      undoTmPretranslation?.receipt?.commandId === "tm-pretranslate" &&
        state.segments
          .filter((segment) => segment.documentId === pretranslateDocument.id)
          .every((segment) => !segment.target && !segment.tmPretranslation) &&
        storedAfterTmPretranslationUndo.every((segment) => !segment.target && !segment.tmPretranslation),
      "TM pretranslation Undo restores every target, history provenance, persistence, and selection"
    );
    await redoLastCommand();
    const storedAfterTmPretranslationRedo = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === pretranslateDocument.id
    );
    assert(
      state.segments
        .filter((segment) => segment.documentId === pretranslateDocument.id)
        .every(
          (segment, index) =>
            segment.targetHistory?.some((entry) => entry.reason === "pretranslate") &&
            Number(segment.revision || 0) > tmPretranslationUndoRevisions[index]
        ) &&
        storedAfterTmPretranslationRedo.some((segment) => segment.target === pretranslateTarget) &&
        storedAfterTmPretranslationRedo.some((segment) => segment.target === secondPretranslateTarget),
      "TM pretranslation Redo restores every target patch with monotonic revisions"
    );
    assert(
      Array.from(els.segmentBody.querySelectorAll(".tm-match-badge")).some((badge) => badge.textContent.includes("TM 100%")),
      "pretranslation success shows TM match rate badge near segment status"
    );

    const localAiGlossaryProvider = aiProviderService.get("ollama");
    const originalLocalAiGlossaryTranslateSegment = localAiGlossaryProvider.translateSegment;
    const originalLocalAiGlossaryCompletePrompt = localAiGlossaryProvider.completePrompt;
    const originalLocalAiGlossaryMode = els.localAiModeSelect?.value || "";
    const originalLocalAiGlossaryAiFilter = currentEditorFilters().aiState;
    let localAiGlossaryTerm = null;
    let localAiTmEntry = null;
    let localAiGlossaryRequest = null;
    try {
      const localAiGlossarySourceTerm = `workflow local ai glossary term ${Date.now()}`;
      const localAiGlossaryTargetTerm = "workflow local ai glossary target";
      const localAiGlossarySource = `Translate this ${localAiGlossarySourceTerm} carefully.`;
      const localAiContextBeforeSource = "Use the profile menu.";
      const localAiContextAfterSource = "Save the profile changes.";
      const localAiTmTarget = "Workflow TM context target";
      await importLocalization(new File([`<!doctype html><html><body><p>${localAiContextBeforeSource}</p><p>${localAiGlossarySource}</p><p>${localAiContextAfterSource}</p></body></html>`], "workflow-local-ai-glossary.html", { type: "text/html" }));
      const localAiGlossaryDocument = state.project.documents.find((item) => item.name === "workflow-local-ai-glossary.html");
      localAiGlossaryTerm = await saveTerm({
        sourceTerm: localAiGlossarySourceTerm,
        targetTerm: localAiGlossaryTargetTerm,
        notes: "Workflow Local AI glossary hint fixture.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseName: primaryTermBaseName()
      });
      localAiTmEntry = await saveTmEntry({
        source: localAiGlossarySource,
        target: localAiTmTarget,
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        projectName: state.project.name,
        tmName: mainTmName()
      });
      await openProjectFile(localAiGlossaryDocument.id);
      const localAiGlossarySegmentIndex = state.segments.findIndex((segment) => segment.documentId === localAiGlossaryDocument.id && segment.source === localAiGlossarySource);
      await setActiveSegment(localAiGlossarySegmentIndex);
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "ollama";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = OLLAMA_DEFAULT_BASE_URL;
      if (els.localAiModelInput) els.localAiModelInput.value = "workflow-glossary-pretranslate-model";
      if (els.localAiModeSelect) els.localAiModeSelect.value = "selected";
      if (els.localAiOverwriteInput) els.localAiOverwriteInput.checked = false;
      if (els.localAiIncludeContextInput) els.localAiIncludeContextInput.checked = true;
      renderLocalAiProviderControls(localAiSettingsFromForm());
      assert(
        els.localAiProviderSelect?.querySelector('optgroup[label="Local and Ollama"] option[value="ollama"]') &&
          els.localAiProviderSelect.querySelector('optgroup[label="Hosted providers"] option[value="gemini"]') &&
          els.localAiProviderSelect.querySelector('optgroup[label="Hosted routers"] option[value="openrouter"]') &&
          els.localAiProviderSelect.querySelector('optgroup[label="Managed deployments"] option[value="azure-openai"]') &&
          els.localAiPresetSelect?.querySelector('optgroup[label="Local runtimes"] option[value="ollama-local"]') &&
          els.localAiPresetSelect.querySelector('optgroup[label="Ollama hosted and cloud"] option[value="ollama-cloud"]') &&
          els.localAiPresetSelect.querySelector('optgroup[label="Hosted providers"] option[value="gemini"]') &&
          els.localAiPresetSelect.querySelector('optgroup[label="Hosted routers"] option[value="openrouter"]'),
        "AI Command Centre groups provider and preset choices by local, hosted, router, and managed workflows"
      );
      assert(
          els.localAiProviderSummary?.textContent.includes("Ollama local") &&
          els.localAiProviderSummary.textContent.includes("Local loopback") &&
          els.localAiProviderSummary.textContent.includes("No API key") &&
          els.localAiProviderSummary.textContent.includes("Pre-translate") &&
          els.localAiProviderSummary.textContent.includes("Review/edit tools") &&
          els.localAiProviderSummary.textContent.includes("Pull model") &&
          els.localAiProviderSummary.textContent.includes("private offline pre-translation") &&
          els.localAiProviderSummary.textContent.includes("POST /api/chat"),
        "AI Command Centre explains selected provider locality, best-fit use, available tools, and endpoints"
      );
      const extractedAiAdministrationForm = aiAdministrationController?.readLocalForm?.();
      assert(
        extractedAiAdministrationForm?.providerId === "ollama" &&
          extractedAiAdministrationForm.model === "workflow-glossary-pretranslate-model" &&
          !els.localAiProviderSummary?.querySelector("script"),
        "checked AI administration controller owns provider form values and safe summary rendering"
      );
      if (els.localAiSampleInput) els.localAiSampleInput.value = "Workflow prompt preview source {name}.";
      if (els.localAiPromptModeSelect) els.localAiPromptModeSelect.value = "review";
      els.localAiSampleInput?.dispatchEvent(new Event("input", { bubbles: true }));
      els.localAiPromptModeSelect?.dispatchEvent(new Event("change", { bubbles: true }));
      const reviewPromptPreview = els.localAiPromptPreview?.value || "";
      if (els.localAiPromptModeSelect) els.localAiPromptModeSelect.value = "tag-repair";
      renderLocalAiPromptPreview();
      const repairPromptPreview = els.localAiPromptPreview?.value || "";
      if (els.localAiPromptModeSelect) els.localAiPromptModeSelect.value = "project-brief";
      renderLocalAiPromptPreview();
      const briefPromptPreview = els.localAiPromptPreview?.value || "";
      localAiGlossaryProvider.completePrompt = async (_config, request) => {
        assert(
          request.prompt.includes("Review checklist:") &&
            request.prompt.includes("Workflow prompt preview source {name}.") &&
            request.system.includes("senior translation reviewer"),
          "AI Command Centre prompt test sends the selected review prompt instead of the translation prompt"
        );
        return {
          text: "Workflow prompt mode review output",
          provider: "Mock Prompt Mode AI",
          providerId: "ollama",
          model: "workflow-glossary-pretranslate-model"
        };
      };
      if (els.localAiPromptModeSelect) els.localAiPromptModeSelect.value = "review";
      renderLocalAiPromptPreview();
      const promptModeTested = await testLocalAiPrompt();
      await Promise.resolve();
      assert(
        els.localAiPromptModeSelect?.querySelector('option[value="project-brief"]') &&
          reviewPromptPreview.includes("Review checklist:") &&
          reviewPromptPreview.includes("Workflow prompt preview source {name}.") &&
          repairPromptPreview.includes("Protected tokens that must appear exactly as written") &&
          repairPromptPreview.includes("{name}") &&
          briefPromptPreview.includes("Create a concise translation project brief") &&
          promptModeTested === true &&
          els.localAiPromptOutput.textContent.includes("Workflow prompt mode review output") &&
          els.localAiOutputDrawer?.open,
        "checked AI administration controller owns prompt preview events and output disclosure"
      );
      if (els.localAiPromptModeSelect) els.localAiPromptModeSelect.value = "pretranslate";
      renderLocalAiPromptPreview();
      localAiGlossaryProvider.translateSegment = async (config, request) => {
        localAiGlossaryRequest = request;
        assert(
          request.glossaryTerms?.some((term) => term.sourceTerm === localAiGlossarySourceTerm && term.targetTerm === localAiGlossaryTargetTerm),
          "Local AI pretranslation sends matched termbase hints to provider requests"
        );
        assert(
          request.tmMatches?.some((match) => match.source === localAiGlossarySource && match.target === localAiTmTarget),
          "Local AI pretranslation sends matched TM hints to provider requests"
        );
        assert(
          request.surroundingSegments?.some((context) => context.source === localAiContextBeforeSource) &&
            request.surroundingSegments?.some((context) => context.source === localAiContextAfterSource),
          "Local AI pretranslation sends nearby segment context to provider requests"
        );
        return {
          translatedText: "Workflow context-informed AI target",
          provider: "Mock Context AI",
          providerId: "ollama",
          model: config.model || "workflow-glossary-pretranslate-model"
        };
      };
      const localAiPretranslationBefore = targetCommandPatch(state.segments[localAiGlossarySegmentIndex]);
      const localAiPretranslationCommand = await pretranslateWithLocalAi();
      let localAiGlossarySegment = state.segments.find(
        (segment) => segment.documentId === localAiGlossaryDocument.id && segment.source === localAiGlossarySource
      );
      let localAiGlossaryStored = (await getProjectSegments(project.id)).find(
        (segment) => segment.id === localAiGlossarySegment?.id
      );
      assert(
        localAiPretranslationCommand?.receipt?.commandId === "ai-pretranslate" &&
          localAiPretranslationCommand.receipt.provenance?.provider === "Ollama" &&
          localAiPretranslationCommand.receipt.provenance?.affectedCount === 1 &&
          !JSON.stringify(localAiPretranslationCommand.receipt).includes("Workflow context-informed AI target") &&
          localAiGlossarySegment?.targetHistory?.some((entry) => entry.reason === "ai-pretranslate"),
        "Local AI pretranslation records redacted provider provenance and target history"
      );
      const undoLocalAiPretranslation = await undoLastCommand();
      const localAiPretranslationUndoRevision = Number(state.segments[localAiGlossarySegmentIndex].revision || 0);
      const storedAfterLocalAiPretranslationUndo = (await getProjectSegments(project.id)).find(
        (segment) => segment.id === localAiGlossarySegment?.id
      );
      assert(
        undoLocalAiPretranslation?.receipt?.commandId === "ai-pretranslate" &&
          state.segments[localAiGlossarySegmentIndex].target === localAiPretranslationBefore.target &&
          JSON.stringify(state.segments[localAiGlossarySegmentIndex].targetHistory) ===
            JSON.stringify(localAiPretranslationBefore.targetHistory) &&
          !state.segments[localAiGlossarySegmentIndex].aiPretranslation &&
          storedAfterLocalAiPretranslationUndo?.target === localAiPretranslationBefore.target &&
          !storedAfterLocalAiPretranslationUndo?.aiPretranslation,
        "Local AI pretranslation Undo restores target, history, AI provenance, review state, and persistence"
      );
      const redoLocalAiPretranslation = await redoLastCommand();
      localAiGlossarySegment = state.segments.find(
        (segment) => segment.documentId === localAiGlossaryDocument.id && segment.source === localAiGlossarySource
      );
      localAiGlossaryStored = (await getProjectSegments(project.id)).find(
        (segment) => segment.id === localAiGlossarySegment?.id
      );
      assert(
        localAiGlossaryStored?.target === "Workflow context-informed AI target" &&
          localAiGlossaryStored?.reviewState === "needs-review" &&
          localAiGlossaryStored?.aiPretranslation?.model === "workflow-glossary-pretranslate-model" &&
          Number(localAiGlossarySegment?.revision || 0) > localAiPretranslationUndoRevision,
        "Local AI pretranslation Redo restores review/provenance patches with a monotonic revision"
      );
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = "ai-draft";
      updateEditorFilters({ aiState: "ai-draft" });
      renderSegments();
      assert(
        localAiGlossaryRequest?.segment?.id === localAiGlossarySegment?.id &&
          localAiGlossaryStored?.target === "Workflow context-informed AI target" &&
          localAiGlossaryStored?.reviewState === "needs-review" &&
          localAiGlossaryStored?.aiPretranslation?.model === "workflow-glossary-pretranslate-model",
        "Local AI pretranslation uses project TM and termbase hints and saves AI initiated metadata"
      );
      assert(
        filteredSegmentIndexes().some((index) => state.segments[index]?.id === localAiGlossarySegment?.id) &&
          els.segmentBody.textContent.includes("AI initiated") &&
          !els.segmentBody.textContent.includes("AI draft"),
        "AI segment filter shows AI-pretranslated rows with AI initiated row badges"
      );
      const localAiConfirmedPreviousStatus = localAiGlossarySegment.status;
      const localAiConfirmedPreviousReviewState = localAiGlossarySegment.reviewState;
      localAiGlossarySegment.status = "confirmed";
      localAiGlossarySegment.reviewState = "";
      renderSegments();
      const localAiGlossaryRow = els.segmentBody.querySelector(`tr[data-index="${state.segments.findIndex((segment) => segment.id === localAiGlossarySegment.id)}"]`);
      assert(
        localAiGlossaryRow?.textContent.includes("AI initiated") &&
          !localAiGlossaryRow?.textContent.includes("AI draft") &&
          !localAiGlossaryRow?.textContent.includes("Needs review"),
        "confirmed AI-pretranslated segments show AI initiated row badge without needs-review"
      );
      localAiGlossarySegment.status = localAiConfirmedPreviousStatus;
      localAiGlossarySegment.reviewState = localAiConfirmedPreviousReviewState;
      updateEditorFilters({ aiState: originalLocalAiGlossaryAiFilter });
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = originalLocalAiGlossaryAiFilter;
      renderSegments();
      setSegmentTargetAndStatus(localAiGlossarySegment, "", "draft", "ai-cancel-fixture");
      Reflect.deleteProperty(localAiGlossarySegment, "aiPretranslation");
      localAiGlossarySegment.reviewState = "";
      touchSegment(localAiGlossarySegment);
      await saveSegment(localAiGlossarySegment);
      localAiGlossaryProvider.translateSegment = async (config) => {
        state.localAi.abortController?.abort();
        return {
          translatedText: "Target that must be rolled back after cancellation",
          provider: "Mock Canceled AI",
          providerId: "ollama",
          model: config.model || "workflow-glossary-pretranslate-model"
        };
      };
      const canceledLocalAiPretranslation = await pretranslateWithLocalAi();
      const storedAfterMidBatchCancellation = (await getProjectSegments(project.id)).find(
        (segment) => segment.id === localAiGlossarySegment.id
      );
      const midBatchCancellationStatus = els.saveStatus.textContent;
      const cancellationStackUndo = await undoLastCommand();
      assert(
        canceledLocalAiPretranslation === null &&
          storedAfterMidBatchCancellation?.target === "" &&
          !storedAfterMidBatchCancellation?.aiPretranslation &&
          midBatchCancellationStatus.includes("canceled; no target changes were applied") &&
          cancellationStackUndo?.receipt?.id === redoLocalAiPretranslation?.receipt?.id,
        "mid-batch AI cancellation rolls back provider output and records no partial command"
      );
      localAiGlossarySegment = state.segments.find(
        (segment) => segment.documentId === localAiGlossaryDocument.id && segment.source === localAiGlossarySource
      );
      const originalLocalAiCloudConfirm = window.confirm;
      const localAiCloudConfirmMessages = [];
      let localAiCloudProviderCalls = 0;
      let localAiHostedProviderCalls = 0;
      let localAiHostedConfig = null;
      let localAiHostedRequest = null;
      const localAiHostedConfirmMessages = [];
      const hostedOllamaKeySettings = localAISettingsStore.defaults({
        providerId: "ollama",
        baseUrl: OLLAMA_CLOUD_BASE_URL,
        model: "gpt-oss:120b"
      }, state.project);
      const hostedOllamaKeySnapshot = localAiKeySnapshot(hostedOllamaKeySettings);
      const previousHostedOllamaKeyFieldValue = els.localAiApiKeyInput?.value || "";
      const previousHostedOllamaRememberValue = Boolean(els.rememberLocalAiKeyInput?.checked);
      try {
        setSegmentTargetAndStatus(localAiGlossarySegment, "", "draft", "local-ai-cloud-confirm-fixture");
        touchSegment(localAiGlossarySegment);
        await saveSegment(localAiGlossarySegment);
        await setActiveSegment(localAiGlossarySegmentIndex);
        els.localAiCloudPresetBtn?.click();
        assert(
          els.localAiPresetSelect?.value === "ollama-cloud" &&
            els.localAiBaseUrlInput?.value === OLLAMA_CLOUD_BASE_URL &&
            els.localAiModelInput?.value === "gpt-oss:120b",
          "AI Command Centre hosted Ollama quick button selects direct hosted Ollama"
        );
        els.localAiLocalCloudPresetBtn?.click();
        if (els.localAiModeSelect) els.localAiModeSelect.value = "selected";
        if (els.localAiOverwriteInput) els.localAiOverwriteInput.checked = false;
        if (els.localAiIncludeContextInput) els.localAiIncludeContextInput.checked = true;
        renderLocalAiProviderControls(localAiSettingsFromForm());
        assert(
          els.localAiPresetSelect?.value === "ollama-local-cloud" &&
            els.localAiBaseUrlInput?.value === OLLAMA_DEFAULT_BASE_URL &&
            els.localAiModelInput?.value === "gpt-oss:120b-cloud" &&
            els.localAiPrivacyNote?.textContent.includes("cloud-suffixed models may be processed through Ollama Cloud") &&
            els.localAiProviderSummary?.textContent.includes("Ollama cloud model via local Ollama") &&
            els.localAiProviderSummary.textContent.includes("Hosted/network") &&
            els.localAiProviderSummary.textContent.includes("No API key") &&
            els.localAiProviderSummary.textContent.includes("larger Ollama-hosted models") &&
            els.localAiPullModelBtn?.textContent.includes("gpt-oss:120b-cloud") &&
            !els.localAiPullModelBtn.disabled,
          "AI Command Centre distinguishes local Ollama cloud-offload models from direct hosted Ollama"
        );
        localAiGlossaryProvider.translateSegment = async (config, request) => {
          localAiCloudProviderCalls += 1;
          localAiGlossaryRequest = request;
          return {
            translatedText: "Workflow local Ollama cloud target",
            provider: "Mock Local Ollama Cloud",
            providerId: "ollama",
            model: config.model || "gpt-oss:120b-cloud"
          };
        };
        window.confirm = (message) => {
          localAiCloudConfirmMessages.push(message);
          return false;
        };
        await pretranslateWithLocalAi();
        const storedAfterLocalAiCloudCancel = (await getProjectSegments(project.id)).find((segment) => segment.id === localAiGlossarySegment.id);
        assert(
          localAiCloudConfirmMessages.some((message) => message.includes("Ollama") && message.includes("outside LoopCAT")) &&
            localAiCloudConfirmMessages.some((message) => message.includes("batch segment text")) &&
            localAiCloudProviderCalls === 0 &&
            storedAfterLocalAiCloudCancel?.target === "" &&
            els.saveStatus.textContent.includes("AI pre-translation canceled"),
          "Ollama local cloud-offload pretranslation asks before sending source text and honors cancellation"
        );
        window.confirm = (message) => {
          localAiCloudConfirmMessages.push(message);
          return true;
        };
        await pretranslateWithLocalAi();
        const storedAfterLocalAiCloudAccept = (await getProjectSegments(project.id)).find((segment) => segment.id === localAiGlossarySegment.id);
        assert(
          localAiCloudProviderCalls === 1 &&
            localAiGlossaryRequest?.segment?.id === localAiGlossarySegment.id &&
            storedAfterLocalAiCloudAccept?.target === "Workflow local Ollama cloud target" &&
            storedAfterLocalAiCloudAccept?.reviewState === "needs-review" &&
            storedAfterLocalAiCloudAccept?.aiPretranslation?.model === "gpt-oss:120b-cloud",
          "Ollama local cloud-offload pretranslation runs after confirmation and stores cloud model metadata"
        );
        const hostedOllamaSegmentIndex = state.segments.findIndex((segment) => segment.id === localAiGlossarySegment.id);
        const hostedOllamaSegment = state.segments[hostedOllamaSegmentIndex];
        setSegmentTargetAndStatus(hostedOllamaSegment, "", "draft", "hosted-ollama-confirm-fixture");
        touchSegment(hostedOllamaSegment);
        await saveSegment(hostedOllamaSegment);
        await setActiveSegment(hostedOllamaSegmentIndex);
        els.localAiCloudPresetBtn?.click();
        if (els.localAiModeSelect) els.localAiModeSelect.value = "selected";
        if (els.localAiOverwriteInput) els.localAiOverwriteInput.checked = false;
        if (els.localAiIncludeContextInput) els.localAiIncludeContextInput.checked = true;
        renderLocalAiProviderControls(localAiSettingsFromForm());
        if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = "workflow-hosted-ollama-key";
        if (els.rememberLocalAiKeyInput) els.rememberLocalAiKeyInput.checked = false;
        assert(
          els.localAiPresetSelect?.value === "ollama-cloud" &&
            els.localAiBaseUrlInput?.value === OLLAMA_CLOUD_BASE_URL &&
            els.localAiModelInput?.value === "gpt-oss:120b" &&
            els.localAiPrivacyNote?.textContent.includes("Hosted AI mode") &&
            els.localAiProviderSummary?.textContent.includes("Ollama Cloud direct") &&
            els.localAiProviderSummary.textContent.includes("Hosted/network") &&
            els.localAiProviderSummary.textContent.includes("API key required") &&
            els.localAiProviderSummary.textContent.includes("direct hosted Ollama models") &&
            els.localAiProviderSummary.textContent.includes("Confirmation before send") &&
            els.localAiProviderSummary.textContent.includes("Review/edit tools") &&
            els.localAiPullModelBtn?.disabled,
          "AI Command Centre direct hosted Ollama summary requires a key and disables local pull"
        );
        localAiGlossaryProvider.translateSegment = async (config, request) => {
          localAiHostedProviderCalls += 1;
          localAiHostedConfig = config;
          localAiHostedRequest = request;
          return {
            translatedText: "Workflow direct hosted Ollama target",
            provider: "Mock Hosted Ollama",
            providerId: "ollama",
            model: config.model || "gpt-oss:120b"
          };
        };
        window.confirm = (message) => {
          localAiHostedConfirmMessages.push(message);
          return false;
        };
        await pretranslateWithLocalAi();
        const storedAfterHostedOllamaCancel = (await getProjectSegments(project.id)).find((segment) => segment.id === hostedOllamaSegment.id);
        assert(
          localAiHostedConfirmMessages.some((message) => message.includes("Ollama") && message.includes("outside LoopCAT")) &&
            localAiHostedConfirmMessages.some((message) => message.includes("configured provider URL")) &&
            localAiHostedProviderCalls === 0 &&
            storedAfterHostedOllamaCancel?.target === "" &&
            els.saveStatus.textContent.includes("AI pre-translation canceled"),
          "Direct hosted Ollama pretranslation asks before sending source text and honors cancellation"
        );
        window.confirm = (message) => {
          localAiHostedConfirmMessages.push(message);
          return true;
        };
        await pretranslateWithLocalAi();
        const storedAfterHostedOllamaAccept = (await getProjectSegments(project.id)).find((segment) => segment.id === hostedOllamaSegment.id);
        assert(localAiHostedProviderCalls === 1, "Direct hosted Ollama pretranslation calls the provider once after confirmation");
        assert(localAiHostedConfig?.apiKey === "workflow-hosted-ollama-key", "Direct hosted Ollama pretranslation passes the hosted API key");
        assert(localAiHostedConfig?.baseUrl === OLLAMA_CLOUD_BASE_URL, "Direct hosted Ollama pretranslation uses the hosted Ollama base URL");
        assert(localAiHostedConfig?.model === "gpt-oss:120b", "Direct hosted Ollama pretranslation uses the hosted Ollama model");
        assert(localAiHostedRequest?.segment?.id === hostedOllamaSegment.id, "Direct hosted Ollama pretranslation sends the selected segment");
        assert(storedAfterHostedOllamaAccept?.target === "Workflow direct hosted Ollama target", "Direct hosted Ollama pretranslation writes the hosted draft target");
        assert(storedAfterHostedOllamaAccept?.reviewState === "needs-review", "Direct hosted Ollama pretranslation marks the hosted draft for review");
        assert(storedAfterHostedOllamaAccept?.aiPretranslation?.model === "gpt-oss:120b", "Direct hosted Ollama pretranslation stores the hosted model metadata");
        assert(
          localAiHostedProviderCalls === 1 &&
            localAiHostedConfig?.apiKey === "workflow-hosted-ollama-key" &&
            localAiHostedConfig?.baseUrl === OLLAMA_CLOUD_BASE_URL &&
            localAiHostedConfig?.model === "gpt-oss:120b" &&
            localAiHostedRequest?.segment?.id === hostedOllamaSegment.id &&
            storedAfterHostedOllamaAccept?.target === "Workflow direct hosted Ollama target" &&
            storedAfterHostedOllamaAccept?.reviewState === "needs-review" &&
            storedAfterHostedOllamaAccept?.aiPretranslation?.model === "gpt-oss:120b",
          "Direct hosted Ollama pretranslation runs after confirmation with hosted key and stores hosted model metadata"
        );
      } finally {
        window.confirm = originalLocalAiCloudConfirm;
        if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = previousHostedOllamaKeyFieldValue;
        if (els.rememberLocalAiKeyInput) els.rememberLocalAiKeyInput.checked = previousHostedOllamaRememberValue;
        safeRestoreLocalAiKeySnapshot(hostedOllamaKeySnapshot);
      }
    } finally {
      localAiGlossaryProvider.translateSegment = originalLocalAiGlossaryTranslateSegment;
      localAiGlossaryProvider.completePrompt = originalLocalAiGlossaryCompletePrompt;
      if (els.localAiModeSelect) els.localAiModeSelect.value = originalLocalAiGlossaryMode;
      updateEditorFilters({ aiState: originalLocalAiGlossaryAiFilter });
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = originalLocalAiGlossaryAiFilter;
      if (localAiTmEntry?.id) await deleteTmEntry(localAiTmEntry.id);
      if (localAiGlossaryTerm?.id) await deleteTerm(localAiGlossaryTerm.id);
    }
    const deepSeekKeySettings = localAISettingsStore.defaults({
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro"
    }, state.project);
    const geminiKeySettings = localAISettingsStore.defaults({
      providerId: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.5-flash"
    }, state.project);
    const deepSeekKeySnapshot = localAiKeySnapshot(deepSeekKeySettings);
    const geminiKeySnapshot = localAiKeySnapshot(geminiKeySettings);
    const previousLocalAiKeyFieldValue = els.localAiApiKeyInput?.value || "";
    try {
      if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = "";
      saveLocalAiKey("deepseek-provider-scoped-key", true, deepSeekKeySettings);
      saveLocalAiKey("gemini-provider-scoped-key", false, geminiKeySettings);
      assert(
        storedLocalAiKey(deepSeekKeySettings) === "deepseek-provider-scoped-key" &&
          storedLocalAiKey(geminiKeySettings) === "gemini-provider-scoped-key" &&
          localAiRuntimeConfig(deepSeekKeySettings).apiKey === "deepseek-provider-scoped-key" &&
          localAiRuntimeConfig(geminiKeySettings).apiKey === "gemini-provider-scoped-key" &&
          localAiKeyStorageLabel(deepSeekKeySettings).includes("this provider") &&
          localAiKeyStorageLabel(geminiKeySettings).includes("tab and provider") &&
          !localStorage.getItem(LOCAL_AI_KEY_STORAGE) &&
          !sessionStorage.getItem(LOCAL_AI_KEY_STORAGE),
        "Local AI hosted provider keys are scoped by provider and base URL"
      );
    } finally {
      if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = previousLocalAiKeyFieldValue;
      safeRestoreLocalAiKeySnapshot(geminiKeySnapshot);
      safeRestoreLocalAiKeySnapshot(deepSeekKeySnapshot);
    }
    const unsupportedCompatibleSettings = localAISettingsStore.defaults({
      providerId: "openai-compatible",
      baseUrl: "https://example.com/v1",
      model: "unsupported-compatible-model"
    }, state.project);
    const unsupportedCompatibleKeySnapshot = localAiKeySnapshot(unsupportedCompatibleSettings);
    const unsupportedCompatiblePreviousKey = unsupportedCompatibleKeySnapshot.session || unsupportedCompatibleKeySnapshot.local || "";
    const unsupportedCompatibleProjectAiSettings = structuredClone(state.project.aiSettings || {});
    const previousLocalProviderValue = els.localAiProviderSelect?.value || "";
    const previousLocalBaseUrlValue = els.localAiBaseUrlInput?.value || "";
    const previousLocalModelValue = els.localAiModelInput?.value || "";
    const previousLocalRememberValue = Boolean(els.rememberLocalAiKeyInput?.checked);
    const previousLocalKeyValue = els.localAiApiKeyInput?.value || "";
    try {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = "openai-compatible";
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = "https://example.com/v1";
      if (els.localAiModelInput) els.localAiModelInput.value = "unsupported-compatible-model";
      if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = "unsupported-compatible-key-that-must-not-save";
      if (els.rememberLocalAiKeyInput) els.rememberLocalAiKeyInput.checked = true;
      await testLocalAiConnection();
      assert(
        els.saveStatus.textContent.includes("explicit provider allowlist") &&
          els.localAiStatusText.textContent.includes("explicit provider allowlist") &&
          storedLocalAiKey(unsupportedCompatibleSettings) === unsupportedCompatiblePreviousKey &&
          JSON.stringify(state.project.aiSettings || {}) === JSON.stringify(unsupportedCompatibleProjectAiSettings),
        "AI Command Centre blocks unsupported hosted OpenAI-compatible endpoints before saving keys or settings"
      );
    } finally {
      if (els.localAiProviderSelect) els.localAiProviderSelect.value = previousLocalProviderValue;
      if (els.localAiBaseUrlInput) els.localAiBaseUrlInput.value = previousLocalBaseUrlValue;
      if (els.localAiModelInput) els.localAiModelInput.value = previousLocalModelValue;
      if (els.localAiApiKeyInput) els.localAiApiKeyInput.value = previousLocalKeyValue;
      if (els.rememberLocalAiKeyInput) els.rememberLocalAiKeyInput.checked = previousLocalRememberValue;
      safeRestoreLocalAiKeySnapshot(unsupportedCompatibleKeySnapshot);
      renderLocalAiProviderControls(localAiSettingsFromForm());
    }
    await openProjectFile(documentInfo.id);
    await setActiveSegment(segmentIndex);
    confirmRollbackSegment = state.segments[segmentIndex];

    setSegmentTargetAndStatus(confirmRollbackSegment, "Confirm reviewed AI target", "draft", "confirm-ai-reviewed-fixture");
    confirmRollbackSegment.reviewState = "needs-review";
    confirmRollbackSegment.aiPretranslation = {
      provider: "Mock AI",
      providerId: "mock-local",
      model: "workflow-confirm-model",
      status: "AI initiated",
      createdAt: new Date().toISOString()
    };
    touchSegment(confirmRollbackSegment);
    await saveSegment(confirmRollbackSegment);
    const originalConfirmReviewedFilters = {
      segmentStatusFilter: currentEditorFilters().status,
      reviewStateFilter: currentEditorFilters().reviewState,
      aiSegmentFilter: currentEditorFilters().aiState
    };
    updateEditorFilters({ status: "all", reviewState: "", aiState: "" });
    if (els.segmentStatusFilter) els.segmentStatusFilter.value = "all";
    if (els.reviewStateFilter) els.reviewStateFilter.value = "";
    if (els.aiSegmentFilter) els.aiSegmentFilter.value = "";
    await confirmCurrentSegment();
    await setActiveSegment(segmentIndex);
    renderSegments();
    const confirmedReviewedAiSegment = state.segments[segmentIndex];
    const persistedConfirmedReviewedAiSegment = (await getProjectSegments(project.id)).find((segment) => segment.id === confirmedReviewedAiSegment.id);
    const confirmedReviewedAiRow = els.segmentBody.querySelector(`tr[data-index="${segmentIndex}"]`);
    assert(
      confirmedReviewedAiSegment.status === "confirmed" &&
        (confirmedReviewedAiSegment.reviewState || "") === "" &&
        persistedConfirmedReviewedAiSegment?.status === "confirmed" &&
        (persistedConfirmedReviewedAiSegment?.reviewState || "") === "" &&
        confirmedReviewedAiRow?.textContent.includes("AI initiated") &&
        !confirmedReviewedAiRow?.textContent.includes("Needs review") &&
        !confirmedReviewedAiRow?.textContent.includes("AI draft"),
      "confirming reviewed AI-pretranslated segment clears needs-review and shows AI initiated"
    );
    await undoLastCommand();
    const undoneConfirmedSegment = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === confirmedReviewedAiSegment.id
    );
    assert(
      state.segments[segmentIndex].status === "draft" &&
        state.segments[segmentIndex].reviewState === "needs-review" &&
        undoneConfirmedSegment?.status === "draft" &&
        undoneConfirmedSegment?.reviewState === "needs-review" &&
        currentActiveIndex() === segmentIndex,
      "Undo restores confirmed segment status, review state, persistence, and selection"
    );
    await redoLastCommand();
    const redoneConfirmedSegment = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === confirmedReviewedAiSegment.id
    );
    assert(
      redoneConfirmedSegment?.status === "confirmed" &&
        (redoneConfirmedSegment?.reviewState || "") === "",
      "Redo reapplies confirmed segment state"
    );
    updateEditorFilters({
      status: originalConfirmReviewedFilters.segmentStatusFilter,
      reviewState: originalConfirmReviewedFilters.reviewStateFilter,
      aiState: originalConfirmReviewedFilters.aiSegmentFilter
    });
    if (els.segmentStatusFilter) els.segmentStatusFilter.value = originalConfirmReviewedFilters.segmentStatusFilter;
    if (els.reviewStateFilter) els.reviewStateFilter.value = originalConfirmReviewedFilters.reviewStateFilter;
    if (els.aiSegmentFilter) els.aiSegmentFilter.value = originalConfirmReviewedFilters.aiSegmentFilter;
    await setActiveSegment(segmentIndex);
    confirmRollbackSegment = state.segments[segmentIndex];

    setSegmentTargetAndStatus(confirmRollbackSegment, confirmRollbackSegment.target || "Confirm rollback target", "draft", "confirm-rollback-fixture");
    touchSegment(confirmRollbackSegment);
    await saveSegment(confirmRollbackSegment);
    const rollbackHistoryCount = confirmRollbackSegment.targetHistory?.length || 0;
    setHiddenSegmentField(confirmRollbackSegment, CONFIRM_FAILURE_TEST_FLAG, true);
    await confirmCurrentSegment();
    assert(
      els.saveStatus.textContent.includes("Simulated confirm save failure") &&
        state.segments[segmentIndex].status === "draft" &&
        (state.segments[segmentIndex].targetHistory?.length || 0) === rollbackHistoryCount &&
        !Object.prototype.hasOwnProperty.call(state.segments[segmentIndex], CONFIRM_FAILURE_TEST_FLAG),
      "confirm segment failure restores draft state and reports visible status"
    );
    setSegmentTargetAndStatus(confirmRollbackSegment, confirmRollbackSegment.target || "Confirm persisted rollback target", "draft", "confirm-persisted-rollback-fixture");
    touchSegment(confirmRollbackSegment);
    await saveSegment(confirmRollbackSegment);
    const persistedRollbackHistoryCount = confirmRollbackSegment.targetHistory?.length || 0;
    setHiddenSegmentField(confirmRollbackSegment, CONFIRM_POST_SAVE_FAILURE_TEST_FLAG, true);
    await confirmCurrentSegment();
    const persistedAfterConfirmFailure = (await getProjectSegments(project.id)).find((segment) => segment.id === confirmRollbackSegment.id);
    assert(
      els.saveStatus.textContent.includes("Simulated post-save confirm failure") &&
        state.segments[segmentIndex].status === "draft" &&
        persistedAfterConfirmFailure?.status === "draft" &&
        (persistedAfterConfirmFailure?.targetHistory?.length || 0) === persistedRollbackHistoryCount &&
        !Object.prototype.hasOwnProperty.call(state.segments[segmentIndex], CONFIRM_POST_SAVE_FAILURE_TEST_FLAG),
      "confirm segment post-save failure restores persisted draft state"
    );
    setSegmentTargetAndStatus(confirmRollbackSegment, confirmRollbackSegment.target || "Confirm TM warning target", "draft", "confirm-tm-warning-fixture");
    touchSegment(confirmRollbackSegment);
    await saveSegment(confirmRollbackSegment);
    setHiddenSegmentField(confirmRollbackSegment, SAVE_TM_FAILURE_TEST_FLAG, true);
    await confirmCurrentSegment();
    const persistedAfterConfirmTmFailure = (await getProjectSegments(project.id)).find((segment) => segment.id === confirmRollbackSegment.id);
    assert(
      els.saveStatus.textContent.includes("TM save failed") &&
        state.segments[segmentIndex].status === "confirmed" &&
        persistedAfterConfirmTmFailure?.status === "confirmed" &&
        state.workspaceDirtyProjectIds.has(project.id),
      "confirm TM save failure keeps segment confirmed and reports warning"
    );
    Reflect.deleteProperty(confirmRollbackSegment, SAVE_TM_FAILURE_TEST_FLAG);
    await setActiveSegment(segmentIndex);
    confirmRollbackSegment = state.segments[segmentIndex];
    setSegmentTargetAndStatus(confirmRollbackSegment, confirmRollbackSegment.target || "Confirm activity target", "draft", "confirm-activity-fixture");
    touchSegment(confirmRollbackSegment);
    await saveSegment(confirmRollbackSegment);
    setHiddenSegmentField(confirmRollbackSegment, CONFIRM_ACTIVITY_FAILURE_TEST_FLAG, true);
    await confirmCurrentSegment();
    const persistedAfterConfirmActivityFailure = (await getProjectSegments(project.id)).find((segment) => segment.id === confirmRollbackSegment.id);
    assert(
      els.saveStatus.textContent.includes("activity log failed") &&
        state.segments[segmentIndex].status === "confirmed" &&
        persistedAfterConfirmActivityFailure?.status === "confirmed" &&
        state.workspaceDirtyProjectIds.has(project.id),
      "confirm activity log failure keeps segment confirmed and reports warning"
    );
    Reflect.deleteProperty(confirmRollbackSegment, CONFIRM_ACTIVITY_FAILURE_TEST_FLAG);

    assert(
      Boolean(
        els.qualityForm &&
          els.qualityActiveEvidence &&
          els.qualityDecisionForm &&
          els.qualityIssueCategorySelect &&
          els.qualityIssueSeveritySelect &&
          els.refreshQualityRiskBtn &&
          els.exportQualityPassportBtn
      ),
      "quality workbench controls are available"
    );
    els.qualityStandardSelect.value = "agency-delivery";
    els.qualityReviewDepthSelect.value = "lqa";
    els.qualityRiskToleranceSelect.value = "strict";
    els.qualityTerminologyStrictnessSelect.value = "strict";
    els.qualityAiDisclosureSelect.value = "client-approved";
    els.qualityAudienceInput.value = "Workflow client reviewers";
    els.qualityToneInput.value = "Formal";
    const qualityProfileSubmitEvent = new Event("submit", { bubbles: true, cancelable: true });
    const qualityProfileSubmitResult = els.qualityForm.dispatchEvent(qualityProfileSubmitEvent);
    await waitFor(
      () => state.project.qualityProfile?.standard === "agency-delivery" && state.project.qualityProfile?.reviewDepth === "lqa",
      "checked quality profile form submit"
    );
    assert(
      !qualityProfileSubmitResult &&
        qualityProfileSubmitEvent.defaultPrevented &&
        state.project.qualityProfile.standard === "agency-delivery" &&
        state.project.qualityProfile.reviewDepth === "lqa" &&
        state.project.qualityProfile.terminologyStrictness === "strict",
      "checked quality/review controller owns profile submit while domain persistence keeps the review contract"
    );
    state.qualityRiskQueue = currentQualityRiskQueue();
    renderQualityWorkbench();
    assert(
      els.qualitySummary.textContent.includes("risk items") &&
        els.qualityRiskList.textContent.length > 0 &&
        qualityReviewController.getState().projectId === state.project.id &&
        qualityReviewController.getState().segmentId === currentSegment()?.id &&
        qualityReviewController.getState().riskCount === state.qualityRiskQueue.totalRiskItems,
      "checked quality/review controller owns workbench rendering and redacted view state"
    );
    const qualityDecisionSegment = currentSegment();
    const qualityDecisionCommentCount = qualityDecisionSegment?.comments?.length || 0;
    els.qualityIssueCategorySelect.value = "accuracy";
    els.qualityIssueSeveritySelect.value = "high";
    els.qualityDecisionNoteInput.value = "Quality evidence note";
    const qualityDecisionSubmitEvent = new Event("submit", { bubbles: true, cancelable: true });
    const qualityDecisionSubmitResult = els.qualityDecisionForm.dispatchEvent(qualityDecisionSubmitEvent);
    await waitFor(
      () => (currentSegment()?.comments || []).length === qualityDecisionCommentCount + 1,
      "checked quality decision form submit"
    );
    const storedQualityDecisionSegment = (await getProjectSegments(project.id)).find((segment) => segment.id === qualityDecisionSegment?.id);
    assert(
      !qualityDecisionSubmitResult && qualityDecisionSubmitEvent.defaultPrevented,
      "checked quality/review controller delegates quality decision save"
    );
    assert(
      storedQualityDecisionSegment?.reviewState === "needs-review",
      "quality decision marks active segment needs-review"
    );
    assert(
      (storedQualityDecisionSegment?.comments || []).length === qualityDecisionCommentCount + 1,
      "quality decision persists one structured comment"
    );
    assert(
      storedQualityDecisionSegment?.comments?.some((comment) =>
        comment.body.includes("Quality decision: Accuracy (High)") &&
          comment.body.includes("Quality evidence note") &&
          comment.qualityDecision?.category === "accuracy" &&
          comment.qualityDecision?.severity === "high"
      ),
      "quality decision persists category and severity metadata"
    );
    assert(
      buildRiskQueue({
        project: state.project,
        segments: state.segments,
        qaChecks: state.qaChecks,
        profile: state.project.qualityProfile
      })?.byCategory?.accuracy >= 1,
      "quality decision contributes to category risk aggregation"
    );
    assert(
      els.qualityActiveEvidence.textContent.includes("Accuracy"),
      "quality decision renders active segment category evidence"
    );

    const reportDownloads = [];
    const originalReportCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalReportAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      blob.text().then((text) => reportDownloads.push({ type: blob.type, text }));
      return originalReportCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopReportDownloadClick() {};
    try {
      clearWorkspaceDirtyMarkers();
      await logProjectActivity("ai-action", "Sensitive AI prompt trace must not appear in report", {
        provider: "OpenAI",
        configuredProvider: "OpenAI",
        prompt: "Report activity prompt trace must not appear.",
        responseId: "report-response-id-that-must-not-appear",
        customEndpoint: "https://ai.example.invalid/responses"
      });
      await logProjectActivity("qa-run", "Unsafe report Bearer report-summary-token-that-must-not-appear", {
        issueCount: 0
      });
      await logProjectActivity("Bearer report-activity-type-token-that-must-not-appear", "Activity type privacy fixture", {
        issueCount: 0
      });
      state.project = await updateProject({
        ...state.project,
        domain: "Bearer external-domain-token-that-must-redact"
      });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      const reportTargetText = state.segments[segmentIndex].target;
      els.exportProjectReportBtn.click();
      const reportDownload = await waitFor(() => reportDownloads.find((item) => item.type === "text/html"), "project report download");
      assert(
        reportDownload.text.includes("LoopCAT Project Report") && reportDownload.text.includes(state.project.name),
        "checked import/export controller delegates project report export"
      );
      assert(reportDownload.text.includes(`Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`), "project report export includes restrictive CSP");
      assert(
        reportDownload.text.includes("AI Triage") &&
          reportDownload.text.includes("AI initiated") &&
          reportDownload.text.includes("High AI risk"),
        "project report includes count-only AI triage metrics"
      );
      assert(
        reportDownload.text.includes("Quality Passport") &&
          reportDownload.text.includes("Quality score") &&
          reportDownload.text.includes("Agency delivery") &&
          reportDownload.text.includes("Quality categories") &&
          reportDownload.text.includes("Accuracy"),
        "project report includes quality passport metrics"
      );
      assert(
        !reportDownload.text.includes("external-domain-token-that-must-redact") &&
          reportDownload.text.includes("[redacted secret]"),
        "project report redacts credential-looking project domain metadata"
      );
      const labelReportData = await buildProjectReportData();
      const labelReportHtml = projectReportHtml({
        ...labelReportData,
        project: { ...labelReportData.project, name: "Bearer report-project-label-token-that-must-not-appear" },
        analysis: {
          ...labelReportData.analysis,
          files: labelReportData.analysis.files.map((file) => ({
            ...file,
            name: "Bearer report-file-label-token-that-must-not-appear.html"
          }))
        },
        resources: {
          ...labelReportData.resources,
          mainTm: "Bearer report-main-tm-label-token-that-must-not-appear",
          tmNames: ["Bearer report-tm-label-token-that-must-not-appear"],
          tbNames: ["Bearer report-tb-label-token-that-must-not-appear"]
        },
        validation: {
          ...labelReportData.validation,
          risky: ["Risk for Bearer report-validation-risk-token-that-must-not-appear"],
          warnings: ["Warning for Bearer report-validation-warning-token-that-must-not-appear"],
          preserved: ["Preserved Bearer report-validation-preserved-token-that-must-not-appear"]
        },
        terms: [{
          sourceTerm: "report-label-source",
          targetTerm: "report-label-target",
          isForbidden: false,
          termBaseName: "Bearer report-termbase-label-token-that-must-not-appear",
          notes: ""
        }]
      });
      assert(
        !labelReportHtml.includes("report-project-label-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-file-label-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-main-tm-label-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-tm-label-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-tb-label-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-validation-risk-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-validation-warning-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-validation-preserved-token-that-must-not-appear") &&
          !labelReportHtml.includes("report-termbase-label-token-that-must-not-appear") &&
          labelReportHtml.includes("[redacted secret]"),
        "project report redacts credential-looking project file resource and validation labels"
      );
      assert(
        !reportDownload.text.includes("Academic Metadata") &&
          !reportDownload.text.includes("Translation Tech 501") &&
          !reportDownload.text.includes("Sensitive experiment note"),
        "project report omits academic metadata"
      );
      assert(reportDownload.text.includes("forbidden-report-term") && reportDownload.text.includes("Forbidden"), "project report includes terminology status");
      assert(
        !reportDownload.text.includes("report-term-note-token-that-must-not-appear") &&
          reportDownload.text.includes("Report terminology fixture [redacted secret]"),
        "project report redacts credential-looking termbase notes"
      );
      assert(!reportDownload.text.includes(reportTargetText), "project report omits segment target text");
      assert(
        reportDownload.text.includes("AI activity recorded") &&
          !reportDownload.text.includes("Sensitive AI prompt trace") &&
          !reportDownload.text.includes("Report activity prompt trace") &&
          !reportDownload.text.includes("report-response-id-that-must-not-appear") &&
          !reportDownload.text.includes("customEndpoint"),
        "project report redacts AI activity summaries and provider trace metadata"
      );
      assert(
        !reportDownload.text.includes("report-summary-token-that-must-not-appear") &&
          !reportDownload.text.includes("report-activity-type-token-that-must-not-appear") &&
          reportDownload.text.includes("[redacted secret]"),
        "project report redacts credential-looking activity summaries and types"
      );
      assert(currentActivityEvents().some((event) => event.type === "export" && event.summary === "Project report exported"), "project report export records project activity");
      assert(state.workspaceDirtyProjectIds.has(project.id), "project report export marks workspace package dirty");

      els.exportQualityPassportMenuBtn.click();
      const qualityPassportDownload = await waitFor(() => reportDownloads.find((item) => item.text.includes("LoopCAT Quality Passport")), "quality passport download");
      assert(
        qualityPassportDownload.text.includes("Quality Contract") &&
          qualityPassportDownload.text.includes("Delivery Evidence") &&
          qualityPassportDownload.text.includes("Risk Queue") &&
          qualityPassportDownload.text.includes("Quality Categories") &&
          qualityPassportDownload.text.includes("Accuracy"),
        "quality passport export creates evidence HTML"
      );
      assert(qualityPassportDownload.text.includes(`Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`), "quality passport export includes restrictive CSP");
      assert(!qualityPassportDownload.text.includes(reportTargetText), "quality passport omits segment target text");
      assert(currentActivityEvents().some((event) => event.type === "export" && event.summary === "Quality Passport exported"), "quality passport export records project activity");

      els.exportAnonymizedProjectReportBtn.click();
      const anonymizedReportDownload = await waitFor(() => reportDownloads.find((item) => item.text.includes("LoopCAT Anonymized Project Report")), "anonymized project report download");
      assert(anonymizedReportDownload.text.includes("Anonymized project") && !anonymizedReportDownload.text.includes(state.project.name), "anonymized project report redacts project name");
      assert(anonymizedReportDownload.text.includes(`Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`), "anonymized project report includes restrictive CSP");
      assert(!anonymizedReportDownload.text.includes("external-domain-token-that-must-redact"), "anonymized project report redacts credential-looking project domain metadata");
      assert(
        !anonymizedReportDownload.text.includes("Academic Metadata") &&
          !anonymizedReportDownload.text.includes("Private Corpus Alpha") &&
          !anonymizedReportDownload.text.includes("Sensitive experiment note") &&
          !anonymizedReportDownload.text.includes("P01"),
        "anonymized project report omits academic metadata"
      );
      assert(!anonymizedReportDownload.text.includes("forbidden-report-term") && !anonymizedReportDownload.text.includes("Workflow TM"), "anonymized project report redacts terminology and resource names");
      assert(currentActivityEvents().some((event) => event.type === "export" && event.summary === "Anonymized project report exported"), "anonymized project report export records project activity");
    } finally {
      URL.createObjectURL = originalReportCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalReportAnchorClick;
    }

    const statusDownloads = [];
    const statusDownloadNames = [];
    const statusRevokedUrls = [];
    const originalStatusCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalStatusRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const originalStatusAnchorClick = HTMLAnchorElement.prototype.click;
    const originalStatusConfirm = window.confirm;
    const statusConfirmMessages = [];
    URL.createObjectURL = (blob) => {
      statusDownloads.push({ type: blob.type, blob });
      return originalStatusCreateObjectUrl(blob);
    };
    URL.revokeObjectURL = (url) => {
      statusRevokedUrls.push(url);
      return originalStatusRevokeObjectUrl(url);
    };
    HTMLAnchorElement.prototype.click = function noopStatusDownloadClick() {
      statusDownloadNames.push(this.download);
    };
    window.confirm = (message) => {
      statusConfirmMessages.push(String(message || ""));
      return true;
    };
    try {
      download("../CON.txt", "unsafe filename fixture", "text/plain");
      download("unsafe:name/target?.xlf", "unsafe filename fixture", "application/x-xliff+xml");
      download("Bearer download-label-token-that-must-not-appear.txt", "unsafe filename fixture", "text/plain");
      assert(
        statusDownloadNames.includes("loopcat_CON.txt") &&
          statusDownloadNames.includes("target_.xlf") &&
          !statusDownloadNames.some((name) => /[<>:"/\\|?*\u0000-\u001f]/.test(name)) &&
          !statusDownloadNames.some((name) => name.includes("download-label-token-that-must-not-appear")) &&
          statusDownloadNames.some((name) => name.includes("[redacted secret]")),
        "downloads sanitize reserved names path separators unsafe characters and credential-looking labels"
      );
      setSaveStatus("Bearer save-status-token-that-must-not-appear failed", "dirty");
      assert(
        els.saveStatus.textContent.includes("[redacted secret]") &&
          !els.saveStatus.textContent.includes("save-status-token-that-must-not-appear"),
        "save status redacts credential-looking text"
      );
      state[OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG] = "Bearer ai-connection-status-token-that-must-not-appear";
      try {
        clearOpenAiKey();
        assert(
          els.aiConnectionStatus.textContent.includes("[redacted secret]") &&
            !els.aiConnectionStatus.textContent.includes("ai-connection-status-token-that-must-not-appear"),
          "AI connection status redacts credential-looking key-storage errors"
        );
      } finally {
        Reflect.deleteProperty(state, OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG);
      }
      els.focusModeBtn.focus();
      renderValidationReport({
        ok: true,
        errors: [],
        risky: [],
        warnings: ["Bearer validation-report-warning-token-that-must-not-appear"],
        simplified: [],
        skipped: [],
        preserved: ["Bearer validation-report-preserved-token-that-must-not-appear"]
      });
      const validationReportText = `${els.validationReportPanel.textContent}\n${JSON.stringify(state.lastValidationReport || {})}`;
      assert(
        validationReportText.includes("[redacted secret]") &&
          !validationReportText.includes("validation-report-warning-token-that-must-not-appear") &&
          !validationReportText.includes("validation-report-preserved-token-that-must-not-appear"),
        "validation report display redacts credential-looking app-added messages"
      );
      assert(
        importExportController?.getState?.().validationVisible &&
          importExportController.getState().validationCount === 2 &&
          !els.validationReportList.querySelector("img"),
        "checked import/export controller owns safe validation rendering"
      );
      const validationDismissButton = els.validationReportMeta.querySelector(".validation-dismiss");
      validationDismissButton.focus();
      validationDismissButton.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      assert(
          !importExportController?.getState?.().validationVisible &&
          state.lastValidationReport === null &&
          document.activeElement === els.focusModeBtn,
        "checked import/export controller restores validation focus after dismissal"
      );
      const originalValidationAlert = window.alert;
      const validationAlerts = [];
      try {
        window.alert = (message) => validationAlerts.push(String(message || ""));
        const alertLeakPackage = await buildProjectPackage(state.project);
        alertLeakPackage.activityEvents = [
          {
            id: "Bearer validation-alert-activity-token-that-must-not-appear",
            projectId: state.project.id,
            type: "import",
            summary: "Alert duplicate fixture",
            detail: {},
            createdAt: new Date().toISOString()
          },
          {
            id: "Bearer validation-alert-activity-token-that-must-not-appear",
            projectId: state.project.id,
            type: "import",
            summary: "Alert duplicate fixture",
            detail: {},
            createdAt: new Date().toISOString()
          }
        ];
        const alertLeakImport = await importProjectPackageData(alertLeakPackage, {
          sourceName: "Bearer validation-alert-source-token-that-must-not-appear.loopcat.json"
        });
        const validationAlertText = validationAlerts.join("\n");
        assert(
          !alertLeakImport &&
            validationAlertText.includes("[redacted secret]") &&
            !validationAlertText.includes("validation-alert-activity-token-that-must-not-appear") &&
            !els.saveStatus.textContent.includes("validation-alert-source-token-that-must-not-appear"),
          "project package validation alert redacts credential-looking errors"
        );
      } finally {
        window.alert = originalValidationAlert;
      }
      const originalLabelProject = state.project;
      const originalLabelProjects = state.projects;
      const originalLabelProjectSummaries = currentProjectSummaries();
      const originalLabelResourceState = resourcesController.getState();
      const originalLabelConfirm = window.confirm;
      const originalDocuments = projectDocumentManifest(state.project);
      const labelDocumentName = "Bearer ui-document-label-token-that-must-not-appear";
      const labelProject = {
        ...state.project,
        name: "Bearer ui-project-label-token-that-must-not-appear",
        sourceFileName: "Bearer ui-source-file-label-token-that-must-not-appear",
        documents: originalDocuments.map((documentInfo, index) => index === 0 ? { ...documentInfo, name: labelDocumentName } : documentInfo)
      };
      const capturedLabelPrompts = [];
      try {
        state.project = labelProject;
        state.projects = state.projects.map((item) => item.id === labelProject.id ? labelProject : item);
        editorSessionStore.replaceProjectSummaries(
          currentProjectSummaries().map((item) =>
            item.id === labelProject.id ? { ...item, ...labelProject } : item
          )
        );
        window.confirm = (message) => {
          capturedLabelPrompts.push(message);
          return false;
        };
        renderAll();
        renderProjectsView();
        await confirmDeleteProject(labelProject.id);
        await confirmDeleteFile(projectDocuments()[0]);
        confirmDuplicateImport(new File(["duplicate"], labelDocumentName, { type: "text/plain" }));
        const labelUiText = [
          els.projectList.textContent,
          els.projectHomeView.textContent,
          els.editorView.textContent,
          els.projectDashboard.textContent,
          els.documentFilter.textContent,
          capturedLabelPrompts.join("\n")
        ].join("\n");
        assert(
          labelUiText.includes("[redacted secret]") &&
            !labelUiText.includes("ui-project-label-token-that-must-not-appear") &&
            !labelUiText.includes("ui-source-file-label-token-that-must-not-appear") &&
            !labelUiText.includes("ui-document-label-token-that-must-not-appear"),
          "project and document labels redact credential-looking text in visible UI and prompts"
        );
        resourcesController.selectType("tm", { render: false });
        resourcesController.setResources({ tmEntries: [{
          id: "ui-resource-label-entry",
          tmName: "Bearer ui-resource-label-token-that-must-not-appear",
          source: "Resource source",
          target: "Resource target",
          sourceLang: state.project.sourceLang,
          targetLang: state.project.targetLang,
          languagePair: `${state.project.sourceLang}::${state.project.targetLang}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }], terms: originalLabelResourceState.terms }, false);
        renderResourcesView();
        assert(
          els.tmResourceDashboard.textContent.includes("[redacted secret]") &&
            !els.tmResourceDashboard.textContent.includes("ui-resource-label-token-that-must-not-appear"),
          "resource labels redact credential-looking text in visible UI"
        );
      } finally {
        window.confirm = originalLabelConfirm;
        state.project = originalLabelProject;
        state.projects = originalLabelProjects;
        editorSessionStore.replaceProjectSummaries(originalLabelProjectSummaries);
        resourcesController.selectType(originalLabelResourceState.type, { render: false });
        resourcesController.setResources({
          tmEntries: originalLabelResourceState.tmEntries,
          terms: originalLabelResourceState.terms
        }, false);
        if (originalLabelResourceState.openKey) {
          resourcesController.openResource(originalLabelResourceState.type, originalLabelResourceState.openKey, {
            render: false,
            focus: false
          });
        }
        renderAll();
        renderProjectsView();
        renderResourcesView();
      }
      await exportTargetText();
      assert(els.saveStatus.textContent.startsWith("Target TXT exported") && statusDownloads.some((item) => item.type === "text/plain"), "target TXT export reports success");
      await exportBilingualDocx();
      assert(els.saveStatus.textContent.startsWith("Bilingual DOCX exported") && statusDownloads.some((item) => item.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "bilingual DOCX export reports success");
      await exportLocalization();
      assert(els.saveStatus.textContent.startsWith("Localization file exported") && statusDownloads.some((item) => item.type === "text/html"), "localization export reports success");
      await exportXliff();
      assert(els.saveStatus.textContent.startsWith("XLIFF exported") && statusDownloads.some((item) => item.type === "application/x-xliff+xml"), "XLIFF export reports success");
      await exportXliff22();
      assert(els.saveStatus.textContent.startsWith("XLIFF 2.2 exported") && statusDownloads.some((item) => item.type === "application/xliff+xml"), "XLIFF 2.2 export reports success with the registered MIME type");
      assert(
        statusConfirmMessages.every((message) => message.includes("incomplete translation work") && message.includes("Export anyway?")),
        "incomplete delivery export confirmations describe the scoped warning"
      );
      await saveTmEntry({
        source: "TMX origin privacy source.",
        target: "TMX origin privacy target.",
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        projectName: "Bearer project-tmx-origin-token-that-must-not-appear",
        tmName: mainTmName()
      });
      const xmlDownloadsBeforeProjectTmx = statusDownloads.filter((item) => item.type === "application/xml").length;
      await handleTmxExport();
      const projectTmxDownloads = statusDownloads.filter((item) => item.type === "application/xml");
      const projectTmxDownload = projectTmxDownloads[projectTmxDownloads.length - 1];
      const projectTmxText = await projectTmxDownload.blob.text();
      assert(els.saveStatus.textContent.includes("project TM") && projectTmxDownloads.length > xmlDownloadsBeforeProjectTmx, "project TMX export reports success");
      assert(
        projectTmxText.includes("TMX origin privacy source.") &&
          !projectTmxText.includes("project-tmx-origin-token-that-must-not-appear") &&
          projectTmxText.includes("[redacted secret]"),
        "project TMX export redacts credential-looking origin metadata"
      );
      await refreshResources();
      const xmlDownloadsBeforeResourceTmx = statusDownloads.filter((item) => item.type === "application/xml").length;
      exportResource("tm", `${mainTmName()}::${state.project.sourceLang}::${state.project.targetLang}`);
      const resourceTmxDownloads = statusDownloads.filter((item) => item.type === "application/xml");
      const resourceTmxDownload = resourceTmxDownloads[resourceTmxDownloads.length - 1];
      const resourceTmxText = await resourceTmxDownload.blob.text();
      assert(
        resourceTmxDownloads.length > xmlDownloadsBeforeResourceTmx &&
          resourceTmxText.includes("TMX origin privacy source.") &&
          !resourceTmxText.includes("project-tmx-origin-token-that-must-not-appear") &&
          resourceTmxText.includes("[redacted secret]"),
        "standalone TMX resource export redacts credential-looking origin metadata"
      );
      const xmlDownloadsBeforeProjectTbx = statusDownloads.filter((item) => item.type === "application/xml").length;
      await handleTbxExport();
      const projectTbxDownloads = statusDownloads.filter((item) => item.type === "application/xml");
      const projectTbxDownload = projectTbxDownloads[projectTbxDownloads.length - 1];
      const projectTbxText = await projectTbxDownload.blob.text();
      assert(
        projectTbxDownloads.length > xmlDownloadsBeforeProjectTbx &&
          !projectTbxText.includes("report-term-note-token-that-must-not-appear") &&
          projectTbxText.includes("Report terminology fixture [redacted secret]"),
        "project TBX export redacts credential-looking termbase notes"
      );
      await refreshResources();
      const xmlDownloadsBeforeResourceTbx = statusDownloads.filter((item) => item.type === "application/xml").length;
      exportResource("tb", `${primaryTermBaseName()}::${state.project.sourceLang}::${state.project.targetLang}`);
      const resourceTbxDownloads = statusDownloads.filter((item) => item.type === "application/xml");
      const resourceTbxDownload = resourceTbxDownloads[resourceTbxDownloads.length - 1];
      const resourceTbxText = await resourceTbxDownload.blob.text();
      assert(
        resourceTbxDownloads.length > xmlDownloadsBeforeResourceTbx &&
          !resourceTbxText.includes("report-term-note-token-that-must-not-appear") &&
          resourceTbxText.includes("Report terminology fixture [redacted secret]"),
        "standalone TBX resource export redacts credential-looking termbase notes"
      );
      const targetTxtDownloadCountBeforeActivityFailure = statusDownloads.filter((item) => item.type === "text/plain").length;
      setHiddenSegmentField(state.project, EXPORT_ACTIVITY_FAILURE_TEST_FLAG, true);
      await exportTargetText();
      assert(
        els.saveStatus.textContent.includes("Target TXT exported") &&
          els.saveStatus.textContent.includes("activity log failed") &&
          statusDownloads.filter((item) => item.type === "text/plain").length > targetTxtDownloadCountBeforeActivityFailure &&
          state.workspaceDirtyProjectIds.has(project.id),
        "target TXT export activity log failure reports warning after successful download"
      );
      Reflect.deleteProperty(state.project, EXPORT_ACTIVITY_FAILURE_TEST_FLAG);
      const revokedUrlCountBeforeClickFailure = statusRevokedUrls.length;
      const temporaryDownloadLinksBeforeClickFailure = document.querySelectorAll("a[download]").length;
      HTMLAnchorElement.prototype.click = function failingStatusDownloadClick() {
        throw new Error("Simulated download click failure");
      };
      await exportTargetText();
      assert(
        els.saveStatus.textContent.includes("Simulated download click failure") &&
          document.querySelectorAll("a[download]").length === temporaryDownloadLinksBeforeClickFailure &&
          statusRevokedUrls.length > revokedUrlCountBeforeClickFailure,
        "target TXT export click failure cleans up temporary download link and URL"
      );
      HTMLAnchorElement.prototype.click = function noopStatusDownloadClick() {
        statusDownloadNames.push(this.download);
      };
      URL.createObjectURL = () => {
        throw new Error("Simulated download failure");
      };
      await exportTargetText();
      assert(els.saveStatus.textContent.includes("Simulated download failure"), "target TXT export failure reports visible status");
      await exportXliff();
      assert(els.saveStatus.textContent.includes("Simulated download failure"), "XLIFF export failure reports visible status");
      await handleTmxExport();
      assert(els.saveStatus.textContent.includes("Simulated download failure"), "project TMX export failure reports visible status");
      await handleTbxExport();
      assert(els.saveStatus.textContent.includes("Simulated download failure"), "project TBX export failure reports visible status");
      exportResource("tm", `${mainTmName()}::${state.project.sourceLang}::${state.project.targetLang}`);
      assert(els.saveStatus.textContent.includes("Simulated download failure"), "resource export failure reports visible status");
    } finally {
      URL.createObjectURL = originalStatusCreateObjectUrl;
      URL.revokeObjectURL = originalStatusRevokeObjectUrl;
      HTMLAnchorElement.prototype.click = originalStatusAnchorClick;
      window.confirm = originalStatusConfirm;
    }

    const resourceTmEntry = await saveTmEntry({
      source: "Resource row TM source",
      target: "Resource row TM target",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: mainTmName()
    });
    const resourceTerm = await saveTerm({
      sourceTerm: "resource-row-term",
      targetTerm: "resource-row-target",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      notes: "Resource row note",
      termBaseName: primaryTermBaseName(),
      isForbidden: false
    });
    await refreshResources();
    els.resourcesViewBtn.click();
    await yieldToUi();
    const workflowTmCard = Array.from(els.tmResourceDashboard.querySelectorAll(".resource-card")).find((card) =>
      card.textContent.includes(mainTmName())
    );
    const workflowTmOpenButton = workflowTmCard?.querySelector('[data-resource-action="open"]');
    workflowTmOpenButton?.click();
    await yieldToUi();
    const resourceOpenFocusState = {
      view: currentApplicationView(),
      detailHidden: els.tmResourceDetail.classList.contains("hidden"),
      activeAction: document.activeElement?.dataset?.resourceAction || "",
      activeKey: document.activeElement?.dataset?.resourceKey || "",
      expectedKey: workflowTmOpenButton?.dataset?.resourceKey || "",
      controllerType: resourcesController?.getState?.().type || "",
      controllerOpenKey: resourcesController?.getState?.().openKey || ""
    };
    assert(
      resourceOpenFocusState.view === "resources" &&
        !resourceOpenFocusState.detailHidden &&
        document.activeElement === els.tmResourceDetail.querySelector('[data-resource-action="close-detail"]'),
      `checked Resources controller owns navigation, dashboard open intent, detail rendering, and initial focus (${JSON.stringify(resourceOpenFocusState)})`
    );
    els.tmResourceDetail.querySelector('[data-resource-action="close-detail"]').click();
    await yieldToUi();
    const resourceCloseFocusState = {
      detailHidden: els.tmResourceDetail.classList.contains("hidden"),
      activeAction: document.activeElement?.dataset?.resourceAction || "",
      activeKey: document.activeElement?.dataset?.resourceKey || "",
      expectedKey: workflowTmOpenButton.dataset.resourceKey,
      availableKeys: Array.from(els.tmResourceDashboard.querySelectorAll('[data-resource-action="open"]')).map(
        (button) => button.dataset.resourceKey || ""
      )
    };
    assert(
      resourceCloseFocusState.detailHidden &&
        resourceCloseFocusState.activeAction === "open" &&
        resourceCloseFocusState.activeKey === resourceCloseFocusState.expectedKey,
      `Resources detail close restores focus to the originating resource card action (${JSON.stringify(resourceCloseFocusState)})`
    );
    els.tmResourceTab.focus();
    els.tmResourceTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await yieldToUi();
    assert(
      els.tbResourceTab.getAttribute("aria-selected") === "true" &&
        document.activeElement === els.tbResourceTab &&
        !els.tbResourcesPanel.hasAttribute("hidden"),
      "Resources tabs expose one keyboard-operated tab state and matching panel"
    );
    setView("editor");
    await yieldToUi();
    const editableResourceState = resourcesController.getState();
    const editableTmEntry = editableResourceState.tmEntries.find((entry) => entry.id === resourceTmEntry.id);
    const editableTerm = editableResourceState.terms.find((term) => term.id === resourceTerm.id);
    assert(Boolean(editableTmEntry && editableTerm), "resource row edit fixtures are visible in resource state");
    setHiddenSegmentField(editableTmEntry, RESOURCE_TM_SAVE_FAILURE_TEST_FLAG, true);
    const failedResourceTmSave = await saveEditedTmResourceEntry(editableTmEntry, {
      source: resourceTmEntry.source,
      target: "Unsaved TM resource target"
    });
    const failedStoredTm = (await listTmEntries()).find((entry) => entry.id === resourceTmEntry.id);
    assert(
      !failedResourceTmSave &&
        els.saveStatus.textContent.includes("Simulated TM resource save failure") &&
        failedStoredTm?.target === resourceTmEntry.target,
      "TM resource row save failure reports visible status without changing stored entry"
    );
    Reflect.deleteProperty(editableTmEntry, RESOURCE_TM_SAVE_FAILURE_TEST_FLAG);
    clearWorkspaceDirtyMarkers();
    const successfulResourceTmSave = await saveEditedTmResourceEntry(editableTmEntry, {
      source: resourceTmEntry.source,
      target: "Saved TM resource target"
    });
    const savedStoredTm = (await listTmEntries()).find((entry) => entry.id === resourceTmEntry.id);
    assert(
      successfulResourceTmSave &&
        savedStoredTm?.target === "Saved TM resource target" &&
        state.workspaceDirtyProjectIds.has(project.id),
      "TM resource row save persists entry and marks linked project dirty"
    );
    setHiddenSegmentField(editableTmEntry, RESOURCE_TM_DELETE_FAILURE_TEST_FLAG, true);
    const failedResourceTmDelete = await deleteTmResourceEntry(editableTmEntry);
    const failedDeletedTm = (await listTmEntries()).find((entry) => entry.id === resourceTmEntry.id);
    assert(
      !failedResourceTmDelete &&
        els.saveStatus.textContent.includes("Simulated TM resource delete failure") &&
        Boolean(failedDeletedTm),
      "TM resource row delete failure reports visible status without deleting stored entry"
    );
    Reflect.deleteProperty(editableTmEntry, RESOURCE_TM_DELETE_FAILURE_TEST_FLAG);
    clearWorkspaceDirtyMarkers();
    const successfulResourceTmDelete = await deleteTmResourceEntry(editableTmEntry);
    const tmEntryTrash = (await appRuntime.trashRepository.list()).find(
      (entry) => entry.entityType === "tm-entry" && entry.entityId === resourceTmEntry.id
    );
    assert(
      successfulResourceTmDelete &&
        !(await listTmEntries()).some((entry) => entry.id === resourceTmEntry.id) &&
        state.workspaceDirtyProjectIds.has(project.id) &&
        tmEntryTrash?.payload?.records?.[0]?.target === "Saved TM resource target" &&
        els.saveStatus.textContent.includes("Undo is available"),
      "TM resource row delete moves the exact entry to persistent Trash and marks linked project dirty"
    );
    await undoLastCommand();
    const restoredTmCandidates = await getTmMatchCandidates({
      source: resourceTmEntry.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      tmName: mainTmName()
    });
    assert(
      (await listTmEntries()).some(
        (entry) => entry.id === resourceTmEntry.id && entry.target === "Saved TM resource target"
      ) &&
        restoredTmCandidates.some((entry) => entry.id === resourceTmEntry.id) &&
        !(await appRuntime.trashRepository.list()).some((entry) => entry.id === tmEntryTrash.id),
      "TM resource row Undo restores exact content, rebuildable search indexes, and removes its Trash token"
    );
    await redoLastCommand();
    assert(
      !(await listTmEntries()).some((entry) => entry.id === resourceTmEntry.id) &&
        (await appRuntime.trashRepository.list()).some(
          (entry) => entry.entityType === "tm-entry" && entry.entityId === resourceTmEntry.id
        ),
      "TM resource row Redo returns the entry to Trash with a fresh recovery token"
    );
    setHiddenSegmentField(editableTerm, RESOURCE_TERM_SAVE_FAILURE_TEST_FLAG, true);
    const failedResourceTermSave = await saveEditedTermResourceEntry(editableTerm, {
      sourceTerm: resourceTerm.sourceTerm,
      targetTerm: "unsaved-resource-term-target",
      notes: "Unsaved resource term note",
      isForbidden: true
    });
    const failedStoredTerm = (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: [primaryTermBaseName()] })).find((term) => term.id === resourceTerm.id);
    assert(
      !failedResourceTermSave &&
        els.saveStatus.textContent.includes("Simulated term resource save failure") &&
        failedStoredTerm?.targetTerm === resourceTerm.targetTerm &&
        failedStoredTerm?.isForbidden === false,
      "term resource row save failure reports visible status without changing stored term"
    );
    Reflect.deleteProperty(editableTerm, RESOURCE_TERM_SAVE_FAILURE_TEST_FLAG);
    clearWorkspaceDirtyMarkers();
    const successfulResourceTermSave = await saveEditedTermResourceEntry(editableTerm, {
      sourceTerm: resourceTerm.sourceTerm,
      targetTerm: "saved-resource-term-target",
      notes: "Saved resource term note",
      isForbidden: true
    });
    const savedStoredTerm = (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: [primaryTermBaseName()] })).find((term) => term.id === resourceTerm.id);
    assert(
      successfulResourceTermSave &&
        savedStoredTerm?.targetTerm === "saved-resource-term-target" &&
        savedStoredTerm?.isForbidden === true &&
        state.workspaceDirtyProjectIds.has(project.id),
      "term resource row save persists term and marks linked project dirty"
    );
    setHiddenSegmentField(editableTerm, RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG, true);
    const failedResourceTermDelete = await deleteTermResourceEntry(editableTerm);
    const failedDeletedTerm = (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: [primaryTermBaseName()] })).find((term) => term.id === resourceTerm.id);
    assert(
      !failedResourceTermDelete &&
        els.saveStatus.textContent.includes("Simulated term resource delete failure") &&
        Boolean(failedDeletedTerm),
      "term resource row delete failure reports visible status without deleting stored term"
    );
    Reflect.deleteProperty(editableTerm, RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG);
    clearWorkspaceDirtyMarkers();
    const successfulResourceTermDelete = await deleteTermResourceEntry(editableTerm);
    const termEntryTrash = (await appRuntime.trashRepository.list()).find(
      (entry) => entry.entityType === "term" && entry.entityId === resourceTerm.id
    );
    assert(
      successfulResourceTermDelete &&
        !(await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang, termBaseNames: [primaryTermBaseName()] })).some((term) => term.id === resourceTerm.id) &&
        state.workspaceDirtyProjectIds.has(project.id) &&
        termEntryTrash?.payload?.records?.[0]?.notes === "Saved resource term note" &&
        els.saveStatus.textContent.includes("Undo is available"),
      "term resource row delete moves the exact term to persistent Trash and marks linked project dirty"
    );
    await undoLastCommand();
    const restoredResourceTerm = (
      await listTerms({
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        termBaseNames: [primaryTermBaseName()]
      })
    ).find((term) => term.id === resourceTerm.id);
    const restoredTermSuggestions = await findTerms({
      source: resourceTerm.sourceTerm,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: [primaryTermBaseName()]
    });
    assert(
      restoredResourceTerm?.targetTerm === "saved-resource-term-target" &&
        restoredResourceTerm?.isForbidden === true &&
        restoredTermSuggestions.some((term) => term.id === resourceTerm.id) &&
        !(await appRuntime.trashRepository.list()).some((entry) => entry.id === termEntryTrash.id),
      "term resource row Undo restores exact metadata, rebuildable search indexes, and removes its Trash token"
    );
    await redoLastCommand();
    assert(
      !(await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang })).some(
        (term) => term.id === resourceTerm.id
      ) &&
        (await appRuntime.trashRepository.list()).some(
          (entry) => entry.entityType === "term" && entry.entityId === resourceTerm.id
        ),
      "term resource row Redo returns the term to Trash with a fresh recovery token"
    );

    const bulkTmName = `Workflow Bulk Delete TM ${Date.now()}`;
    const bulkTbName = `Workflow Bulk Delete TB ${Date.now()}`;
    await saveTmEntry({
      source: "bulk delete tm source one",
      target: "bulk delete tm target one",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: bulkTmName
    });
    await saveTmEntry({
      source: "bulk delete tm source two",
      target: "bulk delete tm target two",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: bulkTmName
    });
    await saveTerm({
      sourceTerm: "bulk delete tb source one",
      targetTerm: "bulk delete tb target one",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseName: bulkTbName
    });
    await saveTerm({
      sourceTerm: "bulk delete tb source two",
      targetTerm: "bulk delete tb target two",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseName: bulkTbName
    });
    await refreshResources();
    const bulkTmKey = `${bulkTmName}::${state.project.sourceLang}::${state.project.targetLang}`;
    const bulkTbKey = `${bulkTbName}::${state.project.sourceLang}::${state.project.targetLang}`;
    const atomicConflictTrashId = `workflow-resource-trash-conflict-${Date.now()}`;
    await storageApi.put("trashEntries", {
      id: atomicConflictTrashId,
      entityType: "project",
      entityId: "atomic-conflict-placeholder",
      projectId: "atomic-conflict-placeholder",
      label: "Atomic conflict placeholder",
      deletedAt: new Date().toISOString(),
      payload: {}
    });
    let atomicResourceTrashFailure = null;
    try {
      await storageApi.moveResourceRecordsToTrash("tm", {
        id: atomicConflictTrashId,
        entityType: "translation-memory",
        entityId: `tm:${bulkTmKey}`,
        projectId: "",
        resourceType: "tm",
        resourceName: bulkTmName,
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        languagePair: `${state.project.sourceLang}::${state.project.targetLang}`,
        label: bulkTmName,
        deletedAt: new Date().toISOString(),
        payload: { records: resourceItems("tm", bulkTmKey) }
      });
    } catch (error) {
      atomicResourceTrashFailure = error;
    }
    assert(
      Boolean(atomicResourceTrashFailure) &&
        (await listTmEntries()).filter((entry) => entry.tmName === bulkTmName).length === 2 &&
        (await storageApi.get("trashEntries", atomicConflictTrashId))?.entityType === "project",
      "resource Trash transaction conflict rolls back every live record and preserves the existing Trash item"
    );
    await storageApi.deleteByKey("trashEntries", atomicConflictTrashId);
    RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.add(`tm:${bulkTmKey}`);
    const failedBulkTmDelete = await confirmDeleteResource("tm", bulkTmKey);
    const failedBulkTmEntries = (await listTmEntries()).filter((entry) => entry.tmName === bulkTmName);
    assert(
      !failedBulkTmDelete &&
        els.saveStatus.textContent.includes("Simulated TM resource delete failure") &&
        failedBulkTmEntries.length === 2 &&
        !(await appRuntime.trashRepository.list()).some((entry) => entry.resourceName === bulkTmName),
      "TM whole resource delete failure preserves every live entry and creates no Trash item"
    );
    RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.delete(`tm:${bulkTmKey}`);
    const successfulBulkTmDelete = await confirmDeleteResource("tm", bulkTmKey);
    const bulkTmTrash = (await appRuntime.trashRepository.list()).find(
      (entry) => entry.entityType === "translation-memory" && entry.resourceName === bulkTmName
    );
    assert(
      successfulBulkTmDelete &&
        !(await listTmEntries()).some((entry) => entry.tmName === bulkTmName) &&
        bulkTmTrash?.payload?.records?.length === 2,
      "TM whole resource deletion moves every entry to one persistent Trash item"
    );
    await undoLastCommand();
    assert(
      (await listTmEntries()).filter((entry) => entry.tmName === bulkTmName).length === 2 &&
        !(await appRuntime.trashRepository.list()).some((entry) => entry.id === bulkTmTrash.id),
      "TM whole resource Undo atomically restores every entry"
    );
    await redoLastCommand();
    const redoneBulkTmTrash = (await appRuntime.trashRepository.list()).find(
      (entry) => entry.entityType === "translation-memory" && entry.resourceName === bulkTmName
    );
    const conflictingBulkTmEntry = await saveTmEntry({
      source: "conflicting live TM source",
      target: "conflicting live TM target",
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      projectName: state.project.name,
      tmName: bulkTmName
    });
    let bulkTmRestoreConflict = null;
    try {
      await appRuntime.trashRepository.restore(redoneBulkTmTrash.id);
    } catch (error) {
      bulkTmRestoreConflict = error;
    }
    assert(
      bulkTmRestoreConflict?.message?.includes("same name and language pair") &&
      (await appRuntime.trashRepository.list()).some((entry) => entry.id === redoneBulkTmTrash.id) &&
        (await listTmEntries()).some((entry) => entry.id === conflictingBulkTmEntry.id),
      "TM whole resource restore conflict preserves both the Trash item and live resource"
    );
    await deleteTmEntry(conflictingBulkTmEntry.id);

    RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.add(`tb:${bulkTbKey}`);
    const failedBulkTbDelete = await confirmDeleteResource("tb", bulkTbKey);
    const failedBulkTbTerms = (
      await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang })
    ).filter((term) => term.termBaseName === bulkTbName);
    assert(
      !failedBulkTbDelete &&
        els.saveStatus.textContent.includes("Simulated termbase resource delete failure") &&
        failedBulkTbTerms.length === 2 &&
        !(await appRuntime.trashRepository.list()).some((entry) => entry.resourceName === bulkTbName),
      "termbase whole resource delete failure preserves every live term and creates no Trash item"
    );
    RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.delete(`tb:${bulkTbKey}`);
    const successfulBulkTbDelete = await confirmDeleteResource("tb", bulkTbKey);
    const bulkTbTrash = (await appRuntime.trashRepository.list()).find(
      (entry) => entry.entityType === "termbase" && entry.resourceName === bulkTbName
    );
    assert(
      successfulBulkTbDelete &&
        !(await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang })).some(
          (term) => term.termBaseName === bulkTbName
        ) &&
        bulkTbTrash?.payload?.records?.length === 2,
      "termbase whole resource deletion moves every term to one persistent Trash item"
    );
    await undoLastCommand();
    assert(
      (await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang })).filter(
        (term) => term.termBaseName === bulkTbName
      ).length === 2 && !(await appRuntime.trashRepository.list()).some((entry) => entry.id === bulkTbTrash.id),
      "termbase whole resource Undo atomically restores every term"
    );
    await redoLastCommand();
    assert(
      !(await listTerms({ sourceLang: state.project.sourceLang, targetLang: state.project.targetLang })).some(
        (term) => term.termBaseName === bulkTbName
      ) &&
        (await appRuntime.trashRepository.list()).some(
          (entry) => entry.entityType === "termbase" && entry.resourceName === bulkTbName
        ),
      "termbase whole resource Redo returns every term to one fresh Trash item"
    );
    const resourceTrashBackup = await exportAllData();
    assert(
      resourceTrashBackup.schemaVersion === 6 &&
        resourceTrashBackup.trashEntries.some(
          (entry) => entry.entityType === "translation-memory" && entry.payload?.records?.length === 2
        ) &&
        resourceTrashBackup.trashEntries.some(
          (entry) => entry.entityType === "termbase" && entry.payload?.records?.length === 2
        ) &&
        !resourceTrashBackup.tmEntries.some((entry) => entry.tmName === bulkTmName) &&
        !resourceTrashBackup.terms.some((term) => term.termBaseName === bulkTbName),
      "schema-6 backup preserves resource Trash while project-package schema remains independent"
    );

    await importLocalization(new File([JSON.stringify({ title: "Package source JSON" })], "workflow-structure.json", { type: "application/json" }));
    await importLocalization(new File(["key,source,target\nbutton,Package source CSV,CSV hedef"], "workflow-structure.csv", { type: "text/csv" }));
    assert(
      Boolean(state.project.documents.find((item) => item.name === "workflow-structure.json")) &&
        Boolean(state.project.documents.find((item) => item.name === "workflow-structure.csv")),
      "project package source-asset fixtures imported"
    );

    const packageDownloads = [];
    const originalPackageCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalPackageAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      blob.text().then((text) => packageDownloads.push({ type: blob.type, text }));
      return originalPackageCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopPackageDownloadClick() {};
    try {
      const oldCreatedAt = new Date(Date.now() - 10 * 86400000).toISOString();
      state.project = await updateProject({ ...state.project, createdAt: oldCreatedAt, exportHistory: [] });
      state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
      localStorage.removeItem(BACKUP_REMINDER_STORAGE);
      renderBackupReminder();
      assert(!els.backupReminderPanel.classList.contains("hidden") && els.backupReminderMessage.textContent.includes("no project package export"), "long-running project without package export shows backup reminder");
      els.backupReminderDismissBtn.click();
      assert(els.backupReminderPanel.classList.contains("hidden"), "backup reminder can be dismissed temporarily");
      localStorage.removeItem(BACKUP_REMINDER_STORAGE);
      renderBackupReminder();
      assert(!els.backupReminderPanel.classList.contains("hidden"), "backup reminder returns after dismissal window is cleared");
      const packageExportActivityCountBeforeFailure = currentActivityEvents().filter((event) => event.type === "export" && event.summary === "Project package exported").length;
      const packageFlushFailureText = `Paket dis aktarimi oncesi bekleyen hata ${Date.now()}`;
      updateSegmentDraft(segmentIndex, packageFlushFailureText);
      setHiddenSegmentField(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG, true);
      const packageDownloadCountBeforeFlushFailure = packageDownloads.length;
      await exportProjectPackage();
      assert(
        els.saveStatus.textContent.includes("Simulated pending save flush failure") &&
          state.saveTimers.has(state.segments[segmentIndex].id) &&
          packageDownloads.length === packageDownloadCountBeforeFlushFailure &&
          currentActivityEvents().filter((event) => event.type === "export" && event.summary === "Project package exported").length === packageExportActivityCountBeforeFailure,
        "project package export reports pending save flush failure without download or activity"
      );
      Reflect.deleteProperty(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG);
      await flushPendingSegmentSaves(project.id);
      URL.createObjectURL = () => {
        throw new Error("Simulated package download failure");
      };
      await exportProjectPackage();
      assert(
        els.saveStatus.textContent.includes("Simulated package download failure") &&
          !(state.project.exportHistory || []).some((entry) => entry.type === "project-package") &&
          currentActivityEvents().filter((event) => event.type === "export" && event.summary === "Project package exported").length === packageExportActivityCountBeforeFailure,
        "project package download failure does not record export success"
      );
      URL.createObjectURL = (blob) => {
        blob.text().then((text) => packageDownloads.push({ type: blob.type, text }));
        return originalPackageCreateObjectUrl(blob);
      };
      const packageExportTargetText = `Paket dis aktariminda saklanan hedef ${Date.now()}`;
      updateSegmentDraft(segmentIndex, packageExportTargetText);
      assert(state.saveTimers.has(state.segments[segmentIndex].id), "pending save exists before project package export");
      await exportProjectPackage();
      const packageDownload = await waitFor(() => packageDownloads.find((item) => item.type === "application/json" && item.text.includes('"type": "project-package"')), "project package download");
      const exportedPackage = JSON.parse(packageDownload.text);
      assert((exportedPackage.segments || []).some((segment) => segment.target === packageExportTargetText), "project package export flushes pending segment edits");
      assert((exportedPackage.segments || []).some((segment) => segment.targetHistory?.some((entry) => entry.reason === "edit" && entry.toTarget === packageExportTargetText)), "project package export preserves pending segment revision history");
      assert(exportedPackage.project.exportHistory?.some((entry) => entry.type === "project-package" && entry.filename?.endsWith(".loopcat.json")), "project package export includes export history entry");
      assert(exportedPackage.activityEvents?.some((event) => event.type === "export" && event.summary === "Project package exported"), "project package export includes export activity event");
      assert(
        exportedPackage.sourceAssets?.some((asset) => asset.name === "workflow-structure.json" && asset.originalAvailable && asset.structurePreserved) &&
          exportedPackage.sourceAssets?.some((asset) => asset.name === "workflow-structure.csv" && asset.originalAvailable && asset.structurePreserved),
        "project package source assets report JSON and CSV reconstruction data"
      );
      assert(els.backupReminderPanel.classList.contains("hidden"), "project package export clears backup reminder");
    } finally {
      URL.createObjectURL = originalPackageCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalPackageAnchorClick;
    }

    const switchText = `Proje gecisinde saklanan hedef ${Date.now()}`;
    updateSegmentDraft(segmentIndex, switchText);
    assert(state.saveTimers.size > 0, "pending save exists before project switch");
    const secondProject = await createProject({
      name: `Workflow Switch ${Date.now()}`,
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await loadProjects(false);
    await openProject(secondProject.id);
    const firstProjectSegments = await getProjectSegments(project.id);
    assert(firstProjectSegments.some((segment) => segment.target === switchText), "project switch flushes pending segment edits");

    await openProject(project.id);
    openProjectDialog("create");
    document.querySelector("#projectNameInput").value = `Workflow Create Activity ${Date.now()}`;
    document.querySelector("#projectDomainInput").value = "Creation warning";
    document.querySelector("#sourceLangInput").value = "en";
    document.querySelector("#targetLangInput").value = "tr";
    els.newTmNameInput.value = "Workflow TM";
    els.newTermBaseNameInput.value = "Workflow TB";
    if (els.saveProjectToFolderInput) els.saveProjectToFolderInput.checked = false;
    setHiddenSegmentField(els.projectForm, CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG, true);
    const createActivityProject = await saveProjectFromDialog();
    assert(
      createActivityProject?.id &&
        state.project?.id === createActivityProject.id &&
        els.saveStatus.textContent.includes("activity log failed") &&
        state.workspaceDirtyProjectIds.has(createActivityProject.id),
      "project creation activity log failure reports warning after successful project creation"
    );
    Reflect.deleteProperty(els.projectForm, CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG);
    await deleteProject(createActivityProject.id);
    clearWorkspaceDirty(createActivityProject.id);
    await loadProjects(false);
    await openProject(project.id);

    const deleteProjectFixture = await createProject({
      name: `Workflow Delete ${Date.now()}`,
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await appendProjectSegments(deleteProjectFixture.id, [{ text: "Delete after typing.", target: "" }], {
      documentId: "doc-delete-workflow",
      documentName: "delete.txt",
      documentType: "text"
    });
    await loadProjects(false);
    await openProject(deleteProjectFixture.id);
    const deleteText = `Silme oncesi hedef ${Date.now()}`;
    updateSegmentDraft(0, deleteText);
    assert(state.saveTimers.size > 0, "pending save exists before project delete");
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const deleteProjectListEntry = state.projects.find((item) => item.id === deleteProjectFixture.id);
      setHiddenSegmentField(deleteProjectListEntry, PROJECT_DELETE_FAILURE_TEST_FLAG, true);
      const failedProjectDelete = await confirmDeleteProject(deleteProjectFixture.id);
      const failedProjectDeleteSegments = await getProjectSegments(deleteProjectFixture.id);
      assert(
        !failedProjectDelete &&
          els.saveStatus.textContent.includes("Simulated project delete failure") &&
          state.projects.some((item) => item.id === deleteProjectFixture.id) &&
          failedProjectDeleteSegments.some((segment) => segment.target === deleteText),
        "project delete failure reports visible status without deleting stored project"
      );
      Reflect.deleteProperty(deleteProjectListEntry, PROJECT_DELETE_FAILURE_TEST_FLAG);
      const successfulProjectDelete = await confirmDeleteProject(deleteProjectFixture.id);
      const projectTrashEntry = (await appRuntime.trashRepository.list()).find(
        (entry) => entry.entityType === "project" && entry.projectId === deleteProjectFixture.id
      );
      assert(successfulProjectDelete && projectTrashEntry, "project delete moves records to persistent Trash after recovered failure");
      await undoLastCommand();
      assert(
        Boolean(await getAllByIndex("segments", "projectId", deleteProjectFixture.id).then((segments) => segments.length)) &&
          state.projects.some((item) => item.id === deleteProjectFixture.id),
        "Undo restores a trashed project and its segments"
      );
      await redoLastCommand();
      assert(
        !state.projects.some((item) => item.id === deleteProjectFixture.id),
        "Redo returns a restored project to Trash"
      );
    } finally {
      window.confirm = originalConfirm;
    }
    const deletedSegments = await getProjectSegments(deleteProjectFixture.id);
    assert(!deletedSegments.length && !pendingSaveRecords(deleteProjectFixture.id).length, "project delete clears pending saves without orphan segments");

    const deleteFileFixture = await createProject({
      name: `Workflow Delete File ${Date.now()}`,
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await loadProjects(false);
    await openProject(deleteFileFixture.id);
    await importLocalization(new File(["<!doctype html><html><body><p>Delete file after typing.</p></body></html>"], "delete-file.html", { type: "text/html" }));
    const deleteFileDocument = state.project.documents.find((item) => item.name === "delete-file.html");
    const deleteFileText = `Silinen dosya hedefi ${Date.now()}`;
    updateSegmentDraft(0, deleteFileText);
    assert(state.saveTimers.size > 0, "pending save exists before file delete");
    window.confirm = () => true;
    try {
      setHiddenSegmentField(deleteFileDocument, FILE_DELETE_FAILURE_TEST_FLAG, true);
      const failedFileDelete = await confirmDeleteFile(deleteFileDocument);
      const failedFileDeleteSegments = await getProjectSegments(deleteFileFixture.id);
      assert(
        !failedFileDelete &&
          els.saveStatus.textContent.includes("Simulated file delete failure") &&
          state.project.documents.some((item) => item.id === deleteFileDocument.id) &&
          failedFileDeleteSegments.some((segment) => segment.documentId === deleteFileDocument.id && segment.target === deleteFileText),
        "file delete failure reports visible status without deleting file segments"
      );
      Reflect.deleteProperty(deleteFileDocument, FILE_DELETE_FAILURE_TEST_FLAG);
      setHiddenSegmentField(deleteFileDocument, FILE_DELETE_ACTIVITY_FAILURE_TEST_FLAG, true);
      const successfulFileDelete = await confirmDeleteFile(deleteFileDocument);
      const fileTrashEntry = (await appRuntime.trashRepository.list()).find(
        (entry) => entry.entityType === "document" && entry.entityId === deleteFileDocument.id
      );
      assert(
        successfulFileDelete &&
          fileTrashEntry &&
          !state.project.documents.some((item) => item.id === deleteFileDocument.id) &&
          els.saveStatus.textContent.includes("activity log failed"),
        "file delete activity log failure reports warning while preserving the file in Trash"
      );
      Reflect.deleteProperty(deleteFileDocument, FILE_DELETE_ACTIVITY_FAILURE_TEST_FLAG);
      await undoLastCommand();
      assert(
        state.project.documents.some((item) => item.id === deleteFileDocument.id) &&
          (await getProjectSegments(deleteFileFixture.id)).some((segment) => segment.documentId === deleteFileDocument.id),
        "Undo restores a trashed file and its segments"
      );
      await redoLastCommand();
      assert(
        !state.project.documents.some((item) => item.id === deleteFileDocument.id),
        "Redo returns a restored file to Trash"
      );
    } finally {
      window.confirm = originalConfirm;
    }
    await delay(650);
    const deletedFileSegments = await getProjectSegments(deleteFileFixture.id);
    assert(!deletedFileSegments.length && !pendingSaveRecords(deleteFileFixture.id).length, "file delete clears pending saves without orphan segments");
    await appRuntime.trashRepository.emptyAll();
    await deleteProject(deleteFileFixture.id);
    clearWorkspaceDirty(deleteFileFixture.id);
    state.project = null;
    state.segments = [];
    applicationNavigation.openProjects();
    applicationNavigation.clearSelection();
    await loadProjects(false);

    state.workspaceStatus = { supported: true, connected: false, mode: "browser-cache", name: "", lastSyncedAt: "", projectCount: 0, resourceCount: 0, backupCount: 0 };
    clearWorkspaceDirtyMarkers();
    markWorkspaceDirty(project.id);
    renderWorkspaceStatus();
    assert(!els.workspaceMenuSummary.textContent.includes("unsaved") && !shouldWarnBeforeUnload(), "browser-cache dirty recovery marker stays hidden until a workspace is connected");

    const originalConnectChooseWorkspaceFolder = workspaceStorage.chooseWorkspaceFolder;
    const originalConnectListWorkspacePackages = workspaceStorage.listProjectPackages;
    try {
      state.workspaceStatus = { supported: true, connected: false, mode: "browser-cache", name: "", lastSyncedAt: "", projectCount: 0, resourceCount: 0, backupCount: 0 };
      clearWorkspaceDirtyMarkers();
      workspaceStorage.chooseWorkspaceFolder = async () => ({ supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 1, resourceCount: 0, backupCount: 0 });
      workspaceStorage.listProjectPackages = async () => [{ id: "other-project", name: "Other Project", packagePath: "projects/other/project.loopcat.json" }];
      await chooseWorkspaceFolder();
      assert(
        state.workspaceDirtyProjectIds.has(project.id) &&
          els.workspaceMenuSummary.textContent.includes("unsaved") &&
          els.saveStatus.textContent.includes("local project package") &&
          els.saveStatus.textContent.includes("to be saved"),
        "workspace folder connection marks local projects missing from the folder dirty"
      );
      clearWorkspaceDirtyMarkers();
      workspaceStorage.listProjectPackages = async () => [{ id: project.id, name: project.name, packagePath: `projects/${project.id}/project.loopcat.json` }];
      await chooseWorkspaceFolder();
      assert(
        !state.workspaceDirtyProjectIds.has(project.id),
        "workspace folder connection keeps local projects clean when the folder already has their package"
      );
    } finally {
      workspaceStorage.chooseWorkspaceFolder = originalConnectChooseWorkspaceFolder;
      workspaceStorage.listProjectPackages = originalConnectListWorkspacePackages;
      clearWorkspaceDirtyMarkers();
    }

    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 0, resourceCount: 0, backupCount: 0 };
    clearWorkspaceDirtyMarkers();
    markWorkspaceDirty(project.id);
    assert(readStoredWorkspaceDirtyIds().includes(project.id), "workspace dirty package marker persists for reload recovery");
    clearWorkspaceDirtyMemoryOnly();
    restoreWorkspaceDirtyIds();
    assert(state.workspaceDirtyProjectIds.has(project.id), "workspace dirty package marker restores after reload");
    localStorage.setItem(WORKSPACE_DIRTY_STORAGE, JSON.stringify([project.id, "missing-project"]));
    restoreWorkspaceDirtyIds();
    pruneWorkspaceDirtyProjectIds();
    assert(state.workspaceDirtyProjectIds.has(project.id) && !state.workspaceDirtyProjectIds.has("missing-project"), "workspace dirty recovery prunes missing projects");
    const beforeUnloadEvent = {
      returnValue: undefined,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };
    handleBeforeUnload(beforeUnloadEvent);
    assert(beforeUnloadEvent.prevented && beforeUnloadEvent.returnValue === "", "workspace dirty packages warn before closing");

    const originalSaveProjectPackage = workspaceStorage.saveProjectPackage;
    const originalGetWorkspaceStatus = workspaceStorage.getStatus;
    const savedWorkspacePackages = [];
    workspaceStorage.saveProjectPackage = async (pkg) => {
      savedWorkspacePackages.push(pkg);
      return { manifest: {}, packagePath: `mock/${pkg.project.id}.loopcat.json`, savedAt: new Date().toISOString() };
    };
    workspaceStorage.getStatus = async () => ({ ...state.workspaceStatus, projectCount: savedWorkspacePackages.length });
    try {
      state.workspaceRecoveryProjectIds = new Set([project.id]);
      recoveryWorkspaceController.resetRecoveryDismissal();
      renderWorkspaceStatus();
      assert(
        !els.workspaceRecoveryPanel.classList.contains("hidden") &&
          els.workspaceRecoveryMessage.textContent.includes("saved in LoopCAT") &&
          els.workspaceRecoveryList.textContent.includes(project.name) &&
          recoveryWorkspaceController.getState().dirtyCount === 1 &&
          recoveryWorkspaceController.getState().recoveryDismissed === false,
        "checked recovery/workspace controller renders startup recovery state without owning dirty markers"
      );
      els.workspaceRecoveryDismissBtn.focus();
      els.workspaceRecoveryDismissBtn.click();
      await waitFor(
        () =>
          els.workspaceRecoveryPanel.classList.contains("hidden") &&
          document.activeElement === els.workspaceMenuSummary,
        "checked workspace recovery dismissal focus"
      );
      assert(
        recoveryWorkspaceController.getState().recoveryDismissed,
        "checked recovery/workspace controller owns recovery dismissal and visible focus restoration"
      );
      recoveryWorkspaceController.resetRecoveryDismissal({ render: true });
      els.workspaceRecoveryOpenBtn.click();
      await waitFor(
        () => els.workspaceMenu.open && document.activeElement === els.workspaceMenuSummary,
        "checked workspace recovery menu open"
      );
      assert(
        els.workspaceMenu.open,
        "checked recovery/workspace controller opens the workspace menu without document-click cancellation"
      );
      els.workspaceMenu.removeAttribute("open");
      els.workspaceRecoverySaveBtn.click();
      await waitFor(() => !state.workspaceDirtyProjectIds.has(project.id), "workspace recovery panel save");
      assert(els.workspaceRecoveryPanel.classList.contains("hidden"), "workspace recovery panel hides after saved packages are written");
      markWorkspaceDirty(project.id);
      await autosaveDirtyWorkspacePackages();
    } finally {
      workspaceStorage.saveProjectPackage = originalSaveProjectPackage;
      workspaceStorage.getStatus = originalGetWorkspaceStatus;
    }
    assert(savedWorkspacePackages.some((pkg) => pkg.project.id === project.id && pkg.segments.some((segment) => segment.target === switchText)) && !state.workspaceDirtyProjectIds.has(project.id), "background workspace autosave saves dirty inactive project packages");
    assert(!readStoredWorkspaceDirtyIds().includes(project.id), "workspace autosave clears persisted dirty marker");

    await openProject(project.id);
    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 0, resourceCount: 0, backupCount: 0 };
    clearWorkspaceDirtyMarkers();
    const pendingWorkspaceAutosavePackages = [];
    const originalPendingWorkspaceAutosaveSave = workspaceStorage.saveProjectPackage;
    const originalPendingWorkspaceAutosaveStatus = workspaceStorage.getStatus;
    workspaceStorage.saveProjectPackage = async (pkg) => {
      pendingWorkspaceAutosavePackages.push(pkg);
      return { manifest: {}, packagePath: `mock/${pkg.project.id}.loopcat.json`, savedAt: new Date().toISOString() };
    };
    workspaceStorage.getStatus = async () => ({ ...state.workspaceStatus, projectCount: pendingWorkspaceAutosavePackages.length });
    try {
      const pendingWorkspaceAutosaveSegment = state.segments[0];
      const pendingWorkspaceAutosaveIndex = state.segments.findIndex((segment) => segment.id === pendingWorkspaceAutosaveSegment.id);
      const pendingWorkspaceAutosavePreviousTarget = pendingWorkspaceAutosaveSegment.target || "";
      const pendingWorkspaceAutosavePreviousStatus = pendingWorkspaceAutosaveSegment.status || "empty";
      const pendingWorkspaceAutosaveText = `workspace autosave pending target ${Date.now()}`;
      updateSegmentDraft(pendingWorkspaceAutosaveIndex, pendingWorkspaceAutosaveText);
      assert(state.saveTimers.has(pendingWorkspaceAutosaveSegment.id), "pending active workspace autosave save created");
      await autosaveDirtyWorkspacePackages();
      const storedPendingWorkspaceAutosaveSegment = (await getProjectSegments(project.id)).find((segment) => segment.id === pendingWorkspaceAutosaveSegment.id);
      assert(
        pendingWorkspaceAutosavePackages.some((pkg) =>
          pkg.project.id === project.id &&
            pkg.segments.some((segment) => segment.id === pendingWorkspaceAutosaveSegment.id && segment.target === pendingWorkspaceAutosaveText)
        ) &&
          storedPendingWorkspaceAutosaveSegment?.target === pendingWorkspaceAutosaveText &&
          !state.saveTimers.has(pendingWorkspaceAutosaveSegment.id) &&
          !state.workspaceDirtyProjectIds.has(project.id),
        "background workspace autosave flushes pending active segment edits before saving package"
      );
      setSegmentTargetAndStatus(pendingWorkspaceAutosaveSegment, pendingWorkspaceAutosavePreviousTarget, pendingWorkspaceAutosavePreviousStatus, "test-restore");
      touchSegment(pendingWorkspaceAutosaveSegment);
      await saveSegment(pendingWorkspaceAutosaveSegment);
    } finally {
      workspaceStorage.saveProjectPackage = originalPendingWorkspaceAutosaveSave;
      workspaceStorage.getStatus = originalPendingWorkspaceAutosaveStatus;
      clearWorkspaceDirtyMarkers();
    }

    const cleanBeforeUnloadEvent = {
      returnValue: undefined,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };
    handleBeforeUnload(cleanBeforeUnloadEvent);
    assert(!cleanBeforeUnloadEvent.prevented, "clean workspace does not warn before closing");

    await openProject(project.id);
    clearWorkspaceDirtyMarkers();
    const workspaceSaveActivityPackages = [];
    const originalWorkspaceSaveActivitySave = workspaceStorage.saveProjectPackage;
    const originalWorkspaceSaveActivityStatus = workspaceStorage.getStatus;
    workspaceStorage.saveProjectPackage = async (pkg) => {
      workspaceSaveActivityPackages.push(pkg);
      return { manifest: {}, packagePath: `mock/${pkg.project.id}.loopcat.json`, savedAt: new Date().toISOString() };
    };
    workspaceStorage.getStatus = async () => ({ ...state.workspaceStatus, projectCount: workspaceSaveActivityPackages.length });
    try {
      setHiddenSegmentField(state, WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG, true);
      await saveCurrentProjectPackageToWorkspace();
      assert(
        workspaceSaveActivityPackages.some((pkg) => pkg.project.id === project.id) &&
          els.saveStatus.textContent.includes("activity log failed") &&
          state.workspaceDirtyProjectIds.has(project.id),
        "workspace package save activity log failure still writes package and reports warning"
      );
    } finally {
      Reflect.deleteProperty(state, WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG);
      workspaceStorage.saveProjectPackage = originalWorkspaceSaveActivitySave;
      workspaceStorage.getStatus = originalWorkspaceSaveActivityStatus;
      clearWorkspaceDirtyMarkers();
    }

    await openProject(project.id);
    clearWorkspaceDirtyMarkers();
    const workspaceWriteFailureActivityCount = (await listActivityEvents(project.id))
      .filter((event) => event.type === "workspace-save" && event.summary === "Project package saved to workspace folder").length;
    const originalWorkspaceWriteFailureSave = workspaceStorage.saveProjectPackage;
    workspaceStorage.saveProjectPackage = async () => {
      throw new Error("Simulated workspace package write failure");
    };
    try {
      let workspaceWriteFailureRejected = false;
      try {
        await saveCurrentProjectPackageToWorkspace();
      } catch (error) {
        workspaceWriteFailureRejected = error.message.includes("Simulated workspace package write failure");
      }
      const activityAfterFailedWorkspaceWrite = await listActivityEvents(project.id);
      assert(
        workspaceWriteFailureRejected &&
          activityAfterFailedWorkspaceWrite.filter((event) => event.type === "workspace-save" && event.summary === "Project package saved to workspace folder").length === workspaceWriteFailureActivityCount &&
          state.workspaceDirtyProjectIds.has(project.id),
        "failed workspace package save keeps project dirty without recording successful workspace-save activity"
      );
    } finally {
      workspaceStorage.saveProjectPackage = originalWorkspaceWriteFailureSave;
      clearWorkspaceDirtyMarkers();
    }
    await logProjectActivity("qa-run", "Activity dirty regression", { source: "workflow-test" });
    assert(state.workspaceDirtyProjectIds.has(project.id), "activity events mark linked project package dirty");

    const invalidWorkspaceProject = await createProject({
      name: `Workflow Invalid Package ${Date.now()}`,
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await bulkPut("projects", [{ ...invalidWorkspaceProject, qaSettings: null }]);
    await loadProjects(false);
    clearWorkspaceDirtyMarkers();
    markWorkspaceDirty(invalidWorkspaceProject.id);
    const invalidPackageSaves = [];
    const originalInvalidSaveProjectPackage = workspaceStorage.saveProjectPackage;
    const originalInvalidGetWorkspaceStatus = workspaceStorage.getStatus;
    workspaceStorage.saveProjectPackage = async (pkg) => {
      invalidPackageSaves.push(pkg);
      return { manifest: {}, packagePath: `mock/${pkg.project.id}.loopcat.json`, savedAt: new Date().toISOString() };
    };
    workspaceStorage.getStatus = async () => ({ ...state.workspaceStatus, connected: true });
    try {
      let invalidWorkspaceSaveRejected = false;
      try {
        await saveProjectPackageToWorkspaceById(invalidWorkspaceProject.id);
      } catch (error) {
        invalidWorkspaceSaveRejected = error.validation?.errors?.some((item) => item.includes("Project QA settings")) && error.message.includes("Cannot save project package");
      }
      assert(invalidWorkspaceSaveRejected, "workspace package save rejects invalid generated packages");
      assert(!invalidPackageSaves.length && state.workspaceDirtyProjectIds.has(invalidWorkspaceProject.id), "invalid workspace package is not written or marked clean");
      markWorkspaceDirty(project.id);
      const expectedAutosaveWarnings = [];
      const originalConsoleWarn = console.warn;
      console.warn = (...args) => {
        const text = args.map((arg) => arg?.message || String(arg)).join(" ");
        if (text.includes("Cannot save project package to workspace")) {
          expectedAutosaveWarnings.push(text);
          return;
        }
        originalConsoleWarn(...args);
      };
      try {
        await autosaveDirtyWorkspacePackages();
      } finally {
        console.warn = originalConsoleWarn;
      }
      assert(
        invalidPackageSaves.some((pkg) => pkg.project.id === project.id) &&
          state.workspaceDirtyProjectIds.has(invalidWorkspaceProject.id) &&
          !state.workspaceDirtyProjectIds.has(project.id) &&
          els.saveStatus.textContent.includes("background workspace save"),
        "background workspace autosave continues after an invalid dirty package"
      );
      assert(expectedAutosaveWarnings.length === 1, "background workspace autosave records expected invalid package warning");
    } finally {
      workspaceStorage.saveProjectPackage = originalInvalidSaveProjectPackage;
      workspaceStorage.getStatus = originalInvalidGetWorkspaceStatus;
      await deleteProject(invalidWorkspaceProject.id);
      clearWorkspaceDirty(invalidWorkspaceProject.id);
      await loadProjects(false);
    }

    let invalidBackupWriteRejected = false;
    try {
      assertValidBackupForWrite({ app: "LoopCAT", schemaVersion: storageConstants.BACKUP_SCHEMA_VERSION, projects: {}, segments: [], tmEntries: [], terms: [], activityEvents: [], trashEntries: [] }, "export backup");
    } catch (error) {
      invalidBackupWriteRejected = error.validation?.errors?.some((item) => item.includes("Projects must be an array")) && error.message.includes("Cannot export backup");
    }
    assert(invalidBackupWriteRejected, "backup export write guard rejects invalid backup payloads");

    const invalidWorkspaceBackupProject = await createProject({
      name: `Workflow Invalid Backup ${Date.now()}`,
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Workflow TM",
      termBaseName: "Workflow TB"
    });
    await bulkPut("projects", [{ ...invalidWorkspaceBackupProject, documents: {} }]);
    await loadProjects(false);
    const originalInvalidWorkspaceBackupExport = workspaceStorage.exportFullBackup;
    const invalidWorkspaceBackupWrites = [];
    workspaceStorage.exportFullBackup = async (backup) => {
      invalidWorkspaceBackupWrites.push(backup);
      return { path: "mock/invalid-backup.json", manifestSaved: true };
    };
    try {
      let invalidWorkspaceBackupRejected = false;
      try {
        await exportWorkspaceBackupToFolder();
      } catch (error) {
        invalidWorkspaceBackupRejected = error.validation?.errors?.some((item) => item.includes("document manifest must be an array")) && error.message.includes("Cannot export backup");
      }
      assert(
        invalidWorkspaceBackupRejected &&
          !invalidWorkspaceBackupWrites.length &&
          state.lastValidationReport?.errors?.some((item) => item.includes("document manifest must be an array")) &&
          els.saveStatus.textContent.includes("Cannot export backup"),
        "workspace backup export reports validation failure before writing folder backup"
      );
    } finally {
      workspaceStorage.exportFullBackup = originalInvalidWorkspaceBackupExport;
      await deleteProject(invalidWorkspaceBackupProject.id);
      clearWorkspaceDirty(invalidWorkspaceBackupProject.id);
      await loadProjects(false);
    }

    const restoreDirtyBackup = await exportAllData();
    clearWorkspaceDirtyMarkers();
    const restoreDirtyResult = await restoreBackupData(restoreDirtyBackup);
    assert(restoreDirtyResult && restoreDirtyBackup.projects.every((item) => state.workspaceDirtyProjectIds.has(item.id)) && state.lastValidationReport?.risky?.some((item) => item.includes("must be saved to the workspace folder")), "manual backup restore marks connected workspace packages dirty");

    clearWorkspaceDirtyMarkers();
    els.tmResourceNameInput.value = "Workflow TM";
    els.tmResourceSourceLangInput.value = languageOptionValue("en");
    els.tmResourceTargetLangInput.value = languageOptionValue("tr");
    const linkedResourceTmx = buildTmx([{ source: "Linked resource TM source", target: "Linked resource TM target", sourceLang: "en", targetLang: "tr", projectName: "Resource dirty regression" }], { sourceLang: "en", targetLang: "tr" });
    await handleResourceTmxImport(new File([linkedResourceTmx], "linked-resource.tmx", { type: "application/xml" }));
    assert(state.workspaceDirtyProjectIds.has(project.id), "TMX resource import marks linked project package dirty");

    const linkedTmEntry = (await listTmEntries({ sourceLang: "en", targetLang: "tr", tmNames: ["Workflow TM"] }))
      .find((entry) => entry.source === "Linked resource TM source");
    assert(
      Boolean(linkedTmEntry) &&
        linkedTmEntry.sourceLang === "en" &&
        linkedTmEntry.targetLang === "tr" &&
        els.tmResourceSourceLangInput.value === languageOptionValue("en") &&
        els.tmResourceTargetLangInput.value === languageOptionValue("tr"),
      "linked TM resource import normalizes friendly language labels before memory lookup"
    );
    clearWorkspaceDirtyMarkers();
    const linkedTmRow = Array.from(els.tmResourceDetail.querySelectorAll("[data-resource-row]")).find(
      (row) => row.dataset.resourceId === linkedTmEntry.id
    );
    assert(Boolean(linkedTmRow), "linked TM resource edit renders through the Resources controller detail root");
    linkedTmRow.querySelector('[data-field="target"]').value = "Linked resource TM target updated";
    linkedTmRow.querySelector('[data-resource-action="save-entry"]').click();
    await waitFor(() => state.workspaceDirtyProjectIds.has(project.id), "linked TM row save dirty marker");
    assert(state.workspaceDirtyProjectIds.has(project.id), "TM resource row save marks linked project package dirty");

    clearWorkspaceDirtyMarkers();
    els.tbResourceNameInput.value = "Workflow TB";
    els.tbResourceSourceLangInput.value = languageOptionValue("en");
    els.tbResourceTargetLangInput.value = languageOptionValue("tr");
    const linkedResourceTbx = `<?xml version="1.0" encoding="UTF-8"?>
<tbx>
  <text>
    <body>
      <termEntry id="linked-resource-term">
        <langSet xml:lang="en"><tig><term>linked resource term</term></tig></langSet>
        <langSet xml:lang="tr"><tig><term>bagli kaynak terimi</term></tig></langSet>
        <descrip type="context">Linked TBX context note</descrip>
      </termEntry>
      <termEntry id="linked-sensitive-resource-term">
        <langSet xml:lang="en"><tig><term>linked sensitive resource term</term></tig></langSet>
        <langSet xml:lang="tr"><tig><term>bagli gizli kaynak terimi</term></tig></langSet>
        <descrip type="context">Bearer linked-tbx-note-token-that-must-not-import</descrip>
      </termEntry>
    </body>
  </text>
</tbx>`;
    await handleResourceTbxImport(new File([linkedResourceTbx], "linked-resource.tbx", { type: "application/xml" }));
    assert(state.workspaceDirtyProjectIds.has(project.id), "TBX resource import marks linked project package dirty");
    clearWorkspaceDirtyMarkers();
    const linkedResourceCsv = [
      "source,target,notes,forbidden",
      "linked csv term,bagli csv terimi,CSV resource import,no",
      "linked forbidden csv term,yasak csv terimi,Forbidden CSV resource import,yes"
    ].join("\n");
    await handleResourceTermListImport(new File([linkedResourceCsv], "linked-resource.csv", { type: "text/csv" }));
    assert(state.workspaceDirtyProjectIds.has(project.id), "CSV term resource import marks linked project package dirty");

    const linkedTerm = (await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] }))
      .find((term) => term.sourceTerm === "linked resource term");
    assert(
      Boolean(linkedTerm) &&
        linkedTerm.sourceLang === "en" &&
        linkedTerm.targetLang === "tr" &&
        els.tbResourceSourceLangInput.value === languageOptionValue("en") &&
        els.tbResourceTargetLangInput.value === languageOptionValue("tr"),
      "linked TB resource imports normalize friendly language labels before terminology lookup"
    );
    assert(linkedTerm?.notes === "Linked TBX context note", "TBX resource import preserves termbase notes");
    const linkedSensitiveTerm = (await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] }))
      .find((term) => term.sourceTerm === "linked sensitive resource term");
    assert(linkedSensitiveTerm?.notes === "[redacted secret]", "TBX resource import redacts credential-looking termbase notes");
    const linkedCsvTerms = await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] });
    assert(linkedCsvTerms.some((term) => term.sourceTerm === "linked csv term") && linkedCsvTerms.some((term) => term.sourceTerm === "linked forbidden csv term" && term.isForbidden), "CSV term resource import creates editable approved and forbidden terms");
    clearWorkspaceDirtyMarkers();
    const linkedTermRow = Array.from(els.tbResourceDetail.querySelectorAll("[data-resource-row]")).find(
      (row) => row.dataset.resourceId === linkedTerm.id
    );
    assert(Boolean(linkedTermRow), "linked term resource edit renders through the Resources controller detail root");
    linkedTermRow.querySelector('[data-field="targetTerm"]').value = "guncel bagli kaynak terimi";
    linkedTermRow.querySelector('[data-resource-action="save-entry"]').click();
    await waitFor(() => state.workspaceDirtyProjectIds.has(project.id), "linked TB row save dirty marker");
    assert(state.workspaceDirtyProjectIds.has(project.id), "TB resource row save marks linked project package dirty");

    await openProject(project.id);
    await openProjectFile(documentInfo.id);
    const termSuggestionSegmentIndex = state.segments.findIndex((segment) => segment.documentId === documentInfo.id && (segment.source || segment.text || "").includes("Hello"));
    assert(termSuggestionSegmentIndex >= 0, "term suggestion regression has source segment");
    await setActiveSegment(termSuggestionSegmentIndex);
    renderTermbaseSelect();
    els.termBaseSelect.value = "Workflow TB";
    els.sourceTermInput.value = "unsaved sidebar term";
    els.targetTermInput.value = "kaydedilmeyen yan panel terimi";
    els.termNotesInput.value = "This term must stay in the form when saving fails";
    setHiddenSegmentField(els.termForm, TERM_FORM_SAVE_FAILURE_TEST_FLAG, true);
    const failedTermFormSave = await saveTermFromForm();
    const failedSidebarTerms = await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] });
    assert(
      !failedTermFormSave &&
        els.saveStatus.textContent.includes("Simulated term form save failure") &&
        els.sourceTermInput.value === "unsaved sidebar term" &&
        !failedSidebarTerms.some((term) => term.sourceTerm === "unsaved sidebar term"),
      "term form save failure reports visible status without changing stored terms"
    );
    Reflect.deleteProperty(els.termForm, TERM_FORM_SAVE_FAILURE_TEST_FLAG);
    els.sourceTermInput.value = "Hello";
    els.targetTermInput.value = "Merhaba";
    els.termNotesInput.value = "Suggestion dirty regression";
    clearWorkspaceDirtyMarkers();
    const savedTermFromForm = await saveTermFromForm();
    assert(savedTermFromForm && state.workspaceDirtyProjectIds.has(project.id), "term form save marks linked project package dirty");
    await waitFor(() => Array.from(els.termSuggestions.querySelectorAll(".term-card")).some((card) => card.textContent.includes("Hello")), "term suggestion card");
    const helloTermForDeleteFailure = (await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] })).find((term) => term.sourceTerm === "Hello");
    assert(Boolean(helloTermForDeleteFailure), "term suggestion delete failure fixture exists");
    setHiddenSegmentField(helloTermForDeleteFailure, RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG, true);
    const failedSuggestionDelete = await deleteTermResourceEntry(helloTermForDeleteFailure, { refreshResourceView: false, refreshSuggestions: true });
    assert(
      !failedSuggestionDelete &&
        els.saveStatus.textContent.includes("Simulated term resource delete failure") &&
        (await listTerms({ sourceLang: "en", targetLang: "tr", termBaseNames: ["Workflow TB"] })).some((term) => term.id === helloTermForDeleteFailure.id),
      "term suggestion delete failure reports visible status without deleting stored term"
    );
    clearWorkspaceDirtyMarkers();
    const suggestionCard = Array.from(els.termSuggestions.querySelectorAll(".term-card")).find((card) => card.textContent.includes("Hello"));
    const suggestionDeleteButton = suggestionCard?.querySelector("button");
    assert(Boolean(suggestionDeleteButton), "term suggestion delete button renders");
    suggestionDeleteButton.click();
    await waitFor(() => state.workspaceDirtyProjectIds.has(project.id), "term suggestion delete dirty marker");
    assert(state.workspaceDirtyProjectIds.has(project.id), "term suggestion delete marks linked project package dirty");
    clearWorkspaceDirtyMarkers();

    let malformedBackupRejected = false;
    try {
      await restoreBackupFile(new File(["{not valid json"], "broken-backup.json", { type: "application/json" }));
    } catch (error) {
      malformedBackupRejected = error.message === "Backup file is not valid JSON.";
      renderValidationReport(portableFileErrorReport(error.message));
      setSaveStatus(error.message, "dirty");
    }
    assert(malformedBackupRejected && state.lastValidationReport?.errors?.[0] === "Backup file is not valid JSON.", "malformed backup JSON fails with validation report");

    const invalidBackupResult = await restoreBackupData({ app: "LoopCAT", schemaVersion: storageConstants.BACKUP_SCHEMA_VERSION, projects: {}, segments: [], tmEntries: [], terms: [], activityEvents: [], trashEntries: [] });
    assert(!invalidBackupResult && state.lastValidationReport?.errors?.some((error) => error.includes("Projects must be an array")), "invalid backup shape is rejected without restore");

    let oversizedBackupRejected = false;
    try {
      await restoreBackupFile(new File([new Blob([new Uint8Array(MAX_PORTABLE_JSON_BYTES + 1)])], "huge-backup.json", { type: "application/json" }));
    } catch (error) {
      oversizedBackupRejected = error.message.includes("too large");
      renderValidationReport(portableFileErrorReport(error.message));
      setSaveStatus(error.message, "dirty");
    }
    assert(oversizedBackupRejected && state.lastValidationReport?.errors?.[0]?.includes("too large"), "oversized backup JSON fails before restore");

    let malformedPackageRejected = false;
    try {
      await importProjectPackage(new File(["{broken package"], "broken.loopcat.json", { type: "application/json" }));
    } catch (error) {
      malformedPackageRejected = error.message === "Project package is not valid JSON.";
      renderValidationReport(portableFileErrorReport(error.message));
      setSaveStatus(error.message, "dirty");
    }
    assert(malformedPackageRejected && state.lastValidationReport?.errors?.[0] === "Project package is not valid JSON.", "malformed project package JSON fails with validation report");

    let oversizedPackageRejected = false;
    try {
      await importProjectPackage(new File([new Blob([new Uint8Array(MAX_PORTABLE_JSON_BYTES + 1)])], "huge.loopcat.json", { type: "application/json" }));
    } catch (error) {
      oversizedPackageRejected = error.message.includes("too large");
      renderValidationReport(portableFileErrorReport(error.message));
      setSaveStatus(error.message, "dirty");
    }
    assert(oversizedPackageRejected && state.lastValidationReport?.errors?.[0]?.includes("too large"), "oversized project package JSON fails before import");

    const invalidPackageShapeResult = await importProjectPackageData({ app: "LoopCAT", type: "project-package", version: 1 }, {
      sourceName: "invalid-shape.loopcat.json",
      suppressAlert: true
    });
    assert(!invalidPackageShapeResult && els.saveStatus.textContent === "Project package import failed validation", "invalid project package shape reports failed import status");

    const originalListWorkspacePackages = workspaceStorage.listProjectPackages;
    const originalReadWorkspacePackage = workspaceStorage.readProjectPackage;
    const originalGetWorkspaceStatusForUnreadablePackage = workspaceStorage.getStatus;
    const originalWorkspaceStatus = state.workspaceStatus;
    workspaceStorage.listProjectPackages = async () => [{ id: "bad-workspace-package", name: "Bad Workspace Package Bearer workspace-sync-label-token-that-must-not-appear", packagePath: "projects/bad/project.loopcat.json" }];
    workspaceStorage.readProjectPackage = async () => ({ app: "LoopCAT", type: "project-package", version: 1 });
    workspaceStorage.getStatus = async () => ({
      ...state.workspaceStatus,
      skippedProjectCount: 1,
      warnings: ["Skipped unreadable workspace package in Damaged Bearer workspace-status-warning-token-that-must-not-appear: project.loopcat.json is too large to read from the workspace folder."]
    });
    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 1, resourceCount: 0, backupCount: 0 };
    try {
      await syncWorkspaceFromFolder();
      assert(state.lastValidationReport?.warnings?.some((item) => item.includes("failed validation and was skipped")) && els.saveStatus.textContent === "Workspace sync completed with warnings", "workspace sync reports skipped invalid packages");
      assert(state.lastValidationReport?.warnings?.some((item) => item.includes("Skipped unreadable workspace package in Damaged")), "workspace sync reports unreadable workspace packages");
      const workspaceSyncWarningText = JSON.stringify(state.lastValidationReport?.warnings || []);
      assert(
        !workspaceSyncWarningText.includes("workspace-sync-label-token-that-must-not-appear") &&
          !workspaceSyncWarningText.includes("workspace-status-warning-token-that-must-not-appear"),
        "workspace sync warnings redact credential-looking external labels"
      );
    } finally {
      workspaceStorage.listProjectPackages = originalListWorkspacePackages;
      workspaceStorage.readProjectPackage = originalReadWorkspacePackage;
      workspaceStorage.getStatus = originalGetWorkspaceStatusForUnreadablePackage;
      state.workspaceStatus = originalWorkspaceStatus;
    }

    const originalErrorSyncListWorkspacePackages = workspaceStorage.listProjectPackages;
    const originalErrorSyncReadWorkspacePackage = workspaceStorage.readProjectPackage;
    const originalErrorSyncGetStatus = workspaceStorage.getStatus;
    const originalErrorSyncWorkspaceStatus = state.workspaceStatus;
    workspaceStorage.listProjectPackages = async () => [{
      id: "error-workspace-package",
      name: "Error Workspace Package Bearer workspace-sync-error-label-token-that-must-not-appear",
      packagePath: "projects/error/project.loopcat.json"
    }];
    workspaceStorage.readProjectPackage = async () => {
      throw new Error("Bearer workspace-sync-error-token-that-must-not-appear could not be read.");
    };
    workspaceStorage.getStatus = async () => ({
      ...state.workspaceStatus,
      warnings: []
    });
    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 1, resourceCount: 0, backupCount: 0 };
    try {
      await syncWorkspaceFromFolder();
      const workspaceSyncErrorWarningText = JSON.stringify(state.lastValidationReport?.warnings || []);
      assert(
        workspaceSyncErrorWarningText.includes("[redacted secret]") &&
          !workspaceSyncErrorWarningText.includes("workspace-sync-error-label-token-that-must-not-appear") &&
          !workspaceSyncErrorWarningText.includes("workspace-sync-error-token-that-must-not-appear"),
        "workspace sync warnings redact credential-looking external labels and errors"
      );
    } finally {
      workspaceStorage.listProjectPackages = originalErrorSyncListWorkspacePackages;
      workspaceStorage.readProjectPackage = originalErrorSyncReadWorkspacePackage;
      workspaceStorage.getStatus = originalErrorSyncGetStatus;
      state.workspaceStatus = originalErrorSyncWorkspaceStatus;
    }

    const originalWarningSyncListWorkspacePackages = workspaceStorage.listProjectPackages;
    const originalWarningSyncReadWorkspacePackage = workspaceStorage.readProjectPackage;
    const originalWarningSyncWorkspaceStatus = state.workspaceStatus;
    const workspaceWarningPackage = await buildProjectPackage({
      ...project,
      id: `workspace-warning-${Date.now()}`,
      name: `Workspace Warning ${Date.now()}`,
      sourceFileName: "",
      documents: [],
      docxStructure: null,
      docxStructures: {},
      localizationStructures: {},
      aiSettings: defaultAiSettings({
        ...project.aiSettings,
        enabled: true,
        sendSourceToAi: true
      })
    }, []);
    workspaceStorage.listProjectPackages = async () => [{
      id: workspaceWarningPackage.project.id,
      name: workspaceWarningPackage.project.name,
      packagePath: `projects/${workspaceWarningPackage.project.id}/project.loopcat.json`
    }];
    workspaceStorage.readProjectPackage = async () => workspaceWarningPackage;
    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 1, resourceCount: 0, backupCount: 0 };
    try {
      await syncWorkspaceFromFolder();
      assert(
        state.lastValidationReport?.warnings?.some((item) => item.includes("imported with") && item.includes("validation note")) &&
          els.saveStatus.textContent === "Workspace sync completed with warnings",
        "workspace sync reports validation notes from imported packages"
      );
    } finally {
      workspaceStorage.listProjectPackages = originalWarningSyncListWorkspacePackages;
      workspaceStorage.readProjectPackage = originalWarningSyncReadWorkspacePackage;
      state.workspaceStatus = originalWarningSyncWorkspaceStatus;
      await deleteProject(workspaceWarningPackage.project.id);
      clearWorkspaceDirty(workspaceWarningPackage.project.id);
      await loadProjects(false);
    }

    const originalDirtySyncListWorkspacePackages = workspaceStorage.listProjectPackages;
    const originalDirtySyncReadWorkspacePackage = workspaceStorage.readProjectPackage;
    const originalDirtySyncWorkspaceStatus = state.workspaceStatus;
    let dirtySyncReadCount = 0;
    workspaceStorage.listProjectPackages = async () => [{ id: project.id, name: project.name, packagePath: `projects/${project.id}/project.loopcat.json` }];
    workspaceStorage.readProjectPackage = async () => {
      dirtySyncReadCount += 1;
      return { app: "LoopCAT", type: "project-package", version: 1 };
    };
    state.workspaceStatus = { supported: true, connected: true, mode: "workspace-folder", name: "Mock Workspace", lastSyncedAt: "", projectCount: 1, resourceCount: 0, backupCount: 0 };
    clearWorkspaceDirtyMarkers();
    markWorkspaceDirty(project.id);
    try {
      await syncWorkspaceFromFolder();
      assert(
        dirtySyncReadCount === 0 &&
          state.workspaceDirtyProjectIds.has(project.id) &&
          state.lastValidationReport?.warnings?.some((item) => item.includes("unsaved folder changes")),
        "workspace sync skips dirty local packages instead of overwriting them"
      );
    } finally {
      workspaceStorage.listProjectPackages = originalDirtySyncListWorkspacePackages;
      workspaceStorage.readProjectPackage = originalDirtySyncReadWorkspacePackage;
      state.workspaceStatus = originalDirtySyncWorkspaceStatus;
    }

    await loadProjects(false);
    await openProject(project.id);
    const packageSourceSegments = await getProjectSegments(project.id);
    const originalSegmentIds = new Set(packageSourceSegments.map((segment) => segment.id));
    const collisionTm = {
      id: "workflow-collision-tm",
      workspaceId: "local-workspace",
      ownerId: "local-user",
      source: "Collision source",
      target: "Local TM target",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      projectName: "Local resource",
      tmName: "Workflow TM",
      signature: "collision",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const collisionTerm = {
      id: "workflow-collision-term",
      workspaceId: "local-workspace",
      ownerId: "local-user",
      sourceTerm: "collision",
      targetTerm: "local term",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr",
      termBaseName: "Workflow TB",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const collisionActivity = {
      id: "workflow-collision-activity",
      projectId: secondProject.id,
      type: "local",
      summary: "Local activity remains",
      detail: {},
      createdAt: new Date().toISOString()
    };
    await bulkPut("tmEntries", [collisionTm]);
    await bulkPut("terms", [collisionTerm]);
    await bulkPut("activityEvents", [collisionActivity]);
    const collisionPackage = await buildProjectPackage(state.project, packageSourceSegments);
    collisionPackage.resources.tmEntries = [{ ...collisionTm, target: "Incoming TM target" }];
    collisionPackage.resources.terms = [{ ...collisionTerm, targetTerm: "incoming term" }];
    collisionPackage.activityEvents = [{ ...collisionActivity, projectId: project.id, summary: "Incoming activity" }];
    setHiddenSegmentField(state, IMPORT_ACTIVITY_FAILURE_TEST_FLAG, true);
    const copyImport = await importProjectPackageData(collisionPackage, {
      sourceName: "collision-copy.loopcat.json",
      replaceExisting: false,
      importAsCopy: true,
      open: false,
      suppressAlert: true
    });
    assert(
      copyImport?.pkg?.project?.id &&
        copyImport.pkg.project.id !== project.id &&
        copyImport.pkg.project.name.includes("(copy)") &&
        els.saveStatus.textContent.includes("activity log failed"),
      "project package import activity log failure reports warning after successful package import"
    );
    Reflect.deleteProperty(state, IMPORT_ACTIVITY_FAILURE_TEST_FLAG);
    assert(state.workspaceDirtyProjectIds.has(copyImport.pkg.project.id), "manual project package import marks connected workspace package dirty");
    const copiedSegments = await getProjectSegments(copyImport.pkg.project.id);
    assert(copiedSegments.length === packageSourceSegments.length && copiedSegments.every((segment) => !originalSegmentIds.has(segment.id)) && copiedSegments.some((segment) => segment.target === switchText), "project package copy remaps project-scoped segment ids");
    const tmAfterCopy = await getAll("tmEntries");
    assert(tmAfterCopy.some((entry) => entry.id === collisionTm.id && entry.target === collisionTm.target) && tmAfterCopy.some((entry) => entry.id !== collisionTm.id && entry.target === "Incoming TM target"), "project package import remaps colliding TM resource ids");
    const termsAfterCopy = await getAll("terms");
    assert(termsAfterCopy.some((term) => term.id === collisionTerm.id && term.targetTerm === collisionTerm.targetTerm) && termsAfterCopy.some((term) => term.id !== collisionTerm.id && term.targetTerm === "incoming term"), "project package import remaps colliding termbase ids");
    const activityAfterCopy = await getAll("activityEvents");
    assert(activityAfterCopy.some((event) => event.id === collisionActivity.id && event.summary === collisionActivity.summary && event.projectId === secondProject.id) && activityAfterCopy.some((event) => event.id !== collisionActivity.id && event.summary === "Incoming activity" && event.projectId === copyImport.pkg.project.id), "project package import remaps colliding activity event ids");
    const successfulCopyImport = await importProjectPackageData(collisionPackage, {
      sourceName: "collision-copy-success.loopcat.json",
      replaceExisting: false,
      importAsCopy: true,
      open: false,
      suppressAlert: true
    });
    const activityAfterSuccessfulCopy = await getAll("activityEvents");
    assert(
      successfulCopyImport?.pkg?.project?.id &&
        activityAfterSuccessfulCopy.some((event) => event.type === "import" && event.summary === "Project package imported" && event.projectId === successfulCopyImport.pkg.project.id) &&
        !activityAfterSuccessfulCopy.some((event) => event.type === "import" && event.summary === "Project package imported" && event.detail?.fileName === "collision-copy-success.loopcat.json" && event.projectId === project.id),
      "project package import activity belongs to the imported project"
    );

    await openProject(project.id);
    const documentCountBeforeBadImport = state.project.documents.length;
    const badProjectImportOk = await runFileImportTask("Project file import", () => importProjectDocument(new File(["{ broken json"], "broken.json", { type: "application/json" })));
    assert(!badProjectImportOk && state.project.documents.length === documentCountBeforeBadImport && state.lastValidationReport?.errors?.[0]?.startsWith("Project file import failed:"), "damaged project file import reports failure without changing project documents");
    const oversizedProjectImportOk = await runFileImportTask("Project file import", () => importProjectDocument({ name: "huge.docx", size: MAX_PROJECT_IMPORT_BYTES + 1 }));
    assert(!oversizedProjectImportOk && state.project.documents.length === documentCountBeforeBadImport && state.lastValidationReport?.errors?.[0]?.includes("Project file is too large"), "oversized project file import is rejected before parsing");
    const oversizedDirectDocxImportOk = await runFileImportTask("Project file import", () => importDocx({ name: "huge-direct.docx", size: MAX_PROJECT_IMPORT_BYTES + 1 }));
    assert(!oversizedDirectDocxImportOk && state.project.documents.length === documentCountBeforeBadImport && state.lastValidationReport?.errors?.[0]?.includes("Project file is too large"), "direct DOCX import helper rejects oversized files before parsing");
    const oversizedDirectXliffImportOk = await runFileImportTask("Project file import", () => importXliff({ name: "huge-direct.xlf", size: MAX_PROJECT_IMPORT_BYTES + 1 }));
    assert(!oversizedDirectXliffImportOk && state.project.documents.length === documentCountBeforeBadImport && state.lastValidationReport?.errors?.[0]?.includes("Project file is too large"), "direct XLIFF import helper rejects oversized files before parsing");
    const oversizedDirectLocalizationImportOk = await runFileImportTask("Project file import", () => importLocalization({ name: "huge-direct.html", size: MAX_PROJECT_IMPORT_BYTES + 1 }));
    assert(!oversizedDirectLocalizationImportOk && state.project.documents.length === documentCountBeforeBadImport && state.lastValidationReport?.errors?.[0]?.includes("Project file is too large"), "direct localization import helper rejects oversized files before parsing");

    const badTmxImportOk = await runFileImportTask("TMX import", () => handleTmxImport(new File(["<tmx><body>"], "broken.tmx", { type: "application/xml" })));
    assert(!badTmxImportOk && state.lastValidationReport?.errors?.[0]?.includes("TMX import failed"), "damaged TMX import reports failure through validation panel");
    const oversizedTmxImportOk = await runFileImportTask("TMX import", () => handleTmxImport({ name: "huge.tmx", size: MAX_RESOURCE_IMPORT_BYTES + 1 }));
    assert(!oversizedTmxImportOk && state.lastValidationReport?.errors?.[0]?.includes("TMX file is too large"), "oversized TMX import is rejected before parsing");
    const oversizedTbxImportOk = await runFileImportTask("TBX import", () => handleTbxImport({ name: "huge.tbx", size: MAX_RESOURCE_IMPORT_BYTES + 1 }));
    assert(!oversizedTbxImportOk && state.lastValidationReport?.errors?.[0]?.includes("TBX file is too large"), "oversized TBX import is rejected before parsing");
    const badTermListImportOk = await runFileImportTask("Term list import", () => handleTermListImport(new File(["only-source"], "broken.csv", { type: "text/csv" })));
    assert(!badTermListImportOk && state.lastValidationReport?.errors?.[0]?.includes("Term list import failed"), "damaged term list import reports failure through validation panel");
    const oversizedTermListImportOk = await runFileImportTask("Term list import", () => handleTermListImport({ name: "huge.csv", size: MAX_RESOURCE_IMPORT_BYTES + 1 }));
    assert(!oversizedTermListImportOk && state.lastValidationReport?.errors?.[0]?.includes("Term list file is too large"), "oversized term list import is rejected before parsing");

    const structuralDocument = { id: makeId("document"), name: "workflow-structural.txt", type: "text" };
    await appendProjectSegments(project.id, [
      { text: "Split source first half. Split source second half.", target: "Split target first half. Split target second half." },
      { text: "Merge first source.", target: "Merge first target." },
      { text: "Merge second source.", target: "Merge second target." }
    ], {
      documentId: structuralDocument.id,
      documentName: structuralDocument.name,
      documentType: structuralDocument.type
    });
    state.project = await updateProject({ ...state.project, documents: [...(state.project.documents || []), structuralDocument] });
    state.projects = state.projects.map((item) => (item.id === state.project.id ? state.project : item));
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
    await openProjectFile(structuralDocument.id);
    const structuralSegmentsBefore = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    assert(structuralSegmentsBefore.length === 3, "plain structural edit fixture has three segments");
    const structuralSplitOriginalSource = structuralSegmentsBefore[0].source;
    const structuralSplitOriginalTarget = structuralSegmentsBefore[0].target;
    const structuralSegmentIdsBeforeSplit = new Set(structuralSegmentsBefore.map((segment) => segment.id));
    let splitIndex = state.segments.findIndex((segment) => segment.id === structuralSegmentsBefore[0].id);
    await setActiveSegment(splitIndex);
    let splitTextarea = els.segmentBody.querySelector(`tr[data-index="${splitIndex}"] textarea`);
    splitTextarea?.setSelectionRange(24, 24);
    setHiddenSegmentField(state.segments[splitIndex], SPLIT_SAVE_FAILURE_TEST_FLAG, true);
    await splitCurrentSegment();
    let splitFailureStored = (await getProjectSegments(project.id)).filter((segment) => segment.documentId === structuralDocument.id);
    assert(
      els.saveStatus.textContent.includes("Simulated split save failure") &&
        state.segments.filter((segment) => segment.documentId === structuralDocument.id).length === 3 &&
        splitFailureStored.length === 3 &&
        splitFailureStored[0].source === structuralSplitOriginalSource,
      "split save failure restores visible and persisted segment list"
    );
    splitIndex = state.segments.findIndex((segment) => segment.documentId === structuralDocument.id);
    await setActiveSegment(splitIndex);
    splitTextarea = els.segmentBody.querySelector(`tr[data-index="${splitIndex}"] textarea`);
    splitTextarea?.setSelectionRange(24, 24);
    const splitCommandResult = await splitCurrentSegment();
    const splitAppliedVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const splitCreatedSegment = splitAppliedVisible.find((segment) => !structuralSegmentIdsBeforeSplit.has(segment.id));
    const splitSuccessStored = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === structuralDocument.id
    );
    const splitAppliedRevisionById = new Map(splitAppliedVisible.map((segment) => [segment.id, segment.revision]));
    assert(
      els.saveStatus.textContent === "Segment split; Undo is available" &&
        splitCommandResult?.receipt?.commandId === "split-segment" &&
        splitCommandResult.receipt.affectedIds.includes(structuralSegmentsBefore[0].id) &&
        splitCommandResult.receipt.affectedIds.includes(splitCreatedSegment?.id) &&
        !JSON.stringify(splitCommandResult.receipt).includes(structuralSplitOriginalSource) &&
        !JSON.stringify(splitCommandResult.receipt).includes(structuralSplitOriginalTarget) &&
        splitAppliedVisible.length === 4 &&
        splitSuccessStored.length === 4 &&
        splitAppliedVisible.every((segment, index) => segment.documentIndex === index) &&
        currentSegment()?.id === splitCreatedSegment?.id,
      "segment split saves one redacted structural command with contiguous order and stable focus"
    );

    await undoLastCommand();
    const splitUndoVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const splitUndoStored = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === structuralDocument.id
    );
    const splitUndoOriginal = splitUndoVisible.find((segment) => segment.id === structuralSegmentsBefore[0].id);
    const splitUndoTextarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
    assert(
      splitUndoVisible.length === 3 &&
        splitUndoStored.length === 3 &&
        !splitUndoVisible.some((segment) => segment.id === splitCreatedSegment?.id) &&
        !splitUndoStored.some((segment) => segment.id === splitCreatedSegment?.id) &&
        splitUndoOriginal?.source === structuralSplitOriginalSource &&
        splitUndoOriginal?.target === structuralSplitOriginalTarget &&
        splitUndoVisible.every((segment, index) => segment.documentIndex === index) &&
        currentSegment()?.id === structuralSegmentsBefore[0].id &&
        document.activeElement === splitUndoTextarea,
      "SplitSegment Undo atomically restores the original segment, order, persistence, and focus"
    );
    const splitUndoOriginalRevision = Number(splitUndoOriginal?.revision || 0);

    await redoLastCommand();
    const splitRedoVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const splitRedoStored = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === structuralDocument.id
    );
    const splitRedoCreated = splitRedoVisible.find((segment) => segment.id === splitCreatedSegment?.id);
    const splitRedoOriginal = splitRedoVisible.find((segment) => segment.id === structuralSegmentsBefore[0].id);
    const splitRedoTextarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
    assert(
      splitRedoVisible.length === 4 &&
        splitRedoStored.length === 4 &&
        splitRedoCreated?.source === splitCreatedSegment?.source &&
        splitRedoCreated?.target === splitCreatedSegment?.target &&
        splitRedoOriginal?.source === splitAppliedVisible[0].source &&
        splitRedoOriginal?.target === splitAppliedVisible[0].target &&
        Number(splitRedoOriginal?.revision || 0) > splitUndoOriginalRevision &&
        Number(splitRedoCreated?.revision || 0) > Number(splitAppliedRevisionById.get(splitCreatedSegment?.id) || 0) &&
        splitRedoVisible.every((segment, index) => segment.documentIndex === index) &&
        currentSegment()?.id === splitCreatedSegment?.id &&
        document.activeElement === splitRedoTextarea,
      "SplitSegment Redo recreates the stable segment, order, targets, monotonic revisions, persistence, and focus"
    );

    state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
    await openProjectFile(structuralDocument.id);
    let mergeCandidates = state.segments
      .map((segment, index) => ({ segment, index }))
      .filter((item) => item.segment.documentId === structuralDocument.id)
      .slice(-2);
    const mergeFailureIds = mergeCandidates.map((item) => item.segment.id);
    const mergeFailureSources = mergeCandidates.map((item) => item.segment.source);
    const mergeFailureTargets = mergeCandidates.map((item) => item.segment.target);
    await setActiveSegment(mergeCandidates[0].index);
    setHiddenSegmentField(state.segments[mergeCandidates[0].index], MERGE_POST_DELETE_FAILURE_TEST_FLAG, true);
    const failedMergeCommand = await mergeWithNextSegment();
    const mergeFailureVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const mergeFailureStored = (await getProjectSegments(project.id)).filter((segment) => segment.documentId === structuralDocument.id);
    assert(
      failedMergeCommand === null &&
        els.saveStatus.textContent.includes("Simulated merge transaction failure") &&
        mergeFailureVisible.length === 4 &&
        mergeFailureStored.length === 4 &&
        mergeFailureIds.every((id, index) => {
          const visible = mergeFailureVisible.find((segment) => segment.id === id);
          const stored = mergeFailureStored.find((segment) => segment.id === id);
          return (
            visible?.source === mergeFailureSources[index] &&
            visible?.target === mergeFailureTargets[index] &&
            stored?.source === mergeFailureSources[index] &&
            stored?.target === mergeFailureTargets[index]
          );
        }) &&
        mergeFailureVisible.every((item, index) => item.documentIndex === index) &&
        state.segments.every((item, index) => item.index === index),
      "MergeSegment transaction failure leaves no missing, duplicate, reordered, or partially persisted segment"
    );
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(project.id));
    await openProjectFile(structuralDocument.id);
    mergeCandidates = state.segments
      .map((segment, index) => ({ segment, index }))
      .filter((item) => item.segment.documentId === structuralDocument.id)
      .slice(-2);
    const mergeFirstBefore = structuredClone(mergeCandidates[0].segment);
    const mergeSecondBefore = structuredClone(mergeCandidates[1].segment);
    const expectedMergedSource = `${mergeFirstBefore.source} ${mergeSecondBefore.source}`.trim();
    const expectedMergedTarget = `${mergeFirstBefore.target || ""} ${mergeSecondBefore.target || ""}`.trim();
    await setActiveSegment(mergeCandidates[0].index);
    const mergeCommandResult = await mergeWithNextSegment();
    const mergeAppliedVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const mergeSuccessStored = (await getProjectSegments(project.id)).filter((segment) => segment.documentId === structuralDocument.id);
    const mergeAppliedSurvivor = mergeAppliedVisible.find((segment) => segment.id === mergeFirstBefore.id);
    const mergeAppliedTextarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
    const mergeAppliedRevision = Number(mergeAppliedSurvivor?.revision || 0);
    const mergeAppliedHistory = structuredClone(mergeAppliedSurvivor?.targetHistory || []);
    assert(
      els.saveStatus.textContent === "Segments merged; Undo is available" &&
        mergeCommandResult?.receipt?.commandId === "merge-segments" &&
        mergeCommandResult.receipt.affectedIds.includes(mergeFirstBefore.id) &&
        mergeCommandResult.receipt.affectedIds.includes(mergeSecondBefore.id) &&
        !JSON.stringify(mergeCommandResult.receipt).includes(mergeFirstBefore.source) &&
        !JSON.stringify(mergeCommandResult.receipt).includes(mergeFirstBefore.target) &&
        mergeAppliedVisible.length === 3 &&
        mergeSuccessStored.length === 3 &&
        mergeAppliedSurvivor?.source === expectedMergedSource &&
        mergeAppliedSurvivor?.target === expectedMergedTarget &&
        mergeAppliedSurvivor?.targetHistory?.some((entry) => entry.reason === "merge") &&
        !mergeAppliedVisible.some((segment) => segment.id === mergeSecondBefore.id) &&
        !mergeSuccessStored.some((segment) => segment.id === mergeSecondBefore.id) &&
        mergeAppliedVisible.every((item, index) => item.documentIndex === index) &&
        state.segments.every((item, index) => item.index === index) &&
        currentSegment()?.id === mergeFirstBefore.id &&
        document.activeElement === mergeAppliedTextarea,
      "MergeSegment persists one redacted atomic command with contiguous order, history, and focus"
    );

    const mergeUndoResult = await undoLastCommand();
    const mergeUndoVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const mergeUndoStored = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === structuralDocument.id
    );
    const mergeUndoFirst = mergeUndoVisible.find((segment) => segment.id === mergeFirstBefore.id);
    const mergeUndoSecond = mergeUndoVisible.find((segment) => segment.id === mergeSecondBefore.id);
    const mergeUndoTextarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
    const mergeUndoFirstRevision = Number(mergeUndoFirst?.revision || 0);
    assert(
      mergeUndoResult?.receipt?.commandId === "merge-segments" &&
        mergeUndoVisible.length === 4 &&
        mergeUndoStored.length === 4 &&
        mergeUndoFirst?.source === mergeFirstBefore.source &&
        mergeUndoFirst?.target === mergeFirstBefore.target &&
        JSON.stringify(mergeUndoFirst?.targetHistory || []) === JSON.stringify(mergeFirstBefore.targetHistory || []) &&
        mergeUndoSecond?.source === mergeSecondBefore.source &&
        mergeUndoSecond?.target === mergeSecondBefore.target &&
        JSON.stringify(mergeUndoSecond?.targetHistory || []) === JSON.stringify(mergeSecondBefore.targetHistory || []) &&
        Number(mergeUndoFirst?.revision || 0) > mergeAppliedRevision &&
        Number(mergeUndoSecond?.revision || 0) > Number(mergeSecondBefore.revision || 0) &&
        mergeUndoVisible.every((item, index) => item.documentIndex === index) &&
        state.segments.every((item, index) => item.index === index) &&
        currentSegment()?.id === mergeFirstBefore.id &&
        document.activeElement === mergeUndoTextarea,
      "MergeSegment Undo atomically restores both stable segment IDs, order, history, persistence, and focus"
    );

    const mergeRedoResult = await redoLastCommand();
    const mergeRedoVisible = state.segments.filter((segment) => segment.documentId === structuralDocument.id);
    const mergeRedoStored = (await getProjectSegments(project.id)).filter(
      (segment) => segment.documentId === structuralDocument.id
    );
    const mergeRedoSurvivor = mergeRedoVisible.find((segment) => segment.id === mergeFirstBefore.id);
    const mergeRedoTextarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
    assert(
      mergeRedoResult?.receipt?.commandId === "merge-segments" &&
        mergeRedoVisible.length === 3 &&
        mergeRedoStored.length === 3 &&
        mergeRedoSurvivor?.source === expectedMergedSource &&
        mergeRedoSurvivor?.target === expectedMergedTarget &&
        JSON.stringify(mergeRedoSurvivor?.targetHistory || []) === JSON.stringify(mergeAppliedHistory) &&
        Number(mergeRedoSurvivor?.revision || 0) > mergeUndoFirstRevision &&
        !mergeRedoVisible.some((segment) => segment.id === mergeSecondBefore.id) &&
        !mergeRedoStored.some((segment) => segment.id === mergeSecondBefore.id) &&
        mergeRedoVisible.every((item, index) => item.documentIndex === index) &&
        state.segments.every((item, index) => item.index === index) &&
        currentSegment()?.id === mergeFirstBefore.id &&
        document.activeElement === mergeRedoTextarea,
      "MergeSegment Redo recreates the merge with monotonic revisions and deletes only the merged-away segment"
    );

    const taggedFile = new File(["<!doctype html><html><body><p>Keep <strong>this</strong> tag.</p></body></html>"], "tagged.html", { type: "text/html" });
    await importLocalization(taggedFile);
    const taggedDocument = state.project.documents.find((item) => item.name === "tagged.html");
    assert(Boolean(taggedDocument), "tagged HTML fixture imported");
    selectApplicationDocument(taggedDocument.id);
    const taggedIndex = state.segments.findIndex((segment) => segment.documentId === taggedDocument.id);
    renderSegments();
    const taggedRow = els.segmentBody.querySelector(`tr[data-index="${taggedIndex}"]`);
    const sourceChipLabels = Array.from(taggedRow?.querySelectorAll(".source-cell .tag-chip") || []).map((chip) => chip.textContent);
    assert(sourceChipLabels.includes("<b>") && sourceChipLabels.includes("</b>") && !sourceChipLabels.includes("<strong>"), "editor displays semantic inline tag labels for HTML formatting");
    await setActiveSegment(taggedIndex);
    let taggedTextarea = els.segmentBody.querySelector(`tr[data-index="${taggedIndex}"] textarea`);
    taggedTextarea?.focus();
    taggedTextarea?.setSelectionRange(0, 0);
    const beforeProtectedTagInsert = targetCommandPatch(state.segments[taggedIndex]);
    clearWorkspaceDirtyMarkers();
    const protectedTagCommand = await insertTagIntoTarget("<strong>");
    await flushPendingSegmentSaves(project.id);
    const protectedTagApplied = targetCommandPatch(state.segments[taggedIndex]);
    taggedTextarea = els.segmentBody.querySelector(`tr[data-index="${taggedIndex}"] textarea`);
    assert(
      protectedTagCommand?.receipt?.commandId === "insert-protected-tag" &&
        protectedTagCommand.receipt.provenance?.producer === "protected-tag" &&
        !JSON.stringify(protectedTagCommand.receipt).includes("<strong>") &&
        state.segments[taggedIndex].target.startsWith("<strong>") &&
        state.segments[taggedIndex].targetHistory?.some((entry) => entry.reason === "insert-tag") &&
        taggedTextarea?.selectionStart === "<strong>".length &&
        taggedTextarea?.selectionEnd === "<strong>".length &&
        state.workspaceDirtyProjectIds.has(project.id),
      "protected-tag insertion records one redacted command, history, caret placement, and workspace dirtiness"
    );
    const undoProtectedTag = await undoLastCommand();
    const protectedTagUndoRevision = Number(state.segments[taggedIndex].revision || 0);
    const storedAfterProtectedTagUndo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[taggedIndex].id
    );
    taggedTextarea = els.segmentBody.querySelector(`tr[data-index="${taggedIndex}"] textarea`);
    assert(
      undoProtectedTag?.receipt?.commandId === "insert-protected-tag" &&
        state.segments[taggedIndex].target === beforeProtectedTagInsert.target &&
        JSON.stringify(state.segments[taggedIndex].targetHistory) ===
          JSON.stringify(beforeProtectedTagInsert.targetHistory) &&
        storedAfterProtectedTagUndo?.target === beforeProtectedTagInsert.target &&
        taggedTextarea?.selectionStart === 0 &&
        taggedTextarea?.selectionEnd === 0,
      "protected-tag Undo restores target state, persistence, selection, and the original caret"
    );
    await redoLastCommand();
    const storedAfterProtectedTagRedo = (await getProjectSegments(project.id)).find(
      (segment) => segment.id === state.segments[taggedIndex].id
    );
    taggedTextarea = els.segmentBody.querySelector(`tr[data-index="${taggedIndex}"] textarea`);
    assert(
      state.segments[taggedIndex].target === protectedTagApplied.target &&
        JSON.stringify(state.segments[taggedIndex].targetHistory) === JSON.stringify(protectedTagApplied.targetHistory) &&
        Number(state.segments[taggedIndex].revision || 0) > protectedTagUndoRevision &&
        storedAfterProtectedTagRedo?.target === protectedTagApplied.target &&
        taggedTextarea?.selectionStart === "<strong>".length &&
        taggedTextarea?.selectionEnd === "<strong>".length,
      "protected-tag Redo restores the target patch and post-insert caret with a monotonic revision"
    );
    taggedTextarea?.setSelectionRange(4, 4);
    const beforeBlockedSplitCount = state.segments.length;
    await splitCurrentSegment();
    assert(state.segments.length === beforeBlockedSplitCount && els.saveStatus.textContent.includes("Split is unavailable"), "split is blocked for structure-preserving localization segments");
    state.segments[taggedIndex].target = "Etiketi eksik hedef.";
    state.segments[taggedIndex].status = "draft";
    touchSegment(state.segments[taggedIndex]);
    await saveSegment(state.segments[taggedIndex]);
    const deliveryDownloads = [];
    const originalDeliveryCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalDeliveryAnchorClick = HTMLAnchorElement.prototype.click;
    const originalDeliveryConfirm = window.confirm;
    URL.createObjectURL = (blob) => {
      deliveryDownloads.push({ type: blob.type, blob });
      return originalDeliveryCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopDeliveryClick() {};
    window.confirm = () => true;
    try {
      const wrongDocxSelectionDownloadCount = deliveryDownloads.length;
      await exportTargetDocx();
      assert(
        deliveryDownloads.length === wrongDocxSelectionDownloadCount &&
          els.saveStatus.textContent.includes("selected file is not a DOCX"),
        "DOCX export blocks non-DOCX selected document instead of silently exporting another file"
      );
      await exportTargetText();
      assert(!deliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("protected placeholders")), "target TXT export blocks missing protected tags");
      await exportLocalization();
      assert(!deliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("protected placeholders")), "delivery export blocks missing protected tags");
      state.segments[taggedIndex].target = "Bu <strong>etiketi</strong></strong> koru.";
      state.segments[taggedIndex].status = "draft";
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
      await exportLocalization();
      assert(!deliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("unbalanced inline markup")), "delivery export blocks unbalanced inline markup");
      state.segments[taggedIndex].target = 'Bu <strong>etiketi</strong> koru. <img src="x" onerror="alert(1)">';
      state.segments[taggedIndex].status = "draft";
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
      await exportLocalization();
      assert(!deliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("unsafe HTML markup")), "HTML delivery export blocks unsafe target markup");
      state.segments[taggedIndex].target = 'Bu <strong>etiketi</strong> koru. <span style="background:url(javascript:alert(1))">stil</span>';
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
      await exportLocalization();
      assert(!deliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("unsafe HTML markup")), "HTML delivery export blocks scriptable style markup");
      state.segments[taggedIndex].target = "Bu <strong>etiketi</strong> koru.";
      state.segments[taggedIndex].status = "draft";
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
      await exportLocalization();
      assert(deliveryDownloads.some((item) => item.type === "text/html"), "delivery export runs after protected tags are restored");
      const beforeXmlInvalidDownloadCount = deliveryDownloads.length;
      state.segments[taggedIndex].target = `Bu <strong>etiketi</strong> koru.${String.fromCharCode(0x0b)}`;
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
      await exportBilingualDocx();
      assert(deliveryDownloads.length === beforeXmlInvalidDownloadCount && els.saveStatus.textContent.includes("Bilingual DOCX blocked"), "bilingual DOCX export blocks XML-invalid target characters");
      await exportXliff();
      assert(deliveryDownloads.length === beforeXmlInvalidDownloadCount && state.lastValidationReport?.risky?.some((item) => item.includes("XML-invalid characters")), "XLIFF export blocks XML-invalid target characters");
      state.segments[taggedIndex].target = "Bu <strong>etiketi</strong> koru.";
      touchSegment(state.segments[taggedIndex]);
      await saveSegment(state.segments[taggedIndex]);
    } finally {
      URL.createObjectURL = originalDeliveryCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalDeliveryAnchorClick;
      window.confirm = originalDeliveryConfirm;
    }

    const structuredMergeFile = new File(["<!doctype html><html><body><p>First block.</p><p>Second block.</p></body></html>"], "structured-merge.html", { type: "text/html" });
    await importLocalization(structuredMergeFile);
    const structuredMergeDocument = state.project.documents.find((item) => item.name === "structured-merge.html");
    assert(Boolean(structuredMergeDocument), "structured merge fixture imported");
    selectApplicationDocument(structuredMergeDocument.id);
    renderSegments();
    const structuredMergeIndexes = state.segments
      .map((segment, index) => ({ segment, index }))
      .filter((item) => item.segment.documentId === structuredMergeDocument.id)
      .map((item) => item.index);
    assert(structuredMergeIndexes.length === 2, "structured merge fixture has two segments");
    await setActiveSegment(structuredMergeIndexes[0]);
    const beforeBlockedMergeCount = state.segments.length;
    await mergeWithNextSegment();
    const afterBlockedMergeSegments = state.segments.filter((segment) => segment.documentId === structuredMergeDocument.id);
    assert(
      state.segments.length === beforeBlockedMergeCount &&
        afterBlockedMergeSegments.length === 2 &&
        els.saveStatus.textContent.includes("Merge is available only"),
      "merge is blocked across structure-preserving localization segments"
    );

    const duplicateTaggedFile = new File(["<!doctype html><html><body><p><strong>One</strong> and <strong>two</strong></p></body></html>"], "duplicate-tagged.html", { type: "text/html" });
    await importLocalization(duplicateTaggedFile);
    const duplicateTaggedDocument = state.project.documents.find((item) => item.name === "duplicate-tagged.html");
    assert(Boolean(duplicateTaggedDocument), "duplicate tagged HTML fixture imported");
    selectApplicationDocument(duplicateTaggedDocument.id);
    const duplicateTaggedIndex = state.segments.findIndex((segment) => segment.documentId === duplicateTaggedDocument.id);
    state.segments[duplicateTaggedIndex].target = "<strong>Bir</strong> ve iki";
    state.segments[duplicateTaggedIndex].status = "draft";
    touchSegment(state.segments[duplicateTaggedIndex]);
    await saveSegment(state.segments[duplicateTaggedIndex]);
    const duplicateDeliveryDownloads = [];
    const originalDuplicateCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalDuplicateAnchorClick = HTMLAnchorElement.prototype.click;
    const originalDuplicateConfirm = window.confirm;
    URL.createObjectURL = (blob) => {
      duplicateDeliveryDownloads.push({ type: blob.type, blob });
      return originalDuplicateCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopDuplicateDeliveryClick() {};
    window.confirm = () => true;
    try {
      await exportLocalization();
      assert(!duplicateDeliveryDownloads.length && state.lastValidationReport?.risky?.some((item) => item.includes("protected placeholders")), "delivery export blocks incomplete duplicate protected tags");
      state.segments[duplicateTaggedIndex].target = "<strong>Bir</strong> ve <strong>iki</strong>";
      touchSegment(state.segments[duplicateTaggedIndex]);
      await saveSegment(state.segments[duplicateTaggedIndex]);
      await exportLocalization();
      assert(duplicateDeliveryDownloads.some((item) => item.type === "text/html"), "delivery export runs after duplicate protected tags are restored");
    } finally {
      URL.createObjectURL = originalDuplicateCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalDuplicateAnchorClick;
      window.confirm = originalDuplicateConfirm;
    }

    const scopedCompleteFile = new File(["<!doctype html><html><body><p>Scoped completed segment.</p></body></html>"], "scoped-complete.html", { type: "text/html" });
    await importLocalization(scopedCompleteFile);
    const scopedCompleteDocument = state.project.documents.find((item) => item.name === "scoped-complete.html");
    const scopedCompleteIndex = state.segments.findIndex((segment) => segment.documentId === scopedCompleteDocument?.id);
    assert(Boolean(scopedCompleteDocument) && scopedCompleteIndex >= 0, "scoped export completed fixture imported");
    state.segments[scopedCompleteIndex].target = "Yalnizca secili dosya hedefi.";
    state.segments[scopedCompleteIndex].status = "draft";
    touchSegment(state.segments[scopedCompleteIndex]);
    await saveSegment(state.segments[scopedCompleteIndex]);
    const scopedEmptyFile = new File(["<!doctype html><html><body><p>Unselected unfinished segment.</p></body></html>"], "scoped-empty.html", { type: "text/html" });
    await importLocalization(scopedEmptyFile);
    const scopedEmptyDocument = state.project.documents.find((item) => item.name === "scoped-empty.html");
    assert(Boolean(scopedEmptyDocument) && state.segments.some((segment) => segment.documentId === scopedEmptyDocument.id && !String(segment.target || "").trim()), "scoped export unfinished fixture imported");
    selectApplicationDocument(scopedCompleteDocument.id);
    renderDocumentFilter();
    renderSegments();
    const scopedExportDownloads = [];
    const originalScopedCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalScopedAnchorClick = HTMLAnchorElement.prototype.click;
    const originalScopedConfirm = window.confirm;
    URL.createObjectURL = (blob) => {
      scopedExportDownloads.push({ type: blob.type, blob, name: "" });
      return originalScopedCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopScopedExportClick() {
      if (scopedExportDownloads.length) scopedExportDownloads[scopedExportDownloads.length - 1].name = this.download;
    };
    window.confirm = () => true;
    try {
      await exportTargetText();
      await exportXliff();
      const scopedTxtDownload = scopedExportDownloads.find((item) => item.type === "text/plain");
      const scopedXliffDownload = scopedExportDownloads.find((item) => item.type === "application/x-xliff+xml");
      const scopedTxt = await scopedTxtDownload?.blob.text();
      const scopedXliff = await scopedXliffDownload?.blob.text();
      assert(
        scopedTxt === "Yalnizca secili dosya hedefi." &&
          scopedTxtDownload.name.includes("scoped-complete_html") &&
          !scopedTxt.includes("Unselected unfinished segment"),
        "selected target TXT export ignores unfinished unselected files"
      );
      assert(
        scopedXliff?.includes('original="scoped-complete.html"') &&
          scopedXliff.includes("Yalnizca secili dosya hedefi.") &&
          !scopedXliff.includes("Unselected unfinished segment") &&
          scopedXliffDownload.name.includes("scoped-complete_html"),
        "selected XLIFF export ignores unfinished unselected files"
      );

      selectApplicationDocument(scopedEmptyDocument.id);
      renderDocumentFilter();
      renderSegments();
      const scopedEmptySegment = state.segments.find((segment) => segment.documentId === scopedEmptyDocument.id);
      const emptyTargetBeforeExports = scopedEmptySegment.target;
      const emptyStatusBeforeExports = scopedEmptySegment.status;
      const emptyHistoryLengthBeforeExports = scopedEmptySegment.targetHistory?.length || 0;
      const downloadsBeforeCancelledExport = scopedExportDownloads.length;
      const activityBeforeCancelledExport = (await listActivityEvents(project.id)).length;
      const partialExportPrompts = [];
      window.confirm = (message) => {
        partialExportPrompts.push(String(message || ""));
        return false;
      };
      await exportLocalization();
      assert(
        scopedExportDownloads.length === downloadsBeforeCancelledExport &&
          (await listActivityEvents(project.id)).length === activityBeforeCancelledExport &&
          els.saveStatus.textContent.includes("Export cancelled") &&
          partialExportPrompts.at(-1)?.includes("1 empty target segment(s) will export source text"),
        "cancelled incomplete export creates no download or activity record"
      );

      window.confirm = (message) => {
        partialExportPrompts.push(String(message || ""));
        return true;
      };
      await exportLocalization();
      const partialHtmlDownload = scopedExportDownloads.filter((item) => item.type === "text/html").at(-1);
      const partialHtml = await partialHtmlDownload?.blob.text();
      const activityAfterFallbackExport = await listActivityEvents(project.id);
      const fallbackActivity = activityAfterFallbackExport.find((event) => event.type === "export" && event.detail?.documentId === scopedEmptyDocument.id && event.detail?.sourceFallbackCount === 1);
      assert(
        partialHtml?.includes("Unselected unfinished segment.") &&
          scopedEmptySegment.target === emptyTargetBeforeExports &&
          scopedEmptySegment.status === emptyStatusBeforeExports &&
          (scopedEmptySegment.targetHistory?.length || 0) === emptyHistoryLengthBeforeExports &&
          Boolean(fallbackActivity) &&
          els.saveStatus.textContent.includes("1 source fallback"),
        "incomplete localization export uses source fallback without mutating editor state"
      );

      await exportXliff();
      const partialXliffDownload = scopedExportDownloads.filter((item) => item.type === "application/x-xliff+xml").at(-1);
      const partialXliff = await partialXliffDownload?.blob.text();
      const parsedPartialXliff = xliffApi.parseXliffText(partialXliff, "partial.xlf");
      assert(
        parsedPartialXliff.segments[0].target === "" &&
          parsedPartialXliff.segments[0].status === "empty" &&
          partialExportPrompts.at(-1)?.includes("1 empty target segment(s) will remain empty") &&
          scopedEmptySegment.target === emptyTargetBeforeExports,
        "incomplete XLIFF export preserves an explicit empty target after confirmation"
      );
    } finally {
      URL.createObjectURL = originalScopedCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalScopedAnchorClick;
      window.confirm = originalScopedConfirm;
    }

    const deliveryActivityDownloads = [];
    const originalActivityCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalActivityAnchorClick = HTMLAnchorElement.prototype.click;
    const originalActivityConfirm = window.confirm;
    URL.createObjectURL = (blob) => {
      deliveryActivityDownloads.push({ type: blob.type, blob });
      return originalActivityCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function noopActivityDeliveryClick() {};
    window.confirm = () => true;
    try {
      const activityCountBeforeDeliveryExport = (await listActivityEvents(project.id)).length;
      const untranslatedForDelivery = state.segments.filter((segment) => !String(segment.target || "").trim());
      untranslatedForDelivery.forEach((segment) => {
        setSegmentTargetAndStatus(segment, segment.source || "Completed target", "draft", "delivery-test-complete");
        touchSegment(segment);
      });
      if (untranslatedForDelivery.length) await saveSegments(state.segments);
      selectApplicationDocument("");
      renderDocumentFilter();
      clearWorkspaceDirtyMarkers();
      await exportXliff();
      const activityAfterDeliveryExport = await listActivityEvents(project.id);
      assert(
        deliveryActivityDownloads.some((item) => item.type === "application/x-xliff+xml") &&
        activityAfterDeliveryExport.length > activityCountBeforeDeliveryExport &&
        activityAfterDeliveryExport.some((event) => event.type === "export" && event.summary === "XLIFF exported") &&
        state.workspaceDirtyProjectIds.has(project.id),
        "delivery export awaits activity event and marks workspace package dirty"
      );
    } finally {
      URL.createObjectURL = originalActivityCreateObjectUrl;
      HTMLAnchorElement.prototype.click = originalActivityAnchorClick;
      window.confirm = originalActivityConfirm;
    }
    publish(true);
  } catch (error) {
    publish(false, error);
  }
} : async function runAppWorkflowTestDisabled() {};
