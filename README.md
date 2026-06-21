# MonkeyCat: Jetpack Mischief

A free, browser-based endless runner. A lab-spliced cat-monkey hybrid grabs a prototype
jetpack and bolts out of a jungle research complex — hold to fly, dodge the zappers and
lasers, and hoard every banana-coin you can.

**Play:** open `index.html` in any modern browser, or visit the deployed URL.

This is a complete, public-ready HTML5 web game rebuilt from the archived Unity 6 prototype
[`kingbirdchris/v2_MonkeyCat`](https://github.com/kingbirdchris/v2_MonkeyCat). The original
shipped only C# scripts and concept art; this version is fully playable.

## How to play
- **Hold** anywhere (touch), **click & hold** the mouse, or hold **SPACE / up-arrow** to fire the jetpack and rise. Release to fall.
- Collect **banana-coins** for score and missions.
- Avoid **zappers**, **laser gates**, and incoming **missiles** — one hit ends the run.
- Grab power-ups: **Shield** (absorbs one hit), **Magnet** (pulls coins in), **Overcharge** (briefly unstoppable + faster).
- Complete rotating **missions** for big coin bonuses. Difficulty ramps the further you fly.
- **P** pauses.

## Features
- Faithful physics ported from the Unity controller (hold-to-thrust, gravity/thrust balance, velocity clamps, 0.12s input buffer).
- Adaptive difficulty ramp tied to time + distance.
- Slow-motion death + screen shake, particle FX.
- Procedural multi-layer parallax jungle-lab background.
- Procedural WebAudio music + sound effects (no external files).
- Best-distance, total-coins, and missions-completed saved locally.
- Responsive: desktop + mobile/touch, fullscreen letterboxed canvas.

## Tech
Single-page, dependency-free: `index.html` + `game.js` + custom SVG art in `assets/`.
Nothing to build — it's static. Deploy anywhere that serves static files.

## Credits
Built by Kingbird Solutions. Characters, story, and tuning derived from the MonkeyCat prototype.
