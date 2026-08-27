# 空手稽古 (Karate Trainer)

A standalone, portrait-only browser app for running a solo karate practice
session on an iPhone: it films you (front camera, mirrored preview) through a
timed drill menu, plays cues (beeps/TTS, or your own recorded voice clips),
keeps the screen awake, and produces a downloadable `.mp4`/`.webm` recap at
the end.

This app lives entirely under `karate-trainer/` and is independent from the
rest of the repo (Talk Quest). It has no server component — everything runs
client-side in the browser.

## Running it

1. From the repo root, start the dev server:

   ```bash
   npm run dev:karate
   ```

   This runs Vite against `karate-trainer/vite.config.ts`, which binds with
   `host: true` on port `5273` so it's reachable from other devices on your
   LAN (not just `localhost`).

2. Find your Mac's LAN IP (e.g. via System Settings → Wi-Fi → Details, or
   `ipconfig getifaddr en0` in Terminal).

3. On your iPhone, connect to the **same Wi-Fi network**, open Safari, and
   go to:

   ```
   http://<your-mac-LAN-ip>:5273
   ```

4. Safari will prompt for camera and microphone permission — grant both.
   The app needs the camera to record your session and the microphone both
   for recording the session's audio track and for the optional in-app
   voice-clip recorder (Setup → 声を録音).

To build a static production bundle instead:

```bash
npm run build:karate
```

Output goes to `karate-trainer/dist/`.

## iOS autoplay caveat

On the training screen, the camera preview's `<video>` element calls
`.play()` only *after* `await startCamera()` resolves (see `src/app.ts`,
`beginTraining()`). Because that `await` sits between the user's tap (on
「稽古 開始」) and the `.play()` call, some iOS Safari versions may treat the
gesture as "expired" by the time playback is requested and decline to
autoplay the preview. If you see a black/frozen preview on-device even
though the permission prompt was granted, this is the known gesture-timing
caveat — it's worth explicitly testing on a real iPhone (not just desktop
Safari or the simulator) as part of the checklist below.

## Manual test checklist

Run through this on an actual iPhone (Safari), not just a desktop browser —
camera/mic permissions, autoplay, and safe-area insets only behave
realistically on-device.

- [ ] Camera permission prompt appears on starting a session; the preview is
      mirrored (like a mirror, not like a security camera).
- [ ] **Denying** camera permission returns you to the setup screen with a
      visible error message (`カメラを開始できませんでした。権限を確認してください`) —
      not a stuck or blank screen.
- [ ] Timer counts down per drill; the drill name and progress
      (`n / total 種目`) are correct at each step.
- [ ] Cues play:
  - [ ] With no voice clips recorded, cues fall back to beep/TTS.
  - [ ] After recording your own clips (see below), your clips play instead.
- [ ] Encouragement cues fire during the middle of a drill, but **not**
      during rest drills and **not** in the final 3 seconds of a drill.
- [ ] Auto-advance moves to the next drill without manual input; the
      REC elapsed counter (`REC mm:ss`) keeps increasing throughout.
- [ ] The screen stays awake for the whole session (no auto-lock/dimming).
- [ ] Tapping 終了 (or reaching the end of the menu) stops the session and
      shows the Done screen with a working video preview.
- [ ] `動画を保存` downloads a `.mp4` (or `.webm`, depending on codec
      support) file to the device.
- [ ] Recording a voice clip (Setup → 声を録音 → 🎙 録音):
  - [ ] The clip plays back during the *next* training session as a cue.
  - [ ] The clip survives a full page reload (stored in IndexedDB, not
        memory).
- [ ] Export (📥 エクスポート) downloads a backup JSON; after clearing
      Safari's site data, Import (file picker) restores the exported clips.
- [ ] Menu edits (drill name/seconds, add/remove rows) persist across a
      page reload.
