# Phase 3 acceptance — staging only

14 October 2026, Asia/Manila. Acceptance checkpoint passed. Production schema, flags, users, records and deployment remain unchanged. No Phase 3D schema migration or new dependency.

## Verified scope

The retained quotation tests cover Designer drafts, submission locking, return/corrected drafts, sequential versions under concurrency, Lead approval/self-review, complete frozen Space/item snapshots and exact version comparison. BDM receives related Approved versions only; Operations receives no quotations.

The expanded financial API acceptance follows one synthetic staging Project through Designer pricing, Lead approval, BDM approved reads and Sale, Raw revisions, multiple client/supplier payments, corrections, concurrent voids, Space rename and Project cancellation. It asserts unchanged approved snapshots, actor/time/reason history, one event per successful version, immutable/direct-write restrictions, permitted historical corrections and scoped cancellation history. Authorized Project Timeline events remain visible while finance audit events stay excluded.

Deterministic PostgreSQL tests cover half-cent rounding, missing versus zero, exact signed formulas, maximum numeric(28,2) amounts and aggregate sums larger than individual record limits. PostgreSQL computes stored totals; strings and BigInt preserve display precision. Negative outstanding balances remain visible; voided payments remain in history and leave valid sums.

All five roles plus supporting BDM and unrelated accounts are covered by real password sessions/RLS. Primary BDM alone normally edits Sale; scoped Lead manages Raw/payments; related BDM/Designer sees actual payments but no Raw or Raw-derived outstanding. Admin overrides require reasons and audit. Anonymous requests/direct writes fail. Post-close Operations tests use the explicitly synthetic Closed fixture; they prove authorization, **not commercial closure or handoff**.

## Defect correction and UI acceptance

A successful financial save reset the whole fieldset, remounting its dialog trigger and losing keyboard focus. Reset now remounts only the fields, preserving the trigger, and restores focus after the action finishes enabling it. Voiding restores focus to the preserved payment heading when its editing controls disappear. The browser regression asserts focus restoration, pending/disabled confirmation, Escape protection during saving, stale-tab error with retained inputs/reload/retry, real quotation-to-finance flow, installments, revisions, corrections/voids, refresh/session persistence, role redaction of serialized page content, light/dark themes and 360 px reflow.

Automated WCAG 2.1 A/AA scans are recorded in `artifacts/verification/phase3d-accessibility.json`; retained earlier Phase 2/3 artifacts cover additional quotation/history/role states. Automation does not certify WCAG conformance. Manual VoiceOver/NVDA announcements, modal focus/contrast where axe is inconclusive, zoom/text spacing, forced colors and representative touch/user acceptance remain release tasks.

## Checkpoint results

- Local unit/PostgreSQL integration: **108 passed**.
- Real staging API/security/audit: **15 passed** across seven files.
- Public browser: **6 passed**; authenticated browser: **11 verified** (10 full-run passes plus finance-only successful rerun after focus corrections).
- New finance WCAG-tagged scans: **7 states, zero detected violations**. `aria-hidden-focus` and `color-contrast` have inconclusive cases requiring manual assessment.
- Lint, typechecking, formatting and production build: **passed**. Lint/types/build repeated after final focus changes; unaffected database/API tests were not redundantly rerun.

Initial targeted/full browser runs reproduced save/void focus defects. The pending-state test also required a route-handler sequencing correction; failed scenarios were rerun after fixes. Commands: `npm run check`, `npm run test:live`, `npm run test:e2e`, `npm run test:staging:browser`, `npm run format:check`. Chromium override is in the condensed context. SQL inspection confirms all nine quotation/finance tables retain RLS and deny authenticated direct INSERT/UPDATE/DELETE. Shared staging advisors retain 117 unrelated `tracker_api` definer notices and disabled leaked-password protection; no One ODC table/RPC notice. See [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) for that existing Auth configuration dependency.

## Phase 4 dependencies / release boundaries

Commercial closure, commercial handoff and real Operations activation remain unimplemented/unverified. Implement their approved prerequisites and transactional permissions before replacing synthetic Closed preconditions with real end-to-end tests. Operational completion/delivery/installation prerequisites remain deferred; this batch adds no accounting, supplier costing, invoices, refunds, gateway or payment schedule.

Production migration reconciliation/review and feature enablement/deployment remain unauthorized. SMTP/mailbox invitation acceptance, manual accessibility sign-off, mandatory-real-file decision, file previews/scanning/expanded associations and Storage stress/max-boundary/long-offline/expiry acceptance remain outstanding. File limit remains **50 MiB**. The staging-only financial checkpoint does not remove those production release blockers.
