import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime, type Notification } from "@/lib/phase1";
import { PageIntro } from "@/components/live-data";
import { markRead } from "../actions";
import { Button } from "@/components/ui/button";
export default async function Notifications() {
  const { client } = await requireWorkspace();
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  checkDatabase(error);
  return (
    <>
      <PageIntro
        title="Notifications"
        description="Persisted review and assignment updates. Refresh this page to check for new notices."
      />
      <section className="surface live-form">
        {data?.length ? (
          (data as Notification[]).map((n) => (
            <article className="live-notification" key={n.id}>
              <div>
                <h2>{n.message}</h2>
                <small>
                  {formatTime(n.created_at)} · {n.read_at ? "Read" : "Unread"}
                </small>
                {(n.lead_id || n.project_id) && (
                  <Link
                    className="text-link"
                    href={
                      n.project_id
                        ? `/dashboard/projects/${n.project_id}`
                        : `/dashboard/leads/${n.lead_id}`
                    }
                  >
                    Open record →
                  </Link>
                )}
              </div>
              {!n.read_at && (
                <form action={markRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <Button variant="outline" type="submit">
                    Mark read
                  </Button>
                </form>
              )}
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h3>No notifications yet</h3>
            <p>Review and assignment updates will appear here.</p>
          </div>
        )}
        <p className="field-hint">
          Latest 100 notices. Realtime delivery is deferred; these records are
          queried from PostgreSQL.
        </p>
      </section>
    </>
  );
}
