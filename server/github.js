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

const readmeCache = new Map();

/** Raw README markdown for a repo (optionally a specific ref). Cached 5 min. */
export async function getReadme(repo, ref) {
  const key = `${repo}@${ref || ""}`;
  const hit = readmeCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const url = `${API}/repos/${repo}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const res = await fetch(url, {
    headers: { ...headers(), Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} for README of ${repo}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  readmeCache.set(key, { at: Date.now(), text });
  return text;
}

/**
 * Distil a README into a short plain-text snippet for the card: strips badges,
 * images, code blocks, headings and inline markdown, then returns the first
 * real paragraph truncated to `max` chars.
 */
export function readmeExcerpt(md, max = 220) {
  if (!md) return null;
  const cleaned = md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // markdown images
    .replace(/<[^>]+>/g, " "); // strip all HTML tags (centered headers, badges, etc.)

  const paragraphs = [];
  let current = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (current.length) paragraphs.push(current.join(" "));
      current = [];
      continue;
    }
    if (/^#{1,6}\s/.test(line)) continue; // headings
    if (/^[-=*]{3,}$/.test(line)) continue; // horizontal rules
    if (/^\[?!\[/.test(line)) continue; // badge / image lines
    current.push(line);
  }
  if (current.length) paragraphs.push(current.join(" "));

  const clean = (p) =>
    p
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
      .replace(/[*_`>#|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Prefer the first substantial prose paragraph (skips a lone title/tagline).
  let para =
    paragraphs.map(clean).find((p) => p.length >= 40) ||
    paragraphs.map(clean).find((p) => p.replace(/[^a-z0-9]/gi, "").length > 3) ||
    "";
  if (!para) return null;
  if (para.length > max) para = para.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return para;
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
