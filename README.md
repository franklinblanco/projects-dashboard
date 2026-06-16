# Projects Dashboard

A personal dashboard for your development projects: live healthchecks, GitHub
metadata, Railway links, rendered READMEs / deploy guides — plus a native macOS
app that wraps the site and can open a Terminal at each project's path.

Live at **https://dashboard.franklinblanco.dev** (deployed on Railway).

```
projects-dashboard/
├── config/projects.json   # the project list — edit this to add/change projects
├── server/                # Node + Express: API, GitHub sync, healthchecks, auth
├── web/                   # React + Vite dashboard (built into web/dist)
├── mac/                   # SwiftUI macOS app (WKWebView + native bridge)
├── railway.json           # Railway build/deploy config
├── DEPLOY.md              # deploy guide (opened by this project's Deploy button)
└── .env.example
```

## How it works

- The **Node server** serves the built React app and exposes `/api/*`.
- **Healthchecks** run server-side (`server/health.js`) so they bypass browser
  CORS and can reach Railway/internal endpoints directly. Re-run every 60s.
- **GitHub data** (description, last push, READMEs, doc folders) is pulled
  through the GitHub API and cached for 5 minutes (`server/github.js`).
- **README excerpt**: the server distills each repo's README into a short plain-
  text snippet (strips badges/HTML/markdown). Clicking it opens the full rendered
  README in a modal.
- **Auth** is GitHub OAuth, allow-listed to specific logins, with a signed
  httpOnly session cookie (`server/auth.js`, HMAC via Node `crypto` — no DB).
- **Open Terminal** / **Open with Claude Code** only appear in the macOS app:
  the web app calls the `openTerminal` / `openClaude` WebKit message handlers, and
  the Swift side writes a temp `.command` and `open`s it via the system's default
  terminal app (whatever handles `.command` files), `cd`-ing to the project — and
  running `claude` for the Claude action. Local paths are never sent to the
  browser; the app fetches them from `/api/local-path/:id` on demand.

## Local development

```bash
cp .env.example .env        # fill in OAuth + SESSION_SECRET (or leave OAuth blank to disable auth)
npm install                 # installs server + web deps
npm run dev                 # server on :8080, Vite on :5173 (proxies /api)
```

Open http://localhost:5173. For a production-like run:

```bash
npm run build && npm start  # serves the built app + API on :8080
```

## Deploy

Push to `master` → Railway auto-deploys (`railway.json` defines build/start).
Full setup (Railway variables, custom domain, Porkbun DNS, OAuth callback) is in
[DEPLOY.md](DEPLOY.md).

## macOS app

```bash
cd mac
./build-app.sh                       # → dist/Projects Dashboard.app (signed, double-clickable)
open "dist/Projects Dashboard.app"   # or drag it to /Applications
# (for quick iteration: `swift run`)
```

It loads `https://dashboard.franklinblanco.dev` by default; the gear icon lets
you repoint it (e.g. `http://localhost:8080`) and the choice persists. The
session cookie persists across launches, so you sign in once. The **Open
Terminal** and **Open with Claude Code** buttons show only here, only for
projects with a `localPath`, and launch in your default terminal app (set it via
Finder → a `.command` file → Open With → Always Open With).

## Authentication (GitHub OAuth)

If OAuth env vars are unset, auth is **disabled** (local-dev convenience). To
enable it: register an OAuth app at https://github.com/settings/developers with
callback `…/api/auth/github/callback`, then set `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET`, and `GITHUB_ALLOWED_USERS`. The flow uses the
`read:user` scope, verifies a CSRF `state`, and rejects logins not in the
allow-list (`/?auth_error=forbidden`). See [DEPLOY.md](DEPLOY.md) for specifics.
Optionally, Cloudflare Access can front the domain instead.

---

# Maintenance guide (for Claude)

This section is the playbook for working on this repo. Read it before editing.

## Adding a project

Append an entry to the `projects` array in **`config/projects.json`**. No code
changes are needed — the UI and API are driven entirely by this file, read fresh
on every request (no restart required).

```jsonc
{
  "id": "my-project",                       // stable unique slug (used in API paths)
  "name": "My Project",                     // display name on the card
  "description": "",                        // optional; falls back to the GitHub description
  "repo": "franklinblanco/my-project",      // owner/name on GitHub
  "branch": "master",                       // branch READMEs/docs/excerpt are read from
  "localPath": "/Users/franklinblanco/Developer/my-project", // for the macOS terminal shortcut; NEVER sent to the browser
  "railwayUrl": "https://railway.com/project/<id>",          // opens the Railway console (the "Railway" button)
  "deployUrl": "https://my-project.example.com",             // the live deployment (informational)
  "healthcheck": {
    "url": "https://my-project.example.com/health",          // server-side ping; leave "" for "no healthcheck"
    "method": "GET",
    "expectStatus": 200,                    // status that counts as "up"; otherwise "degraded"
    "timeoutMs": 8000
  },
  "docs": [
    { "label": "README", "type": "github", "path": "README.md" }
    // add { "label": "Design", "type": "github", "path": "DESIGN.md" } etc.
  ]
}
```

How to discover each value (these commands are how the seeded projects were filled in):

- **`repo` / `branch`**: `git -C <localPath> remote get-url origin` and
  `git -C <localPath> branch --show-current`.
- **`healthcheck.url`**: grep the repo for a health route
  (`grep -rniE '"/(health|healthz|status|ping)"' <localPath>`), then **verify it
  is actually live before committing**: `curl -s -o /dev/null -w "%{http_code}" <url>`
  must return `expectStatus`. If there's no health route, point at the deployment
  root (`/`) if it returns 200. Find the live host by grepping the repo for its
  domain.
- **`deployUrl`**: the public app URL.
- **`railwayUrl`**: ask the user (these are Railway console links, not derivable).

## The Deploy button → `DEPLOY.md`

Each card's 🚀 **Deploy** button opens `DEPLOY.md` from that repo's default
branch, rendered in the modal. For it to work, the target repo should contain a
`DEPLOY.md` at its root. This repo has one. The button is always shown; if the
file is missing the modal shows a "could not load" message.

## Modifying or removing a project

Just edit/delete its object in `config/projects.json`. The `docs` array controls
which doc chips appear; `healthcheck.url=""` renders the "No healthcheck" state.

## Conventions & gotchas (don't relearn these the hard way)

- **Build tools live in `dependencies`, not `devDependencies`** (in
  `web/package.json`). Railway builds with `NODE_ENV=production`, which makes
  `npm install` skip dev deps — so `vite` must be a regular dependency or the
  build fails with `vite: not found`.
- **Auth is OAuth-only.** There is no password login. When OAuth env vars are
  unset, `authEnabled` is false and the API is open (intended for local dev).
- **Local paths are private.** `publicProject()` in `server/index.js` strips
  `localPath` from `/api/projects`. Only `/api/local-path/:id` returns it, used
  by the macOS bridge. Never expose `localPath` in the projects payload.
- **Healthchecks are server-side** and run from wherever the dashboard is
  deployed; the target endpoints must be publicly reachable from Railway.
- **`GITHUB_TOKEN`** is required to read **private** repos' metadata/READMEs;
  without it those cards show a `githubError` and no excerpt. It is separate from
  the OAuth client (OAuth logs the user in; the token reads the GitHub API).
- **Secrets**: real values live in `.env` (gitignored). Anything set there must
  be mirrored in Railway's service variables — `.env` is not deployed.

## Verifying changes locally

```bash
npm run build
# Boot with auth disabled so you can curl the API without an OAuth session:
GITHUB_OAUTH_CLIENT_ID= GITHUB_OAUTH_CLIENT_SECRET= PORT=8088 node server/index.js &
curl -s localhost:8088/api/projects   | jq '.projects[] | {name, readmeExcerpt, deployUrl}'
curl -s localhost:8088/api/health     | jq '.results'
```

The macOS app just wraps the live site, so web/CSS changes propagate to it
automatically once deployed — no Swift rebuild needed unless you change native
behavior (the WebKit bridge, window/settings) in `mac/Sources/`.
