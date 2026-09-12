/** Native SVG decorations for Fitdog VIP — Sky Blue. Not flattened mockup PNGs. */

export const SKY = {
  ice: "#E7F7FC",
  mist: "#C8EDF8",
  aqua: "#9FDEF2",
  lagoon: "#6EC6E8",
  wave: "#4EAFD8",
  deep: "#2F7FB0",
  wedge: "#24648F",
  ink: "#1C4E76",
  label: "#3A6F91",
  vip: "#1A406C",
  orange: "#F37021",
  white: "#FFFFFF"
} as const;

export function skyFrontBackgroundMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="638" viewBox="0 0 1011 638">
  <defs>
    <linearGradient id="skyFrontFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY.ice}"/>
      <stop offset="0.55" stop-color="${SKY.mist}"/>
      <stop offset="1" stop-color="${SKY.aqua}"/>
    </linearGradient>
  </defs>
  <rect width="1011" height="638" fill="url(#skyFrontFill)"/>
</svg>`;
}

export function skyBackBackgroundMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="638" viewBox="0 0 1011 638">
  <defs>
    <linearGradient id="skyBackFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${SKY.ice}"/>
      <stop offset="0.62" stop-color="${SKY.mist}"/>
      <stop offset="1" stop-color="${SKY.aqua}"/>
    </linearGradient>
  </defs>
  <rect width="1011" height="638" fill="url(#skyBackFill)"/>
</svg>`;
}

export function coastalGraphicMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="250" viewBox="0 0 460 250">
  <g fill="${SKY.lagoon}" opacity="0.55">
    <path d="M42 248 C42 170 78 128 108 128 C92 168 86 210 90 248 Z"/>
    <path d="M78 248 C86 186 118 142 148 138 C132 176 128 214 132 248 Z"/>
    <ellipse cx="108" cy="122" rx="28" ry="36"/>
    <ellipse cx="148" cy="132" rx="34" ry="42"/>
    <path d="M210 248 C214 190 246 150 278 148 C262 186 258 220 262 248 Z"/>
    <ellipse cx="278" cy="142" rx="40" ry="48"/>
    <path d="M318 248 C322 200 348 168 376 164 C364 196 360 224 362 248 Z"/>
    <ellipse cx="378" cy="158" rx="26" ry="34"/>
  </g>
  <g fill="${SKY.wave}" opacity="0.7">
    <rect x="188" y="168" width="54" height="80" rx="4"/>
    <path d="M176 168 H254 L246 148 H184 Z"/>
    <rect x="208" y="186" width="14" height="18" fill="${SKY.mist}" opacity="0.9"/>
    <rect x="228" y="186" width="10" height="14" fill="${SKY.mist}" opacity="0.9"/>
    <path d="M215 148 L215 118 L248 148 Z"/>
  </g>
</svg>`;
}

export function pawPatternMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <g fill="${SKY.deep}" opacity="0.1">
    <ellipse cx="110" cy="132" rx="38" ry="30"/>
    <circle cx="70" cy="86" r="16"/>
    <circle cx="102" cy="70" r="16"/>
    <circle cx="136" cy="74" r="15"/>
    <circle cx="158" cy="98" r="14"/>
  </g>
</svg>`;
}

export function pawAccentMarkup(fill = SKY.ink) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <g fill="${fill}">
    <ellipse cx="24" cy="30" rx="10" ry="8"/>
    <circle cx="12" cy="18" r="4.2"/>
    <circle cx="21" cy="13" r="4.2"/>
    <circle cx="31" cy="14" r="4"/>
    <circle cx="37" cy="21" r="3.6"/>
  </g>
</svg>`;
}

export function waveAccentMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="160" viewBox="0 0 1011 160">
  <path d="M0 70 C180 10 320 120 520 58 C720 0 860 110 1011 40 L1011 160 L0 160 Z" fill="${SKY.lagoon}" opacity="0.55"/>
  <path d="M0 96 C200 40 380 130 560 84 C760 30 900 120 1011 70 L1011 160 L0 160 Z" fill="${SKY.wave}" opacity="0.7"/>
</svg>`;
}

export function backWedgeMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="638" viewBox="0 0 280 638">
  <path d="M118 0 L280 0 L280 638 L28 638 Z" fill="${SKY.wedge}"/>
  <g fill="${SKY.aqua}" opacity="0.18">
    <ellipse cx="210" cy="210" rx="70" ry="90"/>
    <path d="M120 420 C150 340 210 300 250 300 C220 360 210 410 220 500 Z"/>
  </g>
</svg>`;
}

export function vipScriptMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="210" viewBox="0 0 250 210">
  <path d="M86 18 L102 34 L118 18 L132 32 C118 28 108 40 124 52 L92 44 C78 58 64 40 78 30 Z" fill="${SKY.lagoon}"/>
  <text x="8" y="148" font-family="Georgia, 'Palatino Linotype', Palatino, Times, serif" font-size="118" font-style="italic" font-weight="700" fill="${SKY.vip}">VIP</text>
</svg>`;
}

export function orangeSwooshMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="18" viewBox="0 0 260 18">
  <path d="M4 12 C70 4 140 16 256 8" fill="none" stroke="${SKY.orange}" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}

export function pinMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
  <path d="M11 1 C6 1 2 5.2 2 10.4 C2 17 11 27 11 27 C11 27 20 17 20 10.4 C20 5.2 16 1 11 1 Z" fill="${SKY.ink}"/>
  <circle cx="11" cy="10.2" r="3.4" fill="${SKY.white}"/>
</svg>`;
}

function iconCircle(inner: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
  <circle cx="44" cy="44" r="30" fill="none" stroke="${SKY.ink}" stroke-width="3.2"/>
  ${inner}
</svg>`;
}

export const SERVICE_ICONS = {
  daycare: iconCircle(
    `<circle cx="44" cy="44" r="10" fill="none" stroke="${SKY.ink}" stroke-width="3"/><g stroke="${SKY.ink}" stroke-width="3" stroke-linecap="round"><path d="M44 28 V24"/><path d="M44 64 V60"/><path d="M28 44 H24"/><path d="M64 44 H60"/><path d="M33 33 L30 30"/><path d="M55 55 L58 58"/><path d="M55 33 L58 30"/><path d="M33 55 L30 58"/></g>`
  ),
  boarding: iconCircle(
    `<rect x="30" y="38" width="28" height="16" rx="3" fill="none" stroke="${SKY.ink}" stroke-width="3"/><path d="M30 42 H58" stroke="${SKY.ink}" stroke-width="3"/><circle cx="36" cy="50" r="1.6" fill="${SKY.ink}"/><circle cx="52" cy="50" r="1.6" fill="${SKY.ink}"/>`
  ),
  training: iconCircle(
    `<rect x="32" y="40" width="24" height="10" rx="2" fill="none" stroke="${SKY.ink}" stroke-width="3"/><circle cx="30" cy="45" r="5" fill="none" stroke="${SKY.ink}" stroke-width="3"/><circle cx="58" cy="45" r="5" fill="none" stroke="${SKY.ink}" stroke-width="3"/>`
  ),
  hikes: iconCircle(
    `<path d="M22 58 L38 34 L48 46 L58 30 L70 58 Z" fill="none" stroke="${SKY.ink}" stroke-width="3" stroke-linejoin="round"/>`
  ),
  beach: iconCircle(
    `<path d="M24 50 C34 40 42 58 54 46 C62 40 68 50 74 46" fill="none" stroke="${SKY.ink}" stroke-width="3" stroke-linecap="round"/><path d="M24 58 C36 50 46 64 58 54 C66 48 72 58 76 54" fill="none" stroke="${SKY.ink}" stroke-width="3" stroke-linecap="round"/>`
  ),
  grooming: iconCircle(
    `<ellipse cx="44" cy="50" rx="12" ry="9" fill="none" stroke="${SKY.ink}" stroke-width="3"/>
     <circle cx="32" cy="36" r="4" fill="none" stroke="${SKY.ink}" stroke-width="2.6"/>
     <circle cx="42" cy="32" r="4" fill="none" stroke="${SKY.ink}" stroke-width="2.6"/>
     <circle cx="52" cy="33" r="4" fill="none" stroke="${SKY.ink}" stroke-width="2.6"/>
     <circle cx="58" cy="40" r="3.6" fill="none" stroke="${SKY.ink}" stroke-width="2.6"/>`
  )
} as const;
