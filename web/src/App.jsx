import { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import Login from "./components/Login.jsx";
import ProjectCard from "./components/ProjectCard.jsx";
import DocModal from "./components/DocModal.jsx";
import ProjectForm from "./components/ProjectForm.jsx";

export default function App() {
  const [authState, setAuthState] = useState("loading"); // loading | in | out
  const [data, setData] = useState(null);
  const [health, setHealth] = useState({});
  const [error, setError] = useState(null);
  const [doc, setDoc] = useState(null); // { project, doc }
  const [editing, setEditing] = useState(null); // null | { project } | { project: null }

  const checkAuth = useCallback(async () => {
    try {
      const me = await api.me();
      setAuthState(me.authenticated ? "in" : "out");
    } catch {
      setAuthState("out");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadProjects = useCallback(async () => {
    setError(null);
    try {
      const res = await api.projects();
      setData(res);
      // Kick off healthchecks in parallel; fill in as they resolve.
      res.projects.forEach(async (p) => {
        setHealth((h) => ({ ...h, [p.id]: { status: "checking" } }));
        try {
          const r = await api.health(p.id);
          setHealth((h) => ({ ...h, [p.id]: r }));
        } catch {
          setHealth((h) => ({ ...h, [p.id]: { status: "down", ok: false } }));
        }
      });
    } catch (e) {
      if (e.code === 401) return setAuthState("out");
      setError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    if (authState === "in") loadProjects();
  }, [authState, loadProjects]);

  // Periodic re-check of health every 60s.
  useEffect(() => {
    if (authState !== "in" || !data) return;
    const t = setInterval(() => {
      data.projects.forEach(async (p) => {
        try {
          const r = await api.health(p.id);
          setHealth((h) => ({ ...h, [p.id]: r }));
        } catch {}
      });
    }, 60000);
    return () => clearInterval(t);
  }, [authState, data]);

  async function logout() {
    await api.logout();
    setAuthState("out");
    setData(null);
  }

  if (authState === "loading") {
    return <div className="center muted">Loading…</div>;
  }
  if (authState === "out") {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    return <Login authError={authError} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo-icon" src="/favicon.svg" alt="" />
          <h1>Projects</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn primary inline" onClick={() => setEditing({ project: null })}>
            + Add project
          </button>
          <button className="btn ghost" onClick={loadProjects} title="Refresh">
            ↻ Refresh
          </button>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <main className="grid">
        {data?.projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            health={health[p.id]}
            onOpenDoc={(d) => setDoc({ project: p, doc: d })}
            onEdit={() => setEditing({ project: p })}
          />
        ))}
      </main>

      <footer className="footer">
        Dashboard made by{" "}
        <a href="https://franklinblanco.dev" target="_blank" rel="noreferrer">
          Franklin Blanco
        </a>
      </footer>

      {doc && (
        <DocModal project={doc.project} doc={doc.doc} onClose={() => setDoc(null)} />
      )}

      {editing && (
        <ProjectForm
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}
