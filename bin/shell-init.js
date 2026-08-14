// Shell helper installer for `claudia` command.
//
// Writes three files into ~/.claudia/:
//   - claudia-home      : single-line file with the absolute path to the user's
//                         Claudia install directory (where the selected host launches).
//   - claudia-host      : default runtime (`claude` or `codex`).
//   - shell-init.sh     : defines the `claudia` shell function.
//
// Then idempotently appends a one-line source to ~/.zshrc and ~/.bashrc so the
// function is available in every new shell. The marker comment is used to detect
// existing installs and avoid double-adding.
//
// On Windows we only write the files; rc-file plumbing is a no-op since neither
// zsh nor bash is standard there. The function content is still useful for users
// running WSL or Git Bash who source it manually.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const SHELL_INIT_MARKER = '# Claudia shell helpers';

const RC_SNIPPET = `
${SHELL_INIT_MARKER} (\`claudia\` from anywhere; \`claudia codex|claude|voice\` selects a surface)
[ -f "$HOME/.claudia/shell-init.sh" ] && source "$HOME/.claudia/shell-init.sh"
`;

export const SHELL_INIT_CONTENT = `# Claudia shell helpers — sourced from your shell rc.
# Edit ~/.claudia/claudia-home to change which folder \`claudia\` launches from.

_claudia_home() {
  local home_file="$HOME/.claudia/claudia-home"
  local dir=""
  [ -f "$home_file" ] && dir="$(cat "$home_file" 2>/dev/null)"

  # A relative value (e.g. an older install that stored "claudia") is anchored to
  # $HOME, never the current directory, so \`claudia\` works from anywhere.
  case "$dir" in
    /*) ;;                  # already absolute
    "") ;;                  # empty -> handled by recovery below
    *) dir="$HOME/$dir" ;;  # relative -> resolve under $HOME
  esac

  # Recover from a missing or stale path by falling back to the default install
  # location when it looks like a real Claudia install.
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    if [ -d "$HOME/claudia/.claude" ] || [ -f "$HOME/claudia/CLAUDE.md" ]; then
      dir="$HOME/claudia"
    fi
  fi

  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    echo "Claudia install not found. Run: npx get-claudia ." >&2
    [ -f "$home_file" ] && echo "(or set the correct path in $home_file)" >&2
    return 1
  fi

  # Self-heal: persist the corrected absolute path so the error never recurs.
  if [ "$(cat "$home_file" 2>/dev/null)" != "$dir" ]; then
    mkdir -p "$HOME/.claudia" 2>/dev/null
    printf '%s\\n' "$dir" > "$home_file" 2>/dev/null || true
  fi

  printf '%s' "$dir"
}

_claudia_cd() {
  local dir
  dir="$(_claudia_home)" || return 1
  cd "$dir"
}

_claudia_host() {
  local host_file="$HOME/.claudia/claudia-host"
  local host=""
  [ -f "$host_file" ] && host="$(cat "$host_file" 2>/dev/null)"
  case "$host" in
    codex|claude) printf '%s' "$host" ;;
    *) printf '%s' "claude" ;;
  esac
}

update-claudia() {
  local dir
  local host
  dir="$(_claudia_home)" || return 1
  host="$(_claudia_host)"
  echo "Updating Claudia at $dir ..."
  if [ "$host" = "codex" ]; then
    npx get-claudia codex "$dir"
  else
    npx get-claudia "$dir"
  fi
}

claudia() {
  case "$1" in
    codex)
      shift
      _claudia_cd && codex "$@"
      ;;
    claude)
      shift
      _claudia_cd && claude "$@"
      ;;
    voice)
      shift
      _claudia_cd || return 1
      if command -v open >/dev/null 2>&1; then
        open -a ChatGPT >/dev/null 2>&1 || true
      fi
      echo "Start a new ChatGPT Voice conversation, then say: Start a Codex task in my Claudia workspace and give me my briefing."
      ;;
    yolo)
      shift
      if [ "$(_claudia_host)" = "codex" ]; then
        _claudia_cd && codex --dangerously-bypass-approvals-and-sandbox "$@"
      else
        _claudia_cd && claude --dangerously-skip-permissions "$@"
      fi
      ;;
    update)
      shift
      update-claudia "$@"
      ;;
    setup|system-health|google|doctor|--version|-V|help|--help|-h)
      # Pass known npm-CLI subcommands through to the binary (if installed).
      command claudia "$@"
      ;;
    *)
      if [ "$(_claudia_host)" = "codex" ]; then
        _claudia_cd && codex "$@"
      else
        _claudia_cd && claude "$@"
      fi
      ;;
  esac
}
`;

// Write ~/.claudia/claudia-home, claudia-host, and shell-init.sh.
// Returns their absolute paths for caller logging.
export function writeShellInit(homeDir, claudiaTargetDir, host = 'claude') {
  const claudiaConfigDir = join(homeDir, '.claudia');
  mkdirSync(claudiaConfigDir, { recursive: true });

  const homeFile = join(claudiaConfigDir, 'claudia-home');
  const hostFile = join(claudiaConfigDir, 'claudia-host');
  const initFile = join(claudiaConfigDir, 'shell-init.sh');

  writeFileSync(homeFile, `${claudiaTargetDir}\n`);
  writeFileSync(hostFile, `${host === 'codex' ? 'codex' : 'claude'}\n`);
  writeFileSync(initFile, SHELL_INIT_CONTENT);

  return { homeFile, hostFile, initFile };
}

// Idempotently append the source line to a single rc file. Creates the file if
// it doesn't exist (the source line is harmless on its own). Returns one of:
//   'added'     - the source line was just appended
//   'unchanged' - marker already present, nothing written
function appendToRc(rcPath) {
  let existing = '';
  if (existsSync(rcPath)) {
    existing = readFileSync(rcPath, 'utf8');
    if (existing.includes(SHELL_INIT_MARKER)) {
      return 'unchanged';
    }
  }
  // Ensure separation from prior content
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  writeFileSync(rcPath, existing + sep + RC_SNIPPET);
  return 'added';
}

// Append to the user's zsh and bash rc files. Skips on Windows.
// Returns { added: [...], unchanged: [...] } of rc paths.
export function appendShellRC(homeDir, platform = process.platform) {
  const result = { added: [], unchanged: [], skipped: false };
  if (platform === 'win32') {
    result.skipped = true;
    return result;
  }
  const rcFiles = [join(homeDir, '.zshrc'), join(homeDir, '.bashrc')];
  for (const rc of rcFiles) {
    const status = appendToRc(rc);
    if (status === 'added') result.added.push(rc);
    else result.unchanged.push(rc);
  }
  return result;
}
