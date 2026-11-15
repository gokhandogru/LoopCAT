param(
  [ValidateSet('create','verify')][string]$Mode = 'create',
  [string]$ArtifactRoot = (Join-Path $PSScriptRoot '..\test-artifacts\office-formatting\native')
)
$ErrorActionPreference = 'Stop'
$ArtifactRoot = [IO.Path]::GetFullPath($ArtifactRoot)
New-Item -ItemType Directory -Force -Path $ArtifactRoot,(Join-Path $ArtifactRoot 'source'),(Join-Path $ArtifactRoot 'renders') | Out-Null
$translations = [ordered]@{ 'Hello'='Merhaba'; 'bold'='kalın'; 'red'='kırmızı'; 'world'='dünya'; 'Reference link'='Başvuru bağlantısı'; 'Header identity'='Üstbilgi kimliği'; 'Table cell'='Tablo hücresi'; 'Second line'='İkinci satır'; 'First bullet'='Birinci madde'; 'Second bullet'='İkinci madde'; 'Merged banner'='Birleşik başlık' }
function Expected([string]$value,[string]$variant) { if ($variant -eq 'translated') { foreach ($key in $translations.Keys) { $value = $value.Replace($key, $translations[$key]) } }; return $value }
function Find-Word($document,[string]$text) { $range = $document.Content.Duplicate; if (!$range.Find.Execute($text)) { throw "Missing Word text: $text" }; return ,$range }
function Font-Word($range) { return [ordered]@{ Name=$range.Font.Name; Size=$range.Font.Size; Bold=$range.Font.Bold; Italic=$range.Font.Italic; Underline=$range.Font.Underline; Color=$range.Font.Color; Superscript=$range.Font.Superscript } }
function Font-Excel($font) { return [ordered]@{ Name=$font.Name; Size=$font.Size; Bold=$font.Bold; Italic=$font.Italic; Underline=$font.Underline; Color=$font.Color; Superscript=$font.Superscript } }
function Font-PowerPoint($font) { return [ordered]@{ Name=$font.Name; Size=$font.Size; Bold=$font.Bold; Italic=$font.Italic; Underline=$font.Underline; Color=$font.Color.RGB; BaselineOffset=$font.BaselineOffset } }
function Assert-Equal($actual,$expected,[string]$label) { $a = ConvertTo-Json -Depth 30 -Compress -InputObject $actual; $b = ConvertTo-Json -Depth 30 -Compress -InputObject $expected; if ($a -cne $b) { throw "$label changed: $a != $b" } }
function Write-Json($value,[string]$path) { [IO.File]::WriteAllText($path, (ConvertTo-Json -Depth 40 -InputObject $value), [Text.UTF8Encoding]::new($false)) }
function Snapshot-Word($document,[string]$variant) {
  $fonts = [ordered]@{}; foreach ($label in @('Hello','bold','red','world','Reference link','Table cell')) { $fonts[$label] = Font-Word (Find-Word $document (Expected $label $variant)) }
  $links = @(); foreach ($link in $document.Hyperlinks) { $links += [ordered]@{ Address=$link.Address; SubAddress=$link.SubAddress } }
  $fields = @(); foreach ($field in $document.Fields) { $fields += $field.Code.Text }
  $bookmarks = @(); foreach ($bookmark in $document.Bookmarks) { $bookmarks += $bookmark.Name }
  return [ordered]@{ Text=$document.Content.Text; Fonts=$fonts; Hyperlinks=$links; Fields=$fields; Bookmarks=$bookmarks; Paragraphs=$document.Paragraphs.Count; Tables=$document.Tables.Count; Shapes=$document.Shapes.Count; Header=$document.Sections.Item(1).Headers.Item(1).Range.Text; Margins=@($document.PageSetup.TopMargin,$document.PageSetup.BottomMargin,$document.PageSetup.LeftMargin,$document.PageSetup.RightMargin); TableWidth=$document.Tables.Item(1).PreferredWidth; Pages=$document.ComputeStatistics(2) }
}
function Snapshot-Excel($book,[string]$variant) {
  $sheet=$book.Worksheets.Item(1); $cell=$sheet.Range('A2'); $text=[string]$cell.Value2; $fonts=[ordered]@{}
  foreach ($label in @('Hello','bold','red','world')) { $needle=Expected $label $variant; $offset=$text.IndexOf($needle,[StringComparison]::Ordinal); if ($offset -lt 0) { throw "Missing Excel text: $needle" }; $fonts[$label]=Font-Excel ($cell.Characters($offset+1,$needle.Length).Font) }
  $cells=[ordered]@{}; foreach ($address in @('A1','A2','A4','D2','D4')) { $range=$sheet.Range($address); $cells[$address]=[ordered]@{ Text=[string]$range.Value2; NumberFormat=$range.NumberFormat; Fill=$range.Interior.Color; Alignment=$range.HorizontalAlignment; Wrap=$range.WrapText; Border=$range.Borders.Item(9).LineStyle } }
  return [ordered]@{ Fonts=$fonts; Cells=$cells; Formula=$sheet.Range('D2').Formula; Merge=$sheet.Range('A4').MergeArea.Address(); Widths=@($sheet.Columns.Item(1).ColumnWidth,$sheet.Columns.Item(2).ColumnWidth,$sheet.Columns.Item(3).ColumnWidth,$sheet.Columns.Item(4).ColumnWidth); Height=$sheet.Rows.Item(2).RowHeight; Hyperlink=$sheet.Range('D4').Hyperlinks.Item(1).Address; Sheets=$book.Worksheets.Count; PrintArea=$sheet.PageSetup.PrintArea }
}
function Snapshot-PowerPoint($deck,[string]$variant) {
  $slide=$deck.Slides.Item(1); $shape=$slide.Shapes.Item('Rich text'); $range=$shape.TextFrame.TextRange; $text=$range.Text; $fonts=[ordered]@{}
  foreach ($label in @('Hello','bold','red','world')) { $needle=Expected $label $variant; $offset=$text.IndexOf($needle,[StringComparison]::Ordinal); if ($offset -lt 0) { throw "Missing PowerPoint text: $needle" }; $fonts[$label]=Font-PowerPoint ($range.Characters($offset+1,$needle.Length).Font) }
  $shapes=@(); foreach ($item in $slide.Shapes) { $shapes += [ordered]@{ Name=$item.Name; Left=$item.Left; Top=$item.Top; Width=$item.Width; Height=$item.Height; Rotation=$item.Rotation; Fill=$item.Fill.ForeColor.RGB; Line=$item.Line.ForeColor.RGB } }
  return [ordered]@{ Text=$text; Fonts=$fonts; Shapes=$shapes; Slides=$deck.Slides.Count; Size=@($deck.PageSetup.SlideWidth,$deck.PageSetup.SlideHeight); Bullets=$slide.Shapes.Item('Bullets').TextFrame.TextRange.ParagraphFormat.Bullet.Visible; BulletText=$slide.Shapes.Item('Bullets').TextFrame.TextRange.Text; Link=$slide.Shapes.Item('Hyperlink').TextFrame.TextRange.ActionSettings.Item(1).Hyperlink.Address; TableText=$slide.Shapes.Item('Table').Table.Cell(1,1).Shape.TextFrame.TextRange.Text }
}

$results=[ordered]@{ mode=$Mode; versions=[ordered]@{}; checks=@() }
$word=$null; $excel=$null; $powerpoint=$null; $document=$null; $book=$null; $deck=$null
$existingWord=!!(Get-Process WINWORD -ErrorAction SilentlyContinue); $existingExcel=!!(Get-Process EXCEL -ErrorAction SilentlyContinue); $existingPowerPoint=!!(Get-Process POWERPNT -ErrorAction SilentlyContinue)
try {
  $word=New-Object -ComObject Word.Application; $word.Visible=$false; $wordAlerts=$word.DisplayAlerts; $word.DisplayAlerts=0; $results.versions.Word=$word.Version
  if ($Mode -eq 'create') {
    $document=$word.Documents.Add(); $document.Content.Text="Office formatting QA`rHello bold red world with Reference link ending.`rSecond line`r"
    $document.Content.Font.Name='Calibri'; $document.Content.Font.Size=12
    $document.Paragraphs.Item(1).Range.Font.Size=22; $document.Paragraphs.Item(1).Range.Font.Bold=-1
    (Find-Word $document 'bold').Font.Bold=-1; (Find-Word $document 'red').Font.Color=255; (Find-Word $document 'red').Font.Size=16
    (Find-Word $document 'world').Font.Italic=-1; (Find-Word $document 'world').Font.Underline=1
    $linkRange=Find-Word $document 'Reference link'; $null=$document.Hyperlinks.Add($linkRange,'https://example.com/formatting')
    $null=$document.Bookmarks.Add('FormattingBookmark',(Find-Word $document 'bold'))
    $end=$document.Range($document.Content.End-1,$document.Content.End-1); $table=$document.Tables.Add($end,2,2); $table.Cell(1,1).Range.Text='Table cell'; $table.Cell(1,2).Range.Text='Right cell'; $table.Cell(2,1).Range.Text='Lower cell'; $table.Cell(2,2).Range.Text='End cell'
    $table.Rows.Item(1).Shading.BackgroundPatternColor=0xE6F0FA; $table.Borders.Enable=1; $table.Cell(1,1).Range.Font.Bold=-1; $table.PreferredWidthType=3; $table.PreferredWidth=420
    $document.Sections.Item(1).Headers.Item(1).Range.Text='Header identity'
    $footer=$document.Sections.Item(1).Footers.Item(1).Range; $footer.Text='Page '; $footer.Collapse(0); $null=$document.Fields.Add($footer,33)
    $shape=$document.Shapes.AddShape(1,350,100,75,30); $shape.Fill.ForeColor.RGB=0xDCE6F1; $shape.Line.ForeColor.RGB=0x4472C4; $shape.WrapFormat.Type=0
    $document.SaveAs2((Join-Path $ArtifactRoot 'source\formatting.docx'),12); $snapshot=Snapshot-Word $document 'source'; Write-Json $snapshot (Join-Path $ArtifactRoot 'word-source.json')
    $document.Close(0); $document=$null
  } else {
    $baseline=Get-Content -LiteralPath (Join-Path $ArtifactRoot 'word-source.json') -Raw | ConvertFrom-Json
    foreach ($variant in @('copy','translated')) {
      $document=$word.Documents.Open((Join-Path $ArtifactRoot "$variant\formatting.docx"),$false,$true); $snapshot=Snapshot-Word $document $variant
      foreach ($name in @('Fonts','Hyperlinks','Fields','Bookmarks','Paragraphs','Tables','Shapes','Margins','TableWidth','Pages')) { Assert-Equal $snapshot[$name] $baseline.$name "Word $variant $name" }
      Assert-Equal $snapshot.Text (Expected $baseline.Text $variant) "Word $variant text"; Assert-Equal $snapshot.Header (Expected $baseline.Header $variant) "Word $variant header"
      $document.ExportAsFixedFormat((Join-Path $ArtifactRoot "renders\word-$variant.pdf"),17); Write-Json $snapshot (Join-Path $ArtifactRoot "word-$variant.json"); $document.Close(0); $document=$null; $results.checks += "Word $variant native formatting and text"
    }
    $document=$word.Documents.Open((Join-Path $ArtifactRoot 'source\formatting.docx'),$false,$true); $document.ExportAsFixedFormat((Join-Path $ArtifactRoot 'renders\word-source.pdf'),17); $document.Close(0); $document=$null
  }
  $word.DisplayAlerts=$wordAlerts; if (!$existingWord) { $word.Quit() }; $word=$null
  $excel=New-Object -ComObject Excel.Application; $excel.Visible=$false; $excelAlerts=$excel.DisplayAlerts; $excel.DisplayAlerts=$false; $results.versions.Excel=$excel.Version
  if ($Mode -eq 'create') {
    $book=$excel.Workbooks.Add(); $sheet=$book.Worksheets.Item(1); $sheet.Name='Formatting'
    $sheet.Range('A1').Value2='Office formatting QA'; $sheet.Range('A1').Font.Size=20; $sheet.Range('A1').Font.Bold=$true
    $cell=$sheet.Range('A2'); $cell.Value2='Hello bold red world'; $cell.Font.Name='Calibri'; $cell.Font.Size=12; $cell.Characters(7,4).Font.Bold=$true; $cell.Characters(12,3).Font.Color=255; $cell.Characters(12,3).Font.Size=16; $cell.Characters(16,5).Font.Italic=$true; $cell.Characters(16,5).Font.Underline=2
    $cell.Interior.Color=0xE6F0FA; $cell.Borders.Item(9).LineStyle=1; $sheet.Rows.Item(2).RowHeight=35
    $sheet.Range('A4:C4').Merge(); $sheet.Range('A4').Value2='Merged banner'; $sheet.Range('A4').HorizontalAlignment=-4108; $sheet.Range('A4').Interior.Color=0xDCE6F1
    $sheet.Range('D2').Formula='=SUM(1,2)'; $sheet.Range('D2').NumberFormat='0.00'; $null=$sheet.Hyperlinks.Add($sheet.Range('D4'),'https://example.com/formatting','','','Reference link')
    $sheet.Columns.Item(1).ColumnWidth=40; $sheet.Columns.Item(2).ColumnWidth=15; $sheet.Columns.Item(3).ColumnWidth=15; $sheet.Columns.Item(4).ColumnWidth=30; $sheet.PageSetup.PrintArea='$A$1:$D$6'; $sheet.PageSetup.Orientation=2; $sheet.PageSetup.Zoom=$false; $sheet.PageSetup.FitToPagesWide=1; $sheet.PageSetup.FitToPagesTall=1
    $book.SaveAs((Join-Path $ArtifactRoot 'source\formatting.xlsx'),51); Write-Json (Snapshot-Excel $book 'source') (Join-Path $ArtifactRoot 'excel-source.json'); $book.Close($false); $book=$null
  } else {
    $baseline=Get-Content -LiteralPath (Join-Path $ArtifactRoot 'excel-source.json') -Raw | ConvertFrom-Json
    foreach ($variant in @('copy','translated')) {
      $book=$excel.Workbooks.Open((Join-Path $ArtifactRoot "$variant\formatting.xlsx"),0,$true); $snapshot=Snapshot-Excel $book $variant
      foreach ($name in @('Fonts','Formula','Merge','Widths','Height','Hyperlink','Sheets','PrintArea')) { Assert-Equal $snapshot[$name] $baseline.$name "Excel $variant $name" }
      foreach ($address in $snapshot.Cells.Keys) { foreach ($property in @('NumberFormat','Fill','Alignment','Wrap','Border')) { Assert-Equal $snapshot.Cells[$address][$property] $baseline.Cells.$address.$property "Excel $variant $address $property" }; Assert-Equal $snapshot.Cells[$address].Text (Expected $baseline.Cells.$address.Text $variant) "Excel $variant $address text" }
      $book.ExportAsFixedFormat(0,(Join-Path $ArtifactRoot "renders\excel-$variant.pdf")); Write-Json $snapshot (Join-Path $ArtifactRoot "excel-$variant.json"); $book.Close($false); $book=$null; $results.checks += "Excel $variant native formatting and text"
    }
    $book=$excel.Workbooks.Open((Join-Path $ArtifactRoot 'source\formatting.xlsx'),0,$true); $book.ExportAsFixedFormat(0,(Join-Path $ArtifactRoot 'renders\excel-source.pdf')); $book.Close($false); $book=$null
  }
  $excel.DisplayAlerts=$excelAlerts; if (!$existingExcel) { $excel.Quit() }; $excel=$null
  $powerpoint=New-Object -ComObject PowerPoint.Application; $pptAlerts=$powerpoint.DisplayAlerts; $powerpoint.DisplayAlerts=1; $results.versions.PowerPoint=$powerpoint.Version
  if ($Mode -eq 'create') {
    $deck=$powerpoint.Presentations.Add(0); $deck.PageSetup.SlideWidth=720; $deck.PageSetup.SlideHeight=405; $slide=$deck.Slides.Add(1,12)
    $shape=$slide.Shapes.AddTextbox(1,35,35,650,65); $shape.Name='Rich text'; $range=$shape.TextFrame.TextRange; $range.Text='Hello bold red world'; $range.Font.Name='Calibri'; $range.Font.Size=28; $range.Characters(7,4).Font.Bold=-1; $range.Characters(12,3).Font.Color.RGB=255; $range.Characters(12,3).Font.Size=34; $range.Characters(16,5).Font.Italic=-1; $range.Characters(16,5).Font.Underline=-1; $shape.Fill.Visible=-1; $shape.Fill.ForeColor.RGB=0xE6F0FA; $shape.Line.Visible=-1; $shape.Line.ForeColor.RGB=0x4472C4
    $bullet=$slide.Shapes.AddTextbox(1,40,120,600,75); $bullet.Name='Bullets'; $bullet.TextFrame.TextRange.Text="First bullet`rSecond bullet"; $bullet.TextFrame.TextRange.Font.Size=20; $bullet.TextFrame.TextRange.ParagraphFormat.Bullet.Visible=-1
    $link=$slide.Shapes.AddTextbox(1,40,205,600,35); $link.Name='Hyperlink'; $link.TextFrame.TextRange.Text='Reference link'; $link.TextFrame.TextRange.Font.Size=18; $link.TextFrame.TextRange.ActionSettings.Item(1).Hyperlink.Address='https://example.com/formatting'
    $tableShape=$slide.Shapes.AddTable(2,2,40,260,600,100); $tableShape.Name='Table'; $tableShape.Table.Cell(1,1).Shape.TextFrame.TextRange.Text='Table cell'; $tableShape.Table.Cell(1,2).Shape.TextFrame.TextRange.Text='Right cell'; $tableShape.Table.Cell(2,1).Shape.TextFrame.TextRange.Text='Lower cell'; $tableShape.Table.Cell(2,2).Shape.TextFrame.TextRange.Text='End cell'; $tableShape.Table.Cell(1,1).Shape.TextFrame.TextRange.Font.Bold=-1
    $deck.SaveAs((Join-Path $ArtifactRoot 'source\formatting.pptx'),24); Write-Json (Snapshot-PowerPoint $deck 'source') (Join-Path $ArtifactRoot 'powerpoint-source.json'); $deck.Close(); $deck=$null
  } else {
    $baseline=Get-Content -LiteralPath (Join-Path $ArtifactRoot 'powerpoint-source.json') -Raw | ConvertFrom-Json
    foreach ($variant in @('copy','translated')) {
      $deck=$powerpoint.Presentations.Open((Join-Path $ArtifactRoot "$variant\formatting.pptx"),-1,0,0); $snapshot=Snapshot-PowerPoint $deck $variant
      foreach ($name in @('Fonts','Shapes','Slides','Size','Bullets','Link')) { Assert-Equal $snapshot[$name] $baseline.$name "PowerPoint $variant $name" }
      foreach ($name in @('Text','BulletText','TableText')) { Assert-Equal $snapshot[$name] (Expected $baseline.$name $variant) "PowerPoint $variant $name" }
      $deck.Slides.Item(1).Export((Join-Path $ArtifactRoot "renders\powerpoint-$variant.png"),'PNG',1440,810); Write-Json $snapshot (Join-Path $ArtifactRoot "powerpoint-$variant.json"); $deck.Close(); $deck=$null; $results.checks += "PowerPoint $variant native formatting and text"
    }
    $deck=$powerpoint.Presentations.Open((Join-Path $ArtifactRoot 'source\formatting.pptx'),-1,0,0); $deck.Slides.Item(1).Export((Join-Path $ArtifactRoot 'renders\powerpoint-source.png'),'PNG',1440,810); $deck.Close(); $deck=$null
  }
  $powerpoint.DisplayAlerts=$pptAlerts; if (!$existingPowerPoint) { $powerpoint.Quit() }; $powerpoint=$null
  Write-Json $results (Join-Path $ArtifactRoot "$Mode-results.json")
  Write-Output (ConvertTo-Json -Depth 6 -InputObject $results)
} finally {
  if ($document) { $document.Close(0) }; if ($book) { $book.Close($false) }; if ($deck) { $deck.Close() }
  if ($word) { $word.DisplayAlerts=$wordAlerts; if (!$existingWord) { $word.Quit() } }
  if ($excel) { $excel.DisplayAlerts=$excelAlerts; if (!$existingExcel) { $excel.Quit() } }
  if ($powerpoint) { $powerpoint.DisplayAlerts=$pptAlerts; if (!$existingPowerPoint) { $powerpoint.Quit() } }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
