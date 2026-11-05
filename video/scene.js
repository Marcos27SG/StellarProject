/* Pacta intro video: every frame is a pure function of time, drawn on a canvas.
 * Preview: node serve.mjs, then open http://localhost:4599/scene.html
 * Query params: format=landscape|portrait, lang=es|en, name=Pacta, render (no UI).
 * Shot lengths follow the voiceover (out/vo/<lang>/timing.json from voice.py). */
'use strict';
(() => {
const Q = new URLSearchParams(location.search);
const PORT = Q.get('format') === 'portrait';
const FORMAT = PORT ? 'portrait' : 'landscape';
const LANG = Q.get('lang') === 'en' ? 'en' : 'es';
const NAME = Q.get('name') || 'Pacta';
const RENDER = Q.has('render');
const FPS = 30;
const W = PORT ? 1080 : 1920;
const H = PORT ? 1920 : 1080;

const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');
if (RENDER) document.body.classList.add('render');

// ---------------------------------------------------------------- palette
const C = {
  bg: '#F7F4EE', ground: '#ECE3D2', ground2: '#E2D6BF', ink: '#1D1913', ink2: '#5B544B', ink3: '#857E73',
  green: '#1E6B47', greenD: '#2C5E45', mint: '#4FB985', greenSoft: '#E3F0E8', leaf: '#4FA868', hill: '#BCD8AB',
  amber: '#C98A0B', amberL: '#F2C14E', amberD: '#9A6A08', white: '#FFFDF8',
  terra: '#C8553D', pink: '#D9577E', purple: '#6B4E9B', blue: '#3A7CA5',
  skin1: '#C68B5E', skin2: '#A86F45', hair: '#2B2118', wood: '#C99561', woodD: '#A8743F',
};

// ---------------------------------------------------------------- copy
const ARROW = { icon: 'arrow' };
const TXT = {
  es: {
    c1: [{ t: 'Precios que cambian cada día' }],
    c2: [{ t: '¿Y si el vendedor desaparece?' }],
    c3: [{ t: 'Tu dinero, ' }, { t: 'protegido', col: C.green, w: 700 }, { t: ' en Stellar' }],
    c4a: [{ icon: 'check' }, { t: 'Entregado', w: 700 }, ARROW, { t: 'cobra el productor' }],
    c4b: [{ icon: 'x' }, { t: 'No entregado', w: 700 }, ARROW, { t: 'reembolso 100%' }],
    tag: ['No es una promesa. ', 'Es un pacto.'],
    built: 'Built on Stellar',
  },
  en: {
    c1: [{ t: 'Prices that change every day' }],
    c2: [{ t: 'What if the seller disappears?' }],
    c3: [{ t: 'Your money, ' }, { t: 'protected', col: C.green, w: 700 }, { t: ' on Stellar' }],
    c4a: [{ icon: 'check' }, { t: 'Delivered', w: 700 }, ARROW, { t: 'the producer gets paid' }],
    c4b: [{ icon: 'x' }, { t: 'Not delivered', w: 700 }, ARROW, { t: '100% refund' }],
    tag: ['Not a promise. ', 'A pact.'],
    built: 'Built on Stellar',
  },
}[LANG];

// Key words the animation lands on: [line index, word, occurrence, fallback fraction of the line].
const SYNC = {
  es: { vanish: [1, 'desaparece', 1, .69], pay: [2, 'pago', 1, .2], stellar: [2, 'stellar', 1, .67], dollars: [2, 'dolares', 1, .85],
        paid: [3, 'productor', 1, .27], split: [3, 'si', 2, .61], refund: [3, 'recuperas', 1, .8],
        milk: [4, 'leche', 1, .03], home: [4, 'departamento', 1, .3], logo: [4, 'pacta', 1, .56], tag: [4, 'no', 1, .67] },
  en: { vanish: [1, 'disappears', 1, .68], pay: [2, 'payment', 1, .25], stellar: [2, 'stellar', 1, .47], dollars: [2, 'dollars', 1, .85],
        paid: [3, 'producer', 1, .2], split: [3, 'not', 1, .51], refund: [3, 'you', 1, .75],
        milk: [4, 'milk', 1, .16], home: [4, 'home', 1, .36], logo: [4, 'pacta', 1, .51], tag: [4, 'not', 1, .7] },
}[LANG];

// ---------------------------------------------------------------- math
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const pulse = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin(PI * (t - t0) / d) : 0);
const E = {
  io: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { if (t <= 0) return 0; if (t >= 1) return 1; const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const lerp2 = (p, q, u) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];
function bez(a, b, h, u) {
  const cx = (a[0] + b[0]) / 2, cy = Math.min(a[1], b[1]) - h, m = 1 - u;
  return [m * m * a[0] + 2 * m * u * cx + u * u * b[0], m * m * a[1] + 2 * m * u * cy + u * u * b[1]];
}
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');

// ---------------------------------------------------------------- timeline
const VO_IN = [0.75, 0.35, 0.95, 0.30, 0.35];
const VO_OUT = [0.55, 0.45, 0.45, 0.55, 1.55];
const MIN_D = [4.2, 5.0, 5.2, 6.3, 7.2];
const DEFAULT_LINES = [2.44, 4.34, 4.33, 5.14, 5.92].map((duration) => ({ duration, words: [] }));
const FLIPS = [1.0, 1.7, 2.25, 2.7, 3.05, 3.35, 3.6, 3.8, 3.97, 4.1];

function wordTime(line, word, occ, frac) {
  let n = 0;
  for (const w of line.words || []) if (norm(w.w) === word && ++n === occ) return w.t;
  return frac * line.duration;
}

function buildTimeline(timing) {
  const lines = timing?.lines?.length === 5 ? timing.lines : DEFAULT_LINES;
  const d = lines.map((l, i) => Math.max(MIN_D[i], VO_IN[i] + l.duration + VO_OUT[i]));
  const start = [0];
  d.forEach((x, i) => start.push(start[i] + x));
  const total = Math.ceil(start[5] * FPS) / FPS;
  const s = {};
  for (const [k, [li, w, occ, frac]] of Object.entries(SYNC)) s[k] = VO_IN[li] + wordTime(lines[li], w, occ, frac);

  const b1 = { flips: FLIPS };
  const b2 = { V: s.vanish, coinT: [.55, .69, .83], ticket: [1.25, 1.7] };
  const P = s.pay;
  const b3coin = [0, 1, 2, 3, 4].map((k) => P - .1 + k * .13);
  const b3 = { iris: [.8, 1.25], P, coinT: b3coin, lastArr: b3coin[4] + .55, stellar: s.stellar, dollars: s.dollars };
  b3.lock = b3.lastArr + .1;
  const D = Math.max(1.75, s.paid - .2);
  const coinOut = [0, 1, 2, 3, 4, 5].map((k) => D + .15 + k * .1);
  const split = Math.max(D + 1.2, s.split);
  const R = Math.max(split + .75, s.refund - .2);
  const coinBack = [0, 1, 2, 3, 4, 5].map((k) => R + .12 + k * .08);
  const b4 = { hops: [.45, .75, 1.05], scan: [1.1, 1.55], check: 1.55, D, coinOut, stars: [0, 1, 2].map((k) => D + .7 + k * .22),
               split, timer: [split + .15, split + .6], xT: split + .6, R, coinBack, badgeT: coinBack[5] + .55 };
  const tm = Math.max(.35, s.milk - .1), th = s.home - .05;
  const step = (th - tm) / 3;
  // The building collapses into a dot just before the logo; keep it on screen at least 0.4 s.
  const C5 = clamp(s.logo - .5, th + .4, th + 1.15);
  const b5 = { items: [tm, tm + step, tm + 2 * step, th], C: C5, L: Math.max(s.logo - .05, C5 + .4), tag: s.tag };
  b5.built = b5.tag + 1.15;
  const voStart = start.slice(0, 5).map((x, i) => x + VO_IN[i]);
  return { fps: FPS, total, d, start, voStart, sync: s, b: [b1, b2, b3, b4, b5], lines: lines.map((l) => l.duration) };
}

let TL = buildTimeline(null);

// ---------------------------------------------------------------- views
// The action lives on a 1200x900 "stage"; a view maps it onto the canvas.
const GROUND = 640;
// Landscape shows stage x -40..1240, y 70..790. Portrait shows x 60..1140 with the ground at y 1300,
// and keeps captions above the action (the bottom of a vertical video sits under the app's UI).
const FULL = PORT ? { s: 1.12, ox: -132, oy: 463, clip: [0, 0, W, H] } : { s: 1.5, ox: 60, oy: -105, clip: [0, 0, W, H] };
const FULL5 = PORT ? { ...FULL, oy: 445 } : FULL;
const CAP = PORT ? { x: 540, y: 340, size: 54, maxW: 960 } : { x: 960, y: 962, size: 50, maxW: 1500 };
// Vertical video has room above the stall, so the coin and chart move up there.
const COIN = PORT ? [320, 64] : [140, 400];
const CHART = PORT ? [880, 62] : [1062, 340];
const COW_X = PORT ? 150 : 90;
const SPLIT_A = PORT ? { s: 1, ox: -60, oy: 200, clip: [0, 0, 1080, 960], chipY: 40 } : { s: 1, ox: -110, oy: 220, clip: [0, 0, 960, 1080], chipY: 755 };
const SPLIT_B = PORT ? { s: 1, ox: -60, oy: 1160, clip: [0, 960, 1080, 960], chipY: 40 } : { s: 1, ox: 850, oy: 220, clip: [960, 0, 960, 1080], chipY: 755 };
const lerpView = (a, b, u) => ({ ...b, s: lerp(a.s, b.s, u), ox: lerp(a.ox, b.ox, u), oy: lerp(a.oy, b.oy, u), clip: a.clip.map((x, i) => lerp(x, b.clip[i], u)) });
const shift = (v, dx, dy) => ({ ...v, ox: v.ox + dx, oy: v.oy + dy, clip: [v.clip[0] + dx, v.clip[1] + dy, v.clip[2], v.clip[3]] });
const ext = (v) => ({ x0: (v.clip[0] - v.ox) / v.s, x1: (v.clip[0] + v.clip[2] - v.ox) / v.s, y0: (v.clip[1] - v.oy) / v.s, y1: (v.clip[1] + v.clip[3] - v.oy) / v.s });
const toCanvas = (v, x, y) => [v.ox + x * v.s, v.oy + y * v.s];
function inView(c, v, fn) {
  c.save();
  c.beginPath(); c.rect(...v.clip); c.clip();
  c.translate(v.ox, v.oy); c.scale(v.s, v.s);
  fn();
  c.restore();
}

// ---------------------------------------------------------------- primitives
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); }
function fs(c, fill, lw = 4) {
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
// Outline only the outside of overlapping shapes: thick stroke first, fill on top.
function outlined(c, fill, lw = 4) {
  c.lineWidth = lw * 2; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.stroke();
  c.fillStyle = fill; c.fill();
}
function blob(c, list) { c.beginPath(); for (const [x, y, r] of list) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); } }
function line(c, pts, col, lw) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}

// Bolivian aguayo-style band: stripes around a row of diamonds.
function aguayoBand(c, x, y, w, h, phase = 0) {
  const rows = h < 40
    ? [[C.terra, .2], [C.amberL, .12], ['D', .36], [C.amberL, .12], [C.terra, .2]]
    : [[C.terra, .14], [C.amberL, .07], [C.green, .13], [C.pink, .07], ['D', .18], [C.pink, .07], [C.green, .13], [C.amberL, .07], [C.terra, .14]];
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  let yy = y;
  for (const [col, p] of rows) {
    const hh = p * h;
    if (col === 'D') {
      c.fillStyle = C.purple; c.fillRect(x, yy, w, hh + .5);
      const step = hh * 1.25, r = hh * .42;
      let k = 0;
      for (let xx = x - step + ((phase * step) % step); xx < x + w + step; xx += step, k++) {
        c.beginPath(); c.moveTo(xx, yy + hh / 2 - r); c.lineTo(xx + r, yy + hh / 2); c.lineTo(xx, yy + hh / 2 + r); c.lineTo(xx - r, yy + hh / 2); c.closePath();
        c.fillStyle = k % 2 ? C.amberL : '#FFFFFF'; c.fill();
      }
    } else { c.fillStyle = col; c.fillRect(x, yy, w, hh + .5); }
    yy += hh;
  }
  c.restore();
}

// ---------------------------------------------------------------- backdrop
function cloud(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  blob(c, [[-42, 8, 28], [0, -10, 40], [44, 6, 30]]); c.fillStyle = '#FFFFFF'; c.fill();
  rr(c, -72, 4, 146, 34, 17); c.fill();
  c.restore();
}
function backdrop(c, v, t, o = {}) {
  const e = ext(v);
  c.fillStyle = C.bg; c.fillRect(e.x0 - 2, e.y0 - 2, e.x1 - e.x0 + 4, e.y1 - e.y0 + 4);
  if (o.sun !== false) { circ(c, 1050, 128, 44); c.fillStyle = '#F6DFA2'; c.fill(); }
  for (const [x, y, s] of [[170, 150, 1], [760, 128, .8], [-160, 205, .9], [1330, 190, .75]]) cloud(c, x + t * 9 * s, y, s);
  if (o.hills) {
    c.save(); c.beginPath(); c.rect(e.x0 - 2, -2000, e.x1 - e.x0 + 4, 2000 + GROUND); c.clip();
    ell(c, 760, GROUND + 40, 520, 150); c.fillStyle = '#E4EADA'; c.fill();
    ell(c, 1250, GROUND + 60, 460, 170); c.fillStyle = '#E8EDDF'; c.fill();
    c.restore();
  }
  if (o.ground !== false) {
    c.fillStyle = C.ground; c.fillRect(e.x0 - 2, GROUND, e.x1 - e.x0 + 4, e.y1 - GROUND + 2);
    c.fillStyle = C.ground2; c.fillRect(e.x0 - 2, GROUND, e.x1 - e.x0 + 4, 10);
  }
}

// ---------------------------------------------------------------- characters
// Feet at (x, y); facing +x when face = 1. Hands are in local coords (forward = +x).
function person(c, o) {
  const s = o.s ?? 1, f = o.face ?? 1;
  if (s <= 0 || o.alpha === 0) return;
  const skin = o.skin ?? C.skin1;
  c.save();
  c.translate(o.x, o.y - (o.jump || 0));
  c.scale(s * f, s);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  limb(c, [-38, -212], o.handB ?? [-50, -118], o.shirt, skin);
  if (o.skirt) {
    rr(c, -28, -42, 18, 40, 6); fs(c, skin, 4); rr(c, 10, -42, 18, 40, 6); fs(c, skin, 4);
    ell(c, -18, -4, 18, 8); fs(c, C.ink, 0); ell(c, 22, -4, 18, 8); fs(c, C.ink, 0);
    c.beginPath(); c.moveTo(-46, -132); c.lineTo(46, -132); c.quadraticCurveTo(70, -80, 86, -36); c.quadraticCurveTo(0, -16, -86, -36); c.quadraticCurveTo(-70, -80, -46, -132); c.closePath();
    fs(c, o.skirt, 4);
    c.strokeStyle = 'rgba(29,25,19,.3)'; c.lineWidth = 3;
    for (const px of [-44, -15, 15, 44]) { c.beginPath(); c.moveTo(px * .55, -126); c.lineTo(px, -34); c.stroke(); }
  } else {
    rr(c, -36, -124, 32, 120, 12); fs(c, o.pants ?? C.ink2, 4);
    rr(c, 4, -124, 32, 120, 12); fs(c, o.pants ?? C.ink2, 4);
    ell(c, -18, -5, 22, 9); fs(c, C.ink, 0); ell(c, 26, -5, 22, 9); fs(c, C.ink, 0);
  }
  c.beginPath(); c.moveTo(-44, -232); c.lineTo(44, -232); c.quadraticCurveTo(58, -232, 60, -216); c.lineTo(64, -126);
  c.quadraticCurveTo(64, -110, 48, -110); c.lineTo(-48, -110); c.quadraticCurveTo(-64, -110, -64, -126); c.lineTo(-60, -216); c.quadraticCurveTo(-58, -232, -44, -232); c.closePath();
  fs(c, o.shirt, 4);
  if (o.shawl) {
    const shawl = () => { c.beginPath(); c.moveTo(-62, -228); c.lineTo(62, -228); c.lineTo(36, -168); c.lineTo(0, -150); c.lineTo(-36, -168); c.closePath(); };
    c.save(); shawl(); c.clip(); aguayoBand(c, -70, -232, 140, 86); c.restore();
    shawl(); fs(c, null, 4);
  }
  rr(c, -12, -252, 24, 24, 6); fs(c, skin, 4);
  if (o.hair === 'braids') {
    for (const bx of [-30, 32]) {
      line(c, [[bx, -262], [bx + 4, -200], [bx, -150]], C.ink, 20);
      line(c, [[bx, -262], [bx + 4, -200], [bx, -150]], C.hair, 12);
      circ(c, bx, -150, 7); fs(c, C.pink, 3);
    }
  }
  if (o.hair === 'ponytail') { ell(c, -52, -282, 16, 28, .5); fs(c, C.hair, 4); }
  circ(c, 0, -276, 44); fs(c, skin, 4);
  c.save(); circ(c, 0, -276, 44); c.clip();
  ell(c, -8, -318, 62, 30); c.fillStyle = C.hair; c.fill();
  c.restore();
  circ(c, 0, -276, 44); fs(c, null, 4);
  const eo = 8;
  if (o.blink) { line(c, [[eo - 18, -276], [eo - 7, -276]], C.ink, 4); line(c, [[eo + 10, -276], [eo + 21, -276]], C.ink, 4); }
  else { circ(c, eo - 12, -276, 5); c.fillStyle = C.ink; c.fill(); circ(c, eo + 16, -276, 5); c.fill(); }
  if (o.brows === 'worried') { line(c, [[eo - 20, -292], [eo - 6, -297]], C.ink, 4); line(c, [[eo + 8, -297], [eo + 23, -292]], C.ink, 4); }
  c.fillStyle = 'rgba(217,87,126,.28)'; circ(c, eo - 20, -260, 7); c.fill(); circ(c, eo + 26, -260, 7); c.fill();
  mouth(c, eo + 2, o.mouth ?? 'smile');
  if (o.hat === 'bombin') {
    c.beginPath(); c.ellipse(4, -322, 27, 26, 0, PI, 0); c.closePath(); fs(c, '#3B2F28', 4);
    rr(c, -22, -330, 52, 7, 3); c.fillStyle = C.amber; c.fill();
    ell(c, 4, -321, 40, 7); fs(c, '#3B2F28', 4);
  } else if (o.hat === 'straw') {
    ell(c, 4, -312, 78, 14); fs(c, C.amberL, 4);
    rr(c, -26, -354, 62, 46, [20, 20, 4, 4]); fs(c, C.amberL, 4);
    rr(c, -26, -324, 62, 9, 2); c.fillStyle = C.green; c.fill();
    ell(c, 4, -312, 78, 14); fs(c, null, 0);
  } else if (o.hat === 'cap') {
    c.beginPath(); c.arc(0, -294, 46, PI, 0); c.closePath(); fs(c, o.capColor ?? C.ink2, 4);
    ell(c, 46, -296, 32, 9); fs(c, o.capColor ?? C.ink2, 4);
  }
  limb(c, [40, -212], o.handF ?? [50, -118], o.shirt, skin);
  c.restore();
}
function limb(c, sh, hand, shirt, skin) {
  line(c, [sh, hand], C.ink, 28);
  line(c, [sh, hand], shirt, 20);
  circ(c, hand[0], hand[1], 13); fs(c, skin, 4);
}
function mouth(c, x, kind) {
  c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round';
  if (kind === 'smile') { c.beginPath(); c.arc(x, -262, 12, .15 * PI, .85 * PI); c.stroke(); }
  else if (kind === 'grin') { c.beginPath(); c.moveTo(x - 14, -256); c.quadraticCurveTo(x, -234, x + 14, -256); c.closePath(); fs(c, C.ink, 3); }
  else if (kind === 'sad') { c.beginPath(); c.arc(x, -242, 11, 1.2 * PI, 1.8 * PI); c.stroke(); }
  else if (kind === 'o') { ell(c, x, -252, 6, 8); c.fillStyle = C.ink; c.fill(); }
  else { line(c, [[x - 9, -254], [x + 9, -254]], C.ink, 4); }
}
const handAt = (o, h) => [o.x + (o.face ?? 1) * h[0] * (o.s ?? 1), o.y - (o.jump || 0) + h[1] * (o.s ?? 1)];

function cow(c, x, y, s) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  for (const lx of [-62, -36, 36, 60]) { rr(c, lx - 10, -56, 20, 54, 6); fs(c, '#FFFFFF', 4); rr(c, lx - 10, -12, 20, 12, 4); fs(c, C.ink, 0); }
  line(c, [[-86, -108], [-104, -84], [-100, -56]], C.ink, 5);
  circ(c, -100, -54, 7); fs(c, C.ink, 0);
  rr(c, -90, -132, 180, 90, 42); fs(c, '#FFFFFF', 4);
  c.save(); rr(c, -90, -132, 180, 90, 42); c.clip();
  c.fillStyle = C.hair;
  blob(c, [[-50, -116, 22], [-30, -96, 14], [20, -128, 20], [44, -70, 18]]); c.fill();
  c.restore();
  ell(c, 8, -40, 18, 9); fs(c, '#E8A5A0', 3);
  ell(c, 70, -160, 16, 8, -.5); fs(c, '#FFFFFF', 4);
  line(c, [[86, -178], [80, -196]], C.ink, 9); line(c, [[86, -178], [80, -196]], C.amberL, 4);
  rr(c, 68, -176, 62, 74, 28); fs(c, '#FFFFFF', 4);
  ell(c, 108, -114, 28, 19); fs(c, '#E8A5A0', 4);
  circ(c, 100, -116, 3.5); c.fillStyle = C.ink; c.fill(); circ(c, 116, -116, 3.5); c.fill();
  circ(c, 94, -150, 5); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- props
function coin(c, x, y, r, spin = 1, label) {
  if (r <= 0) return;
  c.save(); c.translate(x, y); c.scale(Math.max(.1, Math.abs(spin)), 1);
  circ(c, 0, 0, r); fs(c, C.amber, Math.max(3, r * .09));
  circ(c, 0, 0, r * .72); c.strokeStyle = C.amberL; c.lineWidth = r * .1; c.stroke();
  c.beginPath(); c.arc(0, 0, r * .52, -2.7, -1.7); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = r * .12; c.lineCap = 'round'; c.stroke();
  if (label) {
    c.font = `800 ${r * .62}px Geist`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = C.amberD; c.fillText(label, 0, r * .04);
  }
  c.restore();
}
function bottlePath(c) {
  c.beginPath(); c.moveTo(-14, -92); c.lineTo(14, -92); c.lineTo(14, -78); c.quadraticCurveTo(26, -70, 26, -56); c.lineTo(26, -8);
  c.quadraticCurveTo(26, 0, 18, 0); c.lineTo(-18, 0); c.quadraticCurveTo(-26, 0, -26, -8); c.lineTo(-26, -56); c.quadraticCurveTo(-26, -70, -14, -78); c.closePath();
}
function milk(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  bottlePath(c); c.fillStyle = '#FFFFFF'; c.fill();
  c.save(); bottlePath(c); c.clip(); c.fillStyle = C.green; c.fillRect(-30, -48, 60, 24); circ(c, 0, -36, 6); c.fillStyle = '#FFFFFF'; c.fill(); c.restore();
  bottlePath(c); fs(c, null, 4);
  line(c, [[-15, -60], [-15, -24]], 'rgba(29,25,19,.12)', 5);
  rr(c, -17, -104, 34, 14, 5); fs(c, C.green, 4);
  c.restore();
}
function eggs(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  for (const ex of [-22, 22]) { ell(c, ex, -54, 17, 21); fs(c, '#F3E1C4', 4); }
  for (const ex of [-44, 0, 44]) { ell(c, ex, -42, 18, 23); fs(c, '#FBF1DF', 4); }
  c.beginPath(); c.moveTo(-70, -30); c.lineTo(70, -30); c.lineTo(62, 0); c.lineTo(-62, 0); c.closePath(); fs(c, '#D9C3A0', 4);
  for (const lx of [-22, 22]) line(c, [[lx, -24], [lx, -6]], 'rgba(29,25,19,.3)', 3);
  c.restore();
}
function tomato(c, x, y, r) {
  circ(c, x, y, r); fs(c, '#D9483B', 4);
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr_ = i % 2 ? r * .14 : r * .4; c.lineTo(x + Math.cos(a) * rr_, y - r * .78 + Math.sin(a) * rr_ * .7); }
  c.closePath(); fs(c, C.leaf, 2.5);
}
function carrot(c, x, y, rot, s = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  line(c, [[-34, 0], [-50, -10]], C.leaf, 6); line(c, [[-34, 0], [-52, 4]], C.leaf, 6);
  c.beginPath(); c.moveTo(-36, -12); c.quadraticCurveTo(-40, 0, -36, 12); c.lineTo(36, 2); c.lineTo(36, -2); c.closePath(); fs(c, '#E8862E', 4);
  c.restore();
}
function veg(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  blob(c, [[-46, -40, 30], [-20, -54, 28], [-62, -26, 22], [-26, -28, 24]]); outlined(c, '#6DB35A', 4);
  carrot(c, 10, -16, -.18);
  tomato(c, 26, -26, 25); tomato(c, 62, -22, 22);
  c.restore();
}
function basket(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  blob(c, [[-40, -86, 30], [-16, -98, 26], [-58, -74, 20]]); outlined(c, '#6DB35A', 4);
  carrot(c, 40, -104, -1.0, .9);
  tomato(c, 10, -86, 22); tomato(c, 46, -80, 18);
  c.beginPath(); c.arc(0, -72, 72, PI, 0); c.strokeStyle = C.ink; c.lineWidth = 16; c.stroke(); c.strokeStyle = '#B57F1F'; c.lineWidth = 9; c.stroke();
  const body = () => { c.beginPath(); c.moveTo(-84, -74); c.lineTo(84, -74); c.lineTo(64, 0); c.lineTo(-64, 0); c.closePath(); };
  body(); c.fillStyle = '#D9A441'; c.fill();
  c.save(); body(); c.clip();
  for (const ly of [-54, -34, -14]) line(c, [[-90, ly], [90, ly]], '#B57F1F', 4);
  for (let lx = -90; lx < 100; lx += 22) line(c, [[lx, -80], [lx - 10, 4]], 'rgba(154,106,8,.55)', 3);
  c.restore();
  body(); fs(c, null, 4);
  rr(c, -90, -82, 180, 16, 8); fs(c, '#B57F1F', 4);
  c.restore();
}
function building(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  rr(c, 100, -386, 14, 386, 3); fs(c, C.amber, 4);
  rr(c, 20, -398, 170, 13, 4); fs(c, C.amber, 4);
  line(c, [[48, -386], [48, -342]], C.ink, 3);
  c.beginPath(); c.arc(48, -336, 7, -.2, PI + .2, false); c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
  rr(c, -84, -320, 168, 320, 14); fs(c, C.white, 4);
  rr(c, -92, -336, 184, 26, 8); fs(c, C.green, 4);
  const lit = [1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { rr(c, -62 + j * 44, -294 + i * 46, 32, 32, 6); fs(c, lit[i * 3 + j] ? C.amberL : '#DCE8DA', 3); }
  rr(c, -22, -54, 44, 54, [14, 14, 0, 0]); fs(c, C.green, 4);
  c.restore();
}
function ticket(c, x, y, s, rot, empty = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  const w = 75, h = 44, r = 10, n = 12;
  c.beginPath(); c.moveTo(-w + r, -h); c.lineTo(w - r, -h); c.quadraticCurveTo(w, -h, w, -h + r); c.lineTo(w, -n); c.arc(w, 0, n, -PI / 2, PI / 2, true);
  c.lineTo(w, h - r); c.quadraticCurveTo(w, h, w - r, h); c.lineTo(-w + r, h); c.quadraticCurveTo(-w, h, -w, h - r); c.lineTo(-w, n); c.arc(-w, 0, n, PI / 2, -PI / 2, true);
  c.lineTo(-w, -h + r); c.quadraticCurveTo(-w, -h, -w + r, -h); c.closePath();
  fs(c, '#FFFFFF', 4);
  c.setLineDash([6, 6]); line(c, [[28, -34], [28, 34]], C.ink3, 3); c.setLineDash([]);
  for (const ly of [-14, 0, 14]) line(c, [[42, ly], [58, ly]], C.ink3, 4);
  if (empty < 1) { c.save(); c.globalAlpha *= 1 - empty; milk(c, -22, 34, .62); c.restore(); }
  if (empty > 0) {
    c.save(); c.globalAlpha *= empty; c.setLineDash([5, 6]);
    rr(c, -40, -26, 36, 54, 8); c.strokeStyle = C.ink3; c.lineWidth = 3; c.stroke();
    c.setLineDash([]); c.restore();
  }
  c.restore();
}
function crate(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  milk(c, -30, -40, .52); milk(c, 0, -44, .52); milk(c, 30, -40, .52);
  rr(c, -60, -62, 120, 62, 8); fs(c, C.wood, 4);
  for (const ly of [-42, -22]) line(c, [[-56, ly], [-4, ly]], 'rgba(29,25,19,.3)', 3);
  rr(c, 8, -56, 44, 44, 5); fs(c, '#FFFFFF', 3);
  qr(c, 30, -34, 34);
  c.restore();
}
const QRBITS = (() => { const r = mulberry(11); return Array.from({ length: 121 }, () => r() > .5); })();
function qr(c, x, y, size) {
  const n = 11, cs = size / n;
  c.save(); c.translate(x - size / 2, y - size / 2); c.fillStyle = C.ink;
  const finder = (i, j) => (i < 3 && j < 3) || (i < 3 && j >= n - 3) || (i >= n - 3 && j < 3);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!finder(i, j) && QRBITS[i * n + j]) c.fillRect(j * cs, i * cs, cs + .4, cs + .4);
  for (const [fi, fj] of [[0, 0], [0, n - 3], [n - 3, 0]]) {
    c.fillStyle = C.ink; c.fillRect(fj * cs, fi * cs, cs * 3, cs * 3);
    c.fillStyle = '#FFFFFF'; c.fillRect(fj * cs + cs * .55, fi * cs + cs * .55, cs * 1.9, cs * 1.9);
    c.fillStyle = C.ink; c.fillRect(fj * cs + cs, fi * cs + cs, cs, cs);
  }
  c.restore();
}
function phone(c, x, y, s, rot, scanning) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  rr(c, -24, -42, 48, 84, 11); fs(c, C.ink, 0);
  rr(c, -19, -34, 38, 64, 6); c.fillStyle = C.greenSoft; c.fill();
  c.strokeStyle = C.green; c.lineWidth = 3;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.beginPath(); c.moveTo(sx * 12, sy * 12 - 2 - sy * 7); c.lineTo(sx * 12, sy * 12 - 2); c.lineTo(sx * 12 - sx * 7, sy * 12 - 2); c.stroke();
  }
  if (scanning) { const yy = -14 + 24 * ((scanning * 2.5) % 1); line(c, [[-12, yy], [12, yy]], C.mint, 3); }
  c.restore();
}
function bubble(c, x, y, s, kind) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  circ(c, 0, 0, 34); fs(c, kind === 'check' ? C.green : C.terra, 4);
  c.strokeStyle = '#FFFFFF'; c.lineWidth = 8; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  if (kind === 'check') { c.moveTo(-14, 1); c.lineTo(-4, 12); c.lineTo(16, -12); }
  else { c.moveTo(-11, -11); c.lineTo(11, 11); c.moveTo(11, -11); c.lineTo(-11, 11); }
  c.stroke(); c.restore();
}
function star(c, x, y, R, s = 1, rot = 0) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? R * .48 : R, a = -PI / 2 + i * PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath(); fs(c, C.amberL, 4); c.restore();
}
function sparkle(c, x, y, s, col = C.amberL) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(2, -2, 16, 0); c.quadraticCurveTo(2, 2, 0, 16); c.quadraticCurveTo(-2, 2, -16, 0); c.quadraticCurveTo(-2, -2, 0, -16);
  c.fillStyle = col; c.fill(); c.restore();
}
function timer(c, x, y, p, s) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  rr(c, -9, -50, 18, 12, 4); fs(c, C.ink2, 3);
  circ(c, 0, 0, 38); fs(c, '#FFFFFF', 4);
  if (p > 0) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 30, -PI / 2, -PI / 2 + TAU * p); c.closePath(); c.fillStyle = C.amberL; c.fill(); }
  const a = -PI / 2 + TAU * p; line(c, [[0, 0], [Math.cos(a) * 26, Math.sin(a) * 26]], C.ink, 4);
  c.restore();
}
function badge(c, x, y, s, text) {
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  c.font = '800 36px Geist'; const w = c.measureText(text).width + 44;
  rr(c, -w / 2, -30, w, 60, 30); fs(c, C.green, 4);
  c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, 2);
  c.restore();
}
function puff(c, x, y, p, s = 1) {
  if (p <= 0 || p >= 1) return;
  const g = E.out(p);
  c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha *= 1 - E.in(p);
  const pts = [[0, 0, 46], [-52, 10, 34], [50, 8, 36], [-24, -38, 32], [28, -36, 34], [-62, -24, 24], [64, -22, 24], [0, 32, 30]];
  c.beginPath();
  for (const [px, py, r] of pts) { const R = r * (.45 + .9 * g), X = px * (.5 + g), Y = py * (.5 + g) - 30 * g; c.moveTo(X + R, Y); c.arc(X, Y, R, 0, TAU); }
  outlined(c, '#E6E0D6', 4);
  c.restore();
}
function ring(c, x, y, p, R, col = C.mint) {
  if (p <= 0 || p >= 1) return;
  circ(c, x, y, R * E.out(p)); c.strokeStyle = col; c.globalAlpha *= 1 - p; c.lineWidth = 8 * (1 - p) + 1; c.stroke(); c.globalAlpha /= Math.max(1e-3, 1 - p);
}

// ---------------------------------------------------------------- vault
function vault(c, x, y, o) {
  const s = o.s ?? 1;
  if (s <= 0) return;
  c.save(); c.translate(x, y); c.scale(s, s);
  if (o.glow > 0) {
    const g = c.createRadialGradient(0, 20, 30, 0, 20, 250);
    g.addColorStop(0, `rgba(79,185,133,${(.5 * o.glow).toFixed(3)})`); g.addColorStop(1, 'rgba(79,185,133,0)');
    c.fillStyle = g; c.fillRect(-260, -230, 520, 520);
  }
  const sq = o.gulp ?? 0; c.scale(1 + .07 * sq, 1 - .06 * sq);
  const op = o.open ?? 0;
  c.save(); c.translate(0, -30 * op); c.translate(58, -62); c.rotate(.45 * op); c.translate(-58, 62);
  c.beginPath(); c.moveTo(-58, -40); c.lineTo(-58, -112); c.arc(0, -112, 58, PI, 0); c.lineTo(58, -40);
  c.lineCap = 'round'; c.strokeStyle = C.ink; c.lineWidth = 34; c.stroke(); c.strokeStyle = C.greenD; c.lineWidth = 24; c.stroke();
  c.beginPath(); c.arc(0, -112, 58, PI * 1.12, PI * 1.42); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 6; c.stroke();
  c.restore();
  rr(c, -104, -66, 208, 176, 34); fs(c, C.green, 5);
  rr(c, -88, -54, 176, 22, 11); c.fillStyle = 'rgba(255,255,255,.13)'; c.fill();
  rr(c, -36, -48, 72, 12, 6); c.fillStyle = C.ink; c.fill();
  circ(c, 0, 32, 48); fs(c, '#F2EBDD', 4);
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; line(c, [[Math.cos(a) * 37, 32 + Math.sin(a) * 37], [Math.cos(a) * 43, 32 + Math.sin(a) * 43]], C.ink3, 3); }
  circ(c, 0, 32, 28); fs(c, C.amberL, 4);
  circ(c, 0, 26, 7); c.fillStyle = C.ink; c.fill();
  c.beginPath(); c.moveTo(-4, 28); c.lineTo(4, 28); c.lineTo(7, 44); c.lineTo(-7, 44); c.closePath(); c.fill();
  for (const [rx, ry] of [[-86, -44], [86, -44], [-86, 92], [86, 92]]) { circ(c, rx, ry, 5); c.fillStyle = C.greenD; c.fill(); }
  if (o.usdc > 0) {
    c.save(); c.translate(96, -10); c.rotate(o.tagSwing ?? 0);
    line(c, [[0, 0], [22, 52]], C.ink2, 3);
    c.translate(22, 52); c.scale(o.usdc, o.usdc);
    rr(c, -8, 0, 96, 42, 10); fs(c, '#FFFFFF', 4);
    circ(c, 4, 21, 4); c.fillStyle = C.ink3; c.fill();
    c.font = '800 24px Geist'; c.fillStyle = C.green; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('USDC', 14, 23);
    c.restore();
  }
  c.restore();
}
function orbit(c, x, y, prog, t, bright, half) {
  if (prog <= 0) return;
  const rx = 228, ry = 64;
  c.save(); c.translate(x, y); c.rotate(-.16);
  const a0 = half === 'back' ? PI : 0;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a0 + PI * prog);
  c.lineCap = 'round'; c.strokeStyle = C.mint; c.lineWidth = 6 + 4 * bright;
  if (bright > 0) { c.shadowColor = 'rgba(79,185,133,.95)'; c.shadowBlur = 26 * bright; }
  c.stroke(); c.shadowBlur = 0;
  const th = t * 1.5 + .4, sx = Math.cos(th) * rx, sy = Math.sin(th) * ry;
  if (prog >= 1 && (Math.sin(th) < 0) === (half === 'back')) { circ(c, sx, sy, 10); fs(c, C.amberL, 3); }
  c.restore();
}

// ---------------------------------------------------------------- captions
function measureParts(c, parts, size) {
  let w = 0;
  for (const p of parts) {
    if (p.icon) w += size * (p.icon === 'arrow' ? 1.5 : 1.3);
    else { c.font = `${p.w || 600} ${size}px Geist`; w += c.measureText(p.t).width; }
  }
  return w;
}
function icon(c, kind, x, y, s) {
  if (kind === 'arrow') {
    line(c, [[x - s * .42, y], [x + s * .4, y]], C.ink2, s * .12);
    line(c, [[x + s * .12, y - s * .28], [x + s * .42, y], [x + s * .12, y + s * .28]], C.ink2, s * .12);
    return;
  }
  circ(c, x, y, s * .46); c.fillStyle = kind === 'check' ? C.green : C.terra; c.fill();
  c.strokeStyle = '#FFFFFF'; c.lineWidth = s * .1; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  if (kind === 'check') { c.moveTo(x - s * .2, y + s * .01); c.lineTo(x - s * .06, y + s * .16); c.lineTo(x + s * .22, y - s * .16); }
  else { c.moveTo(x - s * .15, y - s * .15); c.lineTo(x + s * .15, y + s * .15); c.moveTo(x + s * .15, y - s * .15); c.lineTo(x - s * .15, y + s * .15); }
  c.stroke();
}
function pill(c, cx, cy, parts, size, a, maxW = 1e9) {
  if (a <= 0) return;
  let fsz = size, tw = measureParts(c, parts, fsz);
  if (tw > maxW) { fsz *= maxW / tw; tw = maxW; }
  const padX = fsz * .8, h = fsz * 1.9, w = tw + padX * 2, e = E.out(clamp(a));
  c.save();
  c.globalAlpha *= clamp(a * 1.6);
  c.translate(cx, cy + (1 - e) * fsz * .7); c.scale(.94 + .06 * e, .94 + .06 * e);
  rr(c, -w / 2, -h / 2 + fsz * .16, w, h, h / 2); c.fillStyle = 'rgba(29,25,19,.14)'; c.fill();
  rr(c, -w / 2, -h / 2, w, h, h / 2); c.fillStyle = '#FFFFFF'; c.fill(); c.lineWidth = Math.max(2, fsz * .06); c.strokeStyle = C.ink; c.stroke();
  let x = -tw / 2;
  c.textBaseline = 'middle'; c.textAlign = 'left';
  for (const p of parts) {
    if (p.icon) {
      const adv = fsz * (p.icon === 'arrow' ? 1.5 : 1.3);
      icon(c, p.icon, p.icon === 'arrow' ? x + adv / 2 : x + fsz * .5, 0, fsz);
      x += adv;
    } else {
      c.font = `${p.w || 600} ${fsz}px Geist`; c.fillStyle = p.col ?? C.ink; c.fillText(p.t, x, fsz * .05);
      x += c.measureText(p.t).width;
    }
  }
  c.restore();
}
function caption(c, parts, t, tin, tout) {
  const a = seg(t, tin, tin + .4), o = 1 - seg(t, tout, tout + .25);
  if (a <= 0 || o <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = o;
  pill(c, CAP.x, CAP.y, parts, CAP.size, a, CAP.maxW);
  c.restore();
}

// ---------------------------------------------------------------- shot 1: the market, prices climbing
const PRICES = [[6, 7, 8, 9, 10, 12, 13, 15, 17, 18, 20], [12, 13, 15, 16, 18, 20, 23, 25, 28, 30, 32], [5, 6, 7, 9, 10, 11, 13, 15, 16, 18, 21]];
function shot1(c, v, t) {
  inView(c, v, () => {
    backdrop(c, v, t);
    const amp = 7 * E.in(seg(t, 1.5, 4.2));
    c.translate(amp * (Math.sin(t * 71) + Math.sin(t * 43.7)) * .5, amp * (Math.sin(t * 59.3) + Math.sin(t * 31.1)) * .5);
    const aw = E.back(seg(t, 0, .55));
    for (const px of [236, 946]) { rr(c, px, 200, 18, 440, 4); fs(c, C.woodD, 4); }
    const worried = t > 2.4;
    c.save(); c.beginPath(); c.rect(-2000, -2000, 5000, 2000 + 452); c.clip();
    person(c, { x: 640, y: 640, face: -1, skin: C.skin2, shirt: C.pink, skirt: C.green, shawl: true, hat: 'bombin', hair: 'braids',
      handF: [58, -186], handB: [-58, -186], mouth: worried ? 'o' : 'smile', brows: worried ? 'worried' : null, blink: Math.abs(t - 1.9) < .07 });
    c.restore();
    const g = [E.back(seg(t, .2, .5)), E.back(seg(t, .3, .6)), E.back(seg(t, .4, .7))];
    c.save(); c.translate(340, 446); c.scale(g[0], g[0]); for (const mx of [-40, 0, 40]) milk(c, mx, 0, .85); c.restore();
    eggs(c, 490, 446, g[1]);
    veg(c, 820, 446, g[2]);
    rr(c, 220, 444, 760, 28, 10); fs(c, C.wood, 4);
    rr(c, 236, 472, 728, 168, 0); fs(c, '#DDB07E', 4);
    c.save(); rr(c, 236, 472, 728, 74, 0); c.clip(); aguayoBand(c, 236, 472, 728, 74, t * .2); c.restore();
    rr(c, 236, 472, 728, 74, 0); fs(c, null, 4);
    for (let fx = 246; fx < 960; fx += 16) line(c, [[fx, 548], [fx, 562]], C.terra, 3);
    const ay = 150 - (1 - aw) * 340;
    c.save(); rr(c, 196, ay, 808, 96, 12); c.clip(); aguayoBand(c, 196, ay, 808, 96); c.restore();
    rr(c, 196, ay, 808, 96, 12); fs(c, null, 5);
    const n = 18, sw = 808 / n;
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(196 + sw * (i + .5), ay + 96, sw / 2, 0, PI); c.closePath(); fs(c, C.green, 4); }
    const tagA = E.back(seg(t, .45, .8));
    [340, 490, 830].forEach((tx, i) => {
      if (tagA <= 0) return;
      const sway = Math.sin(t * 3 + i * 1.7) * (.05 + amp * .012);
      c.save(); c.translate(tx, ay + 118); c.rotate(sway); c.scale(tagA, tagA);
      line(c, [[0, 0], [0, 282 - 268]], C.ink2, 3);
      let k = 0, flip = 1;
      FLIPS.forEach((ft, fi) => {
        const f0 = ft + i * .06;
        if (t >= f0 + .08) k = fi + 1;
        const p = seg(t, f0, f0 + .16);
        if (p > 0 && p < 1) flip = Math.abs(Math.cos(p * PI));
      });
      c.translate(0, 14); c.scale(1, Math.max(.05, flip));
      rr(c, -54, 0, 108, 54, 10); fs(c, '#FFFFFF', 4);
      circ(c, 0, 9, 4); c.fillStyle = C.ink3; c.fill();
      const hot = k > 0;
      c.font = '800 27px Geist'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = hot ? C.terra : C.ink; c.fillText(`Bs ${PRICES[i][k]}`, hot ? -9 : 0, 33);
      if (hot) { c.beginPath(); c.moveTo(38, 25); c.lineTo(46, 37); c.lineTo(30, 37); c.closePath(); c.fillStyle = C.terra; c.fill(); }
      c.restore();
    });
    const ca = E.back(seg(t, .3, .7));
    if (ca > 0) {
      const r = lerp(72, 30, E.io(seg(t, .9, 4.0)));
      if (!PORT) { ell(c, COIN[0], GROUND + 4, r * .9 * ca, 10 * ca); c.fillStyle = 'rgba(29,25,19,.1)'; c.fill(); }
      coin(c, COIN[0], COIN[1] + Math.sin(t * 2.4) * 6, r * ca, Math.cos(Math.sin(t * 1.3) * .5), 'Bs');
      const da = seg(t, 1.2, 1.5);
      if (da > 0) {
        c.save(); c.globalAlpha *= da;
        for (let k = 0; k < 2; k++) {
          const yy = (PORT ? COIN[1] - 10 : COIN[1] + 92) + k * 22 + ((t * 30) % 22), cx0 = COIN[0] + (PORT ? 110 : 0);
          line(c, [[cx0 - 12, yy - 8], [cx0, yy + 2], [cx0 + 12, yy - 8]], C.terra, 5);
        }
        c.restore();
      }
    }
    const cha = E.back(seg(t, .5, .9));
    if (cha > 0) {
      c.save(); c.translate(CHART[0], CHART[1]); c.scale(cha, cha);
      rr(c, -74, -60, 148, 120, 14); fs(c, '#FFFFFF', 4);
      line(c, [[-54, 40], [54, 40]], C.ink3, 3); line(c, [[-54, 40], [-54, -42]], C.ink3, 3);
      const pts = [[-48, 30], [-30, 18], [-14, 24], [4, 2], [20, 8], [36, -20], [50, -38]];
      const p = seg(t, .9, 3.9) * (pts.length - 1), n = Math.floor(p), fr = p - n;
      const shown = pts.slice(0, n + 1);
      if (n < pts.length - 1) shown.push(lerp2(pts[n], pts[n + 1], fr));
      if (shown.length > 1) {
        line(c, shown, C.terra, 6);
        const [ax, ay2] = shown[shown.length - 1], [bx, by] = shown[shown.length - 2];
        const ang = Math.atan2(ay2 - by, ax - bx);
        c.save(); c.translate(ax, ay2); c.rotate(ang);
        c.beginPath(); c.moveTo(6, 0); c.lineTo(-10, -9); c.lineTo(-10, 9); c.closePath(); c.fillStyle = C.terra; c.fill();
        c.restore();
      }
      c.restore();
    }
  });
}

// ---------------------------------------------------------------- shot 2: paying in advance, the seller vanishes
function sat2(t) { return 1 - .78 * E.io(seg(t, TL.b[1].V + .05, TL.b[1].V + .8)); }
function shot2(c, v, t) {
  const b = TL.b[1], V = b.V;
  inView(c, v, () => {
    backdrop(c, v, t);
    const vis = 1 - seg(t, V + .05, V + .2);
    if (vis > 0) {
      c.save(); c.globalAlpha *= vis;
      for (const lx of [905, 1095]) { rr(c, lx - 8, 520, 16, 120, 4); fs(c, C.woodD, 4); }
      rr(c, 880, 506, 240, 22, 8); fs(c, C.wood, 4);
      c.save(); rr(c, 890, 528, 220, 56, 0); c.clip(); aguayoBand(c, 890, 528, 220, 56); c.restore();
      rr(c, 890, 528, 220, 56, 0); fs(c, null, 4);
      milk(c, 930, 506, .7); milk(c, 962, 506, .7); eggs(c, 1040, 506, .7);
      c.restore();
    }
    const sh = E.io(seg(t, .45, .75)) * (1 - E.io(seg(t, 1.85, 2.15)));
    const seller = { x: 800, y: 640, face: -1, shirt: C.purple, pants: C.ink2, hat: 'cap', capColor: C.ink2, skin: C.skin1,
      handF: lerp2([50, -118], [96, -168], sh), mouth: t > 1.9 ? 'grin' : 'smile', alpha: vis };
    person(c, seller);
    let bh;
    if (t < 1.8) bh = lerp2([50, -118], [96, -168], E.io(seg(t, .3, .55)));
    else bh = lerp2([96, -168], [64, -252], E.io(seg(t, 1.8, 2.15)));
    const shock = t > V + .05;
    const buyer = { x: 400, y: 640, face: 1, shirt: C.blue, pants: C.ink2, hair: 'ponytail', skin: C.skin1, handF: bh,
      mouth: !shock ? 'smile' : t < V + .7 ? 'o' : 'sad', brows: shock ? 'worried' : null, blink: Math.abs(t - .95) < .07 };
    person(c, buyer);
    const A = handAt(buyer, [96, -168]), Bp = handAt(seller, [96, -168]);
    b.coinT.forEach((t0, k) => {
      const u = seg(t, t0, t0 + .5);
      if (u <= 0) { if (t > .3) coin(c, A[0], A[1] - 14 - k * 6, 20, 1); return; }
      if (u >= 1) { if (vis > 0) { c.save(); c.globalAlpha *= vis; coin(c, Bp[0], Bp[1] - 14 - k * 6, 20, 1); c.restore(); } return; }
      const [x, y] = bez(A, Bp, 110, E.io(u));
      coin(c, x, y - 14, 20, Math.cos(u * PI * 4));
    });
    const tk = seg(t, b.ticket[0], b.ticket[1]);
    if (t > 1.0) {
      const appear = E.back(seg(t, 1.0, 1.2));
      let pos, rot = 0;
      if (tk <= 0) pos = [Bp[0], Bp[1] - 40];
      else if (tk < 1) { pos = bez([Bp[0], Bp[1] - 40], [A[0], A[1] - 40], 60, E.io(tk)); rot = Math.sin(tk * PI) * -.3; }
      else { const h = handAt(buyer, bh); pos = [h[0] + 6, h[1] - 44]; rot = -.08 + Math.sin(t * 3) * .03; }
      ticket(c, pos[0], pos[1], .62 * appear, rot, seg(t, V + .35, V + .9));
    }
    puff(c, 800, 470, seg(t, V - .05, V + .95), 1.35);
    puff(c, 1000, 520, seg(t, V + .05, V + 1.0), 1.0);
    if (shock) {
      const a = seg(t, V + .1, V + .3) * (1 - seg(t, V + 1.2, V + 1.6));
      c.save(); c.globalAlpha *= a;
      for (const [dx, dy, r] of [[-70, -330, -.6], [-40, -362, -.2], [-2, -372, .2]]) {
        c.save(); c.translate(400 + dx + 30, 640 + dy + 30); c.rotate(r); line(c, [[0, 0], [0, -22]], C.ink, 5); c.restore();
      }
      c.restore();
    }
  });
}
function drawSat(c, fn, v, sat) {
  if (sat > .995) { fn(c, v); return; }
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.filter = 'none'; bctx.clearRect(0, 0, W, H);
  fn(bctx, v);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `saturate(${sat.toFixed(3)})`; c.drawImage(buf, 0, 0); c.restore();
}

// ---------------------------------------------------------------- shots 3-4: the farm, the vault, the buyer's door
const VAULT_X = 600;
const vaultY = (t) => 420 + Math.sin(t * 2.2) * 6;
const FARMER = { x: 300, y: GROUND, face: 1, shirt: C.terra, pants: C.ink2, hat: 'straw', skin: C.skin2 };
const BUYER = { x: 950, y: GROUND, face: -1, shirt: C.blue, pants: C.ink2, hair: 'ponytail', skin: C.skin1 };

function house(c, e) {
  const x0 = 1010, x1 = e.x1 + 20;
  rr(c, x0, 300, x1 - x0, 360, [16, 0, 0, 0]); fs(c, '#EBD8BA', 4);
  rr(c, x0 - 16, 284, x1 - x0 + 40, 28, 8); fs(c, C.terra, 4);
  rr(c, 1052, 446, 96, 194, [14, 14, 0, 0]); fs(c, C.greenD, 4);
  circ(c, 1132, 548, 6); fs(c, C.amberL, 3);
  rr(c, 1040, 632, 120, 12, 4); fs(c, C.ground2, 4);
  rr(c, 1186, 360, 84, 74, 8); fs(c, '#CFE3EE', 4);
  line(c, [[1228, 360], [1228, 434]], C.ink, 4); line(c, [[1186, 397], [1270, 397]], C.ink, 4);
}
function field(c, g, dim) {
  if (g <= 0) return;
  c.save(); c.globalAlpha *= 1 - dim * .55;
  c.save(); c.beginPath(); c.rect(-2000, -2000, 5000, 2000 + GROUND); c.clip();
  ell(c, 230, GROUND + 10, 350, 150 * E.out(g)); c.fillStyle = C.hill; c.fill();
  c.restore();
  const rows = [[GROUND - 16, 40, 430, 46], [GROUND - 56, 90, 380, 44], [GROUND - 94, 150, 320, 42]];
  rows.forEach(([y, xa, xb, st], ri) => {
    for (let x = xa, k = 0; x <= xb; x += st, k++) {
      const d = ri * .12 + k * .035, sc = E.back(seg(g, d, d + .45)) * (1 - ri * .12);
      if (sc <= 0) continue;
      c.save(); c.translate(x, y); c.scale(sc, sc);
      line(c, [[0, 0], [0, -22]], '#2F7A4F', 4);
      ell(c, -10, -22, 11, 6, -.5); fs(c, C.leaf, 3); ell(c, 10, -26, 11, 6, .5); fs(c, C.leaf, 3);
      c.restore();
    }
  });
  c.restore();
}
function flights(c, list, t) {
  for (const f of list) {
    const u = seg(t, f.t0, f.t0 + f.d);
    if (u <= 0 || u >= 1) continue;
    const [x, y] = bez(f.a, f.b, f.h, E.io(u));
    const shrink = f.intoSlot ? 1 - E.in(seg(u, .85, 1)) : 1;
    coin(c, x, y, 21 * shrink, Math.cos(u * PI * 4));
  }
}
function farm(c, v, t, S) {
  inView(c, v, () => {
    const e = ext(v);
    backdrop(c, v, t, { hills: true });
    house(c, e);
    field(c, S.field, S.fieldDim || 0);
    cow(c, COW_X, GROUND, S.cow);
    const farmer = { ...FARMER, s: S.farmer, jump: S.farmerJump || 0, handF: S.farmerHand ?? [50, -118], handB: S.farmerHandB ?? [-50, -118], mouth: S.farmerMouth ?? 'smile', blink: Math.abs((t % 3.1) - 2.2) < .07 };
    person(c, farmer);
    const vy = vaultY(t);
    if (S.vault > 0) { ell(c, VAULT_X, GROUND + 6, 96 * S.vault * (1 - (vy - 420) / 80), 14 * S.vault); c.fillStyle = 'rgba(29,25,19,.12)'; c.fill(); }
    orbit(c, VAULT_X, vy + 14, S.ring, t, S.ringBright || 0, 'back');
    vault(c, VAULT_X, vy, { s: S.vault, glow: S.glow, open: S.vaultOpen, gulp: S.gulp, usdc: S.usdc, tagSwing: S.tagSwing });
    orbit(c, VAULT_X, vy + 14, S.ring, t, S.ringBright || 0, 'front');
    if (S.crate) crate(c, S.crate[0], S.crate[1], S.crate[2] ?? 1);
    const buyer = { ...BUYER, handF: S.buyerHand ?? [50, -118], mouth: S.buyerMouth ?? 'smile', brows: S.buyerBrows, blink: Math.abs((t % 2.7) - 1.3) < .07 };
    person(c, buyer);
    if (S.phone > 0) {
      const h = handAt(buyer, S.buyerHand);
      if (S.scan > 0 && S.scan < 1 && S.crate) {
        const qx = S.crate[0] + 30, qy = S.crate[1] - 34;
        c.beginPath(); c.moveTo(h[0] - 10, h[1] + 30); c.lineTo(qx - 22, qy - 18); c.lineTo(qx + 22, qy + 18); c.closePath();
        c.fillStyle = 'rgba(79,185,133,.28)'; c.fill();
        rr(c, qx - 22, qy - 22, 44, 44, 6); c.strokeStyle = C.mint; c.lineWidth = 4; c.stroke();
      }
      phone(c, h[0] - 6, h[1] - 14, S.phone, .25, S.scan > 0 && S.scan < 1 ? S.scan : 0);
    }
    flights(c, S.coins || [], t);
    if (S.check > 0) bubble(c, S.crate ? S.crate[0] : 860, 470, S.check, 'check');
    (S.stars || []).forEach((a, k) => star(c, 250 + k * 50, 232 - (k === 1 ? 10 : 0) - (S.farmerJump || 0) * .3, 22, a, Math.sin(t * 2 + k) * .1));
    if (S.timer > 0) timer(c, 950, 236, S.timerP, S.timer);
    if (S.xb > 0) bubble(c, 950, 236, S.xb, 'x');
    if (S.badge > 0) badge(c, 950, 236, S.badge, '100%');
    if (S.chip) pill(c, (e.x0 + e.x1) / 2, v.chipY ?? 755, S.chip.parts, PORT ? 50 : 44, S.chip.a, (e.x1 - e.x0) - 60);
  });
}
const SLOT = (t) => [VAULT_X, vaultY(t) - 48];
const FARMER_HAND = [FARMER.x + 62, GROUND - 150];
const BUYER_HAND = [BUYER.x - 80, GROUND - 175];

function st3(t) {
  const b = TL.b[2];
  const coins = b.coinT.map((t0) => ({ t0, d: .55, a: BUYER_HAND, b: SLOT(t0 + .55), h: 170, intoSlot: true }));
  let gulp = 0;
  b.coinT.forEach((t0) => { gulp += pulse(t, t0 + .5, .22); });
  const throwA = E.io(seg(t, b.P - .4, b.P - .15)) * (1 - E.io(seg(t, b.coinT[4] + .1, b.coinT[4] + .4)));
  const rb = pulse(t, b.stellar - .1, 1.0);
  return {
    field: seg(t, 1.15, 2.7), cow: E.back(seg(t, 2.0, 2.4)), farmer: E.back(seg(t, 1.0, 1.4)),
    farmerHandB: [-50, -118], farmerHand: lerp2([50, -118], [70, -200], pulse(t, 2.4, .7)),
    vault: E.back(seg(t, .85, 1.3)), ring: E.io(seg(t, 1.05, 1.7)), ringBright: rb,
    vaultOpen: 1 - E.io(seg(t, b.lock, b.lock + .2)), gulp,
    glow: .3 + .4 * seg(t, b.coinT[0] + .55, b.lastArr) + .35 * rb,
    usdc: E.back(seg(t, b.dollars - .15, b.dollars + .3)), tagSwing: Math.sin((t - b.dollars) * 9) * .35 * (1 - seg(t, b.dollars, b.dollars + 1.2)),
    coins, buyerHand: lerp2([50, -118], [80, -175], throwA), buyerMouth: 'smile',
  };
}
function st4(t) {
  const b = TL.b[3];
  const cu = seg(t, .15, 1.05);
  const cx = lerp(380, 830, E.io(cu)), hop = Math.abs(Math.sin(cu * 3 * PI)) * 56 * (1 - cu * .4);
  const crateIn = E.back(seg(t, 0, .18));
  const phoneA = E.io(seg(t, .85, 1.1)) * (1 - E.io(seg(t, 2.3, 2.6)));
  const coins = b.coinOut.map((t0) => ({ t0, d: .5, a: SLOT(t0), b: FARMER_HAND, h: 150 }));
  let jump = 0;
  b.coinOut.forEach((t0) => { jump += 12 * pulse(t, t0 + .45, .25); });
  const cheer = E.io(seg(t, b.D + .2, b.D + .5));
  return {
    field: 1, cow: 1, farmer: 1, vault: 1, ring: 1, usdc: 1, ringBright: 0,
    glow: .75 - .5 * seg(t, b.D + .15, b.D + .8), vaultOpen: E.io(seg(t, b.D, b.D + .25)),
    crate: [cx, GROUND - hop, crateIn], phone: phoneA, scan: seg(t, b.scan[0], b.scan[1]),
    check: E.back(seg(t, b.check, b.check + .3)) * (1 - seg(t, b.D + 1.4, b.D + 1.7)),
    buyerHand: lerp2([50, -118], [60, -236], phoneA),
    coins, farmerJump: jump, farmerHand: lerp2([50, -118], [62, -150], E.io(seg(t, b.D, b.D + .3))),
    farmerHandB: lerp2([-50, -118], [-40, -250], cheer), farmerMouth: cheer > .5 ? 'grin' : 'smile',
    stars: b.stars.map((t0) => E.back(seg(t, t0, t0 + .3))),
  };
}
function stRefund(t) {
  const b = TL.b[3];
  const coins = b.coinBack.map((t0) => ({ t0, d: .5, a: SLOT(t0), b: BUYER_HAND, h: 130 }));
  const tp = seg(t, b.timer[0], b.timer[1]);
  return {
    field: 1, fieldDim: 1, cow: 0, farmer: 0, vault: 1, ring: 1, usdc: 1,
    glow: .75 - .5 * seg(t, b.R + .1, b.R + .8), vaultOpen: E.io(seg(t, b.R, b.R + .25)),
    timer: E.back(seg(t, b.split, b.split + .2)) * (1 - seg(t, b.xT, b.xT + .05)), timerP: 1 - tp,
    xb: E.back(seg(t, b.xT, b.xT + .25)) * (1 - seg(t, b.badgeT - .1, b.badgeT + .05)),
    badge: E.back(seg(t, b.badgeT, b.badgeT + .3)),
    coins, buyerHand: lerp2([50, -118], [80, -175], E.io(seg(t, b.R, b.R + .25))),
    buyerMouth: t < b.coinBack[2] ? 'o' : 'grin', buyerBrows: t < b.coinBack[2] ? 'worried' : null,
  };
}
function shot3(c, v, t) { farm(c, v, t, st3(t)); }
function shot4(c, t) {
  const b = TL.b[3];
  const u = E.io(seg(t, b.split - .3, b.split + .25));
  if (u <= 0) { farm(c, FULL, t, st4(t)); return; }
  const va = lerpView(FULL, SPLIT_A, u);
  const vb = PORT ? shift(SPLIT_B, 0, (1 - u) * 960) : shift(SPLIT_B, (1 - u) * 960, 0);
  farm(c, va, t, { ...st4(t), chip: { parts: TXT.c4a, a: seg(t, b.split + .05, b.split + .45) } });
  farm(c, vb, t, { ...stRefund(t), chip: { parts: TXT.c4b, a: seg(t, b.split + .2, b.split + .6) } });
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = C.ink;
  if (PORT) c.fillRect(0, vb.clip[1] - 3, W, 6); else c.fillRect(vb.clip[0] - 3, 0, 6, H);
  c.restore();
}

// ---------------------------------------------------------------- shot 5: from milk to a home, then the logo
function mark(c, x, y, r, draw) {
  circ(c, x, y, r); c.fillStyle = C.green; c.fill();
  if (draw <= 0) return;
  const rr_ = r * .4, off = r * .25, lw = r * .14;
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.strokeStyle = '#FFFFFF'; c.lineWidth = lw;
  c.beginPath(); c.arc(-off, 0, rr_, -PI / 2, -PI / 2 + TAU * draw); c.stroke();
  c.beginPath(); c.arc(off, 0, rr_, PI / 2, PI / 2 + TAU * draw); c.stroke();
  if (draw >= 1) {
    const ang = Math.atan2(-Math.sqrt(rr_ * rr_ - off * off), off);
    c.strokeStyle = C.green; c.lineWidth = lw * 2.2; c.beginPath(); c.arc(-off, 0, rr_, ang - .32, ang + .32); c.stroke();
    c.strokeStyle = '#FFFFFF'; c.lineWidth = lw; c.beginPath(); c.arc(-off, 0, rr_, ang - .5, ang + .5); c.stroke();
  }
  c.restore();
}
function shot5(c, v, t) {
  const b = TL.b[4];
  inView(c, v, () => {
    backdrop(c, v, t, { ground: false, sun: false });
    const [T0, T1, T2, T3] = b.items, Cc = b.C, L = b.L;
    const collapse = E.in(seg(t, Cc, Cc + .35));
    const plat = E.back(seg(t, T0 - .1, T0 + .25)) * (1 - collapse);
    if (plat > 0) {
      const bump = b.items.reduce((acc, ti) => acc + .06 * pulse(t, ti, .3), 0);
      circ(c, 600, 400, 205 * plat * (1 + bump)); c.fillStyle = C.greenSoft; c.fill();
    }
    b.items.forEach((ti) => { c.save(); ring(c, 600, 400, seg(t, ti, ti + .55), 260); c.restore(); });
    const draws = [(s) => { for (const mx of [-34, 34]) milk(c, 600 + mx * s, 520, 1.45 * s); milk(c, 600, 530, 1.6 * s); },
                   (s) => eggs(c, 600, 500, 1.7 * s), (s) => basket(c, 600, 510, 1.5 * s), (s) => building(c, 590, 548, 1.0 * s)];
    const ends = [T1, T2, T3, Cc];
    draws.forEach((fn, k) => {
      const ti = b.items[k], te = ends[k];
      if (t < ti || (k < 3 && t > te)) return;
      const inS = E.back(seg(t, ti, ti + .32));
      const out = k < 3 ? E.in(seg(t, te - .13, te)) : collapse;
      const s = inS * (1 - out);
      if (s <= 0) return;
      c.save(); c.translate(600, 520); c.scale(1 + .25 * out, 1); c.translate(-600, -520);
      fn(s); c.restore();
    });
    const fsW = 156;
    c.font = `600 ${fsW}px Fraunces`; c.letterSpacing = '-3px';
    const tw = c.measureText(NAME).width, mr = 64, gap = 34, total = mr * 2 + gap + tw, left = 600 - total / 2;
    const mx = left + mr, my = 350, tx = left + mr * 2 + gap;
    if (t >= Cc + .2 && t < L + .05) {
      const d = E.back(seg(t, Cc + .2, Cc + .4));
      circ(c, 600, 400, 16 * d); c.fillStyle = C.mint; c.fill();
      sparkle(c, 618, 382, .6 * d * (.7 + .3 * Math.sin(t * 20)), '#FFFFFF');
    }
    if (t >= L) {
      const u = E.out(seg(t, L, L + .45)), g = E.back(seg(t, L, L + .45));
      const x = lerp(600, mx, u), y = lerp(400, my, u), r = lerp(16, mr, g);
      [0, 1, 2, 3, 4, 5].forEach((k) => {
        const p = seg(t, L + .05, L + .75), a = k * TAU / 6 + .3;
        if (p > 0 && p < 1) sparkle(c, x + Math.cos(a) * (70 + 90 * E.out(p)), y + Math.sin(a) * (70 + 90 * E.out(p)), (1 - p) * 1.1);
      });
      mark(c, x, y, r, E.io(seg(t, L + .25, L + .75)));
      const rev = E.io(seg(t, L + .3, L + .85));
      if (rev > 0) {
        c.save(); c.beginPath(); c.rect(tx - 10, my - fsW, (tw + 30) * rev + 10, fsW * 2); c.clip();
        c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(NAME, tx - 24 * (1 - rev), my + fsW * .06);
        c.restore();
      }
    }
    c.letterSpacing = '0px';
    const ta = seg(t, b.tag, b.tag + .45);
    if (ta > 0) {
      c.save(); c.globalAlpha *= ta; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = '500 46px Geist'; const w1 = c.measureText(TXT.tag[0]).width;
      c.font = '700 46px Geist'; const w2 = c.measureText(TXT.tag[1]).width;
      const x0 = 600 - (w1 + w2) / 2, yy = 470 + (1 - E.out(ta)) * 20;
      c.font = '500 46px Geist'; c.fillStyle = C.ink2; c.fillText(TXT.tag[0], x0, yy);
      c.font = '700 46px Geist'; c.fillStyle = C.green; c.fillText(TXT.tag[1], x0 + w1, yy);
      c.restore();
    }
    const da = E.io(seg(t, b.tag + .3, b.tag + .9));
    if (da > 0) aguayoBand(c, 600 - 170 * da, 528, 340 * da, 24, t * .3);
    pill(c, 600, 615, [{ t: TXT.built, w: 600, col: C.ink2 }], 30, seg(t, b.built, b.built + .4));
  });
}

// ---------------------------------------------------------------- compositor
function rewindOverlay(c, t) {
  const a = 1 - seg(t, .72, .9);
  if (a <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = a;
  for (let k = 0; k < 3; k++) { const y = ((t * 2400 + k * H / 3) % (H + 80)) - 40; c.fillStyle = 'rgba(255,255,255,.32)'; c.fillRect(0, y, W, 12 + k * 7); }
  const [ix, iy] = PORT ? [540, 300] : [960, 120], s = E.back(seg(t, 0, .2)) * (PORT ? 1.2 : 1.1);
  c.translate(ix, iy); c.scale(s, s);
  rr(c, -74, -42, 148, 84, 42); fs(c, '#FFFFFF', 4);
  c.fillStyle = C.ink;
  c.beginPath(); c.moveTo(-4, -22); c.lineTo(-4, 22); c.lineTo(-40, 0); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(34, -22); c.lineTo(34, 22); c.lineTo(-2, 0); c.closePath(); c.fill();
  c.restore();
}
function iris(c, cx, cy, p, drawInside) {
  const R = E.io(p) * Math.hypot(W, H);
  if (R <= 0) return;
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip(); drawInside(); c.restore();
  if (p < 1) { c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.strokeStyle = C.mint; c.lineWidth = 14; c.stroke(); c.restore(); }
}
function renderAt(T) {
  T = clamp(T, 0, TL.total - 1e-4);
  let i = 0;
  while (i < 4 && T >= TL.start[i + 1]) i++;
  const t = T - TL.start[i], d = TL.d;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (i === 0) {
    shot1(ctx, FULL, t);
    caption(ctx, TXT.c1, t, .6, d[0] - .3);
  } else if (i === 1) {
    const u = E.io(seg(t, 0, .55));
    const dx = PORT ? 0 : W, dy = PORT ? H : 0;
    if (u < 1) shot1(ctx, shift(FULL, -dx * u, -dy * u * 0), d[0] + t);
    const v2 = PORT ? shift(FULL, W * (1 - u), 0) : shift(FULL, dx * (1 - u), 0);
    drawSat(ctx, (c, v) => shot2(c, v, t), v2, sat2(t));
    caption(ctx, TXT.c2, t, TL.b[1].V - .2, d[1] - .3);
  } else if (i === 2) {
    const b = TL.b[2];
    if (t < b.iris[1]) {
      const tr = lerp(d[1], .25, E.io(seg(t, 0, .8)));
      drawSat(ctx, (c, v) => shot2(c, v, tr), FULL, sat2(tr));
      rewindOverlay(ctx, t);
    }
    const [vx, vy] = toCanvas(FULL, VAULT_X, 420);
    iris(ctx, vx, vy, seg(t, b.iris[0], b.iris[1]), () => shot3(ctx, FULL, t));
    caption(ctx, TXT.c3, t, VO_IN[2] + .15, d[2] - .3);
  } else if (i === 3) {
    shot4(ctx, t);
    caption(ctx, TXT.c4a, t, .35, TL.b[3].split - .35);
  } else {
    if (t < .5) shot4(ctx, d[3] + t);
    iris(ctx, W / 2, H / 2, seg(t, 0, .5), () => shot5(ctx, FULL5, t));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  aguayoBand(ctx, 0, H - (PORT ? 28 : 22), W, PORT ? 28 : 22);
}

// ---------------------------------------------------------------- sound cues (mix.py turns these into SFX)
function buildCues() {
  const q = [];
  const add = (shot, t, type, gain = 1) => { if (t >= 0) q.push({ t: +(TL.start[shot] + t).toFixed(3), type, gain }); };
  const [b1, b2, b3, b4, b5] = TL.b;
  add(0, .02, 'whoosh', .5); add(0, .25, 'pop', .45); add(0, .4, 'pop', .4); add(0, .55, 'pop', .4); add(0, .5, 'pop', .35);
  b1.flips.forEach((f, k) => add(0, f, 'tick', .3 + .05 * k));
  add(1, 0, 'whoosh', .8);
  b2.coinT.forEach((t0) => add(1, t0 + .5, 'coin', .55));
  add(1, b2.ticket[0], 'swish', .5); add(1, b2.V, 'poof', 1);
  add(2, 0, 'rewind', .8); add(2, b3.iris[0], 'whoosh', .6); add(2, .88, 'pop', .6); add(2, 2.05, 'pop', .45);
  b3.coinT.forEach((t0) => add(2, t0 + .55, 'coin', .5));
  add(2, b3.lock, 'click', .9); add(2, b3.stellar - .05, 'sparkle', .55); add(2, b3.dollars - .1, 'pop', .45);
  b4.hops.forEach((h) => add(3, h, 'thud', .55));
  add(3, b4.scan[0], 'beep', .45); add(3, b4.check, 'ding', .75); add(3, b4.D, 'click', .7);
  b4.coinOut.forEach((t0) => add(3, t0 + .5, 'coin', .42));
  b4.stars.forEach((t0, k) => add(3, t0, 'star', .5 + .1 * k));
  add(3, b4.split - .3, 'whoosh', .7); add(3, b4.xT, 'buzz', .5); add(3, b4.R, 'click', .7);
  b4.coinBack.forEach((t0) => add(3, t0 + .5, 'coin', .42));
  add(3, b4.badgeT, 'pop', .6);
  add(4, 0, 'whoosh', .7);
  b5.items.forEach((ti) => add(4, ti, 'pop', .55));
  add(4, b5.C, 'suck', .6); add(4, b5.L, 'sting', 1); add(4, b5.L + .08, 'sparkle', .7); add(4, b5.built, 'pop', .3);
  return q.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- boot
const ready = (async () => {
  try {
    const r = await fetch(`out/vo/${LANG}/timing.json`, { cache: 'no-store' });
    if (r.ok) TL = buildTimeline(await r.json());
  } catch { /* preview without a voiceover: default timing */ }
  await Promise.all(['600 50px Geist', '700 50px Geist', '800 50px Geist', '500 50px Geist', '600 100px Fraunces'].map((f) => document.fonts.load(f)));
  renderAt(0);
})();

window.SCENE = {
  ready, renderAt, format: FORMAT, lang: LANG, width: W, height: H,
  get total() { return TL.total; },
  timeline: () => ({ ...TL, format: FORMAT, lang: LANG, name: NAME, cues: buildCues(), music: { sections: TL.start, rewindEnd: TL.start[2] + .85, sting: TL.start[4] + TL.b[4].L } }),
};

if (!RENDER) {
  const play = document.getElementById('play'), scrub = document.getElementById('scrub'), time = document.getElementById('time'), audio = document.getElementById('audio');
  let playing = false, t0 = 0, cur = 0, hasAudio = false;
  audio.src = `out/${LANG}/mix.wav`;
  audio.addEventListener('canplay', () => { hasAudio = true; });
  const show = (t) => { cur = t; renderAt(t); scrub.value = String(Math.round((t / TL.total) * 1000)); time.textContent = `${t.toFixed(2)} / ${TL.total.toFixed(2)} s`; };
  const loop = (now) => {
    if (!playing) return;
    const t = hasAudio ? audio.currentTime : (now - t0) / 1000;
    if (t >= TL.total) { playing = false; play.textContent = 'Play'; show(TL.total - 1e-3); return; }
    show(t); requestAnimationFrame(loop);
  };
  play.onclick = () => {
    playing = !playing; play.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      if (cur >= TL.total - .05) cur = 0;
      t0 = performance.now() - cur * 1000;
      if (hasAudio) { audio.currentTime = cur; audio.play().catch(() => { hasAudio = false; }); }
      requestAnimationFrame(loop);
    } else if (hasAudio) audio.pause();
  };
  scrub.oninput = () => { const t = (Number(scrub.value) / 1000) * TL.total; if (hasAudio) audio.currentTime = t; t0 = performance.now() - t * 1000; show(t); };
  const swap = (k, a, b) => { const q = new URLSearchParams(location.search); q.set(k, q.get(k) === b ? a : b); location.search = q.toString(); };
  document.getElementById('swapFormat').textContent = PORT ? '16:9' : '9:16';
  document.getElementById('swapFormat').onclick = (e) => { e.preventDefault(); swap('format', 'landscape', 'portrait'); };
  document.getElementById('swapLang').textContent = LANG === 'es' ? 'EN' : 'ES';
  document.getElementById('swapLang').onclick = (e) => { e.preventDefault(); swap('lang', 'es', 'en'); };
  ready.then(() => show(0));
}
})();
