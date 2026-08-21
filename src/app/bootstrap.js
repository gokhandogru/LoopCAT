import { createAppStore } from "./app-store.js";
import { createApplicationEvents } from "./events.js";
import { createApplicationActiveSegmentService } from "./application-active-segment-service.js";
import { createApplicationCommandCatalogService } from "./application-command-catalog-service.js";
import { createApplicationDateTimeService } from "./application-date-time-service.js";
import { createApplicationCommandButtonsController } from "./application-command-buttons-controller.js";
import { createApplicationCommandHistoryController } from "./application-command-history-controller.js";
import { createApplicationDownloadController } from "./application-download-controller.js";
import { createApplicationEventWiringController } from "./application-event-wiring-controller.js";
import { createApplicationImportProgressController } from "./application-import-progress-controller.js";
import { createApplicationMenuController } from "./application-menu-controller.js";
import { createApplicationOfflineShellController } from "./application-offline-shell-controller.js";
import { createApplicationPersistenceLifecycleController } from "./application-persistence-lifecycle-controller.js";
import { createApplicationSaveStatusController } from "./application-save-status-controller.js";
import { createApplicationStorageDurabilityController } from "./application-storage-durability-controller.js";
import { createApplicationStartupController } from "./application-startup-controller.js";
import { createApplicationTextSafetyService } from "./application-text-safety-service.js";
import { createApplicationTrashController } from "./application-trash-controller.js";
import { createApplicationUpdateControlsController } from "./application-update-controls-controller.js";
import { createApplicationViewController } from "./application-view-controller.js";
import { createNavigationController } from "./navigation-controller.js";
import { createGlobalKeyboardController } from "./global-keyboard-controller.js";
import { createLocalizationDownloadMimeTypeService } from "./localization-download-mime-type-service.js";
import { createProjectRepository } from "../data/project-repository.js";
import { createPreferencesRepository } from "../data/preferences-repository.js";
import { createStorageRepository } from "../data/storage-repository.js";
import { createTrashRepository } from "../data/trash-repository.js";
import { createCommandBus } from "../commands/command-bus.js";
import { createCommandRegistry } from "../commands/command-registry.js";
import { createUndoStore } from "../commands/undo-store.js";
import { createEditTargetSessionStore } from "../commands/edit-target-session.js";
import {
  createDeleteDocumentCommand,
  createDeleteProjectCommand,
  createDeleteResourceCommand,
  createDeleteResourceEntryCommand
} from "../commands/trash-commands.js";
import { createApplyAiSuggestionCommand } from "../commands/ai-commands.js";
import {
  createAiPretranslationCommand,
  createChangeReviewStateCommand,
  createConfirmSegmentCommand,
  createCopySourceToTargetCommand,
  createEditTargetCommand,
  createInsertProtectedTagCommand,
  createInsertTmTargetCommand,
  createMergeSegmentCommand,
  createReplaceTargetsCommand,
  createSplitSegmentCommand,
  createTmPretranslationCommand
} from "../commands/segment-commands.js";
import { createBrowserPlatform } from "../platform/browser-platform.js";
import { createElectronPlatform } from "../platform/electron-platform.js";
import { createDashboardController } from "../features/projects/dashboard-controller.js";
import { createProjectsController } from "../features/projects/projects-controller.js";
import { createProjectDialogController } from "../features/projects/project-dialog-controller.js";
import { createProjectDialogSaveController } from "../features/projects/project-dialog-save-controller.js";
import { createProjectDomainController } from "../features/projects/project-domain-controller.js";
import { createProjectFilterControlsController } from "../features/projects/project-filter-controls-controller.js";
import { createProjectHomeController } from "../features/projects/project-home-controller.js";
import { createEditorController } from "../features/editor/editor-controller.js";
import { createEditorContextController } from "../features/editor/editor-context-controller.js";
import { createEditorSessionStore } from "../features/editor/editor-session-store.js";
import { createEditorFilterControlsController } from "../features/editor/editor-filter-controls-controller.js";
import { createFilterStore } from "../features/editor/filter-store.js";
import { createFilterPresetController } from "../features/editor/filter-preset-controller.js";
import { createFocusModeController } from "../features/editor/focus-mode-controller.js";
import { createInspectorController } from "../features/editor/inspector-controller.js";
import { createInspectorToggleController } from "../features/editor/inspector-toggle-controller.js";
import { createPanelToggleController } from "../features/editor/panel-toggle-controller.js";
import { createSegmentActionButtonsController } from "../features/editor/segment-action-buttons-controller.js";
import { createSegmentGridController } from "../features/editor/segment-grid-controller.js";
import { createAutosaveService } from "../features/editor/autosave-service.js";
import { createTargetEditController } from "../features/editor/target-edit-controller.js";
import { createSegmentConfirmationController } from "../features/editor/segment-confirmation-controller.js";
import { createTargetProducerController } from "../features/editor/target-producer-controller.js";
import { createProtectedTagInspectionService } from "../features/editor/protected-tag-inspection-service.js";
import { createProtectedTextReplacementService } from "../features/editor/protected-text-replacement-service.js";
import { createSegmentProvenanceService } from "../features/editor/segment-provenance-service.js";
import { createSegmentLabelService } from "../features/editor/segment-label-service.js";
import { createSegmentFilterService } from "../features/editor/segment-filter-service.js";
import { createSegmentProgressService } from "../features/editor/segment-progress-service.js";
import { createSegmentTargetStateService } from "../features/editor/segment-target-state-service.js";
import { createSegmentCommandRestorationController } from "../features/editor/segment-command-restoration-controller.js";
import { createSegmentConfirmationStateService } from "../features/editor/segment-confirmation-state-service.js";
import { createSegmentTmSaveController } from "../features/editor/segment-tm-save-controller.js";
import { createTmMatchesController } from "../features/editor/tm-matches-controller.js";
import { createTermSuggestionsController } from "../features/editor/term-suggestions-controller.js";
import { createTermFormController } from "../features/editor/term-form-controller.js";
import { createConcordanceController } from "../features/editor/concordance-controller.js";
import { createSegmentNavigationController } from "../features/editor/segment-navigation-controller.js";
import { createSegmentDraftApplicationService } from "../features/editor/segment-draft-application-service.js";
import { createTargetReplacementController } from "../features/editor/target-replacement-controller.js";
import { createTmPretranslationController } from "../features/editor/tm-pretranslation-controller.js";
import { createStructuralSegmentController } from "../features/editor/structural-segment-controller.js";
import { createPaletteController } from "../features/palette/palette-controller.js";
import { createWorkspaceLayoutController } from "../features/workspace/workspace-layout-controller.js";
import { createUpdateController } from "../features/update/update-controller.js";
import { createDiagnosticsController } from "../features/diagnostics/diagnostics-controller.js";
import { createDiagnosticsService } from "../features/diagnostics/diagnostics-service.js";
import { createAiContextController } from "../features/ai/ai-context-controller.js";
import { createAiAdministrationController } from "../features/ai/ai-administration-controller.js";
import { createAiCredentialClearController } from "../features/ai/ai-credential-clear-controller.js";
import { createAiPretranslationController } from "../features/ai/ai-pretranslation-controller.js";
import { createAiReviewController } from "../features/ai/ai-review-controller.js";
import { createAiTagRepairController } from "../features/ai/ai-tag-repair-controller.js";
import { createAiAlternativesController } from "../features/ai/ai-alternatives-controller.js";
import { createAiTerminologyApplicationController } from "../features/ai/ai-terminology-application-controller.js";
import { createAiDraftEditingController } from "../features/ai/ai-draft-editing-controller.js";
import { createAiTerminologyExtractionController } from "../features/ai/ai-terminology-extraction-controller.js";
import { createAiProjectBriefController } from "../features/ai/ai-project-brief-controller.js";
import { createAiSuggestionApplicationController } from "../features/ai/ai-suggestion-application-controller.js";
import { createAiOpenAiSuggestionController } from "../features/ai/ai-openai-suggestion-controller.js";
import { createAiSuggestionPersistenceController } from "../features/ai/ai-suggestion-persistence-controller.js";
import { createAiSettingsPersistenceController } from "../features/ai/ai-settings-persistence-controller.js";
import { createAiProviderAdministrationOperationsController } from "../features/ai/ai-provider-administration-operations-controller.js";
import { createAiProviderPresentationService } from "../features/ai/ai-provider-presentation-service.js";
import {
  AI_CREDENTIAL_STORAGE_KEYS,
  createAiCredentialStorageService
} from "../features/ai/ai-credential-storage-service.js";
import { createAiRuntimeSettingsService } from "../features/ai/ai-runtime-settings-service.js";
import { createAiLocalSettingsPersistenceController } from "../features/ai/ai-local-settings-persistence-controller.js";
import { createAiCommandLifecycleCoordinator } from "../features/ai/ai-command-lifecycle-coordinator.js";
import { createAiProviderFormController } from "../features/ai/ai-provider-form-controller.js";
import { createAiSuggestionListController } from "../features/ai/ai-suggestion-list-controller.js";
import { createAiPromptTestController } from "../features/ai/ai-prompt-test-controller.js";
import { createAiPromptPreviewController } from "../features/ai/ai-prompt-preview-controller.js";
import { createAiTermCandidatePersistenceService } from "../features/ai/ai-term-candidate-persistence-service.js";
import { createAiSegmentContextService } from "../features/ai/ai-segment-context-service.js";
import { createAiScopeSelectionService } from "../features/ai/ai-scope-selection-service.js";
import { createExternalAiConsentService } from "../features/ai/external-ai-consent-service.js";
import { createOpusCatHelpController } from "../features/ai/opus-cat-help-controller.js";
import { createProjectResourceSelectionController } from "../features/projects/project-resource-selection-controller.js";
import { createProjectLanguagePairShortcutsController } from "../features/projects/project-language-pair-shortcuts-controller.js";
import { createProjectNameService } from "../features/projects/project-name-service.js";
import { createProjectRecordLookupService } from "../features/projects/project-record-lookup-service.js";
import { createProjectDocumentManifestService } from "../features/projects/project-document-manifest-service.js";
import { createProjectResourceContextService } from "../features/projects/project-resource-context-service.js";
import { createProjectSearchTextService } from "../features/projects/project-search-text-service.js";
import { createProjectTmMatchService } from "../features/projects/project-tm-match-service.js";
import { createProjectLanguageContextController } from "../features/projects/project-language-context-controller.js";
import { createProjectDocumentStatisticsService } from "../features/projects/project-document-statistics-service.js";
import { createProjectDocumentCatalogService } from "../features/projects/project-document-catalog-service.js";
import { createTmPretranslationDialogController } from "../features/resources/tm-pretranslation-dialog-controller.js";
import { createResourcesController } from "../features/resources/resources-controller.js";
import { createResourcesPresentationService } from "../features/resources/resources-presentation-service.js";
import { createResourceCatalogService } from "../features/resources/resource-catalog-service.js";
import { createResourceLibraryImportController } from "../features/resources/resource-library-import-controller.js";
import { createResourceLibraryExportController } from "../features/resources/resource-library-export-controller.js";
import { createResourceMutationController } from "../features/resources/resource-mutation-controller.js";
import { createQualityReviewController } from "../features/quality/quality-review-controller.js";
import { createQaResultsController } from "../features/quality/qa-results-controller.js";
import { createProjectQaController } from "../features/quality/project-qa-controller.js";
import { createQualityPresentationService } from "../features/quality/quality-presentation-service.js";
import { createQualityWorkbenchController } from "../features/quality/quality-workbench-controller.js";
import { createRevisionHistoryPresentationService } from "../features/quality/revision-history-presentation-service.js";
import { createQualityProfileController } from "../features/quality/quality-profile-controller.js";
import { createQualityDecisionController } from "../features/quality/quality-decision-controller.js";
import { createReviewStateController } from "../features/quality/review-state-controller.js";
import { createReviewMetadataController } from "../features/quality/review-metadata-controller.js";
import { createRecoveryWorkspaceController } from "../features/workspace/recovery-workspace-controller.js";
import { createDeliveryExportController } from "../features/import-export/delivery-export-controller.js";
import { createProjectResourceTransferController } from "../features/import-export/project-resource-transfer-controller.js";
import { createImportExportController } from "../features/import-export/import-export-controller.js";
import { createFileImportService } from "../features/import-export/file-import-service.js";
import { createProjectDocumentImportController } from "../features/import-export/project-document-import-controller.js";
import { createProjectExportBuildService } from "../features/import-export/project-export-build-service.js";
import { createProjectExportController } from "../features/import-export/project-export-controller.js";
import { createProjectImportRestoreController } from "../features/import-export/project-import-restore-controller.js";
import { createProjectPackagePortabilityService } from "../features/import-export/project-package-portability-service.js";
import { createTextEncodingInputService } from "../features/import-export/text-encoding-input-service.js";
import { createWorkspacePackageSaveController } from "../features/workspace/workspace-package-save-controller.js";
import { createWorkspaceBackupExportController } from "../features/workspace/workspace-backup-export-controller.js";
import { createWorkspaceBackupReminderService } from "../features/workspace/workspace-backup-reminder-service.js";
import { createWorkspaceDirtyStateController } from "../features/workspace/workspace-dirty-state-controller.js";
import { createWorkspaceHealthRepairController } from "../features/workspace/workspace-health-repair-controller.js";
import { createWorkspaceProjectCoverageService } from "../features/workspace/workspace-project-coverage-service.js";
import { createWorkspaceRecoveryPresentationService } from "../features/workspace/workspace-recovery-presentation-service.js";
import { createWorkspaceSyncController } from "../features/workspace/workspace-sync-controller.js";
import {
  asTrustedHtml,
  asTrustedScriptUrl,
  replaceWithSanitizedHtml,
  sanitizedFragment
} from "../security/safe-html.js";
import { createThemeController } from "../ui/theme-controller.js";
import { createDialogController } from "../ui/dialog-controller.js";
import { createJobStore } from "../status/job-store.js";
import { createNoticeStore } from "../status/notice-store.js";
import { createSaveStore } from "../status/save-store.js";
import { createStatusController } from "../status/status-controller.js";
import { createAiProviderService } from "../ai/providers/legacy-registry-adapter.js";
import { finalizeReportDocument } from "../reports/report-document.js";
import { createReportDocumentCompositionService } from "../reports/report-document-composition-service.js";
import { createReportDataService } from "../reports/report-data-service.js";
import { createReportExportController } from "../reports/report-export-controller.js";
import { createReportPresentationService } from "../reports/report-presentation-service.js";
import { createLocaleLoader } from "../i18n/locale-loader.js";
import { createUiLocalizationService } from "../i18n/ui-localization-service.js";
import { createLanguageInputService } from "../i18n/language-input-service.js";
import { createUiLocaleControlsController } from "../i18n/ui-locale-controls-controller.js";
import { createUiLocaleOrchestrationController } from "../i18n/ui-locale-orchestration-controller.js";

export function createApplicationRuntime({ browserWindow, compatibilityModules, desktopBridge }) {
  const store = createAppStore();
  const events = createApplicationEvents();
  const storageRepository = createStorageRepository(compatibilityModules.storage);
  const projectRepository = createProjectRepository(compatibilityModules.project);
  const preferencesRepository = createPreferencesRepository(storageRepository);
  const trashRepository = createTrashRepository(storageRepository);
  const undoStore = createUndoStore(100);
  const commandBus = createCommandBus({ undoStore });
  const editTargetSessions = createEditTargetSessionStore({ commandBus, createEditTargetCommand });
  const saveStore = createSaveStore();
  const jobStore = createJobStore();
  const noticeStore = createNoticeStore();
  const editorSession = createEditorSessionStore();
  const platform = desktopBridge?.getRuntimeStatus
    ? createElectronPlatform(desktopBridge)
    : createBrowserPlatform(browserWindow);
  const localeLoader = createLocaleLoader({ i18n: compatibilityModules.i18n, browserWindow });

  return Object.freeze({
    compatibilityModules,
    events,
    editorSession,
    commands: Object.freeze({
      bus: commandBus,
      createAiPretranslationCommand,
      createApplyAiSuggestionCommand,
      createChangeReviewStateCommand,
      createConfirmSegmentCommand,
      createCopySourceToTargetCommand,
      createEditTargetCommand,
      createInsertProtectedTagCommand,
      createInsertTmTargetCommand,
      createMergeSegmentCommand,
      createReplaceTargetsCommand,
      createSplitSegmentCommand,
      createTmPretranslationCommand,
      createDeleteDocumentCommand: (options) => createDeleteDocumentCommand({ ...options, trashRepository }),
      createDeleteProjectCommand: (options) => createDeleteProjectCommand({ ...options, trashRepository }),
      createDeleteResourceCommand: (options) => createDeleteResourceCommand({ ...options, trashRepository }),
      createDeleteResourceEntryCommand: (options) => createDeleteResourceEntryCommand({ ...options, trashRepository }),
      registry: createCommandRegistry(),
      editTargetSessions,
      undoStore
    }),
    featureFactories: Object.freeze({
      aiCredentialStorageKeys: AI_CREDENTIAL_STORAGE_KEYS,
      createAiAdministrationController,
      createAiCredentialClearController,
      createAiCredentialStorageService,
      createAiRuntimeSettingsService,
      createAiLocalSettingsPersistenceController,
      createAiCommandLifecycleCoordinator,
      createAiContextController,
      createAiPretranslationController,
      createAiReviewController,
      createAiTagRepairController,
      createAiAlternativesController,
      createAiTerminologyApplicationController,
      createAiDraftEditingController,
      createAiTerminologyExtractionController,
      createAiProjectBriefController,
      createAiSuggestionApplicationController,
      createAiOpenAiSuggestionController,
      createAiSuggestionPersistenceController,
      createAiSettingsPersistenceController,
      createAiProviderAdministrationOperationsController,
      createAiProviderFormController,
      createAiSuggestionListController,
      createAiProviderPresentationService,
      createAiPromptTestController,
      createAiPromptPreviewController,
      createAiTermCandidatePersistenceService,
      createAiSegmentContextService,
      createAiScopeSelectionService,
      createExternalAiConsentService,
      createAutosaveService,
      createOpusCatHelpController,
      createAiProviderService,
      createDashboardController,
      createDiagnosticsController,
      createDiagnosticsService,
      createDialogController,
      createEditorController,
      createEditorContextController,
      createEditorFilterControlsController,
      createFilterStore,
      createFilterPresetController,
      createFocusModeController,
      createInspectorController,
      createInspectorToggleController,
      createPanelToggleController,
      createSegmentActionButtonsController,
      createDeliveryExportController,
      createProjectResourceTransferController,
      createImportExportController,
      createFileImportService,
      createProjectDocumentImportController,
      createProjectExportBuildService,
      createProjectExportController,
      createProjectImportRestoreController,
      createProjectPackagePortabilityService,
      createTextEncodingInputService,
      createWorkspacePackageSaveController,
      createWorkspaceBackupExportController,
      createWorkspaceBackupReminderService,
      createWorkspaceDirtyStateController,
      createWorkspaceHealthRepairController,
      createWorkspaceProjectCoverageService,
      createWorkspaceRecoveryPresentationService,
      createWorkspaceSyncController,
      createReportDataService,
      createReportDocumentCompositionService,
      createReportExportController,
      createReportPresentationService,
      createLanguageInputService,
      createUiLocaleControlsController,
      createUiLocaleOrchestrationController,
      createUiLocalizationService,
      createProjectDialogController,
      createProjectDialogSaveController,
      createProjectDomainController,
      createProjectFilterControlsController,
      createProjectHomeController,
      createProjectDocumentCatalogService,
      createProjectDocumentStatisticsService,
      createProjectDocumentManifestService,
      createProjectResourceContextService,
      createProjectSearchTextService,
      createProjectTmMatchService,
      createProjectLanguageContextController,
      createProjectLanguagePairShortcutsController,
      createProjectNameService,
      createProjectRecordLookupService,
      createProjectsController,
      createProjectResourceSelectionController,
      createResourceCatalogService,
      createResourceLibraryExportController,
      createResourceLibraryImportController,
      createResourceMutationController,
      createQualityReviewController,
      createQaResultsController,
      createProjectQaController,
      createQualityPresentationService,
      createQualityWorkbenchController,
      createRevisionHistoryPresentationService,
      createQualityProfileController,
      createQualityDecisionController,
      createReviewMetadataController,
      createReviewStateController,
      createRecoveryWorkspaceController,
      createResourcesController,
      createResourcesPresentationService,
      createSegmentConfirmationController,
      createStructuralSegmentController,
      createTargetProducerController,
      createProtectedTagInspectionService,
      createProtectedTextReplacementService,
      createSegmentProvenanceService,
      createSegmentLabelService,
      createSegmentFilterService,
      createSegmentProgressService,
      createSegmentTargetStateService,
      createSegmentCommandRestorationController,
      createSegmentConfirmationStateService,
      createSegmentTmSaveController,
      createTmMatchesController,
      createTermSuggestionsController,
      createTermFormController,
      createConcordanceController,
      createApplicationActiveSegmentService,
      createApplicationCommandCatalogService,
      createApplicationDateTimeService,
      createApplicationCommandButtonsController,
      createApplicationCommandHistoryController,
      createApplicationDownloadController,
      createApplicationEventWiringController,
      createApplicationImportProgressController,
      createApplicationMenuController,
      createApplicationOfflineShellController,
      createApplicationPersistenceLifecycleController,
      createApplicationSaveStatusController,
      createApplicationStorageDurabilityController,
      createApplicationStartupController,
      createApplicationTextSafetyService,
      createApplicationTrashController,
      createApplicationUpdateControlsController,
      createApplicationViewController,
      createGlobalKeyboardController,
      createLocalizationDownloadMimeTypeService,
      createSegmentNavigationController,
      createSegmentDraftApplicationService,
      createTargetReplacementController,
      createTmPretranslationController,
      createPaletteController,
      createThemeController,
      createTargetEditController,
      createTmPretranslationDialogController,
      createUpdateController,
      createWorkspaceLayoutController,
      createSegmentGridController
    }),
    navigation: createNavigationController({ store, events }),
    localeLoader,
    platform,
    safeHtml: Object.freeze({
      replace: replaceWithSanitizedHtml,
      fragment: sanitizedFragment,
      trusted: asTrustedHtml,
      trustedScriptUrl: asTrustedScriptUrl
    }),
    reports: Object.freeze({ finalize: finalizeReportDocument }),
    preferencesRepository,
    projectRepository,
    status: Object.freeze({
      controller: createStatusController({ saveStore, jobStore, noticeStore, events }),
      jobs: jobStore,
      notices: noticeStore,
      save: saveStore
    }),
    storageRepository,
    trashRepository,
    store
  });
}
