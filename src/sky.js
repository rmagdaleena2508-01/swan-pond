// Sky dome: gradient, sun, moon and stars, all driven by the time state.

import * as THREE from 'three';

export function buildSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunI: { value: 0 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uCloud: { value: 0 },
    uHz: { value: 3.2 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunColor;
      uniform float uSunI, uMoon, uStars, uTime, uCloud, uHz;
      varying vec3 vDir;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        float hz = pow(1.0 - clamp(y, 0.0, 1.0), uHz);
        vec3 col = mix(uZenith, uHorizon, hz);
        if (y < 0.0) col = uHorizon * mix(0.85, 0.35, clamp(-y * 6.0, 0.0, 1.0));

        float sd = max(dot(d, uSunDir), 0.0);
        float sunUp = smoothstep(-0.08, 0.02, uSunDir.y);
        col += uSunColor * (pow(sd, 3.0) * 0.22 * (4.0 - uHz) / 3.0 + pow(sd, 6.0) * 0.18 + pow(sd, 64.0) * 0.5) * sunUp * (0.4 + uSunI * 0.3);
        col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 6.0 * sunUp;

        float md = dot(d, uMoonDir);
        vec3 moonCol = vec3(0.86, 0.9, 1.0);
        col += moonCol * smoothstep(0.99935, 0.99965, md) * 5.0 * uMoon;
        col += moonCol * (pow(max(md, 0.0), 400.0) * 0.08 + pow(max(md, 0.0), 12.0) * 0.015) * uMoon;

        if (uStars > 0.001 && y > 0.0) {
          vec3 p = d * 160.0;
          vec3 c = floor(p);
          float h = hash3(c);
          if (h > 0.965) {
            vec3 j = vec3(hash3(c + 1.3), hash3(c + 2.7), hash3(c + 4.1));
            float dist = length(fract(p) - j);
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
            float s = smoothstep(0.09, 0.0, dist) * tw * (h - 0.965) * 30.0;
            col += vec3(0.9, 0.93, 1.0) * s * uStars * smoothstep(0.0, 0.25, y) * (1.0 - uCloud);
          }
        }
        col = mix(col, vec3(dot(col, vec3(0.33))) * 0.8, uCloud * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return { mesh, uniforms };
}
