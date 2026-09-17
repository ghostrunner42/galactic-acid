import * as THREE from 'three';

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 14;
const TUBE_RADIUS = 8;
const RADIAL_SEGMENTS = 48;
const ATLAS = 512;
/** UV scroll is rail-fast; tile remix morphs at ~1/4 that feel */
const MORPH_RATIO = 0.25;

export const RIM_PALETTE = [0xff2bd6, 0x00e5ff, 0xc8ff00, 0x8b00ff];
export { TUBE_RADIUS, SEGMENT_LENGTH };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Continuous wormhole tube. Hippie Bot rim tiles = skin only.
 * Seamless A base, B + 4×4 variants sprinkled; UV scrolls fast, remix slow.
 */
export class Tunnel {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.time = 0;
    this.furthestZ = 0;
    this.scroll = 0;
    this._morphAcc = 0;
    this.ready = false;

    this._canvas = document.createElement('canvas');
    this._canvas.width = ATLAS;
    this._canvas.height = ATLAS;
    this._ctx = this._canvas.getContext('2d');
    this._ctx.fillStyle = '#0a0014';
    this._ctx.fillRect(0, 0, ATLAS, ATLAS);

    this.texture = new THREE.CanvasTexture(this._canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.repeat.set(4, 3);

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

    this._bootTiles();
  }

  async _bootTiles() {
    try {
      const [a, b, v] = await Promise.all([
        loadImage('assets/tunnel/seamless-a.png'),
        loadImage('assets/tunnel/seamless-b.png'),
        loadImage('assets/tunnel/variants-4x4.png'),
      ]);
      this._imgA = a;
      this._imgB = b;
      this._imgV = v;
      this._composeAtlas(true);
      this.ready = true;
    } catch (err) {
      console.warn('Tunnel tiles failed to load, keeping placeholder', err);
    }
  }

  _composeAtlas(full = false) {
    if (!this._imgA) return;
    const ctx = this._ctx;
    const s = ATLAS;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, s, s);

    // Seamless A — primary lava skin
    ctx.drawImage(this._imgA, 0, 0, s, s);

    // Seamless B sprinkle — secondary mix-in (not full wallpaper)
    if (this._imgB) {
      ctx.globalAlpha = 0.28 + 0.12 * Math.sin(this.time * 0.4);
      const ox = ((this.scroll * 40) | 0) % s;
      const oy = ((this.scroll * 17) | 0) % s;
      ctx.drawImage(this._imgB, ox - s, oy - s, s, s);
      ctx.drawImage(this._imgB, ox, oy - s, s, s);
      ctx.drawImage(this._imgB, ox - s, oy, s, s);
      ctx.drawImage(this._imgB, ox, oy, s, s);
      ctx.globalAlpha = 1;
    }

    // 4×4 variants — random cells stamped for non-repeat
    if (this._imgV) {
      const cell = this._imgV.width / 4;
      const stamps = full ? 10 : 4;
      for (let i = 0; i < stamps; i++) {
        const col = (Math.random() * 4) | 0;
        const row = (Math.random() * 4) | 0;
        const dx = (Math.random() * (s - cell)) | 0;
        const dy = (Math.random() * (s - cell)) | 0;
        const size = cell * (0.7 + Math.random() * 0.6);
        ctx.globalAlpha = 0.35 + Math.random() * 0.35;
        ctx.drawImage(
          this._imgV,
          col * cell,
          row * cell,
          cell,
          cell,
          dx,
          dy,
          size,
          size
        );
      }
      ctx.globalAlpha = 1;
    }

    this.texture.needsUpdate = true;
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
    under.scale.setScalar(1.015);
    group.add(under);

    const mesh = new THREE.Mesh(geo.clone(), this.material);
    group.add(mesh);
    return { group, mesh };
  }

  update(dt, cameraZ) {
    this.time += dt;
    // Fast UV crawl = rail rush energy
    this.scroll += dt;
    this.texture.offset.y = (this.scroll * 0.55) % 1;
    this.texture.offset.x =
      (this.scroll * 0.12 + Math.sin(this.time * 0.2) * 0.03) % 1;

    // Slow remix so blobs read liquid, not strobe (~¼ of scroll feel)
    this._morphAcc += dt * MORPH_RATIO;
    if (this.ready && this._morphAcc > 0.35) {
      this._morphAcc = 0;
      this._composeAtlas(false);
    }

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
