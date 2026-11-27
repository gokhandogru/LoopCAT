# LoopCAT 0.0.4-dev.20261127.1 release verification

Verified and published on 27 November 2026.

- [GitHub prerelease and all eleven files](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261127.1)
- [Successful all-platform workflow](https://github.com/gokhandogru/LoopCAT/actions/runs/46014416062)
- [Release manifest with sizes and SHA-256 hashes](latest-release.json)
- [Public downloads website](https://loopcat-downloads.gokhan-dogru.chatgpt.site/)

## Source and download verification

The release tag and all nine application packages use source commit `5942ea519e235a86ed854cdd0ead0c506a281c08`, with source fingerprint `77b78b75fb3a275df633151d1150b449bb57933a1c036c310aa10182e39db941`. Later download-only commits do not change packaged application code.

Windows installer and portable EXE/ZIP, universal macOS DMG/ZIP, Linux x64 AppImage/DEB and the web ZIP are published, alongside the Mac installation guide and combined checksums. All eleven public assets were downloaded in full and independently checked against their expected SHA-256 hashes and byte sizes. Repository ZIP mirrors and their receipts pass `verify-repository-downloads.cjs`.

## Platform and workflow verification

All seven jobs passed: Windows, macOS, Linux, static web, Apple Silicon launch, Intel Mac launch and the combined release bundle. Quality checks include 1,771 tests, browser and file-format workflows, Exchange, accessibility, Resources, native lifecycle, packaged launch, artifact integrity, Electron fuses and checksums. Both Mac architectures and universal signatures were verified.

The release adds project sorting and audiovisual translation for SRT, WebVTT and SBV. Browser coverage exercises local video, live translation captions and subtitle timing. The release checks also corrected the offline test server's asset list and synchronized a Resources test with the save-completion state before opening the add-entry dialog.

## Website verification

The website update was built from Sites source commit `3302ffe00c09aa3ded81d62f6e96d46c322b6a35`. Its bundled release feed contains all current downloads; the page describes project sorting and subtitle editing and announces Gokhan Dogru's GenAI in Localization presentation. Existing public access, download counters and manuals are preserved.

Desktop and 390-pixel mobile checks passed for all nine package choices, both Mac chip options, the guide dialog and the fallback release feed with GitHub unavailable. No page errors, serious/critical automated accessibility violations or horizontal overflow were found. Desktop and mobile screenshots were inspected.

This remains a development preview: Windows is unsigned and macOS is ad-hoc signed without notarization. Passing automated checks does not establish that every workflow is bug-free.

---

# Historical verification: 0.0.4-dev.20261122.1

Verified and published on 22 November 2026.

- [GitHub prerelease](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261122.1)
- [Public downloads website](https://loopcat-downloads.gokhan-dogru.chatgpt.site/)
- [Release manifest: files, byte sizes, SHA-256 hashes and URLs](latest-release.json)
- [Successful all-platform workflow](https://github.com/gokhandogru/LoopCAT/actions/runs/44999817698)

## Source and downloads

All nine application packages were built from commit `c192ec11510f4cef161e21e70f027cd61d2cce84`. The release tag points to that revision. Later download-documentation commits do not change the packaged application code.

Available packages: Windows installer EXE/ZIP and portable EXE/ZIP; universal macOS DMG/ZIP for Apple Silicon and Intel; Linux x64 AppImage/DEB; and web ZIP. The release also includes the current Mac installation guide and `SHA256SUMS.txt`.

The combined CI bundle passed its artifact and checksum checks. All 11 public assets matched GitHub's stored digests and byte sizes, and each asset was downloaded in full and independently hashed. The combined published checksum list covers all nine application packages and the installation guide. The web build receipt matches the tagged source revision.

## Platform verification

All seven jobs passed: Windows, macOS, Linux, static web, Apple Silicon launch, Intel Mac launch, and the combined release bundle. Native checks include 1,760 unit tests, static quality gates, all nine browser suites, Exchange and file-format workflows, automated accessibility, Resources workflows and native window lifecycle, packaged launch, artifact integrity, Electron fuses and checksums. Firefox and WebKit Resources checks passed in the web job. Universal Mac signatures and both architectures were verified.

The release checks exposed and corrected two issues: the browser runner now tests the workspace at a full desktop viewport and waits for nested menu panels before checking keyboard focus; the status filter now has enough space for Catalan labels in the macOS system font. All 60 native Mac locale/font/viewport/theme combinations passed after the width correction.

XLIFF and Statistics verification includes 63 bilingual interchange checks, XLIFF schema validation, native/split word-count agreement for individual files, selected files and project scope, and upgrading an existing import while preserving an edited translation and its archived version. See the [release notes](../docs/releases/0.0.4-dev.20261122.1.md).

## Download website

Sites version 7 was published from source commit `830cabb5b2566f9670d44ae013af334187a4ce66`, preserving the public audience and download counter. The page now describes the modern workspace, XLIFF and Statistics improvements, shows the updated editor, and serves matching English and Arabic online manuals.

Chrome checks at desktop and 390-pixel mobile widths verified all nine package choices against this release. Both Mac package formats and Apple Silicon/Intel choices resolved correctly through the guide-before-download dialog. The bundled release snapshot worked with the GitHub feed unavailable. Local assets, checksum links, installation guide and manual navigation were checked. No JavaScript page errors, serious/critical automated accessibility violations or mobile horizontal overflow were found. Desktop and mobile screenshots were inspected.

## Qualification limits

This remains a development preview. Windows is unsigned; macOS is ad-hoc signed, without Developer ID signing or notarization. Native InDesign rendering remains unverified. Automated checks do not establish that every workflow is bug-free or replace the remaining production qualification checks.

---

## Historical November 15 verification

# LoopCAT 0.0.4-dev.20261115.1 release verification

Verified and published on 15 November 2026.

- [GitHub prerelease](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261115.1)
- [Public downloads website](https://loopcat-downloads.gokhan-dogru.chatgpt.site)
- [Release manifest: filenames, byte sizes, SHA-256 hashes and URLs](latest-release.json)
- [Successful all-platform workflow](https://github.com/gokhandogru/LoopCAT/actions/runs/43723356019)

## Source and downloadable files

All packages were built from commit `e5d1f43e6b7a7eb574c40e0e397a7a22a1c95db8`. The release tag points to that exact revision. Later download-documentation commits do not change the packaged application source.

Nine application packages are available: Windows installer EXE/ZIP and portable EXE/ZIP; universal macOS DMG/ZIP for Apple Silicon and Intel; Linux x64 AppImage/DEB; and the web ZIP. The release also includes the Mac installation guide and `SHA256SUMS.txt`.

The combined CI bundle passed its artifact rules and nine package checksums. All 11 uploaded assets matched GitHub's stored SHA-256 digests and sizes. Every public download was then fetched in full and independently hashed: all 11 matched, including the checksum file and installation guide. The web build receipt also matched the release source commit and ZIP hash.

## Platform and format checks

All seven release jobs passed: Windows, macOS, Linux, static web, Apple Silicon launch, Intel Mac launch, and combined-bundle verification. Desktop jobs included static quality gates, 1,730 unit tests, the nine browser suites, Exchange, file-format and Office/DTP checks, automated accessibility, Resources workflows/native window lifecycle, packaged launch, artifact integrity, Electron fuses and checksums. Universal Mac archive signatures and both architectures were verified. Firefox and WebKit Resources checks passed in the web job.

Release preparation corrected the Resources tablist/status accessibility structure and synchronized platform-specific test inputs. The artifact verifier now checks the current navigation guard while the behavioral desktop-wrapper tests continue to reject non-shell navigation.

Native Word, Excel and PowerPoint fixture evidence and the IDML structural checks are documented in the [Office/DTP report](../docs/office-dtp-formatting-2026-11-15.md). The broader coverage and exclusions are in the [file-format review](../docs/file-format-review-2026-11-15.md).

## Website review

Sites version 6 was published from source commit `dc454c0621ac9c0bf77fa0376beac2d529147e22`, preserving its public audience. The live site was tested in Chrome at desktop and 390-pixel mobile widths, with the GitHub live feed deliberately unavailable to verify the bundled fallback.

All nine package choices selected the November 15 release. Both Mac chip choices resolved to universal packages, and the guide-before-download flow worked. Checksum links, English/Arabic manuals, the Mac guide, release data and scripts returned successful responses. No JavaScript page errors, serious/critical automated accessibility violations or mobile horizontal overflow were found. Desktop and mobile screenshots were inspected.

## Qualification limits

This remains a development preview. Windows is unsigned; macOS is ad-hoc signed but not Developer ID-signed or notarized. Native InDesign rendering remains unverified. Longer translations can wrap or overset, and older ambiguous rich-text projects may require reimport. The Resources two-second cold-load target remains unmet on the reference Windows machine. Automated checks do not replace every manual accessibility, native Safari or production clean-machine qualification check.

The versioned November 6 binary files and `release.json` retained in this directory are historical mirrors. Use `latest-release.json` and the linked GitHub release for current downloads.

---

## Historical November 6 verification

# LoopCAT 0.0.4-dev.20261106.1 download verification

The [desktop release workflow](https://github.com/gokhandogru/LoopCAT/actions/runs/42229298416) built the unsigned development preview from commit `fdcd3d2900e76f010bfa15917a1a4f19c7d7ec0c`. The Windows, macOS, Linux, web, and combined bundle jobs passed. The web job passed on its second attempt after Chrome timed out during startup on the first runner.

Windows also ran the confirmed-segment TM regression using the XLIFF example from issue #10. Updating the active document added five translations. Running the update again found all five in the TM. The project-wide update included the second document.

The [repository manifest](release.json) records the source fingerprint, sizes, and SHA-256 hashes for the web, Windows installer, and Windows portable ZIPs. Each mirror is a byte-for-byte copy of its release asset. Each platform download was checked against its build checksum. The Linux ZIP was extracted and both files were checked against the original AppImage and DEB.

The [GitHub prerelease](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261106.1) includes all ten packages and their SHA-256 checksum list. See the [release notes](../docs/releases/0.0.4-dev.20261106.1.md) for installation details and preview status.
