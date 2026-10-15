import Link from "next/link";
import { requireRole } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { profileSchema } from "@/lib/phase1";
import { InvitationForm, UserAccessForm } from "@/components/workflow-forms";
import { PageIntro } from "@/components/live-data";
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { client } = await requireRole(["system_administrator"]);
  const p = await searchParams;
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1),
  );
  const { data, error, count } = await client
    .from("profiles")
    .select("id,display_name,role,active", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  checkDatabase(error);
  const profiles = profileSchema.array().parse(data ?? []);
  return (
    <>
      <PageIntro
        title="User management"
        description="Invite colleagues, assign roles, and activate or deactivate access. Every change is audited."
      />
      <InvitationForm
        configured={
          !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_APP_URL
        }
      />
      {profiles.map((p) => (
        <UserAccessForm key={p.id} profile={p} />
      ))}
      <div className="pagination">
        <span>
          {count ?? 0} accounts · Page {page}
        </span>
        {page > 1 && <Link href={`?page=${page - 1}`}>← Previous</Link>}
        {page * 25 < (count ?? 0) && (
          <Link href={`?page=${page + 1}`}>Next →</Link>
        )}
      </div>
    </>
  );
}
