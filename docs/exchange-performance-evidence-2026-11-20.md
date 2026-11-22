# Exchange performance investigation — 20 November 2026

The fresh Windows baseline reproduced the old typing latency failure. A four-edit 10k smoke measured an empty-library input-to-two-frames P95 of **244.9 ms**; a separate 30-edit CPU diagnostic measured **252.5 ms**. The established 100 ms threshold has not changed. The CPU profile identified core UI work that ran even with no Exchange packs installed. No autosave delay, durable-write acknowledgment, conflict check, or performance limit was relaxed.

## Demonstrated costs and changes

`i18n.js` previously scheduled a complete `document.body` localization pass for every observed text, child-list, or translatable-attribute mutation. The profile recorded 6,560 self samples in localization helpers out of 22,429 total samples, including 10,651 idle samples. Most of the localized text was unrelated to the edit. The revised observer batches inserted/changed subtrees and individual attribute targets, deduplicates nested roots, ignores removed nodes, and leaves translator-authored editing surfaces alone. Locale changes still perform a complete pass. Cached translations are invalidated when a catalog is replaced, even when the locale identifier stays the same.

The CPU diagnostic spans fixture initialization, editor opening and 30 edits. Its sample counts identify hot paths; they are not a per-keystroke CPU percentage. The timing matrix separately measures only the edit/save loop.

`statistics-controller.js` also synchronized segment selection on every session update, including progress and dirty-summary changes produced while typing. That rebuilt a whole-project ID set and refreshed the selection toolbar. The revised binding synchronizes when the segment array or project changes. It watches the stable visible-index result so edits which change filter membership still refresh the select-all indicator. Target text, revisions, storage writes and user selection remain authoritative in their existing stores.

The first post-fix smoke measured **37.7 ms** for the 10k empty control, **30.2 ms** with 20 inactive packs and **31.2 ms** with one active terminology pack. These four-edit observations demonstrated the direction of improvement; they are not the five-block gate result.

## Measurement contract

The existing matrix uses 10,000 and 100,000 synthetic English–Turkish segments, four configurations (empty, 20 installed but inactive, one active terminology pack, three active terminology plus two QA packs), five rotating matched blocks, and 30 acknowledged edits after one warm-up per condition. Thus a complete matrix contains 1,200 measured edits. The pack fixtures are copies of the bundled small examples: three terms or two QA rules per pack. This is not a maximum-size terminology stress test. Each condition has private temporary disk-backed Chromium storage and each block opens a fresh editor. Production assets are frozen in memory for the run and hashed. Synthetic seeding is outside the timing interval; edits run through the real editor, ownership and autosave paths. Each save is independently read from IndexedDB and must have the same stored generation acknowledged by the editor before the next input.

The gates remain: every 10k trial P95 below 100 ms for paint and 2,000 ms for save, and median within-block ratios no greater than 1.10 for paint and save at both sizes. Ratios are medians of paired ratios, not ratios of column medians. Paint is the existing two-animation-frame proxy in 1280×900 offscreen, GPU-disabled Electron at 60 fps. No claim about physical keyboard-to-display latency is made. The mixed configuration separately runs manual QA over the whole project and checks the two expected findings and worker termination.

The runner now offers `--profile --10k-only` for a 30-edit empty-control CPU diagnostic. Profiling is explicitly not certification. Existing `--smoke`, `--inactive-probe`, `--10k-only`, `--large-first` and `--early-fail` retain their meanings. The launcher has a bounded overall timeout. Temporary-profile cleanup was moved out of Electron's exit handler and into the launcher after browser shutdown to avoid deleting a locked Chromium profile on Windows.

## Fresh matrix and reliability evidence

**The full frozen development matrix completed and passed all six comparisons.** All 1,200 measured edits were acknowledged durably, all ten mixed-pack QA scans returned the two expected findings, and no Exchange worker remained live. The following values are medians of five trial P95s, in milliseconds; heap is the median observed post-typing renderer heap in decimal MB.

The slowest individual 10k trial P95 was 35.6 ms for paint and 488.1 ms for durable save, both within the original absolute limits.

| Segments | Configuration | Paint P95 | Dispatch P95 | Save P95 | Paired paint ratio | Paired save ratio | Observed heap MB |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | Empty | 31.9 | 7.3 | 483.6 | 1.000 | 1.000 | 17.9 |
| 10,000 | 20 inactive | 30.7 | 8.1 | 482.1 | 0.947 | 0.999 | 21.4 |
| 10,000 | 1 terminology | 31.4 | 6.0 | 479.8 | 1.020 | 0.990 | 21.0 |
| 10,000 | 3 terminology + 2 QA | 31.9 | 7.1 | 478.6 | 1.000 | 0.990 | 19.6 |
| 100,000 | Empty | 31.7 | 8.8 | 482.9 | 1.000 | 1.000 | 95.0 |
| 100,000 | 20 inactive | 32.4 | 9.1 | 481.4 | 0.994 | 1.002 | 98.0 |
| 100,000 | 1 terminology | 31.6 | 10.3 | 479.8 | 1.000 | 1.003 | 101.8 |
| 100,000 | 3 terminology + 2 QA | 31.5 | 9.1 | 482.5 | 1.000 | 0.990 | 95.9 |

The separately timed whole-project mixed QA scans took 266.9–623.4 ms at 10k and 2,933.6–6,467.4 ms at 100k. Every empty/inactive editor trial recorded zero Exchange database opens, zero Exchange workers created and zero catalog/pack or external request attempts. The three active terminology packs contributed the expected read-only term hits. These observations distinguish the earlier core UI bottleneck from Exchange evaluator activity.

All paired ratios, with the corresponding empty control P95s (paint/save in ms), are retained below. A few individual ratios exceed 1.10; the existing relative gate uses the median of five paired ratios and has not been changed.

| Segments | Block | Empty paint/save | Inactive paint/save ratio | One paint/save ratio | Mixed paint/save ratio |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 1 | 34.9 / 481.6 | 0.948 / 1.002 | 1.020 / 1.008 | 0.968 / 0.994 |
| 10,000 | 2 | 30.2 / 483.6 | 1.043 / 0.993 | 1.040 / 0.987 | 1.036 / 0.990 |
| 10,000 | 3 | 32.7 / 484.2 | 0.939 / 0.992 | 0.911 / 0.987 | 0.969 / 0.988 |
| 10,000 | 4 | 31.2 / 482.0 | 0.946 / 1.000 | 1.022 / 0.995 | 1.051 / 1.000 |
| 10,000 | 5 | 31.9 / 488.1 | 0.947 / 0.999 | 0.981 / 0.990 | 1.000 / 0.980 |
| 100,000 | 1 | 32.8 / 495.0 | 0.994 / 0.964 | 1.009 / 0.967 | 1.143 / 0.975 |
| 100,000 | 2 | 31.5 / 482.9 | 1.029 / 0.998 | 0.937 / 0.986 | 1.019 / 0.990 |
| 100,000 | 3 | 33.1 / 478.5 | 0.873 / 1.002 | 0.955 / 1.003 | 0.952 / 1.011 |
| 100,000 | 4 | 31.0 / 479.3 | 0.955 / 1.004 | 1.000 / 1.008 | 1.000 / 0.998 |
| 100,000 | 5 | 31.7 / 488.8 | 1.032 / 1.066 | 1.117 / 1.008 | 0.921 / 0.988 |

The matrix used the earlier launcher: after it wrote `complete:true`, `passed:true` and the passing gate message, its Electron process stalled during exit and was stopped explicitly. This does not invalidate the completed timing samples, but it is a separate runner reliability defect. The revised launcher exited normally with code 0 for both the final profile and the final probe below; cleanup now runs after Chromium releases the profile.

## Final-build profile and lifecycle probe

Both follow-ups used final renderer SHA-256 `f03dafd689f4113349dcd8891f9cdfa77d129aa207a15a29c001d81f61e11d54`, including the later correctness guards listed below. `node scripts/verify-exchange-perf.cjs --profile` completed 30 acknowledged empty-library edits at each size with CPU profiling enabled:

| Segments | Paint P95 ms | Dispatch P95 ms | Durable save P95 ms | Exchange DB opens / workers created / external requests |
| ---: | ---: | ---: | ---: | --- |
| 10,000 | 33.0 | 6.6 | 479.3 | 0 / 0 / 0 |
| 100,000 | 51.1 | 10.0 | 478.0 | 0 / 0 / 0 |

The final 10k profile recorded 265 localization self samples (17,405 total, 13,400 idle), compared with 6,560 in the baseline diagnostic. This remains a whole-diagnostic attribution, not a per-edit percentage. The final diagnostic verifies fast typing with the added guards at both scales. It has no active-pack comparisons, so it is not a second matched performance certification; its JSON `passed:false` deliberately marks the profiling mode as ineligible for a gate pass.

`node scripts/verify-exchange-perf.cjs --inactive-probe` then passed every behavioral assertion through the ordinary UI. Its editor-frame and session transport counters were:

| Configuration | Exchange DB opens | Exchange workers created / live at end | Catalog/pack requests | External attempts |
| --- | ---: | ---: | ---: | ---: |
| Empty | 0 | 0 / 0 | 0 | 0 |
| 20 installed, none active | 0 | 0 / 0 | 0 | 0 |
| 1 active, then three explicit QA install/remove cycles | 1 | 3 / 0 | 0 | 0 |

Each cycle opened the example, ran its fixtures, installed it, activated it on the current project, uninstalled it, verified the artifact was absent and closed the dialog. Observed heap before → after each cycle was 23.23 → 20.11 MB, 20.12 → 24.51 MB and 24.51 → 28.86 MB. Each cycle created one Exchange worker and returned to zero live Exchange workers; one unrelated core worker remained. These three samples, without forced garbage collection or a soak, do not establish absence of memory leaks.

The same real-DOM probe switched into a synthetic Arabic locale, localized inserted text and explicit attribute keys, changed text beneath an existing explicit key, replaced a catalog under the same locale, and restored the original locale. Dynamic mutations caused four scoped tree passes and zero whole-shell passes. Translator-authored text and the real current draft were preserved. Full locale changes still deliberately scan the shell.

The probe also records four-edit timing observations: paint P95 27.8 / 33.3 / 30.5 ms and save P95 478.1 / 515.9 / 630.7 ms for empty / inactive / one active. Its timing `passed` flag is **false** because the tiny sample's relative ratios exceed 1.10. This smoke run is not the five-pair timing gate, and its successful behavioral assertions do not turn those ratios into a pass. The completed matrix above passed on its frozen snapshot; final-build relative performance still warrants the unchanged full matrix on the designated quiet reference device before public qualification.

## Reproducibility and qualification limits

The starting checkout was `1b65d93`; this is an evolving, uncommitted development snapshot. The baseline CPU diagnostic used renderer asset SHA-256 `3ca11d3385ffe742bb8a178b55b313617246ef594a5e3ab01fe2d53207198dd7`; the initial post-fix smoke used `4b42143a68f7c69c03d83e06c3f8f4d552860b6d77130cc31a91bc7bf97cff87`. The full matrix freezes `ffc75c6249ec3d0a28e28be102cdd6d61c14c3e8276088c3b0dd82aee464e08f`. Later hot-path correctness guards invalidate cached translations on same-locale catalog replacement, preserve explicit text/attribute localization keys when descendants change, and refresh selection controls when typing changes filter membership. UI/catalog polish also continued after this freeze. The final profile/probe identify their build separately and cover these guards without claiming another full matched matrix.

Host: Windows 10.0.22631, Intel Core i7-8550U at 1.80 GHz, 17,060,913,152 bytes RAM, Electron 43.3.0 / Chromium 150.0.7871.212. Other development and normal desktop processes exist. This is local engineering evidence, not a clean reference-machine or signed release qualification. Heap values are observed without forced collection; worker counts concern JS workers in the editor frame, not total OS processes. Cross-platform and independent translator trials remain separate.

Raw local artifacts (under ignored `output/`, retain with any offline evidence bundle): [baseline smoke](../output/exchange-performance-smoke-2026-11-20T16-26-40-005Z.json), [baseline CPU diagnostic](../output/exchange-performance-profile-2026-11-20T16-29-26-280Z.json), [baseline Chrome CPU profile](../output/exchange-performance-profile-2026-11-20T16-29-26-280Z-10000.cpuprofile), [baseline localization source](../output/i18n-baseline-1b65d93.js), [full matrix](../output/exchange-performance-mixed-large-first.json). The historical [6 November evidence](exchange-performance-evidence-2026-11-06.md) remains intact.

Final-build artifacts: [30-edit profiles at both sizes](../output/exchange-performance-profile.json), [10k Chrome profile](../output/exchange-performance-profile-10000.cpuprofile), [100k Chrome profile](../output/exchange-performance-profile-100000.cpuprofile), [inactive/removal/localization probe](../output/exchange-inactive-probe.json). Regression coverage is in `tests/unit/i18n-mutation-scope.test.cjs` and `tests/unit/segment-selection-session.test.cjs`; focused Arabic and Exchange locale tests, ESLint, formatting, type checking and import boundaries passed during this work. The repository-wide final suite is recorded separately by the integration owner.
