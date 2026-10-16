# One ODC visual contract — UI-R0

Status: UI-R0 explicitly approved; UI-R1 extends this baseline to the remaining role dashboards and Analytics. Scope excludes UI-R2 and other module bodies. Branch `codex/ui-r0-frontend-rebuild`, stable base `98086f4`. Existing pending calendar/UI work was carried into the isolated checkout; it is not newly implemented by UI-R0. Production and the original checkout remain untouched.

## Reference composition

Actual files in `docs/design-references/` were inspected before final review.

| Reference            | Reusable rule                                                                                                         | One ODC application                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 01 dashboard         | Narrow quiet sidebar, distinct context bar, four summary tiles with one dominant accent, asymmetric supporting panels | Light navigation rail, four linked KPIs, review queue beside workload, project cards, activity and upcoming dates                         |
| 02 project workspace | Page context separated from content; related actions near their records; restrained card grouping                     | Review Leads near greeting; quotation/space decisions link directly to their existing records. Project tabs remain outside this prototype |
| 03 visual style      | Soft blue-gray canvas, generous rounded surfaces, coherent breathing room                                             | Cool neutral canvas, white surfaces, lilac/peach/green supporting accents, restrained top-left wash                                       |
| 04 data layout       | Compact readable rows, consistent small controls, projects and activity as different information types                | Three initial attention rows plus disclosure, project cards, compact activity rows; no decorative business charts                         |
| 05 header structure  | Context/role left, calendar/bell/theme/avatar right                                                                   | Functional links and accessible menus in that order                                                                                       |

Preserve existing outlined wordmark SVGs, local Inter, Deep Blue **#2663D8**, and “Every space. One vision.” Use current authorized business data. No invented trends, avatars, messages, meetings or financial series.

## Measurable layout and tokens

- Frame: maximum 1840px; 16px outer inset; 224px rail; 20px shell gap; rail height `100dvh - 32px`, own vertical scrolling when necessary. At <=1200px: 200px rail, 12px inset, 16px gap.
- Header: sticky, 86px high, 26px horizontal padding; page title 22px/500, role 12px/400. Utilities 40px square, 20px Lucide icons. Menus anchor at the upper right and remain within the viewport.
- Content: 28px top inset; 20px vertical rhythm. Welcome 28px/500, supporting text 13px; primary action >=42px high. Four equal KPI columns, 16px gap, minimum 138px high, 39px tabular numerals.
- Main queue/workload: 1.55:1 columns, 20px gap. Three initial queue rows; all remaining returned attention items accessible through native disclosure. Main rows >=54px; titles 13px/500, supporting text 11px. Long names wrap instead of hiding decisions.
- Project cards: three equal desktop columns, minimum width zero; separate commercial stage, current work state and **design completion**. Never label design completion as operational completion. Activity/calendar form the final two-column group.
- Spacing steps: 4, 8, 12, 16, 20, 24, 28, 32px; 10px permitted for compact controls. Cards 16px radius, rail 20px, controls 10px; mobile cards 14px.
- Type: Inter 400/500/600; heading 28, section 18, project 16, body 13–14, compact supporting text 11–12px. Eyebrow 10px with tracking. Small mobile role context may wrap to two lines.
- Light: canvas #F4F6FB, surface #FFFFFF, soft #F7F8FC, text #18263D, muted #5E6C82, separator #E7EBF2; lilac #F2EFFA, peach #FCF1E9, green #EDF7F2, blue-soft #EDF3FF.
- Dark: canvas #101722, surface #1B2533, soft #222F40, text #EDF2FA, muted #A6B3C8; separator #354256; lilac #302D43, peach #3B3030, green #203B35; link #AFCEFF. Primary action background stays #2663D8 with white text.
- Borders: 1px quiet separators, no heavy panel outlines. Shadows reserved for floating utility menus. Color supplements textual status; unread dot also has a spoken unread count. Focus: 2px outline, 4px offset, #2663D8 light / #92B9FF dark.
- Icons: Lucide only, 18–20px actions, 14–17px supporting indicators; consistent baseline and flex alignment. Decorative icons hidden from assistive technology where needed; icon controls have accessible labels and native title tooltips.
- Buttons: one filled primary action per context, quiet secondary links, explicit destructive wording inside controlled workflows. Inputs in future approved modules: >=42px high, 12–14px padding, persistent labels, inline validation, visible focus; no new form workflow in UI-R0.
- Business tables in later approved modules: 13px body, 11–12px headings, >=48px rows, aligned numeric columns and scoped horizontal scrolling only when genuinely needed. Do not apply across modules before approval.

## Responsive and interaction rules

- <=900px: rail becomes a modal Radix drawer; Escape and close restore focus to its trigger. Two KPI columns; queue/workload and activity/calendar stack. Project cards use two columns until <=600px, then one.
- <=600px: 8px frame inset, 72px sticky header, 40×44px utility targets, 25px welcome, 34px KPI numerals, >=72px attention rows. All four utilities remain accessible. No page-level horizontal scrolling at 390px.
- Calendar and notifications navigate to existing implementations. Theme has one trigger with Light/Dark/System choices and selected state; existing next-themes preference persists. Account menu exposes existing authorized workspace/refresh/sign-out actions. Navigation remains role-specific; no impersonation selector.
- Loading: streaming dashboard skeleton announces busy/status; reserved card geometry; no fabricated counts. Startup and existing retry boundary remain active. Error boundary focuses its heading and offers real retry; restricted routes show explicit permission feedback.
- Empty states explain what will appear; never insert sample records. All database errors propagate to the existing boundary instead of rendering successful fallback data. Original files and business actions are unchanged.
- Motion: 160ms subtle hover transitions, 2px maximum lift; no navigation splash delay or looping decorative animation. Reduced motion disables hover transforms/transitions. Skeleton is static.

## Data and implementation boundaries

`src/components/ui-r0/` owns scoped CSS, shell, presentation primitives, loading and Lead dashboard. Dashboard layout/page/loading select this only with server-only `ONE_ODC_UI_R0_ENABLED=true`. `scripts/preview-ui-r0.mjs` enables it only for guarded staging at localhost:3003. No dependency, schema, migration, auth-policy, role, financial formula or deployment configuration change.

Use existing `role_dashboard`, `monitoring_summary`, `workspace_calendar` and authenticated project reads. Four KPIs retain the existing database definitions and links; workload bars are relative to the largest returned workload, not invented capacity percentages. Details/definitions/pagination remain accessible. UI-R1 authorizes the remaining dashboards and Analytics only; further module redesign requires explicit approval.

## UI-R1 — role dashboards and Analytics extension

Approved UI-R0 geometry, tokens, shell, navigation and Lead Designer appearance remain the baseline. New `role-dashboard.tsx`, `analytics.tsx` and `ui-r1.module.css` in `src/components/ui-r0/` compose its existing primitives. Page and Analytics routes use the same staging-only frontend flag; default original rendering remains available. No backend module, query definition, permission, formula, schema, migration or dependency change.

- Four primary dashboard tiles for each remaining role. Admin: users/invitations/access alerts/inactive accounts. Designer: assigned/due/revision/overdue Spaces. BDM: submitted/pending/clarification/commercial opportunity counts. Ops: active operational projects/handoffs/installations/delayed progress. Existing definitions and drilldowns stay available.
- Three initial actionable records plus disclosure; responsibilities sit alongside on desktop and stack on mobile. BDM Sale is a separate readable financial fact; no Sale/Raw data is added for Ops or Designer. Current logistics counts use the existing stage order, labeled as relative counts rather than cumulative completion.
- Analytics: compact filter disclosure, exactly four primary metrics, authorized current financial balances, two initial charts. Other metrics/charts remain available through disclosures; every value uses the existing service/calculation helpers. Monthly bars show all twelve default months at 390px; ranges exceeding available width use scoped chart scrolling with keyboard-accessible links.
- Financial facts: 22px desktop /19px mobile, tabular values, wrapping for very large amounts; dashboard Sale 25px. Unavailable primary values use 20px text with wrapping to preserve the two-column mobile geometry. Lead numeric tiles are unchanged. Theme/account triggers remain disabled until client hydration is ready, preventing dropped early clicks without changing their settled appearance.
- Native Analytics inputs/selects >=42px high, quiet surfaces, explicit accessible names. GET filters preserve the existing validation; selected chart/KPI records appear near the summary, with existing 25-row pagination. Invalid filters offer a reset; empty cohorts preserve unavailable ratios rather than inventing zero percentages.
- Dashboard/Analytics loading reuse the same static skeleton geometry with an accurate spoken destination. Existing focused retry boundary, permission alerts and theme persistence remain intact. Backend failure is not converted into a successful empty response.

### UI-R1 visual comparison

All role/Analytics surfaces retain UI-R0's 224px rail, upper-right calendar/bell/theme/account cluster, 86px desktop/72px mobile header, Inter hierarchy, 16px surfaces and restrained blue/pastel palette. Reference 01 guides four-tile summaries and asymmetric supporting content; 02 guides contextual actions; 03 guides soft surfaces; 04 guides compact record rows. No unsupported trends or decorative financial series were introduced. The Lead dashboard is a regression reference, not redesigned.

Evidence: `artifacts/verification/ui-r1/` (curated fresh captures; functional-run captures are in its `regression/` subdirectory), with `actor-{dashboard|analytics}-{light|dark}-{desktop|laptop|mobile}.png` for ADMIN, DESIGNER, BDM, OPS and LEAD at 1440×900, 1280×800 and 390×844. Fresh-page captures avoid stale sticky-header compositor artifacts observed during rapid headless resizing; the DOM has one header and no page-level horizontal overflow. Supporting mobile responsibility captures and unrelated-BDM empty-state captures verify lower content and unavailable values. Capture tool: `node scripts/capture-ui-r1.mjs [ADMIN DESIGNER BDM OPS LEAD]`, guarded to staging. Screenshots are ignored local artifacts.

Verification commands: `npm test`; `npx vitest run --config vitest.live.config.ts tests/live/ui-r1.test.ts`; `npx playwright test --config playwright.ui-r1.config.ts`; `npm run lint`; `npm run typecheck`; `npm run format:check`; `npm run build`. Run the build after browser/capture work with the isolated dev preview stopped, then restart it; do not share changing generated build manifests with an active acceptance run. Results and any focused retries are recorded in implementation status.

### UI-R1 reviewed examples and results

| Surface       | Desktop light                                                                   | Mobile dark                                                                   |
| ------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Administrator | [Capture](../artifacts/verification/ui-r1/admin-dashboard-light-desktop.png)    | [Capture](../artifacts/verification/ui-r1/admin-dashboard-dark-mobile.png)    |
| Designer      | [Capture](../artifacts/verification/ui-r1/designer-dashboard-light-desktop.png) | [Capture](../artifacts/verification/ui-r1/designer-dashboard-dark-mobile.png) |
| BDM           | [Capture](../artifacts/verification/ui-r1/bdm-dashboard-light-desktop.png)      | [Capture](../artifacts/verification/ui-r1/bdm-dashboard-dark-mobile.png)      |
| Operations    | [Capture](../artifacts/verification/ui-r1/ops-dashboard-light-desktop.png)      | [Capture](../artifacts/verification/ui-r1/ops-dashboard-dark-mobile.png)      |
| Analytics     | [Capture](../artifacts/verification/ui-r1/admin-analytics-light-desktop.png)    | [Capture](../artifacts/verification/ui-r1/ops-analytics-dark-mobile.png)      |

UI-R1 checkpoint: 194 local regression tests, seven staging identities/all five roles, seven distinct browser workflows passed after documented focused retries; full lint/types/format/build passed. All 60 required viewport/theme captures saved. Twenty mobile accessibility states have zero detected axe violations; incomplete rules and forced backend outage/retry remain outside verified acceptance. No production change. UI-R2 is not started. Detailed failures/retries and limits are in implementation status.

## UI-R2 — authorized core workspace extension

UI-R0/UI-R1 remain approved. UI-R2 applies their existing tokens/shell to Leads, Projects, Spaces and Activities only; finance/quotation/operations module bodies await UI-R3. Project cards distinguish commercial stage, lifecycle and design progress, with deadline/Lead Designer context. Lead rows group identity, status/aging and needed date; search/status/pagination remain nearby. Submitted briefs place authorized review controls adjacent to the request. The draft brief and optional resources/file guidance form separate columns, stacking on narrower screens.

Project overview uses a main Spaces/Activities column and a supporting team/recent-activity rail (stacked at <=1250px). Space rows expose name, primary Designer, status, deadline and risk before expansion; existing assignment/status/revision/cancellation forms remain within their record. Activities displays its real timeline and filters before secondary controls, measures and correction history. Technical identifiers and complete historical snapshots remain available through disclosures.

All UI-R2 disclosures use native `details`/`summary` semantics and actual Lucide ChevronRight icons at the right edge, rotating 90 degrees when expanded; browser triangles/custom pseudo-markers are suppressed inside the scoped rebuild only. Full header click targets are >=48px, keyboard focus is explicit, and reduced-motion disables rotation transitions. Existing navigation arrows remain for destinations, never as disclosure substitutes. Inputs >=42px, labels persistent; mobile rows stack rather than overlap. The original application and approved Lead Designer dashboard are unchanged. Final actual screenshot comparisons/results are recorded below after acceptance.

### UI-R2 visual acceptance evidence

Actual evidence: `artifacts/verification/ui-r2/manifest.json`,126 captures at 1440×900, 1280×800 and 390×844 in Light/Dark. Project/Lead directories, saved brief and draft, pending/acceptance review forms, workspace/expanded Spaces/Activities and five-role variants were captured. Final workspace/review captures replace earlier samples after chronological-list and deep-link scroll corrections; all 126 have no page overflow. The final sequential pass required no workspace retries. Reference 02 guided contextual workspace composition; 04 guided compact rows; 01/03 and approved UI-R0 guided rail, hierarchy, surfaces and restrained color. No unsupported business data or decorative controls introduced.

| Reviewed surface   | Desktop Light                                                                        | Mobile Dark                                                                        |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Projects           | [Capture](../artifacts/verification/ui-r2/lead-projects-light-desktop.png)           | [Capture](../artifacts/verification/ui-r2/lead-projects-dark-mobile.png)           |
| Workspace          | [Capture](../artifacts/verification/ui-r2/lead-workspace-light-desktop.png)          | [Capture](../artifacts/verification/ui-r2/lead-workspace-dark-mobile.png)          |
| Activities         | [Capture](../artifacts/verification/ui-r2/lead-activities-light-desktop.png)         | [Capture](../artifacts/verification/ui-r2/lead-activities-dark-mobile.png)         |
| Lead form          | [Capture](../artifacts/verification/ui-r2/bdm-lead-form-light-desktop.png)           | [Capture](../artifacts/verification/ui-r2/bdm-lead-form-dark-mobile.png)           |
| Review/assignments | [Capture](../artifacts/verification/ui-r2/lead-lead-review-accept-light-desktop.png) | [Capture](../artifacts/verification/ui-r2/lead-lead-review-accept-dark-mobile.png) |

Verified: native keyboard disclosures and chevron rotation, modal Escape/focus return, project/hash navigation after streaming, theme persistence, wrapping of long identities, real empty/validation states and role-safe Ops previews. Eight workspace mobile axe states show no detected violations; 16 incomplete rule results require manual follow-up. Parallel staging read failures and their successful isolated reruns are recorded in implementation status; load reliability and full manual accessibility/cross-browser acceptance remain outside this visual signoff. UI-R2 is ready for review; no automatic UI-R3 work or production change.

### UI-R3 quotation and finance composition

The approved rail, utility bar, local Inter, Deep Blue, 16px surfaces, restrained typography and Light/Dark tokens remain. Quotation prioritizes version/status/locked indication and saved PHP total, then space-based itemization. The draft editor uses labeled table controls with consistent Lucide reorder/remove actions and existing decimal calculations; lifecycle controls are hidden during item editing. Historical versions retain their actual space names/items; comparison/history use secondary disclosures with right-edge Lucide chevrons.

Finance separates approved quotation, Sale, Raw, valid client/supplier payments and actual outstanding balances. Role-redacted fields are never synthesized. Payment ledgers remain native, horizontally scrollable keyboard regions on small screens. Value adjustments, payment entries, correction and void editors open in themed accessible dialogs, retaining existing confirmations/reasons, pending states and audit history. Unsaved financial edits guard dialog dismissal and browser exit. No inferred profit, unsupported metrics or decorative controls. Visual evidence and verification limitations are recorded at the checkpoint in implementation status.

### UI-R3 visual acceptance evidence

Final set: 66 actual captures in `artifacts/verification/ui-r3/`, both themes at 1440×900,1280×800 and390×844; all five finance roles plus quotation overview, editor, comparison and contextual review/value dialogs. The final 24 quotation captures supersede initial versions after control spacing/history-card refinements. `final-quotation-captures.json` confirms 16 px editor gaps, compact closed history, review-field focus and no page overflow. Native scrollable tables preserve mobile containment. Ten mobile finance axe states detected no violations; 20 incomplete rule results and manual/cross-browser accessibility checks remain follow-up work. Approved UI-R0 shell/dashboard appearance is preserved. Full checkpoint and retry details are in implementation status.

| Surface               | Desktop Light                                                                     | Mobile Dark                                                                     |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Quotation item editor | [Capture](../artifacts/verification/ui-r3/quotation-editor-light-desktop.png)     | [Capture](../artifacts/verification/ui-r3/quotation-editor-dark-mobile.png)     |
| Historical comparison | [Capture](../artifacts/verification/ui-r3/quotation-comparison-light-desktop.png) | [Capture](../artifacts/verification/ui-r3/quotation-comparison-dark-mobile.png) |
| Financial workspace   | [Capture](../artifacts/verification/ui-r3/lead-finance-light-desktop.png)         | [Capture](../artifacts/verification/ui-r3/lead-finance-dark-mobile.png)         |

### UI-R4 operations and administration composition

Retain the approved compact shell, utility order, local Inter, Deep Blue and Light/Dark/System behavior. Supplier and user management are compact semantic directories with contextual editors; supplier name/brand/contact/status and user role/access lead each row. Technical identities and audit snapshots remain secondary disclosures. Operations separates handoff context, current logistics stage, Space installation responsibilities and grouped completion readiness. Existing backend blockers are grouped as Project/handoff, design, installation and logistics with direct source links. Status trackers indicate only the actual stage; earlier/skipped stages never receive completion styling.

Use native details/summary with right-edge actual Lucide ChevronRight (collapsed) / ChevronDown (expanded), Ellipsis beside contextual record actions, and the approved themed Radix editors/confirmations. Installation editors show current schedule/status and audited reasons; completion uses its existing explicit confirmation/focus handoff. Supplier and user dialogs preserve validation/pending feedback; no fabricated invitations or successful fallback. Readiness and operational status remain independent of financial records. Actual visual/checkpoint evidence is recorded after verification in implementation status.

### UI-R4 final visual evidence

Final 96 captures are in `artifacts/verification/ui-r4/`; `visual-checks.json` records 48 page states plus their contextual-dialog captures at all three approved widths and both themes. Directories, actual-stage logistics, ready and blocked installation/readiness, and Admin/Ops/Lead variants were inspected against UI-R0 and the original data-layout/workspace references. Desktop readiness and progress share a row; Space installation records use two columns, collapsing on mobile. Handoff facts are compact; Add/Invite uses Deep Blue; editing stays secondary. The repeated invitation title and technical setup copy were removed only in the rebuild.

The mobile logistics scroll defect found by axe was corrected and verified with keyboard ArrowRight. Sixteen final mobile axe states have zero detected violations and 32 incomplete rule results. Escape/focus return and System preference checks passed. No page overflow or significant overlap remained in final captures. Manual accessibility/zoom/screen-reader/cross-browser checks and invitation delivery remain unverified; implementation status records full results and retries.

| Surface           | Desktop Light                                                                 | Mobile Dark                                                                 |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Suppliers         | [Capture](../artifacts/verification/ui-r4/admin-suppliers-light-desktop.png)  | [Capture](../artifacts/verification/ui-r4/admin-suppliers-dark-mobile.png)  |
| Team access       | [Capture](../artifacts/verification/ui-r4/admin-users-light-desktop.png)      | [Capture](../artifacts/verification/ui-r4/admin-users-dark-mobile.png)      |
| Logistics         | [Capture](../artifacts/verification/ui-r4/ops-logistics-light-desktop.png)    | [Capture](../artifacts/verification/ui-r4/ops-logistics-dark-mobile.png)    |
| Installation      | [Capture](../artifacts/verification/ui-r4/ops-installation-light-desktop.png) | [Capture](../artifacts/verification/ui-r4/ops-installation-dark-mobile.png) |
| Blocked readiness | [Capture](../artifacts/verification/ui-r4/lead-readiness-light-desktop.png)   | [Capture](../artifacts/verification/ui-r4/lead-readiness-dark-mobile.png)   |

## UI-R5 — final review boundary

Approved UI-R0 shell, typography, geometry and Lead Designer appearance remain the baseline. UI-R5 made only objective corrections: readable brass brand-panel label in rebuilt Light login, one Light/Dark/System appearance menu on that login, and a valid mobile dialog container (desktop retains the aside landmark). Default original rendering remains unchanged.

The final review package is `ui-review/one-odc-final-review.zip`, with a filterable gallery, JSON/CSV manifest, four reference images, combined comparison and known issues. 338 actual staging captures / 57 role-state combinations cover all five roles, 1440×900 / 1280×800 / 390×844 in Light/Dark. Relevant menus, contextual editors, pending-lead review, quoted versions/comparison, readiness/completion, Calendar and notifications are included. Six genuine streaming loading captures have no forced delay. Wide tables/navigation scroll within their own regions; full-page quote editor/comparison images are marked in the manifest. Administration identity/access-trigger columns are privacy-redacted. The current application has no separate Settings route; real appearance/account utilities are represented instead.

Technical evidence: 213 local tests, 38 staging API tests and 38 comprehensive browser cases passed; final markup-only drawer correction passed three focused local checks and 15 all-role Chromium/Firefox/WebKit navigation checks. 106 final mobile axe states had zero violations and 187 incomplete results; manual assistive-technology and actual browser zoom remain outstanding. Invitation receipt was confirmed; link onboarding remains unverified. The user's email-redesign request was withdrawn without template changes.

Visual approval is pending. This package does not authorize production deployment or another redesign/development phase. Production/original application are unchanged. Historical intermittent staging reads remain an unresolved release risk despite healthy bounded checks.

### UI-R5 visual approval

2026-10-16: the user explicitly approved UI-R5 visually when commissioning M0. The approved appearance is now the baseline. Earlier pending-approval statements describe the original checkpoint; this approval resolves that visual gate only. Production deployment and additional feature scope remain separately gated.

## Opulence brand theme amendment — 2026-10-16

The user's Complete Brand Integration request supersedes Deep Blue as the **rebuilt frontend's** primary color. UI-R0–R5 layout, local Inter, geometry, shell, navigation and interaction contracts remain approved. This is a palette/asset amendment; visual approval of the new theme is pending. Original application defaults remain unchanged.

| Semantic token                         | Light                                                 | Dark                                                  |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Canvas                                 | `#F8F7F3`                                             | `#141518`                                             |
| Surface / secondary surface            | `#FFFFFF` / `#F2F0EA`                                 | `#202124` / `#292A2D`                                 |
| Text / secondary text                  | `#242321` / `#6D665C`                                 | `#F4F0E8` / `#B7B0A4`                                 |
| Primary / hover                        | `#CFA044` / `#C2963C`                                 | `#DAB56C` / `#E5C383`                                 |
| On primary                             | `#242321`                                             | `#242321`                                             |
| Link / focus                           | `#795514` / `#87601A`                                 | `#E1BC74` / `#E1BC74`                                 |
| Selected / decorative border           | `#F6ECD5` / `#E8E4DA`                                 | `#393122` / `#363532`                                 |
| Input / primary control border         | `#918576` / `#90691F`                                 | `#827B70` / `#DAB56C`                                 |
| Success / warning / destructive / info | `#276347` / `#8A5115` / `#A6332D` / `#285D95`         | `#A4D7B6` / `#F4CB8E` / `#F2AAA4` / `#B6D2F4`         |
| Chart series 1–5                       | `#94681A`, `#527B63`, `#4E719E`, `#876491`, `#A56132` | `#DAB56C`, `#91BEA1`, `#98B9E1`, `#C4A1CD`, `#E3AC84` |

`src/app/opulence-theme.css` owns semantic brand values, scoped to `html[data-one-odc-brand="opulence"]` when the existing rebuild flag is enabled. Shared legacy aliases and Tailwind/shadcn aliases resolve to these tokens. UI-R0–R4 module variables reuse them. Gold is restrained to primary actions, selected navigation and brand accents; text links use deeper accessible gold. Inputs and primary actions have contrasting borders. Destructive confirmations and literal status labels retain distinct semantics beyond color. Charts retain labeled, distinguishable series. Do not use white text on light gold, or primary gold as ordinary small text on white.

### Supplied SVG asset mapping

All six source files are preserved byte-for-byte under `public/brand/opulence/`; `asset-manifest.json` records SHA-256 values. Supplied emblem gold is `#D6A23F`; UI accent values are accessibility-adjusted. Vector paths, proportions and source colors are unchanged, with no external fonts or text reconstruction.

- Horizontal / compact: `display/one-odc-logo-light.svg` on Light surfaces and `display/one-odc-logo-dark.svg` on Dark surfaces. Display copies trim only the source SVG viewport's empty margin, with two units of safety padding; originals remain intact.
- Icon / collapsed mobile navigation: `one-odc-icon-transparent.svg` on charcoal; favicon: `one-odc-favicon.svg`. Supplied opaque light/dark icons remain available.
- `src/components/one-odc-logo.tsx`: horizontal, compact and icon variants; auto/light/dark theme; accessible name or explicitly decorative. CSS chooses the correct wordmark before hydration; login story uses a forced Dark wordmark on charcoal; the composition startup uses the theme canvas and automatic wordmark. No redundant header logo.
- Preserve the existing single Light/Dark/System appearance menu, early theme bootstrap and preference persistence. Loading is genuine; reduced-motion settings are respected. No forced splash duration.

Verification and manual follow-ups are recorded in the implementation status and the separate `ui-review/brand-redesign/` gallery. The approved UI-R5 package remains intact.

Brand review checkpoint: 362 actual screenshots (18 before, 344 after), including explicit full-page quotation forms/comparison and genuine loading/startup captures. 216 local tests, 38 distinct staging browser scenarios across the interrupted/resumed run, 15 role/engine checks, three login-engine checks and final lint/types/format/build passed. Three redirect checks passed focused retries. Final 108 mobile axe states detected zero violations; 181 incomplete rule results and manual screen-reader/actual zoom remain human follow-ups. See the separate brand gallery and implementation status for capture limitations, interruption history and prior release gates. Technical completion does not resolve the pending new-brand visual approval.

Startup-only amendment: use a centered, thin-outline composition of four panels, restrained Gold join accents and supplied wordmark above “Every space. One vision.” The panels fade/slide/scale into alignment in a gentle repeating 4.8-second assembly/hold/fade cycle; copy is never delayed. Theme canvas, text and logo follow Light/Dark/System. Reduced motion shows the complete static arrangement. No fake percentage, artificial dwell, human illustration or changes to the approved application shell. The isolated replay preview is explicitly labeled and does not add an application route or delay.
