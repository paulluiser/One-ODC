# UAT walkthrough data

Refreshed 2026-10-16 in **staging only** (`jlvlwkryasoducuucvxk`). All clients, suppliers, amounts and appointments are fictional. Accounts/passwords/roles are unchanged. Refresh the browser to discard cached views; bookmarks to removed regression fixtures will no longer resolve.

| Project                  | Useful UAT scenario                                                   |
| ------------------------ | --------------------------------------------------------------------- |
| The Acacia Residence     | Overdue design, kitchen revision request, Designer discussion mention |
| Harbor View Condominium  | Quotation awaiting Lead Designer review                               |
| The Courtyard Townhouse  | Approved quotation before commercial closure                          |
| Studio North Office      | Commercially closed, awaiting Operations acknowledgment               |
| Casa Solana              | Supplier manufacturing, partial payments, operational discussion      |
| Sierra Heights Residence | Delivered logistics, mixed installation completion                    |
| The Linden Apartment     | Completed design, delivery, installation and operations               |
| Garden Pavilion          | Project on hold                                                       |
| Cypress House Interiors  | Revised workflow: Closed, Ops handoff acknowledged                    |
| Maple Grove Residence    | Revised workflow: Closed at PHP 625000.50, pending Ops acknowledgment |
| Marina Loft Renovation   | Lost during ongoing kitchen design; project edits locked              |

Lead queue: **Parkside Family Home** is submitted; **The Willow Penthouse** needs clarification. The secondary BDM owns **Cedar Lane Renovation** (draft) and **Atelier East Showroom** (rejected), with no access to the other BDM's projects. The unassigned Designer has no projects. Operations sees restricted previews before closure.

Inventory after commercial-workflow acceptance: 15 leads, 11 projects, 21 Spaces, three suppliers, six payments, two private design briefs and one ready image reference, three manual activities, two discussions, one Space template, four personal favorites, and five new personal calendar events. One existing weekly coordination event was preserved. Deadlines are relative to the refresh date; audit timestamps are genuine, not backdated. External resource links use example.com and supplier contacts use reserved .example domains; no real booking, payment or email is implied.

The base seeder and enrichment scripts are resumable using ignored `artifacts/verification/staging-refresh/manifest.json`:

- `node scripts/refresh-staging-sample-data.mjs`
- `node scripts/seed-uat-details.mjs`
- Read-only smoke: `node scripts/verify-uat-readability.mjs`

These commands do **not** reset an existing seed. Do not delete its manifest and rerun without an inspected, backed-up reset: doing so would create duplicates. Never run mutating regression suites against the UAT projects. Old fixture-cache files were renamed `.obsolete-uat-2026-10-16`; historical screenshots and test evidence remain intact. Regenerate separate test fixtures before subsequent regression runs; they will reintroduce fixture records into this shared staging environment.

Recovery: restricted `private.staging_fixture_backups`, snapshot `56c1f3f1-b7c2-420f-b488-baed5e6521ed`, retains all 46 original business-table snapshots. Old Storage objects remain private for recovery and are absent from active attachment listings. Restore requires a reviewed privileged operation; never expose backups to browser clients.

The three additional commercial scenarios were created by `scripts/verify-commercial-workflow.mjs` and released through `scripts/verify-commercial-handoff-ui.mjs`, with their own ignored fixture manifest. The base refresh manifest still covers its original eight projects. New commercial stages are For Quotation → Under Negotiation → Closed; Lead-controlled Awaiting Handoff/Pending Acknowledgment is displayed separately. Primary BDM can mark an open deal Lost during design. Do not reopen or attempt to edit the Lost sample. Financial amounts are fictional, not actual payments.
