// Enrich the fictional walkthrough dataset through normal role-authorized RPCs.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.verification");
const env = process.env;
if (
  new URL(env.ONE_ODC_TEST_URL).hostname !== "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const path = "artifacts/verification/staging-refresh/manifest.json";
const state = JSON.parse(readFileSync(path, "utf8"));
if (state.records.length !== 8 || !state.verification)
  throw Error("Complete the base UAT seed first");
const clients = {},
  users = {};
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
const id = (k) => {
  if (!state.ids[k]) {
    state.ids[k] = randomUUID();
    save();
  }
  return state.ids[k];
};
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(state.createdAt));
const day = (n) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const project = (i) => state.steps[`sample${i}-accept`];
async function rpc(who, name, args, key) {
  if (Object.hasOwn(state.steps, key)) return state.steps[key];
  const r = await clients[who].rpc(name, args);
  if (r.error) throw Error(`${key}: ${r.error.message}`);
  state.steps[key] = r.data;
  save();
  return r.data;
}
try {
  for (const who of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    const c = createClient(
      env.ONE_ODC_TEST_URL,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const r = await c.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${who}_EMAIL`],
      password: env[`ONE_ODC_TEST_${who}_PASSWORD`],
    });
    if (r.error) throw Error("UAT sign-in failed");
    clients[who] = c;
    users[who] = r.data.user.id;
  }
  const events = [
    [
      "ADMIN",
      "UAT team access review",
      "One ODC workspace",
      1,
      "09:00",
      "09:30",
    ],
    [
      "LEAD",
      "Harbor View — quotation review",
      "Design studio",
      1,
      "10:00",
      "11:00",
    ],
    [
      "DESIGNER",
      "Acacia Residence — appliance clearance review",
      "Design studio",
      2,
      "14:00",
      "15:00",
    ],
    [
      "BDM",
      "Willow Penthouse — client brief clarification",
      "Client coordination call",
      2,
      "11:00",
      "11:30",
    ],
    [
      "OPS",
      "Casa Solana — supplier production check",
      "Supplier coordination call",
      3,
      "09:30",
      "10:00",
    ],
  ];
  for (const [who, title, location, offset, time, end_time] of events)
    await rpc(
      who,
      "save_calendar_event",
      {
        p_id: id(`uat-calendar-${who}`),
        p_version: 0,
        p_data: {
          title,
          location,
          date: day(offset),
          end_date: day(offset),
          time,
          end_time,
          notes:
            "Fictional UAT appointment. No external invitation or actual booking.",
          reason: "",
        },
        p_cancel: false,
        p_reason: "Fictional UAT schedule",
      },
      `uat-calendar-${who}`,
    );
  for (const [i, who, category, description] of [
    [
      0,
      "DESIGNER",
      "Design Work",
      "Kitchen layout updated for integrated appliances. Awaiting confirmation of refrigerator ventilation clearances.",
    ],
    [
      2,
      "LEAD",
      "Client Coordination",
      "Client received the approved cabinetry quotation and requested a finish-sample meeting before commercial confirmation.",
    ],
    [
      4,
      "OPS",
      "Supplier Update",
      "Supplier confirmed the warm-oak finish and soft-close hardware specification. Production review is scheduled before dispatch.",
    ],
  ])
    await rpc(
      who,
      "save_project_activity",
      {
        p_id: id(`uat-activity-${i}`),
        p_project: project(i),
        p_version: 0,
        p_space: null,
        p_category: category,
        p_date: date,
        p_description: description,
        p_coordinator: null,
        p_attachments: [],
        p_reason: "Fictional UAT coordination update",
      },
      `uat-activity-${i}`,
    );
  await rpc(
    "DESIGNER",
    "change_space_status",
    {
      p_id: state.ids["sample0-space0"],
      p_expected_version: 2,
      p_status: "Submitted",
      p_reason: "Kitchen layout ready for coordination review",
      p_approval: "",
    },
    "uat-space-submit",
  );
  await rpc(
    "LEAD",
    "change_space_status",
    {
      p_id: state.ids["sample0-space0"],
      p_expected_version: 3,
      p_status: "For Revision",
      p_reason:
        "Adjust appliance ventilation clearance and revise the island seating overhang",
      p_approval: "",
    },
    "uat-space-revision",
  );
  for (const [i, who, body, mention] of [
    [
      0,
      "LEAD",
      "Please confirm the refrigerator ventilation gap and the island seating overhang before resubmitting the kitchen layout.",
      "DESIGNER",
    ],
    [
      4,
      "OPS",
      "Supplier production check is booked. Please coordinate site access and lift protection before the delivery date is confirmed.",
      "BDM",
    ],
  ])
    await rpc(
      who,
      "save_project_comment",
      {
        p_id: id(`uat-comment-${i}`),
        p_project: project(i),
        p_space: null,
        p_version: 0,
        p_body: body,
        p_mentions: [users[mention]],
        p_reason: "",
      },
      `uat-comment-${i}`,
    );
  await rpc(
    "LEAD",
    "save_space_template",
    {
      p_id: id("uat-template"),
      p_source: project(0),
      p_name: "Residence — kitchen, wardrobe and utility",
    },
    "uat-template",
  );
  for (const who of ["LEAD", "DESIGNER", "BDM", "OPS"])
    await rpc(
      who,
      "remember_project",
      { p_project: project(who === "OPS" ? 4 : 0), p_favorite: true },
      `uat-favorite-${who}`,
    );
  state.uatDetails = {
    calendarEvents: 5,
    activities: 3,
    discussions: 2,
    templates: 1,
    favorites: 4,
    revisionRequests: 1,
  };
  save();
  console.log(JSON.stringify(state.uatDetails));
} finally {
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
}
