# Academic Panel Demo Recording Plan (48 videos)

This plan covers **Grades 6–9**, each with **12 videos** (3 profiles × 4 video types).

**Recording status:** all slots are `planned`. No video files have been produced in this change set. Do not treat filenames below as existing assets until an operator records them.

## How to launch a controlled demo session

Use the real game with scripted *inputs* only:

```
http://localhost:5173/?demoProfile=smart&demoGrade=6&researchOverlay=1
http://localhost:5173/?demoProfile=intermediate&demoGrade=7&researchOverlay=1
http://localhost:5173/?demoProfile=weak&demoGrade=8&researchOverlay=1
```

- `demoProfile` selects the answer/timing script used for rehearsal (`smart` | `intermediate` | `weak`).
- Frustration, DDA, enemy pressure, customer patience, and shop prices still come from the live CSF / shop formulas.
- `researchOverlay=1` shows the demonstration overlay (measured vs derived vs config).
- Reset between recordings (fresh browser profile or Exit game → re-enter) so sessions do not inherit prior cash/frustration.

Generate the machine-readable matrix anytime:

```bash
node -e "import { buildDemoRecordingPlan } from './frontend/src/data/demoScenarios.js'; console.log(JSON.stringify(buildDemoRecordingPlan(), null, 2))"
```

## Video types (repeat per profile)

| Type key | Purpose | Required on-screen evidence |
|---|---|---|
| `intro` | Grade, challenge, objective, map | Grade library label, map markers, learning objective |
| `question_frustration` | Answer → time → score | Quiz UI, response time, question frustration on overlay |
| `adaptive_gameplay` | DDA response | Enemy pressure / customer patience change after scores update |
| `level_shop` | Average frustration → prices → continue | Shop prices, cash, Continue to Next Level |

## Profiles

| Profile | Intent | Scripted inputs |
|---|---|---|
| `smart` | Low frustration | Fast, mostly correct answers |
| `intermediate` | Moderate frustration | Mixed correctness, mid response times |
| `weak` | High frustration | More misses, slower answers; DDA should ease pressure |

## Folder layout (when recording)

```
recordings/
  grade-6/
    smart/{intro,question_frustration,adaptive_gameplay,level_shop}.mp4
    intermediate/...
    weak/...
  grade-7/...
  grade-8/...
  grade-9/...
```

## Checklist (48 slots)

Use the generated plan for exact `videoId`, challenge, objective, and filename. Summary counts:

| Grade | Smart | Intermediate | Weak | Total |
|---|---|---|---|---|
| 6 | 4 | 4 | 4 | 12 |
| 7 | 4 | 4 | 4 | 12 |
| 8 | 4 | 4 | 4 | 12 |
| 9 | 4 | 4 | 4 | 12 |
| **All** | 16 | 16 | 16 | **48** |

### Pre-record QA

1. Each grade loads its own challenge library (`GET /api/challenges?grade=N`).
2. Correct / incorrect feedback still works.
3. Response times and frustration scores update on the overlay.
4. Shop opens after level completion; prices match frozen frustration offer.
5. Exit game returns to `/dashboard` without system logout.
6. Map labels remain compact.

### Privacy

Use demo / test student IDs only. Do not record real credentials or personally identifiable student data.
