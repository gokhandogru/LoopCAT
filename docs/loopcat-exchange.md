# LoopCAT Exchange

Open **Exchange** in the navigation rail. In a narrow window, choose **Open navigation** first. **Examples** has English–Turkish terminology and QA packs and a frozen translation lesson. All three work without an account, a model download or an API key. **Installed** lists the packs on this device. Search by name, publisher or pack ID, or filter by pack type. The project panel and **Active in this project** label show which packs the current job uses.

## Try a two-translator exchange

1. Open **Exchange → Create**. For terminology, enter terms or import a CSV/TSV list. Select the entries you own or have permission to share. Choose whether recipients may copy individual terms into a personal termbase. For QA, choose a required or forbidden target form, write an explanation, and provide both a triggering example and a legitimate counterexample. Use a unique publisher-prefixed ID. Make a new version when changing a shared pack.
2. **Validate and preview**. Run the bundled examples or rehearse on rows selected in the editor. A preview does not edit a project. **Export pack file** creates a `.loopcat-pack.zip` containing only the selected rows. To carry an unfinished glossary or QA rule set between your own devices, use **Export private author draft** in the editor and **Create → Import private author draft** on the other device. This separate `.loopcat-draft.json` includes excluded rows and cannot be installed as a pack. Importing a private draft opens the form without saving, installing or activating anything.
3. On the recipient’s device, **Examples → Import local pack**. Inspect the publisher, license, contents and exact digest. A local file has no verified publisher identity merely because it names a publisher. Install it, open a project, and explicitly activate it under **Installed**. You can mark a QA pack as a required project check. Keep using an older pinned version on a live job while trying another one elsewhere.
4. Read-only terms appear in **Matches**. Enter inserts an allowed target; open the context menu to copy a permitted term through normal term capture. QA pack findings appear when you run QA. The editor keeps native checks, document reconstruction guards, and the translator's authority over targets.
5. **Disable for this project** removes a pack from that project’s active tools. **Uninstall from this device** removes the installed artifact. Neither erases accepted targets, independently copied terms, TM contributions, or student submissions. Drafts and learner responses have their own delete controls.
6. Project handoffs record pack requirements. On a new device, a recipient can continue editing without those packs. A missing required check is **Not evaluated** in the Passport. Ordinary target exports ask before continuing if a required Exchange check could not run. Acknowledging that warning never overrides native format or reconstruction failures.

When reviewing an update, choose **Compare update** in the new pack’s preview. Use the editor selection to compare both versions on your own segments, or leave the selection empty to compare on the pack examples. The comparison leaves the project’s current version pinned. Activate the new version when you are ready to switch.

## Teaching, teams, and AI

Install the bundled frozen comparison lesson, open the exercise, choose a candidate and record your reasoning before revealing system labels. A learner does not need a translation project. Responses remain under **Lab responses** after uninstall. A research download requires a separate choice; preview the fields, particularly any free-text rationale. The locally distributed reveal key provides classroom blinding, not exam security.

A client kit references exact artifacts, priorities and requirements. Preview conflicts and missing versions before applying it.

An AI workflow starts with the active source segment and language pair. For Ollama, OpenAI and configured OpenAI-compatible providers, you can also select the previous and next source text from the same document (up to 400 characters each), matching native termbase entries (up to 12 pairs with usage status), or both. Each choice applies to the current workflow. Terminology critique additionally sends the active target draft and requires you to select matching native terminology. Exchange term overlays stay on the device. Review the fields, exact provider and model, destination and request limit before approving each destination. A comparison starts after you approve every destination. Live requests can incur charges, and applying a draft takes a separate action. The lesson's optional live comparison sends only the frozen example source and language pair.

## Storage and distribution

Project schema 8 and backup schema 9 carry requirements, not installed dictionaries, participant responses, author drafts, credentials, or device grants. Existing projects, including schema 7 packages and schema 8 backups, remain readable. Older LoopCAT builds must be updated to open these new package versions. Export packs separately, and keep private research responses only where you intend. Clearing the browser profile can delete local data. File-mode storage varies by browser and path; keep a file copy.

See [the pack format](exchange-pack-format-v1.md) for schemas and limits and [catalog and computation qualification](exchange-distribution.md) for signing, advisories and developer-only experiments. Public catalog distribution requires a configured HTTPS source, release trust root and maintainer ceremony. The default checkout does not trust an invented production signer.

## Verification and release decision

See the [20 November preview verification](exchange-verification-20261120.md) for current development evidence and the [fresh paired measurements](exchange-performance-evidence-2026-11-20.md) for the typing and save checks.

- `pnpm verify:exchange`: production renderer checks for pack authoring, sharing, installation, editor use, handoff, removal, direct-file use, and the no-account Lab. It also captures screenshots and checks the library, update comparison, authoring, focus and accessibility in light and dark themes and at 200% zoom in Arabic.
- `pnpm verify:exchange-perf`: paired 10k/100k editor and storage workloads, including inactive packs and mixed active packs. A smoke is diagnostic, not a substitute for the full gate on a quiet reference device.
- `pnpm verify:quality`, `verify:renderer`, `verify:a11y`, `verify:arabic`, `verify:matches`, web and packaged desktop smoke checks remain applicable. Use clean profiles for platform testing.
- Before calling the Exchange ready for public release, record an independent translator's author/share/remove test, an instructor's adaptation of the lesson, reference-device performance results, and verification against newly built platform artifacts. Use the [independent pilot exercises](exchange-pilot.md) to distinguish real reuse from an implementer's demonstration. The compute prototype stays outside the production renderer.
