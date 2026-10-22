// Time of day. One value t in [0, 1): 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
// Every light, sky, fog and water colour is read from this table by sun elevation,
// so transitions stay continuous and nothing pops.

import * as THREE from 'three';

const TAU = Math.PI * 2;

const KEYS = [
  { e: -1.0, zen: '#03070f', hor: '#0b1322', sun: '#000000', sunI: 0, sky: '#4a5f96', gnd: '#10150f', ambI: 0.7, fog: '#0c1424', fogD: 0.009, exp: 1.45, moon: 1, stars: 1, deep: '#020c0c' },
  { e: -0.24, zen: '#081127', hor: '#1a2644', sun: '#000000', sunI: 0, sky: '#4a5d92', gnd: '#10140f', ambI: 0.7, fog: '#141f36', fogD: 0.008, exp: 1.35, moon: 0.9, stars: 0.85, deep: '#041312' },
  { e: -0.07, zen: '#2c2c62', hor: '#c06a6a', sun: '#ff5a2e', sunI: 0, sky: '#4a4a74', gnd: '#141210', ambI: 0.55, fog: '#4b3d55', fogD: 0.005, exp: 1.75, moon: 0.45, stars: 0.25, deep: '#081a18' },
  { e: 0.0, zen: '#6a5f9c', hor: '#f59a5c', sun: '#ff7436', sunI: 1.1, sky: '#a38a8e', gnd: '#2b2416', ambI: 0.75, fog: '#b98670', fogD: 0.0045, exp: 1.6, moon: 0.1, stars: 0, deep: '#0d2721' },
  { e: 0.13, zen: '#5f80be', hor: '#f6c48e', sun: '#ffc489', sunI: 2.4, sky: '#9fb2cc', gnd: '#3b3320', ambI: 0.85, fog: '#d3bfa2', fogD: 0.0045, exp: 1.15, moon: 0, stars: 0, deep: '#103329' },
  { e: 0.42, zen: '#3e7bc6', hor: '#bcd5e8', sun: '#fff0dc', sunI: 3.1, sky: '#a9c4df', gnd: '#46402a', ambI: 1.0, fog: '#c2d5e1', fogD: 0.004, exp: 1.0, moon: 0, stars: 0, deep: '#12382e' },
  { e: 1.0, zen: '#2f6bbf', hor: '#b2cfe8', sun: '#fff6ea', sunI: 3.3, sky: '#a9c4df', gnd: '#46402a', ambI: 1.05, fog: '#c2d5e1', fogD: 0.004, exp: 1.0, moon: 0, stars: 0, deep: '#133b31' },
];
const COLOR_KEYS = ['zen', 'hor', 'sun', 'sky', 'gnd', 'fog', 'deep'];
const NUM_KEYS = ['sunI', 'ambI', 'fogD', 'exp', 'moon', 'stars'];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

export function createTimeState() {
  const s = { t: 0, e: 0, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), night: 0, fireflies: 0 };
  for (const c of COLOR_KEYS) s[c] = new THREE.Color();
  for (const n of NUM_KEYS) s[n] = 0;
  return s;
}

export function sampleTime(t, s) {
  s.t = t;
  const a = (t - 0.25) * TAU;
  s.sunDir.set(Math.cos(a) * 0.6, Math.sin(a) * 0.8, -0.7).normalize();
  s.moonDir.set(-Math.cos(a) * 0.5, -Math.sin(a) * 0.72, -0.78).normalize();
  const e = Math.sin(a);
  s.e = e;
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const f = Math.min(1, Math.max(0, (e - A.e) / (B.e - A.e)));
  for (const c of COLOR_KEYS) s[c].copy(A[c]).lerp(B[c], f);
  for (const n of NUM_KEYS) s[n] = A[n] + (B[n] - A[n]) * f;
  s.night = Math.min(1, Math.max(0, (0.02 - e) / 0.2));
  // Fireflies start in late dusk and are gone by early dawn.
  s.fireflies = Math.min(1, Math.max(0, (-0.03 - e) / 0.12));
  return s;
}

export function clockLabel(t) {
  const mins = Math.floor(t * 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function phaseLabel(t) {
  const h = t * 24;
  if (h < 4.5 || h >= 19.75) return 'Night';
  if (h < 7) return 'Dawn';
  if (h < 11) return 'Morning';
  if (h < 14) return 'Midday';
  if (h < 17.25) return 'Afternoon';
  return 'Dusk';
}
