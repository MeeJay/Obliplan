// Deterministic per-project shading of an hour-type colour.
//
// A shift is coloured by its hour-type (e.g. "BACK" = indigo). When a PROJECT is attached
// we nudge that colour lighter/darker so every project reads as a distinct but related tint
// of the same family (OCI = darker indigo, CL = lighter indigo…). The shade is a pure
// function of (baseColour, projectId): nothing is stored on the project, the same project
// always maps to the same shade, and the same project on another hour-type shades THAT
// colour instead. So a project can live on several hour-types without conflict.

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Stable non-negative hash of an integer (Knuth multiplicative), independent of id ordering. */
function hashInt(n: number): number {
  return (Math.imul(n, 2654435761) >>> 0);
}

function hexToHsl(hex: string): Hsl | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hue, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

// Lightness offsets (in %) spread around the base, picked by a stable hash of the project id.
// Index 0 = no shift (kept for a projectless base), the rest alternate darker/lighter.
const LIGHTNESS_STEPS = [0, -15, 15, -8, 8, -22, 22, -11, 11, -26, 26];

/**
 * Shade a base hour-type colour by the attached project. Returns the base unchanged when
 * there is no project (or the base is not a valid hex). Lightness is clamped to a readable
 * band so no project ever renders too dark or too washed-out.
 */
export function shadeForProject(baseHex: string | null | undefined, projectId: number | null | undefined): string | null {
  if (!baseHex) return baseHex ?? null;
  if (projectId == null) return baseHex;
  const hsl = hexToHsl(baseHex);
  if (!hsl) return baseHex;
  const delta = LIGHTNESS_STEPS[hashInt(projectId) % LIGHTNESS_STEPS.length];
  if (delta === 0) return baseHex;
  const l = clamp(hsl.l + delta, 30, 72);
  return hslToHex(hsl.h, hsl.s, l);
}
