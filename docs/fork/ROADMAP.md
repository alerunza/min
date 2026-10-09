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
- [x] Prepare Quiet, Inset and Focus prototypes; select Quiet.
- [x] Verify the local ad hoc signature, including the app extracted from the preview ZIP.

This is a local preview. It is not a notarized public release, and it does not resolve the entire upstream issue backlog. Upstream lint debt remains; see the verification report for the comparison.

## Quiet implementation

- [x] Apply Quiet toolbar typography, spacing, colors, corner radii, Tasks icon and control states; production icons remain pending.
- [x] Refine toolbar, address editing, loading indicators and tab states without changing the navigation structure.
- [x] Preserve task organization and improve the Tasks control and visible keyboard focus.
- [ ] Verify tab opening, closing, switching, dragging and focus behavior.
- [ ] Apply coherent light/dark appearance, contrast, keyboard navigation and VoiceOver support.
- [ ] Verify window controls, resizing, fullscreen, Spaces and shortcuts on macOS.
- [ ] Evaluate native materials with a small Electron prototype, measuring readability and performance; honor reduced transparency/motion and define fallbacks.
- [ ] Evolve settings, history, bookmarks, downloads, reader/PDF surfaces and the new-tab page after the primary chrome is stable.

Quiet toolbar verification: real packaged Electron app on macOS 27 ARM64; light/dark at 1024, 390 and 320 px, address editing/Escape, Tasks opening/closing and the 15 existing smoke checks passed. No new renderer errors or lint diagnostics were introduced. Full VoiceOver, tab dragging, Spaces and fullscreen validation remain open.

Keep Electron/Chromium during this iteration. A SwiftUI/WebKit rewrite is a separate architectural decision with web compatibility and Windows implications.

## macOS reliability and technical foundation

- [ ] Reproduce and classify the 55 candidate reports in MACOS_BACKLOG: current bugs, duplicates, upstream fixes, feature requests or external limits.
- [ ] Fix remaining crashes and data-loss risks with reproducible regression checks.
- [ ] Verify crash/update recovery, multiple windows and long sessions with many tabs.
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
