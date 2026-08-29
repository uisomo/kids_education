# 空手稽古 (Karate Trainer) — iOS App Store Publishing Guide

The product is a **web app** (`karate-trainer/`, Vite + TypeScript) wrapped for
iOS with **Capacitor**. It is already live on the web at
https://karate-trainer.pages.dev. This guide covers shipping the iOS app to the
App Store, which **requires a Mac** (Xcode is macOS-only).

The native `ios/` Xcode project is **NOT committed** to this repo — it is
generated fresh on the Mac with `npx cap add ios` (the normal Capacitor flow).
So you do not transfer an `ios/` folder; you regenerate it.

---

## App identity (already configured in `capacitor.config.ts`)

| Field | Value |
|---|---|
| App name | 空手稽古 |
| Bundle ID (`appId`) | `com.ushimaru.karatetrainer` |
| Web build dir (`webDir`) | `dist` (relative to `karate-trainer/`) |
| iOS scheme | `https` (required: getUserMedia / MediaRecorder / IndexedDB need a secure context) |

---

## Prerequisites (one-time, on the Mac)

1. **Xcode** — install from the Mac App Store, then run once:
   ```bash
   sudo xcodebuild -runFirstLaunch
   ```
2. **Node.js 20.x** (the repo was built with v20.19.3) — https://nodejs.org
3. **CocoaPods**:
   ```bash
   brew install cocoapods    # or: sudo gem install cocoapods
   ```
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
#    Run from karate-trainer/, where capacitor.config.ts lives.
cd karate-trainer
npx cap add ios            # creates karate-trainer/ios/  (the Xcode project)

# 4. Copy the web build into the native project + install pods
npx cap sync ios

# 5. Open in Xcode
npx cap open ios
```

> After the first time, the rebuild loop is just:
> `npm run cap:sync` (from repo root) then `npx cap open ios`, or the one-shot
> `npm run ios`.

---

## ⚠️ REQUIRED before the build will pass review

### 1. Camera + Microphone usage strings (Info.plist)

The app calls `getUserMedia({ video, audio: true })` to record practice videos.
**iOS crashes the app** the instant it requests the camera if these strings are
missing, and **App Store review rejects** builds without them.

After `npx cap add ios`, open **`ios/App/App/Info.plist`** in Xcode (or a text
editor) and add the two keys from **`ios-info-plist-additions.plist`** (in this
folder) into the top-level `<dict>`:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`

(Kid-friendly Japanese reason strings are provided in that file.)

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
