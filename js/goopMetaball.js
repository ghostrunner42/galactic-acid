import * as THREE from 'three';

const BALL_COUNT = 6;

/**
 * Lava-lamp metaball: classic reciprocal field (Three.js MarchingCubes.addBall /
 * webglsamples blob) raymarched on GPU — no CPU mesh rebuild.
 * Field: sum( strength/(ε+r²) - subtract ); SDF ≈ (isol - field) / |∇field|.
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
uniform vec3 uRim;
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uBoundCenter;
uniform float uBoundRadius;

varying vec3 vWorldPos;

// One ball contrib — matches MarchingCubes.addBall reciprocal
float ballVal(vec3 p, vec3 c, float strength, vec3 ax) {
  vec3 q = (p - c) / ax;
  float r2 = dot(q, q);
  return strength / (0.000001 + r2) - uSubtract;
}

float fieldScene(vec3 p) {
  float f = 0.0;
  for (int i = 0; i < 6; i++) {
    float v = ballVal(p, uCenters[i], uStrength[i], uAxes[i]);
    // addBall only accumulates when val > 0 (fade-out radius)
    if (v > 0.0) f += v;
  }
  return f;
}

// Analytic ∇ of strength/(ε+|q|²) with q=(p-c)/ax, then chain-rule / ax
vec3 fieldGrad(vec3 p) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 ax = uAxes[i];
    vec3 q = (p - uCenters[i]) / ax;
    float r2 = dot(q, q);
    float denom = 0.000001 + r2;
    float v = uStrength[i] / denom - uSubtract;
    if (v > 0.0) {
      // d/dq (s/denom) = -2 s q / denom² ; dq/dp = 1/ax
      vec3 dq = (-2.0 * uStrength[i] * q) / (denom * denom);
      g += dq / ax;
    }
  }
  return g;
}

// Approximate SDF so sphere-tracing still works
float mapScene(vec3 p) {
  float f = fieldScene(p);
  float g = length(fieldGrad(p));
  return (uIsol - f) / max(g, 0.08);
}

vec3 calcNormal(vec3 p) {
  // Field rises toward centers → ∇field points inward; flip for outward N
  vec3 g = fieldGrad(p);
  float gl = length(g);
  if (gl > 1e-5) return normalize(-g);
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
    // Conservative step — |grad| SDF can undershoot lipschitz near merges
    t += clamp(d * 0.8, 0.01, 0.22);
    if (t > tEnter + uBoundRadius * 2.8) break;
  }

  if (hit < 0.0) discard;

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  // Soften so wax reads jelly, not hard plastic
  n = normalize(mix(n, -rd, 0.12));
  vec3 view = normalize(ro - p);
  float ndv = max(dot(n, view), 0.0);
  float fres = pow(1.0 - ndv, 1.65);
  float fresSoft = pow(1.0 - ndv, 3.2);

  // Fake thickness: peek inside along the view
  float thick = 0.0;
  vec3 pi = p - view * 0.35;
  for (int j = 0; j < 4; j++) {
    float di = mapScene(pi);
    thick += exp(-max(di, 0.0) * 4.0);
    pi -= view * 0.22;
  }
  thick = clamp(thick * 0.28, 0.0, 1.0);

  float pulse = 0.5 + 0.5 * sin(uTime * 1.35 + p.x * 1.4 + p.y * 1.15 + p.z * 0.5);
  // Volumetric guts — translucent cyan body, lime hot spots
  vec3 guts = mix(uCore * 0.75, uHot, pulse * 0.55 + thick * 0.35);
  guts = mix(guts, uCore * 1.15, thick * 0.5);

  // Magenta gel shell + slight chromatic rim split
  vec3 rim = mix(uRim, uCore, fresSoft * 0.25);
  rim = mix(rim, uHot, fres * 0.15);
  vec3 col = mix(guts, rim, fres * 0.92);
  // Wet specular speck
  vec3 halfV = normalize(view + normalize(vec3(0.2, 0.7, 0.4)));
  float spec = pow(max(dot(n, halfV), 0.0), 48.0);
  col += vec3(1.0, 0.85, 1.0) * spec * 0.55;
  // Subsurface glow when looking through the mass
  col += uHot * (1.0 - fres) * thick * 0.35;
  col += uRim * fresSoft * 0.2;

  // Classic jelly: see-through center, denser rim
  float alpha = mix(0.38, 0.92, fres * 0.75 + thick * 0.35);
  alpha = clamp(alpha + fresSoft * 0.12, 0.32, 0.96);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * @param {'blob'|'seam'} mode
 *  blob = elongated floating lamp mass (teardrop / pill)
 *  seam = wall-hugging lava ribbon you weave past
 */
export function createGoopMetaball(mode = 'seam') {
  const localRest = [];
  const localPos = [];
  const vel = [];
  const radii = [];
  const axes = [];
  const strengths = [];

  // Reciprocal field params — world-space cousin of demo subtract/isol
  // Isol surface size ≈ radius when strength ≈ (isol+subtract)*r²
  const SUBTRACT = 2.4;
  const ISOL = 1.0;

  if (mode === 'seam') {
    // Long wall ribbon — span Z hard so it never reads as a marble
    const side = Math.random() * Math.PI * 2;
    for (let i = 0; i < BALL_COUNT; i++) {
      const t = i / (BALL_COUNT - 1);
      const along = (t - 0.5) * 3.4;
      const bulge = Math.sin(t * Math.PI); // fat mid, thin ends
      const a = side + (t - 0.5) * 0.35 + (i % 2) * 0.08;
      const r = 0.62 + bulge * 0.12;
      const p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, along);
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      // Taper radii: thick mid lobe
      radii.push(0.55 + bulge * 0.55 + Math.random() * 0.08);
      // Flatten against wall, stretch along flight
      axes.push(new THREE.Vector3(0.82, 0.9, 1.28 + bulge * 0.25));
    }
  } else {
    // Classic lava-lamp blob: chain along Z, fat bulb + thinner neck
    const yaw = Math.random() * Math.PI * 2;
    const tipHeavy = Math.random() < 0.5;
    for (let i = 0; i < BALL_COUNT; i++) {
      const t = i / (BALL_COUNT - 1);
      const along = (t - 0.5) * 2.8;
      const taper = tipHeavy ? t : 1 - t; // 0..1 fat end
      const fat = 0.35 + taper * 0.85;
      const swirl = Math.sin(t * Math.PI * 1.2) * 0.22;
      const p = new THREE.Vector3(
        Math.cos(yaw) * swirl,
        Math.sin(yaw) * swirl * 0.9,
        along
      );
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      radii.push(0.42 + fat * 0.55 + (i === 0 || i === BALL_COUNT - 1 ? -0.08 : 0));
      // Teardrop stretch: skinny XY, long Z; fatter end gets rounder axes
      axes.push(
        new THREE.Vector3(
          0.78 + fat * 0.18,
          0.82 + fat * 0.16,
          1.22 + (1 - fat) * 0.28
        )
      );
    }
  }

  const baseRadii = radii.slice();
  const worldCenters = localPos.map(() => new THREE.Vector3());
  const worldAxes = axes.map((a) => a.clone());

  // strength so single-ball zero-ish shell ≈ radius (addBall: r² = s/(isol+sub))
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
    uRim: { value: new THREE.Color(0xff2bd6) },
    uCore: { value: new THREE.Color(0x00e5ff) },
    uHot: { value: new THREE.Color(0xc8ff00) },
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

  // Bound covers the long pill; mesh itself stays roughly spherical for culling
  const boundR = mode === 'seam' ? 6.2 : 4.8;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(boundR, 28, 20), mat);
  // Extra non-uniform stretch on the shell reinforces the lamp silhouette
  if (mode === 'seam') {
    mesh.scale.set(1.05, 1.05, 1.4);
  } else {
    mesh.scale.set(1.0, 1.08, 1.45);
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
      const w = time * (0.42 + i * 0.025) + phase;
      // Slow thick bob — more along the long axis than radial puff
      target.x += Math.sin(w) * 0.08;
      target.y += Math.cos(w * 0.85) * 0.07;
      target.z += Math.sin(w * 0.55 + i * 0.4) * 0.18;

      const c = localPos[i];
      const v = vel[i];
      v.addScaledVector(target.sub(c).multiplyScalar(5.5), dt);
      v.multiplyScalar(0.94);
      c.addScaledVector(v, dt);

      // Allow longer Z travel so the chain stays a pill, not a ball
      const maxXY = mode === 'seam' ? 1.1 : 0.55;
      const maxZ = mode === 'seam' ? 2.2 : 1.7;
      const xy = Math.hypot(c.x, c.y);
      if (xy > maxXY) {
        const s = maxXY / xy;
        c.x *= s;
        c.y *= s;
      }
      if (Math.abs(c.z) > maxZ) c.z = Math.sign(c.z) * maxZ;

      radii[i] = baseRadii[i] + 0.11 * Math.sin(time * 1.35 + i * 1.1 + phase);
      strengths[i] = (ISOL + SUBTRACT) * radii[i] * radii[i];

      _tmp.copy(c);
      mesh.localToWorld(_tmp);
      worldCenters[i].copy(_tmp);

      // Axes in world units ≈ local axes * mesh scale
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
