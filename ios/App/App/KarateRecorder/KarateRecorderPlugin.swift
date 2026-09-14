import Capacitor
import Foundation

/// Capacitor bridge for the native trainer recorder.
///
/// JS calls startPreview() once the training screen is up, startRecording()
/// when the countdown finishes, and stopRecording() with the overlay event log
/// at the end. Burn-in happens here via AVFoundation rather than ffmpeg.wasm,
/// so the returned file already has the text in it.
@objc(KarateRecorderPlugin)
public class KarateRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KarateRecorderPlugin"
    public let jsName = "KarateRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMusicPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playClip", returnType: CAPPluginReturnPromise),
    ]

    private let camera = CameraSession()
    private let audio = AudioController()
    private var rawURL: URL?

    // MARK: - Preview

    @objc func startPreview(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let webView = self.webView else {
                call.reject("web view unavailable")
                return
            }
            do {
                try await self.camera.startPreview(under: webView)
                // After the capture session is running, so any interruption
                // voice processing causes shows up in the log against it.
                self.audio.start()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        Task { @MainActor in
            self.audio.stop()
            self.camera.stopPreview()
            self.restoreWebViewBackground()
            call.resolve()
        }
    }

    /// The preview is only transparent while the camera is up; putting the
    /// background back avoids a black web view on every other screen.
    @MainActor
    private func restoreWebViewBackground() {
        guard let webView = self.webView else { return }
        // nil, not .white: the app's own background is dark indigo, and a white
        // web view would flash between the training and done screens.
        webView.isOpaque = true
        webView.backgroundColor = nil
        webView.scrollView.backgroundColor = nil
    }

    // MARK: - Recording

    @objc func startRecording(_ call: CAPPluginCall) {
        Task {
            do {
                // Voice first, so its file already covers the first video frame.
                self.audio.startVoiceCapture()
                self.rawURL = try await self.camera.startRecording()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - Playback

    @objc func playMusic(_ call: CAPPluginCall) {
        guard let src = call.getString("src"), let url = OverlayCompositor.bundledURL(forWebPath: src) else {
            call.reject("music file not found")
            return
        }
        do {
            try audio.playMusic(url: url, volume: Float(call.getDouble("volume") ?? 0.2))
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func setMusicPaused(_ call: CAPPluginCall) {
        audio.setMusicPaused(call.getBool("paused") ?? true)
        call.resolve()
    }

    @objc func stopMusic(_ call: CAPPluginCall) {
        audio.stopMusic()
        call.resolve()
    }

    @objc func playClip(_ call: CAPPluginCall) {
        guard let src = call.getString("src"), let url = OverlayCompositor.bundledURL(forWebPath: src) else {
            call.reject("clip audio not found")
            return
        }
        do {
            try audio.playClip(url: url, volume: Float(call.getDouble("volume") ?? 0.9))
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    /// Stops capture, burns the overlay, and returns the finished file.
    ///
    /// `events` is the same log the web build feeds to ffmpeg: an array of
    /// `{ t, patch }` where patch carries any of drill/seconds/cue/caption.
    @objc func stopRecording(_ call: CAPPluginCall) {
        let rawEvents = call.getArray("events", JSObject.self) ?? []
        let totalDurationMs = call.getDouble("totalDurationMs") ?? 0
        let menu: [OverlayCompositor.MenuItem] = (call.getArray("menu", JSObject.self) ?? []).compactMap { entry in
            guard let name = entry["name"] as? String else { return nil }
            return OverlayCompositor.MenuItem(
                name: name,
                seconds: (entry["seconds"] as? NSNumber)?.intValue ?? 0,
                isRest: (entry["kind"] as? String) == "rest"
            )
        }
        let sounds: [OverlayCompositor.Sound] = (call.getArray("sounds", JSObject.self) ?? []).compactMap { entry in
            guard let t = entry["t"] as? NSNumber, let kind = entry["kind"] as? String else { return nil }
            switch kind {
            case "bgm":
                return .music(ms: t.doubleValue, playing: entry["playing"] as? Bool ?? false,
                              restart: entry["restart"] as? Bool ?? false, src: entry["src"] as? String)
            case "clip":
                guard let src = entry["src"] as? String else { return nil }
                return .clip(ms: t.doubleValue, src: src)
            default:
                return nil
            }
        }

        let events: [OverlayCompositor.Event] = rawEvents.compactMap { entry in
            guard let t = entry["t"] as? NSNumber else { return nil }
            let patch = entry["patch"] as? JSObject ?? JSObject()
            return OverlayCompositor.Event(t: t.doubleValue, patch: patch)
        }

        Task {
            do {
                let raw = try await self.camera.stopRecording()
                self.rawURL = raw
                // After the camera, so the voice also covers the last frame.
                let voice = self.audio.stopVoiceCapture()
                let lead: Double = {
                    guard let v = voice?.startHostSeconds, let c = self.camera.recordingStartHostSeconds else { return 0 }
                    return c - v
                }()
                print(String(format: "⚡️  [KarateRecorder] voice starts %.0f ms before the first video frame", lead * 1000))

                let burned = FileManager.default.temporaryDirectory
                    .appendingPathComponent("karate-training-\(UUID().uuidString).mp4")

                // Burn-in failing must never cost the family their recording —
                // fall back to the raw capture, exactly as the web build falls
                // back when ffmpeg.wasm gives up.
                var finalURL = raw
                var burnError: String?
                do {
                    try await OverlayCompositor.burn(
                        sourceURL: raw,
                        outputURL: burned,
                        events: events,
                        totalDurationMs: totalDurationMs,
                        menu: menu,
                        // Voice processing keeps the music and character voices out
                        // of the voice track, so they are added back at fixed levels.
                        // Music only. The character voices stay out of the saved video:
                        // they're heard live during practice, but in the recording they
                        // talked over the child. (JS still logs when each one played.)
                        sounds: voice?.voiceProcessing == true ? sounds.filter { if case .music = $0 { return true } else { return false } } : [],
                        voice: voice.map { OverlayCompositor.VoiceTrack(url: $0.url, leadSeconds: lead) }
                    )
                    finalURL = burned
                } catch {
                    burnError = error.localizedDescription
                }

                if finalURL != raw { try? FileManager.default.removeItem(at: raw) }

                var result: JSObject = [
                    "uri": finalURL.absoluteString,
                    "burnedIn": finalURL != raw,
                    "echoCancelled": self.camera.echoCancelled,
                ]
                if let burnError { result["burnError"] = burnError }
                if let voice {
                    result["voiceUri"] = voice.url.absoluteString
                    result["voiceLeadMs"] = lead * 1000
                    result["voiceProcessing"] = voice.voiceProcessing
                    result["voicePeakDb"] = voice.peakDb
                }
                call.resolve(result)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
