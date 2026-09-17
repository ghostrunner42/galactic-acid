import * as THREE from 'three';

const BALL_COUNT = 6;

/**
 * Large navigable lava-seam metaball.
 * World-space raymarch; no red fallback shell (that was the bug).
 * Centers arranged as a wall/blob mass with gaps to weave through.
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

float mapScene(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    float bi = length(p - uCenters[i]) - uRadii[i];
    d = smin(d, bi, 1.15);
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
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    if (length(p - uBoundCenter) > uBoundRadius + 0.2) break;
    float d = mapScene(p);
    if (d < 0.02) { hit = t; break; }
    t += clamp(d, 0.015, 0.28);
    if (t > tEnter + uBoundRadius * 2.5) break;
  }

  // No fallback rim — miss = transparent (kills the red circle bug)
  if (hit < 0.0) discard;

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 view = normalize(ro - p);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 2.2);

  float pulse = 0.5 + 0.5 * sin(uTime * 1.6 + p.x * 1.8 + p.y * 1.4 + p.z * 0.6);
  vec3 guts = mix(uCore, uHot, pulse * 0.7);
  vec3 col = mix(guts, uRim, fres * 0.85);
  col += uHot * 0.2 * (1.0 - fres);

  float alpha = mix(0.82, 0.97, fres);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * @param {'blob'|'seam'} mode
 *  blob = chunky floating mass
 *  seam = wall-hugging lava you weave past (Bonanza-ish)
 */
export function createGoopMetaball(mode = 'seam') {
  const localRest = [];
  const localPos = [];
  const vel = [];
  const radii = [];

  if (mode === 'seam') {
    // Tight arc — centers stay close so smin reads as ONE molten bank
    const side = Math.random() * Math.PI * 2;
    for (let i = 0; i < BALL_COUNT; i++) {
      const along = (i / (BALL_COUNT - 1) - 0.5) * 1.6;
      const spread = (i % 3 - 1) * 0.28;
      const a = side + spread * 0.45;
      const r = 0.55 + (i % 2) * 0.15;
      const p = new THREE.Vector3(
        Math.cos(a) * r,
        Math.sin(a) * r,
        along
      );
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      radii.push(1.15 + Math.random() * 0.35);
    }
  } else {
    // Bubble: packed cluster → single lava-lamp blob
    for (let i = 0; i < BALL_COUNT; i++) {
      const a = (i / BALL_COUNT) * Math.PI * 2;
      const r = 0.15 + (i % 3) * 0.08;
      const p = new THREE.Vector3(
        Math.cos(a) * r,
        Math.sin(a * 1.1) * r * 0.85,
        Math.sin(a) * r * 0.4
      );
      localRest.push(p.clone());
      localPos.push(p.clone());
      vel.push(new THREE.Vector3());
      radii.push(1.05 + (i % 3) * 0.12);
    }
  }

  const worldCenters = localPos.map(() => new THREE.Vector3());

  const uniforms = {
    uTime: { value: 0 },
    uCenters: { value: worldCenters },
    uRadii: { value: radii },
    uRim: { value: new THREE.Color(0xff2bd6) },
    uCore: { value: new THREE.Color(0x00e5ff) },
    uHot: { value: new THREE.Color(0xc8ff00) },
    uBoundCenter: { value: new THREE.Vector3() },
    uBoundRadius: { value: 4.5 },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  // Big bound so seams read as environment, not marbles
  const boundR = mode === 'seam' ? 5.2 : 3.6;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(boundR, 28, 20), mat);
  mesh.scale.set(1, 1, mode === 'seam' ? 1.35 : 1.1);
  uniforms.uBoundRadius.value = boundR;

  const phase = Math.random() * Math.PI * 2;
  const _tmp = new THREE.Vector3();

  function update(dt, time) {
    uniforms.uTime.value = time;
    mesh.updateWorldMatrix(true, false);

    for (let i = 0; i < BALL_COUNT; i++) {
      const target = localRest[i].clone();
      const w = time * (0.55 + i * 0.03) + phase;
      // Lava-lamp bob — slow, thick
      target.x += Math.sin(w) * 0.12;
      target.y += Math.cos(w * 0.9) * 0.12;
      target.z += Math.sin(w * 0.7 + i) * 0.1;

      const c = localPos[i];
      const v = vel[i];
      v.addScaledVector(target.sub(c).multiplyScalar(6), dt);
      v.multiplyScalar(0.93);
      c.addScaledVector(v, dt);

      const maxR = mode === 'seam' ? 1.4 : 0.85;
      if (c.length() > maxR) c.setLength(maxR);

      radii[i] =
        (mode === 'seam' ? 1.15 : 1.05) +
        0.1 * Math.sin(time * 1.1 + i + phase);

      _tmp.copy(c);
      mesh.localToWorld(_tmp);
      worldCenters[i].copy(_tmp);
    }

    mesh.getWorldPosition(uniforms.uBoundCenter.value);
    // Approx world bound radius accounting for non-uniform scale
    const sx = mesh.scale.x;
    const sz = mesh.scale.z;
    uniforms.uBoundRadius.value = boundR * Math.max(sx, sz);
    uniforms.uRadii.value = radii;
    uniforms.uCenters.value = worldCenters;
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
