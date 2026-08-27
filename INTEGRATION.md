# SCI-PATH Farm Game — Integration Guide

This document is for **other SCI-PATH components** (login, aptitude test, learning-path engine, dashboards) that need to launch the farm game or consume its telemetry.

The farm game lives in **`gaming-service`**. It does **not** own login or the aptitude test — it **receives** identity + session context at launch and **optionally fetches** aptitude results to set **initial mastery** for brand-new students.

---

## Quick checklist for integrators

| Step | Owner | Action |
|------|--------|--------|
| 1 | Login / LMS | Authenticate student; obtain `userId`, `username`, `sessionId`, `topicId` |
| 2 | Aptitude test | Run placement test **before first farm visit**; publish result (see §3) |
| 3 | **frontend-app** | Student clicks **Launch Game Arena** → farm URL with `studentId`, `username`, `sessionId`, `topicId` |
| 4 | Farm game | Reads aptitude → sets mastery band → starts Level 1 with adapted targets |
| 5 | Telemetry | Farm pushes frustration + quiz data to engagement API (see §5–6) |
| 6 | Other UIs | Read frustration from shared events / DB / parent bridge (see §7) |

---

## Architecture

```
┌─────────────────────────┐     launch URL           ┌──────────────────────────┐
│  frontend-app (Next.js) │ ───────────────────────► │  Farm UI (Vite :5173)    │
│  Student dashboard      │  studentId, username,    │  React + Phaser          │
│  :3000                  │  sessionId, topicId…     │  (bundled in frontend-  │
└──────────┬──────────────┘                          │   app gaming-service/)   │
           │ sign-in via user-management             └────────────┬─────────────┘
           │                                                      │
           │ aptitude result                                        │ POST /api/engagement/*
           ▼                                                      ▼
┌─────────────────┐                                  ┌──────────────────────────┐
│ Aptitude test   │ ◄── GET initial-category         │  gaming-service backend  │
│ (IAE / your API)│     (optional)                     │  :8002                   │
└─────────────────┘                                  └────────────┬─────────────┘
                                                                   │
                                                                   ▼
                                                        Neon `engagement_gaming` (optional)
```

**How teams run it locally**

1. **`gaming-service` backend** — engagement API, Sage LLM, mind maps (`:8002`)
2. **Farm Vite app** — Phaser client (`:5173`), lives in `frontend-app/src/components/features/gaming-service/`
3. **`frontend-app`** — SCI-PATH platform; students sign in and click **Launch Game Arena** (`:3000`)

Integrators do **not** need to run `gaming-service/frontend` directly when using **frontend-app** — the farm copy inside frontend-app is the launcher target.

**Default ports**

| Service | URL |
|---------|-----|
| SCI-PATH platform (Next.js) | `http://127.0.0.1:3000` |
| Farm frontend (Vite) | `http://127.0.0.1:5173` |
| Farm backend (API) | `http://127.0.0.1:8002` |
| Vite proxy | Farm `/api/*` → backend `:8002` |

---

## 1. Launch contract (login → farm)

When a student opens the farm from your app, redirect or iframe to the game with **query parameters**:

```
http://127.0.0.1:5173/
  ?studentId=<uuid-or-stable-id>
  &username=<login-handle>
  &displayName=<shown-name>
  &sessionId=<your-session-id>
  &topicId=<science-topic-id>
  &grade=7
  &source=sci-path
```

### Required parameters

| Param | Aliases | Description |
|-------|---------|-------------|
| `studentId` | — | Stable user id from your auth system (**required**) |
| `displayName` | `studentName` | Name shown in UI (**required**) |

### Strongly recommended

| Param | Aliases | Description |
|-------|---------|-------------|
| `username` | — | Login handle; defaults to `studentId` if omitted |
| `sessionId` | — | Your LMS/session id; used for engagement DB rows |
| `topicId` | `topic` | Science topic id for this learning path (stored on student session) |
| `grade` | — | Numeric grade (e.g. `7`) for telemetry |
| `source` | — | Caller id, e.g. `sci-path`, `frontend-app` |

### Example

```
http://localhost:5173/?studentId=8f2a…&username=alex&displayName=Alex&sessionId=sess_20250823_abc&topicId=plant_biology&grade=7&source=sci-path
```

### What the game does on launch

1. Parses params in `frontend/src/data/platformLaunch.js`
2. Creates local student session via `loginStudentFromPlatform()` (`mockStudents.js`)
3. Stores: `{ id, username, displayName, grade, topicId, sessionId, fromPlatform: true }`
4. Strips query params from the URL (so refresh does not re-bootstrap)
5. Calls `syncStudentLogin()` → `POST /api/engagement/student` + `POST /api/engagement/session/start`
6. Bootstraps mastery from aptitude (§3) if the student has **no prior farm level history**

**Code references:** `platformLaunch.js`, `App.jsx` (boot), `engagementSync.js`

---

## 2. Aptitude test → initial mastery (new users)

For a **brand-new student** (no completed farm levels yet), the game sets **Weak / Medium / Smart** gameplay from a **0–1 mastery score**. That score comes from the aptitude test — **not** from farm play.

After the first level is saved locally, **farm level history overrides aptitude** for subsequent levels.

### Mastery mapping

| Source | Mastery (0–1) | Band | Gameplay effect |
|--------|-----------------|------|-----------------|
| `BASIC` / struggling | ~0.36 | Weak | Slower time target, more retries, fewer harvest targets |
| `INTERMEDIATE` / average | ~0.55 | Medium | Standard targets |
| `ADVANCED` / strong | ~0.76 | Smart | Faster time target, tighter timers, more harvest targets |

Placement categories map in `frontend/src/data/aptitudeProgress.js` → `masteryFromAptitudePerformance()`.

Bands use thresholds in `frontend/src/data/masteryModel.js`:

- **Smart:** mastery ≥ 0.72  
- **Medium:** 0.40 – 0.71  
- **Weak:** &lt; 0.40  

### Integration option A — Your API (recommended for production)

Set in frontend env:

```env
VITE_ASSESSMENT_API_BASE=https://your-aptitude-service.example.com
```

The game calls **on bootstrap** (after login, before first farm level):

```http
GET {VITE_ASSESSMENT_API_BASE}/students/{studentId}/initial-category
Accept: application/json
```

**Expected response (any of these field names work):**

```json
{
  "initial_category": "INTERMEDIATE",
  "placement_category": "INTERMEDIATE",
  "category": "INTERMEDIATE"
}
```

Allowed values: `BASIC` | `INTERMEDIATE` | `ADVANCED` (case-insensitive).

- `404` → game falls back to options B/C  
- Other errors → ignored; fallback used  

**Implementation:** `fetchRemoteAptitudeStatus()` in `aptitudeProgress.js`

### Integration option B — Write localStorage before launch

Before redirecting to the farm, set (same origin or pass via your shell):

**Key:** `scipath_aptitude_result__{studentId}`

**Value (JSON):**

```json
{
  "studentId": "8f2a…",
  "source": "amplitude_api",
  "placementCategory": "INTERMEDIATE",
  "performanceLabel": "Solid middle path",
  "aptitudeData": {
    "totalQuestions": 20,
    "correctAnswers": 12,
    "incorrectAnswers": 8,
    "averageAnswerTime": 10.5,
    "baselineAnswerTime": 6.5,
    "consecutiveWrongAnswers": 3,
    "retryCount": 4,
    "hintUsage": 3
  }
}
```

The game reads this in `readStoredAptitudeResult()` and applies baseline via `applyAptitudeBaseline()`.

### Integration option C — Full metrics object (no category)

If you send `aptitudeData` with `totalQuestions` + `correctAnswers`, mastery is computed as:

```
mastery ≈ 0.28 + (correct / total) × 0.58   (clamped 0–1)
```

Optional `averageAnswerTime` (seconds) sets the **initial response-time target** for science quizzes.

### Integration option D — In-process provider (same JS bundle)

If aptitude runs inside the same frontend bundle:

```js
import { setAptitudePerformanceProvider } from './storyline/aptitude/AptitudePerformanceProvider.js';

setAptitudePerformanceProvider({
  getByStudentId(studentId) {
    return {
      studentId,
      source: 'your_aptitude_module',
      placementCategory: 'ADVANCED',
      performanceLabel: 'Strong Performer',
      aptitudeData: { /* see option B */ },
    };
  },
});
```

Provider must implement `getByStudentId(studentId) → object | null`.

### Dev fallback

If no aptitude data exists and `VITE_USE_MOCK_APTITUDE_FALLBACK` is not `false`, the game seeds **INTERMEDIATE** mock aptitude per student (`createDefaultMockAptitudeForStudent()`).

### Priority order (first match wins)

1. Existing farm level history (localStorage mastery records)  
2. `scipath_aptitude_result__{studentId}` in localStorage  
3. `AptitudePerformanceProvider.getByStudentId()`  
4. Remote `GET …/initial-category` (async bootstrap)  
5. Mock fallback (dev only)  

---

## 3. Outbound calls — endpoints **we call on your services**

These are requests **from gaming-service → external systems**.

| Purpose | Method | URL | When |
|---------|--------|-----|------|
| Aptitude placement | `GET` | `{VITE_ASSESSMENT_API_BASE}/students/{studentId}/initial-category` | First login, no farm history |
| Engagement DB | `POST` | `/api/engagement/*` on **our** backend | Login, levels, frustration, etc. |
| Avatar / Sage LLM | `POST` | `/api/avatar-chat` | Mentor opens |
| Mind map | `POST` | `/api/mind-map` | After wrong answers |
| Leaderboard | `GET` / `POST` | `/api/engagement/leaderboard` | Lobby / score submit |

Only the **aptitude GET** hits **your** service. All `/api/*` routes hit **gaming-service backend** (proxied from Vite in dev).

---

## 4. Inbound APIs — endpoints **on gaming-service backend**

Base URL: `http://127.0.0.1:8002` (or your deployed host).  
Health check: `GET /api/health`

### Engagement (requires `DATABASE_URL` in `.env`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/engagement/student` | Upsert student row |
| `POST` | `/api/engagement/session/start` | Start game session |
| `POST` | `/api/engagement/session/end` | End session on logout |
| `POST` | `/api/engagement/level` | Level completion + mastery snapshot |
| `POST` | `/api/engagement/quiz` | Individual quiz attempt |
| `POST` | `/api/engagement/unlock` | Shop purchase |
| `POST` | `/api/engagement/frustration` | Frustration snapshot (write) |
| `GET` | `/api/engagement/frustration` | Latest frustration (+ optional history) |
| `POST` | `/api/engagement/mentor` | Sage intervention log |
| `POST` | `/api/engagement/event` | Generic gameplay event |
| `GET` | `/api/engagement/leaderboard` | Leaderboard query |
| `POST` | `/api/engagement/leaderboard/score` | Submit score |

If `DATABASE_URL` is missing, engagement calls return `{ ok: false, skipped: true }` — play continues.

### AI / content

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/avatar-chat` | Sage mentor (JSON or SSE `?stream=1`) |
| `POST` | `/api/mind-map` | Concept map from mistakes |
| `GET` | `/api/storyline?studentId=` | Stored storyline record |
| `POST` | `/api/storyline` | Disabled (410) |

Full schema notes: [`backend/sql/README_ENGAGEMENT_SYNC.md`](backend/sql/README_ENGAGEMENT_SYNC.md)

---

## 5. Engagement payloads (what we send at login)

### `POST /api/engagement/student`

```json
{
  "studentId": "<userId>",
  "studentName": "<displayName>",
  "displayName": "<displayName>",
  "gradeBand": "7",
  "currentLevel": 1
}
```

### `POST /api/engagement/session/start`

```json
{
  "sessionId": "<sessionId from login URL or auto-generated>",
  "studentId": "<userId>",
  "studentName": "<displayName>",
  "displayName": "<displayName>",
  "startLevel": 1,
  "clientVersion": "gaming-service-web",
  "deviceInfo": { "userAgent": "…" }
}
```

If your launcher passes `sessionId`, we use it. Otherwise the game generates `sess_<uuid>` and stores it in `sessionStorage`.

---

## 6. Frustration score — computed here, passed outward

The farm computes a live **0–100 frustration score** during play (`frontend/src/data/frustrationModel.js`). It is **separate** from aptitude placement and from game-over (6 wrong answers ends the run; frustration does not).

### Levels

| Score | Level |
|------:|-------|
| 0–30 | `low` |
| 31–60 | `moderate` |
| 61–80 | `high` |
| 81–100 | `very_high` |

### Where the game uses frustration internally

| Consumer | Effect |
|----------|--------|
| Unlock shop | Price multipliers (higher frustration → lower prices) |
| Farm visuals | Bed condition (wilted vs healthy) |
| Sage mentor | Auto-open thresholds, scaffolding level |
| Motivational clips | Clip selection by level |
| Physical farm shop | Customer patience / difficulty |
| Research dashboard | CSV export + live HUD |

### How frustration is passed to other components

**Inside the game (React ↔ Phaser)**

```
useBehavioralTelemetry()  →  telemetrySession { frustrationScore, frustrationLevel }
        │
        ├─► emitSyncStudentState({ frustrationScore, frustrationLevel })
        │         └─► GameScene listens: FARM_EVENTS.SYNC_STUDENT_STATE
        │
        ├─► FARM_STATE events include frustrationScore, frustrationLevel
        │
        └─► Passed as props to:
              • AvatarAssistantModal
              • UnlockShopModal (shopPerformance)
              • MotivationalVideoModal
              • buildContextPayload() → /api/avatar-chat
```

**To your backend / other services**

Throttled POST when score changes (farm client → Neon):

```http
POST /api/engagement/frustration
Content-Type: application/json
```

```json
{
  "studentId": "<userId>",
  "sessionId": "<sessionId>",
  "levelNumber": 1,
  "frustrationScore": 42,
  "frustrationLevel": "moderate",
  "signals": {},
  "dominantIndicators": [],
  "source": "gameplay"
}
```

**Read API for other components** (poll after the farm has synced):

```http
GET /api/engagement/frustration?studentId=<id>
GET /api/engagement/frustration?studentId=<id>&sessionId=<sess>&limit=5
```

| Query | Required | Notes |
|-------|----------|-------|
| `studentId` | yes | Same id used at farm launch |
| `sessionId` | no | Restrict to one play session |
| `limit` | no | History length (default `1`, max `50`) |

Example response:

```json
{
  "ok": true,
  "studentId": "abc123",
  "frustrationScore": 42,
  "frustrationLevel": "moderate",
  "recordedAt": "2026-08-26T09:50:00.000Z",
  "sessionId": "sess_…",
  "levelNumber": 3,
  "source": "gameplay",
  "signals": {},
  "dominantIndicators": [],
  "history": [
    {
      "snapshotId": "fr_…",
      "frustrationScore": 42,
      "frustrationLevel": "moderate",
      "sessionId": "sess_…",
      "levelNumber": 3,
      "source": "gameplay",
      "recordedAt": "2026-08-26T09:50:00.000Z"
    }
  ]
}
```

Score is `0–100`; level is `low` | `moderate` | `high` | `very_high`.  
If no snapshots yet: `frustrationScore` / `frustrationLevel` are `null` and `history` is `[]`.  
Requires `DATABASE_URL` on gaming-service (same as other engagement routes).

**Implementation:** `syncFrustration()` in `engagementSync.js`, triggered from `App.jsx`; GET handled by `getFrustration()` in `engagementDb.mjs`.

### If your component needs live frustration

| Approach | How |
|----------|-----|
| **HTTP poll (recommended)** | `GET /api/engagement/frustration?studentId=…` on gaming-service |
| **Same Neon DB** | Read `students.latest_frustration_*` / `frustration_snapshots` |
| **Embed farm in parent** | Listen for `ForestGameBridge` events: `FARM_STATE`, `GAME_INTERACTION` |
| **Iframe parent** | Prefer the GET above; optional `postMessage` bridge not implemented yet |

Example parent listener (same page, shared bundle):

```js
import { ForestGameBridge, FARM_EVENTS } from './components/ForestGameBridge.js';

ForestGameBridge.on(FARM_EVENTS.FARM_STATE, (state) => {
  console.log(state.frustrationScore, state.frustrationLevel);
});
```

---

## 7. Game flow summary (for integrators)

1. Student completes **aptitude test** in your module → publish result (§2).  
2. **Login** redirects to farm with `studentId`, `username`, `sessionId`, `topicId`.  
3. Farm applies **mastery baseline** → Level 1 starts with adapted time targets and harvest goals.  
4. Student plays: plant → harvest → unload at **Farm Shop (E)** → customers buy automatically.  
5. **6 wrong science answers** → game over screen (not enemy damage).  
6. After **15 questions**, unlock shop opens.  
7. Telemetry + frustration stream to engagement API throughout.

---

## 8. Environment variables

### Frontend (`.env` in repo root, Vite `VITE_*`)

| Variable | Purpose |
|----------|---------|
| `VITE_ASSESSMENT_API_BASE` | Base URL for aptitude `GET …/initial-category` |
| `VITE_USE_MOCK_APTITUDE_FALLBACK` | Set `false` in production to disable mock aptitude |

### Backend (`.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres for engagement sync |
| `AVATAR_PORT` / `PORT` | API port (default `8002`) |
| `GROQ_API_KEY`, `LLAMA_*` | Sage / mind-map LLM |

---

## 9. Local development

### With frontend-app (recommended for SCI-PATH integrators)

```bash
# Terminal 1 — gaming-service API (engagement, Sage, mind maps)
cd path/to/gaming-service
npm install
npm run backend
# → http://127.0.0.1:8002

# Terminal 2 — farm Vite UI (bundled inside frontend-app)
cd path/to/frontend-app/src/components/features/gaming-service
npm install
npm run dev
# → http://127.0.0.1:5173

# Terminal 3 — SCI-PATH platform
cd path/to/frontend-app
npm install
npm run dev
# → http://127.0.0.1:3000
```

1. Sign in as a student on **frontend-app**.
2. Click **Launch Game Arena** on the student dashboard.
3. frontend-app opens the farm with query params:

```
studentId=<userId>
username=<email-local-part>
displayName=<fullName>
sessionId=<platform-session-uuid>
topicId=<always set — see table>
grade=<grade>
source=frontend-app
```

**Where params come from in frontend-app**

| Param | Source |
|-------|--------|
| `studentId` | `useUserStore.userId` (user-management JWT) |
| `username` | Email local-part, or `userId` fallback |
| `displayName` | `useUserStore.fullName` |
| `sessionId` | `sessionStorage` key per student (tab-scoped play session) |
| `topicId` | **Always passed.** Tutor `activeTopicId` → else last saved topic for that student → else first curriculum topic for their grade |
| `grade` | `useUserStore.grade` |

Code: `frontend-app/src/components/features/gaming-service/getGamingLaunchContext.ts`, `buildGamingServiceLaunchUrl.ts`, `GameArenaCard.tsx`.

The farm parses these in `platformLaunch.js` → `loginStudentFromPlatform()` and skips the manual name login screen.

### Standalone gaming-service (farm repo only)

```bash
# Terminal 1 — API
cd path/to/gaming-service && npm run backend

# Terminal 2 — Farm UI from this repo
cd path/to/gaming-service/frontend && npm run dev
```

Test launch (manual URL):

```
http://127.0.0.1:5173/?studentId=test-user-1&username=alex&displayName=Alex&sessionId=sess_demo&topicId=plant_biology&grade=7&source=sci-path
```

Verify health: `http://127.0.0.1:8002/api/health` → `postgres.enabled: true` when DB is wired.

---

## 10. Related docs

| Doc | Content |
|-----|---------|
| [`README.md`](README.md) | Game design, frustration model, features |
| [`backend/sql/README_ENGAGEMENT_SYNC.md`](backend/sql/README_ENGAGEMENT_SYNC.md) | Neon tables |
| [`frontend/src/storyline/frustration/README.md`](frontend/src/storyline/frustration/README.md) | 17-metric aptitude storyline engine |
| [`frontend/src/data/aptitudeProgress.js`](frontend/src/data/aptitudeProgress.js) | Aptitude → mastery code |
| [`frontend/src/data/platformLaunch.js`](frontend/src/data/platformLaunch.js) | URL launch parser |

---

## 11. Contact / extension points

| Need | Extension point |
|------|-----------------|
| Custom aptitude source | `setAptitudePerformanceProvider()` or localStorage key |
| Custom mastery model | `setExternalMastery({ mastery, source, meta })` in `masteryModel.js` |
| New telemetry event | `syncGameplayEvent()` → `POST /api/engagement/event` |
| Topic-specific questions | Pass `topicId` at launch; wire question bank filter (topic → crop/challenge mapping is product-specific) |

For questions about login identity, coordinate with **user-management** (`studentId` / JWT). For aptitude API contract, publish `GET /students/{id}/initial-category` as specified in §2 option A.
