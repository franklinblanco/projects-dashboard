import { useEffect, useState } from "react";
import { api } from "../api.js";

const EMPTY = {
  name: "",
  repo: "",
  branch: "master",
  localPath: "",
  railwayUrl: "",
  deployUrl: "",
  status: "",
  healthcheckUrl: "",
  expectStatus: 200,
  docs: [{ label: "README", path: "README.md" }],
};

export default function ProjectForm({ project, onClose, onSaved }) {
  const editing = Boolean(project);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editing) return;
    api
      .projectRaw(project.id)
      .then((p) =>
        setForm({
          name: p.name || "",
          repo: p.repo || "",
          branch: p.branch || "master",
          localPath: p.localPath || "",
          railwayUrl: p.railwayUrl || "",
          deployUrl: p.deployUrl || "",
          status: p.status || (p.published ? "published" : ""),
          healthcheckUrl: p.healthcheck?.url || "",
          expectStatus: p.healthcheck?.expectStatus || 200,
          docs: p.docs?.length ? p.docs.map((d) => ({ label: d.label, path: d.path })) : [],
        })
      )
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [editing, project]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function setDoc(i, field, value) {
    setForm((f) => {
      const docs = f.docs.slice();
      docs[i] = { ...docs[i], [field]: value };
      return { ...f, docs };
    });
  }
  function addDoc() {
    setForm((f) => ({ ...f, docs: [...f.docs, { label: "", path: "" }] }));
  }
  function removeDoc(i) {
    setForm((f) => ({ ...f, docs: f.docs.filter((_, j) => j !== i) }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      repo: form.repo,
      branch: form.branch,
      localPath: form.localPath,
      railwayUrl: form.railwayUrl,
      deployUrl: form.deployUrl,
      status: form.status,
      healthcheck: { url: form.healthcheckUrl, expectStatus: Number(form.expectStatus) || 200 },
      docs: form.docs.filter((d) => d.path),
    };
    try {
      if (editing) await api.updateProject(project.id, payload);
      else await api.createProject(payload);
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${form.name || project.id}"?`)) return;
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{editing ? "Edit project" : "Add project"}</strong>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : (
            <form className="pform" onSubmit={save}>
              <label>
                Name
                <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </label>
              <div className="pform-row">
                <label>
                  GitHub repo (owner/name)
                  <input
                    value={form.repo}
                    onChange={(e) => set("repo", e.target.value)}
                    placeholder="franklinblanco/my-project"
                    required
                  />
                </label>
                <label className="narrow">
                  Branch
                  <input value={form.branch} onChange={(e) => set("branch", e.target.value)} />
                </label>
              </div>
              <label>
                Local path <span className="muted">(for the macOS terminal shortcut)</span>
                <input
                  value={form.localPath}
                  onChange={(e) => set("localPath", e.target.value)}
                  placeholder="/Users/you/Developer/my-project"
                />
              </label>
              <div className="pform-row">
                <label>
                  Railway URL
                  <input value={form.railwayUrl} onChange={(e) => set("railwayUrl", e.target.value)} />
                </label>
                <label>
                  Live deployment URL
                  <input value={form.deployUrl} onChange={(e) => set("deployUrl", e.target.value)} />
                </label>
              </div>
              <div className="pform-row">
                <label>
                  Healthcheck URL
                  <input
                    value={form.healthcheckUrl}
                    onChange={(e) => set("healthcheckUrl", e.target.value)}
                    placeholder="https://…/health (blank = none)"
                  />
                </label>
                <label className="narrow">
                  Expect status
                  <input
                    type="number"
                    value={form.expectStatus}
                    onChange={(e) => set("expectStatus", e.target.value)}
                  />
                </label>
              </div>

              <label className="narrow-select">
                Status <span className="muted">(tag shown on the card)</span>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="">— None —</option>
                  <option value="published">Published</option>
                  <option value="development">Development</option>
                  <option value="stale">Stale</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </label>

              <div className="pform-docs">
                <div className="pform-docs-head">
                  <span>Docs / links</span>
                  <button type="button" className="btn ghost small" onClick={addDoc}>+ Add doc</button>
                </div>
                {form.docs.map((d, i) => (
                  <div className="pform-row" key={i}>
                    <input
                      placeholder="Label (e.g. README)"
                      value={d.label}
                      onChange={(e) => setDoc(i, "label", e.target.value)}
                    />
                    <input
                      placeholder="Path in repo (e.g. README.md)"
                      value={d.path}
                      onChange={(e) => setDoc(i, "path", e.target.value)}
                    />
                    <button type="button" className="btn ghost small" onClick={() => removeDoc(i)}>✕</button>
                  </div>
                ))}
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="pform-actions">
                {editing && (
                  <button type="button" className="btn danger" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                )}
                <div className="spacer" />
                <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
                <button className="btn primary inline" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save" : "Add project"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
