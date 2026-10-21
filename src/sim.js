// Water surface: a damped 2D wave equation on a height grid.
//
// It runs on the CPU at a fixed 60 Hz and is uploaded to the GPU as a float
// texture each frame. At this size (~65k cells) the step costs about a
// millisecond, and keeping it on the CPU means swans, lily pads and spray can
// read the exact surface height under them without a GPU read-back stall.

import { DOMAIN, waterDepth } from './pond.js';

export class WaveSim {
  constructor(res) {
    this.res = res;
    this.size = DOMAIN;
    this.cell = DOMAIN / res;
    const n = res * res;
    this.h = new Float32Array(n);
    this.v = new Float32Array(n);
    this.depth = new Float32Array(n);
    this.damp = new Float32Array(n);
    this.wet = new Uint8Array(n);
    this.lap = new Float32Array(n);

    // Ripple speed ~1.1 m/s: close to real pond waves of half-metre wavelength,
    // slow enough that a cruising swan's wake fans out behind it.
    const c = 1.1, dt = 1 / 60;
    this.k = Math.min(0.45, (c * dt / this.cell) ** 2);

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = (i + 0.5) * this.cell - DOMAIN / 2;
        const z = (j + 0.5) * this.cell - DOMAIN / 2;
        const d = waterDepth(x, z);
        const idx = j * res + i;
        this.depth[idx] = d;
        this.wet[idx] = d > 0 && i > 0 && j > 0 && i < res - 1 && j < res - 1 ? 1 : 0;
        // Shallow margins soak up waves the way a reedy bank does.
        this.damp[idx] = d < 0.35 ? 0.982 : 0.9965;
      }
    }
  }

  toGrid(x, z) {
    return [(x + DOMAIN / 2) / this.cell - 0.5, (z + DOMAIN / 2) / this.cell - 0.5];
  }

  // Add a smooth bump (positive) or dent (negative) of `amount` metres.
  drop(x, z, radius, amount) {
    const [gx, gz] = this.toGrid(x, z);
    const rc = radius / this.cell;
    const r2 = rc * rc;
    const reach = Math.ceil(rc * 2);
    const i0 = Math.max(1, Math.floor(gx - reach)), i1 = Math.min(this.res - 2, Math.ceil(gx + reach));
    const j0 = Math.max(1, Math.floor(gz - reach)), j1 = Math.min(this.res - 2, Math.ceil(gz + reach));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * this.res + i;
        if (!this.wet[idx]) continue;
        const dx = i - gx, dz = j - gz;
        const w = Math.exp(-(dx * dx + dz * dz) / r2);
        if (w < 0.01) continue;
        this.h[idx] += amount * w;
      }
    }
  }

  step() {
    const { res, h, v, k, wet, damp, lap: L } = this;
    for (let j = 1; j < res - 1; j++) {
      let idx = j * res + 1;
      for (let i = 1; i < res - 1; i++, idx++) {
        if (!wet[idx]) continue;
        const lap = h[idx - 1] + h[idx + 1] + h[idx - res] + h[idx + res] - 4 * h[idx];
        L[idx] = lap;
        v[idx] = (v[idx] + k * lap) * damp[idx];
      }
    }
    // A touch of diffusion stops grid-sized noise from ringing in place.
    for (let idx = 0; idx < h.length; idx++) {
      if (!wet[idx]) continue;
      let nh = h[idx] + v[idx] + 0.012 * L[idx];
      if (nh > 0.35) nh = 0.35; else if (nh < -0.35) nh = -0.35;
      h[idx] = nh;
    }
  }

  calm(factor) {
    for (let i = 0; i < this.h.length; i++) { this.h[i] *= factor; this.v[i] *= factor; }
  }

  sample(x, z) {
    const [gx, gz] = this.toGrid(x, z);
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.res - 1 || j >= this.res - 1) return 0;
    const fx = gx - i, fz = gz - j, r = this.res, h = this.h;
    const a = h[j * r + i], b = h[j * r + i + 1], c = h[(j + 1) * r + i], d = h[(j + 1) * r + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  // Surface slope (dh/dx, dh/dz) for tilting floating things.
  slope(x, z, out) {
    const e = this.cell;
    out[0] = (this.sample(x + e, z) - this.sample(x - e, z)) / (2 * e);
    out[1] = (this.sample(x, z + e) - this.sample(x, z - e)) / (2 * e);
    return out;
  }
}
