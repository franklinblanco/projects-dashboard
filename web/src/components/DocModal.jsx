import { useEffect, useState } from "react";
import { marked } from "marked";
import { api } from "../api.js";

marked.setOptions({ breaks: true, gfm: true });

export default function DocModal({ project, doc, onClose }) {
  const [content, setContent] = useState({ state: "loading" });
  const [path, setPath] = useState(doc.path === "README.md" ? "" : doc.path);

  useEffect(() => {
    let cancelled = false;
    setContent({ state: "loading" });
    api
      .doc(project.id, path)
      .then((res) => !cancelled && setContent({ state: "ok", ...res }))
      .catch((e) => !cancelled && setContent({ state: "error", error: String(e.message || e) }));
    return () => {
      cancelled = true;
    };
  }, [project.id, path]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <strong>{project.name}</strong>
            <span className="muted"> / {path || doc.label}</span>
          </div>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {content.state === "loading" && <div className="muted">Loading…</div>}
          {content.state === "error" && (
            <div className="form-error">Could not load: {content.error}</div>
          )}
          {content.state === "ok" && content.type === "dir" && (
            <ul className="dir-list">
              {content.entries.map((e) => (
                <li key={e.path}>
                  {e.type === "dir" ? (
                    <button className="dir-link" onClick={() => setPath(e.path)}>
                      📁 {e.name}
                    </button>
                  ) : (
                    <button className="dir-link" onClick={() => setPath(e.path)}>
                      📄 {e.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {content.state === "ok" && content.type === "file" && (
            <div
              className="markdown"
              dangerouslySetInnerHTML={{ __html: marked.parse(content.text || "") }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
