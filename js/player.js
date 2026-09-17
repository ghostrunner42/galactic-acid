import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { TUBE_RADIUS } from './tunnel.js';

const MOVE_SPEED = 14;
const MAX_OFFSET = TUBE_RADIUS - 2.2;
const FIRE_COOLDOWN = 0.18;
const LASER_SPEED = 90;
const LASER_LIFE = 1.4;

/** Locked accents for lasers / fallback placeholder */
const MAGENTA = 0xff2bd6;
const CYAN = 0x00e5ff;
const LIME = 0xc8ff00;
const VIOLET = 0x8b00ff;

/**
 * Player craft — Quaternius Spitfire (CC0) from Ultimate Spaceships pack.
 * Poly Pizza twin was CF-walled; same author/license.
 */
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.offset = new THREE.Vector2(0, 0);
    this.keys = Object.create(null);
    this.fireTimer = 0;
    this.lasers = [];
    this.alive = true;
    this.z = 0;
    this.forwardSpeed = 28;
    this._mouseFire = false;

    this.mesh = new THREE.Group();
    scene.add(this.mesh);
    this._mountPlaceholder();
    this._loadQuaterniusShip();

    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _mountPlaceholder() {
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: CYAN })
    );
    body.rotation.x = Math.PI / 2;
    body.name = 'placeholder';
    this.mesh.add(body);
  }

  _loadQuaterniusShip() {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('assets/ship/');
    mtlLoader.load(
      'Spitfire.mtl',
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath('assets/ship/');
        objLoader.load(
          'Spitfire.obj',
          (obj) => {
            // Unlit convert — scene has no lights
            obj.traverse((c) => {
              if (c.isMesh) {
                const map = c.material?.map || null;
                c.material = new THREE.MeshBasicMaterial({
                  map,
                  color: map ? 0xffffff : CYAN,
                });
                c.castShadow = false;
              }
            });

            // Fit + aim nose down the tunnel (-Z)
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const target = 1.8; // ship length in world units
            obj.scale.setScalar(target / maxDim);

            // Quaternius ships often face +Y or +Z — rotate to fly toward -Z
            obj.rotation.x = Math.PI / 2;

            // Recenter after scale/rot
            const box2 = new THREE.Box3().setFromObject(obj);
            const center = new THREE.Vector3();
            box2.getCenter(center);
            obj.position.sub(center);

            // Clear placeholder
            while (this.mesh.children.length) {
              const ch = this.mesh.children[0];
              this.mesh.remove(ch);
              ch.geometry?.dispose?.();
              ch.material?.dispose?.();
            }
            this.mesh.add(obj);

            // Engine glow at rear (+Z local after rot)
            const glow = new THREE.Mesh(
              new THREE.SphereGeometry(0.22, 8, 8),
              new THREE.MeshBasicMaterial({
                color: VIOLET,
                transparent: true,
                opacity: 0.85,
              })
            );
            glow.position.set(0, 0, 0.75);
            this.mesh.add(glow);
            this.engineGlow = glow;
          },
          undefined,
          (err) => console.warn('Ship OBJ load failed', err)
        );
      },
      undefined,
      (err) => console.warn('Ship MTL load failed', err)
    );
  }

  wantsFire() {
    return !!(this.keys['Space'] || this.keys['KeyZ'] || this._mouseFire);
  }

  setMouseFire(v) {
    this._mouseFire = v;
  }

  update(dt) {
    if (!this.alive) return;

    let dx = 0;
    let dy = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dy -= 1;

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.offset.x += (dx / len) * MOVE_SPEED * dt;
      this.offset.y += (dy / len) * MOVE_SPEED * dt;
    }

    const r = this.offset.length();
    if (r > MAX_OFFSET) this.offset.multiplyScalar(MAX_OFFSET / r);

    this.z -= this.forwardSpeed * dt;

    this.mesh.position.set(this.offset.x, this.offset.y, this.z);
    this.mesh.rotation.z = -this.offset.x * 0.08;
    this.mesh.rotation.x = this.offset.y * 0.05;

    if (this.engineGlow) {
      this.engineGlow.scale.setScalar(
        0.85 + Math.sin(performance.now() * 0.02) * 0.25
      );
    }

    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.wantsFire() && this.fireTimer <= 0) {
      this._fire();
      this.fireTimer = FIRE_COOLDOWN;
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i];
      L.mesh.position.z -= LASER_SPEED * dt;
      L.life -= dt;
      if (L.life <= 0) {
        this.scene.remove(L.mesh);
        L.mesh.geometry.dispose();
        L.mesh.material.dispose();
        this.lasers.splice(i, 1);
      }
    }
  }

  _fire() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
      new THREE.MeshBasicMaterial({ color: LIME })
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(this.offset.x, this.offset.y, this.z - 1.4);
    this.scene.add(mesh);
    this.lasers.push({ mesh, life: LASER_LIFE });
  }

  getPosition() {
    return this.mesh.position;
  }

  getHitRadius() {
    return 0.65;
  }

  reset() {
    this.offset.set(0, 0);
    this.z = 0;
    this.alive = true;
    this.fireTimer = 0;
    this.keys = Object.create(null);
    this._mouseFire = false;
    for (const L of this.lasers) {
      this.scene.remove(L.mesh);
      L.mesh.geometry.dispose();
      L.mesh.material.dispose();
    }
    this.lasers.length = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
