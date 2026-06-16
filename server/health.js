/**
 * Server-side healthcheck. Runs from the backend (not the browser) so it
 * sidesteps CORS and can reach internal/Railway endpoints directly.
 */
export async function checkHealth(hc) {
  if (!hc || !hc.url) {
    return { status: "unconfigured", ok: null };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), hc.timeoutMs || 8000);
  const start = Date.now();
  try {
    const res = await fetch(hc.url, {
      method: hc.method || "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "projects-dashboard-healthcheck" },
    });
    const latencyMs = Date.now() - start;
    const expect = hc.expectStatus || 200;
    const ok = res.status === expect;
    return {
      status: ok ? "up" : "degraded",
      ok,
      httpStatus: res.status,
      latencyMs,
    };
  } catch (e) {
    return {
      status: "down",
      ok: false,
      latencyMs: Date.now() - start,
      error: e.name === "AbortError" ? "timeout" : String(e.message || e),
    };
  } finally {
    clearTimeout(timeout);
  }
}
