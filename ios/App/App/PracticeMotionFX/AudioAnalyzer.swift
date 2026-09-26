import Foundation
import Accelerate

// 🎹 音を聞いて「いま何の音が どれくらい鳴っているか」を出す。
//
// なぜ音なのか: ピアノのアプリで 手のポーズを見るのは分が悪い。鍵盤の前の
// 小さな手は、空手の手首よりさらに取れない（実写で確かめた）。いっぽう **音は
// 完璧な信号**で、強い/弱い・高い/低い・単音/和音が 鳴った瞬間に分かる。
//
// ここが返すのは「絵の材料」だけで、**楽譜も、上手い下手も、合っているかも
// 見ない。** まちがえた音も 同じように きれいに光る。

/// 鳴っている音 ひとつ。
public struct FXAudioNote: Codable, Sendable, Equatable {
    /// 0=ド 1=ド♯ … 11=シ。**色はこれで決まる**（同じ音は いつも同じ色）。
    public var pitchClass: Int
    /// だいたいのオクターブ（0=いちばん低い … 8）。画面の上下になる。
    public var octave: Int
    /// 強さ 0…1。
    public var strength: Double
    /// このコマで **鳴り始めた**（花火を出すのはここだけ）。
    public var onset: Bool
    public init(pitchClass: Int, octave: Int, strength: Double, onset: Bool) {
        self.pitchClass = pitchClass; self.octave = octave
        self.strength = strength; self.onset = onset
    }
    /// MIDI の番号（60 = 真ん中のド）。
    public var midi: Int { (octave+1)*12+pitchClass }
}

/// 音の ひとコマ。
public struct FXAudioFrame: Codable, Sendable, Equatable {
    public var time: Double
    /// 音の大きさ 0…1。
    public var level: Double
    /// 明るさ 0…1（高い音ほど 1 に近い）。部屋の色がこれで変わる。
    public var brightness: Double
    /// 強い順に、多くても4つ。
    public var notes: [FXAudioNote]
    public init(time: Double, level: Double = 0, brightness: Double = 0, notes: [FXAudioNote] = []) {
        self.time = time; self.level = level; self.brightness = brightness; self.notes = notes
    }
    public var isSilent: Bool { level < 0.02 && notes.isEmpty }
}

/// 音を ひとコマずつ 聞いていく。**1つの流れにつき1つ**（使い回さない）。
/// 生きているカメラからでも、保存ずみの動画からでも 同じものを通す。
public final class AudioToneEngine {
    /// FFT の窓（サンプル数）。2のべき乗。22050Hz で 2048 ＝ 93ミリ秒。
    ///
    /// **1024（46ミリ秒）では 音の高さが取れなかった。** きざみが 21.5Hz に
    /// なり、真ん中のド（262Hz）のとなりの音との差（15Hz）より粗い ——
    /// 合成した「ドレミファソラシド」で答え合わせしたら、半音ずれて出た。
    /// 2048 なら きざみは 10.8Hz。立ち上がりは窓を 1/30秒ずつ ずらして見るので、
    /// 窓を長くしても 鈍らない。
    public static let windowSize = 2048
    private let sampleRate: Double
    private let log2n: vDSP_Length
    private let setup: FFTSetup
    private var window: [Float]
    private var ring: [Float]
    private var filled = 0

    /// 前のコマのスペクトル（立ち上がりを見るのに使う）。
    private var previousMagnitude: [Float]
    /// 前のコマで鳴っていた音（同じ音が続いているのか、弾き直したのか）。
    private var sounding: [Int: Double] = [:]
    /// 流れてきた時間の合計（秒）。
    private var flux: Double = 0
    private var fluxAverage: Double = 0

    public init?(sampleRate: Double) {
        guard sampleRate > 4000 else { return nil }
        self.sampleRate = sampleRate
        let n = Self.windowSize
        log2n = vDSP_Length(log2(Double(n)))
        guard let made = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else { return nil }
        setup = made
        window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        ring = [Float](repeating: 0, count: n)
        previousMagnitude = [Float](repeating: 0, count: n/2)
    }
    deinit { vDSP_destroy_fftsetup(setup) }

    /// 音を流しこむ。窓がいっぱいになるたびに 1コマぶん返す。
    /// `samples` はモノラルの −1…1。
    public func push(_ samples: [Float], at time: Double) -> FXAudioFrame? {
        let n = Self.windowSize
        guard !samples.isEmpty else { return nil }
        // 新しいぶんを後ろに詰める（いちばん新しい n サンプルだけを見る）。
        if samples.count >= n {
            ring = Array(samples.suffix(n))
            filled = n
        } else {
            let keep = n-samples.count
            ring = Array(ring.suffix(keep))+samples
            filled = min(n, filled+samples.count)
        }
        guard filled >= n else { return nil }
        return analyze(at: time)
    }

    /// いまの窓を1コマぶん読む。
    private func analyze(at time: Double) -> FXAudioFrame {
        let n = Self.windowSize
        let half = n/2

        // ── 大きさ（RMS）───────────────────────────────────────────────
        var rms: Float = 0
        vDSP_rmsqv(ring, 1, &rms, vDSP_Length(n))
        // 耳に合わせて dB で見る。−40dB …−10dB を 0…1 に。
        //
        // **ここを −48dB から始めていたら、部屋のノイズ（RMS 0.015 ≒ −36dB）が
        // 「0.29 の音」になっていた。** 実機で録ったピアノの練習を測って分かった
        // （音が出ていない時間に、12色ぜんぶが ちらちら光っていた）。
        let db = 20*log10(max(1e-7, Double(rms)))
        let level = fxClamp((db+40)/30)

        // ── FFT ────────────────────────────────────────────────────────
        var windowed = [Float](repeating: 0, count: n)
        vDSP_vmul(ring, 1, window, 1, &windowed, 1, vDSP_Length(n))
        var real = [Float](repeating: 0, count: half)
        var imag = [Float](repeating: 0, count: half)
        var magnitude = [Float](repeating: 0, count: half)
        real.withUnsafeMutableBufferPointer { realPtr in
            imag.withUnsafeMutableBufferPointer { imagPtr in
                var split = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                windowed.withUnsafeBufferPointer { input in
                    input.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { typed in
                        vDSP_ctoz(typed, 2, &split, 1, vDSP_Length(half))
                    }
                }
                vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvabs(&split, 1, &magnitude, 1, vDSP_Length(half))
            }
        }
        // vDSP は 2倍で返す。窓のぶんも戻しておく（数の大きさを人が読めるように）。
        var scale: Float = 1/Float(n)
        vDSP_vsmul(magnitude, 1, &scale, &magnitude, 1, vDSP_Length(half))

        // ── 立ち上がり（spectral flux）──────────────────────────────────
        // 「前より強くなったぶん」の合計。弾いた瞬間だけ跳ね上がる。
        var rise: Double = 0
        for i in 0..<half {
            let d = Double(magnitude[i]-previousMagnitude[i])
            if d > 0 { rise += d }
        }
        previousMagnitude = magnitude
        // 動く平均と比べる（部屋の広さやマイクの遠さで しきい値を決め打ちできない）。
        fluxAverage = fluxAverage == 0 ? rise : fluxAverage*0.85+rise*0.15
        flux = rise
        let struck = rise > fluxAverage*1.6 && rise > 0.0008 && level > 0.06

        // ── 明るさ（スペクトル重心）────────────────────────────────────
        var weighted: Double = 0, total: Double = 0
        for i in 1..<half {
            let m = Double(magnitude[i])
            weighted += m*Double(i)
            total += m
        }
        let centroidHz = total > 0 ? weighted/total*sampleRate/Double(n) : 0
        // 100Hz …3000Hz を 0…1 に（ log で: 耳は比で聞く ）。
        let brightness = total > 0
            ? fxClamp((log2(max(100, centroidHz))-log2(100))/(log2(3000)-log2(100)))
            : 0

        // ── 山をひろって 音にする ──────────────────────────────────────
        let notes = pickNotes(magnitude, level: level, struck: struck)
        return FXAudioFrame(time: time, level: level, brightness: brightness, notes: notes)
    }

    /// スペクトルから、鳴っている音を拾う。
    ///
    /// **山を そのまま拾ってはいけない。** ピアノの ド を弾くと、その1オクターブ上・
    /// 12度上にも山が立ち、しかも **2倍音のほうが強いことが多い**。合成した
    /// 「ドレミファソラシド」で試したら、レ を弾いたのに「レ♯4＋レ5＋ラ5」
    /// （＝半音ずれた基音＋2倍音＋3倍音）と出た。
    ///
    /// なので、**鍵盤の側から聞きにいく**: 88鍵それぞれについて「その音の
    /// 1・2・3…6倍の場所に どれだけ力があるか」を足す（倍音ほど軽く数える）。
    /// ほんものの基音は ぜんぶの倍音から点をもらえるが、2倍音の位置は
    /// 偶数番からしかもらえないので負ける。いちばん強い鍵を選んだら、その
    /// 倍音の列をスペクトルから引いて、また選ぶ —— を 4回まで。
    private func pickNotes(_ magnitude: [Float], level: Double, struck: Bool) -> [FXAudioNote] {
        // 小さすぎる音では 何も拾わない（部屋のノイズで12色が光りつづけるのを防ぐ）。
        guard level > 0.20 else { return [] }
        let binHz = sampleRate/Double(Self.windowSize)
        var spectrum = magnitude.map { Double($0) }
        let half = spectrum.count

        var peak = spectrum.max() ?? 0
        guard peak > 1e-5 else { return [] }
        // ノイズは スペクトルが平ら。**とがっていない音は 音として扱わない。**
        // ここが無いと、エアコンの音や マイクのサーで 音が鳴り続ける。
        let floorLevel = spectrum.sorted()[half/2]          // 中央値 ＝ ノイズの高さ
        guard peak > max(1e-6, floorLevel*14) else { return [] }

        /// その周波数のあたりで いちばん強いところ（半音の 1/3 ぶんだけ見る）。
        func energy(at hz: Double, in spec: [Double]) -> (value: Double, bin: Int) {
            let centre = hz/binHz
            let spread = max(1.0, centre*0.019)          // 半音 ≒ 5.9%
            let low = max(1, Int((centre-spread).rounded()))
            let high = min(half-1, Int((centre+spread).rounded()))
            guard low <= high else { return (0, low) }
            var best = 0.0, bestBin = low
            for i in low...high where spec[i] > best { best = spec[i]; bestBin = i }
            return (best, bestBin)
        }

        // ピアノの鍵（MIDI 21=ラ0 … 108=ド8）。高すぎる音は窓に入らないので上を切る。
        let lowest = 24, highest = min(100, Int(69+12*log2(sampleRate*0.42/440)))
        let weights = [1.0, 0.62, 0.42, 0.30, 0.22, 0.16]   // 倍音は軽く数える

        var picked: [(midi: Int, power: Double)] = []
        for _ in 0..<4 {
            var bestMidi = -1, bestScore = 0.0
            for midi in lowest...highest {
                // となりの半音は、同じ音の にじみ。拾うと色が2つに割れる。
                if picked.contains(where: { abs($0.midi-midi) <= 1 }) { continue }
                let f0 = 440*pow(2, Double(midi-69)/12)
                guard f0 > binHz*1.5 else { continue }
                var score = 0.0
                for (index, weight) in weights.enumerated() {
                    let hz = f0*Double(index+1)
                    guard hz < sampleRate*0.45 else { break }
                    score += weight*energy(at: hz, in: spectrum).value
                }
                if score > bestScore { bestScore = score; bestMidi = midi }
            }
            guard bestMidi >= 0, bestScore > peak*0.55 else { break }
            // 1オクターブ上（＋12）・12度上（＋19）・2オクターブ上（＋24）は、
            // 引き残った倍音であることが多い。よほど強くなければ 音として数えない。
            let isLeftoverHarmonic = picked.contains { base in
                [12, 19, 24].contains(bestMidi-base.midi) && bestScore < base.power*0.80
            }
            if isLeftoverHarmonic { break }
            picked.append((bestMidi, bestScore))
            // 選んだ音の倍音を スペクトルから引く（次の音が 見えるように）。
            let f0 = 440*pow(2, Double(bestMidi-69)/12)
            for (index, weight) in weights.enumerated() {
                let hz = f0*Double(index+1)
                guard hz < sampleRate*0.45 else { break }
                let found = energy(at: hz, in: spectrum)
                let centre = hz/binHz
                let spread = max(1.0, centre*0.019)
                let low = max(1, Int((centre-spread).rounded()))
                let high = min(half-1, Int((centre+spread).rounded()))
                if low <= high {
                    for i in low...high { spectrum[i] = max(0, spectrum[i]-found.value*weight) }
                }
            }
            peak = max(peak*0.4, spectrum.max() ?? 0)
        }
        guard !picked.isEmpty else { return [] }

        let strongest = picked[0].power
        var out: [FXAudioNote] = []
        var nowSounding: [Int: Double] = [:]
        for p in picked {
            // 2つめ以降は **いちばん強い音の半分以上** でなければ捨てる。
            // 倍音を引いたあとの残りかすが、11半音下あたりに にせの山を作る
            // （合成の音階で確かめた）。和音は どの音も同じくらい強いので残る。
            // **色が1つ増える害のほうが、和音の1音を落とす害より大きい。**
            guard p.power >= strongest*0.55 else { continue }
            let strength = fxClamp(p.power/strongest*(0.4+0.6*level))
            guard strength > 0.12 else { continue }
            nowSounding[p.midi] = strength
            // 鳴り始め: この音が いま無かった（か、ずっと弱かった）＋ 立ち上がりが来た。
            let wasQuiet = (sounding[p.midi] ?? 0) < strength*0.6
            out.append(.init(pitchClass: ((p.midi%12)+12)%12,
                             octave: p.midi/12-1,
                             strength: strength,
                             onset: struck && wasQuiet))
        }
        // 消えかけの音は ゆっくり落とす（ピアノは離しても少し鳴っている）。
        for (midi, old) in sounding where nowSounding[midi] == nil && old > 0.08 {
            nowSounding[midi] = old*0.7
        }
        sounding = nowSounding
        return out.sorted { $0.strength > $1.strength }
    }
}
