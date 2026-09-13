# Release verification — LoopCAT 0.0.4-dev.20260913

Verified on 13 September 2026. This is an unsigned Windows x64 development preview, not a signed stable release.

## Identity

- Source commit: `456c553ca98dcae296364103d10cffb46cb8a2db`.
- Build ID: `0.0.4-dev.20260913+source.7749c6f74b7b`.
- Source snapshot SHA-256: `7749c6f74b7b750b99060612db20c75b4246b97c73ea4dc4622b219a3f7b7261`.
- All three ZIPs contain matching build-info.json; the Windows app also embeds it in resources/app.asar.
- The source commit descends from the owner's `75ce076` commit. Download publication is a later, download-only commit; no prior commit is overwritten.
- [Release notes](../docs/releases/0.0.4-dev.20260913.md), [source and ZIP manifest](release.json), and [GitHub prerelease](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20260913).

## Recorded checks

| Check | Result |
| --- | --- |
| Quality | ESLint, configured Prettier checks, TypeScript, stylelint, all **1,445 unit tests**, and import-boundary verification passed. |
| Browser | All nine native Windows Electron suites passed: reliability, security policy, offline shell, smoke, regression, application workflow, workspace storage, package round trip, and large project. |
| Accessibility | Automated light/dark checks passed with zero non-blocking findings in the recorded states. A temporary-profile cleanup warning did not affect assertions. |
| Visual states | Baseline verification passed for 87 screenshots, including light/dark UI states and editor width checks. This is not manual visual or screen-reader certification. |
| Release and renderer | Updated schema/resource characterization, bundle contract and self-test, renderer production/test isolation, localization validation and compilation, and desktop wrapper checks passed. |
| Web artifact | Final ZIP static verification and HTTP/local-file startup smoke passed. The complete ZIP includes 66 static web assets. |
| Windows payload | ASAR content/source-identity checks and Electron fuse verification passed; raw node_modules are excluded because the required archive library is already bundled. |
| Packaged desktop | Final payload smoke passed with the renderer OS sandbox and hardware acceleration, then with the supported hardware-acceleration-off setting. Persistence, HTML/XLIFF/DOCX workflows, backup and app-shell checks passed. |
| Portable executable | The final portable EXE was launched separately and passed the same built-in workflow smoke with an isolated profile, OS sandbox and hardware acceleration. |
| Downloads | Expected Windows installer/portable EXEs and ZIP wrappers passed artifact rules and four distribution checksum checks. The three-ZIP repository mirror passed source-fingerprint, receipt and checksum verification. |
| Version labels | Package, PWA manifest, service worker, asset contract, active README/install guidance and HTML beginner guide use 0.0.4-dev.20260913. Windows FileVersion has that label; the Windows numeric ProductVersion is 0.0.4.0. |
| Signing | Both public Windows EXEs report NotSigned, as disclosed for this preview. No signing qualification is claimed. |

The sandboxed Electron browser attempt failed before renderer startup with GPU exit code -1073741515. The native rerun passed with Electron's renderer sandbox enabled. No application sandbox or security fuse was disabled to obtain release evidence.

Release preparation corrected outdated resource/schema assertions and bundle-test marker counts; the production renderer still excludes test-only flags and simulated failures. The desktop smoke fixture now reloads the project revision after segment append and uses standard forward-slash DOCX ZIP paths. The archive reader's unsafe-path rejection remains unchanged and has a regression test for this fixture.

The browser, accessibility and screenshot runs cover the final renderer implementation. Subsequent changes only adjusted packaging exclusions and the desktop smoke probe; final artifact and native smoke checks were repeated after rebuilding.

## Public assets

The GitHub release includes all five application assets below and SHA256SUMS.txt covering them. The repository mirror includes the three ZIPs and its separate versioned ZIP-only checksum list.

GitHub normalizes spaces in the two standalone EXE filenames to dots. The executable names inside the ZIP wrappers retain spaces; their bytes are identical to the standalone downloads.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `LoopCAT.Web.0.0.4-dev.20260913.zip` | 5,784,384 | `74fda09e4f20c0c3a8ed289a22daca43b50c2f588cdd4df2d067d7106af3d406` |
| `LoopCAT.Windows.Setup.0.0.4-dev.20260913.zip` | 100,470,008 | `62a179f5cc782404ea91fbfb5bfe5b215a7821a17192ede2c53a6a2d25229674` |
| `LoopCAT.0.0.4-dev.20260913.Portable.zip` | 100,315,617 | `7a0c8976d7623c482e791ae95660636e3e61f0b39e56ebf7bf8405b3e691b216` |
| `LoopCAT.Setup.0.0.4-dev.20260913.exe` | 100,426,501 | `d05e22034c78a95fde5c593561dac030debf221c138d1736276c47114321abfe` |
| `LoopCAT.0.0.4-dev.20260913.exe` | 100,266,143 | `deb5fad4a6db667062949b4bb7d8ad9b2bceeb8a15beda1e6096efb34c01c113` |

## Limits and retained history

No NSIS install/upgrade was performed over the owner's existing installation. Independent clean-machine installation, signing, manual assistive-technology checks, long-duration soak and the full multi-platform failure matrix remain outstanding. Native macOS packages are not part of this preview. Linux x64 packages were subsequently added as GitHub Release assets with separate evidence in [the Linux supplement](../docs/releases/0.0.4-dev.20260913-linux.md); this report's artifact hashes and original verification results cover Windows/web only.

Test profiles were isolated from personal projects. Raw test logs remain in ignored local cache directories and are not shipped. The previous August download mirror is recoverable from Git history; historical GitHub releases and tags are unchanged. Checksums detect corruption and mismatched assets, but do not independently authenticate an unsigned publisher.
