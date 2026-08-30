# Gaming Service — Guide for Other Components

Short guide for teams that need the **farm game flow**, how to run it **locally until the frontend is deployed**, and the **open API for frustration score**.

Full product details: [`README.md`](README.md) · Deep integration: [`INTEGRATION.md`](INTEGRATION.md)

---

## 1. End-to-end flow

```
Student signs in (your platform)
        ↓
Optional aptitude / placement (IAE)
        ↓
Launch farm with studentId (+ sessionId, username, …)
        ↓
Play: plant → science quiz → grow → harvest (onto back) → Farm Shop unload → sell
        ↓
Live frustration (0–100) updates after answers
        ↓
Farm POSTs snapshots to gaming-service backend (Neon)
        ↓
Your component GETs frustration by studentId
```

| Step | What happens |
|------|----------------|
| Launch | Open farm with `?studentId=…&sessionId=…` (same id everywhere) |
| Farm play | Science quizzes gate plant / harvest / collect; crops stack on the student’s **back**, then unload at the Farm Shop with **E** |
| Frustration | Computed in the farm UI (0–100 → `low` / `moderate` / `high` / `very_high`) |
| Sync | Farm writes `POST /api/engagement/frustration` (throttled ~2.5s after changes) |
| Your app | Poll `GET /api/engagement/frustration?studentId=…` |

---

## 2. Deploy the frontend on Render

The farm UI is a Vite static build. Sage / leaderboard / mind maps still run on the **gaming backend** (`http://3.6.20.31:8002` today). Render rewrites `/api/*` to that host so the HTTPS site can talk to it.

### Blueprint (this repo)

1. Push `main` to GitHub (`SCI-PATH/gaming-service`).
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the `gaming-service` repo. Render reads [`render.yaml`](render.yaml).
4. Apply. You get a URL like `https://gaming-service-frontend.onrender.com`.

### Manual Static Site (same settings)

| Field | Value |
| --- | --- |
| **Root directory** | repo root (leave blank) |
| **Build command** | `npm ci && npm run build` |
| **Publish directory** | `frontend/dist` |
| **Node** | `22` (`NODE_VERSION` env) |

**Redirects / Rewrites** (order matters — catch-all last):

| Source | Destination | Action |
| --- | --- | --- |
| `/api/*` | `http://3.6.20.31:8002/api/*` | Rewrite |
| `/assessment-api/*` | `http://43.204.6.115:8004/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

If Sage chat streams fail through the static rewrite, create a **Web Service** instead: same build command, start command `npm run preview -- --host 0.0.0.0 --port $PORT`, and set `GAMING_API_PROXY_TARGET=http://3.6.20.31:8002`.

Point your platform’s “Launch Game” URL at the Render host:

```
https://<your-service>.onrender.com/?studentId=<SAME_ID>&sessionId=<optional>&username=<optional>
```

## 3. Run locally

Until you use the Render URL, other components can treat **this repo’s local frontend + backend** as the live gaming host.

### What you need running

| Process | Port | Command (from `gaming-service` root) |
|---------|------|--------------------------------------|
| **Backend** (Sage, engagement, frustration API) | `8002` | `npm run backend` |
| **Frontend** (Vite + Phaser farm) | `5173` | `npm run frontend` |

```bash
cd gaming-service
npm install
# Copy .env.example → .env and set DATABASE_URL (Neon) + GROQ_API_KEY if you use Sage
npm run backend    # terminal 1 → http://127.0.0.1:8002
npm run frontend   # terminal 2 → http://127.0.0.1:5173
```

### Why local frontend matters

- Vite proxies `/api/*` → `http://127.0.0.1:8002` (gaming backend).
- Quizzes can use the deployed Assessment Engine; **Sage / mind maps / frustration write+read** need the **gaming backend** (`:8002`) with `DATABASE_URL` for frustration persistence.
- After you deploy the frontend to Vercel/Render, point your platform’s “Launch Game” URL at that host instead of `:5173`. Keep calling the **same backend** (or a deployed gaming API) for frustration.

### Launch URL (local)

```
http://127.0.0.1:5173/?studentId=<SAME_ID_YOUR_APP_USES>&sessionId=<optional>&username=<optional>
```

Use the **same `studentId`** when you later call the frustration GET API.

### Health check

```
GET http://127.0.0.1:8002/api/health
```

Expect `ok: true`. Frustration persistence needs `postgres.enabled: true` (`DATABASE_URL` configured).

---

## 4. Open API — get frustration score

Other components (learning path, assessment, dashboards, etc.) can read the latest score here.

### Endpoint

```http
GET /api/engagement/frustration?studentId=<id>
```

**Base URL (local):** `http://127.0.0.1:8002`  
**Base URL (deployed):** your gaming-service host (same path)

### Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `studentId` | **yes** | Same id used at farm launch |
| `sessionId` | no | Limit to one play session |
| `limit` | no | History length (default `1`, max `50`) |

### Examples

```http
GET http://127.0.0.1:8002/api/engagement/frustration?studentId=abc123
GET http://127.0.0.1:8002/api/engagement/frustration?studentId=abc123&limit=5
GET http://127.0.0.1:8002/api/engagement/frustration?studentId=abc123&sessionId=sess_xyz&limit=10
```

```bash
curl "http://127.0.0.1:8002/api/engagement/frustration?studentId=abc123"
```

```js
const res = await fetch(
  `http://127.0.0.1:8002/api/engagement/frustration?studentId=${encodeURIComponent(studentId)}`,
);
const data = await res.json();
// data.frustrationScore  → 0–100 or null
// data.frustrationLevel  → "low" | "moderate" | "high" | "very_high" | null
```

### Success response

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

### Score bands

| Score | Level |
|------:|-------|
| 0–30 | `low` |
| 31–60 | `moderate` |
| 61–80 | `high` |
| 81–100 | `very_high` |

### Empty / errors

| Situation | Response |
|-----------|----------|
| No snapshots yet | `ok: true`, `frustrationScore: null`, `frustrationLevel: null`, `history: []` |
| Missing `studentId` | `400` + `ok: false`, `error: "studentId required"` |
| No `DATABASE_URL` | `ok: false`, `skipped: true`, `error: "DATABASE_URL_not_configured"` |

### Notes for integrators

1. **Auth:** none today (same as other engagement routes). Identity is the `studentId` query param.
2. **Freshness:** farm POSTs after answers (debounced ~2.5s). Poll every few seconds if you need near-live values.
3. **CORS:** backend allows `Access-Control-Allow-Origin: *` for these GETs.
4. **Write path (farm only):** `POST /api/engagement/frustration` — your components normally only **GET**.

---

## 5. Checklist for your team

- [ ] Gaming backend running on `:8002` with `DATABASE_URL`
- [ ] Farm frontend running on `:5173` (until Vercel/Render deploy)
- [ ] Student opens farm with your `studentId`
- [ ] Student plays at least one answer so a frustration snapshot is written
- [ ] Your service calls `GET /api/engagement/frustration?studentId=…`

When the frontend is deployed, replace `:5173` with the Vercel/Render URL; keep using this GET on the gaming API host for frustration.
