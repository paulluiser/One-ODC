import { expect, it } from "vitest";
import {
  calendarRange,
  eventsOnDate,
  manualEventSchema,
  type CalendarEvent,
} from "../../src/lib/calendar";
it("uses a six-week calendar across year boundaries and leap days", () => {
  const r = calendarRange("2024-02");
  expect(r.dates).toHaveLength(42);
  expect(r.dates).toContain("2024-02-29");
  expect(r.from).toBe("2024-01-28");
  expect(calendarRange("2026-01").previous).toBe("2025-12");
  expect(calendarRange("2026-12").next).toBe("2027-01");
});
it("rejects malformed or unsupported months", () => {
  for (const v of ["2026-00", "2026-13", "2026-1", "bad", "1999-12", "2101-01"])
    expect(() => calendarRange(v)).toThrow();
});
const data = {
  id: "10000000-0000-4000-8000-000000000001",
  version: 0,
  title: "Client coordination",
  date: "2026-10-15",
  end_date: "2026-10-15",
  time: "",
  end_time: "",
  location: "Studio",
  notes: "<b>Plain text</b>",
  reason: "",
};
it("allows all-day and correctly ordered timed events", () => {
  expect(manualEventSchema.safeParse(data).success).toBe(true);
  expect(
    manualEventSchema.safeParse({ ...data, time: "09:00", end_time: "10:00" })
      .success,
  ).toBe(true);
});
it("rejects invalid ranges, partial/reversed times, oversized content and reasonless edits", () => {
  for (const change of [
    { end_date: "2026-10-14" },
    { end_date: "2027-11-01" },
    { time: "09:00" },
    { time: "10:00", end_time: "09:00" },
    { time: "24:00", end_time: "25:00" },
    { title: " " },
    { notes: "x".repeat(4001) },
    { version: 1, reason: "" },
  ])
    expect(manualEventSchema.safeParse({ ...data, ...change }).success).toBe(
      false,
    );
});
it("includes a spanning event on every covered date without duplicates", () => {
  const e: CalendarEvent = {
    ...data,
    kind: "Personal event",
    subtitle: "Only you",
    href: null,
    status: "Scheduled",
    timezone: "Asia/Manila",
    end_date: "2026-10-17",
  };
  expect(eventsOnDate([e], "2026-10-16")).toEqual([e]);
  expect(eventsOnDate([e], "2026-10-18")).toEqual([]);
});
