# `newNewton` — Comprehensive Project Context & AI Engineering Guide

> **Purpose of this document**: This file is the single source of truth for any AI coding assistant or engineer working on the `newNewton` repository. It documents the complete architecture, file map, data flows, state machines, API contracts, storage schemas, UI design systems, build pipelines, and strict engineering invariants across all subsystems.

---

## 1. Project Overview & Ecosystem Scope

**`newNewton`** (also referenced internally as **Newton Enhancer**) is a multi-platform suite built for **Newton School of Technology (NST) / Rishihood University (RU)** students using the Newton School LMS portal (`https://my.newtonschool.co`).

The repository comprises **four primary subsystems**:

1. **Chrome Extension (`extension/`) — Manifest V3 (`v1.2.2`)**:
   - **Native Grauity Theme Switcher**: Enforces `grauity-theme-dark` / `grauity-theme-light` on `my.newtonschool.co` with Light, Dark, and System modes, persisted to Newton's native `localStorage` keys and guarded against Next.js SPA route transitions via `MutationObserver`.
   - **Dual-Layer Telemetry, Diagnostic & Tracking Blocker**: Combines Chrome `declarativeNetRequest` dynamic network rules (blocking 24 tracker/diagnostic domains and `/api/v1/user/report/`) with a `MAIN`-world `document_start` script (`telemetry-blocker.js`) that installs recursive `Proxy` stubs on analytics globals (`window.clarity`, `window.mixpanel`, `window.clevertap`, `window.openpanel`, `window.gtag`, etc.) and intercepts `navigator.sendBeacon`, `window.fetch`, and `XMLHttpRequest`.
   - **Campus Mess Menu Tab**: Live 7-day Rishihood University mess schedule synced weekly from GitHub (`menu.json`) with Monday auto-invalidation, offline fallback, real-time meal status (`Serving Now` / `Next Up`), and automatic classification into **Special & Main** vs. **Daily Staples**.
   - **Attendance Rollup & Skip Calculator Tab**: Fetches live attendance records and lecture histories across all enrolled semester units from the Newton LMS API, pairs Theory (`Lecture`) and Practical (`Lab`/`Tutorial`) components into unified subjects, and calculates exact skip budgets (`skipsAffordable`) and recovery streaks (`classesToRecover`) across configurable safety targets (`75%`, `80%`, `85%`).
   - **Mystery Tab (Quiz Solution Archiver & Background Auto-Solver)**: Lists all unsubmitted LMS assessments grouped by subject and Theory/Lab component, cross-references verified solutions stored in Supabase, and provides 1-click or batch background auto-submission with an optional **Lazy Submit** human-like delay + entropy jitter engine, live progress controls (Pause/Resume, Fast-Forward, Stop), Web Audio completion chimes, and native OS notifications.

2. **Supabase Cloud Backend (`supabase/`) — AWS Mumbai (`ap-south-1`)**:
   - **Clean-Room Server Ingestion**: The client extension has **zero write permissions** (`INSERT`, `UPDATE`, `DELETE` are revoked from `anon` and `authenticated` roles on `public.quizzes`).
   - **Edge Function (`supabase/functions/sync-quizzes/index.ts`)**: Receives a student's LMS `authToken` and assessment identifiers (`ARCHIVE_ONE` or `SYNC_ALL`), fetches completed quiz questions and revealed solutions directly from `https://my.newtonschool.co` from AWS Mumbai, normalizes the question schema, and upserts into `public.quizzes` using `SUPABASE_SERVICE_ROLE_KEY`.

3. **macOS Native App & WidgetKit Extension (`macos/`)**:
   - Native macOS 14+ headless menu bar application and WidgetKit extension written in **SwiftUI**, **WidgetKit**, and **AppIntents**.
   - Provides two desktop / Notification Center widgets:
     - **`TodayMessMenuWidget` (`2x1` / `.systemMedium`)**: Compact view pinned to today's schedule (`is2x1Mode: true`).
     - **`WeeklyMessMenuWidget` (`2x2` / `.systemLarge` & `.systemMedium`)**: Full weekly view (`is2x1Mode: false`) featuring a top pill-shaped 7-day segmented bar, live meal status badge, two-column **MAIN COURSE** and **SIDE COURSE** layout, and a right-side vertical rail of circular meal-switcher icon buttons.

4. **Reverse-Engineered Newton LMS API Documentation (`documentation/`)**:
   - [`documentation/NEWTON_API_REFERENCE.md`](documentation/NEWTON_API_REFERENCE.md): Complete specification of Newton School LMS REST APIs (`/api/v1/`, `/api/v2/`), OAuth/Bearer headers, course hierarchy, Judge0 remote code execution (`https://judge0-public.newtonschool.co`), attendance endpoints, QR attendance, XP/leaderboards, and Firebase Realtime Database authentication.
   - [`documentation/NEWTON_QUIZ_API_SPECIFICATION.md`](documentation/NEWTON_QUIZ_API_SPECIFICATION.md): Deep-dive specification of the Quizzes & Assessments state machine, error codes (`E179`, `E221`, `E1081`), option marking payloads, time-gated solution retrieval, and CLI/TUI implementation blueprints.

---

## 2. Complete Repository Directory & File Map

```text
/Users/swap/Developer/newNewton/
├── README.md                                  # Root user & architecture guide for the Chrome extension
├── context.md                                 # This comprehensive AI engineering context document
├── package.json                               # Node.js build scripts ("build", "test" -> node scripts/build.js) & devDeps (esbuild, terser)
├── menu.json                                  # Canonical weekly campus mess menu JSON served via GitHub raw URL
├── updates.xml                                # Google Update Protocol v2.0 manifest for Chrome auto-updates
├── skills-lock.json                           # Agent skills lockfile
├── .gitignore                                 # Git ignore rules (ignores node_modules, dist, auth-token, macos/build, etc.)
├── .github/
│   └── workflows/
│       └── deploy-and-release.yml             # CI/CD pipeline: runs build.js, packages .zip & signed .crx, updates updates.xml, publishes GitHub Release
├── scripts/
│   └── build.js                               # Pre-build validator (Deno/esbuild TS check + node --check JS) & Terser/esbuild minifier -> dist/extension
├── documentation/
│   ├── NEWTON_API_REFERENCE.md                # Full reverse-engineered Newton School LMS API specification
│   └── NEWTON_QUIZ_API_SPECIFICATION.md       # Deep-dive Quizzes & Assessments lifecycle and API specification
├── supabase/
│   ├── README.md                              # Clean-room security architecture & Supabase Mumbai configuration
│   ├── schema.sql                             # PostgreSQL DDL for public.quizzes table, indexes, and read-only RLS policies
│   └── functions/
│       └── sync-quizzes/
│           └── index.ts                       # Deno Edge Function handling ARCHIVE_ONE and SYNC_ALL against Newton LMS
├── extension/                                 # Chrome Extension source root (Manifest V3)
│   ├── manifest.json                          # MV3 manifest (v1.2.2, appid: colbeijnblfedgifoekbhiflkohipnkp)
│   └── src/
│       ├── theme-init.js                      # [Classic Script] Synchronous <head> script preventing popup theme FOUT
│       ├── telemetry-blocker.js               # [Classic Script, world: MAIN, document_start] Tracker Proxy stubs + fetch/XHR/beacon + auth/SPA hooks
│       ├── content.js                         # [Classic Script, world: ISOLATED, document_start] Grauity theme enforcer + token sync + quiz event relay
│       ├── background.js                      # [ES Module Service Worker] declarativeNetRequest rules + cookie auth listener + background quiz submission runner
│       ├── quiz-client.js                     # [ES Module] Supabase PostgREST client, LMS quiz discovery, question matcher, and automated quiz solver
│       ├── popup.html                         # Extension popup DOM structure (4 tabs: Utilities, Mess Menu, Attendance, Mystery)
│       ├── popup.css                          # Material 3 / Grauity-inspired Light & Dark mode CSS variables and component styles
│       ├── popup.js                           # [ES Module] Popup UI controller for all 4 tabs, Lazy Submit sliders, Web Audio chime, and live banner
│       ├── menu.json                          # Bundled offline fallback mess menu inside extension package
│       ├── attendance/
│       │   ├── grouping.js                    # [ES Module] Pure course-name parser & Theory/Lab subject grouping engine
│       │   ├── math.js                        # [ES Module] Pure attendance arithmetic (combine, skipsAffordable, classesToRecover, summarize)
│       │   └── portal-api.js                  # [ES Module] Concurrent LMS attendance & lecture fetcher (MAX_CONCURRENT = 4)
│       └── icons/
│           ├── icon16.png
│           ├── icon48.png
│           └── icon128.png
└── macos/                                     # Native macOS App & WidgetKit Extension
    ├── README.md                              # macOS WidgetKit architecture and usage guide
    ├── build.sh                               # Standalone CLI swiftc build, ad-hoc codesign, and /Applications installer script
    ├── Resources/
    │   ├── App-Info.plist                     # Host app Info.plist (com.newton.enhancer, LSUIElement = true)
    │   ├── Extension-Info.plist               # Widget extension Info.plist (com.newton.enhancer.widgets)
    │   ├── App.entitlements                   # Sandbox + network.client + group.com.newton.enhancer
    │   ├── Extension.entitlements             # Sandbox + network.client + group.com.newton.enhancer
    │   └── menu.json                          # Bundled offline mess menu for macOS app
    ├── Sources/                               # Source tree used by standalone CLI build.sh
    │   ├── Shared/
    │   │   ├── NewtonTheme.swift              # Dark theme color tokens matching extension
    │   │   ├── DishClassifier.swift           # Main course vs. Side course classifier
    │   │   ├── MenuModel.swift                # DailyMenu, WeeklyMenu, DayOfWeek, MealType models & timing logic
    │   │   ├── MenuDataManager.swift          # App Group UserDefaults state, caching, & GitHub remote refresh
    │   │   └── DayIntents.swift               # AppIntents (SelectDayIntent, SelectMealIntent, Next/Prev Day/Meal, TodayIntent)
    │   ├── App/
    │   │   ├── MainApp.swift                  # NSApplication entry point for CLI build
    │   │   ├── AppDelegate.swift              # Initializes MenuBarController and triggers background remote refresh
    │   │   └── MenuBarController.swift        # macOS status bar icon (fork.knife) and dropdown menu
    │   └── Widgets/
    │       ├── MessMenuView.swift             # SwiftUI widget UI (2x2 & 2x1 modes)
    │       ├── MessMenuWidget.swift           # TimelineEntry, TimelineProvider, TodayMessMenuWidget, WeeklyMessMenuWidget
    │       └── NewtonWidgetsBundle.swift      # @main WidgetBundle
    └── newNewton/                             # Xcode Project ( Synchronized Root Groups )
        ├── newNewton.xcodeproj/
        │   └── project.pbxproj                # Xcode 16+ project with PBXFileSystemSynchronizedRootGroup for newNewton & newNewtonWidgets
        ├── newNewton/                         # Host App Target (bundle ID: new.newton)
        │   ├── MyApp.swift                    # SwiftUI @main App with EmptyView Settings scene
        │   ├── NewtonTheme.swift
        │   ├── DishClassifier.swift
        │   ├── MenuModel.swift
        │   ├── MenuDataManager.swift
        │   ├── DayIntents.swift
        │   ├── MessMenuView.swift
        │   ├── MessMenuWidget.swift
        │   └── Assets.xcassets/
        └── newNewtonWidgets/                  # WidgetKit Extension Target (bundle ID: new.newton.widgets)
            ├── newNewtonWidgetsBundle.swift   # @main WidgetBundle registering TodayMessMenuWidget & WeeklyMessMenuWidget
            ├── NewtonTheme.swift
            ├── DishClassifier.swift
            ├── MenuModel.swift
            ├── MenuDataManager.swift
            ├── DayIntents.swift
            ├── MessMenuView.swift
            ├── MessMenuWidget.swift
            ├── Info.plist
            └── Assets.xcassets/
```

---

## 3. Subsystem 1: Chrome Extension Architecture (`extension/`)

### 3.1 Execution Contexts & Script Types

Chrome Manifest V3 strictly separates execution contexts. Furthermore, [`scripts/build.js`](scripts/build.js) minifies files differently depending on whether they are **Classic Scripts** or **ES Modules**:

| File | Context / World | Run Timing | Module Type | Primary Role |
| :--- | :--- | :--- | :--- | :--- |
| `src/theme-init.js` | Popup `<head>` | Synchronous before CSS | **Classic IIFE** | Reads `localStorage.getItem('popup_theme_mode')` and applies `theme-dark` / `theme-light` / `theme-system` to `document.documentElement` before first paint. |
| `src/telemetry-blocker.js` | Content Script (`world: "MAIN"`) | `document_start` | **Classic IIFE** | Stubs window tracker globals via recursive `Proxy`, intercepts `sendBeacon`/`fetch`/`XHR`, hooks `Storage.prototype.setItem` and `history.pushState`/`replaceState`, and posts quiz/auth events via `window.postMessage`. |
| `src/content.js` | Content Script (`world: "ISOLATED"`) | `document_start` | **Classic IIFE** | Enforces Grauity theme classes on `document.body`, guards against Next.js class stripping via `MutationObserver`, extracts auth tokens & course hashes, and bridges `window.postMessage` <-> `chrome.runtime`. |
| `src/background.js` | Service Worker | Background | **ES Module** | Manages `declarativeNetRequest` dynamic rules, listens to `chrome.cookies.onChanged`, coordinates initial quiz sync, and runs the persistent background quiz auto-submission state machine. |
| `src/popup.js` | Extension Popup | `defer` (module) | **ES Module** | Drives the 4-tab popup interface (`Utilities`, `Mess Menu`, `Attendance`, `Mystery`), caches state in `chrome.storage`, and communicates with `background.js` and `content.js`. |
| `src/quiz-client.js` | Imported by `background.js` & `popup.js` | On import | **ES Module** | Handles Supabase PostgREST read queries, Edge Function invocations, LMS unsubmitted quiz discovery, question matching, and sequential quiz submission. |
| `src/attendance/*.js` | Imported by `popup.js` & `quiz-client.js` | On import | **ES Module** | `grouping.js` (subject/lab pairing), `math.js` (skip/recovery arithmetic), and `portal-api.js` (LMS attendance API fetching). |

---

### 3.2 Dual-Layer Telemetry & Diagnostic Blocker

Newton School's Next.js SPA embeds numerous analytics SDKs and internal telemetry endpoints. Blocking network requests alone causes unhandled `TypeError` crashes when React components call `window.mixpanel.track(...)` or `window.clarity(...)`. `newNewton` prevents both tracking and crashes via two layers:

#### Layer 1: Network Blocking (`src/background.js`)
- Uses `chrome.declarativeNetRequest.updateDynamicRules` with rule IDs starting at `RULE_ID_OFFSET = 1000`.
- Scoped via `initiatorDomains: ['newtonschool.co', 'my.newtonschool.co']`.
- Blocks 24 URL filters (`TELEMETRY_FILTERS`):
  - Google Analytics / GTM: `||google-analytics.com`, `||analytics.google.com`, `||googletagmanager.com`
  - Microsoft Clarity: `||clarity.ms`, `||c.clarity.ms`
  - Product Analytics: `||mixpanel.com`, `||api.mixpanel.com`, `||clevertap.com`, `||wizrocket.com`, `||openpanel.dev`, `||api.openpanel.dev`, `||openpanel-api.newtonschool.co`
  - Ad Pixels & Heatmaps: `||facebook.com/tr`, `||connect.facebook.net`, `||px.ads.linkedin.com`, `||snap.licdn.com`, `||trc.taboola.com`, `||q.quora.com`, `||hotjar.com`
  - Error/Session Replay: `||sentry.io`, `||datadoghq.com`, `||fullstory.com`, `||logrocket.io`
  - Newton Internal Diagnostics: `||newtonschool.co/api/v1/user/report/`
- Updates are serialized through a promise chain (`syncRulesQueue`) to prevent race conditions on rapid toggle clicks.

#### Layer 2: Main-World In-Page Stubs & Interceptors (`src/telemetry-blocker.js`)
- Reads initial state synchronously from `localStorage.getItem('newton_enhancer_block_telemetry')` (default `true`).
- **Recursive Proxy Stub (`createStubProxy`)**:
  - Installed on `window.clarity`, `window.mixpanel`, `window.clevertap`, `window.openpanel`, `window.op`, `window.fbq`, `window.lintrk`, `window.qp`, `window.gtag`, `window.ga`.
  - Any property access (`mixpanel.people.set`) or function invocation returns the proxy itself without throwing.
  - Returns `undefined` for `then` and `Symbol.toPrimitive` so the proxy is never mistaken for a Promise or primitive value.
  - Overrides `window.dataLayer.push` to no-op while blocking is enabled.
- **API Interception (`isTelemetryUrl` matching `BLOCKED_PATTERNS`)**:
  - `navigator.sendBeacon(url, data)`: Returns `true` immediately without sending network traffic.
  - `window.fetch(input, init)`: Resolves with synthetic `200 OK` JSON response `{"blocked":true,"status":"ok","source":"newton-enhancer"}`.
  - `XMLHttpRequest.prototype.send`: Sets `readyState = 4`, `status = 200`, `responseText = '{"blocked":true,"status":"ok"}'`, and asynchronously dispatches `readystatechange`, `load`, and `loadend` events.

---

### 3.3 Native Grauity Theme Switcher (`src/content.js` & `src/popup.js`)

1. **Mechanism**:
   - Newton School's internal design system ("Grauity") defines dark mode via the `grauity-theme-dark` class and light mode via `grauity-theme-light` on `document.body`.
   - `applyGrauityTheme(themeName)` swaps `grauity-theme-dark` / `grauity-theme-light` on `document.body` and writes Newton's internal `localStorage` keys:
     - `localStorage.setItem('theme-preference', JSON.stringify({ themeName, enable_platform_wide_dark_theme: isDark }))`
     - `localStorage.setItem('app_theme_enabled', isDark ? 'true' : 'false')`
2. **Next.js Route Protection**:
   - A `MutationObserver` watches `document.body` (`attributes: true, attributeFilter: ['class']`) and immediately restores `grauity-theme-dark` or `grauity-theme-light` if Next.js client-side navigation strips or overwrites body classes.
3. **3-Mode Support**:
   - Supports `'light'`, `'dark'`, and `'system'` (tracked via `window.matchMedia('(prefers-color-scheme: dark)')`).

---

### 3.4 Portal Authentication & Course Hash Capture Pipeline

Student authentication tokens (`Bearer <token>`) are captured automatically across multiple channels and sanitized via `extractCleanAuthToken(raw)` (which handles plain JWTs, `"Bearer ..."` strings, and up to 3 levels of nested JSON stringification):

1. **In-Page `Storage.prototype.setItem` Hook (`telemetry-blocker.js`)**:
   - Intercepts writes to `auth-token`, `token`, `access_token`, `authToken`, `auth_token`, `access_token_ns_student_web` and posts `newton-enhancer-token-captured`.
2. **In-Page `fetch` & `XMLHttpRequest` Header Inspection (`telemetry-blocker.js`)**:
   - Extracts `Authorization` request headers on live API calls and broadcasts `newton-enhancer-token-captured`.
3. **Content Script Storage & Cookie Scanner (`content.js` -> `getRawPortalToken()`)**:
   - Checks `localStorage`, `sessionStorage`, and `document.cookie` (`access_token_ns_student_web`), plus extracts `courseHash` from URL (`/course/h/{courseHash}`), `localStorage`, or `<a href*="/course/">` DOM links.
   - Saves `nst_auth_token`, `nst_portal_uid`, `nst_portal_course_hash`, and `nst_portal_last_seen` to `chrome.storage.local` and sends `PORTAL_AUTH_UPDATED` to `background.js`.
4. **Background Cookie Listener (`background.js`)**:
   - Listens to `chrome.cookies.onChanged` for `access_token_ns_student_web` on `newtonschool.co` and triggers `checkAndTriggerInitialSync()`.

---

### 3.5 Campus Mess Menu Subsystem (`extension/src/popup.js` & `menu.json`)

- **Data Source**: Fetched from `https://raw.githubusercontent.com/suwupnil/newNewton/refs/heads/main/menu.json` (maintained upstream by [Garvit-png](https://github.com/Garvit-png)).
- **Weekly Cache Invalidation (`isCacheExpired`)**:
  - Cached in `chrome.storage.local` under `mess_menu_data` and `mess_menu_last_fetched`.
  - Automatically invalidates when `lastFetched < getMostRecentMondayTimestamp()` (most recent Monday at `00:00:00` local time) or when older than 7 days.
  - Renders cached data immediately (`0ms` latency) while refreshing in the background; falls back to `FALLBACK_MENU` / `extension/src/menu.json` when offline.
- **Meal Windows (`MEAL_CONFIG`)**:
  - `breakfast`: `07:30 - 09:30 AM` (`startMin: 450`, `endMin: 570`)
  - `lunch`: `12:00 - 02:30 PM` (`startMin: 720`, `endMin: 870`)
  - `snacks`: `04:30 - 06:30 PM` (`startMin: 990`, `endMin: 1110`)
  - `dinner`: `07:30 - 09:30 PM` (`startMin: 1170`, `endMin: 1290`)
- **Dish Classification (`isSecondaryItem` in `popup.js` / `DishClassifier.swift` in `macos/`)**:
  - Separates signature dishes (`✨ Special & Main`) from everyday staples (`Daily Staples` / `SIDE COURSE` such as milk, tea, coffee, bread/butter/jam, chapati, rice, salad, chutney, ketchup, sambar, rasam, curd, pickle).

---

### 3.6 Attendance Subsystem (`extension/src/attendance/`)

Adapted from [`nst-attendance`](https://github.com/yats0x7/nst-attendance) by `yats0x7`:

1. **`grouping.js` — Pairing Theory & Practical Courses**:
   - `parseCourseName(name)`: Strips trailing section tokens (`SECTION_RE`: `/^(.*?)\s*[-–—]\s*([A-Za-z0-9]+)\s*$/`, e.g., `" - B"`) and detects trailing practical markers (`PRACTICAL_RE`: `Lab`, `Practical`, `Prac`, `Tutorial`, `Tut`, `Workshop`, `Recitation`, `Seminar`, `Studio`, `Discussion` + optional index).
   - `groupUnits(units, overrides)`: Strips a practical marker **only** when `stripIsSafe` is true—meaning another unit in the same semester shares the stripped base key (`plainKeys.has(p.key)` or `strippedCounts.get(p.key) > 1`). This prevents standalone courses like `"AI Studio"` from being falsely merged into an unrelated subject.
2. **`math.js` — Pure Attendance Arithmetic**:
   - `DEFAULT_TARGET = 0.75`, `EPS = 1e-9` (floating-point guard so rationals like `15 / 0.75` do not floor below integer boundaries).
   - `combine(units)`: Sums raw `attended` and `held` counts across a subject's Theory + Lab units (clamping each unit's `attended <= held`). Never averages percentages across unequal unit sizes.
   - `skipsAffordable(attended, held, target)`: $\max\left(0, \lfloor \frac{\text{attended}}{\text{target}} + \epsilon \rfloor - \text{held}\right)$.
   - `classesToRecover(attended, held, target)`: $\lceil \frac{\text{target} \cdot \text{held} - \text{attended}}{1 - \text{target}} - \epsilon \rceil$ when below target, else `0`.
   - `summarize(units, { target, remaining })`: Produces `headline` (`'no-data'`, `'unreachable'`, `'recover'`, or `'skips'`), `meetsTarget`, `skipsAffordable`, `classesToRecover`, and `projection`.
3. **`portal-api.js` — LMS Data Fetching**:
   - Uses a concurrency semaphore (`MAX_CONCURRENT = 4`) and 15-second `AbortController` timeout.
   - `resolveActiveSemester`: Checks `/api/v1/course/h/{hash}/course_redirection_details/` first, then falls back to `/api/v2/course/all/applied/?pagination=false&completed=false` (`is_active_admin_unit_course: true`).
   - `fetchFullAttendanceData`: Fetches `/api/v2/course/h/{semesterHash}/learning_course/all/?pagination=false`, then concurrently fetches `/self_performance/` and `/lecture/all/?pagination=false` for each unit, pairs units via `groupUnits`, computes verdicts via `summarize`, and extracts sorted `missedLectures` (`attended === false`) tagged by Theory vs. Lab component.

---

### 3.7 Mystery Tab: Quiz Solution Archiver & Auto-Solver (`quiz-client.js`, `background.js`, `popup.js`)

#### A. Clean-Room Security Model
- The extension client **never** writes to Supabase and **never** fetches quiz solutions directly from Newton LMS for archival.
- When a student logs in (`PORTAL_AUTH_UPDATED` / `TRIGGER_INITIAL_SYNC`) or submits a quiz (`newton-enhancer-quiz-submitted` -> `ARCHIVE_QUIZ`), the extension sends `{ action, authToken, courseHash, assessmentHash, uid }` to the Supabase Edge Function (`https://wwxqskccvcpimcgctskm.supabase.co/functions/v1/sync-quizzes`).
- The client only queries `https://wwxqskccvcpimcgctskm.supabase.co/rest/v1/quizzes` with `SELECT` using the public `anonKey` (`checkSolutionsInSupabase` and `batchCheckSolutionsInSupabase`).

#### B. Unsubmitted Quiz Discovery (`fetchUnsubmittedQuizzes`)
1. Fetches `/api/v2/course/all/applied/?pagination=false&completed=false`.
2. Filters strictly for degree programs where `is_parent_admin_unit_course === true`.
3. Collects all `admin_unit_courses` and child `learning_unit_courses`, and pairs them into subjects via `groupUnits` and `extractShortCourseName` (which maps `"Problem Solving and Programming"` -> `"PSP"`, `"System and AI Essentials"` -> `"S&AI"`, `"Mathematics-I"` -> `"Maths I"`).
4. Queries `/api/v2/course/h/{containerHash}/assessment/all/?pagination=false` (with fallback to `?limit=100&offset=0`).
5. Filters strictly for **unsubmitted** assessments:
   - `course_user_assessment_mapping === null` (never started) -> **Include**
   - `course_user_assessment_mapping.completed === false` (in progress) -> **Include**
   - `course_user_assessment_mapping.completed === true` (already submitted) -> **Exclude**
6. Computes deadline & XP halving:
   - If `Date.now() > deadlineTs`, `isPastDeadline = true` and `maxXP = Math.floor(rawXP / 2)` (matching Newton LMS's 50% late-submission XP rule).
7. Batch-checks all unsubmitted `assessmentHash` values against Supabase (`batchCheckSolutionsInSupabase`), filters out placeholder assessments with `totalQuestions === 0`, and groups results into `groupedBySubject[subjectLabel] = { subjectKey, subjectLabel, lectures: [], labs: [], quizzes: [] }`.

#### C. Question Matching & Answer Resolution (`submitQuizWithSupabaseSolutions`)
1. **Honor Code Pre-Check**: Calls `GET /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/instructions/`. If `honor_code` is required and not yet acknowledged, posts `{ acknowledged: true }` to `/api/v1/integrated_assessments/{courseHash}/h/{assessmentHash}/honor_code/`.
2. **Attempt Session Initialization**: Calls `GET .../questions/?new_attempt=true`; if an attempt is already active, falls back to `GET .../questions/` to resume.
3. **4-Tier Question Matching (`findMatchingDbQuestion`)**:
   - **Tier 1**: Match `activeQ.multiple_choice_question.hash` against `dbQ.mcqHash` or `dbQ.questionHash`.
   - **Tier 2**: Match `activeQ.hash` against `dbQ.questionHash` or `dbQ.mcqHash`.
   - **Tier 3**: Match normalized, HTML-stripped `question_text` (`cleanHtmlText`, length > 10).
   - **Tier 4**: Positional array index fallback (`dbQuestions[index]`).
4. **Shuffle-Safe Answer Value Resolution (`determineAnswerValue`)**:
   - For MCQ (`question_type === 1`): Finds the stored correct option text in `dbQ.options` and compares `cleanHtmlText(mcq['choice_' + letter + '_text'])` across `A..E` in the live attempt so shuffled options still resolve to the right letter (`"A"`–`"E"`).
   - For Numerical / Puzzle / Fill-in-the-blanks (`question_type === 2 | 3`): Returns `String(dbQ.correctPuzzleAnswer ?? dbQ.input_answer ?? dbQ.correctChoice ?? '')`.
5. **Sequential Question Marking**:
   - For each question `i`:
     1. Posts `{ hash: activeQ.hash }` to `POST .../question/` to record `viewed_at` on the server.
     2. If **Lazy Submit** is enabled (and not fast-forwarded), waits `computeQuestionDelay(baseDelaySec, entropySec)` seconds via `pauseableDelay`.
     3. Posts `{ hash: activeQ.hash, value: answerVal, input_answer: answerVal, client_marked_at: Date.now() }` to `POST .../question/`.
6. **Finalization**:
   - Calls `POST /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/questions/?auto_submit=false` with `{}`.

#### D. Lazy Submit Math & Background Runner (`background.js` & `popup.js`)
- **Non-Linear Slider Mapping (`power = 2.6`)**:
  - `sliderPosToSeconds(pos, minSec = 1, maxSec = 1000, power = 2.6)`: Maps slider range `0..1000` with 1s granularity for `<= 30s`, 2s steps for `<= 120s`, 5s steps for `<= 300s`, and 10s steps up to `1000s`.
  - `computeQuestionDelay(baseDelaySec, entropySec)`: Clamps `entropy <= base`, then returns $\max(0.1, \text{base} \pm \text{rand}(0, \text{entropy}))$.
- **Background Execution**:
  - `runBackgroundSubmission` runs inside `background.js` with a 15-second `keepAliveTimer` (`chrome.storage.local.get('_sw_keepalive')`) so closing the popup does not interrupt multi-minute Lazy Submit runs.
  - Broadcasts real-time state updates (`SUBMISSION_STATE_UPDATE`, `QUIZ_SUBMITTED_SUCCESS`, `QUIZ_SUBMITTED_ERROR`) and persists `nst_submission_state` in `chrome.storage.local`.

---

## 4. Subsystem 2: Supabase Cloud Backend (`supabase/`)

### 4.1 Database Schema (`supabase/schema.sql`)
- **Project URL**: `https://wwxqskccvcpimcgctskm.supabase.co` (AWS `ap-south-1` Mumbai)
- **Table `public.quizzes`**:
  - `assessment_hash` (`text primary key`)
  - `course_hash` (`text`, indexed via `idx_quizzes_course_hash`)
  - `title` (`text`)
  - `total_questions` (`integer not null default 0`)
  - `has_answers_revealed` (`boolean not null default false`, indexed via `idx_quizzes_has_answers`)
  - `questions` (`jsonb not null default '[]'::jsonb`)
  - `archived_by_uid` (`text`)
  - `created_at` / `updated_at` (`timestamptz`)
- **Row-Level Security (RLS) & Privileges**:
  - `alter table public.quizzes enable row level security;`
  - Policy `"Allow public read access"` permits `SELECT` for all roles (`using (true)`).
  - `revoke insert, update, delete on table public.quizzes from anon, authenticated;` guarantees clients cannot spoof or overwrite quiz solutions.

### 4.2 Normalized Question JSONB Schema (`questions` column)
Each element in `public.quizzes.questions` is normalized by `normalizeNewtonQuestions()` in [`supabase/functions/sync-quizzes/index.ts`](supabase/functions/sync-quizzes/index.ts):
```json
{
  "questionHash": "<question_response_mapping_hash>",
  "mcqHash": "<mcq_internal_hash>",
  "questionText": "<p>HTML question prompt...</p>",
  "questionType": 1,
  "marks": 2,
  "options": [
    { "id": "A", "text": "<span>Option A</span>", "image": null },
    { "id": "B", "text": "<span>Option B</span>", "image": null }
  ],
  "correctChoice": 2,
  "correctChoiceLetter": "B",
  "correctExplanation": "<p>Explanation HTML...</p>",
  "correctPuzzleAnswer": null
}
```

### 4.3 Edge Function Actions (`supabase/functions/sync-quizzes/index.ts`)
- **`ARCHIVE_ONE`**:
  1. Checks if `assessment_hash` already exists with `has_answers_revealed === true` (returns `CACHE_HIT` if so).
  2. Fetches `GET https://my.newtonschool.co/api/v1/course/h/${courseHash}/assessment/h/${assessmentHash}/questions/` using the student's `Bearer ${token}`.
  3. Normalizes questions, sets `hasSolutions = normalized.some(q => q.correctChoice !== null || q.correctExplanation !== null)`, and upserts into `public.quizzes`.
- **`SYNC_ALL`**:
  1. If `courseHash` is omitted, resolves the active `admin_unit_course` from `/api/v2/course/all/applied/?pagination=false&completed=false`.
  2. Fetches completed assessments via `/api/v2/course/h/${activeCourse}/assessment/all/?attempt_statuses=3&limit=100&offset=0`.
  3. Filters out hashes already stored in `public.quizzes` with `has_answers_revealed = true`, then sequentially fetches `/questions/` for each missing assessment and upserts into `public.quizzes`.

---

## 5. Subsystem 3: macOS Native App & WidgetKit Extension (`macos/`)

### 5.1 Dual Build Architecture (CRITICAL FOR AI AGENTS)
The `macos/` folder maintains **two parallel source trees** that must be kept in sync whenever shared models, intents, or widget views are edited:
1. **Xcode Project (`macos/newNewton/`)**:
   - Uses Xcode 16's `PBXFileSystemSynchronizedRootGroup`, which automatically compiles every `.swift` file inside:
     - `macos/newNewton/newNewton/` (App target `newNewton`, bundle ID `new.newton`)
     - `macos/newNewton/newNewtonWidgets/` (WidgetKit extension target `newNewtonWidgetsExtension`, bundle ID `new.newton.widgets`)
2. **CLI Build Script (`macos/Sources/` + `macos/build.sh`)**:
   - Compiles `NewtonEnhancer.app` (`com.newton.enhancer`) and `NewtonWidgetsExtension.appex` (`com.newton.enhancer.widgets`) using `swiftc -O -target arm64-apple-macos14.0`, signs with ad-hoc entitlements, installs to `/Applications/NewtonEnhancer.app`, registers with `lsregister`, and restarts `NotificationCenter`.

> **Rule**: Whenever modifying `MessMenuView.swift`, `MessMenuWidget.swift`, `MenuModel.swift`, `MenuDataManager.swift`, `DishClassifier.swift`, `NewtonTheme.swift`, or `DayIntents.swift`, **always update all three locations**:
> - `macos/newNewton/newNewton/<File>.swift`
> - `macos/newNewton/newNewtonWidgets/<File>.swift`
> - `macos/Sources/{Shared|Widgets}/<File>.swift`

### 5.2 Widget Configurations (`MessMenuWidget.swift` & `newNewtonWidgetsBundle.swift`)
1. **`TodayMessMenuWidget`**:
   - `kind`: `"com.newton.enhancer.widget.today"`
   - Display Name: `"Today's Mess Menu (2x1)"`
   - Supported Families: `[.systemMedium]`
   - Renders `MessMenuView(..., is2x1Mode: true)`: strictly displays today's menu (`entry.todayDay`, `entry.todayMenu`, `entry.todayMeal`) without the top day navigation bar, limiting visible items per column to `maxAllowed = 4` (showing `3` items + `"+N more"` pill when `> 4`).
2. **`WeeklyMessMenuWidget`**:
   - `kind`: `"com.newton.enhancer.widget.menu"`
   - Display Name: `"Campus Mess Menu (2x2)"`
   - Supported Families: `[.systemMedium, .systemLarge]`
   - In `.systemLarge`, renders `MessMenuView(..., is2x1Mode: false)` with the top 7-day pill bar (`daySegmentedBar`) and up to `maxAllowed = 7` items per column (showing `6` items + `"+N more"` pill when `> 7`).

### 5.3 Widget UI Layout & Styling (`MessMenuView.swift`)
- **Top Day Navigation Bar (`daySegmentedBar`, shown when `!is2x1Mode`)**:
  - Uses a fully rounded `Capsule()` outer background (`Color.white.opacity(0.06)`) and subtle outer stroke (`Color.white.opacity(0.08)`).
  - Uses a single persistent sliding `Capsule().fill(Color.white.opacity(0.18))` inside a `GeometryReader` background with `.offset(x: xOffset)` and `.animation(.spring(response: 0.3, dampingFraction: 0.82), value: day)` so the active day pill glides smoothly across the bar when switching days (with **no** outline/border stroke on the focused day pill).
  - Each day button (`daySegmentContent`) displays only the 3-letter day abbreviation (`Mon`..`Sun`) with **no dot indicator** underneath, using `NewtonTheme.orange` for today's text when unselected and `.white` when selected.
  - Interactive via `SelectDayIntent(day: d)`.
- **Meal Header (`mealHeaderView`)**:
  - Displays the meal's SF Symbol (`cup.and.saucer.fill`, `fork.knife`, `mug.fill`, `moon.stars.fill`) colored with `selectedMeal.accentColor`, Title-Case meal name, `"TODAY"` capsule badge, and a right-aligned live status capsule (`"Serving Now"` with green dot or `timeRangeString`).
- **Two-Column Course Breakdown (`courseColumnsView`)**:
  - Splits items via `DishClassifier.classify(items)` into `MAIN COURSE` (left column, accented header + count badge) and `SIDE COURSE` (right column, muted header + count badge) separated by a `1pt` vertical divider (with **no** vertical divider line between `courseColumnsView` and `mealIconsRail`).
- **Right-Side Vertical Meal Icons Rail (`mealIconsRail`)**:
  - Vertically centered (`HStack(alignment: .center)` + `.frame(maxHeight: .infinity, alignment: .center)`) stack of 4 interactive buttons (`SelectMealIntent(meal: m)`) for Breakfast, Lunch, Snacks, and Dinner.
  - Features a smooth sliding `Circle()` highlight in the `VStack` background (`.offset(y: yOffset)`) that glides vertically between meals with `.animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedMeal)`.
  - Each icon button (`mealIconContent`) uses a **fully circular `Circle()`** (`26x26pt`) fill (`Color.white.opacity(0.05)`) with **no outline/stroke** and hit-testing `.contentShape(Circle())` across both widget sizes (`is2x1Mode: true` and `is2x1Mode: false`).

---

## 6. Storage Keys, Message Bus & Design System Tokens

### 6.1 Chrome Storage & Web `localStorage` Keys

| Storage Area | Key | Type / Format | Description |
| :--- | :--- | :--- | :--- |
| `chrome.storage.sync` | `themeMode` | `'light' \| 'dark' \| 'system'` | User-selected theme mode. |
| `chrome.storage.sync` | `themeName` | `'light' \| 'dark'` | Resolved effective theme name. |
| `chrome.storage.sync` | `isThemeEnabled` | `boolean` | `true` when `themeName === 'dark'`. |
| `chrome.storage.sync` | `blockTelemetry` | `boolean` | Master toggle for telemetry blocker (default `true`). |
| `chrome.storage.local` | `activeTab` | `string` | Last active popup tab ID (`tabUtilities`, `tabMessMenu`, `tabAttendance`, `tabMystery`). |
| `chrome.storage.local` | `mess_menu_data` | `WeeklyMenu` object | Cached 7-day mess menu JSON from GitHub. |
| `chrome.storage.local` | `mess_menu_last_fetched` | `number` (unix ms) | Timestamp of last successful GitHub menu fetch. |
| `chrome.storage.local` | `nst_auth_token` | `string` | Sanitized Newton LMS Bearer token. |
| `chrome.storage.local` | `nst_portal_uid` | `string \| null` | Student UID extracted from portal storage. |
| `chrome.storage.local` | `nst_portal_course_hash` | `string \| null` | Most recently detected course hash from portal URL/DOM. |
| `chrome.storage.local` | `nst_portal_last_seen` | `number` (unix ms) | Timestamp of last auth token sync. |
| `chrome.storage.local` | `nst_attendance_data` | `object` | Cached attendance rollup object from `fetchFullAttendanceData`. |
| `chrome.storage.local` | `nst_attendance_target` | `number` | Selected safety threshold (`0.75`, `0.80`, or `0.85`). |
| `chrome.storage.local` | `nst_mystery_data` | `object` | Cached unsubmitted quizzes & subject groupings for Mystery tab. |
| `chrome.storage.local` | `nst_lazy_submit_enabled` | `boolean` | Whether Lazy Submit human-like delay is enabled. |
| `chrome.storage.local` | `nst_lazy_submit_delay` | `number` (seconds) | Base delay per question (`1` to `1000`, default `15`). |
| `chrome.storage.local` | `nst_lazy_submit_entropy` | `number` (seconds) | Random jitter bound (`0` to `delay`, default `5`). |
| `chrome.storage.local` | `nst_submission_state` | `object` | Live state of the background quiz submission runner. |
| `chrome.storage.local` | `quiz_history_synced_at` | `number` (unix ms) | Timestamp when `SYNC_ALL` completed on Supabase. |
| `chrome.storage.local` | `quiz_sync_summary` | `object` | `{ totalFound, alreadyExisted, newlyArchived }` from `SYNC_ALL`. |
| Page `localStorage` | `theme-preference` | JSON string | `{"themeName":"dark","enable_platform_wide_dark_theme":true}` on `my.newtonschool.co`. |
| Page `localStorage` | `app_theme_enabled` | `'true' \| 'false'` | Newton School internal dark mode flag. |
| Page `localStorage` | `newton_enhancer_block_telemetry` | `'true' \| 'false'` | Read synchronously at `document_start` by `telemetry-blocker.js`. |
| Popup `localStorage` | `popup_theme_mode` / `popup_theme_name` | `string` | Read synchronously by `theme-init.js` to prevent popup FOUT. |
| macOS `UserDefaults` (`group.com.newton.enhancer`) | `newton_menu_selected_day`, `newton_menu_day_offset`, `newton_menu_meal_override`, `newton_menu_last_updated` | `String` / `Int` / `Double` | Shared state between macOS container app and WidgetKit extension. |

---

### 6.2 Internal Message Bus (`chrome.runtime` & `window.postMessage`)

#### `window.postMessage` (Page `MAIN` World <-> `ISOLATED` Content Script)
- `source: 'newton-enhancer-token-captured'` -> `{ rawToken }`: Fired by `telemetry-blocker.js` when an auth token is written to `localStorage` or sent in `fetch`/`XHR` headers.
- `source: 'newton-enhancer-quiz-opened'` -> `{ courseHash, assessmentHash }`: Fired when `GET .../assessment/h/{hash}/(questions|instructions)` is intercepted.
- `source: 'newton-enhancer-quiz-submitted'` -> `{ courseHash, assessmentHash, authToken }`: Fired when `POST .../assessment/h/{hash}/questions` is intercepted.
- `source: 'newton-enhancer-telemetry'` -> `{ enabled }`: Fired by `content.js` to toggle `telemetry-blocker.js` in real time.
- `source: 'newton-enhancer-quiz-solutions-status'` -> `{ assessmentHash, exists, hasAnswers, data }`: Broadcast by `content.js` after checking Supabase for an opened quiz.

#### `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
- `SET_THEME` -> `{ themeName, targetClass, themeMode }`: Popup -> Content script.
- `SET_TELEMETRY_BLOCK` -> `{ blockTelemetry }`: Popup -> Background worker & Content script.
- `GET_TELEMETRY_STATUS` -> returns `{ blockTelemetry }`.
- `GET_PORTAL_AUTH` -> Popup -> Content script; returns `{ token, courseHash }`.
- `PORTAL_AUTH_UPDATED` -> `{ token, uid, courseHash }`: Content script -> Background worker (triggers initial historical quiz sync if pending).
- `TRIGGER_INITIAL_SYNC` -> `{ force }`: Triggers `checkAndTriggerInitialSync`.
- `CHECK_QUIZ_SOLUTIONS` -> `{ assessmentHash, courseHash }`: Content script -> Background worker (`checkSolutionsInSupabase`).
- `ARCHIVE_QUIZ` -> `{ courseHash, assessmentHash, authToken }`: Content script -> Background worker (`handleQuizSubmissionArchival`).
- `START_SUBMISSION` / `PAUSE_SUBMISSION` / `RESUME_SUBMISSION` / `STOP_SUBMISSION` / `FAST_FORWARD_SUBMISSION` / `GET_SUBMISSION_STATE`: Popup -> Background submission runner.
- `SUBMISSION_STATE_UPDATE` / `QUIZ_SUBMITTED_SUCCESS` / `QUIZ_SUBMITTED_ERROR`: Background submission runner -> Popup UI.

---

### 6.3 Design System & Color Tokens (`popup.css` & `NewtonTheme.swift`)

| Token Semantic | Light Mode (`popup.css`) | Dark Mode (`popup.css` & `NewtonTheme.swift`) | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-primary` / `bgPrimary` | `#ffffff` | `#16191d` (`rgb(22, 25, 29)`) | Primary surface background |
| `--bg-secondary` / `bgSecondary` | `#f6f7f9` | `#0b0c0e` (`rgb(11, 12, 14)`) | App / popup body background |
| `--bg-card` / `bgCard` | `#ffffff` | `#23282f` (`rgb(35, 40, 47)`) | Elevated card container |
| `--bg-hover` / `bgHover` | `#edeff3` | `#30363d` (`rgb(48, 54, 61)`) | Hover state & subtle borders |
| `--text-primary` / `textPrimary` | `#16191d` | `#ffffff` | Primary headings & dish names |
| `--text-secondary` / `textSecondary` | `#5b6271` | `#b2b9c7` (`rgb(178, 185, 199)`) | Secondary labels & descriptions |
| `--text-muted` / `textMuted` | `#8c95a6` | `#8c95a6` (`rgb(140, 149, 166)`) | Muted captions & timestamps |
| `--brand-primary` / `brandPrimary` | `#0673f9` | `#2989ff` (`rgb(41, 137, 255)`) | Primary accent & Dinner meal accent |
| `--success-color` / `success` | `#13b97c` | `#20c997` (`rgb(32, 201, 151)`) | Safe attendance, Serving Now, Lunch accent (macOS) |
| `--warning-color` / `warning` | `#f59e0b` | `#fbbf24` (`rgb(251, 191, 36)`) | Attendance recovery warning, Breakfast icon (popup) |
| `--orange-color` / `orange` | `#f97316` | `#fb923c` (`rgb(251, 146, 60)`) | Today highlight, Breakfast accent (macOS) |
| `--purple-color` / `purple` | `#8b5cf6` | `#a78bfa` (`rgb(167, 139, 250)`) | Snacks meal accent & Mystery badges |
| `--danger-color` | `#ef4444` | `#ff6b6b` | Unreachable attendance, Unsolved count, Stop button |

---

## 7. Build, Minification & CI/CD Pipeline

### 7.1 Local Build & Validation (`npm run build` / `node scripts/build.js`)
Running `npm run build` (or `npm test`) executes [`scripts/build.js`](scripts/build.js):
1. **Step 1 (Pre-Build Validation)**:
   - Validates [`supabase/functions/sync-quizzes/index.ts`](supabase/functions/sync-quizzes/index.ts) using `deno check` (or `npx esbuild --bundle --platform=neutral` fallback).
   - Runs `node --check` on every `.js` file inside `extension/`.
2. **Step 2 (Staging & Minification into `dist/extension`)**:
   - Copies `extension/` to `dist/extension/`.
   - Minifies JavaScript via `terser`:
     - Files in `esmFiles` (`src/background.js`, `src/popup.js`, `src/quiz-client.js`, `src/attendance/grouping.js`, `src/attendance/math.js`, `src/attendance/portal-api.js`) are minified with `--module --compress --mangle`.
     - Classic scripts (`src/content.js`, `src/telemetry-blocker.js`, `src/theme-init.js`) are minified with `--compress --mangle`.
   - Minifies CSS (`src/popup.css`) via `esbuild --minify`.
   - Compacts JSON files (`src/menu.json`), while keeping `manifest.json` pretty-printed (`2` spaces).
3. **Step 3 (Post-Build Integrity Verification)**:
   - Re-runs `node --check` on every minified `.js` file in `dist/extension` and verifies `manifest.json` (`version` and `key`).

### 7.2 Automated GitHub Release & CRX Signing (`.github/workflows/deploy-and-release.yml`)
On push to `main`:
1. Extracts `version` from `extension/manifest.json`.
2. Runs `node scripts/build.js` to generate `dist/extension`.
3. Packages `dist/newNewton-v{version}.zip` and signs `dist/newNewton.crx` using `npx crx3` and `secrets.CRX_PRIVATE_KEY` (matching public key in `manifest.json` -> extension ID `colbeijnblfedgifoekbhiflkohipnkp`).
4. Regenerates `updates.xml` with the new version and commits/pushes it back to `main` (`[skip ci]`).
5. Publishes a GitHub Release (`v{version}`) attaching `.zip`, `.crx`, and `updates.xml`.

---

## 8. Strict Engineering Rules & Instructions for AI Models

When making changes to this repository, any AI agent **MUST** adhere to the following rules:

### Rule 1: Preserve Chrome Extension Module Boundaries (`scripts/build.js`)
- `content.js`, `telemetry-blocker.js`, and `theme-init.js` are **Classic Scripts** (IIFEs), **not** ES Modules. Never add `import` or `export` statements to them unless you configure a bundler.
- `background.js`, `popup.js`, `quiz-client.js`, and `attendance/*.js` are **ES Modules**. If you add a new ES Module file under `extension/src/`, you **must** add its relative path (`'src/...'`) to the `esmFiles` array in [`scripts/build.js`](scripts/build.js) so Terser minifies it with `--module`.
- Always run `npm run build` after modifying any file in `extension/` or `supabase/` to verify syntax and minification integrity.

### Rule 2: Maintain Clean-Room Supabase Security
- **Never** add `INSERT`, `UPDATE`, or `DELETE` calls to the Chrome extension (`quiz-client.js`, `popup.js`, `background.js`). The client only has `SELECT` access via `SUPABASE_CONFIG.anonKey`.
- All quiz solution ingestion from Newton LMS and database writes to `public.quizzes` must occur exclusively inside [`supabase/functions/sync-quizzes/index.ts`](supabase/functions/sync-quizzes/index.ts) using `SUPABASE_SERVICE_ROLE_KEY`.

### Rule 3: Keep Dual-Layer Telemetry Blocking Crash-Proof
- If adding a new blocked domain or URL pattern, add it to **both**:
  1. `TELEMETRY_FILTERS` in [`extension/src/background.js`](extension/src/background.js) (for `declarativeNetRequest` network blocking).
  2. `BLOCKED_PATTERNS` in [`extension/src/telemetry-blocker.js`](extension/src/telemetry-blocker.js) (for `fetch`, `XMLHttpRequest`, and `navigator.sendBeacon` synthetic `200 OK` responses).
- If Newton School introduces a new global tracking SDK on `window`, stub it in `telemetry-blocker.js` using `createStubProxy('<name>')` so page scripts never throw `TypeError`.

### Rule 4: Do Not Inject Custom CSS Overrides onto `my.newtonschool.co` for Theming
- Theme switching on `my.newtonschool.co` must rely strictly on toggling Newton's native `grauity-theme-dark` and `grauity-theme-light` classes on `document.body` and syncing `localStorage` (`theme-preference` and `app_theme_enabled`) in [`extension/src/content.js`](extension/src/content.js).

### Rule 5: Keep All Three macOS Swift Source Locations Synchronized
- The macOS project has duplicate source files across the Xcode targets and the CLI build directory:
  1. [`macos/newNewton/newNewton/`](macos/newNewton/newNewton)
  2. [`macos/newNewton/newNewtonWidgets/`](macos/newNewton/newNewtonWidgets)
  3. [`macos/Sources/`](macos/Sources) (`Shared/` and `Widgets/`)
- Whenever editing any Swift model, intent, theme token, or widget view (`MessMenuView.swift`, `MessMenuWidget.swift`, `MenuModel.swift`, `MenuDataManager.swift`, `DishClassifier.swift`, `NewtonTheme.swift`, `DayIntents.swift`), apply the identical change across all three directories and verify compilation with:
  ```bash
  swiftc -typecheck -target arm64-apple-macos14.0 -parse-as-library \
    -framework WidgetKit -framework SwiftUI -framework AppKit -framework AppIntents \
    macos/newNewton/newNewtonWidgets/NewtonTheme.swift \
    macos/newNewton/newNewtonWidgets/DishClassifier.swift \
    macos/newNewton/newNewtonWidgets/MenuModel.swift \
    macos/newNewton/newNewtonWidgets/MenuDataManager.swift \
    macos/newNewton/newNewtonWidgets/DayIntents.swift \
    macos/newNewton/newNewtonWidgets/MessMenuView.swift \
    macos/newNewton/newNewtonWidgets/MessMenuWidget.swift \
    macos/newNewton/newNewtonWidgets/newNewtonWidgetsBundle.swift
  ```

### Rule 6: Preserve macOS Widget UI Design Invariants (`MessMenuView.swift`)
- **Top Day Segmented Bar (`daySegmentedBar`)**: Must remain a fully rounded pill (`Capsule()`) with a single `GeometryReader`-driven sliding `Capsule()` highlight (`.offset(x: xOffset)`) that glides smoothly between days, **no** circular/pill outline on the focused day, and **no** dot indicator below the day names.
- **Right-Side Vertical Meal Icons (`mealIconsRail` / `mealIconContent`)**: Must remain vertically centered (`HStack(alignment: .center)` + `.frame(maxHeight: .infinity, alignment: .center)`), with **no** vertical divider line beside the sidebar, and use borderless circular `Circle()` buttons (`26x26pt`, `.contentShape(Circle())`, no `.stroke` outline) in both `2x2` (`is2x1Mode: false`) and `2x1` (`is2x1Mode: true`) widget modes.

### Rule 7: Sync `menu.json` Across All Three Copies When Updating Offline Fallback Menus
- The weekly mess menu JSON exists in three places:
  1. [`/menu.json`](menu.json) (root file served via GitHub raw URL to all live clients)
  2. [`/extension/src/menu.json`](extension/src/menu.json) (bundled fallback in Chrome extension)
  3. [`/macos/Resources/menu.json`](macos/Resources/menu.json) (bundled fallback in macOS app/widgets)
- When updating the bundled menu data, update all three files (and optionally `FALLBACK_MENU` in `extension/src/popup.js`).

### Rule 8: Pure Attendance & Grouping Modules (`extension/src/attendance/math.js` & `grouping.js`)
- `math.js` and `grouping.js` must remain **100% pure and dependency-free** (no DOM, `window`, `fetch`, or `chrome.*` APIs) so they can be imported in any JavaScript runtime (`node --test`, service workers, or browser popups).
