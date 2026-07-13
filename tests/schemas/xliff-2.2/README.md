# Vendored XLIFF 2.2 schemas

These schemas support deterministic offline validation of LoopCAT's XLIFF 2.2 fixtures.

- `xliff_core_2.2.xsd` and `metadata.xsd` come from the OASIS XLIFF 2.2 schema package.
- `xml.xsd` comes from the W3C XML namespace schema.
- The Core schema's remote `xml.xsd` reference is redirected to the vendored local copy; its normative declarations are otherwise unchanged.

Sources:

- https://docs.oasis-open.org/xliff/xliff-core/v2.2/schemas/
- https://www.w3.org/2001/xml.xsd
