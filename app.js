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
const SEGMENT_HISTORY_LIMIT = 25;
const SEGMENT_TYPING_HISTORY_WINDOW_MS = 30000;
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
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
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
const segmentSourceWordCounts = new WeakMap();
const editorFilterStore = appRuntime.featureFactories.createFilterStore();

const state = {
  inspectorOpen: true,
  segmentFilterRevision: 0,
  segmentFilterCache: { key: "", indexes: [], positions: new Map() },
  projectAnalysisRun: 0,
  importTask: "",
  revisionHistoryFrame: 0,
  saveStatusTimer: 0,
  workspaceAutosaveTimer: 0,
  workspaceAutosaving: false,
  qaFilter: "",
  lastValidationReport: null,
  commandQuery: "",
  commandProjectId: "",
  desktopSpellcheckTargetLang: null,
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

function currentProjects() {
  return editorSessionStore.getProjects();
}

function currentProject() {
  return editorSessionStore.getProject();
}

function currentSegments() {
  return editorSessionStore.getSegments();
}

function currentProjectSummaries() {
  return editorSessionStore.getProjectSummaries();
}

function currentProjectTerms() {
  return editorSessionStore.getProjectTerms();
}

function currentActivityEvents() {
  return editorSessionStore.getActivityEvents();
}

function currentQaChecks() {
  return editorSessionStore.getQaChecks();
}

function storedQualityRiskQueue() {
  return editorSessionStore.getQualityRiskQueue();
}

function currentProgressSummary() {
  return editorSessionStore.getProgressSummary();
}

function currentApplicationView() {
  return applicationStore.getState().navigation.view;
}

function currentProjectId() {
  return applicationStore.getState().navigation.projectId;
}

function currentDocumentId() {
  return applicationStore.getState().navigation.documentId;
}

function currentActiveIndex() {
  return applicationStore.getState().navigation.activeIndex;
}

function currentSegmentId() {
  return applicationStore.getState().navigation.segmentId;
}

function currentFocusMode() {
  return applicationStore.getState().interface.focusMode;
}

function currentEditorFilters() {
  return editorFilterStore.getState();
}

function updateEditorFilters(patch) {
  return editorFilterStore.update(patch);
}

function selectApplicationSegment(activeIndex, segmentId = currentSegments()[activeIndex]?.id || "") {
  return applicationNavigation.selectSegment({ activeIndex, segmentId });
}

function selectApplicationDocument(documentId, selection = {}) {
  return applicationNavigation.selectDocument({ documentId, ...selection });
}

function applicationNavigationPayload(overrides = {}) {
  const navigation = applicationStore.getState().navigation;
  return {
    view: navigation.view,
    projectId: currentProjectId(),
    documentId: navigation.documentId,
    segmentId: navigation.segmentId,
    activeIndex: navigation.activeIndex,
    ...overrides
  };
}

function syncLegacyApplicationState(overrides = {}) {
  const navigation = applicationNavigation?.syncLegacy?.(applicationNavigationPayload(overrides));
  applicationStore?.dispatch?.({
    type: "interface/locale-changed",
    payload: { locale: uiI18n?.getLocale?.() || "" }
  });
  return navigation;
}

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
  source: uiSource,
  onError: (error) => setSaveStatus(error?.message || "AI action failed.", "dirty")
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
  status: { set: setSaveStatus },
  onSaved: renderRevisionHistory,
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
const segmentConfirmationController = appRuntime.featureFactories.createSegmentConfirmationController({
  element: els.confirmBtn,
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createConfirmSegmentCommand,
    changed: renderUndoControls
  },
  selection: {
    getActiveIndex: currentActiveIndex,
    focusTarget: focusActiveTextarea,
    goToNextOpen: goToNextOpenSegment
  },
  validation: {
    missingTags,
    tagLabel: tagDisplayText
  },
  filters: { matches: segmentPassesFilters },
  mutation: {
    confirm: applySegmentConfirmation,
    restore: restoreSegmentConfirmation,
    preparePersistedRollback: preparePersistedConfirmationRollback
  },
  persistence: {
    clearPending: clearPendingSave,
    save: saveSegment,
    saveToTm: saveSegmentToTm,
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
      restoreSegmentCommandSnapshot(segmentId, snapshot, options)
  },
  view: {
    updateRow,
    renderSegments,
    renderProgress,
    scheduleHistory: scheduleRevisionHistoryRender,
    renderHistory: renderRevisionHistory
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
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
targetEditController = appRuntime.featureFactories.createTargetEditController({
  editorSessionStore,
  commandBus: appRuntime.commands.bus,
  editTargetSessions: appRuntime.commands.editTargetSessions,
  persistence: { debounce: (segment) => autosaveService.debounce(segment) },
  status: { commandsChanged: renderUndoControls },
  selection: {
    getActiveIndex: currentActiveIndex,
    ensureVisible: ensureSegmentVisible,
    findEditor: (index) => verticalFeatureState.segmentGrid.findTargetEditor(els.segmentBody, index)
  },
  createPatch: targetCommandPatch,
  restorePatch: restoreSegmentEditCommandPatch,
  applyDraft: applyTargetDraft,
  activateSegment: setActiveSegment,
  confirmSegment: () => segmentConfirmationController.confirm(),
  getCommandProjectId: () => state.commandProjectId,
  getVisibleIndexes: filteredSegmentIndexes,
  getVisiblePosition: filteredSegmentPosition,
  normalizeKey: stableLower,
  undo: undoLastCommand,
  redo: redoLastCommand
});
const targetProducerController = appRuntime.featureFactories.createTargetProducerController({
  copySourceElement: els.copySourceBtn,
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    createCopySource: appRuntime.commands.createCopySourceToTargetCommand,
    createTmTarget: appRuntime.commands.createInsertTmTargetCommand,
    createProtectedTag: appRuntime.commands.createInsertProtectedTagCommand,
    changed: renderUndoControls
  },
  editLifecycle: { finalize: finalizePendingEditCommand },
  persistence: {
    clearPending: clearPendingSave,
    debounce: debounceSave
  },
  selection: {
    getActiveIndex: currentActiveIndex,
    active: (segment) => targetEditController.activeSelection(segment),
    normalize: (selection, targetLength) => targetEditController.normalizeSelection(selection, targetLength),
    focus: focusActiveTextarea
  },
  filters: { matches: segmentPassesFilters },
  mutation: {
    capturePatch: targetCommandPatch,
    applyTarget: setSegmentTargetAndStatus,
    touch: touchSegment,
    restorePatch: applyTargetCommandPatch,
    invalidateFilters: invalidateSegmentFilterCache
  },
  restoration: { restorePatch: restoreSegmentEditCommandPatch },
  view: {
    renderSegments,
    renderProgress,
    renderHistory: renderRevisionHistory
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus }
});
targetProducerController.mount();
const targetReplacementController = appRuntime.featureFactories.createTargetReplacementController({
  elements: {
    findInput: els.replaceFindInput,
    replacementInput: els.replaceWithInput,
    visibleButton: els.replaceVisibleBtn,
    allButton: els.replaceAllBtn
  },
  editorSessionStore,
  filters: {
    getOptions: () => ({
      regex: currentEditorFilters().regex,
      caseSensitive: currentEditorFilters().caseSensitive
    }),
    getIndexes: (scope) => (scope === "all" ? projectSegmentIndexes() : filteredSegmentIndexes())
  },
  transform: { replace: replaceOutsideProtectedTokens },
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createReplaceTargetsCommand,
    changed: renderUndoControls
  },
  persistence: {
    flush: flushPendingSegmentSaves,
    clearPending: clearPendingSave,
    save: saveSegments
  },
  mutation: {
    applyTarget: setSegmentTargetAndStatus,
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    hasTagIssue
  },
  restoration: { restoreSnapshots: restoreSegmentCommandSnapshots },
  selection: {
    getActiveSegmentId: () => currentSegment()?.id || "",
    focusTarget: focusActiveTextarea
  },
  presentation: {
    renderSegments,
    renderProgress,
    refreshSidebar,
    renderHistory: renderRevisionHistory
  },
  activity: {
    log: (details) => logProjectActivity("replace-target", "Target text replaced", details)
  },
  status: { set: setSaveStatus },
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
    getDocumentSegments: currentDocumentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment))
  },
  threshold: { request: requestTmPretranslationThreshold },
  tm: {
    getNames: projectTmNames,
    findMatchesBatch: findProjectTmMatchesBatch
  },
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createTmPretranslationCommand,
    changed: renderUndoControls
  },
  persistence: {
    flush: flushPendingSegmentSaves,
    save: saveSegments
  },
  mutation: {
    capturePatch: targetCommandPatch,
    applyTarget: setSegmentTargetAndStatus,
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState
  },
  restoration: { restorePatches: restoreBatchTargetCommandPatches },
  selection: {
    getActiveSegmentId: () => currentSegment()?.id || "",
    focusTarget: focusActiveTextarea
  },
  presentation: {
    yieldToUi,
    renderSegments,
    renderProgress,
    renderHistory: renderRevisionHistory,
    refreshSidebar
  },
  activity: {
    log: (details) => logProjectActivity("pretranslate", "TM pretranslation applied", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
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
          ? localAISettingsStore.defaults(settings || {}, currentProject())
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
    project: { get: currentProject },
    administration: {
      readLocalForm: () => aiAdministrationController?.readLocalForm?.() || {},
      readSecrets: () => aiAdministrationController?.readSecrets?.() || {}
    },
    localSettings: {
      projectSettings: (project) => localAISettingsStore.projectSettings(project),
      defaults: (settings, project) => localAISettingsStore.defaults(settings, project)
    },
    languages: {
      normalizeInput: normalizeLanguageInputValue,
      nameForUi: languageNameForUi
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
    redact: redactSensitiveText,
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
    status: { set: setSaveStatus }
  });
const aiSegmentContextService = appRuntime.featureFactories.createAiSegmentContextService({
  project: {
    get: currentProject,
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
  segments: { getAll: currentSegments },
  logger: console
});
const aiScopeSelectionService = appRuntime.featureFactories.createAiScopeSelectionService({
  project: { get: currentProject },
  settings: { read: () => aiRuntimeSettingsService.localSettingsFromForm() },
  segments: {
    getAll: currentSegments,
    getDocument: currentDocumentSegments,
    getActive: currentSegment
  },
  filters: { getVisibleIndexes: filteredSegmentIndexes }
});
const externalAiConsentService = appRuntime.featureFactories.createExternalAiConsentService({
  confirm: uiConfirm
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
    localization: { label: uiLabel, source: uiSource },
    defaults: {
      providerId: "ollama",
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      model: DEFAULT_LOCAL_AI_MODEL
    }
  });
const aiProviderFormController =
  appRuntime.featureFactories.createAiProviderFormController({
    administration: aiAdministrationController,
    settings: {
      readForm: aiRuntimeSettingsService.localSettingsFromForm,
      readProject: (project) => localAISettingsStore.projectSettings(project)
    },
    project: { get: currentProject, getSegment: currentSegment },
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
      normalizeInput: normalizeLanguageInputValue,
      nameForUi: languageNameForUi,
      shouldLiveSync: shouldLiveSyncLanguageInput
    },
    prompt: {
      render: (...args) => aiPromptPreviewController.render(...args),
      previewRequest: (...args) => aiPromptPreviewController.createRequest(...args)
    },
    help: { hideOpusCat: () => opusCatHelpController?.setVisible?.(false) },
    keys: { clearLocal: clearLocalAiKey, clearOpenAi: clearOpenAiKey },
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
    status: { setSave: setSaveStatus },
    localization: { label: uiLabel, source: uiSource },
    redact: redactSensitiveText,
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
    getSegment: currentSegment,
    apply: (...args) => aiSuggestionApplicationController.apply(...args),
    source: uiSource,
    label: uiLabel,
    formatDateTime
  });
const aiCommandLifecycleCoordinator =
  appRuntime.featureFactories.createAiCommandLifecycleCoordinator({
    state: {
      read: () => state.localAi,
      patch: (values) => Object.assign(state.localAi, values)
    },
    presentation: { renderProgress: aiProviderFormController.renderProgress },
    status: { set: setSaveStatus }
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
      uiConfirm(
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
    changed: renderUndoControls
  },
  persistence: {
    flush: flushPendingSegmentSaves,
    save: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    capturePatch: targetCommandPatch,
    applyPatch: applyTargetCommandPatch,
    clearPending: clearPendingSave,
    recordHistory: (segment) =>
      recordSegmentTargetHistory(segment, segment.target, segment.status, "ai-pretranslate"),
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    prepareHistories: prepareSegmentHistoryStates
  },
  restoration: { restorePatches: restoreBatchTargetCommandPatches },
  selection: { getActiveSegmentId: () => currentSegment()?.id || "" },
  presentation: {
    invalidateFilters: invalidateSegmentFilterCache,
    renderAll,
    renderSegments,
    renderProjectProgress: renderProgress,
    renderHistory: renderRevisionHistory,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    refreshSidebar
  },
  activity: {
    log: (details) =>
      logProjectActivity("ai-pretranslate", "Local AI pretranslation applied", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
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
    getActiveSegment: currentSegment,
    getActiveIndex: currentActiveIndex
  },
  scope: {
    getVisibleSegments: () =>
      filteredSegmentIndexes()
        .map((index) => currentSegments()[index])
        .filter(Boolean),
    getDocumentSegments: currentDocumentSegments,
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
    flush: flushPendingSegmentSaves,
    saveOne: saveSegment,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: touchSegment,
    clearPending: clearPendingSave,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    prepareHistories: prepareSegmentHistoryStates
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderReview: renderReviewPanel,
    updateRow,
    renderAll,
    refreshSidebar,
    renderSegments,
    renderProjectProgress: renderProgress,
    renderHistory: renderRevisionHistory
  },
  activity: {
    logActive: (details) =>
      logProjectActivity("ai-review", "AI segment review created", details),
    logBatch: (details) =>
      logProjectActivity("ai-batch-review", "Batch AI QA completed", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
  labels: { risk: aiReviewRiskLabel },
  redact: redactSensitiveText,
  ids: { next: () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()) },
  clock: { now: () => new Date().toISOString() },
  logger: console
});
const aiTagRepairController = appRuntime.featureFactories.createAiTagRepairController({
  editorSessionStore,
  selection: { getActiveSegment: currentSegment },
  scope: {
    getVisibleSegments: () =>
      filteredSegmentIndexes()
        .map((index) => currentSegments()[index])
        .filter(Boolean),
    getDocumentSegments: currentDocumentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: segmentTags,
    getMissingTags: missingTags,
    tagText: tagDisplayText
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
    flush: flushPendingSegmentSaves,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: touchSegment,
    clearPending: clearPendingSave,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    prepareHistories: prepareSegmentHistoryStates
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderAll,
    refreshSidebar
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
  status: { set: setSaveStatus },
  redact: redactSensitiveText,
  logger: console
});
const aiAlternativesController = appRuntime.featureFactories.createAiAlternativesController({
  editorSessionStore,
  selection: {
    getActiveSegment: currentSegment,
    getActiveIndex: currentActiveIndex
  },
  scope: {
    getVisibleSegments: () =>
      filteredSegmentIndexes()
        .map((index) => currentSegments()[index])
        .filter(Boolean),
    getDocumentSegments: currentDocumentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: segmentTags
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
    flush: flushPendingSegmentSaves,
    saveOne: saveSegment,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: touchSegment,
    clearPending: clearPendingSave,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    prepareHistories: prepareSegmentHistoryStates
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderSuggestions: aiSuggestionListController.render,
    updateRow,
    renderAll,
    refreshSidebar
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
  status: { set: setSaveStatus },
  redact: redactSensitiveText,
  logger: console
});
const aiTerminologyApplicationController =
  appRuntime.featureFactories.createAiTerminologyApplicationController({
    editorSessionStore,
    selection: {
      getActiveSegment: currentSegment,
      getActiveIndex: currentActiveIndex
    },
    scope: {
      getVisibleSegments: () =>
        filteredSegmentIndexes()
          .map((index) => currentSegments()[index])
          .filter(Boolean),
      getDocumentSegments: currentDocumentSegments,
      isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
      getTags: segmentTags
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
      flush: flushPendingSegmentSaves,
      saveMany: saveSegments,
      load: getProjectSegments
    },
    mutation: {
      touch: touchSegment,
      clearPending: clearPendingSave,
      restore: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: prepareSegmentHistoryState,
      prepareHistories: prepareSegmentHistoryStates
    },
    presentation: {
      renderCommandCentre: aiProviderFormController.renderCommandCentre,
      renderAiProgress: aiProviderFormController.renderProgress,
      renderOutput: aiProviderFormController.renderOutput,
      renderSuggestions: aiSuggestionListController.render,
      updateRow,
      renderAll,
      refreshSidebar
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
    status: { set: setSaveStatus },
    redact: redactSensitiveText,
    logger: console
  });
const aiDraftEditingController = appRuntime.featureFactories.createAiDraftEditingController({
  editorSessionStore,
  selection: { getActiveSegment: currentSegment },
  scope: {
    getVisibleSegments: () =>
      filteredSegmentIndexes()
        .map((index) => currentSegments()[index])
        .filter(Boolean),
    getDocumentSegments: currentDocumentSegments,
    isLocked: (segment) => Boolean(preTranslationService.isLockedSegment?.(segment)),
    getTags: segmentTags
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
    flush: flushPendingSegmentSaves,
    saveMany: saveSegments,
    load: getProjectSegments
  },
  mutation: {
    touch: touchSegment,
    clearPending: clearPendingSave,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState,
    prepareHistories: prepareSegmentHistoryStates
  },
  presentation: {
    renderCommandCentre: aiProviderFormController.renderCommandCentre,
    renderAiProgress: aiProviderFormController.renderProgress,
    renderOutput: aiProviderFormController.renderOutput,
    renderAll,
    refreshSidebar
  },
  activity: {
    logBatch: (operation, details) =>
      operation === "adapt"
        ? logProjectActivity("ai-adapt-batch", "Batch AI adaptation suggestions created", details)
        : logProjectActivity("ai-polish-batch", "Batch AI polish suggestions created", details)
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
  redact: redactSensitiveText,
  logger: console
});
const aiTermCandidatePersistenceService =
  appRuntime.featureFactories.createAiTermCandidatePersistenceService({
    project: { get: currentProject },
    termbase: {
      list: listTerms,
      save: saveTerm
    },
    normalize: { stableLower },
    workspace: { markProjectsUsingResourceDirty }
  });
const aiTerminologyExtractionController =
  appRuntime.featureFactories.createAiTerminologyExtractionController({
    editorSessionStore,
    selection: { getActiveSegment: currentSegment },
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
      refreshTerms
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
    status: { set: setSaveStatus },
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
    getDocuments: projectDocuments,
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
  status: { set: setSaveStatus },
  logger: console
});
const aiSuggestionApplicationController =
  appRuntime.featureFactories.createAiSuggestionApplicationController({
    editorSessionStore,
    commands: {
      bus: appRuntime.commands.bus,
      create: appRuntime.commands.createApplyAiSuggestionCommand,
      changed: renderUndoControls
    },
    selection: {
      getActiveIndex: currentActiveIndex,
      goToNextOpen: goToNextOpenSegment
    },
    mutation: {
      applyTarget: setSegmentTargetAndStatus,
      touch: touchSegment,
      restoreInPlace: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: prepareSegmentHistoryState,
      prepareRestoreSnapshot: prepareCommandRestoreSegmentSnapshot
    },
    persistence: {
      flush: flushPendingSegmentSaves,
      clearPending: clearPendingSave,
      save: saveSegment
    },
    activity: {
      log: (details) =>
        logProjectActivity("ai-apply-suggestion", "AI suggestion applied to target", details)
    },
    presentation: {
      renderSegments,
      renderProgress,
      renderHistory: renderRevisionHistory,
      renderSuggestions: aiSuggestionListController.render,
      refreshSidebar,
      renderAll,
      focusTarget: focusActiveTextarea
    },
    workspace: {
      markDirty: markWorkspaceDirty,
      markActivityWarningDirty: () => {
        if (currentProject()?.id) markWorkspaceDirty(currentProject().id);
      }
    },
    status: { set: setSaveStatus },
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
      touch: touchSegment,
      restoreInPlace: (segment, snapshot) => {
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, snapshot);
      },
      prepareHistory: prepareSegmentHistoryState
    },
    persistence: {
      clearPending: clearPendingSave,
      save: saveSegment
    },
    activity: { log: logProjectActivity },
    presentation: {
      renderSuggestions: aiSuggestionListController.render,
      renderHistory: renderRevisionHistory
    },
    workspace: {
      markDirty: markWorkspaceDirty,
      markActivityWarningDirty: () => {
        if (currentProject()?.id) markWorkspaceDirty(currentProject().id);
      }
    },
    status: { set: setSaveStatus },
    redact: redactSensitiveText,
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
  selection: { getActiveIndex: currentActiveIndex },
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
  status: { set: setSaveStatus },
  defaults: { model: OPENAI_DEFAULT_MODEL },
  testHooks: {
    beforeProjectSave: () => {
      if (LOOPCAT_TEST_BUILD && currentProject()[AI_SETTINGS_SAVE_FAILURE_TEST_FLAG]) {
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
        if (currentProject()?.id) markWorkspaceDirty(currentProject().id);
      },
      markRollbackDirty: markOpenAiProjectRollbackDirty
    },
    status: { set: setSaveStatus },
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
    project: { exists: () => Boolean(currentProject()) },
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
      setSave: setSaveStatus
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
    get: currentProject,
    getActiveSegment: currentSegment,
    getTerms: currentProjectTerms,
    getDocuments: projectDocuments,
    getSampleSegments: aiScopeSelectionService.projectBriefSampleSegments,
    getSurroundingSegments: aiSegmentContextService.surroundingSegmentsForSegment,
    getTags: segmentTags
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
  normalize: { stableLower }
});
const aiPromptTestController = appRuntime.featureFactories.createAiPromptTestController({
  project: { get: currentProject },
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
  status: { set: setSaveStatus }
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
    changed: renderUndoControls
  },
  selection: {
    getActiveIndex: currentActiveIndex,
    findEditor: (index) => els.segmentBody.querySelector(`tr[data-index="${index}"] textarea`),
    select: (index) => selectApplicationSegment(index),
    focusTarget: focusActiveTextarea
  },
  mutation: {
    applyTarget: setSegmentTargetAndStatus,
    touch: touchSegment,
    detectTags: detectProtectedTags,
    prepareHistoryStates: prepareSegmentHistoryStates,
    prepareRestoreSnapshot: prepareCommandRestoreSegmentSnapshot
  },
  persistence: {
    flush: flushPendingSegmentSaves,
    saveStructure: saveSegmentStructure,
    discardPending: (segmentId) => autosaveService.discard(segmentId)
  },
  view: {
    invalidateFilters: invalidateSegmentFilterCache,
    renderAll
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
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
    projectId: currentProject()?.id || "",
    segmentId: currentSegment()?.id || ""
  }),
  renderReview: () => renderReviewPanel(),
  renderHistory: () => renderRevisionHistory(),
  renderAi: aiSuggestionListController.render,
  renderQuality: () => renderQualityWorkbench(),
  refreshMatches: () => refreshTmMatches(),
  refreshTerms: () => refreshTerms()
});

const filterPresetController = appRuntime?.featureFactories?.createFilterPresetController?.({
  select: els.filterPresetSelect,
  preferencesRepository: appRuntime.preferencesRepository,
  getProjectId: () => currentProject()?.id || "",
  applyFilters: async (preset) => {
    updateEditorFilters({ status: preset.status, reviewState: preset.reviewState, aiState: preset.aiState });
    els.segmentStatusFilter.value = preset.status;
    if (els.reviewStateFilter) els.reviewStateFilter.value = preset.reviewState;
    if (els.aiSegmentFilter) els.aiSegmentFilter.value = preset.aiState;
    invalidateSegmentFilterCache();
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
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
  appShell: document.querySelector(".app-shell"),
  getCommands: commandList,
  translate: uiSource,
  focusController,
  preferencesRepository: appRuntime.preferencesRepository,
  onError: (error) => setSaveStatus(error?.message || "Command failed", "dirty")
});
if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "initializing palette controller";
void paletteController?.initialize?.();

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
      projectCount: currentProjects().length,
      segmentCount: segments.length,
      largestProjectSegmentCount: Math.max(0, ...counts.values())
    };
  },
  getInterfaceSummary: () => ({
    locale: currentUiLocale(),
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
  download: (text, filename, type) => download(filename, text, type),
  translate: uiSource
});

const dialogLifecycleController = appRuntime?.featureFactories?.createDialogController?.({
  focusController,
  getActiveElement: () => document.activeElement,
  onError: (error, context) => {
    if (context?.id === "diagnostics" && els.diagnosticsMessage) {
      els.diagnosticsMessage.textContent = uiSource(error?.message || "Diagnostics could not be collected.");
      return;
    }
    setSaveStatus(error?.message || "Dialog could not be opened.", "dirty");
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
      els.diagnosticsMessage.textContent = uiSource(error?.message || "Diagnostics could not be collected.");
    });
  }
});
dialogLifecycleController?.register?.({
  id: "trash",
  dialog: els.trashDialog,
  opener: els.trashBtn,
  closer: els.closeTrashBtn,
  initialFocus: els.closeTrashBtn,
  beforeOpen: renderTrashList
});
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
  translate: uiT,
  source: uiSource,
  label: uiLabel,
  formatDateTime,
  safeText: displaySafeText,
  chooseWorkspace: chooseWorkspaceFolder,
  saveProject: saveCurrentProjectPackageToWorkspace,
  syncWorkspace: () => runFileImportTask("Workspace sync", () => syncWorkspaceFromFolder()),
  exportWorkspaceBackup: exportWorkspaceBackupToFolder,
  repairWorkspace: repairWorkspaceLinks,
  saveRecovery: saveWorkspaceRecoveryPackages,
  exportRecoveryCopy: exportProjectPackage,
  dismissBackupReminder: () => dismissBackupReminder(),
  scheduleFrame: requestAnimationFrame,
  onError: (error, context) => {
    if (error?.name === "AbortError" && context?.phase === "choose-workspace") return;
    const fallback = {
      "choose-workspace": uiSource("Could not choose workspace folder"),
      "save-project": uiSource("Project package save failed"),
      "sync-workspace": uiSource("Workspace sync failed"),
      "export-workspace-backup": uiSource("Workspace backup failed"),
      "repair-workspace": uiSource("Workspace repair check failed"),
      "save-recovery": uiSource("Workspace recovery save failed"),
      "export-recovery-copy": uiSource("Recovery copy export failed"),
      "dismiss-backup-reminder": uiSource("Backup reminder could not be dismissed")
    }[context?.phase] || uiSource("Workspace action failed");
    setSaveStatus(error?.message || fallback, "dirty");
    if (context?.phase === "save-recovery") renderWorkspaceRecoveryPanel();
  }
});
recoveryWorkspaceController?.mount?.();
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
  hasProject: () => Boolean(currentProject()),
  runImportTask: runFileImportTask,
  importProjectFile: importProjectDocument,
  importProjectPackage: async (file) => {
    await flushPendingSegmentSaves();
    return importProjectPackage(file);
  },
  restoreBackup: async (file) => {
    await flushPendingSegmentSaves();
    return restoreBackupFile(file);
  },
  importTmx: handleTmxImport,
  importTbx: handleTbxImport,
  importTermList: handleTermListImport,
  exportProjectPackage,
  exportTargetDocx,
  exportBilingualDocx,
  exportTargetText,
  exportLocalization,
  exportXliff12: () => exportXliff(),
  exportXliff22,
  exportProjectReport: () => exportProjectReport(),
  exportQualityPassport,
  exportAnonymizedReport: () => exportProjectReport({ anonymized: true }),
  exportTmx: handleTmxExport,
  exportTbx: handleTbxExport,
  exportBackup: exportBrowserBackup,
  onValidationDismiss: () => {
    state.lastValidationReport = null;
  },
  scheduleFrame: requestAnimationFrame,
  onError: (error, context) => {
    console.warn(`Import/export action failed (${context?.phase || "unknown"}).`, error);
    setSaveStatus(error?.message || uiSource("Import or export action failed."), "dirty");
  }
});
importExportController?.mount?.();
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
  getProject: () => currentProject(),
  refreshResources,
  suggestedCreatorName,
  cleanCreatorName,
  setLanguageValue: setLanguageInputValue,
  normalizeLanguageValue: normalizeLanguageInputElement,
  renderStorageStatus: renderProjectStorageStatus,
  renderResourcePickers: renderProjectResourcePickers,
  renderFrequentPairs: renderFrequentLanguagePairs,
  save: saveProjectFromDialog,
  chooseWorkspace: chooseWorkspaceFolder,
  workspaceSupported: () => Boolean(workspaceStorage?.isSupported()),
  translate: uiSource,
  scheduleFrame: requestAnimationFrame,
  onError: (error) => setSaveStatus(error?.message || "Dialog could not be opened.", "dirty")
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
  onError: (error) => setSaveStatus(error?.message || "TM pretranslation settings could not be opened.", "dirty")
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
  onError: (error) => setSaveStatus(error?.message || "OPUS-CAT connection help could not complete the action.", "dirty")
});
opusCatHelpController?.mount?.();
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
  navigate: () => setView("resources"),
  render: renderResourcesContent,
  keyForItem: (item, type) => resourceKey(item, type === "tm" ? "tmName" : "termBaseName"),
  normalizeLanguageInput: normalizeLanguageInputElement,
  runImportTask: runFileImportTask,
  importTm: handleResourceTmxImport,
  importTb: handleResourceTbxImport,
  importTermList: handleResourceTermListImport,
  deleteResource: confirmDeleteResource,
  exportResource,
  saveTmEntry: saveEditedTmResourceEntry,
  deleteTmEntry: deleteTmResourceEntry,
  saveTerm: saveEditedTermResourceEntry,
  deleteTerm: deleteTermResourceEntry,
  scheduleFrame: requestAnimationFrame,
  onError: (error) => setSaveStatus(error?.message || "Resource action failed.", "dirty")
});
resourcesController?.mount?.();
const qualityReviewController = appRuntime?.featureFactories?.createQualityReviewController?.({
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
  source: uiSource,
  label: uiLabel,
  profileLabel: qualityLabel,
  categoryLabel: qualityCategoryName,
  riskLevelLabel: qualityRiskLevelLabel,
  formatDate,
  saveReview: saveActiveReviewMetadata,
  saveProfile: saveQualityProfileFromForm,
  saveDecision: saveQualityDecisionFromForm,
  refreshRisks: refreshQualityRiskQueue,
  nextRisk: goToNextQualityRisk,
  exportPassport: exportQualityPassport,
  openRisk: goToQualityRiskItem,
  scheduleFrame: requestAnimationFrame,
  onError: (error) => setSaveStatus(error?.message || "Quality or review action failed.", "dirty")
});
qualityReviewController?.mount?.();
const qualityProfileController = appRuntime.featureFactories.createQualityProfileController({
  editorSessionStore,
  profile: {
    normalize: defaultQualityProfile,
    buildRiskQueue: currentQualityRiskQueue
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
  presentation: { renderWorkbench: renderQualityWorkbench },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus }
});
const reviewMetadataController = appRuntime.featureFactories.createReviewMetadataController({
  editorSessionStore,
  selection: { getActiveIndex: currentActiveIndex },
  mutation: {
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState
  },
  persistence: {
    clearPending: clearPendingSave,
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
    renderReview: renderReviewPanel,
    updateRow,
    renderHistory: renderRevisionHistory
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
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
  selection: { getActiveIndex: currentActiveIndex },
  mutation: {
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState
  },
  persistence: {
    clearPending: clearPendingSave,
    save: saveSegment
  },
  risk: { buildQueue: currentQualityRiskQueue },
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
    renderReview: renderReviewPanel,
    renderWorkbench: renderQualityWorkbench,
    updateRow
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
  labels: {
    category: qualityCategoryName,
    severity: qualityDecisionSeverityLabel
  },
  ids: { comment: () => makeId("comment") }
});
const reviewStateController = appRuntime.featureFactories.createReviewStateController({
  editorSessionStore,
  commands: {
    bus: appRuntime.commands.bus,
    create: appRuntime.commands.createChangeReviewStateCommand,
    changed: renderUndoControls
  },
  selection: { getActiveIndex: currentActiveIndex },
  mutation: {
    toggle: (segment, reviewState) => {
      segment.reviewState = segment.reviewState === reviewState ? "" : reviewState;
    },
    touch: touchSegment,
    restore: (segment, snapshot) => {
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
    },
    prepareHistory: prepareSegmentHistoryState
  },
  persistence: {
    clearPending: clearPendingSave,
    save: saveSegment
  },
  restoration: {
    restoreCommand: (segmentId, snapshot) => restoreSegmentCommandSnapshot(segmentId, snapshot)
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
    renderReview: () => renderReviewPanel(),
    updateRow,
    renderHistory: renderRevisionHistory
  },
  workspace: { markDirty: markWorkspaceDirty },
  status: { set: setSaveStatus },
  describeState: (reviewState) => stableLower(reviewLabel(reviewState)),
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

function uiT(key, values = {}) {
  return uiI18n?.t ? uiI18n.t(key, values) : key;
}

function uiSource(text, values = {}) {
  return uiI18n?.source ? uiI18n.source(text, values) : String(text || "");
}

function currentUiLocale() {
  return uiI18n?.getLocale?.() || document.documentElement.lang || "en-US";
}

function uiLabel(key, values = {}) {
  return uiT(`ui.label.${key}`, values);
}

function uiLabelHtml(key, values = {}) {
  return escapeHtml(uiLabel(key, values));
}

function translatedSourceText(text, values = {}) {
  return uiSource(text, values);
}

function translatedSourceHtml(text, values = {}) {
  return escapeHtml(translatedSourceText(text, values));
}

function uiConfirm(message, values = {}) {
  return window.confirm(uiSource(message, values));
}

function uiAlert(message) {
  window.alert(uiSource(message));
}

function renderUiLocaleOptions() {
  if (!els.uiLocaleSelect || !uiI18n?.availableLocales) return;
  const current = uiI18n.getLocale();
  els.uiLocaleSelect.replaceChildren(...uiI18n.availableLocales().map((locale) => {
    const option = document.createElement("option");
    option.value = locale.locale;
    option.textContent = `${locale.label || locale.locale}${locale.custom ? ` (${uiSource("custom")})` : ""}`;
    return option;
  }));
  els.uiLocaleSelect.value = current;
}

function refreshLocalizedUi() {
  applicationStore?.dispatch?.({
    type: "interface/locale-changed",
    payload: { locale: uiI18n?.getLocale?.() || "" }
  });
  uiI18n?.localizeStaticDom?.(document.body);
  syncAllPanelToggleStates();
  renderUiLocaleOptions();
  renderFocusMode();
  renderWorkspaceStatus();
  renderProjectStorageStatus();
  if (currentApplicationView() === "projects") renderProjectsView();
  if (currentApplicationView() === "resources") renderResourcesView();
  if (currentProject()) {
    if (currentApplicationView() === "project") {
      renderProjectHome();
      void renderProjectAnalysis();
    }
    renderEditor();
    renderProgress();
    renderReviewPanel();
    renderQualityWorkbench();
    renderRevisionHistory();
    renderQaResults();
    refreshSidebar();
  }
}

async function importUiLocaleFile() {
  const file = els.uiLocaleImportInput?.files?.[0];
  if (!file || !uiI18n?.saveCustomLocale) return;
  try {
    const catalog = JSON.parse(await file.text());
    const locale = uiI18n.saveCustomLocale(catalog);
    renderUiLocaleOptions();
    uiI18n.setLocale(locale);
    refreshLocalizedUi();
    setSaveStatus("Interface translation imported", "saved");
  } catch (error) {
    setSaveStatus(error.message || "Interface translation import failed", "dirty");
  } finally {
    if (els.uiLocaleImportInput) els.uiLocaleImportInput.value = "";
  }
}

function exportUiSourceCatalog() {
  if (!uiI18n?.sourceCatalogJson) return;
  download(`loopcat-ui-source-${new Date().toISOString().slice(0, 10)}.json`, uiI18n.sourceCatalogJson(), "application/json");
  setSaveStatus("UI source exported", "saved");
}

function setSaveStatus(text, mode = "") {
  if (state.saveStatusTimer) {
    clearTimeout(state.saveStatusTimer);
    state.saveStatusTimer = 0;
  }
  const displayText = redactSensitiveText(text || "").trim();
  appRuntime?.status?.controller?.fromLegacy?.({
    text: displayText,
    mode,
    projectId: currentProject()?.id || null,
    segmentId: currentSegmentId()
  });
  els.saveStatus.textContent = uiSource(displayText);
  els.saveStatus.className = `save-status ${mode}`;
  const operationActive = /^(saving|starting|requesting|sending|running|generating|extracting|polishing|adapting|pretranslating|canceling)|:\s*(reading|parsing|importing|saving)/i.test(displayText);
  els.saveStatus.setAttribute("aria-busy", String(operationActive));
  if ((mode === "saved" || displayText.startsWith("Saved to ")) && displayText !== "Saved") {
    state.saveStatusTimer = setTimeout(() => {
      els.saveStatus.textContent = uiT("app.status.saved");
      els.saveStatus.className = "save-status saved";
      state.saveStatusTimer = 0;
    }, 5000);
  }
}

function renderUndoControls() {
  const projectId = state.commandProjectId || currentProject()?.id || null;
  if (els.undoBtn) els.undoBtn.disabled = !appRuntime?.commands?.bus?.canUndo?.(projectId);
  if (els.redoBtn) els.redoBtn.disabled = !appRuntime?.commands?.bus?.canRedo?.(projectId);
}

function isResourceTrashEntry(entry) {
  return Boolean(
    entry && ["tm-entry", "term", "translation-memory", "termbase"].includes(entry.entityType)
  );
}

function resourceTrashEntryFromCommandResult(commandResult) {
  const value = commandResult?.result;
  if (isResourceTrashEntry(value)) return value;
  return isResourceTrashEntry(value?.entry) ? value.entry : null;
}

async function synchronizeResourceTrashChange(entry, { refreshSuggestions = false } = {}) {
  if (!isResourceTrashEntry(entry)) return false;
  const linkType = entry.resourceType === "tm" ? "tm" : "termbase";
  markProjectsUsingResourceDirty(linkType, entry.resourceName, entry.sourceLang, entry.targetLang);
  await refreshResources();
  if (entry.resourceType === "tb") {
    await refreshProjectTerms({ rerender: currentApplicationView() === "editor" });
    if (refreshSuggestions || currentApplicationView() === "editor") await refreshTerms();
  } else if (currentApplicationView() === "editor") {
    await refreshSidebar();
  }
  if (els.trashDialog?.open) await renderTrashList();
  else await refreshTrashSummary();
  return true;
}

async function undoLastCommand() {
  const projectId = state.commandProjectId || currentProject()?.id || null;
  finalizePendingEditCommands(projectId || "");
  const result = await appRuntime?.commands?.bus?.undo?.(projectId);
  if (!result) return false;
  const requestedActiveSegmentId = result.result?.activeSegmentId || "";
  await loadProjects(false);
  if (currentProject()?.id === projectId) {
    editorSessionStore.replaceProject(currentProjects().find((project) => project.id === projectId) || currentProject());
    editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(projectId)));
    const requestedIndex = requestedActiveSegmentId
      ? currentSegments().findIndex((segment) => segment.id === requestedActiveSegmentId)
      : -1;
    const nextIndex = currentSegments().length
      ? requestedIndex >= 0
        ? requestedIndex
        : Math.max(0, Math.min(currentActiveIndex(), currentSegments().length - 1))
      : -1;
    selectApplicationSegment(nextIndex);
    renderAll();
  } else if (!currentProject() && projectId && currentProjects().some((project) => project.id === projectId)) {
    await openProject(projectId);
  }
  await synchronizeResourceTrashChange(resourceTrashEntryFromCommandResult(result));
  setSaveStatus(result.receipt.undoLabel, "saved");
  renderUndoControls();
  if (result.result?.focusTarget || result.receipt.commandId === "edit-target") {
    focusActiveTextarea(result.result?.selection || null);
  }
  return result;
}

async function redoLastCommand() {
  const projectId = state.commandProjectId || currentProject()?.id || null;
  finalizePendingEditCommands(projectId || "");
  const result = await appRuntime?.commands?.bus?.redo?.(projectId);
  if (!result) return false;
  const requestedActiveSegmentId = result.result?.activeSegmentId || "";
  if (result.receipt.commandId === "delete-project" && currentProject()?.id === projectId) {
    editorSessionStore.replaceProject(null);
    editorSessionStore.replaceSegments([]);
    setView("projects");
    applicationNavigation.clearSelection();
  }
  await loadProjects(false);
  if (result.receipt.commandId === "delete-document" && currentProject()?.id === projectId) {
    editorSessionStore.replaceProject(currentProjects().find((project) => project.id === projectId) || currentProject());
    editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(projectId)));
    const nextIndex = currentSegments().length
      ? Math.max(0, Math.min(currentActiveIndex(), currentSegments().length - 1))
      : -1;
    selectApplicationSegment(nextIndex);
    renderAll();
  } else if (currentProject()?.id === projectId && requestedActiveSegmentId) {
    editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(projectId)));
    const requestedIndex = currentSegments().findIndex((segment) => segment.id === requestedActiveSegmentId);
    if (requestedIndex >= 0) selectApplicationSegment(requestedIndex);
    renderAll();
  }
  await synchronizeResourceTrashChange(resourceTrashEntryFromCommandResult(result));
  setSaveStatus(result.receipt.undoLabel.replace(/^Undo\s+/i, "Redid "), "saved");
  renderUndoControls();
  if (result.result?.focusTarget || result.receipt.commandId === "edit-target") {
    focusActiveTextarea(result.result?.selection || null);
  }
  return result;
}

async function refreshTrashSummary() {
  if (!els.trashBtn || !appRuntime?.trashRepository) return [];
  const entries = await appRuntime.trashRepository.list();
  els.trashBtn.textContent = entries.length ? uiSource("Trash ({value1})", { value1: entries.length }) : uiSource("Trash");
  els.trashBtn.setAttribute("aria-label", uiSource("Trash, {value1} item(s)", { value1: entries.length }));
  return entries;
}

async function restoreTrashEntry(entryId) {
  try {
    const entry = await appRuntime.trashRepository.restore(entryId);
    await loadProjects(false);
    await synchronizeResourceTrashChange(entry, { refreshSuggestions: true });
    await renderTrashList();
    setSaveStatus(`${entry.label || "Item"} restored from Trash`, "saved");
    renderUndoControls();
    return true;
  } catch (error) {
    setSaveStatus(error.message || "Trash restore failed. Existing work was preserved.", "dirty");
    return false;
  }
}

async function renderTrashList() {
  const entries = await refreshTrashSummary();
  if (!els.trashList) return entries;
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = uiSource("Trash is empty. Deleted projects, files, memories, and termbases will appear here.");
    els.trashList.replaceChildren(empty);
    els.emptyTrashBtn.disabled = true;
    return entries;
  }
  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "trash-item";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = displaySafeText(entry.label, uiSource("Deleted item"));
    const meta = document.createElement("p");
    const entityLabel =
      entry.entityType === "document"
        ? uiSource("Project file")
        : entry.entityType === "project"
          ? uiSource("Project")
          : entry.resourceType === "tm"
            ? uiSource("Translation memory")
            : uiSource("Termbase");
    meta.textContent = `${entityLabel} · ${formatDate(entry.deletedAt)}`;
    copy.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "trash-item-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = uiSource("Restore");
    restore.setAttribute("aria-label", uiSource("Restore {value1}", { value1: displaySafeText(entry.label) }));
    restore.addEventListener("click", () => restoreTrashEntry(entry.id));
    actions.append(restore);
    item.append(copy, actions);
    fragment.append(item);
  });
  els.trashList.replaceChildren(fragment);
  els.emptyTrashBtn.disabled = false;
  return entries;
}

async function openTrash() {
  return dialogLifecycleController?.open?.("trash") || false;
}

async function emptyTrashPermanently() {
  const entries = await appRuntime.trashRepository.list();
  if (!entries.length) return false;
  const confirmed = uiConfirm("Permanently delete every item in Trash? This cannot be undone.");
  if (!confirmed) return false;
  await appRuntime.trashRepository.emptyAll();
  await renderTrashList();
  setSaveStatus("Trash emptied permanently", "saved");
  return true;
}

function syncPanelToggleState(button) {
  const panel = button?.closest?.("[data-collapsible-panel]");
  if (!panel) return;
  const collapsed = panel.classList.contains("collapsed");
  const existingLabel = String(button.getAttribute("aria-label") || "").trim();
  const panelLabel = button.dataset.panelLabel || existingLabel.replace(/^(?:Expand|Minimize|Collapse)\s+/i, "") || panel.querySelector("h2, h3")?.textContent || "panel";
  button.dataset.panelLabel = panelLabel;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", uiSource(`${collapsed ? "Expand" : "Minimize"} ${panelLabel}`));
}

function syncAllPanelToggleStates() {
  document.querySelectorAll("[data-panel-toggle]").forEach(syncPanelToggleState);
}

function renderFocusMode() {
  const active = Boolean(currentFocusMode() && currentApplicationView() === "editor" && currentProject());
  document.body.classList.toggle("focus-mode", active);
  els.workspace.classList.toggle("focus-mode", active);
  if (els.focusModeBtn) {
    els.focusModeBtn.textContent = active ? uiT("app.focus.normalView") : uiT("app.focus.focus");
    els.focusModeBtn.title = active ? uiT("app.focus.returnTitle") : uiT("app.focus.showOnlyTitle");
    els.focusModeBtn.setAttribute("aria-pressed", String(active));
  }
  if (els.exitFocusModeBtn) {
    els.exitFocusModeBtn.classList.toggle("hidden", !active);
    els.exitFocusModeBtn.setAttribute("aria-hidden", String(!active));
  }
}

function setFocusMode(enabled) {
  applicationStore?.dispatch?.({
    type: "interface/focus-mode-changed",
    payload: { enabled: Boolean(enabled && currentProject()) }
  });
  renderFocusMode();
  document.querySelectorAll(".menu[open]").forEach((menu) => menu.removeAttribute("open"));
  if (!currentProject()) return;
  requestAnimationFrame(() => {
    renderSegments({ preserveScroll: true });
    if (currentFocusMode()) focusActiveTextarea();
  });
}

function toggleFocusMode() {
  setFocusMode(!currentFocusMode());
}

function invalidateSegmentFilterCache() {
  state.segmentFilterRevision += 1;
  state.segmentFilterCache = { key: "", indexes: [], positions: new Map() };
}

function renderImportBusyState() {
  const busy = Boolean(state.importTask);
  importExportController?.renderBusy?.(busy);
  recoveryWorkspaceController?.renderBusy?.({ busy, status: state.workspaceStatus || {} });
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatStorageSize(bytes) {
  return formatFileSize(bytes) || "0 B";
}

function storageDurabilityWarnings(info = state.storageDurability) {
  if (!info?.checked || !info.supported) return [];
  const warnings = [];
  const usage = Number(info.usageBytes || 0);
  const quota = Number(info.quotaBytes || 0);
  if (!info.persisted) {
    warnings.push("Browser storage is best-effort; export project packages or connect a workspace folder for recovery.");
  }
  if (quota > 0) {
    const remaining = quota - usage;
    const ratio = usage / quota;
    if (remaining <= STORAGE_LOW_SPACE_BYTES || ratio >= STORAGE_HIGH_USAGE_RATIO) {
      warnings.push("Local storage is nearly full; export a backup before importing more files.");
    }
  }
  return warnings;
}

function storageDurabilityLine(info = state.storageDurability) {
  if (!info?.checked) return "Storage: checking local persistence";
  if (!info.supported) return "Storage: browser-managed local cache";
  const mode = info.persisted ? "persistent" : "best-effort";
  const usage = Number(info.usageBytes || 0);
  const quota = Number(info.quotaBytes || 0);
  const usageText = quota > 0 ? ` - ${formatStorageSize(usage)} of ${formatStorageSize(quota)} used` : "";
  return `Storage: ${mode}${usageText}`;
}

async function refreshStorageDurability(options = {}) {
  const request = options.request !== false;
  const storageApi = typeof navigator === "undefined" ? null : navigator.storage;
  const next = {
    checked: true,
    supported: Boolean(storageApi),
    persisted: false,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  };
  if (!storageApi) {
    state.storageDurability = next;
    renderWorkspaceStatus();
    return next;
  }
  try {
    next.persisted = typeof storageApi.persisted === "function" ? Boolean(await storageApi.persisted()) : false;
  } catch {
    next.persisted = false;
  }
  if (!next.persisted && request && typeof storageApi.persist === "function") {
    next.requested = true;
    try {
      next.persisted = Boolean(await storageApi.persist());
    } catch {
      next.persisted = false;
    }
  }
  try {
    if (typeof storageApi.estimate === "function") {
      const estimate = await storageApi.estimate();
      next.usageBytes = Number.isFinite(Number(estimate?.usage)) ? Number(estimate.usage) : 0;
      next.quotaBytes = Number.isFinite(Number(estimate?.quota)) ? Number(estimate.quota) : 0;
    }
  } catch {
    next.usageBytes = 0;
    next.quotaBytes = 0;
  }
  state.storageDurability = next;
  renderWorkspaceStatus();
  return next;
}

function setImportProgress(phase, file = null, detail = "") {
  const task = state.importTask || "Import";
  const fileName = file?.name ? ` - ${file.name}` : "";
  const fileSize = file?.size ? ` (${formatFileSize(file.size)})` : "";
  const suffix = detail ? ` - ${detail}` : "";
  setSaveStatus(`${task}: ${phase}${fileName}${fileSize}${suffix}`);
}

function yieldToUi() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(finish);
    }
    setTimeout(finish, 50);
  });
}

async function reportImportProgress(phase, file = null, detail = "") {
  setImportProgress(phase, file, detail);
  await yieldToUi();
}

function stableLower(value) {
  return String(value || "").toLowerCase();
}

const RESERVED_WINDOWS_FILENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function safeDownloadFilename(filename, fallback = "loopcat-export") {
  const fallbackName = redactSensitiveText(fallback || "loopcat-export")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/[. ]+$/g, "")
    .trim() || "loopcat-export";
  const raw = redactSensitiveText(filename || "").trim().replaceAll("\\", "/");
  const lastPathPart = raw.split("/").filter(Boolean).pop() || fallbackName;
  let clean = lastPathPart
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[. ]+|[. ]+$/g, "")
    .trim();
  if (!clean || clean === "." || clean === "..") clean = fallbackName;
  if (RESERVED_WINDOWS_FILENAME_PATTERN.test(clean)) clean = `loopcat_${clean}`;
  if (clean.length > 180) {
    const extension = clean.match(/\.[^.]{1,16}$/)?.[0] || "";
    const stemLength = Math.max(1, 180 - extension.length);
    clean = `${clean.slice(0, stemLength).replace(/[. ]+$/g, "")}${extension}`;
  }
  return clean || fallbackName;
}

function download(filename, content, type = "application/octet-stream") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeDownloadFilename(filename);
  link.hidden = true;
  document.body.append(link);
  let clickAccepted = false;
  const revokeDownloadUrl = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort cleanup; the original download failure is more useful to report.
    }
  };
  try {
    link.click();
    clickAccepted = true;
  } finally {
    link.remove();
    clickAccepted ? setTimeout(revokeDownloadUrl, 1000) : revokeDownloadUrl();
  }
}

function localizationDownloadMimeType(ext, structure = null) {
  const value = stableLower(ext);
  if (XLIFF_DOCUMENT_TYPES.has(value)) return xliffMimeType(structure?.version || "1.2");
  if (["html", "htm"].includes(value)) return "text/html";
  if (value === "xhtml") return "application/xhtml+xml";
  if (value === "md") return "text/markdown";
  if (value === "csv") return "text/csv";
  if (value === "tsv") return "text/tab-separated-values";
  if (["xml", "dita", "txml", "ttx", "xini", "resx", "wix", "ts", "icml"].includes(value)) return "application/xml";
  if (value === "idml") return "application/vnd.adobe.indesign-idml-package";
  if (["docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(value)) {
    return "application/vnd.openxmlformats-officedocument";
  }
  if (["odt", "ott", "ods", "ots", "odp", "otp"].includes(value)) return "application/vnd.oasis.opendocument";
  return "text/plain";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displaySafeText(value, fallback = "") {
  return redactSensitiveText(value || "").trim() || fallback;
}

function displaySafeHtml(value, fallback = "") {
  return escapeHtml(displaySafeText(value, fallback));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function sourceWordCount(segment) {
  if (!segment || typeof segment !== "object") return 0;
  const source = segment.source || "";
  const cached = segmentSourceWordCounts.get(segment);
  if (cached?.source === source) return cached.count;
  const count = wordCount(source);
  segmentSourceWordCounts.set(segment, { source, count });
  return count;
}

function currentSegment() {
  return currentSegments()[currentActiveIndex()] || null;
}

function setHiddenSegmentField(segment, field, value) {
  if (!segment) return;
  Object.defineProperty(segment, field, {
    value,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

function prepareSegmentHistoryState(segment) {
  if (!segment) return segment;
  segment.targetHistory = Array.isArray(segment.targetHistory) ? segment.targetHistory : [];
  if (!Object.prototype.hasOwnProperty.call(segment, "__historyTarget")) {
    setHiddenSegmentField(segment, "__historyTarget", segment.target || "");
  }
  if (!Object.prototype.hasOwnProperty.call(segment, "__historyStatus")) {
    setHiddenSegmentField(segment, "__historyStatus", segment.status || "empty");
  }
  return segment;
}

function prepareSegmentHistoryStates(segments = currentSegments()) {
  (segments || []).forEach(prepareSegmentHistoryState);
  return segments;
}

function recordSegmentTargetHistory(segment, nextTarget, nextStatus, reason = "edit") {
  prepareSegmentHistoryState(segment);
  const fromTarget = segment.__historyTarget || "";
  const fromStatus = segment.__historyStatus || "empty";
  const toTarget = String(nextTarget || "");
  const toStatus = nextStatus || (toTarget.trim() ? "draft" : "empty");
  if (fromTarget === toTarget && fromStatus === toStatus) return;

  const now = new Date().toISOString();
  const history = Array.isArray(segment.targetHistory) ? [...segment.targetHistory] : [];
  const last = history[history.length - 1];
  const canCoalesceTyping = reason === "edit" &&
    last?.reason === "edit" &&
    last.toTarget === fromTarget &&
    last.toStatus === fromStatus &&
    Date.now() - Date.parse(last.updatedAt || last.createdAt || 0) <= SEGMENT_TYPING_HISTORY_WINDOW_MS;

  if (canCoalesceTyping) {
    last.toTarget = toTarget;
    last.toStatus = toStatus;
    last.updatedAt = now;
  } else {
    history.push({
      id: makeId("target-history"),
      reason,
      fromTarget,
      toTarget,
      fromStatus,
      toStatus,
      revisionBefore: Number(segment.revision || 0),
      createdAt: now,
      updatedAt: now
    });
  }
  segment.targetHistory = history.slice(-SEGMENT_HISTORY_LIMIT);
  segment.__historyTarget = toTarget;
  segment.__historyStatus = toStatus;
}

function setSegmentTargetAndStatus(segment, target, status, reason = "edit") {
  if (!segment) return;
  const nextTarget = String(target || "");
  const nextStatus = status || (nextTarget.trim() ? "draft" : "empty");
  recordSegmentTargetHistory(segment, nextTarget, nextStatus, reason);
  segment.target = nextTarget;
  segment.status = nextStatus;
  if (reason !== "pretranslate") delete segment.tmPretranslation;
}

function targetCommandOptionalField(segment, field) {
  const present = Object.prototype.hasOwnProperty.call(segment, field);
  return { present, value: present ? structuredClone(segment[field]) : null };
}

function targetCommandPatch(segment) {
  return {
    target: String(segment?.target || ""),
    status: segment?.status || "empty",
    targetHistory: structuredClone(Array.isArray(segment?.targetHistory) ? segment.targetHistory : []),
    revision: Number(segment?.revision || 0),
    updatedAt: segment?.updatedAt || "",
    tmPretranslation: targetCommandOptionalField(segment, "tmPretranslation"),
    aiPretranslation: targetCommandOptionalField(segment, "aiPretranslation"),
    reviewState: targetCommandOptionalField(segment, "reviewState"),
    aiApplication: targetCommandOptionalField(segment, "aiApplication")
  };
}

function applyTargetCommandOptionalField(segment, field, patch) {
  if (patch?.present) segment[field] = structuredClone(patch.value);
  else Reflect.deleteProperty(segment, field);
}

function applyTargetCommandPatch(segment, patch) {
  segment.target = String(patch?.target || "");
  segment.status = patch?.status || (segment.target.trim() ? "draft" : "empty");
  segment.targetHistory = structuredClone(Array.isArray(patch?.targetHistory) ? patch.targetHistory : []);
  segment.revision = Number(patch?.revision || 0);
  segment.updatedAt = patch?.updatedAt || new Date().toISOString();
  applyTargetCommandOptionalField(segment, "tmPretranslation", patch?.tmPretranslation);
  applyTargetCommandOptionalField(segment, "aiPretranslation", patch?.aiPretranslation);
  applyTargetCommandOptionalField(segment, "reviewState", patch?.reviewState);
  applyTargetCommandOptionalField(segment, "aiApplication", patch?.aiApplication);
  setHiddenSegmentField(segment, "__historyTarget", segment.target);
  setHiddenSegmentField(segment, "__historyStatus", segment.status);
  return segment;
}

function touchSegment(segment, options = {}) {
  if (!segment) return segment;
  const revision = Number(segment.revision || 0);
  segment.revision = (Number.isFinite(revision) ? revision : 0) + 1;
  segment.updatedAt = new Date().toISOString();
  if (options.invalidateFilters !== false) invalidateSegmentFilterCache();
  return segment;
}

function languagePair(project = currentProject()) {
  return project ? languagePairDisplay(project.sourceLang, project.targetLang) : "";
}

function fileSafeName(value) {
  return (redactSensitiveText(value || "export").trim() || "export").replace(/[^\p{L}\p{N}-]+/gu, "_");
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function clearOpenAiKey() {
  try {
    aiCredentialStorageService.saveOpenAiKey("", false);
  } catch (error) {
    aiAdministrationController?.renderGlobalConnectionStatus?.(
      redactSensitiveText(error.message || "OpenAI key could not be cleared.")
    );
    return false;
  }
  aiAdministrationController?.clearOpenAiSecret?.();
  aiAdministrationController?.renderGlobalConnectionStatus?.(
    "OpenAI key: Not saved. API keys stay in this browser and are never exported with project packages."
  );
  return true;
}

function clearLocalAiKey() {
  const settings = aiRuntimeSettingsService.localSettingsFromForm();
  try {
    aiCredentialStorageService.saveLocalAiKey("", false, settings);
  } catch (error) {
    aiProviderFormController.setStatus(
      "error",
      redactSensitiveText(error.message || "Local AI key could not be cleared.")
    );
    return false;
  }
  aiAdministrationController?.clearLocalAiSecret?.();
  aiProviderFormController.setStatus("disconnected", "Local AI key cleared for this provider");
  return true;
}

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
  els.updateReadyTitle.textContent = uiSource(title);
  els.updateReadyMessage.textContent = uiSource(message);
  const busy = ["saving", "activating", "reloading"].includes(update.state);
  els.reloadUpdateBtn.disabled = busy;
  els.deferUpdateBtn.disabled = busy;
  els.reloadUpdateBtn.textContent = update.state === "error" ? uiSource("Try again") : uiSource("Reload now");
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
      await flushPendingSegmentSaves();
      if (state.workspaceStatus?.connected && state.workspaceDirtyProjectIds.size) {
        await saveWorkspaceRecoveryPackages();
      }
    },
    onStateChange: renderOfflineUpdateState,
    onError: (error) => setSaveStatus(error?.message || "Offline update failed; current version remains active", "dirty")
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
  return cleanProjectText(redactSensitiveText(value || ""), fallback).slice(0, 120);
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

function projectDocumentManifest(project = currentProject()) {
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
        type: stableLower(cleanProjectText(documentInfo.type, "file")) || "file"
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

function mainTmName(project = currentProject()) {
  return projectResourceLinks(project).find((link) => link.type === "tm" && link.role === "main")?.name || cleanProjectText(project?.mainTmName, cleanProjectText(project?.tmName, "Default TM"));
}

function projectTmNames(project = currentProject()) {
  return uniqueNames([mainTmName(project), ...projectResourceLinks(project).filter((link) => link.type === "tm").map((link) => link.name)]);
}

function projectTermBaseNames(project = currentProject()) {
  return uniqueNames(projectResourceLinks(project).filter((link) => link.type === "termbase").map((link) => link.name));
}

function primaryTermBaseName(project = currentProject()) {
  return projectTermBaseNames(project)[0] || cleanProjectText(project?.termBaseName, "Default TB");
}

function projectResourceSummary(project = currentProject()) {
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

function isOpenSegment(segment) {
  return segment.status !== "confirmed";
}

function aiReviewRiskLevel(segment = {}) {
  const level = String(segment.aiReviewRisk?.level || "").trim();
  return ["low", "medium", "high", "critical"].includes(level) ? level : "";
}

function segmentHasAiDraft(segment = {}) {
  return Boolean(segment.aiPretranslation?.provider || segment.aiPretranslation?.model);
}

function aiPretranslationBadge(segment = {}) {
  return {
    className: "ai-initiated",
    text: uiSource("AI initiated"),
    title: segment.aiPretranslation?.model
      ? uiLabel("aiInitiatedPretranslationModel", { model: segment.aiPretranslation.model })
      : uiLabel("aiInitiatedPretranslation")
  };
}

function tmPretranslationScore(segment = {}) {
  const score = Number(segment.tmPretranslation?.score);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function segmentHasTmPretranslation(segment = {}) {
  return tmPretranslationScore(segment) !== null;
}

function tmPretranslationBadge(segment = {}) {
  const score = tmPretranslationScore(segment);
  const tmName = String(segment.tmPretranslation?.tmName || "").trim();
  return {
    className: "tm-pretranslation",
    text: `TM ${score}%`,
    title: tmName
      ? uiSource("TM pretranslation match: {value1}% from {value2}", { value1: score, value2: tmName })
      : uiSource("TM pretranslation match: {value1}%", { value1: score })
  };
}

function segmentHasAiSuggestions(segment = {}) {
  return Array.isArray(segment.aiSuggestions) && segment.aiSuggestions.length > 0;
}

function segmentPassesAiFilter(segment = {}) {
  const filter = currentEditorFilters().aiState;
  if (!filter) return true;
  if (filter === "ai-draft") return segmentHasAiDraft(segment);
  if (filter === "ai-suggestions") return segmentHasAiSuggestions(segment);
  if (filter === "ai-review-risk") return Boolean(aiReviewRiskLevel(segment));
  if (filter === "high-ai-risk") return ["high", "critical"].includes(aiReviewRiskLevel(segment));
  return true;
}

function segmentQueryMatcher() {
  const filters = currentEditorFilters();
  const query = filters.query;
  if (!query) return () => true;
  const scope = filters.scope;
  if (filters.regex) {
    try {
      const pattern = new RegExp(query, filters.caseSensitive ? "" : "i");
      return (segment) => {
        const source = segment.source || "";
        const target = segment.target || "";
        const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
        return pattern.test(haystack);
      };
    } catch {
      return () => false;
    }
  }
  if (filters.caseSensitive) {
    return (segment) => {
      const source = segment.source || "";
      const target = segment.target || "";
      const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
      return haystack.includes(query);
    };
  }
  const foldedQuery = stableLower(query);
  return (segment) => {
    const source = segment.source || "";
    const target = segment.target || "";
    const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
    return stableLower(haystack).includes(foldedQuery);
  };
}

function segmentPassesFilters(segment, queryMatches = segmentQueryMatcher()) {
  const filters = currentEditorFilters();
  const status = filters.status;
  if (currentDocumentId() && segment.documentId !== currentDocumentId()) return false;
  if (filters.reviewState) {
    const comments = (segment.comments || []).length + ((segment.reviewNote || "").trim() ? 1 : 0);
    if (filters.reviewState === "comments") {
      if (!comments) return false;
    } else if (segment.reviewState !== filters.reviewState) {
      return false;
    }
  }
  if (!segmentPassesAiFilter(segment)) return false;
  const statusMatch =
    status === "all" ||
    (status === "open" && isOpenSegment(segment)) ||
    segment.status === status;
  if (!statusMatch) return false;
  return queryMatches(segment);
}

function projectSegmentIndexes() {
  return currentSegments().map((_, index) => index);
}

function segmentFilterCacheKey() {
  const filters = currentEditorFilters();
  return [
    state.segmentFilterRevision,
    currentDocumentId(),
    filters.query,
    filters.scope,
    filters.regex ? "regex" : "plain",
    filters.caseSensitive ? "case" : "fold",
    filters.status,
    filters.reviewState,
    filters.aiState
  ].join("\u001f");
}

function filteredSegmentIndexes() {
  const key = segmentFilterCacheKey();
  if (state.segmentFilterCache.key === key) return state.segmentFilterCache.indexes;
  const indexes = [];
  const queryMatches = segmentQueryMatcher();
  currentSegments().forEach((segment, index) => {
    if (segmentPassesFilters(segment, queryMatches)) indexes.push(index);
  });
  const positions = new Map(indexes.map((segmentIndex, position) => [segmentIndex, position]));
  state.segmentFilterCache = { key, indexes, positions };
  return indexes;
}

function filteredSegmentPosition(index) {
  const key = segmentFilterCacheKey();
  if (state.segmentFilterCache.key !== key) filteredSegmentIndexes();
  return state.segmentFilterCache.positions.get(index) ?? -1;
}

function firstVisibleSegmentIndex() {
  return filteredSegmentIndexes()[0] ?? -1;
}

function projectDocuments() {
  const map = new Map();
  projectDocumentManifest(currentProject()).forEach((documentInfo) => {
    const id = documentInfo?.id || "";
    if (!id || map.has(id)) return;
    map.set(id, {
      id,
      name: documentInfo.name || currentProject()?.sourceFileName || "Document",
      type: stableLower(documentInfo.type || "docx") || "docx"
    });
  });
  currentSegments().forEach((segment) => {
    const id = segment.documentId || "default-document";
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: segment.documentName || currentProject()?.sourceFileName || "Document",
        type: stableLower(segment.documentType || "docx") || "docx"
      });
      return;
    }
    const current = map.get(id);
    map.set(id, {
      ...current,
      name: current.name || segment.documentName || currentProject()?.sourceFileName || "Document",
      type: stableLower(current.type || segment.documentType || "docx") || "docx"
    });
  });
  return Array.from(map.values());
}

function projectDocumentType(documentInfo) {
  return stableLower(documentInfo?.type || "");
}

function exportDocumentForTypes(supportedTypes, selectedTypeMessage, missingMessage) {
  const docs = projectDocuments();
  const selected = currentDocumentId() ? docs.find((item) => item.id === currentDocumentId()) : null;
  if (selected) {
    if (supportedTypes.has(projectDocumentType(selected))) return selected;
    setSaveStatus(selectedTypeMessage, "dirty");
    return null;
  }
  const documentInfo = docs.find((item) => supportedTypes.has(projectDocumentType(item)));
  if (!documentInfo) setSaveStatus(missingMessage, "dirty");
  return documentInfo || null;
}

function documentSegments(documentId) {
  return currentSegments().filter((segment) => segment.documentId === documentId);
}

function emptyDocumentStats() {
  return { segments: 0, confirmed: 0, draft: 0, empty: 0, words: 0, percent: 0 };
}

function addSegmentToDocumentStats(stats, segment) {
  stats.segments += 1;
  if (segment.status === "confirmed") stats.confirmed += 1;
  if (segment.status === "draft") stats.draft += 1;
  if (segment.status === "empty") stats.empty += 1;
  stats.words += sourceWordCount(segment);
  return stats;
}

function finalizeDocumentStats(stats) {
  stats.percent = stats.segments ? Math.round((stats.confirmed / stats.segments) * 100) : 0;
  return stats;
}

function projectDocumentStats(documents = projectDocuments()) {
  const map = new Map(documents.map((documentInfo) => [documentInfo.id, emptyDocumentStats()]));
  currentSegments().forEach((segment) => {
    const id = segment.documentId || "default-document";
    if (!map.has(id)) map.set(id, emptyDocumentStats());
    addSegmentToDocumentStats(map.get(id), segment);
  });
  map.forEach(finalizeDocumentStats);
  return map;
}

function aggregateDocumentStats(statsById) {
  const total = emptyDocumentStats();
  statsById.forEach((stats) => {
    total.segments += stats.segments;
    total.confirmed += stats.confirmed;
    total.draft += stats.draft;
    total.empty += stats.empty;
    total.words += stats.words;
  });
  return finalizeDocumentStats(total);
}

function documentStats(documentId) {
  const stats = emptyDocumentStats();
  currentSegments().forEach((segment) => {
    if (segment.documentId === documentId) addSegmentToDocumentStats(stats, segment);
  });
  return finalizeDocumentStats(stats);
}

function currentDocumentSegments() {
  return currentDocumentId()
    ? currentSegments().filter((segment) => segment.documentId === currentDocumentId())
    : currentSegments();
}

function currentSelectedDocument() {
  if (!currentDocumentId()) return null;
  return projectDocuments().find((documentInfo) => documentInfo.id === currentDocumentId()) || null;
}

function deliveryExportScope() {
  const documentInfo = currentSelectedDocument();
  return {
    documentInfo,
    segments: documentInfo ? currentSegments().filter((segment) => segment.documentId === documentInfo.id) : currentSegments()
  };
}

function scopedExportBaseName(baseName, documentInfo) {
  const base = fileSafeName(baseName || currentProject()?.name || "project");
  return documentInfo ? `${base}_${fileSafeName(documentInfo.name || "current-file")}` : base;
}

function addScopedExportReportNote(report, documentInfo, label) {
  if (report?.preserved && documentInfo) report.preserved.push(`${displaySafeText(documentInfo.name || "Current file")} selected for ${label} export.`);
}

function displayLanguageName(code) {
  const clean = redactSensitiveText(code || "").trim();
  if (!clean) return "the target language";
  try {
    if (typeof Intl.DisplayNames === "function") {
      const names = new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
      return names.of(clean) || clean;
    }
  } catch {}
  return clean;
}

let languageCatalogCache = null;
let languageEntryNameCache = null;

function canonicalLanguageCode(value) {
  const clean = redactSensitiveText(value || "").trim().replaceAll("_", "-");
  if (!clean) return "";
  try {
    if (typeof Intl.getCanonicalLocales === "function") return Intl.getCanonicalLocales(clean)[0] || clean;
  } catch {}
  return clean
    .split("-")
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part;
    })
    .join("-");
}

function languageEntryNames() {
  if (languageEntryNameCache) return languageEntryNameCache;
  languageEntryNameCache = new Map();
  LANGUAGE_ENTRIES.forEach(([code, name]) => {
    const clean = canonicalLanguageCode(code);
    if (clean && !languageEntryNameCache.has(clean)) languageEntryNameCache.set(clean, name);
  });
  return languageEntryNameCache;
}

function configuredLanguageName(code) {
  return languageEntryNames().get(canonicalLanguageCode(code)) || "";
}

function languageNameForUi(code) {
  const clean = canonicalLanguageCode(code);
  if (!clean) return "";
  const configuredName = configuredLanguageName(clean);
  if (configuredName) return uiSource(configuredName);
  try {
    if (typeof Intl.DisplayNames === "function") {
      const names = new Intl.DisplayNames([uiI18n?.getLocale?.() || navigator.language || "en"], { type: "language" });
      const label = names.of(clean);
      if (label && label !== clean) return label;
    }
  } catch {}
  return clean;
}

function languageOptionValue(code) {
  const clean = canonicalLanguageCode(code);
  if (!clean) return "";
  const name = languageNameForUi(clean);
  return name && name !== clean ? `${name} (${clean})` : clean;
}

function stableLanguageLookupKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function languageCatalog() {
  if (languageCatalogCache) return languageCatalogCache;
  const seen = new Set();
  languageCatalogCache = LANGUAGE_ENTRIES
    .map(([code, name]) => ({ code: canonicalLanguageCode(code), name: name || "" }))
    .filter((item) => {
      if (!item.code || seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    })
    .map((item) => {
      const name = item.name || languageNameForUi(item.code);
      return {
        code: item.code,
        name,
        label: name && name !== item.code ? `${name} (${item.code})` : item.code
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  return languageCatalogCache;
}

function normalizeLanguageInputValue(value) {
  const clean = redactSensitiveText(value || "").trim();
  if (!clean) return "";
  const parentheticalCode = clean.match(/\(([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\)\s*$/);
  if (parentheticalCode) {
    const candidate = canonicalLanguageCode(parentheticalCode[1]);
    if (languageEntryNames().has(candidate) || candidate.includes("-")) return candidate;
  }
  const leadingCode = clean.match(/^([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\s+-\s+/);
  if (leadingCode) {
    const candidate = canonicalLanguageCode(leadingCode[1]);
    if (languageEntryNames().has(candidate) || candidate.includes("-")) return candidate;
  }
  const lookup = stableLanguageLookupKey(clean);
  const alias = LANGUAGE_ALIAS_CODES[lookup];
  if (alias) return canonicalLanguageCode(alias);
  const match = languageCatalog().find((item) => (
    stableLanguageLookupKey(item.code) === lookup ||
    stableLanguageLookupKey(item.name) === lookup ||
    stableLanguageLookupKey(item.label) === lookup
  ));
  if (match) return match.code;
  return canonicalLanguageCode(clean);
}

function displayLanguageInputValue(value) {
  const code = normalizeLanguageInputValue(value);
  return code ? languageOptionValue(code) : "";
}

function setLanguageInputValue(input, value, options = {}) {
  if (!input) return;
  const code = normalizeLanguageInputValue(value);
  input.value = options.codeOnly ? code : displayLanguageInputValue(code);
}

function normalizeLanguageInputElement(input, options = {}) {
  if (!input) return "";
  const code = normalizeLanguageInputValue(input.value);
  if (code && options.updateDisplay !== false) input.value = options.codeOnly ? code : displayLanguageInputValue(code);
  return code;
}

function shouldLiveSyncLanguageInput(input) {
  const raw = redactSensitiveText(input?.value || "").trim();
  if (!raw) return false;
  const code = normalizeLanguageInputValue(raw);
  if (!code) return false;
  if (languageCatalog().some((item) => item.code === code)) return true;
  const lookup = stableLanguageLookupKey(raw);
  return Boolean(LANGUAGE_ALIAS_CODES[lookup]) || lookup === stableLanguageLookupKey(code);
}

function languagePairKey(project = currentProject()) {
  return project ? `${normalizeLanguageInputValue(project.sourceLang)}::${normalizeLanguageInputValue(project.targetLang)}` : "";
}

function targetSpellcheckLanguage(project = currentProject()) {
  return normalizeLanguageInputValue(project?.targetLang || "");
}

async function syncDesktopSpellcheckLanguage() {
  const targetLang = targetSpellcheckLanguage();
  if (state.desktopSpellcheckTargetLang === targetLang) return null;
  state.desktopSpellcheckTargetLang = targetLang;
  const desktop = window.LoopCATDesktop;
  if (!desktop?.setSpellCheckerLanguages) return null;
  try {
    return await desktop.setSpellCheckerLanguages(targetLang ? [targetLang] : []);
  } catch (error) {
    console.warn("Desktop spellcheck language sync failed.", error);
    return null;
  }
}

function applyTargetSpellcheckLanguage(element) {
  if (!element) return;
  const targetLang = targetSpellcheckLanguage();
  if (targetLang) element.lang = targetLang;
  else element.removeAttribute("lang");
}

function languagePairDisplay(sourceLang, targetLang) {
  const source = normalizeLanguageInputValue(sourceLang);
  const target = normalizeLanguageInputValue(targetLang);
  if (!source && !target) return "";
  return `${languageOptionValue(source) || source || "-"} -> ${languageOptionValue(target) || target || "-"}`;
}

function renderLanguageDatalists() {
  if (els.languageOptions) {
    replaceSafeHtml(
      els.languageOptions,
      languageCatalog()
        .map((item) => `<option value="${escapeHtml(item.label)}"></option>`)
        .join("")
    );
  }
  if (els.languageCodeOptions) {
    replaceSafeHtml(
      els.languageCodeOptions,
      languageCatalog()
        .map((item) => `<option value="${escapeHtml(item.code)}" label="${escapeHtml(item.name)}"></option>`)
        .join("")
    );
  }
  if (els.languageNameOptions) {
    replaceSafeHtml(
      els.languageNameOptions,
      languageCatalog()
        .map((item) => `<option value="${escapeHtml(item.name)}" label="${escapeHtml(item.code)}"></option>`)
        .join("")
    );
  }
}

function renderTextEncodingOptions() {
  if (!els.fileEncodingSelect) return;
  const options = encodingApi.TEXT_ENCODING_OPTIONS || [["auto", "Auto"], ["utf-8", "UTF-8"]];
  replaceSafeHtml(
    els.fileEncodingSelect,
    options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")
  );
  els.fileEncodingSelect.value = "auto";
}

function selectedTextEncoding() {
  return els.fileEncodingSelect?.value || "auto";
}

function textDecodingOptions() {
  return { encoding: selectedTextEncoding() };
}

function recentLanguagePairs(limit = 4) {
  return [...currentProjects()]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .map((project) => [normalizeLanguageInputValue(project.sourceLang), normalizeLanguageInputValue(project.targetLang)])
    .filter(([source, target]) => source && target)
    .filter(([source, target], index, pairs) => pairs.findIndex(([a, b]) => a === source && b === target) === index)
    .slice(0, limit);
}

function renderFrequentLanguagePairs() {
  if (!els.frequentLanguagePairs) return;
  const pairs = [...recentLanguagePairs(), ...DEFAULT_LANGUAGE_PAIRS]
    .filter(([source, target], index, values) => source && target && values.findIndex(([a, b]) => a === source && b === target) === index)
    .slice(0, 6);
  const current = projectDialogValues();
  replaceSafeHtml(els.frequentLanguagePairs, pairs.map(([source, target]) => {
    const active = source === current.sourceLang && target === current.targetLang;
    return `<button type="button" class="${active ? "active" : ""}" data-source-lang="${escapeHtml(source)}" data-target-lang="${escapeHtml(target)}">${escapeHtml(languagePairDisplay(source, target))}</button>`;
  }).join(""));
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
  return currentSegment()?.source || "";
}

function segmentTags(segment) {
  const stored = Array.isArray(segment?.tags) ? segment.tags.filter((tag) => tag?.text || tag?.label) : [];
  const detected = detectProtectedTags(segment?.source || "");
  if (!stored.length) return detected;
  if (!detected.length) return stored;
  const storedCounts = new Map();
  stored.forEach((tag) => {
    const text = String(tag.text || tag.label || "");
    if (text) storedCounts.set(text, (storedCounts.get(text) || 0) + 1);
  });
  const detectedCounts = new Map();
  const merged = [...stored];
  detected.forEach((tag) => {
    const text = String(tag.text || tag.label || "");
    if (!text) return;
    const count = (detectedCounts.get(text) || 0) + 1;
    detectedCounts.set(text, count);
    if (count > (storedCounts.get(text) || 0)) merged.push(tag);
  });
  return merged;
}

function tagDisplayText(tag) {
  return tag?.label || tag?.text || "";
}

function splitProtectedRanges(text) {
  return structuralSegmentController.splitProtectedRanges(text);
}

function mappedSourceSplitIndex(source, target, targetCursor) {
  return structuralSegmentController.mappedSourceSplitIndex(source, target, targetCursor);
}

function canSplitSegmentStructure(segment) {
  return structuralSegmentController.canSplit(segment);
}

function canMergeSegmentStructures(segment, next) {
  return structuralSegmentController.canMerge(segment, next);
}

function nextSegmentForMerge(segment = currentSegment()) {
  return structuralSegmentController.nextForMerge(segment);
}

function missingTags(segment) {
  const target = segment.target || "";
  const seen = new Map();
  return segmentTags(segment).filter((tag) => {
    const used = seen.get(tag.text) || 0;
    const occurrences = target.split(tag.text).length - 1;
    seen.set(tag.text, used + 1);
    return occurrences <= used;
  });
}

function replacePlainTextChunk(text, findText, replacement, options = {}) {
  const source = String(text || "");
  const find = String(findText || "");
  if (!find) return { text: source, count: 0 };
  if (options.regex) {
    const flags = options.caseSensitive ? "g" : "gi";
    const regex = new RegExp(find, flags);
    let emptyMatch = false;
    let count = 0;
    const replaced = source.replace(regex, (match) => {
      if (match === "") emptyMatch = true;
      count += 1;
      return replacement;
    });
    if (emptyMatch) throw new Error("Find pattern must not match empty text.");
    return { text: replaced, count };
  }
  const needle = options.caseSensitive ? find : stableLower(find);
  const haystack = options.caseSensitive ? source : stableLower(source);
  let cursor = 0;
  let count = 0;
  let output = "";
  while (cursor < source.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) break;
    output += source.slice(cursor, index) + replacement;
    cursor = index + find.length;
    count += 1;
  }
  return { text: count ? output + source.slice(cursor) : source, count };
}

function replaceOutsideProtectedTokens(text, findText, replacement, options = {}) {
  const source = String(text || "");
  const protectedTokens = detectProtectedTags(source)
    .sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  let cursor = 0;
  let count = 0;
  let output = "";
  protectedTokens.forEach((token) => {
    if (token.index < cursor) return;
    const chunk = replacePlainTextChunk(source.slice(cursor, token.index), findText, replacement, options);
    output += chunk.text + token.text;
    count += chunk.count;
    cursor = token.index + token.text.length;
  });
  const tail = replacePlainTextChunk(source.slice(cursor), findText, replacement, options);
  return { text: output + tail.text, count: count + tail.count };
}

function hasTagIssue(segment) {
  return Boolean((segment.target || "").trim() && missingTags(segment).length);
}

function canRunDeliveryExport(report) {
  if (!report?.ok || report?.canExport === false) {
    if (report?.ok) setSaveStatus("Export blocked: review the validation report.", "dirty");
    else setSaveStatus(reportSummary(report), "dirty");
    return false;
  }
  return true;
}

function canRunBilingualDocxExport(report) {
  if (!report?.ok || report?.canExport === false) {
    if (report?.ok) setSaveStatus("Bilingual DOCX blocked: review the validation report.", "dirty");
    else setSaveStatus(reportSummary(report), "dirty");
    return false;
  }
  return true;
}

function exportPlanActivityDetail(plan) {
  return {
    emptyTargetPolicy: plan.policy,
    emptyTargetCount: plan.emptyTargetCount,
    sourceFallbackCount: plan.sourceFallbackCount,
    preservedEmptyTargetCount: plan.preservedEmptyTargetCount,
    draftTargetCount: plan.draftTargetCount
  };
}

function exportPlanHasWarnings(plan) {
  return Boolean(plan.emptyTargetCount || plan.draftTargetCount);
}

function incompleteExportScopeLabel(documentInfo, fallbackLabel) {
  return documentInfo?.name ? displaySafeText(documentInfo.name) : fallbackLabel;
}

function confirmIncompleteExport(plan, documentInfo, fallbackLabel) {
  if (!plan.requiresConfirmation) return true;
  const lines = [
    uiSource("The export scope {value1} contains incomplete translation work.", {
      value1: incompleteExportScopeLabel(documentInfo, fallbackLabel)
    })
  ];
  if (plan.sourceFallbackCount) {
    lines.push(uiSource("{value1} empty target segment(s) will export source text.", { value1: plan.sourceFallbackCount }));
  }
  if (plan.preservedEmptyTargetCount) {
    lines.push(uiSource("{value1} empty target segment(s) will remain empty in the exported interchange file.", { value1: plan.preservedEmptyTargetCount }));
  }
  if (plan.draftTargetCount) {
    lines.push(uiSource("{value1} non-empty unconfirmed target segment(s) will export as written.", { value1: plan.draftTargetCount }));
  }
  lines.push(uiSource("Export anyway?"));
  return window.confirm(lines.join("\n\n"));
}

function incompleteExportMessage(baseMessage, plan) {
  const notes = [];
  if (plan.sourceFallbackCount) notes.push(`${plan.sourceFallbackCount} source fallback${plan.sourceFallbackCount === 1 ? "" : "s"}`);
  if (plan.preservedEmptyTargetCount) notes.push(`${plan.preservedEmptyTargetCount} empty target${plan.preservedEmptyTargetCount === 1 ? "" : "s"}`);
  if (plan.draftTargetCount) notes.push(`${plan.draftTargetCount} unconfirmed target${plan.draftTargetCount === 1 ? "" : "s"}`);
  return notes.length ? `${baseMessage} with ${notes.join(" and ")}` : baseMessage;
}

function cancelIncompleteExport() {
  setSaveStatus("Export cancelled; no file was created.", "dirty");
}

function reviewLabel(value) {
  return {
    "needs-review": uiSource("Needs review"),
    reviewed: uiSource("Reviewed"),
    blocked: uiSource("Blocked")
  }[value] || "";
}

function segmentStatusLabel(status) {
  return {
    empty: uiLabel("empty"),
    draft: uiLabel("draft"),
    confirmed: uiLabel("confirmed")
  }[status] || uiSource(status);
}

function commandList() {
  const commandProjectId = state.commandProjectId || currentProject()?.id || null;
  const commands = [
    { id: "undo", label: "Undo last action", run: undoLastCommand, enabled: Boolean(appRuntime?.commands?.bus?.canUndo?.(commandProjectId)) },
    { id: "redo", label: "Redo last action", run: redoLastCommand, enabled: Boolean(appRuntime?.commands?.bus?.canRedo?.(commandProjectId)) },
    { id: "trash", label: "Open Trash", run: openTrash, enabled: Boolean(appRuntime?.trashRepository) },
    { id: "confirm", label: "Confirm segment", run: confirmCurrentSegment, enabled: Boolean(currentSegment()?.target?.trim()) },
    { id: "next-open", label: "Next open segment", run: goToNextOpenSegment, enabled: Boolean(currentSegments().length) },
    { id: "focus-mode", label: currentFocusMode() ? "Exit Focus view" : "Enter Focus view", run: toggleFocusMode, enabled: Boolean(currentApplicationView() === "editor" && currentProject()) },
    { id: "copy-source", label: "Copy source", run: targetProducerController.copySourceToTarget, enabled: Boolean(currentSegment()) },
    { id: "split-segment", label: "Split segment", group: "Segment", keywords: ["divide", "cursor", "structure"], run: splitCurrentSegment, enabled: Boolean(currentSegment() && canSplitSegmentStructure(currentSegment())) },
    { id: "merge-segments", label: "Merge with next segment", group: "Segment", keywords: ["join", "combine", "structure"], run: mergeWithNextSegment, enabled: Boolean(currentSegment() && canMergeSegmentStructures(currentSegment(), nextSegmentForMerge(currentSegment()))) },
    { id: "save-tm", label: "Save segment to TM", run: saveActiveSegmentToTm, enabled: Boolean(currentSegment()?.target?.trim()) },
    { id: "project-settings", label: "Project settings", run: () => openProjectDialog("edit"), enabled: Boolean(currentProject()) },
    { id: "qa", label: "Run QA checks", run: runProjectQa, enabled: Boolean(currentProject()) },
    { id: "quality-passport", label: "Export Quality Passport", run: exportQualityPassport, enabled: Boolean(currentProject()) },
    { id: "next-quality-risk", label: "Next quality risk", run: goToNextQualityRisk, enabled: Boolean(currentProject()) },
    { id: "concordance", label: "Open concordance", run: openConcordanceSearch, enabled: Boolean(currentProject()) },
    { id: "replace-target", label: "Find and replace target text", run: openReplacePanel, enabled: Boolean(currentProject()) },
    { id: "preset-translate", label: "Use Translate filter preset", group: "Filters", keywords: ["open", "segments", "matches"], run: () => filterPresetController?.applyPreset?.("translate"), enabled: Boolean(currentProject()) },
    { id: "preset-review", label: "Use Review filter preset", group: "Filters", keywords: ["needs review", "comments"], run: () => filterPresetController?.applyPreset?.("review"), enabled: Boolean(currentProject()) },
    { id: "preset-qa-fixes", label: "Use QA fixes filter preset", group: "Filters", keywords: ["quality", "blocked", "fixes"], run: () => filterPresetController?.applyPreset?.("qa-fixes"), enabled: Boolean(currentProject()) },
    { id: "preset-ai-review", label: "Use AI review filter preset", group: "Filters", keywords: ["AI", "risk", "suggestions"], run: () => filterPresetController?.applyPreset?.("ai-review"), enabled: Boolean(currentProject()) },
    { id: "project-report", label: "Export project report", run: exportProjectReport, enabled: Boolean(currentProject()) },
    { id: "anonymized-report", label: "Export anonymized report", run: () => exportProjectReport({ anonymized: true }), enabled: Boolean(currentProject()) },
    { id: "local-ai-pretranslate", label: "Local AI pre-translate", run: aiPretranslationController.pretranslate, enabled: Boolean(currentProject() && !state.localAi.running) },
    { id: "local-ai-review", label: "AI review active segment", run: aiReviewController.reviewActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-review-batch", label: "AI QA batch", run: aiReviewController.reviewBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair", label: "Suggest AI tag repair", run: aiTagRepairController.repairActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair-batch", label: "Repair AI tags batch", run: aiTagRepairController.repairBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-draft", label: "Polish active draft with AI", run: aiDraftEditingController.polishActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-batch", label: "Polish AI drafts batch", run: aiDraftEditingController.polishBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-draft", label: "Adapt active draft with AI", run: aiDraftEditingController.adaptActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-batch", label: "Adapt AI drafts batch", run: aiDraftEditingController.adaptBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants", label: "Suggest AI alternatives", run: aiAlternativesController.suggestActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants-batch", label: "Suggest AI alternatives batch", run: aiAlternativesController.suggestBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms", label: "Apply AI terminology", run: aiTerminologyApplicationController.applyActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms-batch", label: "Apply AI terminology batch", run: aiTerminologyApplicationController.applyBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms", label: "Extract AI terms", run: aiTerminologyExtractionController.extractActive, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms-batch", label: "Extract AI terms batch", run: aiTerminologyExtractionController.extractBatch, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-project-brief", label: "Generate AI project brief", run: aiProjectBriefController.generate, enabled: Boolean(currentProject() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "openai-ai", label: "Create OpenAI suggestion", run: aiOpenAiSuggestionController.create, enabled: Boolean(currentSegment()) }
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

function finalizePendingEditCommand(segmentId) {
  return targetEditController.finalize(segmentId);
}

function finalizePendingEditCommands(projectId = "") {
  return projectId ? targetEditController.finalizeProject(projectId) : targetEditController.finalizeAll();
}

function clearPendingSave(segment, options = {}) {
  return autosaveService.clear(segment, options);
}

function clearAllPendingSaves() {
  return autosaveService.clearAll();
}

function pendingSaveRecords(projectId = "") {
  return autosaveService.pendingRecords(projectId);
}

function clearPendingDocumentSaves(projectId, documentId) {
  return autosaveService.clearDocument(projectId, documentId);
}

async function flushPendingSegmentSaves(projectId = "") {
  return autosaveService.flush(projectId);
}

function formatDate(value) {
  if (!value) return uiSource("Never");
  return new Intl.DateTimeFormat(uiI18n?.getLocale?.() || undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return uiSource("Never");
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
  const knownIds = new Set(currentProjects().map((project) => project.id).filter(Boolean));
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

function shouldWarnBeforeUnload() {
  return Boolean(state.importTask || autosaveService.size() || hasUnsavedWorkspacePackages());
}

function handleBeforeUnload(event) {
  if (!shouldWarnBeforeUnload()) return;
  event.preventDefault();
  event.returnValue = "";
}

function markWorkspaceDirty(projectId = currentProject()?.id) {
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
  const projectIds = currentProjects()
    .filter((project) => projectUsesResource(project, type, name, sourceLang, targetLang))
    .map((project) => project.id);
  markWorkspaceProjectsDirty(projectIds);
  return projectIds.length;
}

function clearWorkspaceDirty(projectId = currentProject()?.id) {
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
  const storageWarnings = storageDurabilityWarnings(state.storageDurability);
  recoveryWorkspaceController?.renderStatus?.({
    status,
    dirtyCount,
    storageLine: storageDurabilityLine(state.storageDurability),
    storageWarnings,
    importBusy: Boolean(state.importTask),
    hasProject: Boolean(currentProject())
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

function dismissBackupReminder(projectId = currentProject()?.id, hours = BACKUP_REMINDER_DISMISS_HOURS) {
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

function latestProjectPackageExport(project = currentProject()) {
  const history = (project?.exportHistory || []).filter((entry) => entry.type === "project-package" && entry.createdAt);
  return history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

function backupReminderInfo(project = currentProject(), activityEvents = currentActivityEvents(), now = new Date()) {
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
  return currentProject()?.id === projectId
    ? currentProject()
    : currentProjects().find((project) => project.id === projectId) || currentProjectSummaries().find((project) => project.id === projectId) || null;
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

function projectProgress(segments) {
  const total = segments.length;
  let confirmed = 0;
  let draft = 0;
  let words = 0;
  for (const segment of segments) {
    if (segment.status === "confirmed") confirmed += 1;
    if (segment.status === "draft") draft += 1;
    words += sourceWordCount(segment);
  }
  const percent = total ? Math.round((confirmed / total) * 100) : 0;
  return { total, confirmed, draft, words, percent };
}

function projectSummaryRevision(projectId) {
  return editorSessionStore.getProjectSummaryRevision(projectId);
}

function markProjectSummaryDirty(projectId) {
  editorSessionStore.markProjectSummaryDirty(projectId);
}

function projectSummaryRecord(project, segments, summaryRevision = projectSummaryRevision(project.id)) {
  const progress = projectProgress(segments);
  const projectSearchText = stableLower(`${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`);
  return {
    ...project,
    progress,
    wordCount: progress.words,
    searchText: projectSearchText,
    languagePairKey: languagePairKey(project),
    summaryRevision
  };
}

async function summarizeProject(project, segments = null, summaryRevision = projectSummaryRevision(project.id)) {
  const projectSegments = Array.isArray(segments) ? segments : await getProjectSegments(project.id);
  return projectSummaryRecord(project, projectSegments, summaryRevision);
}

async function refreshProjectSummaries() {
  const cachedById = new Map(currentProjectSummaries().map((summary) => [summary.id, summary]));
  const projectSummaries = await Promise.all(currentProjects().map((project) => {
    const revision = projectSummaryRevision(project.id);
    const cached = cachedById.get(project.id);
    if (cached && cached.updatedAt === project.updatedAt && cached.summaryRevision === revision) {
      return {
        ...cached,
        ...project,
        progress: cached.progress,
        wordCount: cached.wordCount,
        searchText: stableLower(`${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`),
        languagePairKey: languagePairKey(project),
        summaryRevision: revision
      };
    }
    const inMemorySegments = currentProject()?.id === project.id ? currentSegments() : null;
    return summarizeProject(project, inMemorySegments, revision);
  }));
  editorSessionStore.replaceProjectSummaries(projectSummaries);
  renderLanguagePairFilter();
  renderProjectsView();
}

async function loadProjects(selectFirst = false) {
  editorSessionStore.replaceProjects(await listProjects());
  const knownProjectIds = new Set(currentProjects().map((project) => project.id));
  editorSessionStore.pruneProjectSummaryRevisions(knownProjectIds);
  pruneWorkspaceDirtyProjectIds();
  await refreshProjectSummaries();
  renderProjectList();
  renderEditor();
  void refreshTrashSummary();
  if (selectFirst && !currentProject() && currentProjects()[0]) {
    await openProject(currentProjects()[0].id);
  }
}

function setView(view) {
  if (view === "projects") applicationNavigation?.openProjects?.();
  else if (view === "resources") applicationNavigation?.openResources?.();
  else if (view === "project") applicationNavigation?.openProject?.(currentProject()?.id || null, currentActiveIndex());
  else applicationNavigation?.openEditor?.(applicationNavigationPayload({ view: "editor" }));
  renderEditor();
  if (view === "projects") refreshProjectSummaries();
  if (view === "resources") refreshResources();
}

function showProjectHome() {
  if (!currentProject()) return;
  const activeIndex = currentSegments().length ? 0 : -1;
  applicationNavigation?.openProject?.(currentProject().id, activeIndex);
  renderAll();
}

function resourceKey(item, nameField) {
  return `${item[nameField] || "Unnamed resource"}::${item.languagePair || `${item.sourceLang || ""}::${item.targetLang || ""}`}`;
}

function resourceLabelFromKey(key) {
  const parts = String(key || "").split("::");
  const targetLang = parts.pop() || "";
  const sourceLang = parts.pop() || "";
  const name = parts.join("::") || "Unnamed resource";
  return { name, sourceLang: sourceLang || "", targetLang: targetLang || "", languagePair: `${sourceLang || ""}::${targetLang || ""}` };
}

function summarizeResources(items, nameField) {
  const map = new Map();
  items.forEach((item) => {
    const key = resourceKey(item, nameField);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: item[nameField] || "Unnamed resource",
        sourceLang: item.sourceLang,
        targetLang: item.targetLang,
        languagePair: item.languagePair,
        count: 0,
        updatedAt: item.updatedAt || item.createdAt || ""
      });
    }
    const summary = map.get(key);
    summary.count += 1;
    if (new Date(item.updatedAt || item.createdAt || 0) > new Date(summary.updatedAt || 0)) {
      summary.updatedAt = item.updatedAt || item.createdAt || "";
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name) || String(a.languagePair || "").localeCompare(String(b.languagePair || "")));
}

function matchingResourceSummaries(type, sourceLang, targetLang, selectedNames = []) {
  const isTm = type === "tm";
  const resourceState = resourcesController?.getState?.() || { tmEntries: [], terms: [] };
  const summaries = summarizeResources(isTm ? resourceState.tmEntries : resourceState.terms, isTm ? "tmName" : "termBaseName")
    .filter((resource) => resource.sourceLang === sourceLang && resource.targetLang === targetLang);
  selectedNames.forEach((name) => {
    if (summaries.some((resource) => resource.name === name)) return;
    summaries.push({
      key: `${name}::${sourceLang}::${targetLang}`,
      name,
      sourceLang,
      targetLang,
      languagePair: `${sourceLang}::${targetLang}`,
      count: 0,
      updatedAt: ""
    });
  });
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

function projectDialogValues() {
  return {
    sourceLang: normalizeLanguageInputValue(els.sourceLangInput.value),
    targetLang: normalizeLanguageInputValue(els.targetLangInput.value)
  };
}

function resourceOptionHtml(resource, type, selected, main) {
  const countLabel = resource.count
    ? uiLabel(type === "tm" ? "unitCount" : "termCount", { count: resource.count })
    : uiLabel("empty");
  const checkbox = `<input type="checkbox" data-resource-type="${type}" data-resource-name="${escapeHtml(resource.name)}" ${selected ? "checked" : ""}>`;
  const radio = type === "tm"
    ? `<input type="radio" name="projectMainTm" data-main-tm="${escapeHtml(resource.name)}" ${main ? "checked" : ""}>`
    : "";
  return `
    <label class="resource-option">
      <span class="resource-option-check">${checkbox}</span>
      <span class="resource-option-body">
        <strong>${displaySafeHtml(resource.name)}</strong>
        <span>${escapeHtml(languagePairDisplay(resource.sourceLang, resource.targetLang))} - ${countLabel}</span>
      </span>
      <span class="resource-option-main">${radio}</span>
    </label>
  `;
}

function renderProjectResourcePickers(project = currentProject()) {
  const { sourceLang, targetLang } = projectDialogValues();
  if (!sourceLang || !targetLang) return;
  const editing = projectDialogController?.getMode?.() === "edit";
  const selectedTmNames = editing ? projectTmNames(project) : [];
  const selectedTbNames = editing ? projectTermBaseNames(project) : [];
  const main = editing ? mainTmName(project) : "";
  const tmResources = matchingResourceSummaries("tm", sourceLang, targetLang, selectedTmNames);
  const tbResources = matchingResourceSummaries("tb", sourceLang, targetLang, selectedTbNames);
  replaceSafeHtml(els.projectTmResourceList, tmResources.length
    ? tmResources.map((resource) => resourceOptionHtml(resource, "tm", selectedTmNames.includes(resource.name), resource.name === main)).join("")
    : `<div class="muted">${uiLabelHtml("noMatchingTms")}</div>`);
  replaceSafeHtml(els.projectTbResourceList, tbResources.length
    ? tbResources.map((resource) => resourceOptionHtml(resource, "tb", selectedTbNames.includes(resource.name), false)).join("")
    : `<div class="muted">${uiLabelHtml("noMatchingTbs")}</div>`);
}

function openProjectDialog(mode = "create") {
  return projectDialogController?.open?.(mode, { returnTarget: document.activeElement }) || Promise.resolve(false);
}

function collectCheckedResourceNames(type) {
  return Array.from(els.projectDialog.querySelectorAll(`[data-resource-type="${type}"]:checked`)).map((input) => input.dataset.resourceName);
}

function collectProjectResourceSettings(existingProject = null) {
  const sourceLang = normalizeLanguageInputElement(els.sourceLangInput);
  const targetLang = normalizeLanguageInputElement(els.targetLangInput);
  const existingLinks = projectResourceLinks(existingProject);
  let tmNames = uniqueNames(collectCheckedResourceNames("tm"));
  let tbNames = uniqueNames(collectCheckedResourceNames("tb"));
  const newTmName = els.newTmNameInput.value.trim();
  const newTbName = els.newTermBaseNameInput.value.trim();
  let main = els.projectDialog.querySelector('[data-main-tm]:checked')?.dataset.mainTm || "";
  if (newTmName) {
    tmNames = uniqueNames([newTmName, ...tmNames]);
    main = newTmName;
  }
  if (!tmNames.length) {
    main = cleanProjectText(existingProject?.mainTmName, cleanProjectText(existingProject?.tmName, "Default TM"));
    tmNames = [main];
  }
  if (!main || !tmNames.includes(main)) main = tmNames[0];
  if (newTbName) tbNames = uniqueNames([...tbNames, newTbName]);
  if (!tbNames.length) tbNames = [cleanProjectText(existingProject?.termBaseName, "Default TB")];
  return {
    sourceLang,
    targetLang,
    tmNames,
    termBaseNames: tbNames,
    mainTmName: main,
    tmName: main,
    termBaseName: tbNames[0],
    resourceLinks: [
      ...tmNames.map((name) => ({
        id: existingLinks.find((link) => link.type === "tm" && link.name === name)?.id || makeId("resource-link"),
        type: "tm",
        name,
        role: name === main ? "main" : "reference"
      })),
      ...tbNames.map((name) => ({
        id: existingLinks.find((link) => link.type === "termbase" && link.name === name)?.id || makeId("resource-link"),
        type: "termbase",
        name
      }))
    ]
  };
}

async function refreshResources() {
  const [tmEntries, terms] = await Promise.all([listTmEntries(), getAll("terms")]);
  return resourcesController?.setResources?.({ tmEntries, terms }) || { tmEntries, terms };
}

async function refreshProjectTerms({ rerender = false } = {}) {
  if (!currentProject()) {
    editorSessionStore.replaceProjectTerms([]);
    return;
  }
  editorSessionStore.replaceProjectTerms(await listTerms({
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    termBaseNames: projectTermBaseNames()
  }));
  invalidateSegmentFilterCache();
  renderTermbaseSelect();
  if (rerender) renderSegments({ preserveScroll: true });
}

async function projectTermsForValidation() {
  if (!currentProject()) return [];
  return listTerms({
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    termBaseNames: projectTermBaseNames()
  });
}

async function logProjectActivity(type, summary, detail = {}, project = currentProject()) {
  if (!project) return null;
  const event = await recordActivityEvent({ projectId: project.id, type, summary, detail });
  if (event && currentProject()?.id === project.id) {
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
    if (LOOPCAT_TEST_BUILD && ["export", "resource-export"].includes(type) && currentProject()?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG]) {
      throw new Error("Simulated export activity log failure");
    }
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || currentProject()?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    await logProjectActivity(type, summary, detail);
    return true;
  } catch (activityError) {
    console.warn(`${label} activity log failed.`, activityError);
    if (currentProject()?.id) markWorkspaceDirty(currentProject().id);
    return false;
  }
}

async function logOptionalActivityForProject(projectId, type, summary, detail = {}, label = summary || type) {
  try {
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || currentProject()?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    const event = await recordActivityEvent({ projectId, type, summary, detail });
    if (currentProject()?.id === projectId) {
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
      ? report[key].map((message) => redactSensitiveText(message || "").trim()).filter(Boolean)
      : [];
  });
  clean.ok = clean.errors.length === 0;
  return clean;
}

function validationAlertText(report, fallback = "Validation failed.") {
  const clean = sanitizeValidationReportForDisplay(report);
  const errors = Array.isArray(clean?.errors) ? clean.errors : [];
  return errors.length ? errors.join("\n") : redactSensitiveText(fallback);
}

function renderValidationReport(report) {
  const displayReport = sanitizeValidationReportForDisplay(report);
  state.lastValidationReport = displayReport;
  importExportController?.renderValidation?.({
    report: displayReport,
    summary: displayReport ? reportSummary(displayReport) : "",
    groups: [
      { key: "errors", label: uiLabel("errors") },
      { key: "risky", label: uiLabel("risk") },
      { key: "warnings", label: uiSource("Warnings") },
      { key: "simplified", label: uiLabel("simplified") },
      { key: "skipped", label: uiLabel("skipped") },
      { key: "preserved", label: uiLabel("preserved") }
    ],
    dismissLabel: uiSource("Dismiss validation report"),
    dismissText: uiSource("Dismiss"),
    emptyLabel: uiSource("No validation issues."),
    autoDismissMs: displayReport?.ok ? (reportCount(displayReport) ? 12000 : 7000) : 0
  });
}

async function renderProjectAnalysis() {
  const run = (state.projectAnalysisRun += 1);
  const project = currentProject();
  if (!project || currentApplicationView() !== "project" || !els.projectAnalysis) return;
  const segments = currentSegments();
  const tmEntries = await getAllByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`);
  if (run !== state.projectAnalysisRun || currentApplicationView() !== "project" || currentProject()?.id !== project.id) return;
  const tmNames = new Set(projectTmNames(project));
  const analysis = analyzeProject(project, segments, tmEntries.filter((entry) => tmNames.has(entry.tmName)));
  const ai = analysis.ai || {};
  els.analysisMeta.textContent = uiLabel("generatedAt", { date: formatDate(analysis.generatedAt) });
  replaceSafeHtml(els.projectAnalysis, `
    <div><strong>${analysis.totals.confirmedPercent}%</strong><span>${uiLabelHtml("confirmed")}</span></div>
    <div><strong>${analysis.totals.untranslated}</strong><span>${translatedSourceHtml("empty targets")}</span></div>
    <div><strong>${analysis.totals.repetitions}</strong><span>${uiLabelHtml("repetitions")}</span></div>
    <div><strong>${analysis.leverage.exact}</strong><span>${uiLabelHtml("exactTm")}</span></div>
    <div><strong>${analysis.leverage.fuzzy95 + analysis.leverage.fuzzy85}</strong><span>${uiLabelHtml("strongFuzzy")}</span></div>
    <div><strong>${analysis.totals.segments - analysis.totals.confirmed}</strong><span>${uiLabelHtml("openSegments")}</span></div>
    <div><strong>${analysis.totals.files}</strong><span>${uiLabelHtml("files")}</span></div>
    <div><strong>${analysis.totals.words}</strong><span>${uiLabelHtml("sourceWords")}</span></div>
    <div><strong>${ai.drafts || 0}</strong><span>${translatedSourceHtml("AI initiated")}</span></div>
    <div><strong>${ai.suggestionSegments || 0}</strong><span>${uiLabelHtml("aiSuggestionRows")}</span></div>
    <div><strong>${ai.highRisk || 0}</strong><span>${uiLabelHtml("highAiRisk")}</span></div>
  `);
}

function renderProjectList() {
  if (!currentProjects().length) {
    replaceSafeHtml(els.projectList, `<div class="muted">${translatedSourceHtml("No projects yet.")}</div>`);
    return;
  }
  const fragment = document.createDocumentFragment();
  currentProjects().forEach((project) => {
    const button = document.createElement("button");
    button.className = `project-item ${currentProject()?.id === project.id ? "active" : ""}`;
    replaceSafeHtml(button, `<strong>${displaySafeHtml(project.name)}</strong><span>${escapeHtml(languagePair(project))}</span><span>${project.sourceFileName ? displaySafeHtml(project.sourceFileName) : uiLabelHtml("noSourceFile")}</span>`);
    button.addEventListener("click", () => openProject(project.id));
    fragment.append(button);
  });
  els.projectList.replaceChildren(fragment);
}

async function openProject(projectId) {
  await flushPendingSegmentSaves();
  editorSessionStore.replaceProject(currentProjects().find((project) => project.id === projectId) || null);
  state.commandProjectId = currentProject()?.id || projectId || "";
  editorSessionStore.replaceSegments(prepareSegmentHistoryStates(currentProject() ? await getProjectSegments(projectId) : []));
  editorSessionStore.replaceActivityEvents(currentProject() ? await listActivityEvents(projectId) : []);
  await refreshProjectTerms();
  const activeIndex = currentSegments().length ? 0 : -1;
  await filterPresetReady;
  await filterPresetController?.restoreForProject?.(currentProject()?.id || projectId);
  applicationNavigation?.openProject?.(currentProject()?.id || projectId, activeIndex);
  renderAll();
  if (currentApplicationView() === "editor") await refreshSidebar();
}

async function openProjectFile(documentId) {
  if (!currentProject()) return;
  const first = currentSegments().findIndex((segment) => segment.documentId === documentId);
  applicationNavigation?.openEditor?.({
    projectId: currentProject().id,
    documentId,
    segmentId: currentSegments()[first]?.id || "",
    activeIndex: first
  });
  renderAll();
  await refreshSidebar();
}

function renderAll() {
  invalidateSegmentFilterCache();
  renderProjectList();
  renderEditor();
  renderProjectHome();
  renderProjectAnalysis();
  renderDocumentFilter();
  renderSegments();
  renderProgress();
}

function renderEditor() {
  syncLegacyApplicationState();
  const hasProject = Boolean(currentProject());
  void syncDesktopSpellcheckLanguage();
  renderWorkspaceStatus();
  renderBackupReminder();
  if (verticalFeatureState?.editor) {
    verticalFeatureState.editor.renderShell({ view: currentApplicationView(), hasProject, inspectorOpen: state.inspectorOpen });
    verticalFeatureState.inspector.setVisible(currentApplicationView() === "editor" && state.inspectorOpen);
    verticalFeatureState.dashboard.setVisible(currentApplicationView() === "project" && hasProject);
  } else {
    els.workspace.classList.toggle("projects-mode", currentApplicationView() !== "editor");
    els.sidebar.classList.toggle("hidden", currentApplicationView() !== "editor");
    els.projectsView.classList.toggle("hidden", currentApplicationView() !== "projects");
    els.resourcesView.classList.toggle("hidden", currentApplicationView() !== "resources");
    els.projectHomeView.classList.toggle("hidden", currentApplicationView() !== "project" || !hasProject);
    els.emptyState.classList.toggle("hidden", currentApplicationView() !== "editor" || hasProject);
    els.editorView.classList.toggle("hidden", currentApplicationView() !== "editor" || !hasProject);
  }
  renderFocusMode();
  if (els.inspectorToggleBtn) {
    els.inspectorToggleBtn.setAttribute("aria-expanded", String(state.inspectorOpen));
    els.inspectorToggleBtn.textContent = state.inspectorOpen ? uiSource("Hide inspector") : uiSource("Show inspector");
  }
  if (!currentProject()) return;

  const resources = projectResourceSummary();
  els.projectTitle.textContent = displaySafeText(currentProject().name);
  els.projectMeta.textContent = `${languagePair()} - ${uiLabel("mainTm")}: ${displaySafeText(resources.mainTm, uiLabel("none"))} - ${displaySafeText(resources.tmLabel)} - ${displaySafeText(resources.tbLabel)}`;
  els.projectDomainEditInput.value = currentProject().domain || "";
  els.domainForm.classList.add("clean");
  els.domainForm.classList.toggle("hidden", Boolean((currentProject().domain || "").trim()));
  replaceSafeHtml(els.projectInfo, `
    <dt>${uiLabelHtml("name")}</dt><dd>${displaySafeHtml(currentProject().name)}</dd>
    <dt>${translatedSourceHtml("Creator")}</dt><dd>${displaySafeHtml(currentProject().creatorName || uiLabel("notSet"))}</dd>
    <dt>${translatedSourceHtml("Domain")}</dt><dd>${displaySafeHtml(currentProject().domain || uiLabel("notSet"))}</dd>
    <dt>${uiLabelHtml("languages")}</dt><dd>${escapeHtml(languagePair())}</dd>
    <dt>${translatedSourceHtml("Workspace")}</dt><dd>${escapeHtml(currentProject().workspaceId || "local-workspace")}</dd>
    <dt>${uiLabelHtml("sourceFile")}</dt><dd>${displaySafeHtml(currentProject().sourceFileName || uiLabel("notImported"))}</dd>
    <dt>${uiLabelHtml("mainTm")}</dt><dd>${displaySafeHtml(resources.mainTm)}</dd>
    <dt>${uiLabelHtml("linkedTms")}</dt><dd>${displaySafeHtml(resources.tmNames.join(", "))}</dd>
    <dt>${uiLabelHtml("linkedTbs")}</dt><dd>${displaySafeHtml(resources.tbNames.join(", "))}</dd>
    <dt>${translatedSourceHtml("Documents")}</dt><dd>${projectDocuments().length || 0}</dd>
    <dt>${uiLabelHtml("segmentsTitle")}</dt><dd>${currentSegments().length}</dd>
    <dt>${uiLabelHtml("activity")}</dt><dd>${uiLabelHtml("eventCount", { count: currentActivityEvents().length })}</dd>
  `);
  const ai = aiRuntimeSettingsService.normalizeProjectSettings(currentProject().aiSettings);
  aiAdministrationController?.renderGlobalSettings?.({
    settings: ai,
    storedKey: aiCredentialStorageService.storedOpenAiKey(),
    rememberKey: Boolean(aiCredentialStorageService.openAiSnapshot().local),
    storageText: `OpenAI key: ${aiCredentialStorageService.openAiStorageLabel()}. API keys stay in this browser and are never exported with project packages.`
  });
  aiProviderFormController.renderCommandCentre();
  renderQualityWorkbench();
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
    option.textContent = displaySafeText(name);
    fragment.append(option);
  });
  els.termBaseSelect.replaceChildren(fragment);
  els.termBaseSelect.value = names.includes(current) ? current : primaryTermBaseName();
}

function renderProjectHome() {
  if (!currentProject()) return;
  const documents = projectDocuments();
  const documentStatsById = projectDocumentStats(documents);
  const total = aggregateDocumentStats(documentStatsById);
  const sourceWords = total.words;
  const resources = projectResourceSummary();
  els.projectHomeTitle.textContent = displaySafeText(currentProject().name);
  els.projectHomeMeta.textContent = `${languagePair()} - ${displaySafeText(currentProject().domain || uiLabel("noDomain"))} - ${uiLabel("mainTm")}: ${displaySafeText(resources.mainTm, uiLabel("none"))} - ${displaySafeText(resources.tmLabel)} - ${displaySafeText(resources.tbLabel)}`;
  replaceSafeHtml(els.projectHomeStats, `
    <div><strong>${total.percent}%</strong><span>${uiLabelHtml("confirmed")}</span></div>
    <div><strong>${documents.length}</strong><span>${uiLabelHtml("files")}</span></div>
    <div><strong>${currentSegments().length}</strong><span>${uiLabelHtml("segments")}</span></div>
    <div><strong>${sourceWords}</strong><span>${uiLabelHtml("sourceWords")}</span></div>
  `);
  els.fileCountText.textContent = documents.length ? uiLabel("fileCount", { count: documents.length }) : uiSource("No files imported");
  if (!documents.length) {
    replaceSafeHtml(els.projectFileList, `<div class="empty-file-state">${translatedSourceHtml("Import a DOCX or other format file to start translating this project.")}</div>`);
    return;
  }
  const fragment = document.createDocumentFragment();
  documents.forEach((documentInfo) => {
    const stats = documentStatsById.get(documentInfo.id) || emptyDocumentStats();
    const card = document.createElement("article");
    card.className = "file-card";
    replaceSafeHtml(card, `
      <header>
        <div>
          <h4>${displaySafeHtml(documentInfo.name)}</h4>
          <p>${escapeHtml((documentInfo.type || "file").toUpperCase())}</p>
        </div>
        <span class="language-badge">${stats.percent}%</span>
      </header>
      <div class="project-stats">
        <div><strong>${stats.words}</strong><span>${uiLabelHtml("words")}</span></div>
        <div><strong>${stats.segments}</strong><span>${uiLabelHtml("segments")}</span></div>
      </div>
      <div class="progress-bar"><div style="width:${stats.percent}%"></div></div>
      <footer>
        <span>${uiLabelHtml("emptyDraftCount", { empty: stats.empty, draft: stats.draft })}</span>
        <div class="file-card-actions"></div>
      </footer>
    `);
    card.querySelector(".progress-bar > div").style.width = `${stats.percent}%`;
    const deleteButton = document.createElement("button");
    const fileLabel = displaySafeText(documentInfo.name, uiSource("file"));
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = uiSource("Delete");
    deleteButton.setAttribute("aria-label", uiSource("Delete file {value1}", { value1: fileLabel }));
    deleteButton.addEventListener("click", () => confirmDeleteFile(documentInfo));
    const openButton = document.createElement("button");
    openButton.className = "primary";
    openButton.type = "button";
    openButton.textContent = uiSource("Open");
    openButton.setAttribute("aria-label", uiSource("Open file {value1}", { value1: fileLabel }));
    openButton.addEventListener("click", () => openProjectFile(documentInfo.id));
    card.querySelector(".file-card-actions").append(deleteButton, openButton);
    fragment.append(card);
  });
  els.projectFileList.replaceChildren(fragment);
}

function renderDocumentFilter() {
  const current = currentDocumentId();
  const documents = projectDocuments();
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = uiSource("All documents");
  fragment.append(allOption);
  documents.forEach((documentInfo) => {
    const option = document.createElement("option");
    option.value = documentInfo.id;
    option.textContent = displaySafeText(documentInfo.name);
    fragment.append(option);
  });
  els.documentFilter.replaceChildren(fragment);
  els.documentFilter.value = documents.some((documentInfo) => documentInfo.id === current) ? current : "";
  if (els.documentFilter.value !== current) selectApplicationDocument(els.documentFilter.value);
}

function renderLanguagePairFilter() {
  const current = els.languagePairFilter.value;
  const pairs = Array.from(new Set(currentProjects().map((project) => languagePairKey(project)).filter((pair) => pair !== "::"))).sort();
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = uiSource("All language pairs");
  fragment.append(allOption);
  pairs.forEach((pair) => {
    const [sourceLang, targetLang] = pair.split("::");
    const option = document.createElement("option");
    option.value = pair;
    option.textContent = languagePairDisplay(sourceLang, targetLang);
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
        <h3>${displaySafeHtml(project.name)}</h3>
        <p>${displaySafeHtml(project.domain ? `${project.domain} - ${project.sourceFileName || uiLabel("noSourceFileImported")}` : project.sourceFileName || uiLabel("noSourceFileImported"))}</p>
      </div>
      <span class="language-badge">${escapeHtml(languagePair(project))}</span>
    </header>
    <div class="project-stats">
      <div><strong>${project.progress.percent}%</strong><span>${uiLabelHtml("confirmed")}</span></div>
      <div><strong>${project.progress.total}</strong><span>${uiLabelHtml("segments")}</span></div>
      <div><strong>${project.wordCount}</strong><span>${uiLabelHtml("words")}</span></div>
    </div>
    <div class="progress-bar"><div style="width:${project.progress.percent}%"></div></div>
    <footer>
      <span>${uiLabelHtml("updatedAt", { date: formatDate(project.updatedAt) })}</span>
    </footer>
  `);
  tile.querySelector(".progress-bar > div").style.width = `${project.progress.percent}%`;
  const deleteButton = document.createElement("button");
  const projectLabel = displaySafeText(project.name, uiSource("project"));
  deleteButton.className = "danger-small";
  deleteButton.type = "button";
  deleteButton.textContent = uiSource("Delete");
  deleteButton.setAttribute("aria-label", uiSource("Delete project {value1}", { value1: projectLabel }));
  deleteButton.addEventListener("click", () => confirmDeleteProject(project.id));
  const openButton = document.createElement("button");
  openButton.className = "primary";
  openButton.type = "button";
  openButton.textContent = uiSource("Open");
  openButton.setAttribute("aria-label", uiSource("Open project {value1}", { value1: projectLabel }));
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
    heading.textContent = uiSource("No matching projects");
    message.textContent = uiSource("Clear the search and language filters to see every local project.");
    action.textContent = uiSource("Clear filters");
    action.addEventListener("click", () => {
      els.projectSearchInput.value = "";
      els.languagePairFilter.value = "";
      renderProjectsView();
      els.projectSearchInput.focus();
    });
  } else {
    heading.textContent = uiSource("Start your first translation");
    message.textContent = uiSource("Choose New project above, or bring in an existing LoopCAT project package.");
    action.textContent = uiSource("Import project package");
    action.addEventListener("click", () => els.projectPackageImportInput.click());
  }
  empty.append(heading, message, action);
  return empty;
}

function renderProjectsView() {
  const query = stableLower(els.projectSearchInput.value.trim());
  const pair = els.languagePairFilter.value;
  const summaries = currentProjectSummaries().map((project) => ({
    ...project,
    searchText: project.searchText || stableLower(`${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${projectResourceSearchText(project)}`),
    languagePairKey: project.languagePairKey || languagePairKey(project)
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

async function confirmDeleteProject(projectId = currentProject()?.id) {
  const project = currentProjects().find((item) => item.id === projectId);
  if (!project) return false;
  const ok = uiConfirm(`Move project "${displaySafeText(project.name)}" and all of its files to Trash?`);
  if (!ok) return false;
  try {
    await flushPendingSegmentSaves(project.id);
    if (LOOPCAT_TEST_BUILD && project[PROJECT_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated project delete failure");
    const command = appRuntime?.commands?.createDeleteProjectCommand?.({ projectId: project.id });
    if (!command) throw new Error("The reversible project deletion service is unavailable.");
    await appRuntime.commands.bus.execute(command);
    state.commandProjectId = project.id;
    clearWorkspaceDirty(project.id);
    if (currentProject()?.id === project.id) {
      editorSessionStore.replaceProject(null);
      editorSessionStore.replaceSegments([]);
      applicationNavigation.openProjects();
      applicationNavigation.clearSelection();
    }
    await loadProjects(false);
    setSaveStatus("Project moved to Trash. Undo is available.", "saved");
    renderUndoControls();
    return true;
  } catch (error) {
    setSaveStatus(error.message || "Project delete failed", "dirty");
    return false;
  }
}

async function confirmDeleteFile(documentInfo) {
  if (!currentProject() || !documentInfo) return false;
  const ok = uiConfirm(`Move file "${displaySafeText(documentInfo.name)}" to Trash?`);
  if (!ok) return false;
  try {
    await flushPendingSegmentSaves(currentProject().id);
    if (LOOPCAT_TEST_BUILD && documentInfo[FILE_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated file delete failure");
    const command = appRuntime?.commands?.createDeleteDocumentCommand?.({
      project: currentProject(),
      documentId: documentInfo.id
    });
    if (!command) throw new Error("The reversible file deletion service is unavailable.");
    const commandResult = await appRuntime.commands.bus.execute(command);
    state.commandProjectId = currentProject().id;
    editorSessionStore.replaceProject(commandResult.result.project);
    editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
    editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(currentProject().id)));
    selectApplicationDocument("");
    selectApplicationSegment(currentSegments().length ? 0 : -1);
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
    showProjectHome();
    setSaveStatus(fileDeleteActivityFailed ? "File moved to Trash; activity log failed" : "File moved to Trash. Undo is available.", "saved");
    renderUndoControls();
    return true;
  } catch (error) {
    setSaveStatus(error.message || "File delete failed", "dirty");
    return false;
  }
}

function renderResourcesView() {
  resourcesController?.render?.();
}

function renderResourcesContent(resourceState) {
  renderResourceDashboard("tm", resourceState);
  renderResourceDashboard("tb", resourceState);
  renderResourceDetail(resourceState);
}

function renderResourceDashboard(type, resourceState) {
  const isTm = type === "tm";
  const dashboard = isTm ? els.tmResourceDashboard : els.tbResourceDashboard;
  const summaries = summarizeResources(isTm ? resourceState.tmEntries : resourceState.terms, isTm ? "tmName" : "termBaseName");
  if (!summaries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-file-state actionable-empty-state";
    const message = document.createElement("p");
    message.textContent = uiLabel(isTm ? "noTranslationMemories" : "noTermbases");
    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary";
    action.textContent = uiSource(isTm ? "Import a TMX file" : "Import a TBX or term-list file");
    action.dataset.resourceAction = "import";
    action.dataset.resourceType = type;
    empty.append(message, action);
    dashboard.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  summaries.forEach((resource) => {
    const card = document.createElement("article");
    card.className = "resource-card";
    replaceSafeHtml(card, `
      <header>
        <div>
          <h3>${displaySafeHtml(resource.name)}</h3>
          <p>${escapeHtml(languagePairDisplay(resource.sourceLang, resource.targetLang))}</p>
        </div>
        <span class="language-badge">${resource.count}</span>
      </header>
      <div class="project-stats">
        <div><strong>${resource.count}</strong><span>${uiLabelHtml(isTm ? "entries" : "terms")}</span></div>
        <div><strong>${escapeHtml(resource.sourceLang || "-")}</strong><span>${uiLabelHtml("source")}</span></div>
        <div><strong>${escapeHtml(resource.targetLang || "-")}</strong><span>${uiLabelHtml("target")}</span></div>
      </div>
      <footer>
        <span>${uiLabelHtml("updatedAt", { date: formatDate(resource.updatedAt) })}</span>
        <div class="resource-card-actions"></div>
      </footer>
    `);
    const deleteButton = document.createElement("button");
    const resourceLabel = displaySafeText(resource.name, uiSource("resource"));
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = uiSource("Delete");
    deleteButton.setAttribute("aria-label", uiSource("Delete resource {value1}", { value1: resourceLabel }));
    deleteButton.dataset.resourceAction = "delete-resource";
    deleteButton.dataset.resourceType = type;
    deleteButton.dataset.resourceKey = resource.key;
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = uiSource("Export");
    exportButton.setAttribute("aria-label", uiSource("Export resource {value1}", { value1: resourceLabel }));
    exportButton.dataset.resourceAction = "export";
    exportButton.dataset.resourceType = type;
    exportButton.dataset.resourceKey = resource.key;
    const openButton = document.createElement("button");
    openButton.className = "primary";
    openButton.type = "button";
    openButton.textContent = uiSource("Open");
    openButton.setAttribute("aria-label", uiSource("Open resource {value1}", { value1: resourceLabel }));
    openButton.dataset.resourceAction = "open";
    openButton.dataset.resourceType = type;
    openButton.dataset.resourceKey = resource.key;
    card.querySelector(".resource-card-actions").append(deleteButton, exportButton, openButton);
    fragment.append(card);
  });
  dashboard.replaceChildren(fragment);
}

function canAddResourceToCurrentProject(type, resource) {
  if (!currentProject()) return false;
  if (resource.sourceLang !== currentProject().sourceLang || resource.targetLang !== currentProject().targetLang) return false;
  const names = type === "tm" ? projectTmNames() : projectTermBaseNames();
  return !names.includes(resource.name);
}

async function addResourceToCurrentProject(type, resource) {
  if (!currentProject() || !canAddResourceToCurrentProject(type, resource)) return;
  const links = projectResourceLinks(currentProject());
  links.push({
    id: makeId("resource-link"),
    type: type === "tm" ? "tm" : "termbase",
    name: resource.name,
    role: type === "tm" ? "reference" : undefined
  });
  editorSessionStore.replaceProject(await updateProject({ ...currentProject(), resourceLinks: links }));
  editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
  await refreshProjectTerms({ rerender: true });
  await refreshProjectSummaries();
  renderAll();
  await refreshSidebar();
  renderResourcesView();
  markWorkspaceDirty();
  setSaveStatus(`${type === "tm" ? "TM" : "TB"} added to project`, "saved");
}

function resourceItems(type, key) {
  return resourcesController?.getItems?.(type, key) || [];
}

function renderResourceDetail(resourceState) {
  renderTmResourceDetail(resourceState);
  renderTbResourceDetail(resourceState);
}

function replaceResourceTableRows(table, items, renderRow) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.append(renderRow(item)));
  table.replaceChildren(fragment);
}

async function saveEditedTmResourceEntry(entry, values) {
  try {
    if (LOOPCAT_TEST_BUILD && entry[RESOURCE_TM_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated TM resource save failure");
    await updateTmEntry({
      ...entry,
      source: values.source,
      target: values.target
    });
    markProjectsUsingResourceDirty("tm", entry.tmName, entry.sourceLang, entry.targetLang);
    await refreshResources();
    setSaveStatus("TM entry saved", "saved");
    return true;
  } catch (error) {
    setSaveStatus(error.message || "TM entry save failed", "dirty");
    return false;
  }
}

async function saveEditedTermResourceEntry(term, values) {
  try {
    if (LOOPCAT_TEST_BUILD && term[RESOURCE_TERM_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated term resource save failure");
    await updateTerm({
      ...term,
      sourceTerm: values.sourceTerm,
      targetTerm: values.targetTerm,
      notes: values.notes,
      isForbidden: values.isForbidden
    });
    markProjectsUsingResourceDirty("termbase", term.termBaseName, term.sourceLang, term.targetLang);
    await refreshResources();
    await refreshProjectTerms({ rerender: true });
    setSaveStatus("Term saved", "saved");
    return true;
  } catch (error) {
    setSaveStatus(error.message || "Term save failed", "dirty");
    return false;
  }
}

async function executeResourceTrashCommand(command, { refreshSuggestions = false } = {}) {
  if (!command) throw new Error("The reversible resource deletion service is unavailable.");
  const commandResult = await appRuntime.commands.bus.execute(command);
  state.commandProjectId = command.projectId || "";
  const entry = resourceTrashEntryFromCommandResult(commandResult);
  let refreshFailed = false;
  try {
    await synchronizeResourceTrashChange(entry, { refreshSuggestions });
  } catch (error) {
    refreshFailed = true;
    console.warn("Resource views could not refresh after moving an item to Trash.", error);
  }
  renderUndoControls();
  return { entry, refreshFailed };
}

async function deleteTmResourceEntry(entry) {
  try {
    if (LOOPCAT_TEST_BUILD && entry[RESOURCE_TM_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated TM resource delete failure");
    const command = appRuntime?.commands?.createDeleteResourceEntryCommand?.({
      resourceType: "tm",
      entityId: entry.id,
      projectId: currentProject()?.id || null
    });
    const result = await executeResourceTrashCommand(command);
    setSaveStatus(
      result.refreshFailed
        ? "TM entry moved to Trash; the resource view could not refresh. Undo is available."
        : "TM entry moved to Trash. Undo is available.",
      "saved"
    );
    return true;
  } catch (error) {
    setSaveStatus(error.message || "TM entry could not be moved to Trash. Existing work was preserved.", "dirty");
    return false;
  }
}

async function deleteTermResourceEntry(term, options = {}) {
  const { refreshSuggestions = false } = options;
  try {
    if (LOOPCAT_TEST_BUILD && term[RESOURCE_TERM_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated term resource delete failure");
    const command = appRuntime?.commands?.createDeleteResourceEntryCommand?.({
      resourceType: "tb",
      entityId: term.id,
      projectId: currentProject()?.id || null
    });
    const result = await executeResourceTrashCommand(command, { refreshSuggestions });
    setSaveStatus(
      result.refreshFailed
        ? "Term moved to Trash; terminology views could not refresh. Undo is available."
        : "Term moved to Trash. Undo is available.",
      "saved"
    );
    return true;
  } catch (error) {
    setSaveStatus(error.message || "Term could not be moved to Trash. Existing work was preserved.", "dirty");
    return false;
  }
}

function renderTmResourceDetail(resourceState) {
  if (resourceState.type !== "tm" || !resourceState.openKey) {
    els.tmResourceDetail.classList.add("hidden");
    return;
  }
  const info = resourceLabelFromKey(resourceState.openKey);
  const entries = resourceItems("tm", resourceState.openKey);
  els.tmResourceDetail.classList.remove("hidden");
  replaceSafeHtml(els.tmResourceDetail, `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${uiLabelHtml("entryCount", { count: entries.length })}</p>
      </div>
      <button id="closeTmResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tm">${translatedSourceHtml("Close")}</button>
    </div>
    <div class="resource-table"></div>
  `);
  const table = els.tmResourceDetail.querySelector(".resource-table");
  replaceResourceTableRows(table, entries, renderTmEntryRow);
}

function renderTbResourceDetail(resourceState) {
  if (resourceState.type !== "tb" || !resourceState.openKey) {
    els.tbResourceDetail.classList.add("hidden");
    return;
  }
  const info = resourceLabelFromKey(resourceState.openKey);
  const terms = resourceItems("tb", resourceState.openKey);
  els.tbResourceDetail.classList.remove("hidden");
  replaceSafeHtml(els.tbResourceDetail, `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${uiLabelHtml("termCount", { count: terms.length })}</p>
      </div>
      <button id="closeTbResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tb">${translatedSourceHtml("Close")}</button>
    </div>
    <div class="resource-table"></div>
  `);
  const table = els.tbResourceDetail.querySelector(".resource-table");
  replaceResourceTableRows(table, terms, renderTermRow);
}

function renderTmEntryRow(entry) {
  const row = document.createElement("article");
  row.className = "resource-row";
  row.dataset.resourceRow = "tm";
  row.dataset.resourceId = entry.id;
  replaceSafeHtml(row, `
    <textarea data-field="source" aria-label="${translatedSourceHtml("Source")}">${escapeHtml(entry.source)}</textarea>
    <textarea data-field="target" aria-label="${translatedSourceHtml("Target")}">${escapeHtml(entry.target)}</textarea>
    <div class="resource-row-actions"></div>
  `);
  const actions = row.querySelector(".resource-row-actions");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = uiSource("Save");
  saveButton.dataset.resourceAction = "save-entry";
  saveButton.dataset.resourceType = "tm";
  saveButton.dataset.resourceId = entry.id;
  const deleteButton = document.createElement("button");
  deleteButton.className = "danger-small";
  deleteButton.type = "button";
  deleteButton.textContent = uiSource("Delete");
  deleteButton.dataset.resourceAction = "delete-entry";
  deleteButton.dataset.resourceType = "tm";
  deleteButton.dataset.resourceId = entry.id;
  actions.append(saveButton, deleteButton);
  return row;
}

function renderTermRow(term) {
  const row = document.createElement("article");
  row.className = "resource-row term-resource-row";
  row.dataset.resourceRow = "tb";
  row.dataset.resourceId = term.id;
  replaceSafeHtml(row, `
    <input data-field="sourceTerm" aria-label="${translatedSourceHtml("Source term")}" value="${escapeHtml(term.sourceTerm)}">
    <input data-field="targetTerm" aria-label="${translatedSourceHtml("Target term")}" value="${escapeHtml(term.targetTerm)}">
    <input data-field="notes" aria-label="${translatedSourceHtml("Notes")}" value="${escapeHtml(term.notes || "")}">
    <label class="checkbox-row resource-checkbox"><input data-field="isForbidden" type="checkbox" ${term.isForbidden ? "checked" : ""}>${uiLabelHtml("forbidden")}</label>
    <div class="resource-row-actions"></div>
  `);
  const actions = row.querySelector(".resource-row-actions");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = uiSource("Save");
  saveButton.dataset.resourceAction = "save-entry";
  saveButton.dataset.resourceType = "tb";
  saveButton.dataset.resourceId = term.id;
  const deleteButton = document.createElement("button");
  deleteButton.className = "danger-small";
  deleteButton.type = "button";
  deleteButton.textContent = uiSource("Delete");
  deleteButton.dataset.resourceAction = "delete-entry";
  deleteButton.dataset.resourceType = "tb";
  deleteButton.dataset.resourceId = term.id;
  actions.append(saveButton, deleteButton);
  return row;
}

async function confirmDeleteResource(type, key) {
  const info = resourceLabelFromKey(key);
  try {
    if (LOOPCAT_TEST_BUILD && RESOURCE_BULK_DELETE_FAILURE_TEST_KEYS.has(`${type}:${key}`)) throw new Error(`Simulated ${type === "tm" ? "TM" : "termbase"} resource delete failure`);
    const items = resourceItems(type, key);
    const command = appRuntime?.commands?.createDeleteResourceCommand?.({
      resourceType: type,
      descriptor: {
        key,
        name: info.name,
        sourceLang: info.sourceLang,
        targetLang: info.targetLang,
        languagePair: info.languagePair
      },
      affectedIds: items.map((item) => item.id),
      projectId: currentProject()?.id || null
    });
    const result = await executeResourceTrashCommand(command, { refreshSuggestions: type === "tb" });
    setSaveStatus(
      result.refreshFailed
        ? `${type === "tm" ? "Translation memory" : "Termbase"} moved to Trash; resource views could not refresh. Undo is available.`
        : `${type === "tm" ? "Translation memory" : "Termbase"} moved to Trash. Undo is available.`,
      "saved"
    );
    return true;
  } catch (error) {
    setSaveStatus(
      error.message || `${type === "tm" ? "Translation memory" : "Termbase"} could not be moved to Trash. Existing work was preserved.`,
      "dirty"
    );
    return false;
  }
}

function exportResource(type, key) {
  try {
    const info = resourceLabelFromKey(key);
    const items = resourceItems(type, key);
    if (type === "tm") {
      download(`${fileSafeName(info.name)}_${info.sourceLang}-${info.targetLang}.tmx`, buildTmx(items, info), "application/xml");
      setSaveStatus(`Exported ${items.length} TM entr${items.length === 1 ? "y" : "ies"}`, "saved");
      return;
    }
    download(`${fileSafeName(info.name)}_${info.sourceLang}-${info.targetLang}.tbx`, buildTbx(items, info), "application/xml");
    setSaveStatus(`Exported ${items.length} term${items.length === 1 ? "" : "s"}`, "saved");
  } catch (error) {
    setSaveStatus(error.message || "Resource export failed", "dirty");
  }
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
    chip.textContent = tagDisplayText(tag);
    chip.title = options.interactive ? `Insert protected text: ${tag.text}` : `Protected text: ${tag.text}`;
    if (options.interactive) {
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        const rowIndex = Number(container.closest("tr")?.dataset.index);
        const ready = Number.isInteger(rowIndex) ? setActiveSegment(rowIndex) : Promise.resolve();
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
  const tagMarkers = sourceTagMarkers(text, segmentTags(segment));
  const termMarkers = termRanges(text, currentProjectTerms())
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
      chip.textContent = tagDisplayText(marker.tag);
      chip.title = `Insert protected text: ${marker.tag.text}`;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        const rowIndex = Number(container.closest("tr")?.dataset.index);
        const ready = Number.isInteger(rowIndex) ? setActiveSegment(rowIndex) : Promise.resolve();
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
  const tags = segmentTags(segment);
  if (!tags.length) return;
  const tray = document.createElement("div");
  tray.className = "tag-tray";
  tags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `tag-chip tag-chip-${tag.type || "placeholder"} tag-chip-action`;
    chip.textContent = tagDisplayText(tag);
    chip.title = `Insert protected text: ${tag.text}`;
    chip.addEventListener("click", () => targetProducerController.insertProtectedTag(tag.text));
    tray.append(chip);
  });
  const targetCell = row.querySelector(".target-cell");
  targetCell.append(tray);
}

function targetTags(segment) {
  return detectProtectedTags(segment.target || "");
}

function renderTargetTagPreview(row, segment) {
  const preview = row.querySelector(".target-tag-preview");
  const targetCell = row.querySelector(".target-cell");
  if (!preview) return;
  const tags = targetTags(segment);
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
  const segment = currentSegments()[index];
  const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.index = String(index);
  row.classList.toggle("active", index === currentActiveIndex());
  row.classList.toggle("tag-warning-row", hasTagIssue(segment));
  row.querySelector(".num-col").textContent = String(index + 1);
  const sourceCell = row.querySelector(".source-cell");
  sourceCell.textContent = "";
  sourceCell.dir = "auto";
  appendTextWithSourceMarkup(sourceCell, segment);
  const textarea = row.querySelector("textarea");
  textarea.dir = "auto";
  textarea.setAttribute("aria-label", uiSource("Target translation for segment {value1}", { value1: index + 1 }));
  applyTargetSpellcheckLanguage(textarea);
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
  row.addEventListener("click", () => setActiveSegment(index));
  return row;
}

function renderStatusCell(row, segment) {
  const statusCell = row.querySelector(".status-col");
  const pill = row.querySelector(".status-pill");
  pill.className = `status-pill ${segment.status}`;
  pill.textContent = segmentStatusLabel(segment.status);
  statusCell.querySelectorAll(".tag-warning, .review-pill, .comment-marker, .tm-match-badge, .ai-segment-badge").forEach((item) => item.remove());
  if (segmentHasTmPretranslation(segment)) {
    const item = tmPretranslationBadge(segment);
    const badge = document.createElement("div");
    badge.className = `tm-match-badge ${item.className}`;
    badge.textContent = item.text;
    badge.title = item.title;
    statusCell.append(badge);
  }
  if (hasTagIssue(segment)) {
    const warning = document.createElement("div");
    warning.className = "tag-warning";
    warning.textContent = uiLabel("missingValue", { value: missingTags(segment).map(tagDisplayText).join(", ") });
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
    marker.textContent = uiLabel("noteCount", { count: commentCount });
    statusCell.append(marker);
  }
  const aiBadges = [];
  if (segmentHasAiDraft(segment)) {
    aiBadges.push(aiPretranslationBadge(segment));
  }
  if (segmentHasAiSuggestions(segment)) {
    aiBadges.push({
      className: "ai-suggestion",
      text: uiLabel("aiSuggestionCount", { count: segment.aiSuggestions.length }),
      title: uiSource("Reviewable AI suggestions are available for this segment")
    });
  }
  const riskLevel = aiReviewRiskLevel(segment);
  if (riskLevel) {
    aiBadges.push({
      className: `ai-risk ai-risk-${riskLevel}`,
      text: `${aiReviewRiskLabel(riskLevel)}`,
      title: uiSource("Risk-ranked AI review comment")
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
  const indexes = filteredSegmentIndexes();
  const scrollTop = els.segmentGridWrap?.scrollTop || 0;
  if (!indexes.length) {
    verticalFeatureState.segmentGrid.resetWindow();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "muted";
    cell.textContent = uiSource("No segments match this view.");
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
  if (options.fromScroll && els.segmentGridWrap.contains(activeElement) && !win.indexes.includes(currentActiveIndex())) {
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
  const segment = currentSegments()[index];
  if (!row || !segment) return;
  row.classList.toggle("active", index === currentActiveIndex());
  row.classList.toggle("tag-warning-row", hasTagIssue(segment));
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
    renderRevisionHistory();
  });
}

function calculateProgressSummary() {
  const total = currentSegments().length;
  let confirmed = 0;
  let words = 0;
  for (const segment of currentSegments()) {
    if (segment.status === "confirmed") confirmed += 1;
    words += sourceWordCount(segment);
  }
  return { projectId: currentProject()?.id || "", total, confirmed, words };
}

function renderProgress(options = {}) {
  const previousStatus = options.previousStatus;
  const nextStatus = options.nextStatus;
  const cached = currentProgressSummary();
  const canApplyStatusDelta =
    cached &&
    cached.projectId === (currentProject()?.id || "") &&
    cached.total === currentSegments().length &&
    previousStatus !== undefined &&
    nextStatus !== undefined;
  let summary;
  if (canApplyStatusDelta) {
    let confirmed = cached.confirmed;
    if (previousStatus === "confirmed" && nextStatus !== "confirmed") confirmed -= 1;
    if (previousStatus !== "confirmed" && nextStatus === "confirmed") confirmed += 1;
    summary = { ...cached, confirmed: Math.max(0, Math.min(cached.total, confirmed)) };
  } else {
    summary = calculateProgressSummary();
  }
  editorSessionStore.replaceProgressSummary(summary);
  const { total, confirmed, words } = summary;
  const open = total - confirmed;
  els.progressText.textContent = uiLabel("progressSummary", { confirmed, open, total });
  els.wordCountText.textContent = uiLabel("sourceWordCount", { count: words });
  els.progressFill.style.width = total ? `${Math.round((confirmed / total) * 100)}%` : "0";
}

function ensureSegmentVisible(index) {
  const position = filteredSegmentPosition(index);
  if (position === -1) return;
  verticalFeatureState.segmentGrid.ensureVisible(position, renderSegments);
}

async function setActiveSegment(index) {
  if (index < 0 || index >= currentSegments().length) return;
  if (index === currentActiveIndex()) return;
  const oldIndex = currentActiveIndex();
  verticalFeatureState?.segmentGrid?.selectSegment(index, currentSegments()[index]?.id || "");
  verticalFeatureState?.inspector?.setContext({ segmentId: currentSegments()[index]?.id || "" });
  renderConfirmBusyState();
  ensureSegmentVisible(index);
  updateRow(oldIndex);
  updateRow(index);
  aiPromptPreviewController.render();
  await refreshSidebar();
}

async function goToNextOpenSegment() {
  if (!currentSegments().length) return;
  const start = Math.max(currentActiveIndex() + 1, 0);
  const afterCurrent = currentSegments().findIndex((segment, index) => index >= start && isOpenSegment(segment));
  const beforeCurrent = currentSegments().findIndex((segment, index) => index < start && isOpenSegment(segment));
  const next = afterCurrent !== -1 ? afterCurrent : beforeCurrent;
  if (next === -1) return;
  await setActiveSegment(next);
  if (!segmentPassesFilters(currentSegments()[next])) {
    updateEditorFilters({ status: "all" });
    els.segmentStatusFilter.value = "all";
    renderSegments();
  }
  focusActiveTextarea();
}

function applyTargetDraft({ index, segment, target }) {
  const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
  const passedFiltersBefore = segmentPassesFilters(segment);
  setSegmentTargetAndStatus(segment, target, target.trim() ? "draft" : "empty", "edit");
  const passedFiltersAfter = segmentPassesFilters(segment);
  const filterMembershipChanged = passedFiltersBefore !== passedFiltersAfter;
  touchSegment(segment, { invalidateFilters: filterMembershipChanged });
  if (filterMembershipChanged) {
    renderSegments({ preserveScroll: true });
  } else if (passedFiltersAfter) {
    scheduleRowUpdate(index);
  } else {
    verticalFeatureState.segmentGrid.cancelRowUpdate(index);
  }
  renderProgress({ previousStatus, nextStatus: segment.status });
  scheduleRevisionHistoryRender();
  markWorkspaceDirty();
  return { segment, patch: targetCommandPatch(segment) };
}

function updateSegmentDraft(index, target) {
  return targetEditController.updateDraft(index, target);
}

function openReplacePanel() {
  els.replaceMenu.open = true;
  els.replaceFindInput.focus();
}

function prepareCommandRestoreSegmentSnapshot(snapshot, current) {
  const restored = prepareSegmentHistoryState(structuredClone(snapshot));
  const currentRevision = Number(current?.revision || 0);
  const snapshotRevision = Number(restored.revision || 0);
  restored.revision = Math.max(
    Number.isFinite(currentRevision) ? currentRevision : 0,
    Number.isFinite(snapshotRevision) ? snapshotRevision : 0
  ) + 1;
  restored.updatedAt = new Date().toISOString();
  return restored;
}

async function restoreSegmentEditCommandPatch(segmentId, nextPatch, options = {}) {
  const index = currentSegments().findIndex((item) => item.id === segmentId);
  if (index < 0) throw new Error("The affected segment is no longer available.");
  const segment = currentSegments()[index];
  const currentPatch = targetCommandPatch(segment);
  const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
  try {
    const restoredPatch = structuredClone(nextPatch);
    restoredPatch.revision = Math.max(Number(currentPatch.revision || 0), Number(restoredPatch.revision || 0)) + 1;
    restoredPatch.updatedAt = new Date().toISOString();
    applyTargetCommandPatch(segment, restoredPatch);
    clearPendingSave(segment);
    await saveSegment(segment);
    verticalFeatureState?.segmentGrid?.selectSegment(index, segment.id);
    verticalFeatureState?.inspector?.setContext({ segmentId: segment.id });
    invalidateSegmentFilterCache();
    renderSegments({ preserveScroll: true });
    renderProgress({ previousStatus, nextStatus: segment.status });
    renderRevisionHistory();
    await refreshSidebar();
    markWorkspaceDirty();
    const selection = options.selection
      ? targetEditController.normalizeSelection(options.selection, segment.target.length)
      : null;
    focusActiveTextarea(selection);
    return {
      recoveryToken: segmentId,
      activeSegmentId: segment.id,
      focusTarget: Boolean(options.focusTarget || selection),
      selection
    };
  } catch (error) {
    applyTargetCommandPatch(segment, currentPatch);
    invalidateSegmentFilterCache();
    renderSegments({ preserveScroll: true });
    renderProgress();
    renderRevisionHistory();
    throw error;
  }
}

async function restoreBatchTargetCommandPatches(nextPatches, options = {}) {
  const segmentIds = Array.isArray(options.segmentIds) ? options.segmentIds : [];
  const patches = Array.isArray(nextPatches) ? nextPatches : [];
  if (!segmentIds.length || segmentIds.length !== patches.length) {
    throw new Error("Batch target restoration requires matching segment IDs and patches.");
  }
  const currentById = new Map();
  const indexes = segmentIds.map((segmentId) => {
    const index = currentSegments().findIndex((segment) => segment.id === segmentId);
    if (index < 0) throw new Error("An affected pretranslation segment is no longer available.");
    currentById.set(segmentId, targetCommandPatch(currentSegments()[index]));
    return index;
  });
  const previousActiveId = currentSegment()?.id || "";
  try {
    const restored = patches.map((patch, offset) => {
      const segment = currentSegments()[indexes[offset]];
      const currentPatch = currentById.get(segment.id);
      const restoredPatch = structuredClone(patch);
      restoredPatch.revision = Math.max(
        Number(currentPatch?.revision || 0),
        Number(restoredPatch.revision || 0)
      ) + 1;
      restoredPatch.updatedAt = new Date().toISOString();
      applyTargetCommandPatch(segment, restoredPatch);
      clearPendingSave(segment);
      return segment;
    });
    await saveSegments(restored);
    const requestedActiveId = options.activeSegmentId || previousActiveId || restored[0]?.id || "";
    const requestedIndex = currentSegments().findIndex((segment) => segment.id === requestedActiveId);
    if (requestedIndex >= 0) selectApplicationSegment(requestedIndex);
    invalidateSegmentFilterCache();
    markWorkspaceDirty();
    renderAll();
    await refreshSidebar();
    focusActiveTextarea();
    return {
      patches: restored.map((segment) => targetCommandPatch(segment)),
      activeSegmentId: currentSegment()?.id || restored[0]?.id || "",
      affectedCount: restored.length,
      focusTarget: true
    };
  } catch (error) {
    currentById.forEach((patch, segmentId) => {
      const index = currentSegments().findIndex((segment) => segment.id === segmentId);
      if (index >= 0) applyTargetCommandPatch(currentSegments()[index], patch);
    });
    invalidateSegmentFilterCache();
    renderAll();
    throw error;
  }
}

async function restoreSegmentCommandSnapshots(nextSnapshots, options = {}) {
  const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
  const currentById = new Map();
  const indexes = [];
  for (const snapshot of snapshots) {
    const index = currentSegments().findIndex((segment) => segment.id === snapshot?.id);
    if (index < 0) throw new Error("An affected segment is no longer available.");
    indexes.push(index);
    currentById.set(snapshot.id, structuredClone(currentSegments()[index]));
  }
  const previousActiveId = currentSegment()?.id || "";
  try {
    const restored = snapshots.map((snapshot, offset) => {
      const next = prepareCommandRestoreSegmentSnapshot(snapshot, currentById.get(snapshot.id));
      editorSessionStore.replaceSegmentAt(indexes[offset], next);
      clearPendingSave(next);
      return next;
    });
    await saveSegments(restored);
    const requestedActiveId = options.activeSegmentId || previousActiveId || restored[0]?.id || "";
    const requestedIndex = currentSegments().findIndex((segment) => segment.id === requestedActiveId);
    if (requestedIndex >= 0) selectApplicationSegment(requestedIndex);
    markWorkspaceDirty();
    renderAll();
    await refreshSidebar();
    focusActiveTextarea();
    return {
      snapshots: restored.map((segment) => structuredClone(segment)),
      activeSegmentId: currentSegment()?.id || restored[0]?.id || ""
    };
  } catch (error) {
    for (const [segmentId, snapshot] of currentById) {
      const index = currentSegments().findIndex((segment) => segment.id === segmentId);
      if (index >= 0) editorSessionStore.replaceSegmentAt(index, prepareSegmentHistoryState(snapshot));
    }
    renderAll();
    throw error;
  }
}

async function restoreSplitSegmentCommandSegments(nextSnapshots, options = {}) {
  return structuralSegmentController.restoreSplit(nextSnapshots, options);
}

async function restoreMergeSegmentCommandSegments(nextSnapshots, options = {}) {
  return structuralSegmentController.restoreMerge(nextSnapshots, options);
}

async function replaceTargetText(scope = "visible") {
  return targetReplacementController.replace(scope);
}

function debounceSave(segment) {
  return autosaveService.debounce(segment);
}

function renderConfirmBusyState() {
  return segmentConfirmationController.renderBusy();
}

function applySegmentConfirmation(segment) {
  recordSegmentTargetHistory(segment, segment.target, "confirmed", "confirm");
  segment.status = "confirmed";
  if (segment.reviewState === "needs-review") segment.reviewState = "";
  touchSegment(segment);
}

function restoreSegmentConfirmation(segment, snapshot) {
  Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
  Object.assign(segment, snapshot);
}

function preparePersistedConfirmationRollback(segment, savedConfirmedRevision) {
  segment.revision = Math.max(Number(segment.revision || 0), Number(savedConfirmedRevision || 0)) + 1;
  segment.updatedAt = new Date().toISOString();
}

async function restoreSegmentCommandSnapshot(segmentId, nextSnapshot, options = {}) {
  const index = currentSegments().findIndex((item) => item.id === segmentId);
  if (index < 0) throw new Error("The affected segment is no longer available.");
  const currentSnapshot = structuredClone(currentSegments()[index]);
  try {
    const restored = prepareCommandRestoreSegmentSnapshot(nextSnapshot, currentSnapshot);
    editorSessionStore.replaceSegmentAt(index, restored);
    clearPendingSave(restored);
    await saveSegment(restored);
    verticalFeatureState?.segmentGrid?.selectSegment(index, restored.id);
    verticalFeatureState?.inspector?.setContext({ segmentId: restored.id });
    markWorkspaceDirty();
    renderAll();
    await refreshSidebar();
    if (options.navigateNext) await goToNextOpenSegment();
    else focusActiveTextarea();
    return {
      snapshot: structuredClone(restored),
      activeSegmentId: currentSegment()?.id || restored.id
    };
  } catch (error) {
    editorSessionStore.replaceSegmentAt(index, prepareSegmentHistoryState(currentSnapshot));
    renderAll();
    throw error;
  }
}

async function confirmCurrentSegment() {
  return segmentConfirmationController.confirm();
}

async function saveSegmentToTm(segment, project = currentProject()) {
  if (!segment || !project || !segment.source.trim() || !segment.target.trim()) return null;
      if (LOOPCAT_TEST_BUILD && segment[SAVE_TM_FAILURE_TEST_FLAG]) throw new Error("Simulated TM save failure");
  const entry = await saveTmEntry({
    source: segment.source,
    target: segment.target,
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
    projectName: project.name,
    tmName: mainTmName(project)
  });
  markWorkspaceDirty(project.id);
  return entry;
}

async function saveActiveSegmentToTm(options = {}) {
  const { reportStatus = true } = options || {};
  const segment = currentSegment();
  if (!segment || !currentProject() || !segment.source.trim() || !segment.target.trim()) return null;
  try {
    const entry = await saveSegmentToTm(segment, currentProject());
    await refreshTmMatches();
    if (reportStatus) setSaveStatus("Segment saved to TM", "saved");
    return entry;
  } catch (error) {
    if (!reportStatus) throw error;
    setSaveStatus(error.message || "Save to TM failed", "dirty");
    return null;
  }
}

function requestTmPretranslationThreshold() {
  if (!tmPretranslationDialogController?.request) {
    throw new Error("TM pretranslation settings are unavailable in this browser.");
  }
  return tmPretranslationDialogController.request({ returnTarget: els.segmentToolsMenuSummary });
}

async function pretranslateFromTm() {
  return tmPretranslationController.pretranslate();
}

function selectedConcordanceKeyword() {
  const selection = window.getSelection()?.toString().trim();
  if (selection) return selection.replace(/\s+/g, " ");
  const active = document.activeElement;
  if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") {
    const value = active.value || "";
    const selected = value.slice(active.selectionStart || 0, active.selectionEnd || 0).trim();
    if (selected) return selected.replace(/\s+/g, " ");
  }
  return "";
}

function highlightKeyword(text, keyword) {
  const escaped = escapeHtml(text);
  const pattern = new RegExp(escapeRegExp(escapeHtml(keyword)), "gi");
  return escaped.replace(pattern, (match) => `<mark>${match}</mark>`);
}

function closeConcordance() {
  els.concordanceOverlay.classList.add("hidden");
  els.concordanceResults.replaceChildren();
}

function closeCommandPalette() {
  paletteController?.close?.();
}

function renderCommandPalette() {
  paletteController?.render?.();
}

function openCommandPalette() {
  paletteController?.open?.();
}

function handleGlobalKeydown(event) {
  const key = stableLower(event.key);
  const editableTarget = event.target?.matches?.("input, textarea, [contenteditable='true']");
  if ((event.ctrlKey || event.metaKey) && key === "z" && !editableTarget) {
    const projectId = state.commandProjectId || currentProject()?.id || null;
    const canRun = event.shiftKey
      ? appRuntime?.commands?.bus?.canRedo?.(projectId)
      : appRuntime?.commands?.bus?.canUndo?.(projectId);
    if (canRun) {
      event.preventDefault();
      event.stopPropagation();
      void (event.shiftKey ? redoLastCommand() : undoLastCommand());
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "p") {
    event.preventDefault();
    event.stopPropagation();
    openCommandPalette();
    return;
  }
  const isK = key === "k" || event.code === "KeyK";
  if (isK && (event.ctrlKey || event.metaKey) && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    openCommandPalette();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "f" && currentApplicationView() === "editor" && currentProject()) {
    event.preventDefault();
    event.stopPropagation();
    toggleFocusMode();
    return;
  }
  const concordanceShortcut = isK && (event.ctrlKey || event.metaKey) && event.altKey;
  if (concordanceShortcut && currentApplicationView() === "editor") {
    event.preventDefault();
    event.stopPropagation();
    openConcordanceSearch();
    return;
  }
  if (event.key === "Escape" && !els.concordanceOverlay.classList.contains("hidden")) {
    event.preventDefault();
    closeConcordance();
    return;
  }
  if (event.key === "Escape" && !els.commandPaletteOverlay.classList.contains("hidden")) {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if (event.key === "Escape" && currentFocusMode()) {
    event.preventDefault();
    setFocusMode(false);
  }
}

async function openConcordanceSearch() {
  if (currentApplicationView() !== "editor" || !currentProject()) return;
  const keyword = selectedConcordanceKeyword();
  if (!keyword) {
    setSaveStatus("Select a source word, then press Ctrl+K or Alt+K.", "dirty");
    return;
  }
  const query = stableLower(keyword);
  const entries = await listTmEntries();
  const tmNames = new Set(projectTmNames());
  const results = entries
    .filter((entry) => entry.sourceLang === currentProject().sourceLang && entry.targetLang === currentProject().targetLang)
    .filter((entry) => tmNames.has(entry.tmName))
    .filter((entry) => stableLower(entry.source).includes(query))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  els.concordanceMeta.textContent = uiLabel("concordanceResultSummary", {
    keyword,
    resource: projectResourceSummary().tmLabel,
    pair: languagePair(),
    count: results.length
  });
  if (!results.length) {
    replaceSafeHtml(els.concordanceResults, `<div class="muted">${translatedSourceHtml("No TM units contain this keyword.")}</div>`);
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "concordance-card";
      replaceSafeHtml(card, `
        <p class="concordance-source">${highlightKeyword(entry.source, keyword)}</p>
        <p class="concordance-target">${highlightKeyword(entry.target, keyword)}</p>
        <footer><span>${escapeHtml(entry.projectName || entry.tmName || "")}</span></footer>
      `);
      const insertButton = document.createElement("button");
      insertButton.type = "button";
      insertButton.textContent = uiSource("Insert target");
      insertButton.addEventListener("click", () => {
        targetProducerController.insertTmTarget(entry.target, {
          channel: "concordance",
          resourceId: entry.id || ""
        });
        closeConcordance();
      });
      card.querySelector("footer").append(insertButton);
      fragment.append(card);
    });
    els.concordanceResults.replaceChildren(fragment);
  }
  els.concordanceOverlay.classList.remove("hidden");
}

function focusActiveTextarea(selection = null) {
  return targetEditController.focusActive(selection);
}

async function refreshSidebar() {
  return editorContextController.refresh();
}

function renderReviewPanel(options = {}) {
  qualityReviewController?.renderReview?.({ segment: currentSegment(), force: Boolean(options.force) });
}

function qualityLabel(value) {
  const label = {
    "student-review": "Student review",
    "freelance-delivery": "Freelance delivery",
    "agency-delivery": "Agency delivery",
    regulated: "Regulated",
    targeted: "Targeted",
    full: "Full",
    lqa: "LQA",
    balanced: "Balanced",
    strict: "Strict",
    standard: "Standard",
    "not-used": "Not used",
    "local-only": "Local only",
    "hosted-disclosed": "Hosted disclosed",
    "client-approved": "Client approved"
  }[value] || value || "";
  return uiSource(label);
}

function qualityCategoryName(value) {
  const label = baseQualityCategoryLabel?.(value) || {
    accuracy: "Accuracy",
    terminology: "Terminology",
    fluency: "Fluency",
    style: "Style",
    locale: "Locale",
    formatting: "Formatting",
    compliance: "Compliance",
    review: "Review"
  }[value] || value || "Review";
  return uiSource(label);
}

function qualityDecisionSeverityLabel(value) {
  const label = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical"
  }[value] || "Medium";
  return uiSource(label);
}

function qualityQaBySegment(qaChecks = currentQaChecks()) {
  const map = new Map();
  (qaChecks || []).forEach((check) => {
    const segmentId = check?.segmentId || "";
    if (!segmentId) return;
    if (!map.has(segmentId)) map.set(segmentId, []);
    map.get(segmentId).push(check);
  });
  return map;
}

function currentQualityRiskQueue(qaChecks = currentQaChecks()) {
  if (!currentProject()) return null;
  return buildRiskQueue({
    project: currentProject(),
    segments: currentDocumentSegments(),
    qaChecks,
    profile: currentProject().qualityProfile
  });
}

function qualityRiskLevelLabel(level) {
  const label = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    clear: "Clear"
  }[level] || "Risk";
  return uiSource(label);
}

function activeQualityEvidence(queue = null) {
  const segment = currentSegment();
  if (!currentProject() || !segment) return null;
  const queuedItem = (queue?.items || []).find((item) => item.segmentId === segment.id);
  if (queuedItem) return queuedItem;
  return scoreSegment(segment, currentActiveIndex(), {
    profile: currentProject().qualityProfile,
    qaBySegment: qualityQaBySegment()
  });
}

function renderQualityWorkbench() {
  const storedQueue = storedQualityRiskQueue();
  const queue = currentProject()
    ? storedQueue?.projectId === currentProject().id
      ? storedQueue
      : currentQualityRiskQueue()
    : null;
  if (currentProject()) editorSessionStore.replaceQualityRiskQueue(queue);
  qualityReviewController?.renderQuality?.({
    project: currentProject(),
    segment: currentSegment(),
    activeIndex: currentActiveIndex(),
    profile: currentProject()?.qualityProfile,
    queue,
    evidence: activeQualityEvidence(queue)
  });
}

async function saveQualityProfileFromForm(values = qualityReviewController?.readProfile?.()) {
  return qualityProfileController.save(values);
}

async function saveQualityDecisionFromForm(values = qualityReviewController?.readDecision?.()) {
  return qualityDecisionController.save(values);
}

async function refreshQualityRiskQueue() {
  if (!currentProject()) return null;
  const checks = await runProjectQa();
  if (!checks) return null;
  editorSessionStore.replaceQualityRiskQueue(currentQualityRiskQueue(checks));
  renderQualityWorkbench();
  return storedQualityRiskQueue();
}

async function goToQualityRiskItem(item) {
  const index = currentSegments().findIndex((segment) => segment.id === item?.segmentId);
  if (index === -1) return;
  const segment = currentSegments()[index];
  if (!segmentPassesFilters(segment)) {
    if (currentDocumentId() && segment.documentId !== currentDocumentId()) {
      selectApplicationDocument("");
      els.documentFilter.value = currentDocumentId();
    }
    updateEditorFilters({ query: "", status: "all", reviewState: "", aiState: "" });
    els.segmentSearchInput.value = "";
    els.segmentStatusFilter.value = "all";
    if (els.reviewStateFilter) els.reviewStateFilter.value = "";
    if (els.aiSegmentFilter) els.aiSegmentFilter.value = "";
    renderSegments();
  }
  await setActiveSegment(index);
  renderSegments();
  focusActiveTextarea();
}

async function goToNextQualityRisk() {
  if (!currentProject()) return;
  const storedQueue = storedQualityRiskQueue();
  if (!storedQueue || storedQueue.projectId !== currentProject().id) {
    editorSessionStore.replaceQualityRiskQueue(currentQualityRiskQueue());
  }
  const queue = storedQualityRiskQueue();
  if (!queue?.items?.length) {
    setSaveStatus("No quality risks in this scope", "saved");
    return;
  }
  const indexedItems = queue.items
    .map((item) => ({
      ...item,
      globalIndex: currentSegments().findIndex((segment) => segment.id === item.segmentId)
    }))
    .filter((item) => item.globalIndex !== -1)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const afterActive = indexedItems.find((item) => item.globalIndex > currentActiveIndex());
  await goToQualityRiskItem(afterActive || indexedItems[0] || queue.items[0]);
}

function revisionReasonLabel(reason) {
  const label = {
    edit: "Edit",
    replace: "Replace",
    confirm: "Confirm",
    pretranslate: "Pretranslate",
    "insert-target": "Insert",
    "copy-source": "Copy source",
    "insert-tag": "Insert tag",
    "ai-suggestion": "AI suggestion",
    split: "Split",
    merge: "Merge"
  }[reason] || reason || "Change";
  return uiSource(label);
}

function renderRevisionHistory() {
  if (!els.revisionHistoryList) return;
  const segment = currentSegment();
  if (!segment) {
    els.revisionHistoryList.textContent = uiSource("No active segment.");
    els.revisionHistoryList.classList.add("muted");
    return;
  }
  const history = Array.isArray(segment.targetHistory) ? segment.targetHistory.slice().reverse() : [];
  if (!history.length) {
    els.revisionHistoryList.textContent = uiSource("No target revisions yet.");
    els.revisionHistoryList.classList.add("muted");
    return;
  }
  els.revisionHistoryList.classList.remove("muted");
  replaceSafeHtml(els.revisionHistoryList, history.slice(0, 8).map((entry) => `
    <article class="revision-card">
      <header><strong>${escapeHtml(revisionReasonLabel(entry.reason))}</strong><span>${escapeHtml(formatDateTime(entry.updatedAt || entry.createdAt))}</span></header>
      <div class="revision-status">${escapeHtml(segmentStatusLabel(entry.fromStatus || "empty"))} -> ${escapeHtml(segmentStatusLabel(entry.toStatus || "empty"))}</div>
      <div class="revision-pair">
        <div><span>${uiLabelHtml("before")}</span><p>${escapeHtml(entry.fromTarget || "") || "&nbsp;"}</p></div>
        <div><span>${uiLabelHtml("after")}</span><p>${escapeHtml(entry.toTarget || "") || "&nbsp;"}</p></div>
      </div>
    </article>
  `).join(""));
}

async function saveActiveReviewMetadata(values = qualityReviewController?.readReview?.()) {
  return reviewMetadataController.save(values);
}

async function setActiveReviewState(reviewState) {
  return reviewStateController.setState(reviewState);
}

function qaSummary(checks) {
  return checks.reduce((summary, check) => {
    summary[check.type] = (summary[check.type] || 0) + 1;
    summary[check.severity] = (summary[check.severity] || 0) + 1;
    return summary;
  }, {});
}

function qaCheckMessage(check) {
  return uiSource(check?.message || "", check?.messageValues || {});
}

function qaCheckFixHint(check) {
  return check?.fixHint ? uiSource(check.fixHint, check.fixHintValues || {}) : "";
}

function renderQaResults() {
  const qaChecks = currentQaChecks();
  const checks = state.qaFilter ? qaChecks.filter((check) => check.type === state.qaFilter) : qaChecks;
  if (!qaChecks.length) {
    els.qaResults.textContent = uiSource("No QA issues found.");
    els.qaResults.classList.add("muted");
    return;
  }
  els.qaResults.classList.remove("muted");
  const summary = qaSummary(qaChecks);
  const fragment = document.createDocumentFragment();
  const summaryWrap = document.createElement("div");
  summaryWrap.className = "qa-summary";
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = state.qaFilter ? "" : "active";
  allButton.textContent = uiSource("All {value1}", { value1: qaChecks.length });
  allButton.addEventListener("click", () => {
    state.qaFilter = "";
    renderQaResults();
  });
  summaryWrap.append(allButton);
  Object.entries(summary).filter(([type]) => !["error", "warning", "info"].includes(type)).forEach(([type, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.qaFilter === type ? "active" : "";
    button.textContent = `${uiSource(type)} ${count}`;
    button.addEventListener("click", () => {
      state.qaFilter = state.qaFilter === type ? "" : type;
      renderQaResults();
    });
    summaryWrap.append(button);
  });
  fragment.append(summaryWrap);
  checks.slice(0, 100).forEach((check) => {
    const card = document.createElement("article");
    card.className = "qa-card";
    const fixHint = qaCheckFixHint(check);
    replaceSafeHtml(card, `<header><strong>${escapeHtml(uiSource(check.type))}</strong><span class="severity-pill ${escapeHtml(check.severity || "info")}">${escapeHtml(uiSource(check.severity || "info"))}</span><span>#${escapeHtml(check.label)}</span></header><p>${escapeHtml(qaCheckMessage(check))}</p>${fixHint ? `<p class="muted">${escapeHtml(fixHint)}</p>` : ""}`);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = uiLabel("go");
    button.addEventListener("click", async () => {
      const index = currentSegments().findIndex((segment) => segment.id === check.segmentId);
      if (index !== -1) {
        await setActiveSegment(index);
        renderSegments();
        focusActiveTextarea();
      }
    });
    card.append(button);
    fragment.append(card);
  });
  els.qaResults.replaceChildren(fragment);
}

async function refreshTmMatches() {
  const segment = currentSegment();
  if (!segment || !currentProject()) {
    els.tmMatches.textContent = uiSource("No active segment.");
    els.tmMatches.classList.add("muted");
    return;
  }
  const segmentId = segment.id;
  const projectId = currentProject().id;
  const matches = await findProjectTmMatches({
    source: segment.source,
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    tmNames: projectTmNames()
  });
  if (currentProject()?.id !== projectId || currentSegment()?.id !== segmentId) return;
  els.tmMatches.classList.toggle("muted", !matches.length);
  if (!matches.length) {
    els.tmMatches.textContent = uiSource("No TM matches.");
    return;
  }
  const fragment = document.createDocumentFragment();
  matches.forEach((match) => {
    const card = document.createElement("article");
    card.className = "match-card";
    replaceSafeHtml(card, `<header><strong>${uiLabelHtml("matchPercent", { score: match.score })}</strong><span>${escapeHtml(match.tmName || "")}</span></header>
      <p>${escapeHtml(match.source)}</p>
      <p><strong>${escapeHtml(match.target)}</strong></p>
      ${match.projectName ? `<p class="muted">${escapeHtml(match.projectName)}</p>` : ""}`);
    const button = document.createElement("button");
    button.textContent = uiLabel("insert");
    button.addEventListener("click", () =>
      targetProducerController.insertTmTarget(match.target, {
        channel: "match",
        resourceId: match.id || ""
      })
    );
    card.append(button);
    fragment.append(card);
  });
  els.tmMatches.replaceChildren(fragment);
}

async function refreshTerms() {
  const segment = currentSegment();
  if (!segment || !currentProject()) {
    els.termSuggestions.textContent = uiSource("No active segment.");
    els.termSuggestions.classList.add("muted");
    return;
  }
  const segmentId = segment.id;
  const projectId = currentProject().id;
  const suggestions = await findTerms({
    source: segment.source,
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    termBaseNames: projectTermBaseNames()
  });
  if (currentProject()?.id !== projectId || currentSegment()?.id !== segmentId) return;
  els.termSuggestions.classList.toggle("muted", !suggestions.length);
  if (!suggestions.length) {
    els.termSuggestions.textContent = uiSource("No terms found in this segment.");
    return;
  }
  const fragment = document.createDocumentFragment();
  suggestions.forEach((term) => {
    const card = document.createElement("article");
    card.className = `term-card${term.isForbidden ? " forbidden-term-card" : ""}`;
    replaceSafeHtml(card, `<header><strong>${escapeHtml(term.sourceTerm)}</strong><span>${escapeHtml(term.targetTerm)}</span><span>${uiLabelHtml(term.isForbidden ? "forbidden" : "approved")}</span><span>${escapeHtml(term.termBaseName || "")}</span></header>
      ${term.notes ? `<p>${escapeHtml(term.notes)}</p>` : ""}`);
    const button = document.createElement("button");
    button.textContent = uiSource("Delete");
    button.addEventListener("click", async () => {
      await deleteTermResourceEntry(term, { refreshResourceView: false, refreshSuggestions: true });
    });
    card.append(button);
    fragment.append(card);
  });
  els.termSuggestions.replaceChildren(fragment);
}

async function saveTermFromForm() {
  if (!currentProject() || !els.sourceTermInput.value.trim() || !els.targetTermInput.value.trim()) return null;
  const termBaseName = els.termBaseSelect.value || primaryTermBaseName();
  try {
    if (LOOPCAT_TEST_BUILD && els.termForm[TERM_FORM_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated term form save failure");
    const term = await saveTerm({
      sourceTerm: els.sourceTermInput.value,
      targetTerm: els.targetTermInput.value,
      notes: els.termNotesInput.value,
      sourceLang: currentProject().sourceLang,
      targetLang: currentProject().targetLang,
      termBaseName,
      isForbidden: els.termForbiddenInput?.checked
    });
    markProjectsUsingResourceDirty("termbase", termBaseName, currentProject().sourceLang, currentProject().targetLang);
    els.termForm.reset();
    renderTermbaseSelect();
    try {
      await refreshProjectTerms({ rerender: true });
      await refreshTerms();
    } catch (refreshError) {
      console.warn("Term refresh failed after save.", refreshError);
    }
    setSaveStatus("Term saved", "saved");
    return term;
  } catch (error) {
    setSaveStatus(error.message || "Term save failed", "dirty");
    return null;
  }
}

async function runProjectQa() {
  if (!currentProject()) return null;
  try {
    if (LOOPCAT_TEST_BUILD && currentProject()[QA_RUN_FAILURE_TEST_FLAG]) throw new Error("Simulated QA run failure");
    const terms = await listTerms({
      sourceLang: currentProject().sourceLang,
      targetLang: currentProject().targetLang,
      termBaseNames: projectTermBaseNames()
    });
    const qaSegments = currentDocumentSegments().map((segment) => ({
      ...segment,
      tags: segmentTags(segment)
    }));
    const fallback = () => Promise.resolve(runQaChecks(currentDocumentSegments(), terms, { missingTags }));
    const checks = workerClient?.runQaChecks
      ? await workerClient.runQaChecks({ segments: qaSegments, terms, fallback })
      : await fallback();
    editorSessionStore.replaceQaChecks(checks);
    state.qaFilter = "";
    renderQaResults();
    editorSessionStore.replaceQualityRiskQueue(currentQualityRiskQueue(checks));
    renderQualityWorkbench();
    try {
    if (LOOPCAT_TEST_BUILD && currentProject()[QA_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated QA activity log failure");
      await logProjectActivity("qa-run", "QA checks run", { issueCount: checks.length, documentId: currentDocumentId() });
    } catch (activityError) {
      console.warn("QA activity log failed.", activityError);
    }
    setSaveStatus(checks.length ? `QA found ${checks.length} issue${checks.length === 1 ? "" : "s"}` : "QA found no issues", checks.length ? "dirty" : "saved");
    return checks;
  } catch (error) {
    renderQaResults();
    setSaveStatus(error.message || "QA checks failed", "dirty");
    return null;
  }
}

async function saveProjectDomainFromForm() {
  if (!currentProject()) return false;
  const previousProject = structuredClone(currentProject());
  const previousProjects = currentProjects().map((project) => structuredClone(project));
  const domain = els.projectDomainEditInput.value.trim();
  try {
    if (LOOPCAT_TEST_BUILD && currentProject()[PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated project domain save failure");
    editorSessionStore.replaceProject(await updateProject({ ...currentProject(), domain }));
    editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
    await refreshProjectSummaries();
    renderAll();
    els.domainForm.classList.toggle("hidden", Boolean((currentProject().domain || "").trim()));
    markWorkspaceDirty();
    setSaveStatus("Project domain saved", "saved");
    return true;
  } catch (error) {
    editorSessionStore.replaceProject(previousProject);
    editorSessionStore.replaceProjects(previousProjects);
    els.domainForm.classList.toggle("clean", domain === (currentProject().domain || ""));
    setSaveStatus(error.message || "Project domain save failed", "dirty");
    return false;
  }
}

function aiReviewRiskLabel(level) {
  return {
    none: uiLabel("noIssuesFound"),
    low: uiLabel("lowRisk"),
    medium: uiLabel("mediumRisk"),
    high: uiLabel("highRisk"),
    critical: uiLabel("criticalRisk")
  }[level] || uiLabel("unrankedRisk");
}

async function splitCurrentSegment() {
  return structuralSegmentController.split();
}

async function mergeWithNextSegment() {
  return structuralSegmentController.merge();
}

async function importDocx(file) {
  assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);
  await reportImportProgress("Reading DOCX package", file);
  const result = await extractDocxSegments(file);
  await reportImportProgress("Saving imported segments", file, `${result.segments.length} segment${result.segments.length === 1 ? "" : "s"}`);
  const documentId = `doc-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const documents = [...projectDocumentManifest(currentProject()), { id: documentId, name: result.fileName, type: "docx" }];
  const docxStructures = { ...(currentProject().docxStructures || {}), [documentId]: result.structure };
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...currentProject(), sourceFileName: result.fileName, docxStructure: result.structure, docxStructures, documents },
    result.segments,
    { documentId, documentName: result.fileName, documentType: "docx" }
  );
  await reportImportProgress("Refreshing project view", file);
  editorSessionStore.replaceProject(importResult.project);
  editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(currentProject().id)));
  editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
  await refreshProjectSummaries();
  const activeIndex = currentSegments().findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: currentSegments()[activeIndex]?.id || "",
    activeIndex
  });
  const extractedParts = result.structure?.textPartSummary?.filter((part) => part.segments > 0).length || 1;
  const activityLogged = await logOptionalProjectActivity("import", "DOCX imported", { fileName: file.name, segmentCount: result.segments.length, documentId }, "DOCX import");
  markWorkspaceDirty();
  setSaveStatus(appendActivityWarning(`Imported ${result.segments.length} segments from ${extractedParts} DOCX part${extractedParts === 1 ? "" : "s"}`, activityLogged), exportStatusMode("saved", activityLogged));
  renderAll();
  await refreshSidebar();
}

async function importLocalization(file) {
  assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);
  await reportImportProgress("Parsing project file", file);
  const result = await parseLocalizationFile(file, textDecodingOptions());
  await reportImportProgress("Saving imported segments", file, `${result.segments.length} segment${result.segments.length === 1 ? "" : "s"}`);
  const documentId = `doc-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const documents = [...projectDocumentManifest(currentProject()), { id: documentId, name: result.fileName, type: result.documentType }];
  const localizationStructures = result.structure
    ? { ...(currentProject().localizationStructures || {}), [documentId]: result.structure }
    : currentProject().localizationStructures;
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...currentProject(), documents, localizationStructures },
    result.segments,
    { documentId, documentName: result.fileName, documentType: result.documentType }
  );
  await reportImportProgress("Refreshing project view", file);
  editorSessionStore.replaceProject(importResult.project);
  editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(currentProject().id)));
  editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
  await refreshProjectSummaries();
  const activeIndex = currentSegments().findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: currentSegments()[activeIndex]?.id || "",
    activeIndex
  });
  const activityLogged = await logOptionalProjectActivity("import", "Localization file imported", { fileName: file.name, documentType: result.documentType, segmentCount: result.segments.length, documentId }, "Localization import");
  markWorkspaceDirty();
  setSaveStatus(appendActivityWarning("Saved", activityLogged), exportStatusMode("saved", activityLogged));
  renderAll();
  await refreshSidebar();
}

async function importXliff(file) {
  assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);
  await reportImportProgress("Parsing XLIFF", file);
  const result = await parseXliffFile(file, textDecodingOptions());
  await reportImportProgress("Saving imported segments", file, `${result.segments.length} segment${result.segments.length === 1 ? "" : "s"}`);
  const documentId = `doc-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const documents = [...projectDocumentManifest(currentProject()), { id: documentId, name: result.fileName, type: result.documentType }];
  const localizationStructures = {
    ...(currentProject().localizationStructures || {}),
    [documentId]: result.structure
  };
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...currentProject(), documents, localizationStructures },
    result.segments,
    { documentId, documentName: result.fileName, documentType: result.documentType }
  );
  await reportImportProgress("Refreshing project view", file);
  editorSessionStore.replaceProject(importResult.project);
  editorSessionStore.replaceSegments(prepareSegmentHistoryStates(await getProjectSegments(currentProject().id)));
  editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
  await refreshProjectSummaries();
  const activeIndex = currentSegments().findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: currentSegments()[activeIndex]?.id || "",
    activeIndex
  });
  const activityLogged = await logOptionalProjectActivity("import", "XLIFF imported", { fileName: file.name, segmentCount: result.segments.length, documentId }, "XLIFF import");
  markWorkspaceDirty();
  setSaveStatus(appendActivityWarning(`Imported ${result.segments.length} XLIFF segment${result.segments.length === 1 ? "" : "s"}`, activityLogged), exportStatusMode("saved", activityLogged));
  renderAll();
  await refreshSidebar();
}

function projectHasDocumentNamed(fileName) {
  const normalized = stableLower(String(fileName || "").trim());
  if (!normalized) return false;
  return projectDocuments().some((documentInfo) => stableLower(documentInfo.name.trim()) === normalized);
}

function confirmDuplicateImport(file) {
  if (!projectHasDocumentNamed(file.name)) return true;
  return uiConfirm(`A file named "${displaySafeText(file.name)}" already exists in this project. Import it again anyway?`);
}

async function importProjectDocument(file) {
  if (!currentProject() || !file) return;
  assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);
  if (!confirmDuplicateImport(file)) {
    setSaveStatus("Import canceled", "saved");
    return false;
  }
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "docx") {
    await importDocx(file);
    return;
  }
  if (XLIFF_DOCUMENT_TYPES.has(ext)) {
    await importXliff(file);
    return;
  }
  await importLocalization(file);
}

function validateProjectPackage(pkg) {
  return validatePackage(pkg);
}

function hasOriginalLocalizationStructure(structure) {
  return Boolean(
    structure?.source ||
      structure?.sourceLines ||
      structure?.sourceJson !== undefined ||
      structure?.rows ||
      structure?.packageBase64
  );
}

function clonePortableRecord(record) {
  return sanitizePortableValue(record || {});
}

function importedCopyName(name) {
  const base = `${String(name || "Imported project").trim() || "Imported project"} (copy)`;
  const usedNames = new Set(currentProjects().map((project) => project.name).filter(Boolean));
  if (!usedNames.has(base)) return base;
  let counter = 2;
  while (usedNames.has(`${base} ${counter}`)) counter += 1;
  return `${base} ${counter}`;
}

function storeIds(records, ignoredProjectId = "") {
  return new Set((records || [])
    .filter((record) => !ignoredProjectId || record.projectId !== ignoredProjectId)
    .map((record) => record.id)
    .filter(Boolean));
}

function remapRecordId(record, prefix, existingIds, reservedIds, forceNewId = false) {
  const next = clonePortableRecord(record);
  const currentId = String(next.id || "");
  if (forceNewId || !currentId || existingIds.has(currentId) || reservedIds.has(currentId)) {
    next.id = makeId(prefix);
  }
  reservedIds.add(next.id);
  return next;
}

async function prepareProjectPackageImport(pkg, { replaceProjectId = "", importAsCopy = false } = {}) {
  const [existingSegments, existingActivityEvents, existingTmEntries, existingTerms] = await Promise.all([
    getAll("segments"),
    getAll("activityEvents"),
    getAll("tmEntries"),
    getAll("terms")
  ]);
  const project = clonePortableRecord(pkg.project);
  if (importAsCopy) {
    project.id = makeId("project");
    project.name = importedCopyName(project.name);
    project.createdAt = new Date().toISOString();
    project.updatedAt = project.createdAt;
    project.exportHistory = [];
  }

  const segmentIds = storeIds(existingSegments, replaceProjectId);
  const activityIds = storeIds(existingActivityEvents, replaceProjectId);
  const tmIds = storeIds(existingTmEntries);
  const termIds = storeIds(existingTerms);
  const reservedSegmentIds = new Set();
  const reservedActivityIds = new Set();
  const reservedTmIds = new Set();
  const reservedTermIds = new Set();
  const segments = (pkg.segments || []).map((segment) => ({
    ...remapRecordId(segment, "segment", segmentIds, reservedSegmentIds, importAsCopy),
    projectId: project.id
  }));
  const activityEvents = (pkg.activityEvents || []).map((event) => ({
    ...remapRecordId(event, "activity", activityIds, reservedActivityIds, importAsCopy),
    projectId: project.id
  }));
  const tmEntries = (pkg.resources?.tmEntries || []).map((entry) => remapRecordId(entry, "tm", tmIds, reservedTmIds));
  const terms = (pkg.resources?.terms || []).map((term) => remapRecordId(term, "term", termIds, reservedTermIds));
  return {
    ...pkg,
    project,
    segments,
    resources: {
      ...(pkg.resources || {}),
      tmEntries,
      terms
    },
    activityEvents
  };
}

function portableFileErrorReport(message) {
  return { ok: false, errors: [message], warnings: [], preserved: [], simplified: [], skipped: [], risky: [] };
}

function assertFileSize(file, label, maxBytes) {
  if (file?.size > maxBytes) {
    throw new Error(`${label} is too large. Choose a file under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
}

async function parseJsonFile(file, label) {
  if (file?.size > MAX_PORTABLE_JSON_BYTES) {
    throw new Error(`${label} is too large. Choose a LoopCAT JSON file under 50 MB.`);
  }
  try {
    const decoded = encodingApi
      ? await encodingApi.decodeTextFile(file, textDecodingOptions())
      : { text: await file.text() };
    return JSON.parse(decoded.text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function readImportTextFile(file, options = textDecodingOptions()) {
  if (encodingApi) return (await encodingApi.decodeTextFile(file, options)).text;
  return file.text();
}

function importProgressDetail(done, total, unitLabel) {
  const totalCount = Math.max(0, Number(total || 0));
  const doneCount = Math.max(0, Number(done || 0));
  const percent = totalCount ? Math.min(100, Math.floor((doneCount / totalCount) * 100)) : 100;
  const countText = totalCount ? `${doneCount}/${totalCount}` : `${doneCount}`;
  return `${percent}% - ${countText} ${unitLabel}`;
}

function fileImportFailureMessage(error, label) {
  return `${label} failed: ${error?.message || "The selected file could not be imported."}`;
}

async function runFileImportTask(label, action) {
  if (state.importTask) {
    setSaveStatus(`${state.importTask} is still running. Wait for it to finish before starting ${stableLower(label)}.`, "dirty");
    return false;
  }
  state.importTask = label;
  renderImportBusyState();
  setSaveStatus(`${label} started...`);
  try {
    const result = await action();
    return result !== false && result !== null;
  } catch (error) {
    const message = fileImportFailureMessage(error, label);
    renderValidationReport(portableFileErrorReport(message));
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.importTask = "";
    renderImportBusyState();
    await refreshStorageDurability({ request: false });
  }
}

async function buildProjectPackage(project = currentProject(), segmentRecords = null, options = {}) {
  if (!project) return null;
  await flushPendingSegmentSaves(project.id);
  const projectSegments = segmentRecords || (project.id === currentProject()?.id ? currentSegments() : await getProjectSegments(project.id));
  const [tmEntries, terms, activityEvents] = await Promise.all([
    getAllByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`),
    listTerms({
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      termBaseNames: projectTermBaseNames(project)
    }),
    listActivityEvents(project.id)
  ]);
  const tmNames = new Set(projectTmNames(project));
  const scopedTm = tmEntries.filter((entry) => tmNames.has(entry.tmName));
  const portableContext = createPortableSanitizerContext();
  const pkg = {
    app: APP_NAME,
    type: "project-package",
    version: 1,
    schemaVersion: storageConstants.PROJECT_PACKAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    packageMetadata: {
      format: "loopcat-project-package",
      packageVersion: 1,
      contractVersion: "loopcat-package-v1",
      generator: "LoopCAT browser workspace",
      storageMode: state.workspaceStatus?.connected ? "workspace-folder" : "browser-cache"
    },
    project: sanitizePortableValue({
      ...project,
      resourceLinks: projectResourceLinks(project),
      aiSettings: aiRuntimeSettingsService.normalizeProjectSettings(project.aiSettings)
    }, "", [], portableContext),
    segments: sanitizePortableValue(projectSegments, "", [], portableContext),
    resources: sanitizePortableValue({
      tmEntries: scopedTm,
      terms
    }, "", [], portableContext),
    resourceReferences: sanitizePortableValue(projectResourceLinks(project).map((link) => ({
      id: link.id,
      type: link.type,
      name: link.name,
      role: link.role || "",
      sourceLang: project.sourceLang,
      targetLang: project.targetLang
    })), "resourceReferences", [], portableContext),
    sourceAssets: sanitizePortableValue(projectDocumentManifest(project).map((documentInfo) => {
      const docxStructure = project.docxStructures?.[documentInfo.id] || (documentInfo.type === "docx" ? project.docxStructure : null);
      const localizationStructure = project.localizationStructures?.[documentInfo.id];
      const originalAvailable = Boolean(docxStructure?.docxPackageBase64 || hasOriginalLocalizationStructure(localizationStructure));
      return {
        id: documentInfo.id,
        name: documentInfo.name,
        type: documentInfo.type,
        originalAvailable,
        structurePreserved: Boolean(docxStructure || localizationStructure)
      };
    }), "sourceAssets", [], portableContext),
    activityEvents: sanitizePortableValue([...(activityEvents || []), ...(options.activityEvents || [])], "", [], portableContext)
  };
  const validation = validateProjectPackage(pkg);
  return { ...pkg, validation, validationReports: { package: validation } };
}

function assertValidProjectPackageForWrite(pkg, actionLabel) {
  const validation = pkg?.validation || validateProjectPackage(pkg);
  if (validation.ok) return validation;
  const error = new Error(`Cannot ${actionLabel}: ${reportSummary(validation)}`);
  error.validation = validation;
  throw error;
}

function assertValidBackupForWrite(backup, actionLabel) {
  const validation = validateBackupFile(backup);
  if (validation.ok) return validation;
  const error = new Error(`Cannot ${actionLabel}: ${reportSummary(validation)}`);
  error.validation = validation;
  throw error;
}

async function buildBackupExport() {
  await flushPendingSegmentSaves();
  const backup = await exportAllData();
  const validation = assertValidBackupForWrite(backup, "export backup");
  return { backup, validation };
}

async function exportBrowserBackup() {
  try {
    const { backup, validation } = await buildBackupExport();
    download(
      `loopcat-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );
    renderValidationReport(validation);
    const noteCount = reportCount(validation);
    setSaveStatus(
      noteCount
        ? `Backup exported with ${noteCount} validation note${noteCount === 1 ? "" : "s"}`
        : "Backup exported",
      noteCount ? "dirty" : "saved"
    );
    return true;
  } catch (error) {
    const message = error.message || "Backup export failed.";
    renderValidationReport(error.validation || portableFileErrorReport(message));
    setSaveStatus(message, "dirty");
    return false;
  }
}

function reportProjectPackageExportFailure(error, pkg = null) {
  const message = error?.message || "Project package export failed";
  renderValidationReport(error?.validation || pkg?.validation || portableFileErrorReport(message));
  setSaveStatus(message, "dirty");
}

async function exportProjectPackage() {
  if (!currentProject()) return;
  const base = fileSafeName(currentProject().name || "project");
  const filename = `${base}.loopcat.json`;
  let previewPackage = null;
  try {
    previewPackage = await buildProjectPackage();
    assertValidProjectPackageForWrite(previewPackage, "export project package");
  } catch (error) {
    reportProjectPackageExportFailure(error, previewPackage);
    return;
  }
  const warnings = reportCount(previewPackage.validation);
  const exportHistoryEntry = { id: `export-${Date.now()}`, type: "project-package", filename, warningCount: warnings, createdAt: new Date().toISOString() };
  const pendingProject = {
    ...currentProject(),
    exportHistory: [
      ...(currentProject().exportHistory || []),
      exportHistoryEntry
    ].slice(-25)
  };
  const activityDetail = { filename, warningCount: warnings };
  const shouldSimulateActivityFailure = Boolean(LOOPCAT_TEST_BUILD && currentProject()?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG]);
  const pendingActivityEvent = shouldSimulateActivityFailure
    ? null
    : draftProjectActivityEvent(currentProject(), "export", "Project package exported", activityDetail);
  let pkg = null;
  try {
    pkg = await buildProjectPackage(pendingProject, null, {
      activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
    });
    assertValidProjectPackageForWrite(pkg, "export project package");
  } catch (error) {
    reportProjectPackageExportFailure(error, pkg);
    return;
  }
  const finalWarnings = reportCount(pkg.validation);
  try {
    download(filename, JSON.stringify(pkg, null, 2), "application/json");
  } catch (error) {
    setSaveStatus(error.message || "Project package export failed", "dirty");
    return;
  }
  try {
    editorSessionStore.replaceProject(await updateProject(pendingProject));
    editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
  } catch (error) {
    console.warn("Project package export history update failed.", error);
    markWorkspaceDirty(currentProject()?.id);
    renderValidationReport(pkg.validation);
    renderEditor();
    setSaveStatus("Project package exported; local export history failed", "dirty");
    return;
  }
  let activityLogged = true;
  try {
    if (shouldSimulateActivityFailure) throw new Error("Simulated export activity log failure");
    if (pendingActivityEvent) {
      await bulkPut("activityEvents", [pendingActivityEvent]);
      editorSessionStore.replaceActivityEvents(await listActivityEvents(currentProject().id));
    }
    markWorkspaceDirty(currentProject().id);
    renderBackupReminder();
  } catch (activityError) {
    activityLogged = false;
    console.warn("Project package export activity log failed.", activityError);
    if (currentProject()?.id) markWorkspaceDirty(currentProject().id);
  }
  renderValidationReport(pkg.validation);
  renderEditor();
  const successMessage = finalWarnings ? `Project exported with ${finalWarnings} validation warning${finalWarnings === 1 ? "" : "s"}` : "Project package exported";
  setSaveStatus(appendActivityWarning(successMessage, activityLogged), exportStatusMode(finalWarnings ? "dirty" : "saved", activityLogged));
}

async function importProjectPackageData(pkg, options = {}) {
  const sourceName = options.sourceName || "project package";
  await reportImportProgress("Validating project package", { name: sourceName });
  const validation = validateProjectPackage(pkg);
  if (!validation.ok) {
    if (!options.suppressAlert) uiAlert(validationAlertText(validation, "Project package import failed validation"));
    renderValidationReport(validation);
    setSaveStatus("Project package import failed validation", "dirty");
    return null;
  }
  const existing = currentProjects().find((project) => project.id === pkg.project.id);
  let importAsCopy = false;
  if (existing) {
    const replace = options.replaceExisting ?? uiConfirm(`A project named "${displaySafeText(existing.name)}" already exists. Replace it with this package?`);
    if (!replace) {
      importAsCopy = options.importAsCopy ?? uiConfirm("Keep the existing project and import this package as a separate copy?");
      if (!importAsCopy) return null;
    }
  }
  const replaceProjectId = existing && !importAsCopy ? existing.id : "";
  if (replaceProjectId) await flushPendingSegmentSaves(replaceProjectId);
  const prepared = await prepareProjectPackageImport(pkg, {
    replaceProjectId,
    importAsCopy
  });
  await reportImportProgress("Saving project package records", { name: sourceName }, `${(prepared.segments || []).length} segment${(prepared.segments || []).length === 1 ? "" : "s"}`);
  const importReport = importAsCopy
    ? {
      ...validation,
      preserved: [...validation.preserved, `Imported as a separate project copy named "${displaySafeText(prepared.project.name)}".`]
    }
    : validation;
  await importProjectPackageRecords({
    project: prepared.project,
    segments: prepared.segments || [],
    tmEntries: prepared.resources?.tmEntries || [],
    terms: prepared.resources?.terms || [],
    activityEvents: prepared.activityEvents || [],
    replaceProjectId
  });
  await reportImportProgress("Rebuilding resource indexes", { name: sourceName });
  await rebuildAllTmIndexes();
  await rebuildAllTermIndexes();
  await reportImportProgress("Refreshing projects", { name: sourceName });
  const activityResult = await logOptionalActivityForProject(prepared.project.id, "import", "Project package imported", { fileName: sourceName, warningCount: reportCount(importReport), importAsCopy }, "Project package import");
  const activityLogged = activityResult.ok;
  editorSessionStore.replaceProject(null);
  editorSessionStore.replaceSegments([]);
  applicationNavigation.openProjects();
  applicationNavigation.clearSelection();
  await loadProjects(false);
  if (options.open !== false) await openProject(prepared.project.id);
  renderValidationReport(importReport);
  const warningCount = reportCount(importReport);
  const successMessage = warningCount ? `Imported with ${warningCount} validation note${warningCount === 1 ? "" : "s"}` : "Project package imported";
  setSaveStatus(appendActivityWarning(successMessage, activityLogged), exportStatusMode(warningCount ? "dirty" : "saved", activityLogged));
  if (options.sourceIsWorkspace) clearWorkspaceDirty(prepared.project.id);
  else if (state.workspaceStatus?.connected) markWorkspaceDirty(prepared.project.id);
  return { pkg: prepared, validation: importReport };
}

async function importProjectPackage(file) {
  await reportImportProgress("Reading project package", file);
  const pkg = await parseJsonFile(file, "Project package");
  return importProjectPackageData(pkg, { sourceName: file.name });
}

async function restoreBackupData(backup) {
  await reportImportProgress("Validating backup");
  const backupReport = validateBackupFile(backup);
  if (!backupReport.ok) {
    renderValidationReport(backupReport);
    setSaveStatus("Backup restore failed validation", "dirty");
    return null;
  }
  await flushPendingSegmentSaves();
  await reportImportProgress("Restoring backup stores", null, `${(backup.projects || []).length} project${(backup.projects || []).length === 1 ? "" : "s"}`);
  await importAllData(backup);
  await reportImportProgress("Rebuilding resource indexes");
  await rebuildAllTmIndexes();
  await rebuildAllTermIndexes();
  await reportImportProgress("Refreshing projects");
  editorSessionStore.replaceProject(null);
  editorSessionStore.replaceSegments([]);
  applicationNavigation.openProjects();
  applicationNavigation.clearSelection();
  await loadProjects(false);
  const restoredProjectIds = currentProjects().map((project) => project.id).filter(Boolean);
  if (state.workspaceStatus?.connected) {
    clearWorkspaceDirtyMarkers();
    markWorkspaceProjectsDirty(restoredProjectIds);
    renderWorkspaceStatus();
  }
  const restoreReport = {
    ok: true,
    errors: [],
    warnings: backupReport.warnings,
    preserved: [
      ...backupReport.preserved,
      `${(backup.projects || []).length} project${(backup.projects || []).length === 1 ? "" : "s"} restored.`,
      `${(backup.segments || []).length} segment${(backup.segments || []).length === 1 ? "" : "s"} restored.`
    ],
    simplified: [],
    skipped: [],
    risky: [
      ...backupReport.risky,
      ...(state.workspaceStatus?.connected && restoredProjectIds.length
        ? [`${restoredProjectIds.length} restored project package${restoredProjectIds.length === 1 ? "" : "s"} must be saved to the workspace folder.`]
        : [])
    ]
  };
  renderValidationReport(restoreReport);
  const restoreNotes = reportCount(restoreReport);
  setSaveStatus(restoreNotes ? `Backup restored with ${restoreNotes} validation note${restoreNotes === 1 ? "" : "s"}` : "Backup restored", restoreNotes ? "dirty" : "saved");
  return { backup, report: restoreReport };
}

async function restoreBackupFile(file) {
  await reportImportProgress("Reading backup file", file);
  return restoreBackupData(await parseJsonFile(file, "Backup file"));
}

async function chooseWorkspaceFolder() {
  if (!workspaceStorage?.isSupported()) {
    setSaveStatus("Folder storage is unavailable in this browser", "dirty");
    return;
  }
  state.workspaceStatus = await workspaceStorage.chooseWorkspaceFolder({ startIn: "documents" });
  const missingPackageCount = await markLocalProjectsMissingFromWorkspaceDirty();
  renderWorkspaceStatus();
  setSaveStatus(
    missingPackageCount
      ? `Workspace folder connected; ${missingPackageCount} local project package${missingPackageCount === 1 ? "" : "s"} need${missingPackageCount === 1 ? "s" : ""} to be saved`
      : "Workspace folder connected",
    missingPackageCount ? "dirty" : "saved"
  );
}

async function saveCurrentProjectPackageToWorkspace() {
  if (!currentProject()) return;
  await flushPendingSegmentSaves();
  if (!state.workspaceStatus?.connected) await chooseWorkspaceFolder();
  if (!state.workspaceStatus?.connected) return;
  const previewPackage = await buildProjectPackage(currentProject());
  assertValidProjectPackageForWrite(previewPackage, "save project package to workspace");
  const shouldSimulateActivityFailure = Boolean(LOOPCAT_TEST_BUILD && state[WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG]);
  const pendingActivityEvent = shouldSimulateActivityFailure
    ? null
    : draftProjectActivityEvent(currentProject(), "workspace-save", "Project package saved to workspace folder");
  const { pkg, result } = await saveProjectPackageToWorkspaceById(currentProject().id, {
    activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
  });
  let activityLogged = true;
  try {
    if (shouldSimulateActivityFailure) throw new Error("Simulated workspace save activity failure");
    if (pendingActivityEvent) {
      await bulkPut("activityEvents", [pendingActivityEvent]);
      editorSessionStore.replaceActivityEvents(await listActivityEvents(currentProject().id));
    }
    renderBackupReminder();
  } catch (activityError) {
    activityLogged = false;
    console.warn("Workspace save activity log failed.", activityError);
  }
  if (!activityLogged) markWorkspaceDirty(currentProject().id);
  state.workspaceStatus = await workspaceStorage.getStatus();
  renderValidationReport(pkg.validation);
  const validationReportWarning = result.validationReportSaved === false ? "; validation report sidecar failed" : "";
  setSaveStatus(
    activityLogged ? `Saved to ${result.packagePath}${validationReportWarning}` : `Saved to ${result.packagePath}; activity log failed${validationReportWarning}`,
    !activityLogged || result.validationReportSaved === false || reportCount(pkg.validation) ? "dirty" : "saved"
  );
}

async function saveProjectPackageToWorkspaceById(projectId, options = {}) {
  const project = knownProjectById(projectId) || (await listProjects()).find((item) => item.id === projectId);
  if (!project) throw new Error("Project package could not be found.");
  try {
    await flushPendingSegmentSaves(projectId);
    const pkg = await buildProjectPackage(project, null, options);
    assertValidProjectPackageForWrite(pkg, "save project package to workspace");
    const result = await workspaceStorage.saveProjectPackage(pkg);
    if (currentProject()?.id === projectId) {
      state.workspaceStatus = await workspaceStorage.getStatus();
    }
    clearWorkspaceDirty(projectId);
    return { pkg, result };
  } catch (error) {
    markWorkspaceDirty(projectId);
    throw error;
  }
}

async function autosaveDirtyWorkspacePackages() {
  if (state.workspaceAutosaving) return;
  if (!state.workspaceStatus?.connected || !state.workspaceDirtyProjectIds.size) return;
  state.workspaceAutosaving = true;
  try {
    const dirtyIds = workspaceDirtyIds();
    const failures = [];
    for (const projectId of dirtyIds) {
      try {
        await saveProjectPackageToWorkspaceById(projectId);
      } catch (error) {
        console.warn(error);
        failures.push(error);
      }
    }
    state.workspaceStatus = await workspaceStorage.getStatus();
    if (failures.length) {
      setSaveStatus(`${failures.length} background workspace save${failures.length === 1 ? "" : "s"} failed; other dirty packages were still attempted.`, "dirty");
    }
  } catch (error) {
    console.warn(error);
    setSaveStatus(error.message || "Background workspace save failed", "dirty");
  } finally {
    state.workspaceAutosaving = false;
  }
}

async function saveWorkspaceRecoveryPackages() {
  if (!workspaceRecoveryProjectIds().length) return;
  if (!state.workspaceStatus?.connected) await chooseWorkspaceFolder();
  if (!state.workspaceStatus?.connected) return;
  setSaveStatus("Saving recovered workspace packages...");
  await autosaveDirtyWorkspacePackages();
  renderWorkspaceRecoveryPanel();
}

function startWorkspaceAutosave() {
  if (state.workspaceAutosaveTimer) clearInterval(state.workspaceAutosaveTimer);
  state.workspaceAutosaveTimer = setInterval(autosaveDirtyWorkspacePackages, 5 * 60 * 1000);
}

async function maybeSaveProjectPackageFromSettings(shouldSaveToFolder = Boolean(els.saveProjectToFolderInput?.checked)) {
  if (!shouldSaveToFolder || !currentProject()) return false;
  if (!workspaceStorage?.isSupported()) return false;
  try {
    if (!state.workspaceStatus?.connected) await chooseWorkspaceFolder();
    if (!state.workspaceStatus?.connected) return false;
    await saveCurrentProjectPackageToWorkspace();
    return true;
  } catch (error) {
    if (error.name === "AbortError") {
      setSaveStatus("Project kept in browser cache", "saved");
      return false;
    }
    throw error;
  }
}

async function saveProjectFromDialog() {
  if (els.projectForm?.checkValidity && !els.projectForm.checkValidity()) {
    els.projectForm.reportValidity?.();
    setSaveStatus("Complete required project fields.", "dirty");
    return false;
  }
  const editing = projectDialogController?.getMode?.() === "edit" && Boolean(currentProject());
  const settings = collectProjectResourceSettings(editing ? currentProject() : null);
  const shouldSaveToFolder = Boolean(els.saveProjectToFolderInput?.checked);
  if (shouldSaveToFolder && workspaceStorage?.isSupported() && !state.workspaceStatus?.connected) {
    try {
      await chooseWorkspaceFolder();
    } catch (error) {
      if (error.name !== "AbortError") throw error;
      els.saveProjectToFolderInput.checked = false;
      renderProjectStorageStatus();
    }
  }
  if (editing && currentProject()) {
    const creatorName = rememberCreatorName(els.projectCreatorInput?.value || "");
    editorSessionStore.replaceProject(await updateProject({
      ...currentProject(),
      name: els.projectNameInput.value.trim(),
      creatorName,
      creatorOrigin: currentProject().creatorOrigin || "manual",
      domain: els.projectDomainInput.value.trim(),
      ...settings
    }));
    editorSessionStore.replaceProjects(currentProjects().map((project) => (project.id === currentProject().id ? currentProject() : project)));
    await refreshProjectTerms({ rerender: true });
    await refreshProjectSummaries();
    renderAll();
    await refreshSidebar();
    els.projectDialog.close();
    markWorkspaceDirty();
    let activityLogged = true;
    try {
      if (LOOPCAT_TEST_BUILD && els.projectForm[PROJECT_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated project settings activity failure");
      await logProjectActivity("project-settings", "Project resource settings updated", {
        mainTmName: mainTmName(),
        creatorName,
        tmCount: projectTmNames().length,
        termbaseCount: projectTermBaseNames().length
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Project settings activity log failed.", activityError);
      markWorkspaceDirty();
    }
    const savedToFolder = await maybeSaveProjectPackageFromSettings(shouldSaveToFolder);
    if (!savedToFolder) {
      setSaveStatus(
        activityLogged ? "Project settings saved" : "Project settings saved; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
    }
    return currentProject();
  }

  const creatorName = rememberCreatorName(els.projectCreatorInput?.value || "");
  const project = await createProject({
    name: els.projectNameInput.value,
    creatorName,
    creatorOrigin: "manual",
    domain: els.projectDomainInput.value,
    ...settings
  });
  els.projectForm.reset();
  setLanguageInputValue(els.sourceLangInput, "en");
  setLanguageInputValue(els.targetLangInput, "tr");
  els.newTmNameInput.value = "";
  els.newTermBaseNameInput.value = "";
  els.projectDialog.close();
  let activityLogged = true;
  try {
      if (LOOPCAT_TEST_BUILD && els.projectForm[CREATE_PROJECT_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated project creation activity failure");
    await recordActivityEvent({ projectId: project.id, type: "create-project", summary: "Project created" });
  } catch (activityError) {
    activityLogged = false;
    console.warn("Project creation activity log failed.", activityError);
  }
  markWorkspaceDirty(project.id);
  await loadProjects(false);
  await openProject(project.id);
  const savedToFolder = await maybeSaveProjectPackageFromSettings(shouldSaveToFolder);
  if (!savedToFolder) {
    setSaveStatus(activityLogged ? "Project created" : "Project created; activity log failed", activityLogged ? "saved" : "dirty");
  }
  return project;
}

async function syncWorkspaceFromFolder() {
  if (!workspaceStorage || !state.workspaceStatus?.connected) return;
  await flushPendingSegmentSaves();
  const refs = await workspaceStorage.listProjectPackages();
  const imported = [];
  const warnings = [];
  const addWorkspaceSyncWarning = (message) => {
    const redacted = redactSensitiveText(message || "").trim();
    if (redacted) warnings.push(redacted);
  };
  for (const ref of refs) {
    if (ref.id && state.workspaceDirtyProjectIds.has(ref.id)) {
      addWorkspaceSyncWarning(`${ref.name || ref.id}: local package has unsaved folder changes; save it before syncing from the workspace folder.`);
      continue;
    }
    try {
      const pkg = await workspaceStorage.readProjectPackage(ref);
      const packageProjectId = pkg?.project?.id;
      if (packageProjectId && state.workspaceDirtyProjectIds.has(packageProjectId)) {
        addWorkspaceSyncWarning(`${ref.name || packageProjectId}: local package has unsaved folder changes; save it before syncing from the workspace folder.`);
        continue;
      }
      const result = await importProjectPackageData(pkg, {
        sourceName: ref.packagePath,
        replaceExisting: true,
        open: false,
        sourceIsWorkspace: true,
        suppressAlert: true
      });
      if (result) {
        const importedName = result.pkg.project.name || result.pkg.project.id;
        imported.push(importedName);
        const noteCount = reportCount(result.validation);
        if (noteCount) addWorkspaceSyncWarning(`${importedName}: imported with ${noteCount} validation note${noteCount === 1 ? "" : "s"}.`);
      }
      else addWorkspaceSyncWarning(`${ref.name || ref.id}: package failed validation and was skipped.`);
    } catch (error) {
      addWorkspaceSyncWarning(`${ref.name || ref.id}: ${error.message}`);
    }
  }
  editorSessionStore.replaceProject(null);
  editorSessionStore.replaceSegments([]);
  applicationNavigation.openProjects();
  applicationNavigation.clearSelection();
  await loadProjects(false);
  state.workspaceStatus = await workspaceStorage.getStatus();
  const finalWarnings = Array.from(new Set([...(state.workspaceStatus.warnings || []), ...warnings].map((warning) => redactSensitiveText(warning || "").trim()).filter(Boolean)));
  renderWorkspaceStatus();
  renderValidationReport({
    ok: finalWarnings.length === 0,
    errors: [],
    warnings: finalWarnings,
    preserved: [`${imported.length} project package${imported.length === 1 ? "" : "s"} synced from the workspace folder.`],
    simplified: [],
    skipped: [],
    risky: []
  });
  setSaveStatus(finalWarnings.length ? "Workspace sync completed with warnings" : "Workspace synced", finalWarnings.length ? "dirty" : "saved");
}

async function exportWorkspaceBackupToFolder() {
  if (!workspaceStorage || !state.workspaceStatus?.connected) return;
  try {
    const { backup, validation } = await buildBackupExport();
    const ref = await workspaceStorage.exportFullBackup(backup);
    state.workspaceStatus = await workspaceStorage.getStatus();
    renderWorkspaceStatus();
    renderValidationReport(validation);
    const manifestWarning = ref.manifestSaved === false ? "; manifest update failed" : "";
    setSaveStatus(`Workspace backup saved: ${ref.path}${manifestWarning}`, ref.manifestSaved === false || reportCount(validation) ? "dirty" : "saved");
  } catch (error) {
    const message = error.message || "Workspace backup failed.";
    renderValidationReport(error.validation || portableFileErrorReport(message));
    setSaveStatus(message, "dirty");
    throw error;
  }
}

async function repairWorkspaceLinks() {
  if (!workspaceStorage || !state.workspaceStatus?.connected) return;
  const repair = await workspaceStorage.repairWorkspaceManifest();
  state.workspaceStatus = await workspaceStorage.getStatus();
  const [tmEntries, terms] = await Promise.all([listTmEntries(), getAll("terms")]);
  const report = await workspaceStorage.buildHealthReport({
    projects: currentProjects(),
    tmEntries,
    terms,
    dirtyProjectIds: workspaceDirtyIds()
  });
  report.preserved.unshift(`${repair.recoveredProjectCount} project package${repair.recoveredProjectCount === 1 ? "" : "s"} verified in the workspace folder.`);
  renderValidationReport(report);
  renderWorkspaceStatus();
  setSaveStatus(report.ok ? "Workspace health checked" : "Workspace needs attention", report.ok ? "saved" : "dirty");
}

function countBy(items, keyFn) {
  return (items || []).reduce((counts, item) => {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function reportLocale() {
  return currentUiLocale();
}

function reportDir() {
  return uiI18n?.localeDir?.(reportLocale()) || "ltr";
}

function reportText(text, values = {}) {
  return uiSource(text, values);
}

function reportHtml(text, values = {}) {
  return escapeHtml(reportText(text, values));
}

function reportListHtml(items, emptyText = "None") {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="muted">${reportHtml(emptyText)}</p>`;
}

function reportCountTableHtml(counts, emptyText = "None") {
  const entries = Object.entries(counts || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return `<p class="muted">${reportHtml(emptyText)}</p>`;
  return `<table><tbody>${entries.map(([label, count]) => `<tr><th>${escapeHtml(reportText(label))}</th><td>${count}</td></tr>`).join("")}</tbody></table>`;
}

function qualityCategoryCountTableHtml(counts, emptyText = "None") {
  const entries = Object.entries(counts || {})
    .sort(([a], [b]) => qualityCategoryName(a).localeCompare(qualityCategoryName(b)));
  if (!entries.length) return `<p class="muted">${reportHtml(emptyText)}</p>`;
  return `<table><tbody>${entries.map(([label, count]) => `<tr><th>${escapeHtml(qualityCategoryName(label))}</th><td>${count}</td></tr>`).join("")}</tbody></table>`;
}

function reportSafeLabel(value, fallback = "") {
  return redactSensitiveText(value || "").trim() || fallback;
}

function reportQaChecksTableHtml(checks = []) {
  if (!checks.length) return `<p class="muted">${reportHtml("No QA issues found.")}</p>`;
  const rows = checks.slice(0, 50).map((check) => `<tr>
    <td>#${escapeHtml(check.label || "")}</td>
    <td>${escapeHtml(reportText(check.type || ""))}</td>
    <td>${escapeHtml(reportText(check.severity || "info"))}</td>
    <td>${escapeHtml(qaCheckMessage(check))}</td>
    <td>${escapeHtml(qaCheckFixHint(check) || reportText("None"))}</td>
  </tr>`).join("");
  return `<table>
    <thead><tr><th>${reportHtml("Segment")}</th><th>${reportHtml("Type")}</th><th>${reportHtml("Severity")}</th><th>${reportHtml("Message")}</th><th>${reportHtml("Recommendation")}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function buildProjectReportData() {
  await flushPendingSegmentSaves();
  const tmNames = new Set(projectTmNames());
  const [tmEntries, terms, activityEvents] = await Promise.all([
    getAllByIndex("tmEntries", "languagePair", `${currentProject().sourceLang}::${currentProject().targetLang}`),
    listTerms({
      sourceLang: currentProject().sourceLang,
      targetLang: currentProject().targetLang,
      termBaseNames: projectTermBaseNames()
    }),
    listActivityEvents(currentProject().id)
  ]);
  const scopedTm = tmEntries.filter((entry) => tmNames.has(entry.tmName));
  const reportActivityEvents = sanitizePortableValue(activityEvents, "activityEvents");
  const validation = validateExportReadiness({ project: currentProject(), segments: currentSegments(), format: "project-report", terms });
  const analysis = analyzeProject(currentProject(), currentSegments(), scopedTm);
  const qaSegments = currentSegments().map((segment) => ({
    ...segment,
    tags: segmentTags(segment)
  }));
  const fallback = () => Promise.resolve(runQaChecks(currentSegments(), terms, { missingTags }));
  const qaChecks = workerClient?.runQaChecks
    ? await workerClient.runQaChecks({ segments: qaSegments, terms, fallback })
    : await fallback();
  const qualityPassport = buildQualityPassportData({
    project: currentProject(),
    segments: currentSegments(),
    qaChecks,
    validation,
    analysis,
    terms,
    activityEvents: reportActivityEvents,
    tmEntries: scopedTm,
    tmEntryCount: scopedTm.length,
    termCount: terms.length,
    profile: currentProject().qualityProfile
  });
  return {
    generatedAt: new Date().toISOString(),
    project: currentProject(),
    resources: projectResourceSummary(currentProject()),
    analysis,
    validation,
    qualityPassport,
    qaChecks,
    qaBySeverity: countBy(qaChecks, (check) => check.severity),
    qaByType: countBy(qaChecks, (check) => check.type),
    reviewByState: countBy(currentSegments().filter((segment) => segment.reviewState), (segment) => segment.reviewState),
    activityEvents: reportActivityEvents,
    activityByType: countBy(reportActivityEvents, (event) => event.type),
    tmEntryCount: scopedTm.length,
    termCount: terms.length,
    forbiddenTermCount: terms.filter((term) => term.isForbidden).length,
    revisionCount: currentSegments().reduce((sum, segment) => sum + (Array.isArray(segment.targetHistory) ? segment.targetHistory.length : 0), 0),
    terms: terms
      .map((term) => ({
        sourceTerm: term.sourceTerm || "",
        targetTerm: term.targetTerm || "",
        termBaseName: term.termBaseName || "",
        notes: redactSensitiveText(term.notes || "").trim(),
        isForbidden: Boolean(term.isForbidden)
      }))
      .sort((a, b) => a.termBaseName.localeCompare(b.termBaseName) || a.sourceTerm.localeCompare(b.sourceTerm))
  };
}

function projectReportHtml(data, options = {}) {
  const anonymized = Boolean(options.anonymized);
  const project = data.project;
  const totals = data.analysis.totals;
  const ai = data.analysis.ai || { drafts: 0, suggestionSegments: 0, suggestions: 0, reviewRisk: 0, highRisk: 0, risk: {} };
  const quality = data.qualityPassport || {};
  const qualityProfile = defaultQualityProfile(quality.profile || project.qualityProfile);
  const qualityRiskQueue = quality.riskQueue || { totalRiskItems: 0, highRiskCount: 0, averageScore: 0, byLevel: {} };
  const qualityEffort = quality.postEditingEffort || { label: "No segments", score: 0, drivers: [] };
  const validation = sanitizeValidationReportForDisplay(data.validation) || { errors: [], risky: [], warnings: [], preserved: [], simplified: [], skipped: [], ok: true };
  const files = anonymized
    ? data.analysis.files.map((file, index) => ({ ...file, name: `File ${index + 1}` }))
    : data.analysis.files.map((file) => ({ ...file, name: reportSafeLabel(file.name, "File") }));
  const resources = anonymized
    ? data.resources
    : {
      ...data.resources,
      mainTm: reportSafeLabel(data.resources.mainTm, "None"),
      tmNames: (data.resources.tmNames || []).map((name) => reportSafeLabel(name)).filter(Boolean),
      tbNames: (data.resources.tbNames || []).map((name) => reportSafeLabel(name)).filter(Boolean)
    };
  const validationCounts = {
    errors: validation.errors.length,
    risk: validation.risky.length,
    warnings: validation.warnings.length,
    notes: validation.preserved.length + validation.simplified.length + validation.skipped.length
  };
  const rows = (values, cells) => values.map((item) => `<tr>${cells(item).join("")}</tr>`).join("");
  const projectTitle = anonymized ? reportText("Anonymized project") : reportSafeLabel(project.name, reportText("Project"));
  const reportTitle = anonymized ? reportText("LoopCAT Anonymized Project Report") : reportText("LoopCAT Project Report");
  return `<!doctype html>
<html lang="${escapeHtml(reportLocale())}" dir="${escapeHtml(reportDir())}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(projectTitle)} - ${escapeHtml(reportTitle)}</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2937; background: #f6f8fa; }
      body { margin: 0; padding: 32px; }
      main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
      header { padding: 28px 32px; background: #202936; color: #fff; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 26px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-bottom: 12px; }
      section { padding: 24px 32px; border-top: 1px solid #e5eaf0; }
      .meta, .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e0e7; border-radius: 8px; padding: 14px; background: #fbfcfd; }
      .card strong { display: block; font-size: 22px; margin-bottom: 4px; }
      .muted { color: #657386; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5eaf0; padding: 9px 8px; text-align: left; vertical-align: top; }
      th { color: #405064; background: #f4f7f9; }
      ul { margin: 0; padding-left: 20px; }
      footer { padding: 18px 32px; color: #657386; font-size: 12px; border-top: 1px solid #e5eaf0; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(reportTitle)}</h1>
        <p>${escapeHtml(projectTitle)} - ${escapeHtml(languagePairDisplay(project.sourceLang, project.targetLang))}</p>
        <p class="muted">${reportHtml("Generated {date}", { date: formatDateTime(data.generatedAt) })}</p>
      </header>
      <section>
        <h2>${reportHtml("Project")}</h2>
        <div class="meta">
          <div class="card"><strong>${escapeHtml(redactSensitiveText(project.domain || "").trim() || reportText("Not set"))}</strong><span>${reportHtml("Domain")}</span></div>
          <div class="card"><strong>${totals.confirmedPercent}%</strong><span>${reportHtml("Confirmed")}</span></div>
          <div class="card"><strong>${totals.words}</strong><span>${reportHtml("Source words")}</span></div>
          <div class="card"><strong>${data.qaChecks.length}</strong><span>${reportHtml("QA issues")}</span></div>
        </div>
      </section>
      <section>
        <h2>${reportHtml("Progress")}</h2>
        <div class="cards">
          <div class="card"><strong>${totals.files}</strong><span>${reportHtml("Files")}</span></div>
          <div class="card"><strong>${totals.segments}</strong><span>${reportHtml("Segments")}</span></div>
          <div class="card"><strong>${totals.confirmed}</strong><span>${reportHtml("Confirmed")}</span></div>
          <div class="card"><strong>${totals.untranslated}</strong><span>${reportHtml("Untranslated")}</span></div>
          <div class="card"><strong>${totals.repetitions}</strong><span>${reportHtml("Repetitions")}</span></div>
          <div class="card"><strong>${totals.comments}</strong><span>${reportHtml("Review notes")}</span></div>
          <div class="card"><strong>${data.revisionCount}</strong><span>${reportHtml("Target revisions")}</span></div>
        </div>
      </section>
      <section>
        <h2>${reportHtml("Quality Passport")}</h2>
        <div class="cards">
          <div class="card"><strong>${quality.confidenceScore ?? 0}</strong><span>${reportHtml("Quality score")}</span></div>
          <div class="card"><strong>${escapeHtml(reportText(qualityEffort.label))}</strong><span>${reportHtml("Post-editing effort")}</span></div>
          <div class="card"><strong>${qualityRiskQueue.totalRiskItems}</strong><span>${reportHtml("Risk items")}</span></div>
          <div class="card"><strong>${qualityRiskQueue.highRiskCount}</strong><span>${reportHtml("High risk")}</span></div>
        </div>
        <table>
          <tbody>
            <tr><th>${reportHtml("Standard")}</th><td>${escapeHtml(qualityLabel(qualityProfile.standard))}</td></tr>
            <tr><th>${reportHtml("Review depth")}</th><td>${escapeHtml(qualityLabel(qualityProfile.reviewDepth))}</td></tr>
            <tr><th>${reportHtml("Risk tolerance")}</th><td>${escapeHtml(qualityLabel(qualityProfile.riskTolerance))}</td></tr>
            <tr><th>${reportHtml("Terminology")}</th><td>${escapeHtml(qualityLabel(qualityProfile.terminologyStrictness))}</td></tr>
            <tr><th>${reportHtml("AI disclosure")}</th><td>${escapeHtml(qualityLabel(qualityProfile.aiDisclosure))}</td></tr>
          </tbody>
        </table>
        <h3>${reportHtml("Risk levels")}</h3>
        ${reportCountTableHtml(qualityRiskQueue.byLevel || {}, "No unresolved quality risks.")}
        <h3>${reportHtml("Quality categories")}</h3>
        ${qualityCategoryCountTableHtml(qualityRiskQueue.byCategory || {}, "No categorized quality risks.")}
      </section>
      <section>
        <h2>${reportHtml("AI Triage")}</h2>
        <div class="cards">
          <div class="card"><strong>${ai.drafts || 0}</strong><span>${reportHtml("AI initiated")}</span></div>
          <div class="card"><strong>${ai.suggestionSegments || 0}</strong><span>${reportHtml("Segments with AI suggestions")}</span></div>
          <div class="card"><strong>${ai.suggestions || 0}</strong><span>${reportHtml("AI suggestions")}</span></div>
          <div class="card"><strong>${ai.reviewRisk || 0}</strong><span>${reportHtml("AI review risk")}</span></div>
          <div class="card"><strong>${ai.highRisk || 0}</strong><span>${reportHtml("High AI risk")}</span></div>
        </div>
        <h3>${reportHtml("AI review risk levels")}</h3>
        ${reportCountTableHtml(ai.risk || {}, "No AI review risk recorded.")}
      </section>
      <section>
        <h2>${reportHtml("Files")}</h2>
        <table>
          <thead><tr><th>${reportHtml("File")}</th><th>${reportHtml("Type")}</th><th>${reportHtml("Segments")}</th><th>${reportHtml("Words")}</th><th>${reportHtml("Confirmed")}</th><th>${reportHtml("Untranslated")}</th></tr></thead>
          <tbody>${rows(files, (file) => [
            `<td>${escapeHtml(file.name)}</td>`,
            `<td>${escapeHtml(file.type)}</td>`,
            `<td>${file.segments}</td>`,
            `<td>${file.words}</td>`,
            `<td>${file.confirmed}</td>`,
            `<td>${file.untranslated}</td>`
          ])}</tbody>
        </table>
      </section>
      <section>
        <h2>${reportHtml("Resources")}</h2>
        <div class="cards">
          <div class="card"><strong>${escapeHtml(anonymized ? reportText("Redacted") : resources.mainTm)}</strong><span>${reportHtml("Main TM")}</span></div>
          <div class="card"><strong>${data.tmEntryCount}</strong><span>${reportHtml("Linked TM units")}</span></div>
          <div class="card"><strong>${data.termCount}</strong><span>${reportHtml("Linked terms")}</span></div>
          <div class="card"><strong>${data.forbiddenTermCount}</strong><span>${reportHtml("Forbidden terms")}</span></div>
        </div>
        <p class="muted">${anonymized ? reportHtml("Resource names are redacted.") : `${reportHtml("TMs")}: ${escapeHtml(resources.tmNames.join(", ") || reportText("None"))}`}</p>
        ${anonymized ? "" : `<p class="muted">${reportHtml("TBs")}: ${escapeHtml(resources.tbNames.join(", ") || reportText("None"))}</p>`}
      </section>
      <section>
        <h2>${reportHtml("Terminology")}</h2>
        ${anonymized ? `<p class="muted">${reportHtml("Terminology text is omitted from this anonymized report. Counts are preserved in Resources.")}</p>` : data.terms.length ? `<table>
          <thead><tr><th>${reportHtml("Source term")}</th><th>${reportHtml("Target term")}</th><th>${reportHtml("Status")}</th><th>${reportHtml("Termbase")}</th><th>${reportHtml("Notes")}</th></tr></thead>
          <tbody>${rows(data.terms, (term) => [
            `<td>${escapeHtml(term.sourceTerm)}</td>`,
            `<td>${escapeHtml(term.targetTerm)}</td>`,
            `<td>${reportHtml(term.isForbidden ? "Forbidden" : "Approved")}</td>`,
            `<td>${escapeHtml(reportSafeLabel(term.termBaseName))}</td>`,
            `<td>${escapeHtml(term.notes)}</td>`
          ])}</tbody>
        </table>` : `<p class="muted">${reportHtml("No linked terms.")}</p>`}
      </section>
      <section>
        <h2>${reportHtml("QA Summary")}</h2>
        <h3>${reportHtml("By severity")}</h3>
        ${reportCountTableHtml(data.qaBySeverity)}
        <h3>${reportHtml("By type")}</h3>
        ${reportCountTableHtml(data.qaByType)}
        ${anonymized ? "" : `<h3>${reportHtml("QA details")}</h3>${reportQaChecksTableHtml(data.qaChecks)}`}
      </section>
      <section>
        <h2>${reportHtml("Export Readiness")}</h2>
        ${reportCountTableHtml(validationCounts)}
        <h3>${reportHtml("Risk and warnings")}</h3>
        ${reportListHtml([...validation.risky, ...validation.warnings], "No risk or warning notes.")}
      </section>
      <section>
        <h2>${reportHtml("Recent Activity")}</h2>
        ${anonymized ? reportCountTableHtml(data.activityByType || {}, "No activity recorded.") : data.activityEvents.length ? `<table><thead><tr><th>${reportHtml("Time")}</th><th>${reportHtml("Type")}</th><th>${reportHtml("Summary")}</th></tr></thead><tbody>${rows(data.activityEvents.slice(0, 10), (event) => [
          `<td>${escapeHtml(formatDateTime(event.createdAt))}</td>`,
          `<td>${escapeHtml(reportText(event.type))}</td>`,
          `<td>${escapeHtml(event.summary)}</td>`
        ])}</tbody></table>` : `<p class="muted">${reportHtml("No activity recorded.")}</p>`}
      </section>
      <footer>
        ${anonymized ? reportHtml("This anonymized report contains counts without project names, file names, resource names, terminology text, activity summaries, or segment text.") : reportHtml("This report contains project metadata, counts, terminology, QA totals, and activity summaries. Segment text is not included.")}
      </footer>
    </main>
  </body>
</html>`;
}

function qualityPassportHtml(data) {
  const project = data.project;
  const passport = data.qualityPassport || {};
  const profile = defaultQualityProfile(passport.profile || project.qualityProfile);
  const riskQueue = passport.riskQueue || { items: [], byLevel: {}, totalRiskItems: 0, highRiskCount: 0, averageScore: 0 };
  const validation = sanitizeValidationReportForDisplay(data.validation) || { errors: [], risky: [], warnings: [], preserved: [], simplified: [], skipped: [], ok: true };
  const effort = passport.postEditingEffort || { label: "No segments", score: 0, drivers: [] };
  const rows = (values, cells) => values.map((item) => `<tr>${cells(item).join("")}</tr>`).join("");
  const projectTitle = reportSafeLabel(project.name, reportText("Project"));
  const topRiskItems = (riskQueue.items || []).slice(0, 20);
  return `<!doctype html>
<html lang="${escapeHtml(reportLocale())}" dir="${escapeHtml(reportDir())}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(projectTitle)} - ${reportHtml("LoopCAT Quality Passport")}</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2937; background: #f6f8fa; }
      body { margin: 0; padding: 32px; }
      main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
      header { padding: 28px 32px; background: #202936; color: #fff; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 26px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-bottom: 12px; }
      section { padding: 24px 32px; border-top: 1px solid #e5eaf0; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e0e7; border-radius: 8px; padding: 14px; background: #fbfcfd; }
      .card strong { display: block; font-size: 22px; margin-bottom: 4px; }
      .muted { color: #657386; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5eaf0; padding: 9px 8px; text-align: left; vertical-align: top; }
      th { color: #405064; background: #f4f7f9; }
      ul { margin: 0; padding-left: 20px; }
      footer { padding: 18px 32px; color: #657386; font-size: 12px; border-top: 1px solid #e5eaf0; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${reportHtml("LoopCAT Quality Passport")}</h1>
        <p>${escapeHtml(projectTitle)} - ${escapeHtml(languagePairDisplay(project.sourceLang, project.targetLang))}</p>
        <p class="muted">${reportHtml("Generated {date}", { date: formatDateTime(passport.generatedAt || data.generatedAt) })}</p>
      </header>
      <section>
        <h2>${reportHtml("Quality Contract")}</h2>
        <table>
          <tbody>
            <tr><th>${reportHtml("Standard")}</th><td>${escapeHtml(qualityLabel(profile.standard))}</td></tr>
            <tr><th>${reportHtml("Review depth")}</th><td>${escapeHtml(qualityLabel(profile.reviewDepth))}</td></tr>
            <tr><th>${reportHtml("Risk tolerance")}</th><td>${escapeHtml(qualityLabel(profile.riskTolerance))}</td></tr>
            <tr><th>${reportHtml("Terminology")}</th><td>${escapeHtml(qualityLabel(profile.terminologyStrictness))}</td></tr>
            <tr><th>${reportHtml("AI disclosure")}</th><td>${escapeHtml(qualityLabel(profile.aiDisclosure))}</td></tr>
            <tr><th>${reportHtml("Audience")}</th><td>${escapeHtml(reportSafeLabel(profile.audience, reportText("Not set")))}</td></tr>
            <tr><th>${reportHtml("Tone")}</th><td>${escapeHtml(reportSafeLabel(profile.tone, reportText("Neutral")))}</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>${reportHtml("Delivery Evidence")}</h2>
        <div class="cards">
          <div class="card"><strong>${passport.confidenceScore ?? 0}</strong><span>${reportHtml("Quality score")}</span></div>
          <div class="card"><strong>${escapeHtml(reportText(effort.label))}</strong><span>${reportHtml("Post-editing effort")}</span></div>
          <div class="card"><strong>${riskQueue.totalRiskItems}</strong><span>${reportHtml("Risk items")}</span></div>
          <div class="card"><strong>${riskQueue.highRiskCount}</strong><span>${reportHtml("High risk")}</span></div>
          <div class="card"><strong>${data.qaChecks.length}</strong><span>${reportHtml("QA issues")}</span></div>
          <div class="card"><strong>${data.analysis.totals.confirmedPercent}%</strong><span>${reportHtml("Confirmed")}</span></div>
        </div>
      </section>
      <section>
        <h2>${reportHtml("Risk Queue")}</h2>
        <h3>${reportHtml("By level")}</h3>
        ${reportCountTableHtml(riskQueue.byLevel || {}, "No unresolved quality risks.")}
        <h3>${reportHtml("Quality Categories")}</h3>
        ${qualityCategoryCountTableHtml(riskQueue.byCategory || {}, "No categorized quality risks.")}
        <h3>${reportHtml("Top risks")}</h3>
        ${topRiskItems.length ? `<table>
          <thead><tr><th>${reportHtml("Segment")}</th><th>${reportHtml("File")}</th><th>${reportHtml("Category")}</th><th>${reportHtml("Risk")}</th><th>${reportHtml("Signals")}</th></tr></thead>
          <tbody>${rows(topRiskItems, (item) => [
            `<td>#${escapeHtml(item.label)}</td>`,
            `<td>${escapeHtml(reportSafeLabel(item.documentName, reportText("Document")))}</td>`,
            `<td>${escapeHtml(qualityCategoryName(item.category))}</td>`,
            `<td>${escapeHtml(qualityRiskLevelLabel(item.level))} ${item.score}</td>`,
            `<td>${escapeHtml(item.reasons.map((reason) => reason.label).slice(0, 3).join(" "))}</td>`
          ])}</tbody>
        </table>` : `<p class="muted">${reportHtml("No unresolved quality risks.")}</p>`}
      </section>
      <section>
        <h2>${reportHtml("QA Evidence")}</h2>
        <h3>${reportHtml("By severity")}</h3>
        ${reportCountTableHtml(data.qaBySeverity)}
        <h3>${reportHtml("By type")}</h3>
        ${reportCountTableHtml(data.qaByType)}
        <h3>${reportHtml("QA details")}</h3>
        ${reportQaChecksTableHtml(data.qaChecks)}
      </section>
      <section>
        <h2>${reportHtml("Review And AI Evidence")}</h2>
        <div class="cards">
          <div class="card"><strong>${data.analysis.totals.comments}</strong><span>${reportHtml("Review notes")}</span></div>
          <div class="card"><strong>${passport.ai?.drafts || 0}</strong><span>${reportHtml("AI initiated")}</span></div>
          <div class="card"><strong>${passport.ai?.reviewRisk || 0}</strong><span>${reportHtml("AI review risk")}</span></div>
          <div class="card"><strong>${passport.ai?.highRisk || 0}</strong><span>${reportHtml("High AI risk")}</span></div>
          <div class="card"><strong>${data.tmEntryCount}</strong><span>${reportHtml("Linked TM units")}</span></div>
          <div class="card"><strong>${data.termCount}</strong><span>${reportHtml("Linked terms")}</span></div>
        </div>
        <h3>${reportHtml("Review states")}</h3>
        ${reportCountTableHtml(passport.reviewByState || {}, "No review states recorded.")}
      </section>
      <section>
        <h2>${reportHtml("Export Readiness")}</h2>
        <div class="cards">
          <div class="card"><strong>${validation.errors.length}</strong><span>${reportHtml("Errors")}</span></div>
          <div class="card"><strong>${validation.risky.length}</strong><span>${reportHtml("Risks")}</span></div>
          <div class="card"><strong>${validation.warnings.length}</strong><span>${reportHtml("Warnings")}</span></div>
        </div>
        ${reportListHtml([...validation.errors, ...validation.risky, ...validation.warnings], "No export-readiness findings.")}
      </section>
      <section>
        <h2>${reportHtml("Effort Drivers")}</h2>
        ${reportListHtml(effort.drivers || [], "No major post-editing drivers.")}
      </section>
      <footer>
        ${reportHtml("This passport contains quality settings, counts, risk signals, and readiness evidence. Segment text is not included.")}
      </footer>
    </main>
  </body>
</html>`;
}

async function exportQualityPassport() {
  if (!currentProject()) return;
  try {
    const data = await buildProjectReportData();
    editorSessionStore.replaceQaChecks(data.qaChecks);
    state.qaFilter = "";
    editorSessionStore.replaceQualityRiskQueue(data.qualityPassport.riskQueue);
    renderQaResults();
    renderQualityWorkbench();
    renderValidationReport(data.validation);
    const base = fileSafeName(currentProject().name || "project");
    download(`${base}_quality-passport.html`, finalizeReportDocument(qualityPassportHtml(data)), "text/html");
    const activityLogged = await logOptionalProjectActivity("export", "Quality Passport exported", {
      segmentCount: data.analysis.totals.segments,
      wordCount: data.analysis.totals.words,
      qaIssueCount: data.qaChecks.length,
      qualityScore: data.qualityPassport.confidenceScore,
      highRiskCount: data.qualityPassport.riskQueue.highRiskCount,
      validationNoteCount: reportCount(data.validation)
    }, "Quality Passport export");
    const hasNotes = data.qaChecks.length || data.qualityPassport.riskQueue.highRiskCount || reportCount(data.validation);
    setSaveStatus(appendActivityWarning(hasNotes ? "Quality Passport exported with notes" : "Quality Passport exported", activityLogged), exportStatusMode(hasNotes ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Quality Passport export failed", "dirty");
  }
}

async function exportProjectReport(options = {}) {
  if (!currentProject()) return;
  try {
    const anonymized = Boolean(options.anonymized);
    const data = await buildProjectReportData();
    editorSessionStore.replaceQaChecks(data.qaChecks);
    state.qaFilter = "";
    renderQaResults();
    renderValidationReport(data.validation);
    const base = fileSafeName(currentProject().name || "project");
    download(
      `${base}_${anonymized ? "anonymized-" : ""}project-report.html`,
      finalizeReportDocument(projectReportHtml(data, { anonymized })),
      "text/html"
    );
    const label = anonymized ? "Anonymized report" : "Project report";
    const activityLogged = await logOptionalProjectActivity("export", anonymized ? "Anonymized project report exported" : "Project report exported", {
      segmentCount: data.analysis.totals.segments,
      wordCount: data.analysis.totals.words,
      qaIssueCount: data.qaChecks.length,
      validationNoteCount: reportCount(data.validation),
      anonymized
    }, `${label} export`);
    const message = data.qaChecks.length || reportCount(data.validation) ? `${label} exported with notes` : `${label} exported`;
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(data.qaChecks.length || reportCount(data.validation) ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Project report export failed", "dirty");
  }
}

async function exportTargetText() {
  if (!currentProject()) return;
  try {
    await flushPendingSegmentSaves();
    const { documentInfo, segments } = deliveryExportScope();
    const exportPlan = planDeliveryExport({ format: "txt", documentInfo, segments });
    const report = validateExportReadiness({ project: currentProject(), segments, format: "txt", terms: await projectTermsForValidation(), exportPlan });
    addScopedExportReportNote(report, documentInfo, "Target TXT");
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, currentProject().name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const content = exportPlan.segments
      .map((segment) => segment.target.trim())
      .join("\n\n");
    const base = scopedExportBaseName(currentProject().name || "project", documentInfo);
    download(`${base}_${currentProject().targetLang}.txt`, content, "text/plain");
    const activityLogged = await logOptionalProjectActivity("export", "Target TXT exported", {
      documentId: documentInfo?.id || "",
      fileName: documentInfo?.name || "",
      segmentCount: segments.length,
      ...exportPlanActivityDetail(exportPlan)
    }, "Target TXT export");
    const message = incompleteExportMessage("Target TXT exported", exportPlan);
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(exportPlanHasWarnings(exportPlan) ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Target TXT export failed", "dirty");
  }
}

async function exportTargetDocx() {
  if (!currentProject()) return;
  try {
    await flushPendingSegmentSaves();
    const documentInfo = exportDocumentForTypes(new Set(["docx"]), "The selected file is not a DOCX document.", "Select a DOCX document to export.");
    if (!documentInfo) return;
    const segments = currentSegments().filter((segment) => segment.documentId === documentInfo.id);
    const exportPlan = planDeliveryExport({ format: "docx", documentInfo, segments });
    const report = validateExportReadiness({ project: currentProject(), segments, documentInfo, format: "docx", terms: await projectTermsForValidation(), exportPlan });
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, currentProject().name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const docxStructure = currentProject().docxStructures?.[documentInfo.id] || currentProject().docxStructure;
    const base = fileSafeName(currentProject().name || "project");
    const bytes = await buildTargetDocx({ ...currentProject(), docxStructure }, exportPlan.segments);
    download(`${base}_${fileSafeName(documentInfo.name)}_${currentProject().targetLang}.docx`, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const activityLogged = await logOptionalProjectActivity("export", "Target DOCX exported", {
      documentId: documentInfo.id,
      fileName: documentInfo.name,
      segmentCount: segments.length,
      ...exportPlanActivityDetail(exportPlan)
    }, "Target DOCX export");
    const message = incompleteExportMessage("DOCX exported", exportPlan);
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(exportPlanHasWarnings(exportPlan) ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "DOCX export failed", "dirty");
  }
}

async function exportBilingualDocx() {
  if (!currentProject()) return;
  try {
    await flushPendingSegmentSaves();
    const terms = await projectTermsForValidation();
    const report = validateExportReadiness({ project: currentProject(), segments: currentSegments(), format: "bilingual-docx", terms });
    renderValidationReport(report);
    if (!canRunBilingualDocxExport(report)) return;
    const qaSegments = currentSegments().map((segment) => ({
      ...segment,
      tags: segmentTags(segment)
    }));
    const fallback = () => Promise.resolve(runQaChecks(currentSegments(), terms, { missingTags }));
    const qaChecks = workerClient?.runQaChecks
      ? await workerClient.runQaChecks({ segments: qaSegments, terms, fallback })
      : await fallback();
    editorSessionStore.replaceQaChecks(qaChecks);
    state.qaFilter = "";
    renderQaResults();
    const base = fileSafeName(currentProject().name || "project");
    const bytes = buildBilingualDocx(currentProject(), currentSegments(), { qaChecks });
    download(`${base}_bilingual.docx`, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const activityLogged = await logOptionalProjectActivity("export", "Bilingual DOCX exported", { segmentCount: currentSegments().length, qaIssueCount: qaChecks.length, validationNoteCount: reportCount(report) }, "Bilingual DOCX export");
    const message = reportCount(report) || qaChecks.length ? "Bilingual DOCX exported with notes" : "Bilingual DOCX exported";
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(reportCount(report) || qaChecks.length ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Bilingual DOCX export failed", "dirty");
  }
}

async function exportLocalization() {
  try {
    if (!currentProject()) return;
    await flushPendingSegmentSaves();
    const documentInfo = exportDocumentForTypes(
      LOCALIZATION_EXPORT_TYPES,
      "The selected file is not exportable from Other formats.",
      "Select a document from Other formats to export."
    );
    if (!documentInfo) return;
    const documentType = projectDocumentType(documentInfo);
    const exportDocumentInfo = { ...documentInfo, type: documentType };
    const segments = currentSegments().filter((segment) => segment.documentId === documentInfo.id);
    const structure = currentProject().localizationStructures?.[documentInfo.id];
    const exportPlan = planDeliveryExport({ format: documentType, documentInfo: exportDocumentInfo, structure, segments });
    const report = validateExportReadiness({
      project: currentProject(),
      segments,
      documentInfo: exportDocumentInfo,
      format: documentType,
      terms: await projectTermsForValidation(),
      exportPlan,
      structure
    });
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, exportDocumentInfo, currentProject().name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const content = XLIFF_DOCUMENT_TYPES.has(documentType)
      ? buildTargetXliff(currentProject(), exportPlan.segments, structure)
      : await buildLocalizationFile(documentType, exportPlan.segments, structure);
    const ext = documentType === "yml" ? "yaml" : documentType === "markdown" ? "md" : documentType;
    const type = localizationDownloadMimeType(ext, structure);
    download(`${fileSafeName(documentInfo.name)}_${currentProject().targetLang}.${ext}`, content, type);
    const activityLogged = await logOptionalProjectActivity("export", "Localization file exported", {
      documentId: documentInfo.id,
      documentType,
      segmentCount: segments.length,
      ...exportPlanActivityDetail(exportPlan)
    }, "Localization export");
    const message = incompleteExportMessage("Localization file exported", exportPlan);
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(exportPlanHasWarnings(exportPlan) ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Localization export failed", "dirty");
  }
}

async function exportXliff(version = "1.2") {
  if (!currentProject()) return;
  try {
    await flushPendingSegmentSaves();
    const { documentInfo, segments } = deliveryExportScope();
    const exportPlan = planDeliveryExport({ format: "xliff", documentInfo, segments });
    const report = validateExportReadiness({ project: currentProject(), segments, format: "xliff", terms: await projectTermsForValidation(), exportPlan });
    addScopedExportReportNote(report, documentInfo, "XLIFF");
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, currentProject().name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const base = scopedExportBaseName(currentProject().name || "project", documentInfo);
    const exportProject = documentInfo ? { ...currentProject(), sourceFileName: documentInfo.name } : currentProject();
    const isXliff22 = version === "2.2";
    const content = isXliff22 ? buildXliff22(exportProject, exportPlan.segments) : buildXliff(exportProject, exportPlan.segments);
    const label = isXliff22 ? "XLIFF 2.2" : "XLIFF";
    const exportedMessage = isXliff22 ? "XLIFF 2.2 exported" : "XLIFF exported";
    download(`${base}_${currentProject().sourceLang}-${currentProject().targetLang}.xlf`, content, xliffMimeType(version));
    const activityLogged = await logOptionalProjectActivity("export", exportedMessage, {
      documentId: documentInfo?.id || "",
      fileName: documentInfo?.name || "",
      segmentCount: segments.length,
      xliffVersion: version,
      ...exportPlanActivityDetail(exportPlan)
    }, `${label} export`);
    const message = incompleteExportMessage(exportedMessage, exportPlan);
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(exportPlanHasWarnings(exportPlan) ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || (version === "2.2" ? "XLIFF 2.2 export failed" : "XLIFF export failed"), "dirty");
  }
}

async function exportXliff22() {
  return exportXliff("2.2");
}

async function handleTmxImport(file) {
  if (!currentProject()) return;
  assertFileSize(file, "TMX file", MAX_RESOURCE_IMPORT_BYTES);
  await reportImportProgress("Reading TMX", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TMX", file);
  const entries = await parseTmxAsync(text, {
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    tmName: mainTmName(),
    projectName: `${currentProject().name} TMX import`
  }, {
    yieldFn: yieldToUi,
    onProgress: (progress) => reportImportProgress(
      "Parsing TMX",
      file,
      `${progress.percent}% - ${progress.entries} entr${progress.entries === 1 ? "y" : "ies"}`
    )
  });
  await reportImportProgress("Saving TM entries", file, `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  await importTmEntries(entries, {
    onProgress: (progress) => reportImportProgress(
      "Saving TM entries",
      file,
      importProgressDetail(progress.saved, progress.total, `entr${progress.saved === 1 ? "y" : "ies"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing TM entries",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("tm", mainTmName(), currentProject().sourceLang, currentProject().targetLang);
  await reportImportProgress("Refreshing TM matches", file);
  await refreshTmMatches();
  const activityLogged = await logOptionalProjectActivity("resource-import", "TMX imported", { fileName: file.name, entryCount: entries.length, tmName: mainTmName() }, "TMX import");
  setSaveStatus(appendActivityWarning(`Imported ${entries.length} TM entries`, activityLogged), exportStatusMode("saved", activityLogged));
}

async function handleTmxExport() {
  if (!currentProject()) return;
  try {
    const tmNames = new Set(projectTmNames());
    const entries = (await getAllByIndex("tmEntries", "languagePair", `${currentProject().sourceLang}::${currentProject().targetLang}`))
      .filter((entry) => tmNames.has(entry.tmName));
    download(`${fileSafeName(currentProject().name)}_project-tms.tmx`, buildTmx(entries, { ...currentProject(), tmName: mainTmName() }), "application/xml");
    const activityLogged = await logOptionalProjectActivity("resource-export", "TMX exported", { entryCount: entries.length, tmNames: Array.from(tmNames) }, "TMX export");
    setSaveStatus(appendActivityWarning(`Exported ${entries.length} project TM entr${entries.length === 1 ? "y" : "ies"}`, activityLogged), exportStatusMode("saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "TMX export failed", "dirty");
  }
}

async function handleTbxImport(file) {
  if (!currentProject()) return;
  assertFileSize(file, "TBX file", MAX_RESOURCE_IMPORT_BYTES);
  await reportImportProgress("Reading TBX", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TBX", file);
  const terms = await parseTbxAsync(text, {
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    termBaseName: els.termBaseSelect.value || primaryTermBaseName()
  }, {
    yieldFn: yieldToUi,
    onProgress: (progress) => reportImportProgress(
      "Parsing TBX",
      file,
      `${progress.percent}% - ${progress.terms} term${progress.terms === 1 ? "" : "s"}`
    )
  });
  await reportImportProgress("Saving terms", file, `${terms.length} term${terms.length === 1 ? "" : "s"}`);
  await importTerms(terms, {
    onProgress: (progress) => reportImportProgress(
      "Saving terms",
      file,
      importProgressDetail(progress.saved, progress.total, `term${progress.saved === 1 ? "" : "s"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing terms",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("termbase", els.termBaseSelect.value || primaryTermBaseName(), currentProject().sourceLang, currentProject().targetLang);
  await reportImportProgress("Refreshing terms", file);
  await refreshProjectTerms({ rerender: true });
  await refreshTerms();
  const activityLogged = await logOptionalProjectActivity("resource-import", "TBX imported", { fileName: file.name, termCount: terms.length, termBaseName: els.termBaseSelect.value || primaryTermBaseName() }, "TBX import");
  setSaveStatus(appendActivityWarning(`Imported ${terms.length} terms`, activityLogged), exportStatusMode("saved", activityLogged));
}

async function parseTermListFile(file, options) {
  const isWorkbook = /\.xlsx$/i.test(file?.name || "") || file?.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return isWorkbook
    ? parseTermWorkbook(await file.arrayBuffer(), options)
    : parseTermList(await readImportTextFile(file), options);
}

async function handleTermListImport(file) {
  if (!currentProject()) return;
  assertFileSize(file, "Term list file", MAX_RESOURCE_IMPORT_BYTES);
  const termBaseName = els.termBaseSelect.value || primaryTermBaseName();
  await reportImportProgress("Reading term list", file);
  const terms = await parseTermListFile(file, {
    sourceLang: currentProject().sourceLang,
    targetLang: currentProject().targetLang,
    termBaseName,
    fileName: file.name
  });
  await reportImportProgress("Saving terms", file, `${terms.length} term${terms.length === 1 ? "" : "s"}`);
  await importTerms(terms, {
    onProgress: (progress) => reportImportProgress(
      "Saving terms",
      file,
      importProgressDetail(progress.saved, progress.total, `term${progress.saved === 1 ? "" : "s"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing terms",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("termbase", termBaseName, currentProject().sourceLang, currentProject().targetLang);
  await reportImportProgress("Refreshing terms", file);
  await refreshProjectTerms({ rerender: true });
  await refreshTerms();
  const activityLogged = await logOptionalProjectActivity("resource-import", "Term list imported", { fileName: file.name, termCount: terms.length, termBaseName }, "Term list import");
  setSaveStatus(appendActivityWarning(`Imported ${terms.length} term${terms.length === 1 ? "" : "s"}`, activityLogged), exportStatusMode("saved", activityLogged));
}

async function handleTbxExport() {
  if (!currentProject()) return;
  try {
    const terms = await listTerms({
      sourceLang: currentProject().sourceLang,
      targetLang: currentProject().targetLang,
      termBaseNames: projectTermBaseNames()
    });
    download(`${fileSafeName(currentProject().name)}_project-termbases.tbx`, buildTbx(terms, { ...currentProject(), termBaseName: primaryTermBaseName() }), "application/xml");
    const activityLogged = await logOptionalProjectActivity("resource-export", "TBX exported", { termCount: terms.length, termBaseNames: projectTermBaseNames() }, "TBX export");
    setSaveStatus(appendActivityWarning(`Exported ${terms.length} project term${terms.length === 1 ? "" : "s"}`, activityLogged), exportStatusMode("saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "TBX export failed", "dirty");
  }
}

async function handleResourceTmxImport(file) {
  assertFileSize(file, "TMX resource file", MAX_RESOURCE_IMPORT_BYTES);
  const tmName = els.tmResourceNameInput.value.trim();
  const sourceLang = normalizeLanguageInputElement(els.tmResourceSourceLangInput);
  const targetLang = normalizeLanguageInputElement(els.tmResourceTargetLangInput);
  if (!tmName || !sourceLang || !targetLang) {
    uiAlert("Enter a TM name, source language, and target language before importing.");
    return;
  }
  await reportImportProgress("Reading TMX resource", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TMX resource", file);
  const entries = await parseTmxAsync(text, {
    sourceLang,
    targetLang,
    tmName,
    projectName: "Resources import"
  }, {
    yieldFn: yieldToUi,
    onProgress: (progress) => reportImportProgress(
      "Parsing TMX resource",
      file,
      `${progress.percent}% - ${progress.entries} entr${progress.entries === 1 ? "y" : "ies"}`
    )
  });
  await reportImportProgress("Saving TM resource entries", file, `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  await importTmEntries(entries, {
    onProgress: (progress) => reportImportProgress(
      "Saving TM resource entries",
      file,
      importProgressDetail(progress.saved, progress.total, `entr${progress.saved === 1 ? "y" : "ies"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing TM resource entries",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("tm", tmName, sourceLang, targetLang);
  await reportImportProgress("Refreshing resources", file);
  resourcesController?.openResource?.("tm", `${tmName}::${sourceLang}::${targetLang}`, {
    render: false,
    focus: false
  });
  await refreshResources();
  setSaveStatus(`Imported ${entries.length} TM entries`, "saved");
}

async function handleResourceTbxImport(file) {
  assertFileSize(file, "TBX resource file", MAX_RESOURCE_IMPORT_BYTES);
  const termBaseName = els.tbResourceNameInput.value.trim();
  const sourceLang = normalizeLanguageInputElement(els.tbResourceSourceLangInput);
  const targetLang = normalizeLanguageInputElement(els.tbResourceTargetLangInput);
  if (!termBaseName || !sourceLang || !targetLang) {
    uiAlert("Enter a TB name, source language, and target language before importing.");
    return;
  }
  await reportImportProgress("Reading TBX resource", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TBX resource", file);
  const terms = await parseTbxAsync(text, {
    sourceLang,
    targetLang,
    termBaseName
  }, {
    yieldFn: yieldToUi,
    onProgress: (progress) => reportImportProgress(
      "Parsing TBX resource",
      file,
      `${progress.percent}% - ${progress.terms} term${progress.terms === 1 ? "" : "s"}`
    )
  });
  await reportImportProgress("Saving termbase resource terms", file, `${terms.length} term${terms.length === 1 ? "" : "s"}`);
  await importTerms(terms, {
    onProgress: (progress) => reportImportProgress(
      "Saving termbase resource terms",
      file,
      importProgressDetail(progress.saved, progress.total, `term${progress.saved === 1 ? "" : "s"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing termbase resource terms",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("termbase", termBaseName, sourceLang, targetLang);
  await reportImportProgress("Refreshing resources", file);
  resourcesController?.openResource?.("tb", `${termBaseName}::${sourceLang}::${targetLang}`, {
    render: false,
    focus: false
  });
  await refreshResources();
  await refreshProjectTerms({ rerender: true });
  setSaveStatus(`Imported ${terms.length} terms`, "saved");
}

async function handleResourceTermListImport(file) {
  assertFileSize(file, "Term list resource file", MAX_RESOURCE_IMPORT_BYTES);
  const termBaseName = els.tbResourceNameInput.value.trim();
  const sourceLang = normalizeLanguageInputElement(els.tbResourceSourceLangInput);
  const targetLang = normalizeLanguageInputElement(els.tbResourceTargetLangInput);
  if (!termBaseName || !sourceLang || !targetLang) {
    uiAlert("Enter a TB name, source language, and target language before importing.");
    return;
  }
  await reportImportProgress("Reading term list resource", file);
  const terms = await parseTermListFile(file, {
    sourceLang,
    targetLang,
    termBaseName,
    fileName: file.name
  });
  await reportImportProgress("Saving termbase resource terms", file, `${terms.length} term${terms.length === 1 ? "" : "s"}`);
  await importTerms(terms, {
    onProgress: (progress) => reportImportProgress(
      "Saving termbase resource terms",
      file,
      importProgressDetail(progress.saved, progress.total, `term${progress.saved === 1 ? "" : "s"}`)
    ),
    onIndexProgress: (progress) => reportImportProgress(
      "Indexing termbase resource terms",
      file,
      importProgressDetail(progress.saved, progress.total, "index rows")
    )
  });
  markProjectsUsingResourceDirty("termbase", termBaseName, sourceLang, targetLang);
  await reportImportProgress("Refreshing resources", file);
  resourcesController?.openResource?.("tb", `${termBaseName}::${sourceLang}::${targetLang}`, {
    render: false,
    focus: false
  });
  await refreshResources();
  await refreshProjectTerms({ rerender: true });
  setSaveStatus(`Imported ${terms.length} term${terms.length === 1 ? "" : "s"}`, "saved");
}

function wireEvents() {
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "rendering language datalists";
  renderLanguageDatalists();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "rendering text encodings";
  renderTextEncodingOptions();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "attaching event listeners";
  document.querySelectorAll(".menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      document.querySelectorAll(".menu[open]").forEach((other) => {
        if (other !== menu) other.removeAttribute("open");
      });
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest("button")) menu.removeAttribute("open");
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".menu")) return;
    document.querySelectorAll(".menu[open]").forEach((menu) => menu.removeAttribute("open"));
  });
  window.addEventListener("keydown", handleGlobalKeydown, true);
  els.segmentGridWrap.addEventListener("scroll", () => {
    verticalFeatureState.segmentGrid.scheduleScroll(() => {
      renderSegments({ fromScroll: true, preserveScroll: true });
    });
  });

  els.brandHomeLink.addEventListener("click", (event) => {
    event.preventDefault();
    setView("projects");
  });
  els.projectsViewBtn.addEventListener("click", () => setView("projects"));
  els.emptyTrashBtn?.addEventListener("click", emptyTrashPermanently);
  els.undoBtn?.addEventListener("click", undoLastCommand);
  els.redoBtn?.addEventListener("click", redoLastCommand);
  els.reloadUpdateBtn?.addEventListener("click", () => void offlineUpdateController?.activate?.());
  els.deferUpdateBtn?.addEventListener("click", () => offlineUpdateController?.defer?.());
  els.uiLocaleSelect?.addEventListener("change", async () => {
    await appRuntime.localeLoader.ensure(els.uiLocaleSelect.value);
    uiI18n?.setLocale?.(els.uiLocaleSelect.value);
    refreshLocalizedUi();
  });
  els.uiLocaleImportInput?.addEventListener("change", importUiLocaleFile);
  els.exportUiSourceBtn?.addEventListener("click", exportUiSourceCatalog);
  els.projectFilesBtn.addEventListener("click", showProjectHome);
  els.projectHomeDeleteBtn.addEventListener("click", () => confirmDeleteProject());
  els.focusModeBtn?.addEventListener("click", toggleFocusMode);
  els.exitFocusModeBtn?.addEventListener("click", () => setFocusMode(false));
  els.inspectorToggleBtn?.addEventListener("click", () => {
    state.inspectorOpen = !state.inspectorOpen;
    void workspaceLayoutController?.setInspectorOpen?.(state.inspectorOpen);
    renderEditor();
    if (state.inspectorOpen) {
      requestAnimationFrame(() => document.querySelector("[data-inspector-tab][aria-selected='true']")?.focus());
    } else {
      els.inspectorToggleBtn.focus();
    }
  });
  els.commandPaletteBtn.addEventListener("click", openCommandPalette);
  els.projectSearchInput.addEventListener("input", renderProjectsView);
  els.languagePairFilter.addEventListener("change", renderProjectsView);

  els.saveTmBtn.addEventListener("click", saveActiveSegmentToTm);
  els.nextOpenBtn.addEventListener("click", goToNextOpenSegment);
  els.runQaBtn.addEventListener("click", runProjectQa);
  document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
    syncPanelToggleState(button);
    button.addEventListener("click", () => {
      const panel = button.closest("[data-collapsible-panel]");
      if (!panel) return;
      if (panel.dataset.inspectorSection) {
        state.inspectorOpen = true;
        void workspaceLayoutController?.setInspectorOpen?.(true);
        verticalFeatureState?.inspector?.setContext({ tab: panel.dataset.inspectorSection });
      }
      panel.classList.toggle("collapsed");
      syncPanelToggleState(button);
    });
  });
  els.documentFilter.addEventListener("change", async () => {
    selectApplicationDocument(els.documentFilter.value);
    renderSegments();
    renderProgress();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.segmentSearchInput.addEventListener("input", async () => {
    updateEditorFilters({ query: els.segmentSearchInput.value.trim() });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.segmentSearchScope.addEventListener("change", async () => {
    updateEditorFilters({ scope: els.segmentSearchScope.value });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.segmentRegexInput.addEventListener("change", async () => {
    updateEditorFilters({ regex: els.segmentRegexInput.checked });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.segmentCaseInput.addEventListener("change", async () => {
    updateEditorFilters({ caseSensitive: els.segmentCaseInput.checked });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.segmentStatusFilter.addEventListener("change", async () => {
    filterPresetController?.markCustom?.();
    updateEditorFilters({ status: els.segmentStatusFilter.value });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.reviewStateFilter?.addEventListener("change", async () => {
    filterPresetController?.markCustom?.();
    updateEditorFilters({ reviewState: els.reviewStateFilter.value });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });
  els.aiSegmentFilter?.addEventListener("change", async () => {
    filterPresetController?.markCustom?.();
    updateEditorFilters({ aiState: els.aiSegmentFilter.value });
    renderSegments();
    const first = firstVisibleSegmentIndex();
    if (first !== -1) await setActiveSegment(first);
  });

  els.termForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveTermFromForm();
  });

  els.domainForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProjectDomainFromForm();
  });
  els.projectDomainEditInput.addEventListener("input", () => {
    const current = currentProject()?.domain || "";
    els.domainForm.classList.toggle("clean", els.projectDomainEditInput.value.trim() === current);
  });

  els.closeConcordanceBtn.addEventListener("click", closeConcordance);
  els.concordanceOverlay.addEventListener("click", (event) => {
    if (event.target === els.concordanceOverlay) closeConcordance();
  });

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !shouldWarnBeforeUnload()) return;
    flushPendingSegmentSaves()
      .then(() => autosaveDirtyWorkspacePackages())
      .catch((error) => console.warn(error));
  });
  window.addEventListener("pagehide", () => {
    if (!shouldWarnBeforeUnload()) return;
    flushPendingSegmentSaves()
      .then(() => autosaveDirtyWorkspacePackages())
      .catch((error) => console.warn(error));
  });
}

/* LOOPCAT_TEST_WORKFLOW_DRIVER */

(async () => {
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "loading active interface locale";
  await appRuntime.localeLoader.initialize();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "initializing UI and event wiring";
  uiI18n?.init?.();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "rendering UI locale options";
  renderUiLocaleOptions();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "binding local AI drawer";
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "wiring UI events";
  wireEvents();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "starting workspace autosave";
  startWorkspaceAutosave();
  if (LOOPCAT_TEST_BUILD) window.__loopcatTopLevelCheckpoint = "starting application bootstrap";
  if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: restoring workspace state";
  restoreWorkspaceDirtyIds();
  if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: checking storage durability";
  await refreshStorageDurability();
  if (workspaceStorage) {
    if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: reconnecting workspace";
    state.workspaceStatus = await workspaceStorage.reconnectSavedWorkspace();
    renderWorkspaceStatus();
  }
  if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: loading projects";
  await loadProjects(false);
  if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: loading interface preferences";
  await Promise.all([
    themeController?.initialize?.({ freshProfile: currentProjects().length === 0 }),
    workspaceLayoutController?.initialize?.()
  ]);
  if (LOOPCAT_TEST_BUILD) window.__loopcatAppWorkflowProgress = "startup: starting workflow characterization";
  await runAppWorkflowTest();
  registerOfflineAppShell();
})().catch((error) => {
  console.error(error);
  setSaveStatus(error.message || "Startup error", "dirty");
});
})();
