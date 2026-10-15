# Permissions

Authorization is enforced by server identity/active-profile guards, action-specific role checks, table RLS and transactional RPC checks. Anonymous users have no table access or workflow RPC execute grants. Authenticated users have no direct INSERT/UPDATE/DELETE grants. Public RPCs are security invoker; private privileged implementations have explicit grants and fixed search paths.

| Role                 | Leads / review                                                                                  | Projects / assignments                                                                                                     | Administration                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| BDM                  | Create own drafts, submit/resubmit, read own lead snapshots/reviews; no other BDM records       | Read related membership-scoped projects and team/history; cannot assign                                                    | Own profile and notifications                                                         |
| Lead Designer        | Review submitted/history leads, accept/return/reject; cannot inspect unsubmitted private drafts | Assigned projects; acceptance assigns self as Lead; may self-assign design work; assign/reassign own projects              | Safe active assignment directory, own notices                                         |
| Designer             | No lead routes, lead tables or review RPC                                                       | Read currently assigned projects/team/history; no assignment edits                                                         | Own profile and notices                                                               |
| Operations Admin     | No leads, submissions or reviews                                                                | Limited assigned preview (name/reference/Lead account/commercial stage/handoff); no origin/team/assignment history payload | Own profile and generic notices                                                       |
| System Administrator | Review oversight of submitted/history leads; no BDM submission impersonation or private drafts  | All Projects; choose active Lead on conversion; assign/reassign personnel                                                  | Invite, assign roles, activate/deactivate, read audits; no self-demotion/deactivation |

Roles are loaded from `profiles` on each request/mutation, never from editable `user_metadata`. Active status is enforced in DB reads and writes; deactivated existing identities lose business scope immediately. Role changes do not rewrite historical assignments, but stale memberships cannot authorize a different current role. Assignment requires active compatible personnel. Primary BDM is preserved from the lead owner and must still be active BDM at conversion.

Operations Admin remains optional during initial conversion. Reassigning a commercially Closed Project cannot remove the last Ops Admin. No closure/operations mutation exists yet; future post-close detail permissions require dedicated policies rather than broad project membership.

Audits, submissions, reviews and assignment history reject UPDATE/DELETE. App security logging is actor-bound and allowlisted. Supabase Auth logs independently cover provider-level session/password events and failed sign-ins. User-provisioning UI requires backend configuration for invitations; role/activation changes use the current administrator's audited RPC.

Tests cover ownership, role mismatch, inactive identities, direct-write denial, immutable history, exactly-once conversion, invalid-assignment rollback, removed-Designer scope and Ops restrictions. Hosted checks verify RLS and grants on all ten tables plus no database security findings; Auth leaked-password protection remains disabled (Pro-only). Full real-user sign-in and browser acceptance across five accounts remain pending.

Site Coordinators remain tagged personnel, not a sixth authenticated role. Future design/quotation/finance/Drive/operations permissions retain PRD DEC-001 through DEC-004 and must be implemented separately. The public `/demo` contains fictional fixtures only.

## Storage provider change

Two additional metadata tables have RLS and no direct authenticated writes. Four storage RPCs use current actor/role validation. Storage INSERT requires the exact pending reserved path and active creator; SELECT requires attachment/classification scope. No object UPDATE/DELETE policy exists, preventing client overwrites or permanent removal. Archives hide object reads and preserve history; already-issued signed URLs expire after 60 seconds.

BDMs use owned editable Lead/general files and general files in related Projects; Designers use general/design files in current assignments. Assigned Lead Designers oversee Project classes. Ops sees no files before commercial closure and only operational-class files after closure. System Administrators oversee Project files; private Draft Lead rules remain unchanged. See `storage-architecture.md` for the conservative classifications and unresolved PRD permissions.

Nine PostgreSQL storage tests cover denied ownership/paths, missing/mismatched actual-size verification, replacement/archive/restore, five-file/plan limits, denied pre/post-close restricted Ops access and allowed assigned post-close operational access. Hosted private bucket and anonymous direct API denial are verified; real JWT-based role tests and successful transfers remain pending.

## Live acceptance update

Current-role/activation enforcement and cross-role denial now pass using real staging JWTs. Other BDM, Ops and unassigned accounts are denied direct downloads/signing of an existing file; authorized download, archive/restore and immutable version snapshots are verified. Ops UI confirms safe preview and blocked Lead routes. See `phase1-live-verification.md` for exact coverage and production rollout limits. RLS remains enabled throughout.
