import * as THREE from 'three';

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 14;
const TUBE_RADIUS = 8;
const RADIAL_SEGMENTS = 64;
const MORPH_RATIO = 0.25;

export const RIM_PALETTE = [0xff2bd6, 0x00e5ff, 0xc8ff00, 0x8b00ff];
export { TUBE_RADIUS, SEGMENT_LENGTH };

/**
 * Continuous wormhole tube.
 * Rim skin locked to user map: assets/tunnel/rim-locked.png
 */
export class Tunnel {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.time = 0;
    this.furthestZ = 0;
    this.scroll = 0;

    const loader = new THREE.TextureLoader();
    this.texture = loader.load('assets/tunnel/rim-locked.png', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(3, 2);
      tex.needsUpdate = true;
    });
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.repeat.set(3, 2);

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.BackSide,
    });
    this.underMat = new THREE.MeshBasicMaterial({
      color: 0x050010,
      side: THREE.BackSide,
    });

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
    const geo = new THREE.CylinderGeometry(
      TUBE_RADIUS,
      TUBE_RADIUS,
      SEGMENT_LENGTH,
      RADIAL_SEGMENTS,
      1,
      true
    );
    geo.rotateX(Math.PI / 2);

    const under = new THREE.Mesh(geo, this.underMat);
    under.scale.setScalar(1.012);
    group.add(under);

    const mesh = new THREE.Mesh(geo.clone(), this.material);
    group.add(mesh);
    return { group, mesh };
  }

  update(dt, cameraZ) {
    this.time += dt;
    this.scroll += dt;
    this.texture.offset.y = (this.scroll * 0.5) % 1;
    this.texture.offset.x =
      (this.scroll * 0.08 * MORPH_RATIO + Math.sin(this.time * 0.15) * 0.02) % 1;

    for (const seg of this.segments) {
      if (seg.group.position.z > cameraZ + SEGMENT_LENGTH * 1.5) {
        this.furthestZ -= SEGMENT_LENGTH;
        seg.group.position.z = this.furthestZ;
      }
    }
  }

  reset() {
    this.furthestZ = 0;
    this.time = 0;
    this.scroll = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const z = -i * SEGMENT_LENGTH;
      this.segments[i].group.position.z = z;
      this.furthestZ = Math.min(this.furthestZ, z);
    }
  }
}
