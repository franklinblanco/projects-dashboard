import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { loadConfig, env, authEnabled } from "./config.js";
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
