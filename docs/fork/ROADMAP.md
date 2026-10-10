# Svelto roadmap

Updated 2026-10-10. Owner: alerunza. Product language: English.

## Direction

Create a personal evolution of Min: minimal, lightweight and reliable, with macOS first and Windows after the Mac baseline is stable. Preserve horizontal tabs, search inside the active tab and tasks. **Quiet is the selected UI direction**, confirmed by the project owner. Its prototype now informs the macOS toolbar and tab chrome in the Electron preview.

## Completed baseline

- [x] Create the GitHub fork and clone the repository.
- [x] Select the product name: Svelto. Logo, icons and domain remain to be chosen.
- [x] Establish a supported Node version and dependency lockfile; verify a clean offline installation from the populated package cache.
- [x] Build and launch the ARM64 macOS preview on macOS 27.
- [x] Separate app name, bundle identifier, packaged/development profiles and session data from Min.
- [x] Add an English welcome page, update titles/help links and disable upstream Min update prompts.
- [x] Verify navigation, tabs, attachments, private-tab exclusion, session restore, native window close and Dock activation: 15 packaged-app smoke checks passed.
- [x] Fix quick-quit/window-close session loss and attachment downloads leaving the wrong tab address.
- [x] Fix fullscreen exit ignoring its boolean, handle rejected preview/view promises and filter stale events after tab/window transitions. Keep UI focus requests scoped to their owning foreground window.
- [x] Prepare Quiet, Inset and Focus prototypes; select Quiet.
- [x] Verify the local ad hoc signature, including the app extracted from the preview ZIP.

This is a local preview. It is not a notarized public release, and it does not resolve the entire upstream issue backlog. Upstream lint debt remains; see the verification report for the comparison.

## Quiet implementation

- [x] Apply Quiet toolbar typography, spacing, colors, corner radii, Tasks icon and control states; production icons remain pending.
- [x] Refine toolbar, address editing, loading indicators and tab states without changing the navigation structure.
- [x] Preserve task organization and improve the Tasks control and visible keyboard focus.
- [x] Verify tab opening, closing/restoring, switching, dragging and focus behavior.
- [x] Add Mac toolbar keyboard navigation: F6/Shift+F6, tab arrows/Home/End, Enter to edit, Tab through controls and visible focus.
- [ ] Complete contrast and VoiceOver audits across all browser surfaces.
- [x] Verify minimize/restore, zoom/unzoom, resizing, native fullscreen entry/exit and common shortcuts on macOS 27 ARM64. Verify two independent windows and focus switching between a normal window and a native fullscreen Space.
- [ ] Extend Spaces verification to multiple normal desktops, external monitors and other supported Mac/OS configurations.
- [ ] Confirm toolbar window dragging manually: native automation did not produce a verifiable window-position change; tab reordering is verified separately.
- [ ] Evaluate native materials with a small Electron prototype, measuring readability and performance; honor reduced transparency/motion and define fallbacks.
- [x] Extend Quiet to Preferences: neutral light/dark palette, section links, accessible labels/focus, responsive fields and preserved settings. Fix PAC URL persistence and deleting an unsaved custom command. Verify reload persistence and all sections at 1024/390/320 px; packaged smoke suite now passes 19 checks.
- [x] Extend Quiet to Tasks: grouped list, current-task/tab states, responsive layout, accessible controls and keyboard undo. Save pasted task names, retain search through state-sync renders and clear hidden fake focus. Verify cross-task pointer dragging, search/Enter, empty results, keyboard New Task and session persistence.
- [x] Extend Quiet to address/search: compact light/dark results, visible keyboard selection, responsive URLs, labeled address combobox and preserved history/calculator actions. Discard stale/closed history and remote suggestions, contain network failures, normalize input flags and keep IME Enter from navigating. Verify Cmd+L, arrows/Tab/Enter/Escape, native page focus, offline behavior and private search.
- [x] Extend Quiet to history, bookmarks and the download shelf: collection headings/counts/empty states, responsive tag/editor fields and named keyboard actions. Scope late collection/star replies, isolate pending bookmark edits, normalize unique tags and preserve history when deleting bookmarks. Support finite unknown-size progress, native cancel, retained file-open errors and retry. Verify 17 collection regressions, persistence after relaunch and light/dark/narrow layouts; shell-open/Finder calls use controlled stubs.
- [x] Evolve Reader/PDF and New Tab with Quiet while preserving in-tab flows. Keep serif reading, light/dark/sepia, immediate frame styling, accessible appearance controls and keyboard return; escape header metadata and show empty/HTTP failure states. Replace obsolete PDF.js factory calls with current page/text/link APIs, fit pages on resize, preserve distant searchable text with a bounded canvas cache, handle internal destinations and offer explicit retry/download on failure. Keep New Tab minimal with accessible background controls and contained file errors.
- [x] Add a packaged reading regression suite (`npm run test:reading`): local articles, delayed images, three/thirty-page PDFs, page jumps, search, original-file downloads, print preparation, 320/390 px layouts and background file operations. Real print output, protected/form-heavy PDFs, native chooser coverage and VoiceOver remain manual/separate.

- [x] Keep permission controls in the active tab with named keyboard Allow/Deny and reload-to-reset actions. Scope temporary grants to the complete HTTP(S) origin and session, isolate private tabs, settle pending callbacks on navigation/close and avoid repeated listeners/grant icons. Add macOS camera/microphone usage descriptions and the native system screen picker with denial on unsupported fallback paths.
- [x] Preserve the original tab in delayed Save Page dialogs, reject requests after its URL changes, handle save errors and normalize cancelled/detached native dialog results. Verify actual multi-file upload bytes and HTMLComplete saving with controlled chooser replies.

Quiet toolbar verification: real packaged Electron app on macOS 27 ARM64; light/dark at 1024, 390 and 320 px, address editing/Escape, Tasks opening/closing and the original 15 smoke checks passed. Tab dragging, keyboard navigation, two-window focus and fullscreen Space coexistence are verified. Full VoiceOver and broader multi-desktop/monitor coverage remain open. The packaged general suite now has 28 passing checks; 17 additional collection checks cover keyboard actions, asynchronous replies, bookmark persistence and downloads. The history-search fixture explicitly waits for indexing before asserting a saved result. All nine JavaScript modules changed in the collection pass have zero Standard diagnostics; upstream lint debt remains elsewhere.

The packaged suites now pass **61 checks**: 28 general, 17 collections and 16 reading/new-tab checks. The five browser JavaScript modules touched in this pass have zero Standard diagnostics; standalone reading scripts also pass syntax checks.

Reading QA records the existing sandbox-blocked preload messages from Reader frames and expected invalid-resource diagnostics separately from unexpected JavaScript errors. Frame script permissions remain restricted. The fixture suite exercises the menu's find command. A separate native UI check confirms the toolbar Reader button, return to browsing, appearance popover dismissal, PDF opening through Cmd+L and Cmd+F finding the third-page token on macOS 27. These checks do not establish general PDF compatibility, startup/memory performance or complete print support.

Keep Electron/Chromium during this iteration. A SwiftUI/WebKit rewrite is a separate architectural decision with web compatibility and Windows implications.

## Pending manual verification

Record the app commit, macOS version/architecture, reproduction steps and result for each check. The automated baseline is 101 checks: 61 existing packaged regressions, 11 permission/file packaged checks, 14 permission-policy unit checks and 15 session checks. Controlled print/chooser responses and fake media devices do not close these items.

- [ ] Print real Reader articles and PDFs: page order, margins/scaling, multi-page output, cancelling the macOS dialog and returning to a usable preview.
- [ ] Verify PDF compatibility with password-protected documents, editable forms, embedded fonts, annotations/links and large documents. Record unsupported behavior and resource usage rather than treating fixture success as complete PDF coverage.
- [ ] Audit VoiceOver across tabs/address suggestions, Tasks, Preferences, history/bookmarks, downloads, Reader and PDF: accessible names, reading order, selected/expanded states and focus restoration.
- [ ] Exercise native file dialogs for background selection, uploads and saving downloads, including cancellation. Verify actual file opening and Show in Finder; automated shell/Finder dispatch checks currently use stubs.
- [ ] Verify real camera/microphone on allow, deny and OS-level refusal; verify native screen-picker acceptance/cancellation and stopping capture. Fake-device tests verify browser consent only.
- [ ] Verify Developer ID signing, notarization and Gatekeeper on a clean Mac before public distribution. The current ZIP has a verified ad hoc signature and is not notarized; distribution setup is tracked below.

## macOS reliability and technical foundation

- [ ] Reproduce and classify the 55 candidate reports in MACOS_BACKLOG: current bugs, duplicates, upstream fixes, feature requests or external limits.
- [ ] Fix remaining crashes and data-loss risks with reproducible regression checks.
- [x] Verify abrupt main-process termination/relaunch with 48 tabs in three named Tasks, two-window synchronization, background checkpoints, private exclusion, native close/quit and damaged snapshot recovery. Preserve tab order/IDs, selected tabs, mute states, Task names/collapse state and closed-tab history.
- [ ] Extend recovery verification to renderer/GPU failures, update interruption, full-disk/power-loss behavior and repeated day-long sessions. The separate two-hour mixed-site test verifies main-process relaunch, but does not establish general long-session or resource stability.
- [ ] Investigate intermittent startup/debugger failures seen under Playwright on Electron 43.4.1/macOS 27 (including an Electron Framework inspector/libuv native crash). Read-only polling retries a lost inspector promise; actions are never retried automatically. Chromium GPU/deprecation warnings remain under investigation.
- [ ] Verify camera, microphone, screen sharing, permissions, uploads, printing, PDFs and file opening.
- [ ] Check external links, default-browser handling, login flows, password-manager integrations and commonly used sites.
- [ ] Audit Electron/Chromium versions, dependency security, IPC boundaries and web-content privileges; define update policy.
- [ ] Complete dependency licenses, notices, asset attribution and source obligations.
- [ ] Define supported macOS versions; verify Intel separately before claiming support.
- [ ] Add meaningful CI checks and verify build workflows on their target platforms.
- [x] Establish a repeatable macOS ARM64 startup/memory/CDP-inspected CPU baseline with 0/10/30/50 actually loaded local documents: five startup pairs and three resource repetitions. See [performance baseline](MACOS_PERFORMANCE_BASELINE.md).
- [x] Profile background renderer memory, tab switching/closing and CDP observer effects in three lifecycle runs plus three separate 50-tab visibility controls. See [background memory report](MACOS_BACKGROUND_MEMORY_REPORT.md).
- [ ] Prototype opt-in suspension of eligible inactive tabs; verify exclusions, reload/restoration, session behavior and memory benefit before enabling automatic suspension.
- [x] Measure address/input latency with 30 foreground trials, real autocomplete separately, four public sites/scrolling and a bounded video workload on macOS 27 ARM64. See [usage/performance report](MACOS_USAGE_PERFORMANCE_REPORT.md); use matched hardware/settings before any speed or memory comparisons.
- [x] Investigate 50-tab CPU bursts with two 180-interval runs and native process samples. Longer-window means are about 3%, but the causal explanation and intermittent peaks remain open.
- [x] Complete a two-hour mixed 20-tab session with 24 live draft/document checks and abrupt main-process termination/relaunch. Ordered IDs/URLs and selected content restore; see the [usage/performance report](MACOS_USAGE_PERFORMANCE_REPORT.md) for the complete memory series and limits.
- [ ] Extend workload verification to login-heavy/media-heavy sites, repeated longer sessions and additional Mac hardware; these bounded observations do not establish universal compatibility or leak freedom.
- [ ] Design optional Min data import with backups and reversible migrations.

## Product candidates

These remain proposals rather than committed features: pinned tabs, better tab search, workspace names, command palette, configurable shortcuts/gestures, bookmark import/export, clearer per-site privacy controls, and safe suspension of inactive tabs. Account sync, AI and extensions require separate scope decisions. Vertical-tab sidebars are outside the selected direction.

## Identity and website

- [ ] Create original Svelto logo and production icons.
- [ ] Choose domain, hosting and personal/private beta/public distribution scope.
- [ ] Build an English website coordinated with Quiet: clear product description, authentic screenshots, features, supported systems and verified downloads.
- [ ] Add version/architecture requirements, changelog, guides, FAQ and bug-report instructions.
- [ ] Publish accurate privacy and attribution information.
- [ ] Verify responsive layout, accessibility, load times and sharing/search metadata.
- [ ] Publish when the identity and installable release are ready; Windows remains unavailable until verified.

## macOS distribution

- [ ] Configure Developer ID signing and notarization for distributed releases.
- [ ] Finish dependency notice/source inventory in packaged artifacts.
- [ ] Define beta/stable releases, update delivery and recovery from failed updates.
- [ ] Verify clean installation, upgrade, migration and uninstall on supported systems.
- [ ] Prepare release notes, known issues and a repeatable release checklist.

## Windows, after macOS stabilization

- [ ] Adapt window controls, shortcuts, materials and dialogs to Windows.
- [ ] Rebrand installer, registry identifiers, protocol associations and icons.
- [ ] Verify install/uninstall, default-browser handling, high-DPI layout, profiles, sessions, permissions, password managers, PDFs, downloads and updates.
- [ ] Add target-platform build and functional checks.
- [ ] Add Windows downloads/documentation after a verified release exists.

## References

- [Current development plan](SVELTO_PLAN.md)
- [macOS baseline evidence and limitations](MACOS_BASELINE_REPORT.md)
- [macOS issue backlog](MACOS_BACKLOG.md)
- [License notes](LICENSE_NOTES.md)
- [Selected UI and alternatives](../design/README.md)

Permission/file QA: `npm run test:permissions` uses a disposable profile, two localhost origins and fake media devices. No physical device or screen is captured. Upload bytes and saved HTML are real; chooser responses are controlled. Native screen selection remains manual. The three fully linted permission/menu modules have zero Standard diagnostics; `tabBar.js` retains two pre-existing diagnostics. Electron system picker API: [official session documentation](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).

Session QA: `npm run test:sessions` adds seven snapshot-store checks and eight packaged macOS checks (15 total). Saves are coalesced on state changes with a 250 ms timer; one last-focused window owns checkpoints even when the app is unfocused. Atomic synchronous writes avoid older queued writes replacing a quit snapshot, keep one valid previous generation, and leave the save cache unchanged after a failure. Restore validates task/tab structure and IDs before populating UI; invalid primary data is archived, a valid previous generation restores automatically, and two invalid generations open the existing explanation. Reset retains UI, synchronization and checkpoint listeners. A crash can still lose changes since the last completed checkpoint; these tests simulate SIGKILL, not a power loss, hardware fault or update.

The final regression run also had one collections relaunch abort with the Electron process closed (no current crash report was available). The complete suite was rerun; this event remains part of the open runtime/debugger investigation, not a fixed crash claim.
