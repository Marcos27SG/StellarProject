"""Builds the soundtrack and muxes it onto the rendered videos.

Everything is synthesized here (no samples, no licensing): a charango-style
strummed music bed in a huayño rhythm, sound effects on the animation's cues,
and the voiceover from voice.py, with the music ducked under the voice.

Needs out/<lang>/timeline.json (node render.mjs writes it) and out/vo/<lang>/.
Writes out/<lang>/mix.wav and, for each out/<lang>/video-<format>.mp4 that
exists, the final out/Pacta-intro-<lang>-16x9.mp4 / -9x16.mp4.

Usage: python mix.py [--lang es|en] [--no-music] [--music-gain 0.55] [--name Pacta]
"""
import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

SR = 48000
ROOT = Path(__file__).parent
RNG = np.random.default_rng(7)

# ------------------------------------------------------------------ helpers

def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf: np.ndarray, x: np.ndarray, t: float, gain: float = 1.0) -> None:
    i = int(round(t * SR))
    if i >= len(buf) or i + len(x) <= 0:
        return
    a, b = max(0, i), min(len(buf), i + len(x))
    buf[a:b] += gain * x[a - i:b - i]


def env_exp(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / SR / tau)


def onepole_lp(x: np.ndarray, cutoff) -> np.ndarray:
    """One-pole low-pass; cutoff may be a scalar or a per-sample array."""
    cut = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    y = np.empty_like(x)
    z = np.zeros(1)
    for i in range(0, len(x), 128):  # coefficient updated every 128 samples
        a = np.exp(-2 * np.pi * cut[i] / SR)
        y[i:i + 128], z = lfilter([1 - a], [1, -a], x[i:i + 128], zi=z)
    return y


def noise(n: int) -> np.ndarray:
    return RNG.uniform(-1, 1, n)

# ------------------------------------------------------------------ instruments

_pluck_cache: dict = {}


def pluck(m: float, dur: float = 1.5, bright: float = 0.75) -> np.ndarray:
    """Additive plucked string with a doubled, slightly detuned course (charango-like)."""
    key = (m, dur, bright)
    if key in _pluck_cache:
        return _pluck_cache[key]
    f = midi(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for detune, g in ((1.0, 1.0), (1.0035, 0.8)):
        for k in range(1, 15):
            fk = f * detune * k * (1 + 0.00025 * k * k)
            if fk > SR * 0.45:
                break
            ak = (bright ** (k - 1)) / k ** 0.75 * (abs(np.sin(np.pi * k * 0.21)) + 0.05)
            tau = 0.95 / (1 + 0.5 * (k - 1)) * (330 / f) ** 0.3
            y += g * ak * np.sin(2 * np.pi * fk * t + 1.3 * k) * np.exp(-t / tau)
    y *= np.minimum(1, t / 0.0025)
    y[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    y /= np.max(np.abs(y))
    _pluck_cache[key] = y
    return y


def strum(buf, t0, notes, amp, down=True, spread=0.011, bright=0.75, dur=1.3):
    order = notes if down else list(reversed(notes))[:3]
    for i, m in enumerate(order):
        add(buf, pluck(m, dur, bright), t0 + i * spread, amp * (0.8 + 0.2 * RNG.random()) * (1 if down else 0.7))


def kick(gain=1.0, f0=110.0, f1=48.0, dur=0.32) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return gain * np.sin(ph) * np.exp(-t / 0.11) * np.minimum(1, t / 0.002)


def shaker(gain=1.0) -> np.ndarray:
    n = int(0.07 * SR)
    x = np.diff(noise(n + 1))
    return gain * x * np.exp(-np.arange(n) / SR / 0.018) * np.minimum(1, np.arange(n) / (0.006 * SR))


def bass(m: float, dur=0.9, gain=1.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return gain * y * np.exp(-t / 0.35) * np.minimum(1, t / 0.01)


def bell(f: float, dur=2.2, gain=1.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (0.9 / r ** 0.6))
            for r, a in ((1, 1), (2.0, .5), (2.76, .35), (4.07, .2), (5.4, .12)))
    return gain * y * np.minimum(1, t / 0.002) / 2.2

# ------------------------------------------------------------------ music

CH = {
    "G": [62, 67, 71, 74, 79], "D": [62, 66, 69, 74, 78], "Em": [64, 67, 71, 76, 79],
    "C": [60, 64, 67, 72, 76], "Am": [64, 69, 72, 76, 81], "B": [63, 66, 71, 75, 78],
}
ROOTS = {"G": 43, "D": 50, "Em": 52, "C": 48, "Am": 45, "B": 47}
MELODY = {"G": [79, 76, 74, 76], "D": [74, 71, 69, 71], "Em": [71, 74, 76, 79], "C": [76, 74, 72, 71]}
BPM = 100
BEAT = 60 / BPM
BAR = 2 * BEAT  # huayño is in 2/4
# (beat offset, down?, amp): the huayño "long, short-short" strum
HUAYNO = [(0, True, 1.0), (.5, True, .55), (.75, False, .5), (1.0, True, .85), (1.5, True, .55), (1.75, False, .5)]


def music(tl: dict, n: int) -> np.ndarray:
    total = tl["total"]
    s = tl["start"]
    rewind_end = tl["music"]["rewindEnd"]
    sting = tl["music"]["sting"]
    buf = np.zeros(n)
    nbars = int(total / BAR) + 2

    def section(t):
        if t < s[1]:
            return "intro"
        if t < s[2]:
            return "tense"
        if t < rewind_end:
            return "rewind"
        if t < s[3]:
            return "lift"
        if t < s[4]:
            return "main"
        if t < sting - 0.02:
            return "build"
        return "end"

    first_bar = {}
    for b in range(nbars):
        t_bar = b * BAR
        sec = section(t_bar)
        first_bar.setdefault(sec, b)
        rel = b - first_bar[sec]
        prog = {"intro": ["G", "D", "Em", "C"], "lift": ["C", "D", "G", "Em"], "main": ["G", "D", "Em", "C"],
                "build": ["C", "D", "C", "D"], "tense": ["Em", "C", "Am", "B"]}.get(sec)
        chord = prog[rel % 4] if prog else "G"

        for off, down, amp in HUAYNO:
            t = t_bar + off * BEAT
            sec_t = section(t)
            if t >= total or sec_t in ("rewind", "end"):
                continue
            if sec_t == "tense":
                continue
            ramp = 1.0
            if sec_t == "intro":
                ramp = 0.75
            if sec_t == "lift" and rel == 0 and not down:
                continue
            if sec_t == "build":
                ramp = 0.8 + 0.25 * min(1, (t - s[4]) / max(0.1, sting - s[4]))
            strum(buf, t, CH[chord], 0.22 * amp * ramp, down)
        if section(t_bar) in ("intro", "lift", "main", "build"):
            add(buf, bass(ROOTS[chord], 0.9), t_bar, 0.5)
            add(buf, kick(), t_bar, 0.55)
            add(buf, kick(0.6), t_bar + BEAT, 0.5)
            for k in range(4):
                add(buf, shaker(), t_bar + k * BEAT / 2 + BEAT / 4, 0.09 if k % 2 else 0.06)
        if section(t_bar) == "main" or (section(t_bar) == "lift" and rel >= 2):
            for k, m in enumerate(MELODY.get(chord, [])):
                add(buf, pluck(m + 12 if section(t_bar) == "main" else m, 0.9, 0.9), t_bar + k * BEAT / 2, 0.13)
        if section(t_bar) == "tense":
            notes = [71, 67, 64, 63]
            for k, m in enumerate(notes[:2]):
                add(buf, pluck(m, 1.6, 0.45), t_bar + k * BEAT, 0.16)
            add(buf, kick(0.7, 90, 42), t_bar, 0.6)
            add(buf, kick(0.5, 90, 42), t_bar + 0.28, 0.6)

    # tense drone under shot 2
    a, b = int(s[1] * SR), int(min(s[2], rewind_end) * SR)
    t = np.arange(b - a) / SR
    drone = (np.sin(2 * np.pi * midi(40) * t) + .6 * np.sin(2 * np.pi * midi(47) * t + 1) + .3 * np.sin(2 * np.pi * midi(52.1) * t))
    drone *= (0.75 + 0.25 * np.sin(2 * np.pi * 0.9 * t)) * np.minimum(1, t / 0.6) * np.minimum(1, (t[-1] - t) / 0.15)
    buf[a:b] += 0.07 * drone

    # sting on the logo: a big G strum, bell, low hit; then a soft arpeggio until the end
    swell_n = int(0.6 * SR)
    sw = onepole_lp(noise(swell_n), np.linspace(500, 6000, swell_n)) * np.linspace(0, 1, swell_n) ** 2
    add(buf, sw, sting - 0.6, 0.18)
    strum(buf, sting, [55] + CH["G"], 0.4, True, 0.016, 0.85, 2.6)
    add(buf, kick(1.0, 120, 45, 0.6), sting, 0.8)
    add(buf, bell(midi(86), 2.6), sting, 0.22)
    add(buf, bass(43, 2.0), sting, 0.6)
    arp = [79, 74, 71, 67, 74, 71]
    for k in range(12):
        tt = sting + 0.9 + k * BEAT / 2
        if tt > total - 0.3:
            break
        add(buf, pluck(arp[k % len(arp)], 1.4, 0.7), tt, 0.1 * (1 - k / 14))

    # fade the tail
    fade = int(0.5 * SR)
    end = int(total * SR)
    buf[max(0, end - fade):end] *= np.linspace(1, 0, min(fade, end))
    buf[end:] = 0
    return buf / (np.max(np.abs(buf)) + 1e-9)

# ------------------------------------------------------------------ sound effects

def sfx(kind: str) -> np.ndarray:
    def T(d):
        return np.arange(int(d * SR)) / SR
    if kind in ("pop", "star"):
        t = T(0.16)
        f = (500 if kind == "pop" else 900) + (900 if kind == "pop" else 1500) * (1 - np.exp(-t / 0.03))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045) * np.minimum(1, t / 0.002)
    if kind == "tick":
        t = T(0.05)
        return (0.6 * noise(len(t)) * np.exp(-t / 0.004) + np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.01))
    if kind == "coin":
        t = T(0.5)
        f0 = 2400 * (1 + 0.08 * RNG.standard_normal())
        y = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, .12), (1.5, .6, .09), (2.1, .4, .06)))
        y2 = np.zeros_like(y)
        lag = int(0.045 * SR)
        y2[lag:] = 0.6 * y[:-lag]
        return (y + y2) * np.minimum(1, t / 0.001) / 2
    if kind in ("whoosh", "swish", "suck"):
        d = {"whoosh": .45, "swish": .3, "suck": .35}[kind]
        t = T(d)
        sh = np.sin(np.pi * t / d) ** 2
        cut = 300 + 3500 * (np.sin(np.pi * t / d) if kind != "suck" else t / d)
        if kind == "swish":
            cut = cut + 2500
        y = onepole_lp(noise(len(t)), cut)
        y = y - onepole_lp(y, 250)
        return y * sh * 3
    if kind == "poof":
        t = T(0.8)
        y = onepole_lp(noise(len(t)), 900 * np.exp(-t / 0.4) + 200) * np.exp(-t / 0.22) * np.minimum(1, t / 0.008)
        k = kick(1, 160, 50, 0.4)
        return 3 * y + 0.5 * np.pad(k, (0, len(t) - len(k)))
    if kind == "rewind":
        out = np.zeros(int(0.9 * SR))
        for k in range(7):
            t = T(0.11)
            f = 300 + 1700 * (t / 0.11) ** 1.5
            chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.11)
            i = int(k * 0.115 * SR)
            out[i:i + len(chirp)] += chirp[: len(out) - i] * (0.6 + 0.4 * k / 6)
        n = len(out)
        out += 0.25 * onepole_lp(noise(n), 2500) * np.sin(np.pi * np.arange(n) / n)
        return out * 0.6
    if kind == "click":
        t = T(0.12)
        c1 = onepole_lp(noise(len(t)), 5000) * np.exp(-t / 0.004)
        c2 = np.zeros_like(c1)
        lag = int(0.035 * SR)
        c2[lag:] = c1[:-lag] * 0.8
        thunk = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03)
        return 2.5 * (c1 + c2) + 0.6 * thunk
    if kind == "ding":
        a, b = bell(1320, 1.4, 1.0), bell(1760, 1.2, 1.0)
        out = a.copy()
        add(out, b, 0.09, 0.5)
        return out
    if kind == "beep":
        t = T(0.14)
        return 0.5 * np.sign(np.sin(2 * np.pi * 1850 * t)) * np.minimum(1, t / 0.004) * np.minimum(1, (t[-1] - t) / 0.01)
    if kind == "buzz":
        t = T(0.34)
        y = np.sign(np.sin(2 * np.pi * 150 * t)) * ((t < 0.13) | (t > 0.19))
        return 0.35 * onepole_lp(y, 1400) * np.minimum(1, t / 0.005)
    if kind == "thud":
        t = T(0.2)
        return kick(1, 140, 70, 0.2) + 0.4 * onepole_lp(noise(len(t)), 700) * np.exp(-t / 0.03)
    if kind == "sparkle":
        out = np.zeros(int(0.8 * SR))
        for k in range(7):
            b = bell(2000 + 2600 * RNG.random(), 0.5, 1.0)
            i = int(k * 0.06 * SR)
            out[i:i + len(b)] += b[: len(out) - i] * (1 - k / 9)
        return out * 0.5
    if kind == "sting":
        return np.zeros(1)  # carried by the music
    raise ValueError(kind)

# ------------------------------------------------------------------ io

def read_wav(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(float)


def write_wav(path: Path, stereo: np.ndarray) -> None:
    pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.T.copy().tobytes())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="es")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--music-gain", type=float, default=0.55)
    ap.add_argument("--name", default="Pacta")
    args = ap.parse_args()

    tl = json.loads((ROOT / "out" / args.lang / "timeline.json").read_text(encoding="utf-8"))
    total = tl["total"]
    n = int(round(total * SR))

    vo = np.zeros(n)
    active = np.zeros(n)
    timing = json.loads((ROOT / "out" / "vo" / args.lang / "timing.json").read_text(encoding="utf-8"))
    for i, line in enumerate(timing["lines"]):
        x = read_wav(ROOT / "out" / "vo" / args.lang / line["file"])
        x = x / (np.max(np.abs(x)) + 1e-9) * 0.8
        t0 = tl["voStart"][i]
        add(vo, x, t0)
        a, b = int(t0 * SR), min(n, int((t0 + len(x) / SR) * SR))
        active[a:b] = 1

    win = int(0.25 * SR)
    cs = np.concatenate([[0], np.cumsum(active)])
    idx = np.arange(n)
    duck = (cs[np.minimum(n, idx + win // 2)] - cs[np.maximum(0, idx - win // 2)]) / win
    duck_gain = 1 - 0.5 * np.clip(duck * 1.5, 0, 1)

    fx = np.zeros(n)
    for cue in tl["cues"]:
        add(fx, sfx(cue["type"]), cue["t"], 0.22 * cue["gain"])

    mus = np.zeros(n) if args.no_music else music(tl, n) * args.music_gain * duck_gain
    lag = int(0.011 * SR)
    mus_r = np.concatenate([np.zeros(lag), mus[:-lag]])
    left = vo + fx + mus
    right = vo + fx + 0.9 * mus_r + 0.1 * mus
    stereo = np.stack([left, right])
    stereo /= max(1.0, np.max(np.abs(stereo)) / 0.95)

    out_dir = ROOT / "out" / args.lang
    mix_path = out_dir / "mix.wav"
    write_wav(mix_path, stereo)
    print(f"{mix_path}  ({total:.2f} s)")

    for fmt, tag in (("landscape", "16x9"), ("portrait", "9x16")):
        video = out_dir / f"video-{fmt}.mp4"
        if not video.exists():
            continue
        final = ROOT / "out" / f"{args.name}-intro-{args.lang}-{tag}.mp4"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(mix_path),
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
                        "-shortest", "-movflags", "+faststart", str(final)], check=True)
        print(final)


if __name__ == "__main__":
    main()
