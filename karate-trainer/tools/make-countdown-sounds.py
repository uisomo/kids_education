# Makes the countdown start sounds: a short 「ぷっ」 for 3 / 2 / 1 and a long
# 「ぷーん」 an octave higher for Go!! (race-start style). Plain tones with a
# few odd harmonics for a slightly electronic sound, written as AAC .m4a.
#
#   python3 karate-trainer/tools/make-countdown-sounds.py
#
# Regenerating puts the tones back at this script's own level, which is louder
# than the rest of the app; run tools/normalize-audio.py afterwards to bring
# them back in line with the character voices.
import math, os, subprocess, struct, tempfile, wave

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")

def tone(freq, hold, release, peak=0.55):
    n_attack = int(0.005 * RATE)
    n_hold = int(hold * RATE)
    n_release = int(release * RATE)
    samples = []
    for i in range(n_attack + n_hold + n_release):
        t = i / RATE
        if i < n_attack:
            env = i / n_attack
        elif i < n_attack + n_hold:
            env = 1.0
        else:
            env = math.exp(-5.0 * (i - n_attack - n_hold) / n_release)
        x = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(6 * math.pi * freq * t) + 0.1 * math.sin(10 * math.pi * freq * t)
        samples.append(peak * env * x / 1.35)
    return samples

def write(name, samples):
    fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
    out = os.path.join(OUT, name)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", wav_path, out], check=True)
    os.remove(wav_path)
    print(out)

os.makedirs(OUT, exist_ok=True)
write("countdown-tick.m4a", tone(880, 0.10, 0.05))    # ぷっ
write("countdown-go.m4a", tone(1760, 0.55, 0.45))     # ぷーん
