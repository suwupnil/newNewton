# newNewton

Campus companion & UX enhancer for Newton School of Technology. Multi-platform extension, native macOS WidgetKit suite, and clean-room LMS sync engine.

---

## Highlights

- **Native Grauity Theme Switcher** — Seamless 3-way toggle (Light / Dark / System) respecting Newton's internal Grauity design tokens without CSS injections. Next.js transition-resistant.
- **Privacy & Telemetry Blocker** — Dual-layer protection (Manifest V3 `declarativeNetRequest` + main-world proxy stubs) stopping Sentry, Clarity, Mixpanel, and telemetry tracking without breaking single-page app state.
- **Campus Mess Menu** — Real-time weekly menu with Monday auto-refresh, smart course separation (Main Course vs Side Course staples), live meal detection (`Serving Now` / `Next Up`), and a 7-day selector.
- **LMS Attendance Engine** — Rollup analytics, Theory + Lab course pairings, live 75% / 80% / 85% safety targets, skip budgets, and recovery streaks with missed class breakdowns.
- **Live Mystery Quizzes** — Unsubmitted quiz explorer, lecture/lab splits, clean-room answer syncing via Supabase Edge Functions, and human-paced Lazy Submit mode.
- **macOS WidgetKit Suite** — Native interactive desktop widgets (`1x1`, `2x1`, `2x2` Mess Menus, Attendance, and Mystery Quizzes) with gliding fluid pill bars and instant app-group token handoff.

---

## Architecture

newNewton is powered by a **Zero-Overhead Single-Spec Codegen Architecture**. All cross-platform constants—meal windows, course aliases, attendance heuristics, and design tokens—live in a single declarative specification directory.

```text
packages/shared-spec/definitions/
├── attendance-rules.json       # Targets (75/80/85%), Lazy Submit jitter windows
├── course-aliases.json         # Canonical course mappings ("PSP", "S&AI", etc.)
├── mess-rules.json             # Meal times, staple dish classifications
├── supabase-config.json        # Supabase API endpoint & anon configuration
└── theme-tokens.json           # Shared Dark/Light design tokens
```

During build time, `./build.sh` uses Bash + `jq` to compile these specs directly into:
- Native ES Modules for browser extensions (`extension/src/generated-specs.js`)
- Native Swift constants for WidgetKit & macOS host app (`NewtonSpecs.swift`)

No heavy foreign runtimes, no redundant sync logic.

---

## Platform Targets

### 1. Browser Extensions (Manifest V3)
Compatible with **Chrome**, **Firefox**, and **Safari**:
- **Utilities Tab** — Theme management, telemetry shield status, and instant one-click Portal Auth Token clipboard export.
- **Mess Menu Tab** — Weekly schedule, daily staples vs specials breakdown, and auto-updated cache.
- **Attendance Tab** — Live portal sync, safe skip calculations, and attendance health dials.
- **Mystery Tab** — Automated quiz verification, batch submissions, and question interval delays.

### 2. macOS Companion & Desktop Widgets
- **Menu Bar Host App (`new.newton`)** — Lightweight status-bar agent with native `NSAlert` auth onboarding and background sync.
- **Desktop WidgetKit Suite (`new.newton.widgets`)**:
  - **Today Mess Menu (`1x1` / `.systemMedium`)** — Immediate glance at today's active and upcoming meals.
  - **Weekly Mess Menu (`2x1` & `2x2` / `.systemLarge`)** — Gliding day pills, circular vertical meal rail, and up to 11 dishes per column.
  - **Attendance Tracker** — Live percentage dials, target ticks, and skip/attend verdicts.
  - **Mystery Quizzes** — Subject tab bars, unsubmitted lecture/lab columns, and macOS Lazy Submit toggle.

### 3. Supabase Clean-Room Backend
- Cloud infrastructure hosted on AWS Mumbai (`ap-south-1`).
- PostgreSQL with strict read-only Row-Level Security for public clients.
- `sync-quizzes` Deno Edge Function verifying questions and answers under `service_role` authority without exposing private keys to clients.

---

## Directory Structure

```text
newNewton/
├── packages/shared-spec/       # Single source of truth (JSON definitions)
├── scripts/
│   ├── codegen.js              # Spec compiler: JSON -> JS + Swift
│   └── build.js                # Minification, validation & multi-browser packaging
├── extension/                  # Manifest V3 extension source
│   ├── manifest.json
│   ├── rules.json              # Declarative telemetry blocking rules
│   └── src/
│       ├── background.js       # Service worker: sync & Lazy Submit
│       ├── telemetry-blocker.js# Main-world script: tracking proxy stubs
│       ├── content.js          # Isolated-world script: theme enforcement
│       ├── popup.html / .js    # 4-tab extension interface
│       ├── quiz-client.js      # Quiz extraction & Supabase client
│       └── attendance/         # Attendance rollup & skip calculator
├── macos/                      # Native macOS App & WidgetKit extension
│   ├── newNewton/              # Xcode workspace (Host App + Widgets + Safari Extension)
│   ├── Sources/                # CLI build mirror
│   └── build.sh                # Standalone swiftc build script
└── supabase/                   # Database schema & sync Edge Functions
```

---

## Getting Started

### Prerequisites
- Bash
- `jq`
- Standalone Go `esbuild`
- Xcode 16+ & macOS Sonoma / Sequoia (for macOS Companion & Widgets)

### Development & Build

1. **Clone the repository**:
   ```bash
   git clone https://github.com/suwupnil/newNewton.git
   cd newNewton
   ```

2. **Run Codegen & Build Extension**:
   ```bash
   ./build.sh
   ```
   *This compiles shared specs, validates TypeScript, and outputs minified distribution builds to `dist/`.*

3. **Load in Browser (Chrome / Brave / Edge)**:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the `dist/extension/` (or `extension/`) directory.

4. **Build macOS Companion & Widgets**:
   - Open `macos/newNewton/newNewton.xcodeproj` in Xcode.
   - Select the `newNewton` scheme and press `Cmd + R` to run the menu bar app.
   - Add the newNewton widgets to your macOS desktop or Notification Center.
   - Enter your Newton portal auth token via the menu bar item (`Paste / Update Portal Auth Token…`) or copy it directly with one click from the extension's Utilities tab.

---

## Updates

- **In-App Notifier** — The extension automatically checks GitHub Releases and highlights available updates beside the header.
- **Direct CRX & ZIP** — Packaged `.crx` and unpacked `.zip` builds are published with every release on [GitHub Releases](https://github.com/suwupnil/newNewton/releases/latest).
- **Google Update Protocol** — Native background updates via `updates.xml`.

---

## Acknowledgements

- **Mess Menu Upstream** — Weekly menu data maintained by [Garvit-png](https://github.com/Garvit-png).
- **Attendance Heuristics** — Rollup math inspired and adapted from [nst-attendance](https://github.com/yats0x7/nst-attendance) by [yats0x7](https://github.com/yats0x7).
