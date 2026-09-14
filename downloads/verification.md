# LoopCAT 0.0.4-dev.20260914.5 verification

Verified on 15 September 2026. Build ID: `0.0.4-dev.20260914.5+source.95b049f3ffd1`.

The Windows installer, portable package, and web ZIP were built from the same source fingerprint. See the [source and artifact manifest](release.json) and [release notes](../docs/releases/0.0.4-dev.20260914.5.md).

Checks passed:

- All 1,509 unit tests, including cache freshness across commits/restores and background-analysis cancellation/score parity.
- ESLint, configured Prettier checks, TypeScript, release contracts, and renderer production/test graph verification.
- Complete translator workflow, including editing, confirmation, project switching, import/export, and save-failure handling.
- Static web ZIP payload verification and a full startup/dialog render smoke through the documented Windows no-sandbox diagnostic path. The normal local renderer launch was blocked before app load by this restricted host's GPU-process startup failure.
- Desktop wrapper, packaged ASAR payload, Electron security fuses, public artifact selection, and SHA-256 checksum verification.
- Packaged Windows startup smoke through the documented no-sandbox diagnostic path. The GitHub Windows runner must pass the normal sandboxed smoke before the release is published.
- Three repeat editor probes on a copied test workspace: editor ready in 611–858 ms after selecting the project; real text insertion in 24–29 ms; dropdown focus worked in all three runs. A 600 ms preparation interval after catalog visibility was used. These are small-sample diagnostics, not percentile guarantees.

The repository mirror contains the unsigned Windows and web packages. Native Windows, macOS, and Linux release assets are built and checked on their matching GitHub runners; publication is conditional on every platform job and the combined web/desktop checksum bundle passing. These remain unsigned development previews.
