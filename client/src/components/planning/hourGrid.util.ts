/**
 * Pure time/geometry helpers for the interactive hourly planning grid (`HourGrid`).
 * No React, no DOM - just minutes ↔ "HH:mm" conversions and percentage geometry
 * over a horizontal hour axis. Shared by the grid engine and easy to unit-test.
 */

/** Snap granularity, in minutes (30 = half-hour slots). */
export const SNAP_MIN = 30;

/** Clamp a number into the inclusive [lo, hi] range. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** "08:30" → 510. Tolerates a missing minute part. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + (Number(m) || 0);
}

/** 510 → "08:30" (clamped to a valid 00:00–23:59 wall-clock and rounded - never emits "24:00"). */
export function minToHhmm(min: number): string {
  const v = clamp(Math.round(min), 0, 24 * 60 - 1);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Round a minute value to the nearest 30-minute slot. */
export function snap30(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

/** Total minutes spanned by the visible hour axis [hourStart..hourEnd]. */
export function axisSpanMin(axisStart: number, axisEnd: number): number {
  return Math.max(1, axisEnd - axisStart);
}

/**
 * Left offset (in %) of a block starting at `startMin`, relative to the hour axis.
 * axisStart/axisEnd are expressed in minutes (e.g. 8*60 and 20*60).
 */
export function blockLeftPct(startMin: number, axisStart: number, axisEnd: number): number {
  return ((startMin - axisStart) / axisSpanMin(axisStart, axisEnd)) * 100;
}

/** Width (in %) of a block covering [startMin, endMin] over the hour axis. */
export function blockWidthPct(startMin: number, endMin: number, axisStart: number, axisEnd: number): number {
  return ((endMin - startMin) / axisSpanMin(axisStart, axisEnd)) * 100;
}

/**
 * Convert a horizontal ratio (0..1 across the track) to an absolute minute on the
 * hour axis. `snap` rounds the result to the nearest 30-minute slot.
 */
export function ratioToMin(ratio: number, axisStart: number, axisEnd: number, snap = false): number {
  const raw = axisStart + clamp(ratio, 0, 1) * axisSpanMin(axisStart, axisEnd);
  return snap ? snap30(raw) : raw;
}
