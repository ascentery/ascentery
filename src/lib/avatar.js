// avatar.js — layered SVG portraits, deterministic from name + opts
const SKINS = ["#e8c39e", "#caa07a", "#9c6b48", "#6e4a30", "#b8c4c9", "#9aab87"];
const HAIRS = ["#2b2118", "#5a3a22", "#8c6239", "#c9a05a", "#7a7d85", "#3d2f4f"];
const STYLES = ["crop", "long", "hood", "bald", "braids"];

function hashOf(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function avatarSvg(name = "?", opts = {}, size = 36) {
  const h = hashOf(name);
  const skin = opts.skin ?? SKINS[h % SKINS.length];
  const hair = opts.hair ?? HAIRS[(h >> 3) % HAIRS.length];
  const style = opts.style ?? STYLES[(h >> 6) % STYLES.length];
  const bg = `hsl(${h % 360} 28% 22%)`;

  let hairShape = "";
  if (style === "crop") hairShape = `<path d="M9 14 Q18 5 27 14 L27 11 Q18 2 9 11 Z" fill="${hair}"/>`;
  if (style === "long") hairShape = `<path d="M8 13 Q18 3 28 13 L28 27 L24 27 L24 14 L12 14 L12 27 L8 27 Z" fill="${hair}"/>`;
  if (style === "hood") hairShape = `<path d="M6 16 Q18 0 30 16 L30 30 L6 30 Z" fill="#2a2d3d"/>`;
  if (style === "braids") hairShape = `<path d="M9 12 Q18 4 27 12 L27 26 L24 26 L24 13 L12 13 L12 26 L9 26 Z" fill="${hair}"/><circle cx="10.5" cy="27" r="2" fill="${hair}"/><circle cx="25.5" cy="27" r="2" fill="${hair}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="${size}" height="${size}" role="img" aria-label="${name}">
    <rect width="36" height="36" rx="18" fill="${bg}"/>
    <circle cx="18" cy="16" r="8.5" fill="${skin}"/>
    <path d="M7 33 Q18 22 29 33 L29 36 L7 36 Z" fill="${skin}" opacity="0.9"/>
    ${hairShape}
    <circle cx="15" cy="16" r="1.1" fill="#22202a"/>
    <circle cx="21" cy="16" r="1.1" fill="#22202a"/>
  </svg>`;
}
