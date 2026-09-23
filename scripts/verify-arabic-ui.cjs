/* Arabic production-renderer audit. Uses a disposable profile and synthetic data. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const output = path.join(root, "test-artifacts", "arabic");
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-arabic-"));
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
const renderer = path.join(root, ".cache", "renderer", "production");
const generated = new Set([
  "index.html",
  "config/production-assets.js",
  ...JSON.parse(fs.readFileSync(path.join(renderer, "assets.json")))
]);
const allowed = new Set(require(path.join(renderer, "config", "production-assets.js")).webDistributionAssets);
const report = { states: [], errors: [], checks: [] };
let win, server;
const js = (code) => win.webContents.executeJavaScript(code, true);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition, name) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await js(condition)) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${name}`);
}
async function settle() {
  await js("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
  await pause(60);
}
async function click(selector) {
  await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await settle();
}
async function state(name, widths = [1440, 1024, 768]) {
  for (const width of widths) {
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await settle();
    const snapshot = await js(`(() => {
      const visible = el => { const r = el.getBoundingClientRect(); return el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && r.width > 0 && r.height > 0; };
      const exclude = 'script,style,code,kbd,datalist,option,[contenteditable],textarea,.source-cell,.target-cell,.project-card h3,.project-tile h3,.file-card h3,.resource-card h3,.match-card p,.term-card p,.comment-list,.ai-suggestion-list,.local-ai-provider-summary-head > span';
      const texts = [], clipped = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, el = node.parentElement, text = node.textContent.trim();
        if (!text || !el || el.closest(exclude) || !visible(el)) continue;
        if (/[A-Za-z]{2}/.test(text)) texts.push({text,element:el.id || el.className || el.tagName});
      }
      for (const el of document.querySelectorAll('button,summary,label,h1,h2,h3,[role=tab],input,select')) {
        if (!visible(el)) continue;
        if (!el.matches('input,select') && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) clipped.push({element:el.id || el.className || el.tagName,text:el.textContent.trim(),width:el.clientWidth,scroll:el.scrollWidth});
        for(const attr of ['title','aria-label','placeholder']) {
          const text=el.getAttribute(attr); if(text && /[A-Za-z]{2}/.test(text)) texts.push({text,element:(el.id||el.tagName)+':'+attr});
        }
      }
      return {lang:document.documentElement.lang,dir:document.documentElement.dir,width:innerWidth,documentWidth:document.documentElement.scrollWidth,texts,clipped};
    })()`);
    report.states.push({ name, ...snapshot });
    fs.writeFileSync(path.join(output, `${name}-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  console.log(`Arabic UI: ${name}`);
}
async function main() {
  server = http.createServer((req, res) => {
    const relative =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\//, "") || "index.html";
    if (!allowed.has(relative) && relative !== "node_modules/axe-core/axe.min.js") {
      res.writeHead(404).end();
      return;
    }
    const file = path.join(generated.has(relative) ? renderer : root, relative);
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json"
    };
    res.setHeader("Content-Type", (mime[path.extname(file)] || "application/octet-stream") + "; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.on("render-process-gone", (_event, details) => report.errors.push(details.reason));
  win.webContents.debugger.attach("1.3");
  await win.loadURL(`http://127.0.0.1:${server.address().port}`);
  await until("window.CatHan?.i18n && document.querySelector('#uiLocaleSelect option[value=ar]')", "locale manifest");
  await js(
    "document.querySelector('#uiLocaleSelect').value='ar'; document.querySelector('#uiLocaleSelect').dispatchEvent(new Event('change',{bubbles:true}))"
  );
  await until("document.documentElement.lang === 'ar'", "Arabic activation");
  await state("01-empty-projects");
  await click("#workspaceMenuSummary");
  await js("document.querySelectorAll('.workspace-menu details').forEach(d=>d.open=true)");
  await state("02-workspace-menu");
  await js("document.querySelectorAll('.workspace-menu details,.workspace-menu').forEach(d=>d.open=false)");
  await click("#newProjectBtn");
  await until("document.querySelector('#projectDialog').open", "new project");
  await js("document.querySelectorAll('#projectDialog details').forEach(d=>d.open=true)");
  await state("03-new-project");
  await click("#optionalResourceSettingsBtn");
  await state("03-resource-settings-tm");
  await click("#resourceSettingsTbTab");
  await state("03-resource-settings-tb");
  await click("#cancelResourceSettingsBtn");
  await js("document.querySelector('#projectDialog').close()");
  const fixture = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/modernization/baseline-backup.json"), "utf8")
  );
  fixture.projects[0].name = "مشروع اختبار الترجمة العربية";
  fixture.projects[0].targetLang = "ar";
  fixture.projects[0].domain = "التاريخ والتراث الثقافي";
  fixture.projects[0].creatorName = "فريق الاختبار";
  const targets = [
    "اشتهرت أنطاكية بشوارعها وأروقتها ومبانيها العامة.",
    "جذبت المدينة التجار والطلاب والمسافرين من أنحاء البحر المتوسط.",
    "",
    "يجمع هذا النص العربية مع LoopCAT 2026 والعدد 123.45."
  ];
  fixture.segments.forEach((s, i) => {
    s.target = targets[i % targets.length];
    s.comments = [];
    s.targetHistory = [];
  });
  for (const collection of ["tmEntries", "terms", "resources"])
    for (const item of fixture[collection] || []) {
      if (item.targetLang) item.targetLang = "ar";
      if (item.languagePair) item.languagePair = "en::ar";
    }
  await js(`window.CatHan.storage.importAllData(${JSON.stringify(fixture)})`);
  await win.reload();
  await until(
    "document.documentElement.lang==='ar' && document.querySelector('.project-tile button.primary')",
    "persisted locale and projects"
  );
  report.checks.push("Arabic locale survives reload");
  await state("04-projects");
  await click("#resourcesViewBtn");
  await until("document.querySelector('#tmResourceDashboard .resource-card')", "resources");
  await state("05-resources");
  await click("#projectsViewBtn");
  await click(".project-tile button.primary");
  await until("document.querySelector('.file-card button.primary')", "project files");
  await state("06-project-home");
  await click(".file-card button.primary");
  await until("document.querySelector('#segmentBody .target-editor')", "editor");
  await state("07-editor");
  for (const [id, name] of [
    ["inspectorTabQuality", "08-quality"],
    ["inspectorTabReview", "09-review"],
    ["inspectorTabAi", "10-ai"],
    ["inspectorTabInfo", "11-info"]
  ]) {
    await click("#" + id);
    await js("document.querySelectorAll('#editorInspector details').forEach(d=>d.open=true)");
    await state(name);
  }
  for (const id of ["tmPretranslateDialog", "opusCatHelpDialog", "trashDialog", "aboutDialog"]) {
    await js(`document.querySelector('#${id}').showModal()`);
    await state("dialog-" + id);
    await js(`document.querySelector('#${id}').close()`);
  }
  await click("#diagnosticsBtn");
  await settle();
  await state("dialog-diagnostics");
  await js("document.querySelector('#diagnosticsDialog').close()");
  await click("#commandPaletteBtn");
  await state("command-palette");
  await click("#closeCommandPaletteBtn");
  await click("#openProjectAiSettingsBtn");
  await until("document.querySelector('#aiProviderDialog').open", "provider settings");
  await js("document.querySelectorAll('#aiProviderDialog details').forEach(d=>d.open=true)");
  const providers = await js("Array.from(document.querySelector('#localAiProviderSelect').options,o=>o.value)");
  for (const provider of providers) {
    await js(
      `(() => { const s=document.querySelector('#localAiProviderSelect');s.value=${JSON.stringify(provider)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );
    await settle();
    await state(
      "provider-" + provider,
      ["ollama", "openai", "openai-compatible", "opus-cat", "azure-openai"].includes(provider)
        ? [1440, 1024, 768]
        : [1024]
    );
  }
  await click("#closeAiProviderDialogBtn");
  await click("#inspectorTabMatches");
  await js(
    "document.querySelector('#inspectorTabMatches').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))"
  );
  if ((await js("document.activeElement.id")) !== "inspectorTabQuality")
    throw new Error("RTL tab navigation moved in the wrong direction");
  await click("#inspectorTabMatches");
  const widthBefore = await js("Number(document.querySelector('#inspectorResizer').getAttribute('aria-valuenow'))");
  await js(
    "document.querySelector('#inspectorResizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))"
  );
  if (
    (await js("Number(document.querySelector('#inspectorResizer').getAttribute('aria-valuenow'))")) !==
    widthBefore + 16
  )
    throw new Error("RTL inspector resizing moved in the wrong direction");
  await js(
    "document.querySelector('#inspectorResizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))"
  );
  report.checks.push("RTL inspector tabs and resizing respond in the visual arrow direction");
  const direction = await js(
    `(() => { const source=document.querySelector('.source-cell'),target=document.querySelector('.target-editor');return {source:getComputedStyle(source).direction,target:getComputedStyle(target).direction,lang:target.lang};})()`
  );
  if (direction.source !== "ltr" || direction.target !== "rtl" || direction.lang !== "ar")
    throw new Error("Incorrect Arabic editor direction: " + JSON.stringify(direction));
  report.checks.push("English source and Arabic target have independent directions and Arabic language metadata");
  const value = "<b>نص عربي مُشَكَّل</b> مع LoopCAT 2026، ورقم 123.45، ووسم محمي.";
  await js(
    `(() => {const e=document.querySelectorAll('.target-editor')[1];e.focus();e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();})()`
  );
  await pause(1400);
  const stored = await js("window.CatHan.storage.get('segments','segment-2')");
  if (stored?.target !== value) throw new Error("Arabic text did not survive autosave: " + JSON.stringify(stored));
  report.checks.push(
    "Arabic, diacritics, Latin text, numbers, and protected markup survive editing and autosave byte for byte"
  );
  const taggedDirection = await js("getComputedStyle(document.querySelectorAll('.target-editor')[1]).direction");
  if (taggedDirection !== "rtl") throw new Error("Leading protected tags changed Arabic direction");
  report.checks.push("Leading protected tags do not change Arabic text direction");
  const docx = await js(`(async()=>{
    const api=window.CatHan.docx, source=window.CatHan.i18n.source;
    const bytes=await api.buildBilingualDocx({name:'تقرير عربي',sourceLang:'en',targetLang:'ar'},[{id:'ar-test',source:'English source',target:'نص عربي مع LoopCAT 2026.',status:'confirmed'}],{translate:source});
    const extracted=await api.extractDocxSegments(new File([bytes],'arabic.docx'));
    if(!extracted.structure.documentXml.includes('<w:bidi'))throw new Error('Bilingual DOCX missing Arabic paragraph direction');
    if(!extracted.segments.some(s=>s.text.includes('نص عربي مع LoopCAT 2026.')))throw new Error('Bilingual DOCX changed Arabic text');
    if(extracted.segments.some(s=>['Reviewer notes and QA','Source','Target','Status'].includes(s.text)))throw new Error('Bilingual DOCX headings are English');
    const targets=extracted.segments.map(s=>({...s,target:'ترجمة عربية مع LoopCAT 2026.'}));
    const target=await api.buildTargetDocx({targetLang:'ar',docxStructure:extracted.structure},targets);
    const result=await api.extractDocxSegments(new File([target],'target.docx'));
    if(!result.structure.documentXml.includes('w:bidi="ar"'))throw new Error('Target DOCX missing Arabic proofing language');
    if(!result.segments.every(s=>s.text.includes('ترجمة عربية مع LoopCAT 2026.')))throw new Error('Target DOCX text changed');
    return {bilingual:Array.from(bytes),target:Array.from(target)};
  })()`);
  fs.writeFileSync(path.join(output, "bilingual-arabic.docx"), Buffer.from(docx.bilingual));
  fs.writeFileSync(path.join(output, "target-arabic.docx"), Buffer.from(docx.target));
  report.checks.push(
    "Bilingual and target DOCX exports retain Arabic text, localized headings, RTL paragraphs, and Arabic proofing metadata"
  );
  await state("12-arabic-edited");
  win.webContents.setZoomFactor(2);
  await state("13-editor-200-percent", [1440]);
  await click("#inspectorCloseBtn");
  if (await js("document.querySelector('#editorInspector').checkVisibility()"))
    throw new Error("Inspector drawer cannot be dismissed at 200% zoom");
  await state("13-editor-200-percent-closed", [1440]);
  await js("document.querySelector('.target-editor').scrollIntoView({block:'center'})");
  const targetInView = await js(
    "(()=>{const r=document.querySelector('.target-editor').getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.height>0})()"
  );
  if (!targetInView) throw new Error("Arabic target is unreachable at 200% zoom");
  await state("13-editor-200-percent-target", [1440]);
  await click("#inspectorToggleBtn");
  report.checks.push("Inspector drawer can be dismissed and reopened at 200% zoom");
  win.webContents.setZoomFactor(1);
  await js(
    "document.querySelector('#themeSelect').value='dark';document.querySelector('#themeSelect').dispatchEvent(new Event('change',{bubbles:true}))"
  );
  await state("14-editor-dark");
  await js(
    "document.querySelector('#themeSelect').value='light';document.querySelector('#themeSelect').dispatchEvent(new Event('change',{bubbles:true}))"
  );
  await pause(500);
  await settle();
  await js(require("axe-core").source);
  const accessibility = await js(
    "axe.run(document,{resultTypes:['violations'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})"
  );
  report.accessibility = accessibility.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target)
  }));
  for (const violation of report.accessibility)
    if (["serious", "critical"].includes(violation.impact))
      report.errors.push("Accessibility: " + JSON.stringify(violation));
  report.checks.push("Arabic editor audited with axe WCAG 2.2 AA rules");
  await js(
    "document.querySelector('#uiLocaleSelect').value='en-US';document.querySelector('#uiLocaleSelect').dispatchEvent(new Event('change',{bubbles:true}))"
  );
  await until("document.documentElement.dir==='ltr'", "return to English");
  await js(
    "document.querySelector('#uiLocaleSelect').value='ar';document.querySelector('#uiLocaleSelect').dispatchEvent(new Event('change',{bubbles:true}))"
  );
  await until("document.documentElement.dir==='rtl'", "return to Arabic");
  report.checks.push("Live language switching restores LTR and RTL layouts");
  const guideUrl = await js("document.querySelector('.workspace-guide-link').href");
  if (!guideUrl.endsWith("/ar.html")) throw new Error("Arabic guide link not selected");
  await win.loadURL(guideUrl);
  await state("15-arabic-guide");
  report.checks.push("Arabic Beginner Guide is bundled, selected by the locale, and renders in RTL");
  for (const s of report.states) {
    if (s.lang !== "ar" || s.dir !== "rtl") report.errors.push(`${s.name}: Arabic locale not active`);
    if (s.documentWidth > s.width + 1) report.errors.push(`${s.name} at ${s.width}: page overflow ${s.documentWidth}`);
    for (const item of s.clipped) report.errors.push(`${s.name} at ${s.width}: clipped ${item.element}: ${item.text}`);
    for (const item of s.texts) {
      // Technical names, protocol syntax, fixture data and shortcuts are intentional.
      const residual = item.text
        .replace(/https?:\/\/\S+|(?:GET|POST)\s+\/\S+|antioch-review\.html|0\.0\.4-dev\.\d+|gpt-[\w.-]+/g, "")
        .replace(
          /LoopCAT|OpenAI|Anthropic(?: Claude)?|DeepSeek|Google Gemini|Cohere Command|Mistral AI|xAI Grok|Perplexity Sonar|Sonar|Groq|Together AI|OpenRouter|Hugging Face(?: Inference Providers)?|DeepInfra|Fireworks AI|Ollama(?: Cloud)?|OPUS-CAT(?: MT)?|OPUS-MT|LM Studio|Azure|Node\.js|PowerShell|Codex|Gokhan Dogru|LinkedIn: gokhan-dogru-localization|Antioch TM|translategemma|default|API|CORS|URL|JSON|HTML|TMX|MiB|MB|GB|Ctrl\/Cmd\+Enter|Alt\+Enter|\b(?:en|ar|ca|de|es|fr|tr)\b/g,
          ""
        );
      if (/[A-Za-z]{2}/.test(residual)) report.errors.push(`${s.name}: untranslated ${item.element}: ${item.text}`);
    }
  }
}
app
  .whenReady()
  .then(main)
  .catch((error) => {
    report.errors.push(error.stack);
    console.error(error);
  })
  .finally(async () => {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(
      `Arabic audit: ${report.states.length} captures, ${report.checks.length} functional checks, ${report.errors.length} errors. Report: ${output}`
    );
    win?.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    app.exit(report.errors.length ? 1 : 0);
  });
