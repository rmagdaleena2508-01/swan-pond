// Impressionist finish, after Monet's water-lily canvases.
//
// 1. A Kuwahara filter flattens the render into dabs of paint. Its sampling
//    grid is rotated by a slow noise field, so dabs follow curving strokes
//    instead of lining up in squares.
// 2. Stretched noise along the same field adds bristle marks; a fixed hash adds canvas tooth.
// 3. A light warm grade, then a dark burnt rounded frame like an old print.

import * as THREE from 'three';

export function createPaintPass(radius) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSpacing: { value: 1.35 },
      uNight: { value: 0 },
    },
    defines: { R: radius },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 uRes;
      uniform float uSpacing, uNight;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float sdRoundBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      void main() {
        float aspect = uRes.x / uRes.y;
        vec2 sp = vUv * vec2(aspect, 1.0);
        // Mostly level strokes, the way water is painted, with a gentle wander.
        float ang = 0.15 + (vnoise(sp * 1.6) - 0.5) * 1.1 + (vnoise(sp * 6.0 + 4.0) - 0.5) * 0.5;
        mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec2 px = uSpacing / uRes;
        // Jitter the dab centre along the stroke so smooth gradients break into
        // strokes instead of the contour bands a plain Kuwahara leaves.
        vec2 jp = rot * (vUv * uRes / (5.0 * uSpacing));
        vec2 base = vUv + rot * vec2((vnoise(jp * vec2(0.5, 2.0)) - 0.5) * 3.5, (vnoise(jp * vec2(0.5, 2.0) + 7.0) - 0.5) * 1.4) * px;

        vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
        vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
        for (int j = -R; j <= R; j++) {
          for (int i = -R; i <= R; i++) {
            vec2 o = rot * vec2(float(i), float(j) * 0.75);
            vec3 c = texture2D(tDiffuse, base + o * px).rgb;
            c = c / (1.0 + c); // compress highlights so glints do not dominate a dab
            vec3 c2 = c * c;
            if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
            if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
            if (i >= 0 && j >= 0) { m2 += c; s2 += c2; }
            if (i <= 0 && j >= 0) { m3 += c; s3 += c2; }
          }
        }
        float n = float((R + 1) * (R + 1));
        m0 /= n; m1 /= n; m2 /= n; m3 /= n;
        float v0 = dot(s0 / n - m0 * m0, vec3(1.0));
        float v1 = dot(s1 / n - m1 * m1, vec3(1.0));
        float v2 = dot(s2 / n - m2 * m2, vec3(1.0));
        float v3 = dot(s3 / n - m3 * m3, vec3(1.0));
        vec3 col = m0; float best = v0;
        if (v1 < best) { best = v1; col = m1; }
        if (v2 < best) { best = v2; col = m2; }
        if (v3 < best) { best = v3; col = m3; }
        col = col / max(vec3(1e-3), 1.0 - col); // back to linear HDR

        // Short dabs along the stroke field: each dab shifts value and hue a
        // little, the broken colour of impressionist water. Then canvas tooth.
        vec2 sp2 = rot * (vUv * uRes / (6.0 * uSpacing));
        float dab = vnoise(vec2(sp2.x * 0.45, sp2.y * 1.6));
        float hue = vnoise(sp2 * 0.18 + 11.0);
        col *= 0.88 + 0.24 * dab;
        col *= mix(vec3(0.94, 1.04, 0.96), vec3(1.04, 0.98, 1.02), hue);
        col *= 0.97 + 0.06 * hash(floor(vUv * uRes));

        // Grade: a little warmth in the lights, teal kept in the shadows.
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, 1.12);
        col *= mix(vec3(0.94, 1.0, 1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.05, 0.7, l));

        // Burnt rounded frame.
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float margin = 0.022, radius = 0.05;
        float d = sdRoundBox(p, vec2(aspect * 0.5, 0.5) - margin, radius);
        d += (vnoise(p * 28.0) - 0.5) * 0.012 + (vnoise(p * 6.0 + 2.0) - 0.5) * 0.012;
        float burn = smoothstep(-0.14, 0.0, d);
        col *= mix(vec3(1.0), vec3(0.42, 0.33, 0.24), burn * 0.85);
        col = mix(col, vec3(0.012, 0.011, 0.009), smoothstep(-0.004, 0.006, d));

        gl_FragColor = vec4(col, 1.0);
      }`,
  };
}
