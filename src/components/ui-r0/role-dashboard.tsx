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
} from "lucide-react";
import {
  dashboardMetrics,
  dashboardUrl,
  type DashboardData,
} from "../../lib/dashboard";
import { dashboardPrimary } from "../../lib/workspace-presentation";
import { financialAmount } from "../../lib/finance";
import { formatTime, type Profile } from "../../lib/phase1";
import { Panel, SectionHeading, StatTile, Empty } from "./primitives";
import styles from "./ui-r0.module.css";
import r1 from "./ui-r1.module.css";
import { ContextPanel } from "../context-panel";
function greeting(profile: Profile, at: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(at)),
  );
  const part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const firstName = profile.display_name.trim().split(/\s+/)[0] || "there";
  return `${part}, ${firstName}`;
}
const icons = {
  system_administrator: [Users, Mail, ShieldAlert, UserRoundX],
  designer: [Layers3, Clock3, FileCheck2, Clock3],
  bdm: [FileCheck2, Clock3, MessageSquare, FolderOpen],
  operations_admin: [FolderOpen, FileCheck2, Wrench, Truck],
} as const;
const introductions = {
  system_administrator: [
    "Account access, clearly managed.",
    "Manage team access and keep track of system activity.",
    "Manage team access",
    "/dashboard/users",
  ],
  designer: [
    "Your design work, in focus.",
    "Review your spaces, revisions and upcoming responsibilities.",
    "Open assigned projects",
    "/dashboard/projects",
  ],
  bdm: [
    "Keep every opportunity moving.",
    "Follow your leads from first submission to commercial closure.",
    "New quotation request",
    "/dashboard/leads/new",
  ],
  operations_admin: [
    "Keep delivery moving forward.",
    "Prioritize handoffs, logistics and installation responsibilities.",
    "Open operational projects",
    "/dashboard/projects",
  ],
} as const;
export function RebuildRoleDashboard({
  data,
  profile,
  restricted = false,
}: {
  data: DashboardData;
  profile: Profile;
  restricted?: boolean;
}) {
  if (data.role === "lead_designer") return null;
  const intro = introductions[data.role],
    definitions = dashboardMetrics[data.role];
  const primary = [...dashboardPrimary[data.role]];
  if (data.role === "system_administrator") primary.push("inactive_users");
  const selected = definitions.find((m) => m.key === data.view);
  const count = (key: string) => data.metrics[key]?.count ?? 0;
  const records = (items: DashboardData["records"], activity = false) => (
    <ul className={r1.records}>
      {items.map((record, i) => (
        <li key={`${record.id}-${i}`}>
          {activity && data.role === "system_administrator" ? (
            <strong>
              {record.label
                .replace(/[._]/g, " ")
                .replace(/^./, (c) => c.toUpperCase())}
            </strong>
          ) : (
            <Link href={record.href}>
              <strong>{record.label}</strong>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )}
          {record.detail && <p>{record.detail}</p>}
          {record.at && <small>{formatTime(record.at)}</small>}
        </li>
      ))}
    </ul>
  );
  return (
    <div className={styles.dashboard}>
      {restricted && (
        <p role="alert" className={styles.restricted}>
          Your role does not permit access to that page.
        </p>
      )}
      <section className={styles.welcome} aria-label="Welcome">
        <div>
          <span className={styles.eyebrow}>{intro[0]}</span>
          <h2>{greeting(profile, data.as_of)}</h2>
          <p>{intro[1]}</p>
        </div>
        <Link href={intro[3]} className={styles.primaryAction}>
          {intro[2]}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <section className={styles.stats} aria-label="Role KPIs">
        {primary.map((key, i) => {
          const m = definitions.find((d) => d.key === key)!;
          return (
            <StatTile
              key={key}
              label={m.label}
              value={count(key)}
              description="Open matching records"
              href={dashboardUrl(key)}
              icon={icons[data.role as keyof typeof icons][i]}
              accent={i === 0}
            />
          );
        })}
      </section>
      {selected && (
        <Panel label="Matching KPI records">
          <SectionHeading
            title={selected.label}
            description={selected.definition}
            action={
              <Link className={styles.textLink} href="/dashboard">
                Close results
              </Link>
            }
          />
          {data.records.length ? (
            records(data.records, data.view === "system_activity")
          ) : (
            <Empty
              title="No matching records"
              description="There are no records in your authorized scope for this selection."
            />
          )}
          <nav className={styles.resultPagination} aria-label="KPI pagination">
            <span>
              Page {data.page} · {count(data.view)} matching records
            </span>
            {data.page > 1 && (
              <Link href={dashboardUrl(data.view, data.page - 1)}>
                Previous matching records
              </Link>
            )}
            {data.page * 25 < count(data.view) && (
              <Link href={dashboardUrl(data.view, data.page + 1)}>
                Next matching records
              </Link>
            )}
          </nav>
        </Panel>
      )}
      <div className={styles.focusGrid}>
        <Panel label="Action required">
          <SectionHeading
            title="Action required"
            description="Your next steps, in one place."
            action={
              <span className={styles.countBadge}>
                {data.actions.length
                  ? `${data.actions.length} recent`
                  : "All clear"}
              </span>
            }
          />
          {data.actions.length ? (
            records(data.actions.slice(0, 3))
          ) : (
            <Empty title="All clear" description="No action needed." />
          )}
          {data.actions.length > 3 && (
            <ContextPanel
              title="Action required"
              description="More items from your authorized attention queue."
              triggerLabel={`View ${data.actions.length - 3} more`}
            >
              {records(data.actions.slice(3))}
            </ContextPanel>
          )}
          <div className={styles.panelFooter}>
            <Link href={intro[3]}>
              {intro[2]}
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </Panel>
        <Panel label="Workspace responsibilities">
          <SectionHeading
            title={
              data.role === "system_administrator"
                ? "Access & oversight"
                : data.role === "bdm"
                  ? "Commercial overview"
                  : data.role === "operations_admin"
                    ? "Logistics progression"
                    : "Your responsibilities"
            }
            description="Current authorized scope"
            action={
              <Link
                className={styles.textLink}
                href={
                  data.role === "system_administrator"
                    ? "/dashboard/users"
                    : "/dashboard/projects"
                }
              >
                Open full view <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            }
          />
          {data.role === "operations_admin" ? (
            <ul className={r1.stageList}>
              {definitions
                .filter((m) => m.key.startsWith("logistics:"))
                .map((m) => (
                  <li key={m.key}>
                    <Link href={dashboardUrl(m.key)}>
                      <span>{m.key.slice(10)}</span>
                      <strong>{count(m.key)}</strong>
                    </Link>
                    <meter
                      aria-label={`${m.label}: ${count(m.key)} records`}
                      min={0}
                      max={Math.max(
                        1,
                        ...definitions
                          .filter((x) => x.key.startsWith("logistics:"))
                          .map((x) => count(x.key)),
                      )}
                      value={count(m.key)}
                    />
                  </li>
                ))}
            </ul>
          ) : null}
          {data.role === "operations_admin" && (
            <p className={styles.smallPrint}>
              Current records per stage; bars are relative counts, not
              cumulative completion.
            </p>
          )}
          <div className={r1.supportMetrics}>
            {definitions
              .filter(
                (m) =>
                  !primary.includes(m.key) && !m.key.startsWith("logistics:"),
              )
              .map((m) => (
                <Link href={dashboardUrl(m.key)} key={m.key}>
                  <span>{m.label}</span>
                  <strong className={m.currency ? r1.money : undefined}>
                    {m.currency
                      ? financialAmount(data.metrics[m.key]?.amount)
                      : count(m.key)}
                  </strong>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              ))}
          </div>
          {data.role === "system_administrator" && (
            <p className={styles.smallPrint}>
              Invitations reflect provisioned accounts; email delivery is not
              inferred.
            </p>
          )}
        </Panel>
      </div>
      <Panel label="Recent relevant activity">
        <SectionHeading
          title={
            data.role === "system_administrator"
              ? "Recent system activity"
              : "Recent activity"
          }
          description="Updates from your authorized workspace."
        />
        {data.recent.length ? (
          records(data.recent.slice(0, 5), true)
        ) : (
          <Empty
            title="No recent activity"
            description="Relevant updates will appear here."
          />
        )}
        {data.recent.length > 5 && (
          <div className={styles.panelFooter}>
            <ContextPanel
              title="Recent activity"
              description="Recent updates from your authorized workspace."
              triggerLabel="View more activity"
            >
              {records(data.recent, true)}
            </ContextPanel>
          </div>
        )}
      </Panel>
      <footer className={styles.dataFoot}>
        <span>Authorized workspace data</span>
        <span>Updated {formatTime(data.as_of)}</span>
        <details>
          <summary>Metric definitions</summary>
          {definitions.map((m) => (
            <p key={m.key}>
              <strong>{m.label}: </strong>
              {m.definition}
            </p>
          ))}
        </details>
      </footer>
    </div>
  );
}
