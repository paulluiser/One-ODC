# PRD v1.2 storage architecture amendment

Approved by the user on 13 October 2026 for One ODC. Read this alongside `Latest_Interior_Design_Project_Tracker_PRD_v1.2.docx`. The original supplied document remains unchanged; this explicit amendment supersedes all of its Google Drive provider, OAuth and folder-ID architecture references.

Use **private Supabase Storage** for project-related attachments and PostgreSQL for metadata/associations/version/audit records. Reuse existing Supabase Auth and public configuration. Enforce project/role/classification access in Storage RLS, reserve stable object identifiers, preserve replacements and soft archives, and transfer large files directly with TUS. Do not proxy file contents through Vercel serverless bodies or store them in business tables.

Business workflows, five roles, pricing, lifecycle requirements, association requirements and up-to-five/target-100-MB quotation-request files remain authoritative and unchanged. The provider change does not approve a paid upgrade or make metadata-only selections into uploaded files. The current Free plan cannot deliver the 100 MB target; rollout requires a suitable plan/global and bucket limits plus an authenticated recovery test.

See `storage-architecture.md` for implementation boundaries, permissions, configuration, file-preview plan and future associations. This amendment updates the PRD architecture without rewriting its approved business rules.
