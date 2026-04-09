# fork/ — placeholder for the Claudia Autonomous submodule

This directory is a **placeholder**. It will become a git submodule pointing at `kbanc85/claudia-autonomous` once that repo exists.

## Why a placeholder instead of just creating the submodule now

Phase 0 Task 0.1 is the task that **creates** the `kbanc85/claudia-autonomous` repo (by cloning Hermes, stripping its git history, and initialising fresh). You can't `git submodule add` a URL that doesn't exist yet. So the directory starts as a placeholder and gets converted to a real submodule mid-Phase 0.

## Conversion procedure

Run these from the repo root (this claudia repo, not the fork), **after** `kbanc85/claudia-autonomous` has been created on GitHub and the initial Phase 0.1 push has landed:

```bash
# 1. Remove the placeholder directory
rm -rf autonomous/fork

# 2. Add the submodule at the same path
git submodule add https://github.com/kbanc85/claudia-autonomous.git autonomous/fork

# 3. Commit the submodule addition
git commit -m "autonomous: attach claudia-autonomous fork as submodule"
```

After that, `autonomous/fork/` is a proper submodule pinned to a specific commit of `kbanc85/claudia-autonomous`.

## Working with the submodule once it's attached

- To update the pinned commit after pushing work to the fork:
  ```bash
  cd autonomous/fork
  git pull
  cd ../..
  git add autonomous/fork
  git commit -m "autonomous: advance fork submodule to <short sha>"
  ```

- To clone this claudia repo on a new machine and get the fork at the same time:
  ```bash
  git clone --recurse-submodules <this-repo-url>
  ```

- If someone clones without `--recurse-submodules`:
  ```bash
  git submodule update --init --recursive
  ```

## What not to do

- **Do not** edit the fork directly from this repo and expect the submodule pointer to track it. Submodules record a specific commit sha. You push commits inside the fork, then update the pointer in the outer repo.
- **Do not** replace the submodule with a symlink or a bind mount. The whole point is that the fork has its own git history.
- **Do not** `git rm -rf autonomous/fork` without also removing the entry from `.gitmodules` and `.git/config`. Use `git submodule deinit` first if you ever need to detach.

## Until the fork exists

All Phase 0 preparation work (reading the phase file, writing the fork-vs-wrapper ADR, expanding the rebrand map) happens in the tracking hub. No code work happens until the fork repo exists and the submodule is attached.
