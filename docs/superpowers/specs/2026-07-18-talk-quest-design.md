# Talk Quest (トーククエスト) — Design Spec

**Date:** 2026-07-18
**Status:** Approved by user (concept + architecture sections approved in brainstorming session)

## 1. What this is

A live talking tutor for Japanese elementary-school kids (ages 6–12), built as a browser 3D game where **talking is the weapon**. The kid speaks into the mic; an AI tutor teaches short lessons out loud and coaches in realtime; enemy characters in a 3D arena are conversation opponents the kid defeats by speaking well. Wins award XP/stats into the existing RPG character dashboard (CSV progression, item unlocks).

**Subjects (12):** social skills, english, psychology, persuasion, life hacks, philosophy, morals & ethics, negotiation, friendship, teamwork, money, stocks.

**Language:** Japanese primary; English used during english-subject lessons. Speech recognition toggles `ja-JP` / `en-US` per lesson phase.

## 2. Cast

- **The Tutor** — friendly mentor character with its own VOICEVOX anime voice. Teaches, coaches from the sidelines during battles, praises, corrects, announces rewards out loud.
- **Enemy characters** — animated transparent-WebM billboard sprites in the 3D arena, reusing the credit-palace character pipeline (`/mnt/c/Projects/book/credit-palace/assets/character/web/`, transcode via `transcode-web.sh`). Existing bull WebMs (10 actions: idle/angry/cry/laugh/shock/excitement/dancing/fighting/flying/sleep in 6 colors) serve as v1 placeholder enemies. Each enemy has a persona and its own VOICEVOX speaker ID (e.g., stingy merchant for negotiation, sulking friend for friendship, trickster for philosophy, scam-fox for money safety).

## 3. Session flow (~10–15 min)

1. **Subject select** — 12 icons → unit select.
2. **Teach phase (~3 min)** — tutor explains one small concept aloud with examples, asks check questions. Kid can interrupt with free talk at any time; tutor answers, then steers back to the lesson.
3. **Battle phase** — enemy appears with an HP bar. Each spoken answer by the kid is scored by Claude (0–100) → damage. Enemy replies in character; tutor gives coaching tips when the kid is stuck. 3–6 exchanges.
4. **Victory & debrief** — defeat is always comic (enemy runs away crying; never scary). Tutor debriefs (~30 s) what the kid did well; progression written to CSV; item-unlock celebrations when thresholds cross. Losing = enemy giggles, tutor offers a retry with a hint. Rewards themselves are NOT granted for winning or for correct answers — see §3.5: they accumulate continuously from voiced engagement throughout the whole session.

**Realtime feel:** streaming speech recognition shows live subtitles as the kid talks; Claude responses stream so the enemy/tutor starts speaking within ~1–2 s. The pipeline is deliberately STT → text LLM → TTS (no live video/avatar generation) — this keeps latency low and cost near zero outside the LLM calls.

**Safety:** kid-safe system prompt — age-appropriate language, nothing scary or inappropriate, always encouraging.

## 3.5 Engagement-based reward economy

**Design decision (user, 2026-07-18): rewards accrue from engagement, not correctness.** Correct answers are not the currency — voiced effort is.

- **Voice is the gate.** XP/coins accumulate only while the kid is actually vocalizing — talking to the tutor, answering the enemy, thinking out loud, even a wrong answer or a "うーん、えっとね…". **No sound = no accumulation.** Silence (or button-mashing without speaking) earns nothing.
- **Accumulation is continuous.** A ticker accrues reward while voice activity is detected during teach, battle, and free-talk phases alike. Trying to think about a question earns just as the answer itself does. Not answering a question forfeits nothing already earned — the pile only grows.
- **Answers are counted, not paid.** A separate visible tally tracks "answers given" (and the battle still uses answer quality for damage/drama — the enemy reacting is part of the fun), but the reward economy is decoupled from being right. Losing a battle while talking the whole time earns more than winning one silently.
- **Anti-gaming, gently.** The accumulation uses the speech-recognition activity signal (real speech, not table-banging); if a kid discovers they can chant nonsense, the tutor playfully redirects rather than punishing — the design goal is "talking and thinking here always pays", not surveillance.
- **Implementation:** the frontend's speech recognizer already produces an active/inactive signal; the reward ticker sums voiced seconds per session and the backend converts to XP/coins on the existing CSV progression. Two displayed meters: engagement earnings (grows live, satisfying counter animation) and answer count.

**Motivation-science layer (research-informed):** the user flagged that extrinsic rewards can *undermine* kids' intrinsic motivation (overjustification effect). A deep-research pass on self-determination theory, process-vs-outcome praise, and gamification for children is in progress; its design consequences (how the tutor frames rewards and praise, what the meters emphasize, what we deliberately avoid) will be folded into this section before implementation. The overarching intent: kids who play because it's fun and because they want to grow — enjoying the journey, not chasing the numbers.

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

- **3D stage:** one small fixed arena scene (the-chair style: Kenney kit props, warm colors). Camera frames the enemy; tutor stands at the side. Enemy = WebM billboard with action switching (idle → shock on hit → cry on defeat).
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
