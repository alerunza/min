# Svelto macOS background-tab memory

Measured 2026-10-09–10 (Europe/Rome) on app source `76298e6`, Svelto 0.1.0 / Electron 43.4.1. This profiles the existing app; no production optimization or suspension was introduced.

## Workload and method

Apple M2 / Mac14,2, 8 GiB RAM, eight logical CPUs, macOS 27.0 (26A428). Other applications remained open: process-tree filtering excludes their PIDs, but host contention, compression and caches remain uncontrolled. The packaged ARM64 executable has main-build SHA-256 `560193b221757160e989eda96f03c8807ac9ed03a107214968231bf08549bf85`.

Each fresh disposable profile loads 50 distinct localhost URLs through the normal add-tab flow: 200 static cards and 610 DOM elements per document, no timers, media, remote assets or service workers. One tab is selected. Measurements use macOS `footprint --noCategories -j` across exactly the app process tree; PID coverage and collection errors are checked. MiB means 1,048,576 bytes. Renderer PIDs come from Electron [getOSProcessId](https://www.electronjs.org/docs/latest/api/web-contents/#contentsgetosprocessid); GPU roles come from [CDP SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/).

## Observer effect and corrected interpretation

Playwright's CDP connection attaches to website targets and makes every fixture document report `visible`, including unselected tabs. Disconnecting those targets restores the expected visibility: 49 `hidden` documents and one `visible` selected document in every control repetition. The control attaches a raw Runtime client only to the trusted browser GUI; it reads website visibility through the existing view IPC. There is no website debugger attached during the subsequent resource window. The remote-debugging endpoint and GUI client remain enabled, so this is not a completely uninstrumented Finder launch.

This is an observer effect, not evidence of a Svelto visibility bug. The original [performance baseline](MACOS_PERFORMANCE_BASELINE.md) remains valid as a CDP-inspected workload, but its memory and CPU figures must not be presented as native idle browsing. Native 0/10/30-tab controls have not been measured.

## Fifty loaded tabs with website debuggers detached

| Repetition | Inspected total MiB | Detached total MiB | Hidden renderers MiB | GPU MiB | Window mean CPU |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2307.8 | 1576.1 | 1162.2 | 100.4 | 16.52% |
| 2 | 2316.5 | 1597.1 | 1175.8 | 100.0 | 15.02% |
| 3 | 2317.9 | 1585.9 | 1167.8 | 101.0 | 14.83% |

Median detached footprint is **1585.9 MiB (1.55 GiB)**, with 55 processes in every run. Median footprint of the 49 hidden renderers is **1167.8 MiB**; GPU is 100.4 MiB, main process 202.8 MiB and selected renderer 25.7 MiB. Each group is summarized independently, so its median need not sum to the median total.

CPU window means are 16.52%, 15.02%, 14.83% (median 15.02%). Samples contain bursts rather than uniformly quiet activity. This is an unresolved measurement requiring follow-up, not an established idle-CPU improvement. All sampled PID sets remain unchanged through each window.

CPU is the mean of a 15-second window (16 process snapshots), after ten seconds settling with website debuggers detached; 100% means one logical CPU. Footprint is collected at the end. CPU differences between inspected and detached runs are not optimization gains or regressions: visibility, foreground window scheduling and host conditions differ. These short static-page samples need a longer controlled follow-up before battery or idle-CPU claims.

## Tab lifecycle with website debuggers attached

Three separate profiles exercise switching to the oldest tab, closing 45 other tabs, then closing the remaining four background tabs. Each phase settles for ten seconds; the final observation waits a further twenty seconds. All original closed renderer PIDs are absent from the final process tree. A document token and unsaved input in the surviving tab remain unchanged, proving no implicit reload of that fixture.

| Phase | Documents | Processes | Median footprint MiB | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Loaded | 50 | 55 | 2228.4 | 2228.4 | 2241.1 | 2222.5 |
| Switched to oldest | 50 | 55 | 2202.7 | 2165.6 | 2202.7 | 2204.9 |
| Closed to five | 5 | 10 | 498.4 | 518.9 | 496.5 | 498.4 |
| Closed to one, 10 seconds | 1 | 6 | 358.1 | 362.0 | 355.1 | 358.1 |
| Closed to one, 30 seconds | 1 | 6 | 366.0 | 350.9 | 366.0 | 366.3 |

Switching alone retains the loaded renderers. Closing tabs releases their processes and substantially reduces footprint in this inspected workload; it does not measure suspension savings. The surviving app still includes its GUI, main process, GPU and utility processes. These bounded observations do not prove absence of leaks during long sessions.

Median JavaScript heap used per document is 2.21 MiB (allocated heap 4.25 MiB), without forced garbage collection, measured through [Runtime.getHeapUsage](https://chromedevtools.github.io/devtools-protocol/v8/Runtime/#method-getHeapUsage). This is only one part of renderer memory; it cannot be subtracted from native footprint to attribute every remaining byte. All lifecycle checks passed in all three repetitions: loaded counts, unique renderer PIDs, document preservation and closed-process exit.

## Next implementation candidate

Prototype an opt-in suspension action for eligible inactive tabs, then measure its actual benefit with website debuggers detached. Keep it disabled by default until restoration and exclusions are verified. Preserve URL, navigation/task identity and session recovery; waking a suspended tab must visibly and reliably reload it. Exclude selected tabs, private tabs initially, unsaved forms, audio/video, capture, downloads and pending permission/dialog work. Require a safe failure path when eligibility cannot be established.

The current evidence identifies retained background renderers as a useful target. It does not justify blindly suspending tabs or sharing their renderer processes. Test real sites, multi-hour use, restoration failures and user data before shipping automatic suspension. There is no comparison with another browser, Intel/Windows measurement or claim about all macOS issues.

## Reproduce

Build the intended app source and select its executable explicitly:

```sh
npm run buildMacArm
SVELTO_TEST_EXECUTABLE="$PWD/dist/app/mac-arm64/Svelto.app/Contents/MacOS/Svelto" npm run benchmark:background
SVELTO_TEST_EXECUTABLE="$PWD/dist/app/mac-arm64/Svelto.app/Contents/MacOS/Svelto" SVELTO_BENCH_VISIBILITY_CONTROL=1 npm run benchmark:macos
```

Defaults: three repetitions, 50 documents, ten-second settling and fifteen-second CPU windows. `SVELTO_BENCH_CONTROL_TABS` changes the visibility-control count (5–50). General timing/repetition and executable options are documented in the baseline. Raw results are local ignored files `output/background-memory-macos.json` and `output/background-memory-native-control.json`. The report retains every headline observation. Pilots and a calibration run whose temporary instances overlapped are excluded; the final control closes each instance before the next repetition. The app runtime and preview ZIP are unchanged.

## Follow-up measurements

See the [macOS usage/performance report](MACOS_USAGE_PERFORMANCE_REPORT.md) for longer CPU windows, active public sites/video, address/search latency and the long-session/recovery investigation. Workload and observer conditions differ; these measurements do not imply a runtime optimization.

## Follow-up: manual sleeping tabs

Preview 0.1.1 implements manual suspension and adds targeted capture profiling and per-process resource lifecycle measurements. See [sleeping tabs and resource investigation](MACOS_SUSPENSION_RESOURCE_REPORT.md). The historical observations above retain their original workload and source provenance.
