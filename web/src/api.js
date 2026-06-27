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
  logout: () => req("/auth/logout", { method: "POST" }),
  projects: () => req("/projects"),
  projectRaw: (id) => req(`/projects/${id}/raw`),
  createProject: (body) => req("/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id, body) =>
    req(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProject: (id) => req(`/projects/${id}`, { method: "DELETE" }),
  importProjects: (projects) =>
    req("/projects/import", { method: "POST", body: JSON.stringify({ projects }) }),
  reorderProjects: (ids) =>
    req("/projects/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
  health: (id) => req(`/health/${id}`),
  doc: (id, path) => req(`/doc/${id}${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  localPath: (id) => req(`/local-path/${id}`),
};

// Native bridge (present only when running inside the Mac app's WKWebView).
export const macBridge = {
  available: () => Boolean(window.webkit?.messageHandlers?.openTerminal),
  openTerminal: (path) => window.webkit.messageHandlers.openTerminal.postMessage(path),
  openClaude: (path) => window.webkit.messageHandlers.openClaude.postMessage(path),
};
