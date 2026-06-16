# Projects Dashboard

A personal dashboard for your development projects: live healthchecks, GitHub
metadata, Railway links, and rendered READMEs / design docs — plus a native
macOS app that wraps the site and can open a Terminal at each project's path.

```
projects-dashboard/
├── config/projects.json   # your projects (edit this)
├── server/                # Node + Express: API, GitHub sync, healthchecks, auth
├── web/                   # React + Vite dashboard (built into web/dist)
├── mac/                   # SwiftUI macOS app (WKWebView + native bridge)
├── railway.json           # Railway build/deploy config
└── .env.example
```

## How it works

- The **Node server** serves the built React app and exposes `/api/*`.
- **Healthchecks** run server-side (`server/health.js`) so they bypass browser
  CORS and can reach Railway/internal endpoints directly.
- **GitHub data** (description, stars, last push, READMEs, doc folders) is pulled
  through the GitHub API and cached for 5 minutes.
- **Auth** is a single password with a signed, httpOnly session cookie
  (`server/auth.js`, HMAC via Node `crypto` — no database, no extra deps).
- **Open Terminal** only appears in the macOS app: the web app calls a
  `openTerminal` WebKit message handler, and the Swift side runs
  `open -a Terminal <localPath>`. Local paths are never sent to the browser —
  the app fetches them from `/api/local-path/:id` on demand.

## Local development

```bash
cp .env.example .env        # set DASHBOARD_PASSWORD (or leave blank to disable auth)
npm install                 # installs server + web deps
npm run dev                 # server on :8080, Vite on :5173 (proxies /api)
```

Open http://localhost:5173. For a production-like run:

```bash
npm run build && npm start  # serves the built app + API on :8080
```

## Configure your projects

Edit `config/projects.json`. Each entry:

| field         | purpose                                                            |
| ------------- | ------------------------------------------------------------------ |
| `id`          | stable unique slug                                                 |
| `name`        | display name                                                       |
| `repo`        | `owner/name` on GitHub                                             |
| `branch`      | branch READMEs/docs are read from                                  |
| `localPath`   | absolute path on your Mac (terminal shortcut; never sent to browser)|
| `railwayUrl`  | link to the Railway deployment (optional)                          |
| `healthcheck` | `{ url, method, expectStatus, timeoutMs }` — leave `url` "" if none |
| `docs`        | list of `{ label, type: "github", path }` to render in the modal   |

Vanity, xxindex, and Tu Tasa are pre-seeded with their real repos. Add
`railwayUrl` and `healthcheck.url` once you know them (Tu Tasa exposes
`/health`).

## Deploy to Railway + `dashboard.franklinblanco.dev`

1. **Create the service**: `railway init` in this repo (or connect the GitHub
   repo in the Railway dashboard). `railway.json` already defines build/start.
2. **Set service variables** (Railway → Variables):
   - `SESSION_SECRET` — `openssl rand -hex 32`
   - `GITHUB_TOKEN` — read-only PAT (raises rate limit; required for private repos)
   - `NODE_ENV=production` — marks the session cookie `Secure`
   - Plus an auth method (see below): `GITHUB_OAUTH_CLIENT_ID` +
     `GITHUB_OAUTH_CLIENT_SECRET`, and/or `DASHBOARD_PASSWORD`.
   - (`PORT` is provided by Railway automatically.)
3. **Custom domain**: Railway → Settings → Networking → add
   `dashboard.franklinblanco.dev`. Railway shows a target hostname.
4. **DNS**: at your `franklinblanco.dev` registrar, add a CNAME:
   `dashboard` → the hostname Railway gave you. TLS is provisioned automatically.

The server already sets `trust proxy`, so the `Secure` cookie and HTTPS detection
work correctly behind Railway's proxy.

## macOS app

```bash
cd mac
swift run            # launches the app
```

By default it loads `https://dashboard.franklinblanco.dev`. Click the gear icon
to point it at `http://localhost:8080` (or anything else); the choice is saved.
The session cookie persists across launches, so you sign in once.

The **Open Terminal** button shows only inside this app and only for projects
that have a `localPath`. The Swift side validates the path exists before running
`open -a Terminal`.

To ship a real `.app` bundle (icon, dock, distribution) you'd wrap this in an
Xcode app target; the SwiftUI source here drops in unchanged.

## Authentication

Two methods are built in (both in `server/auth.js`). The login screen shows
whichever you've configured; if **neither** is set, auth is disabled (local dev).
Successful login issues a signed, httpOnly session cookie either way.

### GitHub OAuth (recommended)

1. Create an OAuth app at https://github.com/settings/developers:
   - **Homepage URL**: `https://dashboard.franklinblanco.dev`
   - **Authorization callback URL**:
     `https://dashboard.franklinblanco.dev/api/auth/github/callback`
     (for local dev, add a second app or use
     `http://localhost:8080/api/auth/github/callback`)
2. Set env vars: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and
   `GITHUB_ALLOWED_USERS` (comma-separated logins; defaults to `franklinblanco`).
3. The flow uses the `read:user` scope only, verifies a CSRF `state`, fetches
   your GitHub login, and rejects anyone not in the allow-list
   (`/?auth_error=forbidden`). The callback base URL is auto-derived from the
   request; override with `OAUTH_BASE_URL` if needed.

### Password

Set `DASHBOARD_PASSWORD`. Useful as a simple fallback or for local dev. You can
enable both at once.

### Cloudflare Access (optional)

You can also front the Railway domain with Cloudflare Access and leave both of
the above unset behind it — the app needs no auth code in that setup.
