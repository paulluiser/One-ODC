import {
  projectWorkState,
  projectMetrics,
  type Monitoring,
} from "@/lib/monitoring";
import Link from "next/link";
import { leadAge, formatTime, type Lead, type Project } from "@/lib/phase1";
export function PageIntro({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function LeadTable({ leads }: { leads: Lead[] }) {
  return leads.length ? (
    <div className="surface">
      <div className="table-scroll">
        <table className="live-table directory-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link
                    className="project-name"
                    href={`/dashboard/leads/${l.id}`}
                  >
                    {l.project_name || "Untitled draft"}
                  </Link>
                  <span className="project-reference">{l.reference}</span>
                </td>
                <td>
                  <span className="live-status" data-status={l.status}>
                    {l.status}
                  </span>
                </td>
                <td>
                  {l.first_submitted_at
                    ? formatTime(l.first_submitted_at)
                    : "Not submitted"}
                </td>
                <td>
                  {leadAge(l) === null ? "Not started" : `${leadAge(l)} days`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="surface empty-state">
      <h3>No leads in this view</h3>
      <p>New and reviewed requests will appear here.</p>
    </div>
  );
}
export function ProjectTable({
  projects,
  monitoring,
}: {
  projects: Project[];
  monitoring?: Record<string, Monitoring>;
}) {
  return projects.length ? (
    <div className="surface">
      <div className="table-scroll">
        <table className="live-table directory-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Commercial stage</th>
              <th>Expected handoff</th>
              <th>Created</th>
              {monitoring && (
                <>
                  <th>Design progress</th>
                  <th>State</th>
                  <th>Deadline</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    className="project-name"
                    href={`/dashboard/projects/${p.id}`}
                  >
                    {p.name}
                  </Link>
                  <span className="project-reference">{p.reference}</span>
                </td>
                <td>
                  <span
                    className="live-status"
                    data-status={p.commercial_status}
                  >
                    {p.commercial_status}
                  </span>
                </td>
                <td>{p.expected_handoff || "Not scheduled"}</td>
                <td>{formatTime(p.created_at)}</td>
                {monitoring &&
                  (monitoring[p.id] ? (
                    <ProjectMonitoringCells summary={monitoring[p.id]} />
                  ) : (
                    <td colSpan={3} className="cell-secondary">
                      Restricted preview
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="surface empty-state">
      <h3>No assigned projects yet</h3>
      <p>
        Projects are created when a submitted lead is accepted and personnel are
        assigned.
      </p>
    </div>
  );
}
function ProjectMonitoringCells({ summary }: { summary: Monitoring }) {
  const metrics = projectMetrics(summary);
  const percent = Number.parseFloat(metrics.progress);
  const tone =
    metrics.risk === "Overdue"
      ? "status-red"
      : metrics.risk === "At Risk"
        ? "status-amber"
        : "status-green";
  return (
    <>
      <td>
        <span className="directory-progress">
          <span className="directory-progress-track" aria-hidden="true">
            <span
              style={{
                width: `${Number.isFinite(percent) ? percent : 0}%`,
              }}
            />
          </span>
          <b>{metrics.progress}</b>
        </span>
      </td>
      <td>
        <span className={`status ${tone}`}>{metrics.risk}</span>
        <span className="cell-secondary">
          {process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true"
            ? projectWorkState(summary)
            : summary.state}{" "}
          · {metrics.age} days
        </span>
      </td>
      <td>{summary.deadline || "Not scheduled"}</td>
    </>
  );
}
