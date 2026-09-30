---
applyTo: "frontend/**"
---
- Components in `src/components`, pages in `src/pages` (lazy-loaded), hooks in `src/hooks`.
- Data fetching only via `src/api/client.ts`. No axios/fetch inside components.
- Reuse existing components (GlassCard, AuroraBackground, KpiCard) before creating new ones.
- Leaflet and Recharts must be imported dynamically.