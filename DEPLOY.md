# Deploying Projects Dashboard

The dashboard runs as a single Railway service that builds the React app and
serves it alongside the API. Pushing to `master` triggers an auto-deploy.

## Railway

1. **Service**: connect the GitHub repo `franklinblanco/projects-dashboard` (or
   `railway init`). `railway.json` defines the build (`npm install && npm run build`)
   and start (`npm start`) commands.
2. **Variables** (Settings → Variables):
   | Variable | Value |
   | --- | --- |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `GITHUB_OAUTH_CLIENT_ID` | from your GitHub OAuth app |
   | `GITHUB_OAUTH_CLIENT_SECRET` | from your GitHub OAuth app |
   | `GITHUB_ALLOWED_USERS` | `franklinblanco` |
   | `GITHUB_TOKEN` | read-only PAT (reads private repos' metadata/READMEs) |
   | `NODE_ENV` | `production` (marks the session cookie `Secure`) |

   `PORT` is injected by Railway — don't set it.
3. **Custom domain**: Settings → Networking → add `dashboard.franklinblanco.dev`.
   Railway returns a CNAME target.

## DNS (Porkbun)

Domain Management → `franklinblanco.dev` → DNS Records → add:

| Type | Host | Answer |
| --- | --- | --- |
| CNAME | `dashboard` | the Railway-provided target |

TLS is provisioned automatically. The server sets `trust proxy`, so the `Secure`
cookie and HTTPS callback detection work behind Railway's proxy.

## GitHub OAuth app

At https://github.com/settings/developers:

- **Homepage URL**: `https://dashboard.franklinblanco.dev`
- **Authorization callback URL**: `https://dashboard.franklinblanco.dev/api/auth/github/callback`

For local dev, use `http://localhost:8080/api/auth/github/callback` (a second
OAuth app is easiest).

## Gotcha

Build tooling (`vite`) must be in `web/package.json` **`dependencies`**, not
`devDependencies` — Railway builds with `NODE_ENV=production`, which skips dev
deps and would otherwise fail with `vite: not found`.
