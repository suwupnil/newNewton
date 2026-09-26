# newNewton — Project Summary & Architecture Guide

A Manifest V3 Chrome extension designed for Newton School (`my.newtonschool.co`) that provides native theme switching between **Light**, **Dark**, and **System** modes, alongside a high-performance **Telemetry, Diagnostic & Tracking Blocker**.

---

## 1. Project Overview

Newton School's frontend contains:
1. An internal **Grauity** design system with a built-in dark theme (`grauity-theme-dark`). However, the platform does not expose an accessible theme toggle to all students, and Next.js client-side page routing frequently strips body classes.
2. Numerous embedded analytics, session recording, screen capture, diagnostic report uploads, and tracker pixels (Microsoft Clarity, Google Analytics/GTM, Mixpanel, CleverTap, OpenPanel, Sentry/Datadog diagnostic services, and `/api/v1/user/report/` telemetry endpoints).

**newNewton** addresses both needs cleanly:
- **Native Grauity Theme Switcher**: 3-way toggle (Light / Dark / System) that persists to Newton's native `localStorage` keys and enforces `grauity-theme-dark` / `grauity-theme-light` without injecting any custom CSS overrides.
- **Privacy & Telemetry Blocker**: Dual-layer blocking protection that stops diagnostic uploads, session recordings, analytics, and third-party trackers with an easy-to-use toggle in the popup UI.

---

## 2. Architecture & File Structure

```text
/Users/swap/Developer/newton-enhancer/
├── manifest.json              # Chrome MV3 configuration, permissions, & content scripts
├── PROJECT_SUMMARY.md         # Detailed technical documentation and architectural reference
├── README.md                  # Project README & user guide
└── src/
    ├── background.js          # Background service worker: declarativeNetRequest dynamic rules
    ├── telemetry-blocker.js   # Main-world script: crash-proof stubs & beacon/fetch/XHR interceptors
    ├── content.js             # Isolated-world content script: theme enforcement & state synchronization
    ├── popup.html             # Popup UI (Grauity theme switcher & Telemetry toggle)
    ├── popup.css              # Popup styling (Material Design 3 aesthetic, light & dark mode)
    ├── popup.js               # Popup controller & chrome.storage state sync
    └── icons/
        ├── icon16.png         # 16x16 icon
        ├── icon48.png         # 48x48 icon
        └── icon128.png        # 128x128 icon
```

---

## 3. Core Features & Technical Implementation

### A. Telemetry, Tracking & Diagnostic Blocker (Dual-Layer Protection)

Blocking tracking on a Next.js / React single-page application requires dual-layer protection to avoid breaking JavaScript execution:

1. **Network Layer (`src/background.js` — `declarativeNetRequest`)**:
   - Manages dynamic rules with `declarativeNetRequest` scoped to requests initiated by `newtonschool.co` and `my.newtonschool.co`.
   - Blocks network requests matching:
     - **Microsoft Clarity**: `||clarity.ms`, `||c.clarity.ms` (session recordings, screen capture, heatmaps)
     - **Google Analytics & GTM**: `||google-analytics.com`, `||analytics.google.com`, `||googletagmanager.com`
     - **Product Analytics**: `||mixpanel.com`, `||api.mixpanel.com`, `||clevertap.com`, `||wizrocket.com`, `||openpanel.dev`
     - **Ad Pixels**: `||facebook.com/tr`, `||connect.facebook.net`, `||px.ads.linkedin.com`, `||snap.licdn.com`, `||trc.taboola.com`, `||q.quora.com`, `||hotjar.com`
     - **Diagnostic Services**: `||sentry.io`, `||datadoghq.com`, `||fullstory.com`, `||logrocket.io`
     - **Newton Diagnostic Endpoint**: `||newtonschool.co/api/v1/user/report/` (internal web diagnostic and telemetry reporting)

2. **In-Page Stub Layer (`src/telemetry-blocker.js` — `"world": "MAIN"`)**:
   - Runs in the webpage's main execution context at `document_start` before any page scripts or inline scripts run.
   - **Crash-Proof Stubs**: Provides recursive `Proxy` stubs for tracking globals (`window.clarity`, `window.mixpanel`, `window.clevertap`, `window.openpanel`, `window.fbq`, `window.lintrk`, `window.qp`, `window.gtag`, `window.ga`, `window.dataLayer`). This guarantees that calls like `mixpanel.people.set(...)` or `clarity('set', ...)` succeed harmlessly without throwing `TypeError: Cannot read properties of undefined`.
   - **Beacon Interception**: Intercepts `navigator.sendBeacon` and silently drops diagnostic payloads matching telemetry patterns while returning `true` to signal success.
   - **Fetch & XHR Interception**: Intercepts `window.fetch` and `XMLHttpRequest` to immediately return synthetic `{ blocked: true, status: "ok" }` responses for diagnostic reporting calls without causing network errors or React error boundary trips.
   - **Real-Time Toggle**: Listens for toggle events via custom DOM events, window `postMessage`, and `localStorage` to turn blocking ON or OFF on the fly.

### B. Native Grauity Theme Switcher

1. **Class Enforcement**:
   - Applies `grauity-theme-dark` (or `grauity-theme-light`) directly to `document.body`.
   - No custom CSS stylesheet overrides: cleanly relies on Newton's internal Grauity CSS variables and tokens.
2. **Persistence**:
   - Synchronizes selection with `localStorage`:
     ```javascript
     localStorage.setItem('theme-preference', JSON.stringify({
       themeName: themeName,
       enable_platform_wide_dark_theme: isDark
     }));
     localStorage.setItem('app_theme_enabled', isDark ? 'true' : 'false');
     ```
3. **Next.js Route Transition Resistance**:
   - Employs a `MutationObserver` on `document.documentElement` to instantly re-apply the theme if Next.js page transitions strip the body class.
4. **System Mode Synchronization**:
   - Supports 3 modes: **Light**, **Dark**, and **System** (listening dynamically to OS color-scheme shifts via `window.matchMedia`).

### C. Popup UI (`src/popup.html`, `src/popup.css`, `src/popup.js`)

- **Theme Segmented Control**: 3-button pill control (Light / Dark / System).
- **Telemetry Switch**: Modern toggle switch with real-time status badge (`Blocked` in green, `Allowed` in red) and checklist showing protected categories.
- **Apply Button**: Forces immediate sync across both theme and telemetry settings to the active tab.

---

## 4. Permissions & Manifest V3 Configuration

- **`storage`**: Persists user settings (`themeMode`, `themeName`, `blockTelemetry`) via `chrome.storage.sync`.
- **`declarativeNetRequest`**: Dynamically activates or deactivates network blocking rules without requiring broad webRequest blocking overhead.
- **`activeTab` & `scripting`**: Dispatches real-time messages and fallback execution to the active Newton School tab.
- **`host_permissions`**: Scoped strictly to `https://my.newtonschool.co/*` and `https://*.newtonschool.co/*`.
- **Content Scripts**:
  - `src/telemetry-blocker.js`: `"world": "MAIN"`, `"run_at": "document_start"`.
  - `src/content.js`: `"world": "ISOLATED"`, `"run_at": "document_start"`.

---

## 5. How to Load and Test in Google Chrome

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked**.
5. Select the extension directory: `/Users/swap/Developer/newton-enhancer`.
6. Visit [https://my.newtonschool.co](https://my.newtonschool.co).
7. Open the extension popup:
   - Toggle theme between **Light**, **Dark**, and **System**.
   - Toggle **Telemetry & Tracking** ON to block tracking and diagnostic uploads, or OFF to allow.
8. Inspect Network and Console in Chrome DevTools:
   - Notice requests to Clarity, Mixpanel, CleverTap, and `/api/v1/user/report/` are blocked without throwing any JavaScript runtime errors.