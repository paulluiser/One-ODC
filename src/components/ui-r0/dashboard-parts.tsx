import Link from "next/link";
import { ContextPanel } from "../context-panel";
import {
  ArrowUpRight,
  Activity,
  CalendarDays,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { formatTime, type Profile } from "@/lib/phase1";
import type { DashboardExtras } from "@/lib/dashboard-extras";
import styles from "./dashboard-workspace.module.css";
export function readableDashboardText(value: string) {
  const labels: Record<string, string> = {
    "auth.sign_in": "User signed in",
    "auth.sign_out": "User signed out",
    "space.created": "Space created",
    "space.status_changed": "Space status updated",
    "project.assignments_changed": "Project team updated",
    "project.created": "Project created",
    "invitation.sent": "Invitation sent",
    "profile.updated": "Account access updated",
    "role.changed": "Permissions updated",
  };
  return value
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "",
    )
    .replace(
      /\b[a-z_]+\.[a-z_]+(?:\.[a-z_]+)*/g,
      (raw) => labels[raw] ?? raw.replace(/[._]/g, " "),
    )
    .replace(
      /\b(lead_designer|system_administrator|operations_admin)\b/g,
      (raw) => raw.replaceAll("_", " "),
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function DashboardHeader({
  profile,
  at,
  eyebrow,
  description,
  action,
  href,
}: {
  profile: Profile;
  at: string;
  eyebrow: string;
  description: string;
  action: string;
  href: string;
}) {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Manila",
    }).format(new Date(at)),
  );
  return (
    <section className={styles.header} aria-label="Welcome">
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2>
          {hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"},{" "}
          {profile.display_name.trim().split(/\s+/)[0] || "there"}
        </h2>
        <p>{description}</p>
      </div>
      <Link className="button button-primary" href={href}>
        {action}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
export function DashboardMetricCard({
  label,
  value,
  definition,
  href,
  icon: Icon,
  index,
}: {
  label: string;
  value: string | number;
  definition: string;
  href?: string;
  icon: LucideIcon;
  index: number;
}) {
  const contents = (
    <>
      <span className={styles.metricLabel}>
        <Icon size={23} aria-hidden="true" />
        {label}
        {href && (
          <ArrowUpRight
            size={17}
            className={styles.metricArrow}
            aria-hidden="true"
          />
        )}
      </span>
      <strong>{value}</strong>
    </>
  );
  return href ? (
    <Link
      className={styles.metric}
      data-tone={index}
      href={href}
      title={definition}
    >
      {contents}
    </Link>
  ) : (
    <article className={styles.metric} data-tone={index} title={definition}>
      {contents}
      <small>Expected delivery dates are not recorded</small>
    </article>
  );
}
export function DashboardSectionHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <header className={styles.sectionHeader}>
      {Icon && (
        <span className={styles.sectionIcon}>
          <Icon size={21} aria-hidden="true" />
        </span>
      )}
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action && <div className={styles.sectionAction}>{action}</div>}
    </header>
  );
}
export function DashboardChartPanel({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <DashboardSectionHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />
      {children}
    </section>
  );
}
export function DashboardRecords({
  records,
  activity = false,
}: {
  records: DashboardData["records"];
  activity?: boolean;
}) {
  return (
    <ul className={activity ? styles.activity : styles.records}>
      {records.map((r, i) => (
        <li key={`${r.id}-${i}`}>
          <Link href={r.href} title={readableDashboardText(r.label)}>
            <span className={styles.rowIcon}>
              <Activity size={activity ? 16 : 20} aria-hidden="true" />
            </span>
            <span className={styles.recordBody}>
              <strong>{readableDashboardText(r.label)}</strong>
              {r.detail && <small>{readableDashboardText(r.detail)}</small>}
              {!activity && r.at && (
                <time dateTime={r.at}>{formatTime(r.at)}</time>
              )}
            </span>
            {activity && r.at ? (
              <time dateTime={r.at}>{formatTime(r.at)}</time>
            ) : (
              <ArrowUpRight size={16} aria-hidden="true" />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
export function ActionRequiredPanel({ data }: { data: DashboardData }) {
  return (
    <DashboardChartPanel
      title="Action required"
      description="Your next steps, in one place."
      icon={ListTodo}
      action={
        <span className={styles.badge}>
          {data.actions.length ? `${data.actions.length} recent` : "All clear"}
        </span>
      }
    >
      {data.actions.length ? (
        <DashboardRecords records={data.actions.slice(0, 3)} />
      ) : (
        <p className={styles.empty}>No action needed.</p>
      )}
      {data.actions.length > 3 && (
        <div className={styles.viewMore}>
          <ContextPanel
            title="Action required"
            description="Additional items in your authorized attention queue."
            triggerLabel="View more actions"
          >
            <DashboardRecords records={data.actions.slice(3)} />
          </ContextPanel>
        </div>
      )}
    </DashboardChartPanel>
  );
}
export function RecentActivityPanel({
  data,
  children,
}: {
  data: DashboardData;
  children?: ReactNode;
}) {
  const admin = data.role === "system_administrator";
  return (
    <DashboardChartPanel
      title={admin ? "Recent system activity" : "Recent activity"}
      description="Latest updates in your workspace."
      icon={Activity}
      action={children}
    >
      {data.recent.length ? (
        <DashboardRecords records={data.recent.slice(0, 5)} activity />
      ) : (
        <p className={styles.empty}>No recent activity.</p>
      )}
      <div className={styles.viewMore}>
        <Link
          href={
            admin
              ? "/dashboard?view=system_activity"
              : "/dashboard/notifications"
          }
        >
          View more activity <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </DashboardChartPanel>
  );
}
export function UpcomingDeadlinesPanel({
  items,
}: {
  items: DashboardExtras["upcoming"];
}) {
  return (
    <DashboardChartPanel
      title="Coming up"
      description="Upcoming open dates in the next two weeks."
      icon={CalendarDays}
      action={
        <Link href="/dashboard/calendar">
          Calendar <ArrowUpRight size={14} />
        </Link>
      }
    >
      {items.length ? (
        <ul className={styles.upcoming}>
          {items.map((e) => (
            <li key={e.id}>
              <Link href={e.href}>
                <span className={styles.dateSquare}>
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(e.date + "T00:00:00Z"))}
                  <strong>{Number(e.date.slice(-2))}</strong>
                </span>
                <span>
                  <strong>{readableDashboardText(e.title)}</strong>
                  <small>{readableDashboardText(e.detail)}</small>
                </span>
                <span className={styles.muted}>{e.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No upcoming open dates.</p>
      )}
    </DashboardChartPanel>
  );
}
export function DashboardDonut({
  items,
  label,
}: {
  items: { label: string; count: number; href?: string }[];
  label: string;
}) {
  const total = items.reduce((sum, i) => sum + i.count, 0),
    circumference = 2 * Math.PI * 56;
  if (!total)
    return (
      <p className={styles.empty}>
        No records available for this distribution.
      </p>
    );
  return (
    <div className={styles.donutLayout}>
      <svg
        viewBox="0 0 160 160"
        role="img"
        aria-label={`${label}: ${total}. ${items.map((i) => `${i.label}: ${i.count}`).join(", ")}`}
      >
        <circle
          cx={80}
          cy={80}
          r={56}
          fill="none"
          stroke="var(--brand-soft)"
          strokeWidth={17}
        />
        {items.map((item, index) => {
          const start =
            (items
              .slice(0, index)
              .reduce((sum, prior) => sum + prior.count, 0) /
              total) *
            circumference;
          return (
            <circle
              key={item.label}
              cx={80}
              cy={80}
              r={56}
              fill="none"
              stroke={`var(--chart-${index % 5})`}
              strokeWidth={17}
              strokeDasharray={`${(item.count / total) * circumference} ${circumference}`}
              strokeDashoffset={-start}
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text x={80} y={77} textAnchor="middle" className={styles.donutTotal}>
          {total}
        </text>
        <text x={80} y={97} textAnchor="middle" className={styles.donutCaption}>
          {label}
        </text>
      </svg>
      <ul className={styles.legend}>
        {items.map((i, index) => (
          <li key={i.label}>
            <span
              className={styles.legendDot}
              style={{ background: `var(--chart-${index % 5})` }}
            />
            {i.href ? (
              <Link href={i.href}>{i.label}</Link>
            ) : (
              <span>{i.label}</span>
            )}
            <strong>{i.count}</strong>
            <small>{((100 * i.count) / total).toFixed(0)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function DashboardBars({
  items,
  label,
}: {
  items: { label: string; count: number; href?: string }[];
  label: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return items.length ? (
    <ul className={styles.bars} aria-label={label}>
      {items.map((i) => (
        <li key={i.label}>
          <span>
            {i.href ? (
              <Link href={i.href}>{i.label}</Link>
            ) : (
              readableDashboardText(i.label)
            )}
          </span>
          <progress
            max={max}
            value={i.count}
            aria-label={`${i.label}: ${i.count}`}
          />
          <strong>{i.count}</strong>
        </li>
      ))}
    </ul>
  ) : (
    <p className={styles.empty}>No records available.</p>
  );
}
export function DashboardDateChart({
  items,
  label,
  href,
  compact = false,
}: {
  items: { label: string; count: number }[];
  label: string;
  href: string;
  compact?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div
      className={styles.dateChart}
      role="group"
      aria-label={`${label}. ${items.map((i) => `${i.label}: ${i.count}`).join(", ")}`}
    >
      {items.map((i) => (
        <Link
          key={i.label}
          href={href}
          aria-label={`${i.label}: ${i.count} records`}
        >
          <strong>{i.count}</strong>
          <span
            className={styles.dateBar}
            style={{ height: `${((compact ? 48 : 100) * i.count) / max}px` }}
          />
          <small>
            {new Intl.DateTimeFormat("en", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(i.label + "T00:00:00Z"))}
          </small>
        </Link>
      ))}
    </div>
  );
}
