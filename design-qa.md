# One ODC UI rehaul — focused visual QA

final result: passed

Scope: focused presentation checkpoint, not comprehensive workflow acceptance. References were supplied as inspiration, not exact clones. One ODC's brand kit and existing role-specific business information take precedence over fictional tasks, avatars, search and charts in those references.

## Visual sources and normalization

Primary source: `/var/folders/69/8_lnykh103b8ltx7w7nw32100000gn/T/codex-clipboard-45f6dad3-3d68-4e67-ac4b-dd7e12edb75c.png` (1518×976 raster). Supporting references: user's Taskflow board, Panze dashboard, and Trior lists. Implemented dashboard: `artifacts/verification/ui-rehaul-2026-10-15/dashboard-desktop.jpg` (1440×1000 CSS/pixel viewport). These are different products/content and framing; full images were reviewed together for hierarchy, density, surface rhythm and navigation proportions rather than pixel equality. The navy sidebar, flat brand surfaces, actual Admin metrics and absence of fabricated charts/avatars are intentional adaptations.

## Findings and iterations

- Header/tab collision: project navigation formerly pinned at0 underneath the header. Shared header offset and scroll margins now place tabs at64px, header bottom64px, activity section140px. Evidence: project-activities.jpg.
- Directory overflow: long fixture names crossed status cells and monitoring columns were offscreen. Bounded table layout/wrapping and mobile labeled rows fix the sample. Evidence: projects-desktop.jpg, projects-mobile.jpg (390×844; page width390).
- Analytics monetary value wrapped mid-number on first capture. Dedicated full-width commercial card corrected the layout, verified in mobile screenshot and DOM. Filter disclosure preserves visible scope and every filter. Evidence: analytics-mobile.jpg and analytics-mobile-filters.jpg. Initial analytics-desktop.jpg predates this final monetary correction.
- Excessive editor density: user forms now open from compact account rows; supplier form opens in a sized dialog; lead files precede an initially unselected review decision. Evidence: users-desktop.jpg, supplier-dialog.jpg, lead-review.jpg. Lead brief subsequently received a two-column desktop layout.
- Oversized sequential overview: paired overview/activity surfaces, with single-column fallback. Evidence: project-completed.jpg.

## Required visual surfaces

Typography: bundled Inter retained, 24–32px page headings, 18px section headings, 13–14px data/controls, secondary12px labels; long identifiers wrap. Spacing: shared 16/20/24px rhythm,12px surfaces and8px controls, responsive project/operational grids. Colors: Deep Blue #2663D8, navy #14233D, brand light/dark canvas and restrained semantic statuses. Assets: existing One ODC logo and Lucide icons preserved; no fabricated avatar/brand assets. Copy: existing business terminology preserved; Estimated Cabinetries corrected, plain-language notifications and readable file sizes added. No fabricated business records.

Focused-region evidence: project-activities.jpg demonstrates header/tab/anchor separation; projects-mobile.jpg demonstrates name/status/progress hierarchy; supplier-dialog.jpg demonstrates labels, controls and focus. Dashboard desktop/mobile dark screenshots demonstrate theme adaptation. Screenshots are in `artifacts/verification/ui-rehaul-2026-10-15/`.

## Interaction and technical checks

Browsed existing Admin session across dashboard, projects, spaces/activities, quotation, finance, installation, logistics, suppliers, leads/review/files, analytics, users and notifications. Checked supplier autofocus/Escape focus restoration, analytics disclosure, account editor disclosure, review selection, mobile navigation, and sampled390px reflow. No business form submitted. Browser error log sample empty. Lint, TypeScript, production build and12 targeted tests passed. Affected browser test selectors were updated; full browser/API suites were not rerun, as requested.

## Remaining verification limits

Login/invitation/password and BDM editable lead screens received shared styling but were not freshly browser-inspected. Other roles, all form/error states, screen readers, zoom and cross-browser behavior remain outside this focused checkpoint. Earlier full acceptance gaps remain. No claim of universal overlap absence or complete accessibility certification. Supplier/payment tables retain intentional contained horizontal scrolling where column density requires it. No production changes or deployment.
