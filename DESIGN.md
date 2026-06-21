# MonkeyCat: Jetpack Mischief — Design

## Story
Two lab escapees bust out of a jungle research complex: a fast, scrappy **cat** and the
clever **monkey** who rides on its back. The cat sprints and leaps; the monkey's long
prehensile **tail** is the duo's grappling tool — it grabs vines and hooks to swing the
pair across pits the cat could never clear alone. (Faithful to the original repo art, which
shows a cat *and* a monkey — two characters, not a fusion.)

## Genre
A side-scrolling **auto-runner platformer** — the most accessible mobile format — with a
signature **tail-swing** traversal mechanic as the hook.

## What makes the format succeed (and how we apply it)
- **One-thumb controls.** Tap = jump, tap again = double jump, hold near an anchor = tail
  swing, release = fling.
- **Forgiveness:** coyote time + jump buffering + variable jump height + capped fall speed.
- **A gentle on-ramp that ramps:** Level 1 trivial; new mechanics introduced one level at a
  time (jump -> double-jump -> overhead hazards -> swings -> combos).
- **Juice:** squash/land, dust, particles, screen shake, snappy SFX.
- **Signature mechanic:** the monkey's tail-swing across gaps.
- **Retention:** coins bank across runs; best distance/level saved.

## Controls
- Tap / click / SPACE / up = Jump (hold longer = higher).
- Tap again in air = Double Jump (monkey flip).
- Hold as you reach a glowing vine = tail grab + swing; release = fling.

## Sources (design research)
- Platformer techniques in endless runners — Ariel Coppes
- Coyote time & jump buffering — Ketra Games / Roblox devforum
- 2D platformer jump feel — Things Made By Dave, Pav Creations, GameMaker (Flynn)
