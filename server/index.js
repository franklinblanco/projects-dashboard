import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { loadConfig, saveConfig, env, authEnabled } from "./config.js";
import { requireAuth, registerAuthRoutes } from "./auth.js";
import { getRepoMeta, getReadme, getContent, readmeExcerpt } from "./github.js";
import { checkHealth } from "./health.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // behind Railway's proxy: correct protocol + Secure cookies
app.use(express.json());

const api = express.Router();

// ---- Auth (public) ----
registerAuthRoutes(api);

// ---- Everything below requires a session (when auth is enabled) ----
api.use(requireAuth);

// Strip sensitive fields (local paths) from a project before sending to browser.
function publicProject(p) {
  const { localPath, ...rest } = p;
  return { ...rest, hasLocalPath: Boolean(localPath) };
}

api.get("/projects", async (_req, res) => {
  try {
    const config = await loadConfig();
    const projects = await Promise.all(
      config.projects.map(async (p) => {
        let github = null;
        let githubError = null;
        let excerpt = null;
        try {
          github = await getRepoMeta(p.repo);
        } catch (e) {
          githubError = String(e.message || e);
        }
        try {
          excerpt = readmeExcerpt(await getReadme(p.repo, p.branch));
        } catch {
          // README missing/inaccessible — card just shows no excerpt.
        }
        return { ...publicProject(p), github, githubError, readmeExcerpt: excerpt };
      })
    );
    res.json({ githubUser: config.githubUser, projects });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Full raw project (incl. localPath) for the edit form. Authenticated only.
api.get("/projects/:id/raw", async (req, res) => {
  try {
    const config = await loadConfig();
    const project = config.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Build a clean project object from a request body, merging onto an existing one.
function normalizeProject(body, existing = {}) {
  const name = String(body.name || "").trim();
  const repo = String(body.repo || "").trim();
  if (!name) throw new Error("name is required");
  if (!repo) throw new Error("repo is required (owner/name)");
  const hc = body.healthcheck || {};
  const docs = Array.isArray(body.docs)
    ? body.docs
        .filter((d) => d && d.path)
        .map((d) => ({ label: String(d.label || d.path).trim(), type: "github", path: String(d.path).trim() }))
    : existing.docs || [];
  return {
    id: existing.id || slugify(body.id || name),
    name,
    description: String(body.description || existing.description || "").trim(),
    repo,
    branch: String(body.branch || existing.branch || "master").trim(),
    localPath: String(body.localPath ?? existing.localPath ?? "").trim(),
    railwayUrl: String(body.railwayUrl ?? existing.railwayUrl ?? "").trim(),
    deployUrl: String(body.deployUrl ?? existing.deployUrl ?? "").trim(),
    healthcheck: {
      url: String(hc.url ?? existing.healthcheck?.url ?? "").trim(),
      method: hc.method || existing.healthcheck?.method || "GET",
      expectStatus: Number(hc.expectStatus || existing.healthcheck?.expectStatus || 200),
      timeoutMs: Number(hc.timeoutMs || existing.healthcheck?.timeoutMs || 8000),
    },
    docs,
  };
}

api.post("/projects", async (req, res) => {
  try {
    const config = await loadConfig();
    const project = normalizeProject(req.body);
    if (config.projects.some((p) => p.id === project.id)) {
      project.id = `${project.id}-${Date.now().toString(36)}`;
    }
    config.projects.push(project);
    await saveConfig(config);
    res.status(201).json(publicProject(project));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

api.put("/projects/:id", async (req, res) => {
  try {
    const config = await loadConfig();
    const idx = config.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "not found" });
    const updated = normalizeProject(req.body, config.projects[idx]);
    config.projects[idx] = updated;
    await saveConfig(config);
    res.json(publicProject(updated));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

api.delete("/projects/:id", async (req, res) => {
  try {
    const config = await loadConfig();
    const next = config.projects.filter((p) => p.id !== req.params.id);
    if (next.length === config.projects.length) {
      return res.status(404).json({ error: "not found" });
    }
    config.projects = next;
    await saveConfig(config);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

api.get("/health/:id", async (req, res) => {
  try {
    const config = await loadConfig();
    const project = config.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    res.json({ id: project.id, ...(await checkHealth(project.healthcheck)) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

api.get("/health", async (_req, res) => {
  try {
    const config = await loadConfig();
    const results = await Promise.all(
      config.projects.map(async (p) => ({ id: p.id, ...(await checkHealth(p.healthcheck)) }))
    );
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

api.get("/doc/:id", async (req, res) => {
  try {
    const config = await loadConfig();
    const project = config.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    const path = req.query.path;
    try {
      if (!path) {
        const text = await getReadme(project.repo, project.branch);
        return res.json({ type: "file", text });
      }
      const content = await getContent(project.repo, String(path), project.branch);
      return res.json(content);
    } catch (e) {
      return res.status(e.status || 502).json({ error: String(e.message || e) });
    }
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// localPath is intentionally NOT exposed via the public projects list.
// The Mac app fetches it from this endpoint to open a terminal natively.
api.get("/local-path/:id", async (req, res) => {
  try {
    const config = await loadConfig();
    const project = config.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    res.json({ id: project.id, localPath: project.localPath || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.use("/api", api);

// ---- Serve built frontend ----
const dist = join(__dirname, "..", "web", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(join(dist, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res
      .status(200)
      .send("API running. Build the web app with `npm run build` to serve the dashboard.")
  );
}

app.listen(env.port, () => {
  console.log(`projects-dashboard listening on :${env.port}`);
  if (!authEnabled) {
    console.warn("⚠️  AUTH DISABLED — set GITHUB_OAUTH_CLIENT_ID/SECRET to require login.");
  } else if (!env.sessionSecret) {
    console.warn("⚠️  SESSION_SECRET not set — using a derived dev secret. Set it in production.");
  }
  if (!env.githubToken) {
    console.warn("ℹ️  No GITHUB_TOKEN — GitHub API is unauthenticated (low rate limit).");
  }
});
