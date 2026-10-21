/* Production UI regression: isolated profile, actual imports, workers and IDB. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const profile = path.join(root, "tmp", `statistics-profile-${process.pid}`);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
let server, win;
const evaluate = (source) => win.webContents.executeJavaScript(source, true);
async function wait(expression, label, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
}
async function clickText(selector, text) {
  return evaluate(
    `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button unavailable: '+${JSON.stringify(text)});b.click();})()`
  );
}
async function capture(name) {
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  fs.mkdirSync(path.join(root, "output/statistics-verification"), { recursive: true });
  fs.writeFileSync(
    path.join(root, `output/statistics-verification/${name}.png`),
    (await win.webContents.capturePage()).toPNG()
  );
}
async function checkAccessibility(label) {
  await evaluate(`(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.allSettled(document.querySelector('#statisticsDialog').getAnimations({subtree:true}).filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished));
  })()`);
  const axe = await evaluate(
    "axe.run(document.querySelector('#statisticsDialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
  );
  const serious = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  if (serious.length)
    throw Error(
      label +
        ": " +
        JSON.stringify(
          serious.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, failure: n.failureSummary }))
          }))
        )
    );
}
async function checkIncompleteReport() {
  return evaluate(`(async()=>{
    const {createStatisticsController}=await import('/src/features/statistics/statistics-controller.js');
    const doc=document.implementation.createHTMLDocument('Incomplete statistics fixture');
    const project={id:'incomplete-project',name:'Incomplete fixture',sourceLang:'en',targetLang:'tr',documents:[{id:'incomplete-file',name:'fixture.txt'}],resourceLinks:[]};
    const segments=[{id:'incomplete-segment',projectId:project.id,documentId:'incomplete-file',index:0,source:'Known words',target:''}];
    const host=()=>{const element=doc.createElement('div');doc.body.append(element);return element;};
    const controller=createStatisticsController({
      document:doc,
      hosts:{projectStatistics:host(),statisticsMenu:host(),selectionHost:host(),selectAll:doc.createElement('input')},
      session:{getProject:()=>project,getSegments:()=>segments,subscribe:()=>{}},
      selection:{ids:()=>[],has:()=>false,subscribe:()=>{},sync:()=>{}},
      translate:(text)=>text,
      getDocumentId:()=>null,
      getVisibleSegments:()=>segments,
      refreshRows:()=>{},
      flush:async()=>{},
      listResources:async()=>[],
      listEntries:async()=>[],
      analyze:async(request)=>{
        const report=await globalThis.LoopCATStatistics.analyze(request);
        report.complete=false;
        report.countingComplete=false;
        report.unresolvedCountingSegments=1;
        report.limitations=['One segment has unresolved markup.'];
        return report;
      },
      showDialog:(dialog)=>dialog.setAttribute('open',''),
      save:async()=>{throw Error('Incomplete report must not save');},
      download:()=>{},
      removeSnapshot:async()=>{}
    });
    try{
      await controller.open();
      const dialog=doc.querySelector('#statisticsDialog');
      const save=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save snapshot');
      const exportButton=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export');
      if(!save.disabled)throw Error('Incomplete report leaves snapshot saving enabled');
      if(exportButton.disabled)throw Error('Incomplete report cannot be exported for review');
      const rate=dialog.querySelector('#statisticsRate');
      rate.value='0.1';rate.dispatchEvent(new Event('input',{bubbles:true}));
      if(!/provisional/i.test(dialog.textContent)||!/Known source words/.test(dialog.textContent))throw Error('Incomplete report lacks known-only count and provisional estimate labels');
      if(!save.disabled)throw Error('Repricing enables saving an incomplete report');
      return {saveDisabled:true,partialExport:true,provisionalEstimate:true};
    }finally{
      doc.querySelector('#statisticsDialog')?.dispatchEvent(new Event('close'));
    }
  })()`);
}
app.on("window-all-closed", () => {});
app
  .whenReady()
  .then(async () => {
    try {
      const production = path.join(root, ".cache/renderer/production");
      server = http.createServer((req, res) => {
        const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
        const resolved = path.resolve(root, relative);
        if (!resolved.startsWith(root + path.sep)) {
          res.writeHead(403).end();
          return;
        }
        const generated = path.join(production, relative);
        const file = fs.existsSync(generated) ? generated : resolved;
        try {
          res.setHeader(
            "Content-Type",
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".svg": "image/svg+xml",
              ".png": "image/png"
            }[path.extname(file)] || "application/octet-stream"
          );
          res.end(fs.readFileSync(file));
        } catch {
          res.writeHead(404).end();
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      win = new BrowserWindow({
        show: false,
        width: 1360,
        height: 960,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
      });
      const errors = [];
      win.webContents.on("console-message", (_event, _level, message) => {
        if (/Uncaught|startup failed/i.test(message)) errors.push(message);
      });
      await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
      await wait("!!document.querySelector('#statisticsBtn')", "application initialized");
      await evaluate("document.querySelector('#newProjectBtn').click()");
      await wait("document.querySelector('#projectDialog').open", "new project");
      await evaluate(
        "document.querySelector('#projectNameInput').value='Statistics verification';document.querySelector('#sourceLangInput').value='en';document.querySelector('#targetLangInput').value='tr';document.querySelector('#projectForm').requestSubmit()"
      );
      await wait(
        "!document.querySelector('#projectDialog').open && !document.querySelector('#projectHomeView').classList.contains('hidden')",
        "project created"
      );
      await evaluate(
        `(()=>{const transfer=new DataTransfer();for(let i=0;i<20;i++){const ext=i%3===0?'html':i%3===1?'json':'txt';const text=ext==='html'?'<p>This is a sentence.</p>':ext==='json'?'{"message":"This is a sentence."}':'This is a sentence.';transfer.items.add(new File([text],'sample-'+i+'.'+ext,{type:'text/plain'}));}const input=document.querySelector('#projectFileImportInput');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
      );
      await wait("document.querySelector('#batchImportDialog').open", "batch review");
      await wait("!document.querySelector('#batchImportDialog button').disabled", "content review");
      await evaluate(
        "document.querySelectorAll('#batchImportDialog input[type=checkbox]:not(:disabled)').forEach(input=>{input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));})"
      );
      await clickText("#batchImportDialog button", "Import ready files");
      await wait(
        "document.querySelector('#batchImportDialog [role=status]').textContent.includes('20 imported')",
        "20 mixed files",
        60000
      );
      await clickText("#batchImportDialog button", "View statistics");
      await wait(
        "document.querySelector('#statisticsDialog').open && document.querySelector('#statisticsDialog [role=status]').textContent.includes('Complete')",
        "statistics complete",
        60000
      );
      const simple = await evaluate("document.querySelector('#statisticsDialog').innerText");
      if (!simple.includes("80") || !simple.includes("76"))
        throw Error("Expected 80 words and 76 repeated words: " + simple);
      if (/Mozilla\/|loopcat-words\/|loopcat-match\//.test(simple))
        throw Error("Technical diagnostic metadata leaked into the default report");
      if (
        await evaluate(
          "!![...document.querySelectorAll('#statisticsDialog button')].find(b=>b.textContent.trim()==='Advanced')"
        )
      )
        throw Error("Statistics still uses the old Advanced/Simple view switch");
      await evaluate(require("axe-core").source);
      await checkAccessibility("Default report");
      await capture("default");
      await clickText("#statisticsDialog button", "Save snapshot");
      await wait(
        "document.querySelector('#statisticsDialog [role=status]').textContent.includes('Snapshot saved')",
        "snapshot saved"
      );
      await evaluate(`(()=>{
        window.statisticsAnalysisRequests=0;
        const post=Worker.prototype.postMessage;
        Worker.prototype.postMessage=function(message,...rest){
          if(message?.type==='statistics')window.statisticsAnalysisRequests++;
          return post.call(this,message,...rest);
        };
        const weight=document.querySelector('#statisticsDialog .statistics-weight-input[data-band="repetition"]');
        if(!weight)throw Error('Repetition payable weight is unavailable');
        weight.value='10';weight.dispatchEvent(new Event('input',{bubbles:true}));
        const rate=document.querySelector('#statisticsRate');
        rate.value='0.1';rate.dispatchEvent(new Event('input',{bubbles:true}));
      })()`);
      await wait(
        "document.querySelector('#statisticsDialog').innerText.includes('11.6') && document.querySelector('#statisticsDialog').innerText.includes('1.16')",
        "live budget estimate"
      );
      if (await evaluate("window.statisticsAnalysisRequests!==0"))
        throw Error("Changing rate or payable weight reran TM analysis");
      const baseline = await evaluate("window.CatHan.storage.getAll('projects').then(p=>p[0].statisticsSnapshots[0])");
      if (baseline.weightedWords !== 80 || baseline.options.rate || baseline.options.weights.repetition !== 100)
        throw Error("Repricing changed the saved baseline: " + JSON.stringify(baseline.options));
      await checkAccessibility("Budget report");
      await capture("budget-light");
      await evaluate(
        "document.querySelector('#themeSelect').value='dark';document.querySelector('#themeSelect').dispatchEvent(new Event('change',{bubbles:true}))"
      );
      await wait("document.documentElement.dataset.theme==='dark'", "dark theme");
      await checkAccessibility("Dark budget report");
      await capture("budget-dark");
      await evaluate(
        "document.querySelector('#themeSelect').value='light';document.querySelector('#themeSelect').dispatchEvent(new Event('change',{bubbles:true}))"
      );
      await wait("document.documentElement.dataset.theme==='light'", "light theme");
      await clickText("#statisticsDialog button", "Save snapshot");
      await wait(
        "window.CatHan.storage.getAll('projects').then(p=>p[0].statisticsSnapshots.length===2)",
        "repriced snapshot saved separately"
      );
      const stored = await evaluate(
        "window.CatHan.storage.getAll('projects').then(projects=>({files:projects[0].documents.length,reports:projects[0].statisticsSnapshots.length,receipts:projects[0].importReceipts.length,total:projects[0].statisticsSnapshots[0].totals.words,weighted:projects[0].statisticsSnapshots[1].weightedWords,rate:projects[0].statisticsSnapshots[1].options.rate,distinctIds:new Set(projects[0].statisticsSnapshots.map(s=>s.id)).size===2}))"
      );
      if (
        stored.files !== 20 ||
        stored.receipts !== 20 ||
        stored.reports !== 2 ||
        stored.total !== 80 ||
        Math.abs(stored.weighted - 11.6) > 1e-9 ||
        stored.rate !== 0.1 ||
        !stored.distinctIds
      )
        throw Error(JSON.stringify(stored));
      const roundtrip = await evaluate(`(async()=>{
        const data=await window.CatHan.storage.exportAllData();
        const report=window.CatHan.validation.validateBackupFile(data);
        if(!report.ok)throw Error(JSON.stringify(report.errors));
        const encoded=JSON.stringify(data);
        const prepared=await window.CatHan.storage.importAllData(JSON.parse(encoded),{prepareOnly:true});
        if(prepared.projects[0].statisticsSnapshots[0].totals.words!==80 || prepared.projects[0].importReceipts.length!==20 || prepared.projects[0].statisticsSnapshots.length!==2 || Math.abs(prepared.projects[0].statisticsSnapshots[1].weightedWords-11.6)>1e-9)throw Error('Backup lost analysis metadata');
        const invalid=JSON.parse(encoded);invalid.projects[0].statisticsSnapshots[0].totals.words=-1;
        if(window.CatHan.validation.validateBackupFile(invalid).ok)throw Error('Invalid snapshot accepted');
        return {bytes:encoded.length,receipts:prepared.projects[0].importReceipts.length};
      })()`);
      await evaluate(`(()=>{
        window.statisticsExports=[];
        const blobs=new Map();
        const create=URL.createObjectURL;
        URL.createObjectURL=function(blob){
          const url=create.call(this,blob);blobs.set(url,blob);return url;
        };
        const click=HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click=function(){
          if(this.download.startsWith('LoopCAT-Statistics-')){
            const filename=this.download;
            const blob=blobs.get(this.href);
            if(!blob)throw Error('Export blob was not captured');
            blob.text().then(content=>window.statisticsExports.push({filename,content}));
            return;
          }
          return click.call(this);
        };
      })()`);
      for (const format of ["csv", "html", "json"]) {
        await evaluate(`document.querySelector('#statisticsExportFormat').value=${JSON.stringify(format)}`);
        await clickText("#statisticsDialog button", "Export");
        await wait(`window.statisticsExports.some(e=>e.filename.endsWith('.${format}'))`, `${format} report export`);
      }
      const exports = await evaluate(`(()=>{
        const report=JSON.parse(window.statisticsExports.find(e=>e.filename.endsWith('.json')).content);
        if(report.totals.words!==80 || Math.abs(report.weightedWords-11.6)>1e-9 || report.options.rate!==0.1 || report.options.weights.repetition!==10)throw Error('Export differs from the visible quote');
        for(const ext of ['csv','html']){
          const output=window.statisticsExports.find(e=>e.filename.endsWith('.'+ext));
          if(!output.content.includes('Source words'))throw Error('Missing source counts in '+ext+' export');
        }
        return window.statisticsExports.map(e=>({filename:e.filename,bytes:e.content.length}));
      })()`);
      await evaluate(`(()=>{
        const scope=[...document.querySelectorAll('#statisticsDialog select')].find(s=>s.querySelector('option[value="project"]'));
        if(!scope)throw Error('Report scope is unavailable');
        const rate=document.querySelector('#statisticsRate');
        rate.value='-1';rate.dispatchEvent(new Event('input',{bubbles:true}));
        scope.value='files';scope.dispatchEvent(new Event('change',{bubbles:true}));
        const save=[...document.querySelectorAll('#statisticsDialog button')].find(b=>b.textContent.trim()==='Save snapshot');
        if(!save.disabled)throw Error('Scope change left snapshot saving enabled');
        const status=document.querySelector('#statisticsDialog [role=status]').textContent;
        if(!/changed|out of date|calculate again|recalculate/i.test(status))throw Error('Scope change has no stale report warning: '+status);
        if(rate.disabled)throw Error('Scope change traps the invalid rate in a disabled input');
        rate.value='0.1';rate.dispatchEvent(new Event('input',{bubbles:true}));
        scope.value='project';scope.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      await clickText("#statisticsDialog button", "Calculate");
      await wait(
        "document.querySelector('#statisticsDialog [role=status]').textContent.includes('Complete')",
        "recalculated scope"
      );
      await evaluate(`(()=>{
        const sections=[...document.querySelectorAll('#statisticsDialog details.statistics-disclosure')];
        const files=sections.find(s=>s.querySelector('summary')?.textContent.includes('File breakdown'));
        if(!files)throw Error('File breakdown disclosure is unavailable');
        files.open=true;
        const settings=sections.find(s=>s.querySelector('summary')?.textContent.includes('Analysis settings'));
        if(!settings)throw Error('Analysis settings disclosure is unavailable');
        settings.open=true;
      })()`);
      await checkAccessibility("Expanded details");
      await capture("details");
      await evaluate(`(()=>{
        const sections=[...document.querySelectorAll('#statisticsDialog details.statistics-disclosure')];
        const files=sections.find(s=>s.querySelector('summary')?.textContent.includes('File breakdown'));
        const first=files.querySelector('details');
        if(first)first.open=true;
        files.scrollIntoView({block:'start'});
      })()`);
      await capture("file-breakdown");
      await evaluate(`(()=>{
        const sections=[...document.querySelectorAll('#statisticsDialog details.statistics-disclosure')];
        const settings=sections.find(s=>s.querySelector('summary')?.textContent.includes('Analysis settings'));
        const saved=sections.find(s=>s.querySelector('summary')?.textContent.includes('Saved snapshots'));
        if(saved)saved.open=true;
        settings.scrollIntoView({block:'start'});
      })()`);
      await capture("analysis-settings");
      await evaluate(
        "(()=>{const body=document.querySelector('#statisticsDialog .statistics-body');body.scrollTop=body.scrollHeight})()"
      );
      await checkAccessibility("Saved snapshots");
      await capture("saved-snapshots");
      await evaluate(
        "document.querySelectorAll('#statisticsDialog details.statistics-disclosure').forEach(d=>d.open=false);document.querySelector('#statisticsDialog .statistics-body').scrollTop=0"
      );
      await clickText("#statisticsDialog button", "Close");
      await evaluate(
        `(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['{bad'],'broken.json'));transfer.items.add(new File(['Additional unique words'],'after-error.txt'));const input=document.querySelector('#projectFileImportInput');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
      );
      await wait(
        "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
        "second batch review"
      );
      await clickText("#batchImportDialog button", "Import ready files");
      await wait(
        "document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 imported') && document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 failed')",
        "corrupt file isolation"
      );
      await clickText("#batchImportDialog button", "View statistics");
      await wait(
        "document.querySelector('#statisticsDialog [role=status]').textContent.includes('Complete')",
        "updated statistics"
      );
      const unchanged = await evaluate(
        "window.CatHan.storage.getAll('projects').then(p=>p[0].statisticsSnapshots[0].totals.words)"
      );
      if (unchanged !== 80) throw Error("Saved baseline changed after import");
      win.setSize(520, 850);
      await evaluate("document.documentElement.dir='rtl'");
      await evaluate(
        "document.querySelectorAll('#statisticsDialog details.statistics-disclosure').forEach(d=>d.open=false)"
      );
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const overflow = await evaluate(
        "(()=>{const d=document.querySelector('#statisticsDialog');return d.getBoundingClientRect().width>innerWidth+1 || d.scrollWidth>d.clientWidth+1})()"
      );
      if (overflow) throw Error("Narrow Statistics dialog overflows viewport");
      await checkAccessibility("Narrow RTL");
      await capture("narrow-rtl");
      const incomplete = await checkIncompleteReport();
      if (errors.length) throw Error(errors.join("\n"));
      console.log(
        "Statistics workflow passed:",
        JSON.stringify({
          stored,
          roundtrip,
          exports,
          incomplete,
          corruptFileIsolation: true,
          immutableBaseline: true,
          livePricing: true,
          staleScope: true,
          darkTheme: true,
          narrowRtl: true
        })
      );
      app.exit(0);
    } catch (error) {
      console.error(error.stack);
      if (win) {
        console.error(await evaluate("document.body.innerText.slice(-6500)").catch(() => ""));
        fs.mkdirSync(path.join(root, "output/statistics-verification"), { recursive: true });
        fs.writeFileSync(
          path.join(root, "output/statistics-verification/failure.png"),
          (await win.webContents.capturePage()).toPNG()
        );
      }
      app.exit(1);
    }
  })
  .finally(() => server?.close());
