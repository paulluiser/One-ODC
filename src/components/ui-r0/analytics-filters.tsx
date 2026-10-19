"use client";
import { CalendarDays } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./analytics-workspace.module.css";
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
  const router = useRouter();
  const query = useSearchParams();
  const defaults = defaultAnalyticsRange(new Date(data.as_of));
  const days = (count: number) => {
    const date = new Date(`${defaults.to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - count + 1);
    return { from: date.toISOString().slice(0, 10), to: defaults.to };
  };
  const ranges = [
    { label: "Last 30 days", values: days(30) },
    { label: "Last 90 days", values: days(90) },
    { label: "Last 12 months", values: defaults },
  ];
  const selectedRange =
    ranges.find(
      (r) => r.values.from === filters.from && r.values.to === filters.to,
    )?.label ?? "custom";
  return (
    <div className={styles.filterControls}>
      <FilterBar
        compact
        leading={
          <label className={styles.dateRange}>
            <span className="sr-only">Date range</span>
            <CalendarDays size={16} aria-hidden="true" />
            <select
              aria-label="Date range"
              value={selectedRange}
              onChange={(event) => {
                const range = ranges.find(
                  (r) => r.label === event.target.value,
                );
                if (!range) return;
                const next = new URLSearchParams(query.toString());
                next.set("from", range.values.from);
                next.set("to", range.values.to);
                next.delete("page");
                next.delete("project_page");
                router.push(`/dashboard/analytics?${next}`);
              }}
            >
              {ranges.map((r) => (
                <option key={r.label}>{r.label}</option>
              ))}
              <option value="custom" disabled>
                Custom: {filters.from} – {filters.to}
              </option>
            </select>
          </label>
        }
        values={{
          from: filters.from,
          to: filters.to,
          stage: filters.stage,
          brand: filters.brand,
          stakeholder: filters.stakeholder,
        }}
        recovery={recovery}
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
          paginationKeys: ["page", "project_page"],
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
              label: "Current reporting stage",
              hint: "Existing reporting classification; commercial stage and lifecycle are separate in the table.",
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
    </div>
  );
}
