import { ProjectCommercialWorkflow } from "@/components/project-commercial-workflow";
import {
  OperationsFrame,
  OperationsLoading,
} from "@/components/ui-r4/primitives";
import { CommercialFrame, CommercialLoading } from "@/components/ui-r3/frame";
import { Suspense, Fragment } from "react";
import r2 from "@/components/ui-r2/ui-r2.module.css";
import {
  DisclosureSummary,
  Disclosure,
  Scope,
  Heading,
} from "@/components/ui-r2/primitives";
import { ProjectSectionNavigation } from "@/components/project-section-navigation";
import { ProjectRecentActivity } from "@/components/project-recent-activity";
import { ProjectContext } from "@/components/project-context";
import { ProjectInstallations } from "@/components/project-installations";
import { ProjectLogistics } from "@/components/project-logistics";
import { ProjectHandoff } from "@/components/project-handoff";
import { ProjectFinancials } from "@/components/project-financials";
import { ProjectQuotation } from "@/components/project-quotation";
import { ProjectMonitoring } from "@/components/project-monitoring";
import { ProjectSpaces } from "@/components/project-spaces";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, projectTeam } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { roleLabels, formatTime, type Member, type Person } from "@/lib/phase1";
import { PageIntro } from "@/components/live-data";
import { projectColumns, projectSchema } from "@/lib/project-workspace";
import { AssignmentForm } from "@/components/workflow-forms";
import { ProjectResources } from "@/components/project-resources";
import { Section } from "@/components/workspace-skeleton";
async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client, profile } = await requireWorkspace();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const r = await client
    .from("projects")
    .select(projectColumns)
    .eq("id", id)
    .maybeSingle();
  checkDatabase(r.error);
  if (!r.data) notFound();
  const project = projectSchema.parse(r.data);
  const query = await searchParams;
  const installationEnabled =
    process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true";
  const installationTab = installationEnabled && query.tab === "installation";
  const logisticsEnabled = process.env.ONE_ODC_LOGISTICS_ENABLED === "true";
  const logisticsTab = logisticsEnabled && query.tab === "logistics";
  const handoffEnabled = process.env.ONE_ODC_HANDOFF_ENABLED === "true";
  const financeEnabled = process.env.ONE_ODC_FINANCE_ENABLED === "true";
  const OpsFrame =
    process.env.ONE_ODC_UI_R0_ENABLED === "true" ? OperationsFrame : Fragment;
  if (profile.role === "operations_admin")
    return (
      <OpsFrame>
        <PageIntro
          title={project.name}
          description={`${project.reference} · ${project.commercial_status === "Closed" ? "Operations workspace" : "Limited pipeline preview"}`}
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {financeEnabled && project.commercial_status === "Closed" && (
          <ProjectSectionNavigation label="Operations workspace">
            <Link
              className="button button-outline"
              href={`/dashboard/projects/${id}`}
              aria-current={
                !installationTab && !logisticsTab && query.tab !== "finance"
                  ? "page"
                  : undefined
              }
            >
              Overview
            </Link>
            {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
              <Link
                className="button button-outline"
                href={`/dashboard/projects/${id}#project-activities`}
              >
                Activities
              </Link>
            )}
            {installationEnabled && (
              <Link
                className="button button-outline"
                href={`/dashboard/projects/${id}?tab=installation`}
                aria-current={installationTab ? "page" : undefined}
              >
                Installation
              </Link>
            )}
            {logisticsEnabled && (
              <Link
                className="button button-outline"
                href={`/dashboard/projects/${id}?tab=logistics`}
                aria-current={logisticsTab ? "page" : undefined}
              >
                Supplier & Logistics
              </Link>
            )}
            <Link
              className="button button-outline"
              href={`/dashboard/projects/${id}?tab=finance`}
              aria-current={query.tab === "finance" ? "page" : undefined}
            >
              Financial Management
            </Link>
          </ProjectSectionNavigation>
        )}
        {handoffEnabled &&
          project.commercial_status === "Closed" &&
          !(
            process.env.ONE_ODC_UI_R0_ENABLED === "true" &&
            query.tab === "finance"
          ) && (
            <Section>
              <ProjectHandoff project={id} />
            </Section>
          )}
        {installationTab && project.commercial_status === "Closed" ? (
          <Section
            fallback={
              process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
                <OperationsLoading destination="installation and operational readiness" />
              ) : undefined
            }
          >
            <ProjectInstallations project={id} />
          </Section>
        ) : logisticsTab && project.commercial_status === "Closed" ? (
          <Section
            fallback={
              process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
                <OperationsLoading destination="supplier and logistics" />
              ) : undefined
            }
          >
            <ProjectLogistics project={id} />
          </Section>
        ) : financeEnabled &&
          project.commercial_status === "Closed" &&
          query.tab === "finance" ? (
          <Section>
            <ProjectFinancials project={id} />
          </Section>
        ) : (
          <section className="surface live-form">
            <h2>
              {project.commercial_status === "Closed" && handoffEnabled
                ? "Operations overview"
                : "Pipeline overview"}
            </h2>
            <dl className="record-details">
              <div>
                <dt>Commercial stage</dt>
                <dd>{project.commercial_status}</dd>
              </div>
              <div>
                <dt>Lead Designer account</dt>
                <dd>
                  <details className="technical-reference">
                    <DisclosureSummary>Account reference</DisclosureSummary>
                    <code>{project.lead_designer_id}</code>
                  </details>
                </dd>
              </div>
              <div>
                <dt>Expected handoff</dt>
                <dd>{project.expected_handoff || "Not scheduled"}</dd>
              </div>
            </dl>
            <p className="field-hint">
              {project.commercial_status === "Closed" && installationEnabled
                ? "Use the Installation and Supplier & Logistics tabs for authorized operational work. Financial Management retains its existing permissions."
                : "Detailed lead, design, commercial, and attachment records are not exposed in this pipeline preview."}
            </p>
          </section>
        )}
        {!installationTab &&
          !logisticsTab &&
          !(financeEnabled && query.tab === "finance") &&
          process.env.ONE_ODC_MONITORING_ENABLED === "true" &&
          project.commercial_status === "Closed" && (
            <Section>
              <ProjectMonitoring
                project={id}
                manager={false}
                filters={await searchParams}
              />
            </Section>
          )}
      </OpsFrame>
    );
  const quotationEnabled = process.env.ONE_ODC_QUOTATIONS_ENABLED === "true";
  const quotationTab = quotationEnabled && query.tab === "quotation";
  const financeTab = financeEnabled && query.tab === "finance";
  const navigation = (process.env.ONE_ODC_SPACES_ENABLED === "true" ||
    process.env.ONE_ODC_MONITORING_ENABLED === "true" ||
    quotationEnabled ||
    installationEnabled ||
    financeEnabled ||
    logisticsEnabled) && (
    <ProjectSectionNavigation>
      <Link
        className="button button-outline"
        href={`/dashboard/projects/${id}`}
        aria-current={
          !quotationTab && !financeTab && !logisticsTab && !installationTab
            ? "page"
            : undefined
        }
      >
        Overview
      </Link>
      {process.env.ONE_ODC_SPACES_ENABLED === "true" && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}#project-spaces`}
        >
          Spaces
        </Link>
      )}
      {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}#project-activities`}
        >
          Activities
        </Link>
      )}
      {installationEnabled && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}?tab=installation`}
          aria-current={installationTab ? "page" : undefined}
        >
          Installation
        </Link>
      )}
      {logisticsEnabled && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}?tab=logistics`}
          aria-current={logisticsTab ? "page" : undefined}
        >
          Supplier & Logistics
        </Link>
      )}
      {quotationEnabled && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}?tab=quotation`}
          aria-current={quotationTab ? "page" : undefined}
        >
          Quotation
        </Link>
      )}
      {financeEnabled && profile.role !== "designer" && (
        <Link
          className="button button-outline"
          href={`/dashboard/projects/${id}?tab=finance`}
          aria-current={financeTab ? "page" : undefined}
        >
          Financial Management
        </Link>
      )}
    </ProjectSectionNavigation>
  );
  if (
    process.env.ONE_ODC_UI_R0_ENABLED === "true" &&
    (installationTab || logisticsTab)
  )
    return (
      <CommercialFrame
        title={project.name}
        description={`${project.reference} · ${project.commercial_status}`}
        navigation={navigation}
      >
        <Suspense
          fallback={
            <OperationsLoading
              destination={
                installationTab
                  ? "installation and readiness"
                  : "supplier and logistics"
              }
            />
          }
        >
          <ProjectHandoff project={id} />
          {installationTab ? (
            <ProjectInstallations project={id} />
          ) : (
            <ProjectLogistics project={id} />
          )}
        </Suspense>
      </CommercialFrame>
    );
  if (installationTab)
    return (
      <>
        <PageIntro
          title={project.name}
          description={`${project.reference} · ${project.commercial_status}`}
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {navigation}
        <Section>
          <ProjectInstallations project={id} />
        </Section>
      </>
    );
  if (logisticsTab)
    return (
      <>
        <PageIntro
          title={project.name}
          description={`${project.reference} · ${project.commercial_status}`}
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {navigation}
        <Section>
          <ProjectLogistics project={id} />
        </Section>
      </>
    );
  if (
    process.env.ONE_ODC_UI_R0_ENABLED === "true" &&
    (financeTab || quotationTab)
  )
    return (
      <CommercialFrame
        title={project.name}
        description={`${project.reference} · ${project.commercial_status}`}
        navigation={navigation}
      >
        <Suspense
          fallback={
            <CommercialLoading
              destination={financeTab ? "finance" : "quotation"}
            />
          }
        >
          {financeTab ? (
            <ProjectFinancials project={id} />
          ) : (
            <ProjectQuotation
              project={id}
              selected={
                typeof query.space === "string" ? query.space : undefined
              }
              version={
                typeof query.version === "string" ? query.version : undefined
              }
              compare={
                typeof query.compare === "string" ? query.compare : undefined
              }
            />
          )}
        </Suspense>
      </CommercialFrame>
    );
  if (financeTab)
    return (
      <>
        <PageIntro
          title={project.name}
          description={`${project.reference} · ${project.commercial_status}`}
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {navigation}
        <Section>
          <ProjectFinancials project={id} />
        </Section>
      </>
    );
  if (quotationTab)
    return (
      <>
        <PageIntro
          title={project.name}
          description={`${project.reference} · ${project.commercial_status}`}
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {navigation}
        <Section>
          <ProjectQuotation
            project={id}
            selected={typeof query.space === "string" ? query.space : undefined}
            version={
              typeof query.version === "string" ? query.version : undefined
            }
            compare={
              typeof query.compare === "string" ? query.compare : undefined
            }
          />
        </Section>
      </>
    );
  const editable =
    project.commercial_status !== "Lost" &&
    (profile.role === "system_administrator" ||
      (profile.role === "lead_designer" &&
        project.lead_designer_id === profile.id));
  const [origin, teamResult, history, assignable] = await Promise.all([
    client
      .from("project_origins")
      .select("lead_id")
      .eq("project_id", id)
      .maybeSingle(),
    projectTeam(id),
    client
      .from("project_assignment_events")
      .select(
        "id,reason,occurred_at,actor_id,new_assignments,previous_assignments",
      )
      .eq("project_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    editable ? client.rpc("list_assignable_people") : { data: [], error: null },
  ]);
  for (const x of [origin, teamResult, history, assignable])
    checkDatabase(x.error);
  const team = (teamResult.data ?? []) as Member[];
  const people: Person[] = assignable.data ?? [];
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <Scope>
        <Heading
          title={project.name}
          description={`${project.reference} · ${project.commercial_status}`}
          action={
            origin.data &&
            profile.role !== "designer" && (
              <Link
                className="button button-outline"
                href={`/dashboard/leads/${origin.data.lead_id}`}
              >
                Originating Lead
              </Link>
            )
          }
        />
        <Section>
          <ProjectContext project={project} />
        </Section>
        {navigation}
        <div className={r2.workspaceGrid}>
          <div className={r2.workspaceMain}>
            {process.env.ONE_ODC_SPACES_ENABLED === "true" && (
              <Section>
                <ProjectSpaces
                  project={id}
                  manager={editable}
                  people={
                    editable
                      ? people.filter((p) =>
                          team.some(
                            (m) =>
                              m.user_id === p.id &&
                              ["designer", "lead_designer"].includes(
                                m.membership_role,
                              ),
                          ),
                        )
                      : team.map((m) => ({
                          id: m.user_id,
                          display_name: m.display_name,
                          role: m.membership_role,
                        }))
                  }
                />
              </Section>
            )}
            {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
              <section id="project-activities">
                <Section>
                  <ProjectMonitoring
                    nested
                    project={id}
                    manager={editable}
                    filters={query}
                  />
                </Section>
              </section>
            )}
          </div>
          <aside
            className={r2.workspaceAside}
            aria-label="Project context and actions"
          >
            <section className="surface live-form">
              <h2>Project team</h2>
              <ul className="team-list">
                {team.map((m) => (
                  <li key={`${m.user_id}-${m.membership_role}`}>
                    <span>{m.display_name}</span>
                    <b>
                      {roleLabels[m.membership_role]}
                      {m.is_primary ? " · Primary" : " · Supporting"}
                    </b>
                  </li>
                ))}
              </ul>
              {editable &&
                (!project.awaiting_handoff ||
                  profile.role === "lead_designer") && (
                  <Disclosure title="Manage project assignments">
                    <AssignmentForm id={id} people={people} team={team} />
                  </Disclosure>
                )}
            </section>
            {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
              <Section>
                <ProjectRecentActivity project={id} />
              </Section>
            )}
            <Disclosure className="surface" title="Project details">
              <dl className="record-details">
                <div>
                  <dt>Created</dt>
                  <dd>{formatTime(project.created_at)}</dd>
                </div>
                <div>
                  <dt>Expected handoff</dt>
                  <dd>{project.expected_handoff || "Not scheduled"}</dd>
                </div>
                <div>
                  <dt>Your access</dt>
                  <dd>
                    {profile.role === "system_administrator"
                      ? "System Administrator oversight"
                      : team
                          .filter((m) => m.user_id === profile.id)
                          .map((m) => roleLabels[m.membership_role])
                          .join(" · ") || "No current membership"}
                  </dd>
                </div>
              </dl>
              <Link href="/dashboard/projects">Project directory</Link>
            </Disclosure>
            {handoffEnabled && (
              <Disclosure
                className="surface"
                title="Commercial closure and operations handoff"
              >
                <Section>
                  <ProjectHandoff project={id} />
                </Section>
              </Disclosure>
            )}
          </aside>
        </div>
        <Disclosure className="surface" title="Notes, Files and Resources">
          {process.env.ONE_ODC_RESOURCES_ENABLED === "true" && (
            <Section>
              <ProjectResources
                project={id}
                manager={editable}
                primaryBdm={team.some(
                  (m) =>
                    m.user_id === profile.id &&
                    m.membership_role === "bdm" &&
                    m.is_primary,
                )}
              />
            </Section>
          )}
        </Disclosure>
        <details className="surface live-form project-audit">
          <DisclosureSummary>Assignment history</DisclosureSummary>
          <h2>Assignment history</h2>
          <p className="field-hint">
            Showing the latest 50 changes. Previous assignments remain recorded.
          </p>
          {history.data?.map((h) => (
            <details className="history-entry" key={h.id}>
              <DisclosureSummary>
                {formatTime(h.occurred_at)} · {h.reason}
              </DisclosureSummary>
              <p className="field-hint">Actor: {h.actor_id}</p>
              <h3>Previous assignments</h3>
              <pre className="history-json">
                {JSON.stringify(h.previous_assignments, null, 2)}
              </pre>
              <h3>New assignments</h3>
              <pre className="history-json">
                {JSON.stringify(h.new_assignments, null, 2)}
              </pre>
            </details>
          ))}
        </details>
      </Scope>
    );

  return (
    <>
      <PageIntro
        title={project.name}
        description={`${project.reference} · ${project.commercial_status}`}
      >
        {origin.data && profile.role !== "designer" && (
          <Link
            className="button button-outline"
            href={`/dashboard/leads/${origin.data.lead_id}`}
          >
            Originating Lead →
          </Link>
        )}
      </PageIntro>
      <Section>
        <ProjectContext project={project} />
      </Section>
      {navigation}
      {handoffEnabled && (
        <details className="surface workspace-disclosure">
          <DisclosureSummary>
            Commercial closure and operations handoff
          </DisclosureSummary>
          <Section
            fallback={
              process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
                <OperationsLoading destination="operational handoff" />
              ) : undefined
            }
          >
            <ProjectHandoff project={id} />
          </Section>
        </details>
      )}
      <div className="project-summary-grid">
        <section
          className="surface live-form project-overview"
          id="project-overview"
        >
          <h2>Project overview</h2>
          <dl className="record-details">
            <div>
              <dt>Commercial stage</dt>
              <dd>{project.commercial_status}</dd>
            </div>
            <div>
              <dt>Expected handoff</dt>
              <dd>{project.expected_handoff || "Not scheduled"}</dd>
            </div>
            <div>
              <dt>Lead Designer</dt>
              <dd>
                {team.find(
                  (member) => member.membership_role === "lead_designer",
                )?.display_name || project.lead_designer_id}
              </dd>
            </div>
            <div>
              <dt>Your project membership</dt>
              <dd>
                {profile.role === "system_administrator"
                  ? "System Administrator oversight"
                  : team
                      .filter((member) => member.user_id === profile.id)
                      .map((member) => roleLabels[member.membership_role])
                      .join(" · ") || "No current membership"}
              </dd>
            </div>
          </dl>
          <Link href="/dashboard/projects">← Project directory</Link>
        </section>
        {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
          <Section>
            <ProjectRecentActivity project={id} />
          </Section>
        )}
      </div>
      {process.env.ONE_ODC_SPACES_ENABLED === "true" && (
        <Section>
          <ProjectSpaces
            project={id}
            manager={editable}
            people={
              editable
                ? people.filter((p) =>
                    team.some(
                      (m) =>
                        m.user_id === p.id &&
                        ["designer", "lead_designer"].includes(
                          m.membership_role,
                        ),
                    ),
                  )
                : team.map((m) => ({
                    id: m.user_id,
                    display_name: m.display_name,
                    role: m.membership_role,
                  }))
            }
          />
        </Section>
      )}
      <section className="surface live-form project-roster">
        <h2>Project team</h2>
        <p className="field-hint">
          Created {formatTime(project.created_at)}. Spaces will be established
          separately; the cabinetry estimate has not generated any Spaces.
        </p>
        <ul className="team-list">
          {team.map((m) => (
            <li key={`${m.user_id}-${m.membership_role}`}>
              <span>{m.display_name}</span>
              <b>
                {roleLabels[m.membership_role]}
                {m.is_primary ? " · Primary" : " · Supporting"}
              </b>
            </li>
          ))}
        </ul>
      </section>
      {process.env.ONE_ODC_RESOURCES_ENABLED === "true" && (
        <Section>
          <ProjectResources
            project={id}
            manager={editable}
            primaryBdm={team.some(
              (m) =>
                m.user_id === profile.id &&
                m.membership_role === "bdm" &&
                m.is_primary,
            )}
          />
        </Section>
      )}
      {editable &&
        (!project.awaiting_handoff || profile.role === "lead_designer") && (
          <details className="surface workspace-disclosure">
            <DisclosureSummary>Manage project assignments</DisclosureSummary>
            <AssignmentForm id={id} people={people} team={team} />
          </details>
        )}
      {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
        <details
          className="surface workspace-disclosure"
          id="project-activities"
          open={Object.keys(query).some((k) =>
            ["category", "from", "to", "actor", "space", "offset"].includes(k),
          )}
        >
          <DisclosureSummary>Activities and project controls</DisclosureSummary>
          <Section>
            <ProjectMonitoring
              nested
              project={id}
              manager={editable}
              filters={await searchParams}
            />
          </Section>
        </details>
      )}
      <details className="surface live-form project-audit">
        <DisclosureSummary>Assignment history</DisclosureSummary>
        <h2>Assignment history</h2>
        <p className="field-hint">
          Showing the latest 50 changes. Previous assignments remain recorded.
        </p>
        {history.data?.map((h) => (
          <details className="history-entry" key={h.id}>
            <DisclosureSummary>
              {formatTime(h.occurred_at)} · {h.reason}
            </DisclosureSummary>
            <p className="field-hint">Actor: {h.actor_id}</p>
            <h3>Previous assignments</h3>
            <pre className="history-json">
              {JSON.stringify(h.previous_assignments, null, 2)}
            </pre>
            <h3>New assignments</h3>
            <pre className="history-json">
              {JSON.stringify(h.new_assignments, null, 2)}
            </pre>
          </details>
        ))}
      </details>
    </>
  );
}

export default async function ProjectPage(
  props: Parameters<typeof ProjectDetail>[0],
) {
  const { id } = await props.params;
  return (
    <>
      <ProjectCommercialWorkflow project={id} />
      <ProjectDetail {...props} />
    </>
  );
}
