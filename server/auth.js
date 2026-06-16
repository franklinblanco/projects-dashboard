import crypto from "node:crypto";
import {
  env,
  authEnabled,
  passwordAuthEnabled,
  githubOAuthEnabled,
} from "./config.js";

const COOKIE_NAME = "dash_session";

function secret() {
  // Fall back to a derived secret so dev works without config, but warn loudly.
  if (env.sessionSecret) return env.sessionSecret;
  return crypto.createHash("sha256").update("insecure-dev-secret:" + env.password).digest("hex");
}

function base64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload) {
  const body = base64url(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  // constant-time compare
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(env.sessionTtlMs / 1000)}`,
  ];
  if (env.isProd) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function constantTimeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still compare to avoid trivial length leak shortcut.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** Express middleware: rejects unauthenticated requests when auth is enabled. */
export function requireAuth(req, res, next) {
  if (!authEnabled) return next();
  const cookies = parseCookies(req);
  const session = verify(cookies[COOKIE_NAME]);
  if (!session) return res.status(401).json({ error: "unauthorized" });
  req.session = session;
  next();
}

function baseUrl(req) {
  if (env.oauthBaseUrl) return env.oauthBaseUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const STATE_COOKIE = "oauth_state";

/** Mounts /api/auth/* routes on the given router. */
export function registerAuthRoutes(router) {
  router.get("/auth/me", (req, res) => {
    const methods = { password: passwordAuthEnabled, github: githubOAuthEnabled };
    if (!authEnabled) {
      return res.json({ authenticated: true, authEnabled: false, methods });
    }
    const cookies = parseCookies(req);
    const session = verify(cookies[COOKIE_NAME]);
    res.json({
      authenticated: Boolean(session),
      authEnabled: true,
      methods,
      user: session?.u || null,
    });
  });

  // ---- Password login ----
  router.post("/auth/login", (req, res) => {
    if (!passwordAuthEnabled) {
      return res.status(404).json({ error: "password auth disabled" });
    }
    const password = (req.body && req.body.password) || "";
    if (!constantTimeEqual(password, env.password)) {
      return res.status(401).json({ error: "invalid password" });
    }
    const token = sign({ u: "owner", exp: Date.now() + env.sessionTtlMs });
    setSessionCookie(res, token);
    res.json({ ok: true });
  });

  router.post("/auth/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ---- GitHub OAuth ----
  router.get("/auth/github/start", (req, res) => {
    if (!githubOAuthEnabled) return res.status(404).send("GitHub OAuth not configured");
    const state = crypto.randomBytes(16).toString("hex");
    const attrs = [
      `${STATE_COOKIE}=${state}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=600",
    ];
    if (env.isProd) attrs.push("Secure");
    res.append("Set-Cookie", attrs.join("; "));

    const params = new URLSearchParams({
      client_id: env.oauthClientId,
      redirect_uri: `${baseUrl(req)}/api/auth/github/callback`,
      scope: "read:user",
      state,
      allow_signup: "false",
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  router.get("/auth/github/callback", async (req, res) => {
    if (!githubOAuthEnabled) return res.status(404).send("GitHub OAuth not configured");
    const { code, state } = req.query;
    const cookies = parseCookies(req);
    // Clear the one-time state cookie regardless of outcome.
    res.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

    if (!code || !state || state !== cookies[STATE_COOKIE]) {
      return res.redirect("/?auth_error=state");
    }
    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.oauthClientId,
          client_secret: env.oauthClientSecret,
          code,
          redirect_uri: `${baseUrl(req)}/api/auth/github/callback`,
        }),
      });
      const tokenJson = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      if (!accessToken) return res.redirect("/?auth_error=token");

      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "projects-dashboard",
          Accept: "application/vnd.github+json",
        },
      });
      if (!userRes.ok) return res.redirect("/?auth_error=user");
      const user = await userRes.json();
      const login = String(user.login || "").toLowerCase();
      if (!env.allowedUsers.includes(login)) {
        return res.redirect("/?auth_error=forbidden");
      }
      const token = sign({ u: user.login, exp: Date.now() + env.sessionTtlMs });
      setSessionCookie(res, token);
      res.redirect("/");
    } catch (e) {
      console.error("OAuth callback error:", e);
      res.redirect("/?auth_error=server");
    }
  });
}
