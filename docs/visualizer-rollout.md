# Visualizer Rollout Plan

## Goal

Adopt the rebuilt `visualizer/` application as Claudia's primary `/brain` explorer without destabilizing the installer, template, or memory-daemon codepaths.

## Scope

This rollout is intentionally narrow:

- `visualizer/` becomes the maintained graph explorer
- `/brain` documentation points at the new explorer
- Legacy visualizer runtime assets are deprecated

This rollout does not:

- rewrite Claudia's SQLite schema
- alter memory-daemon semantics
- change onboarding, templates, or installer behavior outside the visualizer surface

## Why This Replaces Prior Visualizers

The new visualizer is intended to supersede prior graph implementations because it provides:

- a stable entity-first overview
- relationship tracing and evidence reveal
- database switching across local Claudia stores
- richer inspector and search workflows
- live-tunable rendering without changing Claudia core

Older visualizer paths were useful experiments, but should no longer be treated as the preferred `/brain` runtime.

## Deprecation Strategy

### Keep

- Claudia installer
- Claudia template and command system
- Claudia memory daemon
- Existing SQLite-backed memory store

### Deprecate

- legacy browser visualizer runtime assets under `visualizer/public-legacy/`
- older graph runtime paths that are no longer the active `/brain` entrypoint

### Remove later

Only after the new explorer has proven stable in normal desktop usage should legacy assets be removed completely.

## Recommended Merge Posture

Merge this work as a visualizer-focused PR, not as a broad Claudia architecture rewrite.

That keeps review simple:

1. accept the new `/brain` explorer
2. keep legacy visualizer paths deprecated, not default
3. leave core Claudia behavior untouched

## Follow-Up Work

After merge, the highest-value follow-ups are:

1. wire the visualizer more directly into any desktop shell or app tabs
2. add non-WebGL fallback behavior for automated test environments
3. trim legacy dependencies once the new explorer is fully accepted
