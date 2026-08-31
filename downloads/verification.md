# Local verification — LoopCAT 0.0.4-dev.20260831

Verified on 31 August 2026 on Windows x64 with Node 24 and the pinned Electron 43.3.0. This evidence applies to this unsigned preview only. It is not approval for a signed production release.

- Build ID: `0.0.4-dev.20260831+source.92e3832c0146`
- Source commit: `efdd7f263c47d1398fea8b1eb90b1c343639333d`
- Source snapshot SHA-256: `92e3832c0146065a6fcd08df3709a4abe6935d8842868c50f694aca56f799454`
- All fingerprinted source files match the committed source. A following commit publishes only the generated download mirror and this evidence; the verifier checks source equality and commit ancestry.
- [Release notes](../docs/releases/0.0.4-dev.20260831.md) and [machine-readable manifest](release.json).

## Results

| Check | Result |
| --- | --- |
| Release contract and bundle isolation | Passed, including the updated notice, scope, AI dialog, and dark-theme coverage. |
| Unit tests | 1,389 passed; zero failures, skips, cancellations, or pending tests. |
| Full browser suite | All eight phases passed: security policy, offline shell, smoke, regression, app workflow, workspace storage, package round trip, and large project. |
| Accessibility | 36 automated audits passed across light and dark themes, including expanded Quality Workbench, AI settings, project screens, editor, and dialogs. |
| Source quality | ESLint, formatting, TypeScript, CSS lint, localization validation, import boundaries, wrapper, and renderer checks passed. |
| Build identity | Current source changes, mixed builds, modified archives, bad checksums, stale downloads, and unrelated source commits are rejected. Download-only commits preserve valid source provenance. |
| Web download | ZIP contents, source identity, and rendered smoke passed. |
| Desktop payload | Runtime/source assets, version, integrity metadata, and Electron security fuses passed. |
| Packaged desktop startup | Passed with the renderer OS sandbox enabled, with normal hardware acceleration and the explicit graphics fallback, using isolated temporary profiles. |
| Installer and portable contents | Both nested app payloads match the verified unpacked app. ZIP-wrapped executable hashes match the built executables; all three archive identities match. |
| Installed desktop upgrade | Silent installer exited successfully. The installed payload matches the verified build and launches successfully in isolated test profiles with both graphics settings. All 109 checked existing storage files were unchanged; a local backup was retained. |
| Download verification | Expected Windows artifact names/sizes, four distribution checksums, and the final three-ZIP repository manifest/checksum gate passed. |
| Authenticode | Both distributable executables are NotSigned, consistent with preview labeling. |

Desktop payload SHA-256: `d15d2129164cee5e7f08b91daa8148825e5aff0b2241f29a0fdeaab46a772ebe`.

## Exact download set

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `LoopCAT.Web.0.0.4-dev.20260831.zip` | 3,546,501 | `3e64048bd8a03112dad9b52527a4544a83bbafbb18fca6e562a36773a020cfd2` |
| `LoopCAT.Windows.Setup.0.0.4-dev.20260831.zip` | 100,202,821 | `7a28072501d096d6413225109daa0936eb9fdfd608918b85c899e856b0ee2384` |
| `LoopCAT.0.0.4-dev.20260831.Portable.zip` | 100,048,330 | `8cd90a14aee9b042be80f8a7c51e665dba109920b7f652ef6f11c33860258b97` |

## Remaining launch boundaries

The GitHub repository remains private. Public visibility requires the owner's explicit approval because it exposes the repository and its history. Historical release assets and tags remain untouched.

Windows signing, clean-machine installation/upgrade evidence, manual screen-reader accessibility review, sustained performance, disk-full, and permission-denied qualification remain outstanding. Native macOS/Linux packages are not part of this preview. The successful upgrade on this existing machine does not replace clean-machine evidence. Do not label this download set a signed stable release.

Raw verification logs and rollback/data backups remain local in ignored workspace directories; private translation data is not included in these downloads or Git commits.
