import * as THREE from 'three';

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 12;
const TUBE_RADIUS = 8;
const RADIAL_SEGMENTS = 20;

/** Locked Hippie Bot rim palette — lava blobs cycle THESE four only. */
export const RIM_PALETTE = [0xff2bd6, 0x00e5ff, 0xc8ff00, 0x8b00ff];

export { TUBE_RADIUS, SEGMENT_LENGTH };

/**
 * Neon lava-lamp tunnel: liquid blob walls (not striped bands).
 * Rainbow Road speed energy, readable at speed.
 */
export class Tunnel {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.time = 0;
    this.furthestZ = 0;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = this._createSegment(i);
      const z = -i * SEGMENT_LENGTH;
      seg.group.position.z = z;
      this.segments.push(seg);
      scene.add(seg.group);
      this.furthestZ = Math.min(this.furthestZ, z);
    }
  }

  _createSegment(seed) {
    const group = new THREE.Group();
    const blobs = [];

    // Soft dark under-wall so blobs read as liquid rim, not flat stripes
    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
      const angle = (i / RADIAL_SEGMENTS) * Math.PI * 2;
      const next = ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
      const mid = (angle + next) * 0.5;
      const geo = new THREE.PlaneGeometry(
        TUBE_RADIUS * 0.62,
        SEGMENT_LENGTH * 0.98
      );
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0a0018,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      });
      const panel = new THREE.Mesh(geo, mat);
      panel.position.set(
        Math.cos(mid) * TUBE_RADIUS,
        Math.sin(mid) * TUBE_RADIUS,
        -SEGMENT_LENGTH * 0.5
      );
      panel.lookAt(0, 0, panel.position.z);
      group.add(panel);
    }

    // Lava-lamp blobs along the rim — organic ellipsoids, palette-only
    const blobCount = 10 + (seed % 3);
    for (let k = 0; k < blobCount; k++) {
      const color = RIM_PALETTE[(k + seed) % RIM_PALETTE.length];
      const sx = 0.7 + Math.random() * 1.4;
      const sy = 1.2 + Math.random() * 2.2;
      const sz = 0.55 + Math.random() * 0.9;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.88,
        })
      );
      mesh.scale.set(sx, sy, sz);
      const a = (k / blobCount) * Math.PI * 2 + (seed * 0.37);
      const r = TUBE_RADIUS - 0.35 - Math.random() * 0.55;
      mesh.position.set(
        Math.cos(a) * r,
        Math.sin(a) * r,
        -Math.random() * SEGMENT_LENGTH
      );
      // Flatten slightly against wall
      mesh.lookAt(0, 0, mesh.position.z);
      group.add(mesh);

      // Soft outer glow shell (same hue family)
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 8, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      glow.scale.copy(mesh.scale);
      mesh.add(glow);

      blobs.push({
        mesh,
        baseAngle: a,
        radius: r,
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 0.55,
        colorIndex: (k + seed) % RIM_PALETTE.length,
        wobble: 0.15 + Math.random() * 0.25,
      });
    }

    return { group, blobs };
  }

  update(dt, cameraZ) {
    this.time += dt;

    for (const seg of this.segments) {
      if (seg.group.position.z > cameraZ + SEGMENT_LENGTH * 1.5) {
        this.furthestZ -= SEGMENT_LENGTH;
        seg.group.position.z = this.furthestZ;
        // Reseed blob Z for variety when recycled
        for (const b of seg.blobs) {
          b.mesh.position.z = -Math.random() * SEGMENT_LENGTH;
          b.phase = Math.random() * Math.PI * 2;
        }
      }

      // Liquid lava motion: drift along rim + squash/stretch pulse
      for (const b of seg.blobs) {
        const t = this.time * b.speed + b.phase;
        const drift = Math.sin(t) * 0.22;
        const a = b.baseAngle + drift;
        b.mesh.position.x = Math.cos(a) * b.radius;
        b.mesh.position.y = Math.sin(a) * b.radius;
        b.mesh.position.z += Math.sin(t * 0.7) * dt * 0.8;
        // Keep inside segment roughly
        if (b.mesh.position.z > 0) b.mesh.position.z = -SEGMENT_LENGTH;
        if (b.mesh.position.z < -SEGMENT_LENGTH) b.mesh.position.z = 0;

        const pulse = 1 + Math.sin(t * 1.6) * b.wobble;
        const squash = 1 + Math.cos(t * 1.1) * b.wobble * 0.6;
        if (!b.baseScale) b.baseScale = b.mesh.scale.clone();
        const s = b.baseScale;
        b.mesh.scale.set(s.x * squash, s.y * pulse, s.z * squash);

        // Cycle palette colors slowly (hard snaps between locked four)
        const ci = (b.colorIndex + Math.floor(this.time * 0.45 + b.phase)) % RIM_PALETTE.length;
        const col = RIM_PALETTE[ci];
        b.mesh.material.color.setHex(col);
        const glowChild = b.mesh.children[0];
        if (glowChild?.material) glowChild.material.color.setHex(col);

        b.mesh.lookAt(0, 0, b.mesh.position.z);
      }
    }
  }

  reset() {
    this.furthestZ = 0;
    this.time = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const z = -i * SEGMENT_LENGTH;
      this.segments[i].group.position.z = z;
      this.furthestZ = Math.min(this.furthestZ, z);
    }
  }
}
