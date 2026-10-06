// Generates the lobby cover art in public/games/<slug>.svg (portrait 300×400).
// Every motif below is hand-drawn from SVG shapes; nothing is traced from third-party artwork.
// The game title is NOT baked in: the tile renders it as HTML in the display font, so the
// bottom ~110px of each cover is kept calm for it. Run: node scripts/game-art.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "games");
const W = 300, H = 400;
const r1 = (n) => Math.round(n * 10) / 10;
const pol = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a))];
};

// ---- shared building blocks -------------------------------------------------------------
const lin = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op !== undefined ? ` stop-opacity="${op}"` : ""}/>`)
    .join("")}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op !== undefined ? ` stop-opacity="${op}"` : ""}/>`)
    .join("")}</radialGradient>`;

/** Light rays fanning out of (cx, cy). */
function rays(cx, cy, n, color, op, spread = 0.45, rot = 0) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = rot + (360 / n) * i;
    const [x1, y1] = pol(cx, cy, 420, a - (360 / n) * spread * 0.5);
    const [x2, y2] = pol(cx, cy, 420, a + (360 / n) * spread * 0.5);
    d += `M${cx} ${cy}L${x1} ${y1}L${x2} ${y2}Z`;
  }
  return `<path d="${d}" fill="${color}" opacity="${op}"/>`;
}

/** Four-point twinkle. */
const spark = (x, y, r, op = 0.9, c = "#fff") =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}" opacity="${op}"/>`;
const sparks = (list, c) => list.map(([x, y, r, o]) => spark(x, y, r, o, c)).join("");
const dots = (list, c = "#fff") => list.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o ?? 0.8}"/>`).join("");

/** Spiky burst polygon. */
function burst(cx, cy, n, ro, ri, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push(pol(cx, cy, i % 2 ? ri : ro, rot + (180 / n) * i).join(","));
  return pts.join(" ");
}

/** Wraps a motif into a full cover: background, glow, motif, vignette and the bottom fade for the title. */
function cover({ bg, glow = "#fff", glowAt = [150, 160], glowR = 170, defs = "", back = "", motif, front = "", fade = "#000", fadeOp = 0.82, style = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>${lin("bg", bg)}${rad("gl", [[0, glow, 0.75], [0.45, glow, 0.25], [1, glow, 0]])}` +
    `${rad("vg", [[0.55, "#000", 0], [1, "#000", 0.55]], 0.5, 0.42, 0.72)}` +
    `${lin("bf", [[0, fade, 0], [0.55, fade, fadeOp * 0.75], [1, fade, fadeOp]])}${defs}</defs>` +
    (style ? `<style>${style}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>` : "") +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    `<circle cx="${glowAt[0]}" cy="${glowAt[1]}" r="${glowR}" fill="url(#gl)"/>` +
    back + motif + front +
    `<rect width="${W}" height="${H}" fill="url(#vg)"/>` +
    `<rect y="255" width="${W}" height="145" fill="url(#bf)"/>` +
    `</svg>`;
}

// Card suits, drawn around (0,0) with a size of ~1.
const SUIT = {
  heart: "M0 .38C-.12 .26-.5 0-.5-.24C-.5-.5-.14-.56 0-.3C.14-.56 .5-.5 .5-.24C.5 0 .12 .26 0 .38Z",
  spade: "M0-.46C.12-.3 .5-.08 .5 .14C.5 .36 .2 .42 .05 .24L.14 .46H-.14L-.05 .24C-.2 .42-.5 .36-.5 .14C-.5-.08-.12-.3 0-.46Z",
  diamond: "M0-.5L.36 0L0 .5L-.36 0Z",
  club: "M0-.48A.2 .2 0 1 1 .02-.08A.2 .2 0 1 1 .2 .26C.1 .26 .06 .22 .05 .18L.14 .46H-.14L-.05 .18C-.06 .22-.1 .26-.2 .26A.2 .2 0 1 1-.02-.08A.2 .2 0 1 1 0-.48Z",
};
const suit = (k, x, y, s, fill) => `<path d="${SUIT[k]}" transform="translate(${x} ${y}) scale(${s})" fill="${fill}"/>`;

function card({ x, y, rot, rank, s, red }) {
  const ink = red ? "#d11a2a" : "#151826";
  return `<g transform="translate(${x} ${y}) rotate(${rot})">` +
    `<rect x="-55" y="-78" width="110" height="156" rx="11" fill="#000" opacity=".35" transform="translate(4 6)"/>` +
    `<rect x="-55" y="-78" width="110" height="156" rx="11" fill="url(#cardg)" stroke="#e4ddc8" stroke-width="1.5"/>` +
    `<rect x="-47" y="-70" width="94" height="140" rx="7" fill="none" stroke="${ink}" stroke-opacity=".18"/>` +
    `<text x="-40" y="-44" font-family="Georgia,'DejaVu Serif',serif" font-weight="700" font-size="26" fill="${ink}" text-anchor="middle">${rank}</text>` +
    suit(s, -40, -26, 18, ink) +
    `<g transform="rotate(180)"><text x="-40" y="-44" font-family="Georgia,'DejaVu Serif',serif" font-weight="700" font-size="26" fill="${ink}" text-anchor="middle">${rank}</text>${suit(s, -40, -26, 18, ink)}</g>` +
    suit(s, 0, 4, 62, ink) + `</g>`;
}

/** A casino chip seen from above at (x, y). */
const chip = (x, y, r, c, edge = "#fff") =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${c}"/><circle r="${r - 1}" fill="none" stroke="${edge}" stroke-width="${r * 0.28}" stroke-dasharray="${r * 0.42} ${r * 0.62}"/>` +
  `<circle r="${r * 0.62}" fill="${c}" stroke="${edge}" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 3"/><circle r="${r * 0.62}" fill="#fff" opacity=".1"/></g>`;
/** A stack of chips seen from the side. */
function chipStack(x, y, n, c, edge = "#fff") {
  let s = "";
  for (let i = 0; i < n; i++) {
    const cy = y - i * 9;
    s += `<g transform="translate(${x} ${cy})"><ellipse cy="4" rx="30" ry="11" fill="#000" opacity=".35"/><rect x="-30" y="-4" width="60" height="8" fill="${c}"/>` +
      `<rect x="-30" y="-4" width="60" height="8" fill="url(#chipedge)"/><ellipse cy="-4" rx="30" ry="11" fill="${c}"/>` +
      `<ellipse cy="-4" rx="30" ry="11" fill="none" stroke="${edge}" stroke-width="3" stroke-dasharray="7 9"/><ellipse cy="-4" rx="18" ry="6.5" fill="none" stroke="${edge}" stroke-opacity=".6"/></g>`;
  }
  return s;
}
const chipDefs = lin("chipedge", [[0, "#000", 0.35], [0.5, "#fff", 0.15], [1, "#000", 0.4]], 1, 0);

/** Coin: gold disc with rim and shine. */
const coin = (x, y, r, rot = 0, sy = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(1 ${sy})"><circle r="${r}" fill="#9a6a00"/><circle r="${r * 0.92}" cy="-1.5" fill="url(#gold)"/>` +
  `<circle r="${r * 0.68}" cy="-1.5" fill="none" stroke="#a87400" stroke-width="${r * 0.08}"/>${spark(-r * 0.3, -r * 0.4, r * 0.28, 0.9)}</g>`;
const goldDefs = lin("gold", [[0, "#fff4b0"], [0.45, "#ffd23f"], [1, "#d48a00"]], 0.4, 1);

// Roulette wheel (top view, at the origin).
function wheel(r, pockets, greens) {
  const ro = r * 0.88, ri = r * 0.6;
  let w = "";
  const step = 360 / pockets;
  for (let i = 0; i < pockets; i++) {
    const a0 = i * step - step / 2, a1 = a0 + step;
    const [x0, y0] = pol(0, 0, ro, a0), [x1, y1] = pol(0, 0, ro, a1);
    const [x2, y2] = pol(0, 0, ri, a1), [x3, y3] = pol(0, 0, ri, a0);
    const fill = greens.includes(i) ? "#0b9444" : (i % 2 ? "#c8102e" : "#14141c");
    w += `<path d="M${x0} ${y0}A${ro} ${ro} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 0 0 ${x3} ${y3}Z" fill="${fill}" stroke="#e8b04a" stroke-width=".8"/>`;
  }
  let spokes = "";
  for (let i = 0; i < 8; i++) {
    const [x, y] = pol(0, 0, ri * 0.92, i * 45);
    spokes += `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>`;
  }
  return `<circle r="${r}" fill="url(#wood)"/><circle r="${r * 0.95}" fill="none" stroke="#e8b04a" stroke-width="2" stroke-opacity=".7"/>` +
    `<circle r="${ro + 3}" fill="#e8b04a"/>${w}<circle r="${ri}" fill="none" stroke="#e8b04a" stroke-width="2"/>` +
    `<circle r="${ri - 2}" fill="url(#cone)"/>${spokes}<circle r="${r * 0.13}" fill="url(#gold)"/><circle r="${r * 0.06}" fill="#fff6c8"/>`;
}
const wheelDefs = rad("wood", [[0.6, "#8a4a16"], [0.85, "#5b2c0c"], [1, "#2c1203"]]) +
  rad("cone", [[0, "#d9a45a"], [0.6, "#8a5a24"], [1, "#4a2a0c"]], 0.4, 0.35, 0.7);

// ---- originals family: dark glossy with a neon accent -----------------------------------
function original({ accent, accent2, motif, style, extraDefs = "" }) {
  let grid = "";
  for (let x = 0; x <= W; x += 30) grid += `M${x} 0V${H}`;
  for (let y = 0; y <= H; y += 30) grid += `M0 ${y}H${W}`;
  return cover({
    bg: [[0, "#17142a"], [0.55, "#0d0b18"], [1, "#07060d"]],
    glow: accent, glowAt: [150, 165], glowR: 160, fade: "#05040a",
    defs: extraDefs + lin("gloss", [[0, "#fff", 0.16], [1, "#fff", 0]]) + rad("floor", [[0, accent, 0.55], [1, accent, 0]]) +
      `<filter id="neon" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    back: `<path d="${grid}" stroke="${accent}" stroke-opacity=".09" stroke-width="1"/>` +
      `<circle cx="150" cy="165" r="112" fill="none" stroke="${accent}" stroke-opacity=".35" stroke-width="1.5"/>` +
      `<circle cx="150" cy="165" r="128" fill="none" stroke="${accent2}" stroke-opacity=".18" stroke-width="1" stroke-dasharray="2 7"/>` +
      `<ellipse cx="150" cy="262" rx="110" ry="18" fill="url(#floor)"/>`,
    motif,
    front: `<path d="M0 0H300V70Q150 120 0 60Z" fill="url(#gloss)"/>` +
      `<rect x="1" y="1" width="298" height="398" rx="0" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="2"/>` +
      sparks([[52, 70, 6, 0.8], [252, 96, 5, 0.7], [238, 238, 7, 0.8], [62, 226, 4, 0.6]], "#fff"),
    style,
  });
}

// ---- the catalogue ----------------------------------------------------------------------
const art = {};

art["mock-fruit-slot"] = () => cover({
  bg: [[0, "#ff8a3d"], [0.45, "#e11d48"], [1, "#3d0414"]], glow: "#ffd166", glowAt: [150, 150],
  defs: rad("cherry", [[0, "#ff9aa5"], [0.35, "#f0102e"], [1, "#6d0012"]], 0.35, 0.3, 0.75) +
    rad("orange", [[0, "#ffe2a8"], [0.75, "#ffb02e"], [1, "#e86a00"]]) + lin("leaf", [[0, "#7ee36a"], [1, "#167a2a"]]),
  back: rays(150, 150, 16, "#fff", 0.09),
  motif:
    // orange slice
    `<g transform="translate(205 118) rotate(18)"><circle r="62" fill="#e86a00"/><circle r="56" fill="#fff3d6"/><circle r="50" fill="url(#orange)"/>` +
    Array.from({ length: 10 }, (_, i) => { const [x, y] = pol(0, 0, 48, i * 36); return `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="#fff3d6" stroke-width="3"/>`; }).join("") +
    `<circle r="6" fill="#fff3d6"/></g>` +
    // lemon
    `<g transform="translate(78 120) rotate(-30)"><ellipse rx="40" ry="30" fill="#f6d000"/><ellipse rx="34" ry="24" fill="#ffe94d"/><ellipse cx="-12" cy="-10" rx="12" ry="6" fill="#fff" opacity=".55"/><path d="M38 -4l10 4l-10 4z" fill="#d8b400"/></g>` +
    // cherries
    `<path d="M118 182C120 140 140 108 168 92M178 200C176 150 172 118 168 92" fill="none" stroke="#2f6b1f" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M168 92C182 70 214 66 232 80C214 96 186 100 168 92Z" fill="url(#leaf)"/><path d="M170 91C190 82 210 80 228 80" stroke="#1d5a1d" stroke-width="2" fill="none"/>` +
    `<circle cx="116" cy="214" r="44" fill="url(#cherry)"/><ellipse cx="100" cy="196" rx="13" ry="8" fill="#fff" opacity=".6" transform="rotate(-30 100 196)"/>` +
    `<circle cx="184" cy="226" r="44" fill="url(#cherry)"/><ellipse cx="168" cy="208" rx="13" ry="8" fill="#fff" opacity=".6" transform="rotate(-30 168 208)"/>`,
  front: sparks([[60, 60, 8, 0.9], [250, 200, 7, 0.8], [140, 70, 5, 0.7], [40, 250, 6, 0.6]]),
});

art["mock-gold-slot"] = () => {
  const collar = [[100, "#1d4ed8"], [90, "#ffcf3a"], [80, "#c81e1e"], [70, "#ffcf3a"]]
    .map(([r, c]) => `<path d="M${150 - r} 236A${r} ${r * 0.62} 0 0 0 ${150 + r} 236" fill="none" stroke="${c}" stroke-width="10"/>`).join("");
  return cover({
    bg: [[0, "#0c1f55"], [0.5, "#16328a"], [1, "#050a22"]], glow: "#ffc93c", glowAt: [150, 140], glowR: 180,
    defs: `<pattern id="nemes" width="300" height="16" patternUnits="userSpaceOnUse"><rect width="300" height="9" fill="#f5c542"/><rect y="9" width="300" height="7" fill="#1e3fae"/></pattern>` +
      lin("face", [[0, "#ffe9a0"], [0.5, "#f0b429"], [1, "#9a6400"]], 0.6, 1) + goldDefs,
    back: rays(150, 140, 18, "#ffe08a", 0.12),
    motif:
      collar +
      `<path d="M150 46C210 46 230 80 232 124L254 262H204L192 168H108L96 262H46L68 124C70 80 90 46 150 46Z" fill="url(#nemes)" stroke="#8a5a00" stroke-width="3"/>` +
      `<path d="M150 46C210 46 230 80 232 124L254 262H204L192 168H108L96 262H46L68 124C70 80 90 46 150 46Z" fill="url(#gl)" opacity=".25"/>` +
      `<rect x="98" y="88" width="104" height="14" rx="4" fill="url(#gold)" stroke="#8a5a00" stroke-width="2"/>` +
      `<path d="M150 96C186 96 194 130 192 164C190 200 172 226 150 230C128 226 110 200 108 164C106 130 114 96 150 96Z" fill="url(#face)" stroke="#7a4e00" stroke-width="2"/>` +
      // brows, eyes with kohl, nose, lips
      `<path d="M118 140Q132 130 146 138M154 138Q168 130 182 140" stroke="#1b1b3a" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M118 154Q132 144 144 154Q132 162 118 154ZM156 154Q168 144 182 154Q168 162 156 154Z" fill="#fff"/>` +
      `<circle cx="131" cy="154" r="5" fill="#13132b"/><circle cx="169" cy="154" r="5" fill="#13132b"/>` +
      `<path d="M114 156L104 160M186 156L196 160" stroke="#13132b" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M150 158V186Q146 192 140 190M150 186Q154 192 160 190" stroke="#8a5a00" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<path d="M136 204Q150 212 164 204Q150 200 136 204Z" fill="#b2452c"/>` +
      `<rect x="139" y="226" width="22" height="40" rx="6" fill="url(#nemes)" stroke="#8a5a00" stroke-width="2"/>` +
      // uraeus
      `<path d="M150 62C160 70 160 84 150 92C140 84 140 70 150 62Z" fill="url(#gold)" stroke="#8a5a00" stroke-width="2"/><circle cx="150" cy="76" r="4" fill="#c81e1e"/>`,
    front: sparks([[56, 66, 8, 0.9], [246, 84, 6, 0.8], [256, 200, 5, 0.7], [44, 200, 6, 0.7]], "#fff1b8"),
  });
};

art["mock-roulette"] = () => cover({
  bg: [[0, "#0b3b66"], [0.5, "#0369a1"], [1, "#021320"]], glow: "#7dd3fc", glowAt: [150, 165],
  defs: wheelDefs + goldDefs + rad("ball", [[0, "#fff"], [0.7, "#dfe6ee"], [1, "#8a97a8"]], 0.35, 0.3, 0.7),
  back: rays(150, 165, 20, "#bae6fd", 0.08),
  motif: `<g transform="translate(150 165)"><ellipse cy="12" rx="118" ry="112" fill="#000" opacity=".45"/>${wheel(112, 37, [0])}</g>` +
    `<circle cx="196" cy="93" r="8" fill="url(#ball)"/>` +
    `<path d="M70 110A95 95 0 0 1 120 72" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  front: sparks([[50, 60, 8, 0.9], [258, 70, 6, 0.8], [262, 250, 5, 0.6]]),
});

art["mock-scratch"] = () => {
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = -46 + c * 46, y = -22 + r * 46, k = r * 3 + c;
    if ([0, 4, 8].includes(k)) cells.push(`<circle cx="${x}" cy="${y}" r="19" fill="#fff" stroke="#e7b400" stroke-width="2"/><path d="M${x} ${y - 12}l3.5 7.5l8 .8l-6 5.5l1.8 8l-7.3-4.2l-7.3 4.2l1.8-8l-6-5.5l8-.8z" fill="#ffb800"/>`);
    else if (k === 2) cells.push(`<circle cx="${x}" cy="${y}" r="19" fill="#fff" stroke="#e7b400" stroke-width="2"/><text x="${x}" y="${y + 8}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="24" fill="#e11d48" text-anchor="middle">7</text>`);
    else cells.push(`<circle cx="${x}" cy="${y}" r="19" fill="url(#silver)"/><path d="M${x - 10} ${y - 6}l20 4M${x - 8} ${y + 5}l16 3" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>`);
  }
  return cover({
    bg: [[0, "#4c1d95"], [0.5, "#9333ea"], [1, "#14031f"]], glow: "#f0abfc", glowAt: [150, 160],
    defs: lin("ticket", [[0, "#fff8dd"], [1, "#ffd36b"]], 0.3, 1) + lin("silver", [[0, "#f1f5f9"], [0.5, "#94a3b8"], [1, "#cbd5e1"]], 1, 1) + goldDefs,
    back: rays(150, 160, 14, "#fff", 0.1) + `<polygon points="${burst(150, 160, 18, 130, 100)}" fill="#f0abfc" opacity=".14"/>`,
    motif: `<g transform="translate(150 162) rotate(-8)"><rect x="-86" y="-118" width="172" height="236" rx="16" fill="#000" opacity=".35" transform="translate(6 8)"/>` +
      `<rect x="-86" y="-118" width="172" height="236" rx="16" fill="url(#ticket)" stroke="#e7a400" stroke-width="3"/>` +
      `<rect x="-76" y="-108" width="152" height="40" rx="8" fill="#7e22ce"/>` +
      `<text x="0" y="-80" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="22" fill="#ffd23f" text-anchor="middle" letter-spacing="1">$ WIN $</text>` +
      `<rect x="-74" y="-50" width="148" height="148" rx="10" fill="#7e22ce" opacity=".12"/>${cells.join("")}` +
      `<path d="M-86 108H86" stroke="#e7a400" stroke-dasharray="6 5" stroke-width="2"/></g>` +
      `<g transform="translate(226 236) rotate(-25) scale(1 .55)"><circle r="30" fill="#9a6a00"/><circle r="27" cy="-3" fill="url(#gold)"/><circle r="19" cy="-3" fill="none" stroke="#a87400" stroke-width="3"/></g>` +
      dots([[200, 222, 3, 0.9], [192, 232, 2, 0.8], [206, 214, 2.5, 0.7], [186, 222, 2, 0.6]], "#e2e8f0"),
    front: sparks([[52, 70, 8, 0.9], [254, 88, 6, 0.8], [46, 236, 6, 0.6]]),
  });
};

art["book-of-sands"] = () => cover({
  bg: [[0, "#ffcb5c"], [0.4, "#e08a1e"], [0.75, "#8a3a06"], [1, "#2a0f02"]], glow: "#fff1b0", glowAt: [150, 150], glowR: 190,
  defs: lin("page", [[0, "#fffaf0"], [1, "#e9d3a4"]], 1, 0) + lin("pageR", [[0, "#e9d3a4"], [1, "#fffaf0"]], 1, 0) +
    lin("beam", [[0, "#fff6c8", 0], [1, "#fff6c8", 0.85]]) + goldDefs,
  back: rays(150, 170, 22, "#fff6c8", 0.16) +
    `<path d="M-10 250L60 150L130 250ZM170 250L250 136L330 250Z" fill="#a8520d" opacity=".55"/><path d="M60 150L130 250H90Z M250 136L330 250H290Z" fill="#6b2f05" opacity=".45"/>` +
    `<path d="M0 252C60 236 120 246 170 240C220 234 260 244 300 238V400H0Z" fill="#c26a12"/><path d="M0 268C70 252 150 266 300 252V400H0Z" fill="#9a4c0a"/>`,
  motif:
    `<path d="M150 160L95 70H205Z" fill="url(#beam)" opacity=".7"/>` +
    // eye of Horus
    `<g transform="translate(150 86)" fill="none" stroke="#5a2a00" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M-38 0Q0-28 38 0Q0 22-38 0Z" fill="#fff6d8"/><circle r="10" fill="#1d1004" stroke="none"/><path d="M-40-20Q0-44 42-18"/><path d="M-6 18L-12 44M8 16Q24 40 6 46Q-4 44 4 36"/></g>` +
    // book cover and pages
    `<path d="M40 214L150 232L260 214L262 228L150 248L38 228Z" fill="#5b1d0a"/>` +
    `<path d="M150 232C120 214 82 210 46 218L50 140C86 130 124 134 150 152Z" fill="url(#page)" stroke="#b08850" stroke-width="2"/>` +
    `<path d="M150 232C180 214 218 210 254 218L250 140C214 130 176 134 150 152Z" fill="url(#pageR)" stroke="#b08850" stroke-width="2"/>` +
    `<path d="M150 152V232" stroke="#8a6030" stroke-width="2"/>` +
    // glyph lines on the pages
    `<g stroke="#8a5a1e" stroke-width="3" stroke-linecap="round" opacity=".75"><path d="M66 160l60 8M66 176l26 3M102 180l24 3M66 192l60 7M66 206l40 4"/><path d="M234 160l-60 8M234 176l-30 3M196 180l-22 3M234 192l-60 7M234 206l-36 4"/></g>` +
    `<path d="M40 214L44 142" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/><path d="M260 214L256 142" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>`,
  front: sparks([[150, 130, 10, 1], [110, 112, 5, 0.8], [196, 108, 6, 0.85], [56, 70, 7, 0.8], [252, 64, 6, 0.7]], "#fffbe6") +
    dots([[90, 120, 2, 0.8], [210, 126, 2, 0.8], [170, 100, 1.6, 0.9], [128, 96, 1.6, 0.9]], "#fff6c8"),
});

art["neon-nights"] = () => {
  let grid = "";
  for (let i = -8; i <= 8; i++) grid += `M150 236L${150 + i * 48} 400`;
  for (const y of [244, 256, 272, 294, 324, 362]) grid += `M0 ${y}H300`;
  const city = [[0, 150, 26], [24, 176, 22], [44, 128, 26], [68, 190, 20], [86, 204, 18], [196, 200, 18], [212, 184, 22], [232, 120, 26], [256, 168, 22], [276, 140, 26]];
  let blds = "", wins = "";
  city.forEach(([x, y, w], i) => {
    blds += `<rect x="${x}" y="${y}" width="${w}" height="${236 - y}" fill="#14042b"/><path d="M${x} ${236}V${y}H${x + w}V236" fill="none" stroke="${i % 2 ? "#4ff3ff" : "#ff4fd8"}" stroke-opacity=".55" stroke-width="1.5"/>`;
    for (let wy = y + 10; wy < 228; wy += 14) for (let wx = x + 5; wx < x + w - 5; wx += 8) if ((wx + wy + i) % 3) wins += `M${wx} ${wy}h3v5h-3z`;
  });
  const palm = (x, flip) => `<g transform="translate(${x} 238) scale(${flip * 0.6} .6)" fill="#0d0220" stroke="#ff4fd8" stroke-width="2" stroke-linejoin="round">` +
    `<path d="M-4 0C0-40 6-80 18-118L24-116C14-80 8-40 6 0Z"/>` +
    `<path d="M20-118C0-136-30-132-44-112C-24-122-8-120 20-114ZM20-118C40-140 70-134 82-112C62-124 44-122 22-114ZM20-118C10-150-14-160-34-150C-12-148 4-138 18-116ZM20-118C34-150 58-156 74-144C54-142 38-134 22-116Z"/></g>`;
  return cover({
    bg: [[0, "#0a0124"], [0.4, "#3b0a63"], [0.585, "#c2187a"], [0.59, "#12002a"], [1, "#05000f"]], glow: "#ff2bd6", glowAt: [150, 180], glowR: 160, fade: "#05000f",
    defs: lin("sun", [[0, "#ffe45c"], [0.5, "#ff6a7a"], [1, "#d01d9b"]]) +
      `<mask id="cut"><rect width="300" height="400" fill="#fff"/><g fill="#000">${[170, 186, 200, 212, 222, 230].map((y, i) => `<rect y="${y}" width="300" height="${2 + i * 1.3}"/>`).join("")}</g></mask>`,
    back: dots([[30, 40, 1.4], [80, 70, 1], [120, 30, 1.2], [210, 50, 1.3], [260, 30, 1], [280, 90, 1.2], [44, 100, 1], [240, 104, 0.9], [160, 50, 1]], "#fff") +
      `<circle cx="150" cy="168" r="84" fill="url(#sun)" mask="url(#cut)"/>`,
    motif: blds + `<path d="${wins}" fill="#4ff3ff" opacity=".8"/>` +
      `<path d="M0 236H300" stroke="#ff4fd8" stroke-width="3"/>` +
      `<path d="${grid}" stroke="#ff2bd6" stroke-width="2" stroke-opacity=".75" fill="none"/>` + palm(34, 1) + palm(266, -1),
    front: sparks([[60, 50, 6, 0.9], [244, 70, 5, 0.8]], "#ffd6f5"),
  });
};

art["wild-buffalo"] = () => cover({
  bg: [[0, "#ffd166"], [0.35, "#f97316"], [0.7, "#9a3412"], [1, "#220a02"]], glow: "#fff1b0", glowAt: [150, 120], glowR: 170,
  defs: lin("horn", [[0, "#fffaf0"], [1, "#b49a6a"]]) + rad("fur", [[0, "#7a4322"], [0.7, "#3d1d0c"], [1, "#1f0d04"]], 0.5, 0.35, 0.65),
  back: `<circle cx="150" cy="128" r="70" fill="#ffe7a3" opacity=".75"/>` + rays(150, 128, 18, "#fff1b0", 0.12) +
    `<path d="M0 230L30 200H70L90 222L130 214L170 226L210 196H250L272 216L300 210V400H0Z" fill="#5c1d06" opacity=".75"/>`,
  motif:
    // shaggy mane
    `<path d="M150 70C200 66 250 100 258 150C264 190 240 214 214 222L86 222C60 214 36 190 42 150C50 100 100 66 150 70Z" fill="#2a1206"/>` +
    `<path d="M60 168l-14 10l18 2l-12 14l20-2M240 168l14 10l-18 2l12 14l-20-2" fill="#2a1206"/>` +
    // horns
    `<path d="M98 132C64 134 40 112 44 74C54 98 72 110 104 112Z" fill="url(#horn)" stroke="#3d2a14" stroke-width="2"/>` +
    `<path d="M202 132C236 134 260 112 256 74C246 98 228 110 196 112Z" fill="url(#horn)" stroke="#3d2a14" stroke-width="2"/>` +
    // head
    `<path d="M150 92C192 92 208 122 206 160C204 196 188 228 174 248C166 260 158 266 150 266C142 266 134 260 126 248C112 228 96 196 94 160C92 122 108 92 150 92Z" fill="url(#fur)"/>` +
    `<path d="M108 112Q118 88 134 100Q142 82 156 98Q168 84 178 102Q192 92 194 116Q172 106 150 112Q128 104 108 112Z" fill="#5a2e14"/>` +
    `<ellipse cx="100" cy="150" rx="16" ry="9" fill="#3d1d0c" transform="rotate(25 100 150)"/><ellipse cx="200" cy="150" rx="16" ry="9" fill="#3d1d0c" transform="rotate(-25 200 150)"/>` +
    `<path d="M114 152L140 162M186 152L160 162" stroke="#140602" stroke-width="5" stroke-linecap="round"/>` +
    `<ellipse cx="128" cy="168" rx="7" ry="6" fill="#140602"/><ellipse cx="172" cy="168" rx="7" ry="6" fill="#140602"/><circle cx="130" cy="166" r="2" fill="#ffd166"/><circle cx="174" cy="166" r="2" fill="#ffd166"/>` +
    `<ellipse cx="150" cy="230" rx="34" ry="24" fill="#6b3a1e"/><ellipse cx="150" cy="226" rx="26" ry="15" fill="#8a5232"/>` +
    `<ellipse cx="138" cy="232" rx="6" ry="8" fill="#1a0a03"/><ellipse cx="162" cy="232" rx="6" ry="8" fill="#1a0a03"/>`,
  front: sparks([[52, 52, 6, 0.8], [250, 52, 5, 0.7]], "#fff7d6"),
});

art["sugar-rush-x"] = () => {
  let sp = "M150 140";
  for (let t = 0.3; t <= 6 * Math.PI; t += 0.25) { const r = 3.1 * t; sp += `L${r1(150 + r * Math.cos(t))} ${r1(140 + r * Math.sin(t))}`; }
  const sprinkles = [[40, 60, "#22d3ee", 20], [70, 100, "#facc15", -30], [240, 56, "#a3e635", 40], [262, 110, "#f97316", -10], [40, 180, "#8b5cf6", 60], [260, 190, "#22d3ee", 15], [90, 40, "#f43f5e", 70], [210, 30, "#8b5cf6", -50]]
    .map(([x, y, c, a]) => `<rect x="${x}" y="${y}" width="14" height="5" rx="2.5" fill="${c}" transform="rotate(${a} ${x + 7} ${y + 2.5})"/>`).join("");
  const wrapped = (x, y, rot, c, c2) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-26 0L-44-16L-40 0L-44 16ZM26 0L44-16L40 0L44 16Z" fill="${c2}"/><ellipse rx="30" ry="21" fill="${c}"/><path d="M-14-19L-4 19M4-20L14 18" stroke="#fff" stroke-width="5" opacity=".75"/><ellipse cx="-9" cy="-9" rx="9" ry="4" fill="#fff" opacity=".6"/></g>`;
  return cover({
    bg: [[0, "#ffd1ec"], [0.35, "#f9a8d4"], [0.7, "#c026d3"], [1, "#3b0a45"]], glow: "#fff", glowAt: [150, 140], glowR: 160, fade: "#2a0533",
    defs: rad("lolly", [[0, "#ff7ac6"], [1, "#e11d74"]]) + rad("drop", [[0, "#b5f5ff"], [1, "#0ea5e9"]], 0.35, 0.3, 0.7) + rad("drop2", [[0, "#fff3a3"], [1, "#f59e0b"]], 0.35, 0.3, 0.7),
    back: rays(150, 140, 16, "#fff", 0.16) + sprinkles +
      `<g fill="#fff" opacity=".85"><circle cx="40" cy="250" r="30"/><circle cx="78" cy="238" r="26"/><circle cx="110" cy="256" r="24"/><circle cx="210" cy="252" r="26"/><circle cx="246" cy="236" r="30"/><circle cx="276" cy="256" r="22"/></g>`,
    motif:
      `<rect x="144" y="190" width="12" height="90" rx="6" fill="#fff" stroke="#f0c8de" stroke-width="2"/>` +
      `<circle cx="150" cy="140" r="64" fill="url(#lolly)" stroke="#fff" stroke-width="5"/>` +
      `<path d="${sp}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".92"/>` +
      `<ellipse cx="124" cy="110" rx="18" ry="9" fill="#fff" opacity=".5" transform="rotate(-35 124 110)"/>` +
      wrapped(70, 214, -24, "#7c3aed", "#a78bfa") + wrapped(232, 210, 28, "#14b8a6", "#5eead4") +
      `<path d="M52 140Q52 112 72 112Q92 112 92 140Z" fill="url(#drop)"/><path d="M216 120Q216 92 236 92Q256 92 256 120Z" fill="url(#drop2)"/>` +
      `<ellipse cx="66" cy="122" rx="5" ry="3" fill="#fff" opacity=".7"/><ellipse cx="230" cy="102" rx="5" ry="3" fill="#fff" opacity=".7"/>`,
    front: sparks([[150, 62, 7, 1], [108, 72, 4, 0.9], [196, 196, 6, 0.9]]),
  });
};

art["dragon-fortune"] = () => {
  // A serpentine dragon: a thick gold body with banded scales, wrapped around a lucky coin.
  const body = "M40 270C60 220 30 180 70 150C110 120 160 170 200 140C236 112 214 70 240 54";
  const lantern = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><line y1="-60" y2="-24" stroke="#ffd23f" stroke-width="2"/><rect x="-10" y="-26" width="20" height="6" fill="#ffd23f"/>` +
    `<ellipse rx="24" ry="22" fill="url(#lant)"/><path d="M-12-20Q-18 0-12 20M0-22V22M12-20Q18 0 12 20" stroke="#ffd23f" stroke-opacity=".6" fill="none"/><rect x="-10" y="20" width="20" height="6" fill="#ffd23f"/><path d="M-4 26v16M0 26v20M4 26v16" stroke="#ffd23f" stroke-width="1.5"/></g>`;
  return cover({
    bg: [[0, "#5b0000"], [0.45, "#b91c1c"], [1, "#1f0000"]], glow: "#ffcf4a", glowAt: [150, 160], glowR: 170,
    defs: goldDefs + lin("scale", [[0, "#ffe27a"], [0.5, "#f2a20c"], [1, "#a85800"]], 1, 1) + rad("lant", [[0, "#ff8a5c"], [0.6, "#e0181b"], [1, "#7a0000"]], 0.4, 0.4, 0.7),
    back: rays(150, 160, 24, "#ffd27a", 0.1) +
      `<g fill="none" stroke="#ffcf4a" stroke-opacity=".35" stroke-width="3"><path d="M20 300q20-26 46-10q24-22 46 0"/><path d="M190 300q20-26 46-10q24-22 46 0"/></g>`,
    motif:
      `<g transform="translate(150 164)"><circle r="82" fill="#8a5200"/><circle r="76" cy="-3" fill="url(#gold)"/><circle r="62" cy="-3" fill="none" stroke="#b07000" stroke-width="4"/>` +
      `<rect x="-20" y="-23" width="40" height="40" fill="#7a1010" stroke="#b07000" stroke-width="4"/>` +
      `<g fill="#b07000">${[0, 90, 180, 270].map((a) => { const [x, y] = pol(0, -3, 42, a); return `<circle cx="${x}" cy="${y}" r="6"/>`; }).join("")}</g></g>` +
      `<path d="${body}" fill="none" stroke="#6b2a00" stroke-width="30" stroke-linecap="round"/>` +
      `<path d="${body}" fill="none" stroke="url(#scale)" stroke-width="24" stroke-linecap="round"/>` +
      `<path d="${body}" fill="none" stroke="#a85800" stroke-width="24" stroke-dasharray="2 9" opacity=".7"/>` +
      `<path d="${body}" fill="none" stroke="#c81e1e" stroke-width="6" stroke-dasharray="10 6" transform="translate(-6 -10)" opacity=".9"/>` +
      // head
      `<g transform="translate(240 54) rotate(20)"><path d="M-18 8C-22-16 0-30 22-26L44-18L38-6L50 0L34 8C20 18-10 22-18 8Z" fill="url(#scale)" stroke="#6b2a00" stroke-width="3"/>` +
      `<path d="M-6-20L-22-44M6-24L2-48" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/><circle cx="12" cy="-10" r="5" fill="#fff"/><circle cx="13" cy="-10" r="2.5" fill="#1a0000"/>` +
      `<path d="M40 2Q70 10 66 40M30 10Q52 34 34 52" stroke="#ffe27a" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>` +
      `<g transform="translate(70 150)"><path d="M-6-10L-20-36L4-14ZM8-12L4-40L18-14Z" fill="#c81e1e"/></g>`,
    front: lantern(36, 86, 0.9) + lantern(268, 196, 0.75) + sparks([[110, 70, 7, 0.9], [190, 250, 6, 0.8], [56, 210, 5, 0.7]], "#fff1b8"),
  });
};

art["aztec-gold"] = () => {
  const tiers = [[60, 236, 180], [78, 212, 144], [96, 188, 108], [112, 166, 76]];
  const leaf = (x, y, rot, s, c) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0C30-26 90-26 120 0C90 22 30 24 0 0Z" fill="${c}"/><path d="M4 0H116" stroke="#052e16" stroke-width="3" opacity=".6"/>` +
    `<path d="M30 0L40-14M60 0L70-16M90 0L98-12M30 0L40 14M60 0L70 16M90 0L98 12" stroke="#052e16" stroke-width="2" opacity=".5"/></g>`;
  return cover({
    bg: [[0, "#0f5132"], [0.5, "#166534"], [1, "#03170b"]], glow: "#fde68a", glowAt: [150, 110], glowR: 170,
    defs: goldDefs + lin("stone", [[0, "#cfc4a8"], [1, "#6d6450"]]),
    back: rays(150, 20, 9, "#fef3c7", 0.12, 0.5, 145) + rays(150, 20, 9, "#fef3c7", 0.07, 0.3, 160),
    motif:
      `<g transform="translate(150 108)"><polygon points="${burst(0, 0, 16, 66, 48)}" fill="url(#gold)" stroke="#8a5a00" stroke-width="2"/><circle r="44" fill="url(#gold)" stroke="#8a5a00" stroke-width="3"/>` +
      `<circle r="34" fill="none" stroke="#8a5a00" stroke-width="2" stroke-dasharray="4 4"/><path d="M-20-8h12v6h-12zM8-8h12v6h-12z" fill="#2a1a00"/><path d="M-14 14h28l-4 8h-20z" fill="#2a1a00"/><path d="M0-4v12" stroke="#8a5a00" stroke-width="3"/>` +
      `<circle cx="-14" cy="-5" r="2" fill="#2ee6a8"/><circle cx="14" cy="-5" r="2" fill="#2ee6a8"/></g>` +
      tiers.map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="26" fill="url(#stone)" stroke="#3f3a2c" stroke-width="2"/><rect x="${x}" y="${y}" width="${w}" height="5" fill="url(#gold)" opacity=".85"/>`).join("") +
      `<rect x="128" y="166" width="44" height="96" fill="#5a5240"/><path d="M128 ${176}h44M128 186h44M128 196h44M128 206h44M128 216h44M128 226h44M128 236h44M128 246h44" stroke="#3f3a2c" stroke-width="2"/>` +
      `<rect x="122" y="146" width="56" height="22" fill="url(#stone)" stroke="#3f3a2c" stroke-width="2"/><rect x="140" y="152" width="20" height="16" fill="#1a1608"/>`,
    front: leaf(-20, 60, 30, 1, "#15803d") + leaf(-30, 150, 10, 0.9, "#166534") + leaf(320, 70, 150, 1, "#15803d") + leaf(330, 170, 175, 0.9, "#166534") +
      leaf(-10, 250, -15, 0.8, "#14532d") + leaf(310, 250, 195, 0.8, "#14532d") + sparks([[96, 70, 6, 0.9], [210, 64, 5, 0.8], [230, 150, 4, 0.7]], "#fff7d6"),
  });
};

art["lucky-clover"] = () => {
  const heart = "M0 0C-10-20-46-30-46-56C-46-78-20-84 0-62C20-84 46-78 46-56C46-30 10-20 0 0Z";
  const rainbow = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6"]
    .map((c, i) => `<path d="M${20 + i * 9} 200A${130 - i * 9} ${130 - i * 9} 0 0 1 ${280 - i * 9} 200" fill="none" stroke="${c}" stroke-width="9" opacity=".55"/>`).join("");
  return cover({
    bg: [[0, "#065f46"], [0.5, "#15803d"], [1, "#021a10"]], glow: "#bbf7d0", glowAt: [150, 150],
    defs: rad("clv", [[0, "#86efac"], [0.7, "#22c55e"], [1, "#14532d"]], 0.5, 0.75, 0.8) + goldDefs,
    back: rays(150, 150, 16, "#ecfccb", 0.1) + rainbow,
    motif:
      `<path d="M150 150C156 190 170 220 196 250" stroke="#166534" stroke-width="9" fill="none" stroke-linecap="round"/>` +
      [45, 135, 225, 315].map((a) => `<path d="${heart}" fill="url(#clv)" stroke="#0f5132" stroke-width="3" transform="translate(150 150) rotate(${a})"/>`).join("") +
      [45, 135, 225, 315].map((a) => `<path d="M0-6V-56" stroke="#bbf7d0" stroke-width="2.5" opacity=".7" transform="translate(150 150) rotate(${a})"/>`).join("") +
      `<circle cx="150" cy="150" r="9" fill="#166534"/>` +
      coin(64, 238, 22, -10, 0.9) + coin(98, 254, 18, 15, 0.8) + coin(232, 240, 24, 10, 0.9) + coin(262, 218, 16, -20, 0.8),
    front: sparks([[150, 60, 8, 1], [60, 100, 6, 0.8], [244, 96, 6, 0.8], [204, 200, 5, 0.7]], "#fffbe6"),
  });
};

art["pirate-bay"] = () => {
  const sail = (x, y, w, h) => `<path d="M${x} ${y}Q${x + w / 2} ${y + 10} ${x + w} ${y}L${x + w + 7} ${y + h}Q${x + w / 2} ${y + h + 18} ${x - 7} ${y + h}Z" fill="url(#sail)" stroke="#8a7350" stroke-width="1.5"/>`;
  return cover({
    bg: [[0, "#081a3d"], [0.5, "#1e3a8a"], [1, "#030915"]], glow: "#fef3c7", glowAt: [222, 84], glowR: 120,
    defs: lin("sail", [[0, "#fff8e6"], [1, "#d9c9a0"]], 1, 1) + lin("hull", [[0, "#6b3a1a"], [1, "#2a1206"]]) + lin("sea", [[0, "#1d4ed8"], [1, "#0b1a44"]]),
    back: `<circle cx="222" cy="84" r="38" fill="#fff6d6"/><circle cx="234" cy="76" r="8" fill="#e8dcb0" opacity=".6"/><circle cx="212" cy="96" r="5" fill="#e8dcb0" opacity=".6"/>` +
      dots([[40, 40, 1.4], [90, 70, 1], [130, 30, 1.2], [60, 120, 1], [276, 150, 1.2], [180, 40, 1]]),
    motif:
      `<path d="M116 52V214M170 38V214M222 74V214" stroke="#3b1f0c" stroke-width="5"/>` +
      sail(86, 66, 60, 52) + sail(84, 128, 64, 56) + sail(138, 52, 64, 58) + sail(136, 120, 68, 64) + sail(196, 88, 52, 46) + sail(194, 140, 56, 48) +
      `<g transform="translate(170 40)"><path d="M0 0H38L32 12L38 24H0Z" fill="#0b0b0f"/><circle cx="17" cy="10" r="6" fill="#fff"/><path d="M8 18L26 24M26 18L8 24" stroke="#fff" stroke-width="2"/></g>` +
      `<path d="M40 206H262L244 252H66Z" fill="url(#hull)" stroke="#d9a441" stroke-width="2"/><path d="M48 218H254" stroke="#d9a441" stroke-width="3"/>` +
      `<g fill="#1a0b03">${[80, 108, 136, 164, 192, 220].map((x) => `<circle cx="${x}" cy="232" r="5"/>`).join("")}</g>` +
      `<path d="M262 206L292 196" stroke="#3b1f0c" stroke-width="4"/>`,
    front: `<path d="M0 252Q25 238 50 252T100 252T150 252T200 252T250 252T300 252V400H0Z" fill="url(#sea)"/>` +
      `<path d="M0 252Q25 238 50 252T100 252T150 252T200 252T250 252T300 252" fill="none" stroke="#93c5fd" stroke-width="3" opacity=".7"/>` +
      `<path d="M-20 278Q10 262 40 278T100 278T160 278T220 278T280 278T340 278V400H-20Z" fill="#0d2463"/>` +
      sparks([[60, 70, 6, 0.9], [270, 130, 5, 0.7]], "#fff6d6"),
  });
};

art["aviator-x"] = () => cover({
  bg: [[0, "#ffb15c"], [0.4, "#f97316"], [0.75, "#9a2c06"], [1, "#2a0a02"]], glow: "#fff1c2", glowAt: [190, 130], glowR: 170,
  defs: lin("trail", [[0, "#fff", 0], [1, "#fff", 0.9]], 1, 0) + lin("area", [[0, "#fff", 0.35], [1, "#fff", 0]]) + lin("fus", [[0, "#ff5a4f"], [1, "#a8101a"]]),
  back: rays(190, 130, 16, "#fff1c2", 0.12) +
    `<g fill="#fff" opacity=".75"><circle cx="50" cy="90" r="20"/><circle cx="74" cy="82" r="24"/><circle cx="98" cy="94" r="16"/><rect x="40" y="94" width="66" height="16" rx="8"/></g>` +
    `<g fill="#fff" opacity=".55"><circle cx="230" cy="236" r="18"/><circle cx="252" cy="228" r="22"/><circle cx="274" cy="240" r="14"/><rect x="220" y="238" width="64" height="14" rx="7"/></g>`,
  motif:
    `<path d="M20 262C100 258 150 232 182 160L182 262Z" fill="url(#area)"/>` +
    `<path d="M20 262C100 258 150 232 182 160" fill="none" stroke="url(#trail)" stroke-width="6" stroke-linecap="round"/>` +
    `<g transform="translate(196 140) rotate(-38)">` +
    `<path d="M-60 0C-50-14 30-16 52-6C60-2 60 4 52 8C30 16-50 14-60 0Z" fill="url(#fus)" stroke="#5a0008" stroke-width="2"/>` +
    `<path d="M-6-4L-26-50L-10-50L18-4Z" fill="#e0242f" stroke="#5a0008" stroke-width="2"/><path d="M-4 6L-22 44L-8 44L16 6Z" fill="#b5121c"/>` +
    `<path d="M-54-2L-68-26L-56-26L-40-2Z" fill="#e0242f" stroke="#5a0008" stroke-width="2"/>` +
    `<path d="M14-8C20-20 36-18 40-8Z" fill="#9be7ff" stroke="#5a0008" stroke-width="2"/>` +
    `<rect x="54" y="-5" width="10" height="10" rx="3" fill="#ffd23f"/><ellipse cx="66" cy="0" rx="4" ry="30" fill="#fff" opacity=".5"/>` +
    `<path d="M-40 0H40" stroke="#fff" stroke-width="3" opacity=".6"/></g>`,
  front: sparks([[150, 80, 7, 0.9], [262, 64, 6, 0.8], [120, 200, 5, 0.7]]),
});

art["rocket-moon"] = () => cover({
  bg: [[0, "#1e1b4b"], [0.5, "#3730a3"], [1, "#070618"]], glow: "#a5b4fc", glowAt: [206, 104], glowR: 140,
  defs: rad("moon", [[0, "#fefce8"], [0.7, "#d6d3d1"], [1, "#a8a29e"]], 0.4, 0.35, 0.7) + lin("flame", [[0, "#fff7b0"], [0.4, "#ffb020"], [1, "#ff3d00", 0]]) +
    lin("body", [[0, "#ffffff"], [1, "#b9c2e0"]], 1, 0),
  back: dots([[30, 40, 1.5], [70, 90, 1], [120, 36, 1.2], [270, 200, 1.4], [40, 160, 1.1], [90, 220, 1], [250, 30, 1], [160, 70, 1], [280, 120, 1.3], [20, 240, 1.2]]) +
    `<circle cx="206" cy="104" r="56" fill="url(#moon)"/><circle cx="188" cy="88" r="10" fill="#a8a29e" opacity=".5"/><circle cx="222" cy="122" r="14" fill="#a8a29e" opacity=".45"/><circle cx="228" cy="82" r="6" fill="#a8a29e" opacity=".5"/>`,
  motif:
    `<g fill="#fff" opacity=".35"><circle cx="70" cy="262" r="20"/><circle cx="94" cy="246" r="14"/><circle cx="50" cy="248" r="12"/></g>` +
    `<g transform="translate(126 196) rotate(38)">` +
    `<path d="M-13 42Q0 116 13 42Z" fill="url(#flame)"/><path d="M-7 42Q0 84 7 42Z" fill="#fff7d0"/>` +
    `<path d="M-20 12L-42 48L-18 42ZM20 12L42 48L18 42Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>` +
    `<path d="M0-74C24-48 26-12 20 42H-20C-26-12-24-48 0-74Z" fill="url(#body)" stroke="#4c4f7a" stroke-width="2"/>` +
    `<path d="M0-74C10-64 16-52 19-40H-19C-16-52-10-64 0-74Z" fill="#ef4444"/>` +
    `<circle cy="-14" r="12" fill="#38bdf8" stroke="#4c4f7a" stroke-width="4"/><circle cx="-4" cy="-18" r="4" fill="#fff" opacity=".8"/>` +
    `<rect x="-4" y="12" width="8" height="34" rx="3" fill="#ef4444"/></g>`,
  front: sparks([[60, 60, 6, 0.9], [270, 250, 5, 0.7], [140, 110, 4, 0.7]]),
});

art["plinko-drop"] = () => {
  let pegs = "";
  for (let r = 0; r < 8; r++) for (let i = 0; i <= r + 2; i++) pegs += `<circle cx="${r1(150 + (i - (r + 2) / 2) * 24)}" cy="${68 + r * 22}" r="4.2"/>`;
  const mult = ["#ef4444", "#f97316", "#facc15", "#a3e635", "#22c55e", "#a3e635", "#facc15", "#f97316", "#ef4444"];
  return cover({
    bg: [[0, "#064e48"], [0.5, "#0f766e"], [1, "#021614"]], glow: "#5eead4", glowAt: [150, 150],
    defs: rad("pball", [[0, "#fff"], [0.4, "#ff6fb5"], [1, "#be185d"]], 0.35, 0.3, 0.7),
    back: rays(150, 40, 14, "#ccfbf1", 0.08),
    motif: `<g fill="#e6fffb">${pegs}</g>` +
      `<path d="M150 40L150 66Q162 74 162 88Q140 98 138 110Q150 120 150 132Q172 142 174 154Q160 166 162 176" fill="none" stroke="#ff6fb5" stroke-width="2.5" stroke-dasharray="3 5" opacity=".9"/>` +
      `<circle cx="162" cy="192" r="10" fill="url(#pball)"/><circle cx="162" cy="192" r="16" fill="#ff6fb5" opacity=".25"/>` +
      mult.map((c, i) => `<rect x="${r1(150 + (i - 4) * 24 - 10)}" y="246" width="20" height="16" rx="4" fill="${c}"/>`).join(""),
    front: sparks([[60, 60, 6, 0.8], [244, 80, 6, 0.8]]),
  });
};

art["mines-field"] = () => cover({
  bg: [[0, "#64748b"], [0.45, "#334155"], [1, "#070b14"]], glow: "#fdba74", glowAt: [150, 160], glowR: 170,
  defs: rad("bomb", [[0, "#6b7280"], [0.45, "#1f2937"], [1, "#030712"]], 0.35, 0.3, 0.75) + rad("boom", [[0, "#fff7c2"], [0.5, "#fbbf24"], [1, "#ea580c"]]),
  back: `<polygon points="${burst(150, 168, 14, 128, 84, 8)}" fill="url(#boom)" opacity=".85"/><polygon points="${burst(150, 168, 14, 96, 70)}" fill="#fff3b0" opacity=".55"/>`,
  motif:
    `<circle cx="150" cy="176" r="72" fill="url(#bomb)" stroke="#020617" stroke-width="3"/>` +
    `<ellipse cx="124" cy="146" rx="22" ry="13" fill="#fff" opacity=".35" transform="rotate(-35 124 146)"/>` +
    `<rect x="174" y="92" width="34" height="26" rx="5" fill="#4b5563" stroke="#020617" stroke-width="3" transform="rotate(38 191 105)"/>` +
    `<path d="M200 96C214 72 236 74 238 56" fill="none" stroke="#a16207" stroke-width="5" stroke-linecap="round"/>` +
    `<polygon points="${burst(240, 52, 8, 20, 7)}" fill="#fff7c2"/><polygon points="${burst(240, 52, 8, 12, 5, 20)}" fill="#f97316"/>`,
  front: sparks([[56, 70, 7, 0.9], [252, 230, 6, 0.8], [52, 236, 5, 0.6]]) + dots([[226, 36, 2.5, 0.9], [256, 40, 2, 0.8], [252, 66, 2, 0.8]], "#fde68a"),
});

art["blackjack-classic"] = () => cover({
  bg: [[0, "#0d8a5c"], [0.55, "#065f46"], [1, "#011a12"]], glow: "#a7f3d0", glowAt: [150, 150],
  defs: lin("cardg", [[0, "#ffffff"], [1, "#efe8d6"]], 0.4, 1) + chipDefs,
  back: `<path d="M-20 110A200 200 0 0 0 320 110" fill="none" stroke="#fcd34d" stroke-opacity=".45" stroke-width="3"/><path d="M-20 122A200 200 0 0 0 320 122" fill="none" stroke="#fcd34d" stroke-opacity=".25" stroke-width="1.5"/>`,
  motif: card({ x: 112, y: 150, rot: -14, rank: "A", s: "spade" }) + card({ x: 188, y: 156, rot: 12, rank: "K", s: "heart", red: true }) +
    chipStack(64, 254, 4, "#dc2626") + chipStack(240, 258, 3, "#111827", "#fcd34d"),
  front: sparks([[56, 56, 7, 0.9], [250, 64, 6, 0.8], [150, 54, 5, 0.6]]),
});

art["baccarat-pro"] = () => cover({
  bg: [[0, "#4c0519"], [0.5, "#991b1b"], [1, "#140103"]], glow: "#fcd34d", glowAt: [150, 150],
  defs: lin("cardg", [[0, "#ffffff"], [1, "#efe8d6"]], 0.4, 1) + goldDefs + chipDefs,
  back: rays(150, 150, 20, "#fde68a", 0.08) +
    `<path d="M20 30H280M20 36H280M20 364H280M20 370H280" stroke="url(#gold)" stroke-width="1.5" opacity=".7"/>` +
    `<path d="M150 18L162 30L150 42L138 30Z" fill="url(#gold)"/>`,
  motif:
    `<g transform="translate(150 70)"><path d="M-46 20L-52-22L-24 2L0-34L24 2L52-22L46 20Z" fill="url(#gold)" stroke="#8a5a00" stroke-width="2"/><rect x="-46" y="18" width="92" height="10" rx="3" fill="url(#gold)" stroke="#8a5a00" stroke-width="2"/>` +
    `<circle cx="0" cy="-34" r="5" fill="#ef4444"/><circle cx="-52" cy="-22" r="4" fill="#3b82f6"/><circle cx="52" cy="-22" r="4" fill="#3b82f6"/><circle cx="0" cy="6" r="5" fill="#22c55e"/></g>` +
    card({ x: 116, y: 176, rot: -10, rank: "9", s: "diamond", red: true }) + card({ x: 186, y: 182, rot: 9, rank: "9", s: "club" }) +
    chipStack(150, 268, 3, "#7c2d12", "#fcd34d"),
  front: sparks([[48, 120, 6, 0.8], [256, 120, 6, 0.8], [210, 50, 5, 0.7]], "#fff1b8"),
});

art["american-roulette"] = () => cover({
  bg: [[0, "#450a0a"], [0.5, "#b91c1c"], [1, "#120202"]], glow: "#fecaca", glowAt: [150, 150],
  defs: wheelDefs + goldDefs + chipDefs + rad("ball", [[0, "#fff"], [0.7, "#dfe6ee"], [1, "#8a97a8"]], 0.35, 0.3, 0.7),
  back: rays(150, 150, 18, "#fee2e2", 0.08),
  motif: `<g transform="translate(150 158) scale(1 .56)"><ellipse cy="40" rx="126" ry="122" fill="#1f0a03"/><ellipse cy="24" rx="126" ry="122" fill="#3d1a06"/>${wheel(124, 38, [0, 19])}</g>` +
    `<circle cx="96" cy="128" r="7" fill="url(#ball)"/>` +
    chipStack(78, 262, 3, "#1d4ed8") + chipStack(222, 262, 4, "#16a34a") + chip(150, 250, 20, "#f59e0b"),
  front: sparks([[56, 64, 7, 0.9], [250, 70, 6, 0.8]]),
});

art["keno-blast"] = () => {
  let grid = "";
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    const hit = (r * 8 + c) % 7 === 2;
    grid += `<rect x="${34 + c * 30}" y="${40 + r * 30}" width="24" height="24" rx="5" fill="${hit ? "#22d3ee" : "#ffffff"}" opacity="${hit ? 0.5 : 0.08}"/>`;
  }
  const ball = (x, y, r, c, n) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${c}"/><circle r="${r}" fill="url(#shine)"/><circle r="${r * 0.55}" fill="#fff"/>` +
    `<text y="${r * 0.2}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${r * 0.6}" fill="#0f172a" text-anchor="middle">${n}</text></g>`;
  return cover({
    bg: [[0, "#083344"], [0.5, "#0e7490"], [1, "#011218"]], glow: "#67e8f9", glowAt: [150, 160],
    defs: rad("shine", [[0, "#fff", 0.7], [0.4, "#fff", 0], [1, "#000", 0.35]], 0.35, 0.3, 0.7),
    back: grid + `<polygon points="${burst(150, 168, 16, 120, 70)}" fill="#a5f3fc" opacity=".2"/>`,
    motif: ball(150, 150, 46, "#f59e0b", 7) + ball(86, 196, 34, "#ef4444", 21) + ball(214, 196, 36, "#8b5cf6", 42) + ball(110, 104, 26, "#22c55e", 3) + ball(198, 98, 28, "#ec4899", 15) + ball(152, 232, 28, "#0ea5e9", 64),
    front: sparks([[54, 60, 7, 0.9], [252, 52, 6, 0.8], [262, 250, 5, 0.7]]),
  });
};

// ---- A2 Originals ------------------------------------------------------------------------
art["dice"] = () => {
  const face = (m, fill, pips) => `<g transform="matrix(${m})"><rect x="4" y="4" width="92" height="92" rx="16" fill="${fill}"/>` +
    pips.map(([u, v]) => `<circle cx="${u}" cy="${v}" r="10" fill="#22c55e"/>`).join("") + `</g>`;
  const cube = (tx, ty, s, cls) => `<g class="${cls}"><g transform="translate(${tx} ${ty}) scale(${s})">` +
    `<g transform="translate(-150 -160)"><path d="M150 90L211 125V195L150 230L89 195V125Z" fill="#0b2a18"/>` +
    face(".61,.35,-.61,.35,150,90", "url(#dtop)", [[50, 50]]) +
    face(".61,.35,0,.7,89,125", "url(#dleft)", [[28, 28], [72, 72]]) +
    face(".61,-.35,0,.7,150,160", "url(#dright)", [[28, 28], [50, 50], [72, 72]]) +
    `</g></g></g>`;
  return original({
    accent: "#22c55e", accent2: "#86efac",
    extraDefs: lin("dtop", [[0, "#ffffff"], [1, "#e2e8f0"]]) + lin("dleft", [[0, "#e2e8f0"], [1, "#b6c0cf"]]) + lin("dright", [[0, "#cbd5e1"], [1, "#8d99ad"]]),
    style: `.d1{animation:wob 3.2s ease-in-out infinite;transform-origin:150px 170px;transform-box:view-box}.d2{animation:wob 2.6s ease-in-out -1s infinite reverse;transform-origin:226px 232px;transform-box:view-box}` +
      `@keyframes wob{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-8px) rotate(5deg)}}`,
    motif: `<g filter="url(#neon)" opacity=".9"><path d="M150 80L224 122V206L150 248L76 206V122Z" fill="none" stroke="#22c55e" stroke-width="2.5"/></g>` +
      cube(150, 166, 1.05, "d1") + cube(228, 232, 0.42, "d2"),
  });
};

art["crash"] = () => original({
  accent: "#ef4444", accent2: "#fb923c",
  extraDefs: lin("carea", [[0, "#ef4444", 0.45], [1, "#ef4444", 0]]) + lin("flame", [[0, "#fff7b0"], [0.45, "#ff9a1f"], [1, "#ff3d00", 0]]) + lin("rbody", [[0, "#ffffff"], [1, "#c7cce0"]], 1, 0),
  style: `.r{animation:fl 2.4s ease-in-out infinite;transform-origin:206px 92px;transform-box:view-box}.f{animation:fk .18s ease-in-out infinite alternate;transform-origin:0 44px;transform-box:view-box}` +
    `@keyframes fl{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-8px)}}@keyframes fk{from{transform:scaleY(.85)}to{transform:scaleY(1.12)}}`,
  motif:
    `<path d="M36 258C120 256 170 220 200 104L200 258Z" fill="url(#carea)"/>` +
    `<path d="M36 258C120 256 170 220 200 104" fill="none" stroke="#ff5a4f" stroke-width="5" stroke-linecap="round" filter="url(#neon)"/>` +
    `<g stroke="#fff" stroke-opacity=".18"><path d="M36 258H264M36 210H264M36 162H264M36 114H264" stroke-dasharray="3 6"/></g>` +
    `<g class="r"><g transform="translate(206 92) rotate(28)">` +
    `<g class="f"><path d="M-12 40Q0 104 12 40Z" fill="url(#flame)"/><path d="M-6 40Q0 76 6 40Z" fill="#fff7d0"/></g>` +
    `<path d="M-18 10L-38 44L-16 38ZM18 10L38 44L16 38Z" fill="#ef4444"/>` +
    `<path d="M0-64C22-42 24-10 18 40H-18C-24-10-22-42 0-64Z" fill="url(#rbody)" stroke="#2b2d42" stroke-width="2"/>` +
    `<path d="M0-64C9-56 14-46 17-36H-17C-14-46-9-56 0-64Z" fill="#ef4444"/>` +
    `<circle cy="-10" r="10" fill="#1e1b2e" stroke="#ef4444" stroke-width="3"/><circle cx="-3" cy="-13" r="3" fill="#fff" opacity=".8"/></g></g>`,
});

art["mines"] = () => {
  const gem = (s, cls = "") => `<g class="${cls}"><g transform="scale(${s})"><path d="M-40-12L-24-32H24L40-12L0 38Z" fill="#0b4a7a"/>` +
    `<path d="M-40-12L-24-32L-12-12Z" fill="#7dd3fc"/><path d="M-12-12L-24-32H0Z" fill="#bae6fd"/><path d="M-12-12L0-32L12-12Z" fill="#e0f2fe"/><path d="M12-12L0-32H24Z" fill="#7dd3fc"/><path d="M12-12L24-32L40-12Z" fill="#38bdf8"/>` +
    `<path d="M-40-12H-12L0 38Z" fill="#0ea5e9"/><path d="M-12-12H12L0 38Z" fill="#38bdf8"/><path d="M12-12H40L0 38Z" fill="#0369a1"/></g></g>`;
  const tiles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = 50 + c * 70, y = 64 + r * 70, k = r * 3 + c;
    tiles.push(`<rect x="${x}" y="${y + 5}" width="60" height="60" rx="12" fill="#0c0a18"/><rect x="${x}" y="${y}" width="60" height="60" rx="12" fill="url(#tile)"/>`);
    if (k === 4) tiles.push(`<rect x="${x}" y="${y}" width="60" height="60" rx="12" fill="#0b2b45" stroke="#38bdf8" stroke-width="2"/>`);
    if (k === 2 || k === 6) tiles.push(`<rect x="${x}" y="${y}" width="60" height="60" rx="12" fill="#0b2b45"/><g transform="translate(${x + 30} ${y + 30})">${gem(0.48)}</g>`);
    if (k === 8) tiles.push(`<rect x="${x}" y="${y}" width="60" height="60" rx="12" fill="#3a0d14"/><g transform="translate(${x + 30} ${y + 32})"><circle r="14" fill="#1a1a22"/><path d="M8-10l6-6" stroke="#f97316" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="-18" r="3" fill="#fde047"/><circle cx="-5" cy="-5" r="4" fill="#fff" opacity=".35"/></g>`);
  }
  return original({
    accent: "#0ea5e9", accent2: "#a5f3fc",
    extraDefs: lin("tile", [[0, "#3b3466"], [1, "#25204a"]]),
    style: `.g{animation:gp 2.2s ease-in-out infinite;transform-origin:150px 164px;transform-box:view-box}@keyframes gp{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}`,
    motif: tiles.join("") + `<circle cx="150" cy="164" r="40" fill="#38bdf8" opacity=".25" filter="url(#neon)"/>` +
      `<g transform="translate(150 166)">${gem(0.95, "g")}</g>` + spark(176, 138, 7, 1),
  });
};

art["plinko"] = () => {
  let pegs = "";
  for (let r = 0; r < 7; r++) for (let i = 0; i <= r + 2; i++) pegs += `<circle cx="${r1(150 + (i - (r + 2) / 2) * 26)}" cy="${74 + r * 24}" r="4.5"/>`;
  const slots = ["#ff3d6e", "#ff6a4a", "#ff9f40", "#ffd23f", "#ffd23f", "#ff9f40", "#ff6a4a", "#ff3d6e"];
  // the ball's path: drop, then bounce off a peg in every row
  const path = [[150, 40], [150, 62], [137, 86], [150, 110], [137, 134], [124, 158], [137, 182], [124, 206], [137, 236]];
  const kf = path.map(([x, y], i) => `${Math.round((i / (path.length - 1)) * 85)}%{transform:translate(${x - 150}px,${y - 40}px)}`).join("") + "100%{transform:translate(-13px,196px);opacity:0}";
  return original({
    accent: "#ec4899", accent2: "#f9a8d4",
    extraDefs: rad("pb", [[0, "#fff"], [0.45, "#ffd23f"], [1, "#f59e0b"]], 0.35, 0.3, 0.7),
    style: `.b{animation:drop 2.8s cubic-bezier(.5,0,.6,1) infinite}@keyframes drop{${kf}}`,
    motif: `<g fill="#ffd6ec" filter="url(#neon)">${pegs}</g>` +
      slots.map((c, i) => `<rect x="${r1(150 + (i - 3.5) * 26 - 11)}" y="240" width="22" height="18" rx="5" fill="${c}"/>`).join("") +
      `<g class="b"><circle cx="150" cy="40" r="9" fill="url(#pb)"/><circle cx="150" cy="40" r="15" fill="#ffd23f" opacity=".25"/></g>`,
  });
};

// ---- write ---------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
let max = 0;
for (const [slug, fn] of Object.entries(art)) {
  const svg = fn();
  writeFileSync(join(OUT, `${slug}.svg`), svg + "\n");
  max = Math.max(max, svg.length);
  if (svg.length > 15000) console.warn(`${slug}: ${svg.length} bytes (over 15 KB)`);
}
console.log(`${Object.keys(art).length} covers written to public/games (largest ${max} bytes)`);
