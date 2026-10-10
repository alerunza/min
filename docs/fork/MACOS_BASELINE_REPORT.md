# Svelto 0.1.0 macOS baseline verification

Date: 2026-10-09. Host: macOS 27.0 (26A428), Apple Silicon ARM64. Upstream baseline: Min 1.35.7, commit `c92079cde045c38ab844e53501e9c5178d503a45`. Runtime: Node 24.10.0 and Electron 43.4.1.

## Completed

- Installed dependencies, added an npm lockfile, and replaced the SSH-only Dragula reference with the same upstream fork commit downloaded over HTTPS.
- Built and launched the ARM64 app through `script/build_and_run.sh --verify` from the project directory. The script stages a fully local copy because Finder metadata in the synced Documents folder prevents code signing. It copies dependency build directories and preserves links; generated backups and Git metadata are excluded.
- Changed app name/version to Svelto 0.1.0, macOS bundle ID to `io.github.alerunza.svelto`, and default packaged/development profiles to Svelto/Svelto-development. A test override isolates both user and session data.
- Kept the existing tabs/tasks model, made the interface English, added an independent local welcome page, updated window titles/help links, removed identifying app tokens from the user agent, and disabled upstream Min update prompts.
- Fixed quick quit/window closure losing unsaved sessions: save before native BaseWindow shutdown and explicitly release its UI WebContentsView. A prevented close now leaves the window registry intact. See [Electron BaseWindow resource management](https://www.electronjs.org/docs/latest/api/base-window#resource-management).
- Fixed attachment downloads leaving the attachment URL in the tab/session state; keep the committed page address and do not mark the page as a file view. Download ownership first checks the originating page's window.
- Prepared three interactive UI directions: Quiet, Inset, and Focus. All retain horizontal tabs and tasks. These are proposals, not implemented browser chrome. Logo/icons remain temporary upstream assets.

## Verified

`npm ci --omit=optional --ignore-scripts --offline` passed from an empty local directory using the populated npm cache (795 packages). `npm run build` and the packaged ARM64 launch passed. `codesign --verify --deep --strict` passed for the local ad hoc app. Bundle identity, Apache license, NOTICE and Readability license were checked in the packaged resources.

`npm run test:smoke` passed 15 checks with a disposable profile and a local HTTP fixture server:

1. Independent name, version, user/session paths and browser user agent.
2. English UI and Svelto window title.
3. Independent first-run welcome page.
4. New tab from toolbar.
5. Address-bar navigation and title.
6. Link navigation with a user gesture.
7. Back navigation through the toolbar.
8. Tab switching.
9. Closing one tab retains the others.
10. Downloaded file contents, retained page URL and file-view state.
11. Private tab navigation.
12. Session written on quick quit with private tabs excluded.
13. Saved tasks restored after restart.
14. Native window close saves the session and releases the UI renderer.
15. Dock activation opens a new window with retained tasks.

The UI prototypes were checked in all three variants, light/dark, desktop/narrow widths; tab/new-tab/task interactions passed, with no console errors or horizontal overflow in the checked layouts.

## Remaining limits

The upstream lint baseline has 483 diagnostics. Svelto's final lint comparison has 477 with no new diagnostic signatures; existing formatting/shared-bundle-global diagnostics were removed. `npm test` therefore still fails and is recorded as inherited technical debt, not a passing suite.

This preview is ad hoc signed and not notarized. Intel macOS, Windows and Linux builds/CI were not verified here. The complete macOS backlog is not fixed; browser chrome redesign, original icons, website, performance benchmarks, third-party dependency notice/source inventory and release/update distribution remain in the development plan. No comparative performance claim is established by these smoke checks.

The local archive is `output/svelto-v0.1.0-mac-arm64.zip`. Its checksum is recorded in the adjacent `.sha256` file. `output/smoke-results.json` contains local test evidence and is intentionally excluded from Git.
