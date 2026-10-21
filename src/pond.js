// Pond shape, depth and ground height. Shared by the terrain, the water
// simulation and the swans so every system agrees on where the shore is.

export const DOMAIN = 40; // side length (m) of the simulated water square, centred on 0

export function pondRadius(theta) {
  return 12.8 + 2.0 * Math.sin(2 * theta + 1.0) + 1.3 * Math.sin(3 * theta + 2.3) + 0.7 * Math.sin(5 * theta + 0.7);
}

// Positive inside the pond: approximate distance (m) to the shore.
export function shoreDist(x, z) {
  return pondRadius(Math.atan2(z, x)) - Math.hypot(x, z);
}

export function waterDepth(x, z) {
  const s = shoreDist(x, z);
  if (s <= 0) return 0;
  return Math.min(2.6, s * 0.3 + s * s * 0.012);
}

function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y) {
  return noise2(x, y) * 0.55 + noise2(x * 2.1 + 17, y * 2.1 - 9) * 0.3 + noise2(x * 4.3 - 31, y * 4.3 + 5) * 0.15;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function groundHeight(x, z) {
  const s = shoreDist(x, z);
  if (s > 0) return -waterDepth(x, z) - 0.015;
  const d = -s;
  const r = Math.hypot(x, z);
  const bank = 0.42 * smooth(0, 3.5, d);
  const roll = 0.5 * (fbm(x * 0.12, z * 0.12) - 0.5) * smooth(2, 8, d);
  const hills = 8 * smooth(30, 75, r) * (0.45 + fbm(x * 0.025 + 3, z * 0.025));
  return bank + roll + hills;
}

// A point well inside the water, for spawning and fallbacks.
export function clampToWater(x, z, margin = 3) {
  let px = x, pz = z;
  for (let i = 0; i < 40 && shoreDist(px, pz) < margin; i++) {
    px *= 0.92; pz *= 0.92;
  }
  return [px, pz];
}
