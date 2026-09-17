import * as THREE from 'three';

const BALL_COUNT = 8;

/**
 * World-space raymarch through a bounding sphere.
 * More reliable than object-space inverse tricks on nested Groups.
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
uniform vec3 uCenters[8]; // world-space centers
uniform float uRadii[8];
uniform vec3 uRim;
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uBoundCenter; // group world position
uniform float uBoundRadius;

varying vec3 vWorldPos;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float mapScene(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 8; i++) {
    float bi = length(p - uCenters[i]) - uRadii[i];
    d = smin(d, bi, 0.55);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.02;
  return normalize(vec3(
    mapScene(p + vec3(e, 0.0, 0.0)) - mapScene(p - vec3(e, 0.0, 0.0)),
    mapScene(p + vec3(0.0, e, 0.0)) - mapScene(p - vec3(0.0, e, 0.0)),
    mapScene(p + vec3(0.0, 0.0, e)) - mapScene(p - vec3(0.0, 0.0, e))
  ));
}

// Enter ray into bounding sphere; returns tEnter (or -1)
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

  float t = sphereEnter(ro, rd, uBoundCenter, uBoundRadius);
  if (t < 0.0) discard;

  float hit = -1.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    if (length(p - uBoundCenter) > uBoundRadius + 0.15) break;
    float d = mapScene(p);
    if (d < 0.015) { hit = t; break; }
    t += clamp(d, 0.02, 0.35);
    if (t > 80.0) break;
  }

  if (hit < 0.0) {
    // Soft fallback shell so we never go fully invisible if march misses
    float fres = pow(1.0 - abs(dot(normalize(vWorldPos - uBoundCenter), -rd)), 3.0);
    if (fres < 0.35) discard;
    gl_FragColor = vec4(uRim, fres * 0.35);
    return;
  }

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 view = normalize(ro - p);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 2.4);

  float depth = clamp(hit * 0.08, 0.0, 1.0);
  float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + p.x * 2.5 + p.y * 2.0);
  vec3 guts = mix(uCore, uHot, pulse * 0.65 + depth * 0.2);
  vec3 col = mix(guts, uRim, fres);
  col += uHot * exp(-depth * 2.0) * 0.3;

  float alpha = mix(0.78, 0.98, fres);
  gl_FragColor = vec4(col, alpha);
}
`;

export function createGoopMetaball() {
  const localRest = [];
  const localPos = [];
  const vel = [];
  const radii = [];

  for (let i = 0; i < BALL_COUNT; i++) {
    const a = (i / BALL_COUNT) * Math.PI * 2;
    const r = 0.25 + (i % 3) * 0.12;
    const p = new THREE.Vector3(
      Math.cos(a) * r,
      Math.sin(a * 1.2) * r * 0.85,
      Math.sin(a) * r * 0.55
    );
    localRest.push(p.clone());
    localPos.push(p.clone());
    vel.push(new THREE.Vector3());
    radii.push(0.55 + (i % 4) * 0.08); // chunkier so they visibly merge
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
    uBoundRadius: { value: 2.4 },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  const boundR = 2.4;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(boundR, 32, 24), mat);
  // Slightly scale up the whole blob for tunnel readability
  mesh.scale.setScalar(1.15);

  const phase = Math.random() * Math.PI * 2;
  const _world = new THREE.Vector3();

  function update(dt, time) {
    uniforms.uTime.value = time;
    mesh.updateWorldMatrix(true, false);

    for (let i = 0; i < BALL_COUNT; i++) {
      const target = localRest[i].clone();
      const w = time * (0.85 + i * 0.04) + phase;
      target.x += Math.sin(w) * 0.35;
      target.y += Math.cos(w * 1.1) * 0.32;
      target.z += Math.sin(w * 0.9 + i) * 0.28;

      const c = localPos[i];
      const v = vel[i];
      v.addScaledVector(target.sub(c).multiplyScalar(10), dt);
      v.multiplyScalar(0.9);
      c.addScaledVector(v, dt);
      if (c.length() > 1.35) c.setLength(1.35);

      radii[i] = 0.5 + 0.12 * Math.sin(time * 2.1 + i + phase);

      // local → world
      _world.copy(c);
      mesh.localToWorld(_world);
      worldCenters[i].copy(_world);
    }

    mesh.getWorldPosition(uniforms.uBoundCenter.value);
    // bound radius in world units (uniform scale)
    uniforms.uBoundRadius.value = boundR * mesh.scale.x;
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
      vel[i].addScaledVector(dir, 5 + Math.random() * 4);
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
