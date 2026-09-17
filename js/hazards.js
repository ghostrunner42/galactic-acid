import * as THREE from 'three';
import { TUBE_RADIUS } from './tunnel.js';

/**
 * Hazard types:
 * 1. ringGate — partial ring barrier (dodge through gap)
 * 2. spikeOrb — floating orb that can be shot
 * 3. spinner — rotating bar across the tube (dodge)
 */

const SPAWN_AHEAD = 90;
const SPAWN_INTERVAL_START = 1.35;
const SPAWN_INTERVAL_MIN = 0.55;

export class HazardManager {
  constructor(scene) {
    this.scene = scene;
    this.hazards = [];
    this.spawnTimer = 1.0;
    this.spawnInterval = SPAWN_INTERVAL_START;
    this.time = 0;
  }

  update(dt, playerZ, player, onScore) {
    this.time += dt;
    this.spawnTimer -= dt;
    this.spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_START - this.time * 0.012
    );

    if (this.spawnTimer <= 0) {
      this._spawn(playerZ);
      this.spawnTimer = this.spawnInterval;
    }

    const pPos = player.getPosition();
    const pR = player.getHitRadius();

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.update) h.update(dt);

      let destroyed = false;
      if (h.shootable && player.alive) {
        for (let li = player.lasers.length - 1; li >= 0; li--) {
          const L = player.lasers[li];
          if (L.mesh.position.distanceTo(h.mesh.position) < h.hitRadius + 0.4) {
            this.scene.remove(L.mesh);
            L.mesh.geometry.dispose();
            L.mesh.material.dispose();
            player.lasers.splice(li, 1);
            this._destroyHazard(i, onScore, 25);
            destroyed = true;
            break;
          }
        }
      }
      if (destroyed) continue;

      if (player.alive && h.collides(pPos, pR)) {
        return 'hit';
      }

      if (h.mesh.position.z > playerZ + 20) {
        this._removeAt(i);
      }
    }
    return null;
  }

  _spawn(playerZ) {
    const z = playerZ - SPAWN_AHEAD - Math.random() * 20;
    const roll = Math.random();
    let h;
    if (roll < 0.34) h = this._makeRingGate(z);
    else if (roll < 0.67) h = this._makeSpikeOrb(z);
    else h = this._makeSpinner(z);
    this.hazards.push(h);
    this.scene.add(h.mesh);
  }

  _makeRingGate(z) {
    const group = new THREE.Group();
    group.position.z = z;
    const gapAngle = Math.random() * Math.PI * 2;
    const gapWidth = 1.1 + Math.random() * 0.5;
    const pieces = [];

    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      let da = a0 - gapAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < gapWidth * 0.5) continue;

      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xff2266 })
      );
      const r = TUBE_RADIUS * 0.55;
      block.position.set(Math.cos(a0) * r, Math.sin(a0) * r, 0);
      block.lookAt(0, 0, 0);
      group.add(block);
      pieces.push(block);
    }

    return {
      mesh: group,
      shootable: false,
      hitRadius: 0,
      update(dt) {
        group.rotation.z += dt * 0.4;
      },
      collides(pPos, pR) {
        if (Math.abs(pPos.z - group.position.z) > 0.9) return false;
        for (const b of pieces) {
          const wp = new THREE.Vector3();
          b.getWorldPosition(wp);
          if (wp.distanceTo(pPos) < 1.1 + pR) return true;
        }
        return false;
      },
    };
  }

  _makeSpikeOrb(z) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 0),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (TUBE_RADIUS - 3.5);
    mesh.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, z);

    const outline = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 0),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true })
    );
    mesh.add(outline);

    return {
      mesh,
      shootable: true,
      hitRadius: 0.9,
      update(dt) {
        mesh.rotation.x += dt * 2;
        mesh.rotation.y += dt * 3;
      },
      collides(pPos, pR) {
        return mesh.position.distanceTo(pPos) < 0.9 + pR;
      },
    };
  }

  _makeSpinner(z) {
    const group = new THREE.Group();
    group.position.z = z;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(TUBE_RADIUS * 1.7, 0.35, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x44ffcc })
    );
    group.add(bar);
    const tip1 = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    tip1.position.x = TUBE_RADIUS * 0.85;
    const tip2 = tip1.clone();
    tip2.position.x = -TUBE_RADIUS * 0.85;
    group.add(tip1, tip2);
    group.rotation.z = Math.random() * Math.PI;

    const spinSpeed = 1.2 + Math.random() * 1.5;

    return {
      mesh: group,
      shootable: false,
      hitRadius: 0,
      update(dt) {
        group.rotation.z += spinSpeed * dt;
      },
      collides(pPos, pR) {
        if (Math.abs(pPos.z - group.position.z) > 0.7) return false;
        const local = pPos.clone().sub(group.position);
        const c = Math.cos(-group.rotation.z);
        const s = Math.sin(-group.rotation.z);
        const lx = local.x * c - local.y * s;
        const ly = local.x * s + local.y * c;
        return Math.abs(lx) < TUBE_RADIUS * 0.85 + pR && Math.abs(ly) < 0.35 + pR;
      },
    };
  }

  _destroyHazard(index, onScore, points) {
    const h = this.hazards[index];
    if (!h) return;
    this.scene.remove(h.mesh);
    this._disposeMesh(h.mesh);
    this.hazards.splice(index, 1);
    if (onScore) onScore(points);
  }

  _removeAt(index) {
    const h = this.hazards[index];
    this.scene.remove(h.mesh);
    this._disposeMesh(h.mesh);
    this.hazards.splice(index, 1);
  }

  _disposeMesh(obj) {
    obj.traverse?.((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  reset() {
    for (const h of this.hazards) {
      this.scene.remove(h.mesh);
      this._disposeMesh(h.mesh);
    }
    this.hazards.length = 0;
    this.spawnTimer = 1.0;
    this.spawnInterval = SPAWN_INTERVAL_START;
    this.time = 0;
  }
}
