import {
  projectWorkState,
  projectMetrics,
  type Monitoring,
} from "@/lib/monitoring";
import Link from "next/link";
import { RecordTable } from "./record-table";
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
      <RecordTable label="Lead directory">
        <table className="live-table directory-table" role="table">
          <thead>
            <tr role="row">
              <th scope="col">Lead</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
              <th scope="col">Age</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr role="row" key={l.id}>
                <td data-label="Name">
                  <Link
                    className="project-name"
                    href={`/dashboard/leads/${l.id}`}
                  >
                    {l.project_name || "Untitled draft"}
                  </Link>
                  <span className="project-reference">{l.reference}</span>
                </td>
                <td data-label="Status">
                  <span className="live-status" data-status={l.status}>
                    {l.status}
                  </span>
                </td>
                <td data-label="Submitted">
                  {l.first_submitted_at
                    ? formatTime(l.first_submitted_at)
                    : "Not submitted"}
                </td>
                <td data-label="Age">
                  {leadAge(l) === null
                    ? "Not started"
                    : `${leadAge(l)} ${leadAge(l) === 1 ? "day" : "days"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RecordTable>
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
      <RecordTable label="Project directory">
        <table className="live-table directory-table" role="table">
          <thead>
            <tr role="row">
              <th scope="col">Project</th>
              <th scope="col">Commercial stage</th>
              <th scope="col">Dates</th>
              {monitoring && (
                <>
                  <th scope="col">Design progress</th>
                  <th scope="col">State</th>
                  <th scope="col">Deadline</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr role="row" key={p.id}>
                <td data-label="Name">
                  <Link
                    className="project-name"
                    href={`/dashboard/projects/${p.id}`}
                  >
                    {p.name}
                  </Link>
                  <span className="project-reference">{p.reference}</span>
                </td>
                <td data-label="Commercial stage">
                  <span
                    className="live-status"
                    data-status={p.commercial_status}
                  >
                    {p.commercial_status}
                  </span>
                </td>
                <td data-label="Dates" className="directory-dates">
                  <span>Handoff: {p.expected_handoff || "Not scheduled"}</span>
                  <span className="cell-secondary">
                    Created {formatTime(p.created_at)}
                  </span>
                </td>
                {monitoring &&
                  (monitoring[p.id] ? (
                    <ProjectMonitoringCells summary={monitoring[p.id]} />
                  ) : (
                    <td
                      data-label="Monitoring"
                      colSpan={3}
                      className="cell-secondary"
                    >
                      Restricted preview
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </RecordTable>
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
      <td data-label="Design progress">
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
      <td data-label="State">
        <span className={`status ${tone}`}>{metrics.risk}</span>
        <span className="cell-secondary">
          {process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true"
            ? projectWorkState(summary)
            : summary.state}{" "}
          · {metrics.age} days
        </span>
      </td>
      <td data-label="Deadline">{summary.deadline || "Not scheduled"}</td>
    </>
  );
}
