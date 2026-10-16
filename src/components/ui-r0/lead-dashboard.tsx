import Link from "next/link";
import {
  FolderOpen,
  Layers3,
  FileCheck2,
  Clock3,
  ArrowUpRight,
  ArrowRight,
  CheckCheck,
  CalendarDays,
  Activity,
  ArrowDownLeft,
} from "lucide-react";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  dashboardMetrics,
  dashboardUrl,
  type DashboardData,
} from "@/lib/dashboard";
import { projectSchema } from "@/lib/project-workspace";
import {
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "@/lib/monitoring";
import { calendarEventSchema, todayManila } from "@/lib/calendar";
import { formatTime, type Profile } from "@/lib/phase1";
import { Panel, SectionHeading, StatTile, Empty } from "./primitives";
import styles from "./ui-r0.module.css";
function greeting(profile: Profile, at: string) {
  const hour = new Date(at).getHours();
  const part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const firstName = profile.display_name.trim().split(/\s+/)[0] || "there";
  return `${part}, ${firstName}`;
}
export async function LeadDashboard({
  data,
  profile,
  restricted = false,
}: {
  data: DashboardData;
  profile: Profile;
  restricted?: boolean;
}) {
  const { client } = await requireWorkspace();
  const today = todayManila(),
    until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 14);
  const [projectResult, datesResult] = await Promise.all([
    client
      .from("projects")
      .select(
        "id,name,reference,lead_designer_id,commercial_status,expected_handoff,created_at",
      )
      .eq("is_cancelled", false)
      .eq("is_operationally_completed", false)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(3),
    process.env.ONE_ODC_CALENDAR_ENABLED === "true"
      ? client.rpc("workspace_calendar", {
          p_from: today,
          p_to: until.toISOString().slice(0, 10),
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  checkDatabase(projectResult.error);
  checkDatabase(datesResult.error);
  const projects = projectSchema.array().parse(projectResult.data ?? []);
  const monitoring = projects.length
    ? await client.rpc("monitoring_summary", {
        p_projects: projects.map((p) => p.id),
      })
    : { data: [], error: null };
  checkDatabase(monitoring.error);
  const summaries = new Map(
    (monitoring.data as Monitoring[]).map((m) => [m.project_id, m]),
  );
  const dates = calendarEventSchema
    .array()
    .parse(datesResult.data)
    .filter((e) => !["Completed", "Not Applicable"].includes(e.status))
    .slice(0, 3);
  const count = (key: string) => data.metrics[key]?.count ?? 0;
  const selected = dashboardMetrics.lead_designer.find(
    (m) => m.key === data.view,
  );
  const maxWorkload = Math.max(1, ...data.workload.map((w) => w.count));
  return (
    <div className={styles.dashboard}>
      {restricted && (
        <p className={styles.restricted} role="alert">
          Your role does not permit access to that page.
        </p>
      )}
      <section className={styles.welcome} aria-label="Welcome">
        <div>
          <span className={styles.eyebrow}>
            DESIGN, WITH EVERY DETAIL CONNECTED
          </span>
          <h2>{greeting(profile, data.as_of)}.</h2>
          <p>Here’s what needs your attention across the studio.</p>
        </div>
        <Link
          href="/dashboard/leads?status=Submitted"
          className={styles.primaryAction}
        >
          <ArrowDownLeft size={17} />
          Review leads
          <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className={styles.stats} aria-label="Lead Designer key metrics">
        <StatTile
          icon={FolderOpen}
          label="Active projects"
          value={count("active_projects")}
          description="Across your assigned workspace"
          href={dashboardUrl("active_projects")}
          accent
        />
        <StatTile
          icon={Layers3}
          label="Spaces to review"
          value={count("attention_spaces")}
          description="Review, revisions & upcoming work"
          href={dashboardUrl("attention_spaces")}
        />
        <StatTile
          icon={FileCheck2}
          label="Quotation reviews"
          value={count("quotation_reviews")}
          description="Submitted and ready for a decision"
          href={dashboardUrl("quotation_reviews")}
        />
        <StatTile
          icon={Clock3}
          label="Overdue projects"
          value={count("overdue_projects")}
          description="Active projects past a deadline"
          href={dashboardUrl("overdue_projects")}
        />
      </section>
      {selected && (
        <Panel label="Matching KPI records" className={styles.matching}>
          <SectionHeading
            title={selected.label}
            description={selected.definition}
            action={
              <Link href="/dashboard" className={styles.textLink}>
                Close results
              </Link>
            }
          />
          {data.records.length ? (
            <ul className={styles.attentionList}>
              {data.records.map((record) => (
                <li key={record.id}>
                  <Link href={record.href}>
                    <strong>{record.label}</strong>
                    <span>{record.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="No matching records"
              description="There are no records in this view."
            />
          )}
          <nav
            className={styles.resultPagination}
            aria-label="KPI result pages"
          >
            <span>
              Page {data.page} ·{" "}
              {data.view === "workload"
                ? data.workload_count
                : count(data.view)}{" "}
              matching records
            </span>
            {data.page > 1 && (
              <Link href={dashboardUrl(data.view, data.page - 1)}>
                Previous
              </Link>
            )}
            {data.page * 25 < count(data.view) && (
              <Link href={dashboardUrl(data.view, data.page + 1)}>Next</Link>
            )}
          </nav>
        </Panel>
      )}
      <div className={styles.focusGrid}>
        <Panel label="Action required">
          <SectionHeading
            title="Action required"
            description="Your next decisions, in one place."
            action={
              <span className={styles.countBadge}>
                {data.actions.length
                  ? `${data.actions.length} recent`
                  : "All clear"}
              </span>
            }
          />
          {data.actions.length ? (
            <ul className={styles.attentionList}>
              {data.actions.slice(0, 3).map((record) => (
                <li key={record.id}>
                  <Link href={record.href}>
                    <span className={styles.queueIcon}>
                      <FileCheck2 size={18} aria-hidden="true" />
                    </span>
                    <span className={styles.queueCopy}>
                      <strong>{record.label}</strong>
                      <span>
                        {record.detail ||
                          "Open the record to review the next step."}
                      </span>
                    </span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="You’re all caught up"
              description="New review items will appear here as work moves forward."
            />
          )}
          {data.actions.length > 3 && (
            <details className={styles.moreQueue}>
              <summary>
                Show {data.actions.length - 3} more attention items
              </summary>
              <ul className={styles.attentionList}>
                {data.actions.slice(3).map((r) => (
                  <li key={r.id}>
                    <Link href={r.href}>
                      <strong>{r.label}</strong>
                      <span>{r.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className={styles.panelFooter}>
            <Link href={dashboardUrl("attention_spaces")}>
              Explore space workload
              <ArrowRight size={15} />
            </Link>
            <Link href={dashboardUrl("quotation_reviews")}>
              Review quotations
              <ArrowRight size={15} />
            </Link>
          </div>
        </Panel>
        <Panel label="Studio workload" className={styles.workload}>
          <SectionHeading
            title="Studio workload"
            description="Unfinished spaces per assigned Designer."
            action={
              <Link
                href={dashboardUrl("workload")}
                aria-label="View Designer workload"
                className={styles.smallArrow}
              >
                <ArrowUpRight size={18} />
              </Link>
            }
          />
          {data.workload.length ? (
            <ul className={styles.workloadList}>
              {data.workload.slice(0, 4).map((person) => (
                <li key={person.id}>
                  <div className={styles.workloadPerson}>
                    <span className={styles.personInitial}>
                      {person.display_name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>{person.display_name}</span>
                    <strong>
                      {person.count}
                      <small> spaces</small>
                    </strong>
                  </div>
                  <meter
                    min={0}
                    max={maxWorkload}
                    value={person.count}
                    aria-label={`${person.display_name}: ${person.count} unfinished spaces`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="No open design workload"
              description="Assigned unfinished spaces will appear here."
            />
          )}
          <p className={styles.smallPrint}>
            Shared spaces count toward each assigned Designer.
          </p>
          <div className={styles.workloadSummary}>
            <CheckCheck size={18} />
            <div>
              <strong>{count("recent_completed")} recently completed</strong>
              <span>Project completions recorded in the last 14 days</span>
            </div>
          </div>
        </Panel>
      </div>
      <section
        aria-label="Recent active projects"
        className={styles.projectsSection}
      >
        <SectionHeading
          title="Projects in focus"
          description="Your three most recently created active projects."
          action={
            <Link href="/dashboard/projects" className={styles.textLink}>
              All projects
              <ArrowUpRight size={15} />
            </Link>
          }
        />
        {projects.length ? (
          <div className={styles.projectGrid}>
            {projects.map((p) => {
              const summary = summaries.get(p.id),
                metrics = summary ? projectMetrics(summary) : null;
              return (
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  key={p.id}
                  className={styles.projectCard}
                >
                  <div className={styles.projectCardTop}>
                    <span className={styles.projectSymbol}>
                      <FolderOpen size={19} />
                    </span>
                    <span className={styles.projectStage}>
                      {p.commercial_status}
                    </span>
                  </div>
                  <h3>{p.name}</h3>
                  <p>
                    {summary ? projectWorkState(summary) : "Project workspace"}
                    <span aria-hidden="true"> · </span>
                    {p.reference}
                  </p>
                  <div className={styles.designProgress}>
                    <span>Design completion</span>
                    <strong>{metrics?.progress ?? "Not Available"}</strong>
                  </div>
                  {summary && summary.active_spaces > 0 ? (
                    <progress
                      max={summary.active_spaces}
                      value={summary.completed_spaces}
                      aria-label={`${p.name} design completion`}
                    />
                  ) : (
                    <p className={styles.smallPrint}>
                      Space scope not established
                    </p>
                  )}
                  <div className={styles.projectCardFooter}>
                    <span>
                      <CalendarDays size={14} />
                      {summary?.deadline ?? "No deadline set"}
                    </span>
                    <ArrowUpRight size={16} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Panel label="No active projects">
            <Empty
              title="A clear project workspace"
              description="Accepted, assigned projects will appear here."
            />
          </Panel>
        )}
      </section>
      <div className={styles.bottomGrid}>
        <Panel label="Recent relevant activity">
          <SectionHeading
            title="Recent activity"
            description="The latest updates in your authorized workspace."
          />
          <ul className={styles.activityList}>
            {data.recent.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className={styles.activityIcon}>
                  <Activity size={16} />
                </span>
                <div>
                  <strong>{r.label}</strong>
                  {r.detail && <p>{r.detail}</p>}
                  <small>{r.at ? formatTime(r.at) : "Recorded activity"}</small>
                </div>
              </li>
            ))}
          </ul>
          {!data.recent.length && (
            <Empty
              title="No recent updates"
              description="Relevant project activity will appear here."
            />
          )}
          {data.recent.length > 5 && <div className={styles.panelFooter}><Link href="/dashboard/notifications">View all activity <ArrowUpRight size={15} aria-hidden="true" /></Link></div>}
        </Panel>
        <Panel label="Upcoming dates">
          <SectionHeading
            title="Coming up"
            description="Open work in the next two weeks."
            action={
              <Link href="/dashboard/calendar" className={styles.textLink}>
                Calendar
                <ArrowUpRight size={15} />
              </Link>
            }
          />
          {dates.length ? (
            <ul className={styles.upcomingList}>
              {dates.map((e) => (
                <li key={e.id}>
                  <span className={styles.dateSquare}>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${e.date}T00:00:00Z`))}
                    <strong>{Number(e.date.slice(-2))}</strong>
                  </span>
                  <div>
                    <Link href={e.href ?? "/dashboard/calendar"}>
                      {e.title}
                    </Link>
                    <p>
                      {e.subtitle} · {e.kind}
                    </p>
                    <small>
                      {e.time ? e.time.slice(0, 5) : "All day"} · {e.timezone}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Room to plan ahead"
              description="No upcoming open dates in your authorized calendar."
            />
          )}
        </Panel>
      </div>
      <footer className={styles.dataFoot}>
        <span className={styles.liveDot} />
        Authorized workspace data<span>Updated {formatTime(data.as_of)}</span>
        <details>
          <summary>Metric definitions</summary>
          <dl>
            {dashboardMetrics.lead_designer.map((m) => (
              <div key={m.key}>
                <dt>{m.label}</dt>
                <dd>{m.definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      </footer>
    </div>
  );
}
