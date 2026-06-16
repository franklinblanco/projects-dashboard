import { useEffect, useRef, useState, useCallback } from "react";
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
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);

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

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setNotice(null);
    setError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const projects = Array.isArray(parsed) ? parsed : parsed.projects;
      if (!Array.isArray(projects)) throw new Error("File must be an array or { projects: [...] }");
      const res = await api.importProjects(projects);
      setNotice(
        `Imported ${res.added} new, updated ${res.updated}` +
          (res.errors?.length ? ` (${res.errors.length} skipped)` : "") + "."
      );
      loadProjects();
    } catch (e) {
      setError(`Import failed: ${String(e.message || e)}`);
    }
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
          <button
            className="btn ghost"
            onClick={() => fileRef.current?.click()}
            title="Import projects from a JSON file"
          >
            ⇪ Import
          </button>
          <button className="btn ghost" onClick={loadProjects} title="Refresh">
            ↻ Refresh
          </button>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={onImportFile}
          />
        </div>
      </header>

      {notice && <div className="banner notice">{notice}</div>}
      {error && <div className="banner error">{error}</div>}

      {data && data.projects.length === 0 ? (
        <div className="empty-state">
          <img className="logo-icon big" src="/favicon.svg" alt="" />
          <h2>No projects yet</h2>
          <p className="muted">
            Add your development projects to see healthchecks, GitHub info, and docs.
          </p>
          <div className="empty-actions">
            <button className="btn primary inline" onClick={() => setEditing({ project: null })}>
              + Add your first project
            </button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              ⇪ Import from file
            </button>
          </div>
        </div>
      ) : (
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
      )}

      <footer className="footer">
        Dashboard made by{" "}
        <a
          href="https://github.com/franklinblanco/projects-dashboard"
          target="_blank"
          rel="noreferrer"
        >
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
