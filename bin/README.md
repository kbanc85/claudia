# bin/

The npm installer for `get-claudia`. Zero runtime dependencies. Pure ESM. Plain Node.

## Entry point

`bin/index.js` is the binary registered in `package.json#bin`. It is a thin shim: parse `process.argv`, call `main()` from `installer.js`, surface errors. Everything else lives in focused modules.

## Modules

| File | Responsibility |
|------|----------------|
| `index.js` | CLI entry. Shebang, import `main`, catch errors. |
| `installer.js` | Orchestrator. `main()` reads args, decides fresh-install vs. upgrade, copies the template, runs the 5-step progress flow, prints completion. Also holds the self-update version check. |
| `lib.js` | Shared utilities: the `colors` map (with NO_COLOR / non-TTY disable), `getVersion()`, `getMemoryDaemonSrc()`, environment constants (`isWindows`, `isTTY`, `powershellPath`). Every other module imports from here. |
| `prompt.js` | Interactive helpers: `confirm()` for y/n, `promptKey()` for single-character menus, `prompt()` for free text. All wrap `readline`. |
| `renderer.js` | The `ProgressRenderer` class plus `getBanner()` and `getWaveFrame()`. Owns the 5-step in-place rendering, fallback streaming for non-TTY, and the animated banner art. |
| `template-copy.js` | Conflict resolution for upgrades: `handleSkillConflicts()` compares the user's locally-modified shipped files against the new template via the manifest, prompts per-file, and writes `.bak` siblings. `showDiff()` is the unified-diff helper for the prompt. |
| `ollama.js` | Ollama lifecycle: detect, install, start, ensure API key, restart. |
| `python-env.js` | Python detection (`python3` first, then `python`) and install nudge. |
| `mcp-config.js` | `.mcp.json` writers and recoverers: register the daemon, add Google entries, scan existing databases, restore servers older versions wrongly disabled. |
| `launch-agent.js` | macOS launchd integration: write `~/Library/LaunchAgents/club.aiadopters.claudia-memory.plist` so the daemon starts at login. |
| `visualizer.js` | Copy the brain visualizer into `~/.claudia/visualizer/` so users can run the local 3D memory view. |
| `changelog.js` | `extractChangelog(version)` pulls the matching version's body out of the project root `CHANGELOG.md`. `writeWhatsNewFile()` drops that text into the user's `context/whats-new.md` so Claudia mentions the upgrade on next session. |
| `manifest-lib.js` | Manifest generation and conflict-detection primitives shared by upgrade and `npm run generate-manifest`. Already existed before this refactor. |
| `google-setup.js` | The standalone `npx get-claudia google` flow. Already existed before this refactor. |

## The install pipeline

A fresh install walks this path (start at `installer.js#main`):

```
parse argv
  ├─ google subcommand?           → google-setup.js handles end-to-end, exit
  └─ default (install or upgrade)
       confirm() prompt (prompt.js)
       extract template → target
         fresh:  cpSync(template-v2/ → targetPath)
         upgrade: handleSkillConflicts (template-copy.js) → cpSync with skip set
       writeWhatsNewFile (changelog.js)
       installVisualizer (visualizer.js)
       skipMemory?
         yes → runVaultStep, showCompletion, exit
         no  → 5-step ProgressRenderer (renderer.js):
              1. Environment       ← detect Node, isOllamaInstalled, isPythonInstalled
              2. AI Models         ← installPython (python-env.js) if needed,
                                     installOllama / startOllama / ensureOllamaKey (ollama.js)
              3. Memory System     ← create venv, pip install daemon
              4. Memory Daemon     ← ensureDaemonMcpConfig (mcp-config.js),
                                     ensureLaunchAgent (launch-agent.js)
              5. Health Check      ← probe localhost:3848/health
              vault step           ← always runs
              showCompletion
```

The upgrade path uses `frameworkPaths` to copy only the shipped subset of the template, leaving user data alone, with manifest-driven conflict resolution.

## Tests

`test/integration.test.js` exercises the upgrade conflict-detection wiring. `test/manifest.test.js` covers manifest generation and resolution. Both run via `npm test` (Node's built-in `node --test`).

## Editing tips

- The `colors` object is mutated in place during init (when NO_COLOR is set or stdout is not a TTY). All consumers import the same object reference. Do not re-export it from intermediate modules; that defeats the mutation.
- `installer.js` holds argv parsing because fragmenting it across modules makes the install flow hard to follow.
- New install phases should add a step to `STEPS` and `SUBTITLES` in `renderer.js`, then call the renderer from `installer.js`. Keep the side-effecting logic (pip, fetch, mkdir) in a domain module (`ollama.js`, etc.), not in `installer.js`.
