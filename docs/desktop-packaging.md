# LoopCAT Desktop Packaging

LoopCAT can run as a static browser app, an installable offline web app, or a bundled Electron desktop app.

## Why Electron

Electron is the current desktop packaging path because LoopCAT is already an HTML-first CAT tool. The wrapper keeps the same application code and provides downloadable builds for Windows, macOS, and Linux.

The desktop wrapper:

- loads the bundled app from `loopcat://app/index.html`;
- keeps Node.js disabled in the renderer;
- keeps renderer web security enabled, disables insecure content, Electron webviews, legacy WebSQL, drag-and-drop navigation, Node.js in workers/subframes, and packaged DevTools;
- starts with hardware acceleration disabled before renderer startup to reduce driver/GPU launch failures on managed desktops;
- uses a platform-aware Chromium sandbox policy: macOS and Linux default to Chromium's renderer OS sandbox, while Windows starts Chromium with no-sandbox launch mode because managed Windows desktops can fail renderer startup with `launch-failed`; in every mode Node.js remains disabled and context isolation remains enabled;
- keeps top-level navigation pinned to the bundled `index.html` app shell;
- serves the bundled app shell from packaged files through `loopcat://app/`;
- keeps service workers disabled on the private desktop protocol; browser/PWA service-worker caching is tested separately on an HTTP origin and must cache the complete core app shell before activation;
- blocks renderer network requests except bundled app-shell files, the exact OpenAI Responses and Models API endpoints, Azure OpenAI resource-domain `/openai/v1/models`, `/openai/v1/responses`, and `/openai/v1/chat/completions` paths, Gemini `/v1beta/models` and `/v1beta/interactions`, Anthropic `/v1/models` and `/v1/messages`, Cohere `/v1/models` and `/v2/chat`, hosted Ollama `/api/tags` and `/api/chat`, local OPUS-CAT `MTRestService` actions on port `8500`, and exact native or OpenAI-compatible model-list/chat-completion paths for DeepSeek, Mistral AI, xAI, Perplexity Sonar, Groq, Together AI, OpenRouter, Hugging Face Inference Providers, DeepInfra, and Fireworks AI, matching the browser CSP;
- denies renderer-created popup windows and blocks system-browser external opens by default;
- allows renderer network requests to explicit local AI loopback API paths for Ollama, OPUS-CAT, and OpenAI-compatible runtimes, while keeping other HTTP requests blocked;
- keeps local project data in the app's browser profile storage.

## Developer Run

Install dependencies once:

```bash
pnpm install
```

Before producing release artifacts, commit the generated `pnpm-lock.yaml`. The desktop release workflow uses `pnpm install --frozen-lockfile`, so it intentionally fails when the lockfile is missing or stale.

Run the desktop app:

```bash
pnpm run desktop
```

## Distribution Builds

Verify the checkout provenance before building. Public tag releases must use the matching `v<package.json version>` tag; internal release-candidate builds can use the same check in untagged mode:

```bash
pnpm run verify:provenance -- --allow-untagged
```

This check fails before packaging if `.git` is missing, `.git/HEAD` is missing, the checkout is dirty, or the checked-out commit does not match the release tag or CI SHA.

Run the release contract verifier first:

```bash
pnpm run verify:release
```

Validate the XLIFF 2.2 fixture and a live generated handoff against the vendored OASIS schema:

```bash
pnpm run verify:xliff22-schema
```

Verify the desktop protocol wrapper and renderer hardening flags:

```bash
pnpm run verify:desktop-wrapper
```

Verify that the current platform has the signing or notarization inputs needed for a public release:

```bash
pnpm run verify:signing-env -- win
pnpm run verify:signing-env -- mac
pnpm run verify:signing-env -- linux
```

Run the full browser test suite in a hidden Electron window:

```bash
pnpm run verify:browser-runner
```

The hidden browser runner sets an automation-only Chromium `--no-sandbox` mode by default because some CI or managed desktop sessions cannot launch Chromium's OS sandbox. The desktop wrapper keeps Node.js disabled, context isolation enabled, and the private protocol/network allowlists in force on every platform; macOS and Linux use Chromium's renderer OS sandbox by default, while Windows uses Chromium no-sandbox launch mode by default to avoid `launch-failed` startup errors seen on managed PCs. Set `LOOPCAT_DESKTOP_NO_SANDBOX=0` plus `LOOPCAT_DESKTOP_RENDERER_SANDBOX=1` to force sandboxed-renderer verification on Windows, or `LOOPCAT_DESKTOP_RENDERER_SANDBOX=0` to disable renderer sandboxing elsewhere for diagnostics. Packaged desktop smoke is strict by default and should prove the normal app launch path; it reports when the current platform launched with Chromium no-sandbox mode, without the renderer OS sandbox, or with a fallback. If a managed test host blocks Chromium's sandbox before the normal app can run, set `LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX=1` only as a diagnostic fallback to separate host launch problems from LoopCAT app logic; do not treat that diagnostic mode as public release launch evidence.

Build unpacked app folders:

```bash
pnpm run pack
```

Verify the packaged app payload. This checks the files inside `app.asar`, including runtime assets referenced by `index.html`, browser service-worker cache entries, desktop protocol allowlist entries, exact matches for bundled source/docs files, CSP/network policy, integrity metadata, and accidental test/debug files:

```bash
pnpm run verify:artifact
```

Verify the public download artifacts for the platform. This fails if the build produced only an unpacked app folder, if the expected public download files are missing, if a public artifact is unrealistically small after an interrupted or failed build, or if duplicate artifacts make the release download set ambiguous:

```bash
pnpm run verify:download-artifacts -- win
pnpm run verify:download-artifacts -- mac
pnpm run verify:download-artifacts -- linux
```

After collecting the Windows, macOS, and Linux public download files into one release folder, verify the combined bundle before publication:

```bash
pnpm run verify:download-bundle
```

Verify platform authenticity after packaging. Windows checks Authenticode signatures on the downloadable `.exe` files; macOS checks Developer ID signing, stapled notarization tickets, Gatekeeper assessment, and the app bundle inside the `.zip`; Linux confirms the expected download files are present and relies on the checksum gate below:

```bash
pnpm run verify:platform-signatures -- win
pnpm run verify:platform-signatures -- mac
pnpm run verify:platform-signatures -- linux
```

Build installable artifacts for the current platform:

```bash
pnpm run dist
```

Launch the unpacked packaged desktop app in hidden smoke mode and verify the bundled `loopcat://app/index.html` shell renders, serves packaged app-shell assets through the private protocol, blocks test pages from that protocol, can write/read/delete a local IndexedDB record, can create a real project, save segment targets, rebuild packaged HTML, XLIFF, and target DOCX exports from imported source structure, generate a bilingual DOCX, export a backup containing saved targets, read targets back, and clean up in an isolated temporary profile:

```bash
pnpm run verify:desktop-smoke
```

Generate SHA-256 checksums for the public download artifacts in `dist/`, excluding unpacked app folders, blockmaps, and builder debug files. Public artifact filenames must match the expected LoopCAT release names and include the current `package.json` version; stale-version, undersized, or unexpected desktop-like public downloads cause checksum generation and verification to fail:

```bash
pnpm run checksums
```

Verify the checksum file against `dist/`:

```bash
pnpm run verify:checksums
```

Checksums are written to `dist/SHA256SUMS.txt`.

After the current web bundle and Windows installer/portable ZIPs have all passed their artifact and checksum checks, refresh the installable copies tracked in the repository:

```bash
pnpm run downloads:prepare
```

This copies the three versioned ZIPs into `downloads/`, removes superseded generated downloads from that directory, writes the repository-facing SHA-256 checksum list, and updates `downloads/README.md`. Commit those generated files only when intentionally publishing a repository download mirror.

Validate a completed release evidence copy before publishing. With no file argument, the command checks that the reusable template still contains the required sections and checks. For a release candidate, compare the completed evidence against the generated checksum file:

```bash
pnpm run verify:evidence -- path/to/completed-release-evidence.md --checksum-file dist/SHA256SUMS.txt
```

Self-test the release evidence verifier so the release gate proves incomplete, failed, not-applicable signing, online-mode, and secret-bearing evidence are rejected:

```bash
pnpm run verify:evidence-selftest
```

Self-test the release provenance verifier so missing `.git`, empty `.git`, invalid worktree gitdir files, missing linked gitdirs, and missing Git executables fail clearly before release packaging:

```bash
pnpm run verify:provenance-selftest
```

Self-test the download artifact naming and checksum rules so the release gate proves unexpected source/debug archives, duplicate public artifacts, truncated public downloads, and bad checksum entries are rejected:

```bash
pnpm run verify:download-artifacts-selftest
```

Self-test the platform signature artifact selection rules so the release gate proves unexpected source/debug-like public downloads and duplicate expected artifacts are rejected before platform signing or notarization tools run:

```bash
pnpm run verify:platform-signatures-selftest
```

Platform-specific commands:

```bash
pnpm run dist:win
pnpm run dist:mac
pnpm run dist:linux
```

Run each platform command on the matching operating system. The build wrapper refuses macOS packaging outside macOS, Linux packaging outside Linux, and Windows packaging outside Windows before it cleans `dist/`, so a wrong-host probe cannot disturb a valid release folder.

Artifacts are written to `dist/`.

The GitHub Actions workflow in `.github/workflows/desktop-release.yml` builds the same desktop artifacts on Windows, macOS, and Linux when run manually or when a `v*` tag is pushed. Each platform job uploads only public download files plus its platform checksum file; Windows jobs also pick up optional installer and portable ZIP wrappers when they are present. Unpacked app folders and builder debug sidecars are retained only inside the job workspace for verification. The final `release-bundle` job downloads all platform artifacts, runs `pnpm run verify:download-bundle -- --dist release-dist`, removes nested platform checksum sidecars while generating a combined `SHA256SUMS.txt`, verifies the combined file, and uploads the `LoopCAT-All-Platforms` artifact for publication.

The Linux workflow job installs `xvfb`, Ruby, `fpm`, `rpm`, `libarchive-tools`, and the available `libfuse2` package before packaging so Electron Builder can produce both `.AppImage` and `.deb` downloads on the Ubuntu runner.

For a manual Ubuntu release host, prepare the same dependencies before `pnpm run dist:linux`:

```bash
sudo apt-get install -y xvfb ruby ruby-dev build-essential rpm libarchive-tools
sudo apt-get install -y libfuse2 || sudo apt-get install -y libfuse2t64
sudo gem install --no-document fpm
```

The desktop build scripts run through `scripts/build-desktop.cjs`, which keeps Electron and Electron Builder caches under `.cache/` inside the project unless explicit cache environment variables are already set. This avoids local packaging failures on machines where the default OS cache folder is locked down. The wrapper also creates a workspace build lock before it cleans or writes `dist/`, so do not run multiple platform packaging commands at the same time in one checkout; use separate CI runners or separate worktrees for parallel platform builds. If a packaging process is interrupted, the next run checks whether the recorded lock owner is still alive and recovers abandoned locks immediately; `LOOPCAT_BUILD_LOCK_STALE_MS` remains available for age-based recovery. After packaging, the wrapper removes Electron Builder debug sidecars such as `builder-debug.yml` so the release folder contains only unpacked smoke folders, public downloads, blockmaps, and checksum files.

## Release Gate

Before publishing desktop builds:

- commit `pnpm-lock.yaml` and use `pnpm install --frozen-lockfile` for release builds;
- run `pnpm run verify:provenance -- --allow-untagged` before packaging so dirty, mismatched, or metadata-incomplete release checkouts are rejected;
- run `pnpm run verify:release`;
- run `pnpm run verify:xliff22-schema` so both the XLIFF 2.2 fixture and live generated handoff pass the vendored OASIS Core schema;
- run `pnpm run verify:provenance-selftest` so missing Git executables and missing or incomplete Git metadata rejection are tested before packaging;
- run `pnpm run verify:browser-runner` to execute the browser test suite, including the app workflow and large-project fixture;
- run `pnpm run verify:desktop-wrapper` to confirm the private desktop protocol exposes only the bundled runtime files and the desktop network gate blocks unapproved renderer requests;
- run `pnpm run verify:evidence-selftest` so completed release evidence validation is tested against both publishable and intentionally bad evidence;
- run `pnpm run verify:download-artifacts-selftest` so public artifact naming, duplicate-artifact, and checksum-entry rejection are tested before packaging;
- run `pnpm run verify:platform-signatures-selftest` so signature/notarization artifact selection rejects unexpected source/debug-like downloads and duplicate public artifacts before packaging;
- run `pnpm run verify:signing-env -- win`, `-- mac`, or `-- linux` before platform packaging so missing public-release credentials are caught before artifact generation;
- confirm `package.json`, `manifest.webmanifest`, and `service-worker.js` share the same release version so offline users receive the updated app shell;
- run `test-runner.html` in a Chromium browser when doing manual QA, or use `pnpm run verify:browser-runner` for the automated hidden-Electron gate;
- confirm the large-project test covers thousands of segments before shipping translator-facing builds;
- run `pnpm run verify:artifact` after packaging to inspect bundled runtime assets, browser service-worker cache entries, desktop protocol entries, current source/docs freshness, CSP/network policy, integrity metadata, and accidental test/debug files;
- run `pnpm run verify:download-artifacts -- win`, `-- mac`, or `-- linux` after packaging so the platform build proves it produced the expected public download files, not only an unpacked app folder;
- run `pnpm run verify:download-bundle` after collecting the platform artifacts so the final public release folder proves Windows, macOS, and Linux downloads are all present;
- run `pnpm run verify:platform-signatures -- win`, `-- mac`, or `-- linux` after packaging so Windows signatures, macOS signing/notarization, and Linux checksum-based release expectations are checked before publication;
- run the app with `pnpm run desktop` and create/import/export a small project;
- confirm a project package can be exported and re-imported;
- confirm a browser backup contains the latest typed target text;
- confirm the workspace repair action can rebuild `loopcat-workspace.json` from existing project package folders;
- confirm connected workspace-folder edits show an unsaved package warning before close and clear it after package save;
- confirm no remote scripts or CDN styles are used;
- build on each target OS, not only on the development machine.
- on Linux runners, install the packaging toolchain (`xvfb`, Ruby, `fpm`, `rpm`, `libarchive-tools`, and `libfuse2` or `libfuse2t64`) before running `pnpm run dist:linux`;
- run `pnpm run verify:desktop-smoke` after platform packaging so the unpacked desktop app proves it can launch, render the bundled app shell, serve packaged app-shell assets through the private protocol, block test pages from that protocol, persist real project/segment data, rebuild HTML, XLIFF, and target DOCX exports, generate bilingual DOCX output, and export a backup containing saved targets inside a temporary profile;
- generate `dist/SHA256SUMS.txt` with `pnpm run checksums` for the expected public download artifacts and keep it with the uploaded artifacts.
- run `pnpm run verify:checksums` so stale, unexpected, or incomplete public-artifact checksum files are rejected before upload.
- run `pnpm run downloads:prepare` after the verified web and Windows builds when the current prerelease also needs a versioned repository download mirror.
- complete a copy of `docs/release-smoke-evidence-template.md` and run `pnpm run verify:evidence -- path/to/completed-release-evidence.md --checksum-file dist/SHA256SUMS.txt` so placeholders, failed checks, checksum mismatches, and private local details are rejected before publication.

## Platform Signing And Notarization

Unsigned artifacts are useful for internal testing, but public desktop releases should be signed before distribution.

Windows release requirements:

- buy or provision an Authenticode code-signing certificate for the publisher;
- keep the certificate private and inject it only in the release environment;
- configure Electron Builder with `CSC_LINK` plus `CSC_KEY_PASSWORD`, or with the Windows-specific `WIN_CSC_LINK` plus `WIN_CSC_KEY_PASSWORD`;
- sign both installer and portable artifacts where applicable;
- verify the downloaded artifact on a clean Windows machine before publication;
- confirm SmartScreen reputation behavior and document any first-run warning while reputation is building.

macOS release requirements:

- enroll the publisher in the Apple Developer Program;
- sign with a Developer ID Application certificate through `CSC_LINK` plus `CSC_KEY_PASSWORD`;
- notarize the `.dmg` and `.zip` artifacts with one complete Electron Builder notarization credential set: `APPLE_API_KEY` plus `APPLE_API_KEY_ID` plus `APPLE_API_ISSUER`, `APPLE_ID` plus `APPLE_APP_SPECIFIC_PASSWORD`, or `APPLE_KEYCHAIN` plus `APPLE_KEYCHAIN_PROFILE`;
- staple notarization tickets before upload;
- verify Gatekeeper launch on a clean macOS machine without developer overrides;
- confirm the app can still write browser-profile storage and user-selected workspace folders after signing.

Linux release requirements:

- publish checksums for `.AppImage` and `.deb` artifacts;
- verify the AppImage runs without installation on a clean desktop session;
- verify the Debian package installs, launches, upgrades, and removes cleanly.

Never store signing certificates, Apple credentials, API tokens, or notarization credentials in project packages, backups, reports, or source-controlled files.

The release workflow passes the signing and notarization secret names through to Electron Builder, and `pnpm run verify:signing-env -- <platform>` fails if the selected platform is missing a complete credential set. The verifier prints only missing variable names; it never prints secret values.

Run `pnpm run verify:signing-env-selftest` before packaging to prove the signing-environment verifier accepts complete Windows/macOS credential sets, rejects partial or whitespace-only sets, treats Linux as checksum-gated, and does not print secret values.

## Clean-Machine Smoke Matrix

Run this matrix for every release candidate on Windows, macOS, and Linux:

Copy `docs/release-smoke-evidence-template.md` for the release candidate and keep the completed evidence with the release notes or signed artifact records.

Before publication, run `pnpm run verify:evidence -- path/to/completed-release-evidence.md --checksum-file dist/SHA256SUMS.txt` on that completed copy. The verifier requires every required automated, platform, storage, signing, and upgrade check to pass, rejects unreplaced placeholders such as `pass / fail`, requires platform smoke artifact-tested fields to use the expected choices (`NSIS installer` or `portable`, `DMG` or `ZIP`, `AppImage` or `DEB`), requires separate launch evidence for the Windows installer, Windows portable app, macOS DMG, macOS ZIP, Linux AppImage, and Linux DEB, and scans the evidence for secrets, account emails, and local private paths. The release-candidate version in the completed evidence must match `package.json`, the commit/tag must be either a concrete commit SHA or the matching release tag, the artifact source must name the versioned artifact bundle, artifact checksum evidence must name each public download with its SHA-256 hash, and the checksum-file comparison must match the generated `SHA256SUMS.txt`. The release date must be a valid `YYYY-MM-DD` date that is not in the future. Public all-platform release evidence cannot mark Windows signing, macOS signing/notarization, Gatekeeper launch, per-artifact launch evidence, or Linux checksum publication as not applicable. If the release decision is `Ship`, required follow-up before ship must be `None`, and accepted residual risks must not name unresolved release blockers such as data loss, broken import/export, online-only behavior, unsigned artifacts, missing notarization, failed clean-machine launch, or missing artifacts.

- launch the app with internet disabled;
- create a project and import DOCX, XLIFF, Markdown, CSV/TSV, Android XML, iOS strings, and HTML smoke files;
- type targets in at least five segments, close the app, reopen, and confirm targets are still present;
- connect a workspace folder, save the project package, close and reopen, and confirm no dirty warning appears;
- edit again without saving the package, close and reopen, and confirm the recovery warning appears;
- export target DOCX, current localization file, XLIFF, bilingual DOCX, normal report, anonymized report, and project package;
- import the exported project package as a copy and confirm segments, resources, comments, review state, and activity history survive;
- restore a browser backup into a fresh profile and confirm the same project can be opened and exported;
- run QA with a missing tag and forbidden term fixture, then confirm delivery export is blocked until fixed;
- run a large project fixture and confirm typing remains responsive enough for real post-editing work.
- run the packaged desktop smoke on the release artifact before manual smoke so a broken wrapper launch is caught before human testing begins.

## Storage Failure Checks

`workspace-storage-test.html` now covers simulated project-package, resource-index, manifest, and backup-manifest write failures, a non-blocking `validation-report.json` sidecar write failure, visible project and backup files that remain countable when manifest updates fail or go stale, stale project/backup manifest refs after visible files are removed, empty project folders that are ignored when no package file exists, plus unreadable workspace package warnings after recovery. Keep these automated checks green before running the operating-system checks below.

Run these manually because they depend on operating-system behavior:

- choose a read-only workspace folder and confirm package save reports a failure without losing browser-cache edits;
- remove write permission from an existing workspace folder and confirm the app keeps edits dirty instead of claiming a successful save;
- simulate a full or quota-limited disk and confirm package save, backup export, and resource export fail visibly;
- delete `loopcat-workspace.json` while project package folders remain, then run repair and confirm the manifest is rebuilt;
- corrupt one project package in the workspace folder and confirm sync skips that package with a validation warning.

## Upgrade And Migration Checklist

Before replacing a published release:

- keep storage schema changes backward compatible or add explicit migration code;
- import a package and backup produced by the previous public release;
- open a previous-release workspace folder and confirm existing packages still sync;
- confirm secret stripping still removes API keys, bearer tokens, authorization headers, and passwords from packages and backups;
- confirm the service worker cache version changed with the app version so offline users receive the new files;
- keep a rollback artifact for each platform until the new release has been smoke tested by at least one real user.

## Current Limitations

The repository now defines automated gates for packaging, download-file presence, signatures, notarization, checksums, and release evidence. A production public release still needs:

- signing certificates and notarization credentials configured in the release environment;
- clean-machine smoke results recorded for Windows, macOS, and Linux for each public release;
- disk-full and permission-denied results recorded for workspace-folder saves;
- broader real-world fixture libraries for DOCX and IDML-style publishing formats.
