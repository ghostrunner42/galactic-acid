import * as THREE from 'three';

const BALL_COUNT = 6;

/**
 * Lava-lamp metaball: reciprocal field (MarchingCubes.addBall) + rim-matched
 * contour banding (magenta → blue → cyan → lime) and irregular cell lobes.
 */
const VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uCenters[6];
uniform float uRadii[6];
uniform vec3 uAxes[6];
uniform float uStrength[6];
uniform float uSubtract;
uniform float uIsol;
uniform vec3 uBoundCenter;
uniform float uBoundRadius;

varying vec3 vWorldPos;

float ballVal(vec3 p, vec3 c, float strength, vec3 ax) {
  vec3 q = (p - c) / ax;
  float r2 = dot(q, q);
  return strength / (0.000001 + r2) - uSubtract;
}

float fieldScene(vec3 p) {
  float f = 0.0;
  for (int i = 0; i < 6; i++) {
    float v = ballVal(p, uCenters[i], uStrength[i], uAxes[i]);
    if (v > 0.0) f += v;
  }
  return f;
}

vec3 fieldGrad(vec3 p) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 ax = uAxes[i];
    vec3 q = (p - uCenters[i]) / ax;
    float r2 = dot(q, q);
    float denom = 0.000001 + r2;
    float v = uStrength[i] / denom - uSubtract;
    if (v > 0.0) {
      vec3 dq = (-2.0 * uStrength[i] * q) / (denom * denom);
      g += dq / ax;
    }
  }
  return g;
}

// Organic surface wrinkle — breaks smooth oval into cell-like lobes
float wrinkle(vec3 p) {
  float t = uTime * 0.55;
  return 0.055 * sin(p.x * 3.1 + t)
       * sin(p.y * 2.7 - t * 0.8)
       * sin(p.z * 2.4 + t * 0.6)
       + 0.035 * sin(p.x * 5.2 - p.y * 4.1 + t * 1.3);
}

float mapScene(vec3 p) {
  float f = fieldScene(p);
  float g = length(fieldGrad(p));
  return (uIsol - f) / max(g, 0.08) + wrinkle(p);
}

vec3 calcNormal(vec3 p) {
  vec3 g = fieldGrad(p);
  float gl = length(g);
  if (gl > 1e-5) {
    // Wrinkle gradient via central differences (cheap)
    const float e = 0.04;
    vec3 wn = vec3(
      wrinkle(p + vec3(e, 0.0, 0.0)) - wrinkle(p - vec3(e, 0.0, 0.0)),
      wrinkle(p + vec3(0.0, e, 0.0)) - wrinkle(p - vec3(0.0, e, 0.0)),
      wrinkle(p + vec3(0.0, 0.0, e)) - wrinkle(p - vec3(0.0, 0.0, e))
    );
    return normalize(-g + wn * 12.0);
  }
  const float e = 0.03;
  return normalize(vec3(
    mapScene(p + vec3(e, 0.0, 0.0)) - mapScene(p - vec3(e, 0.0, 0.0)),
    mapScene(p + vec3(0.0, e, 0.0)) - mapScene(p - vec3(0.0, e, 0.0)),
    mapScene(p + vec3(0.0, 0.0, e)) - mapScene(p - vec3(0.0, 0.0, e))
  ));
}

float sphereEnter(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float disc = b * b - dot(oc, oc) + r * r;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;
  if (t1 < 0.0) return -1.0;
  return max(t0, 0.0);
}

// Cheap stipple like the rim texture grain
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Rim palette: magenta → electric blue → cyan → lime (stepped contours)
vec3 rimContour(float t, float grain) {
  // t: 0 = core, 1 = outer rim
  vec3 magenta = vec3(1.00, 0.17, 0.84);
  vec3 blue    = vec3(0.28, 0.32, 1.00);
  vec3 cyan    = vec3(0.00, 0.90, 1.00);
  vec3 lime    = vec3(0.78, 1.00, 0.05);

  // Hard-ish bands with slight grain jitter (topographic / stippled)
  float tg = clamp(t + (grain - 0.5) * 0.06, 0.0, 1.0);
  vec3 col;
  if (tg > 0.70) {
    col = mix(blue, magenta, smoothstep(0.70, 0.92, tg));
  } else if (tg > 0.42) {
    col = mix(cyan, blue, smoothstep(0.42, 0.70, tg));
  } else if (tg > 0.18) {
    col = mix(lime, cyan, smoothstep(0.18, 0.42, tg));
  } else {
    col = mix(lime * 1.15, lime, tg / 0.18);
  }
  // Stipple darken/brighten like rim dither
  col *= 0.88 + 0.24 * grain;
  return col;
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - cameraPosition);

  float tEnter = sphereEnter(ro, rd, uBoundCenter, uBoundRadius);
  if (tEnter < 0.0) discard;

  float t = tEnter;
  float hit = -1.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    if (length(p - uBoundCenter) > uBoundRadius + 0.35) break;
    float d = mapScene(p);
    if (d < 0.02) { hit = t; break; }
    t += clamp(d * 0.8, 0.01, 0.22);
    if (t > tEnter + uBoundRadius * 2.8) break;
  }

  if (hit < 0.0) discard;

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  n = normalize(mix(n, -rd, 0.08));
  vec3 view = normalize(ro - p);
  float ndv = max(dot(n, view), 0.0);
  float fres = pow(1.0 - ndv, 1.55);

  // Thickness / density toward core
  float thick = 0.0;
  vec3 pi = p - view * 0.28;
  for (int j = 0; j < 5; j++) {
    float di = mapScene(pi);
    thick += exp(-max(di, 0.0) * 3.6);
    pi -= view * 0.18;
  }
  thick = clamp(thick * 0.22, 0.0, 1.0);

  // Field depth above isol — denser = deeper into wax
  float fHit = fieldScene(p);
  float depth = clamp((fHit - uIsol) / 10.0, 0.0, 1.0);

  // Contour coordinate: edge magenta → core lime (matches tunnel cells)
  float band = clamp(fres * 0.78 + (1.0 - thick) * 0.45 - depth * 0.25, 0.0, 1.0);
  float grain = hash21(gl_FragCoord.xy * 0.7 + floor(uTime * 8.0));
  vec3 col = rimContour(band, grain);

  // Mild wet highlight (keep gel, not chrome)
  vec3 halfV = normalize(view + normalize(vec3(0.15, 0.75, 0.35)));
  float spec = pow(max(dot(n, halfV), 0.0), 36.0);
  col += vec3(1.0, 0.9, 1.0) * spec * 0.35;

  // More opaque than soft jelly — closer to solid rim wax cells
  float alpha = mix(0.72, 0.97, fres * 0.55 + (1.0 - thick) * 0.25);
  alpha = clamp(alpha, 0.65, 0.98);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * @param {'blob'|'seam'} mode
 */
export function createGoopMetaball(mode = 'seam') {
  const localRest = [];
  const localPos = [];
  const vel = [];
  const radii = [];
  const axes = [];
  const strengths = [];

  const SUBTRACT = 2.2;
  const ISOL = 1.05;

  if (mode === 'seam') {
    // Irregular wall cell ribbon — lumpy, not a smooth sausage
    const side = Math.random() * Math.PI * 2;
    for (let i = 0; i < BALL_COUNT; i++) {
      const t = i / (BALL_COUNT - 1);
      const along = (t - 0.5) * 3.2 + (Math.random() - 0.5) * 0.35;
      const bulge = Math.sin(t * Math.PI);
      const a = side + (t - 0.5) * 0.55 + (Math.random() - 0.5) * 0.35;
      const r = 0.55 + bulge * 0.2 + Math.random() * 0.15;
      const p = new THREE.Vector3(
        Math.cos(a) * r + (Math.random() - 0.5) * 0.25,
        Math.sin(a) * r + (Math.random() - 0.5) * 0.25,
        along
      );
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      radii.push(0.35 + Math.random() * 0.55 + bulge * 0.25);
      axes.push(
        new THREE.Vector3(
          0.7 + Math.random() * 0.35,
          0.75 + Math.random() * 0.3,
          1.05 + Math.random() * 0.45
        )
      );
    }
  } else {
    // Amoeba / peanut cluster — unequal lobes like rim cells
    const yaw = Math.random() * Math.PI * 2;
    for (let i = 0; i < BALL_COUNT; i++) {
      const lobe = i / BALL_COUNT;
      const ang = yaw + lobe * Math.PI * 2 * (0.7 + Math.random() * 0.4);
      const orbit = 0.15 + Math.random() * 0.55;
      const along = (Math.random() - 0.5) * 2.4;
      const p = new THREE.Vector3(
        Math.cos(ang) * orbit,
        Math.sin(ang) * orbit * (0.7 + Math.random() * 0.5),
        along
      );
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      // Big + small satellite droplets (rim has satellites)
      const big = Math.random() < 0.35;
      radii.push(big ? 0.7 + Math.random() * 0.35 : 0.28 + Math.random() * 0.35);
      axes.push(
        new THREE.Vector3(
          0.75 + Math.random() * 0.4,
          0.7 + Math.random() * 0.45,
          0.9 + Math.random() * 0.5
        )
      );
    }
  }

  const baseRadii = radii.slice();
  const worldCenters = localPos.map(() => new THREE.Vector3());
  const worldAxes = axes.map((a) => a.clone());

  for (let i = 0; i < BALL_COUNT; i++) {
    const r = radii[i];
    strengths.push((ISOL + SUBTRACT) * r * r);
  }

  const uniforms = {
    uTime: { value: 0 },
    uCenters: { value: worldCenters },
    uRadii: { value: radii },
    uAxes: { value: worldAxes },
    uStrength: { value: strengths },
    uSubtract: { value: SUBTRACT },
    uIsol: { value: ISOL },
    uBoundCenter: { value: new THREE.Vector3() },
    uBoundRadius: { value: 5.5 },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  const boundR = mode === 'seam' ? 6.2 : 4.8;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(boundR, 28, 20), mat);
  if (mode === 'seam') {
    mesh.scale.set(1.05, 1.05, 1.35);
  } else {
    mesh.scale.set(1.05, 1.1, 1.25);
  }
  uniforms.uBoundRadius.value = boundR;

  const phase = Math.random() * Math.PI * 2;
  const _tmp = new THREE.Vector3();
  const _ax = new THREE.Vector3();
  const _scale = new THREE.Vector3();

  function update(dt, time) {
    uniforms.uTime.value = time;
    mesh.updateWorldMatrix(true, false);

    const sx = mesh.scale.x;
    const sy = mesh.scale.y;
    const sz = mesh.scale.z;

    for (let i = 0; i < BALL_COUNT; i++) {
      const target = localRest[i].clone();
      const w = time * (0.38 + i * 0.03) + phase;
      // Lazy lava-lamp drift — keep lobes merging / splitting feel
      target.x += Math.sin(w) * 0.14;
      target.y += Math.cos(w * 0.9) * 0.12;
      target.z += Math.sin(w * 0.5 + i) * 0.2;

      const c = localPos[i];
      const v = vel[i];
      v.addScaledVector(target.sub(c).multiplyScalar(4.2), dt);
      v.multiplyScalar(0.93);
      c.addScaledVector(v, dt);

      const maxXY = mode === 'seam' ? 1.35 : 0.95;
      const maxZ = mode === 'seam' ? 2.3 : 1.9;
      const xy = Math.hypot(c.x, c.y);
      if (xy > maxXY) {
        const s = maxXY / xy;
        c.x *= s;
        c.y *= s;
      }
      if (Math.abs(c.z) > maxZ) c.z = Math.sign(c.z) * maxZ;

      radii[i] = baseRadii[i] + 0.14 * Math.sin(time * 1.2 + i * 1.3 + phase);
      strengths[i] = (ISOL + SUBTRACT) * radii[i] * radii[i];

      _tmp.copy(c);
      mesh.localToWorld(_tmp);
      worldCenters[i].copy(_tmp);

      _scale.set(sx, sy, sz);
      _ax.copy(axes[i]).multiply(_scale);
      worldAxes[i].copy(_ax);
    }

    mesh.getWorldPosition(uniforms.uBoundCenter.value);
    uniforms.uBoundRadius.value = boundR * Math.max(sx, sy, sz);
    uniforms.uRadii.value = radii;
    uniforms.uCenters.value = worldCenters;
    uniforms.uAxes.value = worldAxes;
    uniforms.uStrength.value = strengths;
  }

  function pinch() {
    for (let i = 0; i < BALL_COUNT; i++) {
      const dir = localPos[i].clone();
      if (dir.lengthSq() < 1e-4) {
        dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      }
      dir.normalize();
      vel[i].addScaledVector(dir, 3 + Math.random() * 2);
    }
  }

  return {
    mesh,
    update,
    pinch,
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
