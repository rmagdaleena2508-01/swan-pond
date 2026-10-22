// Flowering azalea bushes that spill over the banks, pink petals drifting
// on the water, and golden specks (pollen catching the light) by day.

import * as THREE from 'three';
import { pondRadius, groundHeight, shoreDist } from './pond.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.quadraticCurveTo(0.42, -0.1, 0, 0.5);
  s.quadraticCurveTo(-0.42, -0.1, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-Math.PI / 2);
  g.scale(0.24, 1, 0.45);
  return g;
}

function flowerGeometry() {
  // Five rounded petals; vertex colour pales towards a soft yellow centre.
  const s = new THREE.Shape();
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.085 * (0.45 + 0.55 * Math.abs(Math.cos(a * 2.5)));
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(s, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / 0.085;
    const t = Math.min(1, r / 0.35);
    col[i * 3] = 1; col[i * 3 + 1] = 0.9 + 0.1 * t; col[i * 3 + 2] = 0.55 + 0.45 * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildBushes(low) {
  const rand = rng(11);
  // Clumps sit on the bank and lean out over the water; the four nearest the
  // screen corners are the largest, framing the pond like the painting.
  const spots = [
    [-0.6, 2.2], [-2.55, 2.2], [0.6, 2.0], [2.55, 2.1], [-0.85, 1.8], [-2.3, 1.8], [0.85, 1.7], [2.3, 1.8],
    [-1.57, 1.4], [1.57, 1.3], [0.05, 1.3], [3.14, 1.4], [-1.05, 1.1], [2.05, 1.0], [-2.1, 1.2], [1.1, 1.1],
  ];
  const leavesPer = low ? 260 : 460, flowersPer = low ? 90 : 170;
  const leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), spots.length * leavesPer);
  const flowers = new THREE.InstancedMesh(flowerGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, emissive: '#3a1a18', emissiveIntensity: 0.12 }), spots.length * flowersPer);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const greens = ['#3f6f33', '#52823b', '#2f5a2a', '#6a9446', '#467a3a'];
  const pinks = ['#f4a3a0', '#f7b9b0', '#ee8f93', '#f9cfc4', '#f3a9b6'];
  let li = 0, fi = 0;
  for (const [th, size] of spots) {
    const R = pondRadius(th) + 0.2;
    const cx = Math.cos(th) * R, cz = Math.sin(th) * R;
    const base = Math.max(0, groundHeight(cx, cz));
    const rb = size;
    const place = (outer) => {
      // A point on (or just inside) a squashed dome, pushed towards the water.
      const a = rand() * Math.PI * 2, u = Math.sqrt(rand());
      const k = outer ? 0.85 + rand() * 0.15 : rand();
      const x = Math.cos(a) * u * rb * k, z = Math.sin(a) * u * rb * k;
      const y = Math.sqrt(Math.max(0, 1 - u * u)) * rb * 0.55 * k + 0.1;
      p.set(cx + x - Math.cos(th) * rb * 0.35, base + y, cz + z - Math.sin(th) * rb * 0.35);
      return p;
    };
    for (let i = 0; i < leavesPer; i++) {
      place(rand() < 0.7);
      e.set((rand() - 0.5) * 1.2, rand() * Math.PI * 2, (rand() - 0.5) * 1.2);
      q.setFromEuler(e);
      s.setScalar(0.8 + rand() * 0.7);
      m.compose(p, q, s);
      leaves.setMatrixAt(li, m);
      c.set(greens[Math.floor(rand() * greens.length)]).multiplyScalar(0.85 + rand() * 0.3);
      leaves.setColorAt(li++, c);
    }
    for (let i = 0; i < flowersPer; i++) {
      place(true);
      p.y += 0.04;
      e.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7);
      q.setFromEuler(e);
      s.setScalar(0.9 + rand() * 0.8);
      m.compose(p, q, s);
      flowers.setMatrixAt(fi, m);
      flowers.setColorAt(fi++, c.set(pinks[Math.floor(rand() * pinks.length)]));
    }
  }
  const group = new THREE.Group();
  group.add(leaves, flowers);
  return group;
}

// Overhanging azalea canopies pinned to the four corners of the view, so the
// painting is always framed by blossom whatever the screen shape.
export class CornerBlooms {
  constructor(scene, low) {
    this.groups = [];
    const rand = rng(29);
    const greens = ['#3f6f33', '#52823b', '#2f5a2a', '#6a9446', '#467a3a'];
    const pinks = ['#f4a3a0', '#f7b9b0', '#ee8f93', '#f9cfc4', '#f3a9b6'];
    const leafGeo = leafGeometry(), flowerGeo = flowerGeometry();
    const leafMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, emissive: '#3a1a18', emissiveIntensity: 0.12 });
    const nl = low ? 420 : 750, nf = low ? 150 : 280, nb = low ? 28 : 46;
    const bladeGeo = new THREE.PlaneGeometry(1, 0.07, 8, 1);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i) + 0.5;
      bp.setXYZ(i, x, bp.getY(i) * (1 - x * 0.85), -x * x * 0.25);
    }
    bladeGeo.rotateX(-Math.PI / 2);
    const bladeMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let k = 0; k < 4; k++) {
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, nl);
      const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, nf);
      // A few lumpy sub-clusters make each canopy read as branches, not a ball.
      const lobes = Array.from({ length: 5 }, () => [(rand() - 0.5) * 2.4, (rand() - 0.5) * 2.4, 0.9 + rand() * 0.9]);
      const spot = (outer) => {
        const [lx, lz, lr] = lobes[Math.floor(rand() * lobes.length)];
        const a = rand() * Math.PI * 2, u = Math.sqrt(rand());
        const kk = outer ? 0.85 + rand() * 0.15 : rand();
        p.set(lx + Math.cos(a) * u * lr * kk, Math.sqrt(Math.max(0, 1 - u * u)) * lr * 0.5 * kk, lz + Math.sin(a) * u * lr * kk);
      };
      for (let i = 0; i < nl; i++) {
        spot(rand() < 0.7);
        e.set((rand() - 0.5) * 1.2, rand() * Math.PI * 2, (rand() - 0.5) * 1.2);
        m.compose(p, q.setFromEuler(e), sc.setScalar(0.8 + rand() * 0.7));
        leaves.setMatrixAt(i, m);
        leaves.setColorAt(i, c.set(greens[Math.floor(rand() * greens.length)]).multiplyScalar(0.85 + rand() * 0.3));
      }
      for (let i = 0; i < nf; i++) {
        spot(true);
        p.y += 0.05;
        e.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7);
        m.compose(p, q.setFromEuler(e), sc.setScalar(0.9 + rand() * 0.8));
        flowers.setMatrixAt(i, m);
        flowers.setColorAt(i, c.set(pinks[Math.floor(rand() * pinks.length)]));
      }
      // Long grass blades fan out from under each canopy towards the open water.
      const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, nb);
      for (let i = 0; i < nb; i++) {
        const a = (rand() - 0.5) * 1.5;
        p.set(rand() * 0.8, 0.2 + rand() * 0.3, (rand() - 0.5) * 1.6);
        e.set(0, a, -0.12 - rand() * 0.2);
        m.compose(p, q.setFromEuler(e), sc.set(1.6 + rand() * 2.2, 1, 0.8 + rand() * 0.6));
        blades.setMatrixAt(i, m);
        blades.setColorAt(i, c.setHSL(0.22 + rand() * 0.07, 0.38, 0.28 + rand() * 0.16));
      }
      const g = new THREE.Group();
      g.add(blades, leaves, flowers);
      blades.frustumCulled = leaves.frustumCulled = flowers.frustumCulled = false;
      scene.add(g);
      this.groups.push(g);
    }
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.8);
    this.hit = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
  }

  update(camera, target) {
    const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    corners.forEach(([x, y], k) => {
      this.ndc.set(x * 0.97, y * 0.95);
      this.ray.setFromCamera(this.ndc, camera);
      if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return;
      const g = this.groups[k];
      g.position.copy(this.hit);
      g.rotation.y = Math.atan2(-(target.z - this.hit.z), target.x - this.hit.x);
    });
  }
}

// Pink petals afloat; they ride the simulated surface and drift with wind.
export function buildPetals(count) {
  const geo = new THREE.CircleGeometry(0.05, 8);
  geo.scale(1, 0.6, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#f6b6ae', side: THREE.DoubleSide, roughness: 0.6, emissive: '#5a2a26', emissiveIntensity: 0.2 }), count);
  const rand = rng(5);
  const petals = [];
  for (let i = 0; i < count; i++) {
    const th = rand() * Math.PI * 2;
    const r = pondRadius(th) - 0.5 - rand() * 4;
    petals.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, rot: rand() * 6.3, spin: (rand() - 0.5) * 0.3, s: 0.7 + rand() * 0.8 });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  mesh.userData.update = (sim, dt, wind, elapsed) => {
    petals.forEach((pt, i) => {
      const drift = 0.03 + wind * 0.25;
      pt.x += (0.92 * drift + Math.sin(elapsed * 0.1 + i) * 0.02) * dt;
      pt.z += (0.38 * drift + Math.cos(elapsed * 0.13 + i * 1.7) * 0.02) * dt;
      if (shoreDist(pt.x, pt.z) < 0.3) {
        const th = Math.random() * Math.PI * 2, r = pondRadius(th) - 1 - Math.random() * 3.5;
        pt.x = Math.cos(th) * r; pt.z = Math.sin(th) * r;
      }
      pt.rot += pt.spin * dt;
      p.set(pt.x, sim.sample(pt.x, pt.z) + 0.01, pt.z);
      e.set(0, pt.rot, 0);
      q.setFromEuler(e);
      sc.setScalar(pt.s);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}

// Golden specks of pollen floating on the surface, catching the sun.
export class Motes {
  constructor(scene, count) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.tw = new Float32Array(count);
    this.seed = [];
    const rand = rng(17);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 5.5;
      this.pos[i * 3] = Math.cos(a) * r; this.pos[i * 3 + 2] = Math.sin(a) * r;
      this.seed.push(rand() * 100);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aI', new THREE.BufferAttribute(this.tw, 1));
    this.uniforms = { uScale: { value: 600 }, uColor: { value: new THREE.Color('#f6b84a') } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aI;
        uniform float uScale;
        varying float vI;
        void main() {
          vI = aI;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uScale * 0.22 / -mv.z, 2.5, 32.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vI;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c) * 4.0;
          float a = (exp(-r2 * 9.0) + exp(-r2 * 2.5) * 0.25) * vI;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * a * 4.0, 1.0);
        }`,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, sim, day, wind, elapsed) {
    for (let i = 0; i < this.count; i++) {
      const o = i * 3, sd = this.seed[i];
      let x = this.pos[o], z = this.pos[o + 2];
      x += (Math.sin(elapsed * 0.11 + sd) * 0.05 + 0.92 * wind * 0.2) * dt;
      z += (Math.cos(elapsed * 0.09 + sd * 1.3) * 0.05 + 0.38 * wind * 0.2) * dt;
      if (shoreDist(x, z) < 1) { const a = Math.random() * 6.28, r = Math.random() * 4.5; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      this.pos[o] = x; this.pos[o + 2] = z;
      this.pos[o + 1] = sim.sample(x, z) + 0.02;
      this.tw[i] = day * (0.55 + 0.45 * Math.sin(elapsed * (1.3 + (sd % 1.7)) + sd));
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aI.needsUpdate = true;
  }
}
