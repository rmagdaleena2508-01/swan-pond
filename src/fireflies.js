// Fireflies (minmini poochi). On a normal night the pond stays dark and
// calm; now and then one or two flies drift out from the bank over the water,
// their yellow-green light swelling and fading slowly, then they settle and
// the pond is quiet again. "Synchronous" switches to the Photinus carolinus
// display: bursts of 5–8 quick flashes, ~8 s of darkness, and neighbours
// pulling each other's bursts into step.

import * as THREE from 'three';
import { pondRadius } from './pond.js';

export const FIREFLY_COLOR = new THREE.Color('#c9f24a');
const rand = (a, b) => a + Math.random() * (b - a);

function quickEnvelope(t) {
  if (t < 0 || t > 0.3) return 0;
  return t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 16);
}

export class Fireflies {
  constructor(scene, count, lightCount) {
    this.count = count;
    this.sync = false;
    this.amount = 0;
    this.calmFor = rand(2, 5);
    this.flies = [];
    for (let i = 0; i < count; i++) {
      const overWater = Math.random() < 0.16;
      const th = Math.random() * Math.PI * 2;
      const r = pondRadius(th) + (overWater ? -rand(0.8, 5) : rand(-0.5, 6.5));
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
    this.calmFor = rand(2, 5);
    for (const f of this.flies) { f.timer = rand(0, on ? 11 : 7); f.burstLeft = 0; f.flight = null; }
  }

  // A point low over the water for a wandering fly to head towards.
  waypoint() {
    const th = Math.random() * Math.PI * 2;
    const r = pondRadius(th) * rand(0.1, 0.75);
    return new THREE.Vector3(Math.cos(th) * r, rand(0.5, 1.5), Math.sin(th) * r);
  }

  // Default night: the pond stays dark and calm, then one or two flies
  // drift out from the bank, glowing slowly, and settle again.
  launch() {
    const n = Math.random() < 0.65 ? 1 : 2;
    const th0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const f = this.flies[Math.floor(Math.random() * this.count)];
      const th = th0 + (k ? rand(-0.5, 0.5) : 0);
      const r = pondRadius(th) + 0.5;
      f.pos.set(Math.cos(th) * r, rand(0.6, 1.2), Math.sin(th) * r);
      f.vel.set(0, 0, 0);
      f.flight = { age: -k * rand(1, 3), life: rand(16, 26), target: this.waypoint(), period: rand(2.8, 4.2), phase: Math.random() * 6.28 };
    }
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
    if (!this.sync) {
      const flying = this.flies.some((f) => f.flight);
      if (!flying && this.amount > 0.5) {
        this.calmFor -= dt;
        if (this.calmFor <= 0) { this.launch(); this.calmFor = rand(10, 22); }
      }
    }
    for (let i = 0; i < this.count; i++) {
      const f = this.flies[i];
      if (!this.sync) { this.updateWanderer(f, dt); this.write(i, f); continue; }
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
      if (f.burstLeft > 0) {
        f.burstGap -= dt;
        if (f.burstGap <= 0) { f.flashAge = 0; f.burstGap = 0.42; f.burstLeft--; if (f.burstLeft === 0) f.timer = rand(7.6, 8.6); }
      } else if (f.timer <= 0) this.startBurst(f);
      I = quickEnvelope(f.flashAge);
      f.flashAge += dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < 0.15) { f.pos.y = 0.15; f.vel.y = Math.abs(f.vel.y); }
      f.I = on ? I : 0;
      this.write(i, f);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aI.needsUpdate = true;
    this.glow(glowPos, glowI);
  }

  write(i, f) {
    this.positions[i * 3] = f.pos.x; this.positions[i * 3 + 1] = f.pos.y; this.positions[i * 3 + 2] = f.pos.z;
    this.intensity[i] = f.I;
  }

  updateWanderer(f, dt) {
    const fl = f.flight;
    if (!fl) { f.I = 0; return; }
    fl.age += dt;
    if (fl.age < 0) { f.I = 0; return; }
    // Unhurried flight towards a waypoint over the water, with a little wander and bob.
    const to = fl.target.clone().sub(f.pos);
    if (to.length() < 1.2) fl.target = this.waypoint();
    to.normalize().multiplyScalar(0.4);
    to.y += Math.sin(fl.age * 0.9 + fl.phase) * 0.12;
    f.vel.lerp(to, Math.min(1, dt * 0.7));
    f.vel.x += (Math.random() - 0.5) * 0.4 * dt;
    f.vel.z += (Math.random() - 0.5) * 0.4 * dt;
    f.pos.addScaledVector(f.vel, dt);
    if (f.pos.y < 0.3) f.pos.y = 0.3;
    // Slow glow: a soft swell and fade every few seconds, never a sharp blink.
    const breathe = 0.5 - 0.5 * Math.cos((fl.age / fl.period) * Math.PI * 2 + fl.phase);
    const env = Math.min(1, fl.age / 2.5, (fl.life - fl.age) / 3);
    f.I = Math.max(0, env) * (0.2 + 0.8 * breathe * breathe) * Math.min(1, this.amount * 1.3);
    if (fl.age > fl.life) { f.flight = null; f.I = 0; }
  }

  glow(glowPos, glowI) {
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
