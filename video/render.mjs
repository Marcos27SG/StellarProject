// Renders scene.html frame by frame in headless Chrome and encodes with ffmpeg.
//   node render.mjs                       -> out/<lang>/video-<format>.mp4 (silent) + out/<lang>/timeline.json
//   node render.mjs --format portrait     (landscape | portrait | both)
//   node render.mjs --lang en
//   node render.mjs --stills 1.5,7,12     -> PNG frames in out/stills/ (quick visual check)
//   node render.mjs --contact 24          -> one contact sheet of 24 evenly spaced frames
//   node render.mjs --timeline-only       -> just out/<lang>/timeline.json (for mix.py)
// Then run `python mix.py --lang es` to add the voice, music and sound effects.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { serve } from "./serve.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]] : acc), []),
);
const lang = args.lang ?? "es";
const formats = args.format === "both" ? ["landscape", "portrait"] : [args.format ?? "landscape"];
const CHROME = process.env.CHROME ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

const server = await serve(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-gpu-vsync", "--font-render-hinting=none"],
});

try {
  for (const format of formats) {
    const page = await browser.newPage();
    const [w, h] = format === "portrait" ? [1080, 1920] : [1920, 1080];
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
    const name = args.name ? `&name=${encodeURIComponent(args.name)}` : "";
    await page.goto(`http://127.0.0.1:${port}/scene.html?render&format=${format}&lang=${lang}${name}`, { waitUntil: "load" });
    await page.evaluate(() => window.SCENE.ready);
    const tl = await page.evaluate(() => window.SCENE.timeline());
    const shot = (t) => page.evaluate((t) => window.SCENE.renderAt(t), t).then(() => page.screenshot({ type: "png", optimizeForSpeed: true }));

    await mkdir(`out/${lang}`, { recursive: true });
    await writeFile(`out/${lang}/timeline.json`, JSON.stringify(tl, null, 2));
    if (args["timeline-only"]) { console.log(`out/${lang}/timeline.json`); await page.close(); continue; }

    if (args.stills || args.contact) {
      await mkdir("out/stills", { recursive: true });
      const times = args.contact
        ? Array.from({ length: Number(args.contact) }, (_, i) => ((i + 0.5) * tl.total) / Number(args.contact))
        : String(args.stills).split(",").map(Number);
      const files = [];
      for (const t of times) {
        const f = `out/stills/${lang}-${format}-${t.toFixed(2).padStart(5, "0")}.png`;
        await writeFile(f, await shot(t));
        files.push(f);
      }
      if (args.contact) {
        const cols = format === "portrait" ? 8 : 6;
        const out = `out/stills/contact-${lang}-${format}.jpg`;
        await run("ffmpeg", ["-y", "-v", "error", ...files.flatMap((f) => ["-i", f]),
          "-filter_complex", `${files.map((_, i) => `[${i}:v]scale=${format === "portrait" ? 270 : 480}:-1[v${i}]`).join(";")};${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${grid(files.length, cols, format)}`,
          "-frames:v", "1", "-q:v", "3", out]);
        console.log(out);
      } else console.log(files.join("\n"));
      await page.close();
      continue;
    }

    const fps = tl.fps, n = Math.round(tl.total * fps);
    const out = `out/${lang}/video-${format}.mp4`;
    const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      const png = await shot(f / fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 90 === 0) process.stdout.write(`\r${format}: frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    ff.stdin.end();
    await done;
    console.log(`\r${format}: ${n} frames, ${tl.total.toFixed(2)} s -> ${out} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

function grid(n, cols, format) {
  const [cw, ch] = format === "portrait" ? [270, 480] : [480, 270];
  return Array.from({ length: n }, (_, i) => `${(i % cols) * cw}_${Math.floor(i / cols) * ch}`).join("|");
}
function run(cmd, a) {
  if (!a.length) return Promise.resolve();
  return new Promise((res, rej) => spawn(cmd, a, { stdio: "inherit" }).on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`)))));
}
