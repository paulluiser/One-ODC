"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ArrowUpRight } from "lucide-react";
import { formatTime, type Notification } from "@/lib/phase1";
import { readNotifications } from "@/app/dashboard/notifications/actions";
import { Button } from "@/components/ui/button";
import styles from "./notification-inbox.module.css";

function ReadButton({
  id,
  disabled = false,
}: {
  id?: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(readNotifications, {});
  return (
    <div className={styles.readAction}>
      <form action={action}>
        <input type="hidden" name={id ? "id" : "scope"} value={id ?? "all"} />
        <Button variant="outline" type="submit" disabled={pending || disabled}>
          {!id && <CheckCheck size={16} aria-hidden="true" />}
          {pending ? "Marking as read…" : id ? "Mark read" : "Mark all as read"}
        </Button>
      </form>
      {state.error && <p role="alert">{state.error}</p>}
      <span className="sr-only" role="status">
        {state.success}
      </span>
    </div>
  );
}
export function NotificationInbox({
  notices,
  unread,
  all,
  page,
  total,
}: {
  notices: Notification[];
  unread: number;
  all: boolean;
  page: number;
  total: number;
}) {
  const href = (p: number) =>
    `/dashboard/notifications?${new URLSearchParams({ view: all ? "all" : "unread", page: String(p) })}`;
  return (
    <section className={styles.inbox} aria-label="Notification inbox">
      <div className={styles.toolbar}>
        <nav aria-label="Notification views" className={styles.views}>
          <Link
            href="/dashboard/notifications"
            aria-current={!all ? "page" : undefined}
          >
            Unread <span>{unread}</span>
          </Link>
          <Link
            href="/dashboard/notifications?view=all"
            aria-current={all ? "page" : undefined}
          >
            All notifications
          </Link>
        </nav>
        <ReadButton disabled={unread === 0} />
      </div>
      {notices.length ? (
        <ul className={styles.list}>
          {notices.map((n) => (
            <li
              key={n.id}
              className={styles.notice}
              data-unread={!n.read_at || undefined}
            >
              <span className={styles.icon}>
                <Bell size={18} aria-hidden="true" />
              </span>
              <div className={styles.body}>
                <h2>{n.message}</h2>
                <p>
                  {formatTime(n.created_at)} · {n.read_at ? "Read" : "Unread"}
                </p>
                {(n.project_id || n.lead_id) && (
                  <Link
                    className="text-link"
                    href={
                      n.project_id
                        ? `/dashboard/projects/${n.project_id}`
                        : `/dashboard/leads/${n.lead_id}`
                    }
                  >
                    Open record <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>
              {!n.read_at && <ReadButton id={n.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <Bell size={26} aria-hidden="true" />
          <h2>{all ? "No notifications yet" : "You’re all caught up"}</h2>
          <p>
            {all
              ? "Project and assignment updates will appear here."
              : "New updates will appear here. Read updates are saved in All notifications."}
          </p>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          {total
            ? `${(page - 1) * 50 + (notices.length ? 1 : 0)}–${Math.min(page * 50, total)} of ${total}`
            : "0 notifications"}
        </span>
        <nav aria-label="Notification pages">
          {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
          {page * 50 < total && <Link href={href(page + 1)}>Next</Link>}
        </nav>
      </footer>
    </section>
  );
}
