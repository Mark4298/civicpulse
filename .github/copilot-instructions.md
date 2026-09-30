# CivicPulse: Agent Rulebook

Project: multilingual AI platform (Digital Public Good) that turns citizen feedback
into infrastructure priorities for BRICS policymakers. Hackathon build, 48h. Speed and a
working demo matter more than completeness.

## 0. Context discipline (MOST IMPORTANT)
1. NEVER scan or read the whole repo. NEVER open more than 5 files per task unless told.
2. FIRST read `docs/CODEMAP.md`. Use it to find the exact files for the task.
3. Open only the files the map points to, plus files they directly import.
4. Prefer symbol/text search for one identifier over opening full files.
5. Do not open: node_modules, dist, build, lockfiles, /engine/sample, *.json seed data, assets.
6. If the map is missing something or wrong, open the file, fix the map, then continue.
7. Before editing, state in one line: "Files I will touch: ...". If it exceeds 5, ask first.

## 1. Scope discipline
- Do exactly what was asked. No extra features, no refactors of working code.
- Do not rename, move, or delete files unless asked.
- Do not add a dependency without saying why in one line. Prefer none.
- Change the smallest number of lines that solves the task.

## 2. Map maintenance (mandatory)
After ANY change that adds, removes, renames a file/export/endpoint/component,
update `docs/CODEMAP.md` in the same task. A stale map is a bug.
Update only the affected entries, never regenerate the whole file.

## 3. Architecture (do not violate)
- /frontend: React 18 + Vite + TS + Tailwind + framer-motion
- /backend: Node + Express + TS, Firestore via firebase-admin
- /engine: C++17 CLI, JSON over stdin/stdout. Backend calls it via
  `backend/src/services/engine.ts`. Every engine call MUST have a TS fallback.
- /shared/types.ts is the single source of truth for types. Never duplicate types.
- Frontend never talks to Google APIs directly. Only through backend.

## 4. Code quality
- TypeScript strict. No `any`. No unused code. No commented-out code.
- Small files (<200 lines), one responsibility each. Small pure functions.
- Every external call (Gemini, Translate, Speech, Firestore): timeout + try/catch + fallback.
- Never hardcode secrets. Use env vars, keep `.env.example` current.
- Validate all API input. Correct HTTP codes (400 bad input, 429 rate limit, 500 server).
- No console.log in committed code. Use the logger util for meaningful errors only.

## 5. Performance rules
- Backend: no N+1 queries, no work inside loops that can be hoisted, use Map/Set for lookups.
  Reuse existing structures: LRU cache, Trie classifier, TTL cache, token bucket.
  Do not reimplement them, import from `backend/src/utils/`.
- State the time complexity in a comment above any non-trivial algorithm.
- Frontend: lazy-load routes and heavy libs (Leaflet, Recharts). useMemo/useCallback only
  where it prevents real re-renders. Animate ONLY transform and opacity.
- Never add a heavy library when 20 lines of code do the job.

## 6. UI rules
- Use design tokens from tailwind.config (colors, glass utility, glow). No hardcoded hex.
- Mobile-first. Must work from 320px to 2560px. No horizontal scroll. 44px touch targets.
- Every animation respects prefers-reduced-motion.
- Every async view needs: loading skeleton, error state, empty state.
- Basic a11y: aria-labels, focus rings, contrast.

## 7. Definition of done (check before replying)
- [ ] `npm run build` and typecheck pass in the touched package
- [ ] No new lint errors
- [ ] Only requested behavior changed
- [ ] CODEMAP.md updated if structure changed
- [ ] Reply: max 5 lines: what changed, files touched, how to test

## 8. When stuck
- If a task is ambiguous, ask ONE question, do not guess big.
- If a fix fails twice, stop, explain the root cause, and propose options instead of looping.