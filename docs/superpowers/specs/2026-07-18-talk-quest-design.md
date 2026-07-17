# Talk Quest (トーククエスト) — Design Spec

**Date:** 2026-07-18
**Status:** Approved by user (concept + architecture sections approved in brainstorming session)

## 1. What this is

A live talking tutor for Japanese elementary-school kids (ages 6–12), built as a browser 3D game where **talking is the weapon**. The kid speaks into the mic; an AI tutor teaches short lessons out loud and coaches in realtime; enemy characters in a 3D arena are conversation opponents the kid defeats by speaking well. Wins award XP/stats into the existing RPG character dashboard (CSV progression, item unlocks).

**Subjects (12):** social skills, english, psychology, persuasion, life hacks, philosophy, morals & ethics, negotiation, friendship, teamwork, money, stocks.

**Language:** Japanese primary; English used during english-subject lessons. Speech recognition toggles `ja-JP` / `en-US` per lesson phase.

## 2. Cast

- **The Hero — the kid themself.** The main character is not a fictional avatar: it carries the child's own name, an avatar they customize to be *them* (from `content/avatars/`), and it visibly wears/holds the items they have unlocked. The hero stands in the arena facing the enemy; when the kid speaks, the hero acts (attack animations, reactions). Stats, XP, and levels are framed everywhere — by the UI and by the tutor's spoken lines — as the child's own growth, never the character's: 「〇〇ちゃんのこうしょうレベルが上がった！」 not "your character leveled up". One hero per child profile (§4.2.1).
- **The Tutor** — friendly mentor character with its own VOICEVOX anime voice. Teaches, coaches from the sidelines during battles, corrects gently, and delivers praise and reward reveals in informational, process-focused language per §3.5 rule 3.
- **Enemy characters** — animated transparent-WebM billboard sprites in the 3D arena, reusing the credit-palace character pipeline (`/mnt/c/Projects/book/credit-palace/assets/character/web/`, transcode via `transcode-web.sh`). Existing bull WebMs (10 actions: idle/angry/cry/laugh/shock/excitement/dancing/fighting/flying/sleep in 6 colors) serve as v1 placeholder enemies. Each enemy has a persona and its own VOICEVOX speaker ID (e.g., stingy merchant for negotiation, sulking friend for friendship, trickster for philosophy, scam-fox for money safety).

## 3. Session flow (~10–15 min)

1. **Subject select** — 12 icons → unit select.
2. **Teach phase (~3 min)** — tutor explains one small concept aloud with examples, asks check questions. Kid can interrupt with free talk at any time; tutor answers, then steers back to the lesson.
3. **Battle phase** — enemy appears with an HP bar. Each spoken answer by the kid is scored by Claude (0–100) → damage. Enemy replies in character; tutor gives coaching tips when the kid is stuck. 3–6 exchanges.
4. **Victory & debrief** — defeat is always comic (enemy runs away crying; never scary). Tutor debriefs (~30 s) what the kid did well; progression written to CSV; item-unlock celebrations when thresholds cross. Losing = enemy giggles, tutor offers a retry with a hint. Rewards themselves are NOT granted for winning or for correct answers — see §3.5: they accumulate continuously from voiced engagement throughout the whole session.

**Realtime feel:** streaming speech recognition shows live subtitles as the kid talks; Claude responses stream so the enemy/tutor starts speaking within ~1–2 s. The pipeline is deliberately STT → text LLM → TTS (no live video/avatar generation) — this keeps latency low and cost near zero outside the LLM calls.

**Safety:** kid-safe system prompt — age-appropriate language, nothing scary or inappropriate, always encouraging.

## 3.5 Engagement-based reward system (research-informed)

**Design decisions (user, 2026-07-18):** rewards come from voiced engagement, never from correctness — and, after a deep-research pass on motivation science (`docs/superpowers/research/2026-07-18-reward-motivation-research.md`), rewards are delivered as **surprise, informational feedback**, never as a promised payment for engaging. Rationale: announced "talk = earn" tickers are the most motivation-damaging reward pattern for children (engagement-contingent expected rewards, d = −0.43 for kids), while surprise rewards show no harm and informationally-framed rewards actively help.

**The four rules:**

1. **Talking IS the power (competence, in the loop itself).** The primary "reward" for speaking is diegetic and immediate: when the kid voices a thought, the enemy staggers, the hero acts, the world responds. No sound = nothing happens in the world. This delivers the no-voice-no-progress rule through gameplay rather than through a wage.
2. **Surprise treasure, never wages.** There is no visible earning meter and the game never says "talk and you'll earn X." Voiced engagement accrues silently in the backend (nothing is ever forfeited — skipping a question loses nothing; the accrual only grows while real speech is detected). At **unpredictable, variable moments** — mid-battle, at debrief, sometimes next session — accrued engagement converts into treasure drops, item unlocks, and XP, presented as discoveries. Variable timing (variable-ratio + milestone + narrative-embedded delivery) is deliberate: it keeps repeated surprises from congealing into an expected payout.
3. **Every reward is information about growth.** The tutor frames each drop as evidence of what the kid *can now do*, in process language: 「じぶんのことばで理由をせつめいできたね！だから…」 — never "you earned 50 coins for talking." Levels, stats, and items are records of ability ("negotiation level = how well you can negotiate now"), reinforced by the hero-is-you framing (§2). Praise itself follows the same rule: informational and specific about what the kid did, never controlling ("good, now do it again") and never evaluative of the child as a person.
4. **Answers counted, never graded.** A neutral "things I said" journal tallies answers given and questions explored — a logbook, not a score. **No correctness scores, no grades, no leaderboards anywhere in the game.** Answer quality still drives battle drama (damage, enemy reactions) because the enemy reacting is the fun, but the tutor's debrief talks about ideas and effort, not rightness percentage.

**Supporting mechanics:**

- **Autonomy everywhere:** kid chooses subject, unit, and (later) which enemy to face and how to approach it; the tutor offers choices rather than commands.
- **Cold-start bootstrapping:** for a reluctant child with low initial interest, a per-child config enables more frequent early treasure to get them talking at all — then deliberately fades as engagement becomes self-sustaining (the research-legitimate use of extrinsic incentives).
- **Anti-gaming, gently:** accrual uses the speech-recognition signal (real speech, not table-banging); nonsense-chanting gets a playful tutor redirect, not punishment.
- **Parent visibility:** the engagement accrual and session records are visible to parents in the data files, not to the kid as a wage meter.
- **Implementation:** the recognizer's active/inactive signal feeds a backend accrual per session; a drop-scheduler converts accrual into surprise rewards on a variable schedule; CSV progression stores the results. The kid-facing UI shows: the hero, the enemy, the journal — no money ticker.

The overarching intent stands: kids who play because talking feels powerful and growing feels good — enjoying the journey, not chasing the numbers.

## 3.6 Visual & audio polish

High-quality presentation is a core requirement, not a nice-to-have:

- **Animation:** enemy sprites always animate (idle loops, hit reactions, defeat), damage numbers pop with easing, HP bar drains smoothly, XP toasts and unlock celebrations use particle/confetti effects. UI transitions (screen changes, phase changes) are animated, never instant cuts.
- **Sound effects:** hits, misses, victory fanfare, unlock jingle, UI clicks, tutor "ding" when praising.
- **Background music:** per-phase BGM (calm during teach phase, upbeat battle track, victory theme), auto-ducked while characters speak so voices stay clear.
- **Asset source:** the existing "asset box" repository (SFX + BGM library; repo link to be provided by user — until then, development uses silent placeholders wired through the same audio manager so assets drop in without code changes).

## 3.7 Deep Question Engine (pedagogy core)

The product's core value is asking profound, growth-driving questions — not just quizzing. The tutor's system prompt embeds a question strategy layer that fires at three moments: **after a mistake** (instead of just correcting), **during the debrief**, and **opportunistically during free talk**. One deep question at a time, phrased for ages 6–12. The six question lenses:

1. **Practical application** — 「それ、明日学校でどう使える？」(How could you use this tomorrow?)
2. **Creative synthesis** — connect today's lesson with *yesterday's* lesson or another subject (powered by conversation history, §4.2.1): 「昨日の『お金』の話と今日の『交渉』、どうつながると思う？」
3. **Critical thinking** — why/what-if/what's-the-evidence questions that make them reason, not recall.
4. **Emotional intelligence & resilience** — 「そのとき、どんな気持ちだった？次はどうする？」— naming feelings, bouncing back from the lost battle.
5. **Mindset, gratitude & open-mindedness** — questions that motivate and notice what they already have.
6. **Action & focus** — 「今もっているもので、まず何ができる？」— recognizing resources and choosing one concrete next step.

Rules: the tutor asks, then *listens* — it never answers its own deep question immediately; follow-ups build on the kid's actual answer; max 2–3 deep questions per session so it stays a game, not an interrogation. The debrief always ends with one application or synthesis question. This is the mechanism for teaching the life lessons parents wish they'd learned earlier — the battles are the hook, the questions are the product.

## 4. Architecture

```
Kid's mic ─▶ Chrome Web Speech API (streaming, ja-JP/en-US)
                │ live text (interim = subtitles)
                ▼
        Node backend ─▶ Claude API (one call per turn:
                │        enemy persona + tutor coach + damage/XP scoring)
                ▼
        VOICEVOX local TTS (localhost:50021, per-character voices)
                │ audio
                ▼
   3D arena (Three.js) — enemy WebM sprite talks, HP drops,
   XP ─▶ CSV progression (existing dashboard data)
```

All code lives in `kids_education`; credit-palace is imported from (patterns + character assets), never modified.

### 4.1 Frontend — `src/game/` (Vite + TypeScript + Three.js)

- **3D stage:** one small fixed arena scene (the-chair style: Kenney kit props, warm colors). The kid's hero avatar stands in the foreground facing the enemy (over-the-shoulder framing so the kid sees "themself" confronting it); tutor stands at the side. Hero reacts when the kid speaks (attack/act animations) and displays equipped unlocked items. Enemy = WebM billboard with action switching (idle → shock on hit → cry on defeat). v1 hero: simple picker from `content/avatars/` + name entry; deeper customization later.
- **HUD (DOM overlay, not WebGL):** enemy HP bar, live subtitles of kid's speech, tutor/enemy captions, damage numbers, XP toast. Big fonts, tap-friendly.
- **Speech in:** Web Speech API with interim results. Push-to-talk (big mic button) plus hands-free mode. Barge-in: kid speaking pauses character audio.
- **Screens:** subject select → unit select → arena. Hidden debug mode: type instead of speak (no-mic testing path).

### 4.2 Backend — Node/Express server (`src/backend/`)

- `POST /api/turn` — kid's transcript + session state → one Claude call playing both roles → strict JSON `{enemy_line, enemy_action, coach_line, damage, score_reason, phase}`.
- `GET /api/tts` — proxies VOICEVOX engine (`localhost:50021`); speaker ID per character. Fallback to browser `speechSynthesis` if VOICEVOX is down — game never goes silent.
- **Progression service** — reads/writes `data/items_progression.csv` + new `data/characters.csv` using backup-before-write (per backend README pattern); emits unlock events the tutor announces.
- **Model:** Haiku 4.5 (`claude-haiku-4-5`) for battle turns; config flag to switch to Sonnet 5 if teaching quality needs it. See §4.5 for the cost analysis.
- **Prompt caching:** the system prompt (persona + safety + Deep Question Engine) plus the lesson unit content form a stable prefix with a `cache_control` breakpoint; conversation history is appended after it with a trailing breakpoint per turn. Note: Haiku 4.5's minimum cacheable prefix is **4096 tokens** — the combined system + lesson prefix is padded/kept above that so caching actually engages (shorter prefixes silently don't cache).

### 4.2.1 Conversation history & personalization

The API is stateless, so the backend owns memory:

- **Per-child profile** — `data/children/<name>/profile.json`: name, age, subjects touched, stats snapshot, interests the tutor has noticed, and a rolling "recent lessons" list (last ~10 units with one-line summaries).
- **Session transcripts** — `data/children/<name>/sessions/<date>.jsonl`: every turn (kid utterance, enemy line, coach line, damage, deep questions asked and the kid's answers). Also serves as the parent-review record.
- **Personalization at prompt time** — each session's system prompt is assembled with the child's profile + recent-lesson summaries, which is what enables synthesis questions like "how does this connect with yesterday's money lesson?" and continuity ("last time you said you like soccer…").
- **End-of-session summarizer** — one extra Claude call at session end compresses the transcript into the profile's recent-lessons entry (~100 tokens), keeping the personalization context small and cache-friendly.

### 4.3 Content — `content/lessons/<subject>/unit-NN.json`

```json
{ "title": "ねだんの交渉", "teach": ["beat 1…", "beat 2…"],
  "check_questions": ["…"],
  "enemy": { "name": "ケチな商人ゴルド", "persona": "…", "voice": 8,
             "sprite": "merchant", "hp": 100, "win_criteria": "…" },
  "reward": { "stat": "charisma", "xp": 50 }, "lang": "ja" }
```

Lesson JSONs are plain files; new units are authored without code changes. Each unit declares its reward stat, so all 12 subjects feed the existing RPG dashboard. The stat set extends the existing one (`power`, `toughness`, `logic` from `items_progression.csv`) with talk-subject stats such as `charisma`; the new `data/characters.csv` is the source of truth for which stats exist, and item rows may reference any of them.

### 4.5 Local vs API balance, and cost projection

**Principle: local where free-and-fast-enough, API only for the brain.** Researched split:

| Stage | Choice | Cost | Why |
|---|---|---|---|
| Speech-to-text | Chrome Web Speech API (browser) | Free | Streaming interim results = instant subtitles; good Japanese. Upgrade path: local faster-whisper on the RTX 5070 (also free, better for mumbly kid speech, but adds ~0.5–1 s latency and build complexity) — phase 2, behind the same transcript interface. |
| Brain | Claude API (Haiku 4.5) | Only real cost | No local model matches Claude for kid-safe Japanese Socratic teaching; local LLM on the 5070 (e.g. 8B class) is the free fallback but noticeably weaker — not worth it at the costs below. |
| Text-to-speech | VOICEVOX (local engine) | Free | Anime character voices kids love; runs fine on CPU/GPU. |
| Rendering/audio | Browser (Three.js, WebAudio) | Free | |

**Cost projection — the high-engagement household (3 kids × 1 hour/day, 30 days = 90 hours/month):**

Assumptions per conversational turn (with prompt caching working): ~5k tokens cached prefix read, ~500 new input tokens, ~500 cache-write tokens, ~250 output tokens; ~100 turns/hour of active play; plus one summarizer call per session (negligible).

| Model | Pricing (in/out per MTok) | ≈ per turn | ≈ per hour | ≈ 90 hrs/month |
|---|---|---|---|---|
| **Haiku 4.5 (default)** | $1 / $5 (cache read $0.10) | $0.003 | $0.30 | **~$25–30** |
| Sonnet 5 (intro, through 2026-08) | $2 / $10 | $0.006 | $0.55 | ~$50 |
| Sonnet 5 (standard) | $3 / $15 | $0.008 | $0.80 | ~$70 |

So even at maximum engagement the default configuration lands around **$1/day for the whole household** — manageable. Cost controls built in: prompt caching (the biggest lever — without it, costs are roughly 4–5× higher), history trimming (only the last ~10 exchanges ride in the prompt; older context lives in the compressed profile), a per-day token budget per child in config (tutor gracefully winds down the session when reached), and a monthly-spend log the parent can check. If costs ever matter more than quality, the local-LLM fallback flips on per config.

## 5. Error handling

- Mic permission denied → friendly setup screen.
- No speech heard for 10 s → tutor gently re-prompts.
- Claude API error → tutor says 「ちょっと考え中…」, one retry.
- Malformed JSON from Claude → re-ask with schema.
- VOICEVOX down → browser speechSynthesis fallback.
- CSV writes always create a backup first; restore on failure.

## 6. Testing

- Unit tests: turn-JSON parser, damage/XP math, CSV progression writes.
- Type-instead-of-talk debug mode doubles as the integration test path.
- One scripted end-to-end battle against a mocked Claude.

## 7. Build order

**v1:** core loop with one subject — **negotiation, 3 units** — end-to-end: arena, voice loop, battle, CSV rewards, Deep Question Engine in the tutor prompt, conversation history + profile persistence, and the audio manager (BGM/SFX slots wired, real assets dropped in once the asset-box repo link arrives). Existing bull WebMs as placeholder enemies.
**After v1:** remaining 11 subjects are content authoring (lesson JSONs) + new enemy sprites via the existing transcode pipeline; optional phase-2 upgrade to GPU Whisper STT (drop-in behind the same transcript interface — no redesign).

## 8. Out of scope (v1)

- Explorable 3D world / multiple arenas.
- GPU Whisper/silero-vad pipeline (phase 2 option).
- Parent analytics dashboard (session transcripts are saved under `data/children/<name>/sessions/` for later use).
- Multiplayer / multiple simultaneous kids.
