import * as THREE from 'three';

const BALL_COUNT = 8;

const VERT = /* glsl */ `
uniform mat4 uInverseModel;
varying vec3 vLocalPos;
varying vec3 vRayOrigin;
void main() {
  vLocalPos = position;
  vec4 camObj = uInverseModel * vec4(cameraPosition, 1.0);
  vRayOrigin = camObj.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uCenters[8];
uniform float uRadii[8];
uniform vec3 uRim;
uniform vec3 uCore;
uniform vec3 uHot;
varying vec3 vLocalPos;
varying vec3 vRayOrigin;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float mapScene(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 8; i++) {
    float bi = length(p - uCenters[i]) - uRadii[i];
    d = smin(d, bi, 0.45);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.012;
  return normalize(vec3(
    mapScene(p + vec3(e,0,0)) - mapScene(p - vec3(e,0,0)),
    mapScene(p + vec3(0,e,0)) - mapScene(p - vec3(0,e,0)),
    mapScene(p + vec3(0,0,e)) - mapScene(p - vec3(0,0,e))
  ));
}

void main() {
  vec3 ro = vRayOrigin;
  vec3 rd = normalize(vLocalPos - ro);

  // Raymarch inside bounding volume
  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.008) { hit = t; break; }
    t += max(d, 0.02);
    if (t > 6.0) break;
  }

  if (hit < 0.0) discard;

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 view = normalize(ro - p);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 2.6);

  float depth = clamp(hit / 3.5, 0.0, 1.0);
  float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + p.x * 3.0 + p.y * 2.0);
  vec3 guts = mix(uCore, uHot, pulse * 0.7 + depth * 0.25);
  vec3 col = mix(guts, uRim, fres);

  // Subtle internal glow
  float glow = exp(-depth * 2.2) * 0.35;
  col += uHot * glow;

  float alpha = mix(0.72, 0.98, fres);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Raymarched SDF metaball goop — jam signature hazard look.
 * Bounding sphere mesh; 8 spring-driven centers on CPU.
 */
export function createGoopMetaball() {
  const centers = [];
  const rest = [];
  const vel = [];
  const radii = [];

  for (let i = 0; i < BALL_COUNT; i++) {
    const a = (i / BALL_COUNT) * Math.PI * 2;
    const r = 0.35 + Math.random() * 0.45;
    const p = new THREE.Vector3(
      Math.cos(a) * r * (0.4 + Math.random() * 0.5),
      Math.sin(a * 1.3) * r * 0.55,
      Math.sin(a) * r * 0.35
    );
    rest.push(p.clone());
    centers.push(p);
    vel.push(new THREE.Vector3());
    radii.push(0.28 + Math.random() * 0.22);
  }

  const uniforms = {
    uTime: { value: 0 },
    uCenters: { value: centers },
    uRadii: { value: radii },
    uRim: { value: new THREE.Color(0xff2bd6) },
    uCore: { value: new THREE.Color(0x00e5ff) },
    uHot: { value: new THREE.Color(0xc8ff00) },
    uInverseModel: { value: new THREE.Matrix4() },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide, // ray enters from inside the bound
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  // Bounding sphere large enough for wobbling centers
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), mat);
  // Also render front faces for silhouette when camera outside — use double side ray
  mat.side = THREE.DoubleSide;

  const phase = Math.random() * Math.PI * 2;

  function update(dt, time) {
    uniforms.uTime.value = time;
    mesh.updateWorldMatrix(true, false);
    uniforms.uInverseModel.value.copy(mesh.matrixWorld).invert();
    for (let i = 0; i < BALL_COUNT; i++) {
      const target = rest[i].clone();
      // Slow breathe / orbit
      const w = time * (0.7 + i * 0.05) + phase;
      target.x += Math.sin(w) * 0.22;
      target.y += Math.cos(w * 1.15) * 0.2;
      target.z += Math.sin(w * 0.8 + i) * 0.18;
      // Soft spring
      const c = centers[i];
      const v = vel[i];
      const force = target.clone().sub(c).multiplyScalar(8);
      v.addScaledVector(force, dt);
      v.multiplyScalar(0.92);
      c.addScaledVector(v, dt);
      // Keep inside bound
      if (c.length() > 1.5) c.setLength(1.5);
      radii[i] = 0.3 + 0.08 * Math.sin(time * 2 + i + phase);
    }
    uniforms.uRadii.value = radii;
    uniforms.uCenters.value = centers;
  }

  /** Brief pinch: yank centers apart then let springs recover (shot juice). */
  function pinch() {
    for (let i = 0; i < BALL_COUNT; i++) {
      const dir = centers[i].clone().normalize();
      if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      vel[i].addScaledVector(dir, 4 + Math.random() * 3);
    }
  }

  return { mesh, update, pinch, dispose() {
    mesh.geometry.dispose();
    mat.dispose();
  }};
}
