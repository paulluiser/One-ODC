import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime, type Member } from "@/lib/phase1";
import type { TimelineEvent } from "@/lib/monitoring";
export async function ProjectRecentActivity({ project }: { project: string }) {
  const { client, profile } = await requireWorkspace();
  const [r, team] = await Promise.all([
    client.rpc("project_timeline", {
      p_project: project,
      p_category: "",
      p_from: null,
      p_to: null,
      p_actor: null,
      p_space: null,
      p_offset: 0,
    }),
    client.rpc("project_team", { p_project: project }),
  ]);
  checkDatabase(r.error);
  checkDatabase(team.error);
  const rows = (r.data ?? []) as TimelineEvent[],
    members = (team.data ?? []) as Member[];
  return (
    <section className="surface live-form recent-project-activity">
      <h2>Recent project activity</h2>
      {!rows.length && <p>No authorized activity yet.</p>}
      <ul>
        {rows.slice(0, 3).map((t) => (
          <li key={t.id}>
            <strong>
              {t.category === "System Event"
                ? t.description.split(":")[0].replace(/[._]/g, " ")
                : t.category}
            </strong>
            <span>
              {t.actor_id === profile.id
                ? profile.display_name
                : members.find((m) => m.user_id === t.actor_id)?.display_name ||
                  `User ${t.actor_id.slice(0, 8)}`}{" "}
              · {formatTime(t.recorded_at)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="#project-activities">View activities and history →</Link>
    </section>
  );
}
