import Foundation

/// A finished practice whose video is still being saved (overlay burned in,
/// sound mixed). Everything the save needs is on disk, so if iOS kills the app
/// mid-save — it did on an iPhone SE, 3 minutes into saving a 3 minute
/// practice — the next launch finishes the job instead of losing the video.
struct PendingSave: Codable {
    let id: String
    /// Camera capture (video only), a name from PendingSaves.adopt.
    let rawName: String
    /// The echo-free voice track, if any audio was captured.
    let voiceName: String?
    /// How far the voice starts before the first video frame.
    let voiceLeadSeconds: Double
    let voiceProcessing: Bool
    /// startRecording → first frame delay the overlay and sounds shift by.
    let shiftMs: Double
    /// stopRecording's options from JS (events, menu, sounds, labels), as JSON.
    let options: Data
    let interruption: String?
    let createdAt: Date
    /// Tries started so far. Counted BEFORE each try, so a save that crashes the
    /// app falls back to a lighter export instead of crashing every launch.
    var attempts: Int
}

enum PendingSaves {
    /// Library/Application Support, not tmp: iOS may empty tmp while the app
    /// isn't running, which is exactly when a cut-short save is waiting.
    static let directory: URL = {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent("KarateRecorder/pending", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        // Videos are big and temporary: keep them out of iCloud backups.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        return dir
    }()

    private static let tmpPrefix = "tmp:"

    /// Where a stored file name points. Names are relative so they survive the
    /// app container moving on an update.
    static func url(_ name: String) -> URL {
        if name.hasPrefix(tmpPrefix) {
            return FileManager.default.temporaryDirectory.appendingPathComponent(String(name.dropFirst(tmpPrefix.count)))
        }
        return directory.appendingPathComponent(name)
    }

    /// Moves a finished capture file into the pending folder and returns its
    /// stored name. If that fails it stays where it is — a video left in tmp
    /// still beats a video thrown away.
    static func adopt(_ file: URL, as name: String) -> String {
        let target = directory.appendingPathComponent(name)
        do {
            try FileManager.default.moveItem(at: file, to: target)
            return name
        } catch {
            print("⚡️  [KarateRecorder] could not move \(file.lastPathComponent) out of tmp: \(error.localizedDescription)")
            return tmpPrefix + file.lastPathComponent
        }
    }

    private static func jobURL(_ id: String) -> URL {
        directory.appendingPathComponent("\(id).json")
    }

    static func save(_ job: PendingSave) {
        do {
            let data = try JSONEncoder().encode(job)
            try data.write(to: jobURL(job.id), options: .atomic)
        } catch {
            print("⚡️  [KarateRecorder] could not write pending save \(job.id): \(error.localizedDescription)")
        }
    }

    static func remove(_ id: String) {
        try? FileManager.default.removeItem(at: jobURL(id))
    }

    /// Every save still waiting, oldest first. A job whose capture is gone is
    /// dropped: there is nothing left to save.
    static func all() -> [PendingSave] {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: directory.path) else { return [] }
        return names.filter { $0.hasSuffix(".json") }.compactMap { name -> PendingSave? in
            let file = directory.appendingPathComponent(name)
            guard let data = try? Data(contentsOf: file),
                  let job = try? JSONDecoder().decode(PendingSave.self, from: data) else {
                try? fm.removeItem(at: file)
                return nil
            }
            guard fm.fileExists(atPath: url(job.rawName).path) else {
                print("⚡️  [KarateRecorder] pending save \(job.id) lost its capture; dropping it")
                try? fm.removeItem(at: file)
                return nil
            }
            return job
        }.sorted { $0.createdAt < $1.createdAt }
    }

    /// Deletes files no pending job refers to: captures and voices of saves
    /// that finished, half-written outputs of saves that will be redone.
    /// Only called when no screen can still be playing one of them.
    static func removeOrphans(except running: String?) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: directory.path) else { return }
        let jobs = all()
        var keep = Set(jobs.flatMap { [$0.rawName, $0.voiceName].compactMap { $0 } }).union(jobs.map { "\($0.id).json" })
        if let running { keep.formUnion(names.filter { $0.hasPrefix(running) }) }
        let stale = names.filter { !keep.contains($0) }
        for name in stale { try? fm.removeItem(at: directory.appendingPathComponent(name)) }
        if !stale.isEmpty { print("⚡️  [KarateRecorder] removed \(stale.count) finished save file(s)") }
    }
}
