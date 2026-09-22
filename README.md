# Newton Enhancer — Project Summary

A Manifest V3 Chrome extension designed for Newton School (`my.newtonschool.co`) that provides native theme switching between **Light**, **Dark**, and **System** modes.

---

## 1. Project Overview

Newton School's frontend contains a native dark theme built on their internal **Grauity** design system. However, the platform does not expose an accessible theme toggle to all students, and Next.js client-side page routing frequently clears body classes.

**Newton Enhancer** solves this by:
1. Providing a clean, Material Design 3-inspired popup UI to toggle between **Light**, **Dark**, and **System** themes.
2. Synchronizing the selected theme with Newton School's internal `localStorage` (`theme-preference` and `app_theme_enabled`).
3. Enforcing the native `grauity-theme-dark` / `grauity-theme-light` classes directly on `document.body`.
4. Using a `MutationObserver` to ensure theme classes persist seamlessly during Next.js single-page navigation and client-side page re-renders.
5. Exclusively leveraging Newton's inbuilt Grauity dark theme with zero external CSS injections.

---

## 2. Architecture & File Structure

```text
/Users/swap/Developer/newton-enhancer/
├── manifest.json              # Chrome MV3 configuration & permissions
├── PROJECT_SUMMARY.md         # Project documentation and handover guide
├── README.md                  # Project README
└── src/
    ├── content.js             # Content script: theme application & persistence
    ├── popup.html             # Extension popup UI (Segmented control)
    ├── popup.css              # Popup styling (Material Design 3 aesthetic)
    ├── popup.js               # Popup logic & chrome.storage state sync
    └── icons/
        ├── icon16.png         # 16x16 icon
        ├── icon48.png         # 48x48 icon
        └── icon128.png        # 128x128 icon
```

---

## 3. Core Components

### A. Manifest Configuration (`manifest.json`)
- **Manifest Version**: 3
- **Permissions**: `storage`, `activeTab`, `scripting`
- **Host Permissions**: `https://my.newtonschool.co/*`, `https://*.newtonschool.co/*`
- **Content Scripts**: Injects `src/content.js` at `document_start` on matching Newton School subdomains.

### B. Content Script (`src/content.js`)
- **Body Class Management**:
  - Adds `grauity-theme-dark` and removes `grauity-theme-light` when dark mode is active.
  - Adds `grauity-theme-light` and removes `grauity-theme-dark` when light mode is active.
- **LocalStorage Sync**:
  ```javascript
  localStorage.setItem('theme-preference', JSON.stringify({
    themeName: themeName,
    enable_platform_wide_dark_theme: isDark
  }));
  localStorage.setItem('app_theme_enabled', isDark ? 'true' : 'false');
  ```
- **Next.js Route Transition Handling**:
  - A `MutationObserver` watches `document.documentElement` attribute changes. If Next.js client-side routing strips the theme class from `<body>`, the observer immediately re-applies the expected theme class.
- **Dynamic System Theme Listener**:
  - Uses `window.matchMedia('(prefers-color-scheme: dark)')` to react dynamically when OS-level dark/light mode shifts while in "System" mode.
- **Runtime Messaging**:
  - Listens for `SET_THEME` actions dispatched from the popup UI for instant, reload-free theme switching.

### C. Popup UI (`src/popup.html`, `src/popup.css`, `src/popup.js`)
- **3-Way Segmented Control**:
  - **Light**: Forces `grauity-theme-light`.
  - **Dark**: Forces `grauity-theme-dark`.
  - **System**: Automatically matches the user's operating system color scheme.
- **State Persistence**:
  - Stored in `chrome.storage.sync` under keys `themeMode` (`'light' | 'dark' | 'system'`) and `themeName` (`'light' | 'dark'`).
- **Resilient Dispatch**:
  - Communicates directly with the active tab via `chrome.tabs.sendMessage`.
  - Includes a fallback using `chrome.scripting.executeScript` in case the extension popup is opened before the content script has finished initializing.

---

## 4. Key Platform Findings (Newton School)

- **Frontend Tech Stack**: Next.js, React, styled-components.
- **Theme Tokens**: The native dark mode is triggered via class `grauity-theme-dark` on `document.body` (and `<html>`).
- **State Storage**: Newton School checks `localStorage.getItem('theme-preference')` and `localStorage.getItem('app_theme_enabled')` on initial mount.
- **Styled-Components Caution**: Styled-components classes (such as `sc-xxxxxx-xx` and arbitrary 5–7 character hashes) change whenever Newton School updates and rebuilds their client bundles. Any custom features must use stable, semantic DOM attributes or relative selectors rather than styled-components hashes.

---

## 5. How to Load and Test in Google Chrome

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked**.
5. Select the project directory: `/Users/swap/Developer/newton-enhancer`.
6. Visit [https://my.newtonschool.co](https://my.newtonschool.co).
7. Click the **Newton Enhancer** icon in the Chrome toolbar to switch between **Light**, **Dark**, and **System** modes.

---

## 6. Git Status

The project is initialized as a clean Git repository:
- Main branch: `main`
- Path: `/Users/swap/Developer/newton-enhancer`
- Clean working tree with history recorded.
