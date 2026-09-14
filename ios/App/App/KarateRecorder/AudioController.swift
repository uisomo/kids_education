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

    private let voiceLock = NSLock()
    private var voiceFile: AVAudioFile?
    private var voiceURL: URL?
    private var voiceBuffers = 0
    private var voicePeak: Float = 0
    private var voiceStartHostSeconds: Double?

    private(set) var voiceProcessing = false

    struct VoiceCapture {
        let url: URL
        let voiceProcessing: Bool
        let buffers: Int
        let peakDb: Double
        /// Host-clock time of the first recorded sample, for lining up with video.
        let startHostSeconds: Double?
    }

    private func log(_ message: String) {
        print("⚡️  [KarateRecorder] audio: \(message)")
    }

    // MARK: - Engine

    func start() {
        queue.sync {
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
            if configObserver == nil {
                configObserver = NotificationCenter.default.addObserver(
                    forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
                ) { [weak self] _ in
                    self?.handleConfigurationChange()
                }
            }
        }
    }

    func stop() {
        queue.sync {
            musicGeneration += 1
            musicShouldPlay = false
            musicNode.stop()
            clipNodes.forEach { $0.stop() }
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            if let configObserver { NotificationCenter.default.removeObserver(configObserver) }
            configObserver = nil
            log("engine stopped")
        }
    }

    /// iOS stops the engine whenever the audio configuration changes, and
    /// something else in the app starting to play is enough — the web page's
    /// spoken 「よーい」 at the start of the intro. Only logging it left the voice
    /// track silent until the music restarted the engine at Go!!, ~3.6s later.
    private func handleConfigurationChange() {
        queue.async {
            guard !self.engine.isRunning else {
                self.log("engine configuration changed; still running")
                return
            }
            do {
                self.engine.prepare()
                try self.engine.start()
                if self.musicShouldPlay { self.musicNode.play() }
                self.log("engine configuration changed; restarted (music resumed=\(self.musicShouldPlay))")
            } catch {
                self.log("engine configuration changed; restart failed: \(error.localizedDescription)")
            }
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
            if paused { musicNode.pause() } else { musicNode.play() }
            musicShouldPlay = !paused
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
                voiceLock.unlock()
                input.removeTap(onBus: 0)
                input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, when in
                    self?.appendVoice(buffer, at: when)
                }
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
        if voiceBuffers == 0, when.isHostTimeValid {
            voiceStartHostSeconds = AVAudioTime.seconds(forHostTime: when.hostTime)
        }
        try? voiceFile.write(from: buffer)
        voiceBuffers += 1
        if let channel = buffer.floatChannelData?[0] {
            for i in 0..<Int(buffer.frameLength) { voicePeak = max(voicePeak, abs(channel[i])) }
        }
    }

    /// Stops recording the voice track and closes its file.
    func stopVoiceCapture() -> VoiceCapture? {
        return queue.sync { () -> VoiceCapture? in
            engine.inputNode.removeTap(onBus: 0)
            voiceLock.lock()
            defer { voiceLock.unlock() }
            guard let url = voiceURL else { return nil }
            let peakDb = voicePeak > 0 ? Double(20 * log10(voicePeak)) : -120
            let result = VoiceCapture(url: url, voiceProcessing: voiceProcessing, buffers: voiceBuffers,
                                      peakDb: peakDb, startHostSeconds: voiceStartHostSeconds)
            voiceFile = nil   // closes the file
            voiceURL = nil
            log("voice capture stopped: \(result.buffers) buffers, peak \(String(format: "%.1f", peakDb)) dB, voiceProcessing=\(result.voiceProcessing)")
            return result
        }
    }
}
