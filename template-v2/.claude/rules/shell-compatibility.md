# Shell Compatibility

When writing bash commands via the Bash tool, follow these rules to avoid platform-specific failures.

---

## Reserved Variable Names (Never Use)

These variables are read-only or reserved in zsh (macOS default shell):

| Avoid | Use Instead | Why |
|-------|-------------|-----|
| `status` | `result`, `exit_status`, `item_status` | zsh read-only (`$?` alias) |
| `path` | `file_path`, `target_path` | Can conflict with `$PATH` on case-insensitive filesystems |
| `prompt` | `user_prompt`, `input_prompt` | zsh reserved for prompt formatting |
| `precmd` | `pre_command` | zsh hook function |
| `RANDOM` | `rand_val` | Overwriting changes behavior |

## Safe Patterns

- **Command substitution:** `$(command)` not `` `command` ``
- **Quote all paths:** `"$file"` not `$file` (spaces in paths are common on macOS)
- **Conditionals:** `[[ ]]` not `[ ]` (more robust, supports regex)
- **File loops:** `for f in folder/*.md; do ... done`
- **Counting files:** `grep -rl "pattern" folder/ | wc -l` (not for-loop with counter)

## When Parallel Commands Fail

If multiple parallel Bash tool calls fail with "sibling tool call errored":
1. The error means one command failed and the others were **never attempted**
2. Re-run each failed command individually
3. Only the command with the actual error message is the one that truly failed
