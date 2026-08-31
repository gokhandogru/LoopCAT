# Privacy rebuild verification — LoopCAT 0.0.4-dev.20260831

Verified on 31 August 2026 on Windows x64 with Node 24 and Electron 43.3.0. This refresh changes documentation and packaging only and replaces the current repository download mirror. It remains an unsigned development preview.

- Build ID: `0.0.4-dev.20260831+source.239cf868ce3d`
- Source commit: `ef4f8c7e5e1d957915aaa4fb607b84709c5ee217`
- Source snapshot SHA-256: `239cf868ce3dbaca0b43f88b2f8e57f1e68a8458f9328690617ca1efa1c4d1d7`
- All fingerprinted source files match the committed source. The following download-only commit preserves that identity and commit ancestry.
- [Release notes](../docs/releases/0.0.4-dev.20260831.md) and [machine-readable manifest](release.json).

## Results for this rebuild

| Check | Result |
| --- | --- |
| Repository privacy | Four personal workspace references replaced with repository-relative references. The tracked-source scan found no remaining personal workspace path or local username. |
| Desktop documentation policy | Internal software reviews and planning prompts are omitted from staging and packaging, and rejected by the desktop artifact verifier. Their contents are absent from the rebuilt app. |
| Download contents | No personal workspace/user markers or excluded document files in the checked web and Windows app contents. The deleted competitor report is also absent from the source fingerprint. |
| Runtime comparison | 37 renderer/runtime files are byte-identical to the previous verified August 31 build. No application behavior changes are included. |
| Release and build checks | Release contract, bundle isolation, localization validation/compilation, renderer build verification, and desktop wrapper verification passed. |
| Build identity tests | All three existing focused tests passed, covering changed inputs, mixed builds, modified archives, checksums, and unwanted downloads. |
| Web download | Static archive verification and rendered web smoke passed. |
| Desktop payload | Runtime/source assets, version, ASAR integrity metadata, and Electron security fuses passed. |
| Packaged desktop startup | Passed with the renderer OS sandbox enabled in both normal hardware acceleration and explicit graphics-fallback modes, using isolated temporary profiles. |
| Installer and portable contents | Both nested app payloads match the verified unpacked application. ZIP-wrapped executable bytes match the built executables. All three ZIP identities match. |
| Download verification | Expected Windows artifacts, four distribution checksums, and the final three-ZIP repository manifest/checksum checks passed. |
| Authenticode | Both distributable executables are NotSigned, consistent with preview labeling. |

Desktop payload SHA-256: `a8a9d7e19c499873523945e5d5d7030fcea474dd5a2face31c1af505c38a22c8`.

The full unit/browser/accessibility suites and installed-desktop upgrade were not repeated for this documentation-only refresh. The [previous August 31 verification record](https://github.com/gokhandogru/LoopCAT/blob/742467cf54ad4b97a8d93771bb91132c64b98914/downloads/verification.md) records those earlier results; the runtime comparison above confirms the checked application files remain unchanged. This rebuild's startup checks used temporary profiles and did not alter existing translation data or the installed desktop copy.

## Exact download set

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `LoopCAT.Web.0.0.4-dev.20260831.zip` | 3,546,447 | `a9d92cfcb8bccb92e20fb51cd5f4b18949c85bb71f61652a5cb67eb4a2e23f37` |
| `LoopCAT.Windows.Setup.0.0.4-dev.20260831.zip` | 100,184,658 | `c234740864a236aa3cd7b4cbce94886127ef4639faa83bd9efedaab6bc58c6c7` |
| `LoopCAT.0.0.4-dev.20260831.Portable.zip` | 100,030,121 | `77b89118f9b487f8accf9e58c48809590cd2bde9966f61456bf241cb1b6c2867` |

## Remaining launch boundaries

Git history and historical release tags/assets are unchanged. Older commits and older copies of downloads may still contain earlier document versions. The repository remains private; this cleanup does not authorize public visibility.

Windows signing, clean-machine installation/upgrade evidence, manual screen-reader accessibility review, sustained performance, disk-full, and permission-denied qualification remain outstanding. Native macOS/Linux packages are not part of this preview. Do not label this download set a signed stable release.

Raw verification outputs remain local in ignored workspace directories. Personal translation data is not included in these downloads or commits.
