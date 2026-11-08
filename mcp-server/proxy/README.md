# newNewton Cloudflare Reverse Proxy

This Cloudflare Worker acts as a lightweight reverse proxy that forwards Newton LMS and Judge0 API calls from Cloudflare's trusted global edge network.

It solves Cloudflare WAF / AWS ALB bot challenges and datacenter IP blocks (such as requests originating from **Oracle Cloud Infrastructure (OCI)**, AWS EC2, GCP, Azure, or Hetzner).

---

## Architecture & Routing

```
[ Oracle Cloud VM ] 
   │  newton-mcp-server (stdio JSON-RPC)
   │  NEWTON_LMS_URL=https://<worker-name>.<subdomain>.workers.dev
   │  NEWTON_JUDGE0_URL=https://<worker-name>.<subdomain>.workers.dev
   ▼
[ Cloudflare Worker Edge (Proxy) ]
   ├── /submissions/*  ──────────────▶ https://judge0-public.newtonschool.co
   └── All other paths (/api/*, etc.) ─▶ https://my.newtonschool.co
```

- **LMS Routes** (`/api/*`, `/course/*`, `/assessment_v2/*`, etc.) automatically route to `https://my.newtonschool.co`.
- **Judge0 Execution Routes** (`/submissions/*`) automatically route to `https://judge0-public.newtonschool.co`.
- Both target domains share the same AWS ALB Mumbai infrastructure.
- Injects standard browser headers (`Origin`, `Referer`, `User-Agent`) to prevent bot detection.

---

## Option A: Deploy via Cloudflare Dashboard (1 Minute, Zero Terminal)

1. Log into your free [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, navigate to **Compute (Workers & Pages)** -> **Workers & Pages** -> click **Create Application** -> **Create Worker**.
3. Name your worker (e.g. `newton-proxy`) and click **Deploy**.
4. Click **Edit code** in the top right.
5. Replace the entire contents of `worker.js` with the code in [`worker.js`](worker.js).
6. Click **Deploy** (top right).
7. Copy your worker's public URL:
   ```text
   https://newton-proxy.<your-subdomain>.workers.dev
   ```

*(Optional Security)*:
To restrict the proxy so only your Oracle VM can use it:
- In your Worker page, go to **Settings** -> **Variables and Secrets**.
- Add an environment variable named `PROXY_SECRET` (e.g. `my-strong-password-123`).
- In your Oracle VM, set `export NEWTON_PROXY_SECRET="my-strong-password-123"`.

---

## Option B: Deploy via Wrangler CLI

If you have Node.js / Wrangler installed locally:

```bash
cd mcp-server/proxy
npx wrangler deploy
```

---

## Configuring the MCP Server on Oracle VM

On your Oracle Linux / Ubuntu VM, configure your environment variables:

```bash
# 1. Provide your Newton Auth Token
export NEWTON_AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsIn..."

# 2. Point LMS and Judge0 endpoints to your Cloudflare Worker URL
export NEWTON_LMS_URL="https://newton-proxy.<your-subdomain>.workers.dev"
export NEWTON_JUDGE0_URL="https://newton-proxy.<your-subdomain>.workers.dev"

# 3. (Optional) If you set PROXY_SECRET in Cloudflare:
export NEWTON_PROXY_SECRET="my-strong-password-123"

# 4. Run the native binary
./newton-mcp-server
```

### Claude Desktop / Cursor / Claude Code `claude_desktop_config.json` configuration on Oracle VM:

```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "/home/ubuntu/newton-mcp-server",
      "env": {
        "NEWTON_AUTH_TOKEN": "YOUR_PORTAL_TOKEN",
        "NEWTON_LMS_URL": "https://newton-proxy.<your-subdomain>.workers.dev",
        "NEWTON_JUDGE0_URL": "https://newton-proxy.<your-subdomain>.workers.dev",
        "NEWTON_PROXY_SECRET": "my-strong-password-123"
      }
    }
  }
}
```
