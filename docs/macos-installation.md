# Installing LoopCAT on macOS

**LoopCAT development previews are not signed with an Apple Developer ID and are not notarized by Apple.** A local or ad-hoc signature does not establish a verified publisher. Only proceed if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT) and have checked the download.

[Download the plain-text installation guide](../downloads/LoopCAT-macOS-INSTALL.txt) to keep these instructions beside the installer.

**Current release:** `0.0.4-dev.20261109.1 provides universal DMG and ZIP packages for Apple Silicon and Intel.

## Choose the correct architecture

Open **Apple menu → About This Mac**. An Apple chip means Apple Silicon; an Intel processor means an Intel Mac. See [Apple's identification guide](https://support.apple.com/en-us/116943).

| Your Mac | Required download |
| --- | --- |
| Apple Silicon | A macOS asset containing `arm64`, or a universal package |
| Intel | An explicitly labelled macOS `x64` / `x86_64` asset, or a universal package with Intel support |

**The `0.0.4-dev.20261106.1` preview's Mac packages are ARM64 only.** Its `LoopCAT-0.0.4-dev.20261106.1-arm64.dmg` and `LoopCAT-0.0.4-dev.20261106.1-arm64-mac.zip` cannot run on Intel Macs. If your selected release has no Intel package, use the web edition or wait for an Intel build. Re-signing an application cannot change its architecture. Do not infer compatibility from a filename that merely says “Mac”.

## Install and allow the first launch

1. Get a DMG or Mac ZIP from the [official releases](https://github.com/gokhandogru/LoopCAT/releases), plus `SHA256SUMS.txt` from that **same release**. GitHub's automatic **Source code** archives are not installers.
2. In Terminal, type `shasum -a 256 `, including the final space, drag your downloaded DMG or ZIP onto Terminal, then press Return. Compare the complete 64-character hash with the entry for that exact filename. Stop if they differ. Checksums detect mismatches; they do not establish authenticity independently of your download source.
3. Open the DMG, drag `LoopCAT.app` into **Applications**, then eject the disk image. For a ZIP, extract it and move the app into Applications. Launch the installed copy.
4. If macOS says the developer cannot be verified or Apple cannot check the app, dismiss the message. Open **System Settings → Privacy & Security**, find LoopCAT under **Security**, and choose **Open Anyway**. Some versions show **Open** first. Confirm and authenticate when asked. Older macOS versions call this pane **Security & Privacy**.

This creates an exception for the app. The option is normally available for about an hour after a blocked attempt. Organization-managed Macs may require IT assistance. These steps follow [Apple's first-launch guidance](https://support.apple.com/en-gb/102445) and [security override instructions](https://support.apple.com/en-euro/guide/mac-help/mh40617/27/mac/27).

**If macOS explicitly reports malware or says the app will damage your Mac, stop and report the warning.** Do not use the troubleshooting commands to bypass that warning.

## If a verified preview is still blocked or crashes

A security warning, an invalid code signature and an ordinary application crash are different problems. A “quit unexpectedly” message alone does not establish the cause. Start with a fresh download and checksum verification, then close LoopCAT. The paths below assume you installed it as `/Applications/LoopCAT.app`.

### Download quarantine

If the trusted app remains blocked by downloaded-file quarantine after the normal steps, this optional command removes only that attribute from this app:

```sh
xattr -dr com.apple.quarantine "/Applications/LoopCAT.app"
```

This bypasses quarantine for this copy; it is not Apple approval. Do not use `xattr -cr`, which clears unrelated extended attributes as well. Do not disable Gatekeeper or System Integrity Protection system-wide.

### Temporary repair for an older unsigned preview

For a verified legacy preview that says “damaged” or quits at launch, first inspect the signature:

```sh
codesign --verify --deep --strict --verbose=2 "/Applications/LoopCAT.app"
```

If it reports an invalid or missing signature, this local ad-hoc repair may help:

```sh
codesign --force --deep --sign - "/Applications/LoopCAT.app"
codesign --verify --deep --strict --verbose=2 "/Applications/LoopCAT.app"
```

Only try launching again if verification succeeds. This replaces the signatures on your local copy; it does not notarize the app or fix every crash. Do not apply it to a future Developer ID-signed build. If macOS offers to install Command Line Tools, these are Apple's developer tools; you can decline and report the problem instead. If a command fails, including permission errors, stop and report its output instead of adding `sudo`.

Apple reserves recursive signing with `--deep` for temporary repairs and recommends signing nested components individually for distribution. A corrected package is preferable to repeated local repairs. See [Apple's code-signing technical note](https://developer.apple.com/library/archive/technotes/tn2206/) and [distribution signing guidance](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac).

## Report an unresolved problem

Open a [LoopCAT issue](https://github.com/gokhandogru/LoopCAT/issues) with the release version, exact asset filename, Mac chip, macOS version, full warning text and command errors. These optional diagnostics do not modify the app:

```sh
sw_vers
file "/Applications/LoopCAT.app/Contents/MacOS/LoopCAT"
codesign --verify --deep --strict --verbose=2 "/Applications/LoopCAT.app"
```

For crashes, open **Console → Crash Reports**, locate the latest LoopCAT report, and share its **Exception Type** and **Termination Reason**, removing personal paths and project content. For clipped buttons or other layout issues, include a screenshot, window dimensions, display scaling, app zoom, theme and interface language; hide confidential translation content.

## What signing can solve

Distributing outside the Mac App Store is supported. The long-term first-launch solution is a **Developer ID-signed, notarized** release, followed by testing on clean Macs. An ad-hoc signature can make a bundle internally valid without providing publisher identity or notarization. A paid account alone does not repair layout defects or runtime crashes. See [Apple's Developer ID overview](https://developer.apple.com/developer-id/) and [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
