# Svelto development plan

Svelto is a personal evolution of Min: minimal, lightweight, fast in intent, and focused on the Mac first. All product copy is English. Preserve horizontal tabs, search inside the active tab, and tasks. Measure performance before making comparative speed or memory claims.

## First baseline

- Install dependencies with a committed lockfile and supported Node version.
- Build and launch an ARM64 macOS preview.
- Separate app name, bundle identifier, data, welcome page, and release/update identity from Min.
- Exercise tabs, navigation, attachments, session restore, private tabs, native window closure, and Dock activation.
- Compare three interface directions before applying browser chrome changes. Completed: Quiet selected by the project owner; browser chrome implementation is next.

## Next: macOS reliability and UI

1. Use `MACOS_BACKLOG.md` to reproduce and classify upstream macOS issues. An issue is complete only with a reproducible check and verified fix.
2. Apply Quiet, the selected interface direction, beginning with toolbar spacing, tab states, keyboard focus, tasks, light/dark contrast, and window sizing. Retain Min's core layout.
3. Test multiple windows, fullscreen/Spaces, external links/default-browser handling, downloads/dialogs, file opening, history, bookmarks, PDFs, content blocking, and password-manager integrations.
4. Benchmark startup, memory, CPU, and input latency with comparable workloads and profiles.
5. Create original Svelto logo/icons and an English website using the chosen visual direction. Website publishing and domain choice are separate actions.
6. Complete third-party notices/source obligations, signing, notarization, updates, privacy policy, and release checks before public distribution.

## Later: Windows

Rebrand installation/registry identifiers and updater artifacts, then verify install/uninstall, default-browser handling, window controls, shortcuts, high-DPI layout, and session isolation on Windows. A successful Mac build does not validate Windows or Intel Mac builds.
