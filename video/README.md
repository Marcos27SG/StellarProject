# Pacta intro video

The intro video from [docs/VIDEO-PROMPT.md](../docs/VIDEO-PROMPT.md), built in code rather than with an AI video tool. The text, logo and brand colors stay exact, and any change is a quick re-render.

- **Picture:** `scene.js` draws every frame on a canvas as a function of time. `render.mjs` steps through it in headless Chrome and encodes with ffmpeg.
- **Voice:** `voice.py` uses Microsoft's neural TTS (`es-BO-SofiaNeural`, Bolivian Spanish). Each shot is as long as its voiceover line, and the animation lands on key words ("desaparece", "Pacta"…).
- **Sound:** `mix.py` synthesizes a charango-style music bed in a huayño rhythm, plus the sound effects. Nothing is sampled, so nothing needs a license. It also ducks the music under the voice and normalizes to -14 LUFS.

Output goes to `out/` (git-ignored): `out/Pacta-intro-es-16x9.mp4` and `out/Pacta-intro-es-9x16.mp4`.

## Rebuild

Requirements: Node 20, Python 3.12 with `numpy`, `scipy` and `edge-tts`, ffmpeg, and Chrome or Edge.

```bash
npm install                      # puppeteer-core only (uses the installed Chrome)
python voice.py --lang es        # voiceover + word timings -> out/vo/es/
node render.mjs --format both    # frames -> out/es/video-*.mp4 + out/es/timeline.json
python mix.py --lang es          # music, effects, voice -> final MP4s in out/
```

English version: run the same steps with `--lang en`.

## Common changes

- **Preview and scrub:** `node serve.mjs`, then open http://localhost:4599/scene.html. Use `?format=portrait` or `?lang=en` for the other versions. Once `mix.py` has run, the preview plays with sound.
- **Check frames quickly:** `node render.mjs --contact 24` writes a contact sheet to `out/stills/`.
- **A different product name:** `node render.mjs --name Avala --format both`, then `python mix.py --name Avala`. The wordmark is just text.
- **Your own voice (recommended for the final cut):** record `line1.wav` to `line5.wav` (one per line, with the silence trimmed) into `out/vo/es/`. Then run `python voice.py --lang es --measure-only` and the render and mix steps. The shots re-time themselves to your recording. Without word timings, the key moments fall back to proportional positions.
- **Real music:** `python mix.py --no-music` keeps the voice and effects, so you can add a licensed track in CapCut.
- **Copy:** the on-screen text is in `TXT` at the top of `scene.js`. The voiceover lines are in `LINES` in `voice.py`.
