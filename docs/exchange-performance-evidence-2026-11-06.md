# Exchange performance evidence — 6 November 2026

**Result: the full developer-machine run completed and the release performance gate failed.** The editor persisted all 1,200 measured edits. All ten manually invoked mixed-pack QA scans returned both expected findings and released their Exchange worker. At 10,000 segments the empty-library control exceeded the existing 100 ms input-to-paint ceiling. At 100,000 segments the paired paint ratio for twenty installed but inactive packs was 1.109, above the allowed 1.10. These misses are release follow-up, even where the absolute median for an individual condition looks faster.

## Matched measurements

Each row reports the median of five trial P95s (milliseconds). Ratios are the **median of five within-block ratios** to the corresponding empty-library control; they are not divided column medians. This is why the 100k inactive paint median is slightly under the empty median while the paired ratio exceeds 1.10.

| Segments | Configuration | Input to two frames | Input dispatch | Durable save | Paired paint ratio | Paired save ratio |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 10,000 | Empty library | 261.1 | 21.7 | 639.6 | 1.000 | 1.000 |
| 10,000 | 20 installed, none active | 177.7 | 16.9 | 619.5 | 0.761 | 0.969 |
| 10,000 | 1 active terminology pack | 153.4 | 18.9 | 621.1 | 0.575 | 0.971 |
| 10,000 | 3 terminology + 2 QA packs | 263.6 | 19.7 | 646.8 | 0.989 | 0.994 |
| 100,000 | Empty library | 354.5 | 122.4 | 777.8 | 1.000 | 1.000 |
| 100,000 | 20 installed, none active | 350.5 | 146.8 | 746.7 | 1.109 | 1.047 |
| 100,000 | 1 active terminology pack | 242.7 | 103.0 | 664.8 | 0.698 | 0.855 |
| 100,000 | 3 terminology + 2 QA packs | 258.8 | 117.8 | 737.3 | 0.730 | 0.927 |

The 10k absolute gate requires paint below 100 ms and saves below 2,000 ms. At both scales the relative gate allows at most 10% regression in either metric. The mixed-case manual scan, timed separately from typing, took 0.38–1.57 s at 10k and 3.55–17.09 s at 100k. Per-condition median renderer heap immediately after typing was 22.7–30.9 MB at 10k and 108.0–135.3 MB at 100k (decimal MB). These are observations without forced garbage collection, not whole-process peaks or retained-memory measurements.

## Method and limits

Production assets were built from the development working tree, frozen in memory for the matrix, and identified by SHA-256 `73f4d4073f39740c5932dfc61df80669d04008cab599a4383e05d3d703aeaaa5`. This identifies the test payload rather than a released tag. Windows 10.0.22631, Intel Core i7-8550U, 17,060,913,152 bytes installed RAM, Electron 43.3.0 / Chromium 150.0.7871.212. The run started at 16:11 UTC. Other development and verification work took place on the machine. Observe the variance across the five blocks before attributing a difference to an extension.

The harness served the production renderer entirely on loopback, seeded repeatable English–Turkish projects into private disk-backed browser partitions, then reopened a fresh editor window for each case. Case order rotated across the five matched blocks; the synthetic corpus was reused only within its configuration, with the editable sentinel reset. One warm-up preceded each set of 30 measured input events. An independent database connection checked the exact target text and the editor had to acknowledge the same stored generation before the next edit. Input-to-paint uses two animation frames in offscreen, GPU-disabled Electron; it does not measure physical input-to-display latency. Manual QA was triggered after the typing sample to distinguish review-job duration from interactive latency.

Commands: build the renderer, then run `node scripts/verify-exchange-perf.cjs --large-first` for the full matrix (`node scripts/verify-exchange-perf.cjs` uses the opposite size order). `--smoke` is a short functional check. `--early-fail` can stop an engineering diagnostic after two failed empty-library 10k baselines; it was **not** used for the completed matrix. Raw measurements, including per-edit timings: [full matrix JSON](../output/exchange-performance-mixed-large-first.json). The bounded driver records partial samples and progress on failure.

The matrix alone establishes neither zero idle database/network activity nor absence of memory leaks. It does not qualify every browser, packaged platform, GPU configuration, real-world document or provider. Re-run the same frozen build on an otherwise idle designated machine; separately profile native input dispatch and painting if the empty-library control misses its budget. Investigate a repeatable inactive-only regression with instrumentation before attributing it to pack evaluation. Keep the original thresholds.

## Separate idle and removal probe

After the matrix, `node scripts/verify-exchange-perf.cjs --inactive-probe` exercised the current working renderer (asset SHA-256 `c38bda7d1024a6326a4bfde53dce9a9df25f3c995376d9f71997980ab1f6596d`) at 10k segments. A preboot editor-frame probe counted openings of the Exchange IndexedDB and worker construction/termination. A browser-session request listener observed catalog/pack HTTP requests and would count and block attempts to leave the synthetic loopback origin. Static app-shell JS is not a catalog metadata request. These secondary metrics were **not** collected by the earlier full matrix (except worker counts).

| Configuration | Exchange DB opens | Exchange workers created / still live | Catalog/pack requests | External attempts |
| --- | ---: | ---: | ---: | ---: |
| Empty library | 0 | 0 / 0 | 0 | 0 |
| 20 installed, all inactive | 0 | 0 / 0 | 0 | 0 |
| 1 active (with three explicit QA lifecycle cycles) | 1 | 3 / 0 | 0 | 0 |

Three cycles used the real Library UI to preview QA fixtures, install the example, activate it on the open project, uninstall it, confirm the artifact was absent and close the dialog. Each cycle created one Exchange worker and returned to zero live Exchange workers (one unrelated core worker stayed live). Observed before → after renderer heap in decimal MB: 25.25 → 27.49, 27.49 → 23.18, 23.18 → 22.82. No forced collection, process-peak sample or soak was performed. The behavioral tripwires and lifecycle assertions passed. Its four measured edits per configuration are a smoke sample only; its JSON timing `passed` flag is false and is not used to supersede the full failed timing gate. [Idle/removal JSON](../output/exchange-inactive-probe.json).
