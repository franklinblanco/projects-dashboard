import { api, macBridge } from "../api.js";

function GitHubIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function RailwayIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.113 10.27A13.026 13.026 0 000 11.48h18.23c-.064-.125-.15-.237-.235-.347-3.117-4.027-4.793-3.677-7.19-3.78-.8-.034-1.34-.048-4.524-.048-1.704 0-3.555.005-5.358.01-.234.63-.459 1.24-.567 1.737h9.342v1.216H.113v.002zm18.26 2.426H.009c.02.326.05.645.094.961h16.955c.754 0 1.179-.429 1.315-.96zm-17.318 4.28s2.81 6.902 10.93 7.024c4.855 0 9.027-2.883 10.92-7.024H1.056zM11.988 0C7.5 0 3.593 2.466 1.531 6.108l4.75-.005v-.002c3.71 0 3.849.016 4.573.047l.448.016c1.563.052 3.485.22 4.996 1.364.82.621 2.007 1.99 2.712 2.965.654.902.842 1.94.396 2.934-.408.914-1.289 1.458-2.353 1.458H.391s.099.42.249.886h22.748A12.026 12.026 0 0024 12.005C24 5.377 18.621 0 11.988 0z" />
    </svg>
  );
}

const STATUS_LABEL = {
  up: "Healthy",
  degraded: "Degraded",
  down: "Down",
  checking: "Checking…",
  unconfigured: "No healthcheck",
};

// Lifecycle tag → display label. Empty/unknown status shows no tag.
const PROJECT_TAGS = {
  published: "Published",
  development: "Development",
  stale: "Stale",
  abandoned: "Abandoned",
};

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

export default function ProjectCard({
  project,
  health,
  onOpenDoc,
  onEdit,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}) {
  const status = health?.status || "checking";
  const gh = project.github;

  async function openTerminal() {
    try {
      const { localPath } = await api.localPath(project.id);
      if (localPath) macBridge.openTerminal(localPath);
    } catch {}
  }

  async function openClaude() {
    try {
      const { localPath } = await api.localPath(project.id);
      if (localPath) macBridge.openClaude(localPath);
    } catch {}
  }

  return (
    <article
      className={`card${PROJECT_TAGS[project.status] ? ` tag-${project.status}` : ""}${
        dragging ? " dragging" : ""
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="card-head">
        <div className="card-title">
          <span className="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
          <h2>{project.name}</h2>
          <button className="edit-btn" onClick={onEdit} title="Edit project" aria-label="Edit project">
            ✎
          </button>
        </div>
        <span className={`status status-${status}`}>
          <span className="status-led" />
          {STATUS_LABEL[status] || status}
          {health?.latencyMs != null && status === "up" && (
            <span className="latency">{health.latencyMs}ms</span>
          )}
        </span>
      </div>

      <p className="card-desc">
        {project.description || gh?.description || "No description."}
      </p>

      {project.readmeExcerpt && (
        <button
          className="card-readme"
          onClick={() => onOpenDoc({ label: "README", path: "README.md" })}
          title="Open full README"
        >
          <span className="card-readme-text">{project.readmeExcerpt}</span>
          <span className="card-readme-more">Read more →</span>
        </button>
      )}

      {gh && (gh.language || gh.pushedAt) && (
        <div className="card-meta">
          {gh.language && <span className="chip">{gh.language}</span>}
          {gh.pushedAt && <span className="chip">pushed {relativeTime(gh.pushedAt)}</span>}
        </div>
      )}
      {project.githubError && (
        <div className="card-meta">
          <span className="chip warn">GitHub: {project.githubError}</span>
        </div>
      )}

      <div className="card-links">
        <a
          className="btn link"
          href={`https://github.com/${project.repo}`}
          target="_blank"
          rel="noreferrer"
          draggable={false}
        >
          <GitHubIcon />
          GitHub
        </a>
        {project.railwayUrl ? (
          <a
            className="btn link"
            href={project.railwayUrl}
            target="_blank"
            rel="noreferrer"
            draggable={false}
          >
            <RailwayIcon />
            Railway
          </a>
        ) : (
          <span className="btn link disabled" title="Set railwayUrl in projects.json">
            <RailwayIcon />
            Railway
          </span>
        )}
      </div>

      <div className="card-docs">
        {(project.docs || []).map((d) => (
          <button key={d.path} className="doc-chip" onClick={() => onOpenDoc(d)}>
            📄 {d.label}
          </button>
        ))}
        {project.deployUrl && (
          <a
            className="doc-chip deploy"
            href={project.deployUrl}
            target="_blank"
            rel="noreferrer"
            draggable={false}
          >
            🚀 Live
          </a>
        )}
      </div>

      {PROJECT_TAGS[project.status] && (
        <div className="card-tags">
          <span className={`badge ${project.status}`}>{PROJECT_TAGS[project.status]}</span>
        </div>
      )}

      {project.hasLocalPath && macBridge.available() && (
        <div className="card-native">
          <button className="btn terminal" onClick={openTerminal}>
            {">_"} Open Terminal
          </button>
          <button className="btn claude" onClick={openClaude}>
            ✳ Open with Claude Code
          </button>
        </div>
      )}
    </article>
  );
}
