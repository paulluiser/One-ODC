import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { filterOptions } from "@/lib/filter-toolbar";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  calendarRange,
  calendarEventSchema,
  calendarKinds,
  eventsOnDate,
  todayManila,
} from "@/lib/calendar";
import { PageIntro } from "@/components/live-data";
import { CalendarEventForm } from "@/components/calendar-event-form";
import { ContextPanel } from "@/components/context-panel";
export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireWorkspace();
  if (process.env.ONE_ODC_CALENDAR_ENABLED !== "true") notFound();
  const query = await searchParams,
    today = todayManila(),
    month = typeof query.month === "string" ? query.month : today.slice(0, 7);
  let range;
  try {
    range = calendarRange(month);
  } catch {
    return (
      <>
        <PageIntro
          title="Calendar"
          description="Your deadlines and personal events."
        />
        <p className="form-error" role="alert">
          Choose a month between January 2000 and December 2100.
        </p>
        <Link href="/dashboard/calendar">Return to this month</Link>
      </>
    );
  }
  const selected =
    typeof query.day === "string" && range.dates.includes(query.day)
      ? query.day
      : null;
  const kind =
    typeof query.kind === "string" &&
    calendarKinds.includes(query.kind as (typeof calendarKinds)[number])
      ? query.kind
      : "";
  const view = query.view === "agenda" ? "agenda" : "month";
  const search =
    typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const sort = query.sort === "latest" ? "latest" : "earliest";
  const result = await client.rpc("workspace_calendar", {
    p_from: range.from,
    p_to: range.to,
  });
  checkDatabase(result.error);
  const events = calendarEventSchema
    .array()
    .parse(result.data)
    .filter(
      (e) =>
        (!kind || e.kind === kind) &&
        (!search ||
          `${e.title} ${e.subtitle}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  const agenda = (
    selected
      ? eventsOnDate(events, selected)
      : events.filter(
          (e) => e.date <= `${month}-31` && e.end_date >= `${month}-01`,
        )
  ).sort(
    (a, b) =>
      (sort === "latest" ? -1 : 1) * a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.id.localeCompare(b.id),
  );
  const url = (params: Record<string, string>) =>
    `/dashboard/calendar?${new URLSearchParams({ month, kind, view, q: search, sort, ...params })}`;
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  return (
    <>
      <PageIntro
        title="Calendar"
        description="Project dates, design deadlines, installations, and your personal events."
      >
        <ContextPanel
          resetOnClose
          title="Add event"
          description="Personal events are visible only to you. They do not change project deadlines."
        >
          <CalendarEventForm
            id={randomUUID()}
            date={
              selected ?? (month === today.slice(0, 7) ? today : `${month}-01`)
            }
          />
        </ContextPanel>
      </PageIntro>
      <section
        className="surface calendar-workspace"
        aria-label="Workspace calendar"
      >
        <div className="calendar-toolbar">
          <div className="calendar-month-nav">
            <Link
              href={url({ month: range.previous })}
              className="button button-outline"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </Link>
            <h2>{range.label}</h2>
            <Link
              href={url({ month: range.next })}
              className="button button-outline"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </Link>
            <Link
              href={url({ month: today.slice(0, 7), day: today })}
              className="text-link"
            >
              Today
            </Link>
          </div>
          <nav className="calendar-views" aria-label="Calendar view">
            <Link
              className="button button-outline"
              aria-current={view === "month" ? "page" : undefined}
              href={url({
                view: "month",
                ...(selected ? { day: selected } : {}),
              })}
            >
              Month
            </Link>
            <Link
              className="button button-outline"
              aria-current={view === "agenda" ? "page" : undefined}
              href={url({
                view: "agenda",
                ...(selected ? { day: selected } : {}),
              })}
            >
              Agenda
            </Link>
          </nav>
        </div>
        <FilterBar
          resultCount={agenda.length}
          values={{ month, kind, q: search, sort, view }}
          config={{
            label: "Calendar filters",
            search: {
              key: "q",
              label: "Search calendar",
              placeholder: "Search events and deadlines…",
            },
            sort:
              view === "agenda"
                ? {
                    key: "sort",
                    label: "Sort dates",
                    defaultValue: "earliest",
                    options: [
                      { value: "earliest", label: "Earliest first" },
                      { value: "latest", label: "Latest first" },
                    ],
                  }
                : undefined,
            paginationKeys: ["day"],
            fields: [
              {
                key: "month",
                label: "Month",
                type: "month",
                min: "2000-01",
                max: "2100-12",
                defaultValue: today.slice(0, 7),
              },
              {
                key: "kind",
                label: "Event type",
                options: [
                  { value: "", label: "All dates" },
                  ...filterOptions(calendarKinds),
                ],
              },
            ],
          }}
        />
        <p className="field-hint calendar-scope">
          Only records you are authorized to view appear. Dates follow each
          project’s calendar; personal events use Asia/Manila. Cancelled work is
          excluded.
        </p>
        {view === "month" && (
          <div className="calendar-month">
            <div className="calendar-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-days">
              {range.dates.map((date) => {
                const matches = eventsOnDate(events, date);
                return (
                  <Link
                    key={date}
                    href={`${url({ day: date })}#calendar-agenda`}
                    className={`calendar-day ${date.startsWith(month) ? "" : "outside-month"} ${selected === date ? "selected" : ""}`}
                    aria-current={date === today ? "date" : undefined}
                    aria-label={`${formatDate(date)}${date === today ? ", today" : ""} · ${matches.length} ${matches.length === 1 ? "event" : "events"}`}
                  >
                    <span className="calendar-day-number">
                      {Number(date.slice(-2))}
                    </span>
                    {matches.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className="calendar-day-event"
                        data-kind={e.kind}
                      >
                        {e.title}
                      </span>
                    ))}
                    {matches.length > 2 && (
                      <span className="calendar-more">
                        +{matches.length - 2} more
                      </span>
                    )}
                    <span className="calendar-mobile-count">
                      {matches.length > 0 ? matches.length : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <section
        className="surface live-form calendar-agenda"
        aria-label="Calendar events"
        id="calendar-agenda"
      >
        <div className="section-heading">
          <div>
            <h2>{selected ? formatDate(selected) : "This month’s agenda"}</h2>
            <p>
              {agenda.length} {agenda.length === 1 ? "event" : "events"}
              {selected ? " on this day" : " overlapping this month"}
            </p>
          </div>
          {selected && (
            <Link className="text-link" href={url({})}>
              Show whole month
            </Link>
          )}
        </div>
        {!agenda.length ? (
          <div className="empty-state">
            <CalendarDays size={28} aria-hidden="true" />
            <h3>No dates in this view</h3>
            <p>
              Try another month or add a personal event using Add event above.
            </p>
          </div>
        ) : (
          <ol className="calendar-event-list">
            {agenda.map((e) => (
              <li
                key={e.id}
                className="calendar-agenda-event"
                data-kind={e.kind}
              >
                <div className="calendar-event-date">
                  <span>
                    {formatDate(e.date)}
                    {e.end_date !== e.date
                      ? ` — ${formatDate(e.end_date)}`
                      : ""}
                  </span>
                  <strong>
                    {e.time
                      ? `${e.time.slice(0, 5)} – ${e.end_time?.slice(0, 5)}`
                      : "All day"}
                  </strong>
                  <small>{e.timezone}</small>
                </div>
                <div className="calendar-event-copy">
                  <span className="calendar-kind">
                    {e.kind} · {e.status}
                  </span>
                  <h3>
                    {e.href ? <Link href={e.href}>{e.title}</Link> : e.title}
                  </h3>
                  <p>
                    {e.subtitle}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                  {e.notes && <p className="calendar-event-notes">{e.notes}</p>}
                </div>
                {e.kind === "Personal event" ? (
                  <ContextPanel
                    resetOnClose
                    title="Edit personal event"
                    triggerLabel="Edit event"
                    description="Edit or cancel your event. Changes retain their audit history."
                  >
                    <CalendarEventForm id={e.id} date={e.date} event={e} />
                  </ContextPanel>
                ) : (
                  e.href && (
                    <Link className="text-link" href={e.href}>
                      Open record →
                    </Link>
                  )
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
