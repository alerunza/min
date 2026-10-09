# Svelto macOS performance baseline

Measured 2026-10-09. This is a baseline of the existing preview, not an optimization or a comparison with another browser.

## Environment

- App source: `76298e6` (macos-baseline), Svelto 0.1.0, Electron 43.4.1, ad hoc signed ARM64 package.
- Machine: Apple M2, 8 GiB RAM, 8 logical CPUs; Mac14,2; macOS 27.0 (26A428).
- Shared working machine; other applications remained open. Their PIDs are excluded, but host contention, compression and filesystem caches are not controlled.
- Initial host load average: [2.40869140625, 2.2275390625, 2.14111328125]. Window content size: 1920 × 984 CSS pixels.
- Main build SHA-256: `560193b221757160e989eda96f03c8807ac9ed03a107214968231bf08549bf85`.

## Startup

Time from spawning the packaged executable to a loaded GUI with a selected tab and toolbar. It includes localhost CDP readiness, connection and polling overhead (25 ms polling). It is not a measured first paint or a Finder/LaunchServices/Gatekeeper launch. Each profile is seeded with the same blank task; fresh profiles have not previously run. OS caches are never flushed.

| Profile | Runs | Median | Range |
| --- | ---: | ---: | ---: |
| Fresh seeded profile | 5 | 589 ms | 542–1975 ms |
| Immediate repeat with same profile | 5 | 557 ms | 544–591 ms |

The first observed fresh-profile launch was 1,975 ms and remains in the data. It cannot establish a cold-cache launch time.

## Loaded-tab idle resources

Three independent profiles per workload; one foreground fixture tab and the others in the background. Every fixture is actually loaded through the browser add-tab flow and checked for its ready marker. Zero means one blank browser tab, not zero browser UI. Each local document has 200 static cards and no timers, media, remote assets or service workers. These are deliberately small pages, not representative heavy websites.

After loading, wait 10 seconds, then take 16 process-tree snapshots across 15 seconds. CPU is computed from user+system CPU-time deltas, summed across the main process and its recursive children. 100% means one logical CPU; the percentage is not normalized to eight CPUs. The observer, fixture server, unrelated Svelto instances and orphaned processes are excluded.

Memory footprint is collected once after each CPU sampling window using macOS `footprint --noCategories -j` for exactly the sampled app PIDs. PID coverage and collection errors are checked. Values are MiB (1,048,576 bytes). RSS is separately summed across processes and may count shared pages multiple times; macOS compression also affects it. Electron documents why RSS alone is unsuitable for interpreting macOS memory: [process memory API](https://www.electronjs.org/docs/latest/api/process#processgetprocessmemoryinfo).

| Loaded documents | Process count | Median footprint | Footprint range | Median summed RSS | Median idle CPU | CPU range |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 5 | 209.5 MiB | 209.3–214.2 MiB | 529.1 MiB | 1.51% | 1.26–1.59% |
| 10 | 15 | 646.0 MiB | 641.7–664.9 MiB | 1324.9 MiB | 0.63% | 0.51–1.13% |
| 30 | 35 | 1453.5 MiB | 1444.7–1482.4 MiB | 2814.0 MiB | 0.57% | 0.51–1.01% |
| 50 | 55 | 2230.6 MiB | 2090.7–2233.4 MiB | 3513.7 MiB | 3.66% | 3.59–4.24% |

Each resource CPU result is the mean of its sampling window; the headline is the median of those three means. Footprint is the median of three end-of-window observations. RSS is the median of each window, then the median across three runs. Workload order alternates ascending/descending between repetitions. No run is discarded.

## All observations

| Repetition | Documents | Footprint MiB | Window median RSS MiB | Window mean CPU |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 209.30 | 515.38 | 1.511% |
| 1 | 10 | 646.02 | 1323.70 | 1.133% |
| 1 | 30 | 1444.75 | 2851.50 | 0.505% |
| 1 | 50 | 2233.42 | 3513.66 | 4.236% |
| 2 | 50 | 2230.60 | 3320.66 | 3.588% |
| 2 | 30 | 1453.45 | 2587.73 | 1.007% |
| 2 | 10 | 664.94 | 1324.90 | 0.507% |
| 2 | 0 | 214.19 | 585.07 | 1.585% |
| 3 | 0 | 209.54 | 529.14 | 1.262% |
| 3 | 10 | 641.68 | 1503.03 | 0.633% |
| 3 | 30 | 1482.42 | 2814.00 | 0.573% |
| 3 | 50 | 2090.65 | 4414.20 | 3.663% |

Startup observations in milliseconds, in repetition order:

- Fresh profile: 1975.1, 542.4, 549.8, 588.9, 615.4.
- Repeat profile: 566.2, 546.0, 556.5, 591.3, 544.3.

## Interpretation and limits

- At 50 loaded documents, median footprint is about 2.18 GiB and the process count is 55. Investigate the cost of retaining background renderers before choosing an optimization; this baseline alone does not prove which subsystem should change.
- Idle CPU with 50 loaded static documents is 3.66% of one logical CPU. Active browsing, scrolling, video, scripting and battery impact are not measured.
- All 22 launches/resource scenarios completed; loaded-tab counts, PID coverage and resource renderer errors were checked. No production browser code was changed for this benchmark. The previously recorded inspector/runtime instability is still open; avoiding the Node inspector here does not demonstrate its resolution.
- No address/input latency, long-session growth/leak, true cold boot, update behavior, thermal/power-controlled test, Intel/Windows, or comparison with Min/Safari/Chrome is covered. Those need separate workloads and matched settings.

## Reproduce

Build the desired commit and explicitly select its executable so an existing output/build-path.txt cannot select an older preview:

```sh
npm run buildMacArm
SVELTO_TEST_EXECUTABLE="$PWD/dist/app/mac-arm64/Svelto.app/Contents/MacOS/Svelto" npm run benchmark:macos
```

The default study uses five fresh/repeat startup pairs and three resource repetitions at 0/10/30/50 documents. Options: `SVELTO_BENCH_STARTUPS`, `SVELTO_BENCH_REPEATS`, `SVELTO_BENCH_COUNTS`, `SVELTO_BENCH_SETTLE_MS`, `SVELTO_BENCH_SAMPLE_SECONDS`, `SVELTO_BENCH_OUTPUT`, and `SVELTO_BENCH_SOURCE_COMMIT` for a staged checkout without Git metadata. Profiles are temporary and deleted after the run; results persist. Native process inspection must be allowed on the host.

Raw observations, per-process RSS/CPU samples, footprint JSON, warnings and environment are saved locally in `output/performance-macos.json` (ignored by Git). The tables above retain every headline observation in the repository. Pilot/calibration runs are separate and excluded.
