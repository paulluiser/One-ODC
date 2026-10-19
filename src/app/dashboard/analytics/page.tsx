import { analyticsProjects } from "@/lib/analytics-projects";
import Link from "next/link";
import { RebuildAnalytics } from "@/components/ui-r0/analytics";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { PageIntro } from "@/components/live-data";
import { ProjectAnalytics } from "@/components/project-analytics";
import {
  analyticsFilters,
  analyticsFilterErrors,
  analyticsSchema,
  defaultAnalyticsRange,
} from "@/lib/analytics";
export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireWorkspace();
  if (process.env.ONE_ODC_ANALYTICS_ENABLED !== "true") notFound();
  const params = await searchParams;
  const parsed = analyticsFilters.safeParse({
    ...defaultAnalyticsRange(),
    ...params,
  });
  if (!parsed.success && process.env.ONE_ODC_UI_R0_ENABLED !== "true")
    return (
      <>
        <PageIntro
          title="Project analytics"
          description="Authorized project performance."
        />
        <p role="alert" className="form-error">
          Invalid analytics filters. Use valid dates, a range of up to three
          years, and an end date no later than today.
        </p>
        <Link className="text-link" href="/dashboard/analytics">
          Reset filters
        </Link>
      </>
    );
  const filters = parsed.success
    ? parsed.data
    : analyticsFilters.parse(defaultAnalyticsRange());
  const recovery = parsed.success
    ? undefined
    : {
        values: Object.fromEntries(
          Object.entries(params).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        errors: analyticsFilterErrors({
          ...defaultAnalyticsRange(),
          ...params,
        }),
      };
  const result = await client.rpc("project_analytics", {
    p_from: filters.from,
    p_to: filters.to,
    p_stage: filters.stage,
    p_brand: filters.brand,
    p_stakeholder: filters.stakeholder || null,
    p_view: filters.view,
    p_bucket: filters.bucket,
    p_page: filters.page,
  });
  checkDatabase(result.error);
  const data = analyticsSchema.parse(result.data);
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    const projects = await analyticsProjects(client, filters, data.role);
    return (
      <RebuildAnalytics
        data={data}
        filters={filters}
        recovery={recovery}
        projects={projects}
      />
    );
  }
  return (
    <>
      <PageIntro
        title="Project analytics"
        description="Live performance within your authorized workspace."
      >
        <Link className="text-link" href="/dashboard">
          Back to dashboard
        </Link>
      </PageIntro>
      <ProjectAnalytics data={data} filters={filters} />
    </>
  );
}
