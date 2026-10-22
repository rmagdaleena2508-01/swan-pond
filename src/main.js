import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { shoreDist } from './pond.js';
import { WaveSim } from './sim.js';
import { PlanarReflection } from './reflection.js';
import { createTimeState, sampleTime } from './time.js';
import { buildSky } from './sky.js';
import { buildWater, MAX_GLOW } from './water.js';
import { buildTerrain, buildTrees, buildReeds, buildLilies } from './terrain.js';
import { Flock } from './swans.js';
import { Fireflies } from './fireflies.js';
import { Spray, Rain } from './effects.js';
import { PondAudio } from './audio.js';
import { initUI } from './ui.js';

const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_SWANS = 12;
const DAY_LENGTH = 240; // seconds for a full cycle

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('fallback').hidden = false;
  document.getElementById('ui').hidden = true;
  throw err;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);

// --- World ------------------------------------------------------------------
const sim = new WaveSim(mobile ? 176 : 256);
const reflection = new PlanarReflection(mobile ? 0.4 : 0.5);
const time = createTimeState();
const sky = buildSky();
scene.add(sky.mesh);

const water = buildWater(sim, reflection, mobile ? 160 : 256);
scene.add(water.mesh);
scene.add(buildTerrain(mobile));
scene.add(buildTrees());
const windUniforms = { uTime: { value: 0 }, uWind: { value: 0 } };
scene.add(buildReeds(mobile ? 1300 : 2600, windUniforms));
const lilies = buildLilies(28);
scene.add(lilies);

const sunLight = new THREE.DirectionalLight(0xffffff, 3);
const moonLight = new THREE.DirectionalLight(0x9fb2ff, 0);
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
scene.add(sunLight, sunLight.target, moonLight, moonLight.target, hemi);
scene.fog = new THREE.FogExp2(0x000000, 0.01);

const flock = new Flock(scene, MAX_SWANS);
flock.addSwimming('mute', -2.5, -3.5, 0.6);
flock.addSwimming('mute', -1.2, -4.6, 0.75);
flock.addSwimming('whooper', 4, 1.5, -2.2);
flock.pairUp(flock.swans[0]);

const glowPos = water.uniforms.uGlowPos.value;
const glowI = water.uniforms.uGlowI.value;
const fireflies = new Fireflies(scene, mobile ? 70 : 140, mobile ? 3 : 6);
const spray = new Spray(scene, 700);
const rain = new Rain(scene, mobile ? 260 : 600);
const audio = new PondAudio();

// --- Post-processing ---------------------------------------------------------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.45, 1.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- Quality ------------------------------------------------------------------
const LEVELS = [
  { dpr: 1, refl: 0.3, bloom: false },
  { dpr: 1.25, refl: 0.4, bloom: true },
  { dpr: Math.min(devicePixelRatio, 2), refl: 0.5, bloom: true },
];
let level = mobile ? 1 : 2;
function applyQuality() {
  const L = LEVELS[level];
  renderer.setPixelRatio(Math.min(L.dpr, devicePixelRatio));
  reflection.scale = L.refl;
  bloom.enabled = L.bloom;
  resize();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  reflection.setSize(w * pr, h * pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const scale = h * pr * 0.9;
  fireflies.uniforms.uScale.value = scale;
  spray.uniforms.uScale.value = scale;
}
addEventListener('resize', resize);

// --- Camera -------------------------------------------------------------------
const camTarget = new THREE.Vector3(0, 0, -1.2);
function placeCamera(t) {
  const aspect = camera.aspect;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const o = window.camOverride;
  const dist = o ? o.dist : Math.max(33, 21 / (2 * tan * aspect));
  const drift = reducedMotion ? 0 : 1;
  const yaw = o ? o.yaw : Math.sin(t * 0.021) * 0.07 * drift;
  const elev = THREE.MathUtils.degToRad(o ? o.elev : (aspect < 0.8 ? 54 : 37) + Math.sin(t * 0.017) * 1.5 * drift);
  if (o) camTarget.set(o.x, 0, o.z); else camTarget.set(0, 0, -1.2);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * Math.cos(elev) * dist,
    camTarget.y + Math.sin(elev) * dist,
    camTarget.z + Math.cos(yaw) * Math.cos(elev) * dist,
  );
  camera.lookAt(camTarget);
}

// --- Pointer on water -----------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
function screenToWater(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
}

const pointer = { x: 0, z: 0, active: false, t: 0 };
let stroke = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = screenToWater(e.clientX, e.clientY);
  if (!p) return;
  canvas.setPointerCapture(e.pointerId);
  stroke = { last: p, moved: 0, t: performance.now() };
  ui.dismissHint();
});
canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const p = screenToWater(e.clientX, e.clientY);
  if (!p) return;
  const [lx, lz] = stroke.last;
  const d = Math.hypot(p[0] - lx, p[1] - lz);
  const now = performance.now();
  const speed = d / Math.max(0.008, (now - stroke.t) / 1000);
  const strength = Math.min(1, speed / 6);
  // A fingertip drawn through water: separate pulses rather than a carved groove.
  const steps = Math.ceil(d / 0.45);
  for (let i = 1; i <= steps; i++) {
    const x = lx + ((p[0] - lx) * i) / steps + (Math.random() - 0.5) * 0.1, z = lz + ((p[1] - lz) * i) / steps + (Math.random() - 0.5) * 0.1;
    if (shoreDist(x, z) > 0) sim.drop(x, z, 0.3, -0.006 * (0.3 + strength));
  }
  stroke.moved += d;
  stroke.last = p;
  stroke.t = now;
  Object.assign(pointer, { x: p[0], z: p[1], active: true, t: now });
});
const endStroke = () => {
  if (stroke && stroke.moved < 0.3) {
    const [x, z] = stroke.last;
    if (shoreDist(x, z) > 0) { sim.drop(x, z, 0.38, -0.045); audio.plop(x); Object.assign(pointer, { x, z, active: true, t: performance.now() }); }
    if (time.fireflies > 0.2) fireflies.scatter(x, z);
  }
  stroke = null;
};
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

// --- State --------------------------------------------------------------------
const state = { t: 0.66, playing: true, wind: 0, windTarget: 0, tween: null };

const ui = initUI({
  state: () => state,
  setTime(t, user) { state.t = ((t % 1) + 1) % 1; if (user) state.tween = null; },
  setPlaying(on) { state.playing = on; },
  jumpDayNight() {
    // Ease forward in time to the next noon or midnight.
    const goal = time.night > 0.5 ? 0.5 : 0.0;
    let delta = ((goal - state.t) % 1 + 1) % 1;
    if (delta < 0.02) delta += 1;
    state.tween = { from: state.t, delta, age: 0, dur: 2.2 + delta * 3 };
  },
  setRain(on) { rain.target = on ? 1 : 0; },
  setWind(on) { state.windTarget = on ? 1 : 0; },
  setSync(on) { fireflies.setSync(on); },
  calm() { rain.target = 0; state.windTarget = 0; state.calming = 2.5; },
  clearPond() { flock.clear(); },
  setSound(on) { audio.setEnabled(on); },
  addSwan(species, cx, cy) {
    let point = null;
    if (cx !== undefined) point = screenToWater(cx, cy);
    const s = flock.release(species, point);
    if (s) ui.renderCount(flock.count, MAX_SWANS);
  },
  previewDrop() {},
});

document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));

// --- Loop ---------------------------------------------------------------------
const clock = new THREE.Clock();
let acc = 0, elapsed = 0;
let frameSum = 0, frameN = 0, goodFor = 0;
const ctx = { sim, spray, audio, pointer, time, wind: 0, swans: flock.swans };

applyQuality();
placeCamera(0);

function update(dt) {
  elapsed += dt;

  if (state.tween) {
    const tw = state.tween;
    tw.age += dt;
    const u = Math.min(1, tw.age / tw.dur);
    const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    state.t = (tw.from + tw.delta * ease) % 1;
    if (u >= 1) state.tween = null;
  } else if (state.playing) state.t = (state.t + dt / DAY_LENGTH) % 1;
  sampleTime(state.t, time);

  state.wind += (state.windTarget - state.wind) * Math.min(1, dt * 0.7);
  ctx.wind = state.wind;
  if (pointer.active && performance.now() - pointer.t > 1200) pointer.active = false;

  // Fixed-rate water.
  acc += dt;
  let steps = 0;
  while (acc >= 1 / 60 && steps < 3) { sim.step(); acc -= 1 / 60; steps++; }
  if (steps === 3) acc = 0;
  if (state.calming > 0) { state.calming -= dt; sim.calm(0.97); }
  water.heightTex.needsUpdate = true;

  flock.update(dt, ctx);
  if (ui) ui.renderCount(flock.count, MAX_SWANS);
  lilies.userData.update(sim, dt);
  spray.update(dt, sim);
  const rainDim = 1 - rain.amount * 0.45;
  rain.update(dt, sim, state.wind, time.sky);
  fireflies.update(dt, time.fireflies * (1 - rain.amount * 0.85), camera, glowPos, glowI);

  // Lighting from the time of day.
  sunLight.position.copy(time.sunDir).multiplyScalar(60);
  sunLight.color.copy(time.sun);
  sunLight.intensity = time.sunI * Math.max(0, Math.min(1, time.sunDir.y * 6 + 0.3)) * rainDim;
  moonLight.position.copy(time.moonDir).multiplyScalar(60);
  moonLight.intensity = 0.9 * time.moon * Math.max(0, time.moonDir.y) * rainDim;
  hemi.color.copy(time.sky);
  hemi.groundColor.copy(time.gnd);
  hemi.intensity = time.ambI * (1 - rain.amount * 0.2);
  scene.fog.color.copy(time.fog);
  scene.fog.density = time.fogD * (1 + rain.amount * 1.8) + time.night * 0.003;
  renderer.toneMappingExposure = time.exp;

  const su = sky.uniforms;
  su.uSunDir.value.copy(time.sunDir);
  su.uMoonDir.value.copy(time.moonDir);
  su.uZenith.value.copy(time.zen).lerp(time.fog, rain.amount * 0.5);
  su.uHorizon.value.copy(time.hor).lerp(time.fog, rain.amount * 0.5);
  su.uSunColor.value.copy(time.sun);
  su.uSunI.value = time.sunI * rainDim;
  su.uMoon.value = time.moon * rainDim;
  su.uStars.value = time.stars;
  su.uTime.value = elapsed;
  su.uCloud.value = rain.amount * 0.8;
  // Around sunrise and sunset the warm horizon colour climbs high into the sky.
  su.uHz.value = 3.2 - 2.0 * Math.max(0, 1 - Math.abs(time.e) / 0.32);

  const wu = water.uniforms;
  wu.uTime.value = elapsed;
  wu.uSunDir.value.copy(time.sunDir);
  wu.uSunColor.value.copy(time.sun);
  wu.uSunI.value = time.sunI * rainDim;
  wu.uMoonDir.value.copy(time.moonDir);
  wu.uMoon.value = time.moon * rainDim;
  wu.uAmbient.value.copy(time.sky).multiplyScalar(time.ambI);
  wu.uDeep.value.copy(time.deep);
  wu.uFogColor.value.copy(time.fog);
  wu.uFogDensity.value = scene.fog.density;
  wu.uWind.value = state.wind;
  wu.uRain.value = rain.amount;
  windUniforms.uTime.value = elapsed;
  windUniforms.uWind.value = state.wind;
  spray.uniforms.uLight.value.copy(time.sky).multiplyScalar(time.ambI * 0.8).add(new THREE.Color(time.sun).multiplyScalar(time.sunI * 0.15));

  audio.update(dt, { night: time.night, rain: rain.amount, wind: state.wind });
  ui.renderTime(state.t, time.night);

  placeCamera(elapsed);
}

function render() {
  reflection.render(renderer, scene, camera, [water.mesh, rain.lines]);
  composer.render();
}

function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  update(dt);
  render();

  // Adaptive quality with hysteresis.
  // Throttled background frames say nothing about real performance.
  if (raw < 0.2 && !document.hidden) { frameSum += raw; frameN++; }
  if (frameN >= 90) {
    const avg = frameSum / frameN;
    if (avg > 0.024 && level > 0) { level--; applyQuality(); goodFor = 0; }
    else if (avg < 0.0135 && level < (mobile ? 1 : 2)) { goodFor += frameSum; if (goodFor > 6) { level++; applyQuality(); goodFor = 0; } }
    frameSum = 0; frameN = 0;
  }
  requestAnimationFrame(frame);
}
ui.renderCount(flock.count, MAX_SWANS);
requestAnimationFrame(frame);

if (params.has('debug')) {
  // Advance the world in fixed steps and draw once; handy when the tab is throttled.
  const advance = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) update(1 / 30); render(); };
  Object.assign(window, { THREE, scene, camera, renderer, sim, flock, fireflies, state, time, advance, rain });
}
