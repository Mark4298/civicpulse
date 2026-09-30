---
applyTo: "backend/**"
---
- Layers: routes -> controllers -> services -> utils. Routes contain no logic.
- All external calls go through `src/services/*`. Each has timeout + fallback.
- New endpoint = route + controller + validation + entry in docs/CODEMAP.md.