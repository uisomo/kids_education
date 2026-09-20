# Levels every sound the app plays so none of them jumps out.
#
# The cheer clips came from different recordings and the countdown tones are
# synthesised, so each file arrived at its own level: some voices were at the
# brick wall (0 dBFS peak, -6 dBFS over their loudest 400 ms) while izzy-7 was
# 20 dB under them, and the 「ドン」 hit hard enough to make the phone's speaker
# buzz. A single playback volume in the app cannot fix that — the files
# themselves have to agree — so this pass measures each one and re-encodes it
# with a fixed gain.
#
#   python3 karate-trainer/tools/normalize-audio.py --check   # measure only
#   python3 karate-trainer/tools/normalize-audio.py           # rewrite in place
#
# Targets (dBFS): a clip is judged by its loudest 400 ms window, not by its
# peak — a short 「ドン」 and a 1.5 s voice line with the same peak are nowhere
# near equally loud. Effects sit under the voices on purpose: the tick repeats
# every second and the tones are near-pure sines, which the ear hears as louder
# than their level suggests. The BGM carries its quiet level in the file too,
# rather than being turned down on every playback and every export.
#
# These targets are known to the export: SoundMixer.clipFileLevelDb /
# musicFileLevelDb set the mix against them. Change a target here and change it
# there.
import math, os, re, struct, subprocess, sys, tempfile
from array import array

try:
    import audioop            # C-speed gain; gone in Python 3.13, loop below covers it
except ImportError:
    audioop = None

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")

VOICE_TARGET, VOICE_CEILING = -12.0, -1.5     # cheer clips (characters/cheer)
EFFECT_TARGET, EFFECT_CEILING = -18.0, -9.0   # countdown tones, 🪝 の ドン
MUSIC_TARGET, MUSIC_CEILING = -27.5, -12.0    # 君ならできる — plays under everything
WINDOW_SEC = 0.4
SKIP_UNDER_DB = 1.0     # already level (and wide enough for the wobble an AAC
                        # round-trip adds to the peak): do not re-encode it again

# The BGM arrived as a 192 kbps mp3. CoreAudio cannot write mp3, and the level
# has to end up inside the file, so the normalised copy is AAC at the same rate.
MUSIC_MP3 = "characters/君ならできる.mp3"
MUSIC_M4A = "characters/君ならできる.m4a"


def targets(rel):
    if rel.startswith("sounds/"):
        return EFFECT_TARGET, EFFECT_CEILING
    if rel.startswith("characters/cheer/"):
        return VOICE_TARGET, VOICE_CEILING
    return MUSIC_TARGET, MUSIC_CEILING


def db(v):
    return 20 * math.log10(v) if v > 0 else -99.0


def decode(src, dest, rate=None, mono=False):
    cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16" + (f"@{rate}" if rate else "")]
    if mono:
        cmd += ["-c", "1"]
    cmd += [src, dest]
    subprocess.run(cmd, check=True, capture_output=True)
    return dest


def read_wav(path):
    """Minimal RIFF reader: afconvert writes WAVE_FORMAT_EXTENSIBLE, which the
    stdlib `wave` module refuses."""
    b = open(path, "rb").read()
    assert b[:4] == b"RIFF" and b[8:12] == b"WAVE", path
    i, rate, bits, ch, data = 12, None, None, 1, None
    while i + 8 <= len(b):
        cid, size = b[i:i + 4], struct.unpack("<I", b[i + 4:i + 8])[0]
        body = b[i + 8:i + 8 + size]
        if cid == b"fmt ":
            ch = struct.unpack("<H", body[2:4])[0]
            rate = struct.unpack("<I", body[4:8])[0]
            bits = struct.unpack("<H", body[14:16])[0]
        elif cid == b"data":
            data = body
        i += 8 + size + (size & 1)
    assert bits == 16, f"{path}: {bits} bits"
    samples = array("h")
    samples.frombytes(data[:len(data) // 2 * 2])
    return rate, ch, samples


def write_wav(path, rate, ch, samples):
    data = samples.tobytes()
    open(path, "wb").write(
        b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " +
        struct.pack("<IHHIIHH", 16, 1, ch, rate, rate * ch * 2, ch * 2, 16) +
        b"data" + struct.pack("<I", len(data)) + data)


def loudest_window(rate, mono):
    """dBFS of the loudest WINDOW_SEC, summed in 50 ms buckets (the export's
    Swift side measures the child's voice exactly this way)."""
    bucket = max(1, int(0.05 * rate))
    per = max(1, int(WINDOW_SEC / 0.05))
    sums, i = [], 0
    if audioop is not None:
        raw = mono.tobytes()
        while (i + bucket) * 2 <= len(raw):
            r = audioop.rms(raw[i * 2:(i + bucket) * 2], 2)
            sums.append(float(r) * r)
            i += bucket
        i = len(sums) * bucket
    while i + bucket <= len(mono):
        chunk = mono[i:i + bucket]
        sums.append(sum(s * s for s in chunk) / bucket)
        i += bucket
    # A trailing part-bucket is dropped rather than averaged in: on a 0.15 s
    # 「ぷっ」 the 20-sample tail counted as much as a whole bucket and pulled
    # the reading a dB under the truth.
    if not sums and len(mono):
        sums = [sum(s * s for s in mono) / len(mono)]
    if not sums:
        return -99.0
    if len(sums) < per:
        return db(math.sqrt(sum(sums) / len(sums)) / 32768.0)
    acc = sum(sums[:per])
    best = acc
    for k in range(per, len(sums)):
        acc += sums[k] - sums[k - per]
        best = max(best, acc)
    return db(math.sqrt(best / per) / 32768.0)


def to_mono(ch, samples):
    if ch == 1:
        return samples
    if audioop is not None and ch == 2:
        out = array("h")
        out.frombytes(audioop.tomono(samples.tobytes(), 2, 0.5, 0.5))
        return out
    return array("h", [sum(samples[i:i + ch]) // ch for i in range(0, len(samples), ch)])


def measure(path):
    """Always measured on the file's own decode, at its own rate. afconvert can
    downmix and downsample in one step, which is much cheaper on a 3-minute
    track, but its mono downmix read up to 3 dB hot on AAC — so the channels
    are averaged here instead."""
    tmp = tempfile.mkdtemp()
    rate, ch, samples = read_wav(decode(path, os.path.join(tmp, "m.wav")))
    peak = max(max(samples), -min(samples)) / 32768.0
    return peak, loudest_window(rate, to_mono(ch, samples))


def gain_applied(samples, factor):
    if audioop is not None:
        out = array("h")
        out.frombytes(audioop.mul(samples.tobytes(), 2, factor))
        return out
    return array("h", (max(-32768, min(32767, int(round(s * factor)))) for s in samples))


def source_bitrate(path):
    out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
    m = re.search(r"bit rate: (\d+) bits", out)
    return int(m.group(1)) if m else 64000


def process(rel, write, out_rel=None):
    path = os.path.normpath(os.path.join(PUBLIC, rel))
    out = os.path.normpath(os.path.join(PUBLIC, out_rel or rel))
    peak, loud = measure(path)
    target, ceiling = targets(rel)
    # Whichever rule asks for less: bring the loudest 400 ms to the target, but
    # never push the peak past the ceiling (a 「ドン」 is all peak and would
    # clip long before its window average got there).
    gain = min(target - loud, ceiling - db(peak))
    done = abs(gain) < SKIP_UNDER_DB and out == path
    print(f"{rel:34s} peak {db(peak):6.1f}  loud {loud:6.1f}  ->  {gain:+5.1f} dB"
          + ("  (skip)" if done else "") + ("" if out == path else f"  -> {out_rel}"))
    if not write or done:
        return
    tmp = tempfile.mkdtemp()
    rate, ch, samples = read_wav(decode(path, os.path.join(tmp, "raw.wav")))
    gained = os.path.join(tmp, "gained.wav")
    write_wav(gained, rate, ch, gain_applied(samples, 10 ** (gain / 20.0)))
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(source_bitrate(path)), gained, out],
                   check=True, capture_output=True)
    if out != path:
        os.remove(path)


def main():
    write = "--check" not in sys.argv
    for name in sorted(os.listdir(os.path.join(PUBLIC, "characters", "cheer"))):
        if name.endswith(".m4a"):
            process("characters/cheer/" + name, write)
    for name in sorted(os.listdir(os.path.join(PUBLIC, "sounds"))):
        if name.endswith(".m4a"):
            process("sounds/" + name, write)
    if os.path.exists(os.path.join(PUBLIC, MUSIC_MP3)):
        process(MUSIC_MP3, write, MUSIC_M4A)   # one-time mp3 -> levelled m4a
    else:
        process(MUSIC_M4A, write)


main()
