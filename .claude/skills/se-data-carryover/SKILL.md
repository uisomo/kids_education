---
name: se-data-carryover
description: Install a karate app build (本番 or test) on the iPhone SE while keeping the SE's existing data (members, menus, belts, levels, streak, 工夫, plan). Use EVERY time a build is installed or updated on the iPhone SE, including the first install of com.alan.karate or com.alan.karate.test.
---

# iPhone SE にアップデートを入れるときは、SE のデータを必ず引き継ぐ

The user's rule: an update on the iPhone SE must keep the SE's data. Follow
these steps in order; do not skip the backup even for a same-bundle-id update.

**2026-09-27: a real child uses this app on the SE every day.** The user
asked outright — back up the SE's data every single time something is
installed there, no exceptions, because this is not test data anymore. Step 3
(pull a dated backup to the Mac, BEFORE installing) and the verification pull
in step 6 (AFTER installing) are both mandatory on every single SE install
from now on, even a trivial rebuild, even when the bundle id is unchanged and
the data "should" survive automatically. Do this without being asked again.

## Facts this relies on

- iPhone SE (3rd gen): devicectl id `429A9E77-68EB-5406-93BA-02B4B5B9837E`,
  xcodebuild destination id `00008110-001139910E20A01E`.
- All app data lives in the web view's localStorage (keys `karate.*` and
  `m:<memberId>:karate.*`). The native app mirrors it to
  `Library/karate-backup.json` in the app's data container
  (`karate-trainer/src/storage-backup.ts`), flushed on launch and whenever the
  app goes to the background.
- On launch, `restoreIfEmpty` restores that file **only when localStorage has
  none of the app's keys**. So copying the file into a freshly installed,
  never-launched app makes it start with the SE's data.
- Karate bundle ids that may be on the SE:
  `com.ushimaru.karatetrainer` (old id, the SE's data as of 2026-09-17),
  `com.alan.karate` (本番), `com.alan.karate.test` (test build).
- Updating an app **with the same bundle id** keeps its data automatically.
  Installing under a **different** bundle id starts empty — that is the case
  that needs the copy below.
- Not in the backup: custom voice clips in IndexedDB (voice-store) and recorded
  videos. Tell the user if they relied on those.
- devicectl needs the sandbox off (`dangerouslyDisableSandbox: true`).
- **2026-09-27 incident**: the SE's karate.test app appeared to have lost all
  records (all members, menus, levels gone) with no reinstall and no device
  reboot in between (confirmed via the app container's unchanged creation
  date and device uptime continuity — see [[karate-se-data-loss-2026-09-27]]
  in memory for the full investigation). The likely cause is an in-place
  WebKit storage hiccup (an iOS memory-pressure eviction or a Storage-process
  crash) that emptied `localStorage` while the app stayed backgrounded rather
  than being killed — `restoreIfEmpty` only ran once at the original cold
  launch, so simply reopening the app from the app switcher never re-checked
  it. **Fixed in `main.ts`**: the `visibilitychange` handler now also re-reads
  the backup file and calls `restoreIfEmpty` whenever the app comes back to
  the foreground, reloading the page if it restored something — so this class
  of failure should now self-heal within a second of reopening the app,
  without needing a full force-quit or a rebuild from this Mac. The
  `Library/karate-backup.json` file itself was never affected — that is what
  made the manual recovery possible.

## Steps

1. **Find the source app.** List karate apps on the SE:
   `xcrun devicectl device info apps --device 429A9E77-68EB-5406-93BA-02B4B5B9837E | grep -i "karate"`
   The source is the app whose data the user uses on the SE (ask if more than
   one karate app is installed and it is unclear).

2. **Make the backup fresh.** The file is written on launch/background. Ask the
   user to open the source app on the SE and then go to the home screen (or
   launch it with `xcrun devicectl device process launch --device <id> <bundle id>`
   and wait a few seconds) so the file reflects the latest practice.

3. **Pull the backup to the Mac** and keep a dated copy:
   ```
   mkdir -p ~/Documents/KarateBackups/iPhoneSE
   xcrun devicectl device copy from --device 429A9E77-68EB-5406-93BA-02B4B5B9837E \
     --domain-type appDataContainer --domain-identifier <source bundle id> \
     --source Library/karate-backup.json \
     --destination ~/Documents/KarateBackups/iPhoneSE/karate-backup-$(date +%Y%m%d-%H%M).json
   ```
   Sanity-check it with python3: valid JSON, has `karate.members`, list the
   member names and `karate.householdPlan`. If the pull fails or the file is
   empty, STOP and tell the user — never install over data without a backup.

4. **Build and install** the new build to the SE. 本番:
   `npm run cap:sync` then `xcodebuild … -configuration Debug` (or Release).
   test アプリ: `npm run cap:sync:test` then
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Test -destination 'id=00008110-001139910E20A01E' -allowProvisioningUpdates build`,
   install `…/Build/Products/Test-iphoneos/App.app` with
   `xcrun devicectl device install app`. The 「Check test build」 phase fails
   the build if the web bundle and the configuration don't match. After a test
   build, run `npm run cap:sync` again so App/public is back to the normal app. Do NOT launch it yet if its bundle id
   differs from the source.

5. **Carry the data over (only when the bundle id differs from the source).**
   Push the backup into the target app before its first launch:
   ```
   xcrun devicectl device copy to --device 429A9E77-68EB-5406-93BA-02B4B5B9837E \
     --domain-type appDataContainer --domain-identifier <target bundle id> \
     --source <backup json> --destination Library/karate-backup.json
   ```
   If the target app was already launched before and has its own data,
   `restoreIfEmpty` will ignore the file. Ask the user before wiping it
   (deleting and reinstalling the target app, then copying again).

6. **Launch and verify.** Launch the target app, wait ~5 s, pull its
   `Library/karate-backup.json` back (step 3 command with the target id) and
   compare the key count and member names with the source backup. Tell the
   user what came over (names, plan, streak) and ask them to glance at the
   menu/belt screen on the SE.

7. **Leave the old app alone.** Do not delete the source app; the user decides
   when to remove it.

Notes for the test build (`com.alan.karate.test`): its plan is chosen in the
app, so a carried-over `karate.householdPlan` is just a starting value.
