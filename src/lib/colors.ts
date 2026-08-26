/**
 * One brand colour, two jobs.
 *
 * The app paints a role, a status or a booking source with a single hex and
 * then uses it both ways: as a solid fill with white text on it (an avatar),
 * and as the text of a badge sitting on a 12% wash of itself. A hex dark enough
 * for the first is too dark to read in the second, and the reverse. Booking
 * com's navy #003580 measured 1.6:1 as badge text; the role colours, after they
 * were darkened so white initials would read on the avatar, dropped to 2.0–3.2.
 *
 * So: keep the brand hex for fills, and run it through onDark() wherever it
 * becomes text on this app's dark surfaces. Same hue, lifted only as far as it
 * has to go.
 */

const CARD = '#1a1d2e';
// These badges sit on a wash of their own colour — `background: hex + '20'` is
// the pattern all over this app — and that wash lifts the backdrop a little.
// Measuring against the bare card left them ~7% short of where they landed in
// the browser, so the backdrop used here is the composite they actually get.
const TINT_ALPHA = 0x20 / 255;
const TARGET = 4.6;

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const cache = new Map<string, string>();

/** The same colour, lightened just until it reads as text on a dark card. */
export function onDark(hex: string): string {
  if (!hex || hex[0] !== '#') return hex;
  const hit = cache.get(hex);
  if (hit) return hit;

  const card = toRgb(CARD);
  const base = toRgb(hex);
  const bg = card.map((c, i) => Math.round(base[i] * TINT_ALPHA + c * (1 - TINT_ALPHA))) as [number, number, number];
  let rgb = base;
  // Walk toward white in small steps rather than jumping: it holds the hue,
  // which is the whole point of using the brand colour in the first place.
  for (let i = 0; i < 40 && contrast(rgb, bg) < TARGET; i++) {
    rgb = rgb.map((v) => Math.min(255, Math.round(v + (255 - v) * 0.12))) as [number, number, number];
  }
  const out = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  cache.set(hex, out);
  return out;
}
