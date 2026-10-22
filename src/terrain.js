// Banks, hills, trees, reeds and lily pads around the pond.

import * as THREE from 'three';
import { groundHeight, pondRadius, shoreDist, fbm, noise2 } from './pond.js';

export function buildTerrain(low) {
  const size = 170, seg = low ? 240 : 340;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const mud = new THREE.Color('#3a3122'), deepMud = new THREE.Color('#241f16');
  const wet = new THREE.Color('#40391f'), grassA = new THREE.Color('#465f27'), grassB = new THREE.Color('#62742f');
  const dry = new THREE.Color('#7b7a42'), far = new THREE.Color('#3d5427');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    const n = fbm(x * 0.2, z * 0.2);
    if (y < 0) c.copy(mud).lerp(deepMud, Math.min(1, -y / 1.5));
    else if (y < 0.12) c.copy(wet).lerp(grassA, y / 0.12);
    else {
      c.copy(grassA).lerp(grassB, n);
      if (n > 0.68) c.lerp(dry, (n - 0.68) * 2.2);
      c.lerp(far, Math.min(1, Math.max(0, (Math.hypot(x, z) - 30) / 40)));
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
  return mesh;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Reeds and cattails sway with wind via a small vertex-shader patch.
export function buildReeds(count, windUniforms) {
  const blade = new THREE.PlaneGeometry(0.07, 1.5, 1, 6);
  blade.translate(0, 0.75, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    bp.setX(i, bp.getX(i) * (1 - y / 1.6));
  }
  const head = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6);
  head.translate(0, 1.3, 0);

  const patch = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <project_vertex>', /* glsl */`
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hgt = clamp(position.y / 1.5, 0.0, 1.0);
        hgt *= hgt;
        float ph = ip.x * 0.7 + ip.y * 0.9;
        vec2 wd = vec2(0.92, 0.38);
        float sway = (0.05 + uWind * 0.16) * sin(uTime * (1.4 + uWind) + ph) + uWind * 0.22;
        mvPosition.xz += wd * hgt * sway + vec2(-wd.y, wd.x) * hgt * 0.03 * sin(uTime * 1.1 + ph * 1.3);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const bladeMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
  bladeMat.onBeforeCompile = patch;
  const headMat = new THREE.MeshStandardMaterial({ color: '#4b3420', roughness: 0.9 });
  headMat.onBeforeCompile = patch;

  const reeds = new THREE.InstancedMesh(blade, bladeMat, count);
  const heads = new THREE.InstancedMesh(head, headMat, Math.ceil(count * 0.12));
  const rand = rng(21);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0, hn = 0, guard = 0;
  while (n < count && guard++ < count * 30) {
    const th = rand() * Math.PI * 2;
    // Clumps: noise decides where reed beds grow; avoid the near (camera) shore mostly.
    if (noise2(Math.cos(th) * 4 + 10, Math.sin(th) * 4) < 0.45) continue;
    const r = pondRadius(th) + (rand() - 0.45) * 2.0;
    const x = Math.cos(th) * r + (rand() - 0.5) * 0.4, z = Math.sin(th) * r + (rand() - 0.5) * 0.4;
    if (shoreDist(x, z) > 1.3) continue;
    const y = Math.max(groundHeight(x, z), -0.25);
    const hs = 0.9 + rand() * 1.0;
    p.set(x, y, z);
    // Seen from above, blades lean out over the water like long grass at the bank.
    const tilt = 0.35 + rand() * 0.8, ct = Math.cos(th), st = Math.sin(th);
    q.setFromAxisAngle(new THREE.Vector3(-st, 0, ct), tilt);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI));
    s.set(1, hs, 1);
    m.compose(p, q, s);
    reeds.setMatrixAt(n, m);
    col.setHSL(0.22 + rand() * 0.06, 0.4, 0.26 + rand() * 0.14);
    reeds.setColorAt(n, col);
    if (hn < heads.count && rand() < 0.05) heads.setMatrixAt(hn++, m);
    n++;
  }
  reeds.count = n;
  heads.count = hn;
  const group = new THREE.Group();
  group.add(reeds, heads);
  return group;
}

export function buildLilies(count) {
  const geo = new THREE.CircleGeometry(0.34, 22, 0.3, Math.PI * 2 - 0.3);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#3d6a2c', roughness: 0.55, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const flowerGeo = new THREE.ConeGeometry(0.09, 0.1, 8, 1, true);
  flowerGeo.rotateX(Math.PI);
  flowerGeo.translate(0, 0.06, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: '#f4e3ea', roughness: 0.6, side: THREE.DoubleSide }), Math.ceil(count / 4));
  const rand = rng(3);
  const pads = [];
  let guard = 0;
  while (pads.length < count && guard++ < 4000) {
    const th = rand() * Math.PI * 2;
    if (noise2(Math.cos(th) * 3 - 4, Math.sin(th) * 3 + 2) < 0.55) continue;
    const r = pondRadius(th) - 1.0 - rand() * 4.2;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    pads.push({ x, z, rot: rand() * 6.28, s: 0.7 + rand() * 0.6, spin: (rand() - 0.5) * 0.04, flower: pads.length % 4 === 0 });
  }
  mesh.count = pads.length;
  flowers.count = pads.filter((p) => p.flower).length;
  const group = new THREE.Group();
  group.add(mesh, flowers);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const slope = [0, 0];
  group.userData.update = (sim, dt) => {
    let fi = 0;
    pads.forEach((pad, i) => {
      pad.rot += pad.spin * dt;
      const y = sim.sample(pad.x, pad.z);
      sim.slope(pad.x, pad.z, slope);
      p.set(pad.x, y + 0.012, pad.z);
      e.set(slope[1] * 2, pad.rot, -slope[0] * 2);
      q.setFromEuler(e);
      s.setScalar(pad.s);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (pad.flower) flowers.setMatrixAt(fi++, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    flowers.instanceMatrix.needsUpdate = true;
  };
  return group;
}
