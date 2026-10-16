"use client";
import { useActionState, useState } from "react";
import { saveCalendarEvent } from "@/app/dashboard/calendar/actions";
import type { CalendarEvent } from "@/lib/calendar";
import { OperationFeedback, PendingIndicator } from "./operation-feedback";
import { Button } from "./ui/button";
export function CalendarEventForm({
  id,
  date,
  event,
}: {
  id: string;
  date: string;
  event?: CalendarEvent;
}) {
  const [identity, setIdentity] = useState(id);
  return (
    <EventEditor
      key={identity}
      id={identity}
      date={date}
      event={event}
      another={() => setIdentity(crypto.randomUUID())}
    />
  );
}
function EventEditor({
  id,
  date,
  event,
  another,
}: {
  id: string;
  date: string;
  event?: CalendarEvent;
  another: () => void;
}) {
  const [state, action, pending] = useActionState(saveCalendarEvent, {
    error: null,
  });
  const [start, setStart] = useState(event?.date ?? date),
    [end, setEnd] = useState(event?.end_date ?? date);
  return (
    <form action={action} className="calendar-event-form">
      <input name="id" type="hidden" value={id} />
      <input name="version" type="hidden" value={event?.version ?? 0} />
      <div className="live-field">
        <label htmlFor={`title-${id}`}>Event title *</label>
        <input
          id={`title-${id}`}
          name="title"
          defaultValue={event?.title}
          maxLength={200}
          required
          disabled={pending}
        />
      </div>
      <div className="live-form-grid">
        <div className="live-field">
          <label htmlFor={`date-${id}`}>Start date *</label>
          <input
            id={`date-${id}`}
            name="date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
            required
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor={`end-${id}`}>End date *</label>
          <input
            id={`end-${id}`}
            name="end_date"
            type="date"
            min={start}
            max="2100-12-31"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor={`time-${id}`}>Start time</label>
          <input
            id={`time-${id}`}
            name="time"
            type="time"
            defaultValue={event?.time?.slice(0, 5)}
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor={`until-${id}`}>End time</label>
          <input
            id={`until-${id}`}
            name="end_time"
            type="time"
            defaultValue={event?.end_time?.slice(0, 5)}
            disabled={pending}
          />
        </div>
      </div>
      <p className="field-hint">
        Leave both times blank for an all-day event. Personal event times use
        Asia/Manila.
      </p>
      <div className="live-field">
        <label htmlFor={`location-${id}`}>Location</label>
        <input
          id={`location-${id}`}
          name="location"
          maxLength={300}
          defaultValue={event?.location}
          disabled={pending}
        />
      </div>
      <div className="live-field">
        <label htmlFor={`notes-${id}`}>Notes</label>
        <textarea
          id={`notes-${id}`}
          name="notes"
          rows={3}
          maxLength={4000}
          defaultValue={event?.notes}
          disabled={pending}
        />
      </div>
      {event ? (
        <div className="live-field">
          <label htmlFor={`reason-${id}`}>
            Change or cancellation reason *
          </label>
          <input
            id={`reason-${id}`}
            name="reason"
            maxLength={2000}
            required
            disabled={pending}
          />
        </div>
      ) : (
        <input type="hidden" name="reason" value="Personal event created" />
      )}
      <OperationFeedback error={state.error} success={state.success} />
      <div className="form-actions">
        <Button
          type="submit"
          name="intent"
          value="save"
          disabled={pending || !!state.success}
        >
          {pending ? "Saving…" : "Save event"}
        </Button>
        {event && (
          <Button
            variant="outline"
            type="submit"
            name="intent"
            value="cancel"
            disabled={pending || !!state.success}
            formNoValidate
          >
            Cancel event
          </Button>
        )}
        {!event && state.success && (
          <Button type="button" variant="outline" onClick={another}>
            Add another event
          </Button>
        )}
      </div>
      <PendingIndicator pending={pending} />
    </form>
  );
}
