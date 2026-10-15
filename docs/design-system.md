# One ODC brand and design system

## Identity

**Name:** One ODC. Always write “One ODC” in product copy; “ODC” means Opulence Design Concept. Use “One” rather than the numeral in the product name.

**Descriptor:** The project workspace for Opulence Design Concept.

**Brand line:** Every space. One vision.

**Positioning:** One ODC brings design, commercial, and operations teams into a shared project workspace, with clear ownership and visibility from Lead to installation.

**Personality:** Considered, precise, connected, quietly confident. The identity should feel appropriate to an interiors business while remaining readable through a full working day.

## Logo

The original O/1 symbol combines a rounded architectural enclosure with a single upright “1.” The enclosure suggests a room or shared workspace; the upright signifies one connected perspective. The small radius softens the technical geometry without introducing ornament.

Use the symbol in the blue app tile, alongside the wordmark in navigation and sign-in, or in a single color for small formats. The product endorsement is “OPULENCE DESIGN CONCEPT,” set separately beneath the wordmark. The endorsement is optional below 200 px overall width; the symbol alone works at 24 px. The favicon uses the same symbol at 32 px.

Keep clear space of at least one fifth of the symbol's width around the lockup. Do not stretch, rotate, add gradients/shadows, recolor individual strokes, or place the symbol over busy imagery. Use the reverse wordmark on navy; use the navy wordmark on a light surface. Production SVG wordmarks use outlined lettering so they do not depend on an installed font.

## Palette

| Token         | Value     | Purpose                                        |
| ------------- | --------- | ---------------------------------------------- |
| Deep Blue     | `#2663D8` | Primary actions, selected navigation, progress |
| Deep Navy     | `#14233D` | Light-mode text, navigation, brand fields      |
| Light Canvas  | `#F7F9FC` | Light application background                   |
| Light Surface | `#FFFFFF` | Forms, tables, cards                           |
| Dark Canvas   | `#101722` | Dark application background                    |
| Dark Surface  | `#1B2533` | Dark forms, tables, cards                      |
| Mineral       | `#EDE8DF` | Login/brand artwork; occasional quiet emphasis |
| Brushed Brass | `#B49A6A` | Decorative lines and large brand accents       |

The six base colors follow the supplied PRD. Mineral and Brass are supporting brand additions. Brass is not a default button, focus, warning, or normal-text color on light surfaces.

Semantic colors use separate light/dark foreground and background pairs. Statuses always include text. “On Track,” “At Risk,” and “Overdue” describe health rather than workflow status. Commercially Closed must never visually imply Operationally Completed, fully installed, or fully paid.

Use white text on Deep Blue in both themes. Dark-mode text links use `#A7C8FF` instead of unmodified Deep Blue. Focus rings use Deep Blue on light and `#92B9FF` on dark. Actual contrast measurements are recorded in `docs/contrast-report.md`.

## Typography and layout

Inter is bundled locally with weights 400, 500, 600, and 700; production pages do not fetch fonts from an external service. Use weight 500 for large headings, 600 for actionable row labels, and tabular numerals for dates, money, and progress. The logo's outlined letterforms are a fixed artwork asset, independent from UI typography.

Desktop shell: 242 px navy sidebar, 82 px top bar, light/dark canvas, restrained 10–12 px surface radii. Layout spacing follows a 4 px rhythm. Main title 28–32 px; body and data text should remain readable at 12 px or greater, with small captions used sparingly. On mobile, use a collapsible sidebar and contained table scrolling; essential actions remain accessible. Calendar cells reflow within the viewport.

Lucide icons support familiar actions. The reusable Button follows shadcn/ui's Radix Slot + class-variance-authority composition; dialogs use Radix focus management. `components.json` supports adding further shadcn components consistently.

## Product voice

State the action, owner, and consequence plainly. Use business terminology from the PRD: Lead, Project, Space, BDM, Designer, Lead Designer, Operations Admin, System Administrator, Quotation, Sale, Raw, RFP, Commercially Closed, Operationally Completed.

Examples: “Review quotation,” “Return for Clarification,” “Awaiting handoff acknowledgment,” “2 days overdue.” Describe Sale minus Raw as a difference before other costs, never net profit. Avoid luxury adjectives in transactional forms, invented urgency, and vague “success” messages.

## Interaction and accessibility

Light, Dark, and Follow System persist through next-themes. Loading UI appears only during genuine route or action work. No fake loading delays or auto-completing workflows. Provide semantic buttons, visible focus, labeled fields, keyboard-closeable dialogs, empty results, recoverable errors, and reduced-motion handling. WCAG 2.1 AA is a target; passing selected contrast/browser checks is not a full accessibility certification.

## Files

`public/brand/` contains symbol variants, outlined wordmarks, app icons, a pattern, and machine-readable design tokens. `public/branding/index.html` is the visual brand board. `src/components/brand.tsx` is the reusable application lockup. `src/app/globals.css` defines operational theme tokens.
