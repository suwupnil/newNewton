# Contributing to newNewton

First off, thank you for considering contributing to **newNewton**! 🎉

newNewton is an open-source campus companion and UX enhancer for Newton School
of Technology students. Whether you are fixing a bug, adding course aliases,
refining mess menu categorizations, optimizing macOS desktop widgets, or
improving privacy features, your contributions make university life better for
everyone.

Please take a moment to review this document before submitting your
contributions.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites & Development Setup](#prerequisites--development-setup)
4. [Development Workflow](#development-workflow)
   - [Zero-Overhead Spec Codegen](#1-zero-overhead-spec-codegen)
   - [Building Extensions with Native Build Script](#2-building-extensions-with-native-build-script)
   - [Testing in Browsers](#3-testing-in-browsers)
   - [Working on macOS Companion & Widgets](#4-working-on-macos-companion--widgets)
5. [Coding Guidelines & Standards](#coding-guidelines--standards)
6. [Submitting a Pull Request](#submitting-a-pull-request)
7. [Reporting Issues & Bugs](#reporting-issues--bugs)

---

## Code of Conduct

This project and everyone participating in it is governed by the
[newNewton Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are
expected to uphold this code. Please report unacceptable behavior to
[sw@pnilpradhan.onmicrosoft.com](mailto:sw@pnilpradhan.onmicrosoft.com).

---

## Architecture Overview

newNewton is designed around a **Zero-Overhead Single-Spec Codegen
Architecture**. All cross-platform constants—attendance heuristics, meal
windows, course aliases, and design tokens—live in a single declarative
directory:

```text
packages/shared-spec/definitions/
├── attendance-rules.json       # Targets (75/80/85%), Lazy Submit jitter windows
├── course-aliases.json         # Canonical course mappings ("PSP", "S&AI", etc.)
├── mess-rules.json             # Meal times, staple dish classifications
├── supabase-config.json        # Supabase API endpoints & public anon key
└── theme-tokens.json           # Dark/Light Grauity design tokens
```

During build time, `./build.sh` (using Bash and guaranteed `jq`) compiles these JSON
definitions directly into:

- Native ES Modules for browser extensions (`extension/src/generated-specs.js`)
- Native Swift constants for WidgetKit & macOS host app (`NewtonSpecs.swift`)

**Rule:** Never edit `extension/src/generated-specs.js` or `NewtonSpecs.swift`
directly! Always edit the source JSON specs in
`packages/shared-spec/definitions/` and re-run `./build.sh`.

---

## Prerequisites & Development Setup

### Core Tools

- **[jq](https://jqlang.github.io/jq/)** — Used by the Bash build script for
  reliable JSON parsing and serialization.
  Install on macOS with `brew install jq`.
- **Standalone [esbuild](https://esbuild.github.io/)** (Native Go binary) — Used
  for instant zero-runtime minification without Node, Deno, or `node_modules`:
  ```bash
  brew install esbuild
  ```
- **Git**

### Optional (For macOS App & Widgets)

- **macOS Sonoma (14.0+) or Sequoia (15.0+)**
- **Xcode 16+** with Command Line Tools (`xcode-select --install`)

---

## Development Workflow

### 1. Clone the Repository

```bash
git clone https://github.com/suwupnil/newNewton.git
cd newNewton
```

### 2. Zero-Overhead Spec Codegen & Native Build

Whenever you update or add course aliases, attendance targets, mess meal
definitions, or extension code, run the unified native build script:

```bash
./build.sh
```

This single command completes in **~0.07 seconds** and performs:

1. **Step 0:** Bash + `jq` compiles `packages/shared-spec/definitions/*.json` into:
   - `extension/src/generated-specs.js`
   - `macos/newNewton/newNewton/NewtonSpecs.swift`
   - `macos/newNewton/newNewtonWidgets/NewtonSpecs.swift`
   - `macos/Sources/Shared/NewtonSpecs.swift`
2. **Step 0.5:** Reads `extension/manifest.json` and synchronizes its version
   into `updates.xml`.
3. **Step 1:** Stages source files into `dist/extension/`.
4. **Step 2:** Minifies all JS and CSS with native Go `esbuild` and strips local
   development origins (`127.0.0.1`, `localhost`) from `manifest.json`.
5. **Step 3:** Generates Gecko Manifest V3 and packages the Mozilla Firefox
   archive `dist/newNewton-firefox.xpi`.
6. **Step 4:** Flattens resources and rewrites imports into
   `macos/newNewton/newNewtonSafariExtension/Resources/` for Xcode.
7. **Step 4.5:** If `.env/crx.pem` exists, signs the Chrome build as
   `dist/newNewton.crx` using `npx crx3`. Set `CRX_PRIVATE_KEY_PATH` to use a
   different key location; otherwise this step is skipped.

### 3. Testing in Browsers

#### Google Chrome / Brave / Edge / Arc

1. Open `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`).
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the directory:
   - For rapid development: select the `extension/` folder.
   - For testing production builds: select `dist/extension/`.
3. To produce a signed local package, place the private key at `.env/crx.pem`
   and run `./build.sh`; the output is `dist/newNewton.crx`.
4. Navigate to `https://my.newtonschool.co` to test.

#### Mozilla Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select `dist/firefox/manifest.json` (or the packaged
   `dist/newNewton-firefox.xpi`).
4. Test against `https://my.newtonschool.co`.

#### Apple Safari (macOS)

1. Open the Xcode workspace:
   ```bash
   open macos/newNewton/newNewton.xcodeproj
   ```
2. Build and run the `newNewton` scheme.
3. Open **Safari > Settings > Extensions** and enable **newNewton Extension**.

### 4. Working on macOS Companion & Widgets

The native macOS application is written in Swift and SwiftUI using WidgetKit:

- Open `macos/newNewton/newNewton.xcodeproj` in Xcode.
- Schemes available:
  - `newNewton` — Menu bar host agent.
  - `newNewtonWidgets` — Interactive WidgetKit widgets (`.systemMedium`,
    `.systemLarge`).
- Test interactive intents in the Xcode canvas preview or run the widget
  directly in Simulator / macOS Widget Gallery.

---

## Coding Guidelines & Standards

### JavaScript & Extension Code

- **Native ES Modules:** Use standard `import` / `export` syntax in extension
  files that are loaded as modules.
- **Zero Heavy Runtime Dependencies:** The extension frontend runs directly in
  the browser without third-party frameworks (React, Vue, etc.) to ensure
  instant 0ms load times and zero memory bloat.
- **Manifest V3 Conformance:**
  - Background processes must run as service workers in Chrome or ES modules in
    Firefox.
  - Telemetry blocking must use non-intrusive `declarativeNetRequest` rules
    alongside proxy stubs in `telemetry-blocker.js`.
  - Always respect permissions scoping. Do not add broad host permissions
    without justification.
- **Local Development Safety:** Do not commit hardcoded localhost secrets or
  local database service keys.

### Swift & SwiftUI Code

- Follow modern Swift concurrency standards (`async`/`await`, `@MainActor`).
- Keep WidgetKit timeline entries lightweight and deterministic.
- Share data between the host app and widgets using the App Group identifier
  (`group.com.newton.enhancer`).

---

## Submitting a Pull Request

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. **Make your changes** and test thoroughly across both extension and native
   targets if applicable.
3. **Verify the build passes locally**:
   ```bash
   ./build.sh
   ```
4. **Commit your changes** following clear commit messages:
   - `feat(...)`: New features or capabilities
   - `fix(...)`: Bug fixes
   - `perf(...)`: Performance optimizations
   - `refactor(...)`: Code restructuring without behavioral changes
   - `docs(...)`: Documentation updates
5. **Push to your fork** and open a Pull Request against the `main` branch.
6. Provide a concise description of your changes, screenshots or GIFs of any UI
   modifications, and details on which browsers/devices you tested.

---

## Reporting Issues & Bugs

- **Search Existing Issues:** Before opening a new issue, check the
  [GitHub Issues](https://github.com/suwupnil/newNewton/issues) tab to see if it
  has already been reported.
- **Bug Reports:** Please include:
  - Extension version or macOS app build version.
  - Browser name and version (e.g., Chrome 130, Firefox 131, Safari 18).
  - Clear steps to reproduce the bug.
  - Relevant console logs from DevTools (`Inspect Popup` or Browser Console).
- **Security Issues:** For vulnerabilities or security disclosures, please refer
  to our [Security Policy](SECURITY.md). Do not file public GitHub issues for
  sensitive security vulnerabilities.
