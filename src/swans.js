// Swans: procedural models and behaviour.
//
// Motion follows waterfowl biomechanics: alternating webbed-foot strokes give a
// surge-and-glide speed profile, turns are slow (outside foot pushes harder,
// or one foot pivots the bird when it is nearly stopped), the body turns first
// and the neck leads into the new heading. Each swan floats on the simulated
// surface, so passing waves pitch and roll it, and its hull and feet write its
// wake back into the same surface.

import * as THREE from 'three';
import { shoreDist, pondRadius, clampToWater } from './pond.js';

const TAU = Math.PI * 2;
const SEG = 8;

export const SPECIES = {
  mute: { name: 'Mute swan', body: '#f6e9df', glow: true, billBase: '#1c1c1c', billTip: '#e0622a', baseLen: 0.022, knob: true, scale: 1.0, neckLen: 0.86, pose: 'S', territorial: true, call: 'hiss' },
  black: { name: 'Black swan', body: '#1d1b1f', billBase: '#c21f2c', billTip: '#c21f2c', baseLen: 0.05, band: true, scale: 0.86, neckLen: 0.92, pose: 'S', territorial: true, primaries: '#f1f0ec', call: 'whistle' },
  whooper: { name: 'Whooper swan', body: '#f7ebe1', glow: true, billBase: '#f0cf2c', billTip: '#151515', baseLen: 0.07, scale: 0.95, neckLen: 0.8, pose: 'straight', territorial: false, call: 'bugle' },
  trumpeter: { name: 'Trumpeter swan', body: '#f5e8de', glow: true, billBase: '#141414', billTip: '#141414', baseLen: 0.04, scale: 1.12, neckLen: 0.9, pose: 'upright', territorial: false, call: 'bugle' },
};

// Neck bone pitch angles (radians, + leans forward) and absolute bill pitch from vertical.
const POSES = {
  S: { neck: [-0.34, -0.27, -0.12, 0.12, 0.34, 0.44, 0.38, 0.24], head: 1.95, bend: 0 },
  straight: { neck: [0.07, 0.05, 0.03, 0.0, -0.02, 0.0, 0.05, 0.08], head: 1.68, bend: 0 },
  upright: { neck: [0.12, 0.06, 0.02, 0.0, 0.0, 0.05, 0.11, 0.15], head: 1.72, bend: 0 },
  feed: { neck: [0.62, 0.55, 0.48, 0.4, 0.3, 0.2, 0.1, 0.0], head: 3.05, bend: 0 },
  preen: { neck: [-0.4, -0.5, -0.48, -0.38, -0.28, -0.16, -0.06, 0.0], head: -0.7, bend: 0.22 },
  rest: { neck: [-0.85, -0.72, -0.52, -0.32, -0.16, -0.08, 0.0, 0.0], head: -1.35, bend: 0.17 },
  busk: { neck: [-0.6, -0.42, -0.12, 0.26, 0.52, 0.56, 0.42, 0.22], head: 2.25, bend: 0 },
  flight: { neck: [1.38, 0.05, 0.02, 0.0, 0.0, 0.0, 0.02, 0.04], head: 1.6, bend: 0 },
  stretch: { neck: [0.0, -0.02, -0.02, 0.0, 0.0, 0.0, 0.02, 0.05], head: 1.5, bend: 0 },
};

const matCache = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra }));
  return matCache.get(key);
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// A swan's hull: full rounded breast, back rising towards the rear, and a
// short pointed tail that lifts clear of the water.
function bodyGeometry() {
  const g = new THREE.SphereGeometry(1, 36, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) y *= 1 + 0.38 * sstep(0.35, -0.5, z);
    const t = sstep(-0.45, -1.0, z);
    y += t * t * 0.6 + t * 0.12;
    x *= 1 - t * 0.8;
    if (t > 0 && y > 0) y *= 1 - t * 0.35;
    if (z > 0.2 && y < 0) z *= 1 - 0.18 * sstep(0.2, 1, z) * Math.min(1, -y * 2);
    if (y < 0) y *= 0.7;
    p.setXYZ(i, x * 0.35, y * 0.25, z * 0.74);
  }
  g.computeVertexNormals();
  return g;
}

function wingGeometry(spec) {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0.35, -0.06], [0.72, -0.04], [1.02, 0.04], [1.2, 0.24], [1.02, 0.4], [0.72, 0.48], [0.4, 0.52], [0.12, 0.44], [0, 0.28]];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2); // shape y (trailing edge) becomes -z (backwards)
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const body = new THREE.Color(spec.body), white = new THREE.Color(spec.primaries || spec.body);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const c = x > 0.7 || z < -0.36 ? white : body;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    pos.setY(i, Math.sin(Math.min(1, x / 1.1) * Math.PI) * 0.05); // gentle camber
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function makeNeck(len, material) {
  const geo = new THREE.CylinderGeometry(1, 1, len, 14, SEG * 3, true);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position;
  // Slim neck that flares into the breast at its base.
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) / len;
    const r = 0.047 + 0.012 * (1 - u) + 0.075 * Math.pow(1 - u, 4);
    pos.setX(i, pos.getX(i) * r);
    pos.setZ(i, pos.getZ(i) * r);
  }
  geo.computeVertexNormals();
  const idx = [], wts = [];
  const seg = len / SEG;
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(SEG - 1e-4, Math.max(0, pos.getY(i) / seg));
    const b = Math.floor(f), w = f - b;
    idx.push(b, b + 1, 0, 0);
    wts.push(1 - w, w, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  const bones = [];
  let prev = null;
  for (let i = 0; i <= SEG; i++) {
    const b = new THREE.Bone();
    if (prev) { b.position.y = seg; prev.add(b); }
    bones.push(b);
    prev = b;
  }
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  return { mesh, bones: bones.slice(0, SEG), tip: bones[SEG] };
}

function buildHead(spec, bodyMat) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), bodyMat);
  head.scale.set(0.85, 1.3, 0.92);
  head.position.y = 0.035;
  g.add(head);
  const bl = 0.16, base = spec.baseLen;
  const baseSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, base, 12), mat(spec.billBase));
  baseSeg.position.y = 0.075 + base / 2;
  baseSeg.scale.z = 0.62;
  g.add(baseSeg);
  const tipLen = bl - base;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.036, tipLen, 12), mat(spec.billTip));
  tip.position.y = 0.075 + base + tipLen / 2;
  tip.scale.z = 0.55;
  g.add(tip);
  const nail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#1a1a1a'));
  nail.position.set(0, 0.075 + bl - 0.018, -0.004);
  g.add(nail);
  if (spec.knob) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), mat('#141414'));
    knob.position.set(0, 0.078, -0.024);
    knob.scale.set(0.9, 1.1, 0.8);
    g.add(knob);
  }
  if (spec.band) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.014, 12), mat('#f2f0ea'));
    band.position.y = 0.075 + bl - 0.04;
    band.scale.z = 0.6;
    g.add(band);
  }
  const eyeMat = mat('#050505', { roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 8, 6), eyeMat);
    eye.position.set(sx * 0.052, 0.05, -0.022);
    g.add(eye);
  }
  return g;
}

function buildFoot() {
  const g = new THREE.Group();
  const legMat = mat('#2a2a2a', { roughness: 0.6 });
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.24, 6), legMat);
  leg.position.y = -0.12;
  g.add(leg);
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(-0.08, 0.16); s.lineTo(0, 0.13); s.lineTo(0.08, 0.16); s.lineTo(0, 0);
  const web = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: '#222', side: THREE.DoubleSide, roughness: 0.7 }));
  web.rotation.x = Math.PI / 2;
  web.position.y = -0.24;
  g.add(web);
  return g;
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }
const rand = (a, b) => a + Math.random() * (b - a);

export class Swan {
  constructor(key) {
    const spec = SPECIES[key];
    this.key = key;
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.scale.setScalar(spec.scale);
    this.body = new THREE.Group();
    this.root.add(this.body);
    // White plumage scatters warm light, so the birds glow peach at the edges.
    const bodyMat = mat(spec.body, spec.glow ? { emissive: '#eaa47e', emissiveIntensity: 0.1 } : {});
    this.bodyMat = bodyMat;
    const bodyMesh = new THREE.Mesh(bodyGeometry(), bodyMat);
    bodyMesh.position.y = 0.1;
    this.body.add(bodyMesh);

    const neck = makeNeck(spec.neckLen, bodyMat);
    neck.mesh.position.set(0, 0.15, 0.5);
    this.body.add(neck.mesh);
    this.bones = neck.bones;
    this.headPivot = new THREE.Group();
    neck.tip.add(this.headPivot);
    this.head = buildHead(spec, bodyMat);
    this.head.scale.setScalar(1.15);
    this.headPivot.add(this.head);

    const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const wingGeo = wingGeometry(spec);
    this.wings = [];
    for (const sx of [1, -1]) {
      const outer = new THREE.Group();
      outer.scale.x = sx;
      outer.position.set(sx * 0.17, 0.25, 0.2);
      const inner = new THREE.Group();
      inner.add(new THREE.Mesh(wingGeo, wingMat));
      outer.add(inner);
      this.body.add(outer);
      this.wings.push(inner);
    }
    this.feet = [];
    for (const sx of [1, -1]) {
      const f = buildFoot();
      f.position.set(sx * 0.11, 0.02, -0.05);
      this.body.add(f);
      this.feet.push(f);
    }

    const base = POSES[spec.pose];
    this.neckCur = base.neck.slice();
    this.bendCur = 0;
    this.headCur = base.head;
    this.pose = base;

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.stroke = Math.random();
    this.wander = 0;
    this.cruise = rand(0.32, 0.58);
    this.partner = null;
    this.state = 'swim';
    this.activity = 'cruise';
    this.actTime = rand(4, 10);
    this.actAge = 0;
    this.buskCooldown = rand(5, 15);
    this.callTimer = rand(15, 50);
    this.flee = 0;
    this.fleeDir = [0, 0];
    this.target = null;
    this.wing = { open: 0, lift: 0.15, flap: 0, phase: 0, freq: 2 };
    this.pitch = 0; this.roll = 0; this.lift = 0;
    this.slope = [0, 0];
    this.sailing = 0;
  }

  placeSwimming(x, z, h) {
    this.pos.set(x, 0, z);
    this.heading = h;
    this.speed = this.cruise * 0.8;
    this.state = 'swim';
  }

  flyIn(x, z, approach) {
    const dir = new THREE.Vector2(Math.sin(approach), Math.cos(approach));
    this.landAt = new THREE.Vector3(x, 0, z);
    this.flyStart = new THREE.Vector3(x - dir.x * 42, 13, z - dir.y * 42);
    this.flyDist = 42;
    this.flyS = 0;
    this.heading = approach;
    this.pos.copy(this.flyStart);
    this.state = 'fly';
    this.wing.open = 1;
    this.wing.flap = 1;
  }

  takeOff() {
    if (this.state !== 'swim') return;
    // Run along the longest clear stretch of water.
    let best = this.heading, bestLen = -1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      let len = 0;
      while (len < 26 && shoreDist(this.pos.x + Math.sin(a) * len, this.pos.z + Math.cos(a) * len) > 1) len += 0.5;
      const score = len - Math.abs(wrap(a - this.heading)) * 1.5;
      if (score > bestLen) { bestLen = score; best = a; }
    }
    this.takeoffDir = best;
    this.state = 'align';
    this.runAge = 0;
  }

  setActivity(a, time) { this.activity = a; this.actTime = time; this.actAge = 0; }

  chooseActivity(ctx) {
    const r = Math.random();
    const night = ctx.time.night;
    if (night > 0.6) {
      if (r < 0.68) {
        const th = Math.atan2(this.pos.z, this.pos.x);
        const rr = pondRadius(th) - 1.8;
        this.target = [Math.cos(th) * rr, Math.sin(th) * rr];
        this.setActivity('rest', rand(25, 50));
      } else if (r < 0.88) this.setActivity('cruise', rand(8, 16));
      else this.setActivity('preen', rand(4, 7));
      return;
    }
    this.target = null;
    if (r < 0.5) this.setActivity('cruise', rand(8, 18));
    else if (r < 0.7) this.setActivity('feed', rand(3, 6));
    else if (r < 0.83) this.setActivity('preen', rand(3, 6));
    else if (r < 0.89) this.setActivity('flap', 2.6);
    else this.setActivity('pause', rand(2, 4));
  }

  update(dt, ctx) {
    switch (this.state) {
      case 'fly': this.updateFly(dt, ctx); break;
      case 'land': this.updateLand(dt, ctx); break;
      case 'align': case 'run': case 'climb': this.updateTakeoff(dt, ctx); break;
      default: this.updateSwim(dt, ctx);
    }
    this.animate(dt, ctx);
  }

  updateSwim(dt, ctx) {
    const { sim } = ctx;
    this.actAge += dt;
    this.buskCooldown -= dt;
    if (this.actAge > this.actTime) this.chooseActivity(ctx);
    if (ctx.time.night > 0.6 && this.activity === 'cruise' && this.actAge > 6 && Math.random() < dt * 0.05) this.chooseActivity(ctx);

    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    this.wander = Math.max(-0.7, Math.min(0.7, this.wander + (Math.random() - 0.5) * dt * 1.4));
    let dx = Math.sin(h + this.wander), dz = Math.cos(h + this.wander);

    // Shore avoidance: look ahead and bend back towards open water.
    for (const look of [1.6, 3.2]) {
      const px = this.pos.x + fx * look, pz = this.pos.z + fz * look;
      const s = shoreDist(px, pz);
      if (s < 2.2) {
        const r = Math.hypot(px, pz) || 1;
        const push = ((2.2 - s) / 2.2) * (look < 2 ? 2.6 : 1.4);
        dx -= (px / r) * push; dz -= (pz / r) * push;
      }
    }

    let targetSpeed = this.cruise;
    for (const o of ctx.swans) {
      if (o === this || o.state === 'fly') continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz) || 0.01;
      const R = o === this.partner ? 1.5 : 3.0;
      if (d < R) { const w = (1 - d / R) * 1.8; dx += (ox / d) * w; dz += (oz / d) * w; }
      if (o === this.partner && d > 3.5) { dx -= (ox / d) * 0.7; dz -= (oz / d) * 0.7; targetSpeed *= 1.15; }
      if (this.spec.territorial && o !== this.partner && d < 2.4 && this.buskCooldown <= 0 && this.activity !== 'rest' && o.state === 'swim') {
        this.setActivity('busk', 3.5);
        this.buskTarget = o;
        this.buskCooldown = rand(18, 35);
        o.flee = 2.5; o.fleeDir = [-ox / d, -oz / d];
        if (this.spec.call === 'hiss') ctx.audio.hiss(this.pos.x);
      }
    }

    const pt = ctx.pointer;
    if (pt.active) {
      const px = this.pos.x - pt.x, pz = this.pos.z - pt.z;
      const d = Math.hypot(px, pz);
      if (d < 3.4) {
        this.flee = Math.max(this.flee, 1.6);
        this.fleeDir = [px / (d || 1), pz / (d || 1)];
        if (this.activity === 'feed' || this.activity === 'preen' || this.activity === 'rest') this.setActivity('cruise', rand(5, 9));
      }
    }
    if (this.flee > 0) {
      this.flee -= dt;
      dx += this.fleeDir[0] * 2.4; dz += this.fleeDir[1] * 2.4;
      targetSpeed = Math.max(targetSpeed, 0.75);
    }

    switch (this.activity) {
      case 'feed': targetSpeed = 0.06; break;
      case 'preen': case 'pause': targetSpeed = 0; break;
      case 'flap': targetSpeed = 0.1; break;
      case 'busk': {
        const t = this.buskTarget;
        if (t) { const bx = t.pos.x - this.pos.x, bz = t.pos.z - this.pos.z; const d = Math.hypot(bx, bz) || 1; dx += (bx / d) * 2; dz += (bz / d) * 2; }
        targetSpeed = 0.7;
        break;
      }
      case 'rest': {
        if (this.target) {
          const tx = this.target[0] - this.pos.x, tz = this.target[1] - this.pos.z;
          const d = Math.hypot(tx, tz);
          if (d > 1.2) { dx += (tx / d) * 2; dz += (tz / d) * 2; targetSpeed = 0.25; }
          else targetSpeed = 0;
        } else targetSpeed = 0;
        break;
      }
    }
    if (this.flee > 0) targetSpeed = Math.max(targetSpeed, 0.75);
    targetSpeed *= 1 - 0.45 * ctx.time.night * (this.flee > 0 ? 0 : 1);

    const desired = Math.atan2(dx, dz);
    const err = wrap(desired - h);
    if (targetSpeed > 0.05 || this.flee > 0) targetSpeed *= 1 - 0.5 * Math.min(1, Math.abs(err) / 1.6);
    const pivot = this.speed < 0.18 && Math.abs(err) > 0.5;
    const maxRate = pivot ? 0.62 : 0.5;
    const wantsTurn = targetSpeed > 0.01 || this.flee > 0;
    const targetRate = wantsTurn ? Math.max(-maxRate, Math.min(maxRate, err * 0.9)) : 0;
    const acc = 0.85 * dt;
    this.yawRate += Math.max(-acc, Math.min(acc, targetRate - this.yawRate));
    this.heading = wrap(h + this.yawRate * dt);
    this.turnErr = err;

    // Alternating feet: two power strokes per cycle, thrust ∝ sin², drag slows the glide between.
    const freq = 0.45 + targetSpeed * 0.9 + (pivot ? 0.4 : 0);
    const prev = this.stroke;
    this.stroke = (this.stroke + freq * dt) % 1;
    const s = Math.sin(this.stroke * TAU);
    const c = 0.55;
    const thrust = targetSpeed > 0.01 ? 2 * c * targetSpeed * (1 + targetSpeed) * (s * s) * 2 : 0;
    this.speed += (thrust - c * this.speed * (1 + this.speed)) * dt;
    this.speed = Math.max(0, this.speed);
    if ((prev < 0.25 && this.stroke >= 0.25) || (prev < 0.75 && this.stroke >= 0.75)) {
      if (targetSpeed > 0.05 || pivot) {
        const side = this.stroke >= 0.75 ? 1 : -1;
        const sx = Math.cos(h) * side * 0.15, sz = -Math.sin(h) * side * 0.15;
        sim.drop(this.pos.x - fx * 0.45 + sx, this.pos.z - fz * 0.45 + sz, 0.32, -0.003 * (0.4 + this.speed));
      }
    }

    // Wind pushes the swan downwind; with a following wind it may lift its wings and sail.
    const wind = ctx.wind;
    const wx = 0.92, wz = 0.38;
    const downwind = fx * wx + fz * wz;
    if (wind > 0.5 && downwind > 0.7 && this.activity === 'cruise' && this.sailing <= 0 && Math.random() < dt * 0.04) this.sailing = rand(5, 9);
    if (this.sailing > 0) { this.sailing -= dt; if (wind < 0.3 || downwind < 0.4) this.sailing = 0; }
    const drift = wind * (0.1 + (this.sailing > 0 ? 0.45 : 0));

    this.pos.x += (fx * this.speed + wx * drift) * dt;
    this.pos.z += (fz * this.speed + wz * drift) * dt;
    const sd = shoreDist(this.pos.x, this.pos.z);
    if (sd < 1.0) {
      const r = Math.hypot(this.pos.x, this.pos.z) || 1;
      this.pos.x -= (this.pos.x / r) * (1.0 - sd) * 0.2;
      this.pos.z -= (this.pos.z / r) * (1.0 - sd) * 0.2;
    }

    // Hull wake: a moving dent at the breast, a smaller rise at the stern.
    const k = dt * 60 * this.spec.scale;
    const v = this.speed + drift * 0.5;
    if (v > 0.03) {
      sim.drop(this.pos.x + fx * 0.55, this.pos.z + fz * 0.55, 0.36, -0.0042 * v * k);
      sim.drop(this.pos.x - fx * 0.5, this.pos.z - fz * 0.5, 0.42, 0.0024 * v * k);
    }

    if (this.activity === 'feed' && this.actAge > 0.9 && Math.random() < dt * 1.2) {
      this.head.getWorldPosition(_v);
      sim.drop(_v.x, _v.z, 0.18, -0.006);
    }
    if (this.activity === 'flap') {
      const ph = Math.sin(this.wing.phase);
      if (ph < -0.95 && Math.random() < 0.5) {
        for (const sx of [-1, 1]) sim.drop(this.pos.x + Math.cos(h) * sx * 1.0, this.pos.z - Math.sin(h) * sx * 1.0, 0.3, -0.006);
      }
    }

    this.callTimer -= dt;
    if (this.callTimer < 0) {
      this.callTimer = rand(25, 70);
      if (this.spec.call === 'bugle' && ctx.time.night < 0.5) ctx.audio.bugle(this.pos.x, this.key === 'trumpeter' ? 0.8 : 1);
      if (this.spec.call === 'whistle') ctx.audio.whistle(this.pos.x);
    }

    this.float(dt, ctx);
  }

  float(dt, ctx) {
    const { sim } = ctx;
    const y = sim.sample(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, y, 14, dt);
    sim.slope(this.pos.x, this.pos.z, this.slope);
    const h = this.heading;
    const sf = this.slope[0] * Math.sin(h) + this.slope[1] * Math.cos(h);
    const sl = this.slope[0] * Math.cos(h) - this.slope[1] * Math.sin(h);
    this.pitch = damp(this.pitch, -Math.atan(sf * 1.4), 6, dt);
    this.roll = damp(this.roll, Math.atan(sl * 1.4) - this.yawRate * 0.12, 6, dt);
  }

  updateFly(dt, ctx) {
    const u = this.flyS / this.flyDist;
    const v = 5.4 + 5.6 * (1 - u);
    this.flyS += v * dt;
    const t = Math.min(1, this.flyS / this.flyDist);
    this.pos.lerpVectors(this.flyStart, this.landAt, t);
    this.pos.y = 13 * Math.pow(1 - t, 1.35) + 0.02;
    this.wing.open = 1;
    this.wing.flap = t < 0.55 ? 1 : damp(this.wing.flap, 0.12, 3, dt);
    this.wing.freq = 2.6;
    this.wing.lift = 0.05;
    this.pitch = damp(this.pitch, t > 0.75 ? -0.28 : -0.04, 3, dt);
    this.roll = damp(this.roll, 0, 3, dt);
    this.speed = v;
    if (t > 0.45 && !this.whooshed) { this.whooshed = true; ctx.audio.wings(1.6, this.pos.x); }
    if (t >= 1) {
      this.state = 'land';
      this.speed = 4.6;
      this.landAge = 0;
      ctx.audio.splash(1, this.pos.x);
      ctx.sim.drop(this.pos.x, this.pos.z, 0.6, -0.05);
    }
  }

  updateLand(dt, ctx) {
    const { sim, spray } = ctx;
    this.landAge += dt;
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h);
    this.speed = Math.max(0, this.speed - (2.0 + 0.5 * this.speed) * dt);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    const k = dt * 60;
    if (this.speed > 1.0) {
      // Feet ski first: two spray trails and a furrow.
      for (const sx of [-1, 1]) {
        const px = this.pos.x + Math.cos(h) * sx * 0.12 + fx * 0.25, pz = this.pos.z - Math.sin(h) * sx * 0.12 + fz * 0.25;
        sim.drop(px, pz, 0.28, -0.009 * this.speed * k * 0.5);
        const n = Math.random() < this.speed * 1.3 * dt * 60 / 4 ? 3 : 1;
        for (let i = 0; i < n; i++) spray.emit(px, 0.05, pz, fx * this.speed * 0.5 + Math.cos(h) * sx * rand(0.3, 1.0), rand(0.6, 1.8) * (this.speed / 4), fz * this.speed * 0.5 - Math.sin(h) * sx * rand(0.3, 1.0));
      }
      sim.drop(this.pos.x - fx * 0.3, this.pos.z - fz * 0.3, 0.45, 0.005 * this.speed * k * 0.5);
    }
    this.wing.flap = damp(this.wing.flap, 0, 4, dt);
    this.wing.lift = 0.35;
    this.wing.open = this.landAge < 0.8 ? 1 : damp(this.wing.open, 0, 2.2, dt);
    this.float(dt, ctx);
    this.pitch += (-0.18 * Math.min(1, this.speed / 3)) * 0.5;
    if (this.speed < 0.55 && this.wing.open < 0.05) {
      this.state = 'swim';
      this.setActivity('cruise', rand(5, 10));
    }
  }

  updateTakeoff(dt, ctx) {
    const { sim, spray } = ctx;
    this.runAge += dt;
    const h = this.heading;
    if (this.state === 'align') {
      const err = wrap(this.takeoffDir - h);
      this.yawRate = Math.max(-0.9, Math.min(0.9, err * 1.5));
      this.heading = wrap(h + this.yawRate * dt);
      this.speed = damp(this.speed, 0.2, 2, dt);
      if (Math.abs(err) < 0.2) { this.state = 'run'; this.runAge = 0; this.slapT = 0; this.slapSide = 1; ctx.audio.wings(3.5, this.pos.x); }
      this.wing.open = damp(this.wing.open, 0.4, 3, dt);
      this.wing.flap = 0.3;
    } else {
      this.yawRate = damp(this.yawRate, 0, 3, dt);
      this.speed += (this.state === 'climb' ? 1.2 : 2.5) * dt;
      this.wing.open = damp(this.wing.open, 1, 5, dt);
      this.wing.flap = 1;
      this.wing.freq = 3.2;
      this.wing.lift = 0.1;
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    if (this.state === 'run') {
      // Feet slap the surface in turn, wingtips strike the water on downstrokes.
      this.slapT -= dt;
      if (this.slapT <= 0) {
        this.slapT = 0.12;
        this.slapSide *= -1;
        const px = this.pos.x + Math.cos(this.heading) * this.slapSide * 0.12, pz = this.pos.z - Math.sin(this.heading) * this.slapSide * 0.12;
        sim.drop(px, pz, 0.26, -0.016);
        for (let i = 0; i < 4; i++) spray.emit(px, 0.04, pz, rand(-0.5, 0.5), rand(0.8, 1.8), rand(-0.5, 0.5));
        ctx.audio.slap(this.pos.x);
      }
      this.float(dt, ctx);
      this.pitch = damp(this.pitch, -0.12, 4, dt);
      if (this.speed > 5.2) { this.state = 'climb'; this.vy = 0.5; }
    } else if (this.state === 'climb') {
      this.vy = Math.min(2.4, this.vy + 1.2 * dt);
      this.pos.y += this.vy * dt;
      this.speed = Math.min(10, this.speed);
      this.pitch = damp(this.pitch, -0.12, 2, dt);
      this.roll = damp(this.roll, 0, 2, dt);
      if (this.pos.y > 16 || Math.hypot(this.pos.x, this.pos.z) > 55) this.state = 'gone';
    } else this.float(dt, ctx);
  }

  animate(dt, ctx) {
    const flying = this.state === 'fly' || this.state === 'climb';
    let pose = POSES[this.spec.pose];
    if (flying) pose = POSES.flight;
    else if (this.state === 'run' || this.state === 'land') pose = POSES.stretch;
    else if (this.state === 'swim') {
      if (this.activity === 'feed') pose = POSES.feed;
      else if (this.activity === 'preen') pose = POSES.preen;
      else if (this.activity === 'busk') pose = POSES.busk;
      else if (this.activity === 'flap') pose = POSES.stretch;
      else if (this.activity === 'rest' && this.speed < 0.08 && (!this.target || Math.hypot(this.target[0] - this.pos.x, this.target[1] - this.pos.z) < 1.4)) pose = POSES.rest;
    }
    const k = flying ? 4 : 2.2;
    let sum = 0;
    const lead = this.state === 'swim' ? Math.max(-0.7, Math.min(0.7, this.turnErr || 0)) : 0;
    const look = this.activity === 'pause' ? Math.sin(performance.now() * 0.0011 + this.stroke * 9) * 0.5 : 0;
    this.bendCur = damp(this.bendCur, pose.bend ? pose.bend : -(lead * 0.09 + look * 0.08), k, dt);
    const breathe = Math.sin(performance.now() * 0.0013 + this.cruise * 50) * 0.015;
    for (let i = 0; i < SEG; i++) {
      this.neckCur[i] = damp(this.neckCur[i], pose.neck[i] + (i > 4 ? breathe : 0), k, dt);
      sum += this.neckCur[i];
      this.bones[i].rotation.set(this.neckCur[i], 0, this.bendCur);
    }
    this.headCur = damp(this.headCur, pose.head, k, dt);
    this.headPivot.rotation.set(this.headCur - sum, 0, 0);

    // Wings: fold along the back, open to the side, arch over the back when busking or sailing.
    const w = this.wing;
    let open = w.open, lift = w.lift;
    if (this.state === 'swim') {
      if (this.activity === 'busk') { open = 0.42; lift = 0.95; }
      else if (this.activity === 'flap') { open = Math.min(1, this.actAge * 2) * (this.actAge < this.actTime - 0.5 ? 1 : 0); lift = 0.3; }
      else if (this.sailing > 0) { open = 0.3; lift = 0.75; }
      // Mute swans swim with their wings half-raised in a soft arch over the back.
      else if (this.key === 'mute' && this.activity !== 'rest' && this.activity !== 'feed') { open = 0.17; lift = 0.55; }
      else { open = 0; lift = 0.15; }
    }
    this.wingOpen = damp(this.wingOpen || 0, open, 4, dt);
    this.wingLift = damp(this.wingLift || 0.15, lift, 4, dt);
    const flapAmp = this.state === 'swim' ? (this.activity === 'flap' ? 0.9 : 0) : w.flap;
    w.phase += dt * TAU * (this.state === 'swim' ? 2.2 : w.freq);
    const flap = Math.sin(w.phase) * flapAmp * 0.85;
    for (const wing of this.wings) {
      wing.visible = this.wingOpen > 0.03;
      wing.rotation.set(0, (1 - this.wingOpen) * 1.45, this.wingLift + flap * this.wingOpen);
      wing.scale.setScalar(0.5 + 0.5 * this.wingOpen);
    }

    // Feet: paddle while swimming, reach forward to ski on landing, tuck in flight.
    this.feet.forEach((f, i) => {
      let rx;
      if (flying) rx = 1.5;
      else if (this.state === 'land' || (this.state === 'fly')) rx = -1.1;
      else rx = Math.sin((this.stroke + i * 0.5) * TAU) * 0.6;
      f.rotation.x = damp(f.rotation.x, rx, 8, dt);
    });

    const flapLift = this.activity === 'flap' && this.state === 'swim' ? 0.14 * Math.min(1, this.wingOpen * 1.5) : 0;
    this.lift = damp(this.lift, flapLift, 4, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.heading, 0);
    this.body.position.y = this.lift + (this.state === 'swim' ? Math.sin(this.stroke * TAU * 2) * 0.005 : 0);
    this.body.rotation.set(this.pitch, 0, this.roll);
  }
}

const _v = new THREE.Vector3();

export class Flock {
  constructor(scene, max) {
    this.scene = scene;
    this.max = max;
    this.swans = [];
  }

  get count() { return this.swans.length; }

  addSwimming(key, x, z, h) {
    const s = new Swan(key);
    s.placeSwimming(x, z, h);
    this.swans.push(s);
    this.scene.add(s.root);
    s.animate(1, { swans: [], time: { night: 0 } });
    return s;
  }

  // Land a swan at (x, z), or at a random clear spot when no point is given.
  release(key, point) {
    if (this.swans.length >= this.max) return null;
    let x, z;
    if (point) [x, z] = clampToWater(point[0], point[1], 2.2);
    else {
      for (let i = 0; i < 40; i++) {
        const th = Math.random() * TAU, r = Math.sqrt(Math.random()) * 6.5;
        x = Math.cos(th) * r; z = Math.sin(th) * r;
        if (shoreDist(x, z) > 2.6 && this.swans.every((o) => Math.hypot(o.pos.x - x, o.pos.z - z) > 2.4)) break;
      }
    }
    // Approach from the far side, towards the viewer, with clear water ahead to ski on.
    let approach = 0, best = -1;
    for (let i = 0; i < 24; i++) {
      const a = (Math.random() - 0.5) * 2.2;
      const room = shoreDist(x + Math.sin(a) * 4, z + Math.cos(a) * 4);
      const score = Math.min(room, 3) - Math.abs(a) * 0.4;
      if (score > best) { best = score; approach = a; }
    }
    const s = new Swan(key);
    s.flyIn(x, z, approach);
    this.swans.push(s);
    this.scene.add(s.root);
    this.pairUp(s);
    return s;
  }

  pairUp(s) {
    const mate = this.swans.find((o) => o !== s && o.key === s.key && !o.partner);
    if (mate) { s.partner = mate; mate.partner = s; }
  }

  clear() {
    this.swans.forEach((s, i) => setTimeout(() => s.takeOff(), i * 650 + Math.random() * 300));
  }

  update(dt, ctx) {
    ctx.swans = this.swans;
    // The warm glow is sunlight scattering in the plumage, so it fades after dusk.
    for (const s of this.swans) if (s.spec.glow) s.bodyMat.emissiveIntensity = 0.1 * (1 - ctx.time.night * 0.9);
    for (const s of this.swans) s.update(dt, ctx);
    for (let i = this.swans.length - 1; i >= 0; i--) {
      const s = this.swans[i];
      if (s.state === 'gone') {
        this.scene.remove(s.root);
        if (s.partner) s.partner.partner = null;
        this.swans.splice(i, 1);
      }
    }
  }
}
