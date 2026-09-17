import * as THREE from 'three';
import { TUBE_RADIUS } from './tunnel.js';

const MOVE_SPEED = 14;
const MAX_OFFSET = TUBE_RADIUS - 2.2;
const FIRE_COOLDOWN = 0.18;
const LASER_SPEED = 90;
const LASER_LIFE = 1.4;

/** Locked accents for ship / lasers */
const MAGENTA = 0xff2bd6;
const CYAN = 0x00e5ff;
const LIME = 0xc8ff00;
const VIOLET = 0x8b00ff;

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

    this.mesh = this._buildShip();
    scene.add(this.mesh);

    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _buildShip() {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: CYAN })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);

    const wingL = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.5),
      new THREE.MeshBasicMaterial({ color: MAGENTA })
    );
    wingL.position.set(0, 0, 0.35);
    g.add(wingL);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: LIME })
    );
    cockpit.position.set(0, 0.15, -0.2);
    g.add(cockpit);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.85 })
    );
    glow.position.set(0, 0, 0.85);
    g.add(glow);
    this.engineGlow = glow;

    return g;
  }

  wantsFire() {
    return !!(this.keys['Space'] || this.keys['KeyZ'] || this._mouseFire);
  }

  setMouseFire(v) { this._mouseFire = v; }

  update(dt) {
    if (!this.alive) return;

    let dx = 0, dy = 0;
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
      this.engineGlow.scale.setScalar(0.85 + Math.sin(performance.now() * 0.02) * 0.25);
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
    mesh.position.set(this.offset.x, this.offset.y, this.z - 1.2);
    this.scene.add(mesh);
    this.lasers.push({ mesh, life: LASER_LIFE });
  }

  getPosition() {
    return this.mesh.position;
  }

  getHitRadius() {
    return 0.55;
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
