async function req(path, opts) {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).error || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  me: () => req("/auth/me"),
  login: (password) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  projects: () => req("/projects"),
  health: (id) => req(`/health/${id}`),
  doc: (id, path) => req(`/doc/${id}${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  localPath: (id) => req(`/local-path/${id}`),
};

// Native bridge (present only when running inside the Mac app's WKWebView).
export const macBridge = {
  available: () => Boolean(window.webkit?.messageHandlers?.openTerminal),
  openTerminal: (path) => window.webkit.messageHandlers.openTerminal.postMessage(path),
};
