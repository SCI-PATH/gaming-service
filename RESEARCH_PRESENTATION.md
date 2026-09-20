# SCI-PATH — Frustration system (research presentation)

How the **Companion-Signal Frustration (CSF)** score is computed, and how it drives **mind maps**, **enemies**, **customer patience**, **graphs**, and **analytics**.

The student never hears the word “frustration.” The score is a **private 0–100 companion signal**. It does **not** rewrite science questions. It changes **help, world pressure, and what researchers can see**.

```
Farm play + quiz answers
        ↓
Behavioral telemetry (clicks, time, retries, enemies, shop)
        ↓
CSF score 0–100  +  level band  +  named signals
        ↓
┌───────────┬───────────┬────────────┬─────────────┬──────────────┐
│ Sage +    │ Enemies   │ Shop       │ Graphs      │ Analytics    │
│ mind maps │ (combat)  │ patience   │ (dashboard) │ (export)     │
└───────────┴───────────┴────────────┴─────────────┴──────────────┘
```

Source of truth: [`frontend/src/data/frustrationModel.js`](frontend/src/data/frustrationModel.js).

---

## 1. How the frustration algorithm works

**Design name:** Companion-Signal Frustration (CSF).  
**Type:** rule-based, deterministic, no ML training.  
**Recalculated** after every quiz answer (correct or incorrect) from live session metrics.

### Bands

| Score | Level | What the world does |
| ---: | --- | --- |
| 0–30 | `low` | Challenge pace: faster farm, richer mind maps |
| 31–60 | `moderate` | Gentle support |
| 61–80 | `high` | Sage may open; calmer enemies; slower shop drain |
| 81–100 | `very_high` | Softest combat, longest patience, micro mind maps |

Sage auto-open and “retry this lesson” both use **score ≥ 61** and enough agreeing signals.

### Signal mix (weights sum to 100)

Each unit of a fully-on signal ≈ one point of score.

| Part | Weight | What it measures |
| --- | ---: | --- |
| Consecutive wrong answers | 20 | Streak of misses |
| Incorrect-answer rate | 18 | Errors / total answers |
| Performance decline | 13 | Score dropping vs earlier in the session |
| Response time vs *this student’s* baseline | 12 | Slowing down, not “slow in general” |
| Retries | 11 | Re-attempts on the same question |
| Mouse / rapid clicks | 6 | Rage-click bursts, erratic movement |
| Inactivity | 6 | Idle seconds |
| Hints + answer switching | 6 | Help use and changing selections |
| Gameplay failure | 5 | Enemy hits, restarts, skips, **customers who left** |
| Same-concept struggle | 3 | Repeated misses on one idea |

Gameplay failure itself is a blend: enemy hits (50%), level restarts (30%), skipped questions (20%), customers who walked away (25% of that bucket, scaled).

### Soft / hard scaling

Raw counts are not added linearly. Each signal uses a **piecewise scale**:

- below a **soft** threshold → quiet ramp (at most 35% of that weight)
- between soft and **hard** → linear
- at or above **hard** → full weight

Examples: consecutive wrongs soft=2 / hard=3; inactivity 18s / 40s; enemy hits 2 / 5.

### Companion-signal caps (why one miss is not “frustrated”)

1. **Single isolated mistake** cannot contribute more than **10** points.
2. Score cannot exceed **40** unless **at least 2** signals are active.
3. Score cannot exceed **60** unless **at least 3** signals are active.
4. **Recovery dampening:** a recent correct streak (≥ 2) with no consecutive-fail streak multiplies the raw score by as little as **0.78** (up to 22% quieter).

The function returns:

- `score`, `level`
- `signals` — named evidence (`consecutive_wrong`, `shop_customers_left`, …)
- `parts` / `dominant` — top contributors (for explainability on the dashboard)
- `adaptation` — Sage tone, mind-map size, combat, shop, timers, cash

That **adaptation profile** is what every subsystem below consumes.

---

## 2. Mind maps

**When:** after incorrect answers (and related struggle rules). Sage can open with a map built from **this miss**, not from the student’s wrong pick.

**Pipeline**

```
Assessment Engine (owns the correct answer)
        ↓
Textbook evidence (retrieved chunks / ranked sentences)
        ↓
mindMapGenerator — organizes knowledge into branches
        ↓
CSF adaptation — how much map, how simple the language
```

Code: [`backend/lib/mindMapGenerator.mjs`](backend/lib/mindMapGenerator.mjs).

**Pedagogy rules**

- The engine owns the key. The LLM (or local fallback) **only organizes** it.
- Student wrong answers **never appear** on the map.
- Root node is the **scientific concept**, not a raw “True/False” token.

**How CSF personalizes the map**

| Band | Branches | Explain depth | Tone | Language |
| --- | ---: | --- | --- | --- |
| Low | up to 8 | rich | challenge | full |
| Moderate | up to 5 | medium | practice | full |
| High | up to 3 | simple | support | simplified |
| Very high | up to 2 | micro | support | one step at a time |

Sage speech is paced the same way (private score → warmer / slower / shorter sentences) and **must never say the number**.

---

## 3. Enemies

Enemies (moles, treants) patrol the farm. Hits and deaths feed **gameplay failure** in CSF. CSF then **eases or raises combat pressure**.

Live loop: `GameScene.applyFrustrationGamePersonalization` blends mastery-band settings with `buildFrustrationAdaptation().combat`.

| Band | Speed | Count | Distance from player | Hurt invulnerability | Chance a hit actually damages | Look |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Low | ×1.08 | ×1.10 | slightly closer | ×0.9 | 100% | larger, warmer tint |
| Moderate | ×0.92 | ×0.90 | +1 tile | ×1.1 | 95% | default |
| High | ×0.70 | ×0.55 | +4 tiles | ×1.45 | 70% | smaller, cooler tint |
| Very high | ×0.50 | ×0.35 | +7 tiles | ×1.80 | 45% | smallest, paler |

When frustration is high, some contacts **glance off** (`enemyDamageChance`). Patrol speed updates live as the score changes. The question bank stays the same; only **how hard the farm feels** changes.

Enemy hits also **raise** the next CSF score — a closed loop: struggle → calmer enemies → room to recover → score can fall.

---

## 4. Customer patience levels

The farm shop is a **FIFO queue**. Each customer has `patience` / `maxPatience` (0–100). Drain rate and wait time come from CSF via `getShopDifficulty`.

Code: [`frontend/src/data/farmCustomerShop.js`](frontend/src/data/farmCustomerShop.js), moods in [`frontend/src/data/customerMood.js`](frontend/src/data/customerMood.js).

### Shop difficulty by band

| Band | Max customers | Patience window | Drain per tick | Orders | Label |
| --- | ---: | ---: | ---: | --- | --- |
| Low | 4 | 42s | 2.2 | bigger carts | Lively shop |
| Moderate | 3 | 60s | 1.5 | mixed | Balanced shop |
| High | 2 | 90s | 0.9 | smaller | Gentle shop |
| Very high | 1 | 120s | 0.55 | one item | Supportive shop |

Higher frustration → **fewer customers, slower drain, longer wait, more hints**.

### Mood from remaining patience

| Remaining patience | Face | State |
| --- | --- | --- |
| > 65% | 😊 | Patient |
| 35–65% | 😐 | Waiting |
| ≤ 35% (or `IMPATIENT`) | 😟 / 😡 | Unhappy / Angry |
| 0 (`LEFT`) | 😞 | Left — waited too long |

Customers who leave increment `shop_customers_left`. **Two or more** leavers fire the `shop_customers_left` CSF signal and add to the gameplay-failure part of the score.

On-screen: a small patience bar over each customer (`FarmShopLayer`).

---

## 5. Graphs (student / research dashboard)

UI: [`frontend/src/components/ResearchDashboard.jsx`](frontend/src/components/ResearchDashboard.jsx)  
Charts: [`frontend/src/components/studentDashboardCharts.jsx`](frontend/src/components/studentDashboardCharts.jsx)  
History: [`frontend/src/data/frustrationHistoryStore.js`](frontend/src/data/frustrationHistoryStore.js)

Every answered question appends a sample (score, band, correct/incorrect, signals, topic). Filters: chapter and date range.

| Graph | What it shows | How it uses CSF |
| --- | --- | --- |
| **Frustration line** | Score over days / play | Y-axis 0–100 with green (low), gold (moderate), coral (high) bands at 30 and 60 |
| **Topic bars** | Average score per science chapter | Bar color from the same 0 / 31 / 61 cutoffs; miss counts beside the score |
| **Accuracy ring** | % correct | Context next to the live score (accuracy down often travels with score up) |
| **Question timeline** | Each farm question | Meter = how the round “felt” (CSF score that round); type, prompt, student answer, key if missed |

The dashboard also shows consecutive misses, how many times Sage opened, and a short **journey headline** from the stored samples.

---

## 6. Analytics (research export)

[`buildResearchDashboardSnapshot`](frontend/src/data/researchDashboardData.js) builds one object researchers can download as **JSON** or **CSV**.

**JSON snapshot includes**

- student id / display name
- mastery, accuracy, cash, RP, DDA misses
- **live CSF score and level**
- consecutive fails, Sage trigger count and last reason
- per-question **frustration history** (score, band, signals)
- lesson rows (mastery %, quiz correct/incorrect, response time vs target, gameplay grade)
- unlock purchases

**CSV** has two blocks: lesson table, then “frustration over play” (question index, level, score, band, correct, signals).

With `DATABASE_URL` set, the same engagement events can sync to Neon (`engagement_gaming`) for cohort analysis.

**Explainability for a paper slide**

For any sample you can report:

1. the integer score and band  
2. which named `signals` were on  
3. the top `dominant` parts (e.g. consecutive wrongs + time vs baseline)  
4. what the world did next (enemy speed, shop drain, mind-map branch cap)

That is the full loop: **observable behavior → transparent score → adaptive world → logged analytics**.

---

## One-slide summary

| Subsystem | If CSF is **low** | If CSF is **high / very high** |
| --- | --- | --- |
| Algorithm | Few signals; score capped unless they agree | Multiple signals; consecutive misses and decline dominate |
| Mind map | Broader, richer, more branches | 2–3 branches, micro language |
| Enemies | Faster, more, harder hits | Slower, fewer, many hits glance off |
| Shop patience | Fast drain, busy queue | Long wait, one customer, slow drain |
| Graphs | Line stays in the green band | Line enters gold/coral; topic bars rise |
| Analytics | History still logged | Same schema; extra Sage triggers and `shop_customers_left` |

**Code map for demos**

| Piece | File |
| --- | --- |
| Score + bands + adaptation | `frontend/src/data/frustrationModel.js` |
| Live metrics | `frontend/src/avatar/useBehavioralTelemetry.js` |
| Mind maps | `backend/lib/mindMapGenerator.mjs` |
| Enemy pressure | `frontend/src/game/scenes/GameScene.js`, `frontend/src/game/objects/Enemy.js` |
| Patience / shop | `frontend/src/data/farmCustomerShop.js` |
| Graphs | `frontend/src/components/studentDashboardCharts.jsx` |
| Export | `frontend/src/data/researchDashboardData.js` |
