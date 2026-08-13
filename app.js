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
const OPENAI_KEY_STORAGE = "loopcat.openai.apiKey";
const LOCAL_AI_KEY_STORAGE = "loopcat.localAi.apiKey";
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
const AUTOSAVE_RETRY_DELAY_MS = 2000;
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
  saveTimers: new Map(),
  inspectorOpen: true,
  segmentFilterRevision: 0,
  segmentFilterCache: { key: "", indexes: [], positions: new Map() },
  projectAnalysisRun: 0,
  segmentWindow: { start: 0, end: 0, total: 0, indexes: [] },
  importTask: "",
  segmentScrollFrame: 0,
  segmentRowFrame: 0,
  pendingRowUpdates: new Set(),
  confirmingSegmentIds: new Set(),
  tmPretranslating: false,
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
appRuntime.editorSession.attachCompatibility(state);

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

function selectApplicationSegment(activeIndex, segmentId = state.segments[activeIndex]?.id || "") {
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
    saveSettings: saveAiSettings,
    contextualTranslate: pretranslateWithLocalAi,
    reviewSegment: reviewActiveSegmentWithLocalAi,
    repairSegment: repairActiveSegmentTagsWithLocalAi,
    polishSegment: polishActiveSegmentDraftWithLocalAi,
    variantsSegment: suggestActiveSegmentVariantsWithLocalAi,
    applyTermsSegment: applyActiveSegmentTerminologyWithLocalAi,
    openAiSuggestion: createOpenAiSuggestion,
    cancel: cancelLocalAiBatch,
    testConnection: testLocalAiConnection,
    startLmStudio: startLmStudioServerAndTestConnection,
    refreshModels: refreshLocalAiModels,
    pullModel: pullLocalAiModel,
    promptTest: testLocalAiPrompt,
    reviewBatch: reviewBatchWithLocalAi,
    repairBatch: repairBatchTagsWithLocalAi,
    polishBatch: polishBatchDraftsWithLocalAi,
    adaptSegment: adaptActiveSegmentDraftWithLocalAi,
    adaptBatch: adaptBatchDraftsWithLocalAi,
    variantsBatch: suggestBatchSegmentVariantsWithLocalAi,
    applyTermsBatch: applyBatchTerminologyWithLocalAi,
    extractTermsSegment: extractActiveSegmentTermsWithLocalAi,
    extractTermsBatch: extractBatchTermsWithLocalAi,
    pretranslate: pretranslateWithLocalAi,
    projectBrief: generateProjectBriefWithLocalAi,
    presetChange: handleLocalAiPresetChange,
    providerChange: handleLocalAiProviderChange,
    baseUrlInput: handleLocalAiBaseUrlInput,
    clearLocalKey: handleClearLocalAiKey,
    clearOpenAiKey: handleClearOpenAiKey,
    formChanged: handleLocalAiFormChanged,
    languageChanged: handleLocalAiLanguageChanged
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
    segmentGrid: factories.createSegmentGridController({ navigation: applicationNavigation })
  });
})();
verticalFeatureState?.inspector?.mount?.();

const filterPresetController = appRuntime?.featureFactories?.createFilterPresetController?.({
  select: els.filterPresetSelect,
  preferencesRepository: appRuntime.preferencesRepository,
  getProjectId: () => state.project?.id || "",
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
      projectCount: state.projects.length,
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
  hasProject: () => Boolean(state.project),
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
  getProject: () => state.project,
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
  retryConnection: testLocalAiConnection,
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
  if (state.project) {
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
    projectId: state.project?.id || null,
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
  const projectId = state.commandProjectId || state.project?.id || null;
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
  const projectId = state.commandProjectId || state.project?.id || null;
  finalizePendingEditCommands(projectId || "");
  const result = await appRuntime?.commands?.bus?.undo?.(projectId);
  if (!result) return false;
  const requestedActiveSegmentId = result.result?.activeSegmentId || "";
  await loadProjects(false);
  if (state.project?.id === projectId) {
    state.project = state.projects.find((project) => project.id === projectId) || state.project;
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(projectId));
    const requestedIndex = requestedActiveSegmentId
      ? state.segments.findIndex((segment) => segment.id === requestedActiveSegmentId)
      : -1;
    const nextIndex = state.segments.length
      ? requestedIndex >= 0
        ? requestedIndex
        : Math.max(0, Math.min(currentActiveIndex(), state.segments.length - 1))
      : -1;
    selectApplicationSegment(nextIndex);
    renderAll();
  } else if (!state.project && projectId && state.projects.some((project) => project.id === projectId)) {
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
  const projectId = state.commandProjectId || state.project?.id || null;
  finalizePendingEditCommands(projectId || "");
  const result = await appRuntime?.commands?.bus?.redo?.(projectId);
  if (!result) return false;
  const requestedActiveSegmentId = result.result?.activeSegmentId || "";
  if (result.receipt.commandId === "delete-project" && state.project?.id === projectId) {
    state.project = null;
    state.segments = [];
    setView("projects");
    applicationNavigation.clearSelection();
  }
  await loadProjects(false);
  if (result.receipt.commandId === "delete-document" && state.project?.id === projectId) {
    state.project = state.projects.find((project) => project.id === projectId) || state.project;
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(projectId));
    const nextIndex = state.segments.length
      ? Math.max(0, Math.min(currentActiveIndex(), state.segments.length - 1))
      : -1;
    selectApplicationSegment(nextIndex);
    renderAll();
  } else if (state.project?.id === projectId && requestedActiveSegmentId) {
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(projectId));
    const requestedIndex = state.segments.findIndex((segment) => segment.id === requestedActiveSegmentId);
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
  const active = Boolean(currentFocusMode() && currentApplicationView() === "editor" && state.project);
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
    payload: { enabled: Boolean(enabled && state.project) }
  });
  renderFocusMode();
  document.querySelectorAll(".menu[open]").forEach((menu) => menu.removeAttribute("open"));
  if (!state.project) return;
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
  return state.segments[currentActiveIndex()] || null;
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

function prepareSegmentHistoryStates(segments = state.segments) {
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

function languagePair(project = state.project) {
  return project ? languagePairDisplay(project.sourceLang, project.targetLang) : "";
}

function fileSafeName(value) {
  return (redactSensitiveText(value || "export").trim() || "export").replace(/[^\p{L}\p{N}-]+/gu, "_");
}

function defaultAiSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const localProvider = redactSensitiveText(source.localProvider || source.localProviderId || "ollama").trim() || "ollama";
  const localBaseUrl = redactSensitiveText(source.localBaseUrl || "http://localhost:11434").trim() || "http://localhost:11434";
  const localModel = redactSensitiveText(source.localModel || "translategemma").trim() || "translategemma";
  const localSourceCode = redactSensitiveText(source.localSourceCode || "").trim();
  const localTargetCode = redactSensitiveText(source.localTargetCode || "").trim();
  const localConcurrency = Number(source.localConcurrency);
  const localTimeoutMs = Number(source.localTimeoutMs);
  const localPretranslateMode = ["selected", "untranslated", "visible", "project"].includes(String(source.localPretranslateMode || "").trim())
    ? String(source.localPretranslateMode).trim()
    : "untranslated";
  const localVariantMode = ["standard", "formal", "concise", "locale", "plain"].includes(String(source.localVariantMode || "").trim())
    ? String(source.localVariantMode).trim()
    : "standard";
  const localAdaptMode = ["simplify", "formalize", "localize", "shorten"].includes(String(source.localAdaptMode || "").trim())
    ? String(source.localAdaptMode).trim()
    : "simplify";
  return {
    enabled: Boolean(source.enabled),
    provider: redactSensitiveText(source.provider || "OpenAI").trim() || "OpenAI",
    model: redactSensitiveText(source.model || OPENAI_DEFAULT_MODEL).trim() || OPENAI_DEFAULT_MODEL,
    apiKeyMode: "bring-your-own",
    sendSourceToAi: Boolean(source.sendSourceToAi),
    useTmContext: source.useTmContext !== false,
    useTermbaseContext: source.useTermbaseContext !== false,
    styleGuide: redactSensitiveText(source.styleGuide || "").trim(),
    localProvider,
    localBaseUrl,
    localModel,
    localSourceLang: redactSensitiveText(source.localSourceLang || "").trim(),
    localSourceCode,
    localTargetLang: redactSensitiveText(source.localTargetLang || "").trim(),
    localTargetCode,
    localPretranslateMode,
    localVariantMode,
    localAdaptMode,
    localConcurrency: Number.isFinite(localConcurrency) ? Math.min(2, Math.max(1, Math.round(localConcurrency))) : 1,
    localTimeoutMs: Number.isFinite(localTimeoutMs) ? Math.min(600000, Math.max(5000, Math.round(localTimeoutMs))) : 120000,
    localOverwrite: Boolean(source.localOverwrite),
    localPreserveConfirmedLocked: source.localPreserveConfirmedLocked !== false,
    localIncludeNearbyContext: source.localIncludeNearbyContext !== false
  };
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function openAiStorage(kind) {
  try {
    return kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  } catch (error) {
    console.warn(`OpenAI ${kind} key storage is unavailable.`, error);
    return null;
  }
}

function readOpenAiKeyStorage(kind) {
  const storage = openAiStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(OPENAI_KEY_STORAGE);
  } catch (error) {
    console.warn(`OpenAI ${kind} key storage read failed.`, error);
    return null;
  }
}

function writeOpenAiKeyStorage(kind, value) {
  const storage = openAiStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(OPENAI_KEY_STORAGE, value);
    return true;
  } catch (error) {
    console.warn(`OpenAI ${kind} key storage write failed.`, error);
    return false;
  }
}

function removeOpenAiKeyStorage(kind) {
  const storage = openAiStorage(kind);
  if (!storage) return true;
  try {
    storage.removeItem(OPENAI_KEY_STORAGE);
    return true;
  } catch (error) {
    console.warn(`OpenAI ${kind} key storage clear failed.`, error);
    return false;
  }
}

function openAiKeySnapshot() {
  return {
    local: readOpenAiKeyStorage("local"),
    session: readOpenAiKeyStorage("session")
  };
}

function restoreOpenAiKeySnapshot(snapshot = {}) {
  const localOk = snapshot.local !== null && snapshot.local !== undefined
    ? writeOpenAiKeyStorage("local", snapshot.local)
    : removeOpenAiKeyStorage("local");
  const sessionOk = snapshot.session !== null && snapshot.session !== undefined
    ? writeOpenAiKeyStorage("session", snapshot.session)
    : removeOpenAiKeyStorage("session");
  if (!localOk || !sessionOk) throw new Error("OpenAI key storage restore failed.");
  return true;
}

function safeRestoreOpenAiKeySnapshot(snapshot) {
  try {
    restoreOpenAiKeySnapshot(snapshot);
    return true;
  } catch (error) {
    console.warn("OpenAI key storage restore failed.", error);
    return false;
  }
}

function storedOpenAiKey() {
  const snapshot = openAiKeySnapshot();
  return snapshot.session || snapshot.local || "";
}

function saveOpenAiKey(value, remember) {
  const key = String(value || "").trim();
  const previousKey = openAiKeySnapshot();
  try {
    restoreOpenAiKeySnapshot({ local: null, session: null });
    const forcedKeyStorageFailure = LOOPCAT_TEST_BUILD && state[OPENAI_KEY_STORAGE_FAILURE_TEST_FLAG];
    if (forcedKeyStorageFailure) throw new Error(typeof forcedKeyStorageFailure === "string" ? forcedKeyStorageFailure : "Simulated OpenAI key storage failure");
    if (!key) return;
    const saved = remember ? writeOpenAiKeyStorage("local", key) : writeOpenAiKeyStorage("session", key);
    if (!saved) throw new Error("OpenAI key could not be saved in this browser.");
  } catch (error) {
    safeRestoreOpenAiKeySnapshot(previousKey);
    throw error;
  }
}

function clearOpenAiKey() {
  try {
    saveOpenAiKey("", false);
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

function openAiKeyStorageLabel() {
  const snapshot = openAiKeySnapshot();
  if (snapshot.local) return "Saved in this browser";
  if (snapshot.session) return "Saved for this tab";
  return "Not saved";
}

function localAiStorage(kind) {
  try {
    return kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  } catch (error) {
    console.warn(`Local AI ${kind} key storage is unavailable.`, error);
    return null;
  }
}

function localAiKeyStorageKey(settings = localAiSettingsFromForm()) {
  const clean = localAISettingsStore?.defaults
    ? localAISettingsStore.defaults(settings || {}, state.project)
    : (settings || {});
  const providerId = String(clean.providerId || clean.provider || "ollama").trim() || "ollama";
  const fallbackBaseUrl = clean.baseUrl || (providerId === "ollama" ? OLLAMA_DEFAULT_BASE_URL : OPENAI_DEFAULT_BASE_URL);
  const normalizedBaseUrl = normalizedProviderBaseUrl(providerId, fallbackBaseUrl);
  return `${LOCAL_AI_KEY_STORAGE}:${providerId}:${normalizedBaseUrl}`;
}

function readLocalAiKeyStorageItem(kind, key) {
  const storage = localAiStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn(`Local AI ${kind} key storage read failed.`, error);
    return null;
  }
}

function writeLocalAiKeyStorageItem(kind, key, value) {
  const storage = localAiStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Local AI ${kind} key storage write failed.`, error);
    return false;
  }
}

function removeLocalAiKeyStorageItem(kind, key) {
  const storage = localAiStorage(kind);
  if (!storage) return true;
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Local AI ${kind} key storage clear failed.`, error);
    return false;
  }
}

function readLocalAiKeyStorage(kind, settings = localAiSettingsFromForm()) {
  return readLocalAiKeyStorageItem(kind, localAiKeyStorageKey(settings));
}

function writeLocalAiKeyStorage(kind, value, settings = localAiSettingsFromForm()) {
  const scopedWriteOk = writeLocalAiKeyStorageItem(kind, localAiKeyStorageKey(settings), value);
  const legacyClearOk = removeLocalAiKeyStorageItem(kind, LOCAL_AI_KEY_STORAGE);
  return scopedWriteOk && legacyClearOk;
}

function removeLocalAiKeyStorage(kind, settings = localAiSettingsFromForm()) {
  const scopedClearOk = removeLocalAiKeyStorageItem(kind, localAiKeyStorageKey(settings));
  const legacyClearOk = removeLocalAiKeyStorageItem(kind, LOCAL_AI_KEY_STORAGE);
  return scopedClearOk && legacyClearOk;
}

function localAiKeySnapshot(settings = localAiSettingsFromForm()) {
  const scopedKey = localAiKeyStorageKey(settings);
  return {
    key: scopedKey,
    local: readLocalAiKeyStorageItem("local", scopedKey),
    session: readLocalAiKeyStorageItem("session", scopedKey),
    legacyLocal: readLocalAiKeyStorageItem("local", LOCAL_AI_KEY_STORAGE),
    legacySession: readLocalAiKeyStorageItem("session", LOCAL_AI_KEY_STORAGE)
  };
}

function restoreLocalAiKeySnapshot(snapshot = {}) {
  const scopedKey = snapshot.key || LOCAL_AI_KEY_STORAGE;
  const localOk = snapshot.local !== null && snapshot.local !== undefined
    ? writeLocalAiKeyStorageItem("local", scopedKey, snapshot.local)
    : removeLocalAiKeyStorageItem("local", scopedKey);
  const sessionOk = snapshot.session !== null && snapshot.session !== undefined
    ? writeLocalAiKeyStorageItem("session", scopedKey, snapshot.session)
    : removeLocalAiKeyStorageItem("session", scopedKey);
  const legacyLocalOk = snapshot.legacyLocal !== null && snapshot.legacyLocal !== undefined
    ? writeLocalAiKeyStorageItem("local", LOCAL_AI_KEY_STORAGE, snapshot.legacyLocal)
    : removeLocalAiKeyStorageItem("local", LOCAL_AI_KEY_STORAGE);
  const legacySessionOk = snapshot.legacySession !== null && snapshot.legacySession !== undefined
    ? writeLocalAiKeyStorageItem("session", LOCAL_AI_KEY_STORAGE, snapshot.legacySession)
    : removeLocalAiKeyStorageItem("session", LOCAL_AI_KEY_STORAGE);
  if (!localOk || !sessionOk || !legacyLocalOk || !legacySessionOk) throw new Error("Local AI key storage restore failed.");
  return true;
}

function safeRestoreLocalAiKeySnapshot(snapshot) {
  try {
    restoreLocalAiKeySnapshot(snapshot);
    return true;
  } catch (error) {
    console.warn("Local AI key storage restore failed.", error);
    return false;
  }
}

function storedLocalAiKey(settings = localAiSettingsFromForm()) {
  const snapshot = localAiKeySnapshot(settings);
  return snapshot.session || snapshot.local || "";
}

function saveLocalAiKey(value, remember, settings = localAiSettingsFromForm()) {
  const key = String(value || "").trim();
  const previousKey = localAiKeySnapshot(settings);
  try {
    const localOk = removeLocalAiKeyStorage("local", settings);
    const sessionOk = removeLocalAiKeyStorage("session", settings);
    if (!localOk || !sessionOk) throw new Error("Local AI key storage could not be cleared.");
    if (!key) return;
    const saved = remember ? writeLocalAiKeyStorage("local", key, settings) : writeLocalAiKeyStorage("session", key, settings);
    if (!saved) throw new Error("Local AI key could not be saved in this browser.");
  } catch (error) {
    safeRestoreLocalAiKeySnapshot(previousKey);
    throw error;
  }
}

function clearLocalAiKey() {
  const settings = localAiSettingsFromForm();
  try {
    saveLocalAiKey("", false, settings);
  } catch (error) {
    setLocalAiStatus("error", redactSensitiveText(error.message || "Local AI key could not be cleared."));
    return false;
  }
  aiAdministrationController?.clearLocalAiSecret?.();
  setLocalAiStatus("disconnected", "Local AI key cleared for this provider");
  return true;
}

function localAiKeyStorageLabel(settings = localAiSettingsFromForm()) {
  const snapshot = localAiKeySnapshot(settings);
  if (snapshot.local) return "Saved in this browser for this provider";
  if (snapshot.session) return "Saved for this tab and provider";
  return "Not saved";
}

function markOpenAiProjectRollbackDirty(projectId) {
  if (projectId) markWorkspaceDirty(projectId);
}

async function restoreProjectAfterOpenAiSetupFailure(previousProject, previousProjects, projectPersisted) {
  if (!projectPersisted) {
    state.project = previousProject;
    state.projects = previousProjects;
    return;
  }
  try {
    state.project = await updateProject(previousProject);
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  } catch (rollbackError) {
    console.warn("Project AI settings rollback failed.", rollbackError);
    state.project = previousProject;
    state.projects = previousProjects;
    markOpenAiProjectRollbackDirty(previousProject.id);
  }
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

function projectDocumentManifest(project = state.project) {
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

function mainTmName(project = state.project) {
  return projectResourceLinks(project).find((link) => link.type === "tm" && link.role === "main")?.name || cleanProjectText(project?.mainTmName, cleanProjectText(project?.tmName, "Default TM"));
}

function projectTmNames(project = state.project) {
  return uniqueNames([mainTmName(project), ...projectResourceLinks(project).filter((link) => link.type === "tm").map((link) => link.name)]);
}

function projectTermBaseNames(project = state.project) {
  return uniqueNames(projectResourceLinks(project).filter((link) => link.type === "termbase").map((link) => link.name));
}

function primaryTermBaseName(project = state.project) {
  return projectTermBaseNames(project)[0] || cleanProjectText(project?.termBaseName, "Default TB");
}

function projectResourceSummary(project = state.project) {
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
  return state.segments.map((_, index) => index);
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
  state.segments.forEach((segment, index) => {
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
  projectDocumentManifest(state.project).forEach((documentInfo) => {
    const id = documentInfo?.id || "";
    if (!id || map.has(id)) return;
    map.set(id, {
      id,
      name: documentInfo.name || state.project?.sourceFileName || "Document",
      type: stableLower(documentInfo.type || "docx") || "docx"
    });
  });
  state.segments.forEach((segment) => {
    const id = segment.documentId || "default-document";
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: segment.documentName || state.project?.sourceFileName || "Document",
        type: stableLower(segment.documentType || "docx") || "docx"
      });
      return;
    }
    const current = map.get(id);
    map.set(id, {
      ...current,
      name: current.name || segment.documentName || state.project?.sourceFileName || "Document",
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
  return state.segments.filter((segment) => segment.documentId === documentId);
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
  state.segments.forEach((segment) => {
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
  state.segments.forEach((segment) => {
    if (segment.documentId === documentId) addSegmentToDocumentStats(stats, segment);
  });
  return finalizeDocumentStats(stats);
}

function currentDocumentSegments() {
  return currentDocumentId()
    ? state.segments.filter((segment) => segment.documentId === currentDocumentId())
    : state.segments;
}

function currentSelectedDocument() {
  if (!currentDocumentId()) return null;
  return projectDocuments().find((documentInfo) => documentInfo.id === currentDocumentId()) || null;
}

function deliveryExportScope() {
  const documentInfo = currentSelectedDocument();
  return {
    documentInfo,
    segments: documentInfo ? state.segments.filter((segment) => segment.documentId === documentInfo.id) : state.segments
  };
}

function scopedExportBaseName(baseName, documentInfo) {
  const base = fileSafeName(baseName || state.project?.name || "project");
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

function languagePairKey(project = state.project) {
  return project ? `${normalizeLanguageInputValue(project.sourceLang)}::${normalizeLanguageInputValue(project.targetLang)}` : "";
}

function targetSpellcheckLanguage(project = state.project) {
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
  return [...state.projects]
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

function syncLocalAiLanguageFields(changedField = "") {
  const form = aiAdministrationController?.readLocalForm?.() || {};
  const sourceCode = changedField === "sourceLanguage"
    ? normalizeLanguageInputValue(form.sourceLanguage || state.project?.sourceLang || "")
    : normalizeLanguageInputValue(form.sourceCode || form.sourceLanguage || state.project?.sourceLang || "");
  const targetCode = changedField === "targetLanguage"
    ? normalizeLanguageInputValue(form.targetLanguage || state.project?.targetLang || "")
    : normalizeLanguageInputValue(form.targetCode || form.targetLanguage || state.project?.targetLang || "");
  const fields = {};
  if (sourceCode) {
    if (changedField !== "sourceLanguage") fields.sourceLanguage = languageNameForUi(sourceCode);
    if (changedField !== "sourceCode") fields.sourceCode = sourceCode;
  }
  if (targetCode) {
    if (changedField !== "targetLanguage") fields.targetLanguage = languageNameForUi(targetCode);
    if (changedField !== "targetCode") fields.targetCode = targetCode;
  }
  aiAdministrationController?.setLanguageFields?.(fields);
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

function detectInlineCodeRanges(text) {
  return Array.from(String(text || "").matchAll(/<(g|b|i|u)\b[^>]*>[\s\S]*?<\/\1>/gi)).map((match) => ({
    start: match.index || 0,
    end: (match.index || 0) + match[0].length
  }));
}

function splitProtectedRanges(text) {
  return [
    ...detectProtectedTags(text).map((tag) => ({ start: tag.index, end: tag.index + tag.text.length })),
    ...detectInlineCodeRanges(text)
  ];
}

function safeSplitIndex(text, preferredIndex) {
  const value = String(text || "");
  const max = value.length - 1;
  if (max <= 0) return 0;
  const preferred = Math.min(Math.max(Math.round(preferredIndex), 1), max);
  const ranges = splitProtectedRanges(value);
  const safe = (index) => {
    if (index <= 0 || index >= value.length) return false;
    if (!/\s/u.test(value[index] || value[index - 1] || "")) return false;
    return !ranges.some((range) => index > range.start && index < range.end);
  };
  for (let offset = 0; offset < value.length; offset += 1) {
    const left = preferred - offset;
    const right = preferred + offset;
    if (safe(left)) return left;
    if (safe(right)) return right;
  }
  return ranges.some((range) => preferred > range.start && preferred < range.end) ? 0 : preferred;
}

function mappedSourceSplitIndex(source, target, targetCursor) {
  const sourceText = String(source || "");
  const targetText = String(target || "");
  if (!targetText.trim()) return safeSplitIndex(sourceText, sourceText.length / 2);
  const ratio = Math.min(Math.max(targetCursor / targetText.length, 0), 1);
  return safeSplitIndex(sourceText, sourceText.length * ratio);
}

function canSplitSegmentStructure(segment) {
  if (!segment?.structure) return true;
  return segment.structure.type === "paragraph";
}

function canMergeSegmentStructures(segment, next) {
  if (!segment || !next || segment.documentId !== next.documentId) return false;
  if (!segment.structure && !next.structure) return true;
  if (segment.structure?.type !== "paragraph" || next.structure?.type !== "paragraph") return false;
  return (
    (segment.structure.partPath || "word/document.xml") === (next.structure.partPath || "word/document.xml") &&
    segment.structure.paragraphIndex === next.structure.paragraphIndex
  );
}

function nextSegmentForMerge(segment = currentSegment()) {
  if (!segment) return null;
  return (
    state.segments.find(
      (item) => item.index > segment.index && item.documentId === segment.documentId
    ) || null
  );
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
  const commandProjectId = state.commandProjectId || state.project?.id || null;
  const commands = [
    { id: "undo", label: "Undo last action", run: undoLastCommand, enabled: Boolean(appRuntime?.commands?.bus?.canUndo?.(commandProjectId)) },
    { id: "redo", label: "Redo last action", run: redoLastCommand, enabled: Boolean(appRuntime?.commands?.bus?.canRedo?.(commandProjectId)) },
    { id: "trash", label: "Open Trash", run: openTrash, enabled: Boolean(appRuntime?.trashRepository) },
    { id: "confirm", label: "Confirm segment", run: confirmCurrentSegment, enabled: Boolean(currentSegment()?.target?.trim()) },
    { id: "next-open", label: "Next open segment", run: goToNextOpenSegment, enabled: Boolean(state.segments.length) },
    { id: "focus-mode", label: currentFocusMode() ? "Exit Focus view" : "Enter Focus view", run: toggleFocusMode, enabled: Boolean(currentApplicationView() === "editor" && state.project) },
    { id: "copy-source", label: "Copy source", run: copySourceToTarget, enabled: Boolean(currentSegment()) },
    { id: "split-segment", label: "Split segment", group: "Segment", keywords: ["divide", "cursor", "structure"], run: splitCurrentSegment, enabled: Boolean(currentSegment() && canSplitSegmentStructure(currentSegment())) },
    { id: "merge-segments", label: "Merge with next segment", group: "Segment", keywords: ["join", "combine", "structure"], run: mergeWithNextSegment, enabled: Boolean(currentSegment() && canMergeSegmentStructures(currentSegment(), nextSegmentForMerge(currentSegment()))) },
    { id: "save-tm", label: "Save segment to TM", run: saveActiveSegmentToTm, enabled: Boolean(currentSegment()?.target?.trim()) },
    { id: "project-settings", label: "Project settings", run: () => openProjectDialog("edit"), enabled: Boolean(state.project) },
    { id: "qa", label: "Run QA checks", run: runProjectQa, enabled: Boolean(state.project) },
    { id: "quality-passport", label: "Export Quality Passport", run: exportQualityPassport, enabled: Boolean(state.project) },
    { id: "next-quality-risk", label: "Next quality risk", run: goToNextQualityRisk, enabled: Boolean(state.project) },
    { id: "concordance", label: "Open concordance", run: openConcordanceSearch, enabled: Boolean(state.project) },
    { id: "replace-target", label: "Find and replace target text", run: openReplacePanel, enabled: Boolean(state.project) },
    { id: "preset-translate", label: "Use Translate filter preset", group: "Filters", keywords: ["open", "segments", "matches"], run: () => filterPresetController?.applyPreset?.("translate"), enabled: Boolean(state.project) },
    { id: "preset-review", label: "Use Review filter preset", group: "Filters", keywords: ["needs review", "comments"], run: () => filterPresetController?.applyPreset?.("review"), enabled: Boolean(state.project) },
    { id: "preset-qa-fixes", label: "Use QA fixes filter preset", group: "Filters", keywords: ["quality", "blocked", "fixes"], run: () => filterPresetController?.applyPreset?.("qa-fixes"), enabled: Boolean(state.project) },
    { id: "preset-ai-review", label: "Use AI review filter preset", group: "Filters", keywords: ["AI", "risk", "suggestions"], run: () => filterPresetController?.applyPreset?.("ai-review"), enabled: Boolean(state.project) },
    { id: "project-report", label: "Export project report", run: exportProjectReport, enabled: Boolean(state.project) },
    { id: "anonymized-report", label: "Export anonymized report", run: () => exportProjectReport({ anonymized: true }), enabled: Boolean(state.project) },
    { id: "local-ai-pretranslate", label: "Local AI pre-translate", run: pretranslateWithLocalAi, enabled: Boolean(state.project && !state.localAi.running) },
    { id: "local-ai-review", label: "AI review active segment", run: reviewActiveSegmentWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-review-batch", label: "AI QA batch", run: reviewBatchWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair", label: "Suggest AI tag repair", run: repairActiveSegmentTagsWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-tag-repair-batch", label: "Repair AI tags batch", run: repairBatchTagsWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-draft", label: "Polish active draft with AI", run: polishActiveSegmentDraftWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-polish-batch", label: "Polish AI drafts batch", run: polishBatchDraftsWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-draft", label: "Adapt active draft with AI", run: adaptActiveSegmentDraftWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-adapt-batch", label: "Adapt AI drafts batch", run: adaptBatchDraftsWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants", label: "Suggest AI alternatives", run: suggestActiveSegmentVariantsWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-variants-batch", label: "Suggest AI alternatives batch", run: suggestBatchSegmentVariantsWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms", label: "Apply AI terminology", run: applyActiveSegmentTerminologyWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-apply-terms-batch", label: "Apply AI terminology batch", run: applyBatchTerminologyWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms", label: "Extract AI terms", run: extractActiveSegmentTermsWithLocalAi, enabled: Boolean(currentSegment() && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-terms-batch", label: "Extract AI terms batch", run: extractBatchTermsWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "local-ai-project-brief", label: "Generate AI project brief", run: generateProjectBriefWithLocalAi, enabled: Boolean(state.project && !state.localAi.running && !state.localAi.promptBusy) },
    { id: "openai-ai", label: "Create OpenAI suggestion", run: createOpenAiSuggestion, enabled: Boolean(currentSegment()) }
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
  if (!segmentId) return null;
  const recorded = appRuntime?.commands?.editTargetSessions?.finalize?.(segmentId) || null;
  if (recorded) renderUndoControls();
  return recorded;
}

function finalizePendingEditCommands(projectId = "") {
  const recorded = projectId
    ? appRuntime?.commands?.editTargetSessions?.finalizeProject?.(projectId) || []
    : appRuntime?.commands?.editTargetSessions?.finalizeAll?.() || [];
  if (recorded.length) renderUndoControls();
  return recorded;
}

function clearPendingSave(segment, options = {}) {
  if (!segment?.id) return;
  if (options.finalizeEdit !== false) finalizePendingEditCommand(segment.id);
  const record = state.saveTimers.get(segment.id);
  if (!record) return;
  clearTimeout(record.timer || record);
  state.saveTimers.delete(segment.id);
}

function clearAllPendingSaves() {
  finalizePendingEditCommands();
  state.saveTimers.forEach((record) => clearTimeout(record.timer || record));
  state.saveTimers.clear();
}

function queueSegmentSave(segment, delay = 450) {
  if (!segment?.id) return;
  const timer = setTimeout(async () => {
    try {
      finalizePendingEditCommand(segment.id);
      setSaveStatus("Saving...");
      const record = state.saveTimers.get(segment.id);
      const latest = state.segments.find((item) => item.id === segment.id) || record?.segment || segment;
      if (LOOPCAT_TEST_BUILD && latest[AUTOSAVE_SAVE_FAILURE_TEST_FLAG]) {
        Reflect.deleteProperty(latest, AUTOSAVE_SAVE_FAILURE_TEST_FLAG);
        throw new Error("Simulated autosave save failure");
      }
      await saveSegment(latest);
      if (state.saveTimers.get(segment.id)?.timer === timer) state.saveTimers.delete(segment.id);
      setSaveStatus(state.saveTimers.size ? `${state.saveTimers.size} save pending` : "Saved", "saved");
      renderRevisionHistory();
    } catch (error) {
      const record = state.saveTimers.get(segment.id);
      const latest = state.segments.find((item) => item.id === segment.id) || record?.segment || segment;
      if (state.saveTimers.get(segment.id)?.timer === timer) {
        state.saveTimers.delete(segment.id);
        queueSegmentSave(latest, AUTOSAVE_RETRY_DELAY_MS);
      }
      setSaveStatus(`${error.message || "Save failed"}; retrying autosave`, "dirty");
    }
  }, delay);
  state.saveTimers.set(segment.id, { timer, segment });
}

function pendingSaveRecords(projectId = "") {
  return Array.from(state.saveTimers.entries())
    .map(([id, record]) => ({ id, timer: record.timer || record, segment: record.segment }))
    .filter((record) => record.segment && (!projectId || record.segment.projectId === projectId));
}

function clearPendingDocumentSaves(projectId, documentId) {
  pendingSaveRecords(projectId)
    .filter((record) => record.segment.documentId === documentId)
    .forEach((record) => {
      finalizePendingEditCommand(record.id);
      clearTimeout(record.timer);
      state.saveTimers.delete(record.id);
    });
}

async function flushPendingSegmentSaves(projectId = "") {
  finalizePendingEditCommands(projectId);
  const records = pendingSaveRecords(projectId);
  if (!records.length) return [];
  records.forEach((record) => {
    clearTimeout(record.timer);
    state.saveTimers.delete(record.id);
  });
  const pendingSegments = records.map((record) => record.segment);
  try {
    if (LOOPCAT_TEST_BUILD && pendingSegments.some((segment) => segment[FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated pending save flush failure");
    }
    if (pendingSegments.length) await saveSegments(pendingSegments);
  } catch (error) {
    records.forEach((record) => queueSegmentSave(record.segment, 2000));
    throw error;
  }
  return pendingSegments;
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
  const knownIds = new Set(state.projects.map((project) => project.id).filter(Boolean));
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
  return Boolean(state.importTask || state.saveTimers.size || hasUnsavedWorkspacePackages());
}

function handleBeforeUnload(event) {
  if (!shouldWarnBeforeUnload()) return;
  event.preventDefault();
  event.returnValue = "";
}

function markWorkspaceDirty(projectId = state.project?.id) {
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
  const projectIds = state.projects
    .filter((project) => projectUsesResource(project, type, name, sourceLang, targetLang))
    .map((project) => project.id);
  markWorkspaceProjectsDirty(projectIds);
  return projectIds.length;
}

function clearWorkspaceDirty(projectId = state.project?.id) {
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
    hasProject: Boolean(state.project)
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

function dismissBackupReminder(projectId = state.project?.id, hours = BACKUP_REMINDER_DISMISS_HOURS) {
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

function latestProjectPackageExport(project = state.project) {
  const history = (project?.exportHistory || []).filter((entry) => entry.type === "project-package" && entry.createdAt);
  return history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

function backupReminderInfo(project = state.project, activityEvents = state.activityEvents, now = new Date()) {
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
  return state.project?.id === projectId
    ? state.project
    : state.projects.find((project) => project.id === projectId) || state.projectSummaries.find((project) => project.id === projectId) || null;
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
  return Number(state.projectSummaryRevisions.get(projectId) || 0);
}

function markProjectSummaryDirty(projectId) {
  if (!projectId) return;
  state.projectSummaryRevisions.set(projectId, projectSummaryRevision(projectId) + 1);
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
  const cachedById = new Map(state.projectSummaries.map((summary) => [summary.id, summary]));
  state.projectSummaries = await Promise.all(state.projects.map((project) => {
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
    const inMemorySegments = state.project?.id === project.id ? state.segments : null;
    return summarizeProject(project, inMemorySegments, revision);
  }));
  renderLanguagePairFilter();
  renderProjectsView();
}

async function loadProjects(selectFirst = false) {
  state.projects = await listProjects();
  const knownProjectIds = new Set(state.projects.map((project) => project.id));
  for (const projectId of state.projectSummaryRevisions.keys()) {
    if (!knownProjectIds.has(projectId)) state.projectSummaryRevisions.delete(projectId);
  }
  pruneWorkspaceDirtyProjectIds();
  await refreshProjectSummaries();
  renderProjectList();
  renderEditor();
  void refreshTrashSummary();
  if (selectFirst && !state.project && state.projects[0]) {
    await openProject(state.projects[0].id);
  }
}

function setView(view) {
  if (view === "projects") applicationNavigation?.openProjects?.();
  else if (view === "resources") applicationNavigation?.openResources?.();
  else if (view === "project") applicationNavigation?.openProject?.(state.project?.id || null, currentActiveIndex());
  else applicationNavigation?.openEditor?.(applicationNavigationPayload({ view: "editor" }));
  renderEditor();
  if (view === "projects") refreshProjectSummaries();
  if (view === "resources") refreshResources();
}

function showProjectHome() {
  if (!state.project) return;
  const activeIndex = state.segments.length ? 0 : -1;
  applicationNavigation?.openProject?.(state.project.id, activeIndex);
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

function renderProjectResourcePickers(project = state.project) {
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
  if (!state.project) {
    state.projectTerms = [];
    return;
  }
  state.projectTerms = await listTerms({
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    termBaseNames: projectTermBaseNames()
  });
  invalidateSegmentFilterCache();
  renderTermbaseSelect();
  if (rerender) renderSegments({ preserveScroll: true });
}

async function projectTermsForValidation() {
  if (!state.project) return [];
  return listTerms({
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    termBaseNames: projectTermBaseNames()
  });
}

async function logProjectActivity(type, summary, detail = {}, project = state.project) {
  if (!project) return null;
  const event = await recordActivityEvent({ projectId: project.id, type, summary, detail });
  if (event && state.project?.id === project.id) {
    state.activityEvents = [event, ...state.activityEvents.filter((item) => item.id !== event.id)];
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
    if (LOOPCAT_TEST_BUILD && ["export", "resource-export"].includes(type) && state.project?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG]) {
      throw new Error("Simulated export activity log failure");
    }
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || state.project?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    await logProjectActivity(type, summary, detail);
    return true;
  } catch (activityError) {
    console.warn(`${label} activity log failed.`, activityError);
    if (state.project?.id) markWorkspaceDirty(state.project.id);
    return false;
  }
}

async function logOptionalActivityForProject(projectId, type, summary, detail = {}, label = summary || type) {
  try {
    if (LOOPCAT_TEST_BUILD && ["import", "resource-import"].includes(type) && (state[IMPORT_ACTIVITY_FAILURE_TEST_FLAG] || state.project?.[IMPORT_ACTIVITY_FAILURE_TEST_FLAG])) {
      throw new Error("Simulated import activity log failure");
    }
    const event = await recordActivityEvent({ projectId, type, summary, detail });
    if (state.project?.id === projectId) {
      state.activityEvents = await listActivityEvents(projectId);
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
  const project = state.project;
  if (!project || currentApplicationView() !== "project" || !els.projectAnalysis) return;
  const segments = state.segments;
  const tmEntries = await getAllByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`);
  if (run !== state.projectAnalysisRun || currentApplicationView() !== "project" || state.project?.id !== project.id) return;
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
  if (!state.projects.length) {
    replaceSafeHtml(els.projectList, `<div class="muted">${translatedSourceHtml("No projects yet.")}</div>`);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.projects.forEach((project) => {
    const button = document.createElement("button");
    button.className = `project-item ${state.project?.id === project.id ? "active" : ""}`;
    replaceSafeHtml(button, `<strong>${displaySafeHtml(project.name)}</strong><span>${escapeHtml(languagePair(project))}</span><span>${project.sourceFileName ? displaySafeHtml(project.sourceFileName) : uiLabelHtml("noSourceFile")}</span>`);
    button.addEventListener("click", () => openProject(project.id));
    fragment.append(button);
  });
  els.projectList.replaceChildren(fragment);
}

async function openProject(projectId) {
  await flushPendingSegmentSaves();
  state.project = state.projects.find((project) => project.id === projectId) || null;
  state.commandProjectId = state.project?.id || projectId || "";
  state.segments = prepareSegmentHistoryStates(state.project ? await getProjectSegments(projectId) : []);
  state.activityEvents = state.project ? await listActivityEvents(projectId) : [];
  await refreshProjectTerms();
  const activeIndex = state.segments.length ? 0 : -1;
  await filterPresetReady;
  await filterPresetController?.restoreForProject?.(state.project?.id || projectId);
  applicationNavigation?.openProject?.(state.project?.id || projectId, activeIndex);
  renderAll();
  if (currentApplicationView() === "editor") await refreshSidebar();
}

async function openProjectFile(documentId) {
  if (!state.project) return;
  const first = state.segments.findIndex((segment) => segment.documentId === documentId);
  applicationNavigation?.openEditor?.({
    projectId: state.project.id,
    documentId,
    segmentId: state.segments[first]?.id || "",
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

function localAiSettingsFromForm() {
  const projectSettings = localAISettingsStore?.projectSettings
    ? localAISettingsStore.projectSettings(state.project)
    : {};
  const form = aiAdministrationController?.readLocalForm?.() || {};
  const formSourceCode = normalizeLanguageInputValue(form.sourceCode || form.sourceLanguage || projectSettings.sourceCode || state.project?.sourceLang);
  const formTargetCode = normalizeLanguageInputValue(form.targetCode || form.targetLanguage || projectSettings.targetCode || state.project?.targetLang);
  const formSourceLanguage = form.sourceLanguage
    ? languageNameForUi(normalizeLanguageInputValue(form.sourceLanguage))
    : projectSettings.sourceLanguage;
  const formTargetLanguage = form.targetLanguage
    ? languageNameForUi(normalizeLanguageInputValue(form.targetLanguage))
    : projectSettings.targetLanguage;
  return localAISettingsStore.defaults({
    ...projectSettings,
    providerId: form.providerId || projectSettings.providerId,
    baseUrl: form.baseUrl || projectSettings.baseUrl || OLLAMA_DEFAULT_BASE_URL,
    model: form.model || projectSettings.model || DEFAULT_LOCAL_AI_MODEL,
    sourceLanguage: formSourceLanguage,
    sourceCode: formSourceCode || projectSettings.sourceCode || state.project?.sourceLang,
    targetLanguage: formTargetLanguage,
    targetCode: formTargetCode || projectSettings.targetCode || state.project?.targetLang,
    mode: form.mode || projectSettings.mode,
    variantMode: form.variantMode || projectSettings.variantMode,
    adaptMode: form.adaptMode || projectSettings.adaptMode,
    concurrency: form.concurrency || projectSettings.concurrency,
    timeoutMs: form.timeoutMs || projectSettings.timeoutMs,
    overwriteExisting: Boolean(form.overwriteExisting),
    includeNearbyContext: form.includeNearbyContext !== false,
    preserveConfirmedLocked: form.preserveConfirmedLocked !== false
  }, state.project);
}

function assertLocalAiEndpointAllowed(settings) {
  if (
    settings?.providerId === "openai-compatible" &&
    !isAllowedOpenAiCompatibleHostedBaseUrl(settings.baseUrl)
  ) {
    throw new Error("This hosted OpenAI-compatible endpoint is not in LoopCAT's explicit provider allowlist. Choose a named hosted provider preset or use a loopback server such as LM Studio.");
  }
  return true;
}

function localAiRuntimeConfig(settings = localAiSettingsFromForm()) {
  assertLocalAiEndpointAllowed(settings);
  const secrets = aiAdministrationController?.readSecrets?.() || {};
  const typedKey = String(secrets.localAiKey || "").trim();
  if (typedKey) {
    saveLocalAiKey(typedKey, Boolean(secrets.rememberLocalAiKey), settings);
  }
  const apiKey = typedKey || storedLocalAiKey(settings) || (settings.providerId === "openai" ? storedOpenAiKey() : "");
  return {
    ...settings,
    apiKey
  };
}

function assertLocalAiRuntimeReady(settings, config, actionLabel = "using this provider") {
  assertLocalAiEndpointAllowed(settings);
  if (localAiProviderNeedsApiKey(settings.providerId, settings.baseUrl) && !String(config.apiKey || "").trim()) {
    throw new Error(`Add a provider API key before ${actionLabel}.`);
  }
  return true;
}

function setLocalAiStatus(status, text) {
  state.localAi.connectionStatus = status || "disconnected";
  state.localAi.statusText = redactSensitiveText(text || "");
  aiAdministrationController?.renderStatus?.({
    connectionStatus: state.localAi.connectionStatus,
    text: state.localAi.statusText || "Disconnected"
  });
}

function renderLocalAiModelOptions(settings) {
  const currentModel = settings.model || DEFAULT_LOCAL_AI_MODEL;
  const models = state.localAi.models || [];
  aiAdministrationController?.renderModels?.({
    models,
    currentModel,
    emptyLabel: "Refresh models",
    manualLabel: uiSource("{value1} (manual)", { value1: currentModel })
  });
}

function localAiSampleText() {
  return aiAdministrationController?.readPromptState?.().sample || currentSegment()?.source || "";
}

function localAiPromptMode() {
  return aiAdministrationController?.readPromptState?.().mode || "pretranslate";
}

function localAiPromptModeLabel(mode = localAiPromptMode()) {
  return {
    pretranslate: "pre-translation",
    review: "review / QA",
    "tag-repair": "tag repair",
    polish: "draft polish",
    adapt: "draft adaptation",
    variants: "alternatives",
    "apply-terms": "terminology application",
    "extract-terms": "terminology extraction",
    "project-brief": "project brief"
  }[mode] || "prompt";
}

function localAiPromptTestSystem(mode = localAiPromptMode()) {
  return {
    review: "You are a senior translation reviewer inside LoopCAT. Return review notes only; do not translate, rewrite the full segment, or add generic encouragement.",
    "tag-repair": "You are a CAT-tool tag repair assistant. Return only the repaired target segment.",
    polish: "You are a CAT-tool style polishing assistant. Return only the improved target segment.",
    adapt: "You are a CAT-tool target adaptation assistant. Return only the adapted target segment.",
    variants: "You are a CAT-tool target alternatives assistant. Return only the requested alternatives.",
    "apply-terms": "You are a CAT-tool terminology application assistant. Return only the revised target segment.",
    "extract-terms": "You are a CAT-tool terminology extraction assistant. Return only the requested JSON array.",
    "project-brief": "You are a CAT-tool project brief assistant. Return only concise reusable translation instructions."
  }[mode] || "You are a professional CAT-tool translation assistant. Return only the requested output.";
}

function localAiPromptTestContextLabels(mode = localAiPromptMode()) {
  const common = ["configured provider URL"];
  if (mode === "project-brief") return ["project metadata", "document names", "sample segments", "termbase hints", ...common];
  if (mode === "extract-terms") return ["sample source text", "current target draft", ...common];
  if (mode === "pretranslate") return ["sample source text", ...common];
  if (mode === "review") return ["sample source text", "current target draft", "project glossary hints", ...common];
  if (mode === "apply-terms") return ["sample source text", "current target draft", "project terminology hints", ...common];
  return ["sample source text", "current target draft", "project style instructions", "project glossary hints", ...common];
}

function localAiPreviewTermsForSegment(segment = currentSegment()) {
  if (!Array.isArray(state.projectTerms) || !state.projectTerms.length) return [];
  const source = stableLower(String(segment?.source || ""));
  const target = stableLower(String(segment?.target || ""));
  const matching = state.projectTerms.filter((term) => {
    const sourceTerm = stableLower(term.sourceTerm || "");
    const targetTerm = stableLower(term.targetTerm || "");
    return Boolean(
      (sourceTerm && source.includes(sourceTerm)) ||
        (targetTerm && target.includes(targetTerm))
    );
  });
  return (matching.length ? matching : state.projectTerms).slice(0, 12);
}

function localAiPromptPreviewRequest(settings = localAiSettingsFromForm(), mode = localAiPromptMode()) {
  const activeSegment = currentSegment();
  const sourceText = String(localAiSampleText() || activeSegment?.source || "");
  const previewSegment = {
    ...(activeSegment || {}),
    source: sourceText,
    target: activeSegment?.target || "",
    tags: activeSegment ? segmentTags(activeSegment) : []
  };
  const glossaryTerms = localAiPreviewTermsForSegment(previewSegment);
  const common = {
    project: state.project,
    segment: previewSegment,
    sourceLanguage: settings.sourceLanguage,
    sourceCode: settings.sourceCode,
    targetLanguage: settings.targetLanguage,
    targetCode: settings.targetCode,
    sourceText,
    targetText: previewSegment.target,
    protectedTokens: previewSegment.tags.map((tag) => tag.text || tag.label || "").filter(Boolean),
    glossaryTerms,
    terms: glossaryTerms,
    tmMatches: [],
    styleGuide: state.project?.aiSettings?.styleGuide || "",
    variantMode: settings.variantMode,
    adaptMode: settings.adaptMode,
    surroundingSegments: settings.includeNearbyContext && activeSegment
      ? localAiSurroundingSegmentsForSegment(activeSegment, { settings })
      : []
  };
  const prompt = {
    review: () => buildAiReviewPrompt(common),
    "tag-repair": () => buildTagRepairPrompt(common),
    polish: () => buildStylePolishPrompt(common),
    adapt: () => buildDraftAdaptationPrompt(common),
    variants: () => buildTargetVariantsPrompt(common),
    "apply-terms": () => buildTerminologyApplicationPrompt(common),
    "extract-terms": () => buildTerminologyExtractionPrompt(common),
    "project-brief": () => buildProjectBriefPrompt({
      ...common,
      documents: projectDocuments(),
      sampleSegments: projectBriefSampleSegments(),
      terms: (state.projectTerms || []).slice(0, 12)
    })
  }[mode]?.() || buildTranslateGemmaPrompt({
    ...common,
    text: sourceText
  });
  return {
    mode,
    label: localAiPromptModeLabel(mode),
    prompt,
    sourceText,
    segment: previewSegment,
    glossaryTerms,
    system: localAiPromptTestSystem(mode)
  };
}

function renderLocalAiPromptPreview() {
  const settings = localAiSettingsFromForm();
  aiAdministrationController?.renderPromptPreview?.(localAiPromptPreviewRequest(settings).prompt);
}

function renderLocalAiProgress() {
  aiAdministrationController?.renderProgress?.({
    running: state.localAi.running,
    value: state.localAi.progress
  });
}

function renderLocalAiOutput(value, options) {
  aiAdministrationController?.renderOutput?.(value, options);
}

function localAiPrivacyText(settings) {
  const sharesExternally = localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model);
  const needsKey = localAiProviderNeedsApiKey(settings.providerId, settings.baseUrl);
  if (sharesExternally) {
    if (settings.providerId === "ollama" && !needsKey) {
      return "Ollama cloud model mode: requests are sent to local Ollama first, and cloud-suffixed models may be processed through Ollama Cloud after confirmation.";
    }
    return needsKey
      ? "Hosted AI mode: source text is sent to the configured provider URL after confirmation. API keys stay in this browser and are never exported with project packages."
      : "Network AI mode: source text is sent to the configured provider URL after confirmation.";
  }
  return settings.providerId === "ollama"
    ? "Local AI mode: requests are sent to the loopback provider URL below. Ollama is the default local provider."
    : "Local AI mode: requests are sent only to the loopback provider URL below.";
}

function endpointPathLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return String(url || "");
  }
}

function localAiEndpointSummary(settings = {}) {
  const providerId = settings.providerId || "ollama";
  const baseUrl = settings.baseUrl || OLLAMA_DEFAULT_BASE_URL;
  if (providerId === "ollama") {
    return {
      models: `GET ${endpointPathLabel(ollamaApiUrl(baseUrl, "/tags"))}`,
      translate: `POST ${endpointPathLabel(ollamaApiUrl(baseUrl, "/chat"))}`
    };
  }
  if (providerId === "opus-cat") {
    return {
      models: `GET ${endpointPathLabel(opusCatApiUrl(baseUrl, "/ListSupportedLanguagePairs"))}`,
      translate: `GET ${endpointPathLabel(opusCatApiUrl(baseUrl, "/TranslateJson"))}`
    };
  }
  if (providerId === "openai") {
    return {
      models: `GET ${endpointPathLabel(openAiApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(openAiApiUrl(baseUrl, "/responses"))}`
    };
  }
  if (providerId === "deepseek") {
    return {
      models: `GET ${endpointPathLabel(deepSeekApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(deepSeekApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "gemini") {
    return {
      models: `GET ${endpointPathLabel(geminiApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(geminiApiUrl(baseUrl, "/interactions"))}`
    };
  }
  if (providerId === "anthropic") {
    return {
      models: `GET ${endpointPathLabel(anthropicApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(anthropicApiUrl(baseUrl, "/messages"))}`
    };
  }
  if (providerId === "cohere") {
    return {
      models: `GET ${endpointPathLabel(cohereApiUrl(baseUrl, "/v1/models"))}`,
      translate: `POST ${endpointPathLabel(cohereApiUrl(baseUrl, "/v2/chat"))}`
    };
  }
  if (providerId === "mistral") {
    return {
      models: `GET ${endpointPathLabel(mistralApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(mistralApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "xai") {
    return {
      models: `GET ${endpointPathLabel(xAiApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(xAiApiUrl(baseUrl, "/responses"))}`
    };
  }
  if (providerId === "perplexity") {
    return {
      models: `GET ${endpointPathLabel(perplexityApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(perplexityApiUrl(baseUrl, "/sonar"))}`
    };
  }
  if (providerId === "groq") {
    return {
      models: `GET ${endpointPathLabel(groqApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(groqApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "together") {
    return {
      models: `GET ${endpointPathLabel(togetherApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(togetherApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "openrouter") {
    return {
      models: `GET ${endpointPathLabel(openRouterApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(openRouterApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "huggingface") {
    return {
      models: `GET ${endpointPathLabel(huggingFaceApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(huggingFaceApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "deepinfra") {
    return {
      models: `GET ${endpointPathLabel(deepInfraApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(deepInfraApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "fireworks") {
    return {
      models: `GET ${endpointPathLabel(fireworksApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(fireworksApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  if (providerId === "azure-openai") {
    return {
      models: `GET ${endpointPathLabel(azureOpenAiApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(azureOpenAiApiUrl(baseUrl, "/responses"))}`
    };
  }
  if (providerId === "openai-compatible") {
    return {
      models: `GET ${endpointPathLabel(openAiCompatibleApiUrl(baseUrl, "/models"))}`,
      translate: `POST ${endpointPathLabel(openAiCompatibleApiUrl(baseUrl, "/chat/completions"))}`
    };
  }
  return { models: "Model list endpoint depends on provider", translate: "Translation endpoint depends on provider" };
}

function localAiCanPullModel(settings, provider) {
  if (!provider?.pullModel) return false;
  if (settings.providerId === "ollama" && isOllamaCloudBaseUrl(settings.baseUrl)) return false;
  return true;
}

function localAiProviderCapabilityLabels(settings, provider) {
  const labels = [];
  if (provider?.testConnection) labels.push("Connection test");
  if (provider?.listModels) labels.push("Model refresh");
  if (provider?.translateSegment) labels.push("Pre-translate");
  if (provider?.completePrompt) {
    labels.push("Prompt test");
    labels.push("Review/edit tools");
  }
  if (localAiCanPullModel(settings, provider)) labels.push("Pull model");
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) labels.push("Confirmation before send");
  return labels.length ? labels : ["No AI commands available"];
}

function localAiProviderSummaryView(settings) {
  const provider = aiProviderService.get(settings.providerId);
  const preset = localAiProviderPresetForSettings(settings);
  const sharesExternally = localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model);
  const needsKey = localAiProviderNeedsApiKey(settings.providerId, settings.baseUrl);
  const endpoints = localAiEndpointSummary(settings);
  const canPull = localAiCanPullModel(settings, provider);
  const guidance = localAiProviderGuidance(settings);
  const capabilities = localAiProviderCapabilityLabels(settings, provider);
  const badges = [
    sharesExternally ? uiLabel("hostedNetwork") : uiLabel("localLoopback"),
    needsKey ? uiLabel("apiKeyRequired") : uiLabel("noApiKey"),
    canPull ? uiLabel("pullSupported") : uiLabel("manualModel"),
    settings.includeNearbyContext !== false ? uiLabel("nearbyContextOn") : uiLabel("nearbyContextOff")
  ];
  return {
    name: preset?.label || provider?.name || settings.providerId || "AI provider",
    model: settings.model || DEFAULT_LOCAL_AI_MODEL,
    badges,
    guidance: uiSource(guidance),
    baseLabel: uiLabel("base"),
    baseUrl: settings.baseUrl || OLLAMA_DEFAULT_BASE_URL,
    toolsLabel: uiLabel("tools"),
    capabilities: capabilities.map((item) => uiSource(item)).join(" - "),
    modelsLabel: uiLabel("models"),
    modelsEndpoint: endpoints.models,
    translateLabel: uiLabel("translate"),
    translateEndpoint: endpoints.translate
  };
}

function renderLocalAiProviderControls(settings) {
  const provider = aiProviderService.get(settings.providerId);
  const needsKey = localAiProviderNeedsApiKey(settings.providerId, settings.baseUrl);
  const canPull = localAiCanPullModel(settings, provider);
  aiAdministrationController?.renderProvider?.({
    privacyText: localAiPrivacyText(settings),
    summary: localAiProviderSummaryView(settings),
    running: state.localAi.running,
    promptBusy: state.localAi.promptBusy,
    canPull,
    pullLabel: canPull
      ? uiSource("Pull {value1}", { value1: settings.model || DEFAULT_LOCAL_AI_MODEL })
      : uiSource("Pull unavailable"),
    canStartServer: canStartLmStudioServer(settings),
    needsKey,
    rememberLocalKey: Boolean(localAiKeySnapshot(settings).local),
    storedLocalKey: storedLocalAiKey(settings)
  });
}

function localAiPresetGroupLabel(preset) {
  if (!preset) return uiLabel("hostedProviders");
  if (preset.id === "ollama-local" || preset.id === "lm-studio" || preset.id === "opus-cat") return uiLabel("localRuntimes");
  if (preset.id === "ollama-local-cloud" || preset.id === "ollama-cloud") return uiLabel("ollamaHostedCloud");
  if (preset.id === "azure-openai") return uiLabel("managedDeployments");
  if (["groq", "together", "openrouter", "huggingface", "deepinfra", "fireworks"].includes(preset.id)) return uiSource("Hosted routers");
  return uiLabel("hostedProviders");
}

function renderLocalAiPresetOptions(settings) {
  const currentPreset = localAiProviderPresetForSettings(settings);
  const currentValue = currentPreset?.id || "custom";
  const groups = new Map();
  LOCAL_AI_PROVIDER_PRESETS.forEach((preset) => {
    const groupLabel = localAiPresetGroupLabel(preset);
    const group = groups.get(groupLabel) || [];
    group.push({ id: preset.id, label: preset.label });
    groups.set(groupLabel, group);
  });
  aiAdministrationController?.renderPresets?.({
    groups: Array.from(groups, ([label, options]) => ({ label, options })),
    currentPresetId: currentValue,
    customLabel: "Custom provider"
  });
}

function applyLocalAiProviderPreset(presetId) {
  const preset = localAiProviderPresetById(presetId);
  if (!preset) return;
  aiAdministrationController?.setProviderFields?.({
    providerId: preset.providerId,
    baseUrl: preset.baseUrl,
    model: preset.model
  });
  state.localAi.models = [];
  setOpusCatConnectionHelpVisible(false);
  setLocalAiStatus("disconnected", `${preset.label} selected`);
  const settings = localAiSettingsFromForm();
  renderLocalAiPresetOptions(settings);
  renderLocalAiProviderControls(settings);
  renderLocalAiModelOptions(settings);
  renderLocalAiPromptPreview();
}

function handleLocalAiPresetChange(presetId) {
  if (presetId !== "custom") {
    applyLocalAiProviderPreset(presetId);
    return;
  }
  renderLocalAiProviderControls(localAiSettingsFromForm());
  renderLocalAiPromptPreview();
}

function handleLocalAiProviderChange(providerId) {
  const provider = aiProviderService.get(providerId);
  aiAdministrationController?.setProviderFields?.({
    providerId,
    baseUrl: provider?.defaultBaseUrl || OLLAMA_DEFAULT_BASE_URL,
    model:
      provider?.defaultModel ||
      (providerId === "openai"
        ? OPENAI_DEFAULT_MODEL
        : providerId === "gemini"
          ? GEMINI_DEFAULT_MODEL
          : DEFAULT_LOCAL_AI_MODEL)
  });
  state.localAi.models = [];
  setOpusCatConnectionHelpVisible(false);
  setLocalAiStatus("disconnected", "Disconnected");
  const settings = localAiSettingsFromForm();
  renderLocalAiPresetOptions(settings);
  renderLocalAiProviderControls(settings);
  renderLocalAiModelOptions(settings);
  renderLocalAiPromptPreview();
}

function handleLocalAiBaseUrlInput() {
  setOpusCatConnectionHelpVisible(false);
  setLocalAiStatus("disconnected", "Disconnected");
  const settings = localAiSettingsFromForm();
  renderLocalAiPresetOptions(settings);
  renderLocalAiProviderControls(settings);
}

function handleClearLocalAiKey() {
  if (clearLocalAiKey()) setSaveStatus("Local AI key cleared from this browser", "saved");
}

function handleClearOpenAiKey() {
  if (clearOpenAiKey()) setSaveStatus("OpenAI key cleared from this browser", "saved");
}

function handleLocalAiFormChanged({ providerChanged = false } = {}) {
  if (providerChanged) renderLocalAiProviderControls(localAiSettingsFromForm());
  renderLocalAiPromptPreview();
}

function handleLocalAiLanguageChanged(field, value, eventType) {
  if (eventType !== "input" || shouldLiveSyncLanguageInput({ value })) syncLocalAiLanguageFields(field);
  renderLocalAiPromptPreview();
}

function renderLocalAiCommandCentre() {
  const settings = localAISettingsStore.projectSettings(state.project);
  const currentPreset = localAiProviderPresetForSettings(settings);
  const groups = new Map();
  LOCAL_AI_PROVIDER_PRESETS.forEach((preset) => {
    const groupLabel = localAiPresetGroupLabel(preset);
    const group = groups.get(groupLabel) || [];
    group.push({ id: preset.id, label: preset.label });
    groups.set(groupLabel, group);
  });
  const provider = aiProviderService.get(settings.providerId);
  const canPull = localAiCanPullModel(settings, provider);
  const needsKey = localAiProviderNeedsApiKey(settings.providerId, settings.baseUrl);
  aiAdministrationController?.render?.({
    settings: {
      ...settings,
      sourceLanguage: settings.sourceLanguage || languageNameForUi(settings.sourceCode || state.project?.sourceLang),
      sourceCode: normalizeLanguageInputValue(settings.sourceCode || state.project?.sourceLang),
      targetLanguage: settings.targetLanguage || languageNameForUi(settings.targetCode || state.project?.targetLang),
      targetCode: normalizeLanguageInputValue(settings.targetCode || state.project?.targetLang)
    },
    presets: {
      groups: Array.from(groups, ([label, options]) => ({ label, options })),
      currentPresetId: currentPreset?.id || "custom",
      customLabel: "Custom provider"
    },
    models: {
      models: state.localAi.models || [],
      currentModel: settings.model || DEFAULT_LOCAL_AI_MODEL,
      emptyLabel: "Refresh models",
      manualLabel: uiSource("{value1} (manual)", { value1: settings.model || DEFAULT_LOCAL_AI_MODEL })
    },
    provider: {
      privacyText: localAiPrivacyText(settings),
      summary: localAiProviderSummaryView(settings),
      running: state.localAi.running,
      promptBusy: state.localAi.promptBusy,
      canPull,
      pullLabel: canPull
        ? uiSource("Pull {value1}", { value1: settings.model || DEFAULT_LOCAL_AI_MODEL })
        : uiSource("Pull unavailable"),
      canStartServer: canStartLmStudioServer(settings),
      needsKey,
      rememberLocalKey: Boolean(localAiKeySnapshot(settings).local),
      storedLocalKey: storedLocalAiKey(settings)
    },
    status: {
      connectionStatus: state.localAi.connectionStatus,
      text: state.localAi.statusText || "Disconnected"
    },
    progress: {
      running: state.localAi.running,
      value: state.localAi.progress
    },
    promptPreview: localAiPromptPreviewRequest(settings).prompt,
    availability: {
      hasProject: Boolean(state.project),
      hasSegment: Boolean(currentSegment()),
      running: state.localAi.running,
      promptBusy: state.localAi.promptBusy
    }
  });
}

async function persistLocalAiSettings(options = {}) {
  if (!state.project) return localAiSettingsFromForm();
  const settings = localAiSettingsFromForm();
  try {
    assertLocalAiEndpointAllowed(settings);
  } catch {
    return settings;
  }
  localAISettingsStore.save(settings);
  const aiSettings = defaultAiSettings({
    ...state.project.aiSettings,
    ...localAISettingsStore.projectUpdateFields(settings, state.project)
  });
  state.project = await updateProject({ ...state.project, aiSettings });
  state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  markWorkspaceDirty();
  if (!options.silent) setSaveStatus("Local AI settings saved", "saved");
  return settings;
}

function renderEditor() {
  syncLegacyApplicationState();
  const hasProject = Boolean(state.project);
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
  if (!state.project) return;

  const resources = projectResourceSummary();
  els.projectTitle.textContent = displaySafeText(state.project.name);
  els.projectMeta.textContent = `${languagePair()} - ${uiLabel("mainTm")}: ${displaySafeText(resources.mainTm, uiLabel("none"))} - ${displaySafeText(resources.tmLabel)} - ${displaySafeText(resources.tbLabel)}`;
  els.projectDomainEditInput.value = state.project.domain || "";
  els.domainForm.classList.add("clean");
  els.domainForm.classList.toggle("hidden", Boolean((state.project.domain || "").trim()));
  replaceSafeHtml(els.projectInfo, `
    <dt>${uiLabelHtml("name")}</dt><dd>${displaySafeHtml(state.project.name)}</dd>
    <dt>${translatedSourceHtml("Creator")}</dt><dd>${displaySafeHtml(state.project.creatorName || uiLabel("notSet"))}</dd>
    <dt>${translatedSourceHtml("Domain")}</dt><dd>${displaySafeHtml(state.project.domain || uiLabel("notSet"))}</dd>
    <dt>${uiLabelHtml("languages")}</dt><dd>${escapeHtml(languagePair())}</dd>
    <dt>${translatedSourceHtml("Workspace")}</dt><dd>${escapeHtml(state.project.workspaceId || "local-workspace")}</dd>
    <dt>${uiLabelHtml("sourceFile")}</dt><dd>${displaySafeHtml(state.project.sourceFileName || uiLabel("notImported"))}</dd>
    <dt>${uiLabelHtml("mainTm")}</dt><dd>${displaySafeHtml(resources.mainTm)}</dd>
    <dt>${uiLabelHtml("linkedTms")}</dt><dd>${displaySafeHtml(resources.tmNames.join(", "))}</dd>
    <dt>${uiLabelHtml("linkedTbs")}</dt><dd>${displaySafeHtml(resources.tbNames.join(", "))}</dd>
    <dt>${translatedSourceHtml("Documents")}</dt><dd>${projectDocuments().length || 0}</dd>
    <dt>${uiLabelHtml("segmentsTitle")}</dt><dd>${state.segments.length}</dd>
    <dt>${uiLabelHtml("activity")}</dt><dd>${uiLabelHtml("eventCount", { count: state.activityEvents.length })}</dd>
  `);
  const ai = defaultAiSettings(state.project.aiSettings);
  aiAdministrationController?.renderGlobalSettings?.({
    settings: ai,
    storedKey: storedOpenAiKey(),
    rememberKey: Boolean(openAiKeySnapshot().local),
    storageText: `OpenAI key: ${openAiKeyStorageLabel()}. API keys stay in this browser and are never exported with project packages.`
  });
  renderLocalAiCommandCentre();
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
  if (!state.project) return;
  const documents = projectDocuments();
  const documentStatsById = projectDocumentStats(documents);
  const total = aggregateDocumentStats(documentStatsById);
  const sourceWords = total.words;
  const resources = projectResourceSummary();
  els.projectHomeTitle.textContent = displaySafeText(state.project.name);
  els.projectHomeMeta.textContent = `${languagePair()} - ${displaySafeText(state.project.domain || uiLabel("noDomain"))} - ${uiLabel("mainTm")}: ${displaySafeText(resources.mainTm, uiLabel("none"))} - ${displaySafeText(resources.tmLabel)} - ${displaySafeText(resources.tbLabel)}`;
  replaceSafeHtml(els.projectHomeStats, `
    <div><strong>${total.percent}%</strong><span>${uiLabelHtml("confirmed")}</span></div>
    <div><strong>${documents.length}</strong><span>${uiLabelHtml("files")}</span></div>
    <div><strong>${state.segments.length}</strong><span>${uiLabelHtml("segments")}</span></div>
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
  const pairs = Array.from(new Set(state.projects.map((project) => languagePairKey(project)).filter((pair) => pair !== "::"))).sort();
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
  const summaries = state.projectSummaries.map((project) => ({
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

async function confirmDeleteProject(projectId = state.project?.id) {
  const project = state.projects.find((item) => item.id === projectId);
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
    if (state.project?.id === project.id) {
      state.project = null;
      state.segments = [];
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
  if (!state.project || !documentInfo) return false;
  const ok = uiConfirm(`Move file "${displaySafeText(documentInfo.name)}" to Trash?`);
  if (!ok) return false;
  try {
    await flushPendingSegmentSaves(state.project.id);
    if (LOOPCAT_TEST_BUILD && documentInfo[FILE_DELETE_FAILURE_TEST_FLAG]) throw new Error("Simulated file delete failure");
    const command = appRuntime?.commands?.createDeleteDocumentCommand?.({
      project: state.project,
      documentId: documentInfo.id
    });
    if (!command) throw new Error("The reversible file deletion service is unavailable.");
    const commandResult = await appRuntime.commands.bus.execute(command);
    state.commandProjectId = state.project.id;
    state.project = commandResult.result.project;
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
    selectApplicationDocument("");
    selectApplicationSegment(state.segments.length ? 0 : -1);
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
  if (!state.project) return false;
  if (resource.sourceLang !== state.project.sourceLang || resource.targetLang !== state.project.targetLang) return false;
  const names = type === "tm" ? projectTmNames() : projectTermBaseNames();
  return !names.includes(resource.name);
}

async function addResourceToCurrentProject(type, resource) {
  if (!state.project || !canAddResourceToCurrentProject(type, resource)) return;
  const links = projectResourceLinks(state.project);
  links.push({
    id: makeId("resource-link"),
    type: type === "tm" ? "tm" : "termbase",
    name: resource.name,
    role: type === "tm" ? "reference" : undefined
  });
  state.project = await updateProject({ ...state.project, resourceLinks: links });
  state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
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
      projectId: state.project?.id || null
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
      projectId: state.project?.id || null
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
      projectId: state.project?.id || null
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
        ready.then(() => insertTagIntoTarget(tag.text));
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
  const termMarkers = termRanges(text, state.projectTerms)
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
        ready.then(() => insertTagIntoTarget(marker.tag.text));
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
    chip.addEventListener("click", () => insertTagIntoTarget(tag.text));
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
  const segment = state.segments[index];
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
  textarea.addEventListener("focus", () => {
    row.querySelector(".target-cell")?.classList.add("editing");
    setActiveSegment(index);
  });
  textarea.addEventListener("blur", () => {
    row.querySelector(".target-cell")?.classList.remove("editing");
    finalizePendingEditCommand(segment.id);
  });
  textarea.addEventListener("input", () => updateSegmentDraft(index, textarea.value));
  textarea.addEventListener("keydown", (event) => handleEditorKeydown(event, index));
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
  const wrap = els.segmentGridWrap;
  const viewportRows = Math.ceil((wrap?.clientHeight || 720) / SEGMENT_ROW_HEIGHT);
  const scrollRows = Math.floor((wrap?.scrollTop || 0) / SEGMENT_ROW_HEIGHT);
  const start = Math.max(0, scrollRows - SEGMENT_ROW_BUFFER);
  const end = Math.min(indexes.length, scrollRows + viewportRows + SEGMENT_ROW_BUFFER);
  return { start, end, total: indexes.length, indexes: indexes.slice(start, end) };
}

function renderSegments(options = {}) {
  const indexes = filteredSegmentIndexes();
  const scrollTop = els.segmentGridWrap?.scrollTop || 0;
  if (!indexes.length) {
    state.segmentWindow = { start: 0, end: 0, total: 0, indexes: [] };
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
  if (
    options.fromScroll &&
    win.start === state.segmentWindow.start &&
    win.end === state.segmentWindow.end &&
    win.total === state.segmentWindow.total
  ) {
    return;
  }
  const activeElement = document.activeElement;
  if (options.fromScroll && els.segmentGridWrap.contains(activeElement) && !win.indexes.includes(currentActiveIndex())) {
    activeElement.blur();
  }
  state.segmentWindow = win;
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
  const segment = state.segments[index];
  if (!row || !segment) return;
  row.classList.toggle("active", index === currentActiveIndex());
  row.classList.toggle("tag-warning-row", hasTagIssue(segment));
  renderTargetTagPreview(row, segment);
  renderStatusCell(row, segment);
}

function scheduleRowUpdate(index) {
  if (!Number.isInteger(index) || index < 0) return;
  state.pendingRowUpdates.add(index);
  if (state.segmentRowFrame) return;
  state.segmentRowFrame = requestAnimationFrame(() => {
    state.segmentRowFrame = 0;
    const indexes = Array.from(state.pendingRowUpdates);
    state.pendingRowUpdates.clear();
    indexes.forEach(updateRow);
  });
}

function scheduleRevisionHistoryRender() {
  if (state.revisionHistoryFrame) return;
  state.revisionHistoryFrame = requestAnimationFrame(() => {
    state.revisionHistoryFrame = 0;
    renderRevisionHistory();
  });
}

function calculateProgressSummary() {
  const total = state.segments.length;
  let confirmed = 0;
  let words = 0;
  for (const segment of state.segments) {
    if (segment.status === "confirmed") confirmed += 1;
    words += sourceWordCount(segment);
  }
  return { projectId: state.project?.id || "", total, confirmed, words };
}

function renderProgress(options = {}) {
  const previousStatus = options.previousStatus;
  const nextStatus = options.nextStatus;
  const cached = state.progressSummary;
  const canApplyStatusDelta =
    cached &&
    cached.projectId === (state.project?.id || "") &&
    cached.total === state.segments.length &&
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
  state.progressSummary = summary;
  const { total, confirmed, words } = summary;
  const open = total - confirmed;
  els.progressText.textContent = uiLabel("progressSummary", { confirmed, open, total });
  els.wordCountText.textContent = uiLabel("sourceWordCount", { count: words });
  els.progressFill.style.width = total ? `${Math.round((confirmed / total) * 100)}%` : "0";
}

function ensureSegmentVisible(index) {
  const position = filteredSegmentPosition(index);
  if (position === -1) return;
  const { start, end } = state.segmentWindow;
  if (position >= start && position < end) return;
  if (els.segmentGridWrap) {
    els.segmentGridWrap.scrollTop = Math.max(0, position * SEGMENT_ROW_HEIGHT - SEGMENT_ROW_HEIGHT);
  }
  renderSegments();
}

async function setActiveSegment(index) {
  if (index < 0 || index >= state.segments.length) return;
  if (index === currentActiveIndex()) return;
  const oldIndex = currentActiveIndex();
  verticalFeatureState?.segmentGrid?.selectSegment(index, state.segments[index]?.id || "");
  verticalFeatureState?.inspector?.setContext({ segmentId: state.segments[index]?.id || "" });
  renderConfirmBusyState();
  ensureSegmentVisible(index);
  updateRow(oldIndex);
  updateRow(index);
  renderLocalAiPromptPreview();
  await refreshSidebar();
}

async function goToNextOpenSegment() {
  if (!state.segments.length) return;
  const start = Math.max(currentActiveIndex() + 1, 0);
  const afterCurrent = state.segments.findIndex((segment, index) => index >= start && isOpenSegment(segment));
  const beforeCurrent = state.segments.findIndex((segment, index) => index < start && isOpenSegment(segment));
  const next = afterCurrent !== -1 ? afterCurrent : beforeCurrent;
  if (next === -1) return;
  await setActiveSegment(next);
  if (!segmentPassesFilters(state.segments[next])) {
    updateEditorFilters({ status: "all" });
    els.segmentStatusFilter.value = "all";
    renderSegments();
  }
  focusActiveTextarea();
}

function updateSegmentDraft(index, target) {
  const segment = state.segments[index];
  if (!segment) return;
  const editTargetSessions = appRuntime?.commands?.editTargetSessions;
  if (editTargetSessions && !editTargetSessions.has(segment.id)) {
    editTargetSessions.begin({
      projectId: segment.projectId || state.project?.id,
      segmentId: segment.id,
      beforePatch: targetCommandPatch(segment),
      restorePatch: (patch, context) => restoreSegmentEditCommandPatch(segment.id, patch, context)
    });
  }
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
    state.pendingRowUpdates.delete(index);
  }
  renderProgress({ previousStatus, nextStatus: segment.status });
  scheduleRevisionHistoryRender();
  markWorkspaceDirty();
  editTargetSessions?.capture?.(segment.id, targetCommandPatch(segment), { activeSegmentId: segment.id });
  debounceSave(segment);
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
  const index = state.segments.findIndex((item) => item.id === segmentId);
  if (index < 0) throw new Error("The affected segment is no longer available.");
  const segment = state.segments[index];
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
    const selection = options.selection ? normalizedTargetSelection(options.selection, segment.target.length) : null;
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
    const index = state.segments.findIndex((segment) => segment.id === segmentId);
    if (index < 0) throw new Error("An affected pretranslation segment is no longer available.");
    currentById.set(segmentId, targetCommandPatch(state.segments[index]));
    return index;
  });
  const previousActiveId = currentSegment()?.id || "";
  try {
    const restored = patches.map((patch, offset) => {
      const segment = state.segments[indexes[offset]];
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
    const requestedIndex = state.segments.findIndex((segment) => segment.id === requestedActiveId);
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
      const index = state.segments.findIndex((segment) => segment.id === segmentId);
      if (index >= 0) applyTargetCommandPatch(state.segments[index], patch);
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
    const index = state.segments.findIndex((segment) => segment.id === snapshot?.id);
    if (index < 0) throw new Error("An affected segment is no longer available.");
    indexes.push(index);
    currentById.set(snapshot.id, structuredClone(state.segments[index]));
  }
  const previousActiveId = currentSegment()?.id || "";
  try {
    const restored = snapshots.map((snapshot, offset) => {
      const next = prepareCommandRestoreSegmentSnapshot(snapshot, currentById.get(snapshot.id));
      state.segments[indexes[offset]] = next;
      clearPendingSave(next);
      return next;
    });
    await saveSegments(restored);
    const requestedActiveId = options.activeSegmentId || previousActiveId || restored[0]?.id || "";
    const requestedIndex = state.segments.findIndex((segment) => segment.id === requestedActiveId);
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
      const index = state.segments.findIndex((segment) => segment.id === segmentId);
      if (index >= 0) state.segments[index] = prepareSegmentHistoryState(snapshot);
    }
    renderAll();
    throw error;
  }
}

function normalizeStructuralSegmentOrder(segments) {
  const ordered = segments
    .map((segment, order) => ({ segment, order }))
    .sort((left, right) => Number(left.segment.index || 0) - Number(right.segment.index || 0) || left.order - right.order)
    .map(({ segment }) => segment);
  const documentCounts = new Map();
  ordered.forEach((segment, index) => {
    segment.index = index;
    const documentIndex = documentCounts.get(segment.documentId) || 0;
    segment.documentIndex = documentIndex;
    documentCounts.set(segment.documentId, documentIndex + 1);
  });
  return ordered;
}

async function restoreSplitSegmentCommandSegments(nextSnapshots, options = {}) {
  if (!state.project?.id) throw new Error("The split segment project is no longer open.");
  const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
  const snapshotIds = new Set();
  snapshots.forEach((snapshot) => {
    if (!snapshot?.id || snapshot.projectId !== state.project.id || snapshotIds.has(snapshot.id)) {
      throw new Error("The split segment snapshot is invalid for the current project.");
    }
    snapshotIds.add(snapshot.id);
  });
  if (!snapshots.length || !snapshotIds.has(options.originalSegmentId)) {
    throw new Error("The split segment snapshot does not contain the original segment.");
  }

  const currentSegments = state.segments.map((segment) => structuredClone(segment));
  const currentById = new Map(currentSegments.map((segment) => [segment.id, segment]));
  if (!currentById.has(options.originalSegmentId)) {
    throw new Error("The original split segment is no longer available.");
  }
  const preservedCurrentSegments = currentSegments.filter(
    (segment) => !snapshotIds.has(segment.id) && segment.id !== options.createdSegmentId
  );
  const restored = normalizeStructuralSegmentOrder(
    [...snapshots, ...preservedCurrentSegments].map((snapshot) =>
      prepareCommandRestoreSegmentSnapshot(snapshot, currentById.get(snapshot.id))
    )
  );
  const deleteSegmentIds =
    options.direction === "undo" && currentById.has(options.createdSegmentId) ? [options.createdSegmentId] : [];
  const savedSegments = await saveSegmentStructure(restored, deleteSegmentIds);

  deleteSegmentIds.forEach((segmentId) => {
    const record = state.saveTimers.get(segmentId);
    if (record) clearTimeout(record.timer || record);
    state.saveTimers.delete(segmentId);
  });
  state.segments = prepareSegmentHistoryStates(savedSegments);
  const requestedIndex = state.segments.findIndex((segment) => segment.id === options.activeSegmentId);
  selectApplicationSegment(requestedIndex >= 0 ? requestedIndex : Math.max(0, currentActiveIndex()));
  invalidateSegmentFilterCache();
  markWorkspaceDirty();
  return {
    segments: state.segments.map((segment) => structuredClone(segment)),
    activeSegmentId: currentSegment()?.id || options.activeSegmentId || options.originalSegmentId,
    affectedCount: 2,
    focusTarget: true
  };
}

async function restoreMergeSegmentCommandSegments(nextSnapshots, options = {}) {
  if (!state.project?.id) throw new Error("The merged segment project is no longer open.");
  const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
  const snapshotIds = new Set();
  snapshots.forEach((snapshot) => {
    if (!snapshot?.id || snapshot.projectId !== state.project.id || snapshotIds.has(snapshot.id)) {
      throw new Error("The merged segment snapshot is invalid for the current project.");
    }
    snapshotIds.add(snapshot.id);
  });
  if (!snapshots.length || !snapshotIds.has(options.segmentId)) {
    throw new Error("The merged segment snapshot does not contain the surviving segment.");
  }
  const expectsMergedSegment = options.direction === "undo";
  if (snapshotIds.has(options.mergedSegmentId) !== expectsMergedSegment) {
    throw new Error("The merged segment snapshot does not match the requested restore direction.");
  }

  const currentSegments = state.segments.map((segment) => structuredClone(segment));
  const currentById = new Map(currentSegments.map((segment) => [segment.id, segment]));
  if (!currentById.has(options.segmentId)) {
    throw new Error("The surviving merged segment is no longer available.");
  }
  const preservedCurrentSegments = currentSegments.filter(
    (segment) => !snapshotIds.has(segment.id) && segment.id !== options.mergedSegmentId
  );
  const restored = normalizeStructuralSegmentOrder(
    [...snapshots, ...preservedCurrentSegments].map((snapshot) =>
      prepareCommandRestoreSegmentSnapshot(snapshot, currentById.get(snapshot.id))
    )
  );
  const deleteSegmentIds =
    options.direction === "redo" && currentById.has(options.mergedSegmentId) ? [options.mergedSegmentId] : [];
  const savedSegments = await saveSegmentStructure(restored, deleteSegmentIds);

  deleteSegmentIds.forEach((segmentId) => {
    const record = state.saveTimers.get(segmentId);
    if (record) clearTimeout(record.timer || record);
    state.saveTimers.delete(segmentId);
  });
  state.segments = prepareSegmentHistoryStates(savedSegments);
  const requestedIndex = state.segments.findIndex((segment) => segment.id === options.activeSegmentId);
  selectApplicationSegment(requestedIndex >= 0 ? requestedIndex : Math.max(0, currentActiveIndex()));
  invalidateSegmentFilterCache();
  markWorkspaceDirty();
  return {
    segments: state.segments.map((segment) => structuredClone(segment)),
    activeSegmentId: currentSegment()?.id || options.activeSegmentId || options.segmentId,
    affectedCount: 2,
    focusTarget: true
  };
}

async function replaceTargetText(scope = "visible") {
  if (!state.project) return { segmentCount: 0, replacementCount: 0 };
  const findText = els.replaceFindInput.value;
  const replacement = els.replaceWithInput.value;
  if (!findText) {
    setSaveStatus("Enter target text to replace.", "dirty");
    els.replaceFindInput.focus();
    return { segmentCount: 0, replacementCount: 0 };
  }
  const options = {
    regex: currentEditorFilters().regex,
    caseSensitive: currentEditorFilters().caseSensitive
  };
  const indexes = scope === "all" ? projectSegmentIndexes() : filteredSegmentIndexes();
  let replacementCount = 0;
  const proposals = [];
  try {
    indexes.forEach((index) => {
      const segment = state.segments[index];
      if (!segment) return;
      const result = replaceOutsideProtectedTokens(segment.target || "", findText, replacement, options);
      if (!result.count || result.text === segment.target) return;
      proposals.push({ segment, text: result.text, count: result.count });
      replacementCount += result.count;
    });
  } catch (error) {
    setSaveStatus(error.message || "Replace failed.", "dirty");
    return { segmentCount: 0, replacementCount: 0 };
  }
  if (!proposals.length) {
    setSaveStatus(`No target matches in ${scope === "all" ? "the project" : "the visible segments"}.`, "saved");
    return { segmentCount: 0, replacementCount: 0 };
  }
  const snapshots = new Map();
  const updated = [];
  try {
    await flushPendingSegmentSaves(state.project.id);
    proposals.forEach(({ segment }) => snapshots.set(segment.id, structuredClone(segment)));
    const command = appRuntime.commands.createReplaceTargetsCommand({
      projectId: state.project.id,
      segmentIds: proposals.map(({ segment }) => segment.id),
      beforeSnapshots: proposals.map(({ segment }) => snapshots.get(segment.id)),
      restoreSnapshots: (nextSnapshots) =>
        restoreSegmentCommandSnapshots(nextSnapshots, { activeSegmentId: currentSegment()?.id || "" }),
      applyFirst: async () => {
        proposals.forEach(({ segment, text }) => {
          setSegmentTargetAndStatus(segment, text, text.trim() ? "draft" : "empty", "replace");
          touchSegment(segment);
          updated.push(segment);
        });
        updated.forEach(clearPendingSave);
        if (LOOPCAT_TEST_BUILD && updated.some((segment) => segment[REPLACE_SAVE_FAILURE_TEST_FLAG])) {
          throw new Error("Simulated replace save failure");
        }
        await saveSegments(updated);
        renderSegments({ preserveScroll: true });
        renderProgress();
        await refreshSidebar();
        try {
          await logProjectActivity("replace-target", "Target text replaced", {
            scope,
            segmentCount: updated.length,
            replacementCount,
            regex: options.regex,
            caseSensitive: options.caseSensitive
          });
        } catch (activityError) {
          console.warn("Replace activity log failed.", activityError);
        }
        return {
          snapshots: updated.map((segment) => structuredClone(segment)),
          activeSegmentId: currentSegment()?.id || updated[0]?.id || ""
        };
      }
    });
    await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    const tagIssueCount = updated.filter(hasTagIssue).length;
    const warning = tagIssueCount ? ` ${tagIssueCount} segment${tagIssueCount === 1 ? "" : "s"} still need tag QA.` : "";
    setSaveStatus(
      `Replaced ${replacementCount} match${replacementCount === 1 ? "" : "es"} in ${updated.length} target segment${updated.length === 1 ? "" : "s"}.${warning} Undo is available.`,
      tagIssueCount ? "dirty" : "saved"
    );
    return { segmentCount: updated.length, replacementCount };
  } catch (error) {
    updated.forEach((segment) => {
      const snapshot = snapshots.get(segment.id);
      if (!snapshot) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderSegments({ preserveScroll: true });
    renderProgress();
    renderRevisionHistory();
    focusActiveTextarea();
    setSaveStatus(error.message || "Replace failed.", "dirty");
    return { segmentCount: 0, replacementCount: 0 };
  }
}

function debounceSave(segment) {
  setSaveStatus("Unsaved changes", "dirty");
  clearPendingSave(segment, { finalizeEdit: false });
  queueSegmentSave(segment);
}

function renderConfirmBusyState() {
  const busy = Boolean(currentSegment()?.id && state.confirmingSegmentIds.has(currentSegment().id));
  els.confirmBtn.disabled = busy;
  els.confirmBtn.setAttribute("aria-busy", String(busy));
}

async function restoreSegmentCommandSnapshot(segmentId, nextSnapshot, options = {}) {
  const index = state.segments.findIndex((item) => item.id === segmentId);
  if (index < 0) throw new Error("The affected segment is no longer available.");
  const currentSnapshot = structuredClone(state.segments[index]);
  try {
    const restored = prepareCommandRestoreSegmentSnapshot(nextSnapshot, currentSnapshot);
    state.segments[index] = restored;
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
    state.segments[index] = prepareSegmentHistoryState(currentSnapshot);
    renderAll();
    throw error;
  }
}

async function confirmCurrentSegment() {
  const segment = currentSegment();
  if (!segment || !segment.target.trim()) return;
  if (state.confirmingSegmentIds.has(segment.id)) return;
  const missing = missingTags(segment);
  if (missing.length) {
    setSaveStatus(`Cannot confirm: missing ${missing.map(tagDisplayText).join(", ")}`, "dirty");
    updateRow(currentActiveIndex());
    focusActiveTextarea();
    return;
  }
  const segmentIndex = currentActiveIndex();
  const project = state.project;
  const previousStatus = segment.status;
  const passedFiltersBefore = segmentPassesFilters(segment);
  const previous = structuredClone(segment);
  let savedConfirmedRevision = 0;
  const warnings = [];
  state.confirmingSegmentIds.add(segment.id);
  renderConfirmBusyState();
  try {
    const command = appRuntime.commands.createConfirmSegmentCommand({
      projectId: project.id,
      segmentId: segment.id,
      beforeSnapshot: previous,
      restoreSnapshot: (snapshot, context) =>
        restoreSegmentCommandSnapshot(segment.id, snapshot, { navigateNext: context.direction === "redo" }),
      applyFirst: async () => {
        recordSegmentTargetHistory(segment, segment.target, "confirmed", "confirm");
        segment.status = "confirmed";
        if (segment.reviewState === "needs-review") segment.reviewState = "";
        touchSegment(segment);
        clearPendingSave(segment);
        setSaveStatus("Saving...");
        if (passedFiltersBefore !== segmentPassesFilters(segment)) renderSegments({ preserveScroll: true });
        else updateRow(segmentIndex);
        renderProgress({ previousStatus, nextStatus: segment.status });
        scheduleRevisionHistoryRender();
        if (LOOPCAT_TEST_BUILD && segment[CONFIRM_FAILURE_TEST_FLAG]) throw new Error("Simulated confirm save failure");
        await saveSegment(segment);
        savedConfirmedRevision = Number(segment.revision || 0);
        if (LOOPCAT_TEST_BUILD && segment[CONFIRM_POST_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated post-save confirm failure");
        markWorkspaceDirty();
        const navigation = goToNextOpenSegment().catch((navigationError) => {
          console.warn("Confirm navigation refresh failed.", navigationError);
          focusActiveTextarea();
        });
        renderConfirmBusyState();
        const [tmResult, activityResult] = await Promise.all([
          saveSegmentToTm(segment, project)
            .then(() => true)
            .catch((tmError) => {
              console.warn("Confirm TM save failed.", tmError);
              return false;
            }),
          Promise.resolve()
            .then(() => {
              if (LOOPCAT_TEST_BUILD && segment[CONFIRM_ACTIVITY_FAILURE_TEST_FLAG]) {
                throw new Error("Simulated confirm activity failure");
              }
              return logProjectActivity(
                "confirm-segment",
                "Segment confirmed",
                { segmentId: segment.id, documentId: segment.documentId },
                project
              );
            })
            .then(() => true)
            .catch((activityError) => {
              console.warn("Confirm activity log failed.", activityError);
              return false;
            }),
          navigation
        ]);
        if (!tmResult) warnings.push("TM save failed");
        if (!activityResult) warnings.push("activity log failed");
        return {
          snapshot: structuredClone(segment),
          activeSegmentId: currentSegment()?.id || segment.id
        };
      }
    });
    await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    setSaveStatus(
      warnings.length ? `Saved; ${warnings.join("; ")}; Undo is available` : "Saved; Undo is available",
      warnings.length ? "dirty" : "saved"
    );
    return true;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, previous);
    if (savedConfirmedRevision) {
      segment.revision = Math.max(Number(segment.revision || 0), savedConfirmedRevision) + 1;
      segment.updatedAt = new Date().toISOString();
      try {
        await saveSegment(segment);
      } catch (rollbackError) {
        setSaveStatus(`${error.message || "Confirm segment failed"}; rollback save failed: ${rollbackError.message || rollbackError}`, "dirty");
        renderSegments({ preserveScroll: true });
        renderProgress();
        renderRevisionHistory();
        focusActiveTextarea();
        return false;
      }
    }
    setSaveStatus(error.message || "Confirm segment failed", "dirty");
    renderSegments({ preserveScroll: true });
    renderProgress();
    renderRevisionHistory();
    focusActiveTextarea();
    return false;
  } finally {
    state.confirmingSegmentIds.delete(segment.id);
    renderConfirmBusyState();
  }
}

async function saveSegmentToTm(segment, project = state.project) {
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
  if (!segment || !state.project || !segment.source.trim() || !segment.target.trim()) return null;
  try {
    const entry = await saveSegmentToTm(segment, state.project);
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
  if (!state.project || state.tmPretranslating) return null;
  const beforePatches = new Map();
  const beforeSnapshots = new Map();
  const updated = [];
  state.tmPretranslating = true;
  try {
    const raw = await requestTmPretranslationThreshold();
    if (raw === null) return null;
    const threshold = Number(raw);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      setSaveStatus("Enter a match percentage between 0 and 100.", "dirty");
      return null;
    }
    const candidates = currentDocumentSegments().filter(
      (segment) =>
        !segment.target.trim() &&
        segment.source.trim() &&
        segment.status !== "confirmed" &&
        !preTranslationService.isLockedSegment?.(segment)
    );
    if (!candidates.length) {
      setSaveStatus("No empty segments to pretranslate.", "saved");
      return null;
    }
    els.pretranslateBtn.disabled = true;
    els.pretranslateBtn.setAttribute("aria-busy", "true");
    setSaveStatus("Pretranslating...");
    await yieldToUi();
    const tmNames = projectTmNames();
    const uniqueSources = Array.from(new Set(candidates.map((segment) => segment.source)));
    const matchesBySource = new Map();
    for (let offset = 0; offset < uniqueSources.length; offset += TM_PRETRANSLATE_BATCH_SIZE) {
      const sources = uniqueSources.slice(offset, offset + TM_PRETRANSLATE_BATCH_SIZE);
      const options = sources.map((source) => ({
        source,
        sourceLang: state.project.sourceLang,
        targetLang: state.project.targetLang,
        tmNames,
        limit: 1
      }));
      const batches = await findProjectTmMatchesBatch(options);
      sources.forEach((source, index) => matchesBySource.set(source, batches[index]?.[0] || null));
      const completed = Math.min(offset + sources.length, uniqueSources.length);
      setSaveStatus(`Pretranslating... ${completed}/${uniqueSources.length}`);
      await yieldToUi();
    }
    const proposals = [];
    for (const segment of candidates) {
      const match = matchesBySource.get(segment.source);
      if (!match || match.score < threshold || !match.target?.trim()) continue;
      proposals.push({ segment, match });
    }
    if (!proposals.length) {
      setSaveStatus(`No TM matches at ${threshold}% or higher.`, "saved");
      return null;
    }
    await flushPendingSegmentSaves(state.project.id);
    const activeSegmentId = currentSegment()?.id || proposals[0].segment.id;
    proposals.forEach(({ segment }) => {
      beforePatches.set(segment.id, targetCommandPatch(segment));
      beforeSnapshots.set(segment.id, structuredClone(segment));
    });
    const command = appRuntime.commands.createTmPretranslationCommand({
      projectId: state.project.id,
      segmentIds: proposals.map(({ segment }) => segment.id),
      beforePatches: proposals.map(({ segment }) => beforePatches.get(segment.id)),
      provenance: {
        origin: "translation-memory",
        producer: "pretranslation",
        threshold,
        matchCount: proposals.length
      },
      restorePatches: (patches, context) =>
        restoreBatchTargetCommandPatches(patches, { ...context, activeSegmentId }),
      applyFirst: async () => {
        for (const { segment, match } of proposals) {
          setSegmentTargetAndStatus(segment, match.target, "draft", "pretranslate");
          segment.tmPretranslation = {
            score: Math.max(0, Math.min(100, Math.round(Number(match.score || 0)))),
            tmName: String(match.tmName || "").trim(),
            matchId: String(match.id || "").trim(),
            appliedAt: new Date().toISOString()
          };
          Reflect.deleteProperty(segment, "aiPretranslation");
          touchSegment(segment);
          updated.push(segment);
        }
        if (LOOPCAT_TEST_BUILD && updated.some((segment) => segment[PRETRANSLATE_SAVE_FAILURE_TEST_FLAG])) {
          throw new Error("Simulated pretranslation save failure");
        }
        await saveSegments(updated);
        return {
          patches: updated.map((segment) => targetCommandPatch(segment)),
          activeSegmentId,
          affectedCount: updated.length
        };
      }
    });
    const commandExecution = await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    try {
      await logProjectActivity("pretranslate", "TM pretranslation applied", { threshold, updatedCount: updated.length });
    } catch (activityError) {
      console.warn("Pretranslation activity log failed.", activityError);
    }
    renderSegments({ preserveScroll: true });
    renderProgress();
    try {
      await refreshSidebar();
    } catch (refreshError) {
      console.warn("TM pretranslation sidebar refresh failed.", refreshError);
    }
    markWorkspaceDirty();
    setSaveStatus(
      `Pretranslated ${updated.length} segment${updated.length === 1 ? "" : "s"} at ${threshold}%+; Undo is available`,
      "saved"
    );
    return commandExecution;
  } catch (error) {
    beforeSnapshots.forEach((snapshot, segmentId) => {
      const segment = state.segments.find((item) => item.id === segmentId);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderSegments();
    renderProgress();
    renderRevisionHistory();
    focusActiveTextarea();
    setSaveStatus(error.message || "TM pretranslation failed", "dirty");
    return null;
  } finally {
    state.tmPretranslating = false;
    els.pretranslateBtn.disabled = false;
    els.pretranslateBtn.setAttribute("aria-busy", "false");
  }
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
    const projectId = state.commandProjectId || state.project?.id || null;
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
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "f" && currentApplicationView() === "editor" && state.project) {
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
  if (currentApplicationView() !== "editor" || !state.project) return;
  const keyword = selectedConcordanceKeyword();
  if (!keyword) {
    setSaveStatus("Select a source word, then press Ctrl+K or Alt+K.", "dirty");
    return;
  }
  const query = stableLower(keyword);
  const entries = await listTmEntries();
  const tmNames = new Set(projectTmNames());
  const results = entries
    .filter((entry) => entry.sourceLang === state.project.sourceLang && entry.targetLang === state.project.targetLang)
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
        insertTarget(entry.target, {
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
  ensureSegmentVisible(currentActiveIndex());
  const textarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
  textarea?.focus();
  if (textarea && selection) {
    const normalized = normalizedTargetSelection(selection, textarea.value.length);
    textarea.setSelectionRange(normalized.start, normalized.end);
  }
}

function handleEditorKeydown(event, index) {
  const key = stableLower(event.key);
  if ((event.ctrlKey || event.metaKey) && key === "z" && !event.altKey) {
    finalizePendingEditCommand(state.segments[index]?.id || "");
    const projectId = state.commandProjectId || state.project?.id || null;
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
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    confirmCurrentSegment();
    return;
  }
  if (event.altKey && event.key === "ArrowDown") {
    event.preventDefault();
    const visible = filteredSegmentIndexes();
    const visibleIndex = filteredSegmentPosition(index);
    const next = visible[Math.min(visibleIndex + 1, visible.length - 1)];
    setActiveSegment(next).then(focusActiveTextarea);
  }
  if (event.altKey && event.key === "ArrowUp") {
    event.preventDefault();
    const visible = filteredSegmentIndexes();
    const visibleIndex = filteredSegmentPosition(index);
    const previous = visible[Math.max(visibleIndex - 1, 0)];
    setActiveSegment(previous).then(focusActiveTextarea);
  }
}

async function refreshSidebar() {
  renderReviewPanel();
  renderRevisionHistory();
  renderAiSuggestions();
  renderQualityWorkbench();
  await Promise.all([refreshTmMatches(), refreshTerms()]);
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

function qualityDecisionSeverity(value) {
  const severity = stableLower(value || "");
  return ["low", "medium", "high", "critical"].includes(severity) ? severity : "medium";
}

function qualityDecisionCategory(value) {
  const category = stableLower(value || "");
  return ["accuracy", "terminology", "fluency", "style", "locale", "formatting", "compliance", "review"].includes(category)
    ? category
    : "review";
}

function qualityQaBySegment(qaChecks = state.qaChecks) {
  const map = new Map();
  (qaChecks || []).forEach((check) => {
    const segmentId = check?.segmentId || "";
    if (!segmentId) return;
    if (!map.has(segmentId)) map.set(segmentId, []);
    map.get(segmentId).push(check);
  });
  return map;
}

function currentQualityRiskQueue(qaChecks = state.qaChecks) {
  if (!state.project) return null;
  return buildRiskQueue({
    project: state.project,
    segments: currentDocumentSegments(),
    qaChecks,
    profile: state.project.qualityProfile
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
  if (!state.project || !segment) return null;
  const queuedItem = (queue?.items || []).find((item) => item.segmentId === segment.id);
  if (queuedItem) return queuedItem;
  return scoreSegment(segment, currentActiveIndex(), {
    profile: state.project.qualityProfile,
    qaBySegment: qualityQaBySegment()
  });
}

function renderQualityWorkbench() {
  const queue = state.project
    ? state.qualityRiskQueue?.projectId === state.project.id
      ? state.qualityRiskQueue
      : currentQualityRiskQueue()
    : null;
  if (state.project) state.qualityRiskQueue = queue;
  qualityReviewController?.renderQuality?.({
    project: state.project,
    segment: currentSegment(),
    activeIndex: currentActiveIndex(),
    profile: state.project?.qualityProfile,
    queue,
    evidence: activeQualityEvidence(queue)
  });
}

async function saveQualityProfileFromForm(values = qualityReviewController?.readProfile?.()) {
  if (!state.project) return false;
  const previousProject = structuredClone(state.project);
  const previousProjects = state.projects.map((project) => structuredClone(project));
  const qualityProfile = defaultQualityProfile(values);
  try {
    state.project = await updateProject({ ...state.project, qualityProfile });
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    state.qualityRiskQueue = currentQualityRiskQueue();
    await refreshProjectSummaries();
    markWorkspaceDirty();
    renderQualityWorkbench();
    const activityLogged = await logOptionalProjectActivity("quality-profile", "Quality profile saved", {
      standard: qualityProfile.standard,
      reviewDepth: qualityProfile.reviewDepth,
      riskTolerance: qualityProfile.riskTolerance,
      terminologyStrictness: qualityProfile.terminologyStrictness,
      aiDisclosure: qualityProfile.aiDisclosure
    }, "Quality profile save");
    setSaveStatus(appendActivityWarning("Quality profile saved", activityLogged), exportStatusMode("saved", activityLogged));
    return true;
  } catch (error) {
    state.project = previousProject;
    state.projects = previousProjects;
    renderQualityWorkbench();
    setSaveStatus(error.message || "Quality profile save failed", "dirty");
    return false;
  }
}

async function saveQualityDecisionFromForm(values = qualityReviewController?.readDecision?.()) {
  if (!state.project) return false;
  const segment = currentSegment();
  if (!segment) return false;
  const snapshot = structuredClone(segment);
  const category = qualityDecisionCategory(values?.category);
  const severity = qualityDecisionSeverity(values?.severity);
  const note = String(values?.note || "").trim();
  const decisionTitle = `Quality decision: ${qualityCategoryName(category)} (${qualityDecisionSeverityLabel(severity)})`;
  const now = new Date().toISOString();
  try {
    segment.reviewState = "needs-review";
    segment.comments = [
      ...(segment.comments || []),
      {
        id: makeId("comment"),
        body: [decisionTitle, note].filter(Boolean).join("\n"),
        state: "open",
        qualityDecision: { category, severity },
        createdAt: now,
        updatedAt: now
      }
    ];
    touchSegment(segment);
    clearPendingSave(segment);
    await saveSegment(segment);
    qualityReviewController?.clearDecisionNote?.();
    state.qualityRiskQueue = currentQualityRiskQueue();
    renderReviewPanel({ force: true });
    renderQualityWorkbench();
    updateRow(currentActiveIndex());
    markWorkspaceDirty();
    const activityLogged = await logOptionalProjectActivity("quality-decision", "Quality decision saved", {
      segmentId: segment.id,
      category,
      severity
    }, "Quality decision save");
    setSaveStatus(appendActivityWarning("Quality decision saved", activityLogged), exportStatusMode("saved", activityLogged));
    return true;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderReviewPanel({ force: true });
    renderQualityWorkbench();
    updateRow(currentActiveIndex());
    setSaveStatus(error.message || "Quality decision save failed", "dirty");
    return false;
  }
}

async function refreshQualityRiskQueue() {
  if (!state.project) return null;
  const checks = await runProjectQa();
  if (!checks) return null;
  state.qualityRiskQueue = currentQualityRiskQueue(checks);
  renderQualityWorkbench();
  return state.qualityRiskQueue;
}

async function goToQualityRiskItem(item) {
  const index = state.segments.findIndex((segment) => segment.id === item?.segmentId);
  if (index === -1) return;
  const segment = state.segments[index];
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
  if (!state.project) return;
  if (!state.qualityRiskQueue || state.qualityRiskQueue.projectId !== state.project.id) {
    state.qualityRiskQueue = currentQualityRiskQueue();
  }
  const queue = state.qualityRiskQueue;
  if (!queue?.items?.length) {
    setSaveStatus("No quality risks in this scope", "saved");
    return;
  }
  const indexedItems = queue.items
    .map((item) => ({
      ...item,
      globalIndex: state.segments.findIndex((segment) => segment.id === item.segmentId)
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
  const segment = currentSegment();
  if (!segment) return;
  const snapshot = structuredClone(segment);
  try {
    segment.reviewState = String(values?.reviewState || "");
    segment.reviewNote = String(values?.reviewNote || "").trim();
    const commentBody = String(values?.commentBody || "").trim();
    if (commentBody) {
      const now = new Date().toISOString();
      segment.comments = [
        ...(segment.comments || []),
        {
          id: `comment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
          body: commentBody,
          state: "open",
          createdAt: now,
          updatedAt: now
        }
      ];
    }
    touchSegment(segment);
    clearPendingSave(segment);
    if (LOOPCAT_TEST_BUILD && segment[REVIEW_METADATA_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated review metadata save failure");
    await saveSegment(segment);
    try {
      await logProjectActivity("review", "Review metadata saved", { segmentId: segment.id, reviewState: segment.reviewState });
    } catch (activityError) {
      console.warn("Review activity log failed.", activityError);
    }
    renderReviewPanel({ force: true });
    updateRow(currentActiveIndex());
    markWorkspaceDirty();
    setSaveStatus("Review saved", "saved");
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderReviewPanel({ force: true });
    updateRow(currentActiveIndex());
    renderRevisionHistory();
    setSaveStatus(error.message || "Review save failed", "dirty");
  }
}

async function setActiveReviewState(reviewState) {
  const segment = currentSegment();
  if (!state.project || !segment) return;
  const snapshot = structuredClone(segment);
  try {
    const command = appRuntime.commands.createChangeReviewStateCommand({
      projectId: state.project.id,
      segmentId: segment.id,
      beforeSnapshot: snapshot,
      restoreSnapshot: (nextSnapshot) => restoreSegmentCommandSnapshot(segment.id, nextSnapshot),
      applyFirst: async () => {
        segment.reviewState = segment.reviewState === reviewState ? "" : reviewState;
        touchSegment(segment);
        qualityReviewController?.syncReviewState?.(segment.reviewState);
        clearPendingSave(segment);
        if (LOOPCAT_TEST_BUILD && segment[REVIEW_STATE_SAVE_FAILURE_TEST_FLAG]) {
          throw new Error("Simulated review state save failure");
        }
        await saveSegment(segment);
        try {
          await logProjectActivity(
            "review",
            segment.reviewState ? `Marked ${stableLower(reviewLabel(segment.reviewState))}` : "Review state cleared",
            { segmentId: segment.id, reviewState: segment.reviewState }
          );
        } catch (activityError) {
          console.warn("Review activity log failed.", activityError);
        }
        updateRow(currentActiveIndex());
        markWorkspaceDirty();
        return { snapshot: structuredClone(segment), activeSegmentId: segment.id };
      }
    });
    await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    setSaveStatus(
      `${segment.reviewState ? `Marked ${stableLower(reviewLabel(segment.reviewState))}` : "Review state cleared"}; Undo is available`,
      "saved"
    );
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderReviewPanel();
    updateRow(currentActiveIndex());
    renderRevisionHistory();
    setSaveStatus(error.message || "Review state save failed", "dirty");
  }
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
  const checks = state.qaFilter ? state.qaChecks.filter((check) => check.type === state.qaFilter) : state.qaChecks;
  if (!state.qaChecks.length) {
    els.qaResults.textContent = uiSource("No QA issues found.");
    els.qaResults.classList.add("muted");
    return;
  }
  els.qaResults.classList.remove("muted");
  const summary = qaSummary(state.qaChecks);
  const fragment = document.createDocumentFragment();
  const summaryWrap = document.createElement("div");
  summaryWrap.className = "qa-summary";
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = state.qaFilter ? "" : "active";
  allButton.textContent = uiSource("All {value1}", { value1: state.qaChecks.length });
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
      const index = state.segments.findIndex((segment) => segment.id === check.segmentId);
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
  if (!segment || !state.project) {
    els.tmMatches.textContent = uiSource("No active segment.");
    els.tmMatches.classList.add("muted");
    return;
  }
  const segmentId = segment.id;
  const projectId = state.project.id;
  const matches = await findProjectTmMatches({
    source: segment.source,
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    tmNames: projectTmNames()
  });
  if (state.project?.id !== projectId || currentSegment()?.id !== segmentId) return;
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
      insertTarget(match.target, {
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
  if (!segment || !state.project) {
    els.termSuggestions.textContent = uiSource("No active segment.");
    els.termSuggestions.classList.add("muted");
    return;
  }
  const segmentId = segment.id;
  const projectId = state.project.id;
  const suggestions = await findTerms({
    source: segment.source,
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    termBaseNames: projectTermBaseNames()
  });
  if (state.project?.id !== projectId || currentSegment()?.id !== segmentId) return;
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
  if (!state.project || !els.sourceTermInput.value.trim() || !els.targetTermInput.value.trim()) return null;
  const termBaseName = els.termBaseSelect.value || primaryTermBaseName();
  try {
    if (LOOPCAT_TEST_BUILD && els.termForm[TERM_FORM_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated term form save failure");
    const term = await saveTerm({
      sourceTerm: els.sourceTermInput.value,
      targetTerm: els.targetTermInput.value,
      notes: els.termNotesInput.value,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseName,
      isForbidden: els.termForbiddenInput?.checked
    });
    markProjectsUsingResourceDirty("termbase", termBaseName, state.project.sourceLang, state.project.targetLang);
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
  if (!state.project) return null;
  try {
    if (LOOPCAT_TEST_BUILD && state.project[QA_RUN_FAILURE_TEST_FLAG]) throw new Error("Simulated QA run failure");
    const terms = await listTerms({
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
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
    state.qaChecks = checks;
    state.qaFilter = "";
    renderQaResults();
    state.qualityRiskQueue = currentQualityRiskQueue(checks);
    renderQualityWorkbench();
    try {
    if (LOOPCAT_TEST_BUILD && state.project[QA_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated QA activity log failure");
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

function normalizedTargetSelection(selection, targetLength) {
  if (!selection) return null;
  const length = Math.max(0, Number(targetLength) || 0);
  const start = Math.max(0, Math.min(length, Number(selection.start) || 0));
  const end = Math.max(start, Math.min(length, Number(selection.end) || start));
  return { start, end };
}

function activeTargetSelection(segment) {
  const textarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
  const length = String(segment?.target || "").length;
  return normalizedTargetSelection(
    textarea
      ? { start: textarea.selectionStart ?? length, end: textarea.selectionEnd ?? length }
      : { start: length, end: length },
    length
  );
}

async function runTargetProducerCommand({
  createCommand,
  target,
  reason,
  provenance,
  selection,
  successMessage
}) {
  const segment = currentSegment();
  const projectId = state.project?.id || segment?.projectId || "";
  if (!segment || !projectId || typeof createCommand !== "function") return null;

  finalizePendingEditCommand(segment.id);
  clearPendingSave(segment, { finalizeEdit: false });
  const beforePatch = targetCommandPatch(segment);
  const beforeSelection = activeTargetSelection(segment);
  const nextTarget = String(target || "");
  const nextSelection = normalizedTargetSelection(selection, nextTarget.length) || {
    start: nextTarget.length,
    end: nextTarget.length
  };
  const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
  const passedFiltersBefore = segmentPassesFilters(segment);

  try {
    const command = createCommand({
      projectId,
      segmentId: segment.id,
      beforePatch,
      beforeSelection,
      provenance,
      restorePatch: (patch, context) =>
        restoreSegmentEditCommandPatch(segment.id, patch, { ...context, focusTarget: true }),
      applyFirst: () => {
        setSegmentTargetAndStatus(segment, nextTarget, nextTarget.trim() ? "draft" : "empty", reason);
        touchSegment(segment);
        const passedFiltersAfter = segmentPassesFilters(segment);
        if (passedFiltersBefore !== passedFiltersAfter) renderSegments({ preserveScroll: true });
        else renderSegments();
        renderProgress({ previousStatus, nextStatus: segment.status });
        renderRevisionHistory();
        markWorkspaceDirty();
        debounceSave(segment);
        focusActiveTextarea(nextSelection);
        return {
          patch: targetCommandPatch(segment),
          activeSegmentId: segment.id,
          focusTarget: true,
          selection: nextSelection
        };
      }
    });
    const result = await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    if (successMessage) setSaveStatus(`${successMessage}; Undo is available`, "dirty");
    return result;
  } catch (error) {
    applyTargetCommandPatch(segment, beforePatch);
    invalidateSegmentFilterCache();
    renderSegments({ preserveScroll: true });
    renderProgress();
    renderRevisionHistory();
    focusActiveTextarea(beforeSelection);
    setSaveStatus(`${error.message || "Target change failed"}; existing work was preserved`, "dirty");
    return null;
  }
}

function insertTarget(target, options = {}) {
  const channel = options.channel === "concordance" ? "concordance" : "match";
  return runTargetProducerCommand({
    createCommand: appRuntime?.commands?.createInsertTmTargetCommand,
    target,
    reason: "insert-target",
    provenance: {
      origin: "translation-memory",
      channel,
      ...(options.resourceId ? { resourceId: String(options.resourceId) } : {})
    },
    successMessage: channel === "concordance" ? "Concordance target inserted" : "TM target inserted"
  });
}

function copySourceToTarget() {
  const segment = currentSegment();
  if (!segment) return Promise.resolve(null);
  return runTargetProducerCommand({
    createCommand: appRuntime?.commands?.createCopySourceToTargetCommand,
    target: segment.source,
    reason: "copy-source",
    provenance: { origin: "user", producer: "copy-source" },
    successMessage: "Source copied to target"
  });
}

function insertTagIntoTarget(tagText) {
  const segment = currentSegment();
  if (!segment) return Promise.resolve(null);
  const current = segment.target || "";
  const selected = activeTargetSelection(segment) || { start: current.length, end: current.length };
  const nextTarget = `${current.slice(0, selected.start)}${tagText}${current.slice(selected.end)}`;
  const nextPosition = selected.start + String(tagText || "").length;
  return runTargetProducerCommand({
    createCommand: appRuntime?.commands?.createInsertProtectedTagCommand,
    target: nextTarget,
    reason: "insert-tag",
    provenance: { origin: "user", producer: "protected-tag" },
    selection: { start: nextPosition, end: nextPosition },
    successMessage: "Protected tag inserted"
  });
}

async function saveProjectDomainFromForm() {
  if (!state.project) return false;
  const previousProject = structuredClone(state.project);
  const previousProjects = state.projects.map((project) => structuredClone(project));
  const domain = els.projectDomainEditInput.value.trim();
  try {
    if (LOOPCAT_TEST_BUILD && state.project[PROJECT_DOMAIN_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated project domain save failure");
    state.project = await updateProject({ ...state.project, domain });
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    await refreshProjectSummaries();
    renderAll();
    els.domainForm.classList.toggle("hidden", Boolean((state.project.domain || "").trim()));
    markWorkspaceDirty();
    setSaveStatus("Project domain saved", "saved");
    return true;
  } catch (error) {
    state.project = previousProject;
    state.projects = previousProjects;
    els.domainForm.classList.toggle("clean", domain === (state.project.domain || ""));
    setSaveStatus(error.message || "Project domain save failed", "dirty");
    return false;
  }
}

async function saveAiSettings() {
  if (!state.project) return;
  const previousProject = structuredClone(state.project);
  const previousProjects = state.projects.map((project) => structuredClone(project));
  const previousOpenAiKey = openAiKeySnapshot();
  const globalForm = aiAdministrationController?.readGlobalForm?.() || {};
  const secrets = aiAdministrationController?.readSecrets?.() || {};
  const apiKeyInput = secrets.openAiKey || "";
  const rememberApiKey = Boolean(secrets.rememberOpenAiKey);
  const localAiKeyInput = secrets.localAiKey || "";
  const rememberLocalAiKey = Boolean(secrets.rememberLocalAiKey);
  const localAiSettings = localAiSettingsFromForm();
  const previousLocalAiKey = localAiKeySnapshot(localAiSettings);
  let projectPersisted = false;
  let activityLogged = true;
  const aiSettings = defaultAiSettings({
    enabled: Boolean(globalForm.enabled),
    provider: globalForm.provider || "OpenAI",
    model: globalForm.model || OPENAI_DEFAULT_MODEL,
    sendSourceToAi: Boolean(globalForm.sendSourceToAi),
    useTmContext: globalForm.useTmContext !== false,
    useTermbaseContext: globalForm.useTermbaseContext !== false,
    styleGuide: globalForm.styleGuide || "",
    ...localAISettingsStore.projectUpdateFields(localAiSettings, state.project)
  });
  const shouldUpdateOpenAiKey = Boolean(String(apiKeyInput || "").trim()) && isOpenAiProvider({ aiSettings });
  const shouldUpdateLocalAiKey = Boolean(String(localAiKeyInput || "").trim());
  try {
    assertLocalAiEndpointAllowed(localAiSettings);
  const shouldSimulateActivityFailure = Boolean(LOOPCAT_TEST_BUILD && state.project[AI_SETTINGS_ACTIVITY_FAILURE_TEST_FLAG]);
  if (LOOPCAT_TEST_BUILD && state.project[AI_SETTINGS_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated AI settings save failure");
    state.project = await updateProject({ ...state.project, aiSettings });
    projectPersisted = true;
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    if (shouldUpdateOpenAiKey) saveOpenAiKey(apiKeyInput, rememberApiKey);
    if (shouldUpdateLocalAiKey) saveLocalAiKey(localAiKeyInput, rememberLocalAiKey, localAiSettings);
    try {
      if (shouldSimulateActivityFailure) throw new Error("Simulated AI settings activity failure");
      await logProjectActivity("ai-settings", "AI settings updated", {
        enabled: aiSettings.enabled,
        provider: aiSettings.provider,
        model: aiSettings.model,
        sendSourceToAi: aiSettings.sendSourceToAi,
        keyStorage: isOpenAiProvider({ aiSettings }) ? openAiKeyStorageLabel() : "Not applicable",
        localAiKeyStorage: shouldUpdateLocalAiKey ? localAiKeyStorageLabel(localAiSettings) : "Not changed"
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("AI settings activity log failed.", activityError);
      if (state.project?.id) markWorkspaceDirty(state.project.id);
    }
    renderEditor();
    markWorkspaceDirty();
    setSaveStatus(activityLogged ? "AI settings saved" : "AI settings saved; activity log failed", activityLogged ? "saved" : "dirty");
    return true;
  } catch (error) {
    await restoreProjectAfterOpenAiSetupFailure(previousProject, previousProjects, projectPersisted);
    safeRestoreOpenAiKeySnapshot(previousOpenAiKey);
    safeRestoreLocalAiKeySnapshot(previousLocalAiKey);
    setSaveStatus(error.message || "AI settings save failed", "dirty");
    return false;
  }
}

function renderAiSuggestions() {
  const segment = currentSegment();
  const suggestions = segment?.aiSuggestions || [];
  if (!suggestions.length) {
    els.aiSuggestionList.textContent = uiSource("No AI suggestions yet.");
    els.aiSuggestionList.classList.add("muted");
    return;
  }
  els.aiSuggestionList.classList.remove("muted");
  const fragment = document.createDocumentFragment();
  suggestions.slice().reverse().slice(0, 4).forEach((suggestion) => {
    const card = document.createElement("article");
    card.className = "ai-suggestion-card";
    const header = document.createElement("header");
    const provider = document.createElement("strong");
    provider.textContent = suggestion.provider || "AI";
    const model = document.createElement("span");
    model.textContent = suggestion.model || (suggestion.confidence ? `${suggestion.confidence}%` : uiSource("review"));
    header.append(provider, model);

    const provenance = document.createElement("p");
    provenance.className = "ai-suggestion-provenance muted";
    provenance.textContent = uiSource("{origin} suggestion · {scope} · {date}", {
      origin: suggestion.origin || suggestion.provider || "AI",
      scope: suggestion.scope || "active segment",
      date: formatDateTime(suggestion.createdAt)
    });

    const inspection = document.createElement("details");
    inspection.className = "ai-suggestion-inspection";
    const summary = document.createElement("summary");
    summary.textContent = uiSource("Inspect proposed change");
    const diff = document.createElement("div");
    diff.className = "ai-suggestion-diff";
    const before = document.createElement("div");
    const beforeLabel = document.createElement("strong");
    beforeLabel.textContent = uiSource("Current target");
    const beforeText = document.createElement("p");
    beforeText.textContent = segment?.target || uiSource("Empty target");
    before.append(beforeLabel, beforeText);
    const after = document.createElement("div");
    const afterLabel = document.createElement("strong");
    afterLabel.textContent = uiSource("Suggested target");
    const afterText = document.createElement("p");
    afterText.textContent = suggestion.suggestedTarget || "";
    after.append(afterLabel, afterText);
    diff.append(before, after);
    inspection.append(summary, diff);

    const explanation = document.createElement("ul");
    for (const item of suggestion.explanation || []) {
      const entry = document.createElement("li");
      entry.textContent = item;
      explanation.append(entry);
    }

    const footer = document.createElement("footer");
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = uiLabel("applyToTarget");
    applyButton.addEventListener("click", () => void applyAiSuggestion(suggestion.id));
    const applyNextButton = document.createElement("button");
    applyNextButton.type = "button";
    applyNextButton.className = "primary";
    applyNextButton.textContent = uiSource("Apply and next");
    applyNextButton.addEventListener("click", () => void applyAiSuggestion(suggestion.id, { andNext: true }));
    footer.append(applyButton, applyNextButton);
    card.append(header, provenance, inspection, explanation, footer);
    fragment.append(card);
  });
  els.aiSuggestionList.replaceChildren(fragment);
}

async function aiContextForSegment(segment, ai) {
  return Promise.all([
    ai.useTmContext ? findProjectTmMatches({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      tmNames: projectTmNames()
    }) : [],
    ai.useTermbaseContext ? findTerms({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    }) : []
  ]);
}

function savedAiSuggestionRecord(suggestion = {}) {
  const source = suggestion && typeof suggestion === "object" ? suggestion : {};
  const confidence = Number(source.confidence);
  return {
    id: String(source.id || makeId("ai-suggestion")),
    provider: redactSensitiveText(source.provider || "AI").trim() || "AI",
    model: redactSensitiveText(source.model || "").trim(),
    segmentId: String(source.segmentId || "").trim(),
    suggestedTarget: String(source.suggestedTarget || ""),
    confidence: Number.isFinite(confidence) ? confidence : 0,
    explanation: Array.isArray(source.explanation)
      ? source.explanation.map((item) => redactSensitiveText(item || "").trim()).filter(Boolean).slice(0, 8)
      : [],
    status: redactSensitiveText(source.status || "review").trim() || "review",
    origin: redactSensitiveText(source.origin || source.provider || "AI").trim() || "AI",
    scope: redactSensitiveText(source.scope || "active segment").trim() || "active segment",
    reviewState: redactSensitiveText(source.reviewState || "suggested").trim() || "suggested",
    contextDisclosure: Array.isArray(source.contextDisclosure)
      ? source.contextDisclosure.map((item) => redactSensitiveText(item || "").trim()).filter(Boolean).slice(0, 8)
      : [],
    createdAt: String(source.createdAt || new Date().toISOString()).trim()
  };
}

async function appendAiSuggestion(segment, suggestion, activityType, activityMessage) {
  if (!segment || !suggestion) return false;
  const safeSuggestion = savedAiSuggestionRecord(suggestion);
  const snapshot = structuredClone(segment);
  let activityLogged = true;
  try {
    segment.aiSuggestions = [...(segment.aiSuggestions || []), safeSuggestion];
    touchSegment(segment);
    clearPendingSave(segment);
    if (LOOPCAT_TEST_BUILD && segment[AI_APPEND_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated AI suggestion save failure");
    await saveSegment(segment);
    try {
      if (LOOPCAT_TEST_BUILD && segment[AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated AI suggestion activity failure");
      await logProjectActivity(activityType, activityMessage, {
        segmentId: segment.id,
        provider: safeSuggestion.provider,
        model: safeSuggestion.model
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("AI suggestion activity log failed.", activityError);
      if (state.project?.id) markWorkspaceDirty(state.project.id);
    }
    renderAiSuggestions();
    markWorkspaceDirty();
    if (!activityLogged) setSaveStatus(`${activityMessage}; activity log failed`, "dirty");
    return { ok: true, activityLogged };
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderAiSuggestions();
    renderRevisionHistory();
    setSaveStatus(error.message || "AI suggestion save failed", "dirty");
    return false;
  }
}

async function applyAiSuggestion(suggestionId, options = {}) {
  const segment = currentSegment();
  const suggestion = (segment?.aiSuggestions || []).find((item) => item.id === suggestionId);
  if (!segment || !suggestion?.suggestedTarget) return false;
  if (segment.locked || segment.status === "confirmed") {
    setSaveStatus("Confirmed or locked segments must be reopened before applying an AI suggestion", "dirty");
    return false;
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before applying AI suggestion failed", "dirty");
    return false;
  }

  const snapshot = structuredClone(segment);
  const segmentId = segment.id;
  const restoreSnapshot = async (nextSnapshot) => {
    const index = state.segments.findIndex((item) => item.id === segmentId);
    if (index < 0) throw new Error("The affected segment is no longer available.");
    const currentSnapshot = structuredClone(state.segments[index]);
    try {
      const restored = prepareCommandRestoreSegmentSnapshot(nextSnapshot, currentSnapshot);
      state.segments[index] = restored;
      clearPendingSave(restored);
      await saveSegment(restored);
      renderSegments();
      renderProgress();
      renderRevisionHistory();
      renderAiSuggestions();
      await refreshSidebar();
      markWorkspaceDirty();
      return restored;
    } catch (error) {
      state.segments[index] = prepareSegmentHistoryState(currentSnapshot);
      renderAll();
      throw error;
    }
  };

  let activityLogged = true;
  try {
    const command = appRuntime.commands.createApplyAiSuggestionCommand({
      projectId: state.project.id,
      segmentId,
      suggestion,
      beforeSnapshot: snapshot,
      restoreSnapshot,
      applyFirst: async () => {
        setSegmentTargetAndStatus(segment, suggestion.suggestedTarget, "draft", "ai-suggestion");
        segment.aiApplication = {
          suggestionId: suggestion.id,
          origin: suggestion.origin || suggestion.provider || "AI",
          provider: suggestion.provider || "",
          model: suggestion.model || "",
          appliedAt: new Date().toISOString(),
          reviewState: "needs-review"
        };
        segment.reviewState = "needs-review";
        touchSegment(segment);
        clearPendingSave(segment);
        if (LOOPCAT_TEST_BUILD && segment[AI_APPLY_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated AI apply save failure");
        await saveSegment(segment);
        try {
          if (LOOPCAT_TEST_BUILD && segment[AI_SUGGESTION_ACTIVITY_FAILURE_TEST_FLAG]) throw new Error("Simulated AI suggestion activity failure");
          await logProjectActivity("ai-apply-suggestion", "AI suggestion applied to target", {
            segmentId: segment.id,
            provider: suggestion.provider || "",
            model: suggestion.model || "",
            suggestionId: suggestion.id
          });
        } catch (activityError) {
          activityLogged = false;
          console.warn("AI suggestion activity log failed.", activityError);
          if (state.project?.id) markWorkspaceDirty(state.project.id);
        }
        renderSegments();
        renderProgress();
        renderRevisionHistory();
        await refreshSidebar();
        markWorkspaceDirty();
        return { snapshot: structuredClone(segment) };
      }
    });
    await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    setSaveStatus(
      activityLogged
        ? "AI suggestion applied; Undo is available"
        : "AI suggestion applied; activity log failed; Undo is available",
      activityLogged ? "saved" : "dirty"
    );
    if (options.andNext) goToNextOpenSegment();
    return true;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderSegments();
    renderProgress();
    renderRevisionHistory();
    renderAiSuggestions();
    focusActiveTextarea();
    setSaveStatus(error.message || "AI suggestion apply failed", "dirty");
    return false;
  }
}

async function createOpenAiSuggestion() {
  const segment = currentSegment();
  if (!state.project || !segment) return;
  const globalForm = aiAdministrationController?.readGlobalForm?.() || {};
  const secrets = aiAdministrationController?.readSecrets?.() || {};
  const aiSettings = defaultAiSettings({
    ...state.project.aiSettings,
    enabled: Boolean(globalForm.enabled),
    provider: globalForm.provider || "OpenAI",
    model: globalForm.model || OPENAI_DEFAULT_MODEL,
    sendSourceToAi: Boolean(globalForm.sendSourceToAi),
    useTmContext: globalForm.useTmContext !== false,
    useTermbaseContext: globalForm.useTermbaseContext !== false,
    styleGuide: globalForm.styleGuide || ""
  });
  if (!aiSettings.enabled) {
    setSaveStatus("Enable AI helpers before requesting an OpenAI suggestion.", "dirty");
    return;
  }
  if (!aiSettings.sendSourceToAi) {
    setSaveStatus("Turn on source sharing before sending a segment to OpenAI.", "dirty");
    return;
  }
  if (!isOpenAiProvider({ aiSettings })) {
    setSaveStatus("Choose OpenAI as the provider before requesting an OpenAI suggestion.", "dirty");
    return;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return;
  }
  if (browserAppearsOffline()) {
    setSaveStatus("OpenAI suggestions need an internet connection. LoopCAT appears to be offline; no source text, API key, or AI settings were sent or saved.", "dirty");
    return;
  }
  const apiKey = String(secrets.openAiKey || "").trim() || storedOpenAiKey();
  if (!apiKey) {
    setSaveStatus("Add your OpenAI API key first.", "dirty");
    return;
  }
  const openAiContextLabels = [
    aiSettings.useTmContext ? "local TM matches" : "",
    aiSettings.useTermbaseContext ? "local termbase hits" : "",
    aiSettings.styleGuide ? "style instructions" : ""
  ].filter(Boolean);
  if (!confirmExternalAiPromptShare({ provider: "OpenAI", includesSourceText: true, contextLabels: openAiContextLabels })) {
    setSaveStatus("OpenAI suggestion canceled", "dirty");
    return;
  }
  const previousProject = structuredClone(state.project);
  const previousProjects = state.projects.map((project) => structuredClone(project));
  const previousOpenAiKey = openAiKeySnapshot();
  let projectPersisted = false;
  try {
    if (LOOPCAT_TEST_BUILD && state.project[AI_SETTINGS_SAVE_FAILURE_TEST_FLAG]) throw new Error("Simulated AI settings save failure");
    state.project = await updateProject({ ...state.project, aiSettings });
    projectPersisted = true;
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    saveOpenAiKey(apiKey, Boolean(secrets.rememberOpenAiKey));
    markWorkspaceDirty();
    renderEditor();
    setSaveStatus("Requesting OpenAI suggestion...");
  } catch (error) {
    await restoreProjectAfterOpenAiSetupFailure(previousProject, previousProjects, projectPersisted);
    safeRestoreOpenAiKeySnapshot(previousOpenAiKey);
    renderEditor();
    setSaveStatus(error.message || "OpenAI suggestion setup failed", "dirty");
    return;
  }
  try {
    const [tmMatches, terms] = await aiContextForSegment(segment, aiSettings);
    const suggestion = await openAiSuggestion({ apiKey, segment, tmMatches, terms, project: state.project });
    const saved = await appendAiSuggestion(segment, suggestion, "ai-openai-suggestion", "OpenAI suggestion created");
    if (saved?.ok) {
      setSaveStatus(saved.activityLogged ? "OpenAI suggestion ready for review" : "OpenAI suggestion ready for review; activity log failed", saved.activityLogged ? "saved" : "dirty");
    }
  } catch (error) {
    setSaveStatus(error.message || "OpenAI suggestion failed", "dirty");
  }
}

function currentLocalAiProvider(settings = localAiSettingsFromForm()) {
  return aiProviderService.get(settings.providerId);
}

function localAiDesktopBridge() {
  return window.LoopCATDesktop && typeof window.LoopCATDesktop.startLmStudioServer === "function"
    ? window.LoopCATDesktop
    : null;
}

function canStartLmStudioServer(settings = localAiSettingsFromForm()) {
  return Boolean(
    localAiDesktopBridge() &&
    settings.providerId === "openai-compatible" &&
    !localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)
  );
}

function localAiConnectionErrorLooksStartable(error) {
  const message = String(error?.message || "");
  return /not reachable|failed to fetch|unable to connect|connection refused/i.test(message);
}

function setOpusCatConnectionHelpVisible(visible) {
  opusCatHelpController?.setVisible?.(visible);
}

function showOpusCatConnectionHelp() {
  return opusCatHelpController?.open?.();
}

async function finishLocalAiConnection(settings, provider, result, saveMessage = "AI provider connection works") {
  const discoveredBaseUrl = String(result?.baseUrl || "").trim();
  if (
    settings.providerId === "opus-cat" &&
    discoveredBaseUrl &&
    normalizedProviderBaseUrl("opus-cat", discoveredBaseUrl) !== normalizedProviderBaseUrl("opus-cat", settings.baseUrl)
  ) {
    aiAdministrationController?.setBaseUrl?.(discoveredBaseUrl);
    const rememberedSettings = await persistLocalAiSettings({ silent: true });
    renderLocalAiPresetOptions(rememberedSettings);
    renderLocalAiProviderControls(rememberedSettings);
    renderLocalAiPromptPreview();
  }
  const version = result?.version ? ` ${result.version}` : "";
  const route = result?.connectionMode ? ` via ${result.connectionMode}` : "";
  setOpusCatConnectionHelpVisible(false);
  setLocalAiStatus("connected", `${result?.provider || provider.name}${version} connected${route}`);
  setSaveStatus(
    result?.autoDiscovered && discoveredBaseUrl
      ? `OPUS-CAT connection found and saved at ${discoveredBaseUrl}`
      : saveMessage,
    "saved"
  );
}

async function startLmStudioServerFromUi(settings = localAiSettingsFromForm()) {
  const bridge = localAiDesktopBridge();
  if (!bridge || !canStartLmStudioServer(settings)) {
    throw new Error("Automatic LM Studio server start is available only in the LoopCAT desktop app with the LM Studio local provider selected.");
  }
  setLocalAiStatus("checking", "Starting LM Studio server...");
  setSaveStatus("Starting LM Studio server...");
  const result = await bridge.startLmStudioServer();
  if (!result?.ok) {
    throw new Error(result?.message || "Could not start the LM Studio server.");
  }
  setLocalAiStatus("checking", result.message || "LM Studio server started. Checking connection...");
  return result;
}

async function startLmStudioServerAndTestConnection() {
  if (!state.project) return;
  const settings = await persistLocalAiSettings({ silent: true });
  try {
    await startLmStudioServerFromUi(settings);
    await testLocalAiConnection({ skipLmStudioAutoStart: true });
  } catch (error) {
    const message = error.message || "Could not start LM Studio server.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
  }
}

async function testLocalAiConnection(options = {}) {
  if (!state.project) return;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "testing this provider");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    return;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider) {
    const message = "This AI provider is not available.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    return;
  }
  setOpusCatConnectionHelpVisible(false);
  setLocalAiStatus("checking", "Checking AI provider...");
  try {
    const result = await provider.testConnection(config);
    await finishLocalAiConnection(settings, provider, result);
  } catch (error) {
    if (!options.skipLmStudioAutoStart && canStartLmStudioServer(settings) && localAiConnectionErrorLooksStartable(error)) {
      try {
        await startLmStudioServerFromUi(settings);
        const result = await provider.testConnection(config);
        await finishLocalAiConnection(settings, provider, result, "LM Studio server started; AI provider connection works");
        return;
      } catch (startError) {
        const message = startError.message || error.message || "AI provider connection failed.";
        setLocalAiStatus("error", message);
        setSaveStatus(message, "dirty");
        return;
      }
    }
    const message = error.message || "AI provider connection failed.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    if (settings.providerId === "opus-cat") showOpusCatConnectionHelp();
  }
}

async function refreshLocalAiModels() {
  if (!state.project) return;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "refreshing models");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    return;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider) {
    const message = "Model refresh is not available for this provider.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    return;
  }
  setLocalAiStatus("checking", "Refreshing models...");
  try {
    const result = await provider.listModels(config);
    state.localAi.models = result.models || [];
    renderLocalAiModelOptions(settings);
    const hasModel = state.localAi.models.some((model) => model.name === settings.model);
    const canPull = localAiCanPullModel(settings, provider);
    setLocalAiStatus("connected", `${state.localAi.models.length} model${state.localAi.models.length === 1 ? "" : "s"} found`);
    setSaveStatus(
      hasModel || !settings.model
        ? "AI models refreshed"
        : canPull
          ? `Model ${settings.model} is not installed. Pull it from the AI Command Centre.`
          : `Model ${settings.model} was not returned by this provider. Check the model name or refresh models.`,
      hasModel || !settings.model ? "saved" : "dirty"
    );
  } catch (error) {
    const message = error.message || "AI model refresh failed.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
  }
}

async function pullLocalAiModel() {
  if (!state.project) return;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
    return;
  }
  const provider = currentLocalAiProvider(settings);
  const model = (aiAdministrationController?.readLocalForm?.().model || settings.model || DEFAULT_LOCAL_AI_MODEL).trim() || DEFAULT_LOCAL_AI_MODEL;
  if (!provider?.pullModel) {
    const message = "Model pull is available for Ollama in this build.";
    setSaveStatus(message, "dirty");
    return;
  }
  setLocalAiStatus("checking", `Pulling ${model}...`);
  try {
    await provider.pullModel(config, model, (progress) => {
      if (progress?.status) setLocalAiStatus("checking", `Pulling ${model}: ${progress.status}`);
    });
    setLocalAiStatus("connected", `${model} is installed`);
    await refreshLocalAiModels();
    setSaveStatus(`${model} pulled`, "saved");
  } catch (error) {
    const message = error.message || `Could not pull ${model}.`;
    setLocalAiStatus("error", message);
    setSaveStatus(message, "dirty");
  }
}

async function testLocalAiPrompt() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return;
  const mode = localAiPromptMode();
  const source = localAiSampleText();
  if (mode !== "project-brief" && !String(source || "").trim()) {
    setSaveStatus("Enter sample source text or select a segment first.", "dirty");
    return;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  const promptRequest = localAiPromptPreviewRequest(settings, mode);
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, `testing a ${promptRequest.label} prompt`);
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: currentLocalAiProvider(settings)?.name || settings.providerId,
      includesSourceText: mode !== "project-brief" || projectBriefSampleSegments(1).length > 0,
      contextLabels: localAiPromptTestContextLabels(mode)
    });
    if (!ok) {
      setSaveStatus("AI prompt test canceled", "dirty");
      return;
    }
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider) {
    const message = "Prompt testing is not available for this provider.";
    setSaveStatus(message, "dirty");
    return;
  }
  if (mode !== "pretranslate" && !provider.completePrompt) {
    const message = `${localAiPromptModeLabel(mode)} prompt testing is not available for this provider.`;
    setSaveStatus(message, "dirty");
    return;
  }
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus(`Sending ${promptRequest.label} prompt...`);
  try {
    const result = mode === "pretranslate"
      ? await provider.translateSegment(config, {
        project: state.project,
        text: promptRequest.sourceText,
        sourceLanguage: settings.sourceLanguage,
        sourceCode: settings.sourceCode,
        targetLanguage: settings.targetLanguage,
        targetCode: settings.targetCode,
        segment: promptRequest.segment,
        glossaryTerms: promptRequest.glossaryTerms,
        prompt: promptRequest.prompt
      })
      : await provider.completePrompt(config, {
        project: state.project,
        prompt: promptRequest.prompt,
        system: promptRequest.system,
        model: settings.model
      });
    state.localAi.promptOutput = result.rawOutput || result.translatedText || result.text || "";
    renderLocalAiOutput(state.localAi.promptOutput);
    setSaveStatus(`${promptRequest.label} prompt returned output`, "saved");
    return true;
  } catch (error) {
    const message = error.message || "Local AI prompt test failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

const AI_REVIEW_RISK_LEVELS = new Set(["none", "low", "medium", "high", "critical"]);
const AI_REVIEW_RISK_SCORES = { none: 0, low: 25, medium: 50, high: 75, critical: 100 };
const AI_REVIEW_RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

function aiReviewRiskLabel(level) {
  return {
    none: uiLabel("noIssuesFound"),
    low: uiLabel("lowRisk"),
    medium: uiLabel("mediumRisk"),
    high: uiLabel("highRisk"),
    critical: uiLabel("criticalRisk")
  }[level] || uiLabel("unrankedRisk");
}

function normalizeAiReviewRisk(reviewRisk = {}, reviewText = "") {
  const fallback = parseAiReviewRisk(reviewText || "");
  const source = reviewRisk && typeof reviewRisk === "object" ? reviewRisk : fallback;
  const level = AI_REVIEW_RISK_LEVELS.has(String(source.level || "").trim())
    ? String(source.level || "").trim()
    : fallback.level;
  const score = Number.isFinite(Number(source.score))
    ? Math.min(100, Math.max(0, Math.round(Number(source.score))))
    : (AI_REVIEW_RISK_SCORES[level] ?? AI_REVIEW_RISK_SCORES.low);
  const issueCount = Number.isFinite(Number(source.issueCount))
    ? Math.max(0, Math.round(Number(source.issueCount)))
    : (level === "none" ? 0 : 1);
  return {
    level,
    score,
    issueCount,
    label: aiReviewRiskLabel(level)
  };
}

function aiReviewRiskFromResult(result = {}) {
  return normalizeAiReviewRisk(result.reviewRisk, result.reviewText || result.text || result.rawOutput || "");
}

function aiReviewRiskLine(reviewRisk = {}) {
  const risk = normalizeAiReviewRisk(reviewRisk);
  if (risk.level === "none") return "Risk: none";
  const issueText = risk.issueCount === 1 ? "1 issue" : `${risk.issueCount} issues`;
  return `Risk: ${risk.label.replace(/ risk$/i, "")} (${risk.score}/100, ${issueText})`;
}

function aiReviewOutputText(result = {}) {
  const text = String(result.reviewText || result.text || "").trim();
  const risk = aiReviewRiskFromResult(result);
  return `${aiReviewRiskLine(risk)}\n\n${text}`.trim();
}

function highestAiReviewRiskLevel(current = "none", next = "none") {
  const currentLevel = AI_REVIEW_RISK_LEVELS.has(current) ? current : "none";
  const nextLevel = AI_REVIEW_RISK_LEVELS.has(next) ? next : "none";
  return AI_REVIEW_RISK_ORDER[nextLevel] > AI_REVIEW_RISK_ORDER[currentLevel] ? nextLevel : currentLevel;
}

function aiReviewCommentBody(result = {}) {
  const provider = redactSensitiveText(result.provider || "AI").trim() || "AI";
  const model = redactSensitiveText(result.model || "").trim();
  const header = model ? `AI review by ${provider} (${model})` : `AI review by ${provider}`;
  return `${header}\n${aiReviewRiskLine(aiReviewRiskFromResult(result))}\n\n${String(result.reviewText || result.text || "").trim()}`.trim();
}

function aiReviewReturnedNoIssues(result = {}) {
  const text = String(result.reviewText || result.text || "").trim().replace(/[.!]+$/g, "").toLocaleLowerCase("en-US");
  return text === "no issues found";
}

function appendAiReviewComment(segment, result = {}) {
  const now = new Date().toISOString();
  const reviewRisk = aiReviewRiskFromResult(result);
  const body = aiReviewCommentBody(result);
  segment.reviewState = "needs-review";
  segment.aiReviewRisk = reviewRisk;
  segment.comments = [
    ...(segment.comments || []),
    {
      id: `comment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      body,
      aiReviewRisk: reviewRisk,
      state: "open",
      createdAt: now,
      updatedAt: now
    }
  ];
  return body;
}

async function reviewActiveSegmentWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before running AI review.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  if (!String(segment.target || "").trim()) {
    setSaveStatus("The active segment has no target text to review.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "reviewing the active segment");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI review is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["target text", "configured provider URL", "project glossary hints"]
    });
    if (!ok) {
      setSaveStatus("AI review canceled", "dirty");
      return false;
    }
  }
  const snapshot = structuredClone(segment);
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Sending segment for AI review...");
  try {
    const glossaryTerms = await findTerms({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    });
    const result = await aiCommandService.reviewSegment({
      provider,
      project: state.project,
      segment,
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      glossaryTerms
    });
    const body = appendAiReviewComment(segment, result);
    touchSegment(segment);
    clearPendingSave(segment);
    await saveSegment(segment);
    try {
      await logProjectActivity("ai-review", "AI segment review created", {
        segmentId: segment.id,
        provider: result.provider || provider.name || settings.providerId,
        model: result.model || settings.model,
        reviewRisk: aiReviewRiskFromResult(result).level
      });
    } catch (activityError) {
      console.warn("AI review activity log failed.", activityError);
      markWorkspaceDirty();
    }
    renderLocalAiOutput(aiReviewOutputText(result));
    renderReviewPanel();
    updateRow(currentActiveIndex());
    markWorkspaceDirty();
    setSaveStatus("AI review added to the active segment", "saved");
    return true;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderReviewPanel();
    updateRow(currentActiveIndex());
    const message = error.message || "AI review failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

function localAiReviewScopeSegments(settings = {}) {
  const mode = settings.mode || "untranslated";
  if (mode === "selected") return currentSegment() ? [currentSegment()] : [];
  if (mode === "visible") return filteredSegmentIndexes().map((index) => state.segments[index]).filter(Boolean);
  if (mode === "project") return state.segments;
  return currentDocumentSegments();
}

function localAiReviewSkipReason(segment = {}) {
  if (!String(segment.source || "").trim()) return "empty-source";
  if (!String(segment.target || "").trim()) return "empty-target";
  if (preTranslationService.isLockedSegment?.(segment)) return "locked";
  if (segment.status === "confirmed") return "confirmed";
  return "";
}

function selectLocalAiReviewSegments(settings = {}) {
  const skipped = [];
  const candidates = [];
  localAiReviewScopeSegments(settings).forEach((segment) => {
    const reason = localAiReviewSkipReason(segment);
    if (reason) {
      skipped.push({ segmentId: segment.id || "", reason });
      return;
    }
    candidates.push(segment);
  });
  return { candidates, skipped, mode: settings.mode || "untranslated" };
}

async function reviewBatchWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "running batch AI QA");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI QA is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["target text", "configured provider URL", "batch review text", "project glossary hints"]
    });
    if (!ok) {
      setSaveStatus("Batch AI QA canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI QA failed", "dirty");
    return false;
  }
  const selection = selectLocalAiReviewSegments(settings);
  const progress = {
    total: selection.candidates.length,
    completed: 0,
    failed: 0,
    skipped: selection.skipped.length
  };
  state.localAi.progress = progress;
  renderLocalAiProgress();
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No eligible translated draft segments for batch AI QA." : "No segments to review with local AI.", "saved");
    return {
      ...progress,
      commented: 0,
      noIssue: 0,
      riskCounts: { critical: 0, high: 0, medium: 0, low: 0 },
      highestRisk: "none",
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    commented: 0,
    noIssue: 0,
    failed: 0,
    skipped: selection.skipped.length,
    riskCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    highestRisk: "none",
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  renderLocalAiCommandCentre();
  setSaveStatus(`Running batch AI QA on ${selection.candidates.length} segment${selection.candidates.length === 1 ? "" : "s"}...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const glossaryTerms = await findTerms({
          source: segment.source,
          sourceLang: state.project.sourceLang,
          targetLang: state.project.targetLang,
          termBaseNames: projectTermBaseNames()
        });
        const result = await aiCommandService.reviewSegment({
          provider,
          project: state.project,
          segment,
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          glossaryTerms,
          signal: state.localAi.abortController.signal
        });
        if (aiReviewReturnedNoIssues(result)) {
          summary.noIssue += 1;
        } else {
          const reviewRisk = aiReviewRiskFromResult(result);
          appendAiReviewComment(segment, { ...result, reviewRisk });
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.commented += 1;
          if (reviewRisk.level !== "none" && summary.riskCounts[reviewRisk.level] !== undefined) {
            summary.riskCounts[reviewRisk.level] += 1;
          }
          summary.highestRisk = highestAiReviewRiskLevel(summary.highestRisk, reviewRisk.level);
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI QA failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    try {
      await logProjectActivity("ai-batch-review", "Batch AI QA completed", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        reviewedCount: summary.completed,
        commentedCount: summary.commented,
        noIssueCount: summary.noIssue,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        riskCounts: summary.riskCounts,
        highestRisk: summary.highestRisk,
        canceled: summary.canceled
      });
    } catch (activityError) {
      console.warn("Batch AI QA activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const noIssueText = summary.noIssue ? `; ${summary.noIssue} no issues found` : "";
    const highestRiskText = summary.highestRisk && summary.highestRisk !== "none" ? `; highest risk ${summary.highestRisk}` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    const riskLines = ["critical", "high", "medium", "low"]
      .filter((level) => summary.riskCounts[level])
      .map((level) => `${aiReviewRiskLabel(level)}: ${summary.riskCounts[level]}`);
    renderLocalAiOutput([
      `${summary.commented} review comment${summary.commented === 1 ? "" : "s"} saved.`,
      riskLines.join("\n"),
      `${summary.noIssue} segment${summary.noIssue === 1 ? "" : "s"} returned no issues.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI QA${canceledText}: ${summary.commented} review comment${summary.commented === 1 ? "" : "s"} saved${highestRiskText}${noIssueText}${failureText}${skippedText}`, summary.failed ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderSegments();
    renderProgress();
    renderRevisionHistory();
    renderReviewPanel();
    const message = error.message || "Batch AI QA failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function repairActiveSegmentTagsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before requesting AI tag repair.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  if (!String(segment.target || "").trim()) {
    setSaveStatus("The active segment has no target text to repair.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "suggesting a tag repair");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI tag repair is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["target text", "protected tags and placeholders", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("AI tag repair canceled", "dirty");
      return false;
    }
  }
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Requesting AI tag repair suggestion...");
  try {
    const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
    const result = await aiCommandService.repairSegmentTags({
      provider,
      project: state.project,
      segment: { ...segment, tags: segmentTags(segment) },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens
    });
    if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
      renderLocalAiOutput("AI did not propose a different tag repair.", { muted: false });
      setSaveStatus("AI did not propose a different tag repair.", "saved");
      return true;
    }
    const suggestion = {
      id: makeId("ai-suggestion"),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 60 : 80,
      explanation: [
        "AI tag repair suggestion. Review before applying.",
        ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
    const saved = await appendAiSuggestion(segment, suggestion, "ai-tag-repair", "AI tag repair suggestion created");
    renderLocalAiOutput(result.suggestedTarget);
    if (saved?.ok) {
      setSaveStatus(saved.activityLogged ? "AI tag repair suggestion ready for review" : "AI tag repair suggestion ready; activity log failed", saved.activityLogged ? "saved" : "dirty");
      return true;
    }
    setSaveStatus("AI tag repair suggestion could not be saved.", "dirty");
    return false;
  } catch (error) {
    const message = error.message || "AI tag repair failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

function localAiTagRepairSkipReason(segment = {}) {
  const reason = localAiReviewSkipReason(segment);
  if (reason) return reason;
  if (!segmentTags(segment).length) return "no-protected-tags";
  if (!missingTags(segment).length) return "no-tag-mismatch";
  return "";
}

function selectLocalAiTagRepairSegments(settings = {}) {
  const skipped = [];
  const candidates = [];
  localAiReviewScopeSegments(settings).forEach((segment) => {
    const reason = localAiTagRepairSkipReason(segment);
    if (reason) {
      skipped.push({ segmentId: segment.id || "", reason });
      return;
    }
    candidates.push(segment);
  });
  return { candidates, skipped, mode: settings.mode || "untranslated" };
}

async function repairBatchTagsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "repairing tag batches");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI tag repair is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const selection = selectLocalAiTagRepairSegments(settings);
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No protected tag mismatches are eligible for batch AI repair." : "No translated segments to repair with local AI.", "saved");
    return {
      total: 0,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${selection.candidates.length} source/target segments with protected tag mismatches`, "protected tags and placeholders", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("Batch AI tag repair canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI tag repair failed", "dirty");
    return false;
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  state.localAi.progress = {
    total: summary.total,
    completed: 0,
    failed: 0,
    skipped: summary.skipped,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Repairing protected tags in ${summary.total} segment${summary.total === 1 ? "" : "s"} with AI...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
        const missingTokens = missingTags(segment).map(tagDisplayText).filter(Boolean);
        const result = await aiCommandService.repairSegmentTags({
          provider,
          project: state.project,
          segment: { ...segment, tags: segmentTags(segment) },
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          protectedTokens,
          signal: state.localAi.abortController.signal
        });
        if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
          summary.unchanged += 1;
        } else {
          const suggestion = savedAiSuggestionRecord({
            id: makeId("ai-suggestion"),
            provider: result.provider || provider.name || "AI",
            model: result.model || settings.model,
            segmentId: segment.id,
            suggestedTarget: result.suggestedTarget,
            confidence: result.warnings?.length ? 60 : 80,
            explanation: [
              "Batch AI tag repair suggestion. Review before applying.",
              ...(missingTokens.length ? [`Missing tokens detected: ${missingTokens.join(", ")}`] : []),
              ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
              ...(result.warnings || [])
            ],
            status: "review"
          });
          segment.aiSuggestions = [...(segment.aiSuggestions || []), suggestion];
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.suggested += 1;
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI tag repair failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-tag-repair-batch", "Batch AI tag repair suggestions created", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        repairedCount: summary.completed,
        suggestionCount: summary.suggested,
        unchangedCount: summary.unchanged,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI tag repair activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    renderLocalAiOutput([
      `${summary.suggested} tag repair suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
      `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI tag repair${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`, summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderAll();
    const message = error.message || "Batch AI tag repair failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function suggestActiveSegmentVariantsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before requesting AI alternatives.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "suggesting translation alternatives");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI alternatives are not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["current target draft", "configured provider URL", "project glossary hints"]
    });
    if (!ok) {
      setSaveStatus("AI alternatives canceled", "dirty");
      return false;
    }
  }
  const snapshot = structuredClone(segment);
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Requesting AI translation alternatives...");
  try {
    const glossaryTerms = await findTerms({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    });
    const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
    const result = await aiCommandService.suggestSegmentVariants({
      provider,
      project: state.project,
      segment: { ...segment, tags: segmentTags(segment) },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens,
      glossaryTerms,
      variantMode: settings.variantMode
    });
    const currentTarget = String(segment.target || "").trim();
    const variants = (result.variants || []).filter((variant) => {
      const suggestedTarget = String(variant.suggestedTarget || "").trim();
      return suggestedTarget && (!currentTarget || suggestedTarget !== currentTarget);
    });
    if (!variants.length) {
      renderLocalAiOutput("AI did not propose alternatives different from the current target.", { muted: false });
      setSaveStatus("AI did not propose different alternatives.", "saved");
      return true;
    }
    const suggestions = variants.map((variant) => ({
      id: makeId("ai-suggestion"),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: variant.suggestedTarget,
      confidence: variant.warnings?.length ? 65 : 75,
      explanation: [
        `AI ${variant.label || "alternative"} suggestion. Review before applying.`,
        ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
        ...(variant.warnings || [])
      ],
      status: "review"
    }));
    const safeSuggestions = suggestions.map(savedAiSuggestionRecord);
    segment.aiSuggestions = [...(segment.aiSuggestions || []), ...safeSuggestions];
    touchSegment(segment);
    clearPendingSave(segment);
    await saveSegment(segment);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-target-variants", "AI target alternatives created", {
        segmentId: segment.id,
        provider: result.provider || provider.name || settings.providerId,
        model: result.model || settings.model,
        suggestionCount: safeSuggestions.length,
        variantMode: settings.variantMode
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("AI alternatives activity log failed.", activityError);
      markWorkspaceDirty();
    }
    renderLocalAiOutput(variants.map((variant) => `${variant.label || "Alternative"}: ${variant.suggestedTarget}`).join("\n"));
    renderAiSuggestions();
    updateRow(currentActiveIndex());
    markWorkspaceDirty();
    setSaveStatus(activityLogged ? "AI alternatives ready for review" : "AI alternatives ready; activity log failed", activityLogged ? "saved" : "dirty");
    return true;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderAiSuggestions();
    updateRow(currentActiveIndex());
    const message = error.message || "AI alternatives failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

async function suggestBatchSegmentVariantsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "suggesting batch translation alternatives");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI alternatives are not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const selection = selectLocalAiDraftSegments(settings);
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No eligible translated draft segments for batch AI alternatives." : "No draft segments to suggest alternatives for with local AI.", "saved");
    return {
      total: 0,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${selection.candidates.length} source/target draft segments`, "alternative style", "project glossary hints", "protected tags and placeholders", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("Batch AI alternatives canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI alternatives failed", "dirty");
    return false;
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  state.localAi.progress = {
    total: summary.total,
    completed: 0,
    failed: 0,
    skipped: summary.skipped,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Suggesting alternatives for ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const glossaryTerms = await localAiGlossaryTermsForSegment(segment);
        const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
        const result = await aiCommandService.suggestSegmentVariants({
          provider,
          project: state.project,
          segment: { ...segment, tags: segmentTags(segment) },
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          protectedTokens,
          glossaryTerms,
          variantMode: settings.variantMode,
          signal: state.localAi.abortController.signal
        });
        const currentTarget = String(segment.target || "").trim();
        const variants = (result.variants || []).filter((variant) => {
          const suggestedTarget = String(variant.suggestedTarget || "").trim();
          return suggestedTarget && (!currentTarget || suggestedTarget !== currentTarget);
        });
        if (!variants.length) {
          summary.unchanged += 1;
        } else {
          const suggestions = variants.map((variant) => savedAiSuggestionRecord({
            id: makeId("ai-suggestion"),
            provider: result.provider || provider.name || "AI",
            model: result.model || settings.model,
            segmentId: segment.id,
            suggestedTarget: variant.suggestedTarget,
            confidence: variant.warnings?.length ? 65 : 75,
            explanation: [
              `Batch AI ${variant.label || "alternative"} suggestion. Review before applying.`,
              `Alternative style: ${settings.variantMode || "standard"}.`,
              ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
              ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
              ...(variant.warnings || [])
            ],
            status: "review"
          }));
          segment.aiSuggestions = [...(segment.aiSuggestions || []), ...suggestions];
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.suggested += suggestions.length;
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI alternatives failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-target-variants-batch", "Batch AI target alternatives created", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        variantMode: settings.variantMode,
        processedCount: summary.completed,
        suggestionCount: summary.suggested,
        unchangedCount: summary.unchanged,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI alternatives activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    renderLocalAiOutput([
      `${summary.suggested} alternative suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
      `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI alternatives${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`, summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderAll();
    const message = error.message || "Batch AI alternatives failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function applyActiveSegmentTerminologyWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before applying AI terminology.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  if (!String(segment.target || "").trim()) {
    setSaveStatus("The active segment has no target draft to revise.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "applying terminology");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI terminology application is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  let glossaryTerms = [];
  try {
    glossaryTerms = await localAiGlossaryTermsForSegment(segment);
  } catch {
    glossaryTerms = [];
  }
  if (!glossaryTerms.length) {
    setSaveStatus("No matching project terminology found for the active segment.", "saved");
    renderLocalAiOutput("No matching project terminology found for the active segment.", { muted: false });
    return true;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["current target draft", "matching project terminology", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("AI terminology application canceled", "dirty");
      return false;
    }
  }
  const snapshot = structuredClone(segment);
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Applying project terminology with AI...");
  try {
    const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
    const result = await aiCommandService.applyTerminology({
      provider,
      project: state.project,
      segment: { ...segment, tags: segmentTags(segment) },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens,
      glossaryTerms
    });
    if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
      renderLocalAiOutput("AI did not propose a different terminology revision.", { muted: false });
      setSaveStatus("AI did not propose a different terminology revision.", "saved");
      return true;
    }
    const suggestion = {
      id: makeId("ai-suggestion"),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 65 : 82,
      explanation: [
        "AI terminology application suggestion. Review before applying.",
        ...(glossaryTerms.length ? [`Termbase hits considered: ${Math.min(glossaryTerms.length, 16)}`] : []),
        ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
    const saved = await appendAiSuggestion(segment, suggestion, "ai-apply-terminology", "AI terminology suggestion created");
    renderLocalAiOutput(result.suggestedTarget);
    if (saved?.ok) {
      setSaveStatus(saved.activityLogged ? "AI terminology suggestion ready for review" : "AI terminology suggestion ready; activity log failed", saved.activityLogged ? "saved" : "dirty");
      return true;
    }
    setSaveStatus("AI terminology suggestion could not be saved.", "dirty");
    return false;
  } catch (error) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
    prepareSegmentHistoryState(segment);
    renderAiSuggestions();
    updateRow(currentActiveIndex());
    const message = error.message || "AI terminology application failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

function selectLocalAiTerminologyApplicationSegments(settings = {}) {
  return selectLocalAiDraftSegments(settings);
}

async function applyBatchTerminologyWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "applying terminology in batches");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI terminology application is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const selection = selectLocalAiTerminologyApplicationSegments(settings);
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No eligible translated draft segments for batch AI terminology application." : "No draft segments to revise with local AI.", "saved");
    return {
      total: 0,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      noTerms: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${selection.candidates.length} source/target draft segments`, "matching project terminology", "protected tags and placeholders", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("Batch AI terminology application canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI terminology application failed", "dirty");
    return false;
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    noTerms: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  state.localAi.progress = {
    total: summary.total,
    completed: 0,
    failed: 0,
    skipped: summary.skipped,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Applying terminology to ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const glossaryTerms = await localAiGlossaryTermsForSegment(segment);
        if (!glossaryTerms.length) {
          summary.noTerms += 1;
          summary.completed += 1;
          continue;
        }
        const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
        const result = await aiCommandService.applyTerminology({
          provider,
          project: state.project,
          segment: { ...segment, tags: segmentTags(segment) },
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          protectedTokens,
          glossaryTerms,
          signal: state.localAi.abortController.signal
        });
        if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
          summary.unchanged += 1;
        } else {
          const suggestion = savedAiSuggestionRecord({
            id: makeId("ai-suggestion"),
            provider: result.provider || provider.name || "AI",
            model: result.model || settings.model,
            segmentId: segment.id,
            suggestedTarget: result.suggestedTarget,
            confidence: result.warnings?.length ? 65 : 82,
            explanation: [
              "Batch AI terminology application suggestion. Review before applying.",
              `Termbase hits considered: ${Math.min(glossaryTerms.length, 12)}`,
              ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
              ...(result.warnings || [])
            ],
            status: "review"
          });
          segment.aiSuggestions = [...(segment.aiSuggestions || []), suggestion];
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.suggested += 1;
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI terminology application failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-apply-terminology-batch", "Batch AI terminology suggestions created", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        appliedCount: summary.completed,
        suggestionCount: summary.suggested,
        unchangedCount: summary.unchanged,
        noTermCount: summary.noTerms,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI terminology application activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
    const noTermText = summary.noTerms ? `; ${summary.noTerms} no termbase hits` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    renderLocalAiOutput([
      `${summary.suggested} terminology suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
      `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
      `${summary.noTerms} segment${summary.noTerms === 1 ? "" : "s"} had no matching termbase hits.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI terminology${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${noTermText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`, summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderAll();
    const message = error.message || "Batch AI terminology application failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function polishActiveSegmentDraftWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before polishing a draft.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  if (!String(segment.target || "").trim()) {
    setSaveStatus("The active segment has no target draft to polish.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "polishing the active draft");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI draft polishing is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["current target draft", "project style instructions", "TM matches", "termbase hints", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("AI draft polish canceled", "dirty");
      return false;
    }
  }
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Requesting AI draft polish...");
  try {
    const [glossaryTerms, tmMatches] = await Promise.all([
      localAiGlossaryTermsForSegment(segment),
      localAiTmMatchesForSegment(segment)
    ]);
    const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
    const result = await aiCommandService.polishSegmentStyle({
      provider,
      project: state.project,
      segment: { ...segment, tags: segmentTags(segment) },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens,
      glossaryTerms,
      tmMatches,
      styleGuide: state.project.aiSettings?.styleGuide || ""
    });
    if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
      renderLocalAiOutput("AI did not propose a different polished draft.", { muted: false });
      setSaveStatus("AI did not propose a different polish.", "saved");
      return true;
    }
    const suggestion = {
      id: makeId("ai-suggestion"),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 65 : 82,
      explanation: [
        "AI style and terminology polish suggestion. Review before applying.",
        ...(tmMatches.length ? [`TM matches considered: ${Math.min(tmMatches.length, 3)}`] : []),
        ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
        ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
    const saved = await appendAiSuggestion(segment, suggestion, "ai-polish-draft", "AI draft polish suggestion created");
    renderLocalAiOutput(result.suggestedTarget);
    if (saved?.ok) {
      setSaveStatus(saved.activityLogged ? "AI polish suggestion ready for review" : "AI polish suggestion ready; activity log failed", saved.activityLogged ? "saved" : "dirty");
      return true;
    }
    setSaveStatus("AI polish suggestion could not be saved.", "dirty");
    return false;
  } catch (error) {
    const message = error.message || "AI draft polish failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

async function adaptActiveSegmentDraftWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before adapting a draft.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  if (!String(segment.target || "").trim()) {
    setSaveStatus("The active segment has no target draft to adapt.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "adapting the active draft");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI draft adaptation is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["current target draft", "adaptation mode", "project style instructions", "TM matches", "termbase hints", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("AI draft adaptation canceled", "dirty");
      return false;
    }
  }
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Requesting AI draft adaptation...");
  try {
    const [glossaryTerms, tmMatches] = await Promise.all([
      localAiGlossaryTermsForSegment(segment),
      localAiTmMatchesForSegment(segment)
    ]);
    const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
    const result = await aiCommandService.adaptSegmentDraft({
      provider,
      project: state.project,
      segment: { ...segment, tags: segmentTags(segment) },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens,
      glossaryTerms,
      tmMatches,
      styleGuide: state.project.aiSettings?.styleGuide || "",
      adaptMode: settings.adaptMode
    });
    if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
      renderLocalAiOutput("AI did not propose a different adapted draft.", { muted: false });
      setSaveStatus("AI did not propose a different adaptation.", "saved");
      return true;
    }
    const suggestion = {
      id: makeId("ai-suggestion"),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 65 : 82,
      explanation: [
        `AI draft adaptation suggestion (${result.adaptMode || settings.adaptMode || "simplify"}). Review before applying.`,
        ...(tmMatches.length ? [`TM matches considered: ${Math.min(tmMatches.length, 3)}`] : []),
        ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
        ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
    const saved = await appendAiSuggestion(segment, suggestion, "ai-adapt-draft", "AI draft adaptation suggestion created");
    renderLocalAiOutput(result.suggestedTarget);
    if (saved?.ok) {
      setSaveStatus(saved.activityLogged ? "AI adaptation suggestion ready for review" : "AI adaptation suggestion ready; activity log failed", saved.activityLogged ? "saved" : "dirty");
      return true;
    }
    setSaveStatus("AI adaptation suggestion could not be saved.", "dirty");
    return false;
  } catch (error) {
    const message = error.message || "AI draft adaptation failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

function selectLocalAiDraftSegments(settings = {}) {
  return selectLocalAiReviewSegments(settings);
}

async function adaptBatchDraftsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "adapting draft batches");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI draft adaptation is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const selection = selectLocalAiDraftSegments(settings);
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No eligible translated draft segments for batch AI adaptation." : "No draft segments to adapt with local AI.", "saved");
    return {
      total: 0,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${selection.candidates.length} source/target draft segments`, "adaptation mode", "project style instructions", "TM matches", "termbase hints", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("Batch AI adaptation canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI adaptation failed", "dirty");
    return false;
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  state.localAi.progress = {
    total: summary.total,
    completed: 0,
    failed: 0,
    skipped: summary.skipped,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Adapting ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const [glossaryTerms, tmMatches] = await Promise.all([
          localAiGlossaryTermsForSegment(segment),
          localAiTmMatchesForSegment(segment)
        ]);
        const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
        const result = await aiCommandService.adaptSegmentDraft({
          provider,
          project: state.project,
          segment: { ...segment, tags: segmentTags(segment) },
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          protectedTokens,
          glossaryTerms,
          tmMatches,
          styleGuide: state.project.aiSettings?.styleGuide || "",
          adaptMode: settings.adaptMode,
          signal: state.localAi.abortController.signal
        });
        if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
          summary.unchanged += 1;
        } else {
          const suggestion = savedAiSuggestionRecord({
            id: makeId("ai-suggestion"),
            provider: result.provider || provider.name || "AI",
            model: result.model || settings.model,
            segmentId: segment.id,
            suggestedTarget: result.suggestedTarget,
            confidence: result.warnings?.length ? 65 : 82,
            explanation: [
              `Batch AI draft adaptation suggestion (${result.adaptMode || settings.adaptMode || "simplify"}). Review before applying.`,
              ...(tmMatches.length ? [`TM matches considered: ${Math.min(tmMatches.length, 3)}`] : []),
              ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
              ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
              ...(result.warnings || [])
            ],
            status: "review"
          });
          segment.aiSuggestions = [...(segment.aiSuggestions || []), suggestion];
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.suggested += 1;
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI adaptation failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-adapt-batch", "Batch AI adaptation suggestions created", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        adaptMode: settings.adaptMode,
        adaptedCount: summary.completed,
        suggestionCount: summary.suggested,
        unchangedCount: summary.unchanged,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI adaptation activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    renderLocalAiOutput([
      `${summary.suggested} adaptation suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
      `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI adaptation${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`, summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderAll();
    const message = error.message || "Batch AI adaptation failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function polishBatchDraftsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "polishing draft batches");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI draft polish is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const selection = selectLocalAiDraftSegments(settings);
  if (!selection.candidates.length) {
    setSaveStatus(selection.skipped.length ? "No eligible translated draft segments for batch AI polish." : "No draft segments to polish with local AI.", "saved");
    return {
      total: 0,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${selection.candidates.length} source/target draft segments`, "project style instructions", "TM matches", "termbase hints", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("Batch AI polish canceled", "dirty");
      return false;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before batch AI polish failed", "dirty");
    return false;
  }
  const snapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const summary = {
    total: selection.candidates.length,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    failed: 0,
    skipped: selection.skipped.length,
    failures: [],
    skippedSegments: selection.skipped,
    updatedSegmentIds: [],
    canceled: false
  };
  const updated = [];
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = new AbortController();
  state.localAi.progress = {
    total: summary.total,
    completed: 0,
    failed: 0,
    skipped: summary.skipped,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Polishing ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`);
  try {
    for (const segment of selection.candidates) {
      if (state.localAi.abortController.signal.aborted) {
        summary.canceled = true;
        break;
      }
      try {
        const [glossaryTerms, tmMatches] = await Promise.all([
          localAiGlossaryTermsForSegment(segment),
          localAiTmMatchesForSegment(segment)
        ]);
        const protectedTokens = segmentTags(segment).map((tag) => tag.text || tag.label || "").filter(Boolean);
        const result = await aiCommandService.polishSegmentStyle({
          provider,
          project: state.project,
          segment: { ...segment, tags: segmentTags(segment) },
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          protectedTokens,
          glossaryTerms,
          tmMatches,
          styleGuide: state.project.aiSettings?.styleGuide || "",
          signal: state.localAi.abortController.signal
        });
        if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
          summary.unchanged += 1;
        } else {
          const suggestion = savedAiSuggestionRecord({
            id: makeId("ai-suggestion"),
            provider: result.provider || provider.name || "AI",
            model: result.model || settings.model,
            segmentId: segment.id,
            suggestedTarget: result.suggestedTarget,
            confidence: result.warnings?.length ? 65 : 82,
            explanation: [
              "Batch AI style and terminology polish suggestion. Review before applying.",
              ...(tmMatches.length ? [`TM matches considered: ${Math.min(tmMatches.length, 3)}`] : []),
              ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
              ...(result.protectedTokens?.length ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`] : []),
              ...(result.warnings || [])
            ],
            status: "review"
          });
          segment.aiSuggestions = [...(segment.aiSuggestions || []), suggestion];
          touchSegment(segment);
          clearPendingSave(segment);
          updated.push(segment);
          summary.suggested += 1;
          summary.updatedSegmentIds.push(segment.id || "");
        }
        summary.completed += 1;
      } catch (error) {
        if (state.localAi.abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          break;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "AI polish failed for this segment.")
        });
      } finally {
        state.localAi.progress = { ...summary };
        renderLocalAiProgress();
      }
    }
    if (updated.length) await saveSegments(updated);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-polish-batch", "Batch AI polish suggestions created", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        polishedCount: summary.completed,
        suggestionCount: summary.suggested,
        unchangedCount: summary.unchanged,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI polish activity log failed.", activityError);
      if (updated.length) markWorkspaceDirty();
    }
    if (updated.length) {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
      markWorkspaceDirty();
    } else {
      renderLocalAiProgress();
    }
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
    const canceledText = summary.canceled ? " canceled" : "";
    const failureLines = summary.failures.slice(0, 4).map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
    renderLocalAiOutput([
      `${summary.suggested} polish suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
      `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
      failureLines.join("\n")
    ].filter(Boolean).join("\n"));
    setSaveStatus(`Batch AI polish${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`, summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved");
    return summary;
  } catch (error) {
    snapshots.forEach((snapshot, id) => {
      const segment = state.segments.find((item) => item.id === id);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    renderAll();
    const message = error.message || "Batch AI polish failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

async function saveAiTermCandidates(terms = [], termBaseName = primaryTermBaseName()) {
  const existingTerms = await listTerms({
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    termBaseNames: [termBaseName]
  });
  const existingKeys = new Set(existingTerms.map((term) => `${stableLower(term.sourceTerm)}::${stableLower(term.targetTerm)}`));
  const candidates = (terms || []).filter((term) => {
    const key = `${stableLower(term.sourceTerm)}::${stableLower(term.targetTerm)}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  const savedTerms = [];
  for (const term of candidates) {
    const saved = await saveTerm({
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      notes: ["AI extracted term candidate. Review before relying on it.", term.note].filter(Boolean).join(" "),
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseName,
      isForbidden: false
    });
    savedTerms.push(saved);
  }
  if (savedTerms.length) markProjectsUsingResourceDirty("termbase", termBaseName, state.project.sourceLang, state.project.targetLang);
  return {
    savedTerms,
    duplicateCount: Math.max(0, (terms || []).length - savedTerms.length)
  };
}

function localAiTerminologySegments(settings = localAiSettingsFromForm()) {
  if (!state.project) return [];
  if (settings.mode === "selected") return currentSegment() ? [currentSegment()] : [];
  if (settings.mode === "visible") return filteredSegmentIndexes().map((index) => state.segments[index]).filter(Boolean);
  if (settings.mode === "project") return state.segments;
  if (settings.mode === "untranslated") return currentDocumentSegments().filter((segment) => !String(segment.target || "").trim());
  return currentDocumentSegments();
}

async function extractActiveSegmentTermsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const segment = currentSegment();
  if (!segment) {
    setSaveStatus("Select a segment before extracting AI terms.", "dirty");
    return false;
  }
  if (!String(segment.source || "").trim()) {
    setSaveStatus("The active segment has no source text.", "dirty");
    return false;
  }
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "extracting terminology");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI term extraction is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const termBaseName = els.termBaseSelect?.value || primaryTermBaseName();
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: ["current target draft", "configured provider URL", `termbase ${termBaseName}`]
    });
    if (!ok) {
      setSaveStatus("AI term extraction canceled", "dirty");
      return false;
    }
  }
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Extracting AI terminology candidates...");
  try {
    const result = await aiCommandService.extractSegmentTerms({
      provider,
      project: state.project,
      segment,
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode
    });
    const { savedTerms } = await saveAiTermCandidates(result.terms || [], termBaseName);
    if (!savedTerms.length) {
      renderLocalAiOutput(
        result.terms?.length
          ? "AI term candidates already exist in the current termbase."
          : "AI did not find reusable term candidates in the active segment.",
        { muted: false }
      );
      setSaveStatus(result.terms?.length ? "AI term candidates already exist" : "AI did not find term candidates", "saved");
      return true;
    }
    let activityLogged = true;
    try {
      await logProjectActivity("ai-term-extraction", "AI term candidates extracted", {
        segmentId: segment.id,
        provider: result.provider || provider.name || settings.providerId,
        model: result.model || settings.model,
        termBaseName,
        termCount: savedTerms.length
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("AI term extraction activity log failed.", activityError);
      markWorkspaceDirty();
    }
    try {
      await refreshProjectTerms({ rerender: true });
      await refreshTerms();
    } catch (refreshError) {
      console.warn("Term refresh failed after AI extraction.", refreshError);
    }
    renderLocalAiOutput(
      savedTerms.map((term) => `${term.sourceTerm} -> ${term.targetTerm}${term.notes ? ` (${term.notes})` : ""}`).join("\n")
    );
    setSaveStatus(activityLogged ? `Saved ${savedTerms.length} AI term candidate${savedTerms.length === 1 ? "" : "s"}` : `Saved ${savedTerms.length} AI term candidate${savedTerms.length === 1 ? "" : "s"}; activity log failed`, activityLogged ? "saved" : "dirty");
    return true;
  } catch (error) {
    const message = error.message || "AI term extraction failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

async function extractBatchTermsWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "extracting batch terminology");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "Batch AI term extraction is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const segments = localAiTerminologySegments(settings).filter((segment) => String(segment?.source || "").trim());
  if (!segments.length) {
    setSaveStatus("No source segments are available for batch AI term extraction.", "dirty");
    return false;
  }
  const termBaseName = els.termBaseSelect?.value || primaryTermBaseName();
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: true,
      contextLabels: [`${segments.length} segment source/target snippets`, "configured provider URL", `termbase ${termBaseName}`]
    });
    if (!ok) {
      setSaveStatus("Batch AI term extraction canceled", "dirty");
      return false;
    }
  }
  const abortController = new AbortController();
  state.localAi.running = true;
  state.localAi.promptBusy = true;
  state.localAi.abortController = abortController;
  state.localAi.progress = {
    total: segments.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    skippedSegments: 0,
    canceled: false
  };
  renderLocalAiCommandCentre();
  setSaveStatus(`Extracting AI terms from ${segments.length} segment${segments.length === 1 ? "" : "s"}...`);
  const allCandidates = [];
  const failures = [];
  try {
    for (const segment of segments) {
      if (abortController.signal.aborted) break;
      try {
        const result = await aiCommandService.extractSegmentTerms({
          provider,
          project: state.project,
          segment,
          settings,
          config,
          sourceLanguage: settings.sourceLanguage,
          sourceCode: settings.sourceCode,
          targetLanguage: settings.targetLanguage,
          targetCode: settings.targetCode,
          signal: abortController.signal
        });
        allCandidates.push(...(result.terms || []));
        state.localAi.progress.completed += 1;
      } catch (error) {
        if (abortController.signal.aborted || String(error?.message || "").includes("canceled")) break;
        failures.push({ segmentId: segment.id, error: error.message || String(error) });
        state.localAi.progress.failed += 1;
      }
      renderLocalAiProgress();
    }
    state.localAi.progress.canceled = abortController.signal.aborted;
    const { savedTerms, duplicateCount } = await saveAiTermCandidates(allCandidates, termBaseName);
    let activityLogged = true;
    try {
      await logProjectActivity("ai-term-extraction-batch", "Batch AI term candidates extracted", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        mode: settings.mode,
        termBaseName,
        segmentCount: segments.length,
        completed: state.localAi.progress.completed,
        failed: state.localAi.progress.failed,
        savedTermCount: savedTerms.length,
        duplicateCount
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("Batch AI term extraction activity log failed.", activityError);
      markWorkspaceDirty();
    }
    try {
      await refreshProjectTerms({ rerender: true });
      await refreshTerms();
    } catch (refreshError) {
      console.warn("Term refresh failed after batch AI extraction.", refreshError);
    }
    const statusPieces = [
      `saved ${savedTerms.length}`,
      `duplicates ${duplicateCount}`,
      `failed ${failures.length}`
    ];
    if (state.localAi.progress.canceled) statusPieces.push("canceled");
    const savedText = savedTerms.length
      ? savedTerms.map((term) => `${term.sourceTerm} -> ${term.targetTerm}${term.notes ? ` (${term.notes})` : ""}`).join("\n")
      : "No new AI term candidates were saved.";
    const failureText = failures.length
      ? `\n\nFailures:\n${failures.slice(0, 5).map((failure) => `- ${failure.segmentId}: ${failure.error}`).join("\n")}`
      : "";
    renderLocalAiOutput(`${savedText}${failureText}`, { muted: !savedTerms.length && !failures.length });
    setSaveStatus(
      `${state.localAi.progress.canceled ? "Canceled" : "Finished"} batch AI term extraction: ${statusPieces.join(", ")}${activityLogged ? "" : "; activity log failed"}`,
      failures.length || !activityLogged || state.localAi.progress.canceled ? "dirty" : "saved"
    );
    return { savedTerms, failures, duplicateCount, canceled: state.localAi.progress.canceled };
  } catch (error) {
    const message = error.message || "Batch AI term extraction failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.running = false;
    state.localAi.promptBusy = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

function projectBriefSampleSegments(limit = 6) {
  const scoped = currentDocumentSegments();
  const source = scoped.length ? scoped : state.segments;
  const picked = [];
  for (const segment of source) {
    if (!String(segment.source || "").trim()) continue;
    picked.push({
      source: segment.source,
      target: segment.target || ""
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

async function generateProjectBriefWithLocalAi() {
  if (!state.project || state.localAi.running || state.localAi.promptBusy) return false;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "generating a project brief");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider?.completePrompt) {
    const message = "AI project brief generation is not available for this provider.";
    setSaveStatus(message, "dirty");
    return false;
  }
  const sampleSegments = projectBriefSampleSegments();
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const ok = confirmExternalAiPromptShare({
      provider: provider.name || settings.providerId,
      includesSourceText: sampleSegments.length > 0,
      contextLabels: ["project metadata", "document names", "sample segments", "termbase hints", "configured provider URL"]
    });
    if (!ok) {
      setSaveStatus("AI project brief canceled", "dirty");
      return false;
    }
  }
  const projectSnapshot = structuredClone(state.project);
  state.localAi.promptBusy = true;
  renderLocalAiCommandCentre();
  setSaveStatus("Generating AI project brief...");
  try {
    const documents = projectDocuments();
    const terms = await listTerms({
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    });
    const result = await aiCommandService.generateProjectBrief({
      provider,
      project: state.project,
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      documents,
      sampleSegments,
      terms: terms.slice(0, 12)
    });
    const existingStyle = String(state.project.aiSettings?.styleGuide || "").trim();
    const generatedBlock = `AI project brief:\n${result.brief.trim()}`;
    const nextStyleGuide = existingStyle
      ? `${existingStyle}\n\n${generatedBlock}`
      : generatedBlock;
    const aiSettings = defaultAiSettings({
      ...state.project.aiSettings,
      styleGuide: nextStyleGuide
    });
    state.project = await updateProject({ ...state.project, aiSettings });
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
    markWorkspaceDirty();
    let activityLogged = true;
    try {
      await logProjectActivity("ai-project-brief", "AI project brief generated", {
        provider: result.provider || provider.name || settings.providerId,
        model: result.model || settings.model,
        sampleCount: sampleSegments.length,
        termCount: Math.min(terms.length, 12)
      });
    } catch (activityError) {
      activityLogged = false;
      console.warn("AI project brief activity log failed.", activityError);
      markWorkspaceDirty();
    }
    aiAdministrationController?.setGlobalStyleGuide?.(state.project.aiSettings.styleGuide || "");
    renderLocalAiOutput(result.brief);
    setSaveStatus(activityLogged ? "AI project brief saved to style instructions" : "AI project brief saved; activity log failed", activityLogged ? "saved" : "dirty");
    return true;
  } catch (error) {
    state.project = projectSnapshot;
    state.projects = state.projects.map((project) => (project.id === projectSnapshot.id ? projectSnapshot : project));
    aiAdministrationController?.setGlobalStyleGuide?.(defaultAiSettings(projectSnapshot.aiSettings).styleGuide || "");
    const message = error.message || "AI project brief failed.";
    renderLocalAiOutput(message, { muted: false });
    setSaveStatus(message, "dirty");
    return false;
  } finally {
    state.localAi.promptBusy = false;
    renderLocalAiCommandCentre();
  }
}

function localAiPretranslationSegments(settings) {
  if (settings.mode === "project" || settings.mode === "visible" || settings.mode === "selected") return state.segments;
  return currentDocumentSegments();
}

function localAiPretranslationOptions(settings) {
  return {
    mode: settings.mode,
    selectedSegmentIds: currentSegment()?.id ? [currentSegment().id] : [],
    visibleSegmentIds: filteredSegmentIndexes().map((index) => state.segments[index]?.id).filter(Boolean)
  };
}

async function localAiGlossaryTermsForSegment(segment) {
  if (!state.project || !segment) return [];
  if (defaultAiSettings(state.project.aiSettings).useTermbaseContext === false) return [];
  try {
    return await findTerms({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    });
  } catch (error) {
    console.warn("Local AI pretranslation termbase lookup failed.", error);
    return [];
  }
}

async function localAiTmMatchesForSegment(segment) {
  if (!state.project || !segment) return [];
  if (defaultAiSettings(state.project.aiSettings).useTmContext === false) return [];
  try {
    return await findProjectTmMatches({
      source: segment.source,
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      tmNames: projectTmNames(),
      limit: 3
    });
  } catch (error) {
    console.warn("Local AI pretranslation TM lookup failed.", error);
    return [];
  }
}

function localAiSurroundingSegmentsForSegment(segment, options = {}) {
  if (!state.project || !segment) return [];
  const settings = options.settings || localAiSettingsFromForm();
  if (settings.includeNearbyContext === false) return [];
  const segments = Array.isArray(options.segments) && options.segments.length ? options.segments : state.segments;
  const segmentIndex = segments.findIndex((item) => item?.id === segment.id);
  if (segmentIndex < 0) return [];
  const sameDocument = (item) => {
    if (!segment.documentId) return true;
    return item?.documentId === segment.documentId;
  };
  const before = [];
  for (let index = segmentIndex - 1; index >= 0 && before.length < 2; index -= 1) {
    const item = segments[index];
    if (!sameDocument(item) || !String(item?.source || "").trim()) continue;
    before.unshift({
      relation: `Previous segment ${before.length + 1}`,
      source: item.source,
      target: item.target || ""
    });
  }
  const after = [];
  for (let index = segmentIndex + 1; index < segments.length && after.length < 2; index += 1) {
    const item = segments[index];
    if (!sameDocument(item) || !String(item?.source || "").trim()) continue;
    after.push({
      relation: `Next segment ${after.length + 1}`,
      source: item.source,
      target: item.target || ""
    });
  }
  return [...before, ...after];
}

async function pretranslateWithLocalAi() {
  if (!state.project || state.localAi.running) return;
  const settings = await persistLocalAiSettings({ silent: true });
  let config = null;
  try {
    config = localAiRuntimeConfig(settings);
    assertLocalAiRuntimeReady(settings, config, "pre-translating");
  } catch (error) {
    const message = error.message || "Local AI key setup failed.";
    setSaveStatus(message, "dirty");
    return;
  }
  const provider = currentLocalAiProvider(settings);
  if (!provider) {
    const message = "Pre-translation is not available for this provider.";
    setSaveStatus(message, "dirty");
    return;
  }
  if (localAiProviderSharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
    const contextLabels = [
      "configured provider URL",
      "batch segment text",
      settings.includeNearbyContext !== false ? "nearby segment context" : "",
      defaultAiSettings(state.project.aiSettings).useTmContext !== false ? "TM matches" : "",
      defaultAiSettings(state.project.aiSettings).useTermbaseContext !== false ? "termbase hints" : ""
    ].filter(Boolean);
    const ok = confirmExternalAiPromptShare({ provider: provider.name || settings.providerId, includesSourceText: true, contextLabels });
    if (!ok) {
      setSaveStatus("AI pre-translation canceled", "dirty");
      return;
    }
  }
  if (settings.overwriteExisting) {
    const ok = uiConfirm("Overwrite existing target text in eligible draft segments? Confirmed and locked segments are always preserved.");
    if (!ok) {
      setSaveStatus("Local AI pre-translation canceled", "saved");
      return;
    }
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before local AI pre-translation failed", "dirty");
    return;
  }
  const segments = localAiPretranslationSegments(settings);
  const pretranslationOptions = localAiPretranslationOptions(settings);
  const selection = preTranslationService.selectSegments(segments, {
    ...pretranslationOptions,
    settings,
    project: state.project
  });
  state.localAi.progress = {
    total: selection.candidates.length,
    completed: 0,
    failed: 0,
    skipped: selection.skipped.length
  };
  if (!selection.candidates.length) {
    renderLocalAiProgress();
    setSaveStatus(selection.skipped.length ? "No eligible segments for local AI pre-translation." : "No segments to pre-translate.", "saved");
    return;
  }
  const beforePatches = new Map(selection.candidates.map((segment) => [segment.id, targetCommandPatch(segment)]));
  const beforeSnapshots = new Map(selection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
  const activeSegmentId = currentSegment()?.id || selection.candidates[0].id;
  state.localAi.running = true;
  state.localAi.abortController = new AbortController();
  renderLocalAiCommandCentre();
  setSaveStatus(`Local AI pre-translating ${selection.candidates.length} segment${selection.candidates.length === 1 ? "" : "s"}...`);
  try {
    const summary = await preTranslationService.pretranslateSegments({
      segments,
      provider,
      project: state.project,
      settings,
      config,
      mode: settings.mode,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      glossaryTermsForSegment: localAiGlossaryTermsForSegment,
      tmMatchesForSegment: localAiTmMatchesForSegment,
      surroundingSegmentsForSegment: settings.includeNearbyContext !== false
        ? (segment) => localAiSurroundingSegmentsForSegment(segment, { settings, segments })
        : null,
      selectedSegmentIds: pretranslationOptions.selectedSegmentIds,
      visibleSegmentIds: pretranslationOptions.visibleSegmentIds,
      signal: state.localAi.abortController.signal,
      onProgress(progress) {
        state.localAi.progress = progress;
        renderLocalAiProgress();
      }
    });
    const updated = summary.updatedSegmentIds
      .map((id) => state.segments.find((segment) => segment.id === id))
      .filter(Boolean);
    if (summary.canceled) {
      beforePatches.forEach((patch, segmentId) => {
        const segment = state.segments.find((item) => item.id === segmentId);
        if (segment) applyTargetCommandPatch(segment, patch);
      });
      invalidateSegmentFilterCache();
      renderAll();
      setSaveStatus("Local AI pre-translation canceled; no target changes were applied", "saved");
      return null;
    }
    updated.forEach((segment) => {
      clearPendingSave(segment);
      recordSegmentTargetHistory(segment, segment.target, segment.status, "ai-pretranslate");
      touchSegment(segment);
    });
    if (!updated.length) {
      const failureText = summary.failed ? `; ${summary.failed} failed` : "";
      const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
      setSaveStatus(`Local AI pre-translation: no segments updated${failureText}${skippedText}`, summary.failed ? "dirty" : "saved");
      return null;
    }
    const command = appRuntime.commands.createAiPretranslationCommand({
      projectId: state.project.id,
      segmentIds: updated.map((segment) => segment.id),
      beforePatches: updated.map((segment) => beforePatches.get(segment.id)),
      provenance: {
        origin: "ai",
        producer: "pretranslation",
        provider: provider.name || settings.providerId,
        providerId: settings.providerId,
        model: settings.model,
        failedCount: summary.failed,
        skippedCount: summary.skipped
      },
      restorePatches: (patches, context) =>
        restoreBatchTargetCommandPatches(patches, { ...context, activeSegmentId }),
      applyFirst: async () => {
        if (LOOPCAT_TEST_BUILD && updated.some((segment) => segment[PRETRANSLATE_SAVE_FAILURE_TEST_FLAG])) {
          throw new Error("Simulated pretranslation save failure");
        }
        await saveSegments(updated);
        return {
          patches: updated.map((segment) => targetCommandPatch(segment)),
          activeSegmentId,
          affectedCount: updated.length
        };
      }
    });
    const commandExecution = await appRuntime.commands.bus.execute(command);
    renderUndoControls();
    try {
      await logProjectActivity("ai-pretranslate", "Local AI pretranslation applied", {
        provider: provider.name || settings.providerId,
        model: settings.model,
        updatedCount: updated.length,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        canceled: summary.canceled
      });
    } catch (activityError) {
      console.warn("Local AI pretranslation activity log failed.", activityError);
    }
    try {
      state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
      renderAll();
      await refreshSidebar();
    } catch (refreshError) {
      console.warn("Local AI pretranslation refresh failed.", refreshError);
      renderAll();
    }
    markWorkspaceDirty();
    const failureText = summary.failed ? `; ${summary.failed} failed` : "";
    const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
    setSaveStatus(
      `Local AI pre-translation: ${updated.length} segment${updated.length === 1 ? "" : "s"} updated${failureText}${skippedText}; Undo is available`,
      summary.failed ? "dirty" : "saved"
    );
    return { ...commandExecution, summary };
  } catch (error) {
    beforeSnapshots.forEach((snapshot, segmentId) => {
      const segment = state.segments.find((item) => item.id === segmentId);
      if (!segment) return;
      Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
      Object.assign(segment, snapshot);
      prepareSegmentHistoryState(segment);
    });
    invalidateSegmentFilterCache();
    renderSegments();
    renderProgress();
    renderRevisionHistory();
    setSaveStatus(error.message || "Local AI pre-translation failed", "dirty");
    return null;
  } finally {
    state.localAi.running = false;
    state.localAi.abortController = null;
    renderLocalAiCommandCentre();
  }
}

function cancelLocalAiBatch() {
  state.localAi.abortController?.abort();
  state.localAi.progress = {
    ...(state.localAi.progress || {}),
    canceled: true
  };
  renderLocalAiProgress();
  setSaveStatus("Canceling local AI batch...", "dirty");
}

function humanReadableList(items) {
  const clean = [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function confirmExternalAiPromptShare({ provider, includesSourceText, contextLabels = [] }) {
  const payloadItems = [
    includesSourceText ? "selected/source text" : "",
    "project instructions",
    ...contextLabels
  ];
  const payload = humanReadableList(payloadItems);
  return uiConfirm(`Open ${provider} and send ${payload} outside LoopCAT?`);
}

async function splitCurrentSegment() {
  const segment = currentSegment();
  const textarea = els.segmentBody.querySelector(`tr[data-index="${currentActiveIndex()}"] textarea`);
  if (!segment || !textarea) return null;
  if (!canSplitSegmentStructure(segment)) {
    setSaveStatus("Split is unavailable for structure-preserving localization files.", "dirty");
    return null;
  }
  const source = segment.source || "";
  const target = segment.target || "";
  const targetCursor = textarea.selectionStart || 0;
  const sourceCursor = mappedSourceSplitIndex(source, target, targetCursor);
  if (sourceCursor <= 0 || sourceCursor >= source.length) {
    setSaveStatus("Place the cursor in the target/source-equivalent position before splitting.", "dirty");
    return null;
  }
  const firstSource = source.slice(0, sourceCursor).trim();
  const secondSource = source.slice(sourceCursor).trim();
  if (!firstSource || !secondSource) return null;
  const targetSplit = target.trim() ? Math.min(targetCursor, target.length) : 0;
  const firstTarget = target.slice(0, targetSplit).trim();
  const secondTarget = target.slice(targetSplit).trim();
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before splitting failed", "dirty");
    return null;
  }
  const beforeSegments = state.segments.map((item) => structuredClone(item));
  const createdSegmentId = `segment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const createdAt = new Date().toISOString();
  const command = appRuntime?.commands?.createSplitSegmentCommand?.({
    projectId: state.project.id,
    segmentId: segment.id,
    createdSegmentId,
    beforeSegments,
    restoreSegments: restoreSplitSegmentCommandSegments,
    applyFirst: async () => {
      const nextSegments = beforeSegments.map((item) => structuredClone(item));
      const firstSegment = nextSegments.find((item) => item.id === segment.id);
      if (!firstSegment) throw new Error("The segment to split is no longer available.");
      const secondSegment = {
        ...structuredClone(firstSegment),
        id: createdSegmentId,
        index: Number(firstSegment.index || 0) + 0.5,
        documentIndex: Number(firstSegment.documentIndex || 0) + 0.5,
        source: secondSource,
        target: secondTarget,
        status: secondTarget ? "draft" : "empty",
        tags: detectProtectedTags(secondSource),
        revision: 1,
        createdAt,
        updatedAt: createdAt
      };
      firstSegment.source = firstSource;
      setSegmentTargetAndStatus(firstSegment, firstTarget, firstTarget ? "draft" : "empty", "split");
      firstSegment.tags = detectProtectedTags(firstSource);
      touchSegment(firstSegment);
      const ordered = normalizeStructuralSegmentOrder([...nextSegments, secondSegment]);
      if (LOOPCAT_TEST_BUILD && segment[SPLIT_SAVE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated split save failure");
      }
      const savedSegments = await saveSegmentStructure(ordered);
      state.segments = prepareSegmentHistoryStates(savedSegments);
      selectApplicationSegment(state.segments.findIndex((item) => item.id === createdSegmentId));
      invalidateSegmentFilterCache();
      markWorkspaceDirty();
      return {
        segments: state.segments.map((item) => structuredClone(item)),
        activeSegmentId: createdSegmentId,
        affectedCount: 2,
        focusTarget: true
      };
    }
  });
  if (!command) {
    setSaveStatus("The reversible segment split service is unavailable.", "dirty");
    return null;
  }

  let commandExecution;
  try {
    commandExecution = await appRuntime.commands.bus.execute(command);
  } catch (error) {
    state.segments = prepareSegmentHistoryStates(beforeSegments);
    selectApplicationSegment(Math.max(0, state.segments.findIndex((item) => item.id === segment.id)));
    invalidateSegmentFilterCache();
    renderAll();
    focusActiveTextarea();
    setSaveStatus(error.message || "Segment split failed", "dirty");
    return null;
  }
  state.commandProjectId = state.project.id;
  renderAll();
  renderUndoControls();
  setSaveStatus("Segment split; Undo is available", "saved");
  focusActiveTextarea();
  return commandExecution;
}

async function mergeWithNextSegment() {
  const segment = currentSegment();
  if (!segment) return null;
  const next = nextSegmentForMerge(segment);
  if (!next) return null;
  if (!canMergeSegmentStructures(segment, next)) {
    setSaveStatus("Merge is available only for unstructured text or DOCX segments from the same paragraph.", "dirty");
    return null;
  }
  try {
    await flushPendingSegmentSaves(state.project.id);
  } catch (error) {
    setSaveStatus(error.message || "Save pending changes before merging failed", "dirty");
    return null;
  }
  const beforeSegments = state.segments.map((item) => structuredClone(item));
  const segmentId = segment.id;
  const mergedSegmentId = next.id;
  const command = appRuntime?.commands?.createMergeSegmentCommand?.({
    projectId: state.project.id,
    segmentId,
    mergedSegmentId,
    beforeSegments,
    restoreSegments: restoreMergeSegmentCommandSegments,
    applyFirst: async () => {
      const nextSegments = beforeSegments.map((item) => structuredClone(item));
      const survivingSegment = nextSegments.find((item) => item.id === segmentId);
      const mergedSegment = nextSegments.find((item) => item.id === mergedSegmentId);
      if (!survivingSegment || !mergedSegment || !canMergeSegmentStructures(survivingSegment, mergedSegment)) {
        throw new Error("The segments to merge are no longer available in a compatible structure.");
      }
      survivingSegment.source = `${survivingSegment.source} ${mergedSegment.source}`.trim();
      const mergedTarget = `${survivingSegment.target || ""} ${mergedSegment.target || ""}`.trim();
      setSegmentTargetAndStatus(
        survivingSegment,
        mergedTarget,
        mergedTarget ? "draft" : "empty",
        "merge"
      );
      survivingSegment.tags = detectProtectedTags(survivingSegment.source);
      touchSegment(survivingSegment);
      const ordered = normalizeStructuralSegmentOrder(
        nextSegments.filter((item) => item.id !== mergedSegmentId)
      );
      if (LOOPCAT_TEST_BUILD && segment[MERGE_POST_DELETE_FAILURE_TEST_FLAG]) {
        throw new Error("Simulated merge transaction failure");
      }
      const savedSegments = await saveSegmentStructure(ordered, [mergedSegmentId]);
      state.segments = prepareSegmentHistoryStates(savedSegments);
      selectApplicationSegment(state.segments.findIndex((item) => item.id === segmentId));
      invalidateSegmentFilterCache();
      markWorkspaceDirty();
      return {
        segments: state.segments.map((item) => structuredClone(item)),
        activeSegmentId: segmentId,
        affectedCount: 2,
        focusTarget: true
      };
    }
  });
  if (!command) {
    setSaveStatus("The reversible segment merge service is unavailable.", "dirty");
    return null;
  }

  let commandExecution;
  try {
    commandExecution = await appRuntime.commands.bus.execute(command);
  } catch (error) {
    state.segments = prepareSegmentHistoryStates(beforeSegments);
    selectApplicationSegment(Math.max(0, state.segments.findIndex((item) => item.id === segmentId)));
    invalidateSegmentFilterCache();
    renderAll();
    focusActiveTextarea();
    setSaveStatus(error.message || "Segment merge failed", "dirty");
    return null;
  }
  state.commandProjectId = state.project.id;
  renderAll();
  renderUndoControls();
  setSaveStatus("Segments merged; Undo is available", "saved");
  focusActiveTextarea();
  return commandExecution;
}

async function importDocx(file) {
  assertFileSize(file, "Project file", MAX_PROJECT_IMPORT_BYTES);
  await reportImportProgress("Reading DOCX package", file);
  const result = await extractDocxSegments(file);
  await reportImportProgress("Saving imported segments", file, `${result.segments.length} segment${result.segments.length === 1 ? "" : "s"}`);
  const documentId = `doc-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const documents = [...projectDocumentManifest(state.project), { id: documentId, name: result.fileName, type: "docx" }];
  const docxStructures = { ...(state.project.docxStructures || {}), [documentId]: result.structure };
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...state.project, sourceFileName: result.fileName, docxStructure: result.structure, docxStructures, documents },
    result.segments,
    { documentId, documentName: result.fileName, documentType: "docx" }
  );
  await reportImportProgress("Refreshing project view", file);
  state.project = importResult.project;
  state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
  state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  await refreshProjectSummaries();
  const activeIndex = state.segments.findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: state.segments[activeIndex]?.id || "",
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
  const documents = [...projectDocumentManifest(state.project), { id: documentId, name: result.fileName, type: result.documentType }];
  const localizationStructures = result.structure
    ? { ...(state.project.localizationStructures || {}), [documentId]: result.structure }
    : state.project.localizationStructures;
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...state.project, documents, localizationStructures },
    result.segments,
    { documentId, documentName: result.fileName, documentType: result.documentType }
  );
  await reportImportProgress("Refreshing project view", file);
  state.project = importResult.project;
  state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
  state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  await refreshProjectSummaries();
  const activeIndex = state.segments.findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: state.segments[activeIndex]?.id || "",
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
  const documents = [...projectDocumentManifest(state.project), { id: documentId, name: result.fileName, type: result.documentType }];
  const localizationStructures = {
    ...(state.project.localizationStructures || {}),
    [documentId]: result.structure
  };
  const importResult = await appendProjectSegmentsAndUpdateProject(
    { ...state.project, documents, localizationStructures },
    result.segments,
    { documentId, documentName: result.fileName, documentType: result.documentType }
  );
  await reportImportProgress("Refreshing project view", file);
  state.project = importResult.project;
  state.segments = prepareSegmentHistoryStates(await getProjectSegments(state.project.id));
  state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  await refreshProjectSummaries();
  const activeIndex = state.segments.findIndex((segment) => segment.documentId === documentId);
  selectApplicationDocument(documentId, {
    segmentId: state.segments[activeIndex]?.id || "",
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
  if (!state.project || !file) return;
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
  const usedNames = new Set(state.projects.map((project) => project.name).filter(Boolean));
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

async function buildProjectPackage(project = state.project, segmentRecords = null, options = {}) {
  if (!project) return null;
  await flushPendingSegmentSaves(project.id);
  const projectSegments = segmentRecords || (project.id === state.project?.id ? state.segments : await getProjectSegments(project.id));
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
      aiSettings: defaultAiSettings(project.aiSettings)
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
  if (!state.project) return;
  const base = fileSafeName(state.project.name || "project");
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
    ...state.project,
    exportHistory: [
      ...(state.project.exportHistory || []),
      exportHistoryEntry
    ].slice(-25)
  };
  const activityDetail = { filename, warningCount: warnings };
  const shouldSimulateActivityFailure = Boolean(LOOPCAT_TEST_BUILD && state.project?.[EXPORT_ACTIVITY_FAILURE_TEST_FLAG]);
  const pendingActivityEvent = shouldSimulateActivityFailure
    ? null
    : draftProjectActivityEvent(state.project, "export", "Project package exported", activityDetail);
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
    state.project = await updateProject(pendingProject);
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
  } catch (error) {
    console.warn("Project package export history update failed.", error);
    markWorkspaceDirty(state.project?.id);
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
      state.activityEvents = await listActivityEvents(state.project.id);
    }
    markWorkspaceDirty(state.project.id);
    renderBackupReminder();
  } catch (activityError) {
    activityLogged = false;
    console.warn("Project package export activity log failed.", activityError);
    if (state.project?.id) markWorkspaceDirty(state.project.id);
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
  const existing = state.projects.find((project) => project.id === pkg.project.id);
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
  state.project = null;
  state.segments = [];
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
  state.project = null;
  state.segments = [];
  applicationNavigation.openProjects();
  applicationNavigation.clearSelection();
  await loadProjects(false);
  const restoredProjectIds = state.projects.map((project) => project.id).filter(Boolean);
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
  if (!state.project) return;
  await flushPendingSegmentSaves();
  if (!state.workspaceStatus?.connected) await chooseWorkspaceFolder();
  if (!state.workspaceStatus?.connected) return;
  const previewPackage = await buildProjectPackage(state.project);
  assertValidProjectPackageForWrite(previewPackage, "save project package to workspace");
  const shouldSimulateActivityFailure = Boolean(LOOPCAT_TEST_BUILD && state[WORKSPACE_SAVE_ACTIVITY_FAILURE_TEST_FLAG]);
  const pendingActivityEvent = shouldSimulateActivityFailure
    ? null
    : draftProjectActivityEvent(state.project, "workspace-save", "Project package saved to workspace folder");
  const { pkg, result } = await saveProjectPackageToWorkspaceById(state.project.id, {
    activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
  });
  let activityLogged = true;
  try {
    if (shouldSimulateActivityFailure) throw new Error("Simulated workspace save activity failure");
    if (pendingActivityEvent) {
      await bulkPut("activityEvents", [pendingActivityEvent]);
      state.activityEvents = await listActivityEvents(state.project.id);
    }
    renderBackupReminder();
  } catch (activityError) {
    activityLogged = false;
    console.warn("Workspace save activity log failed.", activityError);
  }
  if (!activityLogged) markWorkspaceDirty(state.project.id);
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
    if (state.project?.id === projectId) {
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
  if (!shouldSaveToFolder || !state.project) return false;
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
  const editing = projectDialogController?.getMode?.() === "edit" && Boolean(state.project);
  const settings = collectProjectResourceSettings(editing ? state.project : null);
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
  if (editing && state.project) {
    const creatorName = rememberCreatorName(els.projectCreatorInput?.value || "");
    state.project = await updateProject({
      ...state.project,
      name: els.projectNameInput.value.trim(),
      creatorName,
      creatorOrigin: state.project.creatorOrigin || "manual",
      domain: els.projectDomainInput.value.trim(),
      ...settings
    });
    state.projects = state.projects.map((project) => (project.id === state.project.id ? state.project : project));
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
    return state.project;
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
  state.project = null;
  state.segments = [];
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
    projects: state.projects,
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
    getAllByIndex("tmEntries", "languagePair", `${state.project.sourceLang}::${state.project.targetLang}`),
    listTerms({
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    }),
    listActivityEvents(state.project.id)
  ]);
  const scopedTm = tmEntries.filter((entry) => tmNames.has(entry.tmName));
  const reportActivityEvents = sanitizePortableValue(activityEvents, "activityEvents");
  const validation = validateExportReadiness({ project: state.project, segments: state.segments, format: "project-report", terms });
  const analysis = analyzeProject(state.project, state.segments, scopedTm);
  const qaSegments = state.segments.map((segment) => ({
    ...segment,
    tags: segmentTags(segment)
  }));
  const fallback = () => Promise.resolve(runQaChecks(state.segments, terms, { missingTags }));
  const qaChecks = workerClient?.runQaChecks
    ? await workerClient.runQaChecks({ segments: qaSegments, terms, fallback })
    : await fallback();
  const qualityPassport = buildQualityPassportData({
    project: state.project,
    segments: state.segments,
    qaChecks,
    validation,
    analysis,
    terms,
    activityEvents: reportActivityEvents,
    tmEntries: scopedTm,
    tmEntryCount: scopedTm.length,
    termCount: terms.length,
    profile: state.project.qualityProfile
  });
  return {
    generatedAt: new Date().toISOString(),
    project: state.project,
    resources: projectResourceSummary(state.project),
    analysis,
    validation,
    qualityPassport,
    qaChecks,
    qaBySeverity: countBy(qaChecks, (check) => check.severity),
    qaByType: countBy(qaChecks, (check) => check.type),
    reviewByState: countBy(state.segments.filter((segment) => segment.reviewState), (segment) => segment.reviewState),
    activityEvents: reportActivityEvents,
    activityByType: countBy(reportActivityEvents, (event) => event.type),
    tmEntryCount: scopedTm.length,
    termCount: terms.length,
    forbiddenTermCount: terms.filter((term) => term.isForbidden).length,
    revisionCount: state.segments.reduce((sum, segment) => sum + (Array.isArray(segment.targetHistory) ? segment.targetHistory.length : 0), 0),
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
  if (!state.project) return;
  try {
    const data = await buildProjectReportData();
    state.qaChecks = data.qaChecks;
    state.qaFilter = "";
    state.qualityRiskQueue = data.qualityPassport.riskQueue;
    renderQaResults();
    renderQualityWorkbench();
    renderValidationReport(data.validation);
    const base = fileSafeName(state.project.name || "project");
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
  if (!state.project) return;
  try {
    const anonymized = Boolean(options.anonymized);
    const data = await buildProjectReportData();
    state.qaChecks = data.qaChecks;
    state.qaFilter = "";
    renderQaResults();
    renderValidationReport(data.validation);
    const base = fileSafeName(state.project.name || "project");
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
  if (!state.project) return;
  try {
    await flushPendingSegmentSaves();
    const { documentInfo, segments } = deliveryExportScope();
    const exportPlan = planDeliveryExport({ format: "txt", documentInfo, segments });
    const report = validateExportReadiness({ project: state.project, segments, format: "txt", terms: await projectTermsForValidation(), exportPlan });
    addScopedExportReportNote(report, documentInfo, "Target TXT");
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, state.project.name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const content = exportPlan.segments
      .map((segment) => segment.target.trim())
      .join("\n\n");
    const base = scopedExportBaseName(state.project.name || "project", documentInfo);
    download(`${base}_${state.project.targetLang}.txt`, content, "text/plain");
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
  if (!state.project) return;
  try {
    await flushPendingSegmentSaves();
    const documentInfo = exportDocumentForTypes(new Set(["docx"]), "The selected file is not a DOCX document.", "Select a DOCX document to export.");
    if (!documentInfo) return;
    const segments = state.segments.filter((segment) => segment.documentId === documentInfo.id);
    const exportPlan = planDeliveryExport({ format: "docx", documentInfo, segments });
    const report = validateExportReadiness({ project: state.project, segments, documentInfo, format: "docx", terms: await projectTermsForValidation(), exportPlan });
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, state.project.name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const docxStructure = state.project.docxStructures?.[documentInfo.id] || state.project.docxStructure;
    const base = fileSafeName(state.project.name || "project");
    const bytes = await buildTargetDocx({ ...state.project, docxStructure }, exportPlan.segments);
    download(`${base}_${fileSafeName(documentInfo.name)}_${state.project.targetLang}.docx`, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
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
  if (!state.project) return;
  try {
    await flushPendingSegmentSaves();
    const terms = await projectTermsForValidation();
    const report = validateExportReadiness({ project: state.project, segments: state.segments, format: "bilingual-docx", terms });
    renderValidationReport(report);
    if (!canRunBilingualDocxExport(report)) return;
    const qaSegments = state.segments.map((segment) => ({
      ...segment,
      tags: segmentTags(segment)
    }));
    const fallback = () => Promise.resolve(runQaChecks(state.segments, terms, { missingTags }));
    const qaChecks = workerClient?.runQaChecks
      ? await workerClient.runQaChecks({ segments: qaSegments, terms, fallback })
      : await fallback();
    state.qaChecks = qaChecks;
    state.qaFilter = "";
    renderQaResults();
    const base = fileSafeName(state.project.name || "project");
    const bytes = buildBilingualDocx(state.project, state.segments, { qaChecks });
    download(`${base}_bilingual.docx`, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const activityLogged = await logOptionalProjectActivity("export", "Bilingual DOCX exported", { segmentCount: state.segments.length, qaIssueCount: qaChecks.length, validationNoteCount: reportCount(report) }, "Bilingual DOCX export");
    const message = reportCount(report) || qaChecks.length ? "Bilingual DOCX exported with notes" : "Bilingual DOCX exported";
    setSaveStatus(appendActivityWarning(message, activityLogged), exportStatusMode(reportCount(report) || qaChecks.length ? "dirty" : "saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "Bilingual DOCX export failed", "dirty");
  }
}

async function exportLocalization() {
  try {
    if (!state.project) return;
    await flushPendingSegmentSaves();
    const documentInfo = exportDocumentForTypes(
      LOCALIZATION_EXPORT_TYPES,
      "The selected file is not exportable from Other formats.",
      "Select a document from Other formats to export."
    );
    if (!documentInfo) return;
    const documentType = projectDocumentType(documentInfo);
    const exportDocumentInfo = { ...documentInfo, type: documentType };
    const segments = state.segments.filter((segment) => segment.documentId === documentInfo.id);
    const structure = state.project.localizationStructures?.[documentInfo.id];
    const exportPlan = planDeliveryExport({ format: documentType, documentInfo: exportDocumentInfo, structure, segments });
    const report = validateExportReadiness({
      project: state.project,
      segments,
      documentInfo: exportDocumentInfo,
      format: documentType,
      terms: await projectTermsForValidation(),
      exportPlan,
      structure
    });
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, exportDocumentInfo, state.project.name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const content = XLIFF_DOCUMENT_TYPES.has(documentType)
      ? buildTargetXliff(state.project, exportPlan.segments, structure)
      : await buildLocalizationFile(documentType, exportPlan.segments, structure);
    const ext = documentType === "yml" ? "yaml" : documentType === "markdown" ? "md" : documentType;
    const type = localizationDownloadMimeType(ext, structure);
    download(`${fileSafeName(documentInfo.name)}_${state.project.targetLang}.${ext}`, content, type);
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
  if (!state.project) return;
  try {
    await flushPendingSegmentSaves();
    const { documentInfo, segments } = deliveryExportScope();
    const exportPlan = planDeliveryExport({ format: "xliff", documentInfo, segments });
    const report = validateExportReadiness({ project: state.project, segments, format: "xliff", terms: await projectTermsForValidation(), exportPlan });
    addScopedExportReportNote(report, documentInfo, "XLIFF");
    renderValidationReport(report);
    if (!canRunDeliveryExport(report)) return;
    if (!confirmIncompleteExport(exportPlan, documentInfo, state.project.name || "project")) {
      cancelIncompleteExport();
      return;
    }
    const base = scopedExportBaseName(state.project.name || "project", documentInfo);
    const exportProject = documentInfo ? { ...state.project, sourceFileName: documentInfo.name } : state.project;
    const isXliff22 = version === "2.2";
    const content = isXliff22 ? buildXliff22(exportProject, exportPlan.segments) : buildXliff(exportProject, exportPlan.segments);
    const label = isXliff22 ? "XLIFF 2.2" : "XLIFF";
    const exportedMessage = isXliff22 ? "XLIFF 2.2 exported" : "XLIFF exported";
    download(`${base}_${state.project.sourceLang}-${state.project.targetLang}.xlf`, content, xliffMimeType(version));
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
  if (!state.project) return;
  assertFileSize(file, "TMX file", MAX_RESOURCE_IMPORT_BYTES);
  await reportImportProgress("Reading TMX", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TMX", file);
  const entries = await parseTmxAsync(text, {
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
    tmName: mainTmName(),
    projectName: `${state.project.name} TMX import`
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
  markProjectsUsingResourceDirty("tm", mainTmName(), state.project.sourceLang, state.project.targetLang);
  await reportImportProgress("Refreshing TM matches", file);
  await refreshTmMatches();
  const activityLogged = await logOptionalProjectActivity("resource-import", "TMX imported", { fileName: file.name, entryCount: entries.length, tmName: mainTmName() }, "TMX import");
  setSaveStatus(appendActivityWarning(`Imported ${entries.length} TM entries`, activityLogged), exportStatusMode("saved", activityLogged));
}

async function handleTmxExport() {
  if (!state.project) return;
  try {
    const tmNames = new Set(projectTmNames());
    const entries = (await getAllByIndex("tmEntries", "languagePair", `${state.project.sourceLang}::${state.project.targetLang}`))
      .filter((entry) => tmNames.has(entry.tmName));
    download(`${fileSafeName(state.project.name)}_project-tms.tmx`, buildTmx(entries, { ...state.project, tmName: mainTmName() }), "application/xml");
    const activityLogged = await logOptionalProjectActivity("resource-export", "TMX exported", { entryCount: entries.length, tmNames: Array.from(tmNames) }, "TMX export");
    setSaveStatus(appendActivityWarning(`Exported ${entries.length} project TM entr${entries.length === 1 ? "y" : "ies"}`, activityLogged), exportStatusMode("saved", activityLogged));
  } catch (error) {
    setSaveStatus(error.message || "TMX export failed", "dirty");
  }
}

async function handleTbxImport(file) {
  if (!state.project) return;
  assertFileSize(file, "TBX file", MAX_RESOURCE_IMPORT_BYTES);
  await reportImportProgress("Reading TBX", file);
  const text = await readImportTextFile(file);
  await reportImportProgress("Parsing TBX", file);
  const terms = await parseTbxAsync(text, {
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
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
  markProjectsUsingResourceDirty("termbase", els.termBaseSelect.value || primaryTermBaseName(), state.project.sourceLang, state.project.targetLang);
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
  if (!state.project) return;
  assertFileSize(file, "Term list file", MAX_RESOURCE_IMPORT_BYTES);
  const termBaseName = els.termBaseSelect.value || primaryTermBaseName();
  await reportImportProgress("Reading term list", file);
  const terms = await parseTermListFile(file, {
    sourceLang: state.project.sourceLang,
    targetLang: state.project.targetLang,
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
  markProjectsUsingResourceDirty("termbase", termBaseName, state.project.sourceLang, state.project.targetLang);
  await reportImportProgress("Refreshing terms", file);
  await refreshProjectTerms({ rerender: true });
  await refreshTerms();
  const activityLogged = await logOptionalProjectActivity("resource-import", "Term list imported", { fileName: file.name, termCount: terms.length, termBaseName }, "Term list import");
  setSaveStatus(appendActivityWarning(`Imported ${terms.length} term${terms.length === 1 ? "" : "s"}`, activityLogged), exportStatusMode("saved", activityLogged));
}

async function handleTbxExport() {
  if (!state.project) return;
  try {
    const terms = await listTerms({
      sourceLang: state.project.sourceLang,
      targetLang: state.project.targetLang,
      termBaseNames: projectTermBaseNames()
    });
    download(`${fileSafeName(state.project.name)}_project-termbases.tbx`, buildTbx(terms, { ...state.project, termBaseName: primaryTermBaseName() }), "application/xml");
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
    if (state.segmentScrollFrame) return;
    state.segmentScrollFrame = requestAnimationFrame(() => {
      state.segmentScrollFrame = 0;
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

  els.confirmBtn.addEventListener("click", confirmCurrentSegment);
  els.saveTmBtn.addEventListener("click", saveActiveSegmentToTm);
  els.pretranslateBtn.addEventListener("click", pretranslateFromTm);
  els.copySourceBtn.addEventListener("click", copySourceToTarget);
  els.nextOpenBtn.addEventListener("click", goToNextOpenSegment);
  els.splitSegmentBtn.addEventListener("click", splitCurrentSegment);
  els.mergeNextBtn.addEventListener("click", mergeWithNextSegment);
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
  els.replaceVisibleBtn.addEventListener("click", () => replaceTargetText("visible"));
  els.replaceAllBtn.addEventListener("click", () => replaceTargetText("all"));
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
    const current = state.project?.domain || "";
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
    assert(state.activityEvents.some((event) => event.type === "replace-target"), "target replace records project activity");
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
    const savedAiSuggestionActivityJson = JSON.stringify(state.activityEvents.find((event) => event.type === "ai-test-suggestion" && event.detail?.segmentId === state.segments[segmentIndex].id) || {});
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
      const redactedAiSettingsMetadataActivity = state.activityEvents.find(
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
      const nonOpenAiProviderSettingsActivity = state.activityEvents.find(
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
      assert(state.activityEvents.some((event) => event.type === "export" && event.summary === "Project report exported"), "project report export records project activity");
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
      assert(state.activityEvents.some((event) => event.type === "export" && event.summary === "Quality Passport exported"), "quality passport export records project activity");

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
      assert(state.activityEvents.some((event) => event.type === "export" && event.summary === "Anonymized project report exported"), "anonymized project report export records project activity");
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
      const originalLabelProjectSummaries = state.projectSummaries;
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
        state.projectSummaries = state.projectSummaries.map((item) => item.id === labelProject.id ? { ...item, ...labelProject } : item);
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
        state.projectSummaries = originalLabelProjectSummaries;
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
      const packageExportActivityCountBeforeFailure = state.activityEvents.filter((event) => event.type === "export" && event.summary === "Project package exported").length;
      const packageFlushFailureText = `Paket dis aktarimi oncesi bekleyen hata ${Date.now()}`;
      updateSegmentDraft(segmentIndex, packageFlushFailureText);
      setHiddenSegmentField(state.segments[segmentIndex], FLUSH_PENDING_SAVE_FAILURE_TEST_FLAG, true);
      const packageDownloadCountBeforeFlushFailure = packageDownloads.length;
      await exportProjectPackage();
      assert(
        els.saveStatus.textContent.includes("Simulated pending save flush failure") &&
          state.saveTimers.has(state.segments[segmentIndex].id) &&
          packageDownloads.length === packageDownloadCountBeforeFlushFailure &&
          state.activityEvents.filter((event) => event.type === "export" && event.summary === "Project package exported").length === packageExportActivityCountBeforeFailure,
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
          state.activityEvents.filter((event) => event.type === "export" && event.summary === "Project package exported").length === packageExportActivityCountBeforeFailure,
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
    themeController?.initialize?.({ freshProfile: state.projects.length === 0 }),
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
