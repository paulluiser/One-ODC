import Link from "next/link";
import {
  ArrowUpRight,
  Layers3,
  Clock3,
  FileCheck2,
  FolderOpen,
  Users,
  Mail,
  ShieldAlert,
  UserRoundX,
  MessageSquare,
  Wrench,
  Truck,
  ChartColumn,
  CheckCheck,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import {
  dashboardMetrics,
  dashboardUrl,
  type DashboardData,
} from "@/lib/dashboard";
import { dashboardPrimary } from "@/lib/workspace-presentation";
import { financialAmount } from "@/lib/finance";
import { formatTime, type Profile } from "@/lib/phase1";
import type { DashboardExtras } from "@/lib/dashboard-extras";
import {
  DashboardHeader,
  DashboardMetricCard,
  DashboardChartPanel,
  DashboardRecords,
  ActionRequiredPanel,
  RecentActivityPanel,
  UpcomingDeadlinesPanel,
  DashboardDonut,
  DashboardBars,
  DashboardDateChart,
  readableDashboardText,
} from "./dashboard-parts";
import styles from "./dashboard-workspace.module.css";
const icons = {
  system_administrator: [Users, Mail, ShieldAlert, UserRoundX],
  lead_designer: [FolderOpen, Layers3, FileCheck2, Clock3],
  designer: [Layers3, Clock3, FileCheck2, Clock3],
  bdm: [FileCheck2, Clock3, MessageSquare, FolderOpen],
  operations_admin: [FolderOpen, FileCheck2, Wrench, Truck],
};
const introductions = {
  system_administrator: [
    "Account access, clearly managed.",
    "Manage team access and keep track of system activity.",
    "Manage team access",
    "/dashboard/users",
  ],
  lead_designer: [
    "Design, with every detail connected.",
    "Here’s what needs your attention across the studio.",
    "Review leads",
    "/dashboard/leads?status=Submitted",
  ],
  designer: [
    "Your design work, in focus.",
    "Review your spaces, revisions and upcoming responsibilities.",
    "Open assigned projects",
    "/dashboard/projects",
  ],
  bdm: [
    "Keep every opportunity moving.",
    "Follow your leads from submission to commercial closure.",
    "New quotation request",
    "/dashboard/leads/new",
  ],
  operations_admin: [
    "Keep delivery moving forward.",
    "Prioritize Ordered Space handoffs and supplier logistics.",
    "Open operational projects",
    "/dashboard/projects",
  ],
} as const;
const noExtras: DashboardExtras = {
  statuses: [],
  frequency: [],
  schedule: [],
  upcoming: [],
  projects: [],
};
export function RebuildRoleDashboard({
  data,
  profile,
  restricted = false,
  extra = noExtras,
}: {
  data: DashboardData;
  profile: Profile;
  restricted?: boolean;
  extra?: DashboardExtras;
}) {
  const role = data.role,
    intro = introductions[role],
    definitions = dashboardMetrics[role],
    primary = [
      ...dashboardPrimary[role],
      ...(role === "system_administrator" ? ["inactive_users"] : []),
    ].filter((key) => !key.includes("installation")),
    selected = definitions.find((d) => d.key === data.view),
    count = (key: string) => data.metrics[key]?.count ?? 0;
  const metricLabel = (key: string, label: string) =>
    role === "lead_designer" && key === "active_projects"
      ? "Active projects"
      : key === "attention_spaces"
        ? "Spaces requiring attention"
        : key === "access_alerts"
          ? "Access alerts"
          : key === "delayed_logistics"
            ? "Supplier delivery delay"
            : label;
  const secondary = definitions.filter(
    (m) => !primary.includes(m.key) && !m.key.startsWith("logistics:"),
  );
  const facts = (keys = secondary) => (
    <ul className={styles.facts}>
      {keys.map((m) => (
        <li key={m.key}>
          <Link href={dashboardUrl(m.key)} title={m.definition}>
            <span>{m.label}</span>
            <strong className={m.currency ? styles.money : undefined}>
              {m.currency
                ? financialAmount(data.metrics[m.key]?.amount)
                : count(m.key)}
            </strong>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
  const recent = <RecentActivityPanel data={data} />;
  const actions = <ActionRequiredPanel data={data} />;
  const upcoming = <UpcomingDeadlinesPanel items={extra.upcoming} />;
  const access = (
    <DashboardChartPanel
      title="Access & oversight"
      description="Current account access. Invitations may overlap either state."
      icon={ChartColumn}
    >
      <DashboardDonut
        label="Total users"
        items={[
          {
            label: "Active users",
            count: count("active_users"),
            href: dashboardUrl("active_users"),
          },
          {
            label: "Inactive users",
            count: count("inactive_users"),
            href: dashboardUrl("inactive_users"),
          },
        ]}
      />
      <p className={styles.contextNote}>
        Pending invitations:{" "}
        <Link href={dashboardUrl("invitations")}>{count("invitations")}</Link>.
        No recorded first sign-in; email delivery is not inferred.
      </p>
    </DashboardChartPanel>
  );
  const commercial = (
    <DashboardChartPanel
      title="Commercial overview"
      description="Results from your authorized workspace."
      icon={ChartColumn}
    >
      {facts()}
    </DashboardChartPanel>
  );
  const pipeline = (
    <DashboardChartPanel
      title="Lead pipeline"
      description="Current, mutually exclusive states of submitted leads."
      icon={ChartColumn}
    >
      <DashboardDonut
        label="Submitted leads"
        items={[
          {
            label: "Awaiting review",
            count: count("awaiting_leads"),
            href: dashboardUrl("awaiting_leads"),
          },
          {
            label: "For clarification",
            count: count("clarification_leads"),
            href: dashboardUrl("clarification_leads"),
          },
          {
            label: "Accepted",
            count: count("accepted_leads"),
            href: dashboardUrl("accepted_leads"),
          },
          {
            label: "Rejected",
            count: count("rejected_leads"),
            href: dashboardUrl("rejected_leads"),
          },
        ]}
      />
    </DashboardChartPanel>
  );
  const logistics = (
    <DashboardChartPanel
      title="Logistics progression"
      description="Current record counts by stage, not cumulative completion."
      icon={Truck}
    >
      <DashboardBars
        label="Authorized logistics stages"
        items={definitions
          .filter((m) => m.key.startsWith("logistics:"))
          .map((m) => ({
            label: m.key.slice(10),
            count: count(m.key),
            href: dashboardUrl(m.key),
          }))}
      />
      <div className={styles.summaryLine}>
        <Truck size={20} aria-hidden="true" />
        <span>
          Recently delivered projects{" "}
          <strong>{count("recent_delivered")}</strong>
        </span>
      </div>
      <p className={styles.contextNote}>
        <Link href={dashboardUrl("delayed_logistics")}>
          {count("delayed_logistics")} records without a stage change for at
          least seven days
        </Link>
        . This is inactivity, not a missed delivery deadline.
      </p>
    </DashboardChartPanel>
  );
  const workload = (
    <DashboardChartPanel
      title="Studio workload"
      description="Unfinished spaces per assigned Designer. Shared spaces may overlap."
      icon={ChartColumn}
      action={
        <Link href={dashboardUrl("workload")}>
          View all <ArrowUpRight size={14} />
        </Link>
      }
    >
      <DashboardBars
        label="Designer workload"
        items={data.workload
          .slice(0, 4)
          .map((w) => ({ label: w.display_name, count: w.count }))}
      />
      <div className={styles.summaryLine}>
        <CheckCheck size={20} aria-hidden="true" />
        <span>
          <strong>{count("recent_completed")} recently completed</strong>Project
          completions recorded in the last 14 days
        </span>
      </div>
    </DashboardChartPanel>
  );
  return (
    <div className={styles.dashboard}>
      {restricted && (
        <p role="alert" className={styles.restricted}>
          Your role does not permit access to that page.
        </p>
      )}
      <DashboardHeader
        profile={profile}
        at={data.as_of}
        eyebrow={intro[0]}
        description={intro[1]}
        action={intro[2]}
        href={intro[3]}
      />
      <section
        className={styles.metrics}
        aria-label={
          role === "lead_designer" ? "Lead Designer key metrics" : "Role KPIs"
        }
      >
        {primary.map((key, i) => {
          const m = definitions.find((d) => d.key === key)!;
          return (
            <DashboardMetricCard
              key={key}
              index={i}
              label={metricLabel(key, m.label)}
              value={
                role === "operations_admin" && key === "delayed_logistics"
                  ? "Not available"
                  : count(key)
              }
              definition={m.definition}
              href={
                role === "operations_admin" && key === "delayed_logistics"
                  ? undefined
                  : dashboardUrl(key)
              }
              icon={icons[role][i]}
            />
          );
        })}
      </section>
      {selected && (
        <DashboardChartPanel
          title={
            data.view === "delayed_logistics"
              ? "Supplier progress inactivity"
              : selected.label
          }
          description={selected.definition}
          icon={ListTodo}
          action={<Link href="/dashboard">Close results</Link>}
        >
          {data.view === "workload" ? (
            <DashboardBars
              label="Designer workload records"
              items={data.workload.map((w) => ({
                label: w.display_name,
                count: w.count,
              }))}
            />
          ) : data.records.length ? (
            <DashboardRecords records={data.records} />
          ) : (
            <p className={styles.empty}>No matching records.</p>
          )}
          <nav className={styles.pagination} aria-label="KPI pagination">
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
            {data.page * 25 <
              (data.view === "workload"
                ? data.workload_count
                : count(data.view)) && (
              <Link href={dashboardUrl(data.view, data.page + 1)}>Next</Link>
            )}
          </nav>
        </DashboardChartPanel>
      )}
      {role === "system_administrator" && (
        <>
          <div className={styles.twoColumns}>
            {actions}
            {access}
          </div>
          <RecentActivityPanel data={data}>
            {extra.frequency.length > 0 && (
              <div className={styles.miniFrequency}>
                <small>Last seven Manila dates</small>
                <DashboardDateChart
                  compact
                  items={extra.frequency}
                  label="System activity frequency"
                  href={dashboardUrl("system_activity")}
                />
              </div>
            )}
          </RecentActivityPanel>
        </>
      )}
      {role === "bdm" && (
        <>
          <div className={styles.twoColumns}>
            {actions}
            {commercial}
          </div>
          <div className={styles.twoColumns}>
            {recent}
            {pipeline}
          </div>
        </>
      )}
      {role === "operations_admin" && (
        <>
          <div className={styles.twoColumns}>
            {actions}
            {logistics}
          </div>
          <div className={styles.twoColumns}>{recent}</div>
        </>
      )}
      {role === "designer" && (
        <div className={styles.twoColumns}>
          <div className={styles.stack}>
            {actions}
            {recent}
          </div>
          <div className={styles.stack}>
            <DashboardChartPanel
              title="Your responsibilities"
              description="Current assigned work."
              icon={ChartColumn}
            >
              {facts()}
            </DashboardChartPanel>
            <DashboardChartPanel
              title="Space status"
              description="Mutually exclusive statuses of your assigned unfinished spaces."
              icon={Layers3}
            >
              <DashboardDonut label="Active spaces" items={extra.statuses} />
            </DashboardChartPanel>
            {upcoming}
          </div>
        </div>
      )}
      {role === "lead_designer" && (
        <>
          <div className={styles.twoColumns}>
            {actions}
            {workload}
          </div>
          <DashboardChartPanel
            title="Projects in focus"
            description="Your three most recently created active projects."
            icon={FolderOpen}
          >
            <div className={styles.projectGrid}>
              {extra.projects.map((p) => (
                <Link
                  className={styles.project}
                  href={`/dashboard/projects/${p.id}`}
                  key={p.id}
                >
                  <div>
                    <FolderOpen size={20} aria-hidden="true" />
                    <strong title={p.name}>
                      {readableDashboardText(p.name)}
                    </strong>
                    <span className={styles.badge}>
                      {p.commercial === "For Quotation"
                        ? p.commercial
                        : p.lifecycle}
                    </span>
                  </div>
                  <span className={styles.projectProgress}>
                    Design completion{" "}
                    <strong>
                      {p.progress === null
                        ? "Not available"
                        : p.progress.toFixed(1) + "%"}
                    </strong>
                  </span>
                  {p.progress !== null && (
                    <progress
                      max={100}
                      value={p.progress}
                      aria-label={`${readableDashboardText(p.name)} design progress`}
                    />
                  )}
                  <small>
                    <CalendarDays size={14} />
                    {p.deadline ? `Due ${p.deadline}` : "No deadline set"}
                  </small>
                </Link>
              ))}
            </div>
            {!extra.projects.length && (
              <p className={styles.empty}>No active projects.</p>
            )}
          </DashboardChartPanel>
          <div className={styles.twoColumns}>
            {recent}
            {upcoming}
          </div>
        </>
      )}
      <footer className={styles.footer}>
        Authorized workspace data · Updated {formatTime(data.as_of)}
      </footer>
    </div>
  );
}
