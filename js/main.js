import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
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
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

// Quest 3 browser: Enter VR (HTTPS Pages / secure context)
const vrBtn = VRButton.createButton(renderer);
vrBtn.id = 'VRButton';
document.body.appendChild(vrBtn);

/**
 * XR dolly: headset owns camera local pose; we only slide the dolly down the tube.
 * Third-person: sit a few meters behind the UFO so lava blobs stay readable.
 */
const xrDolly = new THREE.Group();
scene.add(xrDolly);
xrDolly.add(camera);

const tunnel = new Tunnel(scene);
const player = new Player(scene);
const hazards = new HazardManager(scene);

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

// World-space score for immersive VR (HTML HUD is invisible in XR)
const scoreCanvas = document.createElement('canvas');
scoreCanvas.width = 512;
scoreCanvas.height = 128;
const scoreCtx = scoreCanvas.getContext('2d');
const scoreTex = new THREE.CanvasTexture(scoreCanvas);
const scoreMat = new THREE.MeshBasicMaterial({
  map: scoreTex,
  transparent: true,
  depthTest: false,
  depthWrite: false,
});
const scoreMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), scoreMat);
scoreMesh.position.set(0, 1.15, -2.2);
scoreMesh.frustumCulled = false;
xrDolly.add(scoreMesh);
scoreMesh.visible = false;

function paintScorePlate() {
  const ctx = scoreCtx;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(5,0,16,0.55)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = 'bold 56px Segoe UI, system-ui, sans-serif';
  ctx.fillStyle = '#C8FF00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let line = `SCORE: ${score}`;
  if (state === 'title') line = 'GALACTIC ACID — pull trigger';
  if (state === 'dead') line = `DOWN — ${score} · trigger retry`;
  ctx.fillText(line, 256, 64);
  scoreTex.needsUpdate = true;
}

function setScore(v) {
  score = Math.max(0, Math.floor(v));
  scoreEl.textContent = `SCORE: ${score}`;
  paintScorePlate();
}

function addScore(pts) {
  setScore(score + pts);
}

function startGame() {
  state = 'playing';
  title.classList.add('hidden');
  overlay.classList.add('hidden');
  hintEl.style.opacity = '1';
  setTimeout(() => {
    if (state === 'playing') hintEl.style.opacity = '0.35';
  }, 4000);
  tunnel.reset();
  player.reset();
  hazards.reset();
  setScore(0);
  survivalAcc = 0;
  if (!renderer.xr.isPresenting) {
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    xrDolly.position.set(0, 0, 6);
    xrDolly.rotation.set(0, 0, 0);
  }
  paintScorePlate();
}

function gameOver() {
  state = 'dead';
  player.alive = false;
  finalScoreEl.textContent = `Score: ${score}`;
  // Keep HTML overlay for desktop; VR uses score plate + trigger
  if (!renderer.xr.isPresenting) overlay.classList.remove('hidden');
  paintScorePlate();
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

renderer.xr.addEventListener('sessionstart', () => {
  scoreMesh.visible = true;
  // Hide flat overlays — unreadable in headset
  title.classList.add('hidden');
  overlay.classList.add('hidden');
  paintScorePlate();
});
renderer.xr.addEventListener('sessionend', () => {
  scoreMesh.visible = false;
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  if (state === 'title') title.classList.remove('hidden');
  if (state === 'dead') overlay.classList.remove('hidden');
  player.setXRInput(0, 0, false);
});

/** Poll Quest / WebXR gamepads: stick weave + trigger fire / start */
function pollXRInput() {
  if (!renderer.xr.isPresenting) {
    player.setXRInput(0, 0, false);
    return;
  }
  const session = renderer.xr.getSession();
  if (!session) return;

  let ax = 0;
  let ay = 0;
  let fire = false;
  let select = false;

  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    // Quest: axes 2/3 = thumbstick on many profiles; 0/1 = trackpad/stick fallback
    if (gp.axes && gp.axes.length >= 2) {
      const x = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
      const y = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
      if (Math.abs(x) > Math.abs(ax)) ax = x;
      // WebXR stick Y: up is often negative — flip so up weaves up
      const yN = -y;
      if (Math.abs(yN) > Math.abs(ay)) ay = yN;
    }
    if (gp.buttons) {
      // 0 = trigger, 1 = squeeze
      if (gp.buttons[0]?.pressed || gp.buttons[0]?.value > 0.35) fire = true;
      if (gp.buttons[1]?.pressed) fire = true;
      if (gp.buttons[4]?.pressed || gp.buttons[5]?.pressed) select = true;
    }
  }

  const dead = 0.15;
  if (Math.abs(ax) < dead) ax = 0;
  if (Math.abs(ay) < dead) ay = 0;

  player.setXRInput(ax, ay, fire && state === 'playing');

  // Trigger / A on title or death → start
  if ((fire || select) && (state === 'title' || state === 'dead')) {
    startGame();
  }
}


let last = performance.now();
paintScorePlate();

renderer.setAnimationLoop((now) => {
  if (now === undefined) now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  pollXRInput();
  const inXR = renderer.xr.isPresenting;
  scoreMesh.visible = inXR;

  if (state === 'playing') {
    player.update(dt);
    tunnel.update(dt, player.z);

    survivalAcc += dt * 10;
    if (survivalAcc >= 1) {
      addScore(Math.floor(survivalAcc));
      survivalAcc %= 1;
    }

    const hit = hazards.update(dt, player.z, player, addScore);
    if (hit === 'hit') gameOver();

    stars.position.z = player.z;

    if (inXR) {
      // Dolly behind ship; headset looks freely. Face down-tunnel by default (-Z).
      xrDolly.position.set(
        player.offset.x * 0.25,
        player.offset.y * 0.25 + 0.35,
        player.z + 4.5
      );
      xrDolly.rotation.set(0, 0, 0);
    } else {
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      xrDolly.position.x += (player.offset.x * 0.35 - xrDolly.position.x) * 0.08;
      xrDolly.position.y += (player.offset.y * 0.35 - xrDolly.position.y) * 0.08;
      xrDolly.position.z = player.z + 7;
      xrDolly.lookAt(player.offset.x * 0.2, player.offset.y * 0.2, player.z - 20);
    }
  } else if (state === 'title') {
    tunnel.update(dt * 0.5, -1);
    if (!inXR) {
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      xrDolly.position.z -= dt * 4;
      if (xrDolly.position.z < -200) xrDolly.position.z = 6;
      xrDolly.lookAt(0, 0, xrDolly.position.z - 30);
    } else {
      xrDolly.position.z -= dt * 4;
      if (xrDolly.position.z < -200) xrDolly.position.z = 6;
      xrDolly.rotation.set(0, 0, 0);
    }
  } else {
    tunnel.update(dt * 0.3, player.z);
    if (inXR) {
      xrDolly.position.set(
        player.offset.x * 0.25,
        player.offset.y * 0.25 + 0.35,
        player.z + 4.5
      );
      xrDolly.rotation.set(0, 0, 0);
    }
  }

  renderer.render(scene, camera);
});
