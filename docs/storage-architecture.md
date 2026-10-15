# Supabase Storage architecture and rollout

The storage decision supersedes the PRD's former Google Drive choice. The original branding, business schema, lead/project workflow and metadata-only historical snapshots are preserved. No Google integration package was installed; four unused Drive environment variables were removed from the template. Existing local configuration did not require a storage-specific secret.

## Implemented foundation

Private bucket `one-odc-attachments`, with a 52,428,800-byte bucket cap. Supabase Storage owns file contents and object metadata; One ODC owns relational attachment identity, versions, associations, archive state and audit. There is no public URL or authenticated object overwrite/delete policy. Reservation and completion use the actor's session and active profile. Browser clients never receive a service/secret key.

Object paths contain stable Lead/Project, attachment and version UUIDs; display filenames may change across versions without moving old objects. New upload reservations create pending versions and record an audit. Storage INSERT accepts only that exact pending path, its active creator, matching current entity permissions, a nonarchived parent and a reservation younger than 24 hours. Completion verifies the actual size reported by Storage against the reserved size before setting ready state. It does not verify file-content MIME signatures or malware; safe previews require the checks below.

`src/lib/storage/provider.ts` retains a portable provider contract. `supabase.ts` implements reserve, TUS transfer, verified completion, signed download and archive/restore. Consumers must call reserve → transfer.start → complete, then refetch relational metadata. A transfer callback alone must never show Uploaded. Retry with the same reservation and file to resume; it must not reserve a new version on each retry. Reservations remain listable in metadata for recovery, and the saved-draft upload panel is integrated behind a server rollout flag.

TUS uses the direct `*.storage.supabase.co` endpoint, required 6 MiB chunks, bounded retry delays, persistent fingerprints including version ID and fresh session token forwarding per request. Pause retains server progress. A reload requires selecting the same file/version; a new reservation means a new upload. Provider TUS URLs expire after up to 24 hours. Expired reservations need a new version; audit retains failed attempts. [Resumable-upload documentation](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

Signed download requests use 60-second URLs with download disposition. Role/RLS authorization is checked by Storage at issuance. These are bearer links: archive/deactivation cannot revoke already issued links immediately; access remains possible until expiry. Do not persist them in database rows, audit, local storage or logs. App download-request audit records issuance intent, not proof of consumption; direct SDK download/sign calls can bypass app-level intent logging, and provider logs are needed for access evidence.

## Current conservative file permissions

| Role                 | Allowed file scope                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BDM                  | Own Lead general files; upload/replace/archive/restore only while Draft/Returned. General files in related Projects. No design/commercial/operations classes. |
| Designer             | General/design files in currently assigned Projects. No Lead files or restricted commercial/operations classes.                                               |
| Lead Designer        | Submitted/previously submitted Lead files; project files within assigned oversight. Lead file writes remain BDM-owner draft operations.                       |
| Operations Admin     | No project file classes before closure. After Closed, only operations-class files in assigned Projects. Never general/design/commercial files.                |
| System Administrator | Project attachment oversight; eligible submitted Lead read scope follows existing lead RLS. No impersonated BDM draft upload.                                 |

These classifications are a conservative initial implementation, not approval of unresolved PRD attachment-classification decisions. Metadata uses the same scope and may list archives; Storage object reads deny archives. Ready versions stay readable by authorized users so old versions are preserved. Pending objects are readable only by their creator. No byte access is granted to other active project members until verified completion.

Archive/restore requires a reason and current write permission and appends audit events. Archive never calls Storage remove. Restoration checks the lead's five-active-file limit. No permanent delete or automated orphan cleanup is implemented; unfinished reservations and uploaded-but-unfinalized objects need a future admin reconciliation screen with a reviewed retention policy.

## Associations and preview plan

Current foreign keys support real Leads and Projects only. Do not accept arbitrary entity UUIDs before corresponding tables/authorization exist. Extend with concrete links and policies for Spaces, Activities, Quotations, Site coordination, Supplier/logistics records and Installation as those Phase 1/subsequent workflows become functional. Lead conversion preserves the original Lead association. Before showing those files in a Project, add origin-derived authorization/association snapshots without copying bytes or widening Ops access.

Preview is prepared as a rollout task: show name/type/size/version and signed download now at provider level; add image/PDF preview only after content validation and in an isolated viewer with short-lived authenticated URLs. HTML/SVG and unknown types download only. No inline preview UI or content scanner exists in this change. Preserve each version in quotation/submission snapshots by version UUID rather than selecting the latest mutable filename.

## Limits and configuration

Existing Supabase URL/publishable key and the current user's session are sufficient for this provider. `SUPABASE_SECRET_KEY` remains optional for account invitations, not required for uploads. The migration is applied to existing One ODC `qflmicucvbjfrjtndjgu`, main/production; other projects were untouched. Local config declares the same private bucket and 50 MiB cap.

[Supabase Free's maximum global file limit is 50 MB](https://supabase.com/docs/guides/storage/uploads/file-limits). The 100 MB target currently uses the existing 100 MiB implementation convention (104,857,600 bytes); confirm the convention before rollout. To enable it: obtain a suitable plan, set the global Storage upload limit to at least 104,857,600 bytes, change this bucket's cap through a new migration/API, align local `config.toml`, and run real boundary/recovery tests. Do not claim the bucket value alone overrides the global cap. Also check actual project storage/egress quotas and available capacity in the dashboard before five-file/500-MB workloads; quotas are not verified by the current schema check.

## Next steps and release gate

1. Verify the real administrator invitation/password session and provision test BDM/Lead/Designer/Ops identities through the existing workflow. No password or test auth bypass is added.
2. Wire uploads to saved editable Lead drafts, keep up to five actual relational attachments, and include version IDs in immutable submission snapshots. Keep the existing metadata-only workflow functional until this is verified.
3. Test actual successful small uploads, size mismatch/limits, replacement, signed download and archive/restore across roles. Test unauthorized existing-object access through direct Storage API, not just UI/RPC.
4. Test pause/reload/offline recovery and expired TUS sessions on representative large files. Run a real 100 MiB transfer only after plan/global limits permit it. Keep file contents outside Next.js/Vercel request bodies.
5. Restore the PRD's mandatory-file submission gate only after verified upload integration; proceed with Spaces/core project work before advanced document management.

Live anonymous upload/download/sign/reservation requests are denied and the private bucket/RLS settings were queried. This earlier anonymous-only verification has been superseded by actual password-session and interrupted-transfer staging tests in `phase1-live-verification.md`. A publishable key or SQL-set claims alone remain insufficient proof. No secret was extracted and no synthetic Auth identity was created. Unit TUS tests use a mock; PostgreSQL tests model Storage metadata/RLS and do not claim real object bytes or a TUS server.

## Current verified implementation

Authenticated small uploads, 13 MiB TUS transfers, direct authorization denial, signed download, archive/restore and byte integrity are now verified in staging. The browser recovered an intentionally failed PATCH and verified SHA-256. Saved Lead drafts have a private upload panel with progress/retry/resume; pending uploads cannot be submitted, and ready version IDs are snapshotted. See `phase1-live-verification.md`. The cap remains 50 MiB; 100 MB support is not delivered.

The two completion migrations are staged, not production-deployed. Enable `ONE_ODC_ATTACHMENTS_ENABLED=true` only after applying them. Metadata-only historical snapshots and the existing no-file submission scope remain intact; the mandatory-file gate is still a pending acceptance decision. Full offline/reload, expiration, maximum-size and load verification remain open.
