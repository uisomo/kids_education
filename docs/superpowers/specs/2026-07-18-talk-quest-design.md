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
4. **Victory & rewards** — defeat is always comic (enemy runs away crying; never scary). Tutor debriefs (~30 s) what the kid did well, then announces XP/stat gains; progression written to CSV; item-unlock celebrations when thresholds cross. Losing = enemy giggles, tutor offers a retry with a hint.

**Realtime feel:** streaming speech recognition shows live subtitles as the kid talks; Claude responses stream so the enemy/tutor starts speaking within ~1–2 s.

**Safety:** kid-safe system prompt — age-appropriate language, nothing scary or inappropriate, always encouraging.

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
- **Model:** Haiku 4.5 for battle turns (~$0.05–0.15/session); config flag to switch to Sonnet if teaching quality needs it.

### 4.3 Content — `content/lessons/<subject>/unit-NN.json`

```json
{ "title": "ねだんの交渉", "teach": ["beat 1…", "beat 2…"],
  "check_questions": ["…"],
  "enemy": { "name": "ケチな商人ゴルド", "persona": "…", "voice": 8,
             "sprite": "merchant", "hp": 100, "win_criteria": "…" },
  "reward": { "stat": "charisma", "xp": 50 }, "lang": "ja" }
```

Lesson JSONs are plain files; new units are authored without code changes. Each unit declares its reward stat, so all 12 subjects feed the existing RPG dashboard. The stat set extends the existing one (`power`, `toughness`, `logic` from `items_progression.csv`) with talk-subject stats such as `charisma`; the new `data/characters.csv` is the source of truth for which stats exist, and item rows may reference any of them.

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

**v1:** core loop with one subject — **negotiation, 3 units** — end-to-end: arena, voice loop, battle, CSV rewards, using existing bull WebMs as placeholder enemies.
**After v1:** remaining 11 subjects are content authoring (lesson JSONs) + new enemy sprites via the existing transcode pipeline; optional phase-2 upgrade to GPU Whisper STT (drop-in behind the same transcript interface — no redesign).

## 8. Out of scope (v1)

- Explorable 3D world / multiple arenas.
- GPU Whisper/silero-vad pipeline (phase 2 option).
- Parent analytics dashboard (session logs are saved to `data/sessions/` for later use).
- Multiplayer / multiple simultaneous kids.
