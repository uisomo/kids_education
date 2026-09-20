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
# than their level suggests.
import math, os, re, struct, subprocess, sys, tempfile

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")

VOICE_TARGET, VOICE_CEILING = -12.0, -1.5     # cheer clips (characters/cheer)
EFFECT_TARGET, EFFECT_CEILING = -18.0, -9.0   # countdown tones, 🪝 の ドン
WINDOW_SEC = 0.4
SKIP_UNDER_DB = 0.5   # already level: leave the file alone rather than re-encode

# The BGM is deliberately left out: it plays through its own gain (BGM_GAIN in
# main.ts / SoundMixer.musicVolume) and is already far under everything else.
def targets(rel):
    return (EFFECT_TARGET, EFFECT_CEILING) if rel.startswith("sounds/") else (VOICE_TARGET, VOICE_CEILING)


def db(v):
    return 20 * math.log10(v) if v > 0 else -99.0


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
    return rate, ch, list(struct.unpack("<%dh" % (len(data) // 2), data))


def write_wav(path, rate, ch, samples):
    data = b"".join(struct.pack("<h", s) for s in samples)
    open(path, "wb").write(
        b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " +
        struct.pack("<IHHIIHH", 16, 1, ch, rate, rate * ch * 2, ch * 2, 16) +
        b"data" + struct.pack("<I", len(data)) + data)


def measure(rate, ch, samples):
    mono = samples if ch == 1 else [sum(samples[i:i + ch]) // ch for i in range(0, len(samples), ch)]
    peak = max(abs(s) for s in samples) / 32768.0
    win = int(WINDOW_SEC * rate)
    if len(mono) > win:
        acc = best = sum(s * s for s in mono[:win])
        for i in range(win, len(mono)):
            acc += mono[i] * mono[i] - mono[i - win] * mono[i - win]
            best = max(best, acc)
        loud = math.sqrt(best / win) / 32768.0
    else:
        loud = math.sqrt(sum(s * s for s in mono) / len(mono)) / 32768.0
    return peak, loud


def source_bitrate(path):
    out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
    m = re.search(r"bit rate: (\d+) bits", out)
    return int(m.group(1)) if m else 64000


def process(path, rel, write):
    tmp = tempfile.mkdtemp()
    raw, gained = os.path.join(tmp, "raw.wav"), os.path.join(tmp, "gained.wav")
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", path, raw], check=True, capture_output=True)
    rate, ch, samples = read_wav(raw)
    peak, loud = measure(rate, ch, samples)
    target, ceiling = targets(rel)
    # Whichever rule asks for less: bring the loudest 400 ms to the target, but
    # never push the peak past the ceiling (a 「ドン」 is all peak and would
    # clip long before its window average got there).
    gain = min(target - db(loud), ceiling - db(peak))
    print(f"{rel:34s} peak {db(peak):6.1f}  loud {db(loud):6.1f}  ->  {gain:+5.1f} dB"
          + ("  (skip)" if abs(gain) < SKIP_UNDER_DB else ""))
    if not write or abs(gain) < SKIP_UNDER_DB:
        return
    factor = 10 ** (gain / 20.0)
    write_wav(gained, rate, ch, [max(-32768, min(32767, int(round(s * factor)))) for s in samples])
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(source_bitrate(path)), gained, path],
                   check=True, capture_output=True)


def main():
    write = "--check" not in sys.argv
    files = [("characters/cheer/" + n) for n in sorted(os.listdir(os.path.join(PUBLIC, "characters", "cheer")))
             if n.endswith(".m4a")]
    files += [("sounds/" + n) for n in sorted(os.listdir(os.path.join(PUBLIC, "sounds"))) if n.endswith(".m4a")]
    for rel in files:
        process(os.path.normpath(os.path.join(PUBLIC, rel)), rel, write)


main()
