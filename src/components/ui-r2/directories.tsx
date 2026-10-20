import { DiscussionBadge } from "../productivity/discussion-sync";
import Link from "next/link";
import {
  ProjectColumnMenu,
  ProjectDirectoryList,
} from "./project-directory-list";
import {
  projectDirectoryRow,
  visibleDirectoryColumns,
} from "@/lib/project-directory-view";
import { FilterBar } from "../filter-bar";
import { filterOptions } from "../../lib/filter-toolbar";
import { ArrowUpRight, FolderOpen, LayoutGrid, List } from "lucide-react";
import type { Project } from "../../lib/phase1";
import {
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "../../lib/monitoring";
import {
  commercialStages,
  projectDirectoryUrl,
  type projectDirectoryOptions,
} from "../../lib/project-workspace";
import { Heading, Scope, Status } from "./primitives";
import styles from "./ui-r2.module.css";
export { LeadDirectory } from "./lead-directory";
export function ProjectDirectory({
  columns,
  view = "list",
  projects,
  options,
  monitoring,
  count,
  ops,
  leads,
  readiness = {},
}: {
  columns?: string;
  view?: "grid" | "list";
  projects: Project[];
  options: ReturnType<typeof projectDirectoryOptions>;
  monitoring?: Record<string, Monitoring>;
  count: number;
  ops: boolean;
  leads: Record<string, string>;
  readiness?: Record<string, string>;
}) {
  const viewUrl = (layout: "grid" | "list", page = options.page) =>
    `${projectDirectoryUrl(options, page)}&view=${layout}${columns !== undefined ? `&columns=${encodeURIComponent(columns)}` : ""}`;
  return (
    <Scope>
      <Heading
        title={ops ? "Project pipeline" : "Projects"}
        description={
          ops
            ? "Your assigned pipeline and authorized operations workspaces."
            : "A clear view of your projects, people, and next deadlines."
        }
      />
      <section className={styles.directory}>
        <FilterBar
          resultCount={count}
          values={{
            q: options.q,
            by: options.searchBy,
            stage: options.stage,
            favorites: options.favorites ? "true" : "",
            sort: options.sort,
            view,
            ...(columns !== undefined ? { columns } : {}),
          }}
          config={{
            label: "Project filters",
            search: {
              key: "q",
              label: "Search projects",
              placeholder:
                options.searchBy === "reference"
                  ? "Search project reference…"
                  : "Search projects…",
            },
            sort: {
              key: "sort",
              label: "Sort projects",
              defaultValue: "newest",
              options: [
                { value: "newest", label: "Newest first" },
                { value: "name", label: "Project name A–Z" },
              ],
            },
            fields: [
              {
                key: "by",
                label: "Search by",
                defaultValue: "name",
                options: [
                  { value: "name", label: "Project name" },
                  { value: "reference", label: "Reference" },
                ],
              },
              {
                key: "favorites",
                label: "Flag",
                options: [
                  { value: "", label: "All projects" },
                  { value: "true", label: "Flagged projects" },
                ],
              },
              {
                key: "stage",
                label: "Commercial stage",
                options: [
                  { value: "", label: "All stages" },
                  ...filterOptions(commercialStages),
                ],
              },
            ],
          }}
        />
        <div className={styles.listHeading}>
          <h2>{ops ? "Assigned pipeline" : "Project directory"}</h2>
          <div className={styles.directoryTools}>
            <span>
              {count} {count === 1 ? "project" : "projects"}
            </span>
            {view === "list" && <ProjectColumnMenu />}
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label="Project view"
            >
              <Link
                href={viewUrl("grid")}
                aria-current={view === "grid" ? "true" : undefined}
              >
                <LayoutGrid size={16} aria-hidden="true" />
                Grid
              </Link>
              <Link
                href={viewUrl("list")}
                aria-current={view === "list" ? "true" : undefined}
              >
                <List size={16} aria-hidden="true" />
                List
              </Link>
            </div>
          </div>
        </div>
        {view === "list" && projects.length > 0 ? (
          <ProjectDirectoryList
            rows={projects.map((p) =>
              projectDirectoryRow(
                p,
                monitoring?.[p.id],
                ops,
                leads[p.lead_designer_id],
                readiness[p.id],
              ),
            )}
            columns={visibleDirectoryColumns(columns)}
            sorted={options.sort === "name"}
            sortUrl={`${projectDirectoryUrl({ ...options, sort: "name" }, 1)}&view=list${columns !== undefined ? `&columns=${encodeURIComponent(columns)}` : ""}`}
          />
        ) : (
          <div className={styles.projectGrid} data-project-view={view}>
            {projects.map((project) => {
              const m = monitoring?.[project.id],
                metric = m ? projectMetrics(m) : null;
              const preview = ops && project.commercial_status !== "Closed";
              return (
                <Link
                  className={styles.projectCard}
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.reference}>
                      {project.reference}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </div>
                  <h3>
                    <DiscussionBadge project={project.id} dot />
                    {project.name}
                  </h3>
                  <div className={styles.cardStatuses}>
                    <Status>{project.commercial_status}</Status>
                    {project.awaiting_handoff && (
                      <Status>Awaiting Handoff</Status>
                    )}
                    {!preview && m && <span>{projectWorkState(m)}</span>}
                  </div>
                  {preview ? (
                    <p className={styles.preview}>
                      Limited pipeline preview. Project details open after
                      commercial closure.
                    </p>
                  ) : (
                    <>
                      <div className={styles.progressLabel}>
                        <span>Design progress</span>
                        <strong>{metric?.progress || "Not Available"}</strong>
                      </div>
                      {m && m.active_spaces > 0 && (
                        <progress
                          value={m.completed_spaces}
                          max={m.active_spaces}
                          aria-label={`${project.name} design progress`}
                        />
                      )}
                      <dl className={styles.cardFacts}>
                        <div>
                          <dt>Deadline</dt>
                          <dd>{m?.deadline || "Not scheduled"}</dd>
                        </div>
                        <div>
                          <dt>Attention</dt>
                          <dd>{metric?.risk || "Not Available"}</dd>
                        </div>
                        {!ops && (
                          <div>
                            <dt>Lead Designer</dt>
                            <dd>
                              {leads[project.lead_designer_id] ||
                                "See project team"}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>Expected handoff</dt>
                          <dd>{project.expected_handoff || "Not scheduled"}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {!projects.length && (
          <div className={styles.empty}>
            <FolderOpen size={26} aria-hidden="true" />
            <h3>No matching projects</h3>
            <p>
              {options.favorites
                ? "No flagged projects match these filters. Flag a project in its workspace, or clear the Flag filter."
                : "Try another search or stage. Projects appear here after lead acceptance and assignment."}
            </p>
          </div>
        )}
        <nav className={styles.pagination} aria-label="Project pages">
          <span>Page {options.page}</span>
          {options.page > 1 && (
            <Link href={viewUrl(view, options.page - 1)}>Previous</Link>
          )}
          {options.page * 25 < count && (
            <Link href={viewUrl(view, options.page + 1)}>Next</Link>
          )}
        </nav>
      </section>
    </Scope>
  );
}
