import * as THREE from 'three';

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 12;
const TUBE_RADIUS = 8;
const RADIAL_SEGMENTS = 24;

export { TUBE_RADIUS, SEGMENT_LENGTH };

/**
 * Procedural recycled tunnel: ring of wall panels with psychedelic materials.
 */
export class Tunnel {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.time = 0;
    this.furthestZ = 0;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = this._createSegment();
      const z = -i * SEGMENT_LENGTH;
      seg.group.position.z = z;
      this.segments.push(seg);
      scene.add(seg.group);
      this.furthestZ = Math.min(this.furthestZ, z);
    }
  }

  _createSegment() {
    const group = new THREE.Group();
    const panels = [];
    const accents = [];

    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
      const angle = (i / RADIAL_SEGMENTS) * Math.PI * 2;
      const next = ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
      const mid = (angle + next) * 0.5;

      const geo = new THREE.PlaneGeometry(
        TUBE_RADIUS * 0.55,
        SEGMENT_LENGTH * 0.98
      );
      const hue = (i / RADIAL_SEGMENTS);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 1, 0.45),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const panel = new THREE.Mesh(geo, mat);
      panel.position.set(
        Math.cos(mid) * TUBE_RADIUS,
        Math.sin(mid) * TUBE_RADIUS,
        -SEGMENT_LENGTH * 0.5
      );
      // Face inward
      panel.lookAt(0, 0, panel.position.z);
      group.add(panel);
      panels.push({ mesh: panel, baseHue: hue, index: i });

      // Accent ring stripe
      if (i % 3 === 0) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, SEGMENT_LENGTH * 0.9, 0.15),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        stripe.position.set(
          Math.cos(angle) * (TUBE_RADIUS - 0.3),
          Math.sin(angle) * (TUBE_RADIUS - 0.3),
          -SEGMENT_LENGTH * 0.5
        );
        stripe.lookAt(0, 0, stripe.position.z);
        group.add(stripe);
        accents.push(stripe);
      }
    }

    // Decorative floating shapes on the rim
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      const shape = Math.random() > 0.5
        ? new THREE.TetrahedronGeometry(0.45)
        : new THREE.OctahedronGeometry(0.4);
      const m = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(Math.random(), 1, 0.55),
          wireframe: Math.random() > 0.5,
        })
      );
      m.position.set(
        Math.cos(a) * (TUBE_RADIUS - 1.2),
        Math.sin(a) * (TUBE_RADIUS - 1.2),
        -Math.random() * SEGMENT_LENGTH
      );
      group.add(m);
      accents.push(m);
    }

    return { group, panels, accents };
  }

  /**
   * Recycle segments behind the camera far ahead; animate colors.
   */
  update(dt, cameraZ) {
    this.time += dt;

    for (const seg of this.segments) {
      // Recycle behind camera
      if (seg.group.position.z > cameraZ + SEGMENT_LENGTH * 1.5) {
        this.furthestZ -= SEGMENT_LENGTH;
        seg.group.position.z = this.furthestZ;
        // Nudge accent positions for variety
        for (const a of seg.accents) {
          if (a.geometry && a.geometry.type !== 'BoxGeometry') {
            const ang = Math.random() * Math.PI * 2;
            a.position.x = Math.cos(ang) * (TUBE_RADIUS - 1.2);
            a.position.y = Math.sin(ang) * (TUBE_RADIUS - 1.2);
            a.position.z = -Math.random() * SEGMENT_LENGTH;
          }
        }
      }

      // Pulse panel colors
      for (const p of seg.panels) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.2 + p.index * 0.4 + seg.group.position.z * 0.05);
        const hue = (p.baseHue + this.time * 0.08 + seg.group.position.z * 0.002) % 1;
        p.mesh.material.color.setHSL(hue, 1, 0.28 + pulse * 0.35);
        p.mesh.material.opacity = 0.65 + pulse * 0.3;
      }

      for (const a of seg.accents) {
        a.rotation.x += dt * 1.5;
        a.rotation.y += dt * 2.1;
        if (a.material && a.material.color) {
          const h = (this.time * 0.15 + a.position.x) % 1;
          a.material.color.setHSL((h + 1) % 1, 1, 0.6);
        }
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
