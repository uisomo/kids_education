import Foundation

// 🎹 音から 絵を作る（ピアノのアプリ）。
//
// 空手は「腕の骨」に沿って描いた。ピアノは **音の柱** に沿って描く:
// 鍵盤の位置（低い音は左、高い音は右）から光の柱が立ちのぼり、その柱を
// 骨として、いまつけている style（炎・稲妻・氷…）がそのまま巻きつく。
// だから集めたキラキラは、空手でもピアノでも 同じものに見える。
//
// 重ねるのは4枚:
//   1. 部屋の空気      … 鳴っている音の色に染まって、音の大きさで息をする
//   2. 音の柱          … いま鳴っている音ひとつに1本（多くても3本）
//   3. 音の花火        … 弾いた瞬間に、その柱の先で はじける
//   4. 旋律の川        … いま弾いたところが 光の線になって 上を流れていく
//
// **同じ音は いつも同じ色。** ドは赤、レは黄、ミは緑…と12色が決まっているので、
// 同じ曲を弾けば 同じ色の並びが出る。「自分の曲が見えている」と分かるのが
// いちばん大事なところ。
extension SceneBuilder {

    /// 鍵盤のどこか（0…1）。**いま弾いている range に合わせて広げる。**
    ///
    /// 88鍵ぜんぶを画面の幅に割りふると、子どもが1オクターブの中で弾いている
    /// あいだ、柱が全部 同じところに立って重なってしまう（実機の「メリーさんの羊」で
    /// そうなった）。直近で弾いた いちばん低い音〜高い音を 画面いっぱいに広げる。
    static func keyPosition(_ midi: Int, low: Int, high: Int) -> Double {
        let span = max(11.0, Double(high-low))
        return fxClamp((Double(midi)-Double(low))/span)
    }

    /// 直近 8秒で弾いた音の 低いほう・高いほう（広げかたを決めるため）。
    static func playedRange(_ frames: [FXAudioFrame], at time: Double) -> (low: Int, high: Int) {
        var low = 127, high = 0
        for frame in frames where time-frame.time <= 8 {
            for note in frame.notes where note.strength > 0.15 {
                low = min(low, note.midi); high = max(high, note.midi)
            }
        }
        guard low <= high else { return (60, 72) }
        // 広がりすぎ／狭すぎを ほどほどに。
        if high-low < 11 {
            let middle = (low+high)/2
            low = middle-6; high = middle+5
        }
        return (low, high)
    }

    /// 12色の輪。ド=赤 → レ=黄 → ミ=緑 → ソ=青 → シ=紫 と ひとまわり。
    /// `mix` は preset の色と どれくらい混ぜるか（1 で音の色そのまま）。
    static func noteColour(_ pitchClass: Int, preset: FXColor, mix: Double) -> FXColor {
        let hue = (Double(((pitchClass%12)+12)%12)*30+350).truncatingRemainder(dividingBy: 360)
        let pure = hsv(hue, 0.78, 1)
        let m = fxClamp(mix)
        return FXColor(preset.red+(pure.red-preset.red)*m,
                       preset.green+(pure.green-preset.green)*m,
                       preset.blue+(pure.blue-preset.blue)*m,
                       1)
    }

    static func hsv(_ hue: Double, _ saturation: Double, _ value: Double) -> FXColor {
        let h = (hue.truncatingRemainder(dividingBy: 360)+360).truncatingRemainder(dividingBy: 360)/60
        let c = value*saturation
        let x = c*(1-abs(h.truncatingRemainder(dividingBy: 2)-1))
        let m = value-c
        let (r, g, b): (Double, Double, Double)
        switch Int(h) {
        case 0: (r, g, b) = (c, x, 0)
        case 1: (r, g, b) = (x, c, 0)
        case 2: (r, g, b) = (0, c, x)
        case 3: (r, g, b) = (0, x, c)
        case 4: (r, g, b) = (x, 0, c)
        default: (r, g, b) = (c, 0, x)
        }
        return FXColor(r+m, g+m, b+m, 1)
    }

    /// その style は 音の色を どれくらい受け取るか。
    /// 炎や氷は「その色であること」が名前になっているので 少しだけ混ぜる。
    /// 虹は 音の色そのもの。
    static func hueMix(_ style: String) -> Double {
        switch style {
        case "rainbow": return 1.0
        case "sparkle", "aura", "ribbon": return 0.70
        case "petal", "water", "wind": return 0.55
        case "lightning", "dragon", "shadow": return 0.40
        default: return 0.30      // flame / ice / blizzard
        }
    }

    /// 音の柱のかたち。鍵盤（画面の下）から 立ちのぼる骨。
    ///
    /// **まっすぐにしない。** 縦一直線だと、炎も氷も稲妻も 同じ直線に重なって
    /// 見えた（実写で確かめた）。ゆっくり左右にしなる曲線にすると、style ごとの
    /// 「まとわりつきかた」がそのまま出る。しなりは時刻で進むので、伸ばしている
    /// 音は ゆらゆら揺れつづける。
    static func columnPath(x: Double, height: Double, lean: Double, sway: Double,
                           aspect: Double) -> DisplayPath? {
        let foot = 1.04                       // 画面の下に少しはみ出す（根元を見せない）
        let top = max(0.06, foot-height)
        var points: [FXPoint] = []
        for i in 0...4 {
            let u = Double(i)/4                       // 0 = 根元, 1 = 先
            let y = foot+(top-foot)*u
            // 先にいくほど ふくらむ。
            let bend = sin(Double.pi*u*0.75)*u
            points.append(FXPoint(fxClamp(x+lean*bend+sway*sin(u*2.4+sway*3)*0.35, 0.02, 0.98), y))
        }
        return DisplayPath(points, aspect: aspect)
    }

    /// 打鍵からの **音の形**（エンベロープ）。ピアノは「カン！」と立ち上がって
    /// すぐ落ち、あとは細く伸びる。光も同じ形にする。
    /// **直線で薄くしてはいけない** — 一定の速さで消える光は、機械が消したように
    /// 見えて「弾いた」感じが出ない。立ち上がり 45ms、0.55秒で 0.42 まで落ちる。
    static func strikeEnvelope(_ frames: [FXAudioFrame], midi: Int, at time: Double) -> Double {
        // その音が最後に鳴り始めた時刻。1.6秒より前のものは見ない。
        var age: Double? = nil
        for frame in frames.reversed() {
            let d = time-frame.time
            if d < 0 { continue }
            if d > 1.6 { break }
            if frame.notes.contains(where: { $0.onset && $0.midi == midi }) { age = d; break }
        }
        guard let age else { return 0.42 }
        let attack = 0.045, sustain = 0.42
        if age < attack {
            let u = fxClamp(age/attack)
            return u*u*(3-2*u)                      // なめらかな立ち上がり
        }
        let u = fxClamp((age-attack)/0.55)
        let fall = (1-u)*(1-u)                      // ease-out で落ちる
        return sustain+(1-sustain)*fall
    }

    /// 音のひとコマから、絵をぜんぶ作る。
    ///
    /// - `frames`: 時間順の音のコマ。**いまより前のぶんだけ**（川と花火に要る）。
    /// - `time`: いまの時刻。
    public static func music(frames: [FXAudioFrame], at time: Double, sourceSize: FXSize,
                             preset: EffectPreset, intensity: Double = 1,
                             reduceMotion: Bool = false) -> EffectScene {
        var scene = EffectScene(sourceSize: sourceSize)
        guard time.isFinite, sourceSize.isValid, let current = frames.last else { return scene }
        // 音が古すぎるときは 何も描かない（解析が途切れたところで止まって見えるより、
        // 消えたほうがよい）。
        let age = time-current.time
        guard age >= -0.05, age <= 0.25 else { return scene }
        let strength = fxClamp(intensity)
        guard strength > 0 else { return scene }

        let aspect = sourceSize.aspect
        let shortToY = min(aspect, 1), shortToX = min(1, 1/aspect)
        let base = fxClamp(preset.opacity)*strength
        let style = preset.style
        let mix = hueMix(style)

        // 鳴っている音（強い順）。3本までにするのは、4本を超えると画面が
        // 縦じまで埋まって、子どもの姿が見えなくなるから。
        let notes = current.notes.filter { $0.strength > 0.12 }.prefix(3)
        let level = fxClamp(current.level)
        let range = playedRange(frames, at: time)
        /// 静かになってからの時間。**音が止まったら 絵も止まる。**
        /// ここが無いと、休んでいるあいだも かざりが出つづけて、
        /// 「鳴らしたから出た」が伝わらない（見せ場が無くなる）。
        let lastSound = frames.last(where: { !$0.notes.isEmpty })?.time ?? -99
        let quiet = fxClamp((time-lastSound)/1.2)
        let alive = 1-quiet*quiet

        // ── 1. 部屋の空気 ─────────────────────────────────────────────────
        // いちばん強い音の色に 部屋が染まる。何も鳴っていなければ 何も出ない。
        if level > 0.05 {
            let tint = notes.first.map { noteColour($0.pitchClass, preset: preset.color, mix: mix) }
                ?? preset.color
            // 弾いた瞬間だけ 部屋ごと反応する。
            let flare = notes.contains(where: \.onset) ? 1.0 : 0.0
            scene.primitives.append(contentsOf: ambient(
                style: style, tint: tint,
                level: base*airLevel*(0.35+0.65*level)*alive, flare: flare,
                time: time, aspect: aspect, reduceMotion: reduceMotion).prefix(4))
        }
        scene.ambientCount = scene.primitives.count

        // ── 2. 音の柱 ─────────────────────────────────────────────────────
        // いま鳴っている音ひとつに1本。強い音ほど 高く・濃く立ちのぼる。
        if !reduceMotion {
            for (index, note) in notes.enumerated() {
                let place = keyPosition(note.midi, low: range.low, high: range.high)
                let x = 0.10+0.80*place
                let height = 0.30+0.52*fxClamp(note.strength)
                // まん中から外へ しなる（低い音は左へ、高い音は右へ）。
                let lean = (place-0.5)*0.22
                let sway = sin(time*1.7+Double(note.midi))*0.05
                guard let path = columnPath(x: x, height: height, lean: lean,
                                            sway: sway, aspect: aspect) else { continue }
                let colour = noteColour(note.pitchClass, preset: preset.color, mix: mix)
                // 鳴り始めは いちばん明るく、伸ばしているあいだ 静かになっていく。
                // **柱は主役ではない**（主役は打鍵の花火）。伸びている音の柱を
                // 強いままにすると、画面が縦じまで埋まって どれが「いま弾いた音」か
                // 分からなくなる。0.78 を掛けて 一段 下げる。
                let env = strikeEnvelope(frames, midi: note.midi, at: time)
                let lit = base*0.78*(0.55+0.45*fxClamp(note.strength))*(0.40+0.60*env)
                // 空手の腕より **太くうねらせる**。柱は細長いので、同じ振れ幅では
                // 何が巻きついているのか分からない。
                let amp = wrapAmplitude*shortToY*1.9*(0.75+0.55*fxClamp(note.strength))*(0.85+0.15*env)
                decorate(path, style: style, colour: colour, lit: lit, amp: amp,
                         energy: fxClamp(note.strength), aspect: aspect, shortToY: shortToY,
                         // 柱ごとに 種を変える（同じ形が3本ならばない）。
                         time: time, seed: note.midi &* 7717 &+ index, into: &scene)
                // 柱の根元の光。鍵盤のあたりが光って「ここから出ている」と分かる。
                scene.primitives.append(.init(kind: .orb, points: [FXPoint(x, 1.0)],
                                              color: colour.opacity(lit*0.9),
                                              radius: orbSize*(0.7+0.5*fxClamp(note.strength))*(0.75+0.35*env)))
            }
        }

        // ── 2.5 鍵盤が光る ────────────────────────────────────────────────
        // **弾いた瞬間、画面の下いちめんが その音の色で光る。** 柱や花火より
        // これがいちばん効く: 音が出た「衝撃」が体で分かる。0.35秒で消えるので
        // うるさくならない。
        if !reduceMotion, let struck = frames.last(where: { $0.notes.contains(where: \.onset) }) {
            let since = time-struck.time
            if since >= 0, since < 0.35, let note = struck.notes.first(where: \.onset) {
                let fade = (1-since/0.35)*(1-since/0.35)
                let colour = noteColour(note.pitchClass, preset: preset.color, mix: mix)
                scene.primitives.append(.init(kind: .veil,
                    points: [FXPoint(0.5, 1), FXPoint(0.5, 0.62)],
                    color: colour.opacity(base*0.85*fade*(0.5+0.5*fxClamp(note.strength))),
                    blend: .over))
            }
        }

        // ── 3. 音の花火 ───────────────────────────────────────────────────
        // 弾いた瞬間から 0.9秒かけて、柱の先で はじけて消える。
        // **鳴っているあいだ中ではなく、弾いた一瞬だけ** 出すのがだいじ
        //（ずっと出ていると、どこで音が変わったのか分からなくなる）。
        if !reduceMotion {
            var blooms = 0
            for frame in frames.reversed() {
                let age = time-frame.time
                guard age >= 0, age < 0.9 else { if age >= 0.9 { break } else { continue } }
                for note in frame.notes where note.onset && blooms < 3 {
                    blooms += 1
                    let progress = age/0.9
                    let fade = (1-progress)*(1-progress)
                    let x = 0.10+0.80*keyPosition(note.midi, low: range.low, high: range.high)
                    let y = max(0.08, 1.04-(0.30+0.52*fxClamp(note.strength)))
                    let colour = noteColour(note.pitchClass, preset: preset.color, mix: mix)
                    let r = orbSize*(0.9+5.0*progress)*(0.75+0.7*fxClamp(note.strength))
                    // 広がる輪を2本（内と外）。1本だけだと「照準」に見える。
                    // **広がるほど 細く・薄く。** 太さのまま広がる輪は「輪っかの
                    // 絵」に見える（煙の輪は 広がりながら消える）。
                    for (index, scale) in [1.0, 0.62].enumerated() {
                        var ring: [FXPoint] = []
                        for k in 0...22 {
                            let a = Double(k)/22*2*Double.pi
                            ring.append(FXPoint(x+cos(a)*r*scale*shortToX, y+sin(a)*r*scale*shortToY))
                        }
                        scene.primitives.append(.init(kind: .glow, points: ring,
                            color: colour.opacity(base*fade*(index == 0 ? 0.95 : 0.50)),
                            lineWidth: boltWidth*(0.22+0.85*fade)*(index == 0 ? 1.0 : 0.65)))
                    }
                    // はじけて散る粒。外へ飛びながら消える。
                    // **角度を等間隔にしない。** きれいに16等分すると、輪のふちが
                    // のこぎりの歯になって「歯車」に見えた（実写で確認）。
                    var sparks: [FXPoint] = []
                    for k in 0..<16 {
                        let wobble = (noise(note.midi &+ 911, k)-0.5)*0.55
                        let a = (Double(k)+wobble)/16*2*Double.pi+Double(note.midi)
                        // 輪のふちに 粒が並ぶと「ブレスレット」に見える。
                        // **内にも外にも散らす**（0.5〜2.4倍）。
                        let d = r*(0.5+1.9*noise(note.midi, k))*(0.55+0.95*progress)
                        sparks.append(FXPoint(x+cos(a)*d*shortToX, y+sin(a)*d*shortToY))
                    }
                    // 火の粉は **やわらかい粒**（"star" の十字は輪のふちに並ぶと
                    // うるさい）。花びらの style だけ 花びらのまま。
                    scene.primitives.append(.init(kind: .spray, points: sparks,
                                                  color: colour.opacity(base*fade*0.95),
                                                  radius: bandWidth*0.48*(0.45+fade),
                                                  glyphID: style == "petal" ? "petal" : "dot"))
                    // まん中の たま。はじけた芯。散るほど 小さく畳む。
                    scene.primitives.append(.init(kind: .orb, points: [FXPoint(x, y)],
                                                  color: colour.opacity(base*fade*0.85),
                                                  radius: orbSize*(0.55+0.95*fade)))
                }
                if blooms >= 3 { break }
            }
        }

        // ── 4. 旋律の川 ───────────────────────────────────────────────────
        // いま弾いたところが 光の線になって、画面の上を右から左へ流れる。
        // **同じ曲を弾けば 同じ形が出る。** 自分の曲が見えるのが、ここ。
        if !reduceMotion {
            let span = 3.2
            var river: [(point: FXPoint, colour: FXColor)] = []
            for frame in frames where time-frame.time >= 0 && time-frame.time <= span {
                guard let note = frame.notes.first, note.strength > 0.15 else { continue }
                let ageRatio = (time-frame.time)/span              // 0 = いま
                let x = 0.06+0.88*(1-ageRatio)
                // 高い音ほど 上。焼き込んだ題名（画面の上 1/4）にはかからない高さ。
                let y = 0.46-0.14*keyPosition(note.midi, low: range.low, high: range.high)
                river.append((FXPoint(x, y), noteColour(note.pitchClass, preset: preset.color, mix: mix)))
            }
            // 4本までに切り分けて描く（色が変わるところで分ける）。
            if river.count >= 2 {
                let chunk = max(2, river.count/4)
                var index = 0
                while index+1 < river.count && scene.primitives.count < 26 {
                    let piece = Array(river[index..<min(river.count, index+chunk+1)])
                    guard piece.count >= 2 else { break }
                    let colour = piece[piece.count/2].colour
                    // 古いところほど 薄く。
                    let oldness = Double(index)/Double(max(1, river.count))
                    scene.primitives.append(.init(kind: .glow, points: piece.map(\.point),
                                                  color: colour.opacity(base*0.55*(0.35+0.65*(1-oldness))),
                                                  lineWidth: bandWidth*0.75))
                    index += chunk
                }
            }
        }

        scene.primitives = Array(scene.primitives.prefix(30))
        return scene
    }
}
