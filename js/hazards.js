import * as THREE from 'three';
import { TUBE_RADIUS } from './tunnel.js';
import { createGoopMetaball } from './goopMetaball.js';

/**
 * Lava-only jam mode (user lock):
 * - lavaSeam — large wall-hugging banks to weave through
 * - lavaBubble — big burstable blobs in the flight path (shoot or die)
 * Gold asteroids + jelly aliens removed.
 */

const SPAWN_AHEAD = 70;
const SPAWN_INTERVAL_START = 0.7;
const SPAWN_INTERVAL_MIN = 0.38;

const MAGENTA = 0xff2bd6;
const CYAN = 0x00e5ff;
const LIME = 0xc8ff00;

export class HazardManager {
  constructor(scene) {
    this.scene = scene;
    this.hazards = [];
    this.fx = [];
    this.spawnTimer = 0.35;
    this.spawnInterval = SPAWN_INTERVAL_START;
    this.time = 0;
  }

  update(dt, playerZ, player, onScore) {
    this.time += dt;
    this.spawnTimer -= dt;
    this.spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_START - this.time * 0.008
    );

    if (this.spawnTimer <= 0) {
      this._spawnBurst(playerZ);
      this.spawnTimer = this.spawnInterval;
    }

    this._updateFx(dt);

    const pPos = player.getPosition();
    const pR = player.getHitRadius();

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.update) h.update(dt, this.time);

      // Drift seams slowly across lane
      if (h.kind === 'seam' && h.drift) {
        const a = h.drift.angle + this.time * h.drift.speed;
        const r = h.drift.radius;
        h.mesh.position.x = Math.cos(a) * r;
        h.mesh.position.y = Math.sin(a) * r;
      }

      let destroyed = false;
      if (h.shootable && player.alive) {
        for (let li = player.lasers.length - 1; li >= 0; li--) {
          const L = player.lasers[li];
          if (L.mesh.position.distanceTo(h.mesh.position) < h.hitRadius + 0.5) {
            this.scene.remove(L.mesh);
            L.mesh.geometry.dispose();
            L.mesh.material.dispose();
            player.lasers.splice(li, 1);
            h._goop?.pinch?.();
            this._blastGoop(h);
            const pts = h.kind === 'bubble' ? 30 : 15;
            this._destroyHazard(i, onScore, pts);
            destroyed = true;
            break;
          }
        }
      }

      if (destroyed) continue;

      if (player.alive && h.collides(pPos, pR)) {
        return 'hit';
      }

      if (h.mesh.position.z > playerZ + 25) {
        this._removeAt(i);
      }
    }
    return null;
  }

  /** Busy: 2–4 lava pieces per tick */
  _spawnBurst(playerZ) {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const z = playerZ - SPAWN_AHEAD - Math.random() * 40 - i * 14;
      // More bubbles in the lane, seams on the banks
      const h = Math.random() < 0.55 ? this._makeBubble(z) : this._makeSeam(z);
      this.hazards.push(h);
      this.scene.add(h.mesh);
    }
  }

  _makeSeam(z) {
    const group = new THREE.Group();
    const ang = Math.random() * Math.PI * 2;
    const rad = TUBE_RADIUS * 0.55 + Math.random() * TUBE_RADIUS * 0.2;
    group.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, z);

    const goop = createGoopMetaball('seam');
    group.add(goop.mesh);

    return {
      mesh: group,
      shootable: true,
      hitRadius: 2.2,
      kind: 'seam',
      _goop: goop,
      drift: {
        angle: ang,
        radius: rad,
        speed: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.12),
      },
      update(dt, time) {
        goop.update(dt, time);
      },
      collides(pPos, pR) {
        return group.position.distanceTo(pPos) < 2.2 + pR;
      },
    };
  }

  _makeBubble(z) {
    const group = new THREE.Group();
    // Prefer flight corridor — big blobs you must burst or dodge
    const ang = Math.random() * Math.PI * 2;
    const rad = TUBE_RADIUS * 0.15 + Math.random() * (TUBE_RADIUS * 0.35);
    group.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, z);

    const goop = createGoopMetaball('blob');
    // Stretch into a lamp pill — avoid round marble look
    const stretch = 1.15 + Math.random() * 0.25;
    goop.mesh.scale.x *= 0.95 + Math.random() * 0.1;
    goop.mesh.scale.y *= 1.05 + Math.random() * 0.15;
    goop.mesh.scale.z *= stretch;
    group.add(goop.mesh);

    return {
      mesh: group,
      shootable: true,
      hitRadius: 1.7,
      kind: 'bubble',
      _goop: goop,
      update(dt, time) {
        goop.update(dt, time);
        // Slow bob toward centerline drama
        group.position.x += Math.sin(time * 0.7 + z) * dt * 0.4;
        group.position.y += Math.cos(time * 0.6 + z) * dt * 0.4;
      },
      collides(pPos, pR) {
        return group.position.distanceTo(pPos) < 1.7 + pR;
      },
    };
  }

  _blastGoop(h) {
    const origin = h.mesh.position.clone();

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 10),
      new THREE.MeshBasicMaterial({
        color: MAGENTA,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, life: 0.16, maxLife: 0.16, kind: 'flash' });

    for (let i = 0; i < 16; i++) {
      const col = [0xff8800, 0xffcc00, LIME, MAGENTA, CYAN][i % 5];
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + Math.random() * 0.16, 6, 6),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 1,
        })
      );
      drop.position.copy(origin);
      this.scene.add(drop);
      this.fx.push({
        mesh: drop,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.6,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 10
        ),
        spin: new THREE.Vector3(0, 0, 0),
        kind: 'shard',
      });
    }

    const splits = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < splits; i++) {
      const gel = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 10),
        new THREE.MeshBasicMaterial({
          color: CYAN,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        })
      );
      gel.position.copy(origin);
      gel.scale.set(1.2, 1.4, 1.0);
      this.scene.add(gel);
      this.fx.push({
        mesh: gel,
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 4
        ),
        spin: new THREE.Vector3(0, 2, 0),
        kind: 'gelSplit',
      });
    }
  }

  _updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.kind === 'flash') {
        const t = Math.max(0, f.life / f.maxLife);
        f.mesh.material.opacity = t;
        f.mesh.scale.setScalar(1 + (1 - t) * 2.4);
      } else if (f.kind === 'shard') {
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.material.opacity = Math.max(0, f.life / f.maxLife);
        f.mesh.material.transparent = true;
      } else if (f.kind === 'gelSplit') {
        f.mesh.position.addScaledVector(f.vel, dt);
        f.vel.multiplyScalar(0.96);
        const t = Math.max(0, f.life / f.maxLife);
        f.mesh.material.opacity = t * 0.85;
        f.mesh.scale.setScalar(0.7 + t * 0.55);
        f.mesh.rotation.y += dt * 2;
      }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this._disposeMesh(f.mesh);
        this.fx.splice(i, 1);
      }
    }
  }

  _destroyHazard(index, onScore, points) {
    const h = this.hazards[index];
    if (!h) return;
    h._goop?.dispose?.();
    this.scene.remove(h.mesh);
    this._disposeMesh(h.mesh);
    this.hazards.splice(index, 1);
    if (onScore) onScore(points);
  }

  _removeAt(index) {
    const h = this.hazards[index];
    h._goop?.dispose?.();
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
      h._goop?.dispose?.();
      this.scene.remove(h.mesh);
      this._disposeMesh(h.mesh);
    }
    this.hazards.length = 0;
    for (const f of this.fx) {
      this.scene.remove(f.mesh);
      this._disposeMesh(f.mesh);
    }
    this.fx.length = 0;
    this.spawnTimer = 0.35;
    this.spawnInterval = SPAWN_INTERVAL_START;
    this.time = 0;
  }
}
