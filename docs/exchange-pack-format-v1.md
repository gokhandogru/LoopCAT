# LoopCAT Exchange pack format v1

A pack is an explicitly installed, non-executable ZIP. The authoring form can save an unfinished local draft; validating and exporting it produces a shareable `.loopcat-pack.zip`. Pack export contains authored content, including the author's examples. Use public, synthetic, or otherwise authorized examples. A project, recovery archive, or downloaded catalog does not grant activation.

## Container and identity

The ZIP contains exactly two UTF-8 JSON files at its root: `manifest.json` and `entries.json`. Version 1 accepts regular stored/deflated files, and validates local/central names and offsets, entry uniqueness, actual expanded sizes and CRC. Directories, symlinks, trailing payloads, encryption, ZIP64, alternate paths, and unrequested files are rejected. The input limit is 8 MiB, the expanded limit 32 MiB, and the manifest alone is limited to 16 KiB. The general safe reader caps archives at 64 entries; the narrower v1 layout requires exactly two.

The digest is the lowercase hexadecimal SHA-256 of **all original ZIP bytes**. Recompressing a pack changes the digest even if the JSON is identical. Export an installed artifact to retrieve its original bytes; publish a new version when changing it. The local installer rejects different bytes claiming an already installed ID/version, even if supplied by a different catalog. A checksum identifies bytes; origin authentication additionally requires trusted signed catalog metadata.

A minimal `manifest.json`:

```json
{
  "format": "loopcat-pack",
  "schemaVersion": 1,
  "id": "example.server-check",
  "version": "1.0.0",
  "kind": "qa",
  "name": "Server terminology check",
  "publisher": "Example teaching team",
  "license": "CC0-1.0",
  "languages": { "source": "en", "target": "tr" }
}
```

`description` and `attribution` are optional. IDs use lowercase dotted namespaces; versions use three numeric components and an optional prerelease suffix. A pack can specify either or both BCP 47 languages. An `en` requirement matches `en-US`; a regional `en-US` requirement does not silently match `en-GB`. Use the translation project's languages, independent of the UI locale. Unknown manifest fields and unknown pack kinds fail validation. The publisher field is an author's declaration.

For that manifest, `entries.json` could be:

```json
[
  {
    "id": "server-form",
    "op": "target-missing-if-source",
    "source": "server",
    "targets": ["sunucu", "sunucunun"],
    "message": "Check the approved Turkish term for server.",
    "examples": [
      { "source": "Server time", "target": "Makinenin saati", "expect": "fail" },
      { "source": "Server time", "target": "Sunucunun saati", "expect": "pass" },
      { "source": "Serverless app", "target": "Sunucusuz uygulama", "expect": "pass" }
    ]
  }
]
```

Each QA rule requires at least one passing and one failing example; the same evaluator runs them before install/export. A source-triggered rule accepts **any** explicitly listed target form. `target-contains` instead flags any listed forbidden target form and takes no source condition. Both operate on translated rows, use NFC and Unicode word boundaries, default to locale-aware case folding, and accept `caseSensitive: true`. They never evaluate user regex or run programs. A pack may include up to 100 rules, each with at most 32 target forms and 16 examples. Findings are advisory.

Terminology entries use `sourceTerm`, `targetTerm`, optional `status` (`preferred`, `admitted`, `forbidden`), and optional `conceptId`, `domain`, `attribution`, and `caseSensitive`. The limit is 10,000 entries. Matching uses the same Unicode boundaries; list inflections when needed. A term overlay is read-only. An explicitly copied term in a writable native termbase belongs to its user.

Other v1 kinds are strictly typed: a `lesson` contains exercises with four frozen candidates and a rubric, a `client` kit contains pinned dependency IDs/versions/digests/priorities/required flags, and an `ai` workflow references approved operations and built-in provider IDs. See [workflow schemas and a complete sample](../src/features/exchange/workflow-packs.js) for the accepted fields. None can supply JavaScript, credentials, a provider endpoint, activation authority or a custom network transport.

Only an explicit manifest-level `"allowTermCopy": true` on a terminology pack enables **Copy to my termbase**. Without it, matches stay available as read-only reference. Check the actual data rights before enabling this author permission.

## Lifecycle and portability

Install stores a device-local artifact, with a separate lightweight descriptor for listing. Installation alone does not enable the pack. Activation selects an exact version on one project; there is no automatic upgrade or replacement of a missing dependency. A kit applies its selected installed dependencies atomically in the local registry; a missing or mismatched required dependency prevents the change. Nested kits are not supported. The device can hold at most 80 installed pack versions and 32 drafts.

Disable removes the pack's effects for the selected project. Uninstall removes its installed bytes and disables its bindings on the device; author drafts, saved human translations, and copied terms are distinct data. Required-but-disabled references can remain to explain an incomplete QA result. Removing a pack cannot erase pre-existing exports or recall data already sent to a provider.

Portable references may include only identity, version, digest, kind, required flag and priority. Device activation stays outside portable projects. A restored/imported requirement must be explicitly fulfilled locally; opening a project never installs code or grants network access. Installed packs can be transferred as separate ZIP files subject to their redistribution terms.

When the web ZIP is opened directly from the filesystem, Exchange probes local IndexedDB with a temporary transaction. If that first probe fails, the library explicitly switches to session-only storage and accepts reimported pack files. A successful probe establishes read/write access in the current context; it cannot guarantee that the browser preserves that origin across file moves, profile resets or restarts. A failure on an established durable store remains an error and does not silently divert later saves to memory.

## Verification

The dedicated format/repository tests exercise archive tampering, case-sensitive and Turkish matching, executable QA fixtures, install/enable/disable, cross-connection generation checks, project isolation, kit rollback, and original-byte export. For catalog security and terminal-only compute research, see [Exchange distribution](exchange-distribution.md).

Measured configurations are an empty library, twenty installed but inactive packs, one active terminology pack, and a mixed profile with three active terminology packs and two QA packs. The mixed case runs an additional manual QA scan **after** the timed input/save section and verifies two findings plus worker termination. Each condition receives a separate, private browser partition. The `--large-first` option exercises the 100,000-segment cases first and saves results separately.

`--inactive-probe` runs an additional short 10,000-segment trial: count Exchange database opens from the application frame, filter actual HTTP/WS traffic, check absent workers/DB/catalog requests for the empty and twenty-inactive cases, and verify that the same probe observes an active pack. Finally exercise three real QA preview/install/activate/uninstall cycles and record the observed heap and worker count on each side. Heap observations do not establish a garbage-collection or memory-leak guarantee.

After building the renderer, run `node scripts/verify-exchange-perf.cjs --smoke` for the quick synthetic 10,000-segment check; it does not certify performance. Omit the flag for 10,000 and 100,000 segments, 30 measured edits per configuration, and five matched blocks on a quiet reference machine. `--early-fail` is an optional engineering diagnostic that can stop when the original empty-library paint/save budgets already fail in two blocks. Results under `output/` include per-condition input/paint/save timings, heap observations, worker counts and machine details. Synthetic editor input, a two-frame paint proxy, and an IndexedDB commit readback measure different things: a fast dispatch alone does not establish a responsive editor.

## Offline command-line authoring

A terminology or QA author can also export a private `.loopcat-draft.json` from the no-code editor. Its envelope is `{format:"loopcat-private-author-draft",schemaVersion:1,draft:…}`. It holds incomplete form rows and their inclusion choices. Draft import checks the envelope, field types and byte/row limits before opening the editor, and does not install or overwrite anything. Draft files are limited to 1 MiB, with up to 500 term rows or 100 QA rules. The shareable ZIP strips the inclusion choices and excludes unchecked rows. Larger terminology collections can use the pack CLI below.

Use `node scripts/exchange-packs.mjs examples output/exchange-starter-packs` to produce the same three example artifacts as the gallery. Use `build PACK.json OUTPUT.loopcat-pack.zip` to validate an author manifest and create a pack, or `check FILE.loopcat-pack.zip` to validate a shared file without installing it. The CLI prints the exact artifact digest and never overwrites different bytes.
