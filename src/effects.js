// Spray droplets and rain. Both fall under gravity and write their impact
// into the water simulation, so rain makes real interfering ripple rings.

import * as THREE from 'three';
import { shoreDist } from './pond.js';

export class Spray {
  constructor(scene, max) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    this.uniforms = { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        attribute float aLife;
        uniform float uScale;
        varying float vL;
        void main() {
          vL = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aLife > 0.0 ? clamp(uScale * 0.035 / -mv.z, 1.0, 12.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLight;
        varying float vL;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.25, 0.0, dot(c, c)) * min(1.0, vL * 3.0) * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uLight * 1.1, a);
        }`,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz) {
    const i = this.n++ % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 1.4;
  }

  update(dt, sim) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.81 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0 && this.vel[i * 3 + 1] < 0) {
        sim.drop(this.pos[i * 3], this.pos[i * 3 + 2], 0.14, -0.0035);
        this.life[i] = 0;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
  }
}

export class Rain {
  constructor(scene, count) {
    this.count = count;
    this.amount = 0;
    this.target = 0;
    this.drops = new Float32Array(count * 4); // x, y, z, speed
    for (let i = 0; i < count; i++) this.respawn(i, Math.random() * 14);
    this.positions = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: '#cfd8e2', transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  respawn(i, y = 14) {
    const r = Math.sqrt(Math.random()) * 16, th = Math.random() * Math.PI * 2;
    this.drops[i * 4] = Math.cos(th) * r;
    this.drops[i * 4 + 1] = y;
    this.drops[i * 4 + 2] = Math.sin(th) * r;
    this.drops[i * 4 + 3] = 8 + Math.random() * 2;
  }

  update(dt, sim, wind, light) {
    this.amount += (this.target - this.amount) * Math.min(1, dt * 0.6);
    this.lines.visible = this.amount > 0.01;
    this.material.opacity = 0.32 * this.amount;
    this.material.color.copy(light);
    if (!this.lines.visible) return;
    const active = Math.floor(this.count * this.amount);
    const slant = 0.6 + wind * 2.2;
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      if (i >= active) { this.positions.fill(0, i * 6, i * 6 + 6); continue; }
      this.drops[o + 1] -= this.drops[o + 3] * dt;
      this.drops[o] += 0.92 * slant * dt;
      this.drops[o + 2] += 0.38 * slant * dt;
      if (this.drops[o + 1] <= 0) {
        if (shoreDist(this.drops[o], this.drops[o + 2]) > 0) sim.drop(this.drops[o], this.drops[o + 2], 0.13, -0.006);
        this.respawn(i);
      }
      const x = this.drops[o], y = this.drops[o + 1], z = this.drops[o + 2];
      const len = 0.06 * this.drops[o + 3];
      this.positions.set([x, y, z, x - 0.092 * slant * len, y + len, z - 0.038 * slant * len], i * 6);
    }
    // Most drops are too small to see as streaks but still pock the surface.
    const extra = Math.floor(260 * this.amount * dt) + (Math.random() < (260 * this.amount * dt) % 1 ? 1 : 0);
    for (let k = 0; k < extra; k++) {
      const x = (Math.random() - 0.5) * 22, z = (Math.random() - 0.5) * 22;
      if (shoreDist(x, z) > 0) sim.drop(x, z, 0.11, -0.004 - Math.random() * 0.003);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
