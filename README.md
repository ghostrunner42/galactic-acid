# Galactic Acid

Trippy infinite wormhole shooter — Starfox-like rail flight down an endless neon tunnel.

**Jam slice:** v0 for eng bot Rex.

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

- Endless procedural/recycled tunnel with pulsing psychedelic wall colors
- Rail flight (auto-forward; free L/R/U/D inside the tube)
- 3 hazard types: **ring gates** (dodge the gap), **spike orbs** (shootable), **spinners** (dodge the bar)
- Score from survival + orb kills; crash → game over → Space/click restart
- Neon HUD + depth fog; geometric ship (no external assets)

## Parked (not in v0)

Story, multiplayer, crafting, bosses, inventory.

## Stack

- Three.js **r160** via CDN importmap (unpkg)
- Plain static HTML/CSS/JS — no bundler

## Repo

https://github.com/ghostrunner42/galactic-acid
