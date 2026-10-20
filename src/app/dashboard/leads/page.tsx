import { LeadDirectory } from "@/components/ui-r2/directories";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { leadSchema, statuses } from "@/lib/phase1";
import { PageIntro, LeadTable } from "@/components/live-data";
import { Button } from "@/components/ui/button";
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const { client, profile } = await requireRole([
    "bdm",
    "lead_designer",
    "system_administrator",
  ]);
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q.trim().slice(0, 200) : "";
  const sort =
    p.sort === "name" ? "name" : p.sort === "newest" ? "newest" : "updated";
  const status =
    typeof p.status === "string" &&
    statuses.includes(p.status as (typeof statuses)[number])
      ? p.status
      : !p.status && profile.role !== "bdm"
        ? "Submitted"
        : "";
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1),
  );
  let query = client
    .from("leads")
    .select("*", { count: "exact" })
    .order(
      sort === "name"
        ? "project_name"
        : sort === "newest"
          ? "created_at"
          : "updated_at",
      { ascending: sort === "name" },
    )
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (q)
    query = query.ilike("project_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error?.code === "PGRST103" && page > 1)
    redirect(
      `/dashboard/leads?${new URLSearchParams({ q, sort, status: status || "All", page: "1" })}`,
    );
  checkDatabase(error);
  const leads = leadSchema.array().parse(data ?? []);
  const url = (number: number) =>
    `/dashboard/leads?${new URLSearchParams({ q, sort, status: status || "All", page: String(number) })}`;
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    const statusCounts = await Promise.all(
      statuses.map(async (value) => {
        const result = await client
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("status", value);
        checkDatabase(result.error);
        return [value, result.count ?? 0] as const;
      }),
    );
    // Pair each immutable review with its own submission, including resubmissions.
    let reviewDays = 0;
    let reviewedCount = 0;
    for (let offset = 0; ; offset += 500) {
      const reviews = await client
        .from("lead_reviews")
        .select("id,reviewed_at,lead_submissions!inner(submitted_at)")
        .order("id")
        .range(offset, offset + 499);
      checkDatabase(reviews.error);
      for (const review of reviews.data ?? []) {
        const submission = Array.isArray(review.lead_submissions)
          ? review.lead_submissions[0]
          : review.lead_submissions;
        const elapsed =
          Date.parse(review.reviewed_at) -
          Date.parse(submission?.submitted_at ?? "");
        if (Number.isFinite(elapsed) && elapsed >= 0) {
          reviewDays += elapsed / 86400000;
          reviewedCount++;
        }
      }
      if ((reviews.data?.length ?? 0) < 500) break;
    }
    const ownerIds = [...new Set(leads.map((lead) => lead.bdm_id))];
    const owners = ownerIds.length
      ? await client
          .from("profiles")
          .select("id,display_name")
          .in("id", ownerIds)
      : { data: [], error: null };
    checkDatabase(owners.error);
    return (
      <LeadDirectory
        leads={leads}
        averageReviewDays={reviewedCount ? reviewDays / reviewedCount : null}
        totals={Object.fromEntries(statusCounts)}
        owners={Object.fromEntries(
          (owners.data ?? []).map((owner) => [owner.id, owner.display_name]),
        )}
        q={q}
        sort={sort}
        status={status}
        page={page}
        count={count ?? 0}
        bdm={profile.role === "bdm"}
        canCreate={["bdm", "system_administrator"].includes(profile.role)}
      />
    );
  }
  return (
    <>
      <PageIntro
        title={profile.role === "bdm" ? "My Leads" : "Lead review"}
        description="Quotation requests, review decisions, and submission history."
      >
        {["bdm", "system_administrator"].includes(profile.role) && (
          <Button asChild>
            <Link href="/dashboard/leads/new">New request</Link>
          </Button>
        )}
      </PageIntro>
      <form className="list-controls" method="get">
        <div className="live-field">
          <label htmlFor="q">Search project or client name</label>
          <input id="q" name="q" defaultValue={q} />
        </div>
        <div className="live-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status || "All"}>
            <option value="All">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>
      <LeadTable leads={leads} />
      <div className="pagination">
        <span>
          {count ?? 0} matching records · Page {page}
        </span>
        {page > 1 && <Link href={url(page - 1)}>← Previous</Link>}
        {page * 25 < (count ?? 0) && <Link href={url(page + 1)}>Next →</Link>}
      </div>
    </>
  );
}
