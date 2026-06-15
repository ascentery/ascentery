// svgScene.js v2 — painterly procedural room banners.
// Deterministic from (tags, roomId). Techniques: multi-stop skies,
// atmospheric-perspective depth layers, feTurbulence fog + grain,
// vignette, and per-tag narrative details (lit windows, fireflies,
// chimney smoke, shaded moon, water shimmer).

function mulberry32(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// --- tiny color math for atmospheric perspective ---
function hex2rgb(x) { const n = parseInt(x.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgb2hex([r, g, b]) { return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t)); }

const PALETTES = {
  tavern:   { sky: ["#1c0f08", "#3d2410", "#6b4218"], glow: "#f0b35e", shape: "#170d05", fog: "#8a5a28", mood: "interior" },
  temple:   { sky: ["#171a2c", "#2c2d4a", "#544e74"], glow: "#e8d9a0", shape: "#100f1d", fog: "#6d679c", mood: "interior" },
  guild:    { sky: ["#1d1410", "#3a2818", "#5e4426"], glow: "#e0a854", shape: "#150e08", fog: "#7d5c34", mood: "interior" },
  forest:   { sky: ["#0d1a16", "#1d3a2a", "#3a6647"], glow: "#b8d99a", shape: "#091009", fog: "#3f6b51", mood: "forest" },
  market:   { sky: ["#2a1a10", "#5c3a1c", "#9c6a32"], glow: "#f4c878", shape: "#1c1208", fog: "#a07444", mood: "town" },
  fountain: { sky: ["#141d30", "#2a3f5e", "#4a6b8c"], glow: "#bcd4e8", shape: "#0e1422", fog: "#54759a", mood: "town" },
  street:   { sky: ["#1a1824", "#36324a", "#5c5474"], glow: "#d8c08a", shape: "#121019", fog: "#605a7e", mood: "town" },
  gate:     { sky: ["#1c1a26", "#3c3650", "#665e7e"], glow: "#cfc0a2", shape: "#14121c", fog: "#6c648a", mood: "town" },
  dark:     { sky: ["#07080e", "#10121f", "#1e2236"], glow: "#6a74a8", shape: "#04050a", fog: "#2a3050", mood: "dark" },
  default:  { sky: ["#141828", "#2a3050", "#4a527a"], glow: "#c4bca8", shape: "#0e1120", fog: "#525a82", mood: "town" },
};

function pickPalette(tags) {
  const order = ["tavern", "temple", "guild", "dark", "forest", "market", "fountain", "street", "gate"];
  for (const key of order) if (tags.includes(key)) return PALETTES[key];
  return PALETTES.default;
}

// jagged pine ridge path for one depth layer
function pineRidge(rnd, w, base, hMin, hMax) {
  let d = `M0 ${base + 40}`;
  let x = -10;
  while (x < w) {
    const tw = 22 + rnd() * 36;
    const th = hMin + rnd() * (hMax - hMin);
    const cx = x + tw / 2;
    d += ` L${x.toFixed(0)} ${base} L${(cx - tw * 0.12).toFixed(0)} ${(base - th * 0.55).toFixed(0)}`
       + ` L${(cx - tw * 0.28).toFixed(0)} ${(base - th * 0.55).toFixed(0)} L${cx.toFixed(0)} ${(base - th).toFixed(0)}`
       + ` L${(cx + tw * 0.28).toFixed(0)} ${(base - th * 0.55).toFixed(0)} L${(cx + tw * 0.12).toFixed(0)} ${(base - th * 0.55).toFixed(0)}`
       + ` L${(x + tw).toFixed(0)} ${base}`;
    x += tw * (0.55 + rnd() * 0.4);
  }
  return d + ` L${w} ${base + 40} Z`;
}

// town roofline with chimneys + lit windows
function rooftops(rnd, w, base, hMin, hMax, shape, glow, lit) {
  let d = `M0 ${base + 40}`;
  let x = -8;
  const windows = [];
  const chimneys = [];
  while (x < w) {
    const bw = 46 + rnd() * 70;
    const bh = hMin + rnd() * (hMax - hMin);
    const top = base - bh;
    if (rnd() > 0.4) {
      d += ` L${x.toFixed(0)} ${top + 14} L${(x + bw / 2).toFixed(0)} ${top.toFixed(0)} L${(x + bw).toFixed(0)} ${top + 14}`;
      if (rnd() > 0.6) chimneys.push([x + bw * (0.2 + rnd() * 0.5), top + 6]);
    } else {
      d += ` L${x.toFixed(0)} ${top.toFixed(0)} L${(x + bw).toFixed(0)} ${top.toFixed(0)}`;
    }
    if (lit) {
      const n = Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        windows.push([x + 8 + rnd() * (bw - 16), top + 18 + rnd() * (bh - 26)]);
      }
    }
    x += bw;
  }
  d += ` L${w} ${base + 40} Z`;
  let extras = chimneys.map(([cx, cy]) =>
    `<rect x="${(cx - 3).toFixed(0)}" y="${(cy - 12).toFixed(0)}" width="6" height="12" fill="${shape}"/>`).join("");
  extras += windows.map(([wx, wy]) =>
    `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="3.5" height="5" rx="1" fill="${glow}" opacity="${(0.5 + rnd() * 0.5).toFixed(2)}"/>`).join("");
  return { d, extras, chimneys };
}

export function roomBanner(tags = [], roomId = "x", w = 760, h = 170) {
  const rnd = mulberry32(roomId + tags.join());
  const uid = String(roomId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "x";
  const p = pickPalette(tags);
  const isDark = tags.includes("dark");
  const parts = [];

  // ---------- defs ----------
  parts.push(`<defs>
    <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/>
      <stop offset="0.55" stop-color="${p.sky[1]}"/>
      <stop offset="1" stop-color="${p.sky[2]}"/>
    </linearGradient>
    <radialGradient id="glow${uid}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.9"/>
      <stop offset="0.45" stop-color="${p.glow}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig${uid}" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
    <linearGradient id="fade${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14161f" stop-opacity="0"/>
      <stop offset="1" stop-color="#14161f" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="fog${uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.045" numOctaves="3" seed="${Math.floor(rnd() * 99)}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 ${hex2rgb(p.fog)[0] / 255}  0 0 0 0 ${hex2rgb(p.fog)[1] / 255}  0 0 0 0 ${hex2rgb(p.fog)[2] / 255}  0 0 0 0.55 0"/>
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <filter id="grain${uid}">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="g"/>
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>
    </filter>
    <filter id="soft${uid}"><feGaussianBlur stdDeviation="1.4"/></filter>
  </defs>`);

  parts.push(`<rect width="${w}" height="${h}" fill="url(#sky${uid})"/>`);

  // ---------- celestial / light source ----------
  if (p.mood !== "interior") {
    const mx = w * (0.55 + rnd() * 0.35);
    const my = h * (0.16 + rnd() * 0.2);
    parts.push(`<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="85" fill="url(#glow${uid})"/>`);
    if (!isDark) {
      // shaded moon: disc + offset shadow crescent
      parts.push(
        `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="13" fill="${mix(p.glow, "#ffffff", 0.4)}"/>`,
        `<circle cx="${(mx - 4.5).toFixed(0)}" cy="${(my - 3).toFixed(0)}" r="12" fill="url(#sky${uid})" opacity="0.55"/>`,
        `<circle cx="${(mx + 4).toFixed(0)}" cy="${(my + 3).toFixed(0)}" r="2" fill="${p.sky[1]}" opacity="0.35"/>`,
      );
    }
    // stars
    const starN = isDark ? 40 : 18;
    for (let i = 0; i < starN; i++) {
      parts.push(`<circle cx="${(rnd() * w).toFixed(0)}" cy="${(rnd() * h * 0.55).toFixed(0)}" r="${(0.5 + rnd() * 0.9).toFixed(1)}" fill="#e8ecf8" opacity="${(0.25 + rnd() * 0.55).toFixed(2)}"/>`);
    }
    // drifting cloud band
    parts.push(`<ellipse cx="${(w * rnd()).toFixed(0)}" cy="${(h * 0.3).toFixed(0)}" rx="${(w * 0.4).toFixed(0)}" ry="22" fill="${mix(p.sky[2], p.glow, 0.25)}" opacity="0.10" filter="url(#soft${uid})"/>`);
  }

  // ---------- depth layers ----------
  if (p.mood === "forest" || p.mood === "dark") {
    // 4 ridges, far → near, fading toward sky color (atmospheric perspective)
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);                       // 0 far → 1 near
      const col = mix(p.sky[2], p.shape, 0.35 + t * 0.65);
      const base = h - 4 - (layers - 1 - i) * 16;
      const d = pineRidge(rnd, w, base, 28 + t * 30, 56 + t * 60);
      parts.push(`<path d="${d}" fill="${col}"/>`);
      if (i === 1) {
        // fog bank between far and near ridges
        parts.push(`<rect x="0" y="${(base - 46).toFixed(0)}" width="${w}" height="60" filter="url(#fog${uid})" opacity="0.6"/>`);
      }
    }
    // fireflies
    if (!isDark || rnd() > 0.4) {
      const n = 7 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        parts.push(`<circle cx="${(rnd() * w).toFixed(0)}" cy="${(h * 0.55 + rnd() * h * 0.4).toFixed(0)}" r="${(0.8 + rnd()).toFixed(1)}" fill="#d8f0a0" opacity="${(0.4 + rnd() * 0.5).toFixed(2)}"/>`);
      }
    }
  } else if (p.mood === "town") {
    // far skyline (unlit, hazy) then near skyline (lit windows, chimneys)
    const far = rooftops(rnd, w, h - 26, 22, 44, mix(p.sky[2], p.shape, 0.45), p.glow, false);
    parts.push(`<path d="${far.d}" fill="${mix(p.sky[2], p.shape, 0.45)}" opacity="0.9"/>`);
    parts.push(`<rect x="0" y="${h - 80}" width="${w}" height="55" filter="url(#fog${uid})" opacity="0.5"/>`);
    const near = rooftops(rnd, w, h - 2, 40, 78, p.shape, p.glow, true);
    parts.push(`<path d="${near.d}" fill="${p.shape}"/>`, near.extras);
    // chimney smoke wisps
    for (const [cx, cy] of near.chimneys.slice(0, 2)) {
      parts.push(`<path d="M${cx.toFixed(0)} ${(cy - 14).toFixed(0)} q6 -10 -2 -20 q-7 -9 3 -18" stroke="${mix(p.fog, "#ffffff", 0.3)}" stroke-width="4" fill="none" opacity="0.25" filter="url(#soft${uid})" stroke-linecap="round"/>`);
    }
    if (tags.includes("fountain")) {
      const fx = w / 2;
      parts.push(
        `<ellipse cx="${fx}" cy="${h - 14}" rx="64" ry="10" fill="${mix(p.glow, p.sky[0], 0.3)}" opacity="0.5"/>`,
        `<ellipse cx="${fx}" cy="${h - 16}" rx="48" ry="6" fill="${p.glow}" opacity="0.25"/>`,
        `<rect x="${fx - 4}" y="${h - 52}" width="8" height="36" rx="3" fill="${p.shape}"/>`,
        `<path d="M${fx - 26} ${h - 24} Q${fx} ${h - 78} ${fx + 26} ${h - 24}" stroke="${mix(p.glow, "#ffffff", 0.3)}" stroke-width="2.5" fill="none" opacity="0.8"/>`,
        `<path d="M${fx - 14} ${h - 28} Q${fx} ${h - 62} ${fx + 14} ${h - 28}" stroke="${mix(p.glow, "#ffffff", 0.3)}" stroke-width="2" fill="none" opacity="0.55"/>`,
        // shimmer dashes on the basin
        ...Array.from({ length: 5 }, () =>
          `<rect x="${(fx - 50 + rnd() * 100).toFixed(0)}" y="${(h - 18 + rnd() * 6).toFixed(0)}" width="${(6 + rnd() * 10).toFixed(0)}" height="1.4" rx="0.7" fill="#ffffff" opacity="${(0.2 + rnd() * 0.3).toFixed(2)}"/>`),
      );
    }
  } else {
    // ---------- interiors: beams, hanging lanterns, hearth, furniture line ----------
    parts.push(`<rect x="0" y="0" width="${w}" height="${h}" filter="url(#fog${uid})" opacity="0.35"/>`);
    // rafters: angled beam pairs
    for (let i = 0; i < 3; i++) {
      const bx = w * (0.08 + i * 0.34 + rnd() * 0.1);
      parts.push(`<rect x="${bx.toFixed(0)}" y="0" width="11" height="${(h * 0.5).toFixed(0)}" fill="${p.shape}" opacity="0.85"/>`);
    }
    parts.push(`<rect x="0" y="0" width="${w}" height="10" fill="${p.shape}" opacity="0.9"/>`);
    // hanging lanterns with chains + glow
    const lanterns = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < lanterns; i++) {
      const lx = w * (0.12 + rnd() * 0.76);
      const ly = 26 + rnd() * 26;
      parts.push(
        `<line x1="${lx.toFixed(0)}" y1="8" x2="${lx.toFixed(0)}" y2="${ly.toFixed(0)}" stroke="${p.shape}" stroke-width="1.6"/>`,
        `<circle cx="${lx.toFixed(0)}" cy="${(ly + 10).toFixed(0)}" r="46" fill="url(#glow${uid})"/>`,
        `<rect x="${(lx - 5).toFixed(0)}" y="${ly.toFixed(0)}" width="10" height="14" rx="3" fill="${p.shape}"/>`,
        `<rect x="${(lx - 3).toFixed(0)}" y="${(ly + 3).toFixed(0)}" width="6" height="8" rx="2" fill="${mix(p.glow, "#ffffff", 0.35)}"/>`,
      );
    }
    // hearth on one side for tavern/guild
    if (tags.includes("tavern") || tags.includes("guild") || tags.includes("firelight")) {
      const hx = rnd() > 0.5 ? w * 0.82 : w * 0.14;
      parts.push(
        `<rect x="${(hx - 34).toFixed(0)}" y="${h - 66}" width="68" height="66" rx="4" fill="${p.shape}"/>`,
        `<rect x="${(hx - 20).toFixed(0)}" y="${h - 44}" width="40" height="44" rx="14" fill="${mix(p.glow, "#ff7030", 0.5)}" opacity="0.85"/>`,
        `<circle cx="${hx.toFixed(0)}" cy="${(h - 30).toFixed(0)}" r="55" fill="url(#glow${uid})" opacity="0.8"/>`,
        `<path d="M${hx.toFixed(0)} ${h - 38} q9 12 0 26 q-9 -14 0 -26 Z" fill="#ffb050" opacity="0.95"/>`,
        `<path d="M${hx.toFixed(0)} ${h - 30} q5 8 0 16 q-5 -8 0 -16 Z" fill="#ffe6a8"/>`,
      );
    }
    // candle-lit table line with tankards/silhouettes
    parts.push(`<rect x="0" y="${h - 20}" width="${w}" height="20" fill="${p.shape}"/>`);
    const props = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < props; i++) {
      const px = w * (0.1 + rnd() * 0.8);
      const tall = 8 + rnd() * 8;
      parts.push(`<rect x="${px.toFixed(0)}" y="${(h - 20 - tall).toFixed(0)}" width="${(5 + rnd() * 5).toFixed(0)}" height="${tall.toFixed(0)}" rx="2" fill="${p.shape}"/>`);
    }
  }

  // ---------- atmosphere finish ----------
  parts.push(
    `<rect width="${w}" height="${h}" fill="url(#vig${uid})"/>`,
    `<rect width="${w}" height="${h}" filter="url(#grain${uid})"/>`,
    `<rect x="0" y="${h - 52}" width="${w}" height="52" fill="url(#fade${uid})"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Scene" preserveAspectRatio="xMidYMid slice">${parts.join("")}</svg>`;
}
