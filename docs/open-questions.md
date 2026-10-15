# Open questions and decisions

## Confirmed

- One ODC for Opulence Design Concept; tagline Every space. One vision.; preserve Deep Blue and Light/Dark/System.
- The Phase 1 pasted execution request is user-authorized; the PRD supplies requirements context. Implement in the existing repo without rebuilding or deploying.
- Five predefined roles; invitation-only Auth; current-profile authorization; PHP currency for future financial MVP.
- Existing One ODC Supabase main/production is the authorized target. Public signup disabled with explicit approval. Local Site URL `http://127.0.0.1:3001` and `/auth/confirm` approved for computer-only testing.
- `paulluiser@gmail.com` receives the first administrator invitation; activated with a guarded audit. Human setup deferred by user.
- Number of Cabinetries is a positive integer at submission, never a Space generator or pricing basis. Ops optional at conversion, required before commercial closure. Lead may self-assign design work.
- Phase 1 explicitly defers actual uploads. Supporting files currently store metadata only, visibly Not uploaded. This supersedes the earlier foundation instruction to block submission on 1–5 real files. The PRD's real-file gate remains a future requirement after storage verification.
- Duplicate warnings compare the caller BDM's exact trimmed, case-insensitive name/address. This protects other BDM client details; broader duplicate matching needs an approved privacy-safe design.

## Configuration and acceptance outstanding

- Recipient accepts invitation and sets password; complete real-user sign-in/out and five-role workflow acceptance.
- Supply server-only `SUPABASE_SECRET_KEY` locally for in-app invitations; configure custom SMTP and hosted HTTPS URL before team rollout. Current free email plan locks template editing. Do not send secrets in chat or commit them.
- Separate environment projects and GitHub/Vercel staging deployment are not provisioned.

## PRD decisions retained

| PRD ID | Decision needed                                                               |
| ------ | ----------------------------------------------------------------------------- |
| OQ-04  | Meaning of SFY/Stosa/Both; exact options preserved                            |
| OQ-06  | Whether operational edits require acknowledged handoff                        |
| OQ-07  | Attachment classifications and BDM/Ops visibility after closure               |
| OQ-08  | Required Space list at initial lead versus conversion; no auto-generation now |
| OQ-09  | At Risk/stalled thresholds; 3/7 days not approved rules                       |
| OQ-10  | Overpayments, refunds and cancellation balances                               |
| OQ-11  | Sale minus Raw visibility; never label as net profit                          |
| OQ-12  | Quotation expiry/superseded behavior                                          |
| OQ-13  | Legacy spreadsheet migration scope                                            |
| OQ-14  | Verified 100 MB Supabase Storage upload feasibility                           |

DEC-001 through DEC-004 remain controlling. Operational completion applicability, file retention, full accessibility audit, load/concurrency testing and production release acceptance remain open.

The user officially replaced the PRD storage provider with Supabase Storage. The four former Google configuration variables are removed. OQ-14 now concerns verified Supabase TUS uploads, global/bucket plan limits, interrupted-upload recovery and the 100 MB target. Precise MB versus MiB convention should be confirmed before rollout; current upload and new metadata limits are 52,428,800 bytes (50 MiB); the larger target remains future work.

## Verification update

Staging environment and seven dedicated test identities were explicitly authorized. Real Auth, role provisioning, Phase 1 lifecycle, concurrent conversion and authenticated Storage now pass. `.env.verification` contains ignored local test credentials; production settings were preserved. Remaining decisions: production migration/upload-flag rollout, mailbox SMTP/in-app invitations, mandatory-real-file gate and full 50 MiB/offline/expiry/load acceptance. Earlier password-session/Storage-blocker notes are superseded by the live report.
