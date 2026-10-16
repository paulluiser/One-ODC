"use client";

import { useState, useTransition } from "react";
import { History, Info, ShieldCheck, Mail, UserRoundCog } from "lucide-react";
import { ContextPanel } from "../context-panel";
import { formatTime } from "@/lib/phase1";
import { loadAccessHistory } from "@/app/dashboard/users/history-actions";
import styles from "./ui-r4.module.css";

type HistoryEvent = {
  id: string;
  entity_id: string;
  action: string;
  actor_id: string;
  occurred_at: string;
};

export function AccessTools({
  history,
  count,
}: {
  history: HistoryEvent[];
  count: number;
}) {
  const [events, setEvents] = useState(history);
  const [total, setTotal] = useState(count);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [requestedPage, setRequestedPage] = useState(1);
  function load(next: number) {
    setRequestedPage(next);
    setError("");
    startTransition(async () => {
      try {
        const result = await loadAccessHistory(next);
        if (result.error || !result.events) {
          setError(
            result.error ?? "History could not be loaded. Please retry.",
          );
          return;
        }
        setEvents(result.events);
        setTotal(result.count);
        setPage(result.page);
      } catch {
        setError("History could not be loaded. Please retry.");
      }
    });
  }
  return (
    <>
      <ContextPanel
        title="Administrative history"
        description="Invitation requests and account-access changes, newest first. Each entry preserves who performed the action and when."
        triggerLabel={
          <>
            <History size={19} aria-hidden="true" />
            <span className="sr-only">Administrative history</span>
          </>
        }
      >
        <div className={styles.accessHistory} aria-busy={pending}>
          <p className={styles.accessMeta} role="status">
            {pending
              ? "Loading history…"
              : `${total} events · Page ${page} of ${Math.max(1, Math.ceil(total / 10))}`}
          </p>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="button button-outline"
                disabled={pending}
                onClick={() => load(requestedPage)}
              >
                Retry
              </button>
            </div>
          )}
          {events.length ? (
            <ol className={styles.accessEvents}>
              {events.map((event) => (
                <li key={event.id}>
                  <span className={styles.accessEventIcon}>
                    {event.action === "user.invitation_requested" ? (
                      <Mail size={18} aria-hidden="true" />
                    ) : (
                      <UserRoundCog size={18} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>
                      {event.action === "user.invitation_requested"
                        ? "Invitation requested"
                        : "Account access updated"}
                    </strong>
                    <time dateTime={event.occurred_at}>
                      {formatTime(event.occurred_at)}
                    </time>
                    <details>
                      <summary>Audit references</summary>
                      <dl>
                        <dt>Account</dt>
                        <dd>{event.entity_id}</dd>
                        <dt>Performed by</dt>
                        <dd>{event.actor_id}</dd>
                      </dl>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.accessEmpty}>
              <History size={28} aria-hidden="true" />
              <p>No administrative events yet.</p>
            </div>
          )}
          <nav
            className={styles.accessPagination}
            aria-label="Administrative history pages"
          >
            <button
              type="button"
              className="button button-outline"
              disabled={pending || page <= 1}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={pending || page * 10 >= total}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      </ContextPanel>
      <ContextPanel
        title="Roles & access"
        description="Give each colleague the access they need. Project assignments and commercial stage also determine what they can see."
        triggerLabel={
          <>
            <Info size={19} aria-hidden="true" />
            <span className="sr-only">Role and access guidance</span>
          </>
        }
      >
        <dl className={styles.roleGuide}>
          <dt>System Administrator</dt>
          <dd>
            Manage invitations, account roles and activation, with
            administrative oversight.
          </dd>
          <dt>Lead Designer</dt>
          <dd>
            Review leads, manage project teams and spaces, review quotations,
            and coordinate operational handoff.
          </dd>
          <dt>Designer</dt>
          <dd>
            Work within assigned projects, update assigned spaces, and prepare
            authorized quotation drafts.
          </dd>
          <dt>BDM</dt>
          <dd>
            Submit leads, respond to clarification, monitor related projects,
            and view approved quotations and authorized Sale information.
          </dd>
          <dt>Operations Admin</dt>
          <dd>
            Manage authorized handoffs, logistics and installation. Pre-closure
            project details and quotation access remain restricted.
          </dd>
        </dl>
        <div className={styles.accessNote}>
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            <strong>Every access change is audited.</strong> Role and activation
            changes require a reason. Deactivating an account removes workspace
            access while preserving its records and audit history.
          </p>
        </div>
      </ContextPanel>
    </>
  );
}
