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
      const literalDocument = (source, target, version = "2.0") => {
        if (version === "1.2") return '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="sample"><body><trans-unit id="u"><source>' + source + '</source>' + (target === null ? "" : '<target state="signed-off">' + target + '</target>') + '</trans-unit></body></file></xliff>';
        return '<?xml version="1.0"?>\r\n<xliff version="' + version + '" xmlns="urn:oasis:names:tc:xliff:document:' + (version === "2.2" ? "2.2" : "2.0") + '" xmlns:q="urn:synthetic" srcLang="en" trgLang="tr"><file id="f"><unit id="u"><segment id="s" state="final" subState="q:signed"><source>' + source + '</source>' + (target === null ? "" : '<target q:keep="yes">' + target + '</target>') + '</segment></unit></file></xliff>';
      };
      for (const version of ["1.2","2.0","2.1","2.2"]) {
        const left = '&lt;h1&gt;Garden&lt;/h1&gt;\r\n\r\n&lt;p&gt;\r\n  Leaf &amp; stem.\r\n&lt;/p&gt;';
        const right = '&lt;h1&gt;Bahçe&lt;/h1&gt;\r\n\r\n&lt;p&gt;\r\n  Yaprak &#38; sap.\r\n&lt;/p&gt;';
        const input = literalDocument(left, right, version);
        const parsed = xliff.parseXliffText(input);
        check(parsed.segments.length === 5 && parsed.segments.map(s => s.structure.xliffPart.kind).join(",") === "text,blank,markup,text,markup" &&
          parsed.segments[0].text === "<h1>Garden</h1>" && parsed.segments[1].text === "" && parsed.segments[3].text.startsWith("  ") &&
          parsed.segments.every((s,i) => s.structure.xliffPart.index === i && s.structure.xliffPart.lineBreakAfter === (i < 4)),
          "XLIFF " + version + " preserves physical rows, blank lines, markup and indent");
        check(xliff.parseXliffText(input,"sample.xlf",{splitBilingualBlocks:false}).segments.length === 1 && xliff.buildTargetXliff(project,parsed.segments,parsed.structure) === input,
          "XLIFF " + version + " native projection and byte-identical untouched export");
        parsed.segments[3].target += " ✓";
        check(xliff.buildTargetXliff(project,parsed.segments.slice().reverse(),parsed.structure) === input.replace("sap.","sap. ✓"),
          "XLIFF " + version + " surgical edit preserves entity spelling, CRLF and authored state");
        parsed.segments[0].target = "Başlık";
        const reopened = xliff.parseXliffText(xliff.buildTargetXliff(project,parsed.segments,parsed.structure)).segments;
        check(reopened[0].target === "<h1>Başlık</h1>" && reopened[3].target === parsed.segments[3].target && reopened[1].target === "", "XLIFF " + version + " pasted heading keeps its authored wrapper");
      }
      const cdataInput = literalDocument("<![CDATA[Plan\n\nTerm]]>", "<![CDATA[Plan\n\nTerim]]>");
      const cdataRows = xliff.parseXliffText(cdataInput);
      cdataRows.segments[2].target = "Zemin";
      check(xliff.buildTargetXliff(project,cdataRows.segments,cdataRows.structure) === cdataInput.replace("Terim","Zemin"), "XLIFF edited CDATA remains CDATA");
      cdataRows.segments[2].target = "A]]>B";
      check(xliff.parseXliffText(xliff.buildTargetXliff(project,cdataRows.segments,cdataRows.structure)).segments[2].target === "A]]>B","XLIFF safely materializes literal CDATA terminator");
      const missing = xliff.parseXliffText(literalDocument("&lt;p&gt;\nfirst\nsecond\n&lt;/p&gt;",null));
      check(missing.segments.every(s=>!s.target) && !xml(xliff.buildTargetXliff(project,missing.segments,missing.structure)).querySelector("target"),"Untranslated XLIFF keeps missing target absent");
      missing.segments[2].target = "ikinci";
      const filled = xml(xliff.buildTargetXliff(project,missing.segments,missing.structure));
      check(filled.querySelector("target").textContent === "<p>\n\nikinci\n</p>" && !filled.querySelector("target").firstElementChild,"Partial translation restores escaped HTML skeleton without copying untranslated prose");
      const blockInput = literalDocument("&lt;p&gt;One&lt;/p&gt;&lt;p&gt;Two&lt;br/&gt;Three&lt;/p&gt;", "&lt;p&gt;Bir&lt;/p&gt;&lt;p&gt;İki&lt;br /&gt;Üç&lt;/p&gt;");
      const block = xliff.parseXliffText(blockInput);
      check(block.segments.map(s=>s.target).join("|") === "Bir|İki|Üç" && block.segments.every(s=>!s.structure.xliffPart.lineBreakAfter), "Aligned single-line HTML paragraphs and BRs preserve nonphysical boundaries");
      block.segments[1].target = "İKİ";
      check(xliff.buildTargetXliff(project,block.segments,block.structure) === blockInput.replace("İki","İKİ"), "HTML-only edit keeps target-native BR spelling");
      const different = literalDocument("One\nTwo\nThree","Bir\nÜç");
      check(xliff.parseXliffText(different).segments.length === 1, "Mismatched bilingual boundaries retained as one native unit");
      const forbiddenSplit = literalDocument("One\n\nTwo","Bir\n\nİki").replace('<unit id="u">','<unit id="u" canResegment="no">');
      const fixedUnit = xliff.parseXliffText(forbiddenSplit);
      check(fixedUnit.segments.length === 1 && xliff.buildTargetXliff(project,fixedUnit.segments,fixedUnit.structure) === forbiddenSplit,"Inherited XLIFF canResegment=no preserves the native editing unit");
      const unsupportedLayout = literalDocument("&lt;h1&gt;One&lt;/h1&gt;&lt;p&gt;Two&lt;/p&gt;","&lt;p&gt;Bir ve iki&lt;/p&gt;");
      check(xliff.parseXliffText(unsupportedLayout).segments.length === 1,"Different target HTML block layout stays in its native unit");
      const ambiguous = literalDocument("&lt;p&gt;One&lt;/p&gt;&lt;p&gt;Two&lt;/p&gt;","&lt;p&gt;Bir&lt;br&gt;İki&lt;/p&gt;");
      check(xliff.parseXliffText(ambiguous).segments.length === 1,"Equal visible span counts do not align a paragraph with a different break hierarchy");
      const conversionInput = literalDocument("&lt;h1&gt;Garden&lt;/h1&gt;\n\n&lt;p&gt;\nLeaf\n&lt;/p&gt;","&lt;h1&gt;Bahçe&lt;/h1&gt;\n\n&lt;p&gt;\nYaprak\n&lt;/p&gt;");
      const convert = xliff.parseXliffText(conversionInput);
      const editorRows = convert.segments.map((row,i)=>({...row, id:"row-"+i, source:row.text, documentId:"sample"}));
      editorRows[3].target="Çiçek";
      for (const build of [xliff.buildXliff, xliff.buildXliff22]) {
        const content = build({...project,localizationStructures:{sample:convert.structure}},editorRows);
        const reopened = xliff.parseXliffText(content).segments;
        check(reopened.length === editorRows.length && reopened.every((row,i)=>row.text === editorRows[i].source && row.target === editorRows[i].target) &&
          xml(content).querySelector("source").childElementCount === 0, "Generic XLIFF export preserves blank and markup-only rows and translated text as literal payload");
      }
      const mixed = literalDocument('One\n<ph id="c"/>\nTwo','Bir\n<ph id="c"/>\nİki');
      const nativeCodes = xliff.parseXliffText(mixed);
      check(nativeCodes.segments.length === 1 && xliff.buildTargetXliff(project,nativeCodes.segments,nativeCodes.structure) === mixed,"Native inline code identity takes precedence over literal hard lines");
      const nested = segmented.replace('mid="1">First.','mid="1">First.\nSecond line').replace('mid="1">İlk.','mid="1">İlk.\nİkinci satır');
      const nativeMarkers = xliff.parseXliffText(nested);
      check(nativeMarkers.segments.length === 3 && nativeMarkers.segments[1].structure.segmentMid === "1" && nativeMarkers.segments[2].structure.segmentMid === "2","SDLXLIFF physical lines remain inside their original mid");
      nativeMarkers.segments[1].target = "Yeni satır";
      check(xliff.buildTargetXliff(project,nativeMarkers.segments,nativeMarkers.structure) === nested.replace("İkinci satır","Yeni satır"),"SDLXLIFF subrow edits preserve adjacent markers and the unit state");
      const unaligned = segmented.replace(/<target>[\s\S]*?<\/target>/,'<target state="signed-off"><![CDATA[Birleştirilmiş çeviri.]]></target>');
      const unalignedParsed = xliff.parseXliffText(unaligned);
      check(unalignedParsed.segments.length === 1 && unalignedParsed.segments[0].text === "First. Second." &&
        unalignedParsed.segments[0].target === "Birleştirilmiş çeviri." && xliff.buildTargetXliff(project,unalignedParsed.segments,unalignedParsed.structure) === unaligned,
        "XLIFF 1.2 segmented source retains the complete unmarked target as one native row");
      unalignedParsed.segments[0].target = "Birleştirilmiş metin.";
      check(xliff.buildTargetXliff(project,unalignedParsed.segments,unalignedParsed.structure) === unaligned.replace("çeviri.","metin."),
        "XLIFF 1.2 edit preserves unaligned source mids, CDATA, target attributes and untargeted XML bytes");
      const orphan = segmented.replace(/<target>[\s\S]*?<\/target>/,'<target><mrk mtype="seg" mid="other">Bir</mrk> <mrk mtype="seg" mid="2">İki</mrk></target>');
      const orphanParsed = xliff.parseXliffText(orphan);
      check(orphanParsed.segments.length === 1 && orphanParsed.segments[0].target === "Bir İki" && xliff.buildTargetXliff(project,orphanParsed.segments,orphanParsed.structure) === orphan,
        "XLIFF 1.2 unknown and partially overlapping target mids retain every translated word");
      orphanParsed.segments[0].target = "Bir İkinci";
      check(xliff.buildTargetXliff(project,orphanParsed.segments,orphanParsed.structure) === orphan.replace(">İki<",">İkinci<"),
        "XLIFF 1.2 edits inside orphan marker text preserve its original mid and adjacent translation");
      orphanParsed.segments[0].target = "Tamamı";
      rejects(()=>xliff.buildTargetXliff(project,orphanParsed.segments,orphanParsed.structure),"Ambiguous edit across unrelated target mids refuses to assign or discard translated text");
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
