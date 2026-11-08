/**
 * newNewton LMS & Judge0 Cloudflare Reverse Proxy
 *
 * Bypasses cloud datacenter IP blocks (Oracle Cloud, AWS, GCP, Azure, Hetzner, etc.)
 * by routing LMS and Judge0 API calls through Cloudflare's trusted edge network.
 *
 * Automatic Routing:
 *  - Paths starting with /submissions/* -> https://judge0-public.newtonschool.co
 *  - All other paths (/api/*, /course/*, /assessment_v2/*, etc.) -> https://my.newtonschool.co
 *  - Manual override via request header: "x-target-host: <host>"
 *
 * Optional Security:
 *  - Configure PROXY_SECRET in Cloudflare Worker environment variables.
 *  - Pass matching "x-proxy-secret: <secret>" from newton-mcp-server (or NEWTON_PROXY_SECRET env var).
 */

export default {
  async fetch(request, env) {
    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. Validate optional secret authentication
    if (env.PROXY_SECRET) {
      const providedSecret = request.headers.get("x-proxy-secret");
      if (providedSecret !== env.PROXY_SECRET) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Missing or invalid x-proxy-secret header",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    // 3. Determine target destination host
    const incomingUrl = new URL(request.url);
    const targetHost =
      request.headers.get("x-target-host") ||
      (incomingUrl.pathname.startsWith("/submissions")
        ? "judge0-public.newtonschool.co"
        : "my.newtonschool.co");

    // Construct outbound URL preserving path, query params and fragments
    const targetUrl = new URL(request.url);
    targetUrl.protocol = "https:";
    targetUrl.hostname = targetHost;
    targetUrl.port = "";

    // 4. Clone and prepare headers for upstream
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.set("Host", targetHost);
    upstreamHeaders.delete("x-proxy-secret");
    upstreamHeaders.delete("x-target-host");

    // Ensure realistic origin & referer headers match target host
    upstreamHeaders.set("Origin", `https://${targetHost}`);
    upstreamHeaders.set("Referer", `https://${targetHost}/`);

    // Ensure User-Agent is not stripped or flagged
    if (!upstreamHeaders.has("User-Agent") || upstreamHeaders.get("User-Agent").includes("newton-enhancer-mcp")) {
      upstreamHeaders.set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
    }

    // 5. Construct upstream request (omit body for GET/HEAD methods)
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstreamInit = {
      method: request.method,
      headers: upstreamHeaders,
      body: hasBody ? request.body : null,
      redirect: "follow",
    };

    // 6. Forward request to Newton infrastructure
    try {
      const upstreamResponse = await fetch(targetUrl.toString(), upstreamInit);

      // Return response with permissive CORS
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Upstream connection error",
          message: err.message,
          target: targetUrl.toString(),
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
