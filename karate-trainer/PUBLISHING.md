# 空手稽古 (Karate Trainer) — iOS App Store Publishing Guide

The product is a **web app** (`karate-trainer/`, Vite + TypeScript) wrapped for
iOS with **Capacitor**. It is already live on the web at
https://karate-trainer.pages.dev. This guide covers shipping the iOS app to the
App Store, which **requires a Mac** (Xcode is macOS-only).

The native `ios/` Xcode project is generated with
`npx cap add ios --packagemanager SPM`. It uses **Swift Package Manager**, not
CocoaPods, so no Ruby/Homebrew toolchain is involved — SPM ships inside Xcode.

Video recording on iOS is **native**: `ios/App/App/KarateRecorder/` captures via
AVFoundation and burns the overlay text with Core Animation. The web build's
getUserMedia + MediaRecorder + ffmpeg.wasm path is not used on device. See
`karate-trainer/src/native-recorder.ts`.

---

## App identity (already configured in `capacitor.config.ts`)

| Field | Value |
|---|---|
| App name | 空手稽古 |
| Bundle ID (`appId`) | `com.ushimaru.karatetrainer` |
| Web build dir (`webDir`) | `karate-trainer/dist` (config lives at the repo root) |
| iOS scheme | `https` (required: getUserMedia / MediaRecorder / IndexedDB need a secure context) |

---

## Prerequisites (one-time, on the Mac)

1. **Xcode** — install from the Mac App Store, then run once:
   ```bash
   sudo xcodebuild -runFirstLaunch
   ```
2. **Node.js 22 or newer** — https://nodejs.org
   The Capacitor 8 CLI refuses to run on Node 20, despite what older notes said.
3. ~~CocoaPods~~ — not required. The project uses Swift Package Manager.
4. **Apple Developer Program** membership ($99/yr) — https://developer.apple.com/programs/
   Needed for code signing and App Store submission.
5. An **App Store Connect** app record (create at https://appstoreconnect.apple.com
   → Apps → +). Use bundle ID `com.ushimaru.karatetrainer`.

---

## Build steps (on the Mac)

```bash
# 1. Clone + install
git clone https://github.com/uisomo/kids_education.git
cd kids_education
npm install

# 2. Build the web app (outputs karate-trainer/dist)
npm run build:karate

# 3. FIRST TIME ONLY — generate the native iOS project.
#    Run from the REPO ROOT: that is where capacitor.config.ts and package.json
#    both live, and the Capacitor CLI needs them together.
npx cap add ios --packagemanager SPM   # creates ios/ (the Xcode project)

# 4. Copy the web build into the native project
npx cap sync ios

# 5. Open in Xcode
npx cap open ios
```

> After the first time, the rebuild loop is just:
> `npm run cap:sync` (from repo root) then `npx cap open ios`, or the one-shot
> `npm run ios`.

---

## ⚠️ REQUIRED before the build will pass review

### 0. Add the native recorder to the Xcode target

`npx cap add ios` regenerates `ios/` from Capacitor's template, which does not
know about our own Swift files. After generating the project, in Xcode drag
**`ios/App/App/KarateRecorder/`** into the **App** group in the navigator and
tick the **App** target. Without this the folder sits on disk, never compiles,
and `registerPlugin("KarateRecorder")` fails at runtime.

Redo this any time you delete and regenerate `ios/`.

### 1. Camera + Microphone usage strings (Info.plist)

The app records practice video, so iOS **crashes the app** the instant it
requests the camera if these strings are missing, and **App Store review
rejects** builds without them.

Already applied to `ios/App/App/Info.plist`:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSPhotoLibraryAddUsageDescription` — needed because the share sheet offers
  "Save Video" into Photos.

The Japanese source strings live in `ios-info-plist-additions.plist`. Re-apply
them if you regenerate `ios/`.

### 2. App icons

A full icon set is required. In Xcode, open
`ios/App/App/Assets.xcassets` → `AppIcon` and drop in a 1024×1024 marketing icon
(Xcode 14+ generates the rest from a single 1024px image). Prepare a square
1024×1024 PNG with **no transparency and no rounded corners** (Apple rounds it).

### 3. Signing

In Xcode: select the **App** target → **Signing & Capabilities** → check
"Automatically manage signing" and pick your **Team**. Xcode provisions the app.

---

## Submitting to the App Store

1. In Xcode, set the **destination** to "Any iOS Device (arm64)" (not a simulator).
2. Bump **Version** (e.g. 1.0.0) and **Build** number under the target's General tab.
3. **Product → Archive**. When the Organizer opens, choose **Distribute App →
   App Store Connect → Upload**.
4. In **App Store Connect** (https://appstoreconnect.apple.com): fill in the
   listing — screenshots (required sizes: 6.7" and 6.5" iPhone at minimum),
   description, keywords, category (Education / Kids), privacy details, age
   rating, and a **Privacy Policy URL** (kids apps require one).
5. Because it targets children, review Apple's **Kids Category** guidelines
   (no third-party ads/analytics without consent, etc.). This app stores data
   locally (localStorage / IndexedDB) and does not send it anywhere, which
   simplifies the privacy questionnaire.
6. Submit for review.

---

## Notes

- **BGM audio**: the runtime references the compressed **`.mp3`** master
  (`karate-trainer/public/characters/君ならできる.mp3`, ~5MB). The 40MB `.wav`
  master is gitignored and not shipped. No 25MB-per-file limit applies to the
  App Store (that limit was Cloudflare Pages), but keep shipping the MP3.
- **Web deploy** (unrelated to iOS) stays manual via Wrangler:
  `npx wrangler pages deploy karate-trainer/dist --project-name=karate-trainer --branch=main --commit-dirty=true`
- The `ios/` folder, once generated, does not need to be committed — but you MAY
  commit it if you want the Info.plist edits and icons version-controlled. If you
  do, remove `ios/` from any ignore rules and commit it deliberately.
