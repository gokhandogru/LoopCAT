(() => {
const appRuntime = window.CatHan.appRuntime;
const compatibilityModules = appRuntime.compatibilityModules;
const storageApi = compatibilityModules.storage;
const encodingApi = compatibilityModules.encoding;
const xliffApi = compatibilityModules.xliff;
const { buildBilingualDocx, buildTargetDocx, detectProtectedTags, extractDocxSegments } = compatibilityModules.docx;
const { appendProjectSegments, appendProjectSegmentsAndUpdateProject, createProject, deleteProject, deleteProjectDocument, deleteSegment, getProjectSegments, listProjects, replaceProjectSegments, saveSegment, saveSegments, saveSegmentStructure, updateProject } = compatibilityModules.project;
const { bulkPut, constants: storageConstants, createPortableSanitizerContext, exportAllData, getAll, getAllByIndex, importAllData, importProjectPackageRecords, listActivityEvents, makeId, recordActivityEvent, sanitizePortableValue } = storageApi;
const { deleteTmEntry, deleteTmEntries, getTmMatchCandidates, getTmMatchCandidateBatches, importTmEntries, listTmEntries, rebuildAllTmIndexes, saveTmEntry, scoreTmEntries, updateTmEntry } = compatibilityModules.tm;
const { buildTmx, parseTmx, parseTmxAsync } = compatibilityModules.tmx;
const { deleteTerm, deleteTerms, findTerms, importTerms, listTerms, parseTermList, parseTermWorkbook, rebuildAllTermIndexes, saveTerm, termRanges, updateTerm } = compatibilityModules.termbase;
const { buildTbx, parseTbx, parseTbxAsync } = compatibilityModules.tbx;
const { buildTargetXliff, buildXliff, buildXliff22, parseXliffFile, xliffMimeType } = xliffApi;
const { buildLocalizationFile, parseLocalizationFile } = compatibilityModules.localization;
const { runQaChecks } = compatibilityModules.qa;
const { validateProjectPackage: validatePackage, validateBackupFile, planDeliveryExport, validateExportReadiness, reportCount, reportSummary } = compatibilityModules.validation;
const { analyzeProject } = compatibilityModules.analysis;
const { buildQualityPassportData, buildRiskQueue, defaultQualityProfile, qualityCategoryLabel: baseQualityCategoryLabel, scoreSegment } = compatibilityModules.quality;
const {
  DEFAULT_LOCAL_AI_MODEL,
  GEMINI_DEFAULT_MODEL,
  LOCAL_AI_PROVIDER_PRESETS,
  OPENAI_DEFAULT_MODEL,
  OPENAI_DEFAULT_BASE_URL,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  OPUS_CAT_DEFAULT_BASE_URL,
  aiCommandService,
  aiProviderRegistry,
  browserAppearsOffline,
  buildAiReviewPrompt,
  buildDraftAdaptationPrompt,
  buildProjectBriefPrompt,
  buildStylePolishPrompt,
  buildTagRepairPrompt,
  buildTargetVariantsPrompt,
  buildTerminologyApplicationPrompt,
  buildTerminologyExtractionPrompt,
  buildTranslateGemmaPrompt,
  normalizedProviderBaseUrl,
  ollamaApiUrl,
  opusCatApiUrl,
  openAiApiUrl,
  deepSeekApiUrl,
  geminiApiUrl,
  anthropicApiUrl,
  cohereApiUrl,
  mistralApiUrl,
  xAiApiUrl,
  perplexityApiUrl,
  groqApiUrl,
  togetherApiUrl,
  openRouterApiUrl,
  huggingFaceApiUrl,
  deepInfraApiUrl,
  fireworksApiUrl,
  azureOpenAiApiUrl,
  openAiCompatibleApiUrl,
  isOpenAiProvider,
  isOllamaCloudBaseUrl,
  isAllowedOpenAiCompatibleHostedBaseUrl,
  localAiProviderPresetById,
  localAiProviderPresetForSettings,
  localAiProviderNeedsApiKey,
  localAiProviderSharesExternally,
  localAiProviderGuidance,
  localAISettingsStore,
  openAiSuggestion,
  parseAiReviewRisk,
  preTranslationService
} = compatibilityModules.ai;
const workerClient = compatibilityModules.workerClient;
const workspaceStorage = compatibilityModules.workspaceStorage;
const uiI18n = compatibilityModules.i18n;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
const applicationTextSafetyService = appRuntime.featureFactories.createApplicationTextSafetyService({
  patterns: { sensitiveValue: SENSITIVE_TEXT_VALUE_PATTERN }
});
const uiLocalizationService = appRuntime.featureFactories.createUiLocalizationService({
  i18n: uiI18n,
  documentElement: document.documentElement,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  confirm: (message) => window.confirm(message),
  alert: (message) => window.alert(message)
});
const qualityPresentationService = appRuntime.featureFactories.createQualityPresentationService({
  localization: uiLocalizationService,
  baseCategoryLabel: baseQualityCategoryLabel
});
const qaResultsController = appRuntime.featureFactories.createQaResultsController({
  session: {
    getQaChecks: () => editorSessionStore.getQaChecks(),
    getSegments: () => editorSessionStore.getSegments()
  },
  getRoot: () => els.qaResults,
  dom: {
    createElement: (tagName) => document.createElement(tagName),
    createDocumentFragment: () => document.createDocumentFragment()
  },
  localization: uiLocalizationService,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  replaceSafeHtml: (...args) => appRuntime.safeHtml.replace(...args),
  navigation: { select: (index) => segmentNavigationController.select(index) },
  presentation: { renderSegments },
  focus: { target: () => targetEditController.focusActive() }
});
const reportPresentationService = appRuntime.featureFactories.createReportPresentationService({
  localization: uiLocalizationService,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  redactSensitiveText: applicationTextSafetyService.redactSensitiveText,
  qualityCategoryName: qualityPresentationService.category,
  qaCheckMessage: qaResultsController.message,
  qaCheckFixHint: qaResultsController.fixHint
});
const reportDocumentCompositionService = appRuntime.featureFactories.createReportDocumentCompositionService({
  localization: uiLocalizationService,
  presentation: reportPresentationService,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  redactSensitiveText: applicationTextSafetyService.redactSensitiveText,
  defaultQualityProfile,
  sanitizeValidationReportForDisplay,
  languagePairDisplay: (...args) => languageInputService.pairDisplay(...args),
  formatDateTime,
  qualityLabel: qualityPresentationService.profile,
  qualityCategoryName: qualityPresentationService.category,
  qualityRiskLevelLabel: qualityPresentationService.riskLevel
});
const focusController = compatibilityModules.focusController.createFocusController();
const replaceSafeHtml = appRuntime.safeHtml.replace;
const finalizeReportDocument = appRuntime.reports.finalize;
const aiProviderService = appRuntime.featureFactories.createAiProviderService(aiProviderRegistry);
const applicationStore = appRuntime?.store;
const applicationNavigation = appRuntime?.navigation;
const APP_NAME = "LoopCAT";
const LEGACY_APP_NAME = "CatHan";
const {
  openAi: OPENAI_KEY_STORAGE,
  localAiLegacy: LOCAL_AI_KEY_STORAGE
} = appRuntime.featureFactories.aiCredentialStorageKeys;
const CREATOR_NAME_STORAGE = "loopcat.creatorName";
const WORKSPACE_DIRTY_STORAGE = "loopcat.workspace.dirtyProjectIds";
const BACKUP_REMINDER_STORAGE = "loopcat.backupReminder.dismissedUntil";
const OFFLINE_APP_SHELL_CACHE_PREFIX = "loopcat-offline-";
let offlineUpdateController = null;
const OFFLINE_APP_SHELL_WARMUP_ASSETS = Object.freeze(
  (window.LoopCATProductionAssets?.offlineAssets || []).map((asset) => `./${asset}`)
);

const SEGMENT_ROW_HEIGHT = 118;
const SEGMENT_ROW_BUFFER = 8;
const TM_PRETRANSLATE_BATCH_SIZE = 100;
const MAX_PORTABLE_JSON_BYTES = 50 * 1024 * 1024;
const MAX_PROJECT_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_RESOURCE_IMPORT_BYTES = 100 * 1024 * 1024;
const BACKUP_REMINDER_PROJECT_DAYS = 7;
const BACKUP_REMINDER_EXPORT_DAYS = 7;
const BACKUP_REMINDER_ACTIVITY_COUNT = 25;
const BACKUP_REMINDER_ACTIVITY_SINCE_EXPORT = 10;
const BACKUP_REMINDER_DISMISS_HOURS = 24;
const STORAGE_LOW_SPACE_BYTES = 250 * 1024 * 1024;
const STORAGE_HIGH_USAGE_RATIO = 0.9;
const XLIFF_DOCUMENT_TYPES = new Set(["xlf", "xliff", "sdlxliff"]);
const LOCALIZATION_EXPORT_TYPES = new Set([
  "docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm", "ppsx", "ppsm", "potx", "potm",
  "odp", "otp", "ods", "ots", "odt", "ott",
  "html", "htm", "xhtml", "md", "markdown",
  "xlf", "xliff", "sdlxliff", "po", "pot", "ttx", "txml", "xini",
  "mif", "idml", "icml", "dita",
  "csv", "tsv", "xml", "dtd", "json", "yaml", "yml",
  "php", "properties", "ts", "resx", "wix", "strings",
  "srt", "vtt", "sbv", "txt"
]);
const RESOURCE_LINK_TYPES = new Set(["tm", "termbase"]);
// Bundled language/locales for offline use.
const LOOPCAT_LANGUAGE_CATALOG_ENTRIES = [
  ["ace-ID", "Acehnese"],
  ["aa-ET", "Afar"],
  ["af-ZA", "Afrikaans"],
  ["ak-GH", "Akan"],
  ["sq-AL", "Albanian"],
  ["gsw-CH", "Alemannic"],
  ["am-ET", "Amharic"],
  ["blo-BJ", "Anii"],
  ["aig-AG", "Antigua and Barbuda Creole English"],
  ["ar-SA", "Arabic"],
  ["ar-EG", "Arabic (Egypt)"],
  ["ar-JO", "Arabic (Jordan)"],
  ["ar-MA", "Arabic (Morocco)"],
  ["ar-TN", "Arabic (Tunisia)"],
  ["ar-AE", "Arabic (United Arab Emirates)"],
  ["an-ES", "Aragonese"],
  ["hy-AM", "Armenian"],
  ["as-IN", "Assamese"],
  ["ast-ES", "Asturian"],
  ["asa-TZ", "Asu"],
  ["awa-IN", "Awadhi"],
  ["quy-PE", "Ayacucho Quechua"],
  ["az-AZ", "Azerbaijani"],
  ["bah-BS", "Bahamas Creole English"],
  ["bjs-BB", "Bajan"],
  ["ban-ID", "Balinese"],
  ["rmn-BG", "Balkan Romani"],
  ["bal-PK", "Baluchi (Pakistan)"],
  ["bm-ML", "Bambara"],
  ["bjn-ID", "Banjar"],
  ["ba-RU", "Bashkir"],
  ["eu-ES", "Basque"],
  ["be-BY", "Belarusian"],
  ["bem-ZM", "Bemba"],
  ["bez-TZ", "Bena"],
  ["bn-BD", "Bengali (Bangladesh)"],
  ["bn-IN", "Bengali (India)"],
  ["bho-IN", "Bhojpuri"],
  ["bh-IN", "Bihari"],
  ["bi-VU", "Bislama"],
  ["brx-IN", "Bodo (India)"],
  ["gax-KE", "Borana"],
  ["bs-Cyrl-BA", "Bosnian (Cyrillic script)"],
  ["bs-BA", "Bosnian (Latin script)"],
  ["br-FR", "Breton"],
  ["bug-ID", "Buginese"],
  ["bg-BG", "Bulgarian"],
  ["my-MM", "Burmese"],
  ["yue-HK", "Cantonese"],
  ["ca-ES", "Catalan (Catalonia)"],
  ["cav-ES", "Catalan (Valencia)"],
  ["ceb-PH", "Cebuano"],
  ["tzm-MA", "Central Atlas Tamazight"],
  ["ayr-BO", "Central Aymara"],
  ["knc-NG", "Central Kanuri (Latin script)"],
  ["shu-TD", "Chadian Arabic"],
  ["ch-GU", "Chamorro"],
  ["ce-RU", "Chechen (Russia)"],
  ["chr-US", "Cherokee"],
  ["hne-IN", "Chhattisgarhi"],
  ["cgg-UG", "Chiga"],
  ["zh-LA", "Chinese (Simplified, Laos)"],
  ["zh-MY", "Chinese (Simplified, Malaysia)"],
  ["zh-SG", "Chinese (Simplified, Singapore)"],
  ["zh-CN", "Chinese (Simplified, mainland China)"],
  ["zh-HK", "Chinese (Traditional, Hong Kong)"],
  ["zh-MO", "Chinese (Traditional, Macao)"],
  ["zh-TW", "Chinese (Traditional, Taiwan)"],
  ["ctg-BD", "Chittagonian"],
  ["cjk-AO", "Chokwe"],
  ["cac-GT", "Chuj"],
  ["chk-FM", "Chuukese (Micronesia)"],
  ["grc-GR", "Classical Greek"],
  ["ksh-DE", "Colognian"],
  ["zdj-KM", "Comorian Ngazidja"],
  ["cop-EG", "Coptic"],
  ["kw-GB", "Cornish"],
  ["crh-RU", "Crimean Tatar"],
  ["pov-GW", "Crioulo Upper Guinea"],
  ["hr-HR", "Croatian"],
  ["cs-CZ", "Czech"],
  ["da-DK", "Danish"],
  ["prs-AF", "Dari"],
  ["diq-TR", "Dimli"],
  ["doi-IN", "Dogri (India)"],
  ["nl-BE", "Dutch (Belgium)"],
  ["nl-NL", "Dutch (Netherlands)"],
  ["dyu-CI", "Dyula"],
  ["dz-BT", "Dzongkha"],
  ["ydd-US", "Eastern Yiddish"],
  ["vmw-MZ", "Emakhuwa"],
  ["en-AU", "English (Australia)"],
  ["en-AT", "English (Austria)"],
  ["en-BD", "English (Bangladesh)"],
  ["en-KH", "English (Cambodia)"],
  ["en-CA", "English (Canada)"],
  ["en-CZ", "English (Czech Republic)"],
  ["en-FI", "English (Finland)"],
  ["en-DE", "English (Germany)"],
  ["en-HK", "English (Hong Kong)"],
  ["en-HU", "English (Hungary)"],
  ["en-IN", "English (India)"],
  ["en-IE", "English (Ireland)"],
  ["en-JM", "English (Jamaica)"],
  ["en-LA", "English (Laos)"],
  ["en-MY", "English (Malaysia)"],
  ["en-MM", "English (Myanmar)"],
  ["en-NZ", "English (New Zealand)"],
  ["en-NO", "English (Norway)"],
  ["en-PK", "English (Pakistan)"],
  ["en-PH", "English (Philippines)"],
  ["en-SG", "English (Singapore)"],
  ["en-ZA", "English (South Africa)"],
  ["en-SE", "English (Sweden)"],
  ["en-TW", "English (Taiwan)"],
  ["en-TR", "English (Turkey)"],
  ["en-US", "English (USA)"],
  ["en-GB", "English (United Kingdom)"],
  ["eo-EU", "Esperanto"],
  ["et-EE", "Estonian"],
  ["ee-GH", "Ewe"],
  ["fn-FNG", "Fanagalo"],
  ["fo-FO", "Faroese"],
  ["fj-FJ", "Fijian"],
  ["fil-PH", "Filipino"],
  ["fi-FI", "Finnish"],
  ["fon-BJ", "Fon"],
  ["fr-BE", "French (Belgium)"],
  ["fr-CA", "French (Canada)"],
  ["fr-FR", "French (France)"],
  ["fr-LU", "French (Luxembourg)"],
  ["fr-MA", "French (Morocco)"],
  ["fr-CH", "French (Switzerland)"],
  ["fur-IT", "Friulian"],
  ["ff-FUL", "Fula"],
  ["ff-GN", "Fula (Guinea)"],
  ["gl-ES", "Galician"],
  ["grt-IN", "Garo"],
  ["ka-GE", "Georgian"],
  ["de-AT", "German (Austria)"],
  ["de-DE", "German (Germany)"],
  ["de-CH", "German (Switzerland)"],
  ["gil-KI", "Gilbertese"],
  ["glw-NG", "Glavda"],
  ["el-GR", "Greek"],
  ["gcl-GD", "Grenadian Creole English"],
  ["gn-PY", "Guarani"],
  ["gu-IN", "Gujarati"],
  ["gyn-GY", "Guyanese Creole English"],
  ["ht-HT", "Haitian Creole French"],
  ["khk-MN", "Halh Mongolian"],
  ["ha-NE", "Hausa"],
  ["haw-US", "Hawaiian"],
  ["he-IL", "Hebrew"],
  ["hig-NG", "Higi"],
  ["hil-PH", "Hiligaynon"],
  ["mrj-RU", "Hill Mari"],
  ["hi-IN", "Hindi"],
  ["hi-FJ", "Hindi (Fiji)"],
  ["hmn-CN", "Hmong"],
  ["hnj-LA", "Hmong Njua"],
  ["hoc-IN", "Ho"],
  ["hu-HU", "Hungarian"],
  ["is-IS", "Icelandic"],
  ["io-001", "Ido"],
  ["ig-NG", "Igbo"],
  ["ilo-PH", "Ilocano"],
  ["smn-FI", "Inari Sami"],
  ["id-ID", "Indonesian"],
  ["ia-001", "Interlingua"],
  ["iu-CA", "Inuktitut"],
  ["ga-IE", "Irish Gaelic"],
  ["it-IT", "Italian (Italy)"],
  ["it-CH", "Italian (Switzerland)"],
  ["jam-JM", "Jamaican Creole English"],
  ["ja-JP", "Japanese"],
  ["jv-ID", "Javanese"],
  ["kac-MM", "Jingpho"],
  ["kaj-NG", "Jju"],
  ["quc-GT", "K'iche'"],
  ["kbp-TG", "Kabiyè"],
  ["kea-CV", "Kabuverdianu"],
  ["kab-DZ", "Kabylian"],
  ["kkj-CM", "Kako"],
  ["kl-GL", "Kalaallisut (Greenland)"],
  ["kln-KE", "Kalenjin"],
  ["kam-KE", "Kamba"],
  ["kjb-GT", "Kanjobal"],
  ["kn-IN", "Kannada"],
  ["kr-KAU", "Kanuri"],
  ["kar-MM", "Karen"],
  ["kas-IN", "Kashmiri (Arabic script)"],
  ["ks-IN", "Kashmiri (Devanagari script)"],
  ["kk-KZ", "Kazakh"],
  ["kha-IN", "Khasi"],
  ["km-KH", "Khmer"],
  ["ki-KE", "Kikuyu"],
  ["kmb-AO", "Kimbundu"],
  ["rw-RW", "Kinyarwanda"],
  ["rn-BI", "Kirundi"],
  ["guz-KE", "Kisii"],
  ["kg-CG", "Kongo"],
  ["kok-IN", "Konkani"],
  ["ko-KR", "Korean"],
  ["ses-ML", "Koyraboro Senni"],
  ["ckb-IQ", "Kurdish Sorani"],
  ["ky-KG", "Kyrgyz"],
  ["lld-IT", "Ladin"],
  ["lkt-US", "Lakota"],
  ["lag-TZ", "Langi"],
  ["lo-LA", "Lao"],
  ["ltg-LV", "Latgalian"],
  ["la-VA", "Latin"],
  ["lv-LV", "Latvian"],
  ["lij-IT", "Ligurian"],
  ["li-NL", "Limburgish"],
  ["ln-CD", "Lingala"],
  ["lt-LT", "Lithuanian"],
  ["jbo-001", "Lojban"],
  ["lmo-IT", "Lombard"],
  ["dsb-DE", "Lower Sorbian"],
  ["lua-CD", "Luba-Kasai"],
  ["lg-UG", "Luganda"],
  ["luy-KE", "Luhya"],
  ["smj-SE", "Lule Sami"],
  ["luo-KE", "Luo"],
  ["lb-LU", "Luxembourgish"],
  ["mas-KE", "Maa"],
  ["ymm-SO", "Maay Maay"],
  ["mk-MK", "Macedonian"],
  ["jmc-TZ", "Machame"],
  ["mag-IN", "Magahi"],
  ["mai-IN", "Maithili"],
  ["kde-TZ", "Makonde"],
  ["mg-MG", "Malagasy"],
  ["ms-MY", "Malay"],
  ["ml-IN", "Malayalam"],
  ["dv-MV", "Maldivian"],
  ["mfi-NG", "Malgwa"],
  ["mt-MT", "Maltese"],
  ["mam-GT", "Mam"],
  ["mnk-GM", "Mandinka (Gambia)"],
  ["mfv-SN", "Mandjak (Senegal)"],
  ["mni-IN", "Manipuri"],
  ["gv-IM", "Manx Gaelic"],
  ["mi-NZ", "Maori"],
  ["mr-IN", "Marathi"],
  ["mrt-NG", "Margi"],
  ["mhr-RU", "Mari"],
  ["mh-MH", "Marshallese"],
  ["men-SL", "Mende"],
  ["mer-KE", "Meru"],
  ["mgo-CM", "Metaʼ"],
  ["nyf-KE", "Mijikenda"],
  ["min-ID", "Minangkabau"],
  ["lus-IN", "Mizo"],
  ["mo-MD", "Moldavian"],
  ["mn-MN", "Mongolian"],
  ["sr-Cyrl-ME", "Montenegrin (Cyrillic script)"],
  ["sr-ME", "Montenegrin (Latin script)"],
  ["mfe-MU", "Morisyen"],
  ["mos-BF", "Mossi"],
  ["nqo-GN", "N'Ko"],
  ["naq-NA", "Nama"],
  ["ndc-MZ", "Ndau"],
  ["ne-NP", "Nepali"],
  ["nnh-CM", "Ngiemboon"],
  ["jgo-CM", "Ngomba"],
  ["fuv-NG", "Nigerian Fulfulde"],
  ["pcm-NG", "Nigerian Pidgin"],
  ["niu-NU", "Niuean"],
  ["azj-AZ", "North Azerbaijani"],
  ["kmr-TR", "Northern Kurdish"],
  ["nd-ZW", "Northern Ndebele"],
  ["se-NO", "Northern Sami"],
  ["uzn-UZ", "Northern Uzbek"],
  ["nb-NO", "Norwegian Bokmål"],
  ["nn-NO", "Norwegian Nynorsk"],
  ["nus-SS", "Nuer"],
  ["nup-NG", "Nupe"],
  ["ny-MW", "Nyanja"],
  ["nyn-UG", "Nyankole"],
  ["oc-ES", "Occitan (Aran)"],
  ["oc-FR", "Occitan (France)"],
  ["or-IN", "Odia"],
  ["ory-IN", "Oriya"],
  ["om-ET", "Oromo (Ethiopia)"],
  ["osa-US", "Osage"],
  ["os-GE", "Ossetic"],
  ["pau-PW", "Palauan"],
  ["pi-IN", "Pali"],
  ["pag-PH", "Pangasinan"],
  ["pap-CW", "Papiamentu"],
  ["ps-PK", "Pashto"],
  ["fa-IR", "Persian"],
  ["pis-SB", "Pijin"],
  ["plt-MG", "Plateau Malagasy"],
  ["pon-FM", "Pohnpeian (Micronesia)"],
  ["pl-PL", "Polish"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["pot-US", "Potawatomi"],
  ["prg-001", "Prussian"],
  ["fuc-SN", "Pulaar (Senegal)"],
  ["pa-IN", "Punjabi (India)"],
  ["pa-PK", "Punjabi (Pakistan)"],
  ["pko-KE", "Pökoot (Kenya)"],
  ["pko-UG", "Pökoot (Uganda)"],
  ["qu-PE", "Quechua"],
  ["rhg-MM", "Rohingya"],
  ["rhl-MM", "Rohingyalish"],
  ["ro-RO", "Romanian"],
  ["roh-CH", "Romansh"],
  ["rof-TZ", "Rombo"],
  ["run-BI", "Rundi"],
  ["ru-RU", "Russian"],
  ["rwk-TZ", "Rwa"],
  ["ksw-MM", "S'gaw Karen (Myanmar)"],
  ["ssy-ER", "Saho (Eritrea)"],
  ["acf-LC", "Saint Lucian Creole French"],
  ["saq-KE", "Samburu"],
  ["sm-WS", "Samoan"],
  ["sg-CF", "Sango"],
  ["sa-IN", "Sanskrit"],
  ["sat-IN", "Santali"],
  ["sc-IT", "Sardinian"],
  ["gd-GB", "Scots Gaelic"],
  ["seh-ZW", "Sena"],
  ["sr-Cyrl-RS", "Serbian (Cyrillic script)"],
  ["sr-Latn-RS", "Serbian (Latin script)"],
  ["sh-HR", "Serbo-Croatian (Croatia)"],
  ["crs-SC", "Seselwa Creole French"],
  ["nso-ZA", "Sesotho"],
  ["ksb-TZ", "Shambala"],
  ["shn-MM", "Shan"],
  ["sn-ZW", "Shona"],
  ["ii-CN", "Sichuan Yi"],
  ["scn-IT", "Sicilian"],
  ["szl-PL", "Silesian"],
  ["sd-PK", "Sindhi"],
  ["si-LK", "Sinhala"],
  ["rmo-NL", "Sinte Romani (Netherlands)"],
  ["sms-FI", "Skolt Sami"],
  ["sk-SK", "Slovak"],
  ["sl-SI", "Slovenian"],
  ["xog-UG", "Soga"],
  ["so-SO", "Somali"],
  ["snk-ML", "Soninke (Mali)"],
  ["st-LS", "Sotho Southern"],
  ["azb-AZ", "South Azerbaijani"],
  ["sdh-IR", "Southern Kurdish"],
  ["nr-ZA", "Southern Ndebele"],
  ["pbt-PK", "Southern Pashto"],
  ["sma-SE", "Southern Sami"],
  ["dik-SS", "Southwestern Dinka"],
  ["es-AR", "Spanish (Argentina)"],
  ["es-CO", "Spanish (Colombia)"],
  ["es-DO", "Spanish (Dominican Republic)"],
  ["es-HN", "Spanish (Honduras)"],
  ["es-419", "Spanish (Latin America)"],
  ["es-MX", "Spanish (Mexico)"],
  ["es-PA", "Spanish (Panama)"],
  ["es-PE", "Spanish (Perù)"],
  ["es-PR", "Spanish (Puerto Rico)"],
  ["es-ES", "Spanish (Spain)"],
  ["es-US", "Spanish (USA)"],
  ["es-UY", "Spanish (Uruguay)"],
  ["es-VE", "Spanish (Venezuela)"],
  ["srn-SR", "Sranan Tongo"],
  ["lvs-LV", "Standard Latvian"],
  ["zsm-MY", "Standard Malay"],
  ["su-ID", "Sundanese"],
  ["sus-GN", "Susu (Guinea)"],
  ["sw-KE", "Swahili"],
  ["csw-CA", "Swampy Cree"],
  ["ss-SZ", "Swati"],
  ["sv-SE", "Swedish"],
  ["syr-SY", "Syriac"],
  ["syc-TR", "Syriac (Aramaic)"],
  ["shi-MA", "Tachelhit"],
  ["tl-PH", "Tagalog"],
  ["ty-PF", "Tahitian"],
  ["tg-TJ", "Tajik"],
  ["tmh-DZ", "Tamashek (Tuareg)"],
  ["taq-ML", "Tamasheq"],
  ["ta-IN", "Tamil (India)"],
  ["ta-LK", "Tamil (Sri Lanka)"],
  ["trv-TW", "Taroko"],
  ["tt-RU", "Tatar"],
  ["te-IN", "Telugu"],
  ["teo-UG", "Teso"],
  ["tet-TL", "Tetum"],
  ["th-TH", "Thai"],
  ["bo-CN", "Tibetan"],
  ["tig-ER", "Tigre"],
  ["ti-ET", "Tigrinya"],
  ["tiv-NG", "Tiv"],
  ["tpi-PG", "Tok Pisin"],
  ["tkl-TK", "Tokelauan"],
  ["to-TO", "Tongan"],
  ["als-AL", "Tosk Albanian"],
  ["ts-ZA", "Tsonga"],
  ["tsc-MZ", "Tswa"],
  ["tn-BW", "Tswana (Botswana)"],
  ["tn-ZA", "Tswana (South Africa)"],
  ["tum-MW", "Tumbuka"],
  ["tr-TR", "Turkish"],
  ["tk-TM", "Turkmen"],
  ["tvl-TV", "Tuvaluan"],
  ["tw-GH", "Twi"],
  ["kcg-NG", "Tyap"],
  ["udm-RU", "Udmurt"],
  ["uk-UA", "Ukrainian"],
  ["ppk-ID", "Uma"],
  ["umb-AO", "Umbundu"],
  ["hsb-DE", "Upper Sorbian"],
  ["ur-Latn-PK", "Urdu (Latin script)"],
  ["ur-PK", "Urdu (Perso-arabic script)"],
  ["ug-CN", "Uyghur"],
  ["uz-UZ", "Uzbek"],
  ["ve-ZA", "Venda"],
  ["vec-IT", "Venetian"],
  ["vi-VN", "Vietnamese"],
  ["svc-VC", "Vincentian Creole English"],
  ["vic-US", "Virgin Islands Creole English"],
  ["vo-001", "Volapük"],
  ["vun-TZ", "Vunjo"],
  ["wls-WF", "Wallisian"],
  ["wa-BE", "Walloon"],
  ["wae-CH", "Walser"],
  ["mfi-CM", "Wandala"],
  ["war-PH", "Waray"],
  ["cy-GB", "Welsh"],
  ["gaz-ET", "West Central Oromo"],
  ["vls-BE", "West Flemish"],
  ["fy-NL", "Western Frisian"],
  ["wo-SN", "Wolof"],
  ["xh-ZA", "Xhosa"],
  ["sah-RU", "Yakut"],
  ["yi-YD", "Yiddish"],
  ["yo-NG", "Yoruba"],
  ["zu-ZA", "Zulu"]
];
// Short and generic codes kept for existing LoopCAT projects and quick-pair defaults.
const LOOPCAT_SHORT_LANGUAGE_ENTRIES = [
  ["af", "Afrikaans"],
  ["am", "Amharic"],
  ["ar", "Arabic"],
  ["az", "Azerbaijani"],
  ["be", "Belarusian"],
  ["bg", "Bulgarian"],
  ["bn", "Bangla"],
  ["bs", "Bosnian"],
  ["ca", "Catalan"],
  ["cs", "Czech"],
  ["cy", "Welsh"],
  ["da", "Danish"],
  ["de", "German"],
  ["el", "Greek"],
  ["en", "English"],
  ["eo", "Esperanto"],
  ["es", "Spanish"],
  ["et", "Estonian"],
  ["eu", "Basque"],
  ["fa", "Persian"],
  ["fi", "Finnish"],
  ["fil", "Filipino"],
  ["fr", "French"],
  ["ga", "Irish"],
  ["gl", "Galician"],
  ["gu", "Gujarati"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["hr", "Croatian"],
  ["hu", "Hungarian"],
  ["hy", "Armenian"],
  ["id", "Indonesian"],
  ["is", "Icelandic"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ka", "Georgian"],
  ["kk", "Kazakh"],
  ["km", "Khmer"],
  ["kn", "Kannada"],
  ["ko", "Korean"],
  ["ku", "Kurdish"],
  ["ky", "Kyrgyz"],
  ["la", "Latin"],
  ["lo", "Lao"],
  ["lt", "Lithuanian"],
  ["lv", "Latvian"],
  ["mk", "Macedonian"],
  ["ml", "Malayalam"],
  ["mn", "Mongolian"],
  ["mr", "Marathi"],
  ["ms", "Malay"],
  ["mt", "Maltese"],
  ["my", "Burmese"],
  ["nb", "Norwegian Bokmål"],
  ["ne", "Nepali"],
  ["nl", "Dutch"],
  ["nn", "Norwegian Nynorsk"],
  ["pa", "Punjabi"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["si", "Sinhala"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["sq", "Albanian"],
  ["sr", "Serbian"],
  ["sv", "Swedish"],
  ["sw", "Swahili"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tl", "Filipino"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["ur", "Urdu"],
  ["uz", "Uzbek"],
  ["vi", "Vietnamese"],
  ["zh", "Chinese"],
  ["zh-Hans", "Simplified Chinese"],
  ["zh-Hant", "Traditional Chinese"]
];
const LANGUAGE_ENTRIES = [...LOOPCAT_LANGUAGE_CATALOG_ENTRIES, ...LOOPCAT_SHORT_LANGUAGE_ENTRIES];
const LANGUAGE_CODES = LANGUAGE_ENTRIES.map(([code]) => code);
const DEFAULT_LANGUAGE_PAIRS = [
  ["en", "tr"],
  ["ca", "tr"],
  ["es", "tr"],
  ["fr", "tr"],
  ["de", "tr"],
  ["en", "es"]
];
const LANGUAGE_ALIAS_CODES = {
  catalan: "ca",
  english: "en",
  spanish: "es",
  turkish: "tr"
};
const LOOPCAT_TEST_BUILD = window.location.hash === "#app-workflow-test";
if (LOOPCAT_TEST_BUILD) window.__loopcatTestBuild = true;
const CONFIRM_FAILURE_TEST_FLAG = Symbol("confirm-failure-test");
const CONFIRM_POST_SAVE_FAILURE_TEST_FLAG = Symbol("confirm-post-save-failure-test");
const SAVE_TM_FAILURE_TEST_FLAG = Symbol("save-tm-failure-test");
const AUTOSAVE_SAVE_FAILURE_TEST_FLAG = Symbol("autosave-save-failure-test");
const PRETRANSLATE_SAVE_FAILURE_TEST_FLAG = Symbol("pretranslate-save-failure-test");
const FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG = Symbol("flush-pending-save-failure-test");
const REPLACE_SAVE_FAILURE_TEST_FLAG = Symbol("replace-save-failure-test");
const REVIEW_METADATA_SAVE_FAILURE_TEST_FLAG = Symbol("review-metadata-save-failure-test");
const REVIEW_STATE_SAVE_FAILURE_TEST_FLAG = Symbol("review-state-save-failure-test");
const RESOURCE_TM_SAVE_FAILURE_TEST_FLAG = Symbol("resource-tm-save-failure-test");
const RESOURCE_TERM_SAVE_FAILURE_TEST_FLAG = Symbol("resource-term-save-failure-test");
const RESOURCE_TM_DELETE_FAILURE_TEST_FLAG = Symbol("resource-tm-delete-failure-test");
const RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG = Symbol("resource-term-delete-failure-test");
const TERM_FORM_SAVE_FAILURE_TEST_FLAG = Symbol("term-form-save-failure-test");
const AI_APPEND_SAVE_FAILURE_TEST_FLAG = Symbol("ai-append-save-failure-test");
const AI_APPLY_SAVE_FAILURE_TEST_FLAG = Symbol("ai-apply-save-failure-test");
const AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG = Symbol("ai-suggestion-activity-failure-test");
const PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG = Symbol("project-domain-save-failure-test");
const AI_SETTINGS_SAVE_FAILURE_TEST_FLAG = Symbol("ai-settings-save-failure-test");
const AI_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG = Symbol("ai-settings-activity-failure-test");
const OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG = Symbol("openai-key-storage-failure-test");
const QA_RUN_FAILURE_TEST_FLAG = Symbol("qa-run-failure-test");
const QA_ACTIVITY_FAILURE_TEST_FLAG = Symbol("qa-activity-failure-test");
const CONFIRM_ACTIVITY_FAILURE_TEST_FLAG = Symbol("confirm-activity-failure-test");
const SPLIT_SAVE_FAILURE_TEST_FLAG = Symbol("split-save-failure-test");
const MERGE_POST_DELETE_FAILURE_TEST_FLAG = Symbol("merge-post-delete-failure-test");
const PROJECT_DELETE_FAILURE_TEST_FLAG = Symbol("project-delete-failure-test");
const FILE_DELETE_FAILURE_TEST_FLAG = Symbol("file-delete-failure-test");
const FILE_DELETE_ACTIVITY_FAILURE_TEST_FLAG = Symbol("file-delete-activity-failure-test");
const EXPORT_ACTIVITY_FAILURE_TEST_FLAG = Symbol("export-activity-failure-test");
const IMPORT_ACTIVITY_FAILURE_TEST_FLAG = Symbol("import-activity-failure-test");
const PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG = Symbol("project-settings-activity-failure-test");
const CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG = Symbol("create-project-activity-failure-test");
const WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG = Symbol("workspace-save-activity-failure-test");
const RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS = new Set();
const editorFilterStore = appRuntime.featureFactories.createFilterStore();

const state = {
  inspectorOpen: true,
  projectAnalysisRun: 0,
  importTask: "",
  revisionHistoryFrame: 0,
  workspaceAutosaveTimer: 0,
  workspaceAutosaving: false,
  lastValidationReport: null,
  commandQuery: "",
  commandProjectId: "",
  workspaceStatus: null,
  storageDurability: { checked: false, supported: false, persisted: false, requested: false, usageBytes: 0, quotaBytes: 0 },
  workspaceDirtyProjectIds: new Set(),
  workspaceRecoveryProjectIds: new Set(),
  localAi: {
    connectionStatus: "disconnected",
    statusText: "Disconnected",
    models: [],
    progress: null,
    running: false,
    abortController: null,
    promptOutput: "",
    promptBusy: false
  }
};
const editorSessionStore = appRuntime.editorSession;
const applicationActiveSegmentService = appRuntime.featureFactories.createApplicationActiveSegmentService({
  segments: { getAll: editorSessionStore.getSegments },
  navigation: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex }
});

const els = {
  saveStatus: document.querySelector("#saveStatus"),
  updateReadyBanner: document.querySelector("#updateReadyBanner"),
  updateReadyTitle: document.querySelector("#updateReadyTitle"),
  updateReadyMessage: document.querySelector("#updateReadyMessage"),
  reloadUpdateBtn: document.querySelector("#reloadUpdateBtn"),
  deferUpdateBtn: document.querySelector("#deferUpdateBtn"),
  undoBtn: document.querySelector("#undoBtn"),
  redoBtn: document.querySelector("#redoBtn"),
  workspace: document.querySelector("#workspace"),
  brandHomeLink: document.querySelector("#brandHomeLink"),
  projectsViewBtn: document.querySelector("#projectsViewBtn"),
  resourcesViewBtn: document.querySelector("#resourcesViewBtn"),
  trashBtn: document.querySelector("#trashBtn"),
  trashDialog: document.querySelector("#trashDialog"),
  closeTrashBtn: document.querySelector("#closeTrashBtn"),
  trashList: document.querySelector("#trashList"),
  emptyTrashBtn: document.querySelector("#emptyTrashBtn"),
  aboutBtn: document.querySelector("#aboutBtn"),
  aboutDialog: document.querySelector("#aboutDialog"),
  closeAboutBtn: document.querySelector("#closeAboutBtn"),
  diagnosticsBtn: document.querySelector("#diagnosticsBtn"),
  diagnosticsDialog: document.querySelector("#diagnosticsDialog"),
  closeDiagnosticsBtn: document.querySelector("#closeDiagnosticsBtn"),
  diagnosticsSummary: document.querySelector("#diagnosticsSummary"),
  diagnosticsPreview: document.querySelector("#diagnosticsPreview"),
  diagnosticsMessage: document.querySelector("#diagnosticsMessage"),
  exportDiagnosticsBtn: document.querySelector("#exportDiagnosticsBtn"),
  diagnosticsHardwareBtn: document.querySelector("#diagnosticsHardwareBtn"),
  opusCatHelpDialog: document.querySelector("#opusCatHelpDialog"),
  closeOpusCatHelpBtn: document.querySelector("#closeOpusCatHelpBtn"),
  retryOpusCatConnectionBtn: document.querySelector("#retryOpusCatConnectionBtn"),
  tmPretranslateDialog: document.querySelector("#tmPretranslateDialog"),
  tmPretranslateThresholdInput: document.querySelector("#tmPretranslateThresholdInput"),
  workspaceMenuSummary: document.querySelector("#workspaceMenuSummary"),
  workspaceMenu: document.querySelector(".workspace-menu"),
  workspaceHealth: document.querySelector("#workspaceHealth"),
  uiLocaleSelect: document.querySelector("#uiLocaleSelect"),
  themeSelect: document.querySelector("#themeSelect"),
  densitySelect: document.querySelector("#densitySelect"),
  resetLayoutBtn: document.querySelector("#resetLayoutBtn"),
  uiLocaleImportInput: document.querySelector("#uiLocaleImportInput"),
  exportUiSourceBtn: document.querySelector("#exportUiSourceBtn"),
  workspaceRecoveryPanel: document.querySelector("#workspaceRecoveryPanel"),
  workspaceRecoveryMessage: document.querySelector("#workspaceRecoveryMessage"),
  workspaceRecoveryList: document.querySelector("#workspaceRecoveryList"),
  workspaceRecoverySaveBtn: document.querySelector("#workspaceRecoverySaveBtn"),
  workspaceRecoveryOpenBtn: document.querySelector("#workspaceRecoveryOpenBtn"),
  workspaceRecoveryDismissBtn: document.querySelector("#workspaceRecoveryDismissBtn"),
  backupReminderPanel: document.querySelector("#backupReminderPanel"),
  backupReminderMessage: document.querySelector("#backupReminderMessage"),
  backupReminderExportBtn: document.querySelector("#backupReminderExportBtn"),
  backupReminderDismissBtn: document.querySelector("#backupReminderDismissBtn"),
  chooseWorkspaceBtn: document.querySelector("#chooseWorkspaceBtn"),
  saveWorkspaceProjectBtn: document.querySelector("#saveWorkspaceProjectBtn"),
  syncWorkspaceBtn: document.querySelector("#syncWorkspaceBtn"),
  workspaceBackupBtn: document.querySelector("#workspaceBackupBtn"),
  repairWorkspaceBtn: document.querySelector("#repairWorkspaceBtn"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  projectDialog: document.querySelector("#projectDialog"),
  projectDialogTitle: document.querySelector("#projectDialogTitle"),
  projectForm: document.querySelector("#projectForm"),
  projectNameInput: document.querySelector("#projectNameInput"),
  projectDomainInput: document.querySelector("#projectDomainInput"),
  sourceLangInput: document.querySelector("#sourceLangInput"),
  targetLangInput: document.querySelector("#targetLangInput"),
  saveProjectBtn: document.querySelector("#saveProjectBtn"),
  projectAdvancedOptions: document.querySelector("#projectAdvancedOptions"),
  cancelProjectBtn: document.querySelector("#cancelProjectBtn"),
  projectCreatorInput: document.querySelector("#projectCreatorInput"),
  projectSettingsBtn: document.querySelector("#projectSettingsBtn"),
  editorProjectSettingsBtn: document.querySelector("#editorProjectSettingsBtn"),
  projectList: document.querySelector("#projectList"),
  projectsView: document.querySelector("#projectsView"),
  resourcesView: document.querySelector("#resourcesView"),
  tmResourceTab: document.querySelector("#tmResourceTab"),
  tbResourceTab: document.querySelector("#tbResourceTab"),
  tmResourcesPanel: document.querySelector("#tmResourcesPanel"),
  tbResourcesPanel: document.querySelector("#tbResourcesPanel"),
  tmResourceDashboard: document.querySelector("#tmResourceDashboard"),
  tbResourceDashboard: document.querySelector("#tbResourceDashboard"),
  tmResourceDetail: document.querySelector("#tmResourceDetail"),
  tbResourceDetail: document.querySelector("#tbResourceDetail"),
  tmResourceNameInput: document.querySelector("#tmResourceNameInput"),
  tmResourceSourceLangInput: document.querySelector("#tmResourceSourceLangInput"),
  tmResourceTargetLangInput: document.querySelector("#tmResourceTargetLangInput"),
  tbResourceNameInput: document.querySelector("#tbResourceNameInput"),
  tbResourceSourceLangInput: document.querySelector("#tbResourceSourceLangInput"),
  tbResourceTargetLangInput: document.querySelector("#tbResourceTargetLangInput"),
  resourceTmxImportInput: document.querySelector("#resourceTmxImportInput"),
  resourceTbxImportInput: document.querySelector("#resourceTbxImportInput"),
  resourceTermListImportInput: document.querySelector("#resourceTermListImportInput"),
  projectTmResourceList: document.querySelector("#projectTmResourceList"),
  projectTbResourceList: document.querySelector("#projectTbResourceList"),
  newTmNameInput: document.querySelector("#newTmNameInput"),
  newTermBaseNameInput: document.querySelector("#newTermBaseNameInput"),
  projectStorageStatus: document.querySelector("#projectStorageStatus"),
  projectChooseWorkspaceBtn: document.querySelector("#projectChooseWorkspaceBtn"),
  saveProjectToFolderInput: document.querySelector("#saveProjectToFolderInput"),
  frequentLanguagePairs: document.querySelector("#frequentLanguagePairs"),
  languageOptions: document.querySelector("#languageOptions"),
  languageCodeOptions: document.querySelector("#languageCodeOptions"),
  languageNameOptions: document.querySelector("#languageNameOptions"),
  concordanceOverlay: document.querySelector("#concordanceOverlay"),
  concordanceMeta: document.querySelector("#concordanceMeta"),
  concordanceResults: document.querySelector("#concordanceResults"),
  closeConcordanceBtn: document.querySelector("#closeConcordanceBtn"),
  projectDashboard: document.querySelector("#projectDashboard"),
  projectSearchInput: document.querySelector("#projectSearchInput"),
  projectsImportProjectBtn: document.querySelector("#projectsImportProjectBtn"),
  languagePairFilter: document.querySelector("#languagePairFilter"),
  emptyState: document.querySelector("#emptyState"),
  editorView: document.querySelector("#editorView"),
  projectHomeView: document.querySelector("#projectHomeView"),
  projectHomeTitle: document.querySelector("#projectHomeTitle"),
  projectHomeMeta: document.querySelector("#projectHomeMeta"),
  projectHomeStats: document.querySelector("#projectHomeStats"),
  projectAnalysis: document.querySelector("#projectAnalysis"),
  analysisMeta: document.querySelector("#analysisMeta"),
  validationReportPanel: document.querySelector("#validationReportPanel"),
  validationReportMeta: document.querySelector("#validationReportMeta"),
  validationReportList: document.querySelector("#validationReportList"),
  projectFileList: document.querySelector("#projectFileList"),
  fileCountText: document.querySelector("#fileCountText"),
  projectFileImportBtn: document.querySelector("#projectFileImportBtn"),
  projectFileImportInput: document.querySelector("#projectFileImportInput"),
  fileEncodingSelect: document.querySelector("#fileEncodingSelect"),
  projectPackageExportBtn: document.querySelector("#projectPackageExportBtn"),
  projectPackageImportInput: document.querySelector("#projectPackageImportInput"),
  projectHomeDeleteBtn: document.querySelector("#projectHomeDeleteBtn"),
  sidebar: document.querySelector(".sidebar"),
  projectTitle: document.querySelector("#projectTitle"),
  projectMeta: document.querySelector("#projectMeta"),
  projectInfo: document.querySelector("#projectInfo"),
  projectFilesBtn: document.querySelector("#projectFilesBtn"),
  docxInput: document.querySelector("#docxInput"),
  localizationInput: document.querySelector("#localizationInput"),
  exportDocxBtn: document.querySelector("#exportDocxBtn"),
  exportBilingualDocxBtn: document.querySelector("#exportBilingualDocxBtn"),
  exportTargetBtn: document.querySelector("#exportTargetBtn"),
  exportLocalizationBtn: document.querySelector("#exportLocalizationBtn"),
  exportXliffBtn: document.querySelector("#exportXliffBtn"),
  exportXliff22Btn: document.querySelector("#exportXliff22Btn"),
  exportProjectReportBtn: document.querySelector("#exportProjectReportBtn"),
  exportQualityPassportMenuBtn: document.querySelector("#exportQualityPassportMenuBtn"),
  exportAnonymizedProjectReportBtn: document.querySelector("#exportAnonymizedProjectReportBtn"),
  focusModeBtn: document.querySelector("#focusModeBtn"),
  inspectorToggleBtn: document.querySelector("#inspectorToggleBtn"),
  inspectorResizer: document.querySelector("#inspectorResizer"),
  exitFocusModeBtn: document.querySelector("#exitFocusModeBtn"),
  commandPaletteBtn: document.querySelector("#commandPaletteBtn"),
  commandPaletteOverlay: document.querySelector("#commandPaletteOverlay"),
  commandPaletteInput: document.querySelector("#commandPaletteInput"),
  commandPaletteResults: document.querySelector("#commandPaletteResults"),
  closeCommandPaletteBtn: document.querySelector("#closeCommandPaletteBtn"),
  documentFilter: document.querySelector("#documentFilter"),
  segmentSearchInput: document.querySelector("#segmentSearchInput"),
  segmentSearchScope: document.querySelector("#segmentSearchScope"),
  segmentRegexInput: document.querySelector("#segmentRegexInput"),
  segmentCaseInput: document.querySelector("#segmentCaseInput"),
  replaceMenu: document.querySelector("#replaceMenu"),
  replaceFindInput: document.querySelector("#replaceFindInput"),
  replaceWithInput: document.querySelector("#replaceWithInput"),
  replaceVisibleBtn: document.querySelector("#replaceVisibleBtn"),
  replaceAllBtn: document.querySelector("#replaceAllBtn"),
  segmentStatusFilter: document.querySelector("#segmentStatusFilter"),
  filterPresetSelect: document.querySelector("#filterPresetSelect"),
  reviewStateFilter: document.querySelector("#reviewStateFilter"),
  aiSegmentFilter: document.querySelector("#aiSegmentFilter"),
  copySourceBtn: document.querySelector("#copySourceBtn"),
  nextOpenBtn: document.querySelector("#nextOpenBtn"),
  splitSegmentBtn: document.querySelector("#splitSegmentBtn"),
  mergeNextBtn: document.querySelector("#mergeNextBtn"),
  runQaBtn: document.querySelector("#runQaBtn"),
  segmentGridWrap: document.querySelector(".segment-grid-wrap"),
  segmentBody: document.querySelector("#segmentBody"),
  rowTemplate: document.querySelector("#segmentRowTemplate"),
  confirmBtn: document.querySelector("#confirmBtn"),
  saveTmBtn: document.querySelector("#saveTmBtn"),
  pretranslateBtn: document.querySelector("#pretranslateBtn"),
  segmentToolsMenuSummary: document.querySelector("#segmentToolsMenuSummary"),
  tmMatches: document.querySelector("#tmMatches"),
  termSuggestions: document.querySelector("#termSuggestions"),
  progressText: document.querySelector("#progressText"),
  wordCountText: document.querySelector("#wordCountText"),
  progressFill: document.querySelector("#progressFill"),
  termForm: document.querySelector("#termForm"),
  termBaseSelect: document.querySelector("#termBaseSelect"),
  sourceTermInput: document.querySelector("#sourceTermInput"),
  targetTermInput: document.querySelector("#targetTermInput"),
  termNotesInput: document.querySelector("#termNotesInput"),
  termForbiddenInput: document.querySelector("#termForbiddenInput"),
  domainForm: document.querySelector("#domainForm"),
  projectDomainEditInput: document.querySelector("#projectDomainEditInput"),
  revisionHistoryList: document.querySelector("#revisionHistoryList"),
  reviewForm: document.querySelector("#reviewForm"),
  reviewStateSelect: document.querySelector("#reviewStateSelect"),
  reviewNoteInput: document.querySelector("#reviewNoteInput"),
  reviewCommentInput: document.querySelector("#reviewCommentInput"),
  reviewCommentsList: document.querySelector("#reviewCommentsList"),
  qualityForm: document.querySelector("#qualityForm"),
  qualityStandardSelect: document.querySelector("#qualityStandardSelect"),
  qualityReviewDepthSelect: document.querySelector("#qualityReviewDepthSelect"),
  qualityRiskToleranceSelect: document.querySelector("#qualityRiskToleranceSelect"),
  qualityTerminologyStrictnessSelect: document.querySelector("#qualityTerminologyStrictnessSelect"),
  qualityAiDisclosureSelect: document.querySelector("#qualityAiDisclosureSelect"),
  qualityAudienceInput: document.querySelector("#qualityAudienceInput"),
  qualityToneInput: document.querySelector("#qualityToneInput"),
  qualitySummary: document.querySelector("#qualitySummary"),
  qualityActiveEvidence: document.querySelector("#qualityActiveEvidence"),
  qualityDecisionForm: document.querySelector("#qualityDecisionForm"),
  qualityIssueCategorySelect: document.querySelector("#qualityIssueCategorySelect"),
  qualityIssueSeveritySelect: document.querySelector("#qualityIssueSeveritySelect"),
  qualityDecisionNoteInput: document.querySelector("#qualityDecisionNoteInput"),
  saveQualityDecisionBtn: document.querySelector("#saveQualityDecisionBtn"),
  refreshQualityRiskBtn: document.querySelector("#refreshQualityRiskBtn"),
  nextQualityRiskBtn: document.querySelector("#nextQualityRiskBtn"),
  exportQualityPassportBtn: document.querySelector("#exportQualityPassportBtn"),
  qualityRiskList: document.querySelector("#qualityRiskList"),
  aiSettingsForm: document.querySelector("#aiSettingsForm"),
  saveAiSettingsBtn: document.querySelector("#saveAiSettingsBtn"),
  projectAiOptions: document.querySelector("#projectAiOptions"),
  projectAiSettingsMount: document.querySelector("#projectAiSettingsMount"),
  openProjectAiSettingsBtn: document.querySelector("#openProjectAiSettingsBtn"),
  contextualAiStatus: document.querySelector("#contextualAiStatus"),
  contextualAiTranslateBtn: document.querySelector("#contextualAiTranslateBtn"),
  contextualAiReviewBtn: document.querySelector("#contextualAiReviewBtn"),
  contextualAiRepairBtn: document.querySelector("#contextualAiRepairBtn"),
  contextualAiPolishBtn: document.querySelector("#contextualAiPolishBtn"),
  contextualAiVariantsBtn: document.querySelector("#contextualAiVariantsBtn"),
  contextualAiApplyTermsBtn: document.querySelector("#contextualAiApplyTermsBtn"),
  contextualOpenAiSuggestionBtn: document.querySelector("#contextualOpenAiSuggestionBtn"),
  contextualAiCancelBtn: document.querySelector("#contextualAiCancelBtn"),
  contextualAiSuggestionMount: document.querySelector("#contextualAiSuggestionMount"),
  contextualAiOutputMount: document.querySelector("#contextualAiOutputMount"),
  aiEnabledInput: document.querySelector("#aiEnabledInput"),
  aiProviderInput: document.querySelector("#aiProviderInput"),
  aiModelInput: document.querySelector("#aiModelInput"),
  openAiApiKeyInput: document.querySelector("#openAiApiKeyInput"),
  rememberOpenAiKeyInput: document.querySelector("#rememberOpenAiKeyInput"),
  clearOpenAiKeyBtn: document.querySelector("#clearOpenAiKeyBtn"),
  aiConnectionStatus: document.querySelector("#aiConnectionStatus"),
  aiSendSourceInput: document.querySelector("#aiSendSourceInput"),
  aiUseTmInput: document.querySelector("#aiUseTmInput"),
  aiUseTbInput: document.querySelector("#aiUseTbInput"),
  aiStyleGuideInput: document.querySelector("#aiStyleGuideInput"),
  localAiProjectBriefBtn: document.querySelector("#localAiProjectBriefBtn"),
  openAiSuggestionBtn: document.querySelector("#openAiSuggestionBtn"),
  aiSuggestionList: document.querySelector("#aiSuggestionList"),
  localAiPrivacyNote: document.querySelector("#localAiPrivacyNote"),
  localAiPresetSelect: document.querySelector("#localAiPresetSelect"),
  localAiProviderSelect: document.querySelector("#localAiProviderSelect"),
  localAiBaseUrlInput: document.querySelector("#localAiBaseUrlInput"),
  localAiLocalCloudPresetBtn: document.querySelector("#localAiLocalCloudPresetBtn"),
  localAiCloudPresetBtn: document.querySelector("#localAiCloudPresetBtn"),
  localAiStatus: document.querySelector("#localAiStatus"),
  localAiStatusText: document.querySelector("#localAiStatusText"),
  localAiProviderSummary: document.querySelector("#localAiProviderSummary"),
  localAiHostedKeyControls: document.querySelector("#localAiHostedKeyControls"),
  localAiApiKeyInput: document.querySelector("#localAiApiKeyInput"),
  rememberLocalAiKeyInput: document.querySelector("#rememberLocalAiKeyInput"),
  clearLocalAiKeyBtn: document.querySelector("#clearLocalAiKeyBtn"),
  localAiTestBtn: document.querySelector("#localAiTestBtn"),
  localAiStartLmStudioBtn: document.querySelector("#localAiStartLmStudioBtn"),
  localAiRefreshModelsBtn: document.querySelector("#localAiRefreshModelsBtn"),
  localAiOpusCatHelpBtn: document.querySelector("#localAiOpusCatHelpBtn"),
  localAiModelSelect: document.querySelector("#localAiModelSelect"),
  localAiModelInput: document.querySelector("#localAiModelInput"),
  localAiPullModelWrap: document.querySelector("#localAiPullModelWrap"),
  localAiPullModelBtn: document.querySelector("#localAiPullModelBtn"),
  localAiSourceLangInput: document.querySelector("#localAiSourceLangInput"),
  localAiSourceCodeInput: document.querySelector("#localAiSourceCodeInput"),
  localAiTargetLangInput: document.querySelector("#localAiTargetLangInput"),
  localAiTargetCodeInput: document.querySelector("#localAiTargetCodeInput"),
  localAiModeSelect: document.querySelector("#localAiModeSelect"),
  localAiConcurrencyInput: document.querySelector("#localAiConcurrencyInput"),
  localAiTimeoutInput: document.querySelector("#localAiTimeoutInput"),
  localAiOverwriteInput: document.querySelector("#localAiOverwriteInput"),
  localAiIncludeContextInput: document.querySelector("#localAiIncludeContextInput"),
  localAiPreserveConfirmedInput: document.querySelector("#localAiPreserveConfirmedInput"),
  localAiPretranslateBtn: document.querySelector("#localAiPretranslateBtn"),
  localAiCancelBtn: document.querySelector("#localAiCancelBtn"),
  localAiProgress: document.querySelector("#localAiProgress"),
  localAiPromptModeSelect: document.querySelector("#localAiPromptModeSelect"),
  localAiSampleInput: document.querySelector("#localAiSampleInput"),
  localAiPromptPreview: document.querySelector("#localAiPromptPreview"),
  localAiPromptTestBtn: document.querySelector("#localAiPromptTestBtn"),
  localAiReviewSegmentBtn: document.querySelector("#localAiReviewSegmentBtn"),
  localAiReviewBatchBtn: document.querySelector("#localAiReviewBatchBtn"),
  localAiRepairTagsBtn: document.querySelector("#localAiRepairTagsBtn"),
  localAiRepairTagsBatchBtn: document.querySelector("#localAiRepairTagsBatchBtn"),
  localAiPolishDraftBtn: document.querySelector("#localAiPolishDraftBtn"),
  localAiPolishBatchBtn: document.querySelector("#localAiPolishBatchBtn"),
  localAiAdaptModeSelect: document.querySelector("#localAiAdaptModeSelect"),
  localAiAdaptDraftBtn: document.querySelector("#localAiAdaptDraftBtn"),
  localAiAdaptBatchBtn: document.querySelector("#localAiAdaptBatchBtn"),
  localAiVariantModeSelect: document.querySelector("#localAiVariantModeSelect"),
  localAiSuggestVariantsBtn: document.querySelector("#localAiSuggestVariantsBtn"),
  localAiSuggestVariantsBatchBtn: document.querySelector("#localAiSuggestVariantsBatchBtn"),
  localAiApplyTermsBtn: document.querySelector("#localAiApplyTermsBtn"),
  localAiApplyTermsBatchBtn: document.querySelector("#localAiApplyTermsBatchBtn"),
  localAiExtractTermsBtn: document.querySelector("#localAiExtractTermsBtn"),
  localAiExtractTermsBatchBtn: document.querySelector("#localAiExtractTermsBatchBtn"),
  localAiOutputDrawer: document.querySelector("#localAiOutputDrawer"),
  localAiPromptOutput: document.querySelector("#localAiPromptOutput"),
  qaResults: document.querySelector("#qaResults"),
  tmxImportInput: document.querySelector("#tmxImportInput"),
  tmxExportBtn: document.querySelector("#tmxExportBtn"),
  tbxImportInput: document.querySelector("#tbxImportInput"),
  termListImportInput: document.querySelector("#termListImportInput"),
  tbxExportBtn: document.querySelector("#tbxExportBtn"),
  backupImportInput: document.querySelector("#backupImportInput"),
  backupExportBtn: document.querySelector("#backupExportBtn")
};

const applicationSaveStatusController =
  appRuntime.featureFactories.createApplicationSaveStatusController({
    redaction: { sanitize: applicationTextSafetyService.redactSensitiveText },
    model: { publish: (record) => appRuntime?.status?.controller?.fromLegacy?.(record) },
    context: {
      getProjectId: () => editorSessionStore.getProject()?.id || null,
      getSegmentId: () => applicationStore.getState().navigation.segmentId
    },
    localization: {
      source: (value) => uiLocalizationService.source(value),
      translate: (key) => uiLocalizationService.translate(key)
    },
    view: {
      setText: (value) => {
        els.saveStatus.textContent = value;
      },
      setClass: (value) => {
        els.saveStatus.className = value;
      },
      setBusy: (value) => els.saveStatus.setAttribute("aria-busy", value)
    },
    timers: {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: (timer) => clearTimeout(timer)
    }
  });
const applicationCommandHistoryController =
  appRuntime.featureFactories.createApplicationCommandHistoryController({
    controls: { undo: els.undoBtn, redo: els.redoBtn },
    context: {
      getProjectId: () => state.commandProjectId || editorSessionStore.getProject()?.id || null,
      getView: () => applicationStore.getState().navigation.view
    },
    commands: {
      canUndo: (projectId) => appRuntime?.commands?.bus?.canUndo?.(projectId),
      canRedo: (projectId) => appRuntime?.commands?.bus?.canRedo?.(projectId),
      undo: (projectId) => appRuntime?.commands?.bus?.undo?.(projectId),
      redo: (projectId) => appRuntime?.commands?.bus?.redo?.(projectId)
    },
    edits: {
      finalizeProject: (projectId) => targetEditController.finalizeProject(projectId),
      finalizeAll: () => targetEditController.finalizeAll(),
      focusActive: (selection) => targetEditController.focusActive(selection)
    },
    session: editorSessionStore,
    projects: {
      load: (selectFirst) => loadProjects(selectFirst),
      open: (projectId) => openProject(projectId),
      readSegments: (projectId) => getProjectSegments(projectId),
      prepareHistories: (segments) => segmentTargetStateService.prepareHistories(segments)
    },
    navigation: {
      getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
      selectSegment: (selection) => applicationNavigation.selectSegment(selection),
      clearSelection: () => applicationNavigation.clearSelection(),
      showProjects: () => applicationViewController.show("projects")
    },
    resources: {
      markLinkedDirty: (type, name, sourceLang, targetLang) =>
        markProjectsUsingResourceDirty(type, name, sourceLang, targetLang),
      refreshResources: () => refreshResources(),
      refreshTerms: (options) => refreshProjectTerms(options),
      refreshSuggestions: () => termSuggestionsController.refresh(),
      refreshEditorContext: () => editorContextController.refresh()
    },
    trash: {
      isOpen: () => Boolean(els.trashDialog?.open),
      renderList: () => applicationTrashController.renderList(),
      renderSummary: () => applicationTrashController.renderSummary()
    },
    presentation: { renderAll: () => renderAll() },
    status: { set: applicationSaveStatusController.set }
  });
const applicationTrashController = appRuntime.featureFactories.createApplicationTrashController({
  elements: {
    summaryButton: els.trashBtn,
    list: els.trashList,
    emptyButton: els.emptyTrashBtn
  },
  repository: appRuntime?.trashRepository,
  projects: { load: (selectFirst) => loadProjects(selectFirst) },
  commandHistory: {
    synchronize: applicationCommandHistoryController.synchronize,
    render: applicationCommandHistoryController.render
  },
  dialog: { open: () => dialogLifecycleController?.open?.("trash") || false },
  localization: {
    source: (value, variables) => uiLocalizationService.source(value, variables),
    confirm: (value) => uiLocalizationService.confirm(value)
  },
  text: { safe: applicationTextSafetyService.displaySafeText },
  date: { format: (value) => formatDate(value) },
  dom: {
    createElement: (tagName) => document.createElement(tagName),
    createFragment: () => document.createDocumentFragment()
  },
  status: { set: applicationSaveStatusController.set }
});
const applicationImportProgressController =
  appRuntime.featureFactories.createApplicationImportProgressController({
    context: {
      getTask: () => state.importTask,
      getWorkspaceStatus: () => state.workspaceStatus
    },
    presentation: {
      renderImportBusy: (busy) => importExportController?.renderBusy?.(busy),
      renderRecoveryBusy: (viewModel) => recoveryWorkspaceController?.renderBusy?.(viewModel)
    },
    status: { set: applicationSaveStatusController.set },
    schedulers: {
      hasFrame: () => typeof requestAnimationFrame === "function",
      frame: (callback) => requestAnimationFrame(callback),
      timer: (callback, delay) => setTimeout(callback, delay)
    }
  });
const applicationStorageDurabilityController =
  appRuntime.featureFactories.createApplicationStorageDurabilityController({
    context: {
      get: () => state.storageDurability,
      set: (value) => {
        state.storageDurability = value;
      }
    },
    storage: {
      getApi: () => (typeof navigator === "undefined" ? null : navigator.storage)
    },
    formatting: { fileSize: applicationImportProgressController.formatFileSize },
    presentation: { renderWorkspaceStatus: () => renderWorkspaceStatus() },
    limits: {
      lowSpaceBytes: STORAGE_LOW_SPACE_BYTES,
      highUsageRatio: STORAGE_HIGH_USAGE_RATIO
    }
  });
const applicationDownloadController = appRuntime.featureFactories.createApplicationDownloadController({
  redaction: { sanitize: applicationTextSafetyService.redactSensitiveText },
  blobs: { create: (parts, options) => new Blob(parts, options) },
  urls: {
    create: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url)
  },
  dom: {
    createLink: () => document.createElement("a"),
    append: (link) => document.body.append(link)
  },
  scheduler: { timer: (callback, delay) => setTimeout(callback, delay) }
});

const revisionHistoryPresentationService =
  appRuntime.featureFactories.createRevisionHistoryPresentationService({
    list: els.revisionHistoryList,
    getSegment: applicationActiveSegmentService.get,
    localization: uiLocalizationService,
    statusLabel: segmentStatusLabel,
    formatDateTime,
    escapeHtml: applicationTextSafetyService.escapeHtml,
    replaceSafeHtml
  });

const languageInputService = appRuntime.featureFactories.createLanguageInputService({
  entries: LANGUAGE_ENTRIES,
  aliases: LANGUAGE_ALIAS_CODES,
  redact: applicationTextSafetyService.redactSensitiveText,
  localization: uiLocalizationService,
  getLocale: () => uiI18n?.getLocale?.() || "",
  getNavigatorLanguage: () => navigator.language || "en",
  intl: Intl,
  datalists: {
    labels: els.languageOptions,
    codes: els.languageCodeOptions,
    names: els.languageNameOptions
  },
  escapeHtml: applicationTextSafetyService.escapeHtml,
  replaceSafeHtml
});

const textEncodingInputService = appRuntime.featureFactories.createTextEncodingInputService({
  select: els.fileEncodingSelect,
  getOptions: () => encodingApi.TEXT_ENCODING_OPTIONS,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  replaceSafeHtml
});

const fileImportService = appRuntime.featureFactories.createFileImportService({
  encoding: {
    api: encodingApi,
    decodingOptions: textEncodingInputService.decodingOptions
  },
  limits: { portableJsonBytes: MAX_PORTABLE_JSON_BYTES },
  task: {
    get: () => state.importTask,
    set: (value) => {
      state.importTask = value;
    }
  },
  text: { lower: applicationTextSafetyService.stableLower },
  presentation: {
    renderBusy: applicationImportProgressController.renderBusy,
    renderValidation: renderValidationReport
  },
  status: { set: applicationSaveStatusController.set },
  durability: { refresh: applicationStorageDurabilityController.refresh }
});

const protectedTagInspectionService = appRuntime.featureFactories.createProtectedTagInspectionService({
  detectTags: detectProtectedTags
});

const protectedTextReplacementService = appRuntime.featureFactories.createProtectedTextReplacementService({
  detectTags: detectProtectedTags,
  normalizeCase: applicationTextSafetyService.stableLower
});

const segmentProvenanceService = appRuntime.featureFactories.createSegmentProvenanceService({
  localization: uiLocalizationService
});

const segmentFilterService = appRuntime.featureFactories.createSegmentFilterService({
  getSegments: () => editorSessionStore.getSegments(),
  getFilters: () => editorFilterStore.getState(),
  getDocumentId: () => applicationStore.getState().navigation.documentId,
  normalizeCase: applicationTextSafetyService.stableLower,
  provenance: segmentProvenanceService
});

const segmentProgressService = appRuntime.featureFactories.createSegmentProgressService({
  getSegments: () => editorSessionStore.getSegments(),
  getProjectId: () => editorSessionStore.getProject()?.id || "",
  getCachedSummary: () => editorSessionStore.getProgressSummary(),
  replaceCachedSummary: (summary) => editorSessionStore.replaceProgressSummary(summary)
});

const segmentTargetStateService = appRuntime.featureFactories.createSegmentTargetStateService({
  getSegments: () => editorSessionStore.getSegments(),
  createId: makeId,
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
  clone: structuredClone,
  invalidateFilters: segmentFilterService.invalidate
});

const segmentConfirmationStateService =
  appRuntime.featureFactories.createSegmentConfirmationStateService({
    targetState: segmentTargetStateService,
    now: () => new Date().toISOString()
  });

const tmMatchesController = appRuntime.featureFactories.createTmMatchesController({
  root: els.tmMatches,
  session: {
    getProject: editorSessionStore.getProject,
    getActiveSegment: applicationActiveSegmentService.get
  },
  tm: {
    getNames: projectTmNames,
    findMatches: findProjectTmMatches
  },
  localization: uiLocalizationService,
  text: { escapeHtml: applicationTextSafetyService.escapeHtml },
  safeHtml: { replace: replaceSafeHtml },
  target: { insert: (...args) => targetProducerController.insertTmTarget(...args) },
  dom: {
    createElement: (tagName) => document.createElement(tagName),
    createFragment: () => document.createDocumentFragment()
  }
});

const termSuggestionsController = appRuntime.featureFactories.createTermSuggestionsController({
  root: els.termSuggestions,
  session: {
    getProject: editorSessionStore.getProject,
    getActiveSegment: applicationActiveSegmentService.get
  },
  terms: {
    getNames: projectTermBaseNames,
    find: findTerms
  },
  localization: uiLocalizationService,
  text: { escapeHtml: applicationTextSafetyService.escapeHtml },
  safeHtml: { replace: replaceSafeHtml },
  mutation: { deleteTerm: (...args) => resourceMutationController.deleteTerm(...args) },
  dom: {
    createElement: (tagName) => document.createElement(tagName),
    createFragment: () => document.createDocumentFragment()
  }
});

const termFormController = appRuntime.featureFactories.createTermFormController({
  elements: {
    form: els.termForm,
    source: els.sourceTermInput,
    target: els.targetTermInput,
    notes: els.termNotesInput,
    termbase: els.termBaseSelect,
    forbidden: els.termForbiddenInput
  },
  session: { getProject: editorSessionStore.getProject },
  resources: {
    primaryName: primaryTermBaseName,
    markProjectsUsingDirty: markProjectsUsingResourceDirty
  },
  repository: { save: saveTerm },
  presentation: {
    renderTermbaseSelect,
    refreshProjectTerms: (options) => refreshProjectTerms(options),
    refreshSuggestions: termSuggestionsController.refresh
  },
  status: { set: applicationSaveStatusController.set },
  logger: console,
  testHooks: {
    beforeSave: () => {
      if (LOOPCAT_TEST_BUILD && els.termForm[TERM_FORM_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated term form save failure");
      }
    }
  }
});

const projectDomainController = appRuntime.featureFactories.createProjectDomainController({
  elements: { form: els.domainForm, input: els.projectDomainEditInput },
  session: {
    getProject: editorSessionStore.getProject,
    getProjects: editorSessionStore.getProjects,
    replaceProject: editorSessionStore.replaceProject,
    replaceProjects: editorSessionStore.replaceProjects
  },
  repository: { update: updateProject },
  presentation: { refreshSummaries: refreshProjectSummaries, renderAll },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  clone: structuredClone,
  testHooks: {
    beforeSave: () => {
      if (LOOPCAT_TEST_BUILD && editorSessionStore.getProject()[PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated project domain save failure");
      }
    }
  }
});

const segmentTmSaveController = appRuntime.featureFactories.createSegmentTmSaveController({
  session: { getProject: editorSessionStore.getProject },
  selection: { getActiveSegment: applicationActiveSegmentService.get },
  tm: { saveEntry: saveTmEntry, mainName: mainTmName, refreshMatches: tmMatchesController.refresh },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  testHooks: {
    beforeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[SAVE_TM_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated TM save failure");
      }
    }
  }
});

const projectLanguageContextController = appRuntime.featureFactories.createProjectLanguageContextController({
  getProject: () => editorSessionStore.getProject(),
  languageInput: languageInputService,
  getDesktop: () => window.LoopCATDesktop,
  warn: (...args) => console.warn(...args)
});

const projectDocumentCatalogService = appRuntime.featureFactories.createProjectDocumentCatalogService({
  getProject: () => editorSessionStore.getProject(),
  getManifest: projectDocumentManifest,
  getSegments: () => editorSessionStore.getSegments(),
  getSelectedDocumentId: () => applicationStore.getState().navigation.documentId,
  normalizeType: applicationTextSafetyService.stableLower
});

const projectDocumentStatisticsService = appRuntime.featureFactories.createProjectDocumentStatisticsService({
  getDocuments: projectDocumentCatalogService.list,
  getSegments: () => editorSessionStore.getSegments(),
  sourceWordCount: segmentProgressService.sourceWordCount
});

const aiContextController = appRuntime?.featureFactories?.createAiContextController?.({
  adminSection: els.aiSettingsForm,
  adminMount: els.projectAiSettingsMount,
  suggestionList: els.aiSuggestionList,
  suggestionMount: els.contextualAiSuggestionMount,
  outputDrawer: els.localAiOutputDrawer,
  outputMount: els.contextualAiOutputMount,
  providerStatusText: els.localAiStatusText,
  contextualStatus: els.contextualAiStatus
});
aiContextController?.mount?.();

const aiAdministrationController = appRuntime?.featureFactories?.createAiAdministrationController?.({
  elements: {
    saveSettingsButton: els.saveAiSettingsBtn,
    aiEnabledInput: els.aiEnabledInput,
    aiProviderInput: els.aiProviderInput,
    aiModelInput: els.aiModelInput,
    openAiApiKeyInput: els.openAiApiKeyInput,
    rememberOpenAiKeyInput: els.rememberOpenAiKeyInput,
    clearOpenAiKeyButton: els.clearOpenAiKeyBtn,
    aiConnectionStatus: els.aiConnectionStatus,
    aiSendSourceInput: els.aiSendSourceInput,
    aiUseTmInput: els.aiUseTmInput,
    aiUseTbInput: els.aiUseTbInput,
    aiStyleGuideInput: els.aiStyleGuideInput,
    contextualTranslateButton: els.contextualAiTranslateBtn,
    contextualReviewButton: els.contextualAiReviewBtn,
    contextualRepairButton: els.contextualAiRepairBtn,
    contextualPolishButton: els.contextualAiPolishBtn,
    contextualVariantsButton: els.contextualAiVariantsBtn,
    contextualApplyTermsButton: els.contextualAiApplyTermsBtn,
    contextualOpenAiButton: els.contextualOpenAiSuggestionBtn,
    contextualCancelButton: els.contextualAiCancelBtn,
    openAiSuggestionButton: els.openAiSuggestionBtn,
    privacyNote: els.localAiPrivacyNote,
    providerPresetSelect: els.localAiPresetSelect,
    providerSelect: els.localAiProviderSelect,
    baseUrlInput: els.localAiBaseUrlInput,
    localCloudPresetButton: els.localAiLocalCloudPresetBtn,
    cloudPresetButton: els.localAiCloudPresetBtn,
    status: els.localAiStatus,
    statusText: els.localAiStatusText,
    providerSummary: els.localAiProviderSummary,
    hostedKeyControls: els.localAiHostedKeyControls,
    localAiApiKeyInput: els.localAiApiKeyInput,
    rememberLocalAiKeyInput: els.rememberLocalAiKeyInput,
    clearLocalAiKeyButton: els.clearLocalAiKeyBtn,
    testConnectionButton: els.localAiTestBtn,
    startLmStudioButton: els.localAiStartLmStudioBtn,
    refreshModelsButton: els.localAiRefreshModelsBtn,
    modelSelect: els.localAiModelSelect,
    modelInput: els.localAiModelInput,
    pullModelWrap: els.localAiPullModelWrap,
    pullModelButton: els.localAiPullModelBtn,
    sourceLanguageInput: els.localAiSourceLangInput,
    sourceCodeInput: els.localAiSourceCodeInput,
    targetLanguageInput: els.localAiTargetLangInput,
    targetCodeInput: els.localAiTargetCodeInput,
    modeSelect: els.localAiModeSelect,
    concurrencyInput: els.localAiConcurrencyInput,
    timeoutInput: els.localAiTimeoutInput,
    overwriteInput: els.localAiOverwriteInput,
    includeContextInput: els.localAiIncludeContextInput,
    preserveConfirmedInput: els.localAiPreserveConfirmedInput,
    pretranslateButton: els.localAiPretranslateBtn,
    cancelButton: els.localAiCancelBtn,
    progress: els.localAiProgress,
    promptModeSelect: els.localAiPromptModeSelect,
    sampleInput: els.localAiSampleInput,
    promptPreview: els.localAiPromptPreview,
    promptTestButton: els.localAiPromptTestBtn,
    reviewSegmentButton: els.localAiReviewSegmentBtn,
    reviewBatchButton: els.localAiReviewBatchBtn,
    repairSegmentButton: els.localAiRepairTagsBtn,
    repairBatchButton: els.localAiRepairTagsBatchBtn,
    polishSegmentButton: els.localAiPolishDraftBtn,
    polishBatchButton: els.localAiPolishBatchBtn,
    adaptModeSelect: els.localAiAdaptModeSelect,
    adaptSegmentButton: els.localAiAdaptDraftBtn,
    adaptBatchButton: els.localAiAdaptBatchBtn,
    variantModeSelect: els.localAiVariantModeSelect,
    variantsSegmentButton: els.localAiSuggestVariantsBtn,
    variantsBatchButton: els.localAiSuggestVariantsBatchBtn,
    applyTermsSegmentButton: els.localAiApplyTermsBtn,
    applyTermsBatchButton: els.localAiApplyTermsBatchBtn,
    extractTermsSegmentButton: els.localAiExtractTermsBtn,
    extractTermsBatchButton: els.localAiExtractTermsBatchBtn,
    projectBriefButton: els.localAiProjectBriefBtn,
    outputDrawer: els.localAiOutputDrawer,
    promptOutput: els.localAiPromptOutput
  },
  actions: {
    saveSettings: (...args) => aiSettingsPersistenceController.save(...args),
    contextualTranslate: (...args) => aiPretranslationController.pretranslate(...args),
    reviewSegment: (...args) => aiReviewController.reviewActive(...args),
    repairSegment: (...args) => aiTagRepairController.repairActive(...args),
    polishSegment: (...args) => aiDraftEditingController.polishActive(...args),
    variantsSegment: (...args) => aiAlternativesController.suggestActive(...args),
    applyTermsSegment: (...args) => aiTerminologyApplicationController.applyActive(...args),
    openAiSuggestion: (...args) => aiOpenAiSuggestionController.create(...args),
    cancel: (...args) => aiCommandLifecycleCoordinator.cancel(...args),
    testConnection: (...args) => aiProviderAdministrationOperationsController.testConnection(...args),
    startLmStudio: (...args) => aiProviderAdministrationOperationsController.startServerAndTest(...args),
    refreshModels: (...args) => aiProviderAdministrationOperationsController.refreshModels(...args),
    pullModel: (...args) => aiProviderAdministrationOperationsController.pullModel(...args),
    promptTest: (...args) => aiPromptTestController.testPrompt(...args),
    reviewBatch: (...args) => aiReviewController.reviewBatch(...args),
    repairBatch: (...args) => aiTagRepairController.repairBatch(...args),
    polishBatch: (...args) => aiDraftEditingController.polishBatch(...args),
    adaptSegment: (...args) => aiDraftEditingController.adaptActive(...args),
    adaptBatch: (...args) => aiDraftEditingController.adaptBatch(...args),
    variantsBatch: (...args) => aiAlternativesController.suggestBatch(...args),
    applyTermsBatch: (...args) => aiTerminologyApplicationController.applyBatch(...args),
    extractTermsSegment: (...args) => aiTerminologyExtractionController.extractActive(...args),
    extractTermsBatch: (...args) => aiTerminologyExtractionController.extractBatch(...args),
    pretranslate: (...args) => aiPretranslationController.pretranslate(...args),
    projectBrief: (...args) => aiProjectBriefController.generate(...args),
    presetChange: (...args) => aiProviderFormController.handlePresetChange(...args),
    providerChange: (...args) => aiProviderFormController.handleProviderChange(...args),
    baseUrlInput: (...args) => aiProviderFormController.handleBaseUrlInput(...args),
    clearLocalKey: (...args) => aiProviderFormController.handleClearLocalKey(...args),
    clearOpenAiKey: (...args) => aiProviderFormController.handleClearOpenAiKey(...args),
    formChanged: (...args) => aiProviderFormController.handleFormChanged(...args),
    languageChanged: (...args) => aiProviderFormController.handleLanguageChanged(...args)
  },
  source: uiLocalizationService.source,
  onError: (error) => applicationSaveStatusController.set(error?.message || "AI action failed.", "dirty")
});
aiAdministrationController?.mount?.();

const verticalFeatureState = (() => {
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "creating vertical feature controllers";
  const factories = appRuntime?.featureFactories;
  if (!factories) return null;
  return Object.freeze({
    dashboard: factories.createDashboardController({ root: els.projectHomeView }),
    editor: factories.createEditorController({
      workspace: els.workspace,
      sidebar: els.sidebar,
      projectsView: els.projectsView,
      resourcesView: els.resourcesView,
      dashboardView: els.projectHomeView,
      emptyView: els.emptyState,
      editorView: els.editorView
    }),
    filters: editorFilterStore,
    inspector: factories.createInspectorController({
      root: els.sidebar,
      preferencesRepository: appRuntime.preferencesRepository
    }),
    projects: factories.createProjectsController({ root: els.projectDashboard }),
    segmentGrid: factories.createSegmentGridController({
      navigation: applicationNavigation,
      viewport: els.segmentGridWrap,
      rowHeight: SEGMENT_ROW_HEIGHT,
      rowBuffer: SEGMENT_ROW_BUFFER,
      requestFrame: requestAnimationFrame
    })
  });
})();
verticalFeatureState?.inspector?.mount?.();

let targetEditController = null;
let segmentNavigationController = null;
const autosaveService = appRuntime.featureFactories.createAutosaveService({
  editorSessionStore,
  repository: {
    save: saveSegment,
    saveMany: saveSegments
  },
  editLifecycle: {
    finalize: (segmentId) => targetEditController?.finalize?.(segmentId),
    finalizeProject: (projectId) => targetEditController?.finalizeProject?.(projectId) || [],
    finalizeAll: () => targetEditController?.finalizeAll?.() || []
  },
  status: { set: applicationSaveStatusController.set },
  onSaved: revisionHistoryPresentationService.render,
  testHooks: {
    beforeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[AUTOSAVE_SAVE_FAILURE_TEST_FLAG]) {
        Reflect.deleteProperty(segment, AUTOSAVE_SAVE_FAILURE_TEST_FLAG);
        throw new Error("Simulated autosave save failure");
      }
    },
    beforeFlush: (segments) => {
      if (LOOPCAT_TEST_BUILD && segments.some((segment) => segment[FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG])) {
        throw new Error("Simulated pending save flush failure");
      }
    }
  }
});
const segmentCommandRestorationController =
  appRuntime.featureFactories.createSegmentCommandRestorationController({
    editorSessionStore,
    targetState: segmentTargetStateService,
    autosave: { clear: autosaveService.clear },
    persistence: { save: saveSegment, saveMany: saveSegments },
    selection: {
      getActiveSegment: applicationActiveSegmentService.get,
      select: (index, segmentId) =>
        applicationNavigation.selectSegment({ activeIndex: index, segmentId }),
      selectGrid: (index, segmentId) => verticalFeatureState?.segmentGrid?.selectSegment(index, segmentId),
      inspect: (segmentId) => verticalFeatureState?.inspector?.setContext({ segmentId }),
      normalize: (...args) => targetEditController.normalizeSelection(...args),
      focus: (...args) => targetEditController.focusActive(...args),
      navigateNext: (...args) => segmentNavigationController.nextOpen(...args)
    },
    filters: { invalidate: segmentFilterService.invalidate },
    presentation: {
      renderSegments,
      renderProgress,
      renderHistory: revisionHistoryPresentationService.render,
      renderAll,
      refreshContext: () => editorContextController.refresh()
    },
    workspace: { markDirty: markWorkspaceDirty },
    clone: structuredClone,
    now: () => new Date().toISOString()
  });
const reportDataService = appRuntime.featureFactories.createReportDataService({
  session: {
    getProject: editorSessionStore.getProject,
    getSegments: editorSessionStore.getSegments
  },
  autosave: autosaveService,
  resources: {
    getTmNames: projectTmNames,
    getTermBaseNames: projectTermBaseNames,
    summarize: projectResourceSummary
  },
  repositories: { getAllByIndex, listTerms, listActivityEvents },
  portable: { sanitize: sanitizePortableValue },
  reporting: { validateExportReadiness, analyzeProject, runQaChecks, buildQualityPassportData },
  worker: workerClient,
  tags: { forSegment: protectedTagInspectionService.sourceTags, missing: protectedTagInspectionService.missing },
  redactSensitiveText: applicationTextSafetyService.redactSensitiveText,
  timestamp: () => new Date().toISOString()
});
let qualityReviewController;
let projectQaController;
const qualityWorkbenchController = appRuntime.featureFactories.createQualityWorkbenchController({
  session: {
    getProject: editorSessionStore.getProject,
    getSegments: editorSessionStore.getSegments,
    getQaChecks: editorSessionStore.getQaChecks,
    getQualityRiskQueue: editorSessionStore.getQualityRiskQueue,
    replaceQualityRiskQueue: editorSessionStore.replaceQualityRiskQueue
  },
  scope: { currentSegments: projectDocumentCatalogService.currentSegments },
  selection: {
    getSegment: applicationActiveSegmentService.get,
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex
  },
  quality: { buildRiskQueue, scoreSegment },
  documents: {
    getSelectedId: () => applicationStore.getState().navigation.documentId,
    clearSelection: () => {
      applicationNavigation.selectDocument({ documentId: "" });
      els.documentFilter.value = applicationStore.getState().navigation.documentId;
    }
  },
  filters: {
    matches: segmentFilterService.matches,
    reset: () => {
      editorFilterStore.update({ query: "", status: "all", reviewState: "", aiState: "" });
      els.segmentSearchInput.value = "";
      els.segmentStatusFilter.value = "all";
      if (els.reviewStateFilter) els.reviewStateFilter.value = "";
      if (els.aiSegmentFilter) els.aiSegmentFilter.value = "";
    }
  },
  qa: { run: (...args) => projectQaController.run(...args) },
  navigation: { select: (index) => segmentNavigationController.select(index) },
  presentation: {
    renderSegments,
    renderWorkbench: (viewModel) => qualityReviewController?.renderQuality?.(viewModel)
  },
  focus: { target: () => targetEditController.focusActive() },
  status: { set: applicationSaveStatusController.set }
});
projectQaController = appRuntime.featureFactories.createProjectQaController({
  elements: { runButton: els.runQaBtn },
  session: {
    getProject: editorSessionStore.getProject,
    replaceQaChecks: editorSessionStore.replaceQaChecks,
    replaceQualityRiskQueue: editorSessionStore.replaceQualityRiskQueue
  },
  terms: { list: listTerms, getNames: projectTermBaseNames },
  documents: { currentSegments: projectDocumentCatalogService.currentSegments },
  tags: {
    sourceTags: protectedTagInspectionService.sourceTags,
    missing: protectedTagInspectionService.missing
  },
  qa: { runChecks: runQaChecks },
  worker: workerClient,
  presentation: {
    clearResults: qaResultsController.clear,
    renderResults: qaResultsController.render,
    buildRiskQueue: qualityWorkbenchController.buildQueue,
    renderWorkbench: qualityWorkbenchController.render
  },
  navigation: { getDocumentId: () => applicationStore.getState().navigation.documentId },
  activity: { log: logProjectActivity },
  status: { set: applicationSaveStatusController.set },
  logger: console,
  testHooks: {
    beforeRun: () => {
      if (LOOPCAT_TEST_BUILD && editorSessionStore.getProject()[QA_RUN_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated QA run failure");
      }
    },
    beforeActivity: () => {
      if (LOOPCAT_TEST_BUILD && editorSessionStore.getProject()[QA_ACTIVITY_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated QA activity log failure");
      }
    }
  }
});
const reportExportController = appRuntime.featureFactories.createReportExportController({
  session: {
    getProject: editorSessionStore.getProject,
    replaceQaChecks: editorSessionStore.replaceQaChecks,
    replaceQualityRiskQueue: editorSessionStore.replaceQualityRiskQueue
  },
  application: { clearQaFilter: qaResultsController.clear },
  data: reportDataService,
  documents: reportDocumentCompositionService,
  finalizeDocument: finalizeReportDocument,
  fileSafeName: applicationTextSafetyService.fileSafeName,
  download: applicationDownloadController.download,
  presentation: {
    renderQaResults: qaResultsController.render,
    renderQualityWorkbench: qualityWorkbenchController.render,
    renderValidationReport
  },
  validation: { reportCount },
  activity: { logOptionalProject: logOptionalProjectActivity },
  status: {
    appendActivityWarning,
    exportMode: exportStatusMode,
    set: applicationSaveStatusController.set
  }
});
const localizationDownloadMimeTypeService =
  appRuntime.featureFactories.createLocalizationDownloadMimeTypeService({
    normalizeExtension: applicationTextSafetyService.stableLower,
    xliff: { documentTypes: XLIFF_DOCUMENT_TYPES, mimeType: xliffMimeType }
  });
const deliveryExportController = appRuntime.featureFactories.createDeliveryExportController({
  session: {
    getProject: editorSessionStore.getProject,
    getSegments: editorSessionStore.getSegments,
    replaceQaChecks: editorSessionStore.replaceQaChecks
  },
  application: {
    getDocumentId: () => applicationStore.getState().navigation.documentId,
    clearQaFilter: qaResultsController.clear
  },
  autosave: autosaveService,
  documents: { list: projectDocumentCatalogService.list, type: projectDocumentCatalogService.type },
  terms: { listForValidation: projectTermsForValidation },
  delivery: {
    plan: planDeliveryExport,
    validate: validateExportReadiness,
    reportCount,
    reportSummary
  },
  localization: { source: uiLocalizationService.source },
  confirm: (message) => window.confirm(message),
  displaySafeText: applicationTextSafetyService.displaySafeText,
  qa: {
    worker: workerClient,
    run: runQaChecks,
    tagsForSegment: protectedTagInspectionService.sourceTags,
    missingTags: protectedTagInspectionService.missing
  },
  formats: {
    localizationTypes: LOCALIZATION_EXPORT_TYPES,
    xliffDocumentTypes: XLIFF_DOCUMENT_TYPES,
    buildTargetDocx,
    buildBilingualDocx,
    buildTargetXliff,
    buildLocalizationFile,
    buildXliff12: buildXliff,
    buildXliff22,
    localizationMimeType: localizationDownloadMimeTypeService.forExtension,
    xliffMimeType
  },
  fileSafeName: applicationTextSafetyService.fileSafeName,
  download: applicationDownloadController.download,
  presentation: { renderValidationReport, renderQaResults: qaResultsController.render },
  activity: { logOptionalProject: logOptionalProjectActivity },
  status: {
    appendActivityWarning,
    exportMode: exportStatusMode,
    set: applicationSaveStatusController.set
  }
});
const projectResourceTransferController =
  appRuntime.featureFactories.createProjectResourceTransferController({
    session: { getProject: editorSessionStore.getProject },
    files: {
      assertSize: (file, label) => fileImportService.assertSize(file, label, MAX_RESOURCE_IMPORT_BYTES),
      readText: fileImportService.readText,
      reportProgress: applicationImportProgressController.reportProgress,
      progressDetail: fileImportService.progressDetail,
      yieldToUi: applicationImportProgressController.yieldToUi
    },
    parsers: {
      parseTmx: parseTmxAsync,
      parseTbx: parseTbxAsync,
      parseTermList,
      parseTermWorkbook
    },
    repositories: { importTmEntries, importTerms, getAllByIndex, listTerms },
    resources: {
      mainTmName,
      projectTmNames,
      selectedTermBaseName: () => els.termBaseSelect.value || primaryTermBaseName(),
      primaryTermBaseName,
      projectTermBaseNames,
      markProjectsUsingDirty: markProjectsUsingResourceDirty
    },
    refresh: {
      tmMatches: tmMatchesController.refresh,
      projectTerms: refreshProjectTerms,
      terms: termSuggestionsController.refresh
    },
    builders: { buildTmx, buildTbx },
    fileSafeName: applicationTextSafetyService.fileSafeName,
    download: applicationDownloadController.download,
    activity: { logOptionalProject: logOptionalProjectActivity },
    status: {
      appendActivityWarning,
      exportMode: exportStatusMode,
      set: applicationSaveStatusController.set
    }
  });
const segmentConfirmationController = appRuntime.featureFactories.createSegmentConfirmationController({
  element: els.confirmBtn,
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createConfirmSegmentCommand,
    changed: applicationCommandHistoryController.render
  },
  selection: {
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
    focusTarget: (...args) => targetEditController.focusActive(...args),
    goToNextOpen: (...args) => segmentNavigationController.nextOpen(...args)
  },
  validation: {
    missingTags: protectedTagInspectionService.missing,
    tagLabel: protectedTagInspectionService.displayText
  },
  filters: { matches: segmentFilterService.matches },
  mutation: {
    confirm: segmentConfirmationStateService.confirm,
    restore: segmentConfirmationStateService.restore,
    preparePersistedRollback: segmentConfirmationStateService.preparePersistedRollback
  },
  persistence: {
    clearPending: autosaveService.clear,
    save: saveSegment,
    saveToTm: segmentTmSaveController.save,
    logActivity: (segment, project) =>
      logProjectActivity(
        "confirm-segment",
        "Segment confirmed",
        { segmentId: segment.id, documentId: segment.documentId },
        project
      )
  },
  restoration: {
    restoreCommand: (segmentId, snapshot, options) =>
      segmentCommandRestorationController.restoreSnapshot(segmentId, snapshot, options)
  },
  view: {
    updateRow,
    renderSegments,
    renderProgress,
    scheduleHistory: scheduleRevisionHistoryRender,
    renderHistory: revisionHistoryPresentationService.render
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  testHooks: {
    beforeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[CONFIRM_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated confirm save failure");
      }
    },
    afterSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[CONFIRM_POST_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated post-save confirm failure");
      }
    },
    beforeActivity: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[CONFIRM_ACTIVITY_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated confirm activity failure");
      }
    }
  },
  logger: console
});
segmentConfirmationController.mount();
const segmentDraftApplicationService = appRuntime.featureFactories.createSegmentDraftApplicationService({
  targetState: {
    setTarget: segmentTargetStateService.setTarget,
    touch: segmentTargetStateService.touch,
    capturePatch: segmentTargetStateService.capturePatch
  },
  filters: { matches: segmentFilterService.matches },
  presentation: {
    renderSegments,
    scheduleRowUpdate,
    cancelRowUpdate: (index) => verticalFeatureState.segmentGrid.cancelRowUpdate(index),
    renderProgress,
    scheduleHistory: scheduleRevisionHistoryRender
  },
  workspace: { markDirty: markWorkspaceDirty }
});
targetEditController = appRuntime.featureFactories.createTargetEditController({
  editorSessionStore,
  commandBus: appRuntime.commands.bus,
  editTargetSessions: appRuntime.commands.editTargetSessions,
  persistence: { debounce: autosaveService.debounce },
  status: { commandsChanged: applicationCommandHistoryController.render },
  selection: {
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
    ensureVisible: (...args) => segmentNavigationController.ensureVisible(...args),
    findEditor: (index) => verticalFeatureState.segmentGrid.findTargetEditor(els.segmentBody, index)
  },
  createPatch: segmentTargetStateService.capturePatch,
  restorePatch: segmentCommandRestorationController.restorePatch,
  applyDraft: segmentDraftApplicationService.apply,
  activateSegment: (...args) => segmentNavigationController.select(...args),
  confirmSegment: () => segmentConfirmationController.confirm(),
  getCommandProjectId: () => state.commandProjectId,
  getVisibleIndexes: segmentFilterService.visibleIndexes,
  getVisiblePosition: segmentFilterService.visiblePosition,
  normalizeKey: applicationTextSafetyService.stableLower,
  undo: applicationCommandHistoryController.undo,
  redo: applicationCommandHistoryController.redo
});
const targetProducerController = appRuntime.featureFactories.createTargetProducerController({
  copySourceElement: els.copySourceBtn,
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    createCopySource: appRuntime.commands.createCopySourceToTargetCommand,
    createTmTarget: appRuntime.commands.createInsertTmTargetCommand,
    createProtectedTag: appRuntime.commands.createInsertProtectedTagCommand,
    changed: applicationCommandHistoryController.render
  },
  editLifecycle: { finalize: targetEditController.finalize },
  persistence: {
    clearPending: autosaveService.clear,
    debounce: autosaveService.debounce
  },
  selection: {
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
    active: (segment) => targetEditController.activeSelection(segment),
    normalize: (selection, targetLength) => targetEditController.normalizeSelection(selection, targetLength),
    focus: targetEditController.focusActive
  },
  filters: { matches: segmentFilterService.matches },
  mutation: {
    capturePatch: segmentTargetStateService.capturePatch,
    applyTarget: segmentTargetStateService.setTarget,
    touch: segmentTargetStateService.touch,
    restorePatch: segmentTargetStateService.applyPatch,
    invalidateFilters: segmentFilterService.invalidate
  },
  restoration: { restorePatch: segmentCommandRestorationController.restorePatch },
  view: {
    renderSegments,
    renderProgress,
    renderHistory: revisionHistoryPresentationService.render
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set }
});
targetProducerController.mount();
const concordanceController = appRuntime.featureFactories.createConcordanceController({
  elements: {
    overlay: els.concordanceOverlay,
    closeButton: els.closeConcordanceBtn,
    meta: els.concordanceMeta,
    results: els.concordanceResults
  },
  session: { getProject: editorSessionStore.getProject },
  navigation: { getView: () => applicationStore.getState().navigation.view },
  tm: { listEntries: listTmEntries, getNames: projectTmNames },
  resources: { summary: projectResourceSummary },
  languages: { display: projectLanguageContextController.display },
  localization: uiLocalizationService,
  text: {
    normalizeCase: applicationTextSafetyService.stableLower,
    escapeHtml: applicationTextSafetyService.escapeHtml,
    escapeRegExp: applicationTextSafetyService.escapeRegExp
  },
  safeHtml: { replace: replaceSafeHtml },
  target: { insert: targetProducerController.insertTmTarget },
  status: { set: applicationSaveStatusController.set },
  dom: {
    getSelection: () => window.getSelection(),
    getActiveElement: () => document.activeElement,
    createElement: (tagName) => document.createElement(tagName),
    createFragment: () => document.createDocumentFragment()
  }
});
concordanceController.mount();
const targetReplacementController = appRuntime.featureFactories.createTargetReplacementController({
  elements: {
    menu: els.replaceMenu,
    findInput: els.replaceFindInput,
    replacementInput: els.replaceWithInput,
    visibleButton: els.replaceVisibleBtn,
    allButton: els.replaceAllBtn
  },
  editorSessionStore,
  filters: {
    getOptions: () => ({
      regex: editorFilterStore.getState().regex,
      caseSensitive: editorFilterStore.getState().caseSensitive
    }),
    getIndexes: (scope) => (scope === "all" ? segmentFilterService.allIndexes() : segmentFilterService.visibleIndexes())
  },
  transform: { replace: protectedTextReplacementService.replace },
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createReplaceTargetsCommand,
    changed: applicationCommandHistoryController.render
  },
  persistence: {
    flush: autosaveService.flush,
    clearPending: autosaveService.clear,
    save: saveSegments
  },
  mutation: {
    applyTarget: segmentTargetStateService.setTarget,
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    hasTagIssue: protectedTagInspectionService.hasIssue
  },
  restoration: { restoreSnapshots: segmentCommandRestorationController.restoreSnapshots },
  selection: {
    getActiveSegmentId: () => applicationActiveSegmentService.get()?.id || "",
    focusTarget: targetEditController.focusActive
  },
  presentation: {
    renderSegments,
    renderProgress,
    refreshSidebar: () => editorContextController.refresh(),
    renderHistory: revisionHistoryPresentationService.render
  },
  activity: {
    log: (details) => logProjectActivity("replace-target", "Target text replaced", details)
  },
  status: { set: applicationSaveStatusController.set },
  testHooks: {
    beforeSave: (segments) => {
      if (LOOPCAT_TEST_BUILD && segments.some((segment) => segment[REPLACE_SAVE_FAILURE_TEST_FLAG])) {
        throw new Error("Simulated replace save failure");
      }
    }
  },
  logger: console
});
targetReplacementController.mount();
const tmPretranslationController = appRuntime.featureFactories.createTmPretranslationController({
  pretranslateButton: els.pretranslateBtn,
  editorSessionStore,
  segments: {
    getDocumentSegments: projectDocumentCatalogService.currentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment))
  },
  threshold: {
    request: () => {
      if (!tmPretranslationDialogController?.request) {
        throw new Error("TM pretranslation settings are unavailable in this browser.");
      }
      return tmPretranslationDialogController.request({
        returnTarget: els.segmentToolsMenuSummary
      });
    }
  },
  tm: {
    getNames: projectTmNames,
    findMatchesBatch: findProjectTmMatchesBatch
  },
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createTmPretranslationCommand,
    changed: applicationCommandHistoryController.render
  },
  persistence: {
    flush: autosaveService.flush,
    save: saveSegments
  },
  mutation: {
    capturePatch: segmentTargetStateService.capturePatch,
    applyTarget: segmentTargetStateService.setTarget,
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory
  },
  restoration: { restorePatches: segmentCommandRestorationController.restorePatches },
  selection: {
    getActiveSegmentId: () => applicationActiveSegmentService.get()?.id || "",
    focusTarget: targetEditController.focusActive
  },
  presentation: {
    yieldToUi: applicationImportProgressController.yieldToUi,
    renderSegments,
    renderProgress,
    renderHistory: revisionHistoryPresentationService.render,
    refreshSidebar: () => editorContextController.refresh()
  },
  activity: {
    log: (details) => logProjectActivity("pretranslate", "TM pretranslation applied", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  batchSize: TM_PRETRANSLATE_BATCH_SIZE,
  testHooks: {
    beforeSave: (segments) => {
      if (LOOPCAT_TEST_BUILD && segments.some((segment) => segment[PRETRANSLATE_SAVE_FAILURE_TEST_FLAG])) {
        throw new Error("Simulated pretranslation save failure");
      }
    }
  },
  logger: console
});
tmPretranslationController.mount();
const aiCredentialStorageService =
  appRuntime.featureFactories.createAiCredentialStorageService({
    storage: {
      get: (kind) => (kind === "local" ? globalThis.localStorage : globalThis.sessionStorage)
    },
    settings: {
      readLocal: () => aiRuntimeSettingsService.localSettingsFromForm(),
      normalizeLocal: (settings) =>
        localAISettingsStore?.defaults
          ? localAISettingsStore.defaults(settings || {}, editorSessionStore.getProject())
          : (settings || {}),
      normalizeProviderBaseUrl: normalizedProviderBaseUrl
    },
    defaults: {
      ollamaBaseUrl: OLLAMA_DEFAULT_BASE_URL,
      openAiBaseUrl: OPENAI_DEFAULT_BASE_URL
    },
    failures: {
      beforeOpenAiSave: () =>
        LOOPCAT_TEST_BUILD && state[OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG]
    },
    logger: console
  });
const aiRuntimeSettingsService =
  appRuntime.featureFactories.createAiRuntimeSettingsService({
    project: { get: editorSessionStore.getProject },
    administration: {
      readLocalForm: () => aiAdministrationController?.readLocalForm?.() || {},
      readSecrets: () => aiAdministrationController?.readSecrets?.() || {}
    },
    localSettings: {
      projectSettings: (project) => localAISettingsStore.projectSettings(project),
      defaults: (settings, project) => localAISettingsStore.defaults(settings, project)
    },
    languages: {
      normalizeInput: languageInputService.normalizeInput,
      nameForUi: languageInputService.nameForUi
    },
    endpoints: {
      isAllowedHostedCompatible: isAllowedOpenAiCompatibleHostedBaseUrl
    },
    providers: { needsApiKey: localAiProviderNeedsApiKey },
    credentials: {
      saveLocal: aiCredentialStorageService.saveLocalAiKey,
      readLocal: aiCredentialStorageService.storedLocalAiKey,
      readOpenAi: aiCredentialStorageService.storedOpenAiKey
    },
    redact: applicationTextSafetyService.redactSensitiveText,
    defaults: {
      openAiModel: OPENAI_DEFAULT_MODEL,
      projectLocalProviderId: "ollama",
      projectLocalBaseUrl: "http://localhost:11434",
      projectLocalModel: "translategemma",
      localBaseUrl: OLLAMA_DEFAULT_BASE_URL,
      localModel: DEFAULT_LOCAL_AI_MODEL
    }
  });
const aiLocalSettingsPersistenceController =
  appRuntime.featureFactories.createAiLocalSettingsPersistenceController({
    editorSessionStore,
    form: { readSettings: aiRuntimeSettingsService.localSettingsFromForm },
    settings: {
      normalize: aiRuntimeSettingsService.normalizeProjectSettings,
      projectUpdateFields: (settings, project) =>
        localAISettingsStore.projectUpdateFields(settings, project)
    },
    endpoint: { assertAllowed: aiRuntimeSettingsService.assertEndpointAllowed },
    localStore: { save: (settings) => localAISettingsStore.save(settings) },
    persistence: { updateProject },
    workspace: { markDirty: markWorkspaceDirty },
    status: { set: applicationSaveStatusController.set }
  });
const aiSegmentContextService = appRuntime.featureFactories.createAiSegmentContextService({
  project: {
    get: editorSessionStore.getProject,
    normalizeAiSettings: aiRuntimeSettingsService.normalizeProjectSettings
  },
  resources: {
    getTermBaseNames: projectTermBaseNames,
    getTmNames: projectTmNames
  },
  lookup: {
    findTerms,
    findTmMatches: findProjectTmMatches
  },
  settings: { read: () => aiRuntimeSettingsService.localSettingsFromForm() },
  segments: { getAll: editorSessionStore.getSegments },
  logger: console
});
const aiScopeSelectionService = appRuntime.featureFactories.createAiScopeSelectionService({
  project: { get: editorSessionStore.getProject },
  settings: { read: () => aiRuntimeSettingsService.localSettingsFromForm() },
  segments: {
    getAll: editorSessionStore.getSegments,
    getDocument: projectDocumentCatalogService.currentSegments,
    getActive: applicationActiveSegmentService.get
  },
  filters: { getVisibleIndexes: segmentFilterService.visibleIndexes }
});
const externalAiConsentService = appRuntime.featureFactories.createExternalAiConsentService({
  confirm: uiLocalizationService.confirm
});
const aiProviderPresentationService =
  appRuntime.featureFactories.createAiProviderPresentationService({
    providers: {
      get: (providerId) => aiProviderService.get(providerId),
      getPreset: localAiProviderPresetForSettings,
      needsApiKey: localAiProviderNeedsApiKey,
      sharesExternally: localAiProviderSharesExternally,
      getGuidance: localAiProviderGuidance
    },
    urls: {
      ollama: ollamaApiUrl,
      "opus-cat": opusCatApiUrl,
      openai: openAiApiUrl,
      deepseek: deepSeekApiUrl,
      gemini: geminiApiUrl,
      anthropic: anthropicApiUrl,
      cohere: cohereApiUrl,
      mistral: mistralApiUrl,
      xai: xAiApiUrl,
      perplexity: perplexityApiUrl,
      groq: groqApiUrl,
      together: togetherApiUrl,
      openrouter: openRouterApiUrl,
      huggingface: huggingFaceApiUrl,
      deepinfra: deepInfraApiUrl,
      fireworks: fireworksApiUrl,
      "azure-openai": azureOpenAiApiUrl,
      "openai-compatible": openAiCompatibleApiUrl
    },
    network: { isOllamaCloudBaseUrl },
    localization: { label: uiLocalizationService.label, source: uiLocalizationService.source },
    defaults: {
      providerId: "ollama",
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      model: DEFAULT_LOCAL_AI_MODEL
    }
  });
const aiCredentialClearController = appRuntime.featureFactories.createAiCredentialClearController({
  settings: { readLocal: aiRuntimeSettingsService.localSettingsFromForm },
  credentials: {
    saveOpenAi: aiCredentialStorageService.saveOpenAiKey,
    saveLocal: aiCredentialStorageService.saveLocalAiKey
  },
  redaction: { sanitize: applicationTextSafetyService.redactSensitiveText },
  presentation: {
    clearOpenSecret: () => aiAdministrationController?.clearOpenAiSecret?.(),
    renderOpenStatus: (value) => aiAdministrationController?.renderGlobalConnectionStatus?.(value),
    clearLocalSecret: () => aiAdministrationController?.clearLocalAiSecret?.(),
    renderLocalStatus: (...args) => aiProviderFormController.setStatus(...args)
  }
});
const aiProviderFormController =
  appRuntime.featureFactories.createAiProviderFormController({
    administration: aiAdministrationController,
    settings: {
      readForm: aiRuntimeSettingsService.localSettingsFromForm,
      readProject: (project) => localAISettingsStore.projectSettings(project)
    },
    project: { get: editorSessionStore.getProject, getSegment: applicationActiveSegmentService.get },
    providers: {
      get: (providerId) => aiProviderService.get(providerId),
      presets: LOCAL_AI_PROVIDER_PRESETS,
      getPreset: localAiProviderPresetById,
      presetForSettings: localAiProviderPresetForSettings,
      needsApiKey: localAiProviderNeedsApiKey
    },
    presentation: aiProviderPresentationService,
    credentials: {
      localSnapshot: aiCredentialStorageService.localAiSnapshot,
      readLocal: aiCredentialStorageService.storedLocalAiKey
    },
    runtime: {
      canStartServer: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
        aiProviderAdministrationOperationsController.canStartServer(settings)
    },
    languages: {
      normalizeInput: languageInputService.normalizeInput,
      nameForUi: languageInputService.nameForUi,
      shouldLiveSync: languageInputService.shouldLiveSync
    },
    prompt: {
      render: (...args) => aiPromptPreviewController.render(...args),
      previewRequest: (...args) => aiPromptPreviewController.createRequest(...args)
    },
    help: { hideOpusCat: () => opusCatHelpController?.setVisible?.(false) },
    keys: {
      clearLocal: aiCredentialClearController.clearLocal,
      clearOpenAi: aiCredentialClearController.clearOpenAi
    },
    state: {
      read: () => state.localAi,
      clearModels: () => {
        state.localAi.models = [];
      },
      setStatus: ({ connectionStatus, statusText }) => {
        state.localAi.connectionStatus = connectionStatus;
        state.localAi.statusText = statusText;
      }
    },
    status: { setSave: applicationSaveStatusController.set },
    localization: { label: uiLocalizationService.label, source: uiLocalizationService.source },
    redact: applicationTextSafetyService.redactSensitiveText,
    defaults: {
      localBaseUrl: OLLAMA_DEFAULT_BASE_URL,
      localModel: DEFAULT_LOCAL_AI_MODEL,
      openAiModel: OPENAI_DEFAULT_MODEL,
      geminiModel: GEMINI_DEFAULT_MODEL
    }
  });
const aiSuggestionListController =
  appRuntime.featureFactories.createAiSuggestionListController({
    root: els.aiSuggestionList,
    getSegment: applicationActiveSegmentService.get,
    apply: (...args) => aiSuggestionApplicationController.apply(...args),
    source: uiLocalizationService.source,
    label: uiLocalizationService.label,
    formatDateTime
  });
const aiCommandLifecycleCoordinator =
  appRuntime.featureFactories.createAiCommandLifecycleCoordinator({
    state: {
      read: () => state.localAi,
      patch: (values) => Object.assign(state.localAi, values)
    },
    presentation: { renderProgress: aiProviderFormController.renderProgress },
    status: { set: applicationSaveStatusController.set }
  });
const aiPretranslationController = appRuntime.featureFactories.createAiPretranslationController({
  editorSessionStore,
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady,
    projectDefaults: (project) =>
      aiRuntimeSettingsService.normalizeProjectSettings(project.aiSettings)
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: {
    externalShare: externalAiConsentService.confirmShare,
    overwrite: () =>
      uiLocalizationService.confirm(
        "Overwrite existing target text in eligible draft segments? Confirmed and locked segments are always preserved."
      )
  },
  scope: {
    getSegments: aiScopeSelectionService.pretranslationSegments,
    getOptions: aiScopeSelectionService.pretranslationOptions
  },
  domain: {
    selectSegments: (segments, options) => preTranslationService.selectSegments(segments, options),
    pretranslateSegments: (options) => preTranslationService.pretranslateSegments(options)
  },
  context: {
    glossaryTermsForSegment: aiSegmentContextService.glossaryTermsForSegment,
    tmMatchesForSegment: aiSegmentContextService.tmMatchesForSegment,
    surroundingSegmentsForSegment: aiSegmentContextService.surroundingSegmentsForSegment
  },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("pretranslation", {
    alwaysSyncProgress: true
  }),
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createAiPretranslationCommand,
    changed: applicationCommandHistoryController.render
  },
  persistence: {
    flush: autosaveService.flush,
    save: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    capturePatch: segmentTargetStateService.capturePatch,
    applyPatch: segmentTargetStateService.applyPatch,
    clearPending: autosaveService.clear,
    recordHistory: (segment) =>
      segmentTargetStateService.recordHistory(segment, segment.target, segment.status, "ai-pretranslate"),
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    prepareHistories: segmentTargetStateService.prepareHistories
  },
  restoration: { restorePatches: segmentCommandRestorationController.restorePatches },
  selection: { getActiveSegmentId: () => applicationActiveSegmentService.get()?.id || "" },
  presentation: {
    invalidateFilters: segmentFilterService.invalidate,
    renderAll,
    renderSegments,
    renderProjectProgress: renderProgress,
    renderHistory: revisionHistoryPresentationService.render,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    refreshSidebar: () => editorContextController.refresh()
  },
  activity: {
    log: (details) =>
      logProjectActivity("ai-pretranslate", "Local AI pretranslation applied", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  testHooks: {
    beforeSave: (segments) => {
      if (
        LOOPCAT_TEST_BUILD &&
        segments.some((segment) => segment[PRETRANSLATE_SAVE_FAILURE_TEST_FLAG])
      ) {
        throw new Error("Simulated pretranslation save failure");
      }
    }
  },
  logger: console
});
const aiReviewController = appRuntime.featureFactories.createAiReviewController({
  editorSessionStore,
  selection: {
    getActiveSegment: applicationActiveSegmentService.get,
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex
  },
  scope: {
    getVisibleSegments: () =>
      segmentFilterService.visibleIndexes()
        .map((index) => editorSessionStore.getSegments()[index])
        .filter(Boolean),
    getDocumentSegments: projectDocumentCatalogService.currentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment))
  },
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  context: {
    findTerms,
    getTermBaseNames: projectTermBaseNames
  },
  domain: {
    reviewSegment: (options) => aiCommandService.reviewSegment(options),
    parseRisk: parseAiReviewRisk
  },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("review", {
    trackPromptBusy: true
  }),
  persistence: {
    flush: autosaveService.flush,
    saveOne: saveSegment,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: segmentTargetStateService.touch,
    clearPending: autosaveService.clear,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    prepareHistories: segmentTargetStateService.prepareHistories
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderReview: (options = {}) =>
      qualityReviewController?.renderReview?.({
        segment: applicationActiveSegmentService.get(),
        force: Boolean(options.force)
      }),
    updateRow,
    renderAll,
    refreshSidebar: () => editorContextController.refresh(),
    renderSegments,
    renderProjectProgress: renderProgress,
    renderHistory: revisionHistoryPresentationService.render
  },
  activity: {
    logActive: (details) =>
      logProjectActivity("ai-review", "AI segment review created", details),
    logBatch: (details) =>
      logProjectActivity("ai-batch-review", "Batch AI QA completed", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  labels: { risk: qualityPresentationService.aiReviewRisk },
  redact: applicationTextSafetyService.redactSensitiveText,
  ids: { next: () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()) },
  clock: { now: () => new Date().toISOString() },
  logger: console
});
const aiTagRepairController = appRuntime.featureFactories.createAiTagRepairController({
  editorSessionStore,
  selection: { getActiveSegment: applicationActiveSegmentService.get },
  scope: {
    getVisibleSegments: () =>
      segmentFilterService.visibleIndexes()
        .map((index) => editorSessionStore.getSegments()[index])
        .filter(Boolean),
    getDocumentSegments: projectDocumentCatalogService.currentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: protectedTagInspectionService.sourceTags,
    getMissingTags: protectedTagInspectionService.missing,
    tagText: protectedTagInspectionService.displayText
  },
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  domain: { repairSegmentTags: (options) => aiCommandService.repairSegmentTags(options) },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("tag-repair", {
    trackPromptBusy: true
  }),
  suggestions: {
    append: (segment, suggestion) =>
      aiSuggestionPersistenceController.append(
        segment,
        suggestion,
        "ai-tag-repair",
        "AI tag repair suggestion created"
      ),
    normalize: (...args) => aiSuggestionPersistenceController.normalize(...args),
    nextId: () => makeId("ai-suggestion")
  },
  persistence: {
    flush: autosaveService.flush,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: segmentTargetStateService.touch,
    clearPending: autosaveService.clear,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    prepareHistories: segmentTargetStateService.prepareHistories
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderAll,
    refreshSidebar: () => editorContextController.refresh()
  },
  activity: {
    logBatch: (details) =>
      logProjectActivity(
        "ai-tag-repair-batch",
        "Batch AI tag repair suggestions created",
        details
      )
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  redact: applicationTextSafetyService.redactSensitiveText,
  logger: console
});
const aiAlternativesController = appRuntime.featureFactories.createAiAlternativesController({
  editorSessionStore,
  selection: {
    getActiveSegment: applicationActiveSegmentService.get,
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex
  },
  scope: {
    getVisibleSegments: () =>
      segmentFilterService.visibleIndexes()
        .map((index) => editorSessionStore.getSegments()[index])
        .filter(Boolean),
    getDocumentSegments: projectDocumentCatalogService.currentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: protectedTagInspectionService.sourceTags
  },
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  context: {
    activeTerms: (project, segment) =>
      findTerms({
        source: segment.source,
        sourceLang: project.sourceLang,
        targetLang: project.targetLang,
        termBaseNames: projectTermBaseNames()
      }),
    batchTerms: aiSegmentContextService.glossaryTermsForSegment
  },
  domain: {
    suggestSegmentVariants: (options) => aiCommandService.suggestSegmentVariants(options)
  },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("alternatives", {
    trackPromptBusy: true
  }),
  suggestions: {
    normalize: (...args) => aiSuggestionPersistenceController.normalize(...args),
    nextId: () => makeId("ai-suggestion")
  },
  persistence: {
    flush: autosaveService.flush,
    saveOne: saveSegment,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: segmentTargetStateService.touch,
    clearPending: autosaveService.clear,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    prepareHistories: segmentTargetStateService.prepareHistories
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderSuggestions: aiSuggestionListController.render,
    updateRow,
    renderAll,
    refreshSidebar: () => editorContextController.refresh()
  },
  activity: {
    logActive: (details) =>
      logProjectActivity("ai-target-variants", "AI target alternatives created", details),
    logBatch: (details) =>
      logProjectActivity(
        "ai-target-variants-batch",
        "Batch AI target alternatives created",
        details
      )
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  redact: applicationTextSafetyService.redactSensitiveText,
  logger: console
});
const aiTerminologyApplicationController =
  appRuntime.featureFactories.createAiTerminologyApplicationController({
    editorSessionStore,
    selection: {
      getActiveSegment: applicationActiveSegmentService.get,
      getActiveIndex: () => applicationStore.getState().navigation.activeIndex
    },
    scope: {
      getVisibleSegments: () =>
        segmentFilterService.visibleIndexes()
          .map((index) => editorSessionStore.getSegments()[index])
          .filter(Boolean),
      getDocumentSegments: projectDocumentCatalogService.currentSegments,
      isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
      getTags: protectedTagInspectionService.sourceTags
    },
    settings: {
      persist: aiLocalSettingsPersistenceController.persistSilently,
      runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
      assertReady: aiRuntimeSettingsService.assertRuntimeReady
    },
    providers: {
      get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
        aiProviderService.get(settings.providerId),
      sharesExternally: (settings) =>
        localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
    },
    consent: { externalShare: externalAiConsentService.confirmShare },
    context: { termsForSegment: aiSegmentContextService.glossaryTermsForSegment },
    domain: { applyTerminology: (options) => aiCommandService.applyTerminology(options) },
    lifecycle: aiCommandLifecycleCoordinator.createLifecycle("terminology-application", {
      trackPromptBusy: true
    }),
    suggestions: {
      append: (segment, suggestion) =>
        aiSuggestionPersistenceController.append(
          segment,
          suggestion,
          "ai-apply-terminology",
          "AI terminology suggestion created"
        ),
      normalize: (...args) => aiSuggestionPersistenceController.normalize(...args),
      nextId: () => makeId("ai-suggestion")
    },
    persistence: {
      flush: autosaveService.flush,
      saveMany: saveSegments,
      load: getProjectSegments
    },
    mutation: {
      touch: segmentTargetStateService.touch,
      clearPending: autosaveService.clear,
      restore: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: segmentTargetStateService.prepareHistory,
      prepareHistories: segmentTargetStateService.prepareHistories
    },
    presentation: {
      renderCommandCentre: aiProviderFormController.renderCommandCentre,
      renderAiProgress: aiProviderFormController.renderProgress,
      renderOutput: aiProviderFormController.renderOutput,
      renderSuggestions: aiSuggestionListController.render,
      updateRow,
      renderAll,
      refreshSidebar: () => editorContextController.refresh()
    },
    activity: {
      logBatch: (details) =>
        logProjectActivity(
          "ai-apply-terminology-batch",
          "Batch AI terminology suggestions created",
          details
        )
    },
    workspace: { markDirty: markWorkspaceDirty },
    status: { set: applicationSaveStatusController.set },
    redact: applicationTextSafetyService.redactSensitiveText,
    logger: console
  });
const aiDraftEditingController = appRuntime.featureFactories.createAiDraftEditingController({
  editorSessionStore,
  selection: { getActiveSegment: applicationActiveSegmentService.get },
  scope: {
    getVisibleSegments: () =>
      segmentFilterService.visibleIndexes()
        .map((index) => editorSessionStore.getSegments()[index])
        .filter(Boolean),
    getDocumentSegments: projectDocumentCatalogService.currentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: protectedTagInspectionService.sourceTags
  },
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  context: {
    termsForSegment: aiSegmentContextService.glossaryTermsForSegment,
    tmMatchesForSegment: aiSegmentContextService.tmMatchesForSegment
  },
  domain: {
    polish: (options) => aiCommandService.polishSegmentStyle(options),
    adapt: (options) => aiCommandService.adaptSegmentDraft(options)
  },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("draft-editing", {
    trackPromptBusy: true
  }),
  suggestions: {
    append: (operation, segment, suggestion) =>
      aiSuggestionPersistenceController.append(
        segment,
        suggestion,
        operation === "adapt" ? "ai-adapt-draft" : "ai-polish-draft",
        operation === "adapt"
          ? "AI draft adaptation suggestion created"
          : "AI draft polish suggestion created"
      ),
    normalize: (...args) => aiSuggestionPersistenceController.normalize(...args),
    nextId: () => makeId("ai-suggestion")
  },
  persistence: {
    flush: autosaveService.flush,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: segmentTargetStateService.touch,
    clearPending: autosaveService.clear,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory,
    prepareHistories: segmentTargetStateService.prepareHistories
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderAll,
    refreshSidebar: () => editorContextController.refresh()
  },
  activity: {
    logBatch: (operation, details) =>
      operation === "adapt"
        ? logProjectActivity("ai-adapt-batch", "Batch AI adaptation suggestions created", details)
        : logProjectActivity("ai-polish-batch", "Batch AI polish suggestions created", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  redact: applicationTextSafetyService.redactSensitiveText,
  logger: console
});
const aiTermCandidatePersistenceService =
  appRuntime.featureFactories.createAiTermCandidatePersistenceService({
    project: { get: editorSessionStore.getProject },
    termbase: {
      list: listTerms,
      save: saveTerm
    },
    normalize: { stableLower: applicationTextSafetyService.stableLower },
    workspace: { markProjectsUsingResourceDirty }
  });
const aiTerminologyExtractionController =
  appRuntime.featureFactories.createAiTerminologyExtractionController({
    editorSessionStore,
    selection: { getActiveSegment: applicationActiveSegmentService.get },
    scope: {
      getSegments: aiScopeSelectionService.terminologySegments
    },
    termbase: {
      getSelectedName: () => els.termBaseSelect?.value || primaryTermBaseName(),
      saveCandidates: (terms, termBaseName) =>
        aiTermCandidatePersistenceService.saveCandidates(terms, termBaseName)
    },
    settings: {
      persist: aiLocalSettingsPersistenceController.persistSilently,
      runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
      assertReady: aiRuntimeSettingsService.assertRuntimeReady
    },
    providers: {
      get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
        aiProviderService.get(settings.providerId),
      sharesExternally: (settings) =>
        localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
    },
    consent: { externalShare: externalAiConsentService.confirmShare },
    domain: {
      extractSegmentTerms: (options) => aiCommandService.extractSegmentTerms(options)
    },
    lifecycle: aiCommandLifecycleCoordinator.createLifecycle("terminology-extraction", {
      trackPromptBusy: true
    }),
    presentation: {
      renderCommandCentre: aiProviderFormController.renderCommandCentre,
      renderAiProgress: aiProviderFormController.renderProgress,
      renderOutput: aiProviderFormController.renderOutput,
      refreshProjectTerms: () => refreshProjectTerms({ rerender: true }),
      refreshTerms: termSuggestionsController.refresh
    },
    activity: {
      logActive: (details) =>
        logProjectActivity("ai-term-extraction", "AI term candidates extracted", details),
      logBatch: (details) =>
        logProjectActivity(
          "ai-term-extraction-batch",
          "Batch AI term candidates extracted",
          details
        )
    },
    workspace: { markDirty: markWorkspaceDirty },
    status: { set: applicationSaveStatusController.set },
    logger: console
  });
aiCommandLifecycleCoordinator.setCancelHandlers([
  aiPretranslationController,
  aiReviewController,
  aiTagRepairController,
  aiAlternativesController,
  aiTerminologyApplicationController,
  aiDraftEditingController,
  aiTerminologyExtractionController
]);
const aiProjectBriefController = appRuntime.featureFactories.createAiProjectBriefController({
  editorSessionStore,
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady,
    normalizeProjectAiSettings: aiRuntimeSettingsService.normalizeProjectSettings
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  context: {
    getSampleSegments: aiScopeSelectionService.projectBriefSampleSegments,
    getDocuments: projectDocumentCatalogService.list,
    getTerms: (project) =>
      listTerms({
        sourceLang: project.sourceLang,
        targetLang: project.targetLang,
        termBaseNames: projectTermBaseNames()
      })
  },
  domain: {
    generateProjectBrief: (options) => aiCommandService.generateProjectBrief(options)
  },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("project-brief", {
    trackPromptBusy: true
  }),
  persistence: { updateProject },
  administration: {
    setStyleGuide: (value) => aiAdministrationController?.setGlobalStyleGuide?.(value)
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderOutput: aiProviderFormController.renderOutput
  },
  activity: {
    log: (details) =>
      logProjectActivity("ai-project-brief", "AI project brief generated", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  logger: console
});
const aiSuggestionApplicationController =
  appRuntime.featureFactories.createAiSuggestionApplicationController({
    editorSessionStore,
    commands: {
      bus: appRuntime.commands.bus,
      create: appRuntime.commands.createApplyAiSuggestionCommand,
      changed: applicationCommandHistoryController.render
    },
    selection: {
      getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
      goToNextOpen: (...args) => segmentNavigationController.nextOpen(...args)
    },
    mutation: {
      applyTarget: segmentTargetStateService.setTarget,
      touch: segmentTargetStateService.touch,
      restoreInPlace: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: segmentTargetStateService.prepareHistory,
      prepareRestoreSnapshot: segmentCommandRestorationController.prepareSnapshot
    },
    persistence: {
      flush: autosaveService.flush,
      clearPending: autosaveService.clear,
      save: saveSegment
    },
    activity: {
      log: (details) =>
        logProjectActivity("ai-apply-suggestion", "AI suggestion applied to target", details)
    },
    presentation: {
      renderSegments,
      renderProgress,
      renderHistory: revisionHistoryPresentationService.render,
      renderSuggestions: aiSuggestionListController.render,
      refreshSidebar: () => editorContextController.refresh(),
      renderAll,
      focusTarget: targetEditController.focusActive
    },
    workspace: {
      markDirty: markWorkspaceDirty,
      markActivityWarningDirty: () => {
        if (editorSessionStore.getProject()?.id) markWorkspaceDirty(editorSessionStore.getProject().id);
      }
    },
    status: { set: applicationSaveStatusController.set },
    testHooks: {
      beforeSave: (segment) => {
        if (LOOPCAT_TEST_BUILD && segment[AI_APPLY_SAVE_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI apply save failure");
        }
      },
      beforeActivity: (segment) => {
        if (LOOPCAT_TEST_BUILD && segment[AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI suggestion activity failure");
        }
      }
    },
    logger: console
  });
const aiSuggestionPersistenceController =
  appRuntime.featureFactories.createAiSuggestionPersistenceController({
    mutation: {
      touch: segmentTargetStateService.touch,
      restoreInPlace: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: segmentTargetStateService.prepareHistory
    },
    persistence: {
      clearPending: autosaveService.clear,
      save: saveSegment
    },
    activity: { log: logProjectActivity },
    presentation: {
      renderSuggestions: aiSuggestionListController.render,
      renderHistory: revisionHistoryPresentationService.render
    },
    workspace: {
      markDirty: markWorkspaceDirty,
      markActivityWarningDirty: () => {
        if (editorSessionStore.getProject()?.id) markWorkspaceDirty(editorSessionStore.getProject().id);
      }
    },
    status: { set: applicationSaveStatusController.set },
    redact: applicationTextSafetyService.redactSensitiveText,
    ids: { suggestion: () => makeId("ai-suggestion") },
    testHooks: {
      beforeSave: (segment) => {
        if (LOOPCAT_TEST_BUILD && segment[AI_APPEND_SAVE_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI suggestion save failure");
        }
      },
      beforeActivity: (segment) => {
        if (LOOPCAT_TEST_BUILD && segment[AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI suggestion activity failure");
        }
      }
    },
    logger: console
  });
const aiOpenAiSuggestionController = appRuntime.featureFactories.createAiOpenAiSuggestionController({
  editorSessionStore,
  selection: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex },
  administration: {
    readGlobalForm: () => aiAdministrationController?.readGlobalForm?.() || {},
    readSecrets: () => aiAdministrationController?.readSecrets?.() || {}
  },
  settings: { normalize: aiRuntimeSettingsService.normalizeProjectSettings },
  provider: {
    isOpenAi: (aiSettings) => isOpenAiProvider({ aiSettings }),
    appearsOffline: browserAppearsOffline,
    request: openAiSuggestion
  },
  keys: {
    readStored: aiCredentialStorageService.storedOpenAiKey,
    snapshot: aiCredentialStorageService.openAiSnapshot,
    save: aiCredentialStorageService.saveOpenAiKey,
    restore: aiCredentialStorageService.safeRestoreOpenAiSnapshot
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  persistence: { updateProject },
  context: { forSegment: aiSegmentContextService.resourceContextForSegment },
  suggestions: {
    append: (segment, suggestion) =>
      aiSuggestionPersistenceController.append(
        segment,
        suggestion,
        "ai-openai-suggestion",
        "OpenAI suggestion created"
      )
  },
  presentation: { renderEditor },
  workspace: {
    markDirty: markWorkspaceDirty,
    markRollbackDirty: markOpenAiProjectRollbackDirty
  },
  status: { set: applicationSaveStatusController.set },
  defaults: { model: OPENAI_DEFAULT_MODEL },
  testHooks: {
    beforeProjectSave: () => {
      if (LOOPCAT_TEST_BUILD && editorSessionStore.getProject()[AI_SETTINGS_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated AI settings save failure");
      }
    }
  },
  logger: console
});
const aiSettingsPersistenceController =
  appRuntime.featureFactories.createAiSettingsPersistenceController({
    editorSessionStore,
    forms: {
      readGlobal: () => aiAdministrationController?.readGlobalForm?.() || {},
      readSecrets: () => aiAdministrationController?.readSecrets?.() || {},
      readLocalSettings: aiRuntimeSettingsService.localSettingsFromForm
    },
    settings: {
      normalize: aiRuntimeSettingsService.normalizeProjectSettings,
      projectUpdateFields: (localSettings, project) =>
        localAISettingsStore.projectUpdateFields(localSettings, project)
    },
    endpoint: { assertAllowed: aiRuntimeSettingsService.assertEndpointAllowed },
    provider: { isOpenAi: (aiSettings) => isOpenAiProvider({ aiSettings }) },
    keys: {
      openAi: {
        snapshot: aiCredentialStorageService.openAiSnapshot,
        save: aiCredentialStorageService.saveOpenAiKey,
        restore: aiCredentialStorageService.safeRestoreOpenAiSnapshot,
        storageLabel: aiCredentialStorageService.openAiStorageLabel
      },
      local: {
        snapshot: aiCredentialStorageService.localAiSnapshot,
        save: aiCredentialStorageService.saveLocalAiKey,
        restore: aiCredentialStorageService.safeRestoreLocalAiSnapshot,
        storageLabel: aiCredentialStorageService.localAiStorageLabel
      }
    },
    persistence: { updateProject },
    activity: {
      log: (details) => logProjectActivity("ai-settings", "AI settings updated", details)
    },
    presentation: { renderEditor },
    workspace: {
      markDirty: markWorkspaceDirty,
      markActivityWarningDirty: () => {
        if (editorSessionStore.getProject()?.id) markWorkspaceDirty(editorSessionStore.getProject().id);
      },
      markRollbackDirty: markOpenAiProjectRollbackDirty
    },
    status: { set: applicationSaveStatusController.set },
    defaults: { model: OPENAI_DEFAULT_MODEL },
    testHooks: {
      beforeSave: (project) => {
        if (LOOPCAT_TEST_BUILD && project[AI_SETTINGS_SAVE_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI settings save failure");
        }
      },
      beforeActivity: (project) => {
        if (LOOPCAT_TEST_BUILD && project[AI_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated AI settings activity failure");
        }
      }
    },
    logger: console
  });
const aiProviderAdministrationOperationsController =
  appRuntime.featureFactories.createAiProviderAdministrationOperationsController({
    project: { exists: () => Boolean(editorSessionStore.getProject()) },
    settings: {
      persist: aiLocalSettingsPersistenceController.persistSilently,
      runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
      assertReady: aiRuntimeSettingsService.assertRuntimeReady,
      normalizeBaseUrl: normalizedProviderBaseUrl
    },
    providers: {
      get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
        aiProviderService.get(settings.providerId),
      sharesExternally: (settings) =>
        localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model),
      canPullModel: aiProviderPresentationService.canPullModel
    },
    desktop: {
      getBridge: () =>
        window.LoopCATDesktop &&
        typeof window.LoopCATDesktop.startLmStudioServer === "function"
          ? window.LoopCATDesktop
          : null
    },
    administration: {
      setBaseUrl: (value) => aiAdministrationController?.setBaseUrl?.(value),
      readModel: () => aiAdministrationController?.readLocalForm?.().model || ""
    },
    modelState: {
      get: () => state.localAi.models,
      replace: (models) => {
        state.localAi.models = models;
      }
    },
    presentation: {
      renderPresets: aiProviderFormController.renderPresets,
      renderProvider: aiProviderFormController.renderProvider,
      renderPrompt: (...args) => aiPromptPreviewController.render(...args),
      renderModels: aiProviderFormController.renderModels
    },
    help: {
      setVisible: (visible) => opusCatHelpController?.setVisible?.(visible),
      open: () => opusCatHelpController?.open?.()
    },
    status: {
      setConnection: aiProviderFormController.setStatus,
      setSave: applicationSaveStatusController.set
    },
    defaults: { model: DEFAULT_LOCAL_AI_MODEL }
  });
const aiPromptPreviewController = appRuntime.featureFactories.createAiPromptPreviewController({
  administration: {
    readPromptState: () => aiAdministrationController?.readPromptState?.() || {},
    renderPromptPreview: (prompt) => aiAdministrationController?.renderPromptPreview?.(prompt)
  },
  settings: { read: aiRuntimeSettingsService.localSettingsFromForm },
  project: {
    get: editorSessionStore.getProject,
    getActiveSegment: applicationActiveSegmentService.get,
    getTerms: editorSessionStore.getProjectTerms,
    getDocuments: projectDocumentCatalogService.list,
    getSampleSegments: aiScopeSelectionService.projectBriefSampleSegments,
    getSurroundingSegments: aiSegmentContextService.surroundingSegmentsForSegment,
    getTags: protectedTagInspectionService.sourceTags
  },
  builders: {
    translate: buildTranslateGemmaPrompt,
    review: buildAiReviewPrompt,
    tagRepair: buildTagRepairPrompt,
    polish: buildStylePolishPrompt,
    adapt: buildDraftAdaptationPrompt,
    variants: buildTargetVariantsPrompt,
    applyTerms: buildTerminologyApplicationPrompt,
    extractTerms: buildTerminologyExtractionPrompt,
    projectBrief: buildProjectBriefPrompt
  },
  normalize: { stableLower: applicationTextSafetyService.stableLower }
});
const aiPromptTestController = appRuntime.featureFactories.createAiPromptTestController({
  project: { get: editorSessionStore.getProject },
  settings: {
    persist: aiLocalSettingsPersistenceController.persistSilently,
    runtimeConfig: aiRuntimeSettingsService.runtimeConfig,
    assertReady: aiRuntimeSettingsService.assertRuntimeReady
  },
  prompt: {
    getMode: aiPromptPreviewController.getMode,
    getSampleText: aiPromptPreviewController.getSampleText,
    createRequest: aiPromptPreviewController.createRequest,
    getModeLabel: aiPromptPreviewController.getModeLabel,
    getContextLabels: aiPromptPreviewController.getContextLabels,
    hasProjectBriefSamples: aiScopeSelectionService.hasProjectBriefSamples
  },
  providers: {
    get: (settings = aiRuntimeSettingsService.localSettingsFromForm()) =>
      aiProviderService.get(settings.providerId),
    sharesExternally: (settings) =>
      localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  },
  consent: { externalShare: externalAiConsentService.confirmShare },
  lifecycle: aiCommandLifecycleCoordinator.createLifecycle("prompt-test", {
    trackPromptBusy: true
  }),
  output: {
    set: (value) => {
      state.localAi.promptOutput = value;
    }
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderOutput: aiProviderFormController.renderOutput
  },
  status: { set: applicationSaveStatusController.set }
});
const structuralSegmentController = appRuntime.featureFactories.createStructuralSegmentController({
  elements: {
    splitButton: els.splitSegmentBtn,
    mergeButton: els.mergeNextBtn
  },
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    createSplit: appRuntime.commands.createSplitSegmentCommand,
    createMerge: appRuntime.commands.createMergeSegmentCommand,
    setProjectId: (projectId) => {
      state.commandProjectId = projectId;
    },
    changed: applicationCommandHistoryController.render
  },
  selection: {
    getActiveIndex: () => applicationStore.getState().navigation.activeIndex,
    findEditor: (index) => els.segmentBody.querySelector(`tr[data-index="${index}"] textarea`),
    select: (index) =>
      applicationNavigation.selectSegment({
        activeIndex: index,
        segmentId: editorSessionStore.getSegments()[index]?.id || ""
      }),
    focusTarget: targetEditController.focusActive
  },
  mutation: {
    applyTarget: segmentTargetStateService.setTarget,
    touch: segmentTargetStateService.touch,
    detectTags: detectProtectedTags,
    prepareHistoryStates: segmentTargetStateService.prepareHistories,
    prepareRestoreSnapshot: segmentCommandRestorationController.prepareSnapshot
  },
  persistence: {
    flush: autosaveService.flush,
    saveStructure: saveSegmentStructure,
    discardPending: (segmentId) => autosaveService.discard(segmentId)
  },
  view: {
    invalidateFilters: segmentFilterService.invalidate,
    renderAll
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  ids: {
    segment: () => `segment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
  },
  testHooks: {
    beforeSplitSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[SPLIT_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated split save failure");
      }
    },
    beforeMergeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[MERGE_POST_DELETE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated merge transaction failure");
      }
    }
  }
});
structuralSegmentController.mount();

const editorContextController = appRuntime?.featureFactories?.createEditorContextController?.({
  getContext: () => ({
    projectId: editorSessionStore.getProject()?.id || "",
    segmentId: applicationActiveSegmentService.get()?.id || ""
  }),
  renderReview: () =>
    qualityReviewController?.renderReview?.({ segment: applicationActiveSegmentService.get(), force: false }),
  renderHistory: revisionHistoryPresentationService.render,
  renderAi: aiSuggestionListController.render,
  renderQuality: qualityWorkbenchController.render,
  refreshMatches: tmMatchesController.refresh,
  refreshTerms: termSuggestionsController.refresh
});

segmentNavigationController = appRuntime.featureFactories.createSegmentNavigationController({
  session: { getSegments: editorSessionStore.getSegments },
  navigation: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex },
  grid: {
    select: (index, segmentId) => verticalFeatureState?.segmentGrid?.selectSegment(index, segmentId),
    ensureVisible: (position, render) => verticalFeatureState.segmentGrid.ensureVisible(position, render)
  },
  inspector: {
    setContext: (context) => verticalFeatureState?.inspector?.setContext(context)
  },
  confirmation: { renderBusy: segmentConfirmationController.renderBusy },
  filters: {
    visiblePosition: segmentFilterService.visiblePosition,
    isOpen: segmentFilterService.isOpen,
    matches: segmentFilterService.matches,
    resetStatus: () => editorFilterStore.update({ status: "all" })
  },
  presentation: {
    renderSegments,
    updateRow,
    renderPrompt: aiPromptPreviewController.render
  },
  context: { refresh: editorContextController.refresh },
  focus: { target: targetEditController.focusActive },
  statusFilter: els.segmentStatusFilter
});
const segmentActionButtonsController =
  appRuntime.featureFactories.createSegmentActionButtonsController({
    elements: {
      saveTmButton: els.saveTmBtn,
      nextOpenButton: els.nextOpenBtn
    },
    actions: {
      saveToTm: segmentTmSaveController.saveActive,
      nextOpen: segmentNavigationController.nextOpen
    }
  });

const filterPresetController = appRuntime?.featureFactories?.createFilterPresetController?.({
  select: els.filterPresetSelect,
  preferencesRepository: appRuntime.preferencesRepository,
  getProjectId: () => editorSessionStore.getProject()?.id || "",
  applyFilters: async (preset) => {
    editorFilterStore.update({ status: preset.status, reviewState: preset.reviewState, aiState: preset.aiState });
    els.segmentStatusFilter.value = preset.status;
    if (els.reviewStateFilter) els.reviewStateFilter.value = preset.reviewState;
    if (els.aiSegmentFilter) els.aiSegmentFilter.value = preset.aiState;
    segmentFilterService.invalidate();
    renderSegments();
    const first = segmentFilterService.firstVisible();
    if (first !== -1) await segmentNavigationController.select(first);
  },
  setInspectorTab: (tab) => {
    state.inspectorOpen = true;
    void workspaceLayoutController?.setInspectorOpen?.(true);
    verticalFeatureState?.inspector?.setContext?.({ tab });
    renderEditor();
  }
});
const filterPresetReady = filterPresetController?.initialize?.() || Promise.resolve();

const paletteController = appRuntime?.featureFactories?.createPaletteController?.({
  overlay: els.commandPaletteOverlay,
  input: els.commandPaletteInput,
  results: els.commandPaletteResults,
  closeButton: els.closeCommandPaletteBtn,
  triggerButton: els.commandPaletteBtn,
  appShell: document.querySelector(".app-shell"),
  getCommands: commandList,
  translate: uiLocalizationService.source,
  focusController,
  preferencesRepository: appRuntime.preferencesRepository,
  onError: (error) => applicationSaveStatusController.set(error?.message || "Command failed", "dirty")
});
if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "initializing palette controller";
void paletteController?.initialize?.();

const applicationMenuController = appRuntime.featureFactories.createApplicationMenuController({
  documentRoot: document,
  selectors: {
    menus: ".menu",
    openMenus: ".menu[open]",
    buttons: "button"
  }
});
const applicationViewController = appRuntime.featureFactories.createApplicationViewController({
  elements: {
    brandHomeLink: els.brandHomeLink,
    projectsButton: els.projectsViewBtn
  },
  navigation: applicationNavigation,
  context: {
    getProjectId: () => editorSessionStore.getProject()?.id || null,
    getNavigation: () => applicationStore.getState().navigation
  },
  presentation: { renderEditor },
  refresh: {
    projects: refreshProjectSummaries,
    resources: refreshResources
  }
});
const applicationCommandButtonsController =
  appRuntime.featureFactories.createApplicationCommandButtonsController({
    elements: {
      emptyTrashButton: els.emptyTrashBtn,
      undoButton: els.undoBtn,
      redoButton: els.redoBtn
    },
    actions: {
      emptyTrash: applicationTrashController.empty,
      undo: applicationCommandHistoryController.undo,
      redo: applicationCommandHistoryController.redo
    }
  });
const applicationUpdateControlsController =
  appRuntime.featureFactories.createApplicationUpdateControlsController({
    elements: {
      reloadButton: els.reloadUpdateBtn,
      deferButton: els.deferUpdateBtn
    },
    actions: {
      activate: () => offlineUpdateController?.activate?.(),
      defer: () => offlineUpdateController?.defer?.()
    }
  });
const uiLocaleOrchestrationController =
  appRuntime.featureFactories.createUiLocaleOrchestrationController({
    elements: {
      localeSelect: els.uiLocaleSelect,
      importInput: els.uiLocaleImportInput
    },
    locale: uiI18n,
    localization: { source: (value) => uiLocalizationService.source(value) },
    dom: {
      body: document.body,
      createOption: () => document.createElement("option")
    },
    application: {
      dispatchLocale: (locale) =>
        applicationStore?.dispatch?.({
          type: "interface/locale-changed",
          payload: { locale }
        }),
      getView: () => applicationStore.getState().navigation.view
    },
    session: { getProject: () => editorSessionStore.getProject() },
    presentation: {
      renderPanels: () => panelToggleController.renderAll(),
      renderFocusMode: () => focusModeController.render(),
      renderWorkspaceStatus: () => renderWorkspaceStatus(),
      renderProjectStorageStatus: () => renderProjectStorageStatus(),
      renderProjectsView: () => renderProjectsView(),
      renderResourcesView: () => renderResourcesView(),
      renderProjectHome: () => renderProjectHome(),
      renderProjectAnalysis: () => renderProjectAnalysis(),
      renderEditor: () => renderEditor(),
      renderProgress: () => renderProgress(),
      renderReview: () =>
        qualityReviewController?.renderReview?.({ segment: applicationActiveSegmentService.get(), force: false }),
      renderWorkbench: () => qualityWorkbenchController.render(),
      renderRevisionHistory: () => revisionHistoryPresentationService.render(),
      renderQaResults: () => qaResultsController.render(),
      refreshEditorContext: () => editorContextController.refresh()
    },
    downloads: { write: applicationDownloadController.download },
    status: { set: applicationSaveStatusController.set },
    clock: { now: () => new Date() }
  });
const uiLocaleControlsController = appRuntime.featureFactories.createUiLocaleControlsController({
  elements: {
    localeSelect: els.uiLocaleSelect,
    importInput: els.uiLocaleImportInput,
    exportButton: els.exportUiSourceBtn
  },
  loader: { ensure: (locale) => appRuntime.localeLoader.ensure(locale) },
  locale: { set: (locale) => uiI18n?.setLocale?.(locale) },
  presentation: { refresh: uiLocaleOrchestrationController.refresh },
  actions: {
    importCatalog: uiLocaleOrchestrationController.importCatalog,
    exportSource: uiLocaleOrchestrationController.exportSource
  }
});
const projectHomeController = appRuntime.featureFactories.createProjectHomeController({
  elements: {
    projectFilesButton: els.projectFilesBtn,
    deleteButton: els.projectHomeDeleteBtn
  },
  session: {
    getProject: () => editorSessionStore.getProject(),
    getSegments: () => editorSessionStore.getSegments()
  },
  navigation: applicationNavigation,
  presentation: { renderAll },
  actions: { confirmDelete: confirmDeleteProject }
});
const projectFilterControlsController =
  appRuntime.featureFactories.createProjectFilterControlsController({
    elements: {
      searchInput: els.projectSearchInput,
      languagePairFilter: els.languagePairFilter
    },
    presentation: { render: renderProjectsView }
  });
const focusModeController = appRuntime.featureFactories.createFocusModeController({
  elements: {
    body: document.body,
    workspace: els.workspace,
    toggleButton: els.focusModeBtn,
    exitButton: els.exitFocusModeBtn
  },
  store: applicationStore,
  session: { getProject: () => editorSessionStore.getProject() },
  localization: { translate: (key) => uiLocalizationService.translate(key) },
  menu: applicationMenuController,
  frame: { request: (callback) => requestAnimationFrame(callback) },
  editor: {
    renderSegments: (options) => renderSegments(options),
    focusActive: () => targetEditController.focusActive()
  }
});
const globalKeyboardController = appRuntime.featureFactories.createGlobalKeyboardController({
  target: window,
  normalizeKey: applicationTextSafetyService.stableLower,
  commands: {
    getProjectId: () => state.commandProjectId || editorSessionStore.getProject()?.id || null,
    canUndo: (projectId) => Boolean(appRuntime?.commands?.bus?.canUndo?.(projectId)),
    canRedo: (projectId) => Boolean(appRuntime?.commands?.bus?.canRedo?.(projectId)),
    undo: applicationCommandHistoryController.undo,
    redo: applicationCommandHistoryController.redo
  },
  context: {
    getView: () => applicationStore.getState().navigation.view,
    hasProject: () => Boolean(editorSessionStore.getProject())
  },
  palette: {
    isOpen: () => !els.commandPaletteOverlay.classList.contains("hidden"),
    open: paletteController?.open,
    close: paletteController?.close
  },
  concordance: {
    isOpen: () => !els.concordanceOverlay.classList.contains("hidden"),
    open: concordanceController.open,
    close: concordanceController.close
  },
  focus: {
    isActive: () => applicationStore.getState().interface.focusMode,
    toggle: focusModeController.toggle,
    disable: () => focusModeController.set(false)
  }
});

const themeController = appRuntime?.featureFactories?.createThemeController?.({
  documentRoot: document.documentElement,
  themeColorMeta: document.querySelector('meta[name="theme-color"]'),
  select: els.themeSelect,
  preferencesRepository: appRuntime.preferencesRepository,
  matchMedia: window.matchMedia?.bind(window)
});

const workspaceLayoutController = appRuntime?.featureFactories?.createWorkspaceLayoutController?.({
  documentRoot: document.documentElement,
  workspace: els.workspace,
  densitySelect: els.densitySelect,
  resetButton: els.resetLayoutBtn,
  inspector: els.sidebar,
  inspectorResizer: els.inspectorResizer,
  preferencesRepository: appRuntime.preferencesRepository,
  onInspectorPreference: (inspectorOpen) => {
    state.inspectorOpen = inspectorOpen;
    renderEditor();
  }
});
const inspectorToggleController = appRuntime.featureFactories.createInspectorToggleController({
  element: els.inspectorToggleBtn,
  state: {
    getOpen: () => state.inspectorOpen,
    setOpen: (inspectorOpen) => {
      state.inspectorOpen = inspectorOpen;
    }
  },
  layout: {
    setOpen: (inspectorOpen) => workspaceLayoutController?.setInspectorOpen?.(inspectorOpen)
  },
  presentation: { renderEditor },
  frame: { request: (callback) => requestAnimationFrame(callback) },
  selection: {
    getSelected: () => document.querySelector("[data-inspector-tab][aria-selected='true']")
  }
});
const panelToggleController = appRuntime.featureFactories.createPanelToggleController({
  documentRoot: document,
  selectors: {
    toggles: "[data-panel-toggle]",
    panel: "[data-collapsible-panel]",
    heading: "h2, h3"
  },
  localization: { translate: (value) => uiLocalizationService.source(value) },
  inspector: {
    setOpen: (inspectorOpen) => {
      state.inspectorOpen = inspectorOpen;
    },
    persistOpen: (inspectorOpen) => workspaceLayoutController?.setInspectorOpen?.(inspectorOpen),
    setContext: (context) => verticalFeatureState?.inspector?.setContext(context)
  }
});
const editorFilterControlsController =
  appRuntime.featureFactories.createEditorFilterControlsController({
    elements: {
      documentFilter: els.documentFilter,
      searchInput: els.segmentSearchInput,
      searchScope: els.segmentSearchScope,
      regexInput: els.segmentRegexInput,
      caseInput: els.segmentCaseInput,
      statusFilter: els.segmentStatusFilter,
      reviewStateFilter: els.reviewStateFilter,
      aiStateFilter: els.aiSegmentFilter
    },
    navigation: applicationNavigation,
    store: editorFilterStore,
    filters: { firstVisible: segmentFilterService.firstVisible },
    presentation: { renderSegments, renderProgress },
    preset: { markCustom: () => filterPresetController?.markCustom?.() },
    selection: { select: (index) => segmentNavigationController.select(index) }
  });
const applicationPersistenceLifecycleController =
  appRuntime.featureFactories.createApplicationPersistenceLifecycleController({
    targets: { window, document },
    visibility: { getState: () => document.visibilityState },
    pending: { hasImport: () => Boolean(state.importTask) },
    autosave: {
      size: () => autosaveService.size(),
      flush: () => autosaveService.flush()
    },
    workspace: {
      hasUnsaved: hasUnsavedWorkspacePackages,
      autosaveDirty: () => workspacePackageSaveController.autosaveDirty()
    },
    logger: { warn: (error) => console.warn(error) }
  });
const applicationEventWiringController =
  appRuntime.featureFactories.createApplicationEventWiringController({
    checkpoint: (message) => {
      if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = message;
    },
    initialization: {
      renderLanguageDatalists: () => languageInputService.renderDatalists(),
      renderTextEncodingOptions: () => textEncodingInputService.renderOptions()
    },
    segmentGrid: {
      mountScroll: (listener) => verticalFeatureState.segmentGrid.mountScroll(listener),
      renderSegments: (options) => renderSegments(options)
    },
    lifecycles: {
      applicationMenu: applicationMenuController,
      globalKeyboard: globalKeyboardController,
      applicationView: applicationViewController,
      commandButtons: applicationCommandButtonsController,
      updateControls: applicationUpdateControlsController,
      uiLocaleControls: uiLocaleControlsController,
      projectHome: projectHomeController,
      focusMode: focusModeController,
      inspectorToggle: inspectorToggleController,
      palette: paletteController,
      projectFilterControls: projectFilterControlsController,
      segmentActionButtons: segmentActionButtonsController,
      projectQa: projectQaController,
      panelToggle: panelToggleController,
      editorFilterControls: editorFilterControlsController,
      termForm: termFormController,
      projectDomain: projectDomainController,
      applicationPersistence: applicationPersistenceLifecycleController
    }
  });
const applicationStartupController = appRuntime.featureFactories.createApplicationStartupController({
  reporting: {
    checkpoint: (message) => {
      if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = message;
    },
    progress: (message) => {
      if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = message;
    }
  },
  locale: { initialize: () => appRuntime.localeLoader.initialize() },
  ui: {
    initialize: () => uiI18n?.init?.(),
    renderLocaleOptions: uiLocaleOrchestrationController.renderOptions
  },
  wiring: applicationEventWiringController,
  workspace: {
    startAutosave: () => workspacePackageSaveController.startAutosave(),
    restoreDirty: () => restoreWorkspaceDirtyIds(),
    reconnect: workspaceStorage ? () => workspaceStorage.reconnectSavedWorkspace() : null,
    assignStatus: (workspaceStatus) => {
      state.workspaceStatus = workspaceStatus;
    },
    renderStatus: () => renderWorkspaceStatus()
  },
  durability: { refresh: applicationStorageDurabilityController.refresh },
  projects: {
    load: (restoreSelection) => loadProjects(restoreSelection),
    count: () => editorSessionStore.getProjects().length
  },
  preferences: {
    theme: themeController,
    layout: workspaceLayoutController
  },
  workflow: { run: () => (LOOPCAT_TEST_BUILD ? runAppWorkflowTest() : undefined) },
  offline: { register: () => registerOfflineAppShell() },
  errors: {
    log: (error) => console.error(error),
    setStatus: applicationSaveStatusController.set
  }
});

const diagnosticsService = appRuntime?.featureFactories?.createDiagnosticsService?.({
  platform: appRuntime.platform,
  browserNavigator: navigator,
  browserPerformance: performance,
  appVersion: window.LoopCATProductionAssets?.appVersion || "",
  getProjectSummary: async () => {
    const segments = await appRuntime.storageRepository.getAll("segments");
    const counts = new Map();
    for (const segment of segments) counts.set(segment.projectId, (counts.get(segment.projectId) || 0) + 1);
    return {
      projectCount: editorSessionStore.getProjects().length,
      segmentCount: segments.length,
      largestProjectSegmentCount: Math.max(0, ...counts.values())
    };
  },
  getInterfaceSummary: () => ({
    locale: uiLocalizationService.locale(),
    theme: themeController?.getPreference?.() || "light",
    density: workspaceLayoutController?.getState?.().density || "balanced",
    offlineUpdateAvailable: !els.updateReadyBanner?.classList.contains("hidden")
  }),
  getLastError: () => appRuntime.status.controller.getLastError()
});

const diagnosticsController = appRuntime?.featureFactories?.createDiagnosticsController?.({
  dialog: els.diagnosticsDialog,
  summaryList: els.diagnosticsSummary,
  preview: els.diagnosticsPreview,
  message: els.diagnosticsMessage,
  exportButton: els.exportDiagnosticsBtn,
  hardwareButton: els.diagnosticsHardwareBtn,
  service: diagnosticsService,
  platform: appRuntime.platform,
  download: (text, filename, type) => applicationDownloadController.download(filename, text, type),
  translate: uiLocalizationService.source
});

const dialogLifecycleController = appRuntime?.featureFactories?.createDialogController?.({
  focusController,
  getActiveElement: () => document.activeElement,
  onError: (error, context) => {
    if (context?.id === "diagnostics" && els.diagnosticsMessage) {
      els.diagnosticsMessage.textContent = uiLocalizationService.source(error?.message || "Diagnostics could not be collected.");
      return;
    }
    applicationSaveStatusController.set(error?.message || "Dialog could not be opened.", "dirty");
  }
});
dialogLifecycleController?.register?.({
  id: "about",
  dialog: els.aboutDialog,
  opener: els.aboutBtn,
  closer: els.closeAboutBtn,
  initialFocus: els.closeAboutBtn
});
dialogLifecycleController?.register?.({
  id: "diagnostics",
  dialog: els.diagnosticsDialog,
  opener: els.diagnosticsBtn,
  closer: els.closeDiagnosticsBtn,
  initialFocus: els.closeDiagnosticsBtn,
  returnTarget: els.workspaceMenuSummary,
  afterOpen: () => {
    void diagnosticsController?.refresh?.().catch((error) => {
      els.diagnosticsMessage.textContent = uiLocalizationService.source(error?.message || "Diagnostics could not be collected.");
    });
  }
});
dialogLifecycleController?.register?.({
  id: "trash",
  dialog: els.trashDialog,
  opener: els.trashBtn,
  closer: els.closeTrashBtn,
  initialFocus: els.closeTrashBtn,
  beforeOpen: applicationTrashController.renderList
});
let projectExportController;
let workspacePackageSaveController;
let workspaceSyncController;
let workspaceBackupExportController;
let workspaceHealthRepairController;
const recoveryWorkspaceController = appRuntime?.featureFactories?.createRecoveryWorkspaceController?.({
  elements: {
    menu: els.workspaceMenu,
    menuSummary: els.workspaceMenuSummary,
    health: els.workspaceHealth,
    chooseWorkspaceButton: els.chooseWorkspaceBtn,
    saveProjectButton: els.saveWorkspaceProjectBtn,
    syncWorkspaceButton: els.syncWorkspaceBtn,
    exportWorkspaceBackupButton: els.workspaceBackupBtn,
    repairWorkspaceButton: els.repairWorkspaceBtn,
    recoveryPanel: els.workspaceRecoveryPanel,
    recoveryMessage: els.workspaceRecoveryMessage,
    recoveryList: els.workspaceRecoveryList,
    saveRecoveryButton: els.workspaceRecoverySaveBtn,
    openRecoveryButton: els.workspaceRecoveryOpenBtn,
    dismissRecoveryButton: els.workspaceRecoveryDismissBtn,
    backupReminderPanel: els.backupReminderPanel,
    backupReminderMessage: els.backupReminderMessage,
    exportRecoveryCopyButton: els.backupReminderExportBtn,
    dismissBackupReminderButton: els.backupReminderDismissBtn,
    projectStorageStatus: els.projectStorageStatus,
    saveProjectToFolderInput: els.saveProjectToFolderInput,
    projectChooseWorkspaceButton: els.projectChooseWorkspaceBtn
  },
  translate: uiLocalizationService.translate,
  source: uiLocalizationService.source,
  label: uiLocalizationService.label,
  formatDateTime,
  safeText: applicationTextSafetyService.displaySafeText,
  chooseWorkspace: (...args) => workspacePackageSaveController.chooseFolder(...args),
  saveProject: (...args) => workspacePackageSaveController.saveCurrent(...args),
  syncWorkspace: () => fileImportService.runTask("Workspace sync", () => workspaceSyncController.sync()),
  exportWorkspaceBackup: (...args) => workspaceBackupExportController.exportBackup(...args),
  repairWorkspace: (...args) => workspaceHealthRepairController.repair(...args),
  saveRecovery: (...args) => workspacePackageSaveController.saveRecovery(...args),
  exportRecoveryCopy: (...args) => projectExportController.exportProjectPackage(...args),
  dismissBackupReminder: () => dismissBackupReminder(),
  scheduleFrame: requestAnimationFrame,
  onError: (error, context) => {
    if (error?.name === "AbortError" && context?.phase === "choose-workspace") return;
    const fallback = {
      "choose-workspace": uiLocalizationService.source("Could not choose workspace folder"),
      "save-project": uiLocalizationService.source("Project package save failed"),
      "sync-workspace": uiLocalizationService.source("Workspace sync failed"),
      "export-workspace-backup": uiLocalizationService.source("Workspace backup failed"),
      "repair-workspace": uiLocalizationService.source("Workspace repair check failed"),
      "save-recovery": uiLocalizationService.source("Workspace recovery save failed"),
      "export-recovery-copy": uiLocalizationService.source("Recovery copy export failed"),
      "dismiss-backup-reminder": uiLocalizationService.source("Backup reminder could not be dismissed")
    }[context?.phase] || uiLocalizationService.source("Workspace action failed");
    applicationSaveStatusController.set(error?.message || fallback, "dirty");
    if (context?.phase === "save-recovery") renderWorkspaceRecoveryPanel();
  }
});
recoveryWorkspaceController?.mount?.();
const projectPackagePortabilityService =
  appRuntime.featureFactories.createProjectPackagePortabilityService({
    validation: { validate: validatePackage },
    storage: { getAll },
    records: { sanitize: sanitizePortableValue },
    ids: { make: makeId },
    projects: { getAll: editorSessionStore.getProjects },
    clock: { now: () => new Date().toISOString() }
  });
const projectExportBuildService =
  appRuntime.featureFactories.createProjectExportBuildService({
    session: {
      getProject: editorSessionStore.getProject,
      getSegments: editorSessionStore.getSegments
    },
    autosave: { flush: autosaveService.flush },
    storage: {
      getProjectSegments,
      getAllByIndex,
      listTerms,
      listActivityEvents,
      exportAllData
    },
    resources: {
      getLinks: projectResourceLinks,
      getTmNames: projectTmNames,
      getTermBaseNames: projectTermBaseNames
    },
    documents: { manifest: projectDocumentManifest },
    ai: { normalizeProjectSettings: aiRuntimeSettingsService.normalizeProjectSettings },
    portable: {
      createContext: createPortableSanitizerContext,
      sanitize: sanitizePortableValue,
      validateProjectPackage: projectPackagePortabilityService.validate,
      hasOriginalLocalizationStructure: projectPackagePortabilityService.hasOriginalLocalizationStructure
    },
    backup: { validate: validateBackupFile },
    validation: { summary: reportSummary },
    workspace: { isConnected: () => Boolean(state.workspaceStatus?.connected) },
    constants: {
      appName: APP_NAME,
      projectPackageSchemaVersion: storageConstants.PROJECT_PACKAGE_SCHEMA_VERSION
    },
    clock: { now: () => new Date().toISOString() }
  });
workspaceBackupExportController =
  appRuntime.featureFactories.createWorkspaceBackupExportController({
    connection: {
      isConnected: () => Boolean(workspaceStorage && state.workspaceStatus?.connected)
    },
    build: projectExportBuildService,
    storage: {
      exportFullBackup: (backup) => workspaceStorage.exportFullBackup(backup),
      getStatus: () => workspaceStorage.getStatus()
    },
    workspace: {
      setStatus: (workspaceStatus) => {
        state.workspaceStatus = workspaceStatus;
      }
    },
    validation: {
      count: reportCount,
      errorReport: fileImportService.errorReport
    },
    presentation: {
      renderWorkspaceStatus,
      renderValidation: renderValidationReport
    },
    status: { set: applicationSaveStatusController.set }
  });
workspaceHealthRepairController =
  appRuntime.featureFactories.createWorkspaceHealthRepairController({
    connection: {
      isConnected: () => Boolean(workspaceStorage && state.workspaceStatus?.connected)
    },
    storage: {
      repairManifest: () => workspaceStorage.repairWorkspaceManifest(),
      getStatus: () => workspaceStorage.getStatus(),
      buildHealthReport: (input) => workspaceStorage.buildHealthReport(input)
    },
    workspace: {
      setStatus: (workspaceStatus) => {
        state.workspaceStatus = workspaceStatus;
      }
    },
    resources: {
      listTmEntries,
      listTerms: () => getAll("terms")
    },
    session: editorSessionStore,
    dirty: { ids: workspaceDirtyIds },
    presentation: {
      renderValidation: renderValidationReport,
      renderWorkspaceStatus
    },
    status: { set: applicationSaveStatusController.set }
  });
projectExportController = appRuntime.featureFactories.createProjectExportController({
  build: projectExportBuildService,
  session: editorSessionStore,
  persistence: {
    updateProject,
    bulkPut,
    listActivityEvents
  },
  activity: {
    draft: draftProjectActivityEvent,
    appendWarning: appendActivityWarning
  },
  files: {
    safeName: applicationTextSafetyService.fileSafeName,
    download: applicationDownloadController.download
  },
  validation: {
    count: reportCount,
    errorReport: fileImportService.errorReport
  },
  presentation: {
    renderValidation: renderValidationReport,
    renderEditor,
    renderBackupReminder
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set, mode: exportStatusMode },
  clock: {
    now: () => new Date().toISOString(),
    nowMs: () => Date.now()
  },
  test: {
    shouldFailActivity: () =>
      Boolean(LOOPCAT_TEST_BUILD && editorSessionStore.getProject()?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG])
  },
  logger: console
});
workspacePackageSaveController =
  appRuntime.featureFactories.createWorkspacePackageSaveController({
    storage: {
      isSupported: () => Boolean(workspaceStorage?.isSupported()),
      chooseFolder: (options) => workspaceStorage.chooseWorkspaceFolder(options),
      getStatus: () => workspaceStorage.getStatus(),
      saveProjectPackage: (pkg) => workspaceStorage.saveProjectPackage(pkg)
    },
    session: {
      getProject: editorSessionStore.getProject,
      replaceActivityEvents: editorSessionStore.replaceActivityEvents
    },
    autosave: { flush: autosaveService.flush },
    build: projectExportBuildService,
    projects: {
      knownById: knownProjectById,
      list: listProjects
    },
    activity: {
      draft: draftProjectActivityEvent,
      bulkPut,
      list: listActivityEvents
    },
    workspace: {
      isConnected: () => Boolean(state.workspaceStatus?.connected),
      setStatus: (status) => {
        state.workspaceStatus = status;
      },
      markMissingLocalDirty: markLocalProjectsMissingFromWorkspaceDirty,
      clearDirty: clearWorkspaceDirty,
      markDirty: markWorkspaceDirty,
      hasDirty: () => Boolean(state.workspaceDirtyProjectIds.size),
      dirtyIds: workspaceDirtyIds,
      recoveryIds: workspaceRecoveryProjectIds,
      isAutosaving: () => Boolean(state.workspaceAutosaving),
      setAutosaving: (value) => {
        state.workspaceAutosaving = value;
      },
      getAutosaveTimer: () => state.workspaceAutosaveTimer,
      setAutosaveTimer: (timer) => {
        state.workspaceAutosaveTimer = timer;
      }
    },
    validation: { count: reportCount },
    presentation: {
      renderWorkspaceStatus,
      renderValidation: renderValidationReport,
      renderBackupReminder,
      renderRecovery: renderWorkspaceRecoveryPanel
    },
    status: { set: applicationSaveStatusController.set },
    preferences: {
      saveToFolder: () => Boolean(els.saveProjectToFolderInput?.checked)
    },
    timers: {
      clear: (timer) => clearInterval(timer),
      set: (callback, delayMs) => setInterval(callback, delayMs)
    },
    test: {
      shouldFailActivity: () => Boolean(LOOPCAT_TEST_BUILD && state[WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG])
    },
    logger: console
  });
const projectImportRestoreController =
  appRuntime.featureFactories.createProjectImportRestoreController({
    files: {
      progress: applicationImportProgressController.reportProgress,
      parseJson: fileImportService.parseJson
    },
    portability: projectPackagePortabilityService,
    backup: { validate: validateBackupFile },
    session: editorSessionStore,
    autosave: { flush: autosaveService.flush },
    persistence: {
      importProjectPackageRecords,
      importAllData
    },
    indexes: {
      rebuildTm: rebuildAllTmIndexes,
      rebuildTerms: rebuildAllTermIndexes
    },
    activity: {
      logForProject: logOptionalActivityForProject,
      appendWarning: appendActivityWarning
    },
    navigation: {
      openProjects: applicationNavigation.openProjects,
      clearSelection: applicationNavigation.clearSelection
    },
    projects: {
      load: loadProjects,
      open: openProject
    },
    workspace: {
      isConnected: () => Boolean(state.workspaceStatus?.connected),
      clearDirty: clearWorkspaceDirty,
      markDirty: markWorkspaceDirty,
      clearDirtyMarkers: clearWorkspaceDirtyMarkers,
      markProjectsDirty: markWorkspaceProjectsDirty
    },
    validation: {
      count: reportCount,
      alertText: validationAlertText
    },
    presentation: {
      renderValidation: renderValidationReport,
      renderWorkspaceStatus
    },
    status: { set: applicationSaveStatusController.set, mode: exportStatusMode },
    localization: {
      alert: uiLocalizationService.alert,
      confirm: uiLocalizationService.confirm
    },
    text: { safe: applicationTextSafetyService.displaySafeText }
  });
workspaceSyncController = appRuntime.featureFactories.createWorkspaceSyncController({
  connection: {
    isConnected: () => Boolean(workspaceStorage && state.workspaceStatus?.connected)
  },
  autosave: { flush: autosaveService.flush },
  packages: {
    list: () => workspaceStorage.listProjectPackages(),
    read: (reference) => workspaceStorage.readProjectPackage(reference)
  },
  dirty: { has: (projectId) => state.workspaceDirtyProjectIds.has(projectId) },
  imports: { importProjectPackageData: projectImportRestoreController.importProjectPackageData },
  validation: { count: reportCount },
  text: { redact: applicationTextSafetyService.redactSensitiveText },
  session: editorSessionStore,
  navigation: {
    openProjects: applicationNavigation.openProjects,
    clearSelection: applicationNavigation.clearSelection
  },
  projects: { load: loadProjects },
  workspace: {
    getStatus: () => workspaceStorage.getStatus(),
    setStatus: (workspaceStatus) => {
      state.workspaceStatus = workspaceStatus;
    }
  },
  presentation: {
    renderWorkspaceStatus,
    renderValidation: renderValidationReport
  },
  status: { set: applicationSaveStatusController.set }
});
const projectDocumentImportController =
  appRuntime.featureFactories.createProjectDocumentImportController({
    session: editorSessionStore,
    catalog: {
      list: projectDocumentCatalogService.list,
      manifest: projectDocumentManifest
    },
    files: {
      assertSize: fileImportService.assertSize,
      maxBytes: MAX_PROJECT_IMPORT_BYTES
    },
    formats: {
      extractDocx: extractDocxSegments,
      parseLocalization: parseLocalizationFile,
      parseXliff: parseXliffFile,
      decodingOptions: textEncodingInputService.decodingOptions,
      isXliffType: (extension) => XLIFF_DOCUMENT_TYPES.has(extension)
    },
    repository: {
      append: appendProjectSegmentsAndUpdateProject,
      getProjectSegments
    },
    histories: { prepare: segmentTargetStateService.prepareHistories },
    progress: { report: applicationImportProgressController.reportProgress },
    ids: { next: () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()) },
    summaries: { refresh: refreshProjectSummaries },
    navigation: { selectDocument: applicationNavigation.selectDocument },
    activity: {
      log: logOptionalProjectActivity,
      appendWarning: appendActivityWarning
    },
    workspace: { markDirty: markWorkspaceDirty },
    status: { set: applicationSaveStatusController.set, mode: exportStatusMode },
    presentation: {
      renderAll,
      refreshEditorContext: editorContextController.refresh
    },
    text: {
      lower: applicationTextSafetyService.stableLower,
      safe: applicationTextSafetyService.displaySafeText
    },
    confirm: uiLocalizationService.confirm
  });
const importExportController = appRuntime?.featureFactories?.createImportExportController?.({
  elements: {
    projectFileImportButton: els.projectFileImportBtn,
    projectsImportProjectButton: els.projectsImportProjectBtn,
    projectFileImportInput: els.projectFileImportInput,
    docxInput: els.docxInput,
    localizationInput: els.localizationInput,
    projectPackageImportInput: els.projectPackageImportInput,
    backupImportInput: els.backupImportInput,
    tmxImportInput: els.tmxImportInput,
    tbxImportInput: els.tbxImportInput,
    termListImportInput: els.termListImportInput,
    projectPackageExportButton: els.projectPackageExportBtn,
    exportTargetDocxButton: els.exportDocxBtn,
    exportBilingualDocxButton: els.exportBilingualDocxBtn,
    exportTargetTextButton: els.exportTargetBtn,
    exportLocalizationButton: els.exportLocalizationBtn,
    exportXliff12Button: els.exportXliffBtn,
    exportXliff22Button: els.exportXliff22Btn,
    exportProjectReportButton: els.exportProjectReportBtn,
    exportQualityPassportButton: els.exportQualityPassportMenuBtn,
    exportAnonymizedReportButton: els.exportAnonymizedProjectReportBtn,
    tmxExportButton: els.tmxExportBtn,
    tbxExportButton: els.tbxExportBtn,
    backupExportButton: els.backupExportBtn,
    validationPanel: els.validationReportPanel,
    validationMeta: els.validationReportMeta,
    validationList: els.validationReportList,
    fileEncodingSelect: els.fileEncodingSelect,
    resourceTmxImportInput: els.resourceTmxImportInput,
    resourceTbxImportInput: els.resourceTbxImportInput,
    resourceTermListImportInput: els.resourceTermListImportInput
  },
  hasProject: () => Boolean(editorSessionStore.getProject()),
  runImportTask: fileImportService.runTask,
  importProjectFile: projectDocumentImportController.importFile,
  importProjectPackage: async (file) => {
    await autosaveService.flush();
    return projectImportRestoreController.importProjectPackage(file);
  },
  restoreBackup: async (file) => {
    await autosaveService.flush();
    return projectImportRestoreController.restoreBackupFile(file);
  },
  importTmx: projectResourceTransferController.importTmx,
  importTbx: projectResourceTransferController.importTbx,
  importTermList: projectResourceTransferController.importTermList,
  exportProjectPackage: projectExportController.exportProjectPackage,
  exportTargetDocx: deliveryExportController.exportTargetDocx,
  exportBilingualDocx: deliveryExportController.exportBilingualDocx,
  exportTargetText: deliveryExportController.exportTargetText,
  exportLocalization: deliveryExportController.exportLocalization,
  exportXliff12: deliveryExportController.exportXliff12,
  exportXliff22: deliveryExportController.exportXliff22,
  exportProjectReport: reportExportController.exportProjectReport,
  exportQualityPassport: reportExportController.exportQualityPassport,
  exportAnonymizedReport: reportExportController.exportAnonymizedReport,
  exportTmx: projectResourceTransferController.exportTmx,
  exportTbx: projectResourceTransferController.exportTbx,
  exportBackup: projectExportController.exportBrowserBackup,
  onValidationDismiss: () => {
    state.lastValidationReport = null;
  },
  scheduleFrame: requestAnimationFrame,
  onError: (error, context) => {
    console.warn(`Import/export action failed (${context?.phase || "unknown"}).`, error);
    applicationSaveStatusController.set(
      error?.message || uiLocalizationService.source("Import or export action failed."),
      "dirty"
    );
  }
});
importExportController?.mount?.();
const resourceCatalogService = appRuntime.featureFactories.createResourceCatalogService({
  getState: () => resourcesController?.getState?.() || { tmEntries: [], terms: [] }
});
const projectResourceSelectionController =
  appRuntime.featureFactories.createProjectResourceSelectionController({
    elements: {
      dialog: els.projectDialog,
      sourceLanguageInput: els.sourceLangInput,
      targetLanguageInput: els.targetLangInput,
      tmResourceList: els.projectTmResourceList,
      tbResourceList: els.projectTbResourceList,
      newTmNameInput: els.newTmNameInput,
      newTermBaseNameInput: els.newTermBaseNameInput
    },
    getProject: () => editorSessionStore.getProject(),
    getMode: () => projectDialogController?.getMode?.() || null,
    normalizeLanguageValue: languageInputService.normalizeInput,
    normalizeLanguageInput: languageInputService.normalizeElement,
    projectResources: {
      tmNames: projectTmNames,
      termBaseNames: projectTermBaseNames,
      mainTmName,
      links: projectResourceLinks
    },
    catalog: resourceCatalogService,
    localization: uiLocalizationService,
    presentation: {
      replaceSafeHtml,
      escapeHtml: applicationTextSafetyService.escapeHtml,
      displaySafeHtml: applicationTextSafetyService.displaySafeHtml,
      languagePairDisplay: languageInputService.pairDisplay
    },
    names: { unique: uniqueNames, clean: cleanProjectText },
    makeId
  });
const projectLanguagePairShortcutsController =
  appRuntime.featureFactories.createProjectLanguagePairShortcutsController({
    root: els.frequentLanguagePairs,
    getProjects: () => editorSessionStore.getProjects(),
    getCurrentValues: projectResourceSelectionController.values,
    normalizeLanguage: languageInputService.normalizeInput,
    defaultPairs: DEFAULT_LANGUAGE_PAIRS,
    languagePairDisplay: languageInputService.pairDisplay,
    escapeHtml: applicationTextSafetyService.escapeHtml,
    replaceSafeHtml
  });
const projectDialogSaveController =
  appRuntime.featureFactories.createProjectDialogSaveController({
    form: {
      hasValidityCheck: () => Boolean(els.projectForm?.checkValidity),
      checkValidity: () => els.projectForm.checkValidity(),
      reportValidity: () => els.projectForm.reportValidity?.(),
      name: () => els.projectNameInput.value,
      creator: () => els.projectCreatorInput?.value || "",
      domain: () => els.projectDomainInput.value,
      saveToFolder: () => Boolean(els.saveProjectToFolderInput?.checked),
      setSaveToFolder: (value) => {
        els.saveProjectToFolderInput.checked = value;
      },
      reset: () => els.projectForm.reset(),
      clearNewTmName: () => {
        els.newTmNameInput.value = "";
      },
      clearNewTermBaseName: () => {
        els.newTermBaseNameInput.value = "";
      },
      close: () => els.projectDialog.close()
    },
    mode: { get: () => projectDialogController?.getMode?.() || null },
    resources: {
      collect: projectResourceSelectionController.collect,
      mainTmName,
      tmNames: projectTmNames,
      termBaseNames: projectTermBaseNames
    },
    session: editorSessionStore,
    projects: {
      update: updateProject,
      create: createProject,
      load: loadProjects,
      open: openProject
    },
    creator: { remember: rememberCreatorName },
    language: {
      setSource: (value) => languageInputService.setInput(els.sourceLangInput, value),
      setTarget: (value) => languageInputService.setInput(els.targetLangInput, value)
    },
    refresh: {
      terms: refreshProjectTerms,
      summaries: refreshProjectSummaries,
      editorContext: editorContextController.refresh
    },
    presentation: {
      renderAll,
      renderStorageStatus: renderProjectStorageStatus
    },
    activity: {
      logProject: logProjectActivity,
      record: recordActivityEvent
    },
    workspace: {
      isSupported: () => Boolean(workspaceStorage?.isSupported()),
      isConnected: () => Boolean(state.workspaceStatus?.connected),
      chooseFolder: workspacePackageSaveController.chooseFolder,
      markDirty: markWorkspaceDirty,
      maybeSaveFromSettings: workspacePackageSaveController.maybeSaveFromSettings
    },
    status: { set: applicationSaveStatusController.set },
    test: {
      shouldFailSettingsActivity: () =>
        Boolean(LOOPCAT_TEST_BUILD && els.projectForm[PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG]),
      shouldFailCreationActivity: () =>
        Boolean(LOOPCAT_TEST_BUILD && els.projectForm[CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG])
    },
    logger: console
  });
const projectDialogController = appRuntime?.featureFactories?.createProjectDialogController?.({
  dialogLifecycle: dialogLifecycleController,
  elements: {
    dialog: els.projectDialog,
    form: els.projectForm,
    title: els.projectDialogTitle,
    saveButton: els.saveProjectBtn,
    cancelButton: els.cancelProjectBtn,
    nameInput: els.projectNameInput,
    creatorInput: els.projectCreatorInput,
    domainInput: els.projectDomainInput,
    sourceLanguageInput: els.sourceLangInput,
    targetLanguageInput: els.targetLangInput,
    advancedOptions: els.projectAdvancedOptions,
    saveToFolderInput: els.saveProjectToFolderInput,
    chooseWorkspaceButton: els.projectChooseWorkspaceBtn,
    storageStatus: els.projectStorageStatus,
    tmResourceList: els.projectTmResourceList,
    tbResourceList: els.projectTbResourceList,
    newTmNameInput: els.newTmNameInput,
    newTermBaseNameInput: els.newTermBaseNameInput,
    frequentPairs: els.frequentLanguagePairs,
    aiSettingsForm: els.aiSettingsForm,
    aiOptions: els.projectAiOptions,
    aiPresetSelect: els.localAiPresetSelect
  },
  openers: [
    { element: els.newProjectBtn, mode: "create" },
    { element: els.projectSettingsBtn, mode: "edit" },
    { element: els.editorProjectSettingsBtn, mode: "edit" },
    { element: els.openProjectAiSettingsBtn, mode: "edit", focusAi: true }
  ],
  getProject: () => editorSessionStore.getProject(),
  refreshResources,
  suggestedCreatorName,
  cleanCreatorName,
  setLanguageValue: languageInputService.setInput,
  normalizeLanguageValue: languageInputService.normalizeElement,
  renderStorageStatus: renderProjectStorageStatus,
  renderResourcePickers: projectResourceSelectionController.render,
  renderFrequentPairs: projectLanguagePairShortcutsController.render,
  save: projectDialogSaveController.save,
  chooseWorkspace: workspacePackageSaveController.chooseFolder,
  workspaceSupported: () => Boolean(workspaceStorage?.isSupported()),
  translate: uiLocalizationService.source,
  scheduleFrame: requestAnimationFrame,
  onError: (error) => applicationSaveStatusController.set(error?.message || "Dialog could not be opened.", "dirty")
});
projectDialogController?.mount?.();
const tmPretranslationDialogController = appRuntime?.featureFactories?.createTmPretranslationDialogController?.({
  dialogLifecycle: dialogLifecycleController,
  elements: {
    dialog: els.tmPretranslateDialog,
    thresholdInput: els.tmPretranslateThresholdInput
  },
  defaultThreshold: 85,
  scheduleFrame: requestAnimationFrame,
  onError: (error) =>
    applicationSaveStatusController.set(
      error?.message || "TM pretranslation settings could not be opened.",
      "dirty"
    )
});
const opusCatHelpController = appRuntime?.featureFactories?.createOpusCatHelpController?.({
  dialogLifecycle: dialogLifecycleController,
  elements: {
    dialog: els.opusCatHelpDialog,
    opener: els.localAiOpusCatHelpBtn,
    closer: els.closeOpusCatHelpBtn,
    retryButton: els.retryOpusCatConnectionBtn
  },
  retryConnection: aiProviderAdministrationOperationsController.testConnection,
  onError: (error) =>
    applicationSaveStatusController.set(
      error?.message || "OPUS-CAT connection help could not complete the action.",
      "dirty"
    )
});
opusCatHelpController?.mount?.();
const resourceLibraryImportController =
  appRuntime.featureFactories.createResourceLibraryImportController({
    forms: {
      tmName: () => els.tmResourceNameInput.value,
      tbName: () => els.tbResourceNameInput.value,
      tmSourceLanguageInput: els.tmResourceSourceLangInput,
      tmTargetLanguageInput: els.tmResourceTargetLangInput,
      tbSourceLanguageInput: els.tbResourceSourceLangInput,
      tbTargetLanguageInput: els.tbResourceTargetLangInput,
      normalizeLanguageInput: languageInputService.normalizeElement
    },
    files: {
      assertSize: (file, label) => fileImportService.assertSize(file, label, MAX_RESOURCE_IMPORT_BYTES),
      readText: fileImportService.readText,
      reportProgress: applicationImportProgressController.reportProgress,
      progressDetail: fileImportService.progressDetail,
      yieldToUi: applicationImportProgressController.yieldToUi
    },
    parsers: {
      parseTmx: parseTmxAsync,
      parseTbx: parseTbxAsync,
      parseTermList,
      parseTermWorkbook
    },
    repositories: { importTmEntries, importTerms },
    resources: {
      markProjectsUsingDirty: markProjectsUsingResourceDirty,
      open: (...args) => resourcesController?.openResource?.(...args),
      refresh: refreshResources,
      refreshProjectTerms
    },
    alert: uiLocalizationService.alert,
    status: { set: applicationSaveStatusController.set }
  });
const resourceLibraryExportController =
  appRuntime.featureFactories.createResourceLibraryExportController({
    resources: { labelFromKey: resourceCatalogService.labelFromKey, items: resourceItems },
    builders: { buildTmx, buildTbx },
    fileSafeName: applicationTextSafetyService.fileSafeName,
    download: applicationDownloadController.download,
    status: { set: applicationSaveStatusController.set }
  });
const resourceMutationController = appRuntime.featureFactories.createResourceMutationController({
  session: { getProjectId: () => editorSessionStore.getProject()?.id || null },
  repositories: { updateTmEntry, updateTerm },
  resources: {
    markProjectsUsingDirty: markProjectsUsingResourceDirty,
    refresh: refreshResources,
    refreshProjectTerms,
    labelFromKey: resourceCatalogService.labelFromKey,
    items: resourceItems
  },
  commands: {
    execute: (...args) => appRuntime.commands.bus.execute(...args),
    createDeleteEntry: appRuntime.commands.createDeleteResourceEntryCommand,
    createDeleteResource: appRuntime.commands.createDeleteResourceCommand,
    setProjectId: (projectId) => {
      state.commandProjectId = projectId;
    }
  },
  trash: {
    entryFromCommandResult: applicationCommandHistoryController.entryFromCommandResult,
    synchronize: applicationCommandHistoryController.synchronize
  },
  presentation: { renderUndo: applicationCommandHistoryController.render },
  status: { set: applicationSaveStatusController.set },
  testHooks: {
    beforeSaveTm: (entry) => {
      if (LOOPCAT_TEST_BUILD && entry[RESOURCE_TM_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated TM resource save failure");
      }
    },
    beforeSaveTerm: (term) => {
      if (LOOPCAT_TEST_BUILD && term[RESOURCE_TERM_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated term resource save failure");
      }
    },
    beforeDeleteTm: (entry) => {
      if (LOOPCAT_TEST_BUILD && entry[RESOURCE_TM_DELETE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated TM resource delete failure");
      }
    },
    beforeDeleteTerm: (term) => {
      if (LOOPCAT_TEST_BUILD && term[RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated term resource delete failure");
      }
    },
    beforeDeleteResource: (type, key) => {
      if (LOOPCAT_TEST_BUILD && RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.has(`${type}:${key}`)) {
        throw new Error(`Simulated ${type === "tm" ? "TM" : "termbase"} resource delete failure`);
      }
    }
  },
  logger: console
});
const resourcesPresentationService = appRuntime?.featureFactories?.createResourcesPresentationService?.({
  elements: {
    tmDashboard: els.tmResourceDashboard,
    tbDashboard: els.tbResourceDashboard,
    tmDetail: els.tmResourceDetail,
    tbDetail: els.tbResourceDetail
  },
  document,
  summarizeResources: resourceCatalogService.summarize,
  labelFromKey: resourceCatalogService.labelFromKey,
  items: resourceItems,
  localization: uiLocalizationService,
  languagePairDisplay: languageInputService.pairDisplay,
  formatDate,
  displaySafeHtml: applicationTextSafetyService.displaySafeHtml,
  displaySafeText: applicationTextSafetyService.displaySafeText,
  escapeHtml: applicationTextSafetyService.escapeHtml,
  replaceSafeHtml
});
const resourcesController = appRuntime?.featureFactories?.createResourcesController?.({
  elements: {
    viewButton: els.resourcesViewBtn,
    tmTab: els.tmResourceTab,
    tbTab: els.tbResourceTab,
    tmPanel: els.tmResourcesPanel,
    tbPanel: els.tbResourcesPanel,
    tmDashboard: els.tmResourceDashboard,
    tbDashboard: els.tbResourceDashboard,
    tmDetail: els.tmResourceDetail,
    tbDetail: els.tbResourceDetail,
    tmSourceLanguageInput: els.tmResourceSourceLangInput,
    tmTargetLanguageInput: els.tmResourceTargetLangInput,
    tbSourceLanguageInput: els.tbResourceSourceLangInput,
    tbTargetLanguageInput: els.tbResourceTargetLangInput,
    tmImportInput: els.resourceTmxImportInput,
    tbImportInput: els.resourceTbxImportInput,
    termListImportInput: els.resourceTermListImportInput
  },
  navigate: () => applicationViewController.show("resources"),
  render: resourcesPresentationService.render,
  keyForItem: (item, type) => resourceCatalogService.key(item, type === "tm" ? "tmName" : "termBaseName"),
  normalizeLanguageInput: languageInputService.normalizeElement,
  runImportTask: fileImportService.runTask,
  importTm: resourceLibraryImportController.importTmx,
  importTb: resourceLibraryImportController.importTbx,
  importTermList: resourceLibraryImportController.importTermList,
  deleteResource: resourceMutationController.deleteResource,
  exportResource: resourceLibraryExportController.exportResource,
  saveTmEntry: resourceMutationController.saveTmEntry,
  deleteTmEntry: resourceMutationController.deleteTmEntry,
  saveTerm: resourceMutationController.saveTerm,
  deleteTerm: resourceMutationController.deleteTerm,
  scheduleFrame: requestAnimationFrame,
  onError: (error) => applicationSaveStatusController.set(error?.message || "Resource action failed.", "dirty")
});
resourcesController?.mount?.();
qualityReviewController = appRuntime?.featureFactories?.createQualityReviewController?.({
  elements: {
    reviewForm: els.reviewForm,
    reviewStateSelect: els.reviewStateSelect,
    reviewNoteInput: els.reviewNoteInput,
    reviewCommentInput: els.reviewCommentInput,
    reviewCommentsList: els.reviewCommentsList,
    qualityForm: els.qualityForm,
    qualityStandardSelect: els.qualityStandardSelect,
    qualityReviewDepthSelect: els.qualityReviewDepthSelect,
    qualityRiskToleranceSelect: els.qualityRiskToleranceSelect,
    qualityTerminologyStrictnessSelect: els.qualityTerminologyStrictnessSelect,
    qualityAiDisclosureSelect: els.qualityAiDisclosureSelect,
    qualityAudienceInput: els.qualityAudienceInput,
    qualityToneInput: els.qualityToneInput,
    qualitySummary: els.qualitySummary,
    qualityActiveEvidence: els.qualityActiveEvidence,
    qualityDecisionForm: els.qualityDecisionForm,
    qualityIssueCategorySelect: els.qualityIssueCategorySelect,
    qualityIssueSeveritySelect: els.qualityIssueSeveritySelect,
    qualityDecisionNoteInput: els.qualityDecisionNoteInput,
    saveQualityDecisionBtn: els.saveQualityDecisionBtn,
    refreshQualityRiskBtn: els.refreshQualityRiskBtn,
    nextQualityRiskBtn: els.nextQualityRiskBtn,
    exportQualityPassportBtn: els.exportQualityPassportBtn,
    qualityRiskList: els.qualityRiskList
  },
  defaultProfile: defaultQualityProfile,
  source: uiLocalizationService.source,
  label: uiLocalizationService.label,
  profileLabel: qualityPresentationService.profile,
  categoryLabel: qualityPresentationService.category,
  riskLevelLabel: qualityPresentationService.riskLevel,
  formatDate,
  saveReview: (values) => reviewMetadataController.save(values),
  saveProfile: (values) => qualityProfileController.save(values),
  saveDecision: (values) => qualityDecisionController.save(values),
  refreshRisks: qualityWorkbenchController.refresh,
  nextRisk: qualityWorkbenchController.nextRisk,
  exportPassport: reportExportController.exportQualityPassport,
  openRisk: qualityWorkbenchController.openRisk,
  scheduleFrame: requestAnimationFrame,
  onError: (error) =>
    applicationSaveStatusController.set(error?.message || "Quality or review action failed.", "dirty")
});
qualityReviewController?.mount?.();
const qualityProfileController = appRuntime.featureFactories.createQualityProfileController({
  editorSessionStore,
  profile: {
    normalize: defaultQualityProfile,
    buildRiskQueue: qualityWorkbenchController.buildQueue
  },
  persistence: {
    saveProject: updateProject,
    refreshSummaries: refreshProjectSummaries
  },
  activity: {
    log: (qualityProfile) =>
      logOptionalProjectActivity(
        "quality-profile",
        "Quality profile saved",
        {
          standard: qualityProfile.standard,
          reviewDepth: qualityProfile.reviewDepth,
          riskTolerance: qualityProfile.riskTolerance,
          terminologyStrictness: qualityProfile.terminologyStrictness,
          aiDisclosure: qualityProfile.aiDisclosure
        },
        "Quality profile save"
      )
  },
  presentation: { renderWorkbench: qualityWorkbenchController.render },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set }
});
const reviewMetadataController = appRuntime.featureFactories.createReviewMetadataController({
  editorSessionStore,
  selection: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex },
  mutation: {
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory
  },
  persistence: {
    clearPending: autosaveService.clear,
    save: saveSegment
  },
  activity: {
    log: (segment) =>
      logProjectActivity("review", "Review metadata saved", {
        segmentId: segment.id,
        reviewState: segment.reviewState
      })
  },
  presentation: {
    renderReview: (options = {}) =>
      qualityReviewController?.renderReview?.({
        segment: applicationActiveSegmentService.get(),
        force: Boolean(options.force)
      }),
    updateRow,
    renderHistory: revisionHistoryPresentationService.render
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  ids: {
    comment: () => `comment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
  },
  testHooks: {
    beforeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[REVIEW_METADATA_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated review metadata save failure");
      }
    }
  },
  logger: console
});
const qualityDecisionController = appRuntime.featureFactories.createQualityDecisionController({
  editorSessionStore,
  selection: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex },
  mutation: {
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory
  },
  persistence: {
    clearPending: autosaveService.clear,
    save: saveSegment
  },
  risk: { buildQueue: qualityWorkbenchController.buildQueue },
  activity: {
    log: (segment, _project, { category, severity }) =>
      logOptionalProjectActivity(
        "quality-decision",
        "Quality decision saved",
        { segmentId: segment.id, category, severity },
        "Quality decision save"
      )
  },
  presentation: {
    clearNote: () => qualityReviewController?.clearDecisionNote?.(),
    renderReview: (options = {}) =>
      qualityReviewController?.renderReview?.({
        segment: applicationActiveSegmentService.get(),
        force: Boolean(options.force)
      }),
    renderWorkbench: qualityWorkbenchController.render,
    updateRow
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  labels: {
    category: qualityPresentationService.category,
    severity: qualityPresentationService.decisionSeverity
  },
  ids: { comment: () => makeId("comment") }
});
const reviewStateController = appRuntime.featureFactories.createReviewStateController({
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createChangeReviewStateCommand,
    changed: applicationCommandHistoryController.render
  },
  selection: { getActiveIndex: () => applicationStore.getState().navigation.activeIndex },
  mutation: {
    toggle: (segment, reviewState) => {
      segment.reviewState = segment.reviewState === reviewState ? "" : reviewState;
    },
    touch: segmentTargetStateService.touch,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: segmentTargetStateService.prepareHistory
  },
  persistence: {
    clearPending: autosaveService.clear,
    save: saveSegment
  },
  restoration: {
    restoreCommand: (segmentId, snapshot) =>
      segmentCommandRestorationController.restoreSnapshot(segmentId, snapshot)
  },
  activity: {
    log: (segment, _project, summary) =>
      logProjectActivity("review", summary, {
        segmentId: segment.id,
        reviewState: segment.reviewState
      })
  },
  presentation: {
    syncState: (reviewState) => qualityReviewController?.syncReviewState?.(reviewState),
    renderReview: () =>
      qualityReviewController?.renderReview?.({ segment: applicationActiveSegmentService.get(), force: false }),
    updateRow,
    renderHistory: revisionHistoryPresentationService.render
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: applicationSaveStatusController.set },
  describeState: (reviewState) => applicationTextSafetyService.stableLower(reviewLabel(reviewState)),
  testHooks: {
    beforeSave: (segment) => {
      if (LOOPCAT_TEST_BUILD && segment[REVIEW_STATE_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated review state save failure");
      }
    }
  },
  logger: console
});
dialogLifecycleController?.mount?.();

function markOpenAiProjectRollbackDirty(projectId) {
  if (projectId) markWorkspaceDirty(projectId);
}

async function waitForOfflineAppShellReady(timeoutMs = 10000) {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for offline app shell")), timeoutMs))
    ]);
  } catch {
    return null;
  }
}

async function waitForOfflineAppShellController(timeoutMs = 10000) {
  if (!("serviceWorker" in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;
  try {
    await Promise.race([
      new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for offline app shell control")), timeoutMs))
    ]);
  } catch {
    return false;
  }
  return Boolean(navigator.serviceWorker.controller);
}

async function warmOfflineAppShellCache() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
  try {
    await waitForOfflineAppShellReady();
    await waitForOfflineAppShellController();
    const cacheName = (await caches.keys()).find((name) => name.startsWith(OFFLINE_APP_SHELL_CACHE_PREFIX));
    if (!cacheName) return;
    const cache = await caches.open(cacheName);
    await Promise.all(OFFLINE_APP_SHELL_WARMUP_ASSETS.map(async (asset) => {
      try {
        if (await cache.match(asset)) return;
        const response = await fetch(asset);
        if (!response) return;
        await cache.put(asset, response.clone());
      } catch (error) {
        console.warn("Offline app shell warmup failed.", asset, error);
      }
    }));
  } catch (error) {
    console.warn("Offline app shell warmup failed.", error);
  }
}

function renderOfflineUpdateState(update) {
  if (!els.updateReadyBanner) return;
  const hidden = !update || update.state === "deferred";
  els.updateReadyBanner.classList.toggle("hidden", hidden);
  if (hidden) return;
  const messages = {
    ready: ["Update ready", "Reload when convenient. LoopCAT will save pending local work first."],
    saving: ["Saving before update", "Pending segment and workspace changes are being saved locally."],
    activating: ["Applying update", "The new offline app shell is ready. LoopCAT will reload shortly."],
    reloading: ["Reloading LoopCAT", "Your saved project and workspace state will be restored."],
    error: ["Update paused", update.message || "Your current version is still active and your work was preserved."]
  };
  const [title, message] = messages[update.state] || messages.ready;
  els.updateReadyTitle.textContent = uiLocalizationService.source(title);
  els.updateReadyMessage.textContent = uiLocalizationService.source(message);
  const busy = ["saving", "activating", "reloading"].includes(update.state);
  els.reloadUpdateBtn.disabled = busy;
  els.deferUpdateBtn.disabled = busy;
  els.reloadUpdateBtn.textContent = update.state === "error" ? uiLocalizationService.source("Try again") : uiLocalizationService.source("Reload now");
}

function registerOfflineAppShell() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "loopcat:") {
    navigator.serviceWorker.getRegistrations?.()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((error) => {
        console.warn("Desktop service worker cleanup failed.", error);
      });
    return;
  }
  if (!["http:", "https:"].includes(window.location.protocol)) return;
  offlineUpdateController = appRuntime?.featureFactories?.createUpdateController?.({
    serviceWorker: navigator.serviceWorker,
    location: window.location,
    trustScriptUrl: appRuntime.safeHtml.trustedScriptUrl,
    beforeActivate: async () => {
      await autosaveService.flush();
      if (state.workspaceStatus?.connected && state.workspaceDirtyProjectIds.size) {
        await workspacePackageSaveController.saveRecovery();
      }
    },
    onStateChange: renderOfflineUpdateState,
    onError: (error) =>
      applicationSaveStatusController.set(
        error?.message || "Offline update failed; current version remains active",
        "dirty"
      )
  });
  offlineUpdateController
    ?.initialize?.("./service-worker.js")
    .then(async (registration) => {
      await warmOfflineAppShellCache();
    })
    .catch((error) => {
      console.warn("Offline app shell registration failed.", error);
    });
}

function uniqueNames(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function cleanProjectText(value, fallback = "") {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const clean = String(value).trim();
  return clean || fallback;
}

function cleanCreatorName(value, fallback = "") {
  return cleanProjectText(applicationTextSafetyService.redactSensitiveText(value || ""), fallback).slice(0, 120);
}

function storedCreatorName() {
  try {
    return cleanCreatorName(localStorage.getItem(CREATOR_NAME_STORAGE));
  } catch {
    return "";
  }
}

function rememberCreatorName(value) {
  const clean = cleanCreatorName(value);
  try {
    if (clean) localStorage.setItem(CREATOR_NAME_STORAGE, clean);
    else localStorage.removeItem(CREATOR_NAME_STORAGE);
  } catch {
    // The project keeps its creator field even if browser preference storage is unavailable.
  }
  return clean;
}

async function suggestedCreatorName() {
  const stored = storedCreatorName();
  if (stored) return stored;
  const desktop = window.LoopCATDesktop;
  if (desktop?.getCreatorIdentity) {
    try {
      const identity = await desktop.getCreatorIdentity();
      const desktopName = cleanCreatorName(identity?.displayName || identity?.hostName);
      if (desktopName) return desktopName;
    } catch (error) {
      console.warn("Desktop creator identity lookup failed.", error);
    }
  }
  return "This computer";
}

function projectDocumentManifest(project = editorSessionStore.getProject()) {
  const seen = new Set();
  return (Array.isArray(project?.documents) ? project.documents : [])
    .map((documentInfo) => {
      if (!documentInfo || typeof documentInfo !== "object" || Array.isArray(documentInfo)) return null;
      const id = cleanProjectText(documentInfo.id);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        ...documentInfo,
        id,
        name: cleanProjectText(documentInfo.name, project?.sourceFileName || "Document"),
        type: applicationTextSafetyService.stableLower(cleanProjectText(documentInfo.type, "file")) || "file"
      };
    })
    .filter(Boolean);
}

function cleanProjectResourceLinks(resourceLinks = []) {
  return (Array.isArray(resourceLinks) ? resourceLinks : [])
    .map((link) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) return null;
      const type = String(link.type || "").trim();
      const name = String(link.name || "").trim();
      if (!RESOURCE_LINK_TYPES.has(type) || !name) return null;
      return {
        ...link,
        id: typeof link.id === "string" && link.id.trim() ? link.id : "",
        type,
        name
      };
    })
    .filter(Boolean);
}

function projectResourceLinks(project) {
  if (!project) return [];
  const main = cleanProjectText(project.mainTmName, cleanProjectText(project.tmName, "Default TM"));
  const cleanLinks = cleanProjectResourceLinks(project.resourceLinks);
  const rawLinks = cleanLinks.length
    ? cleanLinks
    : [
      { type: "tm", name: main, role: "main" },
      { type: "termbase", name: cleanProjectText(project.termBaseName, "Default TB") }
    ];
  const links = [];
  rawLinks.forEach((link) => {
    if (links.some((item) => item.type === link.type && item.name === link.name)) return;
    links.push({
      id: link.id || makeId("resource-link"),
      type: link.type,
      name: link.name,
      role: link.type === "tm" && link.name === main ? "main" : link.type === "tm" ? "reference" : link.role
    });
  });
  if (!links.some((link) => link.type === "tm" && link.name === main)) {
    links.unshift({ id: makeId("resource-link"), type: "tm", name: main, role: "main" });
  }
  if (!links.some((link) => link.type === "termbase")) {
    links.push({ id: makeId("resource-link"), type: "termbase", name: cleanProjectText(project.termBaseName, "Default TB") });
  }
  return links;
}

function mainTmName(project = editorSessionStore.getProject()) {
  return projectResourceLinks(project).find((link) => link.type === "tm" && link.role === "main")?.name || cleanProjectText(project?.mainTmName, cleanProjectText(project?.tmName, "Default TM"));
}

function projectTmNames(project = editorSessionStore.getProject()) {
  return uniqueNames([mainTmName(project), ...projectResourceLinks(project).filter((link) => link.type === "tm").map((link) => link.name)]);
}

function projectTermBaseNames(project = editorSessionStore.getProject()) {
  return uniqueNames(projectResourceLinks(project).filter((link) => link.type === "termbase").map((link) => link.name));
}

function primaryTermBaseName(project = editorSessionStore.getProject()) {
  return projectTermBaseNames(project)[0] || cleanProjectText(project?.termBaseName, "Default TB");
}

function projectResourceSummary(project = editorSessionStore.getProject()) {
  const tmNames = projectTmNames(project);
  const tbNames = projectTermBaseNames(project);
  return {
    mainTm: mainTmName(project),
    tmNames,
    tbNames,
    tmLabel: `${tmNames.length} TM${tmNames.length === 1 ? "" : "s"}`,
    tbLabel: `${tbNames.length} TB${tbNames.length === 1 ? "" : "s"}`
  };
}

async function rankTmMatchesFromEntries(entries, options) {
  const fallback = () => Promise.resolve(scoreTmEntries(entries, options));
  if (!workerClient?.findTmMatches) return fallback();
  return workerClient.findTmMatches({ entries, options, fallback });
}

async function findProjectTmMatches(options) {
  const entries = await getTmMatchCandidates(options);
  return rankTmMatchesFromEntries(entries, options);
}

async function rankTmMatchBatches(candidateBatches, optionsList) {
  const fallback = () => Promise.resolve(candidateBatches.map((entries, index) => scoreTmEntries(entries, optionsList[index] || {})));
  if (!workerClient?.findTmMatchesBatch) return fallback();
  return workerClient.findTmMatchesBatch({ entries: candidateBatches, options: optionsList, fallback });
}

async function findProjectTmMatchesBatch(optionsList) {
  const requests = Array.isArray(optionsList) ? optionsList : [];
  if (!requests.length) return [];
  if (!getTmMatchCandidateBatches) {
    return Promise.all(requests.map((options) => findProjectTmMatches(options)));
  }
  const candidateBatches = await getTmMatchCandidateBatches(requests);
  return rankTmMatchBatches(candidateBatches, requests);
}

function projectResourceSearchText(project) {
  const summary = projectResourceSummary(project);
  return [...summary.tmNames, ...summary.tbNames].join(" ");
}


function selectedEditorText() {
  const active = document.activeElement;
  if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") {
    const value = active.value || "";
    const selected = value.slice(active.selectionStart || 0, active.selectionEnd || 0).trim();
    if (selected) return selected;
  }
  const pageSelection = window.getSelection()?.toString().trim();
  if (pageSelection) return pageSelection;
  return applicationActiveSegmentService.get()?.source || "";
}

function reviewLabel(value) {
  return {
    "needs-review": uiLocalizationService.source("Needs review"),
    reviewed: uiLocalizationService.source("Reviewed"),
    blocked: uiLocalizationService.source("Blocked")
  }[value] || "";
}

function segmentStatusLabel(status) {
  return {
    empty: uiLocalizationService.label("empty"),
    draft: uiLocalizationService.label("draft"),
    confirmed: uiLocalizationService.label("confirmed")
  }[status] || uiLocalizationService.source(status);
}

function commandList() {
  const commandProjectId = state.commandProjectId || editorSessionStore.getProject()?.id || null;
  const commands = [
    { id: "undo", label: "Undo last action", run: applicationCommandHistoryController.undo, enabled: Boolean(appRuntime?.commands?.bus?.canUndo?.(commandProjectId)) },
    { id: "redo", label: "Redo last action", run: applicationCommandHistoryController.redo, enabled: Boolean(appRuntime?.commands?.bus?.canRedo?.(commandProjectId)) },
    { id: "trash", label: "Open Trash", run: applicationTrashController.open, enabled: Boolean(appRuntime?.trashRepository) },
    { id: "confirm", label: "Confirm segment", run: segmentConfirmationController.confirm, enabled: Boolean(applicationActiveSegmentService.get()?.target?.trim()) },
    { id: "next-open", label: "Next open segment", run: segmentNavigationController.nextOpen, enabled: Boolean(editorSessionStore.getSegments().length) },
    { id: "focus-mode", label: applicationStore.getState().interface.focusMode ? "Exit Focus view" : "Enter Focus view", run: focusModeController.toggle, enabled: Boolean(applicationStore.getState().navigation.view === "editor" && editorSessionStore.getProject()) },
    { id: "copy-source", label: "Copy source", run: targetProducerController.copySourceToTarget, enabled: Boolean(applicationActiveSegmentService.get()) },
    { id: "split-segment", label: "Split segment", group: "Segment", keywords: ["divide", "cursor", "structure"], run: structuralSegmentController.split, enabled: Boolean(applicationActiveSegmentService.get() && structuralSegmentController.canSplit(applicationActiveSegmentService.get())) },
    { id: "merge-segments", label: "Merge with next segment", group: "Segment", keywords: ["join", "combine", "structure"], run: structuralSegmentController.merge, enabled: Boolean(applicationActiveSegmentService.get() && structuralSegmentController.canMerge(applicationActiveSegmentService.get(), structuralSegmentController.nextForMerge(applicationActiveSegmentService.get()))) },
    { id: "save-tm", label: "Save segment to TM", run: segmentTmSaveController.saveActive, enabled: Boolean(applicationActiveSegmentService.get()?.target?.trim()) },
    { id: "project-settings", label: "Project settings", run: () => openProjectDialog("edit"), enabled: Boolean(editorSessionStore.getProject()) },
    { id: "qa", label: "Run QA checks", run: projectQaController.run, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "quality-passport", label: "Export Quality Passport", run: reportExportController.exportQualityPassport, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "next-quality-risk", label: "Next quality risk", run: qualityWorkbenchController.nextRisk, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "concordance", label: "Open concordance", run: concordanceController.open, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "replace-target", label: "Find and replace target text", run: targetReplacementController.open, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "preset-translate", label: "Use Translate filter preset", group: "Filters", keywords: ["open", "segments", "matches"], run: () => filterPresetController?.applyPreset?.("translate"), enabled: Boolean(editorSessionStore.getProject()) },
    { id: "preset-review", label: "Use Review filter preset", group: "Filters", keywords: ["needs review", "comments"], run: () => filterPresetController?.applyPreset?.("review"), enabled: Boolean(editorSessionStore.getProject()) },
    { id: "preset-qa-fixes", label: "Use QA fixes filter preset", group: "Filters", keywords: ["quality", "blocked", "fixes"], run: () => filterPresetController?.applyPreset?.("qa-fixes"), enabled: Boolean(editorSessionStore.getProject()) },
    { id: "preset-ai-review", label: "Use AI review filter preset", group: "Filters", keywords: ["AI", "risk", "suggestions"], run: () => filterPresetController?.applyPreset?.("ai-review"), enabled: Boolean(editorSessionStore.getProject()) },
    { id: "project-report", label: "Export project report", run: reportExportController.exportProjectReport, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "anonymized-report", label: "Export anonymized report", run: reportExportController.exportAnonymizedReport, enabled: Boolean(editorSessionStore.getProject()) },
    { id: "local-ai-pretranslate", label: "Local AI pre-translate", run: aiPretranslationController.pretranslate, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running) },
    { id: "local-ai-review", label: "AI review active segment", run: aiReviewController.reviewActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-review-batch", label: "AI QA batch", run: aiReviewController.reviewBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair", label: "Suggest AI tag repair", run: aiTagRepairController.repairActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair-batch", label: "Repair AI tags batch", run: aiTagRepairController.repairBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-draft", label: "Polish active draft with AI", run: aiDraftEditingController.polishActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-batch", label: "Polish AI drafts batch", run: aiDraftEditingController.polishBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-draft", label: "Adapt active draft with AI", run: aiDraftEditingController.adaptActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-batch", label: "Adapt AI drafts batch", run: aiDraftEditingController.adaptBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants", label: "Suggest AI alternatives", run: aiAlternativesController.suggestActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants-batch", label: "Suggest AI alternatives batch", run: aiAlternativesController.suggestBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms", label: "Apply AI terminology", run: aiTerminologyApplicationController.applyActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms-batch", label: "Apply AI terminology batch", run: aiTerminologyApplicationController.applyBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms", label: "Extract AI terms", run: aiTerminologyExtractionController.extractActive, enabled: Boolean(applicationActiveSegmentService.get() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms-batch", label: "Extract AI terms batch", run: aiTerminologyExtractionController.extractBatch, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-project-brief", label: "Generate AI project brief", run: aiProjectBriefController.generate, enabled: Boolean(editorSessionStore.getProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "openai-ai", label: "Create OpenAI suggestion", run: aiOpenAiSuggestionController.create, enabled: Boolean(applicationActiveSegmentService.get()) }
  ];
  const shortcuts = {
    undo: "Ctrl/Cmd+Z",
    redo: "Ctrl/Cmd+Shift+Z",
    concordance: "Ctrl/Cmd+Alt+K",
    "focus-mode": "Ctrl/Cmd+Shift+F"
  };
  return commands.map((command) => ({
    ...command,
    shortcut: shortcuts[command.id] || "",
    disabledReason: command.enabled ? "" : "Unavailable in the current context."
  }));
}

function formatDate(value) {
  if (!value) return uiLocalizationService.source("Never");
  return new Intl.DateTimeFormat(uiI18n?.getLocale?.() || undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return uiLocalizationService.source("Never");
  return new Intl.DateTimeFormat(uiI18n?.getLocale?.() || undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function workspaceDirtyIds() {
  return Array.from(state.workspaceDirtyProjectIds);
}

function readStoredWorkspaceDirtyIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_DIRTY_STORAGE) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim()) : [];
  } catch {
    localStorage.removeItem(WORKSPACE_DIRTY_STORAGE);
    return [];
  }
}

function persistWorkspaceDirtyIds() {
  try {
    const ids = workspaceDirtyIds();
    if (ids.length) localStorage.setItem(WORKSPACE_DIRTY_STORAGE, JSON.stringify(ids));
    else localStorage.removeItem(WORKSPACE_DIRTY_STORAGE);
  } catch {
    // Dirty-state persistence is a recovery aid; in-memory warnings still work if storage is unavailable.
  }
}

function restoreWorkspaceDirtyIds() {
  const ids = readStoredWorkspaceDirtyIds();
  state.workspaceDirtyProjectIds = new Set(ids);
  state.workspaceRecoveryProjectIds = new Set(ids);
  recoveryWorkspaceController?.resetRecoveryDismissal?.();
}

function pruneWorkspaceDirtyProjectIds() {
  const knownIds = new Set(editorSessionStore.getProjects().map((project) => project.id).filter(Boolean));
  const nextIds = workspaceDirtyIds().filter((id) => knownIds.has(id));
  const nextRecoveryIds = Array.from(state.workspaceRecoveryProjectIds).filter((id) => knownIds.has(id) && nextIds.includes(id));
  const dirtyChanged = nextIds.length !== state.workspaceDirtyProjectIds.size;
  const recoveryChanged = nextRecoveryIds.length !== state.workspaceRecoveryProjectIds.size;
  if (!dirtyChanged && !recoveryChanged) return;
  state.workspaceDirtyProjectIds = new Set(nextIds);
  state.workspaceRecoveryProjectIds = new Set(nextRecoveryIds);
  persistWorkspaceDirtyIds();
  renderWorkspaceRecoveryPanel();
}

function hasUnsavedWorkspacePackages() {
  return Boolean(state.workspaceStatus?.connected && state.workspaceDirtyProjectIds.size);
}

function visibleWorkspaceDirtyCount(status = state.workspaceStatus) {
  return status?.connected ? state.workspaceDirtyProjectIds.size : 0;
}

function markWorkspaceDirty(projectId = editorSessionStore.getProject()?.id) {
  if (!projectId) return;
  const changed = !state.workspaceDirtyProjectIds.has(projectId);
  state.workspaceDirtyProjectIds.add(projectId);
  markProjectSummaryDirty(projectId);
  if (!changed) return;
  persistWorkspaceDirtyIds();
  renderWorkspaceStatus();
}

function markWorkspaceProjectsDirty(projectIds = []) {
  let changed = false;
  projectIds.forEach((projectId) => {
    if (!projectId) return;
    markProjectSummaryDirty(projectId);
    if (state.workspaceDirtyProjectIds.has(projectId)) return;
    state.workspaceDirtyProjectIds.add(projectId);
    changed = true;
  });
  if (changed) persistWorkspaceDirtyIds();
  if (changed) renderWorkspaceStatus();
}

function projectUsesResource(project, type, name, sourceLang = "", targetLang = "") {
  if (!project || !type || !name) return false;
  if (sourceLang && project.sourceLang !== sourceLang) return false;
  if (targetLang && project.targetLang !== targetLang) return false;
  return projectResourceLinks(project).some((link) => link.type === type && link.name === name);
}

function markProjectsUsingResourceDirty(type, name, sourceLang = "", targetLang = "") {
  const projectIds = editorSessionStore.getProjects()
    .filter((project) => projectUsesResource(project, type, name, sourceLang, targetLang))
    .map((project) => project.id);
  markWorkspaceProjectsDirty(projectIds);
  return projectIds.length;
}

function clearWorkspaceDirty(projectId = editorSessionStore.getProject()?.id) {
  if (projectId) state.workspaceDirtyProjectIds.delete(projectId);
  if (projectId) state.workspaceRecoveryProjectIds.delete(projectId);
  persistWorkspaceDirtyIds();
  renderWorkspaceStatus();
}

function clearWorkspaceDirtyMarkers() {
  state.workspaceDirtyProjectIds.clear();
  state.workspaceRecoveryProjectIds.clear();
  recoveryWorkspaceController?.resetRecoveryDismissal?.();
  persistWorkspaceDirtyIds();
  renderWorkspaceStatus();
}

function clearWorkspaceDirtyMemoryOnly() {
  state.workspaceDirtyProjectIds.clear();
  state.workspaceRecoveryProjectIds.clear();
  renderWorkspaceStatus();
}

function renderWorkspaceStatus() {
  if (!workspaceStorage) return;
  const status = state.workspaceStatus || {};
  const dirtyCount = visibleWorkspaceDirtyCount(status);
  const storageWarnings = applicationStorageDurabilityController.warnings(state.storageDurability);
  recoveryWorkspaceController?.renderStatus?.({
    status,
    dirtyCount,
    storageLine: applicationStorageDurabilityController.line(state.storageDurability),
    storageWarnings,
    importBusy: Boolean(state.importTask),
    hasProject: Boolean(editorSessionStore.getProject())
  });
  renderWorkspaceRecoveryPanel();
}

function workspaceRecoveryProjectIds() {
  return Array.from(state.workspaceRecoveryProjectIds).filter((id) => state.workspaceDirtyProjectIds.has(id));
}

function renderWorkspaceRecoveryPanel() {
  const ids = workspaceRecoveryProjectIds();
  recoveryWorkspaceController?.renderRecovery?.({
    status: state.workspaceStatus || {},
    projects: ids.map((id) => {
      const project = knownProjectById(id);
      return { id, name: project?.name || id };
    }),
    autosaving: state.workspaceAutosaving
  });
}

function daysBetween(fromIso, toDate = new Date()) {
  const from = new Date(fromIso || 0);
  if (!Number.isFinite(from.getTime())) return Infinity;
  return Math.max(0, Math.floor((toDate.getTime() - from.getTime()) / 86400000));
}

function backupReminderDismissals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKUP_REMINDER_STORAGE) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    localStorage.removeItem(BACKUP_REMINDER_STORAGE);
    return {};
  }
}

function isBackupReminderDismissed(projectId, now = new Date()) {
  const until = backupReminderDismissals()[projectId];
  return until ? new Date(until).getTime() > now.getTime() : false;
}

function dismissBackupReminder(projectId = editorSessionStore.getProject()?.id, hours = BACKUP_REMINDER_DISMISS_HOURS) {
  if (!projectId) return;
  const dismissed = backupReminderDismissals();
  dismissed[projectId] = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  try {
    localStorage.setItem(BACKUP_REMINDER_STORAGE, JSON.stringify(dismissed));
  } catch {
    // The reminder is advisory; failing to persist dismissal should not interrupt editing.
  }
  renderBackupReminder();
}

function latestProjectPackageExport(project = editorSessionStore.getProject()) {
  const history = (project?.exportHistory || []).filter((entry) => entry.type === "project-package" && entry.createdAt);
  return history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

function backupReminderInfo(project = editorSessionStore.getProject(), activityEvents = editorSessionStore.getActivityEvents(), now = new Date()) {
  if (!project || isBackupReminderDismissed(project.id, now)) return null;
  const latestExport = latestProjectPackageExport(project);
  const projectAgeDays = daysBetween(project.createdAt, now);
  const daysSinceExport = latestExport ? daysBetween(latestExport.createdAt, now) : Infinity;
  const exportTime = latestExport ? new Date(latestExport.createdAt).getTime() : 0;
  const activitiesSinceExport = (activityEvents || []).filter((event) => new Date(event.createdAt || 0).getTime() > exportTime).length;
  const isLongRunning = projectAgeDays >= BACKUP_REMINDER_PROJECT_DAYS || (activityEvents || []).length >= BACKUP_REMINDER_ACTIVITY_COUNT;
  const needsBackup = !latestExport || daysSinceExport >= BACKUP_REMINDER_EXPORT_DAYS || activitiesSinceExport >= BACKUP_REMINDER_ACTIVITY_SINCE_EXPORT;
  if (!isLongRunning || !needsBackup) return null;
  const reason = !latestExport
    ? `This project is ${projectAgeDays} day${projectAgeDays === 1 ? "" : "s"} old and has no project package export yet.`
    : `${activitiesSinceExport} project activit${activitiesSinceExport === 1 ? "y has" : "ies have"} happened since the last project package export.`;
  return {
    reason,
    projectAgeDays,
    daysSinceExport,
    activitiesSinceExport
  };
}

function renderBackupReminder() {
  const info = backupReminderInfo();
  recoveryWorkspaceController?.renderBackupReminder?.({ info });
}

function knownProjectById(projectId) {
  return editorSessionStore.getProject()?.id === projectId
    ? editorSessionStore.getProject()
    : editorSessionStore.getProjects().find((project) => project.id === projectId) || editorSessionStore.getProjectSummaries().find((project) => project.id === projectId) || null;
}

async function refreshWorkspaceStatus() {
  if (!workspaceStorage) return;
  state.workspaceStatus = await workspaceStorage.getStatus();
  renderWorkspaceStatus();
}

async function markLocalProjectsMissingFromWorkspaceDirty() {
  if (!workspaceStorage?.listProjectPackages || !state.workspaceStatus?.connected) return 0;
  const [projects, refs] = await Promise.all([listProjects(), workspaceStorage.listProjectPackages()]);
  const workspaceProjectIds = new Set((refs || []).map((ref) => ref.id).filter(Boolean));
  const missingProjectIds = (projects || []).map((project) => project.id).filter((id) => id && !workspaceProjectIds.has(id));
  markWorkspaceProjectsDirty(missingProjectIds);
  return missingProjectIds.length;
}

function renderProjectStorageStatus() {
  if (!workspaceStorage) return;
  recoveryWorkspaceController?.renderProjectStorage?.({ status: state.workspaceStatus || {} });
}

function projectSummaryRevision(projectId) {
  return editorSessionStore.getProjectSummaryRevision(projectId);
}

function markProjectSummaryDirty(projectId) {
  editorSessionStore.markProjectSummaryDirty(projectId);
}

function projectSummaryRecord(project, segments, summaryRevision = projectSummaryRevision(project.id)) {
  const progress = segmentProgressService.projectProgress(segments);
  const projectSearchText = applicationTextSafetyService.stableLower(
    `${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`
  );
  return {
    ...project,
    progress,
    wordCount: progress.words,
    searchText: projectSearchText,
    languagePairKey: projectLanguageContextController.key(project),
    summaryRevision
  };
}

async function summarizeProject(project, segments = null, summaryRevision = projectSummaryRevision(project.id)) {
  const projectSegments = Array.isArray(segments) ? segments : await getProjectSegments(project.id);
  return projectSummaryRecord(project, projectSegments, summaryRevision);
}

async function refreshProjectSummaries() {
  const cachedById = new Map(editorSessionStore.getProjectSummaries().map((summary) => [summary.id, summary]));
  const projectSummaries = await Promise.all(editorSessionStore.getProjects().map((project) => {
    const revision = projectSummaryRevision(project.id);
    const cached = cachedById.get(project.id);
    if (cached && cached.updatedAt === project.updatedAt && cached.summaryRevision === revision) {
      return {
        ...cached,
        ...project,
        progress: cached.progress,
        wordCount: cached.wordCount,
        searchText: applicationTextSafetyService.stableLower(
          `${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`
        ),
        languagePairKey: projectLanguageContextController.key(project),
        summaryRevision: revision
      };
    }
    const inMemorySegments = editorSessionStore.getProject()?.id === project.id ? editorSessionStore.getSegments() : null;
    return summarizeProject(project, inMemorySegments, revision);
  }));
  editorSessionStore.replaceProjectSummaries(projectSummaries);
  renderLanguagePairFilter();
  renderProjectsView();
}

async function loadProjects(selectFirst = false) {
  editorSessionStore.replaceProjects(await listProjects());
  const knownProjectIds = new Set(editorSessionStore.getProjects().map((project) => project.id));
  editorSessionStore.pruneProjectSummaryRevisions(knownProjectIds);
  pruneWorkspaceDirtyProjectIds();
  await refreshProjectSummaries();
  renderProjectList();
  renderEditor();
  void applicationTrashController.renderSummary();
  if (selectFirst && !editorSessionStore.getProject() && editorSessionStore.getProjects()[0]) {
    await openProject(editorSessionStore.getProjects()[0].id);
  }
}

function openProjectDialog(mode = "create") {
  return projectDialogController?.open?.(mode, { returnTarget: document.activeElement }) || Promise.resolve(false);
}

async function refreshResources() {
  const [tmEntries, terms] = await Promise.all([listTmEntries(), getAll("terms")]);
  return resourcesController?.setResources?.({ tmEntries, terms }) || { tmEntries, terms };
}

async function refreshProjectTerms({ rerender = false } = {}) {
  if (!editorSessionStore.getProject()) {
    editorSessionStore.replaceProjectTerms([]);
    return;
  }
  editorSessionStore.replaceProjectTerms(await listTerms({
    sourceLang: editorSessionStore.getProject().sourceLang,
    targetLang: editorSessionStore.getProject().targetLang,
    termBaseNames: projectTermBaseNames()
  }));
  segmentFilterService.invalidate();
  renderTermbaseSelect();
  if (rerender) renderSegments({ preserveScroll: true });
}

async function projectTermsForValidation() {
  if (!editorSessionStore.getProject()) return [];
  return listTerms({
    sourceLang: editorSessionStore.getProject().sourceLang,
    targetLang: editorSessionStore.getProject().targetLang,
    termBaseNames: projectTermBaseNames()
  });
}

async function logProjectActivity(type, summary, detail = {}, project = editorSessionStore.getProject()) {
  if (!project) return null;
  const event = await recordActivityEvent({ projectId: project.id, type, summary, detail });
  if (event && editorSessionStore.getProject()?.id === project.id) {
    editorSessionStore.prependActivityEvent(event);
    renderBackupReminder();
  }
  markWorkspaceDirty(project.id);
  return event;
}

function draftProjectActivityEvent(project, type, summary, detail = {}) {
  const now = new Date().toISOString();
  const event = {
    id: makeId("activity"),
    workspaceId: project?.workspaceId || storageConstants?.LOCAL_WORKSPACE_ID || "local-workspace",
    ownerId: project?.ownerId || storageConstants?.LOCAL_USER_ID || "local-user",
    projectId: project?.id || "",
    type,
    summary: summary || type,
    detail,
    createdBy: project?.updatedBy || storageConstants?.LOCAL_USER_ID || "local-user",
    createdAt: now
  };
  return sanitizePortableValue(event);
}

async function logOptionalProjectActivity(type, summary, detail = {}, label = summary || type) {
  try {
    if (LOOPCAT_TEST_BUILD && ["export", "resource-export"].includes(type) && editorSessionStore.getProject()?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG]) {
      throw new Error("Simulated export activity log failure");
    }
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || editorSessionStore.getProject()?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    await logProjectActivity(type, summary, detail);
    return true;
  } catch (activityError) {
    console.warn(`${label} activity log failed.`, activityError);
    if (editorSessionStore.getProject()?.id) markWorkspaceDirty(editorSessionStore.getProject().id);
    return false;
  }
}

async function logOptionalActivityForProject(projectId, type, summary, detail = {}, label = summary || type) {
  try {
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || editorSessionStore.getProject()?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    const event = await recordActivityEvent({ projectId, type, summary, detail });
    if (editorSessionStore.getProject()?.id === projectId) {
      editorSessionStore.replaceActivityEvents(await listActivityEvents(projectId));
      renderBackupReminder();
    }
    markWorkspaceDirty(projectId);
    return { ok: true, event };
  } catch (activityError) {
    console.warn(`${label} activity log failed.`, activityError);
    if (projectId) markWorkspaceDirty(projectId);
    return { ok: false, event: null };
  }
}

function appendActivityWarning(message, activityLogged) {
  return activityLogged ? message : `${message}; activity log failed`;
}

function exportStatusMode(mode, activityLogged) {
  return activityLogged ? mode : "dirty";
}

function sanitizeValidationReportForDisplay(report) {
  if (!report) return null;
  const clean = { ...report };
  ["errors", "risky", "warnings", "simplified", "skipped", "preserved"].forEach((key) => {
    clean[key] = Array.isArray(report[key])
      ? report[key]
          .map((message) => applicationTextSafetyService.redactSensitiveText(message || "").trim())
          .filter(Boolean)
      : [];
  });
  clean.ok = clean.errors.length === 0;
  return clean;
}

function validationAlertText(report, fallback = "Validation failed.") {
  const clean = sanitizeValidationReportForDisplay(report);
  const errors = Array.isArray(clean?.errors) ? clean.errors : [];
  return errors.length ? errors.join("\n") : applicationTextSafetyService.redactSensitiveText(fallback);
}

function renderValidationReport(report) {
  const displayReport = sanitizeValidationReportForDisplay(report);
  state.lastValidationReport = displayReport;
  importExportController?.renderValidation?.({
    report: displayReport,
    summary: displayReport ? reportSummary(displayReport) : "",
    groups: [
      { key: "errors", label: uiLocalizationService.label("errors") },
      { key: "risky", label: uiLocalizationService.label("risk") },
      { key: "warnings", label: uiLocalizationService.source("Warnings") },
      { key: "simplified", label: uiLocalizationService.label("simplified") },
      { key: "skipped", label: uiLocalizationService.label("skipped") },
      { key: "preserved", label: uiLocalizationService.label("preserved") }
    ],
    dismissLabel: uiLocalizationService.source("Dismiss validation report"),
    dismissText: uiLocalizationService.source("Dismiss"),
    emptyLabel: uiLocalizationService.source("No validation issues."),
    autoDismissMs: displayReport?.ok ? (reportCount(displayReport) ? 12000 : 7000) : 0
  });
}

async function renderProjectAnalysis() {
  const run = (state.projectAnalysisRun += 1);
  const project = editorSessionStore.getProject();
  if (!project || applicationStore.getState().navigation.view !== "project" || !els.projectAnalysis) return;
  const segments = editorSessionStore.getSegments();
  const tmEntries = await getAllByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`);
  if (run !== state.projectAnalysisRun || applicationStore.getState().navigation.view !== "project" || editorSessionStore.getProject()?.id !== project.id) return;
  const tmNames = new Set(projectTmNames(project));
  const analysis = analyzeProject(project, segments, tmEntries.filter((entry) => tmNames.has(entry.tmName)));
  const ai = analysis.ai || {};
  els.analysisMeta.textContent = uiLocalizationService.label("generatedAt", { date: formatDate(analysis.generatedAt) });
  replaceSafeHtml(els.projectAnalysis, `
    <div><strong>${analysis.totals.confirmedPercent}%</strong><span>${uiLocalizationService.labelHtml("confirmed")}</span></div>
    <div><strong>${analysis.totals.untranslated}</strong><span>${uiLocalizationService.sourceHtml("empty targets")}</span></div>
    <div><strong>${analysis.totals.repetitions}</strong><span>${uiLocalizationService.labelHtml("repetitions")}</span></div>
    <div><strong>${analysis.leverage.exact}</strong><span>${uiLocalizationService.labelHtml("exactTm")}</span></div>
    <div><strong>${analysis.leverage.fuzzy95 + analysis.leverage.fuzzy85}</strong><span>${uiLocalizationService.labelHtml("strongFuzzy")}</span></div>
    <div><strong>${analysis.totals.segments - analysis.totals.confirmed}</strong><span>${uiLocalizationService.labelHtml("openSegments")}</span></div>
    <div><strong>${analysis.totals.files}</strong><span>${uiLocalizationService.labelHtml("files")}</span></div>
    <div><strong>${analysis.totals.words}</strong><span>${uiLocalizationService.labelHtml("sourceWords")}</span></div>
    <div><strong>${ai.drafts || 0}</strong><span>${uiLocalizationService.sourceHtml("AI initiated")}</span></div>
    <div><strong>${ai.suggestionSegments || 0}</strong><span>${uiLocalizationService.labelHtml("aiSuggestionRows")}</span></div>
    <div><strong>${ai.highRisk || 0}</strong><span>${uiLocalizationService.labelHtml("highAiRisk")}</span></div>
  `);
}

function renderProjectList() {
  if (!editorSessionStore.getProjects().length) {
    replaceSafeHtml(els.projectList, `<div class="muted">${uiLocalizationService.sourceHtml("No projects yet.")}</div>`);
    return;
  }
  const fragment = document.createDocumentFragment();
  editorSessionStore.getProjects().forEach((project) => {
    const button = document.createElement("button");
    button.className = `project-item ${editorSessionStore.getProject()?.id === project.id ? "active" : ""}`;
    replaceSafeHtml(
      button,
      `<strong>${applicationTextSafetyService.displaySafeHtml(project.name)}</strong><span>${applicationTextSafetyService.escapeHtml(projectLanguageContextController.display(project))}</span><span>${project.sourceFileName ? applicationTextSafetyService.displaySafeHtml(project.sourceFileName) : uiLocalizationService.labelHtml("noSourceFile")}</span>`
    );
    button.addEventListener("click", () => openProject(project.id));
    fragment.append(button);
  });
  els.projectList.replaceChildren(fragment);
}

async function openProject(projectId) {
  await autosaveService.flush();
  editorSessionStore.replaceProject(editorSessionStore.getProjects().find((project) => project.id === projectId) || null);
  state.commandProjectId = editorSessionStore.getProject()?.id || projectId || "";
  editorSessionStore.replaceSegments(segmentTargetStateService.prepareHistories(editorSessionStore.getProject() ? await getProjectSegments(projectId) : []));
  editorSessionStore.replaceActivityEvents(editorSessionStore.getProject() ? await listActivityEvents(projectId) : []);
  await refreshProjectTerms();
  const activeIndex = editorSessionStore.getSegments().length ? 0 : -1;
  await filterPresetReady;
  await filterPresetController?.restoreForProject?.(editorSessionStore.getProject()?.id || projectId);
  applicationNavigation?.openProject?.(editorSessionStore.getProject()?.id || projectId, activeIndex);
  renderAll();
  if (applicationStore.getState().navigation.view === "editor") await editorContextController.refresh();
}

async function openProjectFile(documentId) {
  if (!editorSessionStore.getProject()) return;
  const first = editorSessionStore.getSegments().findIndex((segment) => segment.documentId === documentId);
  applicationNavigation?.openEditor?.({
    projectId: editorSessionStore.getProject().id,
    documentId,
    segmentId: editorSessionStore.getSegments()[first]?.id || "",
    activeIndex: first
  });
  renderAll();
  await editorContextController.refresh();
}

function renderAll() {
  segmentFilterService.invalidate();
  renderProjectList();
  renderEditor();
  renderProjectHome();
  renderProjectAnalysis();
  renderDocumentFilter();
  renderSegments();
  renderProgress();
}

function renderEditor() {
  const navigation = applicationStore.getState().navigation;
  applicationNavigation?.syncLegacy?.({
    view: navigation.view,
    projectId: navigation.projectId,
    documentId: navigation.documentId,
    segmentId: navigation.segmentId,
    activeIndex: navigation.activeIndex
  });
  applicationStore?.dispatch?.({
    type: "interface/locale-changed",
    payload: { locale: uiI18n?.getLocale?.() || "" }
  });
  const hasProject = Boolean(editorSessionStore.getProject());
  void projectLanguageContextController.syncDesktopSpellcheck();
  renderWorkspaceStatus();
  renderBackupReminder();
  if (verticalFeatureState?.editor) {
    verticalFeatureState.editor.renderShell({ view: applicationStore.getState().navigation.view, hasProject, inspectorOpen: state.inspectorOpen });
    verticalFeatureState.inspector.setVisible(applicationStore.getState().navigation.view === "editor" && state.inspectorOpen);
    verticalFeatureState.dashboard.setVisible(applicationStore.getState().navigation.view === "project" && hasProject);
  } else {
    els.workspace.classList.toggle("projects-mode", applicationStore.getState().navigation.view !== "editor");
    els.sidebar.classList.toggle("hidden", applicationStore.getState().navigation.view !== "editor");
    els.projectsView.classList.toggle("hidden", applicationStore.getState().navigation.view !== "projects");
    els.resourcesView.classList.toggle("hidden", applicationStore.getState().navigation.view !== "resources");
    els.projectHomeView.classList.toggle("hidden", applicationStore.getState().navigation.view !== "project" || !hasProject);
    els.emptyState.classList.toggle("hidden", applicationStore.getState().navigation.view !== "editor" || hasProject);
    els.editorView.classList.toggle("hidden", applicationStore.getState().navigation.view !== "editor" || !hasProject);
  }
  focusModeController.render();
  if (els.inspectorToggleBtn) {
    els.inspectorToggleBtn.setAttribute("aria-expanded", String(state.inspectorOpen));
    els.inspectorToggleBtn.textContent = state.inspectorOpen ? uiLocalizationService.source("Hide inspector") : uiLocalizationService.source("Show inspector");
  }
  if (!editorSessionStore.getProject()) return;

  const resources = projectResourceSummary();
  els.projectTitle.textContent = applicationTextSafetyService.displaySafeText(editorSessionStore.getProject().name);
  els.projectMeta.textContent = `${projectLanguageContextController.display()} - ${uiLocalizationService.label("mainTm")}: ${applicationTextSafetyService.displaySafeText(resources.mainTm, uiLocalizationService.label("none"))} - ${applicationTextSafetyService.displaySafeText(resources.tmLabel)} - ${applicationTextSafetyService.displaySafeText(resources.tbLabel)}`;
  els.projectDomainEditInput.value = editorSessionStore.getProject().domain || "";
  els.domainForm.classList.add("clean");
  els.domainForm.classList.toggle("hidden", Boolean((editorSessionStore.getProject().domain || "").trim()));
  replaceSafeHtml(els.projectInfo, `
    <dt>${uiLocalizationService.labelHtml("name")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(editorSessionStore.getProject().name)}</dd>
    <dt>${uiLocalizationService.sourceHtml("Creator")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(editorSessionStore.getProject().creatorName || uiLocalizationService.label("notSet"))}</dd>
    <dt>${uiLocalizationService.sourceHtml("Domain")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(editorSessionStore.getProject().domain || uiLocalizationService.label("notSet"))}</dd>
    <dt>${uiLocalizationService.labelHtml("languages")}</dt><dd>${applicationTextSafetyService.escapeHtml(projectLanguageContextController.display())}</dd>
    <dt>${uiLocalizationService.sourceHtml("Workspace")}</dt><dd>${applicationTextSafetyService.escapeHtml(editorSessionStore.getProject().workspaceId || "local-workspace")}</dd>
    <dt>${uiLocalizationService.labelHtml("sourceFile")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(editorSessionStore.getProject().sourceFileName || uiLocalizationService.label("notImported"))}</dd>
    <dt>${uiLocalizationService.labelHtml("mainTm")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(resources.mainTm)}</dd>
    <dt>${uiLocalizationService.labelHtml("linkedTms")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(resources.tmNames.join(", "))}</dd>
    <dt>${uiLocalizationService.labelHtml("linkedTbs")}</dt><dd>${applicationTextSafetyService.displaySafeHtml(resources.tbNames.join(", "))}</dd>
    <dt>${uiLocalizationService.sourceHtml("Documents")}</dt><dd>${projectDocumentCatalogService.list().length || 0}</dd>
    <dt>${uiLocalizationService.labelHtml("segmentsTitle")}</dt><dd>${editorSessionStore.getSegments().length}</dd>
    <dt>${uiLocalizationService.labelHtml("activity")}</dt><dd>${uiLocalizationService.labelHtml("eventCount", { count: editorSessionStore.getActivityEvents().length })}</dd>
  `);
  const ai = aiRuntimeSettingsService.normalizeProjectSettings(editorSessionStore.getProject().aiSettings);
  aiAdministrationController?.renderGlobalSettings?.({
    settings: ai,
    storedKey: aiCredentialStorageService.storedOpenAiKey(),
    rememberKey: Boolean(aiCredentialStorageService.openAiSnapshot().local),
    storageText: `OpenAI key: ${aiCredentialStorageService.openAiStorageLabel()}. API keys stay in this browser and are never exported with project packages.`
  });
  aiProviderFormController.renderCommandCentre();
  qualityWorkbenchController.render();
  renderTermbaseSelect();
}

function renderTermbaseSelect() {
  if (!els.termBaseSelect) return;
  const names = projectTermBaseNames();
  const current = els.termBaseSelect.value;
  const fragment = document.createDocumentFragment();
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = applicationTextSafetyService.displaySafeText(name);
    fragment.append(option);
  });
  els.termBaseSelect.replaceChildren(fragment);
  els.termBaseSelect.value = names.includes(current) ? current : primaryTermBaseName();
}

function renderProjectHome() {
  if (!editorSessionStore.getProject()) return;
  const documents = projectDocumentCatalogService.list();
  const documentStatsById = projectDocumentStatisticsService.byDocument(documents);
  const total = projectDocumentStatisticsService.aggregate(documentStatsById);
  const sourceWords = total.words;
  const resources = projectResourceSummary();
  els.projectHomeTitle.textContent = applicationTextSafetyService.displaySafeText(
    editorSessionStore.getProject().name
  );
  els.projectHomeMeta.textContent = `${projectLanguageContextController.display()} - ${applicationTextSafetyService.displaySafeText(editorSessionStore.getProject().domain || uiLocalizationService.label("noDomain"))} - ${uiLocalizationService.label("mainTm")}: ${applicationTextSafetyService.displaySafeText(resources.mainTm, uiLocalizationService.label("none"))} - ${applicationTextSafetyService.displaySafeText(resources.tmLabel)} - ${applicationTextSafetyService.displaySafeText(resources.tbLabel)}`;
  replaceSafeHtml(els.projectHomeStats, `
    <div><strong>${total.percent}%</strong><span>${uiLocalizationService.labelHtml("confirmed")}</span></div>
    <div><strong>${documents.length}</strong><span>${uiLocalizationService.labelHtml("files")}</span></div>
    <div><strong>${editorSessionStore.getSegments().length}</strong><span>${uiLocalizationService.labelHtml("segments")}</span></div>
    <div><strong>${sourceWords}</strong><span>${uiLocalizationService.labelHtml("sourceWords")}</span></div>
  `);
  els.fileCountText.textContent = documents.length ? uiLocalizationService.label("fileCount", { count: documents.length }) : uiLocalizationService.source("No files imported");
  if (!documents.length) {
    replaceSafeHtml(els.projectFileList, `<div class="empty-file-state">${uiLocalizationService.sourceHtml("Import a DOCX or other format file to start translating this project.")}</div>`);
    return;
  }
  const fragment = document.createDocumentFragment();
  documents.forEach((documentInfo) => {
    const stats = documentStatsById.get(documentInfo.id) || projectDocumentStatisticsService.empty();
    const card = document.createElement("article");
    card.className = "file-card";
    replaceSafeHtml(card, `
      <header>
        <div>
          <h4>${applicationTextSafetyService.displaySafeHtml(documentInfo.name)}</h4>
          <p>${applicationTextSafetyService.escapeHtml((documentInfo.type || "file").toUpperCase())}</p>
        </div>
        <span class="language-badge">${stats.percent}%</span>
      </header>
      <div class="project-stats">
        <div><strong>${stats.words}</strong><span>${uiLocalizationService.labelHtml("words")}</span></div>
        <div><strong>${stats.segments}</strong><span>${uiLocalizationService.labelHtml("segments")}</span></div>
      </div>
      <div class="progress-bar"><div style="width:${stats.percent}%"></div></div>
      <footer>
        <span>${uiLocalizationService.labelHtml("emptyDraftCount", { empty: stats.empty, draft: stats.draft })}</span>
        <div class="file-card-actions"></div>
      </footer>
    `);
    card.querySelector(".progress-bar > div").style.width = `${stats.percent}%`;
    const deleteButton = document.createElement("button");
    const fileLabel = applicationTextSafetyService.displaySafeText(
      documentInfo.name,
      uiLocalizationService.source("file")
    );
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = uiLocalizationService.source("Delete");
    deleteButton.setAttribute("aria-label", uiLocalizationService.source("Delete file {value1}", { value1: fileLabel }));
    deleteButton.addEventListener("click", () => confirmDeleteFile(documentInfo));
    const openButton = document.createElement("button");
    openButton.className = "primary";
    openButton.type = "button";
    openButton.textContent = uiLocalizationService.source("Open");
    openButton.setAttribute("aria-label", uiLocalizationService.source("Open file {value1}", { value1: fileLabel }));
    openButton.addEventListener("click", () => openProjectFile(documentInfo.id));
    card.querySelector(".file-card-actions").append(deleteButton, openButton);
    fragment.append(card);
  });
  els.projectFileList.replaceChildren(fragment);
}

function renderDocumentFilter() {
  const current = applicationStore.getState().navigation.documentId;
  const documents = projectDocumentCatalogService.list();
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = uiLocalizationService.source("All documents");
  fragment.append(allOption);
  documents.forEach((documentInfo) => {
    const option = document.createElement("option");
    option.value = documentInfo.id;
    option.textContent = applicationTextSafetyService.displaySafeText(documentInfo.name);
    fragment.append(option);
  });
  els.documentFilter.replaceChildren(fragment);
  els.documentFilter.value = documents.some((documentInfo) => documentInfo.id === current) ? current : "";
  if (els.documentFilter.value !== current) applicationNavigation.selectDocument({ documentId: els.documentFilter.value });
}

function renderLanguagePairFilter() {
  const current = els.languagePairFilter.value;
  const pairs = Array.from(new Set(editorSessionStore.getProjects().map((project) => projectLanguageContextController.key(project)).filter((pair) => pair !== "::"))).sort();
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = uiLocalizationService.source("All language pairs");
  fragment.append(allOption);
  pairs.forEach((pair) => {
    const [sourceLang, targetLang] = pair.split("::");
    const option = document.createElement("option");
    option.value = pair;
    option.textContent = languageInputService.pairDisplay(sourceLang, targetLang);
    fragment.append(option);
  });
  els.languagePairFilter.replaceChildren(fragment);
  els.languagePairFilter.value = pairs.includes(current) ? current : "";
}

function createProjectTile(project) {
  const tile = document.createElement("article");
  tile.className = "project-tile";
  replaceSafeHtml(tile, `
    <header>
      <div>
        <h3>${applicationTextSafetyService.displaySafeHtml(project.name)}</h3>
        <p>${applicationTextSafetyService.displaySafeHtml(project.domain ? `${project.domain} - ${project.sourceFileName || uiLocalizationService.label("noSourceFileImported")}` : project.sourceFileName || uiLocalizationService.label("noSourceFileImported"))}</p>
      </div>
      <span class="language-badge">${applicationTextSafetyService.escapeHtml(projectLanguageContextController.display(project))}</span>
    </header>
    <div class="project-stats">
      <div><strong>${project.progress.percent}%</strong><span>${uiLocalizationService.labelHtml("confirmed")}</span></div>
      <div><strong>${project.progress.total}</strong><span>${uiLocalizationService.labelHtml("segments")}</span></div>
      <div><strong>${project.wordCount}</strong><span>${uiLocalizationService.labelHtml("words")}</span></div>
    </div>
    <div class="progress-bar"><div style="width:${project.progress.percent}%"></div></div>
    <footer>
      <span>${uiLocalizationService.labelHtml("updatedAt", { date: formatDate(project.updatedAt) })}</span>
    </footer>
  `);
  tile.querySelector(".progress-bar > div").style.width = `${project.progress.percent}%`;
  const deleteButton = document.createElement("button");
  const projectLabel = applicationTextSafetyService.displaySafeText(
    project.name,
    uiLocalizationService.source("project")
  );
  deleteButton.className = "danger-small";
  deleteButton.type = "button";
  deleteButton.textContent = uiLocalizationService.source("Delete");
  deleteButton.setAttribute("aria-label", uiLocalizationService.source("Delete project {value1}", { value1: projectLabel }));
  deleteButton.addEventListener("click", () => confirmDeleteProject(project.id));
  const openButton = document.createElement("button");
  openButton.className = "primary";
  openButton.type = "button";
  openButton.textContent = uiLocalizationService.source("Open");
  openButton.setAttribute("aria-label", uiLocalizationService.source("Open project {value1}", { value1: projectLabel }));
  openButton.addEventListener("click", () => openProject(project.id));
  tile.querySelector("footer").append(deleteButton, openButton);
  return tile;
}

function projectEmptyState({ hasProjects }) {
  const empty = document.createElement("div");
  empty.className = "actionable-empty-state";
  const heading = document.createElement("h3");
  const message = document.createElement("p");
  const action = document.createElement("button");
  action.type = "button";
  if (hasProjects) {
    heading.textContent = uiLocalizationService.source("No matching projects");
    message.textContent = uiLocalizationService.source("Clear the search and language filters to see every local project.");
    action.textContent = uiLocalizationService.source("Clear filters");
    action.addEventListener("click", projectFilterControlsController.clear);
  } else {
    heading.textContent = uiLocalizationService.source("Start your first translation");
    message.textContent = uiLocalizationService.source("Choose New project above, or bring in an existing LoopCAT project package.");
    action.textContent = uiLocalizationService.source("Import project package");
    action.addEventListener("click", () => els.projectPackageImportInput.click());
  }
  empty.append(heading, message, action);
  return empty;
}

function renderProjectsView() {
  const query = applicationTextSafetyService.stableLower(els.projectSearchInput.value.trim());
  const pair = els.languagePairFilter.value;
  const summaries = editorSessionStore.getProjectSummaries().map((project) => ({
    ...project,
    searchText:
      project.searchText ||
      applicationTextSafetyService.stableLower(
        `${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`
      ),
    languagePairKey: project.languagePairKey || projectLanguageContextController.key(project)
  }));
  if (verticalFeatureState?.projects) {
    verticalFeatureState.projects.render({
      projects: summaries,
      query,
      languagePair: pair,
      createItem: createProjectTile,
      createEmptyState: projectEmptyState
    });
    return;
  }
  const visible = summaries.filter((project) => (!query || project.searchText.includes(query)) && (!pair || project.languagePairKey === pair));
  els.projectDashboard.replaceChildren(...(visible.length ? visible.map(createProjectTile) : [projectEmptyState({ hasProjects: summaries.length > 0 })]));
}

async function confirmDeleteProject(projectId = editorSessionStore.getProject()?.id) {
  const project = editorSessionStore.getProjects().find((item) => item.id === projectId);
  if (!project) return false;
  const ok = uiLocalizationService.confirm(
    `Move project "${applicationTextSafetyService.displaySafeText(project.name)}" and all of its files to Trash?`
  );
  if (!ok) return false;
  try {
    await autosaveService.flush(project.id);
    if (LOOPCAT_TEST_BUILD && project[PROJECT_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated project delete failure");
    const command = appRuntime?.commands?.createDeleteProjectCommand?.({ projectId: project.id });
    if (!command) throw new Error("The reversible project deletion service is unavailable.");
    await appRuntime.commands.bus.execute(command);
    state.commandProjectId = project.id;
    clearWorkspaceDirty(project.id);
    if (editorSessionStore.getProject()?.id === project.id) {
      editorSessionStore.replaceProject(null);
      editorSessionStore.replaceSegments([]);
      applicationNavigation.openProjects();
      applicationNavigation.clearSelection();
    }
    await loadProjects(false);
    applicationSaveStatusController.set("Project moved to Trash. Undo is available.", "saved");
    applicationCommandHistoryController.render();
    return true;
  } catch (error) {
    applicationSaveStatusController.set(error.message || "Project delete failed", "dirty");
    return false;
  }
}

async function confirmDeleteFile(documentInfo) {
  if (!editorSessionStore.getProject() || !documentInfo) return false;
  const ok = uiLocalizationService.confirm(
    `Move file "${applicationTextSafetyService.displaySafeText(documentInfo.name)}" to Trash?`
  );
  if (!ok) return false;
  try {
    await autosaveService.flush(editorSessionStore.getProject().id);
    if (LOOPCAT_TEST_BUILD && documentInfo[FILE_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated file delete failure");
    const command = appRuntime?.commands?.createDeleteDocumentCommand?.({
      project: editorSessionStore.getProject(),
      documentId: documentInfo.id
    });
    if (!command) throw new Error("The reversible file deletion service is unavailable.");
    const commandResult = await appRuntime.commands.bus.execute(command);
    state.commandProjectId = editorSessionStore.getProject().id;
    editorSessionStore.replaceProject(commandResult.result.project);
    editorSessionStore.replaceProjects(editorSessionStore.getProjects().map((project) => (project.id === editorSessionStore.getProject().id ? editorSessionStore.getProject() : project)));
    editorSessionStore.replaceSegments(segmentTargetStateService.prepareHistories(await getProjectSegments(editorSessionStore.getProject().id)));
    applicationNavigation.selectDocument({ documentId: "" });
    const activeIndex = editorSessionStore.getSegments().length ? 0 : -1;
    applicationNavigation.selectSegment({
      activeIndex,
      segmentId: editorSessionStore.getSegments()[activeIndex]?.id || ""
    });
    markWorkspaceDirty();
    let fileDeleteActivityFailed = false;
    try {
      if (LOOPCAT_TEST_BUILD && documentInfo[FILE_DELETE_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated file delete activity failure");
      await logProjectActivity("delete-file", "Project file deleted", { documentId: documentInfo.id, fileName: documentInfo.name });
    } catch (activityError) {
      fileDeleteActivityFailed = true;
      console.warn("File delete activity log failed.", activityError);
      markWorkspaceDirty();
    }
    await refreshProjectSummaries();
    projectHomeController.show();
    applicationSaveStatusController.set(
      fileDeleteActivityFailed ? "File moved to Trash; activity log failed" : "File moved to Trash. Undo is available.",
      "saved"
    );
    applicationCommandHistoryController.render();
    return true;
  } catch (error) {
    applicationSaveStatusController.set(error.message || "File delete failed", "dirty");
    return false;
  }
}

function renderResourcesView() {
  resourcesController?.render?.();
}

function canAddResourceToCurrentProject(type, resource) {
  if (!editorSessionStore.getProject()) return false;
  if (resource.sourceLang !== editorSessionStore.getProject().sourceLang || resource.targetLang !== editorSessionStore.getProject().targetLang) return false;
  const names = type === "tm" ? projectTmNames() : projectTermBaseNames();
  return !names.includes(resource.name);
}

async function addResourceToCurrentProject(type, resource) {
  if (!editorSessionStore.getProject() || !canAddResourceToCurrentProject(type, resource)) return;
  const links = projectResourceLinks(editorSessionStore.getProject());
  links.push({
    id: makeId("resource-link"),
    type: type === "tm" ? "tm" : "termbase",
    name: resource.name,
    role: type === "tm" ? "reference" : undefined
  });
  editorSessionStore.replaceProject(await updateProject({ ...editorSessionStore.getProject(), resourceLinks: links }));
  editorSessionStore.replaceProjects(editorSessionStore.getProjects().map((project) => (project.id === editorSessionStore.getProject().id ? editorSessionStore.getProject() : project)));
  await refreshProjectTerms({ rerender: true });
  await refreshProjectSummaries();
  renderAll();
  await editorContextController.refresh();
  renderResourcesView();
  markWorkspaceDirty();
  applicationSaveStatusController.set(`${type === "tm" ? "TM" : "TB"} added to project`, "saved");
}

function resourceItems(type, key) {
  return resourcesController?.getItems?.(type, key) || [];
}

function appendTextWithTags(container, text, tags, options = {}) {
  const ordered = [...tags].sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  let offset = 0;
  ordered.forEach((tag) => {
    const index = typeof tag.index === "number" && tag.index >= offset ? tag.index : text.indexOf(tag.text, offset);
    if (index === -1) return;
    if (index > offset) container.append(document.createTextNode(text.slice(offset, index)));
    const chip = document.createElement(options.interactive ? "button" : "span");
    if (options.interactive) chip.type = "button";
    chip.className = `tag-chip tag-chip-${tag.type || "placeholder"}${options.interactive ? " tag-chip-action" : ""}`;
    chip.textContent = protectedTagInspectionService.displayText(tag);
    chip.title = options.interactive ? `Insert protected text: ${tag.text}` : `Protected text: ${tag.text}`;
    if (options.interactive) {
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        const rowIndex = Number(container.closest("tr")?.dataset.index);
        const ready = Number.isInteger(rowIndex) ? segmentNavigationController.select(rowIndex) : Promise.resolve();
        ready.then(() => targetProducerController.insertProtectedTag(tag.text));
      });
    }
    container.append(chip);
    offset = index + tag.text.length;
  });
  if (offset < text.length) container.append(document.createTextNode(text.slice(offset)));
}

function sourceTagMarkers(text, tags) {
  const ordered = [...tags].sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  let offset = 0;
  return ordered.flatMap((tag) => {
    const index = typeof tag.index === "number" && tag.index >= offset ? tag.index : text.indexOf(tag.text, offset);
    if (index === -1) return [];
    offset = index + tag.text.length;
    return [{ type: "tag", index, length: tag.text.length, tag }];
  });
}

function rangesOverlap(a, b) {
  return a.index < b.index + b.length && b.index < a.index + a.length;
}

function appendTextWithSourceMarkup(container, segment) {
  const text = segment.source || "";
  const tagMarkers = sourceTagMarkers(text, protectedTagInspectionService.sourceTags(segment));
  const termMarkers = termRanges(text, editorSessionStore.getProjectTerms())
    .filter((range) => !tagMarkers.some((tagMarker) => rangesOverlap(range, tagMarker)))
    .map((range) => ({ type: "term", index: range.index, length: range.length, range }));
  const markers = [...tagMarkers, ...termMarkers].sort((a, b) => a.index - b.index || (a.type === "tag" ? -1 : 1));
  let offset = 0;
  markers.forEach((marker) => {
    if (marker.index < offset) return;
    if (marker.index > offset) container.append(document.createTextNode(text.slice(offset, marker.index)));
    if (marker.type === "tag") {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `tag-chip tag-chip-${marker.tag.type || "placeholder"} tag-chip-action`;
      chip.textContent = protectedTagInspectionService.displayText(marker.tag);
      chip.title = `Insert protected text: ${marker.tag.text}`;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        const rowIndex = Number(container.closest("tr")?.dataset.index);
        const ready = Number.isInteger(rowIndex) ? segmentNavigationController.select(rowIndex) : Promise.resolve();
        ready.then(() => targetProducerController.insertProtectedTag(marker.tag.text));
      });
      container.append(chip);
    } else {
      const mark = document.createElement("mark");
      mark.className = "term-highlight";
      mark.textContent = text.slice(marker.index, marker.index + marker.length);
      mark.title = `Termbase: ${marker.range.term.sourceTerm} -> ${marker.range.term.targetTerm}`;
      container.append(mark);
    }
    offset = marker.index + marker.length;
  });
  if (offset < text.length) container.append(document.createTextNode(text.slice(offset)));
}

function renderTagTray(row, segment) {
  const tags = protectedTagInspectionService.sourceTags(segment);
  if (!tags.length) return;
  const tray = document.createElement("div");
  tray.className = "tag-tray";
  tags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `tag-chip tag-chip-${tag.type || "placeholder"} tag-chip-action`;
    chip.textContent = protectedTagInspectionService.displayText(tag);
    chip.title = `Insert protected text: ${tag.text}`;
    chip.addEventListener("click", () => targetProducerController.insertProtectedTag(tag.text));
    tray.append(chip);
  });
  const targetCell = row.querySelector(".target-cell");
  targetCell.append(tray);
}

function renderTargetTagPreview(row, segment) {
  const preview = row.querySelector(".target-tag-preview");
  const targetCell = row.querySelector(".target-cell");
  if (!preview) return;
  const tags = protectedTagInspectionService.targetTags(segment);
  preview.textContent = "";
  targetCell?.classList.toggle("has-target-preview", Boolean(tags.length));
  preview.classList.toggle("hidden", !tags.length);
  if (!tags.length) return;
  appendTextWithTags(preview, segment.target || "", tags);
  preview.onclick = () => {
    targetCell?.classList.add("editing");
    row.querySelector("textarea")?.focus();
  };
}

function spacerRow(height) {
  const row = document.createElement("tr");
  row.className = "segment-spacer-row";
  row.setAttribute("aria-hidden", "true");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.style.height = `${Math.max(0, height)}px`;
  cell.style.padding = "0";
  cell.style.border = "0";
  row.append(cell);
  return row;
}

function renderSegmentRow(index) {
  const segment = editorSessionStore.getSegments()[index];
  const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.index = String(index);
  row.classList.toggle("active", index === applicationStore.getState().navigation.activeIndex);
  row.classList.toggle("tag-warning-row", protectedTagInspectionService.hasIssue(segment));
  row.querySelector(".num-col").textContent = String(index + 1);
  const sourceCell = row.querySelector(".source-cell");
  sourceCell.textContent = "";
  sourceCell.dir = "auto";
  appendTextWithSourceMarkup(sourceCell, segment);
  const textarea = row.querySelector("textarea");
  textarea.dir = "auto";
  textarea.setAttribute("aria-label", uiLocalizationService.source("Target translation for segment {value1}", { value1: index + 1 }));
  projectLanguageContextController.applyTargetLanguage(textarea);
  textarea.value = segment.target || "";
  targetEditController.bindTargetEditor({
    textarea,
    editingCell: row.querySelector(".target-cell"),
    index,
    segmentId: segment.id
  });
  renderTargetTagPreview(row, segment);
  renderStatusCell(row, segment);
  renderTagTray(row, segment);
  row.addEventListener("click", () => segmentNavigationController.select(index));
  return row;
}

function renderStatusCell(row, segment) {
  const statusCell = row.querySelector(".status-col");
  const pill = row.querySelector(".status-pill");
  pill.className = `status-pill ${segment.status}`;
  pill.textContent = segmentStatusLabel(segment.status);
  statusCell.querySelectorAll(".tag-warning, .review-pill, .comment-marker, .tm-match-badge, .ai-segment-badge").forEach((item) => item.remove());
  if (segmentProvenanceService.hasTmPretranslation(segment)) {
    const item = segmentProvenanceService.tmBadge(segment);
    const badge = document.createElement("div");
    badge.className = `tm-match-badge ${item.className}`;
    badge.textContent = item.text;
    badge.title = item.title;
    statusCell.append(badge);
  }
  if (protectedTagInspectionService.hasIssue(segment)) {
    const warning = document.createElement("div");
    warning.className = "tag-warning";
    warning.textContent = uiLocalizationService.label("missingValue", {
      value: protectedTagInspectionService
        .missing(segment)
        .map(protectedTagInspectionService.displayText)
        .join(", ")
    });
    statusCell.append(warning);
  }
  if (segment.reviewState) {
    const review = document.createElement("div");
    review.className = `review-pill ${segment.reviewState}`;
    review.textContent = reviewLabel(segment.reviewState);
    statusCell.append(review);
  }
  const commentCount = (segment.comments || []).length + ((segment.reviewNote || "").trim() ? 1 : 0);
  if (commentCount) {
    const marker = document.createElement("div");
    marker.className = "comment-marker";
    marker.textContent = uiLocalizationService.label("noteCount", { count: commentCount });
    statusCell.append(marker);
  }
  const aiBadges = [];
  if (segmentProvenanceService.hasAiDraft(segment)) {
    aiBadges.push(segmentProvenanceService.aiBadge(segment));
  }
  if (segmentProvenanceService.hasAiSuggestions(segment)) {
    aiBadges.push({
      className: "ai-suggestion",
      text: uiLocalizationService.label("aiSuggestionCount", { count: segment.aiSuggestions.length }),
      title: uiLocalizationService.source("Reviewable AI suggestions are available for this segment")
    });
  }
  const riskLevel = segmentProvenanceService.aiRiskLevel(segment);
  if (riskLevel) {
    aiBadges.push({
      className: `ai-risk ai-risk-${riskLevel}`,
      text: `${qualityPresentationService.aiReviewRisk(riskLevel)}`,
      title: uiLocalizationService.source("Risk-ranked AI review comment")
    });
  }
  aiBadges.forEach((item) => {
    const badge = document.createElement("div");
    badge.className = `ai-segment-badge ${item.className}`;
    badge.textContent = item.text;
    badge.title = item.title;
    statusCell.append(badge);
  });
}

function segmentWindow(indexes) {
  return verticalFeatureState.segmentGrid.calculateWindow(indexes);
}

function renderSegments(options = {}) {
  const indexes = segmentFilterService.visibleIndexes();
  const scrollTop = els.segmentGridWrap?.scrollTop || 0;
  if (!indexes.length) {
    verticalFeatureState.segmentGrid.resetWindow();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "muted";
    cell.textContent = uiLocalizationService.source("No segments match this view.");
    row.append(cell);
    els.segmentBody.replaceChildren(row);
    return;
  }
  const win = segmentWindow(indexes);
  const previousWindow = verticalFeatureState.segmentGrid.getWindow();
  if (
    options.fromScroll &&
    win.start === previousWindow.start &&
    win.end === previousWindow.end &&
    win.total === previousWindow.total
  ) {
    return;
  }
  const activeElement = document.activeElement;
  if (options.fromScroll && els.segmentGridWrap.contains(activeElement) && !win.indexes.includes(applicationStore.getState().navigation.activeIndex)) {
    activeElement.blur();
  }
  verticalFeatureState.segmentGrid.commitWindow(win);
  const topHeight = win.start * SEGMENT_ROW_HEIGHT;
  const bottomHeight = (indexes.length - win.end) * SEGMENT_ROW_HEIGHT;
  const fragment = document.createDocumentFragment();
  if (topHeight) fragment.append(spacerRow(topHeight));
  win.indexes.forEach((index) => fragment.append(renderSegmentRow(index)));
  if (bottomHeight) fragment.append(spacerRow(bottomHeight));
  els.segmentBody.replaceChildren(fragment);
  if (options.preserveScroll && els.segmentGridWrap.scrollTop !== scrollTop) {
    els.segmentGridWrap.scrollTop = scrollTop;
  }
}

function updateRow(index) {
  const row = els.segmentBody.querySelector(`tr[data-index="${index}"]`);
  const segment = editorSessionStore.getSegments()[index];
  if (!row || !segment) return;
  row.classList.toggle("active", index === applicationStore.getState().navigation.activeIndex);
  row.classList.toggle("tag-warning-row", protectedTagInspectionService.hasIssue(segment));
  renderTargetTagPreview(row, segment);
  renderStatusCell(row, segment);
}

function scheduleRowUpdate(index) {
  verticalFeatureState.segmentGrid.scheduleRowUpdate(index, (indexes) => indexes.forEach(updateRow));
}

function scheduleRevisionHistoryRender() {
  if (state.revisionHistoryFrame) return;
  state.revisionHistoryFrame = requestAnimationFrame(() => {
    state.revisionHistoryFrame = 0;
    revisionHistoryPresentationService.render();
  });
}

function renderProgress(options = {}) {
  const summary = segmentProgressService.refresh(options);
  const { total, confirmed, words } = summary;
  const open = total - confirmed;
  els.progressText.textContent = uiLocalizationService.label("progressSummary", { confirmed, open, total });
  els.wordCountText.textContent = uiLocalizationService.label("sourceWordCount", { count: words });
  els.progressFill.style.width = total ? `${Math.round((confirmed / total) * 100)}%` : "0";
}

/* LOOPCAT_TEST_WORKFLOW_DRIVER */

applicationStartupController.start();
})();
