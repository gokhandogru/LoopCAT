import { createAppStore } from "./app-store.js";
import { createApplicationEvents } from "./events.js";
import { createNavigationController } from "./navigation-controller.js";
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
import { createEditorController } from "../features/editor/editor-controller.js";
import { createEditorContextController } from "../features/editor/editor-context-controller.js";
import { createEditorSessionStore } from "../features/editor/editor-session-store.js";
import { createFilterStore } from "../features/editor/filter-store.js";
import { createFilterPresetController } from "../features/editor/filter-preset-controller.js";
import { createInspectorController } from "../features/editor/inspector-controller.js";
import { createSegmentGridController } from "../features/editor/segment-grid-controller.js";
import { createAutosaveService } from "../features/editor/autosave-service.js";
import { createTargetEditController } from "../features/editor/target-edit-controller.js";
import { createSegmentConfirmationController } from "../features/editor/segment-confirmation-controller.js";
import { createTargetProducerController } from "../features/editor/target-producer-controller.js";
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
import { createOpusCatHelpController } from "../features/ai/opus-cat-help-controller.js";
import { createTmPretranslationDialogController } from "../features/resources/tm-pretranslation-dialog-controller.js";
import { createResourcesController } from "../features/resources/resources-controller.js";
import { createQualityReviewController } from "../features/quality/quality-review-controller.js";
import { createQualityProfileController } from "../features/quality/quality-profile-controller.js";
import { createQualityDecisionController } from "../features/quality/quality-decision-controller.js";
import { createReviewStateController } from "../features/quality/review-state-controller.js";
import { createReviewMetadataController } from "../features/quality/review-metadata-controller.js";
import { createRecoveryWorkspaceController } from "../features/workspace/recovery-workspace-controller.js";
import { createImportExportController } from "../features/import-export/import-export-controller.js";
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
import { createLocaleLoader } from "../i18n/locale-loader.js";

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
      createAiAdministrationController,
      createAiContextController,
      createAutosaveService,
      createOpusCatHelpController,
      createAiProviderService,
      createDashboardController,
      createDiagnosticsController,
      createDiagnosticsService,
      createDialogController,
      createEditorController,
      createEditorContextController,
      createFilterStore,
      createFilterPresetController,
      createInspectorController,
      createImportExportController,
      createProjectDialogController,
      createProjectsController,
      createQualityReviewController,
      createQualityProfileController,
      createQualityDecisionController,
      createReviewMetadataController,
      createReviewStateController,
      createRecoveryWorkspaceController,
      createResourcesController,
      createSegmentConfirmationController,
      createStructuralSegmentController,
      createTargetProducerController,
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
