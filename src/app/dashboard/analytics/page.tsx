import Link from "next/link";
import { RebuildAnalytics } from "@/components/ui-r0/analytics";
import { Panel } from "@/components/ui-r0/primitives";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { PageIntro } from "@/components/live-data";
import { ProjectAnalytics } from "@/components/project-analytics";
import {
  analyticsFilters,
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
  if (!parsed.success && process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <Panel label="Invalid analytics filters">
        <p role="alert">
          Invalid analytics filters. Use valid dates, a range of up to three
          years, and an end date no later than today.
        </p>
        <Link href="/dashboard/analytics">Reset filters</Link>
      </Panel>
    );
  if (!parsed.success)
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
  const filters = parsed.data;
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
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return <RebuildAnalytics data={data} filters={filters} />;
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
