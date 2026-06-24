# Proposal 06: Off-site backup with pluggable destinations

**Status**: Proposal · **Effort**: ~1 week · **Batch**: Operations (ship with #01)

## TL;DR

Add an off-site sync step that runs after the existing `daily_backup` and `weekly_backup` jobs. Destinations are pluggable: rclone (70+ providers), iCloud Drive (Mac), encrypted git push, SSH/rsync. Today the daemon backs up locally to `~/.claudia/backups/` but never leaves the disk. One disk failure or accidental delete and everything is gone.

## The problem

The daemon already does local snapshots reliably (when it's the right version). What's missing is the second copy: somewhere off the device. For a memory system that's effectively a personal knowledge graph, this matters more than it does for a project file.

## The fix

Add a new service `services/offsite_backup.py` that runs after each successful backup. Pluggable destination via a small adapter interface:

```python
class OffsiteBackend(ABC):
    def is_available(self) -> bool: ...
    def sync(self, src_path: Path) -> None: ...
```

Built-in adapters:

| Adapter | What it does | Notes |
|---|---|---|
| `rclone` | Shells out to user's configured rclone remote | Handles B2, S3, Drive, Dropbox, Backblaze, etc. |
| `icloud_drive` | `cp` to `~/Library/Mobile Documents/com~apple~CloudDocs/Claudia/` | macOS only |
| `git_push` | Encrypted bundle via `age`, push to a private GitHub repo | Small DBs only, ≤100MB |
| `ssh` | `rsync` over SSH to a user-supplied host | For self-hosters |

Config:

```json
{
  "offsite_backup": {
    "destination": "rclone:b2:my-claudia-bucket",
    "encrypt": true,
    "retention_days": 90
  }
}
```

Encryption: optional age recipient configured at install time. Off-site copies are encrypted; local copies are not (the daemon already protects them via filesystem permissions).

## Surface area

```
memory-daemon/claudia_memory/services/
  ├── offsite_backup.py                # NEW: adapter router
  └── offsite_backends/                # NEW
      ├── base.py
      ├── rclone.py
      ├── icloud_drive.py
      ├── git_push.py
      └── ssh.py
memory-daemon/claudia_memory/daemon/scheduler.py  # hook offsite_backup into _run_daily_backup
memory-daemon/claudia_memory/config.py            # offsite_backup config section
docs/offsite-backup.md
```

The hook into the scheduler is non-blocking: off-site sync failure logs an error and surfaces in `claudia daemon status`, but does not invalidate the local backup.

## Why elegant

- The user picks the provider; the daemon doesn't care
- Each adapter is a small file (~50 lines)
- Failure isolation: off-site sync failure doesn't fail the local backup
- Encryption is opt-in but recommended; the daemon doesn't store any plaintext key
- Cost is effectively zero for the median user (a 50MB DB on B2 is $0.0003/month)

## Testing plan

- Adapter unit tests: mock the underlying client, verify the sync call is made with the right path
- Integration on macOS: configure `icloud_drive` adapter, run `claudia memory backup --offsite`, verify file appears in iCloud
- Integration on Linux: configure rclone-to-B2, same drill
- Encryption: verify encrypted bundle can be decrypted with the configured age key, then opened in sqlite3

## Open questions

- **Encryption key management**: where does the age key live? Suggest `~/.claudia/secrets/age.key` with mode 600, surface in `claudia daemon status`. Or use the OS keychain (Keychain on macOS, libsecret on Linux, Credential Manager on Windows)?
- **Retention on the remote**: rclone has flags for this, but cross-provider retention is hard. Leave to the user's provider config for v1; revisit if users ask.
- Should `claudia daemon install` (Proposal #01) prompt for an off-site destination at install time? Probably yes, with "configure later" as a valid choice.

## Related

- Pairs with Proposal #01 (cross-platform daemon service installer) as the Operations release.
- Independent of all other proposals — can ship standalone if #01 is delayed.

## References

- [rclone backends](https://rclone.org/overview/)
- [age encryption](https://age-encryption.org/)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) (≈$0.006/GB/month)
