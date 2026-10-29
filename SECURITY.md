# Security Policy

The newNewton team takes the security and privacy of our student users
seriously. We appreciate the responsible disclosure of any vulnerabilities found
in the browser extension, macOS native companion app, desktop widgets, or cloud
backend services.

---

## Supported Versions

Security patches and bug fixes are actively provided for the following versions:

| Version | Supported          | Status                                 |
| ------- | ------------------ | -------------------------------------- |
| 1.2.x   | :white_check_mark: | Currently supported & actively updated |
| < 1.2.0 | :x:                | End of life                            |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues,
discussions, or pull requests.**

If you believe you have discovered a vulnerability in newNewton:

1. **Email us directly:** Send a detailed security report to
   [sw@pnilpradhan.onmicrosoft.com](mailto:sw@pnilpradhan.onmicrosoft.com).
2. **Alternative (GitHub Private Vulnerability Reporting):** If enabled on the
   repository, you can submit a confidential advisory directly via the
   **Security** tab > **Report a vulnerability**.

### What to Include in Your Report

To help us triage and resolve the issue quickly, please include:

- A descriptive title and summary of the vulnerability.
- Affected component(s) (e.g., Chrome Extension, Firefox Extension, Safari Web
  Extension, macOS WidgetKit, Supabase Edge Function).
- Step-by-step instructions or Proof of Concept (PoC) scripts to reproduce the
  issue.
- Potential impact (e.g., token exposure, unauthorized data manipulation,
  Cross-Site Scripting).
- Any proposed remediation or mitigation steps if available.

### Response Timeline & Disclosure Process

- **Acknowledgement:** We will acknowledge receipt of your report within **48
  hours**.
- **Assessment:** We will validate the vulnerability and assess its severity
  within **5 business days**.
- **Fix & Patch:** Once confirmed, a fix will be developed, tested, and released
  as quickly as possible (typically within **14 business days**).
- **Public Disclosure:** We practice coordinated vulnerability disclosure. We
  ask that you maintain confidentiality until an official patch has been
  published and deployed to users.

---

## Security & Privacy Architecture Principles

newNewton is designed with privacy and defense-in-depth as core requirements:

### 1. Client-Side Only Data Storage

- Portal credentials, session cookies, and authentication tokens are kept
  strictly inside the user's local browser (`chrome.storage.local`) or macOS App
  Group storage (`group.com.newton.enhancer`).
- At no point are student passwords, attendance rollups, or personal LMS tokens
  transmitted to or collected by third-party servers.

### 2. Zero-Telemetry & Anti-Tracking Shield

- Dual-layer blocking (Manifest V3 `declarativeNetRequest` rules plus main-world
  proxy stubs) disables invasive user tracking (Clarity, Sentry, Mixpanel, and
  full-session DOM recording) on university portals.
- The extension does not contain any third-party analytics or behavioral
  tracking scripts.

### 3. Backend Isolation & Row-Level Security (RLS)

- The Supabase database enforces strict PostgreSQL Row-Level Security policies.
- The public anonymous key (`supabaseAnonKey`) distributed with the client is
  restricted to read-only access for validated resources.
- Sensitive validation, sync operations, and answer verification are executed
  exclusively by the serverless Deno Edge Function (`sync-quizzes`) under
  isolated `service_role` authority.

### 4. Minimal Manifest Host Permissions

- Host permissions in `manifest.json` are strictly scoped to the Newton School
  portal domains (`https://*.newtonschool.co/*`), the official Supabase backend,
  and GitHub Releases for updates.
- Local development origins (`127.0.0.1`, `localhost`) are automatically
  stripped from production distribution bundles during build time.

### 5. Safe Lazy-Submit Human Emulation

- Automated and batch quiz synchronization operations incorporate randomized
  jitter windows (`macLazyBaseDelaySec` ± `macLazyMaxJitterSec`) to emulate
  realistic human interaction speeds and prevent server denial-of-service.

---

## Safe Harbor & Researcher Protection

We support ethical security research. We will not take legal action against
security researchers who:

- Act in good faith and avoid privacy violations, data destruction, and service
  disruption.
- Comply with applicable laws and the guidelines set forth in this policy.
- Provide us a reasonable period of time to resolve the issue before making any
  details public.
