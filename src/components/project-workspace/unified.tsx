import type { Readiness } from "@/lib/installations";
import { InstallationActionDialog } from "../installation-action-dialog";
import { ProjectActionLabel } from "./action-label";
import { ActivityWorkspace } from "../activity-workspace";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { z } from "zod";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  FileText,
  FolderOpen,
  Layers,
  MessageSquare,
  Users,
} from "lucide-react";
import {
  requireWorkspace,
  projectTeam,
  projectMonitoringSummary,
} from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { roleLabels, formatTime, type Member, type Person } from "@/lib/phase1";
import { projectSchema } from "@/lib/project-workspace";
import {
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "@/lib/monitoring";
import { directoryDate } from "@/lib/project-directory-view";
import { workspaceView, workspaceUrl } from "@/lib/project-workspace-view";
import { Scope, Status } from "../ui-r2/primitives";
import { ProjectTools, DiscussionPanel } from "../productivity/project-tools";
import { ProjectTeamDialog } from "../project-team-dialog";
import { ProjectCommercialWorkflow } from "../project-commercial-workflow";
import { ProjectSpaces } from "../project-spaces";
import { UnifiedOperations } from "../unified-operations";
import { ProjectQuotation } from "../project-quotation";
import { ProjectFinancials } from "../project-financials";
import { ProjectResources } from "../project-resources";
import { WorkspaceNavigation, ProjectActionMenu } from "./navigation";
import styles from "./workspace.module.css";
const enabled = (name: string) =>
  process.env[`ONE_ODC_${name}_ENABLED`] === "true";
function Card({
  title,
  icon,
  href,
  action = "View all",
  children,
  actionNode,
}: {
  actionNode?: ReactNode;
  title: string;
  icon: ReactNode;
  href?: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <header>
        <h2>
          {icon}
          {title}
        </h2>
        {actionNode}
        {href && (
          <Link href={href}>
            {action}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.empty}>
      {icon}
      <p>{children}</p>
    </div>
  );
}
function Subnav({ children }: { children: ReactNode }) {
  return (
    <nav className={styles.subnav} aria-label="Workspace section">
      {children}
    </nav>
  );
}
function Loading() {
  return (
    <p className={styles.loading} role="status">
      Loading authorized project information…
    </p>
  );
}
export async function UnifiedProjectWorkspace({
  project,
  query,
}: {
  project: z.infer<typeof projectSchema>;
  query: Record<string, string | string[] | undefined>;
}) {
  const { client, profile } = await requireWorkspace();
  const id = project.id,
    view = workspaceView(query),
    url = (tab: Parameters<typeof workspaceUrl>[1], section = "") =>
      workspaceUrl(id, tab, section);
  const ops = profile.role === "operations_admin";
  const restricted =
    ops &&
    (project.commercial_status !== "Closed" || !!project.awaiting_handoff);
  const manager =
    !restricted &&
    project.commercial_status !== "Lost" &&
    (profile.role === "system_administrator" ||
      (profile.role === "lead_designer" &&
        project.lead_designer_id === profile.id));
  const [summary, members, spaceRows, events, completionResult] =
    await Promise.all([
      !restricted && enabled("MONITORING")
        ? projectMonitoringSummary(id)
        : { data: [], error: null },
      !ops ? projectTeam(id) : { data: [], error: null },
      !restricted && enabled("SPACES")
        ? client
            .from("spaces")
            .select("id,name,status,cancelled_at,updated_at")
            .eq("project_id", id)
            .order("created_at")
        : { data: [], error: null },
      !restricted && enabled("MONITORING") && view.tab === "overview"
        ? client.rpc("project_milestones", {
            p_project: id,
            p_offset: Math.max(0, Number(query.timeline_page ?? 0) || 0) * 20,
          })
        : { data: [], error: null },
      manager &&
      enabled("MONITORING") &&
      project.commercial_status === "Closed" &&
      !project.is_cancelled &&
      !project.is_operationally_completed
        ? client.rpc("operational_readiness", { p_project: id })
        : { data: null, error: null },
    ]);
  for (const r of [summary, members, spaceRows, events, completionResult])
    checkDatabase(r.error);
  const m = (summary.data as Monitoring[] | null)?.[0],
    metric = m ? projectMetrics(m) : null;
  const team = (members.data ?? []) as Member[],
    spaces = spaceRows.data ?? [],
    active = spaces.filter((s) => !s.cancelled_at),
    recent = (events.data ?? []) as {
      id: string;
      title: string;
      detail: string;
      actor: string;
      occurred_at: string;
    }[];
  const origin =
    !ops && profile.role !== "designer"
      ? await client
          .from("project_origins")
          .select("lead_id")
          .eq("project_id", id)
          .maybeSingle()
      : { data: null, error: null };
  checkDatabase(origin.error);
  const peopleResult = manager
    ? await client.rpc("list_assignable_people")
    : { data: [], error: null };
  checkDatabase(peopleResult.error);
  const people = (peopleResult.data ?? []) as Person[];
  const spacePeople = manager
    ? people.filter((p) =>
        team.some(
          (t) =>
            t.user_id === p.id &&
            ["designer", "lead_designer"].includes(t.membership_role),
        ),
      )
    : team.map((t) => ({
        id: t.user_id,
        display_name: t.display_name,
        role: t.membership_role,
      }));
  const lead = team.find((t) => t.membership_role === "lead_designer"),
    primary = team.find(
      (t) => t.membership_role === "designer" && t.is_primary,
    );
  const lifecycle =
    project.commercial_status === "Lost"
      ? "Lost · Read-only"
      : project.is_cancelled
        ? "Cancelled"
        : project.is_operationally_completed
          ? "Operationally Completed"
          : project.awaiting_handoff
            ? "Awaiting Handoff"
            : m
              ? projectWorkState(m)
              : "Not available";
  const progress =
    m && m.active_spaces > 0
      ? Number(((m.completed_spaces / m.active_spaces) * 100).toFixed(1))
      : null;
  const attention = restricted
    ? "Restricted"
    : project.commercial_status === "Lost" || project.is_cancelled
      ? "Inactive"
      : metric?.risk || "Not available";
  const completion = completionResult.data as Readiness | null;
  const renderAssignments = (menuItem = false) =>
    manager && !project.is_cancelled && !project.is_operationally_completed ? (
      <ProjectTeamDialog
        id={id}
        menuItem={menuItem}
        people={people}
        team={team}
        current={project.lead_designer_id}
        closed={project.commercial_status === "Closed"}
        canAssign={!project.awaiting_handoff || manager}
        canTransfer={
          !project.is_cancelled && !project.is_operationally_completed
        }
        viewer={{ id: profile.id, role: profile.role }}
      />
    ) : null;
  const section = view.section;
  const next: { label: string; description: string; href: string }[] = [];
  if (manager && !project.is_cancelled && !project.is_operationally_completed) {
    if (enabled("SPACES") && !active.length)
      next.push({
        label: "Create project spaces",
        description: "Organize the design scope and responsibilities.",
        href: url("spaces"),
      });
    if (!primary)
      next.push({
        label: "Assign the primary Designer",
        description: "Confirm project responsibility in the team editor.",
        href: url("overview") + "#workspace-team",
      });
    if (enabled("MONITORING") && !m?.deadline)
      next.push({
        label: "Set project deadline",
        description: "Set the target date using the existing project controls.",
        href: url("activity", "history") + "#project-controls",
      });
    if (project.awaiting_handoff && manager)
      next.push({
        label: "Hand off to Operations",
        description: "Assign Operations and release the closed project.",
        href: url("operations", "handoff"),
      });
  }
  if (
    !restricted &&
    enabled("SPACES") &&
    active.some((s) => s.status === "For Revision" || s.status === "Submitted")
  )
    next.push({
      label: "Review space progress",
      description: "Submitted designs or revisions need attention.",
      href: url("spaces"),
    });
  if (
    !ops &&
    enabled("QUOTATIONS") &&
    project.commercial_status === "For Quotation"
  )
    next.push({
      label:
        profile.role === "bdm"
          ? "View approved quotations"
          : "Open project quotation",
      description:
        profile.role === "bdm"
          ? "Only approved versions are available to you."
          : "Continue the existing quotation workflow.",
      href: url("financials", "quotation"),
    });
  return (
    <Scope>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Project breadcrumb">
            <Link href="/dashboard/projects">Projects</Link>
            <span>/</span>
            <span>{project.reference}</span>
          </nav>
          <div className={styles.titleRow}>
            <div>
              <h1>{project.name}</h1>
              <p>{project.reference}</p>
            </div>
            <div className={styles.headerActions}>
              <ProjectTools compact project={id} profile={profile} />
              {!restricted && (
                <ProjectActionMenu>
                  <ProjectCommercialWorkflow
                    project={id}
                    compact
                    teamAction={renderAssignments(true)}
                  />
                  <section
                    className={styles.actionGroup}
                    aria-label="Project details"
                  >
                    <h3>Project Details</h3>
                    {origin.data && (
                      <Link
                        className={styles.actionRow}
                        href={`/dashboard/leads/${origin.data.lead_id}`}
                      >
                        <ProjectActionLabel
                          icon={FileText}
                          title="Originating Lead"
                        />
                      </Link>
                    )}
                    <Link
                      className={styles.actionRow}
                      href={url("activity", "history")}
                    >
                      <ProjectActionLabel
                        icon={History}
                        title="Project Controls & History"
                      />
                    </Link>
                  </section>
                  {completion?.can_complete &&
                    completion.cycle &&
                    !completion.completed && (
                      <section
                        className={styles.actionGroup}
                        aria-label="Project completion"
                      >
                        <h3>Project Completion</h3>
                        <InstallationActionDialog
                          project={id}
                          readiness={completion}
                          menuItem
                        />
                      </section>
                    )}
                </ProjectActionMenu>
              )}
            </div>
          </div>
          <div className={styles.states}>
            <div>
              <Status>{project.commercial_status}</Status>
              <small>Commercial stage</small>
            </div>
            <div>
              <Status>{lifecycle}</Status>
              <small>Project lifecycle</small>
            </div>
            <div>
              <span className={styles.attention} data-risk={attention}>
                ●&nbsp; {attention}
              </span>
              <small>Attention</small>
            </div>
          </div>
          <dl className={styles.summary}>
            <div>
              <dt>Design progress</dt>
              <dd>
                {progress === null ? "Not available" : `${progress}%`}
                {progress !== null && (
                  <progress
                    value={progress}
                    max={100}
                    aria-label="Project design progress"
                  />
                )}
              </dd>
            </div>
            <div>
              <dt>Project deadline</dt>
              <dd>
                <CalendarDays size={16} aria-hidden="true" />
                {restricted ? "Restricted" : directoryDate(m?.deadline)}
              </dd>
            </div>
            <div>
              <dt>Lead Designer</dt>
              <dd>
                {restricted || ops
                  ? "See project team"
                  : lead?.display_name || "Not available"}
              </dd>
            </div>
            <div>
              <dt>Primary Designer</dt>
              <dd>
                {restricted || ops
                  ? "See project team"
                  : primary?.display_name || "Not assigned"}
              </dd>
            </div>
            <div>
              <dt>Expected handoff</dt>
              <dd>
                <CalendarDays size={16} aria-hidden="true" />
                {restricted
                  ? "Restricted"
                  : directoryDate(project.expected_handoff)}
              </dd>
            </div>
          </dl>
          <WorkspaceNavigation
            project={id}
            tab={restricted ? "overview" : view.tab}
            restricted={restricted}
          />
        </header>
        {restricted ? (
          <Card
            title="Limited pipeline preview"
            icon={<FolderOpen size={18} />}
          >
            <p>
              Detailed design, files, financials, and team information are
              restricted until the Lead Designer releases this project to
              Operations.
            </p>
          </Card>
        ) : view.tab === "overview" ? (
          <div className={styles.overview}>
            <div className={styles.column}>
              <Card
                title="Project progress"
                icon={<Layers size={18} />}
                href={url("spaces")}
                action="View spaces"
              >
                <div className={styles.progressSummary}>
                  {progress === null ? (
                    <p>Not available</p>
                  ) : (
                    <>
                      <progress
                        value={progress}
                        max={100}
                        aria-label="Overview design progress"
                      />
                      <strong>{progress}%</strong>
                    </>
                  )}
                </div>
                {progress === null && (
                  <p className={styles.muted}>
                    Design progress is available when the project has active
                    spaces.
                  </p>
                )}
                <dl className={styles.counts}>
                  {[
                    ["Total spaces", spaces.length],
                    ["Active", active.length],
                    [
                      "Completed",
                      active.filter((s) => s.status === "Completed").length,
                    ],
                    [
                      "On hold",
                      active.filter((s) => s.status === "On Hold").length,
                    ],
                  ].map(([label, count]) => (
                    <div key={label}>
                      <dd>{count}</dd>
                      <dt>{label}</dt>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card
                title="Spaces"
                icon={<Layers size={18} />}
                href={url("spaces")}
                action="View all"
              >
                {!spaces.length ? (
                  <>
                    <Empty icon={<Layers size={32} aria-hidden="true" />}>
                      No spaces have been created for this project.
                    </Empty>
                    {manager &&
                      !project.is_cancelled &&
                      !project.is_operationally_completed &&
                      enabled("SPACES") && (
                        <Link
                          className="button button-primary"
                          href={url("spaces")}
                        >
                          Create first space
                        </Link>
                      )}
                  </>
                ) : (
                  <ul className={styles.previewList}>
                    {spaces.slice(0, 4).map((s) => (
                      <li key={s.id}>
                        <Link href={url("spaces") + `#space-${s.id}`}>
                          <span className={styles.spaceName}>{s.name}</span>
                          <Status>
                            {s.cancelled_at ? "Cancelled" : s.status}
                          </Status>
                          <time
                            className={styles.spaceUpdated}
                            dateTime={s.updated_at}
                            title={formatTime(s.updated_at)}
                          >
                            Updated {directoryDate(s.updated_at.slice(0, 10))}
                          </time>
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <div className={styles.column}>
              <Card title="Next actions" icon={<CheckCircle2 size={18} />}>
                {next.length ? (
                  <ul className={styles.actionList}>
                    {next.slice(0, 4).map((a) => (
                      <li key={a.label}>
                        <Link href={a.href}>
                          <CheckCircle2 size={18} aria-hidden="true" />
                          <span>
                            <strong>{a.label}</strong>
                            <small>{a.description}</small>
                          </span>
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon={<CheckCircle2 size={26} aria-hidden="true" />}>
                    No pending setup actions in your scope.
                  </Empty>
                )}
              </Card>
              <Card
                title="Project Timeline"
                icon={<Clock3 size={18} />}
                href={url("activity", "history")}
              >
                {recent.length ? (
                  <ol className={styles.timeline}>
                    {recent.map((e) => (
                      <li key={e.id}>
                        <strong>{e.title}</strong>
                        <small>
                          {e.actor || "Recorded actor"} · {e.detail}
                        </small>
                        <time dateTime={e.occurred_at}>
                          {formatTime(e.occurred_at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty icon={<Clock3 size={26} aria-hidden="true" />}>
                    No authorized activity yet.
                  </Empty>
                )}
                <nav aria-label="Project Timeline pages">
                  {Number(query.timeline_page ?? 0) > 0 && (
                    <Link
                      href={
                        url("overview") +
                        `&timeline_page=${Number(query.timeline_page) - 1}`
                      }
                    >
                      Newer milestones
                    </Link>
                  )}
                  {recent.length === 20 && (
                    <Link
                      href={
                        url("overview") +
                        `&timeline_page=${Number(query.timeline_page ?? 0) + 1}`
                      }
                    >
                      Earlier milestones →
                    </Link>
                  )}
                </nav>
              </Card>
            </div>
            <div className={styles.column}>
              {!ops && (
                <div id="workspace-team">
                  <Card
                    title="Project team"
                    icon={<Users size={18} />}
                    actionNode={renderAssignments()}
                  >
                    <ul className={styles.team}>
                      {team.map((t) => (
                        <li key={`${t.user_id}-${t.membership_role}`}>
                          <span className={styles.avatar} aria-hidden="true">
                            {t.display_name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((s) => s[0])
                              .join("")}
                          </span>
                          <span>
                            <strong>{t.display_name}</strong>
                            <small>
                              {roleLabels[t.membership_role]} ·{" "}
                              {t.is_primary ? "Primary" : "Supporting"}
                            </small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              )}
              <Card title="Project details" icon={<FileText size={18} />}>
                <dl className={styles.details}>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatTime(project.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Your access</dt>
                    <dd>{roleLabels[profile.role]}</dd>
                  </div>
                  <div>
                    <dt>Project directory</dt>
                    <dd>
                      <Link href="/dashboard/projects">
                        View in directory{" "}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        ) : (
          <div className={styles.content}>
            {view.tab === "spaces" &&
              (enabled("SPACES") ? (
                <>
                  <Suspense fallback={<Loading />}>
                    <ProjectSpaces
                      project={id}
                      manager={manager}
                      people={spacePeople}
                      query={{ ...query, tab: "spaces" }}
                    />
                  </Suspense>
                </>
              ) : (
                <p>Space management is unavailable.</p>
              ))}
            {view.tab === "operations" && (
              <Suspense fallback={<Loading />}>
                <UnifiedOperations project={id} query={query} />
              </Suspense>
            )}
            {view.tab === "financials" && (
              <>
                <Subnav>
                  {!ops && enabled("QUOTATIONS") && (
                    <Link
                      href={url("financials", "quotation")}
                      aria-current={section !== "finance" ? "page" : undefined}
                    >
                      Quotation
                    </Link>
                  )}
                  {profile.role !== "designer" && enabled("FINANCE") && (
                    <Link
                      href={url("financials", "finance")}
                      aria-current={
                        section === "finance" || ops ? "page" : undefined
                      }
                    >
                      Financial Management
                    </Link>
                  )}
                </Subnav>
                <Suspense fallback={<Loading />}>
                  {(section === "finance" || ops) &&
                  enabled("FINANCE") &&
                  profile.role !== "designer" ? (
                    <ProjectFinancials project={id} />
                  ) : !ops && enabled("QUOTATIONS") ? (
                    <ProjectQuotation
                      project={id}
                      selected={
                        typeof query.space === "string"
                          ? query.space
                          : undefined
                      }
                      version={
                        typeof query.version === "string"
                          ? query.version
                          : undefined
                      }
                      compare={
                        typeof query.compare === "string"
                          ? query.compare
                          : undefined
                      }
                    />
                  ) : (
                    <p>There is no financial view available for your role.</p>
                  )}
                </Suspense>
              </>
            )}
            {view.tab === "activity" && (
              <>
                <nav
                  className={styles.discussionNav}
                  aria-label="Discussion and activity"
                >
                  <Link
                    href={url("activity", "discussion")}
                    aria-current={section !== "history" ? "page" : undefined}
                  >
                    Discussion
                  </Link>
                  <Link
                    href={url("activity", "history")}
                    aria-current={section === "history" ? "page" : undefined}
                  >
                    Activity
                  </Link>
                </nav>
                {section !== "history" ? (
                  <Card
                    title="Project discussion"
                    icon={<MessageSquare size={18} />}
                  >
                    <DiscussionPanel
                      presentation="full"
                      project={id}
                      profile={profile}
                    />
                  </Card>
                ) : (
                  <>
                    <Suspense fallback={<Loading />}>
                      {enabled("MONITORING") && (
                        <ActivityWorkspace
                          project={id}
                          manager={manager}
                          query={{
                            ...query,
                            tab: "activity",
                            section: "history",
                          }}
                        />
                      )}
                    </Suspense>
                  </>
                )}
              </>
            )}
            {view.tab === "files" &&
              (ops ? (
                <Card title="Project files" icon={<FolderOpen size={18} />}>
                  <p>
                    General project files and lead resources are restricted for
                    Operations. Authorized operational documents remain
                    available in their relevant records.
                  </p>
                </Card>
              ) : enabled("RESOURCES") ? (
                <Suspense fallback={<Loading />}>
                  <ProjectResources
                    project={id}
                    showManagement={false}
                    manager={manager}
                    primaryBdm={team.some(
                      (t) =>
                        t.user_id === profile.id &&
                        t.membership_role === "bdm" &&
                        t.is_primary,
                    )}
                  />
                </Suspense>
              ) : (
                <p>Project resources are unavailable.</p>
              ))}
          </div>
        )}
      </div>
    </Scope>
  );
}
