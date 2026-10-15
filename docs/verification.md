# Phase 1 verification results

Executed 13 October 2026, Asia/Manila. Detailed real-session evidence, staging boundaries, migration history and outstanding risks are in [phase1-live-verification.md](phase1-live-verification.md).

| Check                          | Result                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm run check`                | PASS: ESLint, strict TypeScript, 47 local tests, optimized Webpack production build                           |
| Local unit tests               | PASS: 17 domain/validation/provider tests, including 50 MiB limit and pause/resume-lookup race                |
| PostgreSQL integration         | PASS: 30 PGlite tests applying all six local migrations; Auth/Storage metadata shims are explicitly test-only |
| `npm run test:live`            | PASS: 8 real staging Auth/RLS/workflow/Storage tests; seven dedicated identities, five roles                  |
| `npm run test:staging:browser` | PASS: 3 actual authenticated staging browser workflows                                                        |
| `npm run test:e2e`             | PASS: 6 public/protected-route/responsive regression tests                                                    |
| `npm run format:check`         | PASS: repository formatting                                                                                   |
| Larger file recovery           | PASS: browser intentionally interrupted a 13 MiB TUS PATCH; retry completed and downloaded SHA-256 matched    |
| Supabase schema / policies     | 12 One ODC business tables with RLS; private bucket retains 52,428,800-byte cap; public wrappers are invoker  |
| Production deployment          | Not performed; two new migrations/upload enablement remain pending                                            |

Local tests cannot prove GoTrue/TUS correctness; the separate live tests now supply actual staging evidence. The live suite verifies drafts/submissions, Return/resubmit/Reject, concurrent/repeated acceptance, one originating Project, assignments/history, BDM monitoring, cross-role and existing-JWT deactivation/role denial, real file upload/download/archive/restore and pending-upload snapshot guards. Auth invitation tokens/password setup were exercised; email delivery was not.

Three authenticated browser tests verify genuine sign-in/out, draft upload controls, signed download bytes, archive/restore, submission, Lead acceptance, Ops safe preview/restricted Lead routes and network-interrupted transfer recovery. Live credentials are held in ignored `.env.verification` and stripped from the preview server's environment; tracing/video are disabled. No test accounts/business fixtures were created in production.

Earlier attempted browser runs failed on an exact-label selector and then on a real duplicate warning from reused fixture addresses. The selectors and fixture isolation were corrected; the final three-test run passed. An API rerun similarly exposed a reused address; the final eight-test run uses a unique per-run address and passed. These were not bypassed by weakening validation or RLS.

The stage security advisor's 117 RPC notices concern the separate pre-existing `tracker_api` schema. One ODC has no exposed security-definer wrappers. Auth leaked-password protection remains disabled. See the live report for links and scope. Full 50 MiB boundary, long offline/reload/expired-TUS/load tests, SMTP/email delivery, the mandatory-real-file gate, content scanning/previews and production rollout remain unverified or pending.
