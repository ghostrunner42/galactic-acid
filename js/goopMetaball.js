import * as THREE from 'three';

const BALL_COUNT = 6;

/**
 * Lava-lamp metaball: elongated fused mass, not a round bubble.
 * World-space raymarch; centers chain along an axis with taper radii.
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
uniform vec3 uRim;
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uBoundCenter;
uniform float uBoundRadius;

varying vec3 vWorldPos;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Ellipsoid ball: stretch keeps fused clumps from reading as spheres
float ellipsoid(vec3 p, vec3 c, float r, vec3 ax) {
  vec3 q = (p - c) / ax;
  return (length(q) - r) * min(min(ax.x, ax.y), ax.z);
}

float mapScene(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    float bi = ellipsoid(p, uCenters[i], uRadii[i], uAxes[i]);
    d = smin(d, bi, 0.95);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.025;
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
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    if (length(p - uBoundCenter) > uBoundRadius + 0.25) break;
    float d = mapScene(p);
    if (d < 0.02) { hit = t; break; }
    t += clamp(d, 0.012, 0.26);
    if (t > tEnter + uBoundRadius * 2.6) break;
  }

  if (hit < 0.0) discard;

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 view = normalize(ro - p);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 2.2);

  float pulse = 0.5 + 0.5 * sin(uTime * 1.4 + p.x * 1.5 + p.y * 1.2 + p.z * 0.55);
  vec3 guts = mix(uCore, uHot, pulse * 0.7);
  vec3 col = mix(guts, uRim, fres * 0.85);
  col += uHot * 0.2 * (1.0 - fres);

  float alpha = mix(0.82, 0.97, fres);
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
      axes.push(new THREE.Vector3(0.72, 0.85, 1.45 + bulge * 0.35));
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
          0.65 + fat * 0.25,
          0.7 + fat * 0.22,
          1.35 + (1 - fat) * 0.45
        )
      );
    }
  }

  const baseRadii = radii.slice();
  const worldCenters = localPos.map(() => new THREE.Vector3());
  const worldAxes = axes.map((a) => a.clone());

  const uniforms = {
    uTime: { value: 0 },
    uCenters: { value: worldCenters },
    uRadii: { value: radii },
    uAxes: { value: worldAxes },
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
    mesh.scale.set(1.05, 1.05, 1.55);
  } else {
    mesh.scale.set(0.95, 1.05, 1.65);
  }
  uniforms.uBoundRadius.value = boundR;

  const phase = Math.random() * Math.PI * 2;
  const _tmp = new THREE.Vector3();
  const _ax = new THREE.Vector3();
  const _scale = new THREE.Vector3();

  function update(dt, time) {
    uniforms.uTime.value = time;
    mesh.updateWorldMatrix(true, false);

    // World-space axis stretch from mesh scale (keeps ellipsoids oriented)
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

      radii[i] = baseRadii[i] + 0.06 * Math.sin(time * 0.9 + i + phase);

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
