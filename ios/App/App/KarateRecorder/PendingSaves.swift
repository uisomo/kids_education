import Foundation

/// A practice whose video is still being saved (overlay burned in, sound
/// mixed). Everything the save needs is on disk, so if iOS kills the app
/// mid-save — it did on an iPhone SE, 3 minutes into saving a 3 minute
/// practice — the next launch finishes the job instead of losing the video.
///
/// 録画を はじめた ときに もう 書く（`state == "recording"`）。生の 映像と 声は さいしょから
/// この フォルダに 書かれるので、録画の とちゅうで アプリが 落ちても つぎの 起動で ひろえる。
struct PendingSave: Codable {
    let id: String
    /// Camera capture (video only), a name relative to PendingSaves.directory.
    /// おへや・かめんが おわったら かくした 動画の 名前に かわる（もとは `originalRawName`）
    var rawName: String
    /// The echo-free voice track, if any audio was captured.
    var voiceName: String?
    /// How far the voice starts before the first video frame.
    var voiceLeadSeconds: Double
    var voiceProcessing: Bool
    /// startRecording → first frame delay the overlay and sounds shift by.
    var shiftMs: Double
    /// stopRecording's options from JS (events, menu, sounds, labels), as JSON.
    var options: Data
    /// Fixed at capture start; decoded again on retry, never reselected during export.
    var openingSelection: Data? = nil
    var interruption: String?
    let createdAt: Date
    /// ほんとうに 落ちた 回数（いまの 段で）。バックグラウンドで 失敗した ぶんは かぞえない。
    /// おへや・かめんが おわったら 0 に もどす（しあげの 段は また いちばん 上から）
    var attempts: Int
    /// "recording" = 録画中（startRecording で 書いた）。nil = 録画は おわった
    var state: String?
    /// 書き出しの とちゅう。つぎの 起動で これが true のままなら、とちゅうで 落ちた（attempts を 1 ふやす）。
    /// バックグラウンドに 行ったら false に する（iOS に 止められた ぶんは かぞえない）
    var inProgress: Bool?
    /// おへや・かめんの まえの 生の 録画。写真に 保存 できるまで 消さない
    var originalRawName: String?

    var isRecording: Bool { state == "recording" }
    var privacyDone: Bool { originalRawName != nil || rawName.contains("-private.") }
    /// この しごとが もっている ファイル（消しては いけない）
    var fileNames: [String] { [rawName, voiceName, originalRawName].compactMap { $0 } }
}

enum PendingSaves {
    /// Library/Application Support, not tmp: iOS may empty tmp while the app
    /// isn't running, which is exactly when a cut-short save is waiting.
    static let directory: URL = supportDirectory("KarateRecorder/pending")

    /// Videos are big: keep them out of iCloud backups.
    static func supportDirectory(_ path: String) -> URL {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent(path, isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        return dir
    }

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
    /// still beats a video thrown away. (いまの 録画は さいしょから pending に 書くので、
    /// これは むかしの ファイルの ため)
    static func adopt(_ file: URL, as name: String) -> String {
        if file.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL {
            return file.lastPathComponent
        }
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

    /// 書けなかったら 投げる。よぶ 側は そのとき 何も 消さないこと
    static func save(_ job: PendingSave) throws {
        do {
            let data = try JSONEncoder().encode(job)
            try data.write(to: jobURL(job.id), options: .atomic)
        } catch {
            print("⚡️  [KarateRecorder] could not write pending save \(job.id): \(error.localizedDescription)")
            throw error
        }
    }

    static func load(_ id: String) -> PendingSave? {
        guard let data = try? Data(contentsOf: jobURL(id)) else { return nil }
        return try? JSONDecoder().decode(PendingSave.self, from: data)
    }

    /// 書き出しの とちゅうか どうかだけ かきかえる（バックグラウンドに 行った／もどった）
    static func setInProgress(_ id: String, _ value: Bool) {
        guard var job = load(id), job.inProgress != value else { return }
        job.inProgress = value
        try? save(job)
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
            guard let data = try? Data(contentsOf: file) else { return nil }
            guard var job = try? JSONDecoder().decode(PendingSave.self, from: data) else {
                // 読めない 日記は 消さずに よけておく（中の ファイルは removeOrphans が のこさないが、日記は のこる）
                print("⚡️  [KarateRecorder] pending save \(name) is unreadable; leaving it aside")
                try? fm.moveItem(at: file, to: file.appendingPathExtension("bad"))
                return nil
            }
            if !fm.fileExists(atPath: url(job.rawName).path) {
                // かくした 動画だけ なくなった：もとの 生の 録画から やりなおす
                if let original = job.originalRawName, fm.fileExists(atPath: url(original).path) {
                    job.rawName = original
                    job.originalRawName = nil
                    job.attempts = 0
                    try? save(job)
                    return job
                }
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
    /// - running: この id で はじまる ファイルは のこす（書き出し中・録画中）
    /// - keeping: ほかに のこす 名前（写真に 保存 されるまで のこす 生の 録画 など）
    static func removeOrphans(except running: [String], keeping: Set<String> = []) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: directory.path) else { return }
        let jobs = all()
        var keep = Set(jobs.flatMap { $0.fileNames }).union(jobs.map { "\($0.id).json" }).union(keeping)
        for id in running { keep.formUnion(names.filter { $0.hasPrefix(id) }) }
        let stale = names.filter { !keep.contains($0) && !$0.hasSuffix(".bad") }
        for name in stale { try? fm.removeItem(at: directory.appendingPathComponent(name)) }
        if !stale.isEmpty { print("⚡️  [KarateRecorder] removed \(stale.count) finished save file(s)") }
    }
}

/// できあがった 動画の 置き場所（Application Support。tmp では ない＝iOS に 消されない）。
///
/// **写真に 保存 できるまで ぜったいに 消さない。** 保存 できたら `markSaved` → つぎの 稽古の まえに 片づける。
/// 「見た」（markVideoSeen）は 消して よい しるしでは ない（それは おしらせを 出すか どうか だけ）
enum FinishedVideos {
    static let directory: URL = PendingSaves.supportDirectory("KarateRecorder/finished")

    private static let savedKey = "KarateRecorder.savedToPhotos"
    /// できた 動画の 名前 → 写真に 保存 されるまで のこす pending の ファイル（おへや・かめんの まえの 生の 録画）
    private static let keepKey = "KarateRecorder.keepUntilSaved"

    static func url(_ name: String) -> URL { directory.appendingPathComponent(name) }

    static func name(forJob id: String, ext: String) -> String { "karate-training-\(id).\(ext)" }

    /// "karate-training-<id>.mp4" → id
    static func jobId(of name: String) -> String? {
        let base = (name as NSString).deletingPathExtension
        guard base.hasPrefix("karate-training-") else { return nil }
        return String(base.dropFirst("karate-training-".count))
    }

    /// この 場所の 動画なら その 名前
    static func contains(_ url: URL) -> String? {
        let dir = url.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL.path
        return dir == directory.resolvingSymlinksInPath().standardizedFileURL.path ? url.lastPathComponent : nil
    }

    static func savedNames() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: savedKey) ?? [])
    }

    static func markSaved(_ name: String) {
        var saved = savedNames()
        saved.insert(name)
        UserDefaults.standard.set(Array(saved), forKey: savedKey)
    }

    static func keepUntilSaved() -> [String: [String]] {
        UserDefaults.standard.dictionary(forKey: keepKey) as? [String: [String]] ?? [:]
    }

    static func setKeepUntilSaved(_ finished: String, _ pendingNames: [String]) {
        var all = keepUntilSaved()
        all[finished] = pendingNames.isEmpty ? nil : pendingNames
        UserDefaults.standard.set(all, forKey: keepKey)
    }

    /// pending の ファイルで、まだ 消しては いけない もの
    static func pendingNamesToKeep() -> Set<String> {
        let saved = savedNames()
        return Set(keepUntilSaved().filter { !saved.contains($0.key) }.flatMap { $0.value })
    }

    /// まだ 写真に 保存 されていない できあがりの 動画（ふるい じゅん）
    static func unsaved() -> [(name: String, url: URL, createdAt: Date)] {
        let fm = FileManager.default
        let saved = savedNames()
        let names = (try? fm.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { !saved.contains($0) && !$0.hasPrefix(".") }.map { name in
            let url = url(name)
            let created = (try? fm.attributesOfItem(atPath: url.path)[.creationDate] as? Date) ?? Date()
            return (name, url, created)
        }.sorted { $0.createdAt < $1.createdAt }
    }

    /// 写真に 保存 できた ものだけ 片づける（`keeping` は のこす：おわりの 画面が まだ つかう など）
    static func removeSaved(keeping: Set<String>) {
        let fm = FileManager.default
        let names = Set((try? fm.contentsOfDirectory(atPath: directory.path)) ?? [])
        let saved = savedNames()
        var removed = 0
        for name in saved where names.contains(name) && !keeping.contains(name) {
            if (try? fm.removeItem(at: url(name))) != nil { removed += 1 }
        }
        // もう ない ものの しるしは わすれる（のこす ものは まだ おぼえておく）
        let still = saved.filter { names.contains($0) && keeping.contains($0) }
        UserDefaults.standard.set(Array(still), forKey: savedKey)
        var keep = keepUntilSaved()
        for key in keep.keys where saved.contains(key) { keep[key] = nil }
        UserDefaults.standard.set(keep, forKey: keepKey)
        if removed > 0 { print("⚡️  [KarateRecorder] removed \(removed) video(s) already saved to 写真") }
    }

    /// むかしの ビルドが tmp に おいた できあがりの 動画を ここへ うつす（iOS に 消される まえに）
    static func migrateFromTemporaryDirectory() {
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory
        let names = (try? fm.contentsOfDirectory(atPath: tmp.path)) ?? []
        for name in names where name.hasPrefix("karate-training-") && !name.contains("-fx-")
            && ["mp4", "mov"].contains((name as NSString).pathExtension.lowercased()) {
            let target = url(name)
            guard !fm.fileExists(atPath: target.path) else { continue }
            do {
                try fm.moveItem(at: tmp.appendingPathComponent(name), to: target)
                print("⚡️  [KarateRecorder] kept \(name) (moved out of tmp)")
            } catch {
                print("⚡️  [KarateRecorder] could not move \(name) out of tmp: \(error.localizedDescription)")
            }
        }
    }
}
