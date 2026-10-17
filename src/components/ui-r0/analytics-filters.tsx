"use client";
import { FilterBar } from "../filter-bar";
import {
  analyticsFilterErrors,
  analyticsStages,
  defaultAnalyticsRange,
  type AnalyticsData,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { filterOptions } from "@/lib/filter-toolbar";
export type AnalyticsFilterRecovery = {
  values: Record<string, string>;
  errors: Record<string, string>;
};
export function AnalyticsFilterPanel({
  filters,
  data,
  recovery,
}: {
  filters: AnalyticsFilters;
  data: AnalyticsData;
  recovery?: AnalyticsFilterRecovery;
}) {
  const defaults = defaultAnalyticsRange(new Date(data.as_of));
  const days = (count: number) => {
    const date = new Date(`${defaults.to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - count + 1);
    return { from: date.toISOString().slice(0, 10), to: defaults.to };
  };
  return (
    <FilterBar
      values={{
        from: filters.from,
        to: filters.to,
        stage: filters.stage,
        brand: filters.brand,
        stakeholder: filters.stakeholder,
      }}
      resultCount={
        filters.view
          ? data.selected_count
          : data.groups
              .filter((g) => g.key === "projects")
              .reduce((sum, g) => sum + g.count, 0)
      }
      resultLabel={filters.view ? undefined : "projects in range"}
      recovery={recovery}
      hint="Inclusive Manila dates. Up to 1,095 days; no future dates."
      validate={(values) => {
        const issues = analyticsFilterErrors(values);
        if (
          values.stakeholder &&
          !data.people.some((p) => p.id === values.stakeholder)
        )
          issues.stakeholder = "Choose an authorized stakeholder.";
        return issues;
      }}
      config={{
        label: "Analytics filters",
        presets: [
          { label: "Last 30 days", values: days(30) },
          { label: "Last 90 days", values: days(90) },
          { label: "Last 12 months", values: defaults },
        ],
        fields: [
          {
            key: "from",
            label: "From",
            type: "date",
            max: defaults.to,
            defaultValue: defaults.from,
          },
          {
            key: "to",
            label: "Through",
            type: "date",
            max: defaults.to,
            defaultValue: defaults.to,
          },
          {
            key: "stage",
            label: "Current project stage",
            options: [
              { value: "", label: "All stages" },
              ...filterOptions(analyticsStages),
            ],
          },
          {
            key: "brand",
            label: "Brand",
            disabled: data.role === "operations_admin",
            hint:
              data.role === "operations_admin"
                ? "Unavailable for your role."
                : undefined,
            options: [
              { value: "", label: "All authorized brands" },
              ...filterOptions(["SFY", "Stosa", "Both"]),
            ],
          },
          {
            key: "stakeholder",
            label: "Assigned stakeholder",
            options: [
              { value: "", label: "All authorized stakeholders" },
              ...data.people.map((p) => ({
                value: p.id,
                label: p.display_name,
              })),
            ],
          },
        ],
      }}
    />
  );
}
