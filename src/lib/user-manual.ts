import { roles, type Role } from "./domain";
export const manualCategories = [
  "Getting Started",
  "Projects",
  "Spaces",
  "Work",
  "Orders",
  "Reports",
  "Settings",
] as const;
export type ManualCategory = (typeof manualCategories)[number];
export type Guide = {
  id: string;
  roles: readonly Role[];
  category: ManualCategory;
  title: string;
  summary: string;
  access: string;
  prerequisite: string;
  steps: string[];
  result: string;
  tip?: string;
  feature?: string;
  sources: string[];
};
const managers: Role[] = ["lead_designer", "system_administrator"];
const authors: Role[] = ["bdm", "system_administrator"];
const design: Role[] = ["designer", ...managers];
const operations: Role[] = ["operations_admin", ...managers];
function guide(
  id: string,
  allowed: readonly Role[],
  category: ManualCategory,
  title: string,
  summary: string,
  steps: string[],
  details: Partial<
    Omit<Guide, "id" | "roles" | "category" | "title" | "summary" | "steps">
  > = {},
): Guide {
  return {
    id,
    roles: [...new Set([...allowed, "system_administrator" as Role])],
    category,
    title,
    summary,
    steps,
    access:
      "Editable only within your assigned scope and the controls available to your role.",
    prerequisite:
      "Sign in with an active account and open an authorized record.",
    result:
      "The saved change appears after the page refreshes; errors keep the entry available for correction.",
    sources: [],
    ...details,
  };
}
export const manualRoleAccess: Record<Role, string> = {
  bdm: "Create your own quotation requests, monitor related projects, coordinate commercial decisions, and see authorized Sale/client-payment information. BDMs can close a negotiated deal without an Operations Admin assigned, and can record new client payments but cannot correct or void them. Space readiness and final project completion are not BDM actions. Raw costs and supplier payments are restricted.",
  designer:
    "Work in assigned projects and spaces, update design status and post-closure readiness, and edit authorized quotation drafts. You can mark an authorized Space Ordered but cannot roll it back or hand it off. Lead review, team access management, commercial closure and project lifecycle administration are restricted.",
  lead_designer:
    "Review routed leads, oversee your projects, manage assignments and design reviews, maintain authorized supplier/logistics and financial records, assign Operations after closure, release Ordered Spaces, roll Ordered Spaces back with a reason, and complete or reopen projects. This role cannot manage user accounts.",
  operations_admin:
    "Manage supplier master data and authorized operational records, acknowledge Ordered Space handoffs assigned to you, and work with supplier payments and Raw costs. You cannot change design/readiness statuses, roll back Ordered Spaces, or complete/reopen projects. Installation tracking is temporarily disabled. Before commercial closure, assigned projects have a limited pipeline preview. Client payments and Sale pricing are restricted.",
  system_administrator:
    "Superadmin: perform all role workflows across projects, including Send to BDM, Close deal, Mark Lost, handoff and acknowledgement. Manage all lead drafts, assignments, spaces, quotations, both payment directions, supplier/logistics records and operational controls, including reasoned Ordered rollback and final project completion. Installation tracking is temporarily disabled for every role. You can manage other users’ calendar events and selected notification inboxes. Actions retain your administrator identity and existing validation/history.",
};
export const manualGuides: Guide[] = [
  guide(
    "welcome",
    roles,
    "Getting Started",
    "Navigate your workspace",
    "Understand your role, records and the header controls.",
    [
      "Start on Overview. Use a metric or Action required item to open the matching authorized work.",
      "Use Projects to find accessible projects. Open a project to move between Overview, Spaces, Operations, Financials, Activity, Files and Discussion where enabled.",
      "Use Calendar, notifications and the appearance control in the header. Authorized supplier managers use the truck beside Calendar.",
      "Open the account menu → User Manual for My Manual. All Roles displays reference guides only; it does not change your account role.",
    ],
    {
      access:
        "View-only navigation; available records and actions follow your account role and assignments.",
      result:
        "You can find your current responsibilities without changing project data.",
      tip: "If an action is missing, check the record state and assignments before asking an administrator. Do not share account credentials.",
      sources: [
        "src/components/ui-r0/shell.tsx",
        "src/lib/workspace-session.ts",
      ],
    },
  ),
  guide(
    "access",
    roles,
    "Getting Started",
    "Understand access and record states",
    "Separate permission restrictions from workflow prerequisites.",
    [
      "Read the role description at the top of your manual. A project being visible does not mean every field can be edited.",
      "Check commercial stage, project lifecycle, design status and post-closure readiness separately; they track different workflows.",
      "If a record is Lost, cancelled, held or operationally complete, review its displayed restrictions before attempting changes.",
      "If a stale-version message appears, reload the latest record and review it before retrying. Contact your System Administrator for account-access problems.",
    ],
    {
      access:
        "Reference only. Viewing another role’s documentation grants no access.",
      result:
        "You can distinguish a read-only record from an editable workflow.",
      sources: [
        "src/lib/domain.ts",
        "src/lib/spaces.ts",
        "src/lib/workspace-session.ts",
      ],
    },
  ),
  guide(
    "find-project",
    roles,
    "Projects",
    "Find and monitor a project",
    "Search, filter, sort and open the Project Directory.",
    [
      "Open Projects from the sidebar. Search by the field offered in the toolbar, then apply the required filters.",
      "Choose a sort order, visible columns or grid/list view where offered. Use Previous/Next to move through results.",
      "Open the project name or row to inspect its overview, team, dates and next actions.",
      "Enable the Space readiness column to see counts at each post-closure stage. Mixed counts represent different Spaces, not one shared status. Open Spaces for individual records; design progress, Closed, Ordered and final project completion are separate.",
    ],
    {
      access:
        "View-only for monitoring. Project controls are restricted by role, assignment and lifecycle.",
      result:
        "The directory and opened record show only data authorized for your account.",
      sources: [
        "src/app/dashboard/projects/page.tsx",
        "src/components/ui-r2/directories.tsx",
      ],
    },
  ),
  guide(
    "new-lead",
    authors,
    "Projects",
    "Create a quotation request",
    "Capture the brief, save a draft, or submit it to a Lead Designer.",
    [
      "Open My Leads / Lead review → New request. Administrators select an active Responsible BDM; BDM requests belong to the signed-in BDM.",
      "Enter Project / Client Name, Address, Estimated Cabinetries and Lead Designer. Select Supplier / Brand from the active supplier masterfile when applicable. Add Date Needed and Notes if known.",
      "In Files and references, add up to 20 HTTPS links. This request form accepts external links, not new file uploads.",
      "Choose Save Draft to finish later. Reopen the draft from the lead directory to continue editing.",
      "Choose Submit Lead when required fields are complete. If duplicate detection warns you, review the existing requests and provide a valid override reason only when appropriate.",
    ],
    {
      access:
        "BDM: own requests. System Administrator: create for a responsible BDM and edit any Draft or Returned for Clarification request. Ownership and submission history remain preserved.",
      result:
        "Submission locks the brief and notifies the selected Lead Designer. Saving a draft does not submit it.",
      tip: "Existing brand-only requests keep their previous value. Inactive suppliers can remain on historical selections but are not offered as new choices.",
      sources: [
        "src/components/workflow-forms.tsx",
        "src/app/dashboard/actions.ts",
        "src/components/lead-fields.tsx",
      ],
    },
  ),
  guide(
    "clarification",
    authors,
    "Projects",
    "Respond to returned requests",
    "Update a request returned for clarification and resubmit.",
    [
      "Filter the lead directory by Returned for Clarification and open the request.",
      "Read the review remarks and submission history before editing the brief or its reference links.",
      "Correct the requested information, then choose Save Draft to continue later or Resubmit Lead to send it for review again.",
      "Verify the new submission in history. Accepted or rejected requests do not use this editable clarification workflow.",
    ],
    {
      access:
        "Responsible BDM or System Administrator; Submitted requests are locked.",
      result:
        "Resubmission records a new immutable brief snapshot and routes the review to the selected Lead Designer.",
      sources: [
        "src/app/dashboard/leads/[id]/page.tsx",
        "src/components/workflow-forms.tsx",
      ],
    },
  ),
  guide(
    "review-lead",
    managers,
    "Projects",
    "Review a lead and create its project",
    "Accept, return for clarification or reject a submitted brief.",
    [
      "Open Lead review and filter by Awaiting review (the Submitted status). Open the lead details.",
      "Read the submitted brief, references and previous reviews. Lead Designers review requests routed to them; administrators have oversight.",
      "Choose the review decision. Supply remarks when returning for clarification or rejecting.",
      "For acceptance, choose the Primary Designer and any Supporting Designers, then save the review. Do not assign Operations Admins during conversion; that assignment happens after commercial closure.",
      "Open the accepted Project from the lead. Spaces are created separately; estimated cabinetry counts do not create space records.",
    ],
    {
      result:
        "Acceptance creates or returns the existing linked Project; the submission and decision remain in history.",
      sources: [
        "src/app/dashboard/actions.ts",
        "src/app/dashboard/leads/[id]/page.tsx",
      ],
    },
  ),
  guide(
    "team",
    managers,
    "Projects",
    "Manage project assignments",
    "Set the primary/support team and transfer Lead Designer oversight.",
    [
      "Open the project and its Manage project team action from the overview or project menu.",
      "Select the primary designer and supporting designers. Operations assignment controls become editable after commercial closure; a Closed project can temporarily have no Operations Admin.",
      "For a Closed project, select Operations Admins and choose the primary Operations Admin from that team when needed. Enter a change reason and save. Assignment does not release Spaces; use the separate Ordered Space handoff workflow.",
      "To transfer Lead Designer oversight, use the separate Lead Designer selection and required assignment reason, then choose Assign Lead Designer.",
    ],
    {
      result:
        "Assignments and access update through the existing audited workflow; the new Lead Designer is notified.",
      tip: "Project and individual-Space assignments are separate. Changing the Operations team invalidates current Space handoffs; release and acknowledge the affected Ordered Spaces again. Historical assignments remain recorded.",
      sources: [
        "src/components/project-team-dialog.tsx",
        "src/app/dashboard/actions.ts",
      ],
    },
  ),
  guide(
    "commercial",
    ["bdm", "lead_designer"],
    "Projects",
    "Coordinate commercial progression",
    "Move a quotation toward negotiation, closure or Lost using your role’s controls.",
    [
      "Open the project and review its commercial stage and approved quotation information.",
      "Lead Designer or System Administrator: use the offered commercial action to progress to negotiation when ready, supplying the required reason and confirmation.",
      "Primary BDM or System Administrator: use the offered Close / Lost action when the client decision is confirmed. For closure, enter the required Sale price and reason, then explicitly confirm.",
      "Lead Designer or System Administrator: after closure, use Assign Operations Admin. In Operations, explicitly hand off selected Ordered Spaces; the assigned Operations Admin acknowledges each Space.",
    ],
    {
      access:
        "Lead Designer and BDM have distinct ordinary-role actions. System Administrators can perform all of these actions as superadmin without being assigned those roles.",
      result:
        "Commercial stage and handoff progress update independently from design and operational completion.",
      sources: [
        "src/app/dashboard/projects/commercial-actions.ts",
        "src/components/project-commercial-workflow.tsx",
      ],
    },
  ),
  guide(
    "create-space",
    managers,
    "Spaces",
    "Create and assign spaces",
    "Add real project spaces with deadlines and design ownership.",
    [
      "Open Project → Spaces → Create a space.",
      "Enter the space name, primary designer, optional supporting designers and design deadline.",
      "Provide the required change reason and save. Check the newly created row in the Spaces table.",
      "Open the row to adjust permitted details. Use Cancel space only when the space should be excluded, and provide the required reason.",
    ],
    {
      feature: "SPACES",
      result:
        "A Space with its own design status, assignments and deadline appears. On a Closed project it also starts at Site Verification for post-closure readiness. Cancelling preserves history and excludes it from active completion prerequisites.",
      sources: [
        "src/components/space-workspace-tools.tsx",
        "src/app/dashboard/projects/space-actions.ts",
      ],
    },
  ),
  guide(
    "design-status",
    design,
    "Spaces",
    "Update design status and handle revisions",
    "Use the space drawer to progress design work.",
    [
      "Open Project → Spaces and select the space. Check your assignment and its current status.",
      "In Edit space, select an available Next design status and enter the required change reason. Fill External approval reference when relevant.",
      "Designers progress assigned work from Not Started to In Progress and then Submitted. A For Revision space can return to In Progress or be submitted again.",
      "Lead Designers review submitted work and choose For Revision or Completed when permitted. System Administrators have administrative correction controls; document the reason.",
      "Save changes and confirm the status in the table. Project holds and other lifecycle restrictions may block editing.",
    ],
    {
      feature: "SPACES",
      access:
        "Designers update authorized assigned work; review/completion and administrative corrections are role-restricted.",
      result:
        "The space event history and equal-weighted project design progress reflect the saved state.",
      sources: [
        "src/lib/spaces.ts",
        "src/components/space-workspace-tools.tsx",
      ],
    },
  ),
  guide(
    "space-readiness",
    design,
    "Spaces",
    "Update post-closure Space readiness",
    "Track Site Verification, Revision, Site Mapping, Ready for Order and Ordered separately from design status.",
    [
      "Confirm the project is commercially Closed and Active with an open operational cycle. Open Project → Spaces and select an authorized Space.",
      "Find Post-closure readiness in the Space details drawer. Read its current readiness alongside the separate Design status section.",
      "Choose Next readiness status: Site Verification, Revision, Site Mapping, Ready for Order or Ordered. You may move between nonterminal stages as needed; select the actual verified stage rather than inventing intermediate progress.",
      "Enter Readiness change reason and choose Save readiness. When choosing Ordered, confirm the warning that ordinary readiness changes will be locked.",
      "Check the saved readiness in the Space table. Ordered makes the Space eligible for an explicit operational handoff; it does not automatically release the Space or complete the project.",
    ],
    {
      feature: "SPACES",
      access:
        "Designers edit primary/support-assigned Spaces. The assigned Lead Designer manages their project; System Administrators manage all projects. BDMs and Operations Admins do not edit readiness.",
      prerequisite:
        "Active account, authorized non-cancelled Space, and a Closed, Active project with an open cycle. Completed projects must first be reopened by a manager.",
      result:
        "Readiness changes and their reasons are recorded independently from design history and commercial closure.",
      tip: "Existing Closed incomplete Spaces start at Site Verification, not an inferred Ordered state. Review the real work and update readiness manually. Previously completed projects keep their history; when reopened, missing readiness starts at Site Verification and existing readiness is retained.",
      sources: [
        "src/components/space-details-drawer.tsx",
        "src/components/space-readiness-form.tsx",
        "src/app/dashboard/projects/readiness-actions.ts",
      ],
    },
  ),
  guide(
    "rollback-ordered",
    managers,
    "Spaces",
    "Roll back an Ordered Space",
    "Correct readiness while retaining the Operations Admin and prior handoff history.",
    [
      "If the project is Completed, reopen it first through Project controls and history. Reopening alone leaves Ordered statuses unchanged.",
      "Open Project → Spaces and select the Ordered Space. In Post-closure readiness, choose the actual nonterminal Next readiness status.",
      "Enter a clear Readiness change reason, choose Roll back Ordered Space and confirm the rollback warning.",
      "Verify the new readiness. The Operations Admin assignment, design status, supplier records and earlier history remain; that Space’s current handoff is invalidated.",
      "After corrections, mark the Space Ordered again. In Operations, explicitly hand it off again and have the assigned Operations Admin or System Administrator acknowledge the fresh handoff before completing the project.",
    ],
    {
      feature: "SPACES",
      access:
        "Assigned Lead Designer or System Administrator only. Designers, BDMs and Operations Admins cannot roll back Ordered Spaces.",
      prerequisite:
        "Closed, Active project with an open cycle and an authorized Ordered Space.",
      result:
        "Rollback is audited with its reason; previous receipts remain historical and no longer satisfy the Space’s current completion requirement.",
      sources: [
        "src/components/space-readiness-form.tsx",
        "src/app/dashboard/projects/readiness-actions.ts",
      ],
    },
  ),
  guide(
    "bulk-spaces",
    managers,
    "Spaces",
    "Bulk reassign spaces",
    "Move selected spaces to a new design team with a recorded reason.",
    [
      "Open Project → Spaces → Bulk reassignment. Checkbox selection appears only in bulk-selection mode.",
      "Select the required spaces (up to 100 per operation) and continue through the reassignment drawer.",
      "Choose the new primary designer and optional supporters, then enter a reassignment reason.",
      "Review the selected spaces and new assignments before applying the reassignment.",
    ],
    {
      feature: "SPACES",
      result:
        "The selected spaces receive the new assignments together; their history is retained.",
      sources: [
        "src/components/space-workspace-tools.tsx",
        "src/app/dashboard/projects/space-actions.ts",
      ],
    },
  ),
  guide(
    "quotation",
    design,
    "Work",
    "Create and edit quotation drafts",
    "Build space itemization and submit an authorized draft for review.",
    [
      "Open Project → Financials → Quotation. Review the selected quotation version and its state.",
      "Use the available draft-creation action to create a draft when the workflow allows it; choose an existing editable draft to continue work.",
      "Open a space’s item editor. Add descriptions, quantities and PHP unit prices; reorder or remove items as needed.",
      "Enter the required change reason and Save space items. Quantities allow three decimal places and PHP prices two; line totals round to centavos.",
      "Check saved subtotals and the project total, then Submit for Review with the required reason. Submitted quotations lock until the review workflow permits further edits.",
    ],
    {
      feature: "QUOTATIONS",
      access:
        "Designers edit permitted assigned space items. Lead Designers/administrators oversee reviews; visible actions also depend on quotation and project state.",
      result:
        "Saved draft values and submission history are retained by version.",
      sources: [
        "src/app/dashboard/projects/quotation-actions.ts",
        "src/components/quotation-editor.tsx",
      ],
    },
  ),
  guide(
    "quotation-review",
    managers,
    "Work",
    "Review a submitted quotation",
    "Approve a submitted quotation or return it for revision.",
    [
      "Open Project → Financials → Quotation and choose the submitted version from the version selector.",
      "Review each applicable space subtotal and its saved itemization. Use version comparison/history where available to understand changes.",
      "Choose Approve quotation or Return for Revision. Returning requires revision remarks; administrator actions require the displayed administrative reason.",
      "Confirm the review and verify the new state. Approved versions become available through the BDM’s authorized read-only quotation view.",
    ],
    {
      feature: "QUOTATIONS",
      result:
        "The decision and review history are recorded against the version; submitting a quotation does not close a commercial sale.",
      sources: [
        "src/components/quotation-review-form.tsx",
        "src/app/dashboard/projects/quotation-actions.ts",
      ],
    },
  ),
  guide(
    "assigned-work",
    ["designer"],
    "Work",
    "Plan assigned design and site work",
    "Use assigned Spaces and the calendar as your work queue.",
    [
      "Start on Overview. Open an Action required item or Open assigned projects to find the relevant project and space.",
      "For design work, open Spaces and review the design deadline, status and supporting assignments before making a permitted status update.",
      "After commercial closure, open a Space to update post-closure readiness. Ordered is locked for ordinary changes; managers may roll it back with a reason.",
      "Review Calendar for approaching dates and use Discussion for coordination. There is no separate generic task board or standalone Work module; use the record-specific status forms.",
    ],
    {
      result:
        "Design status and post-closure readiness retain separate histories.",
      sources: [
        "src/components/ui-r0/role-dashboard.tsx",
        "src/components/project-spaces.tsx",
        "src/components/project-installations.tsx",
      ],
    },
  ),
  guide(
    "activity-correction",
    ["designer", ...operations],
    "Work",
    "Correct a recorded project activity",
    "Revise an editable activity while preserving its previous versions.",
    [
      "Open Project → Activity and select the existing activity row. Inspect its details and earlier versions.",
      "If Correct activity is offered, open it and revise the permitted category, activity date, space, description or other fields shown.",
      "Enter the required change reason and save the correction. Follow any assignment/file-authorization restrictions in the form.",
      "Reopen the activity to verify the new description and correction history. Do not use activity correction to change a payment, space status or installation record; edit those through their own forms.",
    ],
    {
      feature: "MONITORING",
      access:
        "Only editable activities in the caller’s authorized project/space scope. The redesigned Activity tab has no Record Activity action.",
      result:
        "A new version preserves the previous recorded values and the correction reason.",
      sources: [
        "src/components/activity-workspace-view.tsx",
        "src/app/dashboard/projects/monitoring-actions.ts",
      ],
    },
  ),
  guide(
    "pricing",
    ["bdm", "lead_designer", "system_administrator"],
    "Work",
    "Read Sale pricing and client balances",
    "Understand client-facing amounts and approved quotation visibility.",
    [
      "Open Project → Financials. BDMs see authorized approved quotation versions, not unrestricted editable drafts.",
      "In Financial Management, read the authorized Sale value, client-payment total and client outstanding balance.",
      "BDM or administrator: use the available Sale adjustment action when a pricing correction is needed, enter the amount and reason, and save.",
      "Review adjustment history before making another correction. A quotation draft total is not a client payment or a supplier’s Raw cost.",
    ],
    {
      feature: "FINANCE",
      access:
        "Sale visibility is role-scoped. BDMs do not receive Raw costs, supplier payments or margin just by monitoring a project.",
      result:
        "You can distinguish quoted values, Sale adjustments and actual recorded receipts.",
      sources: [
        "src/app/dashboard/projects/finance-actions.ts",
        "supabase/migrations/20261018235000_payment_direction_permissions.sql",
      ],
    },
  ),
  guide(
    "client-payment",
    ["bdm", "lead_designer", "system_administrator"],
    "Work",
    "Record a client payment",
    "Log money received by ODC from its client.",
    [
      "Open Project → Financials → Financial Management → Client payments.",
      "Choose Add client payment. Enter payment date, PHP amount and payment method. Add a reference when available and the required change reason.",
      "Review the entry and record the client payment. Confirm that the posted amount contributes to client-payment totals.",
      "Lead Designer or administrator: use the permitted Correct or Void action for mistakes, supply the required reason and save. BDMs can add receipts but cannot correct or void them.",
    ],
    {
      feature: "FINANCE",
      access:
        "Client receipts: BDM, Lead Designer and administrator. Corrections/voids: Lead Designer and administrator only.",
      result:
        "Posted payments affect totals. Voided entries remain in history and are excluded from totals.",
      tip: "Supplier/manufacturer payments belong in Supplier payments, not Client payments.",
      sources: [
        "src/app/dashboard/projects/finance-actions.ts",
        "supabase/migrations/20261018233000_bdm_client_payment_recording.sql",
      ],
    },
  ),
  guide(
    "supplier-directory",
    operations,
    "Orders",
    "Manage Supplier/Brand Masterlist",
    "Create and update supplier contacts and availability.",
    [
      "Select the truck icon beside Calendar in the header to open Supplier/Brand Masterlist.",
      "Search, filter by availability or sort the directory. Open a supplier row to edit, or choose Add supplier.",
      "Fill Supplier name, Contact person, Contact details, Brand, Active supplier and Remarks as applicable. Enter the required Change reason.",
      "Choose Save supplier and check the success message. Use Cancel to dismiss the editor without saving.",
    ],
    {
      feature: "LOGISTICS",
      access:
        "Operations Admin, Lead Designer and administrator. BDM request forms receive only active supplier names/brands, not masterfile-management access.",
      result:
        "Master data changes are logged. Existing project associations remain intact; audit-history controls are not displayed in this directory.",
      sources: [
        "src/components/ui-r4/supplier-directory.tsx",
        "src/components/logistics-form.tsx",
      ],
    },
  ),
  guide(
    "assign-operations",
    managers,
    "Projects",
    "Assign Operations after commercial closure",
    "Assign the primary Operations Admin without automatically handing off Spaces.",
    [
      "Wait for the Primary BDM or System Administrator to close the negotiated deal. The assigned Lead Designer is notified that Operations assignment is needed; closure can happen without an Operations Admin.",
      "Open the Closed project and choose Assign Operations Admin when offered. Select an active primary Operations Admin, enter the required reason and confirm. Existing Closed-project Operations assignments can also be managed in Manage project team.",
      "Verify the saved primary assignment. The assigned Operations Admin is notified and project access follows the saved assignment and commercial state.",
      "Keep existing valid assignments on older Closed projects unless a real personnel change is needed. Do not infer that assignment means any Space has been handed off.",
      "Open Operations for explicit handoff of Ordered Spaces. Reassigning the Operations team invalidates current Space handoffs; release and acknowledge the affected Ordered Spaces again.",
    ],
    {
      feature: "HANDOFF",
      access:
        "Assigned Lead Designer or System Administrator. Operations Admins do not assign themselves; BDMs close the deal but do not assign Operations.",
      prerequisite:
        "Commercially Closed project that permits assignment changes, and an active Operations Admin account.",
      result:
        "Assignment and notification are recorded with audit history. Unready Spaces remain unhanded-off.",
      sources: [
        "src/components/commercial-stage-form.tsx",
        "src/components/project-team-dialog.tsx",
        "src/app/dashboard/projects/commercial-actions.ts",
      ],
    },
  ),
  guide(
    "release-ordered-spaces",
    managers,
    "Orders",
    "Hand off selected Ordered Spaces",
    "Release ready Spaces in batches while other Spaces continue their readiness work.",
    [
      "Confirm an active primary Operations Admin is assigned to the Closed project. Keep the project Active and reopen it first if it is Completed.",
      "Open Project → Operations → Space operational handoff. Review each Space’s readiness and current handoff state.",
      "Select the Ordered Spaces to release, up to 100 per action. Unready Spaces and Spaces already holding a current handoff are not selectable.",
      "Enter Handoff reason and choose Hand off selected Ordered Spaces. Verify Pending acknowledgment for each released Space; the assigned Operations Admin receives a notification.",
      "Wait for the assigned Operations Admin or System Administrator to use Acknowledge Space handoff for each released Space. Repeat for later batches as their Spaces become Ordered.",
    ],
    {
      feature: "HANDOFF",
      access:
        "Assigned Lead Designer or System Administrator releases Spaces. The assigned primary Operations Admin or System Administrator acknowledges them.",
      prerequisite:
        "Closed, Active project with an open cycle, an active primary Operations Admin, and selected non-cancelled Ordered Spaces.",
      result:
        "Each Space has its own current handoff and acknowledgment history. Unselected Spaces are not automatically handed off.",
      tip: "Ordered, handed off and Acknowledged are separate conditions. A manager rollback requires a fresh handoff even when the assigned Operations Admin has not changed.",
      sources: [
        "src/components/space-handoffs.tsx",
        "src/app/dashboard/projects/readiness-actions.ts",
      ],
    },
  ),
  guide(
    "handoff",
    ["operations_admin"],
    "Orders",
    "Acknowledge Ordered Space handoffs",
    "Review the closed project before accepting operational responsibility.",
    [
      "Open the handoff item from Overview or the assigned Project → Operations.",
      "Review the Ordered Spaces released to you under Space operational handoff. Only their assigned Operations Admin or System Administrator may acknowledge them.",
      "Use Acknowledge Space handoff for each released Space assigned to you. A System Administrator may acknowledge it under their own identity; other Operations Admins cannot acknowledge your receipt.",
      "Verify each Space changes to Acknowledged. If its Ordered state is rolled back, your Operations assignment remains but the prior receipt no longer satisfies completion: wait for a fresh release and acknowledge it again.",
    ],
    {
      feature: "HANDOFF",
      result:
        "Your acknowledgment is recorded against that Space’s current handoff, not every Space in the project. Creating a supplier payment or assigning an Operations Admin does not acknowledge any handoff.",
      sources: [
        "src/app/dashboard/projects/readiness-actions.ts",
        "src/components/space-handoffs.tsx",
      ],
    },
  ),
  guide(
    "logistics",
    operations,
    "Orders",
    "Track RFP and supplier logistics",
    "Record project-level supplier progress separately from readiness and payments.",
    [
      "Open a commercially Closed Project → Operations → Supplier & Logistics → Add logistics record. Ordinary logistics changes require a current acknowledged Ordered Space handoff; valid historical project receipts remain supported for existing projects.",
      "Choose an active supplier, optional brand/reference and remarks. Save the new record in the allowed initial RFP stage with the required reason.",
      "Open the record and use Edit logistics / change status. Progress through the permitted stages: RFP, Supplier Adjustments, For Manufacturing, In Transit, Landed, For Delivery and Delivered.",
      "Use On Hold or Cancelled when appropriate. Backward or terminal corrections, or a permitted handoff exception, require the documented manager override and a reason; Operations Admins cannot grant themselves an override.",
      "Review actual recorded activity; skipped stages are not evidence of completed work. Requested/expected dates not recorded by the workflow remain Not recorded.",
    ],
    {
      feature: "LOGISTICS",
      result:
        "Supplier associations and status history remain preserved. Logistics records are project-level, not automatically linked to a particular Space. Every non-cancelled logistics record must be Delivered for project completion; RFP tracking does not create a payment or purchase order.",
      tip: "There is no standalone Orders/purchase-order automation in this workflow, and no automatic delivery delay can be inferred without dates.",
      sources: [
        "src/app/dashboard/projects/logistics-actions.ts",
        "src/lib/logistics.ts",
      ],
    },
  ),
  guide(
    "supplier-payment",
    operations,
    "Orders",
    "Record Raw costs and supplier payments",
    "Track ODC’s material/manufacturer costs separately from client receipts.",
    [
      "Open the authorized Project → Financials → Financial Management.",
      "Use the Raw adjustment action to record the supplier/material cost value, with the required reason.",
      "In Supplier payments, add the payment ODC made to the supplier/manufacturer. Enter date, PHP amount, method, reference and the required reason.",
      "Use the authorized correction or void action if needed; inspect the resulting totals and preserved payment history.",
    ],
    {
      feature: "FINANCE",
      access:
        "Operations Admin, Lead Designer and administrator within the financial access returned for the project. Operations Admin does not log client receipts.",
      result:
        "Raw and supplier-paid totals remain separate from Sale and client-paid totals. A logistics stage change does not move money.",
      sources: [
        "src/app/dashboard/projects/finance-actions.ts",
        "supabase/migrations/20261018235000_payment_direction_permissions.sql",
      ],
    },
  ),
  guide(
    "installation",
    ["designer", ...operations],
    "Work",
    "Installation tracking — temporarily disabled",
    "Installation scheduling and status updates are unavailable for every role; historical records are retained.",
    [
      "Do not look for an active Installation panel, scheduling action, dashboard widget or installation calendar entry: tracking is temporarily disabled for all roles, including System Administrators.",
      "For earlier installation changes, open an authorized Project → Activity and inspect its recorded history. Preserve those records; do not recreate them as readiness statuses or delivery events.",
      "Use Spaces → Post-closure readiness for current readiness work and Operations for Ordered Space handoffs and supplier/logistics updates.",
      "Use Complete Project only after the current design, readiness, handoff and logistics prerequisites are met. Historical installation statuses do not satisfy or block that checklist.",
    ],
    {
      feature: "INSTALLATIONS",
      access:
        "Historical viewing only, within existing project/history permissions. Installation creation, scheduling and status changes are disabled for every role.",
      result:
        "Existing installation data remains preserved without participating in active work or final project completion.",
      sources: [
        "src/lib/project-readiness.ts",
        "src/app/dashboard/projects/installation-actions.ts",
        "src/components/activity-workspace.tsx",
      ],
    },
  ),
  guide(
    "complete-reopen",
    managers,
    "Projects",
    "Complete and reopen a project",
    "Close an operational cycle after prerequisites are satisfied, or begin a new one.",
    [
      "Review Project → Spaces and Operations. Confirm every active Space is design-complete and Ordered, each current Space handoff is acknowledged, and all non-cancelled logistics records are Delivered.",
      "The project must be commercially Closed, Active, and have an open operational cycle. Open the Project actions (•••) menu → Complete Project and review the prerequisite checklist; resolve outstanding requirements before confirming.",
      "Enter a completion reason and confirm. Cancelled Spaces and Cancelled logistics records are excluded. Installation records and payment balances are not completion prerequisites.",
      "To reopen a completed project, use the project’s … menu → Project controls and history (Activity), then Reopen Project. Provide the required reason and confirm.",
    ],
    {
      feature: "MONITORING",
      result:
        "Completion records its actor and timestamp and appears in Project Timeline. Reopening starts a new cycle without resetting Space statuses, Operations assignments, commercial closure or previous completion history.",
      tip: "Commercial Closed, design Completed, readiness Ordered and final project completion are separate states. Only the assigned Lead Designer or System Administrator can complete or reopen the project. Reopening does not itself roll back an Ordered Space.",
      sources: [
        "src/components/installation-action-dialog.tsx",
        "src/components/monitoring-forms.tsx",
        "src/components/project-workspace/unified.tsx",
      ],
    },
  ),
  guide(
    "project-controls",
    managers,
    "Projects",
    "Manage deadlines, holds and site coordination",
    "Use authorized project controls without losing history.",
    [
      "Open the project’s … menu → Project controls and history, or its Activity controls view.",
      "Choose Update Deadline to set the project deadline/timezone with a reason; individual space design deadlines remain separate.",
      "Use the Site Coordinator control to select an eligible person and record the required reason.",
      "Use Hold/Resume or Cancel only when appropriate. Read the confirmation and lifecycle restrictions before saving.",
    ],
    {
      feature: "MONITORING",
      result:
        "Project control changes are audited; holds affect operational aging according to the recorded cycle.",
      sources: [
        "src/components/activity-workspace-view.tsx",
        "src/app/dashboard/projects/monitoring-actions.ts",
      ],
    },
  ),
  guide(
    "activity",
    roles,
    "Work",
    "Read activity and collaborate in Discussion",
    "Follow project history and messages without creating duplicate activity entries.",
    [
      "Open the authorized project’s Activity tab and use its available filters to inspect recorded changes.",
      "Open a history row for details. Manager controls and correction forms appear only for authorized users and records.",
      "Open Discussion, read messages in the internally scrolling chat panel, and send a message using the existing composer when permitted.",
      "Use notifications in the header to return to updates for your assigned work. A discussion message does not change a space, installation or payment status.",
    ],
    {
      access:
        "Activity visibility and discussion participation follow project access; restricted pipeline previews do not grant full history access.",
      result:
        "You can follow recorded events and communicate with the project team. Record Activity is not offered in the redesigned Activity tab.",
      sources: [
        "src/components/activity-workspace-view.tsx",
        "src/components/project-workspace/unified.tsx",
      ],
    },
  ),
  guide(
    "files",
    roles,
    "Work",
    "Read project notes and external references",
    "View the saved context available in the project’s Files tab.",
    [
      "Open the authorized project’s Files tab to read its saved Notes and external reference links.",
      "Open external references only after checking their destination. HTTPS links are not automatically downloaded or uploaded to One ODC.",
      "Edit Notes and resources and Project files and versions are no longer shown in this tab. It does not offer notes editing, file upload, replacement or archive controls.",
      "Existing saved notes, links, attachments and versions are retained. Contact your project manager if you need a document that is not available through the displayed references.",
    ],
    {
      access:
        "View-only within current project/resource permissions. Operations Admins retain their existing restricted Files view.",
      result:
        "You can read authorized saved context without changing or deleting resources.",
      tip: "Do not paste credentials or private signed URLs into public messages.",
      sources: [
        "src/components/project-resources.tsx",
        "src/components/project-workspace/unified.tsx",
      ],
    },
  ),
  guide(
    "resources",
    ["bdm", ...managers],
    "Work",
    "View saved project resources",
    "Review existing notes and HTTPS references in the Files tab.",
    [
      "Open the project’s Files tab and read the Notes section and any saved reference links.",
      "Use those links only after verifying their destination. References do not create new uploaded attachments.",
      "The Edit Notes and resources control has been removed from this tab. Existing data and history remain preserved; there is no editable resource form here.",
    ],
    {
      feature: "RESOURCES",
      access:
        "Read-only in the project Files tab, subject to existing project access.",
      result:
        "Saved project notes and references remain available without exposing editing controls.",
      sources: ["src/components/project-resources.tsx"],
    },
  ),
  guide(
    "calendar",
    roles,
    "Work",
    "Use Calendar and notifications",
    "Find permitted dates and manage your personal calendar entries.",
    [
      "Open Calendar from the header. Review permitted deadlines and your calendar events.",
      "Use the personal-event form to add or edit your own calendar event. System Administrators may also edit/cancel other users’ events; the original owner is preserved and the administrator is recorded as the actor.",
      "Open a linked project or Space to change its real deadline if your role permits it. Installation schedules are not active calendar entries while tracking is disabled. A personal event does not update project or Space records.",
      "Use the bell to read notifications and follow their authorized record links. System Administrators can choose a Notification recipient to view/manage another inbox; the header badge remains personal.",
    ],
    {
      feature: "CALENDAR",
      result:
        "Your personal schedule and permitted system dates are visible without granting access to unrelated projects.",
      sources: [
        "src/app/dashboard/calendar/page.tsx",
        "src/app/dashboard/calendar/actions.ts",
      ],
    },
  ),
  guide(
    "analytics",
    roles,
    "Reports",
    "Read Project Analytics",
    "Filter authorized KPIs, charts and the project breakdown.",
    [
      "Open Analytics from the sidebar. Set the Date Range and global Filters in the compact toolbar under the page heading.",
      "Read the KPIs and charts for that reporting scope; no data outside your authorized projects is included.",
      "Search, sort or filter Projects in this workspace. Use its rows-per-page and page controls; the directory scrolls independently.",
      "Open a project only if your account can access it. Treat Not available values as unavailable data, not zero.",
    ],
    {
      feature: "ANALYTICS",
      access:
        "View-only reporting. Financial visibility remains restricted by role; analytics cannot unlock hidden prices or costs.",
      result:
        "Global filters consistently scope KPIs, charts and the project cohort; directory controls narrow its displayed rows.",
      sources: [
        "src/app/dashboard/analytics/page.tsx",
        "src/components/ui-r0/analytics.tsx",
      ],
    },
  ),
  guide(
    "project-timeline",
    roles,
    "Reports",
    "Read the Project Timeline",
    "Review real project milestones separately from detailed Activity and audit records.",
    [
      "Open an authorized Project → Overview and find Project Timeline. Available milestones follow your role and project access; a restricted preview does not unlock the full history.",
      "Read the newest milestones first. Each entry identifies the recorded event, actor, timestamp and available context, such as a Space readiness change, closure, handoff, delivery or completion.",
      "Use Earlier milestones to see older entries and Newer milestones to return. Where source records exist and access permits, the timeline includes lead endorsement/approval, conversion, assignments and major design changes.",
      "Open Activity/history for detailed events and corrections. The Project Timeline is automatically assembled; do not manually add a milestone to recreate missing history.",
    ],
    {
      feature: "MONITORING",
      access:
        "View-only within authorized project access; some lead-related milestones are restricted for Operations Admins. Timeline viewing never grants editing or financial access.",
      result:
        "You can follow recorded project movements without treating missing historical events as proof that work did or did not happen.",
      sources: [
        "src/components/project-workspace/unified.tsx",
        "supabase/migrations/20261020131000_project_readiness_assignment_compatibility.sql",
      ],
    },
  ),
  guide(
    "operational-reporting",
    operations,
    "Reports",
    "Review operational reporting",
    "Use the implemented progress and history views for delivery monitoring.",
    [
      "Use Overview’s operational metrics and action items to open the matching authorized projects.",
      "In Operations, review individual Space readiness, current handoff acknowledgments and supplier/logistics records. Authorized managers open Project actions (•••) → Complete Project for its prerequisite checklist. Installation tracking is temporarily disabled.",
      "Read Project Overview → Project Timeline for major milestones, and Activity/history for detailed recorded changes. Do not infer delivery dates or completion of skipped stages.",
      "Use Project Analytics for authorized aggregate reporting. No standalone operations-report generator or purchase-order report is documented as available in the current workspace.",
    ],
    {
      access:
        "View-only reporting; edits belong to the dedicated operational forms.",
      result:
        "You can report on actual recorded operational state without combining it with client-payment records.",
      sources: [
        "src/components/ui-r0/role-dashboard.tsx",
        "src/components/project-workspace/unified.tsx",
      ],
    },
  ),
  guide(
    "team-access",
    ["system_administrator"],
    "Settings",
    "Invite users and manage roles",
    "Administer active accounts through Team access.",
    [
      "Open Team access from the sidebar. Search/filter users and inspect their current role and active state.",
      "Use Invite user and provide the fields required by the existing invitation form. Check any invitation-service configuration message before retrying.",
      "To change an existing user, open its access editor, choose the intended role/active state and provide the required reason.",
      "Save and verify the updated directory entry and access history. Self-deactivation or removing your own administrator access is blocked.",
    ],
    {
      access:
        "System Administrator only. Never rely on user-editable account metadata as permission authority.",
      result:
        "Changes use existing access checks and audit history; project-specific assignments still need their own workflows.",
      sources: [
        "src/app/dashboard/users/page.tsx",
        "src/app/dashboard/actions.ts",
      ],
    },
  ),
  guide(
    "maintenance",
    ["system_administrator"],
    "Settings",
    "Monitor access and handle maintenance requests",
    "Know the boundary between in-app oversight and deployment operations.",
    [
      "Review administrator Overview, Team access and available access history for invitations, inactive accounts and recorded changes.",
      "Investigate a user’s role, active state and project/space assignments before treating a missing control as a defect.",
      "For upload, invitation or module-configuration errors, record the affected screen and non-sensitive error text, then contact the deployment maintainer.",
      "Backups, database migrations, credentials and environment feature flags are maintained outside the application. There is no in-app configuration console, backup runner or deployment button in this manual.",
    ],
    {
      access:
        "View/access administration only. Deployment maintenance is outside the authenticated workspace UI.",
      result:
        "Maintenance requests can be escalated without exposing secrets or changing production infrastructure from the app.",
      sources: [
        "src/lib/workspace-session.ts",
        "src/app/dashboard/users/page.tsx",
      ],
    },
  ),
  guide(
    "appearance-support",
    roles,
    "Settings",
    "Adjust appearance and find help",
    "Use the existing appearance and support controls.",
    [
      "Open the appearance control in the header and choose an available theme.",
      "Open the coffee icon for Coffee Support. Buy me a coffee shows the supplied donation QR; Hire me shows the contact email and Copy Email.",
      "Use the account menu to return to User Manual or Sign out. Close the support modal with its close button, Escape or the backdrop.",
      "For access or business-record issues, contact your organization’s System Administrator. A self-service profile editor and standalone keyboard-shortcut settings are not implemented in this workspace.",
    ],
    {
      access:
        "Personal interface preferences and reference help; no business permissions change.",
      result:
        "Your workspace appearance can change while records and role permissions stay intact.",
      sources: [
        "src/components/ui-r0/shell.tsx",
        "src/components/coffee-support.tsx",
      ],
    },
  ),
];
export function guidesForRole(role: Role) {
  return manualGuides.filter((guide) => guide.roles.includes(role));
}
