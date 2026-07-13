param(
  [Parameter(Mandatory = $true)]
  [string]$SchemaPath,

  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]]$Documents
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
  throw "XLIFF 2.2 schema not found: $SchemaPath"
}

$schemaDirectory = Split-Path -Parent $SchemaPath
$schemaSet = [System.Xml.Schema.XmlSchemaSet]::new()
$schemaSet.XmlResolver = [System.Xml.XmlUrlResolver]::new()
$null = $schemaSet.Add("http://www.w3.org/XML/1998/namespace", (Join-Path $schemaDirectory "xml.xsd"))
$null = $schemaSet.Add("urn:oasis:names:tc:xliff:metadata:2.0", (Join-Path $schemaDirectory "metadata.xsd"))
$null = $schemaSet.Add("urn:oasis:names:tc:xliff:document:2.2", $SchemaPath)
$schemaSet.Compile()

foreach ($document in $Documents) {
  if (-not (Test-Path -LiteralPath $document -PathType Leaf)) {
    throw "XLIFF 2.2 fixture not found: $document"
  }

  $validationErrors = [System.Collections.Generic.List[string]]::new()
  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $settings.ValidationType = [System.Xml.ValidationType]::Schema
  $settings.Schemas = $schemaSet
  $settings.add_ValidationEventHandler({
    param($sender, $eventArgs)
    $validationErrors.Add($eventArgs.Message)
  })

  $reader = [System.Xml.XmlReader]::Create($document, $settings)
  try {
    while ($reader.Read()) {}
  } finally {
    $reader.Dispose()
  }

  if ($validationErrors.Count -gt 0) {
    throw "XLIFF 2.2 schema validation failed for $document`n$($validationErrors -join "`n")"
  }

  Write-Output "PASS XLIFF 2.2 schema: $document"
}
