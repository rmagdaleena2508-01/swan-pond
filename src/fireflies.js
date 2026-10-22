// Fireflies, modelled on the common eastern firefly (Photinus pyralis):
// yellow-green lantern (peak ~560–567 nm) under the tip of the abdomen,
// slow low flight over the banks, a ~0.5 s flash on the upswing of a J-shaped
// dip every ~5–7 s. "Synchronous" switches to the Photinus carolinus pattern:
// bursts of 5–8 quick flashes, ~8 s of darkness, and neighbours pulling each
// other's bursts into step.

import * as THREE from 'three';
import { pondRadius } from './pond.js';

export const FIREFLY_COLOR = new THREE.Color('#c9f24a');
const rand = (a, b) => a + Math.random() * (b - a);

function pyralisEnvelope(t) {
  if (t < 0 || t > 0.62) return 0;
  return t < 0.12 ? Math.pow(t / 0.12, 1.5) : Math.exp(-(t - 0.12) * 7.5);
}
function quickEnvelope(t) {
  if (t < 0 || t > 0.3) return 0;
  return t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 16);
}

export class Fireflies {
  constructor(scene, count, lightCount) {
    this.count = count;
    this.sync = false;
    this.amount = 0;
    this.flies = [];
    for (let i = 0; i < count; i++) {
      const overWater = Math.random() < 0.45;
      const th = Math.random() * Math.PI * 2;
      const r = pondRadius(th) + (overWater ? -rand(0.6, 5.5) : rand(-0.5, 3));
      const home = new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
      this.flies.push({
        pos: new THREE.Vector3(home.x, rand(0.35, 1.8), home.z),
        vel: new THREE.Vector3(),
        home,
        alt: rand(0.35, overWater ? 1.0 : 1.9),
        rank: Math.random(),
        timer: rand(0, 7),
        flashAge: 99,
        burstLeft: 0,
        burstGap: 0,
        I: 0,
      });
    }
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.intensity = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aI', new THREE.BufferAttribute(this.intensity, 1));
    this.uniforms = { uColor: { value: FIREFLY_COLOR }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aI;
        uniform float uScale;
        varying float vI;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vI = aI;
          gl_PointSize = clamp(uScale * (0.06 + aI * 0.34) / -mv.z, 0.0, 80.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vI;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          float core = exp(-r2 * 22.0);
          float halo = exp(-r2 * 3.0) * 0.35;
          float a = (core + halo) * vI;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor * (core * 9.0 + halo * 2.2) * vI, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.lights = [];
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(FIREFLY_COLOR, 0, 4.5, 2);
      scene.add(l);
      this.lights.push(l);
    }
  }

  setSync(on) {
    this.sync = on;
    for (const f of this.flies) { f.timer = rand(0, on ? 11 : 7); f.burstLeft = 0; }
  }

  scatter(x, z) {
    for (const f of this.flies) {
      const dx = f.pos.x - x, dz = f.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 3) {
        f.vel.x += (dx / (d || 1)) * 1.6;
        f.vel.z += (dz / (d || 1)) * 1.6;
        f.vel.y += rand(0.4, 1.0);
        f.flashAge = rand(0, 0.15);
      }
    }
  }

  startBurst(f) {
    f.burstLeft = Math.floor(rand(5, 9));
    f.burstGap = 0;
    // Integrate-and-fire coupling: dark neighbours late in their cycle fire early.
    for (const o of this.flies) {
      if (o === f || o.burstLeft > 0 || o.timer > 3.5) continue;
      if (o.pos.distanceToSquared(f.pos) < 30) o.timer = Math.min(o.timer, rand(0.15, 0.45));
    }
  }

  update(dt, amount, camera, glowPos, glowI) {
    this.amount += (amount - this.amount) * Math.min(1, dt * 0.8);
    const active = this.amount * this.count;
    for (let i = 0; i < this.count; i++) {
      const f = this.flies[i];
      const on = i < active;
      // Wander with drag, tethered loosely to a home spot near the bank.
      f.vel.x += (Math.random() - 0.5) * 1.6 * dt;
      f.vel.z += (Math.random() - 0.5) * 1.6 * dt;
      f.vel.y += (Math.random() - 0.5) * 0.8 * dt + (f.alt - f.pos.y) * 0.35 * dt;
      const hx = f.home.x - f.pos.x, hz = f.home.z - f.pos.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 2.5) { f.vel.x += (hx / hd) * 0.4 * dt; f.vel.z += (hz / hd) * 0.4 * dt; }
      f.vel.multiplyScalar(1 - 1.1 * dt);
      const sp = f.vel.length();
      if (sp > 0.6) f.vel.multiplyScalar(0.6 / sp);

      let I = 0;
      f.timer -= dt;
      if (!this.sync) {
        // J-stroke: dip just before the flash, climb while lit.
        if (f.timer < 0.45 && f.timer > 0) f.vel.y -= 0.9 * dt;
        if (f.timer <= 0) { f.flashAge = 0; f.timer = rand(5, 7); }
        if (f.flashAge < 0.6) f.vel.y += 1.6 * dt;
        I = pyralisEnvelope(f.flashAge);
      } else {
        if (f.burstLeft > 0) {
          f.burstGap -= dt;
          if (f.burstGap <= 0) { f.flashAge = 0; f.burstGap = 0.42; f.burstLeft--; if (f.burstLeft === 0) f.timer = rand(7.6, 8.6); }
        } else if (f.timer <= 0) this.startBurst(f);
        I = quickEnvelope(f.flashAge);
      }
      f.flashAge += dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < 0.15) { f.pos.y = 0.15; f.vel.y = Math.abs(f.vel.y); }
      f.I = on ? I : 0;
      this.positions[i * 3] = f.pos.x; this.positions[i * 3 + 1] = f.pos.y; this.positions[i * 3 + 2] = f.pos.z;
      this.intensity[i] = f.I;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aI.needsUpdate = true;

    // Give the brightest flashes real light (and tell the water about them).
    const ranked = this.flies.filter((f) => f.I > 0.05).sort((a, b) => b.I - a.I);
    for (let i = 0; i < glowI.length; i++) {
      const f = ranked[i];
      glowI[i] = f ? f.I : 0;
      if (f) glowPos[i].copy(f.pos);
    }
    this.lights.forEach((l, i) => {
      const f = ranked[i];
      l.intensity = f ? f.I * 0.9 : 0;
      if (f) l.position.copy(f.pos);
    });
  }
}
