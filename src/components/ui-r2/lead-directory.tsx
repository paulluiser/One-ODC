import Link from "next/link";
import {
  FileText,
  MessageCircle,
  CheckCircle2,
  Plus,
  Clock,
} from "lucide-react";
import { FilterBar } from "../filter-bar";
import { filterOptions } from "@/lib/filter-toolbar";
import { formatTime, statuses, type Lead } from "@/lib/phase1";
import { DirectoryTable } from "./directory-table";
import { Heading, Scope, Status } from "./primitives";
import shared from "./ui-r2.module.css";
import styles from "./lead-directory.module.css";

export function LeadDirectory({
  leads,
  q,
  status,
  page,
  count,
  bdm,
  canCreate = bdm,
  sort = "updated",
  averageReviewDays = null,
  totals = {},
  owners = {},
}: {
  leads: Lead[];
  q: string;
  status: string;
  page: number;
  count: number;
  bdm: boolean;
  canCreate?: boolean;
  sort?: string;
  averageReviewDays?: number | null;
  totals?: Record<string, number>;
  owners?: Record<string, string>;
}) {
  const url = (nextStatus = status, nextPage = 1, nextSort = sort) =>
    `/dashboard/leads?${new URLSearchParams({ q, sort: nextSort, status: nextStatus || "All", page: String(nextPage) })}`;
  const all = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const metrics = [
    { label: "Awaiting review", status: "Submitted", icon: FileText },
    {
      label: "Returned for clarification",
      status: "Returned for Clarification",
      icon: MessageCircle,
    },
    { label: "Accepted", status: "Accepted", icon: CheckCircle2 },
  ];
  return (
    <Scope>
      <Heading
        title={bdm ? "My Leads" : "Lead review"}
        description="Review the brief, resolve questions, and bring the right projects forward."
        action={
          canCreate && (
            <Link className="button button-primary" href="/dashboard/leads/new">
              <Plus size={16} aria-hidden="true" />
              New request
            </Link>
          )
        }
      />
      <div className={styles.metrics}>
        {metrics.map(({ label, status: value, icon: Icon }) => (
          <Link key={value} href={url(value)} className={styles.metric}>
            <span className={styles.icon}>
              <Icon size={23} aria-hidden="true" />
            </span>
            <span>
              <span className={styles.label}>{label}</span>
              <strong>{totals[value] ?? 0}</strong>
            </span>
          </Link>
        ))}
        <div
          className={styles.metric}
          title="Elapsed calendar days from each submission to its recorded review, across authorized reviewed submissions."
        >
          <span className={styles.icon}>
            <Clock size={23} aria-hidden="true" />
          </span>
          <span>
            <span className={styles.label}>Average review time</span>
            <strong>
              {averageReviewDays === null
                ? "Not available"
                : averageReviewDays > 0 && averageReviewDays < 0.1
                  ? "<0.1 days"
                  : `${averageReviewDays.toFixed(1)} days`}
            </strong>
          </span>
        </div>
      </div>
      <section className={shared.directory} aria-label="Lead review queue">
        <h2 className={styles.queueTitle}>Review queue</h2>
        <nav className={styles.tabs} aria-label="Lead status">
          <Link href={url("")} aria-current={!status ? "page" : undefined}>
            All ({all})
          </Link>
          {statuses.map((value) => (
            <Link
              key={value}
              href={url(value)}
              aria-current={status === value ? "page" : undefined}
            >
              {value === "Submitted" ? "Awaiting review" : value} (
              {totals[value] ?? 0})
            </Link>
          ))}
        </nav>
        <FilterBar
          resultCount={count}
          values={{ q, sort, status: status || "All" }}
          config={{
            label: "Lead filters",
            sort: {
              key: "sort",
              label: "Sort leads",
              defaultValue: "updated",
              options: [
                { value: "updated", label: "Recently updated" },
                { value: "newest", label: "Newest first" },
                { value: "name", label: "Project name A–Z" },
              ],
            },
            search: {
              key: "q",
              label: "Search leads",
              placeholder: "Search lead or project name…",
            },
            fields: [
              {
                key: "status",
                label: "Status",
                defaultValue: "All",
                options: [
                  { value: "All", label: "All statuses" },
                  ...filterOptions(statuses),
                ],
              },
            ],
          }}
        />
        <DirectoryTable
          label="Lead directory table"
          caption="Authorized quotation requests. Open a lead to review its details."
          primaryKey="project"
          columns={[
            { key: "reference", label: "Lead ID", width: 155 },
            {
              key: "project",
              label: "Project / Lead name",
              width: 240,
              sortHref: url(status, 1, "name"),
              sortDirection: sort === "name" ? "ascending" : "none",
            },
            { key: "bdm", label: "Responsible BDM", width: 175 },
            { key: "status", label: "Status", width: 180 },
            { key: "needed", label: "Date needed", width: 130 },
            {
              key: "updated",
              label: "Last updated",
              width: 175,
              sortHref: url(status, 1, "updated"),
              sortDirection: sort === "updated" ? "descending" : "none",
            },
          ]}
          rows={leads.map((lead) => ({
            id: lead.id,
            href: `/dashboard/leads/${lead.id}`,
            label: `${lead.project_name || "Untitled draft"}, ${lead.reference}`,
            mobileTitle: (
              <span className={styles.identity}>
                <strong>{lead.project_name || "Untitled draft"}</strong>
                <small>{lead.reference}</small>
              </span>
            ),
            cells: {
              reference: lead.reference,
              project: (
                <strong className={styles.name}>
                  {lead.project_name || "Untitled draft"}
                </strong>
              ),
              bdm: owners[lead.bdm_id] || "Assigned BDM",
              status: <Status>{lead.status}</Status>,
              needed: lead.date_needed
                ? new Intl.DateTimeFormat("en-PH", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(lead.date_needed))
                : "Not scheduled",
              updated: formatTime(lead.updated_at),
            },
          }))}
        />
        {!leads.length && (
          <p className={shared.empty}>No leads match this search or status.</p>
        )}
        <nav className={shared.pagination} aria-label="Lead pages">
          <span>
            {count
              ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}`
              : "0"}{" "}
            leads · Page {page}
          </span>
          {page > 1 && <Link href={url(status, page - 1)}>Previous</Link>}
          {page * 25 < count && <Link href={url(status, page + 1)}>Next</Link>}
        </nav>
      </section>
    </Scope>
  );
}
