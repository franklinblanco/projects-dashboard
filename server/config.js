import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency). Only fills vars not already set.
const envFile = join(__dirname, "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
// The live config lives in a writable data dir (mount a volume here in prod so
// edits survive redeploys). Falls back to ./data for local/self-host use.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");
const CONFIG_PATH = process.env.PROJECTS_CONFIG || join(DATA_DIR, "projects.json");
const EXAMPLE_PATH = join(__dirname, "..", "config", "projects.example.json");

// First run: create the data dir and seed projects.json from the bundled example.
async function ensureConfigFile() {
  if (existsSync(CONFIG_PATH)) return;
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  if (existsSync(EXAMPLE_PATH)) {
    await copyFile(EXAMPLE_PATH, CONFIG_PATH);
  } else {
    await writeFile(CONFIG_PATH, JSON.stringify({ githubUser: "", projects: [] }, null, 2) + "\n");
  }
}

/**
 * Loads the projects config from disk. Read fresh each call so edits show up
 * without a server restart.
 */
export async function loadConfig() {
  await ensureConfigFile();
  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.projects)) {
    throw new Error("Invalid config: `projects` must be an array");
  }
  return parsed;
}

/** Persists the config back to projects.json (pretty-printed). */
export async function saveConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export const env = {
  port: Number(process.env.PORT) || 8080,
  githubToken: process.env.GITHUB_TOKEN || "",
  // Auth: when GitHub OAuth is not configured, auth is disabled (local dev only).
  sessionSecret: process.env.SESSION_SECRET || "",
  // 7 days
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
  isProd: process.env.NODE_ENV === "production",

  // GitHub OAuth (optional). Register an OAuth app at
  // https://github.com/settings/developers and set these.
  oauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
  oauthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
  // Public base URL used to build the OAuth callback. Derived from the request
  // when unset; set explicitly if the derived host is ever wrong behind a proxy.
  oauthBaseUrl: process.env.OAUTH_BASE_URL || "",
  // Only these GitHub logins may sign in (comma-separated, case-insensitive).
  // Empty = any authenticated GitHub user (set this on a public deployment!).
  allowedUsers: (process.env.GITHUB_ALLOWED_USERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export const githubOAuthEnabled = Boolean(env.oauthClientId && env.oauthClientSecret);
export const authEnabled = githubOAuthEnabled;
