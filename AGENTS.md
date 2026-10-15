<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## One ODC task context

Consult `docs/codex-context.md` first. Read only modules relevant to the active batch; use targeted `rg`/reads and exclude generated directories. Read the full PRD only to resolve missing or ambiguous business rules. Preserve verified Phase 1, existing branding and the generated Next.js instructions above. Work one Phase 2 batch at a time. Never apply production migrations or use production test data. Keep credentials in ignored local configuration and out of tool output/reports. Run targeted tests during edits and the full regression suite once at batch integration; avoid redundant reruns/full reports. Append short progress/results to `docs/implementation-status.md`.
