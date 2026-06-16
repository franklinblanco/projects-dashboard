import { env } from "./config.js";

const API = "https://api.github.com";

function headers() {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": "projects-dashboard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.githubToken) h.Authorization = `Bearer ${env.githubToken}`;
  return h;
}

// Tiny in-memory cache to stay well under GitHub rate limits.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

async function cachedJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** Repo metadata: description, stars, last push, default branch, issues, language. */
export async function getRepoMeta(repo) {
  const data = await cachedJson(`${API}/repos/${repo}`);
  return {
    description: data.description,
    stars: data.stargazers_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    pushedAt: data.pushed_at,
    language: data.language,
    htmlUrl: data.html_url,
    homepage: data.homepage,
  };
}

/** Raw README markdown for a repo (optionally a specific ref). */
export async function getReadme(repo, ref) {
  const url = `${API}/repos/${repo}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const res = await fetch(url, {
    headers: { ...headers(), Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} for README of ${repo}`);
    err.status = res.status;
    throw err;
  }
  return await res.text();
}

/**
 * Fetch arbitrary file/dir contents. For a file returns { type:'file', text }.
 * For a directory returns { type:'dir', entries:[{name,path,type,htmlUrl}] }.
 */
export async function getContent(repo, path, ref) {
  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}${
    ref ? `?ref=${encodeURIComponent(ref)}` : ""
  }`;
  const data = await cachedJson(url);
  if (Array.isArray(data)) {
    return {
      type: "dir",
      entries: data.map((e) => ({
        name: e.name,
        path: e.path,
        type: e.type,
        htmlUrl: e.html_url,
      })),
    };
  }
  const text = Buffer.from(data.content || "", data.encoding || "base64").toString("utf8");
  return { type: "file", text, htmlUrl: data.html_url };
}
