// Runtime detection for the zero-argument Claudia installer.
//
// An explicit host subcommand always wins. When the installer is launched by
// an agent, use the agent's session-scoped environment rather than merely
// checking whether a CLI happens to be installed on the machine.

export const SUPPORTED_HOSTS = Object.freeze(['codex', 'claude', 'grok']);

function present(value) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

export function detectRuntimeHost(env = process.env) {
  // Prefer session identifiers. Compatibility layers may expose another
  // vendor's project variables, but they should not normally copy session IDs.
  if (present(env.CODEX_THREAD_ID)) return { host: 'codex', signal: 'CODEX_THREAD_ID' };
  if (present(env.GROK_SESSION_ID)) return { host: 'grok', signal: 'GROK_SESSION_ID' };
  if (present(env.CLAUDE_CODE_SESSION_ID)) return { host: 'claude', signal: 'CLAUDE_CODE_SESSION_ID' };

  // Runtime fallbacks verified in the respective agent environments. Do not
  // use CODEX_HOME, GROK_HOME, or API-key variables: users often export those
  // in ordinary terminals where a bare install must retain the ./claudia default.
  if (present(env.CODEX_SHELL) || present(env.CODEX_CI)) {
    return { host: 'codex', signal: present(env.CODEX_SHELL) ? 'CODEX_SHELL' : 'CODEX_CI' };
  }
  if (present(env.GROK_WORKSPACE_ROOT) || present(env.GROK_AGENT)) {
    return {
      host: 'grok',
      signal: present(env.GROK_WORKSPACE_ROOT) ? 'GROK_WORKSPACE_ROOT' : 'GROK_AGENT',
    };
  }
  if (present(env.CLAUDECODE) || present(env.CLAUDE_CODE_ENTRYPOINT)) {
    return {
      host: 'claude',
      signal: present(env.CLAUDECODE) ? 'CLAUDECODE' : 'CLAUDE_CODE_ENTRYPOINT',
    };
  }

  return { host: null, signal: null };
}

/**
 * Resolve the runtime and destination from positional installer arguments.
 *
 * - Inside Codex, Claude Code, or Grok: bare command targets the open folder.
 * - Outside an agent: bare command preserves the established ./claudia target.
 * - `codex`, `claude`, and `grok` are explicit host overrides.
 */
export function resolveInstallArgs(filteredArgs, env = process.env) {
  const explicitHost = SUPPORTED_HOSTS.includes(filteredArgs[0]) ? filteredArgs[0] : null;
  const detected = detectRuntimeHost(env);
  const host = explicitHost || detected.host || 'claude';
  const installArg = explicitHost ? filteredArgs[1] : filteredArgs[0];
  const runningInsideHost = Boolean(explicitHost || detected.host);

  return {
    host,
    explicitHost,
    detectedHost: detected.host,
    detectionSignal: explicitHost ? 'argument' : detected.signal,
    installArg,
    defaultToCurrentDir: runningInsideHost && installArg === undefined,
  };
}
