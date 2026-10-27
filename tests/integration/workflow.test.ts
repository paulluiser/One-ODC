import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  bdm: "10000000-0000-4000-8000-000000000002",
  otherBdm: "10000000-0000-4000-8000-000000000003",
  designer: "10000000-0000-4000-8000-000000000004",
  lead: "10000000-0000-4000-8000-000000000005",
  ops: "10000000-0000-4000-8000-000000000006",
  stranger: "10000000-0000-4000-8000-000000000007",
};
const leadId = "20000000-0000-4000-8000-000000000001";
const payload = {
  assigned_lead_designer_id: ids.lead,
  project_name: "Database test residence",
  address: "Test address",
  brand: "Stosa",
  cabinetry_count: 4,
  notes: "",
  date_needed: null,
  attachment_metadata: [],
};
let db: PGlite;
async function actor(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function submit(id = leadId) {
  await actor(ids.bdm);
  return db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
    id,
    JSON.stringify(payload),
  ]);
}
// Test setup only: represent a file uploaded before requests became links-only.
// No production endpoint or RLS bypass is granted to application users.
async function legacyLeadFile(ready = true) {
  await db.exec("reset role");
  const a = (
    await db.query<{ id: string }>(
      "insert into public.attachments(lead_id,classification,created_by) values($1,'general',$2) returning id",
      [leadId, ids.bdm],
    )
  ).rows[0].id;
  const v = (
    await db.query<{ id: string; attachment_id: string; object_path: string }>(
      "insert into public.attachment_versions(attachment_id,object_path,original_name,mime_type,expected_size,created_by,ready_at,actual_size) values($1::uuid,'leads/'||$2||'/attachments/'||($1::uuid)::text||'/versions/'||gen_random_uuid(),'legacy.txt','text/plain',10,$3,case when $4 then now() else null end,case when $4 then 10 else null end) returning id,attachment_id,object_path",
      [a, leadId, ids.bdm, ready],
    )
  ).rows[0];
  if (ready)
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
  await actor(ids.bdm);
  return v;
}
async function accept(primary = ids.designer, historicalOps: string[] = []) {
  await actor(ids.lead);
  const project = (
    await db.query<{ id: string }>(
      "select public.review_lead($1,1,'Accepted','',$2,'{}','{}'::uuid[],null) as id",
      [leadId, primary],
    )
  ).rows[0].id;
  // Test-only grandfathered membership fixture: new conversions cannot assign Ops.
  // Existing project assignments remain supported by the revised workflow.
  if (historicalOps.length) {
    await db.exec("reset role");
    for (const ops of historicalOps)
      await db.query(
        "insert into public.project_memberships(project_id,user_id,membership_role) values($1,$2,'operations_admin')",
        [project, ops],
      );
    await actor(ids.lead);
  }
  return project;
}
beforeAll(async () => {
  db = new PGlite();
  // Test-only Auth shim: PostgreSQL/RLS/RPC code is real; GoTrue authentication is not simulated as verified.
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',invited_at timestamptz,last_sign_in_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.exec(
    "create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated; ",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (const [name, id] of Object.entries(ids)) {
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, JSON.stringify({ full_name: name, role: "system_administrator" })],
    );
    const role =
      name === "admin"
        ? "system_administrator"
        : name === "bdm" || name === "otherBdm"
          ? "bdm"
          : name === "lead"
            ? "lead_designer"
            : name === "ops"
              ? "operations_admin"
              : "designer";
    await db.query(
      "update public.profiles set role=$1::public.app_role,active=true where id=$2",
      [role, id],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("reset role; begin;");
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
afterAll(async () => {
  await db.close();
});
describe("Phase 1 PostgreSQL integration", () => {
  it("new identities cannot assign their own role through metadata", async () => {
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [
        leadId,
        JSON.stringify({
          full_name: "New account",
          role: "system_administrator",
        }),
      ],
    );
    const r = await db.query<{ role: string; active: boolean }>(
      "select role,active from public.profiles where id=$1",
      [leadId],
    );
    expect(r.rows[0]).toEqual({ role: "designer", active: false });
  });
  it("persists submission, identity, snapshot, notification and audit atomically", async () => {
    await submit();
    const l = await db.query<{
      bdm_id: string;
      status: string;
      submission_count: number;
    }>("select bdm_id,status,submission_count from public.leads");
    expect(l.rows[0]).toEqual({
      bdm_id: ids.bdm,
      status: "Submitted",
      submission_count: 1,
    });
    expect(
      (await db.query("select * from public.lead_submissions")).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
    expect(
      (await db.query("select * from public.notifications")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.audit_events where action='lead.submitted'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects invalid cabinet counts without leaving a partial lead", async () => {
    await actor(ids.bdm);
    await expect(
      db.query("select public.save_lead($1,0,$2,true,'')", [
        leadId,
        { ...payload, cabinetry_count: 0 },
      ]),
    ).rejects.toThrow();
  });
  it("rejects missing optimistic version and impersonated ownership", async () => {
    await submit();
    await actor(ids.otherBdm);
    await expect(
      db.query("select public.save_lead($1,null,$2,false,'')", [
        leadId,
        payload,
      ]),
    ).rejects.toThrow();
  });
  it("BDM cannot read other BDM leads or submission history", async () => {
    await submit();
    await actor(ids.otherBdm);
    expect((await db.query("select * from public.leads")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from public.lead_submissions")).rows,
    ).toHaveLength(0);
  });
  it("requires a reason for returned and rejected leads", async () => {
    await submit();
    await actor(ids.lead);
    await expect(
      db.query("select public.review_lead($1,1,'Rejected','')", [leadId]),
    ).rejects.toThrow("REMARKS_REQUIRED");
  });
  it("preserves return, resubmission and review history", async () => {
    await submit();
    await actor(ids.lead);
    await db.query(
      "select public.review_lead($1,1,'Returned for Clarification','Clarify address')",
      [leadId],
    );
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,2,$2,true,'')", [
      leadId,
      { ...payload, address: "Clarified address" },
    ]);
    expect(
      (await db.query("select * from public.lead_submissions order by number"))
        .rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from public.lead_reviews")).rows,
    ).toHaveLength(1);
  });
  it("accepts exactly once and keeps all assignments without fabricating spaces", async () => {
    await submit();
    const project = await accept(ids.lead);
    await actor(ids.lead);
    const retry = await db.query<{ id: string }>(
      "select public.review_lead($1,1,'Accepted','',$2) as id",
      [leadId, ids.lead],
    );
    expect(retry.rows[0].id).toBe(project);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      1,
    );
    expect(
      (await db.query("select * from public.project_origins")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.project_assignment_events")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.project_memberships")).rows,
    ).toHaveLength(3);
    expect((await db.query("select * from public.spaces")).rows).toHaveLength(
      0,
    );
  });
  it("rolls back a conversion when the Designer assignment is invalid", async () => {
    await submit();
    await actor(ids.lead);
    // Use a savepoint to prove absence of partial records after the failed RPC.
    await db.exec("savepoint bad_accept");
    await expect(
      db.query("select public.review_lead($1,1,'Accepted','',$2)", [
        leadId,
        ids.ops,
      ]),
    ).rejects.toThrow("INVALID_ASSIGNEE");
    await db.exec("rollback to savepoint bad_accept");
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query<{ status: string }>("select status from public.leads"))
        .rows[0].status,
    ).toBe("Submitted");
  });
  it("Operations Admin sees pipeline metadata but not lead, origin, team, or assignment history", async () => {
    await submit();
    const p = await accept(ids.designer, [ids.ops]);
    await actor(ids.ops);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      1,
    );
    for (const table of [
      "leads",
      "lead_submissions",
      "project_origins",
      "project_assignment_events",
    ])
      expect(
        (await db.query(`select * from public.${table}`)).rows,
      ).toHaveLength(0);
    await expect(
      db.query("select * from public.project_team($1)", [p]),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("unassigned Designers cannot guess a project ID to read its team", async () => {
    await submit();
    const p = await accept();
    await actor(ids.stranger);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query("select * from public.project_team($1)", [p]),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("requires duplicate override and never exposes other BDM matches", async () => {
    await submit();
    await actor(ids.otherBdm);
    expect(
      (
        await db.query("select * from public.find_duplicate_leads($1,$2)", [
          payload.project_name,
          payload.address,
        ])
      ).rows,
    ).toHaveLength(0);
    await actor(ids.bdm);
    await expect(
      db.query("select public.save_lead($1,0,$2,true,'')", [
        ids.stranger,
        payload,
      ]),
    ).rejects.toThrow("DUPLICATE_REASON_REQUIRED");
  });
  it("disallows direct writes and non-reviewer conversion RPC calls", async () => {
    await submit();
    await expect(
      db.query("select public.review_lead($1,1,'Accepted','',$2)", [
        leadId,
        ids.designer,
      ]),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("deactivation denies existing authenticated identities immediately", async () => {
    await submit();
    await actor(ids.admin);
    await db.query(
      "select public.update_user_access($1,'bdm',false,'BDM','Account deactivated')",
      [ids.bdm],
    );
    await actor(ids.bdm);
    expect((await db.query("select * from public.leads")).rows).toHaveLength(0);
    await expect(
      db.query("select public.save_lead($1,0,$2,false,'')", [
        ids.stranger,
        payload,
      ]),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("administrator cannot remove their own administrative access", async () => {
    await actor(ids.admin);
    await expect(
      db.query(
        "select public.update_user_access($1,'designer',true,'Admin','Change')",
        [ids.admin],
      ),
    ).rejects.toThrow("SELF_ACCESS_CHANGE_DENIED");
  });
  it("attachment metadata never claims a completed upload", async () => {
    await actor(ids.bdm);
    await expect(
      db.query("select public.save_lead($1,0,$2,true,'')", [
        leadId,
        {
          ...payload,
          attachment_metadata: [
            {
              name: "plan.pdf",
              size: 100,
              mime_type: "application/pdf",
              state: "uploaded",
            },
          ],
        },
      ]),
    ).rejects.toThrow("INVALID_ATTACHMENT_METADATA");
  });
  it("submitted snapshots remain immutable even for database maintenance roles", async () => {
    await submit();
    await db.exec("reset role");
    await expect(
      db.query("update public.lead_submissions set snapshot='{}'"),
    ).rejects.toThrow("append-only");
  });
  it("authenticated users cannot bypass RPCs with direct business writes", async () => {
    await actor(ids.bdm);
    await expect(
      db.query("insert into public.leads(id,bdm_id) values($1,$2)", [
        leadId,
        ids.bdm,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("reassignment preserves history and immediately removes the old Designer's scope", async () => {
    await submit();
    const project = await accept();
    await actor(ids.lead);
    await db.query(
      "select public.assign_project_personnel($1,$2,'{}','{}','Staffing update')",
      [project, ids.stranger],
    );
    expect(
      (
        await db.query(
          "select * from public.project_assignment_events where project_id=$1",
          [project],
        )
      ).rows,
    ).toHaveLength(2);
    await actor(ids.designer);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      0,
    );
    await actor(ids.stranger);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      1,
    );
  });
  it("commercially Closed projects may await an Operations assignment", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.lead);
    await db.query(
      "select public.assign_project_personnel($1,$2,'{}','{}','Remove Ops')",
      [project, ids.designer],
    );
    expect(
      (
        await db.query(
          "select user_id from public.project_memberships where project_id=$1 and membership_role='operations_admin'",
          [project],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("notification read updates are scoped to the active recipient", async () => {
    await submit();
    await actor(ids.lead);
    const notice = (
      await db.query<{ id: string }>("select id from public.notifications")
    ).rows[0].id;
    await db.query("select public.mark_notification_read($1)", [notice]);
    expect(
      (
        await db.query<{ read_at: unknown }>(
          "select read_at from public.notifications where id=$1",
          [notice],
        )
      ).rows[0].read_at,
    ).toBeTruthy();
    await actor(ids.bdm);
    await expect(
      db.query("select public.mark_notification_read($1)", [notice]),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("storage upload reservations require actual ownership and enforce plan limits", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      payload,
    ]);
    await actor(ids.otherBdm);
    await expect(
      db.query(
        "select public.reserve_attachment(null,$1,null,'general','plan.pdf','application/pdf',10)",
        [leadId],
      ),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("rejects a 100 MiB reservation on the current 50 MiB bucket", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      payload,
    ]);
    await expect(
      db.query(
        "select public.reserve_attachment(null,$1,null,'general','plan.pdf','application/pdf',104857600)",
        [leadId],
      ),
    ).rejects.toThrow("STORAGE_SIZE_LIMIT");
  });
  it("only accepts reserved object paths and verifies size before completion", async () => {
    const project = await spaceProject();
    const v = (
      await db.query<{ v: { id: string; object_path: string } }>(
        "select public.reserve_attachment(null,null,$1,'general','plan.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
    await db.query("select public.complete_attachment($1)", [v.id]);
    expect(
      (
        await db.query<{ actual_size: number }>(
          "select actual_size from public.attachment_versions where id=$1",
          [v.id],
        )
      ).rows[0].actual_size,
    ).toBe(10);
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments','projects/guessed/path','{\"size\":10}')",
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot mark a missing storage object as uploaded", async () => {
    const project = await spaceProject();
    const v = (
      await db.query<{ v: { id: string } }>(
        "select public.reserve_attachment(null,null,$1,'general','plan.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await expect(
      db.query("select public.complete_attachment($1)", [v.id]),
    ).rejects.toThrow("STORAGE_OBJECT_NOT_VERIFIED");
  });
  it("replacement reserves a new path and archive/restore retain bytes and history", async () => {
    const project = await spaceProject();
    type V = { id: string; attachment_id: string; object_path: string };
    const v = (
      await db.query<{ v: V }>(
        "select public.reserve_attachment(null,null,$1,'general','plan.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
    await db.query("select public.complete_attachment($1)", [v.id]);
    const replacement = (
      await db.query<{ v: V }>(
        "select public.reserve_attachment($1,null,null,'general','renamed.pdf','application/pdf',10) as v",
        [v.attachment_id],
      )
    ).rows[0].v;
    expect(replacement.object_path).not.toBe(v.object_path);
    expect(replacement.attachment_id).toBe(v.attachment_id);
    expect(
      (await db.query("update storage.objects set metadata='{}' returning *"))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from storage.objects returning *")).rows,
    ).toHaveLength(0);
    await db.query(
      "select public.archive_attachment($1,true,'Replaced brief')",
      [v.attachment_id],
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await db.query(
      "select public.archive_attachment($1,false,'Restore brief')",
      [v.attachment_id],
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    expect(
      (await db.query("select * from public.attachment_versions")).rows,
    ).toHaveLength(2);
  });
  it("Ops is denied restricted files before and after closure", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    await actor(ids.lead);
    const v = (
      await db.query<{ v: { id: string; object_path: string } }>(
        "select public.reserve_attachment(null,null,$1,'design','plan.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
    await db.query("select public.complete_attachment($1)", [v.id]);
    await actor(ids.ops);
    expect(
      (await db.query("select * from public.attachments")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
  it("project attachment limit serializes three reservations", async () => {
    const project = await spaceProject();
    for (let i = 0; i < 3; i++)
      await db.query(
        "select public.reserve_attachment(null,null,$1,'general','plan.pdf','application/pdf',10)",
        [project],
      );
    await expect(
      db.query(
        "select public.reserve_attachment(null,null,$1,'general','sixth.pdf','application/pdf',10)",
        [project],
      ),
    ).rejects.toThrow("ATTACHMENT_COUNT_LIMIT");
  });
  it("completion rejects provider-reported size differing from the reservation", async () => {
    const project = await spaceProject();
    const v = (
      await db.query<{ v: { id: string; object_path: string } }>(
        "select public.reserve_attachment(null,null,$1,'general','plan.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":9}')",
      [v.object_path],
    );
    await expect(
      db.query("select public.complete_attachment($1)", [v.id]),
    ).rejects.toThrow("STORAGE_OBJECT_NOT_VERIFIED");
  });
  it("assigned Ops can access only operations-class files after commercial closure", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    const v = (
      await db.query<{ v: { id: string; object_path: string } }>(
        "select public.reserve_attachment(null,null,$1,'operations','delivery.pdf','application/pdf',10) as v",
        [project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
    await db.query("select public.complete_attachment($1)", [v.id]);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    await actor(ids.designer);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
});

const spaceId = "30000000-0000-4000-8000-000000000001";
const secondSpace = "30000000-0000-4000-8000-000000000002";
async function spaceProject() {
  await submit();
  return accept(ids.designer, [ids.ops]);
}
async function createSpace(
  project: string,
  id = spaceId,
  primary = ids.designer,
  support: string[] = [],
) {
  return db.query(
    "select public.save_space($1,$2,0,'Kitchen',null,$3,$4::uuid[],'Initial design scope')",
    [id, project, primary, support],
  );
}
async function status(
  value: string,
  version: number,
  id = spaceId,
  approval = "",
) {
  return db.query(
    "select public.change_space_status($1,$2,$3::public.space_design_status,'Design review',$4)",
    [id, version, value, approval],
  );
}
async function denied(action: () => Promise<unknown>, message: string) {
  await db.exec("savepoint denied");
  await expect(action()).rejects.toThrow(message);
  await db.exec("rollback to savepoint denied");
}
describe("Phase 2B PostgreSQL integration", () => {
  it("creates duplicate names with distinct IDs and preserves editing/assignment history", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await createSpace(project, secondSpace, ids.lead, [ids.designer]);
    expect(
      (await db.query("select id from public.spaces where name='Kitchen'"))
        .rows,
    ).toHaveLength(2);
    await db.query(
      "select public.save_space($1,$2,1,'Kitchen revised','2026-11-01',$3,'{}','Deadline confirmed')",
      [spaceId, project, ids.designer],
    );
    const events = await db.query<{
      previous_value: { name: string };
      new_value: { primary_assigned_at: string };
    }>(
      "select previous_value,new_value from public.space_events where space_id=$1 order by previous_value nulls first",
      [spaceId],
    );
    expect(events.rows).toHaveLength(2);
    expect(events.rows[1].previous_value.name).toBe("Kitchen");
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select * from public.audit_events where entity_type='space'",
        )
      ).rows,
    ).toHaveLength(3);
  });
  it("rejects missing primary, supporting duplicates and people outside the project", async () => {
    const project = await spaceProject();
    await denied(
      () => createSpace(project, spaceId, ids.stranger),
      "INVALID_ASSIGNMENTS",
    );
    await denied(
      () => createSpace(project, spaceId, ids.designer, [ids.designer]),
      "INVALID_ASSIGNMENTS",
    );
    await denied(
      () =>
        createSpace(project, spaceId, ids.lead, [ids.designer, ids.designer]),
      "INVALID_ASSIGNMENTS",
    );
  });
  it("project Designers read all spaces but modify only assigned spaces; BDM is read-only", async () => {
    const project = await spaceProject();
    await createSpace(project, spaceId, ids.lead);
    await actor(ids.designer);
    expect((await db.query("select * from public.spaces")).rows).toHaveLength(
      1,
    );
    await denied(() => status("In Progress", 1), "ACCESS_DENIED");
    await denied(() => createSpace(project, secondSpace), "ACCESS_DENIED");
    await actor(ids.bdm);
    expect((await db.query("select * from public.spaces")).rows).toHaveLength(
      1,
    );
    await denied(() => status("In Progress", 1), "ACCESS_DENIED");
  });
  it("assigned Designer edits metadata and supporting Designer updates status but cannot reassign", async () => {
    const project = await spaceProject();
    await createSpace(project, spaceId, ids.lead, [ids.designer]);
    await actor(ids.designer);
    await db.query(
      "select public.save_space($1,$2,1,'Kitchen edited',null,$3,$4::uuid[],'Designer correction')",
      [spaceId, project, ids.lead, [ids.designer]],
    );
    await status("In Progress", 2);
    await denied(
      () =>
        db.query(
          "select public.save_space($1,$2,3,'Kitchen',null,$3,'{}','Take ownership')",
          [spaceId, project, ids.designer],
        ),
      "ACCESS_DENIED",
    );
  });
  it("Lead completion requires Submitted and external approval; Designers cannot complete", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await denied(
      () => status("Completed", 1, spaceId, "Client approval"),
      "INVALID_TRANSITION",
    );
    await actor(ids.designer);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await denied(
      () => status("Completed", 3, spaceId, "Client approval"),
      "ACCESS_DENIED",
    );
    await actor(ids.lead);
    await denied(() => status("Completed", 3), "ACCESS_DENIED");
    await status("Completed", 3, spaceId, "External approval 001");
    expect(
      (await db.query<{ status: string }>("select status from public.spaces"))
        .rows[0].status,
    ).toBe("Completed");
  });
  it("reopens completion for revision while preserving prior completion and history", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await status("Completed", 3, spaceId, "Client approval");
    const previous = (
      await db.query<{ first_completed_at: string }>(
        "select first_completed_at from public.spaces",
      )
    ).rows[0].first_completed_at;
    await status("For Revision", 4);
    await actor(ids.designer);
    await status("Submitted", 5);
    await actor(ids.lead);
    await status("Completed", 6, spaceId, "Second client approval");
    const s = (
      await db.query<{ revision_number: number; first_completed_at: string }>(
        "select revision_number,first_completed_at from public.spaces",
      )
    ).rows[0];
    expect(s).toEqual({ revision_number: 1, first_completed_at: previous });
    expect(
      (
        await db.query(
          "select * from public.space_events where new_value->>'status'='Completed'",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("records administrator overrides and resumes held state without changing deadlines", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await actor(ids.admin);
    await status("Completed", 1);
    const event = (
      await db.query<{ new_value: { administrator_override: boolean } }>(
        "select new_value from public.space_events where action='space.status_changed'",
      )
    ).rows[0];
    expect(event.new_value.administrator_override).toBe(true);
    await status("For Revision", 2);
    await actor(ids.designer);
    await status("On Hold", 3);
    await denied(() => status("Submitted", 4), "INVALID_TRANSITION");
    await status("For Revision", 4);
  });
  it("bulk reassignment is atomic on stale or cross-project selections and retains previous assignees", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await createSpace(project, secondSpace);
    const bulk = (versions: number[]) =>
      db.query(
        "select public.bulk_reassign_spaces($1,$2::jsonb,$3,$4::uuid[],'Workload rebalance')",
        [
          project,
          JSON.stringify([
            { id: spaceId, version: versions[0] },
            { id: secondSpace, version: versions[1] },
          ]),
          ids.lead,
          [ids.designer],
        ],
      );
    await denied(() => bulk([1, 99]), "VERSION_CONFLICT");
    expect(
      (
        await db.query<{ version: number }>("select version from public.spaces")
      ).rows.map((s) => s.version),
    ).toEqual([1, 1]);
    await bulk([1, 1]);
    expect(
      (
        await db.query<{ primary_designer_id: string }>(
          "select primary_designer_id from public.spaces",
        )
      ).rows.map((s) => s.primary_designer_id),
    ).toEqual([ids.lead, ids.lead]);
    expect(
      (
        await db.query(
          "select * from public.space_events where previous_value->>'primary_designer_id'=$1",
          [ids.designer],
        )
      ).rows,
    ).toHaveLength(2);
    await actor(ids.designer);
    await denied(() => bulk([2, 2]), "ACCESS_DENIED");
  });
  it("cancellation requires a reason, preserves records, excludes active scope and freezes edits", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await denied(
      () => db.query("select public.cancel_space($1,1,'')", [spaceId]),
      "VALIDATION_ERROR",
    );
    await db.query(
      "select public.cancel_space($1,1,'Scope removed by client')",
      [spaceId],
    );
    expect(
      (await db.query("select * from public.spaces where cancelled_at is null"))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.space_events")).rows,
    ).toHaveLength(2);
    await denied(() => status("In Progress", 2), "SPACE_CANCELLED");
    await db.exec("reset role");
    await denied(
      () => db.query("delete from public.space_events"),
      "Audit events are append-only",
    );
  });
  it("denies cross-project, inactive actors, direct writes and Operations design preview", async () => {
    const project = await spaceProject();
    await createSpace(project);
    for (const user of [ids.ops, ids.otherBdm, ids.stranger]) {
      await actor(user);
      expect((await db.query("select * from public.spaces")).rows).toHaveLength(
        0,
      );
      expect(
        (await db.query("select * from public.space_events")).rows,
      ).toHaveLength(0);
      await denied(() => status("In Progress", 1), "ACCESS_DENIED");
    }
    await actor(ids.lead);
    await denied(
      () => db.query("update public.spaces set name='Direct edit'"),
      "permission denied",
    );
    await denied(
      () =>
        db.query(
          "select public.save_space($1,$2,1,'Wrong project',null,$3,'{}','Cross project')",
          [spaceId, leadId, ids.designer],
        ),
      "ACCESS_DENIED",
    );
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.designer,
    ]);
    await actor(ids.designer);
    await denied(() => status("In Progress", 1), "ACCESS_DENIED");
  });
  it("bulk rejects a space from another project without changing either project", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const anotherLead = "20000000-0000-4000-8000-000000000002";
    await actor(ids.bdm);
    await db.query(
      "select public.save_lead($1,0,$2::jsonb,true,'Distinct staging scope')",
      [
        anotherLead,
        JSON.stringify({
          ...payload,
          project_name: "Second project",
          address: "Second address",
        }),
      ],
    );
    await actor(ids.lead);
    const other = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,1,'Accepted','',$2) id",
        [anotherLead, ids.designer],
      )
    ).rows[0].id;
    await createSpace(other, secondSpace);
    await denied(
      () =>
        db.query(
          "select public.bulk_reassign_spaces($1,$2::jsonb,$3,'{}','Cross project')",
          [
            project,
            JSON.stringify([
              { id: spaceId, version: 1 },
              { id: secondSpace, version: 1 },
            ]),
            ids.lead,
          ],
        ),
      "ACCESS_DENIED",
    );
    expect(
      (
        await db.query<{ version: number }>("select version from public.spaces")
      ).rows.map((s) => s.version),
    ).toEqual([1, 1]);
  });
});

async function activity(
  project: string,
  id: string,
  version = 0,
  category = "Design Work",
  space: string | null = spaceId,
  description = "Actual design work",
) {
  return db.query(
    "select public.save_project_activity($1,$2,$3,$4,$5,current_date,$6,null,'{}','Verified activity')",
    [id, project, version, space, category, description],
  );
}
describe("Phase 2C PostgreSQL integration", () => {
  it("summarizes active completions and revised/cancelled spaces without changing commercial stage", async () => {
    const project = await spaceProject();
    expect(
      (
        await db.query<{ v: { active_spaces: number }[] }>(
          "select public.monitoring_summary(array[$1::uuid]) v",
          [project],
        )
      ).rows[0].v[0].active_spaces,
    ).toBe(0);
    await createSpace(project);
    await createSpace(project, secondSpace);
    await actor(ids.admin);
    await status("Completed", 1);
    let summary = (
      await db.query<{
        v: { active_spaces: number; completed_spaces: number }[];
      }>("select public.monitoring_summary(array[$1::uuid]) v", [project])
    ).rows[0].v[0];
    expect(summary.completed_spaces).toBe(1);
    await status("For Revision", 2);
    await db.query("select public.cancel_space($1,1,'Removed scope')", [
      secondSpace,
    ]);
    summary = (
      await db.query<{
        v: { active_spaces: number; completed_spaces: number }[];
      }>("select public.monitoring_summary(array[$1::uuid]) v", [project])
    ).rows[0].v[0];
    expect(summary.active_spaces).toBe(1);
    expect(summary.completed_spaces).toBe(0);
    expect(
      (
        await db.query<{ commercial_status: string }>(
          "select commercial_status from public.projects",
        )
      ).rows[0].commercial_status,
    ).toBe("For Quotation");
  });
  it("holds/resumes atomically, rejects duplicate holds, retains deadlines and status, freezes cancelled workload", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await db.query(
      "select public.revise_project_deadline($1,1,'2026-11-01','Asia/Manila','Client deadline')",
      [project],
    );
    await db.query(
      "select public.control_project($1,2,'Hold','Client pause')",
      [project],
    );
    await denied(
      () =>
        db.query("select public.control_project($1,3,'Hold','Duplicate')", [
          project,
        ]),
      "INVALID_TRANSITION",
    );
    await denied(() => status("In Progress", 1), "PROJECT_ON_HOLD");
    await db.query(
      "select public.control_project($1,3,'Resume','Work resumes')",
      [project],
    );
    await db.query(
      "select public.control_project($1,4,'Hold','Second pause')",
      [project],
    );
    await db.query(
      "select public.control_project($1,5,'Cancel','Client cancels')",
      [project],
    );
    expect(
      (
        await db.query(
          "select * from public.project_holds where ended_at is not null",
        )
      ).rows,
    ).toHaveLength(2);
    const m = (
      await db.query<{ deadline: string; state: string }>(
        "select deadline::text,state from public.project_monitoring",
      )
    ).rows[0];
    expect(m).toEqual({ deadline: "2026-11-01", state: "Cancelled" });
    expect(
      (
        await db.query<{ is_cancelled: boolean }>(
          "select is_cancelled from public.projects",
        )
      ).rows[0].is_cancelled,
    ).toBe(true);
    await denied(() => createSpace(project, secondSpace), "PROJECT_CANCELLED");
    expect((await db.query("select * from public.spaces")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query(
          "select * from public.project_operational_cycles where outcome='Cancelled'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("retains original space deadline, work start and completed revision history across edits/reassignment", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await status("Completed", 3, spaceId, "Client approval");
    await status("For Revision", 4);
    const before = (
      await db.query<{ work_started_at: string; cycle_started_at: string }>(
        "select work_started_at,cycle_started_at from public.spaces",
      )
    ).rows[0];
    await db.query(
      "select public.save_space($1,$2,5,'Kitchen','2026-11-15',$3,'{}','Deadline correction and reassignment')",
      [spaceId, project, ids.lead],
    );
    const after = (
      await db.query<{
        work_started_at: string;
        cycle_started_at: string;
        original_deadline: null;
      }>(
        "select work_started_at,cycle_started_at,original_deadline from public.spaces",
      )
    ).rows[0];
    expect(after).toEqual({ ...before, original_deadline: null });
    expect(
      (
        await db.query(
          "select * from public.space_events where previous_value->>'status'='Completed'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("creates and corrects manual activities with immutable versions and categorized timeline filters", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = "50000000-0000-4000-8000-000000000001";
    await actor(ids.designer);
    await activity(project, id);
    await activity(project, id, 1, "Revision", spaceId, "Corrected findings");
    expect(
      (await db.query("select * from public.project_activity_versions")).rows,
    ).toHaveLength(2);
    const t = (
      await db.query<{ v: { description: string }[] }>(
        "select public.project_timeline($1,'Revision',current_date,current_date,$2,$3) v",
        [project, ids.designer, spaceId],
      )
    ).rows[0].v;
    expect(t).toHaveLength(1);
    expect(t[0].description).toBe("Corrected findings");
    await db.exec("reset role");
    await denied(
      () =>
        db.query(
          "update public.project_activity_versions set reason='Rewrite'",
        ),
      "Audit events are append-only",
    );
  });
  it("protects cross-role activity categories and Ops monitoring until commercial closure", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await activity(project, "50000000-0000-4000-8000-000000000001");
    await activity(
      project,
      "50000000-0000-4000-8000-000000000002",
      0,
      "General Update",
      null,
    );
    await actor(ids.bdm);
    expect(
      (await db.query("select * from public.project_activities")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ v: { category: string }[] }>(
          "select public.project_timeline($1) v",
          [project],
        )
      ).rows[0].v.filter((e) => e.category === "Design Work"),
    ).toHaveLength(0);
    await denied(
      () => activity(project, "50000000-0000-4000-8000-000000000003"),
      "ACCESS_DENIED",
    );
    for (const who of [ids.ops, ids.stranger, ids.otherBdm]) {
      await actor(who);
      expect(
        (await db.query("select * from public.project_monitoring")).rows,
      ).toHaveLength(0);
      await denied(
        () => db.query("select public.project_timeline($1)", [project]),
        "ACCESS_DENIED",
      );
    }
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    expect(
      (await db.query("select * from public.project_monitoring")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.project_activities")).rows,
    ).toHaveLength(1);
    await activity(
      project,
      "50000000-0000-4000-8000-000000000003",
      0,
      "Supplier Update",
      null,
    );
    await denied(
      () =>
        db.query("select public.control_project($1,1,'Hold','Ops attempt')", [
          project,
        ]),
      "ACCESS_DENIED",
    );
  });
  it("denies wrong-space activities, forged file references, direct writes and stale corrections", async () => {
    const project = await spaceProject();
    await createSpace(project, spaceId, ids.lead);
    await actor(ids.designer);
    await denied(
      () => activity(project, "50000000-0000-4000-8000-000000000001"),
      "ACCESS_DENIED",
    );
    await activity(
      project,
      "50000000-0000-4000-8000-000000000001",
      0,
      "Design Work",
      null,
    );
    await denied(
      () =>
        activity(
          project,
          "50000000-0000-4000-8000-000000000001",
          0,
          "Design Work",
          null,
        ),
      "VERSION_CONFLICT",
    );
    await denied(
      () =>
        db.query(
          "select public.save_project_activity($1,$2,0,null,'Design Work',current_date,'Forged file',null,$3::uuid[],'Reason')",
          ["50000000-0000-4000-8000-000000000002", project, [leadId]],
        ),
      "ACCESS_DENIED",
    );
    await denied(
      () => db.query("update public.project_monitoring set state='Cancelled'"),
      "permission denied",
    );
  });
  it("maintains tagged reference coordinators and immutable completed operational cycles for future reopen workflows", async () => {
    const project = await spaceProject();
    const c = (
      await db.query<{ id: string }>(
        "select public.add_site_coordinator($1,'Reference Coordinator','Site oversight') id",
        [project],
      )
    ).rows[0].id;
    await db.query(
      "select public.save_project_activity($1,$2,0,null,'Site Visit',current_date,'Site findings',$3,'{}','Logged on behalf')",
      ["50000000-0000-4000-8000-000000000001", project, c],
    );
    await db.exec("reset role");
    await db.query(
      "update public.project_operational_cycles set ended_at=now(),outcome='Completed' where project_id=$1",
      [project],
    );
    await denied(
      () =>
        db.query(
          "update public.project_operational_cycles set ended_at=now()+interval '1 day' where project_id=$1",
          [project],
        ),
      "Historical intervals are immutable",
    );
    await actor(ids.lead);
    await db.query(
      "select public.control_project($1,1,'Reopen','Client requests additional work')",
      [project],
    );
    await denied(
      () =>
        db.query(
          "select public.control_project($1,2,'Reopen','Duplicate cycle')",
          [project],
        ),
      "INVALID_TRANSITION",
    );
    expect(
      (await db.query("select * from public.project_operational_cycles")).rows,
    ).toHaveLength(2);
  });
});

// Phase 3A: exact money and authorization are exercised by real PostgreSQL RPCs/RLS.
const quoteItem = (
  id = "40000000-0000-4000-8000-000000000001",
  quantity = "1",
  unit_price = "0.10",
) => ({ id, description: "Cabinet", quantity, unit_price });
async function draft(project: string) {
  return (
    await db.query<{ id: string }>(
      "select public.create_quotation_draft($1) id",
      [project],
    )
  ).rows[0].id;
}
async function quote(project: string) {
  return (
    await db.query<{
      value: import("../../src/lib/quotations").Quotation | null;
    }>("select public.get_project_quotation($1) value", [project])
  ).rows[0].value;
}
async function saveQuote(
  id: string,
  items: unknown[],
  version = 1,
  space = spaceId,
) {
  return db.query(
    "select public.save_quotation_space($1,$2,$3,$4::jsonb,'Pricing correction')",
    [id, space, version, JSON.stringify(items)],
  );
}
describe("Phase 3A quotation integration", () => {
  it("creates one empty draft, rounds lines before summing and preserves duplicate spaces", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await createSpace(project, secondSpace);
    const id = await draft(project);
    expect(await draft(project)).toBe(id);
    expect((await quote(project))?.total).toBe("0");
    const a = quoteItem(),
      b = quoteItem("40000000-0000-4000-8000-000000000002", "0.005", "1.00");
    await saveQuote(id, [{ ...a, line_amount: "999.00" }, b]);
    await saveQuote(
      id,
      [quoteItem("40000000-0000-4000-8000-000000000003", "1", "0.20")],
      2,
      secondSpace,
    );
    const value = await quote(project);
    expect(value?.total).toBe("0.31");
    expect(value?.spaces.map((s) => s.name)).toEqual(["Kitchen", "Kitchen"]);
    expect(value?.spaces[0].items[1].line_amount).toBe("0.01");
  });
  it("edits/reorders stable IDs, soft removes items and appends immutable audit snapshots", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = await draft(project);
    const a = quoteItem(),
      b = quoteItem("40000000-0000-4000-8000-000000000002");
    await saveQuote(id, [a, b]);
    await saveQuote(
      id,
      [{ ...b, description: "Revised cabinet", unit_price: "2.20" }, a],
      2,
    );
    expect((await quote(project))?.spaces[0].items.map((i) => i.id)).toEqual([
      b.id,
      a.id,
    ]);
    await saveQuote(id, [b], 3);
    await saveQuote(id, [], 4);
    expect((await quote(project))?.total).toBe("0");
    expect(
      (
        await db.query(
          "select id from public.quotation_items where removed_at is not null",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select id from public.quotation_draft_events")).rows,
    ).toHaveLength(4);
    await denied(() => saveQuote(id, [a], 5), "INVALID_ITEMS");
    await db.exec("reset role");
    await denied(
      () => db.exec("delete from public.quotation_draft_events"),
      "append-only",
    );
    await denied(
      () => db.exec("delete from public.quotation_items"),
      "HISTORY_IMMUTABLE",
    );
  });
  it("rejects precision, negative/exponent/numeric inputs, duplicate IDs and stale saves atomically", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = await draft(project);
    for (const invalid of [
      { quantity: "-1" },
      { quantity: "0.0001" },
      { unit_price: "1.001" },
      { unit_price: "1e2" },
      { quantity: 1 },
      { description: " " },
      { quantity: null },
    ]) {
      await denied(
        () =>
          saveQuote(id, [
            quoteItem(),
            {
              ...quoteItem("40000000-0000-4000-8000-000000000002"),
              ...invalid,
            },
          ]),
        "INVALID_ITEMS",
      );
    }
    await denied(
      () => saveQuote(id, [quoteItem(), quoteItem()]),
      "INVALID_ITEMS",
    );
    expect((await quote(project))?.edit_version).toBe(1);
    await saveQuote(id, [quoteItem()]);
    await denied(() => saveQuote(id, [], 1), "VERSION_CONFLICT");
  });
  it("keeps large centavo values exact and denies cross-space identity moves", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await createSpace(project, secondSpace);
    const id = await draft(project);
    await saveQuote(id, [
      quoteItem(undefined, "999999999.999", "999999999999.99"),
    ]);
    expect((await quote(project))?.total).toBe("999999999998990000000.00");
    await denied(
      () => saveQuote(id, [quoteItem()], 2, secondSpace),
      "INVALID_ITEMS",
    );
  });
  it("enforces assigned-space edits, manager oversight and approved-only BDM / no Ops access", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await createSpace(project, secondSpace, ids.lead);
    const id = await draft(project);
    await actor(ids.designer);
    await saveQuote(id, [quoteItem()]);
    await denied(() => saveQuote(id, [], 2, secondSpace), "ACCESS_DENIED");
    expect((await quote(project))?.spaces).toHaveLength(2);
    for (const user of [ids.bdm, ids.ops, ids.stranger, ids.otherBdm]) {
      await actor(user);
      for (const table of [
        "quotations",
        "quotation_versions",
        "quotation_items",
        "quotation_draft_events",
      ])
        expect(
          (await db.query(`select * from public.${table}`)).rows,
        ).toHaveLength(0);
      await denied(() => saveQuote(id, [], 2), "ACCESS_DENIED");
      await denied(() => draft(project), "ACCESS_DENIED");
    }
    await actor(ids.bdm);
    expect(await quote(project)).toBeNull();
    await actor(ids.ops);
    await denied(() => quote(project), "ACCESS_DENIED");
    await actor(ids.admin);
    expect((await quote(project))?.spaces).toHaveLength(2);
    await saveQuote(id, [], 2, secondSpace);
    await denied(
      () => db.query("update public.quotation_items set description='bypass'"),
      "permission denied",
    );
  });
  it("allows metadata editing on Hold, freezes cancelled scope and preserves revision pricing", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = await draft(project);
    await saveQuote(id, [quoteItem()]);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await status("Completed", 3, spaceId, "External approval");
    await status("For Revision", 4);
    expect((await quote(project))?.total).toBe("0.10");
    await db.query("select public.control_project($1,1,'Hold','Client hold')", [
      project,
    ]);
    await saveQuote(id, [quoteItem(undefined, "2")], 2);
    await db.query("select public.cancel_space($1,5,'Scope removed')", [
      spaceId,
    ]);
    expect((await quote(project))?.total).toBe("0");
    expect((await quote(project))?.spaces[0].items[0].line_amount).toBe("0.20");
    await denied(() => saveQuote(id, [], 3), "ACCESS_DENIED");
    await db.query(
      "select public.control_project($1,2,'Cancel','Project stopped')",
      [project],
    );
    await denied(() => draft(project), "PROJECT_CANCELLED");
  });
  it("protects future locked versions and retains approved-only read filtering", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = await draft(project);
    await saveQuote(id, [quoteItem()]);
    await db.query("select public.submit_quotation($1,2,'Pricing ready')", [
      id,
    ]);
    await db.query(
      "select public.review_quotation($1,3,'Approved','Reviewed')",
      [id],
    );
    await db.exec("reset role");
    await denied(
      () => db.exec("update public.quotation_items set unit_price=42"),
      "HISTORY_IMMUTABLE",
    );
    await actor(ids.lead);
    await denied(() => saveQuote(id, [], 2), "HISTORY_IMMUTABLE");
    expect(await draft(project)).not.toBe(id);
    await actor(ids.bdm);
    expect((await quote(project))?.total).toBe("0.10");
    expect(
      (await db.query("select * from public.quotation_draft_events")).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    await denied(() => quote(project), "ACCESS_DENIED");
  });
});
it("quotation support edits require current project membership and cross-project Spaces are rejected", async () => {
  const project = await spaceProject();
  await createSpace(project, spaceId, ids.lead, [ids.designer]);
  const id = await draft(project);
  await actor(ids.designer);
  await saveQuote(id, [quoteItem()]);
  await db.exec("reset role");
  await db.query(
    "delete from public.project_memberships where project_id=$1 and user_id=$2",
    [project, ids.designer],
  );
  await actor(ids.designer);
  await denied(() => saveQuote(id, [], 2), "ACCESS_DENIED");
  const foreignLead = "20000000-0000-4000-8000-000000000002";
  await actor(ids.bdm);
  await db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
    foreignLead,
    JSON.stringify({
      ...payload,
      project_name: "Other quotation scope",
      address: "Other address",
    }),
  ]);
  await actor(ids.lead);
  const other = (
    await db.query<{ id: string }>(
      "select public.review_lead($1,1,'Accepted','',$2,'{}','{}',null) id",
      [foreignLead, ids.designer],
    )
  ).rows[0].id;
  await createSpace(other, secondSpace);
  await actor(ids.admin);
  await denied(() => saveQuote(id, [], 2, secondSpace), "ACCESS_DENIED");
  const events = await db.query<{ actor_id: string }>(
    "select actor_id from public.quotation_draft_events where project_id=$1",
    [project],
  );
  expect(events.rows[0].actor_id).toBe(ids.designer);
});

async function submitQuote(
  id: string,
  version: number,
  remarks = "Ready for review",
) {
  return db.query("select public.submit_quotation($1,$2,$3)", [
    id,
    version,
    remarks,
  ]);
}
async function reviewQuote(
  id: string,
  version: number,
  decision = "Approved",
  remarks = "Reviewed",
) {
  return db.query("select public.review_quotation($1,$2,$3,$4)", [
    id,
    version,
    decision,
    remarks,
  ]);
}
async function versionQuote(project: string, id: string) {
  return (
    await db.query<{ value: import("../../src/lib/quotations").Quotation }>(
      "select public.get_quotation_version($1,$2) value",
      [project, id],
    )
  ).rows[0].value;
}
async function quotationFixture() {
  const project = await spaceProject();
  await createSpace(project);
  await actor(ids.designer);
  const id = await draft(project);
  await saveQuote(id, [quoteItem()]);
  return { project, id };
}
describe("Phase 3B immutable quotation submissions", () => {
  it("freezes complete Spaces/items/decimal totals and creation/submission metadata independently of current Spaces", async () => {
    const { project, id } = await quotationFixture();
    await submitQuote(id, 2);
    const submitted = await versionQuote(project, id);
    expect(submitted.state).toBe("Submitted for Review");
    expect(submitted.submitted_by).toBe(ids.designer);
    expect(submitted.created_by).toBe(ids.designer);
    expect(submitted.submitted_at).toBeTruthy();
    await denied(() => saveQuote(id, [], 3), "HISTORY_IMMUTABLE");
    await denied(() => draft(project), "QUOTATION_PENDING_REVIEW");
    await actor(ids.lead);
    await db.query(
      "select public.save_space($1,$2,1,'Renamed kitchen',null,$3,'{}','Rename after submission')",
      [spaceId, project, ids.designer],
    );
    await createSpace(project, secondSpace);
    await db.query("select public.cancel_space($1,2,'Removed current scope')", [
      spaceId,
    ]);
    const historical = await versionQuote(project, id);
    expect(historical.spaces).toHaveLength(1);
    expect(historical.spaces[0].name).toBe("Kitchen");
    expect(historical.total).toBe("0.10");
    expect(historical.spaces[0].editable).toBe(false);
    await db.exec("reset role");
    await denied(
      () =>
        db.query(
          "update public.quotation_versions set snapshot='{}' where id=$1",
          [id],
        ),
      "HISTORY_IMMUTABLE",
    );
    await denied(
      () => db.query("delete from public.quotation_versions where id=$1", [id]),
      "HISTORY_IMMUTABLE",
    );
    await denied(
      () => db.exec("update public.quotation_items set description='Changed'"),
      "HISTORY_IMMUTABLE",
    );
    await actor(ids.lead);
    await reviewQuote(id, 3);
    await db.exec("reset role");
    await denied(
      () =>
        db.query(
          "update public.quotation_versions set review_remarks='Rewrite decision' where id=$1",
          [id],
        ),
      "HISTORY_IMMUTABLE",
    );
    await actor(ids.bdm);
    const approved = await quote(project);
    expect(approved?.spaces[0].name).toBe("Kitchen");
    expect(approved?.total).toBe("0.10");
  });
  it("returns with mandatory remarks, copies a corrected draft with logical IDs and keeps original snapshot unchanged", async () => {
    const { project, id } = await quotationFixture();
    await submitQuote(id, 2);
    await actor(ids.lead);
    await denied(
      () => reviewQuote(id, 3, "Returned for Revision", " "),
      "REMARKS_REQUIRED",
    );
    await reviewQuote(id, 3, "Returned for Revision", "Please revise quantity");
    const returned = await versionQuote(project, id);
    expect(returned.history?.map((e) => e.action)).toEqual([
      "Submitted for Review",
      "Returned for Revision",
    ]);
    await actor(ids.designer);
    const corrected = await draft(project);
    expect(await draft(project)).toBe(corrected);
    const v2 = await versionQuote(project, corrected);
    expect(v2.number).toBe(2);
    expect(v2.source_version_id).toBe(id);
    const oldItem = returned.spaces[0].items[0],
      copied = v2.spaces[0].items[0];
    expect(copied.id).not.toBe(oldItem.id);
    expect(copied.lineage_id).toBe(oldItem.lineage_id);
    expect(copied.line_amount).toBe("0.10");
    await saveQuote(corrected, [
      { ...copied, quantity: "3", unit_price: "0.20" },
    ]);
    await submitQuote(corrected, 2);
    await denied(() => reviewQuote(corrected, 3), "ACCESS_DENIED");
    await actor(ids.lead);
    await reviewQuote(corrected, 3);
    expect((await versionQuote(project, id)).spaces[0].items[0].quantity).toBe(
      "1.000",
    );
    await actor(ids.bdm);
    expect((await quote(project))?.total).toBe("0.60");
    expect(
      (
        await db.query<{ value: unknown[] }>(
          "select public.list_quotation_versions($1) value",
          [project],
        )
      ).rows[0].value,
    ).toHaveLength(1);
    await denied(() => versionQuote(project, id), "ACCESS_DENIED");
    expect(
      (await db.query("select * from public.quotation_items")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select action from public.quotation_review_events"))
        .rows,
    ).toEqual([{ action: "Approved" }]);
    await actor(ids.ops);
    await denied(() => versionQuote(project, corrected), "ACCESS_DENIED");
  });
  it("uses latest Approved or latest Returned source, sequential numbering and self-review", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const one = await draft(project);
    await saveQuote(one, [quoteItem()]);
    await submitQuote(one, 2);
    await reviewQuote(one, 3);
    const two = await draft(project);
    expect((await versionQuote(project, two)).source_version_id).toBe(one);
    await saveQuote(two, [
      { ...(await quote(project))!.spaces[0].items[0], unit_price: "0.20" },
    ]);
    await submitQuote(two, 2);
    await reviewQuote(two, 3, "Returned for Revision", "Increase detail");
    const three = await draft(project);
    expect((await versionQuote(project, three)).source_version_id).toBe(two);
    expect((await versionQuote(project, three)).total).toBe("0.20");
    await submitQuote(three, 1);
    await reviewQuote(three, 2);
    const four = await draft(project);
    expect((await versionQuote(project, four)).source_version_id).toBe(three);
    expect((await versionQuote(project, four)).number).toBe(4);
    await actor(ids.bdm);
    expect((await quote(project))?.number).toBe(3);
  });
  it("requires creator or manager for full-project submission and manager authority for reviews", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const id = await draft(project);
    await actor(ids.designer);
    await denied(() => submitQuote(id, 1), "ACCESS_DENIED");
    await actor(ids.lead);
    await submitQuote(id, 1);
    await actor(ids.designer);
    await denied(() => reviewQuote(id, 2), "ACCESS_DENIED");
    await actor(ids.bdm);
    await denied(() => submitQuote(id, 2), "ACCESS_DENIED");
    await actor(ids.admin);
    await denied(
      () => reviewQuote(id, 2, "Approved", ""),
      "ADMIN_REASON_REQUIRED",
    );
    await reviewQuote(id, 2, "Approved", "Administrative reviewed correction");
    const events = await db.query<{
      new_value: { administrative_override: boolean };
    }>(
      "select new_value from public.audit_events where entity_id=$1 and action='quotation.reviewed'",
      [id],
    );
    expect(events.rows[0].new_value.administrative_override).toBe(true);
    await denied(() => reviewQuote(id, 2), "VERSION_CONFLICT");
  });
  it("preserves empty complete submissions, permits Hold metadata decisions and freezes cancellation", async () => {
    const project = await spaceProject();
    const id = await draft(project);
    await db.query(
      "select public.control_project($1,1,'Hold','Awaiting design')",
      [project],
    );
    await submitQuote(id, 1);
    expect((await quote(project))?.total).toBe("0");
    expect((await quote(project))?.spaces).toEqual([]);
    await createSpace(project);
    expect((await quote(project))?.spaces).toEqual([]);
    await db.query(
      "select public.control_project($1,2,'Cancel','Cancelled during review')",
      [project],
    );
    await denied(() => reviewQuote(id, 2), "PROJECT_CANCELLED");
  });
  it("excludes currently cancelled Spaces from new copied draft without erasing submitted pricing", async () => {
    const { project, id } = await quotationFixture();
    await submitQuote(id, 2);
    await actor(ids.lead);
    await reviewQuote(id, 3);
    await db.query(
      "select public.cancel_space($1,1,'Cancelled after approval')",
      [spaceId],
    );
    const corrected = await draft(project);
    const current = await versionQuote(project, corrected);
    expect(current.total).toBe("0");
    expect(current.spaces[0].items).toEqual([]);
    expect((await versionQuote(project, id)).total).toBe("0.10");
    await denied(() => saveQuote(corrected, [quoteItem()], 1), "ACCESS_DENIED");
    await denied(
      () =>
        db.query(
          "delete from public.quotation_review_events where version_id=$1",
          [id],
        ),
      "permission denied",
    );
    await db.exec("reset role");
    await denied(
      () =>
        db.query(
          "update public.quotation_review_events set remarks='Rewrite' where version_id=$1",
          [id],
        ),
      "append-only",
    );
  });
});
it("quotation review is limited to the Project manager, and design revisions do not create quotation versions", async () => {
  const { project, id } = await quotationFixture();
  await submitQuote(id, 2);
  await db.exec("reset role");
  await db.query(
    "update public.profiles set role='lead_designer' where id=$1",
    [ids.stranger],
  );
  await db.query(
    "insert into public.project_memberships(project_id,user_id,membership_role,is_primary) values($1,$2,'designer',false)",
    [project, ids.stranger],
  );
  await actor(ids.stranger);
  expect((await versionQuote(project, id)).can_review).toBe(false);
  await denied(() => reviewQuote(id, 3), "ACCESS_DENIED");
  await denied(
    () => versionQuote("50000000-0000-4000-8000-000000000001", id),
    "ACCESS_DENIED",
  );
  await actor(ids.lead);
  await reviewQuote(id, 3);
  await status("In Progress", 1);
  await status("Submitted", 2);
  await status("Completed", 3, spaceId, "External approval");
  await status("For Revision", 4);
  expect(
    (
      await db.query(
        "select id from public.quotation_versions where project_id=$1",
        [project],
      )
    ).rows,
  ).toHaveLength(1);
  expect((await quote(project))?.state).toBe("Approved");
  expect((await quote(project))?.total).toBe("0.10");
});

async function finances(project: string) {
  return (
    await db.query<{ value: import("../../src/lib/finance").Financials }>(
      "select public.get_project_financials($1) value",
      [project],
    )
  ).rows[0].value;
}
async function financialValue(
  project: string,
  kind: string,
  amount: string,
  version = 0,
  reason = "Verified adjustment",
) {
  return db.query("select public.set_financial_value($1,$2,$3,$4,$5)", [
    project,
    kind,
    amount,
    version,
    reason,
  ]);
}
const paymentA = "60000000-0000-4000-8000-000000000001",
  paymentB = "60000000-0000-4000-8000-000000000002";
const paidData = (amount = "10.10") => ({
  payment_date: "2026-01-01",
  amount,
  method: "Bank transfer",
  reference: "Receipt",
  remarks: "Actual staged payment",
});
async function payment(
  project: string,
  id = paymentA,
  kind = "client",
  version = 0,
  data: unknown = paidData(),
  reason = "Payment verification",
  intent = "save",
) {
  return db.query("select public.mutate_payment($1,$2,$3,$4,$5,$6::jsonb,$7)", [
    id,
    project,
    kind,
    version,
    intent,
    JSON.stringify(data),
    reason,
  ]);
}
describe("Phase 3C independent project finances", () => {
  it("distinguishes missing values from zero and keeps quotation/Sale/Raw/commercial stage independent", async () => {
    const project = await spaceProject();
    expect((await finances(project)).sale?.amount).toBeNull();
    expect((await finances(project)).raw?.amount).toBeNull();
    expect((await finances(project)).client_payments.outstanding).toBeNull();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "0", 0, "");
    expect((await finances(project)).sale?.amount).toBe("0.00");
    await actor(ids.lead);
    await financialValue(project, "Raw", "0");
    await payment(project);
    await payment(project, paymentB, "supplier", 0, paidData("20.20"));
    const f = await finances(project);
    expect(f.client_payments.outstanding).toBe("-10.10");
    expect(f.supplier_payments.outstanding).toBe("-20.20");
    expect(f.sale_minus_raw).toBe("0.00");
    expect(f.approved_quotation).toBeNull();
    expect(
      (
        await db.query<{ commercial_status: string }>(
          "select commercial_status from public.projects where id=$1",
          [project],
        )
      ).rows[0].commercial_status,
    ).toBe("For Quotation");
  });
  it("records chronological Sale/Raw revisions with reasons and rejects stale updates atomically", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "100.10");
    await denied(
      () => financialValue(project, "Sale", "200", 1, " "),
      "REASON_REQUIRED",
    );
    await financialValue(project, "Sale", "200.20", 1, "Client adjustment");
    await denied(
      () => financialValue(project, "Sale", "300", 1),
      "VERSION_CONFLICT",
    );
    await actor(ids.lead);
    await financialValue(project, "Raw", "50.05");
    await financialValue(project, "Raw", "70.07", 1, "Cost confirmed");
    const f = await finances(project);
    expect(f.sale?.history.map((e) => e.new_amount)).toEqual([
      "100.10",
      "200.20",
    ]);
    expect(f.raw?.history[1].previous_amount).toBe("50.05");
    expect(f.sale_minus_raw).toBe("130.13");
  });
  it("limits normal Sale changes to primary BDM and redacts Raw-derived values from Designers/supporting BDMs", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "100");
    await actor(ids.lead);
    await financialValue(project, "Raw", "75");
    await denied(
      () => financialValue(project, "Sale", "90", 1),
      "ACCESS_DENIED",
    );
    await db.exec("reset role");
    await db.query(
      "insert into public.project_memberships(project_id,user_id,membership_role,is_primary) values($1,$2,'bdm',false)",
      [project, ids.otherBdm],
    );
    for (const user of [ids.designer, ids.bdm, ids.otherBdm]) {
      await actor(user);
      const f = await finances(project);
      expect(f.sale?.amount).toBe("100.00");
      expect(f).not.toHaveProperty("raw");
      expect(f).not.toHaveProperty("sale_minus_raw");
      expect(f.supplier_payments).not.toHaveProperty("outstanding");
      expect(
        (await db.query("select kind from public.project_financial_values"))
          .rows,
      ).toEqual([{ kind: "Sale" }]);
      await denied(
        () => financialValue(project, "Raw", "1", 1),
        "ACCESS_DENIED",
      );
      await denied(
        () => payment(project, paymentA, "supplier"),
        "ACCESS_DENIED",
      );
      if (user === ids.designer)
        await denied(() => payment(project), "ACCESS_DENIED");
    }
    await actor(ids.otherBdm);
    await denied(
      () => financialValue(project, "Sale", "101", 1),
      "ACCESS_DENIED",
    );
  });
  it("blocks pre-close Ops, then permits assigned Raw/payments while hiding Sale/quotation/derived balances", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "100");
    await actor(ids.lead);
    await financialValue(project, "Raw", "40");
    await actor(ids.ops);
    await denied(() => finances(project), "ACCESS_DENIED");
    await denied(() => payment(project), "ACCESS_DENIED");
    expect(
      (await db.query("select * from public.project_financial_values")).rows,
    ).toEqual([]);
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    await financialValue(project, "Raw", "50", 1);
    await denied(() => payment(project), "ACCESS_DENIED");
    await payment(project, paymentA, "supplier");
    const f = await finances(project);
    expect(f.raw?.amount).toBe("50.00");
    for (const key of [
      "sale",
      "approved_quotation",
      "quotation_vs_sale",
      "sale_minus_raw",
    ])
      expect(f).not.toHaveProperty(key);
    expect(f.client_payments).not.toHaveProperty("outstanding");
    await denied(
      () => financialValue(project, "Sale", "99", 1),
      "ACCESS_DENIED",
    );
  });
  it("preserves full payment correction/void history and excludes only voided records from exact totals", async () => {
    const project = await spaceProject();
    await payment(project, paymentA, "client", 0, paidData("0.10"));
    await payment(project, paymentB, "client", 0, paidData("0.20"));
    expect((await finances(project)).client_payments.total).toBe("0.30");
    await denied(
      () => payment(project, paymentA, "client", 1, paidData("0.40"), ""),
      "REASON_REQUIRED",
    );
    await payment(
      project,
      paymentA,
      "client",
      1,
      { ...paidData("0.40"), reference: "Corrected receipt" },
      "Correct receipt",
    );
    await denied(
      () => payment(project, paymentA, "client", 1),
      "VERSION_CONFLICT",
    );
    await payment(
      project,
      paymentA,
      "client",
      2,
      {},
      "Incorrect entry",
      "void",
    );
    const f = await finances(project);
    expect(f.client_payments.total).toBe("0.20");
    const row = f.client_payments.records.find((p) => p.id === paymentA)!;
    expect(row.amount).toBe("0.40");
    expect(row.voided).toBe(true);
    expect(row.history.map((e) => e.action)).toEqual([
      "created",
      "corrected",
      "voided",
    ]);
    expect(row.history[1].previous_value).toMatchObject({
      amount: "0.10",
      reference: "Receipt",
    });
    await denied(
      () => payment(project, paymentA, "client", 3),
      "PAYMENT_VOIDED",
    );
    await denied(
      () => db.exec("delete from public.project_payments"),
      "permission denied",
    );
    await db.exec("reset role");
    await denied(
      () => db.exec("delete from public.project_payments"),
      "HISTORY_IMMUTABLE",
    );
    await denied(
      () => db.exec("delete from public.payment_events"),
      "append-only",
    );
  });
  it("rejects invalid precision/negative/non-string amounts, future dates and kind/Project identity moves", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    for (const amount of ["-1", "1.001", "1e2", "NaN", "01"])
      await denied(
        () => financialValue(project, "Sale", amount),
        "INVALID_AMOUNT",
      );
    await actor(ids.lead);
    for (const data of [
      paidData("-1"),
      paidData("0.001"),
      { ...paidData(), amount: 10 },
      { ...paidData(), payment_date: "2999-01-01" },
    ])
      await denied(
        () => payment(project, paymentA, "client", 0, data),
        "INVALID_PAYMENT",
      );
    await payment(project, paymentA, "client", 0, {
      payment_date: "2026-01-01",
      amount: "0.10",
      method: "Cash",
    });
    await denied(
      () => payment(project, paymentA, "supplier", 1),
      "ACCESS_DENIED",
    );
    await actor(ids.stranger);
    await denied(() => finances(project), "ACCESS_DENIED");
    await denied(() => payment(project), "ACCESS_DENIED");
  });
  it("reads only latest Approved quotation totals and does not mutate quotations when finance changes", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const q = await draft(project);
    await saveQuote(q, [quoteItem()]);
    await submitQuote(q, 2);
    await reviewQuote(q, 3);
    const next = await draft(project);
    await saveQuote(next, [
      { ...(await quote(project))!.spaces[0].items[0], unit_price: "99.99" },
    ]);
    await actor(ids.bdm);
    await financialValue(project, "Sale", "1.00");
    const f = await finances(project);
    expect(f.approved_quotation?.total).toBe("0.10");
    expect(f.quotation_vs_sale).toBe("0.90");
    await actor(ids.lead);
    expect((await versionQuote(project, q)).total).toBe("0.10");
    expect((await versionQuote(project, next)).total).toBe("99.99");
  });
  it("keeps Hold metadata writable, freezes new cancelled records but permits reasoned historical corrections", async () => {
    const project = await spaceProject();
    await payment(project);
    await db.query(
      "select public.control_project($1,1,'Hold','Hold project')",
      [project],
    );
    await financialValue(project, "Raw", "10");
    await db.query(
      "select public.control_project($1,2,'Cancel','Cancel project')",
      [project],
    );
    await denied(
      () => financialValue(project, "Raw", "11", 1),
      "PROJECT_CANCELLED",
    );
    await denied(() => payment(project, paymentB), "PROJECT_CANCELLED");
    await payment(
      project,
      paymentA,
      "client",
      1,
      paidData("9"),
      "Correct historical receipt",
    );
    await payment(
      project,
      paymentA,
      "client",
      2,
      {},
      "Void wrong receipt",
      "void",
    );
    expect((await finances(project)).client_payments.total).toBe("0");
  });
  it("requires audited Admin reasons and denies direct writes or financial history changes", async () => {
    const project = await spaceProject();
    await actor(ids.admin);
    await denied(
      () => financialValue(project, "Sale", "10", 0, ""),
      "REASON_REQUIRED",
    );
    await financialValue(project, "Sale", "10", 0, "Administrative correction");
    await denied(
      () => payment(project, paymentA, "client", 0, paidData(), ""),
      "REASON_REQUIRED",
    );
    await payment(project);
    await denied(
      () => db.exec("update public.project_financial_values set amount=999"),
      "permission denied",
    );
    expect(
      (
        await db.query<{ new_value: { administrative_override: boolean } }>(
          "select new_value from public.audit_events where action='finance.value_changed' and project_id=$1",
          [project],
        )
      ).rows[0].new_value.administrative_override,
    ).toBe(true);
    await db.exec("reset role");
    await denied(
      () => db.exec("delete from public.financial_value_events"),
      "append-only",
    );
  });
});

describe("Phase 3D financial boundaries", () => {
  it("preserves numeric(28,2) boundaries and sums beyond individual limits without float loss", async () => {
    const project = await spaceProject();
    const max = "99999999999999999999999999.99";
    await actor(ids.bdm);
    await financialValue(project, "Sale", max);
    await denied(
      () => financialValue(project, "Sale", "100000000000000000000000000", 1),
      "INVALID_AMOUNT",
    );
    await actor(ids.lead);
    await financialValue(project, "Raw", "0");
    await payment(project, paymentA, "supplier", 0, paidData(max));
    await payment(project, paymentB, "supplier", 0, paidData("0.01"));
    const f = await finances(project);
    expect(f.sale?.amount).toBe(max);
    expect(f.raw?.amount).toBe("0.00");
    expect(f.sale_minus_raw).toBe(max);
    expect(f.supplier_payments.total).toBe("100000000000000000000000000.00");
    expect(f.supplier_payments.outstanding).toBe(
      "-100000000000000000000000000.00",
    );
    await denied(
      () => payment(project, paymentA, "supplier", 0, paidData(max)),
      "VERSION_CONFLICT",
    );
    expect(
      (await finances(project)).supplier_payments.records[0].history,
    ).toHaveLength(1);
  });
});

describe("Phase 3E resource amendments", () => {
  const links = [
    {
      id: "70000000-0000-4000-8000-000000000001",
      url: "https://example.com/plans?v=1",
    },
  ];
  it("keeps structured links and plain Notes through clarification, submission, conversion and authorized audited edits", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2,true,'')", [
      leadId,
      {
        ...payload,
        notes: "<script>plain text</script>\nLine two",
        resource_links: links,
      },
    ]);
    await actor(ids.lead);
    await db.query(
      "select public.review_lead($1,1,'Returned for Clarification','Clarify notes')",
      [leadId],
    );
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,2,$2,true,'')", [
      leadId,
      { ...payload, notes: "Corrected\nNotes", resource_links: links },
    ]);
    await actor(ids.lead);
    const project = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,3,'Accepted','',$2) as id",
        [leadId, ids.designer],
      )
    ).rows[0].id;
    await actor(ids.designer);
    expect(
      (
        await db.query<{ v: { notes: string; resource_links: unknown } }>(
          "select public.project_resources($1) as v",
          [project],
        )
      ).rows[0].v,
    ).toMatchObject({ notes: "Corrected\nNotes", resource_links: links });
    await denied(
      () =>
        db.query(
          "select public.update_project_resources($1,4,'Forbidden',$2,'Reason')",
          [project, links],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.bdm);
    await db.query(
      "select public.update_project_resources($1,4,'Updated project Notes',$2,'Approved clarification')",
      [project, []],
    );
    await actor(ids.admin);
    const audit = (
      await db.query<{
        previous_value: { notes: string };
        new_value: { reason: string };
      }>(
        "select previous_value,new_value from public.audit_events where action='project.resources_changed' and project_id=$1",
        [project],
      )
    ).rows[0];
    expect(audit.previous_value.notes).toBe("Corrected\nNotes");
    expect(audit.new_value.reason).toBe("Approved clarification");
    await actor(ids.stranger);
    await denied(
      () => db.query("select public.project_resources($1)", [project]),
      "ACCESS_DENIED",
    );
    await actor(ids.ops);
    await denied(
      () => db.query("select public.project_resources($1)", [project]),
      "ACCESS_DENIED",
    );
  });
  it("rejects unsafe links, duplicate IDs and excessive Notes at the authoritative boundary", async () => {
    await actor(ids.bdm);
    for (const url of [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:password@example.com",
      "https://example.com/white space",
      "https://example.com\\evil",
    ])
      await denied(
        () =>
          db.query("select public.save_lead($1,0,$2,false,'')", [
            leadId,
            { ...payload, resource_links: [{ ...links[0], url }] },
          ]),
        "INVALID_RESOURCE_LINKS",
      );
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2,false,'')", [
          leadId,
          { ...payload, resource_links: [links[0], links[0]] },
        ]),
      "INVALID_RESOURCE_LINKS",
    );
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2,false,'')", [
          leadId,
          { ...payload, notes: "x".repeat(10001) },
        ]),
      "INVALID_LEAD",
    );
  });
  it("shares inherited slots, excludes old versions/archives and enforces restore without losing history", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      payload,
    ]);
    const reserve = async (
      lead: string | null,
      project: string | null,
      replacement: string | null = null,
    ) =>
      (
        await db.query<{
          v: { id: string; attachment_id: string; object_path: string };
        }>(
          "select public.reserve_attachment($1,$2,$3,'general','file.txt','text/plain',10) as v",
          [replacement, lead, project],
        )
      ).rows[0].v;
    const inherited = await legacyLeadFile();
    await db.query("select public.save_lead($1,1,$2,true,'')", [
      leadId,
      payload,
    ]);
    await actor(ids.lead);
    const project = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,2,'Accepted','',$2) as id",
        [leadId, ids.designer],
      )
    ).rows[0].id;
    await reserve(null, project);
    const third = await reserve(null, project);
    const slots = () =>
      db.query<{
        v: { uploaded: number; reserved: number; remaining: number };
      }>("select public.get_attachment_slots(null,$1) as v", [project]);
    expect((await slots()).rows[0].v).toEqual({
      uploaded: 1,
      reserved: 2,
      remaining: 0,
    });
    await denied(() => reserve(null, project), "ATTACHMENT_COUNT_LIMIT");
    await reserve(null, project, inherited.attachment_id);
    await db.query("select public.archive_attachment($1,true,'Free slot')", [
      third.attachment_id,
    ]);
    expect((await slots()).rows[0].v.remaining).toBe(1);
    await reserve(null, project);
    await denied(
      () =>
        db.query("select public.archive_attachment($1,false,'Restore')", [
          third.attachment_id,
        ]),
      "ATTACHMENT_COUNT_LIMIT",
    );
    expect(
      (
        await db.query(
          "select id from public.attachment_versions where attachment_id=$1",
          [inherited.attachment_id],
        )
      ).rows,
    ).toHaveLength(2);
    await actor(ids.otherBdm);
    await denied(() => slots(), "ACCESS_DENIED");
  });
  it("retains existing over-limit data and allows archiving and replacement but no new slot", async () => {
    const project = await spaceProject();
    await db.exec(
      "reset role; alter table public.attachments disable trigger attachment_slot_guard",
    );
    await db.query(
      "insert into public.attachments(project_id,classification,created_by) select $1,'general',$2 from generate_series(1,4)",
      [project, ids.lead],
    );
    await db.exec(
      "alter table public.attachments enable trigger attachment_slot_guard",
    );
    await actor(ids.lead);
    await denied(
      () =>
        db.query(
          "select public.reserve_attachment(null,null,$1,'general','new.txt','text/plain',10)",
          [project],
        ),
      "ATTACHMENT_COUNT_LIMIT",
    );
    const files = (
      await db.query<{ id: string }>(
        "select id from public.attachments where project_id=$1",
        [project],
      )
    ).rows;
    await db.query(
      "select public.reserve_attachment($1,null,$2,'general','replacement.txt','text/plain',10)",
      [files[0].id, project],
    );
    await db.query(
      "select public.archive_attachment($1,true,'Reduce grandfathered scope')",
      [files[1].id],
    );
    expect(
      (
        await db.query(
          "select id from public.attachments where project_id=$1",
          [project],
        )
      ).rows,
    ).toHaveLength(4);
    await denied(
      () =>
        db.query(
          "select public.reserve_attachment(null,null,$1,'general','new.txt','text/plain',10)",
          [project],
        ),
      "ATTACHMENT_COUNT_LIMIT",
    );
  });
});

it("3E legacy pending fourth upload cannot bypass finalized capacity or direct Storage policy", async () => {
  const project = await spaceProject();
  await db.exec(
    "reset role; alter table public.attachments disable trigger attachment_slot_guard",
  );
  const files = (
    await db.query<{ id: string }>(
      "insert into public.attachments(project_id,classification,created_by) select $1,'general',$2 from generate_series(1,4) returning id",
      [project, ids.lead],
    )
  ).rows;
  await db.exec(
    "alter table public.attachments enable trigger attachment_slot_guard",
  );
  await actor(ids.lead);
  const versions: { id: string; object_path: string }[] = [];
  for (const file of files) {
    const v = (
      await db.query<{ v: { id: string; object_path: string } }>(
        "select public.reserve_attachment($1,null,$2,'general','old.txt','text/plain',10) as v",
        [file.id, project],
      )
    ).rows[0].v;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
      [v.object_path],
    );
    versions.push(v);
  }
  for (const v of versions.slice(0, 3))
    await db.query("select public.complete_attachment($1)", [v.id]);
  await denied(
    () => db.query("select public.complete_attachment($1)", [versions[3].id]),
    "ATTACHMENT_COUNT_LIMIT",
  );
  expect(
    (
      await db.query<{ permitted: boolean }>(
        "select private.can_upload_attachment_object($1) as permitted",
        [versions[3].object_path],
      )
    ).rows[0].permitted,
  ).toBe(false);
});

it("3E rejects missing link URLs and invalid port numbers at the database boundary", async () => {
  await actor(ids.bdm);
  for (const link of [
    { id: "70000000-0000-4000-8000-000000000001" },
    {
      id: "70000000-0000-4000-8000-000000000001",
      url: "https://example.com:99999/path",
    },
  ]) {
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2,false,'')", [
          leadId,
          { ...payload, resource_links: [link] },
        ]),
      "INVALID_RESOURCE_LINKS",
    );
  }
});

import type { CommercialHandoff } from "../../src/lib/handoff";
async function closeSale(
  project: string,
  saleVersion = 1,
  primary = ids.ops,
  reason = "",
  confirm = true,
) {
  const who = (await db.query<{ id: string }>("select auth.uid() as id"))
    .rows[0].id;
  let stage =
    (
      await db.query<{ commercial_status: string }>(
        "select commercial_status from public.projects where id=$1",
        [project],
      )
    ).rows[0]?.commercial_status ?? "For Quotation";
  if (who === ids.bdm && stage === "For Quotation") {
    await actor(ids.lead);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Under Negotiation','Ready for commercial follow-up',true)",
      [project],
    );
    await actor(who);
    stage = "Under Negotiation";
  }
  const result = (
    await db.query<{ id: string }>(
      "select public.close_project_sale($1,$2::public.commercial_status,$3,$4,$5,$6) as id",
      [
        project,
        stage,
        saleVersion,
        primary,
        confirm,
        reason || "Client approved the agreed price",
      ],
    )
  ).rows[0].id;
  await actor(ids.lead);
  await db.query(
    "select public.handoff_closed_project($1,$2,'Lead-approved Operations assignment and handoff',true)",
    [project, primary],
  );
  // Test-only legacy receipt: closure no longer creates project-wide handoffs.
  // Existing receipts are retained and remain usable for historical logistics.
  await db.exec("reset role");
  await db.query(
    "insert into public.project_handoffs(project_id,closure_id,number,primary_ops_id,assigned_by,reason) select $1,id,1,$2,$3,'Historical project handoff fixture' from public.commercial_closures where project_id=$1",
    [project, primary, ids.lead],
  );
  await actor(who);
  return result;
}
async function handoff(project: string) {
  return (
    await db.query<{ v: CommercialHandoff }>(
      "select public.get_commercial_handoff($1) as v",
      [project],
    )
  ).rows[0].v;
}
async function acknowledge(project: string, id: string, version = 1) {
  return db.query("select public.acknowledge_handoff($1,$2,$3,true)", [
    project,
    id,
    version,
  ]);
}
describe("Phase 4A commercial closure and handoff", () => {
  it("requires explicit price confirmation and allows BDM closure before Operations assignment", async () => {
    await submit();
    const project = await accept(ids.designer, []);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Under Negotiation','Ready',true)",
      [project],
    );
    await actor(ids.bdm);
    await denied(
      () =>
        db.query(
          "select public.close_project_deal($1,'Under Negotiation','0',0,'Agreed',false)",
          [project],
        ),
      "CONFIRMATION_REQUIRED",
    );
    await db.query(
      "select public.close_project_deal($1,'Under Negotiation','0',0,'Explicit no-charge agreement',true)",
      [project],
    );
    expect((await handoff(project)).closure?.sale_amount).toBe("0.00");
    expect((await handoff(project)).status).toBe("Awaiting Handoff");
  });
  it("closes incomplete designs with unpaid balances without changing quote, Raw, payments or design", async () => {
    const project = await spaceProject();
    await createSpace(project);
    const q = await draft(project);
    await saveQuote(q, [quoteItem()]);
    await submitQuote(q, 2);
    await reviewQuote(q, 3);
    const originalQuote = (await versionQuote(project, q)).total;
    await financialValue(project, "Raw", "40.05");
    await payment(project, paymentA, "client", 0, paidData("0.10"));
    await actor(ids.bdm);
    await financialValue(project, "Sale", "100.10");
    await closeSale(project);
    const commercial = await handoff(project);
    expect(commercial.status).toBe("Pending Acknowledgment");
    expect(commercial.age_days).toBe(0);
    expect(commercial.closure?.sale_amount).toBe("100.10");
    await financialValue(
      project,
      "Sale",
      "101.10",
      1,
      "Post-close agreed change",
    );
    expect((await handoff(project)).closure?.sale_amount).toBe("100.10");
    await actor(ids.lead);
    const f = await finances(project);
    expect(f.raw?.amount).toBe("40.05");
    expect(f.client_payments.total).toBe("0.10");
    expect(f.client_payments.outstanding).toBe("101.00");
    expect((await versionQuote(project, q)).total).toBe(originalQuote);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.spaces where project_id=$1",
          [project],
        )
      ).rows[0].status,
    ).toBe("Not Started");
    await denied(
      () => closeSale(project, 2, ids.ops, "Repeat admin action"),
      "ACCESS_DENIED",
    );
  });
  it("limits ordinary deal closure to the primary BDM; Lead retains no override", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "12.34");
    for (const who of [ids.designer, ids.otherBdm, ids.lead]) {
      await actor(who);
      await denied(
        () => closeSale(project, 1, ids.ops, "Attempted override"),
        "ACCESS_DENIED",
      );
    }
    await actor(ids.bdm);
    await closeSale(project);
    expect((await handoff(project)).closure?.administrative_override).toBe(
      false,
    );
  });
  it("rejects stale Sale/recipient context and freezes cancelled-project closure", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "5");
    await denied(() => closeSale(project, 0), "STALE_CLOSURE_CONTEXT");

    await actor(ids.lead);
    await db.query(
      "select public.control_project($1,1,'Cancel','Cancel acceptance fixture')",
      [project],
    );
    await actor(ids.bdm);
    await denied(() => closeSale(project), "PROJECT_RESOLVED");
  });
  it("preserves historical receipts but requires explicit Space release after Operations reassignment", async () => {
    const project = await spaceProject();
    await db.exec("reset role");
    await db.query(
      "update public.profiles set role='operations_admin' where id=$1",
      [ids.stranger],
    );
    await db.query(
      "insert into public.project_memberships(project_id,user_id,membership_role) values($1,$2,'operations_admin')",
      [project, ids.stranger],
    );
    await actor(ids.lead);
    await actor(ids.bdm);
    await financialValue(project, "Sale", "55");
    await closeSale(project, 1, ids.ops, "Private agreed Sale 55");
    await actor(ids.stranger);
    const first = (await handoff(project)).current!;
    await denied(() => acknowledge(project, first.id), "ACCESS_DENIED");
    await actor(ids.ops);
    await acknowledge(project, first.id);
    await denied(
      () => acknowledge(project, first.id),
      "HANDOFF_ALREADY_ACKNOWLEDGED",
    );
    expect(JSON.stringify(await handoff(project))).not.toContain(
      "Private agreed Sale",
    );
    await actor(ids.lead);
    await db.query(
      "select public.assign_project_personnel($1,$2,'{}',$3,'Primary Operations reassigned')",
      [project, ids.designer, [ids.stranger, ids.ops]],
    );
    const second = await handoff(project);
    expect(second.history).toHaveLength(1);
    expect(second.history[0].status).toBe("Acknowledged");
    expect(second.history[0].superseded_at).toBeNull();
    expect(second.current?.id).toBe(first.id);
    expect(second.status).toBe("Acknowledged");
    expect(second.events.map((e) => e.action)).toEqual(["acknowledged"]);
    await actor(ids.admin);
    await denied(
      () =>
        db.query(
          "update public.project_handoffs set status='Pending Acknowledgment' where project_id=$1",
          [project],
        ),
      "permission denied",
    );
    await db.exec("reset role");
    await denied(
      () =>
        db.query("delete from public.handoff_events where project_id=$1", [
          project,
        ]),
      "append-only",
    );
  });
  it("protects Ops pre-close access and redacts financial closure data from post-close table/RPC reads", async () => {
    const project = await spaceProject();
    await actor(ids.ops);
    await denied(() => handoff(project), "ACCESS_DENIED");
    expect(
      (await db.query("select * from public.project_handoffs")).rows,
    ).toEqual([]);
    await actor(ids.bdm);
    await financialValue(project, "Sale", "92738.61");
    await closeSale(project);
    await actor(ids.ops);
    const h = await handoff(project);
    for (const key of ["closure", "sale", "can_close", "administrative"])
      expect(h).not.toHaveProperty(key);
    expect(JSON.stringify(h)).not.toContain("92738.61");
    expect(
      (await db.query("select * from public.commercial_closures")).rows,
    ).toEqual([]);
    await financialValue(project, "Raw", "1");
    await payment(project, paymentA, "supplier");
    await actor(ids.otherBdm);
    await denied(() => handoff(project), "ACCESS_DENIED");
    expect(
      (await db.query("select * from public.project_handoffs")).rows,
    ).toEqual([]);
  });
  it("counts original-close calendar days across Manila midnight and freezes at acknowledgment", async () => {
    const project = await spaceProject();
    await db.exec("reset role");
    const closure = (
      await db.query<{ id: string }>(
        "insert into public.commercial_closures(project_id,previous_stage,sale_amount,sale_version,closed_by,actor_role,reason,administrative_override,closed_at) values($1,'For Quotation',7,1,$2,'bdm','Synthetic calendar boundary',false,'2026-01-01T15:59:59Z') returning id",
        [project, ids.bdm],
      )
    ).rows[0].id;
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await db.query(
      "insert into public.project_handoffs(project_id,closure_id,number,primary_ops_id,assigned_by,assigned_at,reason,status,acknowledged_by,acknowledged_at) values($1,$2,1,$3,$4,'2026-01-01T15:59:59Z','Calendar fixture','Acknowledged',$3,'2026-01-02T16:00:00Z')",
      [project, closure, ids.ops, ids.bdm],
    );
    await actor(ids.ops);
    expect((await handoff(project)).age_days).toBe(2);
  });
});

const supplierId = "80000000-0000-4000-8000-000000000001",
  logisticsId = "80000000-0000-4000-8000-000000000002";
async function supplierSave(
  version = 0,
  active = true,
  name = "Sample Supplier",
) {
  return db.query(
    "select public.save_supplier($1,$2,$3,'Verified master maintenance')",
    [
      supplierId,
      version,
      {
        name,
        brand: "Stosa",
        contact_person: "Contact",
        contact_details: "Synthetic contact",
        remarks: "Master remarks",
        active,
      },
    ],
  );
}
async function logisticsSave(
  project: string,
  version = 0,
  status = "RFP",
  reason = "Verified logistics",
  override = false,
  id = logisticsId,
) {
  return db.query("select public.save_logistics($1,$2,$3,$4,$5,$6,$7)", [
    id,
    project,
    version,
    supplierId,
    {
      status,
      brand: "Stosa",
      reference: "Order reference",
      remarks: "Tracking only",
    },
    reason,
    override,
  ]);
}
async function logisticsFixture(ack = true) {
  const project = await spaceProject();
  await supplierSave();
  await actor(ids.bdm);
  await financialValue(project, "Sale", "100");
  await closeSale(project);
  if (ack) {
    await actor(ids.ops);
    await acknowledge(project, (await handoff(project)).current!.id);
  }
  await actor(ids.ops);
  return project;
}
describe("Phase 4B suppliers and logistics", () => {
  it("creates/edits master records with duplicate normalization, inactive history and immutable audits", async () => {
    await actor(ids.lead);
    await supplierSave();
    await supplierSave(1, false, "Updated Supplier");
    await denied(
      () =>
        db.query("select public.save_supplier($1,0,$2,'Duplicate')", [
          logisticsId,
          { name: "  UPDATED   Supplier ", brand: "", active: true },
        ]),
      "DUPLICATE_SUPPLIER",
    );
    expect(
      (
        await db.query(
          "select * from public.supplier_events where supplier_id=$1",
          [supplierId],
        )
      ).rows,
    ).toHaveLength(2);
    await denied(
      () => db.query("delete from public.suppliers where id=$1", [supplierId]),
      "permission denied",
    );
    await actor(ids.bdm);
    expect((await db.query("select * from public.suppliers")).rows).toEqual([]);
    await denied(() => supplierSave(2), "ACCESS_DENIED");
    await db.exec("reset role");
    await denied(
      () => db.query("update public.supplier_events set reason='overwrite'"),
      "append-only",
    );
  });
  it("requires actual closure/current acknowledgment and documents scoped manager overrides", async () => {
    const project = await spaceProject();
    await supplierSave();
    await actor(ids.ops);
    await denied(() => logisticsSave(project), "ACCESS_DENIED");
    await actor(ids.bdm);
    await financialValue(project, "Sale", "100");
    await closeSale(project);
    await actor(ids.ops);
    await denied(() => logisticsSave(project), "HANDOFF_REQUIRED");
    await denied(
      () => logisticsSave(project, 0, "RFP", "Ops cannot override", true),
      "HANDOFF_REQUIRED",
    );
    await actor(ids.lead);
    await denied(() => logisticsSave(project), "HANDOFF_REQUIRED");
    await logisticsSave(
      project,
      0,
      "RFP",
      "Documented handoff exception",
      true,
    );
    expect(
      (
        await db.query<{ administrative_override: boolean }>(
          "select administrative_override from public.logistics_events",
        )
      ).rows[0].administrative_override,
    ).toBe(true);
  });
  it("supports multiple records, normal stages, reasoned skips, Hold/resume and manager terminal corrections", async () => {
    const project = await logisticsFixture();
    await logisticsSave(project);
    await logisticsSave(
      project,
      0,
      "RFP",
      "Second supplier record",
      false,
      supplierId,
    );
    await logisticsSave(project, 1, "Supplier Adjustments", "");
    await denied(
      () => logisticsSave(project, 2, "In Transit", ""),
      "REASON_REQUIRED",
    );
    await logisticsSave(
      project,
      2,
      "In Transit",
      "Manufacturing already completed externally",
    );
    await logisticsSave(project, 3, "On Hold", "Await shipping confirmation");
    await denied(
      () => logisticsSave(project, 4, "Delivered", "Skip held status"),
      "MANAGER_OVERRIDE_REQUIRED",
    );
    await logisticsSave(project, 4, "In Transit", "Shipment resumed");
    await logisticsSave(project, 5, "Landed", "");
    await logisticsSave(project, 6, "For Delivery", "");
    await logisticsSave(project, 7, "Delivered", "");
    await denied(
      () => logisticsSave(project, 8, "For Delivery", "Correction"),
      "MANAGER_OVERRIDE_REQUIRED",
    );
    await actor(ids.lead);
    await logisticsSave(
      project,
      8,
      "For Delivery",
      "Authorized delivery correction",
      true,
    );
    expect(
      (
        await db.query(
          "select id from public.project_logistics where project_id=$1",
          [project],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          "select id from public.logistics_events where logistics_id=$1",
          [logisticsId],
        )
      ).rows,
    ).toHaveLength(9);
  });
  it("blocks Project Hold/new records and Cancel activity while permitting held metadata corrections", async () => {
    const project = await logisticsFixture();
    await logisticsSave(project);
    await actor(ids.lead);
    await db.query(
      "select public.control_project($1,1,'Hold','Project pause')",
      [project],
    );
    await actor(ids.ops);
    await denied(
      () =>
        logisticsSave(project, 0, "RFP", "New held record", false, supplierId),
      "PROJECT_HELD",
    );
    await denied(
      () => logisticsSave(project, 1, "Supplier Adjustments"),
      "PROJECT_HELD",
    );
    await logisticsSave(project, 1, "RFP", "Metadata correction during Hold");
    await actor(ids.lead);
    await db.query(
      "select public.control_project($1,2,'Resume','Resume work')",
      [project],
    );
    await actor(ids.ops);
    await logisticsSave(project, 2, "Cancelled", "Order withdrawn");
    await denied(
      () => logisticsSave(project, 3, "RFP", "Reopen"),
      "MANAGER_OVERRIDE_REQUIRED",
    );
    await actor(ids.lead);
    await logisticsSave(project, 3, "RFP", "Approved order reopening", true);
    await db.query(
      "select public.control_project($1,3,'Cancel','Project cancelled')",
      [project],
    );
    await denied(
      () => logisticsSave(project, 4, "Supplier Adjustments"),
      "PROJECT_CANCELLED",
    );
    expect(
      (
        await db.query(
          "select id from public.project_logistics where project_id=$1",
          [project],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("uses historical supplier names, rejects inactive new selections, and preserves financial independence", async () => {
    const project = await logisticsFixture();
    await logisticsSave(project);
    await supplierSave(1, false, "Renamed Inactive Supplier");
    await denied(
      () =>
        logisticsSave(project, 0, "RFP", "New selection", false, supplierId),
      "INACTIVE_SUPPLIER",
    );
    await logisticsSave(project, 1, "Supplier Adjustments", "");
    expect(
      (
        await db.query<{ supplier_name: string }>(
          "select supplier_name from public.project_logistics",
        )
      ).rows[0].supplier_name,
    ).toBe("Sample Supplier");
    const finance = await finances(project);
    expect(finance).not.toHaveProperty("sale");
    expect(finance.raw?.amount).toBeNull();
    expect(finance.supplier_payments.total).toBe("0");
    await actor(ids.lead);
    expect((await finances(project)).sale?.amount).toBe("100.00");
  });
  it("denies unrelated access/direct writes and exposes only scoped operational progress to BDM/Designers", async () => {
    const project = await logisticsFixture();
    await logisticsSave(project);
    for (const user of [ids.bdm, ids.designer]) {
      await actor(user);
      expect(
        (
          await db.query(
            "select id from public.project_logistics where project_id=$1",
            [project],
          )
        ).rows,
      ).toHaveLength(1);
      expect((await db.query("select * from public.suppliers")).rows).toEqual(
        [],
      );
      await denied(
        () => logisticsSave(project, 1, "Supplier Adjustments"),
        "ACCESS_DENIED",
      );
      const timeline = (
        await db.query<{ v: { category: string }[] }>(
          "select public.project_timeline($1) as v",
          [project],
        )
      ).rows[0].v;
      expect(timeline.some((e) => e.category === "Supplier Update")).toBe(true);
    }
    await actor(ids.otherBdm);
    expect(
      (await db.query("select * from public.project_logistics")).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from public.logistics_events")).rows,
    ).toEqual([]);
    await actor(ids.admin);
    await denied(
      () => db.query("update public.project_logistics set status='Delivered'"),
      "permission denied",
    );
    await db.exec("reset role");
    await denied(
      () => db.query("delete from public.logistics_events"),
      "append-only",
    );
  });
  it("rejects stale edits without duplicating transitions", async () => {
    const project = await logisticsFixture();
    await logisticsSave(project);
    await logisticsSave(project, 1, "Supplier Adjustments", "");
    await denied(
      () => logisticsSave(project, 1, "Supplier Adjustments", ""),
      "VERSION_CONFLICT",
    );
    expect(
      (
        await db.query(
          "select id from public.logistics_events where logistics_id=$1",
          [logisticsId],
        )
      ).rows,
    ).toHaveLength(2);
  });
});

it("4B retains logistics records and transition history when a completed operational cycle is reopened", async () => {
  const project = await logisticsFixture();
  await logisticsSave(project);
  await logisticsSave(
    project,
    1,
    "Delivered",
    "Externally delivered milestone",
  );
  await db.exec("reset role");
  // Existing monitoring completion is a synthetic precondition; installation completion remains deferred.
  await db.query(
    "update public.project_operational_cycles set ended_at=now(),outcome='Completed' where project_id=$1",
    [project],
  );
  await actor(ids.lead);
  await db.query(
    "select public.control_project($1,1,'Reopen','Additional approved scope')",
    [project],
  );
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.project_logistics where project_id=$1",
        [project],
      )
    ).rows[0].status,
  ).toBe("Delivered");
  expect(
    (
      await db.query(
        "select id from public.logistics_events where project_id=$1",
        [project],
      )
    ).rows,
  ).toHaveLength(2);
});

async function installation(
  project: string,
  version = 0,
  value = "Not Applicable",
  reason = "No installation required",
  space = spaceId,
  date: string | null = null,
  override = false,
) {
  return db.query("select public.save_installation($1,$2,$3,$4,$5,$6,$7)", [
    space,
    project,
    version,
    value,
    date,
    reason,
    override,
  ]);
}
async function readiness(project: string) {
  return (
    await db.query<{
      value: {
        ready: boolean;
        version: number;
        cycle: number;
        blockers: { kind: string }[];
        completed: boolean;
      };
    }>("select public.operational_readiness($1) as value", [project])
  ).rows[0].value;
}
async function complete(project: string, confirm = true) {
  const r = await readiness(project);
  return db.query(
    "select public.complete_operations($1,$2,$3,$4,'Verified operational completion')",
    [project, r.version, r.cycle, confirm],
  );
}
async function orderedReceipt(project: string, space = spaceId) {
  const who = (await db.query<{ id: string }>("select auth.uid() as id"))
    .rows[0].id;
  await actor(ids.admin);
  const r = (
    await db.query<{ version: number; status: string }>(
      "select version,status from public.space_readiness where space_id=$1",
      [space],
    )
  ).rows[0];
  if (r.status !== "Ordered")
    await db.query(
      "select public.change_space_readiness($1,$2,'Ordered','Readiness confirmed')",
      [space, r.version],
    );
  await db.query(
    "select public.handoff_ordered_spaces($1,$2,'Release ordered scope')",
    [project, [space]],
  );
  const h = (
    await db.query<{ id: string }>(
      "select id from public.space_operational_handoffs where space_id=$1 and invalidated_at is null",
      [space],
    )
  ).rows[0];
  await db.query("select public.acknowledge_space_handoff($1)", [h.id]);
  await actor(who);
}
describe("disabled installation tracking", () => {
  it("rejects installation writes for every authenticated role without changing design or history", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await createSpace(p);
    for (const who of [
      ids.admin,
      ids.lead,
      ids.designer,
      ids.ops,
      ids.bdm,
      ids.stranger,
    ]) {
      await actor(who);
      await denied(() => installation(p), "INSTALLATION_TRACKING_DISABLED");
    }
    await actor(ids.lead);
    expect(
      (
        await db.query("select status from public.spaces where id=$1", [
          spaceId,
        ])
      ).rows[0],
    ).toEqual({ status: "Not Started" });
    expect(
      (
        await db.query(
          "select * from public.installation_events where project_id=$1",
          [p],
        )
      ).rows,
    ).toHaveLength(0);
    expect((await readiness(p)).ready).toBe(false);
  });
});

describe("Phase 4C completion boundary details", () => {
  it("excludes cancelled Spaces, records stakeholder notifications and freezes cycle timestamps while reopening retains snapshots", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await createSpace(p);
    await createSpace(p, secondSpace, ids.lead);
    await db.query("select public.cancel_space($1,1,'Removed scope')", [
      secondSpace,
    ]);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await status("Completed", 3, spaceId, "Client approved");
    await orderedReceipt(p);
    await complete(p);
    const cycle = (
      await db.query<{ ended_at: string }>(
        "select ended_at from project_operational_cycles where project_id=$1 and number=1",
        [p],
      )
    ).rows[0];
    expect(cycle.ended_at).not.toBeNull();
    const snapshot = (
      await db.query<{ snapshot: { spaces: unknown[] } }>(
        "select snapshot from operational_completions where project_id=$1",
        [p],
      )
    ).rows[0].snapshot;
    expect(snapshot.spaces).toHaveLength(1);
    await actor(ids.designer);
    expect(
      (
        await db.query(
          "select * from notifications where project_id=$1 and message like '%operational cycle%'",
          [p],
        )
      ).rows,
    ).toHaveLength(1);
    await actor(ids.lead);
    await denied(
      () => status("For Revision", 4),
      "PROJECT_COMPLETED_REOPEN_REQUIRED",
    );
    const r = await readiness(p);
    await db.query(
      "select public.control_project($1,$2,'Reopen','Additional review')",
      [p, r.version],
    );
    expect(
      (
        await db.query<{ ended_at: string }>(
          "select ended_at from project_operational_cycles where project_id=$1 and number=1",
          [p],
        )
      ).rows[0].ended_at,
    ).toEqual(cycle.ended_at);
    expect(
      (
        await db.query<{ snapshot: unknown }>(
          "select snapshot from operational_completions where project_id=$1",
          [p],
        )
      ).rows[0].snapshot,
    ).toEqual(snapshot);
    await denied(
      () => installation(p, 1, "On Hold", "Installation issue"),
      "INSTALLATION_TRACKING_DISABLED",
    );
    expect(
      (
        await db.query(
          "select * from public.space_installations where space_id=$1",
          [spaceId],
        )
      ).rows,
    ).toHaveLength(0);
    const reopened = await readiness(p);
    await db.query(
      "select public.control_project($1,$2,'Cancel','Remaining work cancelled')",
      [p, reopened.version],
    );
    expect((await readiness(p)).completed).toBe(false);
    expect(
      (
        await db.query<{ is_operationally_completed: boolean }>(
          "select is_operationally_completed from projects where id=$1",
          [p],
        )
      ).rows[0].is_operationally_completed,
    ).toBe(false);
  });
});

async function dashboard(view = "", page = 1) {
  return (
    await db.query<{
      value: {
        role: string;
        metrics: Record<string, { count: number; amount: string | null }>;
        records: { id: string; href: string }[];
        actions: unknown[];
        workload: { id: string; count: number }[];
        workload_count: number;
      };
    }>("select public.role_dashboard($1,$2) value", [view, page])
  ).rows[0].value;
}
describe("Phase 5A authorized role dashboards", () => {
  it("counts admin accounts/invitations without returning Auth metadata or financial audit payloads", async () => {
    await db.exec("reset role");
    await db.query(
      "update auth.users set invited_at=now(),last_sign_in_at=null where id=$1",
      [ids.stranger],
    );
    await actor(ids.admin);
    const d = await dashboard("invitations");
    expect(d.metrics.active_users.count).toBe(7);
    expect(d.metrics.invitations.count).toBe(1);
    expect(d.records).toHaveLength(1);
    expect(JSON.stringify(d)).not.toContain("raw_user_meta_data");
    await actor(ids.bdm);
    expect((await dashboard("invitations")).records).toHaveLength(0);
  });
  it("deduplicates overlapping assignments, excludes cancelled scope and applies timezone deadlines", async () => {
    const p = await spaceProject();
    await createSpace(p, spaceId, ids.lead, [ids.designer]);
    await createSpace(p, secondSpace, ids.designer);
    await db.query("select public.cancel_space($1,1,'Removed scope')", [
      secondSpace,
    ]);
    await db.exec("reset role");
    await db.query(
      "update spaces set deadline=(now() at time zone 'Asia/Manila')::date+3 where id=$1",
      [spaceId],
    );
    await actor(ids.designer);
    const d = await dashboard("due_spaces");
    expect(d.metrics.assigned_spaces.count).toBe(1);
    expect(d.metrics.due_spaces.count).toBe(1);
    expect(d.records[0].href).toContain(`#space-${spaceId}`);
    await actor(ids.lead);
    const lead = await dashboard();
    expect(lead.metrics.active_projects.count).toBe(1);
    expect(lead.workload).toEqual([
      { id: ids.designer, display_name: "designer", count: 1 },
    ]);
    expect(lead.metrics.risk_projects.count).toBe(1);
    await actor(ids.stranger);
    expect((await dashboard()).metrics).toEqual({});
  });
  it("scopes BDM lead counts and exact Sale while withholding Raw/supplier data from dashboards", async () => {
    const p = await spaceProject();
    await actor(ids.bdm);
    await financialValue(p, "Sale", "0");
    const d = await dashboard("sale");
    expect(d.metrics.submitted_leads.count).toBe(1);
    expect(d.metrics.accepted_leads.count).toBe(1);
    expect(d.metrics.sale).toEqual({ count: 1, amount: "0.00" });
    expect(d.records).toHaveLength(1);
    await actor(ids.lead);
    await financialValue(p, "Raw", "98765.43");
    await actor(ids.bdm);
    expect(JSON.stringify(await dashboard())).not.toContain("98765.43");
    await actor(ids.otherBdm);
    expect((await dashboard()).metrics).toEqual({});
  });
  it("keeps Ops preview out of operational metrics, respects primary handoffs and aggregates each logistics record once", async () => {
    const p = await spaceProject();
    await createSpace(p);
    await actor(ids.ops);
    expect((await dashboard()).metrics).toEqual({});
    await actor(ids.lead);
    await supplierSave();
    await actor(ids.bdm);
    await financialValue(p, "Sale", "12345.67");
    await closeSale(p);
    await actor(ids.ops);
    const pending = await dashboard();
    expect(pending.metrics.handoffs).toBeUndefined();
    expect(pending.metrics.operational_projects.count).toBe(1);
    expect(pending.metrics.ops_installations).toBeUndefined();
    expect(JSON.stringify(pending)).not.toContain("12345.67");
    await acknowledge(p, (await handoff(p)).current!.id);
    await logisticsSave(p);
    const d = await dashboard("logistics:RFP");
    expect(d.metrics.handoffs).toBeUndefined();
    expect(d.metrics["logistics:RFP"].count).toBe(1);
    expect(d.records).toHaveLength(1);
    await db.exec("reset role");
    await db.query(
      "update project_logistics set version=version+1, status_at=now()-interval '8 days' where id=$1",
      [logisticsId],
    );
    await actor(ids.ops);
    expect((await dashboard()).metrics.delayed_logistics.count).toBe(1);
  });
  it("retains historical commercial/completed statistics while removing active workload and validates page bounds", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await createSpace(p);
    await status("In Progress", 1);
    await status("Submitted", 2);
    await status("Completed", 3, spaceId, "Client reference");
    await orderedReceipt(p);
    await complete(p);
    const d = await dashboard();
    expect(d.metrics.active_projects).toBeUndefined();
    expect(d.metrics.recent_completed.count).toBe(1);
    expect(d.workload).toHaveLength(0);
    await actor(ids.bdm);
    expect((await dashboard()).metrics.closed_projects.count).toBe(1);
    await actor(ids.ops);
    expect((await dashboard()).metrics.operational_projects).toBeUndefined();
    await denied(() => dashboard("", 0), "VALIDATION_ERROR");
    await db.exec("reset role");
    await db.exec("set role anon");
    await denied(() => dashboard(), "permission denied");
  });
  it("uses the same inclusive risk thresholds as existing monitoring", async () => {
    await db.exec("reset role");
    const today = "2026-10-14";
    const cases = [
      ["2026-10-13", "2026-10-14", "Overdue"],
      ["2026-10-17", "2026-10-14", "At Risk"],
      ["2026-10-18", "2026-10-07", "At Risk"],
      [null, "2026-10-08", "On Track"],
    ];
    for (const [deadline, last, expected] of cases)
      expect(
        (
          await db.query<{ risk: string }>(
            "select private.dashboard_risk($1,$2,$3) risk",
            [deadline, last, today],
          )
        ).rows[0].risk,
      ).toBe(expected);
  });
});

describe("Phase 5A dashboard bounded queues", () => {
  it("paginates matching records independently of full counts and rejects inactive sessions", async () => {
    await actor(ids.bdm);
    for (let i = 0; i < 27; i++)
      await db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
        `21000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        JSON.stringify({
          ...payload,
          project_name: `Queue ${i}`,
          address: `Address ${i}`,
        }),
      ]);
    await actor(ids.bdm);
    const first = await dashboard("awaiting_leads", 1),
      second = await dashboard("awaiting_leads", 2);
    expect(first.metrics.awaiting_leads.count).toBe(27);
    expect(first.records).toHaveLength(25);
    expect(second.records).toHaveLength(2);
    expect(
      new Set([...first.records, ...second.records].map((r) => r.id)).size,
    ).toBe(27);
    expect(first.actions.length).toBeLessThanOrEqual(8);
    await db.exec("reset role");
    await db.query("update profiles set active=false where id=$1", [ids.bdm]);
    await actor(ids.bdm);
    await denied(() => dashboard(), "ACCESS_DENIED");
  });
});

describe("Phase 5A recent calendar window", () => {
  it("includes the first of 14 dates and excludes older and future audit events", async () => {
    await actor(ids.admin);
    const before = (await dashboard()).metrics.system_activity?.count ?? 0;
    await db.exec("reset role");
    for (const days of [13, 14, -1])
      await db.query(
        "insert into audit_events(actor_id,entity_type,entity_id,action,occurred_at) values($1,'profile',$1,'dashboard.window_test',(((now() at time zone 'Asia/Manila')::date-$2::int)::timestamp at time zone 'Asia/Manila'))",
        [ids.admin, days],
      );
    await actor(ids.admin);
    expect((await dashboard()).metrics.system_activity.count).toBe(before + 1);
  });
});

describe("Phase 5A current workload authorization", () => {
  it("retains Space assignment history but removes a revoked Designer from current workload", async () => {
    const p = await spaceProject();
    await createSpace(p);
    expect((await dashboard()).workload).toHaveLength(1);
    await db.query(
      "select public.assign_project_personnel($1,$2,'{}'::uuid[],$3::uuid[],'Reassigned project')",
      [p, ids.lead, [ids.ops]],
    );
    expect((await dashboard()).workload).toHaveLength(0);
    await actor(ids.designer);
    expect((await dashboard()).metrics).toEqual({});
  });
});

describe("Phase 5A historical completion statistics", () => {
  it("keeps the recorded completion in the recent window after reopening and cancellation", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await complete(p);
    expect((await dashboard()).metrics.recent_completed.count).toBe(1);
    let r = await readiness(p);
    await db.query(
      "select public.control_project($1,$2,'Reopen','Historical dashboard check')",
      [p, r.version],
    );
    let d = await dashboard();
    expect(d.metrics.active_projects.count).toBe(1);
    expect(d.metrics.recent_completed.count).toBe(1);
    r = await readiness(p);
    await db.query(
      "select public.control_project($1,$2,'Cancel','Cancelled new work')",
      [p, r.version],
    );
    d = await dashboard();
    expect(d.metrics.active_projects).toBeUndefined();
    expect(d.metrics.recent_completed.count).toBe(1);
  });
});

import { analyticsSchema, type AnalyticsData } from "../../src/lib/analytics";
async function analytics(
  view = "",
  bucket = "",
  filters: Record<string, unknown> = {},
) {
  const args = {
    from: "2024-01-01",
    to: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
    stage: "",
    brand: "",
    stakeholder: null,
    page: 1,
    ...filters,
  };
  const r = await db.query<{ value: AnalyticsData }>(
    "select public.project_analytics($1,$2,$3,$4,$5,$6,$7,$8) value",
    [
      args.from,
      args.to,
      args.stage,
      args.brand,
      args.stakeholder,
      view,
      bucket,
      args.page,
    ],
  );
  return analyticsSchema.parse(r.rows[0].value);
}
describe("Phase 5B scoped project analytics", () => {
  it("deduplicates assignments and applies brand, stage and stakeholder to cards and drilldowns", async () => {
    const p = await spaceProject();
    await createSpace(p, spaceId, ids.lead, [ids.designer]);
    const a = await analytics("projects", "For Quotation", {
      brand: "Stosa",
      stakeholder: ids.designer,
    });
    expect(a.metrics.active_projects.count).toBe(1);
    expect(a.selected_count).toBe(1);
    expect(a.records[0].id).toBe(p);
    expect(a.metrics.spaces.count).toBe(1);
    expect(a.groups.find((g) => g.key === "workload")?.count).toBe(1);
    expect((await analytics("projects", "", { brand: "SFY" })).metrics).toEqual(
      {},
    );
    expect(
      (await analytics("projects", "", { stage: "Closed" })).metrics,
    ).toEqual({});
    expect(
      (await analytics("projects", "", { stakeholder: ids.stranger })).metrics,
    ).toEqual({});
    await actor(ids.otherBdm);
    expect((await analytics("projects")).records).toEqual([]);
    await actor(ids.stranger);
    expect((await analytics()).metrics).toEqual({});
  });
  it("uses a submitted-lead cohort once per Lead and preserves actual acceptance timestamps", async () => {
    await submit();
    await accept();
    await actor(ids.bdm);
    const a = await analytics("accepted_leads");
    expect(a.metrics.leads.count).toBe(1);
    expect(a.metrics.accepted_leads.count).toBe(1);
    expect(a.records[0].at).toBeTruthy();
    expect(
      (await analytics("leads", "", { from: "2025-01-01", to: "2025-12-31" }))
        .metrics,
    ).toEqual({});
    await actor(ids.otherBdm);
    expect((await analytics()).metrics).toEqual({});
  });
  it("isolates exact Sale/client totals across all roles and keeps Ops pre-close entirely empty", async () => {
    const p = await spaceProject();
    await actor(ids.bdm);
    await financialValue(p, "Sale", "0");
    expect((await analytics()).metrics.sale.amount).toBe("0.00");
    await actor(ids.lead);
    await financialValue(p, "Raw", "98765.43");
    for (const who of [ids.lead, ids.admin, ids.bdm]) {
      await actor(who);
      expect((await analytics()).metrics.sale.amount).toBe("0.00");
      expect(JSON.stringify(await analytics())).not.toContain("98765.43");
    }
    for (const who of [ids.designer, ids.ops]) {
      await actor(who);
      const a = await analytics("sale");
      expect(a.records).toEqual([]);
      expect(a.metrics.sale).toBeUndefined();
    }
    await actor(ids.ops);
    expect((await analytics()).metrics).toEqual({});
    expect((await analytics()).people).toEqual([]);
    await denied(
      () => analytics("", "", { brand: "Stosa" }),
      "VALIDATION_ERROR",
    );
  });
  it("separates closure from completion and excludes disabled installation tracking", async () => {
    const p = await spaceProject();
    await createSpace(p);
    await actor(ids.bdm);
    await financialValue(p, "Sale", "100.00");
    await closeSale(p);
    await actor(ids.ops);
    const a = await analytics("installations");
    expect(a.metrics.installations).toBeUndefined();
    expect(a.groups.find((g) => g.key === "installations")).toBeUndefined();
    expect(a.metrics.completions).toBeUndefined();
    expect(a.metrics.active_projects.count).toBe(1);
    expect(a.metrics.handoffs).toBeUndefined();
    expect(a.metrics.sale).toBeUndefined();
    await actor(ids.lead);
    expect((await analytics()).metrics.closed.count).toBe(1);
  });
  it("retains latest completion across reopen with original deadline at completion and excludes gaps", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await db.query(
      "select public.revise_project_deadline($1,1,(now() at time zone 'Asia/Manila')::date,'Asia/Manila','Completion target')",
      [p],
    );
    await complete(p);
    let a = await analytics("completion_timing", "On time");
    expect(a.selected_count).toBe(1);
    expect(a.metrics.completed_projects.count).toBe(1);
    let r = await readiness(p);
    await db.query(
      "select public.control_project($1,$2,'Reopen','New operational cycle')",
      [p, r.version],
    );
    r = await readiness(p);
    await db.query(
      "select public.revise_project_deadline($1,$2,(now() at time zone 'Asia/Manila')::date-5,'UTC','Later revision must not rewrite completion')",
      [p, r.version],
    );
    a = await analytics("completion_timing", "On time");
    expect(a.selected_count).toBe(1);
    expect(a.metrics.active_projects.count).toBe(1);
    expect(a.metrics.completed_projects).toBeUndefined();
    expect(a.metrics.completions.count).toBe(1);
    expect(a.metrics.completions.amount).toBe("0");
  });
  it("handles unavailable completion deadlines and validates API inputs", async () => {
    const p = await logisticsFixture();
    await actor(ids.lead);
    await complete(p);
    const a = await analytics("completion_timing", "Unavailable deadline");
    expect(a.selected_count).toBe(1);
    for (const filters of [
      { page: 0 },
      { from: "2020-01-01" },
      { to: "2099-01-01" },
      { stage: "unknown" },
    ])
      await denied(() => analytics("", "", filters), "VALIDATION_ERROR");
  });
});

describe("Phase 5B analytics boundaries", () => {
  it("applies project-local inclusive cohort boundaries and paginates matching charts without loading whole records", async () => {
    const p = await spaceProject();
    await db.exec("reset role");
    await db.query(
      "update public.projects set created_at='2026-01-01T16:00:00Z' where id=$1",
      [p],
    );
    await actor(ids.lead);
    expect(
      (
        await analytics("projects", "", {
          from: "2026-01-02",
          to: "2026-01-02",
        })
      ).selected_count,
    ).toBe(1);
    expect(
      (
        await analytics("projects", "", {
          from: "2026-01-01",
          to: "2026-01-01",
        })
      ).selected_count,
    ).toBe(0);
    await db.exec("reset role");
    await db.query(
      "insert into public.projects(reference,name,lead_designer_id) select '5B-'||g,'Paged project '||g,$1 from generate_series(1,26)g",
      [ids.lead],
    );
    await actor(ids.lead);
    const first = await analytics("projects"),
      second = await analytics("projects", "", { page: 2 });
    expect(first.selected_count).toBe(27);
    expect(first.records).toHaveLength(25);
    expect(second.records).toHaveLength(2);
    expect(
      new Set([...first.records, ...second.records].map((r) => r.id)).size,
    ).toBe(27);
  });
  it("uses exact current client collections with void/correction history and omits supplier payments", async () => {
    const p = await spaceProject();
    await actor(ids.bdm);
    await financialValue(p, "Sale", "100.10");
    await actor(ids.lead);
    await payment(p, paymentA, "client", 0, paidData("33.37"));
    await payment(p, paymentB, "supplier", 0, paidData("98765.43"));
    expect((await analytics()).metrics.collections.amount).toBe("33.37");
    expect(JSON.stringify(await analytics())).not.toContain("98765.43");
    await payment(p, paymentA, "client", 1, paidData("25.01"));
    expect((await analytics()).metrics.collections.amount).toBe("25.01");
    await payment(
      p,
      paymentA,
      "client",
      2,
      {},
      "Void invalid collection",
      "void",
    );
    expect((await analytics()).metrics.collections.amount).toBe("0");
  });
  it("matches existing dashboard risk and denies anonymous/inactive actors and direct helper execution", async () => {
    const p = await spaceProject();
    await createSpace(p);
    await db.query(
      "select public.revise_project_deadline($1,1,(now() at time zone 'Asia/Manila')::date-1,'Asia/Manila','Risk boundary')",
      [p],
    );
    const a = await analytics("risk", "Overdue"),
      d = await dashboard();
    expect(a.selected_count).toBe(d.metrics.overdue_projects.count);
    await denied(
      () => db.query("select private.dashboard_project_risk($1)", [p]),
      "permission denied",
    );
    await db.exec("reset role; set role anon");
    await denied(() => analytics(), "permission denied");
    await db.exec("reset role");
    await db.query("update profiles set active=false where id=$1", [ids.lead]);
    await actor(ids.lead);
    await denied(() => analytics(), "ACCESS_DENIED");
  });
});

it("5B completed-cycle duration uses each historical cycle timezone rather than the latest timezone", async () => {
  await db.exec("reset role");
  const row = await db.query<{ id: string }>(
    "insert into public.projects(reference,name,lead_designer_id,created_at) values('5B-zone','Historical timezones',$1,'2026-01-01T15:50:00Z') returning id",
    [ids.lead],
  );
  const p = row.rows[0].id;
  await db.query(
    "update public.project_operational_cycles set ended_at='2026-01-01T16:10:00Z',outcome='Completed' where project_id=$1 and number=1",
    [p],
  );
  await db.query(
    'insert into public.operational_completions(project_id,cycle_number,completed_at,completed_by,reason,administrative_override,snapshot) values($1,1,\'2026-01-01T16:10:00Z\',$2,\'Historical fixture\',false,\'{"monitoring":{"timezone":"Asia/Manila","deadline":null}}\')',
    [p, ids.lead],
  );
  await db.query(
    "insert into public.project_operational_cycles(project_id,number,started_at,ended_at,outcome) values($1,2,'2026-03-01T15:50:00Z','2026-03-01T16:10:00Z','Completed')",
    [p],
  );
  await db.query(
    'insert into public.operational_completions(project_id,cycle_number,completed_at,completed_by,reason,administrative_override,snapshot) values($1,2,\'2026-03-01T16:10:00Z\',$2,\'Historical fixture\',false,\'{"monitoring":{"timezone":"UTC","deadline":null}}\')',
    [p, ids.lead],
  );
  await actor(ids.lead);
  const a = await analytics("completions");
  expect(a.metrics.completions.count).toBe(1);
  expect(a.metrics.completions.amount).toBe("1");
  expect(a.groups.find((g) => g.key === "completions")?.bucket).toBe("2026-03");
});

it("calendar isolates personal events, enforces optimistic writes and preserves cancellation audit", async () => {
  const event = "90000000-0000-4000-8000-000000000001";
  const data = {
    title: "Site coordination",
    date: "2026-10-15",
    end_date: "2026-10-16",
    time: "09:00",
    end_time: "10:00",
    notes: "Plain text",
    location: "Studio",
  };
  await actor(ids.designer);
  await db.query("select public.save_calendar_event($1,0,$2::jsonb,false,'')", [
    event,
    JSON.stringify(data),
  ]);
  const own = await db.query<{ events: { id: string }[] }>(
    "select public.workspace_calendar('2026-10-01','2026-10-31') as events",
  );
  expect(own.rows[0].events.some((e) => e.id === event)).toBe(true);
  await actor(ids.otherBdm);
  expect(
    (
      await db.query("select * from public.calendar_events where id=$1", [
        event,
      ])
    ).rows,
  ).toHaveLength(0);
  await db.exec("savepoint calendar_denial");
  await expect(
    db.query("select public.save_calendar_event($1,1,$2::jsonb,false,'Edit')", [
      event,
      JSON.stringify(data),
    ]),
  ).rejects.toThrow("ACCESS_DENIED");
  await db.exec("rollback to savepoint calendar_denial");
  await actor(ids.designer);
  await db.exec("savepoint calendar_direct");
  await expect(
    db.query(
      "insert into public.calendar_events(id,owner_id,title,event_date,end_date) values($1,$2,'Bypass','2026-10-15','2026-10-15')",
      [leadId, ids.designer],
    ),
  ).rejects.toThrow();
  await db.exec("rollback to savepoint calendar_direct");
  await db.query(
    "select public.save_calendar_event($1,1,$2::jsonb,false,'Time confirmed')",
    [event, JSON.stringify(data)],
  );
  await db.exec("savepoint calendar_stale");
  await expect(
    db.query(
      "select public.save_calendar_event($1,1,$2::jsonb,false,'Stale edit')",
      [event, JSON.stringify(data)],
    ),
  ).rejects.toThrow("STALE_EVENT");
  await db.exec("rollback to savepoint calendar_stale");
  await db.query(
    "select public.save_calendar_event($1,2,'{}'::jsonb,true,'Visit cancelled')",
    [event],
  );
  const after = await db.query<{ events: { id: string }[] }>(
    "select public.workspace_calendar('2026-10-01','2026-10-31') as events",
  );
  expect(after.rows[0].events.some((e) => e.id === event)).toBe(false);
  expect(
    (
      await db.query(
        "select * from public.calendar_event_history where event_id=$1",
        [event],
      )
    ).rows,
  ).toHaveLength(3);
  await actor(ids.admin);
  expect(
    (
      await db.query(
        "select * from public.calendar_event_history where event_id=$1",
        [event],
      )
    ).rows,
  ).toHaveLength(3);
  expect(
    (
      await db.query(
        "select * from public.audit_events where entity_type='calendar_event' and entity_id=$1",
        [event],
      )
    ).rows,
  ).toHaveLength(3);
});

describe("Microfeatures PostgreSQL permissions and integrity", () => {
  async function denied(run: () => Promise<unknown>, pattern: RegExp) {
    await db.exec("savepoint micro_denied");
    try {
      await expect(run()).rejects.toThrow(pattern);
    } finally {
      await db.exec(
        "rollback to savepoint micro_denied;release savepoint micro_denied",
      );
    }
  }
  it("keeps favorites personal, rechecks revoked membership and denies direct writes", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    await actor(ids.designer);
    await db.query("select public.remember_project($1,true)", [project]);
    await db.query("select public.remember_project($1,null)", [project]);
    expect(
      (await db.query("select * from public.project_shortcuts")).rows,
    ).toHaveLength(1);
    await denied(
      () =>
        db.query(
          "insert into public.project_shortcuts(user_id,project_id) values($1,$2)",
          [ids.designer, project],
        ),
      /permission denied/i,
    );
    await actor(ids.otherBdm);
    expect(
      (await db.query("select * from public.project_shortcuts")).rows,
    ).toHaveLength(0);
    await denied(
      () => db.query("select public.remember_project($1,true)", [project]),
      /ACCESS_DENIED/,
    );
    await db.exec("reset role");
    await db.query(
      "delete from public.project_memberships where project_id=$1 and user_id=$2",
      [project, ids.designer],
    );
    await actor(ids.designer);
    expect(
      (await db.query("select * from public.project_shortcuts")).rows,
    ).toHaveLength(0);
  });
  it("copies only Space names atomically, uses fresh IDs and makes repeat template applications idempotent", async () => {
    await submit();
    const project = await accept();
    await actor(ids.lead);
    const space = "40000000-0000-4000-8000-000000000099",
      template = "50000000-0000-4000-8000-000000000099",
      operation = "60000000-0000-4000-8000-000000000099";
    await db.query(
      "select public.save_space($1,$2,0,'Kitchen','2026-12-01',$3,'{}','Original structure')",
      [space, project, ids.designer],
    );
    await db.query(
      "select public.save_space_template($1,$2,'Kitchen structure')",
      [template, project],
    );
    const t = (
      await db.query<{ structure: unknown }>(
        "select structure from public.space_structure_templates",
      )
    ).rows[0];
    expect(t.structure).toEqual([{ name: "Kitchen" }]);
    await denied(
      () =>
        db.query("select public.apply_space_template($1,$2,$3,$4,false)", [
          operation,
          template,
          project,
          ids.designer,
        ]),
      /CONFIRMATION_REQUIRED/,
    );
    await denied(
      () =>
        db.query("select public.apply_space_template($1,$2,$3,$4,true)", [
          operation,
          template,
          project,
          ids.stranger,
        ]),
      /INVALID_ASSIGNMENTS/,
    );
    for (let i = 0; i < 2; i++)
      await db.query("select public.apply_space_template($1,$2,$3,$4,true)", [
        operation,
        template,
        project,
        ids.designer,
      ]);
    const s = await db.query<{
      id: string;
      name: string;
      status: string;
      deadline: string | null;
    }>(
      "select id,name,status,deadline from public.spaces where project_id=$1",
      [project],
    );
    expect(s.rows).toHaveLength(2);
    expect(s.rows.find((s) => s.id !== space)).toMatchObject({
      name: "Kitchen",
      status: "Not Started",
      deadline: null,
    });
    expect(
      (await db.query("select * from public.space_template_applications")).rows,
    ).toHaveLength(1);
    await actor(ids.admin);
    expect(
      (
        await db.query(
          "select * from public.audit_events where action='template.applied'",
        )
      ).rows,
    ).toHaveLength(1);
    await actor(ids.designer);
    expect(
      (await db.query("select * from public.space_structure_templates")).rows,
    ).toHaveLength(0);
    await denied(
      () =>
        db.query("select public.apply_space_template($1,$2,$3,$4,true)", [
          operation,
          template,
          project,
          ids.designer,
        ]),
      /ACCESS_DENIED/,
    );
  });
  it("restricts discussions/mentions, audits corrections and prevents duplicate notifications", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    await actor(ids.designer);
    const comment = "70000000-0000-4000-8000-000000000099";
    const save = (
      version: number | null,
      body: string,
      mentions: string[],
      reason = "",
    ) =>
      db.query(
        "select public.save_project_comment($1,$2,null,$3,$4,$5::uuid[],$6)",
        [comment, project, version, body, mentions, reason],
      );
    await denied(
      () => save(0, "Invalid mention", [ids.stranger]),
      /INVALID_MENTION/,
    );
    await save(0, "Text <script>stays plain</script>", [ids.lead]);
    await denied(
      () => save(0, "Repeated submission", [ids.lead]),
      /VERSION_CONFLICT/,
    );
    await denied(
      () => save(null, "Bypass version", [ids.lead], "Correction"),
      /VERSION_CONFLICT/,
    );
    await save(1, "Corrected comment", [ids.lead], "Correct wording");
    await actor(ids.lead);
    expect(
      (
        await db.query(
          "select * from public.notifications where type='project_mention'",
        )
      ).rows,
    ).toHaveLength(1);
    await actor(ids.admin);
    expect(
      (
        await db.query(
          "select * from public.audit_events where action='comment.corrected'",
        )
      ).rows,
    ).toHaveLength(1);
    await actor(ids.bdm);
    expect(
      (await db.query("select * from public.project_comments")).rows,
    ).toHaveLength(1);
    await denied(
      () => save(2, "Other author correction", [], "Not permitted"),
      /ACCESS_DENIED/,
    );
    for (const id of [ids.ops, ids.otherBdm, ids.stranger]) {
      await actor(id);
      expect(
        (await db.query("select * from public.project_comments")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.comment_people($1)", [project]))
          .rows,
      ).toHaveLength(0);
      await denied(
        () => save(2, "Restricted", [], "No access"),
        /ACCESS_DENIED/,
      );
    }
  });
});

describe("Notification inbox", () => {
  it("marks every active role's own unread notices, preserving read timestamps and other recipients", async () => {
    for (const who of [ids.admin, ids.lead, ids.designer, ids.bdm, ids.ops]) {
      await db.exec("reset role");
      await db.query(
        "insert into public.notifications(recipient_id,message) values($1,'Inbox test'),($1,'Another update')",
        [who],
      );
    }
    for (const who of [ids.admin, ids.lead, ids.designer, ids.bdm, ids.ops]) {
      await actor(who);
      expect(
        (
          await db.query<{ count: number }>(
            "select public.mark_all_notifications_read() as count",
          )
        ).rows[0].count,
      ).toBe(2);
      expect(
        (
          await db.query<{ count: number }>(
            "select public.mark_all_notifications_read() as count",
          )
        ).rows[0].count,
      ).toBe(0);
      const rows = (
        await db.query<{ recipient_id: string; read_at: string }>(
          "select recipient_id,read_at from public.notifications where recipient_id=$1",
          [who],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(rows.every((n) => n.recipient_id === who && n.read_at)).toBe(true);
    }
    await db.exec("reset role");
    const stamp = (
      await db.query<{ read_at: string }>(
        "select read_at from public.notifications where recipient_id=$1 limit 1",
        [ids.bdm],
      )
    ).rows[0].read_at;
    await actor(ids.bdm);
    await db.query("select public.mark_all_notifications_read()");
    expect(
      (
        await db.query<{ read_at: string }>(
          "select read_at from public.notifications limit 1",
        )
      ).rows[0].read_at,
    ).toEqual(stamp);
  });
  it("cannot mark another recipient's notices or call the bulk RPC anonymously", async () => {
    await db.query(
      "insert into public.notifications(recipient_id,message) values($1,'Private notice')",
      [ids.lead],
    );
    await actor(ids.bdm);
    expect(
      (
        await db.query<{ count: number }>(
          "select public.mark_all_notifications_read() as count",
        )
      ).rows[0].count,
    ).toBe(0);
    await db.exec("reset role");
    expect(
      (
        await db.query<{ read_at: unknown }>(
          "select read_at from public.notifications",
        )
      ).rows[0].read_at,
    ).toBeNull();
    await db.exec("set role anon; savepoint denied");
    await expect(
      db.query("select public.mark_all_notifications_read()"),
    ).rejects.toThrow("permission denied");
    await db.exec("rollback to denied; reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.bdm,
    ]);
    await actor(ids.bdm);
    await expect(
      db.query("select public.mark_all_notifications_read()"),
    ).rejects.toThrow();
  });
});

describe("Revised commercial workflow", () => {
  async function transition(
    project: string,
    expected: string,
    target: string,
    reason = "Commercial UAT decision",
  ) {
    return db.query(
      "select public.transition_commercial_stage($1,$2::public.commercial_status,$3::public.commercial_status,$4,true)",
      [project, expected, target, reason],
    );
  }
  it("starts accepted projects For Quotation; ordinary roles cannot act as the owning Lead", async () => {
    const project = await spaceProject();
    for (const who of [ids.bdm, ids.designer, ids.ops]) {
      await actor(who);
      await denied(
        () => transition(project, "For Quotation", "Under Negotiation"),
        "ACCESS_DENIED",
      );
    }
    await actor(ids.lead);
    await denied(
      () => transition(project, "For Quotation", "Under Negotiation", ""),
      "REASON_REQUIRED",
    );
    await transition(project, "For Quotation", "Under Negotiation");
    await denied(
      () => transition(project, "For Quotation", "Under Negotiation"),
      "STALE_COMMERCIAL_STAGE",
    );
    await actor(ids.bdm);
    expect(
      (
        await db.query<{ commercial_status: string }>(
          "select commercial_status from public.projects where id=$1",
          [project],
        )
      ).rows[0].commercial_status,
    ).toBe("Under Negotiation");
    expect(
      (
        await db.query(
          "select * from public.notifications where project_id=$1 and message like '%BDM follow-up%'",
          [project],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("atomically closes at the BDM price, notifies Lead, and withholds Ops until Lead handoff", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await denied(
      () =>
        db.query(
          "select public.close_project_deal($1,'For Quotation','125000.15',0,'Agreed',true)",
          [project],
        ),
      "INVALID_COMMERCIAL_TRANSITION",
    );
    await actor(ids.lead);
    await transition(project, "For Quotation", "Under Negotiation");
    await denied(
      () =>
        db.query(
          "select public.close_project_deal($1,'Under Negotiation','125000.15',0,'Agreed',true)",
          [project],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.bdm);
    await db.query(
      "select public.close_project_deal($1,'Under Negotiation','125000.15',0,'Client confirmed the final price',true)",
      [project],
    );
    const pending = await handoff(project);
    expect(pending.status).toBe("Awaiting Handoff");
    expect(pending.closure?.sale_amount).toBe("125000.15");
    expect(pending.current).toBeNull();
    await denied(
      () =>
        db.query("select public.handoff_closed_project($1,$2,'Handoff',true)", [
          project,
          ids.ops,
        ]),
      "ACCESS_DENIED",
    );
    await actor(ids.ops);
    expect(
      (await db.query("select id from public.projects where id=$1", [project]))
        .rows,
    ).toHaveLength(0);
    await actor(ids.lead);
    expect(
      (
        await db.query(
          "select * from public.notifications where project_id=$1 and message like '%awaiting your Operations%'",
          [project],
        )
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "select public.assign_project_personnel($1,$2,'{}',$3,'Team update without operational release')",
      [project, ids.designer, [ids.ops]],
    );
    expect((await handoff(project)).status).toBe("Awaiting Handoff");
    await db.query(
      "select public.handoff_closed_project($1,$2,'Assign Operations for delivery coordination',true)",
      [project, ids.ops],
    );
    // Repeating assignment is idempotent and does not release Spaces.
    await db.query(
      "select public.handoff_closed_project($1,$2,'Repeat',true)",
      [project, ids.ops],
    );
    await actor(ids.ops);
    const h = await handoff(project);
    expect(h.status).toBe("Awaiting Handoff");
    expect(h.current).toBeNull();
    await actor(ids.bdm);
    await denied(
      () => transition(project, "Closed", "Lost"),
      "INVALID_COMMERCIAL_TRANSITION",
    );
  });
  it("permits primary BDM loss during ongoing design and freezes every project write while preserving read history", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await actor(ids.designer);
    await db.query(
      "select public.change_space_status($1,1,'In Progress','Design started','')",
      [spaceId],
    );
    const reservation = (
      await db.query<{
        v: { id: string; object_path: string; bucket: string };
      }>(
        "select public.reserve_attachment(null,null,$1,'design','layout.png','image/png',10) as v",
        [project],
      )
    ).rows[0].v;
    await actor(ids.otherBdm);
    await denied(
      () => transition(project, "For Quotation", "Lost"),
      "ACCESS_DENIED",
    );
    await actor(ids.bdm);
    await denied(
      () => transition(project, "For Quotation", "Lost", ""),
      "REASON_REQUIRED",
    );
    await transition(
      project,
      "For Quotation",
      "Lost",
      "Client postponed the renovation indefinitely",
    );
    expect(
      (
        await db.query<{ commercial_status: string; is_cancelled: boolean }>(
          "select commercial_status,is_cancelled from public.projects where id=$1",
          [project],
        )
      ).rows[0],
    ).toEqual({ commercial_status: "Lost", is_cancelled: false });
    await actor(ids.designer);
    expect(
      (
        await db.query("select * from public.spaces where project_id=$1", [
          project,
        ])
      ).rows,
    ).toHaveLength(1);
    await denied(
      () =>
        db.query(
          "select public.change_space_status($1,2,'Submitted','Updated layout','')",
          [spaceId],
        ),
      "PROJECT_LOST_READ_ONLY",
    );
    await denied(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name,metadata) values($1,$2,jsonb_build_object('size',10))",
          [reservation.bucket, reservation.object_path],
        ),
      "row-level security",
    );
    await actor(ids.lead);
    await denied(
      () => db.query("select public.create_quotation_draft($1)", [project]),
      "PROJECT_LOST_READ_ONLY",
    );
    await denied(
      () =>
        db.query(
          "select public.set_financial_value($1,'Raw','100',0,'Estimate')",
          [project],
        ),
      "PROJECT_LOST_READ_ONLY",
    );
    await actor(ids.admin);
    await denied(
      () =>
        db.query(
          "select public.save_project_comment($1,$2,null,0,'Correction','{}','')",
          [leadId, project],
        ),
      "PROJECT_LOST_READ_ONLY",
    );
    expect(
      (
        await db.query(
          "select * from public.audit_events where project_id=$1 and action='commercial.lost'",
          [project],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
    await denied(
      () =>
        db.query("update public.projects set name='Bypass' where id=$1", [
          project,
        ]),
      "PROJECT_LOST_READ_ONLY",
    );
    await denied(
      () =>
        db.query("update public.spaces set name='Bypass' where project_id=$1", [
          project,
        ]),
      "PROJECT_LOST_READ_ONLY",
    );
  });
});

describe("Lead Designer routing and isolation", () => {
  async function secondLead() {
    await db.exec("reset role");
    await db.query(
      "update public.profiles set role='lead_designer' where id=$1",
      [ids.stranger],
    );
  }
  it("requires a selected active Lead Designer on submission but permits unassigned drafts", async () => {
    await actor(ids.bdm);
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2,true,'')", [
          leadId,
          { ...payload, assigned_lead_designer_id: null },
        ]),
      "INVALID_LEAD_DESIGNER",
    );
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2,true,'')", [
          leadId,
          { ...payload, assigned_lead_designer_id: ids.ops },
        ]),
      "INVALID_LEAD_DESIGNER",
    );
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      { ...payload, assigned_lead_designer_id: null },
    ]);
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.lead,
    ]);
    await actor(ids.bdm);
    await denied(
      () =>
        db.query("select public.save_lead($1,1,$2,true,'')", [leadId, payload]),
      "INVALID_LEAD_DESIGNER",
    );
  });
  it("lists active Lead Designers only without granting BDM profile-directory access", async () => {
    await secondLead();
    await actor(ids.bdm);
    const people = await db.query<{ id: string; role: string }>(
      "select * from public.list_lead_designers()",
    );
    expect(people.rows.map((x) => x.id).sort()).toEqual(
      [ids.lead, ids.stranger].sort(),
    );
    expect(people.rows.every((x) => x.role === "lead_designer")).toBe(true);
    await actor(ids.ops);
    await denied(
      () => db.query("select * from public.list_lead_designers()"),
      "ACCESS_DENIED",
    );
  });
  it("targets notifications and snapshots, and blocks another Lead Designer from lead/history/files/review/analytics", async () => {
    await secondLead();
    await submit();
    await db.exec("reset role");
    expect(
      (
        await db.query<{ recipient_id: string }>(
          "select recipient_id from public.notifications where lead_id=$1",
          [leadId],
        )
      ).rows,
    ).toEqual([{ recipient_id: ids.lead }]);
    expect(
      (
        await db.query<{ snapshot: { assigned_lead_designer_id: string } }>(
          "select snapshot from public.lead_submissions where lead_id=$1",
          [leadId],
        )
      ).rows[0].snapshot.assigned_lead_designer_id,
    ).toBe(ids.lead);
    await actor(ids.stranger);
    for (const table of ["leads", "lead_submissions", "lead_reviews"])
      expect(
        (await db.query(`select * from public.${table}`)).rows,
      ).toHaveLength(0);
    await denied(
      () =>
        db.query(
          "select public.review_lead($1,1,'Rejected','Not my request')",
          [leadId],
        ),
      "ACCESS_DENIED",
    );
    await denied(
      () =>
        db.query(
          "select public.reserve_attachment(null,$1,null,'general','test.txt','text/plain',10)",
          [leadId],
        ),
      "ACCESS_DENIED",
    );
    const report = await analytics();
    expect(JSON.stringify(report)).not.toContain(payload.project_name);
    await actor(ids.lead);
    expect(
      (await db.query("select * from public.leads where id=$1", [leadId])).rows,
    ).toHaveLength(1);
  });
  it("denies another Lead Designer direct Storage reads and download authorization", async () => {
    await secondLead();
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      payload,
    ]);
    const v = await legacyLeadFile();
    await db.query("select public.save_lead($1,1,$2,true,'')", [
      leadId,
      payload,
    ]);
    await actor(ids.stranger);
    expect(
      (
        await db.query("select id from storage.objects where name=$1", [
          v.object_path,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select id from public.attachment_versions where id=$1",
          [v.id],
        )
      ).rows,
    ).toHaveLength(0);
    await denied(
      () => db.query("select public.record_attachment_download($1)", [v.id]),
      "ACCESS_DENIED",
    );
    await actor(ids.lead);
    expect(
      (
        await db.query("select id from storage.objects where name=$1", [
          v.object_path,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query("select public.record_attachment_download($1)", [v.id]);
  });
  it("preserves recipient through clarification, resubmission and exactly-once acceptance", async () => {
    await submit();
    await actor(ids.lead);
    await db.query(
      "select public.review_lead($1,1,'Returned for Clarification','Add details')",
      [leadId],
    );
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,2,$2,true,'')", [
      leadId,
      payload,
    ]);
    await actor(ids.admin);
    const args = [leadId, ids.designer, ids.lead];
    const query =
      "select public.review_lead($1,3,'Accepted','Admin review',$2,'{}','{}',$3) id";
    const first = await db.query<{ id: string }>(query, args);
    expect((await db.query<{ id: string }>(query, args)).rows[0].id).toBe(
      first.rows[0].id,
    );
    expect(
      (
        await db.query<{ lead_designer_id: string }>(
          "select lead_designer_id from public.projects",
        )
      ).rows,
    ).toEqual([{ lead_designer_id: ids.lead }]);
  });
  it("rejects incompatible/inactive Lead Designers and preserves Lost-project read-only enforcement", async () => {
    await secondLead();
    await submit();
    const project = await accept();
    await actor(ids.lead);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Invalid role')",
          [project, ids.lead, ids.ops],
        ),
      "INVALID_LEAD_DESIGNER",
    );
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.stranger,
    ]);
    await actor(ids.lead);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Inactive')",
          [project, ids.lead, ids.stranger],
        ),
      "INVALID_LEAD_DESIGNER",
    );
    await actor(ids.bdm);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Lost','Client declined',true)",
      [project],
    );
    await actor(ids.lead);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Must not edit Lost project')",
          [project, ids.lead, ids.stranger],
        ),
      "PROJECT_LOST_READ_ONLY",
    );
  });
  it("admin cannot silently change recipient while accepting", async () => {
    await secondLead();
    await submit();
    await actor(ids.admin);
    await denied(
      () =>
        db.query(
          "select public.review_lead($1,1,'Accepted','',$2,'{}','{}',$3)",
          [leadId, ids.designer, ids.stranger],
        ),
      "INVALID_LEAD_DESIGNER",
    );
  });
  it("recovers legacy unassigned requests with an audited, versioned administrator assignment", async () => {
    await submit();
    await db.exec("reset role");
    await db.query(
      "update public.leads set assigned_lead_designer_id=null where id=$1",
      [leadId],
    );
    await actor(ids.lead);
    expect((await db.query("select id from public.leads")).rows).toHaveLength(
      0,
    );
    await actor(ids.admin);
    await denied(
      () =>
        db.query("select public.route_lead($1,1,$2,'')", [leadId, ids.lead]),
      "REASON_REQUIRED",
    );
    await db.query("select public.route_lead($1,1,$2,'Route legacy request')", [
      leadId,
      ids.lead,
    ]);
    await denied(
      () =>
        db.query("select public.route_lead($1,1,$2,'Stale tab')", [
          leadId,
          ids.lead,
        ]),
      "STALE_VERSION",
    );
    await actor(ids.lead);
    expect(
      (await db.query<{ version: number }>("select version from public.leads"))
        .rows[0].version,
    ).toBe(2);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select id from public.audit_events where action='lead.recipient_changed'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("transfers project oversight atomically with one Lead Designer, audit/history, notifications and inherited lead visibility", async () => {
    await secondLead();
    await submit();
    const project = await accept();
    await actor(ids.otherBdm);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Denied')",
          [project, ids.lead, ids.stranger],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.stranger);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Denied')",
          [project, ids.lead, ids.stranger],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.lead);
    await denied(
      () =>
        db.query("select public.assign_project_lead_designer($1,$2,$3,'')", [
          project,
          ids.lead,
          ids.stranger,
        ]),
      "REASON_REQUIRED",
    );
    await db.query(
      "select public.assign_project_lead_designer($1,$2,$3,'Team expansion')",
      [project, ids.lead, ids.stranger],
    );
    expect(
      (await db.query("select id from public.projects where id=$1", [project]))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(0);
    await denied(
      () =>
        db.query("select public.review_lead($1,1,'Accepted','',$2)", [
          leadId,
          ids.designer,
        ]),
      "ACCESS_DENIED",
    );
    await actor(ids.stranger);
    expect(
      (await db.query("select id from public.projects where id=$1", [project]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(1);
    await denied(
      () =>
        db.query(
          "select public.assign_project_lead_designer($1,$2,$3,'Stale assignment')",
          [project, ids.lead, ids.lead],
        ),
      "STALE_VERSION",
    );
    await db.exec("reset role");
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.project_memberships where project_id=$1 and membership_role='lead_designer'",
          [project],
        )
      ).rows,
    ).toEqual([{ user_id: ids.stranger }]);
    expect(
      (
        await db.query(
          "select id from public.audit_events where action='project.lead_designer_changed'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select id from public.project_assignment_events where project_id=$1",
          [project],
        )
      ).rows,
    ).toHaveLength(2);
    await actor(ids.ops);
    expect((await db.query("select id from public.leads")).rows).toHaveLength(
      0,
    );
  });
});

describe("Links-only quotation requests", () => {
  it("blocks direct reservations and replacement, keeps legacy download/archive, and preserves links through acceptance", async () => {
    await actor(ids.bdm);
    const links = [
      { id: spaceId, url: "https://example.com/design-brief" },
      { id: secondSpace, url: "https://example.com/photos" },
    ];
    const request = { ...payload, resource_links: links };
    await db.query("select public.save_lead($1,0,$2,false,'')", [
      leadId,
      request,
    ]);
    const legacy = await legacyLeadFile();
    const pending = await legacyLeadFile(false);
    await denied(
      () =>
        db.query(
          "select public.reserve_attachment(null,$1,null,'general','new.pdf','application/pdf',10)",
          [leadId],
        ),
      "LEAD_LINKS_ONLY",
    );
    await denied(
      () =>
        db.query(
          "select public.reserve_attachment($1,null,null,'general','replacement.pdf','application/pdf',10)",
          [legacy.attachment_id],
        ),
      "LEAD_LINKS_ONLY",
    );
    await denied(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name,metadata) values('one-odc-attachments',$1,'{\"size\":10}')",
          [pending.object_path],
        ),
      "row-level security",
    );
    await db.query("select public.record_attachment_download($1)", [legacy.id]);
    expect(
      (
        await db.query("select id from storage.objects where name=$1", [
          legacy.object_path,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "select public.archive_attachment($1,true,'Archive unfinished legacy upload; use resource links')",
      [pending.attachment_id],
    );
    await db.query("select public.save_lead($1,1,$2,true,'')", [
      leadId,
      request,
    ]);
    await actor(ids.lead);
    const project = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,2,'Accepted','',$2) id",
        [leadId, ids.designer],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ resource_links: unknown }>(
          "select resource_links from public.leads where id=$1",
          [leadId],
        )
      ).rows[0].resource_links,
    ).toEqual(links);
    await db.query(
      "select public.reserve_attachment(null,null,$1,'design','project.pdf','application/pdf',10)",
      [project],
    );
    expect(
      (
        await db.query(
          "select id from public.attachment_versions where id=$1",
          [legacy.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe("Discussion unread receipts and mention delivery", () => {
  it("counts messages per project/user, preserves unloaded messages and denies unauthorized receipts", async () => {
    await submit();
    const project = await accept(ids.designer, [ids.ops]);
    const secondLead = "20000000-0000-4000-8000-000000000055";
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
      secondLead,
      JSON.stringify({
        ...payload,
        project_name: "Second residence",
        address: "Other address",
      }),
    ]);
    await actor(ids.lead);
    const second = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,1,'Accepted','',$2,'{}','{}',null) as id",
        [secondLead, ids.designer],
      )
    ).rows[0].id;
    const one = "70000000-0000-4000-8000-000000000051";
    const two = "70000000-0000-4000-8000-000000000052";
    const three = "70000000-0000-4000-8000-000000000053";
    await actor(ids.designer);
    for (const [id, p] of [
      [one, project],
      [two, project],
      [three, second],
    ])
      await db.query(
        "select public.save_project_comment($1,$2,null,0,'Discussion receipt test','{}','')",
        [id, p],
      );
    expect(
      (await db.query("select * from public.discussion_unread()")).rows,
    ).toEqual([]);
    await actor(ids.lead);
    expect(
      (
        await db.query<{ unread: number }>(
          "select * from public.discussion_unread() where project_id=$1",
          [project],
        )
      ).rows[0].unread,
    ).toBe(2);
    await db.query("select public.read_project_comments($1,$2::uuid[])", [
      project,
      [one],
    ]);
    await db.query("select public.read_project_comments($1,$2::uuid[])", [
      project,
      [one],
    ]);
    expect(
      (
        await db.query<{ unread: number }>(
          "select * from public.discussion_unread() where project_id=$1",
          [project],
        )
      ).rows[0].unread,
    ).toBe(1);
    expect(
      (
        await db.query<{ unread: number }>(
          "select * from public.discussion_unread() where project_id=$1",
          [second],
        )
      ).rows[0].unread,
    ).toBe(1);
    await denied(
      () =>
        db.query("select public.read_project_comments($1,$2::uuid[])", [
          project,
          [three],
        ]),
      "ACCESS_DENIED",
    );
    for (const who of [ids.otherBdm, ids.ops, ids.stranger]) {
      await actor(who);
      expect(
        (await db.query("select * from public.discussion_unread()")).rows,
      ).toEqual([]);
      expect(
        (await db.query("select * from public.project_comment_reads")).rows,
      ).toEqual([]);
      await denied(
        () =>
          db.query("select public.read_project_comments($1,$2::uuid[])", [
            project,
            [one],
          ]),
        "ACCESS_DENIED",
      );
    }
    await actor(ids.bdm);
    expect(
      (
        await db.query<{ unread: number }>(
          "select * from public.discussion_unread() where project_id=$1",
          [project],
        )
      ).rows[0].unread,
    ).toBe(2);
  });
  it("makes exact submission retries idempotent and creates one contextual mention per recipient/message", async () => {
    await submit();
    const project = await accept();
    await actor(ids.designer);
    const id = "70000000-0000-4000-8000-000000000054";
    const save = () =>
      db.query(
        "select public.save_project_comment($1,$2,null,0,'Please review the kitchen',$3::uuid[],'')",
        [id, project, [ids.lead, ids.lead, ids.designer]],
      );
    await save();
    await save();
    expect(
      (
        await db.query("select * from public.project_comments where id=$1", [
          id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.notifications where comment_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    await actor(ids.lead);
    const notice = (
      await db.query<{ type: string; message: string; comment_id: string }>(
        "select * from public.notifications where comment_id=$1",
        [id],
      )
    ).rows;
    expect(notice).toHaveLength(1);
    expect(notice[0].type).toBe("project_mention");
    expect(notice[0].message).toContain("Database test residence");
    expect(notice[0].message).toContain("Please review the kitchen");
    await actor(ids.designer);
    await db.query(
      "select public.save_project_comment($1,$2,null,1,'Correction without mention','{}','Correction')",
      [id, project],
    );
    await db.query(
      "select public.save_project_comment($1,$2,null,2,'Mention restored',$3::uuid[],'Correction')",
      [id, project, [ids.lead]],
    );
    await actor(ids.lead);
    expect(
      (
        await db.query(
          "select * from public.notifications where comment_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    await actor(ids.otherBdm);
    expect(
      (
        await db.query(
          "select * from public.notifications where comment_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("Discussion edits without reasons", () => {
  it("allows author edits without a reason, preserves space context and audits the previous content", async () => {
    const project = await spaceProject();
    await createSpace(project);
    await actor(ids.designer);
    const comment = "70000000-0000-4000-8000-000000000065";
    await db.query(
      "select public.save_project_comment($1,$2,$3,0,'Kitchen finish selection','{}','')",
      [comment, project, spaceId],
    );
    await db.query(
      "select public.save_project_comment($1,$2,$3,1,'Kitchen finish confirmed','{}','')",
      [comment, project, spaceId],
    );
    expect(
      (
        await db.query<{ space_id: string; body: string; version: number }>(
          "select space_id,body,version from public.project_comments where id=$1",
          [comment],
        )
      ).rows[0],
    ).toEqual({
      space_id: spaceId,
      body: "Kitchen finish confirmed",
      version: 2,
    });
    await denied(
      () =>
        db.query(
          "select public.save_project_comment($1,$2,$3,1,'Stale edit','{}','')",
          [comment, project, spaceId],
        ),
      "VERSION_CONFLICT",
    );
    await actor(ids.bdm);
    await denied(
      () =>
        db.query(
          "select public.save_project_comment($1,$2,$3,2,'Other author edit','{}','')",
          [comment, project, spaceId],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.admin);
    const history = (
      await db.query<{
        previous_value: { body: string };
        new_value: { body: string; reason: string };
      }>(
        "select previous_value,new_value from public.audit_events where entity_id=$1 and action='comment.corrected'",
        [comment],
      )
    ).rows;
    expect(history).toHaveLength(1);
    expect(history[0].previous_value.body).toBe("Kitchen finish selection");
    expect(history[0].new_value.body).toBe("Kitchen finish confirmed");
    expect(history[0].new_value.reason).toBe("");
  });
});

describe("BDM client payment recording", () => {
  it("allows related BDM client receipts, retains audit/decimal totals and blocks supplier payments, edits, voids and foreign projects", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    let f = await finances(project);
    expect(f.can_record_client_payments).toBe(true);
    expect(f.can_manage_payments).toBe(false);
    expect(f).not.toHaveProperty("raw");
    await payment(project, paymentA, "client", 0, paidData("1234.56"), "");
    f = await finances(project);
    expect(f.client_payments.total).toBe("1234.56");
    expect(f.client_payments.records[0].created_by).toBe(ids.bdm);
    expect(f.client_payments.records[0].history[0].actor_id).toBe(ids.bdm);
    await denied(() => payment(project, paymentB, "supplier"), "ACCESS_DENIED");
    await denied(
      () =>
        payment(project, paymentA, "client", 1, paidData("10"), "Correction"),
      "ACCESS_DENIED",
    );
    await denied(
      () => payment(project, paymentA, "client", 1, {}, "Void reason", "void"),
      "ACCESS_DENIED",
    );
    await actor(ids.otherBdm);
    await denied(() => payment(project, paymentB), "ACCESS_DENIED");
    await denied(() => finances(project), "ACCESS_DENIED");
    await actor(ids.designer);
    expect((await finances(project)).can_record_client_payments).toBe(false);
    await denied(() => payment(project, paymentB), "ACCESS_DENIED");
    await actor(ids.lead);
    await payment(
      project,
      paymentA,
      "client",
      1,
      paidData("1250.25"),
      "Verified corrected receipt",
    );
    expect((await finances(project)).client_payments.total).toBe("1250.25");
  });
  it("rejects future dates, stale versions, direct writes and receipts on Lost or cancelled projects", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await denied(
      () =>
        payment(project, paymentA, "client", 0, {
          ...paidData(),
          payment_date: "2099-01-01",
        }),
      "INVALID_PAYMENT",
    );
    await denied(
      () => payment(project, paymentA, "client", 1),
      "ACCESS_DENIED",
    );
    await denied(
      () =>
        db.query(
          "insert into public.project_payments(id,project_id,kind,payment_date,amount,method,created_by,updated_by) values($1,$2,'client',current_date,10,'Cash',$3,$3)",
          [paymentA, project, ids.bdm],
        ),
      "permission denied",
    );
    await db.exec("reset role");
    await db.query("update public.projects set is_cancelled=true where id=$1", [
      project,
    ]);
    await actor(ids.bdm);
    expect((await finances(project)).can_record_client_payments).toBe(false);
    await denied(() => payment(project, paymentA), "ACCESS_DENIED");
    await db.exec("reset role");
    await db.query(
      "update public.projects set is_cancelled=false,commercial_status='Lost',lost_at=now(),lost_reason='Client did not proceed' where id=$1",
      [project],
    );
    await actor(ids.bdm);
    expect((await finances(project)).can_record_client_payments).toBe(false);
    await denied(() => payment(project, paymentA), "ACCESS_DENIED");
  });
});

describe("Payment direction separation", () => {
  it("Ops writes supplier payments against Raw, never client receipts; BDM writes client receipts against Sale", async () => {
    const project = await spaceProject();
    await actor(ids.bdm);
    await financialValue(project, "Sale", "1000");
    await payment(project, paymentA, "client", 0, paidData("250"), "");
    await actor(ids.lead);
    await financialValue(project, "Raw", "600");
    await db.exec("reset role");
    await db.query(
      "update public.projects set commercial_status='Closed' where id=$1",
      [project],
    );
    await actor(ids.ops);
    let f = await finances(project);
    expect(f.can_manage_payments).toBe(false);
    expect(f.can_manage_client_payments).toBe(false);
    expect(f.can_manage_supplier_payments).toBe(true);
    expect(f.can_record_client_payments).toBe(false);
    expect(f).not.toHaveProperty("sale");
    expect(f.raw?.amount).toBe("600.00");
    await denied(
      () => payment(project, "90000000-0000-4000-8000-000000000001", "client"),
      "ACCESS_DENIED",
    );
    await denied(
      () =>
        payment(project, paymentA, "client", 1, paidData("300"), "Correction"),
      "ACCESS_DENIED",
    );
    await denied(
      () => payment(project, paymentA, "client", 1, {}, "Void", "void"),
      "ACCESS_DENIED",
    );
    await payment(project, paymentB, "supplier", 0, paidData("100"));
    f = await finances(project);
    expect(f.supplier_payments.total).toBe("100.00");
    expect(f.supplier_payments.outstanding).toBe("500.00");
    expect(f.client_payments.total).toBe("250.00");
    await payment(
      project,
      paymentB,
      "supplier",
      1,
      paidData("125.50"),
      "Correct supplier receipt",
    );
    expect((await finances(project)).supplier_payments.outstanding).toBe(
      "474.50",
    );
    await payment(
      project,
      paymentB,
      "supplier",
      2,
      {},
      "Duplicate supplier receipt",
      "void",
    );
    expect((await finances(project)).supplier_payments.outstanding).toBe(
      "600.00",
    );
    await actor(ids.bdm);
    f = await finances(project);
    expect(f.client_payments.outstanding).toBe("750.00");
    expect(f.can_manage_supplier_payments).toBe(false);
    await denied(
      () =>
        payment(project, "90000000-0000-4000-8000-000000000002", "supplier"),
      "ACCESS_DENIED",
    );
    await actor(ids.lead);
    expect((await finances(project)).can_manage_client_payments).toBe(true);
    await payment(
      project,
      paymentA,
      "client",
      1,
      paidData("275"),
      "Verified client receipt",
    );
    await actor(ids.admin);
    expect((await finances(project)).can_manage_supplier_payments).toBe(true);
    expect((await finances(project)).client_payments.outstanding).toBe(
      "725.00",
    );
    await actor(ids.otherBdm);
    await denied(() => payment(project), "ACCESS_DENIED");
  });
});

describe("Administrator quotation request creation", () => {
  it("creates and edits on behalf of a BDM, preserves audit authorship, routes and accepts normally", async () => {
    await actor(ids.admin);
    const input = { ...payload, bdm_id: ids.bdm };
    await db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
      leadId,
      JSON.stringify(input),
    ]);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(1);
    await actor(ids.lead);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(0);
    await actor(ids.admin);
    await db.query("select public.save_lead($1,1,$2::jsonb,true,'')", [
      leadId,
      JSON.stringify(input),
    ]);
    expect(
      (
        await db.query<{ bdm_id: string; status: string }>(
          "select bdm_id,status from public.leads where id=$1",
          [leadId],
        )
      ).rows[0],
    ).toEqual({ bdm_id: ids.bdm, status: "Submitted" });
    expect(
      (
        await db.query<{ submitted_by: string }>(
          "select submitted_by from public.lead_submissions where lead_id=$1",
          [leadId],
        )
      ).rows[0].submitted_by,
    ).toBe(ids.admin);
    expect(
      (
        await db.query<{ actor_id: string }>(
          "select actor_id from public.audit_events where entity_id=$1",
          [leadId],
        )
      ).rows.every((e) => e.actor_id === ids.admin),
    ).toBe(true);
    await actor(ids.otherBdm);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(0);
    await actor(ids.bdm);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(1);
    await actor(ids.lead);
    const p = (
      await db.query<{ id: string }>(
        "select public.review_lead($1,2,'Accepted','',$2,'{}','{}',null) as id",
        [leadId, ids.designer],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ primary_bdm_id: string }>(
          "select primary_bdm_id from public.project_origins where project_id=$1",
          [p],
        )
      ).rows[0].primary_bdm_id,
    ).toBe(ids.bdm);
  });
  it("rejects missing/ineligible owners, forged BDM ownership and unauthorized roles", async () => {
    await actor(ids.admin);
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
          leadId,
          JSON.stringify(payload),
        ]),
      "INVALID_BDM",
    );
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
          leadId,
          JSON.stringify({ ...payload, bdm_id: ids.designer }),
        ]),
      "INVALID_BDM",
    );
    for (const id of [ids.designer, ids.ops, ids.lead]) {
      await actor(id);
      await denied(
        () =>
          db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
            leadId,
            JSON.stringify({ ...payload, bdm_id: ids.bdm }),
          ]),
        "ACCESS_DENIED",
      );
    }
    await actor(ids.bdm);
    await denied(
      () =>
        db.query("select public.save_lead($1,0,$2::jsonb,true,'')", [
          leadId,
          JSON.stringify({ ...payload, bdm_id: ids.otherBdm }),
        ]),
      "ACCESS_DENIED",
    );
  });
  it("allows superadmin access to existing BDM drafts and duplicate checks", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
      leadId,
      JSON.stringify(payload),
    ]);
    await actor(ids.admin);
    expect(
      (
        await db.query(
          "select * from public.find_duplicate_leads($1,$2,null)",
          [payload.project_name, payload.address],
        )
      ).rows,
    ).toHaveLength(1);
    await db.query("select public.save_lead($1,1,$2::jsonb,true,'')", [
      leadId,
      JSON.stringify({ ...payload, bdm_id: ids.bdm }),
    ]);
    expect(
      (
        await db.query<{ bdm_id: string }>(
          "select bdm_id from public.leads where id=$1",
          [leadId],
        )
      ).rows[0].bdm_id,
    ).toBe(ids.bdm);
  });
});

describe("lead supplier masterfile", () => {
  const supplierId = "90000000-0000-4000-8000-000000000001";
  const inactiveId = "90000000-0000-4000-8000-000000000002";
  async function fixture() {
    await db.exec("reset role");
    await db.query(
      "insert into public.suppliers(id,name,brand,active,contact_details,created_by,updated_by) values($1,'Active request supplier','SFY',true,'private contact',$3,$3),($2,'Inactive request supplier','Stosa',false,'private contact',$3,$3)",
      [supplierId, inactiveId, ids.admin],
    );
  }
  it("exposes minimal active options to BDMs and preserves supplier snapshots through draft and submission", async () => {
    await fixture();
    await actor(ids.bdm);
    const options = (
      await db.query("select * from public.list_lead_suppliers()")
    ).rows;
    expect(options).toEqual([
      { id: supplierId, name: "Active request supplier", brand: "SFY" },
    ]);
    expect((await db.query("select * from public.suppliers")).rows).toEqual([]);
    const data = { ...payload, supplier_id: supplierId, brand: "Stosa" };
    await db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
      leadId,
      JSON.stringify(data),
    ]);
    expect(
      (
        await db.query(
          "select supplier_id,supplier_name,brand from public.leads where id=$1",
          [leadId],
        )
      ).rows[0],
    ).toEqual({
      supplier_id: supplierId,
      supplier_name: "Active request supplier",
      brand: "SFY",
    });
    await db.query("select public.save_lead($1,1,$2::jsonb,true,'')", [
      leadId,
      JSON.stringify(data),
    ]);
    const snapshot = (
      await db.query<{ snapshot: Record<string, unknown> }>(
        "select snapshot from public.lead_submissions where lead_id=$1",
        [leadId],
      )
    ).rows[0].snapshot;
    expect(snapshot).toMatchObject({
      supplier_id: supplierId,
      supplier_name: "Active request supplier",
      brand: "SFY",
    });
    await actor(ids.designer);
    await denied(
      () => db.query("select * from public.list_lead_suppliers()"),
      "ACCESS_DENIED",
    );
  });
  it("rejects inactive/missing suppliers and preserves legacy brand-only requests", async () => {
    await fixture();
    await actor(ids.bdm);
    for (const supplier_id of [
      inactiveId,
      "90000000-0000-4000-8000-000000000099",
    ]) {
      await denied(
        () =>
          db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
            leadId,
            JSON.stringify({ ...payload, supplier_id }),
          ]),
        "INVALID_LEAD_SUPPLIER",
      );
    }
    await db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
      leadId,
      JSON.stringify(payload),
    ]);
    expect(
      (
        await db.query(
          "select supplier_id,brand from public.leads where id=$1",
          [leadId],
        )
      ).rows[0],
    ).toEqual({ supplier_id: null, brand: "Stosa" });
  });
});

describe("superadmin capabilities", () => {
  it("executes the full commercial workflow without impersonation or membership changes", async () => {
    const project = await spaceProject();
    await actor(ids.admin);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Under Negotiation','Superadmin client follow-up',true)",
      [project],
    );
    await db.query(
      "select public.close_project_deal($1,'Under Negotiation','125000.15',0,'Superadmin closure',true)",
      [project],
    );
    let data = await handoff(project);
    expect(data.status).toBe("Awaiting Handoff");
    await db.query(
      "select public.handoff_closed_project($1,$2,'Superadmin handoff',true)",
      [project, ids.ops],
    );
    data = await handoff(project);
    expect(data.current).toBeNull();
    await createSpace(project);
    await orderedReceipt(project);
    const closure = (
      await db.query<{
        closed_by: string;
        actor_role: string;
        administrative_override: boolean;
      }>(
        "select closed_by,actor_role,administrative_override from public.commercial_closures where project_id=$1",
        [project],
      )
    ).rows[0];
    expect(closure).toMatchObject({
      closed_by: ids.admin,
      actor_role: "system_administrator",
      administrative_override: true,
    });
    const current = (
      await db.query<{ primary_ops_id: string; acknowledged_by: string }>(
        "select ops_id as primary_ops_id,acknowledged_by from public.space_operational_handoffs where project_id=$1 and invalidated_at is null",
        [project],
      )
    ).rows[0];
    expect(current).toMatchObject({
      primary_ops_id: ids.ops,
      acknowledged_by: ids.admin,
    });
    await denied(
      () =>
        db.query(
          "select public.close_project_deal($1,'Closed','1',1,'Repeat',true)",
          [project],
        ),
      "SALE_ALREADY_CLOSED",
    );
  });
  it("can mark a project Lost while ordinary unauthorized actors remain denied", async () => {
    const project = await spaceProject();
    await actor(ids.designer);
    await denied(
      () =>
        db.query(
          "select public.transition_commercial_stage($1,'For Quotation','Lost','No deal',true)",
          [project],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.admin);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Lost','Superadmin client decision',true)",
      [project],
    );
    expect(
      (
        await db.query<{ commercial_status: string }>(
          "select commercial_status from public.projects where id=$1",
          [project],
        )
      ).rows[0].commercial_status,
    ).toBe("Lost");
  });
  it("edits another BDM draft without changing owner and preserves submitted locking", async () => {
    await actor(ids.bdm);
    await db.query("select public.save_lead($1,0,$2::jsonb,false,'')", [
      leadId,
      JSON.stringify(payload),
    ]);
    await actor(ids.otherBdm);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(0);
    await actor(ids.admin);
    expect(
      (await db.query("select id from public.leads where id=$1", [leadId]))
        .rows,
    ).toHaveLength(1);
    await db.query("select public.save_lead($1,1,$2::jsonb,true,'')", [
      leadId,
      JSON.stringify({ ...payload, date_needed: "2026-12-15" }),
    ]);
    const saved = (
      await db.query<{ bdm_id: string; date_needed: string }>(
        "select bdm_id,date_needed::text from public.leads where id=$1",
        [leadId],
      )
    ).rows[0];
    expect(saved).toMatchObject({ bdm_id: ids.bdm, date_needed: "2026-12-15" });
    await denied(
      () =>
        db.query("select public.save_lead($1,2,$2::jsonb,false,'')", [
          leadId,
          JSON.stringify(payload),
        ]),
      "INVALID_LEAD_STATE",
    );
  });
  it("manages another owner's calendar while retaining owner/history and actor attribution", async () => {
    const event = "90000000-0000-4000-8000-000000000001";
    const data = {
      title: "Designer visit",
      date: "2026-10-20",
      end_date: "2026-10-20",
      time: "",
      end_time: "",
      location: "Site",
      notes: "",
    };
    await actor(ids.designer);
    await db.query(
      "select public.save_calendar_event($1,0,$2::jsonb,false,'')",
      [event, JSON.stringify(data)],
    );
    await actor(ids.otherBdm);
    expect(
      (
        await db.query("select id from public.calendar_events where id=$1", [
          event,
        ])
      ).rows,
    ).toHaveLength(0);
    await denied(
      () =>
        db.query(
          "select public.save_calendar_event($1,1,$2::jsonb,false,'Forged')",
          [event, JSON.stringify(data)],
        ),
      "ACCESS_DENIED",
    );
    await actor(ids.admin);
    expect(
      (
        await db.query("select id from public.calendar_events where id=$1", [
          event,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "select public.save_calendar_event($1,1,$2::jsonb,false,'Superadmin date correction')",
      [event, JSON.stringify({ ...data, title: "Revised visit" })],
    );
    expect(
      (
        await db.query<{ owner_id: string }>(
          "select owner_id from public.calendar_events where id=$1",
          [event],
        )
      ).rows[0].owner_id,
    ).toBe(ids.designer);
    expect(
      (
        await db.query<{ owner_id: string }>(
          "select owner_id from public.calendar_event_history where event_id=$1 and version=2",
          [event],
        )
      ).rows[0].owner_id,
    ).toBe(ids.designer);
    expect(
      (
        await db.query<{ actor_id: string }>(
          "select actor_id from public.audit_events where entity_id=$1 and action='calendar.event_updated'",
          [event],
        )
      ).rows[0].actor_id,
    ).toBe(ids.admin);
    await db.query(
      "select public.save_calendar_event($1,2,'{}',true,'Superadmin cancellation')",
      [event],
    );
  });
  it("manages a selected recipient inbox without granting other roles cross-inbox access", async () => {
    const id = (
      await db.query<{ id: string }>(
        "insert into public.notifications(recipient_id,message) values($1,'Recipient notice') returning id",
        [ids.designer],
      )
    ).rows[0].id;
    await actor(ids.bdm);
    expect(
      (await db.query("select id from public.notifications where id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    await denied(
      () =>
        db.query("select public.mark_recipient_notifications_read($1)", [
          ids.designer,
        ]),
      "ACCESS_DENIED",
    );
    await actor(ids.admin);
    expect(
      (await db.query("select id from public.notifications where id=$1", [id]))
        .rows,
    ).toHaveLength(1);
    await db.query("select public.mark_notification_read($1)", [id]);
    expect(
      (
        await db.query<{ actor_id: string }>(
          "select actor_id from public.audit_events where entity_id=$1 and action='notification.admin_marked_read'",
          [id],
        )
      ).rows[0].actor_id,
    ).toBe(ids.admin);
    await db.query("select public.mark_recipient_notifications_read($1)", [
      ids.designer,
    ]);
  });
  it("still rejects inactive administrators", async () => {
    await db.query("update public.profiles set active=false where id=$1", [
      ids.admin,
    ]);
    await actor(ids.admin);
    await denied(
      () => db.query("select public.list_lead_suppliers()"),
      "ACCESS_DENIED",
    );
  });
});

describe("post-closure readiness revision", () => {
  async function setup() {
    await submit();
    const project = await accept(ids.designer, []);
    await createSpace(project);
    await actor(ids.admin);
    await db.query(
      "select public.transition_commercial_stage($1,'For Quotation','Under Negotiation','Ready for commercial review',true)",
      [project],
    );
    await db.query(
      "select public.close_project_deal($1,'Under Negotiation','1000',0,'Agreed price',true)",
      [project],
    );
    return project;
  }
  it("initializes readiness independently; requires Ordered and fresh acknowledgment; preserves Ops through rollback", async () => {
    const project = await setup();
    expect(
      (
        await db.query(
          "select status from public.space_readiness where space_id=$1",
          [spaceId],
        )
      ).rows[0],
    ).toEqual({ status: "Site Verification" });
    await db.query(
      "select public.change_space_status($1,1,'Completed','Design approved','')",
      [spaceId],
    );
    await actor(ids.designer);
    await db.query(
      "select public.change_space_readiness($1,1,'Ordered','Existing readiness reviewed')",
      [spaceId],
    );
    await denied(
      () =>
        db.query(
          "select public.change_space_readiness($1,2,'Revision','Designer rollback')",
          [spaceId],
        ),
      "ORDERED_TERMINAL",
    );
    await actor(ids.lead);
    await denied(
      () =>
        db.query("select public.handoff_ordered_spaces($1,$2,'Release')", [
          project,
          [spaceId],
        ]),
      "OPERATIONS_ADMIN_REQUIRED",
    );
    await db.query(
      "select public.handoff_closed_project($1,$2,'Operations assignment',true)",
      [project, ids.ops],
    );
    await db.query(
      "select public.handoff_ordered_spaces($1,$2,'Release ordered scope')",
      [project, [spaceId]],
    );
    await db.query(
      "select public.handoff_ordered_spaces($1,$2,'Idempotent release')",
      [project, [spaceId]],
    );
    const h = (
      await db.query<{ id: string }>(
        "select id from public.space_operational_handoffs where project_id=$1",
        [project],
      )
    ).rows;
    expect(h).toHaveLength(1);
    await actor(ids.ops);
    await db.query("select public.acknowledge_space_handoff($1)", [h[0].id]);
    await actor(ids.admin);
    expect(
      (
        await db.query<{ r: { ready: boolean } }>(
          "select public.operational_readiness($1) r",
          [project],
        )
      ).rows[0].r.ready,
    ).toBe(true);
    await db.query(
      "select public.change_space_readiness($1,2,'Revision','Rollback after site discrepancy')",
      [spaceId],
    );
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.project_memberships where project_id=$1 and membership_role='operations_admin' and is_primary",
          [project],
        )
      ).rows[0].user_id,
    ).toBe(ids.ops);
    await db.query(
      "select public.change_space_readiness($1,3,'Ordered','Revision resolved')",
      [spaceId],
    );
    expect(
      (
        await db.query<{ r: { ready: boolean } }>(
          "select public.operational_readiness($1) r",
          [project],
        )
      ).rows[0].r.ready,
    ).toBe(false);
    await db.query(
      "select public.handoff_ordered_spaces($1,$2,'Fresh release')",
      [project, [spaceId]],
    );
    await actor(ids.ops);
    const fresh = (
      await db.query<{ id: string }>(
        "select id from public.space_operational_handoffs where project_id=$1 and invalidated_at is null",
        [project],
      )
    ).rows[0];
    await db.query("select public.acknowledge_space_handoff($1)", [fresh.id]);
    await actor(ids.admin);
    await supplierSave();
    await actor(ids.ops);
    await logisticsSave(project);
    const blocked = (
      await db.query<{ r: { ready: boolean; blockers: { kind: string }[] } }>(
        "select public.operational_readiness($1) r",
        [project],
      )
    ).rows[0].r;
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers.some((b) => b.kind === "logistics")).toBe(true);
    let logisticsVersion = 1;
    for (const stage of [
      "Supplier Adjustments",
      "For Manufacturing",
      "In Transit",
      "Landed",
      "For Delivery",
      "Delivered",
    ])
      await logisticsSave(project, logisticsVersion++, stage);
    await actor(ids.lead);
    const ready = (
      await db.query<{ r: { ready: boolean; version: number; cycle: number } }>(
        "select public.operational_readiness($1) r",
        [project],
      )
    ).rows[0].r;
    expect(ready.ready).toBe(true);
    await db.query(
      "select public.complete_operations($1,$2,$3,true,'Final design, order and delivery verified')",
      [project, ready.version, ready.cycle],
    );
    expect(
      (
        await db.query<{ is_operationally_completed: boolean }>(
          "select is_operationally_completed from public.projects where id=$1",
          [project],
        )
      ).rows[0].is_operationally_completed,
    ).toBe(true);
    await denied(
      () =>
        db.query(
          "select public.change_space_readiness($1,4,'Revision','Need reopen')",
          [spaceId],
        ),
      "PROJECT_COMPLETED_REOPEN_REQUIRED",
    );
  });
  it("rejects conversion Ops assignment and installation writes; keeps milestone access scoped", async () => {
    await submit();
    await actor(ids.lead);
    await denied(
      () =>
        db.query(
          "select public.review_lead($1,1,'Accepted','',$2,'{}',$3::uuid[],null)",
          [leadId, ids.designer, [ids.ops]],
        ),
      "OPERATIONS_ASSIGNMENT_AFTER_CLOSURE",
    );
    const project = await accept(ids.designer, []);
    await createSpace(project);
    await actor(ids.admin);
    await denied(
      () =>
        db.query(
          "select public.save_installation($1,$2,0,'Scheduled',null,'Legacy endpoint',false)",
          [spaceId, project],
        ),
      "INSTALLATION_TRACKING_DISABLED",
    );
    await actor(ids.stranger);
    await denied(
      () => db.query("select public.project_milestones($1,0)", [project]),
      "ACCESS_DENIED",
    );
    await actor(ids.lead);
    const result = (
      await db.query<{ r: unknown[] }>(
        "select public.project_milestones($1,0) r",
        [project],
      )
    ).rows[0].r;
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("administrator password recovery audit", () => {
  it("logs the actual admin and target, validates active accounts and throttles duplicate requests", async () => {
    await actor(ids.admin);
    await db.query(
      "select public.record_password_reset_request($1,'User requested recovery')",
      [ids.designer],
    );
    const rows = (
      await db.query(
        "select actor_id,entity_id,new_value from public.audit_events where action='user.password_reset_requested'",
      )
    ).rows;
    expect(rows).toEqual([
      {
        actor_id: ids.admin,
        entity_id: ids.designer,
        new_value: { reason: "User requested recovery" },
      },
    ]);
    await denied(
      () =>
        db.query("select public.record_password_reset_request($1,'Again')", [
          ids.designer,
        ]),
      "RESET_RATE_LIMIT",
    );
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.ops,
    ]);
    await actor(ids.admin);
    await denied(
      () =>
        db.query("select public.record_password_reset_request($1,'Recovery')", [
          ids.ops,
        ]),
      "ACTIVE_ACCOUNT_REQUIRED",
    );
  });
  it("denies ordinary roles and inactive administrators without creating audit entries", async () => {
    for (const who of [ids.bdm, ids.designer, ids.lead, ids.ops]) {
      await actor(who);
      await denied(
        () =>
          db.query(
            "select public.record_password_reset_request($1,'Recovery')",
            [ids.designer],
          ),
        "ACCESS_DENIED",
      );
    }
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      ids.admin,
    ]);
    await actor(ids.admin);
    await denied(
      () =>
        db.query("select public.record_password_reset_request($1,'Recovery')", [
          ids.designer,
        ]),
      "ACCESS_DENIED",
    );
  });
});
