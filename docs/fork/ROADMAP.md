# Svelto roadmap

Updated 2026-10-09. Owner: alerunza. Product language: English.

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

Quiet toolbar verification: real packaged Electron app on macOS 27 ARM64; light/dark at 1024, 390 and 320 px, address editing/Escape, Tasks opening/closing and the original 15 smoke checks passed. Tab dragging, keyboard navigation, two-window focus and fullscreen Space coexistence are verified. Full VoiceOver and broader multi-desktop/monitor coverage remain open. The packaged general suite now has 28 passing checks; 17 additional collection checks cover keyboard actions, asynchronous replies, bookmark persistence and downloads. The history-search fixture explicitly waits for indexing before asserting a saved result. All nine JavaScript modules changed in the collection pass have zero Standard diagnostics; upstream lint debt remains elsewhere.

The packaged suites now pass **61 checks**: 28 general, 17 collections and 16 reading/new-tab checks. The five browser JavaScript modules touched in this pass have zero Standard diagnostics; standalone reading scripts also pass syntax checks.

Reading QA records the existing sandbox-blocked preload messages from Reader frames and expected invalid-resource diagnostics separately from unexpected JavaScript errors. Frame script permissions remain restricted. The fixture suite exercises the menu's find command. A separate native UI check confirms the toolbar Reader button, return to browsing, appearance popover dismissal, PDF opening through Cmd+L and Cmd+F finding the third-page token on macOS 27. These checks do not establish general PDF compatibility, startup/memory performance or complete print support.

Keep Electron/Chromium during this iteration. A SwiftUI/WebKit rewrite is a separate architectural decision with web compatibility and Windows implications.

## macOS reliability and technical foundation

- [ ] Reproduce and classify the 55 candidate reports in MACOS_BACKLOG: current bugs, duplicates, upstream fixes, feature requests or external limits.
- [ ] Fix remaining crashes and data-loss risks with reproducible regression checks.
- [ ] Verify crash/update recovery and long sessions with many tabs; the two-window interaction baseline is verified.
- [ ] Investigate intermittent startup/debugger failures seen under Playwright on Electron 43.4.1/macOS 27 (including an Electron Framework inspector/libuv native crash). Read-only polling retries a lost inspector promise; actions are never retried automatically. Chromium GPU/deprecation warnings remain under investigation.
- [ ] Verify camera, microphone, screen sharing, permissions, uploads, printing, PDFs and file opening.
- [ ] Check external links, default-browser handling, login flows, password-manager integrations and commonly used sites.
- [ ] Audit Electron/Chromium versions, dependency security, IPC boundaries and web-content privileges; define update policy.
- [ ] Complete dependency licenses, notices, asset attribution and source obligations.
- [ ] Define supported macOS versions; verify Intel separately before claiming support.
- [ ] Add meaningful CI checks and verify build workflows on their target platforms.
- [ ] Measure startup, memory, CPU and input latency before making speed or lightweight comparisons.
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
