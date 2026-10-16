"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, AlertCircle } from "lucide-react";
import {
  analyticsFilters,
  analyticsFilterErrors,
  analyticsStages,
  defaultAnalyticsRange,
  type AnalyticsData,
  type AnalyticsFilters,
} from "@/lib/analytics";
import styles from "./ui-r1.module.css";

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
  const [values, setValues] = useState(() => ({
    from: recovery?.values.from ?? filters.from,
    to: recovery?.values.to ?? filters.to,
    stage: recovery?.values.stage ?? filters.stage,
    brand:
      data.role === "operations_admin"
        ? ""
        : (recovery?.values.brand ?? filters.brand),
    stakeholder: recovery?.values.stakeholder ?? filters.stakeholder,
  }));
  const [errors, setErrors] = useState<Record<string, string>>(
    recovery?.errors ?? {},
  );
  const [touched, setTouched] = useState(!!recovery);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function change(field: string, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (touched) setErrors(analyticsFilterErrors(next));
  }
  function preset(days: number) {
    const date = new Date(`${defaults.to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days + 1);
    const next = {
      ...values,
      from: date.toISOString().slice(0, 10),
      to: defaults.to,
    };
    setValues(next);
    setErrors(analyticsFilterErrors(next));
  }
  const fieldProps = (name: string) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `analytics-${name}-error` : undefined,
  });
  const error = (field: string) =>
    errors[field] && (
      <span id={`analytics-${field}-error`} className={styles.filterError}>
        {errors[field]}
      </span>
    );
  const cleanDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return (
    <details className={styles.filter} open>
      <summary>
        <SlidersHorizontal size={17} aria-hidden="true" />
        Filters
        <span>
          Applied: {filters.from} — {filters.to}
          {filters.stage ? ` · ${filters.stage}` : ""}
          {filters.brand ? ` · ${filters.brand}` : ""}
          {filters.stakeholder ? " · Assigned stakeholder" : ""}
        </span>
      </summary>
      {recovery && (
        <div className={styles.filterNotice} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>These filters weren’t applied.</strong>
            <p>
              Showing the default date range with all authorized records.
              Correct the fields below and apply again, or reset filters.
            </p>
            {Object.entries(recovery.errors)
              .filter(
                ([field]) =>
                  !["from", "to", "stage", "brand", "stakeholder"].includes(
                    field,
                  ),
              )
              .map(([field, text]) => (
                <p key={field}>{text}</p>
              ))}
          </div>
        </div>
      )}
      <form
        method="get"
        action="/dashboard/analytics"
        noValidate
        onBlur={() => {
          setTouched(true);
          setErrors(analyticsFilterErrors(values));
        }}
        aria-label="Analytics filters"
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          const nextErrors = analyticsFilterErrors(values);
          if (data.role === "operations_admin" && values.brand)
            nextErrors.brand = "Brand filtering is unavailable for your role.";
          if (
            values.stakeholder &&
            !data.people.some((p) => p.id === values.stakeholder)
          )
            nextErrors.stakeholder =
              "Choose an authorized stakeholder from the list.";
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length) {
            const name = Object.keys(nextErrors)[0];
            e.currentTarget
              .querySelector<HTMLElement>(`[name="${name}"]`)
              ?.focus();
            return;
          }
          const parsed = analyticsFilters.safeParse(values);
          if (parsed.success)
            startTransition(() =>
              router.push(
                `/dashboard/analytics?${new URLSearchParams(values)}`,
              ),
            );
        }}
      >
        <div className={styles.filterPresets} aria-label="Quick date ranges">
          <span>Date range</span>
          <button type="button" disabled={pending} onClick={() => preset(30)}>
            Last 30 days
          </button>
          <button type="button" disabled={pending} onClick={() => preset(90)}>
            Last 90 days
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const next = { ...values, ...defaults };
              setValues(next);
              setErrors(analyticsFilterErrors(next));
            }}
          >
            Last 12 months
          </button>
        </div>
        <div className={styles.filterFields}>
          <label htmlFor="analytics-from">
            From
            <input
              id="analytics-from"
              name="from"
              type="date"
              required
              max={
                cleanDate(values.to) && values.to < defaults.to
                  ? values.to
                  : defaults.to
              }
              value={values.from}
              onChange={(e) => change("from", e.target.value)}
              {...fieldProps("from")}
            />
            {error("from")}
          </label>
          <label htmlFor="analytics-to">
            Through
            <input
              id="analytics-to"
              name="to"
              type="date"
              required
              min={cleanDate(values.from) ? values.from : undefined}
              max={defaults.to}
              value={values.to}
              onChange={(e) => change("to", e.target.value)}
              {...fieldProps("to")}
            />
            {error("to")}
          </label>
          <label htmlFor="analytics-stage">
            Current project stage
            <select
              id="analytics-stage"
              aria-label="Current project stage"
              name="stage"
              value={values.stage}
              onChange={(e) => change("stage", e.target.value)}
              {...fieldProps("stage")}
            >
              <option value="">All stages</option>
              {analyticsStages.map((s) => (
                <option key={s}>{s}</option>
              ))}
              {values.stage &&
                !analyticsStages.includes(
                  values.stage as (typeof analyticsStages)[number],
                ) && (
                  <option value={values.stage}>
                    Invalid stage — choose another
                  </option>
                )}
            </select>
            {error("stage")}
          </label>
          <label htmlFor="analytics-brand">
            Brand
            <select
              id="analytics-brand"
              name="brand"
              value={values.brand}
              disabled={data.role === "operations_admin"}
              onChange={(e) => change("brand", e.target.value)}
              {...fieldProps("brand")}
            >
              <option value="">All authorized brands</option>
              {["SFY", "Stosa", "Both"].map((s) => (
                <option key={s}>{s}</option>
              ))}
              {values.brand &&
                !["SFY", "Stosa", "Both"].includes(values.brand) && (
                  <option value={values.brand}>
                    Invalid brand — choose another
                  </option>
                )}
            </select>
            {error("brand")}
            {data.role === "operations_admin" && (
              <span className={styles.filterHint}>
                Unavailable for your role.
              </span>
            )}
          </label>
          <label htmlFor="analytics-person">
            Assigned stakeholder
            <select
              id="analytics-person"
              aria-label="Assigned stakeholder"
              name="stakeholder"
              value={values.stakeholder}
              onChange={(e) => change("stakeholder", e.target.value)}
              {...fieldProps("stakeholder")}
            >
              <option value="">All authorized stakeholders</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
              {values.stakeholder &&
                !data.people.some((p) => p.id === values.stakeholder) && (
                  <option value={values.stakeholder}>
                    Unavailable stakeholder — choose another
                  </option>
                )}
            </select>
            {error("stakeholder")}
          </label>
          <div className={styles.filterActions}>
            <button type="submit" disabled={pending}>
              {pending ? "Applying…" : "Apply filters"}
            </button>
            <Link href="/dashboard/analytics">Reset</Link>
          </div>
        </div>
        <p className={styles.filterHint}>
          Inclusive dates · Manila calendar · Up to 1,095 days · No future
          dates. Changes take effect when you apply.
        </p>
        {Object.keys(errors).length > 0 && (
          <p role="alert" className={styles.filterError}>
            Check the highlighted fields. Your current results are unchanged.
          </p>
        )}
      </form>
    </details>
  );
}
