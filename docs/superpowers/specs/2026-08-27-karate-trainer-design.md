# Karate Trainer — Design Spec

**Date:** 2026-08-27
**Status:** Approved design, ready for implementation plan
**Location:** `karate-trainer/` (standalone, separate from Talk Quest)

## Purpose

A single-page browser app for iPhone Safari that runs a timed karate
training menu. While the user trains, it: shows the current drill and a
large countdown timer, plays the user's own recorded voice cues (drill
announce, encouragement like もっと早く / 一生懸命, and a final-seconds
countdown), and
records front-camera video of the user for later review.

Target: one person, their own phone, propped up a few steps away.

## Platform & Constraints

- **Device:** iPhone Safari, held/propped in **portrait**.
- **Camera:** front (selfie) camera, mirrored preview.
- **No backend, no build step, no dependencies.** Plain HTML/CSS/JS,
  served over `localhost`/HTTPS (camera + mic require a secure context).
- iOS Safari specifics the implementation must honor:
  - Camera + audio capture must be initiated by a **user tap**.
  - `MediaRecorder` on iOS produces **`.mp4`** (not `.webm`).
  - The `<video>` preview must set `playsinline` and `muted` to autoplay.
  - A **wake-lock** keeps the screen on during a session (Safari only;
    degrade silently if unavailable).

## Screens & Flow

Screens: **Setup → Training → Done → (repeat)**, plus a **Voice** screen
reachable from Setup for recording cues.

### 1. Setup (献立 — menu)
- Scrollable list of drill rows. Each row: drill name, seconds, and it
  can be a normal drill or a **rest** row.
- Inline editing: tap the name to rename, tap seconds to change.
- Add drill, delete drill, reorder (drag).
- Footer shows total drills + total time, and a sticky **稽古 開始 ▶**
  button in the bottom thumb zone.
- Menu **persists in `localStorage`**; a sensible default menu ships so
  the app is usable on first open.

### 2. Training (稽古中)
- Full-bleed front-camera video (mirrored preview).
- **REC** indicator + elapsed time (top-left); progress `n / N 種目`
  (top-right).
- Large drill name + **oversized countdown timer** high on screen (clear
  of the user's body when they stand back).
- Voice cues play (see below); an on-screen **cue toast** shows the
  current encouragement text.
- "Next → …" hint for the upcoming drill.
- Bottom thumb-zone controls: **pause / skip / stop**.
- Drills auto-advance; the whole session records continuously.

### 3. Done (稽古終了)
- Video **playback** of the recorded session.
- Session summary: total time, drill count, cue count.
- **保存 (.mp4)** download button + **もう一度** (restart) button.

## Voice Cues

The user records **their own voice** clips directly in the app. No files
to manage, no folder, no manifest. Clips are grouped by role:

- `announce` — drill start (e.g. 始め！)
- `countdown` — final seconds (3, 2, 1 or a beep)
- `encouragement` — もっと早く, 一生懸命, etc. (any number of clips)

### Voice screen (recording)
- Reachable from Setup ("声を録音" / Voice).
- Lists the roles and the clips recorded so far, grouped.
- To add a clip: pick a role (and for encouragement, type an optional
  label like "もっと早く"), tap **録音**, speak, tap **停止/保存**. Playback to
  check, re-record, or delete.
- Recording uses `getUserMedia({audio})` + `MediaRecorder` (same tap-to-
  start rule as the camera).

### Storage
- Clips are stored as audio blobs in **IndexedDB** (survives reloads,
  no localStorage size limit). Keyed by role + id.
- **Caveat (must be surfaced in the UI):** clips live only in *this
  phone's Safari* — not in the repo — and clearing Safari data removes
  them. To mitigate, the Voice screen offers **Export** (download all
  clips as a file) and **Import** (re-load them) for backup.

### Scheduling per drill
- Announce clip at drill start.
- Random encouragement clip roughly every 7–10s during the drill.
- Countdown in the final ~3s.
- Auto-advance to next drill at 0.

**Fallback (approved):** if a role has no recorded clips, use the
browser's built-in beep / Web Speech TTS so the loop is fully testable
before the user records anything. Recorded clips take over automatically
once they exist.

## Recording

- `getUserMedia({ video: front camera, audio: mic })` on a user tap.
- Preview is mirrored (natural self-view); the **recorded file is kept
  un-mirrored** so left/right reads correctly on playback.
- `MediaRecorder` records the camera+mic stream for the whole session
  (captures the user, **not** the coach audio — per the chosen option).
- On stop: show playback + offer `.mp4` download.

## Architecture

Small, focused units (plain modules / functions):

- **menu store** — load/save menu to `localStorage`, defaults, CRUD.
- **timer / scheduler** — drives per-drill countdown, fires events
  (`drill-start`, `tick`, `cue-window`, `final-countdown`, `drill-end`,
  `session-end`). Pure/observable so it can be unit-tested without DOM.
- **voice store** — records clips (getUserMedia + MediaRecorder),
  saves/loads/deletes blobs in IndexedDB by role, export/import.
- **cue player** — reads clips from the voice store, picks one per
  event, handles the beep/TTS fallback. Given an event, plays the right
  sound.
- **recorder** — wraps getUserMedia + MediaRecorder; exposes
  start/stop and yields the final blob.
- **UI / screens** — renders the three screens, wires taps to the units
  above; keeps DOM concerns out of timer/cue logic.

## Testing

- **Unit (Vitest, matching repo tooling):** the timer/scheduler event
  sequence and the menu store (persistence, totals) as pure functions —
  no camera/DOM needed.
- **Manual checklist (on an actual iPhone):** camera permission prompt,
  mirrored preview, timer counts down, cues play (recorded + fallback),
  auto-advance, REC indicator, wake-lock, stop → playback → `.mp4`
  download, menu persists across reloads, record a voice clip → it plays
  during a drill → survives reload, export/import round-trips.

## Out of Scope (YAGNI for v1)

- Mixing coach audio into the recording.
- Per-drill custom cue assignment.
- Cloud/AI TTS, accounts, sync, sharing.
- Landscape layout.
