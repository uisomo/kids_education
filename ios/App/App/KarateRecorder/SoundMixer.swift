@preconcurrency import AVFoundation

/// The export's audio: the child's voice plus the music and character voices the
/// phone played, each placed at the moment it played.
///
/// Free of UIKit so it also builds for macOS, where it can run against files
/// copied off the phone to debug a mix without a device.
enum SoundMixer {
    struct VoiceTrack {
        let url: URL
        /// How much earlier than the first video frame the voice started
        /// (negative when it started later).
        let leadSeconds: Double
    }

    enum Sound {
        /// Music switched on or off; `restart` means playback began from the top.
        case music(ms: Double, playing: Bool, restart: Bool, src: String?)
        /// One character cheer voice, played once from its start.
        case clip(ms: Double, src: String)
    }

    /// A failed mix names its step, so one log line is enough to find the cause.
    struct StepError: LocalizedError {
        let step: String
        let underlying: Error
        var errorDescription: String? {
            let ns = underlying as NSError
            let inner = (ns.userInfo[NSUnderlyingErrorKey] as? NSError).map { " <- \($0.domain) \($0.code)" } ?? ""
            return "\(step) failed: \(ns.domain) \(ns.code) \(ns.localizedDescription)\(inner)"
        }
    }

    /// Levels relative to the voice (1.0). Music stays well under the child;
    /// character voices are clear without drowning it.
    static let musicVolume: Float = 0.22
    static let clipVolume: Float = 0.85

    /// Maps a web path such as "/characters/cheer/alan-1.m4a" (possibly
    /// percent-encoded) to a file. The app reads its bundled web assets; the
    /// macOS harness points this at the repo's public folder instead.
    nonisolated(unsafe) static var resolve: (String) -> URL? = { path in
        let decoded = path.removingPercentEncoding ?? path
        let relative = decoded.hasPrefix("/") ? String(decoded.dropFirst()) : decoded
        let url = Bundle.main.bundleURL.appendingPathComponent("public").appendingPathComponent(relative)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func step<T>(_ name: String, _ body: () async throws -> T) async throws -> T {
        do { return try await body() } catch { throw StepError(step: name, underlying: error) }
    }

    static func composition(
        source: AVAsset, sounds: [Sound], voice: VoiceTrack?
    ) async throws -> (composition: AVMutableComposition, audioMix: AVMutableAudioMix) {
        let composition = AVMutableComposition()
        let duration = try await step("load video duration") { try await source.load(.duration) }
        let whole = CMTimeRange(start: .zero, duration: duration)
        let end = duration.seconds
        func at(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }

        guard let sourceVideo = try await step("load video track", { try await source.loadTracks(withMediaType: .video).first }),
              let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw StepError(step: "video track", underlying: CocoaError(.fileReadCorruptFile)) }
        try await step("insert video") { try video.insertTimeRange(whole, of: sourceVideo, at: .zero) }
        video.preferredTransform = try await step("load video transform") { try await sourceVideo.load(.preferredTransform) }

        if let voice {
            // Keep each asset in a local while its track is used. An AVAssetTrack
            // does not retain its asset; inserting a track whose temporary asset
            // was already released fails with -11800 / -12780, which failed the
            // whole mix and left the exported video silent.
            let voiceAsset = AVURLAsset(url: voice.url)
            let voiceAudio = try await step("load voice file") { try await voiceAsset.loadTracks(withMediaType: .audio).first }
            if let voiceAudio,
               let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                // Trim what was recorded before the first frame, or place the
                // voice that much later if it started after the video.
                let voiceLength = try await step("load voice length") { try await voiceAudio.load(.timeRange).duration.seconds }
                let trim = max(0, voice.leadSeconds)
                let placeAt = max(0, -voice.leadSeconds)
                let length = min(voiceLength - trim, end - placeAt)
                if length > 0 {
                    // A composition track can't take a segment past its current end,
                    // so a late-starting voice needs the gap filled first — the music
                    // and clip tracks already did this; the voice track didn't, and
                    // every late voice failed the whole mix, leaving the video silent.
                    if placeAt > 0 {
                        track.insertEmptyTimeRange(CMTimeRange(start: .zero, duration: at(placeAt)))
                    }
                    try await step(String(format: "insert voice (trim %.2fs, at %.2fs, length %.2fs)", trim, placeAt, length)) {
                        try track.insertTimeRange(CMTimeRange(start: at(trim), duration: at(length)), of: voiceAudio, at: at(placeAt))
                    }
                }
            }
        } else if let sourceMic = try await step("load source audio", { try await source.loadTracks(withMediaType: .audio).first }),
                  let mic = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            try await step("insert source audio") { try mic.insertTimeRange(whole, of: sourceMic, at: .zero) }
        }

        var inputs: [AVMutableAudioMixInputParameters] = []

        // Music: rebuild the stretches it was audible. Its position only advances
        // while on, and it loops like the web <audio loop> element did.
        let musicEvents: [(t: Double, on: Bool, restart: Bool, src: String?)] = sounds.compactMap {
            if case let .music(ms, playing, restart, src) = $0 { return (ms / 1000, playing, restart, src) }
            return nil
        }.sorted { $0.t < $1.t }
        let musicAsset = musicEvents.compactMap({ $0.src }).first.flatMap(resolve).map { AVURLAsset(url: $0) }
        if let musicAsset,
           let musicSource = try await step("load music", { try await musicAsset.loadTracks(withMediaType: .audio).first }),
           let music = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            let loopLength = try await step("load music length") { try await musicSource.load(.timeRange).duration.seconds }
            var spans: [(start: Double, end: Double, from: Double)] = []
            var playing = false
            var since = 0.0
            var position = 0.0
            for event in musicEvents {
                let t = min(max(event.t, 0), end)
                if playing, t > since {
                    spans.append((since, t, position))
                    position += t - since
                }
                if event.restart { position = 0 }
                playing = event.on
                since = t
            }
            if playing, end > since { spans.append((since, end, position)) }

            var cursor = 0.0
            if loopLength > 0 {
                for span in spans {
                    if span.start > cursor {
                        music.insertEmptyTimeRange(CMTimeRange(start: at(cursor), end: at(span.start)))
                    }
                    var t = span.start
                    var from = span.from.truncatingRemainder(dividingBy: loopLength)
                    while span.end - t > 0.01 {
                        let chunk = min(span.end - t, loopLength - from)
                        try await step(String(format: "insert music %.2fs+%.2fs at %.2fs", from, chunk, t)) {
                            try music.insertTimeRange(CMTimeRange(start: at(from), duration: at(chunk)), of: musicSource, at: at(t))
                        }
                        t += chunk
                        from = 0
                    }
                    cursor = span.end
                }
            }
            let params = AVMutableAudioMixInputParameters(track: music)
            params.setVolume(musicVolume, at: .zero)
            inputs.append(params)
        }

        // Character voices at the moments they played. One that starts before
        // the previous ends goes onto another track instead of cutting it off.
        var clipTracks: [(track: AVMutableCompositionTrack, endsAt: Double)] = []
        for sound in sounds {
            guard case let .clip(ms, src) = sound else { continue }
            // A clip that cannot be resolved used to be skipped in silence: the
            // mix still reported success (the music track carried it), so a
            // missing 「ぷっ」 left no trace anywhere. Say so.
            guard let url = resolve(src) else {
                print("⚡️  [SoundMixer] clip SKIPPED — resolve() found no file for \(src)")
                continue
            }
            let start = ms / 1000
            let clipAsset = AVURLAsset(url: url)
            // These two used to be one guard with a silent `continue`: every
            // countdown 「ぷっ」 vanished here without a single log line while the
            // mix still reported success. Split so the cause is always named.
            guard start < end else {
                print(String(format: "⚡️  [SoundMixer] clip SKIPPED %@ — starts at %.2fs, past the %.2fs of video", src, start, end))
                continue
            }
            guard let clipAudio = try await step("load clip \(src)", { try await clipAsset.loadTracks(withMediaType: .audio).first }) else {
                print("⚡️  [SoundMixer] clip SKIPPED \(src) — no audio track in \(url.path)")
                continue
            }
            let clipDuration = try await step("load clip length \(src)") { try await clipAudio.load(.timeRange).duration.seconds }
            let length = min(clipDuration, end - start)

            var slot = clipTracks.firstIndex { $0.endsAt <= start }
            if slot == nil,
               let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                clipTracks.append((track, 0))
                slot = clipTracks.count - 1
                let params = AVMutableAudioMixInputParameters(track: track)
                params.setVolume(clipVolume, at: .zero)
                inputs.append(params)
            }
            guard let i = slot else { continue }
            if start > clipTracks[i].endsAt {
                clipTracks[i].track.insertEmptyTimeRange(CMTimeRange(start: at(clipTracks[i].endsAt), end: at(start)))
            }
            let target = clipTracks[i].track
            try await step(String(format: "insert clip %@ at %.2fs", src, start)) {
                try target.insertTimeRange(CMTimeRange(start: .zero, duration: at(length)), of: clipAudio, at: at(start))
            }
            clipTracks[i].endsAt = start + length
            print(String(format: "⚡️  [SoundMixer] clip inserted %@ at %.2fs (%.2fs long)", src, start, length))
        }

        let mix = AVMutableAudioMix()
        mix.inputParameters = inputs
        return (composition, mix)
    }
}
