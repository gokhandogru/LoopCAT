/* Real Chromium XML parsing and reconstruction, isolated from workspace data. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const child = spawnSync(require("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  if (child.error) console.error(child.error);
  process.exit(child.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `software-formats-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, "protected-tags.js"), "utf8"));
    await win.webContents.executeJavaScript("window.CatHan.docx = window.CatHan.protectedTags; void 0;");
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, "localization.js"), "utf8"));
    const run = async () => {
      const api = window.CatHan.localization;
      const outcomes = [];
      const check = (value, message) => { if (!value) throw new Error(message); };
      const xml = (text) => {
        const doc = new DOMParser().parseFromString(text, "application/xml");
        check(!doc.querySelector("parsererror"), "Export must be well-formed XML");
        return doc;
      };
      const parse = (extension, source) => api.parseLocalizationFile(new File([source], `messages.${extension}`));
      const copy = (value) => JSON.parse(JSON.stringify(value));
      const test = async (name, fn) => {
        try { await fn(); outcomes.push({ name, passed: true }); }
        catch (error) { outcomes.push({ name, passed: false, error: String(error.message || error) }); }
      };
      await test("RESX strings only; binary/typed values, metadata, whitespace and literal markup retained", async () => {
        const source = '<root><resheader name="version"><value>2.0</value></resheader><metadata name="position"><value>1,2</value></metadata><data name="hello" xml:space="preserve"><value> Hello &amp; &lt;b&gt;world&lt;/b&gt; </value><comment>Keep comment</comment></data><data name="explicit" type="System.String, mscorlib"><value>Save</value></data><data name="integer" type="System.Int32, mscorlib"><value>42</value></data><data name="image" mimetype="application/x-microsoft.net.object.bytearray.base64"><value>SGVsbG8=</value></data><data name="reference" type="System.Resources.ResXFileRef, System.Windows.Forms"><value>logo.png;System.Drawing.Bitmap</value></data></root>';
        const imported = await parse("resx", source);
        check(imported.segments.length === 2, "Only System.String values should import");
        check(imported.segments[0].text === " Hello & <b>world</b> ", "RESX whitespace and literal markup");
        imported.segments[0].target = " Merhaba & <b>dünya</b> ";
        imported.segments[1].target = "Kaydet";
        const output = await api.buildLocalizationFile("resx", imported.segments, copy(imported.structure));
        const before = xml(source), after = xml(output);
        for (const selector of ["resheader", "metadata", '[name="integer"]', '[name="image"]', '[name="reference"]', "comment"]) check(before.querySelector(selector).isEqualNode(after.querySelector(selector)), `Changed non-string node ${selector}`);
        check(!after.querySelector('[name="hello"] value').children.length, "RESX markup must remain string content");
        check((await parse("resx", output)).segments[0].text === imported.segments[0].target, "RESX target round trip");
        const legacy = copy(imported.segments);
        legacy[0].structure.itemIndex = 3;
        legacy[1].structure.itemIndex = 4;
        const legacyOutput = xml(await api.buildLocalizationFile("resx", legacy, imported.structure));
        check(legacyOutput.querySelector('[name="hello"] value').textContent === imported.segments[0].target, "Legacy RESX numeric mappings resolve by resource name");
        let blockedLegacyBinary = false;
        try { await api.buildLocalizationFile("resx", [...legacy, { text: "42", target: "43", structure: { format: "resx", key: "integer", itemIndex: 2 } }], imported.structure); } catch { blockedLegacyBinary = true; }
        check(blockedLegacyBinary, "Legacy non-string resource rows must not overwrite another string");
      });
      await test("Qt TS plural forms and length variants retain structure, placeholders and obsolete messages", async () => {
        const source = '<?xml version="1.0"?><TS version="2.1" language="tr_TR" sourcelanguage="en_US"><context><name>MainWindow</name><message id="hello"><location filename="main.cpp" line="5"/><source>Hello %1</source><translation type="unfinished"/></message><message numerus="yes"><source>%n file(s)</source><translation type="unfinished"><numerusform>%n dosya</numerusform><numerusform>%n dosyalar</numerusform></translation></message><message><source>Save document</source><translation variants="yes"><lengthvariant>Belgeyi kaydet</lengthvariant><lengthvariant>Kaydet</lengthvariant></translation></message><message><source>Old</source><translation type="obsolete">Eski</translation></message><message><source>Vanished</source><translation type="vanished">Yok</translation></message></context></TS>';
        const imported = await parse("ts", source);
        check(imported.segments.length === 5, "Separate plural and length variants; skip obsolete");
        check(imported.segments[0].tags.some((tag) => tag.text === "%1"), "Qt numbered placeholder protected");
        check(imported.segments[1].tags.some((tag) => tag.text === "%n"), "Qt plural placeholder protected");
        const targets = ["Merhaba %1", "%n yeni dosya", "%n yeni dosyalar", "Yeni belgeyi kaydet", "Yeni kaydet"];
        imported.segments.forEach((segment, index) => { segment.target = targets[index]; });
        const output = await api.buildLocalizationFile("ts", imported.segments, copy(imported.structure));
        const before = xml(source), after = xml(output);
        check(after.querySelectorAll("numerusform").length === 2, "Plural forms preserved");
        check(after.querySelectorAll("lengthvariant").length === 2, "Length variants preserved");
        check(before.querySelector('translation[type="obsolete"]').isEqualNode(after.querySelector('translation[type="obsolete"]')), "Obsolete entry preserved");
        check(before.querySelector("location").isEqualNode(after.querySelector("location")), "Location preserved");
        check(JSON.stringify((await parse("ts", output)).segments.map((segment) => segment.target)) === JSON.stringify(targets), "Qt TS targets round trip");
        imported.segments[1].target = "";
        const incomplete = xml(await api.buildLocalizationFile("ts", imported.segments, imported.structure));
        check(incomplete.querySelector('message[numerus="yes"] translation').getAttribute("type") === "unfinished", "Incomplete plural message remains unfinished");
        const legacy = [...imported.segments, { text: "Old", target: "Do not overwrite", structure: { format: "ts-xml", messageIndex: 3, itemIndex: 0 } }];
        const legacyOutput = xml(await api.buildLocalizationFile("ts", legacy, imported.structure));
        check(legacyOutput.querySelector('message[id="hello"] translation').textContent === targets[0], "Legacy obsolete segment must not write to an active message");
      });
      await test("Qt TS rejects malformed XML and uninitialized plural forms instead of interpreting XML as code", async () => {
        for (const input of ['<TS language="tr"><context><message><source>Hello</source>', '<TS language="tr"><context><message numerus="yes"><source>%n files</source><translation type="unfinished"/></message></context></TS>']) {
          let rejected = false;
          try { await parse("ts", input); } catch { rejected = true; }
          check(rejected, "Unsafe TS input must reject");
        }
      });
      await test("Qt TS preserves whitespace and byte elements with empty or missing translations", async () => {
        const source = '<TS language="tr"><context><name>Bytes</name><message><source> Before<byte value="x9"/>after </source><translation/></message><message><source> First<byte value="x1"/>last </source></message><message><source> Space &lt;b&gt;text&lt;/b&gt; </source><translation> Eski </translation></message></context></TS>';
        const imported = await parse("ts", source);
        check(imported.segments.length === 3 && imported.segments[0].text.startsWith(" ") && imported.segments[0].text.endsWith(" "), "Qt source spaces preserved");
        check(imported.segments[2].target === " Eski ", "Qt target spaces preserved");
        imported.segments[0].target = imported.segments[0].text.replace("Before", "Önce").replace("after", "sonra");
        imported.segments[1].target = imported.segments[1].text.replace("First", "İlk").replace("last", "son");
        imported.segments[2].target = " Boşluk <b>metin</b> ";
        const output = await api.buildLocalizationFile("ts", imported.segments, copy(imported.structure));
        const after = xml(output);
        check(after.querySelectorAll("translation byte").length === 2, "Qt byte elements must remain real nodes");
        check(after.querySelectorAll("translation")[2].children.length === 0, "Escaped Qt rich-text string remains text");
        check(JSON.stringify((await parse("ts", output)).segments.map((segment) => segment.target)) === JSON.stringify(imported.segments.map((segment) => segment.target)), "Qt byte and space round trip");
      });
      await test("TXML retains sources and inline codes while creating missing targets", async () => {
        const source = '<txml locale="en" targetlocale="tr"><translatable><segment id="1"><source>Hello <ut id="1">&lt;b&gt;</ut>world</source><target/></segment><segment id="2"><source>Save &amp; exit</source></segment></translatable><meta value="keep"/></txml>';
        const imported = await parse("txml", source);
        check(imported.segments.length === 2, "Both TXML source units import");
        imported.segments[0].target = imported.segments[0].text.replace("Hello", "Merhaba").replace("world", "dünya");
        imported.segments[1].target = "Kaydet & çık";
        const output = await api.buildLocalizationFile("txml", imported.segments, copy(imported.structure));
        const before = xml(source), after = xml(output);
        check(after.querySelectorAll("target").length === 2, "Missing TXML target created");
        check(after.querySelector("target ut")?.textContent === "<b>", "TXML inline code retained");
        [...before.querySelectorAll("source")].forEach((node, index) => check(node.isEqualNode(after.querySelectorAll("source")[index]), "TXML source changed"));
        check((await parse("txml", output)).segments[1].target === "Kaydet & çık", "TXML target round trip");
      });
      await test("TTX uses Tuv language variants and preserves formatting and source content", async () => {
        const source = '<TRADOStag><FrontMatter><UserSettings SourceLanguage="EN-US" TargetLanguage="TR-TR"/></FrontMatter><Body><Raw><Tu id="1"><Tuv Lang="TR-TR">Eski</Tuv><Tuv Lang="EN-US">Hello <df Font="Arial">world</df></Tuv></Tu><Tu id="2"><Tuv Lang="EN-US">Save</Tuv></Tu></Raw></Body></TRADOStag>';
        const imported = await parse("ttx", source);
        check(imported.segments.length === 2 && imported.segments[0].text.startsWith("Hello"), "TTX source language chosen independent of variant order");
        imported.segments[0].target = imported.segments[0].text.replace("Hello", "Merhaba").replace("world", "dünya");
        imported.segments[1].target = "Kaydet";
        const output = await api.buildLocalizationFile("ttx", imported.segments, copy(imported.structure));
        const before = xml(source), after = xml(output);
        [...before.querySelectorAll('Tuv[Lang="EN-US"]')].forEach((node, index) => check(node.isEqualNode(after.querySelectorAll('Tuv[Lang="EN-US"]')[index]), "TTX source changed"));
        check(after.querySelectorAll('Tuv[Lang="TR-TR"]').length === 2, "TTX target variant created with locale");
        check(after.querySelector('Tuv[Lang="TR-TR"] df')?.textContent === "dünya", "TTX inline structure retained");
        check((await parse("ttx", output)).segments[1].target === "Kaydet", "TTX target round trip");
      });
      await test("WiX localization XML retains IDs and namespace", async () => {
        const source = '<WixLocalization xmlns="http://schemas.microsoft.com/wix/2006/localization" Culture="en-us"><String Id="Welcome">Welcome</String><String Id="Exit">Exit</String></WixLocalization>';
        const imported = await parse("wix", source);
        check(imported.segments.length === 2, "WiX strings import");
        imported.segments.forEach((segment, index) => { segment.target = ["Hoş geldiniz & merhaba", "Çıkış"][index]; });
        const after = xml(await api.buildLocalizationFile("wix", imported.segments, copy(imported.structure)));
        check(after.documentElement.namespaceURI === "http://schemas.microsoft.com/wix/2006/localization", "WiX namespace preserved");
        check(after.querySelector('String[Id="Welcome"]').textContent === "Hoş geldiniz & merhaba", "WiX string content round trips");
      });
      return outcomes;
    };
    const results = await win.webContents.executeJavaScript(`(${run.toString()})()`);
    results.forEach((result) => console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`));
    const failures = results.filter((result) => !result.passed);
    console.log(`Software XML formats: ${results.length - failures.length}/${results.length} passed.`);
    app.exit(failures.length ? 1 : 0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally { if (win && !win.isDestroyed()) win.destroy(); }
});
