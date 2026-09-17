import * as THREE from 'three';
import { Tunnel } from './tunnel.js';
import { Player } from './player.js';
import { HazardManager } from './hazards.js';

const scoreEl = document.getElementById('score');
const hintEl = document.getElementById('hint');
const overlay = document.getElementById('overlay');
const title = document.getElementById('title');
const finalScoreEl = document.getElementById('final-score');

let state = 'title'; // title | playing | dead
let score = 0;
let survivalAcc = 0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0018, 0.026);
scene.background = new THREE.Color(0x050010);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const tunnel = new Tunnel(scene);
const player = new Player(scene);
const hazards = new HazardManager(scene);

// Soft ambient points for vibe (BasicMaterial doesn't need lights, but keeps fog vibe)
const stars = new THREE.Points(
  (() => {
    const g = new THREE.BufferGeometry();
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 2] = -Math.random() * 300;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  })(),
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 })
);
scene.add(stars);

function setScore(v) {
  score = Math.max(0, Math.floor(v));
  scoreEl.textContent = `SCORE: ${score}`;
}

function addScore(pts) {
  setScore(score + pts);
}

function startGame() {
  state = 'playing';
  title.classList.add('hidden');
  overlay.classList.add('hidden');
  hintEl.style.opacity = '1';
  setTimeout(() => { if (state === 'playing') hintEl.style.opacity = '0.35'; }, 4000);
  tunnel.reset();
  player.reset();
  hazards.reset();
  setScore(0);
  survivalAcc = 0;
  camera.position.set(0, 0, 6);
}

function gameOver() {
  state = 'dead';
  player.alive = false;
  finalScoreEl.textContent = `Score: ${score}`;
  overlay.classList.remove('hidden');
}

function tryStartOrRestart(e) {
  if (e && e.code && e.code !== 'Space' && e.type === 'keydown') return;
  if (e && e.code === 'Space') e.preventDefault();
  if (state === 'title' || state === 'dead') startGame();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') tryStartOrRestart(e);
});
window.addEventListener('pointerdown', (e) => {
  if (state === 'title' || state === 'dead') {
    tryStartOrRestart(e);
  } else if (state === 'playing') {
    player.setMouseFire(true);
  }
});
window.addEventListener('pointerup', () => player.setMouseFire(false));
window.addEventListener('pointerleave', () => player.setMouseFire(false));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'playing') {
    player.update(dt);
    tunnel.update(dt, player.z);

    // Survival score
    survivalAcc += dt * 10;
    if (survivalAcc >= 1) {
      addScore(Math.floor(survivalAcc));
      survivalAcc %= 1;
    }

    const hit = hazards.update(dt, player.z, player, addScore);
    if (hit === 'hit') gameOver();

    // Camera follows ship slightly
    camera.position.x += (player.offset.x * 0.35 - camera.position.x) * 0.08;
    camera.position.y += (player.offset.y * 0.35 - camera.position.y) * 0.08;
    camera.position.z = player.z + 7;
    camera.lookAt(player.offset.x * 0.2, player.offset.y * 0.2, player.z - 20);

    stars.position.z = player.z;
  } else if (state === 'title') {
    tunnel.update(dt * 0.5, -1);
    camera.position.z -= dt * 4;
    if (camera.position.z < -200) camera.position.z = 6;
    camera.lookAt(0, 0, camera.position.z - 30);
  } else {
    // dead — slow drift
    tunnel.update(dt * 0.3, player.z);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
