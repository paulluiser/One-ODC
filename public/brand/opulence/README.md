# One ODC brand SVG package

- `one-odc-logo-light.svg`: transparent horizontal gold icon + dark wordmark for light surfaces.
- `one-odc-logo-dark.svg`: transparent horizontal gold icon + light wordmark for dark navy surfaces (cutout details matched to #0E1726).
- `one-odc-icon-transparent.svg`: background-independent icon with genuine transparent openings.
- `one-odc-icon-light.svg` and `one-odc-icon-dark.svg`: contrast-tuned icon variants.
- `one-odc-favicon.svg`: square navy tile.

All text including tagline is converted to outlines (`<path>`), so no fonts are required. The gold O is an approximation inspired by the supplied reference, not a geometrically exact trace of the original logo. The logo assets have transparent outer backgrounds. For dark surfaces other than #0E1726, favor the fully transparent icon variant.

**Integration:** Place in `public/brand/` and use an accessible image name. In Next.js, use `/brand/one-odc-logo-light.svg` for light mode and `/brand/one-odc-logo-dark.svg` for dark mode. For exact brand-asset fidelity, verify against the company’s approved master vector art before release.
