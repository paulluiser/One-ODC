# UI-R0 visual comparison and focused acceptance

Prototype only; owner approval pending. Local URL: http://localhost:3003/dashboard. Use the existing staging Lead Designer account from ignored local verification configuration. Launch from this worktree with `node scripts/preview-ui-r0.mjs`; the original application stays on port 3002.

## Actual-render comparison

The original reference files were inspected alongside the rendered prototype. These are design observations, not similarity scores.

| Reference            | Alignment                                                                                                                                               | Intentional difference                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 01 dashboard         | Quiet narrow rail, distinct context header, four summary cards, dominant first tile, asymmetric queue/workload composition, projects and activity below | Blue brand accent; actionable reviews replace the illustrative activity chart. No unsupported trend percentages |
| 02 project workspace | Context and actions separated; record-level links, consistent card spacing and compact navigation                                                       | No board, tabs or project workspace rebuild in this batch                                                       |
| 03 visual style      | Cool soft canvas, rounded surfaces, pastel secondary tiles, coherent icon family                                                                        | Existing Inter and wordmark retained; no invented income/expense series or decorative avatars                   |
| 04 data layout       | Compact task rows, clear project cards, supporting activity after primary decisions                                                                     | Existing business destinations preserved; progressive disclosure reduces initial queue length                   |
| 05 header            | Page/role at left; calendar, notifications, one appearance trigger, avatar at right                                                                     | Mobile adds an accessible drawer trigger and wraps the role context                                             |

1440 light: full four-column summary and balanced main panels; projects begin below the action queue. 1280 light: same hierarchy with narrower cards and wrapping supporting text; projects continue below the 800px fold. Dark counterparts retain geometry and use distinct dark surfaces/pastels with lighter links. 390 light/dark: four utilities remain visible, two-column KPIs, stacked queue/workload/projects, no clipped menu or horizontal page scroll. Vertical scrolling on mobile is deliberate; information is not squeezed into a desktop composition. Supplied references do not define mobile/dark variants; those are adaptations of the same hierarchy.

Corrections from browser review: shortened initial queue from four to three rows; increased supporting text; fixed transparent mobile portal drawer by supplying tokens to the portal rail; enlarged mobile controls; preserved restricted-route feedback; darkened light muted text after its lilac contrast measured 4.42:1. Final text palette checks meet 4.5:1 across tested surfaces.

## Rendered evidence

Images are local ignored browser artifacts, not staged business uploads. All six captures use the actual authenticated staging dashboard.

| Viewport | Light                                                        | Dark                                                        |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| 1440×900 | [Desktop](../artifacts/verification/ui-r0/desktop-light.jpg) | [Desktop](../artifacts/verification/ui-r0/desktop-dark.jpg) |
| 1280×800 | [Laptop](../artifacts/verification/ui-r0/laptop-light.jpg)   | [Laptop](../artifacts/verification/ui-r0/laptop-dark.jpg)   |
| 390×844  | [Mobile](../artifacts/verification/ui-r0/mobile-light.jpg)   | [Mobile](../artifacts/verification/ui-r0/mobile-dark.jpg)   |

Additional captures: desktop full-page, mobile full-page, navigation drawer, account menu, focused mobile project cards. These are in `artifacts/verification/ui-r0/`.

## Focused verification

- Existing local dashboard, calendar, monitoring, directory/navigation contracts: 19 passed. New loading/escaping and palette checks: 3 passed. No unrelated full regression.
- Read-only authenticated staging checks: seven identities across all five roles; valid dashboard/calendar contracts; Lead active-project count matched an independent RLS query; four KPI drilldowns matched their returned counts; unassigned Designer/unrelated BDM had no projects; Ops saw no quotations/lead calendar details; BDM saw approved quotation versions only. Six passed on first run; the BDM test used a nonexistent `status` column, corrected to existing `state`, then its focused rerun passed (six intentionally filtered/skipped, not unfinished).
- Browser: real Lead sign-in; role-aware navigation (no Team access), four rendered totals 7/5/1/1; quotation drilldown returned its one actual record; calendar and notifications opened; forbidden Team route returned explicit restriction alert. Anonymous HTTP render redirects to login with no private dashboard content.
- Keyboard: drawer initial focus, Escape return; account menu Escape return; project card tab access. Light/Dark/System selected-state handling and System persistence after reload verified. All three viewport widths have no page-level horizontal overflow.
- Loading/empty markup tested. Actual streaming route navigation exercised. A forced backend failure/retry and a live zero-record Lead dashboard were not induced; existing error boundary retained, empty branches covered by component tests. No claim of full WCAG or full business regression acceptance.

Lint, types and formatting results recorded in implementation status after the final focused checkpoint. No production database/configuration/deployment actions performed. Only shared shell and Lead dashboard redesigned. Existing module content is preserved; approval is required before extending the rebuild.

## Change inventory

- New: `src/components/ui-r0/{shell,lead-dashboard,primitives,loading}.tsx`, `ui-r0.module.css`.
- Minimal flag integration: `src/app/dashboard/{layout,page,loading}.tsx`; default rendering preserved.
- Local-only launch: `scripts/preview-ui-r0.mjs`.
- Focused tests: `tests/live/ui-r0.test.ts`, `tests/unit/ui-r0-{states,contrast}.test.ts`.
- Documentation: this comparison, visual contract, short context/status additions; five supplied references copied into `docs/design-references/`.
- All other pending paths were inherited from the original checkout and are listed in `artifacts/verification/ui-r0/inherited-paths.txt`.

Final lint/typecheck passed. Typecheck caught an invalid test-only calendar `project_id` assertion; isolation tests were changed to actual project destination URLs and both unrelated identities passed their targeted rerun (five other scenarios intentionally filtered). Formatting checked on prototype files/docs; no full build/regression rerun requested or claimed.
