interface Env {
  PROXY_SECRET: string;
}

const TARGET = "https://www.tennisrecord.com";

const ALLOWED_PATHS = ["/adult/teamprofile.aspx", "/adult/profile.aspx", "/adult/playerstats.aspx", "/adult/matchhistory.aspx"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const secret = request.headers.get("X-Proxy-Secret");
    if (!env.PROXY_SECRET || secret !== env.PROXY_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (!ALLOWED_PATHS.some((p) => path.startsWith(p))) {
      return new Response("Forbidden path", { status: 403 });
    }

    const targetUrl = `${TARGET}${path}${url.search}`;

    try {
      const resp = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FramersApp/1.0; +https://framers.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      const body = await resp.text();

      return new Response(body, {
        status: resp.status,
        headers: {
          "Content-Type": resp.headers.get("Content-Type") || "text/html",
          ...corsHeaders(),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return new Response(`Proxy error: ${msg}`, {
        status: 502,
        headers: corsHeaders(),
      });
    }
  },
} satisfies ExportedHandler<Env>;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "X-Proxy-Secret",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
