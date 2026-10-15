# Phase 1 live verification

Executed 13 October 2026 (Asia/Manila) in **project-tracker-dev**, `jlvlwkryasoducuucvxk`, explicitly authorized by the owner for One ODC staging. Production `qflmicucvbjfrjtndjgu` received no test users or business records during this task, and `.env.local` remains unchanged.

## Results

| Area                     | Verified against real Supabase                                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitations / identity   | Seven dedicated staging identities created using Auth invitation links, token verification and real password setup. Subsequent password sign-in and `getUser` verified all five roles plus other-BDM/unassigned negative actors. Synthetic invitation links were consumed through Auth; email delivery was not tested. |
| Provisioning             | Initial dedicated administrator activated through a targeted audited bootstrap. That real administrator session assigned/activated six dedicated users through `update_user_access`. Signup settings return `disable_signup=true`.                                                                                     |
| BDM leads                | Draft and submission persistence, actor-derived BDM, scoped reads, immutable submission snapshots; another BDM, Designer and Ops cannot read another BDM's lead.                                                                                                                                                       |
| Review                   | Return for Clarification, resubmit and Reject preserve remarks and submission/review histories. Accept verified through both API and browser.                                                                                                                                                                          |
| Exactly-once conversion  | Four concurrent authenticated acceptance requests and another repeat returned the same Project. A single origin row was confirmed.                                                                                                                                                                                     |
| Projects / roles         | BDM/Lead/assigned Designer see the related Project; other BDM/unassigned Designer do not. Personnel changes persist two assignment-history entries. Ops receives the safe pipeline preview but cannot fetch origins, team RPC or Lead details.                                                                         |
| Current role enforcement | An already-issued user JWT immediately lost lead read/write after deactivation and lead access after role change. The dedicated account was restored in `finally`.                                                                                                                                                     |
| Storage                  | Actual small bytes uploaded and provider size verified; signed URL issued only to the authorized account. Other BDM/Ops/unassigned accounts failed direct existing-object download and signed-URL requests. Archive denied new links; restore returned unchanged bytes.                                                |
| Large upload / recovery  | 13 MiB uploaded directly with TUS and downloaded with a matching SHA-256. Browser intercepted and failed one actual PATCH; retries recovered the transfer and verified the bytes. No file contents traversed a Next.js/Vercel body.                                                                                    |
| Submission / files       | Active unfinished uploads block submission. Archiving the unfinished reservation permits submission; the snapshot contains the ready version UUID and size, excluding archives.                                                                                                                                        |
| Browser                  | Real sign-in/out, BDM draft/save, upload/download/archive/restore, submission, Lead acceptance and Ops restrictions passed. Three authenticated browser tests.                                                                                                                                                         |

Eight live API tests passed. Local PostgreSQL tests remain independent of these real Auth/Storage checks. Credentials and server keys are excluded from reports and source control. Evidence: `artifacts/verification/live-phase1.json`, `live-browser.json`, `live-browser-resume.json`, and `staging-project.png`.

## Changes delivered

Saved Lead drafts now expose the private attachment panel when `ONE_ODC_ATTACHMENTS_ENABLED=true`: real progress, retry/resume with the same reservation/file, short-lived downloads, reasoned archive/restore and persisted ready/pending states. The pause race during asynchronous resume lookup was fixed and tested. Download links disappear from UI after their 60-second lifetime.

`phase1_file_limit` aligns new metadata/reserved-version validation with 50 MiB, blocks pending-upload submission and snapshots verified attachment version IDs. `attachment_parent_locks` takes parent locks and rechecks permissions for reservation/archive so those operations serialize with submission. Lead metadata-only historical snapshots remain distinct from verified files.

## Environment and migration history

Existing `tracker`, `tracker_private`, `tracker_api` schemas, 61 prior migrations and four tracker buckets remain separate. Initial staging exploration mapped seven existing Auth identities into new One ODC profiles under the owner's initial reuse approval. After the owner chose dedicated identities, seven dedicated accounts were created; the existing tracker Auth passwords and tracker roles were not altered. The dedicated credentials are in ignored `.env.verification` (mode 0600). Test fixtures have explicit staging names and retain their history; successful large-file fixtures were archived rather than physically removed.

The connector rejected the monolithic Phase 1 migration twice with expired request state. Its rolled-back dependent attempts made no schema change. The source Phase 1 migration was then applied as two ordered staging chunks; history therefore differs from production's four baseline entries:

| Staging version | Meaning                                           |
| --------------- | ------------------------------------------------- |
| 20261013082610  | Foundation                                        |
| 20261013083955  | Phase 1 core (first part of local Phase 1 source) |
| 20261013084007  | Phase 1 actions (remaining part of same source)   |
| 20261013084021  | RLS initialization-plan fix                       |
| 20261013084026  | Private attachments                               |
| 20261013085834  | New file limit / snapshot / pending guard         |
| 20261013090831  | New parent locks                                  |

Do not blindly push local migration history into this shared project: it includes a separate tracker migration lineage. Use reviewed application of the two new local migrations for production rollout; baseline schema content is equivalent despite staging versions. Auto-review rejected a broad profile-deactivation transaction; it was not executed. The replacement targeted only the newly dedicated administrator.

## Reproduce

With the ignored staging credential file already configured:

```sh
npm run test:live
npm run test:staging:browser
node scripts/staging-dev.mjs
```

The scripts refuse any target other than the explicitly authorized staging project. Browser preview is port 3002; its child process receives public Supabase configuration and the upload feature flag, not test passwords or the provisioning secret. Normal `npm run dev` still uses `.env.local` on port 3001. Live test reports contain IDs and results only; tracing/video are off for credentialed browser tests. No production JWT/secret is used.

## Remaining limits / rollout

- **Production rollout is pending.** Review/apply `20261013085045_phase1_file_limit.sql` and `20261013090652_attachment_parent_locks.sql`, then set `ONE_ODC_ATTACHMENTS_ENABLED=true` in the target server environment. Default is false; the metadata-only production UI remains available until rollout. No hosted deployment was performed.
- Email delivery/SMTP, branded invitation templates and the app's email-invitation form remain externally configured/unverified. The verified invitation test used Auth-generated links, not mailbox delivery. Full in-app administrator invite UI requires its server-only invitation key.
- The existing **50 MiB** cap is retained. Maximum-boundary uploads, prolonged offline/reload recovery, expired 24-hour TUS reservations and representative load are not verified. The successful larger test was 13 MiB; no 100 MB support is claimed.
- The PRD's mandatory-real-file gate is not enabled: metadata-only/no-file submission remains compatible with the existing Phase 1 scope. Pending real uploads are blocked. Decide the final file gate before production acceptance.
- File previews/content scanning, project-facing inheritance of pre-conversion Lead files, expanded entity associations, retention/orphan reconciliation and Spaces remain subsequent work.
- The shared staging advisor reports 117 pre-existing privileged RPC notices in `tracker_api`, outside One ODC's schema, plus Auth leaked-password protection disabled. No One ODC public RPC is security definer, and RLS remains enabled. These unrelated notices were not changed. [RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); [Auth protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
