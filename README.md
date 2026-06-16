# Projects Dashboard

A self-hosted dashboard for your development projects: live healthchecks, GitHub
metadata, deployment links, and rendered READMEs — plus an optional native macOS
app that can open a terminal (or Claude Code) at each project's folder.

Free and open source (MIT). Run your own instance in a couple of minutes.

> Add projects from the UI — no config files to hand-edit. Everything is stored
> in a single `projects.json` you control.

```
projects-dashboard/
├── config/projects.example.json   # template seeded on first run
├── data/projects.json             # your live data (gitignored; mount a volume in prod)
├── server/                        # Node + Express: API, GitHub sync, healthchecks, auth
├── web/                           # React + Vite dashboard (built into web/dist)
├── mac/                           # optional SwiftUI companion app
├── railway.json                   # deploy config
└── .env.example
```

## Features

- **Healthchecks** — server-side pings (bypass browser CORS) with status + latency, re-run every 60s.
- **GitHub sync** — description, last push, and a distilled README excerpt per project (cached 5 min).
- **Links** — GitHub repo, deployment console, and live URL per card.
- **Docs** — render any markdown file from the repo (README, design docs…) in a modal.
- **Add / edit projects in the UI** — name, repo, branch, URLs, healthcheck, docs.
- **GitHub OAuth** — lock the dashboard to your GitHub account (or an allow-list).
- **macOS companion (optional)** — open a terminal or Claude Code at a project's local path.

## Run it locally

```bash
git clone https://github.com/franklinblanco/projects-dashboard.git
cd projects-dashboard
cp .env.example .env        # optional: add GitHub OAuth + a GITHUB_TOKEN
npm install
npm run dev                 # API on :8080, Vite on :5173 (proxies /api)
```

Open http://localhost:5173 and click **+ Add project**. With no OAuth configured,
auth is disabled (fine for local use). For a production-like single-process run:

```bash
npm run build && npm start  # serves the built app + API on :8080
```

## Deploy (Railway)

1. Create a service from your fork (`railway.json` defines build/start).
2. **Add a Volume** and mount it at `/app/data`, then set `DATA_DIR=/app/data`.
   This is required so projects you add/edit survive redeploys.
3. Set service variables:
   | Variable | Purpose |
   | --- | --- |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | from your GitHub OAuth app |
   | `GITHUB_ALLOWED_USERS` | your GitHub login (lock it down!) |
   | `GITHUB_TOKEN` | read-only PAT (reads your repos' metadata/READMEs) |
   | `NODE_ENV=production` | marks the session cookie `Secure` |
4. Add a custom domain in Railway, point a CNAME at it, and set your OAuth app's
   callback to `https://YOUR-DOMAIN/api/auth/github/callback`.

Any Node host works the same way — just point `DATA_DIR` at persistent storage.

## Authentication (GitHub OAuth)

Register an OAuth app at https://github.com/settings/developers with callback
`https://YOUR-DOMAIN/api/auth/github/callback`, then set `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET`, and `GITHUB_ALLOWED_USERS` (your login). The flow
uses the `read:user` scope and a CSRF `state`. **If `GITHUB_ALLOWED_USERS` is
empty, any GitHub user can sign in** — only do that intentionally. When OAuth
isn't configured at all, auth is disabled (local dev convenience).

## macOS companion app (optional)

```bash
cd mac
./build-app.sh                       # → dist/Projects Dashboard.app (signed, double-clickable)
open "dist/Projects Dashboard.app"   # then set your dashboard URL via the gear icon
```

It wraps your dashboard in a window and adds **Open Terminal** / **Open with
Claude Code** buttons (only for projects that have a local path) that open a new
window in your default terminal. External links open in your default browser.
Local paths are never sent to the browser — the app fetches them on demand.

## Configuration reference

A project (stored in `data/projects.json`, editable from the UI):

| field | meaning |
| --- | --- |
| `name`, `repo` | display name and `owner/name` on GitHub (required) |
| `branch` | branch READMEs/docs are read from |
| `localPath` | absolute path for the macOS terminal shortcut (never exposed to the browser) |
| `railwayUrl`, `deployUrl` | deployment console link and live URL |
| `healthcheck` | `{ url, method, expectStatus, timeoutMs }` — blank `url` = no check |
| `docs` | `[{ label, path }]` markdown files to render |

## Notes for self-hosters

- Healthchecks run from your server, so target URLs must be publicly reachable.
  If you expose this instance to others, validate/block private IP ranges to
  avoid SSRF before allowing untrusted users to add healthchecks.
- A `GITHUB_TOKEN` is needed to read **private** repos' metadata/READMEs.
- `vite` is a regular dependency (not dev) because the frontend is built at
  deploy time, where `NODE_ENV=production` would otherwise skip dev deps.

---

Dashboard made by [Franklin Blanco](https://franklinblanco.dev). Contributions welcome.
