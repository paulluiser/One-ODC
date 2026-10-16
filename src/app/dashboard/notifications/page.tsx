import Link from "next/link";
import { NotificationInbox } from "@/components/notification-inbox";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime, type Notification } from "@/lib/phase1";
import { PageIntro } from "@/components/live-data";
import { markRead } from "../actions";
import { Button } from "@/components/ui/button";
export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { client } = await requireWorkspace();
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    const params = await searchParams;
    const all = params.view === "all";
    const page = Math.max(1, Math.min(100000, Number(params.page) || 1)) | 0;
    let query = client
      .from("notifications")
      .select("id,message,created_at,read_at,lead_id,project_id", {
        count: "exact",
      });
    if (!all) query = query.is("read_at", null);
    const [notices, unread] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * 50, page * 50 - 1),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);
    checkDatabase(notices.error);
    checkDatabase(unread.error);
    return (
      <>
        <PageIntro
          title="Notifications"
          description="Your project, review, and assignment updates in one place."
        />
        <NotificationInbox
          notices={notices.data as Notification[]}
          unread={unread.count ?? 0}
          all={all}
          page={page}
          total={notices.count ?? 0}
        />
      </>
    );
  }
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
        description="Your project, review, and assignment updates in one place."
      />
      <section className="surface live-form">
        {data?.length ? (
          (data as Notification[]).map((n) => (
            <article
              className="live-notification"
              data-unread={!n.read_at || undefined}
              key={n.id}
            >
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
          Showing the latest 100 notices. Use Refresh workspace to check for new
          updates.
        </p>
      </section>
    </>
  );
}
