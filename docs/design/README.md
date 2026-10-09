# Svelto interface directions

Open `svelto-directions.html` in a browser. These are interactive design prototypes, not screenshots of the implemented Electron app.

- **Quiet:** the closest evolution of Min. Horizontal tabs, a compact toolbar, restrained Mac details.
- **Inset:** more breathing room and an inset page surface, retaining tabs and tasks.
- **Focus:** an expanded active tab and search surface, retaining the same navigation model.

All visible product copy is English. The prototypes support light/dark appearance, tab selection, adding tabs, and task menus. Each direction was checked at desktop and narrow widths; these widths demonstrate layout resilience, not a planned mobile browser.

Selected direction: **Quiet**, confirmed by the project owner. Use it as the reference for browser chrome implementation while preserving Min’s horizontal tabs and tasks. Logo and production icons remain a separate milestone.

Quiet now drives the macOS toolbar in the Electron preview: a 52 px strip, 32 px tabs, 8 px corners, system typography, restrained light/dark colors and a layers-shaped Tasks control. Address editing remains inside the active tab. Native traffic lights and functional status icons are retained; production branding/icons are still pending. Narrow windows scroll the tab strip rather than wrapping browser chrome.

Mac keyboard flow: F6 or Shift+F6 toggles focus between the page and toolbar. Left/Right and Home/End select tabs while keeping toolbar focus; Enter/Space edits the focused active tab. Tab reaches its Close button, New Tab and Tasks; Enter opens Tasks and Escape returns to browsing. Cmd+L/T/W, Cmd+Shift+T, Ctrl+Tab and Cmd+9 retain their existing browser actions.
