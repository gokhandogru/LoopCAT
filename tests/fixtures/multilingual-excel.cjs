const zip = require("@zip.js/zip.js");

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const inline = (reference, value, style = "") =>
  `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${value}</t></is></c>`;

function multilingualExcelEntries() {
  return {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/multilingual.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets><sheet name="Languages &amp; notes" sheetId="1" r:id="rId1"/><sheet name="Reference" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/multilingual.xml"/><Relationship Id="rId2" Type="${relationships}/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${relationships}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="${relationships}/styles" Target="styles.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="${main}" count="6" uniqueCount="2"><si><r><t xml:space="preserve">Hello </t></r><r><t>world</t></r><rPh sb="0" eb="1"><t>phonetic</t></rPh></si><si><t>Merhaba</t></si></sst>`,
    "xl/styles.xml": `<styleSheet xmlns="${main}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs></styleSheet>`,
    "xl/worksheets/multilingual.xml": `<worksheet xmlns="${main}"><dimension ref="A1:G15"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="7" width="24" customWidth="1"/></cols><sheetData>
      <row r="1">${inline("A1", "ID")}${inline("B1", "English")}${inline("C1", "French")}${inline("D1", "Turkish")}${inline("E1", "Notes")}</row>
      <row r="2" spans="1:7">${inline("A2", "entry-2")}<c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>0</v></c><c r="D2" s="1" t="s"><v>1</v></c>${inline("E2", "Keep notes")}<c r="F2"><v>7</v></c><c r="G2"><f>SUM(F2:F3)</f><v>7</v></c></row>
      <row r="3" spans="1:5">${inline("A3", "entry-3")}<c r="B3" t="s"><v>0</v></c>${inline("C3", "Bonjour")}${inline("E3", "Keep after missing target")}</row>
      <row r="4">${inline("B4", "Multi\nline &lt;literal&gt; &amp;")}${inline("D4", "Old multi", "1")}</row>
      <row r="5">${inline("B5", "  ")}${inline("D5", "No source: keep")}</row>
      <row r="6"><c r="B6"><v>0</v></c>${inline("D6", "Numeric source: keep")}</row>
      <row r="7"><c r="B7" t="str"><f>CONCAT(&quot;a&quot;,&quot;b&quot;)</f><v>ab</v></c>${inline("D7", "Formula source: keep")}</row>
      <row r="8">${inline("B8", "Formula target")}<c r="D8"><f>1+1</f><v>2</v></c></row>
      <row r="9">${inline("B9", "Numeric target")}<c r="D9"><v>0</v></c></row>
      <row r="10">${inline("B10", "Merged source")}${inline("D10", "Merged source: keep")}</row>
      <row r="11">${inline("B11", "Merged target")}${inline("D11", "Merged target: keep")}</row>
      <row r="12">${inline("B12", "Clear the translation")}${inline("D12", "Please clear", "1")}</row>
      <row r="13">${inline("B13", "Literal _x005F_x0041_ and CR _x000D_")}<c r="D13" t="n" s="1"/></row>
      <row r="14">${inline("B14", "=SOURCE")}${inline("D14", "Old formula-looking text")}</row>
      <row r="15">${inline("B15", "Repeated target")}<c r="D15" t="s"><v>1</v></c></row>
    </sheetData><mergeCells count="2"><mergeCell ref="B10:C10"/><mergeCell ref="D11:E11"/></mergeCells><autoFilter ref="A1:G15"/></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${main}"><sheetData><row r="1">${inline("A1", "Reference")}</row><row r="2"><c r="A2" t="s"><v>1</v></c>${inline("B2", "Untouched other sheet")}</row></sheetData></worksheet>`,
    "xl/comments1.xml": `<comments xmlns="${main}"><authors><author>Reviewer</author></authors><commentList><comment ref="D2" authorId="0"><text><t>Keep comment</t></text></comment></commentList></comments>`,
    "customXml/item1.xml": "<metadata>Untouched package data</metadata>"
  };
}

async function writeExcelEntries(entries) {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), { useWebWorkers: false, level: 0 });
  for (const [name, text] of Object.entries(entries)) await writer.add(name, new zip.TextReader(text));
  return writer.close();
}

async function readExcelEntries(bytes) {
  const reader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false });
  try {
    return Object.fromEntries(await Promise.all((await reader.getEntries()).filter((entry) => !entry.directory)
      .map(async (entry) => [entry.filename, await entry.getData(new zip.TextWriter())])));
  } finally {
    await reader.close();
  }
}

module.exports = { multilingualExcelEntries, readExcelEntries, writeExcelEntries };
