// Planar reflection for a water plane at y = 0.
// Mirror-camera and oblique near-plane clipping maths follow three.js's Reflector,
// so geometry below the surface never leaks into the reflection.

import * as THREE from 'three';

const normal = new THREE.Vector3(0, 1, 0);
const origin = new THREE.Vector3();
const camPos = new THREE.Vector3();
const rot = new THREE.Matrix4();
const view = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const target = new THREE.Vector3();
const plane = new THREE.Plane();
const clip = new THREE.Vector4();
const q = new THREE.Vector4();

export class PlanarReflection {
  constructor(scale) {
    this.scale = scale;
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 0 });
  }

  setSize(w, h) {
    this.target.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale)));
  }

  render(renderer, scene, camera, hidden) {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(camera.matrixWorld);
    view.subVectors(origin, camPos);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate().add(origin);

    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(origin, lookAt).reflect(normal).negate().add(origin);

    const mc = this.camera;
    mc.position.copy(view);
    mc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    mc.lookAt(target);
    mc.far = camera.far;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);

    plane.setFromNormalAndCoplanarPoint(normal, origin).applyMatrix4(mc.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mc.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1;
    q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;

    for (const o of hidden) o.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prev);
    for (const o of hidden) o.visible = true;
  }
}
