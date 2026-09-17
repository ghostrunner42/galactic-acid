# Galactic Acid

Trippy infinite wormhole shooter — Starfox-like rail flight down an endless neon lava-lamp tunnel.

**Art direction:** locked Hippie Bot palette (magenta / cyan / lime / violet rim; warm gold shootables; cool cyan→violet dodge aliens).

**Jam slice:** v0 visual + hazard identity pass.

## Play locally

```bash
cd galactic-acid
npx --yes serve .
# or: python3 -m http.server 8080
```

Open the URL printed by the server (usually `http://localhost:3000` for serve, or `http://localhost:8080` for Python).

ES modules + importmap need a static server (not `file://`).

## Controls

| Input | Action |
|-------|--------|
| **W A S D** or **Arrow keys** | Move ship inside the tube |
| **Space** or **Click / hold** | Fire lasers (also start / restart) |
| Forward | Automatic along the tunnel |

## What’s in this slice

- Endless recycled tunnel with **neon lava-lamp blob** walls (locked 4-color rim)
- Rail flight (auto-forward; free L/R/U/D inside the tube)
- 2 hazards: **gold asteroids** (shoot — shards + white flash) · **jelly aliens** (dodge only; shots pass through)
- Score from survival + asteroid kills; crash → game over → Space/click restart
- Neon HUD + depth fog; geometric ship (no external assets)

## Parked (not in v0)

Story, multiplayer, crafting, bosses, inventory.

## Stack

- Three.js **r160** via CDN importmap (unpkg)
- Plain static HTML/CSS/JS — no bundler

## Repo

https://github.com/ghostrunner42/galactic-acid

## Tunnel rim (Hippie Bot tiles)
- `assets/tunnel/seamless-a.png` — primary lava skin
- `assets/tunnel/seamless-b.png` — diagonal mix-in
- `assets/tunnel/variants-4x4.png` — procedural sprinkle
Continuous cylinder + UV scroll; tile remix ~¼ scroll feel.

## Tunnel rim (locked)
- `assets/tunnel/rim-locked.png` — user-locked lava-blob pixel map (primary skin)
- Continuous cylinder + UV scroll; nearest-neighbor filter

## Ship credit
Player craft: **[ricks ufo](https://poly.pizza/m/q6vNUoHZXr)** by [eeee](https://poly.pizza) — **CC-BY** (attribution required).



Goop hazard: GPU raymarched SDF metaballs (`js/goopMetaball.js`).
Lava seams: large raymarched metaball banks (`js/goopMetaball.js`) — weave gaps, shoot to pinch.


## Hazards (lava-only)
- **Seams** — large drifting wall banks; weave the corridor
- **Bubbles** — big burstable path blobs; shoot or crash
Gold asteroids and jelly aliens removed for jam focus.
