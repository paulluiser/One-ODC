import { z } from "zod";
export const calendarKinds = [
  "Project deadline",
  "Space deadline",
  "Installation",
  "Expected handoff",
  "Lead requested date",
  "Personal event",
] as const;
export const calendarEventSchema = z.object({
  id: z.string(),
  kind: z.enum(calendarKinds),
  title: z.string(),
  subtitle: z.string(),
  date: z.iso.date(),
  end_date: z.iso.date(),
  time: z.string().nullable(),
  end_time: z.string().nullable(),
  href: z.string().nullable(),
  status: z.string(),
  timezone: z.string(),
  version: z.number(),
  notes: z.string(),
  location: z.string(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const manualEventSchema = z
  .object({
    id: z.uuid(),
    version: z.coerce.number().int().min(0),
    title: z.string().trim().min(1).max(200),
    date: z.iso.date(),
    end_date: z.iso.date(),
    time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
    end_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
    location: z.string().trim().max(300),
    notes: z.string().max(4000),
    reason: z.string().trim().max(2000),
  })
  .refine((v) => v.date >= "2000-01-01" && v.end_date <= "2100-12-31", {
    message: "Choose dates between 2000 and 2100.",
  })
  .refine(
    (v) =>
      v.end_date >= v.date &&
      Date.parse(v.end_date) - Date.parse(v.date) <= 366 * 86400000,
    { message: "End date must be within one year of the start date." },
  )
  .refine(
    (v) =>
      (!v.time && !v.end_time) ||
      (!!v.time &&
        !!v.end_time &&
        (v.end_date > v.date || v.end_time > v.time)),
    { message: "Provide both times, with the end after the start." },
  )
  .refine((v) => v.version === 0 || v.reason.length > 0, {
    message: "Provide a reason for this change.",
  });
export function todayManila() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function calendarRange(month: string) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < "2000-01" ||
    month > "2100-12"
  )
    throw Error("Invalid calendar month");
  const first = new Date(`${month}-01T00:00:00Z`),
    from = new Date(first);
  from.setUTCDate(1 - first.getUTCDay());
  const dates = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    return iso(d);
  });
  const adjacent = (n: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    return iso(d).slice(0, 7);
  };
  return {
    from: dates[0],
    to: dates[41],
    dates,
    previous: adjacent(-1),
    next: adjacent(1),
    label: new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(first),
  };
}
export function eventsOnDate(events: CalendarEvent[], date: string) {
  return events.filter((e) => e.date <= date && e.end_date >= date);
}
