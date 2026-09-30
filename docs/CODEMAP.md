| Seed demo data | shared/types.ts, backend/src/config/firebase.ts, backend/scripts/seed.ts, engine/sample/districts.json, engine/sample/complaints.json |
`engine/sample/districts.json`, `engine/sample/complaints.json` | BRICS districts + mock complaints for C++ testing (never open) | n/a | done

# CODEMAP: CivicPulse (keep under 250 lines, update only affected rows)

Status: `todo` = not built yet (do not assume it exists), `done` = exists.
If a file disagrees with this map, TRUST THE FILE and fix the map row.

## 1. Overview

Citizen complaint (text/voice/message) -> backend translate + classify (Trie, else Gemini)
-> nearest district (C++ KD-tree) -> Firestore -> /api/hotspots runs C++ engine
(DBSCAN, dedup, top-K) + one batched Gemini call for recommendations -> dashboard.
Engine calls always have a TS fallback. Frontend talks only to backend.

## 2. Task -> files (open ONLY these)

| Task                              | Files                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add complaint category            | shared/types.ts, backend/src/services/trie.ts, frontend/src/components/CategoryChip.tsx                                                                                                                                                                                                                                                                       |
| Change priority formula           | engine/src/topk.cpp, backend/src/services/engineFallback.ts                                                                                                                                                                                                                                                                                                   |
| Change Gemini prompt              | backend/src/services/gemini.ts                                                                                                                                                                                                                                                                                                                                |
| New endpoint                      | backend/src/routes/, backend/src/controllers/, this file                                                                                                                                                                                                                                                                                                      |
| Change citizen page UI            | frontend/src/pages/Home.tsx, frontend/src/components/ComplaintForm.tsx, frontend/src/components/StepIndicator.tsx, frontend/src/components/CategoryChips.tsx, frontend/src/components/UrgencySelector.tsx, frontend/src/components/PhotoUpload.tsx, frontend/src/components/ReviewStep.tsx, frontend/src/api/client.ts, backend/src/controllers/complaints.ts |
| Change dashboard UI               | frontend/src/pages/Dashboard.tsx, frontend/src/components/dashboard/, frontend/src/api/client.ts                                                                                                                                                                                                                                                              |
| Change theme/colors               | frontend/tailwind.config.ts, frontend/src/styles.css, frontend/src/home.css, frontend/src/dashboard.css                                                                                                                                                                                                                                                       |
| Change API calls (frontend)       | frontend/src/api/client.ts                                                                                                                                                                                                                                                                                                                                    |
| Add frontend authentication       | frontend/src/lib/, frontend/src/context/, frontend/src/pages/, frontend/src/components/, frontend/src/api/client.ts, backend/src/controllers/auth.ts, backend/src/routes/auth.ts, this file                                                                                                                                                                   |
| Add env var                       | .env.example, backend/src/config/env.ts, this file                                                                                                                                                                                                                                                                                                            |
| Seed demo data                    | shared/types.ts, backend/scripts/seed.ts, firestore.rules, this file                                                                                                                                                                                                                                                                                          |
| Change Firestore access           | firestore.rules, this file                                                                                                                                                                                                                                                                                                                                    |
| Change analytics engine           | engine/src/main.cpp, engine/tests.cpp, engine/Makefile                                                                                                                                                                                                                                                                                                        |
| Add structured complaint          | shared/types.ts, backend/src/controllers/complaints.ts, backend/src/routes/complaints.ts, backend/src/services/classification.ts, backend/src/utils/priorityWeight.ts, backend/src/services/storage.ts, this file                                                                                                                                             |
| Change Indian state/district data | shared/data/indiaAdmin.ts, shared/types.ts, shared/src/index.ts, scripts/verifyIndiaAdmin.ts, frontend/src/components/ComplaintForm.tsx, frontend/src/pages/Signup.tsx, backend/src/services/districts.ts, backend/src/controllers/complaints.ts, this file                                                                                                   |

## 3. File index (path | purpose | key exports | status)

### shared

`shared/types.ts` | single source of types, including supported detected-language codes | UserProfile, Complaint, District, Hotspot, HotspotCluster, HotspotsResponse, StatsResponse | done
`shared/utils/detectScript.ts` | pure Unicode-block and bounded romanized Hindi language detection | detectLanguage, countLetters | done
`shared/utils/detectScript.test.ts` | six script/language detection cases | n/a | done
`shared/src/index.ts` | shared package exports for types and canonical India administration data | INDIA_ADMIN_STATES, INDIA_ADMIN_DISTRICT_BY_ID | done
`shared/data/indiaAdmin.ts` | LGD-mapped source of truth for 36 Indian states/UTs and 782 districts with stable slug IDs and O(1) indexes | INDIA_ADMIN_STATES, INDIA_ADMIN_DISTRICT_BY_ID | done

### backend/src

`server.ts` | Express bootstrap, CORS, gzip, JSON limits, error mapping | app | done
`config/env.ts` | env validation | env | todo
`config/firebase.ts` | root .env bootstrap, integrations startup log, lazy Firebase Admin and optional bucket init | getDb, db | done
`routes/auth.ts` | signup, current profile, signup districts, admin promotion | router | done
`routes/complaints.ts` | public submission, location suggestions, admin list, authenticated own history | router | done
`routes/hotspots.ts` | public hotspot/stat/transcription routes and admin-only AI health | router | done
`controllers/auth.ts` | signup, current profile, signup district options, admin promotion | signup, me, signupDistricts, promote | done
`controllers/complaints.ts` | complaint submission, location suggestions, audio transcription, role-scoped listing, status changes and ID/reference lookup | createText, suggestLocation, createVoice, transcribeReportAudio, createMessage, list, listMine, getById, updateStatus | done
`controllers/hotspots.ts` | typed hotspot/stat handlers with ETags, geo clusters, country counts, all supported language counts, demo switch, and AI health | getHotspots, getStats, getAiHealth | done
`services/classification.ts` | high-confidence Trie-first single-call Gemini translation/classification, SHA-256 LRU cache, script-trusted detected language | classifyText | done
`services/auth.ts` | Firebase token verification and user profile operations | verifyIdToken, createAccount | done
`services/districts.ts` | canonicalize Firestore/fixture district IDs, Nominatim reverse-geocode suggestions against canonical India districts, and lazily persist districts | listDistricts, suggestIndiaDistrictForLocation, ensureIndiaDistrictRecord | done
`services/demoAnalytics.ts` | precomputed hotspot/stat demo payloads when configured API keys are missing | DEMO_HOTSPOTS, DEMO_STATS, shouldServeDemoAnalytics | done
`services/gemini.ts` | configurable Gemini JSON classification, one 429 retry, rate-limited fallback warnings, and AI health | classifyWithGemini, getAiHealthStatus | done
`services/recommendations.ts` | one bounded Gemini batch for top-5 recommendations with fallback | recommendHotspots | done
`services/translate.ts` | shared Unicode-script language detection and original-text fallback | detectScriptLanguage, translateText | done
`services/speech.ts` | 20-second Gemini Interactions inline-audio transcription using documented WAV format | transcribe, transcribeAudio | done
`services/engine.ts` | spawn C++ binary, JSON stdio, 3s timeout | runEngine | done
`services/engineFallback.ts` | pure TS analyze, nearest, top-k fallback | runEngineFallback | done
`services/trie.ts` | multilingual keyword Trie classifier | classifyByTrie | done
`services/storage.ts` | compress up to 3 photos to <=200KB; Firestore subcollection default, optional reachable Storage bucket | uploadPhotos | done
`scripts/createAdmin.ts` | server-only CLI to promote an existing Firebase user | n/a | done
`utils/complaintStore.ts` | Firestore document-ID mapping, cursor pagination, referenceId safety lookup, transactional status history writes and memory fallback | saveComplaint, listComplaints, getComplaintById, updateComplaintStatus | done
`utils/httpError.ts` | status-bearing API errors | HttpError | done
`utils/lru.ts` | Map LRU cache, expected O(1) get/put | LRUCache | done
`utils/priorityWeight.ts` | pure function for computing effective severity score | computeEffectiveSeverity | done
`utils/ttlCache.ts` | 30-second hotspot cache, invalidated on complaint write | hotspotsCache, invalidateHotspotsCache | done
`utils/etag.ts` | conditional JSON responses with ETags | sendJsonWithEtag | done
`utils/timeout.ts` | promise timeout wrapper | withTimeout | done
`utils/logger.ts` | structured-prefix server logger with info, warning, and error levels | logger | done

### backend/src/middleware

`rateLimit.ts` | per-IP token bucket for complaint POST routes | complaintRateLimit | done
`requireAuth.ts` | optional or required Firebase bearer token verification | optionalAuth, requireAuth | done
`requireAdmin.ts` | admin-role route guard | requireAdmin | done

### backend/scripts

`seed.ts` | generate India district + multilingual complaint seed data and seed Firestore | n/a | done

### repository root

`firestore.rules` | user, district, and complaint access rules | n/a | done
`scripts/verifyIndiaAdmin.ts` | print state/district counts, duplicate stable IDs, and verify seeded district IDs against the canonical dataset | n/a | done

### engine (C++17)

`engine/src/main.cpp` | stdin/stdout JSON dispatcher, clustering, nearest, aggregation, top-K, dedup, --bench | main | done
`engine/tests.cpp` | assert-based analytics sanity tests | n/a | done
`engine/Makefile` | C++17 optimized build and tests | n/a | done
`engine/include/nlohmann/json.hpp` | vendored nlohmann JSON single header | n/a | done
`engine/sample/districts.json`, `engine/sample/complaints.json` | BRICS districts and mock complaints for C++ testing (never open) | n/a | done

### frontend/src

`main.tsx`, `routes/FoundationRoute.tsx` | entry, lazy citizen route | FoundationRoute | done
`main.tsx` | auth provider, shared navigation, public and protected routes | route tree | done
`vite.config.ts` | local `/api` proxy to backend | dev proxy | done
`styles.css`, `home.css`, `dashboard.css` | design tokens, glass, auth/navigation, citizen and dashboard layouts, responsive page width | n/a | done
`dashboard.css` | data-dense responsive policymaker styles | n/a | done
`api/client.ts` | typed API calls with Firebase ID tokens, location suggestions, AI health, and multipart report submission | submitWizardComplaint, getSignupDistricts, getLocationSuggestion, getMyReports, getDashboardData, getAiHealth | done
`lib/firebase.ts`, `context/AuthContext.tsx` | Firebase client and auth state/session | auth, AuthProvider, useAuth | done
`pages/Home.tsx` | public citizen report page, Hero prompt, and sign-in tracking banner | Home | done
`pages/Login.tsx`, `pages/Signup.tsx` | Firebase login and lazy-loaded searchable India admin-unit registration choices | Login, Signup | done
`pages/MyReports.tsx` | citizen report details, reference IDs, photo lightbox, loading/empty/error states | MyReports | done
`pages/Dashboard.tsx` | lazy policymaker dashboard with live filters, AI health indicator, and all report categories | Dashboard | done
`components/Navbar.tsx`, `components/ProtectedRoute.tsx` | responsive nav and auth/role route guard | Navbar, ProtectedRoute | done
`components/AuroraBackground.tsx` | animated aurora background | AuroraBackground | done
`components/AppErrorBoundary.tsx` | top-level React crash recovery UI | AppErrorBoundary | done
`components/OfflineNotice.tsx` | connection loss notice | OfflineNotice | done
`components/Hero.tsx` | multilingual typing hero | Hero | done
`components/ComplaintForm.tsx` | reducer-backed four-step report wizard with AI category preview, pin-to-district autofill, and debounced language chip detection/manual override | ComplaintForm | done
`components/StepIndicator.tsx` | accessible wizard progress bar and step labels | StepIndicator | done
`components/CategoryChips.tsx` | keyboard-accessible single-select complaint categories with AI suggestion highlight | CategoryChips | done
`components/UrgencySelector.tsx` | urgency buttons with emergency guidance | UrgencySelector | done
`components/PhotoUpload.tsx` | validated client compression to <=200KB, photo attachments and thumbnails | PhotoUpload | done
`components/ReviewStep.tsx` | report review, consent, contact details, success confirmation, and classification badge | ReviewStep | done
`components/VoiceRecorder.tsx` | browser speech recognition with MediaRecorder transcription fallback; fills report text only | VoiceRecorder | done
`components/LocationPicker.tsx`, `components/LeafletLocationMap.tsx` | geolocation and lazy dark map picker | LocationPicker | done
`components/ResultConfirmation.tsx` | submitted complaint confirmation across all report categories | ResultConfirmation | done
`components/dashboard/KpiCard.tsx` | transform/opacity KPI value reveal | KpiCard | done
`components/dashboard/DashboardMap.tsx` | lazy dark Leaflet DBSCAN cluster map | DashboardMap | done
`components/dashboard/TopProjects.tsx` | top 5 recommendation cards with icons for all categories + priority score ring | TopProjects | done
`components/dashboard/ComplaintQueue.tsx` | admin moderation queue with report details, classifier badge, photos, and status updates | ComplaintQueue | done
`components/dashboard/DashboardCharts.tsx` | lazy Recharts category and country charts | DashboardCharts | done
`hooks/useDebouncedLanguage.ts` | 400ms multilingual language detection | useDebouncedLanguage | done
`hooks/useOnlineStatus.ts` | browser online/offline subscription | useOnlineStatus | done
`hooks/useOnlineStatus.ts` | browser online/offline subscription | useOnlineStatus | done

## 4. Endpoints

| Method | Path                       | Controller      | Uses                            | Notes                             |
| ------ | -------------------------- | --------------- | ------------------------------- | --------------------------------- |
| POST   | /api/auth/signup           | signup          | Firebase Auth, Firestore        | citizen role                      |
| POST   | /api/auth/promote-admin    | promote         | requireAdmin, Firestore         | admin only                        |
| GET    | /api/auth/me               | me              | requireAuth, Firestore          | current profile                   |
| GET    | /api/auth/districts        | signupDistricts | public, seeded India districts  | signup choices                    |
| POST   | /api/complaints/text       | createText      | trie, translate, gemini, engine | rate limited                      |
| POST   | /api/complaints/voice      | createVoice     | speech + text pipeline          | multer memory                     |
| POST   | /api/complaints/message    | createMessage   | text pipeline                   | webhook-style                     |
| GET    | /api/complaints/location-suggestion | suggestLocation | Nominatim, canonical India dataset | rate limited, validates lat/lng |
| GET    | /api/complaints            | list            | requireAdmin, firestore         | cursor pagination                 |
| GET    | /api/complaints/mine       | listMine        | requireAuth, firestore          | own complaints only               |
| GET    | /api/complaints/:id        | getById         | requireAdmin, firestore         | doc ID, referenceId safety lookup |
| PATCH  | /api/complaints/:id/status | updateStatus    | requireAdmin, firestore         | complaint moderation              |
| GET    | /api/health/ai             | getAiHealth     | requireAdmin, Gemini service    | configured state and last result   |
| POST   | /api/classify/preview     | previewClassification | Trie, cached Gemini classification, rate limited | preview only; saves no complaint |
| POST   | /api/transcribe             | transcribeReportAudio | optionalAuth, rate limit, 8MB audio multer | Gemini transcript only; never creates report |
| GET    | /api/hotspots              | getHotspots     | engine, batched gemini          | 30s TTL, ETag                     |
| GET    | /api/stats                 | getStats        | one complaints query            | single pass O(n), ETag            |

## 5. Env vars

FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (backend Admin SDK), FIREBASE_STORAGE_BUCKET (optional),
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID,
GEMINI_API_KEY, GEMINI_MODEL, ENGINE_BINARY, PORT

## 6. Gotchas

- Engine command schema changes must be mirrored in services/engine.ts AND engineFallback.ts.
- Types only in shared/types.ts, never duplicate.
- state/district source of truth is shared/data/indiaAdmin.*; never hardcode lists.
- Pin-derived districts are debounced Nominatim lookups matched to the canonical dataset; each new pin enables auto-fill, while manual dropdown changes persist for that pin and can be replaced with “Use detected”.
- Category preview is rate-limited and read-only; AI-highlighted chips do not set the submitted category until a user selects one.
- Language chip uses shared Unicode script counts and a small romanized Hindi vocabulary; manual choice persists until the report text is cleared.
- complaint `id` in API responses is always the Firestore doc ID.
- fallbacks must log; `classifiedBy` shows which path decided.
- mic only fills the textbox; Web Speech first, /api/transcribe (Gemini) fallback; no Google Cloud speech.
- Classification/translation uses one Gemini call after the Trie fast path; script detection and untranslated text are the offline fallback.
- Demo analytics appear only when Firestore is unconfigured or unreachable; a missing Gemini key never selects demo data.
- Photos default to compressed Firestore complaints/{id}/photos documents; Storage is opt-in and attempted only when a bucket is configured and reachable.
- Map tiles use unkeyed OpenStreetMap tiles; no CARTO, Mapbox, or Google Maps tile integration.
- Complaints kept in the in-memory fallback can be status-updated while Firestore is missing that document; this state is process-local.
- Roles are never client-authoritative; admin accounts are created only with `src/scripts/createAdmin.ts` or a direct Firestore edit.
- Leaflet and Recharts must be dynamically imported.
- Invalidate hotspot TTL cache whenever a complaint is created.
- backend/dist, node_modules, engine/sample: never open.
- effectiveSeverity is computed in backend, engine unchanged.
- report creation, transcribe and classify preview require auth; anonymous means hidden identity, not logged out.
- logged-out users see the sign-in card on the home page; login/signup accept only same-origin `next` paths.
- complaint drafts live in sessionStorage and are cleared only after successful submit or logout.
