@preconcurrency import AVFoundation

/// Plays the session's music and character voices, and records the child's
/// voice, through one AVAudioEngine.
///
/// - Through the web page, iOS let only one sound play at a time (a character's
///   voice paused the music) and ignored the page's volume.
/// - Apple's voice processing cancels echo for audio rendered through the same
///   engine, so the voice recorded here can stay clear of the speaker. Whether
///   it coexists with the camera's own capture session is logged, and the
///   export keeps using the capture microphone until that is confirmed.
final class AudioController {
    private let engine = AVAudioEngine()
    private let musicNode = AVAudioPlayerNode()
    private let clipNodes = [AVAudioPlayerNode(), AVAudioPlayerNode()]
    private var nextClipNode = 0
    /// Bumped on every play/stop so a stale completion callback (stop() fires
    /// one too) can't schedule another loop of the music.
    private var musicGeneration = 0
    /// Whether music is meant to be audible right now (played and not paused),
    /// so it can be resumed after iOS restarts the engine.
    private var musicShouldPlay = false
    private let queue = DispatchQueue(label: "karate.audio")
    private var configObserver: NSObjectProtocol?
    private var interruptionObserver: NSObjectProtocol?
    /// True between start() and stop(). A configuration change or interruption
    /// that was queued before stop() must not switch the microphone back on.
    private var active = false
    /// Input format the voice tap was installed with (queue-confined).
    private var tapFormat: AVAudioFormat?

    /// Called (on an arbitrary queue) when iOS interrupts the audio session —
    /// a phone call, Siri, an alarm — which stops the engine and the voice.
    var onInterruptionBegan: (() -> Void)?

    private let voiceLock = NSLock()
    private var voiceFile: AVAudioFile?
    private var voiceURL: URL?
    private var voiceBuffers = 0
    private var voicePeak: Float = 0
    private var voiceStartHostSeconds: Double?
    /// Frames written to the file so far (including inserted silence), in the
    /// file's own sample rate. Used to place each buffer at its host time.
    private var voiceFramesWritten: AVAudioFramePosition = 0
    private var voiceGapSeconds: Double = 0
    /// Converts buffers whose format changed mid-session (a Bluetooth headset
    /// switched the mic to 16 kHz) to the format the file was opened with.
    private var voiceConverter: AVAudioConverter?
    private var voiceWriteErrors = 0

    private(set) var voiceProcessing = false

    struct VoiceCapture {
        let url: URL
        let voiceProcessing: Bool
        let buffers: Int
        let peakDb: Double
        /// Host-clock time of the first recorded sample, for lining up with video.
        let startHostSeconds: Double?
    }

    /// Longest stretch of silence inserted for one gap; anything longer is a
    /// bogus timestamp, not a real pause.
    private static let maxGapSeconds: Double = 600

    private func log(_ message: String) {
        print("⚡️  [KarateRecorder] audio: \(message)")
    }

    // MARK: - Engine

    func start() {
        queue.sync {
            active = true
            if configObserver == nil {
                configObserver = NotificationCenter.default.addObserver(
                    forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
                ) { [weak self] _ in
                    self?.handleConfigurationChange()
                }
            }
            if interruptionObserver == nil {
                interruptionObserver = NotificationCenter.default.addObserver(
                    forName: AVAudioSession.interruptionNotification,
                    object: AVAudioSession.sharedInstance(), queue: nil
                ) { [weak self] note in
                    self?.handleInterruption(note)
                }
            }
            guard !engine.isRunning else { return }
            if !engine.attachedNodes.contains(musicNode) {
                engine.attach(musicNode)
                clipNodes.forEach { engine.attach($0) }
            }
            // Must be set while the engine is stopped.
            do {
                try engine.inputNode.setVoiceProcessingEnabled(true)
                voiceProcessing = engine.inputNode.isVoiceProcessingEnabled
            } catch {
                voiceProcessing = false
                log("voice processing unavailable: \(error.localizedDescription)")
            }
            // Players need a connection before the engine starts; each is
            // reconnected with a file's own format when it plays.
            let format = engine.mainMixerNode.outputFormat(forBus: 0)
            engine.connect(musicNode, to: engine.mainMixerNode, format: format)
            clipNodes.forEach { engine.connect($0, to: engine.mainMixerNode, format: format) }
            do {
                engine.prepare()
                try engine.start()
                log("engine started, voiceProcessing=\(voiceProcessing), input=\(engine.inputNode.outputFormat(forBus: 0))")
            } catch {
                log("engine failed to start: \(error.localizedDescription)")
            }
        }
    }

    func stop() {
        queue.sync {
            active = false
            musicGeneration += 1
            musicShouldPlay = false
            musicNode.stop()
            clipNodes.forEach { $0.stop() }
            engine.inputNode.removeTap(onBus: 0)
            tapFormat = nil
            engine.stop()
            if let configObserver { NotificationCenter.default.removeObserver(configObserver) }
            configObserver = nil
            if let interruptionObserver { NotificationCenter.default.removeObserver(interruptionObserver) }
            interruptionObserver = nil
            log("engine stopped")
        }
    }

    /// iOS stops the engine whenever the audio configuration changes, and
    /// something else in the app starting to play is enough — the web page's
    /// spoken 「よーい」 at the start of the intro. Only logging it left the voice
    /// track silent until the music restarted the engine at Go!!, ~3.6s later.
    private func handleConfigurationChange() {
        queue.async {
            guard self.active else {
                self.log("engine configuration changed after stop; ignored")
                return
            }
            // A route change (AirPods, a Bluetooth headset) can change the mic's
            // sample rate. The old tap keeps the old format, so put a fresh one on
            // before restarting; appendVoice converts to the file's format.
            if self.isCapturingVoice,
               self.engine.inputNode.outputFormat(forBus: 0) != self.tapFormat {
                self.installVoiceTap()
            }
            guard !self.engine.isRunning else {
                self.log("engine configuration changed; still running")
                return
            }
            self.restartEngine(because: "engine configuration changed")
        }
    }

    private func handleInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            // A stale "began" delivered because the app was suspended earlier
            // isn't a new interruption.
            if #available(iOS 16.0, *) {
                if let reason = note.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt,
                   AVAudioSession.InterruptionReason(rawValue: reason) == .appWasSuspended { return }
            }
            log("audio session interrupted")
            queue.async {
                guard self.active else { return }
                self.onInterruptionBegan?()
            }
        case .ended:
            queue.async {
                guard self.active else { return }
                try? AVAudioSession.sharedInstance().setActive(true)
                if self.isCapturingVoice { self.installVoiceTap() }
                guard !self.engine.isRunning else { return }
                self.restartEngine(because: "audio interruption ended")
            }
        @unknown default:
            break
        }
    }

    /// Call on `queue`.
    private func restartEngine(because why: String) {
        do {
            engine.prepare()
            try engine.start()
            if musicShouldPlay { musicNode.play() }
            log("\(why); restarted (music resumed=\(musicShouldPlay))")
        } catch {
            log("\(why); restart failed: \(error.localizedDescription)")
        }
    }

    /// Starts the engine if it isn't running. Call on `queue`.
    private func ensureEngineRunning() -> Bool {
        if engine.isRunning { return true }
        do {
            engine.prepare()
            try engine.start()
            return true
        } catch {
            log("engine failed to start: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Playback

    func playMusic(url: URL, volume: Float) throws {
        try queue.sync {
            let file = try AVAudioFile(forReading: url)
            musicGeneration += 1
            musicNode.stop()
            engine.connect(musicNode, to: engine.mainMixerNode, format: file.processingFormat)
            musicNode.volume = volume
            scheduleMusic(file, generation: musicGeneration)
            if !engine.isRunning { try engine.start() }
            musicNode.play()
            musicShouldPlay = true
            log("music playing at volume \(volume)")
        }
    }

    /// Loops like the web <audio loop> element: reschedule when a pass finishes.
    private func scheduleMusic(_ file: AVAudioFile, generation: Int) {
        musicNode.scheduleFile(file, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self else { return }
            self.queue.async {
                guard generation == self.musicGeneration else { return }
                self.scheduleMusic(file, generation: generation)
            }
        }
    }

    func setMusicPaused(_ paused: Bool) {
        queue.sync {
            musicShouldPlay = !paused
            if paused {
                musicNode.pause()
            } else if ensureEngineRunning() {
                // play() on a node whose engine isn't running raises an
                // Objective-C exception and crashes the app.
                musicNode.play()
            }
        }
    }

    func stopMusic() {
        queue.sync {
            musicGeneration += 1
            musicShouldPlay = false
            musicNode.stop()
        }
    }

    func playClip(url: URL, volume: Float) throws {
        try queue.sync {
            let file = try AVAudioFile(forReading: url)
            let node = clipNodes[nextClipNode]
            nextClipNode = (nextClipNode + 1) % clipNodes.count
            node.stop()
            engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
            node.volume = volume
            node.scheduleFile(file, at: nil)
            if !engine.isRunning { try engine.start() }
            node.play()
        }
    }

    // MARK: - Voice capture

    private var isCapturingVoice: Bool {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        return voiceFile != nil
    }

    /// (Re)installs the tap with the input's current format. `format: nil`
    /// always matches the hardware, so a changed route can't trip the
    /// format-mismatch assertion. Call on `queue`.
    private func installVoiceTap() {
        let input = engine.inputNode
        input.removeTap(onBus: 0)
        tapFormat = nil
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            log("no microphone input format; voice tap not installed")
            return
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: nil) { [weak self] buffer, when in
            self?.appendVoice(buffer, at: when)
        }
        tapFormat = format
    }

    func startVoiceCapture() {
        queue.sync {
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                log("no microphone input format; voice capture skipped")
                return
            }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("karate-voice-\(UUID().uuidString).caf")
            do {
                let file = try AVAudioFile(forWriting: url, settings: format.settings,
                                           commonFormat: format.commonFormat, interleaved: format.isInterleaved)
                voiceLock.lock()
                voiceFile = file
                voiceURL = url
                voiceBuffers = 0
                voicePeak = 0
                voiceStartHostSeconds = nil
                voiceFramesWritten = 0
                voiceGapSeconds = 0
                voiceConverter = nil
                voiceWriteErrors = 0
                voiceLock.unlock()
                installVoiceTap()
                if active { _ = ensureEngineRunning() }
                log("voice capture started: \(format)")
            } catch {
                log("voice capture failed: \(error.localizedDescription)")
            }
        }
    }

    private func appendVoice(_ buffer: AVAudioPCMBuffer, at when: AVAudioTime) {
        voiceLock.lock()
        defer { voiceLock.unlock() }
        guard let voiceFile else { return }
        let fileFormat = voiceFile.processingFormat
        let fileRate = fileFormat.sampleRate

        if when.isHostTimeValid {
            let hostSeconds = AVAudioTime.seconds(forHostTime: when.hostTime)
            if let start = voiceStartHostSeconds {
                // The engine stopping (a configuration change, an interruption)
                // leaves a hole. Writing the next buffer straight after the last
                // one would pull everything after it earlier than the video, so
                // fill the hole with silence first.
                let expected = start + Double(voiceFramesWritten) / fileRate
                let gap = hostSeconds - expected
                let bufferSeconds = Double(buffer.frameLength) / buffer.format.sampleRate
                if gap > bufferSeconds {
                    let fill = min(gap, Self.maxGapSeconds)
                    writeSilence(seconds: fill, to: voiceFile)
                    voiceGapSeconds += fill
                }
            } else {
                voiceStartHostSeconds = hostSeconds
            }
        }

        let output: AVAudioPCMBuffer
        if buffer.format == fileFormat {
            output = buffer
        } else if let converted = convert(buffer, to: fileFormat) {
            output = converted
        } else {
            return
        }
        do {
            try voiceFile.write(from: output)
            voiceFramesWritten += AVAudioFramePosition(output.frameLength)
        } catch {
            voiceWriteErrors += 1
            if voiceWriteErrors == 1 { log("voice write failed: \(error.localizedDescription)") }
        }
        voiceBuffers += 1
        if let channel = output.floatChannelData?[0] {
            for i in 0..<Int(output.frameLength) { voicePeak = max(voicePeak, abs(channel[i])) }
        }
    }

    /// Call with voiceLock held.
    private func writeSilence(seconds: Double, to file: AVAudioFile) {
        let format = file.processingFormat
        var remaining = AVAudioFrameCount(seconds * format.sampleRate)
        let chunk: AVAudioFrameCount = 16384
        guard remaining > 0, let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: min(chunk, remaining)) else { return }
        // A fresh buffer's memory is zeroed, i.e. silence for float and int PCM.
        while remaining > 0 {
            let n = min(chunk, remaining)
            silence.frameLength = n
            do {
                try file.write(from: silence)
            } catch {
                log("voice gap fill failed: \(error.localizedDescription)")
                return
            }
            voiceFramesWritten += AVAudioFramePosition(n)
            remaining -= n
        }
    }

    /// Call with voiceLock held.
    private func convert(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        if voiceConverter?.inputFormat != buffer.format {
            voiceConverter = AVAudioConverter(from: buffer.format, to: format)
            log("voice input format changed to \(buffer.format); converting")
        }
        guard let converter = voiceConverter else { return nil }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        var fed = false
        var error: NSError?
        let status = converter.convert(to: out, error: &error) { _, inputStatus in
            if fed {
                inputStatus.pointee = .noDataNow
                return nil
            }
            fed = true
            inputStatus.pointee = .haveData
            return buffer
        }
        if status == .error {
            if voiceWriteErrors == 0 { log("voice conversion failed: \(error?.localizedDescription ?? "unknown")") }
            voiceWriteErrors += 1
            return nil
        }
        return out
    }

    /// Stops recording the voice track and closes its file.
    func stopVoiceCapture() -> VoiceCapture? {
        return queue.sync { () -> VoiceCapture? in
            engine.inputNode.removeTap(onBus: 0)
            tapFormat = nil
            voiceLock.lock()
            defer { voiceLock.unlock() }
            guard let url = voiceURL else { return nil }
            let peakDb = voicePeak > 0 ? Double(20 * log10(voicePeak)) : -120
            let result = VoiceCapture(url: url, voiceProcessing: voiceProcessing, buffers: voiceBuffers,
                                      peakDb: peakDb, startHostSeconds: voiceStartHostSeconds)
            voiceFile = nil   // closes the file
            voiceURL = nil
            voiceConverter = nil
            log("voice capture stopped: \(result.buffers) buffers, peak \(String(format: "%.1f", peakDb)) dB, gaps filled \(String(format: "%.2f", voiceGapSeconds)) s, write errors \(voiceWriteErrors), voiceProcessing=\(result.voiceProcessing)")
            return result
        }
    }
}
