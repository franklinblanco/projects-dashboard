import { useState } from "react";
import { api } from "../api.js";

const AUTH_ERRORS = {
  forbidden: "That GitHub account isn't allowed to access this dashboard.",
  state: "Login session expired. Please try again.",
  token: "GitHub sign-in failed (token exchange). Please try again.",
  user: "Couldn't read your GitHub profile. Please try again.",
  server: "Something went wrong during sign-in. Please try again.",
};

export default function Login({ methods = {}, authError, onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authError ? AUTH_ERRORS[authError] || "Sign-in failed." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (e) {
      setError(e.code === 401 ? "Incorrect password" : String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="login-card">
        <div className="brand center-brand">
          <span className="logo-dot" />
          <h1>Projects</h1>
        </div>
        <p className="muted">Sign in to view your dashboard.</p>

        {error && <div className="form-error">{error}</div>}

        {methods.github && (
          <a className="btn github" href="/api/auth/github/start">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub
          </a>
        )}

        {methods.github && methods.password && <div className="or-divider">or</div>}

        {methods.password && (
          <form onSubmit={submit} className="login-form">
            <input
              type="password"
              placeholder="Password"
              value={password}
              autoFocus={!methods.github}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn primary" disabled={busy || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {!methods.github && !methods.password && (
          <p className="muted">No auth method configured — access is open.</p>
        )}
      </div>
    </div>
  );
}
