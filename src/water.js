// Water surface material.
// Normals come from the simulated heightfield plus small wind ripples.
// Colour = Fresnel blend (Schlick, F0 = 0.02) of the planar reflection and the
// water body, where the body is the pond bed seen through Beer–Lambert absorption.

import * as THREE from 'three';

export const MAX_GLOW = 8; // firefly lights the water shader knows about

export function buildWater(sim, reflection, segments) {
  const heightTex = new THREE.DataTexture(sim.h, sim.res, sim.res, THREE.RedFormat, THREE.FloatType);
  heightTex.needsUpdate = true;
  const depthTex = new THREE.DataTexture(sim.depth, sim.res, sim.res, THREE.RedFormat, THREE.FloatType);
  depthTex.needsUpdate = true;

  const uniforms = {
    uH: { value: heightTex },
    uD: { value: depthTex },
    uRes: { value: sim.res },
    uSize: { value: sim.size },
    uRefl: { value: reflection.target.texture },
    uTexMat: { value: reflection.textureMatrix },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uSunI: { value: 0 },
    uMoonDir: { value: new THREE.Vector3() },
    uMoon: { value: 0 },
    uAmbient: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.01 },
    uWind: { value: 0 },
    uRain: { value: 0 },
    uNS: { value: 3.5 },
    uGlowPos: { value: Array.from({ length: MAX_GLOW }, () => new THREE.Vector3(0, -50, 0)) },
    uGlowI: { value: new Float32Array(MAX_GLOW) },
    uGlowColor: { value: new THREE.Color('#c9f24a') },
  };

  const shared = /* glsl */`
    uniform sampler2D uH;
    uniform sampler2D uD;
    uniform float uRes, uSize;
    float fetchT(sampler2D t, ivec2 c) {
      c = clamp(c, ivec2(0), ivec2(int(uRes) - 1));
      return texelFetch(t, c, 0).r;
    }
    float sampleT(sampler2D t, vec2 uv) {
      vec2 p = uv * uRes - 0.5;
      vec2 f = fract(p);
      ivec2 i = ivec2(floor(p));
      float a = fetchT(t, i), b = fetchT(t, i + ivec2(1, 0));
      float c = fetchT(t, i + ivec2(0, 1)), d = fetchT(t, i + ivec2(1, 1));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }`;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      ${shared}
      uniform mat4 uTexMat;
      varying vec3 vWorld;
      varying vec4 vRefl;
      varying vec2 vUv;
      void main() {
        vec3 p = position;
        vec2 uv = p.xz / uSize + 0.5;
        p.y += sampleT(uH, uv);
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        vUv = uv;
        vRefl = uTexMat * w;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      ${shared}
      uniform sampler2D uRefl;
      uniform float uTime, uSunI, uMoon, uFogDensity, uWind, uRain, uNS;
      uniform vec3 uSunDir, uSunColor, uMoonDir, uAmbient, uDeep, uFogColor, uGlowColor;
      uniform vec3 uGlowPos[${MAX_GLOW}];
      uniform float uGlowI[${MAX_GLOW}];
      varying vec3 vWorld;
      varying vec4 vRefl;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float wavelets(vec2 p) {
        vec2 w = vec2(0.92, 0.38);
        float t = uTime * (0.6 + uWind * 1.4);
        return vnoise(p * 1.4 + w * t * 0.7) * 0.5
             + vnoise(p * 3.1 - vec2(w.y, -w.x) * t * 0.9 + 3.1) * 0.3
             + vnoise(p * 6.7 + w * t * 1.8 + 7.0) * 0.2;
      }
      float caustic(vec2 p, float t) {
        vec2 w = vec2(vnoise(p * 0.8 + t * 0.15), vnoise(p * 0.8 - t * 0.12 + 5.0));
        float a = 1.0 - abs(vnoise(p * 2.2 + w * 2.0 + t * 0.10) * 2.0 - 1.0);
        float b = 1.0 - abs(vnoise(p * 2.7 - w * 1.7 - t * 0.13 + 9.0) * 2.0 - 1.0);
        return pow(a, 8.0) * 0.6 + pow(b, 8.0) * 0.6 + pow(a * b, 4.0) * 0.8;
      }

      void main() {
        float tx = 1.0 / uRes;
        float cell = uSize / uRes;
        float hL = sampleT(uH, vUv - vec2(tx, 0.0)), hR = sampleT(uH, vUv + vec2(tx, 0.0));
        float hD = sampleT(uH, vUv - vec2(0.0, tx)), hU = sampleT(uH, vUv + vec2(0.0, tx));
        vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * cell) * uNS;

        float amp = 0.014 + uWind * 0.16 + uRain * 0.05;
        float e = 0.04;
        float c0 = wavelets(vWorld.xz);
        vec2 wg = vec2(wavelets(vWorld.xz + vec2(e, 0.0)) - c0, wavelets(vWorld.xz + vec2(0.0, e)) - c0) / e;
        grad += wg * amp;

        vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float cosT = clamp(dot(n, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

        vec2 ruv = vRefl.xy / vRefl.w + n.xz * 0.05;
        vec3 refl = texture2D(uRefl, ruv).rgb;

        // Water body: bed seen through absorbing, tea-green pond water.
        float depth = sampleT(uD, vUv);
        float cosV = max(V.y, 0.08);
        float path = depth / cosV + depth;
        vec3 sigma = vec3(0.62, 0.24, 0.42);
        vec3 T = exp(-sigma * path);
        float sunUp = max(uSunDir.y, 0.0);
        vec3 light = uSunColor * uSunI * sunUp * 0.32 + uAmbient * 0.55 + vec3(0.55, 0.62, 0.8) * uMoon * 0.25;
        vec3 bed = mix(vec3(0.24, 0.2, 0.13), vec3(0.1, 0.09, 0.06), smoothstep(0.0, 1.6, depth));
        float caus = caustic(vWorld.xz * 0.55 + n.xz * 1.5, uTime * 0.8) * smoothstep(1.9, 0.15, depth);
        bed = bed * light + caus * uSunColor * uSunI * sunUp * 0.07;
        // Patchy algae and depth make the green-teal body uneven, as in the painting.
        float algae = vnoise(vWorld.xz * 0.11 + 3.0) * 0.6 + vnoise(vWorld.xz * 0.37) * 0.4;
        vec3 scatter = uDeep * (uAmbient * 0.9 + uSunColor * uSunI * sunUp * 0.25 + vec3(0.6, 0.7, 1.0) * uMoon * max(uMoonDir.y, 0.0) * 2.2) * (0.75 + 0.5 * algae);
        vec3 body = bed * T + scatter * (1.0 - T);

        vec3 col = mix(body, refl, F);

        // Sun and moon glitter: sharp highlights broken up by the ripples.
        vec3 Hs = normalize(uSunDir + V);
        float ns = max(dot(n, Hs), 0.0);
        col += uSunColor * uSunI * (pow(ns, 2400.0) * 0.9 + pow(ns, 320.0) * 0.03) * smoothstep(-0.04, 0.05, uSunDir.y);
        vec3 Hm = normalize(uMoonDir + V);
        float nm = max(dot(n, Hm), 0.0);
        col += vec3(0.75, 0.82, 1.0) * uMoon * (pow(nm, 2400.0) * 1.6 + pow(nm, 300.0) * 0.025) * step(0.0, uMoonDir.y);

        // Firefly light falling on the surface, plus each one's own glint.
        for (int i = 0; i < ${MAX_GLOW}; i++) {
          float I = uGlowI[i];
          if (I <= 0.001) continue;
          vec3 d = uGlowPos[i] - vWorld;
          float r2 = dot(d, d);
          vec3 L = d * inversesqrt(r2);
          vec3 Hf = normalize(L + V);
          float g = pow(max(dot(n, Hf), 0.0), 260.0);
          col += uGlowColor * I * (0.025 / (r2 + 0.08) + g * 1.6 / (1.0 + r2 * 0.6));
        }

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(min(col, vec3(4.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(sim.size, sim.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms, heightTex };
}
