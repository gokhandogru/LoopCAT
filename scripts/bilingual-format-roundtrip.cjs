/* Isolated real-DOM interchange checks; does not open or modify user projects. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [...(process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), __filename], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `bilingual-format-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("let sequence = 0; window.CatHan = {storage: {makeId: (prefix) => prefix + (++sequence)}}; void 0;");
    for (const file of ["xliff.js", "tmx.js", "tbx.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, file), "utf8"));
    const checks = await win.webContents.executeJavaScript(`(${async function () {
      const { xliff, tmx, tbx } = window.CatHan;
      const messages = [];
      const check = (condition, label) => { if (!condition) throw new Error(label); messages.push(label); };
      const rejects = (fn, label) => { let rejected = false; try { fn(); } catch { rejected = true; } check(rejected, label); };
      const xml = (value) => new DOMParser().parseFromString(value, "application/xml");
      const project = { name: "Interchange QA", sourceLang: "en", targetLang: "tr" };
      const fixture = `<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="urn:test:sdl" version="1.2"><file original="source.docx" source-language="en" target-language="tr"><body>
        <trans-unit id="locked" translate="no"><source>Locked</source><target>Protected target</target></trans-unit>
        <trans-unit id="a" xml:space="preserve"><source>  Hello <g id="77" ctype="bold" sdl:style="strong">world</g><x id="9" ctype="lb"/>!  </source><note>Keep me</note></trans-unit>
        <trans-unit id="b"><source><bpt id="10" rid="r1">&lt;b class="native"&gt;</bpt>Second<ept id="11" rid="r1">&lt;/b&gt;</ept></source></trans-unit>
      </body></file></xliff>`;
      const parsed = xliff.parseXliffText(fixture);
      check(parsed.segments.length === 2 && parsed.segments[0].text.startsWith("  Hello") && parsed.segments[0].text.endsWith("  "), "XLIFF 1.2 whitespace and translate=no");
      parsed.segments.forEach((segment) => { segment.target = segment.text.replace("Hello", "Merhaba").replace("world", "dünya").replace("Second", "İkinci"); segment.status = "confirmed"; });
      const target = xliff.buildTargetXliff(project, parsed.segments, JSON.parse(JSON.stringify(parsed.structure)));
      const out = xml(target);
      check(!out.querySelector("parsererror"), "XLIFF 1.2 output is well-formed");
      const a = out.querySelector('trans-unit[id="a"] target');
      check(a.querySelector("g").getAttribute("id") === "77" && a.querySelector("g").getAttributeNS("urn:test:sdl", "style") === "strong" && a.querySelector("x").getAttribute("id") === "9", "XLIFF 1.2 inline IDs and extension attributes");
      check(out.querySelector('trans-unit[id="b"] target bpt').textContent === '<b class="native">' && out.querySelector('trans-unit[id="b"] target ept').getAttribute("rid") === "r1", "XLIFF 1.2 bpt/ept native codes and rid");
      check(out.querySelector('trans-unit[id="locked"] target').textContent === "Protected target" && out.querySelector("note").textContent === "Keep me", "XLIFF 1.2 locked content and notes preserved");
      check(xliff.parseXliffText(target).segments.every((segment, index) => segment.target === parsed.segments[index].target), "XLIFF 1.2 translated content round trip");
      const repeated = xliff.parseXliffText('<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2"><file><body><trans-unit id="r"><source><g id="one" ctype="bold">First</g> <g id="two" ctype="bold">Second</g></source></trans-unit></body></file></xliff>');
      repeated.segments[0].target = '<b id="two">İkinci</b> <b id="one">İlk</b>';
      const repeatedOut = xml(xliff.buildTargetXliff(project, repeated.segments, repeated.structure));
      check(Array.from(repeatedOut.querySelectorAll("target g")).map((node) => node.getAttribute("id")).join(",") === "two,one", "XLIFF 1.2 repeated semantic code identity survives reordering");

      const segmented = `<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2"><file original="a.docx" source-language="en" target-language="tr"><body><trans-unit id="u"><source>First. Second.</source><seg-source><mrk mtype="seg" mid="1">First.</mrk> <mrk mtype="seg" mid="2">Second.</mrk></seg-source><target><mrk mtype="seg" mid="1">İlk.</mrk> <mrk mtype="seg" mid="2"/></target></trans-unit></body></file></xliff>`;
      const sdl = xliff.parseXliffText(segmented, "segmented.sdlxliff");
      check(sdl.segments.length === 2 && sdl.segments[0].target === "İlk." && sdl.segments[1].structure.segmentMid === "2", "SDLXLIFF segmented import");
      sdl.segments[1].target = "İkinci.";
      const sdlOut = xliff.buildTargetXliff(project, sdl.segments, sdl.structure);
      check(xml(sdlOut).querySelectorAll("target mrk").length === 2 && xliff.parseXliffText(sdlOut).segments[1].target === "İkinci.", "SDLXLIFF segmentation markers round trip");
      const emptySdl = xliff.parseXliffText(segmented.replace(/<target>[\s\S]*?<\/target>/, ""));
      emptySdl.segments.forEach((segment) => { segment.target = segment.text.replace("First", "İlk").replace("Second", "İkinci"); });
      check(xliff.parseXliffText(xliff.buildTargetXliff(project, emptySdl.segments, emptySdl.structure)).segments[1].target === "İkinci.", "SDLXLIFF missing target skeleton reconstruction");

      for (const version of ["2.0", "2.1", "2.2"]) {
        const ns = version === "2.2" ? "2.2" : "2.0";
        const input = `<xliff xmlns="urn:oasis:names:tc:xliff:document:${ns}" version="${version}" srcLang="en" trgLang="tr"><file id="f"><unit id="u"><notes><note>Context</note></notes><originalData><data id="d">&lt;br/&gt;</data></originalData><segment id="s"><source>  Text<ph id="p" dataRef="d"/>  </source></segment></unit></file></xliff>`;
        const p = xliff.parseXliffText(input); p.segments[0].target = p.segments[0].text.replace("Text", "Metin");
        const output = xliff.buildTargetXliff(project, p.segments, p.structure);
        check(xliff.parseXliffText(output).segments[0].target === p.segments[0].target && xml(output).querySelector("target ph").getAttribute("dataRef") === "d", `XLIFF ${version} inline/reference round trip`);
      }
      const generated = xliff.buildXliff22(project, [{ source: "Open <b>file</b><br/>", target: "<b>Dosyayı</b> aç<br/>", status: "confirmed" }]);
      check(xliff.parseXliffText(generated).segments.length === 1, "Generated XLIFF 2.2 reimport");
      rejects(() => xliff.parseXliffText("<xliff><file>"), "Malformed XLIFF rejected");

      const options = { sourceLang: "en", targetLang: "tr", tmName: "Review memory", termBaseName: "Review terms" };
      const tmxInput = `<tmx version="1.4"><body><!-- <tu><tuv xml:lang="en"><seg>phantom</seg></tuv><tuv xml:lang="tr"><seg>phantom</seg></tuv></tu> --><tu><tuv xml:lang="tr"><seg><![CDATA[<b>Çeviri &amp;</b>]]></seg></tuv><tuv xml:lang="en"><seg><![CDATA[<b>Source &amp;</b>]]></seg></tuv><tuv xml:lang="de"><seg>Quelle</seg></tuv></tu><tu><tuv xml:lang="en"><seg>Wrong pair</seg></tuv><tuv xml:lang="fr"><seg>Mauvaise paire</seg></tuv></tu></body></tmx>`;
      const memories = tmx.parseTmx(tmxInput, options);
      check(memories.length === 1 && memories[0].source === "<b>Source &amp;</b>" && memories[0].target === "<b>Çeviri &amp;</b>", "TMX CDATA, comments and explicit language pairing");
      check((await tmx.parseTmxAsync(tmxInput, options)).length === 1 && tmx.parseTmxDom(tmxInput, options)[0].target === memories[0].target, "TMX synchronous/asynchronous/DOM parity");
      const memoryXml = tmx.buildTmx(memories, options);
      check(/^\d{8}T\d{6}Z$/.test(xml(memoryXml).querySelector("tu").getAttribute("creationdate")), "TMX standard timestamp format");
      check(tmx.parseTmx(memoryXml, options)[0].target === memories[0].target, "TMX resource Unicode and literal markup round trip");
      rejects(() => tmx.parseTmx("<tmx><body><tu></body></tmx>", options), "Malformed TMX rejected before partial import");

      for (const modern of [false, true]) {
        const root = modern ? 'tbx xmlns="urn:iso:std:iso:30042:ed-2" type="TBX-Basic" style="dca"' : 'martif type="TBX"';
        const ce = modern ? "conceptEntry" : "termEntry", ls = modern ? "langSec" : "langSet", ts = modern ? "termSec" : "tig";
        const input = `<${root}><text><body><${ce} id="concept"><${ls} xml:lang="en"><${ts} id="s"><term><![CDATA[<source> &amp;]]></term></${ts}></${ls}><${ls} xml:lang="tr"><${ts} id="t1"><term>Terim</term><termNote type="administrativeStatus">preferredTerm-admn-sts</termNote></${ts}><${ts} id="t2"><term>Eski terim</term><termNote type="administrativeStatus">deprecatedTerm-admn-sts</termNote></${ts}></${ls}></${ce}></body></text></${modern ? "tbx" : "martif"}>`;
        const terms = tbx.parseTbx(input, options);
        check(terms.length === 2 && terms[0].sourceTerm === "<source> &amp;" && terms[1].isForbidden && terms[1].conceptId === "concept", `TBX ${modern ? "3" : "2"} synonyms, CDATA, concept IDs and term status`);
        check((await tbx.parseTbxAsync(input, options)).length === 2 && tbx.parseTbxDom(input, options).length === 2, `TBX ${modern ? "3" : "2"} parser parity`);
      }
      const termsXml = tbx.buildTbx([{ id: "t", sourceTerm: "cat", targetTerm: "kedi", notes: "Translator note", usageExample: "A cat.", definition: "An animal" }], options);
      const [term] = tbx.parseTbx(termsXml, options);
      check(xml(termsXml).documentElement.localName === "martif" && term.notes === "Translator note" && term.usageExample === "A cat." && term.definition === "An animal", "TBX export envelope and independent notes/example metadata");
      rejects(() => tbx.parseTbx("<tbx><text><body></text></tbx>", options), "Malformed TBX rejected before partial import");
      check(tbx.parseTbx('<tbx><text><body><termEntry><langSet xml:lang="de"><tig><term>Katze</term></tig></langSet><langSet xml:lang="fr"><tig><term>Chat</term></tig></langSet></termEntry></body></text></tbx>', options).length === 0, "TBX unrelated language pairs not relabelled");
      return messages;
    }.toString()})()`);
    checks.forEach((label) => console.log(`PASS ${label}`));
    console.log(`Bilingual format verification passed: ${checks.length} checks.`);
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error); win.destroy(); app.exit(1);
  }
});
