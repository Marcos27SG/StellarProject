"""Generate the scratch voiceover with Microsoft neural TTS (edge-tts).

Writes one WAV per line to out/vo/<lang>/ plus timing.json with each line's
duration and word timings. render.mjs reads timing.json, so the shots follow
the voice (and the animation lands on key words).

To use your own recording instead: record each line as line1.wav ... line5.wav
(trim the silence at both ends), put them in out/vo/<lang>/, and run
`python voice.py --lang es --measure-only`. Without word timings the animation
falls back to proportional sync points.

Usage: python voice.py [--lang es|en] [--voice NAME] [--rate -4%] [--measure-only]
"""
import argparse
import asyncio
import json
import subprocess
import wave
from pathlib import Path

import edge_tts
import numpy as np

LINES = {
    "es": [
        "En Bolivia, los precios cambian cada día.",
        "Pagar por adelantado ayuda a todos… hasta que el vendedor desaparece con tu dinero.",
        "Con Pacta, tu pago espera en un contrato inteligente de Stellar, en dólares.",
        "Si llega tu pedido, el productor cobra. Si no llega, recuperas todo.",
        "De la leche de mañana a tu futuro departamento. Pacta: no es una promesa, es un pacto.",
    ],
    "en": [
        "In Bolivia, prices change every day.",
        "Paying in advance helps everyone… until the seller disappears with your money.",
        "With Pacta, your payment waits in a Stellar smart contract, in dollars.",
        "Delivered? The producer gets paid. Not delivered? You get it all back.",
        "From tomorrow's milk to your future home. Pacta: not a promise, a pact.",
    ],
}
VOICES = {"es": "es-BO-SofiaNeural", "en": "en-US-AvaNeural"}
SR = 48000
ROOT = Path(__file__).parent


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def write_wav(path: Path, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def speech_bounds(x: np.ndarray, thresh_db: float = -45.0) -> tuple[int, int]:
    win = int(0.01 * SR)
    n = len(x) // win
    rms = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    loud = np.where(20 * np.log10(rms) > thresh_db)[0]
    if len(loud) == 0:
        return 0, len(x)
    start = max(0, loud[0] * win - int(0.02 * SR))
    end = min(len(x), (loud[-1] + 1) * win + int(0.06 * SR))
    return start, end


async def synth(text: str, voice: str, rate: str, path: Path) -> list[dict]:
    words = []
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with open(path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7,
                              "d": chunk["duration"] / 1e7})
    return words


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="es", choices=LINES)
    ap.add_argument("--voice")
    ap.add_argument("--rate", default="-4%")
    ap.add_argument("--measure-only", action="store_true")
    args = ap.parse_args()

    out = ROOT / "out" / "vo" / args.lang
    out.mkdir(parents=True, exist_ok=True)
    voice = args.voice or VOICES[args.lang]
    timing = {"lang": args.lang, "voice": None if args.measure_only else voice, "lines": []}
    for i, text in enumerate(LINES[args.lang], 1):
        wav = out / f"line{i}.wav"
        words = []
        if args.measure_only:
            x = decode(wav)
        else:
            raw = out / f"line{i}.raw.mp3"
            words = await synth(text, voice, args.rate, raw)
            x = decode(raw)
            s, e = speech_bounds(x)
            x = x[s:e]
            shift = s / SR
            words = [{**w, "t": round(max(0.0, w["t"] - shift), 3), "d": round(w["d"], 3)} for w in words]
            write_wav(wav, x)
            raw.unlink()
        d = len(x) / SR
        timing["lines"].append({"text": text, "file": wav.name, "duration": round(d, 3), "words": words})
        print(f"line{i}: {d:5.2f}s  {len(words):2d} words")
    (out / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=2), encoding="utf-8")
    print("total spoken:", round(sum(l["duration"] for l in timing["lines"]), 2), "s")


if __name__ == "__main__":
    asyncio.run(main())
