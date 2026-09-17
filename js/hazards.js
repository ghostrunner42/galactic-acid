import * as THREE from 'three';
import { TUBE_RADIUS } from './tunnel.js';

/**
 * Hazard identity (locked Hippie Bot):
 * 1. goldAsteroid — warm metallic shootable chunks; blast = sharp gold shards + white flash
 * 2. jellyAlien — soft cyan→violet bioluminescent jelly; DODGE ONLY (shots no-op)
 */

const SPAWN_AHEAD = 90;
const SPAWN_INTERVAL_START = 1.35;
const SPAWN_INTERVAL_MIN = 0.55;

const GOLD = 0xd4a017;
const GOLD_HI = 0xffe08a;
const GOLD_LO = 0x8a5a00;
const AMBER = 0xffb000;
const CYAN = 0x00e5ff;
const VIOLET = 0x8b00ff;

export class HazardManager {
  constructor(scene) {
    this.scene = scene;
    this.hazards = [];
    this.fx = [];
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

    this._updateFx(dt);

    const pPos = player.getPosition();
    const pR = player.getHitRadius();

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.update) h.update(dt, this.time);

      let destroyed = false;
      if (h.shootable && player.alive) {
        for (let li = player.lasers.length - 1; li >= 0; li--) {
          const L = player.lasers[li];
          if (L.mesh.position.distanceTo(h.mesh.position) < h.hitRadius + 0.45) {
            this.scene.remove(L.mesh);
            L.mesh.geometry.dispose();
            L.mesh.material.dispose();
            player.lasers.splice(li, 1);
            this._blastAsteroid(h);
            this._destroyHazard(i, onScore, 25);
            destroyed = true;
            break;
          }
        }
      } else if (!h.shootable && player.alive) {
        // Aliens: shots pass through / no-op — lasers keep flying
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
    // ~55% gold asteroids (shoot), ~45% jelly aliens (dodge) — 2 hazard types
    const h = Math.random() < 0.55 ? this._makeGoldAsteroid(z) : this._makeJellyAlien(z);
    this.hazards.push(h);
    this.scene.add(h.mesh);
  }

  _makeGoldAsteroid(z) {
    const group = new THREE.Group();
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (TUBE_RADIUS - 3.2);
    group.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, z);

    // Chunky irregular metallic silhouette (warm gold/amber — OUTSIDE rim strip)
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.75, 0),
      new THREE.MeshBasicMaterial({ color: GOLD })
    );
    core.scale.set(1.1 + Math.random() * 0.4, 0.85 + Math.random() * 0.5, 1.0 + Math.random() * 0.35);
    group.add(core);

    // Specular highlight facet
    const highlight = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.35, 0),
      new THREE.MeshBasicMaterial({ color: GOLD_HI })
    );
    highlight.position.set(0.35, 0.4, 0.25);
    group.add(highlight);

    // Dark warm undertone chunk
    const chunk = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshBasicMaterial({ color: GOLD_LO })
    );
    chunk.position.set(-0.45, -0.25, -0.2);
    chunk.scale.set(1.2, 0.8, 1);
    group.add(chunk);

    // Amber rim glint
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: AMBER })
    );
    glint.position.set(0.15, 0.55, 0.4);
    group.add(glint);

    const spin = new THREE.Vector3(
      0.8 + Math.random(),
      1.2 + Math.random(),
      0.6 + Math.random()
    );

    return {
      mesh: group,
      shootable: true,
      hitRadius: 0.95,
      kind: 'asteroid',
      update(dt) {
        group.rotation.x += spin.x * dt;
        group.rotation.y += spin.y * dt;
        group.rotation.z += spin.z * dt * 0.5;
      },
      collides(pPos, pR) {
        return group.position.distanceTo(pPos) < 0.95 + pR;
      },
    };
  }

  _makeJellyAlien(z) {
    const group = new THREE.Group();
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (TUBE_RADIUS - 3.5);
    group.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, z);

    // Soft bioluminescent body — cool cyan→violet only
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 10),
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.72,
      })
    );
    body.scale.set(1.1, 1.35, 1.1);
    group.add(body);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 10, 8),
      new THREE.MeshBasicMaterial({
        color: VIOLET,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    group.add(halo);

    // Tentacles
    const tentacles = [];
    for (let t = 0; t < 5; t++) {
      const tent = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.02, 1.1, 5),
        new THREE.MeshBasicMaterial({
          color: t % 2 === 0 ? CYAN : VIOLET,
          transparent: true,
          opacity: 0.75,
        })
      );
      const ta = (t / 5) * Math.PI * 2;
      tent.position.set(Math.cos(ta) * 0.35, -0.85, Math.sin(ta) * 0.35);
      tent.rotation.x = 0.35 + Math.random() * 0.25;
      tent.rotation.z = Math.cos(ta) * 0.4;
      group.add(tent);
      tentacles.push({ mesh: tent, phase: Math.random() * Math.PI * 2, ta });
    }

    // Core pulse
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );
    group.add(core);

    return {
      mesh: group,
      shootable: false, // dodge only — shots pass through
      hitRadius: 0.85,
      kind: 'alien',
      update(dt, time) {
        const u = (Math.sin(time * 2.2) + 1) * 0.5;
        body.material.color.lerpColors(
          new THREE.Color(CYAN),
          new THREE.Color(VIOLET),
          u
        );
        halo.material.color.lerpColors(
          new THREE.Color(VIOLET),
          new THREE.Color(CYAN),
          u
        );
        body.scale.y = 1.25 + Math.sin(time * 3) * 0.15;
        halo.scale.setScalar(1 + Math.sin(time * 2.5) * 0.08);
        core.material.opacity = 0.4 + Math.sin(time * 4) * 0.2;
        for (const t of tentacles) {
          t.mesh.rotation.x = 0.3 + Math.sin(time * 3.5 + t.phase) * 0.35;
          t.mesh.rotation.z = Math.cos(t.ta) * 0.35 + Math.sin(time * 2.8 + t.phase) * 0.25;
          const col = Math.sin(time * 2 + t.phase) > 0 ? CYAN : VIOLET;
          t.mesh.material.color.setHex(col);
        }
        group.rotation.y += dt * 0.6;
      },
      collides(pPos, pR) {
        return group.position.distanceTo(pPos) < 0.85 + pR;
      },
    };
  }

  /** Sharp gold shards + one white-hot flash (not glitter fog). */
  _blastAsteroid(h) {
    const origin = h.mesh.position.clone();

    // White-hot flash — single brief burst
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      })
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, life: 0.12, maxLife: 0.12, kind: 'flash' });

    // Sharp gold shards
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const shard = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.18 + Math.random() * 0.2, 0),
        new THREE.MeshBasicMaterial({
          color: Math.random() > 0.4 ? GOLD_HI : GOLD,
        })
      );
      shard.position.copy(origin);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 10
      );
      this.scene.add(shard);
      this.fx.push({
        mesh: shard,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.6,
        vel,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        kind: 'shard',
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
        f.mesh.scale.setScalar(1 + (1 - t) * 2.2);
      } else if (f.kind === 'shard') {
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        f.mesh.material.opacity = Math.max(0, f.life / f.maxLife);
        f.mesh.material.transparent = true;
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
    for (const f of this.fx) {
      this.scene.remove(f.mesh);
      this._disposeMesh(f.mesh);
    }
    this.fx.length = 0;
    this.spawnTimer = 1.0;
    this.spawnInterval = SPAWN_INTERVAL_START;
    this.time = 0;
  }
}
