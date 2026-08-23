# SCI_PATH Farm Game

Grade 6–9 science learning game. Farming actions are the play; a science question is the **knowledge gate** that unlocks the next action. Performance and a **0–100 frustration score** then change rewards, prices, farm look, combat pressure, and whether the mentor opens.

```
Science question
        ↓
Student performance + frustration
        ↓
DDA decision (Weak / Medium / Smart)
        ↓
Unlockable options, prices, assistance
        ↓
Interactive farm action
        ↓
Visible world change
```

A correct answer must change the farm (plant, harvest, repair, sell). Coins are not the only consequence. A single wrong answer is never enough to label a student frustrated.

The real aptitude test lives in another component. This app uses mock profiles so the rest of the loop can run.

---

## Features

### Login

Students enter a name, or pick a mock aptitude profile:

| Login | Role in the prototype |
| --- | --- |
| Any name | Live session tracking from farm play |
| **Alex** | Strong performer — low frustration seed for storyline |
| **Jordan** | Average performer |
| **Sam** | Struggling performer — high frustration seed |

Mock profiles feed the **17-metric Frustration Engine** used by the Level 1 storyline. Live play uses a separate session scorer (below).

### Farm activities

All of these use the same science-gate loop. Questions come from the existing bank (`scienceQuestions.js` / `farmLevels.js`), not from the LLM.

| Activity | What the student does | After a correct answer |
| --- | --- | --- |
| **Crops** | Plant → pick N → load at the dock → sell | Beds grow; cart fills; cash on sale |
| **Animals** | Tend the paddock → collect produce → sell | Animals and produce appear |
| **Cleaning** | Sweep / clear a yard plot → sell compost | Mess is removed |
| **Enemies** | Appear while the student is moving | Hits and deaths raise frustration |

Crop challenges run as a 100-item sequence (one vegetable type at a time). Harvest count and bed density follow mastery: Smart students pick more; Weak students pick fewer.

Each farm level asks **15 science questions**, then the unlock shop opens.

### Performance bands (Weak / Medium / Smart)

Quiz attempts are scored from **correctness + response time**. Mastery (0–1) from the previous level sets this level’s time target immediately — not mid-level.

| Band | Mastery | Typical effect |
| --- | --- | --- |
| **Weak** | below 0.40 | More time, more retries, cheaper shop, calmer enemies, struggling farm beds |
| **Medium** | 0.40 – 0.71 | Standard timers, prices, and mixed farm look |
| **Smart** | 0.72+ | Tighter time target, fewer retries, higher prices, faster enemies, healthier farm |

Gameplay pressure (enemies, timers, hints, cash bonus) is **separate from question content**. The question bank does not change; how hard the *farm* feels does.

| Gameplay setting | Weak | Medium | Smart |
| --- | --- | --- | --- |
| Answer timer | 45s | 25s | 15s |
| Retries per question | 4 | 2 | 1 |
| Hints | more | limited | minimal |
| Enemy speed / count | slower / fewer | standard | faster / more |
| Next-level cash bonus | none | +10% | +22% |

---

## Frustration score

There are **two** scorers. Both output **0–100**. Neither writes “frustrated” into student-facing story text.

### 1. Live session score (farm play)

Used while the student is on the farm: shop prices, Sage, motivational clips, research dashboard, and Neon sync.

- Code: [`frontend/src/data/frustrationModel.js`](frontend/src/data/frustrationModel.js)
- Fed by [`useBehavioralTelemetry`](frontend/src/avatar/useBehavioralTelemetry.js) (clicks, hints, retries, inactivity, enemy hits, answer switches, timing vs this student’s baseline).

**Behaviour**

- Several signals must agree. One isolated mistake is capped at **12** points.
- Score cannot pass **40** unless at least **2** signals are active.
- Score cannot pass **60** unless at least **3** signals are active.

| Score | Level |
| ---: | --- |
| 0 – 30 | `low` |
| 31 – 60 | `moderate` |
| 61 – 80 | `high` |
| 81 – 100 | `very_high` |

Weights (live model):

| Signal | Weight |
| --- | ---: |
| Incorrect answers | 18 |
| Consecutive wrong | 16 |
| Response time vs baseline | 14 |
| Retries | 12 |
| Performance decline | 12 |
| Mouse / rage clicks | 8 |
| Inactivity | 8 |
| Hints + answer changes | 6 |
| Gameplay failure (enemies, restarts, skips) | 6 |

Answer time is compared to **that student’s baseline**. A slow-but-steady student is not treated as frustrated just for taking longer.

### 2. Aptitude / storyline engine (17 metrics)

Used at login for mock (or later real) aptitude data → Grok Level 1 storyline.

- Code: [`frontend/src/storyline/frustration/FrustrationEngine.js`](frontend/src/storyline/frustration/FrustrationEngine.js)
- Formula, caps, and example: [Frustration Score Calculation](frontend/src/storyline/frustration/README.md)

Each of 17 metrics is normalized to 0–100, then mixed with fixed weights (rescaled from a 96% table so they still sum to 100%). The result is rounded to an integer 0–100.

| Score | Level |
| ---: | --- |
| 0 – 25 | `LOW` |
| 26 – 50 | `MILD` |
| 51 – 70 | `MODERATE` |
| 71 – 85 | `HIGH` |
| 86 – 100 | `VERY_HIGH` |

---

## What the frustration score changes

The score does **not** swap the science topic or rewrite the question. It changes **rewards, assistance, and how the world looks**.

### Unlock shop

After 15 questions, cash buys animals and props. Price = `basePrice × band × frustration × speed × performance`, clamped between **0.45× and 1.7×**.

| Performance | Price multiplier |
| --- | ---: |
| Smart | 1.35× |
| Medium | 1.00× |
| Weak | 0.62× |

| Frustration | Extra price multiplier |
| --- | ---: |
| low | 1.00× |
| moderate | 0.92× |
| high | 0.78× |
| very_high | 0.65× |

Slow answers also discount; fast / high performance slightly raises price. Shop items are decorative ownership — they do not spawn extra quests.

### Farm look

[`FarmingVisualPlugin`](frontend/src/game/plugins/FarmingVisualPlugin.js) paints plant beds from band + frustration:

| Student | Beds |
| --- | --- |
| Weak **or** high / very high frustration | Mostly wilted, dry, or shaded |
| Medium | Split healthy / struggling |
| Smart **and** low / mild frustration | Mostly healthy, one problem left |

A correct story or farm action can recover a matching bed so the field improves as the student succeeds.

### Sage mentor

Sage auto-opens only when several metrics agree. A single wrong answer never opens the mentor.

Opens for **support** when:

- live frustration is **≥ 61** with at least **3** active signals and at least 2 answers, or
- **3+** incorrect answers, or **3** consecutive wrongs, or **2+** misses on the same concept, or
- **2+** other struggle signals (retries, low accuracy, rage clicks with a companion signal, stagnation).

After help:

- improving students get a quiet window (about 2 minutes) so Sage does not nag
- continued struggle **escalates** scaffolding
- hard wrong-answer streaks can still reopen immediately

Incorrect answers also build a **mind map** of the missed concept (LLM on the backend, with a local fallback). High-performing idle students can get an **enrichment** nudge instead of support.

### Motivational clips

When the shop or a high-frustration moment needs a reset, a short sketch is chosen from the student’s current frustration **level** (not shown as a score to the child).

### Adaptive storyline

Mock aptitude → 17-metric engine → Grok. The story uses the score only for **tone and complexity**. Student-facing text must not say “you are struggling” or name the frustration level.

### Research console

In-game dashboard exports CSV / JSON: mastery, accuracy, unlocks, live frustration, gameplay history. With `DATABASE_URL` set, the same events mirror into Neon (`engagement_gaming`). See [backend/sql/README_ENGAGEMENT_SYNC.md](backend/sql/README_ENGAGEMENT_SYNC.md).

---

## Layout

```
project-root/
├── frontend/          React + Phaser UI
├── backend/           HTTP API + JSON database
│   ├── index.mjs
│   ├── lib/
│   └── data/          storyline records (app.json)
└── README.md
```

Frontend and backend are **separate processes**. There is no combined command that starts both.

---

## Run

Install once from the repo root:

```bash
npm install
```

Put LLM keys in a root `.env` (used by the backend).

Start the backend (API + database) in one terminal:

```bash
npm run backend
```

Backend listens on http://127.0.0.1:8002 (`/api/health`, `/api/avatar-chat`, `/api/mind-map`, `/api/storyline`). Storylines are stored in `backend/data/app.json`.

Start the frontend in a second terminal:

```bash
npm run frontend
```

Frontend is http://127.0.0.1:5173 and proxies `/api` to the backend.

---

## Out of scope

- Building or changing the **aptitude test** (swap `MockAptitudeDataProvider` later)
- AI **writing** science questions
- School SSO / classroom identity
- Treating coins as the only result of an answer
