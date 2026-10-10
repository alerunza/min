# Svelto preview changelog

## 0.1.1 — 2026-10-10

- Add manual **Sleep tab — reloads when reopened** to the tab menu. Eligible inactive pages release their renderer; tab order, title and address remain. Click the tab or choose Wake tab to reopen it.
- Restore Back/Forward history during the live session, scroll and mute settings on wake. Preserve sleeping intent through application restart. Navigation history held for sleeping tabs is not persisted through restart.
- Keep active tabs in any window, private tabs, loading pages, playing media, downloads and pending permissions/capture grants awake. Reject detectable unsaved forms/editors/embedded content and respect a page's native unload veto. Unknown JavaScript state still reloads when reopened.
- Add a dotted underline and an accessible Sleeping label without reducing text contrast. Allow unmuting a sleeping tab without loading its page; Reload wakes it and Reader stays disabled until wake.
- Fix late toolbar updates targeting another Task: they no longer interrupt cross-window state synchronization. Avoid redundant sleeping-state updates on ordinary view creation and contain capture callbacks after their page has been destroyed.
- Add a diagnostic benchmark that alternates preview captures on/off, profiles the main process and maps native footprint to process roles. Profiling hooks exist only in a temporary app copy; no automatic sleeping or preview-timer change ships.

Verification: **119 passing checks** on the ZIP-extracted ARM64 app, macOS 27.0 / Electron 43.4.1. Eighteen new checks cover sleeping, protections, actual menu callback wiring, restoration, two-window Tasks, restart and Quiet light/dark/narrow UI. The 101 prior checks cover browsing, collections, Reader/PDF, permission/files and session recovery. The initial session regression exposed the background-Task toolbar issue above; it passes after the fix. The known intermittent Playwright inspector startup/collection issue remains open. Fake media devices and controlled chooser/print/shell responses are not full native OS validation.

Resource fixture: loading 50 local documents and sleeping 49 lowers native footprint from **1892.6 to 324.9 MiB**. After two ten-tab wake/sleep cycles, footprint returns to **306.6/308.3 MiB**, with one page view. These candidate measurements are workload-specific and do not prove absence of leaks. Four alternating capture phases confirm capture costs, but do not establish that removing the 15-second timer fixes the remaining CPU peaks; the timer is retained. See the [resource report](MACOS_SUSPENSION_RESOURCE_REPORT.md) for source provenance, methods and limits.

Artifact: `output/svelto-v0.1.1-mac-arm64.zip`, locally signed ad hoc and verified after extraction. ZIP SHA-256: `cbe51d5e4b440ba425a5d2ea9a8bc957544427be2ebcba3666649ae8fd1a5931`. It is not a notarized public release. Intel/Windows, broader long-session/GPU recovery, real OS camera/microphone/screen picker, VoiceOver and public distribution remain pending in the [roadmap](ROADMAP.md).
