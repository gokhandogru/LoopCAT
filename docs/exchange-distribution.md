# Publish and verify an Exchange catalog

A university or team can distribute a signed static index and pack files today. The built-in official source has **no enrolled production signer or network destination** in this checkout. Administrators can distribute a snapshot and a trust file independently; a translator can import both without an account or internet connection. The catalog cannot see project data. Opening it never installs a pack, grants permissions, or activates a project requirement.

## Offline use

1. Obtain the publisher’s `catalog-key.json` through an independent channel, for example a university’s authenticated course portal. Confirm its SHA-256 fingerprint with the publisher. An archive containing both a key and a signature cannot establish an identity by itself.
2. In the Exchange Library’s **Catalog** tab, open **Private catalog files**, select that key, check the displayed fingerprint and trust it for this session. Select `index.json` signed by that key. Search by name, publisher or keyword, then use **Filter by compatibility** for task, language, region, domain, edition and availability. **Works offline** narrows the results to offline resources. Each listing includes an example, its exact version, and expandable publisher, rights, digest and review details.
3. Choose the release’s `.loopcat-pack.zip`. The catalog checks its size and exact digest before passing it to the normal inspection workflow. LoopCAT also checks that the pack’s internal ID/version match. Installation and project activation are separate decisions. An expired index cannot approve a new install; existing projects still open offline. A newer checkpoint accepted in another window makes the old view require a fresh signed snapshot. Failed verification provides a recovery step, and retrying with the correct file preserves the last accepted checkpoint.

The device keeps the highest accepted sequence and its digest per catalog, previous ID/version content bindings, and withdrawn digests. This prevents an older snapshot, equivocation at the same revision, or replacing published bytes under the same version. A newer index cannot erase a known withdrawal. Catalog-origin checks apply to that exact signer’s installed copies. Another department cannot withdraw a sideloaded pack or a different catalog’s installation. An accepted withdrawal stops that copy’s activation; its files, native translations and copied resource rows remain distinct. A disconnected machine cannot know about a newly published withdrawal until it refreshes or imports a signed snapshot. Clearing device storage also clears locally remembered trust history: reestablish the current checkpoint from the publisher.

## Publisher workflow

Prepare a declarative pack in the normal authoring workflow. Place its exact bytes in `release/packs/<64-lowercase-SHA256>.loopcat-pack.zip`. Create an unsigned UTF-8 JSON index:

```json
{
  "format": "loopcat-catalog-v1",
  "catalogId": "edu.example.translation",
  "sequence": 1,
  "issuedAt": "<current ISO timestamp>",
  "expiresAt": "<ISO timestamp no more than 90 days after issue>",
  "releases": [{
    "id": "edu.example.terminology", "version": "1.0.0", "title": "Course glossary",
    "task": "Look up technical terminology", "domain": "Software", "region": "TR",
    "languages": ["en", "tr"], "offline": true, "edition": "Web and desktop",
    "sample": "Look up the term backup.", "maintainer": "Course team", "rights": "CC0-1.0",
    "testedApp": "<tested LoopCAT version>", "reviewedVersion": "1.0.0",
    "sha256": "<digest of the complete ZIP>", "bytes": 1234
  }],
  "revoked": []
}
```

Use Node from the project’s toolchain. Provide an operator-controlled Ed25519 PEM key outside the publish directories; no real signing key is checked in. Create a fresh empty staging directory, then:

```text
node scripts/exchange-catalog.mjs sign review.json PRIVATE.pem release staging
node scripts/exchange-catalog.mjs verify staging/index.json staging/catalog-key.json
```

The signer checks every available archive’s digest, size, pack envelope, ID, version and license. It copies the exact approved archives into `staging/packs/`, writes the public trust file, and writes the signed index last. The output directory must be empty. Existing published output is protected from overwrite. On a normal write failure, the command removes the files it created. For compatibility, signing directly in the source directory is supported when it initially contains only `packs/`.

The resulting directory is ready for private distribution. Send recipients `index.json` and `packs/` together. Deliver `catalog-key.json` and confirm its fingerprint through an independently authenticated channel. Keep the private PEM outside both source and output directories. A signature establishes which enrolled publisher approved the listing. The translator can inspect its examples and review details to assess whether it suits a project.

A new release receives a new version and digest. To withdraw, publish a higher sequence containing the exact digest in `revoked`, using a fresh output directory. That publication includes the remaining approved archives and omits withdrawn archives. Previously published versions stay immutable. Maintain the review log, publisher contact, ownership of resource text, and backup/recovery of the signing key. This implementation pins one key per catalog; change keys through independently authenticated re-enrollment under a new catalog identity. It does not implement threshold signatures or root rotation.

The automated local rehearsal in `tests/unit/exchange-catalog-integration.test.cjs` generates a disposable signer, publishes two real QA archives, installs them into an isolated IndexedDB repository, and signs a later withdrawal. It verifies that a disconnected recipient retains its last accepted state until importing the update, then disables only the withdrawn version while keeping its required flag and priority. It also verifies the new publication contains the approved pack files and refuses rollback. The mounted catalog tests cover explicit fingerprint approval, filtered discovery, a bad archive followed by a successful retry, and a changed checkpoint in another window.

For an official distribution, configure the trusted source in `src/features/exchange/catalog.js` at build time (`source`: an HTTPS directory ending `/`; `key`: the separate `{catalogId,publicKey}` anchor). Publish `index.json` and digest-named `packs/` under that exact directory. Use a same-origin hosted path when possible. Other editions would need explicit allowlisting of just that distribution path/origin and CORS for applicable hosted builds. No deploy or additional CSP origin is implicit. A refresh or pack download requires a user action and makes one bounded GET with no credentials, referrer or redirects. Browsers without Ed25519 WebCrypto cannot verify signed snapshots and must not claim a reviewed install. For a running release rehearsal using disposable keys and real ZIPs, see `tests/unit/exchange-catalog-integration.test.cjs`.

## Restricted computation experiment

Run `node scripts/exchange-compute-probe.mjs` on the Node development runtime. It executes a genuine WebAssembly Turkish term matcher built by `scripts/exchange-compute-turkish.mjs`. Input is only a lemma, one selected token and an optional lexicon-controlled consonant-softening flag. The algorithm applies vowel harmony, plural and limited case endings, voiceless assimilation, buffer **y**, and indicated consonant alternation. Output is either one typed local span or no finding. It does not rewrite text. This is *not* a general Turkish morphological analyzer. It omits many cases, proper names, derivation, irregular stems, and morphological ambiguity.

The executable guest is independent of both the 18 labeled examples and LoopCAT’s ordinary exact-form matcher. On the small, hand-selected inflection/near-miss fixture, the native exact-form rule supplied only the lemma finds 0/9 positive examples and has 0/9 false positives; naive prefix finds 7/9 and incorrectly accepts 6/9 negatives; the guest finds 9/9 and accepts 0/9 negatives. Explicitly listing all nine inflections could match them too. The measured benefit is generalizing a rule over previously unlisted forms. The fixture is not an independent blind corpus; evaluate held-out domains with independent Turkish reviewers before making linguistic claims.

The trusted wrapper validates a small integer-only ABI and opcodes before compilation, permits one fixed 64 KiB memory import with no growth, no filesystem/network/DOM/IPC imports, and constrains input, findings, module size, VM heap and job length. CPU deadlines and aborts terminate the worker from outside. Each input uses a fresh guest instance. Tests cover infinite loops, rejected input/imports, denied memory growth, oversized findings, cancellation and subsequent healthy computation. The ordinary CAT Worker is not this isolation boundary. The developer runner has no production entrypoint, does not accept arbitrary JS, and cannot install computation via a declarative pack. Web/PWA/direct-file and packaged desktop are **not qualified** for guest execution; their strict CSP and executable manifests remain unchanged. Before a product pilot, add interaction/soak evidence, per-edition abuse checks and an independent security review of a production host.
