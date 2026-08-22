# Neon engagement DB wiring

## What was added

When `DATABASE_URL` is set, the game mirrors research data into schema `engagement_gaming`:

| Game action | Neon table |
|---|---|
| Login | `students` + `game_sessions` |
| Logout | `game_sessions` (end) |
| Level complete | `level_progress` + `quiz_attempts` |
| Shop unlock | `unlock_catalog` + `student_unlocks` |
| Frustration changes | `frustration_snapshots` (+ student latest) |
| Sage mentor chat | `mentor_interventions` |

localStorage still works offline. DB sync is best-effort (failures are logged, play continues).

## Setup (required)

1. Create the tables in DBeaver (run `backend/sql/004_all_extra_tables.sql` if not done).
2. Neon console → **Connect** → copy the Postgres connection string.
3. Put it in project root `.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

4. Restart backend: `npm run backend`
5. Confirm health: open `http://127.0.0.1:8002/api/health` — `postgres.enabled` should be `true`.
6. Play: login → complete a level / open Sage / buy unlock → refresh tables in DBeaver.

## APIs

- `POST /api/engagement/student`
- `POST /api/engagement/session/start`
- `POST /api/engagement/session/end`
- `POST /api/engagement/level`
- `POST /api/engagement/quiz`
- `POST /api/engagement/unlock`
- `POST /api/engagement/frustration`
- `POST /api/engagement/mentor`
- `POST /api/engagement/event`
