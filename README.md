<div align="center">

# 🚀 newNewton

### *The All-in-One Experience & Privacy Suite for Newton School*

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.1.0-emerald.svg)](https://github.com)
[![Privacy First](https://img.shields.io/badge/Privacy-Dual--Layer_Blocker-success.svg)](#-dual-layer-telemetry--tracking-blocker)
[![Theme](https://img.shields.io/badge/Theme-Native_Grauity_Dark_/_Light-blueviolet.svg)](#-native-grauity-theme-switcher)
[![Attendance](https://img.shields.io/badge/LMS-Attendance_Rollup-orange.svg)](#-smart-attendance-tracker--bunk-calculator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<p align="center">
  A lightweight, high-performance browser extension for <code>my.newtonschool.co</code> that unlocks native dark mode, eliminates aggressive trackers and diagnostic uploads, provides live campus mess menus, and calculates real-time attendance margins.
</p>

[Key Features](#-key-features) • [Architecture](#-architecture--file-structure) • [Installation](#-installation-guide) • [Permissions](#-security--permissions) • [Credits](#-credits--acknowledgments)

</div>

---

## 💡 Why newNewton?

The Newton School portal (`my.newtonschool.co`) is powerful, but comes with a few daily pain points for students:

| Problem on Native Portal | How **newNewton** Solves It |
| :--- | :--- |
| **No accessible Dark Mode toggle**, and Next.js client-side page routing regularly wipes custom theme classes. | **Native Grauity Engine**: Uses Newton's internal theme tokens (`grauity-theme-dark`) with a 3-way toggle (Light / Dark / System) that survives route transitions. |
| **Heavy diagnostic & session recording scripts** (Microsoft Clarity, Datadog, Mixpanel, CleverTap, etc.) continuously upload screen activity & telemetry. | **Dual-Layer Privacy Shield**: Blocks tracking network requests (`declarativeNetRequest`) and provides crash-proof mock stubs (`MAIN` world) to ensure zero page breaks. |
| **Scattered mess menus & PDF schedules** make checking daily meals tedious. | **Campus Mess Subsystem**: Live weekly menu synced from GitHub with Monday auto-refresh, smart dish classification (Specials vs Staples), and active meal detection. |
| **Complicated LMS attendance margins** make it hard to know if you're safe from bunk limits. | **Intelligent Bunk Calculator**: Direct LMS portal API sync, theory + lab paired rollups, missed lecture breakdowns, and exact safe-to-skip / need-to-attend numbers. |

---

## ✨ Key Features

```
┌────────────────────────────────────────────────────────────────────────┐
│                               newNewton                                │
├───────────────┬──────────────────┬──────────────────┬──────────────────┤
│  🎨 Utilities │   🍱 Mess Menu   │  📈 Attendance   │   🔮 Mystery     │
│  Theme & Sync │   Weekly & Live  │  Bunk Calculator │   Upcoming Tools │
└───────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### 🎨 Native Grauity Theme Switcher
- **Zero CSS Injections**: Cleanly activates Newton School's internal design tokens (`grauity-theme-dark` / `grauity-theme-light`) without injecting heavy overriding stylesheets.
- **3 Dynamic Modes**: Easily switch between **Light**, **Dark**, or **System** (which dynamically syncs with your operating system's color scheme).
- **Route-Transition Resilient**: Employs an ultra-fast `MutationObserver` on `document.documentElement` to prevent Next.js page re-renders from stripping your dark mode.
- **Persistent Storage**: Syncs directly with Newton's internal `localStorage` keys as well as `chrome.storage.sync`.

---

### 🛡️ Dual-Layer Telemetry & Tracking Blocker
Standard ad-blockers often break single-page React applications when scripts expect tracking variables (`mixpanel`, `clarity`, etc.) to exist. **newNewton** implements a bulletproof **dual-layer architecture**:

1. **Network Layer (`declarativeNetRequest`)**:
   - Blocks outgoing network payloads to telemetry engines:
     - **Session Recording & Heatmaps**: Microsoft Clarity (`clarity.ms`), FullStory, LogRocket.
     - **Product & Event Analytics**: Mixpanel, CleverTap, WizRocket, OpenPanel.
     - **Diagnostics & Error Tracking**: Sentry (`sentry.io`), Datadog (`datadoghq.com`).
     - **Internal Diagnostics**: Newton School's `/api/v1/user/report/` endpoint.
     - **Ad & Pixel Trackers**: Google Analytics / GTM, Meta / Facebook Pixel, LinkedIn Insights, Taboola, Quora.
2. **Main-World In-Page Stubs (`telemetry-blocker.js`)**:
   - Injected at `document_start` before any page scripts execute.
   - Provides recursive `Proxy` stubs for tracking globals (`window.clarity`, `window.mixpanel`, `window.clevertap`, `window.openpanel`, etc.) so calls like `mixpanel.people.set(...)` resolve safely without throwing `TypeError: Cannot read properties of undefined`.
   - Silent interceptors for `navigator.sendBeacon`, `window.fetch`, and `XMLHttpRequest` that return synthetic success objects `{ blocked: true, status: "ok" }`.
   - Instant toggle: Enable or disable blocking on the fly straight from the popup.

---

### 🍱 Campus Mess Menu Subsystem
- **Weekly Upstream Sync**: Fetches live weekly mess schedules directly from GitHub Raw JSON (`menu.json`).
- **Monday Auto-Refresh**: Caches menu data in `chrome.storage.local`. Automatically detects a new week on Mondays and refreshes in the background (offering **0ms instantaneous UI loading**).
- **Smart Dish Highlighting**:
  - ✨ **Specials & Mains**: Accented pill badges highlight signature items (e.g. *Rajma Masala, Paneer Matar, Onion Uttapam, Gulab Jamun*).
  - 🥣 **Daily Staples**: Mundane staples (*Rice, Chapati, Dal, Curd, Pickles*) are neatly grouped into muted tags for rapid scanning.
- **Real-Time Meal Detector**:
  - `● Serving Now`: Glowing indicator actively detects current service hours (Breakfast: 7:30–9:30 AM, Lunch: 12:00–2:30 PM, Snacks: 4:30–6:30 PM, Dinner: 7:30–9:30 PM).
  - `Next Up`: Automatically expands the upcoming meal card.
- **7-Day Selector Bar**: Quick-switch between Monday to Sunday with dynamic real-world calendar dates.
- **Offline Fallback**: Includes bundled fallback data for offline access.

---

### 📈 Smart Attendance Tracker & Bunk Calculator
Powered by arithmetic rollup logic adapted from [`nst-attendance`](https://github.com/yats0x7/nst-attendance):
- **Direct LMS API Integration**: Uses the active student bearer token directly from `my.newtonschool.co` with built-in concurrency limiting.
- **Theory + Lab Paired Rollups**: Intelligently groups lecture and laboratory units into unified course summaries.
- **Precise Safe-to-Bunk Margin**:
  - Clearly displays **exact attendance percentages**.
  - Tells you precisely how many classes you can afford to miss: `✅ Can bunk X more lecture(s)`.
  - Tells you precisely how many consecutive classes you must attend to recover: `⚠️ Attend next Y lecture(s) to recover`.
- **Target Safety Selector**: Instant one-click target toggling between **75% (Min)**, **80%**, and **85%**.
- **Missed Lectures Breakdown**: Expandable native HTML5 details listing every absent date and session.

---

### 🔮 Mystery Module
- **Classified Area**: Dedicated expansion slot in the top navigation reserved for upcoming developer and student productivity utilities.

---

## 📂 Architecture & File Structure

```text
newNewton/
├── README.md                      # Project documentation and architectural guide
├── menu.json                      # Reference campus weekly mess menu (raw upstream)
└── extension/                     # Chrome Extension root (Load Unpacked target)
    ├── manifest.json              # MV3 configuration, host permissions & content scripts
    └── src/
        ├── background.js          # Service worker: declarativeNetRequest dynamic rule manager
        ├── content.js             # Content script: theme observer & state synchronization
        ├── telemetry-blocker.js   # Main-world script: crash-proof Proxy stubs & interceptors
        ├── popup.html             # Material-inspired multi-tab popup UI
        ├── popup.css              # Adaptive dark/light stylesheet
        ├── popup.js               # Multi-tab controller & lifecycle orchestrator
        ├── menu.json              # Bundled offline fallback mess menu
        ├── icons/                 # Extension toolbar & store icons
        │   ├── icon16.png
        │   ├── icon48.png
        │   └── icon128.png
        └── attendance/            # LMS Attendance engine
            ├── portal-api.js      # Concurrency-controlled API client for Newton LMS
            ├── grouping.js        # Course component pairing (Theory + Lab)
            └── math.js            # Rollup arithmetic, bunk budget & recovery algorithms
```

---

## 🛠️ Installation Guide

Follow these steps to install **newNewton** on Google Chrome, Brave, Arc, Edge, or any Chromium-based browser:

### Step 1: Download or Clone the Repository
```bash
git clone https://github.com/suwupnil/newNewton.git
```
*(Or download and extract the repository ZIP file to your computer).*

### Step 2: Open Extensions in Your Browser
1. In your browser's address bar, navigate to:
   ```text
   chrome://extensions/
   ```
2. Enable **Developer mode** using the toggle switch located in the top-right corner.

### Step 3: Load the Extension
1. Click the **Load unpacked** button in the top-left menu.
2. In the file picker, select the **`extension/`** directory inside the repository folder:
   ```text
   path/to/newNewton/extension
   ```
3. The **newNewton** extension icon will now appear in your browser toolbar!

### Step 4: Pin & Use
1. Pin **newNewton** to your toolbar for easy access.
2. Navigate to [my.newtonschool.co](https://my.newtonschool.co) and open the extension popup to start customizing!

---

## 🔒 Security & Permissions

**newNewton** is built strictly around user privacy, zero remote code execution, and explicit scopes:

| Permission | Purpose |
| :--- | :--- |
| `storage` | Stores user theme preferences, blocker toggles, and cached weekly mess data locally on your device. |
| `declarativeNetRequest` | Efficiently drops tracking and diagnostic analytics requests without slowing down your browser. |
| `activeTab` & `scripting` | Coordinates real-time theme syncing and DOM messaging with the active Newton School tab. |
| `host_permissions` | Strictly scoped to `https://my.newtonschool.co/*`, `https://*.newtonschool.co/*`, and `https://raw.githubusercontent.com/*` (for menu updates). |

> **Privacy Note:** newNewton does **not** collect, store, or transmit your personal data, credentials, or browsing history to any external third-party server. All attendance tokens remain strictly inside your browser session.

---

## 🤝 Credits & Acknowledgments

- **Attendance Rollup Engine**: Core attendance mathematics and endpoint structure adapted from [`nst-attendance`](https://github.com/yats0x7/nst-attendance) by [@yats0x7](https://github.com/yats0x7).
- **Newton School Platform**: Designed specifically to enhance the student learning environment at [Newton School](https://www.newtonschool.co).

---

## 📄 License

This project is open-source software licensed under the **[MIT License](LICENSE)**.
Feel free to contribute, open issues, or submit feature pull requests!